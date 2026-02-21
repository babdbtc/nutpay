import { STORAGE_KEYS, WALLET_VERSIONS } from '../../shared/constants';
import { encryptBytes as encrypt, decryptBytes as decrypt } from './crypto-utils';

/**
 * Store the wallet seed (encrypted)
 */
export async function storeSeed(seed: Uint8Array): Promise<void> {
  const encryptedSeed = await encrypt(seed);
  await chrome.storage.local.set({
    [STORAGE_KEYS.SEED_ENCRYPTED]: encryptedSeed,
    [STORAGE_KEYS.WALLET_VERSION]: WALLET_VERSIONS.V2_DETERMINISTIC,
  });
}

/**
 * Get the stored seed (decrypted)
 */
export async function getSeed(): Promise<Uint8Array | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SEED_ENCRYPTED);
  const encrypted = result[STORAGE_KEYS.SEED_ENCRYPTED];

  if (!encrypted) {
    return null;
  }

  try {
    return await decrypt(encrypted);
  } catch (error) {
    // CRITICAL: Do NOT return null here. Returning null causes callers to
    // silently fall back to random (non-deterministic) secrets, making all
    // future proofs unrecoverable from the seed. Throw instead so callers
    // fail visibly rather than silently degrading wallet security.
    console.error('[Nutpay] Failed to decrypt seed — refusing to return null:', error);
    throw new Error('Failed to decrypt wallet seed');
  }
}

/**
 * Check if a seed exists
 */
export async function hasSeed(): Promise<boolean> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SEED_ENCRYPTED);
  return !!result[STORAGE_KEYS.SEED_ENCRYPTED];
}

/**
 * Clear the stored seed (use with caution!)
 */
export async function clearSeed(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.SEED_ENCRYPTED,
    STORAGE_KEYS.KEYSET_COUNTERS,
  ]);
}

/**
 * Get the wallet version
 */
export async function getWalletVersion(): Promise<number> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.WALLET_VERSION);
  return result[STORAGE_KEYS.WALLET_VERSION] || WALLET_VERSIONS.V1_LEGACY;
}

/**
 * Check if wallet needs migration to v2
 */
export async function needsMigration(): Promise<boolean> {
  const version = await getWalletVersion();
  return version < WALLET_VERSIONS.V2_DETERMINISTIC;
}
