/**
 * Domain Models for Packages & Reel Items
 * Service hours tracked strictly in minutes; reels in discrete integer counts.
 */

export type PackageUnit = 'hours' | 'reels';

export type PackageStatus = 'not_started' | 'active' | 'fully_used' | 'cancelled';

export interface PackageItemEntitlement {
  id?: string;
  unit: PackageUnit;
  purchasedQuantity: number; // minutes for hours, count for reels
  usedQuantity: number;
  reservedQuantity: number;
}

export interface ClientPackageSnapshot {
  id: string;
  clientId: string;
  nameSnapshot: string;
  soldPrice: number; // integer piasters
  purchasedAt: string; // 'YYYY-MM-DD'
  status: PackageStatus;
  items: PackageItemEntitlement[];
}

export interface PackageBalance {
  purchasedQuantity: number;
  usedQuantity: number;
  reservedQuantity: number;
  remainingAvailableQuantity: number;
  totalRemainingQuantity: number;
}

export interface PackageConsumptionResult {
  consumedAmount: number;
  unfulfilledAmount: number;
  depletions: Array<{
    clientPackageId: string;
    packageItemId?: string;
    unit: PackageUnit;
    previousUsed: number;
    consumed: number;
    newUsed: number;
  }>;
}
