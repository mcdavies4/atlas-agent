const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function summariseReviews(companyName, searchResults) {
  try {
    // Extract snippets mentioning the company from search results
    const relevant = searchResults
      .filter(r => r.snippet && r.title?.toLowerCase().includes(companyName.toLowerCase()))
      .map(r => r.snippet)
      .join('\n');

    if (!relevant) return null;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 100,
      system: 'You summarise customer sentiment about Nigerian logistics companies in one concise sentence. Be honest and balanced. Max 20 words.',
      messages: [{
        role: 'user',
        content: `Summarise customer sentiment about ${companyName} from these snippets:\n${relevant}`,
      }],
    });

    return response.content[0]?.text?.trim();
  } catch (err) {
    console.error('Review summary error:', err);
    return null;
  }
}

async function enrichCompaniesWithReviews(companies, searchResults) {
  // Run all review summaries in parallel
  const enriched = await Promise.all(
    companies.map(async (company) => {
      const review = await summariseReviews(company.name, searchResults);
      return { ...company, reviewSummary: review };
    })
  );
  return enriched;
}

module.exports = { enrichCompaniesWithReviews };
