const { sendMessage } = require('../utils/messenger');
const { getSession, updateSession, clearSession } = require('../utils/session');
const { extractDeliveryDetails, getKnowledgeCompanies, synthesiseResults } = require('../ai/claude');
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
const { detectHagglingIntent, assessPrice, formatHagglingResponse } = require('../features/haggling');
const { detectFeedbackRating, saveFeedback, getFeedbackPrompt, getFeedbackResponse, getPositiveFollowUp, parseCompanyDetails, saveVerifiedCompany, getCompanySaveConfirmation, getSkipResponse } = require('../features/feedback');
const { enrichCompaniesWithWhatsApp, formatCompanyContact } = require('../features/whatsapp-detect');
const { detectBusinessIntent, inferBusinessFromContext, getBusinessProfile, saveBusinessProfile, getBusinessRegistrationFlow, parseBusinessRegistration, formatBusinessWelcome, formatBusinessGreeting } = require('../features/business');
const { detectSuggestionIntent, extractCompanySuggestion, saveSuggestion, getSuggestionPrompt, getSuggestionConfirmation } = require('../features/suggestions');

// New features
const { detectVertical, searchVertical, formatVerticalResponse } = require('../features/verticals');
const { detectPidgin, smartResponse, getSmartContextWarnings, getFuelContext } = require('../features/smart-context');
const { detectPreferredCompanyCommand, getPreferredCompany, setPreferredCompany, clearPreferredCompany, pinPreferredToTop, detectContactCommand, detectContactReference, getContacts, saveContact, deleteContact, formatContactList } = require('../features/personalisation');

const STATES = {
  IDLE:                    'IDLE',
  COLLECTING:              'COLLECTING',
  SHOWING:                 'SHOWING',
  FOLLOWUP:                'FOLLOWUP',
  AWAITING_FEEDBACK:       'AWAITING_FEEDBACK',
  AWAITING_COMPANY_DETAILS:'AWAITING_COMPANY_DETAILS',
  REGISTERING_BUSINESS:    'REGISTERING_BUSINESS',
  AWAITING_SUGGESTION:     'AWAITING_SUGGESTION',
};

