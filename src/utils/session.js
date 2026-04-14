const { supabase } = require('./supabase');

// Session TTL: 30 minutes of inactivity clears the session
const SESSION_TTL_MINUTES = 30;

async function getSession(phone) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('phone', phone)
    .single();

  if (error || !data) return null;

  // Check if session is stale
  const lastActive = new Date(data.last_active);
  const now = new Date();
  const minutesIdle = (now - lastActive) / 1000 / 60;

  if (minutesIdle > SESSION_TTL_MINUTES) {
    await clearSession(phone);
    return null;
  }

  return {
    state:   data.state,
    context: data.context_json || {},
  };
}

async function updateSession(phone, { state, context }) {
  const payload = {
    phone,
    state,
    context_json: context || {},
    last_active:  new Date().toISOString(),
  };

  const { error } = await supabase
    .from('sessions')
    .upsert(payload, { onConflict: 'phone' });

  if (error) console.error('Session update error:', error);
}

async function clearSession(phone) {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('phone', phone);

  if (error) console.error('Session clear error:', error);
}

module.exports = { getSession, updateSession, clearSession };
