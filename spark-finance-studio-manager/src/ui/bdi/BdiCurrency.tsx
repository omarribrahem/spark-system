import React from 'react';
import clsx from 'clsx';

export interface BdiCurrencyProps {
  /**
   * Amount in integer piasters (1 EGP = 100 piasters)
   * Preferred prop per financial invariants.
   */
  piasters?: number;
  /**
   * Direct EGP amount (fallback if piasters is omitted)
   */
  amount?: number;
  /**
   * Custom currency suffix (defaults to 'ج.م')
   */
  symbol?: string;
  /**
   * Whether to display the currency symbol
   */
  showSymbol?: boolean;
  /**
   * Additional container CSS classes
   */
  className?: string;
  /**
   * Additional number styling
   */
  numberClassName?: string;
  /**
   * Additional symbol styling
   */
  symbolClassName?: string;
}

/**
 * BdiCurrency: Formats and isolates currency values in RTL Arabic layouts.
 * Guarantees zero bidirectional text scrambling.
 * Stored strictly as integer piasters ($1 EGP = 100 piasters).
 */
export const BdiCurrency: React.FC<BdiCurrencyProps> = ({
  piasters,
  amount,
  symbol = 'ج.م',
  showSymbol = true,
  className,
  numberClassName,
  symbolClassName,
}) => {
  // Convert piasters to EGP if provided
  const numericEgp = piasters !== undefined ? piasters / 100 : (amount ?? 0);

  // Format with Egyptian Arabic locale standard
  const formattedNumber = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: numericEgp % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(numericEgp);

  return (
    <span
      className={clsx(
        'inline-flex items-baseline gap-1 font-sans',
        className
      )}
      style={{ unicodeBidi: 'isolate' }}
    >
      <bdi className={clsx('font-semibold tabular-nums tracking-tight', numberClassName)}>
        {formattedNumber}
      </bdi>
      {showSymbol && (
        <span className={clsx('text-xs font-normal text-slate-500 select-none', symbolClassName)}>
          {symbol}
        </span>
      )}
    </span>
  );
};

export default BdiCurrency;
