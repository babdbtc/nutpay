import { normalizeMintUrl } from '../../shared/format';
import { findMintForPayment, discoverMint } from './mint-manager';
import { addTransaction, updateTransactionStatus } from '../storage/transaction-store';
import { addPendingToken } from '../storage/pending-token-store';
import type { XCashuPaymentRequest, PendingToken } from '../../shared/types';
import { buildSendToken } from './wallet-internals';

export interface PaymentResult {
  success: boolean;
  token?: string;
  error?: string;
  transactionId?: string;
}

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
