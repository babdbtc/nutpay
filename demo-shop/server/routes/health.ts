import { Router } from 'express';

const router = Router();

router.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mint: process.env.MINT_URL || 'https://mint.minibits.cash/Bitcoin',
  });
});

export default router;
