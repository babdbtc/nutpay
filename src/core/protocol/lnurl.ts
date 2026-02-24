/**
 * LNURL-pay protocol support (LUD-06, LUD-16)
 *
 * Resolves Lightning addresses (user@domain.com) and LNURL strings
 * into bolt11 invoices that can be paid via the existing melt flow.
 *
 * Spec references:
 * - LUD-06: payRequest base spec — https://github.com/lnurl/luds/blob/luds/06.md
 * - LUD-16: Lightning address — https://github.com/lnurl/luds/blob/luds/16.md
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface LnurlPayParams {
  /** LNURL-pay callback URL to request invoices from */
  callback: string;
  /** Minimum sendable amount in millisatoshis */
  minSendable: number;
  /** Maximum sendable amount in millisatoshis */
  maxSendable: number;
  /** Metadata JSON string (LUD-06) */
  metadata: string;
  /** Parsed description from metadata */
  description: string;
  /** Parsed image from metadata (data URI), if any */
  image?: string;
  /** Domain of the LNURL service */
  domain: string;
  /** Original Lightning address, if resolved from one */
  lightningAddress?: string;
  /** Whether comments are supported, and max length */
  commentAllowed?: number;
}

export interface LnurlPayInvoice {
  /** Bolt11 invoice string */
  pr: string;
  /** Optional success action from the service */
  successAction?: {
    tag: string;
    message?: string;
    url?: string;
    description?: string;
  };
}

// ── Detection helpers ──────────────────────────────────────────────────

/** Check if a string looks like a Lightning address (user@domain.com) */
export function isLightningAddress(input: string): boolean {
  // Basic email-like format validation
  const trimmed = input.trim().toLowerCase();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;

  const [user, domain] = parts;
  if (!user || user.length === 0) return false;
  if (!domain || !domain.includes('.')) return false;

  // User part: alphanumeric, dots, hyphens, underscores
  if (!/^[a-z0-9._-]+$/.test(user)) return false;
  // Domain part: valid hostname
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return false;

  return true;
}

/** Check if a string is a bech32-encoded LNURL */
export function isLnurl(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  return trimmed.startsWith('lnurl1') || trimmed.startsWith('lnurl:');
}

/**
 * Detect if an input is a Lightning address, LNURL, or regular bolt11 invoice.
 * Returns the type and cleaned input.
 */
export function detectInputType(input: string): {
  type: 'lightning-address' | 'lnurl' | 'bolt11' | 'unknown';
  value: string;
} {
  const trimmed = input.trim();

  if (isLightningAddress(trimmed)) {
    return { type: 'lightning-address', value: trimmed.toLowerCase() };
  }

  if (isLnurl(trimmed)) {
    return { type: 'lnurl', value: trimmed };
  }

  // Check for bolt11 invoice (starts with lnbc, lntb, lnbs, lntbs)
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('lnbc') || lower.startsWith('lntb') || lower.startsWith('lnbs')) {
    return { type: 'bolt11', value: trimmed };
  }

  return { type: 'unknown', value: trimmed };
}

// ── Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve a Lightning address to its LNURL-pay endpoint.
 * LUD-16: https://user@domain.com -> https://domain.com/.well-known/lnurlp/user
 */
function lightningAddressToUrl(address: string): string {
  const [user, domain] = address.toLowerCase().split('@');
  return `https://${domain}/.well-known/lnurlp/${user}`;
}

/**
 * Decode a bech32-encoded LNURL to the cleartext URL.
 * LNURL uses bech32 encoding with hrp "lnurl".
 */
function decodeLnurl(lnurl: string): string {
  // Remove lnurl: prefix if present
  let cleaned = lnurl.trim();
  if (cleaned.toLowerCase().startsWith('lnurl:')) {
    cleaned = cleaned.substring(6);
  }

  // Bech32 decode — manual implementation for LNURL (no heavy deps)
  const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const decoded = cleaned.toLowerCase();

  // Find the separator (last '1')
  const sepIdx = decoded.lastIndexOf('1');
  if (sepIdx < 1) throw new Error('Invalid LNURL: no separator');

  const data = decoded.substring(sepIdx + 1, decoded.length - 6); // strip checksum
  const values: number[] = [];
  for (const c of data) {
    const idx = CHARSET.indexOf(c);
    if (idx === -1) throw new Error(`Invalid LNURL: bad character '${c}'`);
    values.push(idx);
  }

  // Convert 5-bit values to 8-bit bytes
  const bytes = convert5to8(values);
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** Convert 5-bit groups to 8-bit bytes (bech32 data conversion) */
function convert5to8(data: number[]): number[] {
  let acc = 0;
  let bits = 0;
  const result: number[] = [];

  for (const value of data) {
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((acc >> bits) & 0xff);
    }
  }

  return result;
}

