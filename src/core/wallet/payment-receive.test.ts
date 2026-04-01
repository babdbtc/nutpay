import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@cashu/cashu-ts', () => ({
  getDecodedToken: vi.fn(),
}));

vi.mock('./mint-manager', () => ({
  getWalletForMint: vi.fn(),
  mintSupportsNut: vi.fn(),
}));

vi.mock('./proof-manager', () => ({
  selectProofs: vi.fn(),
  storeProofs: vi.fn(),
  getBalanceByMint: vi.fn(),
}));

vi.mock('../storage/transaction-store', () => ({
  addTransaction: vi.fn(),
}));

vi.mock('../storage/seed-store', () => ({
  hasSeed: vi.fn(),
}));

vi.mock('../storage/settings-store', () => ({
  getMints: vi.fn(),
}));

vi.mock('../../shared/format', () => ({
  normalizeMintUrl: vi.fn((url: string) => url),
}));

import { receiveToken, getWalletBalances, canPay } from './payment-receive';
import { getDecodedToken } from '@cashu/cashu-ts';
import { getWalletForMint, mintSupportsNut } from './mint-manager';
import { selectProofs, storeProofs, getBalanceByMint } from './proof-manager';
import { addTransaction } from '../storage/transaction-store';
import { hasSeed } from '../storage/seed-store';
import { getMints } from '../storage/settings-store';

const MINT_URL = 'https://mint.example.com';

function makeProof(amount: number) {
  return { amount, secret: `secret-${amount}`, C: `C-${amount}`, id: 'keyset01' };
}

function makeDecodedToken(mintUrl: string, amounts: number[]) {
  return { mint: mintUrl, proofs: amounts.map(makeProof), unit: 'sat' };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addTransaction).mockResolvedValue(undefined as any);
  vi.mocked(storeProofs).mockResolvedValue(undefined as any);
});

describe('receiveToken', () => {
  it('receives a valid token and stores proofs using the legacy path (no seed)', async () => {
    const proofs = [makeProof(32), makeProof(16)];
    vi.mocked(getDecodedToken).mockReturnValue(makeDecodedToken(MINT_URL, [32, 16]) as any);
    vi.mocked(hasSeed).mockResolvedValue(false);
    vi.mocked(mintSupportsNut).mockResolvedValue(false);
    vi.mocked(getWalletForMint).mockResolvedValue({
      receive: vi.fn().mockResolvedValue(proofs),
    } as any);

    const result = await receiveToken('cashuBvalid_token');

    expect(result.success).toBe(true);
    expect(result.amount).toBe(48);
    expect(storeProofs).toHaveBeenCalledWith(proofs, MINT_URL);
    expect(addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'receive', amount: 48, mintUrl: MINT_URL }),
    );
  });

  it('receives a valid token using deterministic path (has seed, no DLEQ)', async () => {
    const proofs = [makeProof(64)];
    vi.mocked(getDecodedToken).mockReturnValue(makeDecodedToken(MINT_URL, [64]) as any);
    vi.mocked(hasSeed).mockResolvedValue(true);
    vi.mocked(mintSupportsNut).mockResolvedValue(false);

    const mockRun = vi.fn().mockResolvedValue(proofs);
    const mockAsDeterministic = vi.fn().mockReturnValue({ run: mockRun });
    const mockOpsReceive = vi.fn().mockReturnValue({ asDeterministic: mockAsDeterministic });

    vi.mocked(getWalletForMint).mockResolvedValue({
      ops: { receive: mockOpsReceive },
    } as any);

    const result = await receiveToken('cashuBdeterministic');

    expect(result.success).toBe(true);
    expect(result.amount).toBe(64);
    expect(mockOpsReceive).toHaveBeenCalledWith('cashuBdeterministic');
    expect(mockAsDeterministic).toHaveBeenCalledWith(0);
    expect(mockRun).toHaveBeenCalled();
  });

  it('receives a valid token with DLEQ verification (has seed + DLEQ supported)', async () => {
    const proofs = [makeProof(100)];
    vi.mocked(getDecodedToken).mockReturnValue(makeDecodedToken(MINT_URL, [100]) as any);
    vi.mocked(hasSeed).mockResolvedValue(true);
    vi.mocked(mintSupportsNut).mockResolvedValue(true);

    const mockDleqRun = vi.fn().mockResolvedValue(proofs);
    const mockRequireDleq = vi.fn().mockReturnValue({ run: mockDleqRun });
    const mockRun = vi.fn().mockResolvedValue(proofs);
    const mockAsDeterministic = vi.fn().mockReturnValue({ run: mockRun, requireDleq: mockRequireDleq });
    const mockOpsReceive = vi.fn().mockReturnValue({ asDeterministic: mockAsDeterministic });

    vi.mocked(getWalletForMint).mockResolvedValue({
      ops: { receive: mockOpsReceive },
    } as any);

    const result = await receiveToken('cashuBdleq');

    expect(result.success).toBe(true);
    expect(result.amount).toBe(100);
    expect(mockRequireDleq).toHaveBeenCalledWith(true);
    expect(mockDleqRun).toHaveBeenCalled();
  });

  it('returns error when wallet.receive throws (token already spent)', async () => {
    vi.mocked(getDecodedToken).mockReturnValue(makeDecodedToken(MINT_URL, [50]) as any);
    vi.mocked(hasSeed).mockResolvedValue(false);
    vi.mocked(mintSupportsNut).mockResolvedValue(false);
    vi.mocked(getWalletForMint).mockResolvedValue({
      receive: vi.fn().mockRejectedValue(new Error('Token already spent')),
    } as any);

    const result = await receiveToken('cashuBspent');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Token already spent');
    expect(storeProofs).not.toHaveBeenCalled();
  });

  it('returns error when getDecodedToken throws (malformed token)', async () => {
    vi.mocked(getDecodedToken).mockImplementation(() => {
      throw new Error('Invalid token format');
    });

    const result = await receiveToken('not_a_real_token');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid token format');
  });
});

