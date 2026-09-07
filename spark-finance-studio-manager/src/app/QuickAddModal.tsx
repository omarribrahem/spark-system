import React, { useEffect } from 'react';
import { X, UserPlus, CreditCard, CalendarPlus, ReceiptText, PackagePlus } from 'lucide-react';

export interface QuickAddOption {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  onClick: () => void;
}

export interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectAction: (actionId: string) => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onSelectAction,
}) => {
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

  const options: QuickAddOption[] = [
    {
      id: 'new-client',
      title: 'إضافة عميل جديد',
      description: 'تسجيل بيانات عميل، شركة، وأرقام التواصل',
      icon: UserPlus,
      colorClass: 'text-blue-600 bg-blue-50',
      onClick: () => onSelectAction('new-client'),
    },
    {
      id: 'new-payment',
      title: 'تسجيل دفعة',
      description: 'إدخال دفعة مالية وتوزيعها على المستحقات',
      icon: CreditCard,
      colorClass: 'text-emerald-600 bg-emerald-50',
      onClick: () => onSelectAction('new-payment'),
    },
    {
      id: 'new-booking',
      title: 'حجز استوديو',
      description: 'تحديد موعد جلسة وتخصيص الباقة أو الحجز المباشر',
      icon: CalendarPlus,
      colorClass: 'text-blue-600 bg-blue-50',
      onClick: () => onSelectAction('new-booking'),
    },
    {
      id: 'new-expense',
      title: 'تسجيل مصروف',
      description: 'توثيق مصاريف المقر والعمليات التشغيلية',
      icon: ReceiptText,
      colorClass: 'text-purple-600 bg-purple-50',
      onClick: () => onSelectAction('new-expense'),
    },
    {
      id: 'new-package',
      title: 'بيع باقة',
      description: 'تفعيل باقة جديدة لعميل برصيد ساعات وريلز',
      icon: PackagePlus,
      colorClass: 'text-amber-600 bg-amber-50',
      onClick: () => onSelectAction('new-package'),
    },
  ];

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
          <div>
            <h2 className="text-base font-bold text-[#1A1A1A]">إضافة سريعة</h2>
            <p className="text-xs text-[#707070] mt-0.5">اختر الإجراء المطلوب تسجيله</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors focus:outline-none"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Options Grid */}
        <div className="p-6 grid grid-cols-1 gap-2.5">
          {options.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={opt.onClick}
                className="flex items-center gap-4 p-3.5 rounded-2xl border border-[#E5E5E5] hover:border-neutral-300 hover:bg-neutral-50/70 text-right transition-all group focus:outline-none"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${opt.colorClass}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="grow min-w-0">
                  <h3 className="text-xs font-bold text-[#1A1A1A] group-hover:text-[#004AC6] transition-colors">
                    {opt.title}
                  </h3>
                  <p className="text-[11px] text-[#707070] font-normal mt-0.5 truncate">
                    {opt.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-neutral-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-5 rounded-full text-xs font-semibold text-[#707070] hover:text-[#1A1A1A] hover:bg-neutral-100 transition-colors focus:outline-none"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};


export default QuickAddModal;
