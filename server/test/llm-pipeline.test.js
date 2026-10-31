import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { analyzeArticle } from '../src/analyze.js';

const ARTICLE = `The Election Commission said the Maharashtra assembly election will be held in November.

Officials confirmed the schedule after a review meeting in Mumbai.

Opposition leaders called the announcement a brazen delay and a shameful abuse of power.`;

const MODEL_OUTPUT = {
  bias: { left: 10, leanLeft: 20, center: 30, leanRight: 25, right: 15 },
  biasRationale: 'The model found loaded wording doing the judging for the reader.',
  simpleSummary: 'A date was set for a big vote. It matters because it decides who runs the state.',
  keyTopics: ['Maharashtra', 'Election Commission'],
  spin: [{
    quote: 'brazen delay and a shameful abuse of power',
    explanationTag: 'Loaded Language',
    explanation: 'Judgement arrives before any evidence.',
    valenceScore: -0.4,
  }],
  synthesis: {
    undisputedFacts: ['A date was announced.', 'The court will hear a petition.', 'Officials confirmed it.'],
    partisanSpin: ['Loaded wording carries the claim.'],
  },
};

// The provider path is exercised against a local OpenAI-compatible endpoint, so
// the request shape, JSON parsing, validation and persistence fields are all
// tested without a paid key.
test('a live chat-completions response supplies simpleSummary, rationale and bias', async () => {
  let requestedUrl = '';
  let requestedBody = null;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      requestedUrl = req.url;
      try { requestedBody = JSON.parse(body); } catch { requestedBody = null; }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        model: 'mock-llama',
        choices: [{ message: { content: JSON.stringify(MODEL_OUTPUT) } }],
      }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  const saved = {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_BASE_URL: process.env.LLM_BASE_URL,
    LLM_MODEL: process.env.LLM_MODEL,
  };
  process.env.LLM_PROVIDER = 'openai';
  process.env.LLM_API_KEY = 'test-key';
  process.env.LLM_BASE_URL = `http://127.0.0.1:${port}/v1`;
  process.env.LLM_MODEL = 'mock-llama';

  try {
    const out = await analyzeArticle({
      text: ARTICLE,
      title: 'Maharashtra poll date',
      source: 'The Hindu',
      category: 'Politics',
      force: true,
    });

    assert.equal(requestedUrl, '/v1/chat/completions');
    assert.equal(requestedBody.model, 'mock-llama');
    assert.equal(out.method, 'llm');
    assert.equal(out.degraded, false);
    assert.equal(out.engine, 'OpenAI-compatible');
    assert.equal(out.backend.model, 'mock-llama');
    assert.equal(out.simpleSummary, MODEL_OUTPUT.simpleSummary);
    assert.equal(out.biasRationale, MODEL_OUTPUT.biasRationale);
    assert.equal(out.bias.leanLeft, 20);
    assert.equal(out.biasRating, 'Center');
    assert.deepEqual(out.keyTopics, MODEL_OUTPUT.keyTopics);
    assert.equal(out.spin.length, 1);
    assert.equal(ARTICLE.slice(out.spin[0].startIndex, out.spin[0].endIndex), out.spin[0].sentenceText);
    assert.equal(Object.values(out.bias).reduce((a, b) => a + b, 0), 100);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
