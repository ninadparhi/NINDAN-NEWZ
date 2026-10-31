// NINDAN-NEWZ 2.0 client. Plain ES modules, no build step, hash routing:
//   #/                 dashboard with bias spectrum bars
//   #/story/:clusterId X-Ray reader, analysis rail, framing drawer
// Versioned specifiers on purpose: a browser that stored an older api.js under
// the plain URL keeps using it for its max-age, even after the shell updates,
// and then every call to a newly added method fails. Changing the URL forces a
// genuinely fresh module.
import { api } from './api.js?v=6';
import {
  recordRead, readHistory, balanceSummary, recommendations, clearHistory,
} from './store.js?v=6';

const view = document.getElementById('view');
const tooltip = document.getElementById('tooltip');
const drawer = document.getElementById('drawer');
const drawerBody = document.getElementById('drawer-body');
const drawerTitle = document.getElementById('drawer-title');
const scrim = document.getElementById('scrim');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const toastEl = document.getElementById('toast');
const consensusBtn = document.getElementById('consensus-toggle');
const themeBtn = document.getElementById('theme-toggle');

const state = {
  meta: null,
  feed: { articles: [], updatedAt: null, total: 0 },
  filters: { region: '', category: '', q: '', group: '' },
  topics: [],
  consensus: localStorage.getItem('nindan.consensus') === '1',
  stories: new Map(),
  framings: new Map(),
  analyses: new Map(),
};

const LEAN_ROWS = [
  ['left', 'Left'], ['leanLeft', 'Lean left'], ['center', 'Center'],
  ['leanRight', 'Lean right'], ['right', 'Right'],
];

/* -------------------------------------------------------------------- utils */

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const cut = (value, max = 220) => {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const at = slice.lastIndexOf(' ');
  return `${(at > max * 0.5 ? slice.slice(0, at) : slice).replace(/[\s,;:.–—-]+$/, '')}…`;
};

