// This script is injected into the page context to intercept fetch requests.
// It detects HTTP 402 responses with X-Cashu headers (NUT-24) and communicates
// with the content script via window.postMessage to handle payments.

interface PendingRequest {
  resolve: (value: Response) => void;
  originalResponse: Response; // The original 402 response (for fallback)
  originalRequest: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;
  };
}

const MESSAGE_TO_CONTENT = 'nutpay_to_content';
const MESSAGE_FROM_CONTENT = 'nutpay_from_content';
const XCASHU_HEADER = 'X-Cashu';
const PAYMENT_TIMEOUT_MS = 60_000;

// Map of pending requests waiting for payment
const pendingRequests = new Map<string, PendingRequest>();

// Generate unique request ID
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Send message to content script
function sendToContent(message: unknown): void {
  window.postMessage({ source: MESSAGE_TO_CONTENT, payload: message }, '*');
}

// Listen for messages from content script
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== MESSAGE_FROM_CONTENT) return;

  const message = event.data.payload;

  if (message.type === 'PAYMENT_TOKEN') {
    const pending = pendingRequests.get(message.requestId);
    if (pending) {
      retryWithPayment(message.requestId, message.token);
    }
  } else if (message.type === 'PAYMENT_DENIED' || message.type === 'PAYMENT_FAILED') {
    const pending = pendingRequests.get(message.requestId);
    if (pending) {
      pendingRequests.delete(message.requestId);
      // Return the original 402 response instead of throwing an error
      pending.resolve(pending.originalResponse);
    }
  }
});

// Retry a request with the payment token in X-Cashu header
async function retryWithPayment(requestId: string, token: string): Promise<void> {
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  pendingRequests.delete(requestId);
  const { originalRequest, resolve } = pending;

  try {
    const headers = {
      ...originalRequest.headers,
      [XCASHU_HEADER]: token,
    };

    const response = await originalFetch(originalRequest.url, {
      method: originalRequest.method,
      headers,
      body: originalRequest.body,
    });

    resolve(response);
  } catch {
    // If retry fails, return original 402 response
    resolve(pending.originalResponse);
  }
}

// Store original fetch before overriding
const originalFetch = window.fetch;

// Override fetch to intercept 402 responses with X-Cashu headers (NUT-24)
window.fetch = async function (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await originalFetch(input, init);

  // Only intercept 402 Payment Required responses
  if (response.status !== 402) {
    return response;
  }

  // Check for X-Cashu header containing a NUT-18 payment request (creqA...)
  const xcashuHeader = response.headers.get(XCASHU_HEADER);
  if (!xcashuHeader) {
    return response;
  }

  const requestId = generateRequestId();
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;

  // Extract headers from init
  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(init.headers)) {
      init.headers.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, init.headers);
    }
  }

  // Create a promise that will be resolved when payment completes or is denied
  return new Promise((resolve) => {
    pendingRequests.set(requestId, {
      resolve,
      originalResponse: response,
      originalRequest: {
        url,
        method: init?.method || 'GET',
        headers,
        body: typeof init?.body === 'string' ? init.body : null,
      },
    });

    // Send the raw encoded payment request to the content script
    // The background service worker will decode the creqA... NUT-18 format
    sendToContent({
      type: 'PAYMENT_REQUIRED',
      requestId,
      url,
      method: init?.method || 'GET',
      headers,
      body: typeof init?.body === 'string' ? init.body : null,
      paymentRequestEncoded: xcashuHeader,
      origin: window.location.origin,
    });

    // Timeout: return original 402 response if payment takes too long
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        resolve(response);
      }
    }, PAYMENT_TIMEOUT_MS);
  });
};

// Signal that injection is complete
console.log('[Nutpay] NUT-24 payment interceptor initialized');
