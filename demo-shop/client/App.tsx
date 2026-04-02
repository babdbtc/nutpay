import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';

// Placeholder pages — will be implemented in later tasks
function Placeholder({ name }: { name: string }) {
  return <div style={{ padding: '64px 0', color: 'var(--text-secondary)' }}>[{name} — Coming Soon]</div>;
}

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Placeholder name="Home" />} />
        <Route path="/products" element={<Placeholder name="Products" />} />
        <Route path="/products/:id" element={<Placeholder name="Product Detail" />} />
        <Route path="/articles" element={<Placeholder name="Articles" />} />
        <Route path="/articles/:id" element={<Placeholder name="Article Reader" />} />
        <Route path="/free-tokens" element={<Placeholder name="Free Tokens" />} />
      </Routes>
    </Layout>
  );
}
