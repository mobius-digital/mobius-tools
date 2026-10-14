# Cashew through the eyes of who is using it (2026-10-14)

Cole: "View it through the eyes of who is using this. Cut fat where it needs to be cut, add features that need to
be features, add visual representation that actually makes sense in certain areas." This is that pass, built the
same day. The thinking it stands on: `docs/one-ledger.md` (one product, three editions, three separate sets of
books). The shell it changes: `ledger/lg-edition.js` (the map per edition) and `ledger/lg-core.js`.

## 1. Who is using it

Three people, one app. Each keeps a completely separate set of books. Nothing combines, ever.

| | Service business (Mobius) | Product brand (Lucky) | Household (Cole and Skylar) |
| --- | --- | --- | --- |
| Who | the owner of an agency, a few times a week for two minutes; the bookkeeper hat weekly; the CPA quarterly | the owner of a store, most days, before a reorder, a loan, a price change | two people, on a phone, in a queue or at the kitchen table |
| Money comes in as | retainers and invoices through Stripe | orders by order date, Shopify payouts | pay cheques and transfers in |
| The one worry | did everyone pay, and is the month closeable | cash, then stock, then profit, in that order | is there enough left this month |
| The helper | Cashew (the Controller until 2026-10-14) | the Caddie inside the app, Cashew in Slack | Tally |

### The first five minutes

Service and Product: sign in with Google, name the business, connect a bank, categorize the first five rows (the
vendor rules learn from them), read Home. Household: sign in with Google, both people, connect the joint account,
set three bucket limits from what the bank already shows, read This month. Shopify, Stripe, Slack, Drive and the
CPA pack are offered in Settings afterwards, never in the first run (one-ledger.md section 4 already says this;
nothing changed).

## 2. The one question each page answers, and the cuts

The rule: a page stays only when a named person arrives with the question it answers. A page that repeats
numbers another page already shows is cut, however good it looks.

### Service business (the Mobius books, live)

| Page | The question | Verdict |
| --- | --- | --- |
| Home › Overview | How are we doing, and what needs me? | Keep. Cash, the month, who has paid, needs you, the helper's findings. |
| Money › Profit and loss | Did we make money, on what, compared with when? | Keep. |
| Money › Balance sheet | What do we have and owe right now? | Keep. Cash, the card, the tax reserve. |
| Money › Costs | What do we pay every month, and what changed? | Keep. |
| Money › Taxes | What is set aside, what was paid, what is due? | Keep. |
| Cash › Forecast | Will we run out of cash, and when is the low point? | Keep. |
| Cash › Plan | What if a client leaves or we hire? | Keep. The levers and scenarios. |
| Books › Transactions, Receipts, Close | What needs a category, a receipt, and is the month ready? | Keep. The bookkeeper's three pages. |
| Clients › Retainers | Who pays us what, how reliant are we on one, who pays late? | Keep. |
| Clients › Invoices and Stripe | What landed this month, what is still out, what did Stripe keep? | Keep. A month question; Retainers is the year question. |
| Clients › Contractors | Who did we pay, who needs a 1099? | Keep. |
| Reports › Statements, CPA pack, Cashew reports | The frozen month, the year for the CPA, what the helper wrote | Keep. |
| Reports › Business health | How do we read to a lender? | **Cut.** |

Why Business health went: it was added in Step A only so the old Dashboards tab "was not cut" (the Step A handoff
says so). Its seven numbers all live elsewhere already: margin and net on Profit and loss, profitable months on the
net-by-month bars on Home, client concentration on Retainers, contractor share on Contractors, growth on Profit
and loss with compare, cash cushion on Home's cash tile. Its "what a lender will ask for" card was three links.
Nobody arrives at an agency's books with a lender question more than once a year; when they do, Profit and loss
with "last year" and the CPA pack are the answer. The old id and the old Dashboards tab route to Profit and loss.

### Product brand (Lucky, live in its own repo)

The Lucky repo did this audit on 2026-10-10 (`docs/redesign-2026-10-10.md` there) and its rail is the truth:
Home / Money (P&L, Balance sheet, Costs, Taxes) / Cash (Forecast, Plan, Debts) / Books / Store (Products,
Inventory, Orders) / Reports (Statements, CPA pack, Caddie reports). The edition map here now matches it exactly:
Business health, which Lucky never had, is off this map too. Nothing added: a store owner's questions (cash, the
order-by date, stock at cost, margin per product, what is owed) each have a page.

### Household (Tally today, the edition it moves onto)

Tally's people use five things: Home, Spending (buckets, where it went, stores), Bills, Savings, and "Needs a look".
The Step A map had more than that. Cuts and changes:

| Was | Now | Why |
| --- | --- | --- |
| People, a rail destination | a Settings section | "Who spent it" is a person on every row and a filter on Transactions. Two people do not need a page about themselves. |
| Save › Safe to spend, a page | the hero number on This month | It is one number. A page for one number is a detour. |
| Spending › Limits | Spending › Buckets | Tally's word, and the page is the buckets with their limits, not a list of limits. |
| Reports (Month in review, Year) | Review (Month in review, Year) | Nobody at home runs a report. They look back. |
| Settings: Categories, Limits, People | Buckets, People | Limits live on each bucket. One section fewer. |

The household rail is now four destinations: Home (This month) / Spending (Transactions, Buckets, Bills) / Save
(Goals) / Review (Month in review, Year). Their pages arrive with Step C (one-ledger.md section 6); until then
each shows one clear card saying so.

## 3. What is added

Nothing on any rail. The pass found no question without a page. What was missing was the layer above the rail:

- **The books picker** (section 4): the one thing Cole asked for that did not exist anywhere.
- **The helper's edition** (section 5): Cashew thought like an agency controller in every set of books.

## 4. The account model

One product, several completely separate sets of books ("accounts"). A person sees a set of books only because
they were invited to it. Cole sees three because he is on three invite lists, not because the three share anything.

What is true today, and stays true:

| Per set of books | Mobius | Lucky | Home (Tally) |
| --- | --- | --- | --- |
| Deployment | mobius-ledger worker, Mobius Cloudflare | lucky-ledger worker, Lucky Golf Cloudflare | tally worker, personal Cloudflare |
| Database | its own D1 | its own D1 | its own D1 |
| Who may sign in | the Mobius Google session, plus the worker's allowed list | Google, the ALLOWED_EMAILS list plus Settings › Access | Google, the people table |
| Bank links | its own Plaid items | its own | its own |
| Slack | #finance through the Cashew router | #lucky-finance through the Cashew router | none |
| Categories, rules, vendors | its own | its own | its own buckets and rules |

Built today: **the picker**. At the top of the rail, beside the Cashew mark, a small chevron opens "Your books":
the current set marked, the others as links to their own apps, and "Manage the list" under Settings › Access,
where the owner adds or removes a set (name, https address, kind of books) in an in-app modal. The list is kept
with that set's settings (`books`) and returned by `/api/boot`; the three Cole keeps are the default when nothing is
saved. Switching books is a link to another origin, on purpose: nothing on screen carries over, and the other app
asks its own sign-in list who you are. The same picker is in the Lucky app (its own worker keeps its own list)
and in Tally (a fixed list, Tally has no settings page for it).

Not built, and why: a per-person list that follows you across deployments ("Cole sees three, Skylar sees one")
needs one place that knows every deployment and every invite, which is Step D (one deployment, many tenants),
and only exists if Cashew is sold. Until then the owner's list in each set of books is the honest version.

## 5. Cashew the helper, per edition

One brain (the Ask engine), one name in Slack (done 2026-10-14), three ways of thinking. New file
`ask/cashew-playbook.js`: a playbook, a words rule and the list of nightly checks for each edition. The Mobius
worker reads the books' edition at answer time and hands the matching playbook to the engine (the engine now
accepts a function as well as a string); the copy edited in Settings still wins. The product playbook is the
Caddie's own text from the Lucky repo, word for word, so the two agree until the Lucky worker imports the shared
file in Step B. The household playbook leads with safe to spend, judges a bucket by its pace not its total, reads
who spent it from the card, and never scolds.

## 6. Visuals: where a picture answers faster than a number

Kept or wanted, because the picture is the answer: the cash line with its low point (Home, Forecast); net by
month as bars with losses in red (Home); the "bites" stacked bar out of the month's sales (Lucky's Home, the one
picture a store owner reads first); a progress bar per debt (Lucky), per bucket (Tally) and per goal (Tally).

Not wanted, because a number or a list is faster: a donut of spending (a ranked list with amounts replaced it in
Lucky v6 and does here); a scorecard of traffic lights (Business health, cut); charts on Transactions, Receipts,
the statement and the CPA pack; any chart on a Settings page.

## 7. What this pass did not do

- Step B (one worker) and Step C (the household edition on it). Sized at two to four sessions in one-ledger.md;
  the column diff and the order are written in `docs/handoffs/cashew-one-engine.md`. Three live sets of books with
  real money in them: nothing in their schemas was touched today.
- Step D (one deployment, many tenants, a per-person books list). Only if Cashew is sold.