async function processMessage(phone, text, channel = 'whatsapp') {
  const session  = await getSession(phone);
  const state    = session?.state || STATES.IDLE;
  const isPidgin = detectPidgin(text);

  console.log('[' + phone + '][' + channel + '] State: ' + state + (isPidgin ? ' [pidgin]' : ''));

  // Helper: send with optional pidgin translation
  const reply = async (msg) => {
    const finalMsg = isPidgin ? await smartResponse(text, true, msg) : msg;
    return sendMessage(phone, finalMsg, channel);
  };

  // ── Feedback state ──────────────────────────────────────────────────────────
  if (state === STATES.AWAITING_FEEDBACK) {
    const { isFeedback, rating } = detectFeedbackRating(text);
    if (isFeedback) {
      await saveFeedback(phone, rating, session.context);

      if (rating >= 4) {
        // Positive rating — ask for company details
        const companyName = session.context?.selectedCompany?.name || null;
        const followUp    = getPositiveFollowUp(rating, companyName);
        await updateSession(phone, {
          state:   STATES.AWAITING_COMPANY_DETAILS,
          context: { ...session.context, feedbackRating: rating },
        });
        return reply(followUp);
      } else {
        // Low rating — close out
        const response = getFeedbackResponse(rating);
        await clearSession(phone);
        return reply(response);
      }
    }
    await updateSession(phone, { state: STATES.IDLE, context: {} });
  }

  // ── Company details state ───────────────────────────────────────────────────
  if (state === STATES.AWAITING_COMPANY_DETAILS) {
    const companyName = session.context?.selectedCompany?.name || null;
    const { skipped, name, phone: companyPhone } = parseCompanyDetails(text, companyName);

    if (skipped) {
      await clearSession(phone);
      return reply(getSkipResponse());
    }

    // Save the company data
    await saveVerifiedCompany(phone, { name, phone: companyPhone }, session.context);
    await clearSession(phone);
    return reply(getCompanySaveConfirmation(name || companyName));
  }

  // ── Business registration state ─────────────────────────────────────────────
  if (state === STATES.REGISTERING_BUSINESS) {
    const profile = await parseBusinessRegistration(text);
    if (profile) {
      await saveBusinessProfile(phone, profile);
      await updateSession(phone, { state: STATES.IDLE, context: {} });
      return reply(formatBusinessWelcome(profile));
    }
    return reply(`Please share in this format:\n_"Business name, pickup address, business type"_\n\nExample: _"ABC Pharmacy, 12 Wuse 2 Abuja, Pharmacy"_`);
  }

  // ── Company suggestion state ────────────────────────────────────────────────
  if (state === STATES.AWAITING_SUGGESTION) {
    const suggestion = await extractCompanySuggestion(text);
    if (suggestion.success) {
      await saveSuggestion(phone, suggestion);
      await updateSession(phone, { state: STATES.IDLE, context: {} });
      return reply(getSuggestionConfirmation(suggestion.name));
    }
    return reply(`Please share: _"Company name, phone number, city"_`);
  }

  // ── Global commands ─────────────────────────────────────────────────────────

  // Preferred company
  const prefCmd = detectPreferredCompanyCommand(text);
  if (prefCmd) {
    if (prefCmd.action === 'set') {
      await setPreferredCompany(phone, prefCmd.company);
      return reply(`✅ Got it! I'll always show *${prefCmd.company}* first in your results.\n\nSay "remove preferred" to clear this.`);
    }
    if (prefCmd.action === 'clear') {
      await clearPreferredCompany(phone);
      return reply(`✅ Preferred courier cleared. I'll show all results by default.`);
    }
    if (prefCmd.action === 'view') {
      const pref = await getPreferredCompany(phone);
      return reply(pref ? `⭐ Your preferred courier: *${pref}*\n\nSay "remove preferred" to clear.` : `You haven't set a preferred courier yet.\n\nSay _"Always show me GIG first"_ to set one.`);
    }
  }

  // Contact book
  const contactCmd = detectContactCommand(text);
  if (contactCmd) {
    if (contactCmd.action === 'list') {
      const contacts = await getContacts(phone);
      if (!contacts.length) return reply(`No contacts saved yet.\n\nTo save one: _"Emeka lives at 5 Wuse 2 Abuja"_`);
      return reply(`📒 *Your contacts:*\n\n${formatContactList(contacts)}\n\nSay _"send to Emeka"_ to use a contact in your next search.`);
    }
    if (contactCmd.action === 'save') {
      await saveContact(phone, contactCmd.name, contactCmd.address);
      return reply(`✅ Saved *${contactCmd.name}* — ${contactCmd.address}\n\nNext time say _"deliver to ${contactCmd.name}"_ and I'll know the address.`);
    }
    if (contactCmd.action === 'delete') {
      await deleteContact(phone, contactCmd.name);
      return reply(`✅ Removed *${contactCmd.name}* from your contacts.`);
    }
  }

  // Business registration
  if (detectBusinessIntent(text)) {
    await updateSession(phone, { state: STATES.REGISTERING_BUSINESS, context: {} });
    return reply(getBusinessRegistrationFlow());
  }

  // Company suggestion
  if (detectSuggestionIntent(text)) {
    await updateSession(phone, { state: STATES.AWAITING_SUGGESTION, context: session?.context || {} });
    return reply(getSuggestionPrompt());
  }

  // Address management
  const addrCmd = detectAddressCommands(text);
  if (addrCmd === 'list') {
    const addresses = await getSavedAddresses(phone);
    if (!addresses.length) return reply(`No saved addresses yet.\n\nTo save: _"Save Wuse 2 as office"_`);
    return reply(`📍 *Your saved addresses:*\n\n${formatAddressList(addresses)}\n\nTo delete: _"Delete office"_`);
  }
  if (addrCmd?.action === 'delete') {
    await deleteAddress(phone, addrCmd.label);
    return reply(`✅ Removed *${addrCmd.label}*.`);
  }

  // Save address
  const saveCmd = detectSaveCommand(text);
  if (saveCmd.isSaveCommand) {
    if (saveCmd.address) {
      await saveAddress(phone, saveCmd.label, saveCmd.address);
      return reply(`✅ Saved *${saveCmd.address}* as *${saveCmd.label}*.`);
    } else if (session?.context?.pickup) {
      await saveAddress(phone, saveCmd.label, session.context.pickup);
      return reply(`✅ Saved *${session.context.pickup}* as *${saveCmd.label}*.`);
    }
  }

  // History
  const histCmd = detectHistoryCommand(text);
  if (histCmd === 'list') {
    const history = await getSearchHistory(phone);
    if (!history.length) return reply(`No search history yet.`);
    return reply(`🕐 *Recent searches:*\n\n${formatHistory(history)}\n\nSay *repeat last* to redo your most recent search.`);
  }
  if (histCmd === 'repeat') {
    const last = await getLastSearch(phone);
    if (!last) return reply(`No previous searches found.`);
    await reply(`🔄 Repeating: ${last.pickup} → ${last.dropoff}`);
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return processMessage(phone, `Send ${last.item_description || 'package'} from ${last.pickup} to ${last.dropoff} in ${last.city}`, channel);
  }

  // Sort commands when showing results
  if (state === STATES.SHOWING) {
    const sortMode = detectPriceComparisonIntent(text);
    if (sortMode) {
      const companies = session.context?.companies || [];
      const sorted = sortCompanies(companies, sortMode);
      await updateSession(phone, { state: STATES.SHOWING, context: { ...session.context, companies: sorted } });
      return sendCompanyList(phone, sorted, session.context, channel, formatSortLabel(sortMode), null, null, null, isPidgin);
    }
  }

  // Price haggling
  if ([STATES.SHOWING, STATES.FOLLOWUP].includes(state)) {
    const { isHaggling, quotedPrice } = detectHagglingIntent(text);
    if (isHaggling) {
      const assessment = await assessPrice(quotedPrice, session.context);
      const fuelNote   = getFuelContext(quotedPrice);
      let msg = formatHagglingResponse(assessment, quotedPrice);
      if (fuelNote) msg += '\n\n' + fuelNote;
      return reply(msg);
    }
  }

  switch (state) {
    case STATES.IDLE:       return handleIdle(phone, text, session, channel, isPidgin, reply);
    case STATES.COLLECTING: return handleCollecting(phone, text, session, channel, isPidgin, reply);
    case STATES.SHOWING:    return handleShowing(phone, text, session, channel, isPidgin, reply);
    case STATES.FOLLOWUP:   return handleFollowUp(phone, text, session, channel, isPidgin, reply);
    default:                return handleIdle(phone, text, session, channel, isPidgin, reply);
  }
}

