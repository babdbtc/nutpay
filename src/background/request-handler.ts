import type {
  PaymentRequiredMessage,
  PaymentTokenMessage,
  PaymentDeniedMessage,
  PaymentFailedMessage,
  PendingPayment,
  XCashuPaymentRequest,
} from '../shared/types';
import { createPaymentToken } from '../core/wallet/cashu-wallet';
import { isAutoApproved, recordPayment, getAllowlistEntry } from '../core/storage/allowlist-store';
import { decodePaymentRequestHeader, validatePaymentRequest } from '../core/protocol/xcashu';
import { openApprovalPopup, waitForApproval, openUnlockPopup, waitForUnlock } from './payment-coordinator';
import { getBalanceByMint } from '../core/wallet/proof-manager';
import { getMints } from '../core/storage/settings-store';
import { normalizeMintUrl } from '../shared/format';
import { getSecurityConfig, isSessionValid, isAccountLocked } from '../core/storage/security-store';

// Store pending payments
const pendingPayments = new Map<string, PendingPayment>();

// Check if payment is feasible (do we have enough balance from any accepted mint?)
async function checkPaymentFeasibility(
  paymentRequest: XCashuPaymentRequest
): Promise<{
  canPay: boolean;
  selectedMint: string | null; // The mint we'll use
  balance: number;
  mintKnown: boolean;
  mintName: string;
}> {
  const { mints: acceptedMints, amount } = paymentRequest;

  // Get our known mints and current balances
  const knownMints = await getMints();
  const balances = await getBalanceByMint();

  // Try each accepted mint in order to find one we can pay from
  for (const requestedMint of acceptedMints) {
    const normalizedMint = normalizeMintUrl(requestedMint);
    const knownMint = knownMints.find((m) => normalizeMintUrl(m.url) === normalizedMint);
    const balance = balances.get(normalizedMint) || 0;

    if (balance >= amount) {
      return {
        canPay: true,
        selectedMint: normalizedMint,
        balance,
        mintKnown: !!knownMint,
        mintName: knownMint?.name || new URL(requestedMint).hostname,
      };
    }
  }

  // No mint has sufficient balance -- return info about the first mint for error reporting
  const firstMint = acceptedMints[0];
  const normalizedFirst = normalizeMintUrl(firstMint);
  const knownFirst = knownMints.find((m) => normalizeMintUrl(m.url) === normalizedFirst);
  const firstBalance = balances.get(normalizedFirst) || 0;

  return {
    canPay: false,
    selectedMint: null,
    balance: firstBalance,
    mintKnown: !!knownFirst,
    mintName: knownFirst?.name || new URL(firstMint).hostname,
  };
}

// Check spending limits for a site
async function checkSpendingLimits(
  origin: string,
  amount: number
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const entry = await getAllowlistEntry(origin);

  if (!entry) {
    // No allowlist entry means no limits (will go through approval popup)
    return { allowed: true };
  }

  // Check per-payment limit
  if (amount > entry.maxPerPayment) {
    return {
      allowed: false,
      reason: `Payment of ${amount} sats exceeds your per-payment limit of ${entry.maxPerPayment} sats for ${new URL(origin).hostname}. Adjust limits in settings.`,
    };
  }

  // Check daily limit
  const today = new Date().toISOString().split('T')[0];
  const todaySpent = entry.lastResetDate === today ? entry.dailySpent : 0;

  if (todaySpent + amount > entry.maxPerDay) {
    const remaining = entry.maxPerDay - todaySpent;
    return {
      allowed: false,
      reason: `Payment would exceed your daily limit. Today's spending: ${todaySpent} sats, limit: ${entry.maxPerDay} sats, remaining: ${remaining} sats. Adjust limits in settings.`,
    };
  }

  return { allowed: true };
}

