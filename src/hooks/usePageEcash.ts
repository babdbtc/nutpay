import { useState, useEffect } from 'react';

interface UsePageEcashOptions {
  /** Only scan when true */
  enabled: boolean;
  /** Callback to refresh wallet data after claiming */
  onClaimed?: () => void;
}

interface UsePageEcashReturn {
  pageTokens: Array<{ token: string }>;
  claimingPage: boolean;
  claimResult: { success: boolean; amount?: number; error?: string } | null;
  claimPageTokens: () => Promise<void>;
}

export function usePageEcash(options: UsePageEcashOptions): UsePageEcashReturn {
  const { enabled, onClaimed } = options;

  const [pageTokens, setPageTokens] = useState<Array<{ token: string }>>([]);
  const [claimingPage, setClaimingPage] = useState(false);
  const [claimResult, setClaimResult] = useState<{ success: boolean; amount?: number; error?: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    checkPageEcash();
  }, [enabled]);

  const checkPageEcash = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_ECASH' });
        if (response?.tokens?.length > 0) {
          setPageTokens(response.tokens);
        }
      }
    } catch {
      // Content script not available on this tab - ignore
    }
  };

  const claimPageTokens = async () => {
    setClaimingPage(true);
    setClaimResult(null);
    let totalAmount = 0;

    for (const { token } of pageTokens) {
      try {
        const result = await chrome.runtime.sendMessage({ type: 'ADD_PROOFS', token });
        if (result?.success) {
          totalAmount += result.amount || 0;
        }
      } catch {
        // ignore individual failures
      }
    }

    if (totalAmount > 0) {
      setClaimResult({ success: true, amount: totalAmount });
      setPageTokens([]);
      onClaimed?.();
    } else {
      setClaimResult({ success: false, error: 'Already spent or invalid' });
    }
    setClaimingPage(false);

    // Clear result after a few seconds
    setTimeout(() => setClaimResult(null), 4000);
  };

  return {
    pageTokens,
    claimingPage,
    claimResult,
    claimPageTokens,
  };
}
