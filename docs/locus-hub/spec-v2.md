# Locus v2: the audit, the architecture, the substance (draft 1, 2026-10-07 evening)

Cole, after seeing phase 1: "no real substance in any of these dashboards", "it doesn't look modern", "the
entire audit of this thing top to bottom, how the tabs are laid out, where information lives, needs to be
reorganized", "the end goal is to compete against Triple Whale", "use the platform's data as the core, Triple
Whale only for attribution, with the model switch", "put the mind of myself, the strategist, the client in
your head and build the dashboard for that".

This document is the answer. Part A is the audit of what exists. Part B is the architecture. Part C is every
screen, block by block, with the stored data behind each block. Part D is the visual system (filled from
docs/locus-hub/research-dashboard-design.md when it lands). Part E is the build order. The research that
feeds it: research-platforms.md (Triple Whale, Hyros, Polar), research-email-sms.md (Klaviyo and its API),
research-dashboard-design.md, data-inventory-tw.txt (the 188 Triple Whale metrics we already store per day).

## The four rules

1. **Platform data is the core.** Spend, impressions, clicks, CTR, CPM, video metrics, reach come from Meta,
   Google and TikTok themselves. Store revenue, orders, refunds, discounts, taxes, shipping, new vs returning
   come from Shopify (through Triple Whale's store metrics today, the Shopify app tomorrow). Email engagement
   comes from Klaviyo.
2. **Triple Whale is for attribution only, and the model is a switch.** Every "revenue", "purchases", "ROAS",
   "CPA" that credits a channel, campaign or ad carries a model: Platform reported, TW first click, last click,
   full first, full last, last platform click (TW default), linear, linear all. We already store all seven TW
   models per ad per day (`tw_ad_attr`) and the platform's own figure beside them. The switch sits in the top
   bar beside the period and applies everywhere a credited number shows. The screen always says which model
   it is on.
3. **A screen answers one question without scrolling.** The first row answers it; what follows explains it;
   the bottom is the table you drill into. Every number has its compare period. Nothing is a wall of cards.
4. **Three readers, one app.** Owner (is the book making money, where is the leak), media buyer (is the spend
   working, what do I change today), strategist (what is working creatively, what do I brief next). The client
   is a fourth reader with a share link. Each screen is laid out in the order its reader thinks.

## Part A. The audit (every tab Locus has today, what it answers, what is wrong with it)

| Tab today | Answers | Verdict |
| --- | --- | --- |
| Overview | book at a glance | Thin: eight totals, a bar, a channel table, a brand table. No breakdowns, no trend per metric, no leak detection beyond "behind plan". |
| Daily Brief | the client's morning message | Not a dashboard. It is a Report. Moves to Reports. |
| Meta > Overview | spend, delivery, TW purchases, today curve, 7 vs 30 | Decent bones, no campaign or ad set level, no objective split, no frequency, no funnel (impressions to clicks to ATC to purchase), no model switch. |
| Meta > Test calls | the buyer's Monday job | Keep as is. It is a workflow screen, not a dashboard. |
| Meta > Creative | per-ad cards with Scale / Watch / Cut | Good, hidden two levels deep. Belongs in Creative for the strategist AND under Paid for the buyer. |
| Meta > Change Log | what changed on the account | Keep. |
| Google, TikTok | "not connected" + TW totals | Placeholders. Need the same skeleton as Meta, built from Google / TikTok data once connected; until then Triple Whale carries Google spend, clicks, impressions, CPM, CTR, conversions (`totalGoogleAds*`, `ga_*`, `googleAllCpa`) and TikTok spend, CPM, CTR, purchases (`tiktok*`) per day. That is enough for a real screen now, labelled "via Triple Whale". |
| Email and SMS | four tiles, live Klaviyo lists | Thin. Klaviyo's reporting API gives campaigns and flows with 31 statistics; TW gives daily email revenue, campaign vs flow share, clicks for email and SMS, revenue per email. None of it shown. |
| Store > Sales | store tiles, new vs returning, day by day | Thin. Refunds, discounts, taxes, shipping revenue, units, orders with amount, gross vs net, Amazon and TikTok Shop are all stored daily and not shown. |
| Store > Customers | LTV:CAC, cohorts, journey | Good substance (tw_orders). Keep, restyle. |
| Studio, Brand, Tests and angles, Copy desk, Creator link | making ads | Workflow screens. Keep, regroup under Creative. Tests and angles doubles as the creative scoreboard. |
| Reports, Season, Scenarios, Dashboards | documents and tools | Keep. Daily Brief joins them. |
| Profit, Plan, Costs | money and plan | Profit's waterfall is the one real P&L; it should be the Money screen's spine, not a separate tab from Overview. Costs is a diagnostic, lives under Settings > Data health. |
| Settings | setup | Keep. |

Duplicates to collapse: Overview vs Profit (same window totals twice), Meta Overview "7 vs 30" vs the compare
period, Store tiles vs Profit tiles, Customers' CAC vs Profit's CAC vs Overview's CAC (one definition already,
three screens). Four screens show "revenue" with no breakdown of where it came from.

