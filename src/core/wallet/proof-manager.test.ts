import { describe, it, expect } from 'vitest';
import type { Proof } from '@cashu/cashu-ts';
import { _findExactMatch, _subsetSum, _greedySelect } from './proof-manager';

/** Helper: create a minimal Proof object with a given amount */
function proof(amount: number, id = 'test'): Proof {
  return {
    id,
    amount,
    secret: `secret-${amount}-${Math.random().toString(36).slice(2, 6)}`,
    C: `C-${amount}`,
  } as Proof;
}

describe('subsetSum', () => {
  it('finds an exact single-proof match', () => {
    const proofs = [proof(64), proof(32), proof(16)];
    const result = _subsetSum(proofs, 32);
    expect(result).not.toBeNull();
    expect(result!.reduce((s, p) => s + p.amount, 0)).toBe(32);
  });

  it('finds a multi-proof exact match', () => {
    const proofs = [proof(64), proof(32), proof(16), proof(8)];
    const result = _subsetSum(proofs, 40); // 32 + 8
    expect(result).not.toBeNull();
    expect(result!.reduce((s, p) => s + p.amount, 0)).toBe(40);
  });

  it('returns null when no exact match exists', () => {
    const proofs = [proof(64), proof(32)];
    const result = _subsetSum(proofs, 50);
    expect(result).toBeNull();
  });

  it('returns empty array for target 0', () => {
    const proofs = [proof(1), proof(2)];
    const result = _subsetSum(proofs, 0);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(0);
  });

  it('handles all powers of 2 (typical Cashu denominations)', () => {
    const proofs = [1, 2, 4, 8, 16, 32, 64].map((a) => proof(a));
    // 42 = 32 + 8 + 2
    const result = _subsetSum(proofs, 42);
    expect(result).not.toBeNull();
    expect(result!.reduce((s, p) => s + p.amount, 0)).toBe(42);
  });

  it('handles duplicate denominations', () => {
    const proofs = [proof(4), proof(4), proof(4)];
    const result = _subsetSum(proofs, 8);
    expect(result).not.toBeNull();
    expect(result!.reduce((s, p) => s + p.amount, 0)).toBe(8);
    expect(result!.length).toBe(2);
  });
});

describe('findExactMatch', () => {
  it('returns exact match for small amounts via subsetSum', () => {
    const proofs = [proof(16), proof(8), proof(4)];
    const result = _findExactMatch(proofs, 12); // 8 + 4
    expect(result).not.toBeNull();
    expect(result!.reduce((s, p) => s + p.amount, 0)).toBe(12);
  });

  it('returns null when target exceeds subsetSum threshold (> 10000)', () => {
    // With target > 10000, findExactMatch bails out to null
    const proofs = [proof(8000), proof(4000)];
    const result = _findExactMatch(proofs, 12000);
    expect(result).toBeNull();
  });

  it('returns null when too many proofs (> 50)', () => {
    const proofs = Array.from({ length: 51 }, () => proof(1));
    const result = _findExactMatch(proofs, 3);
    expect(result).toBeNull();
  });

  it('operates within thresholds', () => {
    // Exactly at thresholds: target=10000, proofs.length=50
    const proofs = Array.from({ length: 50 }, () => proof(200));
    const result = _findExactMatch(proofs, 10000);
    expect(result).not.toBeNull();
    expect(result!.reduce((s, p) => s + p.amount, 0)).toBe(10000);
  });
});

describe('greedySelect', () => {
  it('selects the fewest large proofs to cover the amount', () => {
    const proofs = [proof(4), proof(64), proof(16), proof(32)];
    const result = _greedySelect(proofs, 50);

    // Should pick 64 (covers 50 with 14 change)
    expect(result.total).toBeGreaterThanOrEqual(50);
    expect(result.change).toBe(result.total - 50);
    // Greedy takes largest first → 64 alone is enough
    expect(result.proofs.length).toBe(1);
    expect(result.proofs[0].amount).toBe(64);
  });

  it('accumulates multiple proofs when needed', () => {
    const proofs = [proof(8), proof(4), proof(2), proof(1)];
    const result = _greedySelect(proofs, 14);

    // 8 + 4 + 2 = 14
    expect(result.total).toBe(14);
    expect(result.change).toBe(0);
    expect(result.proofs.length).toBe(3);
  });

  it('takes all proofs if total barely covers amount', () => {
    const proofs = [proof(2), proof(2), proof(2)];
    const result = _greedySelect(proofs, 6);
    expect(result.total).toBe(6);
    expect(result.change).toBe(0);
    expect(result.proofs.length).toBe(3);
  });

  it('sorts descending before selecting', () => {
    // Even if proofs are given in ascending order, greedy should pick largest first
    const proofs = [proof(1), proof(2), proof(4), proof(8)];
    const result = _greedySelect(proofs, 5);

    // Should pick 8 (>= 5 immediately)
    expect(result.proofs[0].amount).toBe(8);
    expect(result.proofs.length).toBe(1);
  });

  it('handles single proof', () => {
    const result = _greedySelect([proof(16)], 10);
    expect(result.total).toBe(16);
    expect(result.change).toBe(6);
    expect(result.proofs.length).toBe(1);
  });

  it('stops as soon as amount is covered', () => {
    const proofs = [proof(64), proof(32), proof(16), proof(8)];
    const result = _greedySelect(proofs, 90);

    // 64 + 32 = 96 >= 90, should stop there
    expect(result.total).toBe(96);
    expect(result.change).toBe(6);
    expect(result.proofs.length).toBe(2);
  });
});
