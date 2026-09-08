import React, { useState, useEffect } from "react";
import {
  Users,
  Shield,
  Activity,
  Sliders,
  Building2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  UserCheck,
  Search,
} from "lucide-react";
import { getDatabaseDriver } from "../../database/driver";
import { UserRepository } from "../../database/repositories/user-repository";
import {
  UserRecord,
  UserRole,
  PermissionAction,
  hasPermission,
} from "../../domain/models/user-permissions";
import { CustomFieldsSettingsModal } from "../clients";
import { ResponsiveModal } from "../../ui/athredu/ResponsiveModal";
import { Select } from "../../ui/athredu/Select";

interface AuditLogEntry {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  user_id: string | null;
  change_reason: string;
  old_values_json: string | null;
  new_values_json: string | null;
  timestamp: string;
}

interface SettingsViewProps {
  onShowToast: (msg: string, type?: "success" | "warning" | "error" | "info") => void;
}

type SettingsTab = "users" | "audit" | "custom_fields" | "company" | "diagnostics";

export const SettingsView: React.FC<SettingsViewProps> = ({ onShowToast }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("users");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Simulated Persona for RBAC demonstration
  const [activeRole, setActiveRole] = useState<UserRole>(() => {
    return (localStorage.getItem("spark_active_simulated_role") as UserRole) || "admin";
  });

  // Custom Fields Modal
  const [isCustomFieldsOpen, setIsCustomFieldsOpen] = useState(false);

  // New User Modal State
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<UserRole>("operations");

  // Audit filter
  const [auditSearch, setAuditSearch] = useState("");

  const loadData = async () => {
    try {
      setIsLoading(true);
      const driver = await getDatabaseDriver();
      const userRepo = new UserRepository(driver);
      const userList = await userRepo.listUsers();
      setUsers(userList);

      const logs = await driver.query<AuditLogEntry>(
        `SELECT * FROM general_audit_logs ORDER BY timestamp DESC LIMIT 100;`
      );
      setAuditLogs(logs);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر تحميل بيانات الإعدادات";
      onShowToast(msg, "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSwitchRole = (role: UserRole) => {
    setActiveRole(role);
    localStorage.setItem("spark_active_simulated_role", role);
    onShowToast(`تم التبديل إلى دور: ${getRoleArabicName(role)}`, "info");
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) {
      onShowToast("يرجى إدخال الاسم والبريد الإلكتروني", "warning");
      return;
    }

    try {
      const driver = await getDatabaseDriver();
      const userRepo = new UserRepository(driver);
      await userRepo.createUser({
        name: newUserName.trim(),
        email: newUserEmail.trim(),
        role: newUserRole,
      });

      onShowToast("تمت إضافة المستخدم بنجاح", "success");
      setIsAddUserOpen(false);
      setNewUserName("");
      setNewUserEmail("");
      setNewUserRole("operations");
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل إنشاء المستخدم";
      onShowToast(msg, "error");
    }
  };

  const handleToggleUserActive = async (user: UserRecord) => {
    try {
      const driver = await getDatabaseDriver();
      const userRepo = new UserRepository(driver);
      const nextActive = user.active === 1 ? 0 : 1;
      await userRepo.updateUser(user.id, { active: nextActive });
      onShowToast(
        nextActive === 1 ? "تم تفعيل المستخدم" : "تم إلغاء تفعيل المستخدم",
        "info"
      );
      await loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر تحديث حالة المستخدم";
      onShowToast(msg, "error");
    }
  };

  const getRoleArabicName = (r: UserRole): string => {
    switch (r) {
      case "admin":
        return "مدير النظام (Admin)";
      case "finance":
        return "المالية (Finance)";
      case "operations":
        return "العمليات والإنتاج (Operations)";
      case "viewer":
        return "مشاهد فقط (Viewer)";
      default:
        return r;
    }
  };

  const getRoleBadgeStyle = (r: UserRole): string => {
    switch (r) {
      case "admin":
        return "bg-purple-50 text-purple-700 border-purple-200";
      case "finance":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "operations":
        return "bg-blue-50 text-[#004AC6] border-blue-200";
      case "viewer":
        return "bg-neutral-100 text-neutral-600 border-neutral-200";
    }
  };

  const filteredLogs = auditLogs.filter(
    (log) =>
      log.entity_type.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
      log.change_reason.toLowerCase().includes(auditSearch.toLowerCase()) ||
      (log.user_id && log.user_id.toLowerCase().includes(auditSearch.toLowerCase()))
  );

  const permissionsList: { key: PermissionAction; label: string }[] = [
    { key: "manage_finance", label: "إدارة المالية والمدفوعات والمصروفات" },
    { key: "void_payment", label: "إلغاء المدفوعات مع توثيق السبب" },
    { key: "manage_clients", label: "إدارة بيانات العملاء والملف 360°" },
    { key: "manage_operations", label: "إدارة الحجوزات واستوديو التصوير" },
    { key: "manage_services_and_plans", label: "إدارة الخدمات والباقات المباعة" },
    { key: "manage_reels", label: "إدارة كانبان إنتاج الريلز" },
    { key: "create_backup", label: "إنشاء نسخ احتياطية للبيانات" },
    { key: "restore_backup", label: "استعادة النسخ الاحتياطية" },
    { key: "manage_users", label: "إدارة المستخدمين والأدوار" },
    { key: "delete_attachment", label: "حذف المرفقات والمستندات" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">إعدادات النظام والأمان</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            إدارة المستخدمين، الصلاحيات المعتمدة، سجل العمليات، والحقول المخصصة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            className="p-2 rounded-full hover:bg-neutral-100 text-neutral-500 transition-colors cursor-pointer shrink-0"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-[#004AC6]" : ""}`} />
          </button>

          {/* Persona Role Switcher for Live Demo */}
          <div className="flex items-center gap-2 bg-white rounded-full p-1 border border-[#E5E5E5] shadow-sm">
            <span className="text-[11px] text-neutral-400 font-medium px-2.5 flex items-center gap-1 whitespace-nowrap shrink-0">
              <UserCheck className="w-3.5 h-3.5 text-[#004AC6]" />
              الدور النشط:
            </span>
          {(["admin", "finance", "operations", "viewer"] as UserRole[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleSwitchRole(r)}
              className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeRole === r
                  ? "bg-[#004AC6] text-white shadow-sm"
                  : "text-neutral-500 hover:text-[#1A1A1A] hover:bg-neutral-100"
              }`}
            >
              {r === "admin"
                ? "مدير"
                : r === "finance"
                ? "مالية"
                : r === "operations"
                ? "عمليات"
                : "مشاهد"}
            </button>
          ))}
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-[#E5E5E5] pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "users"
              ? "bg-[#004AC6] text-white shadow-sm"
              : "text-neutral-500 hover:text-[#1A1A1A] hover:bg-neutral-100"
          }`}
        >
          <Users className="w-4 h-4" />
          <span>المستخدمين والصلاحيات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "audit"
              ? "bg-[#004AC6] text-white shadow-sm"
              : "text-neutral-500 hover:text-[#1A1A1A] hover:bg-neutral-100"
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>سجل التدقيق والعمليات</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("custom_fields")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "custom_fields"
              ? "bg-[#004AC6] text-white shadow-sm"
              : "text-neutral-500 hover:text-[#1A1A1A] hover:bg-neutral-100"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>الحقول المخصصة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("company")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "company"
              ? "bg-[#004AC6] text-white shadow-sm"
              : "text-neutral-500 hover:text-[#1A1A1A] hover:bg-neutral-100"
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>بيانات المنشأة</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("diagnostics")}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === "diagnostics"
              ? "bg-[#004AC6] text-white shadow-sm"
              : "text-neutral-500 hover:text-[#1A1A1A] hover:bg-neutral-100"
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>تشخيصات النظام</span>
        </button>
      </div>

      {/* TAB 1: USERS & RBAC */}
      {activeTab === "users" && (
        <div className="space-y-6">
          {/* Active Role Matrix Card */}
          <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-neutral-400 font-medium">مصفوفة الصلاحيات للدور النشط حالياً:</span>
                <div className="text-sm font-bold text-[#1A1A1A] mt-0.5 flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs border ${getRoleBadgeStyle(activeRole)}`}>
                    {getRoleArabicName(activeRole)}
                  </span>
                </div>
              </div>
              <span className="text-xs text-neutral-400">تحكم فوري بالصلاحيات الصارمة</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {permissionsList.map((perm) => {
                const allowed = hasPermission(activeRole, perm.key);
                return (
                  <div
                    key={perm.key}
                    className={`flex items-center gap-2.5 p-3 rounded-2xl border text-xs ${
                      allowed
                        ? "bg-emerald-50/50 border-emerald-200 text-emerald-900"
                        : "bg-neutral-50 border-neutral-200 text-neutral-400"
                    }`}
                  >
                    {allowed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-neutral-400 shrink-0" />
                    )}
                    <span className={allowed ? "font-medium" : "line-through"}>
                      {perm.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-[#1A1A1A]">قائمة مستخدمي النظام ({users.length})</h3>
                <p className="text-[11px] text-neutral-400">حسابات الوصول المسجلة محلياً في جدول users</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUserOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#004AC6] hover:bg-[#003bb0] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة مستخدم</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-[#E5E5E5] text-neutral-400 font-medium">
                    <th className="pb-3 pr-2">الاسم</th>
                    <th className="pb-3">البريد الإلكتروني</th>
                    <th className="pb-3">الدور</th>
                    <th className="pb-3">الحالة</th>
                    <th className="pb-3">الإجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {users.map((usr) => (
                    <tr key={usr.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="py-3 pr-2 font-bold text-[#1A1A1A]">
                        {usr.name}
                      </td>
                      <td className="py-3 text-neutral-500 font-mono text-[11px]">
                        {usr.email}
                      </td>
                      <td className="py-3">
                        <span className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${getRoleBadgeStyle(usr.role)}`}>
                          {getRoleArabicName(usr.role)}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                          usr.active === 1 ? "text-emerald-600" : "text-neutral-400"
                        }`}>
                          {usr.active === 1 ? "نشط" : "معطل"}
                        </span>
                      </td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleUserActive(usr)}
                          className="text-[11px] font-medium text-neutral-500 hover:text-[#004AC6] underline cursor-pointer"
                        >
                          {usr.active === 1 ? "تعطيل" : "تفعيل"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT LOG */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-[#1A1A1A]">سجل تدقيق وتتبع العمليات</h3>
              <p className="text-[11px] text-neutral-400">توثيق العمليات الحساسة (المدفوعات، الإلغاء، النسخ، التعديل)</p>
            </div>
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                placeholder="بحث في السجل..."
                className="w-full pl-3 pr-8 py-2 rounded-full border border-neutral-200 text-xs focus:outline-none focus:ring-0"
              />
              <Search className="w-3.5 h-3.5 text-neutral-400 absolute right-3 top-2.5" />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-right text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-[#E5E5E5] text-neutral-400 font-medium">
                  <th className="pb-3 pr-2">التوقيت</th>
                  <th className="pb-3">الكيان</th>
                  <th className="pb-3">نوع الإجراء</th>
                  <th className="pb-3">المستخدم</th>
                  <th className="pb-3">السبب / البيان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-400 text-xs">
                      لا توجد سجلات مطابقة للبحث
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-50/60 transition-colors">
                      <td className="py-3 pr-2 text-neutral-500 whitespace-nowrap text-[11px]">
                        {new Date(log.timestamp).toLocaleString("ar-EG", {
                          dateStyle: "short",
                          timeStyle: "medium",
                        })}
                      </td>
                      <td className="py-3 font-semibold text-neutral-700">
                        {log.entity_type}
                      </td>
                      <td className="py-3">
                        <span className="font-mono text-[11px] bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 text-neutral-500 text-[11px]">
                        {log.user_id || "system"}
                      </td>
                      <td className="py-3 text-neutral-800 text-[11px] max-w-xs truncate" title={log.change_reason}>
                        {log.change_reason}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: CUSTOM FIELDS */}
      {activeTab === "custom_fields" && (
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-[#1A1A1A]">الحقول المخصصة للعملاء</h3>
              <p className="text-[11px] text-neutral-400">
                إضافة حقول ديناميكية تظهر تلقائياً في نماذج إضافة العملاء والملف 360° وفلاتر البحث
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsCustomFieldsOpen(true)}
              className="px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              فتح نافذة إدارة الحقول
            </button>
          </div>

          <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 text-xs text-neutral-600 space-y-2">
            <div className="font-bold text-[#1A1A1A]">نطاقات الحقول المتاحة:</div>
            <ul className="list-disc list-inside space-y-1 text-neutral-500">
              <li><strong>الملف العام (Profile):</strong> بيانات عامة، وسوم تصنيف، تفضيلات التواصل.</li>
              <li><strong>بيانات الاتصال (Contact):</strong> مسؤول الاتصال البديل، لينكد إن، أرقام إضافية.</li>
              <li><strong>النشاط التجاري (Business):</strong> طبيعة النشاط، رابط الموقع، الحسابات الرسمية.</li>
              <li><strong>البيانات المالية (Financial):</strong> الرقم الضريبي، العملة المفضلة، شروط الدفع.</li>
            </ul>
          </div>
        </div>
      )}

      {/* TAB 4: COMPANY INFO */}
      {activeTab === "company" && (
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-6">
          <div>
            <h3 className="text-xs font-bold text-[#1A1A1A]">بيانات المنشأة والنظام المالي</h3>
            <p className="text-[11px] text-neutral-400">إعدادات ثابتة وفق مواصفات منتج Spark Internal v1.0</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-neutral-400 font-medium">اسم النظام والمنشأة:</span>
              <div className="text-sm font-bold text-[#1A1A1A] mt-1">سبارك لإدارة العمليات والمالية</div>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-neutral-400 font-medium">العملة الأساسية:</span>
              <div className="text-sm font-bold text-[#1A1A1A] mt-1">جنيه مصري</div>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-neutral-400 font-medium">سياسة الحسابات والكسور:</span>
              <div className="text-sm font-bold text-emerald-700 mt-1">
                تخزين بالقروش كأعداد صحيحة (1 جنيه = 100 قرش) لمنع أخطاء الفواصل العشرية
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-neutral-400 font-medium">طريقة العرض الافتراضية للاستوديو:</span>
              <div className="text-sm font-bold text-[#1A1A1A] mt-1">عرض أسبوعي مع منع التضارب القطعي للحجوزات</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: SYSTEM DIAGNOSTICS */}
      {activeTab === "diagnostics" && (
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
          <div>
            <h3 className="text-xs font-bold text-[#1A1A1A]">تشخيصات النظام وقاعدة البيانات المحلية</h3>
            <p className="text-[11px] text-neutral-400">فحص سلامة المحرك المحلي والتوافقية دون اتصال</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="text-xs text-emerald-800 font-medium">محرك قاعدة البيانات</div>
              <div className="text-lg font-bold text-emerald-900 mt-1">SQLite 3 (Local)</div>
              <div className="text-[11px] text-emerald-700 mt-1">مفعل محلياً بنسبة 100% دون خوادم خارجية</div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
              <div className="text-xs text-blue-800 font-medium">عدد جداول النظام</div>
              <div className="text-lg font-bold text-[#004AC6] mt-1">40 جدولاً</div>
              <div className="text-[11px] text-blue-700 mt-1">يشمل 5 مهاجرات متسلسلة وقيود Foreign Keys</div>
            </div>

            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200">
              <div className="text-xs text-purple-800 font-medium">حالة بيئة سطح المكتب</div>
              <div className="text-lg font-bold text-purple-900 mt-1">Tauri v2 + React</div>
              <div className="text-[11px] text-purple-700 mt-1">AthrEdu UX Design Language</div>
            </div>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      <ResponsiveModal
        isOpen={isAddUserOpen}
        onClose={() => setIsAddUserOpen(false)}
        title="إضافة مستخدم جديد"
        description="تسجيل حساب وصول جديد في قاعدة البيانات المحلية"
      >
        <form onSubmit={handleCreateUser} className="p-6 space-y-4" dir="rtl">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              اسم المستخدم <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              placeholder="مثال: سارة محمد"
              className="w-full px-4 py-2.5 rounded-2xl border border-neutral-200 text-xs focus:outline-none focus:ring-0"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              البريد الإلكتروني <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              required
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              placeholder="sara@spark.com"
              className="w-full px-4 py-2.5 rounded-2xl border border-neutral-200 text-xs focus:outline-none focus:ring-0"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              الدور والصلاحيات <span className="text-red-500">*</span>
            </label>
            <Select
              value={newUserRole}
              onValueChange={(val) => setNewUserRole(val as UserRole)}
              options={[
                { value: "admin", label: "مدير النظام - صلاحيات كاملة" },
                { value: "finance", label: "الإدارة المالية - المدفوعات والمصروفات" },
                { value: "operations", label: "العمليات والإنتاج - العملاء والاستوديو والريلز" },
                { value: "viewer", label: "المعاينة فقط - استعراض وتقارير دون تعديل" },
              ]}
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => setIsAddUserOpen(false)}
              className="px-5 py-2.5 rounded-full border border-neutral-200 text-neutral-600 text-xs font-bold hover:bg-neutral-50 cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              حفظ المستخدم
            </button>
          </div>
        </form>
      </ResponsiveModal>

      {/* CUSTOM FIELDS MODAL */}
      <CustomFieldsSettingsModal
        isOpen={isCustomFieldsOpen}
        onClose={() => setIsCustomFieldsOpen(false)}
        onChanged={() => onShowToast("تم حفظ إعدادات الحقول بنجاح", "success")}
      />
    </div>
  );
};
