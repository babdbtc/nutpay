import { Router } from 'express';
import { freeTokens } from '../data/tokens.js';

const router = Router();
let tokenIndex = 0;

router.get('/api/free-token', (req, res) => {
  if (tokenIndex < freeTokens.length) {
    const token = freeTokens[tokenIndex];
    tokenIndex++;
    res.json({
      token,
      message: "Here's your free Cashu token! Paste it into your wallet or let Nutpay auto-claim it.",
      remaining: freeTokens.length - tokenIndex,
    });
  } else {
    res.json({
      token: null,
      message: 'All free tokens have been claimed! Check back later.',
      remaining: 0,
    });
  }
});

export default router;
