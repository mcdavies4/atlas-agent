const { supabase } = require('../utils/supabase');

// Detect feedback rating in message
function detectFeedbackRating(text) {
  const lower = text.trim().toLowerCase();

  if (['1', '2', '3', '4', '5'].includes(lower)) {
    return { isFeedback: true, rating: parseInt(lower) };
  }

  const wordMap = {
    'terrible': 1, 'bad': 1, 'poor': 1, 'awful': 1,
    'okay': 3, 'ok': 3, 'fine': 3, 'average': 3, 'alright': 3,
    'good': 4, 'great': 4, 'nice': 4,
    'excellent': 5, 'amazing': 5, 'perfect': 5, 'love it': 5, 'fantastic': 5,
  };

  for (const [word, rating] of Object.entries(wordMap)) {
    if (lower.includes(word)) return { isFeedback: true, rating };
  }

  return { isFeedback: false };
}

async function saveFeedback(phone, rating, context) {
  try {
    await supabase.from('feedback').insert({
      phone,
      rating,
      selected_company: context?.selectedCompany?.name || null,
      pickup:           context?.pickup || null,
      dropoff:          context?.dropoff || null,
      city:             context?.city || null,
    });
  } catch (err) {
    console.error('Feedback save error:', err);
  }
}

function getFeedbackPrompt() {
  return `⭐ *Quick feedback*\n\nHow was your experience with Atlas today?\n\nReply with a number:\n*5* — Excellent\n*4* — Good\n*3* — Okay\n*2* — Poor\n*1* — Terrible`;
}

// For positive ratings (4-5), ask for company details
function getFeedbackResponse(rating) {
  if (rating >= 4) return null; // handled separately with follow-up
  if (rating >= 3) return `👍 Thanks for letting us know. We're working to make Atlas better.\n\nType *hi* to search again.`;
  return `😔 Sorry to hear that. We'll use this to improve.\n\nType *hi* to try again or DM us if you had a specific issue.`;
}

// Positive rating follow-up — ask for company details
function getPositiveFollowUp(rating, companyName) {
  const opener = rating >= 5
    ? `🎉 Amazing! Really glad Atlas helped.`
    : `😊 Great to hear!`;

  let msg = `${opener}\n\n`;

  if (companyName) {
    msg += `One quick thing — can you share *${companyName}'s* WhatsApp number or any details?\n\n`;
    msg += `This helps us verify them and improve results for everyone.\n\n`;
    msg += `Reply with their number e.g. _"08012345678"_ or *SKIP* to continue.`;
  } else {
    msg += `Which company did you end up using?\n\n`;
    msg += `Reply with their name and number e.g. _"Swift Couriers, 08012345678"_ or *SKIP* to continue.`;
  }

  return msg;
}

// Parse company details from user reply
function parseCompanyDetails(text, existingCompanyName) {
  const lower = text.toLowerCase().trim();

  if (['skip', 'no', 'nope', 'later', 'cancel'].includes(lower)) {
    return { skipped: true };
  }

  // Extract phone number
  const phoneMatch = text.match(/(\+?234|0)[7-9][0-9]{9}/);
  const phone      = phoneMatch ? phoneMatch[0] : null;

  // Extract company name — if we already have it from context, use it
  let name = existingCompanyName || null;
  if (!name) {
    // Try to extract name from "Company Name, 08012345678" format
    const parts = text.split(',').map(p => p.trim());
    if (parts.length >= 2 && isNaN(parts[0])) {
      name = parts[0];
    }
  }

  if (!phone && !name) return { skipped: true };

  return { skipped: false, name, phone };
}

async function saveVerifiedCompany(phone, companyData, context) {
  try {
    // Check if already exists
    const { data: existing } = await supabase
      .from('verified_companies')
      .select('id, mention_count')
      .ilike('name', companyData.name || '')
      .single();

    if (existing) {
      // Increment mention count and update phone if we now have it
      await supabase.from('verified_companies')
        .update({
          mention_count: (existing.mention_count || 1) + 1,
          phone:         companyData.phone || null,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase.from('verified_companies').insert({
        name:          companyData.name || 'Unknown',
        phone:         companyData.phone || null,
        city:          context?.city || null,
        route_pickup:  context?.pickup || null,
        route_dropoff: context?.dropoff || null,
        reported_by:   phone,
        mention_count: 1,
        status:        'unverified', // admin reviews before promoting
      });
    }
    return true;
  } catch (err) {
    console.error('Save verified company error:', err);
    return false;
  }
}

function getCompanySaveConfirmation(companyName) {
  return `✅ Thanks! *${companyName || 'That company'}* has been added to our review list.\n\nIf verified, they'll appear in Atlas results soon. You're helping build a better logistics network 🙏\n\nType *hi* to book your next delivery.`;
}

function getSkipResponse() {
  return `No problem! Type *hi* anytime you need a courier again. 🚀`;
}

module.exports = {
  detectFeedbackRating,
  saveFeedback,
  getFeedbackPrompt,
  getFeedbackResponse,
  getPositiveFollowUp,
  parseCompanyDetails,
  saveVerifiedCompany,
  getCompanySaveConfirmation,
  getSkipResponse,
};
