const { supabase } = require('../utils/supabase');

// Detect feedback rating in message
function detectFeedbackRating(text) {
  const lower = text.trim().toLowerCase();

  // Numeric ratings
  if (['1', '2', '3', '4', '5'].includes(lower)) {
    return { isFeedback: true, rating: parseInt(lower) };
  }

  // Word ratings
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

function getFeedbackResponse(rating) {
  if (rating >= 5) return `🎉 Thank you! Really glad Atlas helped.\n\nTell a friend who needs a courier 👉 Share this link with them.`;
  if (rating >= 4) return `😊 Thanks for the feedback! We're always improving.\n\nType *hi* anytime you need a courier again.`;
  if (rating >= 3) return `👍 Thanks for letting us know. We're working to make Atlas better.\n\nType *hi* to search again.`;
  return `😔 Sorry to hear that. We'll use this to improve.\n\nType *hi* to try again or DM us if you had a specific issue.`;
}

module.exports = { detectFeedbackRating, saveFeedback, getFeedbackPrompt, getFeedbackResponse };
