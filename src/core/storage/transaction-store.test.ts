import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Transaction } from '../../shared/types';
import { clearMockStorage } from '../../../vitest.setup';
import { addTransaction, getSpendingByDomainForPeriod } from './transaction-store';

const ORIGIN_A = 'https://siteA.com';
const ORIGIN_B = 'https://siteB.com';
const MINT_URL = 'https://mint.example.com';

function makePayment(
  amount: number,
  origin: string,
): Omit<Transaction, 'id' | 'timestamp'> {
  return {
    type: 'payment',
    amount,
    unit: 'sat',
    mintUrl: MINT_URL,
    origin,
    status: 'completed',
  };
}

beforeEach(() => {
  clearMockStorage();
  vi.useRealTimers();
});

describe('getSpendingByDomainForPeriod()', () => {
  it("returns empty array when no transactions exist", async () => {
    const result = await getSpendingByDomainForPeriod('all');
    expect(result).toEqual([]);
  });

  it("'all' returns all completed payment transactions", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    await addTransaction(makePayment(100, ORIGIN_A));

    vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));
    await addTransaction(makePayment(200, ORIGIN_B));

    vi.useRealTimers();

    const result = await getSpendingByDomainForPeriod('all');

    expect(result).toHaveLength(2);
    const byOrigin = Object.fromEntries(result.map((d) => [d.origin, d.totalSpent]));
    expect(byOrigin[ORIGIN_A]).toBe(100);
    expect(byOrigin[ORIGIN_B]).toBe(200);
  });

  it("'today' filters to only today's transactions", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-04-03T12:00:00Z'));
    await addTransaction(makePayment(500, ORIGIN_A));

    vi.setSystemTime(new Date('2026-04-04T08:00:00Z'));
    await addTransaction(makePayment(100, ORIGIN_A));
    await addTransaction(makePayment(50, ORIGIN_B));

    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));
    const result = await getSpendingByDomainForPeriod('today');

    vi.useRealTimers();

    const siteA = result.find((d) => d.origin === ORIGIN_A);
    const siteB = result.find((d) => d.origin === ORIGIN_B);

    expect(siteA?.totalSpent).toBe(100);
    expect(siteB?.totalSpent).toBe(50);
  });

  it("'month' filters by calendar month", async () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-03-15T12:00:00Z'));
    await addTransaction(makePayment(1000, ORIGIN_A));

    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'));
    await addTransaction(makePayment(200, ORIGIN_A));

    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));
    await addTransaction(makePayment(300, ORIGIN_B));

    const result = await getSpendingByDomainForPeriod('month');

    vi.useRealTimers();

    const siteA = result.find((d) => d.origin === ORIGIN_A);
    const siteB = result.find((d) => d.origin === ORIGIN_B);

    expect(siteA?.totalSpent).toBe(200);
    expect(siteB?.totalSpent).toBe(300);
  });

  it("excludes pending payments and receive transactions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    await addTransaction({ ...makePayment(100, ORIGIN_A), status: 'pending' });
    await addTransaction({ type: 'receive', amount: 200, unit: 'sat', mintUrl: MINT_URL, origin: ORIGIN_A, status: 'completed' });
    await addTransaction(makePayment(50, ORIGIN_A));

    vi.useRealTimers();

    const result = await getSpendingByDomainForPeriod('all');

    expect(result).toHaveLength(1);
    expect(result[0].totalSpent).toBe(50);
  });
});
