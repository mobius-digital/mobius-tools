# Locus — instructions for Claude Code

**The platform is named Locus** (by Mobius Digital), chosen 2026-08-27. The
directory and URL stay `profit/` — every client report link, the Shopify app
config and its OAuth redirects point there.

**The whole internal platform.** Directory is still `profit/` and the URL is
still `/profit/` (share links, the Shopify app config and OAuth redirects all
point at it — do not rename either). **Read `PRD.md` first.**

Two questions, two kinds of number, one app: **blended store-level money** —
"is the brand making money?" — on every tab except one, and **Meta-reported
ads** — "are the Meta ads working?", matching Ads Manager — on the **Meta** tab.
They must never be mixed inside a single surface; that rule is why the Meta
screens keep their own file, their own worker and their own labels.

## Layout

```
profit/
  PRD.md            plan, decisions, phases   ← source of truth
  CLAUDE.md         this file
  index.html        the whole dashboard (vanilla JS, one file, GitHub Pages)
  worker/
    wrangler.toml   worker mobius-profit, D1 binding DB -> SHARED mobius-account-health
    schema.sql      only p_-prefixed tables (additive to the shared DB)
    src/worker.js   money model + JSON API
```

## Hard rules

- **THIS IS THE WHOLE PLATFORM (merged 2026-08-27).** Account Health's Meta
  screens are now the **Meta tab** here, in `profit/meta.js` — its own file and
  its own IIFE, because a merged single file would be ~4,400 lines and nearly
  every helper name collides (`esc`, `fmtMoney`, `S`, `api`; `fmtPct` differs
  between the two — this file's is SIGNED). meta.js calls the **account-health
  worker directly** (not through `PROXY_PATHS`) with the same session token;
  that worker still owns the Meta sync, both crons and every secret, so nothing
  moved but the screens. Sub-tabs render into `#subtabs`, which lives OUTSIDE
  `#main` because meta.js owns `#main` completely. `account-health/index.html`
  is now only a redirect — do not rebuild a dashboard there.
- **Removed in the merge; do not reinstate without new evidence:** monthly Meta
  *pacing* (page and alert) — Plan forecasts the month on blended revenue and
  total spend, and the Meta-only copy disagreed with the agreed plan; the
  **ROAS-floor alert and the 2.5 floor itself** (cleared on all six brands) —
  it was the blended MER goal applied to Meta-attributed ROAS, unreachable by
  construction, firing nightly for every brand; and the **Meta-only client
  share link** — clients get blended reporting. The intraday curve SURVIVES as
  the Meta → Today sub-tab: it is the one question Plan cannot answer.
- **Adding a client starts in Settings → Meta ad accounts**: find on Meta,
  switch on, set the Triple Whale shop (nothing blended works without it), then
  channels here and a plan on Plan. That flow used to live in the other app,
  which is why "how do I add a client" had no single answer.

- **Shared database, never a second copy.** `DB` binds the *existing*
  `mobius-account-health` D1. Read `accounts`, `tw_daily`, `daily_insights`,
  `activities`. Write only `p_*` tables — plus `accounts.goals_json.cm_pct`,
  which is the margin override the Daily Brief already reads. One source of
  truth; never introduce a second margin field.
- **REVENUE HAS ONE DEFINITION: Shopify Total Sales MINUS sales tax.** That is
  gross sales, less discounts, less returns, PLUS shipping charged to customers,
  less tax — the line CTC report as "Net Sales + Shipping". Every tab, the brief
  and the client link use it. Spend = TW `blendedAds` (Meta+Google fallback);
  MER = revenue/spend; aMER = new-customer revenue/spend. **Platform ROAS does not
  belong on this tool** — that is Account Health's job.
- **Triple Whale's field names LIE, and this cost us a 4-13% overstatement.** In
  TW's own catalog `netSales` is TITLED "Total Sales": it is Shopify's TOTAL SALES
  and already contains shipping AND tax. `totalSales` is titled "Order Revenue" —
  the same figure before returns. There is NO TW field equal to Shopify's
  `net_sales`, so never assume one. Reconciled against Shopify for Lucky Golf,
  July 2026: Shopify gross 89,725.63 − disc 16,264.62 − returns 1,405.55 =
  net_sales 72,055.46; + ship 5,287.00 + tax 624.06 = total_sales 77,966.52; TW
  `netSales` = 77,990.42 (0.03% off total_sales, 8% off net_sales). The original
  code did `netSales + totalShippingPrice`, counting shipping twice and inflating
  every revenue, CM, MER and goal. `dayEconomics` now does `totalSales - tax`, and
  derives `net_sales = sales - shipRev` so the waterfall matches Shopify's own
  structure line for line. **Never add `totalShippingPrice` to `netSales`.**
- **TRIPLE WHALE SUMMARY PERIODS ARRIVE ONE DAY EARLY (measured 2026-09-12).** A
  bare-date `period {start, end}` to `summary-page/get-data` returns the day BEFORE
  each date (bare dates read as UTC midnight, the previous evening in a US shop):
  asking for 09-12..09-12 returned the day Meta dates 09-11, to the cent. The daily
  sync inherits this harmlessly (chart x labels carry the right calendar day, so
  `tw_daily` dates are correct; it simply never lands today). The live routes want
  today, so `/api/tw-day` on the account-health worker asks for `date + 1`. NEVER
  correct the shift inside `twSummary` or the sync starts writing a partial today
  into `tw_daily`. Also: a SINGLE-DAY period returns charts keyed by HOUR (x = 0..23),
  which is the only hourly view of blended revenue and spend in the stack; that is
  what the Profit tab draws for Yesterday and Today. The Today preset is served live
  from that route, stamped as_of, with the plan pro-rated to whole days only.
- **`totalNetTaxes` must stay in `TW_KEEP`.** The sync filter is a regex over metric
  id + title; without `tax` in it the metric is dropped on the way in and revenue
  silently reverts to tax-inclusive. Tax defaults to 0 when absent, so a client that
  has not been backfilled reads slightly high rather than double-counting.
- **The new/returning split must be rebased onto the revenue line.** TW reports
  `newCustomerSales`/`rcRevenue` on a different basis from the headline, so the raw
  figures do not add up to it. Keep the measured *share* and apply it to `sales`.
- **Days where cost > revenue are usually WHOLESALE, not broken COGS.** Product
  left the building; the money arrived somewhere Shopify cannot see. `retailMargin()`
  estimates the true retail margin from clean days only — use a LOW percentile as the
  base (contamination only adds cost, so the median collapses once contamination
  passes ~50% of days, as it does for Grunk). Frame this in the UI as wholesale /
  inventory receipts, never as "your data is wrong".
- **Fulfilment: flag what is MISSING, never what is merely surprising. Cole's call,
  2026-08-24 - do NOT re-add the `mirrored` warning.** The only state this tool treats
  as a problem is `uncosted`: delivery charged to customers with NOTHING booked against
  it. That is an absence, and an absence is unambiguous - the charge is already inside
  revenue (revenue is Shopify Total Sales less tax) so it cannot be netted back out,
  which means contribution margin really is overstated by whatever delivery cost. Live,
  that is The Golf Sock alone: $7,021 charged across 2,198 orders, $0 recorded.
  There used to be a `mirrored` verdict for a cost that exactly equals the charge, on
  the reasoning that it cannot be a real rate - the delivery charge swings with
  destination and basket (Lucky ranges $2.00 to $34.67 per order, a 17x spread) while a
  rate is a rule that would not follow it to the cent for sixty days. **That evidence
  still stands, and it is still not our call to make.** The brand configures its own
  fulfilment costs in Triple Whale; when a figure comes through it is the brand's figure
  and this tool reports it rather than second-guessing the client's own setup. Dartee,
  Lucky and Party Patch therefore read `measured` like everyone else. `shippingMode()`
  still computes `charge_lo`/`charge_hi` if the question ever returns, but nothing
  renders them, and the Costs page no longer prices an "unknown" for these clients.
- **Never state an unobservable CAUSE as fact.** The fulfilment copy used to assert
  "no delivery rate is configured" - something the data cannot show. It could only show
  that cost equalled charge. Cole caught it. Where an observation carries the argument,
  report the observation; where it does not, do not report a verdict at all.
- **A flat margin override bypasses the whole cost chain, fulfilment included.**
  `dayEconomics` takes `sales * marginPct` and never looks at product, delivery,
  handling or fees, so any card describing a cost must say so when `margin_pct` is
  set — "already inside contribution margin" is untrue for Grunk.
- **A negative day needs a MATERIALITY FLOOR, or the test fires on rounding.** The
  check was `margin < 0`, and Lucky's 2026-08-11 came in at gross profit of MINUS THREE
  DOLLARS on $936 of revenue - a 0.3% miss. That one day suppressed the client's entire
  profit reporting, and the card then explained at length that it was probably wholesale
  orders paid outside Shopify. It was not. It was a day where product mix ran heavy.
  Real contamination is never marginal: a wholesale order or an inventory receipt books
  cost that is a MULTIPLE of the day's revenue. The test is now `margin < -0.05`, and
  all six clients read `good` or `override`. **Any threshold on a money figure needs a
  floor - a rule that fires at minus three dollars is not measuring anything.**
- **ONE bad day is not broken data. Scale the verdict to how many days are affected.**
  `negatives > 0` used to flip a client straight to `broken`, which suppresses every
  profit figure - so a single wholesale order or inventory receipt in sixty days hid
  Lucky's entire margin, while the card underneath cheerfully reported that the other
  56 days ran a clean 79%. Suppressing a good number because of one known, explained,
  isolated day is worse than reporting it. `broken` now needs a PATTERN
  (`negatives > max(1, n * 0.1)`), and a handful of contaminated days lands on `noisy`,
  which names the days and leaves the figures standing.
- **A negative day is VARIABLE cost beating revenue, not necessarily product cost.**
  `margin` is `gross_profit / sales`, and gross profit subtracts cogs, delivery,
  handling AND fees. The reason text asserted "more product cost than the store took
  in" every time, which for Lucky was simply false - its cogs never once exceeded
  sales. `judgeCosts` now counts `cogs_over` separately and only says "product cost"
  when product cost alone actually did it, otherwise "variable cost".
- **Cost data is gated.** `judgeCosts()` grades the trailing per-day margin;
  `broken` suppresses every profit figure. The Costs page must always diagnose
  the **real** TW data (`seriesRaw`, override ignored) — grading the override
  produces a meaningless flat line and hides whether it has been fixed.
- **Times are CENTRAL, never UTC — in the UI and when talking to Cole.** The brief
  send hour is stored as `settings.briefHour` (0-23, Central, default 9). Cloudflare
  crons are fixed at deploy time and always UTC, so the trigger runs HOURLY
  (`0 * * * *`) and the worker sends only when `centralHour()` matches. That keeps
  the time editable from Settings and pinned to the same wall-clock hour across
  daylight saving — a UTC cron drifts by an hour twice a year. `sendBrief` takes
  `skipIfSent` so an hourly trigger can never post a brand twice.
- **Weekly/Monthly Reports follow the Daily Brief's split exactly**: the tab and
  the client archive view are here, the engine is the account-health worker
  (see its CLAUDE.md), and the report routes are in `PROXY_PATHS`. Reports are
  FROZEN snapshots — drafted automatically (Monday = last Mon–Sun, 1st = last
  month), posted to the per-brand `report_channel` (INTERNAL, no fallback on
  purpose), sent to the client's `brief_channel` only by the Send button, and
  never editable after sending. `GET /api/report-view/:token` is the client's
  archive (sent reports only; internal fields stripped, including `account`
  with its act_id). `reportBodyHTML` in index.html renders BOTH the internal
  and client pages so what you review is exactly what the client opens — keep
  it that way. Per-brand config lives in `accounts.report_config_json`
  ({weekly, monthly, hide:[channel ids]}), edited from the Reports tab;
  `report_channel` is edited in Settings via `/api/client-settings`.
- **Creative cards, not rows (2026-08-29).** "Where the budget went" renders a
  card grid (`.ad-grid`/`.ad-card`) inside the Meta channel card: the creative
  large, the name, then a stat grid. **▶ plays the real ad in place** —
  `preview_iframe.php` sets NO `X-Frame-Options` and NO `frame-ancestors`
  (verified 2026-08-29 server-side) and needs no Facebook login, so it works on
  the client's link too. `wireAdCards()` scales the fixed 340×620 preview to
  whatever width the card has, keeps the thumbnail in the DOM underneath, and
  is called by BOTH report renderers after paint — listeners go on the media
  nodes, never on `#main`. Meta's preview tokens expire on a long horizon; the
  thumbnail is a baked data URI and always survives, which the copy says.
  Hook/hold/CTR appear only when the payload carries them, so old frozen
  reports render three stats instead of six. The table under the grid
  reconciles the shown ads, the combined tail and the total to 100% of
  ad-level spend — the "no silent partial" rule, now stated as arithmetic.
- **The Daily Brief lives HERE but runs THERE.** Its tab is in this tool (all its
  numbers are store-level), while the account-health worker keeps the endpoints, the
  hourly brief trigger and the TW/Anthropic/Slack secrets. `PROXY_PATHS` forwards
  /api/brief, /api/brief-preview, /api/brief-send, /api/briefs, /api/goal-suggest,
  /api/tw-sync, /api/brief-time and /api/slack-channels over the `AUTH` binding. Monthly goals are
  written locally (`PUT /api/goals`) so the month/default merge sits beside the
  margin override in the same JSON blob — and it must preserve `cm_pct`.
- **Plan is the ONLY place goals are set.** Every other page reports against them.
  The Daily Brief tab shows the plan read-only with a link across; do not re-add an
  editor there. Plan defaults to NEXT month (nobody plans a month that is already
  three-quarters gone) and offers a month picker from last month to +4.
- **Revenue = MER x spend: the user sets TWO, the third is arithmetic.** An earlier
  version let you set only ONE and derived the rest from trailing aMER, which made
  a MER you had just typed silently revert when you changed spend. Cole spotted it.
  `PL.derive` names the calculated field; the other two are inputs, and switching
  which is derived freezes the current values so nothing jumps.
- **State the window on every derived number.** The Plan page mixes them on purpose:
  revenue basis and product margin come from the last COMPLETE month, while aMER and
  returning-per-day come from the trailing 28 days (they move). `ctx.sources` carries
  `basis_month`, `margin_month` and `trailing_from`/`to`/`days`, and `basisNote()`
  spells all of it out under the plan. Cole asked "is this last month or trailing six
  months?" and nothing on screen answered him. Any future derived input must say
  where it came from.
- **Anything that names a month must read it from `ctx.sources`, never re-derive it.**
  `cmHtml` picked "most recent finished month" with its own filter while the "Based
  on" box used the server's `basis_month`, which additionally requires the month to
  be near-complete (`days >= days_in_month - 2`). A month with a Triple Whale sync
  gap was therefore skipped as a revenue basis but still used for the CM comparison,
  so the plan was measured against a month missing days - understating that month's
  CM and flattering the plan. One basis, read from one place.
- **The monthly plan splits EVENLY across the days. Do not weight it.** Revenue/days,
  spend/days, and MER therefore holds flat at exactly the ratio that was agreed.
  An earlier version shaped revenue by a trailing day-of-week curve while leaving
  spend flat, which (a) made the forecast MER swing 1.87x-2.99x by weekday, so Bonk
  doing 2.86x against a 2.50x plan was reported as a MISS, and (b) did not even
  predict better: measured across 6 clients x 2 months with the monthly level held
  equal, the weekday curve was 7.6% WORSE than an even split - it helped Bonk and
  The Golf Sock and hurt the other four. Cole called this: you set revenue, spend
  and MER, so the plan is those three divided by the days. If day-of-week shaping is
  ever revisited it must weight BOTH sides or the ratio metrics become nonsense.
- **The weekday rhythm card is DESCRIPTIVE and must never feed a forecast.** It
  answers "what did a week look like", not "what should it be" - the plan still
  splits evenly. Four Mondays a month is a tiny sample and EVERY brand shows some
  pattern by chance, so `weekdayRhythm()` computes one index per weekday per
  COMPLETE month and only calls a day consistent when every month agreed on the
  direction (`lo > 1.02` strong, `hi < 0.98` soft, else mixed). Two consistent days
  makes a brand "reliable". On the real data that means Bonk (soft Mondays, strong
  Saturdays), The Golf Sock (3 days) and Lucky qualify, while Party Patch (1) and
  Dartee (0) are told plainly they have no rhythm. The dollar projection is gated
  on `reliable` too - splitting a plan by a chance pattern is the exact failure this
  card exists to prevent, and it is meant to be shown to clients.
- **MER by weekday is NOT the revenue share restated, and it faces the same test.**
  Cole challenged whether it earned its place. It does: for Bonk, Saturday is the
  2nd-biggest revenue day (16.0% of the week, "consistently strong") but among the
  LEAST efficient at 2.53x, because Saturday spend runs 22% above average - while
  Sunday, whose revenue only "varies", returns 3.11x. Pacing budget from the revenue
  column alone would push money INTO the least efficient day. Spend varies 35-99% as
  much as revenue depending on the client, so the two columns genuinely diverge. Each
  weekday's MER is indexed against its own month's MER and only tagged when every
  month agreed, matching the revenue column's rigor.
- **A RATIO IS NOT A VERDICT ON THE DAY. Never let MER stand alone.** Cole: "just
  because a day is not as efficient as another doesn't mean it's a bad day - if the
  CM is the best then it's the best". He is right and the data agrees: for Lucky the
  most efficient day is Thursday (2.98x) while TUESDAY contributes more money ($687/day
  vs $657); for Bonk, Saturday's ratio is second-worst at 2.51x yet it produces $983 a
  day, its third-best. So the weekday card carries CM PER DAY beside MER, the tags say
  "most/least efficient" rather than best/worst, and the verdict says outright that a
  bigger day can contribute more at a weaker ratio. Any future surface comparing days
  must show the money, not just the ratio.
- **A saved plan stores the basis it was built on; say so when that basis MOVES.**
  `p_plan.basis_sales` is a snapshot. When the revenue definition was corrected on
  2026-08-23 every plan saved before then was suddenly built on a basis 1-13% too high
  - Party Patch's by 13.3% - and nothing on screen said so, so months kept being
  reported "vs plan" against numbers nobody would still agree to. `staleBasis()` on the
  Plan page compares the stored basis with what the same basis is worth today and warns
  above the growth chips when they differ by more than 2%. Past months are excluded:
  their basis was legitimately a different month. Any stored snapshot of a derived
  figure needs this treatment - the alternative is silent staleness.
- **A month IN PROGRESS must be compared against a PRO-RATED goal, everywhere.**
  The quarter card's headline pro-rated by days elapsed but its per-month rows divided
  month-to-date by the WHOLE month's target, so August read `-19%` in the table while
  the summary directly above it read `+9%` for the same month. Two contradictory
  verdicts on one card, and the visible one was the wrong one - 23 days of revenue was
  never going to reach a 31-day number. `mrow` now scales the goal by
  `days / days_in_month` for `status === 'current'`, shows the pro-rated figure under
  the target so the percentage is checkable, and grades it good / warn / bad like the
  headline instead of a binary pass-fail. Any future surface comparing an unfinished
  period to a target needs the same treatment.
- **Never label a SET with a superlative.** The MER tag fires for every weekday that
  beat this client's own average in all months looked at, and Bonk has two - so
  "most efficient" appeared twice on one table, which Cole caught. Set labels read
  "consistently above" / "consistently below"; only the verdict sentence, which sorts
  and takes one, may say "the most". Same trap applies to any future badge driven by
  a threshold rather than a rank.
- **Guard against "-0%".** `fmtSigned` on a value a hair under parity rounds to "-0%",
  which reads as a typo. Round first, then sign.
- **The retrospective decomposes the miss; it does not just report it.** Revenue is
  spend x MER, so `actual - planned` splits EXACTLY into
  `(spendGap x plannedMER) + (actualSpend x merGap)` - verified to the cent. That is
  what turns "missed by 23%" into "underspent by 35%, while the ads actually beat
  plan by 19%", which is a different conversation. `retroCard()` names whichever term
  dominates. A month with no plan shows the actuals and says so rather than inventing
  a comparison.
- **The Customers tab is unit economics, NOT cohorts, and must never claim otherwise.**
  Triple Whale exposes no cohort table, no per-customer history and no CAC, so a true
  LTV is not derivable and the page says so in its own footer. What IS derivable from
  synced metrics: CAC = spend / newCustomersOrders, first-order AOV = newCustomerSales
  / newCustomersOrders, and returning orders = totalOrders - newCustomersOrders
  (Triple Whale does not send returningCustomerOrders for these shops). The number
  that matters is PAYBACK - first-order margin over CAC - because above 1.0x the
  client can afford to bid harder and below it the business depends on repeat. All six
  currently sit above 1.0x, Party Patch thinnest at ~1.1x. Payback needs a trustworthy
  margin, so it is gated on the same cost-health check as everything else.
- **A quarter is only as planned as its months.** `/api/quarter` rolls up the three
  monthly plans rather than introducing a quarterly goal with its own agreement flow -
  one target, one sign-off, no second place for a number to drift. Months without an
  EXPLICIT `goals_json[ym]` entry are named as unplanned and excluded from the total,
  never filled from `default`. Do not add a standalone quarterly target.
- **"Repeat share" counts ORDERS, not people, and must never be called a returning-
  customer rate.** It is `returning orders / total orders`; one shopper buying three
  times counts three times. A true returning-CUSTOMER rate needs per-customer history,
  which Triple Whale does not give us. The revenue split lives beside it on Customers
  because it is the same question in money, and the two diverge when repeat buyers
  spend differently per order - the card states both and says which way.
- **A control that does nothing reads as broken: hide it.** The range picker sat
  visible on all seven tabs while only Overview, Profit and Customers read `S.days`.
  `RANGE_TABS` gates its visibility in `show()`. If a new tab starts honouring the
  range, add it there; if it does not, the picker must not appear.
- **Real cohorts come from SHOPIFY, and only for connected stores.** `p_cohorts` holds
  customers grouped by the month of their FIRST order with their all-time spend and
  orders - Triple Whale has no per-customer history and never will, which is why the
  rest of the Customers tab is monthly averages. The cohort card degrades to a plain
  "not connected yet" note; nothing else on the page depends on it. CAC is still
  Triple Whale (spend / new-customer orders), so a cohort row pairs a Shopify LTV with
  a TW CAC - neither source can produce both halves.
- **Measure repeat uplift INSIDE a cohort, never across cohorts.** Comparing a matured
  cohort's LTV with a fresh one conflates age with quality: Lucky's July 2026 cohort
  simply arrived with bigger first orders, which made the uplift read as -0% and the
  page declare that repeat buying adds nothing. `orders_per_customer - 1` on matured
  cohorts is not confounded that way - 1.22 orders means 22% of purchases came after
  the first, which is the honest read. Anything under 9 months old is excluded from
  every average, because a young cohort has not had time to come back.
- **The cohort queries are VERIFIED against a live store, not inferred. Do not
  "improve" them without re-verifying.** `FROM customers` is the only dataset where a
  row IS a customer and `month` is their FIRST order month - that is a cohort for free.
  The trap is `SINCE / UNTIL`: it filters WHICH customers by first-order date and does
  NOT window the measures. Proved by running the same query at -400d and -30d against
  Lucky Golf on 2026-08-24 - the 2026-08 cohort returned 318 customers / $49,335.9097 /
  340 orders in both - so `total_amount_spent` and `total_number_of_orders` are ALL-TIME
  per customer, which is exactly what `p_cohorts.lifetime_*` means. `repeat_customers`
  has no metric of its own; it is the same query filtered to
  `customer_number_of_orders > 1`. Smell test on real data: Lucky's July 2025 cohort
  repeats at 16.1% against 6.0% for the fresh 2026-08 one. If cohorts ever come back
  flat across ages, the SINCE semantics are the first thing to re-check.
- **`shopifyqlQuery` fails SOFT.** A bad query returns HTTP 200 with `parseErrors` set
  and `tableData: null`. Check both, or a typo reads as "no rows" - and `syncCohorts`
  additionally refuses to write when the result is empty, so a silent failure can never
  wipe a good cohort table.
- **Cohort sync is a BUTTON, not a cron.** The account is at the free-plan trigger
  limit, and each shop is two ShopifyQL round trips plus a D1 batch, so six in one
  invocation would risk the subrequest cap. Settings -> Connections has a per-client
  "Sync cohorts" button; `/api/cohort-sync?act=all` does every connected store one at a
  time.
- **`read_reports` is REQUIRED or cohorts silently do not work.** It is the scope that
  grants `shopifyqlQuery`, and the cohort data comes from ShopifyQL `FROM customers` -
  the only place Shopify exposes customers grouped by their first-order month. It is
  easy to miss because the obvious three (orders, customers, products) look sufficient.
- **`read_orders` only reaches back 60 DAYS.** Older orders need `read_all_orders`,
  which is a separate approval request in the Partner Dashboard with a written
  justification, not a checkbox. Today's cohorts avoid this because ShopifyQL
  aggregates are not subject to the window - but anything that reads raw historical
  orders (product-level profit, most likely) will need it, and the approval takes time.
- **Shopify webhooks are configured in `profit/shopify.app.toml`, not in a dashboard
  form.** Cole went looking for the form and there isn't one any more; `shopify app
  deploy` pushes the scopes and webhook subscriptions from that file. `embedded` must
  stay FALSE - the worker implements the standalone authorization-code grant, and
  marking the app embedded makes Shopify expect token exchange plus App Bridge, which
  fails in a way that does not point back here.
- **`shopify app config link` OVERWRITES the local TOML with whatever is on the
  remote app.** It is a pull, not a link. Run once against a freshly-created blank
  app and it silently reset `name` to the org name, `application_url` to
  `https://example.com`, `embedded` to true, `scopes` to `""`, `redirect_urls` to
  empty and `use_legacy_install_flow` to false - keeping only the webhook block,
  which is what makes it look like it worked. `deploy` then pushes that wreckage up.
  Only run `config link` on a fresh clone, and diff the file afterwards every time.
  `use_legacy_install_flow` must be TRUE: false enables Shopify managed installation,
  which is for embedded apps doing token exchange, not our authorization-code grant.
- **`app/uninstalled` CANNOT live in the TOML, only the three compliance webhooks
  can.** `deploy` refuses outright: "App-specific webhook subscriptions are not
  supported when use_legacy_install_flow is enabled". Anything declared with
  `topics =` is app-specific; the mandatory privacy hooks use `compliance_topics =`
  and are fine. Since the legacy flow is not optional here, the worker registers
  app/uninstalled per shop in the OAuth callback via `webhookSubscriptionCreate`
  (`registerUninstallWebhook`), which is the shop-specific alternative Shopify's own
  error names. It is best-effort and never fails the install - a merchant must not
  be told the connection failed because a webhook did not take.
- **The post-install page IS the merchant-facing UI, and review requires one.**
  "All apps in the Shopify App Store must have a user interface that merchants can
  interact with" is a stated rejection reason, and a static "Connected ✓" note is
  not one. The callback redirects to `DASHBOARD_URL?perf=<token>` — the client's own
  profit page, which already existed behind share tokens. `profitShareToken()` is the
  single mint path so a merchant and a shared link can never land on two different
  live URLs for one client. A shop that matches no account gets an honest "not set up
  yet" page rather than a dashboard that would be empty.
- **Custom distribution cannot span unrelated merchants.** It covers one store, or
  several inside ONE Plus organization. Six separate client businesses means six
  separate apps with six credential pairs — which is why this is a public app despite
  the review cost. The distribution method is permanent once chosen.
- **Settings → Connections is where clients get added.** Before it, a store connected
  only if its domain already equalled `accounts.tw_shop`, and nothing on screen said
  whether it had — an unmatched install looked like success to the merchant while its
  data went nowhere. `/api/connections` reports per-client status plus an `unmatched`
  list, and `/api/connections/map` points a stranded shop at a client. Keep
  `uninstalled` distinct from `not_connected`: only the former means data that used to
  flow has silently stopped.

- **Never pipe a secret to `wrangler secret put` from PowerShell.** It prepends a
  UTF-8 BOM, so the stored value begins with an invisible `﻿`. The Shopify client
  id went up as `%EF%BB%BF a204...` in the OAuth redirect, and the same corruption in
  the API secret would have failed every HMAC while looking correctly configured. Use
  Bash `printf '%s' 'value' | npx.cmd wrangler secret put NAME`, then verify by reading
  the value back through something that renders it - the install redirect, in this case.
- **`SHOPIFY_SCOPES` in the worker must match `profit/shopify.app.toml`.** Shopify
  compares the two at install and re-prompts on a mismatch. Updating one without the
  other is easy to miss because nothing fails until a merchant installs.
- **Trailing aMER is a YARDSTICK, never an input.** Any plan implies a rate of buying
  new customers: `(revenue - expected returning) / spend`. Compare that with the
  trailing 28-day aMER and say plainly whether the plan is achievable (<=1.05x),
  a stretch (<=1.25x) or unrealistic. Never silently force a plan to match history.
- **`goals_json.default` is inheritance, NOT a plan.** `goalsFor()` merges it under
  every month, which made unplanned future months look planned. The API returns
  `planned` (an explicit `goals_json[ym]` entry) and the UI must key status off that.
- **An inherited plan must announce itself.** `briefData` returns `goals_planned`
  (an explicit `goals_json[ym]`) and `goals_inherited_from`. When false, the Slack
  brief appends a note naming the month the numbers came from, the prompt tells
  Claude not to call them this month's goal, and the Brief tab shows a warning with
  a jump to Plan. Without this, the 1st of a month silently re-uses last month's
  target and the brief reports "vs plan" against something nobody agreed.
- **`GET /api/profit/:token` is client-facing: everything about THEIR business, none
  of our workings.** It carries the month-to-date headline numbers against the
  pro-rated plan, the full revenue-to-CM waterfall, the daily revenue-vs-spend series,
  the new/returning split, their weekday rhythm and recent months. What it must never
  carry: another account, cost-health verdicts, the margin override, wholesale
  diagnostics, or the plan's internal agreement state. Contribution margin and the
  waterfall are gated on the same trust check the internal pages use (`cm_ok`) - a
  client must never be the first person to see a number the Costs page calls broken.
  It was originally five stat cards and a month list; Cole rightly called that too
  thin for something meant to be read by the client.
- **Past months are read only** and must not show inherited defaults as if they were
  that month's plan — say "no plan was set".
- **The plan is agreed with the client, never auto-applied.** `PUT /api/plan` writes
  `accounts.goals_json` (the one field every tool reads) AND a `p_plan` row for the
  story: basis, growth chosen, required spend, expected CM, share token, agreement.
  Saving with changed numbers passes `reagree:true`, which CLEARS `agreed_at` — do not
  let a plan drift after sign-off. `GET /api/plan/:token` is unauthenticated and must
  only ever expose that one client's plan: no other account, no cost diagnostics.
- **`PL` is a global, so it MUST record which client it belongs to.** The Plan page
  seeds its working values only when they are empty, which meant switching brand in
  the top-right picker kept the previous brand's revenue/spend/MER on screen — and
  saving wrote them onto the new brand. Cole hit this saving Bonk then Dartee. The
  month chips and the all-clients row-click already cleared the values; the picker
  had no such hook and never can, so the guard is `PL.sales == null || PL.act !==
  S.act` and every reset also clears `PL.act`. Any future page-level scratch state
  keyed to a client needs the same owner field.
- **Re-render the numbers, not the page.** Growth buttons, save and the agreed
  toggle all update in place. Calling `renderPlan()` / `show()` from a handler throws
  the user back to the top of the page, which makes comparing options miserable.
- **Every tab honours the client picker.** "All clients" lists everyone; a selected
  brand shows only that brand. Settings was the last holdout - it always listed all
  six regardless. Global settings (the brief send time) stay visible but must say
  "applies to all brands" when one client is on screen, or they read as that
  client's.
- **Do not assert wholesale for a small gap.** `retailMargin()` flags any day above
  the clean-cost cutoff, but a day at 36% against a 20% baseline is a heavier product
  mix, not product leaving the building. The Costs panel scales its claim: the
  wholesale / inventory-delivery language needs `negatives > 0` or unexplained cost
  >= 5% of window revenue; below that it says plainly that this is probably just mix.
  Same reason the flat-margin suggestion now only appears when the verdict is
  broken/noisy/none - the suggestion excludes flagged days, which biases it upward,
  which is a fix when the data is broken and a trap when it is already good.
- **`marginSVG` must not draw the axis minimum when it is zero.** `lo` is clamped
  with `Math.min(0, ...)`, so an all-positive client puts the gray minimum label and
  the red zero-line label within 3px of each other at x=2 and they render on top of
  one another. Only draw the minimum when `lo < -0.005`.
- **`.info-i` must reset `letter-spacing`, `font-style` and `text-transform`** — stat
  labels are uppercase and letter-spaced, and without the reset the glyph inside the
  circle is squashed and reads as broken.
- **Name the SOURCE on every ROAS, always.** (2026-09-18: channel ROAS in briefs and reports is now TRIPLE WHALE attribution, lastPlatformClick - see account-health/CLAUDE.md. The history below is why.) Meta ROAS and Google ROAS were each
  PLATFORM-reported (Meta's API; TW's `ga_ROAS`, which is Google Ads' own figure
  passed through). Blended ROAS is Triple Whale's. MER is ours. Four numbers for one
  day that all disagree by design: Grunk 2026-08-23..29 read Meta 3.81, Google 1.70,
  TW Blended ROAS 2.96, our MER 2.50. Cole lost an afternoon to a Google guy's
  screenshot of the 2.91 Blended headline against a 0.16 Google line in a brief. The
  channel cards now print the source in bold and say outright that a platform figure
  sits below TW's Blended headline by construction.
- **TW dates: verify, never assume.** `charts.current` x is ONE-BASED day-of-year.
  After any change to the mapping or a backfill, join `tw_daily.fb_ads_spend`
  against `daily_insights.spend` on the same date — Meta's dates are authoritative
  and they must match to the cent. A silent one-day shift shipped once.
- **Triple Whale backfills are capped at 430 days and must run ONE CLIENT AT A TIME.**
  A 400-day pull is ~25-50k rows; every D1 batch is a subrequest, and all six clients
  in one invocation blows the Worker limit. Batch size is 150.
- **Never depend on the Marketing Calendar.** It is a Lucky Golf internal app, not
  a Mobius one. It was integrated and then deliberately removed; do not re-add it.
- **The forecast is CTC's revenue cake with TWO additive layers.** returning (the
  predictable base, day-of-week shaped) + new (planned spend x trailing aMER).
  `newCustomerSales + rcRevenue = totalSales` exactly, so those are the only two
  that add up. Email is an overlay, NEVER a third addend — Klaviyo revenue cuts
  across both, and only The Golf Sock has it connected at all.
