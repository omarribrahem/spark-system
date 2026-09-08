import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layers,
  PlusCircle,
  Search,
  RefreshCw,
  CheckCircle2,
  Clock,
  FileText,
  Tag,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import {
  UniversalServiceRepository,
} from '../../database/repositories';
import {
  UniversalServiceDefinition,
  BILLING_METHODS,
} from '../../domain/models/universal-service';
import { BdiCurrency } from '../../ui/bdi';
import { SkeletonCard, EmptyState, ActionableError } from '../../ui/feedback';
import { Select } from '../../ui/athredu/Select';

export interface ServicesCatalogViewProps {
  onOpenHeaderForm?: (mode: 'form-service') => void;
}

export const ServicesCatalogView: React.FC<ServicesCatalogViewProps> = ({
  onOpenHeaderForm,
}) => {
  const [services, setServices] = useState<UniversalServiceDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const repo = new UniversalServiceRepository(driver);
      const list = await repo.listServices(false);
      setServices(list);
    } catch (err: unknown) {
      console.error('Failed to load services catalog:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleActive = async (service: UniversalServiceDefinition) => {
    try {
      const driver = await getDatabaseDriver();
      const newActive = service.active === 1 ? 0 : 1;
      await driver.execute(
        `UPDATE service_definitions SET active = ?, updated_at = ? WHERE id = ?`,
        [newActive, new Date().toISOString(), service.id]
      );
      await loadData();
      setFeedbackMessage(
        newActive === 1
          ? `تم تفعيل الخدمة "${service.name}"`
          : `تم تعطيل الخدمة "${service.name}" مؤقتاً`
      );
      setTimeout(() => setFeedbackMessage(null), 3500);
    } catch (err: unknown) {
      console.error('Failed to toggle service status:', err);
      setFeedbackMessage(err instanceof Error ? err.message : 'تعذر تحديث حالة الخدمة');
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      const matchSearch =
        searchQuery === '' ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (s.service_type_key && s.service_type_key.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchType = true;
      if (typeFilter !== 'all') {
        matchType = s.service_type_key === typeFilter;
      }

      return matchSearch && matchType;
    });
  }, [services, searchQuery, typeFilter]);

  const getBillingMethodLabel = (method: string) => {
    const found = BILLING_METHODS.find((b) => b.id === method);
    return found ? found.label : method;
  };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Filter & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
            <input
              type="text"
              placeholder="البحث باسم الخدمة أو الوصف..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pr-10 pl-4 rounded-full border border-[#E5E5E5] bg-white text-xs font-semibold text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
            />
          </div>

          <div className="w-44">
            <Select
              value={typeFilter}
              onValueChange={(val) => setTypeFilter(val)}
              placeholder="تصنيف الخدمة"
              options={[
                { value: 'all', label: 'جميع التصنيفات' },
                { value: 'retainer', label: 'ريتينر شهري' },
                { value: 'package', label: 'باقات رصيد' },
                { value: 'subscription', label: 'اشتراكات' },
                { value: 'custom', label: 'خدمات مخصصة' },
              ]}
            />
          </div>

          <button
            type="button"
            onClick={loadData}
            title="تحديث البيانات"
            className="w-11 h-11 rounded-full border border-[#E5E5E5] bg-white text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 flex items-center justify-center transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (onOpenHeaderForm) {
                onOpenHeaderForm('form-service');
              }
            }}
            className="flex items-center gap-2 h-11 px-5 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span>تعريف خدمة جديدة</span>
          </button>
        </div>
      </div>

      {feedbackMessage && (
        <div className="p-3.5 bg-blue-50 border border-blue-100 text-blue-900 rounded-2xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-[#004AC6] shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* Main State Handling */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} hasHeader />
        </div>
      ) : error ? (
        <ActionableError
          title="تعذر تحميل دليل الخدمات"
          message={error.message}
          onRetry={loadData}
          error={error}
        />
      ) : filteredServices.length === 0 ? (
        <EmptyState
          title="لا توجد خدمات مسجلة"
          description="أضف الخدمات التي تقدمها سبارك لربطها بالعقود والباقات والخطط المباعة."
          actionLabel="تعريف خدمة جديدة"
          onAction={() => {
            if (onOpenHeaderForm) onOpenHeaderForm('form-service');
          }}
        />
      ) : (
        /* Catalog Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredServices.map((service) => (
            <div
              key={service.id}
              className={`p-5 rounded-[2rem] border bg-white shadow-xs transition-all space-y-3.5 ${
                service.active === 1
                  ? 'border-[#E5E5E5] hover:border-neutral-300'
                  : 'border-neutral-200 opacity-60 bg-neutral-50/50'
              }`}
            >
              {/* Card Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Layers className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#1A1A1A] truncate">{service.name}</h3>
                    <span className="text-[10px] font-semibold text-neutral-400">
                      {service.service_type_key || 'خدمة عامة'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleActive(service)}
                  title={service.active === 1 ? 'تعطيل الخدمة' : 'تفعيل الخدمة'}
                  className="text-neutral-400 hover:text-neutral-700 transition-colors p-1"
                >
                  {service.active === 1 ? (
                    <ToggleRight className="w-6 h-6 text-emerald-600" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-neutral-300" />
                  )}
                </button>
              </div>

              {/* Description */}
              {service.description ? (
                <p className="text-xs text-neutral-500 line-clamp-2 leading-relaxed">
                  {service.description}
                </p>
              ) : (
                <p className="text-xs text-neutral-300 italic">لا يوجد وصف للخدمة</p>
              )}

              {/* Price & Billing Method */}
              <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
                <div>
                  <span className="block text-[10px] font-semibold text-neutral-400">السعر الافتراضي</span>
                  <BdiCurrency piasters={service.default_price} className="text-sm font-bold text-[#1A1A1A]" />
                </div>
                <div className="text-left">
                  <span className="block text-[10px] font-semibold text-neutral-400">الفوترة</span>
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-700">
                    {getBillingMethodLabel(service.billing_method)}
                  </span>
                </div>
              </div>

              {/* Badges and Attributes */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {service.requires_contract === 1 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700">
                    <FileText className="w-2.5 h-2.5" />
                    <span>تتطلب عقد</span>
                  </span>
                )}
                {service.default_duration_days && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{service.default_duration_days} يوم</span>
                  </span>
                )}
                {service.auto_renew === 1 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700">
                    <Tag className="w-2.5 h-2.5" />
                    <span>تجديد تلقائي</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ServicesCatalogView;
