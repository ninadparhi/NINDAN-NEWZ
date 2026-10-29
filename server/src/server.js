import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fetchAll } from './fetcher.js';
import { CATEGORIES, FEEDS } from './feeds.js';
import { LEANS, LEAN_BUCKETS, SOURCE_META, bucketCountsOf } from './bias.js';
import { loadArchive, mergeIntoStore, snapshot, daysAvailable, dayIn } from './store.js';

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
    if (articles.length) mergeIntoStore(articles); // archive keeps last good data on failure
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
cron.schedule(`*/${EVERY} * * * *`, refresh);

app.use(compression());
app.use(cors(process.env.CLIENT_ORIGIN ? { origin: process.env.CLIENT_ORIGIN } : {}));

const tzOf = (q) => {
  const n = Number(q);
  return Number.isFinite(n) ? Math.max(-840, Math.min(840, n)) : 0;
};

app.get('/api/news', (req, res) => {
  const { region, category, source, date, q, limit = 60, offset = 0 } = req.query;
  const tz = tzOf(req.query.tz);
  const needle = q?.toLowerCase();
  const { articles, updatedAt } = snapshot();
  const rows = articles.filter((a) =>
    (!region || a.region === region) && (!category || a.category === category) &&
    (!source || a.source === source || a.alsoReportedBy.some((x) => x.source === source)) &&
    (!date || dayIn(a.publishedAt, tz) === date) &&
    (!needle || `${a.title} ${a.summary} ${a.source}`.toLowerCase().includes(needle)));
  res.set('Cache-Control', 'public, max-age=120');
  res.json({
    updatedAt,
    total: rows.length,
    articles: rows.slice(+offset, +offset + +limit).map((a) => ({
      ...a,
      coverage: 1 + a.alsoReportedBy.length,
      coverageBuckets: coverageBuckets(a),
    })),
  });
});

app.get('/api/news/:id', (req, res) => {
  const a = snapshot().articles.find((x) => x.id === req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  res.json({ ...a, coverage: 1 + a.alsoReportedBy.length, coverageBuckets: coverageBuckets(a) });
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
    sources: [...sources].sort(),
    sourceMeta: SOURCE_META,
    apiSources: [
      process.env.NEWSAPI_KEY && 'NewsAPI',
      process.env.GNEWS_API_KEY && 'GNews',
      process.env.NEWSDATA_API_KEY && 'NewsData.io',
      process.env.GUARDIAN_API_KEY && 'The Guardian API',
    ].filter(Boolean),
    feedCount: FEEDS.length,
    updatedAt: snapshot().updatedAt,
  });
});

app.get('/api/breaking', (_req, res) =>
  res.json(snapshot().articles.slice(0, 12).map(({ id, title, source, url }) => ({ id, title, source, url }))));

// Serve the built client in production (single-service deploy, e.g. Render)
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
app.use(express.static(dist, { maxAge: '1h', index: false }));
app.get('/api/*', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));
app.get('*', (_req, res, next) => res.sendFile(path.join(dist, 'index.html'), (e) => e && next()));

function coverageBuckets(a) {
  return bucketCountsOf([a, ...a.alsoReportedBy]);
}

app.listen(PORT, () => console.log(`API on :${PORT}`));
