import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePaymentRequired } from './request-handler';
import type { PaymentRequiredMessage, XCashuPaymentRequest } from '../shared/types';

vi.mock('../core/wallet/cashu-wallet', () => ({
  createPaymentToken: vi.fn(),
}));

vi.mock('../core/storage/allowlist-store', () => ({
  isAutoApproved: vi.fn(),
  recordPayment: vi.fn(),
  getAllowlistEntry: vi.fn(),
  isMonthlyLimitExceeded: vi.fn(async () => ({ exceeded: false })),
  withDefaults: vi.fn(<T>(entry: T) => entry),
}));

vi.mock('../core/protocol/xcashu', () => ({
  decodePaymentRequestHeader: vi.fn(),
  validatePaymentRequest: vi.fn(),
}));

vi.mock('./payment-coordinator', () => ({
  openApprovalPopup: vi.fn(),
  waitForApproval: vi.fn(),
  openUnlockPopup: vi.fn(),
  waitForUnlock: vi.fn(),
}));

vi.mock('../core/wallet/proof-manager', () => ({
  getBalanceByMint: vi.fn(),
}));

vi.mock('../core/storage/settings-store', () => ({
  getMints: vi.fn(),
}));

vi.mock('../core/wallet/mint-manager', () => ({
  mintSupportsNut: vi.fn(),
}));

vi.mock('../core/storage/security-store', () => ({
  getSecurityConfig: vi.fn(),
  isSessionValid: vi.fn(),
  isAccountLocked: vi.fn(),
}));

vi.mock('../core/storage/tab-session-store', () => ({
  isTabSessionValid: vi.fn(async () => false),
  createTabSession: vi.fn(async () => undefined),
}));

vi.mock('./velocity-limiter', () => ({
  checkVelocityLimit: vi.fn(() => ({ allowed: true })),
  recordPaymentTimestamp: vi.fn(),
}));

import { createPaymentToken } from '../core/wallet/cashu-wallet';
import { isAutoApproved, recordPayment, getAllowlistEntry, isMonthlyLimitExceeded } from '../core/storage/allowlist-store';
import { decodePaymentRequestHeader, validatePaymentRequest } from '../core/protocol/xcashu';
import { openApprovalPopup, waitForApproval } from './payment-coordinator';
import { getBalanceByMint } from '../core/wallet/proof-manager';
import { getMints } from '../core/storage/settings-store';
import { getSecurityConfig } from '../core/storage/security-store';
import { isTabSessionValid } from '../core/storage/tab-session-store';
import { checkVelocityLimit, recordPaymentTimestamp } from './velocity-limiter';

const MINT_URL = 'https://mint.example.com';
const ORIGIN = 'https://example.com';
const TODAY = new Date().toISOString().split('T')[0];

const mockPaymentRequest: XCashuPaymentRequest = {
  mints: [MINT_URL],
  amount: 100,
  unit: 'sat',
};

const mockMessage: PaymentRequiredMessage = {
  type: 'PAYMENT_REQUIRED',
  requestId: 'req-test-1',
  url: `${ORIGIN}/api/content`,
  method: 'GET',
  headers: {},
  body: null,
  paymentRequestEncoded: 'creqA_test_encoded',
  origin: ORIGIN,
};

function setupBaselineSuccess() {
  vi.mocked(getSecurityConfig).mockResolvedValue(null);
  vi.mocked(decodePaymentRequestHeader).mockReturnValue(mockPaymentRequest);
  vi.mocked(validatePaymentRequest).mockReturnValue({ valid: true });
  vi.mocked(getMints).mockResolvedValue([
    { url: MINT_URL, name: 'Test Mint', enabled: true, trusted: true },
  ]);
  vi.mocked(getBalanceByMint).mockResolvedValue(new Map([[MINT_URL, 200]]));
  vi.mocked(getAllowlistEntry).mockResolvedValue(null);
  vi.mocked(isAutoApproved).mockResolvedValue(false);
  vi.mocked(openApprovalPopup).mockResolvedValue(999);
  vi.mocked(waitForApproval).mockResolvedValue({ approved: true, rememberSite: false });
  vi.mocked(createPaymentToken).mockResolvedValue({ success: true, token: 'cashuBtesttoken' });
  vi.mocked(recordPayment).mockResolvedValue(undefined);
  vi.mocked(isTabSessionValid).mockResolvedValue(false);
  vi.mocked(checkVelocityLimit).mockReturnValue({ allowed: true });
  vi.mocked(recordPaymentTimestamp).mockReturnValue(undefined);
  vi.mocked(isMonthlyLimitExceeded).mockResolvedValue({ exceeded: false });
}

