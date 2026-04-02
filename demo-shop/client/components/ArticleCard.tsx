import { Link } from 'react-router-dom';

interface ArticleCardProps {
  id: string;
  title: string;
  author: string;
  teaser: string;
  price: number;
  unit: string;
  publishedAt: string;
}

export default function ArticleCard({ id, title, author, teaser, price, unit, publishedAt }: ArticleCardProps) {
  const date = new Date(publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Link
      to={`/articles/${id}`}
      style={{
        display: 'block',
        textDecoration: 'none',
        color: 'inherit',
        paddingBottom: 'var(--space-8)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-disabled)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 'var(--space-2)',
      }}>
        {author} &mdash; {date}
      </div>

      <h2 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 'var(--text-xl)',
        fontWeight: 500,
        color: 'var(--text-primary)',
        lineHeight: 1.3,
        marginBottom: 'var(--space-3)',
      }}>
        {title}
      </h2>

      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-base)',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        marginBottom: 'var(--space-4)',
      }}>
        {teaser}
      </p>

      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
        padding: '4px 10px',
        borderRadius: '999px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
      }}>
        {price} {unit}
      </span>
    </Link>
  );
}
