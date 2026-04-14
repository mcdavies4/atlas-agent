const { processMessage }     = require('./conversation');
const { handleRiderCommand } = require('../riders/commands');
const { sendMessage }        = require('../utils/messenger');

function verifyWebhook(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ Webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function handleWebhook(req, res) {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return;

    const entry   = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value   = changes?.value;

    if (!value?.messages) return;

    const message = value.messages[0];
    const from    = message.from;

    if (message.type !== 'text') {
      await sendMessage(from, "Hi! I can only read text messages for now. Please describe your delivery in text 🙏", 'whatsapp');
      return;
    }

    const text = message.text.body.trim();
    console.log(`📩 [WhatsApp] from ${from}: ${text}`);

    const wasRiderCommand = await handleRiderCommand(from, text, 'whatsapp');
    if (wasRiderCommand) return;

    await processMessage(from, text, 'whatsapp');
  } catch (err) {
    console.error('Webhook error:', err);
  }
}

module.exports = { verifyWebhook, handleWebhook };
