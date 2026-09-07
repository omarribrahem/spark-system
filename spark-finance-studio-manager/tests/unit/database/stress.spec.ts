import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import {
  piastersToEgp,
  egpToPiasters,
  formatPiasters,
  minutesToDecimalHours,
  hoursToMinutes,
} from '../../../src/shared/formatters';

describe('Milestone M1 Adversarial Stress Suite', () => {
  let driver: WasmSqlDriver;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);
  });

  afterEach(async () => {
    await driver.close();
  });

  describe('1. Recursive Triggers under PRAGMA recursive_triggers = ON;', () => {
    it('enables PRAGMA recursive_triggers = ON without recursion loop errors on client update', async () => {
      // Explicitly turn on recursive triggers
      await driver.execute('PRAGMA recursive_triggers = ON;');

      const pragmaRes = await driver.query<{ recursive_triggers: number }>(
        'PRAGMA recursive_triggers;'
      );
      expect(pragmaRes[0].recursive_triggers).toBe(1);

      const clientId = 'c-stress-1';
      const initialTime = '2026-01-01T12:00:00.000Z';
      await driver.execute(
        `INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`,
        [clientId, 'شركة الصقر للإنتاج', initialTime, initialTime]
      );

      // Perform update without touching updated_at
      // With recursive_triggers = ON, the trigger's internal UPDATE on clients MUST NOT loop
      await driver.execute(
        `UPDATE clients SET name = ? WHERE id = ?;`,
        ['شركة الصقر للإنتاج الفني المحدودة', clientId]
      );

      const rows = await driver.query<{ name: string; updated_at: string }>(
        `SELECT name, updated_at FROM clients WHERE id = ?;`,
        [clientId]
      );

      expect(rows[0].name).toBe('شركة الصقر للإنتاج الفني المحدودة');
      expect(rows[0].updated_at).not.toBe(initialTime);

      // Verify 50 consecutive updates succeed without triggering SQLite recursion limit
      for (let i = 1; i <= 50; i++) {
        await driver.execute(
          `UPDATE clients SET notes = ? WHERE id = ?;`,
          [`ملاحظة رقم ${i}`, clientId]
        );
      }

      const finalRows = await driver.query<{ notes: string }>(
        `SELECT notes FROM clients WHERE id = ?;`,
        [clientId]
      );
      expect(finalRows[0].notes).toBe('ملاحظة رقم 50');
    });

    it('verifies all 8 updated_at triggers function correctly under recursive_triggers = ON', async () => {
      await driver.execute('PRAGMA recursive_triggers = ON;');

      const now = new Date().toISOString();
      const pastTime = '2026-01-01T00:00:00.000Z';

      // 1. Setup parent client & service
      await driver.execute(
        `INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`,
        ['c-multi', 'عميل شامل', pastTime, pastTime]
      );
      await driver.execute(
        `INSERT INTO service_definitions (id, name, billing_model, created_at) VALUES (?, ?, ?, ?);`,
        ['s-srv', 'خدمة تسويق', 'monthly', now]
      );

      // 2. marketing_contracts trigger
      await driver.execute(
        `INSERT INTO marketing_contracts (id, client_id, monthly_amount, start_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        ['mc-1', 'c-multi', 500000, '2026-01-01', 'active', pastTime, pastTime]
      );
      await driver.execute(`UPDATE marketing_contracts SET monthly_amount = 600000 WHERE id = 'mc-1';`);
      const mc = await driver.query<{ updated_at: string }>(`SELECT updated_at FROM marketing_contracts WHERE id = 'mc-1';`);
      expect(mc[0].updated_at).not.toBe(pastTime);

      // 3. marketing_monthly_dues trigger
      await driver.execute(
        `INSERT INTO marketing_monthly_dues (id, contract_id, year, month, base_amount, due_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        ['md-1', 'mc-1', 2026, 1, 600000, '2026-01-05', 'upcoming', pastTime, pastTime]
      );
      await driver.execute(`UPDATE marketing_monthly_dues SET status = 'due' WHERE id = 'md-1';`);
      const md = await driver.query<{ updated_at: string }>(`SELECT updated_at FROM marketing_monthly_dues WHERE id = 'md-1';`);
      expect(md[0].updated_at).not.toBe(pastTime);

      // 4. subscriptions trigger
      await driver.execute(
        `INSERT INTO subscriptions (id, client_id, service_id, monthly_amount, start_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        ['sub-1', 'c-multi', 's-srv', 300000, '2026-01-01', 'active', pastTime, pastTime]
      );
      await driver.execute(`UPDATE subscriptions SET monthly_amount = 350000 WHERE id = 'sub-1';`);
      const sub = await driver.query<{ updated_at: string }>(`SELECT updated_at FROM subscriptions WHERE id = 'sub-1';`);
      expect(sub[0].updated_at).not.toBe(pastTime);

      // 5. subscription_monthly_dues trigger
      await driver.execute(
        `INSERT INTO subscription_monthly_dues (id, subscription_id, year, month, base_amount, due_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        ['sd-1', 'sub-1', 2026, 1, 350000, '2026-01-05', 'upcoming', pastTime, pastTime]
      );
      await driver.execute(`UPDATE subscription_monthly_dues SET status = 'paid' WHERE id = 'sd-1';`);
      const sd = await driver.query<{ updated_at: string }>(`SELECT updated_at FROM subscription_monthly_dues WHERE id = 'sd-1';`);
      expect(sd[0].updated_at).not.toBe(pastTime);

      // 6. website_projects trigger
      await driver.execute(
        `INSERT INTO website_projects (id, client_id, name, total_price, start_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        ['wp-1', 'c-multi', 'موقع تجارة', 1500000, '2026-01-01', 'new', pastTime, pastTime]
      );
      await driver.execute(`UPDATE website_projects SET status = 'in_progress' WHERE id = 'wp-1';`);
      const wp = await driver.query<{ updated_at: string }>(`SELECT updated_at FROM website_projects WHERE id = 'wp-1';`);
      expect(wp[0].updated_at).not.toBe(pastTime);

      // 7. client_packages trigger
      await driver.execute(
        `INSERT INTO client_packages (id, client_id, name_snapshot, sold_price, purchased_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        ['cp-1', 'c-multi', 'باقة 10 ساعات', 200000, '2026-01-01', 'active', pastTime, pastTime]
      );
      await driver.execute(`UPDATE client_packages SET status = 'fully_used' WHERE id = 'cp-1';`);
      const cp = await driver.query<{ updated_at: string }>(`SELECT updated_at FROM client_packages WHERE id = 'cp-1';`);
      expect(cp[0].updated_at).not.toBe(pastTime);

      // 8. studio_bookings trigger
      await driver.execute(
        `INSERT INTO studio_bookings (id, client_id, date, planned_start, planned_end, planned_minutes, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        ['sb-1', 'c-multi', '2026-01-10', '10:00', '12:00', 120, 'scheduled', pastTime, pastTime]
      );
      await driver.execute(`UPDATE studio_bookings SET status = 'completed' WHERE id = 'sb-1';`);
      const sb = await driver.query<{ updated_at: string }>(`SELECT updated_at FROM studio_bookings WHERE id = 'sb-1';`);
      expect(sb[0].updated_at).not.toBe(pastTime);

      // 9. reel_items trigger
      await driver.execute(
        `INSERT INTO reel_items (id, client_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?);`,
        ['ri-1', 'c-multi', 'available', pastTime, pastTime]
      );
      await driver.execute(`UPDATE reel_items SET status = 'filmed' WHERE id = 'ri-1';`);
      const ri = await driver.query<{ updated_at: string }>(`SELECT updated_at FROM reel_items WHERE id = 'ri-1';`);
      expect(ri[0].updated_at).not.toBe(pastTime);
    });

    it('does not overwrite updated_at when it is explicitly provided by the caller', async () => {
      await driver.execute('PRAGMA recursive_triggers = ON;');

      const clientId = 'c-explicit-time';
      const initialTime = '2026-01-01T00:00:00.000Z';
      const targetTime = '2026-06-15T18:30:00.000Z';

      await driver.execute(
        `INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`,
        [clientId, 'عميل توقيت مخصص', initialTime, initialTime]
      );

      // Explicitly pass updated_at in the UPDATE query
      await driver.execute(
        `UPDATE clients SET name = ?, updated_at = ? WHERE id = ?;`,
        ['عميل توقيت معدل', targetTime, clientId]
      );

      const rows = await driver.query<{ name: string; updated_at: string }>(
        `SELECT name, updated_at FROM clients WHERE id = ?;`,
        [clientId]
      );

      // The trigger should NOT fire because OLD.updated_at != NEW.updated_at
      expect(rows[0].updated_at).toBe(targetTime);
    });
  });

  describe('2. Payment Deletion Prevention Trigger', () => {
    it('blocks physical DELETE FROM payments with exact exception message', async () => {
      const clientId = 'c-pay-guard';
      const now = new Date().toISOString();
      await driver.execute(
        `INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`,
        [clientId, 'عميل أمان الدفع', now, now]
      );

      const paymentId = 'pay-secure-01';
      await driver.execute(
        `INSERT INTO payments (id, client_id, amount, method, date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [paymentId, clientId, 250000, 'bank_transfer', '2026-09-06', 'active', now]
      );

      // Attempt DELETE by ID
      await expect(
        driver.execute(`DELETE FROM payments WHERE id = ?;`, [paymentId])
      ).rejects.toThrow('Direct physical deletion of payments is prohibited. Use payment voiding.');

      // Attempt blanket DELETE
      await expect(
        driver.execute(`DELETE FROM payments;`)
      ).rejects.toThrow('Direct physical deletion of payments is prohibited. Use payment voiding.');

      // Confirm payment row is intact
      const rows = await driver.query<{ id: string; status: string }>(
        `SELECT id, status FROM payments WHERE id = ?;`,
        [paymentId]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].status).toBe('active');
    });

    it('allows voiding payments via status update and reason prompt', async () => {
      const clientId = 'c-pay-void';
      const now = new Date().toISOString();
      await driver.execute(
        `INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`,
        [clientId, 'عميل إلغاء الدفع', now, now]
      );

      const paymentId = 'pay-to-void';
      await driver.execute(
        `INSERT INTO payments (id, client_id, amount, method, date, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [paymentId, clientId, 100000, 'cash', '2026-09-06', 'active', now]
      );

      // Void the payment
      const voidReason = 'تم تسجيل المبلغ بالخطأ من العميل';
      await driver.execute(
        `UPDATE payments SET status = 'void', void_reason = ? WHERE id = ?;`,
        [voidReason, paymentId]
      );

      const rows = await driver.query<{ status: string; void_reason: string }>(
        `SELECT status, void_reason FROM payments WHERE id = ?;`,
        [paymentId]
      );
      expect(rows[0].status).toBe('void');
      expect(rows[0].void_reason).toBe(voidReason);
    });
  });

  describe('3. Foreign Key Integrity Constraints', () => {
    it('strictly enforces PRAGMA foreign_keys = ON on invalid inserts', async () => {
      const fkRes = await driver.query<{ foreign_keys: number }>('PRAGMA foreign_keys;');
      expect(fkRes[0].foreign_keys).toBe(1);

      const now = new Date().toISOString();

      // Test invalid foreign key on marketing_contracts
      await expect(
        driver.execute(
          `INSERT INTO marketing_contracts (id, client_id, monthly_amount, start_date, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          ['mc-fk', 'ghost-client', 50000, '2026-01-01', 'active', now, now]
        )
      ).rejects.toThrow(/foreign key/i);

      // Test invalid foreign key on studio_bookings
      await expect(
        driver.execute(
          `INSERT INTO studio_bookings (id, client_id, date, planned_start, planned_end, planned_minutes, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          ['sb-fk', 'ghost-client', '2026-01-01', '10:00', '11:00', 60, 'scheduled', now, now]
        )
      ).rejects.toThrow(/foreign key/i);

      // Test invalid foreign key on payments
      await expect(
        driver.execute(
          `INSERT INTO payments (id, client_id, amount, method, date, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?);`,
          ['pay-fk', 'ghost-client', 10000, 'cash', '2026-01-01', 'active', now]
        )
      ).rejects.toThrow(/foreign key/i);

      // Test invalid foreign key on payment_allocations
      await expect(
        driver.execute(
          `INSERT INTO payment_allocations (id, payment_id, target_type, target_id, amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?);`,
          ['pa-fk', 'ghost-payment', 'marketing_due', 'ghost-due', 5000, now]
        )
      ).rejects.toThrow(/foreign key/i);
    });

    it('enforces RESTRICT delete rules on clients with active dependencies', async () => {
      const clientId = 'c-restricted';
      const now = new Date().toISOString();

      await driver.execute(
        `INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`,
        [clientId, 'عميل ذو عقود جارية', now, now]
      );

      await driver.execute(
        `INSERT INTO marketing_contracts (id, client_id, monthly_amount, start_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        ['mc-bound', clientId, 100000, '2026-01-01', 'active', now, now]
      );

      // Attempting to delete client must be blocked by RESTRICT constraint
      await expect(
        driver.execute(`DELETE FROM clients WHERE id = ?;`, [clientId])
      ).rejects.toThrow(/foreign key/i);
    });

    it('properly cascades deletes for package template items and client package items', async () => {
      const templateId = 'tmpl-cascade-test';
      const now = new Date().toISOString();

      await driver.execute(
        `INSERT INTO package_templates (id, name, default_price, active, created_at)
         VALUES (?, ?, ?, ?, ?);`,
        [templateId, 'باقة تجريبية للحذف التتابعي', 500000, 1, now]
      );

      await driver.execute(
        `INSERT INTO package_template_items (id, package_template_id, unit, quantity)
         VALUES (?, ?, ?, ?), (?, ?, ?, ?);`,
        ['ti-1', templateId, 'hours', 600, 'ti-2', templateId, 'reels', 5]
      );

      // Delete the template
      await driver.execute(`DELETE FROM package_templates WHERE id = ?;`, [templateId]);

      // Items should have cascaded
      const items = await driver.query<{ id: string }>(
        `SELECT id FROM package_template_items WHERE package_template_id = ?;`,
        [templateId]
      );
      expect(items.length).toBe(0);
    });
  });

  describe('4. Financial Piasters & Minutes Math Precision', () => {
    it('demonstrates that integer piasters avoids IEEE 754 floating-point drift over 10,000 increments', () => {
      // Float accumulator simulation: adding 0.10 EGP 10,000 times
      let floatEgpAcc = 0;
      for (let i = 0; i < 10000; i++) {
        floatEgpAcc += 0.10;
      }
      // In floating point, this suffers precision drift:
      expect(floatEgpAcc).not.toBe(1000.0);
      // The exact drift direction is JavaScript-engine dependent; only the
      // mismatch with the mathematically exact total is contractual here.

      // Integer piasters accumulator: adding 10 piasters 10,000 times
      let integerPiastersAcc = 0;
      for (let i = 0; i < 10000; i++) {
        integerPiastersAcc += 10;
      }
      // Exact integer result:
      expect(integerPiastersAcc).toBe(100000);
      expect(piastersToEgp(integerPiastersAcc)).toBe(1000);
      expect(formatPiasters(integerPiastersAcc)).toBe('1,000 ج.م');
    });

    it('demonstrates that integer minutes avoids decimal fractional hour drift', () => {
      // Adding 45 minutes (0.75h) and 90 minutes (1.5h) over 1,000 sessions
      let integerMinutesAcc = 0;
      for (let i = 0; i < 1000; i++) {
        integerMinutesAcc += 90; // 1.5 hours
      }
      expect(integerMinutesAcc).toBe(90000);
      expect(minutesToDecimalHours(integerMinutesAcc)).toBe(1500);

      // Third-hour precision: 20 minutes is exactly 1/3 hour
      const oneThirdHourMinutes = 20;
      expect(minutesToDecimalHours(oneThirdHourMinutes * 3)).toBe(1);
      expect(hoursToMinutes(1.5)).toBe(90);
    });

    it('supports large financial sums within safe integer range', () => {
      // 50,000,000 EGP = 5,000,000,000 piasters
      const largeEgp = 50_000_000;
      const largePiasters = egpToPiasters(largeEgp);

      expect(Number.isSafeInteger(largePiasters)).toBe(true);
      expect(largePiasters).toBe(5_000_000_000);
      expect(piastersToEgp(largePiasters)).toBe(largeEgp);
      expect(formatPiasters(largePiasters)).toBe('50,000,000 ج.م');
    });

    it('strict validator throws on non-integer piasters or minutes', () => {
      expect(() => piastersToEgp(1234.5)).toThrow(/Invalid piaster amount/);
      expect(() => piastersToEgp(NaN)).toThrow(/Invalid piaster amount/);
      expect(() => minutesToDecimalHours(60.25)).toThrow(/Invalid minutes/);
      expect(() => minutesToDecimalHours(Infinity)).toThrow(/Invalid minutes/);
    });
  });
});
