import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Users, Calendar, FileText, ArrowRight } from 'lucide-react';
import { BdiText } from '../ui/bdi';

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate?: (path: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onNavigate,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-neutral-900/40 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div
        className="w-full max-w-xl bg-white rounded-[2rem] shadow-xl border border-[#E5E5E5] overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Bar Input */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-neutral-100">
          <Search className="w-4 h-4 text-[#004AC6] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن عميل، عقد، أو جلسة..."
            className="grow bg-transparent border-none text-xs font-semibold text-[#1A1A1A] focus:outline-none placeholder:text-neutral-400 font-sans"
            dir="auto"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 text-neutral-400 hover:text-neutral-600 focus:outline-none"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:inline-block font-mono text-[10px] bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full border border-neutral-200">
            ESC
          </kbd>
        </div>

        {/* Search Content / Empty / Preview */}
        <div className="p-4 max-h-96 overflow-y-auto">
          {query.trim() === '' ? (
            <div className="p-6 text-center text-neutral-400">
              <p className="text-xs font-medium text-neutral-500">البحث الفوري في كامل النظام</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-neutral-600">
                <span className="px-3 py-1 bg-neutral-100 rounded-full flex items-center gap-1.5 text-[11px] font-semibold">
                  <Users className="w-3 h-3 text-blue-600" /> العملاء
                </span>
                <span className="px-3 py-1 bg-neutral-100 rounded-full flex items-center gap-1.5 text-[11px] font-semibold">
                  <FileText className="w-3 h-3 text-emerald-600" /> العقود والمستحقات
                </span>
                <span className="px-3 py-1 bg-neutral-100 rounded-full flex items-center gap-1.5 text-[11px] font-semibold">
                  <Calendar className="w-3 h-3 text-indigo-600" /> جلسات الاستوديو
                </span>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="text-[11px] font-bold text-neutral-400 px-3 py-1">نتائج فورية</div>
              <button
                type="button"
                onClick={() => {
                  onNavigate?.('clients');
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3 rounded-2xl hover:bg-neutral-50 border border-transparent hover:border-neutral-200 text-right group transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#1A1A1A]">
                      <BdiText>{query}</BdiText>
                    </h4>
                    <p className="text-[11px] text-neutral-500">الانتقال إلى سجل العملاء</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-neutral-300 group-hover:text-[#004AC6] transition-colors" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
