/**
 * Domain Models for Business Expenses
 */

export type ExpenseCategory =
  | 'salary'
  | 'rent'
  | 'studio'
  | 'ads'
  | 'software'
  | 'equipment'
  | 'transport'
  | 'domains'
  | 'other';

export interface ExpenseRecord {
  id: string;
  amount: number; // integer piasters
  date: string; // 'YYYY-MM-DD'
  category: ExpenseCategory;
  description?: string | null;
  note?: string | null;
  receiptAttachmentId?: string | null;
  createdAt: string;
}

export interface CreateExpenseInput {
  amount: number;
  date: string;
  category: ExpenseCategory;
  description?: string | null;
  note?: string | null;
  receiptAttachmentId?: string | null;
}

export const CATEGORY_OPTIONS: Array<{
  id: ExpenseCategory;
  label: string;
  description: string;
}> = [
  { id: 'rent', label: 'إيجار المقر', description: 'إيجار الاستوديو والمقر التشغيلي' },
  { id: 'salary', label: 'رواتب ومكافآت', description: 'أجور الفريق والمصورين والمحررين' },
  { id: 'studio', label: 'استوديو وكهرباء', description: 'كهرباء، فواتير تشغيل، ومستلزمات تصوير' },
  { id: 'equipment', label: 'معدات وصيانة', description: 'شراء أو صيانة إضاءات، كاميرات، ميكروفونات' },
  { id: 'ads', label: 'إعلانات وتسويق', description: 'حملات إعلانية ممولة للوكالة' },
  { id: 'software', label: 'برمجيات واشتراكات', description: 'اشتراكات سحابية، أدوات مونتاج، منصات' },
  { id: 'transport', label: 'انتقالات وضيافة', description: 'بوفيه الاستوديو، مواصلات التصوير الخارجي' },
  { id: 'domains', label: 'استضافات ونطاقات', description: 'شراء دومينات وتجديد سيرفرات العملاء' },
  { id: 'other', label: 'أخرى (مصاريف متنوعة)', description: 'أي مصروف تشغيلي آخر - يتطلب وصفاً مفصلاً' },
];