## Part B. The architecture

Scope switch (one brand or all brands), period, compare period and **attribution model** sit in the top bar
on every screen. The rail has six groups and no sub-tabs deeper than one level:

```
HOME        Overview (the book or the brand: the read, money, pace, channels, trend, brands)
PAID        Meta · Google · TikTok · All channels           (one skeleton each: Overview, Campaigns, Creative, Tests, Changes)
EMAIL       Klaviyo (Overview, Campaigns, Flows, Audience)
STORE       Sales (orders, products, refunds, discounts, geography when Shopify is on) · Customers (LTV, cohorts, journey)
MONEY       P&L (the waterfall, costs, margin) · Plan (goals, forecast, pace)
CREATIVE    Tests and angles · Studio · Brand · Copy desk · Creator link
REPORTS     Daily Brief · Weekly and monthly · Dashboards · Season · Scenarios
SETTINGS    Brands · Connections · Data health (Costs lives here) · Team · Jobs
```

Why: a reader never has to ask "is this Meta number here or in Reports". Paid is paid, Email is email, Store is
the store, Money is the P&L. Creative is the strategist's. Reports are documents. Everything else is setup.

Roles: the buyer's rail shows Home, Paid, Email, Store, Reports. The strategist's shows Home, Creative, Paid >
Creative, Email, Store. The owner sees all. The client share link gets Home (brand), Store, Money (P&L), the
weekly report.

## Part B2. What Locus takes from Triple Whale, Hyros and Polar (from research-platforms.md)

The eighteen patterns all three share, and what each means for Locus:

1. **Compare period on every number**, green when good for the store, orange when not (Polar's rule:
   a drop in discounts is green). Already in the top bar; the colour rule is adopted.
2. **New vs returning as first-class columns**, not a filter: NC purchases, NC revenue, NC ROAS, NC CPA,
   NC AOV beside the blended ones. We have the split per order (tw_orders customer_id) and per day (TW
   newCustomersOrders / newCustomerSales / newCustomersCpa / newCustomersRoas).
3. **Attributed beside platform-reported, and the gap is a metric.** Every credited column shows the model's
   number with the platform's number ghosted and a "gap" column (model minus platform). Hyros calls it the
   Reporting Gap and the Attribution Gap; Triple Whale calls it CVD. Locus: "Gap".
4. **One blended source-of-truth row above the channel rows** (MER, blended ROAS, NCPA, net profit). Home's
   money row is that row; the channel table sits under it on every screen that credits a channel.
