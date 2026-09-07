import React, { useState, useEffect, useCallback } from 'react';
import { Package, PlusCircle, Clock, Video, ShoppingCart, RefreshCw } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import {
  fetchPackageTemplates,
  PackageTemplateWithItems,
} from './package-service';
import { BdiCurrency } from '../../ui/bdi';
import { SkeletonCard, EmptyState, ActionableError } from '../../ui/feedback';
import { PackageTemplateModal } from './PackageTemplateModal';

export interface PackageTemplatesListProps {
  onSellTemplate?: (template: PackageTemplateWithItems) => void;
  onRequestNewTemplate?: boolean;
  onResetNewTemplateRequest?: () => void;
}

export const PackageTemplatesList: React.FC<PackageTemplatesListProps> = ({
  onSellTemplate,
  onRequestNewTemplate,
  onResetNewTemplateRequest,
}) => {
  const [templates, setTemplates] = useState<PackageTemplateWithItems[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [templateToEdit, setTemplateToEdit] = useState<PackageTemplateWithItems | null>(null);

  useEffect(() => {
    if (onRequestNewTemplate) {
      setTemplateToEdit(null);
      setIsModalOpen(true);
      if (onResetNewTemplateRequest) {
        onResetNewTemplateRequest();
      }
    }
  }, [onRequestNewTemplate, onResetNewTemplateRequest]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const list = await fetchPackageTemplates(driver);
      setTemplates(list);
    } catch (err: unknown) {
      console.error('Failed to load package templates:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">قوالب الباقات</h2>
          <p className="text-xs text-neutral-400">
            الباقات المعتمدة لساعات الاستوديو والريلز
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={loadData}
            title="تحديث البيانات"
            className="w-10 h-10 rounded-full border border-[#E5E5E5] bg-white text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 flex items-center justify-center transition-all shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              setTemplateToEdit(null);
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold transition-all shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>قالب باقة جديد</span>
          </button>
        </div>
      </div>

      {/* States Handling */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard rows={3} hasHeader hasBadge />
          <SkeletonCard rows={3} hasHeader hasBadge />
          <SkeletonCard rows={3} hasHeader hasBadge />
        </div>
      ) : error ? (
        <ActionableError
          title="تعذر تحميل قوالب الباقات"
          message={error.message}
          onRetry={loadData}
          error={error}
        />
      ) : templates.length === 0 ? (
        <EmptyState
          title="لا توجد قوالب باقات مسجلة"
          description="أضف قوالب باقات لتسهيل عملية البيع وتخصيص الساعات والريلز."
          actionLabel="إضافة قالب باقة"
          onAction={() => {
            setTemplateToEdit(null);
            setIsModalOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {templates.map((tpl) => {
            const hoursDisplay = tpl.hoursMinutes > 0 ? (tpl.hoursMinutes / 60) : 0;

            return (
              <div
                key={tpl.id}
                className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:border-neutral-300 transition-all flex flex-col justify-between"
              >
                <div>
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center shrink-0">
                      <Package className="w-5 h-5" />
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-medium ${
                        tpl.active === 1
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {tpl.active === 1 ? 'متاحة للبيع' : 'معطلة'}
                    </span>
                  </div>

                  {/* Title & Price */}
                  <h3 className="font-bold text-[#1A1A1A] text-base mb-1">{tpl.name}</h3>
                  <div className="mb-4">
                    <BdiCurrency piasters={tpl.default_price} className="text-xl font-bold text-[#1A1A1A]" />
                  </div>

                  {/* Entitlements Breakdown */}
                  <div className="space-y-2 py-3 border-t border-b border-neutral-100 text-xs">
                    <div className="flex items-center justify-between text-neutral-700">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#004AC6]" />
                        <span>ساعات استوديو:</span>
                      </div>
                      <span className="font-bold text-[#1A1A1A]">
                        {hoursDisplay > 0 ? `${hoursDisplay} س (${tpl.hoursMinutes} د)` : 'لا تشمل'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-neutral-700">
                      <div className="flex items-center gap-2">
                        <Video className="w-4 h-4 text-purple-600" />
                        <span>فيديوهات ريلز:</span>
                      </div>
                      <span className="font-bold text-[#1A1A1A]">
                        {tpl.reelsCount > 0 ? `${tpl.reelsCount} ريلز` : 'لا تشمل'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-5 pt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTemplateToEdit(tpl);
                      setIsModalOpen(true);
                    }}
                    className="px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-semibold transition-all"
                  >
                    تعديل
                  </button>

                  {onSellTemplate && (
                    <button
                      type="button"
                      onClick={() => onSellTemplate(tpl)}
                      className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold transition-all shadow-sm"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>بيع لعميل</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Template Modal */}
      <PackageTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={loadData}
        templateToEdit={templateToEdit}
      />
    </div>
  );
};

export default PackageTemplatesList;
