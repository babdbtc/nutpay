import { getEncodedTokenV4, CheckStateEnum, getPubKeyFromPrivKey, type Proof, type MintQuoteResponse, type MeltQuoteResponse } from '@cashu/cashu-ts';
import { getWalletForMint, mintSupportsNut } from './mint-manager';
import {
  selectProofsForSpend,
  storeProofs,
  finalizePendingSpend,
  revertPendingProofs,
  getBalanceByMint,
} from './proof-manager';
import { getPendingSpendProofs, removeProofs } from '../storage/proof-store';
import { addTransaction } from '../storage/transaction-store';
import { addPendingMintQuote, updateMintQuoteStatus, getPendingMintQuoteByQuoteId } from '../storage/pending-quote-store';
import { addPendingToken, updatePendingTokenStatus } from '../storage/pending-token-store';
import { hasSeed, getSeed } from '../storage/seed-store';
import type { PendingMintQuote, MeltQuoteInfo, PendingToken } from '../../shared/types';
import { normalizeMintUrl } from '../../shared/format';
import { verifyDleqIfSupported } from './wallet-internals';

// Derive a deterministic secp256k1 keypair from the BIP39 seed for NUT-20 quote binding.
// SHA-256 with a domain label keeps this key separate from cashu-ts BIP32 derivation.
async function deriveNut20Keypair(seed: Uint8Array): Promise<{ privkeyHex: string; pubkeyHex: string }> {
  const label = new TextEncoder().encode('cashu-nut20');
  const material = new Uint8Array(seed.length + label.length);
  material.set(seed);
  material.set(label, seed.length);
  const privkeyBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
  const pubkeyBytes = getPubKeyFromPrivKey(privkeyBytes);
  const toHex = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
  return { privkeyHex: toHex(privkeyBytes), pubkeyHex: toHex(pubkeyBytes) };
}

// ==================== Lightning Receive ====================

