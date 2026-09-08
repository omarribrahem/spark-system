import { describe, it, expect } from 'vitest';
import {
  calculateFinancialTotals,
  determineCollectionStatus,
} from '../../../src/domain/calculators/financial-calculator';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('FinancialCalculator Domain Unit Tests', () => {
  it('calculates straightforward total and remaining for unpaid item', () => {
    const result = calculateFinancialTotals({
      baseAmountPiasters: 100000, // 1,000 EGP
      quantity: 2,
    });

    expect(result.subtotalPiasters).toBe(200000);
    expect(result.afterDiscountPiasters).toBe(200000);
    expect(result.totalPiasters).toBe(200000);
    expect(result.paidPiasters).toBe(0);
    expect(result.refundedPiasters).toBe(0);
    expect(result.netPaidPiasters).toBe(0);
    expect(result.remainingPiasters).toBe(200000);
    expect(result.isFullyPaid).toBe(false);
    expect(result.isOverdue).toBe(false);

    expect(determineCollectionStatus(result)).toBe('unpaid');
  });

  it('correctly applies discount and tax', () => {
    const result = calculateFinancialTotals({
      baseAmountPiasters: 50000, // 500 EGP
      quantity: 1,
      discountPiasters: 5000,   // 50 EGP discount -> 450 EGP
      taxPiasters: 6300,        // 63 EGP tax (14% of 450) -> 513 EGP
      paidAmountPiasters: 20000, // 200 EGP paid
    });

    expect(result.subtotalPiasters).toBe(50000);
    expect(result.afterDiscountPiasters).toBe(45000);
    expect(result.totalPiasters).toBe(51300);
    expect(result.paidPiasters).toBe(20000);
    expect(result.netPaidPiasters).toBe(20000);
    expect(result.remainingPiasters).toBe(31300);
    expect(result.isFullyPaid).toBe(false);
    expect(determineCollectionStatus(result)).toBe('partially_paid');
  });

  it('marks as fully paid when net paid equals or exceeds total', () => {
    const result = calculateFinancialTotals({
      baseAmountPiasters: 400000,
      discountPiasters: 50000,
      paidAmountPiasters: 350000,
    });

    expect(result.remainingPiasters).toBe(0);
    expect(result.isFullyPaid).toBe(true);
    expect(determineCollectionStatus(result)).toBe('paid');
  });

  it('handles partial and full refunds correctly', () => {
    // Partial refund
    const partialRefund = calculateFinancialTotals({
      baseAmountPiasters: 100000,
      paidAmountPiasters: 100000,
      refundedAmountPiasters: 30000,
    });
    expect(partialRefund.netPaidPiasters).toBe(70000);
    expect(partialRefund.remainingPiasters).toBe(30000);
    expect(partialRefund.isFullyPaid).toBe(false);
    expect(determineCollectionStatus(partialRefund)).toBe('partially_paid');

    // Full refund
    const fullRefund = calculateFinancialTotals({
      baseAmountPiasters: 100000,
      paidAmountPiasters: 100000,
      refundedAmountPiasters: 100000,
    });
    expect(fullRefund.netPaidPiasters).toBe(0);
    expect(fullRefund.remainingPiasters).toBe(100000);
    expect(determineCollectionStatus(fullRefund)).toBe('refunded');
  });

  it('determines overdue status accurately based on dates', () => {
    const overdueResult = calculateFinancialTotals(
      {
        baseAmountPiasters: 100000,
        paidAmountPiasters: 20000,
      },
      {
        dueDate: '2026-01-01T00:00:00.000Z',
        asOfDate: '2026-02-01T00:00:00.000Z',
      }
    );
    expect(overdueResult.isOverdue).toBe(true);
    expect(determineCollectionStatus(overdueResult)).toBe('overdue');

    // Not overdue if asOf is before due date
    const notOverdueResult = calculateFinancialTotals(
      {
        baseAmountPiasters: 100000,
        paidAmountPiasters: 20000,
      },
      {
        dueDate: '2026-03-01T00:00:00.000Z',
        asOfDate: '2026-02-01T00:00:00.000Z',
      }
    );
    expect(notOverdueResult.isOverdue).toBe(false);
    expect(determineCollectionStatus(notOverdueResult)).toBe('partially_paid');

    // Paid items are never overdue even if past due date
    const paidPastDue = calculateFinancialTotals(
      {
        baseAmountPiasters: 100000,
        paidAmountPiasters: 100000,
      },
      {
        dueDate: '2026-01-01T00:00:00.000Z',
        asOfDate: '2026-02-01T00:00:00.000Z',
      }
    );
    expect(paidPastDue.isOverdue).toBe(false);
    expect(determineCollectionStatus(paidPastDue)).toBe('paid');
  });

  it('rejects invalid financial invariants', () => {
    // Non-integer piaster
    expect(() =>
      calculateFinancialTotals({
        baseAmountPiasters: 100.5,
      })
    ).toThrow(DomainInvariantError);

    // Negative piaster
    expect(() =>
      calculateFinancialTotals({
        baseAmountPiasters: -500,
      })
    ).toThrow(DomainInvariantError);

    // Discount greater than subtotal
    expect(() =>
      calculateFinancialTotals({
        baseAmountPiasters: 10000,
        discountPiasters: 15000,
      })
    ).toThrow(DomainInvariantError);

    // Refund greater than paid
    expect(() =>
      calculateFinancialTotals({
        baseAmountPiasters: 10000,
        paidAmountPiasters: 5000,
        refundedAmountPiasters: 8000,
      })
    ).toThrow(DomainInvariantError);
  });
});
