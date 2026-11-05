import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAll } from './fetcher.js';
import { CATEGORIES, FEEDS } from './feeds.js';
import {
  LEANS, LEAN_BUCKETS, bucketCountsOf, RATING_PROVIDERS, FACTUALITY, OWNER_TYPES, isBlindspot, sourceDirectory,
} from './bias.js';
import { loadArchive, mergeIntoStore, snapshot, daysAvailable, dayIn, setFullArticle, archivedFullArticle } from './store.js';
import { ogImage, placeholderImage } from './images.js';
import { cutWords } from './text.js';
import { analyzeArticle } from './analyze.js';
import { framingOf } from './framing.js';
import { stakeholderOf } from './stakeholders.js';
import { trendingTopics } from './topics.js';
import { llmStatus } from './llm.js';
import { precomputeAnalyses } from './precompute.js';
import { fullArticle } from './extract.js';

const app = express();
const PORT = process.env.PORT || 3001;
const EVERY = Math.max(15, Math.min(30, +process.env.REFRESH_MINUTES || 20));

loadArchive();

let busy = false;
let retry = null;
async function refresh() {
  if (busy) return;
  busy = true;
  try {
    const articles = await fetchAll();
    if (articles.length) {
      mergeIntoStore(articles); // archive keeps last good data on failure
      // Score new stories once, off the request path, and persist the result.
      const max = Math.max(0, Number(process.env.PRECOMPUTE_MAX) || 40);
      precomputeAnalyses({ limit: max })
        .then(({ processed }) => processed && console.log(`precomputed: ${processed} story analyses`))
        .catch((e) => console.warn('precompute failed:', e.message));
    }
    console.log(`refreshed: ${articles.length} stories, ${snapshot().articles.length} archived`);
    if (!articles.length) scheduleRetry();
  } catch (e) {
    console.error('refresh error', e.message);
    scheduleRetry();
  }
  busy = false;
}
function scheduleRetry() {
  clearTimeout(retry);
  retry = setTimeout(refresh, 60000);
}
refresh();
// Score whatever the restored archive is still missing, then keep it topped up
// on each refresh.
precomputeAnalyses({ limit: Math.max(0, Number(process.env.PRECOMPUTE_MAX) || 40) }).catch(() => {});
cron.schedule(`*/${EVERY} * * * *`, refresh);

app.use(compression());
app.use(cors(process.env.CLIENT_ORIGIN ? { origin: process.env.CLIENT_ORIGIN } : {}));
app.use(express.json({ limit: '1mb' }));

const tzOf = (q) => {
  const n = Number(q);
  return Number.isFinite(n) ? Math.max(-840, Math.min(840, n)) : 0;
};

// Feed picture first, then a category placeholder. The client only asks
// /api/image for a publisher's og:image when it gets a placeholder, so a page
// load never waits on dozens of publisher requests.
function imageFields(a) {
  if (a.image) return { image: a.image, imageUrl: a.image, imageSource: 'feed' };
  return { imageUrl: placeholderImage(a.category), imageSource: 'placeholder' };
}

// Cards receive the analysis summary (no text or highlight list) so the feed
// payload stays small while the scores are already precomputed.
function analysisBrief(a) {
  const x = a.analysis;
  if (!x) return null;
  return {
    bias: x.bias,
    biasRating: x.biasRating,
    biasPercentage: x.biasPercentage,
    biasRationale: x.biasRationale,
    simpleSummary: x.simpleSummary,
    keyTopics: x.keyTopics,
    method: x.method,
    engine: x.engine,
    analyzedAt: x.analyzedAt,
  };
}

app.get('/api/news', (req, res) => {
  const { region, category, source, date, q, limit = 60, offset = 0 } = req.query;
  const tz = tzOf(req.query.tz);
  const needle = q?.toLowerCase();
  const { articles, updatedAt } = snapshot();
  const rows = articles.filter((a) =>
    (!region || a.region === region) && (!category || a.category === category) &&
    (!source || a.source === source || a.alsoReportedBy.some((x) => x.source === source)) &&
    (!date || dayIn(a.publishedAt, tz) === date) &&
    (!needle || `${a.title} ${a.summary} ${a.detail || ''} ${a.source}`.toLowerCase().includes(needle)));
  res.set('Cache-Control', 'public, max-age=120');
  res.json({
    updatedAt,
    total: rows.length,
    articles: rows.slice(+offset, +offset + +limit).map((a) => {
      const coverageBuckets = bucketCountsOf([a, ...a.alsoReportedBy]);
      return {
        ...a,
        ...imageFields(a),
        analysis: analysisBrief(a),
        coverage: 1 + a.alsoReportedBy.length,
        coverageBuckets,
        blindspot: isBlindspot(coverageBuckets),
      };
    }),
  });
});

