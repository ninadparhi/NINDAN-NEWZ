// Editorial-lean, factuality and ownership ratings for the publishers we
// aggregate, in the style of Ground News / AllSides / Ad Fontes / MBFC.
//
// These are indicative publication-level ratings compiled from those
// providers (and, for smaller Indian outlets, from the publication's own
// disclosures), not a verdict on any single article. Every entry keeps the
// providers it draws on in `ratings`, and the UI attributes them.
import { domainOf, logoUrlFor, profileOf, sourceForHost } from './sources.js';

export const LEANS = ['left', 'center-left', 'center', 'center-right', 'right'];
export const FACTUALITY = ['high', 'mixed', 'low', 'unknown'];
export const OWNER_TYPES = ['corporate', 'govt', 'independent', 'trust'];

export const RATING_PROVIDERS = {
  allsides: { name: 'AllSides', note: 'US media bias ratings by editorial stance' },
  adfontes: { name: 'Ad Fontes Media', note: 'Bias and reliability scores per outlet' },
  mbfc: { name: 'Media Bias/Fact Check', note: 'Bias and factual-reporting ratings' },
  disclosure: { name: 'Publisher disclosure', note: 'Ownership disclosed on the publisher site' },
};

const S = (lean, factuality, country, parent, type, ratings) => ({
  lean,
  factuality,
  country,
  ownership: { parent, type },
  ratings,
});

