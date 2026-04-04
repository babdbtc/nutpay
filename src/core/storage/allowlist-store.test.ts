import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AllowlistEntry } from '../../shared/types';
import { clearMockStorage } from '../../../vitest.setup';
import {
  withDefaults,
  createDefaultAllowlistEntry,
  isMonthlyLimitExceeded,
  recordPayment,
  getAllowlistEntry,
  setAllowlistEntry,
} from './allowlist-store';

const TEST_ORIGIN = 'https://example.com';

function makeEntry(overrides: Partial<AllowlistEntry> = {}): AllowlistEntry {
  return {
    origin: TEST_ORIGIN,
    autoApprove: true,
    maxPerPayment: 100,
    maxPerDay: 1000,
    dailySpent: 0,
    lastResetDate: '2026-04-04',
    maxPerMonth: 10000,
    monthlySpent: 0,
    lastMonthlyReset: '2026-04',
    preferredMint: null,
    ...overrides,
  };
}

beforeEach(() => {
  clearMockStorage();
  vi.useRealTimers();
});

describe('withDefaults()', () => {
  it('applies defaults to an old entry missing new fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    const oldEntry = {
      origin: TEST_ORIGIN,
      autoApprove: false,
      maxPerPayment: 50,
      maxPerDay: 500,
      dailySpent: 10,
      lastResetDate: '2026-01-01',
    } as unknown as AllowlistEntry;

    const result = withDefaults(oldEntry);

    expect(result.maxPerMonth).toBe(10000);
    expect(result.monthlySpent).toBe(0);
    expect(result.lastMonthlyReset).toBe('2026-04');
    expect(result.preferredMint).toBeNull();

    vi.useRealTimers();
  });

  it('preserves existing values when all fields are already present', () => {
    const entry = makeEntry({
      maxPerMonth: 5000,
      monthlySpent: 200,
      preferredMint: 'https://mint.example.com',
      lastMonthlyReset: '2026-03',
    });

    const result = withDefaults(entry);

    expect(result.maxPerMonth).toBe(5000);
    expect(result.monthlySpent).toBe(200);
    expect(result.preferredMint).toBe('https://mint.example.com');
    expect(result.lastMonthlyReset).toBe('2026-03');
  });
});

describe('createDefaultAllowlistEntry()', () => {
  it('includes all new fields with correct defaults', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    const entry = createDefaultAllowlistEntry(TEST_ORIGIN);

    expect(entry.origin).toBe(TEST_ORIGIN);
    expect(entry.autoApprove).toBe(false);
    expect(entry.maxPerPayment).toBe(100);
    expect(entry.maxPerDay).toBe(1000);
    expect(entry.dailySpent).toBe(0);
    expect(entry.lastResetDate).toBe('2026-04-04');
    expect(entry.maxPerMonth).toBe(10000);
    expect(entry.monthlySpent).toBe(0);
    expect(entry.lastMonthlyReset).toBe('2026-04');
    expect(entry.preferredMint).toBeNull();

    vi.useRealTimers();
  });

  it('respects the autoApprove parameter', () => {
    const entry = createDefaultAllowlistEntry(TEST_ORIGIN, true);
    expect(entry.autoApprove).toBe(true);
  });
});

describe('isMonthlyLimitExceeded()', () => {
  it('blocks payment when monthlySpent + amount > maxPerMonth', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    await setAllowlistEntry(makeEntry({
      maxPerMonth: 1000,
      monthlySpent: 900,
      lastMonthlyReset: '2026-04',
    }));

    const result = await isMonthlyLimitExceeded(TEST_ORIGIN, 200);

    expect(result.exceeded).toBe(true);
    expect(result.reason).toContain('900');
    expect(result.reason).toContain('1000');

    vi.useRealTimers();
  });

  it('allows payment when monthlySpent + amount <= maxPerMonth', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    await setAllowlistEntry(makeEntry({
      maxPerMonth: 1000,
      monthlySpent: 500,
      lastMonthlyReset: '2026-04',
    }));

    const result = await isMonthlyLimitExceeded(TEST_ORIGIN, 500);

    expect(result.exceeded).toBe(false);
    expect(result.reason).toBeUndefined();

    vi.useRealTimers();
  });

  it('resets monthly counter when lastMonthlyReset is a previous month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    await setAllowlistEntry(makeEntry({
      maxPerMonth: 1000,
      monthlySpent: 800,
      lastMonthlyReset: '2026-03',
    }));

    const result = await isMonthlyLimitExceeded(TEST_ORIGIN, 100);
    expect(result.exceeded).toBe(false);

    const updated = await getAllowlistEntry(TEST_ORIGIN);
    expect(updated?.monthlySpent).toBe(0);
    expect(updated?.lastMonthlyReset).toBe('2026-04');

    vi.useRealTimers();
  });

  it('returns exceeded: false when origin is not in the allowlist', async () => {
    const result = await isMonthlyLimitExceeded('https://unknown.com', 100);
    expect(result.exceeded).toBe(false);
  });
});

