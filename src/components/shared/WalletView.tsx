import { useState, useEffect } from 'react';
import type { MintBalance, Transaction, Settings, MintConfig } from '../../shared/types';
import { formatAmount, formatTransactionAmount, formatTime, getOriginHost } from '../../shared/format';
import { LightningReceive } from '../../popup/components/LightningReceive';
import { SendModal } from '../../popup/components/SendModal';
import { MintInfoModal } from '../../popup/components/MintInfoModal';
import { TransactionHistory } from '../../popup/components/TransactionHistory';
import { SecuritySetup } from '../../popup/components/SecuritySetup';
import { LockScreen } from '../../popup/components/LockScreen';
import { RecoveryScreen } from '../../popup/components/RecoveryScreen';
import { WelcomeScreen } from '../../popup/components/WelcomeScreen';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Settings as SettingsIcon, ArrowDownLeft, ArrowUpRight, Loader2, Lock, Check, X } from 'lucide-react';
import type { AuthState } from '../../hooks/useWalletAuth';
import type { PageToken } from '../../hooks/usePageEcash';

type View = 'main' | 'history';

export interface WalletViewProps {
  // Auth
  authState: AuthState;
  setAuthState: (state: AuthState) => void;
  authType: 'pin' | 'password';
  securityEnabled: boolean;
  handleLock: () => Promise<void>;
  /** Custom unlock handler (e.g. for pending 402 payment in popup) */
  onUnlock?: () => void;

  // Data
  balances: MintBalance[];
  transactions: Transaction[];
  settings: Settings;
  mints: MintConfig[];
  loading: boolean;
  totalBalance: number;
  loadData: () => Promise<void>;

  // Page ecash (optional)
  pageTokens?: PageToken[];
  claimingPage?: boolean;
  claimResult?: { success: boolean; amount?: number; error?: string } | null;
  claimPageTokens?: () => Promise<void>;
  claimSingleToken?: (index: number) => Promise<void>;

  // Layout
  /** CSS class name for the container (e.g. 'popup-container' or 'sidepanel-container') */
  containerClass: string;
  /** Header action buttons rendered between title and settings icon */
  headerActions?: React.ReactNode;
}

