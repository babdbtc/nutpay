import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import type { Proof } from '@cashu/cashu-ts';
import { clearMockStorage } from '../../../vitest.setup';
import { generateRandomKey, setSessionKey } from './crypto-utils';
import {
  addProofs,
  getProofs,
  removeProofs,
  markProofsPendingSpend,
  revertPendingProofs,
  getTotalBalance,
} from './proof-store';

const TEST_MINT = 'https://mint.example.com';

const mockProof = (amount: number, secret: string): Proof => ({
  amount,
  secret,
  C: 'mock_C',
  id: 'test_keyset',
});

beforeAll(async () => {
  // Generate a random session key so encryptString/decryptString work in Node.
  // The in-memory cachedKey in crypto-utils persists across tests in this file.
  const key = await generateRandomKey();
  await setSessionKey(key);
});

beforeEach(() => {
  // Clear mock chrome.storage between tests.
  // The in-memory cachedKey is NOT affected so encryption still works.
  clearMockStorage();
});

describe('proof-store', () => {
  it('getProofs() returns empty array when no proofs are stored', async () => {
    const proofs = await getProofs();
    expect(proofs).toEqual([]);
  });

  it('addProofs() + getProofs() round-trip stores proofs correctly', async () => {
    const p1 = mockProof(8, 'secret-1');
    const p2 = mockProof(16, 'secret-2');

    await addProofs([p1, p2], TEST_MINT);

    const stored = await getProofs();
    expect(stored).toHaveLength(2);
    expect(stored[0].proof.secret).toBe('secret-1');
    expect(stored[0].amount).toBe(8);
    expect(stored[0].mintUrl).toBe(TEST_MINT);
    expect(stored[0].status).toBe('LIVE');
    expect(stored[1].proof.secret).toBe('secret-2');
    expect(stored[1].amount).toBe(16);
    expect(stored[1].status).toBe('LIVE');
  });

  it('removeProofs() removes matching proofs by secret', async () => {
    const p1 = mockProof(1, 'keep-1');
    const p2 = mockProof(2, 'remove-me');
    const p3 = mockProof(4, 'keep-2');

    await addProofs([p1, p2, p3], TEST_MINT);

    await removeProofs([p2]);

    const remaining = await getProofs();
    expect(remaining).toHaveLength(2);
    const secrets = remaining.map((sp) => sp.proof.secret);
    expect(secrets).toContain('keep-1');
    expect(secrets).toContain('keep-2');
    expect(secrets).not.toContain('remove-me');
  });

  it('markProofsPendingSpend() sets only the targeted proof to PENDING_SPEND', async () => {
    const p1 = mockProof(8, 'spend-me');
    const p2 = mockProof(4, 'stay-live');

    await addProofs([p1, p2], TEST_MINT);
    await markProofsPendingSpend([p1]);

    const stored = await getProofs();
    const spendMe = stored.find((sp) => sp.proof.secret === 'spend-me');
    const stayLive = stored.find((sp) => sp.proof.secret === 'stay-live');

    expect(spendMe?.status).toBe('PENDING_SPEND');
    expect(stayLive?.status).toBe('LIVE');
  });

  it('revertPendingProofs() reverts PENDING_SPEND proofs back to LIVE', async () => {
    const p1 = mockProof(8, 'will-revert');
    const p2 = mockProof(4, 'stays-pending');

    await addProofs([p1, p2], TEST_MINT);
    await markProofsPendingSpend([p1, p2]);
    await revertPendingProofs([p1]);

    const reverted = await getProofs();
    const willRevert = reverted.find((sp) => sp.proof.secret === 'will-revert');
    const staysPending = reverted.find((sp) => sp.proof.secret === 'stays-pending');

    expect(willRevert?.status).toBe('LIVE');
    expect(staysPending?.status).toBe('PENDING_SPEND');
  });

  it('getTotalBalance() sums LIVE proof amounts and excludes PENDING_SPEND', async () => {
    const p1 = mockProof(32, 'live-a');
    const p2 = mockProof(16, 'live-b');
    const p3 = mockProof(8, 'pending-c');

    await addProofs([p1, p2, p3], TEST_MINT);
    await markProofsPendingSpend([p3]);

    const balance = await getTotalBalance();
    // 32 + 16 = 48 (p3 excluded because it's PENDING_SPEND)
    expect(balance).toBe(48);
  });
});
