import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PlusCircle, Search, Layers, Calendar, RefreshCw } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import {
  fetchSubscriptions,
  SubscriptionWithDetails,
  SubscriptionRecord,
} from './contract-service';
import { BdiCurrency, BdiDate } from '../../ui/bdi';
import { SkeletonCard, EmptyState, ActionableError } from '../../ui/feedback';
import { SubscriptionModal } from './SubscriptionModal';
import { Select } from '../../ui/athredu/Select';

export interface SubscriptionsListProps {
  onRequestNewSubscription?: boolean;
  onResetNewSubscriptionRequest?: () => void;
  onOpenHeaderForm?: () => void;
}

export const SubscriptionsList: React.FC<SubscriptionsListProps> = ({
  onRequestNewSubscription,
  onResetNewSubscriptionRequest,
  onOpenHeaderForm,
}) => {
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters & search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [subscriptionToEdit, setSubscriptionToEdit] = useState<SubscriptionRecord | null>(null);

  useEffect(() => {
    if (onRequestNewSubscription) {
      setSubscriptionToEdit(null);
      setIsModalOpen(true);
      if (onResetNewSubscriptionRequest) {
        onResetNewSubscriptionRequest();
      }
    }
  }, [onRequestNewSubscription, onResetNewSubscriptionRequest]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const list = await fetchSubscriptions(driver);
      setSubscriptions(list);
    } catch (err: unknown) {
      console.error('Failed to load subscriptions:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      const matchSearch =
        searchQuery === '' ||
        sub.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (sub.clientCompany && sub.clientCompany.toLowerCase().includes(searchQuery.toLowerCase())) ||
        sub.serviceName.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus = statusFilter === 'all' || sub.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [subscriptions, searchQuery, statusFilter]);

  const totalMonthlyPiasters = useMemo(() => {
    return subscriptions
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => sum + s.monthly_amount, 0);
  }, [subscriptions]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search & Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="البحث باسم العميل أو الخدمة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-4 pr-10 rounded-full border border-[#E5E5E5] bg-white text-xs text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
            />
          </div>

          <div className="w-44">
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={[
                { value: 'all', label: 'جميع الحالات' },
                { value: 'active', label: 'نشط (Active)' },
                { value: 'paused', label: 'معلق (Paused)' },
                { value: 'ended', label: 'منتهي (Ended)' },
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

        {/* Add Subscription CTA */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-600 text-xs font-semibold">
            <span>إجمالي الاشتراكات:</span>
            <BdiCurrency piasters={totalMonthlyPiasters} className="font-bold text-[#1A1A1A]" />
          </div>

          <button
            type="button"
            onClick={() => {
              if (onOpenHeaderForm) {
                onOpenHeaderForm();
              } else {
                setSubscriptionToEdit(null);
                setIsModalOpen(true);
              }
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold transition-all shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>اشتراك جديد</span>
          </button>
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
          title="تعذر تحميل قائمة الاشتراكات"
          message={error.message}
          onRetry={loadData}
          error={error}
        />
      ) : filteredSubscriptions.length === 0 ? (
        <EmptyState
          title="لا توجد اشتراكات مسجلة"
          description={
            searchQuery || statusFilter !== 'all'
              ? 'لم يتم العثور على اشتراكات تطابق معايير البحث والفلترة.'
              : 'يمكنك تسجيل اشتراكات الخدمات الدورية (استضافة، أدوات تسويق، صيانة) وربطها بالعملاء.'
          }
          actionLabel="تسجيل اشتراك خدمة الآن"
          onAction={() => {
            setSubscriptionToEdit(null);
            setIsModalOpen(true);
          }}
        />
      ) : (
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs text-[#1A1A1A]">
              <thead className="bg-neutral-50/70 border-b border-[#E5E5E5] text-neutral-500 font-medium">
                <tr>
                  <th className="px-5 py-3.5 text-start">العميل</th>
                  <th className="px-5 py-3.5 text-start">الخدمة / الأداة</th>
                  <th className="px-5 py-3.5 text-start">التكلفة الشهرية</th>
                  <th className="px-5 py-3.5 text-start">يوم الفاتورة</th>
                  <th className="px-5 py-3.5 text-start">التجديد القادم</th>
                  <th className="px-5 py-3.5 text-start">الحالة</th>
                  <th className="px-5 py-3.5 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium">
                {filteredSubscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-neutral-50/50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-bold text-[#1A1A1A]">{sub.clientName}</div>
                      {sub.clientCompany && (
                        <div className="text-[11px] text-neutral-400">{sub.clientCompany}</div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="p-1 rounded-full bg-neutral-100 text-neutral-600">
                          <Layers className="w-3.5 h-3.5" />
                        </span>
                        <span className="font-semibold text-[#1A1A1A]">{sub.serviceName}</span>
                      </div>
                      {sub.notes && (
                        <div className="text-[11px] text-neutral-400 truncate max-w-xs mt-0.5">
                          {sub.notes}
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4 font-bold text-[#1A1A1A]">
                      <BdiCurrency piasters={sub.monthly_amount} />
                    </td>

                    <td className="px-5 py-4 text-neutral-600">
                      يوم {sub.billing_day} من كل شهر
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-neutral-600">
                        <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                        <BdiDate value={sub.nextRenewalDate} format="date" />
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${
                          sub.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : sub.status === 'paused'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}
                      >
                        {sub.status === 'active' && 'نشط'}
                        {sub.status === 'paused' && 'معلق'}
                        {sub.status === 'ended' && 'منتهي'}
                        {sub.status === 'cancelled' && 'ملغي'}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setSubscriptionToEdit(sub);
                          setIsModalOpen(true);
                        }}
                        className="px-3 py-1.5 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-medium transition-all"
                      >
                        تعديل
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subscription Modal */}
      <SubscriptionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={loadData}
        subscriptionToEdit={subscriptionToEdit}
      />
    </div>
  );
};

export default SubscriptionsList;
