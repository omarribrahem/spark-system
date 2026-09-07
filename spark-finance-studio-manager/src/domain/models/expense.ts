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
