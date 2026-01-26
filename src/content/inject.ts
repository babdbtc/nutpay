// This script is injected into the page context to intercept fetch/XHR
// It communicates with the content script via window.postMessage

interface CashuPaymentInfo {
  mint: string;
  amount: number;
  unit: string;
}

interface PendingRequest {
  resolve: (value: Response) => void;
  reject: (error: Error) => void;
  originalRequest: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string | null;
  };
}

const MESSAGE_TO_CONTENT = 'nutpay_to_content';
const MESSAGE_FROM_CONTENT = 'nutpay_from_content';

// Map of pending requests waiting for payment
const pendingRequests = new Map<string, PendingRequest>();

// Generate unique request ID
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Parse 402 response body for payment requirements
function parsePaymentInfo(body: string): CashuPaymentInfo | null {
  try {
    const parsed = JSON.parse(body);
    if (parsed.mint && parsed.amount) {
      return {
        mint: parsed.mint,
        amount: parsed.amount,
        unit: parsed.unit || 'sat',
      };
    }
  } catch {
    // Try text format
    const mintMatch = body.match(/mint[=:]\s*([^\s,]+)/i);
    const amountMatch = body.match(/amount[=:]\s*(\d+)/i);
    const unitMatch = body.match(/unit[=:]\s*([^\s,]+)/i);

    if (mintMatch && amountMatch) {
      return {
        mint: mintMatch[1],
        amount: parseInt(amountMatch[1], 10),
        unit: unitMatch?.[1] || 'sat',
      };
    }
  }
  return null;
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
  console.log('[Nutpay Inject] Received from content script:', message);

  if (message.type === 'PAYMENT_TOKEN') {
    const pending = pendingRequests.get(message.requestId);
    if (pending) {
      // Retry the request with the payment token
      retryWithPayment(message.requestId, message.token);
    }
  } else if (message.type === 'PAYMENT_DENIED' || message.type === 'PAYMENT_FAILED') {
    const pending = pendingRequests.get(message.requestId);
    if (pending) {
      pendingRequests.delete(message.requestId);
      // Return the original 402 response
      // We can't actually do this, so we reject
      pending.reject(new Error(message.reason || message.error || 'Payment failed'));
    }
  }
});

// Retry a request with the payment token
async function retryWithPayment(requestId: string, token: string): Promise<void> {
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  pendingRequests.delete(requestId);
  const { originalRequest, resolve, reject } = pending;

  try {
    const headers = {
      ...originalRequest.headers,
      'X-Cashu': token,
    };

    const response = await originalFetch(originalRequest.url, {
      method: originalRequest.method,
      headers,
      body: originalRequest.body,
    });

    resolve(response);
  } catch (error) {
    reject(error instanceof Error ? error : new Error(String(error)));
  }
}

// Store original fetch
const originalFetch = window.fetch;

// Override fetch
window.fetch = async function (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await originalFetch(input, init);

  // Check for 402 response
  console.log('[Nutpay Inject] Response status:', response.status);
  if (response.status === 402) {
    console.log('[Nutpay Inject] Got 402 response!');
    const clonedResponse = response.clone();
    const body = await clonedResponse.text();
    console.log('[Nutpay Inject] Body:', body);
    const paymentInfo = parsePaymentInfo(body);
    console.log('[Nutpay Inject] Parsed payment info:', paymentInfo);

    if (paymentInfo) {
      console.log('[Nutpay Inject] Sending PAYMENT_REQUIRED to content script...');
      const requestId = generateRequestId();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

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

      // Create a promise that will be resolved when payment completes
      return new Promise((resolve, reject) => {
        pendingRequests.set(requestId, {
          resolve,
          reject,
          originalRequest: {
            url,
            method: init?.method || 'GET',
            headers,
            body: typeof init?.body === 'string' ? init.body : null,
          },
        });

        // Send payment required message to content script
        const msg = {
          type: 'PAYMENT_REQUIRED',
          requestId,
          url,
          method: init?.method || 'GET',
          headers,
          body: typeof init?.body === 'string' ? init.body : null,
          paymentRequest: paymentInfo,
          origin: window.location.origin,
        };
        console.log('[Nutpay Inject] Sending message:', msg);
        sendToContent(msg);
        console.log('[Nutpay Inject] Message sent, waiting for response...');

        // Set timeout
        setTimeout(() => {
          if (pendingRequests.has(requestId)) {
            pendingRequests.delete(requestId);
            // Return original response on timeout
            resolve(response);
          }
        }, 60000);
      });
    }
  }

  return response;
};

// Store original XMLHttpRequest
const OriginalXHR = window.XMLHttpRequest;

// Override XMLHttpRequest
class InterceptedXHR extends OriginalXHR {
  private _url: string = '';
  private _method: string = 'GET';
  private _headers: Record<string, string> = {};
  private _body: string | null = null;
  private _requestId: string | null = null;

  open(method: string, url: string | URL, async?: boolean, user?: string | null, password?: string | null): void {
    this._method = method;
    this._url = url.toString();
    super.open(method, url, async ?? true, user, password);
  }

  setRequestHeader(name: string, value: string): void {
    this._headers[name] = value;
    super.setRequestHeader(name, value);
  }

  send(body?: Document | XMLHttpRequestBodyInit | null): void {
    this._body = typeof body === 'string' ? body : null;

    const originalOnReadyStateChange = this.onreadystatechange;

    this.onreadystatechange = (ev: Event) => {
      if (this.readyState === 4 && this.status === 402) {
        const paymentInfo = parsePaymentInfo(this.responseText);

        if (paymentInfo && !this._requestId) {
          this._requestId = generateRequestId();

          // Store reference for retry
          const xhr = this;

          pendingRequests.set(this._requestId, {
            resolve: (response: Response) => {
              // XHR doesn't have a clean way to replace response
              // We'll dispatch a custom event instead
              response.text().then((text) => {
                const event = new CustomEvent('nutpay_xhr_complete', {
                  detail: { requestId: xhr._requestId, response: text, status: response.status },
                });
                window.dispatchEvent(event);
              });
            },
            reject: () => {
              // Let original response through
              if (originalOnReadyStateChange) {
                originalOnReadyStateChange.call(this, ev);
              }
            },
            originalRequest: {
              url: this._url,
              method: this._method,
              headers: this._headers,
              body: this._body,
            },
          });

          // Send payment required message
          sendToContent({
            type: 'PAYMENT_REQUIRED',
            requestId: this._requestId,
            url: this._url,
            method: this._method,
            headers: this._headers,
            body: this._body,
            paymentRequest: paymentInfo,
            origin: window.location.origin,
          });

          // Don't call original handler yet - wait for payment
          return;
        }
      }

      if (originalOnReadyStateChange) {
        originalOnReadyStateChange.call(this, ev);
      }
    };

    super.send(body);
  }
}

window.XMLHttpRequest = InterceptedXHR as typeof XMLHttpRequest;

// Signal that injection is complete
console.log('[Nutpay] Payment interceptor initialized');
