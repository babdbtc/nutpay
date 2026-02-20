import { Wallet, Mint, hasValidDleq, type Proof, type MintKeyset } from '@cashu/cashu-ts';
import { storeProofs } from './proof-manager';
import { setCounters, type KeysetCounters } from '../storage/counter-store';
import { storeSeed } from '../storage/seed-store';
import type { RecoveryProgress, RecoveryResult } from '../../shared/types';
import { normalizeMintUrl } from '../../shared/format';
import { clearWalletCache } from './mint-manager';

// Recovery configuration
const GAP_LIMIT = 3; // Stop after this many consecutive empty batches
const BATCH_SIZE = 100; // How many counters to check per batch

// In-memory recovery state
let recoveryInProgress = false;
let recoveryCancelled = false;
let currentProgress: RecoveryProgress[] = [];

/**
 * Check if recovery is in progress
 */
export function isRecoveryInProgress(): boolean {
  return recoveryInProgress;
}

/**
 * Get current recovery progress
 */
export function getRecoveryProgress(): RecoveryProgress[] {
  return [...currentProgress];
}

/**
 * Cancel an in-progress recovery
 */
export function cancelRecovery(): void {
  recoveryCancelled = true;
}

/**
 * Recover wallet from a BIP39 seed.
 * Scans all provided mints for proofs derived from the seed,
 * including both active and inactive keysets.
 */
export async function recoverFromSeed(
  seed: Uint8Array,
  mintUrls: string[],
  onProgress?: (progress: RecoveryProgress) => void
): Promise<RecoveryResult> {
  if (recoveryInProgress) {
    return {
      success: false,
      totalRecovered: 0,
      mintResults: [],
      errors: ['Recovery already in progress'],
    };
  }

  recoveryInProgress = true;
  recoveryCancelled = false;
  currentProgress = [];

  const results: RecoveryResult = {
    success: true,
    totalRecovered: 0,
    mintResults: [],
    errors: [],
  };

  const finalCounters: KeysetCounters = {};

  try {
    for (const mintUrl of mintUrls) {
      if (recoveryCancelled) {
        results.errors.push('Recovery cancelled by user');
        break;
      }

      const normalizedUrl = normalizeMintUrl(mintUrl);
      const progress: RecoveryProgress = {
        mintUrl: normalizedUrl,
        status: 'scanning',
        proofsFound: 0,
        totalAmount: 0,
        currentCounter: 0,
      };
      currentProgress.push(progress);
      onProgress?.(progress);

      try {
        const mintResult = await recoverFromMint(seed, normalizedUrl, (p) => {
          Object.assign(progress, p);
          onProgress?.(progress);
        });

        if (mintResult.proofs.length > 0) {
          // Store recovered proofs
          await storeProofs(mintResult.proofs, normalizedUrl);

          // Track counters for each keyset
          for (const [keysetId, counter] of Object.entries(mintResult.counters)) {
            if (!finalCounters[keysetId] || counter > finalCounters[keysetId]) {
              finalCounters[keysetId] = counter;
            }
          }

          results.mintResults.push({
            mintUrl: normalizedUrl,
            amount: mintResult.amount,
            proofCount: mintResult.proofs.length,
          });
          results.totalRecovered += mintResult.amount;
        }

        progress.status = 'complete';
        onProgress?.(progress);
      } catch (error) {
        progress.status = 'error';
        progress.errorMessage = error instanceof Error ? error.message : 'Unknown error';
        onProgress?.(progress);
        results.errors.push(`${normalizedUrl}: ${progress.errorMessage}`);
      }
    }

    // Only store the seed if we actually recovered proofs.
    // This prevents a wrong mnemonic (which finds nothing) from overwriting
    // the real seed. Initial wallet setup stores the seed via SETUP_SECURITY
    // or SETUP_WALLET_SEED handlers — recovery should only persist on success.
    if (results.totalRecovered > 0) {
      await storeSeed(seed);
      clearWalletCache();

      // Update counters with safety buffer to avoid reuse
      for (const keysetId of Object.keys(finalCounters)) {
        finalCounters[keysetId] += GAP_LIMIT * BATCH_SIZE;
      }
      await setCounters(finalCounters);
    }

    results.success = results.errors.length === 0;
  } finally {
    recoveryInProgress = false;
  }

  return results;
}

/**
 * Recover proofs from a single mint.
 * Scans ALL keysets (active + inactive) for the wallet's unit.
 */
