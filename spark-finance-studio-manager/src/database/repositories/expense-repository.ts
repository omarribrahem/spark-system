/**
 * ExpenseRepository: Persistence for Operational Outflows and Business Expenses.
 * Strictly enforces mandatory description when category is 'other' (PRD §48 / BR-041).
 */

import { IDatabaseDriver } from '../driver/types';
import {
  ExpenseCategory,
  ExpenseRecord,
  CreateExpenseInput,
} from '../../domain/models/expense';
import {
  assertIntegerPiasters,
  assertValidDateString,
  assertExpenseCategoryValid,
} from '../../domain/rules/invariants';
import { inferMimeType } from './attachment-repository';

export interface ExpenseRecordWithAttachment extends ExpenseRecord {
  receipt_path?: string | null;
  receiptPath?: string | null;
}

export interface ExpenseFilter {
  category?: ExpenseCategory;
  startDate?: string;
  endDate?: string;
}

export class ExpenseRepository {
  constructor(private driver: IDatabaseDriver) {}

  public async createExpense(
    input: CreateExpenseInput & { receiptPath?: string | null }
  ): Promise<ExpenseRecordWithAttachment> {
    const id = crypto.randomUUID();
    assertIntegerPiasters(input.amount, 'amount');
    assertValidDateString(input.date, 'date');
    assertExpenseCategoryValid(input.category, input.description);

    const now = new Date().toISOString();

    return await this.driver.transaction(async (tx) => {
      // 0. Handle Receipt Attachment
      let linkedAttachmentId: string | null = null;
      let finalReceiptPath: string | null = null;
      const receiptVal = (input.receiptAttachmentId ?? input.receiptPath)?.trim();

      if (receiptVal) {
        const existing = await tx.query<{ id: string; file_path: string }>(
          `SELECT id, file_path FROM attachments WHERE id = ? LIMIT 1;`,
          [receiptVal]
        );

        if (existing.length > 0) {
          linkedAttachmentId = existing[0].id;
          finalReceiptPath = existing[0].file_path;
        } else {
          // File path provided: generate attachment record
          const attachmentId = crypto.randomUUID();
          const fileName = receiptVal.split(/[/\\]/).pop() || 'receipt';
          const mimeType = inferMimeType(receiptVal);
          await tx.execute(
            `INSERT INTO attachments (id, entity_type, entity_id, file_name, file_path, file_size, mime_type, sha256, created_at)
             VALUES (?, 'expense', ?, ?, ?, 0, ?, '', ?);`,
            [attachmentId, id, fileName, receiptVal, mimeType, now]
          );
          linkedAttachmentId = attachmentId;
          finalReceiptPath = receiptVal;
        }
      }

      await tx.execute(
        `INSERT INTO expenses (id, amount, date, category, description, note, receipt_attachment_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          id,
          input.amount,
          input.date,
          input.category,
          input.description?.trim() ?? null,
          input.note?.trim() ?? null,
          linkedAttachmentId,
          now,
        ]
      );

      return {
        id,
        amount: input.amount,
        date: input.date,
        category: input.category,
        description: input.description?.trim() ?? null,
        note: input.note?.trim() ?? null,
        receiptAttachmentId: linkedAttachmentId,
        receipt_path: finalReceiptPath,
        receiptPath: finalReceiptPath,
        createdAt: now,
      };
    });
  }

  public async getById(id: string): Promise<ExpenseRecordWithAttachment | null> {
    const rows = await this.driver.query<{
      id: string;
      amount: number;
      date: string;
      category: ExpenseCategory;
      description: string | null;
      note: string | null;
      receipt_attachment_id: string | null;
      receipt_path: string | null;
      created_at: string;
    }>(
      `SELECT expenses.id, expenses.amount, expenses.date, expenses.category, expenses.description,
              expenses.note, expenses.receipt_attachment_id, attachments.file_path AS receipt_path, expenses.created_at
       FROM expenses
       LEFT JOIN attachments ON expenses.receipt_attachment_id = attachments.id
       WHERE expenses.id = ? LIMIT 1;`,
      [id]
    );

    if (rows.length === 0) return null;
    const r = rows[0];

    return {
      id: r.id,
      amount: r.amount,
      date: r.date,
      category: r.category,
      description: r.description,
      note: r.note,
      receiptAttachmentId: r.receipt_attachment_id,
      receipt_path: r.receipt_path ?? null,
      receiptPath: r.receipt_path ?? null,
      createdAt: r.created_at,
    };
  }

  public async list(filter?: ExpenseFilter): Promise<ExpenseRecordWithAttachment[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.category) {
      conditions.push('expenses.category = ?');
      params.push(filter.category);
    }
    if (filter?.startDate) {
      conditions.push('expenses.date >= ?');
      params.push(filter.startDate);
    }
    if (filter?.endDate) {
      conditions.push('expenses.date <= ?');
      params.push(filter.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = await this.driver.query<{
      id: string;
      amount: number;
      date: string;
      category: ExpenseCategory;
      description: string | null;
      note: string | null;
      receipt_attachment_id: string | null;
      receipt_path: string | null;
      created_at: string;
    }>(
      `SELECT expenses.id, expenses.amount, expenses.date, expenses.category, expenses.description,
              expenses.note, expenses.receipt_attachment_id, attachments.file_path AS receipt_path, expenses.created_at
       FROM expenses
       LEFT JOIN attachments ON expenses.receipt_attachment_id = attachments.id
       ${whereClause}
       ORDER BY expenses.date DESC, expenses.created_at DESC;`,
      params
    );

    return rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      date: r.date,
      category: r.category,
      description: r.description,
      note: r.note,
      receiptAttachmentId: r.receipt_attachment_id,
      receipt_path: r.receipt_path ?? null,
      receiptPath: r.receipt_path ?? null,
      createdAt: r.created_at,
    }));
  }
}
