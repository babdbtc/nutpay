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
import { getRecentTransactions, getFilteredTransactions, getSpendingByDomain } from '../core/storage/transaction-store';
import { getSettings, updateSettings, getMints, addMint, updateMint, removeMint } from '../core/storage/settings-store';
import type { MintConfig } from '../shared/types';
import { getAllowlist, setAllowlistEntry, removeAllowlistEntry, createDefaultAllowlistEntry } from '../core/storage/allowlist-store';
import { STORAGE_KEYS } from '../shared/constants';
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
  verifyCredentialAndDeriveKey,
  deriveKey,
  generateRecoveryPhrase,
  hashRecoveryPhrase,
  verifyRecoveryPhrase,
  mnemonicToSeed,
  validateMnemonic,
} from '../core/security/auth';
import {
  setSessionKey,
  clearSessionKey,
  hasSessionKey,
  generateRandomKey,
  migrateToCredentialKey,
  encryptStringWithKey,
  encryptBytesWithKey,
  decryptString as decryptStringDirect,
  decryptBytes as decryptBytesDirect,
  getLegacyKey,
  removeLegacyKey,
} from '../core/storage/crypto-utils';
import {
  recoverFromSeed,
  getRecoveryProgress,
  cancelRecovery,
  isRecoveryInProgress,
} from '../core/wallet/recovery-service';
import { resolveLnurlPay, requestLnurlInvoice } from '../core/protocol/lnurl';
import { storeSeed, hasSeed, getWalletVersion } from '../core/storage/seed-store';
import { getCounters } from '../core/storage/counter-store';
import type { SecurityConfig } from '../shared/types';
import { updateBadgeBalance } from './badge-manager';
import { setupContextMenus, handleContextMenuClick } from './context-menu';

