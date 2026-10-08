# Audit of the Supply-in-Locus mock (2026-10-08)

Cole asked: is this good UI and UX, good visually, does it fit the goal, would
he, the team and a client understand and use it, and did I research what the
top tools do. Honest answers below, then next steps.

## Did I research the category first? No. Done now.

What the live tools do (Cogsy and Stocky were both shut down in 2026, which
says something about standalone stock tools; Inventory Planner, Prediko and
Stockie are the references):

- **Inventory Planner (Sage)**: one big replenishment report, grouped by
  vendor, with a "replenish date" (the last day to order without running out),
  "sells out in", "stock cover", units on order, a recommended quantity, and
  the revenue lost if you do not buy in time. Overstock report with days since
  last sale and carrying cost. Reviewers: accurate, "overwhelming for teams
  without a dedicated analyst", pricey.
- **Prediko**: a "buying table" with 90+ metrics and 100+ filters, PO
  creation in bulk, Black Friday planning, raw materials. One reviewer: space
  inefficient, single-letter column headers.
- **Stockie**: forecast table with two tabs, By product and By supplier; every
  PO starts as a draft; once marked Ordered it counts as incoming and the
  forecast stops suggesting it. Exactly our model.
- **Cogsy (dead)**: the best idea in the category. The dashboard was two
  buckets, "Replenish Now" (runs out before a new order could land) and
  "Replenish Soon" (next 30 days), a 12-month stock heatmap, a working
  capital timeline, and a marketing calendar overlay so a planned promotion
  lifted the forecast. The Shopify-first tool, and it still died.
- **Apparel product development**: the industry tool is the "time and action"
  calendar (critical path worked back from delivery, with slippage flagged).
  Our Drops page IS that, with the dates derived instead of typed.

What the category gets wrong, which we should not copy: the dense table as
the home screen. Every tool leads with a 10 to 90 column grid and sells
filters on top. The buyer's question is not "show me every metric", it is
"which order do I place this week".

## Verdicts, screen by screen

### Stock

- **Visually**: consistent with Locus v2, reads as the same product. But it
  is a 10-column table; at 1440px it fits, on a laptop the two columns that
  matter most (Order by, Suggested) are off the right edge. Row notes wrap to
  three lines (Carver 02 Gold) so rows are uneven. The headline is a
  paragraph; nobody reads a paragraph every Monday. Tile labels wrap badly.
- **UX**: it answers the question, but by making the buyer read 14 rows and
  pick. The real unit of decision is the factory order, not the product: Cole
  places one order per factory. The page should lead with "Club factory:
  order due now, 7 products, 1,254 units, about $31K, lands Dec 17 if placed
  today" with its products inside and one Build button. Cogsy's two buckets
  were the same idea; per factory is better for Lucky.
- **A wrong suggestion**: "Lucky Tour Glove, suggested 62, under minimum
  500". The screen hands the conflict to Cole. The brain should resolve it:
  "the minimum is 500, that is 5.6 years at today's pace: order 500 anyway,
  or say it was a one-off". Same for grips (26 vs 100). Half of Lucky's
  "to order" rows are this case.
- **Stale guilt**: seven products say "was Jul 30" or "was Aug 9". After two
  months that label is noise. Past due should say what waiting costs: "every
  week waiting is about 5 lost sales" (the brain already has lostUnits).
- **The glove is a false alarm** (500 on an unlogged WST order). Not a mock
  problem, but the page would be lying on day one.
- **Too much stock** folded to one line: right call, keep.
- **All products** view: fine, standard, matches Inventory Planner's report.

### Product panel

- The one-chart idea (sales to the left of today, shelf to the right, the
  what-if drawn on it) is better than anything in the category: nobody
  shows past and future on one axis. Keep it.
- "Sold each day" bars are tiny next to the shelf scale. Acceptable.
- By size table: good. "tail", "from size mix" need a one-line explanation
  on hover (the glossary).
- "How we treat it": good, but "Core: always on the shelf" is the only kind
  most people should ever touch; fine.
- Pre-order callout: good, useful, and no tool in the category does it.

### Factory orders

- Simple, understandable by anyone, matches Stockie's model. The progress
  bar is the one thing a client would look at. Keep as is.
- Missing: the cash view. An owner wants "what do I owe the factories and
  when" (deposit paid, balance due at shipping). Cogsy's working capital
  timeline was this. Add later: deposit and balance as money, not free text.