// ─── IDLE ─────────────────────────────────────────────────────────────────────

async function handleIdle(phone, text, session, channel, isPidgin, reply) {
  const lower = text.toLowerCase();

  if (['hi', 'hello', 'start', 'hey', 'hiya', 'help', 'how far'].some(k => lower.includes(k)) || !session) {
    const bizProfile = await getBusinessProfile(phone);
    if (bizProfile) {
      await updateSession(phone, { state: STATES.COLLECTING, context: { pickup: bizProfile.pickup_address } });
      return reply(formatBusinessGreeting(bizProfile));
    }

    const [addresses, history, contacts] = await Promise.all([
      getSavedAddresses(phone),
      getLastSearch(phone),
      getContacts(phone),
    ]);

    // Check for holiday warnings
    const warnings = getSmartContextWarnings();

    let welcome = isPidgin
      ? `👋 How far! Na *Atlas* be dis — your AI logistics helper for Nigeria!\n\nI go find the best courier companies for your delivery — with their numbers, ratings, prices and reviews.\n\n`
      : `👋 Welcome to *Atlas* — your AI logistics assistant for Nigeria!\n\nI find the best courier companies for your delivery — with contacts, ratings, prices and reviews.\n\n`;

    if (warnings.length > 0) welcome += warnings.join('\n') + '\n\n';
    if (addresses.length > 0) welcome += `📍 *Saved:* ${formatAddressList(addresses)}\n\n`;
    if (contacts.length > 0)  welcome += `📒 *Contacts:* ${contacts.map(c => c.name).join(', ')}\n\n`;
    if (history) welcome += `🕐 *Last:* ${history.pickup} → ${history.dropoff} · Say *repeat last*\n\n`;

    welcome += isPidgin
      ? `Wetin you want send? Tell me pickup and dropoff:\n• _"I wan send documents from Wuse 2 go Gwarinpa"_\n• _"Food delivery for Lekki"_\n• _"I dey move house"_\n• _"Ship go London"_`
      : `Tell me about your delivery:\n• _"Send documents from Wuse 2 to Gwarinpa"_\n• _"Food delivery in Lekki"_\n• _"I'm moving house"_\n• _"Ship to London"_ for international`;

    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return sendMessage(phone, welcome, channel);
  }

  return handleCollecting(phone, text, { state: STATES.COLLECTING, context: {} }, channel, isPidgin, reply);
}