const timeAgo = (iso) => {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return '';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const leanLabel = (lean) => String(lean || 'unrated')
  .split('-')
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join('-');

const leanSlug = (lean) => String(lean || 'unrated').replace(/\s+/g, '-').toLowerCase();

// Hugeicons stroke-rounded, loaded from the Hugeicons web font in index.html.
const icon = (name) => `<i class="hgi-stroke hgi-${name}" aria-hidden="true"></i>`;

const spectrumHtml = (buckets = {}) => {
  const parts = [
    ['left', buckets.left || 0],
    ['center-left', buckets['center-left'] || 0],
    ['center', buckets.center || 0],
    ['center-right', buckets['center-right'] || 0],
    ['right', buckets.right || 0],
  ];
  const total = parts.reduce((sum, [, n]) => sum + n, 0);
  if (!total) return '<div class="spectrum empty" aria-hidden="true"></div>';
  const label = parts.filter(([, n]) => n).map(([key, n]) => `${leanLabel(key)} ${n}`).join(', ');
  return `<div class="spectrum" role="img" aria-label="Coverage by lean: ${esc(label)}">
    ${parts.filter(([, n]) => n).map(([key, n]) => (
    `<span class="seg lean-${key}" style="flex:${n}" title="${leanLabel(key)}: ${n} outlet${n === 1 ? '' : 's'}"></span>`
  )).join('')}
  </div>`;
};

// ------------------------------------------------------- dual bias metrics

const LEAN_CLASS = (key) => leanSlug(key.replace('leanLeft', 'center-left').replace('leanRight', 'center-right'));

const share = (n, total) => (total ? Math.round((Number(n) / total) * 100) : 0);

const coverageSentence = (breakdown) => {
  if (!breakdown?.totalSources) return 'No outlet breakdown is available yet.';
  const total = breakdown.totalSources;
  const left = share(breakdown.leftCount, total);
  const center = share(breakdown.centerCount, total);
  const right = Math.max(0, 100 - left - center);
  return `${total} outlet${total === 1 ? '' : 's'} covered this: ${breakdown.leftCount} Left (${left}%), ${breakdown.centerCount} Center (${center}%), ${breakdown.rightCount} Right (${right}%)`;
};

const meterHtml = (segments) => {
  const total = segments.reduce((sum, [, n]) => sum + n, 0);
  if (!total) return '';
  return `<div class="meter">${segments.filter(([, n]) => n).map(([key, n]) =>
    `<span class="meter-seg lean-${key}" style="flex:${n}"></span>`).join('')}</div>`;
};

const biasMeterHtml = (bias) => meterHtml(LEAN_ROWS.map(([key]) => [LEAN_CLASS(key), Number(bias?.[key] || 0)]));

const sourceMeterHtml = (breakdown) => meterHtml([
  ['left', Number(breakdown?.leftCount || 0)],
  ['center', Number(breakdown?.centerCount || 0)],
  ['right', Number(breakdown?.rightCount || 0)],
]);

// Cards show both numbers side by side: the text score when this article has
// already been analysed in this session, and the outlet split always.
const dualMeterHtml = (article, analysis) => {
  const breakdown = article.sourceBreakdown;
  const outlets = breakdown?.totalSources || article.coverage || 0;
  const ai = analysis?.bias
    ? `<span class="metric-value">${esc(analysis.biasRating || 'Center')} · ${Number(analysis.biasPercentage || 0)}%</span>${biasMeterHtml(analysis.bias)}`
    : '<span class="metric-note">Open the X-Ray to score this text</span>';
  return `<div class="dual-meter">
      <div class="metric">
        <span class="metric-label">AI content bias</span>
        ${ai}
      </div>
      <div class="metric">
        <span class="metric-label">Source coverage</span>
        <span class="metric-value">${outlets} outlet${outlets === 1 ? '' : 's'}</span>
        ${sourceMeterHtml(breakdown)}
        ${breakdown ? `<span class="metric-note">${breakdown.leftCount} left / ${breakdown.centerCount} center / ${breakdown.rightCount} right</span>` : ''}
      </div>
    </div>`;
};

const coveragePanelHtml = (story) => `
  <p class="small">${esc(coverageSentence(story.sourceBreakdown))}</p>
  ${sourceMeterHtml(story.sourceBreakdown)}
  <p class="muted small">Unique outlets in this cluster, grouped by their rated lean. Untracked outlets are counted separately. This measures who covered the story, not how this article is written.</p>`;

// ------------------------------------------------------- source identity

const GROUP_OF = (lean) => {
  const value = String(lean || 'unrated');
  if (value === 'left' || value === 'center-left') return 'left';
  if (value === 'right' || value === 'center-right') return 'right';
  if (value === 'center') return 'center';
  return 'untracked';
};

const FACTUALITY_LABEL = { high: 'High', mixed: 'Mixed', low: 'Low', unknown: 'Unrated' };
const OWNER_LABEL = {
  corporate: 'Corporate', govt: 'State-backed', independent: 'Independent', trust: 'Trust / nonprofit',
};

const sourceMetaOf = (name) => state.meta?.sourceMeta?.[name] || null;

const logoHtml = (name, fallbackLogo = null) => {
  const logo = sourceMetaOf(name)?.logoUrl || fallbackLogo;
  const initial = String(name || '?').trim().charAt(0).toUpperCase();
  return `<span class="source-logo" aria-hidden="true">${logo
    ? `<img src="${esc(logo)}" alt="" loading="lazy" onerror="this.remove()">` : ''}<span>${esc(initial)}</span></span>`;
};

// Card header: outlet identity plus the factuality, ownership and bias flags.
const sourceHeaderHtml = (article) => {
  const meta = sourceMetaOf(article.source) || {};
  const ownership = meta.ownership || article.ownership || {};
  const country = meta.country || article.country;
  const factuality = meta.factuality || article.factuality;
  const ownerLabel = OWNER_LABEL[ownership.type] || '';
  const updated = article.latestAt || article.lastUpdatedTime || article.publishedAt;
  return `<div class="source-row">
      ${logoHtml(article.source, article.logoUrl)}
      <span class="source-name">${esc(article.source)}</span>
      ${country ? `<span class="source-country">${esc(country)}</span>` : ''}
      <time datetime="${esc(updated)}">${timeAgo(updated)}</time>
    </div>
    <div class="source-badges">
      <span class="bias-badge lean-${leanSlug(article.lean)}">${esc(leanLabel(article.lean))}</span>
      ${factuality ? `<span class="source-flag">Factuality: ${esc(FACTUALITY_LABEL[factuality] || 'Unrated')}</span>` : ''}
      ${ownerLabel ? `<span class="source-flag">Ownership: ${esc(ownerLabel)}</span>` : ''}
    </div>`;
};

const uniqueSourcesOf = (story) => {
  const seen = new Set();
  return [story, ...(story.alsoReportedBy || [])].filter((row) => {
    if (!row?.source || seen.has(row.source)) return false;
    seen.add(row.source);
    return true;
  });
};

// Full coverage dashboard for the cluster page: numbers, distribution bar,
// logos by column, untracked outlets, factuality and ownership.
function coverageDashboardHtml(story) {
  const rows = uniqueSourcesOf(story);
  const counts = story.sourceCounts || {
    total: rows.length, left: 0, leanLeft: 0, center: 0, leanRight: 0, right: 0, untracked: 0,
  };
  const metaOf = (row) => ({ ...(row || {}), ...(sourceMetaOf(row?.source) || {}) });
  const stats = [
    ['Total sources', counts.total], ['Left', counts.left], ['Lean left', counts.leanLeft],
    ['Center', counts.center], ['Lean right', counts.leanRight], ['Right', counts.right],
    ['Untracked', counts.untracked],
  ];
  const dist = [
    ['left', counts.left], ['center-left', counts.leanLeft], ['center', counts.center],
    ['center-right', counts.leanRight], ['right', counts.right], ['unrated', counts.untracked],
  ];
  const total = dist.reduce((sum, [, n]) => sum + n, 0) || 1;
  const pct = (n) => Math.round((n / total) * 100);
  const inGroup = (group) => rows.filter((row) => GROUP_OF(row.lean) === group);
  const untracked = inGroup('untracked');
  const updated = story.latestAt || story.lastUpdatedTime || story.publishedAt;

  const sourceList = (list) => `<ul class="logo-list">${list.map((row) => {
    const meta = metaOf(row);
    return `<li>${logoHtml(row.source, meta.logoUrl)}<span>${esc(row.source)}</span><em>${esc(leanLabel(meta.lean || row.lean))}</em></li>`;
  }).join('')}</ul>`;

  const factuality = ['high', 'mixed', 'low', 'unknown']
    .map((key) => [key, rows.filter((row) => (metaOf(row).factuality || 'unknown') === key).length])
    .filter(([, n]) => n);
  const countries = [...rows.reduce((map, row) => {
    const country = metaOf(row).country || 'Unknown';
    map.set(country, (map.get(country) || 0) + 1);
    return map;
  }, new Map())].sort((a, b) => b[1] - a[1]);
  const ownerCounts = rows.reduce((map, row) => {
    const type = metaOf(row).ownership?.type || 'independent';
    map.set(type, (map.get(type) || 0) + 1);
    return map;
  }, new Map());
  const stateBacked = ownerCounts.get('govt') || 0;
  const labels = [['left', 'Left sources'], ['center', 'Center sources'], ['right', 'Right sources']];

  return `
    <section class="coverage-dash" aria-labelledby="coverage-title">
      <div class="section-head">
        <h2 id="coverage-title">Coverage details</h2>
        <span class="muted small">Last updated ${timeAgo(updated)}</span>
      </div>
      <dl class="coverage-stats">
        ${stats.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}
      </dl>
      <div class="coverage-bar" role="img" aria-label="${counts.total} outlets by political lean">
        ${dist.filter(([, n]) => n).map(([key, n]) => `<span class="seg lean-${key}" style="flex:${n}"></span>`).join('')}
      </div>
      <p class="coverage-pct">${dist.filter(([, n]) => n)
    .map(([key, n]) => `${key === 'unrated' ? 'Untracked' : leanLabel(key)} ${pct(n)}%`).join(' / ')}</p>
      <div class="source-columns">
        ${labels.map(([group, label]) => `
          <div class="source-col">
            <h3>${label} <span class="muted">${inGroup(group).length}</span></h3>
            ${inGroup(group).length ? sourceList(inGroup(group)) : '<p class="muted small">No outlet from this side covered the story.</p>'}
          </div>`).join('')}
      </div>
      <div class="coverage-grid">
        <article class="coverage-card">
          <h3>Untracked bias</h3>
          <p class="muted small">Outlets without a published bias rating, counted separately.</p>
          ${untracked.length ? sourceList(untracked) : '<p class="muted small">Every outlet in this cluster is rated.</p>'}
        </article>
        <article class="coverage-card">
          <h3>Factuality</h3>
          <ul class="stat-list">${factuality.map(([key, n]) => `<li><span>${esc(FACTUALITY_LABEL[key] || 'Unrated')}</span><b>${n}</b></li>`).join('')
    || '<li><span class="muted">No ratings yet</span></li>'}</ul>
          <p class="muted small">Publication-level ratings from AllSides, Ad Fontes and Media Bias/Fact Check.</p>
        </article>
        <article class="coverage-card">
          <h3>Ownership</h3>
          <p class="small">Sources are mostly out of ${esc(countries[0]?.[0] || 'unknown countries')} (${countries[0]?.[1] || 0}).</p>
          <ul class="stat-list">${countries.slice(0, 4).map(([country, n]) => `<li><span>${esc(country)}</span><b>${n}</b></li>`).join('')}</ul>
          <p class="muted small">${stateBacked} state-backed outlet${stateBacked === 1 ? '' : 's'} among ${counts.total}.</p>
        </article>
      </div>
    </section>`;
}

// Card image. A `data-og` attribute means the picture is a category
// placeholder: the observer below swaps in the publisher's own og:image once
// the card is near the viewport, without blocking the first paint.
const imageHtml = (article, { eager = false } = {}) => {
  if (!article?.imageUrl) return '';
  const og = article.imageSource === 'placeholder' && article.url ? ` data-og="${esc(article.url)}"` : '';
  const loading = eager ? '' : ' loading="lazy"';
  return `<figure class="card-media"><img src="${esc(article.imageUrl)}" alt=""${loading} decoding="async"${og}></figure>`;
};

// Mid-page trending strip: a thick dark band carrying the section heading and
// a thin light row of scrollable topic tags. Clicking a tag filters the feed.
function tickerHtml(topics = []) {
  if (!topics.length) return '';
  const active = String(state.filters.q || '').toLowerCase();
  return `
    <section class="ticker" aria-labelledby="ticker-title">
      <div class="ticker-thick">
        <div class="ticker-head">
          <h2 id="ticker-title">Trending topics</h2>
          <p>What several newsrooms are circling right now.</p>
        </div>
        ${state.filters.q ? `<button class="ticker-clear" id="topic-clear">Clear filter ${icon('cancel-01')}</button>` : ''}
      </div>
      <div class="ticker-thin" role="group" aria-label="Trending topics">
        <ul class="ticker-track">
          ${topics.map((topic) => {
    const on = active === String(topic.query || '').toLowerCase();
    return `<li><button class="ticker-tag${on ? ' active' : ''}" data-topic="${esc(topic.query)}"
      aria-pressed="${on}">${esc(topic.tag)}</button></li>`;
  }).join('')}
        </ul>
      </div>
    </section>`;
}

// heuristicSynthesis pads short excerpts with a sentinel so the API always has
// three bullets; a consensus card must never show it as a fact.
const cleanFacts = (facts) => (Array.isArray(facts) ? facts : [])
  .filter((fact) => typeof fact === 'string' && fact && fact !== '…' && !/^The excerpt is too short/i.test(fact))
  .slice(0, 3);

// The media-literacy consensus card set: a one-sentence bottom line, then the
// facts both sides accept and how each side frames the same event.
function consensusCardsHtml({ facts = [], left = null, right = null, bottomLine = '', note = '' }) {
  const items = cleanFacts(facts);
  return `
  <section class="consensus" aria-label="What both sides agree on">
    <div class="consensus-head">
      <h3>What both sides agree on</h3>
      ${note ? `<span class="muted small">${esc(note)}</span>` : ''}
    </div>
    <p class="consensus-bottom">${esc(bottomLine || 'No shared framing has been established for this story yet.')}</p>
    <div class="consensus-grid">
      <article class="consensus-card facts">
        <h4>Undisputed facts</h4>
        ${items.length
    ? `<ol class="consensus-list">${items.map((fact) => `<li>${esc(fact)}</li>`).join('')}</ol>`
    : '<p class="muted small">No fact set for this story yet.</p>'}
      </article>
      <article class="consensus-card left">
        <h4>Left perspective</h4>
        <p>${esc(left?.sentence || 'No left-leaning outlet covered this story in the archive.')}</p>
        ${left?.source ? `<span class="muted small">${esc(left.source)}${left.sources?.length > 1 ? ` + ${left.sources.length - 1} more` : ''}</span>` : ''}
      </article>
      <article class="consensus-card right">
        <h4>Right perspective</h4>
        <p>${esc(right?.sentence || 'No right-leaning outlet covered this story in the archive.')}</p>
        ${right?.source ? `<span class="muted small">${esc(right.source)}${right.sources?.length > 1 ? ` + ${right.sources.length - 1} more` : ''}</span>` : ''}
      </article>
    </div>
  </section>`;
}

const skeleton = (label = 'Loading the dashboard…') => `
  <section class="hero"><h1>${esc(label)}</h1></section>
  <div class="skeleton">${'<div class="sk-card"></div>'.repeat(4)}</div>`;

let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200);
}

