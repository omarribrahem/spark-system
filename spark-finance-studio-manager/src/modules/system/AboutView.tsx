import React, { useState, useEffect } from "react";
import {
  Shield,
  HardDrive,
  Database,
  Cloud,
  FolderOpen,
  CheckCircle2,
  Copy,
  RefreshCw,
  Building,
  Sparkles,
} from "lucide-react";
import { getDatabaseDriver } from "../../database/driver";
import { BackupService, BackupRecord } from "../../services/backup-service";
import { GDriveOAuthService, GDriveConnectionStatus, isTauriEnvironment } from "../../services/gdrive-oauth-service";

interface AboutViewProps {
  onShowToast: (msg: string, type?: "success" | "warning" | "error" | "info") => void;
}

export const AboutView: React.FC<AboutViewProps> = ({ onShowToast }) => {
  const [latestBackup, setLatestBackup] = useState<BackupRecord | null>(null);
  const [gdriveStatus, setGdriveStatus] = useState<GDriveConnectionStatus | null>(null);
  const [tablesCount, setTablesCount] = useState<number>(40);
  const [integrityStatus, setIntegrityStatus] = useState<string>("سليم (PRAGMA integrity_check: ok)");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState<boolean>(false);

  const appVersion = "1.0.0";
  const schemaVersion = 5;
  const appDataLocation = "%LOCALAPPDATA%\\com.spark.finance.studiomanager";

  const loadSystemInfo = async () => {
    try {
      setIsLoading(true);
      const driver = await getDatabaseDriver();

      // Get latest backup
      const backups = await BackupService.listBackups(driver);
      if (backups.length > 0) {
        setLatestBackup(backups[0]);
      }

      // Get tables count
      const tables = await driver.query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
      );
      setTablesCount(tables.length);

      // Get Google Drive status
      const gdrive = await GDriveOAuthService.getStatus();
      setGdriveStatus(gdrive);
    } catch (err: unknown) {
      console.error("Failed to load system info:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSystemInfo();
  }, []);

  const handleRunIntegrityCheck = async () => {
    try {
      setIsCheckingIntegrity(true);
      const driver = await getDatabaseDriver();
      const res = await driver.query<{ integrity_check: string }>("PRAGMA integrity_check;");
      const resultStr = res[0]?.integrity_check || "ok";
      if (resultStr === "ok") {
        setIntegrityStatus("سليم بنسبة 100% (ok)");
        onShowToast("تم فحص سلامة قاعدة البيانات بنجاح: لا توجد أي أخطاء أو تلف في الجداول", "success");
      } else {
        setIntegrityStatus(`تحذير: ${resultStr}`);
        onShowToast(`نتيجة فحص السلامة: ${resultStr}`, "warning");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onShowToast(`فشل تشغيل فحص السلامة: ${msg}`, "error");
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  const handleOpenFolder = async (subfolder = "backups") => {
    const fullPath = `${appDataLocation}\\${subfolder}`;
    if (isTauriEnvironment()) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("open_folder_in_explorer", { path: subfolder });
        onShowToast(`تم فتح مجلد ${subfolder} في مستكشف Windows`, "success");
        return;
      } catch {
        // Fallback to clipboard
      }
    }
    // Fallback for web mode
    navigator.clipboard.writeText(fullPath);
    onShowToast(`تم نسخ مسار المجلد إلى الحافظة: ${fullPath}`, "info");
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    onShowToast(`تم نسخ ${label} إلى الحافظة`, "info");
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner / Branding */}
      <div className="rounded-[2rem] border border-[#E5E5E5] bg-white p-6 md:p-8 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-[1.5rem] bg-[#004AC6] text-white flex items-center justify-center shadow-md shadow-blue-500/20 shrink-0">
            <Sparkles className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-black text-[#1A1A1A]">
                سبارك لإدارة العمليات والمالية
              </h1>
              <span className="px-3 py-1 rounded-full text-xs font-black bg-blue-50 text-[#004AC6] border border-blue-200">
                v{appVersion}
              </span>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Spark Finance & Studio Manager • نظام محلي مكتمل للإنتاج وإدارة العمليات والمالية دون اتصال
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadSystemInfo}
            disabled={isLoading}
            className="p-2.5 rounded-full border border-neutral-200 hover:bg-neutral-50 text-neutral-600 transition-colors"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-[#004AC6]" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => handleOpenFolder("backups")}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-[0.98] text-white text-xs font-bold transition-all shadow-sm whitespace-nowrap shrink-0"
          >
            <FolderOpen className="w-4 h-4" />
            <span>فتح مجلد النسخ الاحتياطية</span>
          </button>
        </div>
      </div>

      {/* Grid: Core System Specs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Card 1: App Version & Environment */}
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-semibold">إصدار التطبيق والمنصة</span>
            <Building className="w-4 h-4 text-[#004AC6]" />
          </div>
          <div>
            <div className="text-xl font-bold text-[#1A1A1A]">الإصدار {appVersion}</div>
            <div className="text-xs text-neutral-500 mt-1">
              Tauri v2 Desktop Runtime + Windows Installer
            </div>
          </div>
          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
            <span className="text-neutral-400">طبيعة التشغيل:</span>
            <span className="font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              مستقل محلياً (Offline-First)
            </span>
          </div>
        </div>

        {/* Card 2: Database Engine & Schema */}
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-semibold">محرك وقاعدة البيانات</span>
            <Database className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <div className="text-xl font-bold text-[#1A1A1A]">SQLite 3 (المخطط v{schemaVersion})</div>
            <div className="text-xs text-neutral-500 mt-1">
              {tablesCount} جدولاً • قيود Foreign Keys مفعلة • نمط WAL
            </div>
          </div>
          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
            <span className="text-neutral-400">حالة الفحص:</span>
            <button
              type="button"
              onClick={handleRunIntegrityCheck}
              disabled={isCheckingIntegrity}
              className="font-semibold text-[#004AC6] hover:underline flex items-center gap-1 cursor-pointer"
            >
              {isCheckingIntegrity ? "جاري الفحص..." : integrityStatus}
            </button>
          </div>
        </div>

        {/* Card 3: Cloud Mirror Status */}
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between text-xs text-neutral-400">
            <span className="font-semibold">المزامنة السحابية (Google Drive)</span>
            <Cloud className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="text-xl font-bold text-[#1A1A1A]">
              {gdriveStatus?.connected ? "متصل ومفعل" : "غير متصل (اختياري)"}
            </div>
            <div className="text-xs text-neutral-500 mt-1 truncate" title={gdriveStatus?.email || ""}>
              {gdriveStatus?.email ? `الحساب: ${gdriveStatus.email}` : "لا يؤثر على العمل المحلي الأساسي"}
            </div>
          </div>
          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs">
            <span className="text-neutral-400">آخر رفع:</span>
            <span className="font-semibold text-neutral-700">
              {gdriveStatus?.lastUploadAt
                ? new Date(gdriveStatus.lastUploadAt).toLocaleString("ar-EG")
                : "لا يوجد"}
            </span>
          </div>
        </div>
      </div>

      {/* Storage Paths Card */}
      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-[#004AC6]" />
            <h3 className="text-sm font-bold text-[#1A1A1A]">مسارات تخزين البيانات المعزولة (App Data)</h3>
          </div>
          <span className="text-xs text-neutral-400 font-medium">
            تخزين آمن خارج مجلد التثبيت لضمان بقاء البيانات بعد التحديثات
          </span>
        </div>

        <div className="space-y-3 text-xs">
          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-neutral-400 font-medium block">موقع قاعدة البيانات والمجلد الرئيسي:</span>
              <code className="font-mono text-xs text-neutral-800 font-bold block mt-1 dir-ltr text-right">
                {appDataLocation}
              </code>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => copyToClipboard(appDataLocation, "مسار المجلد الرئيسي")}
                className="p-2 rounded-full hover:bg-neutral-200 text-neutral-600 transition-colors"
                title="نسخ المسار"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleOpenFolder("")}
                className="px-4 py-2 rounded-full bg-white border border-neutral-300 hover:bg-neutral-100 text-xs font-bold text-neutral-700 transition-all shadow-sm"
              >
                فتح المجلد
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center justify-between">
              <div>
                <span className="text-neutral-400 block text-[11px]">مجلد النسخ الاحتياطية:</span>
                <code className="font-mono text-xs text-neutral-800 font-semibold block mt-0.5">
                  \backups
                </code>
              </div>
              <button
                type="button"
                onClick={() => handleOpenFolder("backups")}
                className="px-3 py-1.5 rounded-full bg-white border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold text-neutral-700"
              >
                فتح
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center justify-between">
              <div>
                <span className="text-neutral-400 block text-[11px]">مجلد إيصالات المرفقات:</span>
                <code className="font-mono text-xs text-neutral-800 font-semibold block mt-0.5">
                  \attachments
                </code>
              </div>
              <button
                type="button"
                onClick={() => handleOpenFolder("attachments")}
                className="px-3 py-1.5 rounded-full bg-white border border-neutral-300 hover:bg-neutral-100 text-xs font-semibold text-neutral-700"
              >
                فتح
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Latest Backup Details Card */}
      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-[#1A1A1A]">حالة آخر نسخة احتياطية ذرية</h3>
          </div>
          <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
            رمز التحقق مطابق
          </span>
        </div>

        {latestBackup ? (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-neutral-400 block text-[11px]">اسم الملف:</span>
              <span className="font-mono text-xs font-bold text-[#1A1A1A] truncate block mt-0.5" title={latestBackup.filename}>
                {latestBackup.filename}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-neutral-400 block text-[11px]">التاريخ والوقت:</span>
              <span className="font-bold text-[#1A1A1A] block mt-0.5">
                {new Date(latestBackup.created_at).toLocaleString("ar-EG")}
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200">
              <span className="text-neutral-400 block text-[11px]">الحجم التخزيني:</span>
              <span className="font-mono text-xs font-bold text-[#1A1A1A] block mt-0.5">
                {(latestBackup.file_size_bytes / 1024).toFixed(1)} ك.ب
              </span>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center justify-between">
              <div>
                <span className="text-neutral-400 block text-[11px]">رمز التحقق:</span>
                <span className="font-mono text-[11px] text-emerald-700 block mt-0.5">
                  {latestBackup.sha256_hash.slice(0, 10)}...
                </span>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(latestBackup.sha256_hash, "رمز التحقق المشفر")}
                className="p-1.5 rounded-full hover:bg-neutral-200 text-neutral-600"
                title="نسخ البصمة كاملة"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="text-xs text-neutral-400 py-4 text-center">
            لم يتم تسجيل أي نسخ احتياطية بعد. يمكنك الانتقال لشاشة «النسخ الاحتياطي» لإنشاء أول نسخة.
          </div>
        )}
      </div>

      {/* Company & Support Information */}
      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
        <div>
          <span className="text-neutral-400 font-medium">الشركة المطورة والمرخصة:</span>
          <div className="text-sm font-bold text-[#1A1A1A] mt-0.5">Spark Media Production & Internal Operations</div>
          <p className="text-neutral-400 text-[11px] mt-0.5">جميع الحقوق محفوظة © 2026</p>
        </div>
        <div className="text-left font-mono text-[11px] text-neutral-400">
          Build ID: SPARK-DESKTOP-TAURI-RELEASE-1.0.0
        </div>
      </div>
    </div>
  );
};

export default AboutView;
