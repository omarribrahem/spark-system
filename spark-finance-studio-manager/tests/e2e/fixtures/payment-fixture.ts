import { IDatabaseDriver } from '../harness/test-database';

export interface AllocationTarget {
  targetType: 'marketing_due' | 'subscription_due' | 'website_project' | 'client_package' | 'studio_booking' | 'custom';
  targetId: string;
  amountPiasters: number;
}

export interface PaymentData {
  id?: string;
  clientId: string;
  amountPiasters: number;
  paymentDate: string;
  paymentMethod: 'cash' | 'vodafone_cash' | 'bank' | 'instapay';
  allocations: AllocationTarget[];
  notes?: string;
}

export class PaymentFixture {
  constructor(private driver: IDatabaseDriver) {}

  public async recordPayment(data: PaymentData): Promise<{
    paymentId: string;
    unallocatedCreditPiasters: number;
  }> {
    if (data.amountPiasters <= 0) {
      throw new Error('Payment amount must be greater than zero piasters');
    }

    const totalAllocated = data.allocations.reduce((acc, curr) => acc + curr.amountPiasters, 0);

    // Strict validation rule BR-021: Allocations cannot exceed payment amount
    if (totalAllocated > data.amountPiasters) {
      throw new Error('مجموع التخصيصات يتجاوز قيمة الدفعة');
    }

    const unallocatedCreditPiasters = data.amountPiasters - totalAllocated;
    const paymentId = data.id || `pay_${Math.random().toString(36).substring(2, 9)}`;

    return await this.driver.transaction(async (tx) => {
      // 1. Insert payment
      await tx.execute(
        `INSERT INTO payments (id, client_id, amount, payment_date, payment_method, status, notes)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [paymentId, data.clientId, data.amountPiasters, data.paymentDate, data.paymentMethod, data.notes || null]
      );

      // 2. Insert allocations and update target balances
      for (const alloc of data.allocations) {
        const allocId = `alloc_${Math.random().toString(36).substring(2, 9)}`;
        await tx.execute(
          `INSERT INTO payment_allocations (id, payment_id, target_type, target_id, allocated_amount)
           VALUES (?, ?, ?, ?, ?)`,
          [allocId, paymentId, alloc.targetType, alloc.targetId, alloc.amountPiasters]
        );

        // Update target entity based on type
        if (alloc.targetType === 'marketing_due') {
          const dues = await tx.query<{ total_amount: number; paid_amount: number }>(
            'SELECT total_amount, paid_amount FROM marketing_contract_dues WHERE id = ?',
            [alloc.targetId]
          );
          if (dues.length > 0) {
            const newPaid = dues[0].paid_amount + alloc.amountPiasters;
            const newStatus = newPaid >= dues[0].total_amount ? 'paid' : 'partial';
            await tx.execute(
              'UPDATE marketing_contract_dues SET paid_amount = ?, status = ? WHERE id = ?',
              [newPaid, newStatus, alloc.targetId]
            );
          }
        } else if (alloc.targetType === 'client_package') {
          const pkgs = await tx.query<{ sold_price: number; paid_amount: number }>(
            'SELECT sold_price, paid_amount FROM client_packages WHERE id = ?',
            [alloc.targetId]
          );
          if (pkgs.length > 0) {
            const newPaid = pkgs[0].paid_amount + alloc.amountPiasters;
            await tx.execute('UPDATE client_packages SET paid_amount = ? WHERE id = ?', [newPaid, alloc.targetId]);
          }
        } else if (alloc.targetType === 'website_project') {
          const sites = await tx.query<{ total_price: number; paid_amount: number }>(
            'SELECT total_price, paid_amount FROM website_projects WHERE id = ?',
            [alloc.targetId]
          );
          if (sites.length > 0) {
            const newPaid = sites[0].paid_amount + alloc.amountPiasters;
            await tx.execute('UPDATE website_projects SET paid_amount = ? WHERE id = ?', [newPaid, alloc.targetId]);
          }
        }
      }

      // 3. Deposit surplus credit if any
      if (unallocatedCreditPiasters > 0) {
        const creditId = `credit_${Math.random().toString(36).substring(2, 9)}`;
        await tx.execute(
          `INSERT INTO client_credits (id, client_id, amount, source_payment_id, notes)
           VALUES (?, ?, ?, ?, 'Surplus payment credit')`,
          [creditId, data.clientId, unallocatedCreditPiasters, paymentId]
        );
      }

      return { paymentId, unallocatedCreditPiasters };
    });
  }

  public async voidPayment(paymentId: string, voidReason: string): Promise<void> {
    if (!voidReason || voidReason.trim() === '') {
      throw new Error('Mandatory void reason required');
    }

    await this.driver.transaction(async (tx) => {
      const pays = await tx.query<{ id: string; client_id: string; amount: number; status: string }>(
        'SELECT id, client_id, amount, status FROM payments WHERE id = ?',
        [paymentId]
      );
      if (pays.length === 0) throw new Error('Payment not found');
      if (pays[0].status === 'void') throw new Error('Payment already voided');

      // 1. Mark payment as void
      await tx.execute(
        "UPDATE payments SET status = 'void', void_reason = ?, voided_at = datetime('now') WHERE id = ?",
        [voidReason, paymentId]
      );

      // 2. Roll back allocations from targets
      const allocations = await tx.query<{ target_type: string; target_id: string; allocated_amount: number }>(
        'SELECT target_type, target_id, allocated_amount FROM payment_allocations WHERE payment_id = ?',
        [paymentId]
      );

      for (const alloc of allocations) {
        if (alloc.target_type === 'marketing_due') {
          const dues = await tx.query<{ total_amount: number; paid_amount: number }>(
            'SELECT total_amount, paid_amount FROM marketing_contract_dues WHERE id = ?',
            [alloc.target_id]
          );
          if (dues.length > 0) {
            const newPaid = Math.max(0, dues[0].paid_amount - alloc.allocated_amount);
            const newStatus = newPaid === 0 ? 'due' : 'partial';
            await tx.execute(
              'UPDATE marketing_contract_dues SET paid_amount = ?, status = ? WHERE id = ?',
              [newPaid, newStatus, alloc.target_id]
            );
          }
        }
      }

      // 3. Remove client credit generated by this payment
      await tx.execute('DELETE FROM client_credits WHERE source_payment_id = ?', [paymentId]);

      // 4. Log to ActivityLog
      const logId = `log_${Math.random().toString(36).substring(2, 9)}`;
      await tx.execute(
        `INSERT INTO activity_log (id, action, entity_type, entity_id, notes)
         VALUES (?, 'PAYMENT_VOIDED', 'payment', ?, ?)`,
        [logId, paymentId, voidReason]
      );
    });
  }
}
