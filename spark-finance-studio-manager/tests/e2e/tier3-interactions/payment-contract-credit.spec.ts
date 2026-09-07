import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { ContractFixture } from '../fixtures/contract-fixture';
import { PaymentFixture } from '../fixtures/payment-fixture';

describe('Tier 3 Interaction: Payment Split x Marketing Dues x Client Credit', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let contractFixture: ContractFixture;
  let paymentFixture: PaymentFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    contractFixture = new ContractFixture(ctx.driver);
    paymentFixture = new PaymentFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'مؤسسة الشروق' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('allocates payment across overdue contract due and deposits surplus into reusable credit', async () => {
    // 1. Marketing contract with 6,000 EGP (600,000 piasters) monthly due
    const contractId = await contractFixture.createContract({
      clientId,
      monthlyAmountPiasters: 600000,
      startDate: '2026-09-01',
    });
    const dueId = await contractFixture.createDue({
      contractId,
      clientId,
      year: 2026,
      month: 9,
      baseAmountPiasters: 600000,
      dueDate: '2026-09-30',
      status: 'overdue',
    });

    // 2. Client pays 10,000 EGP (1,000,000 piasters) cash
    const { unallocatedCreditPiasters } = await paymentFixture.recordPayment({
      clientId,
      amountPiasters: 1000000,
      paymentDate: '2026-10-05',
      paymentMethod: 'cash',
      allocations: [{ targetType: 'marketing_due', targetId: dueId, amountPiasters: 600000 }],
    });

    expect(unallocatedCreditPiasters).toBe(400000); // 4,000 EGP surplus credit!

    // 3. Verify overdue due is now marked 'paid'
    const due = await ctx.driver.query<{ paid_amount: number; status: string }>(
      'SELECT paid_amount, status FROM marketing_contract_dues WHERE id = ?',
      [dueId]
    );
    expect(due[0].paid_amount).toBe(600000);
    expect(due[0].status).toBe('paid');

    // 4. Verify client credit record exists
    const credits = await ctx.driver.query<{ amount: number }>(
      'SELECT amount FROM client_credits WHERE client_id = ?',
      [clientId]
    );
    expect(credits[0].amount).toBe(400000);

    // 5. Subsequent month due generated: 6,000 EGP for October
    const octDueId = await contractFixture.createDue({
      contractId,
      clientId,
      year: 2026,
      month: 10,
      baseAmountPiasters: 600000,
      dueDate: '2026-10-31',
      status: 'due',
    });

    // 6. Apply existing credit (4,000 EGP) towards October due without new cash
    await ctx.driver.transaction(async (tx) => {
      await tx.execute('UPDATE client_credits SET amount = 0 WHERE client_id = ?', [clientId]);
      await tx.execute(
        "UPDATE marketing_contract_dues SET paid_amount = 400000, status = 'partial' WHERE id = ?",
        [octDueId]
      );
    });

    // Verify October due is now partial with 2,000 EGP remaining
    const octDue = await ctx.driver.query<{ paid_amount: number; total_amount: number; status: string }>(
      'SELECT paid_amount, total_amount, status FROM marketing_contract_dues WHERE id = ?',
      [octDueId]
    );
    expect(octDue[0].paid_amount).toBe(400000);
    expect(octDue[0].status).toBe('partial');
    expect(octDue[0].total_amount - octDue[0].paid_amount).toBe(200000);
  });
});
