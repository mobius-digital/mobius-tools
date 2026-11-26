/* Offline checks for the assistant's SQL gate (ask/engine.js gateSql, with the Strategist's own lists from
 * src/strategist.js). In-memory SQLite, no secrets: every value below is made up.
 *   node test-sqlgate.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { gateSql, tablesWithColumns } from '../../ask/engine.js';
import { _test } from './src/strategist.js';

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE p_shopify (shop TEXT PRIMARY KEY, act_id TEXT, access_token TEXT, refresh_token TEXT, scopes TEXT);
  CREATE TABLE p_studio_cfg (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
  CREATE TABLE social_account (id TEXT PRIMARY KEY, act_id TEXT, plat TEXT, token_json TEXT);
  CREATE TABLE p_br_doc (act_id TEXT, line_id TEXT, key TEXT, data_json TEXT, status TEXT, updated_at TEXT, PRIMARY KEY (act_id, line_id, key));
  CREATE TABLE p_plan (act_id TEXT, month TEXT, revenue_goal REAL, share_token TEXT, -- a note, with a comma
    PRIMARY KEY (act_id, month));
  CREATE TABLE ads (ad_id TEXT PRIMARY KEY, act_id TEXT, name TEXT, asset_key TEXT);
  CREATE TABLE tw_daily (act_id TEXT NOT NULL, date TEXT NOT NULL, spend REAL, revenue REAL, orders INTEGER, PRIMARY KEY (act_id, date));
  CREATE TABLE p_newthing (id TEXT PRIMARY KEY, "client_secret" TEXT, note TEXT);
  CREATE TABLE p_checked (id TEXT, n INTEGER CHECK (n IN (1, 2)), UNIQUE (id, n));
  INSERT INTO settings VALUES ('passwordHash', 'made-up-hash');
  INSERT INTO p_shopify VALUES ('x.example', 'brand_x', 'made-up-access', 'made-up-refresh', 'read');
  INSERT INTO p_studio_cfg VALUES ('openai_key', 'made-up-key', '2026-01-01');
  INSERT INTO social_account VALUES ('s1', 'brand_x', 'ig', '{"t":"made-up"}');
  INSERT INTO p_br_doc VALUES ('brand_x', '', 'klaviyo', '{"private":"made-up-doc-key"}', 'approved', '2026-01-01');
  INSERT INTO p_plan VALUES ('brand_x', '2026-11', 1000, 'made-up-share');
  INSERT INTO ads VALUES ('a1', 'act_1', 'Ad one', 'v:123');
  INSERT INTO tw_daily VALUES ('brand_x', '2026-11-01', 100, 250, 5);
`);
const SECRETS = ['made-up-hash', 'made-up-access', 'made-up-refresh', 'made-up-key', 'made-up', 'made-up-doc-key', 'made-up-share'];

/* What the engine does at run time: every table the catalog lists (minus the secret-shaped names), and the
   star list grown from the catalog's own column names. */
const catalogue = db.prepare(`SELECT name, sql FROM sqlite_master WHERE type = 'table'`).all();
const allowed = catalogue.map(r => r.name).filter(n => !/^(settings|_cf|sqlite_|d1_)/i.test(n));
const derived = tablesWithColumns(catalogue, _test.SQL_NO_COLUMNS, _test.SQL_OK_COLUMNS);
const opts = { blobColumns: ['data_json'], secretTables: _test.SQL_NO_TABLES, secretColumns: _test.SQL_NO_COLUMNS, safeColumns: _test.SQL_OK_COLUMNS,
  starTables: [..._test.SQL_NO_STAR, ...derived] };
const gate = sql => gateSql(sql, allowed, opts);

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; };

/* ---- the catalog read ---- */
for (const t of ['p_shopify', 'social_account', 'p_plan', 'p_newthing'])
  ok(derived.includes(t), `${t} has a secret-shaped column`);
for (const t of ['tw_daily', 'p_checked']) ok(!derived.includes(t), `${t} has none (PRIMARY KEY / CHECK / UNIQUE are not columns)`);
/* A doc's `key` and an ad's `asset_key` are ordinary names (SQL_OK_COLUMNS), so they do not put a table on the list. */
for (const t of ['ads', 'p_br_doc']) ok(!derived.includes(t), `${t}: only ordinary names`);

