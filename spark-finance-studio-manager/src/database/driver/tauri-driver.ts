import { IDatabaseDriver, QueryResult } from './types';
import Database from '@tauri-apps/plugin-sql';

/**
 * TauriSqlDriver: Native SQLite Driver for Desktop Production
 * Interacts with Tauri's Rust backend plugin-sql.
 * Enforces PRAGMA foreign_keys = ON, PRAGMA busy_timeout = 5000, and WAL mode.
 */
export class TauriSqlDriver implements IDatabaseDriver {
  private static savepointCounter = 0;
  private db: Database | null = null;
  private dbPath: string;
  private isClosed = false;

  constructor(dbPath = 'sqlite:spark.db') {
    this.dbPath = dbPath;
  }

  public async init(): Promise<void> {
    if (this.db) return;

    this.db = await Database.load(this.dbPath);

    // Apply M0 Critical Pragmas
    await this.db.execute('PRAGMA foreign_keys = ON;');
    await this.db.execute('PRAGMA busy_timeout = 5000;');
    await this.db.execute('PRAGMA journal_mode = WAL;');
    await this.db.execute('PRAGMA synchronous = NORMAL;');
    await this.db.execute('PRAGMA recursive_triggers = ON;');
  }

  private ensureConnected(): Database {
    if (this.isClosed || !this.db) {
      throw new Error('Tauri SQLite connection is closed or not initialized');
    }
    return this.db;
  }

  public async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    await this.init();
    const db = this.ensureConnected();

    const res = await db.execute(sql, (params ?? []) as any[]);
    return {
      rowsAffected: res.rowsAffected,
      lastInsertId: res.lastInsertId,
    };
  }

  public async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.init();
    const db = this.ensureConnected();

    return await db.select<T[]>(sql, (params ?? []) as any[]);
  }

  public async transaction<T>(fn: (tx: IDatabaseDriver) => Promise<T>): Promise<T> {
    await this.init();
    const db = this.ensureConnected();

    const spId = ++TauriSqlDriver.savepointCounter;
    const sp = `sp_tauri_${Date.now()}_${spId}`;

    await db.execute(`SAVEPOINT ${sp};`);
    try {
      const result = await fn(this);
      await db.execute(`RELEASE SAVEPOINT ${sp};`);
      return result;
    } catch (error) {
      await db.execute(`ROLLBACK TO SAVEPOINT ${sp};`);
      await db.execute(`RELEASE SAVEPOINT ${sp};`);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
    this.isClosed = true;
  }
}

/**
 * Factory to create and initialize a TauriSqlDriver
 */
export async function createTauriDriver(dbPath?: string): Promise<TauriSqlDriver> {
  const driver = new TauriSqlDriver(dbPath);
  await driver.init();
  return driver;
}
