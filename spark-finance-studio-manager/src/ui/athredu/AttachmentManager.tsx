import React, { useState, useRef } from "react";
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Trash2,
  Download,
  Eye,
  X,
  AlertCircle,
} from "lucide-react";

export interface AttachmentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  url?: string;
  file?: File;
}

export interface AttachmentManagerProps {
  attachments: AttachmentItem[];
  onChange: (items: AttachmentItem[]) => void;
  maxFiles?: number;
  maxSizeBytes?: number; // default 10MB
  acceptedMimes?: string[];
  readOnly?: boolean;
}

export const AttachmentManager: React.FC<AttachmentManagerProps> = ({
  attachments,
  onChange,
  maxFiles = 5,
  maxSizeBytes = 10 * 1024 * 1024,
  acceptedMimes = ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  readOnly = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [previewItem, setPreviewItem] = useState<AttachmentItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0 || readOnly) return;
    setError(null);

    if (attachments.length + files.length > maxFiles) {
      setError(`الحد الأقصى للمرفقات هو ${maxFiles} ملفات`);
      return;
    }

    const newItems: AttachmentItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.size > maxSizeBytes) {
        setError(`الملف "${file.name}" يتجاوز الحد الأقصى المسموح به (${Math.round(maxSizeBytes / (1024 * 1024))} ميجابايت)`);
        return;
      }

      if (acceptedMimes.length > 0 && !acceptedMimes.includes(file.type)) {
        setError(`نوع الملف "${file.name}" غير مدعوم. الأنواع المسموحة: صور JPG/PNG/WebP ومستندات PDF`);
        return;
      }

      const id = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      newItems.push({
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        url,
        file,
      });
    }

    onChange([...attachments, ...newItems]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const handleRemove = (id: string) => {
    if (readOnly) return;
    onChange(attachments.filter((a) => a.id !== id));
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3" dir="rtl">
      {!readOnly && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-[1.5rem] p-5 text-center cursor-pointer transition-all ${
            isDragging
              ? "border-[#004AC6] bg-blue-50/50"
              : "border-neutral-200 hover:border-neutral-300 bg-neutral-50/50"
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept={acceptedMimes.join(",")}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <div className="flex flex-col items-center justify-center gap-2">
            <span className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500">
              <UploadCloud className="w-5 h-5 text-[#004AC6]" />
            </span>
            <div className="text-xs font-semibold text-[#1A1A1A]">
              اسحب وأفلت الملفات هنا، أو <span className="text-[#004AC6] underline">استعرض جهازك</span>
            </div>
            <p className="text-[11px] text-neutral-400">
              يدعم صور JPG، PNG، WebP ومستندات PDF حتى {Math.round(maxSizeBytes / (1024 * 1024))} ميجابايت
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {attachments.map((item) => {
            const isImage = item.type.startsWith("image/");

            return (
              <div
                key={item.id}
                className="flex items-center justify-between p-3 bg-white rounded-2xl border border-[#E5E5E5] shadow-xs"
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <span className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-600 flex items-center justify-center shrink-0">
                    {isImage ? <ImageIcon className="w-4 h-4 text-blue-600" /> : <FileText className="w-4 h-4 text-amber-600" />}
                  </span>
                  <div className="overflow-hidden">
                    <div className="text-xs font-medium text-[#1A1A1A] truncate max-w-[150px]" title={item.name}>
                      {item.name}
                    </div>
                    <div className="text-[10px] text-neutral-400">{formatSize(item.size)}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {item.url && (
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      title="معاينة"
                      className="p-1.5 rounded-full hover:bg-neutral-100 text-neutral-500 hover:text-[#1A1A1A] transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      title="حذف المرفق"
                      className="p-1.5 rounded-full hover:bg-rose-50 text-neutral-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="bg-white rounded-[2rem] border border-[#E5E5E5] max-w-2xl w-full p-6 space-y-4 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#E5E5E5] pb-3">
              <h3 className="text-xs font-bold text-[#1A1A1A] truncate">{previewItem.name}</h3>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="p-1.5 rounded-full bg-neutral-100 text-neutral-500 hover:bg-neutral-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto flex items-center justify-center">
              {previewItem.type.startsWith("image/") ? (
                <img src={previewItem.url} alt={previewItem.name} className="max-h-[55vh] object-contain rounded-xl" />
              ) : (
                <div className="text-center p-8 space-y-3">
                  <FileText className="w-16 h-16 mx-auto text-[#004AC6]" />
                  <p className="text-xs text-neutral-500">مستند PDF: {previewItem.name}</p>
                  <a
                    href={previewItem.url}
                    download={previewItem.name}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#004AC6] text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل الملف</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
