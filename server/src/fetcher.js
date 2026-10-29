import Parser from 'rss-parser';
import crypto from 'crypto';
import { FEEDS } from './feeds.js';
import { biasOf } from './bias.js';
import { excerpt, cutWords, sentences, stripHtml } from './text.js';
import { classify } from './classify.js';

const UA = 'NewsAggregator/1.0 (+headline aggregator; links to originals)';
const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': UA },
  customFields: { item: [['media:content', 'media'], ['media:thumbnail', 'thumb'], ['content:encoded', 'full']] },
});

// Text helpers live in text.js: HTML + entity cleanup, sentence splitting that
// keeps initials and abbreviations intact, and word-boundary cutting.
const strip = stripHtml;
const clip = cutWords;
const sentencesOf = (text) => sentences(text).filter((s) => s.length > 30);
const id = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);

function pickImage(i) {
  return i.enclosure?.type?.startsWith('image') && i.enclosure.url
    || i.media?.$?.url || i.thumb?.$?.url
    || (i.full || i.content || '').match(/<img[^>]+src=["']([^"']+)/i)?.[1] || null;
}

function normalize(i, feed) {
  const text = strip(i.full || i.content || i.contentSnippet || i.summary || '');
  const base = strip(i.contentSnippet || i.summary || '') || text;
  if (!i.title || !i.link) return null;
  const time = new Date(i.isoDate || i.pubDate || Date.now());
  const title = strip(i.title);
  const summary = excerpt(base || text, 300);
  const detail = excerpt(text || base, 900);
  const { region, category } = classify({
    title, summary, detail, feedRegion: feed.region, feedCategory: feed.category,
  });
  return {
    id: id(i.link),
    title,
    // Card teaser: whole sentences, so it never stops mid-word or mid-clause.
    summary: summary.toLowerCase() === title.toLowerCase() ? '' : summary,
    detail,                                 // detail view: still an excerpt, never the full article
    keyPoints: sentences(text).filter((s) => s.length >= 40).slice(0, 4).map((s) => clip(s, 200)),
    image: pickImage(i),
    publishedAt: isNaN(time) ? new Date().toISOString() : time.toISOString(),
    category, region, source: feed.source,
    author: i.creator || i.author || null,
    url: i.link,
    ...biasOf(feed.source),
    alsoReportedBy: [],
  };
}

async function fromFeed(feed) {
  const res = await parser.parseURL(feed.url);
  return res.items.slice(0, 30).map((i) => normalize(i, feed)).filter(Boolean);
}

// Optional Guardian Content API (key stays server-side)
const GSEC = { world: 'Politics', politics: 'Politics', business: 'Business', technology: 'Technology',
  science: 'Science', sport: 'Sports', society: 'Health', culture: 'Entertainment', film: 'Entertainment' };
async function fromGuardian(key) {
  const u = `https://content.guardianapis.com/search?show-fields=trailText,thumbnail,byline&page-size=40&order-by=newest&api-key=${key}`;
  const { response } = await (await fetch(u)).json();
  return (response?.results || []).map((r) => {
    const text = strip(r.fields?.trailText || '');
    return { id: id(r.webUrl), title: strip(r.webTitle), summary: excerpt(text, 300), detail: excerpt(text, 900),
      keyPoints: [], image: r.fields?.thumbnail || null, publishedAt: r.webPublicationDate,
      category: GSEC[r.sectionId] || 'Politics', region: 'world', source: 'The Guardian',
      author: r.fields?.byline || null, url: r.webUrl, ...biasOf('The Guardian'), alsoReportedBy: [] };
  });
}

// ---- Optional free-API adapters (Reuters / AP / PTI etc. have no public RSS) ----
// Each key is optional: without it the adapter is skipped and RSS alone is used.
// API results are cached in memory so a 20-minute refresh loop doesn't exhaust free tiers.
const API_CATEGORY = { business: 'Business', technology: 'Technology', science: 'Science', sports: 'Sports', health: 'Health', entertainment: 'Entertainment', politics: 'Politics' };

function apiArticle({ title, text, source, author, url, image, publishedAt, region, category }) {
  const clean = strip(text || '');
  const time = new Date(publishedAt || Date.now());
  if (!title || !url) return null;
  const cleanTitle = strip(title);
  const summary = excerpt(clean, 300);
  const guess = classify({
    title: cleanTitle, summary, detail: excerpt(clean, 900),
    feedRegion: region, feedCategory: API_CATEGORY[String(category || '').toLowerCase()] || 'Politics',
  });
  return {
    id: id(url), title: cleanTitle, summary, detail: excerpt(clean, 900),
    keyPoints: sentencesOf(clean).slice(0, 4).map((s) => clip(s, 200)),
    image: image || null, publishedAt: isNaN(time) ? new Date().toISOString() : time.toISOString(),
    category: guess.category, region: guess.region, source, author: author || null, url,
    ...biasOf(source), alsoReportedBy: [],
  };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}
const countries = [['in', 'india'], ['us', 'world']];

async function fromNewsApi(key) {
  const out = [];
  for (const [country, region] of countries) {
    const j = await getJson(`https://newsapi.org/v2/top-headlines?country=${country}&pageSize=100&apiKey=${encodeURIComponent(key)}`);
    for (const a of j.articles || []) {
      if (!a.title || !a.url || a.title === '[Removed]') continue;
      out.push(apiArticle({ title: a.title, text: a.description || a.content, source: a.source?.name || 'NewsAPI',
        author: a.author, url: a.url, image: a.urlToImage, publishedAt: a.publishedAt, region,
        category: '' }));
    }
  }
  return out.filter(Boolean);
}

async function fromGNews(key) {
  const out = [];
  for (const [country, region] of countries) {
    const j = await getJson(`https://gnews.io/api/v4/top-headlines?category=general&lang=en&country=${country}&max=10&apikey=${encodeURIComponent(key)}`);
    for (const a of j.articles || []) {
      out.push(apiArticle({ title: a.title, text: a.description || a.content, source: a.source?.name || 'GNews',
        author: null, url: a.url, image: a.image, publishedAt: a.publishedAt, region,
        category: '' }));
    }
  }
  return out.filter(Boolean);
}

async function fromNewsData(key) {
  const out = [];
  for (const [country, region] of countries) {
    const j = await getJson(`https://newsdata.io/api/1/latest?apikey=${encodeURIComponent(key)}&country=${country}&language=en`);
    for (const a of j.results || []) {
      const when = a.pubDate ? a.pubDate.replace(' ', 'T') + 'Z' : null;
      out.push(apiArticle({ title: a.title, text: a.description || a.content, source: a.source_name || 'NewsData',
        author: Array.isArray(a.creator) ? a.creator.join(', ') : a.creator, url: a.link, image: a.image_url,
        publishedAt: when, region, category: a.category?.[0] || '' }));
    }
  }
  return out.filter(Boolean);
}

let apiCache = { at: 0, items: [] };
export async function apiItems() {
  const keys = [
    ['NEWSAPI_KEY', 'NewsAPI', fromNewsApi],
    ['GNEWS_API_KEY', 'GNews', fromGNews],
    ['NEWSDATA_API_KEY', 'NewsData.io', fromNewsData],
  ].filter(([env]) => process.env[env]);
  if (!keys.length) return [];
  const ttl = Math.max(30, +process.env.API_REFRESH_MINUTES || 60) * 60000;
  if (Date.now() - apiCache.at < ttl) return apiCache.items;
  const results = await Promise.allSettled(keys.map(([, , fn], n) => fn(process.env[keys[n][0]])));
  const items = results.flatMap((r, n) => {
    if (r.status === 'rejected') { console.warn(`${keys[n][1]} failed:`, r.reason?.message); return []; }
    return r.value;
  });
  if (items.length) apiCache = { at: Date.now(), items };   // retry sooner if every API failed
  return apiCache.items;
}

// Clustering into stories happens in cluster.js, against the archive, so that
// story ids stay stable across refreshes. Here we only normalise and dedupe by
// URL, which is what stops the same link arriving from two feeds twice.
// A handful of feeds at a time: 70 parallel requests get us rate-limited.
const mapLimit = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = { status: 'fulfilled', value: await fn(items[i]) }; }
      catch (e) { out[i] = { status: 'rejected', reason: e }; }
    }
  }));
  return out;
};

export async function fetchAll() {
  const targets = [...FEEDS.map((f) => ({ url: f.url, run: () => fromFeed(f) }))];
  if (process.env.GUARDIAN_API_KEY) {
    targets.push({ url: 'guardian-api', run: () => fromGuardian(process.env.GUARDIAN_API_KEY) });
  }
  const [results, apis] = await Promise.all([
    mapLimit(targets, 8, (t) => t.run()),
    apiItems().catch(() => []),
  ]);
  results.forEach((r, n) => r.status === 'rejected' && console.warn('feed failed:', targets[n]?.url, r.reason?.message));
  const cutoff = Date.now() - 7 * 864e5;
  const seen = new Set();
  const all = [...apis, ...results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))]
    .filter((a) => a && new Date(a.publishedAt) > cutoff && !seen.has(a.url) && seen.add(a.url))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return all.slice(0, 4000);
}