async function recoverFromMint(
  seed: Uint8Array,
  mintUrl: string,
  onProgress: (progress: Partial<RecoveryProgress>) => void
): Promise<{
  proofs: Proof[];
  amount: number;
  counters: KeysetCounters;
}> {
  // First, get all keysets from the mint (including inactive ones)
  const mint = new Mint(mintUrl);
  const { keysets: allKeysets } = await mint.getKeySets();

  // Filter to keysets matching our unit (sat)
  const relevantKeysets = allKeysets.filter((ks: MintKeyset) => ks.unit === 'sat');

  if (relevantKeysets.length === 0) {
    return { proofs: [], amount: 0, counters: {} };
  }

  // Create a wallet with the seed
  const wallet = new Wallet(mintUrl, {
    unit: 'sat',
    bip39seed: seed,
  });
  await wallet.loadMint();

  const recoveredProofs: Proof[] = [];
  const keysetCounters: KeysetCounters = {};

  // Scan each keyset separately (active + inactive)
  for (const keyset of relevantKeysets) {
    if (recoveryCancelled) break;

    onProgress({
      status: 'scanning',
      currentCounter: 0,
    });

    try {
      // Use batchRestore for this specific keyset
      // This handles the batch loop, gap detection, and counter tracking
      const { proofs, lastCounterWithSignature } = await wallet.batchRestore(
        GAP_LIMIT,
        BATCH_SIZE,
        0, // Start from counter 0
        keyset.id
      );

      if (proofs.length > 0) {
        // NUT-12: Verify DLEQ on restored proofs if mint supports it
        const verifiedProofs = await verifyRestoredProofsDleq(wallet, proofs, keyset.id);

        // Check which proofs are still unspent using NUT-07
        const unspent = await checkUnspentProofs(wallet, verifiedProofs);

        if (unspent.length > 0) {
          recoveredProofs.push(...unspent);

          // Track the highest counter for this keyset
          if (lastCounterWithSignature !== undefined) {
            keysetCounters[keyset.id] = lastCounterWithSignature + 1;
          }

          onProgress({
            proofsFound: recoveredProofs.length,
            totalAmount: recoveredProofs.reduce((sum, p) => sum + p.amount, 0),
            status: 'found',
          });
        }
      }
    } catch (error) {
      // Log but continue with other keysets
      console.warn(`[Nutpay] Failed to restore keyset ${keyset.id}:`, error);
    }
  }

  const totalAmount = recoveredProofs.reduce((sum, p) => sum + p.amount, 0);

  return {
    proofs: recoveredProofs,
    amount: totalAmount,
    counters: keysetCounters,
  };
}

/**
 * NUT-12: Verify DLEQ proofs on restored proofs.
 * Logs warnings for proofs with invalid DLEQ but does NOT reject them during
 * recovery — the user likely wants their funds back even if DLEQ is missing
 * (e.g., proofs minted before the mint added NUT-12 support).
 */
async function verifyRestoredProofsDleq(
  wallet: Wallet,
  proofs: Proof[],
  keysetId: string
): Promise<Proof[]> {
  try {
    const mintInfo = await wallet.mint.getLazyMintInfo();
    const nut12Support = mintInfo.isSupported(12);
    if (!nut12Support.supported) return proofs;

    const keyset = wallet.getKeyset(keysetId);
    let invalidCount = 0;
    for (const proof of proofs) {
      if (!hasValidDleq(proof, keyset)) {
        invalidCount++;
      }
    }
    if (invalidCount > 0) {
      console.warn(`[Nutpay] Recovery: ${invalidCount}/${proofs.length} proofs have invalid/missing DLEQ for keyset ${keysetId}`);
    }
  } catch (error) {
    // Don't fail recovery over DLEQ check errors
    console.warn('[Nutpay] Recovery: DLEQ verification skipped:', error);
  }
  return proofs;
}

/**
 * Check which proofs are unspent using NUT-07 check endpoint
 */
async function checkUnspentProofs(wallet: Wallet, proofs: Proof[]): Promise<Proof[]> {
  try {
    const { unspent } = await wallet.groupProofsByState(proofs);
    return unspent;
  } catch (error) {
    console.warn('[Nutpay] Failed to check proof states:', error);
    // If check fails, return all proofs and let the wallet handle it
    return proofs;
  }
}

/**
 * Quick balance check without full recovery.
 * Useful for verifying a seed has funds before full recovery.
 */
export async function checkSeedBalance(
  seed: Uint8Array,
  mintUrls: string[]
): Promise<{
  totalBalance: number;
  mintBalances: Array<{ mintUrl: string; balance: number }>;
}> {
  const mintBalances: Array<{ mintUrl: string; balance: number }> = [];
  let totalBalance = 0;

  for (const mintUrl of mintUrls) {
    try {
      const normalizedUrl = normalizeMintUrl(mintUrl);
      const wallet = new Wallet(normalizedUrl, {
        unit: 'sat',
        bip39seed: seed,
      });

      await wallet.loadMint();

      // Quick scan: just the first few batches with the default keyset
      const { proofs } = await wallet.batchRestore(2, BATCH_SIZE);

      if (proofs.length > 0) {
        const unspent = await checkUnspentProofs(wallet, proofs);
        const balance = unspent.reduce((sum, p) => sum + p.amount, 0);

        if (balance > 0) {
          mintBalances.push({ mintUrl: normalizedUrl, balance });
          totalBalance += balance;
        }
      }
    } catch (error) {
      console.warn(`[Nutpay] Failed to check ${mintUrl}:`, error);
    }
  }

  return { totalBalance, mintBalances };
}
