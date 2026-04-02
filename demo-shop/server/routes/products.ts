import { Router, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { products } from '../data/products.js';
import { buildPaymentRequest, validateAndRedeemToken } from '../services/cashu.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

router.get('/api/products', (_req: Request, res: Response) => {
  res.json({ products });
});

router.get('/api/products/:id', async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const product = products.find(p => p.id === id);

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const token = req.headers['x-cashu'] as string | undefined;

  if (!token) {
    res.status(402).setHeader('X-Cashu', buildPaymentRequest(product.price, 'sat'));
    res.json({
      status: 402,
      message: 'Payment Required',
      product: { name: product.name, price: product.price, unit: product.unit },
    });
    return;
  }

  const result = await validateAndRedeemToken(token, product.price);

  if (result.valid) {
    res.status(200).json({
      success: true,
      product,
      downloadUrl: `/api/products/${product.id}/download`,
    });
  } else {
    res.status(400).json({ detail: result.error, code: 0 });
  }
});

router.get('/api/products/:id/download', (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const product = products.find(p => p.id === id);

  if (!product) {
    res.status(404).json({ error: 'Product not found' });
    return;
  }

  const assetPath = path.join(__dirname, '../../public', product.previewImage);
  res.sendFile(assetPath);
});

export default router;
