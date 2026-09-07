import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Building2,
  Phone,
  Wallet,
  CalendarCheck,
  FileSignature,
  Package,
  Layers,
  Clock,
  Video,
  AlertTriangle,
  PlusCircle,
  Edit,
  Archive,
  ShieldCheck,
} from 'lucide-react';
import {
  ClientRecord,
  ClientRepository,
  PaymentRepository,
  PackageRepository,
  BookingRepository,
  PaymentRecord,
  PaymentAllocationRecord,
  ClientPackageWithItems,
  StudioBookingRecord,
  MarketingContractRecord,
  MarketingMonthlyDueRecord,
} from '../../database/repositories';
import { getDatabaseDriver } from '../../database/driver';
import { BdiCurrency, BdiDate, BdiText } from '../../ui/bdi';
import { LoadingSpinner, EmptyState, ActionableError } from '../../ui/feedback';

export type ProfileTab = 'overview' | 'contracts' | 'packages' | 'bookings' | 'ledger';

export interface ClientProfile360Props {
  clientId: string;
  isOpen: boolean;
  onClose: () => void;
  onEditClient?: (client: ClientRecord) => void;
  onRecordPayment?: (client: ClientRecord) => void;
  onVoidPayment?: (payment: PaymentRecord) => void;
}

interface DueWithPaid extends MarketingMonthlyDueRecord {
  paidAmount: number;
  remainingAmount: number;
}

