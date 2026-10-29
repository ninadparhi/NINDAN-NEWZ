// Editorial-lean ratings for the publishers we aggregate, in the style of
// Ground News / AllSides / Ad Fontes. These are indicative, not objective:
// they describe a publication's general editorial stance, not every article.
// Keep this file in sync when adding feeds in feeds.js.
export const LEANS = ['left', 'center-left', 'center', 'center-right', 'right'];

const B = (lean, factuality, country) => ({ lean, factuality, country });

export const SOURCE_META = {
  // ---- India ----
  'The Hindu': B('center-left', 'high', 'IN'),
  'Indian Express': B('center', 'high', 'IN'),
  'NDTV': B('center-left', 'mixed', 'IN'),
  'Times of India': B('center-right', 'mixed', 'IN'),
  'Hindustan Times': B('center', 'high', 'IN'),
  'Mint': B('center', 'high', 'IN'),
  'PTI': B('center', 'high', 'IN'),
  'The Indian Express': B('center', 'high', 'IN'),
  'Livemint': B('center', 'high', 'IN'),
  // ---- World ----
  'BBC News': B('center', 'high', 'GB'),
  'Reuters': B('center', 'high', 'GB'),
  'AP': B('center', 'high', 'US'),
  'Associated Press': B('center', 'high', 'US'),
  'The Guardian': B('left', 'high', 'GB'),
  'Al Jazeera': B('center-left', 'high', 'QA'),
  'NewsAPI': B('unrated', 'unknown', ''),
  'GNews': B('unrated', 'unknown', ''),
  'NewsData.io': B('unrated', 'unknown', ''),
};

export function biasOf(source) {
  return SOURCE_META[source] || B('unrated', 'unknown', '');
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
