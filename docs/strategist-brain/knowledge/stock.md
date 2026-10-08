# Stock and inventory for a DTC brand that advertises

Scope: how stock decides what the ads can do (scale, ease off, push), how run-out and order dates are worked out, factory lead times and minimums, overstock, pre-orders, Black Friday stock, and, on brands we buy for (Lucky Golf), what to order and when. Read with `offers-pricing.md` (clearing overstock is an offer question) and `meta.md` (the ad set is the unit a stock call lands on).

The rule behind this file: **an ad decision that ignores stock is half a decision.** Scaling a product that runs out before its restock lands buys an empty shelf and a stalled campaign; ignoring a product with a year of stock leaves cash tied up that the ads could release. Stock is a constraint on every scale call and an opportunity on every overstocked line.

---

## 1. How it works now (2025 to 2026)

- **Where the numbers come from.** Locus reads each brand's Shopify stock every hour through Supply (the Mobius Digital Shopify app; Lucky Golf today, other brands as they install it). Supply keeps 800 days of daily sales and stock per size. The Strategist reads it through the `stock` view; never estimate stock from orders or Triple Whale.
- **Which products an ad sells** comes from Triple Whale orders, not ad names: for each Meta ad, the orders it drove under last platform click in the last 30 days, the Shopify products in those orders, and the ad's 30-day spend shared across them. On Lucky about 80% of Meta spend ties to a product this way. Ad names (creator names, shoot numbers) cannot be matched reliably.
- **Sell rate per size** blends the last 14, 30 and 90 days (45, 35, 20 percent), ignores days a size was sold out, and caps a promo spike at twice the 90-day rate. A size that was off the shelf most of the window takes its demand from the group's size mix instead of its last two sales.
- **Status is judged on the core sizes** (the sizes carrying 80% of a product's sales). A product is "out" only when the empty core sizes carry half its sales; one empty tail size is a size gap note. **Run-out follows the first core size to empty**, so a product can "run out" while the total shelf still holds units of other sizes. Example: Lucky's Carver 02 Black had 615 units on Oct 8 but the 52 degree right hand ran out Nov 27, so the product was short from Nov 27 even though 600 units sat in other lofts.
- **Order by** = run-out minus (factory make days + ship days + buffer). "Order now" = order-by within two weeks or passed; "coming up" = the 60 days after that. **Suggested** = enough to cover 180 days after landing, less on hand and on the way, split by size from the group's size mix.
- **On the way** counts only placed orders (not drafts). Landing is detected when Shopify stock rises by about half of what is outstanding.
- **Factories close.** Chinese New Year shuts most Asian factories for about two weeks (2027: Feb 6 to 20, about Feb 17 is the holiday); production stops and lead times stretch by the closure plus a ramp-up week. Orders for spring drops have to be placed before it.
- **Black Friday is a stock event before it is an ad event.** Black Friday 2026 is Nov 27, Cyber Monday Nov 30. Run-out dates use the last 90 days' pace; Black Friday week usually sells two to four times a normal week, so anything that runs out in early December at today's pace runs out during Black Friday week.

## 2. Decision rules

### The three ad calls (the `ads_call` field)
- **Ease off**: out now, or under 30 days of stock with no restock landing first, or runs out by Cyber Monday with no restock landing first. Move budget to products with stock; if the restock is placed, hold the budget until it lands or sell the gap on pre-order.
- **Safe to scale**: 90+ days of stock, or a restock that lands before the run-out. Room to spend more.
- **Push to clear**: more than 52 weeks of stock at today's pace, or 20+ units with no sale in 90 days. Candidates for a bundle with a best seller, an offer, or an ad test; never a reorder.
- **Watch**: between 30 and 90 days, no Black Friday risk. Fine now; it moves to ease off if the restock is not placed in time.

### Scaling with stock
- Before raising budget on an ad set, read which product its orders are (the stock chip on the ad set says it). A 20% budget step on an ad set selling a product with 25 days of stock pulls the run-out about 4 days earlier at the same conversion rate.
- Never scale the anchor ad of an ad set whose product runs out before its restock; replace the product in the creative or move the budget.
- A product that is short (a core size out) still sells the other sizes, but conversion drops on the product page; expect CPA to rise 15 to 40% while a core size is empty.

### Black Friday stock
- At risk = run-out (first core size) on or before Cyber Monday with no order landing first. Name each, its run-out, its restock, and its ad spend. A restock that lands after Nov 20 is too late to photograph, list and push for the early access window.
- If a hero product is at risk and the restock cannot land in time: lead the Black Friday creative with products that have stock, or sell the hero on pre-order with a ship date.

### Ordering (brands we buy for)
- One order per factory: group by factory, then by order-by date.
- When the suggestion is under the factory minimum: if the minimum is under two years of sales, order the minimum; if over two years, skip it or mark the product a one-off (a limited drop never asks for a reorder).
- Past-due orders cost sales every week: about the weekly sell rate of the product in lost units, at today's price.
- Leave sizes with no sale in 90 days out of the order (tail sizes are where dead stock comes from).

### Drops and new designs
- A group with more than a year of stock gets no new designs until it clears; push the slow ones instead.
- Keep or cut: the bottom 25% of a group by 90-day sales is the cut zone; cut designs stop reordering and sell down.
- Dates work back from the drop's on-site date: on site minus 14 days of photos and listing = lands; minus shipping and making and buffer = order placed; minus 10 spare days = sample approved; minus 21 days of factory sampling = tech pack; minus 14 days of design = brief.

## 3. Diagnostics

- **"Revenue fell, ads look the same."** Check stock first: a hero product with an empty core size cuts conversion before it shows as "out". The stock view's first_size_out names it.
- **"CPA jumped on one ad set."** Read the product its orders are; if it is ease off, the ad is selling into an empty shelf.
- **"A product sells less every month."** Weeks of stock rising and sell rate falling together = demand, not stock. Weeks of stock falling and sell rate flat = a restock is due.
- **"Stock says out but Shopify shows units."** The units are tail sizes (or another hand/loft); the core sizes are empty.
- **"An order should have landed."** Factory orders past their landing date show as late; a stock jump without a confirmed order shows as "looks landed".

## 4. How stock affects the other channels

- **Meta**: the ad set is the unit; a stock-out on the ad set's main product drops its conversion rate, Meta's learning resets when budget is cut, so prefer moving budget early over cutting late.
- **Google Shopping and PMax**: an out-of-stock product drops out of Shopping results (the feed carries availability); branded search for it still spends. Pause product-specific search ads when the product is out.
- **Email and SMS**: a back-in-stock flow captures demand during the gap; a restock is also the best email of the month for a hero product.
- **Offers**: overstock is the cheapest offer to fund (the units are already paid for); a bundle of an overstocked product with a best seller lifts AOV without discounting the best seller.
- **Retention**: a customer who finds their size out twice does not come back; size gaps on core sizes hurt repeat rate more than a whole product being out.

## 5. What a great suggestion looks like

- "Black Wedges | Still spent $1,429 last week. 45 of its orders are Carver 02 Black, whose 52 degree right hand runs out Nov 27 and nothing is on order. Place the Club factory order this week (681 units, about $16.6K at cost, lands Jan 16) and until then move 20% of this ad set's budget to the Eclipse Mallet set (8.3 a week, 6+ months of stock). Watch: the Mallet set's CPA for 7 days; it should hold within 15% of today's."
- "Hats hold 253 weeks of stock. Do not brief new hats for the next drop. Test a hat-with-any-wedge bundle in the Black Friday offer: it releases about $3K of stock at cost without discounting the wedges."
- "Carver 02 Gold is empty Nov 3 to Nov 11 (the order lands Nov 11). Put the 'ships Nov 11' line on the product page and keep the ads on; pre-orders over an 8-day gap keep the ad set learning."

## 6. Traps

- Reading total units as stock when a core size is empty.
- Treating a draft order as stock on the way.
- Recommending a reorder of a limited drop, or a reorder of a product with a year of stock.
- Forgetting the factory closure when a date is close to Chinese New Year.
- Using today's pace for Black Friday week without saying it is low.
- Quoting ad spend per product from ad names.

## 7. Sources

- Locus Supply brain (supply/worker/src/brain.js) and the plan in docs/handoffs/supply-into-locus-plan.md.
- Lucky Golf live data, Oct 2026 (Supply state and Triple Whale order attribution).
- Chinese New Year 2027 dates (Feb 17, factories typically closed about two weeks around it).
- Inventory Planner and Stockie documentation on replenish dates, stock cover and purchase orders from the forecast (help.inventory-planner.com, stockie.helpscoutdocs.com).