- **`forecastFor()` must reuse `seriesFor()`**, so revenue means the same thing
  (Shopify total sales minus tax) as everywhere else. The first version used a bare
  netSales lookup and silently forecast on a ~7% smaller basis than it compared
  against. `suggestGoals()` in account-health was fixed for the same reason.
- **No cron.** The Cloudflare account is at the free-plan limit of 5 triggers.
  `refreshIfStale()` warms `p_cost_health` on page load instead.
- **Auth needs no new secret.** The dashboard password lives in the shared
  `settings` table, and Google SSO is delegated to the account-health worker's
  `/api/me` (`delegateSession`). Setting `SESSION_SECRET` to the same value as
  the other workers makes it verify locally instead — faster, optional.
- **Delegation MUST go through the `AUTH` service binding.** A plain `fetch()` to
  the other worker's public workers.dev URL fails silently from inside a Worker —
  that shipped once and produced a sign-in loop. `[[services]] binding = "AUTH"`
  in wrangler.toml; `env.AUTH.fetch(req)`. Verify with `GET /api/auth-check`,
  which reports `auth_binding_reachable` and `delegated_verify`.
- **Never let the gate clear `mobius_session` on a 401.** If this tool rejects a
  token HQ considers valid, the fault is this worker's; wiping the session just
  sends the user back to mint another one that fails identically. Show the error
  and offer Retry instead.
