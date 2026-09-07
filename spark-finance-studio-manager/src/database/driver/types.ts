/**
 * Spark Finance & Studio Manager - Unified Database Driver Contract
 * Abstracts desktop SQLite (@tauri-apps/plugin-sql) and in-memory WASM (sql.js).
 */

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface IDatabaseDriver {
  /**
   * Executes a mutation statement (INSERT, UPDATE, DELETE, DDL, PRAGMA)
   */
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * Executes a query statement (SELECT) and maps result rows to typed objects
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * Executes an atomic transaction callback with auto-commit and rollback on error
   */
  transaction<T>(fn: (tx: IDatabaseDriver) => Promise<T>): Promise<T>;

  /**
   * Closes the active database connection
   */
  close(): Promise<void>;
}
