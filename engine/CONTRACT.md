# Engine contract (for builders)

Read `README.md` first. This file is exact. If something here is wrong, say so in your report. Do not work around it.

## 0. Hard limits

1. Edit only the files of your own group folder. Never a file in `platform/`, `numbers/`, `domains.js`, `app.js`,
   another group's folder, any old worker, or `profit/v5`.
2. Never edit, deploy or call a live write route. Read old code and port from it. The seven protected files
   (desk, buyer, season, standing, standingimg, buyerlist, metawrite) are read only and their routes are forwarded.
3. No new table, no changed table. The shared database is used as it is.
4. No brand name, client name, email, chat id, worker address or real number in any file. Tests use the made up
   brands `brand_north_kites` and `brand_river_tea`.
5. No em dashes or en dashes. Plain short English.
6. `node --check` every JS file. No file over 400 lines, no function over 80 lines.
7. Ported logic carries one comment line: `// from <old path>`.

## 1. Layout and bindings

```
engine/worker/wrangler.toml
engine/worker/src/app.js            export default { fetch: (req, env, exec) => handle(req, env, exec) }
engine/worker/src/domains.js        imports every group folder (section 5). Kernel owned.
engine/worker/src/platform/         the kernel (section 2). Kernel owned.
engine/worker/src/numbers/defs.js   the one file of number definitions (section 8). Kernel owned.
engine/worker/src/<group>/          one folder per group (section 10)
```

Bindings, all in `wrangler.toml` and nowhere in code:

| Binding | What |
|---|---|
| `DB` | the shared D1 database. Same name and id as in `account-health/worker/wrangler.toml` |
| `CAL` | the calendar D1 database, same file. Only `production/` uses it |
| `OLD_AH` | service binding to the old account-health worker |
| `OLD_PW` | service binding to the old profit worker |
| `OLD_AH_ORIGIN`, `OLD_PW_ORIGIN` | vars: the old workers' public addresses, used to build the forwarded URL |

The engine has no secrets. A handler never reads `env`. It gets `ctx`.

## 2. Kernel functions (`engine/worker/src/platform/*.js`)

```js
// router.js
buildTable(domains) -> Table                      // domains = [{ name, routes, queries }]
handle(request, env, exec) -> Promise<Response>   // the eight steps in README

// auth.js
identify(request, env) -> Promise<Caller>
// Caller = { kind: 'owner'|'team'|'client'|'nobody', email, name, view_only: bool,
//            brand_ids: string[]|null,            // null = every brand. [] = none
//            client: { name, hq, read_only }|null, via: 'session'|'master', me: object }

// access.js
check(row, caller, req) -> Promise<Scope>         // throws EngineError 401 or 403
// Scope = { all: bool, brand: string|null, ids: string[], brand_ids: string[]|null }
//   brand: the one brand the request named, as a brand id (old ids are resolved first)
//   ids:   every id the scoped brands answer to (brand id, old id, ad account ids)
filterAnswer(row, caller, scope, data) -> data    // drops other brands' rows, scrubs for a client

// db.js  (the only file with .prepare)
register(domain, queries) -> void                 // called by domains.js, never by a group
door(env, scope, counters, which = 'DB') -> Db
// Db.all(name, params) -> Promise<object[]>
// Db.one(name, params) -> Promise<object|null>
// Db.run(name, params) -> Promise<{ changes, last_row_id }>
// Db.batch([[name, params], ...]) -> Promise<object[]>
// name is '<domain>.<query>'. A domain may only run its own queries and 'platform.*' ones.

// legacy.js  (the only file that knows the old workers)
who(env, token, { fresh }) -> Promise<object|null>  // old /api/me. fresh: asked now (/ah and /v1 paths). Else kept
                                                   // 60 s per token and never past the session end (/pw paths)
forward(ctx, why) -> Promise<Response>            // same request, same person, to the row's old worker
get(ctx, worker, pathAndQuery, { cache_s = 0 }) -> Promise<object>   // one old GET as the caller
pipe(request, env, worker) -> Promise<Response>   // untouched. Router only

// flags.js
read(env) -> Promise<{ mode: 'new'|'old', forward: Set<string> }>    // kept 30 s
write(ctx, { mode, forward }) -> Promise<void>    // owner only, through the data door

// settings.js  (the old settings table: key, value)
getSetting(ctx, key, fallback = null) -> Promise<string|null>
getJson(ctx, key, fallback) -> Promise<any>
putSetting(ctx, key, value) -> Promise<void>

// brands.js
resolveBrandId(env, anyId) -> Promise<string>     // '' when unknown
expandIds(env, brandIds) -> Promise<Set<string>>
listBrands(ctx, { active = true }) -> Promise<object[]>   // the caller's brands, rows of the old brand list
oneBrand(ctx, brandId) -> Promise<object|null>    // name, tz, currency and the old row's other columns

// time.js
dayIn(tz, date = new Date()) -> 'YYYY-MM-DD'
addDays(day, n) -> day        monthOf(day) -> 'YYYY-MM'
windowFor(tz, { days, from, to }) -> { today, from, to }   // the old rule: ends yesterday unless today is named

// respond.js, errors.js, log.js, text.js
json(data, status = 200) -> Response              CORS  (same headers as the old workers)
fail(status, message, code = '') -> never         // throws EngineError. The body is { error: message }
line(fields) -> void                              swallowed(reason, err) -> void
safeJson(text, fallback) -> any
```

