// Background service worker - main entry point

import type { ExtensionMessage, PaymentRequiredMessage, ApprovalResponseMessage } from '../shared/types';
import { handlePaymentRequired, cleanupOldPendingPayments } from './request-handler';
import { handleApprovalResponse, handlePopupClosed } from './payment-coordinator';
import { getWalletBalances, receiveToken } from '../core/wallet/cashu-wallet';
import { getRecentTransactions } from '../core/storage/transaction-store';
import { getSettings, updateSettings, getMints } from '../core/storage/settings-store';
import { getAllowlist, setAllowlistEntry, removeAllowlistEntry, createDefaultAllowlistEntry } from '../core/storage/allowlist-store';

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  // Get tab ID from sender
  const tabId = sender.tab?.id ?? 0;

  handleMessage(message, tabId)
    .then(sendResponse)
    .catch((error) => {
      console.error('[Nutpay] Message handling error:', error);
      sendResponse({ error: error.message });
    });

  // Return true to indicate async response
  return true;
});

// Handle different message types
async function handleMessage(
  message: ExtensionMessage,
  tabId: number
): Promise<unknown> {
  switch (message.type) {
    case 'PAYMENT_REQUIRED':
      return handlePaymentRequired(message as PaymentRequiredMessage, tabId);

    case 'APPROVAL_RESPONSE':
      handleApprovalResponse(message as ApprovalResponseMessage);
      return { success: true };

    case 'GET_BALANCE':
      return getWalletBalances();

    case 'GET_TRANSACTIONS':
      return getRecentTransactions((message as ExtensionMessage & { limit?: number }).limit || 10);

    case 'ADD_PROOFS':
      return receiveToken((message as ExtensionMessage & { token: string }).token);

    case 'GET_SETTINGS':
      return getSettings();

    case 'UPDATE_SETTINGS':
      return updateSettings((message as ExtensionMessage & { settings: Parameters<typeof updateSettings>[0] }).settings);

    case 'GET_MINTS':
      return getMints();

    case 'GET_ALLOWLIST':
      return getAllowlist();

    case 'ADD_TO_ALLOWLIST': {
      const msg = message as ExtensionMessage & { origin: string; autoApprove?: boolean };
      const newEntry = createDefaultAllowlistEntry(msg.origin, msg.autoApprove);
      return setAllowlistEntry(newEntry);
    }

    case 'REMOVE_FROM_ALLOWLIST':
      return removeAllowlistEntry((message as ExtensionMessage & { origin: string }).origin);

    default:
      console.warn('[Nutpay] Unknown message type:', message.type);
      return { error: 'Unknown message type' };
  }
}

// Listen for window close events (for approval popup)
chrome.windows.onRemoved.addListener((windowId) => {
  handlePopupClosed(windowId);
});

// Periodic cleanup of old pending payments
setInterval(cleanupOldPendingPayments, 60000);

// Install handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Nutpay] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[Nutpay] Extension updated');
  }
});

console.log('[Nutpay] Background service worker started');
