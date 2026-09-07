/**
 * Packages & Reels Production Pipeline Module Unit Tests (Milestone M4)
 * Covers:
 * - Package templates catalog (Package A, B, C) with integer minutes & discrete reels.
 * - Client package purchase with immutable terms snapshot.
 * - MANDATORY Package C Scenario: 10h (600 min) + 3 reels for 4,000 EGP (400,000 piasters).
 * - Decoupled Independence Invariant: Financial balance vs. Service balance.
 * - Consumption calculation, low balance alerts, over-consumption protection.
 * - 5-stage Reels pipeline Kanban state machine (planned -> filmed -> editing -> review -> delivered).
 * - Automatic package reel quota decrement upon delivery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  ClientRepository,
  PackageRepository,
  PaymentRepository,
} from '../../../src/database/repositories';
import {
  fetchPackageTemplates,
  savePackageTemplate,
  sellPackageToClient,
  fetchClientPackages,
  ensureDefaultPackageTemplates,
} from '../../../src/modules/packages/package-service';
import {
  fetchReels,
  saveReel,
  updateReelStage,
  getNextReelStage,
  getPreviousReelStage,
  normalizeReelStage,
} from '../../../src/modules/reels/reels-service';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Packages & Reels Production Pipeline Unit Tests (M4)', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let packageRepo: PackageRepository;
  let paymentRepo: PaymentRepository;
  let clientId: string;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    packageRepo = new PackageRepository(driver);
    paymentRepo = new PaymentRepository(driver);

    const client = await clientRepo.create({
      name: 'كريم محمود',
      companyName: 'كريتورز هاب',
      phone: '01234567890',
    });
    clientId = client.id;
  });

  afterEach(async () => {
    await driver.close();
  });

  describe('Package Catalog & Templates', () => {
    it('seeds and retrieves default standard templates (Package A, B, C)', async () => {
      await ensureDefaultPackageTemplates(driver);

      const templates = await fetchPackageTemplates(driver);
      expect(templates.length).toBeGreaterThanOrEqual(3);

      const pkgA = templates.find((t) => t.name.includes('باقة أ'));
      const pkgB = templates.find((t) => t.name.includes('باقة ب'));
      const pkgC = templates.find((t) => t.name.includes('باقة ج'));

      expect(pkgA).toBeDefined();
      expect(pkgA?.hoursMinutes).toBe(300); // 5h = 300 min
      expect(pkgA?.default_price).toBe(150000); // 1,500 EGP

      expect(pkgB).toBeDefined();
      expect(pkgB?.hoursMinutes).toBe(600); // 10h = 600 min
      expect(pkgB?.default_price).toBe(280000); // 2,800 EGP

      expect(pkgC).toBeDefined();
      expect(pkgC?.hoursMinutes).toBe(600); // 10h = 600 min
      expect(pkgC?.reelsCount).toBe(3); // 3 reels
      expect(pkgC?.default_price).toBe(400000); // 4,000 EGP = 400,000 piasters
    });

    it('creates and updates a custom package template in the catalog', async () => {
      const templateId = await savePackageTemplate(driver, {
        name: 'باقة مخصصة للبودكاست',
        defaultPricePiasters: 300000,
        hoursMinutes: 480, // 8 hours = 480 minutes
        reelsCount: 4,
        active: 1,
      });

      expect(templateId).toBeDefined();

      const templates = await fetchPackageTemplates(driver);
      const saved = templates.find((t) => t.id === templateId);
      expect(saved?.name).toBe('باقة مخصصة للبودكاست');
      expect(saved?.hoursMinutes).toBe(480);
      expect(saved?.reelsCount).toBe(4);
      expect(saved?.default_price).toBe(300000);
    });

    it('rejects template with non-integer minutes or negative prices', async () => {
      await expect(
        savePackageTemplate(driver, {
          name: 'باقة خاطئة',
          defaultPricePiasters: -100,
          hoursMinutes: 60,
          reelsCount: 1,
        })
      ).rejects.toThrow(DomainInvariantError);

      await expect(
        savePackageTemplate(driver, {
          name: 'باقة بدون رصيد',
          defaultPricePiasters: 100000,
          hoursMinutes: 0,
          reelsCount: 0,
        })
      ).rejects.toThrow(DomainInvariantError);
    });
  });

  describe('Client Package Purchase & Discrete Reel Provisioning', () => {
    it('sells package to client and provisions discrete reel items in pipeline', async () => {
      const soldPkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة استوديو 5 ساعات + 2 ريلز',
        soldPricePiasters: 220000, // 2,200 EGP
        purchasedAt: '2026-09-01',
        hoursMinutes: 300,
        reelsCount: 2,
        notes: 'خصم افتتاحي 10%',
      });

      expect(soldPkg.id).toBeDefined();
      expect(soldPkg.name_snapshot).toBe('باقة استوديو 5 ساعات + 2 ريلز');
      expect(soldPkg.sold_price).toBe(220000);
      expect(soldPkg.items).toHaveLength(2);

      // Verify discrete reel items were provisioned in reel_items table
      const reels = await fetchReels(driver, clientId);
      expect(reels).toHaveLength(2);
      expect(reels[0].client_package_id).toBe(soldPkg.id);
      expect(reels[0].stage).toBe('planned');
    });
  });

  describe('MANDATORY Scenario: Package C (10h + 3 reels for 4,000 EGP)', () => {
    it('executes full Package C lifecycle with strict decoupling of financial vs service balance', async () => {
      // 1. Sell Package C (10 hours = 600 min, 3 reels, 4,000 EGP = 400,000 piasters)
      const soldPkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة ج (كريتور): 10 ساعات استوديو + 3 ريلز',
        soldPricePiasters: 400000, // 400,000 piasters
        purchasedAt: '2026-09-01',
        hoursMinutes: 600, // 10 hours = 600 minutes
        reelsCount: 3, // 3 reels
        notes: 'سيناريو باقة ج المعتمد في كراسة الشروط',
      });

      // 2. Initial state verification
      let clientPackages = await fetchClientPackages(driver, clientId);
      let pkg = clientPackages.find((p) => p.id === soldPkg.id)!;
      expect(pkg.sold_price).toBe(400000);
      expect(pkg.hoursPurchasedMinutes).toBe(600);
      expect(pkg.hoursUsedMinutes).toBe(0);
      expect(pkg.hoursRemainingMinutes).toBe(600);
      expect(pkg.reelsPurchased).toBe(3);
      expect(pkg.reelsUsed).toBe(0);
      expect(pkg.reelsRemaining).toBe(3);
      expect(pkg.status).toBe('not_started');
      expect(pkg.paidAmountPiasters).toBe(0);

      // 3. Record full payment for the package
      await paymentRepo.recordPayment({
        clientId,
        amount: 400000,
        method: 'vodafone_cash',
        date: '2026-09-02',
        targets: [
          {
            targetType: 'client_package',
            targetId: soldPkg.id,
            duePiasters: 400000,
            requestedPiasters: 400000,
          },
        ],
      });

      // Verify financial balance updated
      clientPackages = await fetchClientPackages(driver, clientId);
      pkg = clientPackages.find((p) => p.id === soldPkg.id)!;
      expect(pkg.paidAmountPiasters).toBe(400000);
      // Service balance remains completely untouched by payment!
      expect(pkg.hoursRemainingMinutes).toBe(600);
      expect(pkg.reelsRemaining).toBe(3);

      // 4. Consume 4.5 hours of studio time (4.5 * 60 = 270 minutes)
      await packageRepo.consumePackageItem(soldPkg.id, 'hours', 270);

      clientPackages = await fetchClientPackages(driver, clientId);
      pkg = clientPackages.find((p) => p.id === soldPkg.id)!;
      expect(pkg.hoursUsedMinutes).toBe(270);
      expect(pkg.hoursRemainingMinutes).toBe(330); // 600 - 270 = 330 minutes (5.5 hours remaining)
      expect(pkg.status).toBe('active');
      // Reels balance remains completely untouched by hours consumption!
      expect(pkg.reelsUsed).toBe(0);
      expect(pkg.reelsRemaining).toBe(3);
      // Financial balance remains completely untouched!
      expect(pkg.paidAmountPiasters).toBe(400000);

      // 5. Consume 1 reel from the package
      await packageRepo.consumePackageItem(soldPkg.id, 'reels', 1);

      clientPackages = await fetchClientPackages(driver, clientId);
      pkg = clientPackages.find((p) => p.id === soldPkg.id)!;
      expect(pkg.reelsUsed).toBe(1);
      expect(pkg.reelsRemaining).toBe(2); // 3 - 1 = 2 reels remaining
      // Hours balance remains completely untouched by reel consumption!
      expect(pkg.hoursRemainingMinutes).toBe(330);
      expect(pkg.hoursUsedMinutes).toBe(270);
      // Financial balance remains untouched!
      expect(pkg.paidAmountPiasters).toBe(400000);
    });

    it('rejects over-consumption beyond available hours or reels', async () => {
      const soldPkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة محدودة',
        soldPricePiasters: 100000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 120, // 2 hours
        reelsCount: 1,
      });

      // Attempt to consume 3 hours (180 minutes) when only 2 hours available
      await expect(
        packageRepo.consumePackageItem(soldPkg.id, 'hours', 180)
      ).rejects.toThrow(DomainInvariantError);

      // Attempt to consume 2 reels when only 1 available
      await expect(
        packageRepo.consumePackageItem(soldPkg.id, 'reels', 2)
      ).rejects.toThrow(DomainInvariantError);
    });

    it('flags low balance alert when hours <= 60 min or reels <= 1', async () => {
      const soldPkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة تجربة',
        soldPricePiasters: 100000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 180, // 3 hours
        reelsCount: 2,
      });

      // Initial state: not low balance (180 min, 2 reels)
      let list = await fetchClientPackages(driver, clientId);
      let p = list.find((x) => x.id === soldPkg.id)!;
      expect(p.isLowBalance).toBe(false);

      // Consume 130 min -> 50 min remaining (<= 60 min)
      await packageRepo.consumePackageItem(soldPkg.id, 'hours', 130);

      list = await fetchClientPackages(driver, clientId);
      p = list.find((x) => x.id === soldPkg.id)!;
      expect(p.isLowBalance).toBe(true);
    });
  });

  describe('Reels Production Pipeline & 5-Stage Kanban Board', () => {
    it('advances a reel through all 5 Kanban stages correctly', async () => {
      const reelId = await saveReel(driver, {
        clientId,
        title: 'فيديو نصائح الاستثمار #1',
        status: 'planned',
        targetDate: '2026-09-15',
        notes: 'مراجعة المخطط والتصوير الداخلي',
      });

      expect(reelId).toBeDefined();

      // Verify initial stage
      let reels = await fetchReels(driver, clientId);
      expect(reels[0].stage).toBe('planned');
      expect(reels[0].targetDate).toBe('2026-09-15');

      // 1. planned -> filmed
      await updateReelStage(driver, reelId, 'filmed');
      reels = await fetchReels(driver, clientId);
      expect(reels[0].stage).toBe('filmed');

      // 2. filmed -> editing
      await updateReelStage(driver, reelId, 'editing');
      reels = await fetchReels(driver, clientId);
      expect(reels[0].stage).toBe('editing');

      // 3. editing -> review
      await updateReelStage(driver, reelId, 'review');
      reels = await fetchReels(driver, clientId);
      expect(reels[0].stage).toBe('review');

      // 4. review -> delivered
      await updateReelStage(driver, reelId, 'delivered');
      reels = await fetchReels(driver, clientId);
      expect(reels[0].stage).toBe('delivered');
    });

    it('automatically decrements package reels quota when linked reel is delivered', async () => {
      // 1. Purchase package with 2 reels
      const soldPkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة ريلز مخصصة',
        soldPricePiasters: 150000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 120,
        reelsCount: 2,
      });

      // 2. Get the provisioned reels
      const reels = await fetchReels(driver, clientId);
      expect(reels).toHaveLength(2);
      const targetReel = reels[0];

      // Verify package initially has 0 reels used
      let clientPackages = await fetchClientPackages(driver, clientId);
      let pkg = clientPackages.find((p) => p.id === soldPkg.id)!;
      expect(pkg.reelsUsed).toBe(0);
      expect(pkg.reelsRemaining).toBe(2);

      // 3. Advance the reel to 'delivered'
      await updateReelStage(driver, targetReel.id, 'delivered');

      // 4. Verify package reel quota decremented atomically!
      clientPackages = await fetchClientPackages(driver, clientId);
      pkg = clientPackages.find((p) => p.id === soldPkg.id)!;
      expect(pkg.reelsUsed).toBe(1);
      expect(pkg.reelsRemaining).toBe(1);
      // Hours remain untouched
      expect(pkg.hoursUsedMinutes).toBe(0);
      expect(pkg.hoursRemainingMinutes).toBe(120);
    });

    it('verifies stage helper transitions and normalization', () => {
      expect(getNextReelStage('planned')).toBe('filmed');
      expect(getNextReelStage('filmed')).toBe('editing');
      expect(getNextReelStage('editing')).toBe('review');
      expect(getNextReelStage('review')).toBe('delivered');
      expect(getNextReelStage('delivered')).toBeNull();

      expect(getPreviousReelStage('delivered')).toBe('review');
      expect(getPreviousReelStage('review')).toBe('editing');
      expect(getPreviousReelStage('editing')).toBe('filmed');
      expect(getPreviousReelStage('filmed')).toBe('planned');
      expect(getPreviousReelStage('planned')).toBeNull();

      expect(normalizeReelStage('available')).toBe('planned');
      expect(normalizeReelStage('in_editing')).toBe('editing');
      expect(normalizeReelStage('completed')).toBe('delivered');
    });
  });
});