/* ---- refused ---- */
const REFUSED = [
  /* whole tables */
  `SELECT * FROM p_shopify`,
  `SELECT shop FROM p_shopify`,
  `select SHOP from P_SHOPIFY`,
  `SELECT count(*) FROM p_shopify`,
  `SELECT value FROM p_studio_cfg`,
  `SELECT * FROM social_account`,
  `SELECT value FROM settings`,
  /* quotes and brackets */
  `SELECT * FROM "p_shopify"`,
  'SELECT * FROM `p_shopify`',
  `SELECT * FROM [p_shopify]`,
  `SELECT * FROM 'p_shopify'`,
  `SELECT * FROM 'settings'`,
  `SELECT value FROM "settings"`,
  `SELECT * FROM "P_Shopify"`,
  /* comments */
  `SELECT * FROM/**/p_shopify`,
  `SELECT * FROM/* x */p_studio_cfg`,
  `SELECT value FROM/**/settings`,
  `SELECT * FROM --\n p_shopify`,
  `SELECT * /* FROM tw_daily */ FROM p_shopify`,
  `SELECT a.* FROM tw_daily a, /* */ p_shopify b`,
  /* shapes of FROM */
  `SELECT * FROM(p_shopify)`,
  `SELECT * FROM (p_shopify)`,
  `SELECT * FROM tw_daily, p_shopify`,
  `SELECT * FROM tw_daily JOIN p_shopify ON 1 = 1`,
  `SELECT * FROM tw_daily CROSS JOIN 'p_shopify'`,
  `SELECT * FROM (SELECT * FROM p_shopify)`,
  `WITH x AS (SELECT * FROM p_shopify) SELECT * FROM x`,
  `WITH x(a, b, c, d, e) AS (SELECT * FROM p_shopify) SELECT a, c FROM x`,
  `SELECT (SELECT group_concat(shop) FROM p_shopify) AS s FROM tw_daily`,
  `SELECT 1 FROM tw_daily WHERE EXISTS (SELECT 1 FROM p_shopify WHERE scopes LIKE 'r%')`,
  `SELECT act_id FROM tw_daily UNION ALL SELECT shop FROM p_shopify`,
  /* schema prefixes */
  `SELECT * FROM main.p_shopify`,
  `SELECT * FROM "main"."p_shopify"`,
  `SELECT * FROM main . settings`,
  `SELECT * FROM temp.sqlite_temp_master`,
  /* the catalog */
  `SELECT sql FROM sqlite_master`,
  `SELECT sql FROM sqlite_schema`,
  `SELECT * FROM "sqlite_master"`,
  `SELECT * FROM/**/sqlite_master`,
  `SELECT name FROM pragma_table_info('p_shopify')`,
  `SELECT * FROM pragma_table_list`,
  /* columns by name */
  `SELECT share_token FROM p_plan`,
  `SELECT "share_token" FROM p_plan`,
  `SELECT [share_token] FROM p_plan`,
  `SELECT SHARE_TOKEN FROM p_plan`,
  `SELECT p.share_token AS t FROM p_plan p`,
  `SELECT p.'share_token' FROM p_plan p`,
  `SELECT p_plan.'share_token' FROM p_plan`,
  `SELECT a.x FROM (SELECT p.'share_token' AS x FROM p_plan p) a`,
  `SELECT act_id FROM p_plan WHERE p_plan.'share_token' LIKE 'm%'`,
  `SELECT act_id FROM tw_daily, 'settings'`,
  `SELECT substr(share_token, 1, 4) FROM p_plan`,
  `SELECT client_secret FROM p_newthing`,
  `SELECT file_key FROM ads`,
  `SELECT pdf_key, r2_key FROM tw_daily`,
  `SELECT api_key FROM tw_daily`,
  `SELECT keys FROM tw_daily`,
  `SELECT password FROM tw_daily`,
  `SELECT oauth_state FROM tw_daily`,
  /* SELECT * where a secret-shaped column would ride along */
  `SELECT * FROM p_br_doc`,
  `SELECT * FROM "p_br_doc"`,
  `SELECT * FROM 'p_br_doc'`,
  `SELECT d.* FROM p_br_doc d`,
  `SELECT DISTINCT * FROM p_br_doc`,
  `SELECT act_id, * FROM p_br_doc`,
  `SELECT*FROM p_br_doc`,
  `SELECT/**/*/**/FROM p_br_doc`,
  `SELECT * FROM p_plan`,
  `SELECT * FROM p_newthing`,
  `SELECT t.spend, x.* FROM tw_daily t JOIN (SELECT * FROM p_plan) x ON x.act_id = t.act_id`,
  `WITH x AS (SELECT * FROM p_plan) SELECT act_id FROM x`,
  /* the blob column */
  `SELECT data_json FROM p_br_doc`,
  `SELECT json_extract(data_json, '$.private') FROM p_br_doc`,
  /* still read only, one statement */
  `SELECT 1; SELECT * FROM p_shopify`,
  `DELETE FROM tw_daily`,
  `PRAGMA table_info(p_shopify)`,
  ``,
];
for (const sql of REFUSED) {
  const g = gate(sql);
  ok(g.error && !g.sql, `refused: ${sql}  ->  ${JSON.stringify(g)}`);
}

