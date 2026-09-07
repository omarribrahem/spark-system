import React, { useState, useEffect } from 'react';
import {
  X,
  ReceiptText,
  DollarSign,
  Calendar,
  Tag,
  FileText,
  Paperclip,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { ExpenseCategory } from '../../domain/models/expense';
import { ExpenseRepository } from '../../database/repositories';
import { getDatabaseDriver } from '../../database/driver';
import { Select } from '../../ui/athredu/Select';

export interface ExpenseEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExpenseCreated: () => void;
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

export const ExpenseEntryModal: React.FC<ExpenseEntryModalProps> = ({
  isOpen,
  onClose,
  onExpenseCreated,
}) => {
  const [amountInput, setAmountInput] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<ExpenseCategory>('rent');
  const [description, setDescription] = useState('');
  const [note, setNote] = useState('');
  const [receiptPath, setReceiptPath] = useState('');

  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAmountInput('');
      setDate(new Date().toISOString().split('T')[0]);
      setCategory('rent');
      setDescription('');
      setNote('');
      setReceiptPath('');
      setDescriptionError(null);
      setAmountError(null);
      setGeneralError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    setDescriptionError(null);
    setAmountError(null);

    // Validate amount
    const num = parseFloat(amountInput);
    if (isNaN(num) || num <= 0) {
      setAmountError('يرجى إدخال مبلغ صالح أكبر من الصفر');
      return;
    }
    const amountPiasters = Math.round(num * 100);

    // Mandatory description when category is 'other' (PRD §48 / BR-041)
    if (category === 'other') {
      const trimmedDesc = description.trim();
      if (!trimmedDesc) {
        setDescriptionError(
          'الوصف إلزامي عند اختيار تصنيف "أخرى" وفقاً للائحة الحوكمة المالية (PRD §48 / BR-041).'
        );
        return;
      }
    }

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();
      const expenseRepo = new ExpenseRepository(driver);

      const input = {
        amount: amountPiasters,
        date,
        category,
        description: description.trim() || null,
        note: note.trim() || null,
        receiptAttachmentId: receiptPath.trim() || null,
        receiptPath: receiptPath.trim() || null,
      };

      await expenseRepo.createExpense(input);
      onExpenseCreated();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to create expense:', err);
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ المصروف';
      setGeneralError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isOther = category === 'other';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div
        className="w-full max-w-lg bg-white rounded-[2rem] shadow-xl border border-[#E5E5E5] overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center">
              <ReceiptText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">تسجيل مصروف</h2>
              <p className="text-xs text-[#707070]">
                توثيق المصروفات التشغيلية للمقر والاستوديو
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {generalError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Amount & Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                <span>المبلغ (جنيه مصري) <span className="text-red-500">*</span></span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    if (amountError) setAmountError(null);
                  }}
                  placeholder="0.00"
                  className={`w-full pl-12 pr-3.5 py-2.5 rounded-xl border text-sm font-bold font-mono text-slate-900 bg-white focus:outline-none transition-all text-left ${
                    amountError
                      ? 'border-red-300 focus:border-red-500'
                      : 'border-neutral-300 focus:border-[#004AC6]'
                  }`}
                  disabled={isSubmitting}
                  autoFocus
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 select-none">
                  ج.م
                </span>
              </div>
              {amountError && (
                <p className="mt-1 text-xs text-red-600 font-medium">{amountError}</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>تاريخ الصرف <span className="text-red-500">*</span></span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-[#004AC6] text-sm text-slate-900 bg-white focus:outline-none transition-all text-left"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Category Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <span>تصنيف المصروف <span className="text-red-500">*</span></span>
            </label>
            <Select
              value={category}
              onValueChange={(val) => {
                const newCat = val as ExpenseCategory;
                setCategory(newCat);
                if (newCat !== 'other') {
                  setDescriptionError(null);
                }
              }}
              options={CATEGORY_OPTIONS.map((opt) => ({
                value: opt.id,
                label: `${opt.label} — ${opt.description}`,
              }))}
              className="h-11 rounded-2xl"
              disabled={isSubmitting}
            />
          </div>

          {/* Description Field (Strictly mandatory if category is 'other') */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  وصف المصروف {isOther ? <span className="text-red-600 font-bold">* (إلزامي للتصنيف "أخرى")</span> : '(اختياري)'}
                </span>
              </span>
              {isOther && (
                <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  قيد الحوكمة المالية BR-041
                </span>
              )}
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (descriptionError) setDescriptionError(null);
              }}
              placeholder={
                isOther
                  ? 'يجب توضيح سبب المصروف بالتفصيل (مثال: تصليح مكيف الهواء، شراء كابلات إضافية...)'
                  : 'وصف مختصر للمصروف...'
              }
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none transition-all ${
                descriptionError
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-neutral-300 focus:border-[#004AC6]'
              }`}
              disabled={isSubmitting}
            />
            {descriptionError && (
              <p className="mt-1 text-xs text-red-600 font-medium">{descriptionError}</p>
            )}
          </div>

          {/* Notes & Receipt Attachment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                ملاحظات إضافية
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="اسم البائع، رقم الفاتورة..."
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 focus:border-[#004AC6] text-xs text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none transition-all resize-none"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                <span>مسار الإيصال / الفاتورة</span>
              </label>
              <input
                type="text"
                dir="ltr"
                value={receiptPath}
                onChange={(e) => setReceiptPath(e.target.value)}
                placeholder="receipts/2026/09/bill-82.jpg"
                className="w-full px-3 py-2 rounded-xl border border-neutral-300 focus:border-[#004AC6] text-xs font-mono text-slate-900 bg-white placeholder:text-slate-400 focus:outline-none transition-all text-left"
                disabled={isSubmitting}
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                تخزين محلي مع دعم استعراض المرفقات
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 px-5 rounded-full text-xs font-semibold text-[#707070] hover:text-[#1A1A1A] hover:bg-neutral-100 transition-colors"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري الحفظ...' : 'تسجيل المصروف'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ExpenseEntryModal;
