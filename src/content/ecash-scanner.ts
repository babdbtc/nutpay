// Ecash Scanner - detects cashu tokens on web pages and shows a claim notification
// This is injected into pages as part of the content script.

// Pattern to match cashu tokens (V3: cashuA..., V4: cashuB...)
const CASHU_TOKEN_REGEX = /\b(cashu[AB][A-Za-z0-9_\-=+/]{20,})\b/g;

// Track tokens we've already found/notified about to avoid duplicates
const foundTokens = new Set<string>();

// Track if the toast is currently visible
let toastElement: HTMLElement | null = null;
let pendingTokens: Array<{ token: string; element: Element | null }> = [];

// Theme color map - matches the preview colors from each theme definition
const THEME_COLORS: Record<string, { bg: string; card: string; accent: string }> = {
  classic:  { bg: '#16162a', card: '#252542', accent: '#f97316' },
  violet:   { bg: '#16162a', card: '#252542', accent: '#a855f7' },
  midnight: { bg: '#000000', card: '#111111', accent: '#ffffff' },
  ocean:    { bg: '#0a1929', card: '#132f4c', accent: '#5090d3' },
  forest:   { bg: '#0d1f0d', card: '#1a331a', accent: '#4ade80' },
  bitcoin:  { bg: '#1a1307', card: '#2d2210', accent: '#f7931a' },
};

// Current theme colors (default to midnight)
let currentColors = THEME_COLORS['midnight'];

// Whether to auto-claim found tokens
let autoClaimEnabled = false;

// Fetch the current settings (theme + auto-claim)
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

// Scan a DOM node for cashu tokens
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
    // Skip script, style, and our own toast
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return results;
    if (el.id === 'nutpay-ecash-toast') return results;
    // Skip hidden elements
    if ((el as HTMLElement).hidden) return results;

    for (const child of el.childNodes) {
      results.push(...scanNode(child));
    }
  }

  return results;
}