function errorState(error) {
  view.innerHTML = `
    <div class="state">
      <h2>Could not load the news</h2>
      <p>${esc(error?.message || 'The server did not respond.')}</p>
      <button class="primary" id="retry">Try again</button>
    </div>`;
  view.querySelector('#retry')?.addEventListener('click', route);
}

/* ---------------------------------------------------------------- dashboard */

async function renderDashboard() {
  view.innerHTML = skeleton('Clustering today’s coverage…');
  try {
    // A stale client module must never take the whole dashboard down: without
    // the topic helper the feed still renders, just without the ticker.
    const topicCall = typeof api.topics === 'function'
      ? api.topics().catch(() => ({ topics: [] }))
      : Promise.resolve({ topics: [] });
    const [meta, news, topics] = await Promise.all([
      api.meta(),
      api.news({ limit: 60, ...state.filters }),
      topicCall,
    ]);
    state.meta = meta;
    state.feed = news;
    state.topics = Array.isArray(topics.topics) ? topics.topics : [];
    view.innerHTML = dashboardHtml(news, meta);
    bindDashboard();
    applyConsensus();
    upgradeImages();
  } catch (error) {
    errorState(error);
  }
}

function cardHtml(article) {
  const media = imageHtml(article);
  return `
    <article class="card${media ? ' has-media' : ''}" data-id="${esc(article.id)}">
      ${media}
      <div class="card-body">
      ${sourceHeaderHtml(article)}
      <h3 class="card-title"><a href="#/story/${esc(article.id)}">${esc(article.title)}</a></h3>
      <p class="card-deck">${esc(cut(article.summary || article.detail, 210) || 'No teaser from this outlet.')}</p>
      <div class="consensus-block" data-consensus hidden></div>
      ${dualMeterHtml(article, article.analysis || state.analyses.get(article.id))}
      <div class="card-foot">
        <span>${article.coverage} outlet${article.coverage === 1 ? '' : 's'}</span>
        ${article.blindspot ? '<span class="badge warn">Blindspot</span>' : ''}
        <div class="card-actions">
          <a class="link-btn" href="#/story/${esc(article.id)}">X-Ray ${icon('arrow-right-01')}</a>
          <button class="link-btn" data-framing="${esc(article.id)}">Framing ${icon('arrow-up-right-01')}</button>
        </div>
      </div>
      </div>
    </article>`;
}

