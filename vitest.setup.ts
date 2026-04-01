import { vi } from 'vitest';

// In-memory storage buckets
const localStore: Record<string, unknown> = {};
const sessionStore: Record<string, unknown> = {};

// Reset all mock storage (call in beforeEach in tests)
export function clearMockStorage() {
  Object.keys(localStore).forEach((k) => delete localStore[k]);
  Object.keys(sessionStore).forEach((k) => delete sessionStore[k]);
}

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
        if (!keys) return { ...localStore };
        if (typeof keys === 'string') return { [keys]: localStore[keys] };
        if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, localStore[k]]));
        // Record<string, unknown> — return with defaults
        return Object.fromEntries(
          Object.entries(keys).map(([k, def]) => [k, localStore[k] ?? def])
        );
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(localStore, items);
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const ks = Array.isArray(keys) ? keys : [keys];
        ks.forEach((k) => delete localStore[k]);
      }),
    },
    session: {
      get: vi.fn(async (keys?: string | string[] | null) => {
        if (!keys) return { ...sessionStore };
        if (typeof keys === 'string') return { [keys]: sessionStore[keys] };
        if (Array.isArray(keys)) return Object.fromEntries(keys.map((k) => [k, sessionStore[k]]));
        return {};
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(sessionStore, items);
      }),
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  action: {
    setBadgeText: vi.fn(),
    setBadgeBackgroundColor: vi.fn(),
  },
};

globalThis.chrome = chromeMock as unknown as typeof chrome;
