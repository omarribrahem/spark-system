import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PlusCircle, Search, Globe, RefreshCw, CheckCircle, ArrowRight } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import {
  fetchWebsiteProjects,
  WebsiteProjectWithDetails,
} from './contract-service';
import { WebsiteProjectRecord, ContractRepository } from '../../database/repositories';
import { WebsiteProjectStatus } from '../../domain/models/contract';
import { BdiCurrency, BdiDate } from '../../ui/bdi';
import { SkeletonCard, EmptyState, ActionableError } from '../../ui/feedback';
import { WebsiteProjectModal } from './WebsiteProjectModal';
import { Select } from '../../ui/athredu/Select';

export interface WebsiteProjectsListProps {
  onRequestNewProject?: boolean;
  onResetNewProjectRequest?: () => void;
  onOpenHeaderForm?: () => void;
}

export const WebsiteProjectsList: React.FC<WebsiteProjectsListProps> = ({
  onRequestNewProject,
  onResetNewProjectRequest,
  onOpenHeaderForm,
}) => {
  const [projects, setProjects] = useState<WebsiteProjectWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<WebsiteProjectRecord | null>(null);

  useEffect(() => {
    if (onRequestNewProject) {
      setProjectToEdit(null);
      setIsModalOpen(true);
      if (onResetNewProjectRequest) {
        onResetNewProjectRequest();
      }
    }
  }, [onRequestNewProject, onResetNewProjectRequest]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const list = await fetchWebsiteProjects(driver);
      setProjects(list);
    } catch (err: unknown) {
      console.error('Failed to load website projects:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Quick milestone advance
  const handleAdvanceMilestone = async (project: WebsiteProjectWithDetails) => {
    let nextStatus: WebsiteProjectStatus = 'new';
    if (project.status === 'new') nextStatus = 'in_progress';
    else if (project.status === 'in_progress') nextStatus = 'waiting';
    else if (project.status === 'waiting') nextStatus = 'completed';
    else return;

    try {
      const driver = await getDatabaseDriver();
      const repo = new ContractRepository(driver);
      await repo.updateWebsiteMilestone(project.id, nextStatus);
      await loadData();
    } catch (e) {
      console.error('Failed to advance milestone:', e);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchSearch =
        searchQuery === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.clientCompany && p.clientCompany.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus = statusFilter === 'all' || p.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [projects, searchQuery, statusFilter]);

  const totalRevenuePiasters = useMemo(() => {
    return projects.reduce((sum, p) => sum + p.total_price, 0);
  }, [projects]);

  return (
    <div className="space-y-4" dir="rtl">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search & Filter */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-64 sm:w-72">
            <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="البحث باسم المشروع أو العميل..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-4 pr-10 rounded-full border border-[#E5E5E5] bg-white text-xs text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
            />
          </div>

          <div className="w-48">
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={[
                { value: 'all', label: 'جميع المراحل' },
                { value: 'new', label: '1. تعاقد وتخطيط (New)' },
                { value: 'in_progress', label: '2. تصميم وبرمجة (In Progress)' },
                { value: 'waiting', label: '3. مراجعة العميل (Waiting)' },
                { value: 'completed', label: '4. تم التسليم (Completed)' },
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

        {/* Add Project CTA */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-neutral-100 text-neutral-600 text-xs font-semibold">
            <span>إجمالي مشاريع المواقع:</span>
            <BdiCurrency piasters={totalRevenuePiasters} className="font-bold text-[#1A1A1A]" />
          </div>

          <button
            type="button"
            onClick={() => {
              if (onOpenHeaderForm) {
                onOpenHeaderForm();
              } else {
                setProjectToEdit(null);
                setIsModalOpen(true);
              }
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold transition-all shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>مشروع موقع جديد</span>
          </button>
        </div>
      </div>

      {/* States Handling */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SkeletonCard rows={3} hasHeader hasBadge />
          <SkeletonCard rows={3} hasHeader hasBadge />
        </div>
      ) : error ? (
        <ActionableError
          title="تعذر تحميل مشاريع المواقع"
          message={error.message}
          onRetry={loadData}
          error={error}
        />
      ) : filteredProjects.length === 0 ? (
        <EmptyState
          title="لا توجد مشاريع مواقع مسجلة"
          description={
            searchQuery || statusFilter !== 'all'
              ? 'لم يتم العثور على مشاريع تطابق معايير البحث والفلترة.'
              : 'سجل مشاريع تصميم وبرمجة المواقع والمتاجر الإلكترونية لمتابعة نسب الإنجاز والدفعات.'
          }
          actionLabel="تسجيل مشروع جديد الآن"
          onAction={() => {
            setProjectToEdit(null);
            setIsModalOpen(true);
          }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredProjects.map((proj) => (
            <div
              key={proj.id}
              className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:border-neutral-300 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#1A1A1A] text-sm">{proj.name}</h3>
                      <p className="text-xs text-neutral-400">
                        {proj.clientName} {proj.clientCompany ? `• ${proj.clientCompany}` : ''}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${
                      proj.status === 'completed'
                        ? 'bg-emerald-50 text-emerald-700'
                        : proj.status === 'in_progress'
                        ? 'bg-amber-50 text-amber-700'
                        : proj.status === 'waiting'
                        ? 'bg-purple-50 text-purple-700'
                        : 'bg-blue-50 text-blue-700'
                    }`}
                  >
                    {proj.status === 'new' && '1. تعاقد وتخطيط'}
                    {proj.status === 'in_progress' && '2. قيد البرمجة'}
                    {proj.status === 'waiting' && '3. بانتظار المراجعة'}
                    {proj.status === 'completed' && '4. تم التسليم'}
                    {proj.status === 'cancelled' && 'ملغي'}
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5 mb-4">
                  <div className="flex items-center justify-between text-xs text-neutral-600 font-medium">
                    <span>نسبة إنجاز المراحل</span>
                    <span className="font-bold text-[#1A1A1A]">{proj.progressPercentage}%</span>
                  </div>
                  <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#004AC6] transition-all duration-300 rounded-full"
                      style={{ width: `${proj.progressPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Project Details Grid */}
                <div className="grid grid-cols-2 gap-3 py-3 border-t border-b border-neutral-100 text-xs">
                  <div>
                    <span className="text-neutral-400 block text-[11px]">إجمالي التكلفة</span>
                    <BdiCurrency piasters={proj.total_price} className="font-bold text-[#1A1A1A] text-sm" />
                  </div>

                  <div>
                    <span className="text-neutral-400 block text-[11px]">تاريخ الانطلاق</span>
                    <BdiDate value={proj.start_date} format="date" className="text-[#1A1A1A] font-medium" />
                  </div>

                  {proj.expected_delivery_date && (
                    <div>
                      <span className="text-neutral-400 block text-[11px]">التسليم المتوقع</span>
                      <BdiDate value={proj.expected_delivery_date} format="date" className="text-[#1A1A1A] font-medium" />
                    </div>
                  )}

                  {proj.next_payment_amount && (
                    <div>
                      <span className="text-neutral-400 block text-[11px]">الدفعة القادمة</span>
                      <BdiCurrency piasters={proj.next_payment_amount} className="font-bold text-amber-700" />
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 pt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProjectToEdit(proj);
                    setIsModalOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-medium transition-all"
                >
                  تعديل
                </button>

                {proj.status !== 'completed' && proj.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => handleAdvanceMilestone(proj)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] text-white text-xs font-medium transition-all shadow-xs"
                  >
                    <span>ترقية المرحلة</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}

                {proj.status === 'completed' && (
                  <span className="flex items-center gap-1 text-emerald-600 text-xs font-semibold">
                    <CheckCircle className="w-4 h-4" />
                    <span>مكتمل</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <WebsiteProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSaved={loadData}
        projectToEdit={projectToEdit}
      />
    </div>
  );
};

export default WebsiteProjectsList;