/**
 * Fetch and parse LNURL-pay parameters from a service URL.
 * Validates the response according to LUD-06.
 */
export async function fetchLnurlPayParams(url: string, domain: string): Promise<LnurlPayParams> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`LNURL service returned ${response.status}`);
  }

  const data = await response.json();

  // Check for error response
  if (data.status === 'ERROR') {
    throw new Error(data.reason || 'LNURL service returned an error');
  }

  // Validate required fields (LUD-06)
  if (data.tag !== 'payRequest') {
    throw new Error(`Unexpected LNURL tag: ${data.tag || 'missing'}`);
  }

  if (typeof data.callback !== 'string') {
    throw new Error('LNURL response missing callback URL');
  }

  if (typeof data.minSendable !== 'number' || typeof data.maxSendable !== 'number') {
    throw new Error('LNURL response missing min/maxSendable');
  }

  if (data.minSendable > data.maxSendable) {
    throw new Error('Invalid LNURL: minSendable > maxSendable');
  }

  // Parse metadata for description
  let description = '';
  let image: string | undefined;

  if (typeof data.metadata === 'string') {
    try {
      const entries: [string, string][] = JSON.parse(data.metadata);
      const textEntry = entries.find(([mime]) => mime === 'text/plain');
      if (textEntry) description = textEntry[1];

      const imageEntry = entries.find(([mime]) =>
        mime.startsWith('image/png') || mime.startsWith('image/jpeg')
      );
      if (imageEntry) {
        image = `data:${imageEntry[0]};base64,${imageEntry[1]}`;
      }
    } catch {
      // Metadata parsing failed — not critical
    }
  }

  return {
    callback: data.callback,
    minSendable: data.minSendable,
    maxSendable: data.maxSendable,
    metadata: data.metadata || '',
    description,
    image,
    domain,
    commentAllowed: typeof data.commentAllowed === 'number' ? data.commentAllowed : undefined,
  };
}

/**
 * Resolve a Lightning address or LNURL string to LNURL-pay parameters.
 * This is the main entry point for the UI.
 */
export async function resolveLnurlPay(input: string): Promise<LnurlPayParams> {
  const detected = detectInputType(input);

  let url: string;
  let domain: string;
  let lightningAddress: string | undefined;

  switch (detected.type) {
    case 'lightning-address': {
      lightningAddress = detected.value;
      url = lightningAddressToUrl(detected.value);
      domain = detected.value.split('@')[1];
      break;
    }
    case 'lnurl': {
      url = decodeLnurl(detected.value);
      try {
        domain = new URL(url).hostname;
      } catch {
        throw new Error('Failed to parse decoded LNURL URL');
      }
      break;
    }
    default:
      throw new Error('Input is not a Lightning address or LNURL');
  }

  const params = await fetchLnurlPayParams(url, domain);
  if (lightningAddress) {
    params.lightningAddress = lightningAddress;
  }
  return params;
}

/**
 * Request a bolt11 invoice from a LNURL-pay callback.
 * Amount is in millisatoshis as per LUD-06.
 */
export async function requestLnurlInvoice(
  callback: string,
  amountMsat: number,
  comment?: string
): Promise<LnurlPayInvoice> {
  const url = new URL(callback);
  url.searchParams.set('amount', amountMsat.toString());
  if (comment) {
    url.searchParams.set('comment', comment);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`LNURL callback returned ${response.status}`);
  }

  const data = await response.json();

  // Check for error response
  if (data.status === 'ERROR') {
    throw new Error(data.reason || 'LNURL callback returned an error');
  }

  if (typeof data.pr !== 'string') {
    throw new Error('LNURL callback did not return an invoice');
  }

  return {
    pr: data.pr,
    successAction: data.successAction,
  };
}
