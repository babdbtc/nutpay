import { useState, useEffect } from 'react';
import ArticleCard from '../components/ArticleCard';

interface Article {
  id: string;
  title: string;
  author: string;
  teaser: string;
  price: number;
  unit: string;
  publishedAt: string;
}

export default function Articles() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/articles')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setArticles(data.articles);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ paddingTop: 'var(--space-12)', paddingBottom: 'var(--space-16)' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.12em',
        marginBottom: 'var(--space-12)',
      }}>
        ARTICLES
      </div>

      {loading && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-disabled)',
          letterSpacing: '0.05em',
        }}>
          [LOADING...]
        </div>
      )}

      {error && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--accent-red)',
          letterSpacing: '0.05em',
        }}>
          [ERROR: {error}]
        </div>
      )}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {articles.map((article) => (
            <ArticleCard key={article.id} {...article} />
          ))}
        </div>
      )}
    </div>
  );
}
