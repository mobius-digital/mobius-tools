# Handoff: the money shell, Step A (2026-10-11)

Branch `ledger-shell-a`, folder `ledger/`. The plan: docs/two-products.md section 7 (session A) and
docs/one-ledger.md section 6 (Step A). What Lucky did first: docs/redesign-2026-10-10.md in the Lucky repo.
Not merged to main (main is the GitHub Pages site, so a merge is a deploy). No pull request opened.

## What changed

- **The v6 shell on the Mobius books.** `ledger/index.html` keeps the engine (the inline script, 3,400 lines)
  untouched. The markup above it is now Lucky's: a rail of destinations, a top bar with the ask bar and the
  period or month control, page tabs under it, one main, a phone tab bar. Chart.js and Archivo are gone; Inter
  and SVG charts are in. Seven files load after the engine and override it by name (`show`, `paintNav`,
  `setChip`, `monthNav`, `renderGate`, `boot`, `toggleTheme`, `renderSettings`, `renderClose`,
  `renderOverview`, `renderReports`, `renderDashboards`, `draw`, `chartOpts`, `loadChart`).
- **`ledger/lg-edition.js`**: the three editions in one file: rail, phone bar, Settings sections, words,
  ask-bar suggestions, and the "not connected" sentences. `ED` is the current edition, `word('key')` the
  words, `notConnectedCard()` the stub. Extend here.
- **`ledger/lg-core.js`**: the shell (NAV from the edition, LEGACY routing, the rail, tabs, top bar, the
  period pill menu around the engine's `RP`), the components (tile, card, empty, error, skeletons,
  `rankList`, `pageHead`), the SVG charts (spark, lineChart, barChart, wireLine), and the `draw()` override
  that turns the engine's Chart.js configs into the same SVG (the cash forecast repaints through
  `CH[key].update()` as before).
- **Screens**: `lg-home.js` (Overview), `lg-money.js` (Profit and loss, Balance sheet, Costs, Taxes,
  Business health), `lg-cash.js` (Forecast, Plan on the engine's `cfCalc`/`cfPaint`), `lg-books.js` (the
  Close checklist in the v6 layout, Retainers, Invoices and Stripe, Contractors, Statements, CPA pack,
  Controller reports), `lg-settings.js` (sections per edition, the edition switch, the Controller wiring).
- **`ledger/ledger.css`**: Lucky's v6 stylesheet with the Ledger green from `/mobius.css`
  (`--brand #5CC395`, `--brand-ink #1F6B50` for text and links), plus every class the engine's own markup
  still uses (Transactions, Receipts, the statement, the CPA pack preview, the modals, the settings cards,
  the phone row-card tables). The engine's old token names (`--paper`, `--card`, `--accent`, `--c1..8`) are
  aliased so untouched engine code keeps its colours.
- **`ledger/icons.js`**: the Lucide sprite (identical to `profit/icons.js`).
- **The worker** (`ledger/worker/src/worker.js`): `edition` is stored with the other settings
  (`PUT /api/settings { edition }`, one of service, product, household) and returned by `/api/boot`.
  Default `service`. Not deployed from here; deploy the Mobius worker as usual. Until it is deployed the
  front end keeps the edition in `localStorage` (`ledger_edition`) and says so in a toast when the save fails.

## The map

Every old view id still routes: `dash` and `caddie` to Overview, `forecast` to Cash › Forecast, `reports`
to the page its tab became (pnl, statements, forecast, taxes, pack), `dashboards` likewise (performance to
Profit and loss, clients to Retainers, spending to Costs, health to Business health), unknown ids to Overview.

| Edition | Rail | Settings |
| --- | --- | --- |
| Service (Mobius) | Home (Overview) / Money (Profit and loss, Balance sheet, Costs, Taxes) / Cash (Forecast, Plan) / Books (Transactions, Receipts, Close) / Clients (Retainers, Invoices and Stripe, Contractors) / Reports (Statements, CPA pack, Controller reports, Business health) | Business, Money rules, Clients, Categories, Vendors, Banks and cards, Slack and the Controller, Access, Data |
| Product (Lucky v6) | Home / Money / Cash (Forecast, Plan, Debts) / Books / Store (Products, Inventory, Orders) / Reports (Statements, CPA pack, Caddie reports, Business health) | Business, Accounting, Categories, Vendors, Banks and cards, Shopify, Slack and the Caddie, Access, Data |
| Household | Home (This month) / Spending (Transactions, Limits, Bills) / Save (Goals, Safe to spend) / People / Reports (Month in review, Year) | Household, Categories, Limits, People, Banks and cards, Slack and Tally, Access, Data |

Business health was added under Reports (one page, not in the plan's list) so the Dashboards › Business
health scorecard was not cut. Pages whose data this engine does not have (Debts, Products, Inventory,
Orders, Accounting, Shopify, Limits, Bills, Goals, Safe to spend, People) draw one clear card with a sentence
and two buttons, never a crash.

## What was verified

Playwright (Chromium at /opt/pw-browsers) against `python -m http.server`-style static serving
(`http-server` on the repo root) with every `/api/*` route stubbed with plausible JSON (the script is in
this session's scratchpad, not in the repo):

- No token: the gate renders, the rail and top bar are hidden, no console error.
- Fake token, each edition: every rail page and every Settings section renders with zero console errors and
  zero page errors; the lead sentence under each title is filled; stub pages show the card.
- Every old id routes as listed above; every rail group click lands on the group's last page; the period
  menu opens and picks; the ask bar lists page jumps and the edition's questions, and Enter on "Settings"
  jumps there; dark mode draws; at 375 wide the phone tab bar shows and there is no horizontal scroll.
- The edition switch in Settings › Business re-draws the rail and the sections at once and PUTs the setting.
- `node --check` passes on every new file and on the worker.

## Not verified, and what is not done

- **Against the real worker.** Everything ran on stubbed JSON. The hosted engine tabs (Statement, Taxes,
  the CPA pack preview, Transactions, Receipts, the modals) kept their logic, but open the live app once
  and click through Books and Reports before trusting it. Deploy the worker so the edition is kept
  server-side.
- **The drill panel** (click a number, see every charge behind it) needs Lucky's `/api/drill` route, which
  the Mobius worker does not have. Tiles link to pages instead. It arrives with Step B.
- **Kept green**: the accent is the money app's green from `/mobius.css` now; the Kept kit (session B)
  may change it. One token block.
- **"The Tally"**: ask-ui.js says "The ${name}" everywhere, so the Household helper reads "The Tally".
  A one-line fix in ask-ui.js when the name lands (session F).
- **The product and household editions are shells**: the right rail, words and sections on the Mobius
  engine's data. Their own pages come with Step B (one worker) and Step C (the household edition).
- The old `.fab`, `.sheet` and `.mtop` phone pieces of the engine are hidden by CSS, not removed; the
  engine's `openAddSheet` is unreachable now (Add a transaction and Upload receipts sit on Overview and
  Transactions).

## How to review it

1. Check out `ledger-shell-a`, serve the repo root (`npx http-server . -p 8765`), open
   `http://127.0.0.1:8765/ledger/`.
2. Sign in as usual (Mobius HQ) or paste the administrator token under the gate's "Use an administrator
   token"; the worker URL field is still there.
3. Walk the rail: Home, Money (four tabs), Cash (two), Books (three), Clients (three), Reports (four),
   Settings (nine sections). Every page opens with a sentence under its title.
4. Settings › Business: switch to Product brand and Household and back. Every page still opens.
5. Phone: narrow the window to 375. The tab bar appears; More opens the rail as a drawer.
