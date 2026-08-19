# Account Health — instructions for Claude Code

Multi-client Meta ads health dashboard for Mobius Digital: Pacing, Change Log,
Averages, Creative Rotation + an all-clients Overview. **Read `PRD.md` first** —
it holds the four questions, the build plan (one chat per page), the decisions
already made, the D1 schema and the worker API. Don't re-litigate decisions
listed there; extend them.

## Layout

```
account-health/
  PRD.md              plan, decisions, schema, API   ← source of truth
  CLAUDE.md           this file
  index.html          the whole dashboard (vanilla JS, one file, GitHub Pages)
  worker/
    wrangler.toml     worker name mobius-account-health, D1 binding DB, nightly cron
    schema.sql        D1 schema (idempotent; re-run after adding tables)
    src/worker.js     Meta sync + JSON API
    README.md         human setup steps (Meta token etc.)
```

## Conventions (match Pulse / Restock)

- Worker: plain JS module, `export default { scheduled, fetch }`, `json()` +
  `CORS` helpers, Bearer auth via `isAdmin()` (ADMIN_TOKEN secret or password
  hash in `settings`). New routes go in the `fetch` switch; new sync jobs are
  functions called from `syncAccount()` / `nightly()`.
- Dashboard: single `index.html`, no build step, Instrument Sans/Serif, the
  `:root` palette already in the file. State in `S`, `api()` helper, one
  `renderX()` per tab, tabs registered in `show()`. Keep the client picker
  (`S.act`, `'all'` = all clients) working on every page.
- Money is per-account currency (`fmtMoney/fmtK(n, cur)`); never sum across
  currencies. Deltas: `delta(cur, prev, lowerIsBetter)`.
- Windows: `npx.cmd wrangler …` (PowerShell blocks `npx`). Deploy from
  `account-health/worker/`: `npx.cmd wrangler deploy`. Schema changes:
  `npx.cmd wrangler d1 execute mobius-account-health --remote --file=schema.sql`.
- Dashboard deploys by committing `index.html` (GitHub Pages).

## Where each chat plugs in

| Chat | Worker | Dashboard |
|---|---|---|
| 1 Change Log | routes already exist (`GET/POST /api/activities`, `PATCH /api/activities/:id`); add `POST /api/summarise` (Claude API call over activities + insights) | replace `renderChangeLog()` with the full page: date chips, type filters, search, reason dropdown + ✓/✗ confirm, "+ Add", Summarise with templates |
| 2 Averages + MTD Pacing | add `GET /api/series?act=&days=` returning daily rows + activities for the strip; Slack off-pace alert in `nightly()`; `GET /api/share/:token` read-only | `renderAverages()` (7v30 cards with sparklines, 3/7/14/30 table), `renderPacing()` MTD section, share link |
| 3 Creative Rotation | `syncAdDaily()` (level=ad insights → `ad_daily`, `ads` with first_spend_date), `GET /api/creative?act=&fresh=14&window=14` | `renderCreative()` |
| 4 Intraday Pacing | `syncHourly()` (breakdown hourly_stats_aggregated_by_advertiser_time_zone → `hourly_insights`) pulled on demand from the page, `GET /api/pacing?act=&date=` | today-vs-L7 curve in `renderPacing()`, all-clients pacing row |

When a chat finishes, tick its row in `PRD.md` → Build plan, and update the
`<span class="soon">` labels in `index.html`'s nav.

## Meta API notes

- Graph v23.0, token in `META_TOKEN`. Helpers: `meta(env, path, params)`,
  `metaAll()` (follows paging). Purchases = first present of
  `omni_purchase` / `purchase` / `offsite_conversion.fb_pixel_purchase`.
- Activity log `extra_data` is a JSON string; budgets are in **cents**.
  Classification lives in `CATEGORIES` + `summarise()` — extend there.
- Insights for the last ~72h keep changing; always upsert, never insert-ignore.
