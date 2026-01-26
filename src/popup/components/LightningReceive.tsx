import React, { useState, useEffect, useRef } from 'react';
import type { MintConfig, PendingMintQuote } from '../../shared/types';
import { QRCode } from './QRCode';
import { formatAmount } from '../../shared/format';

interface LightningReceiveProps {
  mints: MintConfig[];
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
    background: '#22c55e',
    color: 'white',
  },
  secondaryBtn: {
    background: '#374151',
    color: '#ccc',
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
  invoiceText: {
    fontSize: '10px',
    color: '#666',
    wordBreak: 'break-all',
    maxHeight: '60px',
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
  pendingStatus: {
    background: '#f59e0b22',
    color: '#f59e0b',
  },
  successStatus: {
    background: '#22c55e22',
    color: '#22c55e',
  },
  errorStatus: {
    background: '#ef444422',
    color: '#ef4444',
  },
  amountDisplay: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#f7931a',
    textAlign: 'center',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
};

export function LightningReceive({ mints, displayFormat, onSuccess, onClose }: LightningReceiveProps) {
  const [amount, setAmount] = useState('');
  const [selectedMint, setSelectedMint] = useState(mints[0]?.url || '');
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState<PendingMintQuote | null>(null);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'paid' | 'minting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pollingRef = useRef<number | null>(null);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  const enabledMints = mints.filter((m) => m.enabled);

  const handleCreateInvoice = async () => {
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'CREATE_MINT_QUOTE',
        mintUrl: selectedMint,
        amount: amountNum,
      });

      if (result.success && result.quote) {
        setQuote(result.quote);
        setStatus('waiting');
        startPolling(result.quote.quoteId, amountNum);
      } else {
        setError(result.error || 'Failed to create invoice');
      }
    } catch (err) {
      setError('Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = (quoteId: string, amountNum: number) => {
    // Poll every 3 seconds
    pollingRef.current = window.setInterval(async () => {
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'CHECK_MINT_QUOTE',
          mintUrl: selectedMint,
          quoteId,
        });

        if (result.paid) {
          // Stop polling
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }

          setStatus('minting');

          // Mint the proofs
          const mintResult = await chrome.runtime.sendMessage({
            type: 'MINT_PROOFS',
            mintUrl: selectedMint,
            amount: amountNum,
            quoteId,
          });

          if (mintResult.success) {
            setStatus('success');
            setTimeout(() => {
              onSuccess();
            }, 1500);
          } else {
            setStatus('error');
            setError(mintResult.error || 'Failed to mint proofs');
          }
        }
      } catch {
        // Continue polling on error
      }
    }, 3000);
  };

  const copyToClipboard = async () => {
    if (quote?.invoice) {
      await navigator.clipboard.writeText(quote.invoice);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleReset = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setQuote(null);
    setStatus('idle');
    setError(null);
    setAmount('');
  };

  // Show invoice and status
  if (quote && status !== 'idle') {
    return (
      <div style={styles.container}>
        <div style={styles.amountDisplay}>
          {formatAmount(quote.amount, displayFormat)}
        </div>

        <div style={styles.qrContainer}>
          <QRCode value={quote.invoice} size={180} />
          <div style={styles.invoiceText}>{quote.invoice}</div>
          <button style={styles.copyBtn} onClick={copyToClipboard}>
            {copied ? 'Copied!' : 'Copy Invoice'}
          </button>
        </div>

        {status === 'waiting' && (
          <div style={{ ...styles.status, ...styles.pendingStatus }}>
            Waiting for payment...
          </div>
        )}

        {status === 'minting' && (
          <div style={{ ...styles.status, ...styles.pendingStatus }}>
            Payment received! Minting proofs...
          </div>
        )}

        {status === 'success' && (
          <div style={{ ...styles.status, ...styles.successStatus }}>
            Success! Proofs minted.
          </div>
        )}

        {status === 'error' && (
          <div style={{ ...styles.status, ...styles.errorStatus }}>
            {error || 'An error occurred'}
          </div>
        )}

        {(status === 'error' || status === 'success') && (
          <div style={styles.actions}>
            <button
              style={{ ...styles.button, ...styles.secondaryBtn, flex: 1 }}
              onClick={handleReset}
            >
              {status === 'error' ? 'Try Again' : 'Done'}
            </button>
          </div>
        )}

        {status === 'waiting' && (
          <button
            style={{ ...styles.button, ...styles.secondaryBtn }}
            onClick={onClose}
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  // Show form
  return (
    <div style={styles.container}>
      <div style={styles.inputGroup}>
        <label style={styles.label}>Amount (sats)</label>
        <input
          type="number"
          style={styles.input}
          placeholder="Enter amount..."
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          min="1"
        />
      </div>

      <div style={styles.inputGroup}>
        <label style={styles.label}>Mint</label>
        <select
          style={styles.select}
          value={selectedMint}
          onChange={(e) => setSelectedMint(e.target.value)}
        >
          {enabledMints.map((mint) => (
            <option key={mint.url} value={mint.url}>
              {mint.name}
            </option>
          ))}
        </select>
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
        onClick={handleCreateInvoice}
        disabled={loading || !amount}
      >
        {loading ? 'Creating Invoice...' : 'Generate Invoice'}
      </button>

      <button
        style={{ ...styles.button, ...styles.secondaryBtn }}
        onClick={onClose}
      >
        Cancel
      </button>
    </div>
  );
}

export default LightningReceive;
