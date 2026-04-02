import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { corsMiddleware } from './middleware/cors.js';
import healthRouter from './routes/health.js';
import freeTokenRouter from './routes/free-token.js';
import { initializeCashu } from './services/cashu.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(corsMiddleware);
app.use(express.json());

// API Routes
app.use(healthRouter);
app.use(freeTokenRouter);

// Static files (built React SPA)
const clientDistPath = path.join(__dirname, '../dist/client');
app.use(express.static(clientDistPath));

// SPA fallback — serve index.html for non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Demo shop server running on http://localhost:${PORT}`);
  initializeCashu().catch(err => console.warn('Mint initialization failed:', err.message));
});

export default app;
