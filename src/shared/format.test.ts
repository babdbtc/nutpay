import { describe, it, expect } from 'vitest';
import { normalizeMintUrl, formatAmount, formatTransactionAmount } from './format';

describe('normalizeMintUrl', () => {
  it('removes a single trailing slash', () => {
    expect(normalizeMintUrl('https://mint.example.com/')).toBe(
      'https://mint.example.com'
    );
  });

  it('removes multiple trailing slashes', () => {
    expect(normalizeMintUrl('https://mint.example.com///')).toBe(
      'https://mint.example.com'
    );
  });

  it('leaves a url without trailing slash unchanged', () => {
    expect(normalizeMintUrl('https://mint.example.com')).toBe(
      'https://mint.example.com'
    );
  });

  it('preserves path segments', () => {
    expect(normalizeMintUrl('https://mint.example.com/Bitcoin/')).toBe(
      'https://mint.example.com/Bitcoin'
    );
  });

  it('preserves query strings', () => {
    expect(normalizeMintUrl('https://mint.example.com/?key=val')).toBe(
      'https://mint.example.com?key=val'
    );
  });

  it('preserves hash fragments', () => {
    expect(normalizeMintUrl('https://mint.example.com/#section')).toBe(
      'https://mint.example.com#section'
    );
  });

  it('lowercases the origin (hostname)', () => {
    expect(normalizeMintUrl('https://MINT.EXAMPLE.COM/Bitcoin')).toBe(
      'https://mint.example.com/Bitcoin'
    );
  });

  it('falls back to simple slash removal for invalid URLs', () => {
    expect(normalizeMintUrl('not-a-url///')).toBe('not-a-url');
  });

  it('handles empty string', () => {
    expect(normalizeMintUrl('')).toBe('');
  });
});

describe('formatAmount', () => {
  it('formats with symbol', () => {
    expect(formatAmount(100, 'symbol')).toBe('₿100');
  });

  it('formats with text', () => {
    expect(formatAmount(100, 'text')).toBe('100 sats');
  });

  it('formats zero', () => {
    expect(formatAmount(0, 'symbol')).toBe('₿0');
    expect(formatAmount(0, 'text')).toBe('0 sats');
  });

  it('formats large numbers with locale separators', () => {
    // toLocaleString output varies by environment, but the structure should hold
    const symbolResult = formatAmount(1000000, 'symbol');
    expect(symbolResult).toMatch(/^₿/);
    expect(symbolResult).toContain('1');

    const textResult = formatAmount(1000000, 'text');
    expect(textResult).toMatch(/sats$/);
  });
});

describe('formatTransactionAmount', () => {
  it('adds - prefix for payments with symbol format', () => {
    expect(formatTransactionAmount(50, 'payment', 'symbol')).toBe('-₿50');
  });

  it('adds + prefix for receives with symbol format', () => {
    expect(formatTransactionAmount(50, 'receive', 'symbol')).toBe('+₿50');
  });

  it('adds - prefix for payments with text format', () => {
    expect(formatTransactionAmount(50, 'payment', 'text')).toBe('-50 sats');
  });

  it('adds + prefix for receives with text format', () => {
    expect(formatTransactionAmount(50, 'receive', 'text')).toBe('+50 sats');
  });

  it('handles zero amount', () => {
    expect(formatTransactionAmount(0, 'payment', 'symbol')).toBe('-₿0');
    expect(formatTransactionAmount(0, 'receive', 'text')).toBe('+0 sats');
  });
});
