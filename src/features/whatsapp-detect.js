// Detect WhatsApp-only companies and format wa.me links
// Many Nigerian couriers operate purely on WhatsApp

// Known WhatsApp-primary Nigerian courier indicators
const WA_INDICATORS = [
  'whatsapp only', 'whatsapp us', 'chat us on whatsapp',
  'message us on whatsapp', 'wa.me', 'whatsapp number',
  'contact via whatsapp', 'order via whatsapp',
];

// Nigerian phone number patterns
const NG_PHONE_PATTERNS = [
  /(?:^|\s|[:(])(\+?234|0)(7[0-9]|8[0-9]|9[0-9])\d{8}(?:\s|$|[,.)!])/g,
  /(?:^|\s)(\d{11})(?:\s|$)/g, // 11-digit Nigerian number
];

function extractPhoneNumbers(text) {
  const numbers = new Set();

  for (const pattern of NG_PHONE_PATTERNS) {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(m => {
      let num = m[1] || m[0];
      num = num.replace(/\s/g, '').replace(/[^0-9+]/g, '');

      // Normalise to international format
      if (num.startsWith('0') && num.length === 11) {
        num = '234' + num.slice(1);
      } else if (num.startsWith('+234')) {
        num = num.slice(1);
      }

      if (num.length >= 12) numbers.add(num);
    });
  }

  return [...numbers];
}

function isWhatsAppPrimary(companyData) {
  const text = [
    companyData.description || '',
    companyData.snippet || '',
    companyData.website || '',
  ].join(' ').toLowerCase();

  return WA_INDICATORS.some(ind => text.includes(ind)) ||
    text.includes('wa.me') ||
    !companyData.website;
}

function buildWhatsAppLink(phone, companyName) {
  const cleaned = phone.replace(/[^0-9]/g, '');
  const message = encodeURIComponent(`Hi, I need a delivery. I found you via Atlas.`);
  return `https://wa.me/${cleaned}?text=${message}`;
}

function enrichCompanyWithWhatsApp(company) {
  if (!company.phone) return company;

  const numbers = extractPhoneNumbers(company.phone);
  if (numbers.length === 0) return company;

  const primaryNumber = numbers[0];
  const waLink = buildWhatsAppLink(primaryNumber, company.name);
  const isWaPrimary = isWhatsAppPrimary(company);

  return {
    ...company,
    whatsappLink: waLink,
    isWhatsAppPrimary: isWaPrimary,
    formattedPhone: primaryNumber,
  };
}

function enrichCompaniesWithWhatsApp(companies) {
  return companies.map(enrichCompanyWithWhatsApp);
}

function formatCompanyContact(company) {
  if (company.whatsappLink && company.isWhatsAppPrimary) {
    return `📱 *WhatsApp:* ${company.whatsappLink}\n📞 ${company.phone}`;
  }
  if (company.whatsappLink) {
    return `📞 ${company.phone}\n💬 *Also on WhatsApp:* ${company.whatsappLink}`;
  }
  return `📞 ${company.phone}`;
}

module.exports = {
  enrichCompaniesWithWhatsApp,
  formatCompanyContact,
  extractPhoneNumbers,
  buildWhatsAppLink,
};
