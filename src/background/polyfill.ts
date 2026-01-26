// Polyfill window for libraries that expect it in browser context
// Service workers use 'self' instead of 'window'
// This must be executed before any other code that might use 'window'

declare const self: typeof globalThis;

if (typeof globalThis !== 'undefined' && typeof (globalThis as Record<string, unknown>).window === 'undefined') {
  (globalThis as Record<string, unknown>).window = self;
}

// Also ensure WebSocket is available (it should be in service workers)
if (typeof self !== 'undefined' && typeof (self as Record<string, unknown>).WebSocket !== 'undefined') {
  (globalThis as Record<string, unknown>).WebSocket = (self as Record<string, unknown>).WebSocket;
}

export {};
