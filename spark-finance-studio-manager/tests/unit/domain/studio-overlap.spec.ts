import { describe, it, expect } from 'vitest';
import {
  checkStudioOverlap,
  normalizeSlot,
} from '../../../src/domain/calculators/studio-overlap';
import { TimeSlot } from '../../../src/domain/models/booking';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Studio Overlap Detection Pure Domain Calculator', () => {
  describe('Standard Same-Day Overlaps', () => {
    const existingBookings: TimeSlot[] = [
      { id: 'b-1', date: '2026-09-06', startTime: '14:00', endTime: '16:00' },
      { id: 'b-2', date: '2026-09-06', startTime: '18:00', endTime: '20:00' },
    ];

    it('detects partial overlap when proposed booking starts during an existing booking', () => {
      const proposed: TimeSlot = {
        date: '2026-09-06',
        startTime: '15:30',
        endTime: '17:00',
      };

      const result = checkStudioOverlap(existingBookings, proposed);

      expect(result.hasOverlap).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].existingSlot.id).toBe('b-1');
      expect(result.conflicts[0].overlapMinutes).toBe(30); // 15:30 to 16:00
    });

    it('detects partial overlap when proposed booking ends during an existing booking', () => {
      const proposed: TimeSlot = {
        date: '2026-09-06',
        startTime: '13:00',
        endTime: '14:30',
      };

      const result = checkStudioOverlap(existingBookings, proposed);

      expect(result.hasOverlap).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].overlapMinutes).toBe(30); // 14:00 to 14:30
    });

    it('detects complete containment when proposed booking is inside existing booking', () => {
      const proposed: TimeSlot = {
        date: '2026-09-06',
        startTime: '14:15',
        endTime: '15:45',
      };

      const result = checkStudioOverlap(existingBookings, proposed);

      expect(result.hasOverlap).toBe(true);
      expect(result.conflicts[0].overlapMinutes).toBe(90); // 14:15 to 15:45
    });

    it('detects complete enclosure when proposed booking fully encloses existing booking', () => {
      const proposed: TimeSlot = {
        date: '2026-09-06',
        startTime: '13:00',
        endTime: '17:00',
      };

      const result = checkStudioOverlap(existingBookings, proposed);

      expect(result.hasOverlap).toBe(true);
      expect(result.conflicts[0].overlapMinutes).toBe(120); // 14:00 to 16:00
    });

    it('permits back-to-back abutting bookings (zero overlap when start equals existing end)', () => {
      // Abutting after b-1: 16:00 to 18:00 (between b-1 16:00 and b-2 18:00)
      const proposed: TimeSlot = {
        date: '2026-09-06',
        startTime: '16:00',
        endTime: '18:00',
      };

      const result = checkStudioOverlap(existingBookings, proposed);

      expect(result.hasOverlap).toBe(false);
      expect(result.conflicts).toHaveLength(0);
    });

    it('ignores the booking itself when comparing with its own ID during an update', () => {
      const updatingSlot: TimeSlot = {
        id: 'b-1',
        date: '2026-09-06',
        startTime: '14:00',
        endTime: '16:00',
      };

      const result = checkStudioOverlap(existingBookings, updatingSlot);

      expect(result.hasOverlap).toBe(false);
    });
  });

  describe('Midnight Crossing Normalization & Conflicts', () => {
    it('normalizes midnight crossing slot where end time is on the next day', () => {
      const nightSlot: TimeSlot = {
        date: '2026-09-06',
        startTime: '23:00',
        endTime: '02:00', // crosses midnight into 2026-09-07
      };

      const norm = normalizeSlot(nightSlot);

      expect(norm.durationMinutes).toBe(180); // 3 hours
      expect(norm.startIso).toContain('2026-09-06T23:00:00.000Z');
      expect(norm.endIso).toContain('2026-09-07T02:00:00.000Z');
    });

    it('detects conflict between a midnight-crossing session and an early-morning next-day session', () => {
      // Session 1: Saturday night 23:00 to 01:30 (Sunday morning)
      const existing: TimeSlot[] = [
        {
          id: 'late-night-session',
          date: '2026-09-06',
          startTime: '23:00',
          endTime: '01:30',
        },
      ];

      // Proposed Session 2: Sunday morning 01:00 to 03:00
      const proposedNextDay: TimeSlot = {
        date: '2026-09-07',
        startTime: '01:00',
        endTime: '03:00',
      };

      const result = checkStudioOverlap(existing, proposedNextDay);

      expect(result.hasOverlap).toBe(true);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].existingSlot.id).toBe('late-night-session');
      expect(result.conflicts[0].overlapMinutes).toBe(30); // 01:00 to 01:30
    });

    it('permits early morning next-day session starting after the midnight-crossing session ends', () => {
      const existing: TimeSlot[] = [
        {
          id: 'late-night-session',
          date: '2026-09-06',
          startTime: '23:00',
          endTime: '01:00',
        },
      ];

      // Starts right at 01:00 on next day
      const proposedNextDay: TimeSlot = {
        date: '2026-09-07',
        startTime: '01:00',
        endTime: '03:00',
      };

      const result = checkStudioOverlap(existing, proposedNextDay);

      expect(result.hasOverlap).toBe(false);
    });
  });

  describe('Validation & Invariants', () => {
    it('throws DomainInvariantError on invalid date format', () => {
      const invalidSlot: TimeSlot = {
        date: '06/09/2026',
        startTime: '14:00',
        endTime: '16:00',
      };

      expect(() => normalizeSlot(invalidSlot)).toThrow(DomainInvariantError);
    });

    it('throws DomainInvariantError on invalid time format', () => {
      const invalidSlot: TimeSlot = {
        date: '2026-09-06',
        startTime: '25:00',
        endTime: '16:00',
      };

      expect(() => normalizeSlot(invalidSlot)).toThrow(DomainInvariantError);
    });
  });
});
