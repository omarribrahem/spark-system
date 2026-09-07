import React from 'react';
import { AlertOctagon, X, Clock, Calendar } from 'lucide-react';
import { ConflictDetail } from '../../domain/models/booking';
import { BdiDate, BdiText } from '../../ui/bdi';

export interface OverlapCollisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflicts: ConflictDetail[];
  proposedDate?: string;
  proposedStartTime?: string;
  proposedEndTime?: string;
}

/**
 * OverlapCollisionModal: Displays hard-blocking collision warnings.
 * Per PRD §14.13 & Milestone M5 Requirements:
 * When an overlap is detected, saving is strictly BLOCKED with NO bypass.
 */
export const OverlapCollisionModal: React.FC<OverlapCollisionModalProps> = ({
  isOpen,
  onClose,
  conflicts,
  proposedDate,
  proposedStartTime,
  proposedEndTime,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="collision-modal-title"
    >
      <div className="bg-white rounded-[2rem] shadow-2xl max-w-lg w-full overflow-hidden border border-[#E5E5E5] animate-in zoom-in-95 duration-200 text-[#1A1A1A]">
        {/* Header */}
        <div className="p-6 border-b border-neutral-100 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <h2 id="collision-modal-title" className="text-base font-bold text-[#1A1A1A]">
                تعارض زمني في الاستوديو
              </h2>
              <p className="text-xs text-neutral-400 mt-1">
                يوجد حجز آخر في نفس التوقيت. يرجى تعديل موعد الحجز.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center transition-colors"
            aria-label="إغلاق النافذة"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Proposed Slot Summary */}
          {proposedDate && proposedStartTime && proposedEndTime && (
            <div className="bg-neutral-50 p-4 rounded-2xl">
              <div className="text-xs font-medium text-neutral-400 mb-1">
                الموعد المطلوب:
              </div>
              <div className="flex items-center gap-4 text-xs font-bold text-[#1A1A1A]">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                  <BdiDate value={proposedDate} format="date" />
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-neutral-400" />
                  <BdiDate timeRange={{ start: proposedStartTime, end: proposedEndTime }} />
                </span>
              </div>
            </div>
          )}

          {/* List of Conflicts */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-neutral-700">
              الحجوزات المتعارضة ({conflicts.length}):
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1 no-scrollbar">
              {conflicts.map((c, idx) => (
                <div
                  key={idx}
                  className="bg-red-50/70 border border-red-200 p-3.5 rounded-2xl flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-red-900">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-red-600" />
                      <span>الفترة القائمة:</span>
                      <BdiDate
                        timeRange={{
                          start: c.existingSlot.startTime,
                          end: c.existingSlot.endTime,
                        }}
                      />
                    </span>
                    <span className="bg-red-100 text-red-800 px-2 py-0.5 rounded-full text-[10px] font-medium">
                      تداخل <BdiText>{c.overlapMinutes} دقيقة</BdiText>
                    </span>
                  </div>

                  <div className="text-[11px] text-red-700 flex items-center gap-2">
                    <span>تاريخ الجلسة:</span>
                    <BdiDate value={c.existingSlot.date} format="date" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-100 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold shadow-sm transition-all focus:outline-none"
          >
            تعديل وقت الحجز
          </button>
        </div>
      </div>
    </div>
  );
};

export default OverlapCollisionModal;
