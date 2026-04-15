const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Market rate benchmarks by zone (NGN)
const MARKET_RATES = {
  same_city_short:  { min: 1500, max: 4000, label: 'within same area' },
  same_city_medium: { min: 3000, max: 6000, label: 'cross zone same city' },
  same_city_long:   { min: 5000, max: 9000, label: 'long distance same city' },
  interstate_short: { min: 8000, max: 15000, label: 'nearby state' },
  interstate_long:  { min: 15000, max: 35000, label: 'far state' },
};

// Detect haggling intent
function detectHagglingIntent(text) {
  const lower = text.toLowerCase();
  const patterns = [
    /quoted.*₦?([\d,]+)/,
    /charging.*₦?([\d,]+)/,
    /asking.*₦?([\d,]+)/,
    /said.*₦?([\d,]+)/,
    /₦?([\d,]+).*too (much|expensive|high)/,
    /is.*₦?([\d,]+).*fair/,
    /₦?([\d,]+).*good (price|deal)/,
    /they want.*₦?([\d,]+)/,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      const price = parseInt(match[1].replace(/,/g, ''));
      if (price > 0) return { isHaggling: true, quotedPrice: price };
    }
  }

  // Check for standalone price with context
  if (lower.includes('fair') || lower.includes('too much') || lower.includes('expensive') || lower.includes('negotiate')) {
    const priceMatch = text.match(/₦?([\d,]+)/);
    if (priceMatch) {
      return { isHaggling: true, quotedPrice: parseInt(priceMatch[1].replace(/,/g, '')) };
    }
  }

  return { isHaggling: false };
}

async function assessPrice(quotedPrice, deliveryContext) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 350,
      system: `You are a Nigerian logistics pricing expert. You know current market rates for courier deliveries across Nigeria.
Assess if a quoted price is fair, cheap, or expensive for the given route and give a counteroffer if needed.
Be direct and practical. Respond in a friendly, helpful tone like a knowledgeable friend.
Keep response under 80 words.`,
      messages: [{
        role: 'user',
        content: `Quoted price: ₦${quotedPrice.toLocaleString()}
Route: ${deliveryContext?.pickup || 'unknown'} → ${deliveryContext?.dropoff || 'unknown'}
City: ${deliveryContext?.city || 'Nigeria'}
Item: ${deliveryContext?.itemDescription || 'package'} (${deliveryContext?.itemSize || 'small'})

Is this price fair? What should they counter with if it's too high?`,
      }],
    });

    return response.content[0]?.text?.trim();
  } catch (err) {
    console.error('Price assessment error:', err);
    return null;
  }
}

function formatHagglingResponse(assessment, quotedPrice) {
  let msg = `💰 *Price Check: ₦${quotedPrice.toLocaleString()}*\n\n`;
  if (assessment) msg += assessment;
  msg += `\n\n_Reply *NEW* to search for other companies or *DONE* if sorted._`;
  return msg;
}

module.exports = { detectHagglingIntent, assessPrice, formatHagglingResponse };
