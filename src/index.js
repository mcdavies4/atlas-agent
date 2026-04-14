require('dotenv').config();
const express = require('express');
const { handleWebhook, verifyWebhook } = require('./bot/webhook');
const { handleTelegramUpdate }          = require('./bot/telegram');
const { registerTelegramWebhook }       = require('./utils/telegram');

const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Atlas Dispatch Bot', version: '1.0.0', channels: ['whatsapp', 'telegram'] });
});

// ─── WhatsApp ────────────────────────────────────────────────────────────────
app.get('/webhook',  verifyWebhook);
app.post('/webhook', handleWebhook);

// ─── Telegram ────────────────────────────────────────────────────────────────
app.post('/telegram', handleTelegramUpdate);

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Atlas is running on port ${PORT}`);

  // Auto-register Telegram webhook on startup if token + URL are set
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.RAILWAY_PUBLIC_DOMAIN) {
    const url = `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
    await registerTelegramWebhook(url);
  }
});
