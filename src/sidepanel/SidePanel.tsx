import { useState } from 'react';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { useWalletData } from '../hooks/useWalletData';
import { usePageEcash } from '../hooks/usePageEcash';
import { WalletView } from '../components/shared/WalletView';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

function SidePanel() {
  const [refreshing, setRefreshing] = useState(false);

  const auth = useWalletAuth();
  const data = useWalletData({
    enabled: auth.authState === 'unlocked',
    txLimit: 10,
    autoRefreshMs: 30000,
    listenForEvents: true,
  });
  const ecash = usePageEcash({
    enabled: auth.authState === 'unlocked' && !data.loading,
    onClaimed: data.loadData,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await data.loadData();
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <WalletView
      {...auth}
      {...data}
      pageTokens={ecash.pageTokens}
      claimingPage={ecash.claimingPage}
      claimResult={ecash.claimResult}
      claimPageTokens={ecash.claimPageTokens}
      claimSingleToken={ecash.claimSingleToken}
      containerClass="sidepanel-container"
      headerActions={
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          className="text-muted-foreground hover:text-foreground"
          title="Refresh"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      }
    />
  );
}

export default SidePanel;