app.get('/api/news/:id', (req, res) => {
  const a = snapshot().articles.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const coverageBuckets = bucketCountsOf([a, ...a.alsoReportedBy]);
  res.json({
    ...a,
    ...imageFields(a),
    coverage: 1 + a.alsoReportedBy.length,
    coverageBuckets,
    blindspot: isBlindspot(coverageBuckets),
  });
});

// Full article for the reader view. The page is fetched and parsed on the
// server (never in the browser), cached in memory and on the archived row.
// `u` lets the reader open one of the other outlets covering the same story,
// but only URLs that belong to that cluster so this never becomes an open
// scraper proxy.
app.get('/api/news/:id/full', async (req, res) => {
  const story = snapshot().articles.find((x) => x.id === req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found' });

  const allowed = [story.url, ...story.alsoReportedBy.map((x) => x.url)].filter(Boolean);
  const wanted = req.query.u ? String(req.query.u) : story.url;
  const url = allowed.includes(wanted) ? wanted : story.url;
  const refresh = req.query.refresh === '1';

  const cached = refresh ? null : archivedFullArticle(url);
  const article = cached || await fullArticle(url, { refresh });
  if (!cached && article.status !== 'unavailable') setFullArticle(url, article);

  res.set('Cache-Control', refresh ? 'no-store' : 'public, max-age=1800');
  res.json({ ...article, storyId: story.id, source: story.source, outlets: allowed.length });
});

app.get('/api/days', (req, res) => {
  res.set('Cache-Control', 'public, max-age=120');
  res.json({ days: daysAvailable(tzOf(req.query.tz)) });
});

app.get('/api/meta', (_req, res) => {
  const sources = new Set(snapshot().articles.map((a) => a.source));
  for (const a of snapshot().articles) for (const x of a.alsoReportedBy) sources.add(x.source);
  res.json({
    categories: CATEGORIES,
    leans: LEANS,
    leanBuckets: LEAN_BUCKETS,
    factuality: FACTUALITY,
    ownerTypes: OWNER_TYPES,
    ratingProviders: RATING_PROVIDERS,
    sources: [...sources].sort(),
    sourceMeta: sourceDirectory(),
    apiSources: [
      process.env.NEWSAPI_KEY && 'NewsAPI',
      process.env.GNEWS_API_KEY && 'GNews',
      process.env.NEWSDATA_API_KEY && 'NewsData.io',
      process.env.GUARDIAN_API_KEY && 'The Guardian API',
    ].filter(Boolean),
    feedCount: FEEDS.length,
    updatedAt: snapshot().updatedAt,
    analysis: llmStatus(),
  });
});

// ---- NINDAN-NEWZ 2.0: framing, ownership and analysis ---------------------

// The analysis endpoint costs an LLM call, so it is budgeted per IP rather than
// openly available. The window is deliberately short: a reader opens a handful
// of stories, not a crawler.
const ANALYZE_WINDOW = 5 * 60e3;
const ANALYZE_MAX = Math.max(1, +process.env.ANALYZE_RATE_MAX || 20);
const analyzeHits = new Map();

function overBudget(ip) {
  const now = Date.now();
  const recent = (analyzeHits.get(ip) || []).filter((t) => now - t < ANALYZE_WINDOW);
  if (recent.length >= ANALYZE_MAX) {
    analyzeHits.set(ip, recent);
    return Math.ceil((ANALYZE_WINDOW - (now - recent[0])) / 1000);
  }
  recent.push(now);
  analyzeHits.set(ip, recent);
  if (analyzeHits.size > 5000) analyzeHits.clear();
  return 0;
}

// Accepts either raw text or an article URL. Without an LLM key (or when the
// provider rate-limits us) the response is still a usable analysis, marked
// `degraded` with a `reason` the UI shows.
app.post('/api/analyze-article', async (req, res) => {
  const wait = overBudget(req.ip || 'unknown');
  if (wait) {
    res.set('Retry-After', String(wait));
    return res.status(429).json({ error: 'Analysis rate limit reached. Try again shortly.', retryAfter: wait });
  }
  const { url, text, title, source, category, fallbackText } = req.body || {};
  if (!url && !text) return res.status(400).json({ error: 'Send either raw article text or an http(s) url' });
  try {
    const result = await analyzeArticle({
      url, text, title, source, category, fallbackText, force: req.body?.force === true,
    });
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (e) {
    res.status(e.status || 502).json({ error: e.message || 'Analysis failed' });
  }
});

// Trending = clusters that more than one outlet actually carried, ranked by
// breadth. This is the dashboard's "Bias Spectrum Bar" feed.
app.get('/api/trending', (req, res) => {
  const limit = Math.min(40, Math.max(1, +req.query.limit || 12));
  const { articles, updatedAt } = snapshot();
  const clusters = articles
    .filter((a) => a.alsoReportedBy?.length)
    .sort((a, b) => (b.alsoReportedBy.length - a.alsoReportedBy.length)
      || (new Date(b.latestAt) - new Date(a.latestAt)))
    .slice(0, limit)
    .map((a) => {
      const coverageBuckets = bucketCountsOf([a, ...a.alsoReportedBy]);
      return {
        id: a.id, title: a.title, summary: a.summary, detail: a.detail,
        source: a.source, url: a.url, lean: a.lean, ...imageFields(a),
        category: a.category, region: a.region, publishedAt: a.publishedAt,
        latestAt: a.latestAt, coverage: 1 + a.alsoReportedBy.length,
        sourceBreakdown: a.sourceBreakdown || null,
        sourceCounts: a.sourceCounts || null,
        analysis: analysisBrief(a),
        coverageBuckets, blindspot: isBlindspot(coverageBuckets),
      };
    });
  res.set('Cache-Control', 'public, max-age=120');
  res.json({ updatedAt, clusters });
});

// Trending topics for the ticker strip. Weighted by coverage breadth, so a
// subject only trends when more than one newsroom is carrying it.
app.get('/api/topics', (req, res) => {
  const limit = Math.min(30, Math.max(1, +req.query.limit || 14));
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ topics: trendingTopics(snapshot().articles, limit) });
});

