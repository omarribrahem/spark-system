import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X,
  User,
  Calendar,
  Wallet,
  FileText,
  CheckCircle2,
  AlertCircle,
  ArrowRightLeft,
  DollarSign,
  Paperclip,
} from 'lucide-react';
import {
  ClientRecord,
  ClientRepository,
  PaymentRepository,
  RecordPaymentInput,
} from '../../database/repositories';
import { getDatabaseDriver } from '../../database/driver';
import { TargetDue, PaymentMethod, AllocationResult } from '../../domain/models/financial';
import { calculateAllocation } from '../../domain/calculators/payment-allocator';
import { BdiCurrency } from '../../ui/bdi';
import { Select } from '../../ui/athredu/Select';

export interface PaymentEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedClientId?: string | null;
  onPaymentRecorded: () => void;
}

interface OpenTargetItem extends TargetDue {
  title: string;
  subtitle: string;
  totalBasePiasters: number;
  alreadyPaidPiasters: number;
}

export const PaymentEntryModal: React.FC<PaymentEntryModalProps> = ({
  isOpen,
  onClose,
  preselectedClientId,
  onPaymentRecorded,
}) => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [amountInput, setAmountInput] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [note, setNote] = useState<string>('');
  const [receiptPath, setReceiptPath] = useState<string>('');

  // Target obligations for selected client
  const [openTargets, setOpenTargets] = useState<OpenTargetItem[]>([]);
  const [requestedAllocations, setRequestedAllocations] = useState<{ [targetId: string]: string }>({});
  const [autoFillRemaining, setAutoFillRemaining] = useState<boolean>(true);

  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Load active clients on open
  useEffect(() => {
    if (isOpen) {
      const fetchClients = async () => {
        try {
          setIsLoadingClients(true);
          const driver = await getDatabaseDriver();
          const clientRepo = new ClientRepository(driver);
          const all = await clientRepo.list({ activeOnly: true });
          setClients(all);

          if (preselectedClientId) {
            setSelectedClientId(preselectedClientId);
          } else if (all.length > 0) {
            setSelectedClientId(all[0].id);
          }
        } catch (err) {
          console.error('Failed to load clients in PaymentEntryModal:', err);
        } finally {
          setIsLoadingClients(false);
        }
      };
      fetchClients();

      // Reset form fields
      setAmountInput('');
      setDate(new Date().toISOString().split('T')[0]);
      setMethod('cash');
      setNote('');
      setReceiptPath('');
      setRequestedAllocations({});
      setFormError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, preselectedClientId]);

  // Load open targets when selected client changes
  const loadClientTargets = useCallback(async (cId: string) => {
    if (!cId) {
      setOpenTargets([]);
      return;
    }
    try {
      const driver = await getDatabaseDriver();

      // 1. Fetch Marketing Monthly Dues
      const duesRows = await driver.query<{
        id: string;
        contract_id: string;
        year: number;
        month: number;
        base_amount: number;
        due_date: string;
        paid_amount: number;
      }>(
        `SELECT d.id, d.contract_id, d.year, d.month, d.base_amount, d.due_date,
                COALESCE(SUM(CASE WHEN p.status = 'active' THEN pa.amount ELSE 0 END), 0) AS paid_amount
         FROM marketing_monthly_dues d
         JOIN marketing_contracts c ON d.contract_id = c.id
         LEFT JOIN payment_allocations pa ON pa.target_type = 'marketing_due' AND pa.target_id = d.id
         LEFT JOIN payments p ON pa.payment_id = p.id
         WHERE c.client_id = ?
         GROUP BY d.id
         HAVING (d.base_amount - paid_amount) > 0
         ORDER BY d.due_date ASC;`,
        [cId]
      );

      const targets: OpenTargetItem[] = duesRows.map((d) => {
        const remaining = Math.max(0, d.base_amount - d.paid_amount);
        return {
          targetType: 'marketing_due',
          targetId: d.id,
          duePiasters: remaining,
          title: `مستحق عقد تسويق - شهر ${d.month} / ${d.year}`,
          subtitle: `تاريخ الاستحقاق: ${d.due_date}`,
          totalBasePiasters: d.base_amount,
          alreadyPaidPiasters: d.paid_amount,
        };
      });

      setOpenTargets(targets);
      setRequestedAllocations({});
    } catch (err) {
      console.error('Failed to load targets for client:', err);
    }
  }, []);

  useEffect(() => {
    if (selectedClientId) {
      loadClientTargets(selectedClientId);
    } else {
      setOpenTargets([]);
    }
  }, [selectedClientId, loadClientTargets]);

  // Convert input EGP to integer piasters
  const paymentPiasters = useMemo(() => {
    const num = parseFloat(amountInput);
    if (isNaN(num) || num <= 0) return 0;
    return Math.round(num * 100);
  }, [amountInput]);

  // Compute live allocation math
  const allocationCalculation = useMemo<AllocationResult | { error: string } | null>(() => {
    if (paymentPiasters <= 0) return null;

    try {
      const targetsWithRequests: TargetDue[] = openTargets.map((t) => {
        const customEgp = requestedAllocations[t.targetId];
        if (customEgp !== undefined && customEgp.trim() !== '') {
          const reqPiasters = Math.round(parseFloat(customEgp) * 100);
          if (isNaN(reqPiasters) || reqPiasters < 0) {
            throw new Error(`مبلغ التخصيص للمستحق "${t.title}" غير صالح`);
          }
          return {
            ...t,
            requestedPiasters: reqPiasters,
          };
        }
        return {
          ...t,
          requestedPiasters: undefined,
        };
      });

      return calculateAllocation(paymentPiasters, targetsWithRequests, {
        autoFillRemaining,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'خطأ في حساب توزيع الدفعة';
      return { error: msg };
    }
  }, [paymentPiasters, openTargets, requestedAllocations, autoFillRemaining]);

  // Handle ESC
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
    setFormError(null);

    if (!selectedClientId) {
      setFormError('يرجى اختيار العميل أولاً');
      return;
    }

    if (paymentPiasters <= 0) {
      setFormError('يرجى إدخال مبلغ دفع صالح أكبر من الصفر');
      return;
    }

    if (!date) {
      setFormError('تاريخ الاستلام إلزامي');
      return;
    }

    if (!allocationCalculation || 'error' in allocationCalculation) {
      setFormError(
        allocationCalculation && 'error' in allocationCalculation
          ? allocationCalculation.error
          : 'تعذر حساب توزيع الدفعة'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();
      const paymentRepo = new PaymentRepository(driver);

      // Prepare target due list with validated allocations
      const targetsPayload: TargetDue[] = openTargets.map((t) => {
        const customEgp = requestedAllocations[t.targetId];
        return {
          targetType: t.targetType,
          targetId: t.targetId,
          duePiasters: t.duePiasters,
          requestedPiasters:
            customEgp !== undefined && customEgp.trim() !== ''
              ? Math.round(parseFloat(customEgp) * 100)
              : undefined,
        };
      });

      const input: RecordPaymentInput = {
        clientId: selectedClientId,
        amount: paymentPiasters,
        method,
        date,
        note: note.trim() || null,
        receiptAttachmentId: receiptPath.trim() || null,
        receiptPath: receiptPath.trim() || null,
        autoFillRemaining,
        targets: targetsPayload,
      };

      await paymentRepo.recordPayment(input);
      onPaymentRecorded();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to record payment:', err);
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ الدفعة المالية';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasCalculationError = allocationCalculation && 'error' in allocationCalculation;
  const calcResult = hasCalculationError ? null : (allocationCalculation as AllocationResult | null);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-neutral-900/40 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div
        className="w-full max-w-3xl bg-white rounded-[2rem] shadow-xl border border-[#E5E5E5] overflow-hidden my-auto flex flex-col max-h-[92vh] transform transition-all animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100 bg-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">تسجيل دفعة</h2>
              <p className="text-xs text-[#707070]">
                إدخال دفعة مالية وتوزيعها على المستحقات
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {formError && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Row 1: Client & Payment Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Client Select */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>العميل <span className="text-red-500">*</span></span>
              </label>
              <Select
                value={selectedClientId}
                onValueChange={setSelectedClientId}
                disabled={isSubmitting || isLoadingClients}
                placeholder={isLoadingClients ? 'جاري تحميل العملاء...' : 'اختر العميل...'}
                options={clients.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.company_name ? ` (${c.company_name})` : ''}`,
                }))}
                className="h-11 rounded-2xl"
              />
            </div>

            {/* Payment Date */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>تاريخ الاستلام <span className="text-red-500">*</span></span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={isSubmitting}
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs text-[#1A1A1A] bg-white focus:outline-none transition-all text-left"
              />
            </div>
          </div>

          {/* Row 2: Amount & Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount EGP */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-neutral-400" />
                <span>المبلغ المستلم <span className="text-red-500">*</span></span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  disabled={isSubmitting}
                  className="w-full pl-12 pr-4 h-11 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-bold font-mono text-[#1A1A1A] bg-white focus:outline-none transition-all text-left"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-400 select-none">
                  ج.م
                </span>
              </div>
              {paymentPiasters > 0 && (
                <div className="mt-1 text-[11px] text-neutral-400 flex items-center gap-1">
                  <span>القيمة بالقروش:</span>
                  <span className="font-mono font-semibold text-neutral-600">{paymentPiasters} قرش</span>
                </div>
              )}
            </div>

            {/* Payment Method Radio Cards */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                طريقة الدفع <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'cash', label: 'نقدي (Cash)' },
                  { id: 'vodafone_cash', label: 'فودافون كاش' },
                  { id: 'instapay', label: 'إنستاباي' },
                  { id: 'bank_transfer', label: 'تحويل بنكي' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id as PaymentMethod)}
                    className={`px-3 py-2 rounded-full text-xs font-semibold border transition-all text-center ${
                      method === m.id
                        ? 'bg-[#004AC6] text-white border-[#004AC6] shadow-sm'
                        : 'bg-neutral-100 text-neutral-700 border-transparent hover:bg-neutral-200'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Allocation & Splitting Section */}
          <div className="pt-2 border-t border-neutral-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5">
                  <ArrowRightLeft className="w-4 h-4 text-[#004AC6]" />
                  <span>توزيع الدفعة على المستحقات</span>
                </h3>
                <p className="text-[11px] text-neutral-400">
                  {openTargets.length > 0
                    ? `يوجد ${openTargets.length} التزام مالي مفتوح للعميل`
                    : 'لا توجد مستحقات مفتوحة؛ سيتحول كامل المبلغ إلى رصيد دائن للعميل'}
                </p>
              </div>

              {openTargets.length > 0 && (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-neutral-700 select-none">
                    <input
                      type="checkbox"
                      checked={autoFillRemaining}
                      onChange={(e) => setAutoFillRemaining(e.target.checked)}
                      className="rounded text-[#004AC6]"
                    />
                    <span>توزيع الفائض تسلسلياً (FIFO)</span>
                  </label>
                </div>
              )}
            </div>

            {/* Live Calculation Banner */}
            {calcResult && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block text-[11px]">إجمالي الدفعة:</span>
                  <BdiCurrency piasters={calcResult.totalPaymentPiasters} className="font-bold text-slate-900 text-sm" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">المبلغ الموزع على المستحقات:</span>
                  <BdiCurrency piasters={calcResult.totalAllocatedPiasters} className="font-bold text-emerald-700 text-sm" />
                </div>
                <div>
                  <span className="text-slate-500 block text-[11px]">فائض متبقي (رصيد دائن):</span>
                  <BdiCurrency
                    piasters={calcResult.unallocatedCreditPiasters}
                    className={`font-bold text-sm ${
                      calcResult.unallocatedCreditPiasters > 0 ? 'text-blue-700' : 'text-slate-500'
                    }`}
                  />
                </div>
              </div>
            )}

            {/* Over-allocation warning / error */}
            {hasCalculationError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{(allocationCalculation as { error: string }).error}</span>
              </div>
            )}

            {/* Target obligations rows */}
            {openTargets.length > 0 && (
              <div className="space-y-2 border border-slate-200 rounded-2xl p-3 bg-white">
                {openTargets.map((target) => {
                  const allocItem = calcResult?.allocations.find((a) => a.targetId === target.targetId);
                  const currentAllocPiasters = allocItem ? allocItem.allocatedPiasters : 0;

                  return (
                    <div
                      key={target.targetId}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <span className="font-bold text-slate-900 block">{target.title}</span>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          <span>{target.subtitle}</span>
                          <span>•</span>
                          <span>المستحق الأصلي: <BdiCurrency piasters={target.duePiasters} /></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Custom Requested Amount Input */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-500">تخصيص يدوي:</span>
                          <div className="relative w-24">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={target.duePiasters / 100}
                              value={requestedAllocations[target.targetId] ?? ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRequestedAllocations((prev) => ({
                                  ...prev,
                                  [target.targetId]: val,
                                }));
                              }}
                              placeholder="تلقائي"
                              className="w-full pl-6 pr-2 py-1.5 text-xs font-mono font-semibold rounded-lg border border-neutral-300 focus:border-[#004AC6] focus:outline-none bg-white text-left"
                            />
                            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                              ج.م
                            </span>
                          </div>
                        </div>

                        {/* Allocated indicator */}
                        <div className="text-left shrink-0 min-w-[80px]">
                          <span className="text-[10px] text-slate-500 block">المخصص فعلياً:</span>
                          <BdiCurrency piasters={currentAllocPiasters} className="font-bold text-emerald-700" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Row 3: Notes & Receipt Path */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>ملاحظات الدفعة (اختياري)</span>
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="رقم مرجعي، تفاصيل التحويل، أو المودع..."
                className="w-full px-3.5 py-2 rounded-xl border border-neutral-300 focus:border-[#004AC6] text-xs text-neutral-900 bg-white placeholder:text-neutral-400 focus:outline-none transition-all resize-none"
                disabled={isSubmitting}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                <span>مسار أو اسم ملف إيصال الدفع (اختياري)</span>
              </label>
              <input
                type="text"
                dir="ltr"
                value={receiptPath}
                onChange={(e) => setReceiptPath(e.target.value)}
                placeholder="receipts/2026/09/instapay-01928.png"
                className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-300 focus:border-[#004AC6] text-xs font-mono text-neutral-900 bg-white placeholder:text-neutral-400 focus:outline-none transition-all text-left"
                disabled={isSubmitting}
              />
              <p className="mt-1 text-[10px] text-slate-400">
                يتم ربط الإيصال بالدفعة ويمكن استعراضه لاحقاً من سجل المعاملات.
              </p>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-end gap-2.5 shrink-0">
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
              disabled={isSubmitting || paymentPiasters <= 0 || !!hasCalculationError}
              className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري التسجيل...' : 'تأكيد وحفظ الدفعة'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PaymentEntryModal;
