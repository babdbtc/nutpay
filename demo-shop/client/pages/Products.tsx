import { useState, useEffect } from 'react';
import ProductCard from '../components/ProductCard';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  unit: string;
  previewImage?: string;
}

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/products')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setProducts(data.products);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ padding: 'var(--space-12) 0' }}>
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        marginBottom: 'var(--space-12)',
      }}>
        PRODUCTS
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
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-6)',
        }}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              name={product.name}
              description={product.description}
              price={product.price}
              unit={product.unit}
              previewImage={product.previewImage}
            />
          ))}
        </div>
      )}

      {!loading && !error && products.length === 0 && (
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-disabled)',
          letterSpacing: '0.05em',
        }}>
          [NO PRODUCTS]
        </div>
      )}
    </div>
  );
}
