const { supabase } = require('../utils/supabase');

// Detect business registration intent
function detectBusinessIntent(text) {
  const lower = text.toLowerCase();
  const keywords = [
    'register my business', 'register our business', 'business account',
    'set up business', 'create business account', 'our company',
    'we are a business', 'business profile', 'register as business',
    'corporate account',
  ];
  return keywords.some(k => lower.includes(k));
}

// Detect if user is likely a business from message context
function inferBusinessFromContext(text) {
  const lower = text.toLowerCase();
  const businessIndicators = [
    'our shop', 'our store', 'our office', 'our restaurant',
    'our pharmacy', 'our company', 'our warehouse', 'our factory',
    'the shop', 'the store', 'the office', 'the clinic',
    'we send', 'we deliver', 'we ship', 'we need to send',
    'daily deliveries', 'regular deliveries', 'multiple deliveries',
  ];
  return businessIndicators.some(k => lower.includes(k));
}

async function getBusinessProfile(phone) {
  try {
    const { data } = await supabase
      .from('business_accounts')
      .select('*')
      .eq('phone', phone)
      .single();
    return data;
  } catch { return null; }
}

async function saveBusinessProfile(phone, profile) {
  try {
    const existing = await getBusinessProfile(phone);
    if (existing) {
      await supabase.from('business_accounts')
        .update({ ...profile, updated_at: new Date().toISOString() })
        .eq('phone', phone);
    } else {
      await supabase.from('business_accounts').insert({ phone, ...profile });
    }
    return true;
  } catch (err) {
    console.error('Business save error:', err);
    return false;
  }
}

function getBusinessRegistrationFlow() {
  return `🏢 *Register your business on Atlas*\n\nThis saves your details so future bookings are faster.\n\nPlease share:\n1️⃣ Business name\n2️⃣ Your usual pickup address\n3️⃣ Type of business (e.g. pharmacy, restaurant, boutique)\n\nReply with all three like:\n_"ABC Pharmacy, 12 Wuse 2, Abuja, Pharmacy"_`;
}

async function parseBusinessRegistration(text) {
  // Try to parse "name, address, type" format
  const parts = text.split(',').map(p => p.trim());
  if (parts.length >= 3) {
    return {
      business_name:    parts[0],
      pickup_address:   parts[1],
      business_type:    parts[2],
      registered_at:    new Date().toISOString(),
    };
  }
  return null;
}

function formatBusinessWelcome(profile) {
  return `✅ *${profile.business_name}* registered on Atlas!\n\n📍 Default pickup: ${profile.pickup_address}\n🏢 Type: ${profile.business_type}\n\nNext time you search, just tell me where to deliver and I'll use your saved address automatically.\n\nType *hi* to make your first booking.`;
}

function formatBusinessGreeting(profile) {
  return `👋 Welcome back, *${profile.business_name}*!\n\n📍 Pickup from: ${profile.pickup_address}\n\nWhere do you need to deliver today?`;
}

module.exports = {
  detectBusinessIntent,
  inferBusinessFromContext,
  getBusinessProfile,
  saveBusinessProfile,
  getBusinessRegistrationFlow,
  parseBusinessRegistration,
  formatBusinessWelcome,
  formatBusinessGreeting,
};
