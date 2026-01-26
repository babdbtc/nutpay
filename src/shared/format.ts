import type { Settings } from './types';

/**
 * Format an amount based on user's display preference
 * @param amount - The amount in sats
 * @param format - 'symbol' for ₿10, 'text' for 10 sats
 * @returns Formatted string
 */
export function formatAmount(
  amount: number,
  format: Settings['displayFormat']
): string {
  const formatted = amount.toLocaleString();

  if (format === 'symbol') {
    return `₿${formatted}`;
  }

  return `${formatted} sats`;
}

/**
 * Format amount with +/- prefix for transactions
 */
export function formatTransactionAmount(
  amount: number,
  type: 'payment' | 'receive',
  format: Settings['displayFormat']
): string {
  const prefix = type === 'payment' ? '-' : '+';
  const formatted = amount.toLocaleString();

  if (format === 'symbol') {
    return `${prefix}₿${formatted}`;
  }

  return `${prefix}${formatted} sats`;
}
