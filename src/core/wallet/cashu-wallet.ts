import { getEncodedTokenV4, getDecodedToken, hasValidDleq, type Proof, type MintQuoteResponse, type MeltQuoteResponse, type Wallet, type NUT10Option, type P2PKOptions, type SigFlag } from '@cashu/cashu-ts';
import { getWalletForMint, discoverMint, findMintForPayment, mintSupportsNut } from './mint-manager';
import {
  selectProofs,
  selectProofsForSpend,
  storeProofs,
  getBalanceByMint,
  finalizePendingSpend,
  revertPendingProofs,
} from './proof-manager';
import { addTransaction, updateTransactionStatus } from '../storage/transaction-store';
import { addPendingMintQuote, updateMintQuoteStatus, getPendingMintQuoteByQuoteId } from '../storage/pending-quote-store';
import { addPendingToken, updatePendingTokenStatus } from '../storage/pending-token-store';
import { hasSeed } from '../storage/seed-store';
import type { XCashuPaymentRequest, MintBalance, PendingMintQuote, MeltQuoteInfo, PendingToken } from '../../shared/types';
import { getMints } from '../storage/settings-store';
import { normalizeMintUrl } from '../../shared/format';

// NUT-12 DLEQ: Verify proofs from mints that support it.
// Uses hasValidDleq() for manual verification of proofs returned by the mint.
async function verifyDleqIfSupported(wallet: Wallet, proofs: Proof[], mintUrl: string): Promise<void> {
  const dleqSupported = await mintSupportsNut(mintUrl, 12);
  if (!dleqSupported || proofs.length === 0) return;

  const keyset = wallet.getKeyset();
  for (const proof of proofs) {
    if (!hasValidDleq(proof, keyset)) {
      throw new Error('Mint returned proofs with invalid or missing DLEQ signature (NUT-12)');
    }
  }
}

export interface PaymentResult {
  success: boolean;
  token?: string;
  error?: string;
  transactionId?: string;
}

// ── Shared token building ─────────────────────────────────────────────

/**
 * Result of building a send token — the core mint swap operation.
 */
interface BuildTokenResult {
  token: string;
  sendProofs: Proof[];
  changeProofs: Proof[];
  selectedProofs: Proof[];
}

/**
 * Convert a NUT-10 locking condition from a payment request into P2PKOptions
 * that the cashu-ts send builder understands.
 *
 * NUT-10 `NUT10Option` has: kind, data, tags[][]
 * For P2PK (NUT-11): data = pubkey, tags can include sigflag, locktime, pubkeys, refund, n_sigs, etc.
 * For HTLC (NUT-14): data = hash, converted via P2PKOptions.hashlock
 */
function nut10ToP2PKOptions(nut10: NUT10Option): P2PKOptions {
  const tags = nut10.tags || [];

  // Helper to find a tag value by key
  const getTag = (key: string): string[] | undefined => {
    const tag = tags.find((t) => t[0] === key);
    return tag ? tag.slice(1) : undefined;
  };

  if (nut10.kind === 'P2PK') {
    const opts: P2PKOptions = {
      pubkey: nut10.data,
    };

    // Parse additional P2PK tags from NUT-11
    const sigflag = getTag('sigflag');
    if (sigflag?.[0]) {
      opts.sigFlag = sigflag[0] as SigFlag;
    }

    const locktime = getTag('locktime');
    if (locktime?.[0]) {
      opts.locktime = parseInt(locktime[0], 10);
    }

    const pubkeys = getTag('pubkeys');
    if (pubkeys && pubkeys.length > 0) {
      // The main pubkey is in data, additional ones in the pubkeys tag
      opts.pubkey = [nut10.data, ...pubkeys];
    }

    const nSigs = getTag('n_sigs');
    if (nSigs?.[0]) {
      opts.requiredSignatures = parseInt(nSigs[0], 10);
    }

    const refund = getTag('refund');
    if (refund && refund.length > 0) {
      opts.refundKeys = refund;
    }

    const nSigsRefund = getTag('n_sigs_refund');
    if (nSigsRefund?.[0]) {
      opts.requiredRefundSignatures = parseInt(nSigsRefund[0], 10);
    }

    return opts;
  }

  if (nut10.kind === 'HTLC') {
    // HTLC (NUT-14) uses the same P2PKOptions with hashlock field
    const opts: P2PKOptions = {
      pubkey: [],
      hashlock: nut10.data,
    };

    const sigflag = getTag('sigflag');
    if (sigflag?.[0]) {
      opts.sigFlag = sigflag[0] as SigFlag;
    }

    const locktime = getTag('locktime');
    if (locktime?.[0]) {
      opts.locktime = parseInt(locktime[0], 10);
    }

    const pubkeys = getTag('pubkeys');
    if (pubkeys && pubkeys.length > 0) {
      opts.pubkey = pubkeys;
    }

    const refund = getTag('refund');
    if (refund && refund.length > 0) {
      opts.refundKeys = refund;
    }

    return opts;
  }

  // Unsupported kind — should have been caught by validation, but be defensive
  throw new Error(`Unsupported NUT-10 kind: ${nut10.kind}`);
}

