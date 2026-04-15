const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── NIGERIAN PUBLIC HOLIDAYS ────────────────────────────────────────────────

const PUBLIC_HOLIDAYS = [
  { month: 1,  day: 1,  name: "New Year's Day" },
  { month: 2,  day: 17, name: 'Democracy Day (observed)' }, // varies
  { month: 4,  day: 18, name: 'Good Friday' },              // approximate
  { month: 4,  day: 21, name: 'Easter Monday' },            // approximate
  { month: 5,  day: 1,  name: 'Workers Day' },
  { month: 6,  day: 12, name: 'Democracy Day' },
  { month: 10, day: 1,  name: 'Independence Day' },
  { month: 12, day: 25, name: 'Christmas Day' },
  { month: 12, day: 26, name: 'Boxing Day' },
];

// Islamic holidays (approximate — vary by moon sighting)
const ISLAMIC_HOLIDAY_WINDOWS = [
  { name: 'Eid al-Fitr',  monthRange: [3, 4],  message: 'Eid al-Fitr period' },
  { name: 'Eid al-Adha', monthRange: [6, 7],  message: 'Eid al-Adha period' },
  { name: 'Maulud',       monthRange: [9, 10], message: 'Maulud (Prophet Birthday) period' },
];

function checkPublicHoliday() {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const day   = now.getDate();

  // Check fixed holidays
  const holiday = PUBLIC_HOLIDAYS.find(h => h.month === month && h.day === day);
  if (holiday) return { isHoliday: true, name: holiday.name, type: 'public' };

  // Check Islamic windows (approximate)
  const islamicWindow = ISLAMIC_HOLIDAY_WINDOWS.find(h =>
    month >= h.monthRange[0] && month <= h.monthRange[1]
  );

  // Check December peak season
  if (month === 12 && day >= 15 && day <= 31) {
    return { isHoliday: false, isPeakSeason: true, message: 'December peak season — prices may be higher and couriers busier than usual.' };
  }

  return { isHoliday: false, isPeakSeason: false };
}

function getHolidayWarning(holidayInfo) {
  if (!holidayInfo) return null;
  if (holidayInfo.isHoliday) {
    return `⚠️ *Note:* Today is *${holidayInfo.name}*. Many courier companies may be closed or operating reduced hours. Call ahead to confirm availability before booking.`;
  }
  if (holidayInfo.isPeakSeason) {
    return `📅 *December peak season:* ${holidayInfo.message}`;
  }
  return null;
}

// ─── FUEL PRICE CONTEXT ───────────────────────────────────────────────────────

// Approximate fuel price thresholds (NGN per litre)
// Atlas uses these to contextualise high quotes
const FUEL_PRICE_CONTEXT = {
  baseline: 650,   // pre-subsidy removal baseline
  current:  1200,  // post-subsidy removal approximate (2024/2025)
  high:     1500,
};

function getFuelContext(quotedPrice, routeType) {
  // Only add fuel context if price seems high
  const isHighPrice = quotedPrice > 8000;
  if (!isHighPrice) return null;

  return `⛽ *Why prices are high right now:* Fuel costs in Nigeria have increased significantly since subsidy removal. This affects all courier rates nationwide — what you're seeing is the current market reality, not overcharging.`;
}

// ─── PIDGIN ENGLISH DETECTION & SUPPORT ──────────────────────────────────────

const PIDGIN_INDICATORS = [
  'abeg', 'wetin', 'dey', 'na', 'oga', 'wahala', 'sabi', 'no be',
  'e don', 'wey', 'comot', 'enter', 'come', 'go deliver', 'carry',
  'make i', 'how far', 'e get', 'no dey', 'bros', 'sis', 'my guy',
];

function detectPidgin(text) {
  const lower = text.toLowerCase();
  const matches = PIDGIN_INDICATORS.filter(word => lower.includes(word));
  return matches.length >= 1;
}

async function translateToPidgin(englishText) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You translate formal English responses into natural Nigerian Pidgin English.
Keep the meaning and all details intact. Use authentic Nigerian Pidgin — warm, friendly, conversational.
Don't translate company names, phone numbers, prices, or addresses.
Keep emojis. Keep the structure (bold, bullet points etc).`,
      messages: [{
        role: 'user',
        content: 'Translate to Nigerian Pidgin: ' + englishText,
      }],
    });
    return response.content[0]?.text?.trim();
  } catch (err) {
    console.error('Pidgin translation error:', err);
    return englishText; // Fall back to English if translation fails
  }
}

async function smartResponse(text, isPidgin, englishText) {
  if (!isPidgin) return englishText;
  return translateToPidgin(englishText);
}

// ─── COMBINED CONTEXT CHECK ───────────────────────────────────────────────────

function getSmartContextWarnings() {
  const warnings = [];
  const holidayInfo = checkPublicHoliday();
  const holidayWarning = getHolidayWarning(holidayInfo);
  if (holidayWarning) warnings.push(holidayWarning);
  return warnings;
}

module.exports = {
  checkPublicHoliday,
  getHolidayWarning,
  getFuelContext,
  detectPidgin,
  translateToPidgin,
  smartResponse,
  getSmartContextWarnings,
};
