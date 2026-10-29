# Dispatch – news aggregator (React + Tailwind + Express)

## Structure
```
news-aggregator/
├─ .env.example            (copy to server/.env)
├─ package.json            root scripts
├─ server/src/
│  ├─ feeds.js             RSS feed list (source, region, category)
│  ├─ bias.js              editorial-lean + factuality ratings per publisher
│  ├─ store.js             disk archive (server/data/archive.json) + day helpers
│  ├─ fetcher.js           fetch, normalize, excerpt, dedupe/coverage, optional API adapters
│  └─ server.js            Express API, 20-min cron refresh, serves client build
└─ client/src/
   ├─ App.jsx              shell, ticker, filters, home feed, coverage rail, dark mode
   ├─ StoryPage.jsx        full article page: summary, key points, coverage by lean
   ├─ ui.jsx               cards, bias chips, coverage bar, API helpers
   ├─ router.jsx           small History-API router for /story/:id URLs
   └─ main.jsx, index.css  (vite/tailwind/postcss config at client/)
```

## Run locally (Node 18+)
```
npm run install:all
cp .env.example server/.env
npm run dev:server        # terminal 1 -> http://localhost:3001
npm run dev:client        # terminal 2 -> http://localhost:5173
```
Production: `npm run build && npm start` (Express serves client/dist on one port).

## Pages
- `/` — today's feed for India/World with category, source and date filters, breaking ticker and a coverage rail.
- `/story/:id` — full story page (summary, key points, coverage by editorial lean, outbound link, related stories).

## API
`GET /api/news?region=india|world&category=&source=&date=YYYY-MM-DD&q=&limit=&offset=&tz=330`,
`GET /api/news/:id`, `GET /api/days?tz=330`, `GET /api/meta`, `GET /api/breaking`

`tz` is minutes east of UTC (IST = 330). Dates are matched against the reader's local day, not UTC.

## Deploy
**Render (simplest, one service):** push to GitHub → New Web Service → Build: `npm run install:all && npm run build` → Start: `npm start` → add env vars from `.env.example`.
Note: free Render instances sleep, so the first request after idle waits for a refresh.

**Vercel/Netlify (client only) + Render (API):** deploy the API on Render as above and set `CLIENT_ORIGIN` to your site URL.
In `client/`, set root directory `client`, build `npm run build`, output `dist`.
Add a rewrite from `/api/*` to `https://<your-render-app>.onrender.com/api/*`
(Vercel: `vercel.json` `rewrites`; Netlify: `_redirects` line `/api/* https://<app>.onrender.com/api/:splat 200`).
Don't deploy the Express server on serverless functions: the in-memory cache and cron need a long-running process.

## Notes
- Reuters, AP and PTI have no public RSS. Set `NEWSAPI_KEY`, `GNEWS_API_KEY` and/or `NEWSDATA_API_KEY` in `server/.env` and they arrive through those free-API adapters (same article shape, deduped against RSS).
- API results are cached for `API_REFRESH_MINUTES` (default 60) independently of the RSS loop, so free tiers aren't burned by the 20-minute refresh.
- `GET /api/meta` returns `apiSources` listing the API adapters that are active.
- Detail view shows the publisher's own excerpt plus extractive key points (first sentences), not a generated summary. No full articles are stored or shown.
- Duplicates are matched by headline word overlap; tune the 0.55 threshold in `dedupe()`.
- Past days survive refreshes: every fetch is merged into `server/data/archive.json` (retention `ARCHIVE_DAYS`, default 14). Delete that file to reset the archive.
- Coverage is clustered in `dedupe()` by shared distinctive headline words (3+ shared, 50% containment). Tune `shared`/`score` there if you see over- or under-merging.
- Lean ratings live in `server/src/bias.js` and are indicative publication-level ratings (AllSides/Ad Fontes style), not per-article judgements.
