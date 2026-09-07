import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';

/**
 * Scenario 4.3: Studio Booking Overlap Hard Blocking (BR-026, PRD §61.8 Test 8)
 *
 * Requirements verified:
 * 1. Existing confirmed studio booking from 14:00 to 16:00 on 2026-10-10.
 * 2. Attempted conflicting booking from 15:00 to 17:00 is rejected with localized Arabic error.
 * 3. Attempted enclosing booking from 13:00 to 17:00 is rejected.
 * 4. Rescheduling to non-conflicting adjacent slot 16:00 to 18:00 is accepted and committed cleanly.
 */
describe('Tier 4 Scenario 4.3: Studio Booking Overlap Hard Blocking', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let bookingFixture: BookingFixture;
  let client1: string;
  let client2: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    bookingFixture = new BookingFixture(ctx.driver);
    client1 = await clientFixture.create({ name: 'العميل أ (حجز مؤكد)' });
    client2 = await clientFixture.create({ name: 'العميل ب (محاولة حجز متعارض)' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('hard blocks all overlapping booking attempts and allows clean adjacent booking', async () => {
    const bookingDate = '2026-10-10';

    // Step 1: Create confirmed base booking [14:00, 16:00)
    const baseBookingId = await bookingFixture.createBooking({
      clientId: client1,
      bookingDate,
      startTime: '14:00',
      endTime: '16:00',
      status: 'confirmed',
    });
    expect(baseBookingId).toBeDefined();

    // Step 2: Conflict Test A - Partial Overlap [15:00, 17:00)
    await expect(
      bookingFixture.createBooking({
        clientId: client2,
        bookingDate,
        startTime: '15:00',
        endTime: '17:00',
      })
    ).rejects.toThrow('يوجد حجز آخر في نفس الوقت');

    // Step 3: Conflict Test B - Enclosing Overlap [13:00, 17:00)
    await expect(
      bookingFixture.createBooking({
        clientId: client2,
        bookingDate,
        startTime: '13:00',
        endTime: '17:00',
      })
    ).rejects.toThrow('يوجد حجز آخر في نفس الوقت');

    // Step 4: Conflict Test C - Enclosed Overlap [14:30, 15:30)
    await expect(
      bookingFixture.createBooking({
        clientId: client2,
        bookingDate,
        startTime: '14:30',
        endTime: '15:30',
      })
    ).rejects.toThrow('يوجد حجز آخر في نفس الوقت');

    // Step 5: Conflict Test D - 1-minute overlap [13:00, 14:01)
    await expect(
      bookingFixture.createBooking({
        clientId: client2,
        bookingDate,
        startTime: '13:00',
        endTime: '14:01',
      })
    ).rejects.toThrow('يوجد حجز آخر في نفس الوقت');

    // Step 6: Valid Adjacent Booking [16:00, 18:00) -> MUST SUCCEED!
    const adjacentBookingId = await bookingFixture.createBooking({
      clientId: client2,
      bookingDate,
      startTime: '16:00',
      endTime: '18:00',
      status: 'scheduled',
    });
    expect(adjacentBookingId).toBeDefined();

    // Verify exactly 2 active bookings exist for that day in SQLite
    const activeBookings = await ctx.driver.query<{ start_time: string; end_time: string }>(
      "SELECT start_time, end_time FROM studio_bookings WHERE booking_date = ? AND status != 'cancelled' ORDER BY start_time ASC",
      [bookingDate]
    );
    expect(activeBookings).toHaveLength(2);
    expect(activeBookings[0].start_time).toBe('14:00');
    expect(activeBookings[0].end_time).toBe('16:00');
    expect(activeBookings[1].start_time).toBe('16:00');
    expect(activeBookings[1].end_time).toBe('18:00');
  });
});