`ctx`, built by the router for every handler:

```js
ctx = { caller, scope, db, brands, settings, legacy: { get }, log, now: Date, request_id,
        route: Row, url: URL, method,
        other: name => Db,            // ctx.other('CAL'): the same door on the calendar database
        forward: why => marker }      // return this from a handler to forward this one request
```

## 3. The route row

```js
{ method: 'GET',
  path: '/pw/api/costs',                  // '/pw/...' or '/ah/...' plus the old path. ':id' for a path part
  access: { team: true, client: true, owner_only: false, public: false,
            brand: 'need',                // 'need' | 'opt' | 'none' | 'path' (the brand is the ':id' part)
            fields: null,                 // for a client write: the only body keys allowed
            own: null,                    // [{ in: 'query'|'body'|'path', key, table, col = 'act_id', idcol = 'id' }]
            scrub: true },                // default true: a client never sees team only keys
  input: { query: { act: 'brand?', days: 'int?', from: 'day?', to: 'day?' }, body: null, loose: false },
  handler: listCosts,                     // a function from service.js, or the string 'forward'
  doc: 'The cost rules of one brand.',
  source: { old: 'pw', file: 'profit/worker/src/costs.js', engine: 'new',   // 'new' | 'forward'
            why: '',                      // for a forward: the reason, in one line
            borrows: [],                  // fields taken from one old GET (section 7)
            compare: { ignore: [] } } }   // answer keys that change by the second
```

Rules:
1. One row per method and path the new screens really call. Grep `profit/v5` for your paths and check the
   worker each call names (`{ worker: 'ah' }` means `/ah`, no worker means `/pw`). A path called on both
   workers gets a row under each prefix. When the old profit side only proxies the path to account-health
   (its `PROXY_PATHS` list), both rows share one handler.
2. `access` comes from the old code, not from a guess: the old handler's own checks, plus the matching line of
   `CLIENT_RULES` in `account-health/worker/src/brandguard.js`. No line there means `client: false`.
   Copy `fields`, `own` and the brand need (`act`) from that line. A `post` or `deny` function on that line
   is ported into your `service.js` and named in `doc`.
3. `owner_only` for what the old code allows only the owner.
4. Input types: `string`, `int`, `num`, `bool`, `day`, `brand`, `id`, `json`, `string[]`. A `?` makes it
   optional. Unknown query keys are ignored on a GET. On a write, unknown body keys are refused unless `loose`.
