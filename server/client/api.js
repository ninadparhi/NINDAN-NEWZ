// Thin API client for the NINDAN-NEWZ server. Same origin in every deployment
// mode, so paths are absolute and no base URL configuration is needed.
const parse = async (res) => {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.retryAfter = body.retryAfter || Number(res.headers.get('retry-after')) || 0;
    throw err;
  }
  return body;
};

const get = (url) => fetch(url, { headers: { accept: 'application/json' } }).then(parse);

const qs = (params = {}) => {
  const pairs = Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  const search = new URLSearchParams(pairs).toString();
  return search ? `?${search}` : '';
};

export const api = {
  meta: () => get('/api/meta'),
  news: (params = {}) => get(`/api/news${qs(params)}`),
  story: (id) => get(`/api/news/${encodeURIComponent(id)}`),
  trending: (limit = 12) => get(`/api/trending${qs({ limit })}`),
  topics: (limit = 14) => get(`/api/topics${qs({ limit })}`),
  framing: (id) => get(`/api/framing/${encodeURIComponent(id)}`),
  stakeholder: (source) => get(`/api/stakeholder/${encodeURIComponent(source)}`),
  analyze: (body) => fetch('/api/analyze-article', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(parse),
};
