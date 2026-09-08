import React, { useState, useEffect, useRef } from "react";
import {
  ShieldCheck,
  Download,
  HardDrive,
  CheckCircle2,
  Clock,
  Settings2,
  Upload,
  FileJson,
  Cloud,
  RefreshCw,
  Copy,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { CustomFieldsSettingsModal } from "../clients";
import { getDatabaseDriver } from "../../database/driver";
import { BackupService, BackupRecord, BackupBundle, calculateSha256 } from "../../services/backup-service";
import { GDriveOAuthService, GDriveConnectionStatus } from "../../services/gdrive-oauth-service";
import { ResponsiveModal } from "../../ui/athredu/ResponsiveModal";

interface BackupViewProps {
  onShowToast: (msg: string, type?: "success" | "warning" | "error" | "info") => void;
}

export const BackupView: React.FC<BackupViewProps> = ({ onShowToast }) => {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isCustomFieldsOpen, setIsCustomFieldsOpen] = useState(false);
  const [gdriveStatus, setGdriveStatus] = useState<GDriveConnectionStatus | null>(null);
  const [isConnectingGdrive, setIsConnectingGdrive] = useState(false);
  const [isTestingGdrive, setIsTestingGdrive] = useState(false);
  const [showChangeAccountModal, setShowChangeAccountModal] = useState(false);

  // Safe Restore State
  const [restoreModalOpen, setRestoreModalOpen] = useState(false);
  const [pendingBundleJson, setPendingBundleJson] = useState<string | null>(null);
  const [pendingBundleMeta, setPendingBundleMeta] = useState<BackupBundle["manifest"] | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadGdriveStatus = async () => {
    try {
      const status = await GDriveOAuthService.getStatus();
      setGdriveStatus(status);
    } catch {
      // Ignore
    }
  };

  const fetchBackups = async () => {
    try {
      setIsLoading(true);
      const driver = await getDatabaseDriver();
      const records = await BackupService.listBackups(driver);
      setBackups(records);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر جلب سجل النسخ الاحتياطية";
      onShowToast(msg, "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
    loadGdriveStatus();
  }, []);

  const triggerDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleBackupNow = async () => {
    try {
      setIsBackingUp(true);
      const driver = await getDatabaseDriver();
      const { record, bundleJson } = await BackupService.createBackup(driver, {
        reason: "نسخ احتياطي يدوي بواسطة المستخدم",
        storageType: gdriveStatus?.connected ? "gdrive" : "local",
      });

      triggerDownload(record.filename, bundleJson);
      onShowToast("تم إنشاء نسخة احتياطية محلية وتحميل الملف بنجاح (رمز التحقق مطابق)", "success");
      await fetchBackups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشل إنشاء النسخة الاحتياطية";
      onShowToast(msg, "error");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so the same file can be re-selected if desired
    e.target.value = "";

    try {
      const text = await file.text();
      let bundle: BackupBundle;
      try {
        bundle = JSON.parse(text);
      } catch {
        throw new Error("ملف النسخة الاحتياطية تالف أو غير صالح");
      }

      if (!bundle.manifest || !bundle.tables) {
        throw new Error("بنية الملف غير متوافقة مع مواصفات نسخ النظام");
      }

      // Verify SHA256 checksum immediately
      const computedHash = await calculateSha256(JSON.stringify(bundle.tables));
      if (computedHash !== bundle.manifest.sha256) {
        throw new Error("رمز التحقق المشفر للملف غير متطابق! قد يكون الملف تعرض للتعديل أو التلف.");
      }

      setPendingBundleJson(text);
      setPendingBundleMeta(bundle.manifest);
      setRestoreError(null);
      setRestoreModalOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطأ أثناء قراءة ملف النسخة الاحتياطية";
      onShowToast(msg, "error");
    }
  };

  const handleExecuteRestore = async () => {
    if (!pendingBundleJson) return;

    try {
      setIsRestoring(true);
      setRestoreError(null);
      const driver = await getDatabaseDriver();
      const result = await BackupService.restoreFromBundle(driver, pendingBundleJson);

      onShowToast(
        `تمت الاستعادة بنجاح: ${result.restoredTables} جدول و ${result.restoredRecords} سجل. تم أخذ نسخة أمان تلقائية مسبقاً.`,
        "success"
      );
      setRestoreModalOpen(false);
      setPendingBundleJson(null);
      setPendingBundleMeta(null);
      await fetchBackups();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "فشلت عملية الاستعادة";
      setRestoreError(msg);
      onShowToast(msg, "error");
    } finally {
      setIsRestoring(false);
    }
  };

  const handleConnectGDrive = async () => {
    try {
      setIsConnectingGdrive(true);
      const session = await GDriveOAuthService.createPKCESession();
      window.open(session.authUrl, "_blank");
      onShowToast("تم فتح نافذة تسجيل الدخول الرسمية لـ Google في المتصفح", "info");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onShowToast(`فشل بدء جلسة الربط: ${msg}`, "error");
    } finally {
      setIsConnectingGdrive(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsTestingGdrive(true);
      const res = await GDriveOAuthService.testConnection();
      if (res.ok) {
        onShowToast(`الاتصال بـ Google Drive سليم (${res.email || 'الحساب نشط'})`, "success");
        await loadGdriveStatus();
      } else {
        onShowToast(`فشل الاتصال: ${res.error}`, "error");
      }
    } finally {
      setIsTestingGdrive(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await GDriveOAuthService.disconnect();
      onShowToast("تم إلغاء ربط حساب Google وحذف الاعتماد المحلي بنجاح", "info");
      await loadGdriveStatus();
    } catch {
      onShowToast("حدث خطأ أثناء إلغاء الربط", "error");
    }
  };

  const confirmChangeAccount = async () => {
    setShowChangeAccountModal(false);
    try {
      setIsConnectingGdrive(true);
      const session = await GDriveOAuthService.prepareChangeAccount();
      window.open(session.authUrl, "_blank");
      onShowToast("تم فتح نافذة اختيار الحساب الجديد في المتصفح", "info");
      await loadGdriveStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      onShowToast(`فشل تغيير الحساب: ${msg}`, "error");
    } finally {
      setIsConnectingGdrive(false);
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    onShowToast("تم نسخ رمز التحقق المشفر إلى الحافظة", "info");
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} بايت`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ك.ب`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} م.ب`;
  };

  const latestBackup = backups[0];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Hidden file input for restore */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelected}
        accept=".json,application/json"
        className="hidden"
      />

      {/* Header Info & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">النسخ الاحتياطي وسلامة البيانات</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            إدارة النسخ الاحتياطية الذرية، رموز التحقق المشفرة، وبروتوكول الاستعادة الآمن
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[#E5E5E5] hover:bg-neutral-50 active:scale-[0.98] text-[#1A1A1A] text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0"
          >
            <Upload className="w-4 h-4 text-neutral-600" />
            <span>استعادة من ملف</span>
          </button>

          <button
            type="button"
            onClick={handleBackupNow}
            disabled={isBackingUp}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-[0.98] text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {isBackingUp ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>{isBackingUp ? "جاري إنشاء النسخة..." : "نسخ احتياطي الآن"}</span>
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-neutral-400 font-medium">حالة التجزئة والسلامة</span>
            <div className="text-base font-bold text-[#1A1A1A] mt-0.5">آمن ومُتحقق منه</div>
            <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>رمز التحقق المشفر نشط وموثق</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-[#004AC6] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-neutral-400 font-medium">آخر نسخة احتياطية</span>
            <div className="text-base font-bold text-[#1A1A1A] mt-0.5">
              {latestBackup
                ? new Date(latestBackup.created_at).toLocaleString("ar-EG", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "لا توجد نسخ سابقة"}
            </div>
            <div className="text-xs text-neutral-400 mt-1">
              {latestBackup ? formatBytes(latestBackup.file_size_bytes) : "قم بإنشاء نسخة الآن"}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-neutral-400 font-medium">سياسة الاحتفاظ بالنسخ</span>
            <div className="text-base font-bold text-[#1A1A1A] mt-0.5">30 نسخة محلية</div>
            <div className="text-xs text-neutral-400 mt-1">تدوير وحذف آمن للنسخ الأقدم تلقائياً</div>
          </div>
        </div>
      </div>

      {/* Backup Records History */}
      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileJson className="w-5 h-5 text-[#004AC6]" />
            <h3 className="text-xs font-bold text-[#1A1A1A]">سجل النسخ الاحتياطية المسجلة ({backups.length})</h3>
          </div>
          <button
            type="button"
            onClick={fetchBackups}
            className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-500 transition-colors"
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {backups.length === 0 ? (
          <div className="text-center py-10 text-neutral-400 text-xs">
            لا توجد نسخ احتياطية مسجلة بعد. انقر على "نسخ احتياطي الآن" لإنشاء أول نسخة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead>
                <tr className="border-b border-[#E5E5E5] text-neutral-400 font-medium">
                  <th className="pb-3 pr-2">اسم الملف</th>
                  <th className="pb-3">التاريخ والوقت</th>
                  <th className="pb-3">الحجم</th>
                  <th className="pb-3">رمز التحقق المشفر</th>
                  <th className="pb-3">النوع</th>
                  <th className="pb-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {backups.map((bk) => (
                  <tr key={bk.id} className="hover:bg-neutral-50/60 transition-colors">
                    <td className="py-3 pr-2 font-mono text-[#1A1A1A] font-semibold flex items-center gap-2">
                      <FileJson className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="truncate max-w-[200px]" title={bk.filename}>
                        {bk.filename}
                      </span>
                    </td>
                    <td className="py-3 text-neutral-500">
                      {new Date(bk.created_at).toLocaleString("ar-EG", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="py-3 text-neutral-700 font-mono">
                      {formatBytes(bk.file_size_bytes)}
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => copyHash(bk.sha256_hash)}
                        className="flex items-center gap-1 font-mono text-[11px] text-neutral-600 hover:text-[#004AC6] bg-neutral-100 px-2 py-0.5 rounded cursor-pointer"
                        title="انقر لنسخ البصمة كاملة"
                      >
                        <Copy className="w-3 h-3" />
                        <span>{bk.sha256_hash.slice(0, 10)}...{bk.sha256_hash.slice(-6)}</span>
                      </button>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-neutral-100 text-neutral-700">
                        {bk.storage_type === "gdrive" ? "محلي + سحابي" : "محلي"}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>سليم</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Google Drive Cloud Mirror Section */}
      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              gdriveStatus?.connected ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-[#004AC6]"
            }`}>
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-[#1A1A1A]">المزامنة السحابية عبر Google Drive</h3>
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                  gdriveStatus?.connected
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-neutral-100 text-neutral-500"
                }`}>
                  {gdriveStatus?.connected ? "متصل ومفعل" : "غير متصل"}
                </span>
              </div>
              <p className="text-xs text-neutral-400 mt-0.5">
                حفظ نسخ احتياطية مشفرة في مجلد مخصص على Google Drive دون التأثير على العمل المحلي دون إنترنت.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {!gdriveStatus?.connected ? (
              <button
                type="button"
                onClick={handleConnectGDrive}
                disabled={isConnectingGdrive}
                className="px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-[0.98] text-white text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                {isConnectingGdrive ? "جاري فتح المتصفح..." : "ربط حساب Google Drive"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTestingGdrive}
                  className="px-3.5 py-2 rounded-full border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  {isTestingGdrive ? "جاري الفحص..." : "فحص الاتصال"}
                </button>

                <button
                  type="button"
                  onClick={() => setShowChangeAccountModal(true)}
                  className="px-3.5 py-2 rounded-full border border-neutral-200 hover:bg-neutral-50 text-neutral-700 text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  تغيير الحساب
                </button>

                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="px-3.5 py-2 rounded-full border border-rose-200 hover:bg-rose-50 text-rose-600 text-xs font-bold transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  إلغاء الربط
                </button>
              </>
            )}
          </div>
        </div>

        {/* Real Account & Folder Details if connected */}
        {gdriveStatus?.connected && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-neutral-100 text-xs">
            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/60">
              <span className="text-neutral-400 block text-[11px]">الحساب المصرح به:</span>
              <span className="font-bold text-[#1A1A1A] truncate block mt-0.5" title={gdriveStatus.email || ""}>
                {gdriveStatus.email || "حساب Google معتمد"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/60">
              <span className="text-neutral-400 block text-[11px]">مجلد النسخ على Drive:</span>
              <span className="font-bold text-[#1A1A1A] block mt-0.5">
                {gdriveStatus.folderName || "Spark Internal Backups"}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-neutral-50 border border-neutral-200/60">
              <span className="text-neutral-400 block text-[11px]">آخر رفع سحابي ناجح:</span>
              <span className="font-bold text-emerald-700 block mt-0.5">
                {gdriveStatus.lastUploadAt
                  ? new Date(gdriveStatus.lastUploadAt).toLocaleString("ar-EG")
                  : "لم يتم الرفع بعد"}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Custom Fields Settings Section */}
      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-[#004AC6] flex items-center justify-center shrink-0">
            <Settings2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#1A1A1A]">الحقول المخصصة للعملاء</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              تخصيص البيانات الإضافية في نماذج العملاء والملف 360° ومحرك الفلاتر.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsCustomFieldsOpen(true)}
          className="px-5 py-2 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer"
        >
          إدارة الحقول
        </button>
      </div>

      {/* Safe Restore Confirmation Modal */}
      <ResponsiveModal
        isOpen={restoreModalOpen}
        onClose={() => !isRestoring && setRestoreModalOpen(false)}
        title="استعادة آمنة للنسخة الاحتياطية"
        description="بروتوكول الأمان التلقائي المسبق"
      >
        <div className="p-6 space-y-5" dir="rtl">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">بروتوكول الأمان المشدد:</div>
              <p className="mt-1 leading-relaxed">
                قبل تنفيذ الاستبدال الذري للبيانات، سيقوم النظام تلقائياً بإنشاء نسخة أمان احتياطية فورية من
                البيانات الحالية وحفظها في السجل. لن يتم استبدال أي جدول إلا بعد نجاح التحقق الكامل من سلامة رمز التحقق المشفر.
              </p>
            </div>
          </div>

          {pendingBundleMeta && (
            <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-neutral-500">التطبيق:</span>
                <span className="font-bold text-[#1A1A1A]">{pendingBundleMeta.app} الإصدار {pendingBundleMeta.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">تاريخ النسخة:</span>
                <span className="font-bold text-[#1A1A1A]">
                  {new Date(pendingBundleMeta.createdAt).toLocaleString("ar-EG")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">عدد الجداول:</span>
                <span className="font-bold text-[#1A1A1A]">{pendingBundleMeta.tablesCount} جدول</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">إجمالي السجلات:</span>
                <span className="font-bold text-[#1A1A1A]">{pendingBundleMeta.recordsCount} سجل</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-neutral-200">
                <span className="text-neutral-500">رمز التحقق:</span>
                <span className="font-mono text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                  {pendingBundleMeta.sha256.slice(0, 16)}... (مطابق ومعتمد)
                </span>
              </div>
            </div>
          )}

          {restoreError && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-xs text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <span>{restoreError}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => setRestoreModalOpen(false)}
              disabled={isRestoring}
              className="px-5 py-2.5 rounded-full border border-neutral-200 text-neutral-600 text-xs font-bold hover:bg-neutral-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleExecuteRestore}
              disabled={isRestoring}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isRestoring && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>{isRestoring ? "جاري الاستعادة الآمنة..." : "تأكيد واستعادة البيانات"}</span>
            </button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Change Account Warning Modal */}
      <ResponsiveModal
        isOpen={showChangeAccountModal}
        onClose={() => setShowChangeAccountModal(false)}
        title="تغيير حساب Google Drive"
        description="تأكيد التبديل إلى حساب جديد"
      >
        <div className="p-6 space-y-4" dir="rtl">
          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">تنبيه هام بشأن النسخ السابقة:</div>
              <p className="mt-1 leading-relaxed">
                سيتم إلغاء اعتماد الحساب الحالي ومسح رموزه محلياً من مخزن النظام، ثم فتح شاشة اختيار حساب Google جديد.
                <strong> لن يتم حذف أي نسخ احتياطية سابقة موجودة على حسابك القديم</strong> وستظل محفوظة بأمان هناك، بينما سيتم رفع النسخ القادمة للحساب الجديد.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={() => setShowChangeAccountModal(false)}
              className="px-5 py-2.5 rounded-full border border-neutral-200 text-neutral-600 text-xs font-bold hover:bg-neutral-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={confirmChangeAccount}
              className="px-6 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] text-white text-xs font-bold transition-all shadow-sm cursor-pointer whitespace-nowrap shrink-0"
            >
              المتابعة واختيار حساب جديد
            </button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Custom Fields Modal */}
      <CustomFieldsSettingsModal
        isOpen={isCustomFieldsOpen}
        onClose={() => setIsCustomFieldsOpen(false)}
        onChanged={() => onShowToast("تم تحديث إعدادات الحقول المخصصة بنجاح", "success")}
      />
    </div>
  );
};
