const { supabase } = require('../utils/supabase');

// ─── Saved Addresses ──────────────────────────────────────────────────────────
// Users can save up to 5 addresses with labels like "home", "office", "shop"

async function getSavedAddresses(phone) {
  const { data, error } = await supabase
    .from('saved_addresses')
    .select('*')
    .eq('phone', phone)
    .order('created_at', { ascending: false });

  if (error) return [];
  return data || [];
}

async function saveAddress(phone, label, address) {
  // Normalise label
  const normLabel = label.toLowerCase().trim();

  // Check if label already exists — update if so
  const { data: existing } = await supabase
    .from('saved_addresses')
    .select('id')
    .eq('phone', phone)
    .eq('label', normLabel)
    .single();

  if (existing) {
    await supabase
      .from('saved_addresses')
      .update({ address, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    // Enforce max 5 saved addresses
    const { data: all } = await supabase
      .from('saved_addresses')
      .select('id')
      .eq('phone', phone)
      .order('created_at', { ascending: true });

    if (all && all.length >= 5) {
      // Delete oldest
      await supabase.from('saved_addresses').delete().eq('id', all[0].id);
    }

    await supabase.from('saved_addresses').insert({
      phone,
      label:   normLabel,
      address,
    });
  }
}

async function deleteAddress(phone, label) {
  await supabase
    .from('saved_addresses')
    .delete()
    .eq('phone', phone)
    .eq('label', label.toLowerCase().trim());
}

async function resolveAddress(phone, text) {
  // Check if user is referencing a saved address
  // e.g. "from home", "my office", "the shop"
  const lower = text.toLowerCase();
  const saved = await getSavedAddresses(phone);

  for (const addr of saved) {
    if (lower.includes(addr.label) || lower.includes('my ' + addr.label)) {
      return { resolved: true, label: addr.label, address: addr.address };
    }
  }

  return { resolved: false };
}

function formatAddressList(addresses) {
  if (!addresses || addresses.length === 0) return null;
  return addresses.map((a, i) => `*${i + 1}.* _${a.label}_ → ${a.address}`).join('\n');
}

// Detect save address commands
// e.g. "save this as home", "remember wuse 2 as office", "save my shop as shop"
function detectSaveCommand(text) {
  const lower = text.toLowerCase().trim();
  const patterns = [
    /save (.+) as (.+)/,
    /remember (.+) as (.+)/,
    /add (.+) as (.+)/,
    /set (.+) as my (.+)/,
  ];

  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match) {
      return { isSaveCommand: true, address: match[1].trim(), label: match[2].trim() }
    }
  }

  // "save as home" — address comes from context
  const saveAsPattern = lower.match(/save (?:this |it )?as (.+)/)
  if (saveAsPattern) {
    return { isSaveCommand: true, address: null, label: saveAsPattern[1].trim() }
  }

  return { isSaveCommand: false };
}

function detectAddressCommands(text) {
  const lower = text.toLowerCase().trim();
  if (['my addresses', 'saved addresses', 'my locations', 'show addresses'].includes(lower)) {
    return 'list';
  }
  if (lower.startsWith('delete ') || lower.startsWith('remove ')) {
    const label = lower.replace(/^(delete|remove)\s+/, '').trim();
    return { action: 'delete', label };
  }
  return null;
}

module.exports = {
  getSavedAddresses,
  saveAddress,
  deleteAddress,
  resolveAddress,
  formatAddressList,
  detectSaveCommand,
  detectAddressCommands,
};
