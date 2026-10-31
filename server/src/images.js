// Social-card image lookup for articles whose RSS item carried no picture.
// We read the publisher's own og:image / twitter:image, which every news site
// already publishes for link previews. Results are cached in memory and the
// fetch is gated to a few parallel requests so a page of 60 cards cannot
// hammer the publishers.
const UA = 'DispatchNewsAggregator/1.1 (+link previews; reads og:image only)';
const TTL = 7 * 864e5;
const MAX = 3000;
const PARALLEL = 4;

const cache = new Map();
const queue = [];
let active = 0;

const decode = (s = '') =>
  s.replace(/&amp;/g, '&').replace(/&#0?38;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function attr(tag, name) {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? decode(m[2] ?? m[3] ?? '') : '';
}

function pick(html) {
  const tags = html.match(/<meta\b[^>]*>|<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'rel')).toLowerCase();
    if (key === 'og:image' || key === 'og:image:url' || key === 'og:image:secure_url'
      || key === 'twitter:image' || key === 'twitter:image:src' || key === 'image_src') {
      const url = attr(tag, 'content') || attr(tag, 'href');
      if (url) return url;
    }
  }
  return null;
}

async function lookup(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('html')) return null;
  const html = (await res.text()).slice(0, 400000); // the head is always near the top
  const found = pick(html);
  if (!found) return null;
  try {
    return new URL(found, res.url).toString();
  } catch {
    return null;
  }
}

function run() {
  while (active < PARALLEL && queue.length) {
    const job = queue.shift();
    active++;
    job().finally(() => { active--; run(); });
  }
}

const gate = (fn) => new Promise((resolve) => {
  queue.push(() => fn().then(resolve, () => resolve(null)));
  run();
});

export async function ogImage(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.image;

  const image = await gate(() => lookup(url));
  // Negative results are cached too, just for less time, so a broken page is
  // not retried on every request.
  if (cache.size > MAX) cache.delete(cache.keys().next().value);
  cache.set(url, { image, at: Date.now() - (image ? 0 : TTL - 6 * 36e5) });
  return image;
}

// ------------------------------------------------------------ placeholders
//
// Last resort for a card with no picture anywhere: a stable Unsplash news
// photograph chosen by section. The ids are fixed, so the same section always
// looks the same and nothing is fetched from a randomiser on every render.
const unsplash = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=960&q=65`;

const CATEGORY_IMAGES = {
  Politics: unsplash('photo-1529107386315-e1a2ed48a620'),
  Business: unsplash('photo-1611974789855-9c2a0a7236a3'),
  Technology: unsplash('photo-1518770660439-4636190af475'),
  Science: unsplash('photo-1507413245164-6160d8298b31'),
  Health: unsplash('photo-1576091160399-112ba8d25d1d'),
  Sports: unsplash('photo-1461896836934-ffe607ba8211'),
  Entertainment: unsplash('photo-1489599849927-2ee91cede3ba'),
  World: unsplash('photo-1526778548025-fa2f459cd5c1'),
  India: unsplash('photo-1524492412937-b28074a5d7da'),
};

const DEFAULT_IMAGE = unsplash('photo-1495020689067-958852a7765e');

export const PLACEHOLDER_IMAGES = Object.freeze({ ...CATEGORY_IMAGES, default: DEFAULT_IMAGE });

export const placeholderImage = (category) => CATEGORY_IMAGES[category] || DEFAULT_IMAGE;
