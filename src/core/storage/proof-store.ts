import type { Proof } from '@cashu/cashu-ts';
import type { StoredProof } from '../../shared/types';
import { STORAGE_KEYS } from '../../shared/constants';
import { normalizeMintUrl } from '../../shared/format';

// Simple encryption using Web Crypto API
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

async function encrypt(data: string): Promise<string> {
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

  return btoa(String.fromCharCode(...combined));
}

async function decrypt(data: string): Promise<string> {
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

// Get all stored proofs
export async function getProofs(): Promise<StoredProof[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.PROOFS);
  const encrypted = stored[STORAGE_KEYS.PROOFS];

  if (!encrypted) {
    return [];
  }

  try {
    const decrypted = await decrypt(encrypted);
    return JSON.parse(decrypted);
  } catch {
    console.error('Failed to decrypt proofs');
    return [];
  }
}

// Get proofs for a specific mint (only LIVE proofs, excludes PENDING_SPEND)
export async function getProofsForMint(mintUrl: string): Promise<StoredProof[]> {
  const proofs = await getProofs();
  const normalizedUrl = normalizeMintUrl(mintUrl);
  return proofs.filter(
    (p) => normalizeMintUrl(p.mintUrl) === normalizedUrl && p.status !== 'PENDING_SPEND'
  );
}

// Add new proofs
export async function addProofs(
  proofs: Proof[],
  mintUrl: string
): Promise<void> {
  const existing = await getProofs();
  const now = Date.now();
  const normalizedUrl = normalizeMintUrl(mintUrl);

  const newProofs: StoredProof[] = proofs.map((proof) => ({
    proof,
    mintUrl: normalizedUrl,
    amount: proof.amount,
    dateReceived: now,
  }));

  const updated = [...existing, ...newProofs];
  const encrypted = await encrypt(JSON.stringify(updated));

  await chrome.storage.local.set({ [STORAGE_KEYS.PROOFS]: encrypted });
}

// Remove spent proofs
export async function removeProofs(proofsToRemove: Proof[]): Promise<void> {
  const existing = await getProofs();
  const secretsToRemove = new Set(proofsToRemove.map((p) => p.secret));

  const updated = existing.filter((sp) => !secretsToRemove.has(sp.proof.secret));
  const encrypted = await encrypt(JSON.stringify(updated));

  await chrome.storage.local.set({ [STORAGE_KEYS.PROOFS]: encrypted });
}

// Mark proofs as PENDING_SPEND before sending to mint.
// This makes the spend intent durable: if the service worker dies after the
// mint accepts the proofs but before we clean up, reconciliation will
// detect them as spent and remove them on next startup.
export async function markProofsPendingSpend(proofsToMark: Proof[]): Promise<void> {
  const existing = await getProofs();
  const secrets = new Set(proofsToMark.map((p) => p.secret));

  const updated = existing.map((sp) =>
    secrets.has(sp.proof.secret) ? { ...sp, status: 'PENDING_SPEND' as const } : sp
  );

  const encrypted = await encrypt(JSON.stringify(updated));
  await chrome.storage.local.set({ [STORAGE_KEYS.PROOFS]: encrypted });
}

// After a successful mint operation, remove the pending proofs and store change.
// This is the "finalize" step that completes the atomic spend.
export async function finalizePendingSpend(
  spentProofs: Proof[],
  changeProofs: Proof[],
  mintUrl: string
): Promise<void> {
  const existing = await getProofs();
  const secretsToRemove = new Set(spentProofs.map((p) => p.secret));
  const now = Date.now();
  const normalizedUrl = normalizeMintUrl(mintUrl);

  // Remove the spent proofs
  const remaining = existing.filter((sp) => !secretsToRemove.has(sp.proof.secret));

  // Add change proofs
  const newProofs = changeProofs.map((proof) => ({
    proof,
    mintUrl: normalizedUrl,
    amount: proof.amount,
    dateReceived: now,
    status: 'LIVE' as const,
  }));

  const updated = [...remaining, ...newProofs];
  const encrypted = await encrypt(JSON.stringify(updated));
  await chrome.storage.local.set({ [STORAGE_KEYS.PROOFS]: encrypted });
}

// Get proofs that are in PENDING_SPEND state (for recovery on startup)
export async function getPendingSpendProofs(): Promise<StoredProof[]> {
  const proofs = await getProofs();
  return proofs.filter((sp) => sp.status === 'PENDING_SPEND');
}

// Revert pending proofs back to LIVE (if mint operation failed and proofs are unspent)
export async function revertPendingProofs(proofsToRevert: Proof[]): Promise<void> {
  const existing = await getProofs();
  const secrets = new Set(proofsToRevert.map((p) => p.secret));

  const updated = existing.map((sp) =>
    secrets.has(sp.proof.secret) && sp.status === 'PENDING_SPEND'
      ? { ...sp, status: 'LIVE' as const }
      : sp
  );

  const encrypted = await encrypt(JSON.stringify(updated));
  await chrome.storage.local.set({ [STORAGE_KEYS.PROOFS]: encrypted });
}

// Get total balance by mint (only counts LIVE proofs)
export async function getBalanceByMint(): Promise<Map<string, number>> {
  const proofs = await getProofs();
  const balances = new Map<string, number>();

  for (const sp of proofs) {
    // Skip PENDING_SPEND proofs — they're in-flight and shouldn't count toward balance
    if (sp.status === 'PENDING_SPEND') continue;

    const normalizedUrl = normalizeMintUrl(sp.mintUrl);
    const current = balances.get(normalizedUrl) || 0;
    balances.set(normalizedUrl, current + sp.amount);
  }

  return balances;
}

// Get total balance across all mints (only LIVE proofs)
export async function getTotalBalance(): Promise<number> {
  const proofs = await getProofs();
  return proofs
    .filter((sp) => sp.status !== 'PENDING_SPEND')
    .reduce((sum, sp) => sum + sp.amount, 0);
}

// Select proofs for a payment (greedy algorithm)
export async function selectProofsForPayment(
  mintUrl: string,
  amount: number
): Promise<{ proofs: Proof[]; total: number } | null> {
  // getProofsForMint already normalizes the URL
  const available = await getProofsForMint(mintUrl);

  // Sort by amount descending for greedy selection
  available.sort((a, b) => b.amount - a.amount);

  const selected: Proof[] = [];
  let total = 0;

  for (const sp of available) {
    if (total >= amount) break;
    selected.push(sp.proof);
    total += sp.amount;
  }

  if (total < amount) {
    return null; // Insufficient funds
  }

  return { proofs: selected, total };
}
