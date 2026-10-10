# One Ledger: three sets of books, one app (2026-10-10)

Cole: "I have basically 3 ledgers right now, one for Mobius, one for Lucky, and another for my personal. Each
do their own thing and have different uses. But might be easier to combine into one... same idea as Locus,
where there's an agency view and a brand view... what business are you in: agency / service-based, e-commerce
brand, personal... if I were to sell this to other people, they log in to preset stuff but can they also
customize? It should just be preset for the most part. Do that whole entire thought process."

The shareable page of this document: https://claude.ai/artifact/UvsU4xNMyb7KT7qvkhpTuk (private until shared
from its Share menu). This file is the record.

## 1. The short answer

Yes, one product. One shell, one engine, one assistant brain, three editions. But three separate sets of books:
each business keeps its own database, its own bank links, its own Cloudflare account and its own Slack.
One codebase deployed three times is the honest first step. One deployment with many tenants is step four,
and only if the product is sold.

The reason is not taste. The three apps are already one engine in three copies, and the copies are drifting:

| Measured today | Result |
| --- | --- |
| Lucky's `worker.js` lines found verbatim in the Mobius `worker.js` | 2,780 of 4,183 (66%) |
| Lucky's front-end engine (`index.html`) lines found verbatim in the Mobius one | 1,478 of 2,138 (69%) |
| Lucky's assistant engine (`engine.js`) lines found verbatim in `mobius-tools/ask/engine.js` | 718 of 784 (92%) |
| Core tables both workers share | `transactions`, `vendors`, `months`, `settings`, `clients` |
| Lucky's v6 CSS lines found in the Mobius `ledger.css` | 28 of 684 (the look is where they differ most) |

The Mobius Controller already imports the shared Ask engine from `ask/engine.js`; Lucky carries its own copy of
that file and has started to drift from it. Tally is a small rewrite of the same ideas (about 70% of the Mobius
engine, by the person who wrote it). So the question is not "should they merge". It is "stop paying for the
copies". Every fix made in one copy today is hand-carried to the others or lost; the Settings crash fixed in
Lucky v6 came from exactly that kind of move.

## 2. What stays separate, and why

- **Data.** Three D1 databases, three Cloudflare accounts (Mobius, Lucky Golf, personal), three Slack
  workspaces. Privacy for Tally was explicit (Skylar reads it). Lucky's books are a company's books; a CPA
  will tell you never to keep them in the same ledger as a household.
- **Logins.** Mobius Ledger trusts the account-health Google session; Lucky has its own Google login and an
  access list; Tally has its own. One codebase can hold all three ways in, chosen by a setting.
- **Deploys.** Three workers from one `worker/` folder, one wrangler environment per business. Lucky and Tally
  still deploy from the laptop (their wrangler logins live there); Mobius from the Mobius login.

## 3. Editions: what business are you in

Three editions, named by what the owner is, not by what the software does. An edition is a preset: it decides
the default rail, the Settings sections, the starter categories, the assistant's name and playbook, and the
words. The rule is borrowed from Locus's brand and agency editions: an edition never hides what a business
owns; it picks the default and the words. Anything an edition leaves off the rail can be switched on in
Settings.

| | Service business | Product brand | Household |
| --- | --- | --- | --- |
| Who | an agency, a consultant, a studio: Mobius today | a store that sells things: Lucky today | a person or a couple: Tally today |
| Money comes in as | retainers and invoices, Stripe payouts | orders by order date, Shopify payouts | pay cheques, transfers in |
| What is special | clients and retainers, contractors and 1099s, the owner split (50/30/10/5/5), the 30% tax set-aside, fees | cost of goods as units sell, inventory on the balance sheet, products and margin, debts, a 13-week cash forecast, sales tax | spending limits by bucket, bills, savings goals, who spent it, safe to spend |
| The assistant | the Controller | the Caddie | Tally |
| Words | Clients, Transactions, Close the month, CPA pack | Store, Transactions, Close the month, CPA pack | Spending, Month in review; no CPA pack, no balance sheet |
| Accent | Mobius blue | Lucky green | indigo |

### The rail per edition

- **Service business**: Home (Overview) / Money (Profit and loss, Balance sheet, Costs, Taxes) / Cash
  (Forecast, Plan) / Books (Transactions, Receipts, Close) / Clients (Retainers, Invoices and Stripe,
  Contractors) / Reports (Statements, CPA pack, Controller reports). Foot: Settings.
- **Product brand**: exactly Lucky v6 today: Home / Money / Cash (Forecast, Plan, Debts) / Books / Store
  (Products, Inventory, Orders) / Reports (Statements, CPA pack, Caddie reports).
- **Household**: Home (This month) / Spending (Transactions, Limits, Bills) / Save (Goals, Safe to spend) /
  People / Reports (Month in review, Year). Everyday words throughout; the close becomes a soft month in
  review that nobody has to "run".

### Settings per edition

Shared by all: Business (or Household), Accounting, Categories, Vendors, Banks and cards, the assistant and
Slack, Access, Data. Service adds Clients and Money rules (the split and the set-aside). Product adds Shopify.
Household drops Accounting (cash basis only) and the CPA pack, adds People and Limits.

## 4. Customization: presets first, a short list of switches

A new sign-up never configures anything to get a working app. Each edition has a short list of switches, all
in Settings, all explained in one sentence, none needing a manual:

