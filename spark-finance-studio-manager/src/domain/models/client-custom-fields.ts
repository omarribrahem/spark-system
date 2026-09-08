/**
 * Client Custom Fields Domain Definitions & Invariants
 * Spark Finance & Studio Manager
 */

import { DomainInvariantError, assertNonEmptyString } from '../rules/invariants';

export type ClientType =
  | 'teacher'
  | 'company'
  | 'creator'
  | 'individual'
  | 'educational_entity'
  | 'other';

export const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'individual', label: 'فرد' },
  { value: 'teacher', label: 'معلم / محاضر' },
  { value: 'creator', label: 'صانع محتوى' },
  { value: 'company', label: 'شركة / مؤسسة' },
  { value: 'educational_entity', label: 'جهة تعليمية / سنتر' },
  { value: 'other', label: 'أخرى' },
];

export type PreferredContact = 'whatsapp' | 'phone' | 'email';

export const PREFERRED_CONTACTS: { value: PreferredContact; label: string }[] = [
  { value: 'phone', label: 'اتصال هاتفي' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'email', label: 'بريد إلكتروني' },
];

export type CustomFieldType =
  | 'short_text'
  | 'long_text'
  | 'integer'
  | 'money_piasters'
  | 'date'
  | 'phone'
  | 'email'
  | 'url'
  | 'boolean'
  | 'single_select'
  | 'multi_select';

export const CUSTOM_FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'short_text', label: 'نص قصير' },
  { value: 'long_text', label: 'نص طويل / تفاصيل' },
  { value: 'integer', label: 'عدد صحيح' },
  { value: 'money_piasters', label: 'مبلغ مالي (قروش / جنيه)' },
  { value: 'date', label: 'تاريخ' },
  { value: 'phone', label: 'رقم هاتف' },
  { value: 'email', label: 'بريد إلكتروني' },
  { value: 'url', label: 'رابط إلكتروني (URL)' },
  { value: 'boolean', label: 'نعم / لا (منطقي)' },
  { value: 'single_select', label: 'قائمة اختيار مفرد' },
  { value: 'multi_select', label: 'قائمة اختيار متعدد' },
];

export interface CustomFieldDefinition {
  id: string;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  section: string;
  help_text: string | null;
  required: number; // 0 or 1
  searchable: number; // 0 or 1
  filterable: number; // 0 or 1
  active: number; // 0 or 1
  sort_order: number;
  created_at: string;
  updated_at: string;
  options?: CustomFieldOption[];
}

export interface CustomFieldOption {
  id: string;
  field_definition_id: string;
  value_key: string;
  label: string;
  active: number; // 0 or 1
  sort_order: number;
}

export interface CustomFieldValue {
  client_id: string;
  field_definition_id: string;
  text_value: string | null;
  number_value: number | null;
  date_value: string | null;
  boolean_value: number | null;
  multi_select_option_ids?: string[];
  created_at: string;
  updated_at: string;
}

export const RESERVED_FIELD_KEYS = new Set([
  'id',
  'name',
  'company_name',
  'phone',
  'secondary_phone',
  'notes',
  'active',
  'created_at',
  'updated_at',
  'client_type',
  'contact_name',
  'contact_role',
  'whatsapp',
  'email',
  'city',
  'preferred_contact',
  'outstanding_dues',
  'credit',
  'actual_service',
  'services',
]);

/**
 * Validates a custom field key (must be snake_case alphanumeric, 2-50 chars, not reserved).
 */
export function validateFieldKey(key: string): string {
  const trimmed = assertNonEmptyString(key, 'field_key').trim().toLowerCase();
  if (RESERVED_FIELD_KEYS.has(trimmed)) {
    throw new DomainInvariantError(`Field key '${trimmed}' is reserved by the system`);
  }
  const snakeRegex = /^[a-z][a-z0-9_]{1,49}$/;
  if (!snakeRegex.test(trimmed)) {
    throw new DomainInvariantError(
      `Field key '${trimmed}' must start with a lowercase letter, contain only lowercase letters, numbers, or underscores, and be between 2 and 50 characters.`
    );
  }
  return trimmed;
}

/**
 * Validates Egyptian/international phone numbers (optional normalization helper).
 */
export function normalizePhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  return cleaned;
}

/**
 * Validates email format if provided.
 */
export function validateEmail(email: string): boolean {
  if (!email || email.trim().length === 0) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validates URL format if provided.
 */
export function validateUrl(url: string): boolean {
  if (!url || url.trim().length === 0) return true;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
