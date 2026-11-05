// The article analysis pipeline behind POST /api/analyze-article.
//
// One article in, three things out:
//   1. a bias percentage breakdown across the five-point spectrum,
//   2. sentence-level spin highlights with character offsets and an
//      explanation tag each,
//   3. a three-bullet neutral synthesis split into undisputed facts and
//      partisan spin.
//
// The LLM is asked for quotes, never offsets: it is asked to copy substrings,
// and this module locates those substrings in the source text to produce the
// offsets the reader highlights. A quote the model invented is dropped, so a
// hallucination can never paint the wrong words.
//
// With no key, on a timeout, on a rate limit or on malformed JSON, the pipeline
// falls back to a deterministic lexical analyser instead of failing the
// request. Results are labelled `method: 'llm' | 'heuristic'`, and the fallback
// carries `degraded: true` plus a human-readable `reason`.
import crypto from 'crypto';
import { cutWords, stripHtml } from './text.js';
import { biasOf } from './bias.js';
import { entities } from './cluster.js';
import { callLLM, parseJsonObject, llmAvailable, llmConfig, LLMError } from './llm.js';

export const MAX_TEXT = 12000;
export const SPIN_TAGS = [
  'Loaded Language',
  'Omitted Context',
  'Emotional Appeal',
  'False Equivalence',
  'Cherry-picking',
  'Framing',
  'Appeal to Authority',
];

const LEAN_KEYS = ['left', 'leanLeft', 'center', 'leanRight', 'right'];
const LEAN_INDEX = { left: 0, 'center-left': 1, center: 2, 'center-right': 3, right: 4 };
const UA = 'NindanNewz/2.0 (+framing analysis; links to originals)';
const CACHE_TTL = 6 * 3600e3;
const CACHE_MAX = 300;
const cache = new Map();

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const sha1 = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// ---------------------------------------------------------------- percentages

// Rounds percentage weights to integers that sum to exactly 100.
export function toPercentages(weights) {
  const safe = LEAN_KEYS.map((_, i) => Math.max(0, Number(weights[i]) || 0));
  const total = safe.reduce((a, b) => a + b, 0);
  // A vector of only zeroes has no direction: an even split is the honest answer.
  if (total <= 0) return Object.fromEntries(LEAN_KEYS.map((key) => [key, 20]));
  const raw = safe.map((w) => (w / total) * 100);
  const out = raw.map(Math.floor);
  const rest = 100 - out.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => [v - Math.floor(v), i])
    .sort((a, b) => b[0] - a[0]);
  for (let i = 0; i < rest; i++) out[order[i % 5][1]] += 1;
  return Object.fromEntries(LEAN_KEYS.map((key, i) => [key, out[i]]));
}

// --------------------------------------------------------------- off-line NLP

// Derive bias percentages from the cluster's source outlet counts,
// so the BIAS BREAKDOWN sidebar matches the Coverage Details bar.
// sourceCounts format: { total, left, leanLeft, center, leanRight, right, untracked }
export function biasFromSourceCounts(sourceCounts = {}) {
  const { total = 0, left = 0, leanLeft = 0, center = 0, leanRight = 0, right = 0, untracked = 0 } = sourceCounts;
  const totalRated = total - (untracked || 0);
  if (totalRated <= 0) return { left: 0, leanLeft: 0, center: 0, leanRight: 0, right: 0 };
  const counts = { left, leanLeft, center, leanRight, right };
  const out = {};
  LEAN_KEYS.forEach((key) => { out[key] = counts[key] || 0 });
  const sum = out.left + out.leanLeft + out.center + out.leanRight + out.right;
  if (sum <= 0) return { left: 0, leanLeft: 0, center: 0, leanRight: 0, right: 0 };
  return {
    left: Math.round((out.left / totalRated) * 100),
    leanLeft: Math.round((out.leanLeft / totalRated) * 100),
    center: Math.round((out.center / totalRated) * 100),
    leanRight: Math.round((out.leanRight / totalRated) * 100),
    right: Math.round((out.right / totalRated) * 100),
  };
}

