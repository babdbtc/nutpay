import { useState, useEffect } from 'react';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { useWalletData } from '../hooks/useWalletData';
import { usePageEcash } from '../hooks/usePageEcash';
import { WalletView } from '../components/shared/WalletView';
import { Button } from '@/components/ui/button';
import { PanelRightOpen } from 'lucide-react';

function Popup() {
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);

  const auth = useWalletAuth();
  const data = useWalletData({
    enabled: auth.authState === 'unlocked',
    txLimit: 5,
  });
  const ecash = usePageEcash({
    enabled: auth.authState === 'unlocked' && !data.loading,
    onClaimed: data.loadData,
  });

  // Check for pending payment from URL params (opened by 402 request when locked)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pendingPayment = params.get('pendingPayment');
    if (pendingPayment) {
      setPendingPaymentId(pendingPayment);
    }
  }, []);

  const openSidePanel = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && chrome.sidePanel) {
        await (chrome.sidePanel as unknown as { open: (opts: { tabId: number }) => Promise<void> }).open({ tabId: tab.id });
        window.close();
      }
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  };

  // Custom unlock handler for pending 402 payment
  const handleUnlock = pendingPaymentId
    ? async () => {
        await chrome.runtime.sendMessage({
          type: 'UNLOCK_COMPLETE',
          requestId: pendingPaymentId,
        });
        window.close();
      }
    : undefined;

  return (
    <WalletView
      {...auth}
      {...data}
      onUnlock={handleUnlock}
      pageTokens={ecash.pageTokens}
      claimingPage={ecash.claimingPage}
      claimResult={ecash.claimResult}
      claimPageTokens={ecash.claimPageTokens}
      claimSingleToken={ecash.claimSingleToken}
      containerClass="popup-container"
      headerActions={
        <Button
          variant="ghost"
          size="icon"
          onClick={openSidePanel}
          className="text-muted-foreground hover:text-foreground"
          title="Open in side panel"
        >
          <PanelRightOpen className="h-5 w-5" />
        </Button>
      }
    />
  );
}

export default Popup;
