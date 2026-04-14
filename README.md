# Atlas Agent 🤖
**AI-powered logistics concierge for Nigeria — WhatsApp & Telegram**

Users describe their delivery → Atlas searches Google + uses Claude's knowledge → Returns ranked list of real Nigerian courier companies with phone numbers, ratings, and prices → User picks one → Atlas follows up with tips.

No rider database needed. Atlas is a pure AI research agent.

---

## How it works
1. User messages Atlas with delivery details
2. Claude extracts pickup, dropoff, item, city
3. Claude's knowledge surfaces known Nigerian logistics companies instantly
4. Google Custom Search finds fresh, verified results
5. Claude synthesises both into a ranked top-5 list
6. User picks a company → Atlas provides contact details + practical tips
7. Atlas follows up to confirm they're sorted

---

## Stack
- Node.js + Express → Railway
- Claude Sonnet (Anthropic) — NLU + knowledge + synthesis
- Google Custom Search API — real-time web results
- Supabase — session state only (no rider/job DB needed)
- WhatsApp Business Cloud API + Telegram Bot API

---

## Setup

### 1. Install
```bash
npm install
cp .env.example .env
```

### 2. Google Custom Search
1. Go to console.cloud.google.com
2. Enable **Custom Search API**
3. Get your API key
4. Go to cse.google.com → Create a search engine
5. Set it to search the whole web
6. Copy the Search Engine ID (cx)
7. Add both to .env

### 3. Fill remaining .env values
Same as before — Supabase, WhatsApp, Telegram, Anthropic

### 4. Deploy to Railway
Push to GitHub → Railway → add all env vars → deploy

---

## Key differences from Atlas v2
- No `riders` table needed (no own database)
- No `deliveries` table (no job tracking)
- Sessions table only — for conversation state
- New `src/ai/search.js` — Google Custom Search
- `src/ai/claude.js` completely rewritten as agent brain
- Simpler conversation flow: COLLECTING → SHOWING → FOLLOWUP

---

## Cities supported
Any Nigerian city — Abuja, Lagos, Port Harcourt, Kano, Ibadan, Enugu etc.
Atlas auto-detects city from the user's message.
