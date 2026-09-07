import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';
import { PaymentFixture } from '../fixtures/payment-fixture';

/**
 * Scenario 4.1: The Canonical Package C Journey (PRD §13.1, §61.1 Test 1)
 *
 * Requirements verified:
 * 1. Client "Nour Media" purchases Package C (10 hours studio + 3 reels) for 4,000 EGP (400,000 piasters).
 * 2. Client pays 4,000 EGP in full via Vodafone Cash.
 * 3. Safaa books Session 1: 3 hours planned (180 mins). Available drops to 7h; reserved becomes 3h.
 * 4. Session 1 completes with actual duration = 4.5 hours (270 mins). Reel 1 marked "Delivered".
 * 5. Invariant Assertion:
 *    - Financial Balance: 0 EGP due, 4,000 EGP paid.
 *    - Service Balance: Exactly 5.5 hours remaining (330 mins) and 2 reels remaining.
 *    - Package status: 'active' (NOT fully used).
 */
describe('Tier 4 Scenario 4.1: The Canonical Package C Journey', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let packageFixture: PackageFixture;
  let bookingFixture: BookingFixture;
  let paymentFixture: PaymentFixture;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    packageFixture = new PackageFixture(ctx.driver);
    bookingFixture = new BookingFixture(ctx.driver);
    paymentFixture = new PaymentFixture(ctx.driver);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('executes full Package C lifecycle verifying decoupling of financial and service balances', async () => {
    // Step 1: Client registration
    const clientId = await clientFixture.create({
      name: 'نور ميديا (Nour Media)',
      company_name: 'Nour Media Productions',
      phone: '+201012345678',
    });

    // Step 2: Sell Package C: 10 hours (600 mins) + 3 reels for 4,000 EGP (400,000 piasters)
    const { packageId, reelsItemId } = await packageFixture.sellPackage({
      clientId,
      packageName: 'باقة صانع المحتوى الشاملة (Package C)',
      soldPricePiasters: 400000,
      purchaseDate: '2026-10-01',
      hoursMinutesQuota: 600, // 10h
      reelsQuota: 3,          // 3 reels
    });

    let summary = await packageFixture.getPackageSummary(packageId);
    expect(summary.soldPrice).toBe(400000);
    expect(summary.paidAmount).toBe(0);
    expect(summary.hoursPurchased).toBe(600);
    expect(summary.hoursAvailable).toBe(600);
    expect(summary.reelsPurchased).toBe(3);
    expect(summary.reelsRemaining).toBe(3);
    expect(summary.status).toBe('not_started');

    // Step 3: Client pays 4,000 EGP in full via Vodafone Cash
    const { unallocatedCreditPiasters } = await paymentFixture.recordPayment({
      clientId,
      amountPiasters: 400000,
      paymentDate: '2026-10-02',
      paymentMethod: 'vodafone_cash',
      allocations: [
        { targetType: 'client_package', targetId: packageId, amountPiasters: 400000 },
      ],
    });

    expect(unallocatedCreditPiasters).toBe(0);
    summary = await packageFixture.getPackageSummary(packageId);
    expect(summary.paidAmount).toBe(400000); // Fully paid financially!

    // Step 4: Safaa books Session 1: 3 hours planned (180 mins) from 13:00 to 16:00
    const bookingId = await bookingFixture.createBooking({
      clientId,
      packageId,
      bookingDate: '2026-10-05',
      startTime: '13:00',
      endTime: '16:00',
    });

    summary = await packageFixture.getPackageSummary(packageId);
    expect(summary.hoursReserved).toBe(180);
    expect(summary.hoursAvailable).toBe(420); // 7 hours available to book
    expect(summary.hoursUsed).toBe(0);

    // Step 5: Link Reel 1 to this booking session
    const reels = await ctx.driver.query<{ id: string }>(
      'SELECT id FROM reel_items WHERE client_package_id = ? ORDER BY id ASC',
      [packageId]
    );
    const reel1Id = reels[0].id;
    await ctx.driver.execute(
      "UPDATE reel_items SET studio_booking_id = ?, status = 'planned' WHERE id = ?",
      [bookingId, reel1Id]
    );

    // Step 6: Session finishes with actual duration = 4.5 hours (270 mins) from 13:00 to 17:30
    const { actualMinutes } = await bookingFixture.completeBooking(bookingId, '13:00', '17:30');
    expect(actualMinutes).toBe(270);

    // Reel 1 marked filmed, then edited and delivered
    await ctx.driver.execute(
      "UPDATE reel_items SET status = 'delivered', delivered_date = '2026-10-06' WHERE id = ?",
      [reel1Id]
    );
    await ctx.driver.execute(
      "UPDATE client_package_items SET used_quantity = 1 WHERE id = ?",
      [reelsItemId]
    );

    // Step 7: Final Invariant Assertions
    summary = await packageFixture.getPackageSummary(packageId);

    // 1. Financial balance is fully settled:
    expect(summary.paidAmount).toBe(400000);
    expect(summary.soldPrice - summary.paidAmount).toBe(0); // 0 EGP remaining debt

    // 2. Service balance strictly preserves independent tracking:
    expect(summary.hoursPurchased).toBe(600); // 10.0 hours
    expect(summary.hoursUsed).toBe(270);      // 4.5 hours
    expect(summary.hoursReserved).toBe(0);
    expect(summary.hoursAvailable).toBe(330); // 5.5 hours remaining! (330 minutes)
    expect(summary.hoursAvailable).toBeMinutes();

    expect(summary.reelsPurchased).toBe(3);
    expect(summary.reelsUsed).toBe(1);
    expect(summary.reelsRemaining).toBe(2);    // 2 reels remaining!

    // 3. Package status remains 'active' (NOT fully used):
    expect(summary.status).toBe('active');
  });
});
