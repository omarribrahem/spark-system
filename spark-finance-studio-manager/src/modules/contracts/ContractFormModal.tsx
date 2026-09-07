import React, { useState, useEffect } from 'react';
import { X, FileSignature, CheckCircle2, AlertCircle } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import { ClientRepository, ClientRecord, ContractRepository, MarketingContractRecord } from '../../database/repositories';
import { ContractStatus } from '../../domain/models/contract';
import { Select } from '../../ui/athredu/Select';

export interface ContractFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (contractId: string) => void;
  contractToEdit?: MarketingContractRecord | null;
  preselectedClientId?: string | null;
}

export const ContractFormModal: React.FC<ContractFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  contractToEdit,
  preselectedClientId,
}) => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [monthlyAmountEgp, setMonthlyAmountEgp] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [status, setStatus] = useState<ContractStatus>('active');
  const [notes, setNotes] = useState<string>('');
  const [generateInitialDue, setGenerateInitialDue] = useState<boolean>(true);

  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Initialize today's date
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      const today = new Date().toISOString().split('T')[0];

      if (contractToEdit) {
        setClientId(contractToEdit.client_id);
        setMonthlyAmountEgp(String(contractToEdit.monthly_amount / 100));
        setStartDate(contractToEdit.start_date);
        setEndDate(contractToEdit.end_date || '');
        setStatus(contractToEdit.status);
        setNotes(contractToEdit.notes || '');
        setGenerateInitialDue(false); // don't regenerate due on edit
      } else {
        setClientId(preselectedClientId || '');
        setMonthlyAmountEgp('');
        setStartDate(today);
        setEndDate('');
        setStatus('active');
        setNotes('');
        setGenerateInitialDue(true);
      }

      // Load clients
      (async () => {
        try {
          setIsLoadingClients(true);
          const driver = await getDatabaseDriver();
          const clientRepo = new ClientRepository(driver);
          const list = await clientRepo.list({ activeOnly: true });
          setClients(list);
          if (!preselectedClientId && !contractToEdit && list.length > 0) {
            setClientId(list[0].id);
          }
        } catch (e) {
          console.error('Failed to load clients for contract modal:', e);
        } finally {
          setIsLoadingClients(false);
        }
      })();
    }
  }, [isOpen, contractToEdit, preselectedClientId]);

  // Handle ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const numericEgp = parseFloat(monthlyAmountEgp);
    if (isNaN(numericEgp) || numericEgp <= 0) {
      setErrorMessage('يرجى إدخال قيمة اشتراك شهري صحيحة أكبر من الصفر');
      return;
    }

    if (!clientId) {
      setErrorMessage('يرجى اختيار العميل');
      return;
    }

    if (!startDate) {
      setErrorMessage('يرجى تحديد تاريخ بدء العقد');
      return;
    }

    if (endDate && endDate < startDate) {
      setErrorMessage('تاريخ انتهاء العقد لا يمكن أن يكون قبل تاريخ البدء');
      return;
    }

    const monthlyAmountPiasters = Math.round(numericEgp * 100);

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();
      const contractRepo = new ContractRepository(driver);

      if (contractToEdit) {
        // Edit existing contract
        const now = new Date().toISOString();
        await driver.execute(
          `UPDATE marketing_contracts
           SET client_id = ?, monthly_amount = ?, start_date = ?, end_date = ?, status = ?, notes = ?, updated_at = ?
           WHERE id = ?;`,
          [
            clientId,
            monthlyAmountPiasters,
            startDate,
            endDate || null,
            status,
            notes || null,
            now,
            contractToEdit.id,
          ]
        );
        onSaved(contractToEdit.id);
      } else {
        // Create new contract with locked rate
        const newContract = await contractRepo.createMarketingContract({
          clientId,
          monthlyAmount: monthlyAmountPiasters,
          startDate,
          endDate: endDate || null,
          status,
          notes: notes || null,
        });

        // Immediately create initial monthly due if start date is current/past and option is selected
        if (generateInitialDue) {
          const startParts = startDate.split('-');
          const startYear = parseInt(startParts[0], 10);
          const startMonth = parseInt(startParts[1], 10);
          const startDueDay = `${startYear}-${String(startMonth).padStart(2, '0')}-01`;

          try {
            await contractRepo.generateMonthlyDue(
              newContract.id,
              startYear,
              startMonth,
              startDueDay
            );
          } catch (dueErr) {
            console.warn('Initial monthly due already exists or skipped:', dueErr);
          }
        }

        onSaved(newContract.id);
      }

      onClose();
    } catch (err: unknown) {
      console.error('Failed to save contract:', err);
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
              <FileSignature className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">
                {contractToEdit ? 'تعديل عقد التسويق' : 'عقد تسويق شهري جديد'}
              </h2>
              <p className="text-xs text-neutral-400">
                تحديد القيمة الشهرية والشروط
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
              disabled={isLoadingClients || !!contractToEdit}
              placeholder={isLoadingClients ? 'جاري التحميل...' : 'اختر العميل...'}
              options={clients.map((c) => ({
                value: c.id,
                label: `${c.name}${c.company_name ? ` (${c.company_name})` : ''}`,
              }))}
              className="h-11 rounded-full"
            />
          </div>

          {/* Monthly Amount */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              قيمة الاشتراك الشهري <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                placeholder="مثال: 5000"
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

          {/* Dates Row */}
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

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              حالة العقد
            </label>
            <Select
              value={status}
              onValueChange={(val) => setStatus(val as ContractStatus)}
              options={[
                { value: 'active', label: 'نشط (Active)' },
                { value: 'draft', label: 'مسودة (Draft)' },
                { value: 'paused', label: 'معلق مؤقتاً (Paused)' },
                { value: 'ended', label: 'منتهي (Ended)' },
                { value: 'cancelled', label: 'ملغي (Cancelled)' },
              ]}
              className="h-11 rounded-full"
            />
          </div>

          {/* Initial Due Checkbox */}
          {!contractToEdit && (
            <div className="p-3.5 bg-neutral-50 rounded-2xl flex items-center gap-3">
              <input
                type="checkbox"
                id="generateInitialDue"
                checked={generateInitialDue}
                onChange={(e) => setGenerateInitialDue(e.target.checked)}
                className="w-4 h-4 rounded text-[#004AC6] border-neutral-300"
              />
              <label htmlFor="generateInitialDue" className="text-xs text-[#1A1A1A] cursor-pointer">
                <span className="font-semibold block">توليد أول استحقاق شهري تلقائياً</span>
                <span className="text-neutral-400 text-[11px]">إنشاء استحقاق الشهر الحالي بقيمة العقد</span>
              </label>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              ملاحظات وشروط العقد
            </label>
            <textarea
              rows={2}
              placeholder="شروط إضافية أو خدمات مشمولة..."
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
                  <span>{contractToEdit ? 'حفظ التعديلات' : 'اعتماد العقد'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContractFormModal;
