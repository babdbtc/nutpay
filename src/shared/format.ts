import type { Settings } from './types';

/**
 * Normalize a mint URL for consistent comparison and storage
 * Removes trailing slashes and ensures lowercase
 */
export function normalizeMintUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Remove trailing slash from pathname
    let normalized = parsed.origin + parsed.pathname.replace(/\/+$/, '');
    // Keep query string and hash if present (unlikely for mints but just in case)
    if (parsed.search) normalized += parsed.search;
    if (parsed.hash) normalized += parsed.hash;
    return normalized;
  } catch {
    // If URL parsing fails, just remove trailing slashes
    return url.replace(/\/+$/, '');
  }
}

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

/**
 * Format a timestamp as a relative time string
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

/**
 * Extract hostname from an origin URL
 */
export function getOriginHost(origin?: string): string {
  if (!origin) return 'Unknown';
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}
