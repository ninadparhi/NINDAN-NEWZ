import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalUrl, blocksFromHtml, detectPaywall, detectBlocked, normalizeArticle,
} from '../src/extract.js';

test('canonicalUrl strips tracking parameters and the fragment', () => {
  const url = canonicalUrl('https://www.thehindu.com/news/x/article123.ece?utm_source=rss&at_medium=RSS&publisher=newsstand#top');
  assert.equal(url, 'https://www.thehindu.com/news/x/article123.ece');
});

test('canonicalUrl keeps parameters that are part of the article', () => {
  const url = canonicalUrl('https://example.com/read?id=42&utm_campaign=feed');
  assert.equal(url, 'https://example.com/read?id=42');
});

test('canonicalUrl returns null for junk', () => {
  assert.equal(canonicalUrl('not a url'), null);
  assert.equal(canonicalUrl(''), null);
});

const HTML = `
  <div class="article">
    <figure><img src="a.jpg"><figcaption>Photo Credit: Getty Images</figcaption></figure>
    <p>The state cabinet approved the <strong>&#8377;4,200 crore</strong> package on Thursday.</p>
    <p>Advertisement</p>
    <h2>What happens next</h2>
    <p>The proposal now goes to the finance committee, which meets on 12 November.</p>
    <blockquote>“This is the largest outlay for the district in a decade.”</blockquote>
    <ul><li>Funds are released in two instalments.</li></ul>
    <script>window.ads = [];</script>
  </div>`;

test('blocksFromHtml keeps paragraphs, headings, quotes and list items', () => {
  const blocks = blocksFromHtml(HTML);
  const types = blocks.map((b) => b.type);
  assert.deepEqual(types, ['paragraph', 'heading', 'paragraph', 'quote', 'list']);
  assert.match(blocks[0].text, /₹4,200 crore/, 'numeric entities are decoded');
  assert.equal(blocks[1].text, 'What happens next');
});

test('blocksFromHtml drops figures, captions, ads and scripts', () => {
  const text = blocksFromHtml(HTML).map((b) => b.text).join(' ');
  assert.ok(!/getty images/i.test(text), 'caption is not body copy');
  assert.ok(!/advertisement/i.test(text), 'ad label is not body copy');
  assert.ok(!/window\.ads/.test(text), 'scripts never reach the client');
  assert.ok(!/<[a-z/]/i.test(text), 'no markup leaks into the block text');
});

test('blocksFromHtml collapses a pull-quote repeated as a paragraph', () => {
  const html = '<p>One long sentence about the ruling that runs a while.</p>'
    + '<p>One long sentence about the ruling that runs a while.</p>';
  assert.equal(blocksFromHtml(html).length, 1);
});

test('blocksFromHtml handles a page with no block markup at all', () => {
  const blocks = blocksFromHtml('First paragraph of the story.\n\nSecond paragraph of the story.');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[1].text, 'Second paragraph of the story.');
});

test('paywall and block wording are recognised', () => {
  assert.equal(detectPaywall('Subscribe now to continue reading this story.'), true);
  assert.equal(detectPaywall('This article is for subscribers only.'), true);
  assert.equal(detectPaywall('Eight people were killed in a series of shootings.'), false);
  assert.equal(detectBlocked('Please enable JavaScript and cookies to continue'), true);
});

const longBody = `<p>${'Officials confirmed the schedule after a review meeting in Mumbai. '.repeat(20)}</p>`;

test('a long readable page is returned as an article', () => {
  const out = normalizeArticle({
    title: 'Opposition trying to destabilise government, says Tagore',
    author: 'By The Hindu Bureau',
    published: '2026-11-05T19:17:06.000Z',
    image: 'https://example.com/lead.jpg',
    content: longBody,
    source: 'The Hindu',
  }, 'https://www.thehindu.com/news/x.ece');

  assert.equal(out.status, 'ok');
  assert.equal(out.author, 'The Hindu Bureau', 'a leading "By" is removed');
  assert.equal(out.leadImage, 'https://example.com/lead.jpg');
  assert.ok(out.wordCount > 100);
  assert.equal(out.blocks.length, 1);
  assert.deepEqual(out.fullContent, [out.blocks[0].text]);
});

test('a short body with a paywall hint is reported as paywalled, not broken', () => {
  const out = normalizeArticle({
    title: 'The interview',
    content: '<p>Subscribe now to continue reading.</p>',
  }, 'https://example.com/paywalled');
  assert.equal(out.status, 'paywalled');
  assert.equal(out.paywall, true);
  assert.match(out.reason, /subscription/i);
});

test('a paid story with a readable opening is marked partial', () => {
  const out = normalizeArticle({
    title: 'The interview',
    content: `${longBody}<p>Already a subscriber? Sign in to read the rest.</p>`,
  }, 'https://example.com/partial');
  assert.equal(out.status, 'partial');
  assert.ok(out.wordCount > 100, 'the free part is still worth reading');
});

test('an empty extraction fails softly with a reason', () => {
  const out = normalizeArticle(null, 'https://example.com/gone');
  assert.equal(out.status, 'unavailable');
  assert.equal(out.wordCount, 0);
  assert.match(out.reason, /could not|did not/i);
});
