// Region and category classification from the article's own words.
// A feed's own tag is only a hint: a business feed carries US election
// stories, and "US" feeds carry plenty of Indian news. We score the headline
// and opening text for country/entity signals and topic keywords, and only
// overrule the feed when the text is clearly about something else.
const INDIA = [
  [/\b(lok sabha|rajya sabha|vidhan sabha|parliament of india|niti aayog)\b/i, 3],
  [/\b(bjp|bharatiya janata party|congress party|aam aadmi party|shiv sena|shiv sena \(ubt\)|dmk|aiadmk|trinamool|tmc|ncp|rjd|jdu|bsp|samajwadi party|aap)\b/i, 3],
  [/\b(narendra modi|pm modi|amit shah|rahul gandhi|mamata banerjee|arvind kejriwal|nitish kumar|m k stalin|yogi adityanath|s jaishankar|jaishankar|droupadi murmu|sonia gandhi|priyanka gandhi|nirmala sitharaman)\b/i, 3],
  [/\b(supreme court of india|bombay high court|delhi high court|madras high court|calcutta high court|karnataka high court|rajya sabha tv)\b/i, 3],
  [/\b(delhi|mumbai|bombay|bengaluru|bangalore|chennai|madras|kolkata|calcutta|hyderabad|pune|ahmedabad|jaipur|lucknow|patna|bhopal|kochi|cochin|chandigarh|guwahati|bhubaneswar|thiruvananthapuram|noida|gurugram|gurgaon|surat|nagpur|indore|visakhapatnam)\b/i, 2],
  [/\b(karnataka|kerala|tamil nadu|andhra pradesh|telangana|maharashtra|gujarat|rajasthan|punjab|haryana|bihar|west bengal|odisha|assam|jharkhand|chhattisgarh|madhya pradesh|uttar pradesh|goa|himachal pradesh|jammu|kashmir|ladakh|uttarakhand|manipur|tripura|meghalaya|sikkim|mizoram|nagaland|arunachal)\b/i, 2],
  [/\b(rupee|rupees|crore|lakh|sensex|nifty|rbi|sebi|irdai|gst|upi|aadhaar|pan card|isro|cbse|neet|jee main|upsc|bcci|ipl|nse|bse)\b/i, 2],
  [/\b(air india|indigo airlines|jio|reliance industries|tata group|adani|infosys|tcs|wipro|hdfc|icici|sbi|lic)\b/i, 2],
];

const FOREIGN = [
  [/\b(donald trump|trump|white house|us senate|senate|house of representatives|capitol hill|pentagon|state department|democrats|republicans|gop|washington|federal reserve|wall street|us supreme court|supreme court of the united states|fbi|cia|us military)\b/i, 3],
  [/\b(united kingdom|uk|britain|british|westminster|downing street|keir starmer|king charles|labour party|tory|house of commons)\b/i, 3],
  [/\b(gaza|israel|israeli|netanyahu|hamas|palestinian|west bank|lebanon|hezbollah|iran|tehran|syria|yemen|houthi)\b/i, 3],
  [/\b(ukraine|kyiv|putin|kremlin|russia|russian|nato|european union|brussels|germany|berlin|france|paris|macron|italy|spain|poland|hungary)\b/i, 3],
  [/\b(china|beijing|xi jinping|japan|tokyo|south korea|north korea|taiwan|pakistan|islamabad|afghanistan|taliban|bangladesh|dhaka|sri lanka|nepal|saudi arabia|riyadh|qatar|uae|dubai|africa|nigeria|kenya|south africa|brazil|mexico|canada|australia|new zealand|singapore|indonesia|malaysia|philippines|turkey|egypt)\b/i, 3],
  [/\b(nasdaq|dow jones|s&p 500|federal reserve|wall street|us economy|california|texas|florida|new york|chicago|los angeles)\b/i, 3],
  [/\b(tesla|nvidia|boeing|goldman sachs|jpmorgan|morgan stanley|meta platforms|spacex|nasa|un security council|world health organization|international monetary fund|world bank|united nations)\b/i, 2],
];

