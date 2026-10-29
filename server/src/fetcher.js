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
  const sentences = sentencesOf(text);
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

// ---- duplicate detection: title token containment ----
// Headlines for the same event are worded very differently by different
// outlets, so Jaccard is too strict. We compare shared distinctive tokens
// against the shorter headline and require at least 3 shared words.
const STOP = new Set('with from that this have will after over into about their says said amid than what when who how why for and the are was has also more than says'.split(' '));
const tokens = (t) => new Set(t.toLowerCase().replace(/\s[-|–]\s[^-|–]{2,60}$/, '')
  .replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
const similarity = (a, b) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return { shared: n, score: n / (Math.min(a.size, b.size) || 1) };
};

export function dedupe(items) {
  const out = [];
  for (const it of items) {
    const tk = tokens(it.title);
    const hit = out.find((o) => {
      if (o.source === it.source || o._tk.size < 3 || tk.size < 3) return false;
      const { shared, score } = similarity(o._tk, tk);
      return shared >= 3 && score >= 0.5;
    });
    if (hit) {
      if (!hit.alsoReportedBy.some((a) => a.source === it.source)) {
        hit.alsoReportedBy.push({
          source: it.source, url: it.url, title: it.title,
          publishedAt: it.publishedAt, lean: it.lean || 'unrated',
        });
      }
      if (!hit.image && it.image) hit.image = it.image;
    } else out.push(Object.assign(it, { _tk: tk }));
  }
  return out.map(({ _tk, ...rest }) => rest);
}

export async function fetchAll() {
  const jobs = FEEDS.map((f) => fromFeed(f));
  if (process.env.GUARDIAN_API_KEY) jobs.push(fromGuardian(process.env.GUARDIAN_API_KEY));
  const [results, apis] = await Promise.all([Promise.allSettled(jobs), apiItems().catch(() => [])]);
  results.forEach((r, n) => r.status === 'rejected' && console.warn('feed failed:', FEEDS[n]?.url || 'guardian', r.reason?.message));
  const cutoff = Date.now() - 7 * 864e5;
  const seen = new Set();
  const all = [...apis, ...results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))]
    .filter((a) => a && new Date(a.publishedAt) > cutoff && !seen.has(a.url) && seen.add(a.url))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return dedupe(all).slice(0, 3000);
}
