import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  CreditCard,
  FileText,
  Boxes,
  Video,
  CalendarCheck,
  BarChart3,
  Database,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  X,
  UserPlus,
  ReceiptText,
  PackagePlus,
  ChevronRight,
  Layers,
  Globe,
  Film,
} from "lucide-react";
import { NavSection } from "./navigation";
import { getDatabaseDriver } from "../database/driver";
import {
  ClientRepository,
  PaymentRepository,
  ExpenseRepository,
  ContractRepository,
  PackageRepository,
  ClientRecord,
  ClientPackageWithItems,
} from "../database/repositories";
import { PaymentMethod } from "../domain/models/financial";
import { ExpenseCategory } from "../domain/models/expense";
import { CATEGORY_OPTIONS } from "../modules/finance/ExpenseEntryModal";
import { createSubscription } from "../modules/contracts/contract-service";
import {
  fetchPackageTemplates,
  sellPackageToClient,
  savePackageTemplate,
  PackageTemplateWithItems,
} from "../modules/packages/package-service";
import { saveReel, ReelStage, REEL_STAGES } from "../modules/reels/reels-service";
import { Select } from "../ui/athredu/Select";
import { Button } from "../ui/athredu/Button";

export interface NavItem {
  id: NavSection;
  label: string;
  icon: React.ElementType;
  colorClass: string;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard, colorClass: "text-blue-600 bg-blue-50" },
  { id: "clients", label: "العملاء", icon: Users, colorClass: "text-indigo-600 bg-indigo-50" },
  { id: "finance", label: "المالية والمصروفات", icon: CreditCard, colorClass: "text-emerald-600 bg-emerald-50" },
  { id: "contracts", label: "العقود والاشتراكات", icon: FileText, colorClass: "text-amber-600 bg-amber-50" },
  { id: "packages", label: "الباقات المباعة", icon: Boxes, colorClass: "text-violet-600 bg-violet-50" },
  { id: "reels", label: "إنتاج الريلز", icon: Video, colorClass: "text-rose-600 bg-rose-50" },
  { id: "studio", label: "جدول الاستوديو", icon: CalendarCheck, colorClass: "text-sky-600 bg-sky-50" },
  { id: "reports", label: "التقارير المالية", icon: BarChart3, colorClass: "text-teal-600 bg-teal-50" },
  { id: "backup", label: "النسخ والبيانات", icon: Database, colorClass: "text-slate-600 bg-slate-100" },
];

export interface QuickActionItem {
  id: string;
  title: string;
  desc: string;
  icon: React.ElementType;
  colorClass: string;
}

export const QUICK_ACTIONS: QuickActionItem[] = [
  { id: "new-client", title: "عميل جديد", desc: "تسجيل بيانات عميل أو شركة", icon: UserPlus, colorClass: "text-blue-600 bg-blue-50" },
  { id: "new-payment", title: "تسجيل دفعة", desc: "إدخال دفعة مالية وتوزيعها", icon: CreditCard, colorClass: "text-emerald-600 bg-emerald-50" },
  { id: "new-expense", title: "تسجيل مصروف", desc: "مصروف تشغيلي مع إيصال", icon: ReceiptText, colorClass: "text-rose-600 bg-rose-50" },
  { id: "new-contract", title: "عقد تسويق", desc: "عقد ريتينر شهري جديد", icon: FileText, colorClass: "text-amber-600 bg-amber-50" },
  { id: "new-subscription", title: "اشتراك دوري", desc: "خدمة أو أداة برمجية شهرية", icon: Layers, colorClass: "text-indigo-600 bg-indigo-50" },
  { id: "new-website", title: "مشروع موقع", desc: "موقع ويب ومراحل دفع", icon: Globe, colorClass: "text-teal-600 bg-teal-50" },
  { id: "new-package", title: "بيع باقة", desc: "بيع باقة ساعات أو ريلز", icon: PackagePlus, colorClass: "text-violet-600 bg-violet-50" },
  { id: "new-package-template", title: "قالب باقة", desc: "إنشاء قالب باقة معتمد", icon: Boxes, colorClass: "text-purple-600 bg-purple-50" },
  { id: "new-reel", title: "ريلز جديد", desc: "إضافة فكرة لقمع الإنتاج", icon: Film, colorClass: "text-pink-600 bg-pink-50" },
  { id: "new-booking", title: "حجز استوديو", desc: "جلسة تصوير بالجدول", icon: CalendarCheck, colorClass: "text-sky-600 bg-sky-50" },
];

export interface SearchResultItem {
  id: string;
  title: string;
  type: "client" | "contract";
  typeLabel: string;
  subtitle: string;
  section: NavSection;
}

export type HeaderMode =
  | "compact"
  | "menu"
  | "search"
  | "actions"
  | "form-client"
  | "form-payment"
  | "form-expense"
  | "form-contract"
  | "form-subscription"
  | "form-website"
  | "form-package-buy"
  | "form-package-template"
  | "form-reel";

export interface DynamicHeaderProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onOpenQuickAddAction?: (actionId: string) => void;
  notificationMessage?: string | null;
  notificationType?: "success" | "error" | "warning" | "info";
  onDismissNotification?: () => void;
  openMode?: HeaderMode;
  onModeChange?: (mode: HeaderMode) => void;
  onDataMutated?: (message: string) => void;
}

