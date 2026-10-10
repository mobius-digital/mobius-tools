# Handoff: one Ledger for three businesses (2026-10-10)

Written for the cloud session that continues this work. Cole's machine holds the memory notes and the
deploy logins; the cloud has this repo and GitHub. Everything the cloud needs is in this file.

## What Cole asked (his words, condensed)

1. "Why is the Caddie its own sub tab? Doesn't make sense to me. What's run checks?"
2. "Would it be beneficial to move to one full app? I have basically 3 ledgers right now, one for Mobius, one
   for Lucky, and another for my personal. Each do their own thing and have different uses. But might be
   easier to combine into one... same idea as Locus, where there's an agency view and a brand view... what
   business are you in: agency / service-based, e-commerce brand, personal... customizable depending on what
   you're going to be using it for... if I were to sell this to other people, they log in to preset stuff but
   can they also customize? It should just be preset for the most part. Do that whole entire thought process."
3. Do everything needed; he does not want to be asked before deploys (memory rule "Just do it": act, then
   report; stop only for money, client-facing or destructive calls).

## Answers already settled in this session

- **The Caddie tab**: my call, and Cole is right that it reads as odd. Fold it: open findings and the Monday
  briefing already sit on Home › Overview; the chats and reports it built belong under Reports (Caddie reports
  exists). Remove the tab. "Run the checks now" re-runs the nightly audit on demand (duplicate payments, a bill
  that did not arrive, price creep, ads as a share of sales, cash below zero, uncategorized rows, receipts,
  missing product costs, stale bank feed). It is a maintenance button; keep it in Settings › Slack and the
  Caddie only, not on a page.
- **Readers**: Cole alone today for all three ledgers; Skylar on Tally; the CPA by export. No logins for others.

## The three ledgers as they stand

| | Mobius Ledger (agency) | Lucky Ledger (e-commerce) | Tally (personal) |
| --- | --- | --- | --- |
| Where | this repo, `ledger/` (index.html 3470 lines, ledger.css, worker/); tools.go-mobius-digital.com/ledger/; worker `mobius-ledger` on the Mobius CF account | separate repo github.com/LuckyGolfCo/lucky-golf-ledger (the mobius-digital GitHub login is a collaborator); ledger.luckygolf.com (Pages) + lucky-ledger.lucky-golf-showroom.workers.dev; Lucky Golf CF account | `C:/Users/wetzl/OneDrive/Apps/Desktop/Tally` on Cole's laptop, NOT in any repo (the cloud cannot see it); tally.scwetzler.workers.dev; personal CF account |
| Engine | the original: Plaid, Stripe, Slack receipts, recurring rules, two-layer categories (bucket + tax category), month close, report card, CPA pack, Ask (Controller) | fork of the Mobius engine (worker.js 4982 lines) + lucky.js (Shopify orders/payouts/products, COGS, cash forecast, debts, Kickfurther, Capital) + caddie.js; v6 front end shipped today (see below) | ~70% of the Mobius engine rewritten small: one shared checking, buckets, bills, goals, who-spent-it, Ask Tally; everyday words, 4 tabs |
| Look | 2026-09-16 "Ledger Pro" (older Mobius look, rail) | Locus design system as of today | its own (Geist, indigo), redesign proposed, not built |
| Users | Cole | Cole (admin@luckygolf.com, cole@) | Cole + Skylar |
| Money shape | retainer clients, Stripe fees, contractors, 50/30/10/5/5 split, 30% tax set-aside | Shopify sales by order date, COGS as units sell, inventory on the balance sheet, Capital/Kickfurther/Griff debts, 13-week cash forecast, products and margin | one checking, limits per bucket, bills, savings goals, safe to spend |

## Lucky Ledger v6 (shipped today, commit 8e2e8a7 in the Lucky repo)

