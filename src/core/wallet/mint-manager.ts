import { CashuMint, CashuWallet } from '@cashu/cashu-ts';
import { getMints, getEnabledMints, addMint } from '../storage/settings-store';
import type { MintConfig } from '../../shared/types';

// Cache of mint connections
const mintConnections = new Map<string, CashuMint>();
const walletConnections = new Map<string, CashuWallet>();

// Get or create a mint connection
export async function getMintConnection(mintUrl: string): Promise<CashuMint> {
  if (mintConnections.has(mintUrl)) {
    return mintConnections.get(mintUrl)!;
  }

  const mint = new CashuMint(mintUrl);
  mintConnections.set(mintUrl, mint);
  return mint;
}

// Get or create a wallet for a mint
export async function getWalletForMint(mintUrl: string): Promise<CashuWallet> {
  if (walletConnections.has(mintUrl)) {
    return walletConnections.get(mintUrl)!;
  }

  const mint = await getMintConnection(mintUrl);
  const wallet = new CashuWallet(mint);

  // Load mint keysets - this is required to know fees and validate proofs
  console.log('[Nutpay] Loading mint keysets for:', mintUrl);
  await wallet.loadMint();
  console.log('[Nutpay] Mint keysets loaded');

  walletConnections.set(mintUrl, wallet);
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
    const info = await getMintInfo(mintUrl);
    const mints = await getMints();

    // Already known
    if (mints.some((m) => m.url === mintUrl)) {
      return mints.find((m) => m.url === mintUrl)!;
    }

    // Add as untrusted by default
    const newMint: MintConfig = {
      url: mintUrl,
      name: info.name || new URL(mintUrl).hostname,
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

  // If requested mint is in our enabled list, use it
  if (enabledMints.some((m) => m.url === requestedMint)) {
    return requestedMint;
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
