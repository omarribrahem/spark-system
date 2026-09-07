import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PlusCircle,
  Search,
  Paperclip,
  CheckCircle2,
  XCircle,
  Eye,
  Wallet,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  PaymentRecord,
  PaymentAllocationRecord,
  ClientRecord,
  ClientRepository,
  PaymentRepository,
} from '../../database/repositories';
import { getDatabaseDriver } from '../../database/driver';
import { PaymentMethod } from '../../domain/models/financial';
import { BdiCurrency, BdiDate } from '../../ui/bdi';
import { SkeletonCard, EmptyState, ActionableError } from '../../ui/feedback';
import { Select } from '../../ui/athredu/Select';
import { PaymentEntryModal } from './PaymentEntryModal';
import { PaymentVoidModal } from './PaymentVoidModal';
import { AttachmentViewer } from './AttachmentViewer';

export interface PaymentWithClientAndAllocations extends PaymentRecord {
  clientName: string;
  clientCompany: string | null;
  allocations: PaymentAllocationRecord[];
  totalAllocated: number;
  unallocatedCredit: number;
}

export interface PaymentsListProps {
  onRequestNewPayment?: boolean;
  onResetNewPaymentRequest?: () => void;
  preselectedClientId?: string | null;
  onOpenHeaderForm?: () => void;
}

