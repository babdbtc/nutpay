import { getEncodedTokenV4, hasValidDleq, type Proof, type Wallet, type NUT10Option, type P2PKOptions, type SigFlag } from '@cashu/cashu-ts';
import { getWalletForMint, mintSupportsNut } from './mint-manager';
import {
  selectProofsForSpend,
  getBalanceByMint,
  finalizePendingSpend,
  revertPendingProofs,
} from './proof-manager';
import { hasSeed } from '../storage/seed-store';

// NUT-12 DLEQ: Verify proofs from mints that support it.
// Uses hasValidDleq() for manual verification of proofs returned by the mint.
export async function verifyDleqIfSupported(wallet: Wallet, proofs: Proof[], mintUrl: string): Promise<void> {
  const dleqSupported = await mintSupportsNut(mintUrl, 12);
  if (!dleqSupported || proofs.length === 0) return;

  for (const proof of proofs) {
    const keyset = wallet.getKeyset(proof.id);
    if (!hasValidDleq(proof, keyset)) {
      throw new Error('Mint returned proofs with invalid or missing DLEQ signature (NUT-12)');
    }
  }
}

/**
 * Result of building a send token — the core mint swap operation.
 */
export interface BuildTokenResult {
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
export async function buildSendToken(
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
