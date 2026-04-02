import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  fileType?: string;
  previewImage?: string;
}

type PaymentState = 'idle' | 'paying' | 'awaiting' | 'success' | 'error';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<PaymentState>('idle');
  const [paymentError, setPaymentError] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const paymentOutcomeRef = useRef<{ type: string; error?: string; reason?: string } | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const found = data.products.find((p: Product) => String(p.id) === id);
        if (found) {
          setProduct(found);
        } else {
          setError('Product not found');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  const handlePay = async () => {
    setPaymentState('paying');
    setPaymentError('');
    paymentOutcomeRef.current = null;

    const onPending = () => setPaymentState('awaiting');
    const onFailed = (e: Event) => {
      paymentOutcomeRef.current = { type: 'failed', error: (e as CustomEvent).detail.error };
    };
    const onDenied = (e: Event) => {
      paymentOutcomeRef.current = { type: 'denied', reason: (e as CustomEvent).detail.reason };
    };

    window.addEventListener('nutpay:payment-pending', onPending, { once: true });
    window.addEventListener('nutpay:payment-failed', onFailed, { once: true });
    window.addEventListener('nutpay:payment-denied', onDenied, { once: true });

    const cleanup = () => {
      window.removeEventListener('nutpay:payment-pending', onPending);
      window.removeEventListener('nutpay:payment-failed', onFailed);
      window.removeEventListener('nutpay:payment-denied', onDenied);
    };
    cleanupRef.current = cleanup;

    try {
      const res = await fetch(`/api/products/${id}`);
      cleanup();
      cleanupRef.current = null;

      if (res.ok) {
        const data = await res.json();
        setPaymentState('success');
        setDownloadUrl(data.downloadUrl);
      } else if (res.status === 402) {
        const outcome = paymentOutcomeRef.current;
        if (outcome !== null && outcome.type === 'denied') {
          setPaymentState('error');
          setPaymentError('Payment was declined.');
        } else if (outcome !== null && outcome.type === 'failed') {
          setPaymentState('error');
          setPaymentError(outcome.error || 'Payment failed. Check your Cashu wallet balance.');
        } else if ((window as any).__nutpay_installed) {
          setPaymentState('error');
          setPaymentError('Payment failed. Check your Cashu wallet balance.');
        } else {
          setPaymentState('error');
          setPaymentError('No Cashu wallet detected. Install a browser wallet to make payments.');
        }
      } else {
        const err = await res.json().catch(() => ({ detail: 'Payment failed' }));
        setPaymentState('error');
        setPaymentError(err.detail || 'Payment failed');
      }
    } catch {
      cleanup();
      cleanupRef.current = null;
      setPaymentState('error');
      setPaymentError('Network error');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-12) 0' }}>
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

  if (error || !product) {
    return (
      <div style={{ padding: 'var(--space-12) 0' }}>
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--accent-red)',
          letterSpacing: '0.05em',
        }}>
          [ERROR: {error || 'Product not found'}]
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--space-12) 0' }}>
      <Link
        to="/products"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          color: 'var(--text-disabled)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 'var(--space-12)',
          transition: 'color 150ms ease-out',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-disabled)'; }}
      >
        &larr; BACK TO PRODUCTS
      </Link>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--space-16)',
        alignItems: 'start',
      }}>
        <div>
          {product.previewImage && (
            <div style={{
              width: '100%',
              aspectRatio: '4 / 3',
              borderRadius: '8px',
              overflow: 'hidden',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
            }}>
              <img
                src={product.previewImage}
                alt={product.name}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          )}
          {!product.previewImage && (
            <div style={{
              width: '100%',
              aspectRatio: '4 / 3',
              borderRadius: '8px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-disabled)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}>
                NO PREVIEW
              </span>
            </div>
          )}
        </div>

        <div>
          {product.fileType && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-disabled)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: 'var(--space-4)',
            }}>
              {product.fileType}
            </div>
          )}

          <h1 style={{
            fontFamily: 'var(--font-heading)',
            fontSize: 'var(--text-3xl)',
            fontWeight: 400,
            color: 'var(--text-display)',
            lineHeight: 1.15,
            marginBottom: 'var(--space-6)',
          }}>
            {product.name}
          </h1>

          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-4xl)',
            color: 'var(--text-display)',
            letterSpacing: '-0.02em',
            lineHeight: 1,
            marginBottom: 'var(--space-2)',
          }}>
            {product.price}
          </div>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: 'var(--space-8)',
          }}>
            SATS
          </div>

          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-base)',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: 'var(--space-12)',
            maxWidth: '480px',
          }}>
            {product.description}
          </div>

          {paymentState === 'idle' && (
            <button
              onClick={handlePay}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-base)',
                fontWeight: 400,
                color: '#FFFFFF',
                background: 'var(--accent-red)',
                border: 'none',
                borderRadius: '999px',
                padding: 'var(--space-4) var(--space-8)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'opacity 150ms ease-out',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              PAY {product.price} SATS
            </button>
          )}

          {paymentState === 'paying' && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-disabled)',
              letterSpacing: '0.05em',
            }}>
              [PROCESSING...]
            </div>
          )}

          {paymentState === 'awaiting' && (
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              letterSpacing: '0.02em',
              lineHeight: 1.6,
              padding: 'var(--space-4) var(--space-6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '8px',
              background: 'var(--bg-surface)',
            }}>
              Waiting for 402 payment confirmation...
            </div>
          )}

          {paymentState === 'success' && (
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                letterSpacing: '0.05em',
                marginBottom: 'var(--space-4)',
              }}>
                [PAYMENT COMPLETE]
              </div>
              <a
                href={downloadUrl}
                download
                style={{
                  display: 'inline-block',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-base)',
                  color: 'var(--text-display)',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '999px',
                  padding: 'var(--space-4) var(--space-8)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  transition: 'background 150ms ease-out',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
              >
                DOWNLOAD
              </a>
            </div>
          )}

          {paymentState === 'error' && (
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-sm)',
                color: 'var(--accent-red)',
                letterSpacing: '0.05em',
                marginBottom: 'var(--space-4)',
              }}>
                [ERROR: {paymentError}]
              </div>
              <button
                onClick={handlePay}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  background: 'none',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '999px',
                  padding: 'var(--space-2) var(--space-6)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                  transition: 'border-color 150ms ease-out',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-medium)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
              >
                RETRY
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
