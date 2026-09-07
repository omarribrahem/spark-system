import { describe, it, expect } from 'vitest';
import {
  calculateDueStatus,
  diffCalendarDays,
} from '../../../src/domain/calculators/due-calculator';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Due Calculator Pure Domain Calculator', () => {
  describe('Calendar Days Calculation', () => {
    it('calculates calendar difference accurately across month boundaries', () => {
      expect(diffCalendarDays('2026-03-01', '2026-02-28')).toBe(1);
      expect(diffCalendarDays('2026-09-10', '2026-09-05')).toBe(5);
      expect(diffCalendarDays('2026-09-05', '2026-09-10')).toBe(-5);
      expect(diffCalendarDays('2026-09-05', '2026-09-05')).toBe(0);
    });
  });

  describe('calculateDueStatus', () => {
    it('returns PAID when remainingPiasters is 0', () => {
      const result = calculateDueStatus('2026-09-01', '2026-09-06', 0);

      expect(result.status).toBe('PAID');
      expect(result.detailedStatus).toBe('paid');
      expect(result.daysOverdue).toBe(0);
      expect(result.isOverdue).toBe(false);
      expect(result.remainingPiasters).toBe(0);
    });

    it('returns OVERDUE with exact day count when referenceDate > dueDate and remaining > 0', () => {
      // Due on Sept 1st, checked on Sept 6th (5 days overdue)
      const result = calculateDueStatus('2026-09-01', '2026-09-06', 50000);

      expect(result.status).toBe('OVERDUE');
      expect(result.detailedStatus).toBe('overdue');
      expect(result.daysOverdue).toBe(5);
      expect(result.isOverdue).toBe(true);
      expect(result.remainingPiasters).toBe(50000);
    });

    it('returns PENDING with detailedStatus "due" when referenceDate equals dueDate', () => {
      const result = calculateDueStatus('2026-09-06', '2026-09-06', 50000);

      expect(result.status).toBe('PENDING');
      expect(result.detailedStatus).toBe('due');
      expect(result.daysOverdue).toBe(0);
      expect(result.isOverdue).toBe(false);
    });

    it('returns PENDING with detailedStatus "upcoming" when referenceDate is before dueDate', () => {
      const result = calculateDueStatus('2026-09-15', '2026-09-06', 50000);

      expect(result.status).toBe('PENDING');
      expect(result.detailedStatus).toBe('upcoming');
      expect(result.daysOverdue).toBe(0);
      expect(result.isOverdue).toBe(false);
    });

    it('identifies partially paid obligations before due date', () => {
      // Base: 100,000 piasters. Remaining: 40,000 piasters (60,000 paid)
      const result = calculateDueStatus('2026-09-20', '2026-09-06', 40000, 100000);

      expect(result.status).toBe('PENDING');
      expect(result.detailedStatus).toBe('partial');
      expect(result.daysOverdue).toBe(0);
    });

    it('identifies partially paid obligations that became overdue', () => {
      const result = calculateDueStatus('2026-09-01', '2026-09-06', 40000, 100000);

      expect(result.status).toBe('OVERDUE');
      expect(result.detailedStatus).toBe('overdue');
      expect(result.daysOverdue).toBe(5);
    });

    it('rejects invalid date formats', () => {
      expect(() => calculateDueStatus('2026/09/01', '2026-09-06', 50000)).toThrow(
        DomainInvariantError
      );
    });

    it('rejects negative remaining piasters', () => {
      expect(() => calculateDueStatus('2026-09-01', '2026-09-06', -100)).toThrow(
        DomainInvariantError
      );
    });
  });
});
