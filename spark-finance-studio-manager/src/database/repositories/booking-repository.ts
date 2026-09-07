/**
 * BookingRepository: Studio Booking Persistence with Synchronous Hard-Blocking Overlap Detection,
 * Package Minutes Reservation, Session Completion Reconciliation, and Cancellation Credit Restoration.
 */

import { IDatabaseDriver } from '../driver/types';
import {
  BookingStatus,
  TimeSlot,
  ConflictDetail,
} from '../../domain/models/booking';
import { checkStudioOverlap, normalizeSlot } from '../../domain/calculators/studio-overlap';
import {
  assertIntegerMinutes,
  assertNonEmptyString,
  assertValidDateString,
  assertValidTimeString,
  DomainInvariantError,
} from '../../domain/rules/invariants';

export class StudioOverlapConflictError extends Error {
  public conflicts: ConflictDetail[];

  constructor(message: string, conflicts: ConflictDetail[]) {
    super(message);
    this.name = 'StudioOverlapConflictError';
    this.conflicts = conflicts;
  }
}

export interface StudioBookingRecord {
  id: string;
  client_id: string;
  date: string;
  planned_start: string;
  planned_end: string;
  planned_minutes: number;
  actual_start: string | null;
  actual_end: string | null;
  actual_minutes: number | null;
  client_package_id: string | null;
  recurring_rule_id: string | null;
  status: BookingStatus;
  booking_price: number | null;
  deposit_required: number;
  deposit_amount: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateBookingInput {
  id?: string;
  clientId: string;
  date: string; // 'YYYY-MM-DD'
  plannedStart: string; // 'HH:MM'
  plannedEnd: string; // 'HH:MM'
  clientPackageId?: string | null;
  recurringRuleId?: string | null;
  bookingPrice?: number | null;
  depositRequired?: boolean;
  depositAmount?: number | null;
  notes?: string | null;
  status?: BookingStatus;
}

export interface BookingFilter {
  date?: string;
  startDate?: string;
  endDate?: string;
  clientId?: string;
  status?: BookingStatus;
  excludeCancelled?: boolean;
}

export class BookingRepository {
  constructor(private driver: IDatabaseDriver) {}

