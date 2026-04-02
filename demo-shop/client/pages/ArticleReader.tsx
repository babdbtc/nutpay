import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

interface ArticleTeaser {
  id: string;
  title: string;
  author: string;
  teaser: string;
  price: number;
  unit: string;
  publishedAt: string;
}

type ReaderState = 'locked' | 'unlocking' | 'awaiting' | 'unlocked' | 'error';

export default function ArticleReader() {
  const { id } = useParams<{ id: string }>();
  const [article, setArticle] = useState<ArticleTeaser | null>(null);
  const [articleContent, setArticleContent] = useState('');
  const [state, setState] = useState<ReaderState>('locked');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/articles')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const found = data.articles.find((a: ArticleTeaser) => a.id === id);
        if (found) {
          setArticle(found);
        } else {
          setError('Article not found');
        }
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [id]);

  const handleUnlock = async () => {
    setState('unlocking');
    try {
      const res = await fetch(`/api/articles/${id}/content`);
      if (res.status === 402) {
        setState('awaiting');
      } else if (res.ok) {
        const data = await res.json();
        setState('unlocked');
        setArticleContent(data.article.content);
      } else {
        const err = await res.json();
        setState('error');
        setError(err.detail || 'Payment failed');
      }
    } catch (e) {
      setState('error');
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  };

  if (loading) {
    return (
      <div style={{ paddingTop: 'var(--space-12)' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-disabled)',
          letterSpacing: '0.05em',
        }}>
          [LOADING...]
        </div>
      </div>
    );
  }

  if (!article) {
    return (
      <div style={{ paddingTop: 'var(--space-12)' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--accent-red)',
          letterSpacing: '0.05em',
        }}>
          [ERROR: {error || 'Article not found'}]
        </div>
      </div>
    );
  }

  const date = new Date(article.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div style={{
      paddingTop: 'var(--space-12)',
      paddingBottom: 'var(--space-16)',
      maxWidth: '680px',
    }}>
      <Link
        to="/articles"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-disabled)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 'var(--space-8)',
          transition: 'color 150ms ease-out',
        }}
      >
        &larr; ARTICLES
      </Link>

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-xs)',
        color: 'var(--text-disabled)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        marginBottom: 'var(--space-3)',
      }}>
        {article.author} &mdash; {date}
      </div>

      <h1 style={{
        fontFamily: 'var(--font-heading)',
        fontSize: 'var(--text-3xl)',
        fontWeight: 500,
        color: 'var(--text-display)',
        lineHeight: 1.2,
        marginBottom: 'var(--space-8)',
      }}>
        {article.title}
      </h1>

      <p style={{
        fontFamily: 'var(--font-body)',
        fontSize: 'var(--text-lg)',
        color: 'var(--text-secondary)',
        lineHeight: 1.7,
        marginBottom: 'var(--space-8)',
      }}>
        {article.teaser}
      </p>

      {state !== 'unlocked' && (
        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: 'var(--space-8)',
        }}>
          {state === 'locked' && (
            <button
              onClick={handleUnlock}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: '#FFFFFF',
                backgroundColor: 'var(--accent-red)',
                border: 'none',
                borderRadius: '999px',
                padding: '12px 28px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'opacity 150ms ease-out',
              }}
            >
              UNLOCK FULL ARTICLE &mdash; {article.price} {article.unit.toUpperCase()}
            </button>
          )}

          {state === 'unlocking' && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-disabled)',
              letterSpacing: '0.05em',
            }}>
              [UNLOCKING...]
            </div>
          )}

          {state === 'awaiting' && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              letterSpacing: '0.05em',
            }}>
              Approve payment in Nutpay...
            </div>
          )}

          {state === 'error' && (
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--accent-red)',
                letterSpacing: '0.05em',
                marginBottom: 'var(--space-4)',
              }}>
                [ERROR: {error}]
              </div>
              <button
                onClick={() => { setState('locked'); setError(''); }}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '999px',
                  padding: '8px 20px',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                TRY AGAIN
              </button>
            </div>
          )}
        </div>
      )}

      {state === 'unlocked' && articleContent && (
        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: 'var(--space-8)',
        }}>
          {articleContent.split('\n\n').map((paragraph, i) => (
            <p
              key={i}
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 'var(--text-base)',
                color: 'var(--text-primary)',
                lineHeight: 1.8,
                marginBottom: 'var(--space-6)',
              }}
            >
              {paragraph}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
