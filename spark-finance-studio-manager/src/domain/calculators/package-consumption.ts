/**
 * Pure Domain Calculator: Package Consumption Engine
 * Handles decoupled tracking for minutes (studio hours) and reel units.
 * Supports planned vs actual session reconciliation and FIFO multi-package depletion.
 */

import {
  PackageUnit,
  PackageBalance,
  PackageConsumptionResult,
} from '../models/package';
import { assertIntegerMinutes, DomainInvariantError } from '../rules/invariants';

export interface ConsumablePackageItem {
  clientPackageId: string;
  packageItemId?: string;
  unit: PackageUnit;
  purchasedQuantity: number; // minutes for hours, units for reels
  usedQuantity: number;
  reservedQuantity: number;
}

/**
 * Calculates current package balance for an entitlement item.
 */
export function calculatePackageBalance(
  purchasedQuantity: number,
  usedQuantity: number,
  reservedQuantity: number = 0
): PackageBalance {
  assertIntegerMinutes(purchasedQuantity, 'purchasedQuantity');
  assertIntegerMinutes(usedQuantity, 'usedQuantity');
  assertIntegerMinutes(reservedQuantity, 'reservedQuantity');

  if (usedQuantity + reservedQuantity > purchasedQuantity) {
    throw new DomainInvariantError(
      `Total consumed and reserved units (${usedQuantity + reservedQuantity}) exceed purchased units (${purchasedQuantity})`
    );
  }

  const remainingAvailableQuantity = purchasedQuantity - (usedQuantity + reservedQuantity);
  const totalRemainingQuantity = purchasedQuantity - usedQuantity;

  return {
    purchasedQuantity,
    usedQuantity,
    reservedQuantity,
    remainingAvailableQuantity,
    totalRemainingQuantity,
  };
}

/**
 * Reconciles package consumption when additional minutes are consumed or adjusted.
 */
export function reconcilePackageConsumption(
  purchasedMinutes: number,
  consumedMinutes: number,
  deltaMinutes: number = 0
): PackageBalance {
  assertIntegerMinutes(purchasedMinutes, 'purchasedMinutes');
  assertIntegerMinutes(consumedMinutes, 'consumedMinutes');
  
  if (typeof deltaMinutes !== 'number' || !Number.isInteger(deltaMinutes)) {
    throw new DomainInvariantError(`deltaMinutes must be an integer, got: ${deltaMinutes}`);
  }

  const newUsed = consumedMinutes + deltaMinutes;
  if (newUsed < 0) {
    throw new DomainInvariantError(`Reconciliation result in negative used minutes: ${newUsed}`);
  }
  if (newUsed > purchasedMinutes) {
    throw new DomainInvariantError(
      `Reconciled used minutes (${newUsed}) exceed purchased minutes (${purchasedMinutes})`
    );
  }

  return calculatePackageBalance(purchasedMinutes, newUsed, 0);
}

/**
 * Reconciles planned vs actual session duration for a studio booking linked to a package.
 * When a session finishes:
 * - Releases the planned reserved minutes.
 * - Records the actual minutes as consumed.
 */
export function reconcilePlannedVsActual(
  plannedMinutes: number,
  actualMinutes: number,
  currentlyReservedMinutes: number,
  currentlyUsedMinutes: number,
  totalPurchasedMinutes: number
): {
  newReservedMinutes: number;
  newUsedMinutes: number;
  deltaMinutes: number;
  remainingAvailableMinutes: number;
} {
  assertIntegerMinutes(plannedMinutes, 'plannedMinutes');
  assertIntegerMinutes(actualMinutes, 'actualMinutes');
  assertIntegerMinutes(currentlyReservedMinutes, 'currentlyReservedMinutes');
  assertIntegerMinutes(currentlyUsedMinutes, 'currentlyUsedMinutes');
  assertIntegerMinutes(totalPurchasedMinutes, 'totalPurchasedMinutes');

  // Release the planned reservation
  const reservationToRelease = Math.min(plannedMinutes, currentlyReservedMinutes);
  const newReservedMinutes = currentlyReservedMinutes - reservationToRelease;

  // Add the actual consumed minutes
  const newUsedMinutes = currentlyUsedMinutes + actualMinutes;
  const deltaMinutes = actualMinutes - plannedMinutes;

  if (newUsedMinutes + newReservedMinutes > totalPurchasedMinutes) {
    throw new DomainInvariantError(
      `Actual duration of ${actualMinutes} minutes exceeds available package balance. Available: ${totalPurchasedMinutes - currentlyUsedMinutes} minutes.`
    );
  }

  const remainingAvailableMinutes = totalPurchasedMinutes - (newUsedMinutes + newReservedMinutes);

  return {
    newReservedMinutes,
    newUsedMinutes,
    deltaMinutes,
    remainingAvailableMinutes,
  };
}

/**
 * Consumes units (minutes or reels) across multiple packages following FIFO order.
 * Earlier packages in the array are consumed before subsequent ones.
 */
export function consumeUnitsFIFO(
  items: ConsumablePackageItem[],
  unit: PackageUnit,
  amountToConsume: number
): PackageConsumptionResult {
  if (typeof amountToConsume !== 'number' || !Number.isInteger(amountToConsume) || amountToConsume < 0) {
    throw new DomainInvariantError(`amountToConsume must be a non-negative integer, got: ${amountToConsume}`);
  }

  let remainingNeeded = amountToConsume;
  const depletions: PackageConsumptionResult['depletions'] = [];

  // Filter matching unit
  const eligibleItems = items.filter((item) => item.unit === unit);

  for (const item of eligibleItems) {
    if (remainingNeeded === 0) break;

    const available = item.purchasedQuantity - item.usedQuantity - item.reservedQuantity;
    if (available <= 0) continue;

    const take = Math.min(available, remainingNeeded);
    const newUsed = item.usedQuantity + take;

    depletions.push({
      clientPackageId: item.clientPackageId,
      packageItemId: item.packageItemId,
      unit,
      previousUsed: item.usedQuantity,
      consumed: take,
      newUsed,
    });

    remainingNeeded -= take;
  }

  const consumedAmount = amountToConsume - remainingNeeded;

  return {
    consumedAmount,
    unfulfilledAmount: remainingNeeded,
    depletions,
  };
}
