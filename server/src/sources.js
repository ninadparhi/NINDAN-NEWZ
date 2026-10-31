// Source identity: publication -> domain, and domain -> publication.
//
// Aggregated feeds often report a wire or aggregator name instead of the outlet
// that actually published the story. Resolving the article URL against this map
// recovers the real publication, which is what stops most coverage counts from
// collapsing into "untracked". Dependency-free on purpose: bias.js imports this
// module, so it must not import anything back.

export const SOURCE_PROFILES = {
  // ---- India ----
  'The Hindu': { domain: 'thehindu.com', country: 'IN' },
  'The Hindu BusinessLine': { domain: 'thehindubusinessline.com', country: 'IN' },
  'Indian Express': { domain: 'indianexpress.com', country: 'IN' },
  'The Indian Express': { domain: 'indianexpress.com', country: 'IN' },
  'Times of India': { domain: 'timesofindia.indiatimes.com', country: 'IN' },
  'Hindustan Times': { domain: 'hindustantimes.com', country: 'IN' },
  Mint: { domain: 'livemint.com', country: 'IN' },
  Livemint: { domain: 'livemint.com', country: 'IN' },
  'Economic Times': { domain: 'economictimes.indiatimes.com', country: 'IN' },
  NDTV: { domain: 'ndtv.com', country: 'IN' },
  'India Today': { domain: 'indiatoday.in', country: 'IN' },
  'Zee News': { domain: 'zeenews.india.com', country: 'IN' },
  'Deccan Herald': { domain: 'deccanherald.com', country: 'IN' },
  'Deccan Chronicle': { domain: 'deccanchronicle.com', country: 'IN' },
  'Free Press Journal': { domain: 'freepressjournal.in', country: 'IN' },
  'Greater Kashmir': { domain: 'greaterkashmir.com', country: 'IN' },
  'The Federal': { domain: 'thefederal.com', country: 'IN' },
  OpIndia: { domain: 'opindia.com', country: 'IN' },
  Organiser: { domain: 'organiser.org', country: 'IN' },
  Swarajya: { domain: 'swarajyamag.com', country: 'IN' },
  PTI: { domain: 'ptinews.com', country: 'IN' },
  News18: { domain: 'news18.com', country: 'IN' },
  ThePrint: { domain: 'theprint.in', country: 'IN' },
  'The Wire': { domain: 'thewire.in', country: 'IN' },
  Scroll: { domain: 'scroll.in', country: 'IN' },
  Firstpost: { domain: 'firstpost.com', country: 'IN' },
  'Business Standard': { domain: 'business-standard.com', country: 'IN' },

  // ---- Wire services / world ----
  Reuters: { domain: 'reuters.com', country: 'GB' },
  AP: { domain: 'apnews.com', country: 'US' },
  'Associated Press': { domain: 'apnews.com', country: 'US' },
  'BBC News': { domain: 'bbc.com', country: 'GB' },
  DW: { domain: 'dw.com', country: 'DE' },
  'France 24': { domain: 'france24.com', country: 'FR' },
  NPR: { domain: 'npr.org', country: 'US' },
  'ABC Australia': { domain: 'abc.net.au', country: 'AU' },
  'Sky News': { domain: 'news.sky.com', country: 'GB' },
  Euronews: { domain: 'euronews.com', country: 'FR' },
  'The Guardian': { domain: 'theguardian.com', country: 'GB' },
  CNN: { domain: 'cnn.com', country: 'US' },
  'New York Times': { domain: 'nytimes.com', country: 'US' },
  'LA Times': { domain: 'latimes.com', country: 'US' },
  'Washington Post': { domain: 'washingtonpost.com', country: 'US' },
  'Straits Times': { domain: 'straitstimes.com', country: 'SG' },
  'Al Jazeera': { domain: 'aljazeera.com', country: 'QA' },
  'Wall Street Journal': { domain: 'wsj.com', country: 'US' },
  Bloomberg: { domain: 'bloomberg.com', country: 'US' },
  CNBC: { domain: 'cnbc.com', country: 'US' },
  'The Economist': { domain: 'economist.com', country: 'GB' },
  'Fox News': { domain: 'foxnews.com', country: 'US' },
  Politico: { domain: 'politico.com', country: 'US' },
  'The Hill': { domain: 'thehill.com', country: 'US' },
  Axios: { domain: 'axios.com', country: 'US' },
  'Japan Times': { domain: 'japantimes.co.jp', country: 'JP' },
  SCMP: { domain: 'scmp.com', country: 'HK' },
  'Times of Israel': { domain: 'timesofisrael.com', country: 'IL' },
  'New Scientist': { domain: 'newscientist.com', country: 'GB' },
  Nature: { domain: 'nature.com', country: 'GB' },
  'Financial Times': { domain: 'ft.com', country: 'GB' },
};

