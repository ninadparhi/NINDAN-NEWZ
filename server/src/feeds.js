// Feed URLs change occasionally; a dead feed is skipped, not fatal. Edit freely.
const f = (source, region, category, url) => ({ source, region, category, url });
const B = 'http://feeds.bbci.co.uk';
const G = 'https://www.theguardian.com';

export const FEEDS = [
  // ---- India ----
  f('The Hindu', 'india', 'Politics', 'https://www.thehindu.com/news/national/feeder/default.rss'),
  f('The Hindu', 'india', 'Business', 'https://www.thehindu.com/business/feeder/default.rss'),
  f('The Hindu', 'india', 'Science', 'https://www.thehindu.com/sci-tech/science/feeder/default.rss'),
  f('The Hindu', 'india', 'Sports', 'https://www.thehindu.com/sport/feeder/default.rss'),
  f('Indian Express', 'india', 'Politics', 'https://indianexpress.com/section/india/feed/'),
  f('Indian Express', 'india', 'Business', 'https://indianexpress.com/section/business/feed/'),
  f('Indian Express', 'india', 'Technology', 'https://indianexpress.com/section/technology/feed/'),
  f('Indian Express', 'india', 'Sports', 'https://indianexpress.com/section/sports/feed/'),
  f('Indian Express', 'india', 'Entertainment', 'https://indianexpress.com/section/entertainment/feed/'),
  f('NDTV', 'india', 'Politics', 'https://feeds.feedburner.com/ndtvnews-top-stories'),
  f('Times of India', 'india', 'Politics', 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms'),
  f('Times of India', 'india', 'Business', 'https://timesofindia.indiatimes.com/rssfeeds/1898055.cms'),
  f('Times of India', 'india', 'Sports', 'https://timesofindia.indiatimes.com/rssfeeds/4719148.cms'),
  f('Times of India', 'india', 'Technology', 'https://timesofindia.indiatimes.com/rssfeeds/66949542.cms'),
  f('Times of India', 'india', 'Entertainment', 'https://timesofindia.indiatimes.com/rssfeeds/1081479906.cms'),
  f('Hindustan Times', 'india', 'Politics', 'https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml'),
  f('Hindustan Times', 'india', 'Business', 'https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml'),
  f('Hindustan Times', 'india', 'Sports', 'https://www.hindustantimes.com/feeds/rss/sports/rssfeed.xml'),
  f('Hindustan Times', 'india', 'Entertainment', 'https://www.hindustantimes.com/feeds/rss/entertainment/rssfeed.xml'),
  f('Mint', 'india', 'Business', 'https://www.livemint.com/rss/news'),
  f('Mint', 'india', 'Technology', 'https://www.livemint.com/rss/technology'),
  // ---- World ----
  f('BBC News', 'world', 'Politics', `${B}/news/world/rss.xml`),
  f('BBC News', 'world', 'Business', `${B}/news/business/rss.xml`),
  f('BBC News', 'world', 'Technology', `${B}/news/technology/rss.xml`),
  f('BBC News', 'world', 'Science', `${B}/news/science_and_environment/rss.xml`),
  f('BBC News', 'world', 'Health', `${B}/news/health/rss.xml`),
  f('BBC News', 'world', 'Entertainment', `${B}/news/entertainment_and_arts/rss.xml`),
  f('BBC News', 'world', 'Sports', `${B}/sport/rss.xml`),
  f('Al Jazeera', 'world', 'Politics', 'https://www.aljazeera.com/xml/rss/all.xml'),
  f('The Guardian', 'world', 'Politics', `${G}/world/rss`),
  f('The Guardian', 'world', 'Business', `${G}/business/rss`),
  f('The Guardian', 'world', 'Technology', `${G}/technology/rss`),
  f('The Guardian', 'world', 'Science', `${G}/science/rss`),
  f('The Guardian', 'world', 'Health', `${G}/society/health/rss`),
  f('The Guardian', 'world', 'Sports', `${G}/sport/rss`),
  f('The Guardian', 'world', 'Entertainment', `${G}/culture/rss`),
];
// Reuters, AP and PTI no longer publish public RSS feeds. To include them,
// add a licensed API/adapter in fetcher.js (see README).
export const CATEGORIES = ['Politics', 'Business', 'Technology', 'Science', 'Sports', 'Health', 'Entertainment'];
