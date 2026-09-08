/**
 * ClientCustomFieldRepository: Persistence for custom field definitions, options, and client values.
 * Spark Finance & Studio Manager
 */

import { IDatabaseDriver } from '../driver/types';
import {
  CustomFieldDefinition,
  CustomFieldOption,
  CustomFieldType,
  CustomFieldValue,
  validateFieldKey,
} from '../../domain/models/client-custom-fields';
import { DomainInvariantError, assertNonEmptyString } from '../../domain/rules/invariants';

export interface CreateFieldDefinitionInput {
  id?: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  section?: string;
  helpText?: string | null;
  required?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  sortOrder?: number;
  options?: { valueKey: string; label: string; sortOrder?: number }[];
}

export interface UpdateFieldDefinitionInput {
  label?: string;
  fieldType?: CustomFieldType;
  section?: string;
  helpText?: string | null;
  required?: boolean;
  searchable?: boolean;
  filterable?: boolean;
  active?: number;
  sortOrder?: number;
  options?: { id?: string; valueKey: string; label: string; active?: number; sortOrder?: number }[];
}

export class ClientCustomFieldRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async createDefinition(input: CreateFieldDefinitionInput): Promise<CustomFieldDefinition> {
    const id = input.id ?? crypto.randomUUID();
    const fieldKey = validateFieldKey(input.fieldKey);
    const label = assertNonEmptyString(input.label, 'label');
    const now = new Date().toISOString();
    const section = input.section?.trim() || 'general';
    const required = input.required ? 1 : 0;
    const searchable = input.searchable ? 1 : 0;
    const filterable = input.filterable !== false ? 1 : 0;
    const sortOrder = input.sortOrder ?? 0;

    // Check key collision
    const existing = await this.getDefinitionByKey(fieldKey);
    if (existing) {
      throw new DomainInvariantError(`الحقل المخصص بالرمز '${fieldKey}' موجود مسبقاً`);
    }

    await this.driver.transaction(async (tx) => {
      await tx.execute(
        `INSERT INTO client_custom_field_definitions (
          id, field_key, label, field_type, section, help_text, required, searchable, filterable, active, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?);`,
        [
          id,
          fieldKey,
          label,
          input.fieldType,
          section,
          input.helpText ?? null,
          required,
          searchable,
          filterable,
          sortOrder,
          now,
          now,
        ]
      );

      // Add options if select type
      if (
        (input.fieldType === 'single_select' || input.fieldType === 'multi_select') &&
        input.options &&
        input.options.length > 0
      ) {
        for (let i = 0; i < input.options.length; i++) {
          const opt = input.options[i];
          const optId = crypto.randomUUID();
          await tx.execute(
            `INSERT INTO client_custom_field_options (
              id, field_definition_id, value_key, label, active, sort_order
            ) VALUES (?, ?, ?, ?, 1, ?);`,
            [optId, id, opt.valueKey.trim().toLowerCase(), opt.label.trim(), opt.sortOrder ?? i]
          );
        }
      }
    });

