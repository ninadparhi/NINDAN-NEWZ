# NINDAN-NEWZ 2.0

A news aggregator that goes past left/right percentages. Every story is clustered
across outlets, placed on a five-point spectrum, and annotated **sentence by
sentence** so the reader can see what the wording is doing — plus who owns the
publication and whether their own reading diet is balanced.

One Express service aggregates ~70 RSS feeds, clusters them into stories, and
serves both the API and the 2.0 client. No build step for the client, no database
required to run it.

## What is new in 2.0

| Feature | Where |
| --- | --- |
| Sentence-level spin highlights with offsets and explanation tags | `POST /api/analyze-article`, "Linguistic Spin X-Ray" reader |
| Bias percentage breakdown per article (not just per outlet) | Analysis response `bias`, reader rail |
| 3-bullet neutral synthesis: undisputed facts vs. partisan spin | Analysis response `synthesis`, reader rail |
| Bias Spectrum Bar for every cluster | Dashboard cards, `/api/trending` |
| Neutral Consensus toggle | Header toggle, `/api/framing/:id` |
| Ownership graph, funders, funding type | "Global Framing" drawer, `/api/stakeholder/:source` |
| Comparative headlines from opposing leans | Drawer, `/api/framing/:id` |
| 7-day Cognitive Balance Score and counter-perspective suggestions | "Balance score" widget, device-local |
| Dual bias metric: text-based AI score + outlet coverage split | Card meters, reader tabs, `sourceBreakdown` |
| "Quick context" plain-language summary above the article text | Analysis `simpleSummary`, reader |
| Article images: feed picture → publisher `og:image` → category photograph | Card media, `/api/image` |
| Mid-page trending-topic ticker; click a tag to filter the feed | Dashboard, `/api/topics` |
| Consensus cards: bottom line, undisputed facts, left and right perspective | Reader and dashboard toggle, `/api/framing/:id` |
| Free analysis backends (Groq, OpenRouter, Hugging Face, local Ollama) with a keyless local engine | `src/llm.js`, `src/analyze.js` |
| Analysis precomputed at ingestion and stored with each story | `src/precompute.js`, `analysis` on cards |
| Untracked source bucket plus domain→outlet resolution | `sourceBreakdown.untrackedCount`, `src/sources.js` |
| Source coverage dashboard: counts, distribution bar, logo columns, untracked, factuality, ownership | Reader |
| Source logos, country, factuality and ownership flags on every card | `/api/meta` → `sourceMeta` |

## Run it

```bash
npm install
cp .env.example .env      # optional: add an LLM key
npm start                 # http://localhost:3001
npm run dev               # same, with --watch
npm test                  # node --test
```

The client lives in `client/` and is served by the API server at `/`. There is no
client build: `index.html`, `styles.css` and three ES modules.

## Configuration

Everything is optional except `PORT`. With no key at all the analysis endpoint
still works: it runs the built-in lexical engine and returns the same JSON shape
(`biasRating`, `biasPercentage`, `keyTopics`, highlights, synthesis). A missing
key is a supported mode, not a failure.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | HTTP port |
| `REFRESH_MINUTES` | `20` | Feed refresh interval (clamped 15–30) |
| `ARCHIVE_DAYS` | `14` | Days of stories kept in `data/archive.json` |
| `LLM_PROVIDER` | auto-detected | `openrouter`, `huggingface`, `ollama`, `openai`, `anthropic` |
| `LLM_API_KEY` | — | Generic key for the selected provider |
| `GROQ_API_KEY` | — | Free tier: `LLM_PROVIDER=groq`, `llama-3.3-70b-versatile` |
| `OPENROUTER_API_KEY` | — | Free tier: `LLM_PROVIDER=openrouter` |
| `HF_TOKEN` | — | Hugging Face Inference Providers: `LLM_PROVIDER=huggingface` |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | `http://127.0.0.1:11434/v1` / `llama3.1:8b` | Local model, no key |
| `LLM_BASE_URL` | provider default | Any OpenAI-compatible gateway |
| `LLM_MODEL` | provider default | Model name |
| `ANALYZE_RATE_MAX` | `20` | Analyses per IP per 5 minutes |
| `PRECOMPUTE_MAX` | `40` | Stories scored per refresh, stored in the archive |
| `CLIENT_ORIGIN` | — | Only for a separately hosted client |
| `DATABASE_URL` | — | Only for the Postgres/Prisma target (below) |

`OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are also picked up. When
`LLM_PROVIDER` is empty the first available key wins (Anthropic → OpenRouter →
Hugging Face → local Ollama → OpenAI-compatible), so a key already in the
environment works without renaming. A local Ollama server is probed for one
minute at a time; if it is not running, the lexical engine answers.

## API

### `POST /api/analyze-article`

Accepts raw text or an article URL. When only a URL is sent the server fetches the
page, extracts its paragraphs, and analyses that text. Responses are cached in
memory for six hours per `(url|text, source)` pair.

```json
{
  "url": "https://example.com/report",
  "source": "The Hindu",
  "title": "Optional headline",
  "fallbackText": "Optional archived excerpt if the live page cannot be fetched",
  "force": false
}
```

Response (trimmed):

```json
{
  "title": "…",
  "url": "https://example.com/report",
  "source": "The Hindu",
  "method": "llm",
  "engine": "OpenRouter free tier",
  "degraded": false,
  "reason": null,
  "analyzedAt": "2026-10-30T09:12:44.120Z",
  "text": "The exact text the offsets refer to…",
  "bias": { "left": 12, "leanLeft": 24, "center": 33, "leanRight": 21, "right": 10 },
  "biasRating": "Center",
  "biasPercentage": 33,
  "biasRationale": "The framing reads centre because… (Why this score?)",
  "simpleSummary": "Two or three plain sentences a 10-year-old would follow.",
  "keyTopics": ["Maharashtra", "Election Commission", "Mumbai"],
  "spin": [
    {
      "sentenceText": "a brazen cover-up and a shameful abuse of power",
      "startIndex": 184,
      "endIndex": 233,
      "valenceScore": -0.4,
      "explanationTag": "Loaded Language",
      "explanation": "Evaluative wording does the judging for the reader…"
    }
  ],
  "synthesis": {
    "undisputedFacts": ["…", "…", "…"],
    "partisanSpin": ["…", "…"]
  }
}
```

- `bias` integers always sum to 100. `biasRating` names the largest bucket
  (`Left`, `Lean Left`, `Center`, `Lean Right`, `Right`) and `biasPercentage`
  is that bucket's share.
- `keyTopics` are the people, institutions and subjects the article is about;
  the ticker uses the same extractor over the archive. `engine` names the
  backend that answered (`local-lexical` when no model is configured).
- `startIndex`/`endIndex` index into the returned `text`, so the reader renders
  highlights from the same string the analyser scored.
- `explanationTag` is one of: Loaded Language, Omitted Context, Emotional Appeal,
  False Equivalence, Cherry-picking, Framing, Appeal to Authority.
- `valenceScore` runs −1 (left-leaning framing) → 0 (neutral) → +1 (right-leaning).

Error responses: `400` missing text/url or a disallowed host, `415` non-HTML URL,
`422` too little readable text, `429` own rate limit (`Retry-After` set), `502/504`
publisher unreachable.

### Other endpoints

| Method | Path | Returns |
| --- | --- | --- |
| GET | `/api/news` | Filterable stories (`region`, `category`, `source`, `date`, `q`, `limit`, `offset`, `tz`) with `coverageBuckets`, `blindspot`, `sourceBreakdown` |
| GET | `/api/news/:id` | One story cluster |
| GET | `/api/trending` | Clusters with >1 outlet, ranked by coverage, with spectrum and blindspot |
| GET | `/api/topics` | Trending topics weighted by coverage breadth, with `#tag` and plain query |
| GET | `/api/framing/:id` | Headlines grouped left/centre/right, spectrum, consensus terms, `perspectives`, `facts`, `bottomLine`, missing sides |
| GET | `/api/stakeholder/:source` | Parent company, funders, funding type, ownership chain |
| GET | `/api/meta` | Categories, leans, sources, source ratings |
| GET | `/api/days` | Dates available in the archive |
| GET | `/api/breaking` | Ticker headlines |
| GET | `/api/image?u=` | Lazy `og:image` lookup |

## Ingestion-time analysis

New stories are scored once, right after the feed merge, by
`src/precompute.js` — newest first, `PRECOMPUTE_MAX` per refresh, two in flight.
The result (`bias`, `biasRating`, `biasPercentage`, `simpleSummary`,
`biasRationale`, `keyTopics`, `spin`) is attached to every article in the
cluster and persisted in `data/archive.json`. `GET /api/news` returns a compact
summary of it (`analysis`) with each card, and `GET /api/news/:id` returns the
full record including the highlighted text. Opening a story therefore renders
its score without a model call; the analysis endpoint remains available for
ad-hoc text and live URL analysis.

