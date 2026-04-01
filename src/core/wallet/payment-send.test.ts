import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./mint-manager', () => ({
  findMintForPayment: vi.fn(),
  discoverMint: vi.fn(),
}));

vi.mock('./wallet-internals', () => ({
  buildSendToken: vi.fn(),
}));

vi.mock('../storage/transaction-store', () => ({
  addTransaction: vi.fn(),
  updateTransactionStatus: vi.fn(),
}));

vi.mock('../storage/pending-token-store', () => ({
  addPendingToken: vi.fn(),
}));

vi.mock('../../shared/format', () => ({
  normalizeMintUrl: vi.fn((url: string) => url),
}));

import { createPaymentToken, generateSendToken } from './payment-send';
import { findMintForPayment, discoverMint } from './mint-manager';
import { buildSendToken } from './wallet-internals';
import { addTransaction, updateTransactionStatus } from '../storage/transaction-store';
import { addPendingToken } from '../storage/pending-token-store';
import type { BuildTokenResult } from './wallet-internals';
import type { MintConfig, Transaction } from '../../shared/types';

const MINT_URL = 'https://mint.example.com';
const MOCK_TOKEN = 'cashuBtest_token_abc123';

function makeProof(amount: number) {
  return { amount, secret: `secret-${amount}`, C: `C-${amount}`, id: 'keyset01' };
}

function makeTransaction(id: string): Transaction {
  return { id, type: 'payment', amount: 100, unit: 'sat', mintUrl: MINT_URL, timestamp: Date.now(), status: 'pending' };
}

function makeMintConfig(url: string): MintConfig {
  return { url, name: 'Test Mint', enabled: true, trusted: true };
}

function makeBuildResult(token: string, amounts: number[]): BuildTokenResult {
  const sendProofs = amounts.map(makeProof);
  return { token, sendProofs, changeProofs: [], selectedProofs: sendProofs };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(addTransaction).mockResolvedValue(makeTransaction('tx-1'));
  vi.mocked(updateTransactionStatus).mockResolvedValue(undefined as any);
  vi.mocked(addPendingToken).mockResolvedValue(undefined as any);
});