5. A forwarded row sets `handler: 'forward'` and `source.engine: 'forward'` with a `why`. Its `access` is still
   filled in. Use `brand: 'opt'` when unsure: the old worker checks again as the same person.

## 4. Handlers

```js
// service.js
export async function listCosts(ctx, input) {
  const rows = await ctx.db.all('brands.costRules', { kind: input.query.kind || 'all' });
  return { rules: rows };                 // a plain object. The router makes the Response
}
```

1. A handler takes `ctx` and `input` ({ query, body, params }) and returns the answer object.
2. No request or response objects. No `env`. No `fetch`. No SQL text.
3. An error the old route answered with a status: `fail(404, 'unknown account')`. Same words as the old route.
4. A case you do not cover (a live read, a refresh switch, a window that includes today): `return ctx.forward('why')`.
5. To downgrade a whole path from ported to forwarded is allowed: change the row, give the `why`, report it.
   To upgrade a forwarded path to ported, first prove the old handler makes no outside call.

## 5. How a group registers

Each group folder exports exactly this from `routes.js`, and nothing else is needed:

```js
// engine/worker/src/brands/routes.js
import * as s from './service.js';
import { queries } from './queries.js';
export const name = 'brands';
export { queries };
export const routes = [ /* rows */ ];
```

`domains.js` imports these nine folders: `orgs`, `brands`, `metrics`, `store`, `ads`, `production`, `reports`,
`automations`, `ai`, plus `platform/routes.js`. A builder never edits `domains.js`.

A group may import from `platform/` and `numbers/defs.js`. Never from another group.

## 6. The data door

```js
// queries.js
export const queries = {
  costRules: { scope: 'brand',
    sql: `SELECT id, kind, amount FROM p_cost_rule WHERE {{brand:act_id}} AND (:kind = 'all' OR kind = :kind)` },
  spendDays: { scope: 'brands',
    sql: `SELECT act_id, date, spend FROM daily_insights WHERE {{brands:act_id}} AND date BETWEEN :from AND :to
          ORDER BY {{pick:order}}`,
    pick: { order: { date: 'date', spend: 'spend DESC' } } },
  saveRule: { scope: 'brand', write: true,
    sql: `INSERT INTO p_cost_rule (id, act_id, kind, amount) VALUES (:id, {{brand_id}}, :kind, :amount)` },
  askModel: { scope: 'none', why: 'agency setting, no brand',
    sql: `SELECT value FROM settings WHERE key = :key` },
};
```

1. Every statement is a named entry. Values go in as `:name`. An array value expands inside `IN (:name)`.
2. The brand filter is a macro the door fills from `ctx.scope`, never from input:
   `{{brand:col}}` the one brand of this request (all its ids). The call fails when the request named no brand.
   `{{brands:col}}` every brand in scope. For a caller who sees all and named none it becomes `1=1`.
   `{{brand_id}}` the one brand id as a value, for inserts.
3. `scope` is `brand`, `brands` or `none`. `none` needs a `why`, and is refused for a client unless the
   statement also binds `:email` to the caller (the door checks it equals `ctx.caller.email`).
4. A statement with no macro and no `scope: 'none'` cannot be registered.
5. Anything that is not a value (a column, a sort) comes from a fixed `pick` map. The caller sends the key.
6. A write is marked `write: true`. A view only caller never reaches it (the router refuses first).
7. Each request has a budget of 40 statements. Use `Db.batch` for many rows. The count is in the log line.
8. `schema.sql` in your folder holds `CREATE TABLE` for every table your queries touch, copied from the old
   `schema.sql` files and the old `ensure...` functions, so tests run offline. It is test only. It is never run
   on the real database.

## 7. The answer

1. Same JSON as the old route: same keys, same nesting, same types, same `null` versus missing. Old key names
   stay (`act_id`, `rows`, `accounts`). The screens must need no change.
