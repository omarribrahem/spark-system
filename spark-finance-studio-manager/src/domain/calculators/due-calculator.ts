/**
 * Pure Domain Calculator: Due & Overdue Calculator
 * Evaluates obligation due dates against reference dates, calculates overdue days,
 * and determines financial due status (PAID | PENDING | OVERDUE).
 */

import { assertIntegerPiasters, assertValidDateString } from '../rules/invariants';

export type SimpleDueStatus = 'PAID' | 'PENDING' | 'OVERDUE';

export interface DueCalculationResult {
  status: SimpleDueStatus;
  detailedStatus: 'paid' | 'partial' | 'due' | 'overdue' | 'upcoming';
  daysOverdue: number;
  remainingPiasters: number;
  isOverdue: boolean;
  dueDate: string;
  referenceDate: string;
}

/**
 * Calculates calendar day difference between two 'YYYY-MM-DD' dates.
 * Positive if dateA > dateB (dateA is after dateB).
 */
export function diffCalendarDays(dateA: string, dateB: string): number {
  assertValidDateString(dateA, 'dateA');
  assertValidDateString(dateB, 'dateB');

  const [yA, mA, dA] = dateA.split('-').map(Number);
  const [yB, mB, dB] = dateB.split('-').map(Number);

  const utcA = Date.UTC(yA, mA - 1, dA);
  const utcB = Date.UTC(yB, mB - 1, dB);

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((utcA - utcB) / msPerDay);
}

/**
 * Calculates due status and overdue duration.
 *
 * Rules:
 * 1. If remainingPiasters <= 0, status is 'PAID' (detailed: 'paid'), daysOverdue = 0.
 * 2. If remainingPiasters > 0:
 *    - If referenceDate > dueDate, status is 'OVERDUE' (detailed: 'overdue'), daysOverdue = diffDays.
 *    - If referenceDate == dueDate, status is 'PENDING' (detailed: 'due'), daysOverdue = 0.
 *    - If referenceDate < dueDate, status is 'PENDING' (detailed: 'upcoming'), daysOverdue = 0.
 */
export function calculateDueStatus(
  dueDate: string,
  referenceDate: string,
  remainingPiasters: number,
  baseAmountPiasters?: number
): DueCalculationResult {
  assertValidDateString(dueDate, 'dueDate');
  assertValidDateString(referenceDate, 'referenceDate');
  assertIntegerPiasters(remainingPiasters, 'remainingPiasters');

  if (baseAmountPiasters !== undefined) {
    assertIntegerPiasters(baseAmountPiasters, 'baseAmountPiasters');
  }

  if (remainingPiasters === 0) {
    return {
      status: 'PAID',
      detailedStatus: 'paid',
      daysOverdue: 0,
      remainingPiasters: 0,
      isOverdue: false,
      dueDate,
      referenceDate,
    };
  }

  const daysDifference = diffCalendarDays(referenceDate, dueDate);

  if (daysDifference > 0) {
    return {
      status: 'OVERDUE',
      detailedStatus: 'overdue',
      daysOverdue: daysDifference,
      remainingPiasters,
      isOverdue: true,
      dueDate,
      referenceDate,
    };
  }

  // Not overdue yet
  const isPartiallyPaid =
    baseAmountPiasters !== undefined &&
    baseAmountPiasters > remainingPiasters &&
    remainingPiasters > 0;

  const detailedStatus = isPartiallyPaid
    ? 'partial'
    : daysDifference === 0
    ? 'due'
    : 'upcoming';

  return {
    status: 'PENDING',
    detailedStatus,
    daysOverdue: 0,
    remainingPiasters,
    isOverdue: false,
    dueDate,
    referenceDate,
  };
}
