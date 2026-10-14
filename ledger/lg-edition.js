/* Mobius Ledger, the editions (2026-10-11, Step A of docs/one-ledger.md).
   One file holds everything an edition changes: the rail, the phone tab bar,
   the Settings sections, the page words and the ask-bar suggestions. An
   edition never hides data; it picks the default map and the words. The
   engine (index.html's inline script) does not know editions exist.

   Three editions:
     service    an agency, a consultant, a studio (the Mobius books today)
     product    a store that sells things (the Lucky v6 map)
     household  a person or a couple (everyday words)

   The setting is kept by the worker with the other settings (PUT /api/settings
   { edition }) and read from /api/boot. A copy sits in localStorage so the
   right rail draws before the worker answers.

   Reading it from a screen:
     ED            the current edition object (ED.id, ED.nav, ED.words ...)
     word('key')   one word or phrase, with a plain fallback
     edPage(id)    the nav entry for a page id, or null when the edition does
                   not list it (every old id still routes through LEGACY)
   A page the engine has no data for is listed in ED.stub with the sentence
   the "not connected in this edition yet" card shows. */
'use strict';

const EDITIONS = {
  service: {
    id: 'service', label: 'Service business',
    hint: 'An agency, a consultant, a studio. Clients and retainers, Stripe, contractors, the owner split and the tax set-aside.',
    assistant: 'Cashew', by: 'Mobius Digital', business: 'Business',
    nav: [
      { id: 'home', label: 'Home', icon: 'home', pages: [['overview', 'Overview']] },
      { id: 'money', label: 'Money', icon: 'chart-line', pages: [['pnl', 'Profit and loss'], ['balance', 'Balance sheet'], ['costs', 'Costs'], ['taxes', 'Taxes']] },
      { id: 'cash', label: 'Cash', icon: 'dollar', pages: [['forecast', 'Forecast'], ['plan', 'Plan']] },
      { id: 'books', label: 'Books', icon: 'receipt', pages: [['txns', 'Transactions'], ['receipts', 'Receipts'], ['close', 'Close']] },
      { id: 'clients', label: 'Clients', icon: 'users', pages: [['retainers', 'Retainers'], ['invoices', 'Invoices and Stripe'], ['contractors', 'Contractors']] },
      { id: 'reports', label: 'Reports', icon: 'file-chart', pages: [['statements', 'Statements'], ['pack', 'CPA pack'], ['creports', 'Cashew reports']] },
    ],
    phone: ['home', 'money', 'cash', 'books'],
    settings: [
      ['business', 'Business', 'building'], ['money', 'Money rules', 'sliders'], ['clients', 'Clients', 'users'], ['categories', 'Categories', 'tag'],
      ['vendors', 'Vendors', 'store'], ['banks', 'Banks and cards', 'landmark'], ['slack', 'Slack and Cashew', 'message'], ['access', 'Access', 'key'], ['data', 'Data', 'refresh'],
    ],
    stub: {},
    words: {
      revenue: 'Revenue', revenueLow: 'revenue', net: 'Net income', netLow: 'net income', spend: 'Expenses', spendLow: 'expenses',
      payer: 'client', payers: 'clients', moneyIn: 'Money in', moneyOut: 'Money out', close: 'Close the month', statement: 'Monthly statement',
      pack: 'CPA pack', fees: 'Stripe fees', homeTitle: 'Overview', homeLead: 'what the business has, what the month is doing, what needs you',
      thisMonth: 'This month', report: 'Report',
    },
    ask: {
      overview: ['Who has not paid this month?', 'Why was last month a loss?', 'What did we spend on contractors this year?', 'What is due to the CPA next?'],
      pnl: ['Which expense grew the most vs last year?', 'What is our margin this year?', 'Where did last month\'s money go?'],
      forecast: ['Can we afford a new hire in January?', 'What happens if a client leaves?', 'What is the lowest cash point ahead?'],
      txns: ['What is still uncategorized?', 'Which expenses are missing a receipt?', 'Any charge that looks doubled this month?'],
      retainers: ['Which client is the biggest share of revenue?', 'Who paid late this year?'],
      contractors: ['Who needs a 1099 this year?'],
    },
  },
  product: {
    id: 'product', label: 'Product brand',
    hint: 'A store that sells things. Sales by order, cost of goods, inventory, debts and a cash forecast.',
    assistant: 'Caddie', by: 'Product brand', business: 'Business',
    nav: [
      { id: 'home', label: 'Home', icon: 'home', pages: [['overview', 'Overview']] },
      { id: 'money', label: 'Money', icon: 'chart-line', pages: [['pnl', 'Profit and loss'], ['balance', 'Balance sheet'], ['costs', 'Costs'], ['taxes', 'Taxes']] },
      { id: 'cash', label: 'Cash', icon: 'dollar', pages: [['forecast', 'Forecast'], ['plan', 'Plan'], ['debts', 'Debts']] },
      { id: 'books', label: 'Books', icon: 'receipt', pages: [['txns', 'Transactions'], ['receipts', 'Receipts'], ['close', 'Close']] },
      { id: 'store', label: 'Store', icon: 'store', pages: [['products', 'Products'], ['inventory', 'Inventory'], ['orders', 'Orders']] },
      { id: 'reports', label: 'Reports', icon: 'file-chart', pages: [['statements', 'Statements'], ['pack', 'CPA pack'], ['creports', 'Caddie reports']] },
    ],
    phone: ['home', 'money', 'cash', 'books'],
    settings: [
      ['business', 'Business', 'building'], ['accounting', 'Accounting', 'calculator'], ['categories', 'Categories', 'tag'], ['vendors', 'Vendors', 'store'],
      ['banks', 'Banks and cards', 'landmark'], ['shopify', 'Shopify', 'shopping-bag'], ['slack', 'Slack and the Caddie', 'message'], ['access', 'Access', 'key'], ['data', 'Data', 'refresh'],
    ],
    stub: {
      debts: 'Debts (Shopify Capital, Kickfurther, other loans) live in the Lucky engine. They reach this engine in Step B, one worker for every edition.',
      products: 'Products and margin need Shopify orders and unit costs. This engine has no store connection yet; Step B brings the Lucky routes over.',
      inventory: 'Inventory on hand at cost needs the Shopify sync and the cost book. Not connected in this engine yet.',
      orders: 'Orders, units and the average order come from Shopify. Not connected in this engine yet.',
      accounting: 'How sales are counted (order date or payout date) and when product cost counts are Lucky engine settings. They arrive with Step B.',
      shopify: 'The Shopify sync (orders, refunds, payouts, cost per item) is not connected in this engine yet.',
    },
    words: {
      revenue: 'Sales', revenueLow: 'sales', net: 'Net profit', netLow: 'net profit', spend: 'Expenses', spendLow: 'expenses',
      payer: 'customer', payers: 'customers', moneyIn: 'Money in', moneyOut: 'Money out', close: 'Close the month', statement: 'Monthly statement',
      pack: 'CPA pack', fees: 'Card and Stripe fees', homeTitle: 'Overview', homeLead: 'cash now, this month\'s sales and profit, what needs you',
      thisMonth: 'This month', report: 'Report',
    },
    ask: {
      overview: ['Why is this month a loss?', 'What did we spend on ads this month?', 'How much cash will we have in six weeks?'],
      pnl: ['Which expense grew the most vs last year?', 'What is our gross margin this year?'],
      forecast: ['When is the tightest week?', 'Can we afford a big order next month?'],
      txns: ['What is still uncategorized?', 'Which expenses are missing a receipt?'],
    },
  },
  household: {
    id: 'household', label: 'Household',
    hint: 'A person or a couple. What came in, what went out, what is left, bills and savings goals, in everyday words.',
    assistant: 'Tally', by: 'Household', business: 'Household',
    /* Four destinations, by the question: how are we doing this month (Home),
       where is it going (Spending), what are we putting away (Save), how did
       the month or the year go (Review). "Who spent it" is a person on every
       row and a filter on Transactions, not a destination; "safe to spend" is
       the hero number on This month, not a page. People is a Settings section. */
    nav: [
      { id: 'home', label: 'Home', icon: 'home', pages: [['overview', 'This month']] },
      { id: 'spending', label: 'Spending', icon: 'receipt', pages: [['txns', 'Transactions'], ['limits', 'Buckets'], ['bills', 'Bills']] },
      { id: 'save', label: 'Save', icon: 'dollar', pages: [['goals', 'Goals']] },
      { id: 'reports', label: 'Review', icon: 'file-chart', pages: [['statements', 'Month in review'], ['pnl', 'Year']] },
    ],
    phone: ['home', 'spending', 'save', 'reports'],
    settings: [
      ['business', 'Household', 'building'], ['categories', 'Buckets', 'tag'], ['people', 'People', 'users'],
      ['banks', 'Banks and cards', 'landmark'], ['slack', 'Tally', 'message'], ['access', 'Access', 'key'], ['data', 'Data', 'refresh'],
    ],
    stub: {
      limits: 'Buckets with a monthly limit each (groceries, eating out, gas and car, kids) come with the Household edition in Step C. Until then the Transactions page shows where the money went.',
      bills: 'Bills and their due dates, found in the bank feed or added by hand, come with the Household edition in Step C.',
      goals: 'Savings goals (what you want, what you have, by when) come with the Household edition in Step C.',
      people: 'Who spent it, a person on every row by the card that paid, comes with the Household edition in Step C.',
    },
    words: {
      revenue: 'Money in', revenueLow: 'money in', net: 'Left over', netLow: 'left over', spend: 'Spent', spendLow: 'spending',
      payer: 'payer', payers: 'payers', moneyIn: 'Money in', moneyOut: 'Money out', close: 'Month in review', statement: 'Month in review',
      pack: 'Year end', fees: 'Fees', homeTitle: 'This month', homeLead: 'what came in, what went out, what is safe to spend',
      thisMonth: 'This month', report: 'Review',
    },
    ask: {
      overview: ['What did we spend on food this month?', 'What is safe to spend this month?', 'Which bills are due next?'],
      txns: ['What is still uncategorized?', 'What was the biggest purchase this month?', 'What did Skylar spend this week?'],
      limits: ['Which bucket is running hot?'],
      pnl: ['How much did we save this year?', 'Which month did we spend the most?'],
    },
  },
};
const EDITION_ORDER = ['service', 'product', 'household'];
const EDITION_LS = 'ledger_edition';

