// Ownership and funding data for the Global Framing drawer.
//
// Every publication in bias.js already carries a parent company; this module
// turns that into a stakeholder record: who ultimately controls the outlet and
// which funding model it runs on. Funding types follow the product vocabulary —
// Private, State-backed, VC, Public (publicly listed) — and nonprofit trusts are
// marked with `nonprofit: true` rather than inventing a sixth type.
//
// The data is indicative and based on public disclosures, matching the ratings
// in bias.js. The UI attributes it as such.
import { SOURCE_META, RATING_PROVIDERS } from './bias.js';

const O = (funders, fundingType, ultimate, note) => ({ funders, fundingType, ultimate, note });

const OWNERSHIP = {
  // ---- India ----
  'The Hindu Group (Kasturi & Sons)': O(
    ['Kasturi family (controlling stake)', 'Institutional shareholders'],
    'Private', ['Kasturi family'],
    'Family-controlled since 1878; no single political proprietor.',
  ),
  'Indian Express Group': O(
    ['Devidas family (controlling stake)'], 'Private', ['Viveck Goenka / Devidas family'],
    'Family-owned group; also publishes the Financial Express and Loksatta.',
  ),
  'Bennett, Coleman & Co. (Times Group)': O(
    ['Sahu Jain family', 'Private equity holdings'], 'Private', ['Sahu Jain family'],
    'India\'s largest media group by revenue; owner of Times of India and Economic Times.',
  ),
  'HT Media (KK Birla family)': O(
    ['KK Birla family', 'Public shareholders'], 'Public', ['KK Birla family'],
    'Listed on Indian exchanges; the Birla family holds the controlling stake.',
  ),
  'HT Media': O(
    ['KK Birla family', 'Public shareholders'], 'Public', ['KK Birla family'],
    'Listed on Indian exchanges; the Birla family holds the controlling stake.',
  ),
  'The Printers (Mysore)': O(
    ['Narayana Murthy family (majority)', 'Public shareholders'], 'Public', ['Narayana Murthy family'],
    'Infosys co-founder family holds the controlling stake in Deccan Herald.',
  ),
  'Deccan Chronicle Holdings': O(
    ['Lenders (post-insolvency)', 'Public shareholders'], 'Private', ['Lender consortium'],
    'Went through insolvency proceedings after a debt default in the 2010s.',
  ),
  'AMG Media Networks (Adani Group)': O(
    ['Adani Group'], 'Private', ['Gautam Adani family'],
    'Adani Group acquired a majority stake in NDTV in 2022.',
  ),
  'Living Media India': O(
    ['Living Media India (Aroon Purie family)'], 'Private', ['Aroon Purie family'],
    'Family-controlled; TV Today Network is its listed broadcast arm.',
  ),
  'Zee Media Corporation': O(
    ['Essel Group', 'Public shareholders'], 'Public', ['Subhash Chandra family'],
    'Listed broadcaster; Essel Group founded the network.',
  ),
  'Defence Media Network': O(['Private promoters'], 'Private', ['Private promoters'],
    'Publishes OpIndia; funded through advertising and subscriptions.'),
  'Rashtriya Swayamsevak Sangh': O(
    ['RSS cadres and donations'], 'Private', ['Rashtriya Swayamsevak Sangh'],
    'Organiser is the official RSS weekly; the RSS is the BJP\'s ideological parent.',
  ),
  'Swarajya Publications': O(
    ['Private promoters', 'Reader subscriptions'], 'Private', ['Private promoters'],
    'Right-of-centre magazine funded by subscriptions and advertising.',
  ),
  'The Federal (independent)': O(
    ['Founder-led private investment'], 'Private', ['Founders'],
    'Digital-only outlet launched by former senior journalists.',
  ),
  'Free Press Journal Group': O(['Private promoters'], 'Private', ['Private promoters']),
  'Greater Kashmir Communications': O(['Private promoters'], 'Private', ['Private promoters']),
  'The Hindu Group': O(['Kasturi family'], 'Private', ['Kasturi family']),

  // ---- Wire services / global ----
  'Thomson Reuters': O(
    ['Public shareholders', 'Woodbridge (Thomson family)'], 'Public', ['Woodbridge / Thomson family'],
    'Listed company; the Thomson family holds the largest stake through Woodbridge.',
  ),
  'Associated Press (nonprofit)': O(
    ['Member newspapers and broadcasters', 'News licensing revenue'], 'Private', ['Member cooperative'],
    'US nonprofit cooperative owned by its member news organisations.',
  ),
  'Press Trust of India (cooperative)': O(
    ['Member newspapers (cooperative)', 'Subscription revenue'], 'Private', ['Member newspapers'],
    'India\'s largest news agency, owned as a cooperative of subscribing papers.',
  ),
  'BBC (Royal Charter, licence fee)': O(
    ['UK television licence fee', 'BBC Studios commercial revenue'], 'State-backed', ['UK licence fee payers'],
    'Editorially independent under a Royal Charter; funded by the licence fee, not the government budget.',
  ),
  'Deutsche Welle (German federal government)': O(
    ['German federal budget'], 'State-backed', ['German federal government'],
    'Public international broadcaster funded from the federal budget.',
  ),
  'France Médias Monde (French state)': O(
    ['French state budget'], 'State-backed', ['French government'],
    'Holds France 24 and RFI under a state-funded holding.',
  ),
  'National Public Radio (nonprofit)': O(
    ['Member station fees', 'Sponsorships', 'Grants'], 'Private', ['Member stations'],
    'US nonprofit; a small share of funding comes from federal grants.',
  ),
  'Australian Broadcasting Corporation (public)': O(
    ['Australian federal budget'], 'State-backed', ['Australian government'],
    'Statutory public broadcaster, editorially independent of government.',
  ),
  'Sky Group (Comcast)': O(['Comcast Corporation'], 'Public', ['Comcast Corporation']),
  'Euronews SA (Alpac Capital)': O(
    ['Alpac Capital (majority)', 'European public broadcasters (minority)'], 'Private', ['Alpac Capital'],
    'Portuguese investment fund took a controlling stake in 2021.',
  ),
  'Scott Trust Limited': O(
    ['Scott Trust endowment', 'Reader contributions', 'Advertising'], 'Private', ['Scott Trust'],
    'The Guardian is owned by the Scott Trust; profits are reinvested in journalism.',
  ),
  'Warner Bros. Discovery': O(['Public shareholders'], 'Public', ['Warner Bros. Discovery, Inc.']),
  'The New York Times Company': O(
    ['Public shareholders', 'Sulpicio C. Ochs family (Class B)'], 'Public', ['Ochs-Sulzberger family'],
    'Listed company; the founding family controls it through dual-class shares.',
  ),
  'Los Angeles Times (Soon-Shiong family)': O(
    ['Patrick and Michele Soon-Shiong'], 'Private', ['Soon-Shiong family'],
    'Bought from Tribune Publishing in 2018 by the biomedical entrepreneur.',
  ),
  'SPH Media Trust': O(
    ['Public shareholders (former SPH)', 'Trust structure'], 'Private', ['SPH Media Trust'],
    'Restructured into a not-for-profit trust in 2021; still commercially funded.',
  ),
  'Qatar Media Corporation (state-funded)': O(
    ['Qatar state'], 'State-backed', ['Government of Qatar'],
    'Al Jazeera is funded by the Qatari state.',
  ),
  'News Corp (Dow Jones)': O(
    ['Public shareholders', 'Murdoch Family Trust'], 'Public', ['Murdoch Family Trust'],
    'News Corp owns Dow Jones, publisher of the Wall Street Journal.',
  ),
  'Bloomberg L.P.': O(
    ['Michael Bloomberg (controlling stake)', 'Private investors'], 'Private', ['Michael Bloomberg'],
    'Terminal revenue funds the newsroom; founder retains control.',
  ),
  'NBCUniversal (Comcast)': O(['Comcast Corporation'], 'Public', ['Comcast Corporation']),
  'The Economist Group (independent trust)': O(
    ['Exor / Agnelli family (largest shareholder)', 'Independent trust', 'Staff shareholders'], 'Private',
    ['Cadbury family trust', 'Exor'],
    'Trust structure protects editorial independence; Exor is the largest outside investor.',
  ),
  'Fox Corporation': O(
    ['Public shareholders', 'Murdoch Family Trust'], 'Public', ['Murdoch Family Trust'],
  ),
  'Axel Springer SE': O(
    ['KKR (largest shareholder)', 'Friede Springer / Döpfner'], 'Private', ['KKR'],
    'Politico\'s owner is Europe\'s largest digital publisher, majority-held by KKR.',
  ),
  'Nexstar Media Group': O(['Public shareholders'], 'Public', ['Nexstar Media Group, Inc.']),
  'Axios Media (Cox Enterprises)': O(['Cox Enterprises'], 'Private', ['Cox family']),
  'News2u Holdings': O(['Private promoters'], 'Private', ['Private promoters']),
  'Alibaba Group': O(['Public shareholders', 'Alibaba partnership'], 'Public', ['Alibaba Group'],
    'SCMP is owned by the Chinese e-commerce group.'),
  'Times of Israel (independent)': O(
    ['Founder-led private investment', 'Advertising'], 'Private', ['Founders'],
  ),
  'New Scientist Ltd': O(['Private investors'], 'Private', ['Private investors']),
  'Springer Nature': O(
    ['Holtzbrinck Publishing Group (majority)', 'BC Partners'], 'Private', ['Holtzbrinck Publishing Group'],
    'Nature is published by Springer Nature, majority-owned by Holtzbrinck.',
  ),
};

