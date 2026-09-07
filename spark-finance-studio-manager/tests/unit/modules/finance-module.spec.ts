import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  ClientRepository,
  PaymentRepository,
  ContractRepository,
  ExpenseRepository,
  ActivityLogRepository,
} from '../../../src/database/repositories';
import { calculateAllocation } from '../../../src/domain/calculators/payment-allocator';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Finance & Expenses Module Unit Tests (M3)', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let paymentRepo: PaymentRepository;
  let contractRepo: ContractRepository;
  let expenseRepo: ExpenseRepository;
  let activityLogRepo: ActivityLogRepository;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    paymentRepo = new PaymentRepository(driver);
    contractRepo = new ContractRepository(driver);
    expenseRepo = new ExpenseRepository(driver);
    activityLogRepo = new ActivityLogRepository(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  describe('Payment Recording & Multi-Target Splitting', () => {
    it('records a payment and satisfies an open marketing due atomically', async () => {
      const client = await clientRepo.create({ name: 'شركة النجوم للتسويق' });
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 500000, // 5,000 EGP
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-10');

      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 500000,
        method: 'vodafone_cash',
        date: '2026-09-08',
        note: 'تحويل عبر محفظة فودافون كاش',
        targets: [
          {
            targetType: 'marketing_due',
            targetId: due.id,
            duePiasters: 500000,
          },
        ],
      });

      expect(payment.id).toBeDefined();
      expect(payment.amount).toBe(500000);
      expect(payment.method).toBe('vodafone_cash');
      expect(payment.status).toBe('active');
      expect(payment.allocations.length).toBe(1);
      expect(payment.allocations[0].amount).toBe(500000);
      expect(payment.unallocatedCreditPiasters).toBe(0);

      // Verify marketing due status updated to 'paid'
      const updatedDue = await contractRepo.listDuesByContract(contract.id);
      expect(updatedDue[0].status).toBe('paid');
    });

    it('splits a single payment across multiple target obligations with partial and full allocations', async () => {
      const client = await clientRepo.create({ name: 'عيادة د. حازم' });
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 400000, // 4,000 EGP per month
        startDate: '2026-08-01',
      });

      const dueAugust = await contractRepo.generateMonthlyDue(contract.id, 2026, 8, '2026-08-10');
      const dueSeptember = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-10');

      // Client pays 6,500 EGP (650,000 piasters) to cover August (4,000) and part of September (2,500)
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 650000,
        method: 'instapay',
        date: '2026-09-04',
        targets: [
          { targetType: 'marketing_due', targetId: dueAugust.id, duePiasters: 400000 },
          { targetType: 'marketing_due', targetId: dueSeptember.id, duePiasters: 400000 },
        ],
      });

      expect(payment.allocations.length).toBe(2);
      expect(payment.allocations[0].amount).toBe(400000); // Fully paid
      expect(payment.allocations[1].amount).toBe(250000); // Partially paid
      expect(payment.unallocatedCreditPiasters).toBe(0);

      // Check due statuses
      const dues = await contractRepo.listDuesByContract(contract.id);
      const aug = dues.find((d) => d.month === 8);
      const sep = dues.find((d) => d.month === 9);

      expect(aug?.status).toBe('paid');
      expect(sep?.status).toBe('partial');
    });

    it('generates surplus unallocated credit when payment exceeds total dues', async () => {
      const client = await clientRepo.create({ name: 'كافيه البن' });
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 300000, // 3,000 EGP
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-10');

      // Client pays 5,000 EGP (500,000 piasters)
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 500000,
        method: 'cash',
        date: '2026-09-05',
        targets: [
          { targetType: 'marketing_due', targetId: due.id, duePiasters: 300000 },
        ],
      });

      expect(payment.allocations[0].amount).toBe(300000);
      expect(payment.unallocatedCreditPiasters).toBe(200000); // 2,000 EGP credit

      const clientCredit = await paymentRepo.getClientCreditPiasters(client.id);
      expect(clientCredit).toBe(200000);
    });

    it('blocks over-allocation when requested allocation exceeds due or payment amount', async () => {
      // Calculator test
      expect(() => {
        calculateAllocation(100000, [
          { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 50000, requestedPiasters: 60000 },
        ]);
      }).toThrow(DomainInvariantError);

      expect(() => {
        calculateAllocation(100000, [
          { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 150000, requestedPiasters: 120000 },
        ]);
      }).toThrow(DomainInvariantError);
    });

    it('preserves unallocated credit when autoFillRemaining is set to false', async () => {
      const client = await clientRepo.create({ name: 'عميل اختبار التوزيع اليدوي' });
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 300000,
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-10');

      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 500000,
        method: 'cash',
        date: '2026-09-06',
        autoFillRemaining: false,
        targets: [
          { targetType: 'marketing_due', targetId: due.id, duePiasters: 300000, requestedPiasters: 100000 },
        ],
      });

      expect(payment.allocations.length).toBe(1);
      expect(payment.allocations[0].amount).toBe(100000);
      expect(payment.unallocatedCreditPiasters).toBe(400000);

      const clientCredit = await paymentRepo.getClientCreditPiasters(client.id);
      expect(clientCredit).toBe(400000);
    });

    it('records a payment with receipt attachment path, creates an attachment record, and retrieves receipt_path', async () => {
      const client = await clientRepo.create({ name: 'عميل إيصال الدفع' });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 250000,
        method: 'instapay',
        date: '2026-09-06',
        receiptAttachmentId: 'receipts/2026/09/instapay-01928.png',
      });

      expect(payment.id).toBeDefined();
      expect(payment.receipt_attachment_id).toBeDefined();
      expect(payment.receipt_attachment_id).not.toBe('receipts/2026/09/instapay-01928.png');
      expect(payment.receipt_path).toBe('receipts/2026/09/instapay-01928.png');

      // Verify attachment row created in SQLite attachments table
      const attachments = await driver.query<{ id: string; file_path: string; entity_type: string; entity_id: string }>(
        `SELECT id, file_path, entity_type, entity_id FROM attachments WHERE id = ?;`,
        [payment.receipt_attachment_id!]
      );
      expect(attachments.length).toBe(1);
      expect(attachments[0].file_path).toBe('receipts/2026/09/instapay-01928.png');
      expect(attachments[0].entity_type).toBe('payment');
      expect(attachments[0].entity_id).toBe(payment.id);

      // Verify getById retrieves receipt_path
      const retrieved = await paymentRepo.getById(payment.id);
      expect(retrieved?.receipt_path).toBe('receipts/2026/09/instapay-01928.png');

      // Verify list retrieves receipt_path
      const list = await paymentRepo.list();
      const found = list.find((p) => p.id === payment.id);
      expect(found?.receipt_path).toBe('receipts/2026/09/instapay-01928.png');
    });

    it('links payment directly to an existing attachment UUID without duplicate attachment creation', async () => {
      const client = await clientRepo.create({ name: 'عميل إيصال مسبق' });
      const attachmentId = crypto.randomUUID();
      await driver.execute(
        `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_path, file_size, mime_type, sha256, created_at)
         VALUES (?, 'payment', 'pre-existing', 'instapay.png', 'receipts/instapay.png', 1024, 'image/png', '', ?);`,
        [attachmentId, new Date().toISOString()]
      );

      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 150000,
        method: 'vodafone_cash',
        date: '2026-09-06',
        receiptAttachmentId: attachmentId,
      });

      expect(payment.receipt_attachment_id).toBe(attachmentId);
      expect(payment.receipt_path).toBe('receipts/instapay.png');

      // Check no extra attachment was created
      const countRows = await driver.query<{ count: number }>(
        `SELECT count(*) as count FROM attachments WHERE id = ?;`,
        [attachmentId]
      );
      expect(countRows[0].count).toBe(1);
    });
  });

  describe('Payment Voiding (Soft-Cancellation)', () => {
    it('voids a payment with mandatory reason, rolls back allocations, and logs audit record', async () => {
      const client = await clientRepo.create({ name: 'شركة السندباد' });
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 600000, // 6,000 EGP
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-10');

      // Pay in full
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 600000,
        method: 'bank_transfer',
        date: '2026-09-05',
        targets: [{ targetType: 'marketing_due', targetId: due.id, duePiasters: 600000 }],
      });

      const duesBeforeVoid = await contractRepo.listDuesByContract(contract.id);
      expect(duesBeforeVoid[0].status).toBe('paid');

      // Soft-void the payment
      const voidResult = await paymentRepo.voidPayment(
        payment.id,
        'شيك بنكي مرتد من بنك مصر بسبب عدم مطابقة التوقيع'
      );

      expect(voidResult.paymentId).toBe(payment.id);
      expect(voidResult.totalRollbackPiasters).toBe(600000);

      // Verify payment record updated to void
      const voidedPayment = await paymentRepo.getById(payment.id);
      expect(voidedPayment?.status).toBe('void');
      expect(voidedPayment?.void_reason).toContain('شيك بنكي مرتد');
      expect(voidedPayment?.unallocatedCreditPiasters).toBe(0);

      // Verify due returned to due/overdue status
      const duesAfterVoid = await contractRepo.listDuesByContract(contract.id);
      expect(duesAfterVoid[0].status).not.toBe('paid');

      // Verify activity log recorded PAYMENT_VOIDED
      const logs = await activityLogRepo.list({ entityType: 'payment', entityId: payment.id });
      const voidLog = logs.find((l) => l.action === 'PAYMENT_VOIDED');
      expect(voidLog).toBeDefined();
      expect(voidLog?.note).toContain('عدم مطابقة التوقيع');
    });

    it('rejects voiding without a reason or voiding an already voided payment', async () => {
      const client = await clientRepo.create({ name: 'عميل اختبار الإلغاء' });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 100000,
        method: 'cash',
        date: '2026-09-06',
      });

      // Void without reason
      await expect(paymentRepo.voidPayment(payment.id, '   ')).rejects.toThrow(DomainInvariantError);

      // Void with valid reason
      await paymentRepo.voidPayment(payment.id, 'خطأ في الحساب');

      // Void again
      await expect(paymentRepo.voidPayment(payment.id, 'إلغاء مكرر')).rejects.toThrow(DomainInvariantError);
    });
  });

  describe('Expense Management & BR-041 Governance', () => {
    it('creates operational expenses across standard categories', async () => {
      const exp1 = await expenseRepo.createExpense({
        amount: 1500000, // 15,000 EGP rent
        date: '2026-09-01',
        category: 'rent',
        note: 'إيجار شهر سبتمبر 2026',
      });
      expect(exp1.id).toBeDefined();
      expect(exp1.amount).toBe(1500000);
      expect(exp1.category).toBe('rent');

      const exp2 = await expenseRepo.createExpense({
        amount: 350000, // 3,500 EGP equipment
        date: '2026-09-03',
        category: 'equipment',
        description: 'شراء إضاءة سوفت بوكس 120 سم',
      });
      expect(exp2.category).toBe('equipment');
    });

    it('strictly enforces mandatory description when category is "other" (BR-041 / PRD §48)', async () => {
      // 1. Missing description when category is 'other' -> must reject
      await expect(
        expenseRepo.createExpense({
          amount: 25000, // 250 EGP
          date: '2026-09-04',
          category: 'other',
          description: '',
        })
      ).rejects.toThrow(DomainInvariantError);

      await expect(
        expenseRepo.createExpense({
          amount: 25000,
          date: '2026-09-04',
          category: 'other',
          description: '    ',
        })
      ).rejects.toThrow(DomainInvariantError);

      // 2. Valid description when category is 'other' -> succeeds
      const validOther = await expenseRepo.createExpense({
        amount: 25000,
        date: '2026-09-04',
        category: 'other',
        description: 'شراء مفاتيح ونسخ إضافية لباب الاستوديو',
      });
      expect(validOther.id).toBeDefined();
      expect(validOther.description).toBe('شراء مفاتيح ونسخ إضافية لباب الاستوديو');
    });

    it('filters expenses by category and date range', async () => {
      await expenseRepo.createExpense({
        amount: 500000,
        date: '2026-08-15',
        category: 'salary',
      });
      await expenseRepo.createExpense({
        amount: 800000,
        date: '2026-09-02',
        category: 'salary',
      });
      await expenseRepo.createExpense({
        amount: 200000,
        date: '2026-09-05',
        category: 'ads',
      });

      // Filter by category
      const salaries = await expenseRepo.list({ category: 'salary' });
      expect(salaries.length).toBe(2);

      // Filter by date range
      const septList = await expenseRepo.list({
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      });
      expect(septList.length).toBe(2);
    });

    it('records an expense with receipt attachment path, creates an attachment record, and retrieves receipt_path', async () => {
      const exp = await expenseRepo.createExpense({
        amount: 10000,
        date: '2026-09-06',
        category: 'studio',
        receiptAttachmentId: 'receipts/2026/09/bill-82.jpg',
      });

      expect(exp.id).toBeDefined();
      expect(exp.receiptAttachmentId).toBeDefined();
      expect(exp.receiptAttachmentId).not.toBe('receipts/2026/09/bill-82.jpg');
      expect(exp.receipt_path).toBe('receipts/2026/09/bill-82.jpg');
      expect(exp.receiptPath).toBe('receipts/2026/09/bill-82.jpg');

      // Verify attachment row created in SQLite attachments table
      const attachments = await driver.query<{ id: string; file_path: string; entity_type: string; entity_id: string }>(
        `SELECT id, file_path, entity_type, entity_id FROM attachments WHERE id = ?;`,
        [exp.receiptAttachmentId!]
      );
      expect(attachments.length).toBe(1);
      expect(attachments[0].file_path).toBe('receipts/2026/09/bill-82.jpg');
      expect(attachments[0].entity_type).toBe('expense');
      expect(attachments[0].entity_id).toBe(exp.id);

      // Verify getById retrieves receipt_path
      const retrieved = await expenseRepo.getById(exp.id);
      expect(retrieved?.receipt_path).toBe('receipts/2026/09/bill-82.jpg');

      // Verify list retrieves receipt_path
      const list = await expenseRepo.list();
      const found = list.find((e) => e.id === exp.id);
      expect(found?.receipt_path).toBe('receipts/2026/09/bill-82.jpg');
    });

    it('links expense directly to an existing attachment UUID without duplicate attachment creation', async () => {
      const attachmentId = crypto.randomUUID();
      await driver.execute(
        `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_path, file_size, mime_type, sha256, created_at)
         VALUES (?, 'expense', 'pre-existing', 'bill.pdf', 'receipts/bill.pdf', 2048, 'application/pdf', '', ?);`,
        [attachmentId, new Date().toISOString()]
      );

      const exp = await expenseRepo.createExpense({
        amount: 50000,
        date: '2026-09-06',
        category: 'software',
        receiptAttachmentId: attachmentId,
      });

      expect(exp.receiptAttachmentId).toBe(attachmentId);
      expect(exp.receipt_path).toBe('receipts/bill.pdf');

      // Check no extra attachment was created
      const countRows = await driver.query<{ count: number }>(
        `SELECT count(*) as count FROM attachments WHERE id = ?;`,
        [attachmentId]
      );
      expect(countRows[0].count).toBe(1);
    });
  });
});
