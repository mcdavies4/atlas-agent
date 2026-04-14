const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Static tips by context — fast, no API call needed
const STATIC_TIPS = {
  repeat: [
    "Mention you have *regular deliveries* — most Nigerian dispatch companies offer 10–20% discounts for repeat customers.",
    "Ask about a *weekly or monthly rate* if you send more than 4 packages a week.",
  ],
  bulk: [
    "If you're sending multiple items, ask to *bundle them in one trip* — you'll pay one base fee instead of multiple.",
    "Ask if they have a *bulk discount* for 5+ deliveries in a day.",
  ],
  timing: [
    "Avoid peak hours (7–9am, 5–7pm) — *off-peak pickups* are often cheaper and faster.",
    "Same-day bookings made before 10am usually get *better rates* than last-minute afternoon calls.",
  ],
  negotiation: [
    "Always *ask for their best price* — the first quote is rarely the final one in Nigeria.",
    "Mentioning a competitor's price often gets you a *10% reduction* without much pushback.",
    "Cash payment sometimes gets you a small *discount of ₦200–₦500* on the final price.",
  ],
  calling: [
    "Have your *exact pickup and dropoff addresses ready* with a nearby landmark — saves 5 minutes on the call.",
    "Ask for the *rider's WhatsApp number* directly so you can track them.",
    "Confirm the price *before* the rider picks up — never let it be 'we'll sort it on delivery'.",
  ],
};

async function getNegotiationTips(deliveryContext, companies) {
  // Build contextual tips without API call for speed
  const tips = [];

  // Always include calling tips
  tips.push(...STATIC_TIPS.calling);

  // Add negotiation tips
  tips.push(STATIC_TIPS.negotiation[0]);
  tips.push(STATIC_TIPS.negotiation[2]);

  // Context-aware additions
  if (deliveryContext.itemSize === 'large' || deliveryContext.itemSize === 'extra-large') {
    tips.push(...STATIC_TIPS.bulk);
  }

  if (deliveryContext.urgency === 'standard') {
    tips.push(STATIC_TIPS.timing[0]);
  }

  // Shuffle and pick top 4
  const shuffled = tips.sort(() => Math.random() - 0.5).slice(0, 4);
  return shuffled;
}

async function getAINegotiationTips(deliveryContext, selectedCompany) {
  // Use Claude for richer, context-specific tips when user picks a company
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: 'You are a savvy Nigerian logistics expert. Give practical, specific negotiation and communication tips. Be direct and concise. Format as a short list.',
      messages: [{
        role: 'user',
        content: `Give 3 practical tips for someone about to call ${selectedCompany} for a delivery:
From: ${deliveryContext.pickup}
To: ${deliveryContext.dropoff}  
Item: ${deliveryContext.itemDescription || 'package'} (${deliveryContext.itemSize || 'small'})
City: ${deliveryContext.city || 'Abuja'}

Focus on: what to say, how to negotiate price, what info to have ready. Keep each tip under 20 words.`,
      }],
    });

    return response.content[0]?.text?.trim();
  } catch (err) {
    console.error('AI tips error:', err);
    return null;
  }
}

function formatTips(tips) {
  if (!tips || tips.length === 0) return '';
  return `💡 *Tips for getting the best deal:*\n\n` + tips.map(t => `• ${t}`).join('\n');
}

module.exports = { getNegotiationTips, getAINegotiationTips, formatTips };
