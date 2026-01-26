import type { XCashuPaymentRequest } from '../../shared/types';
import { XCASHU_HEADER, DEFAULT_UNIT } from '../../shared/constants';

// Parse a 402 response body to extract payment requirements
export function parsePaymentRequest(
  body: string
): XCashuPaymentRequest | null {
  try {
    const parsed = JSON.parse(body);

    // Validate required fields
    if (!parsed.mint || typeof parsed.mint !== 'string') {
      return null;
    }

    if (!parsed.amount || typeof parsed.amount !== 'number') {
      return null;
    }

    return {
      mint: parsed.mint,
      amount: parsed.amount,
      unit: parsed.unit || DEFAULT_UNIT,
    };
  } catch {
    // Try parsing as plain text format: "mint=xxx amount=xxx unit=xxx"
    return parseTextFormat(body);
  }
}

// Parse text format payment request
function parseTextFormat(body: string): XCashuPaymentRequest | null {
  const mintMatch = body.match(/mint[=:]\s*([^\s,]+)/i);
  const amountMatch = body.match(/amount[=:]\s*(\d+)/i);
  const unitMatch = body.match(/unit[=:]\s*([^\s,]+)/i);

  if (!mintMatch || !amountMatch) {
    return null;
  }

  return {
    mint: mintMatch[1],
    amount: parseInt(amountMatch[1], 10),
    unit: unitMatch?.[1] || DEFAULT_UNIT,
  };
}

// Check if a response is a 402 with X-Cashu payment requirements
export function is402PaymentRequired(
  status: number,
  body: string
): boolean {
  if (status !== 402) {
    return false;
  }

  const request = parsePaymentRequest(body);
  return request !== null;
}

// Build headers with X-Cashu token for retry request
export function buildPaymentHeaders(
  originalHeaders: Record<string, string>,
  token: string
): Record<string, string> {
  return {
    ...originalHeaders,
    [XCASHU_HEADER]: token,
  };
}

// Extract X-Cashu token from request headers
export function extractPaymentToken(
  headers: Record<string, string>
): string | null {
  return headers[XCASHU_HEADER] || headers[XCASHU_HEADER.toLowerCase()] || null;
}

// Validate a payment request
export function validatePaymentRequest(
  request: XCashuPaymentRequest
): { valid: boolean; error?: string } {
  if (!request.mint) {
    return { valid: false, error: 'Missing mint URL' };
  }

  try {
    new URL(request.mint);
  } catch {
    return { valid: false, error: 'Invalid mint URL' };
  }

  if (!request.amount || request.amount <= 0) {
    return { valid: false, error: 'Invalid amount' };
  }

  if (request.amount > 1000000) {
    return { valid: false, error: 'Amount too large (max 1,000,000 sats)' };
  }

  return { valid: true };
}

// Format payment request for display
export function formatPaymentRequest(request: XCashuPaymentRequest): string {
  const mintHost = new URL(request.mint).hostname;
  return `${request.amount} ${request.unit} via ${mintHost}`;
}
