import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  waitForApproval,
  handleApprovalResponse,
  handlePopupClosed,
  cancelApproval,
  waitForUnlock,
  handleUnlockComplete,
} from './payment-coordinator';
import type { ApprovalResponseMessage } from '../shared/types';

beforeEach(() => {
  (globalThis.chrome as Record<string, unknown>).windows = {
    create: vi.fn().mockResolvedValue({ id: 123 }),
    remove: vi.fn().mockResolvedValue(undefined),
  };
});

describe('waitForApproval + handleApprovalResponse', () => {
  it('resolves with approved=true when response arrives', async () => {
    const promise = waitForApproval('req-approve-1', 10);

    handleApprovalResponse({
      type: 'APPROVAL_RESPONSE',
      requestId: 'req-approve-1',
      approved: true,
      rememberSite: false,
    } as ApprovalResponseMessage);

    const result = await promise;
    expect(result.approved).toBe(true);
    expect(result.rememberSite).toBe(false);
  });

  it('resolves with rememberSite=true when user checks remember', async () => {
    const promise = waitForApproval('req-approve-2', 11);

    handleApprovalResponse({
      type: 'APPROVAL_RESPONSE',
      requestId: 'req-approve-2',
      approved: true,
      rememberSite: true,
    } as ApprovalResponseMessage);

    const result = await promise;
    expect(result.approved).toBe(true);
    expect(result.rememberSite).toBe(true);
  });
});

describe('waitForApproval + handlePopupClosed', () => {
  it('resolves as denied when the popup window is closed', async () => {
    const popupId = 42;
    const promise = waitForApproval('req-closed-1', popupId);

    handlePopupClosed(popupId);

    const result = await promise;
    expect(result.approved).toBe(false);
    expect(result.rememberSite).toBe(false);
  });

  it('does not affect other pending approvals when an unrelated window closes', async () => {
    const promise = waitForApproval('req-unrelated-1', 50);

    handlePopupClosed(99);

    handleApprovalResponse({
      type: 'APPROVAL_RESPONSE',
      requestId: 'req-unrelated-1',
      approved: true,
      rememberSite: false,
    } as ApprovalResponseMessage);

    const result = await promise;
    expect(result.approved).toBe(true);
  });
});

describe('cancelApproval', () => {
  it('resolves as denied when approval is cancelled', async () => {
    (globalThis.chrome.windows as { remove: ReturnType<typeof vi.fn> }).remove =
      vi.fn().mockResolvedValue(undefined);

    const promise = waitForApproval('req-cancel-1', 77);

    cancelApproval('req-cancel-1');

    const result = await promise;
    expect(result.approved).toBe(false);
  });

  it('is a no-op when the requestId does not exist', () => {
    expect(() => cancelApproval('req-nonexistent-xyz')).not.toThrow();
  });
});

describe('concurrent approvals', () => {
  it('only resolves the matching approval when one window closes', async () => {
    const promise1 = waitForApproval('req-conc-1', 100);
    const promise2 = waitForApproval('req-conc-2', 200);

    handlePopupClosed(100);

    const result1 = await promise1;
    expect(result1.approved).toBe(false);

    handleApprovalResponse({
      type: 'APPROVAL_RESPONSE',
      requestId: 'req-conc-2',
      approved: true,
      rememberSite: false,
    } as ApprovalResponseMessage);

    const result2 = await promise2;
    expect(result2.approved).toBe(true);
  });
});

describe('waitForUnlock + handleUnlockComplete', () => {
  it('resolves when unlock is completed', async () => {
    const promise = waitForUnlock('req-unlock-1', 300);

    handleUnlockComplete('req-unlock-1');

    await expect(promise).resolves.toBeUndefined();
  });

  it('does not affect unlock wait when a different requestId completes', async () => {
    const promise = waitForUnlock('req-unlock-2', 301);

    handleUnlockComplete('req-unlock-other');

    handleUnlockComplete('req-unlock-2');

    await expect(promise).resolves.toBeUndefined();
  });
});
