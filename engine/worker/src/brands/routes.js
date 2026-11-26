/* Group brands: brands, goals, rules, costs, expenses (CONTRACT.md sections 3, 5 and 10).
   Ported: the brand lists, the goal and budget save, the brand page and the rules read.
   Forwarded: everything on the Costs page (its reads need the day by day money model, its writes change
   what profit shows), the rules save, and the outside connections. Each row says why. */
import * as s from './service.js';
import { queries } from './queries.js';

export const name = 'brands';
export { queries };

const AH = 'account-health/worker/src';
const PW = 'profit/worker/src';

/* What a client login may change on its own brand (the old BRAND_FIELDS list). */
const BRAND_FIELDS = ['name', 'monthly_budget', 'budgets', 'tz', 'target_cpa', 'target_roas', 'goals'];

/* Every write on the old profit worker also clears that worker's short answer cache (its memo.js), so a
   save is never followed by an old number from it. The engine cannot clear it, so these writes are sent on. */
const CLEARS_OLD_CACHE = 'the old profit worker clears its answer cache on every write, which the engine cannot do';
const MONEY_MODEL = 'needs the day by day money model (cost check, last 30 days of costs), which the metrics group owns';
const REGRADES = 'changes what profit shows, grades the cost check again and stores the grade';

const forward = (method, path, file, doc, why, access, input = null) =>
  ({ method, path, access, input, handler: 'forward', doc, source: { old: path.slice(1, 3), file, engine: 'forward', why } });

const teamOnly = { team: true, client: false, brand: 'none' };
const ownBrand = { team: true, client: true, brand: 'need' };

export const routes = [
  { method: 'GET', path: '/ah/api/brands',
    access: teamOnly,
    input: { query: {} },
    handler: s.listBrands,
    doc: 'Every brand with its status, channels, goals and connections, and the kinds a connection can be. A teammate with a brand list gets those brands only.',
    source: { old: 'ah', file: `${AH}/brands.js`, engine: 'new' } },

  { method: 'GET', path: '/ah/api/accounts',
    access: { team: true, client: true, brand: 'none' },
    input: { query: {} },
    handler: s.listAccounts,
    doc: 'The brands in the old row shape (budgets and goals read out), the ad accounts no brand has yet, and when the last scan ran. A client gets its own brands and no scan stamp (noDiscover).',
    source: { old: 'ah', file: `${AH}/worker.js`, engine: 'new' } },

  { method: 'PUT', path: '/ah/api/accounts/:id',
    access: { team: true, client: true, brand: 'path', fields: BRAND_FIELDS },
    input: { body: null },
    handler: s.saveAccount,
    doc: 'Save the name, time zone, budgets and goals of one brand: one row. A body with status, channels, the brief switch or the tracker shop is sent on to the old engine.',
    source: { old: 'ah', file: `${AH}/worker.js`, engine: 'new' } },

  { method: 'GET', path: '/pw/api/brand',
    access: ownBrand,
    input: { query: { act: 'brand?' } },
    handler: s.readBrand,
    doc: 'The research, angle library and creative tests of one brand, with their numbers. A client never gets stored keys of outside tools (noDocSecrets).',
    source: { old: 'pw', file: `${PW}/brand.js`, engine: 'new' } },

  { method: 'GET', path: '/pw/api/brand/rules',
    access: ownBrand,
    input: { query: { act: 'brand?' } },
    handler: s.readRules,
    doc: 'The test and call rules of one brand, with its goal ROAS.',
    source: { old: 'pw', file: `${PW}/brand.js`, engine: 'new' } },

  forward('PUT', '/pw/api/brand/rules', `${PW}/brand.js`,
    'Save test and call rules for one brand. The old worker merges one name at a time.',
    CLEARS_OLD_CACHE, ownBrand, { body: { rules: 'json?' }, loose: true }),

  forward('GET', '/pw/api/costs', `${PW}/worker.js`,
    'The Costs page of one brand: the cost check, where each cost comes from, the rules, fixed costs and what is missing.',
    MONEY_MODEL, ownBrand, { query: { act: 'brand?', days: 'int?' } }),

  forward('PUT', '/pw/api/costs', `${PW}/costs.js`,
    'Add one shipping or product cost rule, or change one by id. The old worker answers with the whole Costs page.',
    REGRADES, ownBrand, { body: { rule: 'json' }, loose: true }),

  forward('DELETE', '/pw/api/costs', `${PW}/costs.js`,
    'Remove one cost rule (id) or one uploaded cost sheet (sheet). The old worker answers with the whole Costs page.',
    REGRADES, ownBrand, { query: { act: 'brand?', id: 'int?', sheet: 'string?' } }),

  forward('GET', '/pw/api/costs/sheet', `${PW}/costs.js`,
    'No old read exists for a cost sheet. The old answer is passed through as it is.',
    'no old route exists for this read', { team: true, client: false, brand: 'opt' }),

  forward('POST', '/pw/api/costs/sheet', `${PW}/costs.js`,
    'Check a product cost sheet, and save it when dry_run is false.',
    `an upload, and ${CLEARS_OLD_CACHE}`, ownBrand,
    { body: { csv: 'string', start_date: 'day', filename: 'string?', dry_run: 'bool?' }, loose: true }),

  forward('GET', '/pw/api/expenses', `${PW}/expenses.js`,
    'The fixed cost list of one brand, the choices, and where each cost per order comes from.',
    MONEY_MODEL, ownBrand, { query: { act: 'brand?' } }),

  forward('PUT', '/pw/api/expenses', `${PW}/expenses.js`,
    'Replace the whole fixed cost list of one brand.',
    `changes what profit shows, and ${CLEARS_OLD_CACHE}`, ownBrand, { body: { items: 'json' }, loose: true }),

  forward('GET', '/ah/api/integrations', `${AH}/worker.js`,
    'The agency connections and the connections of each brand, with what is set and what is missing.',
    'works out what is connected from keys held on the old side and reads outside tools',
    { team: true, client: true, brand: 'none' }, { query: { brand: 'brand?' } }),

  forward('GET', '/ah/api/tiktok/status', `${AH}/tiktok.js`,
    'Is the agency signed in to TikTok ads, and which ad accounts it reaches.',
    'reads an ad platform sign in held on the old side', teamOnly),

  forward('POST', '/ah/api/tiktok/start', `${AH}/tiktok.js`,
    'Start the TikTok ads sign in. Answers with the address to open.',
    'starts an ad platform sign in with a key held on the old side', teamOnly),
];
