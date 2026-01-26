import React, { useState } from 'react';
import type { MintConfig, MeltQuoteInfo } from '../../shared/types';
import { QRCode } from './QRCode';
import { formatAmount } from '../../shared/format';

interface SendModalProps {
  mints: MintConfig[];
  balances: Map<string, number>;
  displayFormat: 'symbol' | 'text';
  onSuccess: () => void;
  onClose: () => void;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  tabs: {
    display: 'flex',
    background: '#252542',
    borderRadius: '8px',
    padding: '4px',
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
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '12px',
    color: '#888',
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#252542',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#252542',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box',
    minHeight: '80px',
    resize: 'vertical',
  },
  select: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#252542',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
  },
  button: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  primaryBtn: {
    background: '#f7931a',
    color: 'white',
  },
  secondaryBtn: {
    background: '#374151',
    color: '#ccc',
  },
  dangerBtn: {
    background: '#ef4444',
    color: 'white',
  },
  disabledBtn: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  qrContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: '#252542',
    borderRadius: '12px',
  },
  tokenText: {
    fontSize: '10px',
    color: '#666',
    wordBreak: 'break-all',
    maxHeight: '80px',
    overflow: 'auto',
    padding: '8px',
    background: '#1a1a2e',
    borderRadius: '6px',
    width: '100%',
    boxSizing: 'border-box',
  },
  copyBtn: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    background: '#374151',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '8px',
    borderRadius: '8px',
    fontSize: '13px',
  },
  successStatus: {
    background: '#22c55e22',
    color: '#22c55e',
  },
  errorStatus: {
    background: '#ef444422',
    color: '#ef4444',
  },
  warningStatus: {
    background: '#f59e0b22',
    color: '#f59e0b',
  },
  quoteInfo: {
    background: '#252542',
    borderRadius: '8px',
    padding: '12px',
  },
  quoteRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #333',
  },
  quoteRowLast: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
  },
  quoteLabel: {
    color: '#888',
    fontSize: '13px',
  },
  quoteValue: {
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    marginTop: '4px',
    borderTop: '1px solid #444',
  },
  totalLabel: {
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
  },
  totalValue: {
    color: '#f7931a',
    fontSize: '14px',
    fontWeight: 600,
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  balanceHint: {
    fontSize: '11px',
    color: '#666',
    marginTop: '4px',
  },
};

type Tab = 'ecash' | 'lightning';