describe('createPaymentToken', () => {
  it('returns failure when no suitable mint is found', async () => {
    vi.mocked(findMintForPayment).mockResolvedValue(null);
    vi.mocked(discoverMint).mockResolvedValue(null);

    const result = await createPaymentToken(
      { mints: ['https://unknown.mint.com'], amount: 100, unit: 'sat' },
      'https://example.com',
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No available mint');
    expect(buildSendToken).not.toHaveBeenCalled();
  });

  it('returns failure when buildSendToken throws insufficient funds', async () => {
    vi.mocked(findMintForPayment).mockResolvedValue(MINT_URL);
    vi.mocked(buildSendToken).mockRejectedValue(
      new Error('Insufficient funds. Need 100 sat, have 0 sat'),
    );

    const result = await createPaymentToken(
      { mints: [MINT_URL], amount: 100, unit: 'sat' },
      'https://example.com',
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Insufficient funds. Need 100 sat, have 0 sat');
    expect(result.transactionId).toBe('tx-1');
    expect(updateTransactionStatus).toHaveBeenCalledWith('tx-1', 'failed');
  });

  it('returns success with token on a successful ecash send', async () => {
    vi.mocked(findMintForPayment).mockResolvedValue(MINT_URL);
    vi.mocked(buildSendToken).mockResolvedValue(makeBuildResult(MOCK_TOKEN, [100]));

    const result = await createPaymentToken(
      { mints: [MINT_URL], amount: 100, unit: 'sat' },
      'https://shop.example.com',
    );

    expect(result.success).toBe(true);
    expect(result.token).toBe(MOCK_TOKEN);
    expect(result.transactionId).toBe('tx-1');
    expect(updateTransactionStatus).toHaveBeenCalledWith('tx-1', 'completed');
    expect(buildSendToken).toHaveBeenCalledWith(MINT_URL, 100, 'sat', undefined);
  });

  it('passes nut10 P2PK locking condition through to buildSendToken', async () => {
    const nut10 = {
      kind: 'P2PK' as const,
      data: '02abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
      tags: [['sigflag', 'SIG_INPUTS']] as string[][],
    };

    vi.mocked(findMintForPayment).mockResolvedValue(MINT_URL);
    vi.mocked(buildSendToken).mockResolvedValue(makeBuildResult(MOCK_TOKEN, [100]));

    const result = await createPaymentToken(
      { mints: [MINT_URL], amount: 100, unit: 'sat', nut10 },
      'https://p2pk.example.com',
    );

    expect(result.success).toBe(true);
    expect(buildSendToken).toHaveBeenCalledWith(MINT_URL, 100, 'sat', nut10);
  });

  it('falls back to discovered mint when primary lookup returns null', async () => {
    vi.mocked(findMintForPayment).mockResolvedValue(null);
    vi.mocked(discoverMint).mockResolvedValue(makeMintConfig('https://mint.discovered.com'));
    vi.mocked(buildSendToken).mockResolvedValue(makeBuildResult(MOCK_TOKEN, [50]));

    const result = await createPaymentToken(
      { mints: ['https://mint.discovered.com'], amount: 50, unit: 'sat' },
      'https://example.com',
    );

    expect(result.success).toBe(true);
    expect(discoverMint).toHaveBeenCalledWith('https://mint.discovered.com');
  });

  it('tries each mint in order and stops at the first successful one', async () => {
    vi.mocked(findMintForPayment)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(MINT_URL);
    vi.mocked(discoverMint).mockResolvedValue(null);
    vi.mocked(buildSendToken).mockResolvedValue(makeBuildResult(MOCK_TOKEN, [100]));

    const result = await createPaymentToken(
      { mints: ['https://mint.bad.com', MINT_URL], amount: 100, unit: 'sat' },
      'https://example.com',
    );

    expect(result.success).toBe(true);
    expect(buildSendToken).toHaveBeenCalledTimes(1);
    expect(buildSendToken).toHaveBeenCalledWith(MINT_URL, 100, 'sat', undefined);
  });
});

describe('generateSendToken', () => {
  it('returns success with token and pendingToken on a valid send', async () => {
    vi.mocked(buildSendToken).mockResolvedValue(makeBuildResult(MOCK_TOKEN, [100]));

    const result = await generateSendToken(MINT_URL, 100);

    expect(result.success).toBe(true);
    expect(result.token).toBe(MOCK_TOKEN);
    expect(result.pendingToken).toBeDefined();
    expect(result.pendingToken?.amount).toBe(100);
    expect(result.pendingToken?.mintUrl).toBe(MINT_URL);
    expect(result.pendingToken?.status).toBe('pending');
    expect(addPendingToken).toHaveBeenCalledWith(result.pendingToken);
    expect(addTransaction).toHaveBeenCalled();
  });

  it('returns failure when buildSendToken throws', async () => {
    vi.mocked(buildSendToken).mockRejectedValue(new Error('Mint unavailable'));

    const result = await generateSendToken(MINT_URL, 100);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Mint unavailable');
    expect(result.token).toBeUndefined();
    expect(addPendingToken).not.toHaveBeenCalled();
  });

  it('derives pendingToken amount from sendProofs sum to account for fees', async () => {
    vi.mocked(buildSendToken).mockResolvedValue(
      makeBuildResult(MOCK_TOKEN, [64, 32, 3]),
    );

    const result = await generateSendToken(MINT_URL, 100);

    expect(result.success).toBe(true);
    expect(result.pendingToken?.amount).toBe(99);
  });

  it('stores the token in the transaction record for recovery', async () => {
    vi.mocked(buildSendToken).mockResolvedValue(makeBuildResult(MOCK_TOKEN, [100]));

    await generateSendToken(MINT_URL, 100);

    expect(addTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ token: MOCK_TOKEN, status: 'completed' }),
    );
  });
});

