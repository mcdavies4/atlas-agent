const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are Atlas, an AI logistics concierge for Nigeria. You help people find verified courier and logistics companies for their deliveries.

Your job is to:
1. Extract delivery details from the user's message
2. Use your knowledge of Nigerian logistics companies to suggest real options
3. Always focus on the user's city/area (default: Abuja, Nigeria)

When extracting delivery details, identify:
- pickup: pickup location (area, city, or address in Nigeria)
- dropoff: drop-off location
- itemDescription: what is being delivered
- itemSize: small / medium / large / extra-large
- urgency: standard or express
- city: the Nigerian city (Abuja, Lagos, Port Harcourt, Kano etc)

When suggesting companies from your knowledge, provide Nigerian logistics companies that operate in the relevant city. Include:
- name: company name
- phone: phone number if known
- rating: estimated rating out of 5
- priceHint: price range if known, otherwise null
- description: one line about them
- website: website if known, otherwise null

Always respond with ONLY valid JSON. No markdown, no explanation.

For extraction respond like:
{"intent":"extract","pickup":"Wuse 2","dropoff":"Gwarinpa","itemDescription":"documents","itemSize":"small","urgency":"standard","city":"Abuja","success":true}

For knowledge-based suggestions respond like:
{"intent":"suggest","companies":[{"name":"Kwik Delivery","phone":"07012345678","rating":4.5,"priceHint":"₦1,500-₦5,000","description":"Tech-enabled same-day delivery across major Nigerian cities","website":"kwikdelivery.ng"},{"name":"Sendbox","phone":"01234567890","rating":4.3,"priceHint":"₦2,000-₦8,000","description":"End-to-end logistics for businesses and individuals","website":"sendbox.co"}]}

If you cannot extract details, set success to false.`;

async function extractDeliveryDetails(userMessage, existingContext = {}) {
  try {
    const contextStr = Object.keys(existingContext).length > 0
      ? '\n\nPreviously collected: ' + JSON.stringify(existingContext)
      : '';

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: 'Extract delivery details from: "' + userMessage + '"' + contextStr,
        },
      ],
    });

    const text   = response.content[0]?.text?.trim();
    const parsed = JSON.parse(text);
    return parsed;
  } catch (err) {
    console.error('Claude extraction error:', err);
    return { success: false };
  }
}

async function getKnowledgeCompanies(deliveryContext) {
  try {
    const { city, pickup, dropoff, itemDescription, itemSize, urgency } = deliveryContext;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Suggest the best Nigerian logistics/courier companies for this delivery:
City: ${city || 'Abuja'}
From: ${pickup}
To: ${dropoff}
Item: ${itemDescription} (${itemSize})
Urgency: ${urgency}

Return your top 3-5 companies you know operate in ${city || 'Abuja'} Nigeria. Focus on companies with physical presence or strong operations there.`,
        },
      ],
    });

    const text   = response.content[0]?.text?.trim();
    const parsed = JSON.parse(text);
    return parsed.companies || [];
  } catch (err) {
    console.error('Claude knowledge error:', err);
    return [];
  }
}

async function synthesiseResults(knowledgeCompanies, searchResults, deliveryContext) {
  try {
    const prompt = `You are Atlas, a Nigerian logistics concierge. Combine and rank these company results for a delivery in ${deliveryContext.city || 'Abuja'}.

From your knowledge:
${JSON.stringify(knowledgeCompanies)}

From web search:
${JSON.stringify(searchResults)}

Tasks:
1. Deduplicate (same company from both sources = one entry, merge best data)
2. Rank by: relevance to ${deliveryContext.city} > rating > price value
3. Return top 5 maximum
4. Fill in any missing phone numbers, ratings, or prices where you can infer them
5. Ensure phone numbers are Nigerian format

Respond with ONLY valid JSON:
{"companies":[{"name":"...","phone":"...","rating":4.5,"priceHint":"₦X,XXX-₦X,XXX","description":"...","website":"...","source":"knowledge|search|both"}]}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: 'You are a data synthesis assistant. Return only valid JSON, no markdown.',
      messages: [{ role: 'user', content: prompt }],
    });

    const text   = response.content[0]?.text?.trim();
    const parsed = JSON.parse(text);
    return parsed.companies || [];
  } catch (err) {
    console.error('Claude synthesis error:', err);
    return knowledgeCompanies;
  }
}

async function generateFollowUp(selectedCompany, deliveryContext) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: 'You are Atlas, a friendly Nigerian logistics concierge. Be warm, helpful, and concise.',
      messages: [
        {
          role: 'user',
          content: `The user picked "${selectedCompany}" for their delivery from ${deliveryContext.pickup} to ${deliveryContext.dropoff}. 
Generate a helpful follow-up message that:
1. Confirms their choice
2. Gives 2-3 practical tips for using the service (what to mention when calling, what info to have ready)
3. Asks if they need anything else
Keep it friendly and under 100 words.`,
        },
      ],
    });

    return response.content[0]?.text?.trim();
  } catch (err) {
    console.error('Follow-up error:', err);
    return null;
  }
}

module.exports = { extractDeliveryDetails, getKnowledgeCompanies, synthesiseResults, generateFollowUp };
