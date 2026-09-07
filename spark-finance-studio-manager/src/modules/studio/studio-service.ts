/**
 * StudioService: Studio Booking & Scheduling Domain Service.
 * 
 * Enforces:
 * - Zero floating point currency: All money in integer piasters (1 EGP = 100 piasters).
 * - Durations strictly in integer minutes.
 * - Hard-blocking overlap collision detection via studio-overlap.ts (S_new < E_exist AND E_new > S_exist).
 * - Package minutes reservation upon booking creation.
 * - Planned vs. actual duration reconciliation upon completion (package deduction or standalone overtime).
 * - Cancellation with automatic package minutes restoration.
 * - Recurring booking generation with conflict preview and selective slot skipping.
 */

import { IDatabaseDriver } from '../../database/driver/types';
import {
  BookingStatus,
  TimeSlot,
  ConflictDetail,
  RecurringPreviewResult,
  RecurringSlotPreviewItem,
} from '../../domain/models/booking';
import { checkStudioOverlap, normalizeSlot } from '../../domain/calculators/studio-overlap';
import {
  previewRecurringSlots,
  filterCommitableSlots,
} from '../../domain/calculators/recurring-booking-engine';
import { reconcilePlannedVsActual } from '../../domain/calculators/package-consumption';
import {
  assertIntegerMinutes,
  assertIntegerPiasters,
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
  date: string; // 'YYYY-MM-DD'
  planned_start: string; // 'HH:MM'
  planned_end: string; // 'HH:MM'
  planned_minutes: number;
  actual_start: string | null;
  actual_end: string | null;
  actual_minutes: number | null;
  client_package_id: string | null;
  recurring_rule_id: string | null;
  status: BookingStatus;
  booking_price: number | null; // piasters
  deposit_required: number;
  deposit_amount: number | null; // piasters
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudioBookingWithDetails extends StudioBookingRecord {
  clientName: string;
  clientCompany: string | null;
  clientPhone: string;
  packageNameSnapshot: string | null;
  packageRemainingMinutes: number | null;
  reelCount: number;
}

export interface CreateBookingDto {
  id?: string;
  clientId: string;
  date: string; // 'YYYY-MM-DD'
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  clientPackageId?: string | null;
  recurringRuleId?: string | null;
  bookingPrice?: number | null; // piasters
  depositRequired?: boolean;
  depositAmount?: number | null; // piasters
  notes?: string | null;
  status?: BookingStatus;
}

export interface UpdateBookingDto {
  bookingId: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  clientPackageId?: string | null;
  bookingPrice?: number | null;
  depositRequired?: boolean;
  depositAmount?: number | null;
  notes?: string | null;
  status?: BookingStatus;
}

export interface CompleteBookingResolutionInput {
  bookingId: string;
  actualStart: string; // 'HH:MM'
  actualEnd: string; // 'HH:MM'
  actualMinutes?: number; // if provided, takes precedence over diff
  overtimeResolution?: 'package_deduct' | 'charge_overtime' | 'waive';
  overtimePricePiasters?: number; // piasters for standalone overtime
  notes?: string | null;
}

export interface CompleteBookingResolutionResult {
  booking: StudioBookingRecord;
  plannedMinutes: number;
  actualMinutes: number;
  deltaMinutes: number; // positive = overtime, negative = early end
  packageMinutesDeducted?: number;
  packageMinutesRestored?: number;
  overtimePricePiasters?: number;
}

export interface CreateRecurringBookingsDto {
  clientId: string;
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  frequency?: 'weekly' | 'biweekly';
  clientPackageId?: string | null;
  bookingPrice?: number | null; // piasters per session
  depositRequired?: boolean;
  depositAmount?: number | null;
  notes?: string | null;
  skipIndices?: number[]; // indices of slots to skip
}

export interface StudioFilter {
  date?: string;
  startDate?: string;
  endDate?: string;
  clientId?: string;
  status?: BookingStatus;
  excludeCancelled?: boolean;
}

export interface ClientPackageHourlySummary {
  id: string;
  nameSnapshot: string;
  purchasedMinutes: number;
  usedMinutes: number;
  reservedMinutes: number;
  availableMinutes: number;
}

// -------------------------------------------------------------------------
// QUERY FUNCTIONS
// -------------------------------------------------------------------------

/**
 * Lists studio bookings with enriched client and package metadata.
 */
export async function listStudioBookings(
  driver: IDatabaseDriver,
  filter?: StudioFilter
): Promise<StudioBookingWithDetails[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter?.date) {
    conditions.push('b.date = ?');
    params.push(filter.date);
  }
  if (filter?.startDate) {
    conditions.push('b.date >= ?');
    params.push(filter.startDate);
  }
  if (filter?.endDate) {
    conditions.push('b.date <= ?');
    params.push(filter.endDate);
  }
  if (filter?.clientId) {
    conditions.push('b.client_id = ?');
    params.push(filter.clientId);
  }
  if (filter?.status) {
    conditions.push('b.status = ?');
    params.push(filter.status);
  }
  if (filter?.excludeCancelled) {
    conditions.push("b.status NOT IN ('cancelled', 'no_show')");
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `
    SELECT 
      b.*,
      c.name AS client_name,
      c.company_name AS client_company,
      c.phone AS client_phone,
      cp.name_snapshot AS package_name_snapshot,
      cpi.purchased_quantity AS pkg_purchased,
      cpi.used_quantity AS pkg_used,
      cpi.reserved_quantity AS pkg_reserved,
      (SELECT COUNT(*) FROM reel_items r WHERE r.studio_booking_id = b.id) AS reel_count
    FROM studio_bookings b
    JOIN clients c ON b.client_id = c.id
    LEFT JOIN client_packages cp ON b.client_package_id = cp.id
    LEFT JOIN client_package_items cpi ON cp.id = cpi.client_package_id AND cpi.unit = 'hours'
    ${whereSql}
    ORDER BY b.date ASC, b.planned_start ASC;
  `;

  interface JoinedRow extends StudioBookingRecord {
    client_name: string;
    client_company: string | null;
    client_phone: string;
    package_name_snapshot: string | null;
    pkg_purchased: number | null;
    pkg_used: number | null;
    pkg_reserved: number | null;
    reel_count: number;
  }

  const rows = await driver.query<JoinedRow>(sql, params);

  return rows.map((r) => {
    let packageRemainingMinutes: number | null = null;
    if (r.pkg_purchased !== null && r.pkg_used !== null && r.pkg_reserved !== null) {
      packageRemainingMinutes = Math.max(0, r.pkg_purchased - (r.pkg_used + r.pkg_reserved));
    }

    return {
      id: r.id,
      client_id: r.client_id,
      date: r.date,
      planned_start: r.planned_start,
      planned_end: r.planned_end,
      planned_minutes: r.planned_minutes,
      actual_start: r.actual_start,
      actual_end: r.actual_end,
      actual_minutes: r.actual_minutes,
      client_package_id: r.client_package_id,
      recurring_rule_id: r.recurring_rule_id,
      status: r.status,
      booking_price: r.booking_price,
      deposit_required: r.deposit_required,
      deposit_amount: r.deposit_amount,
      notes: r.notes,
      created_at: r.created_at,
      updated_at: r.updated_at,
      clientName: r.client_name,
      clientCompany: r.client_company,
      clientPhone: r.client_phone,
      packageNameSnapshot: r.package_name_snapshot,
      packageRemainingMinutes,
      reelCount: r.reel_count || 0,
    };
  });
}

/**
 * Gets a single studio booking by ID with full details.
 */
export async function getStudioBookingById(
  driver: IDatabaseDriver,
  bookingId: string
): Promise<StudioBookingWithDetails | null> {
  assertNonEmptyString(bookingId, 'bookingId');
  const results = await listStudioBookings(driver);
  return results.find((b) => b.id === bookingId) ?? null;
}

/**
 * Queries client's active packages that contain hourly entitlements.
 */
export async function getClientActivePackages(
  driver: IDatabaseDriver,
  clientId: string
): Promise<ClientPackageHourlySummary[]> {
  assertNonEmptyString(clientId, 'clientId');

  const sql = `
    SELECT 
      cp.id,
      cp.name_snapshot,
      cpi.purchased_quantity,
      cpi.used_quantity,
      cpi.reserved_quantity
    FROM client_packages cp
    JOIN client_package_items cpi ON cp.id = cpi.client_package_id
    WHERE cp.client_id = ? 
      AND cp.status IN ('not_started', 'active')
      AND cpi.unit = 'hours'
    ORDER BY cp.purchased_at ASC;
  `;

  interface PkgRow {
    id: string;
    name_snapshot: string;
    purchased_quantity: number;
    used_quantity: number;
    reserved_quantity: number;
  }

  const rows = await driver.query<PkgRow>(sql, [clientId]);

  return rows.map((r) => ({
    id: r.id,
    nameSnapshot: r.name_snapshot,
    purchasedMinutes: r.purchased_quantity,
    usedMinutes: r.used_quantity,
    reservedMinutes: r.reserved_quantity,
    availableMinutes: Math.max(0, r.purchased_quantity - (r.used_quantity + r.reserved_quantity)),
  }));
}

/**
 * Checks for conflicts against existing bookings in the database.
 */
export async function checkBookingConflicts(
  driver: IDatabaseDriver,
  slot: TimeSlot,
  excludeBookingId?: string
): Promise<ConflictDetail[]> {
  // Query all active bookings on the same date (or adjacent days for potential midnight overlap)
  const existingRows = await driver.query<StudioBookingRecord>(
    `SELECT id, client_id, date, planned_start, planned_end, planned_minutes,
            actual_start, actual_end, actual_minutes, client_package_id, recurring_rule_id,
            status, booking_price, deposit_required, deposit_amount, notes, created_at, updated_at
     FROM studio_bookings
     WHERE status NOT IN ('cancelled', 'no_show');`
  );

  const existingSlots: TimeSlot[] = existingRows
    .filter((b) => !excludeBookingId || b.id !== excludeBookingId)
    .map((b) => ({
      id: b.id,
      date: b.date,
      startTime: b.planned_start,
      endTime: b.planned_end,
    }));

  const proposedSlot: TimeSlot = {
    id: excludeBookingId,
    date: slot.date,
    startTime: slot.startTime,
    endTime: slot.endTime,
  };

  const result = checkStudioOverlap(existingSlots, proposedSlot);
  return result.conflicts;
}

// -------------------------------------------------------------------------
// MUTATION FUNCTIONS
// -------------------------------------------------------------------------

/**
 * Creates a single studio booking.
 * Enforces hard-blocking collision check and package minutes reservation.
 */
export async function createStudioBooking(
  driver: IDatabaseDriver,
  input: CreateBookingDto
): Promise<StudioBookingRecord> {
  const bookingId = input.id ?? crypto.randomUUID();
  const clientId = assertNonEmptyString(input.clientId, 'clientId');
  assertValidDateString(input.date, 'date');
  assertValidTimeString(input.startTime, 'startTime');
  assertValidTimeString(input.endTime, 'endTime');

  if (input.bookingPrice !== undefined && input.bookingPrice !== null) {
    assertIntegerPiasters(input.bookingPrice, 'bookingPrice');
  }
  if (input.depositAmount !== undefined && input.depositAmount !== null) {
    assertIntegerPiasters(input.depositAmount, 'depositAmount');
  }

  const proposedSlot: TimeSlot = {
    id: bookingId,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
  };

  const normSlot = normalizeSlot(proposedSlot);
  const plannedMinutes = normSlot.durationMinutes;
  assertIntegerMinutes(plannedMinutes, 'plannedMinutes');

  const now = new Date().toISOString();
  const status: BookingStatus = input.status ?? 'scheduled';

  return await driver.transaction(async (tx) => {
    // 1. Check for overlapping bookings
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

    const overlapResult = checkStudioOverlap(existingSlots, proposedSlot);
    if (overlapResult.hasOverlap) {
      throw new StudioOverlapConflictError(
        `تعارض في حجز الاستوديو: توجد جلسة أخرى في نفس الوقت (${input.date} من ${input.startTime} إلى ${input.endTime}).`,
        overlapResult.conflicts
      );
    }

    // 2. Package-backed reservation check
    if (input.clientPackageId) {
      const pkgItems = await tx.query<{
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

      if (pkgItems.length === 0) {
        throw new DomainInvariantError(
          `الباقة المختارة (${input.clientPackageId}) لا تحتوي على رصيد ساعات استوديو.`
        );
      }

      const item = pkgItems[0];
      const available = item.purchased_quantity - (item.used_quantity + item.reserved_quantity);

      if (available < plannedMinutes) {
        throw new DomainInvariantError(
          `رصيد الباقة غير كافٍ: المطلوب ${plannedMinutes} دقيقة والمتاح ${available} دقيقة فقط.`
        );
      }

      await tx.execute(
        `UPDATE client_package_items
         SET reserved_quantity = reserved_quantity + ?
         WHERE id = ?;`,
        [plannedMinutes, item.id]
      );

      // If package status is 'not_started', transition to 'active'
      await tx.execute(
        `UPDATE client_packages
         SET status = 'active'
         WHERE id = ? AND status = 'not_started';`,
        [input.clientPackageId]
      );
    }

    // 3. Insert studio booking record
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
        input.startTime,
        input.endTime,
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

    // 4. Log activity
    await tx.execute(
      `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
       VALUES (?, 'BOOKING_CREATED', 'booking', ?, ?, ?, ?);`,
      [
        crypto.randomUUID(),
        bookingId,
        now,
        input.notes ?? `حجز استوديو في ${input.date} من ${input.startTime} إلى ${input.endTime}`,
        JSON.stringify({
          clientId,
          date: input.date,
          plannedStart: input.startTime,
          plannedEnd: input.endTime,
          plannedMinutes,
          clientPackageId: input.clientPackageId ?? null,
        }),
      ]
    );

    return {
      id: bookingId,
      client_id: clientId,
      date: input.date,
      planned_start: input.startTime,
      planned_end: input.endTime,
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
 * Updates a studio booking's parameters or status.
 * Re-validates overlap if date or times change.
 */
export async function updateStudioBooking(
  driver: IDatabaseDriver,
  input: UpdateBookingDto
): Promise<StudioBookingRecord> {
  assertNonEmptyString(input.bookingId, 'bookingId');

  return await driver.transaction(async (tx) => {
    const existingList = await tx.query<StudioBookingRecord>(
      `SELECT * FROM studio_bookings WHERE id = ? LIMIT 1;`,
      [input.bookingId]
    );

    if (existingList.length === 0) {
      throw new Error(`Booking ${input.bookingId} not found`);
    }

    const current = existingList[0];
    const newDate = input.date ?? current.date;
    const newStart = input.startTime ?? current.planned_start;
    const newEnd = input.endTime ?? current.planned_end;
    const newStatus = input.status ?? current.status;

    // Check overlap if date/time changed
    const timeChanged =
      newDate !== current.date ||
      newStart !== current.planned_start ||
      newEnd !== current.planned_end;

    let plannedMinutes = current.planned_minutes;

    if (timeChanged) {
      const proposed: TimeSlot = {
        id: input.bookingId,
        date: newDate,
        startTime: newStart,
        endTime: newEnd,
      };
      const norm = normalizeSlot(proposed);
      plannedMinutes = norm.durationMinutes;

      const allActive = await tx.query<StudioBookingRecord>(
        `SELECT id, date, planned_start, planned_end
         FROM studio_bookings
         WHERE id != ? AND status NOT IN ('cancelled', 'no_show');`,
        [input.bookingId]
      );

      const overlapCheck = checkStudioOverlap(
        allActive.map((b) => ({
          id: b.id,
          date: b.date,
          startTime: b.planned_start,
          endTime: b.planned_end,
        })),
        proposed
      );

      if (overlapCheck.hasOverlap) {
        throw new StudioOverlapConflictError(
          `تعارض في تعديل الموعد: توجد جلسة أخرى في نفس الوقت (${newDate} ${newStart}-${newEnd}).`,
          overlapCheck.conflicts
        );
      }

      // If package-backed and planned duration changed, adjust reserved minutes
      if (current.client_package_id && plannedMinutes !== current.planned_minutes) {
        const delta = plannedMinutes - current.planned_minutes;
        const itemRows = await tx.query<{ id: string; purchased_quantity: number; used_quantity: number; reserved_quantity: number }>(
          `SELECT id, purchased_quantity, used_quantity, reserved_quantity
           FROM client_package_items
           WHERE client_package_id = ? AND unit = 'hours' LIMIT 1;`,
          [current.client_package_id]
        );

        if (itemRows.length > 0) {
          const item = itemRows[0];
          if (delta > 0) {
            const available = item.purchased_quantity - (item.used_quantity + item.reserved_quantity);
            if (available < delta) {
              throw new DomainInvariantError(`رصيد الباقة غير كافٍ لزيادة وقت الجلسة بمقدار ${delta} دقيقة.`);
            }
          }
          await tx.execute(
            `UPDATE client_package_items
             SET reserved_quantity = MAX(0, reserved_quantity + ?)
             WHERE id = ?;`,
            [delta, item.id]
          );
        }
      }
    }

    const now = new Date().toISOString();

    await tx.execute(
      `UPDATE studio_bookings
       SET date = ?,
           planned_start = ?,
           planned_end = ?,
           planned_minutes = ?,
           status = ?,
           booking_price = COALESCE(?, booking_price),
           deposit_required = COALESCE(?, deposit_required),
           deposit_amount = COALESCE(?, deposit_amount),
           notes = COALESCE(?, notes),
           updated_at = ?
       WHERE id = ?;`,
      [
        newDate,
        newStart,
        newEnd,
        plannedMinutes,
        newStatus,
        input.bookingPrice !== undefined ? input.bookingPrice : null,
        input.depositRequired !== undefined ? (input.depositRequired ? 1 : 0) : null,
        input.depositAmount !== undefined ? input.depositAmount : null,
        input.notes !== undefined ? input.notes : null,
        now,
        input.bookingId,
      ]
    );

    return {
      ...current,
      date: newDate,
      planned_start: newStart,
      planned_end: newEnd,
      planned_minutes: plannedMinutes,
      status: newStatus,
      booking_price: input.bookingPrice !== undefined ? input.bookingPrice : current.booking_price,
      deposit_required: input.depositRequired !== undefined ? (input.depositRequired ? 1 : 0) : current.deposit_required,
      deposit_amount: input.depositAmount !== undefined ? input.depositAmount : current.deposit_amount,
      notes: input.notes !== undefined ? input.notes : current.notes,
      updated_at: now,
    };
  });
}

/**
 * Updates booking status (scheduled -> confirmed, etc.).
 */
export async function updateStudioBookingStatus(
  driver: IDatabaseDriver,
  bookingId: string,
  newStatus: BookingStatus,
  notes?: string
): Promise<void> {
  assertNonEmptyString(bookingId, 'bookingId');

  const now = new Date().toISOString();

  await driver.transaction(async (tx) => {
    const existing = await tx.query<StudioBookingRecord>(
      `SELECT * FROM studio_bookings WHERE id = ? LIMIT 1;`,
      [bookingId]
    );
    if (existing.length === 0) {
      throw new Error(`Booking ${bookingId} not found`);
    }

    await tx.execute(
      `UPDATE studio_bookings
       SET status = ?, updated_at = ?
       WHERE id = ?;`,
      [newStatus, now, bookingId]
    );

    await tx.execute(
      `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
       VALUES (?, 'BOOKING_STATUS_CHANGED', 'booking', ?, ?, ?, ?);`,
      [
        crypto.randomUUID(),
        bookingId,
        now,
        notes ?? `تغيير حالة الحجز إلى: ${newStatus}`,
        JSON.stringify({ previousStatus: existing[0].status, newStatus }),
      ]
    );
  });
}

/**
 * Cancels a booking and automatically restores reserved or consumed package minutes.
 */
export async function cancelStudioBooking(
  driver: IDatabaseDriver,
  bookingId: string,
  reason = 'تم إلغاء الحجز بواسطة المستخدم'
): Promise<void> {
  assertNonEmptyString(bookingId, 'bookingId');
  assertNonEmptyString(reason, 'reason');

  await driver.transaction(async (tx) => {
    const rows = await tx.query<StudioBookingRecord>(
      `SELECT * FROM studio_bookings WHERE id = ? LIMIT 1;`,
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

    // If package-backed, restore minutes
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
          `استرجاع ${booking.planned_minutes} دقيقة عند إلغاء الحجز ${bookingId}`,
          JSON.stringify({ bookingId, minutesRestored: booking.planned_minutes, reason }),
        ]
      );
    }

    // Set status to cancelled
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

/**
 * Reconciles planned vs actual duration and marks the booking as completed.
 * If package-backed: consumes actual minutes and adjusts reserved balance.
 * If standalone: adjusts final booking price for overtime if applicable.
 */
export async function resolveAndCompleteBooking(
  driver: IDatabaseDriver,
  input: CompleteBookingResolutionInput
): Promise<CompleteBookingResolutionResult> {
  assertNonEmptyString(input.bookingId, 'bookingId');
  assertValidTimeString(input.actualStart, 'actualStart');
  assertValidTimeString(input.actualEnd, 'actualEnd');

  return await driver.transaction(async (tx) => {
    const existing = await tx.query<StudioBookingRecord>(
      `SELECT * FROM studio_bookings WHERE id = ? LIMIT 1;`,
      [input.bookingId]
    );

    if (existing.length === 0) {
      throw new Error(`Booking ${input.bookingId} not found`);
    }

    const booking = existing[0];
    const plannedMinutes = booking.planned_minutes;

    // Calculate actual minutes from start/end if not explicitly passed
    let actualMinutes = input.actualMinutes;
    if (actualMinutes === undefined || actualMinutes === null) {
      const norm = normalizeSlot({
        date: booking.date,
        startTime: input.actualStart,
        endTime: input.actualEnd,
      });
      actualMinutes = norm.durationMinutes;
    }
    assertIntegerMinutes(actualMinutes, 'actualMinutes');

    const deltaMinutes = actualMinutes - plannedMinutes;
    const now = new Date().toISOString();

    let packageMinutesDeducted: number | undefined;
    let packageMinutesRestored: number | undefined;
    let overtimePricePiasters: number | undefined;

    // 1. Package-backed Reconciliation
    if (booking.client_package_id) {
      const itemRows = await tx.query<{
        id: string;
        purchased_quantity: number;
        used_quantity: number;
        reserved_quantity: number;
      }>(
        `SELECT id, purchased_quantity, used_quantity, reserved_quantity
         FROM client_package_items
         WHERE client_package_id = ? AND unit = 'hours' LIMIT 1;`,
        [booking.client_package_id]
      );

      if (itemRows.length > 0) {
        const item = itemRows[0];

        // Call domain calculator
        const reconciliation = reconcilePlannedVsActual(
          plannedMinutes,
          actualMinutes,
          item.reserved_quantity,
          item.used_quantity,
          item.purchased_quantity
        );

        // Update package item with new reserved and used quantities
        await tx.execute(
          `UPDATE client_package_items
           SET used_quantity = ?,
               reserved_quantity = ?
           WHERE id = ?;`,
          [reconciliation.newUsedMinutes, reconciliation.newReservedMinutes, item.id]
        );

        if (deltaMinutes > 0) {
          packageMinutesDeducted = actualMinutes;
        } else if (deltaMinutes < 0) {
          packageMinutesRestored = plannedMinutes - actualMinutes;
        }

        // If package is fully used, update package status
        if (reconciliation.remainingAvailableMinutes === 0) {
          await tx.execute(
            `UPDATE client_packages
             SET status = 'fully_used'
             WHERE id = ?;`,
            [booking.client_package_id]
          );
        }

        // Activity log for package consumption
        await tx.execute(
          `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
           VALUES (?, 'HOURS_CONSUMED', 'package', ?, ?, ?, ?);`,
          [
            crypto.randomUUID(),
            booking.client_package_id,
            now,
            `تسوية استهلاك الساعات للجلسة: المخطط ${plannedMinutes} دقيقة، الفعلي ${actualMinutes} دقيقة`,
            JSON.stringify({
              bookingId: booking.id,
              plannedMinutes,
              actualMinutes,
              deltaMinutes,
              newUsed: reconciliation.newUsedMinutes,
            }),
          ]
        );
      }
    } else {
      // 2. Standalone Rental Resolution
      if (deltaMinutes > 0 && input.overtimePricePiasters) {
        assertIntegerPiasters(input.overtimePricePiasters, 'overtimePricePiasters');
        overtimePricePiasters = input.overtimePricePiasters;
        const newPrice = (booking.booking_price ?? 0) + input.overtimePricePiasters;
        await tx.execute(
          `UPDATE studio_bookings
           SET booking_price = ?
           WHERE id = ?;`,
          [newPrice, booking.id]
        );
      }
    }

    // 3. Mark booking as completed with actuals
    await tx.execute(
      `UPDATE studio_bookings
       SET status = 'completed',
           actual_start = ?,
           actual_end = ?,
           actual_minutes = ?,
           updated_at = ?
       WHERE id = ?;`,
      [input.actualStart, input.actualEnd, actualMinutes, now, booking.id]
    );

    // 4. Activity log for booking completion
    await tx.execute(
      `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
       VALUES (?, 'BOOKING_COMPLETED', 'booking', ?, ?, ?, ?);`,
      [
        crypto.randomUUID(),
        booking.id,
        now,
        input.notes ?? `اكتمال جلسة الاستوديو بنجاح (${actualMinutes} دقيقة)`,
        JSON.stringify({
          plannedMinutes,
          actualMinutes,
          deltaMinutes,
          overtimePricePiasters,
        }),
      ]
    );

    const updatedBooking: StudioBookingRecord = {
      ...booking,
      status: 'completed',
      actual_start: input.actualStart,
      actual_end: input.actualEnd,
      actual_minutes: actualMinutes,
      booking_price: overtimePricePiasters
        ? (booking.booking_price ?? 0) + overtimePricePiasters
        : booking.booking_price,
      updated_at: now,
    };

    return {
      booking: updatedBooking,
      plannedMinutes,
      actualMinutes,
      deltaMinutes,
      packageMinutesDeducted,
      packageMinutesRestored,
      overtimePricePiasters,
    };
  });
}

// -------------------------------------------------------------------------
// RECURRING BOOKINGS
// -------------------------------------------------------------------------

/**
 * Previews recurring booking candidate slots against existing active bookings in the database.
 */
export async function previewRecurringStudioBookings(
  driver: IDatabaseDriver,
  input: {
    clientId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    startDate: string;
    endDate: string;
    frequency?: 'weekly' | 'biweekly';
  }
): Promise<RecurringPreviewResult> {
  const existingRows = await driver.query<StudioBookingRecord>(
    `SELECT id, date, planned_start, planned_end
     FROM studio_bookings
     WHERE status NOT IN ('cancelled', 'no_show');`
  );

  const existingSlots: TimeSlot[] = existingRows.map((b) => ({
    id: b.id,
    date: b.date,
    startTime: b.planned_start,
    endTime: b.planned_end,
  }));

  return previewRecurringSlots(
    {
      clientId: input.clientId,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      startDate: input.startDate,
      endDate: input.endDate,
      frequency: input.frequency,
    },
    existingSlots
  );
}

/**
 * Commits recurring bookings, creating the rule and generating all committable slots atomically.
 */
export async function createRecurringStudioBookings(
  driver: IDatabaseDriver,
  input: CreateRecurringBookingsDto
): Promise<{
  ruleId: string;
  createdCount: number;
  skippedCount: number;
  bookings: StudioBookingRecord[];
}> {
  const ruleId = crypto.randomUUID();
  const clientId = assertNonEmptyString(input.clientId, 'clientId');
  assertValidTimeString(input.startTime, 'startTime');
  assertValidTimeString(input.endTime, 'endTime');
  assertValidDateString(input.startDate, 'startDate');
  assertValidDateString(input.endDate, 'endDate');

  // 1. Preview slots to find any conflicts
  const preview = await previewRecurringStudioBookings(driver, {
    clientId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    startDate: input.startDate,
    endDate: input.endDate,
    frequency: input.frequency,
  });

  const skipSet = new Set(input.skipIndices ?? []);
  const candidateSlots: RecurringSlotPreviewItem[] = preview.slots.map((slot) => ({
    ...slot,
    skip: slot.skip || skipSet.has(slot.index),
  }));

  const committableSlots = filterCommitableSlots(candidateSlots);

  if (committableSlots.length === 0) {
    throw new DomainInvariantError(
      'لا يمكن إنشاء الحجوزات المتكررة: جميع المواعيد متعارضة أو تم استثناؤها.'
    );
  }

  const now = new Date().toISOString();

  return await driver.transaction(async (tx) => {
    // 2. Insert recurring rule
    await tx.execute(
      `INSERT INTO recurring_booking_rules (
        id, client_id, day_of_week, start_time, end_time, start_date, end_date,
        client_package_id, notes, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?);`,
      [
        ruleId,
        clientId,
        input.dayOfWeek,
        input.startTime,
        input.endTime,
        input.startDate,
        input.endDate,
        input.clientPackageId ?? null,
        input.notes ?? null,
        now,
      ]
    );

    // 3. If package-backed, check total available balance for all slots
    if (input.clientPackageId) {
      const totalRequiredMinutes = committableSlots.reduce(
        (acc, slot) => acc + slot.plannedMinutes,
        0
      );

      const pkgRows = await tx.query<{
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

      if (pkgRows.length === 0) {
        throw new DomainInvariantError(
          `الباقة المختارة (${input.clientPackageId}) لا تحتوي على رصيد ساعات استوديو.`
        );
      }

      const item = pkgRows[0];
      const available = item.purchased_quantity - (item.used_quantity + item.reserved_quantity);

      if (available < totalRequiredMinutes) {
        throw new DomainInvariantError(
          `رصيد الباقة غير كافٍ لجميع المواعيد المتكررة: المطلوب ${totalRequiredMinutes} دقيقة والمتاح ${available} دقيقة فقط.`
        );
      }

      // Reserve total required minutes
      await tx.execute(
        `UPDATE client_package_items
         SET reserved_quantity = reserved_quantity + ?
         WHERE id = ?;`,
        [totalRequiredMinutes, item.id]
      );

      await tx.execute(
        `UPDATE client_packages
         SET status = 'active'
         WHERE id = ? AND status = 'not_started';`,
        [input.clientPackageId]
      );
    }

    // 4. Insert each committable slot into studio_bookings
    const createdBookings: StudioBookingRecord[] = [];

    for (const slot of committableSlots) {
      const bookingId = crypto.randomUUID();

      await tx.execute(
        `INSERT INTO studio_bookings (
          id, client_id, date, planned_start, planned_end, planned_minutes,
          actual_start, actual_end, actual_minutes, client_package_id, recurring_rule_id,
          status, booking_price, deposit_required, deposit_amount, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, 'scheduled', ?, ?, ?, ?, ?, ?);`,
        [
          bookingId,
          clientId,
          slot.date,
          slot.startTime,
          slot.endTime,
          slot.plannedMinutes,
          input.clientPackageId ?? null,
          ruleId,
          input.bookingPrice ?? null,
          input.depositRequired ? 1 : 0,
          input.depositAmount ?? null,
          input.notes ?? `حجز متكرر - جلسة ${slot.index + 1}`,
          now,
          now,
        ]
      );

      createdBookings.push({
        id: bookingId,
        client_id: clientId,
        date: slot.date,
        planned_start: slot.startTime,
        planned_end: slot.endTime,
        planned_minutes: slot.plannedMinutes,
        actual_start: null,
        actual_end: null,
        actual_minutes: null,
        client_package_id: input.clientPackageId ?? null,
        recurring_rule_id: ruleId,
        status: 'scheduled',
        booking_price: input.bookingPrice ?? null,
        deposit_required: input.depositRequired ? 1 : 0,
        deposit_amount: input.depositAmount ?? null,
        notes: input.notes ?? null,
        created_at: now,
        updated_at: now,
      });
    }

    // 5. Activity log
    await tx.execute(
      `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
       VALUES (?, 'RECURRING_BOOKINGS_CREATED', 'recurring_rule', ?, ?, ?, ?);`,
      [
        crypto.randomUUID(),
        ruleId,
        now,
        `تم إنشاء ${createdBookings.length} موعد حجز متكرر (تم تخطي ${candidateSlots.length - createdBookings.length} تعارض)`,
        JSON.stringify({
          ruleId,
          clientId,
          totalGenerated: candidateSlots.length,
          createdCount: createdBookings.length,
          skippedCount: candidateSlots.length - createdBookings.length,
        }),
      ]
    );

    return {
      ruleId,
      createdCount: createdBookings.length,
      skippedCount: candidateSlots.length - createdBookings.length,
      bookings: createdBookings,
    };
  });
}

// -------------------------------------------------------------------------
// CALENDAR & DATE HELPER UTILITIES
// -------------------------------------------------------------------------

export const ARABIC_DAYS = [
  'الأحد',
  'الإثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

export const ARABIC_MONTHS = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

/**
 * Returns the 7 days of the week containing the given date.
 * Week starts on Sunday (index 0) per regional standard.
 */
export function getWeekDates(baseDate: Date): Date[] {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const day = d.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);

  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const nextDay = new Date(sunday);
    nextDay.setDate(sunday.getDate() + i);
    week.push(nextDay);
  }
  return week;
}

/**
 * Formats Date to YYYY-MM-DD
 */
export function formatIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns grid of days for a given year and month (0-indexed month).
 * Includes padding days from previous and next month to complete standard weeks.
 */
export function getMonthCalendarDays(
  year: number,
  month: number
): Array<{ date: Date; dateStr: string; isCurrentMonth: boolean; isToday: boolean }> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  const startDayOfWeek = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
  const totalDaysInMonth = lastDay.getDate();

  const todayStr = formatIsoDate(new Date());
  const days: Array<{ date: Date; dateStr: string; isCurrentMonth: boolean; isToday: boolean }> = [];

  // Previous month padding
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    const dateStr = formatIsoDate(d);
    days.push({
      date: d,
      dateStr,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  // Current month days
  for (let i = 1; i <= totalDaysInMonth; i++) {
    const d = new Date(year, month, i);
    const dateStr = formatIsoDate(d);
    days.push({
      date: d,
      dateStr,
      isCurrentMonth: true,
      isToday: dateStr === todayStr,
    });
  }

  // Next month padding to fill out the last week (total grid size multiple of 7)
  const remaining = (7 - (days.length % 7)) % 7;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const dateStr = formatIsoDate(d);
    days.push({
      date: d,
      dateStr,
      isCurrentMonth: false,
      isToday: dateStr === todayStr,
    });
  }

  return days;
}
