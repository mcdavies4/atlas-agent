const { sendMessage } = require('../utils/messenger');
const { getSession, updateSession, clearSession } = require('../utils/session');
const { extractDeliveryDetails, getKnowledgeCompanies, synthesiseResults, generateFollowUp } = require('../ai/claude');
const { searchLogisticsCompanies } = require('../ai/search');

// Existing features
const { getNegotiationTips, getAINegotiationTips, formatTips } = require('../features/negotiation');
const { getSavedAddresses, saveAddress, deleteAddress, resolveAddress, formatAddressList, detectSaveCommand, detectAddressCommands } = require('../features/addresses');
const { detectInternationalIntent, getInternationalOptions, formatInternationalResponse } = require('../features/international');
const { enrichCompaniesWithReviews } = require('../features/reviews');
const { detectPriceComparisonIntent, sortCompanies, formatSortLabel } = require('../features/comparison');
const { detectMultiStopIntent, extractMultiStopDetails, formatMultiStopSummary, getMultiStopSearchContext } = require('../features/multistop');
const { saveSearchHistory, getSearchHistory, getLastSearch, formatHistory, detectHistoryCommand } = require('../features/history');
const { detectScheduledIntent, extractScheduleDetails, formatScheduleNote, getScheduleSearchNote, flagScheduledCompanies } = require('../features/scheduled');

// New features
const { detectHagglingIntent, assessPrice, formatHagglingResponse } = require('../features/haggling');
const { detectFeedbackRating, saveFeedback, getFeedbackPrompt, getFeedbackResponse } = require('../features/feedback');
const { enrichCompaniesWithWhatsApp, formatCompanyContact } = require('../features/whatsapp-detect');
const { detectBusinessIntent, inferBusinessFromContext, getBusinessProfile, saveBusinessProfile, getBusinessRegistrationFlow, parseBusinessRegistration, formatBusinessWelcome, formatBusinessGreeting } = require('../features/business');
const { detectSuggestionIntent, extractCompanySuggestion, saveSuggestion, getSuggestionPrompt, getSuggestionConfirmation } = require('../features/suggestions');

const STATES = {
  IDLE:                'IDLE',
  COLLECTING:          'COLLECTING',
  SHOWING:             'SHOWING',
  FOLLOWUP:            'FOLLOWUP',
  AWAITING_FEEDBACK:   'AWAITING_FEEDBACK',
  REGISTERING_BUSINESS:'REGISTERING_BUSINESS',
  AWAITING_SUGGESTION: 'AWAITING_SUGGESTION',
};