- **Two Slack channels per brand, never one.** `slack_channel` is the INTERNAL
  pace/KPI alerts channel; `brief_channel` is the CLIENT-FACING Daily Brief channel
  (falls back to slack_channel). Every brand was originally pointed at an `-internal`
  channel, so collapsing them would either hide the brief from the client or leak
  internal KPI alerts to them. Keep them separate and label which is which.
- **Never write HTML entities into tooltip/info text.** `esc()` escapes `&`, and
  `helpModal` escapes again, so `&#39;` renders literally as "&#39;". Use real
  characters (apostrophe, the word "divided by"), never entities.
- **Tab switches must never blank `#main`.** `show()` passes a `first` flag: only a
  truly empty page paints a spinner. Otherwise the previous tab stays visible under
  `#main.busy` (dimmed, non-interactive) until the new one is ready. Every renderer
  takes `first` and gates its placeholder on it.
- **Once a renderer gates its placeholder on `first`, EVERY paint must write all of
  `#main` — success, error and refetch alike.** Never `#main .card`, and never
  `insertAdjacentHTML` onto whatever is already there: on a tab switch that DOM
  belongs to the outgoing tab. Introducing `first` broke both Daily Brief renderers
  exactly this way — they kept writing their result into `#main .card`, so clicking
  the tab left the heading reading "Overview" with the brief's table grafted into the
  Overview's first card, and the tab appeared not to open at all. Build the page as
  `shell(body)` and assign it; the placeholder and the result then share one shape.
- **Async renderers hold a RUN ticket.** `show()` bumps a global `RUN`; every
  renderer that awaits takes `const run = ++RUN` at entry and drops its DOM writes
  when `run !== RUN`. Without it a slow fetch let an OLD tab paint over the one you
  had switched to (click Brief, flee to Overview, Brief's response lands 1.5s later
  and replaces the page). The bump in `show()` matters: sync renderers like Overview
  never take a ticket, so they must invalidate in-flight ones from the outside.
- **Listeners go on nodes the render replaces, never on `#main` itself.** `#main`
  survives every render, so a listener attached to it stacks one copy per visit —
  the Profit ranking grid accumulated one `show('profit')` call per prior visit.
- **A refetch must not blank the screen.** `renderPlan(true)` keeps the current DOM
  and just dims the month chips while loading; only a first render shows a spinner.
  A spinner mid-decision reads as a page reload.
- **`repaint()` skips the focused input on purpose** (so it cannot fight your typing),
  which means Enter would leave the value unformatted. The commit handler formats
  that one field itself. Any new numeric input needs the same pair.
- **A control with no visible state reads as broken.** The quick-fill chips changed
  the value silently, so Cole reported they "don't fill in" when they were working.
  Highlight the active one and keep it in sync in `repaint()`.
- **A save must refresh everything it invalidated, in place.** Cole: "everything needs
  to auto update instantly." Saving a plan changed the quarter card sitting directly
  below the button, and the goals that Overview and the Daily Brief read out of
  `S.accounts` - none of which updated until something happened to call `boot()`.
  `refreshAccounts()` re-fetches the shared snapshot WITHOUT re-rendering (a re-render
  would scroll the reader to the top, which is its own rule), and `loadQuarter()` is
  a named closure so the save handler can re-run just that card. Every mutation must
  now ask what it invalidated: plan save -> quarter + accounts; Triple Whale backfill
  -> accounts, since the underlying revenue changed; brief toggle -> accounts, so the
  Settings tab agrees. Margin and client-settings already went through boot().
- **Nothing may scroll the page on an update.** Growth chips, switching the derived
  field, month changes and every save update in place; `inPlace(fn)` preserves
  scrollY across a refetch. Calling a renderX() from a handler throws the reader to
  the top mid-decision and is the single fastest way to make the tool feel broken.
- **In-app modals only — never `alert()`/`confirm()`/`prompt()`.** Use `noteModal()`
  and `confirmModal()`. This is a standing Cole rule across every Mobius tool.
- **`.unit-in input` needs `[type=text]` in the selector to win.** `.settings
  input[type=text]` (border + 180px width) has higher specificity than a bare
  `.unit-in input`, so inside a `.settings` table the input re-grows its own border
  and overflows the pill — a box-inside-a-box. Selector must be
  `.unit-in input,.unit-in input[type=text],.unit-in input[type=number]`.
- Windows: `npx.cmd wrangler deploy` from `profit/worker/`. PowerShell 5.1 uses
  `;` not `&&`. Cloudflare throws transient 7403 — retry.

## Chrome: a SIDE RAIL, not a top bar (2026-09-08)

- **`.app` is a two-column grid: `.side` (236px rail) + `.content`.** The rail is
  `position:sticky; height:100vh` with its own overflow, so a short viewport
  scrolls the tabs instead of clipping Settings off the bottom. Under 980px it
  becomes a fixed off-canvas drawer toggled by `#navToggle`, with `#navScrim`
  behind it; `body.nav-open` is the only state.
- **The scroll-tuck is gone and must not come back.** It existed to reclaim the
  ~110px the old sticky header cost. A rail costs zero vertical space, so there
  is nothing to tuck, and a page that moves under the reader while they scroll is
  a cost with no remaining benefit.
- **Every tab selector is scoped to `button[data-t]`.** The Meta sub-tabs now sit
  INSIDE `#tabs` (nested under the Meta button, which is what makes the hierarchy
  readable without a second colour). A bare `#tabs button` would match them too
  and call `show(undefined)`.
- **`chrome(false)` / `chrome(true)`, never hand-rolled show/hide.** Six places
  used to toggle the rail, picker, sub-tabs and sign-out individually in four
  spellings, and each new share view copied whichever was nearest. `chrome()`
  also sets `body.nochrome`, which collapses the grid to one column so a
  signed-out visitor or a client on a share link never sees an empty dark rail.
- **`main` and `footer` need `width:100%` as well as `margin:0 auto`.** They are
  flex items of `.content` now, and an auto horizontal margin on a flex item
  turns off stretch and falls back to shrink-to-fit. Without it main collapses to
  the width of its widest line and sits centred. Any new full-width child of
  `.content` needs the same pair.
- **`.hd-title` and `.hd-right` live in `.topbar` and are load-bearing.** The
  share views (client report link, client profit link, post-install landing)
  write straight into both, and that row is the only chrome those readers get.
  `.hd-title:empty{display:none}` keeps it out of the way in the signed-in app.
- **The active tab is dark ink on the brand fill**, not white. White on #62BDEA
  does not pass contrast.
- **Testing note that keeps being true:** the Browser pane frequently does not
  composite, and a stalled CSS transition then reports its START value forever.
  A `transform` driven by a transition will read as `matrix(1,0,0,1,0,0)` and
  look like a broken rule. Set `style.transition='none'` before measuring, or
  measure a property nothing animates.

### Rail, second pass (2026-09-08) — after "this side bar looks like shit"

- **Only `.side-scroll` scrolls.** `.side` is `overflow:hidden` with the brand
  row, the client picker and `.side-foot` pinned (`flex:none`) and the tab list
  taking the overflow. The first version let the whole rail scroll, which pushed
  Settings AND the Sign out button off a 720px viewport. Navigation you have to
  scroll to reach is the exact failure a rail is supposed to fix.
- **Icons are not decoration, they are the aim point.** Ten bare labels made
  every selection a read. One 16px stroked `<symbol>` per tab in a sprite at the
  top of `<body>`, referenced with `<use>`. Keep the stroke weight identical
  across all ten or the column stops reading as one set.
- **ONE active language, two levels.** The brand pill (`.on`) marks the page you
  are looking at. Meta is never that: it is a section, so it takes the raised
  `.sec` treatment and the pill goes to its open sub-tab. `show()` decides this
  (`cur && tab !== 'meta'` vs `cur && tab === 'meta'`). Two pills meant neither
  read as the answer.
- **Row height is 30px and the vertical budget is real.** Ten tabs + five Meta
  sub-tabs + four captions + header + picker + footer is ~700px. It fits a 720px
  viewport with Meta closed and scrolls the middle when open, which is why the
  numbers are tight. Anything added to the rail has to come out of that budget.
- **`show()` scrolls the current tab into view** only when it is actually out of
  the scrolled area, with `block:'nearest'` so it never moves the page.
- Contrast measured, not eyeballed: active pill 8.93:1, idle label 7.5:1,
  group caption 5.04:1.

## Client-facing pages and creative formats (2026-09-08)

- **`ads.media_type` is the ONLY source of a creative's format**, and it means
  exactly what Meta reports: video / image (shown as "Static") / carousel.
  Nothing is ever read from ad names. The `format` / `format_kind` fields the
  API still returns come from the name tag and **nothing renders them** - a
  card that printed "UGC" was printing a style, not a format, and a UGC ad IS a
  video.
- **The column fills in LAZILY and that is a trap.** It is written as a side
  effect of `adThumbnails`, which resolves ten ads per page view because it also
  downloads images, so a large account sits mostly NULL and every unresolved
  card falls back to a delivery-data guess that can never produce a carousel.
  `GET /api/ads-type-backfill?act=<id|all>` on the account-health worker fixes
  an account properly: creative type is one field, so 50 ads resolve in ONE
  batched call. A failed chunk is SPLIT, never abandoned, because one deleted ad
  fails the whole batched call. Driven by the "Fetch missing formats" button in
  Settings; it is not a cron because the account is at the 5-trigger limit.
- **The client profit link takes its window from the QUERY STRING, never the
  token.** `p_profit_share` is one stable URL per client and must stay that way,
  so `?from=&to=` carries a picked range. No params means live month-to-date,
  which is what a bare token has always meant, and forwarded links keep that.
- **On a fixed window the plan comparison is WITHHELD, not pro-rated.** A plan
  is agreed per month; "last 30 days" can straddle two, and pro-rating one
  month's target across it invents a comparison nobody signed off. The heading
  names the window it actually covers rather than always saying the month.
- **Any chart on a client-facing page needs `wireSalesSpend`.** The client
  profit chart shipped drawn but inert - no crosshair, no readout - on the one
  page we hand over and cannot talk someone through. Use the shared helper so
  the client view and the report view cannot drift. The client payload carries
  money only and no ratios, so MER is derived in the formatter.

## Ambassadors: the creator link (2026-09-16)

