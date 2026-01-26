import { CashuMint, CashuWallet } from '@cashu/cashu-ts';
import { getMints, getEnabledMints, addMint } from '../storage/settings-store';
import { getProofs } from '../storage/proof-store';
import type { MintConfig } from '../../shared/types';
import { normalizeMintUrl } from '../../shared/format';

// Cache of mint connections
const mintConnections = new Map<string, CashuMint>();
const walletConnections = new Map<string, CashuWallet>();

// Get or create a mint connection
export async function getMintConnection(mintUrl: string): Promise<CashuMint> {
  const normalizedUrl = normalizeMintUrl(mintUrl);
  if (mintConnections.has(normalizedUrl)) {
    return mintConnections.get(normalizedUrl)!;
  }

  const mint = new CashuMint(normalizedUrl);
  mintConnections.set(normalizedUrl, mint);
  return mint;
}

// Get or create a wallet for a mint
export async function getWalletForMint(mintUrl: string): Promise<CashuWallet> {
  const normalizedUrl = normalizeMintUrl(mintUrl);
  if (walletConnections.has(normalizedUrl)) {
    return walletConnections.get(normalizedUrl)!;
  }

  const mint = await getMintConnection(normalizedUrl);
  const wallet = new CashuWallet(mint);

  // Load mint keysets - this is required to know fees and validate proofs
  console.log('[Nutpay] Loading mint keysets for:', normalizedUrl);
  await wallet.loadMint();
  console.log('[Nutpay] Mint keysets loaded');

  walletConnections.set(normalizedUrl, wallet);
  return wallet;
}

// Get mint info
export async function getMintInfo(
  mintUrl: string
): Promise<{ name?: string; version?: string }> {
  try {
    const mint = await getMintConnection(mintUrl);
    const info = await mint.getInfo();
    return {
      name: info.name,
      version: info.version,
    };
  } catch {
    return {};
  }
}

// Check if a mint is reachable
export async function checkMintHealth(mintUrl: string): Promise<boolean> {
  try {
    const mint = await getMintConnection(mintUrl);
    await mint.getInfo();
    return true;
  } catch {
    return false;
  }
}

// Discover and auto-add a mint from a payment request
export async function discoverMint(mintUrl: string): Promise<MintConfig | null> {
  try {
    const normalizedUrl = normalizeMintUrl(mintUrl);
    const info = await getMintInfo(normalizedUrl);
    const mints = await getMints();

    // Already known
    const existing = mints.find((m) => normalizeMintUrl(m.url) === normalizedUrl);
    if (existing) {
      return existing;
    }

    // Add as untrusted by default
    const newMint: MintConfig = {
      url: normalizedUrl,
      name: info.name || new URL(normalizedUrl).hostname,
      enabled: true,
      trusted: false,
    };

    await addMint(newMint);
    return newMint;
  } catch {
    return null;
  }
}

// Find the best mint that can fulfill a payment
export async function findMintForPayment(
  requestedMint: string,
  _amount: number
): Promise<string | null> {
  const enabledMints = await getEnabledMints();
  const normalizedRequested = normalizeMintUrl(requestedMint);

  // If requested mint is in our enabled list, use it (return the normalized URL)
  const matchingMint = enabledMints.find((m) => normalizeMintUrl(m.url) === normalizedRequested);
  if (matchingMint) {
    return normalizeMintUrl(matchingMint.url);
  }

  // Otherwise, we need the exact mint specified
  // In the future, we could implement cross-mint swaps here
  return null;
}

// Clear cached connections (useful for testing or after settings change)
export function clearMintCache(): void {
  mintConnections.clear();
  walletConnections.clear();
}

// Get detailed mint information
export async function getMintDetails(mintUrl: string): Promise<{
  name: string;
  version?: string;
  description?: string;
  contact?: string[];
  motd?: string;
  nuts?: Record<string, unknown>;
  online: boolean;
}> {
  try {
    const mint = await getMintConnection(mintUrl);
    const info = await mint.getInfo();

    return {
      name: info.name || new URL(mintUrl).hostname,
      version: info.version,
      description: info.description,
      contact: info.contact?.map((c) =>
        Array.isArray(c) ? c.join(': ') : String(c)
      ),
      motd: info.motd,
      nuts: info.nuts,
      online: true,
    };
  } catch (error) {
    return {
      name: new URL(mintUrl).hostname,
      online: false,
    };
  }
}

// Get mint balance details including proof count and denominations
export async function getMintBalanceDetails(mintUrl: string): Promise<{
  balance: number;
  proofCount: number;
  denominations: Record<number, number>;
}> {
  const allProofs = await getProofs();
  const normalizedUrl = normalizeMintUrl(mintUrl);
  const storedProofs = allProofs.filter((p) => normalizeMintUrl(p.mintUrl) === normalizedUrl);

  const balance = storedProofs.reduce((sum, sp) => sum + sp.amount, 0);
  const proofCount = storedProofs.length;

  // Count denominations
  const denominations: Record<number, number> = {};
  for (const sp of storedProofs) {
    const amount = sp.proof.amount;
    denominations[amount] = (denominations[amount] || 0) + 1;
  }

  return {
    balance,
    proofCount,
    denominations,
  };
}
