import test from 'node:test';
import assert from 'node:assert/strict';
import { assignClusters, pairScore, buildModel, entities, CLUSTER_CONFIG } from '../src/cluster.js';

const ago = (hours) => new Date(Date.now() - hours * 3600e3).toISOString();
let n = 0;
const article = (title, summary, source, hours = 1) => ({
  url: `https://example.test/${n++}/${encodeURIComponent(title.slice(0, 30))}`,
  title,
  summary,
  detail: summary,
  source,
  lean: 'center',
  publishedAt: ago(hours),
});

// Would these two reports be filed as one story?
const merges = (a, b, config = {}) => {
  const existing = { ...a, clusterId: 'story-1' };
  const assigned = assignClusters([b], [existing], config);
  return assigned.get(b.url) === 'story-1';
};

const SHETTY_A = {
  title: 'B.R. Shetty moves Bombay High Court seeking directions against Bank of Baroda in NMC Healthcare case',
  summary: 'B.R. Shetty moved the Bombay High Court seeking directions against Bank of Baroda in the NMC Healthcare case.',
};
const SHETTY_B = {
  title: 'B.R. Shetty seeks Bank of Baroda records, financial security in new applications',
  summary: 'Shetty filed new applications seeking records from Bank of Baroda and financial security.',
};

test('connectors are never mistaken for named entities', () => {
  const found = [...entities('India and China sign a border pact in Delhi. The United States and the UK welcomed it.')];
  assert.ok(!found.includes('and'));
  assert.ok(!found.some((e) => e.endsWith(' and')));
  assert.ok(found.includes('india and china'.replace(' and china', '')) || found.includes('india'));
});

test('the Shetty / Bank of Baroda pair is one story even across outlets', () => {
  const a = article(SHETTY_A.title, SHETTY_A.summary, 'Mint', 3);
  const b = article(SHETTY_B.title, SHETTY_B.summary, 'Hindustan Times', 1);
  const model = buildModel([a, b]);
  const { score } = pairScore(a, b, model);
  assert.ok(score >= CLUSTER_CONFIG.threshold, `score ${score.toFixed(3)} should clear ${CLUSTER_CONFIG.threshold}`);
  assert.equal(merges(a, b), true);
});

const NEGATIVES = [
  ['Bank of Baroda posts 20% rise in Q2 net profit',
    'Bank of Baroda reported a 20% rise in net profit for the second quarter.',
    'Bank of Baroda shares fall 3% as bad loans rise',
    'Bank of Baroda shares fell 3% after bad loans rose in the quarter.'],
  ['India beat Australia by 5 wickets in first ODI',
    'India beat Australia by five wickets in the first one-day international.',
    'Australia beat India by 3 wickets in second ODI',
    'Australia beat India by three wickets in the second one-day international.'],
  ['Sensex falls 500 points as IT stocks slide',
    'The Sensex fell 500 points on Tuesday as IT stocks slid.',
    'Sensex rises 700 points as banks rally',
    'The Sensex rose 700 points as banking stocks rallied.'],
  ['RBI keeps repo rate unchanged at 5.5%',
    'The RBI kept the repo rate unchanged at 5.5% on Wednesday.',
    'RBI fines HDFC Bank 2 crore for KYC lapses',
    'The RBI fined HDFC Bank 2 crore for lapses in KYC checks.'],
  ['Trump signs executive order on tariffs',
    'President Donald Trump signed an executive order on tariffs.',
    'Trump meets Xi Jinping in Beijing',
    'Donald Trump met Xi Jinping in Beijing for trade talks.'],
  ['Delhi chief minister announces new welfare scheme',
    'The Delhi chief minister announced a new welfare scheme.',
    'Delhi High Court orders probe into welfare scheme',
    'The Delhi High Court ordered a probe into the welfare scheme.'],
  ['Kerala floods kill 10 people',
    'At least 10 people died in floods in Kerala.',
    'Kerala win Ranji Trophy match against Goa',
    'Kerala beat Goa in a Ranji Trophy cricket match.'],
  ['Apple launches iPhone 18 with AI features',
    'Apple launched the iPhone 18 with AI features.',
    'Apple faces EU antitrust fine over App Store',
    'Apple was fined by the EU over App Store rules.'],
  ['Bombay High Court orders probe into Adani power deal',
    'The Bombay High Court ordered a probe into an Adani power deal.',
    'Bombay High Court grants bail to man in cheating case',
    'The Bombay High Court granted bail to a man in a cheating case.'],
  ['Rupee hits record low against dollar',
    'The rupee hit a record low against the dollar on Thursday.',
    'Rupee gains 11 paise to 95.17 against dollar',
    'The rupee gained 11 paise to 95.17 against the dollar.'],
];

NEGATIVES.forEach(([at, as, bt, bs], i) => {
  test(`negative pair ${i + 1} stays two stories: ${at.slice(0, 40)}…`, () => {
    const a = article(at, as, 'The Hindu', 2);
    const b = article(bt, bs, 'NDTV', 1);
    assert.equal(merges(a, b), false);
  });
});

test('two outlets reporting the same event still merge', () => {
  const a = article('Netanyahu bloc wins 53 seats in Israel election',
    'Benjamin Netanyahu and his bloc won 53 seats in the Israel election, partial results showed.', 'BBC News', 4);
  const b = article('Israel election results: Netanyahu bloc wins 53 seats',
    'Benjamin Netanyahu won 53 seats in the Israel election, results showed, with coalition talks ahead.', 'The Guardian', 2);
  assert.equal(merges(a, b), true);
});

test('reports more than 48 hours apart are never merged', () => {
  const a = article(SHETTY_A.title, SHETTY_A.summary, 'Mint', 60);
  const b = article(SHETTY_B.title, SHETTY_B.summary, 'Hindustan Times', 1);
  assert.equal(merges(a, b), false);
});

test('the same outlet never merges with itself into one story', () => {
  const a = article(SHETTY_A.title, SHETTY_A.summary, 'Mint', 2);
  const b = article(SHETTY_B.title, SHETTY_B.summary, 'Mint', 1);
  assert.equal(merges(a, b), false);
});

test('an existing story id survives later refreshes', () => {
  const first = article(SHETTY_A.title, SHETTY_A.summary, 'Mint', 6);
  const second = article(SHETTY_B.title, SHETTY_B.summary, 'Hindustan Times', 3);
  const opening = assignClusters([first], []);
  const id = opening.get(first.url);
  assert.ok(id);

  const third = article('B.R. Shetty appears before Bombay High Court again',
    'B.R. Shetty appeared before the Bombay High Court in the Bank of Baroda matter.', 'NDTV', 1);
  const filed = { ...first, clusterId: id };
  const joined = { ...second, clusterId: assignClusters([second], [filed]).get(second.url) };
  const later = assignClusters([third], [filed, joined]);
  assert.equal(joined.clusterId, id);
  assert.equal(later.get(third.url), id);
});
