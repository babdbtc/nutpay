import type { XCashuPaymentRequest, ApprovalResponseMessage } from '../shared/types';
import { APPROVAL_POPUP, TIMEOUTS } from '../shared/constants';

// Store approval callbacks
const approvalCallbacks = new Map<
  string,
  {
    resolve: (response: { approved: boolean; rememberSite: boolean; approveTab?: boolean }) => void;
    reject: (error: Error) => void;
    popupId?: number;
  }
>();

const windowIdToApprovalRequestId = new Map<number, string>();

// Store unlock callbacks for pending payments
const unlockCallbacks = new Map<
  string,
  {
    resolve: () => void;
    reject: (error: Error) => void;
    popupId?: number;
  }
>();

const windowIdToUnlockRequestId = new Map<number, string>();

// Open the approval popup window
export async function openApprovalPopup(
  requestId: string,
  origin: string,
  paymentRequest: XCashuPaymentRequest,
  currentBalance: number
): Promise<number> {
  const params = new URLSearchParams({
    requestId,
    origin,
    mints: JSON.stringify(paymentRequest.mints),
    amount: paymentRequest.amount.toString(),
    unit: paymentRequest.unit,
    balance: currentBalance.toString(),
  });

  // Include NUT-10 locking info if present
  if (paymentRequest.nut10) {
    params.set('nut10Kind', paymentRequest.nut10.kind);
    params.set('nut10Data', paymentRequest.nut10.data);
  }

  const popup = await chrome.windows.create({
    url: `approval.html?${params.toString()}`,
    type: 'popup',
    width: APPROVAL_POPUP.WIDTH,
    height: APPROVAL_POPUP.HEIGHT,
    focused: true,
  });

  return popup.id!;
}

// Wait for approval response
export function waitForApproval(
  requestId: string,
  popupId: number
): Promise<{ approved: boolean; rememberSite: boolean; approveTab?: boolean }> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      approvalCallbacks.delete(requestId);
      windowIdToApprovalRequestId.delete(popupId);
      reject(new Error('Approval timeout'));

      // Close the popup if still open
      chrome.windows.remove(popupId).catch(() => {
        // Intentionally silent — window may already be closed
      });
    }, TIMEOUTS.APPROVAL_POPUP);

    approvalCallbacks.set(requestId, {
      resolve: (response) => {
        clearTimeout(timeoutId);
        approvalCallbacks.delete(requestId);
        windowIdToApprovalRequestId.delete(popupId);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        approvalCallbacks.delete(requestId);
        windowIdToApprovalRequestId.delete(popupId);
        reject(error);
      },
      popupId,
    });
    windowIdToApprovalRequestId.set(popupId, requestId);
  });
}

// Handle approval response from popup
export function handleApprovalResponse(message: ApprovalResponseMessage): void {
  const callback = approvalCallbacks.get(message.requestId);

  if (callback) {
    callback.resolve({
      approved: message.approved,
      rememberSite: message.rememberSite,
      approveTab: message.approveTab,
    });
  }
}

// Handle popup window closed without response
export function handlePopupClosed(windowId: number): void {
  const requestId = windowIdToApprovalRequestId.get(windowId);
  if (requestId) {
    const callback = approvalCallbacks.get(requestId);
    if (callback) {
      callback.resolve({ approved: false, rememberSite: false });
    }
  }
}

// Cancel an approval request
export function cancelApproval(requestId: string): void {
  const callback = approvalCallbacks.get(requestId);

  if (callback) {
    callback.resolve({ approved: false, rememberSite: false });
    approvalCallbacks.delete(requestId);

    if (callback.popupId) {
      chrome.windows.remove(callback.popupId).catch(() => {
        // Intentionally silent — window may already be closed
      });
    }
  }
}

// Open the main popup for unlocking
export async function openUnlockPopup(requestId: string): Promise<number> {
  const params = new URLSearchParams({
    pendingPayment: requestId,
  });

  const popup = await chrome.windows.create({
    url: `popup.html?${params.toString()}`,
    type: 'popup',
    width: 380,
    height: 560,
    focused: true,
  });

  return popup.id!;
}

// Wait for wallet unlock
export function waitForUnlock(
  requestId: string,
  popupId: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      unlockCallbacks.delete(requestId);
      windowIdToUnlockRequestId.delete(popupId);
      reject(new Error('Unlock timeout'));

      // Close the popup if still open
      chrome.windows.remove(popupId).catch(() => {
        // Intentionally silent — window may already be closed
      });
    }, TIMEOUTS.APPROVAL_POPUP);

    unlockCallbacks.set(requestId, {
      resolve: () => {
        clearTimeout(timeoutId);
        unlockCallbacks.delete(requestId);
        windowIdToUnlockRequestId.delete(popupId);
        resolve();
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        unlockCallbacks.delete(requestId);
        windowIdToUnlockRequestId.delete(popupId);
        reject(error);
      },
      popupId,
    });
    windowIdToUnlockRequestId.set(popupId, requestId);
  });
}

// Handle unlock notification from popup
export function handleUnlockComplete(requestId: string): void {
  const callback = unlockCallbacks.get(requestId);
  if (callback) {
    callback.resolve();
  }
}

// Handle unlock popup closed without unlocking
export function handleUnlockPopupClosed(windowId: number): void {
  const requestId = windowIdToUnlockRequestId.get(windowId);
  if (requestId) {
    const callback = unlockCallbacks.get(requestId);
    if (callback) {
      callback.reject(new Error('Unlock cancelled'));
    }
  }
}
