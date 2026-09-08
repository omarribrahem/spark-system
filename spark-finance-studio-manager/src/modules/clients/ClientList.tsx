import React, { useState, useEffect, useCallback } from "react";
import {
  Search,
  UserPlus,
  Building2,
  Phone,
  Archive,
  RotateCcw,
  Edit,
  Settings2,
  MapPin,
  MessageCircle,
} from "lucide-react";
import {
  ClientRecord,
  ClientRepository,
  ClientWithFinancials,
  ClientCustomFieldRepository,
  ClientFilterPresetRepository,
  ClientFilterPreset,
  PaymentRecord,
} from "../../database/repositories";
import { CustomFieldDefinition, CLIENT_TYPES } from "../../domain/models/client-custom-fields";
import { FilterAST } from "../../domain/models/client-filter-ast";
import { getDatabaseDriver } from "../../database/driver";
import { BdiCurrency } from "../../ui/bdi";
import { SkeletonCard, EmptyState, ActionableError } from "../../ui/feedback";
import { Button } from "../../ui/athredu/Button";
import { UserAvatar } from "../../ui/athredu/UserAvatar";
import { ClientProfile360 } from "./ClientProfile360";
import { ClientFilterBuilder } from "./ClientFilterBuilder";
import { CustomFieldsSettingsModal } from "./CustomFieldsSettingsModal";

