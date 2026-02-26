// Ecash Scanner — detects cashu tokens on web pages and orchestrates claiming.
// Toast DOM/UI is delegated to ./claim-toast.ts.

import {
  type ToastToken,
  type ToastColors,
  showClaimToast as renderClaimToast,
  showAutoClaimSuccessToast,
  dismissToast,
  showRowClaimingState,
  showRowClaimSuccess,
  showRowFailed,
  disableAllButtons,
  showClaimAllResult,
  updateClaimAllAfterDone,
  removeClaimAllButton,
  showUnlockWaitingState,
  restoreClaimButtons,
  toastTimeout,
  setUnlockPoll,
  clearUnlockPoll,
  isUnlockPolling,
} from './claim-toast';

// ─── Constants & State ───────────────────────────────────────────────────────

// Pattern to match cashu tokens (V3: cashuA..., V4: cashuB...)
const CASHU_TOKEN_REGEX = /\b(cashu[AB][A-Za-z0-9_\-=+/]{20,})\b/g;

// Track tokens we've already found/notified about to avoid duplicates
const foundTokens = new Set<string>();

// Tokens currently displayed in the toast (mutable — entries are zeroed out after claiming)
let pendingTokens: ToastToken[] = [];

// Theme color map — matches the preview colors from each theme definition
const THEME_COLORS: Record<string, ToastColors> = {
  classic:  { bg: '#16162a', card: '#252542', accent: '#f97316' },
  violet:   { bg: '#16162a', card: '#252542', accent: '#a855f7' },
  midnight: { bg: '#000000', card: '#111111', accent: '#ffffff' },
  ocean:    { bg: '#0a1929', card: '#132f4c', accent: '#5090d3' },
  forest:   { bg: '#0d1f0d', card: '#1a331a', accent: '#4ade80' },
  bitcoin:  { bg: '#1a1307', card: '#2d2210', accent: '#f7931a' },
};

// Current theme colors (default to midnight)
let currentColors: ToastColors = THEME_COLORS['midnight'];

// Whether to auto-claim found tokens
let autoClaimEnabled = false;

// ─── Messaging Helpers ───────────────────────────────────────────────────────

/** Notify the popup/sidepanel (if open) that tokens were claimed from the in-page toast. */
function notifyPopupTokensClaimed(): void {
  chrome.runtime.sendMessage({ type: 'PAGE_TOKENS_CLAIMED' }).catch(() => {});
}

// ─── Settings & Token Decoding ───────────────────────────────────────────────

async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    const themeId = result?.theme || 'midnight';
    if (THEME_COLORS[themeId]) {
      currentColors = THEME_COLORS[themeId];
    }
    autoClaimEnabled = result?.autoClaimTokens === true;
  } catch {
    // Use defaults if settings can't be loaded
  }
}

async function decodeAmount(token: string): Promise<number | null> {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'DECODE_TOKEN', token });
    if (result?.amount !== undefined) return result.amount;
    return null;
  } catch {
    return null;
  }
}

async function resolveAmounts(
  tokens: Array<{ token: string; element: Element | null }>
): Promise<ToastToken[]> {
  return Promise.all(
    tokens.map(async ({ token, element }) => {
      const amount = await decodeAmount(token);
      return { token, amount, element };
    })
  );
}

// ─── DOM Scanning ────────────────────────────────────────────────────────────

function scanNode(node: Node): Array<{ token: string; element: Element | null }> {
  const results: Array<{ token: string; element: Element | null }> = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    const matches = text.matchAll(CASHU_TOKEN_REGEX);
    for (const match of matches) {
      const token = match[1];
      if (!foundTokens.has(token)) {
        foundTokens.add(token);
        results.push({ token, element: node.parentElement });
      }
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return results;
    if (el.id === 'nutpay-ecash-toast') return results;
    if ((el as HTMLElement).hidden) return results;

    for (const child of el.childNodes) {
      results.push(...scanNode(child));
    }
  }

  return results;
}

// ─── Wallet Lock Check ───────────────────────────────────────────────────────

async function isWalletLocked(): Promise<boolean> {
  try {
    const session = await chrome.runtime.sendMessage({ type: 'CHECK_SESSION' });
    return session?.securityEnabled === true && !session?.valid;
  } catch {
    return false;
  }
}

// ─── Unlock Flow ─────────────────────────────────────────────────────────────

/** Open the extension popup so the user can unlock, then poll and auto-claim. */
function promptUnlockAndClaim(): void {
  showUnlockWaitingState(pendingTokens.length);

  // Open the popup
  chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {});

  // Poll for unlock every 1.5s, auto-claim when unlocked
  setUnlockPoll(async () => {
    if (await isWalletLocked()) return; // Still locked, keep waiting

    clearUnlockPoll();
    claimAllTokens();
  }, 1500);

  // Give up after 60 seconds
  toastTimeout(() => {
    if (isUnlockPolling()) {
      clearUnlockPoll();
      restoreClaimButtons(pendingTokens, currentColors);
    }
  }, 60000);
}

// ─── Token State Helpers ─────────────────────────────────────────────────────

function markTokenDone(index: number): void {
  pendingTokens[index] = { ...pendingTokens[index], token: '', amount: 0, element: null };
  checkAllDone();
}

