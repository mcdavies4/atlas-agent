const { sendMessage } = require('../utils/messenger');
const { getSession, updateSession, clearSession } = require('../utils/session');
const { extractDeliveryDetails, getKnowledgeCompanies, synthesiseResults, generateFollowUp } = require('../ai/claude');
const { searchLogisticsCompanies } = require('../ai/search');

// Features
const { getNegotiationTips, getAINegotiationTips, formatTips } = require('../features/negotiation');
const { getSavedAddresses, saveAddress, deleteAddress, resolveAddress, formatAddressList, detectSaveCommand, detectAddressCommands } = require('../features/addresses');
const { detectInternationalIntent, getInternationalOptions, formatInternationalResponse } = require('../features/international');
const { enrichCompaniesWithReviews } = require('../features/reviews');
const { detectPriceComparisonIntent, sortCompanies, formatSortLabel } = require('../features/comparison');
const { detectMultiStopIntent, extractMultiStopDetails, formatMultiStopSummary, getMultiStopSearchContext } = require('../features/multistop');
const { saveSearchHistory, getSearchHistory, getLastSearch, formatHistory, detectHistoryCommand } = require('../features/history');
const { detectScheduledIntent, extractScheduleDetails, formatScheduleNote, getScheduleSearchNote, flagScheduledCompanies } = require('../features/scheduled');

const STATES = {
  IDLE:       'IDLE',
  COLLECTING: 'COLLECTING',
  SHOWING:    'SHOWING',
  FOLLOWUP:   'FOLLOWUP',
};

async function processMessage(phone, text, channel = 'whatsapp') {
  const session = await getSession(phone);
  const state   = session?.state || STATES.IDLE;

  console.log('[' + phone + '][' + channel + '] State: ' + state);

  // ── Global commands (work from any state) ─────────────────────────────────

  // Address management
  const addrCmd = detectAddressCommands(text);
  if (addrCmd === 'list') {
    const addresses = await getSavedAddresses(phone);
    if (!addresses.length) return sendMessage(phone, `You don't have any saved addresses yet.\n\nTo save one:\n_"Save Wuse 2 as office"_`, channel);
    return sendMessage(phone, `📍 *Your saved addresses:*\n\n${formatAddressList(addresses)}\n\nTo delete: _"Delete office"_`, channel);
  }
  if (addrCmd?.action === 'delete') {
    await deleteAddress(phone, addrCmd.label);
    return sendMessage(phone, `✅ Removed *${addrCmd.label}* from your saved addresses.`, channel);
  }

  // Save address command
  const saveCmd = detectSaveCommand(text);
  if (saveCmd.isSaveCommand) {
    if (saveCmd.address) {
      await saveAddress(phone, saveCmd.label, saveCmd.address);
      return sendMessage(phone, `✅ Saved *${saveCmd.address}* as *${saveCmd.label}*.\n\nNext time just say _"from ${saveCmd.label}"_.`, channel);
    } else if (session?.context?.pickup) {
      await saveAddress(phone, saveCmd.label, session.context.pickup);
      return sendMessage(phone, `✅ Saved *${session.context.pickup}* as *${saveCmd.label}*.`, channel);
    }
  }

  // History commands
  const histCmd = detectHistoryCommand(text);
  if (histCmd === 'list') {
    const history = await getSearchHistory(phone);
    if (!history.length) return sendMessage(phone, `No search history yet. Make your first delivery search to get started!`, channel);
    return sendMessage(phone, `🕐 *Your recent searches:*\n\n${formatHistory(history)}\n\nSay *repeat last* to redo your most recent search.`, channel);
  }
  if (histCmd === 'repeat') {
    const last = await getLastSearch(phone);
    if (!last) return sendMessage(phone, `No previous searches found. Tell me about your delivery:`, channel);
    await sendMessage(phone, `🔄 Repeating your last search:\n📍 ${last.pickup} → ${last.dropoff}\n\nSearching...`, channel);
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return processMessage(phone, `Send ${last.item_description || 'package'} from ${last.pickup} to ${last.dropoff} in ${last.city}`, channel);
  }

  // Price comparison sort commands (when already showing results)
  if (state === STATES.SHOWING) {
    const sortMode = detectPriceComparisonIntent(text);
    if (sortMode) {
      const companies = session.context?.companies || [];
      const sorted    = sortCompanies(companies, sortMode);
      await updateSession(phone, { state: STATES.SHOWING, context: { ...session.context, companies: sorted } });
      return sendCompanyList(phone, sorted, session.context, channel, formatSortLabel(sortMode));
    }
  }

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
    const [addresses, history] = await Promise.all([
      getSavedAddresses(phone),
      getLastSearch(phone),
    ]);

    let welcome = `👋 Welcome to *Atlas* — your AI logistics assistant for Nigeria!\n\nI find the best courier companies for your delivery — with contacts, ratings, prices and reviews.\n\n`;

    if (addresses.length > 0) {
      welcome += `📍 *Saved addresses:*\n${formatAddressList(addresses)}\n\n`;
    }

    if (history) {
      welcome += `🕐 *Last search:* ${history.pickup} → ${history.dropoff}\nSay *repeat last* to redo it.\n\n`;
    }

    welcome += `Tell me about your delivery or try:\n`;
    welcome += `• _"Send documents from Wuse 2 to Gwarinpa"_\n`;
    welcome += `• _"Multi-stop: pickup from Garki and Maitama, deliver to Kubwa"_\n`;
    welcome += `• _"Ship to London"_ for international\n`;
    welcome += `• _"Schedule pickup tomorrow 10am from office"_`;

    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, welcome, channel);
  }

  return handleCollecting(phone, text, { state: STATES.COLLECTING, context: {} }, channel);
}

