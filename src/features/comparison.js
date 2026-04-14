// Detect price comparison / sort intent
function detectPriceComparisonIntent(text) {
  const lower = text.toLowerCase().trim();
  const cheapestKeywords = ['cheapest', 'lowest price', 'most affordable', 'best price', 'cheapest option', 'sort by price', 'show cheapest'];
  const bestKeywords     = ['best rated', 'highest rated', 'top rated', 'best reviews', 'sort by rating'];
  const fastestKeywords  = ['fastest', 'quickest', 'most express', 'urgent'];

  if (cheapestKeywords.some(k => lower.includes(k))) return 'cheapest';
  if (bestKeywords.some(k => lower.includes(k)))     return 'best_rated';
  if (fastestKeywords.some(k => lower.includes(k)))  return 'fastest';
  return null;
}

// Extract min price from a price hint string like "₦1,500-₦5,000"
function extractMinPrice(priceHint) {
  if (!priceHint) return Infinity;
  const match = priceHint.replace(/,/g, '').match(/[\d]+/);
  return match ? parseInt(match[0]) : Infinity;
}

// Extract max rating
function extractRating(rating) {
  if (!rating) return 0;
  return parseFloat(rating) || 0;
}

function sortCompanies(companies, sortMode) {
  const sorted = [...companies];

  switch (sortMode) {
    case 'cheapest':
      return sorted.sort((a, b) => extractMinPrice(a.priceHint) - extractMinPrice(b.priceHint));
    case 'best_rated':
      return sorted.sort((a, b) => extractRating(b.rating) - extractRating(a.rating));
    case 'fastest':
      // Flag companies with "express" or "same hour" in description first
      return sorted.sort((a, b) => {
        const aFast = (a.description || '').toLowerCase().includes('express') || (a.description || '').toLowerCase().includes('fast') ? 1 : 0;
        const bFast = (b.description || '').toLowerCase().includes('express') || (b.description || '').toLowerCase().includes('fast') ? 1 : 0;
        return bFast - aFast;
      });
    default:
      return sorted;
  }
}

function formatSortLabel(sortMode) {
  switch (sortMode) {
    case 'cheapest':   return '💰 Sorted by lowest price';
    case 'best_rated': return '⭐ Sorted by highest rating';
    case 'fastest':    return '⚡ Sorted by speed';
    default:           return '';
  }
}

module.exports = { detectPriceComparisonIntent, sortCompanies, formatSortLabel };
