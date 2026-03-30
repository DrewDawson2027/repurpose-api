import express from 'express';
import cors from 'cors';
import { repurposeRoute } from './routes/repurpose.js';
import { validateKey, checkout, stripeWebhook, successPage } from './routes/license.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Stripe webhook needs raw body — must be before express.json()
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhook);

// CORS — allow MCP servers, Chrome extensions, and local dev
app.use(cors());
app.use(express.json({ limit: '50kb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0' });
});

// License endpoints
app.get('/api/validate', validateKey);
app.get('/api/checkout/:product', checkout);
app.get('/api/success', successPage);

// Repurpose endpoint (legacy)
app.post('/api/repurpose', repurposeRoute);

// Start server
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
