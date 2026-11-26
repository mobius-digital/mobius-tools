# The engine

One new worker that answers the new screens (`profit/v5`). It reads and writes the same database the two old
workers use. The old workers stay deployed and untouched. They are the fallback, and going back is one flag.

This file is the map. `CONTRACT.md` beside it is the rule book for builders.

## What the engine owns, and what it hands on

Owns:
1. The request path. Every call from the new screens arrives here first.
2. "Who is this" and "may they do this", in one place, for every route.
3. Every read the new screens make that the shared database can answer.
4. Simple settings writes: a few rows in the shared database and nothing else.

Hands on to the old workers (forwarded, through one kernel file):
1. Anything that needs an outside service: ad platforms, the store, the tracker, email, chat, mail, AI.
2. Complicated writes: ad changes, uploads, sends, syncs.
3. Sign in itself (making a session), because the signing key lives on the old side.
4. The protected ad call, season and standing files.

Stays on the old workers with no engine part at all: timed jobs, chat doors, webhooks.

Why forward: a worker's keys cannot be read out, so the engine holds no outside keys. It reaches the old workers
through service bindings. The day the keys are added to the engine, each forward is replaced in one place.

## Folders

```
engine/
  README.md            this map
  CONTRACT.md          the rule book for builders
  GLOSSARY.md          one word per idea
  scripts/check.mjs    the one build check: rules, lists, paths, tests
  worker/
    wrangler.toml      one worker: the shared database, the two old workers as bindings
    src/
      app.js           the entry point, no logic
      domains.js       imports every domain folder, nothing else
      platform/        the kernel: the only way to route, sign in, check access, read and write data,
                       reach the old workers, log
      numbers/defs.js  the one file of formulas (roas, mer, cpa, aov and the rest)
      numbers/catalog.js  what each number means: name, plain definition, formula, source, unit
      orgs/            who you are, people, agency settings
      brands/          brands, goals, rules, costs, expenses
      metrics/         home, this month, profit
      store/           sales, customers, email, website
      ads/             paid numbers, creatives, changes, loaded ads
      production/      cards, requests, my work, library, calendar
      reports/         reports, briefs, shared links, meetings
      automations/     the bell, automations, delivery choices
      ai/              connect your AI, free lookups, assistant settings
    tools/             check-rules.mjs, check-paths.mjs, gen-lists.mjs
  docs/                made by the build: routes.md, forwarded.md, statements.md, metrics.md

profit/v5/             the screens' side of the switch
  config.js            ENGINE_URL (the engine's address) and ENGINE_DEFAULT ('new' since the switch on; 'old' is the way back)
  engine.js            which engine answers, the fall back to the old engine, the misses
  engine-paths.js      made by the build: the calls the engine answers with its own code
  defs.js              shows what a number means, from GET /v1/metrics/definitions
  pages/a-engine/      Agency > Engine: the compare page and the switch (owner only)
```

Every domain folder has the same files: `routes.js`, `service.js`, `queries.js`, `schema.sql` (test tables),
`samples/` (made up answers), `*.test.mjs`. When `service.js` would pass 400 lines it splits into `parts/`.

## The request path

Always the same eight steps, in `platform/router.js`:

```
screens (profit/v5)
   |   one address. /pw/... is what the old profit worker answered, /ah/... the old account-health worker
   v
1  request id, timer, CORS
2  read the flag. Mode "old": pipe the request to the old worker untouched, stop here
3  match the route table. No row: pipe to the old worker and log it as unlisted
4  who is this            platform/auth.js     one answer for every route
5  may they do this       platform/access.js   role, brand, fields, record ownership
6  check the input        the row's input shape
7  run the handler        ported: clean code on the shared database
                          forwarded: platform/legacy.js sends it to the old worker as the same person
8  filter the answer for the caller, add meta, write one log line
```

## Who is this

The old sessions are signed tokens, and the key that checks them is on the old side. So the engine asks the old
account-health worker once per token (its `/api/me`, through the service binding) and keeps the answer one minute.
That answer says owner, team or client, and for a client which brands it has. The rest comes from the shared
database: who is view only, and which brands a teammate is limited to. A person signed in to the old app is signed in here,
with the same token. Nobody signs in twice.

## Access rules (carried over from the old brand guard)

1. Nobody: refused, except a row marked public.
2. Owner: everything.
3. Team: everything a row allows the team. A view only teammate can read and change nothing.
4. A teammate limited to some brands: only those brands. "All" quietly means their brands.
5. Client: closed by default. A row must say a client may use it. The brand must be theirs, "all" is refused,
   a record named by id must belong to their brand, a write may carry only the fields the row lists.
6. Every answer is filtered again on the way out: rows of other brands are dropped, and for a client the
   team only keys are removed.

## The data door

Every statement goes through `platform/db.js`. A domain lists its statements by name in `queries.js`. A statement
says where the brand filter goes, and the door fills it in from the access result. A handler cannot widen it and
never builds SQL from what the caller sent. No other file may call the database.

No table is added, changed or removed. The engine uses the tables as they are.

## Forwarding

`platform/legacy.js` is the only file that knows the old workers exist.

