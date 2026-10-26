# Account Health — instructions for Claude Code

> **2026-08-27: THIS IS NOW A BACKEND-ONLY SERVICE.** The dashboard was merged
> into **Locus** (`../profit/`) and its Meta screens live in `../profit/meta.js` as
> the **Meta tab**; `index.html` here is just a redirect. The WORKER is
> unchanged and central — it owns the Meta sync, both cron triggers, the
> weekly/monthly report engine, the Daily Brief engine, and every secret
> (META_TOKEN, ANTHROPIC_API_KEY, SLACK_BOT_TOKEN, TW_API_KEY, SESSION_SECRET),
> and it is the auth server every Mobius tool delegates to. Edit the worker
> here; edit the screens in `../profit/`.


The Meta ads backend for Mobius: sync, change log, averages, creative rotation,
intraday pacing + the Daily Brief and weekly/monthly report engines.
**META-ONLY where it concerns ad data, internal.** Every screen it once served
now lives in `../profit/` — the Meta tab (`../profit/meta.js`), the Daily Brief
(moved 2026-08-21) and Reports (2026-08-27). **Read `PRD.md` first** —
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

- **EVERY ACTION EXISTS IN BOTH PLACES — Slack and Locus — AND NEITHER MAY GROW
  ONE THE OTHER LACKS.** Cole, 2026-09-07: "everything needs to be done from
  either in the app or in Slack, I want both, so I don't have to switch around."
  The draft cards `draftBrief` and `postReportDraft` post to the internal
  channel carry Block Kit buttons for all four: *Send to client*, *Edit the
  wording*, *Rewrite with AI*, *Don't send* (plus *Open in Locus*, and *Fix the
  numbers in Locus* in place of Send when the health verdict is `broken`).
  Adding an action to the Brief or Reports tab means adding it to `briefCard` /
  `reportCard` in the same change.
- **The D1 row is the truth; the Slack card is a VIEW of it.** `briefCard` and
  `reportCard` render purely from the stored row, and every mutation on either
  surface ends by calling `slackSyncBrief` / `slackSyncReport` (`briefs.slack_ts`
  + `slack_channel` say which message to rewrite). That is what stops a live
  *Send to client* button sitting in Slack under a brief that was already sent
  from the app. Any new mutation must sync too, or it leaves a lying card.
- **`/slack/actions` sits ABOVE the admin gate and its ONLY credential is the
  HMAC.** `verifySlackSig` (5-minute replay window, constant-time compare) fails
  closed with no `SLACK_SIGNING_SECRET`. Slack allows three seconds: buttons ack
  immediately and work in `ctx.waitUntil`, EXCEPT `views.open` which must happen
  inside the ack because a `trigger_id` expires.
- **(2026-10-14: the Ledger is now Cashew on ITS OWN Slack app, A0C99FUDBA8; its events and interactivity go to the `cashew-slack` router (`ledger/slack`), which forwards by channel to mobius-ledger or the Lucky worker; slack-router serves Locus and Pulse only. The paragraph below is history.)**
- **One Slack app, one interactivity URL, three tools.** The URL points at the
  LEDGER worker, which classifies and forwards: `{id, tax}` values are Ledger's,
  `brief_*` / `report_*` / `noop_open` action ids and modal callback ids come
  here over its `AUTH` binding, everything else goes to Pulse. Raw body and both
  signature headers are passed through, so each worker verifies for itself
  against the same app secret — which must therefore be set on all three.
- **A client send from Slack is Cole's alone by default** (`settings.slackSendWho`,
  `owner` | `anyone`, editable in Locus → Settings) because it posts under his own
  name via `SLACK_USER_TOKEN`. Edit / rewrite / don't-send stay open to the whole
  internal channel — none of them reach a client.
- **A rewrite can be STEERED, and the steer is optional on both surfaces.**
  `steerBlock()` appends the direction LAST in the prompt so it outranks the
  standing instructions, and explicitly forbids inventing a number. Stored on
  `briefs.steer` / `reports.steer`; a straight rewrite clears it. `upsertBrief`
  only touches `steer` when the caller passes the key, so a plain edit or a send
  cannot wipe it.
- **`ensureSlackColumns` is the migration**, guarded by `settings.schemaVersion`
  and swallowing "duplicate column" so re-running is harmless. It runs from
  `/slack/actions` and from `scheduled` — never tell Cole to paste ALTER
  statements, that is how a deploy half-lands.

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
- **Hook and hold rate (2026-08-29).** `ad_daily` carries `link_clicks`,
  `video_3s`, `video_thruplay`, `video_p100` from the Meta insights fields of
  the same names. Hook = `video_3s / impressions`, hold =
  `video_thruplay / video_3s`, both **gated on `v3 > 0`** so a row synced
  before these columns existed reads as "no data" rather than a 0% hook rate —
  an image ad and an unsynced video ad must not look alike. The columns were
  added after the original 90-day backfill, so `syncAdDaily` runs a SECOND
  resumable walk (`accounts.ads_video_done` / `ads_video_cursor`, 14-day
  slices, same shape as the first) until 90 days are refilled; a fresh account
  sets both flags at once. Old frozen reports never gain the fields, and the
  UI drops the three stats when they are absent.
- **The creative format split reads the ad NAME, and the guards are measured,
  not assumed.** The segment after the last `|` is the format. On Lucky's
  2026-08-17 week the real tags are UGC ($2,222 at 0.70x) and Still ($1,456 at
  2.32x) — but also `0616`, a shoot code, and 46 ads ($1,283, 24% of spend)
  with no pipe at all. Hence: a tag must contain a LETTER, a tag under 4% of ad
  spend folds into Untagged, Untagged always renders last, and the split ships
  only with 2+ material formats and **≥55%** of ad spend tagged. Do not raise
  that to 70% — Lucky runs 67% and is the case this exists for. Rows reconcile
  to 100% of ad-level spend, and `formats_tagged_share` states the coverage on
  the page.

## Later additions (2026-08-20 night)

- **Per-ad table** on Creative Rotation: `adBreakdown()` rolls up `ad_daily`
  for the window and verdicts each ad against the ACCOUNT'S OWN window CPA
  (scale ≤0.8×, cut ≥1.4× or spend with zero purchases). Never absolute
  benchmarks.
- **`deliveryAlerts()`**: yesterday's spend vs the account's L7 median; ≤40%
  (or zero) prepends a 🚨 line to that brand's nightly Slack alert. Guards:
  ≥4 days of history, median ≥ $50.
- Ad backfill slices: 8 per nightly run, 3 per Creative-Rotation visit.

## THE SUBREQUEST BUDGET — read this before touching any scheduled job (2026-09-01)

**Cloudflare counts every `fetch` AND every D1 query against ONE invocation.**
Free plan: **50**. Paid: **10,000**. D1 counting is the part that catches
people — this worker has 112 query sites and they all count.

Nothing counted them until 2026-09-01, and every scheduled job looped all six
brands doing 10–20 calls each. So each job ran flat into the ceiling and was
killed mid-brand; whatever ran first won and everything after got nothing.
Measured from the live DB, one morning's damage:

- the nightly synced **one** brand of six, and every TW + attribution sync failed;
- `daily_insights` sat a day stale, so the delivery check found no row for
  Dartee's yesterday, read `dayRow?.spend ?? 0` as **zero**, and alarmed about
  billing on a brand that had spent **$892.87**;
- the first Monday reports ran, all six generated with no narrative, posted to
  nobody, and recorded `ok: true` — hard-coded next to the caught error;
- nothing surfaced any of it for four days.

**The rules now, and do not undo them:**

- `meterEnv(env)` wraps the D1 binding **once per entry point** (`scheduled`
  and `fetch`), so all 112 sites count themselves and nothing added later can
  forget. Wrapped statements carry `__raw` because `batch()` needs the real
  objects — if you add a D1 method to the wrapper, unwrap it there too.
- Every outbound HTTP call goes through **`xfetch`**, never bare `fetch`.
- Every scheduled loop calls **`subCanAfford(COST_*)` BEFORE starting a brand**
  and defers it otherwise. Never mid-brand: the kill can land between the Slack
  post and the row that records it, which gives a client a message with no
  record and a duplicate next hour.
- **`SUB_RESERVE` (8) is not spare capacity.** It is what lets a job that ran
  out still write down that it ran out and post the alert. Every silent failure
  came from the bookkeeping being the thing that got cut off.
- **`SUB_USED` is module scope and MUST be reset at every entry point.** Warm
  isolates are reused. Concurrent requests share it, which only ever makes a job
  more conservative — safe by design, but do not "fix" it by removing the reset.
- **Ordering is by cost and time-criticality, not importance.** Delivery check →
  briefs → reports (at `briefHour + REPORT_HOUR_OFFSET`) → sync on the leftovers.
- **`discoverAccounts` goes LAST.** It walks 25 ad accounts and, running first,
  spent the whole night's allowance before one brand was synced. A new ad
  account arriving a day late costs nothing; a stale brand costs a false alarm
  in a client channel.
- Per-brand syncing lives on the **hourly** tick, **stalest first**
  (`ORDER BY last_sync_insights`). A brand that errored sorts to the front next
  hour on its own — the retry IS the ordering, not a separate mechanism.

**Upgrading to Workers Paid does NOT replace any of this.** It raises the
ceiling 200×, which is worth $5, but an uncounted loop still does not know where
the ceiling is: it moves the cliff to 60 clients and falls off it the same
silent way. Set `SUBREQUEST_LIMIT = "10000"` in `wrangler.toml` after upgrading
and every job simply finishes in one tick instead of two. That is the only
change needed.

**Where to look when something scheduled misbehaves:** Locus → Settings → *Are
the automatic jobs actually running?*, or `GET /api/schedule-health` (admin).
It reports per-brand data freshness, what each job did last run, and the
subrequests it used.

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
- **The summary-page WINDOW IS SHIFTED ONE DAY EARLIER than the dates you ask for,
  and `charts.current` is NOT.** Asking `period` 2026-08-29..2026-08-29 returns
  2026-08-28's totals; asking 08-24..08-30 returns 08-23..08-29. Verified 2026-08-30
  on Grunk Dolfer across four windows, matching `tw_daily` to the cent. `tw_daily` is
  the correct side — it is built from `charts.current`, which carries its own
  one-based day-of-year, and its `fb_ads_spend` matches Meta's own dated spend
  exactly. **Any PERIOD TOTAL must go through `twWindow()`**, which asks for
  `[start+1, end+1]`; `twSummary()` stays raw for `syncTwDaily`, which reads the
  self-dating charts and does not care. This shipped broken: every weekly and monthly
  report ran on the raw call, so a report billed as Mon–Sun actually covered Sun–Sat.
- **`ga_ROAS` is GOOGLE ADS' OWN number, not Triple Whale attribution** — TW titles
  it "Google ROAS" and pipes it straight from the Google Ads API. Same for
  `fb_ads_purchase_roas` ("Facebook ROAS", Meta-reported). Triple Whale's own
  attributed figures are `totalRoas` / `blendedAttributedRoas`, and it exposes **no
  per-channel pixel ROAS on the summary page** — that lives in the Pixel Joined
  warehouse table, and the Attribution endpoint returns **403 until the API key is
  granted the `Pixel Attribution: Read` scope** (ours is not, as of 2026-08-30).
  Never describe a platform ROAS as "what Triple Whale reports"; name the source.
- **TW's `totalRoas` ("Blended ROAS") is NOT our MER, and the gap is ~18%.**
  It is `blendedSales` ÷ `blendedAds`, where `blendedSales` = `totalSales` =
  "Order Revenue" — BEFORE returns and INCLUDING tax. Our MER is
  (`netSales` − `totalNetTaxes`) ÷ `blendedAds`. Grunk 2026-08-23..29: TW Blended
  ROAS 2.96, our MER 2.50, on identical spend. Both are right; they are different
  revenue bases. This is the same "TW's field names LIE" trap documented in
  profit/CLAUDE.md, and it cost an afternoon when a client compared the two.
- **A ROAS on fewer than two conversions is not a result — withhold it.** Google's
  conversions land late and unevenly, so a day can record one. Grunk 2026-08-29:
  $122 of Google spend, ONE conversion worth $19.95, printed as "0.16x" in a client
  brief as though it described the day's performance. `briefData` now carries
  `google_purchases` (spend ÷ `googleAllCpa`) and `channelSections` sets
  `low_signal`; both renderers show the conversion count instead of the ratio, and
  the prompts are told never to quote a withheld figure.
- **`googleCpa` and `googleAllCpa` HAVE THEIR IDS SWAPPED against their own titles.**
  `googleAllCpa` is titled "Google CPA" and IS real dollars-per-conversion;
  `googleCpa` is titled "Google All CPA" and is ~0.18, some other ratio entirely.
  Dividing spend by `googleCpa` once fabricated 11,951 conversions. Use
  `googleAllCpa`, and never trust a TW id to mean what it says.
- **Daily Brief math**: aMER = new-customer revenue ÷ blended spend; CM basis
  chain = cm_pct override → grossProfit − fees − spend → netSales − COGS −
  fees − spend; forecast weights = trailing-28d day-of-week shares frozen at
  month start.
- **Never state Contribution Margin from unvalidated COGS.** Triple Whale returns
  cost data even when the client has only costed *some* SKUs, which produces wild
  daily margin swings and negative days. `judgeCogs()` gates it; broken clients get
  CM stripped from the brief, the UI and the narrative prompt. Grunk Dolfer is the
  live example. A `cm_pct` goal override is the escape hatch.
- **The brief engine does NOT read the calendar (removed 2026-08-21, commit 013ddc8).** The `CAL`
  binding and `calendarEvents`/`calendarWeights` were added and dropped the same day. Lineup is
  moving into Locus (docs/handoffs/lineup-audit.md); any forecast lift from it is a new decision.
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

## Creative assets and real video playback (2026-08-30)

- **The Meta token now carries page access.** The six brand pages (and their
  Instagram accounts) are assigned to the `Mobius Tools` system user, and its
  token was regenerated with `pages_read_engagement` + `pages_show_list` on top
  of `ads_read` + `business_management`. This is load-bearing: without it,
  video creatives return `object_type: PRIVACY_CHECK_FAIL`, no `image_url`, and
  Meta substitutes the PAGE AVATAR for `thumbnail_url` — which is why three of
  Lucky's video ads once shared one identical clover logo.
- **A video ad's cover frame comes from the VIDEO, never the creative.**
  `/{video_id}?fields=picture` returns a real frame and works with the user
  token. `thumbnail_url` on a video creative is the page avatar. Statics are
  different — `image_url` is the original at full resolution and true aspect,
  so the source order is cover → image_url → thumbnail_url.
- **`source` (the mp4) needs a PAGE-scoped token**, not the user token, even
  with pages_read_engagement. `pageTokens()` caches the map from
  `me/accounts?fields=id,access_token` in `settings.pageTokens`.
  **"System-user page tokens do not expire" was an assumption, and it was
  wrong** (2026-09-03): all six pages had tokens, all cached 2026-08-30, and
  playback failed on every one of them. The cache was only ever refreshed when a
  page was MISSING, so a token that was present but no longer accepted failed
  forever. `adVideoSource` now refreshes once on ANY empty answer and retries.
- **The mp4 URL is signed and short-lived, so it is NEVER frozen into a
  report.** It is resolved at play time by `GET /api/ad-video`. The cover frame
  IS baked in. Image permanent, playback best-effort — do not "improve" this by
  storing the URL, it will 403 within hours.
- **`/api/ad-video` must stay closed.** Two ways in only: an admin/session
  caller, or `?report=<archive token>` where `adInSentReport()` confirms the ad
  appears in one of THAT client's SENT reports. Anything looser makes it an open
  proxy for arbitrary Meta video ids. Verified: no credential 401, forged token
  404, missing ad 400.
- **Some creatives can never be played, and that is not a bug.** Page
  `100526684753365` carries one of Lucky's video ads and is not one of our six —
  a creator/partner page. Every path here degrades to the cover image and a link
  out rather than throwing.
- **The inline image budget belongs to the REPORT, and only to the report**
  (190KB per image / 1.1MB total). A report is ONE D1 row, so full-resolution
  statics would crowd out the numbers. The LIVE creative browser is a JSON
  response and has no such constraint — it passes `LIVE_THUMBS`.
  **Applying the report's ceilings to the live browser is what broke the
  Creative tab** (found 2026-09-03: 13 of 20 cached creatives had
  `thumb: null`). Two compounding mistakes, both fixed:
  1. The video cover deliberately picked the LARGEST frame Meta offered, then
     hard-rejected it for being over the ceiling — discarding four smaller
     copies of the same frame in the process. Now every size is kept, ordered
     smallest-that-still-covers-a-2x-card first.
  2. The `ad_creative` cache refused any row over 90,000 chars. Base64 is 1.34x,
     so **no image that passed the 190KB fetch ceiling could ever be cached** —
     every one was refetched from Meta forever. Now 400,000.
- **A missing image must not draw a ▶.** The placeholder glyph was a play
  triangle on video cards, indistinguishable from the real play badge, so a card
  whose creative had failed to load read as a playable video and the click
  produced "no playable video". It says "No preview" now.
- **`is_video` puts a play badge on a card, so it must mean "this can be
  played"**, not "there is video in here somewhere". It was
  `media_type === 'video' || isVideo`, and since a carousel of videos has
  `video_3s > 0` every carousel got a badge it could never honour.

## Triple Whale attribution IS available — the old note here was wrong (2026-08-30)

**Corrected.** An earlier line in this file said the Attribution endpoint "returns
403 until the API key is granted the `Pixel Attribution: Read` scope (ours is
not)". **That is false.** Cole said the key had full access; he was right and the
note was wrong. Measured live on 2026-08-30:

- `POST /api/v2/attribution/get-orders-with-journeys-v2` → **200**.
- The path needs the **`-v2` suffix**. Without it TW returns `404 Not found`,
  which reads exactly like a missing route and was misread as a missing scope
  for six attempts. `/attribution/get-ads-data`, `/attribution/stats`,
  `/pixel/attribution`, `/tw-metrics/metrics-data` and `/metrics/get-data` all
  404 — they do not exist.
- **The body key is `shopDomain`, not `shopId`.** `shopId` returns
  `403 Access Denied`, which ALSO reads like a permission problem and is not.
  A control call to the known-good `summary-page/get-data` is what separated the
  two: same key, 403 with `shopId`, 200 with `shopDomain`.

**LESSON, and it is the same one as the Meta system-user saga earlier the same
day: 403 and 404 from a third party are not evidence about permissions until a
KNOWN-GOOD call has been made with the same key. Always probe with a control.**

**What the endpoint actually returns:** order-level journeys, not aggregated ad
metrics. Each order carries `order_id`, `total_price`, `created_at`,
`customer_id`, and `attribution` with six models — `firstClick`, `lastClick`,
`fullFirstClick`, `fullLastClick`, `lastPlatformClick`, `linear`, `linearAll` —
each an array of touchpoints. **A touchpoint carries `source`, `campaignId`,
`adsetId`, `adId` and `clickDate`** (verified on Lucky Golf; `source` values seen
include `facebook-ads`, `google-ads`, `organic_and_social`, `Excluded`).

So TW-attributed **ad-level** revenue is derivable: page through the orders for a
window, walk each order's touchpoints under the chosen model, and credit
`total_price` to the `adId`. Paged — the response carries `count`, `page` and
`finishedRange`. Non-paid touchpoints have an empty `adId` and must be dropped.

**Consequence for Locus:** the creative browser's spend/hook/hold/CTR/CPM stay
Meta-sourced (delivery metrics TW does not measure), but purchases, revenue,
ROAS and CPA CAN move to Triple Whale attribution, which is Cole's stated
preference: TW for anything attribution-shaped, Meta only as a last resort.

### Ad-level TW attribution SHIPPED (2026-08-30) — `tw_ad_attr`

`syncTwAttribution()` pages `attribution/get-orders-with-journeys-v2`, walks each
order's touchpoints and credits `total_price` to the `adId`, storing **all seven
models** in `tw_ad_attr (act_id, date, ad_id, model, revenue, orders)`. All the
models arrive in the SAME response, so storing every one costs no extra call —
which is why the UI offers a picker instead of the code choosing one.

- **Request shape is fussy and every failure looks like a permission error.**
  `shopId` → 403. `shopDomain` ALONE → 403 from this route (it worked for the
  probe only because the probe also sent `shop`). What works: `shopDomain` AND
  `shop`, plus both date spellings. Do not "tidy" that body without re-testing.
- **Revenue is dated by the ORDER's `created_at`**, not the touchpoint's — money
  lands when the money landed, matching every other figure in Locus.
- **The window is DELETED then rewritten, never upserted.** Attribution restates
  as journeys resolve; an order that moves from one ad to another must not leave
  its old credit behind. That makes the sync idempotent.
- Linear models split one order across its touchpoints (weight 1/n); click
  models give the whole order to one. Both handled by the same weighting.
- Nightly re-pulls **7 days** because recent attribution keeps moving.
  `POST /api/tw-attr-sync?act=&days=` backfills up to 60.
- **`tw_ad_attr` holds Google ad_ids too**, so a raw SUM over the table is NOT
  comparable to Meta's totals. Per-ad joins against `ad_daily` are correct
  because non-Meta ad_ids simply do not match. Measured Lucky 2026-07-31..08-29:
  TW lastPlatformClick $62,677 across all platforms vs Meta's own $44,215 for
  Meta ads alone.
- Live per-ad check, Lucky August: `310 B | Still` reads **2.62x on Meta and
  1.25x on TW**; `Cole - 3 | UGC` 1.27x vs 1.00x. The two sources genuinely
  disagree per ad, which is the point of offering both.
- **Only revenue/purchases/ROAS/CPA/CVR/AOV switch source.** Spend, impressions,
  reach, clicks, hook, hold, CTR and CPM stay Meta's under every model, because
  Triple Whale does not measure delivery.
- An ad with no attributed row under a model reads **0, not null** — that is a
  real zero, and treating it as missing would quietly promote unattributed ads
  up a CPA sort.

### `ad_creative` cache (2026-08-30) — why filtering used to crawl
Every sort/filter change re-picks the top N, and each unseen ad cost a creative
fetch plus a video lookup: up to sixteen sequential Meta round trips for one
click on a dropdown. Creatives do not change, so `adThumbnails` now reads
`ad_creative` first and only calls Meta for what is missing, writing back rows
under 400KB with a 14-day TTL (was 90KB — see the image-budget note above; it
was smaller than any image that passed the fetch ceiling, so nothing cached). A cache miss or a write failure is swallowed —
the cards must never depend on it.

### Attribution weighting follows the MODEL (corrected 2026-08-30)
First version split every order `1/n` across its touchpoints for ALL models.
Wrong for the click models: their array is not a split, it is **one entry per
platform**. A live Lucky order carried `google-ads`, `organic_and_social` and
`facebook-ads` under `lastPlatformClick`; splitting gave Facebook 50% of an
order Triple Whale's own UI credits to it in full, so every click-model ROAS
read low against the number Cole sees in Triple Whale.
- `linear` and `linearAll` (`LINEAR_MODELS`) keep `1/n` — that IS their meaning.
- Every other model credits each touchpoint the **whole order**.
- **Per-platform revenue can therefore exceed the order total.** That is not a
  bug: the platforms double-count each other, exactly as TW's interface shows,
  and it is precisely why blended MER exists on the other tabs.
The wrongly-weighted click-model rows were deleted and the cursors reset so the
nightly walk refills them; `linear`/`linearAll` were correct and were kept.

## `?ids=` IS DEAD (2026-09-08) — and it failed silently for months

Meta: **"The ids query parameter is deprecated in v26.0+."** Every
`meta(env, '', { ids: 'a,b,c', ... })` call now errors. We are pinned to v23.0
and it is rejected anyway, so pinning does not save it.

- **Fetch many objects by paging the parent EDGE, not by id.**
  `GET /act_<id>/ads?fields=id,creative{...}` returns each ad with its creative
  and pages properly. To reach a KNOWN set of ads, use the same edge with
  `filtering: [{field:'ad.id', operator:'IN', value:[...]}]` — still one call.
- **`asset_feed_spec` is unbounded, so page size is a RESPONSE-SIZE limit, not a
  rate limit.** 100 ads of it returns "Please reduce the amount of data you're
  asking for", or sometimes just "An unknown error occurred". Retrying the same
  call cannot help. `ads-type-backfill` starts at 50, halves on failure and
  recovers after a clean page; copy that shape rather than hard-coding a small
  page, which triples the calls on accounts that do not need it.
- **Never ask for nested subfields inside a spec.**
  `object_story_spec{link_data{child_attachments}}` is rejected outright. Ask for
  `object_story_spec` and `asset_feed_spec` WHOLE and read into them in JS, the
  way the per-ad creative fetch has always done.
- **This is why `ads.media_type` was empty**, and why creative cards could not
  say "Carousel": nothing was being written. The same deprecation had ALSO been
  breaking `adThumbnails`' status/date/campaign/adset lookup inside an empty
  catch, so every creative detail popout was quietly missing those fields.

**THE RULE THAT WOULD HAVE CAUGHT BOTH: a batch helper must keep and return its
FIRST error.** The backfill's first run resolved 0 of 200 and reported them as
"unresolvable", which is indistinguishable from "every ad was deleted". Swallowing
the error turned a one-line API deprecation into an invisible data hole. An empty
`catch {}` around a Meta call is only acceptable when the caller can genuinely
carry on AND something else will notice the absence.

## ATTRIBUTION IS TRIPLE WHALE'S, ALWAYS (2026-09-18)

