import { Link } from 'react-router-dom';

interface ProductCardProps {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  previewImage?: string;
}

export default function ProductCard({ id, name, description, price, unit, previewImage }: ProductCardProps) {
  return (
    <Link
      to={`/products/${id}`}
      style={{
        display: 'block',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: 'var(--space-6)',
        textDecoration: 'none',
        transition: 'background 150ms ease-out, border-color 150ms ease-out',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--bg-elevated)';
        e.currentTarget.style.borderColor = 'var(--border-medium)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--bg-surface)';
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
      }}
    >
      {previewImage && (
        <div style={{
          width: '100%',
          height: '160px',
          borderRadius: '4px',
          overflow: 'hidden',
          marginBottom: 'var(--space-4)',
          background: 'var(--bg-elevated)',
        }}>
          <img
            src={previewImage}
            alt={name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )}

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-disabled)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 'var(--space-3)',
      }}>
        {unit}
      </div>

      <div style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 'var(--text-lg)',
        color: 'var(--text-primary)',
        lineHeight: 1.3,
        marginBottom: 'var(--space-2)',
      }}>
        {name}
      </div>

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-2xl)',
        color: 'var(--text-display)',
        letterSpacing: '-0.02em',
        lineHeight: 1,
        marginBottom: 'var(--space-4)',
      }}>
        {price} <span style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--text-secondary)',
          letterSpacing: '0.05em',
        }}>SATS</span>
      </div>

      <div style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
      }}>
        {description}
      </div>
    </Link>
  );
}
