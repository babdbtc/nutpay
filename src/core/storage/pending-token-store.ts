import type { PendingToken } from '../../shared/types';
import { STORAGE_KEYS } from '../../shared/constants';

const MAX_PENDING_TOKENS = 50;

// Get all pending tokens
export async function getPendingTokens(): Promise<PendingToken[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PENDING_TOKENS);
  return stored[STORAGE_KEYS.PENDING_TOKENS] || [];
}

// Add a pending token (for recovery)
export async function addPendingToken(token: PendingToken): Promise<void> {
  const tokens = await getPendingTokens();
  const updated = [token, ...tokens].slice(0, MAX_PENDING_TOKENS);
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_TOKENS]: updated });
}

// Update a pending token status
export async function updatePendingTokenStatus(
  id: string,
  status: PendingToken['status']
): Promise<void> {
  const tokens = await getPendingTokens();
  const updated = tokens.map((t) =>
    t.id === id ? { ...t, status } : t
  );
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_TOKENS]: updated });
}

// Get a specific pending token
export async function getPendingToken(id: string): Promise<PendingToken | null> {
  const tokens = await getPendingTokens();
  return tokens.find((t) => t.id === id) || null;
}

// Remove a pending token
export async function removePendingToken(id: string): Promise<void> {
  const tokens = await getPendingTokens();
  const updated = tokens.filter((t) => t.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_TOKENS]: updated });
}

// Get pending tokens by status
export async function getPendingTokensByStatus(
  status: PendingToken['status']
): Promise<PendingToken[]> {
  const tokens = await getPendingTokens();
  return tokens.filter((t) => t.status === status);
}

// Clean up old pending tokens:
// - claimed/expired: remove after 24 hours
// - pending: remove after 7 days (likely stuck/abandoned)
export async function cleanupOldPendingTokens(): Promise<void> {
  const tokens = await getPendingTokens();
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const active = tokens.filter((t) => {
    if (t.status === 'pending') {
      // Keep pending tokens for up to 7 days
      return t.createdAt > sevenDaysAgo;
    }
    // Keep recent claimed/expired for reference
    return t.createdAt > oneDayAgo;
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_TOKENS]: active });
}