function checkAllDone(): void {
  const remaining = pendingTokens.filter(t => t.token !== '');
  if (remaining.length === 0) {
    removeClaimAllButton();
    toastTimeout(() => dismissToast(), 2000);
  } else {
    updateClaimAllAfterDone(remaining);
  }
}

// ─── Claim Actions ───────────────────────────────────────────────────────────

async function claimSingleToken(index: number): Promise<void> {
  const tokenEntry = pendingTokens[index];
  if (!tokenEntry || !tokenEntry.token) return;

  if (await isWalletLocked()) {
    promptUnlockAndClaim();
    return;
  }

  showRowClaimingState(index);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'ADD_PROOFS',
      token: tokenEntry.token,
    });

    if (response?.success) {
      showRowClaimSuccess(index, response.amount || 0);
    } else {
      showRowFailed(index);
    }
  } catch (error) {
    console.error('[Nutpay] Failed to claim token:', error);
    showRowFailed(index);
  }

  markTokenDone(index);
  notifyPopupTokensClaimed();
}

async function claimAllTokens(): Promise<void> {
  if (await isWalletLocked()) {
    promptUnlockAndClaim();
    return;
  }

  disableAllButtons();

  let totalAmount = 0;

  for (let i = 0; i < pendingTokens.length; i++) {
    const { token } = pendingTokens[i];
    if (!token) continue;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_PROOFS',
        token,
      });

      if (response?.success) {
        const amount = response.amount || 0;
        totalAmount += amount;
        showRowClaimSuccess(i, amount);
      } else {
        showRowFailed(i);
      }
    } catch (error) {
      console.error('[Nutpay] Failed to claim token:', error);
      showRowFailed(i);
    }

    pendingTokens[i] = { ...pendingTokens[i], token: '', amount: 0, element: null };
  }

  showClaimAllResult(totalAmount);
  notifyPopupTokensClaimed();
  toastTimeout(() => dismissToast(), 3000);
}

// ─── Auto-Claim ──────────────────────────────────────────────────────────────

async function autoClaimTokensFn(tokens: ToastToken[]): Promise<void> {
  // If wallet is locked, fall back to the manual claim toast which handles unlock
  if (await isWalletLocked()) {
    console.log('[Nutpay] Wallet locked — falling back to manual claim toast for unlock');
    showClaimToast(tokens);
    promptUnlockAndClaim();
    return;
  }

  let totalAmount = 0;

  for (const { token } of tokens) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_PROOFS',
        token,
      });

      if (response?.success) {
        totalAmount += response.amount || 0;
      } else {
        console.log('[Nutpay] Auto-claim failed:', response?.error);
      }
    } catch (error) {
      console.error('[Nutpay] Auto-claim error:', error);
    }
  }

  if (totalAmount > 0) {
    pendingTokens = [];
    showAutoClaimSuccessToast(totalAmount, currentColors);
    notifyPopupTokensClaimed();
  }
  // Silently ignore failures — token was already spent or invalid
}

// ─── Show Toast (wires callbacks) ────────────────────────────────────────────

function showClaimToast(tokens: ToastToken[]): void {
  pendingTokens = tokens;
  renderClaimToast(tokens, currentColors, {
    onClaimSingle: claimSingleToken,
    onClaimAll: claimAllTokens,
  });
}

// ─── Token Discovery Orchestration ───────────────────────────────────────────

async function handleFoundTokens(tokens: Array<{ token: string; element: Element | null }>): Promise<void> {
  const withAmounts = await resolveAmounts(tokens);

  if (autoClaimEnabled) {
    autoClaimTokensFn(withAmounts);
  } else {
    showClaimToast(withAmounts);
  }
}

function runInitialScan(): void {
  const tokens = scanNode(document.body);
  if (tokens.length > 0) {
    console.log(`[Nutpay] Found ${tokens.length} ecash token(s) on page`);
    handleFoundTokens(tokens);
  }
}

function observeDOMChanges(): void {
  const observer = new MutationObserver((mutations) => {
    const newTokens: Array<{ token: string; element: Element | null }> = [];

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        newTokens.push(...scanNode(node));
      }
    }

    if (newTokens.length > 0) {
      console.log(`[Nutpay] Found ${newTokens.length} new ecash token(s)`);
      resolveAmounts(newTokens).then((withAmounts) => {
        pendingTokens.push(...withAmounts);
        if (autoClaimEnabled) {
          autoClaimTokensFn(withAmounts);
        } else {
          showClaimToast(pendingTokens);
        }
      });
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ─── Public API (for content script index.ts) ────────────────────────────────

/** Get the list of found tokens (for querying from popup via GET_PAGE_ECASH). */
export function getFoundTokens(): Array<{ token: string; amount: number | null }> {
  return pendingTokens
    .filter(t => t.token !== '')
    .map(({ token, amount }) => ({ token, amount }));
}

/** Called when the popup/sidepanel claims tokens — dismiss the toast so it doesn't linger. */
export function handleTokensClaimed(): void {
  pendingTokens = pendingTokens.map(t => ({ ...t, token: '', amount: 0, element: null }));
  dismissToast();
}

/** Initialize the ecash scanner. */
export async function initEcashScanner(): Promise<void> {
  await loadSettings();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      runInitialScan();
      observeDOMChanges();
    });
  } else {
    runInitialScan();
    observeDOMChanges();
  }
}
