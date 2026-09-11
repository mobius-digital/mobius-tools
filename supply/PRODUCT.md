# Supply

**What it is.** The buying brain for a brand's physical products. One
deployment, every brand as a row (Lucky Golf first). It answers four
questions, in the order they get asked on a Monday:

1. What do I need to order, how much, and by when?
2. What is already on its way, and when does it land?
3. What is selling and what is not, by category, line, design and size?
4. What should the next lineup be, and when must each piece start?

Supply replaces Restock (`restock/`), which was an alert list. The
difference is memory: Supply records what you decided (lifecycles,
orders, cuts, targets) and works forward and backward from real dates.

**Who uses it.** The buyer (Cole today), the designer for dates, and a
brand's operator later. Nobody is a power user. A Monday session is ten
minutes; a season session is an hour.

**Where it sits.** A Mobius tool, not a Lucky Golf app: any brand could
use it. Shopify is the source of truth for products, stock, orders and
costs. Asana holds every piece of internal work (design, tech pack,
samples, photo shoot). Lineup holds what a customer sees on a date.
Supply sets the dates and quantities and hands off once each way.
Slack is where it reports. See the system map (2026-09-11).

**Screens.** Left rail, same shell as Locus.
- Today: four headline figures (to order, on the way, revenue at risk,
  dead stock) and the week's decisions as sentences with a button.
- Reorder: grouped by factory with its next order window. Columns: on
  hand, incoming, sells per week, runs out, order by, suggested, at
  cost, minimum order. Tick rows, Create order.
- Orders: purchase orders as records. Stages: draft, sent, confirmed,
  in production, shipped, partially received, landed. Only sent and
  later count as incoming stock. Landing detected from the hourly
  Shopify snapshot; partials keep the remainder open.
- Forecast: one product. Stock projected forward, the sold-out gap
  shaded, incoming orders stacked, "what if I send X on date Y", the
  velocity explained in one table, a pre-order suggestion when a gap
  is unavoidable.
- Performance: category, then one row per product line, then the
  ranked list for a line with the cut band shaded, size curve, loft
  mix, sell-through, weeks of cover, dead stock at cost.
- Lineup plan: per line, a ranked list with Keep or Cut on every row,
  the assortment target, and the open slots the target creates. A slot
  is dates plus a status plus a link to the Asana task.
- Timeline: every order and every slot on a real date scale, worked
  back from the on-site date, with factory closures and a deadline
  list.
- Settings: categories and product lines, factories, lifecycles,
  rules, Slack.

**The brain.**
- A product's status is judged on its core variants (the sizes or
  lofts carrying 80% of its sales). Tail variants are a "size gap"
  note, never the product's colour.
- A sold-out variant's demand comes from the line's size curve, not
  from extrapolating its last two sales.
- Order-by date = run-out date minus (production + shipping + buffer).
  It is the sort key everywhere. "Overdue" is a state.
- Lifecycle per product: core, seasonal, limited drop, winding down,
  discontinued. Only core and seasonal are forecast for reorder.
- Categories and lines are Supply's own tree. Shopify product types
  are sorted into lines once; new types wait in Unsorted.
- Velocity: the Restock blend (14d 45%, 30d 35%, 90d 20%, spike cap,
  stockout days excluded) stays. Seasonality arrives with the
  read_all_orders scope and two years of history.
- Each factory has production days, shipping days, an order cycle and
  closure weeks. A line can override lead time.

**Rules (first numbers, editable in Settings).** Cut band: bottom 25%
of a line by 90-day sales, apparel and hats only; clubs and
accessories reviewed by hand. Targets: polos 15, hats 12. Buffer 10
days. Coverage after landing 180 days.

**Build.** Phase 1 foundation (shell, categories, factories,
lifecycle, core-variant status, size curves, order-by dates; Today,
Reorder, Forecast, Settings). Phase 2 orders. Phase 3 performance and
seasonality. Phase 4 lineup plan, timeline, Asana and Lineup
hand-offs. Preview address first on a copy of the data, then cutover,
same as Lineup.

**What it is not.** Not a task manager (Asana), not a marketing
calendar (Lineup), not a design tool (Canva, Drive), not a stock
counter (Shopify).
