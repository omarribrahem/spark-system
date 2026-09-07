import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';

/**
 * Scenario 4.4: Studio Booking Cancellation & Package Hour Restoration (BR-012, PRD §61.4 Test 4)
 *
 * Requirements verified:
 * 1. Client has active package with 8 hours available (480 minutes).
 * 2. Books a 2.0-hour studio session (120 minutes); package available drops to 6.0h (360 mins), reserved becomes 2.0h (120 mins).
 * 3. Client cancels session before start; Safaa records cancellation with mandatory reason.
 * 4. System immediately releases reserved hours; available balance restores to 8.0h (480 mins).
 * 5. Time slot is freed on calendar; cancellation is safely logged in SQLite.
 */
describe('Tier 4 Scenario 4.4: Studio Booking Cancellation & Hour Restoration', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let packageFixture: PackageFixture;
  let bookingFixture: BookingFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    packageFixture = new PackageFixture(ctx.driver);
    bookingFixture = new BookingFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'كريم ميديا برودكشن' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('restores reserved package hours back to client package upon session cancellation', async () => {
    // Step 1: Client purchases package with 8 hours (480 minutes)
    const { packageId } = await packageFixture.sellPackage({
      clientId,
      packageName: 'باقة 8 ساعات استوديو',
      soldPricePiasters: 240000,
      purchaseDate: '2026-10-01',
      hoursMinutesQuota: 480,
    });

    let summary = await packageFixture.getPackageSummary(packageId);
    expect(summary.hoursPurchased).toBe(480);
    expect(summary.hoursAvailable).toBe(480);
    expect(summary.hoursReserved).toBe(0);

    // Step 2: Book 2 hours (120 minutes) from 14:00 to 16:00
    const bookingId = await bookingFixture.createBooking({
      clientId,
      packageId,
      bookingDate: '2026-10-12',
      startTime: '14:00',
      endTime: '16:00',
    });

    summary = await packageFixture.getPackageSummary(packageId);
    expect(summary.hoursReserved).toBe(120);
    expect(summary.hoursAvailable).toBe(360); // 6 hours remaining to book

    // Step 3: Client calls to cancel; Safaa triggers cancellation
    const cancelReason = 'طلب العميل تأجيل التصوير لظروف طارئة';
    await bookingFixture.cancelBooking(bookingId, cancelReason);

    // Step 4: Verify package balance restores immediately to 480 minutes
    summary = await packageFixture.getPackageSummary(packageId);
    expect(summary.hoursReserved).toBe(0);
    expect(summary.hoursAvailable).toBe(480); // Exact restoration!
    expect(summary.hoursUsed).toBe(0);

    // Step 5: Verify booking record marked cancelled and slot freed
    const b = await ctx.driver.query<{ status: string; cancel_reason: string }>(
      'SELECT status, cancel_reason FROM studio_bookings WHERE id = ?',
      [bookingId]
    );
    expect(b[0].status).toBe('cancelled');
    expect(b[0].cancel_reason).toBe(cancelReason);

    // Calendar slot 14:00 - 16:00 is now free for another booking
    const activeBookings = await ctx.driver.query(
      "SELECT * FROM studio_bookings WHERE booking_date = '2026-10-12' AND status != 'cancelled'"
    );
    expect(activeBookings).toHaveLength(0);
  });
});
