import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveSource, sourceBreakdownOf, sourceCountsOf, sourceDirectory,
} from '../src/bias.js';
import { domainOf, sourceForHost, SOURCE_PROFILES } from '../src/sources.js';

test('a URL identifies the publishing outlet even behind an aggregator', () => {
  const out = resolveSource({ source: 'NewsAPI', url: 'https://www.thehindu.com/news/national/story.ece' });
  assert.equal(out.source, 'The Hindu');
  assert.equal(out.lean, 'center-left');
  assert.equal(out.tracked, true);
  assert.equal(out.domain, 'thehindu.com');
  assert.match(out.logoUrl, /^https:\/\/www\.google\.com\/s2\/favicons/);
});

test('subdomains and edition hosts resolve to the same outlet', () => {
  assert.equal(sourceForHost('edition.cnn.com'), 'CNN');
  assert.equal(sourceForHost('www.bbc.co.uk'), 'BBC News');
  assert.equal(domainOf('https://www.theguardian.com/world/2026/oct/31/story'), 'theguardian.com');
});

test('unrated outlets land in untracked, never in centre', () => {
  const out = sourceBreakdownOf([
    { source: 'Unknown Blog', lean: 'unrated', url: 'https://example.invalid/a' },
    { source: 'BBC News', lean: 'center', url: 'https://bbc.com/x' },
  ]);
  assert.deepEqual(out, {
    leftCount: 0, centerCount: 1, rightCount: 0, untrackedCount: 1, totalSources: 2,
  });
});

test('the seven-bucket counts separate lean-left and lean-right', () => {
  const out = sourceCountsOf([
    { source: 'The Guardian', lean: 'left', url: 'https://theguardian.com/a' },
    { source: 'NDTV', lean: 'center-left', url: 'https://ndtv.com/a' },
    { source: 'BBC News', lean: 'center', url: 'https://bbc.com/a' },
    { source: 'Times of India', lean: 'center-right', url: 'https://timesofindia.indiatimes.com/a' },
    { source: 'OpIndia', lean: 'right', url: 'https://opindia.com/a' },
    { source: 'Unknown Blog', lean: 'unrated', url: 'https://example.invalid/a' },
  ]);
  assert.deepEqual(out, {
    total: 6, left: 1, leanLeft: 1, center: 1, leanRight: 1, right: 1, untracked: 1,
  });
});

test('the source directory carries the logo, country and ownership record', () => {
  const dir = sourceDirectory();
  assert.equal(dir['The Hindu'].country, 'IN');
  assert.equal(dir['The Hindu'].domain, 'thehindu.com');
  assert.equal(dir['The Hindu'].ownership.type, 'corporate');
  assert.match(dir['The Hindu'].logoUrl, /^https:\/\/www\.google\.com\/s2\/favicons/);
  assert.equal(dir['BBC News'].country, 'GB');
  assert.ok(SOURCE_PROFILES['The Guardian']);
});
