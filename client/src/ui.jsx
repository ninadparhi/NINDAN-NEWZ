import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from './router.jsx';

export const TZ = -new Date().getTimezoneOffset();
export const api = (path, params = {}) => {
  const qs = new URLSearchParams(Object.entries({ ...params, tz: TZ }).filter(([, v]) => v !== '' && v != null));
  return fetch(`/api/${path}${qs ? '?' + qs : ''}`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)));
};

export const ago = (iso) => {
  const m = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000));
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};
export const full = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
export const localDay = (offset = 0) => new Date(Date.now() - offset * 864e5).toLocaleDateString('en-CA');
export function dayLabel(date) {
  const today = localDay(0);
  const yest = localDay(1);
  if (date === today) return 'Today';
  if (date === yest) return 'Yesterday';
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export const LEANS = {
  left: { label: 'Left', dot: 'bg-leanLeft', chip: 'border-leanLeft/30 bg-leanLeft/10 text-leanLeft' },
  'center-left': { label: 'Center-left', dot: 'bg-leanCenterLeft', chip: 'border-leanCenterLeft/30 bg-leanCenterLeft/10 text-leanCenterLeft' },
  center: { label: 'Center', dot: 'bg-leanCenter', chip: 'border-leanCenter/30 bg-leanCenter/10 text-leanCenter' },
  'center-right': { label: 'Center-right', dot: 'bg-leanCenterRight', chip: 'border-leanCenterRight/30 bg-leanCenterRight/10 text-leanCenterRight' },
  right: { label: 'Right', dot: 'bg-leanRight', chip: 'border-leanRight/30 bg-leanRight/10 text-leanRight' },
  unrated: { label: 'Unrated', dot: 'bg-leanNone', chip: 'border-line bg-surface2 text-muted' },
};
export const leanInfo = (lean) => LEANS[lean] || LEANS.unrated;

// Mirror of LEAN_BUCKETS in server/src/bias.js. Every chip, legend, bar and
// summary reads from this list so the five levels never disagree.
export const BUCKETS = [
  { key: 'left', label: 'Left', className: 'bg-leanLeft', text: 'text-leanLeft' },
  { key: 'center-left', label: 'Center-left', className: 'bg-leanCenterLeft', text: 'text-leanCenterLeft' },
  { key: 'center', label: 'Center', className: 'bg-leanCenter', text: 'text-leanCenter' },
  { key: 'center-right', label: 'Center-right', className: 'bg-leanCenterRight', text: 'text-leanCenterRight' },
  { key: 'right', label: 'Right', className: 'bg-leanRight', text: 'text-leanRight' },
  { key: 'unrated', label: 'Unrated', className: 'bg-leanNone', text: 'text-muted' },
];
export const RATED_BUCKETS = BUCKETS.filter((b) => b.key !== 'unrated');
export const bucketOf = (lean) => (LEANS[lean] && lean !== 'unrated' ? LEANS[lean] : LEANS.unrated);
export const emptyCounts = () => Object.fromEntries(BUCKETS.map((b) => [b.key, 0]));

export function BiasChip({ lean, className = '' }) {
  const info = leanInfo(lean);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${info.chip} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} aria-hidden />
      {info.label}
    </span>
  );
}

// Publisher metadata (lean, factuality, ownership) is fetched once and shared.
let metaPromise = null;
export const getMeta = () => {
  if (!metaPromise) metaPromise = fetch('/api/meta').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return metaPromise;
};
export function useMeta() {
  const [meta, setMeta] = useState(null);
  useEffect(() => { let live = true; getMeta().then((m) => live && setMeta(m)); return () => { live = false; }; }, []);
  return meta;
}
export const sourceInfo = (meta, source) => meta?.sourceMeta?.[source] || {
  lean: 'unrated', factuality: 'unknown', ownership: { parent: 'Unknown', type: 'independent' }, ratings: [],
};
export const FACTUALITY_LABEL = { high: 'High', mixed: 'Mixed', low: 'Low', unknown: 'Unrated' };
export const OWNER_LABEL = { corporate: 'Corporate', govt: 'Public / state', independent: 'Independent', trust: 'Trust / nonprofit' };
export const providerNames = (meta, keys = []) =>
  keys.map((k) => meta?.ratingProviders?.[k]?.name).filter(Boolean).join(', ');

