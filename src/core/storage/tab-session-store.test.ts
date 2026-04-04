import { describe, it, expect, beforeEach } from 'vitest';
import { clearMockStorage } from '../../../vitest.setup';
import {
  createTabSession,
  getTabSession,
  removeTabSession,
  isTabSessionValid,
} from './tab-session-store';

const TEST_TAB_ID = 42;
const TEST_ORIGIN = 'https://example.com';

beforeEach(() => {
  clearMockStorage();
});

describe('tab-session-store', () => {
  it('createTabSession then getTabSession returns the stored session', async () => {
    await createTabSession(TEST_TAB_ID, TEST_ORIGIN);

    const session = await getTabSession(TEST_TAB_ID);

    expect(session).not.toBeNull();
    expect(session?.origin).toBe(TEST_ORIGIN);
    expect(session?.approvedAt).toBeTypeOf('number');
  });

  it('isTabSessionValid returns true for the same origin', async () => {
    await createTabSession(TEST_TAB_ID, TEST_ORIGIN);

    const valid = await isTabSessionValid(TEST_TAB_ID, TEST_ORIGIN);

    expect(valid).toBe(true);
  });

  it('isTabSessionValid returns false for a different origin', async () => {
    await createTabSession(TEST_TAB_ID, TEST_ORIGIN);

    const valid = await isTabSessionValid(TEST_TAB_ID, 'https://other.com');

    expect(valid).toBe(false);
  });

  it('isTabSessionValid returns false when no session exists', async () => {
    const valid = await isTabSessionValid(TEST_TAB_ID, TEST_ORIGIN);

    expect(valid).toBe(false);
  });

  it('removeTabSession then getTabSession returns null', async () => {
    await createTabSession(TEST_TAB_ID, TEST_ORIGIN);
    await removeTabSession(TEST_TAB_ID);

    const session = await getTabSession(TEST_TAB_ID);

    expect(session).toBeNull();
  });
});
