# Mobius Account Health — PRD

One tool, four pages, built across five chats. Inspired by a set of internal
dashboards (Pacing / Change Log / Creative Rotation / Averages) — each page
answers **one question a media buyer asks every day**, for **every client at
once**.

Live at `https://tools.go-mobius-digital.com/account-health/` once deployed.

---

## The four questions

| Page | Question | Horizon |
|---|---|---|
| **Pacing** | Is spend on track — today vs the last-7-day curve, and month-to-date vs the client's budget and vs last month? | hours / month |
| **Change Log** | What did we change on this account, when, and why? Write the daily/weekly update from it. | the record |
| **Averages** | Is CPA / ROAS / CTR / CPM / thumbstop really trending, or was that one bad day? 7-day vs 30-day moving averages, with changes marked on the chart. | weeks |
| **Creative Rotation** | Is new creative getting spend, and does fresh beat stale? | months |

Plus an **Overview** (all clients in one table) and **Settings** (accounts,
budgets, password).

---

## Build plan (one chat per row)

| Chat | Scope | Status |
|---|---|---|
| 0 | Foundation: this PRD, CLAUDE.md, Worker + D1, nightly sync of daily insights + activities, dashboard shell (gate, client picker, Overview, Settings), README | ✅ built 2026-08-19 — awaiting Meta token |
| 1 | Change Log page: feed, type filters, search, reason tag + confirm, manual add, **Summarise** (Claude → daily / weekly update) | ✅ built 2026-08-20 — needs `ANTHROPIC_API_KEY` secret for Summarise |
| 2 | Averages page (7v30 cards, 3/7/14/30 table, change-log strip) + MTD Pacing (vs budget, vs last month) + Slack off-pace alert + per-client share link | ✅ built 2026-08-20 — Slack alerts need `SLACK_BOT_TOKEN` secret + channel in Settings |
| 3 | Creative Rotation: ad-level pulls with first-spend date, freshness %, spend-weighted age, fresh vs stale CPA, weekly age-bucket bars | ✅ built 2026-08-20 — first visit auto-kicks the 90d ad-level backfill |
| 4 | Intraday Pacing (hourly curves), all-clients pacing row, alert polish, handoff docs | ⬜ |

Chats 3 and 4 are optional; the tool is already useful after Chat 2.

---

## Decisions (made in Chat 0)

- **Numbers come from Meta** (Marketing API), not Triple Whale. Reason: the
  Change Log (activity log), intraday pacing (hourly breakdown) and creative
  age (ad launch dates) only exist in Meta. Triple Whale can be layered on
  later for "true" revenue if wanted; keep the schema source-agnostic
  (`source` column) so that's additive.
- **Conversion = `purchase`** (`actions` / `action_values` with
  `action_type` in `purchase`, `omni_purchase`, `offsite_conversion.fb_pixel_purchase`
  — first one present wins, no double counting). Thumbstop = 3-second video
  plays (`video_view`) ÷ impressions.
- **Re-pull the last 3 days every night** — Meta conversions arrive late, so
  yesterday's CPA always improves for ~72h. The dashboard labels the most
  recent 3 days as "settling".
- **Budgets live in Settings**, per account per month (a default monthly
  budget plus optional month overrides). Not required to get started.
- **One Meta system-user token** (`META_TOKEN` secret) with `ads_read`
  across all client ad accounts. The Worker discovers the accounts itself via
  `/me/adaccounts`; you just toggle which ones are active.
- **Stack** mirrors Pulse / Restock: Cloudflare Worker (cron + API) + D1
  (SQLite) + one static `index.html` on GitHub Pages + the existing Slack bot.
  Auth: dashboard password (hash in D1) or `ADMIN_TOKEN` master key.
- **Currency** is per account (Meta reports it); the Overview shows each
  client in its own currency and never sums across currencies.

---

## Data model (D1)

