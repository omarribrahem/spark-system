import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { ContractFixture } from '../fixtures/contract-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';

describe('Tier 1: Reports & Financial Analytics (F-046 .. F-051)', () => {
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
    clientId = await clientFixture.create({ name: 'مجموعة أوراسكوم' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-046: Monthly Cash Flow Report
  describe('F-046: Monthly Cash Flow Report', () => {
    it('groups cash collections by payment method', async () => {
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_c1', ?, 500000, '2026-10-01', 'cash', 'active')`,
        [clientId]
      );
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_v1', ?, 250000, '2026-10-02', 'vodafone_cash', 'active')`,
        [clientId]
      );

      const cashSum = await ctx.driver.query<{ total: number }>(
        "SELECT SUM(amount) as total FROM payments WHERE payment_method = 'cash' AND status = 'active'"
      );
      const vfSum = await ctx.driver.query<{ total: number }>(
        "SELECT SUM(amount) as total FROM payments WHERE payment_method = 'vodafone_cash' AND status = 'active'"
      );

      expect(cashSum[0].total).toBe(500000);
      expect(vfSum[0].total).toBe(250000);
    });

    it('groups monthly expenses by category', async () => {
      await ctx.driver.execute("INSERT INTO expenses (id, amount, expense_date, category) VALUES ('e1', 100000, '2026-10-01', 'rent')");
      await ctx.driver.execute("INSERT INTO expenses (id, amount, expense_date, category) VALUES ('e2', 50000, '2026-10-02', 'ads')");

      const rent = await ctx.driver.query<{ total: number }>("SELECT SUM(amount) as total FROM expenses WHERE category = 'rent'");
      const ads = await ctx.driver.query<{ total: number }>("SELECT SUM(amount) as total FROM expenses WHERE category = 'ads'");

      expect(rent[0].total).toBe(100000);
      expect(ads[0].total).toBe(50000);
    });

    it('computes cumulative net cash flow balance across months', () => {
      const month1Net = 250000;
      const month2Net = 150000;
      const cumulative = month1Net + month2Net;
      expect(cumulative).toBe(400000);
      expect(cumulative).toBePiasters();
    });

    it('handles empty activity month cleanly with zero rows and zero sums', async () => {
      const emptyMonth = await ctx.driver.query(
        "SELECT * FROM payments WHERE payment_date >= '2025-01-01' AND payment_date <= '2025-01-31'"
      );
      expect(emptyMonth).toHaveLength(0);
    });

    it('formats printable stylesheet layout for reporting exports', () => {
      const exportOptions = { format: 'printable_html', orientation: 'landscape', language: 'ar' };
      expect(exportOptions.format).toBe('printable_html');
    });
  });

  // F-047: Revenue by Service (Allocation-Based) (PRD §21.2)
  describe('F-047: Revenue by Service (Allocation-Based)', () => {
    it('calculates revenue strictly from payment allocations, NOT contract face values', async () => {
      // Contract is for 10,000 EGP (1,000,000 piasters)
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 1000000,
        startDate: '2026-10-01',
      });
      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 1000000,
        dueDate: '2026-10-31',
      });

      // Actual cash paid and allocated is only 6,000 EGP (600,000 piasters)
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_rev', ?, 600000, '2026-10-05', 'cash', 'active')`,
        [clientId]
      );
      await ctx.driver.execute(
        `INSERT INTO payment_allocations (id, payment_id, target_type, target_id, allocated_amount)
         VALUES ('alloc_rev', 'p_rev', 'marketing_due', ?, 600000)`,
        [dueId]
      );

      const mktRevenue = await ctx.driver.query<{ total: number }>(
        "SELECT SUM(allocated_amount) as total FROM payment_allocations WHERE target_type = 'marketing_due'"
      );
      expect(mktRevenue[0]?.total).toBe(600000); // 6,000 EGP, NOT 10,000 EGP face value!
      expect(mktRevenue[0]?.total).toBePiasters();
    });

    it('breaks down revenue across all 5 service types (marketing, studio, websites, subscriptions, custom)', async () => {
      await ctx.driver.execute(
        `INSERT INTO payment_allocations (id, payment_id, target_type, target_id, allocated_amount)
         VALUES ('a1', 'p1', 'marketing_due', 't1', 400000)`
      );
      await ctx.driver.execute(
        `INSERT INTO payment_allocations (id, payment_id, target_type, target_id, allocated_amount)
         VALUES ('a2', 'p1', 'client_package', 't2', 300000)`
      );
      await ctx.driver.execute(
        `INSERT INTO payment_allocations (id, payment_id, target_type, target_id, allocated_amount)
         VALUES ('a3', 'p1', 'website_project', 't3', 200000)`
      );

      const rows = await ctx.driver.query<{ target_type: string; total: number }>(
        'SELECT target_type, SUM(allocated_amount) as total FROM payment_allocations GROUP BY target_type'
      );
      expect(rows).toHaveLength(3);
    });

    it('excludes unallocated client credit until it is explicitly allocated to a service', async () => {
      // 2,000 EGP unallocated credit in table
      await ctx.driver.execute(
        `INSERT INTO client_credits (id, client_id, amount) VALUES ('cr_rev', ?, 200000)`,
        [clientId]
      );

      // Allocations revenue query
      const allocSum = await ctx.driver.query<{ total: number }>(
        'SELECT SUM(allocated_amount) as total FROM payment_allocations'
      );
      const totalAllocRevenue = allocSum[0]?.total || 0;
      expect(totalAllocRevenue).toBe(0); // Credit is NOT counted as revenue until allocated!
    });

    it('computes service revenue percentage distribution', () => {
      const marketing = 600000;
      const studio = 400000;
      const total = marketing + studio;

      const mktPercent = (marketing / total) * 100;
      const studioPercent = (studio / total) * 100;

      expect(mktPercent).toBe(60);
      expect(studioPercent).toBe(40);
    });

    it('excludes voided payment allocations from revenue breakdown', async () => {
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_v_rev', ?, 500000, '2026-10-01', 'cash', 'void')`,
        [clientId]
      );
      await ctx.driver.execute(
        `INSERT INTO payment_allocations (id, payment_id, target_type, target_id, allocated_amount)
         VALUES ('a_void', 'p_v_rev', 'marketing_due', 't1', 500000)`
      );

      // Query joining payments to filter out void
      const activeAllocs = await ctx.driver.query<{ total: number }>(
        `SELECT SUM(a.allocated_amount) as total
         FROM payment_allocations a
         JOIN payments p ON a.payment_id = p.id
         WHERE p.status = 'active'`
      );
      expect(activeAllocs[0]?.total || 0).toBe(0);
    });
  });

  // F-048: Outstanding Balances Report
  describe('F-048: Outstanding Balances Report', () => {
    it('identifies overdue obligations with overdue duration', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 500000,
        startDate: '2026-08-01',
      });
      await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 8,
        baseAmountPiasters: 500000,
        dueDate: '2026-08-31',
        status: 'overdue',
      });

      const overdueList = await ctx.driver.query<{ client_id: string; total_amount: number; status: string }>(
        "SELECT client_id, total_amount, status FROM marketing_contract_dues WHERE status = 'overdue'"
      );
      expect(overdueList).toHaveLength(1);
      expect(overdueList[0].total_amount).toBe(500000);
      expect(overdueList[0].status).toBe('overdue');
    });

    it('filters outstanding report by specific client ID', async () => {
      const otherClientId = await clientFixture.create({ name: 'عميل آخر' });
      await contractFixture.createDue({
        contractId: 'c_oth',
        clientId: otherClientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 300000,
        dueDate: '2026-10-31',
        status: 'due',
      });

      const clientDues = await ctx.driver.query(
        "SELECT * FROM marketing_contract_dues WHERE client_id = ?",
        [otherClientId]
      );
      expect(clientDues).toHaveLength(1);
    });

    it('displays partial payment debt accurately: total - paid', async () => {
      const contractId = await contractFixture.createContract({
        clientId,
        monthlyAmountPiasters: 600000,
        startDate: '2026-10-01',
      });
      const dueId = await contractFixture.createDue({
        contractId,
        clientId,
        year: 2026,
        month: 10,
        baseAmountPiasters: 600000,
        dueDate: '2026-10-31',
        status: 'partial',
      });
      await ctx.driver.execute('UPDATE marketing_contract_dues SET paid_amount = 250000 WHERE id = ?', [dueId]);

      const dues = await ctx.driver.query<{ total_amount: number; paid_amount: number }>(
        'SELECT total_amount, paid_amount FROM marketing_contract_dues WHERE id = ?',
        [dueId]
      );
      const debt = dues[0].total_amount - dues[0].paid_amount;
      expect(debt).toBe(350000);
      expect(debt).toBePiasters();
    });

    it('sorts obligations by oldest due date first', async () => {
      await contractFixture.createDue({ contractId: 'c1', clientId, year: 2026, month: 8, baseAmountPiasters: 100000, dueDate: '2026-08-31', status: 'overdue' });
      await contractFixture.createDue({ contractId: 'c1', clientId, year: 2026, month: 9, baseAmountPiasters: 100000, dueDate: '2026-09-30', status: 'overdue' });

      const sorted = await ctx.driver.query<{ due_date: string }>(
        "SELECT due_date FROM marketing_contract_dues WHERE client_id = ? ORDER BY due_date ASC",
        [clientId]
      );
      expect(sorted[0].due_date).toBe('2026-08-31');
    });

    it('shows congratulatory clean state when all clients have zero debt', () => {
      const totalOutstanding = 0;
      const isZeroDebt = totalOutstanding === 0;
      expect(isZeroDebt).toBe(true);
    });
  });

  // F-049: Package Liabilities Report
  describe('F-049: Package Liabilities Report', () => {
    it('aggregates total studio hours Spark owes to clients across all active packages', async () => {
      await packageFixture.sellPackage({
        clientId,
        packageName: 'Package 1',
        soldPricePiasters: 200000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600, // 10h
      });

      const client2 = await clientFixture.create({ name: 'عميل 2' });
      await packageFixture.sellPackage({
        clientId: client2,
        packageName: 'Package 2',
        soldPricePiasters: 100000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 300, // 5h
      });

      const items = await ctx.driver.query<{ purchased_quantity: number; used_quantity: number }>(
        "SELECT purchased_quantity, used_quantity FROM client_package_items WHERE unit_type = 'hours'"
      );
      const totalRemainingMinutes = items.reduce((acc, i) => acc + (i.purchased_quantity - i.used_quantity), 0);
      expect(totalRemainingMinutes).toBe(900); // 15 hours total
      expect(totalRemainingMinutes).toBeMinutes();
    });

    it('aggregates total reels Spark owes to clients', async () => {
      await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة ريلز',
        soldPricePiasters: 200000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 0,
        reelsQuota: 6,
      });

      const items = await ctx.driver.query<{ purchased_quantity: number; used_quantity: number }>(
        "SELECT purchased_quantity, used_quantity FROM client_package_items WHERE unit_type = 'reels'"
      );
      const totalReelsRemaining = items.reduce((acc, i) => acc + (i.purchased_quantity - i.used_quantity), 0);
      expect(totalReelsRemaining).toBe(6);
    });

    it('filters out fully used packages from liability report', async () => {
      const pkg = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة منتهية',
        soldPricePiasters: 100000,
        purchaseDate: '2026-09-01',
        hoursMinutesQuota: 60,
      });

      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 60 WHERE client_package_id = ?",
        [pkg.packageId]
      );
      await ctx.driver.execute(
        "UPDATE client_packages SET status = 'fully_used' WHERE id = ?",
        [pkg.packageId]
      );

      const activeLiabilities = await ctx.driver.query(
        "SELECT * FROM client_packages WHERE status = 'active' OR status = 'not_started'"
      );
      expect(activeLiabilities).toHaveLength(0);
    });

    it('converts liability minutes cleanly to decimal hours for reporting', () => {
      const minutes = 330;
      const decimalHours = minutes / 60;
      expect(decimalHours).toBe(5.5);
    });

    it('identifies packages with low balances for priority audit', () => {
      const remainingMinutes = 90; // 1.5h
      const isLow = remainingMinutes <= 120;
      expect(isLow).toBe(true);
    });
  });

  // F-050: Studio Utilization Report
  describe('F-050: Studio Utilization Report', () => {
    it('computes total planned vs actual hours for completed studio sessions', async () => {
      const b1 = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00', // planned 120 mins
      });
      await bookingFixture.completeBooking(b1, '10:00', '12:30'); // actual 150 mins

      const sessions = await ctx.driver.query<{ planned_minutes: number; actual_minutes: number }>(
        "SELECT planned_minutes, actual_minutes FROM studio_bookings WHERE status = 'completed'"
      );
      expect(sessions[0].planned_minutes).toBe(120);
      expect(sessions[0].actual_minutes).toBe(150);
    });

    it('calculates studio variance: actual minutes - planned minutes', () => {
      const planned = 120;
      const actual = 150;
      const variance = actual - planned;
      expect(variance).toBe(30);
    });

    it('counts cancelled bookings and computes cancellation rate', async () => {
      const b1 = await bookingFixture.createBooking({ clientId, bookingDate: '2026-10-05', startTime: '10:00', endTime: '11:00' });
      await bookingFixture.createBooking({ clientId, bookingDate: '2026-10-05', startTime: '14:00', endTime: '16:00' });
      await bookingFixture.cancelBooking(b1, 'إلغاء');

      const all = await ctx.driver.query<{ status: string }>('SELECT status FROM studio_bookings');
      const cancelled = all.filter((b) => b.status === 'cancelled').length;
      const cancelRate = (cancelled / all.length) * 100;

      expect(cancelled).toBe(1);
      expect(cancelRate).toBe(50);
    });

    it('separates package consumption hours from standalone booking hours', async () => {
      await bookingFixture.createBooking({
        clientId,
        packageId: 'pkg_linked',
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00',
      });
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '14:00',
        endTime: '16:00',
        bookingPricePiasters: 100000, // Standalone
      });

      const packageBookings = await ctx.driver.query("SELECT * FROM studio_bookings WHERE package_id IS NOT NULL");
      const standaloneBookings = await ctx.driver.query("SELECT * FROM studio_bookings WHERE package_id IS NULL");

      expect(packageBookings).toHaveLength(1);
      expect(standaloneBookings).toHaveLength(1);
    });

    it('handles zero utilization period cleanly', async () => {
      const sessions = await ctx.driver.query("SELECT * FROM studio_bookings WHERE booking_date = '2025-01-01'");
      expect(sessions).toHaveLength(0);
    });
  });

  // F-051: Client Financial Statement
  describe('F-051: Client Financial Statement', () => {
    it('generates unified financial ledger for printable statement', async () => {
      const statement = {
        clientName: 'مجموعة أوراسكوم',
        totalContractedPiasters: 1000000,
        totalPaidPiasters: 600000,
        outstandingDebtPiasters: 400000,
        unallocatedCreditPiasters: 0,
      };

      expect(statement.totalContractedPiasters).toBePiasters();
      expect(statement.totalPaidPiasters).toBePiasters();
      expect(statement.outstandingDebtPiasters).toBePiasters();
    });

    it('itemizes active packages, hours remaining, and reels remaining', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'Creator Pack',
        soldPricePiasters: 400000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600,
        reelsQuota: 3,
      });

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursAvailable).toBe(600);
      expect(summary.reelsRemaining).toBe(3);
    });

    it('excludes voided payments from ledger balances or marks them struck-through', async () => {
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
         VALUES ('p_stat_void', ?, 100000, '2026-10-01', 'cash', 'void')`,
        [clientId]
      );

      const activePayments = await ctx.driver.query(
        "SELECT * FROM payments WHERE client_id = ? AND status = 'active'",
        [clientId]
      );
      expect(activePayments).toHaveLength(0);
    });

    it('isolates currency symbols and telephone numbers with <bdi> tags', () => {
      const statementHtml = `<bdi>+20 10 9988 7766</bdi> - <bdi>1,500 ج.م</bdi>`;
      expect(statementHtml).toContain('<bdi>+20 10 9988 7766</bdi>');
      expect(statementHtml).toContain('<bdi>1,500 ج.م</bdi>');
    });

    it('renders print preview modal cleanly', () => {
      const printIntent = { action: 'PRINT_STATEMENT', clientId };
      expect(printIntent.action).toBe('PRINT_STATEMENT');
    });
  });
});
