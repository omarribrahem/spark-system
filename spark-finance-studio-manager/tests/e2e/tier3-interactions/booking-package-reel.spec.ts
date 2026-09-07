import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';

describe('Tier 3 Interaction: Studio Booking x Package Minutes x Reel Pipeline Linkage', () => {
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
    clientId = await clientFixture.create({ name: 'محتوى بودكاست' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('links studio booking to package hours and multiple reel items with decoupled balance tracking', async () => {
    // 1. Client purchases Package C: 10 hours studio (600 mins) + 3 reels for 4,000 EGP
    const { packageId } = await packageFixture.sellPackage({
      clientId,
      packageName: 'باقة صانع المحتوى الشاملة',
      soldPricePiasters: 400000,
      purchaseDate: '2026-10-01',
      hoursMinutesQuota: 600,
      reelsQuota: 3,
    });

    // 2. Safaa creates Studio Booking for 3.0 hours (180 mins)
    const bookingId = await bookingFixture.createBooking({
      clientId,
      packageId,
      bookingDate: '2026-10-05',
      startTime: '13:00',
      endTime: '16:00',
    });

    // Verify package reserved hours: available drops to 7h (420m), reserved is 3h (180m)
    let summary = await packageFixture.getPackageSummary(packageId);
    expect(summary.hoursReserved).toBe(180);
    expect(summary.hoursAvailable).toBe(420);
    expect(summary.reelsRemaining).toBe(3);

    // 3. Link Reel 1 and Reel 2 to this booking session
    const reels = await ctx.driver.query<{ id: string }>(
      'SELECT id FROM reel_items WHERE client_package_id = ?',
      [packageId]
    );
    await ctx.driver.execute(
      "UPDATE reel_items SET studio_booking_id = ?, status = 'planned' WHERE id IN (?, ?)",
      [bookingId, reels[0].id, reels[1].id]
    );

    // 4. Session completes with actual duration = 3.5 hours (210 mins) from 13:00 to 16:30
    await bookingFixture.completeBooking(bookingId, '13:00', '16:30');

    // Reel 1 and Reel 2 are filmed
    await ctx.driver.execute(
      "UPDATE reel_items SET status = 'filmed' WHERE studio_booking_id = ?",
      [bookingId]
    );

    // Verify hours consumed (210m), but reels remaining is STILL 3 (not delivered yet!)
    summary = await packageFixture.getPackageSummary(packageId);
    expect(summary.hoursUsed).toBe(210);
    expect(summary.hoursAvailable).toBe(390); // 6.5 hours remaining
    expect(summary.reelsUsed).toBe(0);        // Decoupled!
    expect(summary.reelsRemaining).toBe(3);   // Decoupled!

    // 5. Two days later, Reel 1 finishes editing and is delivered
    await ctx.driver.execute(
      "UPDATE reel_items SET status = 'delivered', delivered_date = '2026-10-07' WHERE id = ?",
      [reels[0].id]
    );
    await ctx.driver.execute(
      "UPDATE client_package_items SET used_quantity = 1 WHERE client_package_id = ? AND unit_type = 'reels'",
      [packageId]
    );

    // Verify reels consumed (1), reels remaining (2), hours remaining STILL 390 mins!
    summary = await packageFixture.getPackageSummary(packageId);
    expect(summary.reelsUsed).toBe(1);
    expect(summary.reelsRemaining).toBe(2);
    expect(summary.hoursUsed).toBe(210);
    expect(summary.hoursAvailable).toBe(390);
    expect(summary.status).toBe('active');
  });
});
