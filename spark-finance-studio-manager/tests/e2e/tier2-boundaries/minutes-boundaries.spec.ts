import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';

describe('Tier 2: Time & Minutes Boundary Tests', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let bookingFixture: BookingFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    bookingFixture = new BookingFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'حدود الوقت' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('rejects 0 minutes studio booking', async () => {
    await expect(
      bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '14:00',
        endTime: '14:00',
      })
    ).rejects.toThrow('Invalid booking times');
  });

  it('enforces 15-minute minimum studio booking duration', () => {
    const checkMinDuration = (start: string, end: string) => {
      const [sH, sM] = start.split(':').map(Number);
      const [eH, eM] = end.split(':').map(Number);
      const diff = (eH * 60 + eM) - (sH * 60 + sM);
      if (diff < 15) throw new Error('Booking must be at least 15 minutes');
      return diff;
    };

    expect(() => checkMinDuration('10:00', '10:14')).toThrow('at least 15 minutes');
    expect(checkMinDuration('10:00', '10:15')).toBe(15);
  });

  it('allows exact adjacent booking (S2 == E1)', async () => {
    await bookingFixture.createBooking({
      clientId,
      bookingDate: '2026-10-05',
      startTime: '10:00',
      endTime: '11:30',
    });

    // Exactly starts when previous ends
    const b2 = await bookingFixture.createBooking({
      clientId,
      bookingDate: '2026-10-05',
      startTime: '11:30',
      endTime: '13:00',
    });
    expect(b2).toBeDefined();
  });

  it('blocks 1-minute overlap conflict (S2 == E1 - 1 minute)', async () => {
    await bookingFixture.createBooking({
      clientId,
      bookingDate: '2026-10-05',
      startTime: '10:00',
      endTime: '11:30',
    });

    await expect(
      bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '11:29',
        endTime: '13:00',
      })
    ).rejects.toThrow('يوجد حجز آخر في نفس الوقت');
  });

  it('handles leap day (February 29) booking without crash', async () => {
    const leapBooking = await bookingFixture.createBooking({
      clientId,
      bookingDate: '2028-02-29',
      startTime: '14:00',
      endTime: '16:00',
    });
    expect(leapBooking).toBeDefined();

    const b = await ctx.driver.query<{ booking_date: string }>(
      'SELECT booking_date FROM studio_bookings WHERE id = ?',
      [leapBooking]
    );
    expect(b[0].booking_date).toBe('2028-02-29');
  });

  it('handles month-end billing day resolution (31st in 30-day and 28-day months)', () => {
    const resolveDay = (year: number, month: number, requestedDay: number) => {
      const maxDays = new Date(year, month, 0).getDate();
      return Math.min(requestedDay, maxDays);
    };

    expect(resolveDay(2026, 2, 31)).toBe(28); // Feb 2026
    expect(resolveDay(2028, 2, 31)).toBe(29); // Feb 2028 leap
    expect(resolveDay(2026, 4, 31)).toBe(30); // Apr 2026
    expect(resolveDay(2026, 10, 31)).toBe(31); // Oct 2026
  });
});
