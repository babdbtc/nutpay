import type { ExtensionMessage } from '../shared/types';
import type { SecurityConfig } from '../shared/types';
import {
  getSecurityConfig,
  setSecurityConfig,
  isSessionValid,
  extendSession,
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
import { storeSeed } from '../core/storage/seed-store';
import { clearWalletCache } from '../core/wallet/mint-manager';
import { STORAGE_KEYS } from '../shared/constants';
import { updateBadgeBalance } from './badge-manager';

export async function ensureNoSecurityKey(): Promise<void> {
  if (await hasSessionKey()) return;

  const legacyKey = await getLegacyKey();

  if (legacyKey) {
    await setSessionKey(legacyKey);
    await removeLegacyKey();
    console.log('[Nutpay] Migrated legacy encryption key to session storage');
  } else {
    const key = await generateRandomKey();
    await setSessionKey(key);
  }
}

export async function handleSetupSecurity(
  msg: ExtensionMessage & {
    authType: 'pin' | 'password';
    credential: string;
    generatePhrase: boolean;
  }
): Promise<unknown> {
  const salt = generateSalt();
  const hash = await hashCredential(msg.credential, salt);

  const encKey = await deriveKey(msg.credential, salt);

  await migrateToCredentialKey(encKey);
  await setSessionKey(encKey);

  const recoveryPhrase = generateRecoveryPhrase();
  const recoveryPhraseHash = await hashRecoveryPhrase(recoveryPhrase);

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

export async function handleVerifyAuth(
  msg: ExtensionMessage & { credential: string },
  onSuccessfulUnlock: () => void
): Promise<unknown> {
  const lockStatus = await isAccountLocked();
  if (lockStatus.locked) {
    return { success: false, locked: true, remainingMs: lockStatus.remainingMs };
  }

  const config = await getSecurityConfig();
  if (!config || !config.enabled) {
    return { success: true };
  }

  const authResult = await verifyCredentialAndDeriveKey(msg.credential, config.hash, config.salt);

  if (authResult.valid && authResult.key) {
    await setSessionKey(authResult.key);
    await extendSession();
    setTimeout(() => updateBadgeBalance(), 300);
    onSuccessfulUnlock();
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

export async function handleCheckSession(): Promise<unknown> {
  const config = await getSecurityConfig();
  if (!config || !config.enabled) {
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

export async function handleChangeCredential(
  msg: ExtensionMessage & {
    currentCredential: string;
    newAuthType: 'pin' | 'password';
    newCredential: string;
  }
): Promise<unknown> {
  const config = await getSecurityConfig();
  if (!config || !config.enabled) {
    return { success: false, error: 'Security not enabled' };
  }

  const isValid = await verifyCredential(msg.currentCredential, config.hash, config.salt);
  if (!isValid) {
    return { success: false, error: `Invalid current ${config.type}` };
  }

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

export async function handleRecoverWithPhrase(
  msg: ExtensionMessage & {
    phrase: string;
    verify?: boolean;
    newAuthType?: 'pin' | 'password';
    newCredential?: string;
  }
): Promise<unknown> {
  const config = await getSecurityConfig();

  if (!validateMnemonic(msg.phrase)) {
    return { valid: false, success: false, error: 'Invalid BIP39 mnemonic' };
  }

  if (config?.enabled) {
    const isValid = await verifyRecoveryPhrase(msg.phrase, config.recoveryPhraseHash);
    if (!isValid) {
      return { valid: false, success: false, error: 'Phrase does not match stored wallet' };
    }
  }

  if (msg.verify) {
    return { valid: true };
  }

  if (!msg.newAuthType || !msg.newCredential) {
    return { success: false, error: 'New credential required' };
  }

  const newSalt = generateSalt();
  const newHash = await hashCredential(msg.newCredential, newSalt);
  const newEncKey = await deriveKey(msg.newCredential, newSalt);

  await migrateToCredentialKey(newEncKey);
  await setSessionKey(newEncKey);

  const seed = mnemonicToSeed(msg.phrase);
  await storeSeed(seed);
  clearWalletCache();

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

export async function handleDisableSecurity(
  msg: ExtensionMessage & { credential: string }
): Promise<unknown> {
  const config = await getSecurityConfig();
  if (!config || !config.enabled) {
    return { success: true };
  }

  const isValid = await verifyCredential(msg.credential, config.hash, config.salt);
  if (!isValid) {
    return { success: false, error: `Invalid ${config.type}` };
  }

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

  await setSessionKey(randomKey);
  await removeSecurityConfig();
  return { success: true };
}

export async function handleGetRecoveryPhrase(
  msg: ExtensionMessage & { credential: string }
): Promise<unknown> {
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
