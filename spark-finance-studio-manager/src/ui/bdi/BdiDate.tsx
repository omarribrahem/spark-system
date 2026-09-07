import React from 'react';
import clsx from 'clsx';

export interface BdiDateProps {
  /**
   * ISO date string (YYYY-MM-DD or full timestamp) or Date object
   */
  value?: string | Date | null;
  /**
   * For time range display (e.g. '04:00 PM', '06:30 PM')
   */
  timeRange?: {
    start: string;
    end: string;
  };
  /**
   * Format type
   */
  format?: 'date' | 'time' | 'datetime' | 'relative' | 'range';
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * BdiDate: Protects dates, timestamps, and time intervals from being scrambled in RTL text flow.
 * Explicitly forces LTR isolation for numbers and direction arrows.
 */
export const BdiDate: React.FC<BdiDateProps> = ({
  value,
  timeRange,
  format = 'date',
  className,
}) => {
  if (timeRange) {
    return (
      <bdi
        dir="ltr"
        className={clsx(
          'inline-flex items-center gap-1.5 font-mono text-sm tabular-nums tracking-tight',
          className
        )}
      >
        <span>{timeRange.start}</span>
        <span className="text-slate-400 font-normal">→</span>
        <span>{timeRange.end}</span>
      </bdi>
    );
  }

  if (!value) {
    return <span className="text-slate-400 text-xs">—</span>;
  }

  const dateObj = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(dateObj.getTime())) {
    return <bdi dir="ltr" className={className}>{String(value)}</bdi>;
  }

  let formatted = '';
  switch (format) {
    case 'date': {
      // YYYY-MM-DD format
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      formatted = `${year}-${month}-${day}`;
      break;
    }
    case 'time': {
      formatted = dateObj.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      break;
    }
    case 'datetime': {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      const timeStr = dateObj.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
      formatted = `${year}-${month}-${day} ${timeStr}`;
      break;
    }
    default:
      formatted = dateObj.toLocaleDateString('ar-EG');
  }

  return (
    <bdi
      dir="ltr"
      className={clsx('inline-block font-mono text-sm tabular-nums', className)}
    >
      {formatted}
    </bdi>
  );
};

export default BdiDate;