// Handle a payment required message from content script
export async function handlePaymentRequired(
  message: PaymentRequiredMessage,
  tabId: number
): Promise<PaymentTokenMessage | PaymentDeniedMessage | PaymentFailedMessage> {
  const { requestId, url, method, headers, body, paymentRequestEncoded, origin } = message;

  // Decode the NUT-18 payment request from the X-Cashu header
  const paymentRequest = decodePaymentRequestHeader(paymentRequestEncoded);
  if (!paymentRequest) {
    return {
      type: 'PAYMENT_FAILED',
      requestId,
      error: 'Failed to decode payment request from X-Cashu header',
    };
  }

  // Check if wallet is locked before processing any payment
  const securityConfig = await getSecurityConfig();
  if (securityConfig?.enabled) {
    const lockStatus = await isAccountLocked();
    if (lockStatus.locked) {
      return {
        type: 'PAYMENT_FAILED',
        requestId,
        error: `Wallet locked. Try again in ${Math.ceil((lockStatus.remainingMs || 0) / 1000)} seconds`,
      };
    }

    const sessionValid = await isSessionValid();
    if (!sessionValid) {
      // Open unlock popup and wait for user to unlock
      try {
        const popupId = await openUnlockPopup(requestId);
        await waitForUnlock(requestId, popupId);
        // User unlocked, continue with payment flow
      } catch {
        return {
          type: 'PAYMENT_DENIED',
          requestId,
          reason: 'Wallet unlock cancelled or timed out',
        };
      }
    }
  }

  // Validate the payment request
  const validation = validatePaymentRequest(paymentRequest);
  if (!validation.valid) {
    return {
      type: 'PAYMENT_FAILED',
      requestId,
      error: validation.error || 'Invalid payment request',
    };
  }

  // Check if we can pay before showing popup
  const feasibility = await checkPaymentFeasibility(paymentRequest);

  if (!feasibility.canPay) {
    // Build a helpful error message
    const mintNames = paymentRequest.mints
      .map((m) => {
        try { return new URL(m).hostname; } catch { return m; }
      })
      .join(', ');

    let errorMsg: string;
    if (!feasibility.mintKnown && feasibility.balance === 0) {
      errorMsg = `This site requires payment from [${mintNames}] but you have no tokens from any of these mints. Deposit tokens first.`;
    } else if (feasibility.balance === 0) {
      errorMsg = `Insufficient funds. You have no tokens from any accepted mint (${mintNames}). Deposit tokens first.`;
    } else {
      errorMsg = `Insufficient funds. Need ${paymentRequest.amount} ${paymentRequest.unit}, but you only have ${feasibility.balance} ${paymentRequest.unit} from "${feasibility.mintName}".`;
    }

    return {
      type: 'PAYMENT_FAILED',
      requestId,
      error: errorMsg,
    };
  }

  // Check spending limits
  const limitCheck = await checkSpendingLimits(origin, paymentRequest.amount);
  if (!limitCheck.allowed) {
    return {
      type: 'PAYMENT_DENIED',
      requestId,
      reason: limitCheck.reason || 'Spending limit exceeded',
    };
  }

  // Store pending payment
  const pending: PendingPayment = {
    requestId,
    tabId,
    origin,
    paymentRequest,
    originalRequest: { url, method, headers, body },
    timestamp: Date.now(),
  };
  pendingPayments.set(requestId, pending);

  try {
    // Check if auto-approved
    const autoApproved = await isAutoApproved(origin, paymentRequest.amount);

    if (autoApproved) {
      return await processPayment(pending);
    }

    // Open approval popup with balance info
    const popupId = await openApprovalPopup(
      requestId,
      origin,
      paymentRequest,
      feasibility.balance
    );

    // Wait for user approval
    const approval = await waitForApproval(requestId, popupId);

    if (!approval.approved) {
      pendingPayments.delete(requestId);
      return {
        type: 'PAYMENT_DENIED',
        requestId,
        reason: 'User denied payment',
      };
    }

    // Process the payment
    return await processPayment(pending);
  } catch (error) {
    pendingPayments.delete(requestId);
    return {
      type: 'PAYMENT_FAILED',
      requestId,
      error: error instanceof Error ? error.message : 'Payment processing failed',
    };
  }
}

// Process an approved payment
async function processPayment(
  pending: PendingPayment
): Promise<PaymentTokenMessage | PaymentFailedMessage> {
  const { requestId, origin, paymentRequest } = pending;

  try {
    const result = await createPaymentToken(paymentRequest, origin);

    pendingPayments.delete(requestId);

    if (result.success && result.token) {
      // Record the payment for allowlist tracking
      await recordPayment(origin, paymentRequest.amount);

      return {
        type: 'PAYMENT_TOKEN',
        requestId,
        token: result.token,
      };
    }

    return {
      type: 'PAYMENT_FAILED',
      requestId,
      error: result.error || 'Failed to create payment token',
    };
  } catch (error) {
    pendingPayments.delete(requestId);
    return {
      type: 'PAYMENT_FAILED',
      requestId,
      error: error instanceof Error ? error.message : 'Payment failed',
    };
  }
}

// Get a pending payment by request ID
export function getPendingPayment(requestId: string): PendingPayment | undefined {
  return pendingPayments.get(requestId);
}

// Cancel a pending payment
export function cancelPendingPayment(requestId: string): void {
  pendingPayments.delete(requestId);
}

// Clean up old pending payments (older than 2 minutes)
export function cleanupOldPendingPayments(): void {
  const now = Date.now();
  const maxAge = 2 * 60 * 1000; // 2 minutes

  for (const [requestId, pending] of pendingPayments) {
    if (now - pending.timestamp > maxAge) {
      pendingPayments.delete(requestId);
    }
  }
}
