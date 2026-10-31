import test from 'node:test';
import assert from 'node:assert/strict';
import { framingOf } from '../src/framing.js';
import { stakeholderOf } from '../src/stakeholders.js';

const story = {
  id: 'story-1',
  title: 'Bank of Baroda posts 20% rise in quarterly profit',
  source: 'The Hindu',
  lean: 'center-left',
  url: 'https://example.test/1',
  publishedAt: new Date().toISOString(),
  alsoReportedBy: [
    {
      source: 'Mint', lean: 'center', url: 'https://example.test/2',
      title: 'Bank of Baroda quarterly profit rises 20%', publishedAt: new Date().toISOString(),
    },
    {
      source: 'Economic Times', lean: 'center-right', url: 'https://example.test/3',
      title: 'Bank of Baroda profit up 20% on strong lending', publishedAt: new Date().toISOString(),
    },
    {
      source: 'The Hindu', lean: 'center-left', url: 'https://example.test/1',
      title: 'Duplicate wire copy of the same headline', publishedAt: new Date().toISOString(),
    },
  ],
};

test('framing groups headlines by the lean of each outlet', () => {
  const framing = framingOf(story);
  assert.equal(framing.groups.left.length, 1);
  assert.equal(framing.groups.center.length, 1);
  assert.equal(framing.groups.right.length, 1);
  assert.deepEqual(framing.missing, []);
});

test('the same outlet is only counted once', () => {
  const framing = framingOf(story);
  assert.equal(framing.totalOutlets, 3);
  assert.equal(framing.spectrum['center-left'], 1);
  assert.equal(framing.groups.left[0].source, 'The Hindu');
});

test('shared headline terms become the consensus', () => {
  const framing = framingOf(story);
  assert.ok(framing.consensus.terms.includes('baroda'));
  assert.equal(framing.consensus.agreementPct, 100);
});

test('coverage missing from one side is reported as missing', () => {
  const framing = framingOf({
    id: 'story-2',
    title: 'Opposition protests after arrest of activist',
    source: 'The Guardian',
    lean: 'left',
    alsoReportedBy: [
      { source: 'NDTV', lean: 'center-left', title: 'Activist arrested, protests follow' },
      { source: 'CNN', lean: 'center-left', title: 'Arrest of activist sparks protests' },
      { source: 'The Hindu', lean: 'center-left', title: 'Protests after activist arrest' },
      { source: 'Mint', lean: 'center', title: 'Protests break out after activist arrest' },
    ],
  });
  assert.ok(framing.missing.includes('right'));
  assert.equal(framing.groups.right.length, 0);
  assert.equal(framing.spectrum.right, 0);
});

test('stakeholder records carry parent, funders and funding type', () => {
  const ndtv = stakeholderOf('NDTV');
  assert.equal(ndtv.known, true);
  assert.match(ndtv.parentCompany, /Adani/);
  assert.equal(ndtv.fundingType, 'Private');
  assert.ok(ndtv.majorFunders.some((funder) => /Adani/.test(funder)));
  assert.deepEqual(ndtv.ownershipChain, ['Gautam Adani family', 'AMG Media Networks (Adani Group)', 'NDTV']);

  const bbc = stakeholderOf('BBC News');
  assert.equal(bbc.fundingType, 'State-backed');
  assert.ok(bbc.majorFunders.some((funder) => /licence fee/i.test(funder)));

  const guardian = stakeholderOf('The Guardian');
  assert.match(guardian.parentCompany, /Scott Trust/);
});

test('an unknown publication gets a safe unrated record', () => {
  const unknown = stakeholderOf('Some Local Blog');
  assert.equal(unknown.known, false);
  assert.equal(unknown.lean, 'unrated');
  assert.deepEqual(unknown.majorFunders, []);
  assert.ok(unknown.note);
});
