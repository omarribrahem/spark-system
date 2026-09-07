import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Search,
  UserPlus,
  Building2,
  Phone,
  Archive,
  RotateCcw,
  Edit,
  Wallet,
  ExternalLink,
} from "lucide-react";
import {
  ClientRecord,
  ClientRepository,
  PaymentRepository,
  PaymentRecord,
} from "../../database/repositories";
import { getDatabaseDriver } from "../../database/driver";
import { BdiCurrency } from "../../ui/bdi";
import { SkeletonCard, EmptyState, ActionableError } from "../../ui/feedback";
import { Button } from "../../ui/athredu/Button";
import { UserAvatar } from "../../ui/athredu/UserAvatar";
import { ClientFormModal } from "./ClientFormModal";
import { ClientProfile360 } from "./ClientProfile360";

export type ClientFilterTab = "all" | "active" | "archived" | "with_dues";

export interface ClientWithFinancials extends ClientRecord {
  outstandingDuesPiasters: number;
  creditPiasters: number;
  activeContractsCount: number;
}

export interface ClientListProps {
  onOpenPaymentModal?: (client: ClientRecord) => void;
  onOpenVoidModal?: (payment: PaymentRecord) => void;
  onRequestNewClient?: boolean;
  onResetNewClientRequest?: () => void;
  onOpenHeaderForm?: (mode: "form-client") => void;
}

