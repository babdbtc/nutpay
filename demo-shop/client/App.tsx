import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Articles from './pages/Articles';
import ArticleReader from './pages/ArticleReader';

function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: '64px 0', color: 'var(--text-secondary)' }}>[{name} — Coming Soon]</div>;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/:id" element={<ArticleReader />} />
        <Route path="/free-tokens" element={<Placeholder name="Free Tokens" />} />
      </Routes>
    </Layout>
  );
}
