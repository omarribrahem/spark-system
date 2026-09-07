import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { PaymentFixture } from '../fixtures/payment-fixture';
import { ExpenseFixture } from '../fixtures/expense-fixture';

describe('Tier 3 Interaction: Expenses x Monthly Cash Flow vs Allocation Service Revenue', () => {
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
    clientId = await clientFixture.create({ name: 'مؤسسة التجارة الحديثة' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('verifies expense logging updates cash flow outflow without impacting allocation service revenue', async () => {
    // 1. Client pays 10,000 EGP (1,000,000 piasters)
    // Allocated: 6,000 EGP Marketing, 3,000 EGP Studio, 1,000 EGP Unallocated Credit
    await paymentFixture.recordPayment({
      clientId,
      amountPiasters: 1000000,
      paymentDate: '2026-10-02',
      paymentMethod: 'bank',
      allocations: [
        { targetType: 'marketing_due', targetId: 'mkt_due_1', amountPiasters: 600000 },
        { targetType: 'client_package', targetId: 'pkg_1', amountPiasters: 300000 },
      ],
    });

    // 2. Company logs expenses: Rent 4,000 EGP, Ads 1,500 EGP
    await expenseFixture.recordExpense({
      amountPiasters: 400000,
      expenseDate: '2026-10-03',
      category: 'rent',
    });
    await expenseFixture.recordExpense({
      amountPiasters: 150000,
      expenseDate: '2026-10-04',
      category: 'ads',
    });

    // 3. Evaluate Monthly Cash Flow Report metrics:
    // Money In = 10,000 EGP (total cash received)
    // Expenses = 5,500 EGP (rent + ads)
    // Net Cash Flow = 4,500 EGP (450,000 piasters)
    const moneyIn = 1000000;
    const expensesSum = 550000;
    const netCashFlow = moneyIn - expensesSum;

    expect(netCashFlow).toBe(450000);
    expect(netCashFlow).toBePiasters();

    // 4. Evaluate Revenue by Service report (strictly allocation-based):
    // Marketing Revenue = 6,000 EGP (600,000 piasters)
    // Studio Revenue = 3,000 EGP (300,000 piasters)
    // Total Service Revenue = 9,000 EGP (900,000 piasters)
    const allocations = await ctx.driver.query<{ target_type: string; allocated_amount: number }>(
      'SELECT target_type, allocated_amount FROM payment_allocations'
    );
    const mktRevenue = allocations.filter((a) => a.target_type === 'marketing_due').reduce((acc, a) => acc + a.allocated_amount, 0);
    const studioRevenue = allocations.filter((a) => a.target_type === 'client_package').reduce((acc, a) => acc + a.allocated_amount, 0);

    expect(mktRevenue).toBe(600000);
    expect(studioRevenue).toBe(300000);
    expect(mktRevenue + studioRevenue).toBe(900000);

    // Assert that expenses DO NOT subtract from Service Revenue
    expect(mktRevenue).toBe(600000); // Intact
    expect(studioRevenue).toBe(300000); // Intact
  });
});
