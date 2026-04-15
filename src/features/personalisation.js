const { supabase } = require('../utils/supabase');

// ─── PREFERRED COMPANY ────────────────────────────────────────────────────────

function detectPreferredCompanyCommand(text) {
  const lower = text.toLowerCase().trim();

  // Set preferred
  const setPatterns = [
    /always show me (.+) first/,
    /prefer (.+)/,
    /set (.+) as my preferred/,
    /my preferred courier is (.+)/,
    /i always use (.+)/,
    /pin (.+)/,
  ];
  for (const p of setPatterns) {
    const match = lower.match(p);
    if (match) return { action: 'set', company: match[1].trim() };
  }

  // Remove preferred
  if (lower.includes('remove preferred') || lower.includes('clear preferred') || lower.includes('no preferred')) {
    return { action: 'clear' };
  }

  // View preferred
  if (lower.includes('my preferred') || lower.includes('show preferred')) {
    return { action: 'view' };
  }

  return null;
}

async function getPreferredCompany(phone) {
  try {
    const { data } = await supabase
      .from('user_preferences')
      .select('preferred_company')
      .eq('phone', phone)
      .single();
    return data?.preferred_company || null;
  } catch { return null; }
}

async function setPreferredCompany(phone, company) {
  try {
    await supabase.from('user_preferences').upsert({
      phone,
      preferred_company: company,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'phone' });
    return true;
  } catch (err) {
    console.error('Set preferred error:', err);
    return false;
  }
}

async function clearPreferredCompany(phone) {
  try {
    await supabase.from('user_preferences')
      .update({ preferred_company: null })
      .eq('phone', phone);
    return true;
  } catch { return false; }
}

function pinPreferredToTop(companies, preferredName) {
  if (!preferredName || !companies) return companies;

  const lower = preferredName.toLowerCase();
  const preferred = companies.filter(c => c.name.toLowerCase().includes(lower));
  const rest      = companies.filter(c => !c.name.toLowerCase().includes(lower));

  if (preferred.length > 0) {
    return [
      ...preferred.map(c => ({ ...c, isPinned: true, pinnedNote: '⭐ Your preferred courier' })),
      ...rest,
    ];
  }
  return companies;
}

// ─── CONTACT BOOK ─────────────────────────────────────────────────────────────

function detectContactCommand(text) {
  const lower = text.toLowerCase().trim();

  // Save contact
  const savePatterns = [
    /save (.+) as (.+)/,
    /add (.+) to my contacts/,
    /remember (.+) address as (.+)/,
    /(.+) lives at (.+)/,
    /(.+)'s address is (.+)/,
  ];

  // Check specifically for contact saving (not address saving)
  // Address saving uses "save X as office/home" — contact saving uses person names
  const addressLabels = ['home', 'office', 'shop', 'work', 'house', 'store', 'warehouse'];

  for (const p of savePatterns) {
    const match = lower.match(p);
    if (match) {
      const label = match[2]?.trim();
      // If it's an address label, let the addresses module handle it
      if (label && addressLabels.includes(label)) continue;
      return { action: 'save', name: match[1].trim(), address: match[2]?.trim() };
    }
  }

  // List contacts
  if (['my contacts', 'show contacts', 'contact list', 'my recipients'].some(k => lower.includes(k))) {
    return { action: 'list' };
  }

  // Delete contact
  const deleteMatch = lower.match(/(?:delete|remove) (.+) (?:from )?contacts?/);
  if (deleteMatch) return { action: 'delete', name: deleteMatch[1].trim() };

  return null;
}

function detectContactReference(text, contacts) {
  if (!contacts || contacts.length === 0) return null;
  const lower = text.toLowerCase();

  for (const contact of contacts) {
    const nameLower = contact.name.toLowerCase();
    if (lower.includes('send to ' + nameLower) ||
        lower.includes('deliver to ' + nameLower) ||
        lower.includes('drop at ' + nameLower) ||
        lower.includes('to ' + nameLower)) {
      return contact;
    }
  }
  return null;
}

async function getContacts(phone) {
  try {
    const { data } = await supabase
      .from('contact_book')
      .select('*')
      .eq('phone', phone)
      .order('name');
    return data || [];
  } catch { return []; }
}

async function saveContact(phone, name, address) {
  try {
    const existing = await supabase
      .from('contact_book')
      .select('id')
      .eq('phone', phone)
      .ilike('name', name)
      .single();

    if (existing.data) {
      await supabase.from('contact_book')
        .update({ address, updated_at: new Date().toISOString() })
        .eq('id', existing.data.id);
    } else {
      await supabase.from('contact_book').insert({ phone, name, address });
    }
    return true;
  } catch (err) {
    console.error('Save contact error:', err);
    return false;
  }
}

async function deleteContact(phone, name) {
  try {
    await supabase.from('contact_book')
      .delete()
      .eq('phone', phone)
      .ilike('name', name);
    return true;
  } catch { return false; }
}

function formatContactList(contacts) {
  if (!contacts || contacts.length === 0) return null;
  return contacts.map((c, i) => `*${i + 1}.* ${c.name} — ${c.address}`).join('\n');
}

module.exports = {
  detectPreferredCompanyCommand,
  getPreferredCompany,
  setPreferredCompany,
  clearPreferredCompany,
  pinPreferredToTop,
  detectContactCommand,
  detectContactReference,
  getContacts,
  saveContact,
  deleteContact,
  formatContactList,
};