With a free key configured (`GROQ_API_KEY` or `OPENROUTER_API_KEY`), the same
worker runs real chat completions; without one it uses the lexical engine. A
rate-limited provider falls back per story and the next refresh retries it,
because stories without an analysis stay at the front of the queue.

## How the analysis handles failure

1. **Prompt asks for quotes, not offsets.** The model returns verbatim
   substrings; the server locates them in the text and computes offsets. A quote
   that is not found is discarded, so a hallucination cannot highlight the wrong
   words.
2. **Malformed JSON is tolerated.** A fenced or chatty response is unwrapped; if
   no JSON object can be recovered, the request falls back instead of erroring.
3. **Rate limits and timeouts are retried.** 429/5xx and timeouts retry three
   times with exponential backoff and honours `Retry-After`.
4. **The local engine is free and always available.** With no key configured the
   request is answered by a deterministic lexical analyser
   (`method: "heuristic"`, `engine: "local-lexical"`, `degraded: false`), so the
   app is fully functional out of the box. If a configured free backend rejects,
   times out or returns unusable JSON, the same engine answers with
   `degraded: true` and a `reason` shown in the UI. Either way the bias breakdown
   sums to 100, `keyTopics` is populated and the synthesis has its three slots.
5. **Our own endpoint is budgeted.** `ANALYZE_RATE_MAX` analyses per IP per five
   minutes, so a crawler cannot burn the LLM quota.

URL analysis refuses localhost/private hosts and follows redirects with a 10s
timeout, so the endpoint cannot be used to probe the host's internal network.

## Database (target schema)

The running server keeps its archive in `data/archive.json` — that is what makes
it zero-setup. `prisma/schema.prisma` is the Postgres target for the migration,
with the product's models:

- `Article` — title, url, content, source, publicationDate, clusterId,
  biasRating (LEFT…RIGHT), factualRating, imageUrl, simpleSummary,
  biasRationale, lastUpdatedTime, sourceId → `Source`
- `LinguisticSpin` — articleId, sentenceText, startIndex, endIndex,
  valenceScore, explanationTag
- `MediaStakeholder` — publicationName, parentCompany, majorFunders[],
  fundingType (PRIVATE / STATE_BACKED / VC / PUBLIC)
- `Source` — name, domain, logoUrl, country, primaryBias, untrackedBias,
  ownershipData, factualRating, isStateBacked, articles[]
- `StoryCluster` — clusterKey, title, sourceCounts (7 buckets),
  breakingNewsMeta, neutralFacts

To move to Postgres:

```bash
npm i -D prisma && npm i @prisma/client
export DATABASE_URL=postgresql://…
npx prisma migrate dev --name init
```

Then replace the read/write calls in `src/store.js` with Prisma queries; the API
response shape does not change. Add `pgvector` and an `embedding` column when you
want semantic rather than TF-IDF clustering.

## Frontend

```
client/
  index.html   shell: topbar, tooltip, drawer, modal, toast
  styles.css   dark/light tokens, spectrum bars, highlight colours, drawer
  api.js       fetch wrapper for the endpoints above
  store.js     localStorage reading history + Balance Score + recommendations
  app.js       dashboard, ticker, X-Ray reader, consensus cards, drawer, balance
```

Card images load the feed picture, else the category placeholder, then upgrade
to the publisher's `og:image` as the card approaches the viewport (one cached
lookup per article). The ticker fetches `/api/topics` and sets `?q=` on the feed
when a tag is clicked.

Hash routes: `#/` (dashboard) and `#/story/:clusterId` (reader). Reading history
never leaves the device; it is pruned to seven days.

## Tests

`npm test` (62 cases) covers the analysis invariants (offsets resolve to the
quoted text, percentages sum to 100, hallucinated quotes dropped, fallbacks still
complete), bias rating/key-topic extraction, trend aggregation, placeholder
images, framing perspectives, consensus grouping, and stakeholder records. Tests
do not call the network or require a key.

## Data attribution

Published lean, factuality and ownership data in `src/bias.js` and
`src/stakeholders.js` are indicative, compiled from AllSides, Ad Fontes,
Media Bias/Fact Check and publisher disclosures. They describe publications, not
individual articles, and the UI attributes them as such. The offline analyser is
a transparent lexical list, not a trained classifier — treat its output as
indicative.
