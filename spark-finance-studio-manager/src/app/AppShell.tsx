import React, { useState, useEffect } from "react";
import { DynamicHeader, HeaderMode } from "./DynamicHeader";
import { QuickAddModal } from "./QuickAddModal";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { PageMotion } from "../ui/athredu/PageMotion";
import { Card } from "../ui/athredu/Card";
import { Button } from "../ui/athredu/Button";
import { BdiCurrency, BdiText } from "../ui/bdi";
import {
  Users,
  CalendarCheck,
  TrendingUp,
  AlertCircle,
  Plus,
  ArrowRight,
  CreditCard,
  Boxes,
} from "lucide-react";
import { ClientList, ClientFormModal } from "../modules/clients";
import {
  FinanceView,
  PaymentEntryModal,
  ExpenseEntryModal,
  PaymentVoidModal,
} from "../modules/finance";
import { ContractsList, ContractFormModal } from "../modules/contracts";
import { PackagesView, ClientPackagePurchaseModal } from "../modules/packages";
import { ReelsKanban, ReelFormModal } from "../modules/reels";
import { StudioView } from "../modules/studio";
import { ReportsView } from "../modules/reports";
import { BackupView } from "../modules/backup/BackupView";
import { ClientRecord, PaymentRecord } from "../database/repositories";
import { getDatabaseDriver } from "../database/driver";
import { NavSection } from "./navigation";

interface DashboardStats {
  monthCollections: number;
  todayBookingsCount: number;
  todayBookingsMinutes: number;
  overdueAmount: number;
  overdueCount: number;
  activeClientsCount: number;
}

