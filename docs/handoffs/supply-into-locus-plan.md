# Supply into Locus: the build plan (2026-10-08)

For the next chat (Opus): read this file, then `docs/handoffs/supply-audit.md`
(the audit it rests on), `profit/CLAUDE.md` (the v2/v3 look, the 2026-10-08
sections at the end), `supply/PRODUCT.md`, the memory note `mobius-supply`,
and the Strategist sections of `account-health/CLAUDE.md`. Cole signed off on
the audit and said "whatever you think, do it". Only one thing is off the
table: do NOT log the unlogged WST orders (PIs 103, 104, 105); Cole will talk
about those afterwards.

Branch: `claude/charming-mcnulty-9201f4` (worktree). Commit and push as you go,
deploy without asking. Stop only for money, client-facing or destructive calls.
No em dashes anywhere. In-app modals only. Short bullet replies.

## Progress log

- 2026-10-08 prep DONE: engine's old "Reorder point crossed" alert removed;
  Slack = Monday summary + same-day new-only alerts (Supply `/api/digest?mode=`,
  memory in settings `digest_seen`, switches `digest_monday` / `digest_alerts`);
  brain: Order now = order-by within 14 days, Coming up = 60 days after that
  (order cycle, watch_days, reliable_days no longer read); product-map rows.
  Two changes from the plan below: (1) the Locus-brand mapping lives in
  SUPPLY's `brands` table (`act_id`, `makes`; Lucky = act_378146126054294,
  makes 1), read by Locus from `GET /api/brands`, written by `PUT /api/brand`;
  NOT in `p_br_doc`. (2) The `?slot=` redirect waits for the Drops page.

## Decisions already taken (do not reopen)

- Two layers. **Stock** for any brand with a stock feed (Lucky today). **Make**
  for a brand that designs its own products, switched on by a brand setting
  (Lucky on). A brand with neither sees none of these pages.
- Page names: **Stock**, **Factory orders**, **Drops** (not "Orders", which is
  customer orders in Store > Sales; not "Lineup", which is the marketing
  calendar app). Rail: Store = Sales, Customers, Stock, Factory orders, Drops,
  Website, Search. Stock, Factory orders and Drops hide when the brand has no
  feed / is not a maker.
- Slack: the daily 6am digest becomes **Monday** plus a **same-day post only
  when something new crosses** (a product newly out, an order-by date newly
  passed, an order landed). The old engine alert "Reorder point crossed"
  (`supply/engine/src/worker.js` `redAlertMessage`, fired from `scheduled`) is
  switched off: it contradicts the brain.
- Cuts (from the audit): Today, Reorder, Forecast, Performance, Timeline pages;
  categories; factory order cycle; watch_days and reliable_days (fixed in
  code); "seasonal" as a kind of product; the design checklist; the Buyer as a
  separate assistant; tour, sign-in page, CSV export, changelog screen; the
  separate "log an order you already sent" path; "confirmed" and "partial" as
  order stages.
- Keeps: the brain (`brain.js`), the engine, D1, hourly Shopify check, landing
  detection, the Asana sync exactly as it works, the `?slot=` links in the 7
  live Asana tasks (must redirect to the design in Locus).
- Everything is built on the same Supply D1 and engine. Nothing is copied.
  PO-0001 and the Winter 2027 drop (7 polo designs) must survive untouched.

## How Locus reaches Supply (wiring)

- Front end: a new `profit/supply.js` (its own IIFE, like `studio.js` and
  `meta.js`), drawn by `window.V2.render` for tabs `stock`, `forders`, `drops`
  (add them to `NAV.store.tabs`, `SHOWABLE`, the renderer map in `show()`,
  `ASK_SUGGEST`, `PAGE_BRIEF`, and `window.GLOSSARY` for every new tile). Use
  `window.V2UI` for every building block (tile, card, panel, lineChart,
  stackChart, chip, ib, tipAttr, formatters). No new colours; v2 tokens only.
- It calls the Supply worker `https://mobius-supply.mobius-digital.workers.dev`
  DIRECTLY with the same `mobius_session` bearer Locus already holds (Supply
  delegates auth to the engine, which accepts the Mobius Google session), the
  way meta.js calls account-health. Add the Locus origin to Supply's CORS if
  it is not already allowed. `X-Actor` = the session email.
