import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  ClientRepository,
  PaymentRepository,
  ContractRepository,
  PackageRepository,
  BookingRepository,
  ExpenseRepository,
  ActivityLogRepository,
} from '../../../src/database/repositories';
import { calculateAllocation } from '../../../src/domain/calculators/payment-allocator';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Adversarial Challenge M3: Clients & Finance Workflows', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let paymentRepo: PaymentRepository;
  let contractRepo: ContractRepository;
  let packageRepo: PackageRepository;
  let bookingRepo: BookingRepository;
  let expenseRepo: ExpenseRepository;
  let activityLogRepo: ActivityLogRepository;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    paymentRepo = new PaymentRepository(driver);
    contractRepo = new ContractRepository(driver);
    packageRepo = new PackageRepository(driver);
    bookingRepo = new BookingRepository(driver);
    expenseRepo = new ExpenseRepository(driver);
    activityLogRepo = new ActivityLogRepository(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  // =========================================================================
  // Workflow 1: Payment Splitting, Over-Allocation Rejection & Surplus Credit
  // =========================================================================
  describe('Workflow 1: Payment Splitting, Over-Allocation & Surplus Credit', () => {
    it('adversarially rejects over-allocation when requested amount exceeds due amount', () => {
      expect(() =>
        calculateAllocation(200000, [
          { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000, requestedPiasters: 100001 },
        ])
      ).toThrow(DomainInvariantError);
      expect(() =>
        calculateAllocation(200000, [
          { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000, requestedPiasters: 100001 },
        ])
      ).toThrow(/Over-allocation rejected/);
    });

    it('adversarially rejects allocation when sum of requested amounts exceeds payment', () => {
      expect(() =>
        calculateAllocation(100000, [
          { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000, requestedPiasters: 60000 },
          { targetType: 'marketing_due', targetId: 'due-2', duePiasters: 100000, requestedPiasters: 50000 },
        ])
      ).toThrow(DomainInvariantError);
      expect(() =>
        calculateAllocation(100000, [
          { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000, requestedPiasters: 60000 },
          { targetType: 'marketing_due', targetId: 'due-2', duePiasters: 100000, requestedPiasters: 50000 },
        ])
      ).toThrow(/exceeds total payment amount/);
    });

    it('adversarially rejects non-integer piasters and negative numbers', () => {
      expect(() =>
        calculateAllocation(5000.75, [
          { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 5000 },
        ])
      ).toThrow(DomainInvariantError);

      expect(() =>
        calculateAllocation(-1000, [
          { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 5000 },
        ])
      ).toThrow(DomainInvariantError);

      expect(() =>
        calculateAllocation(5000, [
          { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 5000, requestedPiasters: -500 },
        ])
      ).toThrow(DomainInvariantError);
    });

    it('splits payment across multiple obligations and credits exact surplus to client', async () => {
      const client = await clientRepo.create({ name: 'شركة التميز الإعلامي' });
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 400000, // 4,000 EGP
        startDate: '2026-07-01',
      });

      const due1 = await contractRepo.generateMonthlyDue(contract.id, 2026, 7, '2026-07-10');
      const due2 = await contractRepo.generateMonthlyDue(contract.id, 2026, 8, '2026-08-10');

      // Total due = 8,000 EGP (800,000 piasters). Client pays 10,000 EGP (1,000,000 piasters).
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 1000000,
        method: 'bank_transfer',
        date: '2026-08-15',
        targets: [
          { targetType: 'marketing_due', targetId: due1.id, duePiasters: 400000 },
          { targetType: 'marketing_due', targetId: due2.id, duePiasters: 400000 },
        ],
      });

      expect(payment.allocations).toHaveLength(2);
      expect(payment.allocations[0].amount).toBe(400000);
      expect(payment.allocations[1].amount).toBe(400000);
      expect(payment.unallocatedCreditPiasters).toBe(200000); // 2,000 EGP surplus

      // Verify client ledger unallocated credit
      const clientCredit = await paymentRepo.getClientCreditPiasters(client.id);
      expect(clientCredit).toBe(200000);

      // Verify dues are marked paid
      const dues = await contractRepo.listDuesByContract(contract.id);
      expect(dues.every((d) => d.status === 'paid')).toBe(true);
    });

    it('treats 100% of payment as client credit when target list is empty', async () => {
      const client = await clientRepo.create({ name: 'مؤسسة الدفع المقدم' });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 500000, // 5,000 EGP advance deposit
        method: 'instapay',
        date: '2026-09-01',
        targets: [],
      });

      expect(payment.allocations).toHaveLength(0);
      expect(payment.unallocatedCreditPiasters).toBe(500000);

      const clientCredit = await paymentRepo.getClientCreditPiasters(client.id);
      expect(clientCredit).toBe(500000);
    });
  });

  // =========================================================================
  // Workflow 2: Payment Voiding, Allocation Rollback & Status Reversion
  // =========================================================================
  describe('Workflow 2: Payment Voiding & Rollback Invariants', () => {
    it('rolls back allocations, reverts dues to due/overdue, and removes surplus credit', async () => {
      const client = await clientRepo.create({ name: 'مجموعة المروج' });
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 300000, // 3,000 EGP
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-05');

      // Pay 4,000 EGP for 3,000 due -> 1,000 surplus
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 400000,
        method: 'cash',
        date: '2026-09-05',
        targets: [{ targetType: 'marketing_due', targetId: due.id, duePiasters: 300000 }],
      });

      expect(payment.unallocatedCreditPiasters).toBe(100000);
      expect(await paymentRepo.getClientCreditPiasters(client.id)).toBe(100000);

      let dues = await contractRepo.listDuesByContract(contract.id);
      expect(dues[0].status).toBe('paid');

      // Void payment with reason
      const voidReason = 'إلغاء الإيصال بسبب خطأ محاسبي وسحب العميل للمبلغ';
      const voidPlan = await paymentRepo.voidPayment(payment.id, voidReason);

      expect(voidPlan.paymentId).toBe(payment.id);
      expect(voidPlan.totalRollbackPiasters).toBe(300000);

      // Verify payment status updated
      const voided = await paymentRepo.getById(payment.id);
      expect(voided?.status).toBe('void');
      expect(voided?.void_reason).toBe(voidReason);
      expect(voided?.unallocatedCreditPiasters).toBe(0);

      // Verify surplus credit is wiped out
      expect(await paymentRepo.getClientCreditPiasters(client.id)).toBe(0);

      // Verify due status reverted back (no longer paid)
      dues = await contractRepo.listDuesByContract(contract.id);
      expect(dues[0].status).not.toBe('paid');

      // Verify activity log audit trail
      const logs = await activityLogRepo.list({ entityType: 'payment', entityId: payment.id });
      const voidLog = logs.find((l) => l.action === 'PAYMENT_VOIDED');
      expect(voidLog).toBeDefined();
      expect(voidLog?.note).toBe(voidReason);
    });

    it('strictly rejects voiding without reason or with whitespace-only reason', async () => {
      const client = await clientRepo.create({ name: 'عميل اختبار البطلان' });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 100000,
        method: 'cash',
        date: '2026-09-06',
      });

      await expect(paymentRepo.voidPayment(payment.id, '')).rejects.toThrow(DomainInvariantError);
      await expect(paymentRepo.voidPayment(payment.id, '    \t   ')).rejects.toThrow(DomainInvariantError);
      await expect(paymentRepo.voidPayment(payment.id, '\n')).rejects.toThrow(DomainInvariantError);
    });

    it('adversarially rejects double voiding an already voided payment', async () => {
      const client = await clientRepo.create({ name: 'عميل الإلغاء المزدوج' });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 100000,
        method: 'cash',
        date: '2026-09-06',
      });

      await paymentRepo.voidPayment(payment.id, 'إلغاء أولي صحيح');
      await expect(paymentRepo.voidPayment(payment.id, 'محاولة إلغاء ثانية')).rejects.toThrow(
        DomainInvariantError
      );
      await expect(paymentRepo.voidPayment(payment.id, 'محاولة إلغاء ثانية')).rejects.toThrow(
        /already/
      );
    });

    it('enforces SQLite trigger blocking direct physical deletion of payments', async () => {
      const client = await clientRepo.create({ name: 'عميل الحماية من الحذف' });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 200000,
        method: 'cash',
        date: '2026-09-06',
      });

      await expect(
        driver.execute('DELETE FROM payments WHERE id = ?;', [payment.id])
      ).rejects.toThrow(/Direct physical deletion of payments is prohibited/);

      const stillThere = await paymentRepo.getById(payment.id);
      expect(stillThere).not.toBeNull();
    });
  });

  // =========================================================================
  // Workflow 3: Expense Category 'other' Validation (PRD §48 / BR-041)
  // =========================================================================
  describe('Workflow 3: Expense Category "other" Validation (BR-041)', () => {
    it('strictly rejects expense when category is "other" and description is empty or whitespace', async () => {
      // Empty string
      await expect(
        expenseRepo.createExpense({
          amount: 50000,
          date: '2026-09-06',
          category: 'other',
          description: '',
        })
      ).rejects.toThrow(DomainInvariantError);
      await expect(
        expenseRepo.createExpense({
          amount: 50000,
          date: '2026-09-06',
          category: 'other',
          description: '',
        })
      ).rejects.toThrow(/Detailed description is mandatory when expense category is "other"/);

      // Whitespace only
      await expect(
        expenseRepo.createExpense({
          amount: 50000,
          date: '2026-09-06',
          category: 'other',
          description: '      \t  \n  ',
        })
      ).rejects.toThrow(DomainInvariantError);

      // Null or undefined description
      await expect(
        expenseRepo.createExpense({
          amount: 50000,
          date: '2026-09-06',
          category: 'other',
          description: null as unknown as string,
        })
      ).rejects.toThrow(DomainInvariantError);

      await expect(
        expenseRepo.createExpense({
          amount: 50000,
          date: '2026-09-06',
          category: 'other',
        })
      ).rejects.toThrow(DomainInvariantError);
    });

    it('accepts expense when category is "other" with valid description', async () => {
      const expense = await expenseRepo.createExpense({
        amount: 35000, // 350 EGP
        date: '2026-09-06',
        category: 'other',
        description: '  شراء بطاريات وموزع كابلات كهربائية للاستوديو  ',
      });

      expect(expense.id).toBeDefined();
      expect(expense.category).toBe('other');
      expect(expense.description).toBe('شراء بطاريات وموزع كابلات كهربائية للاستوديو');
    });

    it('allows omitting description for standard categories (rent, salary, equipment, etc.)', async () => {
      const rentExp = await expenseRepo.createExpense({
        amount: 1500000,
        date: '2026-09-01',
        category: 'rent',
      });
      expect(rentExp.id).toBeDefined();
      expect(rentExp.category).toBe('rent');
      expect(rentExp.description).toBeNull();

      const salaryExp = await expenseRepo.createExpense({
        amount: 2500000,
        date: '2026-09-01',
        category: 'salary',
        description: '',
      });
      expect(salaryExp.id).toBeDefined();
      expect(salaryExp.category).toBe('salary');
    });
  });

  // =========================================================================
  // Workflow 4: Client Archiving vs Physical Deletion
  // =========================================================================
  describe('Workflow 4: Client Archiving vs Physical Deletion', () => {
    it('blocks physical DELETE on clients with active financial history via SQLite foreign key constraint', async () => {
      const client = await clientRepo.create({ name: 'مؤسسة النجاح المحمية' });

      // Add financial history (marketing contract + due + payment)
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 500000,
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-10');
      await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 500000,
        method: 'bank_transfer',
        date: '2026-09-05',
        targets: [{ targetType: 'marketing_due', targetId: due.id, duePiasters: 500000 }],
      });

      // Attempting direct physical DELETE must fail due to ON DELETE RESTRICT
      await expect(
        driver.execute('DELETE FROM clients WHERE id = ?;', [client.id])
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);

      // Verify client still exists in database
      const fetched = await clientRepo.getById(client.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(client.id);
    });

    it('blocks physical DELETE on clients with sold packages or studio bookings', async () => {
      const client = await clientRepo.create({ name: 'شركة الإنتاج السينمائي' });

      const pkg = await packageRepo.createClientPackage({
        clientId: client.id,
        nameSnapshot: 'باقة استوديو 10 ساعات',
        soldPrice: 300000,
        purchasedAt: '2026-09-01',
        items: [{ unit: 'hours', quantity: 600 }],
      });

      await expect(
        driver.execute('DELETE FROM clients WHERE id = ?;', [client.id])
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);

      // Create booking
      await bookingRepo.createBooking({
        clientId: client.id,
        date: '2026-09-12',
        plannedStart: '10:00',
        plannedEnd: '12:00',
        clientPackageId: pkg.id,
      });

      await expect(
        driver.execute('DELETE FROM clients WHERE id = ?;', [client.id])
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });

    it('soft-archives client and preserves complete financial and service history', async () => {
      const client = await clientRepo.create({ name: 'عميل تجربة الأرشفة' });
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 200000,
        startDate: '2026-09-01',
      });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 300000,
        method: 'cash',
        date: '2026-09-02',
      });

      expect(client.active).toBe(1);

      // Perform soft archive
      await clientRepo.archive(client.id);

      // Verify client is marked archived (active = 0)
      const archived = await clientRepo.getById(client.id);
      expect(archived?.active).toBe(0);

      // Verify contracts and payments are 100% preserved
      const contractFetched = await contractRepo.getMarketingContractById(contract.id);
      expect(contractFetched).not.toBeNull();
      expect(contractFetched?.id).toBe(contract.id);

      const payments = await paymentRepo.listByClient(client.id);
      expect(payments).toHaveLength(1);
      expect(payments[0].id).toBe(payment.id);

      // Verify client credit is 100% preserved
      const credit = await paymentRepo.getClientCreditPiasters(client.id);
      expect(credit).toBe(300000);

      // Verify filtering respects archive flag
      const activeList = await clientRepo.list({ activeOnly: true });
      expect(activeList.some((c) => c.id === client.id)).toBe(false);

      const archivedList = await clientRepo.list({ archivedOnly: true });
      expect(archivedList.some((c) => c.id === client.id)).toBe(true);

      // Verify unarchive restores active state
      await clientRepo.unarchive(client.id);
      const restored = await clientRepo.getById(client.id);
      expect(restored?.active).toBe(1);
    });
  });
});
