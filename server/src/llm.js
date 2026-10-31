// LLM access for the analysis pipeline. Free first, no SDK on purpose: the rest
// of the server already uses global fetch, so a provider swap stays an env
// change instead of a dependency change.
//
// Supported backends (OpenAI-compatible /chat/completions unless noted):
//   openrouter    free-tier models (":free" suffix)   OPENROUTER_API_KEY
//   huggingface   HF Inference Providers router       HF_TOKEN / HUGGINGFACE_API_KEY
//   ollama        a local model, no key of any kind   OLLAMA_BASE_URL / OLLAMA_MODEL
//   openai        any OpenAI-compatible gateway       LLM_API_KEY / OPENAI_API_KEY
//   anthropic     Messages API                        ANTHROPIC_API_KEY
//
// Nothing here ever throws on a missing key, and there is no paid service the
// app depends on: analyze.js asks llmAvailable() and, when the answer is no,
// runs its own lexical analyser. A local Ollama server has to be probed rather
// than assumed, so the check is async and its result is cached for a minute.
//
// Free tiers rate-limit aggressively, so a 429 or 5xx is retried with
// exponential backoff (honouring Retry-After) before the caller falls back.
export class LLMError extends Error {
  constructor(message, code = 'llm', status = null) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.status = status;
  }
}

const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const OPENAI_STYLE = new Set(['openai', 'openrouter', 'huggingface', 'ollama']);

const PROVIDERS = {
  groq: {
    label: 'Groq (free tier)',
    base: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    keys: ['LLM_API_KEY', 'GROQ_API_KEY'],
  },
  openai: {
    label: 'OpenAI-compatible',
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keys: ['LLM_API_KEY', 'OPENAI_API_KEY'],
  },
  openrouter: {
    label: 'OpenRouter free tier',
    base: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    keys: ['LLM_API_KEY', 'OPENROUTER_API_KEY'],
  },
  huggingface: {
    label: 'Hugging Face Inference',
    base: 'https://router.huggingface.co/v1',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    keys: ['LLM_API_KEY', 'HF_TOKEN', 'HUGGINGFACE_API_KEY'],
    // The router rejects response_format on several free models.
    jsonMode: false,
  },
  ollama: {
    label: 'Local Ollama',
    base: 'http://127.0.0.1:11434/v1',
    model: 'llama3.1:8b',
    keys: [],
    keyless: true,
  },
  anthropic: {
    label: 'Anthropic',
    base: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-haiku-latest',
    keys: ['LLM_API_KEY', 'ANTHROPIC_API_KEY'],
  },
};

const firstEnv = (names) => {
  for (const name of names) if (process.env[name]) return process.env[name];
  return '';
};

// An explicit LLM_PROVIDER wins. Otherwise pick the first backend the
// environment actually supports, so a single free key is enough to turn the
// pipeline on without further configuration.
function detectProvider() {
  const explicit = String(process.env.LLM_PROVIDER || '').toLowerCase();
  if (PROVIDERS[explicit]) return explicit;
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.OPENROUTER_API_KEY) return 'openrouter';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  if (process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY) return 'huggingface';
  if (process.env.OLLAMA_BASE_URL || process.env.OLLAMA_MODEL) return 'ollama';
  return 'openai';
}

export function llmConfig() {
  const provider = detectProvider();
  const preset = PROVIDERS[provider];
  const key = firstEnv(preset.keys);
  const base = (process.env.LLM_BASE_URL
    || (provider === 'ollama' ? process.env.OLLAMA_BASE_URL : '')
    || preset.base).replace(/\/+$/, '');
  const model = process.env.LLM_MODEL
    || (provider === 'ollama' ? process.env.OLLAMA_MODEL : '')
    || preset.model;
  return {
    provider,
    label: preset.label,
    key,
    base,
    model,
    keyless: Boolean(preset.keyless),
    jsonMode: preset.jsonMode !== false,
    // Keyless providers still count as configured; availability is probed.
    configured: preset.keyless || Boolean(key),
  };
}

