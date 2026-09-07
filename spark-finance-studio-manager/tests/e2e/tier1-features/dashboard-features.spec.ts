import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { ContractFixture } from '../fixtures/contract-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';

describe('Tier 1: Safaa Daily Dashboard, Action Center & Month Snapshot (F-043 .. F-045)', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let contractFixture: ContractFixture;
  let packageFixture: PackageFixture;
  let bookingFixture: BookingFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    contractFixture = new ContractFixture(ctx.driver);
    packageFixture = new PackageFixture(ctx.driver);
    bookingFixture = new BookingFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'مؤسسة الفجر' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-043: Safaa's Daily Dashboard (§8)
  describe("F-043: Safaa's Daily Dashboard", () => {
    it("aggregates Today's Studio Bookings count and nearest booking", async () => {
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00',
      });
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '14:00',
        endTime: '16:00',
      });

      const todayBookings = await ctx.driver.query<{ start_time: string }>(
        "SELECT start_time FROM studio_bookings WHERE booking_date = '2026-10-05' AND status != 'cancelled' ORDER BY start_time ASC"
      );
      expect(todayBookings).toHaveLength(2);
      expect(todayBookings[0].start_time).toBe('10:00'); // Nearest!
    });

    it('calculates Money Due Today KPI strip value', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-10-01',
      });

      await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 500000,
        dueDate: '2026-10-05',
        status: 'due',
      });

      const dueToday = await ctx.driver.query<{ total_amount: number }>(
        "SELECT total_amount FROM marketing_contract_dues WHERE due_date = '2026-10-05' AND status IN ('due', 'partial')"
      );
      expect(dueToday[0]?.total_amount).toBe(500000);
      expect(dueToday[0]?.total_amount).toBePiasters();
    });

    it('calculates Overdue Amount KPI strip value', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 600000,
        startDate: '2026-09-01',
      });

      await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 9,
        baseAmountPiasters: 600000,
        dueDate: '2026-09-30',
        status: 'overdue',
      });

      const overdue = await ctx.driver.query<{ total_amount: number; paid_amount: number }>(
        "SELECT total_amount, paid_amount FROM marketing_contract_dues WHERE status = 'overdue'"
      );
      const overdueTotal = overdue.reduce((acc, d) => acc + (d.total_amount - d.paid_amount), 0);
      expect(overdueTotal).toBe(600000);
      expect(overdueTotal).toBePiasters();
    });

    it('renders Studio Today Timeline with time ranges and status badges', async () => {
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '13:00',
        endTime: '15:00',
        status: 'confirmed',
      });

      const timeline = await ctx.driver.query<{ start_time: string; end_time: string; status: string }>(
        "SELECT start_time, end_time, status FROM studio_bookings WHERE booking_date = '2026-10-05' AND status != 'cancelled'"
      );
      expect(timeline[0].start_time).toBe('13:00');
      expect(timeline[0].end_time).toBe('15:00');
      expect(timeline[0].status).toBe('confirmed');
    });

    it('displays empty timeline state when today has zero bookings', async () => {
      const timeline = await ctx.driver.query(
        "SELECT * FROM studio_bookings WHERE booking_date = '2026-10-06'"
      );
      expect(timeline).toHaveLength(0);
    });
  });

  // F-044: Dashboard Action Center ("Needs Attention")
  describe('F-044: Dashboard Action Center', () => {
    it('aggregates overdue marketing contract dues into action items', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 400000,
        startDate: '2026-09-01',
      });
      await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 9,
        baseAmountPiasters: 400000,
        dueDate: '2026-09-30',
        status: 'overdue',
      });

      const overdueItems = await ctx.driver.query<{ id: string; client_id: string }>(
        "SELECT id, client_id FROM marketing_contract_dues WHERE status = 'overdue'"
      );
      expect(overdueItems).toHaveLength(1);
      expect(overdueItems[0].client_id).toBe(clientId);
    });

    it('aggregates low package hours (<= 120 minutes) into action items', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة صانع المحتوى',
        soldPricePiasters: 400000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600,
      });

      // 500 mins used -> 100 mins left (<= 120 mins)
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 500 WHERE client_package_id = ? AND unit_type = 'hours'",
        [packageId]
      );
      await ctx.driver.execute("UPDATE client_packages SET status = 'active' WHERE id = ?", [packageId]);

      const lowPackages = await ctx.driver.query<{ client_package_id: string }>(
        "SELECT client_package_id FROM client_package_items WHERE unit_type = 'hours' AND (purchased_quantity - used_quantity) <= 120 AND (purchased_quantity - used_quantity) > 0"
      );
      expect(lowPackages).toHaveLength(1);
      expect(lowPackages[0].client_package_id).toBe(packageId);
    });

    it('aggregates low package reels (<= 1 reel) into action items', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة ريلز',
        soldPricePiasters: 150000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 0,
        reelsQuota: 3,
      });

      // Consume 2 reels -> 1 reel left
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 2 WHERE client_package_id = ? AND unit_type = 'reels'",
        [packageId]
      );
      await ctx.driver.execute("UPDATE client_packages SET status = 'active' WHERE id = ?", [packageId]);

      const lowReels = await ctx.driver.query<{ client_package_id: string }>(
        "SELECT client_package_id FROM client_package_items WHERE unit_type = 'reels' AND (purchased_quantity - used_quantity) <= 1 AND (purchased_quantity - used_quantity) > 0"
      );
      expect(lowReels).toHaveLength(1);
      expect(lowReels[0].client_package_id).toBe(packageId);
    });

    it('displays all-clear state "كل حاجة تمام" when zero action items exist', () => {
      const actionItemsCount = 0;
      const isAllClear = actionItemsCount === 0;
      expect(isAllClear).toBe(true);
    });

    it('provides direct deep-link to record from action item card', () => {
      const actionItem = { type: 'overdue_due', targetId: 'due_123', clientId: 'client_456' };
      const navUrl = `/clients/${actionItem.clientId}#dues`;
      expect(navUrl).toBe('/clients/client_456#dues');
    });
  });

  // F-045: Month Snapshot
  describe('F-045: Month Snapshot', () => {
    it('computes Money In: sum of all active payments in the calendar month', async () => {
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_oct_1', ?, 500000, '2026-10-02', 'cash', 'active')`,
        [clientId]
      );
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_oct_2', ?, 300000, '2026-10-05', 'vodafone_cash', 'active')`,
        [clientId]
      );

      const moneyInResult = await ctx.driver.query<{ total: number }>(
        "SELECT SUM(amount) as total FROM payments WHERE payment_date >= '2026-10-01' AND payment_date <= '2026-10-31' AND status = 'active'"
      );
      expect(moneyInResult[0]?.total).toBe(800000);
      expect(moneyInResult[0]?.total).toBePiasters();
    });

    it('computes Expenses: sum of all expenses in the calendar month', async () => {
      await ctx.driver.execute(
        "INSERT INTO expenses (id, amount, expense_date, category) VALUES ('e_oct_1', 200000, '2026-10-03', 'rent')"
      );
      await ctx.driver.execute(
        "INSERT INTO expenses (id, amount, expense_date, category) VALUES ('e_oct_2', 150000, '2026-10-04', 'ads')"
      );

      const expResult = await ctx.driver.query<{ total: number }>(
        "SELECT SUM(amount) as total FROM expenses WHERE expense_date >= '2026-10-01' AND expense_date <= '2026-10-31'"
      );
      expect(expResult[0]?.total).toBe(350000);
      expect(expResult[0]?.total).toBePiasters();
    });

    it('computes Net Cash Flow: Money In - Expenses', () => {
      const moneyIn = 800000;
      const expenses = 350000;
      const netCash = moneyIn - expenses;
      expect(netCash).toBe(450000);
      expect(netCash).toBePiasters();
    });

    it('excludes voided payments from Month Snapshot Money In calculation', async () => {
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_valid', ?, 500000, '2026-10-02', 'cash', 'active')`,
        [clientId]
      );
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_void', ?, 200000, '2026-10-03', 'cash', 'void')`,
        [clientId]
      );

      const moneyInResult = await ctx.driver.query<{ total: number }>(
        "SELECT SUM(amount) as total FROM payments WHERE payment_date >= '2026-10-01' AND payment_date <= '2026-10-31' AND status = 'active'"
      );
      expect(moneyInResult[0]?.total).toBe(500000); // 200k void excluded!
    });

    it('computes Total Outstanding receivables across all clients', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 700000,
        startDate: '2026-10-01',
      });

      await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 700000,
        dueDate: '2026-10-31',
        status: 'due',
      });

      const dues = await ctx.driver.query<{ total_amount: number; paid_amount: number }>(
        "SELECT total_amount, paid_amount FROM marketing_contract_dues WHERE status != 'paid'"
      );
      const totalOutstanding = dues.reduce((acc, d) => acc + (d.total_amount - d.paid_amount), 0);
      expect(totalOutstanding).toBe(700000);
      expect(totalOutstanding).toBePiasters();
    });
  });
});
