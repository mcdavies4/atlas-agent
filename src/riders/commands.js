const { supabase } = require('../utils/supabase');
const { sendMessage } = require('../utils/messenger');

const RIDER_COMMANDS = {
  AVAILABLE: ['available', 'online', 'i am available', 'start', 'open'],
  OFFLINE:   ['offline', 'unavailable', 'stop', 'close', 'not available'],
  STATUS:    ['status', 'my status'],
};

async function handleRiderCommand(phone, text, channel = 'whatsapp') {
  const lower = text.toLowerCase().trim();

  const isAvailCmd   = RIDER_COMMANDS.AVAILABLE.some(c => lower === c);
  const isOfflineCmd = RIDER_COMMANDS.OFFLINE.some(c => lower === c);
  const isStatusCmd  = RIDER_COMMANDS.STATUS.some(c => lower === c);

  if (!isAvailCmd && !isOfflineCmd && !isStatusCmd) return false;

  const { data: rider, error } = await supabase
    .from('riders')
    .select('*')
    .eq('phone', phone)
    .single();

  if (error || !rider) {
    await sendMessage(phone, `⚠️ Your number isn't registered as an Atlas rider. Contact admin to get added.`, channel);
    return true;
  }

  if (!rider.verified) {
    await sendMessage(phone, `⏳ Your account is pending verification. Contact admin.`, channel);
    return true;
  }

  if (isStatusCmd) {
    await sendMessage(phone,
      `📊 *Your Atlas Status*\n\nName: ${rider.name}\nZone: ${rider.zone}\nStatus: ${rider.is_available ? '🟢 Available' : '🔴 Offline'}\nRating: ⭐ ${rider.rating}`,
      channel
    );
    return true;
  }

  const newStatus = isAvailCmd;
  await supabase.from('riders').update({ is_available: newStatus }).eq('id', rider.id);

  if (newStatus) {
    await sendMessage(phone,
      `✅ You're now *Online* on Atlas.\n\nYou'll receive delivery jobs in *${rider.zone}* zone.\n\nSend *OFFLINE* when you're done for the day.`,
      channel
    );
  } else {
    await sendMessage(phone,
      `🔴 You're now *Offline* on Atlas.\n\nNo new jobs will be sent to you.\n\nSend *AVAILABLE* when you're ready again.`,
      channel
    );
  }

  return true;
}

module.exports = { handleRiderCommand };
