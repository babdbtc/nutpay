// Background service worker - main entry point

// Import polyfill first - must be before any other imports
import './polyfill';

import type { ExtensionMessage, PaymentRequiredMessage, ApprovalResponseMessage, AllowlistEntry } from '../shared/types';
import { handlePaymentRequired, cleanupOldPendingPayments } from './request-handler';
import { handleApprovalResponse, handlePopupClosed, handleUnlockComplete, handleUnlockPopupClosed } from './payment-coordinator';
import {
  getWalletBalances,
  receiveToken,
  createLightningReceiveInvoice,
  checkMintQuoteStatus,
  mintProofsFromQuote,
  generateSendToken,
  getMeltQuote,
  payLightningInvoice,
  subscribeMintQuote,
  unsubscribeMintQuote,
} from '../core/wallet/cashu-wallet';
import { getRecentTransactions, getFilteredTransactions } from '../core/storage/transaction-store';
import { getSettings, updateSettings, getMints, addMint, updateMint, removeMint } from '../core/storage/settings-store';
import type { MintConfig } from '../shared/types';
import { getAllowlist, setAllowlistEntry, removeAllowlistEntry, createDefaultAllowlistEntry } from '../core/storage/allowlist-store';
import { getPendingMintQuotes, cleanupOldMintQuotes } from '../core/storage/pending-quote-store';
import { getPendingTokens, cleanupOldPendingTokens } from '../core/storage/pending-token-store';
import { getMintDetails, getMintBalanceDetails, clearWalletCache } from '../core/wallet/mint-manager';
import {
  getSecurityConfig,
  setSecurityConfig,
  isSessionValid,
  extendSession,
  clearSession,
  recordFailedAttempt,
  isAccountLocked,
  storeRecoveryPhrase,
  getRecoveryPhrase,
  removeSecurityConfig,
} from '../core/storage/security-store';
import {
  generateSalt,
  hashCredential,
  verifyCredential,
  generateRecoveryPhrase,
  hashRecoveryPhrase,
  verifyRecoveryPhrase,
  mnemonicToSeed,
  validateMnemonic,
} from '../core/security/auth';
import {
  recoverFromSeed,
  getRecoveryProgress,
  cancelRecovery,
  isRecoveryInProgress,
} from '../core/wallet/recovery-service';
import { storeSeed, hasSeed, getWalletVersion } from '../core/storage/seed-store';
import { getCounters } from '../core/storage/counter-store';
import type { SecurityConfig } from '../shared/types';

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

    // Security
    case 'GET_SECURITY_CONFIG': {
      const config = await getSecurityConfig();
      return config ? { enabled: config.enabled, type: config.type } : { enabled: false };
    }

    case 'SETUP_SECURITY': {
      const msg = message as ExtensionMessage & {
        authType: 'pin' | 'password';
        credential: string;
        generatePhrase: boolean;
      };

      const salt = generateSalt();
      const hash = await hashCredential(msg.credential, salt);

      // Generate BIP39 mnemonic (this IS the recovery phrase)
      const recoveryPhrase = generateRecoveryPhrase();
      const recoveryPhraseHash = await hashRecoveryPhrase(recoveryPhrase);

      // Derive and store the wallet seed for NUT-13
      const seed = mnemonicToSeed(recoveryPhrase);
      await storeSeed(seed);
      clearWalletCache();

      const config: SecurityConfig = {
        enabled: true,
        type: msg.authType,
        hash,
        salt,
        recoveryPhraseHash,
        createdAt: Date.now(),
      };

      await setSecurityConfig(config);
      await storeRecoveryPhrase(recoveryPhrase);
      await extendSession();

      return { success: true, recoveryPhrase };
    }

    case 'VERIFY_AUTH': {
      const msg = message as ExtensionMessage & { credential: string };

      // Check if locked
      const lockStatus = await isAccountLocked();
      if (lockStatus.locked) {
        return { success: false, locked: true, remainingMs: lockStatus.remainingMs };
      }

      const config = await getSecurityConfig();
      if (!config || !config.enabled) {
        return { success: true };
      }

      const isValid = await verifyCredential(msg.credential, config.hash, config.salt);

      if (isValid) {
        await extendSession();
        return { success: true };
      } else {
        const isNowLocked = await recordFailedAttempt();
        if (isNowLocked) {
          const newLockStatus = await isAccountLocked();
          return { success: false, locked: true, remainingMs: newLockStatus.remainingMs };
        }
        return { success: false, error: `Invalid ${config.type}` };
      }
    }

    case 'CHECK_SESSION': {
      const config = await getSecurityConfig();
      if (!config || !config.enabled) {
        return { valid: true, securityEnabled: false };
      }

      const lockStatus = await isAccountLocked();
      if (lockStatus.locked) {
        return { valid: false, locked: true, remainingMs: lockStatus.remainingMs };
      }

      const valid = await isSessionValid();
      return { valid, securityEnabled: true, authType: config.type };
    }

    case 'CLEAR_SESSION': {
      await clearSession();
      return { success: true };
    }

    case 'CHANGE_CREDENTIAL': {
      const msg = message as ExtensionMessage & {
        currentCredential: string;
        newAuthType: 'pin' | 'password';
        newCredential: string;
      };

      const config = await getSecurityConfig();
      if (!config || !config.enabled) {
        return { success: false, error: 'Security not enabled' };
      }

      // Verify current credential
      const isValid = await verifyCredential(msg.currentCredential, config.hash, config.salt);
      if (!isValid) {
        return { success: false, error: `Invalid current ${config.type}` };
      }

      // Create new config
      const newSalt = generateSalt();
      const newHash = await hashCredential(msg.newCredential, newSalt);

      const newConfig: SecurityConfig = {
        ...config,
        type: msg.newAuthType,
        hash: newHash,
        salt: newSalt,
      };

      await setSecurityConfig(newConfig);
      await extendSession();

      return { success: true };
    }

    case 'RECOVER_WITH_PHRASE': {
      const msg = message as ExtensionMessage & {
        phrase: string;
        verify?: boolean;
        newAuthType?: 'pin' | 'password';
        newCredential?: string;
      };

      const config = await getSecurityConfig();

      // First, validate BIP39 mnemonic format
      if (!validateMnemonic(msg.phrase)) {
        return { valid: false, success: false, error: 'Invalid BIP39 mnemonic' };
      }

      // If security is enabled, also verify against stored hash
      if (config?.enabled) {
        const isValid = await verifyRecoveryPhrase(msg.phrase, config.recoveryPhraseHash);
        if (!isValid) {
          return { valid: false, success: false, error: 'Phrase does not match stored wallet' };
        }
      }

      // For verify-only requests
      if (msg.verify) {
        return { valid: true };
      }

      // For full recovery with new credentials
      if (!msg.newAuthType || !msg.newCredential) {
        return { success: false, error: 'New credential required' };
      }

      // Derive and store the seed from the mnemonic
      const seed = mnemonicToSeed(msg.phrase);
      await storeSeed(seed);
      clearWalletCache();

      // Setup new security config with the same mnemonic as recovery phrase
      const newSalt = generateSalt();
      const newHash = await hashCredential(msg.newCredential, newSalt);
      const recoveryPhraseHash = await hashRecoveryPhrase(msg.phrase);

      const newConfig: SecurityConfig = {
        enabled: true,
        type: msg.newAuthType,
        hash: newHash,
        salt: newSalt,
        recoveryPhraseHash,
        createdAt: Date.now(),
      };

      await setSecurityConfig(newConfig);
      await storeRecoveryPhrase(msg.phrase);
      await extendSession();

      return { success: true };
    }

    case 'DISABLE_SECURITY': {
      const msg = message as ExtensionMessage & { credential: string };

      const config = await getSecurityConfig();
      if (!config || !config.enabled) {
        return { success: true };
      }

      const isValid = await verifyCredential(msg.credential, config.hash, config.salt);
      if (!isValid) {
        return { success: false, error: `Invalid ${config.type}` };
      }

      await removeSecurityConfig();
      return { success: true };
    }

    case 'GET_RECOVERY_PHRASE': {
      const msg = message as ExtensionMessage & { credential: string };

      const config = await getSecurityConfig();
      if (!config || !config.enabled) {
        return { success: false, error: 'Security not enabled' };
      }

      const isValid = await verifyCredential(msg.credential, config.hash, config.salt);
      if (!isValid) {
        return { success: false, error: `Invalid ${config.type}` };
      }

      const phrase = await getRecoveryPhrase();
      return { success: true, phrase };
    }

    // NUT-13 Seed Recovery
    case 'GET_WALLET_INFO': {
      const seedExists = await hasSeed();
      const version = await getWalletVersion();
      const counters = await getCounters();
      return {
        hasSeed: seedExists,
        version,
        keysetCount: Object.keys(counters).length,
      };
    }

    case 'SETUP_WALLET_SEED': {
      const msg = message as ExtensionMessage & { mnemonic: string };

      if (!validateMnemonic(msg.mnemonic)) {
        return { success: false, error: 'Invalid mnemonic phrase' };
      }

      const seed = mnemonicToSeed(msg.mnemonic);
      await storeSeed(seed);
      clearWalletCache();

      return { success: true };
    }

    case 'START_SEED_RECOVERY': {
      const msg = message as ExtensionMessage & {
        mnemonic: string;
        mintUrls: string[];
      };

      if (!validateMnemonic(msg.mnemonic)) {
        return { success: false, error: 'Invalid mnemonic phrase' };
      }

      if (isRecoveryInProgress()) {
        return { success: false, error: 'Recovery already in progress' };
      }

      const seed = mnemonicToSeed(msg.mnemonic);

      // Start recovery (this runs in the background)
      recoverFromSeed(seed, msg.mintUrls)
        .then((result) => {
          console.log('[Nutpay] Recovery completed:', result);
        })
        .catch((error) => {
          console.error('[Nutpay] Recovery failed:', error);
        });

      return { success: true, message: 'Recovery started' };
    }

    case 'GET_RECOVERY_PROGRESS': {
      const progress = getRecoveryProgress();
      const inProgress = isRecoveryInProgress();
      return { inProgress, progress };
    }

    case 'CANCEL_RECOVERY': {
      cancelRecovery();
      return { success: true };
    }

    // NUT-17 WebSocket subscriptions
    case 'SUBSCRIBE_MINT_QUOTE': {
      const msg = message as ExtensionMessage & { mintUrl: string; quoteId: string };
      subscribeMintQuote(msg.mintUrl, msg.quoteId, () => {
        // Broadcast MINT_QUOTE_PAID to all extension views (popup, etc.)
        chrome.runtime.sendMessage({
          type: 'MINT_QUOTE_PAID',
          quoteId: msg.quoteId,
          mintUrl: msg.mintUrl,
        }).catch(() => {
          // No listeners — popup may be closed, that's fine
        });
      });
      return { success: true };
    }

    case 'UNSUBSCRIBE_MINT_QUOTE': {
      const msg = message as ExtensionMessage & { quoteId: string };
      unsubscribeMintQuote(msg.quoteId);
      return { success: true };
    }

    default:
      console.warn('[Nutpay] Unknown message type:', message.type);
      return { error: 'Unknown message type' };
  }
}

