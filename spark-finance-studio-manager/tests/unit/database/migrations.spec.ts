import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';

describe('Database Driver & Migration Infrastructure', () => {
  let driver: WasmSqlDriver;

  beforeEach(async () => {
    driver = await createWasmDriver();
  });

  afterEach(async () => {
    await driver.close();
  });

  it('should initialize WasmSqlDriver with foreign keys and busy_timeout', async () => {
    const fkRes = await driver.query<{ foreign_keys: number }>('PRAGMA foreign_keys;');
    expect(fkRes[0].foreign_keys).toBe(1);

    const timeoutRes = await driver.query<{ timeout: number }>('PRAGMA busy_timeout;');
    expect(timeoutRes[0].timeout).toBe(5000);
  });

  it('should run initial migration and create all 40 tables', async () => {
    const appliedCount = await runMigrations(driver);
    expect(appliedCount).toBe(5);

    // Running again should apply 0 migrations (idempotent)
    const secondRunCount = await runMigrations(driver);
    expect(secondRunCount).toBe(0);

    // Query all user tables from sqlite_master
    const tables = await driver.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;`
    );

    const tableNames = tables.map((t) => t.name);

    const expectedTables = [
      'activity_log',
      'app_custom_field_definitions',
      'app_custom_field_multiselect_values',
      'app_custom_field_options',
      'app_custom_field_values',
      'app_settings',
      'attachments',
      'backup_records',
      'client_agreements',
      'client_custom_field_definitions',
      'client_custom_field_multiselect_values',
      'client_custom_field_options',
      'client_custom_field_values',
      'client_filter_presets',
      'client_package_items',
      'client_packages',
      'clients',
      'expenses',
      'general_audit_logs',
      'marketing_contracts',
      'marketing_extras',
      'marketing_monthly_dues',
      'package_template_items',
      'package_templates',
      'payment_allocations',
      'payments',
      'plan_template_entitlements',
      'plan_templates',
      'recurring_booking_rules',
      'reel_items',
      'schema_migrations',
      'service_definitions',
      'sold_plan_entitlements',
      'sold_plans',
      'studio_bookings',
      'subscription_monthly_dues',
      'subscriptions',
      'users',
      'website_projects',
      'workflow_stages',
    ];

    expect(tableNames.length).toBe(40);
    for (const expected of expectedTables) {
      expect(tableNames).toContain(expected);
    }
  });

  it('should include extended client columns in migration 003', async () => {
    await runMigrations(driver);

    const clientCols = await driver.query<{ name: string }>(
      `PRAGMA table_info(clients);`
    );
    const colNames = clientCols.map((c) => c.name);

    expect(colNames).toContain('client_type');
    expect(colNames).toContain('contact_name');
    expect(colNames).toContain('contact_role');
    expect(colNames).toContain('whatsapp');
    expect(colNames).toContain('email');
    expect(colNames).toContain('city');
    expect(colNames).toContain('preferred_contact');
  });

  it('should include extended columns and default workflow stages in migration 004', async () => {
    await runMigrations(driver);

    const sDefCols = await driver.query<{ name: string }>(`PRAGMA table_info(service_definitions);`);
    const sDefColNames = sDefCols.map((c) => c.name);
    expect(sDefColNames).toContain('service_type_key');
    expect(sDefColNames).toContain('default_price');
    expect(sDefColNames).toContain('requires_contract');

    const reelCols = await driver.query<{ name: string }>(`PRAGMA table_info(reel_items);`);
    const reelColNames = reelCols.map((c) => c.name);
    expect(reelColNames).toContain('sold_plan_id');
    expect(reelColNames).toContain('priority');
    expect(reelColNames).toContain('target_date');

    const stages = await driver.query<{ stage_key: string; is_protected: number }>(
      `SELECT stage_key, is_protected FROM workflow_stages ORDER BY sort_order ASC;`
    );
    expect(stages.length).toBe(7);
    const delivered = stages.find((s) => s.stage_key === 'delivered');
    expect(delivered?.is_protected).toBe(1);
    const cancelled = stages.find((s) => s.stage_key === 'cancelled');
    expect(cancelled?.is_protected).toBe(1);
  });

  it('should include updated_at in marketing_monthly_dues and subscription_monthly_dues', async () => {
    await runMigrations(driver);

    const mDuesCols = await driver.query<{ name: string }>(
      `PRAGMA table_info(marketing_monthly_dues);`
    );
    expect(mDuesCols.some((c) => c.name === 'updated_at')).toBe(true);

    const sDuesCols = await driver.query<{ name: string }>(
      `PRAGMA table_info(subscription_monthly_dues);`
    );
    expect(sDuesCols.some((c) => c.name === 'updated_at')).toBe(true);
  });

  it('should prevent trigger recursion using WHEN OLD.updated_at = NEW.updated_at', async () => {
    await runMigrations(driver);

    // Insert a client
    const clientId = 'c-100';
    const originalTime = '2026-01-01T00:00:00.000Z';
    await driver.execute(
      `INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`,
      [clientId, 'مؤسسة الأمل', originalTime, originalTime]
    );

    // Update client name without specifying updated_at
    await driver.execute(
      `UPDATE clients SET name = ? WHERE id = ?;`,
      ['مؤسسة الأمل للتجارة', clientId]
    );

    const clients = await driver.query<{ name: string; updated_at: string }>(
      `SELECT name, updated_at FROM clients WHERE id = ?;`,
      [clientId]
    );

    expect(clients[0].name).toBe('مؤسسة الأمل للتجارة');
    // Trigger should have updated updated_at
    expect(clients[0].updated_at).not.toBe(originalTime);
  });

  it('should block hard delete of payments via trg_prevent_payment_delete', async () => {
    await runMigrations(driver);

    const clientId = 'c-pay-test';
    const now = new Date().toISOString();
    await driver.execute(
      `INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`,
      [clientId, 'عميل مدفوعات', now, now]
    );

    const paymentId = 'p-100';
    await driver.execute(
      `INSERT INTO payments (id, client_id, amount, method, date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [paymentId, clientId, 150000, 'instapay', '2026-09-06', 'active', now]
    );

    // Attempt direct delete
    await expect(
      driver.execute(`DELETE FROM payments WHERE id = ?;`, [paymentId])
    ).rejects.toThrow(/Direct physical deletion of payments is prohibited/i);

    // Verify payment still exists
    const payments = await driver.query<{ id: string }>(
      `SELECT id FROM payments WHERE id = ?;`,
      [paymentId]
    );
    expect(payments.length).toBe(1);
  });

  it('should enforce foreign key constraints', async () => {
    await runMigrations(driver);

    const now = new Date().toISOString();
    // Attempt inserting a marketing contract for a non-existent client
    await expect(
      driver.execute(
        `INSERT INTO marketing_contracts (id, client_id, monthly_amount, start_date, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        ['mc-invalid', 'non-existent-client', 500000, '2026-09-01', 'active', now, now]
      )
    ).rejects.toThrow(/foreign key/i);
  });

  it('should execute atomic transactions with rollback on failure', async () => {
    await runMigrations(driver);

    const now = new Date().toISOString();
    const clientId = 'c-tx-test';

    await expect(
      driver.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO clients (id, name, created_at, updated_at) VALUES (?, ?, ?, ?);`,
          [clientId, 'عميل تجربة المعاملات', now, now]
        );
        // Force an error inside transaction
        throw new Error('Simulated failure during transaction');
      })
    ).rejects.toThrow('Simulated failure during transaction');

    // Verify row was rolled back
    const rows = await driver.query(
      `SELECT * FROM clients WHERE id = ?;`,
      [clientId]
    );
    expect(rows.length).toBe(0);
  });

  it('should seed default users and support backup records in migration 005', async () => {
    await runMigrations(driver);

    const users = await driver.query<{ id: string; role: string }>(
      `SELECT id, role FROM users ORDER BY id ASC;`
    );
    expect(users.length).toBe(4);
    const roles = users.map((u) => u.role);
    expect(roles).toContain('admin');
    expect(roles).toContain('finance');
    expect(roles).toContain('operations');
    expect(roles).toContain('viewer');

    const backupCols = await driver.query<{ name: string }>(
      `PRAGMA table_info(backup_records);`
    );
    const colNames = backupCols.map((c) => c.name);
    expect(colNames).toContain('filename');
    expect(colNames).toContain('sha256_hash');
    expect(colNames).toContain('file_size_bytes');
    expect(colNames).toContain('status');
    expect(colNames).toContain('storage_type');
  });
});
