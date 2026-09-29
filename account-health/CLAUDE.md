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

## Ideas bot (2026-09-29)

An idea dropped in a brand's INTERNAL channel (`accounts.slack_channel`, the `-internal`
channels; clients are never in them) becomes a draft brief when someone tags @Mobius Digital
in the thread. Code: `src/ideas.js`; tests: `node test-ideas.mjs` (39 offline checks, mocked
Slack / Gemini / ScrapeCreators / Claude / Asana / Atria, plus the router rule).

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
- **Thinking:** one `claude()` call (research.js, Opus 5) per tag. System = the framework +
  transfer rules + SPECIFICITY, then `brainBlock(brandBrain(act))` (cached). Output `IDEA_SCHEMA`:
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
  - Lucky creator app: NOT BUILT. The button says "Lucky creator app hookup is next" and marks
    the stored draft (`pushed_json.lucky_creators`). The push needs the lucky-golf-creators
    Supabase URL + service-role key and its "what to shoot" table; the creator_link draft shape
    already matches it.
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
