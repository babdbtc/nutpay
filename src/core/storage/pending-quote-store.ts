import type { PendingMintQuote } from '../../shared/types';
import { STORAGE_KEYS } from '../../shared/constants';

// Get all pending mint quotes
export async function getPendingMintQuotes(): Promise<PendingMintQuote[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PENDING_MINT_QUOTES);
  return stored[STORAGE_KEYS.PENDING_MINT_QUOTES] || [];
}

// Add a pending mint quote
export async function addPendingMintQuote(quote: PendingMintQuote): Promise<void> {
  const quotes = await getPendingMintQuotes();
  quotes.push(quote);
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_MINT_QUOTES]: quotes });
}

// Update a pending mint quote status
export async function updateMintQuoteStatus(
  id: string,
  status: PendingMintQuote['status']
): Promise<void> {
  const quotes = await getPendingMintQuotes();
  const updated = quotes.map((q) =>
    q.id === id ? { ...q, status } : q
  );
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_MINT_QUOTES]: updated });
}

// Get a specific pending mint quote
export async function getPendingMintQuote(id: string): Promise<PendingMintQuote | null> {
  const quotes = await getPendingMintQuotes();
  return quotes.find((q) => q.id === id) || null;
}

// Get pending mint quote by quoteId
export async function getPendingMintQuoteByQuoteId(
  quoteId: string
): Promise<PendingMintQuote | null> {
  const quotes = await getPendingMintQuotes();
  return quotes.find((q) => q.quoteId === quoteId) || null;
}

// Remove a pending mint quote
export async function removePendingMintQuote(id: string): Promise<void> {
  const quotes = await getPendingMintQuotes();
  const updated = quotes.filter((q) => q.id !== id);
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_MINT_QUOTES]: updated });
}

// Clean up expired or completed quotes (older than 1 hour)
export async function cleanupOldMintQuotes(): Promise<void> {
  const quotes = await getPendingMintQuotes();
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  const active = quotes.filter((q) => {
    // Keep if not expired and still pending
    if (q.status === 'pending' && q.expiresAt > Date.now()) {
      return true;
    }
    // Keep paid quotes for a while (to allow minting)
    if (q.status === 'paid' && q.createdAt > oneHourAgo) {
      return true;
    }
    // Remove minted or expired quotes older than 1 hour
    return q.createdAt > oneHourAgo && q.status !== 'minted';
  });

  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_MINT_QUOTES]: active });
}
