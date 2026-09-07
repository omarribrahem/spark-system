import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  ClientRepository,
  PaymentRepository,
  BookingRepository,
  StudioOverlapConflictError,
  PackageRepository,
  ContractRepository,
  ExpenseRepository,
  ActivityLogRepository,
} from '../../../src/database/repositories';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Database Repositories Suite (WasmSqlDriver)', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let paymentRepo: PaymentRepository;
  let bookingRepo: BookingRepository;
  let packageRepo: PackageRepository;
  let contractRepo: ContractRepository;
  let expenseRepo: ExpenseRepository;
  let activityLogRepo: ActivityLogRepository;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    paymentRepo = new PaymentRepository(driver);
    bookingRepo = new BookingRepository(driver);
    packageRepo = new PackageRepository(driver);
    contractRepo = new ContractRepository(driver);
    expenseRepo = new ExpenseRepository(driver);
    activityLogRepo = new ActivityLogRepository(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  describe('ClientRepository', () => {
    it('creates, retrieves, updates, and archives a client', async () => {
      const client = await clientRepo.create({
        name: 'كريم أحمد',
        companyName: 'سبارك ديزاين',
        phone: '01012345678',
        notes: 'عميل تسويق واستوديو',
      });

      expect(client.id).toBeDefined();
      expect(client.name).toBe('كريم أحمد');
      expect(client.company_name).toBe('سبارك ديزاين');
      expect(client.active).toBe(1);

      // Get By ID
      const fetched = await clientRepo.getById(client.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.name).toBe('كريم أحمد');

      // Update
      const updated = await clientRepo.update(client.id, {
        notes: 'تم تحديث الملاحظات',
      });
      expect(updated.notes).toBe('تم تحديث الملاحظات');

      // Archive & Unarchive
      await clientRepo.archive(client.id);
      const archived = await clientRepo.getById(client.id);
      expect(archived?.active).toBe(0);

      await clientRepo.unarchive(client.id);
      const unarchived = await clientRepo.getById(client.id);
      expect(unarchived?.active).toBe(1);

      // List & Search
      const searchResults = await clientRepo.list({ searchQuery: 'كريم' });
      expect(searchResults.length).toBeGreaterThanOrEqual(1);
      expect(searchResults[0].name).toContain('كريم');
    });
  });

  describe('ContractRepository & Monthly Dues', () => {
    it('creates a marketing contract, generates monthly dues, and enforces uniqueness', async () => {
      const client = await clientRepo.create({ name: 'شركة النور' });

      // Retainer 5,000 EGP = 500,000 piasters
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 500000,
        startDate: '2026-01-01',
        notes: 'عقد تسويق سنوي',
      });

      expect(contract.id).toBeDefined();
      expect(contract.monthly_amount).toBe(500000);
      expect(contract.status).toBe('active');

      // Generate due for 2026/09
      const due = await contractRepo.generateMonthlyDue(
        contract.id,
        2026,
        9,
        '2026-09-05'
      );

      expect(due.contract_id).toBe(contract.id);
      expect(due.year).toBe(2026);
      expect(due.month).toBe(9);
      expect(due.base_amount).toBe(500000); // historical rate locked
      expect(due.status).toBeDefined();

      // Enforces uniqueness: duplicate (contract_id, 2026, 9) must fail
      await expect(
        contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-05')
      ).rejects.toThrow();

      // Website Project
      const webProject = await contractRepo.createWebsiteProject({
        clientId: client.id,
        name: 'موقع التجارة الإلكترونية',
        totalPrice: 1500000, // 15,000 EGP
        startDate: '2026-09-01',
        nextPaymentAmount: 500000,
        nextPaymentDate: '2026-09-15',
      });

      expect(webProject.total_price).toBe(1500000);
      expect(webProject.status).toBe('new');

      await contractRepo.updateWebsiteMilestone(webProject.id, 'in_progress', 500000, '2026-10-01');
      const webList = await driver.query<{ status: string; next_payment_date: string }>(
        `SELECT status, next_payment_date FROM website_projects WHERE id = ?;`,
        [webProject.id]
      );
      expect(webList[0].status).toBe('in_progress');
      expect(webList[0].next_payment_date).toBe('2026-10-01');
    });
  });

  describe('PackageRepository', () => {
    it('creates package with immutable snapshots, items, and consumes minutes & reels', async () => {
      const client = await clientRepo.create({ name: 'فاطمة خالد' });

      // Package C: 10 hours (600 mins) + 3 reels for 4,000 EGP (400,000 piasters)
      const pkg = await packageRepo.createClientPackage({
        clientId: client.id,
        nameSnapshot: 'باقة كريتور 10 ساعات + 3 ريلز',
        soldPrice: 400000,
        purchasedAt: '2026-09-01',
        items: [
          { unit: 'hours', quantity: 600 },
          { unit: 'reels', quantity: 3 },
        ],
      });

      expect(pkg.name_snapshot).toBe('باقة كريتور 10 ساعات + 3 ريلز');
      expect(pkg.sold_price).toBe(400000);
      expect(pkg.status).toBe('not_started');
      expect(pkg.items).toHaveLength(2);

      // Consume 270 minutes (4.5 hours)
      await packageRepo.consumePackageItem(pkg.id, 'hours', 270);
      let updatedPkg = await packageRepo.getById(pkg.id);
      expect(updatedPkg?.status).toBe('active');
      const hoursItem = updatedPkg?.items.find((i) => i.unit === 'hours');
      expect(hoursItem?.used_quantity).toBe(270);
      expect(hoursItem?.purchased_quantity).toBe(600);

      // Consume 1 reel
      await packageRepo.consumePackageItem(pkg.id, 'reels', 1);
      updatedPkg = await packageRepo.getById(pkg.id);
      const reelsItem = updatedPkg?.items.find((i) => i.unit === 'reels');
      expect(reelsItem?.used_quantity).toBe(1);
      expect(reelsItem?.purchased_quantity).toBe(3);

      // Fully consume remaining (330 hours mins + 2 reels)
      await packageRepo.consumePackageItem(pkg.id, 'hours', 330);
      await packageRepo.consumePackageItem(pkg.id, 'reels', 2);

      const fullyUsedPkg = await packageRepo.getById(pkg.id);
      expect(fullyUsedPkg?.status).toBe('fully_used');

      // Over-consumption should throw
      await expect(packageRepo.consumePackageItem(pkg.id, 'reels', 1)).rejects.toThrow(
        DomainInvariantError
      );
    });
  });

  describe('PaymentRepository with Atomic Allocations & Voiding', () => {
    it('atomically records payment, creates multi-target allocations, calculates credit, and voids with rollback', async () => {
      const client = await clientRepo.create({ name: 'مجموعة المدى' });

      // Create marketing contract & due for 100,000 piasters (1,000 EGP)
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 100000,
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-05');

      // Client pays 150,000 piasters via InstaPay (1,500 EGP)
      // Dues: 100,000. Surplus: 50,000 should become unallocated credit
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 150000,
        method: 'instapay',
        date: '2026-09-06',
        note: 'تحويل انستاباي رقم 9988',
        targets: [
          {
            targetType: 'marketing_due',
            targetId: due.id,
            duePiasters: due.base_amount,
          },
        ],
      });

      expect(payment.status).toBe('active');
      expect(payment.allocations).toHaveLength(1);
      expect(payment.allocations[0].amount).toBe(100000);
      expect(payment.unallocatedCreditPiasters).toBe(50000);

      // Check due status was updated to paid
      const duesAfterPayment = await contractRepo.listDuesByContract(contract.id);
      expect(duesAfterPayment[0].status).toBe('paid');

      // Check client credit calculation
      const credit = await paymentRepo.getClientCreditPiasters(client.id);
      expect(credit).toBe(50000);

      // Void the payment
      const voidReason = 'خطأ في رقم المعاملة البنكية';
      const voidPlan = await paymentRepo.voidPayment(payment.id, voidReason);

      expect(voidPlan.paymentId).toBe(payment.id);
      expect(voidPlan.voidReason).toBe(voidReason);

      // Payment status should now be void
      const voidedPayment = await paymentRepo.getById(payment.id);
      expect(voidedPayment?.status).toBe('void');
      expect(voidedPayment?.void_reason).toBe(voidReason);
      expect(voidedPayment?.unallocatedCreditPiasters).toBe(0);

      // Target due should revert from 'paid' back to 'due' / 'overdue'
      const duesAfterVoid = await contractRepo.listDuesByContract(contract.id);
      expect(duesAfterVoid[0].status).not.toBe('paid');

      // Client credit should now be 0
      const creditAfterVoid = await paymentRepo.getClientCreditPiasters(client.id);
      expect(creditAfterVoid).toBe(0);

      // Verify activity logs recorded
      const logs = await activityLogRepo.list({ entityId: payment.id });
      expect(logs.some((l) => l.action === 'PAYMENT_CREATED')).toBe(true);
      expect(logs.some((l) => l.action === 'PAYMENT_VOIDED')).toBe(true);
    });

    it('strictly rejects voiding without a reason', async () => {
      const client = await clientRepo.create({ name: 'سامي رزق' });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 20000,
        method: 'cash',
        date: '2026-09-06',
      });

      await expect(paymentRepo.voidPayment(payment.id, '')).rejects.toThrow(DomainInvariantError);
      await expect(paymentRepo.voidPayment(payment.id, '   ')).rejects.toThrow(DomainInvariantError);
    });
  });

  describe('BookingRepository with Hard Overlap Prevention', () => {
    it('creates a booking and blocks any conflicting overlapping reservation before insert', async () => {
      const client = await clientRepo.create({ name: 'مؤسسة صدى' });

      // First booking: 2026-09-07 from 14:00 to 17:00 (180 minutes)
      const booking1 = await bookingRepo.createBooking({
        clientId: client.id,
        date: '2026-09-07',
        plannedStart: '14:00',
        plannedEnd: '17:00',
        notes: 'جلسة تسجيل بودكاست',
      });

      expect(booking1.id).toBeDefined();
      expect(booking1.planned_minutes).toBe(180);
      expect(booking1.status).toBe('scheduled');

      // Second booking: Conflicting 16:00 to 18:00 (overlaps by 60 mins between 16:00 and 17:00)
      await expect(
        bookingRepo.createBooking({
          clientId: client.id,
          date: '2026-09-07',
          plannedStart: '16:00',
          plannedEnd: '18:00',
        })
      ).rejects.toThrow(StudioOverlapConflictError);

      // Third booking: Non-overlapping abutting session starting at 17:00 should succeed
      const booking2 = await bookingRepo.createBooking({
        clientId: client.id,
        date: '2026-09-07',
        plannedStart: '17:00',
        plannedEnd: '19:00',
      });

      expect(booking2.id).toBeDefined();
      expect(booking2.planned_minutes).toBe(120);

      // Verify listing returns both non-conflicting bookings
      const list = await bookingRepo.list({ date: '2026-09-07' });
      expect(list).toHaveLength(2);
    });

    it('cancels booking and restores reserved hours back to client package', async () => {
      const client = await clientRepo.create({ name: 'طارق فؤاد' });

      // Package with 300 minutes (5 hours)
      const pkg = await packageRepo.createClientPackage({
        clientId: client.id,
        nameSnapshot: 'باقة 5 ساعات',
        soldPrice: 150000,
        purchasedAt: '2026-09-01',
        items: [{ unit: 'hours', quantity: 300 }],
      });

      // Create booking linked to package: 120 minutes
      const booking = await bookingRepo.createBooking({
        clientId: client.id,
        date: '2026-09-08',
        plannedStart: '10:00',
        plannedEnd: '12:00',
        clientPackageId: pkg.id,
      });

      // Check reserved quantity in package
      let pkgItem = (await packageRepo.getById(pkg.id))?.items[0];
      expect(pkgItem?.reserved_quantity).toBe(120);

      // Cancel booking
      await bookingRepo.cancelBooking(booking.id, 'اعتذار من العميل');

      // Booking status cancelled
      const cancelledBooking = await bookingRepo.getById(booking.id);
      expect(cancelledBooking?.status).toBe('cancelled');

      // Reserved quantity must be restored to 0
      pkgItem = (await packageRepo.getById(pkg.id))?.items[0];
      expect(pkgItem?.reserved_quantity).toBe(0);

      // Activity log confirms HOURS_RESTORED
      const logs = await activityLogRepo.list({ entityId: pkg.id, action: 'HOURS_RESTORED' });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('ExpenseRepository', () => {
    it('creates standard expense with known category', async () => {
      const expense = await expenseRepo.createExpense({
        amount: 250000, // 2,500 EGP
        date: '2026-09-06',
        category: 'rent',
        note: 'إيجار الاستوديو لشهر سبتمبر',
      });

      expect(expense.id).toBeDefined();
      expect(expense.amount).toBe(250000);
      expect(expense.category).toBe('rent');
    });

    it('strictly requires non-empty description when category is "other"', async () => {
      // Missing description
      await expect(
        expenseRepo.createExpense({
          amount: 5000,
          date: '2026-09-06',
          category: 'other',
        })
      ).rejects.toThrow(DomainInvariantError);

      // Blank description
      await expect(
        expenseRepo.createExpense({
          amount: 5000,
          date: '2026-09-06',
          category: 'other',
          description: '   ',
        })
      ).rejects.toThrow(/Detailed description is mandatory/);

      // Valid description
      const validOther = await expenseRepo.createExpense({
        amount: 5000,
        date: '2026-09-06',
        category: 'other',
        description: 'شراء ضيافة ومشروبات لضيوف الاستوديو',
      });

      expect(validOther.id).toBeDefined();
      expect(validOther.description).toBe('شراء ضيافة ومشروبات لضيوف الاستوديو');
    });
  });

  describe('ActivityLogRepository', () => {
    it('creates and lists audit log records chronologically', async () => {
      await activityLogRepo.log({
        action: 'CLIENT_CREATED',
        entityType: 'client',
        entityId: 'c-test-99',
        note: 'تسجيل عميل جديد يدوي',
        payload: { source: 'quick_add' },
      });

      const list = await activityLogRepo.list({ entityId: 'c-test-99' });
      expect(list.length).toBe(1);
      expect(list[0].action).toBe('CLIENT_CREATED');
      expect(list[0].note).toBe('تسجيل عميل جديد يدوي');
      expect(list[0].payloadJson).toContain('quick_add');
    });
  });
});
