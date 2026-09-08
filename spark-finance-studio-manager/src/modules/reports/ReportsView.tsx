import React, { useCallback, useEffect, useState } from 'react';
import { getDatabaseDriver } from '../../database/driver';
import { Card } from '../../ui/athredu/Card';
import { Button } from '../../ui/athredu/Button';
import { Select } from '../../ui/athredu/Select';
import { BdiCurrency, BdiDate } from '../../ui/bdi';
import { ActionableError, SkeletonCard } from '../../ui/feedback';
import { exportToCsv } from '../../utils/csv-exporter';
import {
  BarChart3,
  Download,
  TrendingUp,
  CreditCard,
  AlertCircle,
  Clock,
  Film,
  Boxes,
  Users,
  Calendar,
} from 'lucide-react';

type ReportTab =
  | 'overview'
  | 'collections'
  | 'expenses'
  | 'receivables'
  | 'revenue_client'
  | 'revenue_service'
  | 'plans_status'
  | 'entitlements'
  | 'reels_production'
  | 'inactive_clients';

type TimeRange = 'this_month' | 'last_3_months' | 'this_year' | 'all';

interface FinancialOverview {
  totalCollections: number;
  totalExpenses: number;
  netCashFlow: number;
  totalOverdue: number;
}

interface MonthRow {
  month: string;
  collections: number;
  count: number;
}

interface ExpenseCatRow {
  category: string;
  total: number;
  count: number;
}

interface ReceivableRow {
  id: string;
  clientName: string;
  name: string;
  dueDate: string;
  amount: number;
  status: string;
}

interface ClientRevenueRow {
  clientId: string;
  clientName: string;
  companyName: string | null;
  totalPaid: number;
  paymentsCount: number;
}

interface ServiceRevenueRow {
  name: string;
  billingMethod: string;
  soldCount: number;
  totalRevenue: number;
}

interface PlanStatusRow {
  id: string;
  clientName: string;
  name: string;
  startDate: string;
  endDate: string | null;
  serviceStatus: string;
  collectionStatus: string;
  totalPiasters: number;
}

interface EntitlementUsageRow {
  id: string;
  clientName: string;
  planName: string;
  entitlementName: string;
  unit: string;
  initialQty: number;
  usedQty: number;
  remainingQty: number;
  usagePercent: number;
}

interface ReelProductionRow {
  id: string;
  clientName: string;
  title: string;
  status: string;
  targetDate: string | null;
  deliveredDate: string | null;
}

interface InactiveClientRow {
  id: string;
  name: string;
  companyName: string | null;
  phone: string | null;
  lastPaymentDate: string | null;
  daysSinceLastActivity: number;
}

