import { useMemo, useState } from 'react';
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

export const BUCKETS = [
  { key: 'left', label: 'Left', className: 'bg-leanLeft' },
  { key: 'center', label: 'Center', className: 'bg-leanCenter' },
  { key: 'right', label: 'Right', className: 'bg-leanRight' },
  { key: 'unrated', label: 'Unrated', className: 'bg-leanNone' },
];

export function BiasChip({ lean, className = '' }) {
  const info = leanInfo(lean);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${info.chip} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} aria-hidden />
      {info.label}
    </span>
  );
}

export const outlets = (a) => [
  { source: a.source, url: a.url, lean: a.lean, title: a.title, publishedAt: a.publishedAt, author: a.author },
  ...(a.alsoReportedBy || []),
];

export const bucketCounts = (a) => {
  const out = { left: 0, center: 0, right: 0, unrated: 0 };
  for (const o of outlets(a)) {
    const lean = o.lean || 'unrated';
    out[lean === 'left' || lean === 'center-left' ? 'left' : lean === 'right' || lean === 'center-right' ? 'right' : lean] += 1;
  }
  return out;
};

export const coverageLabel = (b) => {
  const total = b.left + b.center + b.right;
  if (total <= 1) return 'Single-source story';
  if (b.left && !b.right && !b.center) return 'Left-only coverage';
  if (b.right && !b.left && !b.center) return 'Right-only coverage';
  if (b.left && b.right) return 'Balanced across left and right';
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

export function Image({ src, alt = '', className }) {
  const [ok, setOk] = useState(!!src);
  if (ok) {
    return <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer"
      onError={() => setOk(false)} className={className} />;
  }
  return (
    <div className={`${className} flex items-center justify-center bg-gradient-to-br from-surface2 via-surface2 to-line/50`} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-muted/50" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M4 5h11a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2V5Z" /><path d="M17 9h3v8a2 2 0 0 1-2 2" />
        <path d="M7 9h5M7 13h5" />
      </svg>
    </div>
  );
}

export function Card({ a, featured = false }) {
  const counts = useMemo(() => bucketCounts(a), [a]);
  const n = 1 + (a.alsoReportedBy?.length || 0);
  return (
    <article className={`group relative flex overflow-hidden rounded-2xl border border-line bg-surface transition-shadow duration-200 hover:shadow-[0_10px_30px_-12px_rgb(0_0_0_/_0.25)] ${featured ? 'flex-col sm:col-span-2 sm:flex-row' : 'flex-col'}`}>
      <Link href={`/story/${a.id}`} className={`block shrink-0 overflow-hidden bg-surface2 ${featured ? 'sm:w-[47%]' : ''}`} tabIndex={-1} aria-hidden>
        <Image src={a.image} className={`w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${featured ? 'aspect-[16/9] sm:h-full sm:aspect-auto' : 'aspect-[16/9]'}`} />
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
