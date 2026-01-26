import type { MintConfig, Settings, ThemeId } from './types';

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
  theme: 'classic',
};

// Theme definitions
export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  preview: {
    bg: string;
    card: string;
    accent: string;
  };
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Original purple with orange accent',
    preview: { bg: '#16162a', card: '#252542', accent: '#f97316' },
  },
  {
    id: 'violet',
    name: 'Violet',
    description: 'Deep purple night theme',
    preview: { bg: '#16162a', card: '#252542', accent: '#a855f7' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Pure black OLED theme',
    preview: { bg: '#000000', card: '#111111', accent: '#ffffff' },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Deep sea blue theme',
    preview: { bg: '#0a1929', card: '#132f4c', accent: '#5090d3' },
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Dark green nature theme',
    preview: { bg: '#0d1f0d', card: '#1a331a', accent: '#4ade80' },
  },
  {
    id: 'bitcoin',
    name: 'Bitcoin',
    description: 'Orange bitcoin theme',
    preview: { bg: '#1a1307', card: '#2d2210', accent: '#f7931a' },
  },
];

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
