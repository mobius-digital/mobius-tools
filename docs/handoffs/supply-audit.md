# Supply into Locus: step 1, the audit (2026-10-08)

Status: waiting for Cole's sign-off. Nothing designed or built yet.

## What the record says about use

- 154 saved changes in total. Almost all on Sep 11-12 (build and QA). Cole's own use: Sep 21 only (one drop "Winter 2027", 7 polo designs, 3 product tweaks). Nothing since.
- Orders: one purchase order (PO-0001, WST), typed in from the factory's sheet, not made in Supply. "Create order" has never made a real order.
- The Buyer: 4 questions on Sep 23, then nothing.
- Slack (#lucky-ops): the 6am digest posts every day with the same top items for four weeks, no replies or reactions.
- A second, older alert ("Reorder point crossed", the old Restock logic) still posts from the engine and disagrees with Supply (it asked to reorder Carver 01 Gold while that is on PO-0001).
- The digest has said "Lucky Tour Glove is out, order now" since Sep 9, but 500 gloves are on WST's PI 104, which was never logged (it needs a hand x size split). The other WST lines (PIs 103, 104, 105) are also unlogged. A false alarm repeated daily trains people to ignore it.
- Lineup: 7 polo designs in Winter 2027 (on site Mar 1 2027), all "Needs a brief", all with Asana tasks.

## Screen by screen

| Screen | What it is for | Used | Call |
|---|---|---|---|
| Today | Four headline numbers, the week's decisions, landing soon, stock by category | Opened, not acted on | MERGE into Stock. Numbers become Stock's top tiles, decisions become its rows. Stock by category: cut. Landing soon: goes to Orders. |
| Reorder | Products grouped by factory, 10 filter chips, tick and create an order, CSV | Not used for an order | MERGE into Stock (it is the core of Stock). 10 chips become 3 (Running out, Order now, Too much stock) plus search. Factory stays as the group heading with its order window. CSV: cut. |
| Create order drawer | Quantities by size or loft, fill to minimum, copy the order text, draft or sent | Never | KEEP, as the one way to log an order, opened from Stock or Orders, prefilled with the suggestion. Drop the separate "Log an order you already sent" path. |
| Orders | Purchase orders, stages, received counts, deposit, tracking, landing detection | 1 order | KEEP as the Orders page. Filters Open and Landed only (drafts sit in Open, tagged). Each row gets its sent-to-lands bar (from Timeline). |
| Forecast (page) | Every product in one table | Rarely | CUT the page. It is Stock with "Everything" on. |
| Product sheet | Shelf chart with try-an-order, why X a week, sizes, 90-day sales, kind of product, line, minimum, lead time | Some | KEEP as the panel any product opens. One chart: past 90 days of sales left of today, the shelf forecast right of it, the what-if inline. |
| Performance | Category, lines table, ranked designs with cut band, size curve, insights | Not used | CUT the page. Too-much-stock goes to Stock; size curve goes in the product panel; the ranked keep-or-cut list goes to Lineup. |
| Lineup plan, by drop | Drops, designs, stage from Asana, owes next, where it is, claim loose Asana cards | Used (Sep 21) | KEEP as the Lineup page. |
| Lineup plan, by line | Keep or cut per design, target, open slots, cost of the next order | Not used | MERGE into Lineup as one "Keep or cut" card per line that has a target (Polos, Hats). |
| Design panel | Name, stage, drop, Asana, sample tracking, attach the Shopify product, six dates | Some | KEEP. |
| Timeline | Gantt of orders, orders to place, designs; dates-to-hit list; factory closures | Not used | CUT the page. Dates live on each design and order; a "Next due" strip tops Lineup; closures warn on any date that falls in one. |
| Settings: categories and lines | Line tree, sorting Shopify product types | Setup only | MOVE to brand settings, Stock and factories. Categories: cut (only used to group pages being cut); lines stay. |
| Settings: factories | Lead times, minimums, order cycle, closures | Setup only | MOVE to Stock and factories. |
| Settings: kinds of product | Lifecycle table for every product | Setup only | CUT the page. Set it in the product panel ("It was a one-off" stays as a one-click button). |
| Settings: rules | 9 numbers | Setup only | MOVE. Show 4 (buffer, coverage, landing to on site, dead after); the 5 design-timing numbers fold under one "Design timing" row. |
| Settings: Asana | Project, checklist | Setup only | MOVE the project to the brand's Connections. Checklist: cut (empty by default, never used). |
| Settings: Slack and data | Digest channel, hour, mode; snapshot, 2-year backfill, changelog | Setup only | Digest to brand settings, Slack and sending. Snapshot and backfill to Data repairs. Changelog screen: cut (the data stays). |
| The Buyer | Supply's own assistant | 4 questions | RETIRE into the Strategist: a stock view plus its actions (log an order, mark a product, add a design). |
| Tour, How Supply decides, sign-in | | | CUT. Locus reads its tour off the page; "how it decides" becomes the Help brief. |
| ?slot= links | The link inside every Asana design task | Live in 7 tasks | KEEP working: redirect to the design in Locus Lineup. |
| Brain, engine, D1, hourly Shopify check, landing detection | | Daily | KEEP unchanged. |

## Slack

- Kill the old "Reorder point crossed" alert.
- Digest: recommend Monday only, plus a same-day post when something NEW crosses (a product newly runs out or a new order date passes). Not the same list every morning.

## Questions for Cole

1. Digest: Monday plus new-only alerts (recommended), or keep daily?
2. Log the unlogged WST orders before the move, starting with the 500 gloves (needs the hand x size split from WST)?