// Ensure a random encryption key is in session storage for no-security mode.
// This handles: fresh install, browser restart, security disabled.
// For no-security wallets, we also perform one-time migration from the
// legacy random key stored in chrome.storage.local.
async function ensureNoSecurityKey(): Promise<void> {
  if (await hasSessionKey()) return;

  const legacyKey = await getLegacyKey();

  if (legacyKey) {
    // Legacy key exists — use it as the session key and remove from local storage
    await setSessionKey(legacyKey);
    await removeLegacyKey();
    console.log('[Nutpay] Migrated legacy encryption key to session storage');
  } else {
    // No legacy key — generate a new random key
    const key = await generateRandomKey();
    await setSessionKey(key);
  }
}

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
    case 'PAYMENT_REQUIRED': {
      const paymentResult = await handlePaymentRequired(message as PaymentRequiredMessage, tabId);
      if (paymentResult.type === 'PAYMENT_TOKEN') {
        // Balance changed - update badge after a short delay for the swap to finalize
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

    case 'ADD_PROOFS': {
      const addResult = await receiveToken((message as ExtensionMessage & { token: string }).token);
      if ((addResult as { success: boolean }).success) {
        setTimeout(() => updateBadgeBalance(), 500);
      }
      return addResult;
    }

    case 'GET_SETTINGS':
      return getSettings();

    case 'UPDATE_SETTINGS': {
      const settingsMsg = message as ExtensionMessage & { settings: Parameters<typeof updateSettings>[0] };
      const result = await updateSettings(settingsMsg.settings);
      // Refresh badge if the badge setting was changed
      if ('showBadgeBalance' in settingsMsg.settings) {
        setTimeout(() => updateBadgeBalance(), 100);
      }
      return result;
    }

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
      const mintResult = await mintProofsFromQuote(msg.mintUrl, msg.amount, msg.quoteId);
      if ((mintResult as { success: boolean }).success) {
        setTimeout(() => updateBadgeBalance(), 500);
      }
      return mintResult;
    }

    case 'GET_PENDING_QUOTES':
      return getPendingMintQuotes();

    // Send
    case 'GENERATE_SEND_TOKEN': {
      const msg = message as ExtensionMessage & { mintUrl: string; amount: number };
      const sendResult = await generateSendToken(msg.mintUrl, msg.amount);
      if ((sendResult as { success: boolean }).success) {
        setTimeout(() => updateBadgeBalance(), 500);
      }
      return sendResult;
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
      const meltResult = await payLightningInvoice(msg.mintUrl, msg.invoice, msg.quoteId, msg.amount, msg.feeReserve);
      if ((meltResult as { success: boolean }).success) {
        setTimeout(() => updateBadgeBalance(), 500);
      }
      return meltResult;
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

      // Derive encryption key from credential and cache in session
      const encKey = await deriveKey(msg.credential, salt);

      // Migrate any existing data encrypted with the legacy random key
      await migrateToCredentialKey(encKey);
      await setSessionKey(encKey);

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

      // Verify credential and derive encryption key in one PBKDF2 pass
      const authResult = await verifyCredentialAndDeriveKey(msg.credential, config.hash, config.salt);

      if (authResult.valid && authResult.key) {
        await setSessionKey(authResult.key);
        await extendSession();
        // Wallet unlocked - update badge to show balance
        setTimeout(() => updateBadgeBalance(), 300);
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
        // No security — ensure a random encryption key exists in session
        await ensureNoSecurityKey();
        return { valid: true, securityEnabled: false };
      }

      const lockStatus = await isAccountLocked();
      if (lockStatus.locked) {
        return { valid: false, locked: true, remainingMs: lockStatus.remainingMs };
      }

      const valid = await isSessionValid();
      // Session time may still be valid, but after a browser restart
      // chrome.storage.session is wiped — the encryption key is gone.
      // Treat as locked so the user re-authenticates and the key is re-derived.
      const keyAvailable = await hasSessionKey();
      return { valid: valid && keyAvailable, securityEnabled: true, authType: config.type };
    }

    case 'CLEAR_SESSION': {
      await clearSession();
      await clearSessionKey();
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

      // Derive new encryption key from the new credential
      const newSalt = generateSalt();
      const newHash = await hashCredential(msg.newCredential, newSalt);
      const newEncKey = await deriveKey(msg.newCredential, newSalt);

      // Re-encrypt all data with the new key.
      // The current session key can decrypt the data; we read plaintext
      // then encrypt with the new key.
      const proofStore = await chrome.storage.local.get(STORAGE_KEYS.PROOFS);
      const seedStore = await chrome.storage.local.get(STORAGE_KEYS.SEED_ENCRYPTED);
      const phraseStore = await chrome.storage.local.get(STORAGE_KEYS.RECOVERY_PHRASE_ENCRYPTED);

      if (proofStore[STORAGE_KEYS.PROOFS]) {
        const plain = await decryptStringDirect(proofStore[STORAGE_KEYS.PROOFS]);
        const reEncrypted = await encryptStringWithKey(plain, newEncKey);
        await chrome.storage.local.set({ [STORAGE_KEYS.PROOFS]: reEncrypted });
      }

      if (seedStore[STORAGE_KEYS.SEED_ENCRYPTED]) {
        const plain = await decryptBytesDirect(seedStore[STORAGE_KEYS.SEED_ENCRYPTED]);
        const reEncrypted = await encryptBytesWithKey(plain, newEncKey);
        await chrome.storage.local.set({ [STORAGE_KEYS.SEED_ENCRYPTED]: reEncrypted });
      }

      if (phraseStore[STORAGE_KEYS.RECOVERY_PHRASE_ENCRYPTED]) {
        const plain = await decryptStringDirect(phraseStore[STORAGE_KEYS.RECOVERY_PHRASE_ENCRYPTED]);
        const reEncrypted = await encryptStringWithKey(plain, newEncKey);
        await chrome.storage.local.set({ [STORAGE_KEYS.RECOVERY_PHRASE_ENCRYPTED]: reEncrypted });
      }

      // Switch to the new key
      await setSessionKey(newEncKey);

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

      // Derive new encryption key from the new credential
      const newSalt = generateSalt();
      const newHash = await hashCredential(msg.newCredential, newSalt);
      const newEncKey = await deriveKey(msg.newCredential, newSalt);

      // Migrate any data encrypted with legacy key, then switch to new key
      await migrateToCredentialKey(newEncKey);
      await setSessionKey(newEncKey);

      // Derive and store the seed from the mnemonic
      const seed = mnemonicToSeed(msg.phrase);
      await storeSeed(seed);
      clearWalletCache();

      // Setup new security config with the same mnemonic as recovery phrase
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

      // Re-encrypt data with a random key (since there's no credential to derive from)
      const randomKey = await generateRandomKey();

      const stores = await chrome.storage.local.get([
        STORAGE_KEYS.PROOFS,
        STORAGE_KEYS.SEED_ENCRYPTED,
      ]);

      if (stores[STORAGE_KEYS.PROOFS]) {
        const plain = await decryptStringDirect(stores[STORAGE_KEYS.PROOFS]);
        const reEncrypted = await encryptStringWithKey(plain, randomKey);
        await chrome.storage.local.set({ [STORAGE_KEYS.PROOFS]: reEncrypted });
      }

      if (stores[STORAGE_KEYS.SEED_ENCRYPTED]) {
        const plain = await decryptBytesDirect(stores[STORAGE_KEYS.SEED_ENCRYPTED]);
        const reEncrypted = await encryptBytesWithKey(plain, randomKey);
        await chrome.storage.local.set({ [STORAGE_KEYS.SEED_ENCRYPTED]: reEncrypted });
      }

      // Recovery phrase gets removed with security config, no need to re-encrypt

      await setSessionKey(randomKey);
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

    // Side panel
    case 'OPEN_SIDE_PANEL': {
      if (chrome.sidePanel) {
        const msg = message as ExtensionMessage & { tabId?: number };
        if (msg.tabId) {
          await (chrome.sidePanel as unknown as { open: (opts: { tabId: number }) => Promise<void> }).open({ tabId: msg.tabId });
        }
      }
      return { success: true };
    }

    // Spending analytics
    case 'GET_SPENDING_BY_DOMAIN':
      return getSpendingByDomain();

    // LNURL-pay (LUD-06/16)
    case 'RESOLVE_LNURL': {
      const msg = message as ExtensionMessage & { input: string };
      try {
        const params = await resolveLnurlPay(msg.input);
        return { success: true, params };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to resolve Lightning address',
        };
      }
    }

    case 'REQUEST_LNURL_INVOICE': {
      const msg = message as ExtensionMessage & {
        callback: string;
        amountMsat: number;
        comment?: string;
      };
      try {
        const result = await requestLnurlInvoice(msg.callback, msg.amountMsat, msg.comment);
        return { success: true, ...result };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get invoice from LNURL service',
        };
      }
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

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

// Periodic cleanup of old pending payments, quotes, and tokens
setInterval(() => {
  cleanupOldPendingPayments();
  cleanupOldMintQuotes();
  cleanupOldPendingTokens();
}, 60000);

// Proof state management (NUT-07)
import { reconcileProofStates, recoverPendingProofs } from '../core/wallet/proof-manager';

// Run immediately on service worker startup:
// 1. Ensure encryption key is available (for no-security wallets)
// 2. Recover any proofs left in PENDING_SPEND state from a killed session
// 3. Reconcile all proof states with mints (remove externally spent proofs)
(async () => {
  // For no-security wallets, ensure a session key exists so proof access works.
  // For security-enabled wallets, the key is set on unlock — startup
  // reconciliation will be skipped until the user unlocks.
  const config = await getSecurityConfig();
  if (!config || !config.enabled) {
    await ensureNoSecurityKey();
  } else {
    // Security is enabled — only proceed if session key is available
    if (!(await hasSessionKey())) {
      console.log('[Nutpay] Startup: wallet locked, skipping proof reconciliation');
      return;
    }
  }

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

  // Update badge after startup reconciliation
  updateBadgeBalance();
})();

// Also run periodically every 5 minutes (service worker may stay alive longer)
setInterval(async () => {
  // Skip if wallet is locked (no encryption key available)
  if (!(await hasSessionKey())) return;

  reconcileProofStates().catch((error) => {
    console.warn('[Nutpay] Proof reconciliation failed:', error);
  });
}, 5 * 60 * 1000);

// Install handler
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[Nutpay] Extension installed');
    // Setup context menus on install
    setupContextMenus();
    // Enable side panel to open on action click (user can toggle)
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
    }
  } else if (details.reason === 'update') {
    console.log('[Nutpay] Extension updated');
    // Re-create context menus on update
    setupContextMenus();
  }
});

// Update badge on startup
updateBadgeBalance();

console.log('[Nutpay] Background service worker started');
