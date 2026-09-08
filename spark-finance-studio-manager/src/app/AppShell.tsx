import React, { useState, useEffect } from "react";
import { DynamicHeader, HeaderMode } from "./DynamicHeader";
import { QuickAddModal } from "./QuickAddModal";
import { GlobalSearchModal } from "./GlobalSearchModal";
import { PageMotion } from "../ui/athredu/PageMotion";
import { ClientList } from "../modules/clients";
import {
  FinanceView,
  PaymentVoidModal,
} from "../modules/finance";
import { ContractsList } from "../modules/contracts";
import { PackagesView } from "../modules/packages";
import { ReelsKanban } from "../modules/reels";
import { StudioView } from "../modules/studio";
import { ReportsView } from "../modules/reports";
import { BackupView } from "../modules/backup/BackupView";
import { SettingsView } from "../modules/settings";
import { AboutView } from "../modules/system/AboutView";
import { DashboardView } from "../modules/dashboard/DashboardView";
import { ClientRecord, PaymentRecord } from "../database/repositories";
import { NavSection } from "./navigation";

export const AppShell: React.FC = () => {
  const [activeSection, setActiveSection] = useState<NavSection>("dashboard");
  const [headerMode, setHeaderMode] = useState<HeaderMode>("compact");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  // Dynamic Island notification state
  const [notificationMessage, setNotificationMessage] = useState<string | null>(null);
  const [notificationType, setNotificationType] = useState<"success" | "error" | "warning" | "info">("info");

  // Payment Void Modal State
  const [paymentToVoid, setPaymentToVoid] = useState<PaymentRecord | null>(null);

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
      case "new-sold-plan":
        setHeaderMode("form-sold-plan");
        break;
      case "new-package-template":
      case "new-plan-template":
        setHeaderMode("form-plan-template");
        break;
      case "new-service":
        setHeaderMode("form-service");
        break;
      case "new-reel":
        setHeaderMode("form-reel");
        break;
      case "new-booking":
        setHeaderMode("form-booking");
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
              onOpenPaymentModal={(_client: ClientRecord) => {
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
            <StudioView
              key={`studio-${refreshTrigger}`}
              onOpenHeaderForm={(formMode) => setHeaderMode(formMode as HeaderMode)}
            />
          )}

          {/* VIEW: REPORTS & AUDITING */}
          {activeSection === "reports" && (
            <ReportsView key={`reports-${refreshTrigger}`} />
          )}

          {/* VIEW: BACKUP */}
          {activeSection === "backup" && (
            <BackupView onShowToast={showToast} key={`backup-${refreshTrigger}`} />
          )}

          {/* VIEW: SETTINGS & RBAC */}
          {activeSection === "settings" && (
            <SettingsView onShowToast={showToast} key={`settings-${refreshTrigger}`} />
          )}

          {/* VIEW: ABOUT & SYSTEM STATUS */}
          {activeSection === "about" && (
            <AboutView onShowToast={showToast} key={`about-${refreshTrigger}`} />
          )}

          {/* VIEW: DASHBOARD */}
          {activeSection === "dashboard" && (
            <DashboardView
              key={`dashboard-${refreshTrigger}`}
              onNavigate={(sec) => setActiveSection(sec)}
              onOpenHeaderForm={(formMode) => setHeaderMode(formMode as HeaderMode)}
            />
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
    </div>
  );
};
