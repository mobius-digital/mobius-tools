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

## Build status: EVERYTHING IS SHIPPED (phases 0–5 + extras, 2026-08-20)

All four pages, Overview, Settings, Summarise (Claude), share links, per-brand
Slack alerts, KPI guardrails, intraday pacing,
auto-suggested reasons, in-app help guides, **Daily Brief** (Chat 5 —
CTC-style forecast-vs-actual with Claude narrative, auto-posts 14:00 UTC per
enabled brand). Secrets set: META_TOKEN, ANTHROPIC_API_KEY, SLACK_BOT_TOKEN,
TW_API_KEY, ADMIN_TOKEN, SESSION_SECRET.

Cole's remaining step for the Daily Brief: per client, set monthly goals on
the Daily Brief page (net sales + spend at minimum) and flip auto-post on.

## Later additions (2026-08-20 night)

- **Per-ad table** on Creative Rotation: `adBreakdown()` rolls up `ad_daily`
  for the window and verdicts each ad against the ACCOUNT'S OWN window CPA
  (scale ≤0.8×, cut ≥1.4× or spend with zero purchases). Never absolute
  benchmarks.
- **`deliveryAlerts()`**: yesterday's spend vs the account's L7 median; ≤40%
  (or zero) prepends a 🚨 line to that brand's nightly Slack alert. Guards:
  ≥4 days of history, median ≥ $50.
- Ad backfill slices: 8 per nightly run, 3 per Creative-Rotation visit.

## Hard-won rules (do not relearn these)

- **Triple Whale summary-page** (`twSummary`): metrics live in `metrics[]` with
  `values.current` + per-day `charts.current` where `x` = ZERO-based
  day-of-year in the shop tz — one monthly call yields daily series
  (`twDailySeries` → `tw_daily`). Known ids: `netSales`, `totalSales`,
  `newCustomerSales`, `rcRevenue`, `blendedAds` (all-platform spend),
  `ga_adCost` (Google spend), `grossProfit`, `totalProductCosts` (COGS),
  `totalPaymentGatewayCosts`. new + returning sums to `totalSales`.
- **Daily Brief math**: aMER = new-customer revenue ÷ blended spend; CM basis
  chain = cm_pct override → grossProfit − fees − spend → netSales − COGS −
  fees − spend; forecast weights = trailing-28d day-of-week shares frozen at
  month start.
- **Never state Contribution Margin from unvalidated COGS.** Triple Whale returns
  cost data even when the client has only costed *some* SKUs, which produces wild
  daily margin swings and negative days. `judgeCogs()` gates it; broken clients get
  CM stripped from the brief, the UI and the narrative prompt. Grunk Dolfer is the
  live example. A `cm_pct` goal override is the escape hatch.
- **claude-opus-5 spends thinking tokens INSIDE max_tokens** — a "1200-token"
  call returns truncated text mid-sentence. Give narrative calls ≥6000.

- **Scope rule (Cole, 2026-08-20, after trying the alternative): the four Meta
  pages + Overview are 100% META-ONLY.** Every number there matches Ads Manager.
  Google spend was folded into Pacing/Overview money and then REMOVED — mixing
  sources made it impossible to tell what was Meta at a glance. Triple Whale is
  used ONLY by the Daily Brief page (store-level money, clearly labelled) and by
  `syncTwDaily`. Do not reintroduce blended/Google numbers into the Meta pages;
  a separate Google dashboard is the agreed path if that's ever wanted.
- **Cole's UX rules** (see memory `ui-preferences`): media-buyer vocabulary
  (CPA/ROAS — never dumb down terms like "fresh/stale"), conclusion-first
  sentences, questions as titles, click-openable ⓘ on every stat, crosshair
  readouts on every chart (hover AND tap), "? How to use" guide per page,
  in-app modals only, zero required daily clicks, no unread-count badges.
- **Meta data traps:** budget `extra_data` comes flat or as `composite_data`
  (cents, nested); never print long/JSON old→new values in summaries;
  `asa_auto*` audiences + renames auto-dismiss (confirmed=-1); ad-level pulls
  must be sliced (14d) and resumable; ads older than the history window need
  `created_time` as their age origin.
- **Windows/tooling:** deploy ONLY from `account-health/worker/` (running
  wrangler at repo root scaffolds junk `wrangler.jsonc` — delete it and restore
  `.gitignore` if it happens); PowerShell 5.1 for Cole = `;` not `&&`; commit
  messages via `git commit -F <file>`; D1 repairs via wrangler pull → node →
  UPDATE .sql file; Cloudflare API sometimes throws transient 7403 — retry.

## Meta API notes

- Graph v23.0, token in `META_TOKEN`. Helpers: `meta(env, path, params)`,
  `metaAll()` (follows paging). Purchases = first present of
  `omni_purchase` / `purchase` / `offsite_conversion.fb_pixel_purchase`.
- Activity log `extra_data` is a JSON string; budgets are in **cents**.
  Classification lives in `CATEGORIES` + `summarise()` — extend there.
- Insights for the last ~72h keep changing; always upsert, never insert-ignore.
