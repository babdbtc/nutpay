import { removeTabSession, getTabSession } from '../core/storage/tab-session-store';

export function registerTabLifecycleListeners(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    removeTabSession(tabId).catch((error) => {
      console.warn('[Nutpay] Failed to remove tab session on close:', error);
    });
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!changeInfo.url) return;

    let newOrigin: string;
    try {
      newOrigin = new URL(changeInfo.url).origin;
    } catch {
      removeTabSession(tabId).catch((error) => {
        console.warn('[Nutpay] Failed to remove tab session on navigation:', error);
      });
      return;
    }

    getTabSession(tabId)
      .then((session) => {
        if (session && session.origin !== newOrigin) {
          return removeTabSession(tabId);
        }
      })
      .catch((error) => {
        console.warn('[Nutpay] Failed to invalidate tab session on navigation:', error);
      });
  });
}