// ─── COLLECTING ───────────────────────────────────────────────────────────────

async function handleCollecting(phone, text, session, channel) {
  if (text.toLowerCase() === 'cancel') {
    await clearSession(phone);
    return sendMessage(phone, "No problem! Type *hi* whenever you need help. 👍", channel);
  }

  // International intent
  const intlIntent = detectInternationalIntent(text);
  if (intlIntent.isInternational) {
    await sendMessage(phone, `✈️ International shipment to *${intlIntent.destination.toUpperCase()}* detected. Finding options...`, channel);
    const context = session?.context || {};
    const details = await extractDeliveryDetails(text, context);
    const { companies, tips } = await getInternationalOptions(intlIntent.destination, details);
    await updateSession(phone, { state: STATES.FOLLOWUP, context: { ...details, isInternational: true, destination: intlIntent.destination } });
    return sendMessage(phone, formatInternationalResponse(intlIntent.destination, companies, tips), channel);
  }

  // Multi-stop intent
  if (detectMultiStopIntent(text)) {
    await sendMessage(phone, `🗺️ Multi-stop delivery detected. Working out your route...`, channel);
    const multiDetails = await extractMultiStopDetails(text);

    if (!multiDetails.success) {
      return sendMessage(phone, `I couldn't map out your stops. Try listing them clearly:\n_"Pick up from Wuse 2 and Garki, deliver to Gwarinpa"_`, channel);
    }

    const stopSummary   = formatMultiStopSummary(multiDetails);
    const searchContext = getMultiStopSearchContext(multiDetails);

    await sendMessage(phone, `📋 *Your route:*\n${stopSummary}\nSearching for companies that handle multi-stop...`, channel);

    const [knowledgeCompanies, searchResults] = await Promise.all([
      getKnowledgeCompanies({ ...searchContext, itemDescription: multiDetails.itemDescription }),
      searchLogisticsCompanies(searchContext),
    ]);

    let companies = await synthesiseResults(knowledgeCompanies, searchResults, searchContext);
    companies     = await enrichCompaniesWithReviews(companies, searchResults);

    // Flag multi-stop capability
    companies = companies.map(c => ({ ...c, multiStopNote: '📍 Confirm multi-stop capability when calling' }));

    const tips = await getNegotiationTips(searchContext, companies);
    await updateSession(phone, { state: STATES.SHOWING, context: { ...searchContext, companies, isMultiStop: true, stopSummary } });
    await saveSearchHistory(phone, searchContext, companies);
    return sendCompanyList(phone, companies, searchContext, channel, null, tips, stopSummary);
  }

  // Resolve saved addresses
  const resolved    = await resolveAddress(phone, text);
  let processedText = resolved.resolved ? text.replace(new RegExp(resolved.label, 'gi'), resolved.address) : text;

  // Detect scheduled intent
  const hasSchedule = detectScheduledIntent(processedText);
  let schedule      = null;
  if (hasSchedule) {
    schedule = await extractScheduleDetails(processedText);
  }

  await sendMessage(phone, "🔍 Searching for the best options...", channel);

  const context = session?.context || {};
  const details = await extractDeliveryDetails(processedText, context);

  if (!details.success) {
    return sendMessage(phone, `I couldn't quite get that. Please include:\n📍 Pickup location\n📍 Drop-off location\n📦 What you're sending`, channel);
  }

  const missing = [];
  if (!details.pickup)  missing.push('📍 *pickup location*');
  if (!details.dropoff) missing.push('📍 *drop-off location*');
  if (missing.length > 0) {
    await updateSession(phone, { state: STATES.COLLECTING, context: { ...context, ...details } });
    return sendMessage(phone, `Almost there! I still need:\n${missing.join('\n')}`, channel);
  }

  const scheduleNote = formatScheduleNote(schedule);
  if (scheduleNote) await sendMessage(phone, scheduleNote, channel);

  await sendMessage(phone, "⚡ Checking companies across the web...", channel);

  const searchNote = getScheduleSearchNote(schedule);

  const [knowledgeCompanies, searchResults] = await Promise.all([
    getKnowledgeCompanies({ ...details, scheduleNote: searchNote }),
    searchLogisticsCompanies({ ...details, scheduleNote: searchNote }),
  ]);

  let companies = await synthesiseResults(knowledgeCompanies, searchResults, details);
  companies     = await enrichCompaniesWithReviews(companies, searchResults);

  if (schedule?.hasSchedule) {
    companies = flagScheduledCompanies(companies, schedule);
  }

  if (!companies || companies.length === 0) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, `Sorry, couldn't find reliable companies for that route. Try adding the city name.`, channel);
  }

  const tips = await getNegotiationTips(details, companies);
  await updateSession(phone, { state: STATES.SHOWING, context: { ...details, companies, schedule } });
  await saveSearchHistory(phone, details, companies);
  return sendCompanyList(phone, companies, details, channel, null, tips, null, schedule);
}

