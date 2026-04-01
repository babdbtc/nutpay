// Background service worker - main entry point

// Import polyfill first - must be before any other imports
import './polyfill';

import type { ExtensionMessage, PaymentRequiredMessage, ApprovalResponseMessage, AllowlistEntry } from '../shared/types';
import { handlePaymentRequired, cleanupOldPendingPayments } from './request-handler';
import { handleApprovalResponse, handlePopupClosed, handleUnlockComplete, handleUnlockPopupClosed } from './payment-coordinator';
import {
  getWalletBalances,
  decodeTokenAmount,
  createLightningReceiveInvoice,
  checkMintQuoteStatus,
  getMeltQuote,
  unsubscribeMintQuote,
  recoverStuckPendingProofs,
} from '../core/wallet/cashu-wallet';
import { getRecentTransactions, getSpendingByDomain } from '../core/storage/transaction-store';
import { getSettings, getMints, addMint, updateMint, removeMint } from '../core/storage/settings-store';
import type { MintConfig } from '../shared/types';
import { getAllowlist, setAllowlistEntry, removeAllowlistEntry, createDefaultAllowlistEntry } from '../core/storage/allowlist-store';
import { getPendingMintQuotes, cleanupOldMintQuotes } from '../core/storage/pending-quote-store';
import { getPendingTokens, cleanupOldPendingTokens } from '../core/storage/pending-token-store';
import { getSecurityConfig, clearSession } from '../core/storage/security-store';
import { clearSessionKey } from '../core/storage/crypto-utils';
import { reconcileProofStates } from '../core/wallet/proof-manager';
import { updateBadgeBalance } from './badge-manager';
import { handleContextMenuClick } from './context-menu';
import {
  handleAddProofs,
  handleGetFilteredTransactions,
  handleUpdateSettings,
  handleGenerateSendToken,
  handleMeltProofs,
  handleGetMintInfo,
  handleGetMintBalanceDetails,
  handleGetWalletInfo,
  handleSetupWalletSeed,
  handleStartSeedRecovery,
  handleGetRecoveryProgress,
  handleCancelRecovery,
} from './wallet-handlers';
import {
  handleSetupSecurity,
  handleVerifyAuth,
  handleCheckSession,
  handleChangeCredential,
  handleRecoverWithPhrase,
  handleDisableSecurity,
  handleGetRecoveryPhrase,
} from './security-handlers';
import {
  handleMintProofs,
  handleSubscribeMintQuote,
  handleResolveLnurl,
  handleRequestLnurlInvoice,
} from './lightning-handlers';
import { runStartup, setupPeriodicTasks, setupInstallHandler } from './startup';

let pendingReconciliationOnUnlock = false;

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? 0;
  handleMessage(message, tabId)
    .then(sendResponse)
    .catch((error) => {
      console.error('[Nutpay] Message handling error:', error);
      sendResponse({ error: error.message });
    });
  return true;
});

