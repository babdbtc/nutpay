import { STORAGE_KEYS } from '../../shared/constants';

/**
 * Shared AES-GCM encryption utilities.
 *
 * The encryption key is derived from the user's PIN/password via PBKDF2
 * (100,000 iterations, SHA-256). This means:
 *
 *   1. An attacker who reads chrome.storage.local gets ciphertext + salt,
 *      but NOT the key — they must brute-force the credential.
 *   2. The derived key is cached in chrome.storage.session so it survives
 *      service worker restarts but is cleared when the browser closes.
 *   3. When security is not enabled, a random key is generated and stored
 *      in chrome.storage.session (ephemeral — lost on browser close, but
 *      the wallet is unprotected anyway in that mode).
 *
 * Migration: on first unlock after upgrade, the old random key (if present
 * in storage.local) is used to decrypt existing data, which is then
 * re-encrypted with the new credential-derived key.
 */

/** PBKDF2 iteration count — balances security vs. UX latency. */
const PBKDF2_ITERATIONS = 100_000;

// Chunk-safe binary-to-base64 conversion.
// String.fromCharCode(...largeArray) can exceed the engine's max argument count
// (~65K on V8), causing a stack overflow for large proof stores.
const CHUNK_SIZE = 8192;
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// ── Key derivation ────────────────────────────────────────────────────

/**
 * Derive an AES-GCM-256 key from a credential (PIN/password) and salt
 * using PBKDF2 with 100k iterations of SHA-256.
 */
export async function deriveKeyFromCredential(
  credential: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(credential),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true, // extractable so we can cache in session storage
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random salt for PBKDF2 key derivation.
 */
export function generateEncryptionSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ── Session key cache ─────────────────────────────────────────────────
//
// The derived (or random) CryptoKey is cached in chrome.storage.session
// so it persists across service worker restarts within the same browser
// session. We also keep an in-memory singleton to avoid hitting session
// storage on every encrypt/decrypt call.

let cachedKey: CryptoKey | null = null;

/**
 * Store the derived encryption key in session storage and in-memory cache.
 * Called after successful credential verification or on initial setup.
 */
export async function setSessionKey(key: CryptoKey): Promise<void> {
  cachedKey = key;
  const exported = await crypto.subtle.exportKey('raw', key);
  const keyString = uint8ToBase64(new Uint8Array(exported));
  await chrome.storage.session.set({ [STORAGE_KEYS.ENCRYPTION_KEY]: keyString });
}

/**
 * Clear the session key (on lock / session expiry).
 */
export async function clearSessionKey(): Promise<void> {
  cachedKey = null;
  await chrome.storage.session.remove(STORAGE_KEYS.ENCRYPTION_KEY);
}

/**
 * Get the current encryption key from in-memory cache or session storage.
 * Throws if no key is available (wallet is locked).
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  // Try session storage (survives service worker restart)
  const stored = await chrome.storage.session.get(STORAGE_KEYS.ENCRYPTION_KEY);
  const keyString = stored[STORAGE_KEYS.ENCRYPTION_KEY];

  if (keyString) {
    const keyData = base64ToUint8(keyString);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );
    cachedKey = key;
    return key;
  }

  throw new Error('Wallet is locked — no encryption key available');
}

/**
 * Check whether an encryption key is currently available (wallet unlocked).
 */
export async function hasSessionKey(): Promise<boolean> {
  if (cachedKey) return true;
  const stored = await chrome.storage.session.get(STORAGE_KEYS.ENCRYPTION_KEY);
  return !!stored[STORAGE_KEYS.ENCRYPTION_KEY];
}

// ── Legacy key migration ──────────────────────────────────────────────

/**
 * Read the legacy random encryption key from chrome.storage.local.
 * Returns null if no legacy key exists.
 */
export async function getLegacyKey(): Promise<CryptoKey | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.ENCRYPTION_KEY);
  const keyString = stored[STORAGE_KEYS.ENCRYPTION_KEY];
  if (!keyString) return null;

  const keyData = base64ToUint8(keyString);
  return crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Remove the legacy key from chrome.storage.local after migration.
 */
export async function removeLegacyKey(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.ENCRYPTION_KEY);
}