export const outlets = (a) => [
  { source: a.source, url: a.url, lean: a.lean, title: a.title, publishedAt: a.publishedAt, author: a.author },
  ...(a.alsoReportedBy || []),
];

export const bucketCounts = (a) => {
  const out = emptyCounts();
  for (const o of outlets(a)) out[LEANS[o.lean] ? o.lean : 'unrated'] += 1;
  return out;
};
export const bucketTotal = (b) => BUCKETS.reduce((n, x) => n + (b[x.key] || 0), 0);

// The bucket with the most outlets; ties go to the primary source's own lean.
export function dominantBucket(a) {
  const counts = bucketCounts(a);
  let best = bucketOf(a.lean);
  let n = -1;
  for (const b of RATED_BUCKETS) {
    if ((counts[b.key] || 0) > n) { n = counts[b.key] || 0; best = b; }
  }
  return best;
}

export const leanGroup = (lean) => (lean === 'left' || lean === 'center-left' ? 'left'
  : lean === 'right' || lean === 'center-right' ? 'right' : 'center');
export const GROUPS = [
  { key: 'left', label: 'Left', note: 'left + center-left', dot: 'bg-leanLeft' },
  { key: 'center', label: 'Center', note: 'centre', dot: 'bg-leanCenter' },
  { key: 'right', label: 'Right', note: 'center-right + right', dot: 'bg-leanRight' },
];

const STOP_WORDS = new Set('a an the and or but if of on in at to for from with by as is are was were be been being has have had will would can could should may might not no its it this that these those he she they them his her their we you our your i about after before during over under between against amid into out up down more most less than then so such also just now new news live update updates says said say told who what when where why how'.split(' '));
export const titleWords = (title = '') => title.toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .split(' ')
  .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

export const coverageLabel = (b) => {
  const total = bucketTotal(b) - (b.unrated || 0);
  if (total <= 1) return 'Single-source story';
  const sums = {
    Left: (b.left || 0) + (b['center-left'] || 0),
    Center: b.center || 0,
    Right: (b.right || 0) + (b['center-right'] || 0),
  };
  const present = Object.keys(sums).filter((g) => sums[g]);
  if (present.length === 1) return `${present[0]}-only coverage`;
  if (sums.Left && sums.Right) return 'Coverage spans left and right';
  return 'Mostly centrist coverage';
};

