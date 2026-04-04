import { describe, it, expect } from 'vitest';
import { calculateBudgetStatus, getBadgeColorForLevel } from './budget-alerts';
import type { AllowlistEntry } from '../shared/types';

const TODAY = new Date().toISOString().split('T')[0];
const THIS_MONTH = new Date().toISOString().slice(0, 7);

function makeEntry(overrides: Partial<AllowlistEntry> = {}): AllowlistEntry {
  return {
    origin: 'https://example.com',
    autoApprove: false,
    maxPerPayment: 100,
    maxPerDay: 100,
    dailySpent: 0,
    lastResetDate: TODAY,
    maxPerMonth: 1000,
    monthlySpent: 0,
    lastMonthlyReset: THIS_MONTH,
    preferredMint: null,
    ...overrides,
  };
}

describe('calculateBudgetStatus', () => {
  it('returns normal when daily usage is below 80%', () => {
    const status = calculateBudgetStatus(makeEntry({ dailySpent: 70, maxPerDay: 100 }));
    expect(status.dailyLevel).toBe('normal');
    expect(status.dailyPercent).toBe(70);
  });

  it('returns warning at exactly 80% daily usage', () => {
    const status = calculateBudgetStatus(makeEntry({ dailySpent: 80, maxPerDay: 100 }));
    expect(status.dailyLevel).toBe('warning');
    expect(status.dailyPercent).toBe(80);
  });

  it('returns warning between 80% and 99% daily usage', () => {
    const status = calculateBudgetStatus(makeEntry({ dailySpent: 90, maxPerDay: 100 }));
    expect(status.dailyLevel).toBe('warning');
    expect(status.dailyPercent).toBe(90);
  });

  it('returns over-limit at exactly 100% daily usage', () => {
    const status = calculateBudgetStatus(makeEntry({ dailySpent: 100, maxPerDay: 100 }));
    expect(status.dailyLevel).toBe('over-limit');
    expect(status.dailyPercent).toBe(100);
  });

  it('returns over-limit above 100% daily usage', () => {
    const status = calculateBudgetStatus(makeEntry({ dailySpent: 120, maxPerDay: 100 }));
    expect(status.dailyLevel).toBe('over-limit');
    expect(status.dailyPercent).toBe(120);
  });

  it('overallLevel is the worst of daily and monthly levels', () => {
    const monthlyWorse = calculateBudgetStatus(
      makeEntry({ dailySpent: 50, maxPerDay: 100, monthlySpent: 850, maxPerMonth: 1000 })
    );
    expect(monthlyWorse.dailyLevel).toBe('normal');
    expect(monthlyWorse.monthlyLevel).toBe('warning');
    expect(monthlyWorse.overallLevel).toBe('warning');

    const dailyWorse = calculateBudgetStatus(
      makeEntry({ dailySpent: 110, maxPerDay: 100, monthlySpent: 100, maxPerMonth: 1000 })
    );
    expect(dailyWorse.dailyLevel).toBe('over-limit');
    expect(dailyWorse.monthlyLevel).toBe('normal');
    expect(dailyWorse.overallLevel).toBe('over-limit');
  });
});

describe('getBadgeColorForLevel', () => {
  it('returns purple for normal level', () => {
    expect(getBadgeColorForLevel('normal')).toBe('#7C3AED');
  });

  it('returns amber for warning level', () => {
    expect(getBadgeColorForLevel('warning')).toBe('#F59E0B');
  });

  it('returns red for over-limit level', () => {
    expect(getBadgeColorForLevel('over-limit')).toBe('#EF4444');
  });
});
