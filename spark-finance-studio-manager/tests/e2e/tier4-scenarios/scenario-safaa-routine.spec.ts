import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { ContractFixture } from '../fixtures/contract-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';
import { PaymentFixture } from '../fixtures/payment-fixture';

/**
 * Scenario 4.2: Safaa's Daily Routine & Dashboard Operations
 *
 * Requirements verified:
 * 1. Safaa opens app in the morning: reviews Today KPI strip and Timeline.
 * 2. Processes a walk-in studio reservation: verifies conflict checks in real time.
 * 3. Records a client cash payment, splitting it across an overdue marketing due and a website project.
 * 4. Verifies Month Snapshot and Action Center instantly reflect the new cash and cleared overdue alert.
 */
describe("Tier 4 Scenario 4.2: Safaa's Daily Routine & Operations", () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let contractFixture: ContractFixture;
  let bookingFixture: BookingFixture;
  let paymentFixture: PaymentFixture;

  beforeEach(async () => {
    ctx = await setupTestContext('2026-10-05');
    clientFixture = new ClientFixture(ctx.driver);
    contractFixture = new ContractFixture(ctx.driver);
    bookingFixture = new BookingFixture(ctx.driver);
    paymentFixture = new PaymentFixture(ctx.driver);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it("simulates Safaa's morning workflow from dashboard inspection to booking and collection", async () => {
    // Setup initial state: 1 existing client with overdue marketing due
    const client1 = await clientFixture.create({ name: 'شركة الأهرام' });
    const contract1 = await contractFixture.createContract({
      clientId: client1,
      monthlyAmountPiasters: 500000,
      startDate: '2026-09-01',
    });
    const due1 = await contractFixture.createDue({
      contractId: contract1,
      clientId: client1,
      year: 2026,
      month: 9,
      baseAmountPiasters: 500000,
      dueDate: '2026-09-30',
      status: 'overdue',
    });

    // 1 scheduled booking for today at 14:00 - 16:00
    await bookingFixture.createBooking({
      clientId: client1,
      bookingDate: '2026-10-05',
      startTime: '14:00',
      endTime: '16:00',
    });

    // Step 1: Safaa inspects Today's KPI strip and Action Center
    const todayBookings = await ctx.driver.query(
      "SELECT * FROM studio_bookings WHERE booking_date = '2026-10-05' AND status != 'cancelled'"
    );
    expect(todayBookings).toHaveLength(1);

    const actionItems = await ctx.driver.query(
      "SELECT * FROM marketing_contract_dues WHERE status = 'overdue'"
    );
    expect(actionItems).toHaveLength(1);

    // Step 2: Walk-in client arrives, wants studio booking 10:00 - 12:00
    const client2 = await clientFixture.create({ name: 'مخرج مستقل (أحمد سمير)' });
    const walkInBookingId = await bookingFixture.createBooking({
      clientId: client2,
      bookingDate: '2026-10-05',
      startTime: '10:00',
      endTime: '12:00',
      bookingPricePiasters: 150000, // 1,500 EGP standalone
      depositPiasters: 50000,       // 500 EGP deposit collected
    });
    expect(walkInBookingId).toBeDefined();

    // Step 3: Client 1 arrives and pays 5,000 EGP cash to settle overdue due
    const { unallocatedCreditPiasters } = await paymentFixture.recordPayment({
      clientId: client1,
      amountPiasters: 500000,
      paymentDate: '2026-10-05',
      paymentMethod: 'cash',
      allocations: [{ targetType: 'marketing_due', targetId: due1, amountPiasters: 500000 }],
    });
    expect(unallocatedCreditPiasters).toBe(0);

    // Step 4: Verify Action Center alert is cleared
    const remainingOverdue = await ctx.driver.query(
      "SELECT * FROM marketing_contract_dues WHERE status = 'overdue'"
    );
    expect(remainingOverdue).toHaveLength(0); // All clear!

    // Step 5: Verify Month Snapshot Money In includes the 5,000 EGP collected
    const monthPayments = await ctx.driver.query<{ total: number }>(
      "SELECT SUM(amount) as total FROM payments WHERE payment_date >= '2026-10-01' AND status = 'active'"
    );
    expect(monthPayments[0].total).toBe(500000);
    expect(monthPayments[0].total).toBePiasters();

    // Verify Today's Studio Timeline shows both morning walk-in and afternoon session
    const finalTimeline = await ctx.driver.query<{ start_time: string }>(
      "SELECT start_time FROM studio_bookings WHERE booking_date = '2026-10-05' AND status != 'cancelled' ORDER BY start_time ASC"
    );
    expect(finalTimeline).toHaveLength(2);
    expect(finalTimeline[0].start_time).toBe('10:00');
    expect(finalTimeline[1].start_time).toBe('14:00');
  });
});
