/**
 * UnifiedCustomFieldRepository:
 * Universal custom fields definitions, options, and values persistence
 * across all entity scopes (service, plan_template, sold_plan, contract, reel).
 */

import { IDatabaseDriver } from '../driver/types';
import {
  EntityScope,
  UnifiedFieldType,
  UnifiedFieldDefinition,
  UnifiedFieldOption,
  UnifiedFieldValue,
  validateUnifiedFieldKey,
} from '../../domain/models/unified-custom-fields';
import {
  assertNonEmptyString,
  DomainInvariantError,
} from '../../domain/rules/invariants';

export interface CreateUnifiedFieldDefinitionInput {
  entityScope: EntityScope;
  fieldKey: string;
  label: string;
  fieldType: UnifiedFieldType;
  required?: boolean;
  defaultValue?: string | null;
  sortOrder?: number;
  showInForm?: boolean;
  showInTable?: boolean;
  filterable?: boolean;
  options?: Array<{ valueKey: string; label: string }>;
}

export class UnifiedCustomFieldRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async createDefinition(
    input: CreateUnifiedFieldDefinitionInput
  ): Promise<UnifiedFieldDefinition> {
    validateUnifiedFieldKey(input.fieldKey);
    assertNonEmptyString(input.label, 'label');

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    return await this.driver.transaction(async (tx) => {
      // Check duplicate
      const dup = await tx.query<{ id: string }>(
        `SELECT id FROM app_custom_field_definitions WHERE entity_scope = ? AND field_key = ? LIMIT 1;`,
        [input.entityScope, input.fieldKey]
      );
      if (dup.length > 0) {
        throw new DomainInvariantError(
          `الحقل المخصص "${input.fieldKey}" موجود بالفعل في هذا النطاق`
        );
      }

      await tx.execute(
        `INSERT INTO app_custom_field_definitions (
          id, entity_scope, field_key, label, field_type, required, default_value,
          sort_order, active, show_in_form, show_in_table, filterable, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?);`,
        [
          id,
          input.entityScope,
          input.fieldKey.trim().toLowerCase(),
          input.label.trim(),
          input.fieldType,
          input.required ? 1 : 0,
          input.defaultValue?.trim() ?? null,
          input.sortOrder ?? 0,
          input.showInForm ?? 1,
          input.showInTable ?? 1,
          input.filterable ?? 1,
          now,
          now,
        ]
      );

      if (input.options && input.options.length > 0) {
        for (let i = 0; i < input.options.length; i++) {
          const opt = input.options[i];
          await tx.execute(
            `INSERT INTO app_custom_field_options (
              id, field_definition_id, value_key, label, active, sort_order, created_at
            ) VALUES (?, ?, ?, ?, 1, ?, ?);`,
            [
              crypto.randomUUID(),
              id,
              opt.valueKey.trim().toLowerCase(),
              opt.label.trim(),
              i * 10,
              now,
            ]
          );
        }
      }

      return (await this.getDefinitionById(id, tx))!;
    });
  }

  public async getDefinitionById(
    id: string,
    driver: IDatabaseDriver = this.driver
  ): Promise<UnifiedFieldDefinition | null> {
    const rows = await driver.query<UnifiedFieldDefinition>(
      `SELECT * FROM app_custom_field_definitions WHERE id = ? LIMIT 1;`,
      [id]
    );
    if (rows.length === 0) return null;

    const options = await driver.query<UnifiedFieldOption>(
      `SELECT * FROM app_custom_field_options WHERE field_definition_id = ? AND active = 1 ORDER BY sort_order ASC;`,
      [id]
    );

    return { ...rows[0], options };
  }

  public async listDefinitions(
    scope: EntityScope,
    activeOnly = true
  ): Promise<UnifiedFieldDefinition[]> {
    const where = activeOnly
      ? 'WHERE entity_scope = ? AND active = 1'
      : 'WHERE entity_scope = ?';
    const rows = await this.driver.query<UnifiedFieldDefinition>(
      `SELECT * FROM app_custom_field_definitions ${where} ORDER BY sort_order ASC, created_at ASC;`,
      [scope]
    );

    const result: UnifiedFieldDefinition[] = [];
    for (const def of rows) {
      const options = await this.driver.query<UnifiedFieldOption>(
        `SELECT * FROM app_custom_field_options WHERE field_definition_id = ? AND active = 1 ORDER BY sort_order ASC;`,
        [def.id]
      );
      result.push({ ...def, options });
    }
    return result;
  }

  public async deactivateDefinition(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.driver.execute(
      `UPDATE app_custom_field_definitions SET active = 0, updated_at = ? WHERE id = ?;`,
      [now, id]
    );
  }

  // -------------------------------------------------------------
  // Values Persistence
  // -------------------------------------------------------------

  public async setValuesForEntity(
    scope: EntityScope,
    entityId: string,
    values: Record<string, unknown>,
    driver: IDatabaseDriver = this.driver
  ): Promise<void> {
    const defs = await this.listDefinitions(scope, false);
    const defMap = new Map(defs.map((d) => [d.field_key, d]));
    const now = new Date().toISOString();

    for (const [key, val] of Object.entries(values)) {
      const def = defMap.get(key);
      if (!def) continue;

      if (val === null || val === undefined || val === '') {
        await driver.execute(
          `DELETE FROM app_custom_field_values WHERE entity_scope = ? AND entity_id = ? AND field_definition_id = ?;`,
          [scope, entityId, def.id]
        );
        continue;
      }

      if (def.field_type === 'multi_select' && Array.isArray(val)) {
        await driver.execute(
          `DELETE FROM app_custom_field_multiselect_values WHERE entity_scope = ? AND entity_id = ? AND field_definition_id = ?;`,
          [scope, entityId, def.id]
        );
        for (const optId of val) {
          await driver.execute(
            `INSERT INTO app_custom_field_multiselect_values (entity_scope, entity_id, field_definition_id, option_id, created_at)
             VALUES (?, ?, ?, ?, ?);`,
            [scope, entityId, def.id, String(optId), now]
          );
        }
      } else {
        let textVal: string | null = null;
        let numVal: number | null = null;
        let dateVal: string | null = null;
        let boolVal: number | null = null;
        let optId: string | null = null;

        switch (def.field_type) {
          case 'integer':
          case 'money_piasters':
            numVal = Number(val);
            break;
          case 'date':
          case 'time':
            dateVal = String(val);
            break;
          case 'checkbox':
            boolVal = val ? 1 : 0;
            break;
          case 'single_select':
            optId = String(val);
            break;
          default:
            textVal = String(val);
            break;
        }

        const id = crypto.randomUUID();
        await driver.execute(
          `INSERT INTO app_custom_field_values (
            id, entity_scope, entity_id, field_definition_id, text_value, number_value,
            date_value, boolean_value, option_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(entity_scope, entity_id, field_definition_id) DO UPDATE SET
            text_value = excluded.text_value,
            number_value = excluded.number_value,
            date_value = excluded.date_value,
            boolean_value = excluded.boolean_value,
            option_id = excluded.option_id,
            updated_at = excluded.updated_at;`,
          [id, scope, entityId, def.id, textVal, numVal, dateVal, boolVal, optId, now, now]
        );
      }
    }
  }

  public async getValuesForEntity(
    scope: EntityScope,
    entityId: string
  ): Promise<Record<string, UnifiedFieldValue>> {
    const rows = await this.driver.query<UnifiedFieldValue>(
      `SELECT * FROM app_custom_field_values WHERE entity_scope = ? AND entity_id = ?;`,
      [scope, entityId]
    );

    const multiRows = await this.driver.query<{ field_definition_id: string; option_id: string }>(
      `SELECT field_definition_id, option_id FROM app_custom_field_multiselect_values
       WHERE entity_scope = ? AND entity_id = ?;`,
      [scope, entityId]
    );

    const map: Record<string, UnifiedFieldValue> = {};
    for (const r of rows) {
      map[r.field_definition_id] = r;
    }

    for (const m of multiRows) {
      if (!map[m.field_definition_id]) {
        map[m.field_definition_id] = {
          id: '',
          entity_scope: scope,
          entity_id: entityId,
          field_definition_id: m.field_definition_id,
          text_value: null,
          number_value: null,
          date_value: null,
          boolean_value: null,
          option_id: null,
          created_at: '',
          updated_at: '',
          multi_select_option_ids: [],
        };
      }
      if (!map[m.field_definition_id].multi_select_option_ids) {
        map[m.field_definition_id].multi_select_option_ids = [];
      }
      map[m.field_definition_id].multi_select_option_ids!.push(m.option_id);
    }

    return map;
  }
}
