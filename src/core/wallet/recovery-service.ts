import { Wallet, type Proof } from '@cashu/cashu-ts';
import { storeProofs } from './proof-manager';
import { setCounters, type KeysetCounters } from '../storage/counter-store';
import { storeSeed } from '../storage/seed-store';
import type { RecoveryProgress, RecoveryResult } from '../../shared/types';
import { normalizeMintUrl } from '../../shared/format';

// Recovery configuration
const BATCH_SIZE = 100; // How many counters to check at once
const EMPTY_BATCHES_BEFORE_STOP = 3; // Stop after this many consecutive empty batches
const MAX_COUNTER = 10000; // Safety limit

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
 * Recover wallet from a BIP39 seed
 * Scans all provided mints for proofs derived from the seed
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

    // Store the seed if recovery was successful
    if (results.totalRecovered > 0 || results.errors.length === 0) {
      await storeSeed(seed);

      // Update counters (add buffer for safety)
      for (const keysetId of Object.keys(finalCounters)) {
        finalCounters[keysetId] += 10; // Buffer to avoid reuse
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
 * Recover proofs from a single mint
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
  // Create a wallet with the seed for recovery
  const wallet = new Wallet(mintUrl, {
    unit: 'sat',
    bip39seed: seed,
  });

  await wallet.loadMint();

  const recoveredProofs: Proof[] = [];
  const keysetCounters: KeysetCounters = {};
  let emptyBatches = 0;
  let counter = 0;

  while (emptyBatches < EMPTY_BATCHES_BEFORE_STOP && counter < MAX_COUNTER) {
    if (recoveryCancelled) {
      break;
    }

    onProgress({
      currentCounter: counter,
      status: 'scanning',
    });

    try {
      // Use NUT-09 restore endpoint to check for proofs at these counters
      const { proofs } = await wallet.restore(counter, BATCH_SIZE);

      if (proofs.length > 0) {
        // Check which proofs are still unspent using NUT-07
        const unspentProofs = await checkUnspentProofs(wallet, proofs);

        if (unspentProofs.length > 0) {
          recoveredProofs.push(...unspentProofs);

          onProgress({
            proofsFound: recoveredProofs.length,
            totalAmount: recoveredProofs.reduce((sum, p) => sum + p.amount, 0),
            status: 'found',
          });

          // Track the highest counter used per keyset
          for (const proof of unspentProofs) {
            const keysetId = proof.id;
            if (!keysetCounters[keysetId] || counter + BATCH_SIZE > keysetCounters[keysetId]) {
              keysetCounters[keysetId] = counter + BATCH_SIZE;
            }
          }
        }

        emptyBatches = 0; // Reset empty batch counter
      } else {
        emptyBatches++;
      }
    } catch (error) {
      // Some mints might not support restore, skip to next batch
      console.warn(`[Nutpay] Restore batch failed at counter ${counter}:`, error);
      emptyBatches++;
    }

    counter += BATCH_SIZE;
  }

  const totalAmount = recoveredProofs.reduce((sum, p) => sum + p.amount, 0);

  return {
    proofs: recoveredProofs,
    amount: totalAmount,
    counters: keysetCounters,
  };
}

/**
 * Check which proofs are unspent using NUT-07 check endpoint
 */
async function checkUnspentProofs(wallet: Wallet, proofs: Proof[]): Promise<Proof[]> {
  try {
    // Use groupProofsByState which returns { unspent, pending, spent }
    const { unspent } = await wallet.groupProofsByState(proofs);
    return unspent;
  } catch (error) {
    console.warn('[Nutpay] Failed to check proof states:', error);
    // If check fails, return all proofs and let the wallet handle it
    return proofs;
  }
}

/**
 * Quick balance check without full recovery
 * Useful for verifying a seed has funds before full recovery
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
      const wallet = new Wallet(normalizeMintUrl(mintUrl), {
        unit: 'sat',
        bip39seed: seed,
      });

      await wallet.loadMint();

      // Just check first few batches for a quick estimate
      let balance = 0;
      for (let counter = 0; counter < 300; counter += BATCH_SIZE) {
        try {
          const { proofs } = await wallet.restore(counter, BATCH_SIZE);
          if (proofs.length > 0) {
            const unspent = await checkUnspentProofs(wallet, proofs);
            balance += unspent.reduce((sum, p) => sum + p.amount, 0);
          }
        } catch {
          break;
        }
      }

      if (balance > 0) {
        mintBalances.push({ mintUrl: normalizeMintUrl(mintUrl), balance });
        totalBalance += balance;
      }
    } catch (error) {
      console.warn(`[Nutpay] Failed to check ${mintUrl}:`, error);
    }
  }

  return { totalBalance, mintBalances };
}
