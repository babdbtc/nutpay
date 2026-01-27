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
import { validatePaymentRequest } from '../core/protocol/xcashu';
import { openApprovalPopup, waitForApproval } from './payment-coordinator';
import { getBalanceByMint } from '../core/wallet/proof-manager';
import { getMints } from '../core/storage/settings-store';
import { normalizeMintUrl } from '../shared/format';
import { getSecurityConfig, isSessionValid, isAccountLocked } from '../core/storage/security-store';

// Store pending payments
const pendingPayments = new Map<string, PendingPayment>();

// Check if payment is feasible (do we have enough balance from the right mint?)
async function checkPaymentFeasibility(
  paymentRequest: XCashuPaymentRequest
): Promise<{
  canPay: boolean;
  balance: number;
  mintKnown: boolean;
  mintName: string;
}> {
  const { mint: requestedMint, amount } = paymentRequest;
  const normalizedRequestedMint = normalizeMintUrl(requestedMint);

  // Check if we know this mint
  const mints = await getMints();
  const knownMint = mints.find((m) => normalizeMintUrl(m.url) === normalizedRequestedMint);
  const mintKnown = !!knownMint;
  const mintName = knownMint?.name || new URL(requestedMint).hostname;

  // Check balance for this mint (getBalanceByMint already returns normalized URLs)
  const balances = await getBalanceByMint();
  const balance = balances.get(normalizedRequestedMint) || 0;

  return {
    canPay: balance >= amount,
    balance,
    mintKnown,
    mintName,
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
  const { requestId, url, method, headers, body, paymentRequest, origin } = message;

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
      return {
        type: 'PAYMENT_FAILED',
        requestId,
        error: 'Wallet is locked. Please unlock it first.',
      };
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
    let errorMsg: string;
    if (!feasibility.mintKnown && feasibility.balance === 0) {
      errorMsg = `This site requires payment from "${feasibility.mintName}" but you have no tokens from this mint. Deposit tokens from this mint first.`;
    } else if (feasibility.balance === 0) {
      errorMsg = `Insufficient funds. You have no tokens from "${feasibility.mintName}". Deposit tokens from this mint first.`;
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
