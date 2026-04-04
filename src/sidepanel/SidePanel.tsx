import { useState } from 'react';
import { Toaster } from 'sonner';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { useWalletData } from '../hooks/useWalletData';
import { usePageEcash } from '../hooks/usePageEcash';
import { WalletView } from '../components/shared/WalletView';
import { SpendingDashboard } from '../components/SpendingDashboard';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

  const refreshButton = (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleRefresh}
      className="text-muted-foreground hover:text-foreground"
      title="Refresh"
      aria-label="Refresh"
    >
      <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
    </Button>
  );

  if (auth.authState !== 'unlocked') {
    return (
      <ErrorBoundary>
        <WalletView
          {...auth}
          {...data}
          pageTokens={ecash.pageTokens}
          claimingPage={ecash.claimingPage}
          claimResult={ecash.claimResult}
          claimPageTokens={ecash.claimPageTokens}
          claimSingleToken={ecash.claimSingleToken}
          containerClass="sidepanel-container"
          headerActions={refreshButton}
        />
        <Toaster theme="dark" position="bottom-center" />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Tabs defaultValue="wallet" className="sidepanel-container bg-background flex flex-col">
        <div className="px-4 pt-3 pb-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="wallet">Wallet</TabsTrigger>
            <TabsTrigger value="spending">Spending</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="wallet" className="flex-1 mt-0">
          <WalletView
            {...auth}
            {...data}
            pageTokens={ecash.pageTokens}
            claimingPage={ecash.claimingPage}
            claimResult={ecash.claimResult}
            claimPageTokens={ecash.claimPageTokens}
            claimSingleToken={ecash.claimSingleToken}
            containerClass=""
            headerActions={refreshButton}
          />
        </TabsContent>
        <TabsContent value="spending" className="flex-1 mt-0 p-4">
          <SpendingDashboard displayFormat={data.settings.displayFormat} />
        </TabsContent>
      </Tabs>
      <Toaster theme="dark" position="bottom-center" />
    </ErrorBoundary>
  );
}

export default SidePanel;