2. The router adds `meta: { engine: 'new'|'forward', source, window: { from, to, tz }, as_of }` when the answer
   is an object. A handler may return `{ data, meta }` to fill `source`, `window`, `as_of`. Nothing else is added.
3. Errors keep the old shape: `{ error: 'words' }` with the old status and the old words.
4. A field the old route worked out from a key being set (for example "is the chat app connected") cannot be
   known here. Take it from one old GET: `await ctx.legacy.get('ah', '/api/settings', { cache_s: 300 })`, and
   list the field in `source.borrows`. Borrow fields only, never whole answers. If more than a few fields are
   borrowed, forward the route.
5. A write does exactly the rows the old handler wrote, in the same order, including its change log rows.
   If the old handler does anything else (a post, a mail, a queue, an outside call, a cache it clears inside the
   old worker), the route is forwarded.

## 8. Numbers (`numbers/defs.js`, kernel owned, signatures frozen)

```js
safeDiv(a, b) -> number|null      // null when a or b is not known or b is 0
roas(revenue, spend)   mer(revenue, spend_all)   cpa(spend, orders)   aov(revenue, orders)
cpm(spend, impressions)   ctr(clicks, impressions)   cvr(orders, sessions)   pct(part, whole)
sum(rows, key) -> number|null     // null when no row has the key
change(now, before) -> number|null
```

A group never types one of these formulas. A group's own money model (for example the contribution margin
port in `metrics/`) lives in that group and calls these.

## 9. Tests (`platform/testkit/index.mjs`)

```js
makeEnv({ groups: ['brands'], rows: { table: [ ... ] }, old: { 'GET /api/x': (req) => json } }) -> env
//   in memory SQLite behind a D1 shaped DB (and CAL), your schema.sql loaded, two made up brands seeded,
//   fake OLD_AH and OLD_PW that record every call and answer /api/me for the callers below
asCaller(kind, { brands }) -> token
//   kind: 'owner' | 'team' | 'limited' (a teammate with a brand list) | 'viewer' | 'client' | 'nobody'
call(env, method, path, { token, body }) -> Promise<{ status, json, forwarded: bool }>
sameShape(a, b) -> string[]               // the differences in keys and types, [] when equal
genAccessTests(routes, { groups }) -> void   // registers node:test cases for every row
```

Each group ships:
1. `samples/<name>.json`: a made up answer in the old shape for each ported GET (learn the real shape with a
   read only GET on the live old engine, then replace every name and number).
2. `<group>.test.mjs`: `genAccessTests(routes)`, then per ported route one test that the answer has the same
   shape as its sample, and one test per write that the rows landed and another brand's rows did not change.
3. Run with `node --test "engine/worker/src/<group>/*.test.mjs"` (a folder alone does not work on this Node).

`genAccessTests` checks for every row: nobody gets 401; a client gets 403 unless `access.client`; a limited
teammate naming the other brand gets 403; a viewer on a write gets 403; a client's answer holds no id of the
other brand; a forwarded row reaches the fake old worker with the same method, path, query and token.

## 10. The groups

Prefix `/ah` = old account-health worker, `/pw` = old profit worker. "port" = answered by engine code.
"fwd" = a row with `handler: 'forward'`. Line numbers are for `origin/main` at the time of writing.

### orgs (`src/orgs/`): who you are, people, agency settings
- port: GET `/ah/api/me` (return `ctx.caller.me`) | GET, PUT `/ah/api/me/prefs` | GET `/ah/api/team` |
  GET `/ah/api/clients` | GET, PUT `/ah/api/settings`
- fwd: POST `/ah/api/google-login` | `/ah/api/clients/signin` | `/ah/api/clients/login-link` |
  `/ah/api/clients/invite-info` (all four public: sign in is made on the old side)
- old sources: `account-health/worker/src/worker.js` (team near 9917, me near 9980, settings near 10485),
  `prefs.js`, `clients.js`, `brandguard.js`

