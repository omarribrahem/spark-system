/**
 * ClientFilterPresetRepository: Persistence for user-saved filter presets.
 * Spark Finance & Studio Manager
 */

import { IDatabaseDriver } from '../driver/types';
import { FilterRule } from '../../domain/models/client-filter-ast';
import { assertNonEmptyString } from '../../domain/rules/invariants';

export interface ClientFilterPreset {
  id: string;
  name: string;
  rules_json: string;
  rules?: FilterRule[];
  schema_version: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export class ClientFilterPresetRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async create(name: string, rules: FilterRule[]): Promise<ClientFilterPreset> {
    const id = crypto.randomUUID();
    const cleanName = assertNonEmptyString(name, 'preset_name').trim();
    const now = new Date().toISOString();
    const rulesJson = JSON.stringify(rules);

    await this.driver.execute(
      `INSERT INTO client_filter_presets (id, name, rules_json, schema_version, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 1, 0, ?, ?);`,
      [id, cleanName, rulesJson, now, now]
    );

    const created = await this.getById(id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created filter preset with id ${id}`);
    }
    return created;
  }

  public async getById(id: string): Promise<ClientFilterPreset | null> {
    const rows = await this.driver.query<ClientFilterPreset>(
      `SELECT * FROM client_filter_presets WHERE id = ? LIMIT 1;`,
      [id]
    );
    if (rows.length === 0) return null;
    const preset = rows[0];
    try {
      preset.rules = JSON.parse(preset.rules_json) as FilterRule[];
    } catch {
      preset.rules = [];
    }
    return preset;
  }

  public async list(): Promise<ClientFilterPreset[]> {
    const rows = await this.driver.query<ClientFilterPreset>(
      `SELECT * FROM client_filter_presets ORDER BY sort_order ASC, created_at DESC;`
    );
    for (const preset of rows) {
      try {
        preset.rules = JSON.parse(preset.rules_json) as FilterRule[];
      } catch {
        preset.rules = [];
      }
    }
    return rows;
  }

  public async update(
    id: string,
    updates: { name?: string; rules?: FilterRule[]; sortOrder?: number }
  ): Promise<ClientFilterPreset> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error(`Filter preset with id ${id} not found`);
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.name !== undefined) {
      setClauses.push('name = ?');
      params.push(assertNonEmptyString(updates.name, 'preset_name').trim());
    }
    if (updates.rules !== undefined) {
      setClauses.push('rules_json = ?');
      params.push(JSON.stringify(updates.rules));
    }
    if (updates.sortOrder !== undefined) {
      setClauses.push('sort_order = ?');
      params.push(updates.sortOrder);
    }

    if (setClauses.length > 0) {
      setClauses.push('updated_at = ?');
      params.push(new Date().toISOString());
      params.push(id);

      await this.driver.execute(
        `UPDATE client_filter_presets SET ${setClauses.join(', ')} WHERE id = ?;`,
        params
      );
    }

    return (await this.getById(id))!;
  }

  public async delete(id: string): Promise<void> {
    await this.driver.execute(`DELETE FROM client_filter_presets WHERE id = ?;`, [id]);
  }
}