    const created = await this.getDefinitionById(id);
    if (!created) {
      throw new Error(`Failed to retrieve newly created custom field definition: ${id}`);
    }
    return created;
  }

  public async getDefinitionById(id: string): Promise<CustomFieldDefinition | null> {
    const rows = await this.driver.query<CustomFieldDefinition>(
      `SELECT * FROM client_custom_field_definitions WHERE id = ? LIMIT 1;`,
      [id]
    );
    if (rows.length === 0) return null;
    const def = rows[0];
    def.options = await this.getOptionsForDefinition(def.id);
    return def;
  }

  public async getDefinitionByKey(key: string): Promise<CustomFieldDefinition | null> {
    const rows = await this.driver.query<CustomFieldDefinition>(
      `SELECT * FROM client_custom_field_definitions WHERE field_key = ? LIMIT 1;`,
      [key.trim().toLowerCase()]
    );
    if (rows.length === 0) return null;
    const def = rows[0];
    def.options = await this.getOptionsForDefinition(def.id);
    return def;
  }

  public async listDefinitions(options?: {
    activeOnly?: boolean;
    filterableOnly?: boolean;
    searchableOnly?: boolean;
  }): Promise<CustomFieldDefinition[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.activeOnly) {
      conditions.push('active = 1');
    }
    if (options?.filterableOnly) {
      conditions.push('filterable = 1');
    }
    if (options?.searchableOnly) {
      conditions.push('searchable = 1');
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM client_custom_field_definitions ${whereClause} ORDER BY sort_order ASC, created_at ASC;`;
    const rows = await this.driver.query<CustomFieldDefinition>(sql, params);

    for (const def of rows) {
      if (def.field_type === 'single_select' || def.field_type === 'multi_select') {
        def.options = await this.getOptionsForDefinition(def.id);
      }
    }

    return rows;
  }

  public async getOptionsForDefinition(
    definitionId: string,
    activeOnly = false
  ): Promise<CustomFieldOption[]> {
    const sql = activeOnly
      ? `SELECT * FROM client_custom_field_options WHERE field_definition_id = ? AND active = 1 ORDER BY sort_order ASC;`
      : `SELECT * FROM client_custom_field_options WHERE field_definition_id = ? ORDER BY sort_order ASC;`;
    return await this.driver.query<CustomFieldOption>(sql, [definitionId]);
  }

  public async updateDefinition(
    id: string,
    updates: UpdateFieldDefinitionInput
  ): Promise<CustomFieldDefinition> {
    const existing = await this.getDefinitionById(id);
    if (!existing) {
      throw new Error(`Custom field definition with id ${id} not found`);
    }

    // Invariant: Prevent altering field type if values already exist
    if (updates.fieldType !== undefined && updates.fieldType !== existing.field_type) {
      const singleCountRows = await this.driver.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM client_custom_field_values WHERE field_definition_id = ?;`,
        [id]
      );
      const multiCountRows = await this.driver.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM client_custom_field_multiselect_values WHERE field_definition_id = ?;`,
        [id]
      );
      const totalValues = (singleCountRows[0]?.count ?? 0) + (multiCountRows[0]?.count ?? 0);
      if (totalValues > 0) {
        throw new DomainInvariantError(
          `لا يمكن تغيير نوع الحقل '${existing.label}' لوجود بيانات مسجلة به بالفعل لعدد ${totalValues} عميل. يُنصح بإنشاء حقل جديد أو تعطيل الحقل الحالي.`
        );
      }
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (updates.label !== undefined) {
      setClauses.push('label = ?');
      params.push(assertNonEmptyString(updates.label, 'label'));
    }
    if (updates.fieldType !== undefined) {
      setClauses.push('field_type = ?');
      params.push(updates.fieldType);
    }
    if (updates.section !== undefined) {
      setClauses.push('section = ?');
      params.push(updates.section.trim() || 'general');
    }
    if (updates.helpText !== undefined) {
      setClauses.push('help_text = ?');
      params.push(updates.helpText);
    }
    if (updates.required !== undefined) {
      setClauses.push('required = ?');
      params.push(updates.required ? 1 : 0);
    }
    if (updates.searchable !== undefined) {
      setClauses.push('searchable = ?');
      params.push(updates.searchable ? 1 : 0);
    }
    if (updates.filterable !== undefined) {
      setClauses.push('filterable = ?');
      params.push(updates.filterable ? 1 : 0);
    }
    if (updates.active !== undefined) {
      setClauses.push('active = ?');
      params.push(updates.active === 0 ? 0 : 1);
    }
    if (updates.sortOrder !== undefined) {
      setClauses.push('sort_order = ?');
      params.push(updates.sortOrder);
    }

    await this.driver.transaction(async (tx) => {
      if (setClauses.length > 0) {
        setClauses.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(id);
        await tx.execute(
          `UPDATE client_custom_field_definitions SET ${setClauses.join(', ')} WHERE id = ?;`,
          params
        );
      }

      // Handle options update if present
      if (updates.options) {
        for (const opt of updates.options) {
          if (opt.id) {
            await tx.execute(
              `UPDATE client_custom_field_options SET label = ?, active = COALESCE(?, active), sort_order = COALESCE(?, sort_order) WHERE id = ?;`,
              [opt.label.trim(), opt.active, opt.sortOrder, opt.id]
            );
          } else {
            const newOptId = crypto.randomUUID();
            await tx.execute(
              `INSERT OR IGNORE INTO client_custom_field_options (id, field_definition_id, value_key, label, active, sort_order)
               VALUES (?, ?, ?, ?, 1, ?);`,
              [newOptId, id, opt.valueKey.trim().toLowerCase(), opt.label.trim(), opt.sortOrder ?? 0]
            );
          }
        }
      }
    });

    return (await this.getDefinitionById(id))!;
  }

  public async deactivateDefinition(id: string): Promise<void> {
    await this.updateDefinition(id, { active: 0 });
  }

  public async reactivateDefinition(id: string): Promise<void> {
    await this.updateDefinition(id, { active: 1 });
  }

  /**
   * Hard deletion is prohibited to protect historical client records.
   */
  public async deleteDefinition(id: string): Promise<void> {
    const singleCountRows = await this.driver.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM client_custom_field_values WHERE field_definition_id = ?;`,
      [id]
    );
    const multiCountRows = await this.driver.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM client_custom_field_multiselect_values WHERE field_definition_id = ?;`,
      [id]
    );
    const totalValues = (singleCountRows[0]?.count ?? 0) + (multiCountRows[0]?.count ?? 0);
    if (totalValues > 0) {
      throw new DomainInvariantError(
        `الحذف النهائي محظور للحفاظ على السجل التاريخي. يمكنك تعطيل الحقل بدلاً من ذلك.`
      );
    }
    // If absolutely zero values exist, allow deletion of definition and its options
    await this.driver.transaction(async (tx) => {
      await tx.execute(`DELETE FROM client_custom_field_options WHERE field_definition_id = ?;`, [id]);
      await tx.execute(`DELETE FROM client_custom_field_definitions WHERE id = ?;`, [id]);
    });
  }

  /**
   * Retrieves all custom field values for a client.
   */
  public async getValuesForClient(clientId: string): Promise<Record<string, CustomFieldValue>> {
    const singleRows = await this.driver.query<CustomFieldValue>(
      `SELECT * FROM client_custom_field_values WHERE client_id = ?;`,
      [clientId]
    );

    const multiRows = await this.driver.query<{ field_definition_id: string; option_id: string }>(
      `SELECT field_definition_id, option_id FROM client_custom_field_multiselect_values WHERE client_id = ?;`,
      [clientId]
    );

    const results: Record<string, CustomFieldValue> = {};

    for (const row of singleRows) {
      results[row.field_definition_id] = { ...row };
    }

    for (const m of multiRows) {
      if (!results[m.field_definition_id]) {
        results[m.field_definition_id] = {
          client_id: clientId,
          field_definition_id: m.field_definition_id,
          text_value: null,
          number_value: null,
          date_value: null,
          boolean_value: null,
          multi_select_option_ids: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      if (!results[m.field_definition_id].multi_select_option_ids) {
        results[m.field_definition_id].multi_select_option_ids = [];
      }
      results[m.field_definition_id].multi_select_option_ids!.push(m.option_id);
    }

    return results;
  }

  /**
   * Sets custom field values for a client within a transaction.
   */
  public async setValuesForClient(
    clientId: string,
    values: Record<string, unknown>,
    txDriver?: IDatabaseDriver
  ): Promise<void> {
    const runner = txDriver || this.driver;
    const now = new Date().toISOString();

    const defs = await this.listDefinitions();
    const defsById = new Map(defs.map((d) => [d.id, d]));
    const defsByKey = new Map(defs.map((d) => [d.field_key, d]));

    for (const [keyOrId, rawValue] of Object.entries(values)) {
      const def = defsById.get(keyOrId) || defsByKey.get(keyOrId);
      if (!def) continue;

      const fieldDefId = def.id;

      if (def.field_type === 'multi_select') {
        // Clear existing multiselect options for this field
        await runner.execute(
          `DELETE FROM client_custom_field_multiselect_values WHERE client_id = ? AND field_definition_id = ?;`,
          [clientId, fieldDefId]
        );

        const optionIds: string[] = Array.isArray(rawValue) ? (rawValue as string[]) : [];
        for (const optId of optionIds) {
          if (!optId) continue;
          await runner.execute(
            `INSERT INTO client_custom_field_multiselect_values (client_id, field_definition_id, option_id)
             VALUES (?, ?, ?);`,
            [clientId, fieldDefId, optId]
          );
        }
        continue;
      }

      // Single-value fields
      if (rawValue === null || rawValue === undefined || rawValue === '') {
        // Delete if empty
        await runner.execute(
          `DELETE FROM client_custom_field_values WHERE client_id = ? AND field_definition_id = ?;`,
          [clientId, fieldDefId]
        );
        continue;
      }

      let textVal: string | null = null;
      let numberVal: number | null = null;
      let dateVal: string | null = null;
      let boolVal: number | null = null;

      if (def.field_type === 'integer') {
        numberVal = Math.round(Number(rawValue));
      } else if (def.field_type === 'money_piasters') {
        // rawValue is in piasters or integer
        numberVal = Math.round(Number(rawValue));
      } else if (def.field_type === 'date') {
        dateVal = String(rawValue).trim();
      } else if (def.field_type === 'boolean') {
        boolVal = rawValue ? 1 : 0;
      } else {
        textVal = String(rawValue).trim();
      }

      await runner.execute(
        `INSERT INTO client_custom_field_values (
          client_id, field_definition_id, text_value, number_value, date_value, boolean_value, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(client_id, field_definition_id) DO UPDATE SET
          text_value = excluded.text_value,
          number_value = excluded.number_value,
          date_value = excluded.date_value,
          boolean_value = excluded.boolean_value,
          updated_at = excluded.updated_at;`,
        [clientId, fieldDefId, textVal, numberVal, dateVal, boolVal, now, now]
      );
    }
  }
}