export const SOURCE_META = {
  // ---- India: broadsheet / legacy ----
  'The Hindu': S('center-left', 'high', 'IN', 'The Hindu Group (Kasturi & Sons)', 'corporate', ['mbfc', 'disclosure']),
  'The Hindu BusinessLine': S('center-left', 'high', 'IN', 'The Hindu Group (Kasturi & Sons)', 'corporate', ['mbfc', 'disclosure']),
  'Indian Express': S('center', 'high', 'IN', 'Indian Express Group', 'corporate', ['mbfc', 'disclosure']),
  'The Indian Express': S('center', 'high', 'IN', 'Indian Express Group', 'corporate', ['mbfc', 'disclosure']),
  'Times of India': S('center-right', 'mixed', 'IN', 'Bennett, Coleman & Co. (Times Group)', 'corporate', ['mbfc', 'disclosure']),
  'Hindustan Times': S('center', 'high', 'IN', 'HT Media (KK Birla family)', 'corporate', ['mbfc', 'disclosure']),
  'Mint': S('center', 'high', 'IN', 'HT Media', 'corporate', ['mbfc', 'disclosure']),
  'Livemint': S('center', 'high', 'IN', 'HT Media', 'corporate', ['mbfc', 'disclosure']),
  'Deccan Herald': S('center', 'high', 'IN', 'The Printers (Mysore)', 'corporate', ['disclosure']),
  'Deccan Chronicle': S('center-right', 'mixed', 'IN', 'Deccan Chronicle Holdings', 'corporate', ['disclosure']),
  'Free Press Journal': S('center', 'mixed', 'IN', 'Free Press Journal Group', 'corporate', ['disclosure']),
  'Greater Kashmir': S('center', 'mixed', 'IN', 'Greater Kashmir Communications', 'independent', ['disclosure']),
  'The Federal': S('center-left', 'high', 'IN', 'The Federal (independent)', 'independent', ['disclosure']),

  // ---- India: broadcast ----
  NDTV: S('center-left', 'mixed', 'IN', 'AMG Media Networks (Adani Group)', 'corporate', ['mbfc', 'disclosure']),
  'India Today': S('center', 'mixed', 'IN', 'Living Media India', 'corporate', ['disclosure']),
  'Zee News': S('center-right', 'mixed', 'IN', 'Zee Media Corporation', 'corporate', ['mbfc', 'disclosure']),

  // ---- India: business ----
  'Economic Times': S('center-right', 'mixed', 'IN', 'Bennett, Coleman & Co. (Times Group)', 'corporate', ['disclosure']),

  // ---- India: opinion / right of centre ----
  OpIndia: S('right', 'mixed', 'IN', 'Defence Media Network', 'independent', ['mbfc', 'disclosure']),
  Organiser: S('right', 'mixed', 'IN', 'Rashtriya Swayamsevak Sangh', 'independent', ['disclosure']),
  Swarajya: S('right', 'mixed', 'IN', 'Swarajya Publications', 'independent', ['mbfc', 'disclosure']),

  'Washington Post': S('center-left', 'high', 'US', 'Nash Holdings (Jeff Bezos)', 'corporate', ['allsides', 'adfontes']),
  'Financial Times': S('center', 'high', 'GB', 'Nikkei Inc.', 'corporate', ['adfontes', 'mbfc']),

  // ---- India: added for domain resolution ----
  News18: S('center-right', 'mixed', 'IN', 'Network18 (Reliance Industries)', 'corporate', ['mbfc', 'disclosure']),
  ThePrint: S('center', 'high', 'IN', 'ThePrint (independent)', 'independent', ['disclosure']),
  'The Wire': S('left', 'mixed', 'IN', 'Foundation for Independent Journalism', 'trust', ['disclosure']),
  Scroll: S('center-left', 'mixed', 'IN', 'Scroll Media', 'independent', ['disclosure']),
  Firstpost: S('center-right', 'mixed', 'IN', 'Network18 (Reliance Industries)', 'corporate', ['disclosure']),
  'Business Standard': S('center-right', 'high', 'IN', 'Business Standard Ltd', 'corporate', ['disclosure']),

  // ---- Wire services / APIs ----
  PTI: S('center', 'high', 'IN', 'Press Trust of India (cooperative)', 'trust', ['disclosure']),
  Reuters: S('center', 'high', 'GB', 'Thomson Reuters', 'corporate', ['adfontes', 'mbfc']),
  AP: S('center', 'high', 'US', 'Associated Press (nonprofit)', 'trust', ['adfontes', 'mbfc']),
  'Associated Press': S('center', 'high', 'US', 'Associated Press (nonprofit)', 'trust', ['adfontes', 'mbfc']),

  // ---- World: public broadcasters ----
  'BBC News': S('center', 'high', 'GB', 'BBC (Royal Charter, licence fee)', 'govt', ['adfontes', 'mbfc']),
  DW: S('center', 'high', 'DE', 'Deutsche Welle (German federal government)', 'govt', ['mbfc', 'disclosure']),
  'France 24': S('center', 'high', 'FR', 'France Médias Monde (French state)', 'govt', ['mbfc', 'disclosure']),
  NPR: S('center-left', 'high', 'US', 'National Public Radio (nonprofit)', 'trust', ['allsides', 'adfontes']),
  'ABC Australia': S('center', 'high', 'AU', 'Australian Broadcasting Corporation (public)', 'govt', ['mbfc', 'disclosure']),
  'Sky News': S('center', 'high', 'GB', 'Sky Group (Comcast)', 'corporate', ['mbfc', 'disclosure']),
  Euronews: S('center', 'mixed', 'FR', 'Euronews SA (Alpac Capital)', 'corporate', ['mbfc', 'disclosure']),

  // ---- World: centre / liberal ----
  'The Guardian': S('left', 'high', 'GB', 'Scott Trust Limited', 'trust', ['allsides', 'adfontes']),
  CNN: S('center-left', 'mixed', 'US', 'Warner Bros. Discovery', 'corporate', ['allsides', 'adfontes']),
  'New York Times': S('left', 'high', 'US', 'The New York Times Company', 'corporate', ['allsides', 'adfontes']),
  'LA Times': S('center-left', 'high', 'US', 'Los Angeles Times (Soon-Shiong family)', 'corporate', ['allsides', 'mbfc']),
  'Straits Times': S('center', 'high', 'SG', 'SPH Media Trust', 'trust', ['mbfc', 'disclosure']),
  'Al Jazeera': S('center-left', 'high', 'QA', 'Qatar Media Corporation (state-funded)', 'govt', ['mbfc', 'disclosure']),

  // ---- World: business / markets ----
  'Wall Street Journal': S('center-right', 'high', 'US', 'News Corp (Dow Jones)', 'corporate', ['allsides', 'adfontes']),
  Bloomberg: S('center', 'high', 'US', 'Bloomberg L.P.', 'corporate', ['mbfc', 'disclosure']),
  CNBC: S('center', 'high', 'US', 'NBCUniversal (Comcast)', 'corporate', ['allsides', 'mbfc']),
  'The Economist': S('center-right', 'high', 'GB', 'The Economist Group (independent trust)', 'trust', ['allsides', 'adfontes']),

  // ---- World: right of centre ----
  'Fox News': S('right', 'mixed', 'US', 'Fox Corporation', 'corporate', ['allsides', 'adfontes']),
  Politico: S('center', 'high', 'US', 'Axel Springer SE', 'corporate', ['allsides', 'mbfc']),
  'The Hill': S('center', 'high', 'US', 'Nexstar Media Group', 'corporate', ['allsides', 'mbfc']),
  Axios: S('center', 'high', 'US', 'Axios Media (Cox Enterprises)', 'corporate', ['allsides', 'disclosure']),

  // ---- World: Asia / Middle East ----
  'Japan Times': S('center', 'high', 'JP', 'News2u Holdings', 'corporate', ['disclosure']),
  SCMP: S('center', 'mixed', 'HK', 'Alibaba Group', 'corporate', ['mbfc', 'disclosure']),
  'Times of Israel': S('center', 'high', 'IL', 'Times of Israel (independent)', 'independent', ['disclosure']),

  // ---- Science ----
  'New Scientist': S('center', 'high', 'GB', 'New Scientist Ltd', 'corporate', ['disclosure']),
  Nature: S('center', 'high', 'GB', 'Springer Nature', 'corporate', ['disclosure']),

  // ---- API aggregators (the underlying outlet varies) ----
  NewsAPI: S('unrated', 'unknown', '', 'NewsAPI aggregator', 'corporate', []),
  GNews: S('unrated', 'unknown', '', 'GNews aggregator', 'corporate', []),
  'NewsData.io': S('unrated', 'unknown', '', 'NewsData.io aggregator', 'corporate', []),
};