// ─── COLLECTING ───────────────────────────────────────────────────────────────

async function handleCollecting(phone, text, session, channel, isPidgin, reply) {
  if (['cancel', 'stop', 'comot'].includes(text.toLowerCase().trim())) {
    await clearSession(phone);
    return reply("No problem! Type *hi* whenever you need help. 👍");
  }

  // ── Check verticals first ──────────────────────────────────────────────────
  const { isVertical, vertical, config } = detectVertical(text);
  if (isVertical) {
    await reply(`${config.icon} *${config.label}* detected. Searching...`);
    const context   = session?.context || {};
    const details   = await extractDeliveryDetails(text, context);
    const companies = await searchVertical(vertical, details.city || 'Abuja', text);
    await updateSession(phone, { state: STATES.FOLLOWUP, context: { ...details, vertical } });
    return reply(formatVerticalResponse(vertical, companies, details.city || 'Abuja', details));
  }

  // International
  const intlIntent = detectInternationalIntent(text);
  if (intlIntent.isInternational) {
    await reply(`✈️ International to *${intlIntent.destination.toUpperCase()}*. Finding options...`);
    const context = session?.context || {};
    const details = await extractDeliveryDetails(text, context);
    const { companies, tips } = await getInternationalOptions(intlIntent.destination, details);
    await updateSession(phone, { state: STATES.FOLLOWUP, context: { ...details, isInternational: true } });
    return reply(formatInternationalResponse(intlIntent.destination, companies, tips));
  }

  // Multi-stop
  if (detectMultiStopIntent(text)) {
    await reply(`🗺️ Multi-stop detected. Mapping your route...`);
    const multiDetails = await extractMultiStopDetails(text);
    if (!multiDetails.success) return reply(`Couldn't map stops. Try: _"Pick up from Wuse 2 and Garki, deliver to Gwarinpa"_`);

    const stopSummary   = formatMultiStopSummary(multiDetails);
    const searchContext = getMultiStopSearchContext(multiDetails);
    await reply(`📋 *Route:*\n${stopSummary}\nSearching...`);

    const [kc, sr] = await Promise.all([
      getKnowledgeCompanies({ ...searchContext, itemDescription: multiDetails.itemDescription }),
      searchLogisticsCompanies(searchContext),
    ]);
    let companies = await synthesiseResults(kc, sr, searchContext);
    companies = await enrichCompaniesWithReviews(companies, sr);
    companies = enrichCompaniesWithWhatsApp(companies);
    const preferred = await getPreferredCompany(phone);
    if (preferred) companies = pinPreferredToTop(companies, preferred);

    const tips = await getNegotiationTips(searchContext, companies);
    await updateSession(phone, { state: STATES.SHOWING, context: { ...searchContext, companies, isMultiStop: true, stopSummary } });
    await saveSearchHistory(phone, searchContext, companies);
    return sendCompanyList(phone, companies, searchContext, channel, null, tips, stopSummary, null, isPidgin);
  }

  // Resolve saved addresses
  const resolved = await resolveAddress(phone, text);
  let processedText = resolved.resolved
    ? text.replace(new RegExp(resolved.label, 'gi'), resolved.address)
    : text;

  // Resolve contacts
  const contacts = await getContacts(phone);
  const contactRef = detectContactReference(processedText, contacts);
  if (contactRef) {
    processedText = processedText.replace(new RegExp(contactRef.name, 'gi'), contactRef.address);
  }

  // Business context
  const bizProfile = await getBusinessProfile(phone);
  if (bizProfile && !processedText.toLowerCase().includes(bizProfile.pickup_address.toLowerCase())) {
    processedText += ` (pickup from ${bizProfile.pickup_address})`;
  }

  // Scheduled
  let schedule = null;
  if (detectScheduledIntent(processedText)) {
    schedule = await extractScheduleDetails(processedText);
  }

  await reply("🔍 Searching for the best options...");

  const context = session?.context || {};
  const details = await extractDeliveryDetails(processedText, context);

  if (!details.success) {
    return reply(`Couldn't get that. Please include:\n📍 Pickup · 📍 Dropoff · 📦 Item`);
  }

  const missing = [];
  if (!details.pickup)  missing.push('📍 *pickup location*');
  if (!details.dropoff) missing.push('📍 *drop-off location*');
  if (missing.length > 0) {
    await updateSession(phone, { state: STATES.COLLECTING, context: { ...context, ...details } });
    return reply(`Almost there! I still need:\n${missing.join('\n')}`);
  }

  const scheduleNote = formatScheduleNote(schedule);
  if (scheduleNote) await reply(scheduleNote);

  // Check for holiday warnings
  const warnings = getSmartContextWarnings();
  if (warnings.length > 0) await reply(warnings.join('\n'));

  await reply("⚡ Checking companies...");

  const [kc, sr] = await Promise.all([
    getKnowledgeCompanies(details),
    searchLogisticsCompanies(details),
  ]);

  let companies = await synthesiseResults(kc, sr, details);
  companies = await enrichCompaniesWithReviews(companies, sr);
  companies = enrichCompaniesWithWhatsApp(companies);
  if (schedule?.hasSchedule) companies = flagScheduledCompanies(companies, schedule);

  // Pin preferred company to top
  const preferred = await getPreferredCompany(phone);
  if (preferred) companies = pinPreferredToTop(companies, preferred);

  if (!companies || companies.length === 0) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return reply(`Couldn't find companies for that route. Try adding the city name.`);
  }

  const tips = await getNegotiationTips(details, companies);
  await updateSession(phone, { state: STATES.SHOWING, context: { ...details, companies, schedule } });
  await saveSearchHistory(phone, details, companies);
  return sendCompanyList(phone, companies, details, channel, null, tips, null, schedule, isPidgin);
}

