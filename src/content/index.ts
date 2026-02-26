// Content script - bridges between injected script and background service worker
// NOTE: Constants are inlined here intentionally. Content scripts run as classic
// scripts (not ES modules) in MV3, so they cannot use `import` statements.
// If these values are changed, update inject.ts and shared/constants.ts too.
const MSG_TO_CONTENT = 'nutpay_to_content';
const MSG_FROM_CONTENT = 'nutpay_from_content';

import { initEcashScanner } from './ecash-scanner';

// Inject the interceptor script into the page
function injectScript(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.onload = function () {
    console.log('[Nutpay] Inject script loaded successfully');
    script.remove();
  };
  script.onerror = function (e) {
    console.error('[Nutpay] Failed to load inject script:', e);
  };

  // Try different injection points since we run at document_start
  const target = document.head || document.documentElement || document.body;
  if (target) {
    target.appendChild(script);
    console.log('[Nutpay] Script appended to:', target.nodeName);
  } else {
    // If no target yet, wait for DOM
    console.log('[Nutpay] No target found, waiting for DOMContentLoaded...');
    document.addEventListener('DOMContentLoaded', () => {
      (document.head || document.documentElement).appendChild(script);
      console.log('[Nutpay] Script appended after DOMContentLoaded');
    });
  }
}

// Send message back to injected script
function postToInjected(message: unknown): void {
  window.postMessage(
    { source: MSG_FROM_CONTENT, payload: message },
    '*'
  );
}

// Listen for messages from injected script
function listenFromInjected(): void {
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== MSG_TO_CONTENT) return;

    const message = event.data.payload;
    console.log('[Nutpay] Received from page:', message.type, message);

    if (message.type === 'PAYMENT_REQUIRED') {
      try {
        console.log('[Nutpay] Forwarding payment request to background...');
        // Forward to background and wait for response
        const response = await chrome.runtime.sendMessage(message);
        console.log('[Nutpay] Got response from background:', response);

        // Guard against undefined response (service worker killed mid-request)
        if (!response) {
          postToInjected({
            type: 'PAYMENT_FAILED',
            requestId: message.requestId,
            error: 'Background service worker unavailable',
          });
          return;
        }

        // Forward response back to injected script
        postToInjected(response);
      } catch (error) {
        console.error('[Nutpay] Error forwarding to background:', error);

        // Send failure back to injected script
        postToInjected({
          type: 'PAYMENT_FAILED',
          requestId: message.requestId,
          error: 'Extension communication failed',
        });
      }
    }
  });
}

// Listen for messages from background (for push notifications)
chrome.runtime.onMessage.addListener((message) => {
  console.log('[Nutpay] Received from background:', message);
  // Forward to injected script
  postToInjected(message);
});

// Initialize
console.log('[Nutpay] Content script initializing...');
injectScript();
listenFromInjected();
initEcashScanner();
console.log('[Nutpay] Content script loaded');
