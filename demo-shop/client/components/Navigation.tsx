import { Link, useLocation } from 'react-router-dom';

const navLinks = [
  { to: '/products', label: 'PRODUCTS' },
  { to: '/articles', label: 'ARTICLES' },
  { to: '/free-tokens', label: 'FREE TOKENS' },
] as const;

export default function Navigation() {
  const { pathname } = useLocation();

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 'var(--space-8) 0',
    }}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--text-2xl)',
          color: 'var(--text-display)',
          letterSpacing: '0.05em',
          lineHeight: 1,
        }}>
          DEMO SHOP
        </div>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-disabled)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginTop: 'var(--space-1)',
        }}>
          A Cashu-Powered Digital Marketplace
        </div>
      </Link>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-8)',
      }}>
        {navLinks.map(({ to, label }) => {
          const isActive = pathname === to || pathname.startsWith(to + '/');
          return (
            <Link
              key={to}
              to={to}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: isActive ? 'var(--text-display)' : 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                textDecoration: 'none',
                transition: 'color 150ms ease-out',
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