// Synchronous view for /api/meta. A local Ollama server may not be running, so
// this reports intent, not a guarantee.
export function llmStatus() {
  const cfg = llmConfig();
  return {
    provider: cfg.provider,
    label: cfg.label,
    model: cfg.model,
    configured: cfg.configured,
    keyless: cfg.keyless,
    localFallback: 'lexical analyser (always available)',
  };
}

let ollamaProbe = { at: 0, ok: false, model: null };

async function probeOllama(cfg) {
  if (Date.now() - ollamaProbe.at < 60000) return ollamaProbe.ok;
  const root = cfg.base.replace(/\/v1$/, '');
  let ok = false;
  try {
    const res = await fetch(`${root}/api/tags`, { signal: AbortSignal.timeout(1200) });
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      const models = (body?.models || []).map((m) => String(m?.name || ''));
      // An Ollama server without the configured model would fail every call.
      ok = models.length > 0 && (models.includes(cfg.model) || !models.length);
      ollamaProbe = { at: Date.now(), ok, model: models.find((m) => m === cfg.model) || models[0] || null };
      return ok;
    }
  } catch {
    // Not running: fall through to the lexical analyser.
  }
  ollamaProbe = { at: Date.now(), ok: false, model: null };
  return false;
}

export async function llmAvailable() {
  const cfg = llmConfig();
  if (!cfg.keyless) return Boolean(cfg.key);
  if (cfg.provider === 'ollama') return probeOllama(cfg);
  return Boolean(cfg.key);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

async function post(url, headers, body, timeoutMs) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { res, text: await res.text() };
  } catch (e) {
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new LLMError('LLM request timed out', 'timeout');
    }
    throw new LLMError(`LLM request failed: ${e.message}`, 'network');
  }
}

// Returns the model's raw text. Retries transient failures, then throws an
// LLMError whose `code` tells the caller what happened.
export async function callLLM({ system, user, maxTokens = 1200, timeoutMs = 25000, attempts = 3 }) {
  const cfg = llmConfig();
  if (!cfg.key && !cfg.keyless) throw new LLMError('No LLM backend configured', 'disabled');
  if (cfg.provider === 'ollama' && !(await probeOllama(cfg))) {
    throw new LLMError('No local Ollama server answered on ' + cfg.base, 'disabled');
  }

  const anthropic = cfg.provider === 'anthropic';
  const url = anthropic ? `${cfg.base}/messages` : `${cfg.base}/chat/completions`;
  const headers = anthropic
    ? { 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }
    : { authorization: `Bearer ${cfg.key || 'local'}` };
  const body = anthropic
    ? { model: cfg.model, max_tokens: maxTokens, temperature: 0, system, messages: [{ role: 'user', content: user }] }
    : {
      model: cfg.model,
      max_tokens: maxTokens,
      temperature: 0,
      ...(cfg.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    };

  let lastError = new LLMError('LLM call failed', 'llm');
  for (let attempt = 0; attempt < attempts; attempt++) {
    const { res, text } = await post(url, headers, body, timeoutMs);
    if (res.ok) {
      const payload = safeJson(text);
      const content = anthropic
        ? (payload?.content || []).map((p) => p.text || '').join('')
        : payload?.choices?.[0]?.message?.content || '';
      if (!String(content).trim()) throw new LLMError('LLM returned an empty response', 'empty', res.status);
      return { text: String(content), model: payload?.model || cfg.model, provider: cfg.provider };
    }

    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    const code = res.status === 429 ? 'rate_limited'
      : res.status === 401 || res.status === 403 ? 'auth'
        : 'http';
    lastError = new LLMError(`LLM returned HTTP ${res.status}`, code, res.status);
    if (!RETRY_STATUS.has(res.status) || attempt === attempts - 1) break;
    const backoff = retryAfter ? retryAfter * 1000 : 500 * 2 ** attempt;
    await sleep(Math.min(8000, Math.max(250, backoff)));
  }
  throw lastError;
}

// Models are asked for bare JSON, but a stray code fence or sentence of
// preamble is common enough to handle defensively.
export function parseJsonObject(input = '') {
  const cleaned = String(input)
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  const direct = safeJson(cleaned);
  if (direct && typeof direct === 'object') return direct;
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const sliced = safeJson(cleaned.slice(start, end + 1));
    if (sliced && typeof sliced === 'object') return sliced;
  }
  return null;
}
