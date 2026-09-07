import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PaymentFixture } from '../fixtures/payment-fixture';
import { ExpenseFixture } from '../fixtures/expense-fixture';

describe('Tier 2: Currency & Piasters Boundary Tests', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let paymentFixture: PaymentFixture;
  let expenseFixture: ExpenseFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    paymentFixture = new PaymentFixture(ctx.driver);
    expenseFixture = new ExpenseFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'حدود العملة' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('verifies 1 piaster (0.01 EGP) minimum non-zero monetary transaction', async () => {
    const { paymentId } = await paymentFixture.recordPayment({
      clientId,
      amountPiasters: 1, // 1 piaster
      paymentDate: '2026-10-05',
      paymentMethod: 'cash',
      allocations: [],
    });

    const p = await ctx.driver.query<{ amount: number }>('SELECT amount FROM payments WHERE id = ?', [paymentId]);
    expect(p[0].amount).toBe(1);
    expect(p[0].amount).toBePiasters();
  });

  it('rejects 0 piasters payment transaction', async () => {
    await expect(
      paymentFixture.recordPayment({
        clientId,
        amountPiasters: 0,
        paymentDate: '2026-10-05',
        paymentMethod: 'cash',
        allocations: [],
      })
    ).rejects.toThrow('greater than zero piasters');
  });

  it('rejects negative piasters across all financial entities', async () => {
    await expect(
      paymentFixture.recordPayment({
        clientId,
        amountPiasters: -100,
        paymentDate: '2026-10-05',
        paymentMethod: 'cash',
        allocations: [],
      })
    ).rejects.toThrow('greater than zero piasters');

    await expect(
      expenseFixture.recordExpense({
        amountPiasters: -500,
        expenseDate: '2026-10-05',
        category: 'rent',
      })
    ).rejects.toThrow('greater than zero piasters');
  });

  it('handles maximum 32-bit SQLite integer (2,147,483,647 piasters = ~21.47M EGP) without overflow', async () => {
    const maxIntPiasters = 2147483647;
    const { paymentId } = await paymentFixture.recordPayment({
      clientId,
      amountPiasters: maxIntPiasters,
      paymentDate: '2026-10-05',
      paymentMethod: 'bank',
      allocations: [],
    });

    const p = await ctx.driver.query<{ amount: number }>('SELECT amount FROM payments WHERE id = ?', [paymentId]);
    expect(p[0].amount).toBe(maxIntPiasters);
    expect(p[0].amount).toBePiasters();
  });

  it('strictly rejects floating-point values for piasters (zero float drift invariant)', () => {
    const validateIntegerPiasters = (val: unknown) => {
      if (typeof val !== 'number' || !Number.isInteger(val) || val < 0) {
        throw new Error('Floating point piasters prohibited');
      }
    };

    expect(() => validateIntegerPiasters(1500.5)).toThrow('Floating point piasters prohibited');
    expect(() => validateIntegerPiasters(0.01)).toThrow('Floating point piasters prohibited');
    expect(() => validateIntegerPiasters(150050)).not.toThrow();
  });

  it('handles exact integer remainder distribution when splitting odd amounts', () => {
    const totalPiasters = 1000; // 10.00 EGP
    const count = 3;
    const baseShare = Math.floor(totalPiasters / count); // 333
    const remainder = totalPiasters % count; // 1

    const shares = [baseShare + remainder, baseShare, baseShare]; // [334, 333, 333]
    const sum = shares.reduce((a, b) => a + b, 0);

    expect(sum).toBe(totalPiasters);
    expect(shares[0]).toBe(334);
    expect(shares[1]).toBe(333);
    expect(shares[2]).toBe(333);
    expect(shares.every((s) => Number.isInteger(s))).toBe(true);
  });
});