function dashboardHtml(news, meta) {
  const articles = news.articles || [];
  const groups = [['', 'All'], ['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
  const countFor = (group) => articles.filter((a) => !group || GROUP_OF(a.lean) === group).length;
  const visible = state.filters.group
    ? articles.filter((a) => GROUP_OF(a.lean) === state.filters.group)
    : articles;
  const clusters = [...visible]
    .filter((a) => a.coverage > 1)
    .sort((a, b) => b.coverage - a.coverage
      || new Date(b.latestAt || b.publishedAt) - new Date(a.latestAt || a.publishedAt));
  const singles = visible.filter((a) => a.coverage === 1);

  const regionFilters = [['', 'All regions'], ['india', 'India'], ['world', 'World']];
  const filterBar = `
    <div class="filters">
      <div class="filter-group" role="group" aria-label="Region">
        <span class="filter-label">Region</span>
        ${regionFilters.map(([value, label]) => (
    `<button class="chip-btn ${state.filters.region === value ? 'active' : ''}" data-region="${value}">${label}</button>`
  )).join('')}
      </div>
      <div class="filter-group" role="group" aria-label="Category">
        <span class="filter-label">Topic</span>
        <button class="chip-btn ${!state.filters.category ? 'active' : ''}" data-category="">All topics</button>
        ${(meta.categories || []).map((category) => (
    `<button class="chip-btn ${state.filters.category === category ? 'active' : ''}" data-category="${esc(category)}">${esc(category)}</button>`
  )).join('')}
      </div>
    </div>`;

  const activeTopicLine = state.filters.q
    ? `<p class="active-topic">Showing stories that mention <strong>${esc(state.filters.q)}</strong>.
       <button class="chip-btn" id="topic-clear-inline">Clear</button></p>`
    : '';

  const feedTabs = `
    <div class="feed-tabs">
      <div class="feed-tabs-group" role="group" aria-label="Filter by source bias">
        ${groups.map(([value, label]) => `<button class="feed-tab${state.filters.group === value ? ' active' : ''}" data-group="${value}" aria-pressed="${state.filters.group === value}">${label} <span>${countFor(value)}</span></button>`).join('')}
      </div>
      <form class="feed-search" id="feed-search" role="search">
        <input type="search" name="q" value="${esc(state.filters.q)}" placeholder="Search headlines" aria-label="Search headlines" />
        <button class="feed-search-btn" type="submit" aria-label="Search">${icon('search-01')}</button>
      </form>
    </div>`;

  const empty = visible.length === 0
    ? `<div class="state"><h2>No stories match those filters</h2><p>Feed refresh runs every 20 minutes. Try another topic or region.</p></div>`
    : '';

  return `
    <section class="hero">
      <h1>The news, with the framing exposed.</h1>
      <p class="lede">Stories are clustered across outlets, placed on the political spectrum, and annotated sentence by
      sentence — so you can see what the wording is doing, not just who published it.</p>
      <dl class="stat-row">
        <div><dt>Stories</dt><dd>${Number(news.total || 0)}</dd></div>
        <div><dt>Clusters</dt><dd>${clusters.length}</dd></div>
        <div><dt>Refresh</dt><dd>${timeAgo(news.updatedAt)}</dd></div>
      </dl>
    </section>
    ${filterBar}
    ${tickerHtml(state.topics)}
    ${activeTopicLine}
    ${feedTabs}
    ${empty}
    <div class="board">
      <section class="board-main">
        ${clusters.length ? `
          <div class="section-head">
            <h2>Trending clusters</h2>
            <p>Same event, different newsrooms.</p>
          </div>
          <div class="grid">${clusters.slice(0, 12).map(cardHtml).join('')}</div>`
    : '<p class="muted small">No clustered story matches this filter.</p>'}
      </section>
      <aside class="board-side">
        <div class="section-head"><h2>More headlines</h2></div>
        ${singles.length
    ? `<div class="grid compact">${singles.slice(0, 9).map((a, i) => cardHtml(a, i)).join('')}</div>`
    : '<p class="muted small">No single-outlet reports in this filter.</p>'}
      </aside>
    </div>`;
}

function bindDashboard() {
  view.querySelectorAll('[data-region]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.region = button.dataset.region;
      renderDashboard();
    });
  });
  view.querySelectorAll('[data-category]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.category = button.dataset.category;
      renderDashboard();
    });
  });
  view.querySelectorAll('[data-framing]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openDrawer(button.dataset.framing);
    });
  });
  view.querySelectorAll('[data-topic]').forEach((button) => {
    button.addEventListener('click', () => {
      const q = button.dataset.topic || '';
      state.filters.q = state.filters.q.toLowerCase() === q.toLowerCase() ? '' : q;
      renderDashboard();
    });
  });
  view.querySelectorAll('#topic-clear, #topic-clear-inline').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.q = '';
      renderDashboard();
    });
  });
  view.querySelectorAll('[data-group]').forEach((button) => {
    button.addEventListener('click', () => {
      state.filters.group = button.dataset.group;
      renderDashboard();
    });
  });
  view.querySelector('#feed-search')?.addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters.q = String(new FormData(event.currentTarget).get('q') || '').trim();
    renderDashboard();
  });
}

// Turns each visible card's summary row into a consensus line computed from the
// outlets' own headlines. No LLM call, so the toggle is instant and free.
async function applyConsensus() {
  const blocks = [...view.querySelectorAll('[data-consensus]')];
  if (!state.consensus) {
    blocks.forEach((block) => { block.hidden = true; block.innerHTML = ''; });
    return;
  }
  await Promise.all(blocks.slice(0, 12).map(async (block) => {
    const id = block.closest('[data-id]')?.dataset.id;
    block.hidden = false;
    block.innerHTML = '<span class="muted">Comparing outlets…</span>';
    try {
      const framing = await api.framing(id);
      state.framings.set(id, framing);
      block.innerHTML = consensusCardsHtml({
        facts: framing.facts || [],
        left: framing.perspectives?.left,
        right: framing.perspectives?.right,
        bottomLine: framing.bottomLine,
        note: framing.consensus?.note,
      });
    } catch {
      block.innerHTML = '<span class="muted">Consensus unavailable for this story.</span>';
    }
  }));
}

/* ------------------------------------------------------------------- reader */

