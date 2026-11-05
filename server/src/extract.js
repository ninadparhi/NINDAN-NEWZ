// Full-article extraction for the reader view.
//
// The feeds only carry a teaser, and the news APIs cap `content` at ~200
// characters on free tiers, so the reader fetches the publisher's own page and
// runs Mozilla Readability over it (via @extractus/article-extractor). What
// comes back is turned into a small block list — paragraphs, headings, quotes,
// list items — instead of raw HTML, so the client can render it with real
// typography and nothing is injected into the page.
//
// Everything is cached twice: in memory here for a few hours, and on the
// archived story (store.js) so a restart keeps what was already fetched.
import { extract } from '@extractus/article-extractor';
import { decodeEntities, stripHtml } from './text.js';

const UA = 'DispatchNewsAggregator/1.1 (+reader view; links to and credits the publisher)';
const TTL = Math.max(1, +process.env.EXTRACT_CACHE_HOURS || 6) * 36e5;
const MAX_CACHE = 800;
const PARALLEL = 3;
const TIMEOUT = Math.max(4000, +process.env.EXTRACT_TIMEOUT_MS || 15000);
const MIN_WORDS = Math.max(40, +process.env.EXTRACT_MIN_WORDS || 120);

// Query parameters that only exist to track a visit. Dropped so the same story
// is one cache entry even when it arrives from the RSS feed, the ticker and a
// "also reported by" link.
const TRACKING = /^(utm_|at_|itm_|fbclid|gclid|cmpid|ref|referrer|publisher|partner|source=|campaign|smid|ocid|s_cid)/i;

export function canonicalUrl(input) {
  try {
    const url = new URL(String(input));
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

// Publisher furniture that Readability leaves in the body: ad labels, photo
// credits, share prompts, newsletter plugs. Nothing here is reporting.
const NOISE = [
  /^(advertisement|advertising|sponsored|story continues below|scroll to continue)/i,
  /^(read more|read also|also read|related stories|also see|watch:|listen:)\b/i,
  /^(share|share this|share on|follow us|subscribe|sign up|download the app)\b/i,
  /^(photo(graph)?|image|picture)\s*(credit|courtesy|source)?\s*:/i,
  /^(getty images|reuters|pti|ani|ap photo|file photo)\b/i,
  /^copyright\b/i,
];
const isNoise = (text) => NOISE.some((re) => re.test(text));

// HTML in, blocks out. <figure> is dropped entirely (the lead image is shown
// once, from the metadata), and any surviving tag is stripped before the text
// reaches the client.
export function blocksFromHtml(html = '') {
  const body = String(html)
    .replace(/<(script|style|noscript|form|iframe|aside|footer|nav)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<figure\b[\s\S]*?<\/figure>/gi, ' ')
    .replace(/<figcaption\b[\s\S]*?<\/figcaption>/gi, ' ')
    .replace(/<img\b[^>]*>/gi, ' ');

  const blocks = [];
  const push = (type, raw) => {
    // stripHtml decodes entities and removes publisher boilerplate ("The post …
    // appeared first on …"), which is exactly what a reader should not see.
    const text = stripHtml(raw).replace(/\s+/g, ' ').trim();
    if (text.length < 2 || isNoise(text)) return;
    const prev = blocks[blocks.length - 1];
    if (prev && prev.text === text) return;         // repeated pull-quote
    blocks.push({ type, text });
  };

  const re = /<(h[1-6]|p|blockquote|li|pre)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = re.exec(body))) {
    const tag = match[1].toLowerCase();
    const type = tag.startsWith('h') ? 'heading'
      : tag === 'blockquote' ? 'quote'
        : tag === 'li' ? 'list' : 'paragraph';
    push(type, match[2]);
  }

  // Some publishers return plain text with no block markup at all.
  if (!blocks.length) {
    for (const chunk of decodeEntities(body).split(/\n{2,}/)) push('paragraph', chunk);
  }
  return blocks;
}

