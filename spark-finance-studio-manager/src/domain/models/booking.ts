/**
 * Domain Models for Studio Booking & Scheduling
 * Durations are strictly in integer minutes.
 */

export type BookingStatus =
  | 'scheduled'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface TimeSlot {
  id?: string;
  date: string; // ISO format 'YYYY-MM-DD'
  startTime: string; // 'HH:MM' (24-hour)
  endTime: string; // 'HH:MM' (24-hour)
}

export interface ConflictDetail {
  existingSlot: TimeSlot;
  overlapStart: string; // ISO datetime or normalized minutes
  overlapEnd: string;
  overlapMinutes: number;
}

export interface OverlapResult {
  hasOverlap: boolean;
  conflicts: ConflictDetail[];
}

export interface RecurringRuleInput {
  clientId: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  frequency?: 'weekly' | 'biweekly';
  clientPackageId?: string;
  notes?: string;
}

export interface RecurringSlotPreviewItem {
  index: number;
  date: string; // 'YYYY-MM-DD'
  startTime: string;
  endTime: string;
  plannedMinutes: number;
  hasConflict: boolean;
  conflicts: ConflictDetail[];
  skip: boolean;
}

export interface RecurringPreviewResult {
  totalGenerated: number;
  totalConflicts: number;
  slots: RecurringSlotPreviewItem[];
}
