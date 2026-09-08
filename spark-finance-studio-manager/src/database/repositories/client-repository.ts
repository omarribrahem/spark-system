/**
 * ClientRepository: Persistence for Client Register with Dynamic Fields & Filter AST
 * Spark Finance & Studio Manager
 */

import { IDatabaseDriver } from '../driver/types';
import { assertNonEmptyString } from '../../domain/rules/invariants';
import {
  ClientType,
  PreferredContact,
  CustomFieldDefinition,
} from '../../domain/models/client-custom-fields';
import {
  FilterAST,
  compileFilterAstToSql,
} from '../../domain/models/client-filter-ast';
import { ClientCustomFieldRepository } from './client-custom-field-repository';

export interface ClientRecord {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  secondary_phone: string | null;
  notes: string | null;
  active: number; // 1 = active, 0 = archived
  client_type: ClientType | null;
  contact_name: string | null;
  contact_role: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  preferred_contact: PreferredContact | null;
  created_at: string;
  updated_at: string;
}

export interface ClientWithFinancials extends ClientRecord {
  outstandingDuesPiasters: number;
  creditPiasters: number;
  activeContractsCount: number;
}

export interface CreateClientInput {
  id?: string;
  name: string;
  companyName?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;
  notes?: string | null;
  active?: number;
  clientType?: ClientType | null;
  contactName?: string | null;
  contactRole?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  preferredContact?: PreferredContact | null;
}

export interface UpdateClientInput {
  name?: string;
  companyName?: string | null;
  phone?: string | null;
  secondaryPhone?: string | null;
  notes?: string | null;
  active?: number;
  clientType?: ClientType | null;
  contactName?: string | null;
  contactRole?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  city?: string | null;
  preferredContact?: PreferredContact | null;
}

export interface ClientFilter {
  searchQuery?: string;
  activeOnly?: boolean;
  archivedOnly?: boolean;
}

export class ClientRepository {
  private customFieldRepo: ClientCustomFieldRepository;

  constructor(private driver: IDatabaseDriver) {
    this.customFieldRepo = new ClientCustomFieldRepository(driver);
  }

