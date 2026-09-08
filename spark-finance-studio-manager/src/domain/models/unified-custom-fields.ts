/**
 * Unified Custom Fields Domain Model:
 * Reusable across services, plan templates, sold plans, contracts, and reels.
 */

import { DomainInvariantError } from '../rules/invariants';

export type EntityScope =
  | 'service'
  | 'plan_template'
  | 'sold_plan'
  | 'contract'
  | 'reel';

export type UnifiedFieldType =
  | 'short_text'
  | 'long_text'
  | 'integer'
  | 'money_piasters'
  | 'date'
  | 'time'
  | 'single_select'
  | 'multi_select'
  | 'checkbox'
  | 'url'
  | 'email'
  | 'phone';

export const UNIFIED_FIELD_TYPES: Array<{ id: UnifiedFieldType; label: string }> = [
  { id: 'short_text', label: 'نص قصير' },
  { id: 'long_text', label: 'نص طويل / ملاحظة' },
  { id: 'integer', label: 'رقم صحيح' },
  { id: 'money_piasters', label: 'مبلغ مالي (قروش)' },
  { id: 'date', label: 'تاريخ' },
  { id: 'time', label: 'وقت' },
  { id: 'single_select', label: 'اختيار مفرد' },
  { id: 'multi_select', label: 'اختيار متعدد' },
  { id: 'checkbox', label: 'خانة اختيار (صح / خطأ)' },
  { id: 'url', label: 'رابط إلكتروني' },
  { id: 'email', label: 'بريد إلكتروني' },
  { id: 'phone', label: 'رقم هاتف' },
];

export interface UnifiedFieldDefinition {
  id: string;
  entity_scope: EntityScope;
  field_key: string;
  label: string;
  field_type: UnifiedFieldType;
  required: number; // 0 or 1
  default_value: string | null;
  sort_order: number;
  active: number; // 0 or 1
  show_in_form: number; // 0 or 1
  show_in_table: number; // 0 or 1
  filterable: number; // 0 or 1
  created_at: string;
  updated_at: string;
  options?: UnifiedFieldOption[];
}

export interface UnifiedFieldOption {
  id: string;
  field_definition_id: string;
  value_key: string;
  label: string;
  active: number; // 0 or 1
  sort_order: number;
  created_at: string;
}

export interface UnifiedFieldValue {
  id: string;
  entity_scope: EntityScope;
  entity_id: string;
  field_definition_id: string;
  text_value: string | null;
  number_value: number | null;
  date_value: string | null;
  boolean_value: number | null;
  option_id: string | null;
  created_at: string;
  updated_at: string;
  multi_select_option_ids?: string[];
}

const RESERVED_KEYS: readonly string[] = [
  'id', 'created_at', 'updated_at', 'client_id', 'service_id', 'amount', 'status',
  'name', 'date', 'price', 'total', 'notes', 'tags', 'assignee', 'stage'
];

export function validateUnifiedFieldKey(key: string): void {
  const trimmed = key.trim();
  if (!/^[a-z0-9_]{2,40}$/.test(trimmed)) {
    throw new DomainInvariantError(
      `المفتاح البرمجي للحقل "${key}" غير صالح. يجب أن يتكون من 2-40 حرفاً إنجليزياً صغيراً وأرقام وشرطة سفلية فقط`
    );
  }
  if (RESERVED_KEYS.includes(trimmed.toLowerCase())) {
    throw new DomainInvariantError(
      `المفتاح البرمجي "${key}" محجوز للنظام ولا يمكن استخدامه كحقل مخصص`
    );
  }
}
