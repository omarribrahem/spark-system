import { IDatabaseDriver } from '../driver/types';
import { INITIAL_SCHEMA_SQL } from './001_initial_schema';
import { REPAIR_UPDATED_AT_TRIGGERS_SQL } from './002_repair_updated_at_triggers';
import { CLIENT_DYNAMIC_FIELDS_AND_FILTERS_SQL } from './003_client_dynamic_fields_and_filters';
import { UNIVERSAL_SERVICES_PLANS_AND_REELS_SQL } from './004_universal_services_plans_and_reels';
import { USERS_ROLES_AND_BACKUP_HISTORY_SQL } from './005_users_roles_and_backup_history';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: '001_initial_schema',
    sql: INITIAL_SCHEMA_SQL,
  },
  {
    version: 2,
    name: '002_repair_updated_at_triggers',
    sql: REPAIR_UPDATED_AT_TRIGGERS_SQL,
  },
  {
    version: 3,
    name: '003_client_dynamic_fields_and_filters',
    sql: CLIENT_DYNAMIC_FIELDS_AND_FILTERS_SQL,
  },
  {
    version: 4,
    name: '004_universal_services_plans_and_reels',
    sql: UNIVERSAL_SERVICES_PLANS_AND_REELS_SQL,
  },
  {
    version: 5,
    name: '005_users_roles_and_backup_history',
    sql: USERS_ROLES_AND_BACKUP_HISTORY_SQL,
  },
];

export class MigrationRunner {
  private driver: IDatabaseDriver;

  constructor(driver: IDatabaseDriver) {
    this.driver = driver;
  }

  /**
   * Ensures the schema_migrations table exists before checking status
   */
  public async ensureMigrationsTable(): Promise<void> {
    await this.driver.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
  }

  /**
   * Returns list of already applied migration version numbers
   */
  public async getAppliedVersions(): Promise<number[]> {
    await this.ensureMigrationsTable();
    const rows = await this.driver.query<{ version: number }>(
      'SELECT version FROM schema_migrations ORDER BY version ASC;'
    );
    return rows.map((r) => Number(r.version));
  }

  /**
   * Executes all pending migrations in ascending version order
   */
  public async runPendingMigrations(): Promise<number> {
    await this.ensureMigrationsTable();
    const applied = await this.getAppliedVersions();
    const pending = MIGRATIONS.filter((m) => !applied.includes(m.version)).sort(
      (a, b) => a.version - b.version
    );

    if (pending.length === 0) return 0;

    // Safety Pre-Migration Backup if upgrading an existing populated database
    if (applied.length > 0) {
      try {
        const { BackupService } = await import('../../services/backup-service');
        await BackupService.createBackup(this.driver, {
          reason: `نسخة أمان تلقائية قبل ترقية المخطط للإصدارات: ${pending.map((p) => p.version).join(', ')}`,
        });
      } catch (backupErr) {
        console.warn('Pre-migration safety backup warning:', backupErr);
      }
    }

    let appliedCount = 0;

    for (const migration of pending) {
      await this.applyMigration(migration);
      appliedCount++;
    }

    return appliedCount;
  }

  /**
   * Applies a single migration within an atomic transaction
   */
  public async applyMigration(migration: Migration): Promise<void> {
    await this.driver.transaction(async (tx) => {
      // Execute the migration DDL
      await tx.execute(migration.sql);

      // Record applied version
      const now = new Date().toISOString();
      await tx.execute(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?);',
        [migration.version, now]
      );
    });
  }
}

/**
 * Convenience helper to initialize migrations on a database driver
 */
export async function runMigrations(driver: IDatabaseDriver): Promise<number> {
  const runner = new MigrationRunner(driver);
  return await runner.runPendingMigrations();
}
