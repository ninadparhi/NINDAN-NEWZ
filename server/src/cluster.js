import crypto from 'crypto';
import { sentences } from './text.js';

// Story clustering: the core of the product.
//
// Two reports belong to the same story when their text is close (TF-IDF cosine
// over the headline plus the first two sentences), the named entities they
// share are the same people, organisations or places, and their numbers agree.
// Clusters are assigned incrementally — an article is filed once and keeps its
// story id for good — so story URLs stay stable across refreshes.
//
// Thresholds are tunable from the environment; see .env.example.
export const CLUSTER_CONFIG = {
  // Cosine-weighted score (0..1) a pair must reach to be treated as one story.
  threshold: Number(process.env.CLUSTER_THRESHOLD) || 0.45,
  // Reports further apart than this are never merged, however similar.
  windowHours: Number(process.env.CLUSTER_WINDOW_HOURS) || 48,
  // How much each signal contributes to the pair score.
  weights: { cosine: 0.5, entity: 0.4, number: 0.1 },
  // Penalty when both reports quote figures and none of them match
  // ("beat India by 5 wickets" vs "beat India by 3 wickets").
  numberConflictPenalty: 0.22,
  // Extra penalty when two texts are textually close but share no entity at
  // all, which is usually two different events described in similar words.
  noEntityPenalty: 0.12,
};

const STOP = new Set('a an the and or but if then than that this these those is are was were be been being have has had do does did will would can could should may might must not no nor so as at by for from in into of on onto over per to up via with without about after before during under between against across among around within its it their his her he she they we you i our your my me us him them who whom whose which what when where why how all any both each few more most other some such only own same too very also just now news latest live update updates says said say told adds added amid while still even back out off down again once here there we will be as also new'.split(' '));

const stem = (w) => {
  if (w.length < 5) return w;
  if (w.endsWith('ing')) return w.slice(0, -3);
  if (w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.endsWith('es')) return w.slice(0, -2);
  if (w.endsWith('ed')) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
};

export const tokens = (text = '') => String(text).toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .split(' ')
  .filter((w) => w.length > 2 && !STOP.has(w))
  .map(stem);

