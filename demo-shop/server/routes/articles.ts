import { Router } from 'express';
import { articles } from '../data/articles.js';
import { buildPaymentRequest, validateAndRedeemToken } from '../services/cashu.js';

const router = Router();

// GET /api/articles — public, returns teasers only (no content field)
router.get('/api/articles', (req, res) => {
  const teasers = articles.map((article) => {
    const { content, ...articleTeaser } = article;
    return articleTeaser;
  });
  res.json({ articles: teasers });
});

// GET /api/articles/:id/content — protected via 402 + X-Cashu
router.get('/api/articles/:id/content', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const article = articles.find((a) => a.id === id);

  if (!article) {
    res.status(404).json({ error: 'Article not found' });
    return;
  }

  const token = req.headers['x-cashu'] as string | undefined;

  if (!token) {
    const paymentRequest = buildPaymentRequest(article.price, article.unit);
    res.status(402).set('X-Cashu', paymentRequest).json({
      status: 402,
      message: 'Payment Required',
    });
    return;
  }

  const result = await validateAndRedeemToken(token, article.price);

  if (!result.valid) {
    res.status(400).json({ detail: result.error, code: 0 });
    return;
  }

  res.json({ success: true, article });
});

export default router;
