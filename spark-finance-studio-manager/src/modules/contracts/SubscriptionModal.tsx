import React, { useState, useEffect } from 'react';
import { X, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import { ClientRepository, ClientRecord } from '../../database/repositories';
import { createSubscription, SubscriptionRecord } from './contract-service';
import { Select } from '../../ui/athredu/Select';

export interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  subscriptionToEdit?: SubscriptionRecord | null;
  preselectedClientId?: string | null;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  subscriptionToEdit,
  preselectedClientId,
}) => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [serviceName, setServiceName] = useState<string>('');
  const [monthlyAmountEgp, setMonthlyAmountEgp] = useState<string>('');
  const [billingDay, setBillingDay] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      const today = new Date().toISOString().split('T')[0];

      if (subscriptionToEdit) {
        setClientId(subscriptionToEdit.client_id);
        setMonthlyAmountEgp(String(subscriptionToEdit.monthly_amount / 100));
        setStartDate(subscriptionToEdit.start_date);
        setEndDate(subscriptionToEdit.end_date || '');
        setBillingDay(subscriptionToEdit.billing_day || 1);
        setNotes(subscriptionToEdit.notes || '');
      } else {
        setClientId(preselectedClientId || '');
        setServiceName('');
        setMonthlyAmountEgp('');
        setBillingDay(1);
        setStartDate(today);
        setEndDate('');
        setNotes('');
      }

      (async () => {
        try {
          setIsLoadingClients(true);
          const driver = await getDatabaseDriver();
          const clientRepo = new ClientRepository(driver);
          const list = await clientRepo.list({ activeOnly: true });
          setClients(list);
          if (!preselectedClientId && !subscriptionToEdit && list.length > 0) {
            setClientId(list[0].id);
          }
        } catch (e) {
          console.error('Failed to load clients:', e);
        } finally {
          setIsLoadingClients(false);
        }
      })();
    }
  }, [isOpen, subscriptionToEdit, preselectedClientId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const numericEgp = parseFloat(monthlyAmountEgp);
    if (isNaN(numericEgp) || numericEgp <= 0) {
      setErrorMessage('يرجى إدخال تكلفة اشتراك صحيحة أكبر من الصفر');
      return;
    }

    if (!clientId) {
      setErrorMessage('يرجى اختيار العميل');
      return;
    }

    if (!serviceName.trim() && !subscriptionToEdit) {
      setErrorMessage('يرجى إدخال اسم الخدمة أو الأداة البرمجية');
      return;
    }

    if (!startDate) {
      setErrorMessage('يرجى تحديد تاريخ بداية الاشتراك');
      return;
    }

    const monthlyAmountPiasters = Math.round(numericEgp * 100);

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();

      if (subscriptionToEdit) {
        const now = new Date().toISOString();
        await driver.execute(
          `UPDATE subscriptions
           SET monthly_amount = ?, billing_day = ?, start_date = ?, end_date = ?, notes = ?, updated_at = ?
           WHERE id = ?;`,
          [
            monthlyAmountPiasters,
            billingDay,
            startDate,
            endDate || null,
            notes || null,
            now,
            subscriptionToEdit.id,
          ]
        );
      } else {
        await createSubscription(driver, {
          clientId,
          serviceName: serviceName.trim(),
          monthlyAmount: monthlyAmountPiasters,
          startDate,
          endDate: endDate || null,
          billingDay,
          notes: notes || null,
        });
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to save subscription:', err);
      setErrorMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-xl bg-white rounded-[2rem] shadow-2xl border border-[#E5E5E5] overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150 text-[#1A1A1A]"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">
                {subscriptionToEdit ? 'تعديل الاشتراك' : 'اشتراك دوري جديد'}
              </h2>
              <p className="text-xs text-neutral-400">
                إدارة خدمات الاستضافة والصيانة والأدوات
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center transition-colors focus:outline-none"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Client Select */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              العميل <span className="text-red-500">*</span>
            </label>
            <Select
              value={clientId}
              onValueChange={setClientId}
              disabled={isLoadingClients || !!subscriptionToEdit}
              placeholder={isLoadingClients ? 'جاري التحميل...' : 'اختر العميل...'}
              options={clients.map((c) => ({
                value: c.id,
                label: `${c.name}${c.company_name ? ` (${c.company_name})` : ''}`,
              }))}
              className="h-11 rounded-full"
            />
          </div>

          {/* Service Name */}
          {!subscriptionToEdit && (
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                اسم الخدمة أو الأداة <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="مثال: استضافة سحابية، أداة بريد إلكتروني"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] placeholder-neutral-400 focus:outline-none"
                required
              />
            </div>
          )}

          {/* Monthly Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                التكلفة الدورية <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="مثال: 1200"
                  value={monthlyAmountEgp}
                  onChange={(e) => setMonthlyAmountEgp(e.target.value)}
                  className="w-full h-11 px-4 pl-12 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold transition-all text-[#1A1A1A] placeholder-neutral-400 focus:outline-none"
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-400 select-none">
                  ج.م
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                يوم الفاتورة الشهري (1 - 28)
              </label>
              <input
                type="number"
                min="1"
                max="28"
                value={billingDay}
                onChange={(e) => setBillingDay(parseInt(e.target.value, 10) || 1)}
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                تاريخ البدء <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                تاريخ الانتهاء (اختياري)
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] focus:outline-none"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              ملاحظات أو تفاصيل
            </label>
            <textarea
              rows={2}
              placeholder="تفاصيل إضافية..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-3 rounded-2xl border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all resize-none text-[#1A1A1A] placeholder-neutral-400 focus:outline-none"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-semibold transition-all focus:outline-none"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 focus:outline-none"
            >
              {isSubmitting ? (
                <span>جاري الحفظ...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>حفظ الاشتراك</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubscriptionModal;
