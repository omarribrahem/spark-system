/**
 * Pure Domain Calculator: Recurring Booking Engine
 * Generates recurring future session slots, previews conflicts against existing bookings,
 * and allows selective slot skipping before commit.
 */

import {
  TimeSlot,
  RecurringRuleInput,
  RecurringPreviewResult,
  RecurringSlotPreviewItem,
} from '../models/booking';
import { checkStudioOverlap, normalizeSlot } from './studio-overlap';
import {
  assertValidDateString,
  assertValidTimeString,
  DomainInvariantError,
} from '../rules/invariants';

/**
 * Generates dates between startDate and endDate matching the given day of the week.
 */
function generateRecurrenceDates(
  startDate: string,
  endDate: string,
  targetDayOfWeek: number,
  frequency: 'weekly' | 'biweekly' = 'weekly'
): string[] {
  assertValidDateString(startDate, 'startDate');
  assertValidDateString(endDate, 'endDate');

  if (targetDayOfWeek < 0 || targetDayOfWeek > 6) {
    throw new DomainInvariantError(
      `Invalid dayOfWeek: must be between 0 (Sunday) and 6 (Saturday), got: ${targetDayOfWeek}`
    );
  }

  const [sY, sM, sD] = startDate.split('-').map(Number);
  const [eY, eM, eD] = endDate.split('-').map(Number);

  const start = new Date(Date.UTC(sY, sM - 1, sD));
  const end = new Date(Date.UTC(eY, eM - 1, eD));

  if (end.getTime() < start.getTime()) {
    throw new DomainInvariantError(
      `endDate (${endDate}) cannot be earlier than startDate (${startDate})`
    );
  }

  const dates: string[] = [];
  const current = new Date(start.getTime());

  // Advance to first matching day of week
  while (current.getUTCDay() !== targetDayOfWeek && current.getTime() <= end.getTime()) {
    current.setUTCDate(current.getUTCDate() + 1);
  }

  const stepDays = frequency === 'biweekly' ? 14 : 7;

  while (current.getTime() <= end.getTime()) {
    const y = current.getUTCFullYear();
    const m = String(current.getUTCMonth() + 1).padStart(2, '0');
    const d = String(current.getUTCDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    current.setUTCDate(current.getUTCDate() + stepDays);
  }

  return dates;
}

/**
 * Previews recurring booking slots against current active bookings.
 * Identifies any conflicts and automatically marks conflicting slots as skip = true by default.
 */
export function previewRecurringSlots(
  rule: RecurringRuleInput,
  existingBookings: TimeSlot[]
): RecurringPreviewResult {
  assertValidTimeString(rule.startTime, 'rule.startTime');
  assertValidTimeString(rule.endTime, 'rule.endTime');

  const dates = generateRecurrenceDates(
    rule.startDate,
    rule.endDate,
    rule.dayOfWeek,
    rule.frequency ?? 'weekly'
  );

  const previewItems: RecurringSlotPreviewItem[] = [];
  let totalConflicts = 0;

  for (let i = 0; i < dates.length; i++) {
    const dateStr = dates[i];
    const slot: TimeSlot = {
      date: dateStr,
      startTime: rule.startTime,
      endTime: rule.endTime,
    };

    const norm = normalizeSlot(slot);
    const overlapRes = checkStudioOverlap(existingBookings, slot);

    const hasConflict = overlapRes.hasOverlap;
    if (hasConflict) {
      totalConflicts++;
    }

    previewItems.push({
      index: i,
      date: dateStr,
      startTime: rule.startTime,
      endTime: rule.endTime,
      plannedMinutes: norm.durationMinutes,
      hasConflict,
      conflicts: overlapRes.conflicts,
      skip: hasConflict, // Auto-flag conflicting slots to be skipped
    });
  }

  return {
    totalGenerated: previewItems.length,
    totalConflicts,
    slots: previewItems,
  };
}

/**
 * Filters out skipped slots to produce finalized slots ready for persistent booking insert.
 */
export function filterCommitableSlots(
  slots: RecurringSlotPreviewItem[]
): RecurringSlotPreviewItem[] {
  return slots.filter((slot) => !slot.skip);
}
