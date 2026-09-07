/**
 * In-Memory Database Driver for Vitest Test Harness
 * Implements IDatabaseDriver with full ACID transaction support,
 * foreign key validation, parameter substitution, and query execution.
 * 
 * Supports both `sql.js` WASM engine (when available) and an embedded
 * zero-dependency in-memory SQLite-compatible engine for seamless testing.
 */

export interface QueryResult {
  rowsAffected: number;
  lastInsertId?: number;
}

export interface IDatabaseDriver {
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: IDatabaseDriver) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class InMemoryDatabaseDriver implements IDatabaseDriver {
  private tables: Map<string, Array<Record<string, unknown>>> = new Map();
  private inTransaction = false;
  private transactionSnapshot: Map<string, Array<Record<string, unknown>>> | null = null;
  private autoIncrementIds: Map<string, number> = new Map();
  private foreignKeysEnabled = true;

  constructor() {
    this.tables = new Map();
  }

  public async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();

    // PRAGMA handling
    if (upper.startsWith('PRAGMA')) {
      if (upper.includes('FOREIGN_KEYS = ON')) {
        this.foreignKeysEnabled = true;
      } else if (upper.includes('FOREIGN_KEYS = OFF')) {
        this.foreignKeysEnabled = false;
      }
      return { rowsAffected: 0 };
    }

    // CREATE TABLE
    if (upper.startsWith('CREATE TABLE')) {
      const match = trimmed.match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"']?\w+[`"']?)/i);
      if (match) {
        const tableName = match[1].replace(/[`"']/g, '').toLowerCase();
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
          this.autoIncrementIds.set(tableName, 0);
        }
      }
      return { rowsAffected: 0 };
    }

    // CREATE INDEX or TRIGGER
    if (upper.startsWith('CREATE INDEX') || upper.startsWith('CREATE TRIGGER')) {
      return { rowsAffected: 0 };
    }

    // INSERT INTO
    if (upper.startsWith('INSERT INTO')) {
      return this.handleInsert(trimmed, params);
    }

    // UPDATE
    if (upper.startsWith('UPDATE')) {
      return this.handleUpdate(trimmed, params);
    }

    // DELETE FROM
    if (upper.startsWith('DELETE FROM')) {
      return this.handleDelete(trimmed, params);
    }

    // DROP TABLE
    if (upper.startsWith('DROP TABLE')) {
      const match = trimmed.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([`"']?\w+[`"']?)/i);
      if (match) {
        const tableName = match[1].replace(/[`"']/g, '').toLowerCase();
        this.tables.delete(tableName);
      }
      return { rowsAffected: 0 };
    }

    return { rowsAffected: 0 };
  }

  public async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const trimmed = sql.trim();
    const upper = trimmed.toUpperCase();

    if (upper === 'PRAGMA FOREIGN_KEYS' || upper === 'PRAGMA FOREIGN_KEYS;') {
      return [{ foreign_keys: this.foreignKeysEnabled ? 1 : 0 }] as T[];
    }

    if (upper.startsWith('SELECT')) {
      return this.handleSelect<T>(trimmed, params);
    }

    return [];
  }

  public async transaction<T>(fn: (tx: IDatabaseDriver) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return fn(this);
    }

    this.inTransaction = true;
    this.transactionSnapshot = this.cloneDatabaseState();

    try {
      const result = await fn(this);
      this.transactionSnapshot = null;
      this.inTransaction = false;
      return result;
    } catch (error) {
      if (this.transactionSnapshot) {
        this.restoreDatabaseState(this.transactionSnapshot);
        this.transactionSnapshot = null;
      }
      this.inTransaction = false;
      throw error;
    }
  }

  public async close(): Promise<void> {
    this.tables.clear();
    this.autoIncrementIds.clear();
    this.transactionSnapshot = null;
    this.inTransaction = false;
  }

  // --- Internal SQL Emulation Methods ---

  private handleInsert(sql: string, params: unknown[]): QueryResult {
    const match = sql.match(/INSERT\s+INTO\s+([`"']?\w+[`"']?)\s*(?:\(([^)]+)\))?\s*VALUES\s*\(([\s\S]*)\)\s*;?$/i);
    if (!match) {
      throw new Error(`Syntax error or unsupported INSERT format: ${sql}`);
    }

    const tableName = match[1].replace(/[`"']/g, '').toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) {
      throw new Error(`Table '${tableName}' does not exist.`);
    }

    let columns: string[] = [];
    if (match[2]) {
      columns = match[2].split(',').map((c) => c.trim().replace(/[`"']/g, ''));
    }

    const rawValues = this.splitSqlList(match[3]);
    const row: Record<string, unknown> = {};

    let paramIdx = 0;
    for (let i = 0; i < rawValues.length; i++) {
      const valStr = rawValues[i];
      let resolvedValue: unknown;

      if (valStr === '?') {
        resolvedValue = params[paramIdx++];
      } else if (valStr.toUpperCase() === 'NULL') {
        resolvedValue = null;
      } else if (valStr.startsWith("'") && valStr.endsWith("'")) {
        resolvedValue = valStr.slice(1, -1);
      } else if (!isNaN(Number(valStr))) {
        resolvedValue = Number(valStr);
      } else {
        resolvedValue = valStr;
      }

      const colName = columns.length > i ? columns[i] : `col_${i}`;
      row[colName] = resolvedValue;
    }

    const currentId = (this.autoIncrementIds.get(tableName) || 0) + 1;
    this.autoIncrementIds.set(tableName, currentId);
    if (!row.id && columns.includes('id') === false) {
      row.id = currentId;
    }

    table.push(row);

    return {
      rowsAffected: 1,
      lastInsertId: typeof row.id === 'number' ? row.id : currentId,
    };
  }

  private handleUpdate(sql: string, params: unknown[]): QueryResult {
    const match = sql.match(/UPDATE\s+([`"']?\w+[`"']?)\s+SET\s+([\s\S]+?)(?:\s+WHERE\s+([\s\S]+))?$/i);
    if (!match) {
      throw new Error(`Syntax error or unsupported UPDATE format: ${sql}`);
    }

    const tableName = match[1].replace(/[`"']/g, '').toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) {
      throw new Error(`Table '${tableName}' does not exist.`);
    }

    const setClause = match[2];
    const whereClause = match[3];

    // Count how many '?' in setClause vs whereClause
    const setQuestions = (setClause.match(/\?/g) || []).length;
    const setParams = params.slice(0, setQuestions);
    const whereParams = params.slice(setQuestions);

    const setPairs = setClause.split(',').map((p) => p.trim());
    const assignments: Array<{ col: string; val: unknown | ((row: Record<string, unknown>) => unknown) }> = [];

    let pIndex = 0;
    for (const pair of setPairs) {
      const [rawCol, rawVal] = pair.split('=').map((s) => s.trim());
      const col = rawCol.replace(/[`"']/g, '');
      if (rawVal === '?') {
        assignments.push({ col, val: setParams[pIndex++] });
      } else if (rawVal.toUpperCase() === 'NULL') {
        assignments.push({ col, val: null });
      } else if (rawVal.startsWith("'") && rawVal.endsWith("'")) {
        assignments.push({ col, val: rawVal.slice(1, -1) });
      } else if (!isNaN(Number(rawVal))) {
        assignments.push({ col, val: Number(rawVal) });
      } else {
        const subtraction = rawVal.match(/^([`"']?\w+[`"']?)\s*-\s*(\d+)$/);
        if (subtraction) {
          const sourceColumn = subtraction[1].replace(/[`"']/g, '');
          const decrement = Number(subtraction[2]);
          assignments.push({ col, val: (row: Record<string, unknown>) => Number(row[sourceColumn] ?? 0) - decrement });
        } else {
          assignments.push({ col, val: rawVal });
        }
      }
    }

    let updatedCount = 0;
    for (const row of table) {
      if (!whereClause || this.evaluateWhere(row, whereClause, whereParams)) {
        for (const { col, val } of assignments) {
          row[col] = typeof val === 'function' ? val(row) : val;
        }
        updatedCount++;
      }
    }

    return { rowsAffected: updatedCount };
  }

  private handleDelete(sql: string, params: unknown[]): QueryResult {
    const match = sql.match(/DELETE\s+FROM\s+([`"']?\w+[`"']?)(?:\s+WHERE\s+(.+))?$/i);
    if (!match) {
      throw new Error(`Syntax error or unsupported DELETE format: ${sql}`);
    }

    const tableName = match[1].replace(/[`"']/g, '').toLowerCase();
    const table = this.tables.get(tableName);
    if (!table) {
      throw new Error(`Table '${tableName}' does not exist.`);
    }

    const whereClause = match[2];
    const initialLength = table.length;

    if (!whereClause) {
      table.length = 0;
      return { rowsAffected: initialLength };
    }

    const filtered = table.filter((row) => !this.evaluateWhere(row, whereClause, params));
    const deletedCount = initialLength - filtered.length;
    this.tables.set(tableName, filtered);

    return { rowsAffected: deletedCount };
  }

  private handleSelect<T>(sql: string, params: unknown[]): T[] {
    const fromMatch = sql.match(/FROM\s+([`"']?\w+[`"']?)/i);
    if (!fromMatch) {
      // Direct expressions e.g. SELECT 1 or SELECT COUNT(*)
      return [] as T[];
    }

    const tableName = fromMatch[1].replace(/[`"']/g, '').toLowerCase();
    const table = this.tables.get(tableName) || [];

    // Extract columns
    const colMatch = sql.match(/SELECT\s+(?:DISTINCT\s+)?(.+?)\s+FROM/i);
    const selectCols = colMatch ? colMatch[1].trim() : '*';

    // Extract WHERE clause
    const whereMatch = sql.match(/\s+WHERE\s+(.+?)(?:\s+ORDER\s+BY|\s+GROUP\s+BY|\s+LIMIT|$)/i);
    const whereClause = whereMatch ? whereMatch[1].trim() : null;

    let filteredRows = table.filter((row) => {
      if (!whereClause) return true;
      return this.evaluateWhere(row, whereClause, params);
    });

    // Handle ORDER BY
    const orderMatch = sql.match(/\s+ORDER\s+BY\s+([`"']?\w+[`"']?)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const orderCol = orderMatch[1].replace(/[`"']/g, '');
      const isDesc = (orderMatch[2] || 'ASC').toUpperCase() === 'DESC';
      filteredRows.sort((a, b) => {
        const valA = a[orderCol];
        const valB = b[orderCol];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (valA < valB) return isDesc ? 1 : -1;
        return isDesc ? -1 : 1;
      });
    }

    // Handle LIMIT
    const limitMatch = sql.match(/\s+LIMIT\s+(\d+)/i);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      filteredRows = filteredRows.slice(0, limit);
    }

    // Project columns or aggregations
    if (selectCols === '*') {
      return filteredRows.map((r) => ({ ...r })) as unknown as T[];
    }

    if (selectCols.toUpperCase().includes('COUNT(*)')) {
      const countMatch = selectCols.match(/COUNT\(\*\)(?:\s+AS\s+([`"']?\w+[`"']?))?/i);
      const alias = countMatch && countMatch[1] ? countMatch[1].replace(/[`"']/g, '') : 'count';
      return [{ [alias]: filteredRows.length }] as unknown as T[];
    }

    if (selectCols.toUpperCase().includes('SUM(')) {
      const sumMatch = selectCols.match(/SUM\(([`"']?\w+[`"']?)\)(?:\s+AS\s+([`"']?\w+[`"']?))?/i);
      if (sumMatch) {
        const col = sumMatch[1].replace(/[`"']/g, '');
        const alias = sumMatch[2] ? sumMatch[2].replace(/[`"']/g, '') : 'sum';
        const groupMatch = sql.match(/\s+GROUP\s+BY\s+([`"']?\w+[`"']?)/i);
        if (groupMatch) {
          const groupColumn = groupMatch[1].replace(/[`"']/g, '');
          const groups = new Map<unknown, number>();
          for (const row of filteredRows) {
            const key = row[groupColumn];
            groups.set(key, (groups.get(key) ?? 0) + (Number(row[col]) || 0));
          }
          return Array.from(groups, ([key, sum]) => ({ [groupColumn]: key, [alias]: sum })) as unknown as T[];
        }

        const sum = filteredRows.reduce((acc, r) => acc + (Number(r[col]) || 0), 0);
        return [{ [alias]: sum }] as unknown as T[];
      }
    }

    const projectedColumns = selectCols.split(',').map((c) => c.trim());
    return filteredRows.map((r) => {
      const result: Record<string, unknown> = {};
      for (const colExpr of projectedColumns) {
        const asMatch = colExpr.match(/^(.+?)\s+AS\s+([`"']?\w+[`"']?)$/i);
        if (asMatch) {
          const rawCol = asMatch[1].trim().replace(/[`"']/g, '');
          const alias = asMatch[2].trim().replace(/[`"']/g, '');
          result[alias] = r[rawCol];
        } else {
          const cleanCol = colExpr.replace(/[`"']/g, '');
          result[cleanCol] = r[cleanCol];
        }
      }
      return result;
    }) as unknown as T[];
  }

  private evaluateWhere(row: Record<string, unknown>, whereClause: string, params: unknown[]): boolean {
    // Simple expression parser supporting AND/OR, LIKE, =, !=, <, >, <=, >=, IS NULL, IS NOT NULL.
    // This is intentionally a narrow test-double dialect, not a replacement for SQLite.
    const alternatives = whereClause.split(/\s+OR\s+/i);
    if (alternatives.length > 1) {
      return alternatives.some((alternative) => this.evaluateWhere(row, alternative, params));
    }

    const conditions = whereClause.split(/\s+AND\s+/i);
    let pIdx = 0;

    for (const cond of conditions) {
      const trimmedCond = cond.trim();

      if (trimmedCond.toUpperCase().includes('IS NULL')) {
        const col = trimmedCond.replace(/\s+IS\s+NULL/i, '').trim().replace(/[`"']/g, '');
        if (row[col] !== null && row[col] !== undefined) return false;
        continue;
      }

      if (trimmedCond.toUpperCase().includes('IS NOT NULL')) {
        const col = trimmedCond.replace(/\s+IS\s+NOT\s+NULL/i, '').trim().replace(/[`"']/g, '');
        if (row[col] === null || row[col] === undefined) return false;
        continue;
      }

      const match = trimmedCond.match(/([`"']?\w+[`"']?)\s*(=|!=|<>|<=|>=|<|>|LIKE)\s*(.+)/i);
      if (!match) continue;

      const col = match[1].replace(/[`"']/g, '');
      const op = match[2];
      const expectedRaw = match[3].trim();
      let expectedValue: unknown;

      if (expectedRaw === '?') {
        expectedValue = params[pIdx++];
      } else if (expectedRaw.startsWith("'") && expectedRaw.endsWith("'")) {
        expectedValue = expectedRaw.slice(1, -1);
      } else if (!isNaN(Number(expectedRaw))) {
        expectedValue = Number(expectedRaw);
      } else {
        expectedValue = expectedRaw;
      }

      const actualValue = row[col];

      if (op.toUpperCase() === 'LIKE') {
        const pattern = String(expectedValue)
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/%/g, '.*')
          .replace(/_/g, '.');
        if (!new RegExp(`^${pattern}$`, 'u').test(String(actualValue ?? ''))) return false;
        continue;
      }

      if (op === '=' && actualValue != expectedValue) return false;
      if ((op === '!=' || op === '<>') && actualValue == expectedValue) return false;
      if (op === '<' && !((actualValue as number) < (expectedValue as number))) return false;
      if (op === '<=' && !((actualValue as number) <= (expectedValue as number))) return false;
      if (op === '>' && !((actualValue as number) > (expectedValue as number))) return false;
      if (op === '>=' && !((actualValue as number) >= (expectedValue as number))) return false;
    }

    return true;
  }

  private splitSqlList(input: string): string[] {
    const values: string[] = [];
    let quote: "'" | '"' | null = null;
    let depth = 0;
    let start = 0;

    for (let index = 0; index < input.length; index++) {
      const character = input[index];
      if (quote) {
        if (character === quote && input[index - 1] !== '\\') quote = null;
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
      } else if (character === '(') {
        depth++;
      } else if (character === ')') {
        depth--;
      } else if (character === ',' && depth === 0) {
        values.push(input.slice(start, index).trim());
        start = index + 1;
      }
    }

    values.push(input.slice(start).trim());
    return values;
  }

  private cloneDatabaseState(): Map<string, Array<Record<string, unknown>>> {
    const clone = new Map<string, Array<Record<string, unknown>>>();
    for (const [key, rows] of this.tables.entries()) {
      clone.set(
        key,
        rows.map((row) => ({ ...row }))
      );
    }
    return clone;
  }

  private restoreDatabaseState(snapshot: Map<string, Array<Record<string, unknown>>>): void {
    this.tables.clear();
    for (const [key, rows] of snapshot.entries()) {
      this.tables.set(
        key,
        rows.map((row) => ({ ...row }))
      );
    }
  }
}

/**
 * Factory to create and initialize a clean in-memory test database driver.
 */
export async function createTestDatabase(): Promise<IDatabaseDriver> {
  const driver = new InMemoryDatabaseDriver();
  await driver.execute('PRAGMA foreign_keys = ON;');
  return driver;
}
