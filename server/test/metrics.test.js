import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceBreakdownOf } from '../src/bias.js';
import { heuristicSimpleSummary, biasRationale, normalizeAnalysis } from '../src/analyze.js';

const TEXT = `The Election Commission said the Maharashtra assembly election will be held in November.
Officials confirmed the schedule after a review meeting in Mumbai.
Opposition leaders called the announcement a brazen delay and a shameful abuse of power.`;

const rows = [
  { source: 'The Guardian', lean: 'left' },
  { source: 'NDTV', lean: 'center-left' },
  { source: 'The Guardian', lean: 'left' }, // the same outlet twice is one outlet
  { source: 'BBC News', lean: 'center' },
  { source: 'Times of India', lean: 'center-right' },
  { source: 'OpIndia', lean: 'right' },
  { source: 'The Hindu', lean: 'center-left' },
];

test('source coverage groups unique outlets into left, center and right', () => {
  const out = sourceBreakdownOf(rows);
  assert.equal(out.totalSources, 6);
  assert.equal(out.leftCount, 3); // The Guardian, NDTV, The Hindu
  assert.equal(out.centerCount, 1); // BBC News
  assert.equal(out.rightCount, 2); // Times of India, OpIndia
  assert.equal(out.leftCount + out.centerCount + out.rightCount, out.totalSources);
});

test('an empty cluster reports zero sources of every kind', () => {
  assert.deepEqual(sourceBreakdownOf([]), {
    leftCount: 0, centerCount: 0, rightCount: 0, untrackedCount: 0, totalSources: 0,
  });
});

test('an unrated outlet is untracked, not centred', () => {
  const out = sourceBreakdownOf([{ source: 'Some Local Blog', lean: 'unrated' }]);
  assert.equal(out.totalSources, 1);
  assert.equal(out.centerCount, 0);
  assert.equal(out.untrackedCount, 1);
});

test('the plain-language summary is short and never the analyser sentinel', () => {
  const out = heuristicSimpleSummary(TEXT, { category: 'Politics' });
  assert.ok(out.length > 60);
  assert.ok(out.split('. ').length <= 3, 'at most three sentences');
  assert.ok(!/excerpt is too short/i.test(out));
  assert.ok(/power|rules|follow/i.test(out), 'explains why it matters');
});

test('a too-short excerpt still explains why the story matters', () => {
  const out = heuristicSimpleSummary('One line only.', {
    category: 'Business',
    facts: ['The excerpt is too short to establish a fact all sides accept.'],
  });
  assert.ok(out.length > 40);
  assert.ok(!/excerpt is too short/i.test(out));
  assert.ok(/prices|jobs|money/i.test(out));
});

test('the rationale names the rating, the share and the wording behind it', () => {
  const out = biasRationale(TEXT, { left: 10, leanLeft: 50, center: 20, leanRight: 12, right: 8 }, 'The Hindu');
  assert.ok(out.includes('lean left'));
  assert.ok(out.includes('50%'));
  assert.ok(/evaluative|brazen|shameful|outlet/i.test(out));
});

test('an analysis carries both metrics payloads', () => {
  const out = normalizeAnalysis(null, {
    text: TEXT, source: 'The Hindu', category: 'Politics', method: 'heuristic',
  });
  assert.ok(out.simpleSummary.length > 60);
  assert.ok(out.biasRationale.includes('%'));
  assert.ok(out.biasRating);
  assert.equal(Object.values(out.bias).reduce((a, b) => a + b, 0), 100);
});