const LEFT_CUES = [
  'hardline', 'communal', 'communalism', 'majoritarian', 'far-right', 'far right',
  'divisive', 'intolerance', 'hate speech', 'chilling effect', 'authoritarian',
  'demonisation', 'demonization', 'witch-hunt', 'witch hunt', 'vigilante',
  'persecution', 'crackdown on dissent', 'pliant media', 'saffron brigade',
  'fringe element', 'fringe elements', 'supremacist', 'bigotry', 'bigoted',
];
const RIGHT_CUES = [
  'appeasement', 'vote bank', 'pseudo-secular', 'urban naxal', 'anti-national',
  'anti national', 'jihadi', 'woke', 'left-liberal', 'left liberal', 'leftist',
  'tukde gang', 'protest industry', 'mainstream media', 'presstitute',
  'ideological agenda', 'radical left', 'islamist', 'breaking india',
];
const EMOTIONAL_CUES = [
  'shocking', 'shockingly', 'outrage', 'outrageous', 'fury', 'furious', 'slammed',
  'slams', 'blasts', 'tears into', 'explosive', 'bombshell', 'chaos', 'devastating',
  'disgrace', 'disgraceful', 'shameful', 'heroic', 'brave', 'tragic',
  'heartbreaking', 'unprecedented', 'nightmare', 'miracle', 'celebrated',
];
const LOADED_CUES = [
  'regime', 'so-called', 'infamous', 'mastermind', 'torched', 'looted', 'rampant',
  'plague', 'scourge', 'purge', 'meltdown', 'fiasco', 'farce', 'cronies', 'crony',
  'puppet', 'stooge', 'tirade', 'rant', 'tirade', 'bizarre', 'brazen', 'blatant',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const countCues = (text, cues) => cues.reduce((n, cue) => {
  const hits = text.match(new RegExp(`\\b${escapeRe(cue)}\\b`, 'gi'));
  return n + (hits ? hits.length : 0);
}, 0);

// VADER-style dampening: a negated cue ("not a crackdown") is a much weaker
// signal than the bare word, so it contributes a fraction of the weight.
const NEGATION = /\b(not|never|no|hardly|barely|neither|nor|without)\b[^.!?]{0,32}$/i;

function cueWeight(text = '', cues = []) {
  let total = 0;
  for (const cue of cues) {
    const re = new RegExp(`\\b${escapeRe(cue)}\\b`, 'gi');
    let match;
    while ((match = re.exec(text))) {
      const before = text.slice(Math.max(0, match.index - 48), match.index);
      total += NEGATION.test(before) ? 0.25 : 1;
    }
  }
  return total;
}

// Indicative lexical prior: the outlet's rated lean sets the centre, directional
// wording in the text moves it. It is deliberately transparent, not a classifier
// we cannot explain.
export function heuristicBias(text = '', source = '') {
  const prior = LEAN_INDEX[biasOf(source).lean] ?? 2;
  const left = cueWeight(text, LEFT_CUES);
  const right = cueWeight(text, RIGHT_CUES);
  const centre = clamp(prior + clamp((right - left) * 0.3, -1.5, 1.5), 0, 4);
  return toPercentages(LEAN_KEYS.map((_, i) => Math.exp(-((i - centre) ** 2) / 1.1) * 100 + 3));
}

// ------------------------------------------------------------ headline fields

// The five labels the client and the database both use. `biasRating` is the
// bucket with the largest share, `biasPercentage` that share: together they are
// the one-line summary of the full `bias` vector.
export const BIAS_RATINGS = ['Left', 'Lean Left', 'Center', 'Lean Right', 'Right'];

export function biasRating(bias = {}) {
  let best = 0;
  LEAN_KEYS.forEach((key, index) => {
    if ((Number(bias?.[key]) || 0) > (Number(bias?.[LEAN_KEYS[best]]) || 0)) best = index;
  });
  return BIAS_RATINGS[best];
}

export function biasPercentage(bias = {}) {
  return Math.max(...LEAN_KEYS.map((key) => Number(bias?.[key]) || 0));
}

// Filler that shows up in every second headline, so it names no subject.
const TOPIC_STOP = new Set([
  'said', 'says', 'say', 'told', 'tell', 'will', 'would', 'could', 'should',
  'after', 'before', 'about', 'again', 'against', 'among', 'amid', 'around',
  'because', 'been', 'being', 'between', 'both', 'during', 'each', 'from',
  'have', 'into', 'just', 'like', 'made', 'make', 'many', 'more', 'most',
  'much', 'must', 'near', 'need', 'only', 'other', 'over', 'same', 'some',
  'such', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'today', 'under', 'until', 'very', 'what',
  'when', 'where', 'which', 'while', 'will', 'with', 'without', 'year',
  'years', 'week', 'weeks', 'day', 'days', 'time', 'times', 'new', 'news',
  'report', 'reports', 'reported', 'latest', 'update', 'updates', 'live',
  'video', 'watch', 'read', 'also', 'even', 'still', 'back', 'down', 'here',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'monday', 'tuesday',
  'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'published',
  'updated', 'minute', 'minutes', 'hour', 'hours', 'am', 'pm', 'ist', 'gmt',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov',
  'dec', 'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun',
  'billion', 'million', 'trillion', 'crore', 'lakh', 'percent', 'per', 'cent',
]);

// The original casing of a term, so "RBI" and "Modi" survive instead of being
// flattened to lower case by the entity extractor.
const displayTerm = (term = '', source = '') => {
  const pattern = String(term).split(/\s+/).map(escapeRe).join('\\s+');
  let found = null;
  try { found = new RegExp(pattern, 'i').exec(source); } catch { found = null; }
  if (found) return found[0];
  return String(term).replace(/(^|\s)([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());
};

export function keyTopics(input = '', { title = '', limit = 8 } = {}) {
  const source = `${title}\n${input}`.slice(0, MAX_TEXT);
  if (!source.trim()) return [];

  const scores = new Map(); // lowercase key -> { term, score }
  const bump = (key, term, weight) => {
    const clean = String(key || '').trim();
    if (clean.length < 3 || !/[a-z]/i.test(clean)) return;
    if (TOPIC_STOP.has(clean.toLowerCase())) return;
    const hit = scores.get(clean);
    if (hit) hit.score += weight;
    else scores.set(clean, { term, score: weight });
  };

  // Proper nouns first: names, places and organisations are what a topic tag
  // should point at, not the most repeated verb.
  for (const name of entities(source)) {
    if (/\b(published|updated)$/i.test(name)) continue;
    bump(name, displayTerm(name, source), 3);
  }

  const counts = new Map();
  for (const word of source.toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
    const clean = word.replace(/'s$/, '').replace(/-$/, '');
    if (TOPIC_STOP.has(clean)) continue;
    counts.set(clean, (counts.get(clean) || 0) + 1);
  }
  for (const [word, n] of counts) bump(word, displayTerm(word, source), 1 + Math.min(2, n - 1) * 0.5);

  const ranked = [...scores.values()]
    .sort((a, b) => b.score - a.score || b.term.length - a.term.length);

  const out = [];
  for (const row of ranked) {
    const lower = row.term.toLowerCase();
    if (out.some((kept) => {
      const keptLower = kept.toLowerCase();
      return keptLower === lower || keptLower.includes(lower) || lower.includes(keptLower);
    })) continue;
    out.push(row.term);
    if (out.length >= limit) break;
  }
  return out;
}

// Sentence spans with exact offsets into `text`. Paragraph breaks are honoured,
// so the reader can render real paragraphs, and every offset points at the same
// string the API returns as `text`.
export function sentenceSpans(text = '') {
  const out = [];
  const lineRe = /[^\n]+/g;
  let line;
  while ((line = lineRe.exec(text))) {
    const src = line[0];
    const parts = src.match(/[^.!?…]+[.!?…]+["'”’)\]]*|[^.!?…]+$/g) || [];
    let cursor = 0;
    for (const part of parts) {
      const sentenceText = part.trim();
      if (!sentenceText) continue;
      const at = src.indexOf(sentenceText, cursor);
      if (at < 0) continue;
      out.push({
        sentenceText,
        startIndex: line.index + at,
        endIndex: line.index + at + sentenceText.length,
      });
      cursor = at + sentenceText.length;
    }
  }

  // A period between digits ("lift off at 11.30 pm") is a decimal point, not a
  // sentence end. Merge that fragment back so a fact card never starts mid-time.
  const merged = [];
  for (const span of out) {
    const prev = merged[merged.length - 1];
    const gap = prev ? text.slice(prev.endIndex, span.startIndex) : '';
    if (prev && /\d\.$/.test(prev.sentenceText) && !gap.includes('\n')) {
      prev.sentenceText = text.slice(prev.startIndex, span.endIndex);
      prev.endIndex = span.endIndex;
      continue;
    }
    merged.push({ ...span });
  }
  return merged;
}

const EXPLANATIONS = {
  'Loaded Language': 'Evaluative wording does the judging for the reader instead of attributing the judgement to a source.',
  'Omitted Context': 'A strong claim appears without attribution, or without the context that would qualify it.',
  'Emotional Appeal': 'Emotional language invites the reader to feel the conclusion rather than weigh it.',
  'False Equivalence': 'Two unequal positions are presented as if they carried the same evidential weight.',
  'Cherry-picking': 'Selected facts support one conclusion while relevant counter-evidence is left out.',
  Framing: 'The sentence structures the story around one angle, narrowing what the reader treats as relevant.',
  'Appeal to Authority': 'An authority is invoked without saying what makes them authoritative on this claim.',
};

function cuesIn(text, cues) {
  return cues.filter((cue) => new RegExp(`\\b${escapeRe(cue)}\\b`, 'i').test(text));
}

// Deterministic spin detection: flags sentences that carry evaluative framing,
// records a direction (-1 left .. +1 right) and explains the tag it applied.
export function detectSpin(text = '') {
  const out = [];
  for (const span of sentenceSpans(text)) {
    const left = countCues(span.sentenceText, LEFT_CUES);
    const right = countCues(span.sentenceText, RIGHT_CUES);
    const emotional = countCues(span.sentenceText, EMOTIONAL_CUES);
    const loaded = countCues(span.sentenceText, LOADED_CUES);
    const total = left + right + emotional + loaded;
    if (!total) continue;

    const attributed = /\b(said|says|told|according to|reported|statement|announced|confirmed|in a post|the court|police)\b/i.test(span.sentenceText);
    let tag = 'Loaded Language';
    if (!attributed && total >= 2) tag = 'Omitted Context';
    else if (emotional && !left && !right) tag = 'Emotional Appeal';

    const valence = clamp((right - left) * 0.5, -1, 1);
    const cues = [
      ...cuesIn(span.sentenceText, LEFT_CUES),
      ...cuesIn(span.sentenceText, RIGHT_CUES),
      ...cuesIn(span.sentenceText, EMOTIONAL_CUES),
      ...cuesIn(span.sentenceText, LOADED_CUES),
    ].slice(0, 4);

    out.push({
      sentenceText: span.sentenceText,
      startIndex: span.startIndex,
      endIndex: span.endIndex,
      valenceScore: Math.round(valence * 100) / 100,
      explanationTag: tag,
      cues,
      explanation: cues.length
        ? `${EXPLANATIONS[tag]} Marked wording: ${cues.map((c) => `“${c}”`).join(', ')}.`
        : EXPLANATIONS[tag],
    });
  }
  return out.slice(0, 14);
}

export function heuristicSynthesis(text = '', spin = []) {
  const spans = sentenceSpans(text);
  const spinAt = new Set(spin.map((s) => s.startIndex));
  const used = new Set();
  const facts = [];
  const push = (span) => {
    if (facts.length >= 3 || used.has(span.startIndex)) return;
    used.add(span.startIndex);
    facts.push(cutWords(span.sentenceText, 180));
  };
  for (const span of spans) if (!spinAt.has(span.startIndex) && span.sentenceText.length >= 40) push(span);
  for (const span of spans) push(span);
  while (facts.length < 3) facts.push('The excerpt is too short to establish a fact all sides accept.');

  const partisanSpin = spin.slice(0, 3).map(
    (s) => `${s.explanationTag}: “${cutWords(s.sentenceText, 120)}”`,
  );
  if (!partisanSpin.length) {
    partisanSpin.push('No strongly loaded phrasing was detected by the offline analyser.');
  }
  return { undisputedFacts: facts, partisanSpin };
}

// ------------------------------------------------------------ plain language

const CATEGORY_WHY = {
  Politics: 'It decides who holds power and which rules everyone has to follow.',
  Business: 'It affects prices, jobs and how much money people have.',
  Technology: 'It changes the tools and services people use every day.',
  Science: 'It changes what we know about the world and what we can build next.',
  Health: 'It affects how people get care and stay well.',
  Sports: 'It changes who wins, who qualifies and what fans watch next.',
  Entertainment: 'It changes what people watch, stream and talk about.',
  World: 'It affects how countries deal with each other and the people living there.',
};
const CATEGORY_WHY_DEFAULT = 'It changes what happens next for the people involved and the rules they live under.';

// The model writes the real ELI5. Without a model, take the shortest attributed
// sentence in the piece and pair it with a plain category-level consequence:
// two sentences, no jargon beyond what the report itself contains.
export function heuristicSimpleSummary(text = '', { category = null, facts = [] } = {}) {
  const fromFacts = (facts || [])
    .filter((fact) => fact && fact !== '…' && !/^The excerpt is too short/i.test(fact));
  const fromText = sentenceSpans(text)
    .map((span) => span.sentenceText)
    .filter((sentence) => sentence.length >= 30);
  // Prefer the sentence naming the most people, places or institutions: that is
  // the one carrying the event, not the newsroom boilerplate near it.
  const shortest = [...new Set([...fromFacts, ...fromText])]
    .map((sentence) => ({ sentence, names: entities(sentence).size, length: sentence.length }))
    .sort((a, b) => b.names - a.names || a.length - b.length)[0]?.sentence || '';
  const first = shortest
    ? `${String(shortest).replace(/[.!?…]+$/, '')}.`
    : 'This report is too short to summarise on its own.';
  return `${first} ${CATEGORY_WHY[category] || CATEGORY_WHY_DEFAULT}`;
}

// "Why this score?": names the wording that moved the number, rather than
// asking the reader to trust a percentage.
export function biasRationale(text = '', bias = {}, source = '') {
  const rating = biasRating(bias);
  const share = biasPercentage(bias);
  const left = cuesIn(text, LEFT_CUES).slice(0, 3);
  const right = cuesIn(text, RIGHT_CUES).slice(0, 3);
  const emotional = countCues(text, EMOTIONAL_CUES);
  const loaded = countCues(text, LOADED_CUES);
  const quote = (cue) => `“${cue}”`;

  const parts = [`The framing reads ${rating.toLowerCase()} because that bucket carries ${share}% of the weight.`];
  if (left.length) parts.push(`Left-coded wording: ${left.map(quote).join(', ')}.`);
  if (right.length) parts.push(`Right-coded wording: ${right.map(quote).join(', ')}.`);
  if (emotional + loaded) {
    parts.push(`${emotional + loaded} evaluative phrase${emotional + loaded === 1 ? '' : 's'} (judgement, praise or outrage) counted towards the score.`);
  } else {
    parts.push('No strongly evaluative phrasing was found, so the outlet prior dominates.');
  }
  const prior = biasOf(source).lean;
  if (prior && prior !== 'unrated') {
    parts.push(`The outlet's rated lean (${prior.replace('-', ' ')}) sets the starting point.`);
  }
  return parts.join(' ');
}

// ------------------------------------------------------------- LLM validation

// Finds a quote in the article, tolerant of whitespace and case, and returns
// offsets into the exact string that will be rendered.
export function locate(text = '', quote = '') {
  const clean = String(quote)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’…\s]+|["'“”‘’…\s]+$/g, '');
  if (clean.length < 8) return null;
  const direct = text.indexOf(clean);
  if (direct >= 0) return { start: direct, end: direct + clean.length, quote: clean };
  const pattern = clean.split(' ').map(escapeRe).join('\\s+');
  const match = new RegExp(pattern, 'i').exec(text);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length, quote: match[0] };
}

function biasFromLLM(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const values = LEAN_KEYS.map((key) => Number(raw[key]));
  if (values.some((v) => !Number.isFinite(v) || v < 0)) return null;
  if (values.reduce((a, b) => a + b, 0) <= 0) return null;
  return toPercentages(values);
}

export function normalizeSpin(items, text) {
  if (!Array.isArray(items)) return [];
  const found = [];
  for (const item of items.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const hit = locate(text, item.quote || item.sentenceText || item.text || '');
    if (!hit) continue;
    const tag = SPIN_TAGS.includes(item.explanationTag) ? item.explanationTag : 'Framing';
    const valence = clamp(Number(item.valenceScore) || 0, -1, 1);
    const explanation = typeof item.explanation === 'string' ? item.explanation.trim() : '';
    found.push({
      sentenceText: hit.quote,
      startIndex: hit.start,
      endIndex: hit.end,
      valenceScore: Math.round(valence * 100) / 100,
      explanationTag: tag,
      explanation: cutWords(explanation || EXPLANATIONS[tag], 240),
    });
  }
  found.sort((a, b) => a.startIndex - b.startIndex);
  const out = [];
  let cursor = 0;
  for (const item of found) {
    if (item.startIndex < cursor) continue;
    out.push(item);
    cursor = item.endIndex;
  }
  return out.slice(0, 12);
}

function normalizeTopics(value, fallback = []) {
  if (!Array.isArray(value)) return fallback;
  const out = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) continue;
    const term = cutWords(item.trim().replace(/^#/, ''), 40);
    if (!term || out.some((kept) => kept.toLowerCase() === term.toLowerCase())) continue;
    out.push(term);
    if (out.length >= 8) break;
  }
  return out.length ? out : fallback;
}

function normalizeText(value, max = 420) {
  if (typeof value !== 'string') return '';
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean ? cutWords(clean, max) : '';
}

function bullets(value, max) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => cutWords(item.trim().replace(/^[-•*]\s*/, ''), 240))
    .slice(0, max);
}

const fill = (have, from, max) => {
  const out = [...have];
  for (const item of from) {
    if (out.length >= max) break;
    if (item && !out.includes(item)) out.push(item);
  }
  while (out.length < max) out.push('…');
  return out.slice(0, max);
};

// Validates and repairs an LLM response against the source text, then fills any
// gaps with the offline analyser. Hallucinated quotes are dropped here.
export function normalizeAnalysis(raw, options = {}) {
  const {
    text = '', source = '', title = null, url = null, category = null,
    method = 'llm', degraded = false, reason = null,
  } = options;

  const spin = normalizeSpin(raw?.spin, text);
  const fallbackSpin = spin.length ? spin : detectSpin(text);
  const offline = heuristicSynthesis(text, fallbackSpin);

  const facts = bullets(raw?.synthesis?.undisputedFacts, 3);
  const partisan = bullets(raw?.synthesis?.partisanSpin, 3);
  const bias = biasFromLLM(raw?.bias) || heuristicBias(text, source);
  // Derive a source-count‑based breakdown that matches Coverage Details.
  const biasFromCounts = biasFromSourceCounts(options?.sourceCounts);
  const simpleSummary = normalizeText(raw?.simpleSummary)
    || heuristicSimpleSummary(text, { category, facts: offline.undisputedFacts });
  const rationale = normalizeText(raw?.biasRationale) || biasRationale(text, bias, source);

  return {
    title: title || null,
    url: url || null,
    source: source || null,
    method,
    degraded,
    reason,
    analyzedAt: new Date().toISOString(),
    text,
    bias,
    biasRating: biasRating(bias),
    biasPercentage: biasPercentage(bias),
    biasRationale: rationale,
    biasFromCounts,
    simpleSummary,
    keyTopics: normalizeTopics(raw?.keyTopics, keyTopics(text, { title: title || '', limit: 8 })),
    spin: fallbackSpin,
    synthesis: {
      undisputedFacts: fill(facts, offline.undisputedFacts, 3),
      partisanSpin: fill(partisan, offline.partisanSpin, 3),
    },
  };
}

// ------------------------------------------------------------------ page text

const BOILERPLATE = [
  /^(subscribe|sign in|log in|advertisement|share this|follow us|read more|related|also read|download the app)\b/i,
  /cookie/i,
  /^(image|photo|file photo|representative image)\b/i,
];

export function readableText(html = '') {
  const meta = html.match(/<meta[^>]+(?:property|name)=["'](?:og:description|description)["'][^>]*>/i);
  const description = meta ? stripHtml(meta[0].match(/content=["']([^"']+)/i)?.[1] || '') : '';

  const body = String(html)
    .replace(/<(script|style|noscript|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, ' ');
  const paragraphs = [...body.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => stripHtml(m[1]))
    .filter((p) => p.length >= 50 && !BOILERPLATE.some((re) => re.test(p)));

  const seen = new Set();
  const unique = paragraphs.filter((p) => {
    const key = p.toLowerCase().slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const text = unique.length
    ? unique.join('\n\n')
    : stripHtml(body.slice(0, 60000));
  return { text: text.slice(0, MAX_TEXT), description };
}

const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i;

export async function fetchArticleText(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) throw httpError(400, 'A http(s) article url is required');
  const host = new URL(url).hostname;
  if (PRIVATE_HOST.test(host) || !host.includes('.')) throw httpError(400, 'That host is not allowed');

  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    throw httpError(504, `Could not reach the article (${e.message})`);
  }
  if (!res.ok) throw httpError(502, `The publisher returned HTTP ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!type.includes('html')) throw httpError(415, 'That URL is not an HTML article');

  const html = (await res.text()).slice(0, 900000);
  const { text } = readableText(html);
  if (text.length < 200) throw httpError(422, 'Not enough readable article text at that URL');
  return text;
}

// -------------------------------------------------------------------- prompts

const SYSTEM_PROMPT = `You are a media-framing analyst. You receive one news article with its headline and outlet, and return a single JSON object. Never use markdown, never add commentary outside the JSON.

Schema:
{
  "bias": {"left": 0, "leanLeft": 0, "center": 0, "leanRight": 0, "right": 0},
  "biasRationale": "one or two sentences naming the wording that moved the score",
  "simpleSummary": "2-3 sentences explaining what happened and why it matters to a 10-year-old",
  "keyTopics": ["3-8 short subject terms"],
  "spin": [{"quote": "exact substring of the article", "explanationTag": "Loaded Language | Omitted Context | Emotional Appeal | False Equivalence | Cherry-picking | Framing | Appeal to Authority", "explanation": "one sentence on the technique and what it does", "valenceScore": 0}],
  "synthesis": {"undisputedFacts": ["bullet", "bullet", "bullet"], "partisanSpin": ["bullet", "bullet"]}
}

Rules:
- "bias" integers are non-negative and sum to 100. Judge how this article's framing distributes across the political spectrum, not the outlet's reputation or the facts themselves.
- keyTopics are the people, institutions and subjects the story is actually about, in the article's own casing. No hashtags, no filler words.
- simpleSummary must explain what happened and why it matters in plain words a 10-year-old would follow: no jargon, no loaded language, at most three sentences. Do not repeat the headline.
- biasRationale must name the specific words or omissions that produced the bias numbers, in one or two sentences, without judging the outlet.
- 4 to 10 spin items. Every quote must be 5-30 words copied verbatim from the article. Do not paraphrase inside "quote".
- valenceScore runs from -1 (left-leaning framing) through 0 (neutral) to +1 (right-leaning framing).
- undisputedFacts: exactly 3 short bullets of claims a left, centre and right outlet would all accept.
- partisanSpin: 2-3 short bullets naming framing choices (loaded terms, omitted attribution, selective figures), not the outlet.
- If the text is too short to support a field, return an empty array for it rather than inventing material.`;

const buildUserPrompt = (text, { source, title }) => `Headline: ${title || '(none supplied)'}
Outlet: ${source || '(unknown)'}

Article:
"""${text}"""`;

// ------------------------------------------------------------------ pipeline

const cacheKey = (url, text, source) => (url ? `u:${url}` : `t:${sha1(text).slice(0, 20)}`) + `|${source || ''}`;

function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
}

export async function analyzeArticle({ url, text, title, source, category, fallbackText, force = false } = {}) {
  const articleUrl = url && /^https?:\/\//i.test(url) ? url : null;
  const draft = typeof text === 'string' ? text.slice(0, MAX_TEXT) : '';
  const key = cacheKey(articleUrl, draft, source);

  if (!force) {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return { ...hit.value, cached: true };
  }

  let body = draft;
  let note = null;

  if (!body.trim() && articleUrl) {
    try {
      body = await fetchArticleText(articleUrl);
    } catch (e) {
      if (!fallbackText) throw e;
      body = String(fallbackText);
      note = `Live page unavailable (${e.message.replace(/\.$/, '')}); analysed the archived excerpt instead.`;
    }
  }
  if (!body.trim() && fallbackText) body = String(fallbackText);
  if (!body.trim()) throw httpError(400, 'Send either raw article text or an http(s) url');

  // Normalise paragraph breaks so the offsets the client receives point at the
  // same string it renders.
  const doc = body
    .replace(/\r\n?/g, '\n')
    .replace(/\b([ap])\.\s*m\.?/gi, '$1m') // "11.51 p.m." is one token, not a sentence end
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, MAX_TEXT)
    .trim();

  let result;
  const backend = llmConfig();
  if (!(await llmAvailable())) {
    // The free path. Never an error: the lexical analyser is a supported
    // engine, not a failure mode.
    result = normalizeAnalysis(null, {
      text: doc, source, title, url: articleUrl, category, method: 'heuristic',
    });
    result.engine = 'local-lexical';
    result.backend = null;
  } else {
    try {
      const { text: raw, model } = await callLLM({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(doc, { source, title }),
      });
      const parsed = parseJsonObject(raw);
      if (!parsed) throw new LLMError('The model did not return usable JSON', 'parse');
      result = normalizeAnalysis(parsed, {
        text: doc, source, title, url: articleUrl, category, method: 'llm',
      });
      result.engine = backend.label;
      result.backend = { provider: backend.provider, model: model || backend.model };
      if (!Array.isArray(parsed.spin) || !parsed.spin.length) {
        result.degraded = true;
        result.reason = 'The model returned no sentence highlights — highlights come from the offline analyser.';
      }
    } catch (e) {
      console.warn('analyze: free/local fallback —', e.message);
      result = normalizeAnalysis(null, {
        text: doc, source, title, url: articleUrl, category, method: 'heuristic',
      });
      result.engine = 'local-lexical';
      result.backend = { provider: backend.provider, model: backend.model };
      result.degraded = true;
      result.reason = `${e.message} — analysed with the built-in lexical engine instead.`;
    }
  }

  if (note) result.note = note;
  remember(key, result);
  return result;
}

export function clearAnalysisCache() {
  cache.clear();
}
