# Supply into Locus: step 1, the audit (2026-10-08, revised)

Status: waiting for Cole's sign-off. Nothing designed or built yet.

Cole's steer after the first pass: judge on what is NEEDED, not on what has
been clicked. Lucky Golf is where products get made and judged; other brands
need the stock knowledge but not the making. Build as if any brand could make
products, switch it on per brand.

## The two layers

**Layer 1, Stock (any brand whose Shopify stock we can read).**
The buyer's three questions: what runs out, how many to order, by when. Plus
what is on its way and what is sitting dead. Pages: Stock, Orders. Settings:
suppliers and rules.

**Layer 2, Make (a brand that designs its own products; Lucky today).**
Everything about new products: drops, designs, Asana, keep or cut, assortment
targets, samples, design timing. Page: Lineup. Settings: design timing, Asana
project. Shown only when the brand setting "Makes its own products" is on.

A brand with neither gets none of these pages. Lucky gets both.

## Why the use record still matters (one paragraph)

Cole used the app once (Sep 21, the Winter 2027 drop). The daily Slack post has
listed the same items for four weeks, nobody reacts. It says the Tour Glove is
out and must be ordered, but 500 gloves are on an unlogged WST order. The old
"Reorder point crossed" alert still posts and contradicts Supply. The lesson is
not "cut Stock", it is: the thing was too spread out to open, and an alarm that
cannot be cleared stops being read. Both are fixed by the shape below.

## Layer 1: what a buyer needs, feature by feature