describe('getWalletBalances', () => {
  it('returns formatted balances array with mint names from settings', async () => {
    const balanceMap = new Map([
      [MINT_URL, 100],
      ['https://mint.other.com', 50],
    ]);
    vi.mocked(getBalanceByMint).mockResolvedValue(balanceMap);
    vi.mocked(getMints).mockResolvedValue([
      { url: MINT_URL, name: 'Example Mint', enabled: true, trusted: true },
      { url: 'https://mint.other.com', name: 'Other Mint', enabled: true, trusted: true },
    ]);

    const balances = await getWalletBalances();

    expect(balances).toHaveLength(2);
    expect(balances[0]).toMatchObject({ mintUrl: MINT_URL, mintName: 'Example Mint', balance: 100, unit: 'sat' });
    expect(balances[1]).toMatchObject({ mintUrl: 'https://mint.other.com', mintName: 'Other Mint', balance: 50, unit: 'sat' });
  });

  it('falls back to URL hostname when mint name is not in settings', async () => {
    const balanceMap = new Map([['https://mint.unknown.com', 75]]);
    vi.mocked(getBalanceByMint).mockResolvedValue(balanceMap);
    vi.mocked(getMints).mockResolvedValue([]);

    const balances = await getWalletBalances();

    expect(balances).toHaveLength(1);
    expect(balances[0].mintName).toBe('mint.unknown.com');
    expect(balances[0].balance).toBe(75);
  });

  it('returns empty array when no balances exist', async () => {
    vi.mocked(getBalanceByMint).mockResolvedValue(new Map());
    vi.mocked(getMints).mockResolvedValue([]);

    const balances = await getWalletBalances();

    expect(balances).toEqual([]);
  });
});

describe('canPay', () => {
  it('returns true when selectProofs finds sufficient proofs', async () => {
    vi.mocked(selectProofs).mockResolvedValue({ proofs: [makeProof(100)], total: 100 } as any);

    const result = await canPay(MINT_URL, 100);

    expect(result).toBe(true);
    expect(selectProofs).toHaveBeenCalledWith(MINT_URL, 100);
  });

  it('returns false when selectProofs returns null (insufficient balance)', async () => {
    vi.mocked(selectProofs).mockResolvedValue(null);

    const result = await canPay(MINT_URL, 1000);

    expect(result).toBe(false);
    expect(selectProofs).toHaveBeenCalledWith(MINT_URL, 1000);
  });
});
