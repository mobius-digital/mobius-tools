# Account Health — instructions for Claude Code

Multi-client Meta ads health dashboard for Mobius Digital: Pacing, Change Log,
Averages, Creative Rotation + an all-clients Overview. **META-ONLY, internal.**
Store-level money and all client-facing reporting live in `../profit/` (Mobius
Profit) — including the Daily Brief, which moved there 2026-08-21. **Read `PRD.md` first** —
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
auto-suggested reasons, in-app help guides. The **Daily Brief** shipped here in Chat 5 and **its interface
moved to Mobius Profit on 2026-08-21** — this worker still owns the engine (the
brief endpoints, the 14:00 UTC cron and the TW/Anthropic/Slack secrets), and Profit
calls them over a service binding. Do not re-add a Daily Brief tab here.
Secrets set: META_TOKEN, ANTHROPIC_API_KEY, SLACK_BOT_TOKEN,
TW_API_KEY, ADMIN_TOKEN, SESSION_SECRET.

Cole's remaining step for the Daily Brief: per client, set monthly goals on
the Daily Brief page (net sales + spend at minimum) and flip auto-post on.

## Weekly / Monthly reports (2026-08-27)

The client-facing weekly/monthly report ENGINE lives in this worker (same
placement logic as the Daily Brief: the TW/Anthropic/Slack secrets and the
crons are here; the account is at the 5-trigger limit). The INTERFACE is
Mobius Profit's Reports tab; `/api/reports`, `/api/report`,
`/api/report-generate`, `/api/report-summary`, `/api/report-send`,
`/api/report-link` are proxied from the profit worker. Rules that matter:

- **Reports are FROZEN snapshots** in the `reports` table (`data_json`).
  Drafted by the hourly cron inside the same Central-hour gate as the brief:
  Monday = last Mon–Sun, the 1st = last month. A failed brand retries every
  later tick that day (no row yet = retry). `makeReport` refuses to touch a
  report with `status='sent'` — the client has those numbers.
- **Nothing reaches a client automatically.** Drafts post ONLY to
  `accounts.report_channel` (or the global `reportChannel` setting) with NO
  fallback to slack_channel/brief_channel — as of 2026-08-27 every brand's
  alerts channel IS its client channel, so a fallback would put a draft in
  front of the client. The Send button (`sendReport`) posts to
  `brief_channel` and freezes the report.
- **`econDay` is the same CTC math as `briefData` and Profit's
  `dayEconomics`** (Total Sales − tax; CM = every variable cost; split
  rebased by share). Keep the three in step. Verified against raw tw_daily
  sums to the cent (Lucky, 2026-08-17→23).
- **`googleAllCpa` is Google's real $/conversion; `googleCpa` is NOT**
  (~0.17–0.19, some other ratio) — dividing spend by it fabricated
  thousands of conversions. Verified 2026-08-27.
- **`judgeCogs` now matches Profit's `judgeCosts` semantics** (−5%
  materiality floor; broken needs a PATTERN, negatives > max(1, n×0.1);
  isolated negatives = noisy, figures stand). The old any-negative=broken
  rule was silently stripping CM from Lucky's brief over marginal days.
  Do not let the two drift again.
- **Client archive links** live in `settings.reportTokens` (one stable
  token per brand → `profit/?reports=<tok>`); the profit worker serves
  `GET /api/report-view/:token` — SENT reports only, with cogs_quality /
  margin_28d / cm_pct / changes / account stripped from the payload.
- Channel sections auto-detect from data (a dormant channel with zeros is
  suppressed); per-brand exclusions in `accounts.report_config_json.hide`,
  weekly/monthly opt-outs in `.weekly`/`.monthly` (default on).

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
  `values.current` + per-day `charts.current` where **`x` is a ONE-BASED day of
  year** (Jan 1 = 1). Treating it as zero-based shifted every value one day into
  the future and silently reported yesterday's numbers as today's — Cole caught it
  because a client's MER did not match Triple Whale. ALWAYS verify a TW backfill by
  joining `tw_daily.fb_ads_spend` against `daily_insights.spend` for the same date;
  Meta's dates are authoritative and the two must match to the cent — one monthly call yields daily series
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
- **The brief engine also binds the launch-calendar D1 (`CAL`, read-only).**
  `calendarEvents`/`calendarWeights` lift forecast targets on launch and promo days.
  Weights are normalized, so the month still totals the goal — never let a change
  make the calendar inflate the plan. Mapping + multipliers live in
  `settings.calendarConfig`; the calendar board has no brand column, so it maps to
  exactly one act_id. A calendar failure must degrade silently, never break a brief.
- **claude-opus-5 spends thinking tokens INSIDE max_tokens** — a "1200-token"
  call returns truncated text mid-sentence. Give narrative calls ≥6000.

- **Scope rule (Cole, 2026-08-20, after trying the alternative): the four Meta
  pages + Overview are 100% META-ONLY.** Every number there matches Ads Manager.
  Google spend was folded into Pacing/Overview money and then REMOVED — mixing
  sources made it impossible to tell what was Meta at a glance. Triple Whale is
  used ONLY by the Daily Brief page (store-level money, clearly labeled) and by
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
- **The brief date comes from CENTRAL, never from the account's own timezone.** The
  clients are split across America/New_York and America/Los_Angeles. `dailyBriefs` used
  `localDate(a.tz)` - each brand's own yesterday - which was harmless while the trigger
  fired exactly once a day, because by 7am Central every US zone agrees on what
  yesterday was. The moment the trigger became hourly (so a missed send can recover)
  that broke: at MIDNIGHT EASTERN the three Eastern brands rolled into a new day, found
  no brief for it, and posted to client channels at 11pm Central. Cole got the Slacks.
  One clock governs the brief - the same one the send hour is set in - so the 23:00
  Central run asks for a date that is already sent and skips, and only the 07:00 run
  sends. **Any per-account time basis inside a globally-scheduled job will diverge the
  moment that job runs more than once a day.**
- **The hourly brief trigger fires AT OR AFTER the send hour, never exactly on it.**
  An exact `centralHour() === briefHour` match cannot recover from a single miss, and
  the misses are real: on 2026-08-24 the send time was changed from 9 to 7 somewhere
  between 7am and 8am Central, so 7 had already passed and 9 never came round again -
  every brand silently got no brief that day, and nothing anywhere said so. A dropped
  cron tick does the same. The gate is now `centralHour() >= briefHour`, and
  `dailyBriefs` checks `briefs.status = 'sent'` for the date BEFORE doing any work, so
  a brand already posted costs one SELECT rather than a 45-day Triple Whale sync. It
  cannot double post - `sendBrief`'s `skipIfSent` is still there - and `lastBriefRun`
  is only written when a run actually sent something, so it stays a record of the last
  real send instead of being overwritten hourly by no-ops.
