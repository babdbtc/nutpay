// Ecash Scanner - detects cashu tokens on web pages and shows a claim notification
// This is injected into pages as part of the content script.

// Pattern to match cashu tokens (V3: cashuA..., V4: cashuB...)
const CASHU_TOKEN_REGEX = /\b(cashu[AB][A-Za-z0-9_\-=+/]{20,})\b/g;

// Track tokens we've already found/notified about to avoid duplicates
const foundTokens = new Set<string>();

// Track if the toast is currently visible
let toastElement: HTMLElement | null = null;
let pendingTokens: Array<{ token: string; element: Element | null }> = [];

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
    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'NUTPAY-TOAST'].includes(el.tagName)) return results;
    // Skip hidden elements
    if ((el as HTMLElement).hidden) return results;

    for (const child of el.childNodes) {
      results.push(...scanNode(child));
    }
  }

  return results;
}

// Create and show the claim toast notification
function showClaimToast(tokens: Array<{ token: string; element: Element | null }>): void {
  // Remove existing toast
  if (toastElement) {
    toastElement.remove();
    toastElement = null;
  }

  pendingTokens = tokens;
  const count = tokens.length;

  // Create a custom element to avoid style conflicts
  const toast = document.createElement('div');
  toast.id = 'nutpay-ecash-toast';
  toast.setAttribute('style', `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 2147483647;
    background: linear-gradient(135deg, #1a1a2e 0%, #252542 100%);
    color: #fff;
    border: 1px solid rgba(249, 115, 22, 0.4);
    border-radius: 12px;
    padding: 14px 18px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 360px;
    animation: nutpay-slide-in 0.3s ease-out;
    cursor: default;
  `);

  // Add animation keyframes
  if (!document.getElementById('nutpay-toast-styles')) {
    const style = document.createElement('style');
    style.id = 'nutpay-toast-styles';
    style.textContent = `
      @keyframes nutpay-slide-in {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      @keyframes nutpay-slide-out {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }

  toast.innerHTML = `
    <div style="flex-shrink: 0; width: 36px; height: 36px; background: rgba(249, 115, 22, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 12l4-8 4 8"/>
        <path d="M8 16h8"/>
      </svg>
    </div>
    <div style="flex: 1; min-width: 0;">
      <div style="font-weight: 600; margin-bottom: 2px;">Ecash found on page</div>
      <div style="font-size: 12px; color: #aaa;">${count} token${count > 1 ? 's' : ''} detected</div>
    </div>
    <button id="nutpay-claim-btn" style="
      flex-shrink: 0;
      background: linear-gradient(135deg, #f97316 0%, #ff6b00 100%);
      color: white;
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.15s;
    ">Claim</button>
    <button id="nutpay-dismiss-btn" style="
      flex-shrink: 0;
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      padding: 4px;
      font-size: 18px;
      line-height: 1;
    ">&times;</button>
  `;

  document.body.appendChild(toast);
  toastElement = toast;

  // Claim button
  const claimBtn = document.getElementById('nutpay-claim-btn');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => {
      claimAllTokens();
    });
    claimBtn.addEventListener('mouseenter', () => {
      claimBtn.style.transform = 'scale(1.05)';
    });
    claimBtn.addEventListener('mouseleave', () => {
      claimBtn.style.transform = 'scale(1)';
    });
  }

  // Dismiss button
  const dismissBtn = document.getElementById('nutpay-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      dismissToast();
    });
  }

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (toastElement === toast) {
      dismissToast();
    }
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
    claimBtn.textContent = 'Claiming...';
    claimBtn.style.opacity = '0.7';
    (claimBtn as HTMLButtonElement).disabled = true;
  }
}

// Update toast to show success
function showClaimSuccess(amount: number): void {
  if (!toastElement) return;
  toastElement.style.borderColor = 'rgba(34, 197, 94, 0.4)';
  const content = toastElement.querySelector('div[style*="flex: 1"]');
  if (content) {
    content.innerHTML = `
      <div style="font-weight: 600; color: #22c55e; margin-bottom: 2px;">Tokens claimed!</div>
      <div style="font-size: 12px; color: #aaa;">Received ${amount} sats</div>
    `;
  }
  const claimBtn = document.getElementById('nutpay-claim-btn');
  if (claimBtn) claimBtn.remove();

  // Auto-dismiss after success
  setTimeout(() => dismissToast(), 4000);
}

// Update toast to show error
function showClaimError(error: string): void {
  if (!toastElement) return;
  toastElement.style.borderColor = 'rgba(239, 68, 68, 0.4)';
  const claimBtn = document.getElementById('nutpay-claim-btn');
  if (claimBtn) {
    claimBtn.textContent = 'Retry';
    claimBtn.style.opacity = '1';
    claimBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
    (claimBtn as HTMLButtonElement).disabled = false;
  }
  const content = toastElement.querySelector('div[style*="flex: 1"]');
  if (content) {
    content.innerHTML = `
      <div style="font-weight: 600; color: #ef4444; margin-bottom: 2px;">Claim failed</div>
      <div style="font-size: 12px; color: #aaa;">${error}</div>
    `;
  }
}

// Claim all found tokens via the background service worker
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
        // Token might already be spent or invalid - not a hard error
        console.log('[Nutpay] Token claim failed:', response?.error);
      }
    } catch (error) {
      console.error('[Nutpay] Failed to claim token:', error);
      anyFailed = true;
    }
  }

  if (totalAmount > 0) {
    showClaimSuccess(totalAmount);
  } else if (anyFailed) {
    showClaimError('Communication error');
  } else {
    showClaimError('Tokens already spent or invalid');
  }
}

// Run initial scan after DOM is loaded
function runInitialScan(): void {
  const tokens = scanNode(document.body);
  if (tokens.length > 0) {
    console.log(`[Nutpay] Found ${tokens.length} ecash token(s) on page`);
    showClaimToast(tokens);
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
      // If toast is already showing, update it; otherwise show new one
      pendingTokens.push(...newTokens);
      showClaimToast(pendingTokens);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// Initialize scanner
export function initEcashScanner(): void {
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