### brands (`src/brands/`): brands, goals, rules, costs, expenses
- port: GET `/ah/api/brands` | GET `/ah/api/accounts` | PUT `/ah/api/accounts/:id` | GET `/pw/api/brand` |
  GET, PUT `/pw/api/brand/rules` | GET, PUT, DELETE `/pw/api/costs` | GET, POST `/pw/api/costs/sheet` |
  GET, PUT `/pw/api/expenses`
- fwd: GET `/ah/api/integrations` | GET `/ah/api/tiktok/status` | POST `/ah/api/tiktok/start`
- old sources: `account-health/worker/src/brands.js`, `worker.js` (accounts near 10006),
  `profit/worker/src/brand.js` (near 505 to 560), `costs.js`, `expenses.js`, `worker.js` (near 2794 and 2946)

### metrics (`src/metrics/`): home, this month, profit
- port: GET `/pw/api/overview` | GET `/pw/api/client` | GET `/pw/api/forecast` | GET `/pw/api/plan` |
  GET `/ah/api/series`
- fwd: GET `/ah/api/overview` | GET `/pw/api/hub/live`
- old sources: `profit/worker/src/worker.js` (the money model and totals near 400 to 1100, overview near 2205,
  client near 2309, forecast near 2348, plan near 2360), `costs.js`, `expenses.js` (read only helpers),
  `account-health/worker/src/worker.js` (series near 10147)

### store (`src/store/`): sales, customers, email, website
- port: GET `/pw/api/customers` | GET `/pw/api/hub/store` | GET `/pw/api/hub/stockads` | GET `/pw/api/hub/email`
- fwd: GET `/ah/api/klaviyo` | GET `/ah/api/google/website` | GET `/ah/api/google/search` |
  GET `/ah/api/clarity` | GET `/ah/api/supply/client`
- old sources: `profit/worker/src/worker.js` (customers near 1150 to 1480 and 2761), `hub.js` (store, email, stockads)

### ads (`src/ads/`): paid numbers, creatives, changes, loaded ads
- port: GET `/pw/api/hub/paid` | GET `/pw/api/hub/creative` | GET `/ah/api/activities` |
  GET `/ah/api/ad-updates` | GET `/ah/api/launch/list` (forward when `refresh` is asked)
- fwd: GET `/ah/api/meta/live` | GET `/ah/api/pacing` | GET `/ah/api/ad-creatives` and `/pw/api/ad-creatives` |
  GET `/ah/api/buyer-list` | GET `/ah/api/google/ads`, `/ads-ads`, `/ads-terms`, `/ads-changes` |
  GET `/ah/api/leaks` | GET `/ah/api/tiktok/report` | GET `/pw/api/hub/command`
- old sources: `profit/worker/src/hub.js` (paid, creative), `account-health/worker/src/worker.js`
  (activities near 10589, ad-updates near 10614), `launch.js` (launchList near 725)

### production (`src/production/`): cards, requests, my work, library, calendar
- port: GET `/ah/api/production` | GET `/ah/api/production/card` | GET `/ah/api/production/photos` |
  GET `/ah/api/requests` | GET `/ah/api/mywork` | GET `/ah/api/assets` | GET `/pw/api/inspo` |
  GET `/ah/api/calendar` (the `CAL` database)
- fwd: POST `/ah/api/actions` | POST `/ah/api/actions/done` | GET `/pw/api/assets/footage` (no old route: the
  old answer is passed through as it is)
- old sources: `account-health/worker/src/production.js`, `prodwork.js` (card near 1390, photos near 1419),
  `requests.js`, `mywork.js`, `assets.js`, `calendar.js`, `profit/worker/src/inspo.js`

### reports (`src/reports/`): reports, briefs, shared links, meetings, agency views
- port: GET `/ah/api/reports` | GET `/ah/api/report` | GET `/ah/api/briefs` (each also under `/pw`, where the old
  side only proxies) | GET `/pw/api/client-pages` | GET `/pw/api/snapshots` | GET `/ah/api/meetings` |
  GET `/ah/api/meetings/monday`
