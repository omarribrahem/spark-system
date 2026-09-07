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
  ActivityLogRepository,
} from '../../../src/database/repositories';
import { calculateAllocation } from '../../../src/domain/calculators/payment-allocator';
import {
  calculatePackageBalance,
  reconcilePackageConsumption,
  reconcilePlannedVsActual,
  consumeUnitsFIFO,
  ConsumablePackageItem,
} from '../../../src/domain/calculators/package-consumption';
import {
  checkStudioOverlap,
  normalizeSlot,
} from '../../../src/domain/calculators/studio-overlap';
import {
  previewRecurringSlots,
  filterCommitableSlots,
} from '../../../src/domain/calculators/recurring-booking-engine';
import { planPaymentVoiding } from '../../../src/domain/calculators/payment-voiding';
import { TargetDue } from '../../../src/domain/models/financial';
import { TimeSlot, RecurringRuleInput } from '../../../src/domain/models/booking';
import { DomainInvariantError } from '../../../src/domain/rules/invariants';

describe('Adversarial Challenge Suite: M2 Domain Engines & Repositories', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;
  let paymentRepo: PaymentRepository;
  let bookingRepo: BookingRepository;
  let packageRepo: PackageRepository;
  let contractRepo: ContractRepository;
  let activityLogRepo: ActivityLogRepository;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);

    clientRepo = new ClientRepository(driver);
    paymentRepo = new PaymentRepository(driver);
    bookingRepo = new BookingRepository(driver);
    packageRepo = new PackageRepository(driver);
    contractRepo = new ContractRepository(driver);
    activityLogRepo = new ActivityLogRepository(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  // =========================================================================
  // Challenge 1: Payment Allocation Calculator & Repository
  // =========================================================================
  describe('Challenge 1: Payment Allocation Invariants', () => {
    it('rejects allocating more than target due amount (over-allocation)', () => {
      const targets: TargetDue[] = [
        { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000, requestedPiasters: 120000 },
      ];

      expect(() => calculateAllocation(150000, targets)).toThrow(DomainInvariantError);
      expect(() => calculateAllocation(150000, targets)).toThrow(/Over-allocation rejected/);
    });

    it('rejects allocating when sum of requested amounts exceeds total payment amount', () => {
      const targets: TargetDue[] = [
        { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000, requestedPiasters: 60000 },
        { targetType: 'website_project', targetId: 'web-1', duePiasters: 100000, requestedPiasters: 60000 },
      ];

      // Sum of requested is 120,000, but payment is only 100,000
      expect(() => calculateAllocation(100000, targets)).toThrow(DomainInvariantError);
      expect(() => calculateAllocation(100000, targets)).toThrow(/exceeds total payment amount/);
    });

    it('rejects negative payment amount', () => {
      const targets: TargetDue[] = [
        { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000 },
      ];

      expect(() => calculateAllocation(-50000, targets)).toThrow(DomainInvariantError);
      expect(() => calculateAllocation(-50000, targets)).toThrow(/cannot be negative in piasters/);
    });

    it('rejects negative due amounts or requested amounts in targets', () => {
      const targetsNegativeDue: TargetDue[] = [
        { targetType: 'marketing_due', targetId: 'due-1', duePiasters: -1000 },
      ];
      expect(() => calculateAllocation(50000, targetsNegativeDue)).toThrow(DomainInvariantError);

      const targetsNegativeReq: TargetDue[] = [
        { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 50000, requestedPiasters: -100 },
      ];
      expect(() => calculateAllocation(50000, targetsNegativeReq)).toThrow(DomainInvariantError);
    });

    it('rejects non-integer floating-point piasters in calculator and repository', async () => {
      const targets: TargetDue[] = [
        { targetType: 'marketing_due', targetId: 'due-1', duePiasters: 100000 },
      ];

      expect(() => calculateAllocation(1000.5, targets)).toThrow(DomainInvariantError);

      const client = await clientRepo.create({ name: 'عميل اختباري' });
      await expect(
        paymentRepo.recordPayment({
          clientId: client.id,
          amount: 500.25,
          method: 'cash',
          date: '2026-09-06',
        })
      ).rejects.toThrow(DomainInvariantError);
    });

    it('automatically converts payment surplus into client credit without leaking piasters', async () => {
      const client = await clientRepo.create({ name: 'مؤسسة الريادة' });
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 200000, // 2,000 EGP
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-05');

      // Client pays 350,000 piasters (3,500 EGP) for 200,000 piasters due
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 350000,
        method: 'bank_transfer',
        date: '2026-09-06',
        targets: [{ targetType: 'marketing_due', targetId: due.id, duePiasters: due.base_amount }],
      });

      expect(payment.allocations).toHaveLength(1);
      expect(payment.allocations[0].amount).toBe(200000);
      expect(payment.unallocatedCreditPiasters).toBe(150000);

      // Verify repository credit calculation
      const credit = await paymentRepo.getClientCreditPiasters(client.id);
      expect(credit).toBe(150000);
    });
  });

  // =========================================================================
  // Challenge 2: Package C Canonical Scenario & Decoupled Service Balance
  // =========================================================================
  describe('Challenge 2: Package Consumption (Package C 10h + 3 Reels)', () => {
    it('verifies Package C after consuming 4.5h and 1 reel leaves exactly 5.5h / 330 min and 2 reels', async () => {
      const client = await clientRepo.create({ name: 'سارة مصطفى' });

      // Package C purchased: 10 hours (600 mins) + 3 reels for 4,000 EGP (400,000 piasters)
      const pkg = await packageRepo.createClientPackage({
        clientId: client.id,
        nameSnapshot: 'باقة كريتور Package C',
        soldPrice: 400000,
        purchasedAt: '2026-09-01',
        items: [
          { unit: 'hours', quantity: 600 },
          { unit: 'reels', quantity: 3 },
        ],
      });

      // Pure domain calculator verification
      const hoursBalance = calculatePackageBalance(600, 270, 0); // 4.5h = 270 mins
      expect(hoursBalance.purchasedQuantity).toBe(600);
      expect(hoursBalance.usedQuantity).toBe(270);
      expect(hoursBalance.remainingAvailableQuantity).toBe(330);
      expect(hoursBalance.remainingAvailableQuantity / 60).toBe(5.5);

      const reelsBalance = calculatePackageBalance(3, 1, 0);
      expect(reelsBalance.purchasedQuantity).toBe(3);
      expect(reelsBalance.usedQuantity).toBe(1);
      expect(reelsBalance.remainingAvailableQuantity).toBe(2);

      // Repository lifecycle verification
      await packageRepo.consumePackageItem(pkg.id, 'hours', 270);
      await packageRepo.consumePackageItem(pkg.id, 'reels', 1);

      const updated = await packageRepo.getById(pkg.id);
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('active');

      const hoursItem = updated?.items.find((i) => i.unit === 'hours');
      const reelsItem = updated?.items.find((i) => i.unit === 'reels');

      expect(hoursItem?.purchased_quantity).toBe(600);
      expect(hoursItem?.used_quantity).toBe(270);
      expect(hoursItem!.purchased_quantity - hoursItem!.used_quantity).toBe(330); // 5.5 hours

      expect(reelsItem?.purchased_quantity).toBe(3);
      expect(reelsItem?.used_quantity).toBe(1);
      expect(reelsItem!.purchased_quantity - reelsItem!.used_quantity).toBe(2); // 2 reels
    });

    it('rejects consuming more minutes or reels than purchased capacity', async () => {
      const client = await clientRepo.create({ name: 'مروان علي' });
      const pkg = await packageRepo.createClientPackage({
        clientId: client.id,
        nameSnapshot: 'باقة مصغرة',
        soldPrice: 100000,
        purchasedAt: '2026-09-01',
        items: [
          { unit: 'hours', quantity: 60 },
          { unit: 'reels', quantity: 1 },
        ],
      });

      // Attempt consuming 61 minutes
      await expect(packageRepo.consumePackageItem(pkg.id, 'hours', 61)).rejects.toThrow(
        DomainInvariantError
      );

      // Attempt consuming 2 reels
      await expect(packageRepo.consumePackageItem(pkg.id, 'reels', 2)).rejects.toThrow(
        DomainInvariantError
      );
    });

    it('rejects fractional minutes or negative values in package consumption', () => {
      expect(() => calculatePackageBalance(600, 270.5, 0)).toThrow(DomainInvariantError);
      expect(() => calculatePackageBalance(600, -10, 0)).toThrow(DomainInvariantError);
      expect(() => reconcilePackageConsumption(600, 300, 0.5)).toThrow(DomainInvariantError);
    });

    it('reconciles planned vs actual durations and protects remaining capacity', () => {
      // Planned: 120 mins, Actual: 180 mins, Total: 300 mins
      const res = reconcilePlannedVsActual(120, 180, 120, 0, 300);
      expect(res.newReservedMinutes).toBe(0);
      expect(res.newUsedMinutes).toBe(180);
      expect(res.remainingAvailableMinutes).toBe(120);

      // Actual exceeds total capacity
      expect(() => reconcilePlannedVsActual(120, 350, 120, 0, 300)).toThrow(DomainInvariantError);
    });

    it('exhausts multiple packages in FIFO order without violating individual package bounds', () => {
      const pkgs: ConsumablePackageItem[] = [
        { clientPackageId: 'pkg-old', unit: 'hours', purchasedQuantity: 120, usedQuantity: 60, reservedQuantity: 0 },
        { clientPackageId: 'pkg-new', unit: 'hours', purchasedQuantity: 300, usedQuantity: 0, reservedQuantity: 0 },
      ];

      const res = consumeUnitsFIFO(pkgs, 'hours', 150);
      expect(res.consumedAmount).toBe(150);
      expect(res.unfulfilledAmount).toBe(0);
      expect(res.depletions).toHaveLength(2);
      expect(res.depletions[0].consumed).toBe(60); // finishes pkg-old
      expect(res.depletions[1].consumed).toBe(90); // takes 90 from pkg-new
    });
  });

  // =========================================================================
  // Challenge 3: Studio Overlap Hard Blocking & Midnight Crossing
  // =========================================================================
  describe('Challenge 3: Studio Overlap Invariants', () => {
    it('rejects overlapping slots and permits abutting slots', () => {
      const existing: TimeSlot[] = [
        { id: 'session-1', date: '2026-09-07', startTime: '10:00', endTime: '12:00' },
        { id: 'session-2', date: '2026-09-07', startTime: '14:00', endTime: '16:00' },
      ];

      // Case A: Overlaps session-1 tail (11:30 to 13:00)
      const overlapA = checkStudioOverlap(existing, {
        date: '2026-09-07',
        startTime: '11:30',
        endTime: '13:00',
      });
      expect(overlapA.hasOverlap).toBe(true);
      expect(overlapA.conflicts).toHaveLength(1);
      expect(overlapA.conflicts[0].existingSlot.id).toBe('session-1');
      expect(overlapA.conflicts[0].overlapMinutes).toBe(30);

      // Case B: Abutting exactly between 12:00 and 14:00 (S_new == E_exist and E_new == S_exist)
      const abuttingBetween = checkStudioOverlap(existing, {
        date: '2026-09-07',
        startTime: '12:00',
        endTime: '14:00',
      });
      expect(abuttingBetween.hasOverlap).toBe(false);
      expect(abuttingBetween.conflicts).toHaveLength(0);

      // Case C: Abutting before session-1 (08:00 to 10:00)
      const abuttingBefore = checkStudioOverlap(existing, {
        date: '2026-09-07',
        startTime: '08:00',
        endTime: '10:00',
      });
      expect(abuttingBefore.hasOverlap).toBe(false);

      // Case D: Abutting after session-2 (16:00 to 18:00)
      const abuttingAfter = checkStudioOverlap(existing, {
        date: '2026-09-07',
        startTime: '16:00',
        endTime: '18:00',
      });
      expect(abuttingAfter.hasOverlap).toBe(false);
    });

    it('correctly detects overlaps across midnight crossing boundaries', () => {
      // Session starts at 23:00 on Day 1 (2026-09-07) and ends at 02:00 on Day 2 (2026-09-08)
      const lateNightSession: TimeSlot = {
        id: 'midnight-session',
        date: '2026-09-07',
        startTime: '23:00',
        endTime: '02:00',
      };

      const norm = normalizeSlot(lateNightSession);
      expect(norm.durationMinutes).toBe(180);
      expect(norm.startIso).toBe('2026-09-07T23:00:00.000Z');
      expect(norm.endIso).toBe('2026-09-08T02:00:00.000Z');

      const existingBookings = [lateNightSession];

      // Test 1: Proposed session on Day 2 from 01:00 to 03:00 -> Conflicts (01:00 to 02:00)
      const proposedConflict = checkStudioOverlap(existingBookings, {
        date: '2026-09-08',
        startTime: '01:00',
        endTime: '03:00',
      });
      expect(proposedConflict.hasOverlap).toBe(true);
      expect(proposedConflict.conflicts[0].overlapMinutes).toBe(60);

      // Test 2: Proposed session on Day 2 from 02:00 to 04:00 -> Abuts at 02:00, permitted
      const proposedAbutting = checkStudioOverlap(existingBookings, {
        date: '2026-09-08',
        startTime: '02:00',
        endTime: '04:00',
      });
      expect(proposedAbutting.hasOverlap).toBe(false);

      // Test 3: Proposed session on Day 1 from 22:00 to 23:30 -> Conflicts (23:00 to 23:30)
      const proposedDay1Overlap = checkStudioOverlap(existingBookings, {
        date: '2026-09-07',
        startTime: '22:00',
        endTime: '23:30',
      });
      expect(proposedDay1Overlap.hasOverlap).toBe(true);
      expect(proposedDay1Overlap.conflicts[0].overlapMinutes).toBe(30);
    });

    it('repository enforces hard blocking on overlapping bookings and does not corrupt state', async () => {
      const client = await clientRepo.create({ name: 'استوديو ميوزيك' });

      // Create first booking
      const b1 = await bookingRepo.createBooking({
        clientId: client.id,
        date: '2026-09-10',
        plannedStart: '14:00',
        plannedEnd: '16:00',
      });
      expect(b1.id).toBeDefined();

      // Overlapping booking attempt
      await expect(
        bookingRepo.createBooking({
          clientId: client.id,
          date: '2026-09-10',
          plannedStart: '15:00',
          plannedEnd: '17:00',
        })
      ).rejects.toThrow(StudioOverlapConflictError);

      // Confirm only 1 booking exists in database
      const bookings = await bookingRepo.list({ date: '2026-09-10' });
      expect(bookings).toHaveLength(1);
      expect(bookings[0].id).toBe(b1.id);

      // Verify activity log contains BOOKING_CREATED
      const logs = await activityLogRepo.list({ entityId: b1.id });
      expect(logs.some((l) => l.action === 'BOOKING_CREATED')).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 4: Recurring Conflict Preview & Skipping
  // =========================================================================
  describe('Challenge 4: Recurring Conflict Preview & Slot Skipping', () => {
    it('previews recurring series, flags conflicting slots for skipping, and filters commitable slots', () => {
      // Existing booking on Sept 14 from 10:00 to 12:00
      const existingBookings: TimeSlot[] = [
        {
          id: 'existing-sep14',
          date: '2026-09-14',
          startTime: '10:00',
          endTime: '12:00',
        },
      ];

      // Weekly recurring rule on Mondays (dayOfWeek = 1) from 11:00 to 13:00
      // Sept 7 (clean), Sept 14 (conflicts 11:00-12:00), Sept 21 (clean), Sept 28 (clean)
      const rule: RecurringRuleInput = {
        clientId: 'client-rec-1',
        dayOfWeek: 1, // Monday
        startTime: '11:00',
        endTime: '13:00',
        startDate: '2026-09-07',
        endDate: '2026-09-28',
        frequency: 'weekly',
      };

      const preview = previewRecurringSlots(rule, existingBookings);

      expect(preview.totalGenerated).toBe(4);
      expect(preview.totalConflicts).toBe(1);

      // Sept 7
      expect(preview.slots[0].date).toBe('2026-09-07');
      expect(preview.slots[0].hasConflict).toBe(false);
      expect(preview.slots[0].skip).toBe(false);

      // Sept 14 (conflicting slot)
      expect(preview.slots[1].date).toBe('2026-09-14');
      expect(preview.slots[1].hasConflict).toBe(true);
      expect(preview.slots[1].skip).toBe(true); // Flagged for skipping
      expect(preview.slots[1].conflicts).toHaveLength(1);
      expect(preview.slots[1].conflicts[0].existingSlot.id).toBe('existing-sep14');
      expect(preview.slots[1].conflicts[0].overlapMinutes).toBe(60); // 11:00 to 12:00

      // Sept 21 & Sept 28
      expect(preview.slots[2].hasConflict).toBe(false);
      expect(preview.slots[2].skip).toBe(false);
      expect(preview.slots[3].hasConflict).toBe(false);
      expect(preview.slots[3].skip).toBe(false);

      // Filter commitable slots
      const commitable = filterCommitableSlots(preview.slots);
      expect(commitable).toHaveLength(3);
      expect(commitable.map((c) => c.date)).toEqual(['2026-09-07', '2026-09-21', '2026-09-28']);
    });
  });

  // =========================================================================
  // Challenge 5: Payment Voiding, Rollback & Reversion
  // =========================================================================
  describe('Challenge 5: Payment Voiding & Rollback Invariants', () => {
    it('generates a pure payment void plan and verifies rollbacks', () => {
      const plan = planPaymentVoiding(
        'pay-test',
        'active',
        'سبب الإلغاء',
        [{ allocationId: 'a1', paymentId: 'pay-test', targetType: 'marketing_due', targetId: 'm1', amountPiasters: 50000 }],
        [{ targetId: 'm1', targetType: 'marketing_due', baseAmountPiasters: 50000, currentPaidPiasters: 50000 }]
      );

      expect(plan.totalRollbackPiasters).toBe(50000);
      expect(plan.revertedTargets[0].newRemainingPiasters).toBe(50000);
      expect(plan.revertedTargets[0].newStatus).toBe('due');
    });

    it('rolls back multi-target allocations and restores target due balances and statuses', async () => {
      const client = await clientRepo.create({ name: 'مؤسسة الأفق' });

      // Marketing contract: 300,000 piasters (3,000 EGP)
      const contract = await contractRepo.createMarketingContract({
        clientId: client.id,
        monthlyAmount: 300000,
        startDate: '2026-09-01',
      });
      const due = await contractRepo.generateMonthlyDue(contract.id, 2026, 9, '2026-09-05');

      // Payment 1: 100,000 piasters (leaves 200,000 due, status becomes partial)
      const payment1 = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 100000,
        method: 'cash',
        date: '2026-09-06',
        targets: [{ targetType: 'marketing_due', targetId: due.id, duePiasters: 300000 }],
      });

      let dues = await contractRepo.listDuesByContract(contract.id);
      expect(dues[0].status).toBe('partial');

      // Payment 2: 200,000 piasters (pays off due completely, status becomes paid)
      const payment2 = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 200000,
        method: 'bank_transfer',
        date: '2026-09-06',
        targets: [{ targetType: 'marketing_due', targetId: due.id, duePiasters: 200000 }],
      });

      dues = await contractRepo.listDuesByContract(contract.id);
      expect(dues[0].status).toBe('paid');

      // Void Payment 2: should revert status back to 'partial' (paid = 100,000, remaining = 200,000)
      const voidPlan2 = await paymentRepo.voidPayment(payment2.id, 'تم إلغاء التحويل البنكي');
      expect(voidPlan2.paymentId).toBe(payment2.id);
      expect(voidPlan2.totalRollbackPiasters).toBe(200000);

      dues = await contractRepo.listDuesByContract(contract.id);
      expect(dues[0].status).toBe('partial');

      // Void Payment 1: should revert status back to 'due' / 'overdue' (paid = 0, remaining = 300,000)
      const voidPlan1 = await paymentRepo.voidPayment(payment1.id, 'إلغاء إيصال النقدي بالخطأ');
      expect(voidPlan1.paymentId).toBe(payment1.id);
      expect(voidPlan1.totalRollbackPiasters).toBe(100000);

      dues = await contractRepo.listDuesByContract(contract.id);
      expect(dues[0].status).not.toBe('paid');
      expect(dues[0].status).not.toBe('partial');

      // Verify audit logs for voiding
      const logs = await activityLogRepo.list({ entityId: payment1.id });
      expect(logs.some((l) => l.action === 'PAYMENT_VOIDED')).toBe(true);
    });

    it('strictly enforces non-empty void reason and prevents re-voiding an already voided payment', async () => {
      const client = await clientRepo.create({ name: 'سليم حسن' });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 50000,
        method: 'vodafone_cash',
        date: '2026-09-06',
      });

      // Reject empty reason
      await expect(paymentRepo.voidPayment(payment.id, '')).rejects.toThrow(DomainInvariantError);
      await expect(paymentRepo.voidPayment(payment.id, '   ')).rejects.toThrow(DomainInvariantError);

      // Void successfully
      await paymentRepo.voidPayment(payment.id, 'تحويل مكرر');

      // Attempt second voiding
      await expect(paymentRepo.voidPayment(payment.id, 'محاولة إلغاء ثانية')).rejects.toThrow(
        DomainInvariantError
      );
    });

    it('enforces database trigger preventing physical hard DELETE on payments table', async () => {
      const client = await clientRepo.create({ name: 'جمال توفيق' });
      const payment = await paymentRepo.recordPayment({
        clientId: client.id,
        amount: 75000,
        method: 'cash',
        date: '2026-09-06',
      });

      // Physical DELETE must be blocked by SQLite trigger trg_prevent_payment_delete
      await expect(
        driver.execute(`DELETE FROM payments WHERE id = ?;`, [payment.id])
      ).rejects.toThrow(/Direct physical deletion of payments is prohibited/);

      // Verify row still exists intact
      const fetched = await paymentRepo.getById(payment.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(payment.id);
    });
  });
});
