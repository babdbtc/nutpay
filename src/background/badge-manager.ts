// Badge manager - updates extension icon badge with balance and payment notifications

import { getWalletBalances } from '../core/wallet/cashu-wallet';
import { hasSessionKey } from '../core/storage/crypto-utils';

// Format balance for badge text (compact)
function formatBadgeBalance(sats: number): string {
  if (sats === 0) return '';
  if (sats < 1000) return `${sats}`;
  if (sats < 10_000) return `${(sats / 1000).toFixed(1)}k`;
  if (sats < 1_000_000) return `${Math.floor(sats / 1000)}k`;
  return `${(sats / 1_000_000).toFixed(1)}M`;
}

// Default badge colors
const BADGE_COLORS = {
  normal: '#6b21a8',    // Purple - resting state with balance
  payment: '#22c55e',   // Green - successful payment
  pending: '#f97316',   // Orange - 402 detected / payment pending
  error: '#ef4444',     // Red - payment failed
  locked: '#6b7280',    // Gray - wallet locked
} as const;

let flashTimeout: ReturnType<typeof setTimeout> | null = null;

// Update badge to show current balance
export async function updateBadgeBalance(): Promise<void> {
  // Skip if wallet is locked (no encryption key)
  if (!(await hasSessionKey())) {
    await chrome.action.setBadgeText({ text: '🔒' });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS.locked });
    return;
  }

  try {
    const balances = await getWalletBalances();
    const total = (balances as Array<{ balance: number }>).reduce(
      (sum: number, b: { balance: number }) => sum + b.balance,
      0
    );
    const text = formatBadgeBalance(total);
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLORS.normal });
  } catch {
    // Silently fail - badge is not critical
  }
}

// Flash badge with a temporary color/text, then revert to balance
export async function flashBadge(
  type: 'payment' | 'pending' | 'error',
  text?: string,
  durationMs = 3000
): Promise<void> {
  // Clear any existing flash
  if (flashTimeout) {
    clearTimeout(flashTimeout);
    flashTimeout = null;
  }

  const color = BADGE_COLORS[type];
  const badgeText = text ?? (type === 'payment' ? '✓' : type === 'pending' ? '...' : '✗');

  await chrome.action.setBadgeText({ text: badgeText });
  await chrome.action.setBadgeBackgroundColor({ color });

  // Revert to balance after duration
  flashTimeout = setTimeout(() => {
    flashTimeout = null;
    updateBadgeBalance();
  }, durationMs);
}

// Flash for a specific payment amount
export async function flashPaymentSuccess(amount: number): Promise<void> {
  const text = amount < 1000 ? `-${amount}` : `-${Math.floor(amount / 1000)}k`;
  await flashBadge('payment', text, 3000);
}

// Flash for 402 detected (payment pending)
export async function flashPaymentPending(): Promise<void> {
  await flashBadge('pending', '402', 2000);
}

// Flash for payment failed
export async function flashPaymentFailed(): Promise<void> {
  await flashBadge('error', '✗', 3000);
}

// Flash for received ecash/lightning
export async function flashReceived(amount: number): Promise<void> {
  const text = amount < 1000 ? `+${amount}` : `+${Math.floor(amount / 1000)}k`;
  await flashBadge('payment', text, 3000);
}
