import { Request, Response, NextFunction } from 'express';

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Cashu');
  res.setHeader('Access-Control-Expose-Headers', 'X-Cashu');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
