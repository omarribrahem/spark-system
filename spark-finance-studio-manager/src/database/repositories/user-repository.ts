import { IDatabaseDriver } from '../driver/types';
import { UserRecord, UserRole } from '../../domain/models/user-permissions';
import { assertNonEmptyString } from '../../domain/rules/invariants';

export class UserRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async listUsers(activeOnly = false): Promise<UserRecord[]> {
    const where = activeOnly ? 'WHERE active = 1' : '';
    return await this.driver.query<UserRecord>(
      `SELECT * FROM users ${where} ORDER BY created_at ASC;`
    );
  }

  public async getUserById(id: string): Promise<UserRecord | null> {
    const rows = await this.driver.query<UserRecord>(
      `SELECT * FROM users WHERE id = ? LIMIT 1;`,
      [id]
    );
    return rows[0] ?? null;
  }

  public async createUser(input: {
    name: string;
    email: string;
    role: UserRole;
  }): Promise<UserRecord> {
    assertNonEmptyString(input.name, 'name');
    assertNonEmptyString(input.email, 'email');

    const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    await this.driver.execute(
      `INSERT INTO users (id, name, email, role, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?);`,
      [id, input.name.trim(), input.email.trim().toLowerCase(), input.role, now, now]
    );

    return (await this.getUserById(id))!;
  }

  public async updateUser(
    id: string,
    updates: Partial<{ name: string; email: string; role: UserRole; active: number }>
  ): Promise<UserRecord> {
    const existing = await this.getUserById(id);
    if (!existing) throw new Error(`User ${id} not found`);

    const fields: string[] = ['updated_at = ?'];
    const params: unknown[] = [new Date().toISOString()];

    if (updates.name !== undefined) {
      assertNonEmptyString(updates.name, 'name');
      fields.push('name = ?');
      params.push(updates.name.trim());
    }
    if (updates.email !== undefined) {
      assertNonEmptyString(updates.email, 'email');
      fields.push('email = ?');
      params.push(updates.email.trim().toLowerCase());
    }
    if (updates.role !== undefined) {
      fields.push('role = ?');
      params.push(updates.role);
    }
    if (updates.active !== undefined) {
      fields.push('active = ?');
      params.push(updates.active);
    }

    params.push(id);
    await this.driver.execute(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?;`,
      params
    );

    return (await this.getUserById(id))!;
  }
}
