// Comparative framing for one story cluster: which outlets covered it, how the
// coverage splits across the lean spectrum, what all sides agree on, and how
// each side of the spectrum frames it. Everything here is deterministic and
// runs without a model, so the consensus cards stay free and instant.
import { biasOf, bucketCountsOf, isBlindspot, leanGroup } from './bias.js';
import { tokens } from './cluster.js';
import { cutWords } from './text.js';
import { detectSpin, heuristicSynthesis, keyTopics } from './analyze.js';

const GROUP_ORDER = ['left', 'center', 'right'];

const GROUP_META = {
  left: { label: 'Left', adjective: 'Left-leaning' },
  center: { label: 'Centre', adjective: 'Centre' },
  right: { label: 'Right', adjective: 'Right-leaning' },
};

const outletOf = (row) => ({
  source: row.source,
  title: row.title,
  url: row.url,
  lean: row.lean || biasOf(row.source).lean,
  leanGroup: leanGroup(row.lean || biasOf(row.source).lean),
  publishedAt: row.publishedAt || null,
});

// Terms that appear in most headlines of the cluster are the shared facts: the
// names, places and actions every outlet agreed to put in the headline.
function consensusTerms(titles, minShare = 0.5) {
  const docs = titles.filter(Boolean).map((t) => new Set(tokens(t)));
  if (docs.length < 2) return [];
  const need = Math.max(2, Math.ceil(docs.length * minShare));
  const seen = new Map();
  for (const doc of docs) for (const term of doc) seen.set(term, (seen.get(term) || 0) + 1);
  return [...seen.entries()]
    .filter(([term, count]) => count >= need && term.length > 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, 6)
    .map(([term]) => term);
}

// The topics a group's own headlines emphasise, minus what the other groups
// also lead with. Falls back to the group's plain topics when nothing is
// distinctive, so a single-side story still gets a usable sentence.
function perspectiveFor(key, groups, termsByGroup) {
  const rows = groups[key];
  const meta = GROUP_META[key];
  if (!rows.length) {
    return {
      available: false,
      leanGroup: key,
      sources: [],
      source: null,
      headline: null,
      sentence: `No ${meta.adjective.toLowerCase()} outlet in this cluster has a headline on the story yet.`,
    };
  }

  const own = termsByGroup[key];
  const otherTerms = new Set(
    GROUP_ORDER.filter((other) => other !== key)
      .flatMap((other) => termsByGroup[other])
      .map((term) => term.toLowerCase()),
  );
  const distinctive = own.filter((term) => !otherTerms.has(term.toLowerCase()));
  const emphasis = (distinctive.length ? distinctive : own).slice(0, 3);
  const lead = rows[0];
  const around = emphasis.length ? ` around ${emphasis.join(', ')}` : '';

  return {
    available: true,
    leanGroup: key,
    lean: lead.lean,
    sources: rows.map((row) => row.source),
    source: lead.source,
    headline: lead.title,
    url: lead.url,
    sentence: `${meta.adjective} outlets frame it${around}; ${lead.source} leads with “${cutWords(lead.title, 110)}”.`,
  };
}

export function framingOf(story = {}, { maxPerGroup = 4 } = {}) {
  const rows = [
    outletOf(story),
    ...(Array.isArray(story.alsoReportedBy) ? story.alsoReportedBy.map(outletOf) : []),
  ].filter((row) => row.source && row.title);

  // One headline per outlet (the first one seen), so a wire reprint does not
  // make one side of the spectrum look twice as large.
  const seenSources = new Set();
  const unique = rows.filter((row) => {
    if (seenSources.has(row.source)) return false;
    seenSources.add(row.source);
    return true;
  });

  const groups = { left: [], center: [], right: [] };
  for (const row of unique) groups[row.leanGroup].push(row);
  for (const key of GROUP_ORDER) {
    groups[key].sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0));
    groups[key] = groups[key].slice(0, maxPerGroup);
  }

  const spectrum = bucketCountsOf(unique.map((row) => ({ lean: row.lean })));
  const blindspot = isBlindspot(spectrum);
  const terms = consensusTerms(unique.map((row) => row.title));
  const groupsCovered = GROUP_ORDER.filter((key) => groups[key].length > 0);
  const missing = GROUP_ORDER.filter((key) => groups[key].length === 0);

  const termsByGroup = Object.fromEntries(GROUP_ORDER.map((key) => [
    key,
    [...new Set(groups[key].flatMap((row) => keyTopics(row.title, { limit: 5 })))],
  ]));

  const perspectives = Object.fromEntries(
    GROUP_ORDER.map((key) => [key, perspectiveFor(key, groups, termsByGroup)]),
  );

  // The lead report's own sentences, not its headline: these are the claims a
  // reader can check rather than a summary of spin.
  const leadText = [story.detail, story.summary]
    .filter(Boolean)
    .join('\n\n')
    // "11.51 p.m." must not be split into "11.51 p." and a stray "m.".
    .replace(/\b([ap])\.\s*m\.?/gi, '$1m');
  // heuristicSynthesis pads short excerpts with a sentinel line so the API
  // always has three bullets; a consensus card must not present it as a fact.
  const facts = [...new Set(heuristicSynthesis(leadText, detectSpin(leadText)).undisputedFacts)]
    .filter((fact) => fact && fact !== '…' && !/^The excerpt is too short/i.test(fact))
    .slice(0, 3);

  const bottomLine = terms.length
    ? `Every side here is describing the same event: ${terms.join(', ')}.`
    : 'No shared framing yet — the outlets are describing this story in different terms.';

  return {
    id: story.id || null,
    title: story.title || null,
    totalOutlets: unique.length,
    spectrum,
    blindspot,
    groups,
    groupsCovered,
    missing,
    perspectives,
    facts,
    bottomLine,
    consensus: {
      terms,
      // How much of the political spectrum carried the story at all. A story
      // covered only by the left is not a "consensus", whatever the wording.
      agreementPct: Math.round((groupsCovered.length / GROUP_ORDER.length) * 100),
      note: groupsCovered.length > 1
        ? `Covered from ${groupsCovered.length} of 3 parts of the spectrum.`
        : 'Covered by a single part of the spectrum.',
    },
    counterPerspectives: GROUP_ORDER
      .filter((key) => groups[key].length)
      .map((key) => ({ leanGroup: key, headline: groups[key][0].title, source: groups[key][0].source, url: groups[key][0].url })),
  };
}