function readerShell(story) {
  const source = story.source || 'Unknown outlet';
  return `
    <div class="reader">
      <article class="reader-main">
        <a class="back" href="#/">${icon('arrow-left-01')} Back to the dashboard</a>
        <div class="card-top">
          <span class="lean-chip lean-${leanSlug(story.lean)}">${esc(leanLabel(story.lean))}</span>
          <span class="source">${esc(source)}</span>
          ${story.category ? `<span class="chip">${esc(story.category)}</span>` : ''}
          <time datetime="${esc(story.publishedAt)}">${timeAgo(story.publishedAt)}</time>
        </div>
        <h1>${esc(story.title)}</h1>
        <p class="byline">
          ${story.author ? `<span>${esc(story.author)}</span>` : ''}
          <span>${esc(source)}</span>
          ${story.url ? `<a href="${esc(story.url)}" target="_blank" rel="noopener">Read at source ${icon('arrow-up-right-01')}</a>` : ''}
        </p>
        <section class="quick-context" aria-labelledby="quick-title">
          <div class="quick-head">
            ${icon('flash')}
            <h2 id="quick-title">Quick context</h2>
          </div>
          <p id="quick-context-text">Writing the plain-language summary…</p>
        </section>
        ${story.imageUrl
    ? `<figure class="reader-media"><img src="${esc(story.imageUrl)}" alt=""
         ${story.imageSource === 'placeholder' && story.url ? `data-og="${esc(story.url)}"` : ''}></figure>`
    : ''}
        <div class="metrics" id="bias-metrics">
          <div class="metrics-tabs" role="tablist" aria-label="Bias metrics">
            <button class="metric-tab active" role="tab" aria-selected="true" data-metric-tab="ai">AI content bias</button>
            <button class="metric-tab" role="tab" aria-selected="false" data-metric-tab="sources">Source coverage</button>
          </div>
          <div class="metric-panel" data-metric-panel="ai">
            <div id="ai-bias-body"><p class="muted small">Scoring the article text…</p></div>
          </div>
          <div class="metric-panel" data-metric-panel="sources" hidden>
            ${coveragePanelHtml(story)}
          </div>
        </div>
        <div id="consensus-panel" class="reader-consensus"></div>
        ${coverageDashboardHtml(story)}
        <div class="xray-toolbar">
          <span class="pill">${icon('text-align-left')} Linguistic spin X-Ray</span>
          <button class="link-btn" id="xray-toggle" aria-pressed="true">Highlights on</button>
          <button class="link-btn" data-framing="${esc(story.id)}">Framing &amp; ownership ${icon('arrow-up-right-01')}</button>
        </div>
        <div id="xray-body" class="article-body">
          <p class="placeholder">Reading the article and marking framing techniques…</p>
        </div>
        <p class="method-note muted" id="xray-note"></p>
      </article>
      <aside class="reader-rail">
        <section class="panel" id="analysis-panel">
          <div class="panel-head">
            <h2>AI X-Ray</h2>
            <span class="badge">Analysing…</span>
          </div>
          <p class="muted small">Locating loaded language, omitted context and emotional appeal…</p>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2>Coverage</h2>
            <span class="badge">${story.coverage} outlet${story.coverage === 1 ? '' : 's'}</span>
          </div>
          ${spectrumHtml(story.coverageBuckets)}
          ${story.blindspot ? '<p class="notice">Blindspot: one side of the spectrum barely covered this story.</p>' : ''}
          <p class="muted small">${story.coverage > 1
    ? 'Open the framing drawer for the ownership chain and headlines from each side.'
    : 'Only one outlet in the archive carried this. The framing drawer still shows its owner.'}</p>
          <button class="link-btn" data-framing="${esc(story.id)}">Open framing &amp; ownership ${icon('arrow-up-right-01')}</button>
        </section>
      </aside>
    </div>`;
}

const fallbackTextFor = (story) => [story.summary, story.detail]
  .filter(Boolean)
  .map((part) => String(part).trim())
  .join('\n\n');

async function renderReader(id) {
  view.innerHTML = skeleton('Opening the X-Ray reader…');
  let story;
  try {
    story = await api.story(id);
    state.stories.set(id, story);
  } catch (error) {
    return errorState(error);
  }

  recordRead({
    id: story.id, title: story.title, source: story.source, lean: story.lean,
  });

  view.innerHTML = readerShell(story);
  bindReader(story);
  upgradeImages();

  // Framing is computed locally, so the consensus cards render before the
  // analysis call (which may wait on a free-tier model) finishes.
  let framing = state.framings.get(id) || null;
  if (!framing) {
    try {
      framing = await api.framing(id);
      state.framings.set(id, framing);
    } catch { framing = null; }
  }
  const precomputed = story.analysis || null;
  mountConsensus(framing, precomputed || state.analyses.get(id));

  const cached = precomputed || state.analyses.get(id);
  if (cached) {
    state.analyses.set(id, cached);
    mountAnalysis(cached, framing);
    // A precomputed record comes from the archived excerpt. When it found few
    // highlights, ask for the fuller publisher-page analysis in the background
    // so the X-Ray improves without delaying the first paint.
    if (precomputed && (precomputed.spin?.length || 0) < 3) {
      upgradeAnalysis(id, story, framing);
    }
    return;
  }

  try {
    const analysis = await api.analyze({
      url: story.url || undefined,
      text: story.url ? undefined : fallbackTextFor(story),
      title: story.title,
      source: story.source,
      category: story.category || undefined,
      fallbackText: fallbackTextFor(story),
    });
    state.analyses.set(id, analysis);
    mountAnalysis(analysis, framing);
  } catch (error) {
    mountAnalysisError(error, story);
  }
}

async function upgradeAnalysis(id, story, framing) {
  try {
    const full = await api.analyze({
      url: story.url || undefined,
      text: story.url ? undefined : fallbackTextFor(story),
      title: story.title,
      source: story.source,
      category: story.category || undefined,
      fallbackText: fallbackTextFor(story),
    });
    const current = state.analyses.get(id);
    if (!full || (full.spin?.length || 0) <= (current?.spin?.length || 0)) return;
    state.analyses.set(id, full);
    if (location.hash.startsWith(`#/story/${id}`)) mountAnalysis(full, framing);
  } catch {
    // Offline or rate-limited: the precomputed view stays on screen.
  }
}

function bindReader(story) {
  view.querySelector('#xray-toggle')?.addEventListener('click', (event) => {
    const body = view.querySelector('#xray-body');
    const off = body.classList.toggle('xray-off');
    event.currentTarget.setAttribute('aria-pressed', String(!off));
    event.currentTarget.textContent = off ? 'Highlights off' : 'Highlights on';
  });
  view.querySelectorAll('[data-framing]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      openDrawer(story.id);
    });
  });
  view.querySelectorAll('[data-metric-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const wanted = button.dataset.metricTab;
      view.querySelectorAll('[data-metric-tab]').forEach((tab) => {
        const on = tab === button;
        tab.classList.toggle('active', on);
        tab.setAttribute('aria-selected', String(on));
      });
      view.querySelectorAll('[data-metric-panel]').forEach((panel) => {
        panel.hidden = panel.dataset.metricPanel !== wanted;
      });
    });
  });
}