export const AppShell: React.FC = () => {
  const [activeSection, setActiveSection] = useState<NavSection>("dashboard");
  const [headerMode, setHeaderMode] = useState<HeaderMode>("compact");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Live Dashboard Stats from SQLite
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState(true);

  // Dynamic Island notification state
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<"success" | "error" | "warning" | "info">("info");

  // Global Quick Add Modal States
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentClientId, setPaymentClientId] = useState<string | null>(null);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [paymentToVoid, setPaymentToVoid] = useState<PaymentRecord | null>(null);
  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
  const [isReelModalOpen, setIsReelModalOpen] = useState(false);

  // Global refresh counter to propagate changes across views
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Global Ctrl+K shortcut toggles dynamic header search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setHeaderMode((prev) => (prev === "search" ? "compact" : "search"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Live Dashboard Stats from SQLite
  useEffect(() => {
    let isMounted = true;
    const loadStats = async () => {
      try {
        setIsStatsLoading(true);
        const driver = await getDatabaseDriver();
        const now = new Date();
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

        const [payments, studio, overdue, clients] = await Promise.all([
          driver.query<{ total: number }>(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'active' AND date >= ?",
            [monthStart]
          ),
          driver.query<{ total: number; total_minutes: number }>(
            "SELECT COUNT(*) AS total, COALESCE(SUM(planned_minutes), 0) AS total_minutes FROM studio_bookings WHERE date = ? AND status NOT IN ('cancelled', 'no_show')",
            [todayStr]
          ),
          driver.query<{ total: number; count: number }>(`
            SELECT COALESCE(SUM(d.base_amount - COALESCE((
              SELECT SUM(pa.amount) FROM payment_allocations pa
              JOIN payments p ON p.id = pa.payment_id
              WHERE pa.target_type = 'marketing_due' AND pa.target_id = d.id AND p.status = 'active'
            ), 0)), 0) AS total,
            COUNT(*) AS count
            FROM marketing_monthly_dues d
            WHERE d.status IN ('due', 'partial', 'overdue')
          `),
          driver.query<{ total: number }>("SELECT COUNT(*) AS total FROM clients WHERE active = 1"),
        ]);

        if (isMounted) {
          setDashboardStats({
            monthCollections: Number(payments[0]?.total ?? 0),
            todayBookingsCount: Number(studio[0]?.total ?? 0),
            todayBookingsMinutes: Number(studio[0]?.total_minutes ?? 0),
            overdueAmount: Number(overdue[0]?.total ?? 0),
            overdueCount: Number(overdue[0]?.count ?? 0),
            activeClientsCount: Number(clients[0]?.total ?? 0),
          });
        }
      } catch {
        // Fallback gracefully
      } finally {
        if (isMounted) setIsStatsLoading(false);
      }
    };

    void loadStats();
    return () => {
      isMounted = false;
    };
  }, [refreshTrigger, activeSection]);

  const showToast = (msg: string, type: "success" | "error" | "warning" | "info" = "info") => {
    setNotificationMessage(msg);
    setNotificationType(type);
    setTimeout(() => {
      setNotificationMessage(null);
    }, 4000);
  };

  const handleQuickAddAction = (actionId: string) => {
    setIsQuickAddOpen(false);
    switch (actionId) {
      case "new-client":
        setHeaderMode("form-client");
        break;
      case "new-payment":
        setHeaderMode("form-payment");
        break;
      case "new-expense":
        setHeaderMode("form-expense");
        break;
      case "new-contract":
        setHeaderMode("form-contract");
        break;
      case "new-subscription":
        setHeaderMode("form-subscription");
        break;
      case "new-website":
        setHeaderMode("form-website");
        break;
      case "new-package":
        setHeaderMode("form-package-buy");
        break;
      case "new-package-template":
        setHeaderMode("form-package-template");
        break;
      case "new-reel":
        setHeaderMode("form-reel");
        break;
      case "new-booking":
        setActiveSection("studio");
        showToast("يمكنك إضافة الحجز واختيار الموعد من جدول الاستوديو", "info");
        break;
      default:
        showToast(`تم اختيار: ${actionId}`, "info");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6] text-[#1A1A1A] flex flex-col selection:bg-blue-100" dir="rtl">
      {/* ATHREDU True DynamicHeader (Morphing Capsule & Dynamic Island) */}
      <DynamicHeader
        activeSection={activeSection}
        onSelectSection={(sec) => setActiveSection(sec)}
        onOpenQuickAddAction={handleQuickAddAction}
        notificationMessage={notificationMessage}
        notificationType={notificationType}
        onDismissNotification={() => setNotificationMessage(null)}
        openMode={headerMode}
        onModeChange={(m) => setHeaderMode(m)}
        onDataMutated={(msg) => {
          setRefreshTrigger((prev) => prev + 1);
          showToast(msg, "success");
        }}
      />

      {/* Main Dynamic View Content with ATHREDU Layout Padding */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-6 pt-24 md:pt-28 pb-20">
        <PageMotion key={activeSection}>
          {/* VIEW: CLIENTS MODULE */}
          {activeSection === "clients" && (
            <ClientList
              key={`clients-${refreshTrigger}`}
              onOpenPaymentModal={(client: ClientRecord) => {
                setPaymentClientId(client.id);
                setHeaderMode("form-payment");
              }}
              onOpenVoidModal={(payment: PaymentRecord) => {
                setPaymentToVoid(payment);
              }}
              onOpenHeaderForm={(formMode) => setHeaderMode(formMode)}
            />
          )}

          {/* VIEW: FINANCE & EXPENSES MODULE */}
          {activeSection === "finance" && (
            <FinanceView
              key={`finance-${refreshTrigger}`}
              onOpenHeaderForm={(formMode) => setHeaderMode(formMode)}
            />
          )}

          {/* VIEW: CONTRACTS & SUBSCRIPTIONS MODULE */}
          {activeSection === "contracts" && (
            <ContractsList
              key={`contracts-${refreshTrigger}`}
              onOpenHeaderForm={(formMode) => setHeaderMode(formMode)}
            />
          )}

          {/* VIEW: PACKAGES & REELS MODULE */}
          {activeSection === "packages" && (
            <PackagesView
              key={`packages-${refreshTrigger}`}
              onOpenHeaderForm={(formMode) => setHeaderMode(formMode)}
              renderReelsKanban={() => (
                <ReelsKanban
                  key={`reels-${refreshTrigger}`}
                  onOpenHeaderForm={(formMode) => setHeaderMode(formMode)}
                />
              )}
            />
          )}

          {/* DIRECT REELS VIEW */}
          {activeSection === "reels" && (
            <ReelsKanban
              key={`reels-direct-${refreshTrigger}`}
              onOpenHeaderForm={(formMode) => setHeaderMode(formMode)}
            />
          )}

          {/* VIEW: STUDIO BOOKINGS */}
          {activeSection === "studio" && (
            <StudioView key={`studio-${refreshTrigger}`} />
          )}

          {/* VIEW: REPORTS & AUDITING */}
          {activeSection === "reports" && (
            <ReportsView key={`reports-${refreshTrigger}`} />
          )}

          {/* VIEW: BACKUP & SETTINGS */}
          {(activeSection === "backup" || activeSection === "settings") && (
            <BackupView onShowToast={showToast} key={`backup-${refreshTrigger}`} />
          )}

          {/* VIEW: DASHBOARD (ATHREDU High-End Clean Console) */}
          {activeSection === "dashboard" && (
            <div className="space-y-6">
              {/* ATHREDU Welcome / Console Header Card */}
              <header className="rounded-[2rem] border border-[#E5E5E5] bg-white p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#1A1A1A]">
                      مرحباً
                    </h1>
                    <p className="mt-2 text-sm text-[#707070]">
                      النظام التشغيلي والمالي المحلي المباشر لسبارك.
                    </p>
                  </div>
                  <Button
                    onClick={() => setHeaderMode("actions")}
                    variant="brand"
                    className="hidden sm:inline-flex"
                  >
                    <Plus className="w-4 h-4" />
                    <span>إجراء سريع</span>
                  </Button>
                </div>
              </header>

              {/* ATHREDU Admin Capsule Navigation Destinations */}
              <nav aria-label="Destinations" className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    id: "clients" as NavSection,
                    title: "إدارة العملاء",
                    desc: "ملفات العملاء 360°، والأرصدة والتواصل",
                    icon: Users,
                    accent: "bg-blue-50 text-blue-600",
                  },
                  {
                    id: "studio" as NavSection,
                    title: "جلسات الاستوديو اليوم",
                    desc: `${dashboardStats?.todayBookingsCount ?? 0} جلسة مسجلة اليوم`,
                    icon: CalendarCheck,
                    accent: "bg-emerald-50 text-emerald-600",
                  },
                  {
                    id: "finance" as NavSection,
                    title: "المقبوضات والمصروفات",
                    desc: "الدفعات النقدية والتحويلات والمصروفات",
                    icon: CreditCard,
                    accent: "bg-amber-50 text-amber-600",
                  },
                  {
                    id: "contracts" as NavSection,
                    title: "العقود والباقات",
                    desc: "عقود التسويق وباقات الساعات والريلز",
                    icon: Boxes,
                    accent: "bg-indigo-50 text-indigo-600",
                  },
                ].map(({ id, title, desc, icon: Icon, accent }) => (
                  <button
                    key={id}
                    onClick={() => setActiveSection(id)}
                    className="group flex items-center gap-4 bg-white border border-[#E5E5E5] rounded-full px-5 py-4 shadow-sm hover:border-gray-300 transition-all duration-200 text-right cursor-pointer"
                  >
                    <span className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${accent}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-sm text-[#1A1A1A]">{title}</span>
                      <span className="block text-xs text-[#707070] truncate">{desc}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-[#A0A0A0] group-hover:-translate-x-1 transition-transform" />
                  </button>
                ))}
              </nav>

              {/* KPI Cards (ATHREDU Clean rounded-2rem Cards with Live SQLite Data) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                <Card className="flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#707070] text-xs font-semibold mb-3">
                    <span>تحصيلات الشهر</span>
                    <span className="p-2 rounded-full bg-emerald-50 text-emerald-600">
                      <TrendingUp className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-[#1A1A1A]">
                    {isStatsLoading ? (
                      <span className="text-sm text-neutral-400">جاري التحميل...</span>
                    ) : (
                      <BdiCurrency piasters={dashboardStats?.monthCollections ?? 0} className="text-2xl font-bold text-[#1A1A1A]" />
                    )}
                  </div>
                  <div className="mt-3 text-xs text-[#707070] flex items-center gap-1.5">
                    <span>دفعات نشطة محصلة هذا الشهر</span>
                  </div>
                </Card>

                <Card className="flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#707070] text-xs font-semibold mb-3">
                    <span>الاستوديو اليوم</span>
                    <span className="p-2 rounded-full bg-blue-50 text-blue-600">
                      <CalendarCheck className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-[#1A1A1A]">
                    {isStatsLoading ? (
                      <span className="text-sm text-neutral-400">جاري التحميل...</span>
                    ) : (
                      <BdiText>{dashboardStats?.todayBookingsCount ?? 0} جلسة ({Math.round((dashboardStats?.todayBookingsMinutes ?? 0) / 60)} س)</BdiText>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-[#707070]">
                    حجوزات مجدولة غير ملغاة
                  </div>
                </Card>

                <Card className="flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#707070] text-xs font-semibold mb-3">
                    <span>مستحقات متأخرة</span>
                    <span className="p-2 rounded-full bg-rose-50 text-rose-600">
                      <AlertCircle className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-rose-600">
                    {isStatsLoading ? (
                      <span className="text-sm text-neutral-400">جاري التحميل...</span>
                    ) : (
                      <BdiCurrency piasters={dashboardStats?.overdueAmount ?? 0} className="text-2xl font-bold text-rose-600" />
                    )}
                  </div>
                  <div className="mt-3 text-xs text-rose-600 font-semibold">
                    {dashboardStats?.overdueCount ?? 0} مستحق يحتاج متابعة
                  </div>
                </Card>

                <Card className="flex flex-col justify-between">
                  <div className="flex items-center justify-between text-[#707070] text-xs font-semibold mb-3">
                    <span>العملاء النشطون</span>
                    <span className="p-2 rounded-full bg-indigo-50 text-indigo-600">
                      <Users className="w-4 h-4" />
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-[#1A1A1A]">
                    {isStatsLoading ? (
                      <span className="text-sm text-neutral-400">جاري التحميل...</span>
                    ) : (
                      <BdiText>{dashboardStats?.activeClientsCount ?? 0} عميل</BdiText>
                    )}
                  </div>
                  <div className="mt-3 text-xs text-[#707070]">
                    ملفات عملاء نشطة بالنظام
                  </div>
                </Card>
              </div>
            </div>
          )}
        </PageMotion>
      </main>

      {/* GLOBAL MODALS */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSelectAction={handleQuickAddAction}
      />

      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigate={(sec) => {
          setActiveSection(sec as NavSection);
          setIsSearchOpen(false);
        }}
      />

      <ClientFormModal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        onSaved={(_client: ClientRecord) => {
          setIsClientModalOpen(false);
          setRefreshTrigger((prev) => prev + 1);
          showToast("تم حفظ بيانات العميل بنجاح في قاعدة البيانات", "success");
        }}
      />

      <PaymentEntryModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        preselectedClientId={paymentClientId}
        onPaymentRecorded={() => {
          setIsPaymentModalOpen(false);
          setRefreshTrigger((prev) => prev + 1);
          showToast("تم تسجيل الدفعة وتوزيعها بنجاح", "success");
        }}
      />

      <ExpenseEntryModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        onExpenseCreated={() => {
          setIsExpenseModalOpen(false);
          setRefreshTrigger((prev) => prev + 1);
          showToast("تم تسجيل المصروف بنجاح", "success");
        }}
      />

      <PaymentVoidModal
        isOpen={!!paymentToVoid}
        onClose={() => setPaymentToVoid(null)}
        payment={paymentToVoid}
        onVoided={() => {
          setPaymentToVoid(null);
          setRefreshTrigger((prev) => prev + 1);
          showToast("تم إلغاء الدفعة وإدراج سبب الإلغاء في سجل النشاط", "warning");
        }}
      />

      <ContractFormModal
        isOpen={isContractModalOpen}
        onClose={() => setIsContractModalOpen(false)}
        onSaved={(_contractId: string) => {
          setIsContractModalOpen(false);
          setRefreshTrigger((prev) => prev + 1);
          showToast("تم إنشاء العقد وتوليد المستحقات بنجاح", "success");
        }}
      />

      <ClientPackagePurchaseModal
        isOpen={isPackageModalOpen}
        onClose={() => setIsPackageModalOpen(false)}
        onSaved={() => {
          setIsPackageModalOpen(false);
          setRefreshTrigger((prev) => prev + 1);
          showToast("تم بيع الباقة وتوليد لقطة البنود بنجاح", "success");
        }}
      />

      <ReelFormModal
        isOpen={isReelModalOpen}
        onClose={() => setIsReelModalOpen(false)}
        onSaved={(_reelId: string) => {
          setIsReelModalOpen(false);
          setRefreshTrigger((prev) => prev + 1);
          showToast("تم حفظ تفاصيل الريل وربطها بنجاح", "success");
        }}
      />
    </div>
  );
};
