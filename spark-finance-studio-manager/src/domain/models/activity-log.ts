/**
 * Domain Models for Activity Log & Audit Trail
 */

export type ActivityAction =
  | 'PAYMENT_CREATED'
  | 'PAYMENT_VOIDED'
  | 'BOOKING_CREATED'
  | 'BOOKING_CANCELLED'
  | 'HOURS_RESTORED'
  | 'PACKAGE_CREATED'
  | 'PACKAGE_CONSUMED'
  | 'CONTRACT_CREATED'
  | 'CONTRACT_PAUSED'
  | 'CONTRACT_ENDED'
  | 'CLIENT_CREATED'
  | 'CLIENT_UPDATED'
  | 'CLIENT_ARCHIVED'
  | 'CLIENT_UNARCHIVED'
  | 'EXPENSE_CREATED';

export interface ActivityLogRecord {
  id: string;
  action: ActivityAction | string;
  entityType: string;
  entityId: string;
  timestamp: string;
  note?: string | null;
  payloadJson?: string | null;
}

export interface CreateActivityLogInput {
  action: ActivityAction | string;
  entityType: string;
  entityId: string;
  note?: string | null;
  payload?: Record<string, unknown> | null;
}
