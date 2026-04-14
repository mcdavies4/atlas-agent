const { sendMessage: sendWhatsApp } = require('./whatsapp');
const { sendTelegramMessage }        = require('./telegram');

async function sendMessage(to, text, channel = 'whatsapp') {
  if (channel === 'telegram') {
    return sendTelegramMessage(to, text);
  }
  return sendWhatsApp(to, text);
}

module.exports = { sendMessage };