  /**
   * Atomically verifies zero overlap with existing bookings before inserting.
   * If an overlap is detected, throws StudioOverlapConflictError and blocks insertion.
   * If linked to a package, reserves the planned minutes from client_package_items.
   */
  public async createBooking(input: CreateBookingInput): Promise<StudioBookingRecord> {
    const bookingId = input.id ?? crypto.randomUUID();
    const clientId = assertNonEmptyString(input.clientId, 'clientId');
    assertValidDateString(input.date, 'date');
    assertValidTimeString(input.plannedStart, 'plannedStart');
    assertValidTimeString(input.plannedEnd, 'plannedEnd');

    const proposedSlot: TimeSlot = {
      id: bookingId,
      date: input.date,
      startTime: input.plannedStart,
      endTime: input.plannedEnd,
    };

    const normProposed = normalizeSlot(proposedSlot);
    const plannedMinutes = normProposed.durationMinutes;
    assertIntegerMinutes(plannedMinutes, 'plannedMinutes');

    const now = new Date().toISOString();
    const status: BookingStatus = input.status ?? 'scheduled';

    return await this.driver.transaction(async (tx) => {
      // 1. Fetch potential overlapping bookings (within a +/- 1 day range for midnight crossings)
      const existingRows = await tx.query<StudioBookingRecord>(
        `SELECT id, client_id, date, planned_start, planned_end, planned_minutes,
                actual_start, actual_end, actual_minutes, client_package_id, recurring_rule_id,
                status, booking_price, deposit_required, deposit_amount, notes, created_at, updated_at
         FROM studio_bookings
         WHERE status NOT IN ('cancelled', 'no_show');`
      );

      const existingSlots: TimeSlot[] = existingRows.map((b) => ({
        id: b.id,
        date: b.date,
        startTime: b.planned_start,
        endTime: b.planned_end,
      }));

      // 2. Perform Overlap Detection
      const overlapCheck = checkStudioOverlap(existingSlots, proposedSlot);
      if (overlapCheck.hasOverlap) {
        throw new StudioOverlapConflictError(
          `Conflict detected: Proposed studio session (${input.date} ${input.plannedStart}-${input.plannedEnd}) overlaps with ${overlapCheck.conflicts.length} existing booking(s).`,
          overlapCheck.conflicts
        );
      }

      // 3. If package linked, reserve hours
      if (input.clientPackageId) {
        const itemRows = await tx.query<{
          id: string;
          purchased_quantity: number;
          used_quantity: number;
          reserved_quantity: number;
        }>(
          `SELECT id, purchased_quantity, used_quantity, reserved_quantity
           FROM client_package_items
           WHERE client_package_id = ? AND unit = 'hours' LIMIT 1;`,
          [input.clientPackageId]
        );

        if (itemRows.length === 0) {
          throw new DomainInvariantError(
            `Client package ${input.clientPackageId} does not contain an hourly entitlement item`
          );
        }

        const item = itemRows[0];
        const availableMinutes = item.purchased_quantity - (item.used_quantity + item.reserved_quantity);

        if (availableMinutes < plannedMinutes) {
          throw new DomainInvariantError(
            `Insufficient package balance: requires ${plannedMinutes} minutes, but only ${availableMinutes} minutes available.`
          );
        }

        await tx.execute(
          `UPDATE client_package_items
           SET reserved_quantity = reserved_quantity + ?
           WHERE id = ?;`,
          [plannedMinutes, item.id]
        );
      }

      // 4. Insert Booking
      await tx.execute(
        `INSERT INTO studio_bookings (
          id, client_id, date, planned_start, planned_end, planned_minutes,
          actual_start, actual_end, actual_minutes, client_package_id, recurring_rule_id,
          status, booking_price, deposit_required, deposit_amount, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          bookingId,
          clientId,
          input.date,
          input.plannedStart,
          input.plannedEnd,
          plannedMinutes,
          input.clientPackageId ?? null,
          input.recurringRuleId ?? null,
          status,
          input.bookingPrice ?? null,
          input.depositRequired ? 1 : 0,
          input.depositAmount ?? null,
          input.notes ?? null,
          now,
          now,
        ]
      );

      // 5. Activity Log
      await tx.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
         VALUES (?, 'BOOKING_CREATED', 'booking', ?, ?, ?, ?);`,
        [
          crypto.randomUUID(),
          bookingId,
          now,
          input.notes ?? `Booking created for ${input.date} ${input.plannedStart}-${input.plannedEnd}`,
          JSON.stringify({
            clientId,
            date: input.date,
            plannedStart: input.plannedStart,
            plannedEnd: input.plannedEnd,
            plannedMinutes,
            clientPackageId: input.clientPackageId ?? null,
          }),
        ]
      );

      return {
        id: bookingId,
        client_id: clientId,
        date: input.date,
        planned_start: input.plannedStart,
        planned_end: input.plannedEnd,
        planned_minutes: plannedMinutes,
        actual_start: null,
        actual_end: null,
        actual_minutes: null,
        client_package_id: input.clientPackageId ?? null,
        recurring_rule_id: input.recurringRuleId ?? null,
        status,
        booking_price: input.bookingPrice ?? null,
        deposit_required: input.depositRequired ? 1 : 0,
        deposit_amount: input.depositAmount ?? null,
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
      };
    });
  }