5. **The model is a dropdown with a window beside it, and the product tells you to compare models.** Locus:
   top-bar model switch (Platform, TW first click, last click, full first, full last, last platform click,
   linear, linear all) plus a window (1, 7, 14, 28, lifetime as TW allows; our stored rows are lifetime
   window, so the window is a later addition on the sync) and a "Compare models" view that puts two models
   side by side for the same rows (Hyros's Compare Attribution Modes widget).
6. **Click date vs order date switch.** Our attribution rows are dated by order date (deliberate, matches
   money). Click-date needs the touch date kept per order: see the sync note below.
7. **Campaign > ad set > ad, and from a number to the orders and the journey.** Needs two syncs we do not
   have yet: campaign and ad set names / objectives / budgets, and an order-to-touch table (order id, ad id,
   platform, click date, model) so a ROAS cell can open its orders and a customer can open their journey.
   `tw_orders` already holds the order and customer; the touches are aggregated away today in `tw_ad_attr`.
8. **Column presets** (Default, New customers, Paid performance, Traffic, Video) and a Columns button on
   every big table, saved per team.
9. **Custom formula metrics**: later, through the Strategist (it already has the vocabulary).
10. **Cohorts with CAC payback and a cumulative toggle**: Customers has it; add the NCPA payback month and
    the 2nd-order toggle.
11. **Email pairs engagement with revenue per recipient, campaign vs flow, under the same model switch**:
    C5, with Triple Whale's "why numbers differ from Klaviyo" table reproduced in the footnote.
12. **Creative grouped by component (image, video, copy, name) with a gallery beside the table**: C10.
13. **Anomaly alerts with a cause**: the read, plus the Strategist's nightly findings. Keep.
14. **Chat that answers in charts and can save the answer as a widget**: Dashboards (phase 2) is that.
15. **Scheduled snapshots and client-shared dashboards**: Dashboards + share links. Keep.
16. **Benchmarks as a badge beside your number**: Klaviyo's published 2026 figures first; a cross-brand
    Mobius benchmark (our nine brands) later.
17. **Sparklines on tiles**: every tile, from the stored daily series.
18. **Why the numbers differ, inside the product**: a one-line note under every credited table, and the
    Metrics glossary already in Locus.

Syncs to add for the above (account-health hourly job): Meta campaigns and ad sets (name, objective, status,
daily budget, bid strategy); order touches from the Triple Whale journeys response (we already page it; keep
`order_id, platform, ad_id, campaign_id, click_date` per touch instead of discarding them); Klaviyo daily
list and segment counts (snapshot); Google and TikTok campaign level once connected.

## Part C. The screens, block by block, with the data behind each block

Legend for sources: **TW** = a `tw_daily` metric (daily per brand, 188 ids stored since 2025-05); **META** =
`daily_insights` / `hourly_insights` / `ad_daily` / `ads` / `ad_creative` (per ad per day: spend, impressions,
reach, clicks, link clicks, outbound clicks, purchases, revenue, video 3s / thruplay / p25 / p50 / p75 / p100 /
avg watch / plays, add to cart); **ATTR** = `tw_ad_attr` (per ad per day per model: revenue, orders, platform);
**ORDERS** = `tw_orders` (400 days: order, customer id, date, total, products, source); **KL** = Klaviyo API
live by the brand's key; **ACC** = `accounts` goals, plan, targets; **ASANA** = the test library.

### C1. Home > Overview (the book, or one brand)

Reader order: owner first. "Is the book making money, where is it leaking, what do I do today."

1. **The read** (3 lines, leaks, focus) from the numbers below. Keep.
2. **Money row, 8 tiles, each with value, delta vs compare, 30-day sparkline, target marker where a goal
   exists:** Revenue (TW netSales minus totalNetTaxes), Orders (TW totalOrders), AOV, Blended spend (TW
   blendedAds), MER, New-customer revenue share (TW newCustomerSales / revenue), Cost per new customer (TW
   newCustomersCpa), Contribution margin (TW grossProfit minus fees minus spend, gated on cost health).
   Sparklines come from the same `series` the chart uses. The tile opens its breakdown below.
3. **Pace against plan** (ACC goals): revenue and spend bullet bars, planned-by-now marker, days left, the
   daily run rate needed from here.
4. **Where revenue came from** under the chosen attribution model: stacked bar + table. Rows: Meta, Google,
   TikTok, Pinterest, Amazon (TW amazon*), Email (TW klaviyoPlacedOrderSales, campaigns vs flows), everything
   else. Columns: spend (platform), revenue (model), share, ROAS, CPA, new-customer orders (ATTR + ORDERS
   source), vs compare. Model switch changes the revenue column; a "Platform reported" column sits beside it
   when the model is a TW model, so the gap is visible (Cole's main use of TW).
5. **Trend**: revenue, spend and orders by day with the compare period ghosted; toggle to MER / new-customer
   share / AOV by day. Hover crosshair with every line's value.
6. **Site funnel** (TW pixel): sessions, cost per session, add-to-cart sessions, cost per ATC, conversion rate,
   purchases, by day (TW pixelCostPerSession, pixelCostPerAtc, pixelPurchases; sessions derived). This is the
   "why" behind a revenue move that the money row cannot show.
7. **Agency view only: one row per brand** with the money row compressed, pace, cost health, and a
   "needs a decision" stripe; sorted by what moved most against compare.

### C2. Paid > Meta (the skeleton every platform gets)

Reader: media buyer. "Is the spend working, what do I change today."

Top: the attribution model switch is prominent here. Default TW last platform click; "Platform reported"
one click away.

**Overview sub-screen**
1. Verdict line: spend vs budget pace, CPA vs goal, ROAS vs goal, in words.
2. Tiles: Spend (META), Purchases (model), Revenue (model), ROAS (model), CPA (model), CPM (META),
   CTR (META link clicks / impressions), Frequency (META impressions / reach), each with delta and sparkline,
   target marker from ACC target_cpa / target_roas.
3. Today vs a normal day (the hourly curve, `hourly_insights`), keep.
4. **Funnel**: impressions → link clicks → add to cart (ad_daily add_to_cart) → purchases, with rates and cost
   per step, this period vs compare. This is what a buyer reads to find the broken step.
5. **By campaign / ad set / ad** table (META joined to ATTR by ad_id; campaign and ad set from `ads`): spend,
   purchases, revenue, ROAS, CPA, CPM, CTR, frequency, hook, hold, add to cart, vs compare, inline bars;
   expand a campaign to its ad sets, an ad set to its ads. Platform-reported purchases shown as a ghost column.
6. Spend by day stacked by campaign (where the money went this week).

**Campaigns** = the table above full-screen with filters (objective, status, name search) and saved sorts.
**Creative** = the existing creative browser (cards, Scale / Watch / Cut, hook / hold / CTR), plus a
"by format" and "by angle" rollup (ad name tags + ASANA angle). **Tests** = Test calls as is. **Changes** =
Change Log as is.

### C3. Paid > Google and TikTok

Same skeleton. Until the direct connections exist, every block is fed by TW's platform rows and labelled
"via Triple Whale": Google spend (ga_adCost), impressions, clicks, CPM, CTR (totalGoogleAds*), conversions
and CPA (googleAllCpa), platform ROAS (ga_ROAS) beside the TW model revenue (ATTR platform = google);
TikTok spend, impressions, CTR, CPM, purchases, CPA, ROAS (tiktok*). What the direct connection adds is one
line at the top (campaign types, search terms, product groups), not the whole page.

### C4. Paid > All channels

The channel table from Home at full depth: every platform row with spend, revenue under the model, platform
reported, share of revenue, ROAS, CPA, new-customer share, vs compare; spend mix stacked by day; a "where to
move the next dollar" line from marginal ROAS (the read).

### C5. Email > Klaviyo

Reader: retention strategist / owner. "Is email pulling its weight, which flows and campaigns, is the list
healthy." Built from research-email-sms.md "The screen a strategist would want":

1. Tiles: Email + SMS revenue (TW klaviyoPlacedOrderSales), share of store revenue, campaigns revenue and
   share (TW campaigns), flows revenue and share (TW flows), revenue per recipient (KL), list net growth (KL
   list profile counts, snapshotted daily by the worker).
2. Stacked daily chart: campaigns vs flows revenue by day (TW, both on the same date basis), with sends
   overlaid (KL).
3. Campaigns table (KL campaign-values-reports, last 90 days): sent, delivered, open, click, placed order
   rate, revenue, revenue per recipient, unsubscribe, spam; benchmark pills from Klaviyo's published 2026
   averages.
4. Flows table (KL flow-values-reports): core flows first (welcome, abandoned cart, browse, post purchase,
   winback), recipients, conversion rate, revenue, revenue per recipient, recovery rate for abandoned cart.
5. Audience strip (KL): list sizes, segments, subscribed vs unsubscribed this period (TW subscribed /
   unsubscribed recipients), SMS opt-ins.
6. Deliverability detail collapsed (KL): bounce, spam, unsubscribe against Klaviyo's thresholds.
Rate limit: 225 reporting calls a day per account, so the worker caches each report per brand per period.

### C6. Store > Sales

Reader: owner, client. "What did the store do."

1. Tiles: Revenue, Orders, AOV, Units (TW totalOrdersCombinedItemsQuantity), Refunds (TW totalRefunds),
   Discounts (TW: gross minus net less refunds), Shipping revenue (TW totalShippingPrice), New vs returning
   revenue, each with delta and sparkline.
2. Gross to net bridge: gross sales → discounts → returns → net → shipping → taxes → total, this period vs
   compare (every line is a TW metric already stored).
3. Day by day with compare; toggle revenue / orders / AOV / new share.
4. Hour by hour for today / yesterday (keep).
5. Channels of the store: Shopify online, Amazon (TW amazon* incl. fees, refunds, FBA vs FBM), TikTok Shop
   (TW totalTiktokShops*), POS when present.
6. Products (ORDERS products_json ranked by first-cart presence now; exact units and revenue per product
   once the Shopify app is installed), with "needs the Shopify app" said once.

### C7. Store > Customers

Keep the substance (LTV at 30 / 60 / 90 / 180 / 365, cohorts with CAC and LTV:CAC, repeat rate, time to second
order, first vs next product, sources). Restyle: cohort triangle as a heat table, the curve as a proper chart
with the compare cohort ghosted.

### C8. Money > P&L

The Profit waterfall as the spine: revenue → product cost → shipping cost → handling → payment fees → gross
profit → ad spend → contribution margin, this period vs compare, each line a TW metric, margin % beside each
step, cost-health verdict inline. Then margin by day, worst days named, the flat-margin override shown as a
banner when in force. Then "what a dollar of revenue became" (100% stacked bar).

### C9. Money > Plan

Keep (goals, forecast, retrospective decomposition). Add the pace bullet bars from Home so Plan and Home never
disagree.

### C10. Creative > Tests and angles

Keep the scoreboard; add the creative rollups: by format (ad name tag), by angle (ASANA), by hook (Meta hook
rate), each with spend, CPA, ROAS under the model, winners count. This is the strategist's home.

### C11. Reports

Daily Brief (moved here), Weekly and monthly, Dashboards, Season, Scenarios. No change to substance.

## Part D. The visual system (from research-dashboard-design.md, section 5)

Ten decisions, each sourced in the research doc:

1. **Neutral**: a 12-step warm graphite scale. Dark app background about #141416 (never black), card one step
   up, the rail one step dimmer than content. A true light theme with the same twelve jobs (near-white
   canvas, white cards, near-black text), not an inversion.
2. **Accent**: one chromatic accent for chrome and the current series only (focus, selected tab, primary
   button, the current period's line). Never good / warn / bad meaning. Desaturated in dark mode. The blue
   rail is gone: the rail is graphite.
3. **Semantic**: good green, warn amber, bad red, info blue, always with an arrow, sign or label. Metric
   polarity decides the colour (CPA down is green). Never cell backgrounds across a table.
4. **Categorical**: one fixed channel sequence (Meta, Google, TikTok, Email, Amazon, Everything else), medium
   intensity, same order on every screen.
5. **Sequential** one hue pale to dark (cohorts); **diverging** blue and red around neutral (profit vs loss).
6. **Type**: Inter, with Inter Display for hero numbers and titles; tabular lining numerals on every number;
   a mono only for ids and queries. Body 13px / 1.4, labels 12px minimum, tile values 28 to 32px, the hero
   number up to 40px. Weights 450 / 550 / 650 / 700, nothing lighter.
7. **Tile anatomy**, one component everywhere: label top left (definition on hover), value, delta chip with
   arrow and sign and "vs prev 30d", sparkline with the compare period ghosted and an end dot, a bullet bar
   under the value when a target exists (actual heavy, target tick, pace hatched), the whole tile a drill link,
   fixed height across states. Two sizes: compact and full.
8. **Grid**: 12 columns, 24px gutter and margin, tiles at 3 / 4 / 6 columns, 8px row unit, chart heights 180px
   in tiles and 320px on screens. The top stratum fits 1440 x 900 without scrolling: control bar, insight
   strip (max three), one row of tiles, one chart plus table or one small-multiples row.
9. **Density**: dev-tool density. Tables 48px rows (40 condensed, 56 relaxed), right-aligned numbers,
   pinned first column, sticky header, six to eight default columns and a column chooser, never sideways
   scroll. Card padding 16 to 20px, section gap 32px, white space instead of rules. Few icons, no coloured
   icon backgrounds.
10. **Charts**: current period in the accent at 2px, compare period grey dashed, no area fill by default,
    three or four horizontal gridlines, no vertical gridlines, bars start at zero, direct labels at line
    ends, one shared hover tooltip with current / compare / delta, a one-line finding as the chart heading,
    inline bars in tables on one scale, cohort tables as one-hue heatmaps. Never pies, donuts, gauges, 3D,
    dual axes, rainbow categories.

Three templates:
- **A. Overview** (Home per role, client view): insight strip, the read, the hero number top-left (owner:
  contribution margin or revenue; buyer: blended CAC or MER; strategist: creative win rate) with delta,
  sparkline and the pace bullet, four to five supporting tiles, the main 320px chart with the compare period
  ghosted and channel toggles, a small-multiples row per brand on a shared scale, and only below the fold the
  brand table and the channel stack with its table.
- **B. Platform** (Meta, Google, TikTok, Email, Store): the control bar adds the attribution model and window
  and repeats them as a caption on every chart; a tile row (spend, revenue, ROAS, CPA, purchases, polarity-aware);
  chart plus table (stacked bars on top, breakdown table under it with inline bars, same colours, totals row,
  drill campaign > ad set > ad); the creative grid for creative-heavy platforms; for email, revenue per recipient
  as the hero with flows vs campaigns side by side and benchmark bands on bullet bars.
- **C. Detail / table** (Customers, orders, dashboards, any drill): the control bar carried over from the tile
  that opened it, a compact summary row, one chart or a cohort triangle, the full-width table with saved
  views named after questions, filter chips, CSV export; a row click opens a side panel, not a new page.

Shell: collapsible graphite rail, one-row sticky control bar (range, compare, scope, attribution model), a
Cmd/Ctrl K command and ask box, the Strategist docked as a right-hand panel that knows the screen and period.

## Part E. Build order

1. Visual system + the two mocks (Cole approves).
2. The top bar: scope, period, compare, attribution model (worker: `/api/overview` and the Meta routes take
   `model=`; `tw_ad_attr` already holds every model).
3. Home at full depth (C1), then Paid > Meta Overview and the campaign table (C2), then Store > Sales (C6),
   P&L (C8), Email (C5), Google / TikTok via TW (C3), All channels (C4), Customers restyle (C7), Creative
   rollups (C10). Daily Brief moves to Reports on day one.
4. Shopify app installs (products, refunds by product, geography) and Google / TikTok direct connections
   land when Cole's setup is done; the screens are built to take them without a redesign.
