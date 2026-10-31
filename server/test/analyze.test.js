import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toPercentages, heuristicBias, detectSpin, sentenceSpans, locate,
  normalizeAnalysis, normalizeSpin, readableText, heuristicSynthesis,
} from '../src/analyze.js';

const TEXT = `The government dismissed the report as a routine administrative matter.

Opposition leaders called it a brazen cover-up and a shameful abuse of power, according to party statements.

The court will hear the petition on Monday. Officials said the hearing would be public.`;

const sum = (bias) => Object.values(bias).reduce((a, b) => a + b, 0);

test('bias percentages are integers that sum to exactly 100', () => {
  for (const weights of [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [40, 12, 7, 3, 1]]) {
    const out = toPercentages(weights);
    assert.equal(sum(out), 100);
    assert.ok(Object.values(out).every((v) => Number.isInteger(v) && v >= 0));
  }
});

test('the heuristic bias prior follows the outlet lean', () => {
  const left = heuristicBias('A routine statement about the budget.', 'The Guardian');
  const right = heuristicBias('A routine statement about the budget.', 'Fox News');
  assert.ok(left.left > left.right, 'left outlet should skew left of centre');
  assert.ok(right.right > right.left, 'right outlet should skew right of centre');
  assert.equal(sum(left), 100);
  assert.equal(sum(right), 100);
});

test('sentence spans point at the exact text they quote', () => {
  const spans = sentenceSpans(TEXT);
  assert.ok(spans.length >= 4);
  for (const span of spans) {
    assert.equal(TEXT.slice(span.startIndex, span.endIndex), span.sentenceText);
  }
});

test('detectSpin flags loaded and emotional phrasing with valid offsets', () => {
  const spin = detectSpin(TEXT);
  assert.ok(spin.length >= 1);
  for (const item of spin) {
    assert.equal(TEXT.slice(item.startIndex, item.endIndex), item.sentenceText);
    assert.ok(item.valenceScore >= -1 && item.valenceScore <= 1);
    assert.ok(item.explanationTag);
    assert.ok(item.explanation.length > 20);
  }
  const emotional = spin.find((s) => s.sentenceText.includes('shameful'));
  assert.ok(emotional);
  assert.equal(emotional.explanationTag, 'Emotional Appeal');
});

test('directional cues move the valence score', () => {
  const right = detectSpin('The party\'s vote bank politics and appeasement have hollowed out the system, critics said.');
  assert.equal(right[0].valenceScore, 1);
  const left = detectSpin('The communal and divisive campaign was a majoritarian exercise, the report said.');
  assert.equal(left[0].valenceScore, -1);
});

test('quotes are located despite whitespace and case differences', () => {
  const hit = locate(TEXT, 'opposition   leaders called it a brazen cover-up');
  assert.ok(hit);
  assert.equal(TEXT.slice(hit.start, hit.end).toLowerCase(), 'opposition leaders called it a brazen cover-up');
});

test('a hallucinated quote is dropped and real quotes get offsets', () => {
  const raw = {
    bias: { left: 10, leanLeft: 20, center: 30, leanRight: 25, right: 15 },
    spin: [
      {
        quote: 'brazen cover-up and a shameful abuse of power',
        explanationTag: 'Loaded Language',
        explanation: 'Loads judgement before any evidence is presented.',
        valenceScore: -0.4,
      },
      {
        quote: 'a sentence the model invented that is not in the article',
        explanationTag: 'Framing',
        explanation: 'Hallucinated.',
        valenceScore: 0,
      },
    ],
    synthesis: { undisputedFacts: ['The report was dismissed.', 'The court will hear a petition.'], partisanSpin: ['Loads judgement.'] },
  };

  const out = normalizeAnalysis(raw, { text: TEXT, source: 'The Hindu', method: 'llm' });
  assert.equal(out.spin.length, 1);
  assert.equal(out.spin[0].explanationTag, 'Loaded Language');
  assert.equal(TEXT.slice(out.spin[0].startIndex, out.spin[0].endIndex), 'brazen cover-up and a shameful abuse of power');
  assert.equal(sum(out.bias), 100);
  assert.equal(out.bias.center, 30);
  assert.equal(out.synthesis.undisputedFacts.length, 3);
  assert.equal(out.synthesis.undisputedFacts[0], 'The report was dismissed.');
  assert.equal(out.method, 'llm');
});

test('normalizeSpin keeps highlights in order and never overlaps them', () => {
  const items = [
    { quote: 'Monday. Officials said the hearing would be public', explanationTag: 'Framing', valenceScore: 0 },
    { quote: 'a brazen cover-up and a shameful abuse of power', explanationTag: 'Loaded Language', valenceScore: 0.2 },
  ];
  const out = normalizeSpin(items, TEXT);
  assert.equal(out.length, 2);
  assert.ok(out[0].startIndex < out[1].startIndex);
  assert.ok(out[0].endIndex <= out[1].startIndex);
});

test('an offline analysis still returns three synthesis bullets and a full spectrum', () => {
  const out = normalizeAnalysis(null, { text: TEXT, source: 'NDTV', method: 'heuristic', degraded: true });
  assert.equal(out.synthesis.undisputedFacts.length, 3);
  assert.equal(sum(out.bias), 100);
  assert.equal(out.method, 'heuristic');
  assert.equal(out.degraded, true);
  assert.ok(out.spin.length >= 1);
});

test('a short excerpt still gets three bullets', () => {
  const synthesis = heuristicSynthesis('Only one short line.');
  assert.equal(synthesis.undisputedFacts.length, 3);
  assert.ok(synthesis.partisanSpin.length >= 1);
});

test('readableText keeps article paragraphs and drops chrome', () => {
  const html = `<html><head>
      <meta property="og:description" content="A short summary" />
      <script>trackSomeone()</script>
    </head><body>
      <nav>Home World Sport</nav>
      <p>${'This is a real paragraph of reporting with enough words to survive. '.repeat(3)}</p>
      <p>Subscribe to our newsletter</p>
      <p>${'A second paragraph continues the report with named sources. '.repeat(3)}</p>
    </body></html>`;
  const { text, description } = readableText(html);
  assert.equal(description, 'A short summary');
  assert.ok(text.includes('This is a real paragraph'));
  assert.ok(text.includes('A second paragraph'));
  assert.ok(!text.includes('trackSomeone'));
  assert.ok(!text.includes('Home World Sport'));
  assert.ok(!text.includes('Subscribe to our newsletter'));
});
