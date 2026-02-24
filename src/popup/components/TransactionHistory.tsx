import { useState, useEffect } from 'react';
import type { Transaction } from '../../shared/types';
import { formatAmount, formatTransactionAmount } from '../../shared/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Copy, Check, ChevronDown, ChevronUp, Globe } from 'lucide-react';

interface DomainSpending {
  origin: string;
  hostname: string;
  totalSpent: number;
  transactionCount: number;
  lastPayment: number;
}

interface TransactionHistoryProps {
  displayFormat: 'symbol' | 'text';
  onBack: () => void;
}

interface Filters {
  type?: 'payment' | 'receive';
  status?: 'pending' | 'completed' | 'failed';
}

export function TransactionHistory({ displayFormat, onBack }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({});
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [domainSpending, setDomainSpending] = useState<DomainSpending[]>([]);
  const [showDomainSpending, setShowDomainSpending] = useState(false);

  const LIMIT = 20;

  useEffect(() => {
    loadTransactions(true);
    loadDomainSpending();
  }, [filters]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const loadTransactions = async (reset = false) => {
    setLoading(true);
    const newOffset = reset ? 0 : offset;

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'GET_FILTERED_TRANSACTIONS',
        filters,
        limit: LIMIT,
        offset: newOffset,
      });

      if (reset) {
        setTransactions(result.transactions || []);
        setOffset(LIMIT);
      } else {
        setTransactions([...transactions, ...(result.transactions || [])]);
        setOffset(newOffset + LIMIT);
      }
      setTotal(result.total || 0);
      setHasMore(result.hasMore || false);
    } catch (error) {
      console.error('Failed to load transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadDomainSpending = async () => {
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'GET_SPENDING_BY_DOMAIN',
      });
      setDomainSpending(result || []);
    } catch (error) {
      console.error('Failed to load domain spending:', error);
    }
  };

  const toggleFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => {
      if (prev[key] === value) {
        const { [key]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [key]: value };
    });
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  const formatFullTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getOriginHost = (origin?: string) => {
    if (!origin) return 'Unknown';
    try {
      return new URL(origin).hostname;
    } catch {
      return origin;
    }
  };

  const getMintHost = (mintUrl: string) => {
    try {
      return new URL(mintUrl).hostname;
    } catch {
      return mintUrl;
    }
  };

  const getStatusVariant = (status: Transaction['status']): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (status) {
      case 'pending':
        return 'outline';
      case 'completed':
        return 'default';
      case 'failed':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const copyToken = async (txId: string, token: string) => {
    await navigator.clipboard.writeText(token);
    setCopiedToken(txId);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const totalReceived = transactions
    .filter((tx) => tx.type === 'receive' && tx.status === 'completed')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalSent = transactions
    .filter((tx) => tx.type === 'payment' && tx.status === 'completed')
    .reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8" title="Back (Esc)">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold text-white flex-1">Transaction History</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={filters.type === 'receive' ? 'default' : 'secondary'}
          size="sm"
          className="h-7 text-xs rounded-full"
          onClick={() => toggleFilter('type', 'receive')}
        >
          Received
        </Button>
        <Button
          variant={filters.type === 'payment' ? 'default' : 'secondary'}
          size="sm"
          className="h-7 text-xs rounded-full"
          onClick={() => toggleFilter('type', 'payment')}
        >
          Sent
        </Button>
        <Button
          variant={filters.status === 'completed' ? 'default' : 'secondary'}
          size="sm"
          className="h-7 text-xs rounded-full"
          onClick={() => toggleFilter('status', 'completed')}
        >
          Completed
        </Button>
        <Button
          variant={filters.status === 'failed' ? 'default' : 'secondary'}
          size="sm"
          className="h-7 text-xs rounded-full"
          onClick={() => toggleFilter('status', 'failed')}
        >
          Failed
        </Button>
      </div>

      {/* Summary */}
      {transactions.length > 0 && (
        <Card className="bg-card border-0">
          <CardContent className="p-3 flex gap-4">
            <div className="flex-1 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">Total Received</p>
              <p className="text-sm font-semibold text-green-500">
                +{formatAmount(totalReceived, displayFormat)}
              </p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">Total Sent</p>
              <p className="text-sm font-semibold text-red-400">
                -{formatAmount(totalSent, displayFormat)}
              </p>
            </div>
            <div className="flex-1 text-center">
              <p className="text-[11px] text-muted-foreground mb-1">Transactions</p>
              <p className="text-sm font-semibold text-white">{total}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Spending by Site */}
      {domainSpending.length > 0 && (
        <Card className="bg-card border-0">
          <CardContent className="p-0">
            <button
              className="w-full flex items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
              onClick={() => setShowDomainSpending(!showDomainSpending)}
            >
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Spending by Site</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {domainSpending.length}
                </Badge>
              </div>
              {showDomainSpending ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>
            {showDomainSpending && (
              <div className="px-3 pb-3 space-y-1.5">
                {domainSpending.map((domain) => (
                  <div
                    key={domain.origin}
                    className="flex items-center justify-between py-1.5 px-2 bg-popover rounded"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium text-white truncate">
                        {domain.hostname}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {domain.transactionCount} payment{domain.transactionCount !== 1 ? 's' : ''} · last {formatTime(domain.lastPayment)}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-red-400 shrink-0 ml-2">
                      -{formatAmount(domain.totalSpent, displayFormat)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transaction List */}
      {transactions.length === 0 && !loading ? (
        <p className="text-center text-muted-foreground py-6 text-sm">
          {Object.keys(filters).length > 0
            ? 'No transactions match your filters'
            : 'No transactions yet'}
        </p>
      ) : (
        <ScrollArea className="h-[340px]">
          <div className="flex flex-col gap-2 pr-2">
            {transactions.map((tx) => (
              <Card
                key={tx.id}
                className="bg-card border-0 cursor-pointer hover:bg-muted transition-colors"
                onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
              >
                <CardContent className="p-3">
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium text-white">
                        {tx.type === 'payment' ? getOriginHost(tx.origin) : 'Received'}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(tx.timestamp)}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-sm font-semibold ${
                          tx.type === 'payment' ? 'text-red-400' : 'text-green-500'
                        }`}
                      >
                        {formatTransactionAmount(tx.amount, tx.type, displayFormat)}
                      </span>
                      <Badge
                        variant={getStatusVariant(tx.status)}
                        className={`text-[10px] px-1.5 py-0 h-4 uppercase ${
                          tx.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500/50'
                            : tx.status === 'completed'
                            ? 'bg-green-500/20 text-green-500'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {tx.status}
                      </Badge>
                    </div>
                  </div>

                  {expandedTx === tx.id && (
                    <div className="mt-2 pt-2 border-t border-[#333] space-y-2">
                      <div className="flex gap-3">
                        <span className="text-[11px] text-muted-foreground">
                          Mint: {getMintHost(tx.mintUrl)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatFullTime(tx.timestamp)}
                        </span>
                      </div>

                      {/* Show token for ecash sends */}
                      {tx.token && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] text-muted-foreground">
                            Ecash Token (for recovery):
                          </p>
                          <div className="bg-popover rounded p-2 text-[10px] text-muted-foreground break-all max-h-[60px] overflow-y-auto">
                            {tx.token}
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            className="h-6 text-xs w-full"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToken(tx.id, tx.token!);
                            }}
                          >
                            {copiedToken === tx.id ? (
                              <><Check className="h-3 w-3 mr-1" /> Copied!</>
                            ) : (
                              <><Copy className="h-3 w-3 mr-1" /> Copy Token</>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {hasMore && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadTransactions(false)}
                disabled={loading}
                className="mt-2"
              >
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export default TransactionHistory;
