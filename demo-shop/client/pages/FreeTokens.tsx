import { useState } from 'react';

type ClaimState = 'idle' | 'claiming' | 'claimed' | 'exhausted';

interface ClaimResponse {
  token: string | null;
  message: string;
  remaining: number;
}

export default function FreeTokens() {
  const [state, setState] = useState<ClaimState>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [remaining, setRemaining] = useState<number | null>(null);

  async function handleClaim() {
    setState('claiming');
    try {
      const res = await fetch('/api/free-token');
      const data: ClaimResponse = await res.json();
      setToken(data.token);
      setMessage(data.message);
      setRemaining(data.remaining);
      setState(data.token ? 'claimed' : 'exhausted');
    } catch {
      setMessage('Failed to claim token. Try again.');
      setState('idle');
    }
  }

  const isDisabled = state === 'claiming' || state === 'exhausted';

  return (
    <div style={{ paddingBottom: 'var(--space-24)' }}>

      <div style={{ paddingTop: 'var(--space-16)' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-display-size)',
          fontWeight: 400,
          color: 'var(--text-display)',
          lineHeight: 1.1,
          letterSpacing: '0.02em',
        }}>
          CLAIM FREE SATS
        </h1>
      </div>

      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-lg)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        marginTop: 'var(--space-6)',
        maxWidth: '640px',
      }}>
        Get free Cashu tokens to try out the shop. Your Cashu wallet will automatically detect and offer to claim tokens displayed on this page.
      </p>

      <div style={{ marginTop: 'var(--space-12)' }}>
        <button
          onClick={handleClaim}
          disabled={isDisabled}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            fontWeight: 400,
            color: '#FFFFFF',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            background: 'var(--accent-red)',
            border: 'none',
            borderRadius: '999px',
            padding: 'var(--space-3) var(--space-8)',
            cursor: isDisabled ? 'default' : 'pointer',
            opacity: isDisabled ? 0.4 : 1,
            pointerEvents: isDisabled ? 'none' : 'auto',
            transition: 'opacity 150ms ease-out',
          }}
        >
          {state === 'claiming' ? 'CLAIMING...' : 'CLAIM FREE TOKEN'}
        </button>
      </div>

      {/* CRITICAL: token rendered as direct text content in visible div — Cashu wallet ecash scanners detect tokens matching cashu[AB]... pattern */}
      {token && (
        <div style={{ marginTop: 'var(--space-12)' }}>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-disabled)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 'var(--space-2)',
          }}>
            TOKEN
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-primary)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            padding: 'var(--space-4)',
            wordBreak: 'break-all',
            lineHeight: 1.6,
          }}>
            {token}
          </div>
        </div>
      )}

      {state === 'exhausted' && (
        <div style={{
          marginTop: 'var(--space-12)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-lg)',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          ALL TOKENS CLAIMED
        </div>
      )}

      {remaining !== null && state !== 'exhausted' && (
        <div style={{
          marginTop: 'var(--space-6)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-disabled)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}>
          {remaining} TOKENS REMAINING
        </div>
      )}

      {message && (
        <div style={{
          marginTop: 'var(--space-4)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-base)',
          color: 'var(--text-secondary)',
          lineHeight: 1.5,
        }}>
          {message}
        </div>
      )}

      <div style={{
        marginTop: 'var(--space-24)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-disabled)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        lineHeight: 1.8,
        maxWidth: '640px',
      }}>
        If you have a Cashu wallet extension installed, it will auto-detect this token. Otherwise, copy and paste it into any Cashu wallet.
      </div>
    </div>
  );
}
