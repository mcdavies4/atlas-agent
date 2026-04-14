const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Detect multi-stop intent
function detectMultiStopIntent(text) {
  const lower = text.toLowerCase();
  const keywords = [
    'multiple stops', 'multi stop', 'three locations', 'two locations',
    'pick up from', 'collect from', 'several places', 'different locations',
    'first pick up', 'then pick up', 'also pick up',
    'deliver to multiple', 'multiple deliveries', 'different addresses',
  ];
  return keywords.some(k => lower.includes(k));
}

async function extractMultiStopDetails(userMessage) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `You extract multi-stop delivery details for Nigerian logistics. 
Return ONLY valid JSON with:
- stops: array of {type: "pickup"|"dropoff", location: string, order: number}
- itemDescription: what is being delivered
- city: Nigerian city
- urgency: standard or express
- success: true/false

Example: {"stops":[{"type":"pickup","location":"Wuse 2","order":1},{"type":"pickup","location":"Garki","order":2},{"type":"dropoff","location":"Gwarinpa","order":3}],"itemDescription":"documents","city":"Abuja","urgency":"standard","success":true}`,
      messages: [{
        role: 'user',
        content: 'Extract multi-stop details from: "' + userMessage + '"',
      }],
    });

    const text   = response.content[0]?.text?.trim();
    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    console.error('Multi-stop extraction error:', err);
    return { success: false };
  }
}

function formatMultiStopSummary(details) {
  if (!details.stops || details.stops.length === 0) return '';

  const sorted = details.stops.sort((a, b) => a.order - b.order);
  let summary  = '';

  sorted.forEach((stop, i) => {
    const icon = stop.type === 'pickup' ? '📦 Pickup' : '📍 Dropoff';
    summary += `${i + 1}. ${icon}: ${stop.location}\n`;
  });

  return summary;
}

function getMultiStopSearchContext(details) {
  // Build a simplified context for company search
  const pickups  = details.stops?.filter(s => s.type === 'pickup').map(s => s.location) || [];
  const dropoffs = details.stops?.filter(s => s.type === 'dropoff').map(s => s.location) || [];

  return {
    pickup:          pickups[0]   || '',
    dropoff:         dropoffs[0]  || '',
    allPickups:      pickups,
    allDropoffs:     dropoffs,
    itemDescription: details.itemDescription,
    city:            details.city || 'Abuja',
    urgency:         details.urgency || 'standard',
    isMultiStop:     true,
    stopCount:       details.stops?.length || 0,
  };
}

module.exports = { detectMultiStopIntent, extractMultiStopDetails, formatMultiStopSummary, getMultiStopSearchContext };