function renderXRay(text, spin = []) {
  const wrapper = document.createElement('div');
  const items = (spin || [])
    .filter((s) => Number.isInteger(s.startIndex) && Number.isInteger(s.endIndex)
      && s.startIndex >= 0 && s.endIndex <= text.length && s.endIndex > s.startIndex)
    .sort((a, b) => a.startIndex - b.startIndex);

  const lineRe = /[^\n]+/g;
  let line;
  while ((line = lineRe.exec(text))) {
    const lineStart = line.index;
    const content = line[0];
    const lineEnd = lineStart + content.length;
    const paragraph = document.createElement('p');
    let cursor = lineStart;

    for (const item of items) {
      if (item.endIndex <= lineStart || item.startIndex >= lineEnd) continue;
      const start = Math.max(item.startIndex, lineStart);
      const end = Math.min(item.endIndex, lineEnd);
      if (start < cursor) continue;
      if (start > cursor) paragraph.append(document.createTextNode(text.slice(cursor, start)));

      const mark = document.createElement('mark');
      mark.className = 'spin';
      mark.dataset.tag = item.explanationTag || 'Framing';
      mark.dataset.note = item.explanation || '';
      mark.dataset.valence = String(item.valenceScore ?? 0);
      mark.dataset.start = String(item.startIndex);
      mark.tabIndex = 0;
      mark.textContent = text.slice(start, end);
      paragraph.append(mark);
      cursor = end;
    }
    if (cursor < lineEnd) paragraph.append(document.createTextNode(text.slice(cursor, lineEnd)));
    if (paragraph.childNodes.length) wrapper.append(paragraph);
  }
  return wrapper;
}

function biasHtml(bias) {
  return `<div class="bias-block">
    ${LEAN_ROWS.map(([key, label]) => {
    const value = Number(bias?.[key] || 0);
    return `<div class="bias-row">
        <span>${label}</span>
        <div class="track"><span class="fill lean-${leanSlug(key.replace('leanLeft', 'center-left').replace('leanRight', 'center-right'))}" style="width:${Math.max(value, value ? 2 : 0)}%"></span></div>
        <b>${value}%</b>
      </div>`;
  }).join('')}
  </div>`;
}

function mountConsensus(framing, analysis = null) {
  const host = view.querySelector('#consensus-panel');
  if (!host) return;
  if (!framing) {
    host.innerHTML = '<p class="muted small">Comparative framing is unavailable for this story.</p>';
    return;
  }
  host.innerHTML = consensusCardsHtml({
    // Analysis facts are cleaner than the extracted ones, so prefer them once
    // the analysis arrives; the framing response already carries a fallback.
    facts: analysis?.synthesis?.undisputedFacts || framing.facts || [],
    left: framing.perspectives?.left,
    right: framing.perspectives?.right,
    bottomLine: framing.bottomLine,
    note: framing.consensus?.note,
  });
}

const spinListHtml = (spin = []) => {
  if (!spin.length) return '<p class="muted small">No sentence-level framing signals were detected in this excerpt.</p>';
  return `<h3>Framing signals <span class="muted">(${spin.length})</span></h3>
    <ol class="spin-list">
      ${spin.map((item) => `
        <li>
          <button class="spin-link" data-start="${Number(item.startIndex)}" data-end="${Number(item.endIndex)}">
            <span class="tag">${esc(item.explanationTag)}</span>
            <q>${esc(cut(item.sentenceText, 130))}</q>
            <span class="muted">${esc(item.explanation || '')}</span>
          </button>
        </li>`).join('')}
    </ol>`;
};

const methodBadge = (analysis) => (analysis.method === 'llm'
  ? `<span class="badge ok">${esc(analysis.engine || 'LLM analysis')}</span>`
  : '<span class="badge ok">Local analyser</span>');

function mountQuickContext(analysis) {
  const host = view.querySelector('#quick-context-text');
  if (!host) return;
  host.textContent = analysis?.simpleSummary
    || 'A plain-language summary is not available for this excerpt yet.';
}

