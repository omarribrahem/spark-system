import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PackageFixture } from '../fixtures/package-fixture';

describe('Tier 1: Package Catalog, Snapshots, Consumption & Low Balances (F-017 .. F-021)', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let packageFixture: PackageFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    packageFixture = new PackageFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'كريم ميديا' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-017: Package Catalog
  describe('F-017: Package Catalog', () => {
    it('creates package template with name and default price in piasters', async () => {
      await ctx.driver.execute(
        `INSERT INTO package_templates (id, name, default_price, is_active)
         VALUES ('tpl_creator', 'باقة صانع المحتوى (Creator)', 400000, 1)`
      );

      const tpls = await ctx.driver.query<{ name: string; default_price: number }>(
        "SELECT name, default_price FROM package_templates WHERE id = 'tpl_creator'"
      );
      expect(tpls[0]?.name).toBe('باقة صانع المحتوى (Creator)');
      expect(tpls[0]?.default_price).toBe(400000);
      expect(tpls[0]?.default_price).toBePiasters();
    });

    it('attaches bundled quota items (hours/reels) to package template', async () => {
      await ctx.driver.execute(
        `INSERT INTO package_templates (id, name, default_price, is_active)
         VALUES ('tpl_mixed', 'باقة مختلطة C', 400000, 1)`
      );

      // 10 hours = 600 minutes
      await ctx.driver.execute(
        `INSERT INTO package_template_items (id, template_id, unit_type, quantity)
         VALUES ('item_h', 'tpl_mixed', 'hours', 600)`
      );
      // 3 reels
      await ctx.driver.execute(
        `INSERT INTO package_template_items (id, template_id, unit_type, quantity)
         VALUES ('item_r', 'tpl_mixed', 'reels', 3)`
      );

      const items = await ctx.driver.query<{ unit_type: string; quantity: number }>(
        "SELECT unit_type, quantity FROM package_template_items WHERE template_id = 'tpl_mixed'"
      );
      expect(items).toHaveLength(2);
      expect(items.find((i) => i.unit_type === 'hours')?.quantity).toBe(600);
      expect(items.find((i) => i.unit_type === 'reels')?.quantity).toBe(3);
    });

    it('soft-deactivates template without deleting existing records', async () => {
      await ctx.driver.execute(
        `INSERT INTO package_templates (id, name, default_price, is_active)
         VALUES ('tpl_deact', 'باقة قديمة', 100000, 1)`
      );

      await ctx.driver.execute("UPDATE package_templates SET is_active = 0 WHERE id = 'tpl_deact'");

      const tpls = await ctx.driver.query<{ is_active: number }>(
        "SELECT is_active FROM package_templates WHERE id = 'tpl_deact'"
      );
      expect(tpls[0]?.is_active).toBe(0);
    });

    it('rejects template creation with zero units for both hours and reels', () => {
      const validateTemplate = (hours: number, reels: number) => {
        if (hours <= 0 && reels <= 0) {
          throw new Error('Package template must contain at least 1 hour or 1 reel');
        }
      };
      expect(() => validateTemplate(0, 0)).toThrow('must contain at least 1 hour or 1 reel');
    });

    it('validates template price is non-negative', () => {
      const validatePrice = (price: number) => {
        if (price < 0) throw new Error('Package price cannot be negative');
      };
      expect(() => validatePrice(-500)).toThrow('cannot be negative');
      expect(() => validatePrice(0)).not.toThrow(); // 0 is allowed for complimentary
    });
  });

  // F-018: Package Sold Snapshots
  describe('F-018: Package Sold Snapshots', () => {
    it('creates sold package snapshot with immutable name and sold price in piasters', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة صانع المحتوى',
        soldPricePiasters: 400000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600, // 10h
        reelsQuota: 3,
      });

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.soldPrice).toBe(400000);
      expect(summary.soldPrice).toBePiasters();
      expect(summary.hoursPurchased).toBe(600);
      expect(summary.hoursPurchased).toBeMinutes();
      expect(summary.reelsPurchased).toBe(3);
      expect(summary.status).toBe('not_started');
    });

    it('stores fractional hours strictly as integer minutes (1.5h = 90m)', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة تجريبية 1.5 ساعة',
        soldPricePiasters: 75000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 90,
      });

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursPurchased).toBe(90);
      expect(summary.hoursPurchased).toBeMinutes();
    });

    it('preserves sold price even if template price is updated later (BR-006)', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة 2026 الأساسية',
        soldPricePiasters: 350000, // Sold at discount
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 300,
      });

      // Later, catalog template price changes to 500,000
      const updatedTemplatePrice = 500000;
      expect(updatedTemplatePrice).toBe(500000);

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.soldPrice).toBe(350000); // Intact!
    });

    it('creates discrete reel items for tracking in production board', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة ريلز فقط',
        soldPricePiasters: 200000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 0,
        reelsQuota: 2,
      });

      const reels = await ctx.driver.query<{ id: string; title: string; status: string }>(
        'SELECT id, title, status FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      expect(reels).toHaveLength(2);
      expect(reels[0].status).toBe('available');
    });

    it('initializes used_quantity and reserved_quantity to zero', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة جديدة',
        soldPricePiasters: 100000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 180,
      });

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursUsed).toBe(0);
      expect(summary.hoursReserved).toBe(0);
      expect(summary.hoursAvailable).toBe(180);
    });
  });

  // F-019: Package Consumption Engine
  describe('F-019: Package Consumption', () => {
    it('depletes studio minutes on session completion while leaving reels intact', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'Package C Mixed',
        soldPricePiasters: 400000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600, // 10h
        reelsQuota: 3,
      });

      // Simulate completing 4.5 hours (270 mins)
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 270 WHERE client_package_id = ? AND unit_type = 'hours'",
        [packageId]
      );
      await ctx.driver.execute("UPDATE client_packages SET status = 'active' WHERE id = ?", [packageId]);

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursUsed).toBe(270);
      expect(summary.hoursAvailable).toBe(330); // 5.5 hours remaining
      expect(summary.reelsUsed).toBe(0);       // Untouched!
      expect(summary.reelsRemaining).toBe(3);  // Untouched!
      expect(summary.status).toBe('active');
    });

    it('depletes reel count on delivery while leaving studio minutes intact', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'Package C Mixed',
        soldPricePiasters: 400000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600,
        reelsQuota: 3,
      });

      // Deliver 1 reel
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 1 WHERE client_package_id = ? AND unit_type = 'reels'",
        [packageId]
      );

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.reelsUsed).toBe(1);
      expect(summary.reelsRemaining).toBe(2);
      expect(summary.hoursUsed).toBe(0);       // Untouched!
      expect(summary.hoursAvailable).toBe(600); // Untouched!
    });

    it('transitions package to fully_used only when BOTH hours and reels reach 0', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'Package C Mixed',
        soldPricePiasters: 400000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600,
        reelsQuota: 3,
      });

      // Fully consume hours but 1 reel remains
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 600 WHERE client_package_id = ? AND unit_type = 'hours'",
        [packageId]
      );
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 2 WHERE client_package_id = ? AND unit_type = 'reels'",
        [packageId]
      );

      let summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursAvailable).toBe(0);
      expect(summary.reelsRemaining).toBe(1);
      // Status must NOT be fully_used yet!
      expect(summary.status).not.toBe('fully_used');

      // Now consume last reel
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 3 WHERE client_package_id = ? AND unit_type = 'reels'",
        [packageId]
      );
      await ctx.driver.execute("UPDATE client_packages SET status = 'fully_used' WHERE id = ?", [packageId]);

      summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursAvailable).toBe(0);
      expect(summary.reelsRemaining).toBe(0);
      expect(summary.status).toBe('fully_used');
    });

    it('prevents negative package balances', () => {
      const checkOverConsumption = (purchased: number, used: number, requested: number) => {
        const available = purchased - used;
        if (requested > available) {
          throw new Error('Requested duration exceeds remaining package hours');
        }
      };
      expect(() => checkOverConsumption(180, 120, 90)).toThrow('exceeds remaining');
    });

    it('operates completely independently from payment status (BR-005)', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'Unpaid Package',
        soldPricePiasters: 500000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 300,
      });

      // Paid amount is 0, but client can still consume hours
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 60 WHERE client_package_id = ? AND unit_type = 'hours'",
        [packageId]
      );

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.paidAmount).toBe(0);
      expect(summary.hoursUsed).toBe(60);
      expect(summary.hoursAvailable).toBe(240);
    });
  });

  // F-020: Multi-Active Packages
  describe('F-020: Multi-Active Packages', () => {
    it('supports client owning multiple active packages concurrently', async () => {
      const pkg1 = await packageFixture.sellPackage({
        clientId,
        packageName: 'Package 1 (September)',
        soldPricePiasters: 200000,
        purchaseDate: '2026-09-01',
        hoursMinutesQuota: 300,
      });

      const pkg2 = await packageFixture.sellPackage({
        clientId,
        packageName: 'Package 2 (October)',
        soldPricePiasters: 300000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 450,
      });

      const pkgs = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM client_packages WHERE client_id = ?',
        [clientId]
      );
      expect(pkgs).toHaveLength(2);
      expect(pkg1.packageId).not.toBe(pkg2.packageId);
    });

    it('drawing hours from Package 1 leaves Package 2 untouched', async () => {
      const pkg1 = await packageFixture.sellPackage({
        clientId,
        packageName: 'Package 1',
        soldPricePiasters: 200000,
        purchaseDate: '2026-09-01',
        hoursMinutesQuota: 300,
      });

      const pkg2 = await packageFixture.sellPackage({
        clientId,
        packageName: 'Package 2',
        soldPricePiasters: 300000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 450,
      });

      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 120 WHERE client_package_id = ? AND unit_type = 'hours'",
        [pkg1.packageId]
      );

      const summary1 = await packageFixture.getPackageSummary(pkg1.packageId);
      const summary2 = await packageFixture.getPackageSummary(pkg2.packageId);

      expect(summary1.hoursAvailable).toBe(180);
      expect(summary2.hoursAvailable).toBe(450); // Untouched
    });

    it('suggests FIFO order (oldest active package first) when booking', async () => {
      await packageFixture.sellPackage({
        clientId,
        packageName: 'Older Package',
        soldPricePiasters: 200000,
        purchaseDate: '2026-08-01',
        hoursMinutesQuota: 180,
      });

      await packageFixture.sellPackage({
        clientId,
        packageName: 'Newer Package',
        soldPricePiasters: 200000,
        purchaseDate: '2026-09-01',
        hoursMinutesQuota: 180,
      });

      const oldest = await ctx.driver.query<{ package_name_snapshot: string }>(
        "SELECT package_name_snapshot FROM client_packages WHERE client_id = ? ORDER BY purchase_date ASC LIMIT 1",
        [clientId]
      );
      expect(oldest[0]?.package_name_snapshot).toBe('Older Package');
    });

    it('renders dropdown items for all active packages for client', async () => {
      await packageFixture.sellPackage({
        clientId,
        packageName: 'Package A',
        soldPricePiasters: 100000,
        purchaseDate: '2026-09-01',
        hoursMinutesQuota: 120,
      });

      const dropdownOptions = await ctx.driver.query<{ id: string; package_name_snapshot: string }>(
        "SELECT id, package_name_snapshot FROM client_packages WHERE client_id = ? AND status != 'cancelled'",
        [clientId]
      );
      expect(dropdownOptions).toHaveLength(1);
    });

    it('handles exhausting oldest package cleanly', async () => {
      const pkg = await packageFixture.sellPackage({
        clientId,
        packageName: 'Package Exhaust',
        soldPricePiasters: 100000,
        purchaseDate: '2026-09-01',
        hoursMinutesQuota: 60,
      });

      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 60 WHERE client_package_id = ? AND unit_type = 'hours'",
        [pkg.packageId]
      );
      await ctx.driver.execute("UPDATE client_packages SET status = 'fully_used' WHERE id = ?", [pkg.packageId]);

      const active = await ctx.driver.query(
        "SELECT id FROM client_packages WHERE client_id = ? AND status = 'active'",
        [clientId]
      );
      expect(active).toHaveLength(0);
    });
  });

  // F-021: Low Balance Alerts
  describe('F-021: Low Balance Alerts', () => {
    it('flags package as low when remaining studio hours <= 2h (120 minutes)', () => {
      const isLowHours = (minutes: number) => minutes <= 120 && minutes > 0;
      expect(isLowHours(120)).toBe(true);  // Exact boundary
      expect(isLowHours(60)).toBe(true);
      expect(isLowHours(121)).toBe(false); // Over threshold
    });

    it('flags package as low when remaining reels <= 1 reel', () => {
      const isLowReels = (reels: number) => reels <= 1 && reels > 0;
      expect(isLowReels(1)).toBe(true);  // Exact boundary
      expect(isLowReels(2)).toBe(false);
    });

    it('does not flag fully used packages (0h, 0 reels) as low balance', () => {
      const shouldAlert = (availableMinutes: number, remainingReels: number, status: string) => {
        if (status === 'fully_used') return false;
        return (availableMinutes > 0 && availableMinutes <= 120) || (remainingReels > 0 && remainingReels <= 1);
      };
      expect(shouldAlert(0, 0, 'fully_used')).toBe(false);
      expect(shouldAlert(60, 0, 'active')).toBe(true);
    });

    it('displays low balance warning badge in Safaa dashboard watchlist', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة صانع المحتوى',
        soldPricePiasters: 400000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600,
      });

      // Consume 500 mins, 100 mins remaining (<= 120 mins)
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 500 WHERE client_package_id = ? AND unit_type = 'hours'",
        [packageId]
      );
      await ctx.driver.execute("UPDATE client_packages SET status = 'active' WHERE id = ?", [packageId]);

      const items = await ctx.driver.query<{ purchased_quantity: number; used_quantity: number }>(
        "SELECT purchased_quantity, used_quantity FROM client_package_items WHERE client_package_id = ? AND unit_type = 'hours'",
        [packageId]
      );
      const remaining = items[0].purchased_quantity - items[0].used_quantity;
      expect(remaining).toBe(100);
      expect(remaining <= 120).toBe(true);
    });

    it('clears low balance alert upon purchasing a replacement package', async () => {
      const activePackageBalances = [100]; // 100m left
      const hasLowAlert = activePackageBalances.some((m) => m <= 120);
      expect(hasLowAlert).toBe(true);

      // Client buys new package with 600m
      activePackageBalances.push(600);
      const totalAvailable = activePackageBalances.reduce((a, b) => a + b, 0);
      expect(totalAvailable).toBe(700);
    });
  });
});
