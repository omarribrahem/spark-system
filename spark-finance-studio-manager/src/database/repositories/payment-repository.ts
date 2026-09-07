/**
 * PaymentRepository: Atomic Financial Inflow Persistence, Multi-Target Allocation,
 * Surplus Credit Ledger, and Payment Voiding with Audit Trail.
 */

import { IDatabaseDriver } from '../driver/types';
import {
  PaymentMethod,
  PaymentStatus,
  TargetDue,
  TargetObligationType,
} from '../../domain/models/financial';
import { calculateAllocation } from '../../domain/calculators/payment-allocator';
import {
  planPaymentVoiding,
  AllocationToRollback,
  TargetDueStateBeforeRollback,
  PaymentVoidPlan,
} from '../../domain/calculators/payment-voiding';
import {
  assertIntegerPiasters,
  assertNonEmptyString,
  assertValidDateString,
  DomainInvariantError,
} from '../../domain/rules/invariants';
import { inferMimeType } from './attachment-repository';

export interface PaymentRecord {
  id: string;
  client_id: string;
  amount: number; // integer piasters
  method: PaymentMethod;
  date: string; // 'YYYY-MM-DD'
  note: string | null;
  receipt_attachment_id: string | null;
  receipt_path?: string | null;
  receiptPath?: string | null;
  status: PaymentStatus;
  void_reason: string | null;
  created_at: string;
}

export interface PaymentAllocationRecord {
  id: string;
  payment_id: string;
  target_type: TargetObligationType;
  target_id: string;
  amount: number;
  created_at: string;
}

export interface PaymentWithAllocations extends PaymentRecord {
  allocations: PaymentAllocationRecord[];
  unallocatedCreditPiasters: number;
}

export interface RecordPaymentInput {
  id?: string;
  clientId: string;
  amount: number; // integer piasters
  method: PaymentMethod;
  date: string; // 'YYYY-MM-DD'
  note?: string | null;
  receiptAttachmentId?: string | null;
  receiptPath?: string | null;
  autoFillRemaining?: boolean;
  targets?: TargetDue[];
}

export interface PaymentFilter {
  clientId?: string;
  status?: PaymentStatus;
  method?: PaymentMethod;
  startDate?: string;
  endDate?: string;
}

export class PaymentRepository {
  constructor(private driver: IDatabaseDriver) {}

