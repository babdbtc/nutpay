import React, { useState, useEffect } from 'react';
import type { MintBalance, Transaction, Settings, MintConfig } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { formatAmount, formatTransactionAmount } from '../shared/format';
import { LightningReceive } from './components/LightningReceive';
import { SendModal } from './components/SendModal';
import { MintInfoModal } from './components/MintInfoModal';
import { TransactionHistory } from './components/TransactionHistory';

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  logo: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#f7931a',
  },
  settingsBtn: {
    background: 'none',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '18px',
    padding: '4px',
  },
  balanceCard: {
    background: 'linear-gradient(135deg, #252542 0%, #1e1e35 100%)',
    borderRadius: '16px',
    padding: '24px',
    textAlign: 'center',
  },
  balanceLabel: {
    fontSize: '13px',
    color: '#888',
    marginBottom: '8px',
  },
  balanceAmount: {
    fontSize: '36px',
    fontWeight: 700,
    color: '#fff',
  },
  balanceUnit: {
    fontSize: '16px',
    color: '#888',
    marginLeft: '4px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  actionBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  receiveBtn: {
    background: '#22c55e',
    color: 'white',
  },
  sendBtn: {
    background: '#374151',
    color: '#ccc',
  },
  section: {
    marginTop: '8px',
  },
  sectionTitle: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#888',
    marginBottom: '12px',
  },
  mintsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  mintItem: {
    background: '#252542',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  mintItemHover: {
    background: '#303050',
  },
  mintName: {
    fontSize: '14px',
    fontWeight: 500,
  },
  mintBalance: {
    fontSize: '14px',
    color: '#f7931a',
  },
  txList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  txItem: {
    background: '#252542',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  txOrigin: {
    fontSize: '14px',
    fontWeight: 500,
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
  empty: {
    textAlign: 'center',
    color: '#666',
    padding: '24px',
    fontSize: '14px',
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  },
  modalContent: {
    background: '#1a1a2e',
    borderRadius: '16px',
    padding: '20px',
    width: '100%',
    maxWidth: '320px',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '16px',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#252542',
    color: '#fff',
    fontSize: '14px',
    marginBottom: '12px',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
  },
  tabs: {
    display: 'flex',
    background: '#252542',
    borderRadius: '8px',
    padding: '4px',
    marginBottom: '16px',
  },
  tab: {
    flex: 1,
    padding: '10px',
    border: 'none',
    background: 'transparent',
    color: '#888',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    borderRadius: '6px',
    transition: 'all 0.2s',
  },
  activeTab: {
    background: '#374151',
    color: '#fff',
  },
  sendBtnEnabled: {
    background: '#f7931a',
    color: 'white',
    cursor: 'pointer',
  },
  viewAllLink: {
    textAlign: 'center',
    padding: '8px',
    color: '#f7931a',
    fontSize: '13px',
    cursor: 'pointer',
    marginTop: '8px',
  },
};

type ReceiveTab = 'ecash' | 'lightning';
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
  const [receiveTab, setReceiveTab] = useState<ReceiveTab>('ecash');
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
      <div style={styles.container}>
        <div style={styles.empty}>Loading...</div>
      </div>
    );
  }

  // Transaction History view
  if (view === 'history') {
    return (
      <div style={styles.container}>
        <TransactionHistory
          displayFormat={settings.displayFormat}
          onBack={() => setView('main')}
        />
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>Nutpay</div>
        <button style={styles.settingsBtn} onClick={openOptions}>
          ⚙️
        </button>
      </div>

      <div style={styles.balanceCard}>
        <div style={styles.balanceLabel}>Total Balance</div>
        <div>
          <span style={styles.balanceAmount}>
            {formatAmount(totalBalance, settings.displayFormat)}
          </span>
        </div>
      </div>

      <div style={styles.actions}>
        <button
          style={{ ...styles.actionBtn, ...styles.receiveBtn }}
          onClick={() => setShowReceive(true)}
        >
          Receive
        </button>
        <button
          style={{
            ...styles.actionBtn,
            ...(totalBalance > 0 ? styles.sendBtnEnabled : styles.sendBtn),
          }}
          onClick={() => setShowSend(true)}
          disabled={totalBalance === 0}
        >
          Send
        </button>
      </div>

      {balances.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Mints</div>
          <div style={styles.mintsList}>
            {balances.map((b) => (
              <div
                key={b.mintUrl}
                style={styles.mintItem}
                onClick={() => setSelectedMintInfo({ url: b.mintUrl, name: b.mintName })}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#303050';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#252542';
                }}
              >
                <span style={styles.mintName}>{b.mintName}</span>
                <span style={styles.mintBalance}>
                  {formatAmount(b.balance, settings.displayFormat)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Recent Activity</div>
        {transactions.length === 0 ? (
          <div style={styles.empty}>No transactions yet</div>
        ) : (
          <>
            <div style={styles.txList}>
              {transactions.map((tx) => (
                <div key={tx.id} style={styles.txItem}>
                  <div style={styles.txInfo}>
                    <span style={styles.txOrigin}>
                      {tx.type === 'payment'
                        ? getOriginHost(tx.origin)
                        : 'Received'}
                    </span>
                    <span style={styles.txTime}>{formatTime(tx.timestamp)}</span>
                  </div>
                  <span
                    style={{
                      ...styles.txAmount,
                      ...(tx.type === 'payment' ? styles.txPayment : styles.txReceive),
                    }}
                  >
                    {formatTransactionAmount(tx.amount, tx.type, settings.displayFormat)}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={styles.viewAllLink}
              onClick={() => setView('history')}
            >
              View All Transactions →
            </div>
          </>
        )}
      </div>

      {showReceive && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalTitle}>Receive</div>

            <div style={styles.tabs}>
              <button
                style={{ ...styles.tab, ...(receiveTab === 'ecash' ? styles.activeTab : {}) }}
                onClick={() => setReceiveTab('ecash')}
              >
                Ecash
              </button>
              <button
                style={{ ...styles.tab, ...(receiveTab === 'lightning' ? styles.activeTab : {}) }}
                onClick={() => setReceiveTab('lightning')}
              >
                Lightning
              </button>
            </div>

            {receiveTab === 'ecash' ? (
              <>
                <textarea
                  style={{ ...styles.input, minHeight: '80px', resize: 'vertical' }}
                  placeholder="Paste Cashu token here..."
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                />
                <div style={styles.modalActions}>
                  <button
                    style={{ ...styles.actionBtn, ...styles.sendBtn }}
                    onClick={() => {
                      setShowReceive(false);
                      setTokenInput('');
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    style={{ ...styles.actionBtn, ...styles.receiveBtn }}
                    onClick={handleReceive}
                    disabled={receiving || !tokenInput.trim()}
                  >
                    {receiving ? 'Receiving...' : 'Receive'}
                  </button>
                </div>
              </>
            ) : (
              <LightningReceive
                mints={mints}
                displayFormat={settings.displayFormat}
                onSuccess={() => {
                  setShowReceive(false);
                  loadData();
                }}
                onClose={() => setShowReceive(false)}
              />
            )}
          </div>
        </div>
      )}

      {showSend && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalTitle}>Send</div>
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
          </div>
        </div>
      )}

      {selectedMintInfo && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalTitle}>Mint Details</div>
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
          </div>
        </div>
      )}
    </div>
  );
}

export default Popup;
