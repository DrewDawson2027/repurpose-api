import express from 'express';
import cors from 'cors';
import { repurposeRoute } from './routes/repurpose.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware — allow all chrome extensions and local dev
app.use(cors({
  origin: (origin, callback) => {
    // Allow Chrome extensions, localhost, and no-origin requests (server-to-server)
    if (!origin || origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50kb' }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Main repurpose endpoint
app.post('/api/repurpose', repurposeRoute);

// Start server
app.listen(PORT, () => {
  console.log(`Repurpose API running on port ${PORT}`);
});