/* These spellings are valid SQLite (the fixture answers them), so the list above tests real statements. */
for (const sql of [`SELECT * FROM 'p_shopify'`, `SELECT * FROM/**/p_shopify`, `SELECT * FROM(p_shopify)`, `SELECT * FROM "main"."p_shopify"`,
  `SELECT * FROM 'settings'`, `SELECT * FROM 'p_br_doc'`, `SELECT/**/*/**/FROM p_br_doc`, `SELECT * FROM p_plan`]) {
  const out = JSON.stringify(db.prepare(sql).all());
  ok(SECRETS.some(s => out.includes(s)), `valid SQLite: ${sql}`);
}

/* ---- allowed: ordinary questions still pass, run, and carry no secret ---- */
const ALLOWED = [
  `SELECT * FROM tw_daily`,
  `SELECT act_id, SUM(spend) AS spend, SUM(revenue) * 1.0 / SUM(spend) AS roas FROM tw_daily GROUP BY act_id`,
  `SELECT spend * 2 AS doubled, revenue*1.0/spend AS roas FROM tw_daily`,
  `SELECT count(*) AS n FROM tw_daily`,
  `SELECT COUNT( * ) FROM p_plan`,
  `SELECT count(*) AS docs FROM p_br_doc WHERE status = 'approved'`,
  `SELECT act_id, month, revenue_goal FROM p_plan WHERE month = '2026-11'`,
  `SELECT ad_id, name FROM ads -- a trailing comment`,
  `SELECT /* note */ act_id FROM tw_daily`,
  `SELECT "act_id", [date], \`spend\` FROM "tw_daily"`,
  `WITH d AS (SELECT act_id, SUM(spend) AS s FROM tw_daily GROUP BY act_id) SELECT d.act_id, p.revenue_goal FROM d JOIN p_plan p ON p.act_id = d.act_id`,
  `SELECT act_id FROM tw_daily WHERE act_id = 'the settings page' OR act_id LIKE '%token%'`,
  `SELECT act_id FROM tw_daily WHERE act_id = '-- not a comment' AND date > '2026-01-01'`,
  `SELECT act_id FROM tw_daily WHERE act_id = 'it''s /* fine */'`,
  `SELECT act_id FROM tw_daily;`,
  /* a VALUE is not a table */
  `SELECT act_id FROM tw_daily WHERE act_id = 'settings'`,
  `SELECT act_id FROM tw_daily WHERE act_id != 'settings' AND act_id LIKE 'settings'`,
  /* ordinary columns that only look secret-shaped */
  `SELECT key, status FROM p_br_doc WHERE act_id = 'brand_x'`,
  `SELECT KEY FROM p_br_doc`,
  `SELECT asset_key, COUNT(*) AS ads FROM ads GROUP BY asset_key`,
  `SELECT a.asset_key AS creative FROM ads a`,
  `SELECT * FROM ads`,
];
for (const sql of ALLOWED) {
  const g = gate(sql);
  ok(g.sql && !g.error, `allowed: ${sql}  ->  ${JSON.stringify(g)}`);
  const out = JSON.stringify(db.prepare(g.sql).all());
  ok(!SECRETS.some(s => out.includes(s)), `no secret in the answer to: ${sql}`);
}

/* What runs is the statement with its comments gone, and a row cap. */
ok(/LIMIT \d+$/.test(gate(`SELECT act_id /* x */ FROM tw_daily -- y`).sql), 'LIMIT added');
ok(!/--|\/\*/.test(gate(`SELECT act_id /* x */ FROM tw_daily -- y`).sql), 'no comment survives');
ok(/LIMIT 5$/.test(gate(`SELECT act_id FROM tw_daily LIMIT 5`).sql), 'its own LIMIT is kept');

/* A host that passes no lists (the Ledger, Supply) keeps its old behavior, plus the comment and quote handling. */
const plain = sql => gateSql(sql, ['bills', 'settings_log'], {});
ok(plain(`SELECT key, receipt_key FROM bills`).sql, 'no column rule unless the host asks for one');
ok(plain(`SELECT * FROM bills`).sql, 'no star rule unless the host asks for one');
ok(plain(`SELECT * FROM settings`).error && plain(`SELECT * FROM 'settings'`).error && plain(`SELECT * FROM/**/settings`).error, 'settings is refused everywhere');
ok(plain(`SELECT * FROM/**/other`).error, 'a comment cannot hide a table from the allowlist');

console.log(`sql gate: ${n} checks passed`);
