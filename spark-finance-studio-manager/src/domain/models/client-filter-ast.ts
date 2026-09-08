/**
 * Client Filter AST & Query Compiler
 * Spark Finance & Studio Manager
 * Invariants: Typed Filter AST, Allowlist, Parameter Binding (No SQL Injection), No React-side memory filtering.
 */

import { CustomFieldDefinition, CustomFieldType } from './client-custom-fields';

export type FilterOperator =
  | 'contains'
  | 'equals'
  | 'is_empty'
  | 'is_not_empty'
  | 'is'
  | 'is_not'
  | 'contains_any'
  | 'contains_all'
  | 'greater_than'
  | 'less_than'
  | 'between'
  | 'on'
  | 'before'
  | 'after'
  | 'is_true'
  | 'is_false'
  | 'has_service'
  | 'does_not_have_service';

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value?: unknown;
}

export interface FilterAST {
  conjunction: 'AND';
  rules: FilterRule[];
}

export interface FilterFieldMeta {
  key: string;
  label: string;
  category: 'core' | 'custom';
  type: CustomFieldType | 'service' | 'status';
  operators: FilterOperator[];
  options?: { value: string; label: string }[];
  section?: string;
}

export const OPERATORS_BY_TYPE: Record<string, { value: FilterOperator; label: string }[]> = {
  text: [
    { value: 'contains', label: 'يحتوي على' },
    { value: 'equals', label: 'يساوي تماماً' },
    { value: 'is_empty', label: 'فارغ' },
    { value: 'is_not_empty', label: 'غير فارغ' },
  ],
  single_select: [
    { value: 'is', label: 'هو' },
    { value: 'is_not', label: 'ليس' },
    { value: 'is_empty', label: 'فارغ' },
  ],
  multi_select: [
    { value: 'contains_any', label: 'يحتوي أي من' },
    { value: 'contains_all', label: 'يحتوي كل من' },
    { value: 'is_empty', label: 'فارغ' },
  ],
  number: [
    { value: 'equals', label: 'يساوي' },
    { value: 'greater_than', label: 'أكبر من' },
    { value: 'less_than', label: 'أصغر من' },
    { value: 'between', label: 'بين' },
    { value: 'is_empty', label: 'فارغ' },
  ],
  date: [
    { value: 'on', label: 'في تاريخ' },
    { value: 'before', label: 'قبل تاريخ' },
    { value: 'after', label: 'بعد تاريخ' },
    { value: 'between', label: 'بين تاريخين' },
    { value: 'is_empty', label: 'فارغ' },
  ],
  boolean: [
    { value: 'is_true', label: 'نعم / مفعّل' },
    { value: 'is_false', label: 'لا / معطّل' },
    { value: 'is_empty', label: 'غير محدد' },
  ],
  service: [
    { value: 'has_service', label: 'مشترك بالخدمة' },
    { value: 'does_not_have_service', label: 'غير مشترك بالخدمة' },
  ],
};

export const CORE_FILTERABLE_FIELDS: FilterFieldMeta[] = [
  {
    key: 'client_type',
    label: 'نوع العميل',
    category: 'core',
    type: 'single_select',
    operators: ['is', 'is_not', 'is_empty'],
    options: [
      { value: 'individual', label: 'فرد' },
      { value: 'teacher', label: 'معلم / محاضر' },
      { value: 'creator', label: 'صانع محتوى' },
      { value: 'company', label: 'شركة / مؤسسة' },
      { value: 'educational_entity', label: 'جهة تعليمية / سنتر' },
      { value: 'other', label: 'أخرى' },
    ],
  },
  {
    key: 'active',
    label: 'حالة العميل (النشاط)',
    category: 'core',
    type: 'status',
    operators: ['is', 'is_not'],
    options: [
      { value: '1', label: 'نشط' },
      { value: '0', label: 'مؤرشف' },
    ],
  },
  {
    key: 'city',
    label: 'المدينة / المحافظة',
    category: 'core',
    type: 'short_text',
    operators: ['contains', 'equals', 'is_empty', 'is_not_empty'],
  },
  {
    key: 'preferred_contact',
    label: 'طريقة التواصل المفضلة',
    category: 'core',
    type: 'single_select',
    operators: ['is', 'is_not', 'is_empty'],
    options: [
      { value: 'phone', label: 'اتصال هاتفي' },
      { value: 'whatsapp', label: 'واتساب' },
      { value: 'email', label: 'بريد إلكتروني' },
    ],
  },
  {
    key: 'actual_service',
    label: 'الخدمة الفعلية',
    category: 'core',
    type: 'service',
    operators: ['has_service', 'does_not_have_service'],
    options: [
      { value: 'marketing', label: 'تسويق شهري (عقود)' },
      { value: 'subscription', label: 'اشتراكات دورية' },
      { value: 'website', label: 'مشاريع مواقع إلكترونية' },
      { value: 'packages', label: 'باقات ساعات وريلز' },
      { value: 'studio', label: 'حجوزات استوديو' },
    ],
  },
  {
    key: 'outstanding_dues',
    label: 'مستحقات مالية متأخرة (جنيه)',
    category: 'core',
    type: 'money_piasters',
    operators: ['equals', 'greater_than', 'less_than', 'between', 'is_empty'],
  },
  {
    key: 'credit',
    label: 'رصيد دائن غير موزع (جنيه)',
    category: 'core',
    type: 'money_piasters',
    operators: ['equals', 'greater_than', 'less_than', 'between', 'is_empty'],
  },
  {
    key: 'created_at',
    label: 'تاريخ الإضافة',
    category: 'core',
    type: 'date',
    operators: ['on', 'before', 'after', 'between', 'is_empty'],
  },
  {
    key: 'updated_at',
    label: 'تاريخ آخر تعديل',
    category: 'core',
    type: 'date',
    operators: ['on', 'before', 'after', 'between', 'is_empty'],
  },
];