export const DynamicHeader: React.FC<DynamicHeaderProps> = ({
  activeSection,
  onSelectSection,
  onOpenQuickAddAction,
  notificationMessage,
  notificationType = "info",
  onDismissNotification,
  openMode,
  onModeChange,
  onDataMutated,
}) => {
  const [internalMode, setInternalMode] = useState<HeaderMode>("compact");
  const mode = openMode !== undefined ? openMode : internalMode;
  const setMode = (m: HeaderMode) => {
    setInternalMode(m);
    if (onModeChange) onModeChange(m);
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeItem = NAV_ITEMS.find((item) => item.id === activeSection) || NAV_ITEMS[0];
  const ActiveIcon = activeItem.icon;
  const hasNotification = Boolean(notificationMessage);

  // Focus search input when switching to search mode
  useEffect(() => {
    if (mode === "search") {
      setTimeout(() => searchInputRef.current?.focus(), 60);
    } else {
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [mode]);

  // Click outside to close back to compact
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setMode("compact");
      }
    };
    if (mode !== "compact") {
      document.addEventListener("mousedown", handleOutsideClick);
      return () => document.removeEventListener("mousedown", handleOutsideClick);
    }
  }, [mode]);

  // Escape key returns to compact
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMode("compact");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setMode(mode === "search" ? "compact" : "search");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode]);

  // Perform real-time SQLite search
  const performSearch = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) {
      setSearchResults([]);
      return;
    }
    try {
      setIsSearching(true);
      const driver = await getDatabaseDriver();
      const likeTerm = `%${term}%`;

      const [clients, contracts] = await Promise.all([
        driver.query<{ id: string; name: string; company_name: string | null; phone: string | null }>(
          `SELECT id, name, company_name, phone FROM clients WHERE name LIKE ? OR company_name LIKE ? OR phone LIKE ? LIMIT 5`,
          [likeTerm, likeTerm, likeTerm]
        ),
        driver.query<{ id: string; client_name: string; monthly_amount: number }>(
          `SELECT c.id, cl.name as client_name, c.monthly_amount
           FROM marketing_contracts c
           JOIN clients cl ON cl.id = c.client_id
           WHERE cl.name LIKE ? LIMIT 4`,
          [likeTerm]
        ),
      ]);

      const results: SearchResultItem[] = [];

      clients.forEach((c) => {
        results.push({
          id: c.id,
          title: c.name,
          subtitle: c.company_name || c.phone || "عميل",
          type: "client",
          typeLabel: "عميل",
          section: "clients",
        });
      });

      contracts.forEach((ct) => {
        results.push({
          id: ct.id,
          title: `عقد تسويق: ${ct.client_name}`,
          subtitle: `${(ct.monthly_amount / 100).toLocaleString("ar-EG")} ج.م / شهر`,
          type: "contract",
          typeLabel: "عقد",
          section: "contracts",
        });
      });

      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        void performSearch(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  // Shared Client List & Templates
  const [clientsList, setClientsList] = useState<ClientRecord[]>([]);
  const [templatesList, setTemplatesList] = useState<PackageTemplateWithItems[]>([]);
  const [clientPackagesList, setClientPackagesList] = useState<ClientPackageWithItems[]>([]);

  // Embedded Client Form State
  const [clientName, setClientName] = useState("");
  const [clientCompany, setClientCompany] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [isClientSubmitting, setIsClientSubmitting] = useState(false);

  // Embedded Payment Form State
  const [paymentClientId, setPaymentClientId] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paymentNote, setPaymentNote] = useState<string>("");
  const [paymentReceipt, setPaymentReceipt] = useState<string>("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaymentSubmitting, setIsPaymentSubmitting] = useState(false);

  // Embedded Expense Form State
  const [expenseAmount, setExpenseAmount] = useState<string>("");
  const [expenseDate, setExpenseDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>("rent");
  const [expenseDesc, setExpenseDesc] = useState<string>("");
  const [expenseNote, setExpenseNote] = useState<string>("");
  const [expenseReceipt, setExpenseReceipt] = useState<string>("");
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [isExpenseSubmitting, setIsExpenseSubmitting] = useState(false);

  // Embedded Contract Form State
  const [contractClientId, setContractClientId] = useState<string>("");
  const [contractAmount, setContractAmount] = useState<string>("");
  const [contractStartDate, setContractStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [contractEndDate, setContractEndDate] = useState<string>("");
  const [contractNotes, setContractNotes] = useState<string>("");
  const [contractInitialDue, setContractInitialDue] = useState<boolean>(true);
  const [contractError, setContractError] = useState<string | null>(null);
  const [isContractSubmitting, setIsContractSubmitting] = useState(false);

  // Embedded Subscription Form State
  const [subClientId, setSubClientId] = useState<string>("");
  const [subServiceName, setSubServiceName] = useState<string>("");
  const [subAmount, setSubAmount] = useState<string>("");
  const [subBillingDay, setSubBillingDay] = useState<number>(1);
  const [subStartDate, setSubStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [subEndDate, setSubEndDate] = useState<string>("");
  const [subNotes, setSubNotes] = useState<string>("");
  const [subError, setSubError] = useState<string | null>(null);
  const [isSubSubmitting, setIsSubSubmitting] = useState(false);

  // Embedded Website Project Form State
  const [webClientId, setWebClientId] = useState<string>("");
  const [webName, setWebName] = useState<string>("");
  const [webPrice, setWebPrice] = useState<string>("");
  const [webStartDate, setWebStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [webDeliveryDate, setWebDeliveryDate] = useState<string>("");
  const [webNextAmount, setWebNextAmount] = useState<string>("");
  const [webNextDate, setWebNextDate] = useState<string>("");
  const [webNotes, setWebNotes] = useState<string>("");
  const [webError, setWebError] = useState<string | null>(null);
  const [isWebSubmitting, setIsWebSubmitting] = useState(false);

  // Embedded Package Purchase Form State
  const [buyClientId, setBuyClientId] = useState<string>("");
  const [buyTemplateId, setBuyTemplateId] = useState<string>("");
  const [buyNameSnapshot, setBuyNameSnapshot] = useState<string>("");
  const [buyPrice, setBuyPrice] = useState<string>("");
  const [buyDate, setBuyDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [buyHours, setBuyHours] = useState<string>("");
  const [buyReels, setBuyReels] = useState<string>("");
  const [buyNotes, setBuyNotes] = useState<string>("");
  const [buyError, setBuyError] = useState<string | null>(null);
  const [isBuySubmitting, setIsBuySubmitting] = useState(false);

  // Embedded Package Template Form State
  const [tplName, setTplName] = useState<string>("");
  const [tplPrice, setTplPrice] = useState<string>("");
  const [tplHours, setTplHours] = useState<string>("");
  const [tplReels, setTplReels] = useState<string>("");
  const [tplError, setTplError] = useState<string | null>(null);
  const [isTplSubmitting, setIsTplSubmitting] = useState(false);

  // Embedded Reel Form State
  const [reelClientId, setReelClientId] = useState<string>("");
  const [reelPackageId, setReelPackageId] = useState<string>("");
  const [reelTitle, setReelTitle] = useState<string>("");
  const [reelStage, setReelStage] = useState<ReelStage>("planned");
  const [reelTargetDate, setReelTargetDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [reelNotes, setReelNotes] = useState<string>("");
  const [reelError, setReelError] = useState<string | null>(null);
  const [isReelSubmitting, setIsReelSubmitting] = useState(false);

  // Load clients & templates when entering relevant form modes
  useEffect(() => {
    const needsClients =
      mode === "form-payment" ||
      mode === "form-contract" ||
      mode === "form-subscription" ||
      mode === "form-website" ||
      mode === "form-package-buy" ||
      mode === "form-reel";

    if (needsClients) {
      void (async () => {
        try {
          const driver = await getDatabaseDriver();
          const repo = new ClientRepository(driver);
          const list = await repo.list({ activeOnly: true });
          setClientsList(list);

          const defaultClientId = list.length > 0 ? list[0].id : "";
          if (!paymentClientId && defaultClientId) setPaymentClientId(defaultClientId);
          if (!contractClientId && defaultClientId) setContractClientId(defaultClientId);
          if (!subClientId && defaultClientId) setSubClientId(defaultClientId);
          if (!webClientId && defaultClientId) setWebClientId(defaultClientId);
          if (!buyClientId && defaultClientId) setBuyClientId(defaultClientId);
          if (!reelClientId && defaultClientId) setReelClientId(defaultClientId);

          if (mode === "form-package-buy") {
            const templates = await fetchPackageTemplates(driver);
            setTemplatesList(templates);
            if (templates.length > 0 && !buyTemplateId) {
              const first = templates[0];
              setBuyTemplateId(first.id);
              setBuyNameSnapshot(first.name);
              setBuyPrice(String(first.default_price / 100));
              setBuyHours(first.hoursMinutes > 0 ? String(first.hoursMinutes / 60) : "0");
              setBuyReels(String(first.reelsCount || 0));
            }
          }

          if (mode === "form-reel") {
            const targetClient = reelClientId || defaultClientId;
            if (targetClient) {
              const packageRepo = new PackageRepository(driver);
              const pkgs = await packageRepo.listByClient(targetClient);
              setClientPackagesList(pkgs);
            }
          }
        } catch {
          // ignore
        }
      })();
    }
  }, [mode]);

  // When reel client changes, update package options
  const handleReelClientChange = async (newClientId: string) => {
    setReelClientId(newClientId);
    setReelPackageId("");
    try {
      const driver = await getDatabaseDriver();
      const packageRepo = new PackageRepository(driver);
      const pkgs = await packageRepo.listByClient(newClientId);
      setClientPackagesList(pkgs);
    } catch {
      // ignore
    }
  };

  // Submit Handler: Quick Client
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) {
      setClientError("اسم العميل مطلوب");
      return;
    }
    try {
      setIsClientSubmitting(true);
      setClientError(null);
      const driver = await getDatabaseDriver();
      const repo = new ClientRepository(driver);
      await repo.create({
        name: clientName.trim(),
        companyName: clientCompany.trim() || undefined,
        phone: clientPhone.trim() || undefined,
        notes: clientNotes.trim() || undefined,
      });
      setClientName("");
      setClientCompany("");
      setClientPhone("");
      setClientNotes("");
      setMode("compact");
      if (onDataMutated) onDataMutated("تم تسجيل العميل بنجاح");
    } catch (err: unknown) {
      setClientError(err instanceof Error ? err.message : "حدث خطأ أثناء حفظ العميل");
    } finally {
      setIsClientSubmitting(false);
    }
  };

  // Submit Handler: Quick Payment
  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentClientId) {
      setPaymentError("يرجى اختيار العميل");
      return;
    }
    const val = parseFloat(paymentAmount);
    if (isNaN(val) || val <= 0) {
      setPaymentError("يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    try {
      setIsPaymentSubmitting(true);
      setPaymentError(null);
      const piasters = Math.round(val * 100);
      const driver = await getDatabaseDriver();
      const repo = new PaymentRepository(driver);
      await repo.recordPayment({
        clientId: paymentClientId,
        amount: piasters,
        date: paymentDate,
        method: paymentMethod,
        note: paymentNote.trim() || undefined,
        receiptPath: paymentReceipt.trim() || undefined,
        targets: [],
      });
      setPaymentAmount("");
      setPaymentNote("");
      setPaymentReceipt("");
      setMode("compact");
      if (onDataMutated) onDataMutated("تم تسجيل الدفعة وإيداعها في رصيد العميل بنجاح");
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : "حدث خطأ أثناء تسجيل الدفعة");
    } finally {
      setIsPaymentSubmitting(false);
    }
  };

  // Submit Handler: Quick Expense
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseDesc.trim()) {
      setExpenseError("بيان المصروف مطلوب");
      return;
    }
    const val = parseFloat(expenseAmount);
    if (isNaN(val) || val <= 0) {
      setExpenseError("يرجى إدخال مبلغ صحيح أكبر من صفر");
      return;
    }
    try {
      setIsExpenseSubmitting(true);
      setExpenseError(null);
      const piasters = Math.round(val * 100);
      const driver = await getDatabaseDriver();
      const repo = new ExpenseRepository(driver);
      await repo.createExpense({
        amount: piasters,
        date: expenseDate,
        category: expenseCategory,
        description: expenseDesc.trim(),
        note: expenseNote.trim() || undefined,
        receiptPath: expenseReceipt.trim() || undefined,
      });
      setExpenseAmount("");
      setExpenseDesc("");
      setExpenseNote("");
      setExpenseReceipt("");
      setMode("compact");
      if (onDataMutated) onDataMutated("تم تسجيل المصروف بنجاح");
    } catch (err: unknown) {
      setExpenseError(err instanceof Error ? err.message : "حدث خطأ أثناء تسجيل المصروف");
    } finally {
      setIsExpenseSubmitting(false);
    }
  };

  // Submit Handler: Quick Contract
  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contractClientId) {
      setContractError("يرجى اختيار العميل");
      return;
    }
    const val = parseFloat(contractAmount);
    if (isNaN(val) || val <= 0) {
      setContractError("يرجى إدخال اشتراك شهري صحيح أكبر من صفر");
      return;
    }
    if (!contractStartDate) {
      setContractError("تاريخ بدء العقد مطلوب");
      return;
    }
    if (contractEndDate && contractEndDate < contractStartDate) {
      setContractError("تاريخ الانتهاء لا يمكن أن يسبق تاريخ البدء");
      return;
    }
    try {
      setIsContractSubmitting(true);
      setContractError(null);
      const monthlyAmountPiasters = Math.round(val * 100);
      const driver = await getDatabaseDriver();
      const repo = new ContractRepository(driver);
      const newContract = await repo.createMarketingContract({
        clientId: contractClientId,
        monthlyAmount: monthlyAmountPiasters,
        startDate: contractStartDate,
        endDate: contractEndDate.trim() || undefined,
        notes: contractNotes.trim() || undefined,
        status: "active",
      });

      if (contractInitialDue) {
        const parts = contractStartDate.split("-");
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        await repo.generateMonthlyDue(newContract.id, year, month, contractStartDate);
      }

      setContractAmount("");
      setContractNotes("");
      setContractEndDate("");
      setMode("compact");
      if (onDataMutated) onDataMutated("تم إنشاء عقد التسويق وتوليد المستحقات بنجاح");
    } catch (err: unknown) {
      setContractError(err instanceof Error ? err.message : "حدث خطأ أثناء إنشاء العقد");
    } finally {
      setIsContractSubmitting(false);
    }
  };

  // Submit Handler: Quick Subscription
  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subClientId) {
      setSubError("يرجى اختيار العميل");
      return;
    }
    if (!subServiceName.trim()) {
      setSubError("يرجى إدخال اسم الخدمة أو الأداة");
      return;
    }
    const val = parseFloat(subAmount);
    if (isNaN(val) || val <= 0) {
      setSubError("يرجى إدخال تكلفة اشتراك صحيحة أكبر من صفر");
      return;
    }
    try {
      setIsSubSubmitting(true);
      setSubError(null);
      const monthlyAmountPiasters = Math.round(val * 100);
      const driver = await getDatabaseDriver();
      await createSubscription(driver, {
        clientId: subClientId,
        serviceName: subServiceName.trim(),
        monthlyAmount: monthlyAmountPiasters,
        billingDay: subBillingDay,
        startDate: subStartDate,
        endDate: subEndDate.trim() || undefined,
        notes: subNotes.trim() || undefined,
      });

      setSubServiceName("");
      setSubAmount("");
      setSubNotes("");
      setSubEndDate("");
      setMode("compact");
      if (onDataMutated) onDataMutated("تم إنشاء الاشتراك الدوري بنجاح");
    } catch (err: unknown) {
      setSubError(err instanceof Error ? err.message : "حدث خطأ أثناء حفظ الاشتراك");
    } finally {
      setIsSubSubmitting(false);
    }
  };

  // Submit Handler: Quick Website Project
  const handleCreateWebsite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webClientId) {
      setWebError("يرجى اختيار العميل");
      return;
    }
    if (!webName.trim()) {
      setWebError("يرجى إدخال اسم المشروع أو النطاق");
      return;
    }
    const val = parseFloat(webPrice);
    if (isNaN(val) || val <= 0) {
      setWebError("يرجى إدخال إجمالي تكلفة المشروع صحيحة");
      return;
    }
    try {
      setIsWebSubmitting(true);
      setWebError(null);
      const totalPricePiasters = Math.round(val * 100);
      const nextAmountVal = parseFloat(webNextAmount);
      const nextAmountPiasters = !isNaN(nextAmountVal) && nextAmountVal > 0 ? Math.round(nextAmountVal * 100) : undefined;

      const driver = await getDatabaseDriver();
      const repo = new ContractRepository(driver);
      await repo.createWebsiteProject({
        clientId: webClientId,
        name: webName.trim(),
        totalPrice: totalPricePiasters,
        startDate: webStartDate,
        expectedDeliveryDate: webDeliveryDate.trim() || undefined,
        nextPaymentAmount: nextAmountPiasters,
        nextPaymentDate: webNextDate.trim() || undefined,
        notes: webNotes.trim() || undefined,
      });

      setWebName("");
      setWebPrice("");
      setWebNextAmount("");
      setWebNextDate("");
      setWebDeliveryDate("");
      setWebNotes("");
      setMode("compact");
      if (onDataMutated) onDataMutated("تم إنشاء مشروع الموقع بنجاح");
    } catch (err: unknown) {
      setWebError(err instanceof Error ? err.message : "حدث خطأ أثناء إنشاء المشروع");
    } finally {
      setIsWebSubmitting(false);
    }
  };

  // Submit Handler: Sell Package to Client
  const handleSellPackage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!buyClientId) {
      setBuyError("يرجى اختيار العميل");
      return;
    }
    if (!buyNameSnapshot.trim()) {
      setBuyError("يرجى إدخال اسم الباقة");
      return;
    }
    const priceVal = parseFloat(buyPrice);
    if (isNaN(priceVal) || priceVal < 0) {
      setBuyError("يرجى إدخال سعر بيع صحيح");
      return;
    }
    const numHours = parseFloat(buyHours) || 0;
    const numReels = parseInt(buyReels, 10) || 0;
    if (numHours <= 0 && numReels <= 0) {
      setBuyError("يجب أن تشتمل الباقة على رصيد ساعات استوديو أو رصيد ريلز على الأقل");
      return;
    }
    try {
      setIsBuySubmitting(true);
      setBuyError(null);
      const driver = await getDatabaseDriver();
      await sellPackageToClient(driver, {
        clientId: buyClientId,
        packageTemplateId: buyTemplateId === "custom" || !buyTemplateId ? undefined : buyTemplateId,
        nameSnapshot: buyNameSnapshot.trim(),
        soldPricePiasters: Math.round(priceVal * 100),
        purchasedAt: buyDate,
        hoursMinutes: Math.round(numHours * 60),
        reelsCount: numReels,
        notes: buyNotes.trim() || undefined,
      });

      setBuyNameSnapshot("");
      setBuyPrice("");
      setBuyHours("");
      setBuyReels("");
      setBuyNotes("");
      setMode("compact");
      if (onDataMutated) onDataMutated("تم بيع الباقة للعميل وتوليد بنود الاستهلاك والريلز بنجاح");
    } catch (err: unknown) {
      setBuyError(err instanceof Error ? err.message : "حدث خطأ أثناء بيع الباقة");
    } finally {
      setIsBuySubmitting(false);
    }
  };

  // Submit Handler: Create Package Template
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplName.trim()) {
      setTplError("يرجى كتابة اسم الباقة");
      return;
    }
    const priceVal = parseFloat(tplPrice);
    if (isNaN(priceVal) || priceVal <= 0) {
      setTplError("يرجى إدخال سعر بيع افتراضي صحيح");
      return;
    }
    const numHours = parseFloat(tplHours) || 0;
    const numReels = parseInt(tplReels, 10) || 0;
    if (numHours <= 0 && numReels <= 0) {
      setTplError("يجب أن تشتمل الباقة على رصيد ساعات أو رصيد ريلز على الأقل");
      return;
    }
    try {
      setIsTplSubmitting(true);
      setTplError(null);
      const driver = await getDatabaseDriver();
      await savePackageTemplate(driver, {
        name: tplName.trim(),
        defaultPricePiasters: Math.round(priceVal * 100),
        hoursMinutes: Math.round(numHours * 60),
        reelsCount: numReels,
        active: 1,
      });

      setTplName("");
      setTplPrice("");
      setTplHours("");
      setTplReels("");
      setMode("compact");
      if (onDataMutated) onDataMutated("تم حفظ قالب الباقة المعتمد بنجاح");
    } catch (err: unknown) {
      setTplError(err instanceof Error ? err.message : "حدث خطأ أثناء حفظ القالب");
    } finally {
      setIsTplSubmitting(false);
    }
  };

  // Submit Handler: Create Reel
  const handleCreateReel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reelClientId) {
      setReelError("يرجى اختيار العميل");
      return;
    }
    if (!reelTitle.trim()) {
      setReelError("يرجى إدخال عنوان أو فكرة الريل");
      return;
    }
    try {
      setIsReelSubmitting(true);
      setReelError(null);
      const driver = await getDatabaseDriver();
      await saveReel(driver, {
        clientId: reelClientId,
        clientPackageId: reelPackageId.trim() || undefined,
        title: reelTitle.trim(),
        status: reelStage,
        targetDate: reelTargetDate,
        notes: reelNotes.trim() || undefined,
      });

      setReelTitle("");
      setReelNotes("");
      setReelPackageId("");
      setMode("compact");
      if (onDataMutated) onDataMutated("تمت إضافة الريل إلى قمع الإنتاج بنجاح");
    } catch (err: unknown) {
      setReelError(err instanceof Error ? err.message : "حدث خطأ أثناء حفظ الريل");
    } finally {
      setIsReelSubmitting(false);
    }
  };

  const getNotificationIcon = () => {
    switch (notificationType) {
      case "success":
        return <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />;
      case "warning":
        return <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />;
      default:
        return <Info className="w-4 h-4 text-blue-600 shrink-0" />;
    }
  };

  const isFormMode = mode.startsWith("form-");

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex justify-center p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pointer-events-none"
      dir="rtl"
    >
      <motion.div
        ref={headerRef}
        layout
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className={`pointer-events-auto bg-white border border-[#E5E5E5] shadow-sm transition-colors select-none ${
          hasNotification
            ? "w-[92vw] md:w-[460px] min-h-[44px] rounded-full px-4 py-2 flex items-center justify-start border-blue-500/30"
            : mode === "compact"
            ? "w-auto h-[44px] rounded-full px-4 flex items-center justify-center cursor-pointer hover:border-gray-300 hover:shadow-md"
            : isFormMode
            ? "w-[94vw] md:w-[620px] max-h-[85vh] overflow-y-auto rounded-[2rem] p-5 shadow-xl flex flex-col"
            : "w-[94vw] md:w-[600px] rounded-[2rem] p-5 shadow-lg flex flex-col"
        }`}
        onClick={() => {
          if (!hasNotification && mode === "compact") setMode("menu");
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {/* 1. NOTIFICATION STATE */}
          {hasNotification ? (
            <motion.div
              key="notification"
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-3 w-full"
            >
              {getNotificationIcon()}
              <p className="text-xs md:text-sm font-medium text-[#1A1A1A] truncate flex-1">
                {notificationMessage}
              </p>
              {onDismissNotification && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismissNotification();
                  }}
                  aria-label="إغلاق"
                  className="h-7 w-7 shrink-0 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-400 hover:text-neutral-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          ) : mode === "compact" ? (
            /* 2. COMPACT MORPHING CAPSULE */
            <motion.div
              key="compact"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex items-center gap-2.5 h-full"
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center ${activeItem.colorClass}`}>
                <ActiveIcon className="w-3.5 h-3.5" />
              </div>
              <span className="text-xs md:text-sm font-bold text-[#1A1A1A]">
                {activeItem.label}
              </span>
            </motion.div>
          ) : mode === "menu" ? (
            /* 3. MENU EXPANDED VIEW */
            <motion.div
              key="menu"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header Top Controls */}
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${activeItem.colorClass}`}>
                    <ActiveIcon className="w-3.5 h-3.5" />
                  </div>
                  <span className="text-xs font-bold text-[#1A1A1A]">أقسام النظام</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setMode("search")}
                    className="h-8 px-2.5 rounded-full hover:bg-neutral-100 text-neutral-600 flex items-center gap-1.5 text-xs font-medium transition-colors"
                    title="بحث سريع (Ctrl+K)"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>بحث</span>
                  </button>

                  <button
                    onClick={() => setMode("actions")}
                    className="h-8 px-3 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-800 flex items-center gap-1.5 text-xs font-bold transition-colors"
                    title="إجراء سريع"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#004AC6]" />
                    <span>إجراء</span>
                  </button>

                  <button
                    onClick={() => setMode("compact")}
                    className="h-8 w-8 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center transition-colors mr-1"
                    title="تصغير"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Navigation Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 pt-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id === activeSection;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onSelectSection(item.id);
                        setMode("compact");
                      }}
                      className={`flex flex-col items-center justify-center p-3 rounded-2xl border transition-all text-center group cursor-pointer ${
                        isActive
                          ? "border-[#004AC6] bg-blue-50/40 shadow-sm"
                          : "border-neutral-100 hover:border-neutral-200 hover:bg-neutral-50"
                      }`}
                    >
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center mb-1.5 transition-transform group-hover:scale-105 ${item.colorClass}`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <span
                        className={`text-xs font-semibold block truncate w-full ${
                          isActive ? "text-[#004AC6] font-bold" : "text-[#1A1A1A]"
                        }`}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : mode === "search" ? (
            /* 4. SEARCH MODE - HEADER MORPHS INTO REAL-TIME SEARCH BOX */
            <motion.div
              key="search"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search Bar Input Row */}
              <div className="flex items-center gap-3">
                <Search className="w-4 h-4 text-[#004AC6] shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالاسم، الشركة، أو العقد..."
                  className="grow h-10 bg-transparent border-none text-sm text-[#1A1A1A] placeholder-neutral-400 focus:outline-none font-sans"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setMode("compact")}
                  className="h-8 px-3 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                >
                  إلغاء
                </button>
              </div>

              {/* Search Results Dropdown Area */}
              <div className="border-t border-neutral-100 pt-2 min-h-[140px] max-h-[260px] overflow-y-auto">
                {isSearching ? (
                  <div className="py-6 text-center text-xs text-neutral-400">جاري البحث في قاعدة البيانات...</div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-1">
                    {searchResults.map((res) => (
                      <button
                        key={`${res.type}-${res.id}`}
                        onClick={() => {
                          onSelectSection(res.section);
                          setMode("compact");
                        }}
                        className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-neutral-50 transition-colors text-right"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block text-xs font-bold text-[#1A1A1A] truncate">{res.title}</span>
                          <span className="block text-[11px] text-neutral-400 truncate">{res.subtitle}</span>
                        </div>
                        <span className="text-[10px] font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full shrink-0 mr-2">
                          {res.typeLabel}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : searchQuery.trim() ? (
                  <div className="py-6 text-center text-xs text-neutral-400">لا توجد نتائج تطابق بحثك</div>
                ) : (
                  <div className="py-5 text-center text-xs text-neutral-400 space-y-2">
                    <p>اكتب اسم العميل، رقم الهاتف، أو العقد للوصول السريع</p>
                    <div className="flex justify-center gap-2 pt-1">
                      <button
                        onClick={() => { onSelectSection("clients"); setMode("compact"); }}
                        className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-[11px] font-semibold"
                      >
                        العملاء
                      </button>
                      <button
                        onClick={() => { onSelectSection("contracts"); setMode("compact"); }}
                        className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-600 text-[11px] font-semibold"
                      >
                        العقود
                      </button>
                      <button
                        onClick={() => { onSelectSection("finance"); setMode("compact"); }}
                        className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-semibold"
                      >
                        المالية
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          ) : mode === "actions" ? (
            /* 5. ACTIONS MODE - QUICK ACTIONS GRID */
            <motion.div
              key="actions"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("menu")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للقائمة"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-[#1A1A1A]">إجراء سريع</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Grid of Quick Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 max-h-[360px] overflow-y-auto">
                {QUICK_ACTIONS.map((act) => {
                  const Icon = act.icon;
                  return (
                    <button
                      key={act.id}
                      onClick={() => {
                        if (act.id === "new-client") setMode("form-client");
                        else if (act.id === "new-payment") setMode("form-payment");
                        else if (act.id === "new-expense") setMode("form-expense");
                        else if (act.id === "new-contract") setMode("form-contract");
                        else if (act.id === "new-subscription") setMode("form-subscription");
                        else if (act.id === "new-website") setMode("form-website");
                        else if (act.id === "new-package") setMode("form-package-buy");
                        else if (act.id === "new-package-template") setMode("form-package-template");
                        else if (act.id === "new-reel") setMode("form-reel");
                        else {
                          setMode("compact");
                          if (onOpenQuickAddAction) onOpenQuickAddAction(act.id);
                        }
                      }}
                      className="flex items-center gap-3 p-2.5 rounded-2xl border border-neutral-100 hover:bg-neutral-50 hover:border-neutral-200 transition-all text-right"
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${act.colorClass}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block text-xs font-bold text-[#1A1A1A]">{act.title}</span>
                        <span className="block text-[10px] text-neutral-400 truncate">{act.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : mode === "form-client" ? (
            /* 6. EMBEDDED FORM: CLIENT */
            <motion.div
              key="form-client"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("actions")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للإجراءات"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-[#1A1A1A]">عميل جديد</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleCreateClient} className="space-y-3">
                {clientError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {clientError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">اسم العميل *</label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="مثال: أحمد محمد"
                    className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">الشركة أو العلامة التجارية</label>
                    <input
                      type="text"
                      value={clientCompany}
                      onChange={(e) => setClientCompany(e.target.value)}
                      placeholder="اسم الشركة إن وجد..."
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">رقم الهاتف</label>
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="010XXXXXXXX"
                      dir="ltr"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] text-right focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">ملاحظات إضافية</label>
                  <input
                    type="text"
                    value={clientNotes}
                    onChange={(e) => setClientNotes(e.target.value)}
                    placeholder="أي تفاصيل خاصة بالعميل..."
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setMode("compact")}
                    className="h-9 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                  >
                    إلغاء
                  </button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    isLoading={isClientSubmitting}
                  >
                    حفظ العميل
                  </Button>
                </div>
              </form>
            </motion.div>
          ) : mode === "form-payment" ? (
            /* 7. EMBEDDED FORM: PAYMENT */
            <motion.div
              key="form-payment"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("actions")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للإجراءات"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-[#1A1A1A]">تسجيل دفعة نقدية</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleCreatePayment} className="space-y-3">
                {paymentError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {paymentError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">العميل المستلم منه *</label>
                    <Select
                      value={paymentClientId}
                      onValueChange={(val) => setPaymentClientId(val)}
                      options={clientsList.map((c) => ({
                        value: c.id,
                        label: `${c.name} ${c.company_name ? `(${c.company_name})` : ""}`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">المبلغ بالجنيه *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="مثال: 5000"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تاريخ الاستلام</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">طريقة الدفع</label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(val) => setPaymentMethod(val as PaymentMethod)}
                      options={[
                        { value: "cash", label: "نقداً (Cash)" },
                        { value: "bank_transfer", label: "تحويل بنكي (Bank)" },
                        { value: "instapay", label: "إنستاباي (InstaPay)" },
                        { value: "vodafone_cash", label: "فودافون كاش (VF Cash)" },
                        { value: "check", label: "شيك (Check)" },
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">ملاحظة الدفعة</label>
                  <input
                    type="text"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    placeholder="رقم مرجعي أو بيان للدفعة..."
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setMode("compact")}
                    className="h-9 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                  >
                    إلغاء
                  </button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    isLoading={isPaymentSubmitting}
                  >
                    تسجيل وإيداع بالرصيد
                  </Button>
                </div>
              </form>
            </motion.div>
          ) : mode === "form-expense" ? (
            /* 8. EMBEDDED FORM: EXPENSE */
            <motion.div
              key="form-expense"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("actions")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للإجراءات"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-[#1A1A1A]">تسجيل مصروف جديد</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleCreateExpense} className="space-y-3">
                {expenseError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {expenseError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تصنيف المصروف *</label>
                    <Select
                      value={expenseCategory}
                      onValueChange={(val) => setExpenseCategory(val as ExpenseCategory)}
                      options={CATEGORY_OPTIONS.map((cat) => ({
                        value: cat.id,
                        label: cat.label,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">المبلغ بالجنيه *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="مثال: 1200"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">بيان المصروف *</label>
                    <input
                      type="text"
                      value={expenseDesc}
                      onChange={(e) => setExpenseDesc(e.target.value)}
                      placeholder="تفاصيل المصروف..."
                      className="w-full h-10 px-3.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تاريخ الصرف</label>
                    <input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">ملاحظات إضافية</label>
                  <input
                    type="text"
                    value={expenseNote}
                    onChange={(e) => setExpenseNote(e.target.value)}
                    placeholder="أي توضيحات للمحاسبة..."
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setMode("compact")}
                    className="h-9 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                  >
                    إلغاء
                  </button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    isLoading={isExpenseSubmitting}
                  >
                    حفظ المصروف
                  </Button>
                </div>
              </form>
            </motion.div>
          ) : mode === "form-contract" ? (
            /* 9. EMBEDDED FORM: MARKETING CONTRACT */
            <motion.div
              key="form-contract"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("actions")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للإجراءات"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-[#1A1A1A]">عقد تسويق جديد</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleCreateContract} className="space-y-3">
                {contractError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {contractError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">العميل *</label>
                    <Select
                      value={contractClientId}
                      onValueChange={(val) => setContractClientId(val)}
                      options={clientsList.map((c) => ({
                        value: c.id,
                        label: `${c.name} ${c.company_name ? `(${c.company_name})` : ""}`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">الاشتراك الشهري بالجنيه *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={contractAmount}
                      onChange={(e) => setContractAmount(e.target.value)}
                      placeholder="مثال: 10000"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تاريخ بدء العقد *</label>
                    <input
                      type="date"
                      value={contractStartDate}
                      onChange={(e) => setContractStartDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تاريخ الانتهاء (اختياري)</label>
                    <input
                      type="date"
                      value={contractEndDate}
                      onChange={(e) => setContractEndDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="contractInitialDue"
                    checked={contractInitialDue}
                    onChange={(e) => setContractInitialDue(e.target.checked)}
                    className="w-4 h-4 rounded text-[#004AC6] focus:outline-none"
                  />
                  <label htmlFor="contractInitialDue" className="text-xs text-neutral-700 cursor-pointer select-none">
                    توليد مستحق مالي تلقائي لشهر البداية الحالي
                  </label>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">ملاحظات العقد</label>
                  <input
                    type="text"
                    value={contractNotes}
                    onChange={(e) => setContractNotes(e.target.value)}
                    placeholder="شروط خاصة أو نطاق العمل..."
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setMode("compact")}
                    className="h-9 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                  >
                    إلغاء
                  </button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    isLoading={isContractSubmitting}
                  >
                    إنشاء العقد
                  </Button>
                </div>
              </form>
            </motion.div>
          ) : mode === "form-subscription" ? (
            /* 10. EMBEDDED FORM: RECURRING SUBSCRIPTION */
            <motion.div
              key="form-subscription"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("actions")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للإجراءات"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-[#1A1A1A]">اشتراك دوري جديد</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleCreateSubscription} className="space-y-3">
                {subError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {subError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">العميل *</label>
                    <Select
                      value={subClientId}
                      onValueChange={(val) => setSubClientId(val)}
                      options={clientsList.map((c) => ({
                        value: c.id,
                        label: `${c.name} ${c.company_name ? `(${c.company_name})` : ""}`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">اسم الخدمة أو الأداة *</label>
                    <input
                      type="text"
                      value={subServiceName}
                      onChange={(e) => setSubServiceName(e.target.value)}
                      placeholder="مثال: استضافة سيرفر، أداة ذكاء اصطناعي..."
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">التكلفة الشهرية بالجنيه *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={subAmount}
                      onChange={(e) => setSubAmount(e.target.value)}
                      placeholder="مثال: 500"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">يوم الفاتورة شهرياً</label>
                    <input
                      type="number"
                      min={1}
                      max={28}
                      value={subBillingDay}
                      onChange={(e) => setSubBillingDay(parseInt(e.target.value, 10) || 1)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تاريخ البدء</label>
                    <input
                      type="date"
                      value={subStartDate}
                      onChange={(e) => setSubStartDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">ملاحظات الاشتراك</label>
                  <input
                    type="text"
                    value={subNotes}
                    onChange={(e) => setSubNotes(e.target.value)}
                    placeholder="رابط المنصة أو بيانات الحساب..."
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setMode("compact")}
                    className="h-9 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                  >
                    إلغاء
                  </button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    isLoading={isSubSubmitting}
                  >
                    حفظ الاشتراك
                  </Button>
                </div>
              </form>
            </motion.div>
          ) : mode === "form-website" ? (
            /* 11. EMBEDDED FORM: WEBSITE PROJECT */
            <motion.div
              key="form-website"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("actions")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للإجراءات"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-[#1A1A1A]">مشروع موقع جديد</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleCreateWebsite} className="space-y-3">
                {webError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {webError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">العميل *</label>
                    <Select
                      value={webClientId}
                      onValueChange={(val) => setWebClientId(val)}
                      options={clientsList.map((c) => ({
                        value: c.id,
                        label: `${c.name} ${c.company_name ? `(${c.company_name})` : ""}`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">اسم المشروع *</label>
                    <input
                      type="text"
                      value={webName}
                      onChange={(e) => setWebName(e.target.value)}
                      placeholder="مثال: متجر إلكتروني لماركة كذا"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">إجمالي السعر بالجنيه *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={webPrice}
                      onChange={(e) => setWebPrice(e.target.value)}
                      placeholder="مثال: 30000"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تاريخ البدء</label>
                    <input
                      type="date"
                      value={webStartDate}
                      onChange={(e) => setWebStartDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تاريخ التسليم المتوقع</label>
                    <input
                      type="date"
                      value={webDeliveryDate}
                      onChange={(e) => setWebDeliveryDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">دفعة المرحلة القادمة بالجنيه</label>
                    <input
                      type="number"
                      step="0.01"
                      value={webNextAmount}
                      onChange={(e) => setWebNextAmount(e.target.value)}
                      placeholder="مثال: 15000"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تاريخ استحقاق الدفعة القادمة</label>
                    <input
                      type="date"
                      value={webNextDate}
                      onChange={(e) => setWebNextDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">ملاحظات ونطاق العمل</label>
                  <input
                    type="text"
                    value={webNotes}
                    onChange={(e) => setWebNotes(e.target.value)}
                    placeholder="مراحل التسليم، الدومين، المتطلبات..."
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setMode("compact")}
                    className="h-9 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                  >
                    إلغاء
                  </button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    isLoading={isWebSubmitting}
                  >
                    إنشاء المشروع
                  </Button>
                </div>
              </form>
            </motion.div>
          ) : mode === "form-package-buy" ? (
            /* 12. EMBEDDED FORM: BUY / SELL PACKAGE */
            <motion.div
              key="form-package-buy"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("actions")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للإجراءات"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-[#1A1A1A]">بيع باقة لعميل</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleSellPackage} className="space-y-3">
                {buyError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {buyError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">العميل المشتري *</label>
                    <Select
                      value={buyClientId}
                      onValueChange={(val) => setBuyClientId(val)}
                      options={clientsList.map((c) => ({
                        value: c.id,
                        label: `${c.name} ${c.company_name ? `(${c.company_name})` : ""}`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">قالب الباقة (اختياري)</label>
                    <Select
                      value={buyTemplateId}
                      onValueChange={(val) => {
                        setBuyTemplateId(val);
                        if (val === "custom") {
                          setBuyNameSnapshot("باقة مخصصة");
                          setBuyPrice("");
                          setBuyHours("");
                          setBuyReels("");
                        } else {
                          const tpl = templatesList.find((t) => t.id === val);
                          if (tpl) {
                            setBuyNameSnapshot(tpl.name);
                            setBuyPrice(String(tpl.default_price / 100));
                            setBuyHours(tpl.hoursMinutes > 0 ? String(tpl.hoursMinutes / 60) : "0");
                            setBuyReels(String(tpl.reelsCount || 0));
                          }
                        }
                      }}
                      options={[
                        { value: "custom", label: "-- باقة مخصصة بدون قالب --" },
                        ...templatesList.map((t) => ({
                          value: t.id,
                          label: `${t.name} (${(t.default_price / 100).toLocaleString("ar-EG")} ج.م)`,
                        })),
                      ]}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">اسم الباقة (لقطة ثابتة) *</label>
                    <input
                      type="text"
                      value={buyNameSnapshot}
                      onChange={(e) => setBuyNameSnapshot(e.target.value)}
                      placeholder="مثال: باقة بلاتينيوم 10 ساعات + 4 ريلز"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">سعر البيع المتفق عليه بالجنيه *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={buyPrice}
                      onChange={(e) => setBuyPrice(e.target.value)}
                      placeholder="مثال: 8000"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">ساعات الاستوديو</label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      value={buyHours}
                      onChange={(e) => setBuyHours(e.target.value)}
                      placeholder="مثال: 10"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">عدد الريلز</label>
                    <input
                      type="number"
                      step="1"
                      min={0}
                      value={buyReels}
                      onChange={(e) => setBuyReels(e.target.value)}
                      placeholder="مثال: 4"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">تاريخ الشراء</label>
                    <input
                      type="date"
                      value={buyDate}
                      onChange={(e) => setBuyDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">ملاحظات إضافية</label>
                  <input
                    type="text"
                    value={buyNotes}
                    onChange={(e) => setBuyNotes(e.target.value)}
                    placeholder="أي اتفاقيات خاصة بالباقة..."
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setMode("compact")}
                    className="h-9 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                  >
                    إلغاء
                  </button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    isLoading={isBuySubmitting}
                  >
                    إتمام بيع وتفعيل الباقة
                  </Button>
                </div>
              </form>
            </motion.div>
          ) : mode === "form-package-template" ? (
            /* 13. EMBEDDED FORM: PACKAGE TEMPLATE */
            <motion.div
              key="form-package-template"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("actions")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للإجراءات"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-[#1A1A1A]">إنشاء قالب باقة معتمد</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleCreateTemplate} className="space-y-3">
                {tplError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {tplError}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">اسم قالب الباقة *</label>
                  <input
                    type="text"
                    value={tplName}
                    onChange={(e) => setTplName(e.target.value)}
                    placeholder="مثال: باقة المحترفين 20 ساعة"
                    className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">السعر الافتراضي بالجنيه *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={tplPrice}
                      onChange={(e) => setTplPrice(e.target.value)}
                      placeholder="مثال: 12000"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">ساعات الاستوديو</label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      value={tplHours}
                      onChange={(e) => setTplHours(e.target.value)}
                      placeholder="مثال: 20"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">عدد الريلز</label>
                    <input
                      type="number"
                      step="1"
                      min={0}
                      value={tplReels}
                      onChange={(e) => setTplReels(e.target.value)}
                      placeholder="مثال: 8"
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setMode("compact")}
                    className="h-9 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                  >
                    إلغاء
                  </button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    isLoading={isTplSubmitting}
                  >
                    حفظ القالب
                  </Button>
                </div>
              </form>
            </motion.div>
          ) : (
            /* 14. EMBEDDED FORM: REEL */
            <motion.div
              key="form-reel"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 border-b border-neutral-100">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setMode("actions")}
                    className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500"
                    title="رجوع للإجراءات"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="text-sm font-bold text-[#1A1A1A]">إضافة ريلز جديد</span>
                </div>
                <button
                  onClick={() => setMode("compact")}
                  className="h-7 w-7 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <form onSubmit={handleCreateReel} className="space-y-3">
                {reelError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs font-medium">
                    {reelError}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">العميل *</label>
                    <Select
                      value={reelClientId}
                      onValueChange={(val) => handleReelClientChange(val)}
                      options={clientsList.map((c) => ({
                        value: c.id,
                        label: `${c.name} ${c.company_name ? `(${c.company_name})` : ""}`,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">ربط بباقة العميل (اختياري)</label>
                    <Select
                      value={reelPackageId}
                      onValueChange={(val) => setReelPackageId(val)}
                      options={[
                        { value: "", label: "-- بدون باقة / إنتاج مستقل --" },
                        ...clientPackagesList.map((pkg) => {
                          const reelItem = pkg.items?.find((i) => i.unit === "reels");
                          const remaining = reelItem
                            ? reelItem.purchased_quantity - reelItem.used_quantity - reelItem.reserved_quantity
                            : 0;
                          return {
                            value: pkg.id,
                            label: `${pkg.name_snapshot} (${remaining} ريلز متبقي)`,
                          };
                        }),
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">عنوان أو فكرة الريل *</label>
                  <input
                    type="text"
                    value={reelTitle}
                    onChange={(e) => setReelTitle(e.target.value)}
                    placeholder="مثال: فيديو ترويجي لمنتج الصيف..."
                    className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    autoFocus
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">المرحلة في القمع</label>
                    <Select
                      value={reelStage}
                      onValueChange={(val) => setReelStage(val as ReelStage)}
                      options={REEL_STAGES.map((st) => ({
                        value: st.id,
                        label: st.title,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 mb-1">التاريخ المستهدف للتسليم</label>
                    <input
                      type="date"
                      value={reelTargetDate}
                      onChange={(e) => setReelTargetDate(e.target.value)}
                      className="w-full h-11 px-3.5 rounded-full border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-600 mb-1">ملاحظات ورابط السكربت</label>
                  <input
                    type="text"
                    value={reelNotes}
                    onChange={(e) => setReelNotes(e.target.value)}
                    placeholder="ملاحظات المونتاج، تفاصيل التصوير..."
                    className="w-full h-10 px-3.5 rounded-xl border border-[#E5E5E5] text-xs font-medium text-[#1A1A1A] focus:outline-none focus:border-[#004AC6]"
                  />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
                  <button
                    type="button"
                    onClick={() => setMode("compact")}
                    className="h-9 px-4 rounded-full bg-neutral-100 hover:bg-neutral-200 text-xs font-semibold text-neutral-600"
                  >
                    إلغاء
                  </button>
                  <Button
                    type="submit"
                    variant="brand"
                    size="sm"
                    isLoading={isReelSubmitting}
                  >
                    إضافة الريل
                  </Button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </header>
  );
};
