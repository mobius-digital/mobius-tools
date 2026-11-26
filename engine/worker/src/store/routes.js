/* Group store: sales, customers, email, website, funnel (CONTRACT.md section 5 and 10).
   Four reads are answered here from the shared database. Five need an outside service and are
   forwarded to the old account-health worker.
   Access comes from the old brand guard's list: every path here is open to a client for its own
   brand, and the client must name that brand. */
import * as s from './service.js';
import { queries } from './queries.js';

export const name = 'store';
export { queries };

/* A client may read these for its own brand and must name it. The team may name one brand or none. */
const open = { team: true, client: true, brand: 'need' };
const dates = { act: 'brand?', days: 'string?', from: 'string?', to: 'string?' };
const hubInput = { query: { ...dates, model: 'string?', cmp: 'string?' } };
const ported = file => ({ old: 'pw', file, engine: 'new' });
const forwarded = (file, why) => ({ old: 'ah', file, engine: 'forward', why });

export const routes = [
  { method: 'GET', path: '/pw/api/customers', access: open,
    input: { query: { ...dates, months: 'string?', journey: 'string?' } }, handler: s.customers,
    doc: 'What a new customer costs, whether the first order pays it back, and the customer journey of one brand. Forwards when the brand has its own cost rules or the kept product names are over a day old.',
    source: ported('profit/worker/src/worker.js') },
  { method: 'GET', path: '/pw/api/hub/store', access: open, input: hubInput, handler: s.hubStore,
    doc: 'Sales, orders, discounts, returns, new against returning and what sells, by brand and by day. Forwards when the kept product names are over a day old.',
    source: ported('profit/worker/src/hub.js') },
  { method: 'GET', path: '/pw/api/hub/email', access: open, input: hubInput, handler: s.hubEmail,
    doc: 'Email and text sales, campaigns against flows and the share of store sales, by brand and by day.',
    source: ported('profit/worker/src/hub.js') },
  { method: 'GET', path: '/pw/api/hub/stockads', access: open, input: { query: { act: 'brand?' } }, handler: s.hubStockAds,
    doc: 'The ad spend tied to each product over the last 30 days, from the orders each ad won. Forwards when many brands are asked at once.',
    source: ported('profit/worker/src/hub.js') },

  { method: 'GET', path: '/ah/api/klaviyo', access: open, input: null, handler: 'forward',
    doc: 'Email tool numbers for one brand: lists, campaigns, flows, daily joins and leaves.',
    source: forwarded('account-health/worker/src/klaviyo.js', 'reads the email tool live with the brand\'s own key, which the engine does not hold') },
  { method: 'GET', path: '/ah/api/google/website', access: open, input: null, handler: 'forward',
    doc: 'Website visits, carts, checkouts and pages for one brand.',
    source: forwarded('account-health/worker/src/google.js', 'reads the website analytics tool live with a key the engine does not hold') },
  { method: 'GET', path: '/ah/api/google/search', access: open, input: null, handler: 'forward',
    doc: 'What people search before they reach the site, for one brand.',
    source: forwarded('account-health/worker/src/google.js', 'reads the search tool live with a key the engine does not hold') },
  { method: 'GET', path: '/ah/api/clarity', access: open, input: null, handler: 'forward',
    doc: 'Scroll depth, rage clicks and dead clicks per page, for one brand.',
    source: forwarded('account-health/worker/src/clarity.js', 'reads the site recording tool live with the brand\'s own token, which the engine does not hold') },
  { method: 'GET', path: '/ah/api/supply/client', access: open, input: null, handler: 'forward',
    doc: 'The stock state of one brand: what is on hand, on order and running low.',
    source: forwarded('account-health/worker/src/stock.js', 'reads the stock worker with a token the engine does not hold') },
];
