/**
 * FinancialCalculator: Pure domain calculators for financial balances,
 * discounts, taxes, and obligations.
 * All amounts are strictly integer piasters (1 EGP = 100 piasters).
 * Floating-point rounding errors are strictly eliminated.
 */

import {
  assertIntegerPiasters,
  DomainInvariantError,
} from '../rules/invariants';

export interface FinancialCalculationInput {
  baseAmountPiasters: number;
  quantity?: number;
  discountPiasters?: number;
  taxPiasters?: number;
  paidAmountPiasters?: number;
  refundedAmountPiasters?: number;
}

export interface FinancialCalculationResult {
  subtotalPiasters: number;
  afterDiscountPiasters: number;
  totalPiasters: number;
  paidPiasters: number;
  refundedPiasters: number;
  netPaidPiasters: number;
  remainingPiasters: number;
  isFullyPaid: boolean;
  isOverdue: boolean;
}

/**
 * Calculates unified financial totals:
 * subtotal = base_amount * quantity
 * after_discount = max(0, subtotal - discount)
 * total = after_discount + tax
 * remaining = max(0, total - (paid - refunded))
 */
export function calculateFinancialTotals(
  input: FinancialCalculationInput,
  options?: { dueDate?: string; asOfDate?: string }
): FinancialCalculationResult {
  assertIntegerPiasters(input.baseAmountPiasters, 'baseAmountPiasters');
  const qty = Math.max(1, Math.floor(input.quantity ?? 1));
  const subtotal = input.baseAmountPiasters * qty;
  assertIntegerPiasters(subtotal, 'subtotalPiasters');

  const discount = Math.max(0, Math.floor(input.discountPiasters ?? 0));
  assertIntegerPiasters(discount, 'discountPiasters');

  if (discount > subtotal) {
    throw new DomainInvariantError('قيمة الخصم لا يمكن أن تتجاوز إجمالي المبلغ الأساسي');
  }

  const afterDiscount = subtotal - discount;

  const tax = Math.max(0, Math.floor(input.taxPiasters ?? 0));
  assertIntegerPiasters(tax, 'taxPiasters');

  const total = afterDiscount + tax;

  const paid = Math.max(0, Math.floor(input.paidAmountPiasters ?? 0));
  assertIntegerPiasters(paid, 'paidAmountPiasters');

  const refunded = Math.max(0, Math.floor(input.refundedAmountPiasters ?? 0));
  assertIntegerPiasters(refunded, 'refundedAmountPiasters');

  if (refunded > paid) {
    throw new DomainInvariantError('المبلغ المسترد لا يمكن أن يتجاوز المبلغ المدفوع');
  }

  const netPaid = paid - refunded;
  const remaining = Math.max(0, total - netPaid);
  const isFullyPaid = remaining === 0;

  let isOverdue = false;
  if (!isFullyPaid && options?.dueDate) {
    const asOf = options.asOfDate ? new Date(options.asOfDate) : new Date();
    const due = new Date(options.dueDate);
    isOverdue = asOf.getTime() > due.getTime();
  }

  return {
    subtotalPiasters: subtotal,
    afterDiscountPiasters: afterDiscount,
    totalPiasters: total,
    paidPiasters: paid,
    refundedPiasters: refunded,
    netPaidPiasters: netPaid,
    remainingPiasters: remaining,
    isFullyPaid,
    isOverdue,
  };
}

/**
 * Calculates collection status from financial totals and optional due date
 */
export type CollectionStatus =
  | 'unpaid'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'refunded';

export function determineCollectionStatus(
  res: FinancialCalculationResult
): CollectionStatus {
  if (res.paidPiasters > 0 && res.paidPiasters === res.refundedPiasters) {
    return 'refunded';
  }
  if (res.isFullyPaid) {
    return 'paid';
  }
  if (res.isOverdue) {
    return 'overdue';
  }
  if (res.netPaidPiasters > 0) {
    return 'partially_paid';
  }
  return 'unpaid';
}
