import { IDatabaseDriver } from '../harness/test-database';

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

export interface ExpenseData {
  id?: string;
  amountPiasters: number;
  expenseDate: string;
  category: ExpenseCategory;
  description?: string;
  vendor?: string;
  receiptAttachmentPath?: string;
}

export class ExpenseFixture {
  constructor(private driver: IDatabaseDriver) {}

  public async recordExpense(data: ExpenseData): Promise<string> {
    if (data.amountPiasters <= 0) {
      throw new Error('Expense amount must be greater than zero piasters');
    }

    // PRD §20.2 & BR rule: If category is 'other', description is strictly mandatory
    if (data.category === 'other' && (!data.description || data.description.trim() === '')) {
      throw new Error('الوصف مطلوب عند اختيار بند أخرى');
    }

    const id = data.id || `expense_${Math.random().toString(36).substring(2, 9)}`;

    await this.driver.execute(
      `INSERT INTO expenses (id, amount, expense_date, category, description, vendor, receipt_attachment_path)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.amountPiasters,
        data.expenseDate,
        data.category,
        data.description || null,
        data.vendor || null,
        data.receiptAttachmentPath || null,
      ]
    );

    return id;
  }
}