// Listen for window close events (for approval and unlock popups)
chrome.windows.onRemoved.addListener((windowId) => {
  handlePopupClosed(windowId);
  handleUnlockPopupClosed(windowId);
});

// Periodic cleanup of old pending payments, quotes, and tokens
setInterval(() => {
  cleanupOldPendingPayments();
  cleanupOldMintQuotes();
  cleanupOldPendingTokens();
}, 60000);

// Proof state management (NUT-07)
import { reconcileProofStates, recoverPendingProofs } from '../core/wallet/proof-manager';

// Run immediately on service worker startup:
// 1. Recover any proofs left in PENDING_SPEND state from a killed session
// 2. Reconcile all proof states with mints (remove externally spent proofs)
(async () => {
  try {
    const recovered = await recoverPendingProofs();
    if (recovered > 0) {
      console.log(`[Nutpay] Startup: recovered ${recovered} pending proofs`);
    }
  } catch (error) {
    console.warn('[Nutpay] Startup: pending proof recovery failed:', error);
  }

  try {
    const removed = await reconcileProofStates();
    if (removed > 0) {
      console.log(`[Nutpay] Startup: reconciled ${removed} spent proofs`);
    }
  } catch (error) {
    console.warn('[Nutpay] Startup: proof reconciliation failed:', error);
  }
})();

// Also run periodically every 5 minutes (service worker may stay alive longer)
setInterval(() => {
  reconcileProofStates().catch((error) => {
    console.warn('[Nutpay] Proof reconciliation failed:', error);
  });
}, 5 * 60 * 1000);

// Install handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Nutpay] Extension installed');
  } else if (details.reason === 'update') {
    console.log('[Nutpay] Extension updated');
  }
});

console.log('[Nutpay] Background service worker started');