// Create a Lightning invoice for receiving sats (mint quote)
export async function createLightningReceiveInvoice(
  mintUrl: string,
  amount: number
): Promise<{
  success: boolean;
  quote?: PendingMintQuote;
  error?: string;
}> {
  try {
    const normalizedUrl = normalizeMintUrl(mintUrl);
    const wallet = await getWalletForMint(normalizedUrl);

    // NUT-20: bind quote to wallet pubkey if supported, preventing quote hijacking
    const seedExists = await hasSeed();
    const nut20Supported = seedExists && await mintSupportsNut(normalizedUrl, 20);
    let mintQuote: MintQuoteResponse;
    if (nut20Supported) {
      const seed = await getSeed();
      const { pubkeyHex } = await deriveNut20Keypair(seed!);
      mintQuote = await wallet.createLockedMintQuote(amount, pubkeyHex);
    } else {
      mintQuote = await wallet.createMintQuote(amount);
    }

    // Calculate expiry (default to 1 hour if not provided)
    const expiresAt = mintQuote.expiry
      ? mintQuote.expiry * 1000
      : Date.now() + 60 * 60 * 1000;

    const pendingQuote: PendingMintQuote = {
      id: `mq-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      quoteId: mintQuote.quote,
      mintUrl: normalizedUrl,
      amount,
      invoice: mintQuote.request,
      createdAt: Date.now(),
      expiresAt,
      status: 'pending',
    };

    await addPendingMintQuote(pendingQuote);

    return { success: true, quote: pendingQuote };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create invoice',
    };
  }
}

// Check if a mint quote has been paid
export async function checkMintQuoteStatus(
  mintUrl: string,
  quoteId: string
): Promise<{
  paid: boolean;
  error?: string;
}> {
  try {
    const wallet = await getWalletForMint(normalizeMintUrl(mintUrl));
    const status = await wallet.checkMintQuote(quoteId);

    if (status.state === 'PAID') {
      // Update local status
      const quote = await getPendingMintQuoteByQuoteId(quoteId);
      if (quote) {
        await updateMintQuoteStatus(quote.id, 'paid');
      }
      return { paid: true };
    }

    return { paid: false };
  } catch (error) {
    return {
      paid: false,
      error: error instanceof Error ? error.message : 'Failed to check quote status',
    };
  }
}

// Mint proofs after invoice is paid
export async function mintProofsFromQuote(
  mintUrl: string,
  amount: number,
  quoteId: string
): Promise<{
  success: boolean;
  amount?: number;
  error?: string;
}> {
  try {
    const normalizedUrl = normalizeMintUrl(mintUrl);
    const wallet = await getWalletForMint(normalizedUrl);

    // Mint the proofs using v3 ops API
    const seedExists = await hasSeed();
    let proofs: Proof[];

    // Get the mint quote first for the ops builder
    const mintQuote = await wallet.checkMintQuote(quoteId);

    if (seedExists) {
      // NUT-13 deterministic secrets; NUT-20: sign locked quote when quote.pubkey is set
      const builder = wallet.ops.mintBolt11(amount, mintQuote).asDeterministic(0);
      if (mintQuote.pubkey) {
        const seed = await getSeed();
        const { privkeyHex } = await deriveNut20Keypair(seed!);
        proofs = await builder.privkey(privkeyHex).run();
      } else {
        proofs = await builder.run();
      }
    } else {
      // Legacy: random secrets
      proofs = await wallet.mintProofs(amount, quoteId);
    }

    // NUT-12: Verify DLEQ on freshly minted proofs
    await verifyDleqIfSupported(wallet, proofs, normalizedUrl);

    // Store the proofs
    await storeProofs(proofs, normalizedUrl);

    const totalMinted = proofs.reduce((sum, p) => sum + p.amount, 0);

    // Update quote status
    const quote = await getPendingMintQuoteByQuoteId(quoteId);
    if (quote) {
      await updateMintQuoteStatus(quote.id, 'minted');
    }

    // Record transaction
    await addTransaction({
      type: 'receive',
      amount: totalMinted,
      unit: 'sat',
      mintUrl: normalizedUrl,
      origin: 'Lightning',
      status: 'completed',
    });

    return { success: true, amount: totalMinted };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mint proofs',
    };
  }
}

// ==================== NUT-17 Mint Quote Subscription ====================

// Active mint quote subscriptions (quoteId -> cancel function)
const mintQuoteSubscriptions = new Map<string, () => void>();

// Subscribe to a mint quote's payment status.
// Uses NUT-17 WebSocket if supported, falls back to HTTP polling.
// Calls onPaid callback when the quote transitions to PAID.
export async function subscribeMintQuote(
  mintUrl: string,
  quoteId: string,
  onPaid: () => void
): Promise<void> {
  // Don't double-subscribe
  if (mintQuoteSubscriptions.has(quoteId)) return;

  const normalizedUrl = normalizeMintUrl(mintUrl);
  const wallet = await getWalletForMint(normalizedUrl);

  // Check NUT-17 support
  const wsSupported = await mintSupportsNut(normalizedUrl, 17);

  if (wsSupported) {
    try {
      // NUT-17: Subscribe via WebSocket — resolves once when quote becomes PAID
      const controller = new AbortController();
      mintQuoteSubscriptions.set(quoteId, () => controller.abort());

      wallet.on.onceMintPaid(quoteId, {
        signal: controller.signal,
        timeoutMs: 10 * 60 * 1000, // 10 minute timeout
      }).then(() => {
        mintQuoteSubscriptions.delete(quoteId);
        onPaid();
      }).catch((err) => {
        mintQuoteSubscriptions.delete(quoteId);
        // AbortError means intentional cancel — don't log
        if ((err as Error).name !== 'AbortError') {
          console.warn('[Nutpay] WS mint quote subscription ended:', err);
          // Fall back to polling on WS failure
          startMintQuotePolling(normalizedUrl, quoteId, onPaid);
        }
      });

      console.log(`[Nutpay] NUT-17 WS subscription active for quote ${quoteId}`);
      return;
    } catch (error) {
      console.warn('[Nutpay] Failed to start WS subscription, falling back to polling:', error);
    }
  }

  // Fallback: HTTP polling
  startMintQuotePolling(normalizedUrl, quoteId, onPaid);
}

function startMintQuotePolling(mintUrl: string, quoteId: string, onPaid: () => void): void {
  // Don't double-subscribe
  if (mintQuoteSubscriptions.has(quoteId)) return;

  const intervalId = setInterval(async () => {
    try {
      const result = await checkMintQuoteStatus(mintUrl, quoteId);
      if (result.paid) {
        clearInterval(intervalId);
        mintQuoteSubscriptions.delete(quoteId);
        onPaid();
      }
    } catch {
      // Continue polling on transient errors
    }
  }, 5000); // 5 second poll interval (less aggressive than the old 3s)

  mintQuoteSubscriptions.set(quoteId, () => {
    clearInterval(intervalId);
    mintQuoteSubscriptions.delete(quoteId);
  });

  console.log(`[Nutpay] Polling fallback active for quote ${quoteId}`);
}

// Cancel a mint quote subscription
export function unsubscribeMintQuote(quoteId: string): void {
  const cancel = mintQuoteSubscriptions.get(quoteId);
  if (cancel) {
    cancel();
    mintQuoteSubscriptions.delete(quoteId);
  }
}

// ==================== Send Lightning (Melt) ====================

const meltQuoteCache = new Map<string, { quote: MeltQuoteResponse; addedAt: number }>();

// Get a melt quote for a Lightning invoice
export async function getMeltQuote(
  mintUrl: string,
  invoice: string
): Promise<{
  success: boolean;
  quote?: MeltQuoteInfo;
  error?: string;
}> {
  try {
    const wallet = await getWalletForMint(normalizeMintUrl(mintUrl));
    const meltQuote: MeltQuoteResponse = await wallet.createMeltQuote(invoice);

    for (const [key, entry] of meltQuoteCache) {
      if (Date.now() - entry.addedAt > 10 * 60 * 1000) {
        meltQuoteCache.delete(key);
      }
    }
    meltQuoteCache.set(meltQuote.quote, { quote: meltQuote, addedAt: Date.now() });

    return {
      success: true,
      quote: {
        quote: meltQuote.quote,
        amount: meltQuote.amount,
        fee: meltQuote.fee_reserve,
        expiry: meltQuote.expiry || Math.floor(Date.now() / 1000) + 600,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get melt quote',
    };
  }
}

// Pay a Lightning invoice (melt proofs)
export async function payLightningInvoice(
  mintUrl: string,
  invoice: string,
  quoteId: string,
  amount: number,
  feeReserve: number
): Promise<{
  success: boolean;
  preimage?: string;
  change?: number;
  error?: string;
}> {
  try {
    const normalizedUrl = normalizeMintUrl(mintUrl);
    const wallet = await getWalletForMint(normalizedUrl);
    const totalNeeded = amount + feeReserve;

    // Atomically select proofs and mark them PENDING_SPEND
    const selection = await selectProofsForSpend(normalizedUrl, totalNeeded);

    if (!selection) {
      const balance = (await getBalanceByMint()).get(normalizedUrl) || 0;
      return {
        success: false,
        error: `Insufficient funds. Need ${totalNeeded} sats (${amount} + ${feeReserve} fee), have ${balance} sats`,
      };
    }

    const cached = meltQuoteCache.get(quoteId);
    let meltQuote = cached?.quote;
    if (!meltQuote) {
      // If not cached, create a minimal quote object
      meltQuote = {
        quote: quoteId,
        amount,
        fee_reserve: feeReserve,
        expiry: Math.floor(Date.now() / 1000) + 600,
        request: invoice,
        state: 'UNPAID' as const,
        payment_preimage: null,
        unit: 'sat',
      };
    }

    // Create pending token for recovery (in case melt fails after spending proofs)
    const token = getEncodedTokenV4({
      mint: normalizedUrl,
      proofs: selection.proofs,
    });

    const pendingToken: PendingToken = {
      id: `pt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      token,
      amount: selection.total,
      mintUrl: normalizedUrl,
      createdAt: Date.now(),
      purpose: 'lightning_melt',
      destination: invoice,
      status: 'pending',
    };
    await addPendingToken(pendingToken);

    // Proofs are already marked PENDING_SPEND by selectProofsForSpend

    // Perform the melt using ops builder for deterministic change secrets (NUT-13)
    let meltResponse: Awaited<ReturnType<typeof wallet.meltProofs>>;
    try {
      const seedExists = await hasSeed();
      if (seedExists) {
        // Use ops builder with deterministic secrets so change proofs are recoverable from seed
        meltResponse = await wallet.ops
          .meltBolt11(meltQuote, selection.proofs)
          .asDeterministic(0)
          .run();
      } else {
        // Legacy: random secrets
        meltResponse = await wallet.meltProofs(meltQuote, selection.proofs);
      }
    } catch (meltError) {
      // The mint call threw — but the melt may have actually succeeded.
      // Check the quote status to determine what really happened.
      try {
        const quoteStatus = await wallet.checkMeltQuote(quoteId);

        if (quoteStatus.state === 'PAID') {
          // Melt actually succeeded! The error was just a network issue on the response.
          // Proofs are spent at the mint — finalize the spend.
          // Note: checkMeltQuote returns blinded signatures, not unblinded proofs,
          // so we can't recover change here. With deterministic secrets (NUT-13),
          // the change is recoverable via seed recovery. Without, it's lost.
          //
          // Wrap cleanup in its own try/catch so a storage error doesn't mask
          // the fact that the Lightning payment succeeded.
          try {
            await finalizePendingSpend(selection.proofs, [], normalizedUrl);
            await updatePendingTokenStatus(pendingToken.id, 'claimed');
            meltQuoteCache.delete(quoteId);

            await addTransaction({
              type: 'payment',
              amount: selection.total,
              unit: 'sat',
              mintUrl: normalizedUrl,
              origin: 'Lightning Send',
              status: 'completed',
            });
          } catch (cleanupError) {
            console.error('[Nutpay] Post-melt cleanup failed (payment DID succeed):', cleanupError);
          }

          return {
            success: true,
            preimage: quoteStatus.payment_preimage || undefined,
            change: 0,
          };
        }

        // Quote is UNPAID — melt truly failed. Revert proofs.
        await revertPendingProofs(selection.proofs);
      } catch {
        // Can't even check the quote — leave proofs as PENDING_SPEND.
        // Reconciliation on next startup will determine their actual state.
        console.warn('[Nutpay] Could not check melt quote status after error, proofs left as PENDING_SPEND');
      }

      return {
        success: false,
        error: meltError instanceof Error ? meltError.message : 'Failed to pay Lightning invoice',
      };
    }

    // Mark pending token as claimed
    await updatePendingTokenStatus(pendingToken.id, 'claimed');

    // Clean up cache
    meltQuoteCache.delete(quoteId);

    // NUT-12: Verify DLEQ on melt change proofs
    const changeProofs = meltResponse.change || [];
    await verifyDleqIfSupported(wallet, changeProofs, normalizedUrl);

    // Atomically remove spent proofs and add change in one storage write
    await finalizePendingSpend(selection.proofs, changeProofs, normalizedUrl);

    const changeAmount = changeProofs.reduce((sum, p) => sum + p.amount, 0);
    const actualSpent = selection.total - changeAmount;

    // Record transaction
    await addTransaction({
      type: 'payment',
      amount: actualSpent,
      unit: 'sat',
      mintUrl: normalizedUrl,
      origin: 'Lightning Send',
      status: 'completed',
    });

    return {
      success: true,
      preimage: meltResponse.quote.payment_preimage || undefined,
      change: changeAmount,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pay Lightning invoice',
    };
  }
}

