Paste everything below this line into a new Claude Code chat in the Mobius Digital Tools folder.

---

We are moving the Supply app into Locus, rebuilt and simplified. Do step 1 (the audit) first and stop for my sign-off before designing or building anything.

READ FIRST
- profit/CLAUDE.md (Locus: the v2/v3 look, the six-item rail, page tabs, brand settings vs agency settings, the 2026-10-08 sections at the end).
- supply/PRODUCT.md and the memory note mobius-supply (what Supply is, the brain rules, the date model, the Asana sync, Lucky's logged WST orders).
- account-health/CLAUDE.md, only the Strategist sections.

WHAT SUPPLY IS
- tools.go-mobius-digital.com/supply/ : Lucky Golf's buying tool. Screens: Today, Reorder, Create order, Orders, Forecast, Performance, Lineup plan, Timeline, Settings (supply/index.html, app.js, app2.js, supply.css, tour.js).
- Worker mobius-supply (supply/worker, D1 mobius-supply, brain in supply/worker/src/brain.js, Asana sync in worker.js, the Buyer assistant in buyer.js).
- The Supply engine (supply/engine, deployed name mobius-restock, never delete) owns Shopify access (Lucky's private app, client credentials), the hourly cron, the 800-day sales history and the 6am Slack digest to #lucky-golf-inventory.
- Only Lucky Golf is switched on. Lucky's open purchase order PO-0001 (WST) and its design lineup project in Asana are real data and must survive.

WHAT I WANT (Cole)
- It works in theory but it is clunky. Too many screens for one question: what do I need to order, how many, by when.
- Fold it into Locus under Store, next to Sales and Customers, as three pages:
  - Stock: one list of what needs a decision today (running out, reorder now, too much stock), sorted by urgency.
  - Orders: factory purchase orders (placed, in production, shipped, landed).
  - Lineup: new designs by drop, synced to Asana like today.
- Forecast, Performance and Timeline become details you open from a product, not pages.
- Factories, lead times and rules move into Locus brand settings as a "Stock and factories" section.
- Tie it to the ads: a product running out soon gets a warning where we would scale its ads, and the Strategist can read stock ("what is at risk for Black Friday?").
- Brands that do not buy stock do not see these pages.

THE CATCH
- Other brands need the Mobius Digital Shopify app (under Shopify review, see the shopify-apps memory) to read their stock. Build on Lucky's data first; other brands switch on as they install the app.

STEPS
1. Audit: go through every Supply screen and feature, say what each one is for, how often it is really used, and propose keep / merge / cut, in short bullets. Stop for my sign-off.
2. Mock the three Locus pages (Locus look, graphite, same building blocks as v2.js) for my approval.
3. Build in Locus on the same Supply D1 and engine, so nothing is lost.
4. Stock signals on ad pages and a Strategist stock view, plus its knowledge file (docs/strategist-brain/knowledge/, the rule: every new connection ships with its knowledge).
5. Retire the old Supply app after Lucky has used the new pages for a week.

HOW I WORK
- Short bullet replies in plain words: what changed, what I need to do. No jargon, no mechanics.
- No em dashes anywhere. In-app modals only. Just do it: deploy, commit and push without asking; stop only for money, client-facing or destructive actions.
- My ideas are questions, not orders: push back if something adds clutter.
