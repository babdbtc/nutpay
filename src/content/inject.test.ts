import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function createMockResponse(
  status: number,
  headers: Record<string, string | null> = {}
): Response {
  return {
    status,
    headers: { get: (name: string): string | null => headers[name] ?? null },
  } as unknown as Response;
}

describe('inject.ts', () => {
  let windowListeners: Map<string, ((e: unknown) => void)[]>;
  let dispatchedEvents: { type: string; detail: unknown }[];
  let mockOriginalFetch: ReturnType<typeof vi.fn>;
  let mockWindow: Record<string, unknown>;

  beforeEach(async () => {
    vi.resetModules(); // ensures inject.ts IIFE re-runs on each test import
    vi.useFakeTimers();

    windowListeners = new Map();
    dispatchedEvents = [];
    mockOriginalFetch = vi.fn();

    mockWindow = {
      fetch: mockOriginalFetch,
      postMessage: vi.fn(),
      dispatchEvent: vi.fn((event: { type: string; detail?: unknown }) => {
        dispatchedEvents.push({ type: event.type, detail: event.detail });
      }),
      addEventListener: vi.fn((type: string, listener: (e: unknown) => void) => {
        if (!windowListeners.has(type)) windowListeners.set(type, []);
        windowListeners.get(type)!.push(listener);
      }),
      removeEventListener: vi.fn(),
      location: { origin: 'https://test.example.com' },
    };

    if (!(globalThis as Record<string, unknown>).CustomEvent) {
      (globalThis as Record<string, unknown>).CustomEvent = class MockCustomEvent {
        type: string;
        detail: unknown;
        constructor(type: string, options?: { detail?: unknown }) {
          this.type = type;
          this.detail = options?.detail;
        }
      };
    }

    (globalThis as Record<string, unknown>).window = mockWindow;
    await import('./inject');
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).window;
  });

  function sendFromContent(payload: Record<string, unknown>): void {
    const listeners = windowListeners.get('message') ?? [];
    const event = {
      source: mockWindow, // inject.ts guards: `if (event.source !== window) return`
      data: { source: 'nutpay_from_content', payload },
    };
    listeners.forEach((l) => l(event));
  }

  function lastPostMessageRequestId(): string {
    const calls = (mockWindow.postMessage as ReturnType<typeof vi.fn>).mock.calls;
    return (calls[calls.length - 1][0] as { payload: { requestId: string } }).payload.requestId;
  }

  function start402Fetch(url = 'https://api.example.com/paid') {
    const mockResponse = createMockResponse(402, { 'X-Cashu': 'creqAtest' });
    mockOriginalFetch.mockResolvedValue(mockResponse);
    const fetchPromise = (mockWindow.fetch as (url: string) => Promise<Response>)(url);
    return { fetchPromise, mockResponse };
  }

  async function flushMicrotasks(): Promise<void> {
    // Two ticks: first resolves `await originalFetch` inside the override,
    // second lets the synchronous continuation (dispatchEvent, setTimeout) run.
    await Promise.resolve();
    await Promise.resolve();
  }

  it('sets window.__nutpay_installed to true after module loads', () => {
    expect(mockWindow.__nutpay_installed).toBe(true);
  });

  it('dispatches nutpay:payment-pending when 402+X-Cashu response detected', async () => {
    const { fetchPromise } = start402Fetch();
    await flushMicrotasks();

    const pendingEvent = dispatchedEvents.find((e) => e.type === 'nutpay:payment-pending');
    expect(pendingEvent).toBeDefined();
    expect(pendingEvent?.detail).toMatchObject({
      requestId: expect.any(String),
      url: 'https://api.example.com/paid',
    });

    vi.advanceTimersByTime(61_000);
    await fetchPromise;
  });

  it('dispatches nutpay:payment-failed with correct detail when PAYMENT_FAILED received', async () => {
    const { fetchPromise, mockResponse } = start402Fetch();
    await flushMicrotasks();

    const requestId = lastPostMessageRequestId();
    sendFromContent({ type: 'PAYMENT_FAILED', requestId, error: 'Insufficient funds' });

    const result = await fetchPromise;

    const failedEvent = dispatchedEvents.find((e) => e.type === 'nutpay:payment-failed');
    expect(failedEvent).toBeDefined();
    expect(failedEvent?.detail).toMatchObject({
      requestId,
      error: 'Insufficient funds',
      url: 'https://api.example.com/paid',
    });
    expect(result).toBe(mockResponse);
    expect(result.status).toBe(402);
  });

  it('dispatches nutpay:payment-denied with correct detail when PAYMENT_DENIED received', async () => {
    const { fetchPromise, mockResponse } = start402Fetch();
    await flushMicrotasks();

    const requestId = lastPostMessageRequestId();
    sendFromContent({ type: 'PAYMENT_DENIED', requestId, reason: 'User denied' });

    const result = await fetchPromise;

    const deniedEvent = dispatchedEvents.find((e) => e.type === 'nutpay:payment-denied');
    expect(deniedEvent).toBeDefined();
    expect(deniedEvent?.detail).toMatchObject({
      requestId,
      reason: 'User denied',
      url: 'https://api.example.com/paid',
    });
    expect(result).toBe(mockResponse);
    expect(result.status).toBe(402);
  });

  it('dispatches nutpay:payment-success with correct detail when PAYMENT_TOKEN received', async () => {
    const mock402 = createMockResponse(402, { 'X-Cashu': 'creqAtest' });
    const mock200 = createMockResponse(200);
    mockOriginalFetch.mockResolvedValueOnce(mock402).mockResolvedValueOnce(mock200);

    const fetchPromise = (mockWindow.fetch as (url: string) => Promise<Response>)(
      'https://api.example.com/paid'
    );
    await flushMicrotasks();

    const requestId = lastPostMessageRequestId();
    sendFromContent({ type: 'PAYMENT_TOKEN', requestId, token: 'cashuBtesttoken' });

    const result = await fetchPromise;

    const successEvent = dispatchedEvents.find((e) => e.type === 'nutpay:payment-success');
    expect(successEvent).toBeDefined();
    expect(successEvent?.detail).toMatchObject({
      requestId,
      url: 'https://api.example.com/paid',
    });
    expect(result).toBe(mock200);
    expect(result.status).toBe(200);
  });

  it('returns original 402 response after payment failure (behaviour preservation)', async () => {
    const { fetchPromise, mockResponse } = start402Fetch();
    await flushMicrotasks();

    const requestId = lastPostMessageRequestId();
    sendFromContent({ type: 'PAYMENT_FAILED', requestId, error: 'No funds' });

    const result = await fetchPromise;
    expect(result).toBe(mockResponse);
    expect(result.status).toBe(402);
  });

  it('dispatches nutpay:payment-failed with "Payment timed out" when payment times out', async () => {
    const url = 'https://api.example.com/paid';
    const { fetchPromise } = start402Fetch(url);
    await flushMicrotasks();

    const requestId = lastPostMessageRequestId();
    vi.advanceTimersByTime(61_000);
    await fetchPromise;

    const timeoutEvent = dispatchedEvents.find(
      (e) =>
        e.type === 'nutpay:payment-failed' &&
        (e.detail as { error?: string })?.error === 'Payment timed out'
    );
    expect(timeoutEvent).toBeDefined();
    expect(timeoutEvent?.detail).toMatchObject({
      requestId,
      error: 'Payment timed out',
      url,
    });
  });
});
