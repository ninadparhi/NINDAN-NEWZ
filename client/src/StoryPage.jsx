import { useEffect, useMemo, useState } from 'react';
import { Link } from './router.jsx';
import {
  api, ago, full, BiasChip, CoverageBar, bucketCounts, coverageLabel,
  outlets, Image, Card, BUCKETS,
} from './ui.jsx';

function CoveragePanel({ a }) {
  const counts = useMemo(() => bucketCounts(a), [a]);
  const list = outlets(a);
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-head text-lg font-bold">Coverage</h2>
        <span className="text-xs font-medium text-muted">{list.length} outlet{list.length > 1 ? 's' : ''}</span>
      </div>
      <p className="mt-1 text-xs text-muted">{coverageLabel(counts)}</p>
      <CoverageBar counts={counts} className="mt-3 h-2" />
      <ul className="mt-4 space-y-3">
        {list.map((o, i) => (
          <li key={`${o.source}-${i}`} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold">{o.source}</span>
              <span className="text-[11px] text-muted">
                {i === 0 ? 'This story' : ago(o.publishedAt)}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <BiasChip lean={o.lean} />
              <a href={o.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${o.source} article`}
                className="text-muted transition-colors hover:text-accent">↗</a>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-3 border-t border-line pt-3 text-[11px] text-muted">
        {BUCKETS.filter((b) => counts[b.key]).map((b) => (
          <span key={b.key} className="inline-flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${b.className}`} aria-hidden />
            {b.label} {counts[b.key]}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Lean labels describe a publication’s general editorial stance and are indicative, not a verdict on this article.
      </p>
    </div>
  );
}

export default function StoryPage({ id }) {
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
        <Link href="/" className="hover:text-accent">{a.region === 'india' ? 'India' : 'World'}</Link>
        <span className="mx-2" aria-hidden>/</span>
        <Link href="/" className="hover:text-accent">{a.category}</Link>
      </nav>

      <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_336px]">
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
          <CoveragePanel a={a} />
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