// Comparative headlines for one story, grouped by the lean of each outlet.
app.get('/api/framing/:id', (req, res) => {
  const story = snapshot().articles.find((a) => a.id === req.params.id);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  res.set('Cache-Control', 'public, max-age=120');
  res.json(framingOf(story));
});

// Ownership graph behind the Global Framing drawer. Unknown publications still
// get a record, flagged `known: false`, so the drawer never breaks.
app.get('/api/stakeholder/:source', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(stakeholderOf(req.params.source));
});

// Lazy og:image lookup for cards whose feed item had no picture. The result is
// written back onto the archived story so later loads are instant.
app.get('/api/image', async (req, res) => {
  const url = String(req.query.u || '');
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'A http(s) article url is required' });
  const image = await ogImage(url);
  if (image) {
    const a = snapshot().articles.find((x) => x.url === url);
    if (a && !a.image) a.image = image;
  }
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({ image });
});

// Ticker items: one headline per event, at most two per outlet, cut at a word
// boundary so a long headline never ends mid-word.
const tickerKey = (t) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (t) => new Set(tickerKey(t).split(' ').filter((w) => w.length > 2));
const overlap = (a, b) => {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size || 1);
};

app.get('/api/breaking', (_req, res) => {
  const picked = [];
  const perSource = new Map();
  const seen = [];
  for (const a of snapshot().articles) {
    if (picked.length >= 14) break;
    if ((perSource.get(a.source) || 0) >= 2) continue;
    const w = words(a.title);
    if (w.size < 2 || seen.some((s) => overlap(s, w) >= 0.75)) continue;
    seen.push(w);
    perSource.set(a.source, (perSource.get(a.source) || 0) + 1);
    picked.push({ id: a.id, title: cutWords(a.title.replace(/\s+/g, ' ').trim(), 96), source: a.source, url: a.url, lean: a.lean });
  }
  res.json(picked);
});

// NINDAN-NEWZ 2.0 client. It lives in this repo and needs no build step, so the
// API and the UI deploy as one service.
const client = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'client');
// A browser can hold a cached client module after the shell that loads it has
// already updated (which is how /api.js without `topics()` survived a deploy).
// JS, CSS and HTML therefore revalidate on every load instead of trusting a TTL.
app.use(express.static(client, {
  maxAge: '1h',
  index: false,
  setHeaders: (res, filePath) => {
    if (/\.(?:js|css|html)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get('/api/*', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));
app.get('*', (_req, res, next) => {
  // The shell must always be revalidated, so a new build is picked up on a
  // normal reload rather than held by a proxy or the browser cache.
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(client, 'index.html'), (e) => e && next());
});

function coverageBuckets(a) {
  return bucketCountsOf([a, ...a.alsoReportedBy]);
}

app.listen(PORT, () => console.log(`API on :${PORT}`));