// ─── SEND COMPANY LIST (shared helper) ───────────────────────────────────────

async function sendCompanyList(phone, companies, context, channel, sortLabel, tips, stopSummary, schedule) {
  let response = `✅ *Best logistics options:*\n`;

  if (stopSummary) response += `\n📋 *Route:*\n${stopSummary}\n`;
  if (schedule?.hasSchedule) response += `📅 *Scheduled:* ${schedule.dateLabel}${schedule.timeLabel ? ' at ' + schedule.timeLabel : ''}\n`;
  if (context.pickup && context.dropoff) response += `📍 ${context.pickup} → ${context.dropoff}\n`;
  if (sortLabel) response += `${sortLabel}\n`;
  response += '\n';

  companies.forEach((c, i) => {
    response += `*${i + 1}. ${c.name}*\n`;
    if (c.phone)           response += `📞 ${c.phone}\n`;
    if (c.rating)          response += `⭐ ${c.rating}/5\n`;
    if (c.priceHint)       response += `💰 ${c.priceHint}\n`;
    if (c.reviewSummary)   response += `💬 _${c.reviewSummary}_\n`;
    if (c.description)     response += `${c.description}\n`;
    if (c.scheduledNote)   response += `${c.scheduledNote}\n`;
    if (c.multiStopNote)   response += `${c.multiStopNote}\n`;
    if (c.website)         response += `🌐 ${c.website}\n`;
    response += '\n';
  });

  if (tips && tips.length > 0) response += formatTips(tips) + '\n\n';

  response += `Reply with a *number* to pick (e.g. *1*)\n`;
  response += `Or: *cheapest* · *best rated* · *fastest* · *NEW* to search again`;

  return sendMessage(phone, response, channel);
}

// ─── SHOWING ──────────────────────────────────────────────────────────────────

async function handleShowing(phone, text, session, channel) {
  const lower = text.toLowerCase().trim();

  if (lower === 'cancel') {
    await clearSession(phone);
    return sendMessage(phone, "Cancelled. Type *hi* to start again. 👍", channel);
  }

  if (['new', 'search again', 'back'].includes(lower)) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, "Tell me about your delivery 👇", channel);
  }

  const choice    = parseInt(text.trim(), 10);
  const companies = session.context?.companies || [];

  if (isNaN(choice) || choice < 1 || choice > companies.length) {
    return sendMessage(phone, `Please reply with a number between 1 and ${companies.length}, or *NEW* to search again.`, channel);
  }

  const selected = companies[choice - 1];
  const context  = session.context;

  const aiTips = await getAINegotiationTips(context, selected.name);

  await updateSession(phone, { state: STATES.FOLLOWUP, context: { ...context, selectedCompany: selected } });

  let msg = `✅ *Great choice — ${selected.name}!*\n\n`;
  if (selected.phone)   msg += `📞 *Call or WhatsApp:* ${selected.phone}\n`;
  if (selected.website) msg += `🌐 *Website:* ${selected.website}\n`;
  if (context.schedule?.hasSchedule) msg += `📅 *Mention your scheduled time:* ${context.schedule.dateLabel}${context.schedule.timeLabel ? ' at ' + context.schedule.timeLabel : ''}\n`;
  msg += '\n';

  if (aiTips) msg += `💡 *Before you call:*\n${aiTips}\n\n`;

  msg += `💾 _Save your address? Say "save ${context.pickup} as home"_\n\n`;
  msg += `Reply *DONE* when sorted · *NEW* for another search · *INTERNATIONAL* to ship abroad`;

  return sendMessage(phone, msg, channel);
}

// ─── FOLLOW UP ────────────────────────────────────────────────────────────────

async function handleFollowUp(phone, text, session, channel) {
  const lower = text.toLowerCase().trim();

  if (['done', 'sorted', 'thanks', 'thank you', 'ok thanks', 'great'].includes(lower)) {
    await clearSession(phone);
    return sendMessage(phone, `🎉 Glad we could help! Hope your delivery goes smoothly.\n\nType *hi* anytime.\n*Atlas* is always here 🚀`, channel);
  }

  if (['new', 'search again'].includes(lower)) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, "Tell me about your next delivery 👇", channel);
  }

  if (['international', 'ship abroad'].includes(lower)) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, "Where do you want to ship to and what are you sending?", channel);
  }

  return sendMessage(phone, `Need anything else?\n\n*NEW* — new search\n*INTERNATIONAL* — ship outside Nigeria\n*my history* — past searches\n*DONE* — all sorted 👍`, channel);
}

module.exports = { processMessage };
