import { IDatabaseDriver } from '../driver/types';
import { INITIAL_SCHEMA_SQL } from './001_initial_schema';
import { REPAIR_UPDATED_AT_TRIGGERS_SQL } from './002_repair_updated_at_triggers';

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