/**
 * Select proofs, swap with the mint, verify DLEQ, encode token, and finalize.
 *
 * This is the shared core of createPaymentToken() and generateSendToken().
 * It handles:
 *   - Atomic proof selection with fee-aware re-selection
 *   - NUT-13 deterministic vs legacy random secrets
 *   - NUT-10/NUT-11 P2PK and NUT-14 HTLC locking conditions
 *   - NUT-12 DLEQ verification on change proofs
 *   - PENDING_SPEND marking and revert on failure
 *
 * Does NOT handle: transaction recording, pending token creation, or
 * mint discovery — those are caller-specific concerns.
 *
 * Throws on failure (proofs are reverted before throwing).
 */
async function buildSendToken(
  mintUrl: string,
  amount: number,
  unit: string,
  nut10?: NUT10Option
): Promise<BuildTokenResult> {
  const wallet = await getWalletForMint(mintUrl);

  // Atomically select proofs and mark them PENDING_SPEND
  let selection = await selectProofsForSpend(mintUrl, amount);
  if (!selection) {
    const balance = (await getBalanceByMint()).get(mintUrl) || 0;
    throw new Error(`Insufficient funds. Need ${amount} ${unit}, have ${balance} ${unit}`);
  }

  // Calculate actual fees based on the selected proofs and mint's fee schedule
  const fee = wallet.getFeesForProofs(selection.proofs);
  const amountWithFees = amount + fee;

  // Re-select proofs if we need more to cover fees
  if (selection.total < amountWithFees) {
    await revertPendingProofs(selection.proofs);
    const reselection = await selectProofsForSpend(mintUrl, amountWithFees);
    if (!reselection) {
      const balance = (await getBalanceByMint()).get(mintUrl) || 0;
      throw new Error(
        `Insufficient funds. Need ${amountWithFees} ${unit} (${amount} + ${fee} fee), have ${balance} ${unit}`
      );
    }
    selection = reselection;
  }

  // Swap with the mint
  const seedExists = await hasSeed();
  let sendProofs: Proof[];
  let changeProofs: Proof[];

  // Convert NUT-10 condition to P2PKOptions if present
  const p2pkOptions = nut10 ? nut10ToP2PKOptions(nut10) : undefined;

  try {
    if (seedExists) {
      const builder = wallet.ops
        .send(amount, selection.proofs)
        .includeFees(true);

      // Apply NUT-10 locking to sent proofs, keep change deterministic
      if (p2pkOptions) {
        builder.asP2PK(p2pkOptions);
        builder.keepAsDeterministic(0);
      } else {
        builder.asDeterministic(0);
      }

      const result = await builder.run();
      sendProofs = result.send;
      changeProofs = result.keep;
    } else {
      // Legacy path (no seed)
      if (p2pkOptions) {
        const result = await wallet.send(amount, selection.proofs, { includeFees: true }, {
          send: { type: 'p2pk', options: p2pkOptions },
        });
        sendProofs = result.send;
        changeProofs = result.keep;
      } else {
        const result = await wallet.send(amount, selection.proofs, { includeFees: true });
        sendProofs = result.send;
        changeProofs = result.keep;
      }
    }
    // NUT-12: Verify DLEQ on change proofs
    await verifyDleqIfSupported(wallet, changeProofs, mintUrl);
  } catch (mintError) {
    // Mint operation failed — revert proofs back to LIVE
    await revertPendingProofs(selection.proofs);
    throw mintError;
  }

  // Encode the token
  const token = getEncodedTokenV4({
    mint: mintUrl,
    proofs: sendProofs,
  });

  // Finalize: remove spent proofs, add change
  await finalizePendingSpend(selection.proofs, changeProofs, mintUrl);

  return { token, sendProofs, changeProofs, selectedProofs: selection.proofs };
}

// ── Public API ────────────────────────────────────────────────────────

// Create a payment token for a NUT-24 402 payment
export async function createPaymentToken(
  paymentRequest: XCashuPaymentRequest,
  origin: string
): Promise<PaymentResult> {
  const { mints: acceptedMints, amount, unit } = paymentRequest;

  // Find the first accepted mint we can pay from
  let actualMint: string | null = null;

  for (const requestedMint of acceptedMints) {
    const normalizedMint = normalizeMintUrl(requestedMint);
    const mintUrl = await findMintForPayment(normalizedMint, amount);

    if (mintUrl) {
      actualMint = mintUrl;
      break;
    }

    // Try to discover the mint if not known
    const discovered = await discoverMint(normalizedMint);
    if (discovered) {
      actualMint = normalizedMint;
      break;
    }
  }

  if (!actualMint) {
    const mintNames = acceptedMints.map((m) => {
      try { return new URL(m).hostname; } catch { return m; }
    }).join(', ');
    return {
      success: false,
      error: `No available mint from: ${mintNames}`,
    };
  }

  // Create transaction record
  const transaction = await addTransaction({
    type: 'payment',
    amount,
    unit,
    mintUrl: actualMint,
    origin,
    status: 'pending',
  });

  try {
    const { token } = await buildSendToken(actualMint, amount, unit, paymentRequest.nut10);

    await updateTransactionStatus(transaction.id, 'completed');

    return {
      success: true,
      token,
      transactionId: transaction.id,
    };
  } catch (error) {
    await updateTransactionStatus(transaction.id, 'failed');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment failed',
      transactionId: transaction.id,
    };
  }
}