- fwd: GET `/ah/api/agency/economics` | GET `/ah/api/agency/workload` | GET `/ah/api/calls/screen` |
  GET `/ah/api/pulse/status` | GET `/pw/api/season` | GET `/pw/api/season/war` | GET `/ah/api/standing` |
  GET `/ah/api/trybe`, `/trybe/review`, `/trybe/scorecard`, `/trybe/video`
- old sources: `account-health/worker/src/worker.js` (briefs near 10873, reports near 10883, report near 10894),
  `meetings.js`, `profit/worker/src/clientpage.js`, `snapshot.js`

### automations (`src/automations/`): the bell, automations, delivery choices
- port: GET, PUT, DELETE `/ah/api/automations` | GET, PUT `/ah/api/automations/people` |
  GET `/ah/api/automations/test` | GET `/ah/api/notices` | GET, PUT `/ah/api/me/delivery`
- fwd: POST `/ah/api/automations/power` | POST `/ah/api/automations/test` | POST `/ah/api/notices/done`
- old sources: `account-health/worker/src/automations.js` (routes near 974 to 1190)

### ai (`src/ai/`): connect your AI, free lookups, assistant settings
- port: GET `/ah/api/connect-ai` | GET `/ah/api/connect-ai/calls` | GET, POST `/ah/api/connect-ai/keys` |
  POST `/ah/api/connect-ai/keys/revoke` | GET, PUT `/ah/api/connect-ai/switch` |
  GET `/ah/api/connect-ai/proposals` | GET `/ah/api/lookups` | GET `/ah/api/ask/settings` |
  GET `/ah/api/ask/usage` | GET `/ah/api/ask/findings` | GET, PUT `/ah/api/ask/brief`
- fwd: POST `/ah/api/ask` | POST `/ah/api/lookup` | POST `/ah/api/connect-ai/proposals/check` |
  POST `/ah/api/connect-ai/proposals/decide` | PUT `/ah/api/ask/settings`
- old sources: `account-health/worker/src/connectai.js`, `lookups.js` (door near 789),
  `worker.js` (ask settings near 8857, usage near 8966, findings near 8983, brief near 8997)

### kernel routes (`src/platform/routes.js`, kernel owned)
GET `/v1/health` (public) | GET `/v1/routes` | POST `/v1/compare` | GET, PUT `/v1/engine` (all four owner only)

## 11. Why each path is forwarded

| Reason | Paths |
|---|---|
| Sign in is made with a key on the old side, or sends mail | google-login, clients/signin, clients/login-link, clients/invite-info |
| Reads an ad platform live | meta/live, pacing, ad-creatives, tiktok/report, tiktok/status, tiktok/start, google/ads, google/ads-ads, google/ads-terms, google/ads-changes |
| Reads the tracker, store or site tools live | hub/live, google/website, google/search, clarity, klaviyo |
| Reads another worker or outside tool | supply/client, agency/economics, agency/workload, trybe and its three children, integrations |
| Protected file | buyer-list, season, season/war, standing |
| Calls a model, or may | ask (POST), lookup (POST), leaks, calls/screen, automations/test (POST) |
| A write that does more than rows | actions, actions/done, notices/done, automations/power, connect-ai/proposals/check, connect-ai/proposals/decide, ask/settings (PUT) |
| On the "stays on old" list of the written plan | hub/command, pulse/status, overview on the old account-health worker |
| No old route exists | assets/footage |

## 12. What to hand back

1. The files you wrote, with line counts.
2. Your route rows as a list: method, path, engine (new or forward), why.
3. Any path you downgraded to forward, and why. Any path the screens call that is not in your list.
4. Every `source.borrows` field.
5. Test result: the exact command and the pass and fail counts.
6. Anything in this contract that was wrong or missing.

## 13. Kernel notes (added by the kernel build, these win over the lines above where they differ)

What the kernel really does, where sections 1 to 9 were open or wrong.