// Hosts that are not the publication's canonical domain, or that several brands
// share. Keep entries lowercase and www-free.
export const HOST_TO_SOURCE = {
  'thehindu.com': 'The Hindu',
  'thehindubusinessline.com': 'The Hindu BusinessLine',
  'indianexpress.com': 'Indian Express',
  'timesofindia.indiatimes.com': 'Times of India',
  'economictimes.indiatimes.com': 'Economic Times',
  'hindustantimes.com': 'Hindustan Times',
  'livemint.com': 'Mint',
  'ndtv.com': 'NDTV',
  'indiatoday.in': 'India Today',
  'zeenews.india.com': 'Zee News',
  'deccanherald.com': 'Deccan Herald',
  'deccanchronicle.com': 'Deccan Chronicle',
  'freepressjournal.in': 'Free Press Journal',
  'greaterkashmir.com': 'Greater Kashmir',
  'thefederal.com': 'The Federal',
  'opindia.com': 'OpIndia',
  'organiser.org': 'Organiser',
  'swarajyamag.com': 'Swarajya',
  'ptinews.com': 'PTI',
  'news18.com': 'News18',
  'theprint.in': 'ThePrint',
  'thewire.in': 'The Wire',
  'scroll.in': 'Scroll',
  'firstpost.com': 'Firstpost',
  'business-standard.com': 'Business Standard',
  'reuters.com': 'Reuters',
  'apnews.com': 'AP',
  'bbc.com': 'BBC News',
  'bbc.co.uk': 'BBC News',
  'dw.com': 'DW',
  'france24.com': 'France 24',
  'npr.org': 'NPR',
  'abc.net.au': 'ABC Australia',
  'news.sky.com': 'Sky News',
  'euronews.com': 'Euronews',
  'theguardian.com': 'The Guardian',
  'cnn.com': 'CNN',
  'nytimes.com': 'New York Times',
  'latimes.com': 'LA Times',
  'washingtonpost.com': 'Washington Post',
  'straitstimes.com': 'Straits Times',
  'aljazeera.com': 'Al Jazeera',
  'wsj.com': 'Wall Street Journal',
  'bloomberg.com': 'Bloomberg',
  'cnbc.com': 'CNBC',
  'economist.com': 'The Economist',
  'foxnews.com': 'Fox News',
  'politico.com': 'Politico',
  'thehill.com': 'The Hill',
  'axios.com': 'Axios',
  'japantimes.co.jp': 'Japan Times',
  'scmp.com': 'SCMP',
  'timesofisrael.com': 'Times of Israel',
  'newscientist.com': 'New Scientist',
  'nature.com': 'Nature',
  'ft.com': 'Financial Times',
};

export function domainOf(url = '') {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// A bare host, plus its registrable part, so `edition.cnn.com` still lands on
// cnn.com without pulling in a full public-suffix list.
export function hostCandidates(host = '') {
  if (!host) return [];
  const parts = host.split('.');
  const bare = host.replace(/^www\./, '');
  const registrable = parts.length > 2 ? parts.slice(-2).join('.') : bare;
  return [...new Set([bare, registrable])];
}

export function sourceForHost(host = '') {
  for (const candidate of hostCandidates(host)) {
    const hit = HOST_TO_SOURCE[candidate];
    if (hit) return hit;
  }
  return null;
}

export const logoUrlFor = (domain) => (domain
  ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`
  : null);

export const profileOf = (name) => SOURCE_PROFILES[name] || null;
