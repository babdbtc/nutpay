import { PaymentRequest } from '@cashu/cashu-ts';
import type { XCashuPaymentRequest } from '../../shared/types';
import { XCASHU_HEADER } from '../../shared/constants';

/**
 * Decode a NUT-18 encoded payment request (creqA... string) from an X-Cashu header.
 * Returns our internal XCashuPaymentRequest format.
 */
export function decodePaymentRequestHeader(
  headerValue: string
): XCashuPaymentRequest | null {
  try {
    const pr = PaymentRequest.fromEncodedRequest(headerValue.trim());

    if (!pr.amount || !pr.unit) {
      return null;
    }

    return {
      mints: pr.mints || [],
      amount: pr.amount,
      unit: pr.unit,
      id: pr.id || undefined,
      description: pr.description || undefined,
      singleUse: pr.singleUse ?? undefined,
      nut10: pr.nut10 || undefined,
    };
  } catch (error) {
    console.warn('[Nutpay] Failed to decode NUT-18 payment request:', error);
    return null;
  }
}

/**
 * Validate a payment request has the required fields and sensible values.
 */
export function validatePaymentRequest(
  request: XCashuPaymentRequest
): { valid: boolean; error?: string } {
  if (!request.mints || request.mints.length === 0) {
    return { valid: false, error: 'No accepted mints specified' };
  }

  // Validate all mint URLs
  for (const mint of request.mints) {
    try {
      new URL(mint);
    } catch {
      return { valid: false, error: `Invalid mint URL: ${mint}` };
    }
  }

  if (!request.amount || request.amount <= 0) {
    return { valid: false, error: 'Invalid amount' };
  }

  if (request.amount > 1_000_000) {
    return { valid: false, error: 'Amount too large (max 1,000,000 sats)' };
  }

  if (!request.unit) {
    return { valid: false, error: 'Missing unit' };
  }

  // Validate NUT-10 locking condition if present
  if (request.nut10) {
    const { kind, data } = request.nut10;
    if (!kind || !data) {
      return { valid: false, error: 'Invalid NUT-10 condition: missing kind or data' };
    }

    // Only P2PK and HTLC kinds are known
    if (kind !== 'P2PK' && kind !== 'HTLC') {
      return { valid: false, error: `Unsupported NUT-10 kind: ${kind}` };
    }

    // For P2PK, data must be a valid hex-encoded public key (33 bytes compressed)
    if (kind === 'P2PK') {
      if (!/^0[23][0-9a-fA-F]{64}$/.test(data)) {
        return { valid: false, error: 'Invalid P2PK public key in NUT-10 condition' };
      }
    }

    // For HTLC, data must be a valid hex hash (32 bytes SHA256)
    if (kind === 'HTLC') {
      if (!/^[0-9a-fA-F]{64}$/.test(data)) {
        return { valid: false, error: 'Invalid HTLC hash in NUT-10 condition' };
      }
    }
  }

  return { valid: true };
}

/**
 * Build headers with X-Cashu token for the retry request.
 */
export function buildPaymentHeaders(
  originalHeaders: Record<string, string>,
  token: string
): Record<string, string> {
  return {
    ...originalHeaders,
    [XCASHU_HEADER]: token,
  };
}

/**
 * Extract X-Cashu token from request headers.
 */
export function extractPaymentToken(
  headers: Record<string, string>
): string | null {
  return headers[XCASHU_HEADER] || headers[XCASHU_HEADER.toLowerCase()] || null;
}

/**
 * Format payment request for display.
 */
export function formatPaymentRequest(request: XCashuPaymentRequest): string {
  const mintHosts = request.mints
    .map((m) => {
      try {
        return new URL(m).hostname;
      } catch {
        return m;
      }
    })
    .join(', ');
  return `${request.amount} ${request.unit} via ${mintHosts}`;
}
