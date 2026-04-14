const { sendMessage }          = require('../utils/messenger');
const { getSession, updateSession, clearSession } = require('../utils/session');
const { extractDeliveryDetails, getKnowledgeCompanies, synthesiseResults, generateFollowUp } = require('../ai/claude');
const { searchLogisticsCompanies } = require('../ai/search');

const STATES = {
  IDLE:        'IDLE',
  COLLECTING:  'COLLECTING',
  SHOWING:     'SHOWING',
  FOLLOWUP:    'FOLLOWUP',
};

async function processMessage(phone, text, channel = 'whatsapp') {
  const session = await getSession(phone);
  const state   = session?.state || STATES.IDLE;

  console.log('[' + phone + '][' + channel + '] State: ' + state);

  switch (state) {
    case STATES.IDLE:       return handleIdle(phone, text, session, channel);
    case STATES.COLLECTING: return handleCollecting(phone, text, session, channel);
    case STATES.SHOWING:    return handleShowing(phone, text, session, channel);
    case STATES.FOLLOWUP:   return handleFollowUp(phone, text, session, channel);
    default:                return handleIdle(phone, text, session, channel);
  }
}

// ─── IDLE ─────────────────────────────────────────────────────────────────────

async function handleIdle(phone, text, session, channel) {
  const lower = text.toLowerCase();

  if (['hi', 'hello', 'start', 'hey', 'hiya', 'help'].some(k => lower.includes(k)) || !session) {
    await sendMessage(phone, `👋 Welcome to *Atlas* — your AI logistics assistant for Nigeria!

I'll find you the best courier and delivery companies for your shipment — with contact details, ratings, and prices.

Just tell me about your delivery:
📍 Where to pick up from
📍 Where to deliver to
📦 What you're sending

Example: _"I need to send documents from Wuse 2 to Gwarinpa in Abuja"_`, channel);

    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return;
  }

  return handleCollecting(phone, text, { state: STATES.COLLECTING, context: {} }, channel);
}

// ─── COLLECTING ───────────────────────────────────────────────────────────────

async function handleCollecting(phone, text, session, channel) {
  if (text.toLowerCase() === 'cancel') {
    await clearSession(phone);
    return sendMessage(phone, "No problem! Type *hi* whenever you need help finding a courier. 👍", channel);
  }

  await sendMessage(phone, "🔍 Searching for the best options for you...", channel);

  const context = session?.context || {};
  const details = await extractDeliveryDetails(text, context);

  if (!details.success) {
    return sendMessage(phone, `I couldn't quite get that. Could you tell me:

📍 Pickup location (area or city in Nigeria)
📍 Drop-off location
📦 What you're sending

Example: _"Pick up a package from Victoria Island Lagos, deliver to Ikeja"_`, channel);
  }

  const missing = [];
  if (!details.pickup)  missing.push('📍 *pickup location*');
  if (!details.dropoff) missing.push('📍 *drop-off location*');

  if (missing.length > 0) {
    await updateSession(phone, { state: STATES.COLLECTING, context: { ...context, ...details } });
    return sendMessage(phone, 'Almost there! I still need:\n' + missing.join('\n'), channel);
  }

  // Run knowledge + search in parallel
  await sendMessage(phone, "⚡ Found your details. Checking companies across the web...", channel);

  const [knowledgeCompanies, searchResults] = await Promise.all([
    getKnowledgeCompanies(details),
    searchLogisticsCompanies(details),
  ]);

  // Synthesise both into ranked list
  const companies = await synthesiseResults(knowledgeCompanies, searchResults, details);

  if (!companies || companies.length === 0) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, `Sorry, I couldn't find reliable companies for that route right now. Could you try rephrasing or give me more details about the city?`, channel);
  }

  // Format company list
  let response = `✅ *Here are the best logistics options for your delivery:*\n`;
  response    += `📍 ${details.pickup} → ${details.dropoff}\n`;
  response    += `📦 ${details.itemDescription || 'Package'} · ${details.itemSize || 'Standard'}\n\n`;

  companies.forEach((c, i) => {
    response += `*${i + 1}. ${c.name}*\n`;
    if (c.phone)     response += `📞 ${c.phone}\n`;
    if (c.rating)    response += `⭐ ${c.rating}/5\n`;
    if (c.priceHint) response += `💰 ${c.priceHint}\n`;
    if (c.description) response += `${c.description}\n`;
    if (c.website)   response += `🌐 ${c.website}\n`;
    response += '\n';
  });

  response += `Reply with the *number* of the company you want to use (e.g. *1*), or type *NEW* to search again.`;

  await updateSession(phone, {
    state:   STATES.SHOWING,
    context: { ...details, companies },
  });

  await sendMessage(phone, response, channel);
}

// ─── SHOWING: User picks a company ───────────────────────────────────────────

async function handleShowing(phone, text, session, channel) {
  const lower = text.toLowerCase().trim();

  if (lower === 'cancel') {
    await clearSession(phone);
    return sendMessage(phone, "No problem! Type *hi* to start a new search. 👍", channel);
  }

  if (lower === 'new' || lower === 'search again' || lower === 'back') {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, "Sure! Tell me about your delivery again 👇", channel);
  }

  const choice    = parseInt(text.trim(), 10);
  const companies = session.context?.companies || [];

  if (isNaN(choice) || choice < 1 || choice > companies.length) {
    return sendMessage(phone, `Please reply with a number between 1 and ${companies.length}, or *NEW* to search again.`, channel);
  }

  const selected = companies[choice - 1];
  const context  = session.context;

  // Generate contextual follow-up tips
  const followUp = await generateFollowUp(selected.name, context);

  await updateSession(phone, {
    state:   STATES.FOLLOWUP,
    context: { ...context, selectedCompany: selected },
  });

  let msg = `✅ *Great choice — ${selected.name}!*\n\n`;
  if (selected.phone) msg += `📞 *Call or WhatsApp them:* ${selected.phone}\n`;
  if (selected.website) msg += `🌐 *Website:* ${selected.website}\n\n`;

  if (followUp) {
    msg += followUp + '\n\n';
  }

  msg += `Reply *DONE* when your delivery is sorted, or *NEW* to find another company.`;

  await sendMessage(phone, msg, channel);
}

// ─── FOLLOW UP ────────────────────────────────────────────────────────────────

async function handleFollowUp(phone, text, session, channel) {
  const lower = text.toLowerCase().trim();

  if (lower === 'done' || lower === 'sorted' || lower === 'thanks' || lower === 'thank you') {
    await clearSession(phone);
    return sendMessage(phone, `🎉 Glad we could help! Hope your delivery goes smoothly.

Type *hi* anytime you need to find a courier again. 
*Atlas* is always here 🚀`, channel);
  }

  if (lower === 'new' || lower === 'search again') {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, "Sure! Tell me about your next delivery 👇", channel);
  }

  // Handle any other message as a new question
  await sendMessage(phone, `Need anything else? 

Reply *NEW* to search for another courier, or *DONE* if you're all sorted! 👍`, channel);
}

module.exports = { processMessage };