1. Tests: `node --test` needs a file pattern, see section 9 rule 3. Import the kit from `../platform/testkit/index.mjs`.
   Extra kit exports: `NORTH`, `RIVER`, `RIVER_IDS`, `reset()`, `useGroup(group)`, `assertNoLeak(env, method, path)`.
   `makeEnv` also takes `sql` (extra test tables as text). A group with calendar tables puts them in `schema.cal.sql`.
   `call()` also returns `text` and `engine` ('new', 'forward' or 'pipe').
2. `ctx.brands` is `{ list({ active }), one(brandId) }`. `ctx.settings` is `{ get(key, fallback), getJson(key, fallback),
   put(key, value) }`. `ctx.log` is a plain object: set a key and it lands in the request's log line.
3. A client cannot use `ctx.settings` or any `scope: 'none'` statement: the data door refuses it. For a per person
   row a client may read, write your own statement that binds `:email`, and pass `ctx.caller.email`.
4. `Scope.ids`: when the request names a brand, every id of that one brand. When it names none, every id of the
   caller's brands (empty for a caller who sees all, where `{{brands:col}}` becomes `1=1`). `Caller` also has
   `ids` (a Set, null for a caller who sees all).
5. `access` defaults: `team: true, client: false, owner_only: false, public: false, brand: 'opt', fields: null,
   own: null, scrub: true, filter: true`. Two more optional keys: `hq: true` (only the client login marked hq) and
   `upload: true` (a client may send a body that is not JSON). `filter: false` leaves the answer as the handler
   made it (no rows or keys of other brands dropped), for an old route that sat above the brand guard and keeps
   to the caller's brands itself. Without it a key named like a brand id (`brand_id`) is dropped for a caller with
   a brand list.
6. `access.own` may only name a table listed in `platform/queries.js` `OWN_TABLES`. If your rule needs another
   table, say so in your report and the kernel adds it. Do not work around it.
7. A handler gets `input.query` values already typed. An optional query value that does not parse is left out
   (the old routes fell back to their default). A needed value that is missing is a 400.
8. A statement takes at most 100 bound values (the database limit). Brand ids from the macro count.
9. A ported GET handler that throws something other than `fail(...)` is forwarded to the old worker for that one
   request, logged with `fell_back` and marked `X-Engine: fallback`, which the compare page counts as failed.
   A write never falls back. Do not lean on this: it is a net, not a plan.
10. Every answer carries the header `X-Engine`: `new`, `forward` (the row or the handler handed it to the old
   engine), `fallback` (a ported read broke and the old engine answered) or `pipe`.
11. The old `post` functions that answered `{ __deny: 404, error }` still work: return that object.
12. Refusal sentences are the old ones with the agency name and people names taken out (hard limit 4).
    They live in `platform/access.js` `WORDS`.
13. A teammate with a brand list is also checked on a brand named in the path (`brand: 'path'`). The old guard
    did not check that case. This is stricter, never wider.
14. A group imports only: its own files, `../platform/errors.js`, `text.js`, `time.js`, `log.js`, `settings.js`,
    `brands.js`, `../numbers/defs.js`, and the test kit in tests. The build checks this.
15. The definitions of the numbers live in `numbers/catalog.js`, reached through `numbers/defs.js`
    (`DEFINITIONS`, `definitionOf(id)`) and served by `GET /v1/metrics/definitions`. `metrics/definitions.js` is a
    kernel file that passes them on. The metrics group does not edit it.
16. Build checks: `node engine/scripts/check.mjs` runs `tools/check-rules.mjs`, `tools/gen-lists.mjs --check`,
    `tools/check-paths.mjs` and the tests. After your rows are in, run `node engine/worker/tools/gen-lists.mjs`
    once (the one committer does this, so the lists are not fought over).
17. The profit worker's demo login (a password kept as a hash in settings) is not known to the old
    account-health `/api/me`, so the engine treats it as nobody. It still works on the old address.
