/**
 * Domain Models for Contracts, Subscriptions, Website Projects & Dues
 */

export type ContractStatus = 'draft' | 'active' | 'paused' | 'ended' | 'cancelled';

export type DueStatus = 'upcoming' | 'due' | 'partial' | 'paid' | 'overdue';

export type WebsiteProjectStatus =
  | 'new'
  | 'in_progress'
  | 'waiting'
  | 'completed'
  | 'cancelled';

export interface DueEvaluationResult {
  status: DueStatus;
  daysOverdue: number;
  remainingPiasters: number;
  dueDate: string;
  referenceDate: string;
}
