import { useState, useEffect, useCallback, useRef } from 'react';

interface UsePageEcashOptions {
  /** Only scan when true */
  enabled: boolean;
  /** Callback to refresh wallet data after claiming */
  onClaimed?: () => void;
}

export interface PageToken {
  token: string;
  amount: number | null;
  status: 'pending' | 'claiming' | 'claimed' | 'invalid';
  claimedAmount?: number;
}

// Notify the content script on the active tab that tokens were claimed
async function notifyContentScript(): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'PAGE_TOKENS_CLAIMED' }).catch(() => {});
    }
  } catch {
    // Content script not available — ignore
  }
}

interface UsePageEcashReturn {
  pageTokens: PageToken[];
  claimingPage: boolean;
  claimResult: { success: boolean; amount?: number; error?: string } | null;
  claimPageTokens: () => Promise<void>;
  claimSingleToken: (index: number) => Promise<void>;
}

export function usePageEcash(options: UsePageEcashOptions): UsePageEcashReturn {
  const { enabled, onClaimed } = options;

  const [pageTokens, setPageTokens] = useState<PageToken[]>([]);
  const [claimingPage, setClaimingPage] = useState(false);
  const [claimResult, setClaimResult] = useState<{ success: boolean; amount?: number; error?: string } | null>(null);

  // Refs to avoid stale closures in callbacks
  const pageTokensRef = useRef(pageTokens);
  pageTokensRef.current = pageTokens;

  const onClaimedRef = useRef(onClaimed);
  onClaimedRef.current = onClaimed;

  useEffect(() => {
    if (!enabled) return;
    checkPageEcash();
  }, [enabled]);

  // Listen for PAGE_TOKENS_CLAIMED from the content script (tokens claimed via in-page toast)
  useEffect(() => {
    if (!enabled) return;

    const listener = (message: { type: string }) => {
      if (message.type === 'PAGE_TOKENS_CLAIMED') {
        // Clear all tokens — they were already claimed from the other UI
        setPageTokens([]);
        setClaimResult(null);
        onClaimedRef.current?.();
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [enabled]);

  // Auto-clear the banner once all tokens have been processed
  useEffect(() => {
    if (pageTokens.length === 0) return;
    const allDone = pageTokens.every(t => t.status === 'claimed' || t.status === 'invalid');
    if (!allDone) return;
    const timer = setTimeout(() => setPageTokens([]), 2000);
    return () => clearTimeout(timer);
  }, [pageTokens]);

  const checkPageEcash = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_ECASH' });
        if (response?.tokens?.length > 0) {
          setPageTokens(
            response.tokens.map((t: { token: string; amount: number | null }) => ({
              token: t.token,
              amount: t.amount,
              status: 'pending' as const,
            }))
          );
        }
      }
    } catch {
      // Content script not available on this tab - ignore
    }
  };

  const claimSingleToken = useCallback(async (index: number) => {
    setPageTokens(prev => {
      const updated = [...prev];
      if (updated[index]) updated[index] = { ...updated[index], status: 'claiming' };
      return updated;
    });

    try {
      const token = pageTokensRef.current[index]?.token;
      if (!token) return;

      const result = await chrome.runtime.sendMessage({ type: 'ADD_PROOFS', token });
      if (result?.success) {
        setPageTokens(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], status: 'claimed', claimedAmount: result.amount || 0 };
          return updated;
        });
        onClaimedRef.current?.();
        notifyContentScript();
      } else {
        setPageTokens(prev => {
          const updated = [...prev];
          updated[index] = { ...updated[index], status: 'invalid' };
          return updated;
        });
      }
    } catch {
      setPageTokens(prev => {
        const updated = [...prev];
        updated[index] = { ...updated[index], status: 'invalid' };
        return updated;
      });
    }
  }, []); // No deps — reads from refs

  const claimPageTokens = useCallback(async () => {
    const tokens = pageTokensRef.current;
    setClaimingPage(true);
    setClaimResult(null);
    let totalAmount = 0;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].status !== 'pending') continue;

      setPageTokens(prev => {
        const updated = [...prev];
        updated[i] = { ...updated[i], status: 'claiming' };
        return updated;
      });

      try {
        const result = await chrome.runtime.sendMessage({ type: 'ADD_PROOFS', token: tokens[i].token });
        if (result?.success) {
          totalAmount += result.amount || 0;
          setPageTokens(prev => {
            const updated = [...prev];
            updated[i] = { ...updated[i], status: 'claimed', claimedAmount: result.amount || 0 };
            return updated;
          });
        } else {
          setPageTokens(prev => {
            const updated = [...prev];
            updated[i] = { ...updated[i], status: 'invalid' };
            return updated;
          });
        }
      } catch {
        setPageTokens(prev => {
          const updated = [...prev];
          updated[i] = { ...updated[i], status: 'invalid' };
          return updated;
        });
      }
    }

    if (totalAmount > 0) {
      setClaimResult({ success: true, amount: totalAmount });
      onClaimedRef.current?.();
    } else {
      setClaimResult({ success: false, error: 'Already spent or invalid' });
    }
    setClaimingPage(false);
    notifyContentScript();

    // Clear result after a few seconds
    setTimeout(() => setClaimResult(null), 4000);
  }, []); // No deps — reads from refs

  return {
    pageTokens,
    claimingPage,
    claimResult,
    claimPageTokens,
    claimSingleToken,
  };
}
