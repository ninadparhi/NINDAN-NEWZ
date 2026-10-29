// Text cleanup for excerpts. Feed descriptions arrive as HTML with named and
// numeric entities, plus publisher boilerplate ("The post … appeared first
// on …"). Cutting them at 300 characters used to slice words and sentences in
// half, which is what made the story-page summary look garbled.
const NAMED = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  hellip: '…', mdash: '—', ndash: '–', minus: '−',
  lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', prime: '′', Prime: '″',
  copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', times: '×',
  divide: '÷', euro: '€', pound: '£', yen: '¥', cent: '¢', deg: '°',
  plusmn: '±', frac12: '½', frac14: '¼', sup2: '²', sup3: '³',
  zwnj: '', zwj: '', shy: '', ensp: ' ', emsp: ' ', thinsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
};

const fromCode = (n) => {
  try { return String.fromCodePoint(n); } catch { return ''; }
};

export function decodeEntities(s = '') {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => fromCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => fromCode(+d))
    .replace(/&([a-z][a-z0-9]*);/gi, (m, n) => NAMED[n] ?? NAMED[n.toLowerCase()] ?? m);
}

const BOILERPLATE = [
  /\bthe post\b.{0,160}\bappeared first on\b.{0,100}$/i,
  /\b(continue reading|read more|read the full (story|article|report)|click here to read|full story)\b.{0,80}$/i,
  /\b(subscribe|sign up) (to|for) .{0,80}$/i,
  /\b(all rights reserved|©\s*\d{4}.{0,60})\.?$/i,
  /\bfollow us on .{0,60}$/i,
];

const cleanup = (s) => {
  let out = s;
  for (const re of BOILERPLATE) out = out.replace(re, '');
  return out.replace(/\s+([.,;:!?])/g, '$1').replace(/\s{2,}/g, ' ').trim();
};

export function stripHtml(input = '') {
  const raw = String(input)
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return cleanup(decodeEntities(raw)).replace(/^[\s·•|–—-]+/, '');
}

// Split on sentence ends, but keep initials ("B.R."), abbreviations ("Mr.",
// "No.", "U.S.") and decimals inside the sentence they belong to.
// Case-sensitive on purpose: an /i flag would make [A-Z] match any letter and
// treat every word ending in a full stop as an abbreviation.
const ABBREV = /(?:\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|Ltd|Pvt|Inc|Co|Corp|vs|etc|No|Rs|approx|Govt|CM|DC|Gen|Col|Lt|Smt|Shri|mr|dr|vs|etc|no|rs|U\.S|U\.K|e\.g|i\.e)|[A-Z])\.$/;

export function sentences(input = '') {
  const text = stripHtml(input);
  if (!text) return [];
  const out = [];
  let buf = '';
  for (const chunk of text.split(/(?<=[.!?…])\s+/)) {
    buf = buf ? `${buf} ${chunk}` : chunk;
    if (!ABBREV.test(buf.trim())) { out.push(buf.trim()); buf = ''; }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter((s) => /[a-z0-9]/i.test(s));
}

// Trim to a whole word. Never returns a word chopped in half.
export function cutWords(input = '', max = 300) {
  const text = String(input).trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const at = slice.lastIndexOf(' ');
  const body = (at > max * 0.4 ? slice.slice(0, at) : slice).replace(/[\s,;:.–—\-]+$/, '');
  return `${body}…`;
}

// Whole sentences up to max. If the first sentence alone is longer than max,
// fall back to a word-boundary cut so the paragraph still reads properly.
export function excerpt(input = '', max = 320) {
  const text = stripHtml(input);
  if (!text) return '';
  if (text.length <= max) return text;
  let out = '';
  for (const s of sentences(text)) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out.length < Math.min(80, Math.floor(max * 0.4))) return cutWords(text, max);
  // Feeds often truncate their own description mid-sentence. Mark the cut so
  // a teaser never looks like it finished its thought.
  return /[.!?…]["'”’)\]]?$/.test(out.trim()) ? out : `${out.replace(/[\s,;:–—-]+$/, '')}…`;
}
