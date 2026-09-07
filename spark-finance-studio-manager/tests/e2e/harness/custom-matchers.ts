import { expect } from 'vitest';

/**
 * Custom Domain Matchers for Spark Finance & Studio Manager
 */
export interface CustomMatchers<R = unknown> {
  toBePiasters(): R;
  toBeMinutes(): R;
  toNotExceedPayment(paymentAmount: number): R;
  toHaveNoStudioOverlap(proposedStart: string, proposedEnd: string): R;
}

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-explicit-any
  interface Assertion<T = any> extends CustomMatchers<T> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

export function registerCustomMatchers(): void {
  expect.extend({
    toBePiasters(received: unknown) {
      const isInteger = Number.isInteger(received);
      const isNonNegative = typeof received === 'number' && received >= 0;
      const pass = isInteger && isNonNegative;

      return {
        pass,
        message: () =>
          pass
            ? `expected ${received} not to be valid non-negative integer piasters`
            : `expected ${received} to be valid non-negative integer piasters (found ${typeof received === 'number' && !Number.isInteger(received) ? 'floating point' : received})`,
      };
    },

    toBeMinutes(received: unknown) {
      const isInteger = Number.isInteger(received);
      const isNonNegative = typeof received === 'number' && received >= 0;
      const pass = isInteger && isNonNegative;

      return {
        pass,
        message: () =>
          pass
            ? `expected ${received} not to be valid integer minutes`
            : `expected ${received} to be valid non-negative integer minutes`,
      };
    },

    toNotExceedPayment(receivedAllocations: Array<{ allocatedAmount: number }>, paymentAmount: number) {
      const sum = receivedAllocations.reduce((acc, curr) => acc + curr.allocatedAmount, 0);
      const pass = sum <= paymentAmount;

      return {
        pass,
        message: () =>
          pass
            ? `expected total allocations (${sum}) to exceed payment amount (${paymentAmount})`
            : `Over-allocation violation! Allocations sum (${sum}) exceeds payment amount (${paymentAmount}) by ${sum - paymentAmount} piasters`,
      };
    },

    toHaveNoStudioOverlap(
      existingSlots: Array<{ start_time: string; end_time: string; status?: string }>,
      proposedStart: string,
      proposedEnd: string
    ) {
      const conflicts = existingSlots.filter((slot) => {
        if (slot.status === 'cancelled') return false;
        return proposedStart < slot.end_time && proposedEnd > slot.start_time;
      });

      const pass = conflicts.length === 0;

      return {
        pass,
        message: () =>
          pass
            ? `expected conflict for slot [${proposedStart}, ${proposedEnd}) but none found`
            : `Studio overlap detected! Slot [${proposedStart}, ${proposedEnd}) conflicts with ${conflicts.length} existing booking(s): ${JSON.stringify(conflicts)}`,
      };
    },
  });
}
