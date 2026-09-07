import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, ShieldAlert, RotateCcw } from 'lucide-react';
import { PaymentRecord, PaymentRepository } from '../../database/repositories';
import { getDatabaseDriver } from '../../database/driver';
import { BdiCurrency, BdiDate } from '../../ui/bdi';

export interface PaymentVoidModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentRecord | null;
  onVoided: () => void;
}

export const PaymentVoidModal: React.FC<PaymentVoidModalProps> = ({
  isOpen,
  onClose,
  payment,
  onVoided,
}) => {
  const [voidReason, setVoidReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setVoidReason('');
      setReasonError(null);
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

  if (!isOpen || !payment) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    const trimmedReason = voidReason.trim();
    if (!trimmedReason) {
      setReasonError('سبب الإلغاء إلزامي ولا يمكن ترك هذا الحقل فارغاً وفقاً لقواعد السلامة المالية.');
      return;
    }
    setReasonError(null);

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();
      const paymentRepo = new PaymentRepository(driver);

      await paymentRepo.voidPayment(payment.id, trimmedReason);
      onVoided();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to void payment:', err);
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء إلغاء الدفعة المالية';
      setGeneralError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

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
        {/* Header with Danger Warning */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">إلغاء دفعة (Soft-Void)</h2>
              <p className="text-xs text-[#707070]">
                إجراء تدقيقي استرجاعي - لا يتم حذف السجلات
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
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Payment Summary Box */}
          <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500">تاريخ الاستلام:</span>
              <BdiDate value={payment.date} format="date" className="font-semibold text-[#1A1A1A]" />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500">المبلغ:</span>
              <BdiCurrency piasters={payment.amount} className="font-bold text-rose-600 text-sm" />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-neutral-500">طريقة الدفع:</span>
              <span className="font-medium text-neutral-700">{payment.method}</span>
            </div>
          </div>

          {/* Business Invariant Notice */}
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-100 text-amber-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              سيتم استرجاع مبالغ التوزيع وإعادة المستحقات لحالتها السابقة مع توثيق سبب الإلغاء بالسجل.
            </div>
          </div>

          {/* Mandatory Void Reason Input */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              سبب الإلغاء <span className="text-rose-600">* (إلزامي)</span>
            </label>
            <textarea
              rows={2}
              value={voidReason}
              onChange={(e) => {
                setVoidReason(e.target.value);
                if (reasonError) setReasonError(null);
              }}
              placeholder="اكتب سبب إلغاء هذه الدفعة..."
              className={`w-full p-3.5 rounded-2xl border text-xs text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all resize-none ${
                reasonError
                  ? 'border-rose-300 focus:border-rose-500'
                  : 'border-[#E5E5E5] focus:border-rose-500'
              }`}
              disabled={isSubmitting}
              autoFocus
            />
            {reasonError && (
              <p className="mt-1 text-xs text-rose-600 font-medium">{reasonError}</p>
            )}
          </div>

          {/* Modal Footer */}
          <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-10 px-5 rounded-full text-xs font-semibold text-[#707070] hover:text-[#1A1A1A] hover:bg-neutral-100 transition-colors"
            >
              تراجع
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري الإلغاء...' : 'تأكيد إلغاء الدفعة'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentVoidModal;
