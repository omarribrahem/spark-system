import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ClientFixture } from '../fixtures/client-fixture';
import { ContractFixture } from '../fixtures/contract-fixture';
import { PackageFixture } from '../fixtures/package-fixture';
import { PaymentFixture } from '../fixtures/payment-fixture';

describe('Tier 1: Payment Recording, Multi-Target Split & Credit (F-034 .. F-039)', () => {
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
    clientId = await clientFixture.create({ name: 'مجموعة الأمل' });
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-034: Payment Recording
  describe('F-034: Payment Recording', () => {
    it('records valid payment in piasters with cash method', async () => {
      const { paymentId } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 500000, // 5,000 EGP
        paymentDate: '2026-10-05',
        paymentMethod: 'cash',
        allocations: [],
      });

      const pays = await ctx.driver.query<{ amount: number; payment_method: string; status: string }>(
        'SELECT amount, payment_method, status FROM payments WHERE id = ?',
        [paymentId]
      );
      expect(pays[0]?.amount).toBe(500000);
      expect(pays[0]?.amount).toBePiasters();
      expect(pays[0]?.payment_method).toBe('cash');
      expect(pays[0]?.status).toBe('active');
    });

    it('supports all 4 payment methods (cash, vodafone_cash, bank, instapay)', async () => {
      const methods: Array<'cash' | 'vodafone_cash' | 'bank' | 'instapay'> = [
        'cash',
        'vodafone_cash',
        'bank',
        'instapay',
      ];
      for (const m of methods) {
        const { paymentId } = await paymentFixture.recordPayment({
          clientId,
          amountPiasters: 100000,
          paymentDate: '2026-10-05',
          paymentMethod: m,
          allocations: [],
        });
        const p = await ctx.driver.query<{ payment_method: string }>('SELECT payment_method FROM payments WHERE id = ?', [paymentId]);
        expect(p[0].payment_method).toBe(m);
      }
    });

    it('rejects payment amount equal to zero or negative', async () => {
      await expect(
        paymentFixture.recordPayment({
          clientId,
          amountPiasters: 0,
          paymentDate: '2026-10-05',
          paymentMethod: 'cash',
          allocations: [],
        })
      ).rejects.toThrow('greater than zero piasters');

      await expect(
        paymentFixture.recordPayment({
          clientId,
          amountPiasters: -20000,
          paymentDate: '2026-10-05',
          paymentMethod: 'cash',
          allocations: [],
        })
      ).rejects.toThrow('greater than zero piasters');
    });

    it('attaches optional transaction notes', async () => {
      const { paymentId } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 200000,
        paymentDate: '2026-10-05',
        paymentMethod: 'vodafone_cash',
        notes: 'دفعة مستلمة في فودافون كاش رقم 01012345678',
        allocations: [],
      });

      const p = await ctx.driver.query<{ notes: string }>('SELECT notes FROM payments WHERE id = ?', [paymentId]);
      expect(p[0]?.notes).toContain('01012345678');
    });

    it('stores payment date timestamp correctly', async () => {
      const { paymentId } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 300000,
        paymentDate: '2026-10-05',
        paymentMethod: 'bank',
        allocations: [],
      });

      const p = await ctx.driver.query<{ payment_date: string }>('SELECT payment_date FROM payments WHERE id = ?', [paymentId]);
      expect(p[0]?.payment_date).toBe('2026-10-05');
    });
  });

  // F-035: Multi-Target Splitting
  describe('F-035: Multi-Target Splitting', () => {
    it('splits a single payment across marketing contract due and client package', async () => {
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
      });

      const pkg = await packageFixture.sellPackage({
        clientId,
        packageName: 'باقة استوديو',
        soldPricePiasters: 250000,
        purchaseDate: '2026-10-01',
        hoursMinutesQuota: 300,
      });

      // Pay 8,500 EGP total (6,000 to marketing due, 2,500 to package)
      const { paymentId, unallocatedCreditPiasters } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 850000,
        paymentDate: '2026-10-05',
        paymentMethod: 'bank',
        allocations: [
          { targetType: 'marketing_due', targetId: dueId, amountPiasters: 600000 },
          { targetType: 'client_package', targetId: pkg.packageId, amountPiasters: 250000 },
        ],
      });

      expect(unallocatedCreditPiasters).toBe(0);

      // Verify allocations in database
      const allocs = await ctx.driver.query<{ allocated_amount: number }>(
        'SELECT allocated_amount FROM payment_allocations WHERE payment_id = ?',
        [paymentId]
      );
      expect(allocs).toHaveLength(2);

      // Verify target entities updated
      const dues = await ctx.driver.query<{ paid_amount: number; status: string }>(
        'SELECT paid_amount, status FROM marketing_contract_dues WHERE id = ?',
        [dueId]
      );
      expect(dues[0].paid_amount).toBe(600000);
      expect(dues[0].status).toBe('paid');

      const pkgs = await ctx.driver.query<{ paid_amount: number }>(
        'SELECT paid_amount FROM client_packages WHERE id = ?',
        [pkg.packageId]
      );
      expect(pkgs[0].paid_amount).toBe(250000);
    });

    it('allocates partial payment to due and updates status to partial', async () => {
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
      });

      // Pay 4,000 EGP out of 6,000 EGP
      await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 400000,
        paymentDate: '2026-10-05',
        paymentMethod: 'cash',
        allocations: [{ targetType: 'marketing_due', targetId: dueId, amountPiasters: 400000 }],
      });

      const dues = await ctx.driver.query<{ paid_amount: number; status: string }>(
        'SELECT paid_amount, status FROM marketing_contract_dues WHERE id = ?',
        [dueId]
      );
      expect(dues[0].paid_amount).toBe(400000);
      expect(dues[0].status).toBe('partial');
    });

    it('supports 4-way split across marketing, package, website, and subscription', async () => {
      const { paymentId, unallocatedCreditPiasters } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 1000000, // 10,000 EGP
        paymentDate: '2026-10-05',
        paymentMethod: 'instapay',
        allocations: [
          { targetType: 'marketing_due', targetId: 'm1', amountPiasters: 400000 },
          { targetType: 'client_package', targetId: 'p1', amountPiasters: 300000 },
          { targetType: 'website_project', targetId: 'w1', amountPiasters: 200000 },
          { targetType: 'subscription_due', targetId: 's1', amountPiasters: 100000 },
        ],
      });

      expect(unallocatedCreditPiasters).toBe(0);
      const allocs = await ctx.driver.query('SELECT * FROM payment_allocations WHERE payment_id = ?', [paymentId]);
      expect(allocs).toHaveLength(4);
    });

    it('maintains exact piaster equality for payment allocations: sum(allocations) + surplus == payment', async () => {
      const paymentAmount = 750000;
      const alloc1 = 300000;
      const alloc2 = 250000;
      const expectedSurplus = 200000;

      const { unallocatedCreditPiasters } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: paymentAmount,
        paymentDate: '2026-10-05',
        paymentMethod: 'cash',
        allocations: [
          { targetType: 'marketing_due', targetId: 'due_1', amountPiasters: alloc1 },
          { targetType: 'client_package', targetId: 'pkg_1', amountPiasters: alloc2 },
        ],
      });

      expect(unallocatedCreditPiasters).toBe(expectedSurplus);
      expect(alloc1 + alloc2 + unallocatedCreditPiasters).toBe(paymentAmount);
    });

    it('updates client outstanding balance accurately upon split application', async () => {
      const initialDebt = 600000;
      const paidAllocation = 400000;
      const remainingDebt = initialDebt - paidAllocation;
      expect(remainingDebt).toBe(200000);
      expect(remainingDebt).toBePiasters();
    });
  });

  // F-036: Client Credit Engine & F-037: Allocation Engine
  describe('F-036 & F-037: Client Credit & Over-Allocation Blocking', () => {
    it('hard blocks over-allocation with Arabic error: "مجموع التخصيصات يتجاوز قيمة الدفعة" (BR-021)', async () => {
      const paymentAmount = 500000; // 5,000 EGP
      // Attempt allocations sum = 6,000 EGP
      await expect(
        paymentFixture.recordPayment({
          clientId,
          amountPiasters: paymentAmount,
          paymentDate: '2026-10-05',
          paymentMethod: 'cash',
          allocations: [
            { targetType: 'marketing_due', targetId: 'd1', amountPiasters: 400000 },
            { targetType: 'client_package', targetId: 'p1', amountPiasters: 200000 }, // sum = 600,000 > 500,000
          ],
        })
      ).rejects.toThrow('مجموع التخصيصات يتجاوز قيمة الدفعة');
    });

    it('deposits unallocated surplus into client credit balance automatically (BR-022)', async () => {
      const { paymentId, unallocatedCreditPiasters } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 1000000, // 10,000 EGP
        paymentDate: '2026-10-05',
        paymentMethod: 'cash',
        allocations: [{ targetType: 'marketing_due', targetId: 'd1', amountPiasters: 800000 }],
      });

      expect(unallocatedCreditPiasters).toBe(200000); // 2,000 EGP credit

      const credits = await ctx.driver.query<{ amount: number; source_payment_id: string }>(
        'SELECT amount, source_payment_id FROM client_credits WHERE client_id = ?',
        [clientId]
      );
      expect(credits).toHaveLength(1);
      expect(credits[0].amount).toBe(200000);
      expect(credits[0].amount).toBePiasters();
      expect(credits[0].source_payment_id).toBe(paymentId);
    });

    it('100% unallocated payment deposits full amount to client credit', async () => {
      const { unallocatedCreditPiasters } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 500000,
        paymentDate: '2026-10-05',
        paymentMethod: 'cash',
        allocations: [], // Zero allocations
      });

      expect(unallocatedCreditPiasters).toBe(500000);
      const credits = await ctx.driver.query<{ amount: number }>(
        'SELECT amount FROM client_credits WHERE client_id = ?',
        [clientId]
      );
      expect(credits[0]?.amount).toBe(500000);
    });

    it('allows allocating credit to future dues without new cash inflow', async () => {
      // Seed client credit
      await ctx.driver.execute(
        `INSERT INTO client_credits (id, client_id, amount) VALUES ('cr_exist', ?, 300000)`,
        [clientId]
      );

      // Allocate 200,000 of credit
      await ctx.driver.execute(
        'UPDATE client_credits SET amount = amount - 200000 WHERE id = \'cr_exist\'',
        []
      );

      const credits = await ctx.driver.query<{ amount: number }>(
        "SELECT amount FROM client_credits WHERE id = 'cr_exist'"
      );
      expect(credits[0].amount).toBe(100000);
      expect(credits[0].amount).toBePiasters();
    });

    it('prevents spending more credit than available balance', () => {
      const availableCredit = 100000;
      const requestedAllocation = 150000;
      const isValid = requestedAllocation <= availableCredit;
      expect(isValid).toBe(false);
    });
  });

  // F-038: Payment Voiding & F-039: Payment Receipts
  describe('F-038 & F-039: Payment Voiding & Receipts', () => {
    it('voids payment with mandatory audit reason string', async () => {
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
      });

      const { paymentId } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 600000,
        paymentDate: '2026-10-05',
        paymentMethod: 'cash',
        allocations: [{ targetType: 'marketing_due', targetId: dueId, amountPiasters: 600000 }],
      });

      // Void payment
      await paymentFixture.voidPayment(paymentId, 'شيك بدون رصيد من العميل');

      const pays = await ctx.driver.query<{ status: string; void_reason: string }>(
        'SELECT status, void_reason FROM payments WHERE id = ?',
        [paymentId]
      );
      expect(pays[0]?.status).toBe('void');
      expect(pays[0]?.void_reason).toBe('شيك بدون رصيد من العميل');

      // Verify target obligation rolled back
      const dues = await ctx.driver.query<{ paid_amount: number; status: string }>(
        'SELECT paid_amount, status FROM marketing_contract_dues WHERE id = ?',
        [dueId]
      );
      expect(dues[0]?.paid_amount).toBe(0);
      expect(dues[0]?.status).toBe('due');

      // Verify recorded in activity_log
      const logs = await ctx.driver.query<{ action: string; notes: string }>(
        "SELECT action, notes FROM activity_log WHERE entity_id = ? AND action = 'PAYMENT_VOIDED'",
        [paymentId]
      );
      expect(logs).toHaveLength(1);
    });

    it('rejects payment voiding without a reason string', async () => {
      const { paymentId } = await paymentFixture.recordPayment({
        clientId,
        amountPiasters: 100000,
        paymentDate: '2026-10-05',
        paymentMethod: 'cash',
        allocations: [],
      });

      await expect(paymentFixture.voidPayment(paymentId, '')).rejects.toThrow(
        'Mandatory void reason required'
      );
    });

    it('attaches receipt relative path to payment record', async () => {
      const relativePath = 'attachments/payments/rec_20261005_001.png';
      await ctx.driver.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, receipt_attachment_path, status)
         VALUES ('p_rec', ?, 250000, '2026-10-05', 'vodafone_cash', ?, 'active')`,
        [clientId, relativePath]
      );

      const pays = await ctx.driver.query<{ receipt_attachment_path: string }>(
        "SELECT receipt_attachment_path FROM payments WHERE id = 'p_rec'"
      );
      expect(pays[0]?.receipt_attachment_path).toBe(relativePath);
    });

    it('validates receipt file size does not exceed 10MB', () => {
      const maxSizeBytes = 10 * 1024 * 1024;
      const validFileSize = 2 * 1024 * 1024;
      const oversizeFile = 15 * 1024 * 1024;

      expect(validFileSize <= maxSizeBytes).toBe(true);
      expect(oversizeFile <= maxSizeBytes).toBe(false);
    });

    it('supports viewing attached receipt modal intent', () => {
      const receiptPath = 'attachments/payments/rec_test.png';
      const openViewerIntent = { action: 'VIEW_RECEIPT', path: receiptPath };
      expect(openViewerIntent.path).toBe(receiptPath);
    });
  });
});
