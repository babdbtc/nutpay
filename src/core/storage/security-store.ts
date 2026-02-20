import { STORAGE_KEYS, SECURITY } from '../../shared/constants';
import type { SecurityConfig, SessionState } from '../../shared/types';

/**
 * Get security configuration
 */
export async function getSecurityConfig(): Promise<SecurityConfig | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SECURITY_CONFIG);
  return result[STORAGE_KEYS.SECURITY_CONFIG] || null;
}

/**
 * Save security configuration
 */
export async function setSecurityConfig(config: SecurityConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SECURITY_CONFIG]: config });
}

/**
 * Remove security configuration (disable security)
 */
export async function removeSecurityConfig(): Promise<void> {
  await chrome.storage.local.remove([
    STORAGE_KEYS.SECURITY_CONFIG,
    STORAGE_KEYS.SESSION_STATE,
    STORAGE_KEYS.RECOVERY_PHRASE_ENCRYPTED,
  ]);
}

/**
 * Get session state
 */
export async function getSessionState(): Promise<SessionState> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SESSION_STATE);
  return result[STORAGE_KEYS.SESSION_STATE] || {
    expiresAt: 0,
    failedAttempts: 0,
    lockedUntil: null,
  };
}

/**
 * Update session state
 */
export async function setSessionState(state: SessionState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SESSION_STATE]: state });
}

/**
 * Check if session is valid (not expired)
 */
export async function isSessionValid(): Promise<boolean> {
  const config = await getSecurityConfig();
  if (!config || !config.enabled) {
    return true; // No security = always valid
  }

  const session = await getSessionState();
  return Date.now() < session.expiresAt;
}

/**
 * Extend session after successful authentication
 */
export async function extendSession(): Promise<void> {
  const session = await getSessionState();
  await setSessionState({
    ...session,
    expiresAt: Date.now() + SECURITY.SESSION_TIMEOUT,
    failedAttempts: 0,
    lockedUntil: null,
  });
}

/**
 * Clear session (force re-authentication)
 */
export async function clearSession(): Promise<void> {
  const session = await getSessionState();
  await setSessionState({
    ...session,
    expiresAt: 0,
  });
}

/**
 * Record a failed authentication attempt
 * Returns true if account is now locked
 */
export async function recordFailedAttempt(): Promise<boolean> {
  const session = await getSessionState();
  const newAttempts = session.failedAttempts + 1;

  const isLocked = newAttempts >= SECURITY.MAX_FAILED_ATTEMPTS;

  await setSessionState({
    ...session,
    failedAttempts: newAttempts,
    lockedUntil: isLocked ? Date.now() + SECURITY.LOCKOUT_DURATION : null,
  });

  return isLocked;
}

/**
 * Check if account is locked due to failed attempts
 */
export async function isAccountLocked(): Promise<{ locked: boolean; remainingMs?: number }> {
  const session = await getSessionState();

  if (!session.lockedUntil) {
    return { locked: false };
  }

  const remaining = session.lockedUntil - Date.now();
  if (remaining <= 0) {
    // Lockout expired, reset
    await setSessionState({
      ...session,
      failedAttempts: 0,
      lockedUntil: null,
    });
    return { locked: false };
  }

  return { locked: true, remainingMs: remaining };
}

// Get or create AES-GCM encryption key (shared with proof-store and seed-store)
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

/**
 * Store recovery phrase (AES-GCM encrypted)
 */
export async function storeRecoveryPhrase(phrase: string): Promise<void> {
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(phrase);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  const ciphertext = btoa(String.fromCharCode(...combined));
  await chrome.storage.local.set({ [STORAGE_KEYS.RECOVERY_PHRASE_ENCRYPTED]: ciphertext });
}

/**
 * Get recovery phrase (decrypted, for display in settings)
 */
export async function getRecoveryPhrase(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.RECOVERY_PHRASE_ENCRYPTED);
  const ciphertext = result[STORAGE_KEYS.RECOVERY_PHRASE_ENCRYPTED];
  if (!ciphertext) return null;

  try {
    const key = await getEncryptionKey();
    const combined = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('[Nutpay] Failed to decrypt recovery phrase:', error);
    // Fallback: try legacy base64 decoding for migration
    try {
      return atob(ciphertext);
    } catch {
      return null;
    }
  }
}