const TYPE_TO_FUNDING = {
  corporate: 'Private',
  govt: 'State-backed',
  independent: 'Private',
  trust: 'Private',
};

const list = (items) => (Array.isArray(items) ? items : []);

// A stakeholder record for a publication name, or an explicit "unrated" record
// when we have no data. Never throws: the drawer must render for any source the
// aggregator has seen, including API aggregators and unknown feeds.
export function stakeholderOf(publicationName = '') {
  const meta = SOURCE_META[publicationName];
  if (!meta) {
    return {
      publicationName: publicationName || 'Unknown publication',
      parentCompany: 'Unknown',
      majorFunders: [],
      fundingType: 'Private',
      nonprofit: false,
      ownershipChain: [],
      lean: 'unrated',
      factuality: 'unknown',
      country: '',
      ratings: [],
      note: 'No ownership data on file for this publication.',
      known: false,
    };
  }

  const parent = meta.ownership?.parent || 'Unknown';
  const info = OWNERSHIP[parent] || {};
  const funders = list(info.funders);
  const ultimate = list(info.ultimate);
  const ownershipChain = [...new Set([...ultimate, parent, publicationName].filter(Boolean))];

  return {
    publicationName,
    parentCompany: parent,
    majorFunders: funders.length ? funders : [`${parent} (operating revenue)`],
    fundingType: info.fundingType || TYPE_TO_FUNDING[meta.ownership?.type] || 'Private',
    nonprofit: /nonprofit|trust|cooperative/i.test(parent),
    ownershipChain,
    lean: meta.lean,
    factuality: meta.factuality,
    country: meta.country || '',
    ratings: (meta.ratings || []).map((r) => RATING_PROVIDERS[r]?.name || r),
    note: info.note || 'Ownership disclosed by the publisher; funding covers advertising and subscriptions.',
    known: true,
  };
}

export const STAKEHOLDER_COUNT = Object.keys(SOURCE_META).length;
