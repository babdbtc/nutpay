import { describe, it, expect, beforeEach } from 'vitest';
import { clearMockStorage } from '../vitest.setup';

describe('Chrome API mocks', () => {
  beforeEach(() => clearMockStorage());

  it('storage.local round-trips data', async () => {
    await chrome.storage.local.set({ foo: 'bar', num: 42 });
    const result = await chrome.storage.local.get(['foo', 'num']);
    expect(result.foo).toBe('bar');
    expect(result.num).toBe(42);
  });

  it('storage.local.remove deletes keys', async () => {
    await chrome.storage.local.set({ toRemove: 'yes' });
    await chrome.storage.local.remove('toRemove');
    const result = await chrome.storage.local.get('toRemove');
    expect(result.toRemove).toBeUndefined();
  });
});