  /**
   * Records a payment atomically:
   * 1. Inserts payment record.
   * 2. Evaluates allocation across targets (without over-allocation).
   * 3. Inserts payment_allocations.
   * 4. Updates statuses of target obligations.
   * 5. Records PAYMENT_CREATED in activity_log.
   */
  public async recordPayment(input: RecordPaymentInput): Promise<PaymentWithAllocations> {
    const paymentId = input.id ?? crypto.randomUUID();
    const clientId = assertNonEmptyString(input.clientId, 'clientId');
    assertIntegerPiasters(input.amount, 'amount');
    assertValidDateString(input.date, 'date');
    assertNonEmptyString(input.method, 'method');

    const now = new Date().toISOString();
    const targets = input.targets ?? [];

    return await this.driver.transaction(async (tx) => {
      // 0. Handle Receipt Attachment
      let linkedAttachmentId: string | null = null;
      let finalReceiptPath: string | null = null;
      const receiptVal = (input.receiptAttachmentId ?? input.receiptPath)?.trim();

      if (receiptVal) {
        const existing = await tx.query<{ id: string; file_path: string }>(
          `SELECT id, file_path FROM attachments WHERE id = ? LIMIT 1;`,
          [receiptVal]
        );

        if (existing.length > 0) {
          linkedAttachmentId = existing[0].id;
          finalReceiptPath = existing[0].file_path;
        } else {
          // File path provided: generate attachment record
          const attachmentId = crypto.randomUUID();
          const fileName = receiptVal.split(/[/\\]/).pop() || 'receipt';
          const mimeType = inferMimeType(receiptVal);
          await tx.execute(
            `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_path, file_size, mime_type, sha256, created_at)
             VALUES (?, 'payment', ?, ?, ?, 0, ?, '', ?);`,
            [attachmentId, paymentId, fileName, receiptVal, mimeType, now]
          );
          linkedAttachmentId = attachmentId;
          finalReceiptPath = receiptVal;
        }
      }

      // 1. Insert Payment
      await tx.execute(
        `INSERT INTO payments (id, client_id, amount, method, date, note, receipt_attachment_id, status, void_reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?);`,
        [
          paymentId,
          clientId,
          input.amount,
          input.method,
          input.date,
          input.note ?? null,
          linkedAttachmentId,
          now,
        ]
      );

      // 2. Calculate Allocations
      const autoFill = input.autoFillRemaining ?? true;
      const allocationResult = calculateAllocation(input.amount, targets, {
        autoFillRemaining: autoFill,
      });
      const insertedAllocations: PaymentAllocationRecord[] = [];

      for (const alloc of allocationResult.allocations) {
        if (alloc.allocatedPiasters <= 0) continue;

        const allocId = crypto.randomUUID();
        await tx.execute(
          `INSERT INTO payment_allocations (id, payment_id, target_type, target_id, amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?);`,
          [allocId, paymentId, alloc.targetType, alloc.targetId, alloc.allocatedPiasters, now]
        );

        insertedAllocations.push({
          id: allocId,
          payment_id: paymentId,
          target_type: alloc.targetType,
          target_id: alloc.targetId,
          amount: alloc.allocatedPiasters,
          created_at: now,
        });

        // 3. Update target due status if applicable
        await this.syncTargetDueStatus(tx, alloc.targetType, alloc.targetId);
      }

      // 4. Audit Log
      await tx.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
         VALUES (?, 'PAYMENT_CREATED', 'payment', ?, ?, ?, ?);`,
        [
          crypto.randomUUID(),
          paymentId,
          now,
          input.note ?? `Payment received via ${input.method}`,
          JSON.stringify({
            amount: input.amount,
            method: input.method,
            allocatedPiasters: allocationResult.totalAllocatedPiasters,
            unallocatedCreditPiasters: allocationResult.unallocatedCreditPiasters,
            allocationsCount: insertedAllocations.length,
          }),
        ]
      );

      return {
        id: paymentId,
        client_id: clientId,
        amount: input.amount,
        method: input.method,
        date: input.date,
        note: input.note ?? null,
        receipt_attachment_id: linkedAttachmentId,
        receipt_path: finalReceiptPath,
        receiptPath: finalReceiptPath,
        status: 'active',
        void_reason: null,
        created_at: now,
        allocations: insertedAllocations,
        unallocatedCreditPiasters: allocationResult.unallocatedCreditPiasters,
      };
    });
  }

  /**
   * Soft-cancels a payment with mandatory reason:
   * 1. Updates payment status to 'void' and sets void_reason.
   * 2. Recalculates and reverts affected target obligation statuses.
   * 3. Logs PAYMENT_VOIDED in activity_log.
   */
  public async voidPayment(paymentId: string, voidReason: string): Promise<PaymentVoidPlan> {
    assertNonEmptyString(paymentId, 'paymentId');
    const sanitizedReason = assertNonEmptyString(voidReason, 'voidReason');

    return await this.driver.transaction(async (tx) => {
      const paymentRows = await tx.query<PaymentRecord>(
        `SELECT id, client_id, amount, method, date, note, receipt_attachment_id, status, void_reason, created_at
         FROM payments WHERE id = ? LIMIT 1;`,
        [paymentId]
      );

      if (paymentRows.length === 0) {
        throw new Error(`Payment with id ${paymentId} not found`);
      }

      const payment = paymentRows[0];
      if (payment.status === 'void') {
        throw new DomainInvariantError(`Payment ${paymentId} is already voided`);
      }

      const allocations = await tx.query<PaymentAllocationRecord>(
        `SELECT id, payment_id, target_type, target_id, amount, created_at
         FROM payment_allocations WHERE payment_id = ?;`,
        [paymentId]
      );

      const rollbackAllocations: AllocationToRollback[] = allocations.map((a) => ({
        allocationId: a.id,
        paymentId: a.payment_id,
        targetType: a.target_type,
        targetId: a.target_id,
        amountPiasters: a.amount,
      }));

      // Gather current state of target dues before voiding
      const targetStates: TargetDueStateBeforeRollback[] = [];
      for (const a of allocations) {
        if (a.target_type === 'marketing_due') {
          const dueRows = await tx.query<{ id: string; base_amount: number; due_date: string }>(
            `SELECT id, base_amount, due_date FROM marketing_monthly_dues WHERE id = ?;`,
            [a.target_id]
          );
          if (dueRows.length > 0) {
            const due = dueRows[0];
            const allocSum = await tx.query<{ total: number }>(
              `SELECT COALESCE(SUM(pa.amount), 0) AS total
               FROM payment_allocations pa
               JOIN payments p ON pa.payment_id = p.id
               WHERE pa.target_type = 'marketing_due' AND pa.target_id = ? AND p.status = 'active';`,
              [a.target_id]
            );
            targetStates.push({
              targetId: a.target_id,
              targetType: a.target_type,
              baseAmountPiasters: due.base_amount,
              currentPaidPiasters: allocSum[0]?.total ?? 0,
              dueDate: due.due_date,
            });
          }
        }
      }

      const voidPlan = planPaymentVoiding(
        paymentId,
        payment.status,
        sanitizedReason,
        rollbackAllocations,
        targetStates
      );

      // Execute soft-cancellation
      await tx.execute(
        `UPDATE payments SET status = 'void', void_reason = ? WHERE id = ?;`,
        [sanitizedReason, paymentId]
      );

      // Update target obligation statuses after payment is marked void
      for (const a of allocations) {
        await this.syncTargetDueStatus(tx, a.target_type, a.target_id);
      }

      // Record Activity Log
      const now = new Date().toISOString();
      await tx.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, timestamp, note, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          crypto.randomUUID(),
          voidPlan.auditLogPayload.action,
          voidPlan.auditLogPayload.entityType,
          voidPlan.auditLogPayload.entityId,
          now,
          voidPlan.auditLogPayload.note,
          JSON.stringify(voidPlan.auditLogPayload.payload),
        ]
      );

      return voidPlan;
    });
  }

  public async getById(paymentId: string): Promise<PaymentWithAllocations | null> {
    const rows = await this.driver.query<
      PaymentRecord & { receipt_path: string | null }
    >(
      `SELECT payments.id, payments.client_id, payments.amount, payments.method, payments.date,
              payments.note, payments.receipt_attachment_id, attachments.file_path AS receipt_path,
              payments.status, payments.void_reason, payments.created_at
       FROM payments
       LEFT JOIN attachments ON payments.receipt_attachment_id = attachments.id
       WHERE payments.id = ? LIMIT 1;`,
      [paymentId]
    );

    if (rows.length === 0) return null;
    const payment = rows[0];

    const allocations = await this.driver.query<PaymentAllocationRecord>(
      `SELECT id, payment_id, target_type, target_id, amount, created_at
       FROM payment_allocations WHERE payment_id = ? ORDER BY created_at ASC;`,
      [paymentId]
    );

    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    const unallocatedCreditPiasters =
      payment.status === 'active' ? Math.max(0, payment.amount - totalAllocated) : 0;

    return {
      ...payment,
      receipt_path: payment.receipt_path ?? null,
      receiptPath: payment.receipt_path ?? null,
      allocations,
      unallocatedCreditPiasters,
    };
  }

  public async list(filter?: PaymentFilter): Promise<PaymentRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.clientId) {
      conditions.push('payments.client_id = ?');
      params.push(filter.clientId);
    }
    if (filter?.status) {
      conditions.push('payments.status = ?');
      params.push(filter.status);
    }
    if (filter?.method) {
      conditions.push('payments.method = ?');
      params.push(filter.method);
    }
    if (filter?.startDate) {
      conditions.push('payments.date >= ?');
      params.push(filter.startDate);
    }
    if (filter?.endDate) {
      conditions.push('payments.date <= ?');
      params.push(filter.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.driver.query<{
      id: string;
      client_id: string;
      amount: number;
      method: PaymentMethod;
      date: string;
      note: string | null;
      receipt_attachment_id: string | null;
      receipt_path: string | null;
      status: PaymentStatus;
      void_reason: string | null;
      created_at: string;
    }>(
      `SELECT payments.id, payments.client_id, payments.amount, payments.method, payments.date,
              payments.note, payments.receipt_attachment_id, attachments.file_path AS receipt_path,
              payments.status, payments.void_reason, payments.created_at
       FROM payments
       LEFT JOIN attachments ON payments.receipt_attachment_id = attachments.id
       ${whereClause}
       ORDER BY payments.date DESC, payments.created_at DESC;`,
      params
    );

    return rows.map((r) => ({
      ...r,
      receiptPath: r.receipt_path ?? null,
    }));
  }

  public async listByClient(clientId: string): Promise<PaymentRecord[]> {
    return this.list({ clientId });
  }

  /**
   * Computes client's total unallocated credit piasters.
   * Formula: Total active payments received from client - Total active allocations attributed to client.
   */
  public async getClientCreditPiasters(clientId: string): Promise<number> {
    const totalPaymentsRow = await this.driver.query<{ total: number }>(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM payments
       WHERE client_id = ? AND status = 'active';`,
      [clientId]
    );

    const totalAllocatedRow = await this.driver.query<{ total: number }>(
      `SELECT COALESCE(SUM(pa.amount), 0) AS total
       FROM payment_allocations pa
       JOIN payments p ON pa.payment_id = p.id
       WHERE p.client_id = ? AND p.status = 'active';`,
      [clientId]
    );

    const totalPayments = totalPaymentsRow[0]?.total ?? 0;
    const totalAllocated = totalAllocatedRow[0]?.total ?? 0;

    return Math.max(0, totalPayments - totalAllocated);
  }

  /**
   * Synchronizes the status of a target obligation (marketing_due, subscription_due, etc.)
   * based on active allocations.
   */
  private async syncTargetDueStatus(
    driver: IDatabaseDriver,
    targetType: TargetObligationType,
    targetId: string
  ): Promise<void> {
    if (targetType === 'marketing_due') {
      const dueRows = await driver.query<{ id: string; base_amount: number; due_date: string }>(
        `SELECT id, base_amount, due_date FROM marketing_monthly_dues WHERE id = ? LIMIT 1;`,
        [targetId]
      );
      if (dueRows.length === 0) return;

      const due = dueRows[0];
      const allocRows = await driver.query<{ total: number }>(
        `SELECT COALESCE(SUM(pa.amount), 0) AS total
         FROM payment_allocations pa
         JOIN payments p ON pa.payment_id = p.id
         WHERE pa.target_type = 'marketing_due' AND pa.target_id = ? AND p.status = 'active';`,
        [targetId]
      );

      const paidPiasters = allocRows[0]?.total ?? 0;
      const today = new Date().toISOString().split('T')[0];

      let newStatus = 'due';
      if (paidPiasters >= due.base_amount) {
        newStatus = 'paid';
      } else if (paidPiasters > 0) {
        newStatus = 'partial';
      } else if (today > due.due_date) {
        newStatus = 'overdue';
      } else if (today < due.due_date) {
        newStatus = 'upcoming';
      } else {
        newStatus = 'due';
      }

      await driver.execute(
        `UPDATE marketing_monthly_dues SET status = ? WHERE id = ?;`,
        [newStatus, targetId]
      );
    }
  }
}