export function WalletView({
  authState,
  setAuthState,
  authType,
  securityEnabled,
  handleLock,
  onUnlock,
  balances,
  transactions,
  settings,
  mints,
  loading,
  totalBalance,
  loadData,
  pageTokens = [],
  claimingPage = false,
  claimResult,
  claimPageTokens,
  claimSingleToken,
  containerClass,
  headerActions,
}: WalletViewProps) {
  const [view, setView] = useState<View>('main');
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [selectedMintInfo, setSelectedMintInfo] = useState<{ url: string; name: string } | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [receiving, setReceiving] = useState(false);

  const handleReceive = async () => {
    if (!tokenInput.trim()) return;
    setReceiving(true);
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'ADD_PROOFS',
        token: tokenInput.trim(),
      });
      if (result.success) {
        setShowReceive(false);
        setTokenInput('');
        loadData();
      } else {
        alert(result.error || 'Failed to receive token');
      }
    } catch {
      alert('Failed to receive token');
    } finally {
      setReceiving(false);
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  // Keyboard shortcuts for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showReceive) { e.preventDefault(); setShowReceive(false); setTokenInput(''); }
        else if (showSend) { e.preventDefault(); setShowSend(false); }
        else if (selectedMintInfo) { e.preventDefault(); setSelectedMintInfo(null); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showReceive, showSend, selectedMintInfo]);

  // --- Auth screens ---

  if (authState === 'checking') {
    return (
      <div className={`${containerClass} flex items-center justify-center bg-background`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authState === 'welcome') {
    return (
      <WelcomeScreen
        onCreateNew={() => setAuthState('setup')}
        onImportExisting={() => setAuthState('import')}
      />
    );
  }

  if (authState === 'setup') {
    return (
      <div className={`${containerClass} bg-background`}>
        <SecuritySetup
          onComplete={() => setAuthState('unlocked')}
          onSkip={() => setAuthState('unlocked')}
        />
      </div>
    );
  }

  if (authState === 'import') {
    return (
      <RecoveryScreen
        onRecovered={() => setAuthState('unlocked')}
        onBack={() => setAuthState('welcome')}
      />
    );
  }

  if (authState === 'locked') {
    const handleUnlock = onUnlock ?? (() => setAuthState('unlocked'));
    return (
      <LockScreen
        authType={authType}
        onUnlock={handleUnlock}
        onForgot={() => setAuthState('recovery')}
      />
    );
  }

  if (authState === 'recovery') {
    return (
      <RecoveryScreen
        onRecovered={() => setAuthState('unlocked')}
        onBack={() => setAuthState('locked')}
      />
    );
  }

  // --- Loading ---

  if (loading) {
    return (
      <div className={`${containerClass} flex items-center justify-center bg-background`}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // --- Transaction History view ---

  if (view === 'history') {
    return (
      <div className={`${containerClass} bg-background p-4`}>
        <TransactionHistory
          displayFormat={settings.displayFormat}
          onBack={() => setView('main')}
        />
      </div>
    );
  }

  // --- Main wallet view ---

  return (
    <div className={`${containerClass} bg-background p-4 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-primary">Nutpay</h1>
        <div className="flex items-center gap-1">
          {headerActions}
          {securityEnabled && (
            <Button variant="ghost" size="icon" onClick={handleLock} className="text-muted-foreground hover:text-foreground" title="Lock wallet">
              <Lock className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={openOptions} className="text-muted-foreground hover:text-foreground" title="Settings">
            <SettingsIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Page Ecash Banner */}
      {pageTokens.length > 0 && claimPageTokens && (
        <div className="bg-card rounded-lg px-3 py-2 border border-primary/20">
          {/* Header with token count and Claim All button */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {pageTokens.length} ecash token{pageTokens.length > 1 ? 's' : ''} on this page
            </span>
            {pageTokens.filter(t => t.status === 'pending').length > 1 && (
              <Button
                size="sm"
                className="h-6 text-xs px-3"
                onClick={claimPageTokens}
                disabled={claimingPage}
              >
                {claimingPage ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Claim All'}
              </Button>
            )}
          </div>

          {/* Individual token list */}
          <div className="flex flex-col gap-1">
            {pageTokens.map((pt, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {pt.status === 'claimed' && <Check className="h-3 w-3 text-green-400 flex-shrink-0" />}
                  {pt.status === 'invalid' && <X className="h-3 w-3 text-red-400 flex-shrink-0" />}
                  <span className={`text-xs font-medium ${
                    pt.status === 'claimed' ? 'text-green-400' :
                    pt.status === 'invalid' ? 'text-red-400' :
                    'text-white'
                  }`}>
                    {pt.status === 'claimed'
                      ? `Claimed ${formatAmount(pt.claimedAmount || 0, settings.displayFormat)}`
                      : pt.status === 'invalid'
                        ? 'Invalid or spent'
                        : pt.amount !== null
                          ? formatAmount(pt.amount, settings.displayFormat)
                          : 'unknown amount'}
                  </span>
                  {pt.status === 'pending' && (
                    <span className="text-[10px] text-muted-foreground truncate">
                      {pt.token.slice(0, 8)}...{pt.token.slice(-4)}
                    </span>
                  )}
                </div>
                {pt.status === 'pending' && claimSingleToken && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-5 text-[10px] px-2 ml-2 flex-shrink-0"
                    onClick={() => claimSingleToken(i)}
                  >
                    Claim
                  </Button>
                )}
                {pt.status === 'claiming' && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-2 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Claim Result */}
      {claimResult && (
        <div className={`text-xs text-center py-1.5 rounded-lg ${claimResult.success ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
          {claimResult.success
            ? `Claimed ${formatAmount(claimResult.amount || 0, settings.displayFormat)}`
            : claimResult.error}
        </div>
      )}

      {/* Balance Card */}
      <Card className="bg-card border-0">
        <CardContent className="py-4 px-6 text-center">
          <p className="text-xs text-muted-foreground mb-1">Total Balance</p>
          <p className="text-3xl font-bold text-white">
            {formatAmount(totalBalance, settings.displayFormat)}
          </p>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          className="flex-1"
          onClick={() => setShowReceive(true)}
        >
          <ArrowDownLeft className="mr-2 h-4 w-4" />
          Receive
        </Button>
        <Button
          className="flex-1"
          variant={totalBalance > 0 ? 'default' : 'secondary'}
          onClick={() => setShowSend(true)}
          disabled={totalBalance === 0}
        >
          <ArrowUpRight className="mr-2 h-4 w-4" />
          Send
        </Button>
      </div>

      {/* Mints List */}
      {balances.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground mb-2">Mints</h2>
          <div className="flex flex-col gap-1.5">
            {balances.map((b) => (
              <Card
                key={b.mintUrl}
                className="bg-card border-0 cursor-pointer hover:bg-muted transition-colors"
                onClick={() => setSelectedMintInfo({ url: b.mintUrl, name: b.mintName })}
              >
                <CardContent className="py-2 px-3 flex justify-between items-center">
                  <span className="text-sm font-medium text-white">{b.mintName}</span>
                  <span className="text-sm text-primary font-medium">
                    {formatAmount(b.balance, settings.displayFormat)}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="flex-1 flex flex-col min-h-0">
        <h2 className="text-xs font-semibold text-muted-foreground mb-2">Recent Activity</h2>
        {transactions.length === 0 ? (
          <p className="text-center text-muted-foreground py-4 text-sm">No transactions yet</p>
        ) : (
          <>
            <ScrollArea className="flex-1 min-h-[120px]">
              <div className="flex flex-col gap-1.5">
                {transactions.map((tx) => (
                  <Card key={tx.id} className="bg-card border-0">
                    <CardContent className="py-2 px-3 flex justify-between items-center">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-white">
                          {tx.type === 'payment' ? getOriginHost(tx.origin) : 'Received'}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatTime(tx.timestamp)}</span>
                      </div>
                      <span className={`text-sm font-semibold ${tx.type === 'payment' ? 'text-red-400' : 'text-green-400'}`}>
                        {formatTransactionAmount(tx.amount, tx.type, settings.displayFormat)}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
            <button
              className="w-full text-center py-1.5 text-primary text-sm hover:underline"
              onClick={() => setView('history')}
            >
              View All Transactions
            </button>
          </>
        )}
      </div>

      {/* Receive Modal */}
      <Dialog open={showReceive} onOpenChange={setShowReceive}>
        <DialogContent className="bg-popover border-border max-w-[340px] max-h-[520px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Receive</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="ecash" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-card">
              <TabsTrigger value="ecash">Ecash</TabsTrigger>
              <TabsTrigger value="lightning">Lightning</TabsTrigger>
            </TabsList>
            <TabsContent value="ecash" className="mt-4">
              <Textarea
                placeholder="Paste Cashu token here..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="bg-card border-input min-h-[100px] text-white"
              />
              <div className="flex gap-3 mt-4">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => { setShowReceive(false); setTokenInput(''); }}
                >
                  Cancel
                  <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 h-5 border-muted-foreground/30">
                    Esc
                  </Badge>
                </Button>
                <Button
                  className="flex-1"
                  onClick={handleReceive}
                  disabled={receiving || !tokenInput.trim()}
                >
                  {receiving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Receive'}
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="lightning" className="mt-4">
              <LightningReceive
                mints={mints}
                displayFormat={settings.displayFormat}
                onSuccess={() => { setShowReceive(false); loadData(); }}
                onClose={() => setShowReceive(false)}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Send Modal */}
      <Dialog open={showSend} onOpenChange={setShowSend}>
        <DialogContent className="bg-popover border-border max-w-[340px] max-h-[520px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Send</DialogTitle>
          </DialogHeader>
          <SendModal
            mints={mints}
            balances={new Map(balances.map((b) => [b.mintUrl, b.balance]))}
            displayFormat={settings.displayFormat}
            onSuccess={() => { setShowSend(false); loadData(); }}
            onClose={() => setShowSend(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Mint Info Modal */}
      <Dialog open={!!selectedMintInfo} onOpenChange={() => setSelectedMintInfo(null)}>
        <DialogContent className="bg-popover border-border max-w-[340px] max-h-[520px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Mint Details</DialogTitle>
          </DialogHeader>
          {selectedMintInfo && (
            <MintInfoModal
              mintUrl={selectedMintInfo.url}
              mintName={selectedMintInfo.name}
              displayFormat={settings.displayFormat}
              onClose={() => setSelectedMintInfo(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
