import React, { useState, useEffect } from 'react';
import { X, Package, CheckCircle2, AlertCircle } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import {
  savePackageTemplate,
  PackageTemplateWithItems,
} from './package-service';

export interface PackageTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  templateToEdit?: PackageTemplateWithItems | null;
}

export const PackageTemplateModal: React.FC<PackageTemplateModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  templateToEdit,
}) => {
  const [name, setName] = useState('');
  const [defaultPriceEgp, setDefaultPriceEgp] = useState('');
  const [hours, setHours] = useState('');
  const [reelsCount, setReelsCount] = useState('');
  const [active, setActive] = useState(1);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      if (templateToEdit) {
        setName(templateToEdit.name);
        setDefaultPriceEgp(String(templateToEdit.default_price / 100));
        setHours(templateToEdit.hoursMinutes > 0 ? String(templateToEdit.hoursMinutes / 60) : '0');
        setReelsCount(String(templateToEdit.reelsCount || 0));
        setActive(templateToEdit.active);
      } else {
        setName('');
        setDefaultPriceEgp('');
        setHours('');
        setReelsCount('');
        setActive(1);
      }
    }
  }, [isOpen, templateToEdit]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const priceEgp = parseFloat(defaultPriceEgp);
    if (isNaN(priceEgp) || priceEgp <= 0) {
      setErrorMessage('يرجى إدخال سعر بيع افتراضي صحيح أكبر من الصفر');
      return;
    }

    if (!name.trim()) {
      setErrorMessage('يرجى كتابة اسم الباقة');
      return;
    }

    const numHours = parseFloat(hours) || 0;
    const numReels = parseInt(reelsCount, 10) || 0;

    if (numHours <= 0 && numReels <= 0) {
      setErrorMessage('يجب أن تشتمل الباقة على رصيد ساعات استوديو أو رصيد ريلز على الأقل');
      return;
    }

    const hoursMinutes = Math.round(numHours * 60);
    const defaultPricePiasters = Math.round(priceEgp * 100);

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();
      await savePackageTemplate(driver, {
        id: templateToEdit?.id,
        name: name.trim(),
        defaultPricePiasters,
        hoursMinutes,
        reelsCount: numReels,
        active,
      });

      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to save package template:', err);
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
        className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl border border-[#E5E5E5] overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150 text-[#1A1A1A]"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">
                {templateToEdit ? 'تعديل قالب الباقة' : 'قالب باقة جديد'}
              </h2>
              <p className="text-xs text-neutral-400">
                تحديد السعر وحصص الساعات والريلز
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
          {/* Template Name */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              اسم الباقة <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: باقة ج (10 ساعات + 3 ريلز)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] placeholder-neutral-400 focus:outline-none"
              required
            />
          </div>

          {/* Default Price */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              السعر الافتراضي <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                step="1"
                placeholder="مثال: 4000"
                value={defaultPriceEgp}
                onChange={(e) => setDefaultPriceEgp(e.target.value)}
                className="w-full h-11 px-4 pl-12 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold transition-all text-[#1A1A1A] placeholder-neutral-400 focus:outline-none"
                required
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-400 select-none">
                ج.م
              </span>
            </div>
          </div>

          {/* Entitlements Row: Hours & Reels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                ساعات الاستوديو
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder="مثال: 10"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  className="w-full h-11 px-4 pl-12 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] focus:outline-none"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-400 select-none">
                  ساعة
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                فيديوهات الريلز
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="مثال: 3"
                  value={reelsCount}
                  onChange={(e) => setReelsCount(e.target.value)}
                  className="w-full h-11 px-4 pl-12 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] focus:outline-none"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-400 select-none">
                  ريلز
                </span>
              </div>
            </div>
          </div>

          {/* Active Flag */}
          <div className="flex items-center gap-3 p-3.5 bg-neutral-50 rounded-2xl">
            <input
              type="checkbox"
              id="templateActive"
              checked={active === 1}
              onChange={(e) => setActive(e.target.checked ? 1 : 0)}
              className="w-4 h-4 rounded text-[#004AC6] border-neutral-300"
            />
            <label htmlFor="templateActive" className="text-xs font-semibold text-[#1A1A1A] cursor-pointer">
              الباقة متاحة للبيع في الكتالوج
            </label>
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
                  <span>{templateToEdit ? 'حفظ التعديلات' : 'إضافة القالب'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PackageTemplateModal;