describe('recordPayment()', () => {
  it('increments both dailySpent and monthlySpent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    await setAllowlistEntry(makeEntry({
      dailySpent: 50,
      lastResetDate: '2026-04-04',
      monthlySpent: 200,
      lastMonthlyReset: '2026-04',
    }));

    await recordPayment(TEST_ORIGIN, 100);

    const updated = await getAllowlistEntry(TEST_ORIGIN);
    expect(updated?.dailySpent).toBe(150);
    expect(updated?.monthlySpent).toBe(300);

    vi.useRealTimers();
  });

  it('does nothing when origin is not in the allowlist', async () => {
    await expect(recordPayment('https://unknown.com', 100)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// withDefaults()
// ---------------------------------------------------------------------------
describe('withDefaults()', () => {
  it('applies defaults to an old entry missing new fields (migration safety)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    // Simulate a pre-migration entry lacking the newer fields.
    const oldEntry = {
      origin: TEST_ORIGIN,
      autoApprove: false,
      maxPerPayment: 50,
      maxPerDay: 500,
      dailySpent: 10,
      lastResetDate: '2026-01-01',
    } as unknown as AllowlistEntry;

    const result = withDefaults(oldEntry);

    expect(result.maxPerMonth).toBe(10000);
    expect(result.monthlySpent).toBe(0);
    expect(result.lastMonthlyReset).toBe('2026-04');
    expect(result.preferredMint).toBeNull();

    vi.useRealTimers();
  });

  it('preserves existing values when all fields are already present', () => {
    const entry = makeEntry({
      maxPerMonth: 5000,
      monthlySpent: 200,
      preferredMint: 'https://mint.example.com',
      lastMonthlyReset: '2026-03',
    });

    const result = withDefaults(entry);

    expect(result.maxPerMonth).toBe(5000);
    expect(result.monthlySpent).toBe(200);
    expect(result.preferredMint).toBe('https://mint.example.com');
    expect(result.lastMonthlyReset).toBe('2026-03');
  });
});

// ---------------------------------------------------------------------------
// createDefaultAllowlistEntry()
// ---------------------------------------------------------------------------
describe('createDefaultAllowlistEntry()', () => {
  it('includes all new fields with correct defaults', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    const entry = createDefaultAllowlistEntry(TEST_ORIGIN);

    expect(entry.origin).toBe(TEST_ORIGIN);
    expect(entry.autoApprove).toBe(false);
    expect(entry.maxPerPayment).toBe(100);
    expect(entry.maxPerDay).toBe(1000);
    expect(entry.dailySpent).toBe(0);
    expect(entry.lastResetDate).toBe('2026-04-04');
    expect(entry.maxPerMonth).toBe(10000);
    expect(entry.monthlySpent).toBe(0);
    expect(entry.lastMonthlyReset).toBe('2026-04');
    expect(entry.preferredMint).toBeNull();

    vi.useRealTimers();
  });

  it('respects the autoApprove parameter', () => {
    const entry = createDefaultAllowlistEntry(TEST_ORIGIN, true);
    expect(entry.autoApprove).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isMonthlyLimitExceeded()
// ---------------------------------------------------------------------------
describe('isMonthlyLimitExceeded()', () => {
  it('returns exceeded: true when monthlySpent + amount > maxPerMonth', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    await setAllowlistEntry(makeEntry({
      maxPerMonth: 1000,
      monthlySpent: 900,
      lastMonthlyReset: '2026-04',
    }));

    const result = await isMonthlyLimitExceeded(TEST_ORIGIN, 200);

    expect(result.exceeded).toBe(true);
    expect(result.reason).toContain('900');
    expect(result.reason).toContain('1000');

    vi.useRealTimers();
  });

  it('returns exceeded: false when monthlySpent + amount <= maxPerMonth', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    await setAllowlistEntry(makeEntry({
      maxPerMonth: 1000,
      monthlySpent: 500,
      lastMonthlyReset: '2026-04',
    }));

    const result = await isMonthlyLimitExceeded(TEST_ORIGIN, 500);

    expect(result.exceeded).toBe(false);
    expect(result.reason).toBeUndefined();

    vi.useRealTimers();
  });

  it('resets monthly counter when lastMonthlyReset is a previous month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    // Entry has last month's reset date and significant spent amount.
    await setAllowlistEntry(makeEntry({
      maxPerMonth: 1000,
      monthlySpent: 800,
      lastMonthlyReset: '2026-03', // previous month
    }));

    // 100 sats should be fine after the lazy reset (counter resets to 0).
    const result = await isMonthlyLimitExceeded(TEST_ORIGIN, 100);
    expect(result.exceeded).toBe(false);

    // Verify storage was updated with the reset values.
    const updated = await getAllowlistEntry(TEST_ORIGIN);
    expect(updated?.monthlySpent).toBe(0);
    expect(updated?.lastMonthlyReset).toBe('2026-04');

    vi.useRealTimers();
  });

  it('returns exceeded: false when origin is not in the allowlist', async () => {
    const result = await isMonthlyLimitExceeded('https://unknown.com', 100);
    expect(result.exceeded).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// recordPayment()
// ---------------------------------------------------------------------------
describe('recordPayment()', () => {
  it('increments both dailySpent and monthlySpent', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));

    await setAllowlistEntry(makeEntry({
      dailySpent: 50,
      lastResetDate: '2026-04-04',
      monthlySpent: 200,
      lastMonthlyReset: '2026-04',
    }));

    await recordPayment(TEST_ORIGIN, 100);

    const updated = await getAllowlistEntry(TEST_ORIGIN);
    expect(updated?.dailySpent).toBe(150);    // 50 + 100
    expect(updated?.monthlySpent).toBe(300);  // 200 + 100

    vi.useRealTimers();
  });

  it('does nothing when origin is not in the allowlist', async () => {
    // Should resolve without throwing.
    await expect(recordPayment('https://unknown.com', 100)).resolves.toBeUndefined();
  });
});
