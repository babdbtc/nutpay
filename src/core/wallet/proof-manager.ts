import type { Proof } from '@cashu/cashu-ts';
import {
  getProofs,
  getProofsForMint,
  addProofs,
  removeProofs,
  getBalanceByMint,
  getTotalBalance,
} from '../storage/proof-store';
import { getWalletForMint } from './mint-manager';

export interface ProofSelection {
  proofs: Proof[];
  total: number;
  change: number;
}

// Select proofs for a payment amount
// Uses a combination of exact match seeking and greedy selection
export async function selectProofs(
  mintUrl: string,
  amount: number
): Promise<ProofSelection | null> {
  const storedProofs = await getProofsForMint(mintUrl);
  const proofs = storedProofs.map((sp) => sp.proof);

  if (proofs.length === 0) {
    return null;
  }

  const totalAvailable = proofs.reduce((sum, p) => sum + p.amount, 0);

  if (totalAvailable < amount) {
    return null;
  }

  // Try to find exact match first (minimizes change)
  const exactMatch = findExactMatch(proofs, amount);
  if (exactMatch) {
    return {
      proofs: exactMatch,
      total: amount,
      change: 0,
    };
  }

  // Fall back to greedy selection
  return greedySelect(proofs, amount);
}

// Find proofs that exactly match the target amount
function findExactMatch(proofs: Proof[], target: number): Proof[] | null {
  // Sort by amount for consistent results
  const sorted = [...proofs].sort((a, b) => b.amount - a.amount);

  // Use subset sum dynamic programming for small amounts
  if (target <= 10000 && proofs.length <= 50) {
    return subsetSum(sorted, target);
  }

  return null;
}

// Subset sum algorithm to find exact match
function subsetSum(proofs: Proof[], target: number): Proof[] | null {
  const dp: Map<number, Proof[]>[] = Array(proofs.length + 1)
    .fill(null)
    .map(() => new Map());

  dp[0].set(0, []);

  for (let i = 0; i < proofs.length; i++) {
    const proof = proofs[i];

    // Copy previous row
    for (const [sum, selected] of dp[i]) {
      if (!dp[i + 1].has(sum)) {
        dp[i + 1].set(sum, selected);
      }

      const newSum = sum + proof.amount;
      if (newSum <= target && !dp[i + 1].has(newSum)) {
        dp[i + 1].set(newSum, [...selected, proof]);
      }
    }
  }

  return dp[proofs.length].get(target) || null;
}

// Greedy selection - take largest proofs until we have enough
function greedySelect(proofs: Proof[], amount: number): ProofSelection {
  const sorted = [...proofs].sort((a, b) => b.amount - a.amount);
  const selected: Proof[] = [];
  let total = 0;

  for (const proof of sorted) {
    if (total >= amount) break;
    selected.push(proof);
    total += proof.amount;
  }

  return {
    proofs: selected,
    total,
    change: total - amount,
  };
}

// Store new proofs received (from change or external source)
export async function storeProofs(
  proofs: Proof[],
  mintUrl: string
): Promise<void> {
  await addProofs(proofs, mintUrl);
}

// Mark proofs as spent
export async function spendProofs(proofs: Proof[]): Promise<void> {
  await removeProofs(proofs);
}

// Swap proofs for better denominations (consolidation)
export async function consolidateProofs(mintUrl: string): Promise<void> {
  const wallet = await getWalletForMint(mintUrl);
  const storedProofs = await getProofsForMint(mintUrl);
  const proofs = storedProofs.map((sp) => sp.proof);

  if (proofs.length < 5) {
    // Not worth consolidating
    return;
  }

  const total = proofs.reduce((sum, p) => sum + p.amount, 0);

  try {
    // Swap all proofs for new ones with optimal denominations
    const { send, keep } = await wallet.send(total, proofs, {
      includeFees: true,
    });

    // Remove old proofs and add new ones
    await removeProofs(proofs);
    await addProofs([...send, ...keep], mintUrl);
  } catch (error) {
    console.error('Failed to consolidate proofs:', error);
  }
}

// Reconcile proof states with mints (NUT-07)
// Removes proofs that have been spent externally
export async function reconcileProofStates(): Promise<number> {
  const allStoredProofs = await getProofs();
  if (allStoredProofs.length === 0) return 0;

  // Group proofs by mint
  const byMint = new Map<string, typeof allStoredProofs>();
  for (const sp of allStoredProofs) {
    const existing = byMint.get(sp.mintUrl) || [];
    existing.push(sp);
    byMint.set(sp.mintUrl, existing);
  }

  let removedCount = 0;

  for (const [mintUrl, storedProofs] of byMint) {
    try {
      const wallet = await getWalletForMint(mintUrl);
      const proofs = storedProofs.map((sp) => sp.proof);

      const { spent } = await wallet.groupProofsByState(proofs);

      if (spent.length > 0) {
        await removeProofs(spent);
        removedCount += spent.length;
        console.log(`[Nutpay] Reconciled ${spent.length} spent proofs from ${mintUrl}`);
      }
    } catch (error) {
      // Don't fail the whole reconciliation if one mint is unreachable
      console.warn(`[Nutpay] Failed to reconcile proofs for ${mintUrl}:`, error);
    }
  }

  return removedCount;
}

// Re-export balance functions
export { getBalanceByMint, getTotalBalance, getProofs, getProofsForMint };