describe('handlePaymentRequired', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns PAYMENT_FAILED when balance is below required amount', async () => {
    vi.mocked(getSecurityConfig).mockResolvedValue(null);
    vi.mocked(decodePaymentRequestHeader).mockReturnValue(mockPaymentRequest);
    vi.mocked(validatePaymentRequest).mockReturnValue({ valid: true });
    vi.mocked(getMints).mockResolvedValue([
      { url: MINT_URL, name: 'Test Mint', enabled: true, trusted: true },
    ]);
    vi.mocked(getBalanceByMint).mockResolvedValue(new Map([[MINT_URL, 50]]));

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_FAILED');
    expect((result as { type: string; error: string }).error).toMatch(/insufficient funds/i);
  });

  it('returns PAYMENT_FAILED when no known mints match the accepted mints', async () => {
    vi.mocked(getSecurityConfig).mockResolvedValue(null);
    vi.mocked(decodePaymentRequestHeader).mockReturnValue(mockPaymentRequest);
    vi.mocked(validatePaymentRequest).mockReturnValue({ valid: true });
    vi.mocked(getMints).mockResolvedValue([]);
    vi.mocked(getBalanceByMint).mockResolvedValue(new Map());

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_FAILED');
    expect((result as { type: string; error: string }).error).toMatch(/no tokens/i);
  });

  it('skips approval popup and returns PAYMENT_TOKEN when auto-approved', async () => {
    setupBaselineSuccess();
    vi.mocked(isAutoApproved).mockResolvedValue(true);

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_TOKEN');
    expect((result as { type: string; token: string }).token).toBe('cashuBtesttoken');
    expect(openApprovalPopup).not.toHaveBeenCalled();
  });

  it('returns PAYMENT_DENIED when payment amount exceeds per-payment limit', async () => {
    vi.mocked(getSecurityConfig).mockResolvedValue(null);
    vi.mocked(decodePaymentRequestHeader).mockReturnValue(mockPaymentRequest);
    vi.mocked(validatePaymentRequest).mockReturnValue({ valid: true });
    vi.mocked(getMints).mockResolvedValue([
      { url: MINT_URL, name: 'Test Mint', enabled: true, trusted: true },
    ]);
    vi.mocked(getBalanceByMint).mockResolvedValue(new Map([[MINT_URL, 500]]));
    vi.mocked(getAllowlistEntry).mockResolvedValue({
      origin: ORIGIN,
      autoApprove: false,
      maxPerPayment: 10,
      maxPerDay: 1000,
      dailySpent: 0,
      lastResetDate: TODAY,
      maxPerMonth: 10000,
      monthlySpent: 0,
      lastMonthlyReset: '2026-04',
      preferredMint: null,
    });

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_DENIED');
    expect((result as { type: string; reason: string }).reason).toMatch(/per-payment limit/i);
  });

  it('returns PAYMENT_DENIED when payment would exceed daily limit', async () => {
    vi.mocked(getSecurityConfig).mockResolvedValue(null);
    vi.mocked(decodePaymentRequestHeader).mockReturnValue(mockPaymentRequest);
    vi.mocked(validatePaymentRequest).mockReturnValue({ valid: true });
    vi.mocked(getMints).mockResolvedValue([
      { url: MINT_URL, name: 'Test Mint', enabled: true, trusted: true },
    ]);
    vi.mocked(getBalanceByMint).mockResolvedValue(new Map([[MINT_URL, 500]]));
    vi.mocked(getAllowlistEntry).mockResolvedValue({
      origin: ORIGIN,
      autoApprove: false,
      maxPerPayment: 500,
      maxPerDay: 1000,
      dailySpent: 950,
      lastResetDate: TODAY,
      maxPerMonth: 10000,
      monthlySpent: 0,
      lastMonthlyReset: '2026-04',
      preferredMint: null,
    });

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_DENIED');
    expect((result as { type: string; reason: string }).reason).toMatch(/daily limit/i);
  });

  it('returns PAYMENT_DENIED when user denies in approval popup', async () => {
    setupBaselineSuccess();
    vi.mocked(waitForApproval).mockResolvedValue({ approved: false, rememberSite: false });

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_DENIED');
    expect((result as { type: string; reason: string }).reason).toMatch(/denied/i);
  });
});

