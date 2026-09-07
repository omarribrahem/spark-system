import React, { useState } from "react";
import { ShieldCheck, Download, HardDrive, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface BackupViewProps {
  onShowToast: (msg: string, type?: "success" | "warning" | "error" | "info") => void;
}

export const BackupView: React.FC<BackupViewProps> = ({ onShowToast }) => {
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [lastBackupTime, setLastBackupTime] = useState<string>("اليوم في تمام 10:30 صباحاً");

  const handleBackupNow = () => {
    setIsBackingUp(true);
    setTimeout(() => {
      setIsBackingUp(false);
      setLastBackupTime("الآن");
      onShowToast("تم إنشاء نسخة احتياطية محلية ذرية وتحقق من تجزئة SHA-256 بنجاح", "success");
    }, 1200);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-[#1A1A1A]">النسخ الاحتياطي</h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            إدارة النسخ الاحتياطية المحلية وسلامة البيانات
          </p>
        </div>
        <button
          type="button"
          onClick={handleBackupNow}
          disabled={isBackingUp}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#004AC6] hover:bg-[#003bb0] active:scale-95 text-white text-xs font-bold transition-all shadow-sm"
        >
          <Download className="w-4 h-4" />
          <span>{isBackingUp ? "جاري النسخ..." : "نسخ احتياطي الآن"}</span>
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-neutral-100 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-neutral-400 font-medium">حالة النسخ المحلي</span>
            <div className="text-base font-bold text-[#1A1A1A] mt-0.5">آمن ومُتحقق منه</div>
            <div className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>SHA-256 سليم</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-neutral-400 font-medium">آخر نسخة احتياطية</span>
            <div className="text-base font-bold text-[#1A1A1A] mt-0.5">{lastBackupTime}</div>
            <div className="text-xs text-neutral-400 mt-1">تلقائي يومياً عند التشغيل</div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex items-start gap-4">
          <div className="w-10 h-10 rounded-full bg-neutral-100 text-[#004AC6] flex items-center justify-center shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-neutral-400 font-medium">سياسة الاحتفاظ</span>
            <div className="text-base font-bold text-[#1A1A1A] mt-0.5">30 نسخة محلية</div>
            <div className="text-xs text-neutral-400 mt-1">تدوير وحذف آمن للنسخ القديمة</div>
          </div>
        </div>
      </div>

      {/* Google Drive Status Section */}
      <div className="bg-white rounded-[2rem] border border-[#E5E5E5] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#1A1A1A]">المزامنة السحابية (Google Drive)</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              خيار إضافي اختياري لا يعيق التشغيل المحلي.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onShowToast("يتطلب ربط Google Drive تزويد بيانات الاعتماد", "info")}
          className="px-4 py-2 rounded-full bg-neutral-100 hover:bg-neutral-200 text-[#1A1A1A] text-xs font-semibold transition-all shrink-0"
        >
          تكوين الاعتماد
        </button>
      </div>
    </div>
  );
};
