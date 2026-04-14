const { supabase } = require('../utils/supabase');

const MAX_HISTORY = 10;

async function saveSearchHistory(phone, searchContext, companies) {
  try {
    await supabase.from('search_history').insert({
      phone,
      pickup:          searchContext.pickup,
      dropoff:         searchContext.dropoff,
      item_description: searchContext.itemDescription || null,
      city:            searchContext.city || 'Abuja',
      companies_found: companies.length,
      top_company:     companies[0]?.name || null,
    });

    // Keep only last MAX_HISTORY records per user
    const { data: all } = await supabase
      .from('search_history')
      .select('id')
      .eq('phone', phone)
      .order('created_at', { ascending: true });

    if (all && all.length > MAX_HISTORY) {
      const toDelete = all.slice(0, all.length - MAX_HISTORY).map(r => r.id);
      await supabase.from('search_history').delete().in('id', toDelete);
    }
  } catch (err) {
    console.error('History save error:', err);
  }
}

async function getSearchHistory(phone) {
  try {
    const { data } = await supabase
      .from('search_history')
      .select('*')
      .eq('phone', phone)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY);

    return data || [];
  } catch (err) {
    console.error('History fetch error:', err);
    return [];
  }
}

async function getLastSearch(phone) {
  const history = await getSearchHistory(phone);
  return history[0] || null;
}

function formatHistory(history) {
  if (!history || history.length === 0) return null;

  const lines = history.map((h, i) => {
    const date = new Date(h.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    return `*${i + 1}.* ${h.pickup} → ${h.dropoff} · ${date}${h.top_company ? ' · ' + h.top_company : ''}`;
  });

  return lines.join('\n');
}

function detectHistoryCommand(text) {
  const lower = text.toLowerCase().trim();
  const listKeywords  = ['my history', 'past searches', 'previous searches', 'show history', 'my searches'];
  const repeatKeyword = ['repeat last', 'use last search', 'same as last time', 'last delivery', 'book again'];

  if (listKeywords.some(k => lower.includes(k)))  return 'list';
  if (repeatKeyword.some(k => lower.includes(k))) return 'repeat';
  return null;
}

module.exports = { saveSearchHistory, getSearchHistory, getLastSearch, formatHistory, detectHistoryCommand };
