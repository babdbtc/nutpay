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
  | 'ADD_PROOFS'
  | 'GET_SETTINGS'
  | 'UPDATE_SETTINGS'
  | 'GET_MINTS'
  | 'GET_ALLOWLIST'
  | 'ADD_TO_ALLOWLIST'
  | 'REMOVE_FROM_ALLOWLIST'
  | 'SETTINGS_UPDATED';

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

// Extension settings
export interface Settings {
  alwaysAsk: boolean;
  preferredWallet: 'builtin' | 'nwc' | 'nip60';
  autoDiscoverMints: boolean;
  displayFormat: 'symbol' | 'text'; // 'symbol' = ₿10, 'text' = 10 sats
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

// Union type for all messages
export type ExtensionMessage =
  | PaymentRequiredMessage
  | PaymentTokenMessage
  | PaymentDeniedMessage
  | PaymentFailedMessage
  | ApprovalRequestMessage
  | ApprovalResponseMessage
  | BaseMessage;
