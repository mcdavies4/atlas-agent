const Anthropic = require('@anthropic-ai/sdk');
const { searchLogisticsCompanies } = require('../ai/search');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Vertical definitions ─────────────────────────────────────────────────────

const VERTICALS = {
  food_delivery: {
    keywords: [
      'food delivery', 'deliver food', 'order food', 'restaurant delivery',
      'send food', 'food from', 'meal delivery', 'hungry', 'eat',
      'jollof', 'suya', 'shawarma', 'pizza delivery', 'chinese delivery',
    ],
    icon: '🍔',
    label: 'Food Delivery',
    searchQuery: (city) => `food delivery restaurants ${city} Nigeria order online`,
    systemPrompt: `You find food delivery services and restaurants in Nigerian cities.
Return companies that deliver food — both restaurants with delivery and food delivery apps.
Include: name, phone, delivery areas, minimum order if known, and whether they use their own riders or a delivery app.`,
  },
  moving_house: {
    keywords: [
      'moving house', 'move house', 'moving home', 'relocation', 'moving my things',
      'move my furniture', 'moving apartment', 'pack and move', 'removal company',
      'moving company', 'move office', 'office relocation', 'house move',
    ],
    icon: '🚛',
    label: 'House / Office Move',
    searchQuery: (city) => `removal moving company ${city} Nigeria furniture relocation`,
    systemPrompt: `You find removal and moving companies in Nigerian cities.
Return companies that help people move house or office — with vans, trucks, and packing services.
Include: name, phone, vehicle types, areas covered, and whether they offer packing services.`,
  },
  document_courier: {
    keywords: [
      'legal document', 'court document', 'passport delivery', 'sensitive document',
      'confidential', 'official document', 'certificate delivery', 'agreement delivery',
      'contract delivery', 'notarized', 'legal papers', 'deed', 'affidavit',
    ],
    icon: '📄',
    label: 'Document Courier',
    searchQuery: (city) => `secure document courier delivery ${city} Nigeria legal`,
    systemPrompt: `You find secure document courier services in Nigerian cities.
Return companies that specialise in handling sensitive, legal, or official documents.
Include: name, phone, security measures, whether they provide proof of delivery, and areas covered.`,
  },
  errand_runner: {
    keywords: [
      'errand', 'pick up for me', 'collect for me', 'go and buy', 'buy and bring',
      'run an errand', 'personal shopper', 'go to the market', 'pick up from market',
      'buy groceries', 'pick up my package', 'collect my parcel',
      'proxy shopper', 'agent', 'go and get',
    ],
    icon: '🏃',
    label: 'Errand Runner',
    searchQuery: (city) => `errand runner personal assistant delivery ${city} Nigeria`,
    systemPrompt: `You find errand runners and personal assistants in Nigerian cities.
Return individuals or services that run errands — shopping, collecting items, making pickups.
Include: name, phone/WhatsApp, areas covered, what errands they do, and typical rates.`,
  },
};

// ─── Detection ────────────────────────────────────────────────────────────────

function detectVertical(text) {
  const lower = text.toLowerCase();

  for (const [key, vertical] of Object.entries(VERTICALS)) {
    if (vertical.keywords.some(k => lower.includes(k))) {
      return { isVertical: true, vertical: key, config: vertical };
    }
  }

  return { isVertical: false };
}

// ─── Search for vertical ──────────────────────────────────────────────────────

async function searchVertical(verticalKey, city, extraContext) {
  const config = VERTICALS[verticalKey];
  if (!config) return [];

  const query = config.searchQuery(city || 'Abuja');

  try {
    const searchResults = await searchLogisticsCompanies({
      pickup: city || 'Abuja',
      dropoff: city || 'Abuja',
      city: city || 'Abuja',
      customQuery: query,
    });

    // Use Claude to extract and format results for this vertical
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: config.systemPrompt + '\n\nAlways return ONLY valid JSON: {"companies":[{"name":"...","phone":"...","description":"...","website":"...","rating":4.5,"priceHint":"..."}]}',
      messages: [{
        role: 'user',
        content: `Find ${config.label} services in ${city || 'Abuja'}, Nigeria.
Context: ${extraContext || ''}
Search results for context: ${JSON.stringify(searchResults.slice(0, 5))}

Return top 4 options.`,
      }],
    });

    const parsed = JSON.parse(response.content[0]?.text?.trim());
    return parsed.companies || [];
  } catch (err) {
    console.error('Vertical search error:', err);
    return [];
  }
}

// ─── Format vertical response ─────────────────────────────────────────────────

function formatVerticalResponse(verticalKey, companies, city, context) {
  const config = VERTICALS[verticalKey];
  if (!companies || companies.length === 0) {
    return `Sorry, I couldn't find ${config.label.toLowerCase()} services in ${city || 'your area'} right now. Try searching Google for "${config.searchQuery(city)}".`;
  }

  let msg = `${config.icon} *${config.label} in ${city || 'your area'}:*\n\n`;

  companies.forEach((c, i) => {
    msg += `*${i + 1}. ${c.name}*\n`;
    if (c.phone)       msg += `📞 ${c.phone}\n`;
    if (c.rating)      msg += `⭐ ${c.rating}/5\n`;
    if (c.priceHint)   msg += `💰 ${c.priceHint}\n`;
    if (c.description) msg += `${c.description}\n`;
    if (c.website)     msg += `🌐 ${c.website}\n`;
    msg += '\n';
  });

  msg += `Reply with a *number* to get more details, or *NEW* to search something else.`;
  return msg;
}

module.exports = { detectVertical, searchVertical, formatVerticalResponse, VERTICALS };
