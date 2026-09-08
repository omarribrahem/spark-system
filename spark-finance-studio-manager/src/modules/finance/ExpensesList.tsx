import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PlusCircle,
  Tag,
  Paperclip,
  TrendingDown,
  Search,
} from 'lucide-react';
import { ExpenseCategory } from '../../domain/models/expense';
import { ExpenseRepository, ExpenseFilter } from '../../database/repositories';
import { ExpenseRecordWithAttachment } from '../../database/repositories/expense-repository';
import { getDatabaseDriver } from '../../database/driver';
import { BdiCurrency, BdiDate } from '../../ui/bdi';
import { SkeletonCard, EmptyState, ActionableError } from '../../ui/feedback';
import { Select } from '../../ui/athredu/Select';
import { CATEGORY_OPTIONS } from '../../domain/models/expense';
import { AttachmentViewer } from './AttachmentViewer';

export interface ExpensesListProps {
  onRequestNewExpense?: boolean;
  onResetNewExpenseRequest?: () => void;
  onOpenHeaderForm?: () => void;
}

export const ExpensesList: React.FC<ExpensesListProps> = ({
  onRequestNewExpense,
  onResetNewExpenseRequest,
  onOpenHeaderForm,
}) => {
  const [expenses, setExpenses] = useState<ExpenseRecordWithAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  
  const [viewingAttachment, setViewingAttachment] = useState<{ path: string; name?: string } | null>(null);

  useEffect(() => {
    if (onRequestNewExpense) {
      if (onOpenHeaderForm) onOpenHeaderForm();
      if (onResetNewExpenseRequest) {
        onResetNewExpenseRequest();
      }
    }
  }, [onRequestNewExpense, onResetNewExpenseRequest]);

  const loadExpenses = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const expenseRepo = new ExpenseRepository(driver);

      const filter: ExpenseFilter = {};
      if (selectedCategory !== 'all') {
        filter.category = selectedCategory as ExpenseCategory;
      }
      if (startDate) {
        filter.startDate = startDate;
      }
      if (endDate) {
        filter.endDate = endDate;
      }

      const rows = await expenseRepo.list(filter);
      setExpenses(rows);
    } catch (err: unknown) {
      console.error('Failed to load expenses:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, startDate, endDate]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  // Client-side text search filter
  const filteredExpenses = useMemo(() => {
    if (!searchQuery.trim()) return expenses;
    const q = searchQuery.trim().toLowerCase();
    return expenses.filter((e) => {
      const matchDesc = e.description?.toLowerCase().includes(q) ?? false;
      const matchNote = e.note?.toLowerCase().includes(q) ?? false;
      const matchCat = e.category.toLowerCase().includes(q);
      return matchDesc || matchNote || matchCat;
    });
  }, [expenses, searchQuery]);

  // Monthly summary calculations
  const totalAmountPiasters = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filteredExpenses) {
      const prev = map.get(e.category) ?? 0;
      map.set(e.category, prev + e.amount);
    }
    return map;
  }, [filteredExpenses]);

  // Find top expense category
  const topCategory = useMemo(() => {
    let max = 0;
    let top = '—';
    for (const [cat, sum] of categoryTotals.entries()) {
      if (sum > max) {
        max = sum;
        const opt = CATEGORY_OPTIONS.find((o) => o.id === cat);
        top = opt ? opt.label : cat;
      }
    }
    return { name: top, amount: max };
  }, [categoryTotals]);

  const getCategoryBadge = (cat: ExpenseCategory) => {
    const opt = CATEGORY_OPTIONS.find((o) => o.id === cat);
    const label = opt ? opt.label : cat;

    let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
    if (cat === 'rent') colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
    if (cat === 'salary') colorClasses = 'bg-purple-50 text-purple-700 border-purple-200';
    if (cat === 'studio') colorClasses = 'bg-sky-50 text-sky-700 border-sky-200';
    if (cat === 'equipment') colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
    if (cat === 'ads') colorClasses = 'bg-blue-50 text-blue-700 border-blue-200';
    if (cat === 'software') colorClasses = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    if (cat === 'other') colorClasses = 'bg-neutral-100 text-neutral-800 border-neutral-200 font-bold';

    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${colorClasses}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Monthly Summary KPI Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Card 1: Total Expenses */}
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
            <span>إجمالي المصروفات المنفقة</span>
            <span className="p-1.5 rounded-full bg-purple-50 text-purple-600">
              <TrendingDown className="w-4 h-4" />
            </span>
          </div>
          <BdiCurrency piasters={totalAmountPiasters} className="text-xl font-bold text-[#1A1A1A]" />
          <div className="mt-2 text-[11px] text-neutral-400">
            {filteredExpenses.length} حركة مسجلة
          </div>
        </div>

        {/* Card 2: Highest Expense Category */}
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
            <span>أعلى بند مصروفات</span>
            <span className="p-1.5 rounded-full bg-rose-50 text-rose-600">
              <Tag className="w-4 h-4" />
            </span>
          </div>
          <div className="text-sm font-bold text-[#1A1A1A] truncate">
            {topCategory.name}
          </div>
          <div className="mt-2 text-xs font-semibold text-rose-600">
            {topCategory.amount > 0 ? <BdiCurrency piasters={topCategory.amount} /> : 'لا توجد بيانات'}
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Category Filter */}
          <div className="w-48">
            <Select
              value={selectedCategory}
              onValueChange={(val) => setSelectedCategory(val)}
              placeholder="جميع التصنيفات"
              options={[
                { value: "all", label: "جميع التصنيفات" },
                ...CATEGORY_OPTIONS.map((o) => ({ value: o.id, label: o.label })),
              ]}
            />
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2 text-xs text-neutral-600">
            <span>من:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11 px-3 rounded-full border border-[#E5E5E5] bg-white text-xs text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
            />
            <span>إلى:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11 px-3 rounded-full border border-[#E5E5E5] bg-white text-xs text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
            />
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-[11px] text-neutral-400 hover:text-neutral-700 underline"
              >
                مسح
              </button>
            )}
          </div>
        </div>

        {/* Search & Action CTA */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث في الوصف والملاحظات..."
              className="w-full h-11 pr-9 pl-4 text-xs font-semibold rounded-full border border-[#E5E5E5] bg-white text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
            />
          </div>

          <button
            type="button"
            onClick={() => onOpenHeaderForm?.()}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98] shrink-0 whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4" />
            <span>تسجيل مصروف</span>
          </button>
        </div>
      </div>

      {/* Expenses Table */}
      {isLoading ? (
        <div className="space-y-3">
          <SkeletonCard rows={2} hasHeader />
          <SkeletonCard rows={2} hasHeader />
        </div>
      ) : error ? (
        <ActionableError
          title="تعذر تحميل سجل المصروفات"
          message={error.message}
          onRetry={loadExpenses}
        />
      ) : filteredExpenses.length === 0 ? (
        <EmptyState
          title="لا توجد مصروفات مسجلة"
          description="لم يتم العثور على أي مصروفات تطابق معايير البحث والتصفية المختارة."
          actionLabel="+ تسجيل مصروف جديد"
          onAction={() => onOpenHeaderForm?.()}
        />
      ) : (
        <div className="overflow-x-auto border border-[#E5E5E5] rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.03)] bg-white overflow-hidden">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4">التاريخ</th>
                <th className="py-3.5 px-4">التصنيف</th>
                <th className="py-3.5 px-4">الوصف</th>
                <th className="py-3.5 px-4">الملاحظات</th>
                <th className="py-3.5 px-4">المبلغ</th>
                <th className="py-3.5 px-4">الإيصال</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.map((exp) => (
                <tr key={exp.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-medium text-slate-900 whitespace-nowrap">
                    <BdiDate value={exp.date} format="date" />
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {getCategoryBadge(exp.category)}
                  </td>
                  <td className="py-3.5 px-4 text-slate-800 font-medium">
                    {exp.description ? (
                      <span>{exp.description}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                    {exp.note || '—'}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <BdiCurrency piasters={exp.amount} className="font-bold text-slate-900 text-sm" />
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {(exp.receipt_path || exp.receiptPath || exp.receiptAttachmentId) ? (
                      <button
                        type="button"
                        onClick={() =>
                          setViewingAttachment({
                            path: (exp.receipt_path || exp.receiptPath || exp.receiptAttachmentId)!,
                            name: `إيصال مصروف ${exp.date}`,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>عرض الإيصال</span>
                      </button>
                    ) : (
                      <span className="text-slate-400 text-[11px]">بدون مرفق</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      

      {/* Attachment Viewer */}
      {viewingAttachment && (
        <AttachmentViewer
          isOpen={!!viewingAttachment}
          onClose={() => setViewingAttachment(null)}
          filePath={viewingAttachment.path}
          fileName={viewingAttachment.name}
        />
      )}
    </div>
  );
};

export default ExpensesList;