export const ClientProfile360: React.FC<ClientProfile360Props> = ({
  clientId,
  isOpen,
  onClose,
  onEditClient,
  onRecordPayment,
  onVoidPayment,
}) => {
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);

  // Client Data States
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [contracts, setContracts] = useState<MarketingContractRecord[]>([]);
  const [dues, setDues] = useState<DueWithPaid[]>([]);
  const [packages, setPackages] = useState<ClientPackageWithItems[]>([]);
  const [bookings, setBookings] = useState<StudioBookingRecord[]>([]);
  const [payments, setPayments] = useState<Array<PaymentRecord & { allocations: PaymentAllocationRecord[] }>>([]);
  const [creditPiasters, setCreditPiasters] = useState(0);

  // Action states
  const [isArchiving, setIsArchiving] = useState(false);
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  const loadAllData = useCallback(async () => {
    try {
      setIsLoading(true);
      setLoadError(null);
      const driver = await getDatabaseDriver();

      const clientRepo = new ClientRepository(driver);
      const paymentRepo = new PaymentRepository(driver);
      const packageRepo = new PackageRepository(driver);
      const bookingRepo = new BookingRepository(driver);

      // 1. Fetch Client
      const c = await clientRepo.getById(clientId);
      if (!c) {
        throw new Error(`تعذر العثور على العميل بالمعرف: ${clientId}`);
      }
      setClient(c);

      // 2. Fetch Client Credit
      const credit = await paymentRepo.getClientCreditPiasters(clientId);
      setCreditPiasters(credit);

      // 3. Fetch Contracts & Dues
      const contractRows = await driver.query<MarketingContractRecord>(
        `SELECT id, client_id, monthly_amount, start_date, end_date, status, notes, created_at, updated_at
         FROM marketing_contracts WHERE client_id = ? ORDER BY start_date DESC;`,
        [clientId]
      );
      setContracts(contractRows);

      // Fetch Dues for all client's contracts
      const duesWithPaidRows = await driver.query<DueWithPaid>(
        `SELECT d.id, d.contract_id, d.year, d.month, d.base_amount, d.due_date, d.status, d.created_at, d.updated_at,
                COALESCE(SUM(CASE WHEN p.status = 'active' THEN pa.amount ELSE 0 END), 0) AS paidAmount,
                MAX(0, d.base_amount - COALESCE(SUM(CASE WHEN p.status = 'active' THEN pa.amount ELSE 0 END), 0)) AS remainingAmount
         FROM marketing_monthly_dues d
         JOIN marketing_contracts c ON d.contract_id = c.id
         LEFT JOIN payment_allocations pa ON pa.target_type = 'marketing_due' AND pa.target_id = d.id
         LEFT JOIN payments p ON pa.payment_id = p.id
         WHERE c.client_id = ?
         GROUP BY d.id
         ORDER BY d.due_date DESC;`,
        [clientId]
      );
      setDues(duesWithPaidRows);

      // 4. Fetch Packages
      const clientPkgs = await packageRepo.listByClient(clientId);
      setPackages(clientPkgs);

      // 5. Fetch Studio Bookings
      const clientBookings = await bookingRepo.list({ clientId });
      setBookings(clientBookings);

      // 6. Fetch Payments with their allocations
      const paymentRows = await paymentRepo.listByClient(clientId);
      const fullPayments = await Promise.all(
        paymentRows.map(async (p) => {
          const allocs = await driver.query<PaymentAllocationRecord>(
            `SELECT id, payment_id, target_type, target_id, amount, created_at
             FROM payment_allocations WHERE payment_id = ?;`,
            [p.id]
          );
          return { ...p, allocations: allocs };
        })
      );
      setPayments(fullPayments);
    } catch (err: unknown) {
      console.error('Failed to load client 360 profile:', err);
      setLoadError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (isOpen && clientId) {
      loadAllData();
    }
  }, [isOpen, clientId, loadAllData]);

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

  // Aggregated KPIs
  const totalPaidPiasters = payments
    .filter((p) => p.status === 'active')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalOutstandingDuesPiasters = dues.reduce(
    (sum, d) => sum + (d.remainingAmount ?? 0),
    0
  );

  const activeContractsCount = contracts.filter((c) => c.status === 'active').length;

  // Remaining package hours and reels
  let remainingMinutes = 0;
  let remainingReels = 0;
  for (const pkg of packages) {
    if (pkg.status !== 'cancelled') {
      for (const item of pkg.items) {
        if (item.unit === 'hours') {
          remainingMinutes += Math.max(0, item.purchased_quantity - item.used_quantity);
        } else if (item.unit === 'reels') {
          remainingReels += Math.max(0, item.purchased_quantity - item.used_quantity);
        }
      }
    }
  }

  // Next upcoming booking
  const today = new Date().toISOString().split('T')[0];
  const upcomingBookings = bookings
    .filter((b) => b.date >= today && b.status !== 'cancelled')
    .sort((a, b) => (a.date === b.date ? a.planned_start.localeCompare(b.planned_start) : a.date.localeCompare(b.date)));
  const nextBooking = upcomingBookings[0] ?? null;

  // Toggle archive
  const handleToggleArchive = async () => {
    if (!client) return;
    try {
      setIsArchiving(true);
      const driver = await getDatabaseDriver();
      const clientRepo = new ClientRepository(driver);
      if (client.active === 1) {
        await clientRepo.archive(client.id);
      } else {
        await clientRepo.unarchive(client.id);
      }
      await loadAllData();
    } catch (err: unknown) {
      console.error('Failed to toggle client archive status:', err);
    } finally {
      setIsArchiving(false);
    }
  };

  // Cancel Booking
  const handleCancelBooking = async (bookingId: string) => {
    try {
      setCancellingBookingId(bookingId);
      const driver = await getDatabaseDriver();
      const bookingRepo = new BookingRepository(driver);
      await bookingRepo.cancelBooking(bookingId, 'إلغاء الحجز من صفحة العميل 360');
      await loadAllData();
    } catch (err: unknown) {
      console.error('Failed to cancel booking:', err);
    } finally {
      setCancellingBookingId(null);
    }
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case 'cash':
        return 'نقدي (Cash)';
      case 'vodafone_cash':
        return 'فودافون كاش';
      case 'instapay':
        return 'إنستاباي (InstaPay)';
      case 'bank_transfer':
        return 'تحويل بنكي';
      default:
        return method;
    }
  };

  const getDueStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">مسدد بالكامل</span>;
      case 'partial':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">مسدد جزئياً</span>;
      case 'overdue':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">متأخر</span>;
      case 'due':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">مستحق اليوم</span>;
      case 'upcoming':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 border border-sky-200">قادم</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const getBookingStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">مكتمل</span>;
      case 'confirmed':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-[#004AC6] border border-blue-100">مؤكد</span>;
      case 'scheduled':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-100">مجدول</span>;
      case 'in_progress':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-100 animate-pulse">جاري الآن</span>;
      case 'cancelled':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-100">ملغي</span>;
      case 'no_show':
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">لم يحضر</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">{status}</span>;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-neutral-900/40 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div
        className="w-full max-w-5xl bg-white rounded-[2rem] shadow-xl border border-[#E5E5E5] overflow-hidden my-auto flex flex-col max-h-[92vh] transform transition-all animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header & Client Banner */}
        <div className="bg-white border-b border-neutral-100 px-6 py-5 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-[#004AC6] flex items-center justify-center font-bold text-lg shrink-0">
                {client?.name ? client.name.charAt(0) : 'ع'}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-[#1A1A1A]">
                    {client?.name || 'جاري التحميل...'}
                  </h2>
                  {client && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        client.active === 1
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {client.active === 1 ? 'نشط' : 'مؤرشف'}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-[#707070]">
                  {client?.company_name && (
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                      <span>{client.company_name}</span>
                    </span>
                  )}
                  {client?.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-neutral-400" />
                      <BdiText isPhone>{client.phone}</BdiText>
                    </span>
                  )}
                  {client?.secondary_phone && (
                    <span className="flex items-center gap-1 text-neutral-400">
                      <span>إضافي:</span>
                      <BdiText isPhone>{client.secondary_phone}</BdiText>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Header Actions */}
            <div className="flex items-center gap-2">
              {client && onRecordPayment && (
                <button
                  type="button"
                  onClick={() => onRecordPayment(client)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>تسجيل دفعة</span>
                </button>
              )}

              {client && onEditClient && (
                <button
                  type="button"
                  onClick={() => onEditClient(client)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-semibold transition-all"
                >
                  <Edit className="w-3.5 h-3.5 text-neutral-500" />
                  <span>تعديل</span>
                </button>
              )}

              {client && (
                <button
                  type="button"
                  onClick={handleToggleArchive}
                  disabled={isArchiving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-semibold transition-all"
                  title={client.active === 1 ? 'أرشفة العميل' : 'استعادة العميل'}
                >
                  <Archive className="w-3.5 h-3.5 text-neutral-500" />
                  <span>{client.active === 1 ? 'أرشفة' : 'استعادة'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
                aria-label="إغلاق"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Aggregated KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4 pt-4 border-t border-neutral-100">
            {/* Total Paid */}
            <div className="bg-neutral-50/70 p-3 rounded-2xl border border-neutral-100">
              <span className="text-[11px] font-medium text-neutral-500 block">إجمالي المسدد</span>
              <div className="mt-1">
                <BdiCurrency piasters={totalPaidPiasters} className="text-sm font-bold text-[#1A1A1A]" />
              </div>
            </div>

            {/* Outstanding Balance */}
            <div className="bg-neutral-50/70 p-3 rounded-2xl border border-neutral-100">
              <span className="text-[11px] font-medium text-neutral-500 block">مستحقات معلقة</span>
              <div className="mt-1">
                <BdiCurrency
                  piasters={totalOutstandingDuesPiasters}
                  className={`text-sm font-bold ${
                    totalOutstandingDuesPiasters > 0 ? 'text-rose-600' : 'text-neutral-700'
                  }`}
                />
              </div>
            </div>

            {/* Client Credit */}
            <div className="bg-neutral-50/70 p-3 rounded-2xl border border-neutral-100">
              <span className="text-[11px] font-medium text-neutral-500 block">رصيد دائن</span>
              <div className="mt-1">
                <BdiCurrency
                  piasters={creditPiasters}
                  className={`text-sm font-bold ${
                    creditPiasters > 0 ? 'text-emerald-600' : 'text-neutral-700'
                  }`}
                />
              </div>
            </div>

            {/* Active Contracts */}
            <div className="bg-neutral-50/70 p-3 rounded-2xl border border-neutral-100">
              <span className="text-[11px] font-medium text-neutral-500 block">عقود تسويق</span>
              <div className="mt-1 text-sm font-bold text-[#1A1A1A]">
                <BdiText>{activeContractsCount} عقود</BdiText>
              </div>
            </div>

            {/* Remaining Package Hours */}
            <div className="bg-neutral-50/70 p-3 rounded-2xl border border-neutral-100">
              <span className="text-[11px] font-medium text-neutral-500 block">ساعات استوديو</span>
              <div className="mt-1 text-sm font-bold text-[#004AC6]">
                <BdiText>
                  {Math.floor(remainingMinutes / 60)} س {remainingMinutes % 60 > 0 ? `${remainingMinutes % 60} د` : ''}
                </BdiText>
              </div>
            </div>

            {/* Remaining Reels */}
            <div className="bg-neutral-50/70 p-3 rounded-2xl border border-neutral-100">
              <span className="text-[11px] font-medium text-neutral-500 block">ريلز باقات</span>
              <div className="mt-1 text-sm font-bold text-purple-600">
                <BdiText>{remainingReels} ريلز</BdiText>
              </div>
            </div>
          </div>

          {/* Tabs Navigation */}
          <div className="flex items-center gap-1.5 mt-4 overflow-x-auto no-scrollbar">
            {[
              { id: 'overview', label: 'نظرة عامة', icon: Layers },
              { id: 'contracts', label: `العقود (${contracts.length})`, icon: FileSignature },
              { id: 'packages', label: `الباقات (${packages.length})`, icon: Package },
              { id: 'bookings', label: `الحجوزات (${bookings.length})`, icon: CalendarCheck },
              { id: 'ledger', label: `المعاملات (${payments.length})`, icon: Wallet },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as ProfileTab)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 select-none ${
                    isActive
                      ? 'bg-[#004AC6] text-white shadow-sm'
                      : 'bg-white border border-[#E5E5E5] text-[#707070] hover:text-[#1A1A1A] hover:bg-neutral-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="py-16 flex items-center justify-center">
              <LoadingSpinner size="lg" label="جاري تحميل الملف الشامل للعميل 360°..." />
            </div>
          ) : loadError ? (
            <ActionableError
              title="تعذر تحميل بيانات العميل"
              message={loadError.message}
              onRetry={loadAllData}
            />
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Next Booking Banner */}
                  {nextBooking ? (
                    <div className="p-4 rounded-[1.5rem] bg-blue-50/70 border border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#004AC6] text-white flex items-center justify-center shadow-xs">
                          <CalendarCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-[#004AC6]">الجلسة القادمة للاستوديو</span>
                          <div className="text-sm font-semibold text-neutral-800 flex items-center gap-2 mt-0.5">
                            <BdiDate value={nextBooking.date} format="date" />
                            <span>في تمام</span>
                            <BdiDate timeRange={{ start: nextBooking.planned_start, end: nextBooking.planned_end }} />
                            <span className="text-xs text-slate-500">({nextBooking.planned_minutes} دقيقة)</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        {getBookingStatusBadge(nextBooking.status)}
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs text-slate-600">
                      <span>لا توجد جلسات استوديو مجدولة قادمة لهذا العميل.</span>
                    </div>
                  )}

                  {/* Notes Card */}
                  {client?.notes && (
                    <div className="p-4 rounded-2xl bg-white border border-slate-200">
                      <h4 className="text-xs font-bold text-slate-700 mb-1">ملاحظات العميل التشغيلية</h4>
                      <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{client.notes}</p>
                    </div>
                  )}

                  {/* Split Summary: Recent Payments vs Unpaid Dues */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Unpaid / Upcoming Dues */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <span>المستحقات المفتوحة والمتأخرة</span>
                        </h4>
                        <span className="text-[11px] text-slate-500">
                          {dues.filter((d) => d.remainingAmount > 0).length} مستحق
                        </span>
                      </div>

                      {dues.filter((d) => d.remainingAmount > 0).length === 0 ? (
                        <div className="py-6 text-center text-xs text-emerald-600 font-medium">
                          ✓ جميع المستحقات مسددة بالكامل ولا توجد مديونيات معلقة
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dues
                            .filter((d) => d.remainingAmount > 0)
                            .slice(0, 5)
                            .map((d) => (
                              <div
                                key={d.id}
                                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                              >
                                <div>
                                  <span className="font-bold text-slate-800">
                                    شهر {d.month} / {d.year}
                                  </span>
                                  <div className="text-[11px] text-slate-500">
                                    تاريخ الاستحقاق: <BdiDate value={d.due_date} format="date" />
                                  </div>
                                </div>
                                <div className="text-left flex flex-col items-end gap-1">
                                  <BdiCurrency piasters={d.remainingAmount} className="font-bold text-red-600" />
                                  {getDueStatusBadge(d.status)}
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>

                    {/* Recent Payments */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-500" />
                          <span>آخر المعاملات والتحصيلات</span>
                        </h4>
                        <span className="text-[11px] text-slate-500">
                          {payments.length} معاملة
                        </span>
                      </div>

                      {payments.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">
                          لا توجد دفعات مسجلة لهذا العميل حتى الآن
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {payments.slice(0, 5).map((p) => (
                            <div
                              key={p.id}
                              className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                                p.status === 'void'
                                  ? 'bg-red-50/50 border-red-200 text-slate-400'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <BdiDate value={p.date} format="date" />
                                  <span className="text-[11px] text-slate-500">({getMethodLabel(p.method)})</span>
                                </div>
                                {p.status === 'void' && (
                                  <span className="text-[10px] text-red-600 font-medium">ملغاة: {p.void_reason}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <BdiCurrency
                                  piasters={p.amount}
                                  className={`font-bold ${p.status === 'void' ? 'line-through text-slate-400' : 'text-slate-900'}`}
                                />
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                    p.status === 'active'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {p.status === 'active' ? 'مكتمل' : 'ملغي'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CONTRACTS & DUES */}
              {activeTab === 'contracts' && (
                <div className="space-y-6">
                  {/* Contracts List */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-3">عقود التسويق والاشتراكات الشهرية</h3>
                    {contracts.length === 0 ? (
                      <EmptyState
                        title="لا توجد عقود تسويق مسجلة"
                        description="لم يتم إنشاء عقد تسويق شهري أو اشتراك لهذا العميل حتى الآن."
                      />
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {contracts.map((c) => (
                          <div key={c.id} className="p-4 rounded-2xl bg-surface-card border border-border-subtle shadow-tactile-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-900 text-sm">عقد تسويق شهري</span>
                                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                    c.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {c.status === 'active' ? 'نشط' : c.status}
                                  </span>
                                </div>
                                <div className="mt-1 text-xs text-slate-500 flex items-center gap-3">
                                  <span>تاريخ البدء: <BdiDate value={c.start_date} format="date" /></span>
                                  {c.end_date && <span>تاريخ الانتهاء: <BdiDate value={c.end_date} format="date" /></span>}
                                </div>
                              </div>

                              <div className="text-left">
                                <span className="text-xs text-neutral-500 block">القيمة الشهرية</span>
                                <BdiCurrency piasters={c.monthly_amount} className="text-lg font-bold text-neutral-900" />
                              </div>
                            </div>
                            {c.notes && (
                              <p className="mt-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                {c.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Monthly Dues Ledger Table */}
                  <div className="pt-4 border-t border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900 mb-3">جدول المستحقات الشهرية (Marketing Dues)</h3>
                    {dues.length === 0 ? (
                      <p className="text-xs text-slate-500">لا توجد دورات مستحقات مسجلة لهذا العقد.</p>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="py-3 px-4">الفترة</th>
                              <th className="py-3 px-4">تاريخ الاستحقاق</th>
                              <th className="py-3 px-4">قيمة المستحق</th>
                              <th className="py-3 px-4">المسدد</th>
                              <th className="py-3 px-4">المتبقي</th>
                              <th className="py-3 px-4">الحالة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {dues.map((d) => (
                              <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                                <td className="py-3 px-4 font-bold text-slate-900">
                                  شهر {d.month} / {d.year}
                                </td>
                                <td className="py-3 px-4 text-slate-600">
                                  <BdiDate value={d.due_date} format="date" />
                                </td>
                                <td className="py-3 px-4">
                                  <BdiCurrency piasters={d.base_amount} className="font-semibold text-slate-800" />
                                </td>
                                <td className="py-3 px-4">
                                  <BdiCurrency piasters={d.paidAmount} className="text-emerald-700 font-semibold" />
                                </td>
                                <td className="py-3 px-4">
                                  <BdiCurrency
                                    piasters={d.remainingAmount}
                                    className={`font-bold ${d.remainingAmount > 0 ? 'text-red-600' : 'text-slate-500'}`}
                                  />
                                </td>
                                <td className="py-3 px-4">
                                  {getDueStatusBadge(d.status)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: PACKAGES & REELS */}
              {activeTab === 'packages' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">باقات الاستوديو والريلز المملوكة للعميل</h3>
                  </div>

                  {packages.length === 0 ? (
                    <EmptyState
                      title="لا توجد باقات مباعة"
                      description="لم يقم العميل بشراء باقات استوديو أو ريلز بعد."
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {packages.map((pkg) => {
                        const hoursItem = pkg.items.find((i) => i.unit === 'hours');
                        const reelsItem = pkg.items.find((i) => i.unit === 'reels');

                        const hoursPurchasedM = hoursItem ? hoursItem.purchased_quantity : 0;
                        const hoursUsedM = hoursItem ? hoursItem.used_quantity : 0;
                        const hoursReservedM = hoursItem ? hoursItem.reserved_quantity : 0;
                        const hoursRemainingM = Math.max(0, hoursPurchasedM - hoursUsedM);

                        const reelsPurchased = reelsItem ? reelsItem.purchased_quantity : 0;
                        const reelsUsed = reelsItem ? reelsItem.used_quantity : 0;
                        const reelsRemaining = Math.max(0, reelsPurchased - reelsUsed);

                        return (
                          <div
                            key={pkg.id}
                            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-tactile-xs space-y-4"
                          >
                            <div className="flex items-start justify-between">
                              <div>
                                <span className="font-bold text-slate-900 text-sm block">
                                  {pkg.name_snapshot}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  تاريخ الشراء: <BdiDate value={pkg.purchased_at} format="date" />
                                </span>
                              </div>
                              <div className="text-left">
                                <BdiCurrency piasters={pkg.sold_price} className="font-bold text-slate-900" />
                                <span className="block text-[10px] text-slate-400">سعر البيع التاريخي</span>
                              </div>
                            </div>

                            {/* Hours Usage Bar */}
                            {hoursItem && (
                              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                                    <Clock className="w-3.5 h-3.5 text-[#004AC6]" />
                                    <span>رصيد ساعات الاستوديو</span>
                                  </span>
                                  <span className="font-bold text-slate-800">
                                    متبقي {Math.floor(hoursRemainingM / 60)} س {hoursRemainingM % 60 > 0 ? `${hoursRemainingM % 60} د` : ''} / {Math.floor(hoursPurchasedM / 60)} س
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden flex">
                                  <div
                                    className="bg-[#004AC6] h-full transition-all"
                                    style={{ width: `${Math.min(100, (hoursUsedM / (hoursPurchasedM || 1)) * 100)}%` }}
                                    title={`مستهلك: ${hoursUsedM} دقيقة`}
                                  />
                                  {hoursReservedM > 0 && (
                                    <div
                                      className="bg-amber-400 h-full transition-all"
                                      style={{ width: `${Math.min(100, (hoursReservedM / (hoursPurchasedM || 1)) * 100)}%` }}
                                      title={`محجوز مؤقتاً: ${hoursReservedM} دقيقة`}
                                    />
                                  )}
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                                  <span>مستهلك: {Math.floor(hoursUsedM / 60)} س ({hoursUsedM} د)</span>
                                  {hoursReservedM > 0 && <span className="text-amber-600">محجوز: {hoursReservedM} د</span>}
                                </div>
                              </div>
                            )}

                            {/* Reels Usage Bar */}
                            {reelsItem && (
                              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                                    <Video className="w-3.5 h-3.5 text-purple-500" />
                                    <span>رصيد الريلز والإنتاج</span>
                                  </span>
                                  <span className="font-bold text-slate-800">
                                    متبقي {reelsRemaining} من أصل {reelsPurchased}
                                  </span>
                                </div>
                                <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                                  <div
                                    className="bg-purple-600 h-full transition-all"
                                    style={{ width: `${Math.min(100, (reelsUsed / (reelsPurchased || 1)) * 100)}%` }}
                                  />
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  <span>تم إنتاج وتسليم: {reelsUsed} ريلز</span>
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between pt-1 text-xs">
                              <span className="text-slate-500">حالة الباقة:</span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                  pkg.status === 'active'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : pkg.status === 'fully_used'
                                    ? 'bg-slate-200 text-slate-700'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {pkg.status === 'active'
                                  ? 'نشطة'
                                  : pkg.status === 'fully_used'
                                  ? 'مكتملة الاستهلاك'
                                  : 'لم تبدأ'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: STUDIO BOOKINGS */}
              {activeTab === 'bookings' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">سجل حجوزات جلسات الاستوديو</h3>
                  </div>

                  {bookings.length === 0 ? (
                    <EmptyState
                      title="لا توجد حجوزات مسجلة"
                      description="لم يتم حجز أي جلسة استوديو لهذا العميل حتى الآن."
                    />
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                          <tr>
                            <th className="py-3 px-4">التاريخ</th>
                            <th className="py-3 px-4">الوقت المخطط</th>
                            <th className="py-3 px-4">المدة</th>
                            <th className="py-3 px-4">نوع الحجز</th>
                            <th className="py-3 px-4">الحالة</th>
                            <th className="py-3 px-4">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {bookings.map((b) => (
                            <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-900">
                                <BdiDate value={b.date} format="date" />
                              </td>
                              <td className="py-3 px-4">
                                <BdiDate timeRange={{ start: b.planned_start, end: b.planned_end }} />
                              </td>
                              <td className="py-3 px-4 text-slate-600">
                                <BdiText>{b.planned_minutes} دقيقة ({b.planned_minutes / 60} س)</BdiText>
                              </td>
                              <td className="py-3 px-4">
                                {b.client_package_id ? (
                                  <span className="text-[#004AC6] font-medium">مخصوم من باقة</span>
                                ) : b.booking_price ? (
                                  <BdiCurrency piasters={b.booking_price} />
                                ) : (
                                  <span className="text-slate-400">إيجار عادي</span>
                                )}
                              </td>
                              <td className="py-3 px-4">
                                {getBookingStatusBadge(b.status)}
                              </td>
                              <td className="py-3 px-4">
                                {b.status !== 'cancelled' && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancelBooking(b.id)}
                                    disabled={cancellingBookingId === b.id}
                                    className="px-2.5 py-1 rounded-lg text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors disabled:opacity-50"
                                  >
                                    {cancellingBookingId === b.id ? 'جاري الإلغاء...' : 'إلغاء واسترجاع الساعات'}
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: FINANCIAL LEDGER */}
              {activeTab === 'ledger' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900">سجل المقبوضات والدفعات وتوزيعها</h3>
                    {onRecordPayment && client && (
                      <button
                        type="button"
                        onClick={() => onRecordPayment(client)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#004AC6] hover:bg-[#003bb0] text-white text-xs font-semibold transition-all shadow-xs"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>تسجيل دفعة جديدة</span>
                      </button>
                    )}
                  </div>

                  {payments.length === 0 ? (
                    <EmptyState
                      title="لا توجد مقبوضات مسجلة"
                      description="لم يتم تسجيل أي دفعة مالية لهذا العميل بعد."
                      actionLabel={onRecordPayment && client ? '+ تسجيل أول دفعة' : undefined}
                      onAction={onRecordPayment && client ? () => onRecordPayment(client) : undefined}
                    />
                  ) : (
                    <div className="space-y-3">
                      {payments.map((p) => {
                        const totalAllocated = p.allocations.reduce((sum, a) => sum + a.amount, 0);
                        const surplusCredit = p.status === 'active' ? Math.max(0, p.amount - totalAllocated) : 0;

                        return (
                          <div
                            key={p.id}
                            className={`p-4 rounded-2xl border transition-all ${
                              p.status === 'void'
                                ? 'bg-red-50/40 border-red-200'
                                : 'bg-white border-slate-200 shadow-tactile-xs'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2.5">
                                  <BdiDate value={p.date} format="date" className="font-bold text-slate-900 text-sm" />
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                                    {getMethodLabel(p.method)}
                                  </span>
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                                      p.status === 'active'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {p.status === 'active' ? 'مكتمل' : 'ملغي (Void)'}
                                  </span>
                                </div>
                                {p.note && (
                                  <p className="mt-1 text-xs text-slate-500">ملاحظة: {p.note}</p>
                                )}
                                {p.status === 'void' && (
                                  <p className="mt-1 text-xs text-red-600 font-semibold">
                                    سبب الإلغاء: {p.void_reason}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-4">
                                <div className="text-left">
                                  <span className="text-[11px] text-slate-500 block">المبلغ المستلم</span>
                                  <BdiCurrency
                                    piasters={p.amount}
                                    className={`text-base font-bold ${
                                      p.status === 'void' ? 'line-through text-slate-400' : 'text-slate-900'
                                    }`}
                                  />
                                </div>

                                {p.status === 'active' && onVoidPayment && (
                                  <button
                                    type="button"
                                    onClick={() => onVoidPayment(p)}
                                    className="px-3 py-1.5 rounded-xl text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-200 transition-colors"
                                  >
                                    إلغاء الدفعة
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Allocations breakdown */}
                            {p.allocations.length > 0 && (
                              <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                                <span className="text-[11px] font-bold text-slate-600 block">
                                  توزيع الدفعة على الالتزامات:
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {p.allocations.map((a) => (
                                    <div
                                      key={a.id}
                                      className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                                    >
                                      <span className="text-slate-600 font-medium">
                                        {a.target_type === 'marketing_due'
                                          ? 'مستحق عقد تسويق'
                                          : a.target_type === 'client_package'
                                          ? 'باقة استوديو'
                                          : a.target_type}
                                      </span>
                                      <BdiCurrency piasters={a.amount} className="font-semibold text-emerald-700" />
                                    </div>
                                  ))}
                                  {surplusCredit > 0 && (
                                    <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-between text-xs text-emerald-800">
                                      <span className="font-semibold">فائض تحول لرصيد دائن:</span>
                                      <BdiCurrency piasters={surplusCredit} className="font-bold text-emerald-800" />
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            إغلاق الملف
          </button>
        </div>
      </div>
    </div>
  );
};

export default ClientProfile360;
