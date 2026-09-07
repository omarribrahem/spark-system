import React from 'react';
import clsx from 'clsx';

export interface SkeletonCardProps {
  rows?: number;
  hasHeader?: boolean;
  hasBadge?: boolean;
  className?: string;
}

/**
 * SkeletonCard: Structured placeholder matching layout shape to eliminate CLS.
 * Follows DESIGN_SYSTEM.md §6.2 standards.
 */
export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  rows = 3,
  hasHeader = true,
  hasBadge = true,
  className,
}) => {
  return (
    <div
      className={clsx(
        'bg-surface-card rounded-xl border border-border-subtle p-5 shadow-tactile-xs animate-pulse',
        className
      )}
      role="status"
      aria-label="جاري تجهيز البيانات..."
    >
      {hasHeader && (
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div className="h-5 bg-slate-200 rounded-md w-1/3" />
          {hasBadge && <div className="h-6 bg-slate-200 rounded-full w-16" />}
        </div>
      )}

      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="flex items-center justify-between gap-4">
            <div
              className="h-4 bg-slate-200 rounded-md"
              style={{ width: `${Math.max(40, 90 - idx * 15)}%` }}
            />
            <div className="h-4 bg-slate-200 rounded-md w-16" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default SkeletonCard;