// Ensure toast animation styles are injected once
function ensureToastStyles(): void {
  if (!document.getElementById('nutpay-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'nutpay-toast-styles';
    style.textContent = `
      @keyframes nutpay-slide-in {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes nutpay-slide-out {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(-100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Create and show the claim toast notification (manual flow)
function showClaimToast(tokens: Array<{ token: string; element: Element | null }>): void {
  // Remove existing toast
  if (toastElement) {
    toastElement.remove();
    toastElement = null;
  }

  pendingTokens = tokens;
  const count = tokens.length;

  ensureToastStyles();

  const { card, accent } = currentColors;
  // Determine button text color: use dark text on light accents, white on dark accents
  const btnTextColor = accent === '#ffffff' || accent === '#4ade80' ? '#000000' : '#ffffff';

  const toast = document.createElement('div');
  toast.id = 'nutpay-ecash-toast';
  toast.setAttribute('style', `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    background: ${card};
    color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    padding: 12px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 320px;
    animation: nutpay-slide-in 0.25s ease-out;
  `);

  toast.innerHTML = `
    <div style="flex: 1; min-width: 0;">
      <div style="font-weight: 600; font-size: 13px; margin-bottom: 1px;">Ecash found</div>
      <div style="font-size: 11px; color: #888;">${count} token${count > 1 ? 's' : ''} on this page</div>
    </div>
    <button id="nutpay-claim-btn" style="
      flex-shrink: 0;
      background: ${accent};
      color: ${btnTextColor};
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    ">Claim</button>
    <button id="nutpay-dismiss-btn" style="
      flex-shrink: 0;
      background: none;
      border: none;
      color: #555;
      cursor: pointer;
      padding: 2px;
      font-size: 16px;
      line-height: 1;
    ">&times;</button>
  `;

  document.body.appendChild(toast);
  toastElement = toast;

  // Claim button
  const claimBtn = document.getElementById('nutpay-claim-btn');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => claimAllTokens());
  }

  // Dismiss button
  const dismissBtn = document.getElementById('nutpay-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => dismissToast());
  }

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (toastElement === toast) dismissToast();
  }, 30000);
}

// Dismiss the toast
function dismissToast(): void {
  if (toastElement) {
    toastElement.style.animation = 'nutpay-slide-out 0.2s ease-in forwards';
    const el = toastElement;
    setTimeout(() => {
      el.remove();
      if (toastElement === el) toastElement = null;
    }, 200);
  }
}

// Update toast to show claiming state
function showClaimingState(): void {
  if (!toastElement) return;
  const claimBtn = document.getElementById('nutpay-claim-btn');
  if (claimBtn) {
    claimBtn.textContent = '...';
    claimBtn.style.opacity = '0.6';
    (claimBtn as HTMLButtonElement).disabled = true;
  }
}

// Update toast to show success
function showClaimSuccess(amount: number): void {
  if (!toastElement) return;
  toastElement.style.borderColor = 'rgba(34, 197, 94, 0.3)';
  const content = toastElement.querySelector('div[style*="flex: 1"]');
  if (content) {
    content.innerHTML = `
      <div style="font-weight: 600; font-size: 13px; color: #22c55e;">Claimed ${amount} sats</div>
    `;
  }
  const claimBtn = document.getElementById('nutpay-claim-btn');
  if (claimBtn) claimBtn.remove();

  setTimeout(() => dismissToast(), 3000);
}

// Update toast to show error
function showClaimError(error: string): void {
  if (!toastElement) return;
  toastElement.style.borderColor = 'rgba(239, 68, 68, 0.3)';
  const claimBtn = document.getElementById('nutpay-claim-btn');
  if (claimBtn) {
    claimBtn.textContent = 'Retry';
    claimBtn.style.opacity = '1';
    claimBtn.style.background = '#ef4444';
    (claimBtn as HTMLButtonElement).disabled = false;
  }
  const content = toastElement.querySelector('div[style*="flex: 1"]');
  if (content) {
    content.innerHTML = `
      <div style="font-weight: 600; font-size: 13px; color: #ef4444;">Failed</div>
      <div style="font-size: 11px; color: #888;">${error}</div>
    `;
  }
}

// Claim all found tokens via the background service worker (manual flow)
async function claimAllTokens(): Promise<void> {
  showClaimingState();

  let totalAmount = 0;
  let anyFailed = false;

  for (const { token } of pendingTokens) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'ADD_PROOFS',
        token,
      });

      if (response?.success) {
        totalAmount += response.amount || 0;
      } else {
        console.log('[Nutpay] Token claim failed:', response?.error);
      }
    } catch (error) {
      console.error('[Nutpay] Failed to claim token:', error);
      anyFailed = true;
    }
  }

  if (totalAmount > 0) {
    pendingTokens = [];
    showClaimSuccess(totalAmount);
  } else if (anyFailed) {
    showClaimError('Communication error');
  } else {
    showClaimError('Already spent or invalid');
  }
}

// Auto-claim tokens silently, only show toast on success
async function autoClaimTokens(tokens: Array<{ token: string; element: Element | null }>): Promise<void> {
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
    showAutoClaimSuccessToast(totalAmount);
  }
  // Silently ignore failures — token was likely already spent or invalid
}

// Show a minimal success toast for auto-claimed tokens (no buttons)
function showAutoClaimSuccessToast(amount: number): void {
  if (toastElement) {
    toastElement.remove();
    toastElement = null;
  }

  ensureToastStyles();

  const { card } = currentColors;

  const toast = document.createElement('div');
  toast.id = 'nutpay-ecash-toast';
  toast.setAttribute('style', `
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    background: ${card};
    color: #fff;
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 10px;
    padding: 12px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 320px;
    animation: nutpay-slide-in 0.25s ease-out;
  `);

  toast.innerHTML = `
    <div style="flex: 1; min-width: 0;">
      <div style="font-weight: 600; font-size: 13px; color: #22c55e;">Claimed ${amount} sats</div>
    </div>
    <button id="nutpay-dismiss-btn" style="
      flex-shrink: 0;
      background: none;
      border: none;
      color: #555;
      cursor: pointer;
      padding: 2px;
      font-size: 16px;
      line-height: 1;
    ">&times;</button>
  `;

  document.body.appendChild(toast);
  toastElement = toast;

  const dismissBtn = document.getElementById('nutpay-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => dismissToast());
  }

  setTimeout(() => {
    if (toastElement === toast) dismissToast();
  }, 5000);
}

// Handle found tokens — auto-claim or show manual toast
function handleFoundTokens(tokens: Array<{ token: string; element: Element | null }>): void {
  if (autoClaimEnabled) {
    autoClaimTokens(tokens);
  } else {
    showClaimToast(tokens);
  }
}

// Run initial scan after DOM is loaded
function runInitialScan(): void {
  const tokens = scanNode(document.body);
  if (tokens.length > 0) {
    console.log(`[Nutpay] Found ${tokens.length} ecash token(s) on page`);
    handleFoundTokens(tokens);
  }
}

// Watch for dynamic content changes
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
      pendingTokens.push(...newTokens);
      handleFoundTokens(pendingTokens);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Get the list of found tokens (for querying from popup)
export function getFoundTokens(): Array<{ token: string }> {
  return pendingTokens.map(({ token }) => ({ token }));
}

// Initialize scanner
export async function initEcashScanner(): Promise<void> {
  // Load settings (theme colors + auto-claim preference) before showing any toasts
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
