/* Group metrics: home, this month, profit. Five reads answered here from the shared database, two sent on.
   Access is the old rule for each path (brandguard CLIENT_RULES): a client may read every one of these for
   its own brand, the team for any brand it may see. */
import { overview, client } from './service.js';
import { forecast, plan } from './plan.js';
import { series } from './adseries.js';
import { queries } from './queries.js';

export const name = 'metrics';
export { queries };

const PW = 'profit/worker/src/worker.js';
const AH = 'account-health/worker/src/worker.js';
const WINDOW = { act: 'brand?', days: 'num?', from: 'string?', to: 'string?' };

export const routes = [
  { method: 'GET', path: '/pw/api/overview',
    /* brand none: the old route ignores a named brand and answers every brand of the caller. A named brand
       is still checked (a client or a limited teammate naming another brand is refused). */
    access: { team: true, client: true, brand: 'none' },
    input: { query: { ...WINDOW, cmp: 'string?', series: 'string?', fresh: 'string?' } },
    handler: overview,
    doc: 'Home: every brand of the caller with its window totals, month to date, the day series, the platform split, goals and the cost check. Sent to the old engine when the window includes today or the cost check is old.',
    source: { old: 'pw', file: PW, engine: 'new' } },
  { method: 'GET', path: '/pw/api/client',
    access: { team: true, client: true, brand: 'need' },
    input: { query: WINDOW },
    handler: client,
    doc: 'One brand: the store by day, the totals, month to date, extra costs, the goals and the plan so far. Sent to the old engine when the window includes today or is a single day.',
    source: { old: 'pw', file: PW, engine: 'new' } },
  { method: 'GET', path: '/pw/api/forecast',
    access: { team: true, client: true, brand: 'need' },
    input: { query: { act: 'brand?', month: 'string?' } },
    handler: forecast,
    doc: 'Where the month lands for one brand: spending the budget, at the pace of today, and what it takes to hit the goal.',
    source: { old: 'pw', file: PW, engine: 'new' } },
  { method: 'GET', path: '/pw/api/plan',
    access: { team: true, client: true, brand: 'need' },
    input: { query: { act: 'brand?', month: 'string?' } },
    handler: plan,
    doc: 'The plan of one month for one brand: the last eight months, the basis, the growth choices, what was agreed and the pace.',
    source: { old: 'pw', file: PW, engine: 'new' } },
  { method: 'GET', path: '/ah/api/series',
    access: { team: true, client: true, brand: 'need' },
    input: { query: { act: 'brand?', days: 'num?' } },
    handler: series,
    doc: 'The ad account numbers of one brand a day (spend and delivery from the ad platform, purchases and revenue from the tracker) and the changes to mark on a chart.',
    source: { old: 'ah', file: AH, engine: 'new' } },
  { method: 'GET', path: '/ah/api/overview',
    access: { team: true, client: true, brand: 'opt' },
    input: null,
    handler: 'forward',
    doc: 'The ad account view of every brand: spend, pace against budget, sync state and changes in the last day.',
    source: { old: 'ah', file: AH, engine: 'forward',
      why: 'On the stays on old list of the written plan: it reads the ad account sync state and budgets the old worker keeps.' } },
  { method: 'GET', path: '/pw/api/hub/live',
    access: { team: true, client: true, brand: 'opt' },
    input: null,
    handler: 'forward',
    doc: 'Today so far for one brand or all: sales, ad spend and orders, read live.',
    source: { old: 'pw', file: 'profit/worker/src/hub.js', engine: 'forward',
      why: 'Reads the tracker live for today, which needs a key the engine does not hold.' } },
];
