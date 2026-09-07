import React, { useState, useEffect } from 'react';
import { X, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { ClientRecord, ClientRepository, CreateClientInput, UpdateClientInput } from '../../database/repositories';
import { getDatabaseDriver } from '../../database/driver';

export interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientToEdit?: ClientRecord | null;
  onSaved: (client: ClientRecord) => void;
}

export const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  clientToEdit,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [secondaryPhone, setSecondaryPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(1);

  const [nameError, setNameError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Initialize form state when opened or clientToEdit changes
  useEffect(() => {
    if (isOpen) {
      if (clientToEdit) {
        setName(clientToEdit.name || '');
        setCompanyName(clientToEdit.company_name || '');
        setPhone(clientToEdit.phone || '');
        setSecondaryPhone(clientToEdit.secondary_phone || '');
        setNotes(clientToEdit.notes || '');
        setActive(clientToEdit.active ?? 1);
      } else {
        setName('');
        setCompanyName('');
        setPhone('');
        setSecondaryPhone('');
        setNotes('');
        setActive(1);
      }
      setNameError(null);
      setGeneralError(null);
      setIsSubmitting(false);
    }
  }, [isOpen, clientToEdit]);

  // Handle ESC key to close
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
    setGeneralError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError('اسم العميل إلزامي ولا يمكن تركه فارغاً');
      return;
    }
    setNameError(null);

    try {
      setIsSubmitting(true);
      const driver = await getDatabaseDriver();
      const clientRepo = new ClientRepository(driver);

      let savedRecord: ClientRecord;

      if (clientToEdit) {
        const updatePayload: UpdateClientInput = {
          name: trimmedName,
          companyName: companyName.trim() || null,
          phone: phone.trim() || null,
          secondaryPhone: secondaryPhone.trim() || null,
          notes: notes.trim() || null,
          active,
        };
        savedRecord = await clientRepo.update(clientToEdit.id, updatePayload);
      } else {
        const createPayload: CreateClientInput = {
          name: trimmedName,
          companyName: companyName.trim() || null,
          phone: phone.trim() || null,
          secondaryPhone: secondaryPhone.trim() || null,
          notes: notes.trim() || null,
          active,
        };
        savedRecord = await clientRepo.create(createPayload);
      }

      onSaved(savedRecord);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to save client record:', err);
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء حفظ بيانات العميل';
      setGeneralError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div
        className="w-full max-w-lg bg-white rounded-[2rem] shadow-xl border border-[#E5E5E5] overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#004AC6] flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#1A1A1A]">
                {clientToEdit ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
              </h2>
              <p className="text-xs text-[#707070]">
                {clientToEdit ? clientToEdit.name : 'أدخل بيانات العميل الأساسية'}
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {generalError && (
            <div className="p-3 rounded-2xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{generalError}</span>
            </div>
          )}

          {/* Client Name */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              اسم العميل <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
              placeholder="الاسم الكامل للعميل"
              className={`w-full h-11 px-4 rounded-full border text-xs font-semibold text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all ${
                nameError
                  ? 'border-rose-300 focus:border-rose-500'
                  : 'border-[#E5E5E5] focus:border-[#004AC6]'
              }`}
              disabled={isSubmitting}
              autoFocus
            />
            {nameError && (
              <p className="mt-1 text-xs text-rose-600 font-medium">{nameError}</p>
            )}
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              الشركة أو البراند (اختياري)
            </label>
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="اسم الشركة"
              className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-semibold text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all"
              disabled={isSubmitting}
            />
          </div>

          {/* Phones Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Primary Phone */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                الهاتف الأساسي
              </label>
              <input
                type="text"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-mono text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all text-left"
                disabled={isSubmitting}
              />
            </div>

            {/* Secondary Phone / WhatsApp */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                هاتف إضافي / واتساب
              </label>
              <input
                type="text"
                dir="ltr"
                value={secondaryPhone}
                onChange={(e) => setSecondaryPhone(e.target.value)}
                placeholder="01187654321"
                className="w-full h-11 px-4 rounded-full border border-[#E5E5E5] focus:border-[#004AC6] text-xs font-mono text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all text-left"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              ملاحظات (اختياري)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ملاحظات حول طبيعة العمل..."
              className="w-full p-3.5 rounded-2xl border border-[#E5E5E5] focus:border-[#004AC6] text-xs text-[#1A1A1A] bg-white placeholder:text-neutral-400 focus:outline-none transition-all resize-none"
              disabled={isSubmitting}
            />
          </div>

          {/* Active Status (if editing) */}
          {clientToEdit && (
            <div className="pt-2 border-t border-neutral-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-[#1A1A1A]">حالة الحساب</span>
                <p className="text-[11px] text-[#707070]">
                  {active === 1 ? 'نشط بالنظام' : 'مؤرشف'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActive(active === 1 ? 0 : 1)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  active === 1
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                {active === 1 ? 'نشط' : 'مؤرشف'}
              </button>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-4 border-t border-neutral-100 flex items-center justify-end gap-2.5">
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
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 h-10 px-6 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري الحفظ...' : clientToEdit ? 'حفظ التعديلات' : 'تسجيل العميل'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ClientFormModal;
