import { useEffect, useMemo, useState } from 'react';
import { Link } from './router.jsx';
import {
  api, ago, full, BiasChip, CoverageBar, bucketCounts, coverageLabel, LEANS,
  outlets, Image, Card, BUCKETS, useMeta, sourceInfo, FACTUALITY_LABEL, OWNER_LABEL, providerNames,
} from './ui.jsx';

const LEAN_ORDER = ['left', 'center-left', 'center', 'center-right', 'right', 'unrated'];
const FACT_ORDER = { high: 0, mixed: 1, low: 2, unknown: 3 };
const OWNER_ORDER = { corporate: 0, govt: 1, trust: 2, independent: 3 };
const fieldStyle = 'h-9 rounded-lg border border-line bg-surface px-2.5 text-xs text-ink focus:border-accent focus:outline-none';

const bucketKey = (lean) => (LEANS[lean] ? lean : 'unrated');

// Five-segment bar by outlet count. Each segment lists its outlets on hover
// and on keyboard focus, so the bar is not just a colour.
function SegmentedBias({ a, meta }) {
  const list = outlets(a);
  const total = list.length || 1;
  const segments = BUCKETS.map((b) => ({
    bucket: b,
    items: list.filter((o) => bucketKey(o.lean) === b.key),
  })).filter((s) => s.items.length);

  return (
    <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface2" role="group" aria-label="Coverage by lean">
      {segments.map(({ bucket, items }) => (
        <span key={bucket.key} tabIndex={0} style={{ width: `${(items.length / total) * 100}%` }}
          aria-label={`${bucket.label}: ${items.length} outlet${items.length > 1 ? 's' : ''}`}
          className={`group/seg relative h-full cursor-default ${bucket.className} ring-offset-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}>
          <span role="tooltip" aria-hidden="true"
            className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-60 -translate-x-1/2 rounded-xl border border-line bg-surface p-2.5 text-left shadow-xl group-hover/seg:block group-focus/seg:block">
            <span className="block text-[11px] font-bold text-ink">{bucket.label} · {items.length}</span>
            {items.map((o) => <span key={`${o.source}-${o.url}`} className="mt-0.5 block truncate text-[11px] text-muted">{o.source}</span>)}
            <span className="mt-1 block text-[10px] text-muted/80">Lean is a publication-level rating.</span>
          </span>
        </span>
      ))}
    </div>
  );
}

function Legend({ counts }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
      {BUCKETS.map((b) => (
        <span key={b.key} className="inline-flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${b.className}`} aria-hidden />
          {b.label} {counts[b.key] || 0}
        </span>
      ))}
    </div>
  );
}

