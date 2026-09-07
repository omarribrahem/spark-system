import React, { useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

export interface ActionableErrorProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  error?: unknown;
  className?: string;
}

/**
 * ActionableError: Human-friendly Arabic error boundary component with Retry action.
 * Shields user from raw panics while providing retry capability.
 * Follows DESIGN_SYSTEM.md §6.4 standards.
 */
export const ActionableError: React.FC<ActionableErrorProps> = ({
  title = 'حصلت مشكلة أثناء تحميل البيانات',
  message = 'تعذر قراءة السجلات من قاعدة البيانات المحلية. يرجى التحقق وإعادة المحاولة.',
  onRetry,
  error,
  className,
}) => {
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const errorString = error instanceof Error ? error.stack || error.message : typeof error === 'string' ? error : null;

  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center p-8 bg-white border border-rose-100 rounded-[2rem] shadow-[0_4px_20px_rgba(0,0,0,0.03)]',
        className
      )}
      role="alert"
    >
      <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
        <AlertTriangle className="w-5 h-5" />
      </div>

      <h3 className="text-base font-bold text-[#1A1A1A] mb-1">{title}</h3>
      <p className="text-xs text-[#707070] max-w-md mb-5 leading-relaxed">{message}</p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 focus:outline-none"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة المحاولة</span>
        </button>
      )}

      {errorString && (
        <div className="mt-6 w-full max-w-md text-start">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 font-medium focus:outline-none"
          >
            <span>تفاصيل تقنية للمطورين</span>
            {showTechnicalDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          {showTechnicalDetails && (
            <pre
              dir="ltr"
              className="mt-2 p-3 bg-red-950 text-red-100 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap select-all"
            >
              {errorString}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default ActionableError;
