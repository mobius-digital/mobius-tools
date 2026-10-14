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
      { id: 'reports', label: 'Reports', icon: 'file-chart', pages: [['statements', 'Statements'], ['pack', 'CPA pack'], ['creports', 'Cashew reports'], ['health', 'Business health']] },
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
      { id: 'reports', label: 'Reports', icon: 'file-chart', pages: [['statements', 'Statements'], ['pack', 'CPA pack'], ['creports', 'Caddie reports'], ['health', 'Business health']] },
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
    hint: 'A person or a couple. Spending limits, bills, savings goals and who spent it, in everyday words.',
    assistant: 'Tally', by: 'Household', business: 'Household',
    nav: [
      { id: 'home', label: 'Home', icon: 'home', pages: [['overview', 'This month']] },
      { id: 'spending', label: 'Spending', icon: 'receipt', pages: [['txns', 'Transactions'], ['limits', 'Limits'], ['bills', 'Bills']] },
      { id: 'save', label: 'Save', icon: 'dollar', pages: [['goals', 'Goals'], ['safe', 'Safe to spend']] },
      { id: 'people', label: 'People', icon: 'users', pages: [['people', 'People']] },
      { id: 'reports', label: 'Reports', icon: 'file-chart', pages: [['statements', 'Month in review'], ['pnl', 'Year']] },
    ],
    phone: ['home', 'spending', 'save', 'reports'],
    settings: [
      ['business', 'Household', 'building'], ['categories', 'Categories', 'tag'], ['limits', 'Limits', 'sliders'], ['people', 'People', 'users'],
      ['banks', 'Banks and cards', 'landmark'], ['slack', 'Slack and Tally', 'message'], ['access', 'Access', 'key'], ['data', 'Data', 'refresh'],
    ],
    stub: {
      limits: 'Spending limits by category come with the Household edition in Step C. Until then the Transactions page shows where the money went.',
      bills: 'Bills and their due dates come with the Household edition in Step C.',
      goals: 'Savings goals come with the Household edition in Step C.',
      safe: 'Safe to spend (what is left after bills and goals) comes with the Household edition in Step C.',
      people: 'Who spent it, a person on every row, comes with the Household edition in Step C.',
    },
    words: {
      revenue: 'Money in', revenueLow: 'money in', net: 'Left over', netLow: 'left over', spend: 'Spent', spendLow: 'spending',
      payer: 'payer', payers: 'payers', moneyIn: 'Money in', moneyOut: 'Money out', close: 'Month in review', statement: 'Month in review',
      pack: 'Year end', fees: 'Fees', homeTitle: 'This month', homeLead: 'what came in, what went out, what is left',
      thisMonth: 'This month', report: 'Review',
    },
    ask: {
      overview: ['What did we spend on food this month?', 'What is left to spend this month?', 'Which bills are due next?'],
      txns: ['What is still uncategorized?', 'What was the biggest purchase this month?'],
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