export const ReportsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('this_month');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Report States
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [monthlyCollections, setMonthlyCollections] = useState<MonthRow[]>([]);
  const [expensesByCategory, setExpensesByCategory] = useState<ExpenseCatRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [clientRevenues, setClientRevenues] = useState<ClientRevenueRow[]>([]);
  const [serviceRevenues, setServiceRevenues] = useState<ServiceRevenueRow[]>([]);
  const [plansStatuses, setPlansStatuses] = useState<PlanStatusRow[]>([]);
  const [entitlementsUsage, setEntitlementsUsage] = useState<EntitlementUsageRow[]>([]);
  const [reelsProduction, setReelsProduction] = useState<ReelProductionRow[]>([]);
  const [inactiveClients, setInactiveClients] = useState<InactiveClientRow[]>([]);

  const getDateFilter = (range: TimeRange): string => {
    const now = new Date();
    if (range === 'this_month') {
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    if (range === 'last_3_months') {
      const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    }
    if (range === 'this_year') {
      return `${now.getFullYear()}-01-01`;
    }
    return '1970-01-01';
  };

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const startDate = getDateFilter(timeRange);

      const [
        paymentsSum,
        expensesSum,
        duesSum,
        monthsData,
        expCatData,
        overdueList,
        clientRevData,
        plansData,
        entitlementsData,
        reelsData,
        clientsData,
      ] = await Promise.all([
        // 1. Collections sum
        driver.query<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'active' AND date >= ?;`,
          [startDate]
        ),
        // 2. Expenses sum
        driver.query<{ total: number }>(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE date >= ?;`,
          [startDate]
        ),
        // 3. Overdue sum
        driver.query<{ total: number }>(`
          SELECT COALESCE(SUM(d.base_amount - COALESCE((
            SELECT SUM(pa.amount) FROM payment_allocations pa
            JOIN payments p ON p.id = pa.payment_id
            WHERE pa.target_type = 'marketing_due' AND pa.target_id = d.id AND p.status = 'active'
          ), 0)), 0) AS total
          FROM marketing_monthly_dues d
          WHERE d.status IN ('due', 'partial', 'overdue');
        `),
        // 4. Collections by month
        driver.query<{ month: string; total: number; count: number }>(`
          SELECT strftime('%Y-%m', date) AS month, SUM(amount) AS total, COUNT(*) AS count
          FROM payments
          WHERE status = 'active' AND date >= ?
          GROUP BY strftime('%Y-%m', date)
          ORDER BY month DESC;
        `, [startDate]),
        // 5. Expenses by category
        driver.query<{ category: string; total: number; count: number }>(`
          SELECT category, SUM(amount) AS total, COUNT(*) AS count
          FROM expenses
          WHERE date >= ?
          GROUP BY category
          ORDER BY total DESC;
        `, [startDate]),
        // 6. Overdue list
        driver.query<{ id: string; clientName: string; name: string; dueDate: string; amount: number; status: string }>(`
          SELECT d.id, c.name AS clientName, 'مستحق تسويق شهري' AS name, d.month || '-' || d.year AS dueDate, d.base_amount AS amount, d.status
          FROM marketing_monthly_dues d
          JOIN clients c ON d.client_id = c.id
          WHERE d.status IN ('due', 'partial', 'overdue')
          ORDER BY d.year DESC, d.month DESC LIMIT 30;
        `),
        // 7. Client revenues
        driver.query<{ clientId: string; clientName: string; companyName: string | null; totalPaid: number; paymentsCount: number }>(`
          SELECT c.id AS clientId, c.name AS clientName, c.company_name AS companyName,
                 COALESCE(SUM(p.amount), 0) AS totalPaid, COUNT(p.id) AS paymentsCount
          FROM clients c
          JOIN payments p ON p.client_id = c.id
          WHERE p.status = 'active' AND p.date >= ?
          GROUP BY c.id
          ORDER BY totalPaid DESC;
        `, [startDate]),
        // 8. Sold Plans
        driver.query<{ id: string; clientName: string; name: string; startDate: string; endDate: string | null; serviceStatus: string; collectionStatus: string; totalPiasters: number; billingMethod: string }>(`
          SELECT sp.id, c.name AS clientName, sp.name_snapshot AS name, sp.start_date AS startDate,
                 sp.end_date AS endDate, sp.service_status AS serviceStatus, sp.collection_status AS collectionStatus,
                 sp.total_snapshot AS totalPiasters, sp.billing_method AS billingMethod
          FROM sold_plans sp
          JOIN clients c ON sp.client_id = c.id
          ORDER BY sp.created_at DESC;
        `),
        // 9. Entitlements usage
        driver.query<{ id: string; clientName: string; planName: string; entitlementName: string; unit: string; initialQty: number; usedQty: number; remainingQty: number }>(`
          SELECT spe.id, c.name AS clientName, sp.name_snapshot AS planName,
                 spe.entitlement_name AS entitlementName, spe.unit,
                 spe.quantity_initial AS initialQty, spe.quantity_used AS usedQty,
                 spe.quantity_remaining AS remainingQty
          FROM sold_plan_entitlements spe
          JOIN sold_plans sp ON spe.sold_plan_id = sp.id
          JOIN clients c ON sp.client_id = c.id
          ORDER BY sp.created_at DESC;
        `),
        // 10. Reels production
        driver.query<{ id: string; clientName: string; title: string; status: string; targetDate: string | null; deliveredDate: string | null }>(`
          SELECT r.id, c.name AS clientName, r.title, r.status, r.target_date AS targetDate, r.delivered_date AS deliveredDate
          FROM reel_items r
          JOIN clients c ON r.client_id = c.id
          ORDER BY r.created_at DESC;
        `),
        // 11. Inactive clients (all clients with their last payment)
        driver.query<{ id: string; name: string; companyName: string | null; phone: string | null; lastPaymentDate: string | null }>(`
          SELECT c.id, c.name, c.company_name AS companyName, c.phone,
                 (SELECT MAX(date) FROM payments WHERE client_id = c.id AND status = 'active') AS lastPaymentDate
          FROM clients c
          WHERE c.active = 1;
        `),
      ]);

      const collTotal = Number(paymentsSum[0]?.total ?? 0);
      const expTotal = Number(expensesSum[0]?.total ?? 0);
      const overdueTotal = Number(duesSum[0]?.total ?? 0);

      setOverview({
        totalCollections: collTotal,
        totalExpenses: expTotal,
        netCashFlow: collTotal - expTotal,
        totalOverdue: overdueTotal,
      });

      setMonthlyCollections(monthsData.map((m) => ({ month: m.month, collections: Number(m.total), count: Number(m.count) })));
      setExpensesByCategory(expCatData.map((e) => ({ category: e.category, total: Number(e.total), count: Number(e.count) })));
      setReceivables(overdueList.map((r) => ({ ...r, amount: Number(r.amount) })));
      setClientRevenues(clientRevData.map((cr) => ({ ...cr, totalPaid: Number(cr.totalPaid), paymentsCount: Number(cr.paymentsCount) })));

      setPlansStatuses(plansData.map((p) => ({
        id: p.id,
        clientName: p.clientName,
        name: p.name,
        startDate: p.startDate,
        endDate: p.endDate,
        serviceStatus: p.serviceStatus,
        collectionStatus: p.collectionStatus,
        totalPiasters: Number(p.totalPiasters),
      })));

      // Calculate service revenue summary from sold plans
      const srvMap = new Map<string, { count: number; total: number; billingMethod: string }>();
      for (const p of plansData) {
        const existing = srvMap.get(p.name) || { count: 0, total: 0, billingMethod: p.billingMethod };
        existing.count += 1;
        existing.total += Number(p.totalPiasters);
        srvMap.set(p.name, existing);
      }
      const srvRows: ServiceRevenueRow[] = Array.from(srvMap.entries()).map(([name, data]) => ({
        name,
        billingMethod: data.billingMethod,
        soldCount: data.count,
        totalRevenue: data.total,
      })).sort((a, b) => b.totalRevenue - a.totalRevenue);
      setServiceRevenues(srvRows);

      setEntitlementsUsage(entitlementsData.map((e) => {
        const init = Number(e.initialQty) || 1;
        const used = Number(e.usedQty) || 0;
        const percent = Math.min(100, Math.round((used / init) * 100));
        return {
          id: e.id,
          clientName: e.clientName,
          planName: e.planName,
          entitlementName: e.entitlementName,
          unit: e.unit,
          initialQty: init,
          usedQty: used,
          remainingQty: Number(e.remainingQty),
          usagePercent: percent,
        };
      }));

      setReelsProduction(reelsData);

      // Filter inactive clients (last payment > 60 days or null)
      const nowMs = Date.now();
      const inactives: InactiveClientRow[] = clientsData.map((c) => {
        let days = 999;
        if (c.lastPaymentDate) {
          const pMs = new Date(c.lastPaymentDate).getTime();
          days = Math.floor((nowMs - pMs) / (1000 * 60 * 60 * 24));
        }
        return {
          id: c.id,
          name: c.name,
          companyName: c.companyName,
          phone: c.phone,
          lastPaymentDate: c.lastPaymentDate,
          daysSinceLastActivity: days,
        };
      }).filter((c) => c.daysSinceLastActivity >= 60).sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity);

      setInactiveClients(inactives);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Export current active view to CSV
  const handleExportCsv = () => {
    switch (activeTab) {
      case 'overview':
      case 'collections':
        exportToCsv(
          `تقرير_المقبوضات_${timeRange}`,
          ['الشهر', 'إجمالي المقبوضات (ج.م)', 'عدد الدفعات'],
          monthlyCollections.map((m) => [m.month, m.collections / 100, m.count])
        );
        break;
      case 'expenses':
        exportToCsv(
          `تقرير_المصروفات_${timeRange}`,
          ['التصنيف', 'إجمالي المصروف (ج.م)', 'عدد الفواتير'],
          expensesByCategory.map((e) => [e.category, e.total / 100, e.count])
        );
        break;
      case 'receivables':
        exportToCsv(
          `تقرير_المستحقات_والمتأخرات`,
          ['العميل', 'بيان المستحق', 'تاريخ الاستحقاق', 'المبلغ (ج.م)', 'الحالة'],
          receivables.map((r) => [r.clientName, r.name, r.dueDate, r.amount / 100, r.status])
        );
        break;
      case 'revenue_client':
        exportToCsv(
          `تقرير_الإيرادات_حسب_العميل`,
          ['اسم العميل', 'الشركة', 'إجمالي المدفوع (ج.م)', 'عدد الدفعات'],
          clientRevenues.map((c) => [c.clientName, c.companyName || '-', c.totalPaid / 100, c.paymentsCount])
        );
        break;
      case 'revenue_service':
        exportToCsv(
          `تقرير_الإيرادات_حسب_الخدمة`,
          ['اسم الخدمة أو الخطة', 'طريقة الفوترة', 'عدد مرات البيع', 'إجمالي الإيراد (ج.م)'],
          serviceRevenues.map((s) => [s.name, s.billingMethod, s.soldCount, s.totalRevenue / 100])
        );
        break;
      case 'plans_status':
        exportToCsv(
          `تقرير_حالات_الخطط_المباعة`,
          ['العميل', 'اسم الخطة', 'تاريخ البدء', 'تاريخ الانتهاء', 'حالة الخدمة', 'حالة التحصيل', 'إجمالي القيمة (ج.م)'],
          plansStatuses.map((p) => [p.clientName, p.name, p.startDate, p.endDate || '-', p.serviceStatus, p.collectionStatus, p.totalPiasters / 100])
        );
        break;
      case 'entitlements':
        exportToCsv(
          `تقرير_استخدام_أرصدة_الخطط`,
          ['العميل', 'الخطة', 'بند الاستحقاق', 'الكمية المبدئية', 'المستهلك', 'المتبقي', 'نسبة الاستهلاك %'],
          entitlementsUsage.map((e) => [e.clientName, e.planName, `${e.entitlementName} (${e.unit})`, e.initialQty, e.usedQty, e.remainingQty, `${e.usagePercent}%`])
        );
        break;
      case 'reels_production':
        exportToCsv(
          `تقرير_إنتاج_الريلز`,
          ['العميل', 'عنوان الريل', 'المرحلة', 'الموعد المستهدف', 'تاريخ التسليم'],
          reelsProduction.map((r) => [r.clientName, r.title, r.status, r.targetDate || '-', r.deliveredDate || '-'])
        );
        break;
      case 'inactive_clients':
        exportToCsv(
          `تقرير_العملاء_بلا_نشاط`,
          ['العميل', 'الشركة', 'الهاتف', 'تاريخ آخر دفعة', 'أيام الانقطاع'],
          inactiveClients.map((c) => [c.name, c.companyName || '-', c.phone || '-', c.lastPaymentDate || 'لا توجد دفعات', c.daysSinceLastActivity])
        );
        break;
    }
  };

  const tabs: Array<{ id: ReportTab; label: string; icon: React.ElementType }> = [
    { id: 'overview', label: 'الملخص المالي', icon: BarChart3 },
    { id: 'collections', label: 'المقبوضات الشهرية', icon: TrendingUp },
    { id: 'expenses', label: 'المصروفات والتصنيفات', icon: CreditCard },
    { id: 'receivables', label: 'المستحقات والمتأخرات', icon: AlertCircle },
    { id: 'revenue_client', label: 'الإيراد حسب العميل', icon: Users },
    { id: 'revenue_service', label: 'الإيراد حسب الخدمة', icon: Boxes },
    { id: 'plans_status', label: 'الخطط المباعة', icon: Calendar },
    { id: 'entitlements', label: 'أرصدة الاستحقاقات', icon: Clock },
    { id: 'reels_production', label: 'إنتاج الريلز', icon: Film },
    { id: 'inactive_clients', label: 'عملاء بلا نشاط', icon: AlertCircle },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <header className="rounded-[2rem] border border-[#E5E5E5] bg-white p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#1A1A1A]">
            التقارير التحليلية والمالية
          </h1>
          <p className="mt-1 text-xs text-neutral-500">
            كشوفات الحساب، المقبوضات، استهلاك الباقات، وإنتاجية الريلز مع التصدير المباشر لملفات إكسل.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Select
            value={timeRange}
            onValueChange={(val) => setTimeRange(val as TimeRange)}
            options={[
              { value: 'this_month', label: 'الشهر الحالي' },
              { value: 'last_3_months', label: 'آخر 3 أشهر' },
              { value: 'this_year', label: 'هذا العام' },
              { value: 'all', label: 'جميع الفترات' },
            ]}
          />
          <Button
            onClick={handleExportCsv}
            variant="secondary"
            className="flex items-center gap-2 whitespace-nowrap shrink-0"
            disabled={isLoading}
          >
            <Download className="w-4 h-4 text-neutral-600" />
            <span>تصدير إكسل</span>
          </Button>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-[#004AC6] text-white shadow-sm'
                  : 'bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content Rendering */}
      {isLoading ? (
        <div className="p-6 space-y-4">
          <SkeletonCard rows={4} hasHeader />
          <SkeletonCard rows={3} />
        </div>
      ) : error ? (
        <ActionableError
          title="تعذر تحميل التقرير"
          message={error.message}
          error={error}
          onRetry={() => void loadData()}
        />
      ) : activeTab === 'overview' ? (
        /* 1. FINANCIAL OVERVIEW */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="space-y-2">
              <span className="text-xs text-neutral-400 font-medium">إجمالي المقبوضات</span>
              <div className="text-2xl font-bold text-emerald-600">
                <BdiCurrency piasters={overview?.totalCollections ?? 0} />
              </div>
              <span className="text-[11px] text-neutral-500">حسب الفترة المحددة</span>
            </Card>

            <Card className="space-y-2">
              <span className="text-xs text-neutral-400 font-medium">إجمالي المصروفات</span>
              <div className="text-2xl font-bold text-rose-600">
                <BdiCurrency piasters={overview?.totalExpenses ?? 0} />
              </div>
              <span className="text-[11px] text-neutral-500">فواتير ومصاريف تشغيل</span>
            </Card>

            <Card className="space-y-2">
              <span className="text-xs text-neutral-400 font-medium">صافي التدفق النقدي</span>
              <div className="text-2xl font-bold text-[#1A1A1A]">
                <BdiCurrency piasters={overview?.netCashFlow ?? 0} />
              </div>
              <span className="text-[11px] text-neutral-500">المقبوضات - المصروفات</span>
            </Card>

            <Card className="space-y-2">
              <span className="text-xs text-neutral-400 font-medium">المستحقات المتأخرة</span>
              <div className="text-2xl font-bold text-red-600">
                <BdiCurrency piasters={overview?.totalOverdue ?? 0} />
              </div>
              <span className="text-[11px] text-red-500 font-semibold">مبالغ قيد المتابعة</span>
            </Card>
          </div>

          <Card className="space-y-4">
            <h3 className="text-sm font-bold text-[#1A1A1A]">المقبوضات الشهرية المؤكدة</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                  <tr>
                    <th className="px-4 py-3">الشهر</th>
                    <th className="px-4 py-3">إجمالي المقبوضات</th>
                    <th className="px-4 py-3">عدد العمليات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {monthlyCollections.map((m) => (
                    <tr key={m.month} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-bold text-[#1A1A1A]">{m.month}</td>
                      <td className="px-4 py-3 font-semibold text-emerald-600">
                        <BdiCurrency piasters={m.collections} />
                      </td>
                      <td className="px-4 py-3 text-neutral-500">{m.count} دفعة</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : activeTab === 'collections' ? (
        /* 2. COLLECTIONS */
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A]">تقرير المقبوضات حسب الشهر</h3>
            <span className="text-xs text-neutral-500">{monthlyCollections.length} شهر مسجل</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <tr>
                  <th className="px-4 py-3">الشهر</th>
                  <th className="px-4 py-3">المبلغ المحصل</th>
                  <th className="px-4 py-3">عدد الدفعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {monthlyCollections.map((m) => (
                  <tr key={m.month} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-bold text-[#1A1A1A]">{m.month}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-600">
                      <BdiCurrency piasters={m.collections} />
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{m.count} دفعة</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'expenses' ? (
        /* 3. EXPENSES BY CATEGORY */
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A]">تقرير المصروفات حسب التصنيف</h3>
            <span className="text-xs text-neutral-500">{expensesByCategory.length} تصنيف</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <tr>
                  <th className="px-4 py-3">التصنيف</th>
                  <th className="px-4 py-3">إجمالي المصروفات</th>
                  <th className="px-4 py-3">عدد السجلات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {expensesByCategory.map((e) => (
                  <tr key={e.category} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-bold text-[#1A1A1A]">{e.category}</td>
                    <td className="px-4 py-3 font-semibold text-rose-600">
                      <BdiCurrency piasters={e.total} />
                    </td>
                    <td className="px-4 py-3 text-neutral-500">{e.count} مصروف</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'receivables' ? (
        /* 4. OVERDUE RECEIVABLES */
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A]">المستحقات والمتأخرات غير المحصلة</h3>
            <span className="text-xs text-rose-600 font-semibold">{receivables.length} مطالبة متأخرة</span>
          </div>
          {receivables.length === 0 ? (
            <div className="py-8 text-center text-xs text-emerald-600 font-bold">
              لا توجد أي مبالغ متأخرة! جميع المطالبات مسددة بالكامل.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                  <tr>
                    <th className="px-4 py-3">العميل</th>
                    <th className="px-4 py-3">البيان</th>
                    <th className="px-4 py-3">فترة الاستحقاق</th>
                    <th className="px-4 py-3">المبلغ المستحق</th>
                    <th className="px-4 py-3">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {receivables.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-bold text-[#1A1A1A]">{r.clientName}</td>
                      <td className="px-4 py-3 text-neutral-600">{r.name}</td>
                      <td className="px-4 py-3 text-neutral-500">{r.dueDate}</td>
                      <td className="px-4 py-3 font-bold text-rose-600">
                        <BdiCurrency piasters={r.amount} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : activeTab === 'revenue_client' ? (
        /* 5. REVENUE BY CLIENT */
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A]">الإيرادات حسب العميل</h3>
            <span className="text-xs text-neutral-500">{clientRevenues.length} عميل</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <tr>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">الشركة</th>
                  <th className="px-4 py-3">إجمالي المسدد</th>
                  <th className="px-4 py-3">عدد الدفعات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {clientRevenues.map((c) => (
                  <tr key={c.clientId} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-bold text-[#1A1A1A]">{c.clientName}</td>
                    <td className="px-4 py-3 text-neutral-500">{c.companyName || '-'}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">
                      <BdiCurrency piasters={c.totalPaid} />
                    </td>
                    <td className="px-4 py-3 text-neutral-600">{c.paymentsCount} دفعة</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'revenue_service' ? (
        /* 6. REVENUE BY SERVICE */
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A]">الإيرادات حسب الخدمة وقوالب الخطط</h3>
            <span className="text-xs text-neutral-500">{serviceRevenues.length} خدمة</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <tr>
                  <th className="px-4 py-3">الخدمة / الخطة</th>
                  <th className="px-4 py-3">طريقة الفوترة</th>
                  <th className="px-4 py-3">عدد مرات البيع</th>
                  <th className="px-4 py-3">إجمالي الإيرادات التعاقدية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {serviceRevenues.map((s) => (
                  <tr key={s.name} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-bold text-[#1A1A1A]">{s.name}</td>
                    <td className="px-4 py-3 text-neutral-500">{s.billingMethod}</td>
                    <td className="px-4 py-3 font-semibold text-neutral-700">{s.soldCount}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">
                      <BdiCurrency piasters={s.totalRevenue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'plans_status' ? (
        /* 7. PLANS STATUS */
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A]">الخطط المباعة وحالاتها</h3>
            <span className="text-xs text-neutral-500">{plansStatuses.length} خطة</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <tr>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">اسم الخطة</th>
                  <th className="px-4 py-3">تاريخ البدء</th>
                  <th className="px-4 py-3">تاريخ الانتهاء</th>
                  <th className="px-4 py-3">حالة الخدمة</th>
                  <th className="px-4 py-3">حالة التحصيل</th>
                  <th className="px-4 py-3">القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {plansStatuses.map((p) => (
                  <tr key={p.id} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-bold text-[#1A1A1A]">{p.clientName}</td>
                    <td className="px-4 py-3 font-semibold text-neutral-700">{p.name}</td>
                    <td className="px-4 py-3 text-neutral-500"><BdiDate value={p.startDate} /></td>
                    <td className="px-4 py-3 text-neutral-500">{p.endDate ? <BdiDate value={p.endDate} /> : 'مفتوح'}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {p.serviceStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                        {p.collectionStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-bold text-[#1A1A1A]">
                      <BdiCurrency piasters={p.totalPiasters} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'entitlements' ? (
        /* 8. ENTITLEMENTS USAGE */
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A]">استهلاك أرصدة واستحقاقات الخطط</h3>
            <span className="text-xs text-neutral-500">{entitlementsUsage.length} بند استحقاق</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <tr>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">الخطة</th>
                  <th className="px-4 py-3">البند</th>
                  <th className="px-4 py-3">الرصيد الأصلي</th>
                  <th className="px-4 py-3">المستهلك</th>
                  <th className="px-4 py-3">المتبقي</th>
                  <th className="px-4 py-3">نسبة الاستهلاك</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {entitlementsUsage.map((e) => (
                  <tr key={e.id} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-bold text-[#1A1A1A]">{e.clientName}</td>
                    <td className="px-4 py-3 text-neutral-600">{e.planName}</td>
                    <td className="px-4 py-3 font-semibold text-neutral-700">{e.entitlementName}</td>
                    <td className="px-4 py-3 text-neutral-500">{e.initialQty} {e.unit}</td>
                    <td className="px-4 py-3 font-bold text-amber-600">{e.usedQty} {e.unit}</td>
                    <td className="px-4 py-3 font-bold text-emerald-600">{e.remainingQty} {e.unit}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-neutral-200 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${e.usagePercent}%` }}
                            className={`h-full ${e.usagePercent >= 80 ? 'bg-rose-500' : 'bg-[#004AC6]'}`}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-neutral-600">{e.usagePercent}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : activeTab === 'reels_production' ? (
        /* 9. REELS PRODUCTION */
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A]">تقرير إنتاج الريلز</h3>
            <span className="text-xs text-neutral-500">{reelsProduction.length} فيديو ريلز</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                <tr>
                  <th className="px-4 py-3">العميل</th>
                  <th className="px-4 py-3">عنوان الريل</th>
                  <th className="px-4 py-3">المرحلة الحالية</th>
                  <th className="px-4 py-3">الموعد المستهدف</th>
                  <th className="px-4 py-3">تاريخ التسليم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {reelsProduction.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/50">
                    <td className="px-4 py-3 font-bold text-[#1A1A1A]">{r.clientName}</td>
                    <td className="px-4 py-3 font-semibold text-neutral-700">{r.title}</td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-700">
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {r.targetDate ? <BdiDate value={r.targetDate} /> : '-'}
                    </td>
                    <td className="px-4 py-3 text-emerald-600 font-semibold">
                      {r.deliveredDate ? <BdiDate value={r.deliveredDate} /> : 'قيد الإنتاج'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        /* 10. INACTIVE CLIENTS */
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#1A1A1A]">العملاء بدون نشاط أو دفعات حديثة (أكثر من 60 يوماً)</h3>
            <span className="text-xs text-amber-600 font-semibold">{inactiveClients.length} عميل</span>
          </div>
          {inactiveClients.length === 0 ? (
            <div className="py-8 text-center text-xs text-emerald-600 font-bold">
              جميع العملاء نشطون ولديهم حركات مالية خلال الـ 60 يوماً الأخيرة!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-neutral-50 text-neutral-500 border-b border-neutral-100">
                  <tr>
                    <th className="px-4 py-3">العميل</th>
                    <th className="px-4 py-3">الشركة</th>
                    <th className="px-4 py-3">الهاتف</th>
                    <th className="px-4 py-3">تاريخ آخر دفعة</th>
                    <th className="px-4 py-3">مدة الانقطاع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {inactiveClients.map((c) => (
                    <tr key={c.id} className="hover:bg-neutral-50/50">
                      <td className="px-4 py-3 font-bold text-[#1A1A1A]">{c.name}</td>
                      <td className="px-4 py-3 text-neutral-500">{c.companyName || '-'}</td>
                      <td className="px-4 py-3 text-neutral-600">{c.phone || '-'}</td>
                      <td className="px-4 py-3 text-neutral-500">
                        {c.lastPaymentDate ? <BdiDate value={c.lastPaymentDate} /> : 'لا توجد دفعات'}
                      </td>
                      <td className="px-4 py-3 font-bold text-amber-600">
                        {c.daysSinceLastActivity >= 999 ? 'غير نشط إطلاقاً' : `${c.daysSinceLastActivity} يوماً`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
