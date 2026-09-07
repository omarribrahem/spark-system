import { describe, it, expect } from 'vitest';
import { calculateAllocation } from '../../../src/domain/calculators/payment-allocator';
import { TargetDue } from '../../../src/domain/models/financial';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Payment Allocator Pure Domain Calculator', () => {
  it('allocates payment exactly across targets when payment equals total due', () => {
    const targets: TargetDue[] = [
      { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 50000 }, // 500 EGP
      { targetType: 'website_project', targetId: 'web-1', duePiasters: 150000 }, // 1500 EGP
    ];

    const result = calculateAllocation(200000, targets); // 2000 EGP

    expect(result.totalPaymentPiasters).toBe(200000);
    expect(result.totalAllocatedPiasters).toBe(200000);
    expect(result.unallocatedCreditPiasters).toBe(0);
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0]).toEqual({
      targetType: 'marketing_due',
      targetId: 'due-1',
      allocatedPiasters: 50000,
      remainingDuePiasters: 0,
    });
    expect(result.allocations[1]).toEqual({
      targetType: 'website_project',
      targetId: 'web-1',
      allocatedPiasters: 150000,
      remainingDuePiasters: 0,
    });
  });

  it('converts surplus payment into unallocated credit when payment exceeds total due', () => {
    const targets: TargetDue[] = [
      { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000 }, // 1000 EGP
      { targetType: 'client_package', targetId: 'pkg-1', duePiasters: 200000 }, // 2000 EGP
    ];

    // Total due: 300,000 piasters (3,000 EGP). Client pays 350,000 piasters (3,500 EGP).
    const result = calculateAllocation(350000, targets);

    expect(result.totalPaymentPiasters).toBe(350000);
    expect(result.totalAllocatedPiasters).toBe(300000);
    expect(result.unallocatedCreditPiasters).toBe(50000); // 500 EGP surplus credit
    expect(result.allocations[0].allocatedPiasters).toBe(100000);
    expect(result.allocations[0].remainingDuePiasters).toBe(0);
    expect(result.allocations[1].allocatedPiasters).toBe(200000);
    expect(result.allocations[1].remainingDuePiasters).toBe(0);
  });

  it('allocates sequentially when payment is less than total due (under-payment)', () => {
    const targets: TargetDue[] = [
      { targetType: 'marketing_due', targetId: 'due-jan', duePiasters: 100000 },
      { targetType: 'marketing_due', targetId: 'due-feb', duePiasters: 100000 },
    ];

    // Client pays 150,000 piasters for 200,000 due
    const result = calculateAllocation(150000, targets);

    expect(result.totalAllocatedPiasters).toBe(150000);
    expect(result.unallocatedCreditPiasters).toBe(0);
    expect(result.allocations[0].allocatedPiasters).toBe(100000);
    expect(result.allocations[0].remainingDuePiasters).toBe(0);
    expect(result.allocations[1].allocatedPiasters).toBe(50000);
    expect(result.allocations[1].remainingDuePiasters).toBe(50000);
  });

  it('honors explicitly requested allocation amounts across targets', () => {
    const targets: TargetDue[] = [
      { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 200000, requestedPiasters: 50000 },
      { targetType: 'website_project', targetId: 'web-1', duePiasters: 300000, requestedPiasters: 200000 },
    ];

    // Client pays 300,000 piasters. Requested: 50,000 to due-1 and 200,000 to web-1.
    const result = calculateAllocation(300000, targets, { autoFillRemaining: false });

    expect(result.totalAllocatedPiasters).toBe(250000);
    expect(result.unallocatedCreditPiasters).toBe(50000);
    expect(result.allocations[0].allocatedPiasters).toBe(50000);
    expect(result.allocations[0].remainingDuePiasters).toBe(150000);
    expect(result.allocations[1].allocatedPiasters).toBe(200000);
    expect(result.allocations[1].remainingDuePiasters).toBe(100000);
  });

  it('rejects over-allocation when requested allocation exceeds target due', () => {
    const targets: TargetDue[] = [
      { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000, requestedPiasters: 150000 },
    ];

    expect(() => calculateAllocation(200000, targets)).toThrow(DomainInvariantError);
    expect(() => calculateAllocation(200000, targets)).toThrow(/Over-allocation rejected/);
  });

  it('rejects allocation when sum of explicitly requested allocations exceeds payment', () => {
    const targets: TargetDue[] = [
      { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000, requestedPiasters: 80000 },
      { targetType: 'website_project', targetId: 'web-1', duePiasters: 100000, requestedPiasters: 80000 },
    ];

    // Total requested: 160,000, but payment is only 100,000
    expect(() => calculateAllocation(100000, targets)).toThrow(DomainInvariantError);
    expect(() => calculateAllocation(100000, targets)).toThrow(/exceeds total payment amount/);
  });

  it('rejects non-integer floating-point piasters', () => {
    const targets: TargetDue[] = [
      { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000 },
    ];

    expect(() => calculateAllocation(100.5, targets)).toThrow(DomainInvariantError);
    expect(() => calculateAllocation(100.5, targets)).toThrow(/violates the integer piaster invariant/);
  });

  it('rejects negative payment amounts', () => {
    const targets: TargetDue[] = [
      { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000 },
    ];

    expect(() => calculateAllocation(-5000, targets)).toThrow(DomainInvariantError);
    expect(() => calculateAllocation(-5000, targets)).toThrow(/cannot be negative/);
  });

  it('returns all payment as unallocated credit when target list is empty', () => {
    const result = calculateAllocation(50000, []);
    expect(result.totalPaymentPiasters).toBe(50000);
    expect(result.totalAllocatedPiasters).toBe(0);
    expect(result.unallocatedCreditPiasters).toBe(50000);
    expect(result.allocations).toEqual([]);
  });

  it('handles zero payment correctly without throwing', () => {
    const targets: TargetDue[] = [
      { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 50000 },
    ];

    const result = calculateAllocation(0, targets);
    expect(result.totalPaymentPiasters).toBe(0);
    expect(result.totalAllocatedPiasters).toBe(0);
    expect(result.unallocatedCreditPiasters).toBe(0);
    expect(result.allocations[0].allocatedPiasters).toBe(0);
    expect(result.allocations[0].remainingDuePiasters).toBe(50000);
  });
});
