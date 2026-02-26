// Badge manager - updates extension icon badge with wallet balance

import { getWalletBalances } from '../core/wallet/cashu-wallet';
import { hasSessionKey } from '../core/storage/crypto-utils';
import { getSettings } from '../core/storage/settings-store';

// Format balance for badge text (compact)
function formatBadgeBalance(sats: number): string {
  if (sats === 0) return '';
  if (sats < 1000) return `${sats}`;
  if (sats < 10_000) return `${(sats / 1000).toFixed(1)}k`;
  if (sats < 1_000_000) return `${Math.floor(sats / 1000)}k`;
  return `${(sats / 1_000_000).toFixed(1)}M`;
}

const BADGE_COLOR = '#6b21a8'; // Purple
const LOCKED_COLOR = '#6b7280'; // Gray

// Update badge to show current balance (or clear if disabled)
export async function updateBadgeBalance(): Promise<void> {
  // Skip if wallet is locked (no encryption key)
  if (!(await hasSessionKey())) {
    await chrome.action.setBadgeText({ text: '🔒' });
    await chrome.action.setBadgeBackgroundColor({ color: LOCKED_COLOR });
    return;
  }

  try {
    // Check if badge is enabled in settings
    const settings = await getSettings();
    if (settings.showBadgeBalance === false) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }

    const balances = await getWalletBalances();
    const total = (balances as Array<{ balance: number }>).reduce(
      (sum: number, b: { balance: number }) => sum + b.balance,
      0
    );
    const text = formatBadgeBalance(total);
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
  } catch {
    // Silently fail - badge is not critical
  }
}
