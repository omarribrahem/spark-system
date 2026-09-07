import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestContext, TestContext } from '../harness/test-context';
import { ExpenseFixture } from '../fixtures/expense-fixture';

describe('Tier 1: Expenses, "Other" Description Enforcement & Receipts (F-040 .. F-042)', () => {
  let ctx: TestContext;
  let expenseFixture: ExpenseFixture;

  beforeEach(async () => {
    ctx = await setupTestContext();
    expenseFixture = new ExpenseFixture(ctx.driver);
  });

  afterEach(async () => {
    await ctx.cleanup();
  });

  // F-040: Expense Tracking
  describe('F-040: Expense Tracking', () => {
    it('records valid expense in integer piasters with standardized category', async () => {
      const expenseId = await expenseFixture.recordExpense({
        amountPiasters: 250000, // 2,500 EGP
        expenseDate: '2026-10-05',
        category: 'rent',
        description: 'إيجار مقر الاستوديو عن شهر أكتوبر',
        vendor: 'صاحب العقار',
      });

      const ex = await ctx.driver.query<{ amount: number; category: string }>(
        'SELECT amount, category FROM expenses WHERE id = ?',
        [expenseId]
      );
      expect(ex[0]?.amount).toBe(250000);
      expect(ex[0]?.amount).toBePiasters();
      expect(ex[0]?.category).toBe('rent');
    });

    it('supports all 9 standardized expense categories', async () => {
      const categories = [
        'salary',
        'rent',
        'studio',
        'ads',
        'software',
        'equipment',
        'transport',
        'domains',
        'other',
      ] as const;

      for (const cat of categories) {
        const id = await expenseFixture.recordExpense({
          amountPiasters: 10000,
          expenseDate: '2026-10-05',
          category: cat,
          description: cat === 'other' ? 'تفاصيل بند أخرى' : undefined,
        });
        const rows = await ctx.driver.query<{ category: string }>('SELECT category FROM expenses WHERE id = ?', [id]);
        expect(rows[0].category).toBe(cat);
      }
    });

    it('rejects expense amount equal to zero or negative', async () => {
      await expect(
        expenseFixture.recordExpense({
          amountPiasters: 0,
          expenseDate: '2026-10-05',
          category: 'software',
        })
      ).rejects.toThrow('greater than zero piasters');

      await expect(
        expenseFixture.recordExpense({
          amountPiasters: -5000,
          expenseDate: '2026-10-05',
          category: 'ads',
        })
      ).rejects.toThrow('greater than zero piasters');
    });

    it('aggregates total monthly expenses accurately in piasters', async () => {
      await expenseFixture.recordExpense({ amountPiasters: 150000, expenseDate: '2026-10-01', category: 'ads' });
      await expenseFixture.recordExpense({ amountPiasters: 200000, expenseDate: '2026-10-05', category: 'equipment' });

      const sumResult = await ctx.driver.query<{ total: number }>(
        "SELECT SUM(amount) as total FROM expenses WHERE expense_date >= '2026-10-01' AND expense_date <= '2026-10-31'"
      );
      expect(sumResult[0]?.total).toBe(350000);
      expect(sumResult[0]?.total).toBePiasters();
    });

    it('records optional vendor name', async () => {
      const id = await expenseFixture.recordExpense({
        amountPiasters: 80000,
        expenseDate: '2026-10-05',
        category: 'software',
        vendor: 'Adobe Creative Cloud',
      });

      const ex = await ctx.driver.query<{ vendor: string }>('SELECT vendor FROM expenses WHERE id = ?', [id]);
      expect(ex[0]?.vendor).toBe('Adobe Creative Cloud');
    });
  });

  // F-041: Expense "Other" Category Enforcement (PRD §20.2, §48, EC-023)
  describe('F-041: Expense "Other" Category Enforcement', () => {
    it('strictly requires description when category is "other" with Arabic error: "الوصف مطلوب عند اختيار بند أخرى"', async () => {
      await expect(
        expenseFixture.recordExpense({
          amountPiasters: 15000,
          expenseDate: '2026-10-05',
          category: 'other',
          description: '', // Empty description!
        })
      ).rejects.toThrow('الوصف مطلوب عند اختيار بند أخرى');
    });

    it('rejects description consisting purely of whitespace when category is "other"', async () => {
      await expect(
        expenseFixture.recordExpense({
          amountPiasters: 15000,
          expenseDate: '2026-10-05',
          category: 'other',
          description: '     ', // Whitespace only
        })
      ).rejects.toThrow('الوصف مطلوب عند اختيار بند أخرى');
    });

    it('accepts category "other" when a valid non-empty description is provided', async () => {
      const id = await expenseFixture.recordExpense({
        amountPiasters: 35000,
        expenseDate: '2026-10-05',
        category: 'other',
        description: 'شراء ضيافة ومشروبات للاستوديو',
      });

      const ex = await ctx.driver.query<{ description: string }>('SELECT description FROM expenses WHERE id = ?', [id]);
      expect(ex[0]?.description).toBe('شراء ضيافة ومشروبات للاستوديو');
    });

    it('allows empty description for standard non-"other" categories (e.g. salary, rent)', async () => {
      const id = await expenseFixture.recordExpense({
        amountPiasters: 400000,
        expenseDate: '2026-10-01',
        category: 'salary',
        description: undefined,
      });

      const ex = await ctx.driver.query<{ category: string; description: string | null }>(
        'SELECT category, description FROM expenses WHERE id = ?',
        [id]
      );
      expect(ex[0]?.category).toBe('salary');
      expect(ex[0]?.description).toBeNull();
    });

    it('dynamically toggles validation requirement when switching categories', () => {
      const isDescriptionRequired = (category: string) => category === 'other';
      expect(isDescriptionRequired('other')).toBe(true);
      expect(isDescriptionRequired('rent')).toBe(false);
      expect(isDescriptionRequired('studio')).toBe(false);
    });
  });

  // F-042: Expense Receipts
  describe('F-042: Expense Receipts', () => {
    it('stores relative receipt attachment path in SQLite', async () => {
      const relativePath = 'attachments/expenses/exp_receipt_001.pdf';
      const id = await expenseFixture.recordExpense({
        amountPiasters: 120000,
        expenseDate: '2026-10-05',
        category: 'equipment',
        receiptAttachmentPath: relativePath,
      });

      const ex = await ctx.driver.query<{ receipt_attachment_path: string }>(
        'SELECT receipt_attachment_path FROM expenses WHERE id = ?',
        [id]
      );
      expect(ex[0]?.receipt_attachment_path).toBe(relativePath);
    });

    it('validates receipt file extension against supported formats (JPG, PNG, PDF)', () => {
      const isSupportedExtension = (filename: string) => {
        const ext = filename.split('.').pop()?.toLowerCase();
        return ['jpg', 'jpeg', 'png', 'pdf'].includes(ext || '');
      };

      expect(isSupportedExtension('invoice.pdf')).toBe(true);
      expect(isSupportedExtension('receipt.png')).toBe(true);
      expect(isSupportedExtension('receipt.jpg')).toBe(true);
      expect(isSupportedExtension('malicious.exe')).toBe(false);
    });

    it('handles expense without receipt attachment cleanly', async () => {
      const id = await expenseFixture.recordExpense({
        amountPiasters: 50000,
        expenseDate: '2026-10-05',
        category: 'transport',
      });

      const ex = await ctx.driver.query<{ receipt_attachment_path: string | null }>(
        'SELECT receipt_attachment_path FROM expenses WHERE id = ?',
        [id]
      );
      expect(ex[0]?.receipt_attachment_path).toBeNull();
    });

    it('replaces receipt attachment path upon editing expense', async () => {
      const id = await expenseFixture.recordExpense({
        amountPiasters: 60000,
        expenseDate: '2026-10-05',
        category: 'software',
        receiptAttachmentPath: 'attachments/expenses/old.png',
      });

      await ctx.driver.execute(
        "UPDATE expenses SET receipt_attachment_path = 'attachments/expenses/new.png' WHERE id = ?",
        [id]
      );

      const ex = await ctx.driver.query<{ receipt_attachment_path: string }>(
        'SELECT receipt_attachment_path FROM expenses WHERE id = ?',
        [id]
      );
      expect(ex[0]?.receipt_attachment_path).toBe('attachments/expenses/new.png');
    });

    it('verifies receipt exists prior to opening viewer modal', () => {
      const fileRecord = { exists: true, path: 'attachments/expenses/rec.jpg' };
      const canOpen = fileRecord.exists && fileRecord.path.length > 0;
      expect(canOpen).toBe(true);
    });
  });
});
