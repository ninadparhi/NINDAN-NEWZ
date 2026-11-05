import { useEffect, useState } from 'react';
import { Link } from './router.jsx';
import { api, ago, full, BiasChip, Image } from './ui.jsx';

// Reading time at 220 words per minute, which is the usual figure for
// on-screen reading of news prose.
const minutes = (words) => Math.max(1, Math.round((words || 0) / 220));

function Blocks({ blocks }) {
  return (
    <div className="reader-body">
      {blocks.map((b, i) => {
        const key = `${i}-${b.text.slice(0, 24)}`;
        if (b.type === 'heading') return <h2 key={key}>{b.text}</h2>;
        if (b.type === 'quote') return <blockquote key={key}>{b.text}</blockquote>;
        if (b.type === 'list') return <p key={key} className="reader-list">• {b.text}</p>;
        return <p key={key}>{b.text}</p>;
      })}
    </div>
  );
}

function Skeleton() {
  return (
    <main className="mx-auto max-w-[46rem] px-4 py-10" aria-busy="true">
      <div className="h-3 w-40 animate-pulse rounded bg-surface2" />
      <div className="mt-6 h-9 w-11/12 animate-pulse rounded bg-surface2" />
      <div className="mt-3 h-9 w-2/3 animate-pulse rounded bg-surface2" />
      <div className="mt-6 h-3 w-56 animate-pulse rounded bg-surface2" />
      <div className="mt-8 aspect-[16/8] w-full animate-pulse rounded-2xl bg-surface2" />
      <div className="mt-8 space-y-3">
        {[100, 96, 90, 98, 72].map((w, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-surface2" style={{ width: `${w}%` }} />
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-muted">Fetching the article from the publisher…</p>
    </main>
  );
}

// Extraction failed, or the text is behind a subscription. Either way the
// reader is told what happened and handed the publisher link.
function Fallback({ doc, storyId }) {
  const source = doc?.source || 'the publisher';
  const paywalled = doc?.status === 'paywalled';
  return (
    <main className="mx-auto max-w-[46rem] px-4 py-14">
      <Link href={`/story/${storyId}`} className="text-xs font-medium text-muted hover:text-accent">← Back to the story</Link>
      <div className="mt-6 rounded-2xl border border-line bg-surface p-7 text-center">
        <p className="font-head text-2xl font-bold">
          {paywalled ? 'Subscribe to keep reading' : 'This one has to be read at the source'}
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
          {doc?.reason || 'The publisher did not return a readable version of this article.'}
          {paywalled ? '' : ' Nothing is lost — the full reporting is one click away.'}
        </p>
        {doc?.url && (
          <a href={doc.url} target="_blank" rel="noopener noreferrer"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 dark:text-[#0d1115]">
            Read original on {source} ↗
          </a>
        )}
        <p className="mt-4 text-[11px] text-muted">
          Dispatch reads the publisher’s own page and never stores the article beyond your session.
        </p>
      </div>
    </main>
  );
}

export default function Reader({ id }) {
  const [doc, setDoc] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let live = true;
    setStatus('loading');
    setDoc(null);
    const qs = new URLSearchParams(window.location.search);
    const params = { ...(qs.get('u') ? { u: qs.get('u') } : {}), ...(qs.get('refresh') ? { refresh: '1' } : {}) };
    const search = new URLSearchParams(params).toString();
    fetch(`/api/news/${encodeURIComponent(id)}/full${search ? `?${search}` : ''}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!live) return;
        setDoc(d);
        setStatus(d.status === 'ok' || d.status === 'partial' ? 'ready' : 'unreadable');
        document.title = `${d.title || d.source || 'Article'} · Dispatch`;
        window.scrollTo({ top: 0 });
      })
      .catch(() => live && setStatus('error'));
    return () => { live = false; };
  }, [id]);

  if (status === 'loading') return <Skeleton />;

  if (status === 'error') {
    return (
      <main className="mx-auto max-w-[46rem] px-4 py-16 text-center">
        <p className="font-head text-2xl font-bold">Couldn’t open the article</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          The news server didn’t answer. Check that it is running on port 3001, then try again.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button onClick={() => window.location.reload()} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-paper">Try again</button>
          <Link href={`/story/${id}`} className="text-sm font-medium text-muted hover:text-accent">Back to the story</Link>
        </div>
      </main>
    );
  }

  if (status === 'unreadable') return <Fallback doc={doc} storyId={id} />;

  return (
    <main className="mx-auto max-w-[46rem] px-4 pb-16 pt-6">
      <nav className="flex flex-wrap items-center justify-between gap-2 text-xs" aria-label="Reader navigation">
        <Link href={`/story/${id}`} className="font-medium text-muted hover:text-accent">← Back to coverage</Link>
        <span className="flex items-center gap-2 text-muted">
          <span>{minutes(doc.wordCount)} min read</span>
          <span aria-hidden>·</span>
          <span>{doc.wordCount.toLocaleString('en-IN')} words</span>
          {doc.status === 'partial' && <span className="rounded-full border border-line bg-surface2 px-2 py-0.5 font-semibold">Free preview</span>}
        </span>
      </nav>

      <article className="mt-5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
          <span className="text-accent">{doc.siteName || doc.source}</span>
          <span aria-hidden>·</span>
          <time dateTime={doc.publishedAt || undefined}>{doc.publishedAt ? ago(doc.publishedAt) : 'Date unavailable'}</time>
        </div>

        <h1 className="mt-3 font-head text-[30px] font-bold leading-[1.18] tracking-tight sm:text-[38px]">
          {doc.title || 'Untitled article'}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-line py-3 text-sm">
          <BiasChip lean={doc.lean} />
          <span className="font-semibold">{doc.source}</span>
          {doc.author && <span className="text-muted">By {doc.author}</span>}
          {doc.publishedAt && <><span className="text-muted" aria-hidden>·</span><time dateTime={doc.publishedAt} className="text-muted">{full(doc.publishedAt)}</time></>}
        </div>

        {doc.leadImage && (
          <figure className="mt-6">
            <Image src={doc.leadImage} fallbackUrl={doc.url} source={doc.source} category="" alt=""
              className="aspect-[16/8] w-full rounded-2xl" />
            <figcaption className="mt-2 text-[11px] text-muted">Lead image from {doc.source}. Rights belong to the publisher.</figcaption>
          </figure>
        )}

        {doc.status === 'partial' && doc.reason && (
          <p className="mt-6 rounded-xl border border-line bg-surface2/70 px-3.5 py-3 text-xs leading-relaxed text-muted">
            {doc.reason}
          </p>
        )}

        <div className="mt-7">
          <Blocks blocks={doc.blocks} />
        </div>

        <div className="mt-10 rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-muted">
            Read in Dispatch for a cleaner layout. The reporting, pictures and rights belong to {doc.source}.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a href={doc.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 dark:text-[#0d1115]">
              Read original on {doc.source} ↗
            </a>
            <Link href={`/story/${id}`} className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink">
              Compare coverage
            </Link>
          </div>
        </div>

        <p className="mt-5 text-[11px] leading-relaxed text-muted">
          Extracted from the publisher’s own page for reading only. Some publishers show only the opening of a paid
          article, in which case the rest is available on their site.
        </p>
      </article>
    </main>
  );
}
