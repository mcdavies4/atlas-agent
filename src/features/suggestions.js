const { supabase } = require('../utils/supabase');
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Detect company suggestion intent
function detectSuggestionIntent(text) {
  const lower = text.toLowerCase();
  const keywords = [
    'suggest a company', 'add a company', 'know a company',
    'there is a company', 'there\'s a company', 'you should add',
    'have you tried', 'what about', 'check out', 'recommend a company',
    'add this company', 'list this company',
  ];
  return keywords.some(k => lower.includes(k));
}

async function extractCompanySuggestion(text) {
  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: 'Extract company suggestion details from user message. Return ONLY valid JSON: {"name":"...","phone":"...","city":"...","description":"...","success":true} or {"success":false}',
      messages: [{
        role: 'user',
        content: 'Extract company details from: "' + text + '"',
      }],
    });

    const parsed = JSON.parse(response.content[0]?.text?.trim());
    return parsed;
  } catch (err) {
    console.error('Suggestion extraction error:', err);
    return { success: false };
  }
}

async function saveSuggestion(phone, suggestion) {
  try {
    await supabase.from('company_suggestions').insert({
      suggested_by: phone,
      company_name: suggestion.name,
      phone:        suggestion.phone || null,
      city:         suggestion.city || null,
      description:  suggestion.description || null,
      status:       'pending', // admin reviews before adding
    });
    return true;
  } catch (err) {
    console.error('Suggestion save error:', err);
    return false;
  }
}

function getSuggestionPrompt() {
  return `💡 *Suggest a courier company*\n\nKnow a good logistics company we haven't listed?\n\nShare their details:\n_"Company name, phone number, city"_\n\nExample: _"Swift Couriers, 08012345678, Lagos"_`;
}

function getSuggestionConfirmation(name) {
  return `✅ Thanks! *${name}* has been submitted for review.\n\nIf verified, they'll appear in Atlas search results soon. You're helping make Atlas better for everyone 🙏\n\nType *hi* to make another search.`;
}

module.exports = {
  detectSuggestionIntent,
  extractCompanySuggestion,
  saveSuggestion,
  getSuggestionPrompt,
  getSuggestionConfirmation,
};