export type ClientFilterTab = "all" | "active" | "archived" | "with_dues";

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

  // Custom fields & Filter AST state
  const [customDefinitions, setCustomDefinitions] = useState<CustomFieldDefinition[]>([]);
  const [ast, setAst] = useState<FilterAST>({ conjunction: "AND", rules: [] });
  const [presets, setPresets] = useState<ClientFilterPreset[]>([]);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  // Modals state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  useEffect(() => {
    if (onRequestNewClient) {
      if (onOpenHeaderForm) onOpenHeaderForm("form-client");
      if (onResetNewClientRequest) onResetNewClientRequest();
    }
  }, [onRequestNewClient, onResetNewClientRequest, onOpenHeaderForm]);

  // Load clients directly via SQLite repository query layer
  const loadClients = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const driver = await getDatabaseDriver();
      const clientRepo = new ClientRepository(driver);
      const customRepo = new ClientCustomFieldRepository(driver);
      const presetRepo = new ClientFilterPresetRepository(driver);

      const [defs, loadedPresets] = await Promise.all([
        customRepo.listDefinitions(),
        presetRepo.list(),
      ]);
      setCustomDefinitions(defs);
      setPresets(loadedPresets);

      // Execute search and filtering in SQLite layer directly (no memory filtering in React)
      const results = await clientRepo.queryWithFilterAST(ast, defs, {
        searchQuery,
        activeTab,
      });

      setClients(results);
    } catch (err: unknown) {
      console.error("Failed to load clients list:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [ast, searchQuery, activeTab]);

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

  const handleSelectPreset = (preset: ClientFilterPreset | null) => {
    if (preset) {
      setActivePresetId(preset.id);
      setAst({
        conjunction: "AND",
        rules: preset.rules || [],
      });
    } else {
      setActivePresetId(null);
      setAst({
        conjunction: "AND",
        rules: [],
      });
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card */}
      <div className="rounded-[2rem] border border-[#E5E5E5] bg-white p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1A1A1A]">
              سجل العملاء
            </h1>
            <p className="mt-1 text-xs text-[#707070]">
              إدارة ملفات العملاء 360°، الحقول المخصصة، الفلاتر الذكية والأرصدة المالية.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="h-11 px-4 rounded-full border border-[#E5E5E5] bg-white hover:bg-neutral-50 text-xs font-semibold text-neutral-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Settings2 className="w-4 h-4 text-neutral-500" />
              <span>إعدادات الحقول</span>
            </button>

            <Button
              variant="brand"
              onClick={() => onOpenHeaderForm?.("form-client")}
              className="rounded-full h-11 px-5 text-xs font-bold whitespace-nowrap shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>عميل جديد</span>
            </Button>
          </div>
        </div>

        {/* Search, Tabs & Filter Builder */}
        <div className="mt-6 space-y-4">
          {/* Quick Filter Tabs & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5 bg-[#F9FAFB] p-1.5 rounded-full border border-[#E5E5E5] self-start">
              {[
                { id: "all", label: "الكل" },
                { id: "active", label: "النشطون" },
                { id: "archived", label: "المؤرشفون" },
                { id: "with_dues", label: "عليهم مستحقات" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ClientFilterTab)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-white text-[#004AC6] shadow-xs border border-[#E5E5E5]"
                      : "text-[#707070] hover:text-[#1A1A1A]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Quick Search Bar */}
            <div className="relative w-full md:w-80">
              <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A0A0A0]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، الهاتف، المدينة، أو الحقول المخصصة..."
                className="w-full h-11 pr-10 pl-4 rounded-full border border-[#E5E5E5] bg-white text-xs font-semibold text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:outline-none focus:border-[#004AC6] transition-all"
              />
            </div>
          </div>

          {/* Client Filter Builder (Rule Engine, Chips & Presets) */}
          <div className="pt-2 border-t border-neutral-100">
            <ClientFilterBuilder
              ast={ast}
              customDefinitions={customDefinitions}
              presets={presets}
              activePresetId={activePresetId}
              onAstChange={(newAst) => {
                setAst(newAst);
                setActivePresetId(null);
              }}
              onPresetsChange={loadClients}
              onSelectPreset={handleSelectPreset}
            />
          </div>
        </div>
      </div>

      {/* Clients List / Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : error ? (
        <ActionableError
          message="حدث خطأ أثناء تحميل سجل العملاء"
          onRetry={loadClients}
        />
      ) : clients.length === 0 ? (
        <EmptyState
          title="لا يوجد عملاء يطابقون شروط البحث"
          description="جرّب تعديل معايير الفلترة أو مسح الشروط للوصول للنتائج."
          actionLabel="تسجيل عميل جديد"
          onAction={() => onOpenHeaderForm?.('form-client')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clients.map((client) => {
            const hasDues = client.outstandingDuesPiasters > 0;
            const hasCredit = client.creditPiasters > 0;
            const clientTypeLabel =
              CLIENT_TYPES.find((t) => t.value === client.client_type)?.label ||
              client.client_type ||
              "فرد";

            return (
              <div
                key={client.id}
                onClick={() => setSelectedClientId(client.id)}
                className={`rounded-[2rem] border bg-white p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:border-gray-300 transition-all duration-200 cursor-pointer flex flex-col justify-between ${
                  client.active === 0
                    ? "opacity-60 bg-neutral-50/50 border-neutral-200"
                    : "border-[#E5E5E5]"
                }`}
              >
                <div>
                  {/* Top Client Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar name={client.name} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-sm font-bold text-[#1A1A1A] truncate">
                            {client.name}
                          </h3>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-[#004AC6] font-semibold">
                            {clientTypeLabel}
                          </span>
                        </div>
                        {client.company_name && (
                          <p className="text-xs text-[#707070] flex items-center gap-1 mt-0.5 truncate">
                            <Building2 className="w-3 h-3 shrink-0" />
                            <span>{client.company_name}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold shrink-0 ${
                        client.active === 1
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {client.active === 1 ? "نشط" : "مؤرشف"}
                    </span>
                  </div>

                  {/* Contact Info Badges */}
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#707070]">
                    {client.phone && (
                      <span className="flex items-center gap-1 font-mono text-[11px] bg-neutral-50 px-2 py-1 rounded-md">
                        <Phone className="w-3 h-3 text-neutral-400" />
                        <span dir="ltr">{client.phone}</span>
                      </span>
                    )}
                    {client.whatsapp && client.whatsapp !== client.phone && (
                      <span className="flex items-center gap-1 font-mono text-[11px] bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md">
                        <MessageCircle className="w-3 h-3 text-emerald-600" />
                        <span dir="ltr">{client.whatsapp}</span>
                      </span>
                    )}
                    {client.city && (
                      <span className="flex items-center gap-1 text-[11px] bg-neutral-50 px-2 py-1 rounded-md">
                        <MapPin className="w-3 h-3 text-neutral-400" />
                        <span>{client.city}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Financial Summary & Actions */}
                <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    {hasDues ? (
                      <div className="text-xs font-bold text-rose-600 flex items-center gap-1">
                        <span>مستحق:</span>
                        <BdiCurrency piasters={client.outstandingDuesPiasters} />
                      </div>
                    ) : hasCredit ? (
                      <div className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <span>رصيد:</span>
                        <BdiCurrency piasters={client.creditPiasters} />
                      </div>
                    ) : (
                      <span className="text-xs text-neutral-400 font-medium">
                        لا توجد مستحقات
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onOpenHeaderForm?.("form-client")}
                      title="تعديل بيانات العميل"
                      className="p-2 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleArchive(client)}
                      title={client.active === 1 ? "أرشفة العميل" : "استعادة العميل"}
                      className="p-2 rounded-full bg-neutral-100 text-neutral-600 hover:bg-neutral-200 active:scale-95 transition-all cursor-pointer whitespace-nowrap shrink-0"
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

      {/* Custom Fields Settings Modal */}
      <CustomFieldsSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onChanged={loadClients}
      />

      {/* 360 Profile Modal */}
      {selectedClientId && (
        <ClientProfile360
          clientId={selectedClientId}
          isOpen={!!selectedClientId}
          onClose={() => setSelectedClientId(null)}
          onEditClient={(_client) => {
            onOpenHeaderForm?.('form-client');
          }}
          onRecordPayment={(client) => {
            if (onOpenPaymentModal) onOpenPaymentModal(client);
          }}
          onVoidPayment={onOpenVoidModal}
        />
      )}
    </div>
  );
};

export default ClientList;
