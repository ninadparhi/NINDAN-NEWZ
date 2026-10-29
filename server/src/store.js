import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { classify } from './classify.js';
import { assignClusters, clusterAll, articleHash, CLUSTER_VERSION } from './cluster.js';

// Articles are kept on disk so past days stay browsable after the 20-minute
// refresh replaces today's headlines. Retention is ARCHIVE_DAYS (default 14).
//
// Each article carries a clusterId assigned once, when it is first seen. That
// id is the story id in the UI, so a story's URL never changes even as more
// outlets join it on later refreshes.
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(DATA_DIR, 'archive.json');
const DAYS = Math.max(1, +process.env.ARCHIVE_DAYS || 14);
const MAX = 20000;

let articles = [];
let updatedAt = null;
let dirty = false;
let stories = null;

export function loadArchive() {
  let savedVersion = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    savedVersion = parsed.clusterVersion ?? 0;
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
    console.log(`archive: ${articles.length} articles loaded`);
  } catch {
    articles = [];
    console.log('archive: starting empty');
  }

  if (savedVersion !== CLUSTER_VERSION) {
    // First run, or the scoring changed: cut the whole archive once.
    for (const a of articles) if (a) a.clusterId = null;
    const assigned = clusterAll(articles.filter((a) => a?.url));
    for (const a of articles) if (a?.url) a.clusterId = assigned.get(a.url) || articleHash(a.url);
    console.log(`archive: clustered ${articles.length} articles (version ${CLUSTER_VERSION})`);
    dirty = true;
  } else {
    const legacy = articles.filter((a) => a?.url && !a.clusterId);
    if (legacy.length) {
      const assigned = clusterAll(legacy);
      for (const a of legacy) a.clusterId = assigned.get(a.url) || articleHash(a.url);
      dirty = true;
    }
  }
  if (dirty) save();
  stories = null;
}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ updatedAt, clusterVersion: CLUSTER_VERSION, articles }));
    fs.renameSync(tmp, FILE);
    dirty = false;
  } catch (e) {
    console.warn('archive: could not write', e.message);
  }
}

export function mergeIntoStore(fresh) {
  const map = new Map(articles.map((a) => [a.url, a]));
  const incoming = [];

  for (const a of fresh) {
    const prev = map.get(a.url);
    if (prev) {
      // Keep the id the story was first filed under.
      map.set(a.url, { ...prev, ...a, clusterId: prev.clusterId || a.clusterId });
    } else {
      incoming.push(a);
    }
  }

  if (incoming.length) {
    const existing = [...map.values()].filter((a) => a.clusterId);
    const assigned = assignClusters(incoming, existing);
    for (const a of incoming) map.set(a.url, { ...a, clusterId: assigned.get(a.url) || articleHash(a.url) });
  }

  const cutoff = Date.now() - DAYS * 864e5;
  articles = [...map.values()]
    .filter((a) => a?.url && new Date(a.publishedAt) >= cutoff)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, MAX);

  updatedAt = new Date().toISOString();
  stories = null;
  dirty = true;
  save();
}

// A story is one cluster: the earliest report leads, every other outlet that
// carried it becomes "also reported by". Cached until the next merge.
function buildStories() {
  const groups = new Map();
  for (const a of articles) {
    const cid = a.clusterId || articleHash(a.url);
    let group = groups.get(cid);
    if (!group) { group = []; groups.set(cid, group); }
    group.push(a);
  }

  const out = [];
  for (const [id, members] of groups) {
    members.sort((x, y) => new Date(x.publishedAt) - new Date(y.publishedAt));
    const primary = members.find((m) => m.summary) || members[0];
    const alsoReportedBy = members.filter((m) => m !== primary).map((m) => ({
      source: m.source, url: m.url, title: m.title,
      publishedAt: m.publishedAt, lean: m.lean, author: m.author || null, image: m.image || null,
    }));
    const latestAt = members[members.length - 1].publishedAt;
    out.push({ ...primary, id, alsoReportedBy, latestAt });
  }

  return out.sort((a, b) => new Date(b.latestAt) - new Date(a.latestAt));
}

export function snapshot() {
  if (!stories) stories = buildStories();
  return { articles: stories, updatedAt };
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
  for (const a of snapshot().articles) {
    const d = dayIn(a.publishedAt, tz);
    if (d) counts.set(d, (counts.get(d) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, DAYS)
    .map(([date, count]) => ({ date, count }));
}