// ─── SEND COMPANY LIST ────────────────────────────────────────────────────────

async function sendCompanyList(phone, companies, context, channel, sortLabel, tips, stopSummary, schedule, isPidgin) {
  let response = `✅ *Best logistics options:*\n`;
  if (stopSummary) response += `\n📋 *Route:*\n${stopSummary}\n`;
  if (schedule?.hasSchedule) response += `📅 ${schedule.dateLabel}${schedule.timeLabel ? ' at ' + schedule.timeLabel : ''}\n`;
  if (context.pickup && context.dropoff) response += `📍 ${context.pickup} → ${context.dropoff}\n`;
  if (sortLabel) response += `${sortLabel}\n`;
  response += '\n';

  companies.forEach((c, i) => {
    if (c.isPinned) response += `⭐ *${i + 1}. ${c.name}* _(preferred)_\n`;
    else response += `*${i + 1}. ${c.name}*\n`;
    response += formatCompanyContact(c) + '\n';
    if (c.rating)        response += `⭐ ${c.rating}/5\n`;
    if (c.priceHint)     response += `💰 ${c.priceHint}\n`;
    if (c.reviewSummary) response += `💬 _${c.reviewSummary}_\n`;
    if (c.scheduledNote) response += `${c.scheduledNote}\n`;
    if (c.website)       response += `🌐 ${c.website}\n`;
    response += '\n';
  });

  if (tips && tips.length > 0) response += formatTips(tips) + '\n\n';

  response += `Reply *number* to pick · *cheapest* · *best rated* · *NEW* to search again\n`;
  response += `💡 _Got a quote? Say "they quoted me ₦5,000, is that fair?"_`;

  if (isPidgin) {
    const { smartResponse } = require('../features/smart-context');
    const pidginResponse = await smartResponse(null, true, response);
    return sendMessage(phone, pidginResponse, channel);
  }

  return sendMessage(phone, response, channel);
}

