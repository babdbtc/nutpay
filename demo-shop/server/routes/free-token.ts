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
      message: "Here's your free Cashu token! Your wallet extension will auto-claim it, or copy and paste it into any Cashu wallet.",
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
