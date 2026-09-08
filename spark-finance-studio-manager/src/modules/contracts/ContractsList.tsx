import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  FileSignature,
  PlusCircle,
  Search,
  Calendar,
  Layers,
  Globe,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';
import {
  fetchMarketingContracts,
  generateMonthlyDuesForActiveContracts,
  MarketingContractWithDetails,
} from './contract-service';
import { ContractRepository } from '../../database/repositories';
import { BdiCurrency, BdiDate } from '../../ui/bdi';
import { SkeletonCard, EmptyState, ActionableError } from '../../ui/feedback';
import { Select } from '../../ui/athredu/Select';
import { SubscriptionsList } from './SubscriptionsList';
import { WebsiteProjectsList } from './WebsiteProjectsList';
import { ServicesCatalogView } from './ServicesCatalogView';

export type ContractsTab = 'marketing' | 'subscriptions' | 'website' | 'services';

export interface ContractsListProps {
  onRequestNewContract?: boolean;
  onResetNewContractRequest?: () => void;
  preselectedClientId?: string | null;
  onOpenHeaderForm?: (mode: "form-contract" | "form-subscription" | "form-website" | "form-service") => void;
}

export const ContractsList: React.FC<ContractsListProps> = ({
  onRequestNewContract,
  onResetNewContractRequest,
  preselectedClientId,
  onOpenHeaderForm,
}) => {
  const [activeTab, setActiveTab] = useState<ContractsTab>('marketing');
  const [contracts, setContracts] = useState<MarketingContractWithDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Expanded dues drawer per contract
  const [expandedContractId, setExpandedContractId] = useState<string | null>(null);

  // Quick Action Feedback
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isGeneratingDues, setIsGeneratingDues] = useState(false);

  useEffect(() => {
    if (onRequestNewContract) {
      setActiveTab('marketing');
      if (onOpenHeaderForm) onOpenHeaderForm('form-contract');
      if (onResetNewContractRequest) onResetNewContractRequest();
    }
  }, [onRequestNewContract, onResetNewContractRequest, onOpenHeaderForm]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const list = await fetchMarketingContracts(driver);
      setContracts(list);
    } catch (err: unknown) {
      console.error('Failed to load marketing contracts:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Generate current month dues for all active contracts
  const handleGenerateCurrentMonthDues = async () => {
    try {
      setIsGeneratingDues(true);
      const driver = await getDatabaseDriver();
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;

      const result = await generateMonthlyDuesForActiveContracts(driver, year, month);
      await loadData();
      setFeedbackMessage(
        `تم فحص العقود: تم توليد ${result.generatedCount} استحقاق جديد للشهر الحالي (${result.skippedCount} عقد كان استحقاقه موجوداً بالفعل أو خارج الفترة).`
      );
      setTimeout(() => setFeedbackMessage(null), 5000);
    } catch (e: unknown) {
      console.error('Failed to bulk generate dues:', e);
      setFeedbackMessage(e instanceof Error ? e.message : 'فشل توليد الاستحقاقات');
    } finally {
      setIsGeneratingDues(false);
    }
  };

  // Generate a single due for a specific contract
  const handleGenerateSingleDue = async (contract: MarketingContractWithDetails) => {
    try {
      const driver = await getDatabaseDriver();
      const repo = new ContractRepository(driver);
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const mm = String(month).padStart(2, '0');
      const dueDate = `${year}-${mm}-01`;

      await repo.generateMonthlyDue(contract.id, year, month, dueDate);
      await loadData();
      setFeedbackMessage(`تم بنجاح توليد استحقاق شهر ${month}/${year} للعقد`);
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: unknown) {
      console.error('Failed to generate single due:', err);
      setFeedbackMessage(err instanceof Error ? err.message : 'تعذر توليد الاستحقاق (ربما تم إنشاؤه مسبقاً)');
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  };

  const filteredContracts = useMemo(() => {
    return contracts.filter((c) => {
      const matchSearch =
        searchQuery === '' ||
        c.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.clientCompany && c.clientCompany.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (c.notes && c.notes.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchStatus = true;
      if (statusFilter === 'overdue') {
        matchStatus = c.overdueDuesCount > 0;
      } else if (statusFilter !== 'all') {
        matchStatus = c.status === statusFilter;
      }

      const matchClient = !preselectedClientId || c.client_id === preselectedClientId;

      return matchSearch && matchStatus && matchClient;
    });
  }, [contracts, searchQuery, statusFilter, preselectedClientId]);

  const totalMonthlyRetainersPiasters = useMemo(() => {
    return contracts
      .filter((c) => c.status === 'active')
      .reduce((sum, c) => sum + c.monthly_amount, 0);
  }, [contracts]);

  const totalOutstandingReceivablesPiasters = useMemo(() => {
    return contracts.reduce((sum, c) => sum + c.totalRemainingDuesPiasters, 0);
  }, [contracts]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Tab Navigation (ATHREDU Segmented Capsule Switcher) */}
      <div className="inline-flex p-1 rounded-full bg-neutral-100 border border-neutral-200/60 shadow-inner">
        <button
          type="button"
          onClick={() => setActiveTab('marketing')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full transition-all select-none ${
            activeTab === 'marketing'
              ? 'bg-white text-[#1A1A1A] shadow-sm font-bold'
              : 'text-[#707070] hover:text-[#1A1A1A]'
          }`}
        >
          <FileSignature className="w-3.5 h-3.5 text-blue-600" />
          <span>عقود التسويق</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] bg-neutral-100 text-neutral-600 font-semibold">
            {contracts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('subscriptions')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full transition-all select-none ${
            activeTab === 'subscriptions'
              ? 'bg-white text-[#1A1A1A] shadow-sm font-bold'
              : 'text-[#707070] hover:text-[#1A1A1A]'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-indigo-600" />
          <span>الاشتراكات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('website')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full transition-all select-none ${
            activeTab === 'website'
              ? 'bg-white text-[#1A1A1A] shadow-sm font-bold'
              : 'text-[#707070] hover:text-[#1A1A1A]'
          }`}
        >
          <Globe className="w-3.5 h-3.5 text-blue-600" />
          <span>المواقع</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('services')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-full transition-all select-none ${
            activeTab === 'services'
              ? 'bg-white text-[#1A1A1A] shadow-sm font-bold'
              : 'text-[#707070] hover:text-[#1A1A1A]'
          }`}
        >
          <Layers className="w-3.5 h-3.5 text-sky-600" />
          <span>دليل الخدمات المعتمدة</span>
        </button>
      </div>

      {/* FEEDBACK TOAST / BANNER */}
      {feedbackMessage && (
        <div className="p-3.5 bg-blue-50 border border-blue-100 text-blue-900 rounded-2xl flex items-center gap-2.5 text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-[#004AC6] shrink-0" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      {/* TAB 1: MARKETING CONTRACTS */}
      {activeTab === 'marketing' && (
        <div className="space-y-4">
          {/* Top Control Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-64 sm:w-72">
                <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="البحث بالعميل، الشركة أو البنود..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-11 pr-10 pl-4 rounded-full border border-[#E5E5E5] bg-white text-xs font-semibold text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
                />
              </div>

              <div className="w-44">
                <Select
                  value={statusFilter}
                  onValueChange={(val) => setStatusFilter(val)}
                  placeholder="الحالة"
                  options={[
                    { value: "all", label: "جميع الحالات" },
                    { value: "active", label: "عقود نشطة فقط" },
                    { value: "overdue", label: "بها مستحقات متأخرة" },
                    { value: "paused", label: "معلقة مؤقتاً" },
                    { value: "terminated", label: "منتهية أو ملغاة" },
                  ]}
                />
              </div>

              <button
                type="button"
                onClick={loadData}
                title="تحديث البيانات"
                className="w-11 h-11 rounded-full border border-[#E5E5E5] bg-white text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50 flex items-center justify-center transition-all"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleGenerateCurrentMonthDues}
                disabled={isGeneratingDues}
                className="flex items-center gap-1.5 h-11 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-semibold transition-all"
                title="توليد قيد استحقاق لجميع العقود النشطة للشهر الحالي"
              >
                <CalendarPlus className="w-4 h-4 text-[#004AC6]" />
                <span>{isGeneratingDues ? 'جاري التوليد...' : 'توليد مستحقات الشهر'}</span>
              </button>

              <button
                type="button"
                onClick={() => onOpenHeaderForm?.('form-contract')}
                className="flex items-center gap-2 h-11 px-5 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>عقد جديد</span>
              </button>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-medium">الإيراد الشهري المثبت (عقود نشطة):</span>
              <BdiCurrency piasters={totalMonthlyRetainersPiasters} className="text-lg font-bold text-[#1A1A1A]" />
            </div>

            <div className="p-5 bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-center justify-between">
              <span className="text-xs text-neutral-500 font-medium">المستحقات غير المحصلة:</span>
              <BdiCurrency
                piasters={totalOutstandingReceivablesPiasters}
                className={`text-lg font-bold ${
                  totalOutstandingReceivablesPiasters > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              />
            </div>
          </div>

          {/* Table Container */}
          {isLoading ? (
            <div className="space-y-3">
              <SkeletonCard rows={3} hasHeader hasBadge />
            </div>
          ) : error ? (
            <ActionableError
              title="تعذر تحميل قائمة العقود"
              message={error.message}
              onRetry={loadData}
              error={error}
            />
          ) : filteredContracts.length === 0 ? (
            <EmptyState
              title="لا توجد عقود تسويق مسجلة"
              description="سجّل أول عقد تسويق لمتابعة الدفعات الدورية والبنود الشهرية."
              actionLabel="إنشاء عقد تسويق الآن"
              onAction={() => onOpenHeaderForm?.('form-contract')}
            />
          ) : (
            <div className="bg-white rounded-[2rem] border border-[#E5E5E5] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs text-neutral-700">
                  <thead className="bg-neutral-50/80 border-b border-[#E5E5E5] text-neutral-500 font-semibold">
                    <tr>
                      <th className="px-5 py-3.5 text-right">العميل</th>
                      <th className="px-5 py-3.5 text-right">الاشتراك الشهري</th>
                      <th className="px-5 py-3.5 text-right">الفترة</th>
                      <th className="px-5 py-3.5 text-right">الحالة</th>
                      <th className="px-5 py-3.5 text-right">المستحقات</th>
                      <th className="px-5 py-3.5 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 font-medium">
                    {filteredContracts.map((contract) => {
                      const isExpanded = expandedContractId === contract.id;

                      return (
                        <React.Fragment key={contract.id}>
                          <tr className="hover:bg-neutral-50/70 transition-colors">
                            {/* Client */}
                            <td className="px-5 py-4">
                              <div className="font-bold text-[#1A1A1A]">{contract.clientName}</div>
                              {contract.clientCompany && (
                                <div className="text-[11px] text-neutral-400">{contract.clientCompany}</div>
                              )}
                            </td>

                            {/* Monthly Amount */}
                            <td className="px-5 py-4">
                              <div className="font-bold text-[#1A1A1A] text-sm">
                                <BdiCurrency piasters={contract.monthly_amount} />
                              </div>
                            </td>

                            {/* Period */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-1.5 text-neutral-600">
                                <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                                <span>من</span>
                                <BdiDate value={contract.start_date} format="date" />
                              </div>
                            </td>

                            {/* Status */}
                            <td className="px-5 py-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                  contract.status === 'active'
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : contract.status === 'paused'
                                    ? 'bg-amber-50 text-amber-700'
                                    : 'bg-neutral-100 text-neutral-600'
                                }`}
                              >
                                {contract.status === 'active' && 'نشط'}
                                {contract.status === 'draft' && 'مسودة'}
                                {contract.status === 'paused' && 'معلق'}
                                {contract.status === 'ended' && 'منتهي'}
                                {contract.status === 'cancelled' && 'ملغي'}
                              </span>
                            </td>

                            {/* Dues breakdown */}
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 text-[11px] font-bold">
                                  {contract.duesCount} استحقاق
                                </span>
                                {contract.overdueDuesCount > 0 && (
                                  <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[11px] font-bold flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    <span>{contract.overdueDuesCount} متأخر</span>
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* Actions */}
                            <td className="px-5 py-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleGenerateSingleDue(contract)}
                                  title="توليد استحقاق الشهر الحالي لهذا العقد"
                                  className="p-2 rounded-full border border-[#E5E5E5] hover:border-neutral-300 hover:bg-neutral-50 text-neutral-600 hover:text-[#004AC6] transition-all"
                                >
                                  <CalendarPlus className="w-4 h-4" />
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedContractId(isExpanded ? null : contract.id)
                                  }
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all"
                                >
                                  <span>كشف المستحقات</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    onOpenHeaderForm?.('form-contract');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-all"
                                >
                                  تعديل
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* EXPANDED DUES ACCORDION */}
                          {isExpanded && (
                            <tr className="bg-slate-50/80">
                              <td colSpan={6} className="px-6 py-4">
                                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                    <span className="font-bold text-xs text-slate-800 flex items-center gap-2">
                                      <Clock className="w-4 h-4 text-[#004AC6]" />
                                      <span>سجل الاستحقاقات الشهرية المسجلة للعقد:</span>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleGenerateSingleDue(contract)}
                                      className="px-3 py-1 rounded-full bg-[#004AC6] hover:bg-[#003bb0] text-white text-[11px] font-bold transition-all shadow-xs flex items-center gap-1"
                                    >
                                      <CalendarPlus className="w-3.5 h-3.5" />
                                      <span>إضافة استحقاق الشهر الحالي</span>
                                    </button>
                                  </div>

                                  {contract.dues.length === 0 ? (
                                    <div className="text-center py-4 text-xs text-slate-400">
                                      لا توجد استحقاقات مسجلة بعد لهذا العقد. اضغط "إضافة استحقاق" لبدء الجدولة.
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                      {contract.dues.map((due) => (
                                        <div
                                          key={due.id}
                                          className={`p-3 rounded-xl border text-xs flex flex-col justify-between ${
                                            due.remainingAmount === 0
                                              ? 'bg-emerald-50/50 border-emerald-200'
                                              : due.status === 'overdue'
                                              ? 'bg-red-50/50 border-red-200'
                                              : 'bg-slate-50 border-slate-200'
                                          }`}
                                        >
                                          <div className="flex items-center justify-between mb-1.5">
                                            <span className="font-bold text-slate-900">
                                              شهر {due.month} / {due.year}
                                            </span>
                                            <span
                                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                due.remainingAmount === 0
                                                  ? 'bg-emerald-100 text-emerald-800'
                                                  : due.status === 'overdue'
                                                  ? 'bg-red-100 text-red-800'
                                                  : 'bg-amber-100 text-amber-800'
                                              }`}
                                            >
                                              {due.remainingAmount === 0
                                                ? 'مدفوع بالكامل'
                                                : due.status === 'overdue'
                                                ? 'متأخر'
                                                : due.status === 'due'
                                                ? 'مستحق الآن'
                                                : 'قادم'}
                                            </span>
                                          </div>

                                          <div className="flex items-center justify-between text-slate-600 text-[11px] pt-1 border-t border-slate-200/60">
                                            <span>القيمة: <BdiCurrency piasters={due.base_amount} /></span>
                                            <span>متبقي: <BdiCurrency piasters={due.remainingAmount} className="font-bold" /></span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SUBSCRIPTIONS */}
      {activeTab === 'subscriptions' && (
        <SubscriptionsList
          onOpenHeaderForm={onOpenHeaderForm ? () => onOpenHeaderForm('form-subscription') : undefined}
        />
      )}

      {/* TAB 3: WEBSITE PROJECTS */}
      {activeTab === 'website' && (
        <WebsiteProjectsList
          onOpenHeaderForm={onOpenHeaderForm ? () => onOpenHeaderForm('form-website') : undefined}
        />
      )}

      {/* TAB 4: SERVICES CATALOG */}
      {activeTab === 'services' && (
        <ServicesCatalogView
          onOpenHeaderForm={onOpenHeaderForm ? () => onOpenHeaderForm('form-service') : undefined}
        />
      )}
    </div>
  );
};

export default ContractsList;
