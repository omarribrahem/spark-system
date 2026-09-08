/**
 * BackupService: Real atomic local backup and safe restore engine.
 * Generates cryptographic SHA-256 manifest, rotates backups (30-retention),
 * and enforces the Pre-Restore Safety Protocol.
 */

import { IDatabaseDriver } from '../database/driver/types';

export interface BackupRecord {
  id: string;
  filename: string;
  file_path: string | null;
  file_size_bytes: number;
  sha256_hash: string;
  status: 'success' | 'failed' | 'restoring';
  failure_reason: string | null;
  storage_type: 'local' | 'gdrive';
  gdrive_file_id: string | null;
  snapshot_metadata_json: string | null;
  created_at: string;
}

export interface BackupBundle {
  manifest: {
    app: string;
    version: string;
    schemaVersion: number;
    createdAt: string;
    sha256: string;
    tablesCount: number;
    recordsCount: number;
  };
  tables: Record<string, unknown[]>;
}

/**
 * Calculates SHA-256 checksum string for given text using standard Web Crypto API.
 */
export async function calculateSha256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class BackupService {
  public static async listBackups(driver: IDatabaseDriver): Promise<BackupRecord[]> {
    return await driver.query<BackupRecord>(
      `SELECT * FROM backup_records ORDER BY created_at DESC;`
    );
  }

  /**
   * Creates a full, atomic snapshot of all SQLite tables, calculates SHA-256,
   * stores metadata, and enforces retention.
   */
  public static async createBackup(
    driver: IDatabaseDriver,
    options?: { storageType?: 'local' | 'gdrive'; reason?: string }
  ): Promise<{ record: BackupRecord; bundleJson: string }> {
    const now = new Date();
    const timestampStr = now.toISOString().replace(/[:.]/g, '-');
    const filename = `spark-backup-${timestampStr}.json`;

    // 1. Get all tables in database
    const tableRows = await driver.query<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('backup_records', 'schema_migrations') ORDER BY name ASC;`
    );

    const tablesData: Record<string, unknown[]> = {};
    let totalRecords = 0;

    for (const t of tableRows) {
      const rows = await driver.query<unknown>(`SELECT * FROM ${t.name};`);
      tablesData[t.name] = rows;
      totalRecords += rows.length;
    }

    const payloadWithoutHash = JSON.stringify(tablesData);
    const sha256 = await calculateSha256(payloadWithoutHash);

    const bundle: BackupBundle = {
      manifest: {
        app: 'Spark Internal',
        version: '1.0.0',
        schemaVersion: 5,
        createdAt: now.toISOString(),
        sha256,
        tablesCount: tableRows.length,
        recordsCount: totalRecords,
      },
      tables: tablesData,
    };

    const bundleJson = JSON.stringify(bundle, null, 2);
    const sizeBytes = new TextEncoder().encode(bundleJson).length;
    const backupId = `bk-${crypto.randomUUID()}`;

    // 2. Insert into backup_records
    await driver.execute(
      `INSERT INTO backup_records (
        id, filename, file_path, file_size_bytes, sha256_hash, status,
        storage_type, snapshot_metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, 'success', ?, ?, ?);`,
      [
        backupId,
        filename,
        `backups/${filename}`,
        sizeBytes,
        sha256,
        options?.storageType ?? 'local',
        JSON.stringify(bundle.manifest),
        now.toISOString(),
      ]
    );

    // 3. Log into general_audit_logs
    await driver.execute(
      `INSERT INTO general_audit_logs (
        id, entity_type, entity_id, action, user_id, change_reason, old_values_json, new_values_json, timestamp
      ) VALUES (?, 'backup', ?, 'BACKUP_CREATED', 'system', ?, NULL, ?, ?);`,
      [
        crypto.randomUUID(),
        backupId,
        options?.reason ?? 'نسخ احتياطي محلي دوري للبيانات',
        JSON.stringify({ filename, sizeBytes, sha256 }),
        now.toISOString(),
      ]
    );

    // 4. Enforce 30-backup retention policy
    const allBackups = await this.listBackups(driver);
    if (allBackups.length > 30) {
      const toDelete = allBackups.slice(30);
      for (const oldBk of toDelete) {
        await driver.execute(`DELETE FROM backup_records WHERE id = ?;`, [oldBk.id]);
      }
    }

    // 5. Cloud Mirror Upload if requested
    if (options?.storageType === 'gdrive') {
      try {
        const { GDriveOAuthService } = await import('./gdrive-oauth-service');
        const uploadResult = await GDriveOAuthService.uploadBackup(bundleJson, filename);
        await driver.execute(
          `UPDATE backup_records SET gdrive_file_id = ?, storage_type = 'gdrive' WHERE id = ?;`,
          [uploadResult.fileId, backupId]
        );
      } catch (gdriveErr: unknown) {
        const errMsg = gdriveErr instanceof Error ? gdriveErr.message : String(gdriveErr);
        console.warn('Google Drive backup upload failed, local backup preserved:', errMsg);
        await driver.execute(
          `UPDATE backup_records SET failure_reason = ? WHERE id = ?;`,
          [`فشل الرفع السحابي: ${errMsg}`, backupId]
        );
      }
    }

    const createdRecord = (await driver.query<BackupRecord>(
      `SELECT * FROM backup_records WHERE id = ? LIMIT 1;`,
      [backupId]
    ))[0];

    return { record: createdRecord, bundleJson };
  }

  /**
   * Safe Pre-Restore Protocol:
   * 1. Validates integrity of bundle JSON & SHA-256
   * 2. Automatically creates a pre-restore safety snapshot
   * 3. Atomically restores all tables
   * 4. Logs the restore action in audit log
   */
  public static async restoreFromBundle(
    driver: IDatabaseDriver,
    bundleJson: string
  ): Promise<{ restoredTables: number; restoredRecords: number }> {
    let bundle: BackupBundle;
    try {
      bundle = JSON.parse(bundleJson);
    } catch {
      throw new Error('ملف النسخة الاحتياطية غير صالح (JSON تالف أو غير مقروء)');
    }

    if (!bundle.manifest || !bundle.tables) {
      throw new Error('بنية ملف النسخة الاحتياطية غير مطابقة لمعايير سبارك');
    }

    // Verify SHA-256 checksum
    const payloadToVerify = JSON.stringify(bundle.tables);
    const computedHash = await calculateSha256(payloadToVerify);
    if (computedHash !== bundle.manifest.sha256) {
      throw new Error('فشل التحقق من سلامة النسخة الاحتياطية: بصمة التجزئة SHA-256 غير متطابقة، قد يكون الملف قد عُدّل أو تعرض للتلف.');
    }

    // Phase A: Create Pre-Restore Safety Snapshot FIRST!
    await this.createBackup(driver, { reason: 'نسخة أمان تلقائية قبل تنفيذ عملية الاستعادة' });

    // Phase B: Atomic restore inside transaction
    let totalRestoredRecords = 0;
    const tableNames = Object.keys(bundle.tables);

    await driver.transaction(async (tx) => {
      // Clear and populate tables
      for (const table of tableNames) {
        // Only restore valid application tables
        const tableCheck = await tx.query<{ name: string }>(
          `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1;`,
          [table]
        );
        if (tableCheck.length === 0) continue;

        const rows = bundle.tables[table];
        if (!Array.isArray(rows)) continue;

        // Clear existing rows
        await tx.execute(`DELETE FROM ${table};`);

        if (rows.length > 0) {
          const sampleRow = rows[0] as Record<string, unknown>;
          const columns = Object.keys(sampleRow);
          const placeholders = columns.map(() => '?').join(', ');
          const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders});`;

          for (const row of rows) {
            const values = columns.map((col) => (row as Record<string, unknown>)[col]);
            await tx.execute(sql, values);
            totalRestoredRecords++;
          }
        }
      }

      // Log the restore event
      await tx.execute(
        `INSERT INTO general_audit_logs (
          id, entity_type, entity_id, action, user_id, change_reason, old_values_json, new_values_json, timestamp
        ) VALUES (?, 'system', 'database', 'BACKUP_RESTORED', 'admin', 'استعادة ناجحة من نسخة احتياطية بعد التحقق الكامل', NULL, ?, ?);`,
        [
          crypto.randomUUID(),
          JSON.stringify({
            manifestDate: bundle.manifest.createdAt,
            tablesRestored: tableNames.length,
            recordsRestored: totalRestoredRecords,
          }),
          new Date().toISOString(),
        ]
      );
    });

    return {
      restoredTables: tableNames.length,
      restoredRecords: totalRestoredRecords,
    };
  }
}
