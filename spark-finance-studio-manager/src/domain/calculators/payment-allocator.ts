/**
 * Pure Domain Calculator: Payment Allocator
 * Implements multi-target payment splitting, prevents over-allocation, and calculates unallocated credit.
 * Stored strictly in integer piasters (1 EGP = 100 piasters).
 */

import { TargetDue, AllocationResult, AllocationItem } from '../models/financial';
import { assertIntegerPiasters, DomainInvariantError } from '../rules/invariants';

export interface PaymentAllocationOptions {
  /**
   * If true, allows automatic sequential allocation of remaining funds to targets without explicit requestedPiasters.
   * Defaults to true.
   */
  autoFillRemaining?: boolean;
}

/**
 * Calculates allocation of a payment across multiple target obligations.
 *
 * Invariants:
 * 1. sum(allocated) <= paymentPiasters
 * 2. allocated per target <= target.duePiasters
 * 3. surplus = paymentPiasters - sum(allocated) >= 0 -> unallocatedCreditPiasters
 */
export function calculateAllocation(
  paymentPiasters: number,
  targets: TargetDue[],
  options: PaymentAllocationOptions = { autoFillRemaining: true }
): AllocationResult {
  assertIntegerPiasters(paymentPiasters, 'paymentPiasters');

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    assertIntegerPiasters(t.duePiasters, `targets[${i}].duePiasters`);
    if (t.requestedPiasters !== undefined) {
      assertIntegerPiasters(t.requestedPiasters, `targets[${i}].requestedPiasters`);
      if (t.requestedPiasters > t.duePiasters) {
        throw new DomainInvariantError(
          `Over-allocation rejected: requested allocation of ${t.requestedPiasters} piasters exceeds due amount of ${t.duePiasters} piasters for target ${t.targetId}`
        );
      }
    }
  }

  // Check sum of explicit requests against total payment
  const sumExplicitRequested = targets.reduce((sum, t) => sum + (t.requestedPiasters ?? 0), 0);
  if (sumExplicitRequested > paymentPiasters) {
    throw new DomainInvariantError(
      `Sum of explicitly requested allocations (${sumExplicitRequested} piasters) exceeds total payment amount (${paymentPiasters} piasters)`
    );
  }

  let remainingToAllocate = paymentPiasters;
  const allocations: AllocationItem[] = [];

  // Pass 1: Apply explicit requested allocations
  for (const target of targets) {
    if (target.requestedPiasters !== undefined) {
      const alloc = Math.min(target.requestedPiasters, remainingToAllocate, target.duePiasters);
      remainingToAllocate -= alloc;
      allocations.push({
        targetType: target.targetType,
        targetId: target.targetId,
        allocatedPiasters: alloc,
        remainingDuePiasters: target.duePiasters - alloc,
      });
    } else {
      // Placeholder for pass 2
      allocations.push({
        targetType: target.targetType,
        targetId: target.targetId,
        allocatedPiasters: 0,
        remainingDuePiasters: target.duePiasters,
      });
    }
  }

  // Pass 2: If autoFillRemaining is enabled and funds remain, allocate sequentially to unallocated targets
  if (options.autoFillRemaining !== false && remainingToAllocate > 0) {
    for (let i = 0; i < targets.length; i++) {
      if (remainingToAllocate === 0) break;
      const target = targets[i];
      if (target.requestedPiasters === undefined) {
        const remainingTargetDue = allocations[i].remainingDuePiasters;
        if (remainingTargetDue > 0) {
          const alloc = Math.min(remainingToAllocate, remainingTargetDue);
          allocations[i].allocatedPiasters += alloc;
          allocations[i].remainingDuePiasters -= alloc;
          remainingToAllocate -= alloc;
        }
      }
    }
  }

  const totalAllocatedPiasters = allocations.reduce((sum, a) => sum + a.allocatedPiasters, 0);
  const unallocatedCreditPiasters = paymentPiasters - totalAllocatedPiasters;

  if (totalAllocatedPiasters > paymentPiasters) {
    throw new DomainInvariantError(
      `Invariant violation: total allocated (${totalAllocatedPiasters}) exceeds payment (${paymentPiasters})`
    );
  }

  if (unallocatedCreditPiasters < 0) {
    throw new DomainInvariantError(
      `Invariant violation: unallocated credit cannot be negative (${unallocatedCreditPiasters})`
    );
  }

  return {
    totalPaymentPiasters: paymentPiasters,
    totalAllocatedPiasters,
    unallocatedCreditPiasters,
    allocations,
  };
}