export const PaymentsList: React.FC<PaymentsListProps> = ({
  onRequestNewPayment,
  onResetNewPaymentRequest,
  preselectedClientId,
  onOpenHeaderForm,
}) => {
  const [payments, setPayments] = useState<PaymentWithClientAndAllocations[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters
  const [selectedClientId, setSelectedClientId] = useState<string>(preselectedClientId || 'all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedMethod, setSelectedMethod] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [paymentToVoid, setPaymentToVoid] = useState<PaymentRecord | null>(null);
  const [viewingAllocationsPayment, setViewingAllocationsPayment] = useState<PaymentWithClientAndAllocations | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<{ path: string; name?: string } | null>(null);

  useEffect(() => {
    if (onRequestNewPayment) {
      setIsEntryModalOpen(true);
      if (onResetNewPaymentRequest) {
        onResetNewPaymentRequest();
      }
    }
  }, [onRequestNewPayment, onResetNewPaymentRequest]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const clientRepo = new ClientRepository(driver);
      const allClients = await clientRepo.list();
      setClients(allClients);

      const clientMap = new Map<string, ClientRecord>();
      allClients.forEach((c) => clientMap.set(c.id, c));

      // Query payments with receipts joined
      const paymentRepo = new PaymentRepository(driver);
      const paymentRows = await paymentRepo.list();

      // Fetch allocations for each payment
      const fullList: PaymentWithClientAndAllocations[] = await Promise.all(
        paymentRows.map(async (p) => {
          const allocRows = await driver.query<PaymentAllocationRecord>(
            `SELECT id, payment_id, target_type, target_id, amount, created_at
             FROM payment_allocations WHERE payment_id = ? ORDER BY created_at ASC;`,
            [p.id]
          );

          const client = clientMap.get(p.client_id);
          const totalAllocated = allocRows.reduce((sum, a) => sum + a.amount, 0);
          const unallocatedCredit = p.status === 'active' ? Math.max(0, p.amount - totalAllocated) : 0;

          return {
            ...p,
            clientName: client?.name || 'عميل غير معروف',
            clientCompany: client?.company_name || null,
            allocations: allocRows,
            totalAllocated,
            unallocatedCredit,
          };
        })
      );

      setPayments(fullList);
    } catch (err: unknown) {
      console.error('Failed to load payments:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      if (selectedClientId !== 'all' && p.client_id !== selectedClientId) return false;
      if (selectedStatus !== 'all' && p.status !== selectedStatus) return false;
      if (selectedMethod !== 'all' && p.method !== selectedMethod) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchClient = p.clientName.toLowerCase().includes(q);
        const matchCompany = p.clientCompany?.toLowerCase().includes(q) ?? false;
        const matchNote = p.note?.toLowerCase().includes(q) ?? false;
        const matchReason = p.void_reason?.toLowerCase().includes(q) ?? false;
        return matchClient || matchCompany || matchNote || matchReason;
      }

      return true;
    });
  }, [payments, selectedClientId, selectedStatus, selectedMethod, searchQuery]);

  // Summary KPIs
  const totalCollectedActivePiasters = useMemo(() => {
    return filteredPayments
      .filter((p) => p.status === 'active')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPayments]);

  const totalVoidedPiasters = useMemo(() => {
    return filteredPayments
      .filter((p) => p.status === 'void')
      .reduce((sum, p) => sum + p.amount, 0);
  }, [filteredPayments]);

  const totalSurplusCreditPiasters = useMemo(() => {
    return filteredPayments
      .filter((p) => p.status === 'active')
      .reduce((sum, p) => sum + p.unallocatedCredit, 0);
  }, [filteredPayments]);

  const getMethodBadge = (m: PaymentMethod) => {
    switch (m) {
      case 'cash':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">نقدي</span>;
      case 'vodafone_cash':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">فودافون كاش</span>;
      case 'instapay':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">إنستاباي</span>;
      case 'bank_transfer':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">تحويل بنكي</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{m}</span>;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Collected */}
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
            <span>إجمالي التحصيلات النشطة</span>
            <span className="p-1.5 rounded-full bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <BdiCurrency piasters={totalCollectedActivePiasters} className="text-xl font-bold text-[#1A1A1A]" />
          <div className="mt-2 text-[11px] text-neutral-400">
            {filteredPayments.filter((p) => p.status === 'active').length} دفعة مكتملة
          </div>
        </div>

        {/* Total Surplus Credit */}
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
            <span>رصيد دائن فائض للعملاء</span>
            <span className="p-1.5 rounded-full bg-blue-50 text-[#004AC6]">
              <Wallet className="w-4 h-4" />
            </span>
          </div>
          <BdiCurrency piasters={totalSurplusCreditPiasters} className="text-xl font-bold text-[#004AC6]" />
          <div className="mt-2 text-[11px] text-neutral-400">
            متاح للاستخدام في المستحقات القادمة
          </div>
        </div>

        {/* Total Voided */}
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between text-xs text-neutral-500 mb-2">
            <span>مبالغ ملغاة</span>
            <span className="p-1.5 rounded-full bg-rose-50 text-rose-600">
              <XCircle className="w-4 h-4" />
            </span>
          </div>
          <BdiCurrency piasters={totalVoidedPiasters} className="text-xl font-bold text-neutral-400 line-through" />
          <div className="mt-2 text-[11px] text-rose-600 font-medium">
            {filteredPayments.filter((p) => p.status === 'void').length} دفعة ملغاة
          </div>
        </div>
      </div>

      {/* Filter Toolbar & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Client Filter */}
          <div className="w-44">
            <Select
              value={selectedClientId}
              onValueChange={(val) => setSelectedClientId(val)}
              placeholder="جميع العملاء"
              options={[
                { value: "all", label: "جميع العملاء" },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>

          {/* Status Filter */}
          <div className="w-32">
            <Select
              value={selectedStatus}
              onValueChange={(val) => setSelectedStatus(val)}
              placeholder="الحالة"
              options={[
                { value: "all", label: "الكل" },
                { value: "active", label: "نشط" },
                { value: "void", label: "ملغي" },
              ]}
            />
          </div>

          {/* Method Filter */}
          <div className="w-36">
            <Select
              value={selectedMethod}
              onValueChange={(val) => setSelectedMethod(val)}
              placeholder="طريقة الدفع"
              options={[
                { value: "all", label: "جميع الطرق" },
                { value: "cash", label: "نقدي" },
                { value: "vodafone_cash", label: "فودافون كاش" },
                { value: "instapay", label: "إنستاباي" },
                { value: "bank_transfer", label: "تحويل بنكي" },
              ]}
            />
          </div>
        </div>

        {/* Search & Action CTA */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالعميل أو الملاحظة..."
              className="w-full h-11 pr-9 pl-4 text-xs font-semibold rounded-full border border-[#E5E5E5] bg-white text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              if (onOpenHeaderForm) {
                onOpenHeaderForm();
              } else {
                setIsEntryModalOpen(true);
              }
            }}
            className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 shrink-0"
          >
            <PlusCircle className="w-4 h-4" />
            <span>تسجيل دفعة</span>
          </button>
        </div>
      </div>

      {/* Table Area */}
      {isLoading ? (
        <div className="space-y-3">
          <SkeletonCard rows={2} hasHeader />
          <SkeletonCard rows={2} hasHeader />
        </div>
      ) : error ? (
        <ActionableError
          title="تعذر تحميل سجل المقبوضات"
          message={error.message}
          onRetry={loadData}
        />
      ) : filteredPayments.length === 0 ? (
        <EmptyState
          title="لا توجد دفعات مسجلة"
          description="لم يتم العثور على أي حركات دفع تطابق معايير التصفية والبحث."
          actionLabel="+ تسجيل دفعة جديدة"
          onAction={() => setIsEntryModalOpen(true)}
        />
      ) : (
        <div className="overflow-x-auto border border-[#E5E5E5] rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.03)] bg-white overflow-hidden">
          <table className="w-full text-right text-xs">
            <thead className="bg-neutral-50/80 text-neutral-500 font-semibold border-b border-[#E5E5E5]">
              <tr>
                <th className="py-3.5 px-4">التاريخ</th>
                <th className="py-3.5 px-4">العميل</th>
                <th className="py-3.5 px-4">المبلغ</th>
                <th className="py-3.5 px-4">طريقة الدفع</th>
                <th className="py-3.5 px-4">التوزيع</th>
                <th className="py-3.5 px-4">الحالة</th>
                <th className="py-3.5 px-4">المرفق</th>
                <th className="py-3.5 px-4">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filteredPayments.map((p) => (
                <tr
                  key={p.id}
                  className={`transition-colors ${
                    p.status === 'void' ? 'bg-rose-50/30 text-neutral-400' : 'hover:bg-neutral-50/60'
                  }`}
                >
                  <td className="py-3.5 px-4 font-medium whitespace-nowrap text-neutral-600">
                    <BdiDate value={p.date} format="date" />
                  </td>

                  <td className="py-3.5 px-4">
                    <span className="font-bold text-[#1A1A1A] block">{p.clientName}</span>
                    {p.clientCompany && (
                      <span className="text-[11px] text-neutral-400">{p.clientCompany}</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <BdiCurrency
                      piasters={p.amount}
                      className={`font-bold text-sm ${
                        p.status === 'void' ? 'line-through text-neutral-400' : 'text-[#1A1A1A]'
                      }`}
                    />
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {getMethodBadge(p.method)}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setViewingAllocationsPayment(p)}
                      className="inline-flex items-center gap-1 text-neutral-600 hover:text-[#004AC6] font-semibold"
                    >
                      <span>
                        {p.allocations.length > 0
                          ? `${p.allocations.length} التزام`
                          : 'رصيد دائن بالكامل'}
                      </span>
                      {p.unallocatedCredit > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 font-bold">
                          +فائض
                        </span>
                      )}
                      <Eye className="w-3.5 h-3.5 text-neutral-400" />
                    </button>
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {p.status === 'active' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>مكتمل</span>
                      </span>
                    ) : (
                      <div className="flex flex-col">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 w-fit">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>ملغي</span>
                        </span>
                        {p.void_reason && (
                          <span className="text-[10px] text-rose-600 mt-0.5 max-w-xs truncate" title={p.void_reason}>
                            {p.void_reason}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {(p.receipt_path || p.receiptPath || p.receipt_attachment_id) ? (
                      <button
                        type="button"
                        onClick={() =>
                          setViewingAttachment({
                            path: (p.receipt_path || p.receiptPath || p.receipt_attachment_id)!,
                            name: `إيصال دفعة ${p.date}`,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-semibold transition-colors"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>الإيصال</span>
                      </button>
                    ) : (
                      <span className="text-neutral-400 text-[11px]">—</span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 whitespace-nowrap">
                    {p.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => setPaymentToVoid(p)}
                        className="px-3 py-1 rounded-full text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        إلغاء
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment Entry Modal */}
      <PaymentEntryModal
        isOpen={isEntryModalOpen}
        onClose={() => setIsEntryModalOpen(false)}
        preselectedClientId={selectedClientId !== 'all' ? selectedClientId : null}
        onPaymentRecorded={loadData}
      />

      {/* Payment Void Modal */}
      <PaymentVoidModal
        isOpen={!!paymentToVoid}
        onClose={() => setPaymentToVoid(null)}
        payment={paymentToVoid}
        onVoided={loadData}
      />

      {/* Attachment Viewer Modal */}
      {viewingAttachment && (
        <AttachmentViewer
          isOpen={!!viewingAttachment}
          onClose={() => setViewingAttachment(null)}
          filePath={viewingAttachment.path}
          fileName={viewingAttachment.name}
        />
      )}

      {/* Allocations Details Modal Dialog */}
      {viewingAllocationsPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setViewingAllocationsPayment(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">تفاصيل توزيع الدفعة</h3>
                <p className="text-xs text-slate-500">
                  {viewingAllocationsPayment.clientName} — <BdiDate value={viewingAllocationsPayment.date} format="date" />
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingAllocationsPayment(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                <span className="text-slate-500">إجمالي مبلغ الدفعة:</span>
                <BdiCurrency piasters={viewingAllocationsPayment.amount} className="font-bold text-slate-900 text-sm" />
              </div>

              {viewingAllocationsPayment.allocations.length === 0 ? (
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-xs text-center font-medium">
                  المبلغ بالكامل تحول إلى رصيد دائن متاح للعميل.
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-slate-700 block">المبالغ الموزعة:</span>
                  {viewingAllocationsPayment.allocations.map((a) => (
                    <div
                      key={a.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                    >
                      <span className="text-slate-700">
                        {a.target_type === 'marketing_due'
                          ? 'مستحق عقد تسويق'
                          : a.target_type === 'client_package'
                          ? 'باقة استوديو'
                          : a.target_type}
                      </span>
                      <BdiCurrency piasters={a.amount} className="font-semibold text-emerald-700" />
                    </div>
                  ))}

                  {viewingAllocationsPayment.unallocatedCredit > 0 && (
                    <div className="p-2.5 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-between text-xs text-blue-800 font-semibold">
                      <span>فائض متبقي (رصيد دائن):</span>
                      <BdiCurrency piasters={viewingAllocationsPayment.unallocatedCredit} className="font-bold text-blue-800" />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingAllocationsPayment(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentsList;
