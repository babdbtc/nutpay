import { getEncodedTokenV4, getDecodedToken, type Proof, type MintQuoteResponse, type MeltQuoteResponse } from '@cashu/cashu-ts';
import { getWalletForMint, discoverMint, findMintForPayment } from './mint-manager';
import { selectProofs, storeProofs, spendProofs, getBalanceByMint } from './proof-manager';
import { addTransaction, updateTransactionStatus } from '../storage/transaction-store';
import { addPendingMintQuote, updateMintQuoteStatus, getPendingMintQuoteByQuoteId } from '../storage/pending-quote-store';
import { addPendingToken, updatePendingTokenStatus } from '../storage/pending-token-store';
import { hasSeed } from '../storage/seed-store';
import type { XCashuPaymentRequest, MintBalance, PendingMintQuote, MeltQuoteInfo, PendingToken } from '../../shared/types';
import { getMints } from '../storage/settings-store';
import { normalizeMintUrl } from '../../shared/format';

export interface PaymentResult {
  success: boolean;
  token?: string;
  error?: string;
  transactionId?: string;
}

// Create a payment token for a 402 response
export async function createPaymentToken(
  paymentRequest: XCashuPaymentRequest,
  origin: string
): Promise<PaymentResult> {
  const { mint: requestedMint, amount, unit } = paymentRequest;
  const normalizedRequestedMint = normalizeMintUrl(requestedMint);

  // Find a mint that can fulfill this payment
  const mintUrl = await findMintForPayment(normalizedRequestedMint, amount);

  if (!mintUrl) {
    // Try to discover the mint
    const discovered = await discoverMint(normalizedRequestedMint);
    if (!discovered) {
      return {
        success: false,
        error: `Mint not available: ${normalizedRequestedMint}`,
      };
    }
  }

  const actualMint = mintUrl || normalizedRequestedMint;

  // Get wallet for this mint
  const wallet = await getWalletForMint(actualMint);

  // Estimate fees - fees are typically per proof used in the swap
  // Most mints charge 0-2 sats per proof, we'll add a buffer based on amount
  const estimatedProofs = Math.ceil(Math.log2(amount + 1)) + 1;
  const estimatedFee = Math.max(1, estimatedProofs);
  const amountWithFees = amount + estimatedFee;

  // Select proofs for the payment including fees
  const selection = await selectProofs(actualMint, amountWithFees);

  if (!selection) {
    const balance = (await getBalanceByMint()).get(actualMint) || 0;
    return {
      success: false,
      error: `Insufficient funds. Need ${amountWithFees} ${unit} (${amount} + ~${estimatedFee} fee), have ${balance} ${unit}`,
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
    // Create the send token using v3 ops API
    const seedExists = await hasSeed();
    let sendProofs: Proof[];
    let changeProofs: Proof[];

    if (seedExists) {
      // Use deterministic secrets (NUT-13)
      const result = await wallet.ops
        .send(amount, selection.proofs)
        .asDeterministic(0) // Auto-reserve counters
        .includeFees(true)
        .run();
      sendProofs = result.send;
      changeProofs = result.keep;
    } else {
      // Legacy: random secrets
      const result = await wallet.send(amount, selection.proofs, { includeFees: true });
      sendProofs = result.send;
      changeProofs = result.keep;
    }

    // Encode the token
    const token = getEncodedTokenV4({
      mint: actualMint,
      proofs: sendProofs,
    });

    // Update storage: remove spent proofs, add change
    await spendProofs(selection.proofs);

    if (changeProofs.length > 0) {
      await storeProofs(changeProofs, actualMint);
    }

    // Mark transaction as completed
    await updateTransactionStatus(transaction.id, 'completed');

    return {
      success: true,
      token,
      transactionId: transaction.id,
    };
  } catch (error) {
    // Mark transaction as failed
    await updateTransactionStatus(transaction.id, 'failed');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Payment failed',
      transactionId: transaction.id,
    };
  }
}

// Receive a Cashu token (e.g., from NWC or manual input)
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
    let receivedProofs: Proof[];

    if (seedExists) {
      // Use deterministic secrets (NUT-13)
      receivedProofs = await wallet.ops
        .receive(encodedToken)
        .asDeterministic(0) // Auto-reserve counters
        .run();
    } else {
      // Legacy: random secrets
      receivedProofs = await wallet.receive(encodedToken);
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
      id: `mq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
    const wallet = await getWalletForMint(normalizedUrl);

    // Estimate fees for the swap operation
    const estimatedProofs = Math.ceil(Math.log2(amount + 1)) + 1;
    const estimatedFee = Math.max(1, estimatedProofs);
    const amountWithFees = amount + estimatedFee;

    const selection = await selectProofs(normalizedUrl, amountWithFees);

    if (!selection) {
      const balance = (await getBalanceByMint()).get(normalizedUrl) || 0;
      return {
        success: false,
        error: `Insufficient funds. Need ~${amountWithFees} sats (${amount} + ~${estimatedFee} fee), have ${balance} sats`,
      };
    }

    // Create send proofs using v3 ops API
    const seedExists = await hasSeed();
    let sendProofs: Proof[];
    let changeProofs: Proof[];

    if (seedExists) {
      // Use deterministic secrets (NUT-13)
      const result = await wallet.ops
        .send(amount, selection.proofs)
        .asDeterministic(0)
        .includeFees(true)
        .run();
      sendProofs = result.send;
      changeProofs = result.keep;
    } else {
      // Legacy: random secrets
      const result = await wallet.send(amount, selection.proofs, { includeFees: true });
      sendProofs = result.send;
      changeProofs = result.keep;
    }

    // Encode the token
    const token = getEncodedTokenV4({
      mint: normalizedUrl,
      proofs: sendProofs,
    });

    const actualAmount = sendProofs.reduce((sum, p) => sum + p.amount, 0);

    // Save pending token for recovery
    const pendingToken: PendingToken = {
      id: `pt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      token,
      amount: actualAmount,
      mintUrl: normalizedUrl,
      createdAt: Date.now(),
      purpose: 'manual_send',
      status: 'pending',
    };
    await addPendingToken(pendingToken);

    // Update storage
    await spendProofs(selection.proofs);
    if (changeProofs.length > 0) {
      await storeProofs(changeProofs, normalizedUrl);
    }

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

    const selection = await selectProofs(normalizedUrl, totalNeeded);

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
      id: `pt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      token,
      amount: selection.total,
      mintUrl: normalizedUrl,
      createdAt: Date.now(),
      purpose: 'lightning_melt',
      destination: invoice,
      status: 'pending',
    };
    await addPendingToken(pendingToken);

    // Perform the melt
    const meltResponse = await wallet.meltProofs(meltQuote, selection.proofs);

    // Mark pending token as claimed
    await updatePendingTokenStatus(pendingToken.id, 'claimed');

    // Clean up cache
    meltQuoteCache.delete(quoteId);

    // Update storage
    await spendProofs(selection.proofs);

    // Store any change proofs returned
    if (meltResponse.change && meltResponse.change.length > 0) {
      await storeProofs(meltResponse.change, normalizedUrl);
    }

    const changeAmount = meltResponse.change?.reduce((sum, p) => sum + p.amount, 0) || 0;
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
