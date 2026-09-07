import React, { useState, useEffect } from 'react';
import { X, Video, CheckCircle2, AlertCircle } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import { ClientRepository, ClientRecord, PackageRepository, ClientPackageWithItems } from '../../database/repositories';
import {
  saveReel,
  ReelItemWithDetails,
  ReelStage,
  REEL_STAGES,
} from './reels-service';
import { Select } from '../../ui/athredu/Select';

export interface ReelFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (reelId: string) => void;
  reelToEdit?: ReelItemWithDetails | null;
  preselectedClientId?: string | null;
}

export const ReelFormModal: React.FC<ReelFormModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  reelToEdit,
  preselectedClientId,
}) => {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientPackages, setClientPackages] = useState<ClientPackageWithItems[]>([]);
  const [clientId, setClientId] = useState<string>('');
  const [clientPackageId, setClientPackageId] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [stage, setStage] = useState<ReelStage>('planned');
  const [targetDate, setTargetDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      const today = new Date().toISOString().split('T')[0];

      if (reelToEdit) {
        setClientId(reelToEdit.client_id);
        setClientPackageId(reelToEdit.client_package_id || '');
        setTitle(reelToEdit.title || '');
        setStage(reelToEdit.stage);
        setTargetDate(reelToEdit.targetDate || today);
        setNotes(reelToEdit.notes || '');
      } else {
        setClientId(preselectedClientId || '');
        setClientPackageId('');
        setTitle('');
        setStage('planned');
        setTargetDate(today);
        setNotes('');
      }

      (async () => {
        try {
          setIsLoadingClients(true);
          const driver = await getDatabaseDriver();
          const clientRepo = new ClientRepository(driver);
          const list = await clientRepo.list({ activeOnly: true });
          setClients(list);
          const activeClientId = preselectedClientId || (reelToEdit ? reelToEdit.client_id : list[0]?.id);
          if (activeClientId) {
            setClientId(activeClientId);
            const packageRepo = new PackageRepository(driver);
            const pkgs = await packageRepo.listByClient(activeClientId);
            setClientPackages(pkgs);
          }
        } catch (e) {
          console.error('Failed to load clients or packages:', e);
        } finally {
          setIsLoadingClients(false);
        }
      })();
    }
  }, [isOpen, reelToEdit, preselectedClientId]);

  // When client changes, reload packages for that client
  const handleClientChange = async (newClientId: string) => {
    setClientId(newClientId);
    setClientPackageId('');
    try {
      const driver = await getDatabaseDriver();
      const packageRepo = new PackageRepository(driver);
      const pkgs = await packageRepo.listByClient(newClientId);
      setClientPackages(pkgs);
    } catch (e) {
      console.error('Failed to load packages for client:', e);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!clientId) {
      setErrorMessage('يرجى اختيار العميل');
      return;
    }

    if (!title.trim()) {
      setErrorMessage('يرجى كتابة عنوان أو فكرة الريلز');
      return;
    }

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();

      const reelId = await saveReel(driver, {
        id: reelToEdit?.id,
        clientId,
        clientPackageId: clientPackageId || null,
        title: title.trim(),
        status: stage,
        targetDate: targetDate || null,
        notes: notes || null,
      });

      onSaved(reelId);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to save reel:', err);
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
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">
                {reelToEdit ? 'تعديل بيانات الريل' : 'ريل جديد'}
              </h2>
              <p className="text-xs text-neutral-400">
                متابعة التصوير والمونتاج والتسليم
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
              onValueChange={handleClientChange}
              disabled={isLoadingClients || !!reelToEdit}
              placeholder={isLoadingClients ? 'جاري التحميل...' : 'اختر العميل...'}
              options={clients.map((c) => ({
                value: c.id,
                label: `${c.name}${c.company_name ? ` (${c.company_name})` : ''}`,
              }))}
              className="h-11 rounded-full"
            />
          </div>

          {/* Linked Package (Optional) */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              ربط بباقة (اختياري)
            </label>
            <Select
              value={clientPackageId}
              onValueChange={setClientPackageId}
              placeholder="بدون ربط بباقة"
              options={[
                { value: '', label: 'بدون ربط بباقة' },
                ...clientPackages.map((p) => ({
                  value: p.id,
                  label: `${p.name_snapshot}`,
                })),
              ]}
              className="h-11 rounded-full"
            />
          </div>

          {/* Reel Title */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              عنوان أو فكرة الريل <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="مثال: فيديو ترويجي لمنتج جديد"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold transition-all text-[#1A1A1A] placeholder-neutral-400 focus:outline-none"
              required
            />
          </div>

          {/* Stage & Target Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                المرحلة
              </label>
              <Select
                value={stage}
                onValueChange={(val) => setStage(val as ReelStage)}
                options={REEL_STAGES.map((st) => ({
                  value: st.id,
                  label: st.title,
                }))}
                className="h-11 rounded-full"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                تاريخ التسليم
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs transition-all text-[#1A1A1A] focus:outline-none"
              />
            </div>
          </div>

          {/* Notes / Script */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              ملاحظات المونتاج والتصوير
            </label>
            <textarea
              rows={2}
              placeholder="ملاحظات تفصيلية..."
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
                  <span>{reelToEdit ? 'حفظ التعديلات' : 'إضافة الريل'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ReelFormModal;
