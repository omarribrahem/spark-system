import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';

describe('Tier 3 Interaction: Booking Cancellation x Unit Restoration x Calendar Slot Reopen', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let packageFixture: PackageFixture;
  let bookingFixture: BookingFixture;
  let client1: string;
  let client2: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    packageFixture = new PackageFixture(ctx.driver);
    bookingFixture = new BookingFixture(ctx.driver);

    client1 = await clientFixture.create({ name: 'العميل الأول' });
    client2 = await clientFixture.create({ name: 'العميل الثاني' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('cancels scheduled booking, restores package units, and unblocks conflicting slot for second client', async () => {
    // 1. Client 1 has active package with 480 mins (8 hours)
    const { packageId } = await packageFixture.sellPackage({
      clientId: client1,
      packageName: 'باقة 8 ساعات',
      soldPricePiasters: 240000,
      purchaseDate: '2026-10-01',
      hoursMinutesQuota: 480,
    });

    // 2. Client 1 books 14:00 - 16:00 (120 mins)
    const b1 = await bookingFixture.createBooking({
      clientId: client1,
      packageId,
      bookingDate: '2026-10-15',
      startTime: '14:00',
      endTime: '16:00',
    });

    let summary1 = await packageFixture.getPackageSummary(packageId);
    expect(summary1.hoursReserved).toBe(120);
    expect(summary1.hoursAvailable).toBe(360);

    // 3. Client 2 attempts booking 15:00 - 17:00 (overlaps with Client 1) -> MUST FAIL
    await expect(
      bookingFixture.createBooking({
        clientId: client2,
        bookingDate: '2026-10-15',
        startTime: '15:00',
        endTime: '17:00',
      })
    ).rejects.toThrow('يوجد حجز آخر في نفس الوقت');

    // 4. Client 1 cancels their booking
    await bookingFixture.cancelBooking(b1, 'إلغاء لظروف طارئة');

    // Verify package reserved hours restored back to 0, available back to 480
    summary1 = await packageFixture.getPackageSummary(packageId);
    expect(summary1.hoursReserved).toBe(0);
    expect(summary1.hoursAvailable).toBe(480);

    // 5. Client 2 retries booking 15:00 - 17:00 -> MUST NOW SUCCEED!
    const b2 = await bookingFixture.createBooking({
      clientId: client2,
      bookingDate: '2026-10-15',
      startTime: '15:00',
      endTime: '17:00',
    });
    expect(b2).toBeDefined();

    const activeBookings = await ctx.driver.query<{ id: string; client_id: string }>(
      "SELECT id, client_id FROM studio_bookings WHERE booking_date = '2026-10-15' AND status != 'cancelled'"
    );
    expect(activeBookings).toHaveLength(1);
    expect(activeBookings[0].client_id).toBe(client2);
  });
});
