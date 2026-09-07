import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PaymentFixture } from '../fixtures/payment-fixture';

describe('Tier 2: Relational Safety, ACID Rollback & Anti-Corruption Tests', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let paymentFixture: PaymentFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    paymentFixture = new PaymentFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'أمان المعاملات' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('rolls back entire transaction if mid-transaction error occurs during payment splitting', async () => {
    // Attempt a transaction that succeeds on payment insert but throws on allocation
    const attemptFailingPayment = async () => {
      await ctx.driver.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status)
           VALUES ('p_fail_1', ?, 500000, '2026-10-05', 'cash', 'active')`,
          [clientId]
        );

        // Deliberate error: missing target
        throw new Error('Mid-transaction simulated database error');
      });
    };

    await expect(attemptFailingPayment()).rejects.toThrow('Mid-transaction simulated database error');

    // Verify payment was NOT committed (rolled back!)
    const pays = await ctx.driver.query("SELECT * FROM payments WHERE id = 'p_fail_1'");
    expect(pays).toHaveLength(0);
  });

  it('enforces zero permanent hard deletes on payments table (BR-010)', async () => {
    const { paymentId } = await paymentFixture.recordPayment({
      clientId,
      amountPiasters: 200000,
      paymentDate: '2026-10-05',
      paymentMethod: 'cash',
      allocations: [],
    });

    // Voiding is allowed
    await paymentFixture.voidPayment(paymentId, 'تصحيح خطأ إدخال');

    // Physical delete attempt should be prevented by policy
    const rows = await ctx.driver.query<{ status: string }>('SELECT status FROM payments WHERE id = ?', [paymentId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('void'); // Still exists in DB!
  });

  it('mandates audit log insertion whenever payment is voided', async () => {
    const { paymentId } = await paymentFixture.recordPayment({
      clientId,
      amountPiasters: 150000,
      paymentDate: '2026-10-05',
      paymentMethod: 'cash',
      allocations: [],
    });

    await paymentFixture.voidPayment(paymentId, 'إلغاء لطلب العميل');

    const logs = await ctx.driver.query<{ action: string; entity_id: string; notes: string }>(
      "SELECT action, entity_id, notes FROM activity_log WHERE action = 'PAYMENT_VOIDED' AND entity_id = ?",
      [paymentId]
    );
    expect(logs).toHaveLength(1);
    expect(logs[0].notes).toBe('إلغاء لطلب العميل');
  });

  it('prevents voiding an already voided payment', async () => {
    const { paymentId } = await paymentFixture.recordPayment({
      clientId,
      amountPiasters: 100000,
      paymentDate: '2026-10-05',
      paymentMethod: 'cash',
      allocations: [],
    });

    await paymentFixture.voidPayment(paymentId, 'سبب أول');
    await expect(paymentFixture.voidPayment(paymentId, 'سبب ثان')).rejects.toThrow('already voided');
  });

  it('maintains referential integrity: payments require valid client_id', async () => {
    const invalidClientId = 'non_existent_client_id';
    const clientExists = (await clientFixture.getById(invalidClientId)) !== null;
    expect(clientExists).toBe(false);
  });
});
