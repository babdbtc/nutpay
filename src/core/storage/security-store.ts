import { STORAGE_KEYS, SECURITY } from '../../shared/constants';
import type { SecurityConfig, SessionState } from '../../shared/types';
import { encryptString, decryptString } from './crypto-utils';

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

/**
 * Store recovery phrase (AES-GCM encrypted)
 */
export async function storeRecoveryPhrase(phrase: string): Promise<void> {
  const ciphertext = await encryptString(phrase);
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
    return await decryptString(ciphertext);
  } catch (error) {
    console.error('[Nutpay] Failed to decrypt recovery phrase:', error);
    // Fallback: try legacy base64 decoding for migration.
    // Validate the result looks like a BIP39 mnemonic (multiple words, ASCII only)
    // to avoid returning garbage from AES-GCM ciphertext decoded as base64.
    try {
      const decoded = atob(ciphertext);
      const words = decoded.trim().split(/\s+/);
      if (words.length >= 12 && words.every((w) => /^[a-z]+$/.test(w))) {
        return decoded;
      }
      return null;
    } catch {
      return null;
    }
  }
}
