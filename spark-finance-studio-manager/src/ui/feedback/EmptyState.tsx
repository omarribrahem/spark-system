import React from 'react';
import clsx from 'clsx';
import { FolderOpen, Plus } from 'lucide-react';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * EmptyState: Friendly Arabic empty state with an immediate primary CTA button.
 * Anti-slop rule: Never leave an empty screen without an action!
 * Follows DESIGN_SYSTEM.md §6.3 standards.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon: Icon = FolderOpen,
  actionLabel,
  onAction,
  className,
}) => {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center text-center p-8 sm:p-12',
        'bg-white rounded-[2rem] border border-[#E5E5E5] shadow-[0_4px_20px_rgba(0,0,0,0.03)]',
        className
      )}
    >
      <div className="w-12 h-12 rounded-full bg-blue-50 text-[#004AC6] flex items-center justify-center mb-4">
        <Icon className="w-6 h-6" />
      </div>

      <h3 className="text-base font-bold text-[#1A1A1A] mb-1.5">{title}</h3>

      {description && (
        <p className="text-xs text-[#707070] max-w-md mb-6 leading-relaxed">
          {description}
        </p>
      )}

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#004AC6] hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 focus:outline-none"
        >
          <Plus className="w-4 h-4" />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
};

export default EmptyState;