function OutletList({ a, meta, items }) {
  return (
    <ul className="mt-3 divide-y divide-line">
      {items.map((o, i) => {
        const info = sourceInfo(meta, o.source);
        return (
          <li key={`${o.source}-${o.url}`} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold" title={o.title}>{o.source}</span>
              <span className="block truncate text-[11px] text-muted">
                {info.ownership?.parent || 'Unknown owner'} · {OWNER_LABEL[info.ownership?.type] || 'Unknown'}
                {' · Factuality: '}{FACTUALITY_LABEL[info.factuality] || 'Unrated'}
              </span>
              <span className="text-[11px] text-muted">
                {o.url === a.url ? 'This story' : ago(o.publishedAt)}
                {' · '}{full(o.publishedAt)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <BiasChip lean={o.lean} />
              <a href={o.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${o.source} article`}
                className="text-muted transition-colors hover:text-accent">↗</a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CoverageTab({ a, meta, counts }) {
  const list = useMemo(() => outlets(a), [a]);
  const [lean, setLean] = useState('all');
  const [fact, setFact] = useState('all');
  const [owner, setOwner] = useState('all');
  const [sort, setSort] = useState('lean');

  const rows = useMemo(() => {
    const withMeta = list.map((o) => ({ ...o, info: sourceInfo(meta, o.source) }));
    const filtered = withMeta.filter((o) => (
      (lean === 'all' || bucketKey(o.lean) === lean)
      && (fact === 'all' || (o.info.factuality || 'unknown') === fact)
      && (owner === 'all' || (o.info.ownership?.type || 'independent') === owner)
    ));
    const sorted = [...filtered];
    if (sort === 'lean') sorted.sort((x, y) => LEAN_ORDER.indexOf(bucketKey(x.lean)) - LEAN_ORDER.indexOf(bucketKey(y.lean)));
    if (sort === 'factuality') sorted.sort((x, y) => (FACT_ORDER[x.info.factuality] ?? 9) - (FACT_ORDER[y.info.factuality] ?? 9));
    if (sort === 'ownership') sorted.sort((x, y) => (OWNER_ORDER[x.info.ownership?.type] ?? 9) - (OWNER_ORDER[y.info.ownership?.type] ?? 9));
    if (sort === 'newest') sorted.sort((x, y) => new Date(y.publishedAt) - new Date(x.publishedAt));
    return sorted;
  }, [list, meta, lean, fact, owner, sort]);

  return (
    <div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="text-[11px] font-medium text-muted">
          Lean
          <select value={lean} onChange={(e) => setLean(e.target.value)} className={`${fieldStyle} mt-1 w-full`}>
            <option value="all">All lean levels</option>
            {BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-medium text-muted">
          Factuality
          <select value={fact} onChange={(e) => setFact(e.target.value)} className={`${fieldStyle} mt-1 w-full`}>
            <option value="all">All levels</option>
            {Object.entries(FACTUALITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-medium text-muted">
          Ownership
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={`${fieldStyle} mt-1 w-full`}>
            <option value="all">All owners</option>
            {Object.entries(OWNER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-medium text-muted">
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={`${fieldStyle} mt-1 w-full`}>
            <option value="lean">Lean</option>
            <option value="factuality">Factuality</option>
            <option value="ownership">Ownership</option>
            <option value="newest">Newest</option>
          </select>
        </label>
      </div>

      <p className="mt-2 text-[11px] text-muted" aria-live="polite">
        {rows.length} of {list.length} outlets
      </p>

      {rows.length ? <OutletList a={a} meta={meta} items={rows} /> : (
        <p className="mt-4 rounded-xl border border-line bg-surface2/60 p-3 text-xs text-muted">
          No outlets match those filters.
        </p>
      )}

      <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
        {coverageLabel(counts)}. Lean and factuality are indicative publication-level ratings, not a verdict on this article.
      </p>
    </div>
  );
}

function TimelineTab({ a, meta }) {
  const items = useMemo(
    () => outlets(a).map((o) => ({ ...o, info: sourceInfo(meta, o.source) }))
      .sort((x, y) => new Date(x.publishedAt) - new Date(y.publishedAt)),
    [a, meta],
  );
  return (
    <ol className="mt-3 space-y-3">
      {items.map((o, i) => (
        <li key={`${o.source}-${o.url}`} className="relative border-l border-line pl-4">
          <span className={`absolute -left-[4.5px] top-1.5 h-2 w-2 rounded-full ${BUCKETS.find((b) => b.key === bucketKey(o.lean))?.className}`} aria-hidden />
          <span className="block text-[11px] font-medium text-muted">
            {full(o.publishedAt)} · {i === 0 ? 'first report' : ago(o.publishedAt)}
          </span>
          <a href={o.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 block text-sm font-semibold leading-snug hover:text-accent">
            {o.title}
          </a>
          <span className="mt-1 flex items-center gap-2 text-[11px] text-muted">
            <BiasChip lean={o.lean} /> {o.source}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Panel({ a, meta }) {
  const counts = useMemo(() => bucketCounts(a), [a]);
  const list = outlets(a);
  const [tab, setTab] = useState('coverage');
  const cited = new Set(list.flatMap((o) => sourceInfo(meta, o.source).ratings || []));

  const tabs = [
    ['coverage', 'Coverage'],
    ['headlines', 'Headlines compared'],
    ['timeline', 'Timeline'],
  ];

  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-head text-lg font-bold">Coverage</h2>
        <span className="text-xs font-medium text-muted">{list.length} outlet{list.length > 1 ? 's' : ''}</span>
      </div>

      <SegmentedBias a={a} meta={meta} />
      <Legend counts={counts} />

      <div className="mt-4 flex gap-1 rounded-xl bg-surface2 p-1" role="tablist" aria-label="Story analysis">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" id={`tab-${key}`} aria-selected={tab === key} aria-controls={`panel-${key}`}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition-colors ${tab === key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
            {label.split(' ')[0]}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'coverage' && <CoverageTab a={a} meta={meta} counts={counts} />}
        {tab === 'timeline' && <TimelineTab a={a} meta={meta} />}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
        {a.alsoReportedBy.length > 0 && (
          <>Also reported by {a.alsoReportedBy.length} other outlet{a.alsoReportedBy.length > 1 ? 's' : ''}. </>
        )}
        {cited.size > 0 && <>Ratings compiled from {providerNames(meta, [...cited])}; ownership from publisher disclosures.</>}
      </p>
    </div>
  );
}

export default function StoryPage({ id }) {
  const meta = useMeta();
  const [status, setStatus] = useState('loading');
  const [story, setStory] = useState(null);
  const [related, setRelated] = useState([]);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    setStory(null);
    api(`news/${id}`)
      .then((a) => {
        if (!live) return;
        setStory(a);
        setStatus('ok');
        document.title = `${a.title} · Dispatch`;
        api('news', { category: a.category, region: a.region, limit: 8 })
          .then((d) => live && setRelated(d.articles.filter((x) => x.id !== a.id).slice(0, 3)))
          .catch(() => {});
      })
      .catch(() => live && setStatus('missing'));
    return () => { live = false; };
  }, [id]);

  if (status === 'loading') {
    return (
      <main className="mx-auto max-w-content px-4 py-10">
        <div className="h-4 w-24 animate-pulse rounded bg-surface2" />
        <div className="mt-6 h-10 w-4/5 animate-pulse rounded bg-surface2" />
        <div className="mt-3 h-10 w-3/5 animate-pulse rounded bg-surface2" />
        <div className="mt-8 aspect-[16/8] w-full animate-pulse rounded-2xl bg-surface2" />
      </main>
    );
  }

  if (status === 'missing' || !story) {
    return (
      <main className="mx-auto max-w-content px-4 py-16 text-center">
        <p className="font-head text-2xl font-bold">This story isn’t here anymore</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Stories stay in the archive for 14 days. It may have rolled out of the feed, or the link is wrong.
        </p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-paper">Back to headlines</Link>
      </main>
    );
  }

  const a = story;
  const body = a.detail && a.detail.length > 40 && a.detail !== a.summary ? a.detail : '';
  return (
    <main className="mx-auto max-w-content px-4 pb-14 pt-6">
      <nav className="text-xs text-muted" aria-label="Breadcrumb">
        <Link href="/" className="font-medium hover:text-accent">← All stories</Link>
        <span className="mx-2" aria-hidden>/</span>
        <Link href={`/?region=${a.region}`} className="hover:text-accent">{a.region === 'india' ? 'India' : 'World'}</Link>
        <span className="mx-2" aria-hidden>/</span>
        <Link href={`/?region=${a.region}&category=${encodeURIComponent(a.category)}`} className="hover:text-accent">{a.category}</Link>
      </nav>

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <article className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            <span className="text-accent">{a.category}</span>
            <span aria-hidden>·</span>
            <span>{a.region === 'india' ? 'India' : 'World'}</span>
            <span aria-hidden>·</span>
            <time dateTime={a.publishedAt}>{ago(a.publishedAt)}</time>
          </div>

          <h1 className="mt-3 font-head text-3xl font-bold leading-[1.15] tracking-tight sm:text-[40px]">{a.title}</h1>
          <p className="mt-4 font-head text-lg leading-relaxed text-muted">{a.summary}</p>

          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-line py-3 text-sm">
            <BiasChip lean={a.lean} />
            <span className="font-semibold">{a.source}</span>
            {a.author && <span className="text-muted">By {a.author}</span>}
            <span className="text-muted" aria-hidden>·</span>
            <time dateTime={a.publishedAt} className="text-muted">{full(a.publishedAt)}</time>
          </div>

          <figure className="mt-6">
            <Image src={a.image} fallbackUrl={a.url} source={a.source} category={a.category}
              className="aspect-[16/6] w-full rounded-2xl sm:aspect-[16/8]" />
            <figcaption className="mt-2 text-[11px] text-muted">
              {a.image ? `Image via ${a.source}.` : `Preview image from ${a.source}.`} Rights belong to the publisher.
            </figcaption>
          </figure>

          {(body || a.keyPoints?.length > 1) && (
            <section className="mt-8">
              {body && (
                <>
                  <h2 className="font-head text-xl font-bold">From the report</h2>
                  <p className="mt-2 text-[15px] leading-7 text-ink/90">{body}</p>
                </>
              )}
              {a.keyPoints?.length > 1 && (
                <>
                  <h2 className={`font-head text-xl font-bold ${body ? 'mt-7' : ''}`}>Key points</h2>
                  <ul className="mt-2 space-y-2">
                    {a.keyPoints.map((k) => (
                      <li key={k} className="flex gap-3 text-[15px] leading-6 text-ink/90">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                        <span>{k}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm text-muted">
              Dispatch only shows the publisher’s own excerpt. Read the complete reporting — and support it — at {a.source}.
            </p>
            <a href={a.url} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:text-[#0d1115]">
              Read full story at {a.source} ↗
            </a>
            {a.alsoReportedBy.length > 0 && (
              <p className="mt-4 text-xs leading-relaxed text-muted">
                Also reported by{' '}
                {a.alsoReportedBy.map((x, i) => (
                  <span key={x.source}>
                    {i > 0 && ', '}
                    <a href={x.url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline-offset-2 hover:text-accent hover:underline">{x.source}</a>
                  </span>
                ))}
                .
              </p>
            )}
          </div>

          <p className="mt-5 text-xs text-muted">
            Content belongs to the respective publishers. Summaries on this page are short excerpts, never the full article.
          </p>
        </article>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Panel a={a} meta={meta} />
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex items-end justify-between gap-3">
            <h2 className="font-head text-xl font-bold">More in {a.category}</h2>
            <Link href="/" className="text-xs font-medium text-muted hover:text-accent">All headlines →</Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => <Card key={r.id} a={r} />)}
          </div>
        </section>
      )}
    </main>
  );
}