- Brand mapping: Locus brands are keyed by Meta `act_id`; Supply brands by its
  own id (`lucky`). Store it in the brand doc (`p_br_doc`, key `supply`:
  `{brand: 'lucky', makes: true}`), edited in brand settings > About the brand
  ("Stock feed" shows the Supply brand when one exists; a switch "Makes its own
  products"). `profit/worker/src/brand.js` already reads and writes `p_br_doc`
  keys. The pages render only when `supply.brand` is set; Drops only when
  `supply.makes` is on. Set Lucky's by hand in the first commit.
- One state call: `GET /api/state?brand=lucky` returns everything every screen
  draws (products with statuses, orders, slots, collections, factories, lines,
  settings, headline, decisions). Cache it in the page for 2 minutes like
  `get()` in v2.js; every save reloads it. Do not invent a second data model.

## Step 2: the mock (Cole approves before any screen is built)

- One file `docs/locus-hub/mocks-supply.html`, the v2 graphite look, built
  from the same blocks (tile, card, table, side panel), with Lucky's real
  numbers pasted in from `/api/state` (use the `?devstate=` trick: save the
  state JSON to the scratchpad first). Publish it as an artifact and send the
  link. Three pages plus the two panels (product, design) plus the Stock and
  factories settings pane.
- Add the rows to `docs/locus-hub/product-map.md` (the rule: a row before a
  build): Stock, Factory orders, Drops, the product panel, the ad stock
  warning, the Strategist stock view, Stock and factories settings.

## Step 3: the pages

### Stock (`tab: stock`)

- Header tiles (each opens its group below): **To order** (count, overdue
  count, latest order-by), **On the way** (orders, next landing + units),
  **Revenue at risk** (top two names), **Dead stock** (at cost, units,
  retail). Same numbers as `state.headline`.
- Two views (page tabs inside the card, like Meta's jobs row):
  **Needs a decision** (default) and **All products**.
- Needs a decision: three groups in this order, each a table, each row
  opens the product panel: **Running out** (statuses out, order, gap, soon;
  sorted by order-by date, overdue first), **Too much stock** (dead units,
  or 52+ weeks of cover), **Fine** collapsed by default with a count. Group
  rows by factory inside Running out (heading = factory name, lead time,
  minimum). Columns: tick, product (title + the status pill + the one-line
  note: size gap, on the way lands X, trend), on hand, on the way, sells a
  week, runs out, order by, suggested (with "about $X at cost" under it),
  minimum met / under. Row buttons: "It was a one-off" on an out-of-stock core
  product (sets lifecycle drop), nothing else.
- All products: one sortable table, every product not discontinued: product,
  group (line), kind, on hand, on the way, sells a week, sold 90d, sell-through
  (90d sold / (sold + on hand)), weeks of stock, trend, dead units, status.
  Search box. This replaces Forecast and the product half of Performance.
- Action bar when rows are ticked (bottom, sticky, like Supply's): N products,
  units, about $X at cost, lands about <date>, **Create order**. One order per
  factory; if ticks span two factories, say so and make them in turn (existing
  `createOrder(rest)` logic).
- Create order = the side panel: send date, expected landing (from lead time,
  editable), per product a table of variants (size/loft, on hand, runs out,
  need, order qty input), "Fill to minimum by size curve", note to the factory,
  footer: Save as draft / Copy order text and mark placed. Port
  `createOrder`, `fillToMoq`, `orderText`, `submitOrder` from `supply/app.js`.
- The **product panel** (`panel()` from V2UI, wide): header (image, title,
  group, factory, kind, status pill), five stats (on hand, sells a week, runs
  out, order by, suggested), ONE chart: the last 90 days of daily sales as
  bars to the left of today, the shelf projection to the right with the
  what-if order drawn as the second line and the sold-out stretch hatched
  (merge `salesSVG` + `projectionSVG` into one SVG on the v2 line-chart look,
  with the hover guide line and dots like every other Locus chart), the
  what-if inputs (quantity, send on) inline under it with lands / sold out for
  / lasts until / cost, the pre-order reminder line when the gap is over 14
  days, the variants table (size, on hand, sold 90d, a week, runs out,
  suggested; "curve" and "capped" marks with tips), "Why X a week" as one
  sentence, then **How we treat it**: kind of product (core, limited drop,
  winding down, discontinued), group, minimum, lead time override, notes; all
  save at once (`PUT /api/products/:id`). Footer: Add to an order, Open in
  Shopify.
- Empty state when the brand has no feed: one card saying how to connect
  (the Mobius Digital Shopify app, under review) and nothing else.

### Factory orders (`tab: forders`)

- Filters: **Open** (default; drafts included, tagged "Draft, not placed") and
  **Landed**. One table: order id + product titles, factory, placed, expected
  (with days to landing or "N days late"), units (received under it), at cost,
  stage pill, and a sent-to-lands progress bar in the row. Row opens the order
  panel. Header button: **New order** (opens Create order with nothing ticked:
  a product picker first).
- Stages become four: **Placed, In production, Shipped, Landed** (D1 status
  values stay `sent`, `production`, `shipped`, `landed`; `confirmed` reads as
  Placed, `partial` reads as Landed-with-remainder; `draft` and `cancelled`
  stay). Only `sent` and later count as incoming (unchanged in brain.js).
- Order panel: stepper of the four stages, placed date, expected landing,
  deposit, tracking, notes, the lines table (product, variant, ordered,
  received, on hand now, after landing), the landing-detection note, buttons:
  Save, the next stage ("Mark in production", "Mark shipped", "Mark landed"),
  Cancel, Delete (drafts and cancelled only). Port `openOrder`, `orderPatch`,
  `advanceOrder`.

### Drops (`tab: drops`, maker brands only)

- Top: **Next due** strip: the next 8 dates across every design (its "owes
  next") and every open order (lands), soonest first, late in red, each
  opening its panel. Then factory closures inside 60 days.
- Left: the drops list as cards (name, on-site date, designs, lines, late
  count, N of M in Asana, first order by); pick one. Button **New drop** (modal:
  name, on the site, notes). Edit the drop / Delete on the open drop's card.
- Centre: the open drop's designs table: design, line, stage, owes next, where
  it is, Asana (pill + Open in Asana / Create). Button row: add designs per
  line ("+ Polos", "+ Hats": modal "how many"), "Catch up any missing Asana
  tasks". Below it, when present: **Started in Asana, not in the plan** (loose
  cards with "Make it a design") and **Not in a drop**.
- Right: one **Keep or cut** card per line with a target (Polos, Hats): the
  ranked bar list by 90-day sales with the cut zone shaded, Keep / Cut / Reset
  per row, the four numbers (keep, decide, cut, open slots), the size curve
  chart, and ONE sentence: "N kept and M new at X units each is Y units,
  about $Z at cost". Target and cut % edited from the card (same modal as
  `editLineTarget`). This replaces Lineup-by-line and the line half of
  Performance.
- The **design panel**: name, stage (read-only when Asana owns it, with the
  "drag the card" note), drop, on-site (from the drop), Asana task link,
  notes; the "Next: X, due Y" panel; the six dates (Brief, Tech pack, Sample
  approved, Order placed, Stock lands, On the site; late in red); The sample
  (4 small fields); Once it exists (attach the Shopify product; where it is);
  Save, Delete. Port `openSlot`, `saveSlot`, `refreshSlotAsana`,
  `asanaSheetHTML`.
- `?slot=` links: Locus opens `/profit/?tab=drops&design=<id>` to that design's
  panel. `supply/index.html?slot=X` must redirect there (keep this working
  before any task gets a new link). New Asana tasks get the Locus link
  (`DASHBOARD_URL` in `supply/worker/src/worker.js`).

## Settings

- Brand settings gain a group **Stock and factories** (add to `BG_OF` and the
  brand row; brand-mode only, `openGoals`-style entry from the Stock page
  header "Rules"). Inside, four cards:
  1. **Factories**: table (name, makes, lead time shown as one number with
     "production + shipping" under it, minimum, closed dates), add/edit modal
     (name, contact, production days, shipping days, minimum per style,
     closures "YYYY-MM-DD to YYYY-MM-DD label", notes). Order cycle removed.
  2. **Product groups**: the lines, each with its Shopify product types,
     factory, lead override, minimum, size curve override (and target + cut %
     for maker brands); the Unsorted prompt with "Sort now". Categories gone:
     the lines table is flat, sorted by name. (D1 keeps `categories`; the
     worker keeps writing a default category id so nothing breaks.)
  3. **Rules**: buffer days, coverage after landing, landing to on the site,
     dead stock after. For maker brands, a fifth row **Design timing**: design
     days, sample make days, slack days, as three inputs on one row.
  4. **Slack**: the stock post channel (the brand's internal channel by
     default), "Monday summary" switch, "Same-day alerts when something new
     crosses" switch. (These replace digest hour and mode; the engine still
     posts, see worker changes.)
- Brand settings > Connections: an **Asana design project** card for maker
  brands (project picker from `/api/asana/projects`, who tasks are created
  as). Checklist removed.
- Brand settings > Data repairs: "Run a Shopify stock snapshot" and "Backfill
  2 years of sales" buttons (proxied to Supply's `/api/shopify/*`).
- Brand settings > About the brand: "Makes its own products" switch and the
  Stock feed line.
- Help (`PAGE_BRIEF`) for the three pages; the Metrics glossary entries for
  the new tiles; `ASK_SUGGEST` four questions each (e.g. "What runs out before
  Black Friday for {b}?", "What should {b} order this week?", "What is on the
  way for {b} and when does it land?", "Which {b} designs are late?").

## Worker changes (supply/worker and supply/engine)

- Supply worker (`supply/worker/src/worker.js`): CORS for the Locus origin;
  `/api/state` adds `sellThrough` and `weeksOfCover` per product if missing
  (brain.js has them per line); settings PUT rejects the retired keys
  (watch_days, reliable_days, order cycle stays in D1 but is ignored by
  brain.js: set the window logic to "order-by within 14 days = Order now");
  lifecycle `seasonal` still accepted in D1 but the UI offers four; order
  status `confirmed`/`partial` still accepted (old rows) but the UI never sets
  them; `DASHBOARD_URL` points at Locus Drops; a `?slot=` redirect lives in
  `supply/index.html` (step 5 turns the whole page into a redirect).
- Digest: a new `/api/digest?mode=monday|alerts` in the Supply worker. Monday
  = today's summary (what to order, on the way, at risk, dead) as it is now.
  Alerts = compare today's decisions with the set posted last time (store
  `digest_posted` in `settings` as the list of product ids + statuses + order
  ids + stages); post only the NEW crossings; empty = post nothing. The engine
  (`supply/engine/src/worker.js` `scheduled`) calls Monday at 6am Central on
  Mondays, alerts once a day at 6am the other days, and never the legacy
  digest; `redAlertMessage` and its trigger are removed. The channel stays in
  the engine's settings as today (edited through Supply's `/api/shopify/settings`
  proxy); the two switches are Supply brand settings `digest_monday` and
  `digest_alerts` (default on). Verify with "Send now" from the Slack card.
