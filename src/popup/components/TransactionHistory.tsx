import React, { useState, useEffect } from 'react';
import type { Transaction } from '../../shared/types';
import { formatAmount, formatTransactionAmount } from '../../shared/format';

interface TransactionHistoryProps {
  displayFormat: 'symbol' | 'text';
  onBack: () => void;
}

interface Filters {
  type?: 'payment' | 'receive';
  status?: 'pending' | 'completed' | 'failed';
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '4px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
    flex: 1,
  },
  filters: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  filterBtn: {
    padding: '6px 12px',
    borderRadius: '16px',
    border: 'none',
    fontSize: '12px',
    cursor: 'pointer',
    background: '#252542',
    color: '#888',
    transition: 'all 0.2s',
  },
  filterBtnActive: {
    background: '#f7931a',
    color: '#fff',
  },
  txList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  txItem: {
    background: '#252542',
    borderRadius: '8px',
    padding: '12px',
  },
  txHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '6px',
  },
  txInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  txOrigin: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
  },
  txTime: {
    fontSize: '12px',
    color: '#666',
  },
  txAmount: {
    fontSize: '14px',
    fontWeight: 600,
  },
  txPayment: {
    color: '#ef4444',
  },
  txReceive: {
    color: '#22c55e',
  },
  txDetails: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #333',
  },
  txDetail: {
    fontSize: '11px',
    color: '#666',
  },
  statusBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
    fontWeight: 500,
  },
  statusPending: {
    background: '#f59e0b22',
    color: '#f59e0b',
  },
  statusCompleted: {
    background: '#22c55e22',
    color: '#22c55e',
  },
  statusFailed: {
    background: '#ef444422',
    color: '#ef4444',
  },
  empty: {
    textAlign: 'center',
    color: '#666',
    padding: '24px',
    fontSize: '14px',
  },
  loadMore: {
    padding: '10px',
    background: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: '#ccc',
    fontSize: '13px',
    cursor: 'pointer',
    textAlign: 'center',
  },
  summary: {
    display: 'flex',
    gap: '16px',
    padding: '12px',
    background: '#252542',
    borderRadius: '8px',
  },
  summaryItem: {
    flex: 1,
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: '11px',
    color: '#666',
    marginBottom: '4px',
  },
  summaryValue: {
    fontSize: '14px',
    fontWeight: 600,
  },
};

export function TransactionHistory({ displayFormat, onBack }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({});
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const LIMIT = 20;

  useEffect(() => {
    loadTransactions(true);
  }, [filters]);

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

  const getStatusStyle = (status: Transaction['status']) => {
    switch (status) {
      case 'pending':
        return styles.statusPending;
      case 'completed':
        return styles.statusCompleted;
      case 'failed':
        return styles.statusFailed;
      default:
        return {};
    }
  };

  // Calculate summary
  const totalReceived = transactions
    .filter((tx) => tx.type === 'receive' && tx.status === 'completed')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalSent = transactions
    .filter((tx) => tx.type === 'payment' && tx.status === 'completed')
    .reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>
          ←
        </button>
        <span style={styles.title}>Transaction History</span>
      </div>

      <div style={styles.filters}>
        <button
          style={{
            ...styles.filterBtn,
            ...(filters.type === 'receive' ? styles.filterBtnActive : {}),
          }}
          onClick={() => toggleFilter('type', 'receive')}
        >
          Received
        </button>
        <button
          style={{
            ...styles.filterBtn,
            ...(filters.type === 'payment' ? styles.filterBtnActive : {}),
          }}
          onClick={() => toggleFilter('type', 'payment')}
        >
          Sent
        </button>
        <button
          style={{
            ...styles.filterBtn,
            ...(filters.status === 'completed' ? styles.filterBtnActive : {}),
          }}
          onClick={() => toggleFilter('status', 'completed')}
        >
          Completed
        </button>
        <button
          style={{
            ...styles.filterBtn,
            ...(filters.status === 'failed' ? styles.filterBtnActive : {}),
          }}
          onClick={() => toggleFilter('status', 'failed')}
        >
          Failed
        </button>
      </div>

      {transactions.length > 0 && (
        <div style={styles.summary}>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Total Received</div>
            <div style={{ ...styles.summaryValue, color: '#22c55e' }}>
              +{formatAmount(totalReceived, displayFormat)}
            </div>
          </div>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Total Sent</div>
            <div style={{ ...styles.summaryValue, color: '#ef4444' }}>
              -{formatAmount(totalSent, displayFormat)}
            </div>
          </div>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Transactions</div>
            <div style={{ ...styles.summaryValue, color: '#fff' }}>{total}</div>
          </div>
        </div>
      )}

      {transactions.length === 0 && !loading ? (
        <div style={styles.empty}>
          {Object.keys(filters).length > 0
            ? 'No transactions match your filters'
            : 'No transactions yet'}
        </div>
      ) : (
        <div style={styles.txList}>
          {transactions.map((tx) => (
            <div
              key={tx.id}
              style={styles.txItem}
              onClick={() => setExpandedTx(expandedTx === tx.id ? null : tx.id)}
            >
              <div style={styles.txHeader}>
                <div style={styles.txInfo}>
                  <span style={styles.txOrigin}>
                    {tx.type === 'payment'
                      ? getOriginHost(tx.origin)
                      : 'Received'}
                  </span>
                  <span style={styles.txTime}>{formatTime(tx.timestamp)}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                  <span
                    style={{
                      ...styles.txAmount,
                      ...(tx.type === 'payment' ? styles.txPayment : styles.txReceive),
                    }}
                  >
                    {formatTransactionAmount(tx.amount, tx.type, displayFormat)}
                  </span>
                  <span style={{ ...styles.statusBadge, ...getStatusStyle(tx.status) }}>
                    {tx.status}
                  </span>
                </div>
              </div>

              {expandedTx === tx.id && (
                <div style={styles.txDetails}>
                  <span style={styles.txDetail}>
                    Mint: {getMintHost(tx.mintUrl)}
                  </span>
                  <span style={styles.txDetail}>
                    {formatFullTime(tx.timestamp)}
                  </span>
                </div>
              )}
            </div>
          ))}

          {hasMore && (
            <button
              style={styles.loadMore}
              onClick={() => loadTransactions(false)}
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Load More'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default TransactionHistory;
