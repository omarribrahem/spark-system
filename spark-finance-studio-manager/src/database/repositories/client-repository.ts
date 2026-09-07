/**
 * ClientRepository: Persistence for Client Register
 */

import { IDatabaseDriver } from '../driver/types';
import { assertNonEmptyString } from '../../domain/rules/invariants';

export interface ClientRecord {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  secondary_phone: string | null;
  notes: string | null;
  active: number; // 1 = active, 0 = archived
  created_at: string;
  updated_at: string;
}

export interface CreateClientInput {
  id?: string;
  name: string;
  companyName?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;
  notes?: string | null;
  active?: number;
}

export interface UpdateClientInput {
  name?: string;
  companyName?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;
  notes?: string | null;
  active?: number;
}

export interface ClientFilter {
  searchQuery?: string;
  activeOnly?: boolean;
  archivedOnly?: boolean;
}

export class ClientRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async create(input: CreateClientInput): Promise<ClientRecord> {
    const id = input.id ?? crypto.randomUUID();
    const name = assertNonEmptyString(input.name, 'name');
    const now = new Date().toISOString();
    const active = input.active ?? 1;

    await this.driver.execute(
      `INSERT INTO clients (id, name, company_name, phone, secondary_phone, notes, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        name,
        input.companyName ?? null,
        input.phone ?? null,
        input.secondaryPhone ?? null,
        input.notes ?? null,
        active,
        now,
        now,
      ]
    );

    const created = await this.getById(id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created client with id: ${id}`);
    }
    return created;
  }

  public async getById(id: string): Promise<ClientRecord | null> {
    const rows = await this.driver.query<ClientRecord>(
      `SELECT id, name, company_name, phone, secondary_phone, notes, active, created_at, updated_at
       FROM clients WHERE id = ? LIMIT 1;`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  public async update(id: string, updates: UpdateClientInput): Promise<ClientRecord> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Client with id ${id} not found`);
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      params.push(assertNonEmptyString(updates.name, 'name'));
    }
    if (updates.companyName !== undefined) {
      setClauses.push('company_name = ?');
      params.push(updates.companyName);
    }
    if (updates.phone !== undefined) {
      setClauses.push('phone = ?');
      params.push(updates.phone);
    }
    if (updates.secondaryPhone !== undefined) {
      setClauses.push('secondary_phone = ?');
      params.push(updates.secondaryPhone);
    }
    if (updates.notes !== undefined) {
      setClauses.push('notes = ?');
      params.push(updates.notes);
    }
    if (updates.active !== undefined) {
      setClauses.push('active = ?');
      params.push(updates.active);
    }

    if (setClauses.length === 0) {
      return existing;
    }

    // Explicitly update updated_at timestamp to avoid trigger reliance
    setClauses.push('updated_at = ?');
    params.push(new Date().toISOString());

    params.push(id);

    await this.driver.execute(
      `UPDATE clients SET ${setClauses.join(', ')} WHERE id = ?;`,
      params
    );

    const updated = await this.getById(id);
    return updated!;
  }

  public async archive(id: string): Promise<void> {
    await this.update(id, { active: 0 });
  }

  public async unarchive(id: string): Promise<void> {
    await this.update(id, { active: 1 });
  }

  public async list(filter?: ClientFilter): Promise<ClientRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.activeOnly) {
      conditions.push('active = 1');
    } else if (filter?.archivedOnly) {
      conditions.push('active = 0');
    }

    if (filter?.searchQuery && filter.searchQuery.trim().length > 0) {
      const q = `%${filter.searchQuery.trim()}%`;
      conditions.push('(name LIKE ? OR company_name LIKE ? OR phone LIKE ?)');
      params.push(q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT id, name, company_name, phone, secondary_phone, notes, active, created_at, updated_at
                 FROM clients ${whereClause} ORDER BY name ASC;`;

    return await this.driver.query<ClientRecord>(sql, params);
  }
}
