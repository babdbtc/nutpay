import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkVelocityLimit, recordPaymentTimestamp, cleanupOldTimestamps } from './velocity-limiter';

describe('velocity-limiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.advanceTimersByTime(61000);
    cleanupOldTimestamps();
    vi.useRealTimers();
  });

  it('allows payment when under the limit (9 recorded, 10th check passes)', () => {
    const origin = 'https://under-limit.example.com';
    for (let i = 0; i < 9; i++) {
      recordPaymentTimestamp(origin);
    }
    const result = checkVelocityLimit(origin);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('allows the 10th payment (at limit — 9 in window is below max of 10)', () => {
    const origin = 'https://at-limit.example.com';
    for (let i = 0; i < 9; i++) {
      recordPaymentTimestamp(origin);
    }
    const result = checkVelocityLimit(origin);
    expect(result.allowed).toBe(true);
  });

  it('blocks the 11th payment when 10 are already recorded (over limit)', () => {
    const origin = 'https://over-limit.example.com';
    for (let i = 0; i < 10; i++) {
      recordPaymentTimestamp(origin);
    }
    const result = checkVelocityLimit(origin);
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/rate limit exceeded/i);
    expect(result.reason).toContain('over-limit.example.com');
  });

  it('resets after the 60-second window expires', () => {
    const origin = 'https://expiry.example.com';
    for (let i = 0; i < 10; i++) {
      recordPaymentTimestamp(origin);
    }
    expect(checkVelocityLimit(origin).allowed).toBe(false);

    vi.advanceTimersByTime(61000);

    expect(checkVelocityLimit(origin).allowed).toBe(true);
  });

  it('tracks different origins independently', () => {
    const originA = 'https://site-a.example.com';
    const originB = 'https://site-b.example.com';
    for (let i = 0; i < 10; i++) {
      recordPaymentTimestamp(originA);
    }
    expect(checkVelocityLimit(originA).allowed).toBe(false);
    expect(checkVelocityLimit(originB).allowed).toBe(true);
  });
});

describe('cleanupOldTimestamps', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.advanceTimersByTime(61000);
    cleanupOldTimestamps();
    vi.useRealTimers();
  });

  it('prunes entries older than 60 seconds and allows requests again', () => {
    const origin = 'https://cleanup.example.com';
    for (let i = 0; i < 10; i++) {
      recordPaymentTimestamp(origin);
    }
    expect(checkVelocityLimit(origin).allowed).toBe(false);

    vi.advanceTimersByTime(61000);
    cleanupOldTimestamps();

    expect(checkVelocityLimit(origin).allowed).toBe(true);
  });
});