async function processMessage(phone, text, channel = 'whatsapp') {
  const session = await getSession(phone);
  const state   = session?.state || STATES.IDLE;

  console.log('[' + phone + '][' + channel + '] State: ' + state);

  // ── Feedback state ─────────────────────────────────────────────────────────
  if (state === STATES.AWAITING_FEEDBACK) {
    const { isFeedback, rating } = detectFeedbackRating(text);
    if (isFeedback) {
      await saveFeedback(phone, rating, session.context);
      await clearSession(phone);
      return sendMessage(phone, getFeedbackResponse(rating), channel);
    }
    // If they ignore feedback and say something else, let them continue
    await updateSession(phone, { state: STATES.IDLE, context: {} });
  }

  // ── Business registration state ────────────────────────────────────────────
  if (state === STATES.REGISTERING_BUSINESS) {
    const profile = await parseBusinessRegistration(text);
    if (profile) {
      await saveBusinessProfile(phone, profile);
      await updateSession(phone, { state: STATES.IDLE, context: {} });
      return sendMessage(phone, formatBusinessWelcome(profile), channel);
    }
    return sendMessage(phone, `Please share in this format:\n_"Business name, pickup address, business type"_\n\nExample: _"ABC Pharmacy, 12 Wuse 2 Abuja, Pharmacy"_`, channel);
  }

  // ── Company suggestion state ───────────────────────────────────────────────
  if (state === STATES.AWAITING_SUGGESTION) {
    const suggestion = await extractCompanySuggestion(text);
    if (suggestion.success) {
      await saveSuggestion(phone, suggestion);
      await updateSession(phone, { state: STATES.IDLE, context: {} });
      return sendMessage(phone, getSuggestionConfirmation(suggestion.name), channel);
    }
    return sendMessage(phone, `Please share the company name and phone number:\n_"Company name, phone number, city"_`, channel);
  }

  // ── Global commands ────────────────────────────────────────────────────────

  // Business registration
  if (detectBusinessIntent(text)) {
    await updateSession(phone, { state: STATES.REGISTERING_BUSINESS, context: {} });
    return sendMessage(phone, getBusinessRegistrationFlow(), channel);
  }

  // Company suggestion
  if (detectSuggestionIntent(text)) {
    await updateSession(phone, { state: STATES.AWAITING_SUGGESTION, context: session?.context || {} });
    return sendMessage(phone, getSuggestionPrompt(), channel);
  }

  // Address management
  const addrCmd = detectAddressCommands(text);
  if (addrCmd === 'list') {
    const addresses = await getSavedAddresses(phone);
    if (!addresses.length) return sendMessage(phone, `No saved addresses yet.\n\nTo save one: _"Save Wuse 2 as office"_`, channel);
    return sendMessage(phone, `📍 *Your saved addresses:*\n\n${formatAddressList(addresses)}\n\nTo delete: _"Delete office"_`, channel);
  }
  if (addrCmd?.action === 'delete') {
    await deleteAddress(phone, addrCmd.label);
    return sendMessage(phone, `✅ Removed *${addrCmd.label}* from your saved addresses.`, channel);
  }

  // Save address
  const saveCmd = detectSaveCommand(text);
  if (saveCmd.isSaveCommand) {
    if (saveCmd.address) {
      await saveAddress(phone, saveCmd.label, saveCmd.address);
      return sendMessage(phone, `✅ Saved *${saveCmd.address}* as *${saveCmd.label}*.`, channel);
    } else if (session?.context?.pickup) {
      await saveAddress(phone, saveCmd.label, session.context.pickup);
      return sendMessage(phone, `✅ Saved *${session.context.pickup}* as *${saveCmd.label}*.`, channel);
    }
  }

  // History
  const histCmd = detectHistoryCommand(text);
  if (histCmd === 'list') {
    const history = await getSearchHistory(phone);
    if (!history.length) return sendMessage(phone, `No search history yet.`, channel);
    return sendMessage(phone, `🕐 *Recent searches:*\n\n${formatHistory(history)}\n\nSay *repeat last* to redo your most recent search.`, channel);
  }
  if (histCmd === 'repeat') {
    const last = await getLastSearch(phone);
    if (!last) return sendMessage(phone, `No previous searches found.`, channel);
    await sendMessage(phone, `🔄 Repeating: ${last.pickup} → ${last.dropoff}`, channel);
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return processMessage(phone, `Send ${last.item_description || 'package'} from ${last.pickup} to ${last.dropoff} in ${last.city}`, channel);
  }

  // Price comparison sort (when showing results)
  if (state === STATES.SHOWING) {
    const sortMode = detectPriceComparisonIntent(text);
    if (sortMode) {
      const companies = session.context?.companies || [];
      const sorted = sortCompanies(companies, sortMode);
      await updateSession(phone, { state: STATES.SHOWING, context: { ...session.context, companies: sorted } });
      return sendCompanyList(phone, sorted, session.context, channel, formatSortLabel(sortMode));
    }

    // Price haggling while viewing results
    const { isHaggling, quotedPrice } = detectHagglingIntent(text);
    if (isHaggling) {
      const assessment = await assessPrice(quotedPrice, session.context);
      return sendMessage(phone, formatHagglingResponse(assessment, quotedPrice), channel);
    }
  }

  // Price haggling in followup state
  if (state === STATES.FOLLOWUP) {
    const { isHaggling, quotedPrice } = detectHagglingIntent(text);
    if (isHaggling) {
      const assessment = await assessPrice(quotedPrice, session.context);
      return sendMessage(phone, formatHagglingResponse(assessment, quotedPrice), channel);
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
    // Check for business account
    const bizProfile = await getBusinessProfile(phone);
    if (bizProfile) {
      await updateSession(phone, { state: STATES.COLLECTING, context: { pickup: bizProfile.pickup_address, city: bizProfile.city } });
      return sendMessage(phone, formatBusinessGreeting(bizProfile), channel);
    }

    const [addresses, history] = await Promise.all([
      getSavedAddresses(phone),
      getLastSearch(phone),
    ]);

    let welcome = `👋 Welcome to *Atlas* — your AI logistics assistant for Nigeria!\n\nI find the best courier companies for your delivery — with contacts, ratings, prices and reviews.\n\n`;
    if (addresses.length > 0) welcome += `📍 *Saved:* ${formatAddressList(addresses)}\n\n`;
    if (history) welcome += `🕐 *Last search:* ${history.pickup} → ${history.dropoff} · Say *repeat last* to redo\n\n`;
    welcome += `Tell me about your delivery, or try:\n`;
    welcome += `• _"Send documents from Wuse 2 to Gwarinpa"_\n`;
    welcome += `• _"Ship to London"_ for international\n`;
    welcome += `• _"Register my business"_ for business account\n`;
    welcome += `• _"Suggest a company"_ to add a courier`;

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

  // International
  const intlIntent = detectInternationalIntent(text);
  if (intlIntent.isInternational) {
    await sendMessage(phone, `✈️ International to *${intlIntent.destination.toUpperCase()}*. Finding options...`, channel);
    const context = session?.context || {};
    const details = await extractDeliveryDetails(text, context);
    const { companies, tips } = await getInternationalOptions(intlIntent.destination, details);
    await updateSession(phone, { state: STATES.FOLLOWUP, context: { ...details, isInternational: true, destination: intlIntent.destination } });
    return sendMessage(phone, formatInternationalResponse(intlIntent.destination, companies, tips), channel);
  }

  // Multi-stop
  if (detectMultiStopIntent(text)) {
    await sendMessage(phone, `🗺️ Multi-stop detected. Mapping your route...`, channel);
    const multiDetails = await extractMultiStopDetails(text);
    if (!multiDetails.success) {
      return sendMessage(phone, `Couldn't map stops. Try: _"Pick up from Wuse 2 and Garki, deliver to Gwarinpa"_`, channel);
    }
    const stopSummary = formatMultiStopSummary(multiDetails);
    const searchContext = getMultiStopSearchContext(multiDetails);
    await sendMessage(phone, `📋 *Route:*\n${stopSummary}\nSearching...`, channel);

    const [kc, sr] = await Promise.all([
      getKnowledgeCompanies({ ...searchContext, itemDescription: multiDetails.itemDescription }),
      searchLogisticsCompanies(searchContext),
    ]);
    let companies = await synthesiseResults(kc, sr, searchContext);
    companies = await enrichCompaniesWithReviews(companies, sr);
    companies = enrichCompaniesWithWhatsApp(companies);

    const tips = await getNegotiationTips(searchContext, companies);
    await updateSession(phone, { state: STATES.SHOWING, context: { ...searchContext, companies, isMultiStop: true, stopSummary } });
    await saveSearchHistory(phone, searchContext, companies);
    return sendCompanyList(phone, companies, searchContext, channel, null, tips, stopSummary);
  }

  // Resolve saved addresses
  const resolved = await resolveAddress(phone, text);
  let processedText = resolved.resolved ? text.replace(new RegExp(resolved.label, 'gi'), resolved.address) : text;

  // Detect business context
  const isBusinessSender = inferBusinessFromContext(processedText);
  const bizProfile = isBusinessSender ? await getBusinessProfile(phone) : null;
  if (bizProfile && !processedText.toLowerCase().includes(bizProfile.pickup_address.toLowerCase())) {
    processedText = processedText + ` (pickup from ${bizProfile.pickup_address})`;
  }

  // Scheduled
  const hasSchedule = detectScheduledIntent(processedText);
  let schedule = null;
  if (hasSchedule) schedule = await extractScheduleDetails(processedText);

  await sendMessage(phone, "🔍 Searching for the best options...", channel);

  const context = session?.context || {};
  const details = await extractDeliveryDetails(processedText, context);

  if (!details.success) {
    return sendMessage(phone, `Couldn't get that. Please include:\n📍 Pickup · 📍 Dropoff · 📦 Item`, channel);
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
  await sendMessage(phone, "⚡ Checking companies...", channel);

  const [kc, sr] = await Promise.all([
    getKnowledgeCompanies(details),
    searchLogisticsCompanies(details),
  ]);

  let companies = await synthesiseResults(kc, sr, details);
  companies = await enrichCompaniesWithReviews(companies, sr);
  companies = enrichCompaniesWithWhatsApp(companies);
  if (schedule?.hasSchedule) companies = flagScheduledCompanies(companies, schedule);

  if (!companies || companies.length === 0) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, `Couldn't find companies for that route. Try adding the city name.`, channel);
  }

  const tips = await getNegotiationTips(details, companies);
  await updateSession(phone, { state: STATES.SHOWING, context: { ...details, companies, schedule } });
  await saveSearchHistory(phone, details, companies);
  return sendCompanyList(phone, companies, details, channel, null, tips, null, schedule);
}

// ─── SEND COMPANY LIST ────────────────────────────────────────────────────────

async function sendCompanyList(phone, companies, context, channel, sortLabel, tips, stopSummary, schedule) {
  let response = `✅ *Best logistics options:*\n`;
  if (stopSummary) response += `\n📋 *Route:*\n${stopSummary}\n`;
  if (schedule?.hasSchedule) response += `📅 *Scheduled:* ${schedule.dateLabel}${schedule.timeLabel ? ' at ' + schedule.timeLabel : ''}\n`;
  if (context.pickup && context.dropoff) response += `📍 ${context.pickup} → ${context.dropoff}\n`;
  if (sortLabel) response += `${sortLabel}\n`;
  response += '\n';

  companies.forEach((c, i) => {
    response += `*${i + 1}. ${c.name}*\n`;
    response += formatCompanyContact(c) + '\n';
    if (c.rating)        response += `⭐ ${c.rating}/5\n`;
    if (c.priceHint)     response += `💰 ${c.priceHint}\n`;
    if (c.reviewSummary) response += `💬 _${c.reviewSummary}_\n`;
    if (c.scheduledNote) response += `${c.scheduledNote}\n`;
    if (c.multiStopNote) response += `${c.multiStopNote}\n`;
    if (c.website)       response += `🌐 ${c.website}\n`;
    response += '\n';
  });

  if (tips && tips.length > 0) response += formatTips(tips) + '\n\n';

  response += `Reply with a *number* to pick · *cheapest* · *best rated* · *NEW* to search again\n`;
  response += `💡 _Got a quote? Say "they quoted me ₦5,000, is that fair?" and I'll check it._`;

  return sendMessage(phone, response, channel);
}

// ─── SHOWING ──────────────────────────────────────────────────────────────────

async function handleShowing(phone, text, session, channel) {
  const lower = text.toLowerCase().trim();

  if (lower === 'cancel') { await clearSession(phone); return sendMessage(phone, "Cancelled. Type *hi* to start again.", channel); }
  if (['new', 'search again', 'back'].includes(lower)) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, "Tell me about your delivery 👇", channel);
  }

  const choice    = parseInt(text.trim(), 10);
  const companies = session.context?.companies || [];

  if (isNaN(choice) || choice < 1 || choice > companies.length) {
    return sendMessage(phone, `Reply with a number between 1 and ${companies.length}, or *NEW* to search again.`, channel);
  }

  const selected = companies[choice - 1];
  const context  = session.context;
  const aiTips   = await getAINegotiationTips(context, selected.name);

  await updateSession(phone, { state: STATES.FOLLOWUP, context: { ...context, selectedCompany: selected } });

  let msg = `✅ *Great choice — ${selected.name}!*\n\n`;
  msg += formatCompanyContact(selected) + '\n';
  if (selected.website)   msg += `🌐 ${selected.website}\n`;
  if (context.schedule?.hasSchedule) msg += `📅 Mention your time: ${context.schedule.dateLabel}${context.schedule.timeLabel ? ' at ' + context.schedule.timeLabel : ''}\n`;
  msg += '\n';
  if (aiTips) msg += `💡 *Before you call:*\n${aiTips}\n\n`;
  msg += `💾 _Save address? Say "save ${context.pickup} as home"_\n\n`;
  msg += `Reply *DONE* · *NEW* for another search · or share their quote and I'll check if it's fair`;

  return sendMessage(phone, msg, channel);
}

// ─── FOLLOW UP ────────────────────────────────────────────────────────────────

async function handleFollowUp(phone, text, session, channel) {
  const lower = text.toLowerCase().trim();

  if (['done', 'sorted', 'thanks', 'thank you', 'ok thanks', 'great'].includes(lower)) {
    // Ask for feedback before closing
    await updateSession(phone, { state: STATES.AWAITING_FEEDBACK, context: session.context });
    return sendMessage(phone, getFeedbackPrompt(), channel);
  }

  if (['new', 'search again'].includes(lower)) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, "Tell me about your next delivery 👇", channel);
  }

  if (['international', 'ship abroad'].includes(lower)) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, "Where do you want to ship to and what are you sending?", channel);
  }

  if (lower === 'suggest a company') {
    await updateSession(phone, { state: STATES.AWAITING_SUGGESTION, context: session.context });
    return sendMessage(phone, getSuggestionPrompt(), channel);
  }

  return sendMessage(phone,
    `Need anything else?\n\n*NEW* — new search\n*INTERNATIONAL* — ship outside Nigeria\n*my history* — past searches\n*suggest a company* — add a courier\n*DONE* — all sorted 👍`,
    channel);
}

module.exports = { processMessage };
