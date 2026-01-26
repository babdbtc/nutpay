import { useState, useEffect } from 'react';
import type { MintBalance, Transaction, Settings, MintConfig } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { formatAmount, formatTransactionAmount } from '../shared/format';
import { LightningReceive } from './components/LightningReceive';
import { SendModal } from './components/SendModal';
import { MintInfoModal } from './components/MintInfoModal';
import { TransactionHistory } from './components/TransactionHistory';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Settings as SettingsIcon, ArrowDownLeft, ArrowUpRight, Loader2 } from 'lucide-react';

type View = 'main' | 'history';

function Popup() {
  const [view, setView] = useState<View>('main');
  const [balances, setBalances] = useState<MintBalance[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [mints, setMints] = useState<MintConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReceive, setShowReceive] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [selectedMintInfo, setSelectedMintInfo] = useState<{ url: string; name: string } | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [receiving, setReceiving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [balanceData, txData, settingsData, mintsData] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_BALANCE' }),
        chrome.runtime.sendMessage({ type: 'GET_TRANSACTIONS', limit: 5 }),
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
        chrome.runtime.sendMessage({ type: 'GET_MINTS' }),
      ]);
      setBalances(balanceData || []);
      setTransactions(txData || []);
      setSettings(settingsData || DEFAULT_SETTINGS);
      setMints(mintsData || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0);

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
    } catch (error) {
      alert('Failed to receive token');
    } finally {
      setReceiving(false);
    }
  };

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  const getOriginHost = (origin?: string) => {
    if (!origin) return 'Unknown';
    try {
      return new URL(origin).hostname;
    } catch {
      return origin;
    }
  };

  if (loading) {
    return (
      <div className="popup-container flex items-center justify-center bg-[#16162a]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Transaction History view
  if (view === 'history') {
    return (
      <div className="popup-container bg-[#16162a] p-4">
        <TransactionHistory
          displayFormat={settings.displayFormat}
          onBack={() => setView('main')}
        />
      </div>
    );
  }

  return (
    <div className="popup-container bg-[#16162a] p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-primary">Nutpay</h1>
        <Button variant="ghost" size="icon" onClick={openOptions} className="text-muted-foreground hover:text-foreground">
          <SettingsIcon className="h-5 w-5" />
        </Button>
      </div>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-[#252542] to-[#1e1e35] border-0">
        <CardContent className="p-6 text-center">
          <p className="text-sm text-muted-foreground mb-2">Total Balance</p>
          <p className="text-4xl font-bold text-white">
            {formatAmount(totalBalance, settings.displayFormat)}
          </p>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          className="flex-1 bg-green-500 hover:bg-green-600"
          onClick={() => setShowReceive(true)}
        >
          <ArrowDownLeft className="mr-2 h-4 w-4" />
          Receive
        </Button>
        <Button
          className="flex-1"
          variant={totalBalance > 0 ? "default" : "secondary"}
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
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Mints</h2>
          <div className="flex flex-col gap-2">
            {balances.map((b) => (
              <Card
                key={b.mintUrl}
                className="bg-[#252542] border-0 cursor-pointer hover:bg-[#303050] transition-colors"
                onClick={() => setSelectedMintInfo({ url: b.mintUrl, name: b.mintName })}
              >
                <CardContent className="p-3 flex justify-between items-center">
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
      <div className="flex-1">
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Recent Activity</h2>
        {transactions.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">No transactions yet</p>
        ) : (
          <>
            <ScrollArea className="h-[140px]">
              <div className="flex flex-col gap-2">
                {transactions.map((tx) => (
                  <Card key={tx.id} className="bg-[#252542] border-0">
                    <CardContent className="p-3 flex justify-between items-center">
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
              className="w-full text-center py-2 text-primary text-sm hover:underline mt-2"
              onClick={() => setView('history')}
            >
              View All Transactions →
            </button>
          </>
        )}
      </div>

      {/* Receive Modal */}
      <Dialog open={showReceive} onOpenChange={setShowReceive}>
        <DialogContent className="bg-[#1a1a2e] border-[#252542] max-w-[340px] max-h-[440px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Receive</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="ecash" className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-[#252542]">
              <TabsTrigger value="ecash">Ecash</TabsTrigger>
              <TabsTrigger value="lightning">Lightning</TabsTrigger>
            </TabsList>
            <TabsContent value="ecash" className="mt-4">
              <Textarea
                placeholder="Paste Cashu token here..."
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                className="bg-[#252542] border-[#374151] min-h-[100px] text-white"
              />
              <div className="flex gap-3 mt-4">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowReceive(false);
                    setTokenInput('');
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-green-500 hover:bg-green-600"
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
                onSuccess={() => {
                  setShowReceive(false);
                  loadData();
                }}
                onClose={() => setShowReceive(false)}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Send Modal */}
      <Dialog open={showSend} onOpenChange={setShowSend}>
        <DialogContent className="bg-[#1a1a2e] border-[#252542] max-w-[340px] max-h-[440px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Send</DialogTitle>
          </DialogHeader>
          <SendModal
            mints={mints}
            balances={new Map(balances.map((b) => [b.mintUrl, b.balance]))}
            displayFormat={settings.displayFormat}
            onSuccess={() => {
              setShowSend(false);
              loadData();
            }}
            onClose={() => setShowSend(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Mint Info Modal */}
      <Dialog open={!!selectedMintInfo} onOpenChange={() => setSelectedMintInfo(null)}>
        <DialogContent className="bg-[#1a1a2e] border-[#252542] max-w-[340px] max-h-[440px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">Mint Details</DialogTitle>
          </DialogHeader>
          {selectedMintInfo && (
            <MintInfoModal
              mintUrl={selectedMintInfo.url}
              mintName={selectedMintInfo.name}
              displayFormat={settings.displayFormat}
              onClose={() => setSelectedMintInfo(null)}
              onConsolidate={async () => {
                setSelectedMintInfo(null);
                loadData();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Popup;
