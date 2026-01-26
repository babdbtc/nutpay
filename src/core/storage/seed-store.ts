import { STORAGE_KEYS, WALLET_VERSIONS } from '../../shared/constants';

// Use same encryption key as proof-store for consistency
async function getEncryptionKey(): Promise<CryptoKey> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTION_KEY);

  if (stored[STORAGE_KEYS.ENCRYPTION_KEY]) {
    const keyData = Uint8Array.from(
      atob(stored[STORAGE_KEYS.ENCRYPTION_KEY]),
      (c) => c.charCodeAt(0)
    );
    return crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // Generate new key
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const exported = await crypto.subtle.exportKey('raw', key);
  const keyString = btoa(String.fromCharCode(...new Uint8Array(exported)));
  await chrome.storage.local.set({ [STORAGE_KEYS.ENCRYPTION_KEY]: keyString });

  return key;
}

async function encrypt(data: Uint8Array): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Create a new ArrayBuffer copy to ensure proper typing
  const dataBuffer = new Uint8Array(data).buffer as ArrayBuffer;
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decrypt(data: string): Promise<Uint8Array> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );

  return new Uint8Array(decrypted);
}

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
    console.error('[Nutpay] Failed to decrypt seed:', error);
    return null;
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
