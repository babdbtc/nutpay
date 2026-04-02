import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductDetail from './pages/ProductDetail';
import Articles from './pages/Articles';
import ArticleReader from './pages/ArticleReader';
import FreeTokens from './pages/FreeTokens';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:id" element={<ProductDetail />} />
        <Route path="/articles" element={<Articles />} />
        <Route path="/articles/:id" element={<ArticleReader />} />
        <Route path="/free-tokens" element={<FreeTokens />} />
      </Routes>
    </Layout>
  );
}
