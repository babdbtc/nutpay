import { Mint, Wallet, getDecodedToken, PaymentRequest } from '@cashu/cashu-ts';

const MINT_URL = process.env.MINT_URL || 'https://mint.minibits.cash/Bitcoin';

let wallet: Wallet | null = null;
let _mintReady = false;

export async function initializeCashu(): Promise<void> {
  try {
    const mint = new Mint(MINT_URL);
    wallet = new Wallet(mint);
    await wallet.loadMint();
    _mintReady = true;
    console.log(`Cashu mint connected: ${MINT_URL}`);
  } catch (err) {
    _mintReady = false;
    console.warn(`Cashu mint unavailable at ${MINT_URL}:`, err instanceof Error ? err.message : err);
  }
}

export function buildPaymentRequest(amount: number, unit: string = 'sat'): string {
  const pr = new PaymentRequest([], undefined, amount, unit, [MINT_URL], undefined, true);
  return pr.toEncodedRequest();
}

export async function validateAndRedeemToken(
  token: string,
  expectedAmount: number,
): Promise<{ valid: boolean; amount?: number; error?: string }> {
  try {
    const decoded = getDecodedToken(token);

    if (decoded.mint !== MINT_URL) {
      return { valid: false, error: `Wrong mint: expected ${MINT_URL}, got ${decoded.mint}` };
    }

    const total = decoded.proofs.reduce((sum: number, p) => sum + (p.amount as number), 0);
    if (total < expectedAmount) {
      return { valid: false, error: `Insufficient payment: got ${total}, expected ${expectedAmount}` };
    }

    if (!wallet) {
      return { valid: false, error: 'Mint not initialized' };
    }

    await wallet.receive(token);

    return { valid: true, amount: total };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Token validation failed',
    };
  }
}

export function isMintReady(): boolean {
  return _mintReady;
}
