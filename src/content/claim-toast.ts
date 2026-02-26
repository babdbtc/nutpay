// Claim Toast — handles all DOM construction, rendering, and timer management
// for the in-page ecash claim notification. Separated from scanning/claim logic.

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ToastToken {
  token: string;
  amount: number | null;
  element: Element | null;
}

export interface ToastColors {
  bg: string;
  card: string;
  accent: string;
}

export interface ClaimToastCallbacks {
  onClaimSingle: (index: number) => void;
  onClaimAll: () => void;
}

// ─── State ───────────────────────────────────────────────────────────────────

let toastElement: HTMLElement | null = null;

// Centralized timer tracking — all timers are registered here and cleaned up on dismiss
const activeTimers = new Set<ReturnType<typeof setTimeout>>();
let unlockPollInterval: ReturnType<typeof setInterval> | null = null;

/** Register a tracked setTimeout that auto-removes itself when it fires. */
export function toastTimeout(fn: () => void, ms: number): ReturnType<typeof setTimeout> {
  const id = setTimeout(() => {
    activeTimers.delete(id);
    fn();
  }, ms);
  activeTimers.add(id);
  return id;
}

/** Cancel a previously registered toast timer. */
export function cancelToastTimeout(id: ReturnType<typeof setTimeout>): void {
  clearTimeout(id);
  activeTimers.delete(id);
}

/** Set the unlock poll interval (only one can be active). */
export function setUnlockPoll(fn: () => void, ms: number): void {
  clearUnlockPoll();
  unlockPollInterval = setInterval(fn, ms);
}

/** Clear the unlock poll interval if active. */
export function clearUnlockPoll(): void {
  if (unlockPollInterval) {
    clearInterval(unlockPollInterval);
    unlockPollInterval = null;
  }
}

/** Whether an unlock poll is currently running. */
export function isUnlockPolling(): boolean {
  return unlockPollInterval !== null;
}

/** Cancel ALL timers (auto-dismiss, post-claim, give-up, unlock poll). */
function clearAllTimers(): void {
  for (const id of activeTimers) {
    clearTimeout(id);
  }
  activeTimers.clear();
  clearUnlockPoll();
}

/** Whether a toast is currently visible. */
export function isToastVisible(): boolean {
  return toastElement !== null;
}