const PAYWALL = [
  /subscribe (now )?to (continue|read|keep reading)/i,
  /to continue reading[, ]/i,
  /this (article|story|content) is (for|available to) subscribers/i,
  /already a subscriber\??\s*(sign in|log in)/i,
  /(sign|log) in to (continue|read|keep reading)/i,
  /you('ve| have) reached your (free )?(article )?limit/i,
  /premium (content|story|article)/i,
  /register (for free )?to (continue|read)/i,
];
const BLOCKED = [
  /enable javascript and cookies to continue/i,
  /checking your browser before accessing/i,
  /access denied/i,
  /are you a robot/i,
  /request unsuccessful\.? incapsula/i,
];

export const detectPaywall = (html = '') => PAYWALL.some((re) => re.test(String(html)));
export const detectBlocked = (html = '') => BLOCKED.some((re) => re.test(String(html)));

const cleanAuthor = (value = '') => String(value)
  .replace(/^\s*by\s+/i, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 120) || null;

const cleanDate = (value) => {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
};

// One shape for the client, whatever the extractor managed to find.
export function normalizeArticle(raw, url, { fetchedAt = new Date().toISOString() } = {}) {
  const base = {
    url, canonicalUrl: canonicalUrl(url) || url, status: 'unavailable', paywall: false,
    title: null, author: null, publishedAt: null, leadImage: null, siteName: null,
    blocks: [], fullContent: [], wordCount: 0, reason: null, fetchedAt,
  };
  if (!raw || !raw.content) {
    return { ...base, reason: 'The publisher did not return a readable article.' };
  }

  const blocks = blocksFromHtml(raw.content);
  const fullContent = blocks.map((b) => b.text);
  const text = fullContent.join(' ');
  const wordCount = (text.match(/[A-Za-z0-9'’-]+/g) || []).length;
  const paywall = detectPaywall(`${raw.content} ${raw.description || ''}`);

  let status = 'ok';
  let reason = null;
  if (wordCount < MIN_WORDS) {
    if (paywall) { status = 'paywalled'; reason = 'This publisher keeps the rest of the article behind a subscription.'; }
    else if (detectBlocked(raw.content)) { status = 'blocked'; reason = 'The publisher blocked automated reading of this page.'; }
    else { status = 'unavailable'; reason = 'Only a teaser could be read from this page.'; }
  } else if (paywall) {
    status = 'partial';
    reason = 'The publisher shows the opening of this article for free; the rest is behind a subscription.';
  }

  return {
    ...base,
    status, paywall, reason,
    title: raw.title ? stripHtml(raw.title) : null,
    author: cleanAuthor(raw.author),
    publishedAt: cleanDate(raw.published),
    leadImage: raw.image || null,
    siteName: raw.source || null,
    blocks, fullContent, wordCount,
  };
}

// Same concurrency gate the og:image lookup uses: a reader clicking through the
// feed should not fire twenty publisher requests at once.
const cache = new Map();
const queue = [];
let active = 0;

function run() {
  while (active < PARALLEL && queue.length) {
    const job = queue.shift();
    active += 1;
    job().finally(() => { active -= 1; run(); });
  }
}
const gate = (fn) => new Promise((resolve) => {
  queue.push(() => fn().then(resolve, (e) => resolve({ error: e })));
  run();
});

const fetcher = (url) => fetch(url, {
  headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
  redirect: 'follow',
  signal: AbortSignal.timeout(TIMEOUT),
});

async function fetchAndParse(url) {
  const fetchedAt = new Date().toISOString();
  try {
    const raw = await extract(url, {}, fetcher);
    return normalizeArticle(raw, url, { fetchedAt });
  } catch (error) {
    return {
      ...normalizeArticle(null, url, { fetchedAt }),
      status: 'unavailable',
      reason: error?.name === 'TimeoutError'
        ? 'The publisher took too long to answer.'
        : 'This page could not be read automatically.',
    };
  }
}

/**
 * Full article for a publisher URL.
 * @param {string} url
 * @param {{ refresh?: boolean }} options refresh bypasses both caches
 */
export async function fullArticle(url, { refresh = false } = {}) {
  const key = canonicalUrl(url);
  if (!key || !/^https?:/i.test(key)) {
    return { ...normalizeArticle(null, String(url || '')), status: 'unavailable', reason: 'Not an http(s) article URL.' };
  }

  const hit = cache.get(key);
  if (!refresh && hit && Date.now() - hit.at < TTL) return hit.article;
  // A failed extraction is remembered briefly, so a broken page is not retried
  // on every page view.
  if (!refresh && hit && hit.article.status === 'unavailable' && Date.now() - hit.at < 10 * 60000) {
    return hit.article;
  }

  const result = await gate(() => fetchAndParse(key));
  if (result?.error) {
    return {
      ...normalizeArticle(null, key),
      status: 'unavailable',
      reason: 'This page could not be read automatically.',
    };
  }

  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { article: result, at: Date.now() });
  return result;
}

export const extractStats = () => ({ cached: cache.size, active, queued: queue.length });