  /**
   * Cancels a booking, restoring reserved or consumed hours back to client's package.
   */
  public async cancelBooking(bookingId: string, reason = 'Cancelled by user'): Promise<void> {
    assertNonEmptyString(bookingId, 'bookingId');

    await this.driver.transaction(async (tx) => {
      const rows = await tx.query<StudioBookingRecord>(
        `SELECT id, client_id, date, planned_start, planned_end, planned_minutes,
                actual_start, actual_end, actual_minutes, client_package_id, recurring_rule_id,
                status, booking_price, deposit_required, deposit_amount, notes, created_at, updated_at
         FROM studio_bookings WHERE id = ? LIMIT 1;`,
        [bookingId]
      );

      if (rows.length === 0) {
        throw new Error(`Booking ${bookingId} not found`);
      }

      const booking = rows[0];
      if (booking.status === 'cancelled') {
        return; // Already cancelled
      }

      const now = new Date().toISOString();

      // If tied to a package, release reserved (or used) minutes
      if (booking.client_package_id) {
        if (booking.status === 'completed') {
          const actualM = booking.actual_minutes ?? booking.planned_minutes;
          await tx.execute(
            `UPDATE client_package_items
             SET used_quantity = MAX(0, used_quantity - ?)
             WHERE client_package_id = ? AND unit = 'hours';`,
            [actualM, booking.client_package_id]
          );
        } else {
          await tx.execute(
            `UPDATE client_package_items
             SET reserved_quantity = MAX(0, reserved_quantity - ?)
             WHERE client_package_id = ? AND unit = 'hours';`,
            [booking.planned_minutes, booking.client_package_id]
          );
        }

        // Log HOURS_RESTORED
        await tx.execute(
          `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
           VALUES (?, 'HOURS_RESTORED', 'package', ?, ?, ?, ?);`,
          [
            crypto.randomUUID(),
            booking.client_package_id,
            now,
            `Restored ${booking.planned_minutes} minutes upon cancellation of booking ${bookingId}`,
            JSON.stringify({ bookingId, minutesRestored: booking.planned_minutes }),
          ]
        );
      }

      // Update booking status
      await tx.execute(
        `UPDATE studio_bookings
         SET status = 'cancelled', updated_at = ?
         WHERE id = ?;`,
        [now, bookingId]
      );

      // Log BOOKING_CANCELLED
      await tx.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
         VALUES (?, 'BOOKING_CANCELLED', 'booking', ?, ?, ?, ?);`,
        [
          crypto.randomUUID(),
          bookingId,
          now,
          reason,
          JSON.stringify({ previousStatus: booking.status, reason }),
        ]
      );
    });
  }

  public async getById(bookingId: string): Promise<StudioBookingRecord | null> {
    const rows = await this.driver.query<StudioBookingRecord>(
      `SELECT id, client_id, date, planned_start, planned_end, planned_minutes,
              actual_start, actual_end, actual_minutes, client_package_id, recurring_rule_id,
              status, booking_price, deposit_required, deposit_amount, notes, created_at, updated_at
       FROM studio_bookings WHERE id = ? LIMIT 1;`,
      [bookingId]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  public async list(filter?: BookingFilter): Promise<StudioBookingRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.date) {
      conditions.push('date = ?');
      params.push(filter.date);
    }
    if (filter?.startDate) {
      conditions.push('date >= ?');
      params.push(filter.startDate);
    }
    if (filter?.endDate) {
      conditions.push('date <= ?');
      params.push(filter.endDate);
    }
    if (filter?.clientId) {
      conditions.push('client_id = ?');
      params.push(filter.clientId);
    }
    if (filter?.status) {
      conditions.push('status = ?');
      params.push(filter.status);
    }
    if (filter?.excludeCancelled) {
      conditions.push("status NOT IN ('cancelled', 'no_show')");
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT id, client_id, date, planned_start, planned_end, planned_minutes,
                        actual_start, actual_end, actual_minutes, client_package_id, recurring_rule_id,
                        status, booking_price, deposit_required, deposit_amount, notes, created_at, updated_at
                 FROM studio_bookings ${whereClause} ORDER BY date ASC, planned_start ASC;`;

    return await this.driver.query<StudioBookingRecord>(sql, params);
  }
}