// Receive a Cashu token (e.g., from manual input or clipboard)
export async function receiveToken(encodedToken: string): Promise<{
  success: boolean;
  amount?: number;
  error?: string;
}> {
  try {
    // Decode to get mint URL
    const decoded = getDecodedToken(encodedToken);

    const mintUrl = normalizeMintUrl(decoded.mint);

    // Get wallet for this mint
    const wallet = await getWalletForMint(mintUrl);

    // Receive the proofs using v3 ops API
    const seedExists = await hasSeed();
    const dleqSupported = await mintSupportsNut(mintUrl, 12);
    let receivedProofs: Proof[];

    if (seedExists) {
      // Use deterministic secrets (NUT-13)
      const builder = wallet.ops
        .receive(encodedToken)
        .asDeterministic(0); // Auto-reserve counters
      // NUT-12: Require DLEQ verification if mint supports it
      receivedProofs = await (dleqSupported ? builder.requireDleq(true) : builder).run();
    } else {
      // Legacy: random secrets
      receivedProofs = await wallet.receive(encodedToken, { requireDleq: dleqSupported });
    }

    // Store the proofs (using normalized URL)
    await storeProofs(receivedProofs, mintUrl);

    const amount = receivedProofs.reduce((sum: number, p: Proof) => sum + p.amount, 0);

    // Record transaction
    await addTransaction({
      type: 'receive',
      amount,
      unit: 'sat',
      mintUrl,
      status: 'completed',
    });

    return { success: true, amount };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to receive token',
    };
  }
}

// Get wallet balances
export async function getWalletBalances(): Promise<MintBalance[]> {
  const balanceMap = await getBalanceByMint();
  const mints = await getMints();

  const balances: MintBalance[] = [];

  for (const [mintUrl, balance] of balanceMap) {
    // balanceMap already has normalized URLs from proof-store
    const mint = mints.find((m) => normalizeMintUrl(m.url) === mintUrl);
    balances.push({
      mintUrl,
      mintName: mint?.name || new URL(mintUrl).hostname,
      balance,
      unit: 'sat',
    });
  }

  return balances;
}

// Check if we can pay a specific amount from a mint
export async function canPay(
  mintUrl: string,
  amount: number
): Promise<boolean> {
  const selection = await selectProofs(mintUrl, amount);
  return selection !== null;
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

    // Create mint quote
    const mintQuote: MintQuoteResponse = await wallet.createMintQuote(amount);

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
      // Use deterministic secrets (NUT-13)
      proofs = await wallet.ops
        .mintBolt11(amount, mintQuote)
        .asDeterministic(0) // Auto-reserve counters
        .run();
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

// ==================== Send Ecash ====================

// Generate an ecash token to send
export async function generateSendToken(
  mintUrl: string,
  amount: number
): Promise<{
  success: boolean;
  token?: string;
  pendingToken?: PendingToken;
  error?: string;
}> {
  try {
    const normalizedUrl = normalizeMintUrl(mintUrl);

    const { token, sendProofs } = await buildSendToken(normalizedUrl, amount, 'sat');

    const actualAmount = sendProofs.reduce((sum, p) => sum + p.amount, 0);

    // Save pending token for recovery
    const pendingToken: PendingToken = {
      id: `pt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      token,
      amount: actualAmount,
      mintUrl: normalizedUrl,
      createdAt: Date.now(),
      purpose: 'manual_send',
      status: 'pending',
    };
    await addPendingToken(pendingToken);

    // Record transaction with token for recovery
    await addTransaction({
      type: 'payment',
      amount: actualAmount,
      unit: 'sat',
      mintUrl: normalizedUrl,
      origin: 'Send Ecash',
      status: 'completed',
      token, // Store token for recovery if unredeemed
    });

    return { success: true, token, pendingToken };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate send token',
    };
  }
}

// ==================== Send Lightning (Melt) ====================

// Cached melt quotes for payment
const meltQuoteCache = new Map<string, MeltQuoteResponse>();

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

    // Cache the full quote for later use in meltProofs
    meltQuoteCache.set(meltQuote.quote, meltQuote);

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

    // Get the cached melt quote
    let meltQuote = meltQuoteCache.get(quoteId);
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