function mountAnalysis(analysis, framing = null) {
  const body = view.querySelector('#xray-body');
  if (body && analysis.text) body.replaceChildren(renderXRay(analysis.text, analysis.spin));
  mountConsensus(framing, analysis);
  mountQuickContext(analysis);

  const note = view.querySelector('#xray-note');
  if (note) {
    note.textContent = `${analysis.spin.length} framing signal${analysis.spin.length === 1 ? '' : 's'} across ${analysis.text.length.toLocaleString()} characters / analysed ${timeAgo(analysis.analyzedAt)}`;
  }

  const aiHost = view.querySelector('#ai-bias-body');
  if (aiHost) {
    aiHost.innerHTML = `
      <p class="small"><strong>${esc(analysis.biasRating || 'Center')}</strong>
        <span class="muted">/ ${Number(analysis.biasPercentage || 0)}% of the framing weight</span></p>
      ${biasMeterHtml(analysis.bias)}
      ${biasHtml(analysis.bias)}
      <button class="link-btn" id="why-score" aria-expanded="false">Why this score?</button>
      <p class="rationale" id="why-score-note" hidden>${esc(analysis.biasRationale || 'The score comes from the article text and the outlet prior.')}</p>
      <p class="muted small">Scored from the wording of this article, not from the outlet's reputation.</p>`;
    aiHost.querySelector('#why-score')?.addEventListener('click', (event) => {
      const why = aiHost.querySelector('#why-score-note');
      const opening = why.hidden;
      why.hidden = !opening;
      event.currentTarget.setAttribute('aria-expanded', String(opening));
      event.currentTarget.textContent = opening ? 'Hide the rationale' : 'Why this score?';
    });
  }

  const panel = view.querySelector('#analysis-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="panel-head">
      <h2>AI X-Ray</h2>
      ${methodBadge(analysis)}
    </div>
    ${analysis.degraded ? `<p class="notice">${esc(analysis.reason || 'Analysis ran without the language model.')}</p>` : ''}
    ${analysis.note ? `<p class="muted small">${esc(analysis.note)}</p>` : ''}
    <h3>Bias breakdown</h3>
    <p class="small"><strong>${esc(analysis.biasRating || 'Center')}</strong> <span class="muted">/ ${Number(analysis.biasPercentage || 0)}% dominant share</span></p>
    ${biasHtml(analysis.bias)}
    <p class="muted small">How this article frames the story across the spectrum — not a verdict on the outlet.</p>
    ${(analysis.keyTopics || []).length
    ? `<h3>Key topics</h3><p class="small">${analysis.keyTopics.map((topic) => `<span class="chip">${esc(topic)}</span>`).join(' ')}</p>`
    : ''}
    ${spinListHtml(analysis.spin)}
    <p class="muted small">Hover a highlight to read why it was flagged. ${analysis.method === 'llm'
    ? 'Highlights are model-selected; offsets are verified against the source text.'
    : 'Offline mode uses a transparent lexical list, so treat it as indicative.'}</p>`;
}

function mountAnalysisError(error, story) {
  const body = view.querySelector('#xray-body');
  const text = fallbackTextFor(story);
  if (body) {
    body.replaceChildren(renderXRay(text || 'The archived excerpt is empty.', []));
  }
  const note = view.querySelector('#xray-note');
  if (note) note.textContent = 'Highlights unavailable — showing the archived excerpt.';

  const quick = view.querySelector('#quick-context-text');
  if (quick) quick.textContent = cut(text, 300) || 'No summary is available for this story.';

  const aiHost = view.querySelector('#ai-bias-body');
  if (aiHost) {
    aiHost.innerHTML = '<p class="notice">The article text could not be scored right now. Source coverage is still available.</p>';
  }

  const panel = view.querySelector('#analysis-panel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="panel-head"><h2>AI X-Ray</h2><span class="badge danger">Unavailable</span></div>
    <p class="notice">${esc(error.message || 'The analysis service did not respond.')}${error.retryAfter ? ` Try again in about ${error.retryAfter}s.` : ''}</p>
    <button class="ghost small" id="retry-analysis">Run the analysis again</button>`;
  panel.querySelector('#retry-analysis')?.addEventListener('click', () => {
    state.analyses.delete(story.id);
    renderReader(story.id);
  });
}

/* ------------------------------------------------------------------- drawer */

async function openDrawer(id) {
  drawer.classList.add('open');
  scrim.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('locked');
  drawerTitle.textContent = 'Global framing';
  drawerBody.innerHTML = '<p class="muted">Loading ownership and comparative headlines…</p>';

  try {
    const story = state.stories.get(id) || await api.story(id);
    state.stories.set(id, story);
    drawerTitle.textContent = cut(story.title, 70);
    const [framing, holder] = await Promise.all([
      api.framing(id).catch(() => null),
      api.stakeholder(story.source).catch(() => null),
    ]);
    drawerBody.innerHTML = drawerHtml(story, framing, holder);
  } catch (error) {
    drawerBody.innerHTML = `<p class="notice">${esc(error.message || 'Could not load framing data.')}</p>`;
  }
}

function ownershipHtml(holder) {
  if (!holder) return '<p class="muted small">Ownership data unavailable.</p>';
  return `
    <ol class="chain">
      ${(holder.ownershipChain || []).map((node) => `<li>${esc(node)}</li>`).join('') || '<li>Unknown owner</li>'}
    </ol>
    <div class="chips">
      <span class="chip">${esc(holder.fundingType)}</span>
      ${holder.nonprofit ? '<span class="chip">Nonprofit</span>' : ''}
      <span class="chip">Lean: ${esc(leanLabel(holder.lean))}</span>
      <span class="chip">Factuality: ${esc(leanLabel(holder.factuality))}</span>
    </div>
    <h4>Major funders</h4>
    <ul>${(holder.majorFunders || []).map((funder) => `<li>${esc(funder)}</li>`).join('') || '<li class="muted">Not disclosed</li>'}</ul>
    <p class="muted small">${esc(holder.note || '')}</p>
    ${(holder.ratings || []).length ? `<p class="muted small">Ratings drawn from: ${esc(holder.ratings.join(', '))}.</p>` : ''}`;
}

function drawerHtml(story, framing, holder) {
  const groupBlock = (key, label) => {
    const rows = framing?.groups?.[key] || [];
    return `
      <div class="frame-group">
        <h3>${label} <span class="muted small">${rows.length}</span></h3>
        ${rows.length
    ? `<ul>${rows.map((row) => `
            <li>
              <a href="${esc(row.url)}" target="_blank" rel="noopener">${esc(cut(row.title, 120))}</a>
              <span class="muted small">${esc(row.source)} / ${esc(leanLabel(row.lean))}</span>
            </li>`).join('')}</ul>`
    : '<p class="muted small">No headline from this side of the spectrum in the cluster.</p>'}
      </div>`;
  };

  return `
    <section>
      <h3>Publication</h3>
      <p><strong>${esc(holder?.publicationName || story.source)}</strong></p>
      <p class="muted small">${esc(holder?.parentCompany || 'Parent company unknown')}</p>
      ${ownershipHtml(holder)}
    </section>
    <section>
      <h3>Comparative headlines</h3>
      ${framing
    ? `<p class="muted small">${esc(framing.consensus.note)} ${framing.blindspot
      ? 'This is a blindspot story: one side barely covered it.' : ''}</p>
         ${framing.consensus.terms.length
      ? `<p class="small">Shared framing: ${framing.consensus.terms.map((term) => `<span class="chip">${esc(term)}</span>`).join(' ')}</p>`
      : ''}
         ${groupBlock('left', 'Left')}
         ${groupBlock('center', 'Centre')}
         ${groupBlock('right', 'Right')}`
    : '<p class="muted small">Comparative headlines are unavailable for this story.</p>'}
    </section>
    <section>
      <h3>Read the primary report</h3>
      ${story.url
    ? `<p class="small"><a href="${esc(story.url)}" target="_blank" rel="noopener">${esc(cut(story.title, 90))} ${icon('arrow-up-right-01')}</a></p>`
    : '<p class="muted small">No source link archived.</p>'}
      <p class="muted small">Ownership data is indicative and compiled from publisher disclosures and public rating providers.</p>
    </section>`;
}

function closeDrawer() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  if (!modal.classList.contains('open')) {
    scrim.classList.remove('open');
    document.body.classList.remove('locked');
  }
}

/* ------------------------------------------------------------------- balance */

function balanceHtml(summary, recs) {
  const dist = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']]
    .map(([key, label]) => `
      <div class="dist-row">
        <span>${label}</span>
        <div class="track"><span class="fill lean-${key}" style="width:${summary.shares[key]}%"></span></div>
        <b>${summary.shares[key]}%</b>
      </div>`).join('');

  return `
    <div class="balance-head">
      <div class="score">
        <span class="score-value">${summary.score}</span>
        <span class="score-label">Balance score / 7 days</span>
        <div class="score-meter" aria-hidden="true">
          ${[['left', summary.shares.left], ['center', summary.shares.center], ['right', summary.shares.right]]
    .filter(([, share]) => share > 0)
    .map(([key, share]) => `<span class="meter-seg lean-${key}" style="width:${share}%"></span>`)
    .join('')}
        </div>
      </div>
      <div>
        <h2 id="modal-title">Cognitive balance</h2>
        <p class="muted">${summary.total} article${summary.total === 1 ? '' : 's'} in the last 7 days / ${esc(summary.label)}</p>
        <p class="muted small">A third left, a third centre, a third right is the target. The score measures how close your reading sits to that split.</p>
      </div>
    </div>
    <div class="dist">${dist}</div>
    ${summary.total < 3 ? '<p class="notice">Read at least three stories before the score means much.</p>' : ''}
    <h3>Counter-perspectives to try</h3>
    <ul class="recs">
      ${recs.length
    ? recs.map((article) => `
        <li>
          <a href="#/story/${esc(article.id)}" data-close-modal>${esc(cut(article.title, 110))}</a>
          <span class="muted small">${esc(article.source)} / ${esc(leanLabel(article.lean))} / ${article.coverage} outlet${article.coverage === 1 ? '' : 's'}</span>
        </li>`).join('')
    : '<li class="muted small">No unread stories in the current feed — refresh the dashboard for more.</li>'}
    </ul>
    <div class="modal-actions">
      <button class="ghost small" id="clear-history">Clear reading history</button>
    </div>`;
}

