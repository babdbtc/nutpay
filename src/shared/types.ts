import type { Proof } from '@cashu/cashu-ts';

// X-Cashu payment request (from 402 body)
export interface XCashuPaymentRequest {
  mint: string;
  amount: number;
  unit: string;
}

// Message types for extension communication
export type MessageType =
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_TOKEN'
  | 'PAYMENT_DENIED'
  | 'PAYMENT_FAILED'
  | 'APPROVAL_REQUEST'
  | 'APPROVAL_RESPONSE'
  | 'GET_BALANCE'
  | 'GET_TRANSACTIONS'
  | 'GET_FILTERED_TRANSACTIONS'
  | 'ADD_PROOFS'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'GET_MINTS'
  | 'ADD_MINT'
  | 'UPDATE_MINT'
  | 'REMOVE_MINT'
  | 'GET_ALLOWLIST'
  | 'ADD_TO_ALLOWLIST'
  | 'REMOVE_FROM_ALLOWLIST'
  | 'UPDATE_ALLOWLIST_ENTRY'
  | 'SETTINGS_UPDATED'
  // Lightning receive
  | 'CREATE_MINT_QUOTE'
  | 'CHECK_MINT_QUOTE'
  | 'MINT_PROOFS'
  | 'GET_PENDING_QUOTES'
  // Send
  | 'GENERATE_SEND_TOKEN'
  | 'GET_MELT_QUOTE'
  | 'MELT_PROOFS'
  | 'GET_PENDING_TOKENS'
  // Mint info
  | 'GET_MINT_INFO'
  | 'GET_MINT_BALANCE_DETAILS'
  // Security
  | 'GET_SECURITY_CONFIG'
  | 'SETUP_SECURITY'
  | 'VERIFY_AUTH'
  | 'CHECK_SESSION'
  | 'CLEAR_SESSION'
  | 'CHANGE_CREDENTIAL'
  | 'RECOVER_WITH_PHRASE'
  | 'DISABLE_SECURITY'
  | 'GET_RECOVERY_PHRASE'
  // NUT-13 Seed Recovery
  | 'START_SEED_RECOVERY'
  | 'GET_RECOVERY_PROGRESS'
  | 'CANCEL_RECOVERY'
  | 'GET_WALLET_INFO'
  | 'SETUP_WALLET_SEED';

// Base message structure
export interface BaseMessage {
  type: MessageType;
  [key: string]: unknown;
}

// Message from injected script to content script
export interface PaymentRequiredMessage extends BaseMessage {
  type: 'PAYMENT_REQUIRED';
  requestId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  paymentRequest: XCashuPaymentRequest;
  origin: string;
}

// Token response back to injected script
export interface PaymentTokenMessage extends BaseMessage {
  type: 'PAYMENT_TOKEN';
  requestId: string;
  token: string;
}

// Payment denied by user
export interface PaymentDeniedMessage extends BaseMessage {
  type: 'PAYMENT_DENIED';
  requestId: string;
  reason: string;
}

// Payment failed (insufficient funds, etc.)
export interface PaymentFailedMessage extends BaseMessage {
  type: 'PAYMENT_FAILED';
  requestId: string;
  error: string;
}

// Approval request to popup
export interface ApprovalRequestMessage extends BaseMessage {
  type: 'APPROVAL_REQUEST';
  requestId: string;
  origin: string;
  paymentRequest: XCashuPaymentRequest;
}

// Approval response from popup
export interface ApprovalResponseMessage extends BaseMessage {
  type: 'APPROVAL_RESPONSE';
  requestId: string;
  approved: boolean;
  rememberSite: boolean;
}

// Allowlist entry
export interface AllowlistEntry {
  origin: string;
  autoApprove: boolean;
  maxPerPayment: number;
  maxPerDay: number;
  dailySpent: number;
  lastResetDate: string;
}

// Available themes
export type ThemeId = 'classic' | 'violet' | 'midnight' | 'ocean' | 'forest' | 'bitcoin';

// Extension settings
export interface Settings {
  alwaysAsk: boolean;
  preferredWallet: 'builtin' | 'nwc' | 'nip60';
  autoDiscoverMints: boolean;
  displayFormat: 'symbol' | 'text'; // 'symbol' = ₿10, 'text' = 10 sats
  theme: ThemeId;
  nwcConnectionString?: string;
  nip60Pubkey?: string;
}

// Mint configuration
export interface MintConfig {
  url: string;
  name: string;
  enabled: boolean;
  trusted: boolean;
}

// Stored proof with metadata
export interface StoredProof {
  proof: Proof;
  mintUrl: string;
  amount: number;
  dateReceived: number;
}

// Transaction record
export interface Transaction {
  id: string;
  type: 'payment' | 'receive';
  amount: number;
  unit: string;
  mintUrl: string;
  origin?: string;
  timestamp: number;
  status: 'pending' | 'completed' | 'failed';
  token?: string; // For ecash sends, stores the token for recovery
}

// Wallet balance by mint
export interface MintBalance {
  mintUrl: string;
  mintName: string;
  balance: number;
  unit: string;
}

// Pending payment request
export interface PendingPayment {
  requestId: string;
  tabId: number;
  origin: string;
  paymentRequest: XCashuPaymentRequest;
  originalRequest: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;
  };
  timestamp: number;
}

// Pending Lightning mint quote (for receiving via Lightning)
export interface PendingMintQuote {
  id: string;
  quoteId: string;
  mintUrl: string;
  amount: number;
  invoice: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'paid' | 'minted';
}

// Pending token for send/recovery
export interface PendingToken {
  id: string;
  token: string;
  amount: number;
  mintUrl: string;
  createdAt: number;
  purpose: 'manual_send' | 'lightning_melt';
  destination?: string;
  status: 'pending' | 'claimed' | 'expired';
}

// Melt quote for sending Lightning
export interface MeltQuoteInfo {
  quote: string;
  amount: number;
  fee: number;
  expiry: number;
}

// Security configuration
export interface SecurityConfig {
  enabled: boolean;
  type: 'pin' | 'password';
  hash: string;              // SHA-256 hash of PIN/password
  salt: string;              // Random salt for hashing
  recoveryPhraseHash: string; // Hash to verify recovery phrase
  createdAt: number;
}

// Session state (stored separately, more volatile)
export interface SessionState {
  expiresAt: number;         // Timestamp when session expires
  failedAttempts: number;    // Failed auth attempts
  lockedUntil: number | null; // Timestamp when lockout ends
}

// NUT-13 Recovery Progress
export interface RecoveryProgress {
  mintUrl: string;
  status: 'scanning' | 'found' | 'complete' | 'error';
  proofsFound: number;
  totalAmount: number;
  currentCounter: number;
  errorMessage?: string;
}

// NUT-13 Recovery Result
export interface RecoveryResult {
  success: boolean;
  totalRecovered: number;
  mintResults: Array<{
    mintUrl: string;
    amount: number;
    proofCount: number;
  }>;
  errors: string[];
}

// Recovery State (for tracking in-progress recovery)
export interface RecoveryState {
  inProgress: boolean;
  startedAt?: number;
  mintUrls: string[];
  progress: RecoveryProgress[];
  result?: RecoveryResult;
}

// Union type for all messages
export type ExtensionMessage =
  | PaymentRequiredMessage
  | PaymentTokenMessage
  | PaymentDeniedMessage
  | PaymentFailedMessage
  | ApprovalRequestMessage
  | ApprovalResponseMessage
  | BaseMessage;