const CATEGORY_WORDS = {
  Politics: /\b(election|elections|parliament|assembly|lok sabha|bill|legislation|minister|chief minister|prime minister|cabinet|government|opposition|protest|protesters|party|congress|bjp|vote|voter|ballot|poll|polls|coalition|policy|diplomacy|diplomat|summit|sanction|sanctions|treaty|ceasefire|war|military|army|defence|defense|court|verdict|judge|police|arrest|cbi|probe|protest|resign|sworn in|cabinet|referendum|immigration|visa)\b/gi,
  Business: /\b(stock|stocks|share|shares|market|markets|sensex|nifty|rupee|inflation|gdp|trade|tariff|tariffs|earnings|ipo|bank|banks|banking|finance|financial|budget|company|companies|firm|profit|revenue|sales|merger|acquisition|deal|economy|economic|export|exports|import|imports|gst|recession|investors|investment|funding|valuation|billion|million|crash|rallies|layoffs|hiring|retail|startup)\b/gi,
  Technology: /\b(artificial intelligence|ai|chatgpt|openai|google|microsoft|apple|meta|amazon|nvidia|semiconductor|chip|chips|smartphone|iphone|android|software|app|apps|cyber|cybersecurity|hack|hackers|data breach|algorithm|robot|robotics|electric vehicle|ev|gadget|startup funding|cloud|internet)\b/gi,
  Science: /\b(nasa|isro|space|spacecraft|satellite|rocket|launch|climate|climate change|global warming|research|study|scientists|scientist|physics|astronomy|telescope|species|fossil|dna|quantum|experiment|discovery|ice|glacier|emissions|wildlife|ecosystem)\b/gi,
  Sports: /\b(cricket|test match|odi|t20|ipl|world cup|football|soccer|premier league|fifa|olympic|olympics|tennis|grand slam|badminton|hockey|kabaddi|basketball|nba|formula one|f1|grand prix|wrestling|athletics|athlete|coach|tournament|match|innings|wicket|goal|goals|league|qualifier|squad|trophy|medal|medals)\b/gi,
  Health: /\b(health|hospital|hospitals|disease|virus|covid|covid-19|vaccine|vaccination|cancer|medical|medicine|doctors|doctor|nurses|outbreak|infection|flu|dengue|malaria|tb|tuberculosis|mental health|nutrition|obesity|surgery|patients|world health organization|drug|drugs|fda|cdc)\b/gi,
  Entertainment: /\b(film|films|movie|movies|cinema|bollywood|hollywood|tollywood|actor|actress|director|box office|music|album|song|concert|celebrity|series|netflix|amazon prime|disney|trailer|oscars|academy awards|grammy|emmy|award|awards|festival|tv show|web series|streaming)\b/gi,
};

const hits = (text, re) => {
  const m = String(text || '').match(re);
  return m ? new Set(m.map((x) => x.toLowerCase())).size : 0;
};
const score = (text, rules) => rules.reduce((n, [re, w]) => n + (re.test(text) ? w : 0), 0);

export const keywordsOf = (text, category) => {
  const re = CATEGORY_WORDS[category];
  return re ? [...new Set((String(text).match(re) || []).map((x) => x.toLowerCase()))] : [];
};

// Keeps the feed's own region when the text is not clearly about somewhere else.
export function classifyRegion(text, feedRegion = 'world') {
  const india = score(text, INDIA);
  const foreign = score(text, FOREIGN);
  if (india >= 3 && india > foreign) return 'india';
  if (foreign >= 3 && foreign > india) return 'world';
  return feedRegion;
}

export function classifyCategory(title, text, feedCategory = 'Politics') {
  const scores = Object.entries(CATEGORY_WORDS).map(([cat, re]) => [
    cat,
    hits(title, re) * 2 + hits(text, re),
  ]).sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = scores[0];
  const feedScore = scores.find(([c]) => c === feedCategory)?.[1] ?? 0;
  // Only overrule the feed's tag on a clear margin, so a business story that
  // mentions an election once keeps its business tag.
  if (bestScore < 3 || bestScore < feedScore + 2) return feedCategory;
  return best;
}

export function classify({ title = '', summary = '', detail = '', feedRegion, feedCategory }) {
  const text = `${title}. ${summary} ${detail}`.slice(0, 1200);
  return {
    region: classifyRegion(text, feedRegion),
    category: classifyCategory(title, text, feedCategory),
  };
}
