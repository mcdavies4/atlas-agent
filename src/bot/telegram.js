const { processMessage } = require('./conversation');
const { handleRiderCommand } = require('../riders/commands');

// Telegram sends updates to your webhook as POST requests
async function handleTelegramUpdate(req, res) {
  res.sendStatus(200); // Always respond immediately

  try {
    const update = req.body;

    // Only handle text messages
    const message = update.message;
    if (!message || !message.text) return;

    const chatId = String(message.chat.id);
    const text   = message.text.trim();

    console.log(`📩 [Telegram] from ${chatId}: ${text}`);

    // Check rider commands first
    const wasRiderCommand = await handleRiderCommand(chatId, text, 'telegram');
    if (wasRiderCommand) return;

    // Sender flow — reuse same conversation engine
    await processMessage(chatId, text, 'telegram');
  } catch (err) {
    console.error('Telegram webhook error:', err);
  }
}

module.exports = { handleTelegramUpdate };
