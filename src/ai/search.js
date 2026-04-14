const axios = require('axios');

const API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const CX      = process.env.GOOGLE_SEARCH_CX; // Custom Search Engine ID

async function searchLogisticsCompanies(deliveryContext) {
  const { city = 'Abuja', pickup, itemDescription } = deliveryContext;

  // Build targeted search queries
  const queries = [
    `logistics courier delivery company ${city} Nigeria`,
    `same day delivery dispatch ${city} Nigeria phone number`,
    `courier service ${pickup || city} Nigeria`,
  ];

  const allResults = [];

  for (const query of queries) {
    try {
      const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
        params: {
          key: API_KEY,
          cx:  CX,
          q:   query,
          num: 5,
        },
      });

      const items = res.data?.items || [];
      items.forEach(item => {
        allResults.push({
          title:   item.title,
          link:    item.link,
          snippet: item.snippet,
          source:  'search',
        });
      });
    } catch (err) {
      console.error('Google search error for query:', query, err?.response?.data || err.message);
    }
  }

  // Deduplicate by domain
  const seen    = new Set();
  const unique  = allResults.filter(r => {
    try {
      const domain = new URL(r.link).hostname;
      if (seen.has(domain)) return false;
      seen.add(domain);
      return true;
    } catch { return true; }
  });

  return unique.slice(0, 10);
}

module.exports = { searchLogisticsCompanies };
