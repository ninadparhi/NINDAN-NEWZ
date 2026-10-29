// Feed URLs change occasionally; a dead feed is skipped, not fatal. Every
// failure is logged by the fetcher (`feed failed: <url> <reason>`), so a
// publisher that starts blocking us shows up in the log instead of breaking
// the refresh.
//
// Probed but NOT included, because they block scraping or serve broken XML:
// Firstpost (403), Business Standard (403), News18 (403), Moneycontrol (403),
// Telegraph India (403), The Telegraph UK (403), Al Arabiya (403),
// Washington Post (timeout), CBC (timeout), The Wire / The Print (malformed
// XML), Scroll.in, The Quint, Republic World, Live Law, The News Minute,
// National Herald, The Statesman, Rest of World.
const f = (source, region, category, url) => ({ source, region, category, url });
const B = 'http://feeds.bbci.co.uk';
const G = 'https://www.theguardian.com';

export const FEEDS = [
  // ---- India: broadsheet / legacy ----
  f('The Hindu', 'india', 'Politics', 'https://www.thehindu.com/news/national/feeder/default.rss'),
  f('The Hindu', 'india', 'Business', 'https://www.thehindu.com/business/feeder/default.rss'),
  f('The Hindu', 'india', 'Science', 'https://www.thehindu.com/sci-tech/science/feeder/default.rss'),
  f('The Hindu', 'india', 'Sports', 'https://www.thehindu.com/sport/feeder/default.rss'),
  f('The Hindu BusinessLine', 'india', 'Business', 'https://www.thehindubusinessline.com/feeder/default.rss'),
  f('Indian Express', 'india', 'Politics', 'https://indianexpress.com/section/india/feed/'),
  f('Indian Express', 'india', 'Business', 'https://indianexpress.com/section/business/feed/'),
  f('Indian Express', 'india', 'Technology', 'https://indianexpress.com/section/technology/feed/'),
  f('Indian Express', 'india', 'Sports', 'https://indianexpress.com/section/sports/feed/'),
  f('Indian Express', 'india', 'Entertainment', 'https://indianexpress.com/section/entertainment/feed/'),
  f('Times of India', 'india', 'Politics', 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms'),
  f('Times of India', 'india', 'Business', 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms'),
  f('Times of India', 'india', 'Sports', 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms'),
  f('Times of India', 'india', 'Technology', 'https://timesofindia.indiatimes.com/rssfeeds/66949542.cms'),
  f('Times of India', 'india', 'Entertainment', 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms'),
  f('Hindustan Times', 'india', 'Politics', 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml'),
  f('Hindustan Times', 'india', 'Business', 'https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml'),
  f('Hindustan Times', 'india', 'Sports', 'https://www.hindustantimes.com/feeds/rss/sports/rssfeed.xml'),
  f('Hindustan Times', 'india', 'Entertainment', 'https://www.hindustantimes.com/feeds/rss/entertainment/rssfeed.xml'),
  f('Deccan Herald', 'india', 'Politics', 'https://www.deccanherald.com/feed'),
  f('Deccan Chronicle', 'india', 'Politics', 'https://www.deccanchronicle.com/rss_feed/'),
  f('Free Press Journal', 'india', 'Politics', 'https://www.freepressjournal.in/stories.rss'),
  f('Greater Kashmir', 'india', 'Politics', 'https://www.greaterkashmir.com/feed/'),
  f('The Federal', 'india', 'Politics', 'https://thefederal.com/feed/'),

  // ---- India: broadcast ----
  f('NDTV', 'india', 'Politics', 'https://feeds.feedburner.com/ndtvnews-top-stories'),
  f('India Today', 'india', 'Politics', 'https://www.indiatoday.in/rss/home'),
  f('Zee News', 'india', 'Politics', 'https://zeenews.india.com/rss/india-national-news.xml'),

  // ---- India: business ----
  f('Mint', 'india', 'Business', 'https://www.livemint.com/rss/news'),
  f('Mint', 'india', 'Technology', 'https://www.livemint.com/rss/technology'),
  f('Economic Times', 'india', 'Business', 'https://economictimes.indiatimes.com/rssfeedstopstories.cms'),

  // ---- India: opinion / right of centre ----
  f('OpIndia', 'india', 'Politics', 'https://www.opindia.com/feed/'),
  f('Organiser', 'india', 'Politics', 'https://organiser.org/feed/'),
  f('Swarajya', 'india', 'Politics', 'https://swarajyamag.com/feed'),

  // ---- World: public broadcasters ----
  f('BBC News', 'world', 'Politics', `${B}/news/world/rss.xml`),
  f('BBC News', 'world', 'Business', `${B}/news/business/rss.xml`),
  f('BBC News', 'world', 'Technology', `${B}/news/technology/rss.xml`),
  f('BBC News', 'world', 'Science', `${B}/news/science_and_environment/rss.xml`),
  f('BBC News', 'world', 'Health', `${B}/news/health/rss.xml`),
  f('BBC News', 'world', 'Entertainment', `${B}/news/entertainment_and_arts/rss.xml`),
  f('BBC News', 'world', 'Sports', `${B}/sport/rss.xml`),
  f('DW', 'world', 'Politics', 'https://rss.dw.com/rdf/rss-en-world'),
  f('France 24', 'world', 'Politics', 'https://www.france24.com/en/rss'),
  f('Euronews', 'world', 'Politics', 'https://www.euronews.com/rss?level=theme&name=news'),
  f('NPR', 'world', 'Politics', 'https://feeds.npr.org/1004/rss.xml'),
  f('ABC Australia', 'world', 'Politics', 'https://www.abc.net.au/news/feed/51120/rss.xml'),
  f('Sky News', 'world', 'Politics', 'https://feeds.skynews.com/feeds/rss/world.xml'),

  // ---- World: centre / liberal ----
  f('The Guardian', 'world', 'Politics', `${G}/world/rss`),
  f('The Guardian', 'world', 'Business', `${G}/business/rss`),
  f('The Guardian', 'world', 'Technology', `${G}/technology/rss`),
  f('The Guardian', 'world', 'Science', `${G}/science/rss`),
  f('The Guardian', 'world', 'Health', `${G}/society/health/rss`),
  f('The Guardian', 'world', 'Sports', `${G}/sport/rss`),
  f('The Guardian', 'world', 'Entertainment', `${G}/culture/rss`),
  f('CNN', 'world', 'Politics', 'http://rss.cnn.com/rss/edition_world.rss'),
  f('New York Times', 'world', 'Politics', 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml'),
  f('LA Times', 'world', 'Politics', 'https://www.latimes.com/world-nation/rss2.0.xml'),
  f('Straits Times', 'world', 'Politics', 'https://www.straitstimes.com/news/world/rss.xml'),
  f('Al Jazeera', 'world', 'Politics', 'https://www.aljazeera.com/xml/rss/all.xml'),

  // ---- World: business / markets ----
  f('Wall Street Journal', 'world', 'Business', 'https://feeds.a.dj.com/rss/RSSWorldNews.xml'),
  f('Bloomberg', 'world', 'Business', 'https://feeds.bloomberg.com/markets/news.rss'),
  f('CNBC', 'world', 'Business', 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362'),
  f('The Economist', 'world', 'Business', 'https://www.economist.com/the-world-this-week/rss.xml'),

  // ---- World: right of centre ----
  f('Fox News', 'world', 'Politics', 'https://moxie.foxnews.com/google-publisher/world.xml'),
  f('Fox News', 'world', 'Politics', 'https://moxie.foxnews.com/google-publisher/politics.xml'),
  f('Politico', 'world', 'Politics', 'https://rss.politico.com/politics-news.xml'),
  f('The Hill', 'world', 'Politics', 'https://thehill.com/feed/'),

  // ---- World: Asia / Middle East ----
  f('Japan Times', 'world', 'Politics', 'https://www.japantimes.co.jp/feed/'),
  f('SCMP', 'world', 'Politics', 'https://www.scmp.com/rss/91/feed'),
  f('Times of Israel', 'world', 'Politics', 'https://www.timesofisrael.com/feed/'),

  // ---- Science ----
  f('New Scientist', 'world', 'Science', 'https://www.newscientist.com/feed/home/'),
  f('Nature', 'world', 'Science', 'https://www.nature.com/nature.rss'),
];

// Reuters, AP and PTI no longer publish public RSS feeds. To include them,
// add a licensed API/adapter in fetcher.js (see README).
export const CATEGORIES = ['Politics', 'Business', 'Technology', 'Science', 'Sports', 'Health', 'Entertainment'];
export const SOURCE_COUNT = new Set(FEEDS.map((x) => x.source)).size;
