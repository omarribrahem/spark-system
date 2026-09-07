import { describe, it, expect } from 'vitest';
import {
  previewRecurringSlots,
  filterCommitableSlots,
} from '../../../src/domain/calculators/recurring-booking-engine';
import { RecurringRuleInput, TimeSlot } from '../../../src/domain/models/booking';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Recurring Booking Engine Pure Domain Calculator', () => {
  it('generates weekly occurrences matching day of week', () => {
    // Every Saturday (dayOfWeek = 6) from 2026-09-05 to 2026-09-26
    const rule: RecurringRuleInput = {
      clientId: 'c-1',
      dayOfWeek: 6, // Saturday
      startTime: '14:00',
      endTime: '16:00',
      startDate: '2026-09-05',
      endDate: '2026-09-26',
      frequency: 'weekly',
    };

    const preview = previewRecurringSlots(rule, []);

    // Sept 5, 12, 19, 26 -> 4 Saturdays
    expect(preview.totalGenerated).toBe(4);
    expect(preview.totalConflicts).toBe(0);
    expect(preview.slots.map((s) => s.date)).toEqual([
      '2026-09-05',
      '2026-09-12',
      '2026-09-19',
      '2026-09-26',
    ]);
    expect(preview.slots.every((s) => !s.hasConflict && !s.skip)).toBe(true);
  });

  it('generates biweekly occurrences', () => {
    const rule: RecurringRuleInput = {
      clientId: 'c-1',
      dayOfWeek: 6,
      startTime: '14:00',
      endTime: '16:00',
      startDate: '2026-09-05',
      endDate: '2026-09-26',
      frequency: 'biweekly',
    };

    const preview = previewRecurringSlots(rule, []);

    // Sept 5 and Sept 19
    expect(preview.totalGenerated).toBe(2);
    expect(preview.slots.map((s) => s.date)).toEqual(['2026-09-05', '2026-09-19']);
  });

  it('identifies conflicting occurrences and flags them as skip = true', () => {
    const existingBookings: TimeSlot[] = [
      // Conflict on Sept 12 at 15:00-17:00
      {
        id: 'existing-12',
        date: '2026-09-12',
        startTime: '15:00',
        endTime: '17:00',
      },
    ];

    const rule: RecurringRuleInput = {
      clientId: 'c-1',
      dayOfWeek: 6,
      startTime: '14:00',
      endTime: '16:00',
      startDate: '2026-09-05',
      endDate: '2026-09-26',
      frequency: 'weekly',
    };

    const preview = previewRecurringSlots(rule, existingBookings);

    expect(preview.totalGenerated).toBe(4);
    expect(preview.totalConflicts).toBe(1);

    // Slot 0 (Sept 5): clean
    expect(preview.slots[0].hasConflict).toBe(false);
    expect(preview.slots[0].skip).toBe(false);

    // Slot 1 (Sept 12): conflict
    expect(preview.slots[1].hasConflict).toBe(true);
    expect(preview.slots[1].skip).toBe(true);
    expect(preview.slots[1].conflicts).toHaveLength(1);

    // Filter commitable slots
    const commitable = filterCommitableSlots(preview.slots);
    expect(commitable).toHaveLength(3);
    expect(commitable.map((s) => s.date)).toEqual([
      '2026-09-05',
      '2026-09-19',
      '2026-09-26',
    ]);
  });

  it('allows manual override to skip additional slots before commit', () => {
    const rule: RecurringRuleInput = {
      clientId: 'c-1',
      dayOfWeek: 6,
      startTime: '10:00',
      endTime: '12:00',
      startDate: '2026-09-05',
      endDate: '2026-09-19',
      frequency: 'weekly',
    };

    const preview = previewRecurringSlots(rule, []);
    expect(preview.totalGenerated).toBe(3);

    // Manually mark slot index 2 as skip
    preview.slots[2].skip = true;

    const finalized = filterCommitableSlots(preview.slots);
    expect(finalized).toHaveLength(2);
    expect(finalized.map((s) => s.date)).toEqual(['2026-09-05', '2026-09-12']);
  });

  it('rejects endDate earlier than startDate', () => {
    const rule: RecurringRuleInput = {
      clientId: 'c-1',
      dayOfWeek: 1,
      startTime: '10:00',
      endTime: '12:00',
      startDate: '2026-09-20',
      endDate: '2026-09-10',
    };

    expect(() => previewRecurringSlots(rule, [])).toThrow(DomainInvariantError);
  });
});
