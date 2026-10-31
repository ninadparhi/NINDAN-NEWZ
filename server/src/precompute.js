// Ingestion-time analysis.
//
// Every story is scored once, after it is merged into the archive, and the
// result is persisted with the story. The dashboard then reads biasRating,
// biasPercentage, simpleSummary and biasRationale straight from the archive —
// no model call happens when a reader opens the page.
//
// The work is deliberately bounded: PRECOMPUTE_MAX stories per refresh, two in
// flight, most-covered stories first. A free-tier key that rate-limits simply
// yields the local analyser for the remaining stories, which the next refresh
// picks up (a story without an analysis is retried).
import { analyzeArticle } from './analyze.js';
import { setStoryAnalysis, snapshot } from './store.js';

let running = false;
let pending = 0;

export async function precomputeAnalyses(options = {}) {
  const { limit = 40, concurrency = 2, force = false } = options;
  // A refresh that lands mid-run has new articles that were not in the queue.
  // Remember it and take one more pass as soon as this one finishes.
  if (running) { pending += 1; return { skipped: true, processed: 0 }; }
  running = true;
  let processed = 0;

  try {
    const queue = snapshot().articles
      .filter((story) => (force || !story.analysis) && (story.detail || story.summary))
      // Newest first: that is the order the dashboard renders, so the cards a
      // reader actually sees are the ones already scored. Coverage breaks ties.
      .sort((a, b) => new Date(b.latestAt || b.publishedAt) - new Date(a.latestAt || a.publishedAt)
        || (b.alsoReportedBy?.length || 0) - (a.alsoReportedBy?.length || 0))
      .slice(0, Math.max(0, limit));

    let next = 0;
    const worker = async () => {
      while (next < queue.length) {
        const story = queue[next++];
        try {
          // Text only: never fetch the publisher page in the background.
          const analysis = await analyzeArticle({
            text: story.detail || story.summary,
            title: story.title,
            source: story.source,
            category: story.category,
          });
          if (setStoryAnalysis(story.id, analysis)) processed += 1;
        } catch (e) {
          console.warn('precompute:', story.id, e.message);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
    return { processed, queued: queue.length };
  } finally {
    running = false;
    if (pending) {
      pending = 0;
      setImmediate(() => { precomputeAnalyses(options).catch(() => {}); });
    }
  }
}
