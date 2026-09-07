import { describe, it, expect } from 'vitest';
import {
  calculatePackageBalance,
  reconcilePackageConsumption,
  reconcilePlannedVsActual,
  consumeUnitsFIFO,
  ConsumablePackageItem,
} from '../../../src/domain/calculators/package-consumption';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Package Consumption Pure Domain Calculator', () => {
  describe('Package C Canonical Scenario (10h + 3 Reels)', () => {
    it('accurately maintains decoupled minutes and reels after consuming 4.5h and 1 reel', () => {
      // Package C purchased: 10 hours (600 minutes) and 3 reels for 4,000 EGP (400,000 piasters)
      const purchasedMinutes = 600; // 10.0 hours * 60
      const purchasedReels = 3;

      // Session 1 consumption: 4.5 hours (270 minutes) and 1 reel consumed
      const sessionMinutesConsumed = 270; // 4.5 * 60
      const sessionReelsConsumed = 1;

      // Calculate hour balance
      const hoursBalance = calculatePackageBalance(purchasedMinutes, sessionMinutesConsumed, 0);

      // Verify minutes and hours
      expect(hoursBalance.purchasedQuantity).toBe(600);
      expect(hoursBalance.usedQuantity).toBe(270);
      expect(hoursBalance.remainingAvailableQuantity).toBe(330); // 5.5 hours * 60
      expect(hoursBalance.totalRemainingQuantity).toBe(330);
      expect(hoursBalance.remainingAvailableQuantity / 60).toBe(5.5);

      // Calculate reel balance
      const reelsBalance = calculatePackageBalance(purchasedReels, sessionReelsConsumed, 0);

      // Verify reels
      expect(reelsBalance.purchasedQuantity).toBe(3);
      expect(reelsBalance.usedQuantity).toBe(1);
      expect(reelsBalance.remainingAvailableQuantity).toBe(2);
      expect(reelsBalance.totalRemainingQuantity).toBe(2);
    });
  });

  describe('Planned vs Actual Session Duration Reconciliation', () => {
    it('reconciles when actual duration is longer than planned duration', () => {
      // Client has 600 minutes purchased, 0 currently used, 90 minutes planned/reserved
      const totalPurchased = 600;
      const plannedMinutes = 90; // 1.5h
      const actualMinutes = 120; // 2.0h (overran by 30 minutes)
      const currentlyReserved = 90;
      const currentlyUsed = 0;

      const result = reconcilePlannedVsActual(
        plannedMinutes,
        actualMinutes,
        currentlyReserved,
        currentlyUsed,
        totalPurchased
      );

      expect(result.newReservedMinutes).toBe(0); // Planned reservation released
      expect(result.newUsedMinutes).toBe(120); // Full 120 mins marked as consumed
      expect(result.deltaMinutes).toBe(30); // 30 minutes overrun
      expect(result.remainingAvailableMinutes).toBe(480); // 600 - 120 = 480 mins (8 hours)
    });

    it('reconciles when actual duration is shorter than planned duration', () => {
      // Planned: 180 mins (3h). Actual: 150 mins (2.5h)
      const totalPurchased = 600;
      const plannedMinutes = 180;
      const actualMinutes = 150;
      const currentlyReserved = 180;
      const currentlyUsed = 0;

      const result = reconcilePlannedVsActual(
        plannedMinutes,
        actualMinutes,
        currentlyReserved,
        currentlyUsed,
        totalPurchased
      );

      expect(result.newReservedMinutes).toBe(0);
      expect(result.newUsedMinutes).toBe(150);
      expect(result.deltaMinutes).toBe(-30); // 30 mins returned
      expect(result.remainingAvailableMinutes).toBe(450); // 7.5 hours
    });

    it('rejects actual duration that exceeds remaining package capacity', () => {
      const totalPurchased = 300; // 5 hours
      const plannedMinutes = 60;
      const actualMinutes = 360; // 6 hours (exceeds total package)
      const currentlyReserved = 60;
      const currentlyUsed = 0;

      expect(() =>
        reconcilePlannedVsActual(
          plannedMinutes,
          actualMinutes,
          currentlyReserved,
          currentlyUsed,
          totalPurchased
        )
      ).toThrow(DomainInvariantError);
    });
  });

  describe('FIFO Multi-Package Consumption', () => {
    it('consumes minutes from earliest active package first, rolling over to next package', () => {
      const packages: ConsumablePackageItem[] = [
        {
          clientPackageId: 'pkg-1', // Older package
          unit: 'hours',
          purchasedQuantity: 300, // 5 hours
          usedQuantity: 240, // 4 hours used -> 60 mins remaining
          reservedQuantity: 0,
        },
        {
          clientPackageId: 'pkg-2', // Newer package
          unit: 'hours',
          purchasedQuantity: 600, // 10 hours
          usedQuantity: 0,
          reservedQuantity: 0,
        },
      ];

      // Request: consume 150 minutes (2.5h)
      // Should take 60 minutes from pkg-1 and 90 minutes from pkg-2
      const result = consumeUnitsFIFO(packages, 'hours', 150);

      expect(result.consumedAmount).toBe(150);
      expect(result.unfulfilledAmount).toBe(0);
      expect(result.depletions).toHaveLength(2);

      expect(result.depletions[0]).toEqual({
        clientPackageId: 'pkg-1',
        packageItemId: undefined,
        unit: 'hours',
        previousUsed: 240,
        consumed: 60,
        newUsed: 300, // fully depleted
      });

      expect(result.depletions[1]).toEqual({
        clientPackageId: 'pkg-2',
        packageItemId: undefined,
        unit: 'hours',
        previousUsed: 0,
        consumed: 90,
        newUsed: 90,
      });
    });

    it('handles partial fulfillment when requested amount exceeds total available units across all packages', () => {
      const packages: ConsumablePackageItem[] = [
        {
          clientPackageId: 'pkg-1',
          unit: 'reels',
          purchasedQuantity: 3,
          usedQuantity: 2, // 1 reel available
          reservedQuantity: 0,
        },
      ];

      // Request: consume 3 reels (only 1 available)
      const result = consumeUnitsFIFO(packages, 'reels', 3);

      expect(result.consumedAmount).toBe(1);
      expect(result.unfulfilledAmount).toBe(2);
      expect(result.depletions).toHaveLength(1);
      expect(result.depletions[0].consumed).toBe(1);
      expect(result.depletions[0].newUsed).toBe(3);
    });

    it('respects active reservations and does not consume reserved units', () => {
      const packages: ConsumablePackageItem[] = [
        {
          clientPackageId: 'pkg-1',
          unit: 'hours',
          purchasedQuantity: 300,
          usedQuantity: 100,
          reservedQuantity: 150, // 50 mins truly available
        },
      ];

      const result = consumeUnitsFIFO(packages, 'hours', 100);

      expect(result.consumedAmount).toBe(50);
      expect(result.unfulfilledAmount).toBe(50);
    });
  });

  describe('Reconciliation Calculator', () => {
    it('reconciles delta minutes correctly', () => {
      const balance = reconcilePackageConsumption(600, 200, 50);
      expect(balance.purchasedQuantity).toBe(600);
      expect(balance.usedQuantity).toBe(250);
      expect(balance.remainingAvailableQuantity).toBe(350);
    });

    it('rejects negative used minutes', () => {
      expect(() => reconcilePackageConsumption(600, 100, -150)).toThrow(DomainInvariantError);
    });

    it('rejects delta that causes used to exceed purchased', () => {
      expect(() => reconcilePackageConsumption(600, 550, 100)).toThrow(DomainInvariantError);
    });
  });
});
