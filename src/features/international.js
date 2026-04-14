const Anthropic = require('@anthropic-ai/sdk');
const { searchLogisticsCompanies } = require('../ai/search');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Known international shipping companies with Nigeria presence
const INTL_CARRIERS = {
  dhl: {
    name: 'DHL Express Nigeria',
    phone: '01-2700-345',
    website: 'dhl.com/ng',
    description: 'Fastest international option. Premium pricing but most reliable.',
    strengths: ['fastest', 'tracking', 'reliable', 'customs support'],
  },
  fedex: {
    name: 'FedEx Nigeria',
    phone: '01-2798-000',
    website: 'fedex.com/ng',
    description: 'Strong for US deliveries. Good tracking and customs handling.',
    strengths: ['usa', 'tracking', 'business'],
  },
  ups: {
    name: 'UPS Nigeria',
    phone: '01-4617-135',
    website: 'ups.com/ng',
    description: 'Reliable for Europe and North America routes.',
    strengths: ['europe', 'usa', 'business'],
  },
  aramex: {
    name: 'Aramex Nigeria',
    phone: '01-2790-888',
    website: 'aramex.com/ng',
    description: 'Competitive rates, strong in Middle East and Africa routes.',
    strengths: ['middle east', 'africa', 'affordable'],
  },
  uan: {
    name: 'UAN (United African Network)',
    phone: '0700-225-5000',
    website: 'uan.com.ng',
    description: 'Nigerian carrier with good rates to UK and US.',
    strengths: ['uk', 'usa', 'affordable', 'nigerian'],
  },
  gig: {
    name: 'GIG Logistics',
    phone: '07080601000',
    website: 'giglogistics.com',
    description: 'Nigerian company with international shipping to UK, US, Canada.',
    strengths: ['uk', 'usa', 'canada', 'nigerian', 'affordable'],
  },
};

// Detect international shipping intent
function detectInternationalIntent(text) {
  const lower = text.toLowerCase();
  const intlKeywords = [
    'uk', 'united kingdom', 'england', 'london',
    'usa', 'united states', 'america', 'us',
    'canada', 'australia', 'germany', 'france',
    'europe', 'abroad', 'international', 'overseas',
    'outside nigeria', 'foreign', 'diaspora',
    'send to', 'ship to',
  ];

  const destinationPattern = intlKeywords.some(k => lower.includes(k));
  if (!destinationPattern) return { isInternational: false };

  // Extract destination country
  const destinations = {
    uk: ['uk', 'united kingdom', 'england', 'london', 'britain'],
    usa: ['usa', 'united states', 'america', ' us '],
    canada: ['canada'],
    australia: ['australia'],
    europe: ['europe', 'germany', 'france', 'italy', 'spain'],
    'middle east': ['dubai', 'uae', 'saudi', 'qatar', 'middle east'],
  };

  let destination = 'international';
  for (const [dest, keywords] of Object.entries(destinations)) {
    if (keywords.some(k => lower.includes(k))) {
      destination = dest;
      break;
    }
  }

  return { isInternational: true, destination };
}

async function getInternationalOptions(destination, itemContext) {
  // Filter carriers by destination strength
  const relevant = Object.values(INTL_CARRIERS).filter(carrier => {
    if (destination === 'international') return true;
    return carrier.strengths.some(s => destination.includes(s) || s.includes(destination));
  });

  // Always include DHL and GIG as fallbacks
  const companies = relevant.length >= 2 ? relevant : Object.values(INTL_CARRIERS).slice(0, 4);

  // Get AI-generated context and tips
  const tips = await getInternationalTips(destination, itemContext);

  return { companies, tips };
}

async function getInternationalTips(destination, itemContext) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: 'You are a Nigerian international shipping expert. Give practical, accurate advice. Be concise.',
      messages: [{
        role: 'user',
        content: `Give 4 practical tips for someone in Nigeria shipping to ${destination}:
Item: ${itemContext?.itemDescription || 'package'} (${itemContext?.itemSize || 'small'})

Cover: typical transit time, rough price range in USD or GBP, customs tips, documentation needed.
Keep each tip under 25 words. Format as bullet points.`,
      }],
    });

    return response.content[0]?.text?.trim();
  } catch (err) {
    console.error('International tips error:', err);
    return null;
  }
}

function formatInternationalResponse(destination, companies, tips) {
  let msg = `✈️ *International Shipping to ${destination.toUpperCase()}*\n\n`;
  msg += `Here are the best options from Nigeria:\n\n`;

  companies.forEach((c, i) => {
    msg += `*${i + 1}. ${c.name}*\n`;
    msg += `📞 ${c.phone}\n`;
    msg += `🌐 ${c.website}\n`;
    msg += `${c.description}\n\n`;
  });

  if (tips) {
    msg += `📋 *What you need to know:*\n${tips}\n\n`;
  }

  msg += `💡 *Tip:* Always compare quotes from at least 2 carriers — prices vary significantly for international shipments.\n\n`;
  msg += `Reply *DONE* when sorted or *NEW* to search again.`;

  return msg;
}

module.exports = {
  detectInternationalIntent,
  getInternationalOptions,
  formatInternationalResponse,
};
