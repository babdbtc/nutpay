import React, { useState, useEffect } from 'react';
import { formatAmount } from '../../shared/format';

interface MintInfoModalProps {
  mintUrl: string;
  mintName: string;
  displayFormat: 'symbol' | 'text';
  onClose: () => void;
  onConsolidate?: () => void;
}

interface MintDetails {
  name: string;
  version?: string;
  description?: string;
  contact?: string[];
  motd?: string;
  nuts?: Record<string, unknown>;
  online: boolean;
}

interface BalanceDetails {
  balance: number;
  proofCount: number;
  denominations: Record<number, number>;
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
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
  },
  online: {
    background: '#22c55e',
  },
  offline: {
    background: '#ef4444',
  },
  name: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    flex: 1,
  },
  section: {
    background: '#252542',
    borderRadius: '8px',
    padding: '12px',
  },
  sectionTitle: {
    fontSize: '12px',
    color: '#888',
    fontWeight: 500,
    marginBottom: '8px',
  },
  balanceDisplay: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#f7931a',
    textAlign: 'center',
    padding: '8px 0',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #333',
  },
  rowLast: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
  },
  label: {
    color: '#888',
    fontSize: '13px',
  },
  value: {
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
  },
  url: {
    fontSize: '11px',
    color: '#666',
    wordBreak: 'break-all',
    marginTop: '4px',
  },
  denomList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '8px',
  },
  denomItem: {
    background: '#1a1a2e',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    color: '#888',
  },
  motd: {
    fontSize: '12px',
    color: '#888',
    fontStyle: 'italic',
    padding: '8px',
    background: '#1a1a2e',
    borderRadius: '6px',
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
  disabledBtn: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  loading: {
    textAlign: 'center',
    padding: '20px',
    color: '#888',
  },
  error: {
    textAlign: 'center',
    padding: '12px',
    color: '#ef4444',
    background: '#ef444422',
    borderRadius: '8px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
};

export function MintInfoModal({
  mintUrl,
  mintName,
  displayFormat,
  onClose,
  onConsolidate,
}: MintInfoModalProps) {
  const [loading, setLoading] = useState(true);
  const [mintInfo, setMintInfo] = useState<MintDetails | null>(null);
  const [balanceDetails, setBalanceDetails] = useState<BalanceDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consolidating, setConsolidating] = useState(false);

  useEffect(() => {
    loadMintInfo();
  }, [mintUrl]);

  const loadMintInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      const [infoResult, balanceResult] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'GET_MINT_INFO', mintUrl }),
        chrome.runtime.sendMessage({ type: 'GET_MINT_BALANCE_DETAILS', mintUrl }),
      ]);

      setMintInfo(infoResult);
      setBalanceDetails(balanceResult);
    } catch (err) {
      setError('Failed to load mint information');
    } finally {
      setLoading(false);
    }
  };

  const handleConsolidate = async () => {
    // This would trigger proof consolidation
    // For now, just close and refresh
    if (onConsolidate) {
      setConsolidating(true);
      await onConsolidate();
      setConsolidating(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading mint information...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
        <button style={{ ...styles.button, ...styles.secondaryBtn }} onClick={onClose}>
          Close
        </button>
      </div>
    );
  }

  const sortedDenoms = balanceDetails?.denominations
    ? Object.entries(balanceDetails.denominations)
        .map(([denom, count]) => ({ denom: parseInt(denom), count }))
        .sort((a, b) => b.denom - a.denom)
    : [];

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div
          style={{
            ...styles.statusDot,
            ...(mintInfo?.online ? styles.online : styles.offline),
          }}
        />
        <span style={styles.name}>{mintInfo?.name || mintName}</span>
      </div>

      <div style={styles.url}>{mintUrl}</div>

      <div style={styles.section}>
        <div style={styles.sectionTitle}>Balance</div>
        <div style={styles.balanceDisplay}>
          {formatAmount(balanceDetails?.balance || 0, displayFormat)}
        </div>
        <div style={styles.row}>
          <span style={styles.label}>Proofs</span>
          <span style={styles.value}>{balanceDetails?.proofCount || 0}</span>
        </div>
      </div>

      {sortedDenoms.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Denominations</div>
          <div style={styles.denomList}>
            {sortedDenoms.map(({ denom, count }) => (
              <span key={denom} style={styles.denomItem}>
                {denom} x{count}
              </span>
            ))}
          </div>
        </div>
      )}

      {mintInfo && (
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Mint Info</div>
          {mintInfo.version && (
            <div style={styles.row}>
              <span style={styles.label}>Version</span>
              <span style={styles.value}>{mintInfo.version}</span>
            </div>
          )}
          <div style={styles.rowLast}>
            <span style={styles.label}>Status</span>
            <span style={styles.value}>{mintInfo.online ? 'Online' : 'Offline'}</span>
          </div>
          {mintInfo.motd && <div style={styles.motd}>{mintInfo.motd}</div>}
        </div>
      )}

      <div style={styles.actions}>
        {balanceDetails && balanceDetails.proofCount > 5 && (
          <button
            style={{
              ...styles.button,
              ...styles.primaryBtn,
              flex: 1,
              ...(consolidating ? styles.disabledBtn : {}),
            }}
            onClick={handleConsolidate}
            disabled={consolidating}
          >
            {consolidating ? 'Consolidating...' : 'Consolidate Proofs'}
          </button>
        )}
        <button
          style={{ ...styles.button, ...styles.secondaryBtn, flex: 1 }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default MintInfoModal;
