import { describe, it, expect } from 'vitest';
import {
  planPaymentVoiding,
  AllocationToRollback,
  TargetDueStateBeforeRollback,
} from '../../../src/domain/calculators/payment-voiding';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Payment Voiding Pure Domain Calculator', () => {
  const paymentId = 'pay-123';
  const allocations: AllocationToRollback[] = [
    {
      allocationId: 'alloc-1',
      paymentId,
      targetType: 'marketing_due',
      targetId: 'due-sep',
      amountPiasters: 100000, // 1000 EGP
    },
    {
      allocationId: 'alloc-2',
      paymentId,
      targetType: 'website_project',
      targetId: 'web-proj-1',
      amountPiasters: 150000, // 1500 EGP
    },
  ];

  const targetStates: TargetDueStateBeforeRollback[] = [
    {
      targetId: 'due-sep',
      targetType: 'marketing_due',
      baseAmountPiasters: 100000,
      currentPaidPiasters: 100000, // was fully paid
      dueDate: '2026-09-01',
    },
    {
      targetId: 'web-proj-1',
      targetType: 'website_project',
      baseAmountPiasters: 300000,
      currentPaidPiasters: 250000, // was partially paid
      dueDate: '2026-09-15',
    },
  ];

  it('generates a complete void plan with restored balances and reverted statuses', () => {
    const reason = 'Client cancelled check due to accounting revision';
    const referenceDate = '2026-09-06';

    const plan = planPaymentVoiding(
      paymentId,
      'active',
      reason,
      allocations,
      targetStates,
      referenceDate
    );

    expect(plan.paymentId).toBe(paymentId);
    expect(plan.voidReason).toBe(reason);
    expect(plan.totalRollbackPiasters).toBe(250000);
    expect(plan.allocationsToRollback).toHaveLength(2);

    // Reverted target 1 (marketing due)
    const revertedDue = plan.revertedTargets.find((t) => t.targetId === 'due-sep');
    expect(revertedDue).toBeDefined();
    expect(revertedDue?.newPaidPiasters).toBe(0);
    expect(revertedDue?.newRemainingPiasters).toBe(100000);
    // Since referenceDate (Sept 6) > dueDate (Sept 1), status reverts to 'overdue'
    expect(revertedDue?.newStatus).toBe('overdue');

    // Reverted target 2 (website project)
    const revertedWeb = plan.revertedTargets.find((t) => t.targetId === 'web-proj-1');
    expect(revertedWeb).toBeDefined();
    expect(revertedWeb?.newPaidPiasters).toBe(100000); // 250,000 - 150,000 = 100,000
    expect(revertedWeb?.newRemainingPiasters).toBe(200000); // 300,000 - 100,000
    expect(revertedWeb?.newStatus).toBe('partial');

    // Audit log verification
    expect(plan.auditLogPayload.action).toBe('PAYMENT_VOIDED');
    expect(plan.auditLogPayload.entityType).toBe('payment');
    expect(plan.auditLogPayload.entityId).toBe(paymentId);
    expect(plan.auditLogPayload.note).toBe(reason);
    expect(plan.auditLogPayload.payload.totalRollbackPiasters).toBe(250000);
  });

  it('strictly rejects voiding when reason is empty or whitespace only', () => {
    expect(() =>
      planPaymentVoiding(paymentId, 'active', '', allocations, targetStates)
    ).toThrow(DomainInvariantError);

    expect(() =>
      planPaymentVoiding(paymentId, 'active', '    ', allocations, targetStates)
    ).toThrow(DomainInvariantError);
  });

  it('prevents double-voiding when payment is already in void status', () => {
    expect(() =>
      planPaymentVoiding(
        paymentId,
        'void', // already void
        'Duplicate void attempt',
        allocations,
        targetStates
      )
    ).toThrow(DomainInvariantError);
    expect(() =>
      planPaymentVoiding(
        paymentId,
        'void',
        'Duplicate void attempt',
        allocations,
        targetStates
      )
    ).toThrow(/already been voided/);
  });
});
