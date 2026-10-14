# Handoff: one Cashew engine for three sets of books (Step B and C), written 2026-10-14

**Status, later the same day (Cole said "do everything"):**

- **B.1 Lucky gets the audit layer: LIVE (Lucky commit 1f4184a, 2026-10-14 evening).** The repo's deploy token
  has no D1 permission, so the worker applies the layer itself: `worker/src/audit-layer.js` (generated from the
  seven `.sql` files, every statement safe to run twice) runs once on the first `/api/*` request or cron after a
  deploy and remembers in `settings.auditLayer`; the public `/api/config` shows the version
  (`"auditLayer":"2026-10-14.1"` on the live worker). No token was needed, nothing for Cole. The deploy workflow
  no longer has a migrations step. The leases, jobs, `/api/exceptions`, provenance, the revision-guarded close
  and the vendor rule are all live with it. Watch the first nightly.
- **B.2 Mobius gets `acct` and the drill route: LIVE** (migration 0008 applied, worker deployed).
- **B.3 one engine file: DONE in the Lucky repo.** `worker/src/engine.js` is a byte-for-byte copy of
  `mobius-tools/ask/engine.js` (which now exports `runAction`), `worker/src/cashew-playbook.js` likewise, the
  Caddie reads the product playbook from it, and `node worker/shared-check.cjs` says when the copies drift.
  The Lucky repo stays where it is; the copy is checked, not a subtree. (Goes live with B.1's rerun.)
- **B.4 one worker, three environments: NOT STARTED.** Reason: a merged worker on the Mobius books cannot be
  walked end to end from here (Google sign-in), and the Mobius regression suite is written against the Mobius
  worker's own functions. Next session: build it on a branch in `ledger/worker` from the Lucky base, port the
  Mobius-only routes (ask/*, gmail, receipt-hunt and match, exceptions replay, Stripe jobs, the AUTH service
  binding), rewrite the suite against it, and deploy only after Cole walks the live app with the admin token.
- **C the household edition: waits on B.4.**

**Cole's call on the link (2026-10-14):** one link now, the full SaaS (one database with accounts inside)
later. **BUILT AND LIVE the same evening: the hub.** `ledger/hub` (worker `cashew`, Mobius account):
https://cashew.mobius-digital.workers.dev proxies the whole app and `/api/*` of whichever books the
`cashew_books` cookie says (Mobius: the Pages app plus mobius-ledger; Lucky: lucky-ledger serves both; Home:
tally); `/switch?to=mobius|lucky|home` sets the cookie and reloads. Each set of books keeps its own worker,
database, sign-in list and token, so a person sees only the books that invited them. The pickers in all three
apps switch on the hub (and still hop between origins on the separate sites). Verified: all three gates
render at the one link, Lucky's and Tally's APIs answer through it. Sign-in through the hub works once the hub
origin is on each Google client's authorized JavaScript origins (Cole: the Mobius client used by HQ and
Tally, and Lucky's own client). A custom domain (cashew.go-mobius-digital.com) needs the zone moved (memory
mobius-domains). Option 3, one database with accounts inside, stays on the docket until Cashew is sold.

The product pass (`docs/cashew-editions.md`) built the picker and the per-edition helper. What it did not do, on
purpose, is touch the three live databases. This file is the first task one-ledger.md section 6 asks for before
anything merges: the column-by-column diff of the schemas, the route diff, and the order of work. Start the next
session from here.

## 1. The three workers today

| | Mobius (`ledger/worker`) | Lucky (`Lucky Ledger/worker`) | Tally (`Tally/worker`) |
| --- | --- | --- | --- |
| worker.js | 4,389 lines | 5,028 lines | 586 lines (+ ask.js, actions.js) |
| Assistant | Cashew on the shared `ask/engine.js` (controller.js) | the Caddie on its own copy `engine.js` (caddie-config.js, caddie.js) | ask.js, its own small loop |
| Sign-in | the account-health Google session over a service binding, plus an allowed list | its own Google login, ALLOWED_EMAILS + settings.allowedEmails, a password fallback | its own Google login, the people table, an HMAC cookie |
| Audit layer | 7 migrations (closed-period triggers, revision, leases, policy and close history, receipt allocations and versions, bank provenance) | none of the 7 | none |
| Store layer | none | products, shopify_orders, shopify_payouts, history (QuickBooks), cogs, debts, cash plan, drill | none |
| Household layer | none | none | buckets with limits, bills, goals, people, who spent it |

## 2. Schema diff, the five shared tables

`transactions`: identical in the 25 columns of `schema.sql`, then:

| Column | Mobius | Lucky | What it is |
| --- | --- | --- | --- |
| acct | no | yes | 'bank' or 'card': which feed the line came from (cash timing) |
| bank_item_id, bank_account_id, bank_currency, bank_amount | yes (migration 0007) | no | bank provenance on the row |
| import_id (+ unique index) | yes (0007) | no | dedupe key for imports |

`vendors`, `clients`, `months`, `settings`: identical columns. Lucky keeps extra settings keys (cutover,
revenueBasis, shopifySync, allowedEmails, the debt figures, passwordHash); Mobius keeps edition, books, notify,
money, taxCats, gmailAuth, driveAuth. Tally's `settings` is `(k, v)` not `(key, value)`.

Mobius-only tables (all additive, all from the 7 migrations): ledger_jobs, ledger_leases, ledger_fence_guard,
ledger_close_history, receipt_allocations, receipt_versions, bank_provenance, plus the triggers (closed-period
guards on insert, update and delete; revision counter; policy revision; close history; receipt version capture;
provenance append-only). Lucky-only tables: products, shopify_orders, shopify_payouts, history, ask_log, and the
Caddie's findings table (caddie.js) and the engine's memory tables (engine.js). Both have ask_log.

Tally's tables map onto the shared engine like this:

| Tally | Becomes | Note |
| --- | --- | --- |
| txns (id TEXT = Plaid id, amount signed, bucket, who, card4, review, pfc, logo) | transactions (plaid_id, type in/out/transfer, amount positive, bucket, status 'review') + new columns `who`, `card4`, `logo` | sign flips: Plaid positive = out |
| buckets (id, name, lim, sort) | the category list (taxCats) + a new `category_limits` table (category, monthly limit) | an edition seeds the list |
| rules (mkey → bucket) | vendors (name → bucket, tax_cat) | mkey is Tally's normalized name; vendors.name is the display name. Keep mkey as a new `vendors.key` column |
| bills (mkey, amount, day, freq, manual, hidden) | vendors with recurring=1, cadence, expected_amount, plus new `due_day`, `freq`, `hidden` | Lucky's open_bills (cash plan) is the other half of the same idea |
| goals | new table `goals` (name, want, have, add_amt, by_month) | household only, but harmless elsewhere |
| people (email, name, initial, card4, admin, photo) | the access list + new `people` table | "who spent it" needs card4 per person |
| items, accounts | plaid items (settings today) and a balances cache | Lucky already has plaid-mark-accounts |
| balance_log | new, or Lucky's forecast_log | one of the two |

## 3. Route diff

Shared by Mobius and Lucky (the engine): boot, me, summary, series, balances, report, transactions (+ bulk),
transaction, vendor, client, recurring, close, reopen, pack, receipt, receipt-hashes, receipt-nudge, extract,
plaid-* (link-token, exchange, item, sync, backfill, compare, import), stripe-check, stripe-sync, drive-*,
slack-check, slack-events, slack-interact, slack-poll, selfcheck, settings, password, report-slack.

Mobius only: ask/* (apply, brief, briefing, finding, findings, forget, history, playbook, reports, run), gmail-*
(connect, disconnect, status), receipt-hunt, receipt-match, exceptions.

Lucky only: caddie/* (the same shape as ask/*, under a different prefix), access, book-sales, brief, cashflow,
cashplan, cogs, cogs-book, config, cost-mode, creator-sync, debts, drill, forecast-accuracy, forecast-log,
google-login, history-import, kickfurther-fees, open-bills, orders-stats, paypal-pair, plaid-mark-accounts,
position, receipt-period, recurring-costs, revenue-basis, revenue-compare, scenarios, shift-rules, shopify-sync,
sku-costs.

Tally: boot, ask, bills (+ hide, history, remove), buckets, config, goals, limits, login, logout, merchants, people,
photo, plaid/exchange, plaid/link-token, range, sync, trends.

## 4. The order (one-ledger.md section 6, made exact)

Lucky's worker is the base: it has the most and the newest. Every step is additive. Never a destructive column
change. Closed months stay frozen. One deploy per step, read the live app after each.

1. **Lucky gets the audit layer.** Add the seven Mobius migrations to the Lucky repo as `worker/migrations/0001..0007`
   (copy, with `IF NOT EXISTS` on every CREATE and a guard around each ALTER for the columns Lucky lacks), run them
   against the Lucky D1 from the laptop (`wrangler d1 execute lucky-ledger --remote --file=...`), then port the
   worker code that uses them (ledger_jobs for exceptions, the leases around the crons, close history on close,
   receipt versions on replace, bank provenance on ingest). Risk: medium; the triggers refuse writes to closed
   months, which is what they are for, but the first nightly run after them needs watching.
2. **Mobius gets Lucky's `acct` column** (one ALTER) and the drill route, so tiles can open the charges behind
   a number in the Mobius shell too.
3. **Cashew onto the shared engine.** Lucky's `engine.js` and `mobius-tools/ask/engine.js` are 92% the same;
   diff them, land the Lucky-only lines in the shared file, and make caddie-config.js import `../../ask/engine.js`
   and `../../ask/cashew-playbook.js` (the product playbook is already there, word for word). Lucky's repo would
   then need the `ask/` folder: a git subtree, or Lucky moves into mobius-tools as `ledger-lucky/`. Cole decides.
4. **One worker, three environments.** The Lucky worker.js becomes `ledger/worker/src/worker.js`; agency routes
   (clients, the split, Stripe, gmail, receipt-hunt) move in behind `edition === 'service'`; store routes stay behind
   `product`; the server refuses routes the edition does not have (Locus's brandguard pattern). `wrangler.toml`
   gets `[env.mobius]`, `[env.lucky]`, `[env.home]`, each with its own account_id, D1, KV, R2 and vars. The Lucky
   GitHub Action deploys `--env lucky`; the Mobius deploy is `--env mobius` from the Mobius login.
5. **Step C, the household edition.** The new tables from section 2 (category_limits, goals, people, the vendor
   columns), the household routes (buckets, bills, goals, people, who spent it, safe to spend), the household
   screens on the shell (This month, Transactions with a person column, Buckets, Bills, Goals, Month in review).
   Then Tally's data moves once, by export and import, on a day Cole and Skylar pick; Tally keeps running until the
   edition matches it.

Sizing stays what one-ledger.md said: two to three sessions for B, one to two for C.

## 5. Things the next session must not do

- No `DROP`, no column type change, no renaming on any of the three live databases.
- No schema change on Lucky or Tally without the laptop logins (the cloud cannot run `d1 execute` there).
- Do not merge the Mobius `ask/engine.js` copy over Lucky's without the diff: Lucky's copy has lines the shared
  one does not (the Caddie's propose and apply path).
- Nothing of Slack: it is done (one Cashew app, the router in `ledger/slack`).