| Switch | Editions | Default |
| --- | --- | --- |
| Count sales when earned or when paid (accrual or cash) | Service, Product | Service: cash; Product: accrual from a cutover month |
| Show the balance sheet | all | on for Service and Product, off for Household |
| Slack: receipts, the briefing, questions | all | off until a channel is connected |
| Who spent it (a person on every row) | Household, Service | on for Household |
| The owner split and the tax set-aside | Service | on, 50/30/10/5/5 and 30% |
| Inventory on the balance sheet, cost of goods as units sell | Product | on |
| The assistant's name | all | the edition's name |
| Categories | all | editable always; the edition only seeds the list |

Nothing else. If a second customer asks for a fourth thing, it becomes a switch only when two customers ask.

### The first five minutes

1. Sign in with Google. One question: what are you keeping books for? Service business, product brand,
   household. The rail, words and categories appear.
2. Name the business (or the household) and pick the tax rate if there is one.
3. Connect a bank. Rows land within a minute; the vendor rules start learning on the first category you set.
4. The assistant says hello in the ask bar with three questions it can already answer from the rows it sees.
5. Overview shows cash in the bank and this month so far. The one upkeep ask is "Needs you".

Shopify, Stripe, Slack, Drive and the CPA pack are offered in Settings afterwards, never in the first run.

## 5. The assistant: one brain, three names

Lucky's `engine.js` header already says it: "One brain, many names." The Controller (Mobius), the Caddie
(Lucky) and Tally are the same engine with a different config: who it is, which tables and rules, what it may
propose, and the nightly checks. The checks differ by edition (duplicate payments, a bill that did not arrive,
price creep, ads as a share of sales, cash below zero, uncategorized rows, receipts, missing product costs, a
stale bank feed for Product; retainer not paid, Stripe fees off, 1099 totals for Service; a bucket over its
limit, a bill due, a goal behind for Household). The assistant has no page of its own in any edition: its
findings and briefing sit on Home, its chats and reports under Reports, and "Run the checks now" is a
maintenance button in Settings. That change shipped in Lucky today.

## 6. Bringing the three engines back under one: order and cost

Lucky's engine is the most complete (Plaid, Shopify, Google login, the access list, the cash forecast, debts,
the Caddie on the shared Ask engine). Mobius's is the original and carries the audit controls Lucky lacks:
seven migrations for closed-period guards, revision and provenance, leases, policy and close history, receipt
allocations and versions, bank provenance, plus the Gmail receipt hunt and R2 receipts. Tally is the smallest
and the most different.

| Step | What | Size | Risk |
| --- | --- | --- | --- |
| A. One shell | The v6 front end (`ledger.css`, `icons.js`, `lg-core.js`, the screens) moves into `mobius-tools/ledger/` with an `edition` setting the rail, Settings and words read. The Mobius engine stays and is overridden by name, as Lucky does. Mobius gets the Service rail, blue accent, a Clients group. | About one session: Lucky v6 took one on an engine 69% the same | Low: the engine is untouched; every old id still routes |
| B. One worker | Lucky's worker becomes the base. Mobius's seven migrations are added as additive migrations; the Controller moves onto `engine.js` as a config like `caddie-config.js`; agency routes (clients, the split, Stripe) and store routes (Shopify, cost of goods, debts) sit behind the edition; the server refuses routes the edition does not have, as Locus's brandguard does. Three wrangler environments. | Two to three sessions. First task: a column-by-column diff of the two schemas inside the five shared tables | Medium: two live sets of books. Every change additive; never a destructive column change; closed months stay frozen |
| C. The household edition | Tally's buckets become categories with limits, goals and people become two new tables, everyday words become the Household word map. Tally keeps running until the edition matches it; Skylar's data moves by export and import, once, on a chosen day. | One to two sessions, after B | Low on the books, high on feel: the household words must stay simple |
| D. Sold to others | One deployment, many tenants, billing, onboarding. | Not sized | Only when a second customer exists |

While A and B are in flight, feature work on the Mobius copy stops; a fix lands in Lucky and is carried once.

## 7. The name

"Ledger" is the placeholder. Three options, none checked for trademark, none blocking any work (the folder
stays `ledger/` either way):

- **Ledger.** Already the word in all three apps and in Cole's head. Plain. Weakest as a brand and hard to
  search for.
- **Tally.** Already the household app's name, warm, easy to say, works for all three editions ("Tally for a
  service business"). Crowded: Tally.so (forms) and TallyPrime (accounting software in India) exist.
- **Plain Books.** Says what it is and what it is not (QuickBooks). Two words, easy to own. Least personality.

Recommendation: keep Ledger until there is a second customer; then decide with the customer's words in hand.

## 8. Risks, written down

- Three live apps with real money in them. Migrations additive only. The close stays frozen.
- Lucky and Tally deploys need the laptop. The cloud commits and pushes; Cole deploys.
- The two schemas have drifted inside shared tables. Nothing merges until the column diff is read.
- Editions on the server, not only in the rail: a Household tenant must not be able to call the CPA pack.
  Not a worry while Cole is the only user; a requirement the day it is sold.
- Simplicity: every switch added is a question a new user has to answer. The list in section 4 is the cap.

## 9. What Cole decides

1. One product, three editions, three separate sets of books: yes or no.
2. The edition names: Service business, Product brand, Household.
3. Step A as the next build: the v6 shell into `ledger/` for the Mobius books, blue accent, an `edition`
   setting. On his word, it starts.
4. The name, whenever.