/* The current edition: the worker's answer first, then the browser's copy, then Service (the Mobius books). */
let ED = EDITIONS[(() => { try { return localStorage.getItem(EDITION_LS); } catch (e) { return null; } })()] || EDITIONS.service;
function pickEdition(id) {
  ED = EDITIONS[id] || EDITIONS.service;
  try { localStorage.setItem(EDITION_LS, ED.id); } catch (e) {}
  return ED;
}
function word(k, fallback) { return (ED.words && ED.words[k]) || fallback || k; }
function edPage(id) { for (const g of ED.nav) for (const p of g.pages) if (p[0] === id) return { group: g, id: p[0], label: p[1] }; return null; }
function edTitles() { const t = {}; for (const g of ED.nav) for (const p of g.pages) t[p[0]] = p[1]; t.settings = 'Settings'; return t; }

/* The card a page shows when its data is not in this engine yet. Never a crash, never a blank. */
function notConnectedCard(id, title) {
  const why = ED.stub[id] || 'This page is not connected in this edition yet.';
  return `<section class="card"><div class="empty"><i>${window.icon ? window.icon('plug', 20) : ''}</i>
    <span><b>${title} is not connected in this edition yet.</b><br>${why}</span>
    <span class="row" style="justify-content:center"><button class="btn" onclick="show('overview')">Back to Home</button><button class="btn ghost" onclick="SET.sec='business';show('settings')">Change the edition</button></span></div></section>`;
}

