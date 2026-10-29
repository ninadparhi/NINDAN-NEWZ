import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classify } from './classify.js';

// Stories are kept on disk so past days stay browsable after the 20-minute
// refresh replaces today's headlines. Retention is ARCHIVE_DAYS (default 14).
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DATA_DIR, 'archive.json');
const DAYS = Math.max(1, +process.env.ARCHIVE_DAYS || 14);
const MAX = 20000;

let articles = [];
let updatedAt = null;
let dirty = false;

export function loadArchive() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // Rows archived before the content classifier existed only carry their
    // feed's tag, so re-score them once on load. The classifier is stable, so
    // this is a no-op for everything it already got right.
    articles = (Array.isArray(parsed.articles) ? parsed.articles : []).map((a) => {
      if (!a?.title) return a;
      const { region, category } = classify({
        title: a.title, summary: a.summary || '', detail: a.detail || '',
        feedRegion: a.region, feedCategory: a.category,
      });
      return { ...a, region, category };
    });
    updatedAt = parsed.updatedAt || null;
    console.log(`archive: ${articles.length} stories loaded`);
  } catch {
    console.log('archive: starting empty');
  }
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ updatedAt, articles }));
    fs.renameSync(tmp, FILE);
    dirty = false;
  } catch (e) {
    console.warn('archive: could not write', e.message);
  }
}

const bySource = (list) => {
  const seen = new Set();
  return list.filter((x) => x && x.source && !seen.has(x.source) && seen.add(x.source));
};

export function mergeIntoStore(fresh) {
  const map = new Map(articles.map((a) => [a.url, a]));
  for (const a of fresh) {
    const prev = map.get(a.url);
    map.set(a.url, prev
      ? { ...prev, ...a, alsoReportedBy: bySource([...(prev.alsoReportedBy || []), ...(a.alsoReportedBy || [])]) }
      : a);
  }
  const cutoff = Date.now() - DAYS * 864e5;
  articles = [...map.values()]
    .filter((a) => a && new Date(a.publishedAt) >= cutoff)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX);
  updatedAt = new Date().toISOString();
  save();
}

export function snapshot() {
  return { articles, updatedAt };
}

export function flush() {
  if (dirty) save();
}

// Local-day helper: tz = minutes east of UTC (IST = 330).
export const dayIn = (iso, tz = 0) => {
  const t = new Date(iso);
  if (isNaN(t)) return '';
  return new Date(t.getTime() + tz * 60000).toISOString().slice(0, 10);
};

export function daysAvailable(tz = 0) {
  const counts = new Map();
  for (const a of articles) {
    const d = dayIn(a.publishedAt, tz);
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, DAYS)
    .map(([date, count]) => ({ date, count }));
}
