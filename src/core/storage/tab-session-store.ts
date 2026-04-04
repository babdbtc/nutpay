import type { TabSession } from '../../shared/types';

function sessionKey(tabId: number): string {
  return `tab_session_${tabId}`;
}

export async function createTabSession(tabId: number, origin: string): Promise<void> {
  const session: TabSession = {
    origin,
    approvedAt: Date.now(),
  };
  await chrome.storage.session.set({ [sessionKey(tabId)]: session });
}

export async function getTabSession(tabId: number): Promise<TabSession | null> {
  const key = sessionKey(tabId);
  const stored = await chrome.storage.session.get(key);
  return (stored[key] as TabSession) ?? null;
}

export async function removeTabSession(tabId: number): Promise<void> {
  await chrome.storage.session.remove(sessionKey(tabId));
}

export async function isTabSessionValid(tabId: number, origin: string): Promise<boolean> {
  const session = await getTabSession(tabId);
  return session !== null && session.origin === origin;
}