export const ClientList: React.FC<ClientListProps> = ({
  onOpenPaymentModal,
  onOpenVoidModal,
  onRequestNewClient,
  onResetNewClientRequest,
  onOpenHeaderForm,
}) => {
  const [clients, setClients] = useState<ClientWithFinancials[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const [activeTab, setActiveTab] = useState<ClientFilterTab>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isFormModalOpen, setIsFormModalOpen] = useState<boolean>(false);
  const [clientToEdit, setClientToEdit] = useState<ClientRecord | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  useEffect(() => {
    if (onRequestNewClient) {
      setClientToEdit(null);
      setIsFormModalOpen(true);
      if (onResetNewClientRequest) onResetNewClientRequest();
    }
  }, [onRequestNewClient, onResetNewClientRequest]);

  const loadClients = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const clientRepo = new ClientRepository(driver);
      const paymentRepo = new PaymentRepository(driver);

      const baseClients = await clientRepo.list();

      const enrichedClients: ClientWithFinancials[] = await Promise.all(
        baseClients.map(async (c: ClientRecord) => {
          const creditPiasters = await paymentRepo.getClientCreditPiasters(c.id);

          const duesRows = await driver.query<{ totalOutstanding: number }>(
            `SELECT COALESCE(SUM(remaining), 0) AS totalOutstanding FROM (
               SELECT (d.amount_piasters - COALESCE(SUM(pa.allocated_piasters), 0)) AS remaining
               FROM marketing_monthly_dues d
               JOIN marketing_contracts mc ON d.contract_id = mc.id
               LEFT JOIN payment_allocations pa ON pa.target_id = d.id AND pa.target_type = 'marketing_due'
               WHERE mc.client_id = ?
               GROUP BY d.id
             ) WHERE remaining > 0;`,
            [c.id]
          );
          const outstandingDuesPiasters = duesRows[0]?.totalOutstanding ?? 0;

          const contractsCountRows = await driver.query<{ count: number }>(
            `SELECT COUNT(*) AS count FROM marketing_contracts WHERE client_id = ? AND status = 'active';`,
            [c.id]
          );
          const activeContractsCount = contractsCountRows[0]?.count ?? 0;

          return {
            ...c,
            outstandingDuesPiasters,
            creditPiasters,
            activeContractsCount,
          };
        })
      );

      setClients(enrichedClients);
    } catch (err: unknown) {
      console.error("Failed to load clients list:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleToggleArchive = async (client: ClientRecord) => {
    try {
      const driver = await getDatabaseDriver();
      const clientRepo = new ClientRepository(driver);
      if (client.active === 1) {
        await clientRepo.archive(client.id);
      } else {
        await clientRepo.unarchive(client.id);
      }
      await loadClients();
    } catch (err: unknown) {
      console.error("Failed to toggle archive:", err);
    }
  };

  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      if (activeTab === "active" && c.active !== 1) return false;
      if (activeTab === "archived" && c.active !== 0) return false;
      if (activeTab === "with_dues" && c.outstandingDuesPiasters <= 0) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = c.name.toLowerCase().includes(q);
        const matchCompany = c.company_name?.toLowerCase().includes(q) ?? false;
        const matchPhone = c.phone?.includes(q) ?? false;
        if (!matchName && !matchCompany && !matchPhone) return false;
      }

      return true;
    });
  }, [clients, activeTab, searchQuery]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header & Search Bar (ATHREDU Style) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، الشركة، أو رقم الهاتف..."
            className="w-full h-11 pr-11 pl-10 rounded-full bg-white border border-[#E5E5E5] text-sm text-[#1A1A1A] placeholder-neutral-400 focus:outline-none focus:border-[#004AC6] shadow-sm transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-medium text-neutral-400 hover:text-neutral-700"
            >
              مسح
            </button>
          )}
        </div>

        <Button
          onClick={() => {
            if (onOpenHeaderForm) {
              onOpenHeaderForm("form-client");
            } else {
              setClientToEdit(null);
              setIsFormModalOpen(true);
            }
          }}
          variant="brand"
          size="sm"
          className="gap-2 shrink-0 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة عميل جديد</span>
        </Button>
      </div>

      {/* Filter Tabs (ATHREDU Capsule Filter Pills) */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: "all", label: "الكل", count: clients.length },
          { id: "active", label: "النشطون", count: clients.filter((c) => c.active === 1).length },
          { id: "archived", label: "المؤرشفون", count: clients.filter((c) => c.active === 0).length },
          {
            id: "with_dues",
            label: "عليهم مستحقات",
            count: clients.filter((c) => c.outstandingDuesPiasters > 0).length,
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as ClientFilterTab)}
              className={`inline-flex items-center gap-2 h-9 px-4 rounded-full text-xs font-semibold transition-all shrink-0 select-none ${
                isActive
                  ? "bg-[#004AC6] text-white shadow-sm"
                  : "bg-white border border-[#E5E5E5] text-[#4A4A4A] hover:bg-neutral-50 hover:text-[#1A1A1A]"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  isActive ? "bg-white/20 text-white" : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard rows={3} hasHeader hasBadge />
          <SkeletonCard rows={3} hasHeader hasBadge />
          <SkeletonCard rows={3} hasHeader hasBadge />
        </div>
      ) : error ? (
        <ActionableError
          title="تعذر تحميل سجل العملاء"
          message={error.message}
          onRetry={loadClients}
        />
      ) : filteredClients.length === 0 ? (
        <EmptyState
          title={
            searchQuery
              ? "لا توجد نتائج مطابقة لبحثك"
              : activeTab === "archived"
              ? "لا يوجد عملاء مؤرشفون"
              : activeTab === "with_dues"
              ? "رائع! لا توجد مستحقات متأخرة على أي عميل"
              : "لا يوجد عملاء مسجلين حالياً"
          }
          description={
            searchQuery
              ? `لم يتم العثور على أي عميل يحتوي على: "${searchQuery}"`
              : "ابدأ بتسجيل أول عميل لإضافة عقود التسويق، باقات الاستوديو، والمعاملات المالية."
          }
          actionLabel={activeTab !== "archived" && !searchQuery ? "+ إضافة أول عميل" : undefined}
          onAction={
            activeTab !== "archived" && !searchQuery
              ? () => {
                  setClientToEdit(null);
                  setIsFormModalOpen(true);
                }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredClients.map((client) => {
            const hasDues = client.outstandingDuesPiasters > 0;
            const hasCredit = client.creditPiasters > 0;

            return (
              <div
                key={client.id}
                className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)] hover:border-gray-300 transition-all duration-200 flex flex-col justify-between group"
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={client.name} size="md" />
                      <div className="overflow-hidden">
                        <h3 className="font-bold text-[#1A1A1A] text-sm truncate group-hover:text-[#004AC6] transition-colors">
                          {client.name}
                        </h3>
                        {client.company_name ? (
                          <div className="flex items-center gap-1 text-xs text-[#707070] mt-0.5 truncate">
                            <Building2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                            <span className="truncate">{client.company_name}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-neutral-400">فردي / مستقل</span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                        client.active === 1
                          ? "bg-blue-50 text-[#004AC6] border border-blue-100"
                          : "bg-neutral-100 text-neutral-500 border border-neutral-200"
                      }`}
                    >
                      {client.active === 1 ? "نشط" : "مؤرشف"}
                    </span>
                  </div>

                  {/* Contact Info */}
                  <div className="mt-4 pt-3 border-t border-neutral-100 space-y-1.5">
                    {client.phone ? (
                      <div className="flex items-center gap-2 text-xs text-[#707070]">
                        <Phone className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                        <span dir="ltr" className="font-mono">
                          {client.phone}
                        </span>
                      </div>
                    ) : (
                      <div className="text-xs text-neutral-400">لا يوجد رقم هاتف</div>
                    )}
                  </div>

                  {/* Financial Status (Clean Calm ATHREDU Layout) */}
                  <div className="mt-4 pt-3 border-t border-neutral-100 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500 font-medium">مستحقات معلقة:</span>
                      {hasDues ? (
                        <BdiCurrency
                          piasters={client.outstandingDuesPiasters}
                          className="font-bold text-rose-600 font-mono"
                        />
                      ) : (
                        <span className="text-neutral-400 font-mono">0.00 ج.م</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500 font-medium">رصيد دائن (Credit):</span>
                      {hasCredit ? (
                        <BdiCurrency
                          piasters={client.creditPiasters}
                          className="font-bold text-emerald-600 font-mono"
                        />
                      ) : (
                        <span className="text-neutral-400 font-mono">0.00 ج.م</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions (Capsule Buttons) */}
                <div className="mt-6 pt-4 border-t border-neutral-100 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedClientId(client.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-[#004AC6] hover:underline"
                  >
                    <span>عرض الملف 360°</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>

                  <div className="flex items-center gap-1.5">
                    {onOpenPaymentModal && (
                      <button
                        type="button"
                        onClick={() => onOpenPaymentModal(client)}
                        title="تسجيل دفعة"
                        className="p-2 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 hover:text-[#004AC6] active:scale-95 transition-all"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setClientToEdit(client);
                        setIsFormModalOpen(true);
                      }}
                      title="تعديل العميل"
                      className="p-2 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:scale-95 transition-all"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleArchive(client)}
                      title={client.active === 1 ? "أرشفة العميل" : "استعادة العميل"}
                      className="p-2 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:scale-95 transition-all"
                    >
                      {client.active === 1 ? (
                        <Archive className="w-3.5 h-3.5" />
                      ) : (
                        <RotateCcw className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal */}
      <ClientFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setClientToEdit(null);
        }}
        clientToEdit={clientToEdit}
        onSaved={async () => {
          setIsFormModalOpen(false);
          setClientToEdit(null);
          await loadClients();
        }}
      />

      {/* 360 Profile Modal */}
      {selectedClientId && (
        <ClientProfile360
          clientId={selectedClientId}
          isOpen={!!selectedClientId}
          onClose={() => setSelectedClientId(null)}
          onRecordPayment={(client) => {
            if (onOpenPaymentModal) onOpenPaymentModal(client);
          }}
          onVoidPayment={onOpenVoidModal}
        />
      )}
    </div>
  );
};
