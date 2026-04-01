import { getDecodedToken, type Proof } from '@cashu/cashu-ts';
import { getWalletForMint, mintSupportsNut } from './mint-manager';
import { selectProofs, storeProofs, getBalanceByMint } from './proof-manager';
import { addTransaction } from '../storage/transaction-store';
import { hasSeed } from '../storage/seed-store';
import type { MintBalance } from '../../shared/types';
import { getMints } from '../storage/settings-store';
import { normalizeMintUrl } from '../../shared/format';

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

// Decode a Cashu token to get its amount without claiming it
export function decodeTokenAmount(encodedToken: string): { amount: number; mint: string } | { error: string } {
  try {
    const decoded = getDecodedToken(encodedToken);
    const amount = decoded.proofs.reduce((sum: number, p: Proof) => sum + p.amount, 0);
    return { amount, mint: decoded.mint };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Failed to decode token' };
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
