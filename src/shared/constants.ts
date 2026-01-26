import type { MintConfig, Settings } from './types';

// Preset mints that users can easily add
export const PRESET_MINTS: MintConfig[] = [
  {
    url: 'https://mint.minibits.cash/Bitcoin',
    name: 'Minibits',
    enabled: true,
    trusted: true,
  },
  {
    url: 'https://mint.coinos.io',
    name: 'Coinos',
    enabled: false,
    trusted: true,
  },
  {
    url: 'https://mint.lnbits.com',
    name: 'LNbits Demo',
    enabled: false,
    trusted: false,
  },
];

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  alwaysAsk: true,
  preferredWallet: 'builtin',
  autoDiscoverMints: true,
  displayFormat: 'symbol', // Default to ₿ symbol
};

// Storage keys
export const STORAGE_KEYS = {
  PROOFS: 'nutpay_proofs',
  SETTINGS: 'nutpay_settings',
  ALLOWLIST: 'nutpay_allowlist',
  MINTS: 'nutpay_mints',
  TRANSACTIONS: 'nutpay_transactions',
  ENCRYPTION_KEY: 'nutpay_enc_key',
  PENDING_MINT_QUOTES: 'nutpay_pending_mint_quotes',
  PENDING_TOKENS: 'nutpay_pending_tokens',
  SECURITY_CONFIG: 'nutpay_security',
  SESSION_STATE: 'nutpay_session',
  RECOVERY_PHRASE_ENCRYPTED: 'nutpay_recovery_phrase',
} as const;

// Security constants
export const SECURITY = {
  SESSION_TIMEOUT: 15 * 60 * 1000, // 15 minutes
  MAX_FAILED_ATTEMPTS: 5,
  LOCKOUT_DURATION: 30 * 1000, // 30 seconds
  MIN_PIN_LENGTH: 4,
  MAX_PIN_LENGTH: 6,
  MIN_PASSWORD_LENGTH: 6,
} as const;

// Message event names for content script communication
export const MESSAGE_EVENTS = {
  TO_CONTENT: 'nutpay_to_content',
  FROM_CONTENT: 'nutpay_from_content',
} as const;

// Approval popup dimensions
export const APPROVAL_POPUP = {
  WIDTH: 400,
  HEIGHT: 350,
} as const;

// Timeouts
export const TIMEOUTS = {
  APPROVAL_POPUP: 60000, // 60 seconds to approve
  PAYMENT_RETRY: 5000,   // 5 seconds to retry payment
} as const;

// X-Cashu header name
export const XCASHU_HEADER = 'X-Cashu';

// Default unit
export const DEFAULT_UNIT = 'sat';