Cole: "Triple Whale's always there for attribution." Per-channel purchases,
revenue, ROAS and CPA in the Daily Brief, the reports, their narratives and the
Locus pages come from `tw_ad_attr` under `BRIEF_ATTR_MODEL` (`lastPlatformClick`,
TW's default). Spend, CPM, CTR, impressions, clicks, hook and hold stay the
platform's. Platform figures survive only as `*_platform` / `platform_*` fields
for reference and are never rendered or prompted.

- Why: Google's self-reported conversions ran ~40% under TW's pixel (Sep 10-16:
  107 vs 178 orders) and had mostly not landed by the 7am brief. Dartee Google
  read 2 conversions for the week against TW's 15.
- `briefData` reads `tw_ad_attr`; `twAttributeChannels` overlays the report's
  Meta/Google sections (current AND prior window).
- The nightly attribution sync (03:30 UTC) is still the evening before in US
  zones, so it never holds yesterday. `dailyBriefs` and the report builder
  each pull the last three days of attribution first.
- A day/window with NO attribution rows is "not synced", never zero, and
  never silently falls back to the platform number.
- Reports default to `lastPlatformClick`; the "Platform reported" option was
  removed from the picker. Old frozen reports without `attr` still render as
  they were sent.

## Brand brain (2026-09-29)

Cole: the AI across Locus came back vague and generic. The model was fine; the
context was thin (the Studio brief reader got only the brand's NAME, and a brand
with no copy skill got "you write copy for X"). `src/brain.js` fixes the context.

- **`brandBrain(env, act_id, {voice, creator, max})`** assembles ONE markdown block
  per brand, in a FIXED order with no timestamp (so the prompt cache hits): Brand +
  products + offers + facts (`brand_facts`, `profile`, onboarding answers); **Staff
  rules** (profile always/never, the client's dos/don'ts, the creator link's
  `rules_json` claim rules, test rules) which outrank everything; Product lines
  with market stage, awareness, claims made, open ground, mechanism; Personas
  (every field); Voice of customer (nuggets first, then pains, failed, objections;
  verbatim; 40 max); Competitors; Angle library with each angle's tests, most
  recent first (40 max), result (`verdict`, else Asana's `asana_result`) and
  Triple Whale lastPlatformClick spend / orders / CPA / ROAS matched by ad-name
  number or `p_br_adtag` (4 queries per brand, not per batch); Earlier research
  notes; Creator link (sections, angle titles, "please stop filming these");
  How the brand sounds (speaker + guide, or the voice card, only when there is no
  full skill); **GAPS** (always last, never cut: "No personas yet", "No customer
  quotes yet", "No copy skill"...). AI drafts are included, labelled draft.
- **Size:** per-section caps, ~60k characters total; over the total, sections are
  halved in a fixed order (`TRIM`: research notes first, staff rules never). `clip()`
  so no emoji is split; em dashes are replaced with commas on the way out.
- **`SPECIFICITY`** (exported) rides with the brain in every creative prompt: tie
  every angle/line/claim to a named persona, a verbatim quote, a past test or a
  product fact, and say which in the note/why field (never in the ad's words); the
  swap test (another brand's name still works = too vague, rewrite); never fill a
  gap with generic language, name what is missing; awareness + sophistication decide
  the opening; plain English, no em dashes.
- **Wired into:** `studio-ai.js` brief step (system = instructions + SPECIFICITY,
  then the brain as a cached block) and plan step (skill block, brain block, then
  VOICE + SPECIFICITY; the skill is untouched); `voice.js` copy desk (brain with
  `voice:false` after the skill/guide base, SPECIFICITY after the desk rule);
  `strategist.js` `create_angles` (brain with `creator:false`, since the hub is
  already in that prompt). Every call site catches a brain failure and runs without
  it. `brainBlock(md)` = `{type:'text', text, cache_control:{type:'ephemeral'}}`;
  both `claude()`s pass an array system through as given. No extra model calls.
- **Research notes:** the research half of `docs/angles-grunk-dolfer.md` and
  `docs/angles-dartee.md` (brand, competitors, VOC, personas, Cole's decisions; not
  the Meta performance tables or seasonality) lives in `p_br_doc` key
  `research_notes` (source `docs`). Re-run
  `node profit/worker/migrations/research_notes.mjs` after editing either doc.
- Measured 2026-09-29, before the Brand-tab research runs (0 VOC, 1 persona): Party Patch
  25k chars, Lucky 20k, Grunk 41k, Dartee 36k, Bonk 23k (roughly 5k to 10k tokens, cached).
  It grows toward the 60k cap as research lands and needs no code change. Local check:
  a shim that runs `brandBrain` through `wrangler d1 execute --remote --command` works
  (use `--command`, not `--file`, which returns no rows).
- **Viktor's research (2026-09-29).** Cole's Slack AI produced source-verified brand brains for
  Party Patch, Bonk, Dartee and Grunk; `profit/worker/migrations/viktor_import.mjs` loaded them
  ONCE (read its header before touching it): 46 personas (`source 'viktor'`), 623 verbatim quotes,
  27 competitors (complaint quotes in `data_json.complaints`), per-line `market` + `mechanism`
  docs and a brand-level `viktor_notes` doc `{md, gaps, from}`, all `status 'draft'`, ids
  `vk_...`. Nine new product lines were added (`vk_...`); the import deleted none (see the cleanup below). Grunk's Apparel
  line already had an APPROVED sheet `market` doc, so Viktor's is `market_viktor` there and the
  brain fills only the fields the approved doc lacks.
- **What the brain does with it:** `viktor_notes` renders as section 2b right after the staff
  rules (guardrails and flags first, the Meta-reported ad history late and labelled "Meta-reported
  ROAS, not Triple Whale"). Drafts from it are tagged "Viktor research". Up to 14 personas (fields
  clipped at sentence ends), 50 quotes (all nuggets first up to 24, then a round robin over kinds
  and product lines, each tagged with its line; long quotes end in "..." and are never reworded),
  16 competitors. GAPS says when personas are Viktor drafts and lists what Viktor could not reach.
- **Lucky Golf (same day, `--brand "Lucky Golf"`) is RESEARCH ONLY.** Cole is rebuilding Lucky's
  voice and website elsewhere; Lucky's voice comes only from its synced repo skill. Its
  `viktor_notes` carry facts (prices, offers, sales mix, doc conflicts, CLOVER15, durability) and
  a pointer line to the skill, nothing about how it writes. As a guard, when a brand has a full
  copy skill the brain drops any `viktor_notes` subsection whose heading reads as voice / tone /
  writing / positioning. 14 personas, 154 quotes, 12 competitors; Wedges (was "Short game
  scoring clubs", putters split out), new Putters line, Long game = Stryker, Apparel.
- **Old lines removed 2026-09-29** (`migrations/line_cleanup_20260929.sql`, nothing referenced
  them): Party Patch "Daily Wellness", Bonk "Course Accessories", Dartee "The glove" and "Hats".
  Line `sort` now puts researched lines first. After: PP 59.7k, Bonk 57.1k, Dartee 59.0k,
  Grunk 59.8k, Lucky 53.8k; all five byte-identical across two runs.
- **Trimming is now "only as much as needed, lowest value first":** `TRIM` order research notes,
  creator link, brand facts, competitors, Viktor notes, voice, lines, quotes, personas, angle
  tests, each with a floor (`TRIM_FLOOR`); staff rules are never cut. Measured after the import:
  Party Patch 59.9k, Bonk 57.4k, Dartee 59.5k, Grunk 59.8k; every brand keeps all its personas,
  all nuggets and its full test history, and two runs produce byte-identical output (cache-safe).
- **Focused mode (2026-09-29):** `brandBrain(env, act, {lines: [ids]})` narrows personas, quotes, market docs and
  line-tied tests to those lines at full depth and keeps everything brand-wide (voice always). Used by the ideas bot;
  see "Focused brain, line picker, blind compare" under the Ideas bot.

## Ideas bot (2026-09-29)

An idea dropped in a brand's INTERNAL channel (`accounts.slack_channel`, the `-internal`
channels; clients are never in them) becomes a draft brief when someone tags @Mobius Digital
in the thread. Code: `src/ideas.js`; tests: `node test-ideas.mjs` (39 offline checks, mocked
Slack / Gemini / ScrapeCreators / Claude / Asana / Atria, plus the router rule; 45 since the focused-brain pass,
49 since the 2026-09-30 simplification: minimal card, Section dropdown, caps, clips in R2; 53 since the Lucky creator
app push, see the last subsection).

- **Routing.** Slack events already reach this worker through slack-router (`/slack/events`
  forwards any channel registered as an account's `slack_channel`; DMs and everything else go
  to the Ledger, unchanged). `handleSlackEvent` then asks `ideaWanted()`; if no, the Strategist
  answers exactly as before. An idea = the thread already has a draft, OR the tag says idea /
  brief / draft / teardown / creator link / studio / redo, OR the thread has a TikTok /
  Instagram / YouTube link or an uploaded video, OR an image with a tag that is not about the
  numbers (roas, cpa, spend...), OR a bare tag inside a thread. Saying "strategist" in the tag
  always goes to the Strategist. Untagged chat never reaches a model: $0.
- **The slow part runs on a Queue** (`mobius-ideas`, binding `IDEA_Q`, `queue()` in `AH_APP`,
  one message per job, `max_retries = 0`). The event is acked with :eyes: and queued, because
  waitUntil after a response only lives ~30 s and a watched video plus an Opus draft takes
  longer. Without the binding the job runs inline (tests).
- **Kill switch:** `IDEAS_BOT` var in wrangler.toml. `"off"` = every tag goes to the Strategist,
  idea buttons ack and do nothing, queued jobs are dropped.
- **Media, each read ONCE:** videos go to Gemini (`GEMINI_MODEL`, one constant, currently
  `gemini-3.5-flash-lite`) for FACTS only (format, hook verbatim, beats, on-screen text, transcript,
  people, product role, CTA, pacing, audio), cached in `idea_media` keyed `yt:<id>` / `tt:<id>` /
  `ig:<shortcode>` / `slack:<file id>`. A re-tag or Redo never re-watches. YouTube goes by URL;
  Slack uploads are downloaded with the bot token and streamed into Gemini's Files API;
  TikTok / Instagram go through `fetchSocialVideo()` (ScrapeCreators, `DOWNLOADER_KEY`). Images
  go straight to Claude (no Gemini). Missing `GEMINI_API_KEY` or `DOWNLOADER_KEY` = a plain line
  in the card ("upload the file and tag me again") and the draft is still written from the words.
- **Thinking:** one `claude()` call (research.js; Sonnet 5.5 by default, see the cost pass below) per tag, after a tiny
  line-picker call. System = the framework + transfer rules + SPECIFICITY, then `brainBlock(brandBrain(act, {lines}))`
  (cached; focused on the idea's product line). Output `IDEA_SCHEMA`:
  teardown, transfer (as_is / style / hook_only / mixed; team notes outrank the model; the latest
  direction wins and is named), 0-3 questions (any `blocking` = questions-only reply, no draft),
  destination (creator_link / lucky_creators / asana_brief / studio) and a draft for every
  destination that fits. Em dashes are stripped from everything the model wrote.
- **The row is the truth, the card is a view** (`idea_thread`, id `channel:thread_ts`). A re-tag
  REVISES: the last draft and the new messages go in the prompt, the old card is retired
  ("Replaced by the newer draft below") and a new card is posted so the thread reads in order.
- **Buttons** (`idea_*`, routed by slack-router to `/slack/actions`, HMAC-checked there):
  Creator link / Lucky creator app / Asana brief / Studio are APPROVER-ONLY (`IDEA_APPROVERS`,
  default Cole U06C37MDWD7 + Ahsan U06K732S4BD); Redo is open to anyone; Discard is approver-only.
  A button from another channel than the thread's is refused.
  - Creator link: a LIVE `p_amb_angle` in the section the model picked (or a new section), the
    reference link as `p_amb_proof` kind `inspo` ("Another brand (inspiration)"). If the model
    named an existing angle as a duplicate, only the proof is added. `noMoney()` strips any
    sentence with a paid metric or a money figure: nothing about spend/ROAS/revenue reaches the
    public link. Undo deletes only what this press created.
  - Asana brief: next number (max of `p_br_batch` and the project's last 3 days of tasks), task
    `"<n> - <title>"` in the Creative Brief section, `html_notes` in the BRIEF_STATIC / BRIEF_VIDEO
    layout plus Concept, "Idea from <name>" with the Slack permalink, the reference under Inspo, and
    the Testing custom field. Never the Angle field (the tagger files angles). The project webhook
    syncs it into the Brand tab like any other brief.
  - Studio: a `draft` row in `p_studio_batch` (brief {angle, why, concept, testing, post_copy,
    lines[{text, inspo:[]}]}), numbered after the Asana brief if one was sent. It shows in Locus
    Studio's batch list; the team picks the product and makes it there.
  - Lucky creator app: BUILT 2026-09-30 (`pushLucky` / `undoLucky`; see "Lucky creator app push" at
    the end). The same creator draft goes into LuckyGolfCo/lucky-golf-creators' Supabase over PostgREST
    and Storage REST with the service key. Not connected = the thread says which two names Cole sets,
    nothing is stored, the button stays.
- **Cost:** `idea_run` per tag (Claude in / cache read / cache write / out, Gemini in/out,
  downloads, videos new vs cached, dollars); the card's footer shows the run's cost. Offline
  estimate with a ~15k-token cached brain: about $0.06 per tag, plus about half a cent per new
  60-second video and $0.002 per TikTok/Instagram download.
- **Atria ad links (2026-09-29, `src/atria.js`).** An Atria link (`app.tryatria.com/ad/m<id>`) or a
  Meta Ad Library link (`facebook.com/ads/library/?id=<id>`, read as Atria id `m<id>`) counts as a
  reference video/image. Atria has NO REST API or key: it has an MCP server
  (`https://api.tryatria.com/mcp`, Streamable HTTP) behind OAuth, so Locus connects ONCE for the
  whole workspace: Locus Studio, **Connect Atria** -> `POST /api/atria/start` (admin) registers this
  worker by dynamic client registration the first time (client id + secret in `p_studio_cfg`
  `atria_client`, never logged or sent to the browser), stores a PKCE S256 verifier + state
  (`atria_state`, single use, 20 min) and returns Atria's sign-in URL (scope `atria:read` only,
  `resource=https://api.tryatria.com/mcp`). Cole signs in himself; Atria redirects to the PUBLIC
  `GET /atria/callback` on this worker, which swaps the code (Basic client auth + verifier) and
  stores `atria_tokens` {access, refresh, exp, since}. `atriaToken()` refreshes a minute before
  expiry (and re-reads the row if another job rotated it first); a dead refresh token clears the
  row = "not connected". `GET /api/atria/status` says connected/since only; `POST
  /api/atria/disconnect` revokes the refresh token and forgets client + tokens.
  - Per ad: MCP `initialize` (+ `Mcp-Session-Id` when the server gives one, `notifications/initialized`),
    then `tools/call` `get_library_ad {ad_id}`, `get_library_ad_transcript {ad_id}` (videos, used only
    when `status: ready`) and `get_library_ad_creative_tags {ad_ids: [..]}` (an ARRAY; `ad_id` is
    rejected). Replies may be JSON or SSE; both are read. A 401 refreshes once and retries.
    `transcribe_library_ad` is never called (it would start work on Atria's side).
  - Video ad: the public `cdn.tryatria.com/adfiles/...mp4` is downloaded (no auth, no downloader
    credit) and streamed into Gemini exactly like a Slack upload. Image / carousel ad: up to 3
    images go to Claude as image blocks, no Gemini. The breakdown gets an `atria` part: advertiser,
    headline, body copy, CTA, landing page, format, "Running N days since <date>, status X. Long-running
    ads are usually profitable for the advertiser: a signal, not proof.", transcript, creative tags.
    The system prompt says the same about days running.
  - Cached ONCE per ad in `idea_media` as `atria:<id>` (platform `atria`, the image urls inside the
    facts so a re-tag still shows Claude the picture). A re-tag or Redo makes no MCP call and no
    download. Not cached: not connected, not in Atria, or a video with no GEMINI_API_KEY (Atria's
    transcript and details are still used that run).
  - Not connected / not in Atria / Atria down: one line in the card ("Atria is not connected ...
    Cole can connect it in Locus (Studio, Connect Atria)" / "That ad (V1) is not in Atria's
    library") and the draft is written from the words. Same cost as before: no extra model call.
  - The PUBLIC creator link never gets an Atria URL (needs an Atria login): `publicRef()` turns a
    Meta Atria id into its Meta Ad Library page for the proof. Asana Inspo keeps the pasted link.
  - Tests: 11 Atria checks in `test-ideas.mjs` (mocked OAuth server + MCP server). NOT tested live:
    the DCR registration, Atria's sign-in/consent, the token swap and refresh, and the MCP session
    against the real server (whether it wants `resource`, sends a session id, answers SSE). If the
    first real Atria link fails, the card says what Atria answered.
- **Slack scopes it uses:** chat:write, reactions:write, channels:history + groups:history
  (conversations.replies in private -internal channels), files:read (uploads), users:read
  (names). The Strategist and Ledger already use all of these; if a call fails, the thread says
  which scope is missing.

### Ideas bot cost + quality pass (2026-09-29, after the first live run)
- **First live run:** Opus 5 + the full 60k-char brain + drafts for every destination = **$0.34** (cache WRITE of a 28k-token
  system block $0.175, 6k output tokens $0.15), and Gemini answered 524. Cole's bar: **$0.06 or less per idea.**
- **Default model is Sonnet 5.5** (`MODELS.fast`, $2 in / $2.5 cache write / $0.20 cache read / $10 out, effort
  medium). The 24k-char blunt cap it first shipped with is GONE (see "Focused brain" below): for Party Patch it had cut
  personas 10.9k to 4.8k, quotes 10k to 4k, tests in half and dropped "How the brand sounds".
- **"deep" in the tag** = `MODELS.deep` = **Opus 5.5** ($4 / $5 / $0.20 / $20, effort medium; it always thinks,
  `claude()` sends adaptive); stored as `idea_thread.deep` so Redo / Make-draft stay on the same model. `claude()` in
  research.js takes an optional `model`.
- **One draft up front**: only the suggested destination is written; the others are "Make <dest> draft" buttons
  (`idea_make`, open to anyone) that write just that field on top of the stored draft (narrowed schema).
- **Creator link is the default destination** (Cole: "this is mainly for the creators"); props a creator owns do not
  make it a production job. Asana only when a creator could not make it from a pitch.
- **Gemini is STREAMED** (`streamGenerateContent?alt=sse`, one retry on 429/5xx/524) and the facts now include
  `visual_moments` (odd props/actions, zooms, text pops, reveals) the model must find on its own.
- Card: `sections()` splits on lines and never drops text; model-numbered lines are de-numbered; awareness and
  sophistication are separate bullets.

### Focused brain, line picker, blind compare (2026-09-29, same evening)
Cole: about $0.06 a draft and NOT worse. The blunt 24k trim lost exactly what makes a draft specific, so:
- **Focused brain** (`brandBrain(env, act, {lines: [ids]})`, brain.js). Brand-wide stays at FULL depth: brand facts,
  staff rules, Viktor's notes, competitors, GAPS and **How the brand sounds (always, never trimmed)**. Line-tied parts
  are narrowed to the chosen line(s) at full depth: that line's market + mechanism, ALL its personas, ALL its quotes
  (nuggets first; caps open to 30 personas / 120 quotes), and the tests on angles tied to it. Rows with no line stay in.
  Other lines become one line each ("Other product lines ...: name: what it is"). Viktor's notes drop only bullets or
  `###` subsections whose label NAMES another line (for example "- Party Themes: ..." under Per-line competitor notes).
  How rows tie to a line (checked in the schema, not guessed): `line_id` on p_br_persona / p_br_voc / p_br_doc;
  p_br_angle has its own `line_id`, else its persona's line; p_br_batch ties through its angle. **As of 2026-09-29 no
  angle in any brand has a line_id or persona_id, so every test stays in** (they narrow automatically once angles are
  filed to lines). No lines = the full brain exactly as before. Deterministic (cache-safe). Safety cap `FOCUS_MAX`
  45k (not 40k: at 40k Party Patch and Bonk lost brand facts); over it, trim order `TRIM_FOCUS` = older research
  notes, then the OLDEST tests, then competitors, brand, Viktor, lines, quotes, personas; staff rules and voice never.
- **Measured (real D1, `creator:false`):** Party Patch full 53.7k chars; focused on Night Out Defense **43.9k**, no trim:
  brand 4.8k, rules 0.7k, Viktor 4.0k (other lines' notes gone), lines 4.0k (was 8.7k), personas 5.3k (4 of 4, was
  10.9k for all 11), quotes 9.6k (**56 of 56** Night Out quotes, was 50 of 116 across lines), competitors 2.3k, tests
  9.5k, voice 2.7k, gaps 0.7k. Main line, untrimmed: Lucky 44.8k, Bonk 46.6k, Dartee 50.3k, Grunk 51.7k (the last two
  carry 8k of older research notes, cut first).
- **Line picker** (`pickLines`, ideas.js): one call before the draft, Sonnet 5.5, effort low, max 2000 tokens,
  schema `{line_ids, why}`; input = the thread, the tag, a few-line summary of each reference (hook, product,
  advertiser, headline, copy, caption, transcript excerpt) and the brand's lines (id, name, about, products). One line,
  two only if unsure; unknown ids are dropped. Cached on `idea_thread.lines_json` {ids, names, why}; a re-tag, Redo or
  Make reuses it unless the tag or the messages since the last run NAME another line (its short name). One line or
  none, a failed call or no known id = the full brain. Cost in the run (`idea_run.pick_cost`, included in `cost`);
  the card footer says "Written for the <line> line."
- **Blind compare:** "compare" in the tag (inside a thread, not with a numbers word) fetches thread + media once, runs
  the picker once (or reuses it), then sends the IDENTICAL prompt (fresh, no last draft) to Sonnet 5.5 and Opus 5.5 in
  parallel and posts "Version A" and "Version B" in RANDOM order (`Math.random`). The cards carry no model, no cost and
  no buttons, only "Blind test. Tell Cole's Claude which version reads better." The thread's stored draft, card, runs
  and status are untouched (a thread with no draft gets status `compared`). **Which was which:**
  `SELECT kind, model, cost, c_in, c_cache_write, c_cache_read, c_out, card_ts, started_at FROM idea_run WHERE
  idea_id = '<channel>:<thread_ts>' AND kind LIKE 'compare_%' ORDER BY started_at DESC` (the shared Gemini + picker
  cost is on the `compare` row); the worker log prints "Version A = <model>" too.
- **Cost estimate (not yet measured live).** The first live run cache-wrote 28,005 tokens for about 66k chars, so about
  2.4 chars per token. Focused PP brain + system is about 50k chars, about 21k tokens. Sonnet 5.5, first tag: cache
  write ~$0.053 + ~4k input ~$0.008 + ~3k out ~$0.03 + picker ~$0.005 = **~$0.09-0.10** (plus ~$0.005 per new video).
  Within 5 minutes on the same brand + line (Redo, Make, a re-tag) the brain is a cache read: **~$0.05**. Opus 5.5:
  **~$0.20** first tag, ~$0.10 warm. A compare costs both, about $0.28. The brain is the cost: each ~10k chars of brain
  is about $0.01 on a cache write with Sonnet.
- `idea_run` gained `model`, `pick_cost`, `card_ts`; `idea_thread` gained `lines_json` (ALTERs in `ensureIdeaTables`).
  Tests: `node test-ideas.mjs`, 45 checks (focused brain, picker + cache + re-pick + bad pick, compare with both random
  orders).

### Blind test result (2026-09-30)
Cole ran `compare` on the Waterboy idea and picked **Version B = Opus 5.5** ("not close": sharper concept, correct
solution-aware call, grounded in quotes and the 312-9 losing test, the scissors explained). Measured: Opus 5.5 $0.222
(22k cache write, 4.3k out), Sonnet 5.5 $0.086 (1.8k out), video watch + line pick $0.011; Gemini streaming DID watch
the video this time. **Opus 5.5 is now the default; "quick" in the tag = Sonnet 5.5** (`idea_thread.deep` 1/0 keeps
Redo and Make on the thread's model). Cole's $0.06 bar is not reachable at this quality; expect ~$0.15-0.22 a first tag.


### 2026-09-30 simplification (Cole's notes on the first real drafts; all four shipped)
- **The card is minimal.** `ideaCard`: one bold line `<Brand> idea from <name> -> <destination>`, then the idea in
  about four lines (creator link: title, pitch, who, the first opener; Asana: title, angle, testing, "N ads, video,
  concept test"; Studio: name, angle, "N lines, testing X"), the Section dropdown (creator link only), the buttons
  (Creator link / Asana brief / Studio / Make ... draft / Undo / Redo / Discard / **Details**), and one tiny context
  line (`$0.19 this run, $0.40 this thread  ·  Night Out Defense line`). No teardown, no Take, no Best home, no
  "Worth answering". Blocking questions keep the questions-only card. Media notes ("Atria is not connected...") stay
  as a context line because they explain a thin draft. **Details** (`idea_details`, anyone) posts the full teardown +
  transfer + destination reason + non-blocking questions + the full draft (`detailsCard` = the old `draftBody`) as a
  threaded reply. The stored draft is unchanged; only the default view shrank. Blind compare cards still show the
  full body (Cole judges quality there). The teardown prompt now asks for one short sentence per field.
- **Section dropdown** (`static_select`, action `idea_section`, in the actions block before the buttons): options =
  the brand's `p_amb_section` rows in page order ("(off)" when disabled, 99 max, text clipped to 72) plus "New
  section: <name>" when the model proposed one; the model's pick is `initial_option`. Each option's value is
  `{"i": row id, "s": section id | "new"}` (the select itself carries no value). Choosing it stores
  `idea_thread.section_pick` and acks; no model call, no redraw. `pushCreator` uses the pick over the model's
  `section_id` ("new" = create the proposed section); a fresh draft (tag, Redo) clears the pick, a "Make ... draft"
  keeps it. **No section anywhere = the push refuses** ("Pick a section first") instead of filing an angle the page
  cannot show (live angles need an enabled section or hot). Duplicate-of angles get no dropdown.
- **The reference plays on the public link.** The Atria reference was an `inspo` proof, which is only a link.
  Now every watched clip except YouTube is kept in R2 **`mobius-amb-media`** (the Ambassadors bucket; this worker
  gained the `MEDIA` binding in wrangler.toml), key `amb/<act_id>/idea-<id>.<ext>`, 95MB cap like an Ambassadors
  upload (`MAX_CLIP_BYTES`; bigger clips are still watched, up to 300MB, just not kept), remembered on
  `idea_media.file_key / bytes / clip` (`clip` = ok | too big | no video on that ad | YouTube stays a link |
  undone | failed: ...). `stashClip()` puts the file in R2 first (buffered up to 30MB so a storage failure never
  loses the watch, streamed above that through FixedLengthStream) and Gemini reads the stored object. Atria facts
  now carry `atria.video_url`. The thread row keeps `media_json` (label, platform, key, urls, Slack file info).
  **Creator link button:** the link proof as before (`inspo`, Meta Ad Library page for an Atria ad, hidden when the
  brand's "show inspiration" is off) PLUS the first video with a stored clip as an **`upload` proof** (the kind the
  page plays natively through the profit worker's `/api/angles-file/<proof id>`), `who = "Another brand
  (inspiration)"`, note = proof_note. `ensureClip()` fills a missing clip on demand (a thread drafted before this
  shipped, an undone clip, a key whose object Locus deleted with the angle: it `head()`s the key first) from the
  Slack file URL, `atria.video_url` (or one MCP round for old cached rows) or the downloader (one credit). Never
  for YouTube, image ads or "too big" (`NO_CLIP`). A cached re-tag also stores a missing clip, no re-watch. The
  reply says "The reference clip plays on it" or why not. **Undo** deletes the proof rows, the R2 object (unless
  another proof still uses the key) and sets `idea_media.clip = 'undone'` so the next tag stores it again.
  R2 keeps clips of ideas never pushed; nothing sweeps them yet (cents per month).
- **The public page** (`angles/app.src.js`, built to app.js, `V = 10`): an `upload` proof whose `who` says
  inspiration / another brand renders with the Inspiration label and "Steal the shape, not the brand", and plays
  like any upload. `.dd p` and `.overlay p` are `white-space: pre-line` so the "one item per line" fields below
  render their lines. The profit worker did not change.
- **Creator-link caps** (Cole: "is the brief too complicated for a creator?"): `CREATOR_CAPS` = title 6 words,
  argument 25, who 15, openers exactly 2 of 18, shots 3 of 20 (label 3), on_screen 3 lines of 10, do / don't 3
  items of 10 (one per line), format 3, products 3, proof_note one sentence. The system prompt asks for them (and
  for specific words: fewer, never vaguer); `clampCreator()` cuts at the word cap (no ellipsis), runs inside
  `cleanCreator()` so the stored draft, the card and the push all see it, and `noMoney()` now works line by line so
  it keeps those lines. The card and Details show on_screen / do / don't joined with " / ".
- Tests: `node test-ideas.mjs`, **49 checks** (Section dropdown incl. new section + refuse-without-section, caps
  clamp, minimal card + Details, Atria clip in R2 + Undo + re-store + on-demand fetch on an old thread, Slack
  upload clip, YouTube stays a link, over-95MB watched but not kept). R2 is a Map stand-in. NOT tested live: the
  R2 put from a Worker with a streamed body over 30MB, playback of an idea clip on the real creator link, and
  Slack's rendering of the `static_select` next to the buttons.

### Lucky creator app push (2026-09-30)
Lucky Golf has NO Locus creator link (`p_amb_brand` holds Party Patch, Grunk, Dartee). Its creator link is its
own app, `LuckyGolfCo/lucky-golf-creators` (Next.js + Supabase Postgres on Cloudflare, creators.luckygolf.com), whose
"What to shoot" page is modelled on the Locus hub: `angle_sections` (uuid, name, blurb, icon, color, `pinned` = Hot
right now, `active`, sort), `angles` (section_id, title, who, `hooks text[]`, beat_open / beat_middle / beat_close,
product_id, format, `hot`, `active`, sort) and `angle_examples` (angle_id, kind link | file, url, file_path, owner
ambassador | lucky | brand, owner_name, note, active, sort). There is no review state: `active` is the only switch
(members see active rows, staff see all), so the push goes LIVE like the Locus button. File examples live in the
Supabase Storage bucket **`creative`** (`angles/<angle id>/<name>`); the app plays them through a signed URL
(`signedReadUrl`; an `r2/` prefix would mean the app's own R2, which we never write).
- **Config on this worker:** `LUCKY_SUPABASE_URL` (var or secret) + `LUCKY_SUPABASE_SERVICE_KEY` (secret, the
  project's service_role key; it bypasses RLS, which is what a server-side staff write needs). Optional var
  `LUCKY_CREATORS_URL` (default `https://creators.luckygolf.com`). `luckyReady(env)`. Plain `fetch` (xfetch), no SDK:
  `luckyRest()` = `{url}/rest/v1/<table>?...` with `apikey` + `Authorization: Bearer`, `Prefer: return=representation`
  on writes; `luckyStoragePut()` = `POST {url}/storage/v1/object/creative/<path>` (`x-upsert: true`, buffered up to
  30MB, FixedLengthStream above); `luckyStorageDelete()` = `DELETE` on the same path.
- **On Lucky the hub IS the app** once connected: `hubOf()` returns `luckyHub()` (sections with `pinned`, active
  angles with `who` as the argument), so the model picks from the APP's section ids, the Section dropdown lists the
  app's sections, and `hubText()` heads the prompt block "THE LUCKY CREATOR APP'S "WHAT TO SHOOT" NOW". The Locus
  "Creator link" button is hidden on Lucky while the app is connected (it would file into sections the app does not
  have); `pickOf` turns a creator_link pick into lucky_creators on Lucky. App unreachable = the hub comes back empty
  with `down`, the card draws with no dropdown, the prompt says it could not be read, the push whispers what the app
  answered.
- **`pushLucky`** (approvers only, `idea_lucky`): `cleanCreator` first (no money, caps). duplicate_of an app angle =
  examples only. Else the dropdown pick outranks the model's section_id; "new" = insert the proposed section (icon
  sparkles, color gold, sort max+10); no section = "Pick a section first". Angle: `active: true`, section_id (null
  when the pick is the pinned section, with `hot: true` instead: that is how the app shows Hot right now),
  `who` = "<who>. <argument>" (the app has no pitch field; its own seed rows read the same way), `hooks` = the
  openers, the three beats = the shots, with "On screen: ...", "Do: ...", "Don't: ..." filling empty beats or riding
  on the last one (`luckyBeats`), `format`, `product_id` only when the draft's product text matches an app product
  title (else "Any club"). Examples: each reference link (only TikTok / Instagram / YouTube / Facebook, the platforms
  the app's own form accepts; Meta Ad Library page for an Atria ad) as kind `link`, then the first stored R2 clip
  (`ensureClip`, on demand if missing) copied into `creative/angles/<angle>/idea-<id>.<ext>` as kind `file`; both
  owner `brand`, owner_name "Another brand (inspiration)", note = proof_note. On the angle page that renders as the
  Inspiration chip, "Steal the shape, not the brand", the clip playing in the tile. Reply: the creator link
  `/shoot/<id>` and the staff link `/staff/angles/<id>`, "The reference clip plays on it" or why not, an Undo button;
  `pushed_json.lucky_creators` = {angle_id, title, url, staff, created{angle, section, examples[{id, path}], clip},
  clip, by}. The card says "✓ On the Lucky creator app: <link>".
- **`undoLucky`** (`idea_undo_lucky`, approvers): deletes the examples it made (and their bucket objects unless
  another example still points at the path), the angle (its examples cascade; their files are deleted too), and a
  section it made that is still empty (`pinned=eq.false` guard). The R2 copy in `mobius-amb-media` stays (it is the
  watch's, not this push's).
- Tests: 5 Lucky checks in `test-ideas.mjs` against an in-memory PostgREST + Storage mock (`luckyMock`: eq / is.null /
  not.is.null filters, order, limit, cascade on angle delete, 401 on a wrong key). **NOT tested live:** the real
  PostgREST answers (column names are from migration 046/048 in the app repo, not from a live query), the Storage
  upload with a streamed body over 30MB, whether the app's signed-URL playback likes an object this worker wrote,
  and the app's `products` table shape for the club match (`kind=not.is.null`, `title`).

## 2026-10-04: the Meta tab's attribution is Triple Whale
`/api/overview`, `/api/series`, `/api/creative`, `/api/ads` (acct_cpa) and `/api/summarise` give
purchases/revenue/CPA/ROAS from `tw_ad_attr` lastPlatformClick on Meta ads (platform 'meta', or
platform NULL with an ad_id in `ads`: rows ~05-27..07-23 have NULL platform). Meta's own counts are
kept as `meta_purchases`/`meta_revenue`, rendered nowhere. Before 2026-05-12 (no TW data) attributed
fields are null, never Meta's. `agg()`: a window with unsynced days returns null totals but CPA/ROAS
over the synced days. Only the retired share link passes `{attr:false}`. The Strategist's overview
now sees TW numbers too.

## 2026-10-06: Ahsan's first live run, the reply gate, Drive, photos into Studio
What broke on Ahsan's Grunk thread and what changed (commits e7ca76a, 4f4b44e and the one after):
- **Routing words:** inspo / ideate / recreate / "make N ads" / "ads for this" are idea words. A bare
  tag with none of them and no media still goes to the Strategist.
- **Two names, one app.** The Strategist posts as "Strategist", the ideas bot as "Ideas" (both via
  `username`, falling back to the app name). The team sees which brain answered.
- **Reply gate (`replyForStrategist`, worker.js).** A plain reply in an OPEN Strategist thread is
  answered only when it is for the Strategist: a reply that tags a person is skipped outright; else
  Haiku 4.5 reads the last 8 messages + the new one and answers YES/NO (unsure = YES). An idea thread is
  closed to the Strategist (`closeStrategistThread`) the moment the ideas bot takes it, and
  `strategistThreadOpen` also refuses any thread in `idea_thread`. `file_share` replies now pass the
  subtype filter for plain messages too (Ahsan's untagged "Approve." + screenshots was dropped).
- **Google Drive opens** (`expandDrive`, ideas.js): a file or folder link becomes real images and
  videos read as Cole or Ahsan through `GOOGLE_SA_KEY` (`BRIEF_READERS`, exported from asana-brand.js),
  images via Drive's `thumbnailLink` at `=s1024`, videos via `alt=media`; labels and message tags are
  redone so V1/I1 still match the transcript. Google Docs in a thread are read with `readDoc` and put in
  the prompt. `UNOPENABLE` = Air, Dropbox, WeTransfer (no key we hold). Drive videos store clips like
  Slack uploads (`clipSource` drive branch; `media_json.file.drive` keeps the reader).
- **Images are read from Slack's `thumb_1024`** (8 max, was 4; `MAX_IMAGE_BYTES` only bites on
  originals), and the same 1024px copy goes to Studio. Studio's planner reads header dims from R2
  (`fitRefs`/`imageDims`) and leaves out anything over 2000px with a status line instead of failing.
- **The model sorts every image** (`IDEA_SCHEMA.images`: inspiration / product_studio /
  product_lifestyle / other; team words win). `pushStudio` turns product photos into the batch's
  product ("Photos from the Slack thread", handle `thread:<id>`, fingerprinted on open), inspiration
  goes on the lines (copy) or the swipe file, and `studio.use_photos` makes each lifestyle photo the
  ad itself (`line.photo`). "N variations of this" = testing `format` (one layout per line), never a
  words test, in both the ideas prompt and the Studio brief reader.
- **Problems view** on the Strategist (idea_run failures + `app_log` Studio errors + last sync error
  + known fixes) and a RULE to read it first when someone says something is broken. `studio-ai.js`
  writes `app_log` on every streamed failure (`logProblem`).

## 2026-10-07: the Strategist is one full strategist; Connections report

- `strategist.js`: playbook = thinking like a strategist (judge then recommend, gaps are findings,
  build do not describe), the Angle / Concept / What We're Testing framework + review workflow
  (from the mobius-brief-review skill), "How accounts are run" (the Lucky 2026-10-04 doctrine).
  Views `tests`, `brief`, `customers`, `scenarios`, `brain`, `integrations`; SQL over the brand
  workspace tables, tw_orders, tw_ad_attr, p_scenario, p_studio_batch, idea_thread. Actions
  `fill_brief` / `create_brief` (Asana, template html, Testing field, assignee, blanks listed),
  `build_scenario` (p_scenario + share link), `studio_batch`. Slack tool `draft_from_thread`
  (closes the Strategist thread, queues the idea job). `ideas.js`: "brief this / make a brief /
  draft it" with no media are the Strategist's; `nextNumber` is exported. Tests:
  `node test-strategist.mjs`. Knowledge sources: `docs/strategist-brain/`. No stored
  `strategistPlaybook` override exists in D1 (checked 2026-10-07); creating one hides the code copy.
- `integrations.js`: `integrationsReport(env, {brand})` for `GET /api/integrations` (admin) and the
  Strategist view. Reads env secrets for presence only (never values), `p_studio_cfg` (openai_key,
  canva_*), atriaStatus / frameStatus, and per-brand tables; every per-brand query is wrapped so a
  missing table (p_newclient before first use, p_shopify) reads as "not set up", never an error.
- **Klaviyo direct (2026-10-07, `src/klaviyo.js`).** Every brand uses Klaviyo and Triple Whale only
  carries totals, so each brand gets its own PRIVATE key (no agency-wide Klaviyo exists): pasted on
  Locus Settings > Connections (`PUT /api/brand-links {act, klaviyo_key}`), verified against
  `GET /api/accounts/` before it is stored in `p_br_doc` key `klaviyo` {key, account_id, company,
  verified_at}, never echoed (the report shows company + date; `data_json` is a blob column, so the
  Strategist's SQL cannot read it). Reads: lists, segments (profile counts), flows, campaigns with
  `campaign-values-reports` results, metrics; Strategist view `klaviyo` (`what`). Revision
  2025-07-15. Writes (segments, flows) not built. The same route takes `tw_shop`, `drive`, `frame`.
- **Connection steps.** Every per-brand item in `integrations.js` carries `steps` (exact clicks,
  names and links: Meta partner access with Business ID 695359915477596 per asset, not "all future";
  TW team invite; Klaviyo key scopes) and `input` when the fix is a paste. The Strategist's nightly
  `connections` check turns a missing or failing Meta / TW / Asana / internal channel / Klaviyo into
  a finding (one per brand per month) with the first step, so it reaches Slack.

## 2026-10-08: the Strategist as a CMO (knowledge base), TikTok direct, Attentive

- **Knowledge base.** `docs/strategist-brain/knowledge/*.md` (meta, tiktok, google-ads, seo-search, email-sms,
  retention-ltv, website-cro, offers-pricing, measurement-budget, cross-channel; each: how it works now, decision
  rules with thresholds, diagnostics, effects on the other channels, worked suggestions, traps, sources). Bundled
  into `src/knowledge.js` by `python scripts/build_knowledge.py` (run it after editing any file, then deploy).
  The Strategist reads it through the `knowledge` view (topic, part) and the PLAYBOOK opens with THE CMO METHOD:
  read the platform file AND cross-channel before any cross-platform call, name the lag, the noise band and the
  credit-shift checks. Measured: "raise Lucky Meta 25%" came back with lag per channel, the noise band from
  orders a week, the over-attribution ratio, and a phased 12% + 13% step (Sonnet 5, ~51k in / 5k out).
- **ask/engine.js loop fix (affects Ledger and Supply too, all three redeployed).** The last round used to drop the
  tool list while the history held tool calls; the API refuses that, so any question needing more than 5 lookups
  ended "I could not work that one out". Now the last round keeps the tools with `tool_choice: none`; rounds are
  5 / 8 (strong) / 10 (deep); max_tokens 1200 / 14000 / 20000 because Sonnet 5 and Opus 5 spend thinking inside it.
- **TikTok direct** (`src/tiktok.js`): agency OAuth (Cole signs in once on Ads > TikTok > Connect TikTok;
  `POST /api/tiktok/start`, public `GET /tiktok/callback`, token in `settings.tiktok_tokens`), per-brand advertiser
  id in `p_br_doc` 'tiktok' (Connections paste box `tiktok_id` via `/api/brand-links`), `GET /api/tiktok/report`
  (campaigns + days, cached an hour in `ttr:*`), Strategist view `tiktok_ads`. Needs Cole's developer app at
  business-api.tiktok.com (redirect `https://mobius-account-health.mobius-digital.workers.dev/tiktok/callback`)
  and the secrets TIKTOK_APP_ID / TIKTOK_APP_SECRET. Untested against the real API until then.
- **A brand's email tool**: `settings.emailTool:<act>` (Ice & Gold = attentive). Connections shows "Email:
  Attentive" instead of a Klaviyo row; the Strategist says email numbers come only from Triple Whale for it.
- **TikTok app status (2026-10-08):** developer registered (Agency, cole@) and app "Locus by Mobius Digital"
  submitted with every scope ticked, advertiser redirect `/tiktok/callback`, account-holder redirect
  `/tiktok/account-callback` (a placeholder page; TikTok requires it once the "TikTok accounts" scope is ticked).
  Pending TikTok review (up to ~3 days). Then: TIKTOK_APP_ID (not secret, Claude can set it) and
  TIKTOK_APP_SECRET (Cole pastes), then Connect TikTok on Ads > TikTok.
- **RULE: every new connection ships with its knowledge.** Adding a platform to Locus means, in the same change: a
  `docs/strategist-brain/knowledge/<platform>.md` file (same 7 sections), a Strategist view that reads it, a line
  in THE CMO METHOD if it changes the cross-channel picture, then `build_knowledge.py` + deploy.

## 2026-10-08: What moved to Slack, scheduled questions, chart blocks on dashboards

- **What moved, posted** (`src/moved.js`, `movedTick` in the hourly cron after `dashboardTick`): 8am to 1pm
  Central, once per Central day per brand (`settings.movedDone` = {date, acts}), to `accounts.slack_channel`
  only (never brief_channel), only when something moved. The rule is a COPY of profit hub.js `movedMany`
  (`movesFor`): keep the two in step. Differences on purpose: each brand's own timezone for yesterday, and a
  brand whose yesterday was not synced since its own midnight (`tw_daily.synced_at`) waits for the next hour,
  so a half-synced day never reads as a drop. Skips inactive brands, the paused ones and The Golf Sock by
  name. Block Kit: header, the rule in a line, one line per move with the number, normal and why, "Open in
  Locus" (`profit/?open=overview&act=`; a bare `?act=` does not switch brand). Switch: `settings.movedPost`
  ('off' stops it, on by default), in `GET/PUT /api/settings` and Locus Settings > Briefs and Slack.
  `GET /api/moved-preview` (admin) shows what would post now without posting. Checked 2026-10-08 against
  `/api/hub/moved`: identical moves (Bonk CAC, Dartee AOV, Lucky AOV, Party Patch orders; Golf Sock skipped).
- **Scheduled questions** (`src/askschedule.js`, table `p_ask_schedule` created on first use: id sq_, question,
  act 'all'|act_id, cadence daily|monday|first, hour_central, channel, created_by, created_at, last_run,
  last_status). Routes (admin, mounted at the top of the `/api/ask` block): `GET/PUT/DELETE /api/ask/schedules`,
  `POST /api/ask/schedules/run {id, dry}` (dry = build the message, post nothing, record nothing).
  `scheduleTick` (hourly, after movedTick): due = cadence day + `centralHour() >= hour` + not run this Central
  day; runs `engine.answerWeb` with the creator's ACCESS RULE (`brandsFor(created_by)`) and a "do not propose,
  save or build" prefix, posts as "Strategist" with charts turned into one "open Locus" line. Caps: 10 runs a
  Central day (scheduled + Run now, `settings.askSchedRuns`), 3 per tick, `subCanAfford(80)` each. Channels are
  INTERNAL only (any active brand's slack_channel or `strategistChannel`); the route refuses others. Strategist
  action `schedule_question` (routeAction: Apply = PUT through the caller's own front door) resolves "#name"
  via conversations.list or defaults to the brand's internal channel; view `schedules`.
- **Dashboard Slack posts** (`dashBlocks`): a `chart` block (a Strategist answer pinned in Locus) posts as its
  title plus "open in Locus to see it".
- **Per-block dates on dashboards (2026-10-10)**: a block's `dates` (profit dashboard.js `cleanDates`) overrides the
  dashboard's range. `dashNumbers` reads `dashPeriod` (storePeriod per brand, current + compare) once for the dashboard
  and once per distinct block range; `d.blk[i]` is that block's period (null = the dashboard's). `dashBlocks` draws the
  block from it and adds its range in italics under the title (`dashRange` handles `custom` from/to). The header line
  still carries the dashboard's range. `save_dashboard` (strategist.js) takes `dates` per block. Exported for
  test-dashrange.mjs: `dashNumbers(env, row, {accounts, read})`, `dashBlocks`, `dashRange`.

## 2026-10-08 (night): stock for the Strategist (`src/stock.js`)

- Service binding `SUPPLY` -> mobius-supply, auth = secret `SUPPLY_TOKEN` (the Supply ENGINE's own admin token; the
  engine accepts the Mobius session or that token, never this worker's ADMIN_TOKEN). Set 2026-10-08.
- View `stock` (`what` = summary | products | orders | drops): ease off / safe to scale / push to clear with ad spend
  per product (copy of profit hub.js `stockAds`: Triple Whale orders, never ad names), first_size_out, to order and on
  the way on brands we buy for, drops and keep-or-cut on brands that design. Not connected = says so. Lucky ~15KB.
- Actions `log_order`, `set_product`, `add_design` (proposals, applied through `/api/supply/*` on this worker, which
  forwards the routes in stock.js `SUPPLY_ROUTES` to Supply with the token; `add_design` with `_count` makes N
  designs; since 2026-10-12 the same proxy serves a client login's own brand, see CLIENT LOGINS). PLAYBOOK has a STOCK section; THE CMO METHOD lists the `stock` knowledge topic
  (`docs/strategist-brain/knowledge/stock.md`, rebuilt into knowledge.js).

## 2026-10-09: paid orders only, the Day check, integrations rebuilt
- **`paidOrdersOnly(daily)`** runs inside `syncTwDaily` before the insert: `totalOrders` = TW `totalOrdersWithAmount`,
  `newCustomersOrders` = new PAYING customers via `newPaid()`: the smaller of TW's raw new-customer count and the first
  paid orders seen in tw_orders (when tw_orders has >= 80% of the day's paid orders), else raw minus free orders. Raw kept as
  `totalOrdersAll` / `newCustomersOrdersAll`. Free orders were ~35% of Grunk's and Party Patch's orders Sep 1 to Oct 8;
  "all free orders were new people" over-corrected (Grunk 126 vs 271 first paid orders: creators seeded twice). History:
  `scripts/paid-orders-migrate.mjs` then `scripts/paid-newcust-recompute.mjs` (both idempotent, dry run without `--go`).
  Restore bookmark before: 00000d91-0000001c-000050ff-1617ad2734d47a64ba61cf6c4c94f38f.
- **moved.js is the Day check post**: only on a bad day, button `?open=yesterday`. `market.js` + `GET /api/market` (Pulse,
  Breezeway's public file, a once-per-date Haiku web search; `marketHandles` setting = X handles to read first).
  `POST /api/daycheck` = the verdict for the Day check screen (see profit/CLAUDE.md).
- **integrations.js** groups, levels, pick lists, email tool (see profit/CLAUDE.md "THE RESTRUCTURE").

## 2026-10-09: THE CALENDAR (`src/calendar.js`, Lineup moved into Locus)

- **Binding `CAL`** = Lineup's D1 `marketing-hub` (wrangler.toml). The SAME `events` / `changelog` / `people` rows the old
  Lineup app (worker `launch-calendar`) reads and writes, so clients (Nick at Grunk, Dartee) keep working there until they
  sign in to Locus. Added columns (guarded ALTERs in `ensure`): `locus_brand` (brand id), `asana` (JSON step -> task gid),
  `ticks` (JSON step -> {by, at}). Lineup brands are hyphen slugs (`grunk-dolfer`) = Locus brand slug with `-` for `_`;
  new rows write both `brand_id` (slug) and `locus_brand`. Writes use Lineup's type keys (product_launch, promo, ad_push,
  site_change, other) so the old app still shows them. Lineup's own Slack (`settings.slack_enabled`) was switched OFF for
  all its brands on 2026-10-09 so nothing pings twice.
- **One list, four sources**: typed events, `p_season_phase` (read-only), Supply drops (`SUPPLY` binding, brands with
  `makes`), Klaviyo email + SMS campaigns (`calklv:<brand>` cached an hour). Paused brands, The Golf Sock and Harborline are
  skipped by name.
- **The countdown ticks itself** (`stepsFor`): offer = written + confirmed (season: locked); photos = assets link; briefed /
  built = the Asana task "Make the Asana tasks" created is completed (`calasana:<brand>` cached 10 min), or a manual tick;
  email = a Klaviyo send within a day of going live; ads loaded = Meta `ads.created_time` in the 10 days before. Offsets in
  `STEPS` (keep the copy in profit/calendar.js in step). Once a date has gone live it has no countdown.
- **Routes** (admin): GET `/api/calendar?act&from&to&lite`, `/api/calendar/history?id`; POST `/api/calendar/event`
  (create or update), `/move` (shifts every date by the delta), `/end`, `/tick`, `/asana`, `/restore`; DELETE `/event?id`
  (status cancelled, logged). Every write logs to Lineup's `changelog`; the actor's name comes from `people`.
- **Slack** (`calendarTick`, hourly cron after scheduleTick; switch `settings.calendarPost`): client changes every tick
  (changelog rows after `calLogCursor` whose `changed_by` is not the team: go-mobius-digital.com people plus Nick Y. and
  Nick S.), then once a Central day from 8am (`calRemindDay`): live tomorrow (always, "All set" when done), one week out
  (only when something is open), Mondays "still running?" for a typed sale with no end live 7+ days. Brand internal channel.
- **Elsewhere:** Strategist view `calendar` + actions `add_date`, `move_date`, `end_date`, `make_asana_tasks` + knowledge
  topic `calendar` (docs/strategist-brain/knowledge/calendar.md). The Day check Slack post adds "On the calendar that day"
  (`liveOn`). The v2 Daily Brief adds "*Today:* X goes live" under the headline for drops and sales starting that day.
- **Client posts (2026-10-09, Cole: "a time and a place for internal and external")**: `clientMessages` = TWO posts to the
  brand's CLIENT channel (`brief_channel`): Monday "This week and next" (confirmed dates in 14 days, scheduled Klaviyo sends,
  "We need from you": photos, an offer to decide, a sale with no end) and a daily "Tomorrow: X goes live". Never tasks,
  owners or lateness. Off until `settings.calendarClient` = 'on'; `GET /api/calendar/client-preview?date=` shows what would
  post. Internal pings now fire only when something is still open.

## 2026-10-09: creative analytics, the Motion layer (`src/creative.js`)

- **Covers live in R2, not D1.** `adThumbnails` stores each cover once at `cov/<ad_id>.webp` in mobius-amb-media,
  shrunk to 600px WebP by the Images binding (`[images] binding = "IMAGES"`, ~40KB; the original if the binding
  fails), and returns `/cover/<ad_id>.<sig>.webp?v=` (public route, HMAC of the ad id with SESSION_SECRET, one-year
  immutable cache). Every card surface uses it, reports included (old frozen reports keep their base64). Old base64
  or Meta-link rows in `ad_creative` are redone on first view; rows older than 30 days are pruned by live calls.
  Covers are never deleted from R2 (reports point at them).
- **`ads.asset_key`** = `v:<video id>` | `i:<image hash>` | `c:<creative id>` (carousels). Filled by `keyTick`
  (the account ads edge, `ad.id IN` 25 at a time) and by `adThumbnails`. Locus "One card per creative" groups on it.
- **`ad_tag`** (PK asset_key; `act_id` is the META act id, so read it with `metaOf`): Claude Haiku 4.5 tags each
  creative once from the cover BYTES out of R2 (Anthropic could not download our cover URLs) plus the copy: format,
  hook, person, product, text_on_image, offer, message, notes. ~$0.0015 each. Failed rows retry after a day.
- **Hourly `creativeTick`** (after assetsTick): keys, then covers for ads that spent in 14 days, then 40 tags.
  `POST /api/creative-tick` {keys_only|tags_only, limit} runs it now (admin).
- **`/api/ad-breakdown?ad&from&to`** (admin): placement and age x gender from Meta insights, cached a day in
  `ad_breakdown`. Purchases there are Meta's count, labelled as such in the UI (TW cannot split by placement).
- **`/api/ad-original?ad=`** (admin): the ad's full image (or a video's biggest frame) at 1568px for Studio, not stored.
- Dashboard Slack posts show an `ads` block as its title plus "the cards are in Locus".

## 2026-10-09: THE STRATEGIST, VIKTOR-GRADE. Read before touching the Strategist, ask/engine.js or Slack events.

Plan and research: `docs/strategist-viktor-grade-plan.md`. Cole's bar: "Viktor grade in every sense" (Viktor = Opus 5.5
medium, reads Slack live, shared memory as short skill files). Tests: `node test-viktor.mjs` (19 offline checks).
- **No word lists.** Every Slack tag goes to the Strategist (ideas.js `ideaWanted` deleted); the ideas pipeline is its
  `draft_from_thread` tool. Model = preset, never keyword-picked: `settings.strategistModel` smart (Opus 5.5 medium,
  default) | quick (Sonnet 5.5) | deep (Opus 5.5 high); `!fast` / `!deep` in a message for one answer (`PRESETS`,
  strattools.js). Engine sends adaptive thinking + `output_config.effort`, `fallbacks: 'default'` (refusal fallback beta),
  `display: 'updates'` (progress notes become the live steps), handles `pause_turn`.
- **Slack index** (`src/slackindex.js`, tables `slack_msg`, `slack_chan`): every message event in a brand's internal AND
  client channel and the Strategist channel is upserted as it arrives (`indexEvent`, first thing in `handleSlackEvent`;
  edits update, deletes remove, DMs never). `/slack/owns` now claims client channels too, so the router sends their events
  here; the Strategist still answers ONLY in an internal channel. Hourly `backfillTick` walks each channel back 365 days
  (120 Slack calls a tick, least-recently-read channel first, bot token then Cole's user token, stops quietly on
  `ratelimited`). Kept forever. `search` (D1 LIKE, all words; Slack's own search.messages as Cole when thin, DMs dropped),
  `readThread` (live from Slack), `digest` (the brand's last 14 days, one line a message, 7k cap, in every answer).
  A channel the app is not in shows "Add the Mobius Digital app" on Locus > Agency settings > The Strategist.
- **Memory** (`src/stratmem.js`, `strat_fact`): facts per scope (brand id or 'agency') with a TOPIC; `remember` on the same
  topic REPLACES (old row `replaced`), `until` expires, 40 active per scope (older `archived`), `forget`, `recall`. The
  built-in engine `remember` is dropped (`dropTools`). Nightly `consolidate` (Sonnet 5.5 low, JSON schema) reads each
  brand's day of Slack (`settings.stratMemSince`) and upserts/forgets. **Skills** (`strat_skill`): name + "Use when"
  description in the prompt, body by `read_skill`; `save_skill`. **Runs** (`strat_run`): every answer's tokens, dollars,
  steps, seconds, who, brand (`onRun`), shown on the settings screen.
- **Anything Locus can do** (`src/strattools.js`): `locus_routes` searches `src/routes.js` (GENERATED by
  `node scripts/build_routes.mjs`: every /api route of both workers with its handler's first lines and the screen's own
  call; run it after adding routes), `locus_get` reads as the person (Locus: their own Authorization, so brand limits
  apply; Slack: a minted Cole session), `locus_write` = an Apply card that sends the same request (client sends and money
  routes refused by `CLIENT_FACING`). Profit routes go through the new `PROFIT` service binding.
- `post_file` (CSV / Markdown: Slack files.getUploadURLExternal + completeUploadExternal into the thread, or a download in
  the Locus chat), `web_search_20260209` + `web_fetch_20260209` server tools, `edit_creator_page`.
- **Context per answer** (`extraSystem`, stable first): standing instructions (`settings.strategistInstructions`), the
  brand brain (cached block), memory facts, skills list, the 14-day Slack digest. Brand = Slack channel's brand or the
  Locus screen's `act_id` (index.html AskUI screen now sends it).
- **Working state**: Slack = reaction (:mobius: if the workspace has it, else :eyes:), an "On it..." message updated with
  each step and a Stop button (`ask_stop`, router forwards `{run}` values to Locus), replaced in place by the answer with a
  cost line ($0.61 · Opus 5.5 · 9 steps · 53s). Locus = `/api/ask/progress?id=` polled every second, `/api/ask/stop`, cost
  under the answer. Progress rows are `settings askRun:<id>`; a step write never clears a Stop.
- Verified live 2026-10-09 in Locus: "what did Fela ask on the creator link, is it done" found the client thread (8 asks),
  read the public page and the route, answered per item; $0.61, 53 s.

## 2026-10-09: THE STRATEGIST CAN CHANGE THINGS (`src/metawrite.js`). Read before adding a write action.

Cole: "Viktor is connected directly with Meta, he can do anything with any ad account. Why can't the AI make changes
himself too? If he suggests doing something we approve it or change it up." Every write is an Apply card (engine
ACTIONS: propose describes, never writes; apply runs on the tap). Registered in strategist.js as
`tools: [...stratTools(d), ...writeTools(d)]` and `actions: [..., ...writeActions(d)]`; PLAYBOOK section "ACTING IN
META, ASANA AND DRIVE". Tests: `node test-metawrite.mjs` (14 offline checks, Graph API / Asana / Drive mocked).
- **Reads (tools):** `meta_read` (live campaigns > ad sets > ads: status, budget in dollars, bid strategy, optimisation,
  min / cap, targeting summary, creative ids; `status` live|all, `campaign`, `adset`, `ads`), `drive_list` (the brand's
  folder from `connections` kind drive, else `p_br_doc` profile.drive, else `p_newclient.drive_url`; or any folder; or a
  name search).
- **Meta actions:** `meta_pause`, `meta_resume`, `meta_budget` (daily or lifetime, whichever it runs on; card = dollars and
  % change; over 50% refused unless `big: true`; an ad set inside a campaign budget is refused and pointed at the
  campaign), `meta_min_spend` (`daily_min_spend_target` / `daily_spend_cap`, 0 clears, CBO ad sets only), `meta_rename`,
  `meta_duplicate_adset` (`/copies` deep_copy, PAUSED, then renamed and optionally its own daily budget),
  `meta_create_ad` (image URL fetched by the worker -> `adimages` bytes -> `adcreatives` object_story_spec with the
  page + Instagram account read from the ads already in that set, else the account's only promote_page -> `ads`;
  PAUSED unless `live: true`; or an existing `video_id` with its `picture` as the thumbnail), `meta_undo` (write id or
  "last" per brand, 24 hours: puts back the before-state, or ARCHIVES what a write created).
- **The rules every Meta write keeps:** look the object up first (`findObject`: numeric id, or name via the edge
  `filtering [{field: '<level>.name', operator: 'CONTAIN'}]`, exact match wins, several = refused with the list);
  the object's `account_id` must be one of the brand's Meta connections; `metaCan(env, act, d)` reads the token's
  `user_tasks` (MANAGE or ADVERTISE) + `me/permissions` (ads_management), cached in `settings metaCan:<act>` an hour
  for a yes, five minutes for a no; a no refuses the card with the fix ("Give the Mobius Tools system user Manage
  campaigns on <account> in Business settings > Ad accounts > Assign partners (Business ID 695359915477596)"). Apply
  RE-READS the fields it changes and refuses if anything moved since the card. Every write: one `p_meta_write` row
  (before/after JSON, by = the approver; table also in schema.sql, created on first use) and one manual `activities`
  row (event_type `strategist_write`, actor "the Strategist, approved by <who>", category budget / campaign_paused /
  ad_paused / new_adset / new_creative / name, reason = the card's why). Meta's own activity sync will ALSO bring in
  its row for the same change: two lines, on purpose.
- **Who approved:** worker.js passes `who` in the apply ctx: the Slack tapper's handle, or the Locus session email.
- **Asana:** `asana_task` (section by name, assignee by first name, `due_on`), `asana_comment` (stories), `asana_complete`;
  a task by gid, Asana link, brief number or words in its name (the brand's project from `p_br_doc` 'asana').
- **Drive** (as Cole through GOOGLE_SA_KEY delegation): `drive_copy_to` (files only; brand folder, a subfolder by name, or
  any folder), `drive_share` (reader / commenter / writer, no Google email unless `notify`; the card says "outside
  Mobius" for any non go-mobius-digital.com address). Writes need the full `https://www.googleapis.com/auth/drive` scope
  on the delegation; without it the Apply says exactly that.
- **NOT tested against the real APIs (only mocks):** every Graph write (status, budgets, min/cap clearing with "0",
  `/copies` deep copy limits on sets with many ads, adimages bytes upload, the creative spec, the `<level>.name`
  CONTAIN filter), the Drive full scope, Asana stories. The first live card of each kind is the test; the card or the
  Apply says what Meta answered.
- **What Cole grants per ad account** before any Meta card can be applied: in Business settings > Ad accounts, the
  Mobius Tools system user with Manage campaigns. The token also needs ads_management (if the Monday "Do it" button
  shows on a brand, both are already in place there).

## 2026-10-09: Google Ads in depth (`src/google.js`)

- Reads, all admin, all `?act=&from=&to=`, each ONE report cached an hour in `settings` (like `gads:`), errors never
  cached and returned as `{error, fix}`: `/api/google/ads` (campaigns + days, 2 GAQL), `/api/google/ads-ads` (`gadad:`,
  top 20 `ad_group_ad` by cost with RSA / Demand Gen / display headlines and descriptions, plus `asset_group` metrics for
  Performance Max; 2 GAQL in parallel, an asset-group refusal never sinks the ads), `/api/google/ads-terms` (`gadst:`,
  top 50 `search_term_view` by cost), `/api/google/ads-changes` (`gadch:`, `change_event`, 200 newest; `from` clamped to
  today minus 29 days because Google keeps 30 days; `describeChange` turns each row into who / via / category / plain
  summary / fields old to new, budgets in dollars from micros, target ROAS as %; `matters` = budget, bids, status, new,
  keywords).
- API v25 through the MCC `GOOGLE_ADS_MCC` 5566468199 (login-customer-id), Explorer access (2,880 operations a day).
  Every call goes through xfetch (`googleFetch(xfetch)`), so it counts against the subrequest budget. Verified
  2026-10-09 on Lucky 6859198499 and Bonk 2589863833: nothing refused (change_event, search_term_view, asset_group
  metrics and the Demand Gen ad fields all answered).
- The Strategist reaches them through `locus_get` (routes.js rebuilt). strategist.js has no view for them on purpose.

## 2026-10-09: LIVE CHECKS, ALERTS, SCHEDULED TASKS, DMs (`src/checknow.js`, `src/alerts.js`). Read before touching them.

Cole: Viktor "can set automations and checks". Tests: `node test-alerts.mjs` (19 offline checks: curve math, today vs
normal, signs, cache, market, rules, the three windows, goal / fixed, isDue, the tick firing once, routes, the
Strategist's tools and cards, scheduled task / check / dashboard / report, router DMs).
- **Right now** (`checknow.js`, `GET /api/daycheck/now?act=&fresh=1&web=1`, Strategist tool `check_now`, the Day check
  "Right now" card in profit/desk.js): today so far vs a NORMAL DAY BY THIS HOUR = the brand's last 28 days (tw_daily;
  Meta from hourly_insights) x the share of a day done by now from the brand's own hourly curve (TW hourly charts for the
  last 5 days, fetched once a local day, `cnshape:<brand>`; else Meta's spend curve; else a straight line, and it says
  which). Today = the TW live summary (same call as /api/tw-day): revenue = total sales less tax, PAID orders, new
  customers less free orders, blended spend; Meta live by the hour (spend and CPM only, never Meta purchases). Meta hourly
  history is backfilled 28 days once when under 14 days (`cnbf:<meta act>`). Signs with stated thresholds (revenue under
  50% / 75%, no orders in 3 finished hours when about 3+ are normal, Meta spend under 50%, CPM up 35%+, MER under 60%);
  nothing before 8% of the day. Market: Pulse now + today, Breezeway's latest day; the Haiku web search of the last few
  hours ONLY on demand (`web`, about 3c, `checknow:web`). All cached 10 minutes in settings (`checknow:<brand>`, `checknow:market`).
- **Alerts** (`p_alert`, created on first use; `"window"` is quoted on purpose). Metrics revenue, orders, new_customers,
  spend, mer, cpa (blended spend / paid orders), roas (Meta on TW lastPlatformClick, finished days only: refused for
  today), meta_cpm. Window today | yesterday | last7; baseline normal (today: by this hour; finished: the 28 days before) |
  goal (goalsFor pro-rated / target_cpa / target_roas; none = says set it on Home > Goals) | fixed (threshold = the
  number). Threshold is a PERCENT for normal / goal. `alertTick` (hourly, after scheduleTick, `subCanAfford(40)` per rule):
  a rule with an hour is checked once a Central day at or up to 2 hours after it; no hour = every hour 9am to 9pm (today)
  or from 8am (finished days); an unsynced day WAITS (not marked checked); fires at most once per Central day
  (`last_fired`). Message: tag, the number, the normal, the rule in words, Open in Locus (`?open=yesterday&act=`).
  Channels: internal (askschedule `allowedChannels`) or a full member's DM (U id; guests refused). Routes (admin):
  `GET/PUT/DELETE /api/alerts`, `POST /api/alerts/pause`, `POST /api/alerts/test {id|rule, post}`.
  Locus: Reports > Dashboards > Alerts (askextra.js `alerts`: add / edit / pause / delete / test now / post the test).
- **Strategist** (strategist.js: one import + `...autoTools(d)` / `...autoActions(d)`; deps arrive as `d.auto` =
  worker.js `autoDeps()`): tools `check_now`, `list_alerts`, `ask_ledger`; Apply cards `create_alert` (its description
  carries Cole's example; "tell me if..." is judged from meaning, no word list), `pause_alert`, `delete_alert`, `schedule_task`.
- **Scheduled tasks** (askschedule.js, columns `kind` + `ref` by guarded ALTERs; cadence `weekdays` added): question (as
  before) | task (the Strategist runs the instruction; each proposal is posted as an Apply card in the thread under the
  answer, never applied) | report (make_report text posted) | check (checkNow posted, no model) | dashboard
  (`postDashboard` to the schedule's channel, no model). Only question / task / report count toward the 10 a day.
- **DMs go to the Strategist** (slack-router: `dm || locusOwns`; since 2026-10-14 a group DM (mpim) too, and `/slack/owns` says yes for a group DM because an app_mention carries no channel_type, `isGroupDm` caches conversations.info per channel; a channel nobody owns is dropped, the Ledger has its own app). `handleSlackEvent` DM path: `dmGate` = Slack users.info,
  full members only (no guests, strangers, bots), a Mobius email (`emailAllowed`) or a userBrands person (ACCESS RULE in
  the note); the brand comes from the words. The Ledger lost nothing: it only answered TEXT asks in DMs (a DM with a file
  was ignored there) and reads receipts from #receipts by its own poll. **`ask_ledger`** (Cole only: Slack user
  U06C37MDWD7 or his email; Locus = Cole's session or the admin key) POSTs to the Ledger's `/api/ask` over the new `LEDGER`
  service binding with a minted Cole session and returns the answer; Ledger proposals are not applied from here.
- NOT tested live at build time: TW hourly charts for past days (the curve), the 28-day Meta hourly backfill size, the web
  search prompt, posting an alert to a U id, a DM end to end, the Ledger binding answering.

## 2026-10-09: THE STRATEGIST MAKES THINGS (`src/stratmake.js`): images, PDF reports, a code sandbox, Frame

Cole: "can it build a nice PDF report? build images right then and there with Studio, analyze it, produce it in the
chat? build dashboards and link them? Viktor can do literally all of that." Registered in strategist.js with one import
and three spreads (`...makeHooks(d)`, `makeTools(d)`, `makeActions(d)`). Tests: `node test-stratmake.mjs` (18 offline
checks; OpenAI, Anthropic, Shopify, Slack and Frame mocked).
- **Engine hooks (ask/engine.js, generic):** a tool result may return `content` (an array of blocks, e.g. text + an image)
  and `cost` (dollars spent outside the model, added to the answer's cost line); `onReport(env, report, ctx)` merges
  fields into every make_report; `afterSlack(env, r, ctx)` runs after the answer and the report text are posted. A report
  with `share` gets "Open the report" / "PDF" link buttons (one actions block each, action_id `noop_open`, the only link
  id the router acks).
- **make_image:** Studio's path (OpenAI GPT Image, key `p_studio_cfg.openai_key`, newest non-mini `gpt-image*` from
  /v1/models). A named product = its Shopify photos (brand_accounts.tw_shop products.json, up to 3) + up to 2 photo
  library shots (`p_asset.products` LIKE, thumb from R2) + its fingerprint (`dna:<brand>:<handle>`, else the storage
  prefix). Brain excerpt (1,500 chars) for tone only. Formats 1:1 / 4:5 / 9:16 with Studio's layout rules. Stored at R2
  `strat/<24 hex>.png`, row in `strat_media`, served by `GET /strat/<id>.<ext>` (public by id; `?dl=1` = attachment).
  The model gets the image back (768px JPEG via the Images binding) and may redo ONCE (`redo_of` + `fix`). Caps: 4 per
  answer, 60 a day (`settings.stratImgDay`). Slack: uploaded into the thread after the answer, never the one that was
  redone. Locus: inline with Download and "Open in Studio" (`POST /api/strat/studio {id}`: copies the PNG to
  `studio/ref/<id>.png` and makes a one-line DRAFT batch with it as inspiration; the team picks the product and Makes).
- **Reports:** every make_report gets a token in `strat_report` (32 hex): `GET /r/<token>` = the light, printable page with
  the Locus header (public, noindex), `GET /api/report-public?t=` = the spec, `GET /r/<token>.pdf` = the PDF. **PDF path:
  Anthropic's code sandbox, not Browser Rendering.** This worker has no `browser` binding and no package.json; adding
  @cloudflare/puppeteer would make every other deploy of it need npm install. The sandbox has reportlab + matplotlib, so
  `scripts/render_report.py` (bundled into `src/reportpy.js` by `node scripts/build_reportpy.mjs`; check it locally with
  `python scripts/render_report.py spec.json out.pdf`) is uploaded with the spec through the Files API and Haiku 4.5 runs
  one fixed command that writes `$OUTPUT_DIR/report.pdf`. Kept in R2 `strat/rep-<token>.pdf`. Slack renders it while the
  answer is written and uploads it after the report text; Locus renders on the first click of "PDF file".
- **run_analysis:** its OWN Messages request (Opus 5.5, effort medium, `code_execution_20260521`, falls back to
  `_20250825`), never beside web_search/web_fetch (those bundle their own code execution). The rows the Strategist already
  fetched go up as `container_upload`; files the sandbox leaves in `$OUTPUT_DIR` come back by `file_id`
  (`outputFileIds`), go to R2 + `strat_media`, then the Slack thread or Locus downloads; the Files API copies are deleted.
  Caps: 3 per answer, 170 s, 2 MB of data, 6 files; pause_turn continues on the same container.
- **Frame (V4):** tools `frame_list` (project = input, else the brand's `connections` kind frame link, else the project
  named like the brand; folders by a path of names or an id) and `frame_share` (POST `/projects/<p>/shares`, type asset,
  public by default, downloads off, returns `short_url`); Apply cards `frame_folder` (refuses a twin name) and
  `frame_move` (PATCH `/files|folders/<id>/move`). **NO DELETE, no archive, nothing that removes**: a test checks it.
- **Dashboards:** save_dashboard already builds from words, so no new tool. The Slack Apply reply now turns any Locus /
  share / Frame link in the note into a button ("Open the dashboard" for `?open=dash`); Locus links them in the card.
- **Costs per use:** image $0.25 (1:1) to $0.42 (9:16) from OpenAI's usage, plus the model looking at it (~1.5k tokens);
  PDF ~$0.003 of Haiku tokens (container time is inside the free 1,550 hours a month); analysis ~$0.05 to $0.40.
- **Verified live 2026-10-09:** `/r/<token>` page and `/r/<token>.pdf` on a test row: Files API upload, the sandbox run
  (Haiku 4.5 + `code_execution_20260521`), the reportlab render and the download back all worked, 13 s, a clean 2-page PDF
  (test row and file removed after). **NOT tested live (mocks only):** make_image through this worker (needs a real ask;
  Studio's own key), run_analysis on Opus (same sandbox code as the PDF, so the plumbing is proven; the analysis is not),
  Slack uploads of images / PDFs from the queue, every Frame call (list, share body, folder, move).

## 2026-10-09: the same Meta writes from a Locus screen, and Google campaign writes

- `metawrite.js` section C: `locusWrite(env, d, {act, kind: pause|resume|budget|min_spend|rename|duplicate, level,
  object, amount|min|cap|name|daily_budget, dry, expect}, {who})` runs the SAME action's propose + apply as the
  Strategist (one code path: brand check, metaCan, before/after, p_meta_write, Change Log). `dry` returns summary,
  detail, before; the write proposes again from a fresh read and refuses (`stale`) when `expect` no longer matches.
  Budget from a screen passes `big: true` (the person typed the number; the modal warns over 50%). Logged with
  `ctx.via = 'locus'`: event_type `locus_write`, actor "<email> in Locus". `locusUndo` (24h, same brand only) and
  `metaLive(env, d, brand)` (live status, budgets, min/cap per object + `can` / fix per ad account, ~3 to 9 Graph reads).
- Routes (worker.js, one block before Send to Slack): `GET /api/meta/live`, `POST /api/meta/write`, `POST /api/meta/undo`,
  `POST /api/google/write`; admin + brandsFor. After a Meta write the synced row in meta_campaigns / meta_adsets takes the
  new status / budget / name / min at once.
- google.js `adsCampaignWrite(env, act, {kind: pause|resume|budget, object, amount, dry, validate, expect})`: reads the
  campaign and its budget fresh, refuses shared and total budgets, `campaigns:mutate` (status) or
  `campaignBudgets:mutate` (amount_micros), drops the `gads2:` cache. `adsReport` now carries `budget`, `budget_total`,
  `budget_shared` per campaign (cache key `gads2:`).
- Tests: test-metawrite.mjs has a Locus check (dry, stale, write logged as the person, undo, another brand refused,
  read-only refused, metaLive). 15/15.

## 2026-10-09: KLAVIYO, READ IN DEPTH AND CHANGED FROM LOCUS (`src/klaviyo.js`, `src/klaviyowrite.js`)

Cole: "Should I be able to edit email stuff the same way I can edit ads, with the AI strategist and from within
Locus? Am I missing stats or charts?" Screens in profit/CLAUDE.md (same date). Tests: `node test-klaviyowrite.mjs`
(10 offline checks, Klaviyo mocked), `node test-klaviyo.mjs` (4, brought up to date).
- **New reads** (`GET /api/klaviyo?act=&what=`, admin, brand limits apply): `daily` = Klaviyo metric-aggregates (event
  time, 60 calls a minute, NOT the reporting endpoints' 2 a minute), 180 days in the account's zone: Placed Order by
  `[$attributed_channel, $attributed_flow, $attributed_message]` (one call: email vs SMS revenue and orders, flows vs
  campaigns, `by_flow` / `by_message` = revenue per day for the last 120 days, from `attr_from`; a campaign's message
  key is usually the CAMPAIGN id, so match both), then one count each for Received / Opened (unique) / Clicked
  (unique) / Bounced Email, Marked Email as Spam, Unsubscribe, Received / Clicked SMS, subscribed vs unsubscribed
  (names tried in order in `MET`; `metrics_missing` says what an account lacks, e.g. Lucky has no Klaviyo SMS
  metrics). About 15 calls, 3 s on Lucky. `flow&id=` = one flow's messages named (each `/api/flow-messages/{id}`) with
  their stats from the cached flows_report. `templates`, `audiences` (list + segment names, default sender),
  `attentive&from&to` (tw_ad_attr rows on Attentive links), `can` (write scopes).
- **Changed reads:** `campaigns` now reads email AND SMS lists (Klaviyo requires a channel filter), keeps
  `message_id`, `audiences`, `send_at` (the strategy's datetime; `scheduled_at` is when it was scheduled), adds
  `upcoming` (drafts and scheduled), spam and bounce rates; SMS results in their own report, best effort.
  `flows_report` lists every non-archived flow (zero-send ones too, with status) and keeps `messages` per flow.
  **Cache keys for those two are `klv:<act>:campaigns:2` / `flows_report:2`** (the shape changed; an old copy must
  never be served as the new one). `klaviyo()` retries a 429 up to twice when Retry-After is 6 s or less.
- **Writes** (`klaviyowrite.js`, `OPS`): flow_status (live / manual / draft), campaign_draft (name, audiences by name
  or id, exclude, subject, preview, sender defaulting to the account's, template by name or id; created with NO send
  strategy, template attached with `/api/campaign-message-assign-template/`), campaign_schedule (a DRAFT only, a
  fixed time 15+ minutes and under 120 days ahead; PATCH `send_strategy {method: static, datetime, options:
  {is_local: false}}`, READ BACK, and only then `POST /api/campaign-send-jobs/`; if Klaviyo did not keep the time
  nothing is sent), campaign_unschedule / campaign_cancel (`PATCH /api/campaign-send-jobs/{id}` action revert /
  cancel), campaign_duplicate (`/api/campaign-clone/`). **Nothing ever sends immediately.** Every op: propose (looks
  the object up, before -> after, no write) then apply (re-reads, refuses if it moved), one manual `activities` row
  filed under the brand's Meta account (event_type `klaviyo_write`, category `email`, actor "<who> in Locus" or "the
  Strategist, approved by <who>"), and `bust()` drops the cached reads. Attentive brands are refused.
- **Route** `POST /api/klaviyo/write {act, op, input, confirm, expect}` (admin, brandsFor): without confirm = the card
  (no patch); with confirm = propose again server side (the browser's patch is never trusted), 409 if the summary
  changed since it was shown, then apply with `who` = the session email.
- **Scopes:** `klaviyoCan` probes with a PATCH on an id that cannot exist (`/api/flows/LOCUS0/`,
  `/api/campaigns/LOCUSPROBE0/`): 403 = scope missing, 404 = present; templates by a GET. Cached in settings
  `klvCan:<act>` an hour (yes) / 5 min (no); `probe` keeps the raw answers. A missing scope refuses the card and the
  route with `fixFor`: "create a private key with flows:write (Flows: Full access) ... paste it in Brand settings >
  Integrations > Klaviyo". Probed 2026-10-09 on all five keys (Bonk, Dartee, Grunk, Lucky, Party Patch): every key
  has flows:write, campaigns:write and templates:read. Not proven against a read-only key that a missing scope
  answers 403 BEFORE the 404; if not, the write itself still returns the same fix on its 403.
- **Strategist** (registered in strategist.js by one import and a spread in tools and actions): tool `klaviyo_read`
  (what = campaigns | flows | flow | lists | segments | audiences | templates | daily | can), Apply cards
  `klaviyo_flow_status`, `klaviyo_campaign_draft`, `klaviyo_campaign_schedule`, `klaviyo_campaign_cancel` (mode
  unschedule | cancel). The card refuses with the scope fix before anything is read.
- **NOT tested against the real API (mocks only):** every write. Reads were run live on the dev worker against
  Lucky (daily, campaigns, flows_report, flow, audiences, templates) and the all-brands board on five brands. The
  first real Apply of each kind is the test; the modal shows what Klaviyo answered.

## 2026-10-09: CLIENT LOGINS, THE BRAND EDITION since 2026-10-10 (`src/clients.js`, `src/brandguard.js`). Read before touching auth, /api/me or any route a client might reach.

THE RULE (Cole, 2026-10-10): "Locus is literally everything now. A client should have access to absolutely everything." A
client login is the BRAND EDITION: every page, number and action a single brand has, for its own brand, through the same
routes the team's screens call. The AGENCY EDITION adds only what runs many brands at once. The list, the per-page table
and the rule for new pages: `docs/locus-hub/editions.md`. This section replaces the 2026-10-09 read-only rules and the
four access switches (P&L, Strategist, Changes, Creators are gone; `CLIENT_SWITCHES` stays, always true, for old callers;
`settings.clientAccess` is not read).

- **Three roles.** owner (Cole or the admin token), team (@go-mobius-digital.com or `settings.allowedEmails`), client
  (`settings.clientUsers` = {email: {brands, name, invited_at, invited_by, last_invite, last_sign_in, last_seen,
  welcomed_at}}). Clients are NOT in allowedEmails. `googleLogin` accepts a client email (`isClientEmail`), records
  `last_sign_in` and returns `role`. A team guest or a Mobius-domain email is never a client.
- **brandguard.js is the whole rule** (same file in profit/worker/src; `test-clients.mjs` checks they are identical). Still
  an ALLOWLIST (`CLIENT_RULES`): a route not on it is 403 before any handler, so a new agency route is closed to clients
  until someone adds it. A rule is `m` + exact `p`, or `re` (an anchored pattern with the id in it, never a prefix).
  On an allowed route: the brand (query `act`, JSON body `act` / `act_id` / `screen.act_id`, or the path for
  `act: 'path'`) must be one of the client's ("all" never); `ads` ids must be theirs (`ads` table); `own` = records named
  by id must belong to their brands (p_dashboard, p_scenario, p_studio_ad, p_studio_batch, activities, p_amb_proof; a row
  with no brand, like an all-brands dashboard, is refused); `fields` = the only body keys a write may carry (brand
  settings: name, budgets, tz, goal CPA / ROAS, goals; Integrations: their own keys and links, never a Meta, Triple
  Whale, GA4, Search Console or Google Ads id, which would read another brand through Mobius's access); `prep` rebuilds
  the body (a dashboard keeps the team's Slack posting); `cap` charges Mobius's AI money. Then `clientScope(request)` is
  set on the request the handler gets (`guardBrands(..., handle(req))`), so `isAdmin` passes exactly that request.
- **Answers** are filtered (`filterActs`) and scrubbed (`scrub`): Slack channel ids (by key, and any `C...` id under a
  key naming a channel or post), report config, review_first, brief_enabled, steer, team notes. Costs, margins and change
  logs are NOT scrubbed any more. `/api/reports` and `/api/briefs` keep sent rows, `/api/report` 404s a draft, `/api/brief`
  keeps sent history, `/api/dashboards` keeps the brand's own boards, `/api/integrations` answers `agency: []`.
- **Daily caps** (brandguard `CLIENT_CAPS`, `capUse` / `capAdd`): `clientStudio:<day>:<email>` $3 (Studio images and
  video, the copy desk; a fixed estimate per call, charged when the handler answers under 400) and `clientAsk:<day>:<email>`
  $2 (the chat, the AI reads on screens, the change summary, the scenario parser). Over = 429 with a plain message.
- **The assistant** (`clientAsk`): the SAME engine as the team (`ask/engine.js` answerWeb) in its client mode
  (`extra.client`): tools = the Strategist config's `clientTools` (locus_routes filtered to the client's routes,
  locus_get through the client's OWN sign-in so the guard applies, make_report, post_file) plus web search; never the SQL
  gate, app views, memory, skills, Slack or actions; the system prompt is the ACCESS RULE, the brand's brain
  (`clientSystem`), the date and the screen, never the playbook, the company brief, standing instructions or the active
  brand list. Not counted on the team's daily question cap; logged in the usage log under the client's email. A client may
  read and Stop only its own run (`askRunWho:<runId>`, `clientOwnsRun`).
- **Calendar** (calendar.js): add, edit, move, end, note, remove, put back its own brand's dates; never tick the team's
  work steps or make Asana tasks. **Season**: the War Room hides only `notes`; a client's PUT never writes notes or alerts.
  **Inspiration**: `/api/atria/board` takes `act` and only the brand's board or the shared season boards
  (`swipeBoardsFor`, profit season.js).
- **Still the team's, and why**: research runs, skill and speaker builds (long Opus jobs); Drive sync of the Library; Asana sync and results; TikTok connect; data repairs
  (Meta sync, Triple Whale attribution re-pull); everything in the agency list.
- **Routes** (clients.js): `GET /api/clients?act=` (team), `GET /api/clients/draft`, `POST /api/clients/invite {emails,
  brands, name, send, approved, subject, body}` (OWNER; the email from Cole's Gmail only with send + approved),
  `POST /api/clients/remove {email, brand?}`, `GET/PUT /api/clients/me` (the client: name and welcomed only).
  `PUT /api/clients/access` is gone.
- **Adding a page clients should see = add its routes to CLIENT_RULES** (both copies) and a line in test-clients.mjs
  (`PAGE_ROUTES` for a read, the writes check for a write).
- **Tests:** `node test-clients.mjs` (24 checks: every page route answers a client for its brand on both workers, another
  brand / an old Meta id / "all" refused on all of them, every agency-only route 403, own-brand writes only, the scrub,
  sent-only briefs and reports, the assistant's client mode with a mocked model, the daily caps, calendar, War Room,
  survey, ads, Inspiration boards, invites, Stock, Buying and Drops through the Supply proxy).
- **2026-10-12: Stock, Buying and Drops are the brand's** (Cole: "the brand itself is the owner of the brand; buying and
  stock changes is literally a brand thing"; this replaces the 2026-10-10 read-only Stock and Drops). `GET
  /api/supply/client?act=<brand>&what=brands|state` (stock.js `supplyClient` + `clientSupplyState`) returns the WHOLE
  state of one brand (costs, factories, suppliers, order money, suggested orders, notes, Asana card links); only the
  agency's wiring is left out (`AGENCY_SETTINGS`: the Slack channel, the digest switches, which Mobius Asana project).
  Every Supply change the team has is on CLIENT_RULES as `/api/supply/<route>` (orders POST/PUT/DELETE,
  products/<id> PUT, slots POST/PUT/DELETE and slots/<id>/asana GET/POST, collections POST/PUT/DELETE,
  shopify/snapshot and backfill, settings, brand, factories, lines, type-map, categories). worker.js hands
  `clientScope(request)` to `handleSupplyProxy`, which for a client RESOLVES the Supply brand from the client's own Locus
  brand (`supplyBrandOf(act)`), ignores any `?brand=` it sent, forwards with SUPPLY_TOKEN and X-Actor =
  `Name <email> (brand login)`, holds `/settings` to `CLIENT_STOCK_RULES` and `/brand` to buys/makes (brandguard
  `fields` says the same), and refuses a DELETE of an order whose id does not carry the brand's prefix (Supply deletes
  order lines by id alone). The team's calls are unchanged (`?brand=`, actor "(via the Strategist)"). Tested with a
  mocked SUPPLY binding that records method, brand, token, actor and body.
- **The 'dev' signing key is gone** (2026-10-09): neither worker verifies anything locally without a key; the profit worker
  asks this worker (`delegateWho`, cached a minute).

## 2026-10-09: client switches ON by default; the command center's work feed (`src/command.js`)
- (Superseded 2026-10-10: the switches are gone, see CLIENT LOGINS above.)
- `GET /api/command/work` (team; brandsFor-limited): Asana overdue / stuck per brand, new clients with steps left
  (`STEPS` now exported from newclient.js), alerts fired in 48h. `POST /api/read` with `screen: 'command'` uses
  `COMMAND_SYSTEM` and returns `order`.
## 2026-10-09: the message itself, GA4 drill-downs, Microsoft Clarity

- **`GET /api/klaviyo?what=message&kind=campaign|flow&id=`** (klaviyo.js `messageView` / `readMessage`): subject,
  preview, sender and the template HTML of a campaign-message or flow-message (`/api/<campaign|flow>-messages/{id}/`
  then `/template/`), filled by `POST /api/template-render/` when it has tags (sample `first_name`), or the SMS body.
  A campaign id (the day-by-day read's message key is sometimes the campaign) resolves to its first message. Kept 30
  days in `settings` `klvmsg:<act>:<kind>:<id>`; HTML over 900K characters is answered but not kept. Verified live on
  Lucky (campaign email 37K chars, SMS campaign) and Party Patch (flow email).
- **google.js**: `websiteReport` (cache `g4v3:`) now returns `prev_days`, more per day, channel / landing / source /
  device / new-vs-returning rows WITH the window before (`g4By`: two named date ranges in one request) and funnel
  steps per row; landing pages are `landingPage` (no query string). `websiteDrill` = `GET /api/google/website-drill
  ?kind=channel|source|page|device|nvr&value=` (cache `g4d2:`): one slice's totals, days (both windows), devices and
  its other side (a page's channels and sources; a source's landing pages).
- **clarity.js** (`/api/clarity`, admin + brandsFor; one route block above /api/brand-links, and `clarity_token` on
  /api/brand-links for the Integrations paste box): Clarity Data Export API
  (`https://www.clarity.ms/export-data/api/v1/project-live-insights`, Bearer project token, numOfDays 1 to 3, up to 3
  dimensions, 10 calls a project a day). Token + project id in `p_br_doc` key `clarity` (never returned). The per-page
  read (numOfDays=3, dimension1=URL) is cached 8 hours in `clarity:<act>:pages`; once a UTC day a whole-site read is
  appended to `clarity:<act>:hist` (90 kept); calls counted per brand per UTC day in `clarityCalls:<act>` and refused
  at 9. `shapeInsights` joins Traffic, ScrollDepth, EngagementTime and the click metrics (`sessionsWithMetricPercentage`
  = % of the page's sessions, `subTotal` = times) per URL. PUT {act, token, project?} checks the token with one real
  read; PUT {act, project} sets the id for links; DELETE forgets. integrations.js has a per-brand "Microsoft Clarity"
  item (group Website). Tests: `node test-clarity.mjs` (8 offline checks, Clarity and Klaviyo mocked). NOT tested live:
  any Clarity call (no brand has a token yet), so the response field names come from Microsoft's docs and sample.

## 2026-10-10: Launch to Meta (`src/launch.js`)

- Closes the creative loop: an approved Studio ad (or a creator asset: image link or Meta video id + @handle) becomes a
  Meta ad, PAUSED, in the right ad set, tied to its test. The ad is made by metawrite.js `meta_create_ad` (propose, then
  apply, ctx.via 'locus'): one Meta write path with the Strategist and Ads > Meta (brand check, metaCan, adimages upload,
  p_meta_write for undo, Change Log line as the person). `live` is never passed, so every launch is born PAUSED.
- Naming: `<test> <letter> | <Format>` ("415 B | Still"), creator `<test> <letter> | @handle`. Letter = Studio line
  (0 = A), moved to the next free letter when an ad with that number already uses it (Meta names + p_launch). No test
  number = `<headline> | Still` with a warning. Preview/create refuse a name that does not start with the test number.
- Ad set: the test's own ad set (numOf of the name = test number), else the newest live ad set in a campaign named
  like "test", else the newest live one; the person can pick any non-archived set. Fields: primary text from the
  Studio brief's post_copy, else the copy the set already runs; link = the set's landing page origin + /products/<handle>.
- Routes (one block in worker.js, admin + brandsFor, team only): `POST /api/launch/prep | preview | create`,
  `GET /api/launch/list?act=&refresh=1` (no act = every brand the person sees, for the test library chips).
  Table `p_launch` (created on first use). create also writes `p_br_adtag` (ad -> p_br_batch). A second launch of the
  same Studio ad into the same set is refused.
- Judged -> learning filed: on every list, a launch whose test (p_br_batch) has verdict winner / loser / cancelled gets
  the verdict + learning copied, and the angle's `note` gets one line `#415 Winner: <learning>` (once per test).
  Launches made before the test reached the library link up by number on the next list.
- metawrite.js: only exports added (`gget`, `gall`, `metaActs`), and `meta_create_ad` apply now also returns
  `write`, `created`, `creative` (like duplicate does).
- Tests: `node test-launch.mjs` (13 offline checks, Graph API mocked). NOT tested live: a real ad creation (the
  adimages upload from the profit worker's Studio image URL, the creative spec, PAUSED status), the `ad.id IN` status
  read, the ad set filter by effective_status. The first real launch is the test; it is paused, and undo archives it.
## 2026-10-10: Monday account review (`src/review.js`)

- **What it does.** Every Monday (Central), from `briefHour + 2` (the weekly reports' hour; 11am with the default 9am
  brief), the hourly tick runs `reviewTick` right after `scheduleTick`. For each active brand that is not paused (Galway,
  Instyler, Gum of Gods, JudyP, Le Pickle, PopBy), not The Golf Sock and not Harborline, the Strategist gets ONE
  `engine.answerWeb` with `reviewPrompt`: read the command center (`/api/hub/command?act=`) and the Day check
  (`/api/hub/yesterday?act=`), goals vs plan (`plan` view), fatigue (`creatives`, `tests`), budgets and structure
  (`meta_read`, ad set first, never cut a working set's anchor), `stock`, the `calendar` for the next 14 days and the
  last 7 days of `changes`; then a short read and at most 4 proposals with its normal actions. The prompt names where to
  read, never what to conclude (judge from context, no word lists).
- **Where it posts.** ONE message to `brand_accounts.slack_channel` (internal), never `brief_channel`; a brand whose
  internal channel equals its client channel, or has none, is skipped and shown as skipped. The proposals go as Apply
  cards (`engine.proposalBlocks`) in the THREAD under the read, like askschedule kind `task`: an Apply tap answers with
  `replace_original`, so a card inside the read would wipe it. Nothing is ever applied by the review.
- **Switch:** `settings.mondayReview` = 'on' runs it; anything else (the default) is OFF. Locus: Agency settings > The
  Strategist > Monday account review (toggle, this Monday's state per brand, "Preview this week's review").
- **Caps and budget:** `subCanAfford(200)` before each brand (never mid-brand); 2 brands a tick; 12 brands a Monday; a
  failed answer is tried once more next hour, then left (the try is written BEFORE the model call, so a killed run is not
  retried for ever); 4 cards a brand. State: `settings.mondayReviewDone` = {date, acts: {brand: {status ok | skipped |
  error | running, tries, ts, cards, cost, why, error}}}.
- **Cost:** one answer per brand per Monday on the workspace model (Opus 5.5 medium by default), about $0.40 to $1.00
  each, so about $3 to $8 a Monday for eight brands (~$15 to $35 a month). Each run is in `strat_run` (who "Monday
  review", brand = the brand, via `screen.act_id`), so it shows on the settings cost card.
- **Routes** (admin, inside the `/api/ask` block so a client login never reaches them): `GET /api/ask/review`,
  `PUT /api/ask/review {on}`, `POST /api/ask/review/preview {act}` (the real review for one brand, returned, posted
  nowhere, not counted as the Monday run; logged in strat_run as "<email> (preview)").
- **Known limit, outside review.js:** ask/engine.js `keepProposal` keeps only the last 20 pending proposals across the
  whole Strategist. Eight brands x 4 cards = 32, so the first brands' cards can say "expired" before anyone taps them.
  Fix: raise `list.slice(-20)` in `keepProposal` (e.g. to -100). Not done here (engine.js was out of scope).
- Tests: `node test-review.mjs` (11 offline checks; Strategist and Slack mocked). NOT tested live: a real Opus review
  (the tool path through locus_get to the profit worker, answer length, card count), the Slack posts and Apply taps.
## 2026-10-10: post-purchase survey (Fairing / KnoCommerce vs Triple Whale)

- **survey.js** (`/api/survey`, admin + brandsFor; one route block above /api/brand-links). Triple Whale lastPlatformClick
  stays the attribution everywhere; this is a reality CHECK beside it. Fairing: `GET https://app.fairing.co/api/responses`,
  `Authorization: <secret token>` (no Bearer), `inserted_at_min`, `sort=inserted_at_asc`, `limit` 1000, follow `next`.
  KnoCommerce (from its OpenAPI spec v1.3.0): client credentials at `api.knocommerce.com/api/oauth2/token` (Basic
  id:secret, scope RESPONSES), then `GET app-api.knocommerce.com/api/rest/responses?maxPageSize=250&expand=order
  &status=completed&updatedAt[gte]=` with `pageToken`. Kno's answer items and `order` are untyped "object" in the spec,
  so `fromKno` reads them defensively; verify on the first real key.
- Keys in `p_br_doc` `survey_fairing` {key} / `survey_kno` {client_id, client_secret, token, token_exp}, NEVER returned.
  `/api/brand-links` takes `survey_key` (the Integrations box: `a:b` = Kno, else Fairing), or `fairing_key` / `kno_key`;
  each checked with one real call before it is kept; empty = forget. integrations.js item `survey` (group Store).
- Answers go to D1 `survey_responses` (created at runtime: act_id, provider, id, order_id, date, question_id, question,
  answer, other_text, channel; no emails). Sync on read at most every 6 hours (`survey:<act>:sync` cursor, first read
  90 days, 12 calls max, cursor only moves on a clean read). The question read = the one whose answers map to channels
  most (5+ answers), or the pinned one (`PUT /api/survey {act, question_id}`, `survey:<act>:question`).
- `surveyReport`: seven channels (`channelOf`), joined to `tw_orders` by order id (gid -> number): agreement %,
  agreement on paid, per channel said / tw / agree / said_all with shares and gap points, `tw_other` (no ad click,
  email / SMS clicks), top raw answers. Strategist view `survey`; knowledge file `post-purchase-survey`; a line in
  THE CMO METHOD. Clients may GET their own brand (CLIENT_RULES, both brandguard copies).
- Tests: `node test-survey.mjs` (12 offline checks, Fairing and Kno mocked), test-clients.mjs has a survey check,
  test-strategist.mjs checks the view is listed. NOT tested live: any Fairing or Kno call (no brand has a key yet).
## 2026-10-10: client requests and approvals (`src/requests.js`)

- **Two kinds of item per brand.** `approval` = the team sends the client something to sign off (`what`: `studio` = Studio
  ad ids in `ref`, `date` = a Lineup event id in `ref`, `offer` = the text, `link` = a link or file). `request` = the client
  (or the team, logging a call) asks for something: title, text, optional link, then a thread.
- **Tables** `p_request` + `p_request_msg` on this D1, created on first use (`ensureRequests`, like p_alert). Status: open,
  approved / changes (the client's decision on an approval), done (the team closes anything; `done:false` reopens). A
  client reply on a done request reopens it. Done items drop off the list after 60 days.
- **Effects of an approval:** Studio ads -> `p_studio_ad.status = 'approved'` (same D1, the state Studio's own Approve sets,
  only rows of that brand); a date -> Lineup `events.status = 'confirmed'` plus a changelog row "Confirmed: <name> approved
  it in Requests" written as `Locus` (a team name), so `calendarTick` does not post it a second time.
- **Routes** (one block in worker.js above /api/brand-asana): `GET /api/requests?act=` (team: a brand or `all`, filtered
  by brandguard for a limited teammate; client: its brand only) -> {items (with thread, ads / date preview), waiting_client,
  waiting_team}; `POST /api/requests` {act, kind, what, ref, title, text, link}; `POST /api/requests/reply` {act, id, text};
  `POST /api/requests/decide` {act, id, decision: approved | changes, note (required for changes)}; `POST
  /api/requests/done` {act, id, done} (team only). Every id route checks the item's own brand against `act` and, for a
  client, `clientScope(request).ids`.
- **brandguard CLIENT_RULES** (both copies): GET /api/requests, POST /api/requests, /reply, /decide, all `act: 'need'`.
  A client can never send an approval (403 in the handler) or mark done (not on the list).
- **Slack:** a client's new request, decision or reply posts ONE line to the brand's internal channel
  (`brand_accounts.slack_channel`), button "Open in Locus" (`?open=requests&act=`). Never the client channel. A team
  action posts nothing. No email: a new approval only shows in Locus (the client's Home says "N waiting for you").
- **Tests:** `node test-requests.mjs` (9 offline checks, Slack mocked). Not tested live.
## 2026-10-10: agency economics and team workload (`src/agency.js`)

Routes (one block in worker.js after /api/command/work; not on brandguard CLIENT_RULES, and the handler refuses a client
scope again): `GET /api/agency/economics?month=YYYY-MM&fresh=1` and `PUT /api/agency/settings {people, map}` are OWNER
ONLY (Cole's session or the admin key; the team gets 403); `GET /api/agency/workload?fresh=1` is the team's (brandsFor
limits a teammate to their brands). Tests: `node test-agency.mjs` (10 offline checks, Asana and the Ledger mocked).
- **Revenue** = the Ledger's month report (`/api/report?month=`, `byClient` = income by payer name) over the LEDGER
  binding with a minted Cole session, cached an hour in `agencyLedger:<month>`. Payer names match brands by name (exact,
  then one contains the other, only when one brand fits); settings `agencyLedgerMap` {payer: brand id | '' (not a
  client)} pins the rest from the page.
- **Team cost model (an ESTIMATE, labelled so):** settings `agencyPeople` {Asana user gid: {name, cost (a month),
  hours (a month, default 160)}}. Each person's month is split across brands by their share of the tasks they
  COMPLETED that month in each brand's linked Asana project (connections kind 'asana'; paused and test brands skipped
  like command.js). Work outside client projects is not seen, so the whole month lands on clients. Counts cached in
  `agencyDone:<brand>:<month>` (30 min current month, 12 h past).
- **AI cost** per brand: strat_run (already includes Strategist images, PDFs, analysis), idea_run, p_studio_ad,
  p_studio_vid, p_asset looks (source 'locus'), ad_tag, and the client Strategist (`clientAsk:<day>:<email>`, filed
  under the client's first brand). Ids resolve through brands.legacy_key, brand_alias and Meta connections; runs with
  no brand are `ai_unassigned`.
- **Sentence** is written by rules, no model (`sentenceFor`): most revenue per team hour; anyone whose AI cost is over
  what they paid; else the biggest loss or the thinnest margin; a nudge when no costs are entered.
- **Workload:** open tasks with a due date per brand project (`agencyOpen:<brand>`, 30 min), due this Central week
  (Mon to Sun) or overdue (before Monday, up to 60 days, NOT_DUE sections left out), grouped by assignee
  ("Not assigned" last), a task in two projects counted once.
- NOT tested live: the Ledger binding's /api/report answer, real Asana paging on big projects, real payer names.
## 2026-10-10: daily smoke check (`src/smoke.js`)
- **What:** once a Central morning (hourly tick, settings `smokeHour`, default 6, after briefs and reports in the tick
  order) it reads every Locus page's data routes for All clients and each ACTIVE brand (paused and demo are not
  active), as Cole (minted owner session): profit routes through the PROFIT binding, this worker's routes in-process
  (`AH_APP.fetch`), Stock through SUPPLY. The table is `SMOKE_ROUTES` (page, ?open= tab, worker, path, scope
  all/brand/both, needs). A route that needs a connection (Google Ads direct, GA4, Search Console, Clarity, TikTok
  direct, Klaviyo key, Supply, Meta, TW) runs only for brands that have it. Read-only GETs only. Adding a page = add
  its row; `node test-smoke.mjs` checks every row against `src/routes.js`.
- **Also checks:** `integrationsReport` (a failure = a core agency key off, a brand item `bad`, or anything that was
  `ok` last run and is not now; `smokeLast.conn_state` is that memory, so never-connected things are not noise), live
  Meta (`/me`, token in a header), Asana (`/users/me`) and Slack (`auth.test`) tokens, freshness (daily_insights and
  tw_daily reached each brand's yesterday, Meta synced in 12h, TW in 26h, `lastHourly` under 3h, `lastRun` under 30h).
- **Posting:** ONE message of failures to `strategistChannel` (none set = no post; the card says so). `smokeQuiet` =
  'off' also posts "all N checks passed". `smokeCheck` = 'off' stops it. Each line: brand, page, error, Open link
  (`/profit/?open=<tab>&act=<brand>`).
- **Budget:** a run is spread over ticks: each tick spends at most `TICK_CAP` (1500), leaves `TICK_KEEP` (1500) for
  the jobs after it, runs at most 120 reads and stops starting new ones after 4 minutes; progress in settings
  `smokeRun`. Cost is about 1 per profit read (the binding call) plus the measured D1/fetch count of each in-process
  read (seed 25, the highest seen is used for the next estimate) plus about 40 for the connections pass. Roughly
  1,500 to 2,500 a run at 9 brands, over 2 to 3 ticks.
- **The meter trap:** `handle()` calls `subReset()`, so an in-process route zeroes SUB_USED and COST_SEEN for the
  whole tick. smoke.js runs the reads inside `smokeDeps().meter.hold()` (saves both, restores saved + its own count),
  and runs in-process reads one at a time, each measured from `zero()`. Do not call `AH_APP.fetch` from a scheduled
  job without the same hold, or every job after it in the tick believes it has the whole budget.
- **Routes (admin):** `GET /api/smoke` (last run, switches, progress), `POST /api/smoke/run {dry (default true),
  brand?}` (Run now, inside the request; stores `smokeLast` with `manual` and `dry`), `PUT /api/smoke {check, quiet}`.
- **Locus:** Tools > Platform status, card "Locus itself" (profit/desk.js `smokeCard`): the answer, the failures with
  Open buttons, the switches, Run now (dry unless "Post this run's failures to Slack" is ticked).
- **Tests:** `node test-smoke.mjs` (113 offline checks; bindings, routes, Meta, Asana and Slack mocked). NOT tested
  live: any real route, how Cloudflare counts a service-binding call (counted as 1 here), CPU time of about 100
  in-process reads in one tick, Run now's wall time from the browser.

## 2026-10-10: Strategist cost pass (what the model is sent). Read before adding tools or system text.

Measured with `node scripts/prompt-size.mjs` (builds the real engine on the test fixtures and sizes every system
block and tool group; ~2.5 characters a token, calibrated on strat_run; set ANTHROPIC_API_KEY for exact counts).
- Before: ~54k tokens on a cold no-brand question (tools ~30k, schema/WHO ~11k, playbook ~12k), +~27k with a brand
  (brain + Slack digest). Only tools + schema were cached, and Slack and the web had different tool lists, so the
  playbook (after the date and live context) was rewritten on every question and the two surfaces never shared a cache.
- After (ask/engine.js opt-ins `sameTools`, `toolSearch` + `alwaysLoaded`, `cacheTtl`): ~31k. One tool list on both
  surfaces; only the everyday tools load up front (strategist.js `alwaysLoaded`), the other ~70 go with
  `defer_loading` behind Anthropic's tool search (`tool_search_tool_regex_20251119`, no beta) and are listed one line
  each in the cached prompt ("More tools, loaded when you need them"). System order is now: stable part (WHO/schema,
  playbook, rules, tool catalog) with a 1-hour breakpoint, then the brand brain (5-minute breakpoint), then
  everything that moves (date, live brands, company brief, memory, skills, Slack digest, screen).
- **Rules that keep it cheap:** nothing that changes per question, brand, surface or day may go in the stable part or
  in a tool definition. A new tool is deferred by default; add it to `alwaysLoaded` only if most questions need it.
  A new everyday tool costs every question; a deferred one costs one line in the catalog.
- Same evening, two more cuts: (1) **the SHORT brain** is what every answer carries (`brandBrain(..., {short: true})`,
  `SHORT_CAP` / `SHORT_MAX` 14k chars: brand facts, staff rules, lines, personas by name, the angle library with
  results, GAPS; no quotes, competitors, research notes, creator link or voice). Its first lines tell the model the
  full brain is `read_app view=brain` and when to read it (creative, research, voice, "who is the customer"); the
  model judges that from the question. (2) **The playbook no longer repeats the knowledge files**: the Google Ads,
  TikTok, email, website, search, store, stock and calendar bullet lists and most of the StoryBrand method are gone
  from PLAYBOOK (31.9k -> 25k chars); THE CMO METHOD already says to read the topic before advising, and the house
  rules that were not in any file (Attentive brands, stock + calendar before a scale call, calendar actions, Black
  Friday phases) stayed. Web chat history is 12 x 4000 chars (was 16 x 6000).
- Per question now: stable prefix ~28k tokens (1h cache), short brain ~5k (5m cache), moving part ~3k, output.
  Cold brand question ~$0.30 (was $0.47); within the hour ~$0.08 plus output; no-brand cold ~$0.25, warm ~$0.03.
  The cold write of the stable part is now the whole cost; the next cut, if ever needed, is moving the creative
  framework and the account doctrine into knowledge topics too (~10k tokens), at the risk of the model skipping them.


## 2026-10-11: prefs.js and morning.js (session D, branch locus-personality)
- `src/prefs.js`: `GET/PUT /api/me/prefs`, one settings row per person (`userPrefs:<email>`): the morning DM switch and
  the nudge card's snoozes and dones. `src/morning.js`: `morningTick` in the hourly cron (after movedTick) DMs the
  morning line (profit `/api/hub/kept`, read once as the owner over PROFIT, filtered per person with brandsFor) to
  everyone opted in, from `settings.morningHour` (7 Central) until noon, once a day; `GET/POST /api/me/morning` = the
  signed-in person's lines / send them now. `settings.morningDm = 'off'` stops it. Tests: `node test-morning.mjs`.
  Needs the bot scopes `users:read.email`, `im:write`, `chat:write` (not verified live).

## 2026-10-12: the cadence reset (6am sends, Monday review off, one channel for drafts, the short client daily)

Cole moved the Monday call to 8am Central and reset the team's week (audit and build order:
`docs/operating-cadence-2026-10-12.md`). What changed in this worker:
- **Every send is 6am Central.** `settings.briefHour` = 6 and `REPORT_HOUR_OFFSET` = 0 (review.js `REPORT_OFFSET` too), so
  the daily, the weekly (Monday) and the monthly (the 1st) all run on the 6am tick, briefs first, reports after, each
  stopping politely on the budget. Strategists write their Monday plan from the weekly before the 8am call.
- **Monday review is OFF for good** (`settings.mondayReview` = 'off'). It ran once on 2026-10-12 (9 brands, ~$4, up to 8
  Slack sections each); Cole: nobody reads that. The strategists' Monday plan replaces it. Do not turn it back on.
- **One agency channel for every daily draft**: `settings.dailyBriefsChannel` (Slack `#daily-briefs`, C0C8UA53U3W, public).
  `draftBrief` posts the card there (buttons and all); unset, or a post there failing, falls back to the brand's internal
  channel. `slackPost` (bot path) answers `not_in_channel` by `conversations.join` once and resending (public channels
  only; a private one still needs /invite). Locus: Agency settings > Slack and sending > "Where the daily drafts post".
  Failure alerts and the weekly/monthly drafts stay in the brand internal channel: the weekly card is the Monday thread
  anchor (plan + Google/Amazon updates as replies).
- **The short client daily**: `sendBrief` posts `shortBriefText(text)` (opener, headline, Today line, the day's Net Sales
  / Ad Spend / MER, "Open the full brief in Locus") when the brand has a Locus client login (`brandHasClientLogin`:
  `settings.clientUsers`) and `settings.briefClientStyle` is not 'full'. No client login = the whole brief, as before.
  The stored row always keeps the full text. Locus: the same settings card, "What the client gets each day".
- **2026-10-17: the short daily goes to EVERY client channel, the full brief is its thread reply.** `sendBrief` posts
  `shortBriefText(text, {locus})` top-level (opener, headline, the day's Net Sales / Ad Spend / MER vs plan, "Full update
  in the thread", plus an Open in Locus link when the brand has a client login), then `briefThreadText(text)` (the brief
  minus its opener) as ONE reply, both as Cole. A failed reply never unsends the headline; the internal channel is told.
  `briefClientStyle` = 'full' posts the whole brief top-level as before. Also: `meta_missing` (Triple Whale short on Meta
  spend, rebuilt from Meta's own figure) is a WARNING now, not a block; the card shows one info line.
- NOT tested live: the bot's self-join (first real post is the next 6am tick; the fallback covers a failure) and the
  short send (no brand with a client channel has a client login yet; Lucky has logins and no client channel).

## 2026-10-13: MEETING NOTES (`src/meetings.js`). Fireflies transcript -> per-brand action items -> Asana, the weekly report, Requests, Slack.

(AMENDED the same day, see "ACTION ITEMS IN LOCUS" at the end: Confirm writes team items to `p_action` (actions.js), never Asana; `openItems`, `/api/meetings/done {id}` and `/api/meetings/add` read and write p_action; the page is Work > Calls, links are `?open=calls&meeting=`. The weekly report `this_week` write and the Requests `ask` are unchanged.)

Cole, 2026-10-12: a note taker on every call, Locus writes the action items, the team's tasks go one way and the client
hears something else. Page: Locus Reports > Meeting notes (`profit/meetings.js`, team only: `AGENCY_TABS`).
- **In:** the PUBLIC `POST /fireflies/webhook` ({meetingId, eventType}; `x-hub-signature` HMAC checked only when
  `FIREFLIES_WEBHOOK_SECRET` is set; the URL goes in Fireflies > Settings > Developer settings) and the hourly
  `meetingsTick` (GraphQL `transcripts(fromDate)` from `settings.meetingsSince`, first run two days back, two reads a
  tick, cursor moves only on a clean tick). Both call `ingest`: `transcript(id)` with sentences, thinned evenly over
  140k chars, stored in `p_meeting` (created on first use), then ONE Sonnet 5.5 call (`SCHEMA`: kind, summary, per
  brand decisions / items {text, owner, due, kind team|client|client_owes} / this_week / need_from_client) with the
  brand list, the team's first names and the meeting date (relative days resolved in the prompt). About 5 cents an
  hour of call. Status new -> extracted -> confirmed | skipped | error. The Strategist channel gets one line with an
  Open in Locus button. Nothing is written anywhere by the read.
- **Confirm** (`POST /api/meetings/confirm`, the edited notes from the page): team items -> Asana tasks in the brand
  project's "Action items" section (made if missing; owner by roster email then name; agency-wide items go to
  `settings.agencyAsanaProject` when set, else Slack only); this_week / need_from_client -> `reports.data_json
  .this_week` / `need_from_you` on the brand's open weekly draft (the report page draws a "This week" card, `sendReport`
  adds both lists to the client's Slack send; no open draft = a warning, the Slack note still carries it);
  client_owes -> `p_request` kind `ask` (requests.js `createAsk`; the client sees it under "Waiting for you" and may
  mark it done, the team is told in the internal channel); one Slack note per brand to its INTERNAL channel, agency
  items to strategistChannel. Never a client channel. `openItems` reads every brand's "Action items" section (10 min
  cache, `settings.meetingsOpen`) for the top of the page.
- Routes (admin, refused for a client scope): `GET /api/meetings[?id=]`, `POST /api/meetings/confirm | skip | ingest
  {id} | poll`. routes.js rebuilt. Secret `FIREFLIES_API_KEY` set by Cole 2026-10-13.
- NOT tested live at build time: the Fireflies GraphQL field names (`meeting_attendees`, `sentences.start_time`, the
  `date` ms timestamp) and the first real extraction; the hourly tick's first run is the test (see `lastHourly.meetings`).
## 2026-10-13: TODAY'S CALLS IN SLACK (`src/todaypost.js`) and the calls made from the page
- `todayTick` (hourly tick, right after `meetingsTick`, `todayDeps()`): once per Central day from 8am to 1pm, for every active brand that is not paused (moved.js `SKIP`, now exported), reads profit `/api/hub/today?act=<brand>` as the owner over PROFIT and posts ONE message to `brand_accounts.slack_channel` (never `brief_channel`; a brand whose internal channel is its client channel is skipped) ONLY when there are Scale / Cut / Trim / Refresh rows: header, one line per row (the call, the ad set or ad, the money at stake, the why), button "Open in Locus" (`?open=today&act=`). `d.canAfford(40)` before each brand; state `settings.todayDone` = {date, acts, tries} (a failed read is retried once next hour); switch `settings.todayPost` ('off' stops it; in GET/PUT /api/settings next to `briefClientStyle`). Tests: `node test-today.mjs` (3 offline checks, PROFIT and Slack mocked). NOT tested live: the first 8am tick.
- The page's buttons: Do it = `POST /api/meta/write` (locusWrite, unchanged); Something else = `POST /api/meetings/add` (meetings.js, built in a parallel session); a test's Winner / Keep running / Loser = profit `/api/brand/verdict` AND `POST /api/brand-asana/result {act, id, result, learning, keep_reason, check_again, who}` (asana-brand.js `setResult`: Result + Learning + complete the task, or Result + "Keep running because" + "Check again"; one story; p_br_batch updated), because the hourly Asana sync writes `asana_result` from Asana and would otherwise bring the test back. NOT tested live: the Asana PUT with `completed` and custom fields together.

## 2026-10-13: ACTION ITEMS IN LOCUS (`src/actions.js`). The team's to-do list is a Locus table, not Asana. Read before touching meetings.js, the Monday screen or Slack reactions.

Cole (docs/handoffs/work-in-locus.md): "if there are tasks inside Locus, why aren't we moving everything inside Locus." Stage 1
built 2026-10-13: every team item is a `p_action` row; the Asana "Action items" section is not written or read any more.
Tests: `node test-actions.mjs` (6 offline checks: rows, the grouped open list, the reminder message, the tick, the Done button
and the ✅ reaction, the routes' team-only gate). test-clients.mjs asserts a client gets 403 on `/api/actions` and `/api/meetings`.
- **Table `p_action`** (created on first use by `ensureActions`): id `ac_<12 hex>`, act_id ('' = agency-wide), text, owner (first
  name, normalised to the `ROSTER` spelling), owner_email (from ROSTER; Radhesh and Hamza have none yet), due (YYYY-MM-DD or ''),
  kind team | client | client_owes, status open | done | dropped, source meeting | monday | today | strategist | manual,
  source_id (the meeting id, the Today row key), asana_gid (unused; for a mirror if ever), done_at / done_by / done_how (tick |
  slack), reminded_on (the Central day of the last reminder), slack_channel + slack_ts (the reminder line), created_at, created_by.
- **Routes** (worker.js, next to /api/meetings; admin + `clientScope` refused; NOT on brandguard CLIENT_RULES): `GET /api/actions?act=
  <brand>|all|''&status=open|done|all` -> {items (each with `url` = `profit/?open=actions&act=&item=`), brands, team, remind};
  `POST /api/actions {act, text, owner, due, kind, source, source_id}` (an unknown brand is 400); `POST /api/actions/done {id,
  done}`; `POST /api/actions/edit {id, text, owner, due, kind, act, status: 'dropped'}` (a changed due date clears `reminded_on`).
  routes.js rebuilt. meetings.js keeps `POST /api/meetings/done {id}` and `/api/meetings/add` as thin wrappers (older callers).
- **Who writes rows:** meetings.js `confirm` (kind team, source meeting, the Slack note links each item `<url|Locus>` and its
  "Open in Locus" button goes to `?open=calls&meeting=`), the Monday agenda's add box (source monday), Today's "Something else"
  (source today, source_id = the row key), the Action items page (manual). The Strategist has no tool yet: it can reach the
  route through `locus_get` / `locus_write` (routes.js). `openItems(env, d)` = open rows grouped per brand, agency-wide first
  (the shape the Calls page and `mondayScreen` read; `agency_open` is filled now).
- **Reminders** (`actionTick`, hourly tick right after todayTick, `actionDeps()` = meetingDeps + slackApi + centralHour +
  centralDate): from `settings.actionHour` (7 Central) until noon, every open item with `due <= today` and `reminded_on != today`
  is grouped per (brand, owner) and posted as ONE line: "*Ahsan*, Alpha Golf: 1 due today, 1 overdue." + a bullet per item
  (overdue ones say when they were due), a Done button per item (`act_done_<n>`, value {id}, 4 at most) and Open in Locus.
  Where: the brand's INTERNAL `slack_channel`; agency-wide items to `strategistChannel`; neither = a DM to the owner through
  `users.lookupByEmail` on the roster email; no way to reach them = skipped and reported. An overdue item gets one line a day,
  never more. Switch `settings.actionRemind` ('off' stops it; `actionRemind` in GET/PUT /api/settings next to todayPost).
  `d.canAfford(30)` before the tick, 10 per post.
- **Done from Slack:** the button is routed by slack-router (`IDEA_ID` now matches `act_done`) to `/slack/actions` here, where
  `handleActionButton` marks the row done (`done_how 'slack'`, `done_by` = the tapper's Slack name) and rewrites the line
  through `response_url` (done items struck through, buttons only for what is still open, "✓ All done"). A **✅ reaction**
  (`white_check_mark` / `heavy_check_mark` / `ballot_box_with_check`) on the reminder line marks every open item behind that
  `slack_channel + slack_ts` done: `handleSlackEvent` answers `reaction_added` first thing (`handleReaction`), and slack-router
  forwards reactions by `ev.item.channel` (a reaction event has no `ev.channel`). Other reactions and other messages are ignored.
  **Needs the Slack app subscribed to the `reaction_added` bot event and the `reactions:read` scope** (not verified live).
- **Not built (on purpose, handoff says do not over-build):** auto-done from Meta or brief signals (`done_how 'auto:*'`), the
  optional Asana mirror. Stage 2 (briefs, the production board, `p_work`) is a separate build after a week of use.
- NOT tested live: the first morning tick (reminder lines in real channels), a real Done tap and ✅ through the router, the DM
  path, the slack-router deploy. The first Monday is the test; `lastHourly.actions` says what the tick did.

## 2026-10-13 (second pass): Brief items from a call go to Asana

- `p_action.kind` adds `brief`; `asana_url` column added by a guarded ALTER in `ensureActions`. The extraction SCHEMA and
  prompt offer `brief` ("new ads someone agreed to make"; owner = the strategist who writes it).
- `confirm` (meetings.js): each Brief item -> `makeBrief`: the next number (`nextNumber`, ideas.js) as a task
  `<num> - <text>` in the brand's Creative Brief section, html = asana-brand.js `briefFor(text)` (now exported) with a first
  line "From the "<call>" call on <date>: <text>. Confirmed by <who> in Locus.", assignee by roster email then first name,
  due_on = the due date. Then a p_action row (kind brief, text `<num> - <text>`, asana_gid, asana_url) so it sits on the list
  and gets the Slack reminder (the reminder line links "Asana"). No Asana project or no Creative Brief section = a warning and
  the row only; an agency-wide brief = the row only. The Slack note gains a "*Briefs*" block with the Asana links; result
  `brands[].briefs`. Links in the note and the ready line now open `?open=actions&meeting=`.
- NOT tested: makeBrief against the real Asana API (tests mock nothing there yet); the first approved Brief item is the test.

## 2026-10-13 (third pass): quotes on extracted items, client asks on the list

- meetings.js SCHEMA items carry `quote` (verbatim, at most 25 words) and `at` (m:ss); the prompt asks for both; `extract`
  keeps them (240 chars). The page shows them per item; confirm ignores them.
- `GET /api/actions` (status open) adds `waiting`: Requests asks (`p_request` kind 'ask') open, or updated in the last 7
  days, with `due` read from the body's "Needed by YYYY-MM-DD" (createAsk writes it). A missing table answers [].

## 2026-10-13 (fourth pass): Calls, Tasks, Production (docs/handoffs/work-calls-tasks-production.md)

Locus Work is now three pages (profit calls.js, tasks.js, production.js). What this worker added:
- **`p_action.area`** (TEXT): ads | email | organic | site | ops | client; '' = Other; NULL = not judged yet. The call
  extractor and quick add set it; `judgeAreas` (Haiku 5.5, judged from the words, no word lists) fills NULL rows from
  the hourly `actionTick` (its result now carries `areas`) and from `POST /api/actions/areas` (the backfill).
  `/api/actions/edit` accepts `area`. `GET /api/actions` items carry `area`. `ROSTER` and `AREAS` are exported.
- **`POST /api/actions/quick {text, act}`**: one typed line; Haiku reads brand, owner, due and area out of it and the row
  is made (`{ok, parsed, item}`). The page falls back to plain `POST /api/actions` if it fails.
- **Production (`src/production.js`)**: a board over **p_br_batch**, not a new table. New columns `board_stage`,
  `assignee_name`, `due_on`, `board_at` (`ensureBoard` adds them; they were also run on remote D1 by hand).
  Columns brief > making > review > ready > live. `boardOf(section, stage)` (asana-brand.js) maps the Asana section:
  Creative Brief(s) = brief, Creative Studio = making, Ready to Launch = ready, Analyze Results = live, Completed = done.
  **Review is Locus only** (no Asana section; the task stays in Creative Studio). `syncTasks` now reads `due_on` and the
  assignee name, and keeps a Locus column until the Asana section itself changes (so Review is not pulled back to
  Making). The first sync after deploy is full once (`doc.board_v`).
  Routes (team only, 403 for a client scope): `GET /api/production?act=`, `POST /api/production/move {id,to}` (moves the
  Asana task to the matching section via `BOARD_SECTION`, writes the column, posts one line in the brand channel:
  "<Name> moved *<num> - <title>* to <Column>"), `POST /api/production/brief {act,text,owner,due}` (meetings.js
  `makeBrief`, now exported: the next numbered brief in Asana + its card).
- Tests: `test-actions.mjs` (11) and `test-production.mjs` (7).

## 2026-10-13: THE LEAK FINDER (`src/leaks.js`). Read before touching it, the negative keyword write or the judge.

Handoff `docs/handoffs/leak-finder.md`, screens in profit/CLAUDE.md (same date). Tests: `node test-leaks.mjs` (16
offline checks: Google Ads, GA4, the model, Klaviyo, Meta's list and TikTok mocked).
- `leaksFor(env, d, act, {days, fresh})`, cached an hour in settings `leaks:<brand>:<days>`; routes `GET /api/leaks`,
  `POST /api/leaks/apply {act, term, campaign_id, confirm}`, `POST /api/leaks/undo {act, resource}` (`handleLeaks`, mounted
  above the Google block; admin + brandsFor; a client's `fresh=1` is ignored). Strategist view `leaks` + a CMO METHOD line
  (read it before any audit question).
- **Sources, nothing recomputed:** google.js `leakAds` (cache `gadlk:`: search terms with spend and under 0.5
  conversions, top 200; every campaign; `campaign_search_term_insight` per PMax campaign, which has NO cost, so cost =
  clicks x the campaign's CPC; video / Demand Gen `video_trueview_*` with a fallback to the old `video_*` fields) and
  `leakFunnel` (cache `g4lk:`: GA4 SESSIONS with add_to_cart / begin_checkout / purchase by device, the window and the 90
  days before, plus paid-channel landing pages and the paid total); Today's calls over the PROFIT binding (todaypost.js
  `readToday`, Cut and Trim rows, stake x 30/7); `tiktokReport`; Klaviyo `flows_report` + `daily` (`by_flow`).
- **The judge**: ONE Sonnet 5.5 call per brand per hour (`judge`, JSON schema, low effort) reads the short brand brain and
  labels every non-converting search term and PMax category irrelevant / relevant / brand, says which CORE flows have no
  live version, and which live flow replaced a switched-off one. No word list anywhere. Terms under $1 never reach it.
- **Rules**: Google, video and TikTok campaigns use the brand's own cut line (`cr_cut_zero_x`, `cr_cut_spend_x`,
  `cr_cut_cpa_x` from p_br_doc rules, goal = rules target_cpa or the brand's) on the platform's own conversions. A funnel
  step is a leak when 20%+ under `BENCH` (Littledata Oct 2026 by device; cart to checkout is ESTIMATED from Littledata
  medians and says so) AND under the brand's own 90 days, over the floors (1,000 sessions, 300 carts / checkouts); cost =
  orders the step would add at the benchmark, carried down the brand's own funnel, x the device's AOV. Landing pages: 500+
  paid sessions under 70% of the paid site rate. Email: missing welcome = sign-ups x $5.75, post purchase = orders x
  $1.80 (Klaviyo 2026), the others "not priced"; a switched-off flow = its last 30 days before going off (when those
  were empty, a third of its 90-day revenue) less its replacement's rate; a replacement earning 85%+ of it is not a leak. Floor $50 a month,
  except search negatives and PMax categories (Viktor's report, kept at any size). Sources and dates:
  docs/strategist-brain/knowledge/website-cro.md section 2.
- **The write**: google.js `adsNegative` = `campaignCriteria:mutate` create `{campaign, negative: true, keyword: {text,
  matchType: EXACT}}` (validateOnly for the propose), or remove by resource name (must start with the brand's own
  `customers/<cid>/campaignCriteria/`). Apply files an `activities` row (event_type `google_write`, category `keywords`,
  under the brand's Meta account like klaviyowrite) and drops the term from the cached list. PMax categories get no Apply
  (a category is not a keyword; the fix names the account-level negative list in Google Ads).
- Verified live on Lucky 2026-10-13 from the dev worker: every source answered, Google accepted a validateOnly negative.
  NOT done: a real negative write (Cole approves the first ones), TikTok (not connected), Shopify-app funnels (no store
  has the app).
- **The morning card** (morningcard.js `buildCard`, `d.leaks` = cardDeps): ONE line for the biggest leak over
  `LEAK_FLOOR` ($500 a month) whose id was not on yesterday's card (`card.leaks` keeps the ids), tagged to its owner
  from the brand's roster (`leak.owner`, calendar.js `teamOf`); the first day only records ids. test-morningcard.mjs 13/13.

## 2026-10-13 (fifth pass): THE MORNING CARD (`src/morningcard.js`, docs/handoffs/morning-card.md). Read before posting anything to a brand's internal channel.

Cole approved "One Card a Day" (https://claude.ai/artifact/Fn8JrdMJnMNtYMpjBYSaWG): internal channels are for people, and
Dartee's had five bot posts and ~60 lines before 9am on Oct 13. Tests: `node test-morningcard.mjs` (12 offline checks).
- **One send hour**: `settings.morningHour` (Central, default 5; set to 5 in D1 on 2026-10-13). `briefHour()` now returns
  morningcard.js `morningHour()` (morningHour, else the old briefHour, else 5), so the client daily, the weekly / monthly
  drafts and the card all run on that tick. `/api/brief-time` PUT and `PUT /api/settings {morningHour}` write both keys.
  morning.js DMs read the same key, so they moved to 5 too. Locus: Agency settings > Slack and sending > "Morning posts go out at".
- **5am safety**: `dailyBriefs` re-pulls Triple Whale (3 days) when yesterday's `totalSales` row was synced before the
  brand's OWN midnight (moved.js's freshness test), so a Pacific brand at 5am Central never writes from a running day.
  Checked before switching: the stored 6am briefs Oct 6 to 12 match today's tw_daily totals for every brand-day except
  three later restatements (Dartee 10-12 +$80, Bonk 10-07 / 10-09), which the hour does not change.
- **The card** (`morningCardTick`, hourly, right after reportsPass inside the morning block; `cardDeps()`): from the morning
  hour to noon, once per Central day per active brand (not paused, not The Golf Sock, not Harborline, not demo_; internal
  channel set and not equal to brief_channel), one Block Kit post to `slack_channel`: name + day, yesterday vs plan + MER
  from the stored brief's `data_json.day` (no new math) + the client daily's state (`posted_at` in Central), then at most 5
  lines ranked by money then lateness, each starting with the person's tag: Today's calls as one line (todaypost.js
  readToday, buyer from calendar.js `teamOf`), p_action due today / overdue, calendar dates live tomorrow with open steps
  (`calendarData`), late Production cards (`listBoard`); "and N more in Locus"; "Client owes" (oldest open Requests ask +
  days); Monday's weekly line. Buttons = one actions block each, action_id `noop_open`. A brand waits up to 2 hours for
  its brief (and Monday's weekly row), then posts saying so. State `morningCardDone`; the card `morningCard:<act>:<date>`;
  the channel index `morningCardIdx:<date>`; Slack ids cached in `slackIds` (roster email lookup, else one users.list
  first-name match). Switch `settings.morningCard` ('off' = everything posts top-level as before).
- **Its thread at post time**: the full calls list (todaypost.js `messageFor`, minus button and footer) and one
  `reminderMessage` per owner (tagged, Done buttons); those p_action rows get `reminded_on` today + the reply's ts, so the
  Done button and ✅ on a reply work as before and actionTick has nothing left to post for them.
- **Kept up to date by chat.update**: actions.js `onActionDone` hook (registered in worker.js; every markDone, quiet for
  bulk), `cardCallMade` after a non-dry `/api/meta/write` ("N of M made", all = struck), `cardProdDone` after
  `/api/brand-asana/result` and a Production move (`d.onProdMoved`), `cardBriefState` after `sendBrief` succeeds, and
  `cardReaction` (✅ on the card itself = every task line on it done, one redraw; reached from handleReaction when the
  reacted message is no reminder line).
- **Later posts go in the card's thread** (`teamPost(env, d, channel, text, blocks, {tag | tagName})`: a reply under today's
  card in that channel with the person tagged, never reply_broadcast; no card = top-level): alerts.js `postTo` (the rule's
  own mention; Locus "test" posts stay top-level), requests.js `tellTeam` (strategist tagged), meetings.js confirm notes
  (owners tagged), calendar.js client changes and reminders (strategist), actionTick lines (owner), newclient.js internal
  pings (`inThread`). Mondays: meetings.js `mondayScreen` reads the plan from the card's thread first, the weekly report's
  own card second. `slackPost` now passes `opts.thread_ts`.
- **Switched off while the card is on**: todayTick (`cardOn`; D1 `todayPost` = off too), calendar's "Live tomorrow" line,
  the per-drag Slack line in production.js `moveCard` (removed for good), What moved (`movedPost` = off in D1: the
  approved page lists it as off). The weekly / monthly DRAFT cards post to `dailyBriefsChannel` like the daily drafts.
- **The draft bug (fixed)**: every daily draft since 10-12 fell back to the brand channel because the bot was never a
  member of #daily-briefs (C0C8UA53U3W: only Cole and Ahsan) and `conversations.join` failed (no channels:join).
  `slackPost` now invites the bot through Cole's user token (`conversations.invite`, auth.test for the bot id) when the
  join fails; a fallback writes `settings.dailyBriefsError` {at, brand, error}, shown under "Where the drafts post".
- **Locus** (`GET /api/morning-card/preview?act=`, admin, team only): Agency settings > Slack and sending: the hour picker,
  the card switch, "Preview this morning's card" (the card as words + what its thread will hold). The Today's calls
  switch is gone from that card.
- **Checked on real data** (local `wrangler dev --remote`, preview only, nothing posted): Dartee's card matched the approved
  page to the dollar (Yesterday $1,438 (plan $1,800) · MER 2.11x; cut 9 ad sets, scale 1 · $2.4K). Two rules came from it:
  a Production card counts only when 30 days late or less (Lucky had one 123 days late in Brief), and tags match on the
  FIRST name with roster prefixes (Asana gives "Nomaqhawe Molife"; she is the roster's Noma, U09PZ3ZV5HD). A line with
  no owner falls back to the brand's strategist (calendar.js `teamOf`).
- NOT tested live: the first 5am tick (2026-10-14 is the test: `lastHourly.morningCard`, `morningCardDone`), the invite
  through Cole's token into #daily-briefs, chat.update on a real card, ✅ on a card through the router, users.list for
  Radhesh / Hamza. Viktor's Monday Search Term Mining is not ours (Cole asked Viktor to stop it 2026-10-13): check Monday.

### 2026-10-13 (second pass): the CROSS-CHECK and the team's LESSONS (`src/leakctx.js`). Read before touching either.

Cole: "if an ad has a really low ROAS, it doesn't necessarily mean turn that ad off... what if the CTR is great but it's
going to a completely separate website, or that website's getting a lot of bounces... it's all context based." And: "if
my Google guy goes, no, we shouldn't do that... is that true? Can we learn from it?" Tests: test-leaks.mjs 20/20.
- **Context** (`contextFor`, D1 + what leaksFor already read, no new API calls): per Meta cut set its 7-day CTR against
  the brand's median set, CPM, frequency, first- vs last-click credit with `role` (opener / closer / both at the 1.3x
  line, WORKED OUT IN CODE: the model once read a closer as an opener) and where its ads land (`ad_creative.json.link`)
  with that page's paid GA4 conversion and engagement; per Google campaign Google's own value vs Triple Whale's Google
  credit and its landing pages (`leakAds` now reads PMax `asset_group.final_urls`, cache `gadlk2:`); per funnel step
  engagement and sessions A DAY now vs before (never raw totals across 30 vs 90 days: that once read as a 74% drop);
  per landing page who sends traffic there. Brand-wide: GA4 purchases vs Shopify orders, traffic and engagement, the
  Change Log's last 21 days. GA4 reads gained `engagedSessions` (cache `g4lk2:`).
- **Review** (`review`, ONE Sonnet 5.5 call, medium effort, after the leaks are built): per leak `verdict` real |
  check_first | not_the_cause | measurement, `why_ctx`, `check`, `root` (a shared root names one problem behind
  several leaks), plus one `summary`. `mergeReview` ranks not_the_cause and measurement after the leaks to act on. A
  failed review leaves the list as found with `reviewed: false` and the reason. The cache is now SIX hours (two Sonnet
  calls a fresh read, about 3 to 5 cents a brand).
- **Lessons** (`p_leak_lesson`, created on first use): the Push back button (`POST /api/leaks/lesson {act, leak_id,
  text, author, role, scope}`), the Strategist's Apply card `leak_lesson`, or Claude Code. Each is judged once
  (`judgeLesson`: holds | partly | does_not_hold, why, a standing `rule`, the area) against the leak and its context, and
  every later search-term judge and review reads them (`lessonsText`). A client's lesson is always its own brand's;
  `scope: 'all'` (act_id '') is the team's. `GET /api/leaks/lessons`, `DELETE /api/leaks/lesson?id=&act=`; all three on
  CLIENT_RULES (both copies). Saving drops the brand's cached list (or every brand's).
- Verified live on Lucky 2026-10-13: the review called the phone cart path the root, PMax "check first" (Google claims
  $19.4K vs Triple Whale's $14.6K), two Meta cut sets "not the cause" (CTR 2.6% and 2.5% against a 1.47% median), and a
  test lesson came back "partly" with a sensible rule (deleted after: it was not Cole's).

### 2026-10-13 (third pass): the AI check is ON DEMAND, suggestions not orders, the FINAL CALL. Supersedes the six-hour cache above.

Cole: "make it a button... that way we don't have to waste money", "it's not saying don't cut them... it's I would suggest
doing this before anything else", and "we do need an end call whether we go with ours or the AI's". Tests 24/24.
- **Measured cost** (usage from the API, `meter` in leakctx.js, monthly tally in settings `aiSpend:leaks:<YYYY-MM>` =
  {calls, in, out, usd, by: {judge, review, lesson}}): one AI check = judge ~7K in / 1.5K out + review ~6K in / 1.8K out
  on Sonnet 5.5 ($2 / $10 per M) = Lucky 5.65 to 5.8 cents, Bonk 6.3 cents. A pushback answer ~1 to 2 cents.
- **`leaksFor(..., {ai})`**: ai = the judge + the review, stored in settings `leaksAI:<brand>:<days>` = {at, usd, labels
  {terms by "term|campaign_id", cats by "label|campaign_id", flows}, review {leaks, summary}}. Without ai (every page,
  the Strategist view, the morning card Tuesday to Sunday) the plain list re-applies the LAST check's labels and
  verdicts at no AI cost; terms the check never saw are counted in the Google note; a brand never checked reads
  `review_error: 'not checked yet'` and shows no negatives. The plain list caches an hour. `GET /api/leaks?ai=1` (never
  for a client). **Monday's morning card runs `ai: true` for every brand** (the weekly check that replaced Viktor's
  report): about $2.40 a month for 9 brands.
- **Voice**: the review prompt says SUGGESTIONS to a team that makes the calls ("I'd suggest fixing X first", never
  "don't cut"); every rule's fix line opens "Worth...", "One option is...", "the call is yours".
- **The final call** (`decideLesson`, `POST /api/leaks/decide {act, id, decision: team|locus}`, columns `decision`,
  `decided_by`, `decided_at` by guarded ALTERs): Locus judges a pushback ONCE and never re-argues; when it says partly or
  does not hold, a person picks Go with the team (every prompt then reads "THE TEAM'S FINAL CALL: follow it, even where
  the data disagreed") or Go with Locus ("SETTLED: keep showing the leak, mention their view in one line"). The
  Strategist's `leak_lesson` takes `final: true` ("go with ours regardless"), recorded at once. On CLIENT_RULES (both).

- **No daily on a report day (Cole, 2026-10-13).** `dailyBriefs`: on a Monday (weekly on for the brand) or the 1st
  (monthly on) the client daily is NOT written or posted; `reportCovers(a, today)` names the report, and the day's row is
  stored as `skipped` with the text "No daily today: the <weekly|monthly> report covers <day>." plus its numbers
  (`briefData`, after the same freshness re-pull), so the morning card says "no client daily today, the weekly report
  covers it" and still shows yesterday against plan. #daily-briefs therefore holds one draft per brand per morning, and
  only drafts (daily, weekly, monthly). Cole may rename the channel in Slack (the id stays C0C8UA53U3W).
- **Quiet when empty (2026-10-14):** a brand with no numbers, no lines, nothing owed and no weekly line gets no card that
  day (`morningCardDone` 'nothing to say'). First live run 2026-10-14 5am: 9 cards posted, every daily draft landed in
  #daily-briefs (C0C8UA53U3W); SpeedIn (not launched) got an empty card, which this stops.
- **2026-10-14:** the morning card's leak line: MONDAY = one "Weekly leak check: N leaks; I'd look at <biggest to act
  on> first (<$ a month>) · N searches to block · full list on Overview" tagged to that leak's owner (the AI check runs
  for it); Tuesday to Sunday = a line only for a NEW leak over $500 a month. The full list moved to Home > Overview.

## 2026-10-14: PRODUCTION V2 (`src/prodwork.js`). Asana and Frame's production jobs, inside Locus. Read before touching production.

Handoff `docs/handoffs/production-v2.md`; approved mock https://claude.ai/artifact/Tw9a67Zb4qLg5ZgFDApUMj (v7, after research
Cole asked for; the team does not use Frame's Premiere panel, so review moved into Locus and Frame can go). Tests:
`node test-production2.mjs` (14), test-clients has a Production check.
- **2026-10-14 (afternoon): THE BRIEF IS ONE WRITTEN PAGE, not a form** (mock v9, after Cole asked whether I had researched
  how the team writes briefs: Ice & Gold 3/4/5, Lucky 440-2, Party Patch 437 and Grunk 370 are all one flowing Asana
  description with headings, bold labels, numbered ads, pictures and links). `brief_json = {v: 2, html, format, sizes}`.
  `sanitizeHtml` is the only door in (allowlist p br strong em u s code pre blockquote ol ul li a h1 h2 h3 hr img video span;
  only href / data-file / data-ph / data-ai survive; b/i/div are aliased; scripts and styles are dropped with their content;
  unclosed tags are closed; 80k cap). `<span data-ph>` = a grey hint that vanishes when typed over, `<span data-ai>` = words
  the AI wrote (tinted until edited), `<img data-file>` / `<video data-file>` = a file uploaded on the card (kind `inline`;
  the signed src is filled at read time by `fillSrc`, never stored). `htmlToText` makes brief_text (lists number themselves,
  hints left out). `templateHtml(kind new|iter|resize|blank, format, num)` seeds a page with the card's own ad numbers
  (48-1, 48-2, 48-3); `getCard` returns `brief.blank` and `templates` for a page with no words. Old cards: first open reads
  `html_notes` live from Asana (`asanaToHtml`: top-level newlines become paragraphs, Asana's tags pass, the template's
  example line becomes a hint), else `textToHtml` of brief_text or the Google Doc. A v1 form brief converts on read
  (`toPage` / `v1ToHtml`). Asana export `briefHtml` = Asana's tags only (p/br to newlines, h3 to strong, pictures as a link
  to the card, hints left out, named entities decoded, valid XML with `<hr/>`). The sync (asana-brand.js, `TASK_FIELDS` now
  carries `html_notes`) stores `briefFromAsana(old, html_notes, notes)` when the Asana text really changed. `aiFill`
  sends the whole page and gets the whole page back: every hint and every empty label gets `<span data-ai>` words; a typed
  sentence that went missing makes it refuse (502), nothing is kept; a page with words and nothing to fill returns
  `filled: 0` with a why. Route `GET /api/production/template?id=&kind=`.
- **Versions are per ad and automatic; no size limit** (Cole: "like Frame"). `adOf(name, num)` reads the ad from the file
  name ("48-3 v2.png", "LG_440-2 final.mov", "48_3.mp4"; the card's own number wins when several pairs appear; no pair =
  "" = the ad itself); `p_work_file.ad`; version = MAX per (card, ad) + 1. `POST /api/production/upload` stays for files
  one request can carry; bigger ones use R2 multipart: `POST upload/start?id=&kind=&name=&type=&size=` ->
  `{id, key, uploadId, part: 24MB}`, `PUT upload/part?id=&key=&uploadId=&n=` (body = the part, key must be the card's),
  `POST upload/finish {id, key, uploadId, parts, name, type, size, kind}`. A mime of application/octet-stream is read
  from the extension (.mov). `pruneFiles` keeps the last version OF EACH AD. `decide` names the ad ("Approved 45-1 v3.") and
  takes `file_id`. `filesOf` orders by ad then version; the board thumb and the client thumb are the newest PICTURE of any ad.
  Not tested live: a real multipart upload against R2 (the Node test mocks createMultipartUpload / uploadPart / complete).
- **Tables** (created on first use by `ensureWork`, called by every route and by `syncTasks`): p_br_batch gains `brief_json`,
  `brief_at`, `brief_hash`, `launch_on`, `needs_client` (idea | ad), `client_sent_at`, `client_due` (+3 business days),
  `approved_by`, `approved_at`, `share_token`. `p_work_comment` (comments AND notes: `file_id`, `shape_json` in 0..1 of the
  picture, `at_sec`, `fixed_at/by`, `kind` comment | note | change_request | approval | system, `asana_story_gid`).
  `p_work_file` (R2 `work/<act>/<card>/<id>-<name>`, `kind` version | insp, `version`, `stream_uid` / `play_url`, `deleted_at`).
- **The brief**: `normBrief` is the only shape (kind new | iter | resize | free, format Static | Video | UGC | Carousel, the
  framework fields, hooks, `rows` keyed per format `ROWCOLS`, sizes, insp, iter, resize, notes, ai = fields AI filled).
  `briefText` renders it to brief_text (labels per line), `briefHtml` to Asana html_notes, `fieldsFromText` reads it back
  (our text, the old Asana template, a Google Doc; unlabelled text lands in notes). An old card is read once into fields on
  first open. `aiFill` = one Sonnet 5.5 call with the short brand brain + SPECIFICITY, told ONLY the empty fields;
  `mergeAi` never overwrites a typed field and replaces model dashes with commas.
- **Asana sync never overwrites a Locus brief**: `saveCard` PUTs html_notes with `opt_fields=notes` and keeps a hash of what
  Asana stored (`brief_hash`); `syncTasks` skips brief_text when the incoming notes hash the same, and when the text really
  changed in Asana it re-reads the fields from it (Asana wins). New Asana comments come into the card (`pullStories`, open
  tasks the sync saw, 25 a run); a team comment in Locus is copied as a story "From Locus, <name>:".
- **The mirror switch**: `settings.asanaMirror` {on, at, by}; on unless false. Off = no Asana write anywhere (move, save,
  comment, a new brief is made locally by `localBrief`), `brandAsanaTick` and `hookRun` skip `syncTasks` (the tagger and
  results still run). `GET/PUT /api/production/mirror` (team) also counts "cards not yet in Locus" per brand.
- **Files**: `POST /api/production/upload?id=&kind=version|insp&name=` (raw body, image or video, 95MB); a version moves a
  Brief / Making card to Review. Served by `GET /api/production/f/<id>?e=&s=` (public, HMAC of id.exp with SESSION_SECRET,
  12h, Range for video). Video a browser cannot play: `convert` copies it to Cloudflare Stream when `CF_ACCOUNT_ID` +
  `CF_STREAM_TOKEN` are set (not set yet), the card read stores the MP4 download URL once ready. `pruneFiles` (hourly tick):
  60 days after Live only the last version stays.
- **Decide**: `POST /api/production/decide {id, ok, body}`: approve = Ready (an idea stays in Brief) + approved_by; ask for
  changes needs a note, Making, DM to the owner. A client may decide only while `needs_client` is set
  (`POST /api/production/send {id, what: idea|ad|''}`, team). Mentions: `@Name` in a comment = a Slack DM (slackIdOf), the card
  link `profit/?open=production&card=<id>`. A client comment = one line in the brand's internal channel (teamPost, tagged owner).
- **Client** (brandguard, both copies): GET /api/production (act need) answers `clientBoard` (needs + coming, never the
  board), GET /card, POST /comment and /decide with `own` p_br_batch. Everything else 403. Team names read "Mobius".
- **Review link** (no login): `POST /api/production/share` makes `share_token`; `profit/review.html?t=` reads
  `GET /api/review/<token>` and posts `/note` and `/decide` with a typed name (worker.js, before the auth gate).
- **Photos**: `savePhoto` in googleLogin keeps each person's Google picture (`settings.userPhotos`); `GET
  /api/production/photos` = roster name -> Google photo, else Slack's (users.info, cached a week in `slackPhotos`).
- NOT tested live: Asana html_notes / stories / the hash round trip, Slack DMs, R2 upload of a real 90MB video, Stream,
  the morning card line for unanswered mentions (not built).

## 2026-10-14: CLIENT ISOLATION AUDIT (read before adding a client route or a brand field)

Cole saw other clients' Google Ads accounts in a client's Integrations. A full audit of every client-reachable route
(both workers, Supply, the AI routes) followed. Fixed and tested (`test-clients.mjs` 27, `test-morning.mjs` 7):
- **The guard checks EVERY brand field** (brandguard.js `guardClient`, both copies identical): the query's `act` and
  `act_id` (every copy), and the body's `act`, `act_id`, `screen.act_id`, each a string that is the client's, or 403.
  The body is read whatever the Content-Type (handlers call `request.json()` on text/plain too); only multipart,
  octet-stream and media bodies are skipped. Before this, an `act` sent as an array, an `act_id` beside a matching
  `act`, or a text/plain body opened another brand on the voice desk, Studio AI, Change Log and more. `brand` in the
  query is NOT checked: it is the Supply proxy's own slug, overridden there.
- **Integrations for a client** (`clientIntegrations`): no agency card, no pick lists (they hold every account Mobius's
  logins reach and the brand each is linked to), no paste box for an id outside `LINK_FIELDS`, levels without notes.
- **Rules added:** Studio `base_id` is an owned record; `PUT /api/brand/doc` refuses `DOC_TEAM` keys (asana, assets,
  google, tiktok, klaviyo, clarity, survey_*, voice_skill, rules); `GET /api/brand` drops stored keys from `docs`;
  `PUT /api/season/answer` refuses key `war`; Studio batch save checks `batch.br_batch_id`; leak lessons are the
  client's own brand's only, without team emails, and a client cannot delete an every-brand lesson; `/api/accounts`
  drops `lastDiscover`; `/api/metaday` keeps only `ours.high`; `/api/daycheck` gives a client `client_line` as `why`
  and no `todo`; `/api/summarise` needs the client's `act`; caps on `/api/brand-asana/tested`, tw-sync (70 days) and
  the Supply backfill (400 days).
- **Handlers:** a client or review-link guest comment is always `comment` / `note` (never approval / system, prodwork);
  creator page uploads must live under the brand's own `amb/<prefix>/` and only those are deleted; section icons go
  through `cleanSvg` (an allowlist of drawing tags and attributes) on write AND read; ad share links keep only the
  brand's own ads at mint and re-check at read, video read from the ad, never from the stored snapshot; Supply upserts
  (`categories`, `lines`, `factories`, `collections`, `slots`) never update another brand's row
  (`WHERE <table>.brand_id = excluded.brand_id`); the morning DM fails closed (no brand limit = every brand only for
  someone `emailAllowed` says is the team); the hub and `/api/overview` build only a client's own brands; order
  lookups by ad set or campaign are scoped to the brand; search rows carry `act_id` so the filter can see them.
- **Also fixed:** `suggestGoals` read an undefined `win` (the goal suggestion 500'd every time).
- **The rule for new code:** anything a client can reach must either name the brand in `act` / `act_id` (checked) or
  return objects that carry `act_id` (filtered). Lists of ids Mobius can see, totals across brands, names of other
  brands in text, or a stored id written by the browser are leaks the filter cannot catch: strip them in a `post`.
- Not changed (plausible, left for later): Launch to Meta accepts any `video_id` the system user can read for an ad in
  the client's own account; Google `from` / `to` go into the query unvalidated (stays inside the brand's own account);
  a brand brain may mention a competitor that is also a client.

### 2026-10-14 (evening): a call per AD, replies, labels on their own line (prodwork.js)
- `adsOf(files, comments)`: every ad of the test with its newest version and its OWN status from the last approval /
  change request / reopen on that version (a new upload after a change request is back to review); `open` = unfixed
  notes on it (replies not counted). Returned as `ads` by getCard, `/api/production/card` and the review link.
- `decide` records the call on ONE file (`file_id`, else the newest upload). `reset: true` = kind `reopen`. The card goes
  to Ready only when EVERY ad is approved; a change request moves it to Making and DMs the maker; `needs_client` clears
  only when no ad is still waiting; a client may decide while the card is sent (`needs_client`) or was sent and not taken
  back (`client_sent_at`), and a client's reopen sends it back to them. A client's call posts one line in the internal
  channel. Returns `{ads, all_approved, moved}`.
- Replies: `p_work_comment.parent_id` (ALTER on ensure); a reply takes its parent's file and second, kind `reply`.
- `splitLabels`: a paragraph that starts with a bold label ending in a colon becomes the label alone, then the words
  in their own paragraph (sanitizeHtml runs it, so every read and save). Templates use the same shape; the ads of a new
  test are their own section ("The ads", Ad 48-1 bold, the words below).
- Tests: test-production2 14 (per-ad calls, reopen, replies, take back).
- **2026-10-14 (night):** `addComment` answers as soon as the row is written; mentions, the Asana story and the client
  line run in `d.waitUntil` (worker.js passes `waitUntil` to handleProduction and handleReviewLink; without it, as in
  tests, they are awaited). `POST /api/production/comment/delete {comment_id}` (`deleteComment`): the author, or the
  owner; replies go too; decisions refuse; the Asana copy is deleted after. Comments carry `mine` / `can_delete`.
  Files carry `download` (`&dl=1` = attachment). launch.js `sourceOf(..., d)` takes `work_file` (see profit/CLAUDE.md).
  brandguard: client rule for comment/delete (owned record). Tests: test-production2 15.
- **2026-10-14 (late): everything instant (Cole: "Frame is instant").** Measured on Ice & Gold #5 (5 ads, 10 versions):
  every card on the Files tab loaded the ORIGINAL 2.4MB PNG, every read of the card minted a new signed link (so the
  browser could never reuse a picture and each repaint re-downloaded them all), approve waited for Asana before
  answering, and `ensureWork` ran 16 statements on every cold isolate. Now: `fileUrl` puts the expiry on a 12-hour
  grid (the same link for 12 hours, valid 12 to 24), `serveFile` answers `private, max-age=86400, immutable`, and
  `?w=600` / `?w=1600` serve a WebP copy made ONCE by the Images binding and kept in R2 beside the original
  (`<r2_key>.w600.webp`; `PIC_SIZES`; pruned with the file; 39 to 72KB against 2,452KB). `filesOf` and an upload
  answer carry `thumb` (600, cards and strips), `view` (1600, the viewer; notes are stored 0..1 so a resized
  picture lines up) and `url` (the original: Download, Launch to Meta, videos). `ensureWork` is one probe SELECT on a
  warm schema. `getCard` reads files, comments, the mirror and the brand list together. `decide` writes the call and
  the column, answers, and runs the Asana story, the client's Slack line, the maker's DM and `moveCard` (Asana
  section, morning card) in `waitUntil` (`later: true`). `POST /api/production/decide {id, all: true}` (or
  `file_ids`) = `decideMany`, one call per ad still waiting, the last answer carries the card (`count`); the review
  link takes it too. `serveFile` keeps file rows in the isolate for 10 minutes (`FILE_ROWS`) so a warm worker answers
  a picture with one R2 read. **The edge cache (caches.default) is a no-op on a workers.dev address**: tried and
  removed the same day; the browser cache carries it. Tests: test-production2 15 (approve all, sized copies with a
  mocked Images binding, a download is always the original).
- **2026-10-14 (night): the BATCH launch (Cole: "how can I launch an entire batch of ads into Facebook").** launch.js:
  `POST /api/launch/batch-prep {act, card_id, adset?}` = every APPROVED ad of a Production card (adsOf on p_work_file +
  p_work_comment) with its Meta name (`<ad> | Still|Video`, i.e. "5-2 | Still", the name Locus already uses, numOf ties
  it to the test), its copy and WHERE each line came from, the ad sets (the test's own first, else the set of the
  brand's last launch, else `suggest`), the button the brand used last (`p_launch.cta`), what was already launched
  (`p_launch.work_file`), warnings (missing copy, the 6-per-set rule, read-only account). `batch-preview` = one dry run
  per ad; `batch-create` = `launchCreate` per ad in turn (PAUSED, p_launch, p_br_adtag), one failing ad never stops the
  rest, each row answers with its launch or its reason; a repeat into the same set is refused per ad (`work_file` +
  adset). **The copy comes from the BRIEF and only the brief** (`briefCopy(html)`): a Headline / Primary text /
  Landing page (or Link) / Description line is shared by every ad; the same label under an ad's own heading ("Ad 5-2",
  a bold "5-2.", or "5-2" alone on a line, until the next ad heading or section heading) is that ad's and wins; a
  shared line that lists every ad in turn ("5-1 The chain he'd never buy himself · 5-2 Your whole list", or one
  "5-2: ..." paragraph per ad) is split per ad (`splitByAd`, only when the words start with an ad number); hints
  (`<span data-ph>`) are not words; words run on over following paragraphs until a label, a heading or a blank line.
  The browser sends only the picked file ids, names and links: an ad whose brief has no headline or primary text is
  refused with the ads named and NOTHING is made ("Refuse until the brief has it", Cole). The single Launch to Meta on a
  Production file now reads the brief the same way and is named "5-3 | Still" too. Team only: the batch routes are not
  on brandguard's client rules. Tests: test-launch.mjs 18 (briefCopy shapes incl. Ice & Gold #5's real brief, prep,
  refusal, create with the brief's words, per-row duplicate, routes). NOT tested live: a real batch create (the dry
  run was run against Ice & Gold #5 on the local pair: 5 ads, the brief's own lines per ad, nothing written).
- **metawrite `fetchImage` reads a Production picture from R2 itself (2026-10-14, night)**: `serveFile` with the same
  signature check, no network. The worker cannot fetch its own workers.dev address (the same refusal the 2026-10-10
  live launch hit on the profit origin); the first batch dry run read it as a 404 on every ad, and the single Launch
  to Meta on a Production file had the same hole. Checked: the dry run on Ice & Gold #5 proposes both ads cleanly.
- **2026-10-14 (late): three Production fixes from Cole's review.** (1) **New brief is instant**: `POST /api/production/brief`
  with the mirror on inserts the card row first (meetings.js `makeBrief(..., { later: d.waitUntil })`) and answers
  `{num, id, asana_later: true}`; `briefToAsana` runs in waitUntil: it reads Asana's last 3 days of tasks and moves the
  number past a newer one made in Asana, makes the task in Creative Brief(s) with the template (`briefFor`), then links
  the row (asana_gid / asana_url / asana_section / assignee). A call's confirm still awaits it (and drops the row when
  Asana refuses, so its "task to write one" fallback holds). (2) **Grey hints on a new brief**: the Asana template that
  briefFor writes came back on first open as real words (labels, the example line) so the page was not "blank" and the
  Locus template with its `<span data-ph>` hints never showed. `templateOnly(html)` (prodwork.js) = nothing but
  headings, bold labels, hints, the Asana example line and the "Added in Locus" / "From the call" line; `htmlBlank` now
  includes it, so getCard answers `blank: true` + the starting pages and the sheet opens on the template with grey hints.
  The team's own template TASKS in Asana (Lucky "UGC/Video Template", real sentences) are words and stay as they are.
  (3) **Delete an uploaded version**: `POST /api/production/file/delete {file_id}` (team only, 403 for a client):
  deleted_at on the row, R2 original + .w600/.w1600 copies (and the Stream copy) wiped in waitUntil, a system line
  "Deleted v2 of 7-1 (name)" in the history; the ad falls back to the version before, an ad with one version leaves the
  Ads tab, its signed link answers 404. test-production2.mjs 16.

## 2026-10-15: the board from the outside (production.js setField / archiveCard / restoreCard / duplicateCard)

- `POST /api/production/field {id, owner | due | launch_on | format}` writes ONE field: owner -> `assignee_name` + the
  Asana assignee (`asanaUserFor` in meetings.js: roster email, else a name prefix; exported), due -> `due_on` + Asana
  due_on, launch_on stays local, format -> `brief_json.format` (normBrief). 400 on a bad date or format; returns
  `{card, asana: {written, why}}`. `card/delete` = ARCHIVE (board_stage and stage 'done', Asana task completed when the
  mirror is on; returns `was` so the board's Undo can put it back); `card/restore {id, to}` = Asana completed false, then
  `moveCard`. `duplicate {id}` = `makeBrief` (or localBrief) titled "<title> (iteration)" with an Iteration page whose first
  hint names the source ("<num>-1"). All four are team only (a client gets 403 before the route). Tests in
  test-production.mjs, the 2026-10-15 check.

## 2026-10-15: short Slack posts and ONE approval per plan change
- **Today's calls thread** (todaypost.js `messageFor`, second pass the same day, Cole: the FULL list, never "N more in
  Locus"): every call is its own section with the full why, sorted by money at stake. Slack folds ONE tall section
  behind Show more, never a message of many short blocks (how Viktor's long posts stay open). 45 calls a message;
  past that `rest` holds the next messages (Slack's 50-block limit), posted by todayTick and the morning card's thread.
  The morning card (`cardMessage`) is short sections too. Verified live in #locus-alerts with Dartee's 9 calls.
- **Grouped proposals** (ask/engine.js `groupProposals`, `applyGroup`): two or more proposals from one answer are ONE
  card on Slack and in the web chat ("N changes, one approval", numbered, Apply all / No thanks). The card's id is the
  ids joined by commas; `applyProposal` with a comma id applies each in order and returns `{group, note}` with a line
  per change. Ledger and Supply get it on their next deploy. The Slack tap (worker.js) now applies in `waitUntil` after
  the ack (several changes run past Slack's 3 seconds) and says "Applying them now..." first.
- **season_plan** (strattools.js `seasonPlanAction`): phases / tasks / answers / the War Room plan in ONE proposal;
  phases are read first and merged (PUT /api/season/phase rewrites every column); applied in order, stops at the
  first error and says what went in. PLAYBOOK "PLAN CHANGES ARE ONE APPROVAL": state the plan as a short numbered
  list, then one card. Verified live 2026-10-15 in #locus-alerts (The Golf Sock test thread): one card; Apply not tapped.

## 2026-10-15: TEST MINIMUMS DUE OFF, EVERY DAY (`src/minoff.js`). Read before touching test minimums or the Monday post.

Cole approved: a DAILY check with a Slack button, every active brand (before, minimums came off only on the Monday "Do
it", and only for brands with `rules.monday_post` on). Tests: `node test-minoff.mjs` (10 offline checks, Graph + Slack mocked).
- **Which sets**: asana-brand.js `testMinimumsDue(env, act)` = `mondayCalls(env, act, { minOnly: true })`: the SAME
  judgement as Monday (judged and not a loser, or still early but past `rules.min_days`), and the minimum still set in
  Meta (`testMinimums`, read live). Returns `{ due: [{id, name, act, min, day, why}] }`, no message, no permission reads.
  With the defaults (min_days 7 = judge_days 7) the "past min_days" path never fires: a test past 7 days that is not
  judged is "starved" and counts as a loser. Only a brand with min_days under judge_days sees "past N days" lines.
- **The tick** (`minOffTick`, hourly, right after actionTick; `minOffDeps()` in worker.js): once per Central day from the
  morning hour, every active brand (`eligible`: not paused, not The Golf Sock, not Harborline, not demo_) with an
  internal channel. Waits up to 3 hours past the morning hour for today's morning card, then posts anyway (teamPost
  falls back to top-level). `subCanAfford(40)` before each brand. One message per brand only when something is due:
  the buyer tagged (calendar.js `teamOf`), one line per set "<set>: test minimum $X/day is due off (day N, judged)." with a
  "Take it off" button (`minoff_one_<i>`), and "Take all N off" (`minoff_all`, confirm dialog) when two or more are open.
  State `minOffDone` {date, acts, tries}; the message `minOff:<act>:<date>`. Switch `settings.minOffPost` ('off' stops it;
  `/api/settings` GET/PUT; Locus Agency settings > Slack and sending, under the morning card switch).
- **The button**: `/slack/actions` -> `handleMinOffButton` -> metawrite.js `locusWrite` kind `min_spend`, min 0, `who` = the
  Slack name: the same fresh read, brand check, Manage check, `p_meta_write` row, Change Log line and 24h undo in Locus as
  the Campaigns screen. "Nothing would change" = already off (struck, "Already off in Meta"). A refusal keeps the line's
  button and shows Meta's reason. The message is redrawn through response_url: "~line~ Done by X, undo in Locus".
  NEVER applied by itself.
- **slack-router**: `IDEA_ID` now matches `minoff_` AND `tests_do$`. The Monday Do it button (`tests_do`) matched no Locus
  rule in the router and fell through to Pulse, so it cannot have worked through the router before this. Needs the
  slack-router deploy.
- The unused `min_spend` ($20) rules field is gone from asana-brand.js `rulesOf` (read nowhere here; profit's TEST_KEYS is
  handled separately).
- NOT tested live: a real tick (`lastHourly.minOff`), a real tap through the router, response_url redraw on a thread reply,
  the router deploy.

## 2026-10-15: ONBOARDING AUDIT, THE CONNECT LINK, THE META PARTNER SWEEP

Cole: "when they give access to our partner account I have to manually assign those two people... can I just send
all the clients a link that auto updates?"
- **Meta partner sweep** (`metaaccess.js partnerSweep`, hourly before `autoConnectMeta`; `POST /api/ask/access {sweep|dry}`):
  walks `695359915477596/client_ad_accounts | client_pages | client_pixels | client_product_catalogs` and assigns the
  Mobius Tools system user + the team by NAME (`DEFAULT_TEAM`, or settings `metaTeam`; Meta hides `business_users`
  from a system user, so ids are read off `assigned_users` on client accounts). Scope = assets whose owner business is
  a live brand's, plus anything new since `metaSweepSeen` (first run = baseline; past clients untouched). First run
  2026-10-15: 35 assignments (ad accounts + catalogs). **Pages need `pages_manage_metadata` on the Mobius Tools token;
  pixels answer "(#10) Application does not have permission"**: both reported once in `errors`, assigned by hand.
- **Connect link** (`connect.js`, page `onboard/connect.html?c=<20 hex>`): public `GET/POST /api/connect/<token>`
  (before the auth gate). Lists only what Locus cannot read yet (from `integrationsReport({brand})`, cached 45 s);
  Clarity token, Klaviyo key, Triple Whale shop and Google Ads ID are finished ON the page; "We don't use this" =
  `connectSkip:<brand>`. Opening it runs Google `autoMatch` (at most every 5 min). Tokens in settings `connectTokens`.
  Staff list: `GET /api/ask/connect` -> Locus Agency settings > Integrations > "Ask clients for what is missing".
  The onboarding API (profit brand.js) serves `links.connect` for brands that exist.
- **Google Ads request is sent by Locus** (`google.js adsInvite` = `customerClientLinks:mutate` PENDING from the MCC):
  from the connect page and from onboarding answers `gads_id` (`onboardAdsTick`, hourly); the pending ID links itself
  once it shows under the manager (`pendingTick`). NOT tested live: the mutate call.
- **Hourly** now also runs Google `autoMatch` (GA4 / Search Console linked the moment a client adds Cole). It linked
  Dartee GA4 + GSC and SpeedIn GA4 on its first run.
- **Onboarding questions** (onboard/questions.js v10): Google Ads user-invite step removed (the manager link covers it),
  Clarity added, Klaviyo asks for a Full Access private key on the connect page, Meta says we assign ourselves; extras
  `vip`, `reorder_flows`, `content_calendar` removed (Klaviyo / the Locus calendar answer them).
- **TikTok**: still not connectable: TIKTOK_APP_ID / TIKTOK_APP_SECRET are not set (app review). Once set, Cole signs in
  once; TikTok ties the token to the ad accounts ticked at sign-in, so a NEW client's TikTok account needs a re-connect.
- **2026-10-15 (later), Cole: "all they need to do is give me access... then I need a checklist on my end."** The client
  never pastes a key: Clarity and Klaviyo are INVITE steps on the connect page ("Done, I invited you" ->
  `connectInvited:<brand>` + a Slack line), and the staff list carries `yours` per brand (connect.js `YOURS`: the clicks
  for Cole and a paste box that PUTs `/api/brand-links` klaviyo_key / clarity_token). No Clarity = Cole installs it
  through the Shopify collaborator access. The Meta sweep and Google autoMatch run hourly ONLY while a New client is
  under 45 days old, else once a day at 4am Central.
- **2026-10-15 (last), Cole: "check-ins are a way for things to break; if something happens, then this happens."** No
  timed access checks any more (the hourly sweep / Google match / pending Google Ads / onboarding Ads tick are gone from
  the cron; `autoConnectMeta` stays as before). Every connect-page item has a Done button (`done_label`); Done records
  `connectInvited` and runs `connectNow(env, key, brand)` in waitUntil (meta = partnerSweep + autoConnectMeta; ga4 / gsc =
  autoMatch; google_ads = send the request + link if accepted). The onboarding form's access ticks and the Google Ads ID
  field send the same POST (onboard/index.html `tellConnect`, needs `links.connect`). Cole's Check now =
  `POST /api/ask/connect/check` (connectNow 'all'). Meta and Google offer no webhook for "a client gave you access".
  Clarity: the CLIENT installs it (free Shopify app) and invites us; Cole connects it.

## 2026-10-15: FRAME IN STEP WITH PRODUCTION (`src/framesync.js`). Read before touching deleteFile, uploads or Frame.

Cole deleted Ice & Gold ads in Locus after Fela's comments, but Frame still held them and every v1, so the media buyer
downloaded old ads. Now a Locus delete or a new version puts the card's Frame concept folder in step for THAT ad.
Tests: test-production2.mjs 17 (Frame mocked: moves, the old folder made once, bring-back, a link-less card found by
number, a 429 left pending and finished by the hourly retry, no DELETE call ever).
- **Triggers:** prodwork.js `fileRow` (a new version of an ad) and `deleteFile` call `frameLater(env, d, card, [ad])`:
  `d.waitUntil` in the worker (never blocks the answer), awaited in tests.
- **The rule per ad:** the current Locus version (newest not deleted) stays in the concept folder; every other Frame file
  of that ad (`adOf` prefix "5-4") is MOVED into "zz Old versions (do not launch)", a sibling of the concept folder under
  Ad Concepts (made once; `settings frameOld:<parent id>` remembers it and a D1 claim stops twin folders). Current =
  same title (`titleOf`: no extension, no ad number, no trailing v2 / final / (1); Frame's may add words, a resize) and,
  when the Frame name says a version (`verOf`), the same one. Current not in Frame = moved back from the old folder, else
  sent by `remote_upload` (Frame fetches the signed Locus link, 24h). An ad with no live version = all its Frame files
  move. An ad Locus never had, and files with no ad number, are left alone.
- **Never deletes** a Frame file or folder (review links). Moves only; version stacks move through `version_stacks`.
- **The folder:** the card's `asset_url` (next.frame.io/project/<p>/<folder>, from the Asana notes) when that folder's
  name starts with the card number; else the brand's project (frame connection, else the project named like the brand)
  > Ad Concepts > "<num> - ...", and a found folder fills an empty `asset_url`. Kept in `p_br_batch.frame_json`
  {account, project, folder, parent, pending, tries, at, last} (guarded ALTER). No folder = nothing happens.
- **Rate limit:** Frame allows about 10 moves a minute. A 429 waits 7 s then 14 s; still refused = the ad stays in
  `pending` and `brandAsanaTick` runs `frameRetry` (cards untouched for 10 minutes, 5 a tick, gives up after 6 tries).
- Each sync that did something writes one system line on the card ("Frame: moved ... to "zz Old versions ..."").
- `frameApi` errors now carry `status`; production.js answers a non-HTTP error status as 500.
- **Verified live 2026-10-15** (local `wrangler dev --remote` against real Frame and D1, test card 999 on The Golf Sock,
  folders "MD - Internal > zz Locus Frame sync test > 999 - Frame sync test"): v1 upload moved the stray v2 out, the v2
  upload swapped them, deleting v2 moved it out and brought v1 back, each within ~5 seconds. The test card rows were
  removed; the Frame test folders stay (never delete Frame). Not tested live: `remote_upload` (the dev origin is not
  public), the 429 path, a version stack.
## 2026-10-15: SLACK ANSWERS LIKE VIKTOR (one message, real tables, order line items, image matching). Read before touching answerSlack.

Cole compared a Locus thread with Viktor's on the same Bonk BFCM question (Locus: 6 posts, a split code-block table,
"can't see line items", "web search ran out", "is this for Bonk?"; Ice & Gold V1s: "I can't see images, a human should
sort 14 pairs"). Tests: `node test-stratdata.mjs` (8); test-stratmake checks the report rides on the one message.
- **One message** (ask/engine.js `slackMessage`): the answer is drawn as rich_text (one short block per paragraph /
  list / quote / code, never one tall block: Slack folds a tall block behind Show more) plus at most ONE native `table`
  block (Slack allows one a message; a markdown pipe table or a code-block table becomes it; further tables are
  monospace). Refused table = the same message with the table monospace (`plain`); refused again = section pieces,
  logged "rich message refused". A copy/paste draft after a line "---- draft ----" (`splitDraft`) is the only second
  message. Reports ride as link buttons (`noop_open`, one block each) on the answer, never a second copy. The live
  "On it" message is replaced in place. Prompt: `C.slackStyle` overrides the engine's Slack style block.
- **Citations**: adjacent text blocks in the final turn join with nothing between (a web answer is one block per cited
  phrase); only a tool step between two blocks starts a paragraph.
- **store_sql** (stratdata.js): Triple Whale's warehouse through `POST https://api.triplewhale.com/api/v2/orcabase/api/sql`
  {shopId, query, period {startDate, endDate}}, x-api-key = TW_API_KEY (works, verified 2026-10-15: Bonk BFCM 2025 =
  535 paid orders, 1.89 units, 677 Headwear units). ClickHouse; `orders_table.products_info` is the line items;
  `@startDate` / `@endDate` in the SQL. `gateTwSql` = one SELECT/WITH, no writes. Always loaded.
- **web_lookup**: DuckDuckGo html (Bing second) and a page reader (r.jina.ai when a plain fetch is thin), for when the
  server web_search / web_fetch (now max_uses 15 each) run out. Always loaded.
- **make_canvas**: `canvases.create` (markdown) + `canvases.access.set` (asker write, channel read) + files.info permalink.
  Needs the bot scope `canvases:write`; NOT verified live (the tool says the fix if Slack refuses).
- **match_ads_to_board**: live Meta ads (ad sets by name, `adset.id IN` so the creative read stays small; never
  asset_feed_spec) and their adimages (full url + upload name) vs the Production board version files of the tests
  (p_work_file, 600px via prodwork `smallPic`), ONE Opus 5.5 vision call (~$0.16 for 29 ads + 28 files), verdicts:
  keep = the last approved version of each ad (else the newest), pause = any other version, unsure = no match; plus
  upload order, duplicates (two ads on one design) and board files never uploaded. Live run on Ice & Gold tests 3/4/5
  matched all 14 V1s with the deciding detail and the Strategist sent one 14-pause approval card (not applied).
- `POST /api/ask/tool {name, input}` runs a data tool directly: ADMIN_TOKEN only (the local .dev.vars token works on
  `wrangler dev --remote`, which carries the deployed secrets).
- Ledger and Supply use the same engine: they get the one-message Slack shape on their next deploy (not deployed here).

## 2026-10-17: FULL CONTROL OVER EVERY CONNECTION (`src/extwrite.js`, `allwrite.js`, `slackwrite.js`, `googlewrite.js`, `tiktokwrite.js`, `shopifywrite.js`). Read before adding a write.

Cole: "Locus should have every Slack permission and full control over every connection we add." Every action applies at
once on a teammate's direct ask (strategist.js `directActions: 'all'`, `cardOnly: CARD_ONLY` from allwrite.js) and keeps the
metawrite.js rules: look up first, the brand's own object only, before -> after, one Change Log line (`activities`,
event_type `<platform>_write`, filed under the brand's Meta account), undo where the API allows. Tests: `node test-fullcontrol.mjs` (10).
- **The record:** Meta writes stay in `p_meta_write`; everything else goes to `p_ext_write` (platform, before, after, `undo`
  = how to reverse it, null = cannot). `undo_change` takes back any write for 24h (xw_ / mw_ id, or "last" per brand,
  which also finds Meta's). A module registers its undo with `registerUndo(platform, fn)`.
- **New actions:** Slack `slack_post` (internal channel or a teammate's DM), `slack_post_client` (CARD ONLY; apply refused
  unless Cole while `settings.slackSendWho` != anyone), `slack_schedule`, `slack_react`, `slack_pin`, `slack_edit` /
  `slack_delete` (its own posts only), `slack_invite`, `slack_channel`. Client-facing = a brand's `brief_channel`, any
  Slack Connect channel, a guest DM (`classify`). Google Ads `google_status` (campaign / ad group / ad / keyword),
  `google_budget`, `google_target` (tROAS / tCPA; portfolio refused), `google_rename`, `google_keywords`,
  `google_keyword_bid`, `google_negative` (any match, campaign or ad group, add / remove), `google_ad_text` (RSA); every
  op goes to Google with validateOnly in the proposal; undo replays stored inverse ops (google.js `adsMutate`). Meta
  `meta_bid`, `meta_targeting`, `meta_schedule`, `meta_create_campaign`, `meta_create_adset` (pixel + event copied from a
  running set), `meta_ad_copy` (new creative from the old spec, ad switched; dynamic creative / existing posts refused);
  each validated first with `execution_options: ['validate_only']`. TikTok `tiktok_status`, `tiktok_budget`. Shopify
  `shopify_product`, `shopify_discount` (p_shopify token; refused without write scopes). Klaviyo `klaviyo_campaign_update`,
  `klaviyo_campaign_duplicate`, `klaviyo_list`, `klaviyo_segment`, `klaviyo_rename`. `asana_update`, `drive_folder` /
  `drive_move` / `drive_rename`, `frame_rename` / `frame_comment`, calendar `edit_date`, `tick_step`, `note_date`,
  `remove_date`, `restore_date`. Reads `google_read`, `tiktok_read`, `write_access`.
- **Off by design:** client channel posts and customer sends without a card (slack_post_client, klaviyo schedule / flow
  status, drive_share), deleting anything in Frame (comments cannot be undone either), passwords and secrets. "Undo"
  of a created Drive folder or Klaviyo list only removes it while still empty.
- **Live `write_access` 2026-10-17** (`POST /api/ask/tool {name: 'write_access'}` on a remote preview): Meta writable on
  every live brand, token lacks `pages_manage_metadata`; Google Ads validateOnly accepted (Bonk, Dartee, Grunk, Ice &
  Gold); Drive full scope yes; Klaviyo 5 keys flows + campaigns + templates; Asana and Frame yes. Slack bot HAS
  reactions:read, canvases:write, reactions:write; LACKS pins:write, channels:manage, groups:write, channels:join,
  im:write, chat:write.public (so DMs, pins, invites and new channels refuse until added). Shopify: two installed stores,
  read scopes only, not linked to a brand. TikTok: app keys not set. Ice & Gold's google_ads link is the MCC id
  5566468199 (wrong). Every new write is mock-tested only; the first real one of each kind is the test.

## 2026-10-19: THE CALL SCREENS (`src/callscreen.js`). Read before touching meetings.js confirm or mondayScreen.

The screen Cole shares on the Monday call, a client call and the creative kickoff (profit/callscreen.js). Tests:
`node test-callscreen.mjs` (11).
- **Table `p_call`** (created on first use): one row per call, id `monday:<date>` | `client:<act>:<date>` |
  `kickoff:<date>`, so two laptops open the same row. `state_json` = everything typed (autosaved), `result_json` = what
  Finish made. `p_br_batch.kickoff_at` (guarded ALTER).
- **Routes** (team only, a client scope gets 403; not on CLIENT_RULES): `GET /api/calls/screen?kind=&act=`,
  `GET /api/calls/google?act=&from=&to=` (google.js adsReport by campaign type), `PUT /api/calls/state {id, state}`,
  `POST /api/calls/parse {text, act}` (actions.js parseQuick), `POST /api/calls/done {item, done}` (markDone),
  `POST /api/calls/finish {id, recap?}`, `POST /api/calls/kickoff/done {id, card, note, count, format, due, owner}`,
  `GET /api/calls/history`. worker.js mounts it before /api/actions with `{ ...actionDeps(), waitUntil, adsReport }`.
- **Monday data** = meetings.js `mondayScreen` (now reads every brand at once: 7s -> 3s) minus moved.js `SKIP` brands,
  plus each brand's newest weekly report (`readOf`: totals, prior, plan, `winnersLosers` from `data.ads.top` + Triple
  Whale `data.attr.ads.lastPlatformClick`, Google / Amazon from `data.channels`), open Requests asks. The Slack plan
  thread is split by ONE Haiku 5.5 call per brand (`splitPlan`: read, batches, google, amazon, asks; Radhesh = Google,
  Hamza = Amazon, never in the read), cached on the call keyed by the thread's hash; a brand nobody typed on (`edited`)
  takes the newest split.
- **Finish (Monday, client)** builds notes and writes a `p_meeting` row `live_<call id>` (kind monday_call /
  client_call, status extracted), then runs meetings.js `confirm` (the same path as an approved Fireflies call: team
  items -> p_action, batches -> numbered Asana briefs + Production cards, asks -> Requests, "This week" -> the open
  weekly draft, one Slack note per brand). "This week" = the brand's "For the client" box on the Monday screen
  (`state.brands[act].client`, `typedLines`: one line per typed line, word for word, only clean/noDash, 5 max), so the
  strategist's own words reach the client with no model in between (Cole's rule 2026-10-19: no model writes a line a
  client reads). Only a brand whose box is empty falls back to `clientLines` (one Sonnet 5.5 call from the read and
  batches). The client recap posts to `brief_channel` only when the person ticked it.
- **Fireflies afterwards**: meetings.js `extract` reads `typedOnCall(env, date)` and tells the model those items were
  already typed; it returns only what was said and not typed (summary prefixed "Also said on the call, not typed").
  Nothing new = the meeting is `skipped` with "everything said was typed on the call screen".
- **Kickoff done** = production.js `setField` (owner, due, format; Asana follows), prodwork.js `addComment` ("Kickoff
  <date>: agreed N ads, format, due, who" + the designer's notes; mirrored to Asana as a story), `kickoff_at`, then
  `moveCard` to Making.
- NOT tested live: Finish (Monday or client) end to end, kickoff done, the Fireflies "also said" read. Data loads were
  checked against real data on a local `wrangler dev --remote`.

## 2026-10-19: LOCUS SOCIAL, phase 1: WATCH (`src/social.js`). Read before touching it or the ideas bot's Locus entry.

Plan, audit and UI research: `docs/locus-social/proposal.html` (https://claude.ai/artifact/6DCyDxYMGAsfRpeNWzatZH).
Screens in profit/CLAUDE.md, same date.
- **Data = ScrapeCreators** (`DOWNLOADER_KEY`, the ideas bot's key, 1 credit a call). A brand follow = Instagram
  `/v2/instagram/user/posts` + `/v1/instagram/user/reels` (the posts list leaves most Reels out and has no plays; the
  Reels list has both; items wrap the post in `.media`), TikTok `/v3/tiktok/profile/videos`, YouTube
  `/v1/youtube/channel/shorts` + `/channel-videos`: 5 credits a pull. A topic = TikTok `/v1/tiktok/search/keyword`,
  IG `/v2/instagram/reels/search`, YouTube `/v1/youtube/search`. Following a handle looks it up on all three (3
  credits). `GET /api/social/raw?path=&...` (team) returns one raw answer to check field names.
- **Credits guard:** every answer's `credits_remaining` is kept in settings `scCredits`; under `LOW_CREDITS` (150) the
  daily pull stops so the ideas bot keeps the last ones, and the Watch page tells the team to top up. On 2026-10-19 the
  account had 82 credits left: the daily pull is OFF until Cole tops up ($47 = 25,000).
- **Tables** `social_brand` (Social on per brand), `social_follow`, `social_post` (id `act|plat|pid`; numbers refreshed
  on every pull; covers copied to R2 `social/t/<key>` at pull time because IG / TikTok image links expire; a video is
  copied to `social/v/<key>` on the first Play through `fetchSocialVideo`; both served PUBLIC by an unguessable key at
  `/social-m/<t|v>/<24 hex>` with Range support). Posts older than 120 days go (saved ones and ones made into ours stay).
- **Usually / Breaking out** (`scorePosts`, computed on read): a followed account's median on that platform (views on
  video, likes on carousels and posts; 4+ posts); a topic post's author's followers. Breaking out = 3x usual, posted in
  the last 30 days, 1,000+ views (100+ likes) or 20,000+ views for a topic post. Trend chips (`trendsOf`) = the sounds
  and hashtags of posts at 1.5x+ in 14 days, read off the feed (no extra calls). Hook and format tags = one Haiku 5.5
  batch of 40 untagged posts after a pull (`tagPosts`, caption-only, a fraction of a cent).
- **The pull**: on Follow / edit at once; then `socialTick` (hourly cron after calendarTick) pulls up to 4 follows whose
  `pulled_at` is 20+ hours old, only for brands with Social on, `subCanAfford(60)` each.
- **Make ours = the ideas bot** (ideas.js `ideaFromLocus` / `ideaState` / `ideaRetry` / `pushIdea`): the bot posts the ask
  in the brand's INTERNAL channel as the thread root, the ask is stored as `idea_thread.seed_json` and read as the first
  human message on every run (parseThread never reads the bot's own messages), the queue job writes the usual draft card
  in Slack, and Locus shows the same draft and sends it with the same push functions (Slack card redrawn). Lucky's
  creator destination is its own creator app (`pushLucky`). A destination the draft has no version for runs a `make`
  job first with `then_push`, and the push happens when it finishes. A new thread starts `queued` (never `working`,
  which runIdeaJob skips as busy). Make ours and push are the team's (403 for a client).
- **The ideas bot was broken from 2026-10-18 23:27**: every draft failed with "The compiled grammar is too large" (the
  API now refuses IDEA_SCHEMA as a strict output format). `claudeShaped` retries the same call with the shape written
  into the prompt instead; verified live 2026-10-19 (a $0.19 Opus draft). Any other error is thrown as before.
- **Client rules** (brandguard, both copies): GET /api/social, /brands, /idea; PUT /brand; follow / unfollow / save /
  video for their own brand's rows. `test-clients.mjs` 27/27, `test-ideas.mjs` 49/50 (the one failure, the router
  check, fails the same on the commit before this work).
- **Phase 2 is BUILT (2026-10-19, `src/socialpost.js`): the Week and direct posting.** Screens in profit/CLAUDE.md.
  Tests: `node test-socialpost.mjs` (7) and the Social check in `test-clients.mjs`. NOT verified live: every real
  publish, both OAuth callbacks, the Images JPEG transform, TikTok's domain check for photo posts.
  - **Tables** (`ensureSocialPost`, also in schema.sql): `social_account` (one row per brand + platform, `token_json`
    NEVER leaves the worker; `mode` live | draft | notify; `status` ok | error), `social_post_out` (the post: `at` UTC,
    `status` draft | scheduled | posting | posted | partly | handoff | failed, `media_json` [{ref, src, kind, title,
    thumb, url, key, staged, public}], `targets_json` {ig, fb, tt, yt: {on, caption, first_comment, title, privacy,
    visibility}}, `results_json` per platform {id, url, posted_at, handoff, by_hand, error, views, likes, comments}),
    `social_caption`, `social_media` (uploads at R2 `social/u/<key>`, and tagged-in posts), `social_oauth_state`.
  - **Connections** (team only): Meta = pick a Page from `/api/social/accounts/meta-pages` (the Mobius Tools token's
    `me/accounts`, each with its Instagram business account); the Page token is stored for Facebook, Instagram uses
    META_TOKEN. `missing` names the scopes the token lacks (`instagram_content_publish`, `pages_manage_posts`). TikTok
    = Login Kit OAuth (`POST /api/social/connect/tiktok` -> the URL; public `GET /social/tiktok/callback`; secrets
    `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`, a Content Posting app, NOT the ads app). YouTube = Google OAuth
    (`/api/social/connect/youtube`, public `GET /social/google/callback`, `GOOGLE_CLIENT_ID` + new secret
    `GOOGLE_CLIENT_SECRET`, scopes youtube.upload + youtube.readonly, refresh token kept). Mode per account
    (`PUT /api/social/accounts/mode`): TikTok and YouTube start as `draft` (inbox draft / private) until the app
    reviews pass; `notify` hands every post to a person.
  - **The scheduler**: cron `*/5 * * * *` (wrangler.toml) runs `socialPostTick` alone; the hourly tick runs it too plus
    `socialResultsTick`. A due row is CLAIMED by a conditional UPDATE (scheduled -> posting) so two ticks never post
    twice; a row in `posting` for 30+ minutes is marked failed with a plain reason and never retried on its own
    (it may be half out). `publishPost` stages every file once into R2 (pictures to JPEG through IMAGES, served public
    at `/social-m/u/<key>` because every platform pulls from a URL), then per platform: Instagram container +
    `media_publish` (REELS for a video, CAROUSEL for several), first comment; Facebook `/photos`, `/videos` or
    `/feed` with attached media; TikTok FILE_UPLOAD chunks to the inbox (draft) or direct post (live), photo posts
    PULL_FROM_URL; YouTube resumable upload, private unless live. A platform that is not connected, set to notify,
    needs a video it does not have, or REFUSES THE LOGIN (the account is flagged `error`) is handed to a person:
    `notifyHandoff` DMs the poster (users.lookupByEmail), else the brand's internal channel, with the file links,
    the caption and a "Posted it" button (`soc_done`, routed by slack-router's `IDEA_ID`), which `markByHand` records.
    Post now runs `publishPost` in `waitUntil`.
  - **Results**: `socialResultsTick` pulls views / likes / comments once a day per post for 30 days (IG insights,
    Page insights, YouTube statistics, TikTok video/query) and, once a day per brand, the posts others tagged the
    brand's Instagram in (`/{ig}/tags`) into `social_media` source `tagged` (phase 2.5).
  - **The tray** (`trayOf`): Studio approved finals (PROFIT `/api/studio`), creator link clips (`/api/amb`), the top 12
    Meta ads by 30-day spend, Make ours drafts (`idea_thread`), uploads and tagged posts; `used` = its ref is on a post.
  - **Calendar**: `calendarPosts` rides on `/api/calendar` as `social` (brand-local day). Rephrase = Haiku 5.5 with
    the brand's voice guide, three options.
  - **Client rules** (both brandguard copies): week, tray, upload, post (own rows), captions, rephrase (capped);
    never accounts, connect, mode or the Pages list.
  - **What Cole does** (nothing posts for real until then): regenerate the Mobius Tools system-user token with
    `instagram_content_publish` + `pages_manage_posts` and make sure Lucky's Page is assigned to it; make the TikTok
    Content Posting app (Login Kit + Content Posting API, redirect `/social/tiktok/callback`) and set the two
    secrets; add `/social/google/callback` as a redirect on the Locus Google OAuth client, enable the YouTube Data
    API, set `GOOGLE_CLIENT_SECRET`; then Brand settings > Social > Connect a Page, Sign in to TikTok, Sign in to
    Google. Record the Week screen posting for the TikTok audit and the Google verification.
- **Second pass (2026-10-19, same day):** `/api/calls/screen?kind=monday` brands carry `posts` (every Slack post in the
  plan thread, as written: by, at, text), `making` (Production cards in Brief / Making / Review, `parked` ones left
  out), and `read.channels` (every channel row of the report). `winnersLosers` = best 3 and worst 3 by Triple Whale ROAS
  among the report's ads over the floor, never the same ad twice, plus `bar` (those ads together) and `pool`. The plan
  split no longer seeds a "read" (the posts are shown instead); batches come only from Ahsan's, Noma's or Cole's posts
  (hash prefix `v4:`). meetings.js `mondayScreen` reads every brand at once.
- **Phase 2 (not built):** the Week (hour grid, ready tray, composer) and posting direct. For Lucky (Cole's own assets,
  Cole is admin of the Mobius Tools Meta app) Instagram and Facebook posting need NO app review: Standard Access covers
  accounts whose people have a role on the app; the system-user token needs `instagram_content_publish` and
  `pages_manage_posts` added (Cole, Business settings). TikTok Content Posting (developers.tiktok.com, a different
  product from the ads app) and YouTube upload (Google verification) both need a screen recording of the working
  posting screen, so they are filed once phase 2's screen exists; until approved TikTok posts land as drafts / private,
  YouTube uploads as private.

## 2026-10-19: CLIENT CHANNELS, ONE SENDER, ONE POST A DAY (`src/clientpost.js`). The reporting audit, phase 1. Read before posting anything to a client.

Audit and the approved shapes: `docs/locus-reporting-audit.html` (https://claude.ai/artifact/NnXTs45GGJpURc7zmKtSEB). Cole: client posts were stacked and
text heavy, from three senders (his token, a bot renamed Mobius Digital, the Locus bot), the weekly went out at 6am with an empty "This week" because the
Monday call is at 8am. Tests: `node test-clientpost.mjs` (12 offline checks).
- **Only Cole's user token posts to a client channel (`brief_channel`), and only two shapes.** `clientpost.js` draws both from stored numbers:
  `dailyPost` = `*Brand · Saturday, Oct 17*` / `Sales $719 · Ads $489 · 1.47x   under plan` (one verdict word: on plan, under plan, best day this month;
  no bracketed percentages) / the brief's headline (`headlineOf`, the bold line in the opener paragraph) / `October: $19.6K of $30.6K planned, 17 days in.` /
  `*Next:* ...` ONLY when a person wrote one (phase 1: the buyer's note box, `briefNote:<act>`, kept 2 days; the model never fills it). No "Hey Team" opener.
  `sendBrief` posts it (`clientDailyFor`) and the full brief as ONE thread reply (`briefThreadText`). **One day per post**: a brief covering missed days posts
  one six-line message per missed day first (oldest first, marked sent), and a day more than two days old is not posted at all. `shortBriefText`,
  `brandHasClientLogin` and the `briefClientStyle` switch are gone from the send path (the Locus setting is dead; its card can go in a later pass).
- **The weekly and monthly** (`sendReport` -> `clientReportText` -> `weeklyPost`): `*Brand · week of Oct 12*` / four numbers with ONE comparison each vs the
  prior period (`▲7%` `▼15%` `flat`, MER as `(was 1.46x)`, Profit left out when CM is unknown) / one sentence (`sentenceOf` = the first sentence of the
  summary's What it means, else `reportSentence`, one small model call) / `*This week*` = `reports.data_json.this_week` (the Monday call's confirm) merged
  with the calendar's confirmed dates in the next 14 days (calendar.js `clientCalendarFor`, the same `clientBits` the preview route reads) / `*From you:*` =
  `need_from_you` + the calendar's asks + open `p_request` asks / `<link|Open the report>`. Nothing else. The draft card (`reportCard`) shows this exact text.
- **When the weekly sends:** on the Monday call's confirm (meetings.js `confirm`, step 2: `d.sendReport` for a brand with `review_first` OFF; a review-first
  brand gets its card redrawn so Send carries the new text, and a person presses it), else `reportFallbackPass` at 11am Central sends a review-first-OFF
  brand's draft as it stands (no This week block). `reportsPass` at 6am DRAFTS ONLY now, whatever `review_first` says: the old auto-send is gone, so the
  code matches "nothing reaches a client automatically". Every brand has review_first on today, so in practice a person presses Send after the call.
- **Bot posts into client channels, removed:** calendar.js `calendarClient` branch deleted (the Monday "This week and next" and "we need from you" ride in
  the weekly's This week / From you); `POST /api/share/slack` refuses `to: 'client'` and GET answers `client: null`; the connect-link "Copy message" was
  already copy-only (profit index.html; nothing posts it). **"Grunk Dolfer Inventory Alerts" is NOT this codebase**: Supply / the Restock engine only know
  Lucky (`STORES`, D1 `brands`, KV `settings.stores`), and no file here says "Don't Advertise". It is a separate Slack app; its channel is changed in that
  app, not here.
- **The one-channel guard everywhere** (`oneChannel` / `internalChannel`: `slack_channel === brief_channel` means the brand has no internal channel):
  `deliveryPass` (falls to the agency `slackChannel`), actions.js `actionTick` (falls to the owner's DM), minoff.js (skipped), askschedule
  `allowedChannels` (left out), alerts.js `channelOf` (falls to the Strategist channel), calendar.js `calendarTick` (skipped), asana-brand.js
  `mondayCalls` (no channel). `meetingDeps().listBrands` now carries `brief_channel` and `review_first`.
- **Preview** (admin): `GET /api/client-post/preview?act=<brand>[&post=1]` = the daily from the brand's latest brief and the weekly from its latest weekly
  report, as text; `post=1` posts ONE preview message to `strategistChannel`, never to a client.
- **Second pass the same day (Cole: "structured, bulleted, clear on what everything is").** Both posts are now labelled bullets.
  Daily: title, the headline in italics, `*Yesterday*` (Sales with "(plan $X, under plan)", Ad spend, MER, aMER (new customers)),
  `*October so far* (15 of 31 days)` (Sales of plan to date, Ad spend, MER), Next only when written, "_Full update in the thread._".
  Weekly: `*Brand · Weekly report, Oct 12 to 18*`, the sentence in italics, `*The week* (compared with the week before)` with
  Sales / Ad spend "(up 7%)" in words, MER / aMER / Profit "(was ...)", then This week, `*We need from you*` (3 at most, clipped
  at 120 characters), "Open the full report". The preview route posts the daily and the weekly as two messages with permalinks.
- **Third pass the same night (Cole: "it shouldn't sound like AI"; the loop on one page: docs/client-reporting-how-it-works.html).
  NO MODEL WRITES A LINE A CLIENT READS.** The daily's AI headline is gone (title `*Brand · Daily update*`, then `*Yesterday, Thursday
  Oct 15*`); the thread reply is `dailyThread` (numbers only: orders, new vs returning, every ad channel that spent with the sales Triple
  Whale tracked to it, the rate withheld under two orders, contribution margin only when judgeCogs trusts the costs, one line of
  definitions), never the brief's narrative (`briefThreadText` deleted). The weekly's sentence is `weekSentence` (nine fixed shapes
  from sales and spend vs the period before; `sentenceOf` / `reportSentence` deleted), "Profit" is "Contribution margin" with
  `CM_WORDS` under it, This week takes calendar dates in the next 7 days (`clientCalendarFor(..., {days: 6})`), and a Requests ask
  reads "(asked Oct 13, needed by Oct 22)" from `created_at` and the body's "Needed by". The only non-number words a client gets are
  typed: Next (the buyer's note), This week (callscreen.js `clientLines` tidies the call's typed batches into client words; a
  "for the client" box would remove even that), the asks. The preview route posts the daily's thread too. test-clientpost.mjs 13.
- **2026-10-20: THE DRAFT CARD SHOWS THE CLIENT TEXT.** Cole saw the morning's six cards in #daily-briefs as "long messages":
  `briefCard` still drew the stored AI brief (row.text), which a client never receives any more. Now `slackSyncBrief` (and the fresh
  post in `draftBrief`) builds `clientPreviewFor` = `clientDailyFor` + `clientDailyThreadFor` from one `briefData` read (no model)
  and the card body is that daily with "_In the thread under it:_" and the thread, header "what the client gets, word for word".
  "Edit the wording" and "Rewrite with AI" are gone from a client brand's card (they edit text nobody reads); "Open in Locus" reads
  "Write the Next line in Locus". An internal-only brand (no brief_channel, e.g. Lucky) keeps the AI brief and both buttons: the
  team is its reader. `clientCardsOnce` (keyed `clientCardsUpgrade`) redrew the live draft cards of the last two days on the first
  hourly tick after deploy. Still open: `makeBrief` still pays for a narrative nobody sends for review-first client brands; the
  Locus Brief page still shows it (as history) with the client daily above it.
  ALSO THAT MORNING: a deploy from a branch without this audit (PR #29's) rolled the live worker back to the pre-audit code for
  about twenty minutes (10:34Z to 10:52Z); nothing was sent in that window. Deploy from main or a branch that has main merged.


## 2026-10-20: THE TASKS AUDIT (actions.js, meetings.js, morningcard.js, todaypost.js). Read before writing a p_action row.

- **`p_action.detail`** (guarded ALTER in `ensureActions`; added on prod by hand 2026-10-20). `splitTitle(raw, detail)`
  (exported, `TITLE_MAX` 90) is the ONE door: a title over 90 chars is cut at the first sentence end, open bracket,
  colon, semicolon or clause joiner past 18 chars, the rest goes to the detail, one outer bracket pair stripped.
  `addAction` and `editAction` run it; `parseQuick` asks Haiku for `text` (verb first, at most 8 words) + `detail`
  and runs it again; callscreen.js's typed jobs carry it. `openItems` and `/api/actions` items carry `detail`.
  The 24 open rows on 2026-10-20 (20 were Cole's "BFCM ads: ..." plan rows) were split with the same function.
- **Extraction (meetings.js)**: the prompt wants ONLY commitments (not "we should", "look into", "review"), 0 to 3
  per brand on a Monday call, 2 to 5 on a client call, 6 max per brand (sliced), `text` as a short verb-first title,
  `detail`, and `sure` (false when the person or the thing was not said out loud; the Meetings page starts those
  unticked). Before: the Oct 19 Team Meeting produced 28 items and was skipped whole; 7 of 10 calls since Oct 13 skipped.
- **The Slack note after confirm** is ONE short reply under the morning card: `*From the "<title>" call* (<date>):
  3 tasks, 1 brief, 2 asks for the client (<@tag> 2, <@tag> 1).` plus up to 3 decision bullets and "_and N more
  decided, in Locus_". Tasks are not repeated (they are in Locus and on the morning card).
- **The morning card** (`MAX_LINES` 3 + the ad-calls line): "Today's ad calls: ..." (todaypost.js head too), task
  lines = the title + " · N days late" only when late, owes clipped to 60; a DONE line leaves the card and the
  footer says "✓ N done" (", all of it"); "Make the ad calls" shows only while the calls line is open. The thread's
  reminder reply (`reminderMessage`) is the head line + Done buttons (4) + Open in Locus, no repeated task lines.
- Tests: test-actions 11, test-morningcard 14, test-today 3, test-callscreen 14, test-clients 28. Deployed 2026-10-20.

## 2026-10-20 (later): social.js changes for the Locus Social rebuild (see profit/CLAUDE.md, same date)
- Breaking out floor is server side: `MIN_N` 8 posts per group and `MIN_BASE` 1000 views (`MIN_BASE_LIKES` 100) before a
  post gets `base` (its "usually"); below that `base` is null and the UI draws no ratio. `pub` adds `n` and `tag`.
- `social_post.tag` (guarded ALTER): `/api/social/save {id, saved, tag?}` keeps the tag when `tag` is omitted on a save,
  clears it on unsave, trims to 40 chars; `feed` returns `tags` from `tagsOf(rows)` (distinct tags with counts).
- **Transcripts (2026-10-20):** `social_post.transcript` (guarded ALTER). `POST /api/social/transcript {id}` = `transcriptOf`:
  cached text when set, else ONE ScrapeCreators call per platform (TikTok `/v1/tiktok/video/transcript` returns WebVTT, flattened
  by `vttText`; YouTube `/v1/youtube/video/transcript` has `transcript_only_text`; Instagram `/v2/instagram/media/transcript`
  returns `transcripts[{text}]`, text null and 0 credits when the reel has no speech; the v1 Instagram paths 404), clipped to
  6000 chars and stored even when empty so a silent post never costs twice. Photo and carousel posts answer `why` without a call.
  `/api/social/make` takes `mode: 'recreate'` (a RECREATE IT steer line in the note: same structure, change only product,
  setting and words) and appends the stored transcript as "What they say in it" when one exists. Deployed 2026-10-20.

## 2026-10-20 (evening): Social reads Instagram through Meta, pauses the scraper, and feeds the morning card

- **Instagram is FREE through Meta Business Discovery** (`igIdOf`, `igDiscover`, `igMetaItem` in social.js): the Mobius
  Tools token reads any business or creator account's last 50 posts (`business_discovery.username(handle){media.limit(50)
  {... media_url, thumbnail_url, children{...}}}`) with id, caption, likes, comments, views, type, product type, slides and
  the video link. `pullBrand` tries Meta first and falls back to ScrapeCreators only when Meta failed (`meter.ig_meta_err`
  is prefixed to the follow's error as "Instagram (Meta): ..."); `lookUp` tries Meta first too. A handle that is not a
  business or creator account answers "Invalid user id" (Bad Birdie is @badbirdiegolf). New columns `slides_src` (JSON)
  and `video_src` ride in from Meta so `slidesOf` and `videoOf` need no scraper call for Instagram. Proven 2026-10-20:
  Takomo, Vice Golf, Bad Birdie 50 posts each, zero credits.
- **The scraper PAUSES, never stops the pull**: `sc()` throws at once when `meter.paused`; `socialTick` sets `paused` from
  `!DOWNLOADER_KEY || credits < LOW_CREDITS` and still runs every due follow, so Instagram and YouTube keep coming while
  TikTok and topic searches wait. `GET /api/social` returns `paused`, `ig_meta` (META_TOKEN set), `yt_key` (YT_API_KEY set)
  for the UI's source line. ScrapeCreators was at 0 credits on 2026-10-20 (the cached 58 was stale); YouTube falls back to
  the scraper until Cole creates the Data API key in Google Cloud (the API is enabled on mobius-tools-506114; creating a
  credential was blocked for the agent).
- **feed()** adds per-follow stats (`followStats`: posts30, per_week, usual + usual_kind, best {id, ratio}, last_at) and
  `suggest` (`suggestFrom`: accounts behind topic posts that no brand follow carries, by posts then views, top 12). `pub`
  adds `seen` (first_seen as ISO) and `note`. `social_post.note` (guarded ALTER): `/api/social/save` takes `note`
  (omitted = unchanged, '' = cleared, 600 chars). `breakoutsFor(env, act, sinceIso)` = breaking-out posts first seen after
  a time, for morningcard.js (one line, kind `social`, the card keeps `social_at`). socialpost.js: `GET /api/social/grid
  ?act=` = the Instagram account and the last 30 posts through Locus that target Instagram (Week > Preview). routes.js
  rebuilt (transcript, slides and grid carry their comments).

## 2026-10-21: STUDIO CAROUSELS, one Meta carousel ad (`launch.js` carousel-*, metawrite `cards`, studio-ai plan)
- **metawrite `meta_create_ad` takes `cards`** (2 to 10 `{image_url, headline, description?, link?}`) instead of image_url /
  video_id = ONE carousel ad. Propose fetches every card's picture; apply uploads each to adimages and writes `link_data`
  with `child_attachments` in the order given (`name` = the card headline, a card link defaults to the ad's, each card
  carries the button), `multi_share_optimized: false` (Meta never reorders the story) and `multi_share_end_card: false`.
  The Strategist can use it too (same action).
- **launch.js** `POST /api/launch/carousel-prep | carousel-preview | carousel-create` {act, studio_batch, order?, adset, name,
  primary_text, link, cta, cards: [{studio_ad, headline, link}]}: the batch must be this brand's with `brief.format
  'carousel'`; cards = its APPROVED Studio ads in `order` (else `setup.carousel_order`, else by line), 2 to 10; pictures
  always come from the batch, headlines default to the plan's `card_title`. Name `<test> <letter> | Carousel`, same ad set
  suggestion, same checks, dry run, PAUSED. `p_launch.cards` (guarded ALTER) = the Studio ad ids in order, `studio_ad` =
  the first; `/api/launch/list` returns `cards`; a repeat into the same set is refused per batch. Team only.
- **studio-ai.js plan** reads `batch.format`: carousel = 2 to 10 lines planned as ONE story (card 1 stops the scroll, middle
  cards one beat each, the last closes), one visual system, never a variation test, plus `card_title` per card (the line
  Meta shows under it); the answer carries `format: 'carousel'`.
- Tests: `node test-launch.mjs` 23 (source refusals and order, prep, dry run writes nothing, create = 3 adimages + 1 creative +
  1 PAUSED ad with child_attachments in order and the per-card link, the cards on the list, repeat refused, cards + image
  refused). NOT tested live: a real carousel create in Meta (only the mocked Graph API), the plan prompt on a real model.

## 2026-10-21: A CAROUSEL CARD IN PRODUCTION = ONE AD (prodwork.js, launch.js batch routes, framesync.js)
- `isCarousel(brief_json)` (format `Carousel`), `cardOf(name)` (`card k of n`), `carouselCards(files)` (newest file per k
  up to the newest file's n; no such names = version order) in prodwork.js. `adsOf(files, comments, {carousel})` gives
  each ad `carousel`, `cards` in swipe order and `file_id` = its newest card. getCard, decide and decideMany pass the flag.
- **decide** on a carousel maps any card id to that newest card, so the whole carousel takes ONE call ("Approved 430-1
  carousel (3 cards).").
- **pruneFiles** leaves carousel cards out of the version rule (`brief_json NOT LIKE '%"format":"Carousel"%'`) and only
  deletes a card a newer upload of the same k replaced. **frameSync** skips a carousel card (it would move cards to the old
  versions folder).
- **Launch batch** (`batchPrep` / `batchPreview` / `batchCreate`): a carousel ad is one row (`carousel`, `cards` with
  thumb and headline: the file name's text after `card k of n`, else the ad's Headline), named `<ad> | Carousel`, missing
  `cards` (not 2 to 10) or `video`; preview and create go through `proposeWorkCarousel` (meta_create_ad `cards`, picture
  links from `fileUrl`), `launchCreate` writes `p_launch.cards` = the card file ids in order and `work_file` = the newest.
- Tests: `node test-launch.mjs` 24 (prep, dry run writes nothing, create = 3 adimages + 1 creative + 1 PAUSED ad, cards in
  order with a re-sent card in its place, repeat refused, one card refused), `node test-production2.mjs` 18 (adsOf, one
  call through any card, prune keeps the current cards). NOT live: no real carousel was made in Meta.

## 2026-10-26: ASANA MIRROR FIXES + STALE ARCHIVE + CALL REOPEN (production.js, asana-brand.js, meetings.js, launch.js, callscreen.js)
- `moveTaskTo` / `sectionFits` / `asanaColumn` (asana-brand.js) are the one way a board column reaches Asana. Review =
  Creative Studio: a card that jumps Brief to Review now moves its task to Studio (moveCard skips Asana only when the
  task is already there).
- `pushBoard` runs at the end of every `syncTasks`: an open card whose stored `asana_section` is a board section that
  disagrees with `board_stage` (only a Locus move leaves them apart) has its task moved, and the stored section follows.
  25 a run; a task two rows share is skipped. This is also the backfill (refused moves, the makeBrief `later` race,
  which now also moves the new task to the card's column itself).
- Sync never inserts a second row for an `asana_gid` already linked (a renumbered task moves its row's `num`); rows that
  already share a gid are logged and returned as `dup_gids`, never deleted.
- `archiveCard` completes the task AND moves it to Completed; `board_was` keeps the column for Archived / Put back.
- Launch to Meta batch create moves the card to Live (Asana: Analyze Results); the answer carries `card`.
- `POST /api/production/archive-stale {act?, days=30, dry?}`: open cards (brief/making/review/ready) with no update
  (row, column move, note or file) for 30 days, each through archiveCard. Run by hand, not on a timer.
- Calls: `POST /api/calls/reopen {id}` sets a finished call back to live; Finish again skips every line whose words the
  first Finish made for that brand (`madeKeys`), skips brands with nothing new, never reposts a posted client recap, and
  the Finished summary merges both runs. Tests: test-production.mjs 11, test-callscreen.mjs 20.