export function CoverageBar({ counts, className = 'h-2' }) {
  const total = BUCKETS.reduce((n, b) => n + (counts[b.key] || 0), 0) || 1;
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-surface2 ${className}`} role="img"
      aria-label={BUCKETS.map((b) => `${b.label}: ${counts[b.key] || 0}`).join(', ')}>
      {BUCKETS.filter((b) => counts[b.key]).map((b) => (
        <span key={b.key} className={b.className} style={{ width: `${((counts[b.key] || 0) / total) * 100}%` }} />
      ))}
    </div>
  );
}

const initials = (s = '') =>
  s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '•';
const hueOf = (s = '') => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

// Publisher-branded stand-in: the outlet's initials in a stable hue derived
// from its name, plus the category. Better than a blank grey rectangle, and it
// carries the same information the image would have.
function BrandedPlaceholder({ source, category }) {
  const h = hueOf(source);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface2 dark:bg-surface2">
      <span className="grid h-11 w-11 place-items-center rounded-xl font-head text-sm font-bold text-white shadow-sm"
        style={{ backgroundColor: `hsl(${h} 34% 38%)` }} aria-hidden>
        {initials(source)}
      </span>
      <span className="px-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{source}</span>
      {category && <span className="text-[10px] text-muted/80">{category}</span>}
    </div>
  );
}

// Image with three steps: the feed's own picture, then the publisher's
// og:image (fetched lazily once the slot is near the viewport), then a
// source-branded placeholder. Never a blank box.
export function Image({ src, fallbackUrl, source = '', category = '', alt = '', className = '' }) {
  const [current, setCurrent] = useState(src || null);
  const [dead, setDead] = useState(false);
  const asked = useRef(false);
  const box = useRef(null);

  const askPublisher = useCallback(() => {
    if (asked.current || !fallbackUrl) { setDead(true); return; }
    asked.current = true;
    fetch(`/api/image?u=${encodeURIComponent(fallbackUrl)}`)
      .then((r) => (r.ok ? r.json() : { image: null }))
      .then(({ image }) => { if (image) { setCurrent(image); setDead(false); } else setDead(true); })
      .catch(() => setDead(true));
  }, [fallbackUrl]);

  useEffect(() => {
    if (current || dead || !fallbackUrl) return;
    const el = box.current;
    if (!el || typeof IntersectionObserver === 'undefined') { askPublisher(); return undefined; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); askPublisher(); }
    }, { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [current, dead, fallbackUrl, askPublisher]);

  return (
    <div ref={box} className={`relative overflow-hidden ${className}`}>
      {current && !dead ? (
        <img src={current} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          onError={() => { setCurrent(null); askPublisher(); }}
          className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <BrandedPlaceholder source={source} category={category} />
      )}
    </div>
  );
}

export function Card({ a, featured = false }) {
  const counts = useMemo(() => bucketCounts(a), [a]);
  const n = 1 + (a.alsoReportedBy?.length || 0);
  return (
    <article className={`group relative flex overflow-hidden rounded-2xl border border-line bg-surface transition-shadow duration-200 hover:shadow-[0_10px_30px_-12px_rgb(0_0_0_/_0.25)] ${featured ? 'flex-col sm:col-span-2 sm:flex-row' : 'flex-col'}`}>
      <Link href={`/story/${a.id}`} className={`block shrink-0 overflow-hidden bg-surface2 ${featured ? 'sm:w-[47%]' : ''}`} tabIndex={-1} aria-hidden>
        <Image src={a.image} fallbackUrl={a.url} source={a.source} category={a.category}
          className={`w-full transition-transform duration-500 group-hover:scale-[1.03] ${featured ? 'aspect-[16/9] sm:h-full sm:aspect-auto' : 'aspect-[16/9]'}`} />
      </Link>
      <div className={`flex flex-1 flex-col gap-2.5 p-4 ${featured ? 'sm:p-6' : ''}`}>
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted">
          <span className="text-accent">{a.category}</span>
          <span aria-hidden>·</span>
          <time dateTime={a.publishedAt} title={full(a.publishedAt)}>{ago(a.publishedAt)}</time>
          {n > 1 && (<><span aria-hidden>·</span><span>{n} sources</span></>)}
        </div>
        <h3 className={`font-head font-bold leading-snug ${featured ? 'text-2xl sm:text-[28px]' : 'text-lg'}`}>
          <Link href={`/story/${a.id}`} className="decoration-accent/40 decoration-2 underline-offset-4 hover:underline">
            {a.title}
          </Link>
        </h3>
        <p className={`text-sm leading-relaxed text-muted ${featured ? 'line-clamp-4' : 'line-clamp-3'}`}>{a.summary}</p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="flex min-w-0 items-center gap-2 text-xs">
            <BiasChip lean={a.lean} />
            <span className="truncate font-semibold text-ink">{a.source}</span>
          </span>
          <a href={a.url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 text-xs font-medium text-muted underline-offset-4 hover:text-accent hover:underline">
            Read at source ↗
          </a>
        </div>
        {n > 1 && <CoverageBar counts={counts} className="mt-0.5 h-1" />}
      </div>
    </article>
  );
}
