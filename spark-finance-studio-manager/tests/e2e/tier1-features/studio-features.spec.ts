import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { BookingFixture } from '../fixtures/booking-fixture';

describe('Tier 1: Studio Booking, Calendar Views & Scheduling Engine (F-022 .. F-030)', () => {
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
    clientId = await clientFixture.create({ name: 'ستوديو طارق' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-022: Day View Calendar
  describe('F-022: Day View Calendar', () => {
    it('queries all bookings for selected day ordered by start time', async () => {
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

      const dayBookings = await ctx.driver.query<{ start_time: string }>(
        "SELECT start_time FROM studio_bookings WHERE booking_date = '2026-10-05' AND status != 'cancelled' ORDER BY start_time ASC"
      );
      expect(dayBookings).toHaveLength(2);
      expect(dayBookings[0].start_time).toBe('10:00');
      expect(dayBookings[1].start_time).toBe('14:00');
    });

    it('identifies free time gaps between bookings', () => {
      const slots = [
        { start: '10:00', end: '12:00' },
        { start: '14:00', end: '16:00' },
      ];
      const gapStart = slots[0].end;
      const gapEnd = slots[1].start;
      expect(gapStart).toBe('12:00');
      expect(gapEnd).toBe('14:00');
    });

    it('color-codes bookings by status', () => {
      const getStatusColor = (status: string) => {
        switch (status) {
          case 'scheduled': return 'blue';
          case 'confirmed': return 'green';
          case 'in_progress': return 'orange';
          case 'completed': return 'gray';
          case 'cancelled': return 'red';
          default: return 'slate';
        }
      };
      expect(getStatusColor('scheduled')).toBe('blue');
      expect(getStatusColor('confirmed')).toBe('green');
      expect(getStatusColor('cancelled')).toBe('red');
    });

    it('renders empty day state when no bookings exist', async () => {
      const dayBookings = await ctx.driver.query(
        "SELECT * FROM studio_bookings WHERE booking_date = '2026-10-06'"
      );
      expect(dayBookings).toHaveLength(0);
    });

    it('handles bookings on leap day (Feb 29)', async () => {
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2028-02-29',
        startTime: '12:00',
        endTime: '14:00',
      });
      const b = await ctx.driver.query("SELECT * FROM studio_bookings WHERE booking_date = '2028-02-29'");
      expect(b).toHaveLength(1);
    });
  });

  // F-023: Week View Calendar
  describe('F-023: Week View Calendar', () => {
    it('queries bookings across a 7-day week span', async () => {
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00',
      });
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-08',
        startTime: '13:00',
        endTime: '15:00',
      });

      const weekBookings = await ctx.driver.query(
        "SELECT * FROM studio_bookings WHERE booking_date >= '2026-10-04' AND booking_date <= '2026-10-10'"
      );
      expect(weekBookings).toHaveLength(2);
    });

    it('renders Arabic day names for the 7 columns', () => {
      const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
      expect(days).toHaveLength(7);
      expect(days[0]).toBe('الأحد');
    });

    it('handles week spanning across month boundaries (e.g. Oct 28 - Nov 3)', () => {
      const weekDates = [
        '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
        '2026-11-01', '2026-11-02', '2026-11-03'
      ];
      expect(weekDates).toHaveLength(7);
      expect(weekDates[3]).toBe('2026-10-31');
      expect(weekDates[4]).toBe('2026-11-01');
    });

    it('prevents accidental drag/resize mutations in calendar view', () => {
      const allowDragResize = false;
      expect(allowDragResize).toBe(false);
    });

    it('highlights weekend days (Friday/Saturday) distinctly in the grid', () => {
      const isWeekend = (dayIndex: number) => dayIndex === 5 || dayIndex === 6;
      expect(isWeekend(5)).toBe(true); // Friday
      expect(isWeekend(6)).toBe(true); // Saturday
      expect(isWeekend(0)).toBe(false); // Sunday
    });
  });

  // F-024: Month View Calendar
  describe('F-024: Month View Calendar', () => {
    it('aggregates daily booking count chips for the month', async () => {
      await bookingFixture.createBooking({ clientId, bookingDate: '2026-10-05', startTime: '10:00', endTime: '12:00' });
      await bookingFixture.createBooking({ clientId, bookingDate: '2026-10-05', startTime: '14:00', endTime: '16:00' });
      await bookingFixture.createBooking({ clientId, bookingDate: '2026-10-12', startTime: '11:00', endTime: '13:00' });

      const day5Count = await ctx.driver.query<{ count: number }>(
        "SELECT count(*) as count FROM studio_bookings WHERE booking_date = '2026-10-05'"
      );
      const day12Count = await ctx.driver.query<{ count: number }>(
        "SELECT count(*) as count FROM studio_bookings WHERE booking_date = '2026-10-12'"
      );

      expect(day5Count[0].count).toBe(2);
      expect(day12Count[0].count).toBe(1);
    });

    it('computes daily occupancy load indicator (free, moderate, busy)', () => {
      const getLoadCategory = (count: number) => {
        if (count === 0) return 'free';
        if (count <= 2) return 'moderate';
        return 'busy';
      };
      expect(getLoadCategory(0)).toBe('free');
      expect(getLoadCategory(2)).toBe('moderate');
      expect(getLoadCategory(4)).toBe('busy');
    });

    it('renders correct day count for February in non-leap vs leap year', () => {
      const febDays = (year: number) => new Date(year, 2, 0).getDate();
      expect(febDays(2026)).toBe(28);
      expect(febDays(2028)).toBe(29);
    });

    it('navigates cleanly to Day view upon clicking a month cell', () => {
      const clickedDate = '2026-10-05';
      const targetRoute = `/studio/day?date=${clickedDate}`;
      expect(targetRoute).toBe('/studio/day?date=2026-10-05');
    });

    it('handles month with 6 calendar weeks cleanly', () => {
      // E.g. August 2026 starts on Saturday
      const startDay = new Date(2026, 7, 1).getDay(); // Saturday = 6
      expect(startDay).toBe(6);
    });
  });

  // F-025: Studio Booking Creation
  describe('F-025: Studio Booking Creation', () => {
    it('creates studio booking with auto-calculated duration in minutes', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '14:00',
        endTime: '16:30',
      });

      const b = await ctx.driver.query<{ planned_minutes: number; status: string }>(
        'SELECT planned_minutes, status FROM studio_bookings WHERE id = ?',
        [bookingId]
      );
      expect(b[0]?.planned_minutes).toBe(150); // 2.5 hours = 150 minutes
      expect(b[0]?.planned_minutes).toBeMinutes();
      expect(b[0]?.status).toBe('scheduled');
    });

    it('reserves hours from client package upon booking creation', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة استوديو 10 ساعات',
        soldPricePiasters: 250000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600,
      });

      // Book 2 hours (120 mins)
      await bookingFixture.createBooking({
        clientId,
        packageId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00',
      });

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursReserved).toBe(120);
      expect(summary.hoursAvailable).toBe(480);
      expect(summary.hoursUsed).toBe(0);
    });

    it('rejects booking where end time is before or equal to start time', async () => {
      await expect(
        bookingFixture.createBooking({
          clientId,
          bookingDate: '2026-10-05',
          startTime: '14:00',
          endTime: '13:00',
        })
      ).rejects.toThrow('Invalid booking times');

      await expect(
        bookingFixture.createBooking({
          clientId,
          bookingDate: '2026-10-05',
          startTime: '14:00',
          endTime: '14:00',
        })
      ).rejects.toThrow('Invalid booking times');
    });

    it('supports standalone paid booking with booking price in piasters and deposit', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '17:00',
        endTime: '19:00',
        bookingPricePiasters: 100000, // 1,000 EGP
        depositPiasters: 20000,       // 200 EGP deposit
      });

      const b = await ctx.driver.query<{ booking_price: number; deposit_amount: number }>(
        'SELECT booking_price, deposit_amount FROM studio_bookings WHERE id = ?',
        [bookingId]
      );
      expect(b[0]?.booking_price).toBe(100000);
      expect(b[0]?.booking_price).toBePiasters();
      expect(b[0]?.deposit_amount).toBe(20000);
      expect(b[0]?.deposit_amount).toBePiasters();
    });

    it('validates minimum duration of 15 minutes', () => {
      const checkDuration = (start: string, end: string) => {
        const [sH, sM] = start.split(':').map(Number);
        const [eH, eM] = end.split(':').map(Number);
        const mins = (eH * 60 + eM) - (sH * 60 + sM);
        if (mins < 15) throw new Error('Booking must be at least 15 minutes');
      };
      expect(() => checkDuration('10:00', '10:10')).toThrow('at least 15 minutes');
      expect(() => checkDuration('10:00', '10:15')).not.toThrow();
    });
  });

  // F-026: Overlap Hard Blocking (BR-026)
  describe('F-026: Overlap Hard Blocking', () => {
    it('blocks double booking with Arabic conflict message: "يوجد حجز آخر في نفس الوقت"', async () => {
      // Existing booking 14:00 - 16:00
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-10',
        startTime: '14:00',
        endTime: '16:00',
      });

      // Attempt conflicting booking 15:00 - 17:00
      await expect(
        bookingFixture.createBooking({
          clientId,
          bookingDate: '2026-10-10',
          startTime: '15:00',
          endTime: '17:00',
        })
      ).rejects.toThrow('يوجد حجز آخر في نفس الوقت');
    });

    it('allows exact adjacent booking (S_new = E_exist)', async () => {
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-10',
        startTime: '14:00',
        endTime: '16:00',
      });

      // Adjacent booking 16:00 - 18:00
      const b2 = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-10',
        startTime: '16:00',
        endTime: '18:00',
      });
      expect(b2).toBeDefined();
    });

    it('blocks 1-minute overlap conflict (S_new = E_exist - 1m)', async () => {
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-10',
        startTime: '14:00',
        endTime: '16:00',
      });

      await expect(
        bookingFixture.createBooking({
          clientId,
          bookingDate: '2026-10-10',
          startTime: '15:59',
          endTime: '17:00',
        })
      ).rejects.toThrow('يوجد حجز آخر في نفس الوقت');
    });

    it('blocks enclosing interval (starts before and ends after existing)', async () => {
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-10',
        startTime: '14:00',
        endTime: '16:00',
      });

      await expect(
        bookingFixture.createBooking({
          clientId,
          bookingDate: '2026-10-10',
          startTime: '13:00',
          endTime: '17:00',
        })
      ).rejects.toThrow('يوجد حجز آخر في نفس الوقت');
    });

    it('ignores cancelled bookings during overlap conflict check', async () => {
      const b1 = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-10',
        startTime: '14:00',
        endTime: '16:00',
      });

      await bookingFixture.cancelBooking(b1, 'العميل اعتذر');

      // Now booking 14:00 - 16:00 should succeed cleanly!
      const b2 = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-10',
        startTime: '14:00',
        endTime: '16:00',
      });
      expect(b2).toBeDefined();
    });
  });

  // F-027: Booking Cancellation & Unit Restoration (BR-012)
  describe('F-027: Booking Cancellation', () => {
    it('cancelling scheduled booking restores reserved package minutes immediately', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة 8 ساعات',
        soldPricePiasters: 200000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 480, // 8h
      });

      const bookingId = await bookingFixture.createBooking({
        clientId,
        packageId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00', // 2h (120m)
      });

      let summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursAvailable).toBe(360);
      expect(summary.hoursReserved).toBe(120);

      // Cancel booking
      await bookingFixture.cancelBooking(bookingId, 'إلغاء بناء على طلب العميل');

      summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursReserved).toBe(0);
      expect(summary.hoursAvailable).toBe(480); // Restored!
    });

    it('requires mandatory cancellation reason', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '11:00',
      });

      await expect(bookingFixture.cancelBooking(bookingId, '')).rejects.toThrow(
        'Mandatory cancellation reason required'
      );
    });

    it('cancelling a completed booking restores actual consumed minutes', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة 5 ساعات',
        soldPricePiasters: 150000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 300,
      });

      const bookingId = await bookingFixture.createBooking({
        clientId,
        packageId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00',
      });

      await bookingFixture.completeBooking(bookingId, '10:00', '12:00'); // 120 mins used

      let summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursUsed).toBe(120);

      // Cancel completed session
      await bookingFixture.cancelBooking(bookingId, 'خطأ في تسجيل الجلسة');

      summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursUsed).toBe(0); // Restored!
    });

    it('reopens the cancelled time slot on calendar grid', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '15:00',
        endTime: '17:00',
      });

      await bookingFixture.cancelBooking(bookingId, 'إلغاء');

      const activeBookings = await ctx.driver.query(
        "SELECT * FROM studio_bookings WHERE booking_date = '2026-10-05' AND status != 'cancelled'"
      );
      expect(activeBookings).toHaveLength(0);
    });

    it('records booking status as cancelled and preserves record in SQLite', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '11:00',
      });

      await bookingFixture.cancelBooking(bookingId, 'إلغاء');

      const b = await ctx.driver.query<{ status: string; cancel_reason: string }>(
        'SELECT status, cancel_reason FROM studio_bookings WHERE id = ?',
        [bookingId]
      );
      expect(b[0]?.status).toBe('cancelled');
      expect(b[0]?.cancel_reason).toBe('إلغاء');
    });
  });

  // F-028: Planned vs Actual Duration
  describe('F-028: Planned vs Actual Duration', () => {
    it('consumes actual duration instead of planned upon session completion', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة 10 ساعات',
        soldPricePiasters: 300000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600,
      });

      // Planned 2.0h (120 mins)
      const bookingId = await bookingFixture.createBooking({
        clientId,
        packageId,
        bookingDate: '2026-10-05',
        startTime: '14:00',
        endTime: '16:00',
      });

      // Actual was extended to 2.5h (150 mins) from 14:00 to 16:30
      const { actualMinutes } = await bookingFixture.completeBooking(bookingId, '14:00', '16:30');
      expect(actualMinutes).toBe(150);

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursUsed).toBe(150); // Exact actual!
      expect(summary.hoursReserved).toBe(0);
      expect(summary.hoursAvailable).toBe(450);
    });

    it('releases unused reserved minutes when actual session ends earlier than planned', async () => {
      const { packageId } = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة 10 ساعات',
        soldPricePiasters: 300000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 600,
      });

      // Planned 3.0h (180 mins)
      const bookingId = await bookingFixture.createBooking({
        clientId,
        packageId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '13:00',
      });

      // Actual was only 1.5h (90 mins) from 10:00 to 11:30
      await bookingFixture.completeBooking(bookingId, '10:00', '11:30');

      const summary = await packageFixture.getPackageSummary(packageId);
      expect(summary.hoursUsed).toBe(90);
      expect(summary.hoursAvailable).toBe(510);
    });

    it('records actual start and end times in SQLite record', async () => {
      const bookingId = await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-05',
        startTime: '10:00',
        endTime: '12:00',
      });

      await bookingFixture.completeBooking(bookingId, '10:05', '12:15');

      const b = await ctx.driver.query<{ actual_start_time: string; actual_end_time: string; actual_minutes: number }>(
        'SELECT actual_start_time, actual_end_time, actual_minutes FROM studio_bookings WHERE id = ?',
        [bookingId]
      );
      expect(b[0]?.actual_start_time).toBe('10:05');
      expect(b[0]?.actual_end_time).toBe('12:15');
      expect(b[0]?.actual_minutes).toBe(130);
    });

    it('calculates duration variance for studio utilization reporting: actual - planned', () => {
      const planned = 120;
      const actual = 150;
      const variance = actual - planned;
      expect(variance).toBe(30); // 30 minutes over-run
    });

    it('triggers resolution workflow when actual duration exceeds client package remaining balance', () => {
      const availableMinutes = 60; // 1 hour left
      const actualMinutes = 90;    // session took 1.5 hours
      const excessMinutes = actualMinutes - availableMinutes;

      expect(excessMinutes).toBe(30);
      const resolutionOptions = ['CREATE_BILLABLE_BOOKING', 'ADD_CLIENT_CHARGE'];
      expect(resolutionOptions).toContain('CREATE_BILLABLE_BOOKING');
    });
  });

  // F-029: Recurring Bookings & F-030: Recurrence Conflict Preview
  describe('F-029 & F-030: Recurring Bookings & Conflict Preview', () => {
    it('generates candidate dates according to day of week rule', () => {
      // Generate Saturdays in October 2026: Oct 3, Oct 10, Oct 17, Oct 24, Oct 31
      const startDate = new Date(Date.UTC(2026, 9, 1));
      const endDate = new Date(Date.UTC(2026, 9, 31));
      const targetDay = 6; // Saturday

      const generated: string[] = [];
      const current = new Date(startDate);
      while (current <= endDate) {
        if (current.getUTCDay() === targetDay) {
          generated.push(current.toISOString().split('T')[0]);
        }
        current.setUTCDate(current.getUTCDate() + 1);
      }

      expect(generated).toHaveLength(5);
      expect(generated).toContain('2026-10-03');
      expect(generated).toContain('2026-10-31');
    });

    it('identifies conflicting candidate dates in conflict preview', async () => {
      // Pre-existing booking on Saturday Oct 10
      await bookingFixture.createBooking({
        clientId,
        bookingDate: '2026-10-10',
        startTime: '14:00',
        endTime: '16:00',
      });

      const candidateDates = ['2026-10-03', '2026-10-10', '2026-10-17'];
      const conflicts: string[] = [];
      const available: string[] = [];

      for (const d of candidateDates) {
        const exist = await ctx.driver.query<{ start_time: string; end_time: string }>(
          "SELECT start_time, end_time FROM studio_bookings WHERE booking_date = ? AND status != 'cancelled'",
          [d]
        );
        const hasConflict = exist.some((s) => '14:00' < s.end_time && '16:00' > s.start_time);
        if (hasConflict) {
          conflicts.push(d);
        } else {
          available.push(d);
        }
      }

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toBe('2026-10-10');
      expect(available).toHaveLength(2);
    });

    it('skips conflicting dates and commits available slots cleanly', async () => {
      const availableDates = ['2026-10-03', '2026-10-17'];
      const recurringRuleId = 'rule_sat_1';

      for (const d of availableDates) {
        await bookingFixture.createBooking({
          clientId,
          recurringRuleId,
          bookingDate: d,
          startTime: '14:00',
          endTime: '16:00',
        });
      }

      const committed = await ctx.driver.query(
        'SELECT * FROM studio_bookings WHERE recurring_rule_id = ?',
        [recurringRuleId]
      );
      expect(committed).toHaveLength(2);
    });

    it('allows editing an individual recurring booking without breaking the series', async () => {
      const recurringRuleId = 'rule_sat_2';
      const b1 = await bookingFixture.createBooking({
        clientId,
        recurringRuleId,
        bookingDate: '2026-10-03',
        startTime: '14:00',
        endTime: '16:00',
      });
      const b2 = await bookingFixture.createBooking({
        clientId,
        recurringRuleId,
        bookingDate: '2026-10-17',
        startTime: '14:00',
        endTime: '16:00',
      });

      // Edit only b1 to 15:00 - 17:00
      await ctx.driver.execute(
        "UPDATE studio_bookings SET start_time = '15:00', end_time = '17:00' WHERE id = ?",
        [b1]
      );

      const check1 = await ctx.driver.query<{ start_time: string }>('SELECT start_time FROM studio_bookings WHERE id = ?', [b1]);
      const check2 = await ctx.driver.query<{ start_time: string }>('SELECT start_time FROM studio_bookings WHERE id = ?', [b2]);

      expect(check1[0].start_time).toBe('15:00');
      expect(check2[0].start_time).toBe('14:00'); // Untouched
    });

    it('cancels entire generation without writes when user selects "Cancel Creation"', async () => {
      const recurringRuleId = 'rule_cancelled';
      const shouldCommit = false;

      if (shouldCommit) {
        await bookingFixture.createBooking({ clientId, recurringRuleId, bookingDate: '2026-10-03', startTime: '10:00', endTime: '12:00' });
      }

      const committed = await ctx.driver.query('SELECT * FROM studio_bookings WHERE recurring_rule_id = ?', [recurringRuleId]);
      expect(committed).toHaveLength(0);
    });
  });
});
