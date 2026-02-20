import type {
  ExtensionMessage,
  PaymentRequiredMessage,
  PaymentTokenMessage,
  PaymentDeniedMessage,
  PaymentFailedMessage,
  ApprovalRequestMessage,
  ApprovalResponseMessage,
} from './types';
import { MESSAGE_EVENTS } from './constants';

// Send message from content script to background
export function sendToBackground<T = unknown>(
  message: ExtensionMessage
): Promise<T> {
  return chrome.runtime.sendMessage(message);
}

// Send message from background to specific tab
export function sendToTab(tabId: number, message: ExtensionMessage): void {
  chrome.tabs.sendMessage(tabId, message);
}

// Send message from injected script to content script (via window.postMessage)
export function postToContent(message: ExtensionMessage): void {
  window.postMessage(
    { source: MESSAGE_EVENTS.TO_CONTENT, payload: message },
    '*'
  );
}

// Send message from content script to injected script (via window.postMessage)
export function postFromContent(message: ExtensionMessage): void {
  window.postMessage(
    { source: MESSAGE_EVENTS.FROM_CONTENT, payload: message },
    '*'
  );
}

// Listen for messages from injected script in content script
export function listenFromInjected(
  callback: (message: ExtensionMessage) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (
      event.source === window &&
      event.data?.source === MESSAGE_EVENTS.TO_CONTENT
    ) {
      callback(event.data.payload);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

// Listen for messages from content script in injected script
export function listenFromContent(
  callback: (message: ExtensionMessage) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (
      event.source === window &&
      event.data?.source === MESSAGE_EVENTS.FROM_CONTENT
    ) {
      callback(event.data.payload);
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

// Type guards for message types
export function isPaymentRequired(
  msg: ExtensionMessage
): msg is PaymentRequiredMessage {
  return msg.type === 'PAYMENT_REQUIRED';
}

export function isPaymentToken(
  msg: ExtensionMessage
): msg is PaymentTokenMessage {
  return msg.type === 'PAYMENT_TOKEN';
}

export function isPaymentDenied(
  msg: ExtensionMessage
): msg is PaymentDeniedMessage {
  return msg.type === 'PAYMENT_DENIED';
}

export function isPaymentFailed(
  msg: ExtensionMessage
): msg is PaymentFailedMessage {
  return msg.type === 'PAYMENT_FAILED';
}

export function isApprovalRequest(
  msg: ExtensionMessage
): msg is ApprovalRequestMessage {
  return msg.type === 'APPROVAL_REQUEST';
}

export function isApprovalResponse(
  msg: ExtensionMessage
): msg is ApprovalResponseMessage {
  return msg.type === 'APPROVAL_RESPONSE';
}

// Generate unique request ID
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