/**
 * Generate a random AES-GCM-256 key (for no-security mode).
 */
export async function generateRandomKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// ── Encrypt / decrypt with explicit key ───────────────────────────────

/**
 * Encrypt a UTF-8 string with an explicit key.
 * Used during migration to re-encrypt data with the new credential-derived key.
 */
export async function encryptStringWithKey(data: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return uint8ToBase64(combined);
}

/**
 * Decrypt a base64-encoded ciphertext with an explicit key.
 * Used during migration to read data encrypted with the old random key.
 */
export async function decryptStringWithKey(data: string, key: CryptoKey): Promise<string> {
  const combined = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt raw bytes with an explicit key.
 */
export async function encryptBytesWithKey(data: Uint8Array, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const dataBuffer = new Uint8Array(data).buffer as ArrayBuffer;
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return uint8ToBase64(combined);
}

/**
 * Decrypt a base64-encoded ciphertext to raw bytes with an explicit key.
 */
export async function decryptBytesWithKey(data: string, key: CryptoKey): Promise<Uint8Array> {
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

// ── Encrypt / decrypt with session key ────────────────────────────────

/**
 * Encrypt a UTF-8 string to a base64-encoded ciphertext.
 * Used by proof-store and security-store.
 */
export async function encryptString(data: string): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return uint8ToBase64(combined);
}

/**
 * Decrypt a base64-encoded ciphertext back to a UTF-8 string.
 * Used by proof-store and security-store.
 */
export async function decryptString(data: string): Promise<string> {
  const key = await getEncryptionKey();
  const combined = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt raw bytes to a base64-encoded ciphertext.
 * Used by seed-store for Uint8Array seed data.
 */
export async function encryptBytes(data: Uint8Array): Promise<string> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const dataBuffer = new Uint8Array(data).buffer as ArrayBuffer;
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return uint8ToBase64(combined);
}

/**
 * Decrypt a base64-encoded ciphertext back to raw bytes.
 * Used by seed-store for Uint8Array seed data.
 */
export async function decryptBytes(data: string): Promise<Uint8Array> {
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

// ── Data migration ────────────────────────────────────────────────────

/**
 * Migrate encrypted data from the legacy random key (stored in
 * chrome.storage.local) to a new credential-derived key.
 *
 * Reads all encrypted storage entries, decrypts with the old key,
 * re-encrypts with the new key, writes back, then removes the old key.
 *
 * This is idempotent: if no legacy key exists, it's a no-op.
 */
export async function migrateToCredentialKey(newKey: CryptoKey): Promise<void> {
  const oldKey = await getLegacyKey();
  if (!oldKey) return; // Already migrated or fresh install

  const keysToMigrate = [
    STORAGE_KEYS.PROOFS,
    STORAGE_KEYS.RECOVERY_PHRASE_ENCRYPTED,
    STORAGE_KEYS.SEED_ENCRYPTED,
  ] as const;

  const stored = await chrome.storage.local.get([...keysToMigrate]);

  for (const storageKey of keysToMigrate) {
    const ciphertext = stored[storageKey];
    if (!ciphertext) continue;

    try {
      if (storageKey === STORAGE_KEYS.SEED_ENCRYPTED) {
        // Seed is stored as encrypted bytes
        const plainBytes = await decryptBytesWithKey(ciphertext, oldKey);
        const newCiphertext = await encryptBytesWithKey(plainBytes, newKey);
        await chrome.storage.local.set({ [storageKey]: newCiphertext });
      } else {
        // Proofs and recovery phrase are stored as encrypted strings
        const plaintext = await decryptStringWithKey(ciphertext, oldKey);
        const newCiphertext = await encryptStringWithKey(plaintext, newKey);
        await chrome.storage.local.set({ [storageKey]: newCiphertext });
      }
    } catch (error) {
      console.error(`[Nutpay] Migration failed for ${storageKey}:`, error);
      throw new Error(`Failed to migrate encrypted data: ${storageKey}`);
    }
  }

  // Migration complete — remove the legacy key
  await removeLegacyKey();
  console.log('[Nutpay] Successfully migrated encryption to credential-derived key');
}
