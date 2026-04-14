const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Detect scheduled delivery intent
function detectScheduledIntent(text) {
  const lower = text.toLowerCase();
  const keywords = [
    'tomorrow', 'next week', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'at ', 'am', 'pm', 'morning', 'afternoon', 'evening', 'night',
    'schedule', 'scheduled', 'book for', 'pickup at', 'collect at',
    'later today', 'this evening', 'tonight',
  ];
  return keywords.some(k => lower.includes(k));
}

async function extractScheduleDetails(text) {
  try {
    const now = new Date().toISOString();

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: `You extract scheduling details from delivery messages. Current time: ${now} (Nigeria WAT = UTC+1).
Return ONLY valid JSON:
{"hasSchedule":true,"dateLabel":"Tomorrow, Wednesday 16 Apr","timeLabel":"10:00 AM","isToday":false,"isTomorrow":true,"timeOfDay":"morning"}
or {"hasSchedule":false}`,
      messages: [{
        role: 'user',
        content: 'Extract schedule from: "' + text + '"',
      }],
    });

    const parsed = JSON.parse(response.content[0]?.text?.trim());
    return parsed;
  } catch (err) {
    console.error('Schedule extraction error:', err);
    return { hasSchedule: false };
  }
}

function formatScheduleNote(schedule) {
  if (!schedule?.hasSchedule) return null;
  return `📅 *Scheduled for:* ${schedule.dateLabel}${schedule.timeLabel ? ' at ' + schedule.timeLabel : ''}`;
}

function getScheduleSearchNote(schedule) {
  if (!schedule?.hasSchedule) return '';
  return ` scheduled for ${schedule.dateLabel}${schedule.timeLabel ? ' at ' + schedule.timeLabel : ''}`;
}

// Flag companies that offer scheduled collection
function flagScheduledCompanies(companies, schedule) {
  if (!schedule?.hasSchedule) return companies;

  return companies.map(company => {
    const desc = (company.description || '').toLowerCase();
    const supportsScheduled = ['schedule', 'book', 'advance', 'pre-book', 'appointment'].some(k => desc.includes(k));
    return {
      ...company,
      supportsScheduled,
      scheduledNote: supportsScheduled ? '✅ Supports scheduled pickup' : '⚠️ Call to confirm scheduled pickup',
    };
  });
}

module.exports = { detectScheduledIntent, extractScheduleDetails, formatScheduleNote, getScheduleSearchNote, flagScheduledCompanies };