export interface CompilationResult {
  whereClause: string;
  params: unknown[];
  skippedRules: { rule: FilterRule; reason: string }[];
}

/**
 * Compiles a FilterAST into safe parameterized SQL clauses against the `clients` table (aliased as `c`).
 */
export function compileFilterAstToSql(
  ast: FilterAST,
  customDefinitions: CustomFieldDefinition[]
): CompilationResult {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const skippedRules: { rule: FilterRule; reason: string }[] = [];

  const defsByKey = new Map<string, CustomFieldDefinition>();
  for (const def of customDefinitions) {
    defsByKey.set(def.field_key, def);
  }

  for (const rule of ast.rules) {
    // 1. Core Fields
    if (rule.field === 'client_type') {
      if (rule.operator === 'is') {
        clauses.push('c.client_type = ?');
        params.push(String(rule.value));
      } else if (rule.operator === 'is_not') {
        clauses.push('(c.client_type != ? OR c.client_type IS NULL)');
        params.push(String(rule.value));
      } else if (rule.operator === 'is_empty') {
        clauses.push('(c.client_type IS NULL OR c.client_type = "")');
      }
      continue;
    }

    if (rule.field === 'active') {
      const activeNum = Number(rule.value) === 0 ? 0 : 1;
      if (rule.operator === 'is') {
        clauses.push('c.active = ?');
        params.push(activeNum);
      } else if (rule.operator === 'is_not') {
        clauses.push('c.active != ?');
        params.push(activeNum);
      }
      continue;
    }

    if (rule.field === 'city') {
      if (rule.operator === 'contains') {
        clauses.push('c.city LIKE ?');
        params.push(`%${String(rule.value).trim()}%`);
      } else if (rule.operator === 'equals') {
        clauses.push('c.city = ?');
        params.push(String(rule.value).trim());
      } else if (rule.operator === 'is_empty') {
        clauses.push('(c.city IS NULL OR c.city = "")');
      } else if (rule.operator === 'is_not_empty') {
        clauses.push('(c.city IS NOT NULL AND c.city != "")');
      }
      continue;
    }

    if (rule.field === 'preferred_contact') {
      if (rule.operator === 'is') {
        clauses.push('c.preferred_contact = ?');
        params.push(String(rule.value));
      } else if (rule.operator === 'is_not') {
        clauses.push('(c.preferred_contact != ? OR c.preferred_contact IS NULL)');
        params.push(String(rule.value));
      } else if (rule.operator === 'is_empty') {
        clauses.push('(c.preferred_contact IS NULL OR c.preferred_contact = "")');
      }
      continue;
    }

    if (rule.field === 'created_at' || rule.field === 'updated_at') {
      const col = rule.field === 'created_at' ? 'c.created_at' : 'c.updated_at';
      if (rule.operator === 'on') {
        clauses.push(`date(${col}) = ?`);
        params.push(String(rule.value));
      } else if (rule.operator === 'before') {
        clauses.push(`date(${col}) < ?`);
        params.push(String(rule.value));
      } else if (rule.operator === 'after') {
        clauses.push(`date(${col}) > ?`);
        params.push(String(rule.value));
      } else if (rule.operator === 'between') {
        const [start, end] = Array.isArray(rule.value) ? rule.value : ['', ''];
        clauses.push(`date(${col}) >= ? AND date(${col}) <= ?`);
        params.push(String(start), String(end));
      } else if (rule.operator === 'is_empty') {
        clauses.push(`${col} IS NULL`);
      }
      continue;
    }

    if (rule.field === 'actual_service') {
      const serviceVal = String(rule.value);
      let subQuery = '';
      if (serviceVal === 'marketing') {
        subQuery = `EXISTS (SELECT 1 FROM marketing_contracts mc WHERE mc.client_id = c.id AND mc.status = 'active')`;
      } else if (serviceVal === 'subscription') {
        subQuery = `EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = c.id AND s.status = 'active')`;
      } else if (serviceVal === 'website') {
        subQuery = `EXISTS (SELECT 1 FROM website_projects wp WHERE wp.client_id = c.id AND wp.status != 'cancelled')`;
      } else if (serviceVal === 'packages') {
        subQuery = `EXISTS (SELECT 1 FROM client_packages cp WHERE cp.client_id = c.id AND cp.status != 'cancelled')`;
      } else if (serviceVal === 'studio') {
        subQuery = `EXISTS (SELECT 1 FROM studio_bookings sb WHERE sb.client_id = c.id AND sb.status != 'cancelled')`;
      } else {
        // match dynamic service definition by name
        subQuery = `(
          EXISTS (SELECT 1 FROM marketing_contracts mc JOIN service_definitions sd ON sd.name = 'تسويق شهري' WHERE mc.client_id = c.id AND sd.name = ?) OR
          EXISTS (SELECT 1 FROM subscriptions s WHERE s.client_id = c.id AND s.service_name = ?)
        )`;
        params.push(serviceVal, serviceVal);
      }

      if (subQuery) {
        if (rule.operator === 'has_service') {
          clauses.push(subQuery);
        } else if (rule.operator === 'does_not_have_service') {
          clauses.push(`NOT (${subQuery})`);
        }
      }
      continue;
    }

    if (rule.field === 'outstanding_dues') {
      // Subquery calculates client's total remaining marketing dues
      const duesSubquery = `(
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
      )`;

      // Value given in EGP or piasters; if given as EGP, convert to piasters
      const toPiasters = (v: unknown) => Math.round(Number(v) * 100);

      if (rule.operator === 'equals') {
        clauses.push(`${duesSubquery} = ?`);
        params.push(toPiasters(rule.value));
      } else if (rule.operator === 'greater_than') {
        clauses.push(`${duesSubquery} > ?`);
        params.push(toPiasters(rule.value));
      } else if (rule.operator === 'less_than') {
        clauses.push(`${duesSubquery} < ?`);
        params.push(toPiasters(rule.value));
      } else if (rule.operator === 'between') {
        const [min, max] = Array.isArray(rule.value) ? rule.value : [0, 0];
        clauses.push(`${duesSubquery} >= ? AND ${duesSubquery} <= ?`);
        params.push(toPiasters(min), toPiasters(max));
      } else if (rule.operator === 'is_empty') {
        clauses.push(`${duesSubquery} = 0`);
      }
      continue;
    }

    if (rule.field === 'credit') {
      const creditSubquery = `(
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
      )`;
      const toPiasters = (v: unknown) => Math.round(Number(v) * 100);

      if (rule.operator === 'equals') {
        clauses.push(`${creditSubquery} = ?`);
        params.push(toPiasters(rule.value));
      } else if (rule.operator === 'greater_than') {
        clauses.push(`${creditSubquery} > ?`);
        params.push(toPiasters(rule.value));
      } else if (rule.operator === 'less_than') {
        clauses.push(`${creditSubquery} < ?`);
        params.push(toPiasters(rule.value));
      } else if (rule.operator === 'between') {
        const [min, max] = Array.isArray(rule.value) ? rule.value : [0, 0];
        clauses.push(`${creditSubquery} >= ? AND ${creditSubquery} <= ?`);
        params.push(toPiasters(min), toPiasters(max));
      } else if (rule.operator === 'is_empty') {
        clauses.push(`${creditSubquery} = 0`);
      }
      continue;
    }

    // 2. Custom Fields
    const def = defsByKey.get(rule.field);
    if (!def) {
      skippedRules.push({ rule, reason: `حقل مخصص غير موجود أو محذوف: ${rule.field}` });
      continue;
    }
    if (def.active === 0) {
      skippedRules.push({ rule, reason: `الحقل المخصص معطّل حالياً: ${def.label}` });
      continue;
    }

    const fieldId = def.id;

    if (def.field_type === 'multi_select') {
      if (rule.operator === 'contains_any') {
        const optionIds = Array.isArray(rule.value) ? rule.value : [rule.value];
        const placeholders = optionIds.map(() => '?').join(', ');
        clauses.push(`EXISTS (
          SELECT 1 FROM client_custom_field_multiselect_values cfm
          WHERE cfm.client_id = c.id AND cfm.field_definition_id = ? AND cfm.option_id IN (${placeholders})
        )`);
        params.push(fieldId, ...optionIds);
      } else if (rule.operator === 'contains_all') {
        const optionIds = Array.isArray(rule.value) ? rule.value : [rule.value];
        const count = optionIds.length;
        const placeholders = optionIds.map(() => '?').join(', ');
        clauses.push(`(
          SELECT COUNT(DISTINCT cfm.option_id) FROM client_custom_field_multiselect_values cfm
          WHERE cfm.client_id = c.id AND cfm.field_definition_id = ? AND cfm.option_id IN (${placeholders})
        ) = ?`);
        params.push(fieldId, ...optionIds, count);
      } else if (rule.operator === 'is_empty') {
        clauses.push(`NOT EXISTS (
          SELECT 1 FROM client_custom_field_multiselect_values cfm
          WHERE cfm.client_id = c.id AND cfm.field_definition_id = ?
        )`);
        params.push(fieldId);
      }
      continue;
    }

    // Single-value custom fields
    const valCol =
      def.field_type === 'integer' || def.field_type === 'money_piasters'
        ? 'number_value'
        : def.field_type === 'date'
        ? 'date_value'
        : def.field_type === 'boolean'
        ? 'boolean_value'
        : 'text_value';

    if (rule.operator === 'is_empty') {
      clauses.push(`NOT EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.${valCol} IS NOT NULL AND cfv.${valCol} != ""
      )`);
      params.push(fieldId);
      continue;
    }

    if (rule.operator === 'is_not_empty') {
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.${valCol} IS NOT NULL AND cfv.${valCol} != ""
      )`);
      params.push(fieldId);
      continue;
    }

    if (rule.operator === 'contains') {
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.text_value LIKE ?
      )`);
      params.push(fieldId, `%${String(rule.value).trim()}%`);
    } else if (rule.operator === 'equals' || rule.operator === 'is') {
      const targetVal =
        def.field_type === 'money_piasters'
          ? Math.round(Number(rule.value) * 100)
          : def.field_type === 'integer'
          ? Number(rule.value)
          : def.field_type === 'boolean'
          ? Number(rule.value) === 1 ? 1 : 0
          : String(rule.value);

      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.${valCol} = ?
      )`);
      params.push(fieldId, targetVal);
    } else if (rule.operator === 'is_not') {
      const targetVal = String(rule.value);
      clauses.push(`(
        NOT EXISTS (
          SELECT 1 FROM client_custom_field_values cfv
          WHERE cfv.client_id = c.id AND cfv.field_definition_id = ?
        ) OR EXISTS (
          SELECT 1 FROM client_custom_field_values cfv
          WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.${valCol} != ?
        )
      )`);
      params.push(fieldId, fieldId, targetVal);
    } else if (rule.operator === 'greater_than') {
      const targetVal =
        def.field_type === 'money_piasters'
          ? Math.round(Number(rule.value) * 100)
          : Number(rule.value);
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.${valCol} > ?
      )`);
      params.push(fieldId, targetVal);
    } else if (rule.operator === 'less_than') {
      const targetVal =
        def.field_type === 'money_piasters'
          ? Math.round(Number(rule.value) * 100)
          : Number(rule.value);
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.${valCol} < ?
      )`);
      params.push(fieldId, targetVal);
    } else if (rule.operator === 'between') {
      const [v1, v2] = Array.isArray(rule.value) ? rule.value : [0, 0];
      const target1 =
        def.field_type === 'money_piasters' ? Math.round(Number(v1) * 100) : v1;
      const target2 =
        def.field_type === 'money_piasters' ? Math.round(Number(v2) * 100) : v2;
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.${valCol} >= ? AND cfv.${valCol} <= ?
      )`);
      params.push(fieldId, target1, target2);
    } else if (rule.operator === 'on') {
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND date(cfv.date_value) = ?
      )`);
      params.push(fieldId, String(rule.value));
    } else if (rule.operator === 'before') {
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND date(cfv.date_value) < ?
      )`);
      params.push(fieldId, String(rule.value));
    } else if (rule.operator === 'after') {
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND date(cfv.date_value) > ?
      )`);
      params.push(fieldId, String(rule.value));
    } else if (rule.operator === 'is_true') {
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.boolean_value = 1
      )`);
      params.push(fieldId);
    } else if (rule.operator === 'is_false') {
      clauses.push(`EXISTS (
        SELECT 1 FROM client_custom_field_values cfv
        WHERE cfv.client_id = c.id AND cfv.field_definition_id = ? AND cfv.boolean_value = 0
      )`);
      params.push(fieldId);
    }
  }

  const whereClause = clauses.length > 0 ? clauses.join(' AND ') : '';
  return { whereClause, params, skippedRules };
}
