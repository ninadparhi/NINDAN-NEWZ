import test from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../src/classify.js';

const run = (title, summary, feedRegion, feedCategory) =>
  classify({ title, summary, detail: summary, feedRegion, feedCategory });

test('a US rates story in an Indian business feed is filed as world', () => {
  const out = run('Fed holds rates as Trump pressures Powell over cuts',
    'The US Federal Reserve kept rates steady. Trump attacked the Fed chair again.',
    'india', 'Business');
  assert.equal(out.region, 'world');
  assert.equal(out.category, 'Business');
});

test('an Indian election story in a world feed is filed as India', () => {
  const out = run('BJP wins Haryana municipal polls',
    'The BJP swept municipal elections in Haryana, the state election commission said.',
    'world', 'Politics');
  assert.equal(out.region, 'india');
});

test('a Gaza strike story in an Indian feed is filed as world', () => {
  const out = run('Journalist killed in Gaza strike',
    'A reporter was killed in an Israeli strike in Gaza, the network said.',
    'india', 'Politics');
  assert.equal(out.region, 'world');
});

test('an Nvidia market story in an Indian business feed is filed as world tech', () => {
  const out = run('Nvidia shares surge on AI chip demand',
    'Nvidia shares jumped on Wall Street as demand for AI chips climbed.',
    'india', 'Business');
  assert.equal(out.region, 'world');
  assert.equal(out.category, 'Technology');
});

test('domestic business stories keep their feed category and region', () => {
  const out = run('Sensex rallies 800 points as RBI holds repo rate',
    'Indian equity benchmarks rose after the RBI kept the repo rate unchanged.',
    'india', 'Business');
  assert.equal(out.region, 'india');
  assert.equal(out.category, 'Business');
});

test('a cricket report stays in Sports', () => {
  const out = run('Vidarbha crush Goa in Ranji Trophy',
    'Vidarbha beat Goa by an innings in the Ranji Trophy cricket match in Nagpur.',
    'india', 'Sports');
  assert.equal(out.category, 'Sports');
  assert.equal(out.region, 'india');
});

test('a bilateral summit that mentions both sides keeps the feed region', () => {
  const out = run('Modi meets Macron in Paris',
    'Prime Minister Narendra Modi met French President Emmanuel Macron in Paris for talks.',
    'india', 'Politics');
  assert.equal(out.region, 'india');
});

test('one passing keyword does not flip a category', () => {
  const out = run('Infosys raises revenue guidance for the year',
    'Infosys said it expects revenue growth after a strong quarter, although the election calendar is crowded.',
    'india', 'Business');
  assert.equal(out.category, 'Business');
});

test('a film story in a general feed becomes Entertainment', () => {
  const out = run('Bollywood film breaks box office records',
    'The film collected a record opening weekend at the box office, the actor said.',
    'india', 'Politics');
  assert.equal(out.category, 'Entertainment');
});