/** Get the current toast element (for querySelector calls from outside). */
export function getToastElement(): HTMLElement | null {
  return toastElement;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateToken(token: string): string {
  if (token.length <= 16) return token;
  return token.slice(0, 10) + '...' + token.slice(-6);
}

function btnTextColor(accent: string): string {
  return accent === '#ffffff' || accent === '#4ade80' ? '#000000' : '#ffffff';
}

// ─── Dismiss ─────────────────────────────────────────────────────────────────

/** Dismiss the toast with slide-out animation and clean up all timers. */
export function dismissToast(): void {
  clearAllTimers();

  if (toastElement) {
    toastElement.style.animation = 'nutpay-slide-out 0.2s ease-in forwards';
    const el = toastElement;
    // Don't track this one — it's the final removal, not cancellable
    setTimeout(() => {
      el.remove();
      if (toastElement === el) toastElement = null;
    }, 200);
  }
}

// ─── Manual Claim Toast ──────────────────────────────────────────────────────

/** Create and show the main claim toast with individual token rows. */
export function showClaimToast(
  tokens: ToastToken[],
  colors: ToastColors,
  callbacks: ClaimToastCallbacks,
): void {
  // Remove existing toast (also clears all timers)
  if (toastElement) {
    toastElement.remove();
    toastElement = null;
  }
  clearAllTimers();

  const count = tokens.length;
  const totalAmount = tokens.reduce((sum, t) => sum + (t.amount ?? 0), 0);

  ensureToastStyles();

  const { card, accent } = colors;
  const textColor = btnTextColor(accent);

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
    flex-direction: column;
    gap: 8px;
    max-width: 340px;
    min-width: 280px;
    animation: nutpay-slide-in 0.25s ease-out;
  `);

  // --- Header row: title + dismiss ---
  const headerHtml = `
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <div>
        <div style="font-weight: 600; font-size: 13px;">Ecash found</div>
        <div style="font-size: 11px; color: #888;">${count} token${count > 1 ? 's' : ''} on this page${totalAmount > 0 ? ` \u00b7 ${totalAmount} sats total` : ''}</div>
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
    </div>
  `;

  // --- Claim All button (shown when multiple tokens) ---
  const claimAllHtml = count > 1 ? `
    <button id="nutpay-claim-all-btn" style="
      width: 100%;
      background: ${accent};
      color: ${textColor};
      border: none;
      border-radius: 6px;
      padding: 6px 12px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
    ">Claim All${totalAmount > 0 ? ` (${totalAmount} sats)` : ''}</button>
  ` : '';

  // --- Individual token rows ---
  const tokenRowsHtml = tokens.map((t, i) => {
    const amountLabel = t.amount !== null ? `${t.amount} sats` : 'unknown';
    return `
      <div id="nutpay-token-row-${i}" style="
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 4px 0;
        ${i < count - 1 ? `border-bottom: 1px solid rgba(255, 255, 255, 0.05);` : ''}
      ">
        <div style="flex: 1; min-width: 0;">
          <span style="font-size: 12px; font-weight: 500; color: #ccc;">${amountLabel}</span>
          <span style="font-size: 10px; color: #555; margin-left: 6px;">${truncateToken(t.token)}</span>
        </div>
        <button class="nutpay-claim-single-btn" data-index="${i}" style="
          flex-shrink: 0;
          background: ${count > 1 ? 'rgba(255, 255, 255, 0.08)' : accent};
          color: ${count > 1 ? '#ccc' : textColor};
          border: ${count > 1 ? '1px solid rgba(255, 255, 255, 0.1)' : 'none'};
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
        ">Claim</button>
      </div>
    `;
  }).join('');

  toast.innerHTML = headerHtml + claimAllHtml + tokenRowsHtml;

  document.body.appendChild(toast);
  toastElement = toast;

  // --- Wire up event listeners ---

  const dismissBtn = document.getElementById('nutpay-dismiss-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => dismissToast());
  }

  const claimAllBtn = document.getElementById('nutpay-claim-all-btn');
  if (claimAllBtn) {
    claimAllBtn.addEventListener('click', () => callbacks.onClaimAll());
  }

  const singleBtns = toast.querySelectorAll('.nutpay-claim-single-btn');
  singleBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt((e.currentTarget as HTMLElement).getAttribute('data-index') || '0', 10);
      callbacks.onClaimSingle(index);
    });
  });

  // Auto-dismiss after 30 seconds
  toastTimeout(() => {
    if (toastElement === toast) dismissToast();
  }, 30000);
}

// ─── Auto-Claim Success Toast ────────────────────────────────────────────────

/** Show a minimal success toast after auto-claiming (no buttons). */
export function showAutoClaimSuccessToast(amount: number, colors: ToastColors): void {
  if (toastElement) {
    toastElement.remove();
    toastElement = null;
  }
  clearAllTimers();

  ensureToastStyles();

  const { card } = colors;

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

  toastTimeout(() => {
    if (toastElement === toast) dismissToast();
  }, 5000);
}

// ─── Row Updates ─────────────────────────────────────────────────────────────

/** Show "..." spinner on a single token row. */
export function showRowClaimingState(index: number): void {
  const btn = toastElement?.querySelector(`.nutpay-claim-single-btn[data-index="${index}"]`) as HTMLButtonElement | null;
  if (btn) {
    btn.textContent = '...';
    btn.style.opacity = '0.6';
    btn.disabled = true;
  }
}

/** Show success state on a single token row. */
export function showRowClaimSuccess(index: number, amount: number): void {
  const row = document.getElementById(`nutpay-token-row-${index}`);
  if (!row) return;

  const btn = row.querySelector('.nutpay-claim-single-btn') as HTMLButtonElement | null;
  if (btn) btn.remove();

  const info = row.querySelector('div[style*="flex: 1"]');
  if (info) {
    info.innerHTML = `<span style="font-size: 12px; font-weight: 500; color: #22c55e;">Claimed ${amount} sats</span>`;
  }
}

/** Show failure state on a single token row. */
export function showRowFailed(index: number): void {
  const row = document.getElementById(`nutpay-token-row-${index}`);
  if (!row) return;

  const btn = row.querySelector('.nutpay-claim-single-btn') as HTMLButtonElement | null;
  if (btn) btn.remove();

  const info = row.querySelector('div[style*="flex: 1"]');
  if (info) {
    info.innerHTML = `<span style="font-size: 12px; font-weight: 500; color: #ef4444;">Invalid or already spent</span>`;
  }
}

// ─── Claim All Button Updates ────────────────────────────────────────────────

/** Disable and show spinner on the Claim All button and all individual buttons. */
export function disableAllButtons(): void {
  const claimAllBtn = document.getElementById('nutpay-claim-all-btn') as HTMLButtonElement | null;
  if (claimAllBtn) {
    claimAllBtn.textContent = '...';
    claimAllBtn.style.opacity = '0.6';
    claimAllBtn.disabled = true;
  }

  const singleBtns = toastElement?.querySelectorAll('.nutpay-claim-single-btn') as NodeListOf<HTMLButtonElement>;
  singleBtns?.forEach((btn) => {
    btn.textContent = '...';
    btn.style.opacity = '0.6';
    btn.disabled = true;
  });
}

/** Show final success/failure state on the Claim All button. */
export function showClaimAllResult(totalAmount: number): void {
  const claimAllBtn = document.getElementById('nutpay-claim-all-btn') as HTMLButtonElement | null;
  if (!claimAllBtn) return;

  if (totalAmount > 0) {
    claimAllBtn.textContent = `Claimed ${totalAmount} sats`;
    claimAllBtn.style.opacity = '1';
    claimAllBtn.style.background = 'rgba(34, 197, 94, 0.15)';
    claimAllBtn.style.color = '#22c55e';
    claimAllBtn.style.border = '1px solid rgba(34, 197, 94, 0.3)';
  } else {
    claimAllBtn.textContent = 'All invalid or spent';
    claimAllBtn.style.opacity = '1';
    claimAllBtn.style.background = 'rgba(239, 68, 68, 0.15)';
    claimAllBtn.style.color = '#ef4444';
    claimAllBtn.style.border = '1px solid rgba(239, 68, 68, 0.3)';
  }
}

/** Update the Claim All button text after a token is removed, or remove it if <=1 remain. */
export function updateClaimAllAfterDone(remainingTokens: ToastToken[]): void {
  const claimAllBtn = document.getElementById('nutpay-claim-all-btn');
  if (!claimAllBtn) return;

  if (remainingTokens.length <= 1) {
    claimAllBtn.remove();
  } else {
    const remainingAmount = remainingTokens.reduce((sum, t) => sum + (t.amount ?? 0), 0);
    claimAllBtn.textContent = `Claim All${remainingAmount > 0 ? ` (${remainingAmount} sats)` : ''}`;
  }
}

/** Remove the Claim All button entirely. */
export function removeClaimAllButton(): void {
  const claimAllBtn = document.getElementById('nutpay-claim-all-btn');
  if (claimAllBtn) claimAllBtn.remove();
}

// ─── Unlock Flow UI ──────────────────────────────────────────────────────────

/** Show "Waiting..." / "Unlock wallet to claim" state on all buttons. */
export function showUnlockWaitingState(pendingCount: number): void {
  for (let i = 0; i < pendingCount; i++) {
    const btn = toastElement?.querySelector(`.nutpay-claim-single-btn[data-index="${i}"]`) as HTMLButtonElement | null;
    if (btn) {
      btn.textContent = 'Waiting...';
      btn.style.opacity = '0.5';
      btn.style.cursor = 'default';
      btn.disabled = true;
    }
  }

  const claimAllBtn = document.getElementById('nutpay-claim-all-btn') as HTMLButtonElement | null;
  if (claimAllBtn) {
    claimAllBtn.textContent = 'Unlock wallet to claim';
    claimAllBtn.style.opacity = '1';
    claimAllBtn.style.background = 'rgba(255, 255, 255, 0.08)';
    claimAllBtn.style.color = '#888';
    claimAllBtn.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    claimAllBtn.disabled = true;
  }
}

/** Re-enable claim buttons (e.g. after unlock polling times out). */
export function restoreClaimButtons(pendingTokens: ToastToken[], colors: ToastColors): void {
  const { accent } = colors;
  const textColor = btnTextColor(accent);
  const count = pendingTokens.filter(t => t.token !== '').length;

  const singleBtns = toastElement?.querySelectorAll('.nutpay-claim-single-btn') as NodeListOf<HTMLButtonElement>;
  singleBtns?.forEach((btn) => {
    if (btn.disabled) {
      btn.textContent = 'Claim';
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.style.background = count > 1 ? 'rgba(255, 255, 255, 0.08)' : accent;
      btn.style.color = count > 1 ? '#ccc' : textColor;
      btn.disabled = false;
    }
  });

  const claimAllBtn = document.getElementById('nutpay-claim-all-btn') as HTMLButtonElement | null;
  if (claimAllBtn) {
    const remaining = pendingTokens.filter(t => t.token !== '');
    const remainingAmount = remaining.reduce((sum, t) => sum + (t.amount ?? 0), 0);
    claimAllBtn.textContent = `Claim All${remainingAmount > 0 ? ` (${remainingAmount} sats)` : ''}`;
    claimAllBtn.style.opacity = '1';
    claimAllBtn.style.background = accent;
    claimAllBtn.style.color = textColor;
    claimAllBtn.disabled = false;
  }
}