| Feature | Needed? | Where it goes |
|---|---|---|
| One list of products that need a decision, sorted by order-by date | Yes, the core | Stock page, default view "Needs a decision" |
| Statuses: Out, Order now, Stock gap, Coming up, On the way, Fine, Not selling, Needs a factory | Yes, but 8 chips is too many | Three groups on Stock: Running out (out, order now, gap, coming up), Too much stock (dead, 52+ weeks of cover), Fine. Status still shows on the row |
| Every product with sold 90d, sell-through, weeks of stock, trend, dead units | Yes: this is the "what sells" analysis every brand wants | Stock page, second view "All products", sortable. Replaces the Forecast page AND the product half of Performance |
| Grouping by factory with its order window | Partly. Factory heading yes (one order per factory). Order cycle window: cut, it invents urgency | Stock rows carry the factory; Create order groups by it |
| Suggested quantity (cover 180 days after landing, less on hand and on the way, split by size) | Yes | On the row and in Create order |
| Fill to minimum by size curve | Yes | Create order |
| Product panel: shelf chart with try-an-order, why this rate, sizes, 90-day sales | Yes, this is where the quantity gets decided | The panel any product opens. One chart: 90 days of sales to the left of today, the shelf to the right, the what-if inline |
| Pre-order reminder when a gap is unavoidable | Yes for Lucky (keep selling sold-out polos) | One line in the product panel. Not building Shopify pre-order switching |
| Kind of product: core, seasonal, limited drop, winding down, discontinued | Yes, it is how a false alarm gets cleared | Product panel, plus the one-click "It was a one-off" on a Stock row. Drop "seasonal" until the brain has seasonality (needs a year of history); 4 kinds |
| Size curve learned from sales, override by hand | Yes, sized reorders need it (belts, gloves, polos) | Product panel shows it; override in Stock and factories, per group |
| Product groups (lines) from Shopify product type | Yes, the size curve and the factory hang off them. Most brands never touch them | Stock and factories, auto from product type, Unsorted prompt stays |
| Categories (Clubs, Apparel, Accessories) | No, only grouped pages that are going away | Cut |
| Factories: lead time, minimum, closures | Yes, order-by depends on them | Stock and factories. Production + shipping shown as one lead time with the split inside. Closures stay (CNY adds weeks) |
| Order cycle per factory | No | Cut |
| Rules: buffer, coverage, dead after, landing to on site | Yes, 4 numbers | Stock and factories |
| Rules: watch window, reliable days | No, nobody will tune them | Fixed in code |
| Create order drawer: quantities by size, send date, expected landing, note, draft or sent, copy the text | Yes, the one way an order is made | Opened from Stock (ticked rows) or Orders (+). Prefilled with the suggestion. Draft = "building", for orders assembled over a week |
| "Log an order you already sent" as a separate path | No | Cut; Create order with a past send date is the same thing |
| Orders: list, stages, lines, received counts, landing detection | Yes | Orders page. Stages: Placed, In production, Shipped, Landed (Cole's four). "Confirmed" and "Partly landed" stop being stages; partly = Landed with received < ordered, the rest stays on the way |
| Deposit, tracking, notes on an order | Yes, light | Order panel |
| Sent-to-lands progress bar | Yes, it answers "when" at a glance | Every Orders row (taken from Timeline and Today) |
| Today's four tiles: to order, on the way, revenue at risk, dead stock | Yes, as the top of Stock | Stock header tiles, each opens its group |
| Stock by category bars | No | Cut |
| Timeline gantt | No as a page | Order bars on Orders; design dues on Lineup |
| Slack digest, daily | Needed, but not daily | Monday post, plus a same-day post only when something NEW crosses (newly out, order-by date passed, order landed). Channel and switch in brand settings > Slack and sending |
| Old "Reorder point crossed" alert (engine) | No, it contradicts the brain | Switch off |
| Snapshot now, 2-year backfill, changelog | Yes, as repairs | Brand settings > Data repairs. Changelog screen cut (data kept) |
| The Buyer assistant | No as a second assistant | Strategist gets a stock view plus the actions (log an order, mark a product, add a design) |
| Tour, sign-in page, "How Supply decides" | No | Cut. Locus tour reads the page; Help gets the brief |
| Ads tie-in: warning on an ad or ad set whose product runs out inside its lead time | Yes, new | Step 4 |
| Strategist: "what is at risk for Black Friday" | Yes, new | Step 4, with its knowledge file |
| Brain, engine, hourly Shopify check, landing detection, D1 | Yes | Unchanged |

## Layer 2: what making products needs

| Feature | Needed? | Where it goes |
|---|---|---|
| Drops: a name and one on-site date; every design in it works back from that | Yes, the spine | Lineup page, by drop |
| Designs: name, line, stage, dates, Asana task, notes | Yes | Design panel |
| Asana sync: task auto-created, column sets the stage, due date follows the column, claim cards started in Asana | Yes, working and used; keep as is | Lineup |
| Owes next (the one date that matters for a design) | Yes | Design row and panel |
| Next due strip across all designs and orders in the next 60 days | Yes, the one thing Timeline was for | Top of Lineup |
| Keep or cut per design, cut zone, target designs, open slots | Yes, this is judging the product line | Lineup, one "Keep or cut" card per line with a target (Polos, Hats today). The ranked bar list from Performance moves here |
| "What this does to the next order" (units and cost of kept + new designs) | Yes, one sentence | Inside the keep-or-cut card |
| Size curve per line, as a chart | Yes, it shapes the next order | Keep-or-cut card (also in the product panel) |
| Sample: asked, expected, tracking, in hand | Yes, light | Design panel, small section |
| Attach the Shopify product, production state from orders ("where it is") | Yes, no typing | Design panel + row pill |
| Tech pack stage | Yes, the Asana column exists | Stays |
| Design timing: design 14, sample make 21, slack 10 days | Yes | Stock and factories > Design timing (one row, three numbers) |
| Design checklist subtasks | No | Cut |
| Hand-off to the marketing calendar (lineup_event) | Never built | Out of scope |
| By-line page as a separate mode | No | Folded into the card above |
| Links inside the 7 Asana tasks (?slot=) | Yes, must keep working | Redirect to the design in Locus |

## Names (two clashes, Cole to pick)

- "Lineup" is already the name of the marketing calendar app. Suggest **Drops** for the page (it is what the page shows).
- "Orders" in Store already means customer orders (Sales opens them). Suggest **Factory orders** or **Purchase orders**.

## Per brand

- Brand setting "Makes its own products" (on for Lucky): shows Drops, design timing, Asana project.
- Stock and Factory orders show for any brand with a stock feed (Lucky now; others as the Mobius Digital Shopify app is installed).
- Brands with neither see nothing of this.

## Questions for Cole

1. Sign-off on the two layers and the cuts above.
2. Page names: Drops and Factory orders, or keep Lineup and Orders?
3. Slack: Monday plus new-only alerts (recommended), or daily?
4. Log the unlogged WST orders first, starting with the 500 gloves (needs WST's hand x size split)? It clears the glove alarm.
