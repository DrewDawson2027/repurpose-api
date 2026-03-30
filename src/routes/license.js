import Stripe from 'stripe';
import { randomUUID } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '../../data/licenses.json');

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Checkout links per product (set these after creating Stripe products)
const CHECKOUT_LINKS = {
  smartledger: process.env.STRIPE_LINK_SMARTLEDGER || '',
  recast: process.env.STRIPE_LINK_RECAST || '',
  bundle: process.env.STRIPE_LINK_BUNDLE || '',
};

// --- DB helpers ---

function loadDB() {
  if (!existsSync(DB_PATH)) return {};
  return JSON.parse(readFileSync(DB_PATH, 'utf-8'));
}

function saveDB(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// --- Routes ---

// GET /api/validate?key=xxx&product=smartledger
export function validateKey(req, res) {
  const { key, product } = req.query;
  if (!key || !product) {
    return res.json({ valid: false, error: 'Missing key or product' });
  }

  const db = loadDB();
  const license = db[key];

  if (!license) {
    return res.json({ valid: false });
  }

  // Check product matches and license is active
  if (license.product !== product && license.product !== 'bundle') {
    return res.json({ valid: false });
  }

  if (!license.active) {
    return res.json({ valid: false, expired: true });
  }

  return res.json({ valid: true, tier: 'pro', product: license.product });
}

// GET /api/checkout/:product — redirect to Stripe Checkout
export function checkout(req, res) {
  const { product } = req.params;
  const link = CHECKOUT_LINKS[product];

  if (!link) {
    return res.status(404).json({ error: `Unknown product: ${product}` });
  }

  res.redirect(303, link);
}

// POST /api/webhook/stripe — handle Stripe events
export async function stripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    event = stripe.webhooks.constructEvent(
      req.body, // raw body
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const db = loadDB();

    // Use session ID for idempotency — same session always produces same key
    const existingKey = Object.keys(db).find(
      k => db[k].stripe_session_id === session.id
    );

    if (!existingKey) {
      // Determine product from metadata or line items
      const product = session.metadata?.product || 'smartledger';
      const prefix = product === 'recast' ? 'rc' : product === 'bundle' ? 'bd' : 'sl';
      const key = `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 24)}`;

      db[key] = {
        product,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription,
        stripe_session_id: session.id,
        email: session.customer_details?.email || null,
        created: new Date().toISOString(),
        active: true,
      };

      saveDB(db);
      console.log(`License created: ${key} for ${product}`);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const db = loadDB();

    // Deactivate all keys for this subscription
    for (const [key, license] of Object.entries(db)) {
      if (license.stripe_subscription_id === subscription.id) {
        license.active = false;
        console.log(`License deactivated: ${key}`);
      }
    }

    saveDB(db);
  }

  res.json({ received: true });
}

// GET /api/success?session_id=xxx — show license key after payment
export function successPage(req, res) {
  const { session_id } = req.query;
  if (!session_id) {
    return res.status(400).send('Missing session_id');
  }

  const db = loadDB();
  const entry = Object.entries(db).find(
    ([, v]) => v.stripe_session_id === session_id
  );

  if (!entry) {
    // Key might not be generated yet (webhook delay)
    return res.send(`
      <html>
      <head><title>Processing Payment...</title>
      <meta http-equiv="refresh" content="3">
      <style>body{font-family:system-ui;max-width:500px;margin:80px auto;text-align:center;color:#334155}
      .spinner{width:40px;height:40px;border:4px solid #e2e8f0;border-top:4px solid #3b82f6;border-radius:50%;animation:spin 1s linear infinite;margin:20px auto}
      @keyframes spin{to{transform:rotate(360deg)}}</style></head>
      <body>
      <div class="spinner"></div>
      <h2>Processing your payment...</h2>
      <p>This page will refresh automatically.</p>
      </body></html>
    `);
  }

  const [key, license] = entry;
  const envVar = license.product === 'recast' ? 'RECAST_LICENSE_KEY' : 'SMARTLEDGER_LICENSE_KEY';
  const command = license.product === 'recast' ? 'recast-mcp' : 'smartledger-mcp';

  res.send(`
    <html>
    <head><title>License Key — Thank You!</title>
    <style>
      body{font-family:system-ui;max-width:600px;margin:60px auto;padding:0 20px;color:#334155}
      h1{color:#1e293b}
      .key-box{background:#f1f5f9;border:2px solid #3b82f6;border-radius:12px;padding:20px;margin:24px 0;text-align:center}
      .key{font-family:monospace;font-size:1.2em;color:#1e40af;user-select:all;word-break:break-all}
      .copy-btn{background:#3b82f6;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:1em;cursor:pointer;margin-top:12px}
      .copy-btn:hover{background:#2563eb}
      code{background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:0.9em}
      pre{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:8px;overflow-x:auto;font-size:0.85em}
      .step{margin:16px 0;padding-left:8px;border-left:3px solid #3b82f6}
    </style></head>
    <body>
    <h1>Your License Key</h1>
    <p>Thank you for upgrading to Pro! Here's your license key:</p>

    <div class="key-box">
      <div class="key" id="license-key">${key}</div>
      <button class="copy-btn" onclick="navigator.clipboard.writeText('${key}');this.textContent='Copied!'">Copy Key</button>
    </div>

    <h2>How to activate</h2>

    <div class="step">
      <p><strong>Step 1:</strong> Open your Claude Desktop config file:</p>
      <p><code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (Mac)<br>
      <code>%APPDATA%\\Claude\\claude_desktop_config.json</code> (Windows)</p>
    </div>

    <div class="step">
      <p><strong>Step 2:</strong> Add your key to the <code>${command}</code> server config:</p>
      <pre>{
  "mcpServers": {
    "${command.replace('-mcp', '')}": {
      "command": "${license.product === 'recast' ? 'npx' : 'uvx'}",
      "args": ["${command}"],
      "env": {
        "${envVar}": "${key}"
      }
    }
  }
}</pre>
    </div>

    <div class="step">
      <p><strong>Step 3:</strong> Restart Claude Desktop. You now have unlimited access!</p>
    </div>

    <p style="margin-top:32px;color:#64748b;font-size:0.9em">Save this key somewhere safe. If you lose it, email drewdawson403@gmail.com with your payment email and we'll resend it.</p>
    </body></html>
  `);
}
