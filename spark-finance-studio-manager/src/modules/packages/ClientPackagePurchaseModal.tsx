import React, { useState, useEffect } from 'react';
import { X, ShoppingBag, CheckCircle2, AlertCircle } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import { ClientRepository, ClientRecord } from '../../database/repositories';
import {
  fetchPackageTemplates,
  sellPackageToClient,
  PackageTemplateWithItems,
} from './package-service';
import { Select } from '../../ui/athredu/Select';

export interface ClientPackagePurchaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  preselectedClientId?: string | null;
  initialTemplate?: PackageTemplateWithItems | null;
}

export const ClientPackagePurchaseModal: React.FC<ClientPackagePurchaseModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  preselectedClientId,
  initialTemplate,
}) => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [templates, setTemplates] = useState<PackageTemplateWithItems[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [nameSnapshot, setNameSnapshot] = useState<string>('');
  const [soldPriceEgp, setSoldPriceEgp] = useState<string>('');
  const [purchasedAt, setPurchasedAt] = useState<string>('');
  const [hours, setHours] = useState<string>('');
  const [reelsCount, setReelsCount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      const today = new Date().toISOString().split('T')[0];
      setPurchasedAt(today);
      setClientId(preselectedClientId || '');

      (async () => {
        try {
          setIsLoading(true);
          const driver = await getDatabaseDriver();
          const clientRepo = new ClientRepository(driver);
          const clientList = await clientRepo.list({ activeOnly: true });
          setClients(clientList);
          if (!preselectedClientId && clientList.length > 0) {
            setClientId(clientList[0].id);
          }

          const templateList = await fetchPackageTemplates(driver);
          setTemplates(templateList);

          if (initialTemplate) {
            setSelectedTemplateId(initialTemplate.id);
            setNameSnapshot(initialTemplate.name);
            setSoldPriceEgp(String(initialTemplate.default_price / 100));
            setHours(initialTemplate.hoursMinutes > 0 ? String(initialTemplate.hoursMinutes / 60) : '0');
            setReelsCount(String(initialTemplate.reelsCount || 0));
          } else if (templateList.length > 0) {
            const first = templateList[0];
            setSelectedTemplateId(first.id);
            setNameSnapshot(first.name);
            setSoldPriceEgp(String(first.default_price / 100));
            setHours(first.hoursMinutes > 0 ? String(first.hoursMinutes / 60) : '0');
            setReelsCount(String(first.reelsCount || 0));
          }
        } catch (e) {
          console.error('Failed to initialize purchase modal:', e);
        } finally {
          setIsLoading(false);
        }
      })();
    }
  }, [isOpen, preselectedClientId, initialTemplate]);

  // Handle template selection change
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId === 'custom') {
      setNameSnapshot('باقة مخصصة للعميل');
      setSoldPriceEgp('');
      setHours('');
      setReelsCount('');
      return;
    }

    const tpl = templates.find((t) => t.id === templateId);
    if (tpl) {
      setNameSnapshot(tpl.name);
      setSoldPriceEgp(String(tpl.default_price / 100));
      setHours(tpl.hoursMinutes > 0 ? String(tpl.hoursMinutes / 60) : '0');
      setReelsCount(String(tpl.reelsCount || 0));
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const priceEgp = parseFloat(soldPriceEgp);
    if (isNaN(priceEgp) || priceEgp <= 0) {
      setErrorMessage('يرجى إدخال سعر بيع صحيح للباقة');
      return;
    }

    if (!clientId) {
      setErrorMessage('يرجى اختيار العميل');
      return;
    }

    if (!nameSnapshot.trim()) {
      setErrorMessage('يرجى كتابة اسم الباقة (لقطة العقد)');
      return;
    }

    if (!purchasedAt) {
      setErrorMessage('يرجى تحديد تاريخ الشراء');
      return;
    }

    const numHours = parseFloat(hours) || 0;
    const numReels = parseInt(reelsCount, 10) || 0;

    if (numHours <= 0 && numReels <= 0) {
      setErrorMessage('يجب أن تشتمل الباقة على رصيد ساعات استوديو أو رصيد ريلز على الأقل');
      return;
    }

    const hoursMinutes = Math.round(numHours * 60);
    const soldPricePiasters = Math.round(priceEgp * 100);

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();

      await sellPackageToClient(driver, {
        clientId,
        packageTemplateId: selectedTemplateId !== 'custom' ? selectedTemplateId : null,
        nameSnapshot: nameSnapshot.trim(),
        soldPricePiasters,
        purchasedAt,
        hoursMinutes,
        reelsCount: numReels,
        notes: notes || null,
      });

      onSaved();
      onClose();
    } catch (err: unknown) {
      console.error('Failed to sell package:', err);
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
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">
                بيع باقة لعميل
              </h2>
              <p className="text-xs text-neutral-400">
                تخصيص رصيد الساعات والريلز
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
          {/* Client & Template Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                العميل <span className="text-red-500">*</span>
              </label>
              <Select
                value={clientId}
                onValueChange={setClientId}
                disabled={isLoading}
                placeholder={isLoading ? 'جاري التحميل...' : 'اختر العميل...'}
                options={clients.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.company_name ? ` (${c.company_name})` : ''}`,
                }))}
                className="h-11 rounded-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                قالب الباقة
              </label>
              <Select
                value={selectedTemplateId}
                onValueChange={handleTemplateChange}
                disabled={isLoading}
                options={[
                  ...templates.map((t) => ({
                    value: t.id,
                    label: `${t.name} (${t.default_price / 100} ج.م)`,
                  })),
                  { value: 'custom', label: 'باقة مخصصة...' },
                ]}
                className="h-11 rounded-full"
              />
            </div>
          </div>

          {/* Name Snapshot & Sold Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                اسم الباقة <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nameSnapshot}
                onChange={(e) => setNameSnapshot(e.target.value)}
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] font-semibold placeholder-neutral-400 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                سعر البيع <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={soldPriceEgp}
                  onChange={(e) => setSoldPriceEgp(e.target.value)}
                  className="w-full h-11 px-4 pl-12 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold transition-all text-[#1A1A1A] placeholder-neutral-400 focus:outline-none"
                  required
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-400 select-none">
                  ج.م
                </span>
              </div>
            </div>
          </div>

          {/* Entitlements: Hours & Reels */}
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

          {/* Purchase Date */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              تاريخ التعاقد <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={purchasedAt}
              onChange={(e) => setPurchasedAt(e.target.value)}
              className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] focus:outline-none"
              required
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              شروط خاصة
            </label>
            <textarea
              rows={2}
              placeholder="شروط إضافية أو صلاحية..."
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
                  <span>تأكيد بيع الباقة</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClientPackagePurchaseModal;
