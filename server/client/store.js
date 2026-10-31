// Reading history and the Cognitive Balance Score.
//
// History is device-local (localStorage) and pruned to the last seven days, so
// the score always reflects the current week. Nothing here talks to the server:
// a reader's political diet is not something to upload.
const KEY = 'nindan.reads.v1';
const DAY = 864e5;

export const leanGroup = (lean) => (
  lean === 'left' || lean === 'center-left' ? 'left'
    : lean === 'right' || lean === 'center-right' ? 'right'
      : 'center'
);

export function readHistory() {
  try {
    const rows = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(rows)) return [];
    return rows.filter((row) => row && row.id && Number.isFinite(row.at) && Date.now() - row.at < 7 * DAY);
  } catch {
    return [];
  }
}

// Re-reading the same story does not count twice within an hour: the score is
// meant to reflect what you read, not how often you refreshed a page.
export function recordRead(entry = {}) {
  if (!entry.id) return readHistory();
  const rows = readHistory().filter((row) => !(row.id === entry.id && Date.now() - row.at < 3600e3));
  rows.push({ ...entry, at: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-300)));
  } catch { /* private mode: history just stays in memory */ }
  return rows;
}

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function balanceSummary(history = readHistory()) {
  const counts = { left: 0, center: 0, right: 0 };
  for (const row of history) counts[leanGroup(row.lean)] += 1;
  const total = history.length;
  const shares = { left: 0, center: 0, right: 0 };
  if (total) {
    for (const key of Object.keys(counts)) shares[key] = Math.round((counts[key] / total) * 100);
  }

  // Total-variation distance from a perfect one-third split, rescaled so a
  // single-sided diet scores 0 and an even split scores 100.
  let score = 0;
  if (total) {
    const parts = ['left', 'center', 'right'].map((key) => counts[key] / total);
    const tv = 0.5 * parts.reduce((sum, share) => sum + Math.abs(share - 1 / 3), 0);
    score = Math.round(100 * (1 - Math.min(1, tv / (2 / 3))));
  }

  const label = total < 3 ? 'Keep reading to calibrate'
    : score >= 75 ? 'Well balanced'
      : score >= 45 ? 'Leaning one way'
        : 'Narrow news diet';

  return { total, counts, shares, score, label };
}

// Suggests unread stories that include the least-read side of the spectrum, so
// the recommendation is a counter-perspective rather than "more news".
export function recommendations(articles = [], history = readHistory(), limit = 3) {
  const read = new Set(history.map((row) => row.id));
  const summary = balanceSummary(history);
  const least = ['left', 'center', 'right']
    .sort((a, b) => (summary.counts[a] || 0) - (summary.counts[b] || 0))[0];

  const hasGroup = (article, group) => Object.entries(article.coverageBuckets || {})
    .some(([lean, count]) => count > 0 && leanGroup(lean) === group);

  const unread = articles.filter((article) => article && !read.has(article.id));
  const preferred = unread.filter((article) => hasGroup(article, least));
  const rest = unread.filter((article) => !preferred.includes(article));
  return [...preferred, ...rest].slice(0, limit);
}