- Buyer: delete `supply/worker/src/buyer.js` and `supply/buyer-ui.js` and the
  `/api/ask/*` routes in the Supply worker once the Strategist stock view
  (step 4) is live. The `ask/engine.js` denylist / live map in `ask-engine`
  memory should drop the Buyer.

## Step 4: the ads tie-in and the Strategist

- **Ad to product match**: Lucky names ad sets and ads after the product
  (Carver, Stryker, Tracer, polo names). Match each ad set's name (then the
  ad's) against the Supply product titles and their words, longest match
  wins; store nothing. Where no match, no chip. Later a per-ad override, not
  now.
- **Where it shows**: Ads > Meta > Campaigns (ad set rows) and Creative (ad
  rows and the preview) get a chip: "Runs out <date>" (amber inside the lead
  time, red if out or inside 14 days) with a tip "At 5.2 a week the Spot Blade
  Polo runs out Oct 16; an order placed today lands Dec 17". The creative
  call keeps its verdict; a Scale on a product that runs out inside its lead
  time adds "but stock runs out <date>" in its why. Data: `profit/supply.js`
  exposes `window.SupplyStock.forAct(act)` (the cached state, products only)
  and v2.js asks it; nothing new in hub.js.
- **Strategist stock view** (`account-health/worker/src/strategist.js`, the
  `views` passed to `makeAppView`): view `stock` with `what` in {decisions,
  products, orders, drops}, reading Supply's `/api/state` over a new service
  binding `SUPPLY` on the account-health worker (it has no service bindings
  today; add `[[services]] binding = "SUPPLY" service = "mobius-supply"`).
  Auth: Supply forwards the bearer to the engine, which accepts the Mobius
  session or ITS OWN admin token (`LuckyRestock-Eagle-77`, see the
  mobius-supply memory), not account-health's ADMIN_TOKEN. So: forward the
  caller's bearer when a person asks; for Slack and scheduled runs add the
  engine token as secret `SUPPLY_TOKEN` on account-health (dashboard or a
  piped file, never Ctrl+V at the prompt). The
  playbook gains a short STOCK section: judge a scale call against run-out,
  "at risk for Black Friday" = products whose run-out lands before Dec 1 with
  no order landing first, name the order-by date and the suggested quantity,
  never recommend ordering a limited drop.
