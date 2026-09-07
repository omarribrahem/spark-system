import React, { useState, useEffect } from 'react';
import { X, Globe, CheckCircle2, AlertCircle } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import { ClientRepository, ClientRecord, ContractRepository, WebsiteProjectRecord } from '../../database/repositories';
import { WebsiteProjectStatus } from '../../domain/models/contract';
import { Select } from '../../ui/athredu/Select';

export interface WebsiteProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (projectId: string) => void;
  projectToEdit?: WebsiteProjectRecord | null;
  preselectedClientId?: string | null;
}

export const WebsiteProjectModal: React.FC<WebsiteProjectModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  projectToEdit,
  preselectedClientId,
}) => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [totalPriceEgp, setTotalPriceEgp] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>('');
  const [status, setStatus] = useState<WebsiteProjectStatus>('new');
  const [nextPaymentAmountEgp, setNextPaymentAmountEgp] = useState<string>('');
  const [nextPaymentDate, setNextPaymentDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      const today = new Date().toISOString().split('T')[0];

      if (projectToEdit) {
        setClientId(projectToEdit.client_id);
        setName(projectToEdit.name);
        setTotalPriceEgp(String(projectToEdit.total_price / 100));
        setStartDate(projectToEdit.start_date);
        setExpectedDeliveryDate(projectToEdit.expected_delivery_date || '');
        setStatus(projectToEdit.status);
        setNextPaymentAmountEgp(
          projectToEdit.next_payment_amount ? String(projectToEdit.next_payment_amount / 100) : ''
        );
        setNextPaymentDate(projectToEdit.next_payment_date || '');
        setNotes(projectToEdit.notes || '');
      } else {
        setClientId(preselectedClientId || '');
        setName('');
        setTotalPriceEgp('');
        setStartDate(today);
        setExpectedDeliveryDate('');
        setStatus('new');
        setNextPaymentAmountEgp('');
        setNextPaymentDate('');
        setNotes('');
      }

      (async () => {
        try {
          setIsLoadingClients(true);
          const driver = await getDatabaseDriver();
          const clientRepo = new ClientRepository(driver);
          const list = await clientRepo.list({ activeOnly: true });
          setClients(list);
          if (!preselectedClientId && !projectToEdit && list.length > 0) {
            setClientId(list[0].id);
          }
        } catch (e) {
          console.error('Failed to load clients:', e);
        } finally {
          setIsLoadingClients(false);
        }
      })();
    }
  }, [isOpen, projectToEdit, preselectedClientId]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const priceEgp = parseFloat(totalPriceEgp);
    if (isNaN(priceEgp) || priceEgp <= 0) {
      setErrorMessage('يرجى إدخال إجمالي سعر المشروع صحيحاً');
      return;
    }

    if (!clientId) {
      setErrorMessage('يرجى اختيار العميل');
      return;
    }

    if (!name.trim()) {
      setErrorMessage('يرجى كتابة اسم المشروع');
      return;
    }

    if (!startDate) {
      setErrorMessage('يرجى تحديد تاريخ انطلاق المشروع');
      return;
    }

    const totalPricePiasters = Math.round(priceEgp * 100);
    const nextAmountPiasters = nextPaymentAmountEgp.trim()
      ? Math.round(parseFloat(nextPaymentAmountEgp) * 100)
      : null;

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();
      const contractRepo = new ContractRepository(driver);

      if (projectToEdit) {
        const now = new Date().toISOString();
        await driver.execute(
          `UPDATE website_projects
           SET name = ?, total_price = ?, start_date = ?, expected_delivery_date = ?,
               status = ?, next_payment_amount = ?, next_payment_date = ?, notes = ?, updated_at = ?
           WHERE id = ?;`,
          [
            name.trim(),
            totalPricePiasters,
            startDate,
            expectedDeliveryDate || null,
            status,
            nextAmountPiasters,
            nextPaymentDate || null,
            notes || null,
            now,
            projectToEdit.id,
          ]
        );
        onSaved(projectToEdit.id);
      } else {
        const created = await contractRepo.createWebsiteProject({
          clientId,
          name: name.trim(),
          totalPrice: totalPricePiasters,
          startDate,
          expectedDeliveryDate: expectedDeliveryDate || null,
          nextPaymentAmount: nextAmountPiasters,
          nextPaymentDate: nextPaymentDate || null,
          notes: notes || null,
        });
        onSaved(created.id);
      }

      onClose();
    } catch (err: unknown) {
      console.error('Failed to save website project:', err);
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
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">
                {projectToEdit ? 'تعديل مشروع الموقع' : 'مشروع موقع جديد'}
              </h2>
              <p className="text-xs text-neutral-400">
                متابعة المراحل والدفعات
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
          {/* Client & Project Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                العميل <span className="text-red-500">*</span>
              </label>
              <Select
                value={clientId}
                onValueChange={setClientId}
                disabled={isLoadingClients || !!projectToEdit}
                placeholder={isLoadingClients ? 'جاري التحميل...' : 'اختر العميل...'}
                options={clients.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.company_name ? ` (${c.company_name})` : ''}`,
                }))}
                className="h-11 rounded-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                اسم المشروع <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="مثال: متجر إلكتروني"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] placeholder-neutral-400 focus:outline-none"
                required
              />
            </div>
          </div>

          {/* Total Price & Milestone Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                إجمالي تكلفة المشروع <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="مثال: 25000"
                  value={totalPriceEgp}
                  onChange={(e) => setTotalPriceEgp(e.target.value)}
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
                المرحلة التنفيذية
              </label>
              <Select
                value={status}
                onValueChange={(val) => setStatus(val as WebsiteProjectStatus)}
                options={[
                  { value: 'new', label: '1. تعاقد وتخطيط (15%)' },
                  { value: 'in_progress', label: '2. تصميم وتطوير (50%)' },
                  { value: 'waiting', label: '3. مراجعة العميل (80%)' },
                  { value: 'completed', label: '4. تم التسليم (100%)' },
                  { value: 'cancelled', label: 'ملغي' },
                ]}
                className="h-11 rounded-full"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                تاريخ الانطلاق <span className="text-red-500">*</span>
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
                تاريخ التسليم المتوقع
              </label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] focus:outline-none"
              />
            </div>
          </div>

          {/* Next Installment */}
          <div className="p-4 bg-neutral-50 rounded-2xl space-y-3">
            <span className="text-xs font-semibold text-[#1A1A1A] block">
              الدفعة القادمة
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                  قيمة الدفعة (ج.م)
                </label>
                <input
                  type="number"
                  placeholder="مثال: 10000"
                  value={nextPaymentAmountEgp}
                  onChange={(e) => setNextPaymentAmountEgp(e.target.value)}
                  className="w-full h-10 px-3 rounded-full border border-[#E5E5E5] text-xs font-semibold focus:border-[#004AC6] transition-all text-[#1A1A1A] bg-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-neutral-600 mb-1">
                  موعد الاستحقاق
                </label>
                <input
                  type="date"
                  value={nextPaymentDate}
                  onChange={(e) => setNextPaymentDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-full border border-[#E5E5E5] text-xs focus:border-[#004AC6] transition-all text-[#1A1A1A] bg-white focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              ملاحظات وتفاصيل
            </label>
            <textarea
              rows={2}
              placeholder="نطاق العمل والتفاصيل الفنية..."
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
                  <span>{projectToEdit ? 'حفظ التعديلات' : 'تسجيل المشروع'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default WebsiteProjectModal;
