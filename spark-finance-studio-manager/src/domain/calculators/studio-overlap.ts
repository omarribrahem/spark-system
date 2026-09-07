/**
 * Pure Domain Calculator: Studio Booking Overlap Engine
 * Enforces the strict overlap invariant: S_new < E_exist AND E_new > S_exist
 * Uses full ISO timestamp and epoch minute normalization to correctly handle midnight crossing.
 */

import { TimeSlot, OverlapResult, ConflictDetail } from '../models/booking';
import {
  assertValidDateString,
  assertValidTimeString,
  DomainInvariantError,
} from '../rules/invariants';

export interface NormalizedSlot {
  id?: string;
  original: TimeSlot;
  startEpochMinutes: number;
  endEpochMinutes: number;
  durationMinutes: number;
  startIso: string;
  endIso: string;
}

/**
 * Normalizes a date string 'YYYY-MM-DD' and time 'HH:MM' into absolute epoch minutes.
 * If endTime <= startTime, the session is treated as crossing midnight into the next calendar day.
 */
export function normalizeSlot(slot: TimeSlot): NormalizedSlot {
  assertValidDateString(slot.date, 'slot.date');
  assertValidTimeString(slot.startTime, 'slot.startTime');
  assertValidTimeString(slot.endTime, 'slot.endTime');

  const [year, month, day] = slot.date.split('-').map(Number);
  const [startH, startM] = slot.startTime.split(':').map(Number);
  const [endH, endM] = slot.endTime.split(':').map(Number);

  // UTC Date representation for unambiguous minute math
  const startDate = new Date(Date.UTC(year, month - 1, day, startH, startM, 0, 0));
  let endDate = new Date(Date.UTC(year, month - 1, day, endH, endM, 0, 0));

  // If end time is earlier or equal to start time, the booking crosses midnight into the next day
  if (endDate.getTime() <= startDate.getTime()) {
    endDate = new Date(Date.UTC(year, month - 1, day + 1, endH, endM, 0, 0));
  }

  const startEpochMinutes = Math.floor(startDate.getTime() / 60000);
  const endEpochMinutes = Math.floor(endDate.getTime() / 60000);
  const durationMinutes = endEpochMinutes - startEpochMinutes;

  if (durationMinutes <= 0) {
    throw new DomainInvariantError(
      `Invalid booking duration: end time must be after start time. Got duration: ${durationMinutes} mins`
    );
  }

  return {
    id: slot.id,
    original: slot,
    startEpochMinutes,
    endEpochMinutes,
    durationMinutes,
    startIso: startDate.toISOString(),
    endIso: endDate.toISOString(),
  };
}

/**
 * Checks whether a proposed studio time slot conflicts with any existing active slots.
 *
 * Overlap Condition:
 * S_new < E_exist AND E_new > S_exist
 *
 * Abutting sessions (e.g. S_new == E_exist or E_new == S_exist) do NOT overlap.
 */
export function checkStudioOverlap(
  existingSlots: TimeSlot[],
  proposedSlot: TimeSlot
): OverlapResult {
  const normProposed = normalizeSlot(proposedSlot);
  const conflicts: ConflictDetail[] = [];

  for (const existing of existingSlots) {
    // Ignore self when updating an existing booking
    if (proposedSlot.id && existing.id && proposedSlot.id === existing.id) {
      continue;
    }

    const normExisting = normalizeSlot(existing);

    // Overlap condition in epoch minutes
    const overlaps =
      normProposed.startEpochMinutes < normExisting.endEpochMinutes &&
      normProposed.endEpochMinutes > normExisting.startEpochMinutes;

    if (overlaps) {
      const overlapStartEpoch = Math.max(
        normProposed.startEpochMinutes,
        normExisting.startEpochMinutes
      );
      const overlapEndEpoch = Math.min(
        normProposed.endEpochMinutes,
        normExisting.endEpochMinutes
      );
      const overlapMinutes = Math.max(0, overlapEndEpoch - overlapStartEpoch);

      conflicts.push({
        existingSlot: existing,
        overlapStart: new Date(overlapStartEpoch * 60000).toISOString(),
        overlapEnd: new Date(overlapEndEpoch * 60000).toISOString(),
        overlapMinutes,
      });
    }
  }

  return {
    hasOverlap: conflicts.length > 0,
    conflicts,
  };
}
