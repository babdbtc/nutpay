import { Link } from 'react-router-dom';

const features = [
  {
    to: '/products',
    title: 'DIGITAL PRODUCTS',
    description: 'Purchase wallpapers, icons, fonts, and code with instant bitcoin micropayments.',
  },
  {
    to: '/articles',
    title: 'PREMIUM ARTICLES',
    description: 'Read paywalled content about ecash, privacy, and the future of web payments.',
  },
  {
    to: '/free-tokens',
    title: 'FREE TOKENS',
    description: 'Claim free Cashu tokens to try out the shop. Nutpay auto-detects and claims them.',
  },
] as const;

export default function Home() {
  return (
    <div style={{ paddingBottom: 'var(--space-24)' }}>
      <div style={{ paddingTop: 'var(--space-16)' }}>
        <h1 style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--text-display-size)',
          fontWeight: 300,
          color: 'var(--text-display)',
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}>
          PAY WITH BITCOIN.
          <br />
          ONE CLICK.
        </h1>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-4)',
        marginTop: 'var(--space-24)',
      }}>
        {features.map(({ to, title, description }) => (
          <Link
            key={to}
            to={to}
            style={{
              display: 'block',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              padding: 'var(--space-6)',
              borderRadius: '8px',
              textDecoration: 'none',
              transition: 'border-color 150ms ease-out',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-medium)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)';
            }}
          >
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 'var(--space-3)',
            }}>
              {title}
            </div>
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'var(--text-primary)',
              lineHeight: 1.5,
            }}>
              {description}
            </div>
          </Link>
        ))}
      </div>

      <div style={{
        marginTop: 'var(--space-24)',
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-disabled)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}>
        POWERED BY CASHU &middot; NUT-24
      </div>
    </div>
  );
}