### Drops

- The concept is right (the time and action calendar with derived dates).
- **Next due is noise**: seven identical cards "Brief due Oct 23" because
  all seven polos share a date. Group by date and drop: "Winter 2027: 7
  briefs due Oct 23".
- The designs table scrolls sideways at 1440 and the "Where it is" column
  is truncated. Too many columns for the information: Stage and Owes next
  can be one cell; Where it is only matters once a product exists.
- Keep or cut product names truncate ("Nightshade Cl...").
- **A contradiction the page does not see**: the Hats card proposes 4 new
  hat designs while the Stock page says the hats have 4 to 8 YEARS of
  stock. A line with over a year of stock should say "no new designs until
  this clears" on its keep-or-cut card. That is the kind of judgement Cole
  wants the tool to make.
- Placeholder names "Winter 2027 · Polo 1" look sterile but are honest; a
  design gets its name when it has one.
- Mojibake ("Â·") in the local file preview only: the artifact carries a
  charset. Add the meta anyway.

### Brand settings, Stock and factories

- Fine. Plain words, few numbers. The two Slack switches are clear.

## Would each reader understand it?

- **Cole**: yes, and faster than the old app. The order-per-factory
  reframe makes it a 2-minute Monday.
- **The team (Ahsan, Noma, Ravo)**: they do not buy stock. They should never
  need to open Stock; they need the "runs out Nov 2" chip on an ad set and a
  sentence in the Strategist's answer. That part is step 4 and is the part
  that matters to them.
- **A client**: Factory orders and the four tiles, yes. "Short before it
  lands", "sell-through", "weeks of stock", "cut zone" need the glossary
  hover every other Locus tile has. Drops is Cole's page; a client brand
  with its own designer would use it the same way.

## Does it fit the goal?

The goal was "what do I need to order, how many, by when, in one place".
The mock answers it but still as a table to read. Reframing the home list
around the order to place, resolving suggestion-vs-minimum in the brain,
and letting the stock numbers talk back to the design plan would make it
the tool the category does not have: fewer things, phrased as decisions.

## Next steps (in order)

1. Stock home list = one card per factory order to place (due date, product
   count, units, cost, lands-if-placed-today, Build), products inside with
   SIX columns: product + status, on hand, a week, runs out, order by,
   suggested with cost under it. On the way and minimum move into the row
   note. Past due says the weekly cost of waiting, not the old date.
2. Brain: when suggested < minimum, the suggestion becomes the minimum with
   "N years at today's pace" and a one-click "It was a one-off".
3. Drops: group Next due by date and drop; merge Stage and Owes next; hide
   Where it is until a product is attached; a line with 52+ weeks of stock
   gets "no new designs until it clears" on its keep-or-cut card.
4. One-line headline on every page; fixed tile labels; glossary entries for
   every term; charset meta; the design-name column wide enough.
5. Factory orders: deposit and balance as money with due dates (later, not
   in the first build).
6. Re-mock (one revision) for Cole, then build.

## Sources

- Inventory Planner replenishment report: https://help.inventory-planner.com/en/articles/589017-replenishment-report
- Inventory Planner, when stock runs out: https://help.inventory-planner.com/en/articles/3152493-how-can-i-see-when-my-stock-will-run-out
- Inventory Planner 101: https://help.inventory-planner.com/en/articles/3456738-inventory-planner-101
- Inventory Planner reviews: https://www.attnagency.com/blog/inventory-planner-shopify-review , https://www.g2.com/products/inventory-planner/reviews
- Prediko: https://apps.shopify.com/prediko , https://prediko.io/blog/shopify-inventory-forecasting
- Stockie, POs from the forecast: https://stockie.helpscoutdocs.com/article/128-creating-purchase-orders-from-your-forecast
- Cogsy dashboard (archived help) and shutdown: https://help.cogsy.com/article/iw58ajr2mb-dashboard-overview , https://maypleglobal.com/cogsy , review https://eightx.co/blog/compare/reviews/cogsy-for-ecommerce-review
- Stocky shutdown: https://help.shopify.com/en/manual/products/inventory/stocky/inventory-management/demand-forecasting , https://www.finaloop.com/blog/stocky-discontinued-in-2026-what-shopify-merchants-should-do
- Time and action calendar: https://apparelresources.com/business-news/manufacturing/great-knowledge-divide-time-action-calendar/ , https://uphance.com/blog/apparel-production-calendar-that-holds/
