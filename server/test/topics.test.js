import test from 'node:test';
import assert from 'node:assert/strict';
import { biasRating, biasPercentage, keyTopics, normalizeAnalysis } from '../src/analyze.js';
import { trendingTopics, topicTag } from '../src/topics.js';
import { placeholderImage, PLACEHOLDER_IMAGES } from '../src/images.js';
import { framingOf } from '../src/framing.js';

const TEXT = `The Election Commission said the Maharashtra assembly election will be held in November.
Officials confirmed the schedule after a review meeting in Mumbai.
Opposition leaders called the announcement a brazen delay and a shameful abuse of power.`;

test('the dominant share maps onto the five bias ratings', () => {
  assert.equal(biasRating({ left: 60, leanLeft: 20, center: 10, leanRight: 6, right: 4 }), 'Left');
  assert.equal(biasRating({ left: 10, leanLeft: 40, center: 25, leanRight: 15, right: 10 }), 'Lean Left');
  assert.equal(biasRating({ left: 10, leanLeft: 15, center: 45, leanRight: 20, right: 10 }), 'Center');
  assert.equal(biasRating({ left: 5, leanLeft: 10, center: 20, leanRight: 40, right: 25 }), 'Lean Right');
  assert.equal(biasRating({ left: 6, leanLeft: 9, center: 15, leanRight: 25, right: 45 }), 'Right');
  assert.equal(biasPercentage({ left: 6, leanLeft: 9, center: 15, leanRight: 25, right: 45 }), 45);
});

test('an analysis always carries rating, percentage and key topics', () => {
  const out = normalizeAnalysis(null, { text: TEXT, source: 'Hindustan Times', method: 'heuristic' });
  assert.ok(['Left', 'Lean Left', 'Center', 'Lean Right', 'Right'].includes(out.biasRating));
  assert.ok(out.biasPercentage > 0 && out.biasPercentage <= 100);
  assert.ok(Array.isArray(out.keyTopics) && out.keyTopics.length > 0);
  assert.ok(out.keyTopics.some((topic) => /election|commission|mumbai/i.test(topic)));
});

test('key topics keep proper-noun casing and skip filler', () => {
  const topics = keyTopics(TEXT, { title: 'Election Commission sets Maharashtra poll date' });
  assert.ok(topics.some((topic) => topic === topic.toUpperCase() || /^[A-Z]/.test(topic)));
  assert.ok(!topics.includes('said'));
  assert.ok(!topics.includes('after'));
  assert.ok(topics.length <= 8);
});

const article = (overrides = {}) => ({
  id: overrides.id || 'a1',
  title: overrides.title || 'Election Commission sets November date for Maharashtra poll',
  summary: overrides.summary || 'The commission confirmed the schedule after a review meeting.',
  latestAt: new Date().toISOString(),
  alsoReportedBy: overrides.alsoReportedBy || [],
});

test('trending topics weight stories carried by several outlets', () => {
  const now = new Date().toISOString();
  const topics = trendingTopics([
    { ...article({ id: 'a1' }), publishedAt: now, alsoReportedBy: [{ source: 'NDTV' }, { source: 'The Hindu' }] },
    { ...article({ id: 'a2', title: 'Maharashtra poll date announced by Election Commission' }), publishedAt: now, alsoReportedBy: [{ source: 'CNN' }] },
    { ...article({ id: 'a3', title: 'Sensex rallies as RBI holds repo rate' }), publishedAt: now, alsoReportedBy: [] },
  ], 8);

  assert.ok(topics.length >= 1);
  assert.ok(topics.every((topic) => topic.tag.startsWith('#')));
  assert.ok(topics.every((topic) => topic.query && topic.label));
  assert.ok(topics[0].score >= topics[1]?.score || topics.length === 1);
});

test('the ticker tag is a compact hashtag', () => {
  assert.equal(topicTag('Election Commission'), '#ElectionCommission');
  assert.equal(topicTag('RBI'), '#RBI');
  assert.equal(topicTag('  '), '');
});

test('every news category has a stable https placeholder image', () => {
  for (const category of ['Politics', 'Business', 'Technology', 'Science', 'Health', 'Sports', 'Entertainment']) {
    const url = placeholderImage(category);
    assert.ok(url.startsWith('https://images.unsplash.com/'));
    assert.equal(url, PLACEHOLDER_IMAGES[category]);
  }
  assert.equal(placeholderImage('Not A Category'), PLACEHOLDER_IMAGES.default);
});

test('framing carries a bottom line, three facts and a perspective per side', () => {
  const story = {
    id: 's1',
    title: 'Election Commission sets November date for Maharashtra poll',
    summary: 'The commission confirmed the schedule after a review meeting in Mumbai.',
    detail: TEXT,
    source: 'The Hindu',
    lean: 'center-left',
    publishedAt: new Date().toISOString(),
    alsoReportedBy: [
      { source: 'NDTV', title: 'Maharashtra election date announced, opposition cries foul', lean: 'center-left', publishedAt: new Date().toISOString() },
      { source: 'OpIndia', title: 'Election Commission fixes Maharashtra poll schedule after opposition delay claims', lean: 'right', publishedAt: new Date().toISOString() },
    ],
  };

  const out = framingOf(story);
  assert.ok(out.bottomLine.length > 10);
  assert.ok(out.facts.length >= 1 && out.facts.length <= 3);
  for (const key of ['left', 'center', 'right']) {
    assert.ok(out.perspectives[key].sentence.length > 20);
    assert.equal(out.perspectives[key].leanGroup, key);
  }
  assert.equal(out.perspectives.left.available, true);
  assert.equal(out.perspectives.right.available, true);
  assert.equal(out.perspectives.center.available, false);
});
