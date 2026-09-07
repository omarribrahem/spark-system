import React from 'react';
import clsx from 'clsx';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  fullScreen?: boolean;
  className?: string;
}

/**
 * LoadingSpinner: Subtle, tactile circular spinner with Spark Orange accent.
 * Follows DESIGN_SYSTEM.md §6.1 standards.
 */
export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label,
  fullScreen = false,
  className,
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
    xl: 'w-12 h-12 border-4',
  }[size];

  const content = (
    <div className={clsx('flex flex-col items-center justify-center gap-3', className)}>
      <div
        className={clsx(
          'rounded-full border-neutral-200 border-t-[#004AC6] animate-spin',
          sizeClasses
        )}
        role="status"
        aria-label={label || 'جاري التحميل...'}
      />
      {label && (
        <span className="text-xs font-medium text-neutral-500">
          {label}
        </span>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-[2rem] shadow-2xl border border-[#E5E5E5]">
          {content}
        </div>
      </div>
    );
  }

  return content;
};

export default LoadingSpinner;
