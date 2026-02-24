import { describe, it, expect } from 'vitest';
import { isLightningAddress, isLnurl, detectInputType } from './lnurl';

describe('isLightningAddress', () => {
  it('returns true for valid Lightning addresses', () => {
    expect(isLightningAddress('user@domain.com')).toBe(true);
    expect(isLightningAddress('alice@walletofsatoshi.com')).toBe(true);
    expect(isLightningAddress('bob@getalby.com')).toBe(true);
    expect(isLightningAddress('user123@example.org')).toBe(true);
    expect(isLightningAddress('my.name@some-service.co')).toBe(true);
    expect(isLightningAddress('test_user@domain.xyz')).toBe(true);
    expect(isLightningAddress('a-b@c.de')).toBe(true);
  });

  it('returns true with whitespace around address', () => {
    expect(isLightningAddress('  user@domain.com  ')).toBe(true);
    expect(isLightningAddress('user@domain.com\n')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isLightningAddress('User@Domain.COM')).toBe(true);
  });

  it('returns false for invalid inputs', () => {
    expect(isLightningAddress('')).toBe(false);
    expect(isLightningAddress('notanemail')).toBe(false);
    expect(isLightningAddress('@domain.com')).toBe(false);
    expect(isLightningAddress('user@')).toBe(false);
    expect(isLightningAddress('user@domain')).toBe(false);
    expect(isLightningAddress('user@@domain.com')).toBe(false);
    expect(isLightningAddress('lnbc1234...')).toBe(false);
  });
});

describe('isLnurl', () => {
  it('returns true for LNURL strings', () => {
    expect(isLnurl('lnurl1dp68gurn8ghj7um9wfmxjcm99e3k7mf0v9cxj0m385ekvcenxc6r2c35xvukxefcv5mkvv34x5ekzd3ev56nyd3hxqurzepexejxxepnxscrvwfnv9nxzcn9xq6xyefhvgcxxcmyxymnserxfq5fns')).toBe(true);
    expect(isLnurl('LNURL1DP68GURN8GHJ7...')).toBe(true);
    expect(isLnurl('lnurl:something')).toBe(true);
  });

  it('handles whitespace', () => {
    expect(isLnurl('  lnurl1abc  ')).toBe(true);
  });

  it('returns false for non-LNURL strings', () => {
    expect(isLnurl('')).toBe(false);
    expect(isLnurl('lnbc1234')).toBe(false);
    expect(isLnurl('user@domain.com')).toBe(false);
  });
});

describe('detectInputType', () => {
  it('detects Lightning addresses', () => {
    const result = detectInputType('user@domain.com');
    expect(result.type).toBe('lightning-address');
    expect(result.value).toBe('user@domain.com');
  });

  it('lowercases Lightning addresses', () => {
    const result = detectInputType('User@Domain.COM');
    expect(result.type).toBe('lightning-address');
    expect(result.value).toBe('user@domain.com');
  });

  it('detects LNURL strings as lnurl type', () => {
    const result = detectInputType('lnurl1dp68gurn...');
    expect(result.type).toBe('lnurl');
  });

  it('detects bolt11 invoices', () => {
    expect(detectInputType('lnbc100n1pj...').type).toBe('bolt11');
    expect(detectInputType('lntb100n1pj...').type).toBe('bolt11');
    expect(detectInputType('LNBC100n1pj...').type).toBe('bolt11');
  });

  it('returns unknown for unrecognized input', () => {
    expect(detectInputType('').type).toBe('unknown');
    expect(detectInputType('hello world').type).toBe('unknown');
    expect(detectInputType('cashuBpGF0gaJhaUgA').type).toBe('unknown');
  });

  it('preserves original value for bolt11', () => {
    const result = detectInputType('  lnbc100n1pjABC  ');
    expect(result.type).toBe('bolt11');
    expect(result.value).toBe('lnbc100n1pjABC');
  });
});
