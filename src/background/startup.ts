import { getSecurityConfig } from '../core/storage/security-store';
import { hasSessionKey } from '../core/storage/crypto-utils';
import { reconcileProofStates, recoverPendingProofs } from '../core/wallet/proof-manager';
import { recoverStuckPendingProofs } from '../core/wallet/cashu-wallet';
import { updateBadgeBalance } from './badge-manager';
import { setupContextMenus } from './context-menu';
import { ensureNoSecurityKey } from './security-handlers';

export async function runStartup(setPendingReconciliation: (val: boolean) => void): Promise<void> {
  const config = await getSecurityConfig();
  if (!config || !config.enabled) {
    await ensureNoSecurityKey();
  } else {
    if (!(await hasSessionKey())) {
      console.log('[Nutpay] Startup: wallet locked, skipping proof reconciliation');
      setPendingReconciliation(true);
      return;
    }
  }

  try {
    const recovered = await recoverPendingProofs();
    if (recovered > 0) {
      console.log(`[Nutpay] Startup: recovered ${recovered} pending proofs`);
    }
  } catch (error) {
    console.warn('[Nutpay] Startup: pending proof recovery failed:', error);
  }

  try {
    const removed = await reconcileProofStates();
    if (removed > 0) {
      console.log(`[Nutpay] Startup: reconciled ${removed} spent proofs`);
    }
  } catch (error) {
    console.warn('[Nutpay] Startup: proof reconciliation failed:', error);
  }

  try {
    const { recovered, removed } = await recoverStuckPendingProofs();
    if (recovered > 0 || removed > 0) {
      console.log(`[Nutpay] Startup: recovered ${recovered}, removed ${removed} stuck proofs`);
    }
  } catch (error) {
    console.warn('[Nutpay] Startup: stuck proof recovery failed:', error);
  }

  updateBadgeBalance();
}

export function setupPeriodicTasks(): void {
  setInterval(async () => {
    if (!(await hasSessionKey())) return;
    reconcileProofStates().catch((error) => {
      console.warn('[Nutpay] Proof reconciliation failed:', error);
    });
  }, 5 * 60 * 1000);
}

export function setupInstallHandler(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      console.log('[Nutpay] Extension installed');
      setupContextMenus();
      if (chrome.sidePanel) {
        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {
          // Intentionally silent — sidePanel API may not be available in all Chrome versions
        });
      }
    } else if (details.reason === 'update') {
      console.log('[Nutpay] Extension updated');
      setupContextMenus();
    }
  });
}
