import { STORAGE_KEYS } from '../../shared/constants';

/**
 * Shared AES-GCM encryption utilities.
 *
 * All stores (proof-store, seed-store, security-store) share a single
 * AES-GCM-256 key persisted in chrome.storage.local under STORAGE_KEYS.ENCRYPTION_KEY.
 * This module is the single source of truth for key management and
 * encrypt/decrypt operations.
 */

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

// Singleton promise guard: ensures only one getEncryptionKey call runs at a time.
// Without this, two concurrent calls on first access would both generate different
// keys and the loser's encrypted data becomes permanently unrecoverable.
let keyPromise: Promise<CryptoKey> | null = null;

function getEncryptionKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = getEncryptionKeyInner().catch((err) => {
      // Reset so a retry can succeed
      keyPromise = null;
      throw err;
    });
  }
  return keyPromise;
}

async function getEncryptionKeyInner(): Promise<CryptoKey> {
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
  const keyString = uint8ToBase64(new Uint8Array(exported));
  await chrome.storage.local.set({ [STORAGE_KEYS.ENCRYPTION_KEY]: keyString });

  return key;
}

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