  public async create(input: CreateClientInput, txDriver?: IDatabaseDriver): Promise<ClientRecord> {
    const runner = txDriver || this.driver;
    const id = input.id ?? crypto.randomUUID();
    const name = assertNonEmptyString(input.name, 'name');
    const now = new Date().toISOString();
    const active = input.active ?? 1;
    const clientType = input.clientType || 'individual';
    const preferredContact = input.preferredContact || 'phone';

    await runner.execute(
      `INSERT INTO clients (
        id, name, company_name, phone, secondary_phone, notes, active,
        client_type, contact_name, contact_role, whatsapp, email, city, preferred_contact,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id,
        name,
        input.companyName ?? null,
        input.phone ?? null,
        input.secondaryPhone ?? null,
        input.notes ?? null,
        active,
        clientType,
        input.contactName ?? null,
        input.contactRole ?? null,
        input.whatsapp ?? null,
        input.email ?? null,
        input.city ?? null,
        preferredContact,
        now,
        now,
      ]
    );

    const created = await this.getById(id, txDriver);
    if (!created) {
      throw new Error(`Failed to retrieve newly created client with id: ${id}`);
    }
    return created;
  }

  public async getById(id: string, txDriver?: IDatabaseDriver): Promise<ClientRecord | null> {
    const runner = txDriver || this.driver;
    const rows = await runner.query<ClientRecord>(
      `SELECT id, name, company_name, phone, secondary_phone, notes, active,
              client_type, contact_name, contact_role, whatsapp, email, city, preferred_contact,
              created_at, updated_at
       FROM clients WHERE id = ? LIMIT 1;`,
      [id]
    );
    return rows.length > 0 ? rows[0] : null;
  }

  public async update(
    id: string,
    updates: UpdateClientInput,
    txDriver?: IDatabaseDriver
  ): Promise<ClientRecord> {
    const runner = txDriver || this.driver;
    const existing = await this.getById(id, txDriver);
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
    if (updates.clientType !== undefined) {
      setClauses.push('client_type = ?');
      params.push(updates.clientType);
    }
    if (updates.contactName !== undefined) {
      setClauses.push('contact_name = ?');
      params.push(updates.contactName);
    }
    if (updates.contactRole !== undefined) {
      setClauses.push('contact_role = ?');
      params.push(updates.contactRole);
    }
    if (updates.whatsapp !== undefined) {
      setClauses.push('whatsapp = ?');
      params.push(updates.whatsapp);
    }
    if (updates.email !== undefined) {
      setClauses.push('email = ?');
      params.push(updates.email);
    }
    if (updates.city !== undefined) {
      setClauses.push('city = ?');
      params.push(updates.city);
    }
    if (updates.preferredContact !== undefined) {
      setClauses.push('preferred_contact = ?');
      params.push(updates.preferredContact);
    }

    if (setClauses.length === 0) {
      return existing;
    }

    setClauses.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await runner.execute(
      `UPDATE clients SET ${setClauses.join(', ')} WHERE id = ?;`,
      params
    );

    const updated = await this.getById(id, txDriver);
    return updated!;
  }

  public async archive(id: string): Promise<void> {
    await this.update(id, { active: 0 });
  }

  public async unarchive(id: string): Promise<void> {
    await this.update(id, { active: 1 });
  }

  /**
   * Transactional atomic client create/update with custom fields and complete rollback on any error.
   */
  public async saveClientWithCustomFields(
    input: (CreateClientInput & { id?: string }) | (UpdateClientInput & { id: string }),
    customValues?: Record<string, unknown>
  ): Promise<ClientRecord> {
    let savedClient: ClientRecord | null = null;

    await this.driver.transaction(async (tx) => {
      if (input.id) {
        const existing = await this.getById(input.id, tx);
        if (existing) {
          savedClient = await this.update(input.id, input, tx);
        } else {
          if (!input.name) {
            throw new Error('اسم العميل إلزامي عند إنشاء سجل جديد');
          }
          savedClient = await this.create(input as CreateClientInput, tx);
        }
      } else {
        if (!input.name) {
          throw new Error('اسم العميل إلزامي عند إنشاء سجل جديد');
        }
        savedClient = await this.create(input as CreateClientInput, tx);
      }

      if (customValues && Object.keys(customValues).length > 0 && savedClient) {
        await this.customFieldRepo.setValuesForClient(savedClient.id, customValues, tx);
      }
    });

    if (!savedClient) {
      throw new Error('Failed to save client transactionally');
    }

    return savedClient;
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
      conditions.push(
        '(name LIKE ? OR company_name LIKE ? OR phone LIKE ? OR contact_name LIKE ? OR city LIKE ?)'
      );
      params.push(q, q, q, q, q);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT id, name, company_name, phone, secondary_phone, notes, active,
                        client_type, contact_name, contact_role, whatsapp, email, city, preferred_contact,
                        created_at, updated_at
                 FROM clients ${whereClause} ORDER BY name ASC;`;

    return await this.driver.query<ClientRecord>(sql, params);
  }

  /**
   * Executes database-level search and Filter AST compilation, computing live financial balances.
   * Prevents N+1 by using subqueries in SQLite directly.
   */
  public async queryWithFilterAST(
    ast: FilterAST,
    customDefinitions: CustomFieldDefinition[],
    options?: {
      searchQuery?: string;
      activeTab?: 'all' | 'active' | 'archived' | 'with_dues';
    }
  ): Promise<ClientWithFinancials[]> {
    const whereConditions: string[] = [];
    const params: unknown[] = [];

    // 1. Quick Tabs
    if (options?.activeTab === 'active') {
      whereConditions.push('c.active = 1');
    } else if (options?.activeTab === 'archived') {
      whereConditions.push('c.active = 0');
    }

    // 2. Search Query (core fields + custom searchable fields)
    if (options?.searchQuery && options.searchQuery.trim().length > 0) {
      const q = `%${options.searchQuery.trim()}%`;
      const searchableCustomFieldIds = customDefinitions
        .filter((d) => d.searchable === 1 && d.active === 1)
        .map((d) => d.id);

      if (searchableCustomFieldIds.length > 0) {
        const placeholders = searchableCustomFieldIds.map(() => '?').join(', ');
        whereConditions.push(`(
          c.name LIKE ? OR c.company_name LIKE ? OR c.phone LIKE ? OR c.whatsapp LIKE ? OR c.contact_name LIKE ? OR c.city LIKE ?
          OR EXISTS (
            SELECT 1 FROM client_custom_field_values cfv
            WHERE cfv.client_id = c.id
              AND cfv.field_definition_id IN (${placeholders})
              AND cfv.text_value LIKE ?
          )
        )`);
        params.push(q, q, q, q, q, q, ...searchableCustomFieldIds, q);
      } else {
        whereConditions.push(
          '(c.name LIKE ? OR c.company_name LIKE ? OR c.phone LIKE ? OR c.whatsapp LIKE ? OR c.contact_name LIKE ? OR c.city LIKE ?)'
        );
        params.push(q, q, q, q, q, q);
      }
    }

    // 3. Compile Filter AST
    const compiled = compileFilterAstToSql(ast, customDefinitions);
    if (compiled.whereClause) {
      whereConditions.push(compiled.whereClause);
      params.push(...compiled.params);
    }

    // Tab "with_dues" check
    if (options?.activeTab === 'with_dues') {
      whereConditions.push(`(
        SELECT COALESCE(SUM(remaining), 0) FROM (
          SELECT (
            d.base_amount + COALESCE((SELECT SUM(amount) FROM marketing_extras me WHERE me.due_id = d.id), 0)
            - COALESCE(SUM(pa.amount), 0)
          ) AS remaining
          FROM marketing_monthly_dues d
          JOIN marketing_contracts mc ON d.contract_id = mc.id
          LEFT JOIN payment_allocations pa ON pa.target_id = d.id AND pa.target_type = 'marketing_due'
          WHERE mc.client_id = c.id
          GROUP BY d.id
        ) WHERE remaining > 0
      ) > 0`);
    }

    const whereSql = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Enriched query calculating financials and contract count in SQLite
    const querySql = `
      SELECT
        c.id, c.name, c.company_name, c.phone, c.secondary_phone, c.notes, c.active,
        c.client_type, c.contact_name, c.contact_role, c.whatsapp, c.email, c.city, c.preferred_contact,
        c.created_at, c.updated_at,
        COALESCE((
          SELECT SUM(remaining) FROM (
            SELECT (
              d.base_amount + COALESCE((SELECT SUM(amount) FROM marketing_extras me WHERE me.due_id = d.id), 0)
              - COALESCE(SUM(pa.amount), 0)
            ) AS remaining
            FROM marketing_monthly_dues d
            JOIN marketing_contracts mc ON d.contract_id = mc.id
            LEFT JOIN payment_allocations pa ON pa.target_id = d.id AND pa.target_type = 'marketing_due'
            WHERE mc.client_id = c.id
            GROUP BY d.id
          ) WHERE remaining > 0
        ), 0) AS outstandingDuesPiasters,
        COALESCE((
          SELECT MAX(0,
            COALESCE((SELECT SUM(amount) FROM payments WHERE client_id = c.id AND status = 'active'), 0)
            -
            COALESCE((
              SELECT SUM(pa.amount)
              FROM payment_allocations pa
              JOIN payments p ON pa.payment_id = p.id
              WHERE p.client_id = c.id AND p.status = 'active'
            ), 0)
          )
        ), 0) AS creditPiasters,
        (
          SELECT COUNT(*) FROM marketing_contracts mc WHERE mc.client_id = c.id AND mc.status = 'active'
        ) AS activeContractsCount
      FROM clients c
      ${whereSql}
      ORDER BY c.name ASC;
    `;

    return await this.driver.query<ClientWithFinancials>(querySql, params);
  }
}