```
accounts          act_id PK, name, currency, tz, active, monthly_budget, budgets_json, added_at, last_sync_*
daily_insights    act_id, date, spend, impressions, clicks, link_clicks, purchases, revenue, video_views, reach,
                  synced_at          — PK(act_id, date)
hourly_insights   act_id, date, hour, spend, impressions, purchases, revenue   — PK(act_id, date, hour)   (Chat 4)
activities        id PK (Meta event id), act_id, event_time, event_type, translated, actor, object_type, object_id,
                  object_name, extra_json, category, reason, note, confirmed, manual, created_at
ad_daily          act_id, ad_id, date, spend, impressions, purchases, revenue       — PK(act_id, ad_id, date)  (Chat 3)
ads               act_id, ad_id PK, name, adset_id, campaign_id, created_time, first_spend_date, status
settings          key PK, value
```

`activities.category` is the auto-classified type (new_creative, new_adset,
new_campaign, ad_paused, ad_relaunched, campaign_paused, budget, targeting,
bid_strategy, optimisation, other). `reason` is the human tag (Chat 1).

## Worker API (Bearer auth on everything except /health)

```
GET  /health
GET  /api/accounts                         discovered + configured accounts
PUT  /api/accounts/:act_id                 {active, name, monthly_budget, budgets_json}
POST /api/discover                         re-pull /me/adaccounts from Meta
POST /api/sync?act=&days=                  backfill one/all accounts (insights + activities)
GET  /api/insights?act=&from=&to=          daily rows
GET  /api/overview                         all active accounts: MTD spend, budget pace, 7d/30d CPA & ROAS
GET  /api/activities?act=&from=&to=        act='all' (or omitted) = every active account, rows carry account_name
PATCH /api/activities/:id                  {reason, note, confirmed, dismissed, category} — any subset
                                           confirmed: 1 deliberate / 0 untouched / -1 dismissed (noise, excluded from summaries)
POST /api/activities/bulk-confirm          {ids: [...]} → sets confirmed=1 where currently 0
POST /api/activities                       manual entry {act_id, event_time, category, summary, reason, note, actor}
POST /api/summarise                        {act|'all', from, to, template: daily|weekly|client} → Claude-written update
                                           (claude-opus-5; needs ANTHROPIC_API_KEY secret; 'client' needs one account)
GET  /api/series?act=&days=                daily rows + chart-strip events (budget/launch/pause/manual)
POST /api/share                            {act_id} → stable read-only link (?share=token); DELETE revokes
GET  /api/share/:token                     NO auth — read-only bundle for the client view
GET  /api/creative?act=&fresh=&window=     freshness cards + weekly age buckets + freshness-vs-CPA (auto-kicks backfill when empty)
GET  /api/slack-channels                   channel list for the Settings dropdown
GET/PUT /api/settings                      {slackChannel, paceAlertPct}; nightly() posts Slack pace + KPI alerts
POST /api/slack-test                       posts a test message to the configured channel
PUT  /api/password                         {password}
```

## Nightly cron (03:30 UTC)

For each active account: pull daily insights for the last 3 days (upsert),
pull activities since `last_sync_activities` (insert-ignore by id), classify,
store. First sync of a new account backfills 90 days.

---

## Meta API reference (v23.0)

- Discover: `GET /me/adaccounts?fields=id,account_id,name,currency,timezone_name,account_status`
- Daily: `GET /act_X/insights?level=account&time_increment=1&time_range={"since","until"}&fields=spend,impressions,reach,clicks,inline_link_clicks,actions,action_values`
- Hourly (Chat 4): same + `breakdowns=hourly_stats_aggregated_by_advertiser_time_zone`
- Ad level (Chat 3): `level=ad&fields=ad_id,ad_name,adset_id,campaign_id,spend,impressions,actions,action_values`
- Activities: `GET /act_X/activities?fields=event_time,event_type,translated_event_type,actor_name,object_type,object_id,object_name,extra_data&since=&until=&limit=500`
