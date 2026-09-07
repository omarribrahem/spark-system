import { IDatabaseDriver, QueryResult } from './types';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/**
 * WasmSqlDriver: In-Memory / WASM SQLite Driver using sql.js
 * Used for automated Vitest unit/integration suites and browser preview.
 * Enforces PRAGMA foreign_keys = ON and PRAGMA busy_timeout = 5000.
 */
export class WasmSqlDriver implements IDatabaseDriver {
  private static savepointCounter = 0;
  private db: Database | null = null;
  private sqlPromise: Promise<SqlJsStatic> | null = null;
  private isClosed = false;

  constructor(existingDb?: Database) {
    if (existingDb) {
      this.db = existingDb;
    }
  }

  /**
   * Initializes sql.js engine and configures SQLite pragmas
   */
  public async init(): Promise<void> {
    if (this.db) return;

    if (!this.sqlPromise) {
      // sql.js normally derives the .wasm path from its generated JavaScript
      // filename. Vite pre-bundles that JavaScript under /.vite/deps, where the
      // sibling wasm file does not exist and the dev server falls back to the
      // HTML document. Importing the asset gives Vite its real public URL.
      this.sqlPromise = typeof window === 'undefined'
        ? initSqlJs()
        : initSqlJs({ locateFile: () => sqlWasmUrl });
    }

    const SQL = await this.sqlPromise;
    this.db = new SQL.Database();

    // Critical M0 Pragmas
    this.db.run('PRAGMA foreign_keys = ON;');
    this.db.run('PRAGMA busy_timeout = 5000;');
    this.db.run('PRAGMA recursive_triggers = ON;');
  }

  private ensureConnected(): Database {
    if (this.isClosed || !this.db) {
      throw new Error('Database connection is not open or has been closed');
    }
    return this.db;
  }

  public async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    await this.init();
    const db = this.ensureConnected();

    const trimmed = sql.trim();
    if (!trimmed) {
      return { rowsAffected: 0 };
    }

    try {
      if (params.length > 0) {
        db.run(trimmed, params as any[]);
      } else {
        db.run(trimmed);
      }

      const rowsAffected = db.getRowsModified();
      let lastInsertId: number | undefined;

      // If statement is an INSERT, fetch last_insert_rowid
      if (/^\s*insert\s+into/i.test(trimmed)) {
        const res = db.exec('SELECT last_insert_rowid() AS id;');
        if (res.length > 0 && res[0].values.length > 0) {
          lastInsertId = Number(res[0].values[0][0]);
        }
      }

      return { rowsAffected, lastInsertId };
    } catch (err: any) {
      throw new Error(`SQLite Execution Error: ${err.message || String(err)} [SQL: ${trimmed}]`);
    }
  }

  public async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    await this.init();
    const db = this.ensureConnected();

    const trimmed = sql.trim();
    if (!trimmed) return [];

    try {
      const stmt = db.prepare(trimmed);
      if (params.length > 0) {
        stmt.bind(params as any[]);
      }

      const rows: T[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        rows.push(row as unknown as T);
      }
      stmt.free();

      return rows;
    } catch (err: any) {
      throw new Error(`SQLite Query Error: ${err.message || String(err)} [SQL: ${trimmed}]`);
    }
  }

  public async transaction<T>(fn: (tx: IDatabaseDriver) => Promise<T>): Promise<T> {
    await this.init();
    const db = this.ensureConnected();

    const spId = ++WasmSqlDriver.savepointCounter;
    const sp = `sp_wasm_${Date.now()}_${spId}`;

    db.run(`SAVEPOINT ${sp};`);
    try {
      const result = await fn(this);
      db.run(`RELEASE SAVEPOINT ${sp};`);
      return result;
    } catch (error) {
      db.run(`ROLLBACK TO SAVEPOINT ${sp};`);
      db.run(`RELEASE SAVEPOINT ${sp};`);
      throw error;
    }
  }

  public async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.isClosed = true;
  }
}

/**
 * Factory to create an initialized WasmSqlDriver
 */
export async function createWasmDriver(): Promise<WasmSqlDriver> {
  const driver = new WasmSqlDriver();
  await driver.init();
  return driver;
}
