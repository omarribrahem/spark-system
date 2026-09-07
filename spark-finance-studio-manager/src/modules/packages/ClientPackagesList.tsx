import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Package,
  PlusCircle,
  Search,
  Clock,
  Video,
  AlertTriangle,
  RefreshCw,
  MinusCircle,
  Calendar,
} from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import {
  fetchClientPackages,
  ClientPackageDetails,
  PackageTemplateWithItems,
} from './package-service';
import { PackageRepository } from '../../database/repositories';
import { PackageUnit } from '../../domain/models/package';
import { BdiCurrency, BdiDate } from '../../ui/bdi';
import { SkeletonCard, EmptyState, ActionableError } from '../../ui/feedback';
import { ClientPackagePurchaseModal } from './ClientPackagePurchaseModal';
import { Select } from '../../ui/athredu/Select';

export interface ClientPackagesListProps {
  onRequestNewPurchase?: boolean;
  onResetNewPurchaseRequest?: () => void;
  preselectedClientId?: string | null;
  initialTemplate?: PackageTemplateWithItems | null;
  onOpenHeaderForm?: () => void;
}

export const ClientPackagesList: React.FC<ClientPackagesListProps> = ({
  onRequestNewPurchase,
  onResetNewPurchaseRequest,
  preselectedClientId,
  initialTemplate,
  onOpenHeaderForm,
}) => {
  const [packages, setPackages] = useState<ClientPackageDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [selectedTemplateForPurchase, setSelectedTemplateForPurchase] =
    useState<PackageTemplateWithItems | null>(initialTemplate || null);

  // Consume modal / state
  const [consumingPkg, setConsumingPkg] = useState<ClientPackageDetails | null>(null);
  const [consumeUnit, setConsumeUnit] = useState<PackageUnit>('hours');
  const [consumeAmount, setConsumeAmount] = useState<string>('');
  const [consumeError, setConsumeError] = useState<string | null>(null);
  const [isConsuming, setIsConsuming] = useState(false);

  useEffect(() => {
    if (onRequestNewPurchase) {
      setSelectedTemplateForPurchase(initialTemplate || null);
      setIsPurchaseModalOpen(true);
      if (onResetNewPurchaseRequest) {
        onResetNewPurchaseRequest();
      }
    }
  }, [onRequestNewPurchase, onResetNewPurchaseRequest, initialTemplate]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const list = await fetchClientPackages(driver, preselectedClientId);
      setPackages(list);
    } catch (err: unknown) {
      console.error('Failed to load client packages:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [preselectedClientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle manual consumption
  const handleConfirmConsume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consumingPkg) return;
    setConsumeError(null);

    const amountNum = parseFloat(consumeAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setConsumeError('يرجى إدخال كمية استهلاك صحيحة أكبر من الصفر');
      return;
    }

    // If unit is hours, amount is entered in hours, convert to minutes
    const intAmount = consumeUnit === 'hours' ? Math.round(amountNum * 60) : Math.round(amountNum);

    try {
      setIsConsuming(true);
      const driver = await getDatabaseDriver();
      const repo = new PackageRepository(driver);
      await repo.consumePackageItem(consumingPkg.id, consumeUnit, intAmount);
      await loadData();
      setConsumingPkg(null);
      setConsumeAmount('');
    } catch (err: unknown) {
      console.error('Failed to consume package item:', err);
      setConsumeError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsConsuming(false);
    }
  };

  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      const matchSearch =
        searchQuery === '' ||
        pkg.name_snapshot.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pkg.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (pkg.clientCompany && pkg.clientCompany.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (pkg.notes && pkg.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchStatus = true;
      if (statusFilter === 'low_balance') {
        matchStatus = pkg.isLowBalance;
      } else if (statusFilter !== 'all') {
        matchStatus = pkg.status === statusFilter;
      }

      return matchSearch && matchStatus;
    });
  }, [packages, searchQuery, statusFilter]);

  const totalRemainingMinutes = useMemo(() => {
    return packages.reduce((sum, p) => sum + p.hoursRemainingMinutes, 0);
  }, [packages]);

  const totalRemainingReels = useMemo(() => {
    return packages.reduce((sum, p) => sum + p.reelsRemaining, 0);
  }, [packages]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search & Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="البحث باسم الباقة، العميل، أو الملاحظات..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-4 pr-10 rounded-full border border-[#E5E5E5] bg-white text-xs text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
            />
          </div>

          <div className="w-60">
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={[
                { value: 'all', label: 'جميع الباقات' },
                { value: 'active', label: 'باقات نشطة قيد الاستخدام' },
                { value: 'not_started', label: 'باقات جديدة لم تبدأ' },
                { value: 'low_balance', label: 'أرصدة قاربت على النفاد' },
                { value: 'fully_used', label: 'مكتملة الاستهلاك' },
              ]}
              className="h-11"
            />
          </div>

          <button
            type="button"
            onClick={loadData}
            title="تحديث البيانات"
            className="h-11 w-11 rounded-full border border-[#E5E5E5] bg-white text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 flex items-center justify-center transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* CTA */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (onOpenHeaderForm) {
                onOpenHeaderForm();
              } else {
                setSelectedTemplateForPurchase(null);
                setIsPurchaseModalOpen(true);
              }
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold transition-all shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>بيع باقة لعميل</span>
          </button>
        </div>
      </div>

      {/* Aggregate KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <div className="p-5 bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </span>
            <div>
              <span className="text-xs text-neutral-400 block font-medium">ساعات الاستوديو المتبقية</span>
              <span className="text-base font-bold text-[#1A1A1A]">
                {(totalRemainingMinutes / 60).toFixed(1)} ساعة
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center">
              <Video className="w-5 h-5" />
            </span>
            <div>
              <span className="text-xs text-neutral-400 block font-medium">الريلز المتبقية</span>
              <span className="text-base font-bold text-[#1A1A1A]">
                {totalRemainingReels} ريلز
              </span>
            </div>
          </div>
        </div>

        <div className="p-5 bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center">
              <Package className="w-5 h-5" />
            </span>
            <div>
              <span className="text-xs text-neutral-400 block font-medium">إجمالي الباقات</span>
              <span className="text-base font-bold text-[#1A1A1A]">
                {packages.length} باقة
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* States Handling */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard rows={3} hasHeader hasBadge />
          <SkeletonCard rows={3} hasHeader hasBadge />
        </div>
      ) : error ? (
        <ActionableError
          title="تعذر تحميل باقات العملاء"
          message={error.message}
          onRetry={loadData}
          error={error}
        />
      ) : filteredPackages.length === 0 ? (
        <EmptyState
          title="لا توجد باقات مباعة مسجلة"
          description={
            searchQuery || statusFilter !== 'all'
              ? 'لم يتم العثور على باقات تطابق معايير البحث والفلترة.'
              : 'ابدأ ببيع أول باقة لعميل لتخصيص حصص الساعات والريلز ومتابعة الاستهلاك الفعلي.'
          }
          actionLabel="بيع باقة الآن"
          onAction={() => {
            setSelectedTemplateForPurchase(null);
            setIsPurchaseModalOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPackages.map((pkg) => {
            // Guarded progress calculation for hours
            const hoursPercent =
              pkg.hoursPurchasedMinutes > 0
                ? Math.min(100, Math.round((pkg.hoursUsedMinutes / pkg.hoursPurchasedMinutes) * 100))
                : 0;

            // Guarded progress calculation for reels
            const reelsPercent =
              pkg.reelsPurchased > 0
                ? Math.min(100, Math.round((pkg.reelsUsed / pkg.reelsPurchased) * 100))
                : 0;

            return (
              <div
                key={pkg.id}
                className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:border-neutral-300 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Header Row */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-[#1A1A1A] text-sm">{pkg.name_snapshot}</h3>
                        <p className="text-xs text-neutral-400">
                          {pkg.clientName} {pkg.clientCompany ? `• ${pkg.clientCompany}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {pkg.isLowBalance && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">
                          <AlertTriangle className="w-3 h-3" />
                          <span>رصيد منخفض</span>
                        </span>
                      )}

                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
                          pkg.status === 'fully_used'
                            ? 'bg-neutral-100 text-neutral-600'
                            : pkg.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        {pkg.status === 'not_started' && 'جديدة'}
                        {pkg.status === 'active' && 'نشطة'}
                        {pkg.status === 'fully_used' && 'مكتملة'}
                        {pkg.status === 'cancelled' && 'ملغاة'}
                      </span>
                    </div>
                  </div>

                  {/* Financial Price & Date */}
                  <div className="flex items-center justify-between py-2.5 border-t border-neutral-100 text-xs text-neutral-600">
                    <div className="flex items-center gap-1.5">
                      <span className="text-neutral-400">سعر البيع:</span>
                      <BdiCurrency piasters={pkg.sold_price} className="font-bold text-[#1A1A1A]" />
                    </div>

                    <div className="flex items-center gap-1.5 text-neutral-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <BdiDate value={pkg.purchased_at} format="date" />
                    </div>
                  </div>

                  {/* Entitlement Progress Bars */}
                  <div className="space-y-3 pt-3 border-t border-neutral-100">
                    {/* Studio Hours Bar */}
                    {pkg.hoursPurchasedMinutes > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-medium text-neutral-700">
                            <Clock className="w-3.5 h-3.5 text-[#004AC6]" />
                            <span>ساعات الاستوديو:</span>
                          </span>
                          <span className="font-bold text-[#1A1A1A]">
                            {(pkg.hoursUsedMinutes / 60).toFixed(1)} من {(pkg.hoursPurchasedMinutes / 60).toFixed(1)} س
                            <span className="text-neutral-400 font-normal mr-1 text-[11px]">
                              (متبقي {(pkg.hoursRemainingMinutes / 60).toFixed(1)} س)
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full transition-all duration-300 rounded-full bg-[#004AC6]"
                            style={{ width: `${hoursPercent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Reels Bar */}
                    {pkg.reelsPurchased > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 font-medium text-neutral-700">
                            <Video className="w-3.5 h-3.5 text-purple-600" />
                            <span>فيديوهات الريلز:</span>
                          </span>
                          <span className="font-bold text-[#1A1A1A]">
                            {pkg.reelsUsed} من {pkg.reelsPurchased} ريلز
                            <span className="text-neutral-400 font-normal mr-1 text-[11px]">
                              (متبقي {pkg.reelsRemaining})
                            </span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className="h-full transition-all duration-300 rounded-full bg-purple-600"
                            style={{ width: `${reelsPercent}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-400 truncate max-w-[200px]">
                    {pkg.notes || 'لا توجد ملاحظات'}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setConsumingPkg(pkg);
                      setConsumeUnit(pkg.hoursPurchasedMinutes > 0 ? 'hours' : 'reels');
                      setConsumeAmount('');
                      setConsumeError(null);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-medium transition-all"
                  >
                    <MinusCircle className="w-3.5 h-3.5 text-neutral-500" />
                    <span>استهلاك يدوي</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Purchase Modal */}
      <ClientPackagePurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        onSaved={loadData}
        preselectedClientId={preselectedClientId}
        initialTemplate={selectedTemplateForPurchase}
      />

      {/* Manual Consume Modal */}
      {consumingPkg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setConsumingPkg(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md bg-white rounded-[2rem] shadow-2xl border border-[#E5E5E5] p-6 space-y-4 text-[#1A1A1A]"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
              <h3 className="font-bold text-sm text-[#1A1A1A]">
                استهلاك من باقة ({consumingPkg.name_snapshot})
              </h3>
              <button
                type="button"
                onClick={() => setConsumingPkg(null)}
                className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {consumeError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl">
                {consumeError}
              </div>
            )}

            <form onSubmit={handleConfirmConsume} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  نوع الخدمة
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={consumingPkg.hoursPurchasedMinutes === 0}
                    onClick={() => setConsumeUnit('hours')}
                    className={`py-2.5 px-3 rounded-full border text-xs font-semibold transition-all ${
                      consumeUnit === 'hours'
                        ? 'border-[#004AC6] bg-[#004AC6]/10 text-[#004AC6]'
                        : 'border-[#E5E5E5] text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    ساعات استوديو ({(consumingPkg.hoursRemainingMinutes / 60).toFixed(1)} س)
                  </button>

                  <button
                    type="button"
                    disabled={consumingPkg.reelsPurchased === 0}
                    onClick={() => setConsumeUnit('reels')}
                    className={`py-2.5 px-3 rounded-full border text-xs font-semibold transition-all ${
                      consumeUnit === 'reels'
                        ? 'border-[#004AC6] bg-[#004AC6]/10 text-[#004AC6]'
                        : 'border-[#E5E5E5] text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    ريلز ({consumingPkg.reelsRemaining})
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  الكمية ({consumeUnit === 'hours' ? 'بالساعات' : 'عدد الريلز'})
                </label>
                <input
                  type="number"
                  step={consumeUnit === 'hours' ? '0.25' : '1'}
                  min="0.1"
                  placeholder={consumeUnit === 'hours' ? 'مثال: 2' : 'مثال: 1'}
                  value={consumeAmount}
                  onChange={(e) => setConsumeAmount(e.target.value)}
                  className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] text-xs font-semibold focus:border-[#004AC6] focus:outline-none transition-all text-[#1A1A1A]"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-neutral-100">
                <button
                  type="button"
                  onClick={() => setConsumingPkg(null)}
                  className="px-5 py-2.5 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-semibold transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isConsuming}
                  className="px-6 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold transition-all shadow-sm"
                >
                  {isConsuming ? 'جاري الخصم...' : 'تأكيد الخصم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPackagesList;
