import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PlusCircle,
  Search,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Calendar,
  Layers,
  Edit2,
} from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import { ClientRepository, ClientRecord } from '../../database/repositories';
import {
  fetchReels,
  updateReelStage,
  getNextReelStage,
  getPreviousReelStage,
  ReelItemWithDetails,
  ReelStage,
  REEL_STAGES,
} from './reels-service';
import { BdiDate } from '../../ui/bdi';
import { SkeletonCard, EmptyState, ActionableError } from '../../ui/feedback';
import { Select } from '../../ui/athredu/Select';

export interface ReelsKanbanProps {
  onRequestNewReel?: boolean;
  onResetNewReelRequest?: () => void;
  preselectedClientId?: string | null;
  onOpenHeaderForm?: (mode: "form-reel") => void;
}

export const ReelsKanban: React.FC<ReelsKanbanProps> = ({
  onRequestNewReel,
  onResetNewReelRequest,
  preselectedClientId,
  onOpenHeaderForm,
}) => {
  const [reels, setReels] = useState<ReelItemWithDetails[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters
  const [selectedClientId, setSelectedClientId] = useState<string>(preselectedClientId || 'all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  
  

  // Quick feedback
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  useEffect(() => {
    if (onRequestNewReel) {
      if (onOpenHeaderForm) onOpenHeaderForm('form-reel');
      if (onResetNewReelRequest) {
        onResetNewReelRequest();
      }
    }
  }, [onRequestNewReel, onResetNewReelRequest]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();

      const clientRepo = new ClientRepository(driver);
      const clientList = await clientRepo.list({ activeOnly: true });
      setClients(clientList);

      const filterId = selectedClientId !== 'all' ? selectedClientId : null;
      const list = await fetchReels(driver, filterId);
      setReels(list);
    } catch (err: unknown) {
      console.error('Failed to load reels:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [selectedClientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Stage transition handler
  const handleStageTransition = async (reel: ReelItemWithDetails, targetStage: ReelStage) => {
    try {
      const driver = await getDatabaseDriver();
      await updateReelStage(driver, reel.id, targetStage);
      await loadData();

      const stageObj = REEL_STAGES.find((s) => s.id === targetStage);
      setFeedbackMessage(`تم نقل الريل "${reel.title}" إلى: ${stageObj?.title}`);
      setTimeout(() => setFeedbackMessage(null), 3500);
    } catch (err: unknown) {
      console.error('Failed to transition reel stage:', err);
      setFeedbackMessage(err instanceof Error ? err.message : 'فشل تحديث مرحلة الريل');
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  // Filter reels by search
  const filteredReels = useMemo(() => {
    return reels.filter((r) => {
      const matchSearch =
        searchQuery === '' ||
        (r.title && r.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
        r.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.packageNameSnapshot && r.packageNameSnapshot.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (r.notes && r.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchSearch;
    });
  }, [reels, searchQuery]);

  // Group reels by stage
  const reelsByStage = useMemo(() => {
    const map = new Map<ReelStage, ReelItemWithDetails[]>();
    REEL_STAGES.forEach((s) => map.set(s.id, []));

    filteredReels.forEach((r) => {
      const list = map.get(r.stage) || [];
      list.push(r);
      map.set(r.stage, list);
    });

    return map;
  }, [filteredReels]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search & Client Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="البحث بعنوان الريلز، العميل، أو الباقة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-4 pr-10 rounded-full border border-[#E5E5E5] bg-white text-xs text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
            />
          </div>

          <div className="w-52">
            <Select
              value={selectedClientId}
              onValueChange={setSelectedClientId}
              options={[
                { value: 'all', label: 'جميع العملاء' },
                ...clients.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.company_name ? ` (${c.company_name})` : ''}`,
                })),
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

        {/* CTA */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onOpenHeaderForm?.("form-reel")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-[0.98] text-white whitespace-nowrap shrink-0 text-xs font-bold transition-all shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>ريل جديد</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {feedbackMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-full px-5 flex items-center gap-2.5 text-xs font-semibold animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* States Handling */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} hasHeader />
        </div>
      ) : error ? (
        <ActionableError
          title="تعذر تحميل لوحة الريلز"
          message={error.message}
          onRetry={loadData}
          error={error}
        />
      ) : filteredReels.length === 0 && searchQuery === '' && selectedClientId === 'all' ? (
        <EmptyState
          title="لا توجد فيديوهات ريلز"
          description="أضف فيديوهات ريلز لمتابعة مراحل التصوير والمونتاج والتسليم."
          actionLabel="إضافة ريل جديد"
          onAction={() => {
            onOpenHeaderForm?.("form-reel");
          }}
        />
      ) : (
        /* Visual 5-Column Kanban Board */
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 items-start">
          {REEL_STAGES.map((stageInfo) => {
            const columnReels = reelsByStage.get(stageInfo.id) || [];

            return (
              <div
                key={stageInfo.id}
                className="bg-neutral-50 rounded-[2rem] border border-[#E5E5E5] p-3.5 flex flex-col min-h-[500px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-neutral-200/80">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${
                      stageInfo.id === 'planned' ? 'bg-blue-500' :
                      stageInfo.id === 'filmed' ? 'bg-amber-500' :
                      stageInfo.id === 'editing' ? 'bg-purple-500' :
                      stageInfo.id === 'review' ? 'bg-indigo-500' : 'bg-emerald-500'
                    }`} />
                    <h3 className="text-xs font-bold text-[#1A1A1A] tracking-tight">
                      {stageInfo.title.split(' ')[0]}
                    </h3>
                  </div>

                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-neutral-600 shadow-xs border border-[#E5E5E5]">
                    {columnReels.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="space-y-2.5 flex-1">
                  {columnReels.length === 0 ? (
                    <div className="h-32 rounded-2xl border border-dashed border-neutral-200 flex items-center justify-center text-[11px] text-neutral-400 select-none">
                      فارغ
                    </div>
                  ) : (
                    columnReels.map((reel) => {
                      const prevStage = getPreviousReelStage(reel.stage);
                      const nextStage = getNextReelStage(reel.stage);

                      return (
                        <div
                          key={reel.id}
                          className="bg-white rounded-2xl border border-[#E5E5E5] p-3.5 shadow-xs hover:border-neutral-300 transition-all space-y-2.5"
                        >
                          {/* Title & Edit */}
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="font-bold text-[#1A1A1A] text-xs leading-snug">
                              {reel.title || 'ريل بدون عنوان'}
                            </h4>
                            <button
                              type="button"
                              onClick={() => {
                                onOpenHeaderForm?.("form-reel");
                              }}
                              className="w-6 h-6 rounded-full bg-neutral-100 text-neutral-400 hover:text-[#1A1A1A] flex items-center justify-center transition-colors"
                              title="تعديل"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Client & Package Tags */}
                          <div className="space-y-1 text-[11px]">
                            <div className="text-neutral-600 font-medium truncate">
                              {reel.clientName}
                            </div>
                            {reel.packageNameSnapshot && (
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 text-[10px] font-medium truncate max-w-full">
                                <Layers className="w-2.5 h-2.5 shrink-0 text-neutral-400" />
                                <span className="truncate">{reel.packageNameSnapshot}</span>
                              </div>
                            )}
                          </div>

                          {/* Target Date */}
                          {reel.targetDate && (
                            <div className="flex items-center gap-1 text-[10px] text-neutral-400">
                              <Calendar className="w-3 h-3 text-neutral-400" />
                              <span>التسليم:</span>
                              <BdiDate value={reel.targetDate} format="date" className="font-semibold text-neutral-600" />
                            </div>
                          )}

                          {/* Stage Transition Buttons */}
                          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between gap-1">
                            {prevStage ? (
                              <button
                                type="button"
                                onClick={() => handleStageTransition(reel, prevStage)}
                                className="px-2 py-1 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-all text-[10px] flex items-center gap-0.5"
                                title="السابق"
                              >
                                <ArrowRight className="w-3 h-3" />
                                <span>السابق</span>
                              </button>
                            ) : (
                              <div />
                            )}

                            {nextStage ? (
                              <button
                                type="button"
                                onClick={() => handleStageTransition(reel, nextStage)}
                                className="px-2.5 py-1 rounded-full bg-[#004AC6] hover:bg-[#003bb0] text-white transition-all text-[10px] font-semibold flex items-center gap-0.5 shadow-xs"
                                title="التالي"
                              >
                                <span>التالي</span>
                                <ArrowLeft className="w-3 h-3" />
                              </button>
                            ) : (
                              <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>مكتمل</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      
    </div>
  );
};

export default ReelsKanban;
