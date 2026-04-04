// Badge manager - updates extension icon badge with wallet balance

import { getWalletBalances } from '../core/wallet/cashu-wallet';
import { hasSessionKey } from '../core/storage/crypto-utils';
import { getSettings } from '../core/storage/settings-store';
import { calculateBudgetStatus, getBadgeColorForLevel } from './budget-alerts';
import { getAllowlistEntry, withDefaults } from '../core/storage/allowlist-store';

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

// Update badge for a specific tab - shows per-site spending if on allowlisted site
export async function updateBadgeForTab(tabId: number): Promise<void> {
  // Skip if wallet is locked
  if (!(await hasSessionKey())) {
    await chrome.action.setBadgeText({ text: '🔒', tabId });
    await chrome.action.setBadgeBackgroundColor({ color: LOCKED_COLOR, tabId });
    return;
  }

  try {
    // Check if badge is enabled in settings
    const settings = await getSettings();
    if (settings.showBadgeBalance === false) {
      await chrome.action.setBadgeText({ text: '', tabId });
      return;
    }

    // Get the tab to extract its URL
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) {
      // No URL available, show global balance
      await updateBadgeBalance();
      return;
    }

    // Extract origin from URL
    let origin: string;
    try {
      origin = new URL(tab.url).origin;
    } catch {
      // Invalid URL, show global balance
      await updateBadgeBalance();
      return;
    }

    // Check if origin is in allowlist
    const allowlistEntry = await getAllowlistEntry(origin);

    if (allowlistEntry) {
      // Show per-site spending with budget alert color
      const entryWithDefaults = withDefaults(allowlistEntry);
      const budgetStatus = calculateBudgetStatus(entryWithDefaults);
      const text = formatBadgeBalance(entryWithDefaults.dailySpent);
      const color = getBadgeColorForLevel(budgetStatus.overallLevel);

      await chrome.action.setBadgeText({ text, tabId });
      await chrome.action.setBadgeBackgroundColor({ color, tabId });
    } else {
      // Not on allowlisted site, show global balance
      const balances = await getWalletBalances();
      const total = (balances as Array<{ balance: number }>).reduce(
        (sum: number, b: { balance: number }) => sum + b.balance,
        0
      );
      const text = formatBadgeBalance(total);
      await chrome.action.setBadgeText({ text, tabId });
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
    }
  } catch {
    // Silently fail - badge is not critical
  }
}
