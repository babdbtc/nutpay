import type { XCashuPaymentRequest, ApprovalResponseMessage } from '../shared/types';
import { APPROVAL_POPUP, TIMEOUTS } from '../shared/constants';

// Store approval callbacks
const approvalCallbacks = new Map<
  string,
  {
    resolve: (response: { approved: boolean; rememberSite: boolean }) => void;
    reject: (error: Error) => void;
    popupId?: number;
  }
>();

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
    mint: paymentRequest.mint,
    amount: paymentRequest.amount.toString(),
    unit: paymentRequest.unit,
    balance: currentBalance.toString(),
  });

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
): Promise<{ approved: boolean; rememberSite: boolean }> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      approvalCallbacks.delete(requestId);
      reject(new Error('Approval timeout'));

      // Close the popup if still open
      chrome.windows.remove(popupId).catch(() => {});
    }, TIMEOUTS.APPROVAL_POPUP);

    approvalCallbacks.set(requestId, {
      resolve: (response) => {
        clearTimeout(timeoutId);
        approvalCallbacks.delete(requestId);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timeoutId);
        approvalCallbacks.delete(requestId);
        reject(error);
      },
      popupId,
    });
  });
}

// Handle approval response from popup
export function handleApprovalResponse(message: ApprovalResponseMessage): void {
  const callback = approvalCallbacks.get(message.requestId);

  if (callback) {
    callback.resolve({
      approved: message.approved,
      rememberSite: message.rememberSite,
    });
  }
}

// Handle popup window closed without response
export function handlePopupClosed(windowId: number): void {
  for (const [requestId, callback] of approvalCallbacks) {
    if (callback.popupId === windowId) {
      callback.resolve({ approved: false, rememberSite: false });
      approvalCallbacks.delete(requestId);
      break;
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
      chrome.windows.remove(callback.popupId).catch(() => {});
    }
  }
}