// ─── SHOWING ──────────────────────────────────────────────────────────────────

async function handleShowing(phone, text, session, channel, isPidgin, reply) {
  const lower = text.toLowerCase().trim();

  if (['cancel', 'comot'].includes(lower)) { await clearSession(phone); return reply("Cancelled. Type *hi* to start again."); }
  if (['new', 'search again', 'back', 'another'].includes(lower)) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return reply("Tell me about your delivery 👇");
  }

  const choice    = parseInt(text.trim(), 10);
  const companies = session.context?.companies || [];

  if (isNaN(choice) || choice < 1 || choice > companies.length) {
    return reply(`Reply with a number between 1 and ${companies.length}, or *NEW* to search again.`);
  }

  const selected = companies[choice - 1];
  const context  = session.context;
  const aiTips   = await getAINegotiationTips(context, selected.name);

  await updateSession(phone, { state: STATES.FOLLOWUP, context: { ...context, selectedCompany: selected } });

  // Fix: update search history with the actually selected company
  const { supabase } = require('../utils/supabase');
  await supabase
    .from('search_history')
    .update({ top_company: selected.name, selected_company: selected.name })
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .then(() => {})
    .catch(err => console.error('Search history update error:', err));

  let msg = `✅ *Great choice — ${selected.name}!*\n\n`;
  msg += formatCompanyContact(selected) + '\n';
  if (selected.website)   msg += `🌐 ${selected.website}\n`;
  if (context.schedule?.hasSchedule) msg += `📅 Mention your time: ${context.schedule.dateLabel}\n`;
  msg += '\n';
  if (aiTips) msg += `💡 *Before you call:*\n${aiTips}\n\n`;
  msg += `💾 _Save address? "save ${context.pickup} as home"_\n`;
  msg += `👤 _Save recipient? "Emeka lives at ${context.dropoff}"_\n\n`;
  msg += `Reply *DONE* · *NEW* for another search · or share their quote to check if it's fair`;

  return reply(msg);
}

// ─── FOLLOW UP ────────────────────────────────────────────────────────────────

async function handleFollowUp(phone, text, session, channel, isPidgin, reply) {
  const lower = text.toLowerCase().trim();

  if (['done', 'sorted', 'thanks', 'thank you', 'ok', 'great', 'e don do'].includes(lower)) {
    await updateSession(phone, { state: STATES.AWAITING_FEEDBACK, context: session.context });
    return reply(getFeedbackPrompt());
  }
  if (['new', 'search again', 'another', 'abeg another'].includes(lower)) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return reply("Tell me about your next delivery 👇");
  }
  if (['international', 'ship abroad'].includes(lower)) {
    await updateSession(phone, { state: STATES.COLLECTING, context: {} });
    return reply("Where do you want to ship to and what are you sending?");
  }
  if (lower === 'suggest a company') {
    await updateSession(phone, { state: STATES.AWAITING_SUGGESTION, context: session.context });
    return reply(getSuggestionPrompt());
  }

  return reply(
    `Need anything else?\n\n*NEW* — new search\n*INTERNATIONAL* — ship outside Nigeria\n*my history* — past searches\n*my contacts* — saved recipients\n*suggest a company* — add a courier\n*DONE* — all sorted 👍`
  );
}

module.exports = { processMessage };