export const FALLBACK_META = S('unrated', 'unknown', '', 'Unknown', 'independent', []);

export function biasOf(source) {
  return SOURCE_META[source] || FALLBACK_META;
}

// The five lean levels are the ONLY buckets used by every bar, legend, chip and
// summary in the app (plus 'unrated' for publishers we do not rate). Collapsing
// center-left into "Left" is what used to make a chip disagree with a legend.
export const LEAN_BUCKETS = [...LEANS, 'unrated'];
export const leanBucket = (lean) => (LEANS.includes(lean) ? lean : 'unrated');
export const emptyBuckets = () => Object.fromEntries(LEAN_BUCKETS.map((k) => [k, 0]));
export function bucketCountsOf(sources) {
  const out = emptyBuckets();
  for (const s of sources) out[leanBucket(s.lean)] += 1;
  return out;
}

// lean / group (left, center, right) used by the blindspot check and the
// "left vs right" framing on the story page.
export const leanGroup = (lean) =>
  lean === 'left' || lean === 'center-left' ? 'left'
  : lean === 'right' || lean === 'center-right' ? 'right' : 'center';

// Resolve an archived article to the outlet that actually published it: the
// feed's own name when it is rated, otherwise the publication behind its URL.
// This is what keeps aggregator names ("NewsAPI") from becoming untracked.
export function resolveSource(row = {}) {
  const known = biasOf(row.source);
  const host = domainOf(row.url);
  const mapped = sourceForHost(host);
  const source = known.lean !== 'unrated' ? row.source : (mapped || row.source || 'Unknown');
  const base = biasOf(source);
  const lean = base.lean !== 'unrated' ? base.lean : (row.lean || 'unrated');
  const profile = profileOf(source);
  const domain = profile?.domain || host || '';
  return {
    source,
    lean,
    country: base.country || profile?.country || row.country || '',
    factuality: base.factuality || 'unknown',
    ownership: base.ownership || { parent: 'Unknown', type: 'independent' },
    domain,
    logoUrl: logoUrlFor(domain),
    tracked: lean !== 'unrated',
  };
}

// Source Coverage metric: how many distinct outlets in one story cluster belong
// to each side of the spectrum. Unrated outlets are counted separately, never
// folded into Center. This answers "who covered it", not "how it is written".
export function sourceBreakdownOf(rows = []) {
  const seen = new Map();
  for (const row of rows) {
    const info = resolveSource(row);
    if (!info.source || seen.has(info.source)) continue;
    seen.set(info.source, info.lean);
  }
  const out = {
    leftCount: 0, centerCount: 0, rightCount: 0, untrackedCount: 0, totalSources: seen.size,
  };
  for (const lean of seen.values()) {
    if (!LEANS.includes(lean)) { out.untrackedCount += 1; continue; }
    const group = leanGroup(lean);
    if (group === 'left') out.leftCount += 1;
    else if (group === 'right') out.rightCount += 1;
    else out.centerCount += 1;
  }
  return out;
}

// Seven buckets for the coverage dashboard, matching the StoryCluster schema.
export function sourceCountsOf(rows = []) {
  const seen = new Map();
  for (const row of rows) {
    const info = resolveSource(row);
    if (!info.source || seen.has(info.source)) continue;
    seen.set(info.source, info.lean);
  }
  const out = {
    total: seen.size, left: 0, leanLeft: 0, center: 0, leanRight: 0, right: 0, untracked: 0,
  };
  for (const lean of seen.values()) {
    const key = { 'center-left': 'leanLeft', 'center-right': 'leanRight' }[lean] || lean;
    if (key in out) out[key] += 1;
    else out.untracked += 1;
  }
  return out;
}

// One meta payload for the client: rating record + country + logo, keyed by
// publication name so cards can render a source block without extra requests.
export function sourceDirectory() {
  const out = {};
  for (const [name, meta] of Object.entries(SOURCE_META)) {
    const profile = profileOf(name);
    out[name] = {
      ...meta,
      country: meta.country || profile?.country || '',
      domain: profile?.domain || '',
      logoUrl: logoUrlFor(profile?.domain),
    };
  }
  return out;
}

// Blindspot: one lean group has <15% of coverage AND total sources >= 4
export const isBlindspot = (counts) => {
  const total = Object.values(counts).reduce((n, v) => n + v, 0);
  if (total < 4) return false;
  const left = (counts.left || 0) + (counts['center-left'] || 0);
  const right = (counts.right || 0) + (counts['center-right'] || 0);
  const center = (counts.center || 0);
  const groups = { left, center, right };
  for (const [key, n] of Object.entries(groups)) {
    if (n > 0 && n / total < 0.15) return true;
  }
  return false;
};

export const factualityLabel = (f) =>
  ({ high: 'High', mixed: 'Mixed', low: 'Low', unknown: 'Unrated' }[f] || 'Unrated');

export const ownerTypeLabel = (t) =>
  ({ corporate: 'Corporate', govt: 'Public / state', independent: 'Independent', trust: 'Trust / nonprofit' }[t] || 'Unknown');
