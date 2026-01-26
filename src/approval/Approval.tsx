import React, { useState, useEffect } from 'react';
import type { Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/constants';
import { formatAmount } from '../shared/format';

interface PaymentDetails {
  requestId: string;
  origin: string;
  mint: string;
  amount: number;
  unit: string;
  balance: number;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  header: {
    textAlign: 'center',
    marginBottom: '8px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    marginBottom: '4px',
  },
  subtitle: {
    fontSize: '13px',
    color: '#888',
  },
  card: {
    background: '#252542',
    borderRadius: '12px',
    padding: '16px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #333',
  },
  rowLast: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
  },
  label: {
    fontSize: '13px',
    color: '#888',
  },
  value: {
    fontSize: '14px',
    fontWeight: 500,
    maxWidth: '200px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  amount: {
    fontSize: '28px',
    fontWeight: 700,
    textAlign: 'center',
    padding: '16px 0',
    color: '#f7931a',
  },
  balanceInfo: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#888',
    marginTop: '-8px',
    paddingBottom: '8px',
  },
  checkbox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#aaa',
  },
  buttons: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  button: {
    flex: 1,
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  approveBtn: {
    background: '#22c55e',
    color: 'white',
  },
  denyBtn: {
    background: '#374151',
    color: '#ccc',
  },
  timer: {
    textAlign: 'center',
    fontSize: '12px',
    color: '#666',
  },
};

function Approval() {
  const [details, setDetails] = useState<PaymentDetails | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [rememberSite, setRememberSite] = useState(false);
  const [timeLeft, setTimeLeft] = useState(60);

  useEffect(() => {
    // Parse URL parameters
    const params = new URLSearchParams(window.location.search);
    setDetails({
      requestId: params.get('requestId') || '',
      origin: params.get('origin') || '',
      mint: params.get('mint') || '',
      amount: parseInt(params.get('amount') || '0', 10),
      unit: params.get('unit') || 'sat',
      balance: parseInt(params.get('balance') || '0', 10),
    });

    // Load settings for display format
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }).then((data) => {
      if (data) setSettings(data);
    });
  }, []);

  useEffect(() => {
    // Countdown timer
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleDeny();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const sendResponse = (approved: boolean) => {
    if (!details) return;

    chrome.runtime.sendMessage({
      type: 'APPROVAL_RESPONSE',
      requestId: details.requestId,
      approved,
      rememberSite,
    });

    // Close the popup
    window.close();
  };

  const handleApprove = () => sendResponse(true);
  const handleDeny = () => sendResponse(false);

  if (!details) {
    return <div style={styles.container}>Loading...</div>;
  }

  const mintHost = (() => {
    try {
      return new URL(details.mint).hostname;
    } catch {
      return details.mint;
    }
  })();

  const siteHost = (() => {
    try {
      return new URL(details.origin).hostname;
    } catch {
      return details.origin;
    }
  })();

  const remainingBalance = details.balance - details.amount;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Payment Request</div>
        <div style={styles.subtitle}>A site is requesting payment</div>
      </div>

      <div style={styles.card}>
        <div style={styles.amount}>
          {formatAmount(details.amount, settings.displayFormat)}
        </div>
        <div style={styles.balanceInfo}>
          Balance: {formatAmount(details.balance, settings.displayFormat)} → {formatAmount(remainingBalance, settings.displayFormat)} after
        </div>

        <div style={styles.row}>
          <span style={styles.label}>From</span>
          <span style={styles.value} title={details.origin}>
            {siteHost}
          </span>
        </div>

        <div style={styles.rowLast}>
          <span style={styles.label}>Mint</span>
          <span style={styles.value} title={details.mint}>
            {mintHost}
          </span>
        </div>
      </div>

      <label style={styles.checkbox}>
        <input
          type="checkbox"
          checked={rememberSite}
          onChange={(e) => setRememberSite(e.target.checked)}
        />
        Auto-approve future payments from this site
      </label>

      <div style={styles.buttons}>
        <button
          style={{ ...styles.button, ...styles.denyBtn }}
          onClick={handleDeny}
        >
          Deny
        </button>
        <button
          style={{ ...styles.button, ...styles.approveBtn }}
          onClick={handleApprove}
        >
          Pay
        </button>
      </div>

      <div style={styles.timer}>Auto-deny in {timeLeft}s</div>
    </div>
  );
}

export default Approval;
