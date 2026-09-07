/**
 * Pure Domain Calculator: Payment Voiding Engine
 * Calculates allocation rollbacks, due status reversion, and enforces mandatory reason logging.
 */

import { TargetObligationType } from '../models/financial';
import { assertNonEmptyString, DomainInvariantError } from '../rules/invariants';

export interface AllocationToRollback {
  allocationId: string;
  paymentId: string;
  targetType: TargetObligationType;
  targetId: string;
  amountPiasters: number;
}

export interface TargetDueStateBeforeRollback {
  targetId: string;
  targetType: TargetObligationType;
  baseAmountPiasters: number;
  currentPaidPiasters: number;
  dueDate?: string;
}

export interface RevertedDueState {
  targetId: string;
  targetType: TargetObligationType;
  baseAmountPiasters: number;
  newPaidPiasters: number;
  newRemainingPiasters: number;
  newStatus: 'paid' | 'partial' | 'due' | 'overdue' | 'upcoming';
}

export interface PaymentVoidPlan {
  paymentId: string;
  voidReason: string;
  totalRollbackPiasters: number;
  allocationsToRollback: AllocationToRollback[];
  revertedTargets: RevertedDueState[];
  auditLogPayload: {
    action: 'PAYMENT_VOIDED';
    entityType: 'payment';
    entityId: string;
    note: string;
    payload: {
      voidReason: string;
      rolledBackAllocationsCount: number;
      totalRollbackPiasters: number;
    };
  };
}

/**
 * Validates and prepares a payment voiding execution plan.
 *
 * Invariants:
 * 1. currentPaymentStatus must be 'active'. Cannot void an already voided payment.
 * 2. voidReason must be a non-empty string.
 * 3. All allocations under this payment must be rolled back to target obligations.
 */
export function planPaymentVoiding(
  paymentId: string,
  currentPaymentStatus: 'active' | 'void',
  voidReason: string,
  allocations: AllocationToRollback[],
  targetStates: TargetDueStateBeforeRollback[] = [],
  referenceDate: string = new Date().toISOString().split('T')[0]
): PaymentVoidPlan {
  assertNonEmptyString(paymentId, 'paymentId');
  const sanitizedReason = assertNonEmptyString(voidReason, 'voidReason');

  if (currentPaymentStatus === 'void') {
    throw new DomainInvariantError(
      `Payment ${paymentId} has already been voided and cannot be voided again.`
    );
  }

  const totalRollbackPiasters = allocations.reduce(
    (sum, alloc) => sum + alloc.amountPiasters,
    0
  );

  // Group allocations by targetId
  const rollbackByTarget = new Map<string, number>();
  for (const alloc of allocations) {
    const prev = rollbackByTarget.get(alloc.targetId) ?? 0;
    rollbackByTarget.set(alloc.targetId, prev + alloc.amountPiasters);
  }

  // Calculate reverted states for each target
  const revertedTargets: RevertedDueState[] = [];
  for (const target of targetStates) {
    const rollbackAmount = rollbackByTarget.get(target.targetId) ?? 0;
    const newPaid = Math.max(0, target.currentPaidPiasters - rollbackAmount);
    const newRemaining = Math.max(0, target.baseAmountPiasters - newPaid);

    let newStatus: RevertedDueState['newStatus'] = 'due';
    if (newRemaining === 0) {
      newStatus = 'paid';
    } else if (newPaid > 0) {
      newStatus = 'partial';
    } else if (target.dueDate && referenceDate > target.dueDate) {
      newStatus = 'overdue';
    } else if (target.dueDate && referenceDate < target.dueDate) {
      newStatus = 'upcoming';
    } else {
      newStatus = 'due';
    }

    revertedTargets.push({
      targetId: target.targetId,
      targetType: target.targetType,
      baseAmountPiasters: target.baseAmountPiasters,
      newPaidPiasters: newPaid,
      newRemainingPiasters: newRemaining,
      newStatus,
    });
  }

  return {
    paymentId,
    voidReason: sanitizedReason,
    totalRollbackPiasters,
    allocationsToRollback: allocations,
    revertedTargets,
    auditLogPayload: {
      action: 'PAYMENT_VOIDED',
      entityType: 'payment',
      entityId: paymentId,
      note: sanitizedReason,
      payload: {
        voidReason: sanitizedReason,
        rolledBackAllocationsCount: allocations.length,
        totalRollbackPiasters,
      },
    },
  };
}