describe('handlePaymentRequired – policy integration (Tasks 6 & 7)', () => {
  const PREFERRED_MINT = 'https://preferred.mint.com';
  const FALLBACK_MINT = 'https://fallback.mint.com';
  const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processes payment without approval popup when a valid tab session exists', async () => {
    setupBaselineSuccess();
    vi.mocked(isTabSessionValid).mockResolvedValue(true);

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_TOKEN');
    expect((result as { type: string; token: string }).token).toBe('cashuBtesttoken');
    expect(openApprovalPopup).not.toHaveBeenCalled();
    expect(waitForApproval).not.toHaveBeenCalled();
  });

  it('returns PAYMENT_DENIED with velocity reason when velocity limit is exceeded', async () => {
    setupBaselineSuccess();
    vi.mocked(checkVelocityLimit).mockReturnValue({
      allowed: false,
      reason: 'Rate limit exceeded: too many payments to example.com in the last minute. Try again shortly.',
    });

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_DENIED');
    expect((result as { type: string; reason: string }).reason).toMatch(/rate limit/i);
  });

  it('returns PAYMENT_DENIED when payment would exceed monthly limit', async () => {
    setupBaselineSuccess();
    vi.mocked(getAllowlistEntry).mockResolvedValue({
      origin: ORIGIN,
      autoApprove: false,
      maxPerPayment: 500,
      maxPerDay: 5000,
      dailySpent: 0,
      lastResetDate: TODAY,
      maxPerMonth: 1000,
      monthlySpent: 950,
      lastMonthlyReset: CURRENT_MONTH,
      preferredMint: null,
    });
    vi.mocked(isMonthlyLimitExceeded).mockResolvedValue({
      exceeded: true,
      reason: 'Payment of 100 sats would exceed monthly limit (950/1000 sats already spent)',
    });

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_DENIED');
    expect((result as { type: string; reason: string }).reason).toMatch(/monthly limit/i);
  });

  it('selects preferred mint when it has sufficient balance and falls later in the accepted list', async () => {
    setupBaselineSuccess();
    vi.mocked(decodePaymentRequestHeader).mockReturnValue({
      mints: [FALLBACK_MINT, PREFERRED_MINT],
      amount: 100,
      unit: 'sat',
    });
    vi.mocked(getMints).mockResolvedValue([
      { url: FALLBACK_MINT, name: 'Fallback Mint', enabled: true, trusted: true },
      { url: PREFERRED_MINT, name: 'Preferred Mint', enabled: true, trusted: true },
    ]);
    vi.mocked(getBalanceByMint).mockResolvedValue(
      new Map([[FALLBACK_MINT, 50], [PREFERRED_MINT, 300]])
    );
    vi.mocked(getAllowlistEntry).mockResolvedValue({
      origin: ORIGIN,
      autoApprove: true,
      maxPerPayment: 500,
      maxPerDay: 5000,
      dailySpent: 0,
      lastResetDate: TODAY,
      maxPerMonth: 10000,
      monthlySpent: 0,
      lastMonthlyReset: CURRENT_MONTH,
      preferredMint: PREFERRED_MINT,
    });
    vi.mocked(isAutoApproved).mockResolvedValue(true);

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_TOKEN');
    expect((result as { type: string; token: string }).token).toBe('cashuBtesttoken');
  });

  it('falls back to another mint when preferred mint has insufficient balance', async () => {
    setupBaselineSuccess();
    vi.mocked(decodePaymentRequestHeader).mockReturnValue({
      mints: [PREFERRED_MINT, FALLBACK_MINT],
      amount: 100,
      unit: 'sat',
    });
    vi.mocked(getMints).mockResolvedValue([
      { url: PREFERRED_MINT, name: 'Preferred Mint', enabled: true, trusted: true },
      { url: FALLBACK_MINT, name: 'Fallback Mint', enabled: true, trusted: true },
    ]);
    vi.mocked(getBalanceByMint).mockResolvedValue(
      new Map([[PREFERRED_MINT, 50], [FALLBACK_MINT, 300]])
    );
    vi.mocked(getAllowlistEntry).mockResolvedValue({
      origin: ORIGIN,
      autoApprove: true,
      maxPerPayment: 500,
      maxPerDay: 5000,
      dailySpent: 0,
      lastResetDate: TODAY,
      maxPerMonth: 10000,
      monthlySpent: 0,
      lastMonthlyReset: CURRENT_MONTH,
      preferredMint: PREFERRED_MINT,
    });
    vi.mocked(isAutoApproved).mockResolvedValue(true);

    const result = await handlePaymentRequired(mockMessage, 1);

    expect(result.type).toBe('PAYMENT_TOKEN');
    expect((result as { type: string; token: string }).token).toBe('cashuBtesttoken');
  });
});