const CAP = /^[A-Z][\w'’.-]*$/;
const CONNECTOR = /^(of|the|and|for|&|de|al|bin)$/i;

const normalizeEntity = (s) => s
  .replace(/[“”"'()[\]]/g, '')
  .replace(/[.,;:]+$/, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

// Institutions are shared by unrelated events (two different cases in the
// Bombay High Court), so they count for less than a named person or company.
const GENERIC_HEAD = /(court|police|government|ministry|minister|department|commission|council|agency|authority|board|committee|parliament|assembly|administration|office|bureau)$/;
export const entityWeight = (name) => (GENERIC_HEAD.test(name) ? 0.5 : 1);

// Proper-noun phrases ("Bombay High Court", "Bank of Baroda", "B.R. Shetty"),
// acronyms (NMC, RBI) and single mid-sentence names (Modi, Trump).
export function entities(text = '') {
  const out = new Set();
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    const words = sentence.split(/\s+/).filter(Boolean);
    let run = [];
    const flush = () => {
      if (run.length) {
        const wordsInRun = run.map((r) => r.word);
        const first = run[0];
        const strong = run.length > 1 || /^[A-Z]{2,}$/.test(first.word) || first.word.includes('.');
        // A lone capitalised word that opens a sentence is usually just "The".
        if (strong || first.at !== 0) {
          // "President Donald Trump" must still match "Donald Trump" and "Trump".
          for (let i = 0; i < wordsInRun.length; i++) {
            const part = normalizeEntity(wordsInRun.slice(i).join(' '));
            if (part.length > 2 && /\w/.test(part)) out.add(part);
          }
        }
      }
      run = [];
    };
    words.forEach((raw, at) => {
      const word = raw.replace(/^[“"'([\]]+|[”"',.;:)\]]+$/g, '');
      if (CAP.test(word) || /^[A-Z]{2,}$/.test(word)) run.push({ word, at });
      else if (CONNECTOR.test(word) && run.length) run.push({ word, at });
      else flush();
    });
    flush();
  }
  return out;
}

const ORDINALS = /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|one|two|three|four|five|six|seven|eight|nine|ten)$/i;

export function numbersOf(text = '') {
  const out = new Set();
  const src = String(text);
  for (const m of src.match(/\b\d[\d,.]*\s*(?:%|per cent|crore|lakh|million|billion|trillion|bn|mn)?\b/g) || []) {
    out.add(m.toLowerCase().replace(/,/g, '').replace(/\s+/g, ' ').trim());
  }
  // Ordinals count as figures ("first ODI" vs "second ODI"), but not inside
  // hyphenated compounds such as "one-day international".
  for (const m of src.match(/\b[A-Za-z]+\b(?!-)/g) || []) {
    if (ORDINALS.test(m)) out.add(m.toLowerCase());
  }
  return out;
}

const shared = (a, b) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
};

// Headline plus the first two sentences — the part that says what happened.
export function docText(a = {}) {
  const first = sentences(a.detail || a.summary || '');
  const body = (first.length ? first : [a.summary || '']).slice(0, 2).join(' ');
  return `${a.title || ''}. ${body}`.trim();
}

const featuresOf = (a) => {
  const text = docText(a);
  const raw = `${a.title || ''}. ${(a.summary || '')} ${sentences(a.detail || '').slice(0, 2).join(' ')}`;
  const counts = new Map();
  for (const t of tokens(text)) counts.set(t, (counts.get(t) || 0) + 1);
  return {
    url: a.url,
    at: new Date(a.publishedAt).getTime() || Date.now(),
    source: a.source,
    counts,
    ents: entities(raw),
    nums: numbersOf(text),
    maxTf: Math.max(1, ...counts.values()),
    norm: 0,
    vec: null,
  };
};

// Smoothed IDF so that a two-document corpus still produces usable weights.
export function buildModel(items) {
  const feats = items.map(featuresOf);
  const df = new Map();
  let n = 0;
  for (const f of feats) {
    n++;
    for (const w of f.counts.keys()) df.set(w, (df.get(w) || 0) + 1);
  }
  const idf = (w) => Math.log((1 + n) / (1 + (df.get(w) || 0))) + 1;
  for (const f of feats) {
    const vec = new Map();
    let sum = 0;
    for (const [w, c] of f.counts) {
      const v = (1 + Math.log(c)) / (1 + Math.log(f.maxTf)) * idf(w);
      vec.set(w, v);
      sum += v * v;
    }
    f.vec = vec;
    f.norm = Math.sqrt(sum) || 1;
  }
  const byUrl = new Map(feats.map((f) => [f.url, f]));
  return { feats, byUrl, idf, size: n };
}

const featOf = (model, article) => {
  const hit = model.byUrl.get(article.url);
  if (hit) return hit;
  const f = featuresOf(article);
  for (const [w, c] of f.counts) {
    const v = (1 + Math.log(c)) / (1 + Math.log(f.maxTf)) * model.idf(w);
    f.vec.set(w, v);
  }
  let sum = 0;
  for (const v of f.vec.values()) sum += v * v;
  f.norm = Math.sqrt(sum) || 1;
  model.byUrl.set(f.url, f);
  return f;
};

export function cosine(a, b) {
  const [small, big] = a.vec.size <= b.vec.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [w, v] of small.vec) {
    const o = big.vec.get(w);
    if (o) dot += v * o;
  }
  return dot / (a.norm * b.norm);
}

export function pairScore(a, b, model, config = CLUSTER_CONFIG) {
  const fa = featOf(model, a);
  const fb = featOf(model, b);
  const cos = cosine(fa, fb);
  // A phrase also contributes its suffixes, so only keep the longest matches
  // ("bank of baroda" should count once, not again as "baroda").
  const matched = [...fa.ents].filter((e) => fb.ents.has(e));
  const longest = matched.filter((e) => !matched.some((o) => o !== e && o.endsWith(` ${e}`)));
  const ents = longest.length;
  const entWeight = longest.reduce((n, e) => n + entityWeight(e), 0);
  const numsBoth = fa.nums.size > 0 && fb.nums.size > 0;
  const numsShared = shared(fa.nums, fb.nums);

  const entityScore = Math.min(1, entWeight / 2);
  const numberScore = numsBoth ? (numsShared ? 1 : 0) : 0.5;

  const w = config.weights;
  let score = w.cosine * cos + w.entity * entityScore + w.number * numberScore;
  if (numsBoth && !numsShared) score -= config.numberConflictPenalty;
  if (ents === 0) score -= config.noEntityPenalty;

  return { score, cosine: cos, entities: ents, numbers: numsBoth ? numsShared : null, sameTime: Math.abs(fa.at - fb.at) };
}

export const articleHash = (url) => crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);

// Files each new article into an existing cluster or opens a new one.
// Existing clusters are never re-cut, so an article's story id never changes.
export function assignClusters(newArticles, existingArticles = [], config = CLUSTER_CONFIG) {
  const cfg = { ...CLUSTER_CONFIG, ...config };
  const span = cfg.windowHours * 3600e3;
  const now = Date.now();
  const fresh = newArticles
    .filter((a) => a?.url && now - new Date(a.publishedAt).getTime() <= cfg.windowHours * 3600e3 * 2)
    .sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt));
  const existing = existingArticles.filter((a) => a?.clusterId && now - new Date(a.publishedAt).getTime() <= span);

  const model = buildModel([...existing, ...fresh]);
  const groups = new Map();
  for (const a of existing) {
    let g = groups.get(a.clusterId);
    if (!g) { g = { id: a.clusterId, sources: new Set(), docs: [] }; groups.set(a.clusterId, g); }
    g.sources.add(a.source);
    g.docs.push(a);
  }

  const assigned = new Map();
  for (const a of fresh) {
    const at = new Date(a.publishedAt).getTime();
    let best = null;
    let bestScore = 0;
    for (const g of groups.values()) {
      if (g.sources.has(a.source)) continue;
      let compared = 0;
      for (const d of g.docs) {
        if (Math.abs(new Date(d.publishedAt).getTime() - at) > span) continue;
        if (compared++ > 25) break;                 // a cluster rarely needs more
        const { score } = pairScore(d, a, model, cfg);
        if (score > bestScore) { bestScore = score; best = g; }
      }
    }
    if (best && bestScore >= cfg.threshold) {
      best.sources.add(a.source);
      best.docs.push(a);
      assigned.set(a.url, best.id);
    } else {
      const id = articleHash(a.url);
      groups.set(id, { id, sources: new Set([a.source]), docs: [a] });
      assigned.set(a.url, id);
    }
  }
  return assigned;
}

// Same assignment, used for a whole archive at once (first run, or after a
// rewrite of the archive format).
export const clusterAll = (articles, config = CLUSTER_CONFIG) => assignClusters(articles, [], config);
