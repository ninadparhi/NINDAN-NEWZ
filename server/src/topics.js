// Trending topics for the mid-page ticker. Computed from the last three days of
// headlines and summaries, weighted by how many outlets carried the story, so a
// topic is never a single outlet's obsession.
//
// A topic ships with both a readable label ("Election Commission") and a
// hashtag form ("#ElectionCommission") for the ticker strip, plus the plain
// query the client sends back to /api/news?q=.
import { keyTopics } from './analyze.js';

const WINDOW_MS = 3 * 864e5;
const MIN_SCORE = 2;
const MAX_TOPIC_LENGTH = 34;

// Words that dominate news copy without naming a subject.
const GENERIC = new Set([
  'police', 'court', 'government', 'minister', 'official', 'officials', 'people',
  'country', 'state', 'world', 'india', 'indian', 'report', 'reports', 'news',
  'latest', 'update', 'updates', 'live', 'video', 'watch', 'today', 'yesterday',
  'week', 'month', 'year', 'time', 'day', 'days', 'first', 'last', 'next',
  'says', 'said', 'told', 'new', 'big', 'top', 'two', 'three', 'many', 'more',
  'after', 'before', 'over', 'under', 'amid', 'into', 'from', 'with', 'without',
  'this', 'that', 'these', 'those', 'here', 'there', 'what', 'when', 'where',
  'why', 'how', 'who', 'amid', 'against', 'between', 'during', 'about',
  // Date and byline furniture, not subjects.
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'monday', 'tuesday',
  'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'published',
  'updated', 'minute', 'minutes', 'hour', 'hours', 'am', 'pm', 'ist', 'gmt',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov',
  'dec', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
  'billion', 'million', 'trillion', 'crore', 'lakh', 'percent', 'cent',
]);

// "#Election2026": strip punctuation, capitalise word starts, keep existing
// acronym casing where the label already has it.
export function topicTag(label = '') {
  const words = String(label)
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  if (!words.length) return '';
  return `#${words.map((word) => (word === word.toUpperCase()
    ? word
    : word.charAt(0).toUpperCase() + word.slice(1))).join('')}`;
}

const cleanLabel = (label) => String(label)
  .replace(/\b(published|updated)\b.*$/i, '')
  .replace(/\s+/g, ' ')
  .replace(/^[^\w#]+|[^\w]$/g, '')
  .trim();

const usable = (label) => {
  const text = cleanLabel(label);
  if (text.length < 3 || text.length > MAX_TOPIC_LENGTH) return false;
  if (!/[a-z]/i.test(text)) return false;
  if (GENERIC.has(text.toLowerCase())) return false;
  return true;
};

// articles: snapshot().articles (cluster leads, each with alsoReportedBy).
export function trendingTopics(articles = [], limit = 12) {
  const cutoff = Date.now() - WINDOW_MS;
  const scores = new Map(); // lowercase label -> { label, score, sampleId }

  for (const article of articles) {
    const at = new Date(article?.latestAt || article?.publishedAt || 0).getTime();
    if (!Number.isFinite(at) || at < cutoff) continue;
    const weight = 1 + (article.alsoReportedBy?.length || 0);
    const text = `${article.title || ''}. ${article.summary || ''}`;
    if (!text.trim()) continue;

    for (const term of keyTopics(text, { limit: 8 })) {
      if (!usable(term)) continue;
      const key = term.toLowerCase();
      const hit = scores.get(key);
      if (hit) {
        hit.score += weight;
        if (!hit.sampleId) hit.sampleId = article.id;
      } else {
        scores.set(key, { label: cleanLabel(term), score: weight, sampleId: article.id || null });
      }
    }
  }

  const ranked = [...scores.values()]
    .filter((row) => row.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  // "Modi" inside "Narendra Modi" is a duplicate topic, not a second one.
  const kept = [];
  for (const row of ranked) {
    const lower = row.label.toLowerCase();
    if (kept.some((other) => {
      const otherLower = other.label.toLowerCase();
      return otherLower === lower || otherLower.includes(lower) || lower.includes(otherLower);
    })) continue;
    kept.push(row);
    if (kept.length >= limit) break;
  }

  return kept.map((row, index) => ({
    label: row.label,
    tag: topicTag(row.label),
    query: row.label,
    score: row.score,
    rank: index + 1,
    sampleId: row.sampleId,
  }));
}
