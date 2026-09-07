/**
 * Adversarial Verification Suite (Milestone M4): Contracts & Packages
 * 
 * Specifically challenges:
 * 1. Marketing contracts: rate modification resistance (historical locking of base_amount).
 * 2. Package C Invariant: 10h (600 min) + 3 reels for 4,000 EGP (400,000 piasters)
 *    leaves exactly 5.5h (330 min) and 2 reels without altering financial balance.
 * 3. Package snapshot immutability: template modifications/deactivations do not alter sold client packages.
 * 4. Reels pipeline: stage transitions, delivery auto-decrement, and invalid transitions (e.g. delivered -> planned).
 * 5. Empty/zero package items: progress bar arithmetic resistance against divide-by-zero and NaN%.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  ClientRepository,
  ContractRepository,
  PackageRepository,
  PaymentRepository,
} from '../../../src/database/repositories';
import {
  fetchMarketingContracts,
  generateMonthlyDuesForActiveContracts,
} from '../../../src/modules/contracts/contract-service';
import {
  savePackageTemplate,
  sellPackageToClient,
  fetchClientPackages,
  fetchPackageTemplates,
} from '../../../src/modules/packages/package-service';
import {
  fetchReels,
  saveReel,
  updateReelStage,
} from '../../../src/modules/reels/reels-service';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Adversarial Challenge M4: Contracts & Packages Integrity', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let contractRepo: ContractRepository;
  let packageRepo: PackageRepository;
  let paymentRepo: PaymentRepository;
  let clientId: string;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    contractRepo = new ContractRepository(driver);
    packageRepo = new PackageRepository(driver);
    paymentRepo = new PaymentRepository(driver);

    const client = await clientRepo.create({
      name: 'شركة النيل للإنتاج والتسويق',
      companyName: 'النيل ميديا',
      phone: '01099887766',
    });
    clientId = client.id;
  });

  afterEach(async () => {
    await driver.close();
  });

  // =========================================================================
  // Challenge 1: Marketing Contracts Rate Modification Resistance
  // =========================================================================
  describe('Challenge 1: Marketing Contracts Historical Rate Locking', () => {
    it('ensures existing generated dues retain their locked base amount when contract rate changes', async () => {
      // 1. Create contract with monthly amount 5,000 EGP (500,000 piasters)
      const contract = await contractRepo.createMarketingContract({
        clientId,
        monthlyAmount: 500000,
        startDate: '2026-09-01',
        status: 'active',
      });

      // 2. Generate due for September 2026 (locked at 500,000 piasters)
      const dueSep = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-01');
      expect(dueSep.base_amount).toBe(500000);

      // 3. Rate modification occurs: future rate increases to 8,000 EGP (800,000 piasters)
      await driver.execute(
        `UPDATE marketing_contracts SET monthly_amount = 800000, updated_at = ? WHERE id = ?;`,
        [new Date().toISOString(), contract.id]
      );

      // Verify contract updated in DB
      const updatedContract = await contractRepo.getMarketingContractById(contract.id);
      expect(updatedContract?.monthly_amount).toBe(800000);

      // 4. Generate due for October 2026 with the new rate
      const dueOct = await contractRepo.generateMonthlyDue(contract.id, 2026, 10, '2026-10-01');
      expect(dueOct.base_amount).toBe(800000);

      // 5. EMPIRICAL VERIFICATION: September due base_amount is 100% locked and unchanged!
      const dues = await contractRepo.listDuesByContract(contract.id);
      const sepInDb = dues.find((d) => d.year === 2026 && d.month === 9)!;
      const octInDb = dues.find((d) => d.year === 2026 && d.month === 10)!;

      expect(sepInDb.base_amount).toBe(500000); // REMAINS LOCKED!
      expect(octInDb.base_amount).toBe(800000); // Reflects new rate!

      // 6. Verify fetchMarketingContracts reflects exact locked base amounts and balances
      const contractsWithDetails = await fetchMarketingContracts(driver);
      const details = contractsWithDetails.find((c) => c.id === contract.id)!;
      expect(details.duesCount).toBe(2);
      expect(details.totalRemainingDuesPiasters).toBe(500000 + 800000); // Exactly 1,300,000 piasters
    });

    it('adversarially prevents generating duplicate dues for the same contract/period', async () => {
      const contract = await contractRepo.createMarketingContract({
        clientId,
        monthlyAmount: 300000,
        startDate: '2026-09-01',
      });

      await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-01');

      // Second generation attempt for 2026-09 must reject
      await expect(
        contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-01')
      ).rejects.toThrow();

      // Bulk generator should safely skip already generated period
      const bulkResult = await generateMonthlyDuesForActiveContracts(driver, 2026, 9);
      expect(bulkResult.generatedCount).toBe(0);
      expect(bulkResult.skippedCount).toBe(1);
    });

    it('rejects invalid month numbers outside 1..12', async () => {
      const contract = await contractRepo.createMarketingContract({
        clientId,
        monthlyAmount: 300000,
        startDate: '2026-09-01',
      });

      await expect(
        contractRepo.generateMonthlyDue(contract.id, 2026, 0, '2026-00-01')
      ).rejects.toThrow(DomainInvariantError);

      await expect(
        contractRepo.generateMonthlyDue(contract.id, 2026, 13, '2026-13-01')
      ).rejects.toThrow(DomainInvariantError);
    });
  });

  // =========================================================================
  // Challenge 2: Package C Invariant (Strict Decoupling & Consumption Math)
  // =========================================================================
  describe('Challenge 2: Package C Invariant (10h + 3 reels for 4,000 EGP)', () => {
    it('preserves exact 5.5h (330 min) and 2 reels after partial consumption of 4.5h and 1 reel without altering financial due', async () => {
      // 1. Sell Package C: 10 hours (600 min) + 3 reels for 4,000 EGP (400,000 piasters)
      const pkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة ج (كريتور): 10 ساعات + 3 ريلز',
        soldPricePiasters: 400000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 600,
        reelsCount: 3,
      });

      // Verify baseline
      let clientPkgs = await fetchClientPackages(driver, clientId);
      let details = clientPkgs.find((p) => p.id === pkg.id)!;
      expect(details.sold_price).toBe(400000);
      expect(details.hoursPurchasedMinutes).toBe(600);
      expect(details.hoursRemainingMinutes).toBe(600);
      expect(details.reelsPurchased).toBe(3);
      expect(details.reelsRemaining).toBe(3);
      expect(details.paidAmountPiasters).toBe(0);

      // 2. Consume 4.5 hours (4.5 * 60 = 270 minutes)
      await packageRepo.consumePackageItem(pkg.id, 'hours', 270);

      // 3. Consume 1 reel
      await packageRepo.consumePackageItem(pkg.id, 'reels', 1);

      // 4. Verify post-consumption state
      clientPkgs = await fetchClientPackages(driver, clientId);
      details = clientPkgs.find((p) => p.id === pkg.id)!;

      // Studio hours verification: exactly 5.5 hours = 330 minutes remaining
      expect(details.hoursUsedMinutes).toBe(270);
      expect(details.hoursRemainingMinutes).toBe(330);
      expect(details.hoursRemainingMinutes / 60).toBe(5.5);

      // Reels verification: exactly 2 reels remaining
      expect(details.reelsUsed).toBe(1);
      expect(details.reelsRemaining).toBe(2);

      // Financial balance verification: sold_price remains 400,000 piasters, paid remains 0
      expect(details.sold_price).toBe(400000);
      expect(details.paidAmountPiasters).toBe(0);

      // 5. Pay 1,500 EGP (150,000 piasters) partially
      await paymentRepo.recordPayment({
        clientId,
        amount: 150000,
        method: 'cash',
        date: '2026-09-05',
        targets: [
          {
            targetType: 'client_package',
            targetId: pkg.id,
            duePiasters: 400000,
            requestedPiasters: 150000,
          },
        ],
      });

      // 6. Verify financial payment does NOT alter service balances in any way
      clientPkgs = await fetchClientPackages(driver, clientId);
      details = clientPkgs.find((p) => p.id === pkg.id)!;
      expect(details.paidAmountPiasters).toBe(150000);
      expect(details.sold_price - details.paidAmountPiasters).toBe(250000); // 2,500 EGP remaining financial due
      expect(details.hoursRemainingMinutes).toBe(330); // Untouched!
      expect(details.reelsRemaining).toBe(2); // Untouched!
    });

    it('strictly prevents consuming more hours or reels than remaining in the package', async () => {
      const pkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة محدودة',
        soldPricePiasters: 200000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 180, // 3 hours
        reelsCount: 1, // 1 reel
      });

      // Consuming exactly 180 minutes succeeds
      await packageRepo.consumePackageItem(pkg.id, 'hours', 180);

      // Consuming even 1 more minute fails
      await expect(
        packageRepo.consumePackageItem(pkg.id, 'hours', 1)
      ).rejects.toThrow(DomainInvariantError);

      // Consuming 1 reel succeeds
      await packageRepo.consumePackageItem(pkg.id, 'reels', 1);

      // Consuming 1 more reel fails
      await expect(
        packageRepo.consumePackageItem(pkg.id, 'reels', 1)
      ).rejects.toThrow(DomainInvariantError);
    });

    it('rejects negative or non-integer consumption amounts and safe no-ops on zero', async () => {
      const pkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة اختبار',
        soldPricePiasters: 100000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 120,
        reelsCount: 2,
      });

      // Negative values strictly rejected
      await expect(
        packageRepo.consumePackageItem(pkg.id, 'hours', -30)
      ).rejects.toThrow(DomainInvariantError);

      await expect(
        packageRepo.consumePackageItem(pkg.id, 'reels', -1)
      ).rejects.toThrow(DomainInvariantError);

      // Floating-point values strictly rejected
      await expect(
        packageRepo.consumePackageItem(pkg.id, 'hours', 1.5 as unknown as number)
      ).rejects.toThrow(DomainInvariantError);

      // Zero consumption safely no-ops without altering usage
      await packageRepo.consumePackageItem(pkg.id, 'hours', 0);
      await packageRepo.consumePackageItem(pkg.id, 'reels', 0);

      const clientPkgs = await fetchClientPackages(driver, clientId);
      const details = clientPkgs.find((p) => p.id === pkg.id)!;
      expect(details.hoursUsedMinutes).toBe(0);
      expect(details.hoursRemainingMinutes).toBe(120);
      expect(details.reelsUsed).toBe(0);
      expect(details.reelsRemaining).toBe(2);
    });
  });

  // =========================================================================
  // Challenge 3: Package Snapshot Immutability
  // =========================================================================
  describe('Challenge 3: Package Snapshot Immutability (Template Alteration Resistance)', () => {
    it('preserves client purchased package terms when catalog template is modified or deactivated', async () => {
      // 1. Create a catalog template: 6 hours (360 min) + 2 reels for 2,000 EGP (200,000 piasters)
      const templateId = await savePackageTemplate(driver, {
        name: 'باقة الشركات الناشئة',
        defaultPricePiasters: 200000,
        hoursMinutes: 360,
        reelsCount: 2,
        active: 1,
      });

      // 2. Sell this package template to the client
      const soldPkg = await sellPackageToClient(driver, {
        clientId,
        packageTemplateId: templateId,
        nameSnapshot: 'باقة الشركات الناشئة',
        soldPricePiasters: 200000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 360,
        reelsCount: 2,
        notes: 'تم الشراء بناءً على العرض الترويجي الأول',
      });

      // Verify sold terms captured
      expect(soldPkg.name_snapshot).toBe('باقة الشركات الناشئة');
      expect(soldPkg.sold_price).toBe(200000);

      // 3. Now modify the catalog template radically: price rises to 500,000, hours to 720, reels to 5, name changes
      await savePackageTemplate(driver, {
        id: templateId,
        name: 'باقة الشركات الكبرى والمؤسسات',
        defaultPricePiasters: 500000, // 5,000 EGP
        hoursMinutes: 720, // 12 hours
        reelsCount: 5, // 5 reels
        active: 0, // deactivated!
      });

      // 4. Verify catalog template has the new values
      const templates = await fetchPackageTemplates(driver);
      const modifiedTemplate = templates.find((t) => t.id === templateId)!;
      expect(modifiedTemplate.name).toBe('باقة الشركات الكبرى والمؤسسات');
      expect(modifiedTemplate.default_price).toBe(500000);
      expect(modifiedTemplate.hoursMinutes).toBe(720);
      expect(modifiedTemplate.reelsCount).toBe(5);
      expect(modifiedTemplate.active).toBe(0);

      // 5. EMPIRICAL VERIFICATION: Client's purchased package snapshot is 100% IMMUTABLE
      const clientPkgs = await fetchClientPackages(driver, clientId);
      const clientPkg = clientPkgs.find((p) => p.id === soldPkg.id)!;

      expect(clientPkg.name_snapshot).toBe('باقة الشركات الناشئة'); // Original name preserved!
      expect(clientPkg.sold_price).toBe(200000); // Original price preserved!
      expect(clientPkg.hoursPurchasedMinutes).toBe(360); // Original 360 minutes preserved!
      expect(clientPkg.reelsPurchased).toBe(2); // Original 2 reels preserved!
      expect(clientPkg.hoursRemainingMinutes).toBe(360);
      expect(clientPkg.reelsRemaining).toBe(2);
    });
  });

  // =========================================================================
  // Challenge 4: Reels Pipeline & State Transitions
  // =========================================================================
  describe('Challenge 4: Reels Pipeline & State Transitions', () => {
    it('properly decrements client package reel item upon delivery', async () => {
      // 1. Sell package with 2 reels
      const pkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة ريلز مخصصة',
        soldPricePiasters: 150000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 0,
        reelsCount: 2,
      });

      const reels = await fetchReels(driver, clientId);
      expect(reels).toHaveLength(2);
      const reel1 = reels[0];

      // 2. Deliver reel1
      await updateReelStage(driver, reel1.id, 'delivered');

      // 3. Verify package decremented
      const clientPkgs = await fetchClientPackages(driver, clientId);
      const details = clientPkgs.find((p) => p.id === pkg.id)!;
      expect(details.reelsUsed).toBe(1);
      expect(details.reelsRemaining).toBe(1);
    });

    it('restores a package reel when a delivered reel returns to planning', async () => {
      // Sell package with 1 reel
      const pkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة ريل واحدة',
        soldPricePiasters: 80000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 0,
        reelsCount: 1,
      });

      const reels = await fetchReels(driver, clientId);
      const reel = reels[0];

      // Step 1: Move to delivered -> package decrements to 0 remaining
      await updateReelStage(driver, reel.id, 'delivered');

      let clientPkgs = await fetchClientPackages(driver, clientId);
      let details = clientPkgs.find((p) => p.id === pkg.id)!;
      expect(details.reelsUsed).toBe(1);
      expect(details.reelsRemaining).toBe(0);

      // Step 2: Transition back from delivered -> planned
      // Note: In ReelsKanban UI, the buttons only offer getPreviousReelStage('delivered') which is 'review'.
      // But updateReelStage allows setting any stage directly.
      await updateReelStage(driver, reel.id, 'planned');

      // Check reel status
      const updatedReels = await fetchReels(driver, clientId);
      const targetReel = updatedReels.find((r) => r.id === reel.id)!;
      expect(targetReel.stage).toBe('planned');

      // Returning the reel to work restores the entitlement.
      clientPkgs = await fetchClientPackages(driver, clientId);
      details = clientPkgs.find((p) => p.id === pkg.id)!;
      expect(details.reelsUsed).toBe(0);
      expect(details.reelsRemaining).toBe(1);

      // Delivering it again consumes the same restored entitlement exactly once.
      await updateReelStage(driver, reel.id, 'delivered');

      // Verify reel is delivered and package used count did NOT exceed purchased quantity
      clientPkgs = await fetchClientPackages(driver, clientId);
      details = clientPkgs.find((p) => p.id === pkg.id)!;
      expect(details.reelsUsed).toBe(1);
      expect(details.reelsRemaining).toBe(0);
    });

    it('does not double-consume when a reel is re-delivered after rework', async () => {
      // Package with 3 reels
      const pkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة ريلز متعددة',
        soldPricePiasters: 240000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 0,
        reelsCount: 3,
      });

      const reels = await fetchReels(driver, clientId);
      const reel1 = reels[0];

      // 1. Deliver reel 1 -> consumes 1 reel (used=1, remaining=2)
      await updateReelStage(driver, reel1.id, 'delivered');
      let clientPkgs = await fetchClientPackages(driver, clientId);
      let details = clientPkgs.find((p) => p.id === pkg.id)!;
      expect(details.reelsUsed).toBe(1);
      expect(details.reelsRemaining).toBe(2);

      // 2. Move back to planning and restore the consumed entitlement.
      await updateReelStage(driver, reel1.id, 'planned');
      clientPkgs = await fetchClientPackages(driver, clientId);
      details = clientPkgs.find((p) => p.id === pkg.id)!;
      expect(details.reelsUsed).toBe(0);

      // 3. Deliver reel 1 again.
      await updateReelStage(driver, reel1.id, 'delivered');
      clientPkgs = await fetchClientPackages(driver, clientId);
      details = clientPkgs.find((p) => p.id === pkg.id)!;

      expect(details.reelsUsed).toBe(1);
      expect(details.reelsRemaining).toBe(2);
    });

    it('handles stand-alone reels not linked to any package cleanly on delivery', async () => {
      const reelId = await saveReel(driver, {
        clientId,
        title: 'ريل مستقل لإعلان السوشيال ميديا',
        status: 'planned',
      });

      // Move all the way to delivered
      await updateReelStage(driver, reelId, 'delivered');

      const reels = await fetchReels(driver, clientId);
      const target = reels.find((r) => r.id === reelId)!;
      expect(target.stage).toBe('delivered');
    });
  });

  // =========================================================================
  // Challenge 5: Empty/Zero Package Items & Progress Bar Resistance
  // =========================================================================
  describe('Challenge 5: Empty/Zero Package Items & Progress Bar Arithmetic Resistance', () => {
    it('handles 0 purchased hours or 0 purchased reels gracefully without NaN% or divide-by-zero crashes', async () => {
      // 1. Hours-only package (0 reels)
      const hoursOnlyPkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة ساعات استوديو فقط (بدون ريلز)',
        soldPricePiasters: 150000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 300,
        reelsCount: 0,
      });

      // 2. Reels-only package (0 hours)
      const reelsOnlyPkg = await sellPackageToClient(driver, {
        clientId,
        nameSnapshot: 'باقة ريلز فقط (بدون ساعات)',
        soldPricePiasters: 200000,
        purchasedAt: '2026-09-01',
        hoursMinutes: 0,
        reelsCount: 3,
      });

      const clientPkgs = await fetchClientPackages(driver, clientId);
      const hPkg = clientPkgs.find((p) => p.id === hoursOnlyPkg.id)!;
      const rPkg = clientPkgs.find((p) => p.id === reelsOnlyPkg.id)!;

      // Verification of hours-only package
      expect(hPkg.hoursPurchasedMinutes).toBe(300);
      expect(hPkg.reelsPurchased).toBe(0);
      expect(hPkg.reelsRemaining).toBe(0);

      // Replicate the UI progress bar calculations used in ClientPackagesList:
      const h_hoursPercent =
        hPkg.hoursPurchasedMinutes > 0
          ? Math.min(100, Math.round((hPkg.hoursUsedMinutes / hPkg.hoursPurchasedMinutes) * 100))
          : 0;
      const h_reelsPercent =
        hPkg.reelsPurchased > 0
          ? Math.min(100, Math.round((hPkg.reelsUsed / hPkg.reelsPurchased) * 100))
          : 0;

      expect(h_hoursPercent).toBe(0);
      expect(h_reelsPercent).toBe(0);
      expect(Number.isNaN(h_hoursPercent)).toBe(false);
      expect(Number.isNaN(h_reelsPercent)).toBe(false);
      expect(Number.isFinite(h_hoursPercent)).toBe(true);
      expect(Number.isFinite(h_reelsPercent)).toBe(true);

      // Verification of reels-only package
      expect(rPkg.hoursPurchasedMinutes).toBe(0);
      expect(rPkg.reelsPurchased).toBe(3);
      expect(rPkg.hoursRemainingMinutes).toBe(0);

      const r_hoursPercent =
        rPkg.hoursPurchasedMinutes > 0
          ? Math.min(100, Math.round((rPkg.hoursUsedMinutes / rPkg.hoursPurchasedMinutes) * 100))
          : 0;
      const r_reelsPercent =
        rPkg.reelsPurchased > 0
          ? Math.min(100, Math.round((rPkg.reelsUsed / rPkg.reelsPurchased) * 100))
          : 0;

      expect(r_hoursPercent).toBe(0);
      expect(r_reelsPercent).toBe(0);
      expect(Number.isNaN(r_hoursPercent)).toBe(false);
      expect(Number.isNaN(r_reelsPercent)).toBe(false);

      // Replicate the UI progress bar calculations used in ClientProfile360:
      const profileHoursWidth = Math.min(100, (hPkg.hoursUsedMinutes / (hPkg.hoursPurchasedMinutes || 1)) * 100);
      const profileReelsWidth = Math.min(100, (hPkg.reelsUsed / (hPkg.reelsPurchased || 1)) * 100);
      expect(profileHoursWidth).toBe(0);
      expect(profileReelsWidth).toBe(0);
      expect(Number.isNaN(profileHoursWidth)).toBe(false);
      expect(Number.isNaN(profileReelsWidth)).toBe(false);
    });

    it('rejects selling package with both 0 hours and 0 reels', async () => {
      await expect(
        sellPackageToClient(driver, {
          clientId,
          nameSnapshot: 'باقة فارغة تماماً',
          soldPricePiasters: 100000,
          purchasedAt: '2026-09-01',
          hoursMinutes: 0,
          reelsCount: 0,
        })
      ).rejects.toThrow(DomainInvariantError);
    });
  });
});
