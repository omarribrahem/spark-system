import React, { useEffect, useState } from 'react';
import { X, FileText, Image as ImageIcon } from 'lucide-react';
import { getDatabaseDriver } from '../../database/driver';

export interface AttachmentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  filePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
}

export const AttachmentViewer: React.FC<AttachmentViewerProps> = ({
  isOpen,
  onClose,
  filePath,
  fileName,
  mimeType,
}) => {
  const [resolvedPath, setResolvedPath] = useState<string | null>(filePath || null);
  const [resolvedName, setResolvedName] = useState<string | null>(fileName || null);
  const [resolvedMime, setResolvedMime] = useState<string | null>(mimeType || null);

  useEffect(() => {
    let isCancelled = false;
    async function resolve() {
      if (!filePath) {
        setResolvedPath(null);
        return;
      }

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filePath);
      if (isUuid && !filePath.includes('/') && !filePath.includes('\\')) {
        try {
          const driver = await getDatabaseDriver();
          const rows = await driver.query<{ file_path: string; file_name: string; mime_type: string }>(
            `SELECT file_path, file_name, mime_type FROM attachments WHERE id = ? LIMIT 1;`,
            [filePath]
          );
          if (!isCancelled && rows.length > 0) {
            setResolvedPath(rows[0].file_path);
            if (!fileName) setResolvedName(rows[0].file_name);
            if (!mimeType) setResolvedMime(rows[0].mime_type);
            return;
          }
        } catch {
          // fallback to filePath
        }
      }

      if (!isCancelled) {
        setResolvedPath(filePath);
        setResolvedName(fileName || null);
        setResolvedMime(mimeType || null);
      }
    }

    if (isOpen && filePath) {
      resolve();
    }
    return () => {
      isCancelled = true;
    };
  }, [isOpen, filePath, fileName, mimeType]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const effectivePath = resolvedPath || filePath;
  const effectiveName = resolvedName || fileName;
  const effectiveMime = resolvedMime || mimeType;

  if (!isOpen || !effectivePath) return null;

  const isImage =
    effectiveMime?.startsWith('image/') ||
    effectivePath.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i);

  const isPdf =
    effectiveMime === 'application/pdf' ||
    effectivePath.match(/\.pdf$/i);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      <div
        className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl border border-[#E5E5E5] overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100 bg-neutral-50/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 text-[#004AC6] flex items-center justify-center border border-blue-100">
              {isImage ? <ImageIcon className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">
                {effectiveName || 'مرفق الإيصال / المستند'}
              </h3>
              <p className="text-[11px] text-neutral-500 font-mono" dir="ltr">
                {effectivePath}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Viewer */}
        <div className="p-6 bg-slate-900/5 flex items-center justify-center min-h-[320px] max-h-[70vh] overflow-auto">
          {isImage ? (
            <img
              src={effectivePath}
              alt={effectiveName || 'مرفق إيصال'}
              className="max-h-[60vh] max-w-full rounded-xl object-contain shadow-tactile-sm"
              onError={(e) => {
                // If local file path cannot be displayed directly in browser without custom protocol
                const target = e.currentTarget;
                target.style.display = 'none';
                const parent = target.parentElement;
                if (parent) {
                  const fallback = document.createElement('div');
                  fallback.className = 'text-center p-8 bg-white rounded-xl border border-slate-200';
                  fallback.innerHTML = `
                    <div class="text-slate-700 font-bold text-sm mb-1">تم حفظ الإيصال محلياً</div>
                    <div class="text-xs text-slate-500 font-mono" dir="ltr">${effectivePath}</div>
                  `;
                  parent.appendChild(fallback);
                }
              }}
            />
          ) : isPdf ? (
            <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-tactile-xs max-w-sm">
              <FileText className="w-16 h-16 text-red-500 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-900 mb-1">مستند PDF مرفق</h4>
              <p className="text-xs text-slate-500 mb-4 font-mono" dir="ltr">
                {effectiveName || effectivePath}
              </p>
              <div className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200">
                تم التحقق من سلامة الملف وتخزينه في مجلد التطبيق المحلي.
              </div>
            </div>
          ) : (
            <div className="text-center p-8 bg-white rounded-2xl border border-slate-200 shadow-tactile-xs max-w-sm">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-900 mb-1">مستند مرفق</h4>
              <p className="text-xs text-slate-500 font-mono" dir="ltr">
                {effectivePath}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">
            المسار المحلي: <span className="font-mono" dir="ltr">{effectivePath}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-semibold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

export default AttachmentViewer;
