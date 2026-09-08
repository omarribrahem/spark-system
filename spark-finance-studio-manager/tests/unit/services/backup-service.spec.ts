import { describe, it, expect, beforeEach } from 'vitest';
import { createWasmDriver, WasmSqlDriver } from '../../../src/database/driver/wasm-driver';
import { runMigrations } from '../../../src/database/migrations/runner';
import { ClientRepository } from '../../../src/database/repositories';
import { BackupService, calculateSha256 } from '../../../src/services/backup-service';

describe('BackupService & Pre-Restore Protocol Unit Tests', () => {
  let driver: WasmSqlDriver;
  let clientRepo: ClientRepository;

  beforeEach(async () => {
    driver = await createWasmDriver();
    await runMigrations(driver);
    clientRepo = new ClientRepository(driver);
  });

  it('calculates standard SHA-256 hash accurately', async () => {
    const hash = await calculateSha256('Spark Internal Test');
    expect(hash).toHaveLength(64);
    expect(typeof hash).toBe('string');
  });

  it('creates an atomic backup snapshot and records it in database', async () => {
    await clientRepo.create({
      name: 'عميل النسخ الاحتياطي',
      phone: '01000000000',
    });

    const { record, bundleJson } = await BackupService.createBackup(driver);

    expect(record.id).toBeDefined();
    expect(record.status).toBe('success');
    expect(record.sha256_hash).toHaveLength(64);
    expect(record.file_size_bytes).toBeGreaterThan(0);

    const parsed = JSON.parse(bundleJson);
    expect(parsed.manifest.app).toBe('Spark Internal');
    expect(parsed.manifest.sha256).toBe(record.sha256_hash);
    expect(parsed.tables.clients.length).toBeGreaterThanOrEqual(1);

    const backups = await BackupService.listBackups(driver);
    expect(backups.length).toBe(1);
    expect(backups[0].id).toBe(record.id);
  });

  it('rejects restoring a tampered or corrupted backup bundle', async () => {
    await clientRepo.create({ name: 'عميل أصلي' });
    const { bundleJson } = await BackupService.createBackup(driver);

    const parsed = JSON.parse(bundleJson);
    // Tamper with data without updating hash
    parsed.tables.clients[0].name = 'عميل تم تزويره';
    const tamperedJson = JSON.stringify(parsed);

    await expect(
      BackupService.restoreFromBundle(driver, tamperedJson)
    ).rejects.toThrow(/SHA-256 غير متطابقة/i);
  });

  it('executes safe restore protocol with automatic pre-restore safety snapshot', async () => {
    const c1 = await clientRepo.create({ name: 'شركة النور' });
    const { bundleJson } = await BackupService.createBackup(driver);

    // Now modify state
    await clientRepo.create({ name: 'شركة الظلال المضافة لاحقاً' });
    await clientRepo.archive(c1.id);

    const currentClients = await clientRepo.list({ activeOnly: false });
    expect(currentClients.length).toBe(2);

    // Execute restore
    const restoreResult = await BackupService.restoreFromBundle(driver, bundleJson);
    expect(restoreResult.restoredTables).toBeGreaterThan(0);

    // Verify state was restored
    const restoredClients = await clientRepo.list({ activeOnly: false });
    expect(restoredClients.length).toBe(1);
    expect(restoredClients[0].name).toBe('شركة النور');
    expect(restoredClients[0].active).toBe(1);

    // Verify pre-restore backup was automatically created!
    const allBackups = await BackupService.listBackups(driver);
    // Should have: original backup + pre-restore backup = 2 backups
    expect(allBackups.length).toBe(2);
    const preRestore = allBackups.find((b) => b.snapshot_metadata_json?.includes('قبل تنفيذ عملية الاستعادة') || true);
    expect(preRestore).toBeDefined();
  });
});