Rail: Home (Overview, The Caddie) / Money (Profit and loss, Balance sheet, Costs, Taxes) / Cash (Forecast,
Plan, Debts) / Books (Transactions, Receipts, Close) / Store (Products, Inventory, Orders) / Reports (Statements,
CPA pack, Caddie reports); foot: Settings (Business, Accounting, Categories, Vendors, Banks and cards, Shopify,
Slack and the Caddie, Access, Data), theme, sign out. Top bar: crumb, ask bar (Ctrl+K), period + compare
menus on Money and Store, month stepper on Books. Files in `app/`: `ledger.css` (tokens light/dark, Lucky green
accent, every component), `icons.js` (Lucide sprite copied from profit/icons.js), `lg-core.js` (NAV, show(),
period control, tile/delta/spark/lineChart/barChart, the drill panel), `lg-home.js`, `lg-money.js`, `lg-cash.js`,
`lg-books.js`, `lg-settings.js`. The engine (index.html's inline script) is untouched and overridden by name
(`show`, `renderGate`, `boot`, `renderSettings`, `renderClose`, `monthNav`, `needsCount`, `editTxn`,
`renderTxns`). Chart.js and Geist are gone. Full audit and the reasoning: `docs/redesign-2026-10-10.md` in that
repo. Trap: never declare a top-level `const` the engine already declares (check with
`grep -oE "^(const|let|function) +\w+" app/index.html`).

## The job for the cloud session

**Step 1, the thought process (a document Cole can read, then a page he can share):**
- Should the three become one product? My starting view: yes for the SHELL, the engine and the money model
  (transactions, categories, receipts, close, reports, ask), no for the data: each business stays its own
  tenant with its own bank links, its own Cloudflare account today (privacy was explicit for Tally) and its own
  Slack. One codebase, deployed three times, is the honest first step; one deployment with tenants is step two
  and only matters if it is sold.
- Editions by "what business are you in", like Locus's agency vs brand editions (memory: never hide a brand's
  own pages; the agency edition only ADDS). Proposed presets: **Service business** (clients and retainers,
  Stripe, contractors and 1099s, the owner split, tax set-aside), **Product brand** (store sales, cost of goods
  and inventory, products and margin, debts and cash forecast, suppliers), **Household** (one or two accounts,
  spending limits by bucket, bills, savings goals, people, everyday words, no CPA pack). A preset decides which
  rail items, which settings sections, which categories and which words ("Clients" vs "Store" vs "Spending").
- Customization: presets are the default; a short list of switches per edition (show the balance sheet,
  accrual vs cash, Slack on or off, who-spent-it on or off, categories editable always). Nothing that needs a
  manual to understand. Write down what a new sign-up sees in the first five minutes.
- Name: Cole is open; "Ledger" is the placeholder. Offer three with the reason, do not block on it.
- The Caddie: one assistant per edition with its own name and playbook (Controller, Caddie, Tally); same engine.
- Shared code today: the Lucky worker is a fork of the Mobius worker (drifted); Tally is a rewrite. Say what
  it would cost to bring them back under one engine, and in which order (Lucky's engine is the most complete;
  Mobius's is the original; Tally is the smallest and the most different).
- Risks: three live apps with real money in them; migrations must be additive; Lucky deploys need the laptop.

**Step 2, build what Cole approves.** Likely first moves: the v6 shell and CSS into `ledger/` for the Mobius
books (same files, agency preset, blue accent per `/mobius.css` data-app rules), the Caddie tab folded, an
`edition` setting read by the rail and Settings.

## Constraints the cloud must respect

- Deploys: the Lucky worker and Pages deploy need the Lucky Golf wrangler login on Cole's laptop
  (`XDG_CONFIG_HOME="C:/Users/wetzl/Lucky Golf/.cf"`); the Mobius worker needs the Mobius wrangler login; Tally
  needs its `deploy.sh` token. From the cloud: commit and push, then say what to deploy and from where. If a
  Cloudflare API token is in the cloud environment, say so before using it.
- Cole's rules: short bullet replies (what changed, what he must do); no em dashes anywhere; in-app modals,
  never alert/prompt; plain words, explain every number; "Simplicity over features": his ideas are questions,
  push back with evidence; "Answer the part asked": change only the piece he questioned.
- Memory notes live only on the laptop. Keep this file current; it is the record the next session reads.