- **Actions** (routeAction): `log_order` (same body as POST /api/orders),
  `set_product` (lifecycle, notes), `add_design` (line, drop, name). Every act
  is a proposal like the others.
- **Knowledge file**: `docs/strategist-brain/knowledge/stock.md`, the same 7
  sections as the other ten. `account-health/worker/src/knowledge.js` is
  GENERATED: run `account-health/worker/scripts/build_knowledge.py` after
  writing the file, then deploy (the 2026-10-08 CMO section in
  account-health/CLAUDE.md has the rule "every new connection ships with its
  knowledge"). Content: how the brain decides
  (velocity blend, core sizes, order-by, suggested, incoming), lead times and
  CNY, minimums, dead stock, pre-order, how stock changes an ad decision, the
  Monday routine, what the Strategist must never do (order a drop, trust Meta
  counts for sales).
- Settings > Connections: the Supply feed shows as a connection card (Shopify
  stock, hourly, last snapshot time) in the brand's Store and analytics group.

## Step 5: retire the old app (after Lucky has used the new pages a week)

- `supply/index.html` becomes a redirect to `/profit/?tab=stock` (keeping
  `?slot=` -> Drops). Delete `supply/app.js`, `app2.js`, `supply.css`,
  `tour.js`, `gate.js`, `buyer-ui.js`. Keep `supply/worker`, `supply/engine`,
  `supply/db`, `supply/PRODUCT.md` (update it: screens now live in Locus).
- Update `profit/CLAUDE.md` with a "Supply in Locus" section, `supply/PRODUCT.md`,
  and the memory notes `mobius-supply` and `ask-engine` (Buyer retired).
- Verify PO-0001, the Winter 2027 drop and the 7 Asana task links still open.

## Build order and checkpoints

1. Prep (one commit): product-map rows, Lucky's `supply` brand doc, engine
   alert off, digest cadence, `?slot=` redirect. Deploy both workers.
2. Mock artifact: stop for Cole.
3. Stock + product panel + Create order. Deploy, verify in the browser pane
   against prod with Lucky (`?devstate` is not needed: the session works).
4. Factory orders.
5. Drops + design panel + Stock and factories settings + Connections card.
6. Ads chips + Strategist view + actions + knowledge + Slack switches.
7. Week of use, then step 5.

Each of 3 to 6 ends with: deploy, a screenshot per page, a bullet report of
what changed and what Cole must do.

## Things to keep in mind

- `brain.js` is the only place a status or a date is computed. The pages draw
  `state`; they never recompute. If a number looks wrong, fix the brain.
- The `lines` PUT replaces all fields: always send the full row. The orders PUT
  `lines` array replaces all lines. Slot PUT: never send placeholder line_id or
  name.
- Non-ASCII through Git Bash curl gets mangled: write JSON with Python.
- `wrangler.cmd`, never `wrangler.ps1`; secrets via the dashboard or a piped
  file.
- The Golf Sock is a paused test account; paused brands never get flagged.
- Every ROAS / purchase number on the ads screens stays Triple Whale; stock
  chips add dates and units only, never revenue claims.
