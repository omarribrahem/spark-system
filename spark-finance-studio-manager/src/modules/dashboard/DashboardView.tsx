import React, { useEffect, useState, useCallback } from 'react';
import { getDatabaseDriver } from '../../database/driver';
import { NavSection } from '../../app/navigation';
import { Card } from '../../ui/athredu/Card';
import { Button } from '../../ui/athredu/Button';
import { BdiCurrency, BdiDate } from '../../ui/bdi';
import { SkeletonCard, ActionableError } from '../../ui/feedback';
import {
  Users,
  TrendingUp,
  AlertCircle,
  Plus,
  CreditCard,
  Boxes,
  Film,
  CalendarCheck,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

export interface DashboardViewProps {
  onNavigate: (section: NavSection, filter?: string) => void;
  onOpenHeaderForm: (mode: string) => void;
}

interface ExpiringPlanItem {
  id: string;
  clientName: string;
  nameSnapshot: string;
  endDate: string;
  totalPiasters: number;
}

interface OverdueReelItem {
  id: string;
  title: string;
  clientName: string;
  targetDate: string;
  status: string;
}

interface RecentActivityItem {
  id: string;
  type: 'payment' | 'expense';
  title: string;
  amountPiasters: number;
  date: string;
  partyName?: string;
}

interface MonthlyCashflowPoint {
  monthLabel: string;
  collectionsPiasters: number;
  expensesPiasters: number;
}

interface DashboardMetrics {
  activePlansValuePiasters: number;
  monthCollectionsPiasters: number;
  remainingAmountPiasters: number;
  overdueAmountPiasters: number;
  overdueCount: number;
  monthExpensesPiasters: number;
  netCashFlowPiasters: number;
  activeClientsCount: number;
  activePlansCount: number;
  todayBookingsCount: number;
  todayBookingsMinutes: number;
  reelsInProgressCount: number;
  reelsOverdueCount: number;
  expiringPlans: ExpiringPlanItem[];
  overdueReels: OverdueReelItem[];
  recentActivities: RecentActivityItem[];
  monthlyCashflow: MonthlyCashflowPoint[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onOpenHeaderForm,
}) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();

      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const todayStr = now.toISOString().slice(0, 10);
      const in14DaysStr = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

      const [
        paymentsMonthRes,
        expensesMonthRes,
        refundsMonthRes,
        clientsCountRes,
        soldPlansActiveRes,
        agreementsActiveRes,
        overdueRes,
        todayBookingsRes,
        reelsInProgressRes,
        overdueReelsRes,
        expiringPlansRes,
        recentPaymentsRes,
        recentExpensesRes,
      ] = await Promise.all([
        // 1. Month Collections
        driver.query<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'active' AND date >= ?;`,
          [monthStart]
        ),
        // 2. Month Expenses
        driver.query<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= ?;`,
          [monthStart]
        ),
        // 3. Month Refunds
        driver.query<{ total: number }>(
          `SELECT 0 AS total;` // Placeholder for refunds if tracked separately
        ),
        // 4. Active Clients Count
        driver.query<{ total: number }>(
          `SELECT COUNT(*) AS total FROM clients WHERE active = 1;`
        ),
        // 5. Active Sold Plans (Value and Count)
        driver.query<{ totalValue: number; count: number }>(
          `SELECT COALESCE(SUM(total_snapshot), 0) AS totalValue, COUNT(*) AS count FROM sold_plans WHERE service_status = 'active';`
        ),
        // 6. Active Agreements Value
        driver.query<{ totalValue: number }>(
          `SELECT COALESCE(SUM(total_amount), 0) AS totalValue FROM client_agreements WHERE service_status = 'active';`
        ),
        // 7. Overdue Receivables
        driver.query<{ total: number; count: number }>(`
          SELECT COALESCE(SUM(d.base_amount - COALESCE((
            SELECT SUM(pa.amount) FROM payment_allocations pa
            JOIN payments p ON p.id = pa.payment_id
            WHERE pa.target_type = 'marketing_due' AND pa.target_id = d.id AND p.status = 'active'
          ), 0)), 0) AS total,
          COUNT(*) AS count
          FROM marketing_monthly_dues d
          WHERE d.status IN ('due', 'partial', 'overdue');
        `),
        // 8. Studio Bookings Today
        driver.query<{ total: number; total_minutes: number }>(
          `SELECT COUNT(*) AS total, COALESCE(SUM(planned_minutes), 0) AS total_minutes FROM studio_bookings WHERE date = ? AND status NOT IN ('cancelled', 'no_show');`,
          [todayStr]
        ),
        // 9. Reels in Progress
        driver.query<{ total: number }>(
          `SELECT COUNT(*) AS total FROM reel_items WHERE status IN ('planned', 'ready_to_film', 'filmed', 'editing', 'review');`
        ),
        // 10. Overdue Reels
        driver.query<{ id: string; title: string; client_id: string; target_date: string; status: string; clientName: string }>(`
          SELECT r.id, r.title, r.client_id, r.target_date, r.status, c.name AS clientName
          FROM reel_items r
          JOIN clients c ON r.client_id = c.id
          WHERE r.status NOT IN ('delivered', 'cancelled')
            AND r.target_date IS NOT NULL
            AND r.target_date < ?
          ORDER BY r.target_date ASC LIMIT 5;
        `, [todayStr]),
        // 11. Expiring Sold Plans Soon (Next 14 days)
        driver.query<{ id: string; client_id: string; name_snapshot: string; end_date: string; total_snapshot: number; clientName: string }>(`
          SELECT sp.id, sp.client_id, sp.name_snapshot, sp.end_date, sp.total_snapshot, c.name AS clientName
          FROM sold_plans sp
          JOIN clients c ON sp.client_id = c.id
          WHERE sp.service_status = 'active'
            AND sp.end_date IS NOT NULL
            AND sp.end_date BETWEEN ? AND ?
          ORDER BY sp.end_date ASC LIMIT 5;
        `, [todayStr, in14DaysStr]),
        // 12. Recent Payments
        driver.query<{ id: string; amount: number; date: string; clientName: string }>(`
          SELECT p.id, p.amount, p.date, c.name AS clientName
          FROM payments p
          JOIN clients c ON p.client_id = c.id
          WHERE p.status = 'active'
          ORDER BY p.date DESC, p.created_at DESC LIMIT 5;
        `),
        // 13. Recent Expenses
        driver.query<{ id: string; amount: number; date: string; category: string; description: string | null; note: string | null }>(`
          SELECT id, amount, date, category, description, note
          FROM expenses
          ORDER BY date DESC, created_at DESC LIMIT 5;
        `),
      ]);

      const monthCollections = Number(paymentsMonthRes[0]?.total ?? 0);
      const monthExpenses = Number(expensesMonthRes[0]?.total ?? 0);
      const monthRefunds = Number(refundsMonthRes[0]?.total ?? 0);
      const netCashFlow = monthCollections - monthExpenses - monthRefunds;

      const activePlansVal = Number(soldPlansActiveRes[0]?.totalValue ?? 0) + Number(agreementsActiveRes[0]?.totalValue ?? 0);
      const overdueVal = Number(overdueRes[0]?.total ?? 0);

      const getCategoryArabicName = (cat: string) => {
        switch (cat) {
          case 'salary': return 'رواتب وأجور';
          case 'rent': return 'إيجار مقرات';
          case 'studio': return 'مستلزمات استوديو';
          case 'ads': return 'إعلانات وحملات';
          case 'software': return 'اشتراكات برمجية';
          case 'equipment': return 'معدات وأجهزة';
          case 'transport': return 'انتقالات ومواصلات';
          case 'domains': return 'نطاقات واستضافات';
          default: return 'مصروفات عامة';
        }
      };

      // Map activities
      const activities: RecentActivityItem[] = [
        ...recentPaymentsRes.map((p) => ({
          id: p.id,
          type: 'payment' as const,
          title: `دفعة محصلة من ${p.clientName}`,
          amountPiasters: p.amount,
          date: p.date,
          partyName: p.clientName,
        })),
        ...recentExpensesRes.map((e) => {
          const catLabel = getCategoryArabicName(e.category);
          return {
            id: e.id,
            type: 'expense' as const,
            title: e.description && e.description.trim() ? e.description : `مصروف: ${catLabel}`,
            amountPiasters: e.amount,
            date: e.date,
            partyName: catLabel,
          };
        }),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 7);

      // Build 6 months data
      const monthlyData: MonthlyCashflowPoint[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
        const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const mEnd = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}-01`;

        const [pRows, eRows] = await Promise.all([
          driver.query<{ total: number }>(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'active' AND date >= ? AND date < ?;`,
            [mStart, mEnd]
          ),
          driver.query<{ total: number }>(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= ? AND date < ?;`,
            [mStart, mEnd]
          ),
        ]);

        monthlyData.push({
          monthLabel: d.toLocaleDateString('ar-EG', { month: 'short' }),
          collectionsPiasters: Number(pRows[0]?.total ?? 0),
          expensesPiasters: Number(eRows[0]?.total ?? 0),
        });
      }

      setMetrics({
        activePlansValuePiasters: activePlansVal,
        monthCollectionsPiasters: monthCollections,
        remainingAmountPiasters: overdueVal,
        overdueAmountPiasters: overdueVal,
        overdueCount: Number(overdueRes[0]?.count ?? 0),
        monthExpensesPiasters: monthExpenses,
        netCashFlowPiasters: netCashFlow,
        activeClientsCount: Number(clientsCountRes[0]?.total ?? 0),
        activePlansCount: Number(soldPlansActiveRes[0]?.count ?? 0),
        todayBookingsCount: Number(todayBookingsRes[0]?.total ?? 0),
        todayBookingsMinutes: Number(todayBookingsRes[0]?.total_minutes ?? 0),
        reelsInProgressCount: Number(reelsInProgressRes[0]?.total ?? 0),
        reelsOverdueCount: overdueReelsRes.length,
        expiringPlans: expiringPlansRes.map((p) => ({
          id: p.id,
          clientName: p.clientName,
          nameSnapshot: p.name_snapshot,
          endDate: p.end_date,
          totalPiasters: p.total_snapshot,
        })),
        overdueReels: overdueReelsRes.map((r) => ({
          id: r.id,
          title: r.title,
          clientName: r.clientName,
          targetDate: r.target_date,
          status: r.status,
        })),
        recentActivities: activities,
        monthlyCashflow: monthlyData,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (isLoading) {
    return (
      <div className="space-y-6" dir="rtl">
        <div className="h-24 bg-white rounded-[2rem] border border-[#E5E5E5] animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} hasHeader />
          <SkeletonCard rows={3} hasHeader />
        </div>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div dir="rtl">
        <ActionableError
          title="تعذر تحميل مؤشرات لوحة التحكم"
          message={error?.message ?? 'حدث خطأ غير متوقع'}
          error={error}
          onRetry={() => void loadData()}
        />
      </div>
    );
  }

  // Max value for cashflow chart
  const maxCashflow = Math.max(
    1,
    ...metrics.monthlyCashflow.map((p) => Math.max(p.collectionsPiasters, p.expensesPiasters))
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Welcome Header */}
      <header className="rounded-[2rem] border border-[#E5E5E5] bg-white p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1A1A1A]">
            لوحة التحكم التشغيلية والمالية
          </h1>
          <p className="mt-1.5 text-xs text-neutral-500">
            متابعة التدفق النقدي والخطط المباعة وعمليات الاستوديو والريلز في منصة واحدة مباشرة.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => onOpenHeaderForm('form-sold-plan')}
            variant="brand"
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>بيع خطة جديدة</span>
          </Button>
          <Button
            onClick={() => onOpenHeaderForm('form-payment')}
            variant="secondary"
            className="flex items-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            <span>تسجيل دفعة</span>
          </Button>
        </div>
      </header>

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Month Collections */}
        <Card
          onClick={() => onNavigate('finance')}
          className="cursor-pointer hover:border-emerald-300 transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold mb-2">
            <span>مقبوضات الشهر</span>
            <span className="p-2 rounded-full bg-emerald-50 text-emerald-600">
              <TrendingUp className="w-4 h-4" />
            </span>
          </div>
          <div>
            <BdiCurrency piasters={metrics.monthCollectionsPiasters} className="text-2xl font-bold text-[#1A1A1A]" />
          </div>
          <div className="mt-3 text-[11px] text-emerald-600 font-medium flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>دفعات نشطة محصلة هذا الشهر</span>
          </div>
        </Card>

        {/* 2. Month Expenses */}
        <Card
          onClick={() => onNavigate('finance')}
          className="cursor-pointer hover:border-rose-300 transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold mb-2">
            <span>مصروفات الشهر</span>
            <span className="p-2 rounded-full bg-rose-50 text-rose-600">
              <CreditCard className="w-4 h-4" />
            </span>
          </div>
          <div>
            <BdiCurrency piasters={metrics.monthExpensesPiasters} className="text-2xl font-bold text-[#1A1A1A]" />
          </div>
          <div className="mt-3 text-[11px] text-rose-600 font-medium flex items-center gap-1">
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>مصاريف وإيجار وفواتير</span>
          </div>
        </Card>

        {/* 3. Net Cash Flow */}
        <Card
          onClick={() => onNavigate('reports')}
          className="cursor-pointer hover:border-blue-300 transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold mb-2">
            <span>صافي التدفق النقدي</span>
            <span className={`p-2 rounded-full ${metrics.netCashFlowPiasters >= 0 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-600'}`}>
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div>
            <BdiCurrency piasters={metrics.netCashFlowPiasters} className="text-2xl font-bold text-[#1A1A1A]" />
          </div>
          <div className="mt-3 text-[11px] text-neutral-500 font-medium">
            المقبوضات - المصروفات
          </div>
        </Card>

        {/* 4. Overdue Receivables */}
        <Card
          onClick={() => onNavigate('finance')}
          className="cursor-pointer hover:border-rose-300 transition-all flex flex-col justify-between"
        >
          <div className="flex items-center justify-between text-neutral-500 text-xs font-semibold mb-2">
            <span>مستحقات متأخرة</span>
            <span className="p-2 rounded-full bg-rose-50 text-rose-600">
              <AlertCircle className="w-4 h-4" />
            </span>
          </div>
          <div>
            <BdiCurrency piasters={metrics.overdueAmountPiasters} className="text-2xl font-bold text-rose-600" />
          </div>
          <div className="mt-3 text-[11px] text-rose-600 font-semibold">
            {metrics.overdueCount} مستحق يحتاج متابعة
          </div>
        </Card>
      </div>

      {/* Operational Counter Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => onNavigate('clients')}
          className="flex items-center gap-3 bg-white border border-[#E5E5E5] rounded-2xl p-4 hover:border-blue-300 text-right transition-all shadow-sm cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-lg font-bold text-[#1A1A1A]">{metrics.activeClientsCount}</span>
            <span className="block text-xs text-neutral-500">العملاء النشطون</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate('packages')}
          className="flex items-center gap-3 bg-white border border-[#E5E5E5] rounded-2xl p-4 hover:border-purple-300 text-right transition-all shadow-sm cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-lg font-bold text-[#1A1A1A]">{metrics.activePlansCount}</span>
            <span className="block text-xs text-neutral-500">الخطط النشطة</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate('reels')}
          className="flex items-center gap-3 bg-white border border-[#E5E5E5] rounded-2xl p-4 hover:border-pink-300 text-right transition-all shadow-sm cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-pink-50 text-pink-600 flex items-center justify-center shrink-0">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-lg font-bold text-[#1A1A1A]">{metrics.reelsInProgressCount}</span>
            <span className="block text-xs text-neutral-500">ريلز قيد الإنتاج</span>
          </div>
        </button>

        <button
          onClick={() => onNavigate('studio')}
          className="flex items-center gap-3 bg-white border border-[#E5E5E5] rounded-2xl p-4 hover:border-sky-300 text-right transition-all shadow-sm cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="block text-lg font-bold text-[#1A1A1A]">{metrics.todayBookingsCount} جلسة</span>
            <span className="block text-xs text-neutral-500">الاستوديو اليوم</span>
          </div>
        </button>
      </div>

      {/* Interactive Monthly Cash Flow Chart */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-[#1A1A1A]">التدفق النقدي خلال آخر 6 أشهر</h3>
            <p className="text-xs text-neutral-400 mt-0.5">مقارنة المقبوضات (أخضر) بالمصروفات (أحمر)</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-emerald-600">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span>مقبوضات</span>
            </span>
            <span className="flex items-center gap-1.5 text-rose-500">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span>مصروفات</span>
            </span>
          </div>
        </div>

        {/* Dual Bar Chart */}
        <div className="grid grid-cols-6 gap-2 pt-4 items-end min-h-[160px]">
          {metrics.monthlyCashflow.map((m, idx) => {
            const colHeight = Math.max(8, Math.round((m.collectionsPiasters / maxCashflow) * 120));
            const expHeight = Math.max(8, Math.round((m.expensesPiasters / maxCashflow) * 120));

            return (
              <div key={idx} className="flex flex-col items-center gap-2">
                <div className="w-full flex items-end justify-center gap-1.5 h-[120px]">
                  <div
                    title={`مقبوضات: ${(m.collectionsPiasters / 100).toLocaleString('ar-EG')} ج.م`}
                    style={{ height: `${colHeight}px` }}
                    className="w-4 sm:w-6 bg-emerald-500 rounded-t-lg transition-all hover:bg-emerald-600"
                  />
                  <div
                    title={`مصروفات: ${(m.expensesPiasters / 100).toLocaleString('ar-EG')} ج.م`}
                    style={{ height: `${expHeight}px` }}
                    className="w-4 sm:w-6 bg-rose-400 rounded-t-lg transition-all hover:bg-rose-500"
                  />
                </div>
                <span className="text-[11px] font-bold text-neutral-600">{m.monthLabel}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Two Column Grid: Expiring Plans & Overdue Reels vs Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alerts Column */}
        <div className="space-y-4">
          {/* Expiring Plans Soon */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <span className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-purple-600" />
                <span>خطط تنتهي خلال 14 يوماً</span>
              </span>
              <button
                onClick={() => onNavigate('packages')}
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                عرض الخطط
              </button>
            </div>

            {metrics.expiringPlans.length === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-400">
                لا توجد خطط تنتهي قريباً
              </div>
            ) : (
              <div className="space-y-2">
                {metrics.expiringPlans.map((p) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl border border-neutral-100 flex items-center justify-between hover:bg-neutral-50 transition-colors"
                  >
                    <div>
                      <span className="block text-xs font-bold text-[#1A1A1A]">{p.clientName}</span>
                      <span className="block text-[11px] text-neutral-400">{p.nameSnapshot}</span>
                    </div>
                    <div className="text-left">
                      <span className="text-[11px] font-semibold text-amber-600 block">
                        ينتهي: <BdiDate value={p.endDate} />
                      </span>
                      <BdiCurrency piasters={p.totalPiasters} className="text-xs font-bold text-neutral-700" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Overdue Reels */}
          <Card className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <span className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5">
                <Film className="w-4 h-4 text-pink-600" />
                <span>ريلز متأخرة عن موعدها المحدد</span>
              </span>
              <button
                onClick={() => onNavigate('reels')}
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                لوحة الريلز
              </button>
            </div>

            {metrics.overdueReels.length === 0 ? (
              <div className="py-6 text-center text-xs text-emerald-600 font-medium">
                جميع الريلز يتم تسليمها في مواعيدها المحددة!
              </div>
            ) : (
              <div className="space-y-2">
                {metrics.overdueReels.map((r) => (
                  <div
                    key={r.id}
                    className="p-2.5 rounded-xl border border-rose-100 bg-rose-50/40 flex items-center justify-between"
                  >
                    <div>
                      <span className="block text-xs font-bold text-[#1A1A1A]">{r.title}</span>
                      <span className="block text-[11px] text-neutral-500">{r.clientName}</span>
                    </div>
                    <div className="text-left">
                      <span className="text-[11px] font-bold text-rose-600 block">
                        المستهدف: <BdiDate value={r.targetDate} />
                      </span>
                      <span className="text-[10px] text-neutral-400 font-semibold">مرحلة: {r.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Recent Transactions Column */}
        <div>
          <Card className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
              <span className="text-xs font-bold text-[#1A1A1A] flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>آخر الحركات المالية (دفعات ومصروفات)</span>
              </span>
              <button
                onClick={() => onNavigate('finance')}
                className="text-xs text-blue-600 font-semibold hover:underline"
              >
                سجل المالية
              </button>
            </div>

            {metrics.recentActivities.length === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-400">
                لا توجد حركات مالية مسجلة بعد
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {metrics.recentActivities.map((act) => (
                  <div key={act.id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          act.type === 'payment'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        {act.type === 'payment' ? '+' : '-'}
                      </span>
                      <div>
                        <span className="block text-xs font-bold text-[#1A1A1A]">{act.title}</span>
                        <span className="block text-[10px] text-neutral-400">
                          <BdiDate value={act.date} />
                        </span>
                      </div>
                    </div>
                    <div className="text-left">
                      <BdiCurrency
                        piasters={act.amountPiasters}
                        className={`text-xs font-bold ${
                          act.type === 'payment' ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
