const axios = require('axios');

const BASE = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

async function sendTelegramMessage(chatId, text) {
  try {
    await axios.post(`${BASE}/sendMessage`, {
      chat_id:    chatId,
      text,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    console.error('Telegram send error:', err?.response?.data || err.message);
  }
}

async function registerTelegramWebhook(webhookUrl) {
  try {
    const res = await axios.post(`${BASE}/setWebhook`, {
      url: `${webhookUrl}/telegram`,
    });
    console.log('✅ Telegram webhook registered:', res.data);
  } catch (err) {
    console.error('Telegram webhook registration error:', err?.response?.data || err.message);
  }
}

module.exports = { sendTelegramMessage, registerTelegramWebhook };