- **What it is.** One public page per brand, `tools.go-mobius-digital.com/angles/<slug>`,
  that the brand's TRYBE creators read instead of a PDF brief. Staff edit it on the
  **Ambassadors** tab (Creators group in the rail). The PDF uploaded to TRYBE only
  explains the link, so it never goes stale. Modelled on the Lucky Golf creator app's
  "What to shoot" hub (canvas https://claude.ai/artifact/5U7YKC3LU2Hpp6eAnkmnsn).
- **Files.** `profit/amb.js` (staff UI, own closure like meta.js),
  `profit/worker/src/amb.js` (routes), `angles/` (public page: edit `app.src.js`,
  then `python angles/build.py`, which writes `app.js`, the per-brand shells and the
  root `404.html` fallback), `profit/worker/migrations/amb-001.sql` (tables, also
  appended to schema.sql). Tables: `p_amb_brand`, `p_amb_section`, `p_amb_angle`,
  `p_amb_proof`. Uploaded clips live in R2 `mobius-amb-media` (binding `MEDIA`);
  the Worker body cap means 95MB max.
- **NO MONEY ON THE PUBLIC LINK. Cole's rule.** `publicPayload()` never sends spend,
  revenue, ROAS or typed sales. Tagged Meta ads reach creators as playable proof
  labelled "Ran as a paid ad". Scores live on the staff tab only. Typed VIEWS are
  public and labelled typed.
- **Ideas-bot clips (2026-09-30).** The account-health worker binds the same `mobius-amb-media` bucket
  (`MEDIA`) and stores every reference clip the ideas bot watches (Atria mp4, Slack upload, TikTok / Instagram
  download; never YouTube) at `amb/<act_id>/idea-<id>.<ext>`, 95MB cap. Its Creator link button files them as
  `p_amb_proof` kind **`upload`** with `who = "Another brand (inspiration)"`, so they play through the normal
  `/api/angles-file/<proof id>` route; the public page (`angles/app.src.js`) shows an upload whose `who` says
  inspiration / another brand with the Inspiration label. Nothing in this worker changed for it. Deleting such an
  angle on the Ambassadors tab deletes the object like any upload; the ideas bot checks the key before reusing it.
  `.dd p` / `.overlay p` on the page are `pre-line`: do / don't / on-screen text may hold one item per line.
- **Playback on the link** goes through the account-health worker with
  `?angles=<slug>`: it authorises only Meta ads shown as proof on that brand's LIVE
  page (same rule as share tokens), and `ad-creatives` returns covers and copy only.
- **Look = the Lucky Golf hub (Cole, 2026-09-16).** Archivo, lanes per section, labelled
  single-line pill rows for sections and formats (no dropdowns, no bottom sheets), black
  primary buttons. The PDF is ONE dark page: link as a button + QR, no angle list (a list
  was tried and rejected). The season chart is thin bars like the canvas, season colour
  and a spike limit (`season.color`, `season.cap`) set on Link and brief.
- **TRYBE SHOWS THE PDF'S TEXT LAYER, NOT THE PAGE.** It extracts the words in draw
  order and formats them as the brief. `makePdf()` draws text in reading order, whole
  sentences, steps as "1. ..." on their own lines, no decorative words; verify with
  pypdf `extract_text()` after any layout change. PDF wording is per brand
  (`p_amb_brand.pdf_json`, edited on Link and brief); `briefText()` is the same copy
  as plain text for the Copy brief text button.
- **Logos (2026-09-17).** `logo_url` shows in the link header and at the top of the PDF.
  `logoData()` redraws it through a canvas as PNG (jsPDF cannot read WebP or SVG) and trims
  clear margins; the page trims the same way on load (`LOGO_TRIM`). The host must allow
  cross-origin reads (Shopify `/cdn/shop/files` does); if not, the PDF shows the name only
  and the page shows the untrimmed image. The "<brand> creator brief" text line stays under
  the logo so TRYBE still reads the name first. Logos set in `migrations/amb-logos.sql`.
- **Season chart can be drawn** (`season.mode = 'custom'`, `season.custom` = 0-100 per ISO
  week, 25 = normal). A drawn chart is titled "When to film" and never shows numbers.
- **The season chart is relative.** `seasonShape()` = last year's weekly `netSales`
  for a year (13 weeks back, 38 ahead, `now_index`), divided by the median week. Never dollars. The season card
  text is staff-written; it must not claim a sales multiple the chart does not show
  (Party Patch Oct 2025 was only ~19% above Sep; December is the real peak).
- **Icons are Lucide** (lucide-static 1.46.0 on jsDelivr, the set the Lucky app uses).
  A section stores `icon_svg` so the public page needs no icon library.
- **Clean links.** GitHub Pages has no rewrites: `angles/<slug>/index.html` shells
  (listed in `SLUGS` in build.py) give a 200 for link previews; any other slug still
  works through `404.html`. Add a brand to `SLUGS` when it goes live.
- **Staff preview of a switched-off link (2026-09-17).** `/api/angles/<slug>` with a valid
  Locus session (`Authorization`, checked by `isAdmin`) returns the full page with
  `preview: true` and `Cache-Control: private, no-store`. The page sends `pf_token` or the
  shared `mobius_session` from localStorage (same origin as Locus), shows a yellow
  "Preview" bar, and loads covers and video through the signed-in `/api/ad-creatives` and
  `/api/ad-video` routes, because the slug only authorises ads on a LIVE page. Creators
  have no session and still see "being set up". Locus labels the buttons "Preview the
  link" while the link is off. Local testing: `?api=http://127.0.0.1:8799` works on
  localhost only; the local `ADMIN_TOKEN` is not valid on account-health, so covers 401
  locally and load for real sessions.
- **Grunk Dolfer** was seeded from `migrations/seed_grunk_dolfer.py` (research and angle list
  in `docs/angles-grunk-dolfer.md`), left OFF for Cole's review. Do NOT re-run it either.
- **Dartee Golf** was seeded from `migrations/seed_dartee.py` (research and angle list in
  `docs/angles-dartee.md`), left OFF for Cole's review. It replaced a blank row made on the tab
  (slug `dartee-golf`) and kept its TRYBE link. Do NOT re-run it.
- **Party Patch** was seeded from `migrations/seed_party_patch.py` (Chris's Sept-Dec
  emails, the account's best ads, the Mobius angle framework). Do NOT re-run it: it
  replaces the brand's sections, angles and proof.
- **Local testing without Cole's sign-in:** `profit-worker-dev` in `.claude/launch.json`
  runs `wrangler dev --remote` on :8799 with a throwaway `ADMIN_TOKEN` in the
  gitignored `profit/worker/.dev.vars`; point localStorage `pf_worker` at it. It reads
  and writes the REAL shared D1. The Browser pane stops painting once scrolled; hide
  the content above instead of scrolling to screenshot lower sections.

### 2026-10-06: the creator link rebuild (read before touching angles/ or the Ambassadors tab)

- **Why.** Cole: creators get a wall of sub-sections and samey angles, the copy reads like AI, most ideas
  have no video behind them, and nobody is taught how to hold attention. Our own numbers agree: TRYBE
  creator videos were the worst ad type on Party Patch (0.13 to 0.65x), Grunk and Dartee (about $75 a
  purchase vs $35 in-house) and the BEST on Ice & Gold (3.3x). Research per brand plus a cross-category
  hooks study is in `docs/research-2026-10-06/` (one doc per brand, plus `hooks-and-rehooks.md`).
- **Schema** (`migrations/amb-003.sql`): `p_amb_angle.visual_hook` (what is physically on screen in
  the first second), `rehook` (what happens at 3 to 8 seconds to keep them), `why` (the proven shape
  it is built on), `inspo_json` ([{brand, what, url}], other brands' videos to steal the shape from);
  `p_amb_brand.guide_json` ([{title, text}], the "How to keep them watching" card). All public.
- **v12 (same day, after Cole read v11 as a creator: "all over the place"):** THREE SCREENS, one job
  each, as tabs under the top bar: **Ideas** (intro, "Pick one for me" = a random idea leaning to Hot,
  the What's working lane, lane pills, the lanes), **Watch examples** (every proof video and every
  other-brand reference in one grid, each naming its idea), **Before you film** (what it is, say it
  right, stop filming these, keep them watching, the season). An idea page reads in the order a
  creator works: idea, Watch first, How to film it as numbered steps (The first second, Say this
  first, At 3 seconds, Middle, Close), text on screen, other lines, do / don't, why. The deck card and
  the guide card on the Ideas screen are gone. **Public proof is VIDEO only** (`publicPayload` drops
  Meta ads whose `media_type` is image; staff scores still count them). Routes: `#ideas` `#watch`
  `#rules` `#a=<id>` (`&pick` marks a random pick). `visual_hook` / `rehook` are written as plain
  instructions ("Open on...", "At 3 seconds, ...") after Cole could not follow the camera-note versions.
- **v13 (same day): other brands' videos play on the page.** account-health `POST /api/atria/clip-to-angle`
  {act, angle_id, ad_id (m...), who, note} (admin; atria.js) reads the ad through the Atria MCP, downloads
  its video into R2 `amb/<act>/atria-<ad>.mp4` (95MB cap) and files it as `p_amb_proof` kind `upload` with
  `url` = the Atria link and `who` = "<brand> (inspiration)". Idempotent per angle + link. The public
  payload hides an `inspo` link once a clip with the same `url` exists, and the page shows "Watch first"
  in two groups: From <brand> (meta + uploads + posts) and Other brands doing the shape well (clips).
  The Watch examples screen does the same across every idea. Staff: the idea editor's inspiration rows
  have a **Pull the video in** button (calls account-health directly with the session token, like
  brand.js) and show "Video in" once stored. The editor itself is laid out in the page's reading order
  (The idea, How to film it 1 to 4, Watch first, Why it works) with the same labels as the page.
  Bulk import on 2026-10-06 ran through the local `ah-worker-dev` (Cloudflare 403s a Python user agent;
  send a browser one). Public proof is video only; the Open beat is hidden in the editor because step 1
  "The first second" is the same thing.
- **v17 (same day): First seconds.** Fourth tab on the link: the bank of ways to open a video,
  `p_amb_brand.hooks_json` = [{title, how, kind 'shared'|'brand', url, clip (a stored upload proof id)}],
  seeded per brand from scratchpad hook_bank.py (16 shared openers copied into every brand + 6 made for
  each brand; clips attached where a stored Atria clip matched). Shared rows are COPIES per brand on
  purpose: rewording one changes one brand. Each idea has `alt_hooks_json` ([string], 2 alternates)
  shown under step 1 as "Or open with", with a link to the tab. Editors: Link and brief ("First seconds:
  ways to open a video", one row each) and the idea editor ("Or open with", one per line). The pinned
  lane reads "Film these first" (it used to claim "What's working"). Each brand was trimmed to 20 LIVE
  ideas on 2026-10-06; the other 9 or 10 are `status='draft'` in Locus, not deleted.
- **The v11 page** (`angles/app.src.js`), top to bottom (superseded by v12 above): jump links; **Film this one** (one idea at
  a time, Hot first then sections, opens on a random one so creators do not all film the same idea,
  "Show me another" deals the next: the Lucky hub's NextVideo); **What's working right now** = the
  pinned Hot lane, every card shows up to three playable proof thumbs (`proofStrip`, covers loaded in
  one `loadCovers(proof)` call); **How to keep them watching** (the brand guide, folds after 4);
  season + about; stop filming + rules (`#rules`); then the section lanes. The format pill row is
  GONE: tapping a format chip on a card filters and shows one "Skit x" pill to clear it. The angle
  page adds "The first second" / "Keep them past 3 seconds" cards, "Why it works", and "Steal the
  shape from these" (inspo). Cards show the visual hook under the title.
- **Staff editor** (`profit/amb.js`): the four new angle fields (inspiration as brand / what / link
  rows) and the guide editor on Link and brief (title + one line per rule).
- **Seeding**: `migrations/amb_seed_lib.py` + one `seed_amb_<slug>.py` per brand builds a SPEC and
  writes SQL. It REPLACES sections and angles, keeps the brand row (slug, live, submit link, PDF),
  the pinned Hot section, and any old proof named in a new angle's `keep_from` (old angle title).
  `check()` refuses a spec with em dashes, more than 6 sections, fewer than 3 openers or shots, or an
  angle with no proof and no inspiration. `create: True` makes the brand row for a brand with no
  page (Ice & Gold). Run each SQL once; never re-run after the team edits in Locus.
- **Seeds RUN on 2026-10-06 (do NOT re-run any of them):** `seed_amb_dartee` (6 lanes, 30 ideas),
  `seed_amb_grunk_dolfer` (6 lanes, 29), `seed_amb_party_patch` (6 lanes, 29), `seed_amb_ice_and_gold`
  (6 lanes, 30, brand row created, `live = 0`, no TRYBE link yet; `ice-and-gold` is in build.py SLUGS).
  Grunk's old Masters section and Party Patch's Halloween six were folded in or dropped; the old seeds
  (`seed_party_patch.py`, `seed_grunk_dolfer.py`, `seed_dartee.py`) are history only. D1 refuses
  `BEGIN TRANSACTION`, so the lib emits no transaction; wrangler runs a `--file` as one batch.
- Atria note for the team: `creator-links/rebuild-2026-10-06.md` (Atria notes, read by its agent).

## Brand: research, angles and the creative roadmap (2026-09-24)

- **What it is.** The Brand tab (Creative group in the rail) replaces each brand's Google Sheet.
  Views: Roadmap, Angles, Research, Onboarding, Profile. Files: `profit/brand.js` (UI, own
  closure), `profit/worker/src/brand.js` (routes, `p_br_*` tables), `onboard/index.html` +
  `onboard/questions.js` (the client's public form; the question list is shared with the
  staff view, so change questions ONLY in questions.js), `account-health/worker/src/research.js`
  (the AI: research steps, duplicate check, onboarding help box, website pre-fill).
  Tables: `migrations/brand-001.sql`.
- **Nothing gets cut because a brand left it empty (Cole, 2026-09-24).** Every sheet field has a
  home. Only data Locus already has live (daily log, monthly totals, KPI snapshots) is not
  re-typed.
- **Hierarchy:** brand > product LINE (products bought for the same reason; the research unit,
  e.g. a strip brand's energy / sleep / beauty strips are three lines) > persona > angle
  (logged once) > concept > batch (ONE test: angle | concept | variation | offer; an offer is
  its own field, never an angle) > ads.
- **Ads link by the number that STARTS the ad name** (`batchNumOf`: "326-5 | Still" -> 326,
  "GD_283" -> 283; "Tiktok #25" does not match on purpose). A match only counts when that batch
  exists. Ads with no number show under "Ads with no batch number" and are tagged by hand
  (`p_br_adtag`, which wins over the name). Results are Triple Whale `lastPlatformClick`.
- **The verdict is the media buyer's call.** Locus only SUGGESTS once a batch passes the brand's
  test rules (Profile: judge after $X or N days, winner/loser ROAS; `p_br_doc` key `rules`,
  defaults from `accounts.target_cpa/target_roas`). "Needs a call" lists batches that passed
  with no verdict. A call on thin spend is allowed and flagged. Closing a test requires a
  one-line learning.
- **AI drafts, people approve.** Research writes `status='draft'`, `source='ai'`; a re-run
  replaces only the AI's own drafts. Angle ideas land as `status='proposed'`. New angles go
  through `/api/research/dedupe` (falls back to word overlap if the AI is down).
- **The browser calls the account-health worker directly** for research (NDJSON stream with a
  10s ping), because the PROXY_PATHS proxy buffers the body. A full step can take 5-15 minutes.
  Cost per run is logged in `p_br_run` (Opus 5 $5/$25 per MTok, search $10 per 1,000).
- **Onboarding link** `tools.go-mobius-digital.com/onboard/?t=<token>` (token in
  `p_br_onboard`). Public routes `GET/PUT /api/onboard/:token`, uploads to R2 `MEDIA` under
  `onboard/<act>/`. The help box is `/api/onboard-help` on account-health (token-checked). Never
  ask clients for passwords; the Access step explains how to invite us.
- **Grunk Dolfer** was imported from its sheet by `migrations/seed_brand_grunk.py` (227 batches,
  15 clustered angles, the Weekend Warrior, onboarding answers). Do NOT re-run it.
- **Viktor's research** (Party Patch, Bonk, Dartee, Grunk, then Lucky Golf with `--brand`; 2026-09-29)
  was loaded into the research tables by `migrations/viktor_import.mjs` (data in `migrations/viktor/`).
  Rows are drafts with `source 'viktor'` or ids `vk_...`, so staff approve them like AI drafts; the
  header of that script has the one-query removal SQL. It refuses to run twice per brand; do not
  re-run it blindly. Lucky is research only (its voice is the synced repo skill). The superseded
  lines Party Patch "Daily Wellness", Bonk "Course Accessories", Dartee "The glove" and "Hats" were
  deleted by `migrations/line_cleanup_20260929.sql` (nothing referenced them).
- **Local testing:** `profit-worker-dev` (:8799) + `tools-static` (:8788), localStorage
  `pf_worker=http://127.0.0.1:8799`, `pf_token=<.dev.vars ADMIN_TOKEN>`. Research locally:
  `ah-worker-dev` (:8798, `wrangler dev --remote`, same throwaway ADMIN_TOKEN in
  account-health/worker/.dev.vars); the deployed Anthropic key is available there.

### 2026-09-24 (later): ASANA IS THE ONLY PLACE ANYONE TYPES. Read this before touching the Brand tab.

- Cole rejected the in-Locus roadmap/board: Asana already runs production (Creative Brief,
  Creative Studio, Ready to Launch, Analyze Results, Completed) and strategists complained about
  entering tests in several places. **Locus is the memory and fills itself.** The Brand tab is
  now three views: **Test library** (search + angle list + test drawer), **Research**, **Brand
  info** (profile, test rules, onboarding). Do not bring back a board or a "new batch" form.
- Engine: `account-health/worker/src/asana-brand.js`. Hourly tick (`brandAsanaTick`, inside the
  hourly cron before the Meta sync) and the UI's "Sync now" both run: sync tasks (number in the
  task name, same rule as ad names) -> tag (AI files each test under an angle, reading the brief
  Google Doc via the `GOOGLE_SA_KEY` service account with domain-wide delegation, as Cole then
  Ahsan) -> results (a test in Analyze Results past the rules gets Result + Learning fields set and
  a comment with the TW numbers, @mentioning the assignee) -> close (a completed task's Result +
  Learning become the verdict).
- Four workspace custom fields, created once and added per project: Angle, Testing, Result,
  Learning (`settings.brandAsanaFields`). Brand -> project link is `p_br_doc` key `asana`
  (matched by name on Connect). `ASANA_TOKEN` is Cole's personal token, so posts show as Cole.
- **Everything written into Asana is visible to the client** (Cole: "visibility for all").
  Backlog tagging runs with `warn:false`; fields are only written on OPEN tasks, never on
  completed ones (that would only notify people about history).
- Angles are created by the AI as it files tests (`source='ai'`); people rename, retire or MERGE
  them (`/api/brand/merge`). Cole wiped the sheet-clustered angles on 2026-09-24.
- **Judging (2026-09-24, Cole):** CPA FIRST against the brand's target CPA (Brand info → Test rules),
  then CTR, hook rate, cost per add to cart and CPM against the account's own recent ads (terciles,
  never fixed benchmarks). Results are Winner / Keep running / Loser; "Moderate" and "Variation" are
  retired (Mobius framework: Angle, Concept, What We're Testing). Keep running carries a reason and
  a Check again date (7 days by default) and Locus re-posts a scorecard on that date. **No target CPA
  = no suggested calls** for that brand. `add_to_cart` per ad was added to `ad_daily` (ADS_METRICS_VERSION 4).
- **Auto-numbering:** an open task in a creative section without a number gets the next one. A brand-new
  EMPTY brief in Creative Brief gets the framework template (`BRIEF_TEMPLATE`). A brand's FIRST connect
  runs quiet: backlog tagged with `warn:false`, results posted with no @mention.
- A pinned "📌 Brand kit" task in each project's Client Resources holds what never changes per test;
  Grunk's was written 2026-09-24.

## 2026-09-25: onboarding Access rebuilt + the brand voice loop (How we write)

- **The Access step now matches the Asana template word for word** (the "Client Responsible"
  tasks and their Looms). Constants live ONCE in `onboard/questions.js`: `MOBIUS` (Business ID
  695359915477596, domain go-mobius-digital.com, cole@ + ahsan@, the Calendly link) and `LOOM`.
  Meta = Partners + our Business ID + Full control on every asset. Google = Allowed domains FIRST,
  then invite both emails as Admin. **Shopify is a collaborator request FROM us**: the client
  gives their .myshopify.com address (+ request code) and approves; never ask them to add staff.
  A `check` field can carry `steps`, `copy` ([label, value] chips), `loom`, `go` (buttons) and
  `link: 'drive'` (the brand's Drive folder, set in Brand info > At a glance, served as
  `links.drive` by `GET /api/onboard/:token`).
- **New first step "Getting started"**: invoice, agreement, Slack hello, strategy call, Drive
  content upload. It shifted every saved `step` index by one; harmless.
- **The voice loop (Lucky Golf's process, for every brand).** `onboard/voice.html?t=<onboarding
  token>` is a talk-don't-type interview (browser SpeechRecognition; keyboard dictation as the
  fallback), 12 topics, the AI follows up on thin answers, then writes sample lines in 8 formats
  that the client rates Sounds like us / Close / Not us (+ why). Finish writes "How we write" as a
  DRAFT. Engine: `account-health/worker/src/voice.js` (public routes by token, staff routes
  `/api/voice/staff/*` admin). Docs in `p_br_doc`: `voice_interview`, `voice_guide`,
  `voice_bank`, and the old `voice` card is refreshed from the guide.
- **The bank is the learning.** Client yes/no ratings and every Keep/Reject on Locus's Copy desk
  (Brand info) land in `voice_bank` with the reason; the guide rewrite and the desk both read it.
  All bank writes go through account-health (read-modify-write) so the two sides never clobber
  each other. "Download as a Claude skill" builds a SKILL.md from the guide + bank.
- Slow AI writes (samples, guide, desk) stream NDJSON with 10s pings (Cloudflare cuts a silent
  response at 100s). Local: `pf_ah` in localStorage points brand.js at a local account-health.
- **2026-09-25 (later): the Asana template has TWO client tasks, and they run themselves.**
  Cole: the onboarding link is the one place a client does setup, so "MD - Template 2026 v2"
  (gid 1218874412343799) has only "Start here: your onboarding link" and "Help us find your
  voice" under Client Responsible. `onboardAsanaTick` (asana-brand.js section 6, inside the hourly
  brand tick; `POST /api/brand-asana/onboard` runs it now) finds projects made in the last 120
  days with a "Start here" task, creates the onboarding row (a PENDING id `asana_<project gid>`,
  named after the project, until the brand's Meta account exists), writes the link into the
  task description AND a comment, reads the Drive folder from the "Google Drive" task, ticks
  "Start here" on Send, posts the voice link on Send, and ticks the voice task on Finish. When a
  Meta account with the same name appears (or the brand is connected to that project), it
  connects and `adoptPending` moves the row and docs onto the real act_id. Onboarding lookups by
  token LEFT JOIN accounts with `COALESCE(a.name, o.name)` so pending links work. Pending clients
  show on the Brand overview ("New clients, not in Locus yet"). Flags in
  `p_br_onboard.flags_json` make every post happen once. A project made from the template for any
  other purpose gets a link too: archive it (discovery skips archived projects).
- **Asana cannot edit a project template.** Make a project from it, edit, then
  `POST /api/brand-asana/save-template {project_gid, name}` (admin) and poll `/api/brand-asana/job`.
- **2026-09-25 (later still): a brand's FULL copy skill lives in Locus** (`account-health/worker/src/skill.js`,
  `p_br_doc` key `voice_skill` = instructions + every reference file). The Copy desk hands the model
  the whole skill (SKILL.md body, then each file in a `<file path>` tag, prompt-cached), plus the bank,
  so Locus writes like Claude with the skill loaded. **Lucky is SYNCED:** the Lucky repo's
  `.git/hooks/post-commit` runs `profit/scripts/sync-copy-skill.py` whenever a commit touches
  `.claude/skills/lucky-golf-copy`, posting every file to `/api/voice/skill-sync` (Bearer
  `SKILL_SYNC_TOKEN`; the local copy is `~/.config/mobius/skill-sync-token`, outside every repo). A
  synced skill is read-only in Locus, and the interview never overwrites its guide (it writes
  `voice_guide_suggested` instead). The hook is LOCAL to this machine because the Lucky skill's
  current commits live on an unpushed branch; run the script by hand after editing elsewhere.
  **Every other brand:** "Build the full skill" drafts all seven files (facts read from the website
  with web_fetch) using Lucky's matching file as the model of SHAPE only; what the data cannot answer
  becomes `gaps`, and "Ask the client these" puts them at the front of the voice interview
  (topic `gaps`, asked in order). The interview gained `specs` and `culture` topics for the facts and
  customer-language files. "Download the Claude skill" is a zip (SKILL.md + references + examples.md).
- **2026-09-25: THE SPEAKER. Copy is a person talking, not rules followed (Cole's core principle).**
  Every brand has a speaker: a first-person portrait of the ONE human the brand sounds like, built
  from the owner's own SPOKEN words (voice interview verbatim; for Lucky, Cole's 129 messages from
  the Lucky voice sessions), with verbatim "How I actually sound" samples and "Say it like me"
  scenes. Lucky's lives in the repo skill (`references/the-speaker.md`, SKILL.md opens with the
  method); other brands' in `p_br_doc` `voice_speaker` (and as a file in a built skill). The copy
  desk runs the METHOD in skill.js: become the speaker, SAY IT to one person in one moment
  ("Who's it for" field; the spoken take is shown), write down what was said, then READ IT BACK as
  the speaker, with deterministic AI tells (`TELLS`) pointing at lines that read like writing. The
  checks and bans run only at read-back, never as the way to write. The interview gained
  role-play "Say it" topics, and the client's Close/Not us box and the desk's "Say it your way"
  store PAIRS (our line + how they would say it, `said`), which the prompts weight above yes/no.

## 2026-09-26: Studio (AI makes the ad, people fix only what they want)

- **Files.** `profit/studio.js` (UI, own closure, `window.StudioTab`), `profit/worker/src/studio.js`
  (routes), `migrations/studio-001.sql` (`p_studio_ad`, `p_studio_cfg`). Images in R2 `MEDIA` under
  `studio/<act>/<id>/{full,plate,final}.png`, served publicly by the 24-hex id (`/api/studio/img/...`).
- **Cole's flow, do not "improve" it into something else.** The image model (OpenAI GPT Image, newest
  id discovered from `/v1/models`) draws the WHOLE ad, words included, in a type style picked per
  creative (not one brand font), 4:5 with everything inside the 1:1 square. Review = Approve / Edit /
  Redo / Delete. ONLY the first Edit spends: the model erases the words (the plate, `input_fidelity:
  high`) while a vision model reads each line's box, colour and closest font from `FONTS`; the browser
  tightens each box against the full-vs-plate pixel difference (`tighten`, grows a row band and stops
  at the first empty row so neighbouring lines never merge). From then on moving, retyping, deleting,
  restyling and adding text are free. Title art (stylised lettering) stays in the picture; `/art`
  redraws only that. Save exports 1080x1350 from the plate + boxes (`renderPng`) as `final.png`.
- **Positions are % of the 4:5 frame** (cx, cy = centre; size = % of width), so stage, export and a
  reopened edit agree. Fonts must be loaded BEFORE measuring (`setup`), or sizes come out small.
- **The OpenAI key is connected from the Studio screen** (stored in `p_studio_cfg`, never returned).
  Cole pastes it himself; Claude must never handle it. `imageCall` retries without a rejected
  optional param (4:5 size, input_fidelity, quality) so a model change cannot break Make.
- **Make takes (2026-09-26, Cole):** up to 4 products (each with chosen photos, 8 photos max), up to 3
  inspiration images (uploaded to R2 `studio/ref/`, served at `/api/studio/ref/<id>.<ext>`; the prompt
  says which attached images are product vs INSPIRATION ONLY and never to copy the inspiration's
  products or words), callouts (up to 6, badges/labels, also erased on Edit), and free "Anything
  else" notes. EVERYTHING is optional except one starting point: a product or an inspiration image.
  No words at all = the copy desk writes a headline before making.
- **How Edit finds and erases the words (measured on a real ad, do not simplify):**
  1. `/api/studio/read`: the vision model names each line, font, colour and box. **It answers in
     PIXELS whatever the schema says** (a button at y 1093-1172 on a 1280-tall ad); `readText`
     converts to 0-1000. Before that fix every box sat low and the erase hit the wrong places.
  2. The browser tightens each box with Tesseract.js OCR (`locate`: whole page, both polarities,
     then a zoomed sparse-text read around anything unmatched). An OCR match overrides the AI's box
     ONLY if it covers the whole line (>=85% of the letters); half a line gave half a box.
  3. `/api/studio/lift` erases with a MASK of those holes. GPT Image still redraws the whole
     picture (the club moved, the clover vanished), so `composite()` keeps the ORIGINAL pixels
     everywhere and takes the erased version only inside the feathered holes.
- "Write for me" and "Rewrite" call the account-health copy desk (`/api/voice/staff/desk`, format
  "Ad headline") with the ad's product, look and who-it's-for.
- Not built yet (blueprint https://claude.ai/artifact/TuFSFdBySvWpQjfZ2ys4sR): weekly plan (Gate 1),
  Asana hand-off, push to Meta, templates lane, reason-on-reject learning.

### 2026-09-27: Studio v2 = BATCHES (read this; it replaces the one-idea form and the text editor)

- **Cole's model: Studio makes a BATCH from a brief, ONE AD PER NUMBERED LINE** (Mobius framework:
  Angle, Why, Concept, What We're Testing, lines). "Versions" of one idea were removed: Meta treats
  look-alikes as duplicates and they teach nothing. Redo is the backup for a bad ad.
- **Flow:** New batch (from Asana: `/api/studio/asana` lists open p_br_batch tests; the brief is
  usually a Google Doc link, opened by account-health `readDoc` / or paste a brief or a whole BFCM
  plan) -> `/api/studio-ai/brief` (account-health `studio-ai.js`) lays out batches; post copy goes
  to `brief.post_copy`, never a line; "N iterations" become N lines -> product + swipe file + per-line
  "look like this" inspiration -> `/api/studio-ai/plan` (the art director, system prompt = the
  brand's copy skill) -> Make -> review -> Send to Canva.
- **2026-09-29: the BRAND BRAIN.** Both Studio AI steps, the copy desk and the Strategist's angle
  writer now also get `account-health/worker/src/brain.js`: one cached block with everything Locus
  knows about the brand (staff rules, personas, customer quotes, market stage, past tests with TW
  results and learnings, creator link, GAPS) plus the SPECIFICITY rules (tie every line to a
  persona, quote, test or fact; the swap test). Details in account-health/CLAUDE.md "Brand brain".
- **Testing inside a concept (headlines/offer/reviews/hooks/copy) = line 1 is made, the rest are
  `/api/studio/vary` edits of it that change ONLY the words**, so it is a clean test. Concepts, looks
  and format = genuinely different ads, made two at a time from the page (keep it open).
- **Product accuracy (Cole's hard rule):** generation uses `input_fidelity: high` on the product
  photos; every ad is checked by `productCheck` (strongest gpt-5 on the key, silhouette first) and
  redone ONCE if it looks off; the card shows "Product checked" / "may be off". Measured on #412
  (Eclipse Mallet): fidelity fixed 3 of 4; the check still passed one wrong-shaped head, so it is a
  net, not a guarantee. Tell the team to tick clean studio shots of the product.
- **The art director drew descriptions as text** when it put an idea in `art` (title art). Title
  art is now max 3 words and the prompt says scene notes are never written on the ad; every label
  must fit. Callouts max 4, about 6 words.
- **The in-Studio text editor is REMOVED** (Cole: retyped text never matched the AI's lettering and
  the erase was slow). Edits = "Change with AI" (`/api/studio/change`, an instruction redraws only
  that change; old version goes to Deleted) or Canva. The lift/read routes remain but nothing calls them.
- **Canva:** Connect API with PKCE (`/api/studio/canva/setup|start|send`, public callback
  `/api/studio/canva/callback`). Cole must create a Canva developer integration once (scopes asset,
  design content, folder read/write + design meta read; redirect URL shown in the modal) and paste
  the client id + secret in Studio. Send = a folder per batch, one 1080x1350 design per ad (approved
  ones if any). Untested end to end until Cole connects it.

### 2026-09-27 (later): 4:5 guarantee, product fingerprint, house style (after Cole: "not our putter", "text outside the safe zone", "looks like AI slop")
- **1:1 safe area is GUARANTEED, not asked for.** Prompts saying "keep words out of the top/bottom tenth"
  failed on 3 of 4 ads. Every ad is now made SQUARE (1024), then the browser (`extend()`) places it in a
  1024x1280 canvas with transparent bands, `/api/studio/extend` has the model fill only the bands
  (the transparency is the mask, quality medium, ~8c), and the browser puts the original square back
  on top with a 24px feather and saves it via `/api/studio/finalize` (the square is kept as
  `square.png`; vary and change edit the square, then extend again). Compositing happens in the
  browser on purpose: the Worker is on the free plan's CPU limit.
- **Product fingerprint** (`/api/studio/dna`, stored in `p_studio_cfg` as `dna:<act>:<handle>`): the
  strongest vision model writes checkable facts from all product photos (silhouette, cut-outs, where the
  neck/shaft joins, logos and positions). Editable on the batch; it rides in every prompt, the art
  director's plan and the product check. Measured on #412: before it, none of 4 heads was the real
  Eclipse Mallet; after, 3 of 4 clearly were (cross-section included). It can still be wrong (it called
  the gold shaft black), which is why the team edits it.
- **House style:** the art director sees the brand's top 5 static ads by TW revenue (120 days, from
  `ad_creative.thumb`) and gets hard type rules (flat, crisp, no bevels/glows/3D/fake badges, real
  photography). Image prompts carry the same rules.

- **Connect Atria (2026-09-29):** a second button in the Studio top bar (`#stAtria`, next to Canva,
  visible once a brand is picked). One workspace-wide connection for the Slack ideas bot, not per
  brand. The UI calls the ACCOUNT-HEALTH worker directly (`/api/atria/status|start|disconnect`,
  admin Bearer); the OAuth client, tokens and the public callback (`/atria/callback`) all live there
  (`account-health/worker/src/atria.js`, rows `atria_*` in the shared `p_studio_cfg`). No profit
  worker change. Details in account-health/CLAUDE.md "Ideas bot", Atria bullet.
- **Canva status (2026-09-27):** app "Locus Studio" created in Cole's Canva developer account (App ID
  AAHOGFM5NCI, Public, Draft). REST API setup is BLOCKED until Cole turns on MFA on his Canva account
  (Canva's rule; Claude must not change account security settings). Then: Outside Canva -> Start
  integrating, scopes, redirect `https://mobius-profit.mobius-digital.workers.dev/api/studio/canva/callback`,
  Cole generates the secret and pastes id + secret in Studio. Until connected, "Send to Canva" downloads
  the batch and opens a blank 1080x1350 Canva design. Folder structure: Locus Studio / <Brand> /
  "<#> · <batch name>", designs "<#>-<line> · <headline>"; folder ids cached as `canva_folder:<path>`
  (Lucky + #412 were created through the Canva MCP connector and seeded into the cache).

- **Exact product (2026-09-27, clubs first):** `setup.exact` defaults on when a product's Shopify type/title
  matches `HARD` (wedge|putter|hybrid|driver|iron|club...). White-background studio photos are cut out in
  the browser (`cutoutOf`: flood fill from the edges, islands under 6% dropped) and uploaded as
  `setup.cutouts`; the art director picks `photo` (0 = AI-drawn, flagged), `place`, `size` per ad.
  Order that works: `/api/studio/make-exact` makes the scene + words with the product box EMPTY and no
  product (checked by `emptyCheck`, redone once), the browser places the real cut-out, `/api/studio/harmonize`
  adds a contact shadow in a ring (only the ring is kept), the browser locks the product pixels, then 4:5.
  Measured on #412: a single-hero-product ad is right (real clover, milling, heel/toe callouts on the face);
  concepts that ask for several objects (a cast-vs-milled comparison) still get extra clubs or labels
  hidden behind the product. Letting the model SEE the product made it draw more copies; do not go back.

- **2026-09-27 (final): Cole: "go back to full AI, just make it correct."** Exact-product mode is switched
  off and its UI removed (code kept: make-exact, harmonize, cutouts). What made full AI right on #412:
  (1) tick 5-6 clean STUDIO shots of the product as references (not the 3 lifestyle shots the picker
  defaults to), (2) the fingerprint, (3) each ad scored 0-10 by the check model, up to 3 attempts, best kept,
  score on the card ("Product 9/10 · best of 2"). Result: 4 of 4 read as the real Eclipse Mallet
  (clover at the heel, offset neck, fang cut-out, dense milling), text inside the 1:1 area.

## 2026-09-29: the ideas bot (Slack idea -> brief)
A tag of @Mobius Digital on an idea thread in a brand's -internal channel drafts a teardown plus a
creator-link angle, an Asana brief and a Studio batch; approver buttons write them into
`p_amb_*`, the brand's Asana Creative Brief section and `p_studio_batch`. It lives in
account-health (`src/ideas.js`); read account-health/CLAUDE.md "Ideas bot (2026-09-29)" before
touching the creator link, Studio batches or Asana briefs from anywhere else.

## 2026-10-02: New client (one button sets a client up everywhere)

- **Where:** Settings > **+ New client** (`profit/newclient.js`, own closure, `window.NewClient`). Engine:
  `account-health/worker/src/newclient.js`, table `p_newclient` (created on first use), routes
  `/api/new-client[/options|/run|/step|/mark|/remove]` (admin). "+ Add a brand" stays for a client whose Meta
  account Locus can already see.
- **Shape:** the form makes a row, then the SCREEN asks for one step per request (`asana`, `onboard`, `drive`,
  `slack`, `summary` on the worker; `ledger` and `prefill` from the browser, reported with `/mark`), so each
  line shows its own result and has its own Retry. A step that lacks a permission FAILS WITH THE REASON and
  the by-hand fallback. Never fake a step.
- **asana:** `instantiateProject` on "MD - Template 2026 v2", the picked team + Cole added (the client is
  invited later, by the welcome email), Website filled, the Marketing Plan task deleted, the old Onboarding
  subtasks replaced by the 5 things a person still does.
- **onboard:** runs `onboardAsanaTick` now, so the brand lives under the pending id `asana_<project>` until its
  Meta account is added. `research.js context()` accepts a pending id, so the website pre-fill works before Meta.
- **drive:** creates the client folder (Agreements + From the client, see "Drive has jobs" below) beside
  "# Client Template Folder", as Cole. Uses the `drive` delegation scope.
- **slack:** two PRIVATE channels, `<slug>` and `<slug>-internal`, only the picked team invited. Slack Connect
  invite (`conversations.inviteShared`) is attempted; on 2026-10-02 Slack answered `not_allowed_token_type`, so
  the note tells Cole to invite the client from the channel. Channel ids land on `accounts.slack_channel` /
  `brief_channel` when the pending brand is adopted (`adoptNewClient` in asana-brand.js), never over a set one.
- **email:** the welcome email is sent from Cole's Gmail ONLY from the Send button with the text on screen
  (`approved: true`). Needs the `gmail.send` delegation scope; until then Copy.
- **Team roster:** `ROSTER` in newclient.js (Asana emails; Noma and Ravo are on personal addresses), or the
  setting `newClientTeam`. Slack ids fall back to a first-name match.
- **Hourly:** `newClientTick` posts in the internal channel when the onboarding form is sent.
- **NOT built:** auto research on submit (Cole chose a button for now). Everything else from the first list was
  built later the same week (sections below).
- **Form (questions.js v3, same day):** Access is step 2 ("Access and content") and carries `content_link` +
  `content_shared` (the client shares their own library; uploading into ours is the fallback). The teammates
  list is gone (`approver` instead; they add people in Slack). New: `ad_spend`, `success_90`, `tried_failed`,
  `key_dates`. Low-value questions moved to a last optional step `extras`.
- Tested 2026-10-02 against the real services with "ZZ Locus Test": asana, onboard, slack, summary, pre-fill
  ($0.58) all ran; drive failed on the scope as designed. The email Send and the Ledger write were not exercised.

### 2026-10-02 (later): Stripe invoice-then-autopay, and the agreement signed in-app (no DocuSign)

- **Stripe** (`newclient.js`, step `stripe`, never automatic: the Send the invoice button + confirm). One
  product "Mobius Digital retainer" (`settings.stripeProduct`), a per-client monthly price via `price_data`
  (subscriptions reject `product_data`; the product must exist), subscription `collection_method send_invoice`,
  7 days, `save_default_payment_method on_subscription`; the first invoice is FINALIZED then SENT (a draft
  cannot be sent). `/stripe/webhook` (public, above the admin gate, Stripe-Signature HMAC, 5 min window) on
  `invoice.paid` flips the subscription to `charge_automatically` and posts in the internal channel; the
  endpoint is created via the API on first use, secret in `settings.stripeWebhook`. Removing a run cancels an
  UNPAID subscription and voids its invoice. Secret `STRIPE_SECRET_KEY` (sk_live): the first paste through
  PowerShell stored a lone Ctrl+V byte (code 22), so the key is cleaned to printable ASCII and `/options`
  reports `stripe_key` (masked) + `stripe_raw` {len, codes} for exactly that diagnosis. Put it with
  `(Get-Content -Raw key.txt).Trim() | npx.cmd wrangler secret put STRIPE_SECRET_KEY`. Tested live: invoice
  sent to Cole; the paid webhook flip is NOT yet exercised (Cole chose not to pay the $1; first real client
  will prove it, the screen's "Check if paid" refreshes from Stripe either way).
- **Agreement** (`account-health/worker/src/contract.js`, table `p_contract` keyed by the onboarding token,
  page `onboard/sign.html?t=`). Text = the "Mobius Digital Services Agreement - Brand" doc with blanks from
  the New client form (`contractDefaults`); Cole edits client_name / start_date / term / payment on the setup
  screen (Preview = `/api/new-client/contract-preview`), "Send for signature" (step `contract`, approved)
  freezes the HTML, stores a SHA-256 of its text, records Cole's signature (name, time, IP) and emails the
  client the link from his Gmail. Client: full name (2+ words) + consent tick -> `POST /api/sign/:token`
  (public) records name, email, time, IP, UA, re-checks the hash, emails both sides a copy, and ticks
  `st_agreement` in their form (which links to the page via `links.sign` from the profit worker's GET
  /api/onboard). Signed text can never change (send refuses on a signed row; sign refuses twice). Section 9
  (electronic signatures) was added to the doc's wording. The page prints to PDF. Drive scope
  (`auth/drive`) and `gmail.send` were added to the Mobius Tools delegation on 2026-10-02 and the Gmail API
  enabled on the Cloud project; both tested live.
- **AI contract editor (same day):** "Anything different for this client?" on the setup screen -> `POST
  /api/new-client/contract-ai {id, vars, instruction}` -> `aiEdit()` in contract.js on `claude-haiku-4-5-20251001`
  (about a cent): changes only what the instruction says, returns the whole `<article>`; stored as `vars.html`, which
  `sendContract` and the preview use as is (fields then no longer apply; "Back to the standard text" drops it).
- **Frame:** Cole's Frame is V4 (next.frame.io), so `frame.js` uses Adobe IMS OAuth (Connect Frame on the setup
  screen, `/frame/callback`). Step `frame` makes one project per client and writes Asana Client Resources > Frame.
  V4 has no collaborator route: the team is added in Frame by hand. Tested live on both first clients.
  **Layout since the 2026-10-03 cleanup: NO PODS.** One project per current client (Ad Concepts + Clips/B-Roll,
  made by the step), former clients are folders in "Past Clients", plus "MD - Internal" and "# Cole Organic".
  Admin routes in frame.js: `/api/frame/tree?depth=`, `access`, `audit`, `share`, `children`, `move`, `rename`,
  `folder`, `project`, `project-update`, `project-user`. Frame allows 10 moves a minute.
  **NEVER DELETE A FRAME PROJECT OR FOLDER THAT HELD WORK, EVEN EMPTY.** Review links belong to the project:
  deleting the emptied pods on 2026-10-03 killed ~110 live review links (Frame has no restore API; only Frame
  support can restore a project). The delete routes were removed. Ahsan and Noma are PROJECT members, not
  workspace members: the New client step puts the picked team on each new project (`project-user`).
- Setup screen also has "Remove this client" (voids an unpaid invoice, cancels its subscription, forgets the row).
- **2026-10-03 round (Cole's 11 points):** roles strategist / buyer / editor (Ravo) / designer (William), each a
  comma list (multi-select chips); the pickable team lives in `settings.newClientTeam` (Locus: "Edit the team list",
  `POST /api/new-client/team`). Step redraws only touch `#ncStepList`, so typing or voice-typing in the AI / agreement
  / email boxes is never wiped. New Biz (`C0BV9L8NV33`, #mobius-newbiz) gets name, site, start date, team as @mentions
  and the agreement type: **never money** (Cole). The internal summary no longer carries the client's private link.
  **Client welcome** is posted AS COLE (`SLACK_USER_TOKEN`), pinned, only once a member from outside our workspace is
  in the client channel (hourly `newClientTick` -> `welcomeOnJoin`; detection via `users.info` team_id / is_stranger,
  NOT yet seen live), with the onboarding, Asana, Drive and Calendly links and @mentions. `/api/new-client/unwelcome`
  retracts one. Client pages (form, sign, voice) use the Mobius blue palette and `brand/` logos (light/white).
  Default term is month to month. Frame link + the client's content link (on submit) fill Asana Client Resources.
- **Amendments:** a signed agreement shows "Amend the agreement": Haiku drafts Amendment No. n from plain words
  (`aiAmend`, asks QUESTION: when facts are missing), Preview, Send for signature (`sendAmendment`). Stored as a
  p_contract row with token `<token>a<n>` (still hex, so sign.html serves it unchanged; letterhead says the number).
  The signed original never changes. Stripe is NOT changed by an amendment: a price change must be made in Stripe.
- **Drive has jobs (Cole, 2026-10-03: "a drive in case, but with a use case"; Frame stays review-only).**
  Per client: `Agreements` (Cole + the client as viewer, NEVER the team; `saveSignedToDrive` in contract.js files
  every signed agreement and amendment there as a PDF the moment it is signed), `From the client` (client and team
  can add; the form's drop link and `profile.drive` point here). `Final ads` was dropped. Nobody but Cole is on the
  root, so never link `drive_url` to anyone else. Asana Client
  Resources > Google Drive carries both client links. `stepDrive` is idempotent and also took back the root
  share the first two clients (Ice & Gold, Yak Sports) had. Folder ids are on `steps.drive.folders`.
- Client welcome: `member_joined_channel` (needs that bot event subscribed in the Slack app) -> IDEA_Q job
  `{kind:'welcome'}` with `delaySeconds: 60` -> `welcomeOnJoinByChannel`; the hourly tick stays as backup.
  `/slack/owns` answers true for a new client's channel until its welcome is posted, so the router forwards it.
- **Your ads page (2026-10-03):** `tools.go-mobius-digital.com/yourads/?t=<the brand's report token>` (the same
  stable token as the report archive). Every ad with spend in the last ~13 months, newest first, "Running now" when
  it spent in the last 3 days, filters All / Running now / Videos / Images, tap to play or view, Download. No money.
  Account-health routes: `GET /api/your-ads/:token` (list; ad names cleaned: test numbers, format tags, creator file
  names), `/api/your-ads/:token/thumb?ad=` (cached creative image, `&dl=1` downloads), `/api/ad-video?yours=` (plays
  only that brand's ads), `GET /api/your-ads-link?act=` (admin). Locus: Meta > Creative > "Copy Your ads page link".
  The client's Slack welcome includes it once the brand's ad account is connected. Partnership (creator page) ads
  cannot give us the file: they show Meta's own preview with "ask us for the file" (Grunk: 21 of 40 videos).
  Drive: the "Final ads" folder was dropped the same day; finals live in Frame and on this page.
- **Hands-off additions (2026-10-03, later):** `autoConnectMeta` (worker.js, hourly + `POST /api/new-client/meta-now`)
  switches a pending new client's ad account on when exactly one untracked account name matches (normalised:
  "Ice and Gold New" = Ice & Gold), after a readable-insights check; sets name, both Slack channels, tw_shop from the
  form's store; posts to Cole in the internal channel (or tells him to assign the Mobius Tools system user when Meta
  refuses). Ice & Gold connected this way on 2026-10-03. `shopifyHeadsUp` (newclient.js) posts the store address +
  request code the moment the form has it (Shopify has no API for collaborator requests) and fills tw_shop.
  The form's "Pay the first invoice" and "Say hi in Slack" boxes tick themselves (`tickForm`); the internal channel
  hears when an agreement or amendment is signed (`signedPing`). The Asana checklist dropped the steps Locus does.
- **2026-10-03, evening round:** welcome email FIRST: the client's Asana invite and Drive shares wait for it
  (`stepInvite`, run by `stepEmail` after the send); the setup screen numbers Welcome 1, Invoice 2, Agreement 3.
  All client email goes through `mail.js` `sendMail` (HTML + Cole's branded signature with
  `brand/mobius-logo-email.png`; the Gmail API never adds Gmail's own signature). Gmail copy-paste page:
  `brand/signature.html`. The welcome lists every link (onboarding, Calendly, Asana, From the client, Slack).
  Signed agreements are kept in Drive as **PDF** (doc made, exported, doc deleted). Shopify heads-up is a Block Kit
  card: store + code, "Open Shopify Partners", and **"I sent the request"** (`nc_shopify_sent`) which tells the client
  to approve (in their Slack channel as Cole if they joined, else by email). Slack router forwards `nc_*` to Locus.
  Meta fallback: a never-seen ad account that matches no waiting client is put to Cole in #mobius-newbiz with
  "Yes, it is X's" buttons (`nc_meta_yes` -> `connectMetaFor`); the setup screen has a picker (`/api/new-client/
  meta-accounts`, `/connect-meta`). Yak Sports = "Hockeyak" (connected by hand 2026-10-03). Form: `auto: true` boxes
  (invoice, agreement, Slack) say they tick themselves and catch up on tab focus / every 20s; `links.invoice` = the
  Stripe page; "Message the team" -> `POST /api/onboard-message` (public by token, 30s limit) posts to the internal
  channel tagging Cole. `POST /api/new-client/meta-now` runs the whole hourly new-client pass on demand.
- **2026-10-03, last round:** the welcome email no longer mentions Drive (clients read it as "my assets go there");
  on form submit the voice interview link goes to the client in their Slack channel as Cole (or email), once
  (`steps.voice_sent`); 8 least-used offer questions moved to the optional `extras` step. **Calendly**
  (`calendly.js`): with `CALENDLY_TOKEN` set, the hourly pass makes a user-scope webhook (invitee.created /
  canceled -> `/calendly/webhook`, HMAC with a key Locus picks, `settings.calendlyHook`); only the
  `strategy-session` event type counts; a booking by a new client's contact email ticks `st_call` (now `auto`),
  writes Asana Call Link, shows on the setup screen and pings the internal channel tagging the strategist.
  Nudges: 3 days unpaid / unsigned, 5 days form not sent -> one internal message with "Send a reminder"
  (`nc_remind`: Stripe re-send, or Gmail). Self-ticking boxes are locked to the client.

### 2026-10-03 audit (independent review + fixes)

- **`steps_json` is written one key at a time (`setStep`, json_set).** The screen, the hourly pass and the Stripe /
  Calendly / Slack-join paths all write it; a whole-object write from a stale copy undid other writers' keys. Never
  go back to `patchRun(... steps_json: JSON.stringify(...))`. worker.js `connectMetaFor` does the same.
- **A failed step never wipes an earlier success.** `/step` keeps a done step done (error as a note) and keeps a
  failed step's ids. Stripe saves customer/subscription/invoice the moment the subscription exists, and a retry
  finishes THAT subscription (finalize + send a draft) instead of making a second one.
- **`markPaid` is shared by the webhook and Check if paid:** flips to charge_automatically (payment method from the
  subscription, else the invoice's payment intent), ticks the form, tells the team once; retries the flip until
  `stripe.autopay`. The webhook reads the subscription from `invoice.subscription` OR
  `invoice.parent.subscription_details.subscription` (newer API versions), else asks Stripe.
- **The Slack welcome is CLAIMED with a conditional UPDATE before posting** (join event + hourly pass could both
  post); a failed post releases the claim. Its links use the From the client folder (nobody can open the root),
  and What happens next is a FIXED template with "if you have not already" (Cole: a pinned message must never
  depend on state at the minute it posted).
- Remove asks Stripe before cancelling (a paid invoice is never cancelled; Stripe unreachable = nothing removed).
- Amendment base token = `vars.of`, never a regex on the token (hex tokens can end in a+digits). Signing checks
  `meta.changes`, so a double press sends one set of copies. Calendly ignores the cancel half of a reschedule.
- Meta auto-connect: exact normalised name first, then whole-word containment; accounts we ever synced are excluded;
  discovery runs only for clients made in the last 45 days.
- Form "Message the team": text escaped for Slack; with no internal channel it goes to Cole's DM, never
  #mobius-newbiz.
- Not changed on purpose: the Your ads page shares the report-archive token (that token only opens the client's
  own SENT reports, which they already received). The Shopify heads-up is hourly, not instant (copy says so).

### 2026-10-04: ONE PLACE FOR GOALS + the Monday test view. Read before touching targets.

- Cole: "I don't want the same KPI stuff in different places." **Goal CPA and goal ROAS live only on
  `accounts.target_cpa / target_roas`, edited only in Settings → brand → Goals** (`loadGoals` in
  index.html). The Creative browser "Goal CPA" and Brand info "Test rules" are read-only links to it
  (`openGoals(act)`). The AI Strategist may still PUT the same account column (same value, not a copy).
- The brand `rules` doc (p_br_doc '' 'rules') holds TEST settings only: `TEST_KEYS` in
  profit/worker/src/brand.js = judge_spend (0 = 3x goal), judge_days, yellow_pct (30), min_track,
  min_spend (20), min_days (7), min_cap_pct (25). Light route `GET/PUT /api/brand/rules`.
- The old doc copy of target_cpa wins until account-health `unifyGoals` (hourly cron) moves it onto
  the account and strips it; log in `settings.goalUnify`. rulesFor (profit) and rulesOf
  (asana-brand.js) must stay identical. The 1.3 yellow multiplier is now `1 + yellow_pct/100`
  everywhere (suggest, judge, Asana ✅/⚠️/❌, cpaTone).
- Test library rows show `Day N of judge_days` (from the first day of spend, same clock as judging)
  and, when min_track is on, `Min $X on` / `Min $X on, take off` read LIVE from Meta via
  account-health `POST /api/brand-asana/mins` (ad sets matched by the leading number, numOf), plus a
  per-campaign line: minimums vs min_cap_pct of the campaign budget, with the budget that would fit.
- **Monday test calls (2026-10-04, "stupid simple for the media buyer").** account-health `mondayTick`
  (hourly cron, acts Mondays 8am Central, once per brand per week, `settings.mondayCalls:<act>`)
  posts ONE Slack message to the brand's internal channel: live tests sorted Pause / Keep / Another
  week / Not ready (same `judge` as the Asana scorecards), "take the $X minimum off" on lines past
  min_days, minimum-cap warning, and one Ads Manager link selecting exactly the ad sets to change.
  Per-brand switch `rules.monday_post` in Settings → Goals, with "Preview this week's message"
  (`POST /api/brand-asana/monday`, `{post:true}` sends now). The media buyer needs nothing else.
- **Do it button (2026-10-04).** When the Meta token has MANAGE/ADVERTISE on the account (`user_tasks`),
  the Monday message carries one button (`tests_do`) that makes exactly the listed changes: pause the
  loser ad sets (or ads when no ad set matched) and set `daily_min_spend_target=0` on keeps past their
  minimum days. The plan is frozen at post time in `settings.mondayPlan:<act>:<date>`; a second press
  says who already did it. Read-only accounts get a line saying to grant "Manage campaigns" instead.
- **Two lines (2026-10-04, Cole).** Winner = cost per sale <= goal AND 2+ sales (make variations, minimum
  off). Keep = <= the account average AND 2+ sales (leave running, minimum off). Pause = above the average or
  under 2 sales once judged. Exception kept from 2026-09-24: 2+ soft metrics in the top third and CPA <= 2x
  goal = "Another week". Account average = trailing 30-day Meta spend / Triple Whale last-click orders,
  stored as rules.acct_avg_cpa + acct_avg_month by account-health `refreshAccountAvg` (hourly; recomputes
  when the month changes, i.e. on the 1st). The yellow zone setting is only the fallback until the first
  average exists. Shown in the Monday message header and Settings → Goals.

## 2026-10-04: Tests is its own tab, and the rail is grouped by WHEN you use it

- Cole: "this needs to be stupid simple", "hundreds in review". Measured: 284 tests sat in Asana
  "Analyze Results" (oldest May 2025) and read as live; only 115 of 1,241 carried a verdict.
- **Tests tab** (`show('tests')` -> `renderTests` -> `BrandTab.render({mode:'tests'})`, same brand.js
  closure). Three boxes in the order you act: **Make a call**, **Running**, **What we learned**
  (angle chips, 30 at a time). Search swaps the boxes for one flat list. All brands = a table from
  `GET /api/brand/tests-overview`. The Brand tab keeps only Research and "Voice and brand info".
- **The worker decides the box: `boxOf()` in worker/src/brand.js** (payload field `box`, plus
  `auto_done`). A test whose ads last spent more than `STALE_DAYS` (14) ago is DONE whatever its
  Asana column says; never-spent live tests get 30 days from `created_at` (the hourly sync bumps
  `updated_at`, so it dates nothing). `needs_call` = `box === 'call'`. Finished tests with no call
  show Locus's read as a dashed "Locus: winner/loser/mixed" pill, never as the buyer's call.
  Nothing is written to Asana or D1 by this; the Asana tasks stay where they are until Cole decides.
- **Rail groups:** Every day (Overview, Daily Brief, Tests, Meta) / Every week (Reports, Profit) /
  Making ads (Studio, Brand) / Monthly and setup (Plan, Settings). `SECTIONS` in index.html nests
  pages under a parent: Profit > Customers, Brand > Creator link (amb), Settings > Data health,
  Costs. ONE `#subtabs` nav is moved under the open parent by `show()`; Meta still fills its own.
  Old tab ids all still route (deep links, Slack buttons).
- **Meta shows three sub-tabs in the rail** (Overview, Creative, Change Log). Today and Averages
  ("Last 7 vs 30 days") open from buttons on Meta Overview (`[data-msub]`, delegated in meta.js)
  and light Overview while open.
- Phone bar: Overview, Brief, Tests, Meta, More. Proposal + SOP artifact:
  https://claude.ai/artifact/8P1n7XmyrCZA7g2rQy229e
- **Later 2026-10-04 (Cole: "the Meta tab is everything Meta, and attribution is always Triple Whale"):**
  Tests is a Meta SUB-TAB, not a top-level tab (`PARENT_OF.tests = 'meta'`, rail list `META_RAIL`
  drawn by show(): Overview, Tests, Creative, Change Log). The Meta tab's purchases, revenue, ROAS
  and CPA now come from Triple Whale `tw_ad_attr` lastPlatformClick (account-health `twMetaDaily`,
  `attributeRows`, `agg(rows, true)`); spend and delivery stay Meta's. The old "Meta-reported,
  matches Ads Manager" rule at the top of this file is RETIRED for attribution. The Creative
  browser's "Meta's own attribution" option and "Use Meta's figures instead" button are gone.
  A day TW has not synced yet makes totals null but CPA/ROAS are taken over the synced days.
- **Later still 2026-10-04: TWO JOBS, TWO SCREENS (Cole approved the mock
  https://claude.ai/artifact/LAF9qCPR4zkfFQJWgg8pLK).** Media buyer = **Meta → Test calls**
  (brand.js mode 'tests'): only Make a call + Running, no search, no learned list. Strategist =
  **Making ads → Angles** (mode 'angles', `renderAngles`): "Have we tested this?" (account-health
  `POST /api/brand-asana/tested` {idea}: model checks the idea against every angle AND past test
  titles, returns verdict tested/close/new + angle + test numbers + phrasings that already ran),
  then the angle scoreboard (tests, won of judged, best CPA, last tested, a "what to do" label:
  Proven / Mixed / Not judged / Dead / Untested idea / Retired), then an angle's page = concepts,
  each with its tests in order (First version, Variation: hook...). "Won" = the buyer's verdict,
  else Locus's read of a FINISHED test (`outcomeOf`), dashed pill. Proven = won >= 20% of judged.
- **Concepts were 1:1 with tests** because the tag prompt never listed existing concepts. It now
  does (EXISTING CONCEPTS block in tagPass), and `POST /api/brand-asana/tidy-concepts` groups
  same-idea concepts inside one angle (link on the Angles page).

## 2026-10-04 (night): every page says who it is for; the rail filters by role; in-app guide

- Cole: "my team is not going to know what each one of these tabs do." `TAB_WHO` (index.html) maps
  each tab to everyone / buyer / strategist / owner. `crumbFor()` appends a "For the media buyer"
  chip; brand.js, studio.js, amb.js and meta.js read it through `window.crumbFor` / `window.whoChip`
  so EVERY page carries the same crumb + who chip. A new tab must be added to TAB_WHO and TAB_CRUMB.
- Rail: "Show tabs for" (Everyone / Buyer / Strategist), stored in `pf_role`, `applyRole()` hides the
  other tabs (the open tab always stays). `ROLE_TABS` is the list per role.
- **How to use Locus** (`show('guide')`, button in the rail foot, `GUIDE` array): the SOP by role,
  steps in order, each with an Open button (`data-go="tab"` or `"meta:sub"`). Keep GUIDE in step with
  the rail whenever a tab moves.
- Header buttons are words now (Tour, Metrics, Help), not icons. The fixed-window note above the
  crumb (PB_FIXED) is no longer drawn.
- Angles/Test calls pills use the call already POSTED in Asana (`asana_result`) before Locus's
  recomputed read, so a pill never contradicts its learning. account-health
  `POST /api/brand-asana/results {rejudge:true, quiet:true}` re-posts only tests whose posted call no
  longer matches the numbers (the goal CPA changed after the call) and overwrites the learning.

## 2026-10-04 (late): page-by-page hierarchy pass

- **Overview** opens with a **Today** card: per role, counts that open the screen (briefs to send
  from `/api/briefs`, tests needing a call + being made from `/api/brand/tests-overview`, reports
  waiting from `/api/reports`, research drafts from `/api/brand/overview`). Internal-only brands never
  count. Loaded after paint, cached 60s, honours `pf_role`. The Strategist card is one line when empty.
- **Settings is ONE menu**: `settings` left SECTIONS; Data health and Costs are entries in the
  Settings page list (`SET_PAGES`), `PARENT_OF.health/costs = 'settings'`, each has "← Settings".
  (Supersedes the earlier note that they nest in the rail.)
- **Daily Brief** order: date + quiet refresh, ONE status line (send state + data health, `.st-line`),
  the brief with What we did and one primary Send, then "The numbers behind it", then closed
  disclosures (Past briefs, The plan). All-brands view: status pill + one button per row.
- **Reports**: status line with one primary Send, latest 4 report chips + "Older reports", sticky
  "Jump to" row inside `reportBodyHTML` (so the client archive has it too; `wireReportJump()`),
  config in a closed disclosure.
- **Meta Overview, one brand**: verdict sentence, four tiles (spend today from `/api/pacing`, month,
  CPA and ROAS 7d from `/api/overview`), today's pace chart and the 7 vs 30 cards inline, then
  "Where to go next". All brands keeps the table.
- **Brand Research**: At a glance tiles, sections as questions in strategist order (Who buys,
  What do they say, angle ideas, market, mechanism, competitors, website), collapsed by default,
  staff actions inside "Research tools" or quiet Edit links. 152 buttons became about 19.

## 2026-10-05: second hierarchy pass (Plan, Profit, Customers, Change Log, Studio)

- **Plan opens on the month IN PROGRESS when it has no plan of its own** (`planned` false), else next
  month (supersedes "Plan defaults to NEXT month"). An unplanned month seeds at hold flat on the basis
  month, never from `goals_json.default` (that default is still overwritten on every save and merged
  under every month by the API: the $99,967 "Unrealistic" October was the last plan saved for another
  month). Save sits with the three numbers; explanations are closed disclosures. Titles use a colon,
  never an em dash ("Plan: Lucky Golf").
- **Customers** leads with "Does a new customer pay for themselves?"; sections are questions.
- **Change Log** ("What changed on the account"): "Changes that matter" (budget, new_campaign,
  campaign_paused, campaign_relaunched, bid_strategy, targeting, new_creative, new_adset, manual)
  grouped by day, then "Everything else (N)" closed. "Add why" is one dialog; ✓ is "Use this reason",
  ✗ is "Hide". Same-object same-minute rows fold. Its CSS ships inside meta.js.
- **Studio**: connections live behind one "Connections" button (Atria included; `#stAtria` is gone
  from the top bar); five steps in words; one primary button per screen; Studio's brief-line class is
  `.st-bl` because `.st-line` is the Daily Brief status line in index.html.
- **2026-10-05 fixes:** an unplanned month now inherits from the latest PRIOR month with its own plan
  (`inheritedGoals()` in both workers' `goalsFor`); `goals_json.default` is only the fallback when no
  dated month exists. Tours rewritten for the new layouts (selectors `.ovd-cols`, `.st-line`,
  `#bfPreview`, `#bfPost`, `.rp-jump`, `.pl-main`, `#plVerdictCard`, `#plSave`, `#hdPeriod`). Studio's
  Archive this batch asks first. `/api/overview` returns the brand's `yellow_pct` for the Meta
  Overview CPA tile. The Change Log's bare "confirm" tick was dropped on purpose (no homework buttons).

## 2026-10-05: Customers = LTV:CAC and the journey; Brand = Client answers / Research / Voice; threads; AOV

Cole's audit: "what's the point of the money tab and the customers tab", "I'm surprised the app
doesn't have AOV", "the Brand tab is confusing, why is the creator link under Brand, where are
the onboarding answers", "the Strategist couldn't answer what's the AOV", "I have to tag it in
every thread reply", and Yak Sports asked to change the agreement before signing.

- **tw_orders (account-health, shared D1).** One row per order from the Triple Whale journeys
  response the attribution sync already pulls: `order_id, customer_id, date, total, currency,
  products_json (add-to-cart product ids, oldest first), source (twPlatform of the
  lastPlatformClick touch, else the raw source, else 'organic')`. `storeTwOrders` runs inside
  `syncTwAttribution` (no extra API call); `backfillTwOrders` walks back 14 days a night per
  brand to `TW_ORDERS_HISTORY_DAYS` (400) via settings `twOrdersCursor:<act>` /
  `twOrdersDone:<act>`; `POST /api/tw-orders-backfill?act=&slices=N` (admin) runs slices now.
  The response's `earliestDate` is the oldest order ON THAT PAGE, never a history limit: do not
  stop the walk on it. `GET /api/tw-probe?act=` shows one order's fields. The journeys endpoint
  carries NO line items: products are the cart's add-to-cart events. Shopify stays the path to
  exact receipts; `p_shopify` is empty on 2026-10-05 (no store has the app installed).
- **Customers (profit worker `customerJourney`, rides on `/api/customers` as `journey`;
  `&journey=0` skips it).** Customers followed from their first order: LTV at 30/60/90/180/365
  days (only customers old enough for the horizon), repeat rate, median days to the second
  order, first vs repeat AOV, cohorts by first-order month with that month's CAC
  (blendedAds / newCustomersOrders) and LTV:CAC, first product -> next product (titles from
  the store's public products.json, cached 24h in settings `productTitles:<act>`;
  retired products are named by hand in settings `productNames:<act>` = {"id":"name"}), order
  sources grouped paid / email / own (`srcGroup`), and the window by people. Customers first
  seen in the first 60 days of history are `uncertain` and left out of averages. Guest orders
  (no customer_id) count as orders only. The page (`renderCustomers`) leads with "Is a customer
  worth more than they cost?" and the LTV:CAC verdict (3x / 1.5x lines), then tiles, curve,
  cohort table, journey, sources. The old Shopify `p_cohorts` card is gone from the page
  (route kept). Lucky, measured: LTV90 $165 vs first order $154, 9% ever repeat, 1.7x in 90d.
- **Orders and AOV** on P&L tiles, from `dayEconomics` (`orders`, `new_orders`, `email_rev`)
  and `totals` (`orders, aov, new_aov, cac, email_rev, email_share`). ONE definition: AOV =
  revenue / Triple Whale totalOrders, the same as Reports and the Strategist's `store` view.
  Labels matched: "Revenue" and "Ad spend" on Overview, P&L and the Daily Brief; Overview's
  "New customer MER" is "aMER". Profit's sub-tabs are **P&L** and **Customers**.
- **Brand tab** (brand.js): views **Client answers** (call sheet `callSheet()` built from the
  onboarding form by `CALL_SHEET` groups, access ticks, "ask them on the call" = not-sure and
  blank `IMPORTANT` fields; then every answer step by step; then the voice interview
  transcript), **Research** (unchanged), **Voice** (how the voice gets built strip, brand
  voice, How we write, copy desk). `glanceStrip()` above all three replaces the profile card;
  test rules are only a link to Settings > Goals. Stored `br_view` values info/library map to
  the new names. **Creator link is its own rail tab** under Making ads (`SECTIONS.brand`
  removed; `amb` in ROLE_TABS.strategist).
- **Strategist threads (account-health `handleSlackEvent`).** A plain reply in a thread is
  answered without a tag when the thread is OPEN: `askThread:<channel>:<ts>` = 1, set when
  the Strategist answers a mention there or when the thread's root message is its own
  (username Strategist); a thread checked and not its own is marked 0 (one Slack read, once).
  A mention's plain-message twin counts as a mention (`<@bot>` in the text). The ideas bot
  still needs a tag. The open-thread check runs BEFORE the claim so the plain copy cannot
  swallow its app_mention twin. **Slack read methods go form-encoded** (`slackApi`):
  conversations.replies refused the JSON body, so `threadTranscript` had silently returned
  nothing. Strategist config: owner Cole, 30 turns / 2500 / 24000 chars, `strongWhen` adds
  why|aov|ltv|cac|payback|cohort|retention|repeat|journey|scale|cut|pause. Needs the Slack app
  subscribed to `message.groups` (the -internal channels are private) and `message.channels`.
- **Strategist `store` view** (`storePeriod` in worker.js): revenue, orders, AOV, new vs
  returning (customers and money), CAC, first-order margin, MER, aMER, CM, email share over
  `days` / `month` / `from`+`to`, `compare: true` for the prior period. RULES define AOV, CAC,
  LTV, LTV:CAC once.
- **Agreement before signing** (contract.js / newclient.js): a `sent` row can be re-sent with
  new text ("Change it before they sign" on the setup screen; starts from the stored html when
  custom). `vars.version` + `vars.history[{version, sent_at, hash, html, term, payment,
  custom}]` keep every earlier version; the client gets an "updated agreement" email; the
  signing page sends `hash` and `POST /api/sign` refuses (409 `updated`) a signature on an
  older text and reloads the page. `contractState` returns `html`, `version`, `history`
  (without html). Signed rows are untouched: amendments as before.

### 2026-10-05 (night): read it like a client. Copy desk is its own tab.
Cole: "formatting issues, spacing issues, a lot of it doesn't make sense, especially Customers;
why is the copy desk in the brand thing". Fixed by reading every screen at 1280 wide:
- **Customers copy**: every label is a sentence ("Cost to get a new customer", "Left after costs
  on that order", "Spent in their first 90 days", "Order again"); the verdict reads "Yes, but
  not by much: 1.8x over their first 90 days" and explains dollars back per dollar. The bar
  chart is a four-row table (days after first order / spent so far / ordered again / counted)
  with one plain sentence under it; the two month tables are one ("Each month's new customers,
  followed since", with Back per $1). "This window, by people" is gone. Customers is one column
  (`.cu-two`), so no table scrolls sideways.
- **Stat strip** (`.rollup`) is a grid of separate dark tiles with a 5px gap, not a wrapping
  flex bar: seven tiles on P&L had put Contribution margin alone on a full-width second row.
  `td.tiny` note columns wrap instead of forcing a horizontal scroll.
- **Copy desk is its own rail tab** under Making ads (`show('copy')` -> `renderCopy` ->
  `BrandTab.render({mode:'copy'})` -> `paintDesk` in brand.js). Brand > Voice keeps the
  interview, guide and skill (how the voice was built); the desk is where you WRITE. Call
  sheet blocks are two columns max and keep their tables inside (`.cs-blk{overflow:hidden}`).
- Screens that proxy account-health (Daily Brief, Reports, Meta) cannot be audited on the local
  dev pair (401 on the dev token): audit those on prod.

## 2026-10-05 (night): Season tab, the BFCM plan in Locus. The Q4 Playbook is to be retired.

- **Why.** The standalone Q4 Playbook (`2026-q4-playbook/`, Apps Script + Sheet "Q4 Playbook DB")
  was a sixth place to look and died: last edit Aug 25, zero checklist items launched, weekend
  numbers never set, Noma never given access. Cole: "should this be in Locus?" Yes. One tab,
  under Every week, for everyone. Strategy page: https://claude.ai/artifact/VWugT2XKbjmkcEAeDMVVsu
- **Files.** `season.js` (own closure, `window.SeasonTab.render/renderShare`, like amb.js),
  `worker/src/season.js` (template, derived tasks, routes), `worker/migrations/season-001.sql`
  (tables, also in schema.sql), `worker/migrations/season-seed-2026.sql` (what we knew on
  2026-10-05; INSERT OR REPLACE, so DO NOT re-run after people edit in Locus).
- **Tables.** `p_season_phase` (act, season, key, name, start, end, grp nov|bf|dec|late|vday,
  who, offer, detail, status missing|draft|locked|skip, sort), `p_season_answer` (call sheet:
  goal, last_year, winning_offer, floor, inventory, cutoffs, returns, gift_cards, approver; setup:
  shape standard|blacknov|access, strategist, buyer, email_owner, in_season), `p_season_task`
  (only rows that were ticked, re-dated, renamed, or custom), `p_season_share` (client token).
- **The template is code, the brand is data.** `templatePhases(shape)` in worker/src/season.js is
  the season every brand follows (early, access, bf, planb, drop, xmas, gift, boxing, ny, vday,
  all anchored to BF = 2026-11-27). A stored row overrides a template phase by key; rows with a
  key not in the template are custom phases (Dartee and Grunk have `cm`, Cyber Monday). Template
  phases cannot be deleted, only skipped.
- **Tasks are DERIVED, never typed twice.** `tasksFor()` makes, per non-skipped phase with a start
  date: Offer locked (-30d, Cole; ticks itself when status = locked), Briefs due (-23d,
  strategist), Ads built (-9d, strategist), Ads loaded (-4d, buyer), Live (0, buyer; auto-done 3
  days after), plus phase extras (bf: ops -17d, spend limit + backup card -14d, ladder -10d,
  emails -7d, site -7d; access: lock test -3d; drop: segment -7d; xmas: countdown -1d). Moving a
  phase's start date moves all of them. Names come from the brand's answers (strategist, buyer,
  email_owner), so change the owner there, not per task. Custom tasks: id `c:<hex>`, custom = 1.
- **Routes** (authed, `handleSeason`): GET /api/season?act=all|<act>; PUT /api/season/phase;
  DELETE /api/season/phase (custom only); PUT /api/season/answer; PUT /api/season/task (upsert,
  `done_by` from the session email); DELETE /api/season/task (custom only); POST /api/season-share.
  Public, before the auth gate: GET /api/season/:token -> phases (not skipped), the three date
  answers, and tasks whose owner reads "Client". Same contract as the plan link: one brand, nothing
  internal. Frontend `?season=<token>` renders `SeasonTab.renderShare` with chrome off.
- **Screens.** All clients: strip (days to BF, offers locked, due this week, overdue), one verdict
  sentence, Now (This week: overdue first, then by brand, tick to complete; the board: brand x
  November / Thursday / Black Friday / December, FOUR columns on purpose so it fits 1280 wide with
  no sideways scroll) or Week by week (every brand, the green box is now). One brand: strip,
  Still needed (missing/draft phases + missing cutoffs/gift cards/goal), offer cards with Edit,
  What is due by week with Add a task, the call sheet with Edit, "not running a season" toggle.
  Top-bar actions: Copy offer sheet (plain text for Slack/Nick), Client link.
- **Brand state** = is the Black Friday weekend locked (and November not missing). `in_season =
  'no'` hides a brand from the board (The Golf Sock). Ice & Gold and Yak Sports sit on the board
  with template phases; Cole switches them off from the brand page if they are out of scope.
- **2026-10-06: goals, results, the desk, swipe files.** Cole: "anything for KPI goals? anything
  that marks the day of automatically and tells us to scale?" Added:
  - **Goals card** (brand page): answer key `goals` = JSON {early, bf, dec, total, be, target,
    s50, s100, start, cap, note}; `goalsOf()` parses it, falling back to `accounts.target_roas`
    for the target. The ladder is SEASON-ONLY on purpose (the account's target_roas stays the one
    place for the everyday goal); the bf:ladder task ticks itself when the four lines exist. Seeded
    from the 2025 budget sheet in `migrations/season-seed-002.sql`, every note says confirm by Nov 13.
  - **Results per phase**: `seasonData(env, accounts, {series})` sums the host's `seriesFor` rows
    (same revenue line as P&L) from the phase start to min(end, yesterday); `GOAL_OF` maps phases
    to a goal (early -> early; access/bf/planb/cm -> bf; drop/xmas/gift/boxing -> dec). Only on
    a brand page or with `?results=1`; never today.
  - **The desk** (`deskSection` in season.js; All clients seg "Desk" + a card on every brand):
    date chips (today + Nov 26 to 30 + any day with a check-in), three slots (8am, 4pm, 12am
    Central), `GET /api/season/live?act=` = `twDay` for the brand's local today -> `hoursOf` ->
    `liveFrom()`: today so far + the trailing 3 hours with data, blended MER. `ladderOf()` grades
    the 3-hour MER (>= s100 scale 100%, >= s50 scale 50%, >= target hold, >= be pull back, else
    rework). `PUT /api/season/checkin` upserts p_season_checkin (action, the numbers at the time,
    the verdict, by, at). The client link shows the action lines, never the numbers or the ladder.
  - **Swipe files**: `SWIPE` (phase -> Atria board) and `SWIPE_BRAND` (act -> "BFCM / Brands / X")
    in worker/src/season.js; "Swipe file" on a phase card and "This brand's swipe file" load
    account-health `GET /api/atria/board?board_id=` (new, in atria.js: `search_library_ads`
    scope ad_board, 20 ads, links to app.tryatria.com/ad/<id>). Save ads into the board in Atria
    and they show here. Boards made 2026-10-06 under the existing "BFCM" board: Black Friday
    weekend, Post-BFCM drop, Order by Christmas, Gift cards, Boxing Day and New Year, Valentine's,
    plus Brands / Yak Sports and Brands / Ice & Gold. Foreplay is no longer used (Cole).
  - **Yak Sports and Ice & Gold** got draft phases marked "Proposed by Mobius" (gift-with-purchase
    and bundles for Yak, list + tiered spend + gift sets for Ice & Gold) and call-sheet answers from
    the Oct 1 and Oct 2 calls and the catalogs. They are proposals until Cole presents them.
- **2026-10-06 (later): THE OFFERS COME FIRST.** Cole: "I still don't even see what our offers are."
  The all-clients page had led with tasks and hidden the deal in clamped board cells. Now the
  default view is **The offers**: one wide `.se-off` card per brand (name + state + goal + who
  on the left; Black Friday deal in big type, November and December beside it, a compact season
  bar underneath), brands with nothing written first; the task list and the status board moved to
  **This week**; Week by week and Desk unchanged. The brand page leads with the big season bar
  (`seasonBar(a, today, true)`: greedy lanes so phases never overlap, faded = missing, TODAY and
  BF marked) and **the offers as a numbered list** (`.se-deal`, Black Friday ringed), then goals
  + ladder, Still needed, the desk, and the weeks and call sheet as closed `<details>`. The
  client link uses the same bar and list. `LS_VIEW` is `se_view2` so old saved views do not
  land people on the task list.
- **Not built yet:** Asana project per brand from the Lucky BFCM 2026 template read back into an
  Ads plan; "Use in Studio" from a swipe board; the desk dry run (Nov 14 to 15); retiring
  2026-q4-playbook (redirect to Locus Season) after the season.
- **2026-10-06 (night): the real redesign, after "it's a long scroll, swipe files load weird, the bar
  looks like Canva, I can't hover anything".** season.js v10+.
  - Brand page order: strip, **the plan in one read** (`planLines()`: one numbered sentence per
    phase, Black Friday in green, plus the `strategy_note` answer as "Why this offer, and the
    risk", editable), **The season** (`gantt()`: one row per phase, month grid, TODAY and BLACK
    FRIDAY markers, solid = locked / striped = draft / dashed outline = missing, the deal written
    inside or after the bar, `data-tip` hover via one shared `.se-tip` element), then five in-page
    tabs (`S.btab`, saved in `se_btab`): Offers (Still needed + the numbered `.se-deal` list),
    Goals and results, Desk, To-do (week boxes, past weeks folded), Call sheet. Nothing below the
    tabs scrolls forever any more.
  - All clients: same segments as before; the per-brand card's bar is `miniBar()` (same hover).
  - **Swipe file is a modal** (`panelModal` + `showSwipe`), never injected at the top of the page.
    Cards with no preview say the advertiser instead of a grey box. Footer link opens
    `showFormats()`: the 17 Black Friday ad formats from Cole's TikTok drop (`FORMATS`, 16 named,
    the 17th never shows on screen), each with a no-discount reading. Also "Ad formats to steal"
    on the brand Offers tab.
  - Atria boards were cleaned: the 7 generic ads unsaved; real golf BF references (Stix, Macade,
    Takomo) moved into "Black Friday weekend", STAX into "BFCM Sign Up".
  - **Lucky's offer analysis** is seeded as the `strategy_note` answer
    (`migrations/season-seed-003-lucky-note.sql`, INSERT OR REPLACE, do not re-run after edits):
    2024 vs 2025 numbers, what sold, competitors, the verdict (the hat alone is the smallest BF
    offer Lucky has run; Plan B is the real Black Friday offer), and the recommendation (bundle
    from Friday 8am, a Cyber Monday step-up, giveaway entries as the KPI, $100k weekend goal with
    the ladder, wedge-only markdown as the last fallback).
  - `LS_VIEW` is now `se_view3`.
- **2026-10-06 (later still): Lucky's plan, forecast and build live in the data, not the code.**
  `migrations/season-seed-004..006` (INSERT OR REPLACE / UPDATE, run once each, never re-run):
  004 = the first analysis note + goals; 005 = round two (no store lockdown: members-first by
  private link; goals to the sheet; the `access` phase rewritten); 006 = "everything lands
  mid-November, build it": new phase key `putters` (Eclipse Black launch Nov 19/20), driver +
  irons first sale on Thursday/Friday inside the bundle, `planb` = wedge-only 30% fallback,
  apparel Dec 4, `boxing` locked, `ny` = "New year: the full bag" (draft), goals $400k.
  The working sheet (deals in the customer's words, per-order money, recalculating season model,
  lockdown evidence, paid-only MER history) is a claude.ai artifact linked from the note:
  https://claude.ai/artifact/2KAw7y5U9HJsXpyqkp8V1V. Lesson for any MER quoted anywhere in Locus:
  Shopify net sales over Meta + Google only; the ledger's whole marketing line (Mobius, Klaviyo,
  Vibe, affiliates) understates efficiency by about 0.5x.
- **2026-10-06 (night): ad counts in the task names.** `ADS` in worker/src/season.js (per phase key;
  `putters` is Lucky's custom launch phase) renames the derived briefs/built rows to "Briefs due:
  15 ads" / "15 ads built". The Asana BFCM projects for the other six brands were created from the
  Lucky one with the same counts and the same date rule (briefs -23d, built -9d, loaded -4d); GIDs
  are in the bfcm-2026 memory. Asana stays the only place production is typed; Locus derives.

## 2026-10-06: real photos in Studio (the ad IS the photo), own photos as the product
- **A line can carry a photo that IS the ad** (`brief.lines[i].photo`): the image maker keeps it exactly
  as shot and adds only the words and whatever small change the plan asks for (`basePrompt` in
  worker/src/studio.js, `spec.base`; sent alone with `input_fidelity: high`; no product score, the card
  says "Real product photo"). On the batch: "Use as the ad" under a line's inspiration image, × puts it
  back. Plan rows show the photo and the look field reads "What to add or change on the photo". This is
  the realism lever Cole asked for: nothing is rendered, so the product and scene are real.
- **"Add your own photos"** under Product: a shoot not on Shopify yet becomes a product ("Your photos",
  handle `upload`), drawn from, checked against and fingerprinted like Shopify photos. Products that
  arrive with photos and no fingerprint (pushed from Slack) are fingerprinted on open (`FP_RUNNING`).
- **Uploads are shrunk in the browser** (`shrinkImage`, 1568px, JPEG stays JPEG, PNG/WebP -> WebP so a
  cut-out keeps alpha) and a batch's existing images are shrunk the first time it is planned
  (`repairRefs`): a 6000px camera photo on a line killed the whole plan on 2026-10-06.
- Testing chip "Format" = one idea, different layouts. The brief reader and the ideas bot read "N
  variations of this" as a format test.

## 2026-10-06 (late): Scenarios tab (the lead math and the ROAS math, inside Locus)

- Cole: the Playbook's lead-gen calculator and the public ROAS calculator both belong in Locus,
  prefilled with the brand's numbers, with saved scenarios, something visual, and a way to "just
  say" a what-if. `profit/calc.js` (own closure, `window.CalcTab.render`), rail tab **Scenarios**
  under Monthly and setup (`show('calc')`, for everyone), `worker/src/scenario.js` + table
  `p_scenario` (`migrations/scenario-001.sql`; `GET/PUT/DELETE /api/scenario`).
- **Leads** = the Goldilocks question. Columns (up to 4) of spend / cost per lead / % who buy /
  AOV / margin before ads; outputs leads, orders, revenue, ROAS on the lead spend, contribution,
  money left after the lead spend, cost per order won, and the two numbers that do not depend
  on the budget: **pay up to $X a lead for the target ROAS** (cvr x aov / target) and the
  **breakeven CPL** (cvr x aov x margin). Chart = ROAS vs CPL for the focus column's conversion
  rate (and half / double), target and breakeven lines, shaded "pay up to" band. "Set as this
  brand's lead KPI" writes `p_season_answer` key `lead_kpi` (JSON), which the Season brand page
  shows on Goals and results; the Season Offers tab has a "Lead math" button into the tab.
- **ROAS** = the public `/roas-calculator` model ported verbatim in spirit (modes spend+ROAS /
  spend+orders / revenue goal+ROAS; processing, pick-pack-ship, fixed costs, rev share, agency
  fee toggles; breakeven ROAS on contribution and net, breakeven CPA, waterfall, profit-vs-ROAS
  curve). The public page stays as the free tool and is linked.
- **Prefill** from `/api/customers?act&days=90&journey=0` headline (new-customer AOV, returning
  AOV, margin before ads, CAC) + the account's `target_roas` as the target; "Put these in every
  column". All clients = no prefill, defaults.
- **Say it in words:** account-health `POST /api/scenario-parse` {text, kind, context} (admin;
  Haiku 4.5, about a cent) returns up to 4 scenarios as numbers + one line of reading; the browser
  fills the columns, nothing is stored until Save. Examples under the box are clickable.
- `inPlace()` keeps focus on the input being typed in across a repaint (number inputs cannot
  restore a caret, so they only re-focus).

## Scenarios v2 (2026-10-06 night, calc.js?v=2)
Cole rejected v1 ("made in Canva", no hover, text over the lines, the bar chart was unreadable, numbers ran over the table). v2 keeps the same math (leadMath / roasMath) and replaces every visual:
- Hero card: the one answer in IBM Plex Mono (pay-up-to CPL, or what you keep), a zone pill (In the zone / Makes money, misses target / Loses money; Profitable / Near breakeven / Losing money), a plain-English reading, and an even stat grid.
- Dials: number box + range slider per input with a one-line sublabel; `inPlace()` keeps the dragged slider focused.
- Compare: scenario cards (max 4) with a zone dot, not a table. Click to dial, rename inline, Save / Remove per card.
- "Where a lead pays": one strip, green to the target CPL, amber to breakeven, red beyond, every scenario a marker.
- Curves: hover/touch crosshair + fixed tooltip (`tipShow`), gradient area, target/breakeven lines with tags in the right margin (ROAS tag pinned to its line). `paint()` calls `tipHide()` because a repaint removes the svg without a mouseleave.
- "Where every dollar goes": stacked bar with a legend of amounts and % of revenue.
Font: calc.js injects IBM Plex Mono from Google Fonts itself (index.html only loads Instrument). Verified on the local pair at 1280.

## Season seed 011 (Lucky, Cole's answers Oct 6 night) RAN
Giveaway `early` starts 2026-10-14 ("Four Full Bags" working name); `putters` = announced Nov 9, sold only on Black Friday, list first; `access` has no driver/irons, 24h vs 48h open; `bf` = bundle + ONE hat per order + 400 polos + Eclipse Black first sale; `ny` = The Havoc driver Jan 6/7 locked. Asana (BFCM 2026 Lucky section + Lucky BFCM 2026 project) and the plan sheet artifact (v4) match. Still open for the Nick call Oct 7: Early Bird offer, 24h vs 48h, gift-card structure.

## Scenarios v3 (2026-10-06 later, calc.js?v=3): the audit against /roas-calculator
Cole asked whether I had really gone through the public calculator before dropping things. Inventory of the public tool: AOV + gross margin sliders; optional processing (% + per transaction), fulfilment per order, fixed monthly, revenue share, ad fee (% of spend AND "applies to" % of spend); three modes; KPI strip; "Where every dollar goes" bar; per-order receipt; "Profit by ROAS" bar chart with tooltip; reset; breakeven formula footnote. v2 had dropped the receipt, the applies-to option, reset and the formula note. v3 brings those back and adds what professional tools do for clarity:
- "What has to be true" sensitivity grid (leads: cost per lead across x % who buy down, ROAS in the cell and what is left under it; ROAS: ROAS across x margin down, what you keep). Colour depth = size of the win/loss, outlined cell = the dials, hover = the numbers, click = move the dials there.
- "The receipt": one lead and one order won (leads); the per-order receipt (ROAS).
- Delta against the first scenario on every compare card.
- Reset link in the dial card; "How this is calculated" details at the bottom with the formulas.
- Number boxes are text inputs with commas (fmtIn/parseIn); typing or dragging keeps the dial card (`inPlace` swaps the old #ccDials back in and syncs the twin control), so the caret no longer jumps and sliders drag.
- Up to 8 scenarios (was 4).

## Season seed 012 (Lucky, implemented recommendations) RAN
Prize = THE FOURSOME GIVEAWAY ("Every Lucky club. All four of you."), `list` key = Early Bird Nov 1 to 16 "buy any club, get 10 entries" (locked), `gift` = free hat at $100, glove + hat at $200. Asana: BFCM 2026 Lucky section has the Early Bird line (1219238618492931) with the four subtasks; Lucky BFCM 2026 has the website + email tasks; gift card lines renamed. Sheet artifact v5. Open: one day vs 48h early access (Nick, Oct 7).

## Scenarios v4 (2026-10-06 late, calc.js?v=4) + the share page
- Sliders are custom-drawn (thin track, filled part via `--p`, round thumb); `setP()` keeps the fill in step.
- Drag-safe repaint: `inPlace()` paints into a detached tree (`TARGET`, `host()`, and `$` resolves against it) and swaps every live block except `#ccDials`, so a range input never leaves the document mid-drag and the caret never moves. If the block count differs it falls back to a full swap.
- Labels: CPL / CVR everywhere (Cole's words).
- Share: every saved scenario has "Share link" -> `profit/share.html?s=<id>`, a read-only page (S.ro) with the hero, assumptions card, zone strip, grid, curve, dollar bar, receipt and formula note. Data from `GET /api/scenario/public?id=` (scenario.js, mounted in worker.js BEFORE the auth gate; returns the row + brand name, never the author). Only saved scenarios can be shared, by design.
- Role chip in the breadcrumb reworded app-wide: "Shows for every role / the media buyer / the strategist / Cole only" (Cole read "For everyone" as a sharing control).

## Season seed 013 (Lucky TBD flags) RAN
Prize name, Early Bird and gift cards back to proposed/TBD until the Nick call Oct 7; strategy_note says what is decided vs open. Nick doc artifact: https://claude.ai/artifact/DKSH1u9LXUVS1prAVVUeUF

## Scenarios v6 (2026-10-06, last pass): Save / Share at the top
- Hero carries "Save" and "Share with the client". Both run `saveOnScreen(share)`: name it, PUT (upsert, keeps the id of a loaded scenario so an existing client link shows the new numbers), reload Saved, and for share copy `share.html?s=<id>`. Per-card Save and the Saved list's Share link use the same two helpers.
- The number box is the input itself (`input.num`, `!important` to beat `main .card input[type=text]` in index.html); the wrapper has no border. That was the "box in a box".
- Trimmed: the hint strings, the KPI button is a link, the ROAS card's bottom button row is gone, reset has no toast.

## 2026-10-07: Settings > Connections, and the Strategist as one full strategist

- **Connections** (Settings section between Brands and Briefs and Slack): account-health
  `GET /api/integrations` (`src/integrations.js`, `integrationsReport`) grades every connection
  ok / warn / bad / off with a note and the fix. Two cards: **Agency-wide (connected once)**: a
  secret on the account-health worker or Cole signing in from Locus (Meta token, Triple Whale key,
  Asana + its fields, Slack bot / signing secret / user token, Google service account, Claude,
  Atria, Frame, Studio image key, Canva, Gemini, downloader, Stripe, Lucky creator app, Google
  sign-in); **Per brand (set up at onboarding)**: ad account data + sync error, Triple Whale shop +
  data + attribution + stored orders, Shopify install (`p_shopify`, the install link from
  `/api/connections`), Asana project + webhook, both Slack channels, Drive folder and Frame project
  (from `p_newclient`), creator link, onboarding, Google Ads and Klaviyo as seen through Triple
  Whale (14-day presence). One row per brand with WRAPPING chips (a 12-column pill table scrolled
  sideways at 1280); a chip opens its note + fix in place. Nothing on the page changes anything.
  The Strategist has the same report as its `integrations` view.
- **The Strategist** (account-health `strategist.js`) carries the whole creative framework, the
  review workflow and the post-Andromeda account doctrine in its playbook, reads the test library,
  one brief by number, customers (tw_orders), scenarios and the brand brain, and can fill or create
  Asana briefs, save scenarios (share link), drop Studio batches and hand a media thread to the
  ideas pipeline. Sources and the open list: `docs/strategist-brain/README.md`.
