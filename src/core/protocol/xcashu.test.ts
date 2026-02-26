import { describe, it, expect } from 'vitest';
import {
  validatePaymentRequest,
  buildPaymentHeaders,
  extractPaymentToken,
  formatPaymentRequest,
} from './xcashu';
import type { XCashuPaymentRequest } from '../../shared/types';

const validRequest: XCashuPaymentRequest = {
  mints: ['https://mint.example.com'],
  amount: 100,
  unit: 'sat',
};

describe('validatePaymentRequest', () => {
  it('accepts a valid request', () => {
    expect(validatePaymentRequest(validRequest)).toEqual({ valid: true });
  });

  it('rejects when mints array is empty', () => {
    const result = validatePaymentRequest({ ...validRequest, mints: [] });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/no accepted mints/i);
  });

  it('rejects when mints is missing', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      mints: undefined as unknown as string[],
    });
    expect(result.valid).toBe(false);
  });

  it('rejects an invalid mint URL', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      mints: ['not-a-url'],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid mint url/i);
  });

  it('accepts multiple valid mint URLs', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      mints: ['https://mint1.example.com', 'https://mint2.example.com'],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects when amount is 0', () => {
    const result = validatePaymentRequest({ ...validRequest, amount: 0 });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid amount/i);
  });

  it('rejects negative amount', () => {
    const result = validatePaymentRequest({ ...validRequest, amount: -1 });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid amount/i);
  });

  it('rejects amount over 1,000,000', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      amount: 1_000_001,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });

  it('accepts exactly 1,000,000', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      amount: 1_000_000,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects missing unit', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      unit: undefined as unknown as string,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/missing unit/i);
  });

  it('rejects empty string unit', () => {
    const result = validatePaymentRequest({ ...validRequest, unit: '' });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/missing unit/i);
  });

  // NUT-10 locking condition validation
  it('accepts request without nut10', () => {
    const result = validatePaymentRequest(validRequest);
    expect(result.valid).toBe(true);
  });

  it('accepts a valid P2PK nut10 condition', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      nut10: {
        kind: 'P2PK',
        data: '0249098aa8b9d2fbec49ff8598feb17b592b986e62319a4fa488a3dc36387157a7',
        tags: [],
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts a valid HTLC nut10 condition', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      nut10: {
        kind: 'HTLC',
        data: 'da62796403af76c80cd6ce9153ed3746da62796403af76c80cd6ce9153ed3746',
        tags: [],
      },
    });
    expect(result.valid).toBe(true);
  });

  it('accepts P2PK nut10 with tags', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      nut10: {
        kind: 'P2PK',
        data: '0249098aa8b9d2fbec49ff8598feb17b592b986e62319a4fa488a3dc36387157a7',
        tags: [['sigflag', 'SIG_INPUTS']],
      },
    });
    expect(result.valid).toBe(true);
  });

  it('rejects nut10 with missing kind', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      nut10: { kind: '', data: 'abc', tags: [] },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/missing kind or data/i);
  });

  it('rejects nut10 with missing data', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      nut10: { kind: 'P2PK', data: '', tags: [] },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/missing kind or data/i);
  });

  it('rejects unsupported nut10 kind', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      nut10: { kind: 'UNKNOWN', data: 'somedata', tags: [] },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unsupported NUT-10 kind/i);
  });

  it('rejects P2PK with invalid pubkey (wrong prefix)', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      nut10: {
        kind: 'P2PK',
        data: '0449098aa8b9d2fbec49ff8598feb17b592b986e62319a4fa488a3dc36387157a7',
        tags: [],
      },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid P2PK public key/i);
  });

  it('rejects P2PK with pubkey too short', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      nut10: { kind: 'P2PK', data: '02abcd', tags: [] },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid P2PK public key/i);
  });

  it('rejects HTLC with hash wrong length', () => {
    const result = validatePaymentRequest({
      ...validRequest,
      nut10: { kind: 'HTLC', data: 'abcdef', tags: [] },
    });
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/invalid HTLC hash/i);
  });
});

describe('buildPaymentHeaders', () => {
  it('adds X-Cashu header with the token', () => {
    const headers = buildPaymentHeaders(
      { 'Content-Type': 'text/html' },
      'cashuAtoken123'
    );
    expect(headers['X-Cashu']).toBe('cashuAtoken123');
    expect(headers['Content-Type']).toBe('text/html');
  });

  it('preserves existing headers', () => {
    const original = { Authorization: 'Bearer abc', Accept: 'application/json' };
    const headers = buildPaymentHeaders(original, 'tok');
    expect(headers.Authorization).toBe('Bearer abc');
    expect(headers.Accept).toBe('application/json');
    expect(headers['X-Cashu']).toBe('tok');
  });

  it('overwrites an existing X-Cashu header', () => {
    const headers = buildPaymentHeaders(
      { 'X-Cashu': 'old-token' },
      'new-token'
    );
    expect(headers['X-Cashu']).toBe('new-token');
  });
});

describe('extractPaymentToken', () => {
  it('extracts token from X-Cashu header', () => {
    expect(extractPaymentToken({ 'X-Cashu': 'tok123' })).toBe('tok123');
  });

  it('extracts token from lowercase x-cashu header', () => {
    expect(extractPaymentToken({ 'x-cashu': 'tok456' })).toBe('tok456');
  });

  it('returns null when header is missing', () => {
    expect(extractPaymentToken({ 'Content-Type': 'text/html' })).toBeNull();
  });

  it('returns null for empty headers', () => {
    expect(extractPaymentToken({})).toBeNull();
  });

  it('prefers X-Cashu over x-cashu if both present', () => {
    expect(
      extractPaymentToken({ 'X-Cashu': 'preferred', 'x-cashu': 'fallback' })
    ).toBe('preferred');
  });
});

describe('formatPaymentRequest', () => {
  it('formats a single-mint request', () => {
    const result = formatPaymentRequest(validRequest);
    expect(result).toBe('100 sat via mint.example.com');
  });

  it('formats a multi-mint request', () => {
    const result = formatPaymentRequest({
      ...validRequest,
      mints: ['https://mint1.example.com', 'https://mint2.example.com'],
    });
    expect(result).toBe('100 sat via mint1.example.com, mint2.example.com');
  });

  it('falls back to raw string for invalid mint URL', () => {
    const result = formatPaymentRequest({
      ...validRequest,
      mints: ['bad-url'],
    });
    expect(result).toBe('100 sat via bad-url');
  });
});
