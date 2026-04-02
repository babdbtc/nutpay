import { useNutpayDetection } from '../hooks/useNutpayDetection';

export default function ExtensionBanner() {
  const { isDetected, isChecking } = useNutpayDetection();

  if (isChecking || isDetected) return null;

  return (
    <div style={{
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--accent-red)',
      padding: 'var(--space-3) var(--space-6)',
      textAlign: 'center',
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--text-sm)',
      color: 'var(--text-secondary)',
      letterSpacing: '0.05em',
    }}>
      INSTALL{' '}
      <span style={{ color: 'var(--text-display)' }}>NUTPAY</span>
      {' '}TO EXPERIENCE THIS DEMO —{' '}
      <span style={{ color: 'var(--text-disabled)' }}>
        CHROME EXTENSION FOR AUTOMATIC BITCOIN MICROPAYMENTS
      </span>
    </div>
  );
}