async function openBalance() {
  modal.classList.add('open');
  scrim.classList.add('open');
  document.body.classList.add('locked');
  modalBody.innerHTML = '<p class="muted">Calculating your balance score…</p>';

  let articles = state.feed.articles || [];
  if (!articles.length) {
    try {
      const news = await api.news({ limit: 60 });
      state.feed = news;
      articles = news.articles || [];
    } catch { /* the score still works without recommendations */ }
  }

  const history = readHistory();
  modalBody.innerHTML = balanceHtml(balanceSummary(history), recommendations(articles, history));
  modalBody.querySelector('#clear-history')?.addEventListener('click', () => {
    clearHistory();
    modalBody.innerHTML = balanceHtml(balanceSummary([]), recommendations(articles, []));
    bindBalanceLinks();
    toast('Reading history cleared.');
  });
  bindBalanceLinks();
}

function bindBalanceLinks() {
  modalBody.querySelectorAll('[data-close-modal]').forEach((link) => {
    link.addEventListener('click', () => closeModal());
  });
}

function closeModal() {
  modal.classList.remove('open');
  if (!drawer.classList.contains('open')) {
    scrim.classList.remove('open');
    document.body.classList.remove('locked');
  }
}

/* ------------------------------------------------------------------ tooltip */

function showTooltip(mark) {
  const tag = mark.dataset.tag || 'Framing';
  const note = mark.dataset.note || '';
  const valence = Number(mark.dataset.valence) || 0;
  const direction = valence < -0.15 ? 'left-leaning framing'
    : valence > 0.15 ? 'right-leaning framing'
      : 'neutral framing';

  tooltip.innerHTML = `
    <span class="tag">${esc(tag)}</span>
    <p>${esc(note)}</p>
    <span class="valence">${esc(direction)} / score ${valence.toFixed(2)}</span>`;
  tooltip.hidden = false;

  const rect = mark.getBoundingClientRect();
  const box = tooltip.getBoundingClientRect();
  const left = Math.min(
    window.innerWidth - box.width - 12,
    Math.max(12, rect.left + rect.width / 2 - box.width / 2),
  );
  let top = rect.top - box.height - 10;
  if (top < 8) top = Math.min(window.innerHeight - box.height - 12, rect.bottom + 10);
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  mark.classList.add('active');
}

function hideTooltip() {
  tooltip.hidden = true;
  view.querySelectorAll('mark.spin.active').forEach((mark) => mark.classList.remove('active'));
}

/* -------------------------------------------------------------------- images */

const ogCache = new Map();

// Cards and reader images start on the category placeholder. Once one is near
// the viewport, ask the server for the publisher's og:image and swap it in. The
// server caches the lookup for a week, so each article costs at most one request.
function upgradeImages() {
  const images = [...view.querySelectorAll('img[data-og]')].slice(0, 14);
  if (!images.length || !('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const img = entry.target;
      const url = img.dataset.og;
      observer.unobserve(img);
      delete img.dataset.og;
      if (!url) continue;

      const apply = (image) => {
        if (!image) return;
        img.src = image;
        img.classList.add('og');
      };
      if (ogCache.has(url)) { apply(ogCache.get(url)); continue; }

      fetch(`/api/image?u=${encodeURIComponent(url)}`)
        .then((res) => (res.ok ? res.json() : { image: null }))
        .then((body) => {
          ogCache.set(url, body.image || null);
          apply(body.image);
        })
        .catch(() => ogCache.set(url, null));
    }
  }, { rootMargin: '320px' });

  images.forEach((img) => observer.observe(img));
}

/* -------------------------------------------------------------------- wiring */

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const next = theme === 'dark' ? 'light' : 'dark';
  themeBtn.innerHTML = `${icon(next === 'light' ? 'sun-01' : 'moon')}<span>${next === 'light' ? 'Light' : 'Dark'}</span>`;
  themeBtn.setAttribute('aria-label', `Switch to ${next} theme`);
  try { localStorage.setItem('nindan.theme', theme); } catch { /* ignore */ }
}

function route() {
  closeDrawer();
  closeModal();
  hideTooltip();
  const hash = location.hash || '#/';
  const match = hash.match(/^#\/story\/([\w-]+)/);
  if (match) renderReader(match[1]);
  else renderDashboard();
}

themeBtn.addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

consensusBtn.addEventListener('click', () => {
  state.consensus = !state.consensus;
  consensusBtn.setAttribute('aria-pressed', String(state.consensus));
  consensusBtn.classList.toggle('active', state.consensus);
  try { localStorage.setItem('nindan.consensus', state.consensus ? '1' : '0'); } catch { /* ignore */ }
  applyConsensus();
});

document.getElementById('balance-open').addEventListener('click', openBalance);
document.getElementById('drawer-close').addEventListener('click', closeDrawer);
document.getElementById('modal-close').addEventListener('click', closeModal);
scrim.addEventListener('click', () => { closeDrawer(); closeModal(); });

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideTooltip();
    if (modal.classList.contains('open')) closeModal();
    else if (drawer.classList.contains('open')) closeDrawer();
  }
});

document.addEventListener('mouseover', (event) => {
  const mark = event.target.closest?.('mark.spin');
  if (mark) showTooltip(mark);
});
document.addEventListener('mouseout', (event) => {
  const mark = event.target.closest?.('mark.spin');
  if (mark && !mark.contains(event.relatedTarget)) hideTooltip();
});
document.addEventListener('focusin', (event) => {
  const mark = event.target.closest?.('mark.spin');
  if (mark) showTooltip(mark);
});
document.addEventListener('focusout', (event) => {
  if (event.target.closest?.('mark.spin')) hideTooltip();
});
window.addEventListener('scroll', hideTooltip, { passive: true });

// Clicking a framing signal scrolls to the matching highlight.
view.addEventListener('click', (event) => {
  const link = event.target.closest?.('.spin-link');
  if (!link) return;
  const start = link.dataset.start;
  const mark = view.querySelector(`mark.spin[data-start="${CSS.escape(start)}"]`);
  if (!mark) return;
  mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
  mark.classList.add('active');
  showTooltip(mark);
});

window.addEventListener('hashchange', route);

const initialTheme = localStorage.getItem('nindan.theme')
  || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
setTheme(initialTheme);
consensusBtn.setAttribute('aria-pressed', String(state.consensus));
consensusBtn.classList.toggle('active', state.consensus);
route();
