import { getEncodedTokenV4, type Proof } from '@cashu/cashu-ts';
import { getWalletForMint, discoverMint, findMintForPayment } from './mint-manager';
import { selectProofs, storeProofs, spendProofs, getBalanceByMint } from './proof-manager';
import { addTransaction, updateTransactionStatus } from '../storage/transaction-store';
import type { XCashuPaymentRequest, MintBalance } from '../../shared/types';
import { getMints } from '../storage/settings-store';

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

  // Find a mint that can fulfill this payment
  const mintUrl = await findMintForPayment(requestedMint, amount);

  if (!mintUrl) {
    // Try to discover the mint
    const discovered = await discoverMint(requestedMint);
    if (!discovered) {
      return {
        success: false,
        error: `Mint not available: ${requestedMint}`,
      };
    }
  }

  const actualMint = mintUrl || requestedMint;

  // Select proofs for the payment
  const selection = await selectProofs(actualMint, amount);

  if (!selection) {
    const balance = (await getBalanceByMint()).get(actualMint) || 0;
    return {
      success: false,
      error: `Insufficient funds. Need ${amount} ${unit}, have ${balance} ${unit}`,
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
    const wallet = await getWalletForMint(actualMint);

    // Create the send token
    const { send: sendProofs, keep: changeProofs } = await wallet.send(
      amount,
      selection.proofs,
      { includeFees: true }
    );

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
    const { getDecodedToken } = await import('@cashu/cashu-ts');
    const decoded = getDecodedToken(encodedToken);

    const mintUrl = decoded.mint;

    // Get wallet for this mint
    const wallet = await getWalletForMint(mintUrl);

    // Receive the proofs (this validates them with the mint)
    const receivedProofs = await wallet.receive(encodedToken);

    // Store the proofs
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
    const mint = mints.find((m) => m.url === mintUrl);
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
