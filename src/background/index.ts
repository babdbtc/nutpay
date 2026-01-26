// Background service worker - main entry point

// Import polyfill first - must be before any other imports
import './polyfill';

import type { ExtensionMessage, PaymentRequiredMessage, ApprovalResponseMessage, AllowlistEntry } from '../shared/types';
import { handlePaymentRequired, cleanupOldPendingPayments } from './request-handler';
import { handleApprovalResponse, handlePopupClosed } from './payment-coordinator';
import {
  getWalletBalances,
  receiveToken,
  createLightningReceiveInvoice,
  checkMintQuoteStatus,
  mintProofsFromQuote,
  generateSendToken,
  getMeltQuote,
  payLightningInvoice,
} from '../core/wallet/cashu-wallet';
import { getRecentTransactions, getFilteredTransactions } from '../core/storage/transaction-store';
import { getSettings, updateSettings, getMints, addMint, updateMint, removeMint } from '../core/storage/settings-store';
import type { MintConfig } from '../shared/types';
import { getAllowlist, setAllowlistEntry, removeAllowlistEntry, createDefaultAllowlistEntry } from '../core/storage/allowlist-store';
import { getPendingMintQuotes, cleanupOldMintQuotes } from '../core/storage/pending-quote-store';
import { getPendingTokens, cleanupOldPendingTokens } from '../core/storage/pending-token-store';
import { getMintDetails, getMintBalanceDetails } from '../core/wallet/mint-manager';

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

    case 'ADD_MINT': {
      const msg = message as ExtensionMessage & { mint: MintConfig };
      return addMint(msg.mint);
    }

    case 'UPDATE_MINT': {
      const msg = message as ExtensionMessage & { url: string; updates: Partial<MintConfig> };
      return updateMint(msg.url, msg.updates);
    }

    case 'REMOVE_MINT': {
      const msg = message as ExtensionMessage & { url: string };
      return removeMint(msg.url);
    }

    case 'GET_ALLOWLIST':
      return getAllowlist();

    case 'ADD_TO_ALLOWLIST': {
      const msg = message as ExtensionMessage & { origin: string; autoApprove?: boolean };
      const newEntry = createDefaultAllowlistEntry(msg.origin, msg.autoApprove);
      return setAllowlistEntry(newEntry);
    }

    case 'REMOVE_FROM_ALLOWLIST':
      return removeAllowlistEntry((message as ExtensionMessage & { origin: string }).origin);

    case 'UPDATE_ALLOWLIST_ENTRY': {
      const msg = message as ExtensionMessage & { entry: AllowlistEntry };
      return setAllowlistEntry(msg.entry);
    }

    // Lightning Receive
    case 'CREATE_MINT_QUOTE': {
      const msg = message as ExtensionMessage & { mintUrl: string; amount: number };
      return createLightningReceiveInvoice(msg.mintUrl, msg.amount);
    }

    case 'CHECK_MINT_QUOTE': {
      const msg = message as ExtensionMessage & { mintUrl: string; quoteId: string };
      return checkMintQuoteStatus(msg.mintUrl, msg.quoteId);
    }

    case 'MINT_PROOFS': {
      const msg = message as ExtensionMessage & { mintUrl: string; amount: number; quoteId: string };
      return mintProofsFromQuote(msg.mintUrl, msg.amount, msg.quoteId);
    }

    case 'GET_PENDING_QUOTES':
      return getPendingMintQuotes();

    // Send
    case 'GENERATE_SEND_TOKEN': {
      const msg = message as ExtensionMessage & { mintUrl: string; amount: number };
      return generateSendToken(msg.mintUrl, msg.amount);
    }

    case 'GET_MELT_QUOTE': {
      const msg = message as ExtensionMessage & { mintUrl: string; invoice: string };
      return getMeltQuote(msg.mintUrl, msg.invoice);
    }

    case 'MELT_PROOFS': {
      const msg = message as ExtensionMessage & {
        mintUrl: string;
        invoice: string;
        quoteId: string;
        amount: number;
        feeReserve: number;
      };
      return payLightningInvoice(msg.mintUrl, msg.invoice, msg.quoteId, msg.amount, msg.feeReserve);
    }

    case 'GET_PENDING_TOKENS':
      return getPendingTokens();

    // Mint Info
    case 'GET_MINT_INFO': {
      const msg = message as ExtensionMessage & { mintUrl: string };
      return getMintDetails(msg.mintUrl);
    }

    case 'GET_MINT_BALANCE_DETAILS': {
      const msg = message as ExtensionMessage & { mintUrl: string };
      return getMintBalanceDetails(msg.mintUrl);
    }

    // Filtered Transactions
    case 'GET_FILTERED_TRANSACTIONS': {
      const msg = message as ExtensionMessage & {
        filters?: {
          type?: 'payment' | 'receive';
          status?: 'pending' | 'completed' | 'failed';
          startDate?: number;
          endDate?: number;
        };
        limit?: number;
        offset?: number;
      };
      return getFilteredTransactions(msg.filters, msg.limit, msg.offset);
    }

    default:
      console.warn('[Nutpay] Unknown message type:', message.type);
      return { error: 'Unknown message type' };
  }
}

// Listen for window close events (for approval popup)
chrome.windows.onRemoved.addListener((windowId) => {
  handlePopupClosed(windowId);
});

// Periodic cleanup of old pending payments, quotes, and tokens
setInterval(() => {
  cleanupOldPendingPayments();
  cleanupOldMintQuotes();
  cleanupOldPendingTokens();
}, 60000);

// Install handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Nutpay] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[Nutpay] Extension updated');
  }
});

console.log('[Nutpay] Background service worker started');
