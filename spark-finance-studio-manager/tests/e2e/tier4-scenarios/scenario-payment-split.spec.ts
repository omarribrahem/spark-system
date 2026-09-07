import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { ContractFixture } from '../fixtures/contract-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { PaymentFixture } from '../fixtures/payment-fixture';

/**
 * Scenario 4.5: Multi-Target Payment Split with Client Credit (PRD §18.3, §61.6 Test 6, §61.7 Test 7)
 *
 * Requirements verified:
 * 1. Client owes multiple obligations:
 *    - Marketing Due: 6,000 EGP (600,000 piasters)
 *    - Studio Booking: 2,500 EGP (250,000 piasters)
 *    - Website Milestone: 1,000 EGP (100,000 piasters)
 *    - Total Obligations = 9,500 EGP (950,000 piasters)
 * 2. Client pays 10,000 EGP (1,000,000 piasters) in cash.
 * 3. Payment is split: 6,000 to Marketing, 2,500 to Studio, 1,000 to Website.
 * 4. Surplus 500 EGP (50,000 piasters) automatically converts to client credit.
 * 5. All 3 target balances update cleanly; client debt becomes 0 EGP; credit balance is 500 EGP.
 */
describe('Tier 4 Scenario 4.5: Multi-Target Payment Split with Surplus Client Credit', () => {
  let ctx: TestContext;
  let clientFixture: ClientFixture;
  let contractFixture: ContractFixture;
  let packageFixture: PackageFixture;
  let paymentFixture: PaymentFixture;
  let clientId: string;

  beforeEach(async () => {
    ctx = await setupTestContext();
    clientFixture = new ClientFixture(ctx.driver);
    contractFixture = new ContractFixture(ctx.driver);
    packageFixture = new PackageFixture(ctx.driver);
    paymentFixture = new PaymentFixture(ctx.driver);
    clientId = await clientFixture.create({ name: 'مؤسسة الرياض الإعلامية' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  it('splits single 10,000 EGP payment across 3 targets and stores 500 EGP surplus as client credit', async () => {
    // 1. Setup Marketing Contract and Due: 6,000 EGP
    const contractId = await contractFixture.createContract({
      clientId,
      monthlyAmountPiasters: 600000,
      startDate: '2026-10-01',
    });
    const dueId = await contractFixture.createDue({
      contractId,
      clientId,
      year: 2026,
      month: 10,
      baseAmountPiasters: 600000,
      dueDate: '2026-10-31',
      status: 'due',
    });

    // 2. Setup Client Package: 2,500 EGP
    const pkg = await packageFixture.sellPackage({
      clientId,
      packageName: 'باقة استوديو 10 ساعات',
      soldPricePiasters: 250000,
      purchaseDate: '2026-10-01',
      hoursMinutesQuota: 600,
    });

    // 3. Setup Website Project: 1,000 EGP milestone
    await ctx.driver.execute(
      `INSERT INTO website_projects (id, client_id, project_name, total_price, paid_amount, start_date, status)
       VALUES ('site_split_1', ?, 'موقع تجاري', 100000, 0, '2026-10-01', 'in_progress')`,
      [clientId]
    );

    // 4. Client pays 10,000 EGP (1,000,000 piasters) Cash
    const paymentAmount = 1000000;
    const { paymentId, unallocatedCreditPiasters } = await paymentFixture.recordPayment({
      clientId,
      amountPiasters: paymentAmount,
      paymentDate: '2026-10-05',
      paymentMethod: 'cash',
      allocations: [
        { targetType: 'marketing_due', targetId: dueId, amountPiasters: 600000 },
        { targetType: 'client_package', targetId: pkg.packageId, amountPiasters: 250000 },
        { targetType: 'website_project', targetId: 'site_split_1', amountPiasters: 100000 },
      ],
    });

    // Step 5: Verify Surplus Calculation & Client Credit Deposit
    expect(unallocatedCreditPiasters).toBe(50000); // 500 EGP surplus credit!
    expect(unallocatedCreditPiasters).toBePiasters();

    const credits = await ctx.driver.query<{ amount: number; source_payment_id: string }>(
      'SELECT amount, source_payment_id FROM client_credits WHERE client_id = ?',
      [clientId]
    );
    expect(credits).toHaveLength(1);
    expect(credits[0].amount).toBe(50000);
    expect(credits[0].source_payment_id).toBe(paymentId);

    // Step 6: Verify Target Obligation States
    // Target 1: Marketing Due is fully paid
    const dues = await ctx.driver.query<{ paid_amount: number; status: string }>(
      'SELECT paid_amount, status FROM marketing_contract_dues WHERE id = ?',
      [dueId]
    );
    expect(dues[0].paid_amount).toBe(600000);
    expect(dues[0].status).toBe('paid');

    // Target 2: Package is fully paid
    const pkgs = await ctx.driver.query<{ paid_amount: number }>(
      'SELECT paid_amount FROM client_packages WHERE id = ?',
      [pkg.packageId]
    );
    expect(pkgs[0].paid_amount).toBe(250000);

    // Target 3: Website is fully paid
    const sites = await ctx.driver.query<{ paid_amount: number }>(
      "SELECT paid_amount FROM website_projects WHERE id = 'site_split_1'"
    );
    expect(sites[0].paid_amount).toBe(100000);

    // Step 7: Verify Mathematical Invariant
    // 600,000 + 250,000 + 100,000 + 50,000 == 1,000,000
    const totalAccounted = 600000 + 250000 + 100000 + unallocatedCreditPiasters;
    expect(totalAccounted).toBe(paymentAmount);
  });
});