async function handleMessage(message: ExtensionMessage, tabId: number): Promise<unknown> {
  switch (message.type) {
    case 'PAYMENT_REQUIRED': {
      const paymentResult = await handlePaymentRequired(message as PaymentRequiredMessage, tabId);
      if (paymentResult.type === 'PAYMENT_TOKEN') {
        setTimeout(() => updateBadgeBalance(), 500);
      }
      return paymentResult;
    }
    case 'APPROVAL_RESPONSE':
      handleApprovalResponse(message as ApprovalResponseMessage);
      return { success: true };
    case 'UNLOCK_COMPLETE': {
      const msg = message as ExtensionMessage & { requestId: string };
      handleUnlockComplete(msg.requestId);
      return { success: true };
    }
    case 'GET_BALANCE':
      return getWalletBalances();
    case 'GET_TRANSACTIONS':
      return getRecentTransactions((message as ExtensionMessage & { limit?: number }).limit || 10);
    case 'ADD_PROOFS':
      return handleAddProofs(message as Parameters<typeof handleAddProofs>[0]);
    case 'DECODE_TOKEN':
      return decodeTokenAmount((message as ExtensionMessage & { token: string }).token);
    case 'GET_SETTINGS':
      return getSettings();
    case 'UPDATE_SETTINGS':
      return handleUpdateSettings(message as Parameters<typeof handleUpdateSettings>[0]);
    case 'GET_MINTS':
      return getMints();
    case 'ADD_MINT':
      return addMint((message as ExtensionMessage & { mint: MintConfig }).mint);
    case 'UPDATE_MINT': {
      const msg = message as ExtensionMessage & { url: string; updates: Partial<MintConfig> };
      return updateMint(msg.url, msg.updates);
    }
    case 'REMOVE_MINT':
      return removeMint((message as ExtensionMessage & { url: string }).url);
    case 'GET_ALLOWLIST':
      return getAllowlist();
    case 'ADD_TO_ALLOWLIST': {
      const msg = message as ExtensionMessage & { origin: string; autoApprove?: boolean };
      return setAllowlistEntry(createDefaultAllowlistEntry(msg.origin, msg.autoApprove));
    }
    case 'REMOVE_FROM_ALLOWLIST':
      return removeAllowlistEntry((message as ExtensionMessage & { origin: string }).origin);
    case 'UPDATE_ALLOWLIST_ENTRY':
      return setAllowlistEntry((message as ExtensionMessage & { entry: AllowlistEntry }).entry);
    case 'CREATE_MINT_QUOTE': {
      const msg = message as ExtensionMessage & { mintUrl: string; amount: number };
      return createLightningReceiveInvoice(msg.mintUrl, msg.amount);
    }
    case 'CHECK_MINT_QUOTE': {
      const msg = message as ExtensionMessage & { mintUrl: string; quoteId: string };
      return checkMintQuoteStatus(msg.mintUrl, msg.quoteId);
    }
    case 'MINT_PROOFS':
      return handleMintProofs(message as Parameters<typeof handleMintProofs>[0]);
    case 'GET_PENDING_QUOTES':
      return getPendingMintQuotes();
    case 'GENERATE_SEND_TOKEN':
      return handleGenerateSendToken(message as Parameters<typeof handleGenerateSendToken>[0]);
    case 'GET_MELT_QUOTE': {
      const msg = message as ExtensionMessage & { mintUrl: string; invoice: string };
      return getMeltQuote(msg.mintUrl, msg.invoice);
    }
    case 'MELT_PROOFS':
      return handleMeltProofs(message as Parameters<typeof handleMeltProofs>[0]);
    case 'GET_PENDING_TOKENS':
      return getPendingTokens();
    case 'GET_MINT_INFO':
      return handleGetMintInfo(message as Parameters<typeof handleGetMintInfo>[0]);
    case 'GET_MINT_BALANCE_DETAILS':
      return handleGetMintBalanceDetails(message as Parameters<typeof handleGetMintBalanceDetails>[0]);
    case 'GET_FILTERED_TRANSACTIONS':
      return handleGetFilteredTransactions(message as Parameters<typeof handleGetFilteredTransactions>[0]);
    case 'GET_SECURITY_CONFIG': {
      const config = await getSecurityConfig();
      return config ? { enabled: config.enabled, type: config.type } : { enabled: false };
    }
    case 'SETUP_SECURITY':
      return handleSetupSecurity(message as Parameters<typeof handleSetupSecurity>[0]);
    case 'VERIFY_AUTH': {
      const msg = message as ExtensionMessage & { credential: string };
      return handleVerifyAuth(msg, () => {
        if (pendingReconciliationOnUnlock) {
          pendingReconciliationOnUnlock = false;
          reconcileProofStates().catch((error) => {
            console.warn('[Nutpay] Post-unlock reconciliation failed:', error);
          });
          recoverStuckPendingProofs().catch((error) => {
            console.warn('[Nutpay] Post-unlock stuck proof recovery failed:', error);
          });
        }
      });
    }
    case 'CHECK_SESSION':
      return handleCheckSession();
    case 'CLEAR_SESSION':
      await clearSession();
      await clearSessionKey();
      return { success: true };
    case 'CHANGE_CREDENTIAL':
      return handleChangeCredential(message as Parameters<typeof handleChangeCredential>[0]);
    case 'RECOVER_WITH_PHRASE':
      return handleRecoverWithPhrase(message as Parameters<typeof handleRecoverWithPhrase>[0]);
    case 'DISABLE_SECURITY':
      return handleDisableSecurity(message as Parameters<typeof handleDisableSecurity>[0]);
    case 'GET_RECOVERY_PHRASE':
      return handleGetRecoveryPhrase(message as Parameters<typeof handleGetRecoveryPhrase>[0]);
    case 'GET_WALLET_INFO':
      return handleGetWalletInfo();
    case 'SETUP_WALLET_SEED':
      return handleSetupWalletSeed(message as Parameters<typeof handleSetupWalletSeed>[0]);
    case 'START_SEED_RECOVERY':
      return handleStartSeedRecovery(message as Parameters<typeof handleStartSeedRecovery>[0]);
    case 'GET_RECOVERY_PROGRESS':
      return handleGetRecoveryProgress();
    case 'CANCEL_RECOVERY':
      return handleCancelRecovery();
    case 'OPEN_POPUP':
      try {
        if (chrome.action?.openPopup) {
          await chrome.action.openPopup();
        }
      } catch {
        // openPopup may fail if popup is already open or API unavailable
      }
      return { success: true };
    case 'OPEN_SIDE_PANEL': {
      if (chrome.sidePanel) {
        const msg = message as ExtensionMessage & { tabId?: number };
        if (msg.tabId) {
          await (chrome.sidePanel as unknown as { open: (opts: { tabId: number }) => Promise<void> }).open({ tabId: msg.tabId });
        }
      }
      return { success: true };
    }
    case 'GET_SPENDING_BY_DOMAIN':
      return getSpendingByDomain();
    case 'RESOLVE_LNURL':
      return handleResolveLnurl(message as Parameters<typeof handleResolveLnurl>[0]);
    case 'REQUEST_LNURL_INVOICE':
      return handleRequestLnurlInvoice(message as Parameters<typeof handleRequestLnurlInvoice>[0]);
    case 'SUBSCRIBE_MINT_QUOTE':
      return handleSubscribeMintQuote(message as Parameters<typeof handleSubscribeMintQuote>[0]);
    case 'UNSUBSCRIBE_MINT_QUOTE':
      unsubscribeMintQuote((message as ExtensionMessage & { quoteId: string }).quoteId);
      return { success: true };
    default:
      console.warn('[Nutpay] Unknown message type:', message.type);
      return { error: 'Unknown message type' };
  }
}

chrome.windows.onRemoved.addListener((windowId) => {
  handlePopupClosed(windowId);
  handleUnlockPopupClosed(windowId);
});
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

setInterval(() => {
  cleanupOldPendingPayments();
  cleanupOldMintQuotes();
  cleanupOldPendingTokens();
}, 60000);

runStartup((val) => { pendingReconciliationOnUnlock = val; });
setupPeriodicTasks();
setupInstallHandler();

updateBadgeBalance();
console.log('[Nutpay] Background service worker started');
