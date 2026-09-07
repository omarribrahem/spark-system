import React from 'react';
import clsx from 'clsx';

export interface BdiTextProps {
  children: React.ReactNode;
  /**
   * Explicit direction isolation ('ltr' | 'rtl' | 'auto')
   */
  dir?: 'ltr' | 'rtl' | 'auto';
  /**
   * Shorthand for phone number styling and LTR isolation
   */
  isPhone?: boolean;
  /**
   * Shorthand for code identifiers (UUID, ID, serials)
   */
  isCode?: boolean;
  /**
   * Additional CSS classes
   */
  className?: string;
}

/**
 * BdiText: Universal bidirectional text isolation component.
 * Prevents phone numbers, alphanumeric IDs, mixed strings, and English names
 * from scrambling inside RTL Arabic contexts.
 */
export const BdiText: React.FC<BdiTextProps> = ({
  children,
  dir,
  isPhone = false,
  isCode = false,
  className,
}) => {
  const resolvedDir = isPhone || isCode ? 'ltr' : (dir ?? 'auto');

  return (
    <bdi
      dir={resolvedDir}
      className={clsx(
        'inline-block',
        isPhone && 'font-mono text-sm tabular-nums tracking-wide',
        isCode && 'font-mono text-xs text-slate-600 bg-slate-100 px-1 py-0.5 rounded border border-slate-200',
        className
      )}
      style={{ unicodeBidi: 'isolate' }}
    >
      {children}
    </bdi>
  );
};

export default BdiText;
