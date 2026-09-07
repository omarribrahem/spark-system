/**
 * Domain Models for Financial Calculations & Payments
 * All monetary amounts are strictly in integer piasters (1 EGP = 100 piasters).
 */

export type TargetObligationType =
  | 'marketing_due'
  | 'subscription_due'
  | 'website_project'
  | 'client_package'
  | 'studio_booking'
  | 'custom';

export type PaymentMethod = 'cash' | 'vodafone_cash' | 'instapay' | 'bank_transfer';

export type PaymentStatus = 'active' | 'void';

export interface TargetDue {
  targetType: TargetObligationType;
  targetId: string;
  duePiasters: number;
  requestedPiasters?: number; // Optional specific allocation amount requested by user
}

export interface AllocationItem {
  targetType: TargetObligationType;
  targetId: string;
  allocatedPiasters: number;
  remainingDuePiasters: number;
}

export interface AllocationResult {
  totalPaymentPiasters: number;
  totalAllocatedPiasters: number;
  unallocatedCreditPiasters: number;
  allocations: AllocationItem[];
}

export interface PaymentVoidResult {
  paymentId: string;
  voidReason: string;
  timestamp: string;
  restoredAllocations: Array<{
    targetType: TargetObligationType;
    targetId: string;
    restoredPiasters: number;
  }>;
}
