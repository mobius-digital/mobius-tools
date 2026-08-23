# Mobius Profit — instructions for Claude Code

Store-level business tool. **Read `PRD.md` first.** Account Health answers "are the
Meta ads working?" (Meta-only, matches Ads Manager). This answers "is the brand
making money?" (blended, all channels). Do not merge them.

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
- **Fulfilment is the SECOND variable cost and it fails silently. `mirrored` is the
  state that matters.** Where no delivery rate is configured, Triple Whale writes the
  shipping CHARGE into `totalShippingCosts`, so the two sides cancel and delivery
  leaves contribution margin with nothing on screen to say so. Measured over 12
  months: cost equals revenue to the cent on 351/351 days (Dartee), 356/356 (Lucky)
  and 362/362 (Party Patch), against 1/365 for Bonk and 0/365 for Grunk, who both
  have real rates. It is the absence of a measurement, not a pass-through deal — the
  old wording ("nets to zero") gave the one broken state a clean bill of health.
  `shippingMode()` returns measured / mirrored / uncosted / none plus per-order
  figures, and the Costs page sizes the unknown by pricing this client's ORDERS at
  what the `measured` clients pay per order. Per order, not per revenue: delivery is
  priced per parcel. **State it as a bracket and never as a point estimate** — the
  peers are whoever happens to have a rate configured, and weight and box size drive
  the number. Nothing adjusts CM for it; a silent correction is indistinguishable
  from a measurement. Live at 60 days: Golf Sock books nothing at all against $7,173
  of shipping income (a 10.9-13.3k hole, 6.5-7.9% of revenue), while Lucky and Party
  Patch charge ABOVE what the measured clients pay, so their mirrored figure is more
  likely too big than too small — which is why the wording offers both readings.
- **A flat margin override bypasses the whole cost chain, fulfilment included.**
  `dayEconomics` takes `sales * marginPct` and never looks at product, delivery,
  handling or fees, so any card describing a cost must say so when `margin_pct` is
  set — "already inside contribution margin" is untrue for Grunk.
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
  with `Math.min(0, ...)`, so an all-positive client puts the grey minimum label and
  the red zero-line label within 3px of each other at x=2 and they render on top of
  one another. Only draw the minimum when `lo < -0.005`.
- **`.info-i` must reset `letter-spacing`, `font-style` and `text-transform`** — stat
  labels are uppercase and letter-spaced, and without the reset the glyph inside the
  circle is squashed and reads as broken.
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