1. `forward`: the same request, same person, sent to the old worker. The answer comes back unchanged.
2. `get`: a ported handler borrows one old answer (for example today's live row) as the same person.
3. `who`: the sign in check above.
4. `pipe`: the whole request, untouched. Used in mode "old" and for a path with no row.

A forwarded path still has a row in the route table, with the reason. `docs/forwarded.md` is the to do list for
the day the keys move.

A ported handler may also say "not this one" at run time and forward a single request (for example a window that
includes today, which needs a live read). That is logged with its reason.

## Proof without waiting

Both engines read the same database, so they can be asked the same question at the same moment.
`POST /v1/compare` runs one read route both ways for the signed in person and returns match, or the list of
differences. `meta` is ignored, and a row can name keys that change by the second.

The compare page (Agency > Engine > Compare, owner only) does the same from the browser, so it also proves the
public address, CORS and the sign in work: it reads `GET /v1/routes`, asks every ported read on both engines at
once with the dates in the page head, once per brand you can see, and shows the counts, the fields that differ,
the slowest calls and the misses written down in real use. One button copies the whole result as text.

## Switching on and back

Deploy: a merge to main that touches `engine/worker/` deploys it by the GitHub job
(`.github/workflows/deploy-workers.yml`, which ships every `*/worker` folder that changed). Nobody deploys by
hand. The worker is named in `wrangler.toml` and its address is `ENGINE_URL` in `profit/v5/config.js`.
Deploying changes nothing for anyone: every browser stays on the old engine until it is switched.

The server flag starts off too: with no `engineMode` row (or any value but `new`) every request to the engine
is piped to the old workers untouched. The owner turns it on with `PUT /v1/engine {mode: 'new'}` (Agency > Engine
> Switch) before step 2. Compare runs the new code whatever the flag says, for the owner only.

Switch on, smallest first:
1. Compare first. Open Agency > Engine > Compare as the owner and run it. Fix or forward what differs.
2. One browser: Agency > Engine > Switch, choose "Compare" (you see old answers, the new ones are checked
   behind the page) or "New engine" (the ported calls go to the new engine). Kept in that browser only.
3. Everyone: set `ENGINE_DEFAULT` to `'new'` in `profit/v5/config.js` and merge. A browser that made its own
   choice keeps it.

What "New engine" means for a call: only a path in `profit/v5/engine-paths.js` (made by the build from the route
table) goes to the new engine. Every other call goes to the old workers as before. If the new engine cannot be
reached, runs out of time, answers 4xx or 5xx, or answers something that is not JSON, the same call is asked of
the old engine at once and the miss is written down for the compare page. A refusal (401, 403) the old engine
gives too is not a miss. After three failures in a row the new engine is left alone for a minute. Sample mode
never calls either engine.

Switch back, smallest first:
1. One browser: Agency > Engine > Switch, choose "Old engine".
2. One route: add its key to the `engineForward` list (`PUT /v1/engine` as the owner, or the settings table).
   That route is forwarded from then on.
3. Everyone, the one flag: Agency > Engine > Switch, "Send everything back to the old engine". That sets
   `engineMode` to `old` (`PUT /v1/engine`). Every request is piped to the old workers untouched, within 30
   seconds, with no deploy.
4. If the engine itself is down nothing needs doing: every read falls back to the old workers by itself, and so
   does a write the engine could not be reached for. A write that may already have run (a 5xx, no answer in
   time) is not sent again: the page says so and nothing is saved twice. To stop
   asking it at all, set `ENGINE_DEFAULT` back to `'old'`.

By hand, if the app cannot be reached, in the database console:
`INSERT INTO settings (key, value) VALUES ('engineMode', 'old') ON CONFLICT(key) DO UPDATE SET value = excluded.value`

The old engine needs nothing done to it in any of the three. It never stopped running.

## Rules (the build fails when one is broken)

1. Database calls only in `platform/db.js`. Calls to the old workers only in `platform/legacy.js`. The engine
   makes no other outside call in version one.
2. Every route has a row: method, path, access, input, handler, doc, source.
3. Every path the new screens call is in the route table. `tools/check-paths.mjs` fails when one is missing.
4. Each number is defined once, in `numbers/defs.js`. A number that is not known is `null`, never 0.
5. No file over 400 lines. No function over 80 lines.
6. No brand name, client name, email address, chat id or worker address typed in code. Addresses live in
   `wrangler.toml`. Tests use made up brands.
7. Every caught error is logged with a reason or thrown again.
8. Logic ported from old code carries one comment line naming the old file.
9. Version one returns the same JSON shape as the old route, plus an optional `meta`.
10. The lists in `engine/docs/` and `profit/v5/engine-paths.js` are made by the build and fail it when stale.
11. Nobody edits an old worker file. Nobody edits the seven protected files.

## Words (one per idea)

| Word | Means |
|---|---|
| brand_id | the brand. Old answers still carry it under the key `act_id`; engine code calls it `brand_id` |
| alias | any other id a brand answers to (an old id, an ad account id) |
| revenue | sales after returns, from the tracker rows in the shared database |
| spend | ad spend on one platform |
| spend_all | ad spend on every platform plus extra ad costs |
| roas | revenue credited to ads divided by spend |
| mer | revenue divided by spend_all |
| cpa | spend divided by orders |
| from, to | whole days in the brand's own time zone |
| ported | answered by engine code from the shared database |
| forwarded | sent on to an old worker by the kernel |
| pw, ah | the old profit worker, the old account-health worker |

## What is not here yet

Timed jobs, chat doors, webhooks, connectors, the AI door, the change door for ads, new tables, a second set of
keys. Those come from the written plan later. Nothing in this build blocks them: each forward is one line to
replace, and the route rows, the kernel and the tests stay.