export function SendModal({ mints, balances, displayFormat, onSuccess, onClose }: SendModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>('ecash');
  const [amount, setAmount] = useState('');
  const [selectedMint, setSelectedMint] = useState(mints[0]?.url || '');
  const [invoice, setInvoice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [meltQuote, setMeltQuote] = useState<MeltQuoteInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState(false);

  const enabledMints = mints.filter((m) => m.enabled);
  const selectedBalance = balances.get(selectedMint) || 0;

  // Reset state when switching tabs
  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setError(null);
    setGeneratedToken(null);
    setMeltQuote(null);
    setSuccess(false);
  };

  // Send Ecash
  const handleGenerateToken = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    if (amountNum > selectedBalance) {
      setError(`Insufficient balance. You have ${selectedBalance} sats from this mint.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'GENERATE_SEND_TOKEN',
        mintUrl: selectedMint,
        amount: amountNum,
      });

      if (result.success && result.token) {
        setGeneratedToken(result.token);
      } else {
        setError(result.error || 'Failed to generate token');
      }
    } catch {
      setError('Failed to generate token');
    } finally {
      setLoading(false);
    }
  };

  // Get melt quote for Lightning
  const handleGetQuote = async () => {
    if (!invoice.trim()) {
      setError('Please enter a Lightning invoice');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'GET_MELT_QUOTE',
        mintUrl: selectedMint,
        invoice: invoice.trim(),
      });

      if (result.success && result.quote) {
        // Check if we have enough balance
        const total = result.quote.amount + result.quote.fee;
        if (total > selectedBalance) {
          setError(`Insufficient balance. Need ${total} sats (${result.quote.amount} + ${result.quote.fee} fee), have ${selectedBalance} sats.`);
        } else {
          setMeltQuote(result.quote);
        }
      } else {
        setError(result.error || 'Failed to get quote');
      }
    } catch {
      setError('Failed to get quote');
    } finally {
      setLoading(false);
    }
  };

  // Pay Lightning invoice
  const handlePayInvoice = async () => {
    if (!meltQuote) return;

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'MELT_PROOFS',
        mintUrl: selectedMint,
        invoice: invoice.trim(),
        quoteId: meltQuote.quote,
        amount: meltQuote.amount,
        feeReserve: meltQuote.fee,
      });

      if (result.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setError(result.error || 'Failed to pay invoice');
      }
    } catch {
      setError('Failed to pay invoice');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (generatedToken) {
      await navigator.clipboard.writeText(generatedToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDone = () => {
    onSuccess();
  };

  // Show generated token
  if (generatedToken) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.status, ...styles.successStatus }}>
          Token generated! Share it with the recipient.
        </div>

        <div style={styles.qrContainer}>
          <QRCode value={generatedToken} size={180} />
          <div style={styles.tokenText}>{generatedToken}</div>
          <button style={styles.copyBtn} onClick={copyToClipboard}>
            {copied ? 'Copied!' : 'Copy Token'}
          </button>
        </div>

        <button
          style={{ ...styles.button, ...styles.primaryBtn }}
          onClick={handleDone}
        >
          Done
        </button>
      </div>
    );
  }

  // Show success for Lightning
  if (success) {
    return (
      <div style={styles.container}>
        <div style={{ ...styles.status, ...styles.successStatus }}>
          Payment sent successfully!
        </div>
        <button
          style={{ ...styles.button, ...styles.primaryBtn }}
          onClick={handleDone}
        >
          Done
        </button>
      </div>
    );
  }

  // Show melt quote confirmation
  if (meltQuote) {
    return (
      <div style={styles.container}>
        <div style={styles.quoteInfo}>
          <div style={styles.quoteRow}>
            <span style={styles.quoteLabel}>Invoice Amount</span>
            <span style={styles.quoteValue}>{formatAmount(meltQuote.amount, displayFormat)}</span>
          </div>
          <div style={styles.quoteRow}>
            <span style={styles.quoteLabel}>Fee Reserve</span>
            <span style={styles.quoteValue}>{formatAmount(meltQuote.fee, displayFormat)}</span>
          </div>
          <div style={styles.totalRow}>
            <span style={styles.totalLabel}>Total</span>
            <span style={styles.totalValue}>
              {formatAmount(meltQuote.amount + meltQuote.fee, displayFormat)}
            </span>
          </div>
        </div>

        {error && (
          <div style={{ ...styles.status, ...styles.errorStatus }}>
            {error}
          </div>
        )}

        <div style={styles.actions}>
          <button
            style={{ ...styles.button, ...styles.secondaryBtn, flex: 1 }}
            onClick={() => setMeltQuote(null)}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            style={{
              ...styles.button,
              ...styles.primaryBtn,
              flex: 1,
              ...(loading ? styles.disabledBtn : {}),
            }}
            onClick={handlePayInvoice}
            disabled={loading}
          >
            {loading ? 'Paying...' : 'Confirm Payment'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.tabs}>
        <button
          style={{ ...styles.tab, ...(activeTab === 'ecash' ? styles.activeTab : {}) }}
          onClick={() => handleTabChange('ecash')}
        >
          Ecash
        </button>
        <button
          style={{ ...styles.tab, ...(activeTab === 'lightning' ? styles.activeTab : {}) }}
          onClick={() => handleTabChange('lightning')}
        >
          Lightning
        </button>
      </div>

      <div style={styles.inputGroup}>
        <label style={styles.label}>From Mint</label>
        <select
          style={styles.select}
          value={selectedMint}
          onChange={(e) => setSelectedMint(e.target.value)}
        >
          {enabledMints.map((mint) => (
            <option key={mint.url} value={mint.url}>
              {mint.name} ({formatAmount(balances.get(mint.url) || 0, displayFormat)})
            </option>
          ))}
        </select>
        <div style={styles.balanceHint}>
          Available: {formatAmount(selectedBalance, displayFormat)}
        </div>
      </div>

      {activeTab === 'ecash' ? (
        <>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Amount (sats)</label>
            <input
              type="number"
              style={styles.input}
              placeholder="Enter amount..."
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min="1"
              max={selectedBalance}
            />
          </div>

          {error && (
            <div style={{ ...styles.status, ...styles.errorStatus }}>
              {error}
            </div>
          )}

          <button
            style={{
              ...styles.button,
              ...styles.primaryBtn,
              ...(loading || !amount ? styles.disabledBtn : {}),
            }}
            onClick={handleGenerateToken}
            disabled={loading || !amount}
          >
            {loading ? 'Generating...' : 'Generate Token'}
          </button>
        </>
      ) : (
        <>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Lightning Invoice</label>
            <textarea
              style={styles.textarea}
              placeholder="Paste Lightning invoice (lnbc...)"
              value={invoice}
              onChange={(e) => setInvoice(e.target.value)}
            />
          </div>

          {error && (
            <div style={{ ...styles.status, ...styles.errorStatus }}>
              {error}
            </div>
          )}

          <button
            style={{
              ...styles.button,
              ...styles.primaryBtn,
              ...(loading || !invoice.trim() ? styles.disabledBtn : {}),
            }}
            onClick={handleGetQuote}
            disabled={loading || !invoice.trim()}
          >
            {loading ? 'Getting Quote...' : 'Get Quote'}
          </button>
        </>
      )}

      <button
        style={{ ...styles.button, ...styles.secondaryBtn }}
        onClick={onClose}
      >
        Cancel
      </button>
    </div>
  );
}

export default SendModal;
