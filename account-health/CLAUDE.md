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

## 2026-10-08 (night): stock for the Strategist (`src/stock.js`)

- Service binding `SUPPLY` -> mobius-supply, auth = secret `SUPPLY_TOKEN` (the Supply ENGINE's own admin token; the
  engine accepts the Mobius session or that token, never this worker's ADMIN_TOKEN). Set 2026-10-08.
- View `stock` (`what` = summary | products | orders | drops): ease off / safe to scale / push to clear with ad spend
  per product (copy of profit hub.js `stockAds`: Triple Whale orders, never ad names), first_size_out, to order and on
  the way on brands we buy for, drops and keep-or-cut on brands that design. Not connected = says so. Lucky ~15KB.
- Actions `log_order`, `set_product`, `add_design` (proposals, applied through `/api/supply/*` on this worker, which
  forwards only orders, slots, collections and products/<id> POST/PUT to Supply with the token; `add_design` with
  `_count` makes N designs). PLAYBOOK has a STOCK section; THE CMO METHOD lists the `stock` knowledge topic
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
- **DMs go to the Strategist** (slack-router: `dm || locusOwns`). `handleSlackEvent` DM path: `dmGate` = Slack users.info,
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

## 2026-10-09: CLIENT LOGINS (`src/clients.js`, `src/brandguard.js`). Read before touching auth, /api/me or any route a client might reach.

- **Three roles.** owner (Cole or the admin token), team (@go-mobius-digital.com or `settings.allowedEmails`), client
  (`settings.clientUsers` = {email: {brands, name, invited_at, invited_by, last_invite, last_sign_in, last_seen,
  welcomed_at}}). Clients are NOT in allowedEmails, so `emailAllowed` and `isAdmin` are false for them everywhere.
  `googleLogin` accepts a client email too (`isClientEmail`), records `last_sign_in` and returns `role`.
  A team guest or a Mobius-domain email is never a client, whatever clientUsers says.
- **brandguard.js is the whole rule** (same file in profit/worker/src; `test-clients.mjs` checks they are identical).
  A client request passes only if its method + path is in `CLIENT_RULES` (an ALLOWLIST), its `act` (query, or JSON
  body `act` / `screen.act_id`) is one of its brands (never "all"), the brand switch the rule needs is on
  (`settings.clientAccess` {brand: {pl, strategist, changes, creators}}, all off by default), and any ad ids in
  `ads` / `ad` belong to its brands (looked up in `ads`). Then the request is remembered (`clientScope(request)`):
  `isAdmin` answers true for exactly that request, so the handler runs. The answer is filtered (`filterActs`)
  and scrubbed (`scrub`): Slack channels, report config and team names always go; costs and margins unless P&L is
  on; change logs unless Changes is on. `/api/reports` keeps sent rows only, `/api/report` 404s a draft.
  A client with no brand left gets 401. Anything not on the list is 403 before any handler runs.
- **Adding a page clients should see = add its GET route to CLIENT_RULES** (both copies) and a test. Never widen
  a rule to a prefix.
- **Calendar** (calendar.js): a client may GET its brand, POST event (its brand; editing an existing date checks the
  date's own brand), move, end, and the new `POST /api/calendar/comment {id, text}` (a "Note: ..." changelog row,
  for the team too). Never delete, restore, tick or make Asana tasks. Its changelog rows carry the client's name,
  so `calendarTick` posts them to the brand's internal channel like Lineup client edits.
- **/api/me** now returns `role` (owner | team | client) and, for a client, `client` {name, welcomed, brands
  [{id, name, access}]}; it updates `last_seen` at most hourly. The profit and ledger workers delegate to it; the
  profit worker refuses `role: 'client'` outside the allowlist (ledger only accepts its own email list).
- **Routes** (clients.js): `GET /api/clients?act=` (team; a limited teammate sees only their brands' rows),
  `GET /api/clients/draft?brands=&name=&email=` (the invite text), `POST /api/clients/invite {emails, brands,
  name, access, send, approved, subject, body}` (OWNER only; Mobius emails refused; the email goes from Cole's Gmail
  through mail.js `sendMail` only with send + approved), `POST /api/clients/remove {email, brand?}`,
  `PUT /api/clients/access {act, pl?, strategist?, changes?, creators?}` (owner), `GET/PUT /api/clients/me` (the
  client: its brands, switches, creator link; name and welcomed only).
- **The client Strategist** (`clientAsk`, OFF per brand until Cole switches it on): NOT the team engine. Haiku 4.5,
  one read-only tool `read_page` over a fixed page list pinned to the brand, fetched THROUGH the client's own
  login (so brandguard scrubs it), no SQL, no memory, no skills, no Slack, no actions; 20 questions or $0.50 per
  client per day (`settings clientAsk:<date>:<email>`). Every other /api/ask route is 403 for a client.
- **The 'dev' signing key is gone.** `hmacKey` used `SESSION_SECRET || ADMIN_TOKEN || 'dev'`; the profit worker runs
  with neither set, so ANY token signed with 'dev' passed its local verify (an admin session forgeable for any
  Mobius email). Both workers now verify nothing locally without a key; the profit worker asks this worker
  (`delegateWho`, cached a minute), which also lets brandguard see who is asking there for the first time
  (per-brand team limits were not enforced on the profit worker before this).
- **Tests:** `node test-clients.mjs` (17 checks: the real workers in node, the profit AUTH binding wired to this worker
  as in production, sign-in, other brand / "all" / writes / settings / Strategist internals / drafts / P&L / ads /
  calendar refused, the dev-key forgery refused, invites owner-only and approval-gated).


## 2026-10-09: client switches ON by default; the command center's work feed (`src/command.js`)
- brandguard `CLIENT_SWITCHES` are all true; `clientAccess` stores overrides only (see profit/CLAUDE.md, same date).
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
