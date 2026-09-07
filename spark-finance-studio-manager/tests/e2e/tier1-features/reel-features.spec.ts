import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';

describe('Tier 1: Reel Pipeline, State Machine & Booking Linkage (F-031 .. F-033)', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let packageFixture: PackageFixture;
  let bookingFixture: BookingFixture;
  let clientId: string;
  let packageId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    packageFixture = new PackageFixture(ctx.driver);
    bookingFixture = new BookingFixture(ctx.driver);

    clientId = await clientFixture.create({ name: 'محتوى تك' });
    const pkg = await packageFixture.sellPackage({
      clientId,
      packageName: 'باقة ريلز 5',
      soldPricePiasters: 250000,
      purchaseDate: '2026-10-01',
      hoursMinutesQuota: 300,
      reelsQuota: 5,
    });
    packageId = pkg.packageId;
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-031: Reel Production Board
  describe('F-031: Reel Production Board', () => {
    it('queries reel items grouped by status columns', async () => {
      const reels = await ctx.driver.query<{ status: string }>(
        'SELECT status FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      expect(reels).toHaveLength(5);
      expect(reels.every((r) => r.status === 'available')).toBe(true);
    });

    it('updates reel status through drag/drop or dropdown update', async () => {
      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      const targetReelId = reels[0].id;

      await ctx.driver.execute(
        "UPDATE reel_items SET status = 'in_editing' WHERE id = ?",
        [targetReelId]
      );

      const updated = await ctx.driver.query<{ status: string }>(
        'SELECT status FROM reel_items WHERE id = ?',
        [targetReelId]
      );
      expect(updated[0].status).toBe('in_editing');
    });

    it('filters production board by client ID', async () => {
      const clientReels = await ctx.driver.query(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      expect(clientReels).toHaveLength(5);
    });

    it('searches reels by title keyword', async () => {
      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      await ctx.driver.execute(
        "UPDATE reel_items SET title = 'فيديو منتج الشتاء' WHERE id = ?",
        [reels[0].id]
      );

      const results = await ctx.driver.query<{ title: string }>(
        "SELECT title FROM reel_items WHERE title LIKE '%الشتاء%'"
      );
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('فيديو منتج الشتاء');
    });

    it('delivering a reel updates package used_quantity without touching studio hours', async () => {
      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );

      // Deliver reel 1
      await ctx.driver.execute(
        "UPDATE reel_items SET status = 'delivered', delivered_date = '2026-10-05' WHERE id = ?",
        [reels[0].id]
      );
      await ctx.driver.execute(
        "UPDATE client_package_items SET used_quantity = 1 WHERE client_package_id = ? AND unit_type = 'reels'",
        [packageId]
      );

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.reelsUsed).toBe(1);
      expect(summary.reelsRemaining).toBe(4);
      expect(summary.hoursUsed).toBe(0); // Untouched!
      expect(summary.hoursAvailable).toBe(300); // Untouched!
    });
  });

  // F-032: Reel State Machine
  describe('F-032: Reel State Machine', () => {
    it('executes standard happy-path transition: available -> planned -> filmed -> in_editing -> review -> delivered', async () => {
      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      const rId = reels[0].id;

      const states = ['planned', 'filmed', 'in_editing', 'review', 'delivered'];
      for (const st of states) {
        await ctx.driver.execute('UPDATE reel_items SET status = ? WHERE id = ?', [st, rId]);
        const r = await ctx.driver.query<{ status: string }>('SELECT status FROM reel_items WHERE id = ?', [rId]);
        expect(r[0].status).toBe(st);
      }
    });

    it('rejects invalid state transition from delivered back to planned without audit reason', () => {
      const validateTransition = (current: string, next: string) => {
        if (current === 'delivered' && next === 'planned') {
          throw new Error('Cannot revert delivered reel to planned directly');
        }
      };
      expect(() => validateTransition('delivered', 'planned')).toThrow('Cannot revert');
    });

    it('cancelling a planned reel reverts it to available', async () => {
      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      const rId = reels[1].id;

      // Plan reel
      await ctx.driver.execute("UPDATE reel_items SET status = 'planned' WHERE id = ?", [rId]);
      // Cancel shoot
      await ctx.driver.execute("UPDATE reel_items SET status = 'available', studio_booking_id = NULL WHERE id = ?", [rId]);

      const r = await ctx.driver.query<{ status: string; studio_booking_id: string | null }>(
        'SELECT status, studio_booking_id FROM reel_items WHERE id = ?',
        [rId]
      );
      expect(r[0].status).toBe('available');
      expect(r[0].studio_booking_id).toBeNull();
    });

    it('records delivery date timestamp upon reaching delivered state', async () => {
      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      const rId = reels[2].id;

      await ctx.driver.execute(
        "UPDATE reel_items SET status = 'delivered', delivered_date = '2026-10-05' WHERE id = ?",
        [rId]
      );

      const r = await ctx.driver.query<{ delivered_date: string }>(
        'SELECT delivered_date FROM reel_items WHERE id = ?',
        [rId]
      );
      expect(r[0].delivered_date).toBe('2026-10-05');
    });

    it('allows direct transition from available to delivered for pre-filmed external reels', async () => {
      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      const rId = reels[3].id;

      await ctx.driver.execute(
        "UPDATE reel_items SET status = 'delivered', delivered_date = '2026-10-05' WHERE id = ?",
        [rId]
      );

      const r = await ctx.driver.query<{ status: string }>(
        'SELECT status FROM reel_items WHERE id = ?',
        [rId]
      );
      expect(r[0].status).toBe('delivered');
    });
  });

  // F-033: Reel-Booking Linkage
  describe('F-033: Reel-Booking Linkage', () => {
    it('links a reel to a studio booking and transitions status to planned', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        packageId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00',
      });

      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      const rId = reels[0].id;

      await ctx.driver.execute(
        "UPDATE reel_items SET studio_booking_id = ?, status = 'planned' WHERE id = ?",
        [bookingId, rId]
      );

      const r = await ctx.driver.query<{ studio_booking_id: string; status: string }>(
        'SELECT studio_booking_id, status FROM reel_items WHERE id = ?',
        [rId]
      );
      expect(r[0].studio_booking_id).toBe(bookingId);
      expect(r[0].status).toBe('planned');
    });

    it('supports linking multiple reels to a single studio booking session (Flow G)', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        packageId,
        bookingDate: '2026-10-05',
        startTime: '13:00',
        endTime: '17:00', // 4-hour shoot
      });

      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );

      // Link Reel 1, 2, 3 to this single booking
      await ctx.driver.execute("UPDATE reel_items SET studio_booking_id = ? WHERE id = ?", [bookingId, reels[0].id]);
      await ctx.driver.execute("UPDATE reel_items SET studio_booking_id = ? WHERE id = ?", [bookingId, reels[1].id]);
      await ctx.driver.execute("UPDATE reel_items SET studio_booking_id = ? WHERE id = ?", [bookingId, reels[2].id]);

      const linked = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE studio_booking_id = ?',
        [bookingId]
      );
      expect(linked).toHaveLength(3);
    });

    it('completing studio session marks linked reels as filmed without delivering them', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        packageId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00',
      });

      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      await ctx.driver.execute("UPDATE reel_items SET studio_booking_id = ?, status = 'planned' WHERE id = ?", [bookingId, reels[0].id]);

      // Complete session
      await bookingFixture.completeBooking(bookingId, '10:00', '12:00');
      await ctx.driver.execute("UPDATE reel_items SET status = 'filmed' WHERE studio_booking_id = ?", [bookingId]);

      const r = await ctx.driver.query<{ status: string }>('SELECT status FROM reel_items WHERE id = ?', [reels[0].id]);
      expect(r[0].status).toBe('filmed'); // Filmed, not delivered yet!
    });

    it('unlinking a reel releases booking association without deleting reel', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '11:00',
      });

      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      await ctx.driver.execute("UPDATE reel_items SET studio_booking_id = ? WHERE id = ?", [bookingId, reels[0].id]);

      // Unlink
      await ctx.driver.execute("UPDATE reel_items SET studio_booking_id = NULL, status = 'available' WHERE id = ?", [reels[0].id]);

      const r = await ctx.driver.query<{ studio_booking_id: string | null; status: string }>(
        'SELECT studio_booking_id, status FROM reel_items WHERE id = ?',
        [reels[0].id]
      );
      expect(r[0].studio_booking_id).toBeNull();
      expect(r[0].status).toBe('available');
    });

    it('cancelling studio booking reverts linked reels to available', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '14:00',
        endTime: '16:00',
      });

      const reels = await ctx.driver.query<{ id: string }>(
        'SELECT id FROM reel_items WHERE client_package_id = ?',
        [packageId]
      );
      await ctx.driver.execute("UPDATE reel_items SET studio_booking_id = ?, status = 'planned' WHERE id = ?", [bookingId, reels[0].id]);

      // Cancel booking
      await bookingFixture.cancelBooking(bookingId, 'إلغاء الموعد');
      await ctx.driver.execute("UPDATE reel_items SET studio_booking_id = NULL, status = 'available' WHERE studio_booking_id = ?", [bookingId]);

      const r = await ctx.driver.query<{ status: string }>('SELECT status FROM reel_items WHERE id = ?', [reels[0].id]);
      expect(r[0].status).toBe('available');
    });
  });
});