export async function recoverStuckPendingProofs(): Promise<{ recovered: number; removed: number }> {
  const pendingProofs = await getPendingSpendProofs();
  const STUCK_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  const stuckProofs = pendingProofs.filter(
    (sp) => now - sp.dateReceived > STUCK_THRESHOLD
  );

  if (stuckProofs.length === 0) {
    return { recovered: 0, removed: 0 };
  }

  const byMint = new Map<string, typeof stuckProofs>();
  for (const sp of stuckProofs) {
    const existing = byMint.get(sp.mintUrl) ?? [];
    byMint.set(sp.mintUrl, [...existing, sp]);
  }

  let recovered = 0;
  let removed = 0;

  for (const [mintUrl, mintProofs] of byMint) {
    const proofs = mintProofs.map((sp) => sp.proof);
    let states: { state: CheckStateEnum }[] | null = null;

    // Retry with exponential backoff
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const wallet = await getWalletForMint(mintUrl);
        states = await wallet.checkProofsStates(proofs);
        break;
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, attempt * 1000 + 1000));
        } else {
          console.warn(`[Nutpay] Recovery: mint ${mintUrl} unreachable, leaving ${proofs.length} stuck proofs`);
        }
      }
    }

    if (!states) continue;

    const spentProofs = proofs.filter((_, i) => states![i]?.state === CheckStateEnum.SPENT);
    const unspentProofs = proofs.filter((_, i) => states![i]?.state === CheckStateEnum.UNSPENT);

    if (spentProofs.length > 0) {
      await removeProofs(spentProofs);
      removed += spentProofs.length;
    }
    if (unspentProofs.length > 0) {
      await revertPendingProofs(unspentProofs);
      recovered += unspentProofs.length;
    }
  }

  return { recovered, removed };
}