/* ================= the books (the account model, step 2 of the Cashew pass) =================
   Cashew is one product; a person keeps several completely separate sets of
   books ("accounts"): a business, a store, a household. Each set is its own
   deployment (its own Cloudflare account, D1, bank links, invites, Slack
   channel, categories, rules). Nothing is shared and nothing carries over:
   switching books is a link to another origin, and that origin asks its own
   sign-in list who you are. The list below is the owner's own list of the
   books they keep, kept with this set's settings (PUT /api/settings { books })
   and returned by /api/boot; these three are the default for Cole. A per-person
   list across deployments (Step D) only exists once Cashew is sold. */
const BOOKS_DEFAULT = [
  { id: 'mobius', name: 'Mobius Digital', edition: 'service', url: 'https://tools.go-mobius-digital.com/ledger/' },
  { id: 'lucky', name: 'Lucky Golf', edition: 'product', url: 'https://ledger.luckygolf.com/' },
  { id: 'tally', name: 'Home', edition: 'household', url: 'https://tally.scwetzler.workers.dev/' },
];
/* Which entry is this deployment: the one whose host (and path, when it has one) matches where we are. */
function booksHere(list) {
  const hub = hubBooks(); if (hub) return (list || []).find(b => b.id === hub) || null;
  const here = location.host.toLowerCase(), path = location.pathname.toLowerCase();
  return (list || []).find(b => { try { const u = new URL(b.url); return u.host.toLowerCase() === here && path.startsWith(u.pathname.replace(/\/$/, '').toLowerCase()); } catch (e) { return false; } }) || null;
}
function booksList() {
  const l = (window.S && S.boot && Array.isArray(S.boot.books) && S.boot.books.length) ? S.boot.books : BOOKS_DEFAULT;
  return l.filter(b => b && b.url && b.name);
}
/* On the hub (one link for every set of books) the hub's cookie says which books this page is,
   and switching is /switch?to=<id> on the same address instead of a hop to another origin. */
function hubBooks() { const m = document.cookie.match(/(?:^|;\s*)cashew_books=([a-z]+)/); return m ? m[1] : null; }
function booksLink(b) { return hubBooks() ? '/switch?to=' + encodeURIComponent(b.id) : b.url; }
