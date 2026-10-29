import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api, dayLabel, localDay, Card, CoverageBar, bucketCounts, bucketTotal, emptyCounts,
  BUCKETS, BiasChip, leanInfo,
} from './ui.jsx';
import StoryPage from './StoryPage.jsx';
import { Link, usePath } from './router.jsx';

const EMPTY = { region: 'india', category: '', source: '', date: '', q: '' };

// Filters live in the query string so a story can be opened and closed with
// the back button without losing the reader's date/category selection.
function filtersFromUrl() {
  const qs = new URLSearchParams(window.location.search);
  const region = qs.get('region');
  return {
    region: region === 'all' ? '' : region || 'india',
    category: qs.get('category') || '',
    source: qs.get('source') || '',
    date: qs.get('date') || '',
    q: qs.get('q') || '',
  };
}

const field = 'h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none';

function Ticker({ items }) {
  if (!items.length) return null;
  return (
    <div className="border-b border-line bg-surface2/70" aria-label="Latest headlines">
      <div className="mx-auto flex max-w-content items-center gap-3 px-4">
        <span className="shrink-0 border-r border-line py-2 pr-3 text-[10px] font-bold uppercase tracking-[0.14em] text-accent">Live</span>
        <div className="overflow-hidden">
          <div className="ticker flex w-max gap-7 whitespace-nowrap py-2 text-xs">
            {[...items, ...items].map((t, i) => (
              <Link key={`${t.id}-${i}`} href={`/story/${t.id}`} className="hover:underline">
                <span className="font-semibold text-ink">{t.source}</span>
                <span className="mx-1.5 text-muted" aria-hidden>·</span>
                <span className="text-muted">{t.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Skeletons() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={`overflow-hidden rounded-2xl border border-line bg-surface ${i === 0 ? 'sm:col-span-2' : ''}`}>
          <div className="aspect-[16/9] animate-pulse bg-surface2" />
          <div className="space-y-3 p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-surface2" />
            <div className="h-5 w-11/12 animate-pulse rounded bg-surface2" />
            <div className="h-5 w-2/3 animate-pulse rounded bg-surface2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsRail({ articles, days, onDay }) {
  const mix = useMemo(
    () => articles.reduce((acc, a) => {
      const b = bucketCounts(a);
      for (const k of Object.keys(acc)) acc[k] += b[k];
      return acc;
    }, emptyCounts()),
    [articles],
  );
  const mostCovered = useMemo(
    () => [...articles].sort((a, b) => (b.alsoReportedBy.length - a.alsoReportedBy.length)).filter((a) => a.alsoReportedBy.length).slice(0, 4),
    [articles],
  );
  const total = bucketTotal(mix);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-head text-lg font-bold">Coverage mix</h2>
        <p className="mt-1 text-xs text-muted">Editorial lean of the outlets covering these stories.</p>
        <CoverageBar counts={mix} className="mt-3 h-2" />
        <div className="mt-3 space-y-1.5">
          {BUCKETS.filter((b) => mix[b.key]).map((b) => (
            <div key={b.key} className="flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${b.className}`} aria-hidden />
              <span className="text-muted">{b.label}</span>
              <span className="ml-auto font-semibold">{mix[b.key]}</span>
              <span className="w-10 text-right text-muted">{total ? Math.round((mix[b.key] / total) * 100) : 0}%</span>
            </div>
          ))}
        </div>
        <details className="mt-3 border-t border-line pt-3 text-xs text-muted">
          <summary className="cursor-pointer font-medium text-ink">How lean labels work</summary>
          <p className="mt-2 leading-relaxed">
            Each outlet gets a general editorial-lean rating (left, center-left, center, center-right, right).
            It is a guide to the publication, not a judgement on any single story. Every story links straight to its publisher.
          </p>
        </details>
      </section>

      {mostCovered.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-head text-lg font-bold">Most covered</h2>
          <ul className="mt-3 space-y-3">
            {mostCovered.map((a) => (
              <li key={a.id}>
                <Link href={`/story/${a.id}`} className="group block">
                  <span className="text-sm font-semibold leading-snug decoration-accent/40 underline-offset-2 group-hover:underline">{a.title}</span>
                  <span className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                    <BiasChip lean={a.lean} />
                    {1 + a.alsoReportedBy.length} outlets
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {days.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-head text-lg font-bold">Archive</h2>
            <span className="text-[11px] text-muted">{days.reduce((n, d) => n + d.count, 0)} stories</span>
          </div>
          <p className="mt-1 text-xs text-muted">Past days are kept on disk, so you can read what you missed.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {days.slice(0, 6).map((d) => (
              <button key={d.date} onClick={() => onDay(d.date === localDay(0) ? '' : d.date)}
                className="rounded-full border border-line px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-accent hover:text-accent">
                {dayLabel(d.date)} <span className="text-muted/70">{d.count}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Home() {
  const [meta, setMeta] = useState({ categories: [], sources: [], sourceMeta: {} });
  const [f, setF] = useState(filtersFromUrl);
  const [data, setData] = useState({ articles: [], total: 0 });
  const [status, setStatus] = useState('loading');
  const [days, setDays] = useState([]);
  const [ticker, setTicker] = useState([]);

  useEffect(() => { api('meta').then(setMeta).catch(() => {}); }, []);

  useEffect(() => {
    const qs = new URLSearchParams();
    qs.set('region', f.region || 'all');
    for (const k of ['category', 'source', 'date', 'q']) if (f[k]) qs.set(k, f[k]);
    history.replaceState(history.state, '', `/?${qs}`);
  }, [f]);

  const load = useCallback(() => {
    api('news', f)
      .then((d) => { setData(d); setStatus('ok'); })
      .catch(() => setStatus('error'));
  }, [f]);

  useEffect(() => {
    const t = setTimeout(load, f.q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, f.q]);

  useEffect(() => {
    const iv = setInterval(load, 15 * 60 * 1000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    const aux = () => {
      api('days').then((d) => setDays(d.days)).catch(() => {});
      api('breaking').then(setTicker).catch(() => {});
    };
    aux();
    const iv = setInterval(aux, 15 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const set = (k) => (v) => setF((p) => ({ ...p, [k]: typeof v === 'string' ? v : v.target.value }));
  const dirty = f.category || f.source || f.date || f.q;

  const seg = (on) => `rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${on ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`;
  const pill = (on) => `shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? 'border-ink bg-ink text-paper' : 'border-line bg-surface text-muted hover:border-ink/40 hover:text-ink'}`;

  return (
    <>
      <Ticker items={ticker} />
      <div className="mx-auto max-w-content px-4 pb-16">
        <section className="pt-8">
          <h1 className="font-head text-3xl font-bold tracking-tight sm:text-[38px]">The day, in context</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Headlines from India and around the world — every story linked to its publisher, with the editorial lean of the outlets covering it.
          </p>
        </section>

        <section className="mt-6 rounded-2xl border border-line bg-surface p-3 sm:p-4" aria-label="Filters">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-surface2 p-1" role="group" aria-label="Region">
              {[['india', 'India'], ['world', 'World'], ['', 'All']].map(([v, l]) => (
                <button key={l} onClick={() => set('region')(v)} aria-pressed={f.region === v} className={seg(f.region === v)}>{l}</button>
              ))}
            </div>
            <span className="ml-auto text-xs text-muted" aria-live="polite">
              {status === 'ok' ? `${data.total} stories` : status === 'loading' ? 'Loading…' : '—'}
            </span>
          </div>

          <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {['', ...meta.categories].map((c) => (
              <button key={c || 'all'} onClick={() => set('category')(c)} aria-pressed={f.category === c} className={pill(f.category === c)}>
                {c || 'All'}
              </button>
            ))}
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,214px)_minmax(0,180px)]">
            <div className="relative">
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
              </svg>
              <input type="search" value={f.q} onChange={set('q')} placeholder="Search headlines or sources" aria-label="Search headlines"
                className={`${field} pl-9`} />
            </div>
            <select value={f.source} onChange={set('source')} aria-label="Filter by source" className={field}>
              <option value="">All sources</option>
              {meta.sources.map((s) => (
                <option key={s} value={s}>{s} · {leanInfo(meta.sourceMeta?.[s]?.lean).label}</option>
              ))}
            </select>
            <select value={f.date} onChange={set('date')} aria-label="Filter by date" className={field}>
              <option value="">Any date</option>
              {days.map((d) => (
                <option key={d.date} value={d.date}>{dayLabel(d.date)} · {d.count}</option>
              ))}
            </select>
          </div>

          {dirty && (
            <button onClick={() => setF({ ...EMPTY, region: f.region })} className="mt-2 text-xs font-medium text-accent hover:underline">
              Clear search, source and date filters
            </button>
          )}
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_316px]">
          <main>
            {status === 'error' && (
              <div className="rounded-2xl border border-line bg-surface p-6 text-sm">
                <p className="font-semibold">Couldn’t reach the news server.</p>
                <p className="mt-1 text-muted">Check that the backend is running on port 3001, then reload.</p>
              </div>
            )}

            {status === 'loading' && data.articles.length === 0 && <Skeletons />}

            {status === 'ok' && data.articles.length === 0 && (
              <div className="rounded-2xl border border-line bg-surface p-8 text-center">
                <p className="font-head text-xl font-bold">Nothing here for those filters</p>
                <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
                  {f.date
                    ? `No stories archived for ${dayLabel(f.date)}. The archive keeps 14 days and grows as the server runs.`
                    : 'Try another category or clear the search.'}
                </p>
                <button onClick={() => setF({ ...EMPTY, region: f.region })}
                  className="mt-4 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-paper">Reset filters</button>
              </div>
            )}

            {data.articles.length > 0 && (
              <div className="grid gap-5 sm:grid-cols-2">
                {data.articles.map((a, i) => <Card key={a.id} a={a} featured={i === 0} />)}
              </div>
            )}
          </main>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <StatsRail articles={data.articles} days={days} onDay={(d) => set('date')(d)} />
          </aside>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [dark, setDark] = useState(() => (localStorage.theme ? localStorage.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches));
  const path = usePath();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.theme = dark ? 'dark' : 'light';
  }, [dark]);

  const storyId = path.startsWith('/story/') ? decodeURIComponent(path.slice('/story/'.length)) : null;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-content items-center gap-3 px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="Dispatch home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink font-head text-lg font-bold text-paper">D</span>
            <span className="font-head text-2xl font-bold tracking-tight">Dispatch</span>
            <span className="hidden text-xs text-muted md:inline">India &amp; world, in context</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/" className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface2 hover:text-ink">
              Latest
            </Link>
            <button onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={dark}
              className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted transition-colors hover:text-ink">
              {dark ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {storyId ? <StoryPage id={storyId} /> : <Home />}

      <footer className="border-t border-line bg-surface2/60">
        <div className="mx-auto grid max-w-content gap-6 px-4 py-8 text-xs leading-relaxed text-muted sm:grid-cols-3">
          <div>
            <p className="font-head text-base font-bold text-ink">Dispatch</p>
            <p className="mt-1">An aggregator for Indian and world news. Headlines, short excerpts and links only.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">Content belongs to the respective publishers</p>
            <p className="mt-1">We never reproduce full articles. Every card and story links to the original reporting on the publisher’s site.</p>
          </div>
          <div>
            <p className="font-semibold text-ink">About lean labels</p>
            <p className="mt-1">Left / center / right tags describe a publication’s general editorial stance. They are indicative and open to disagreement.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
