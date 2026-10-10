/* What the Strategist sends the model on a fresh question, part by part (2026-10-10 cost pass).
 * Builds the real engine (strategist.js + ask/engine.js) on an in-memory D1 with the test fixtures,
 * captures the first Anthropic request of a web answer and a Slack answer, and prints the size of
 * every system block and every tool group, plus whether the cached prefix is the same across
 * surfaces and brands. Tokens are ESTIMATED at CHARS_PER_TOKEN (calibrated on strat_run: a cold
 * no-brand Slack question wrote 55,209 tokens and two brands
 * shared a 41k-token tools + schema prefix, both about 2.5 characters a token); set ANTHROPIC_API_KEY to count them exactly.
 *   node scripts/prompt-size.mjs            (from account-health/worker)
 *   node scripts/prompt-size.mjs --json     (machine-readable)
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(here, '..');
const root = path.join(worker, '..', '..');
const CHARS_PER_TOKEN = Number(process.env.CHARS_PER_TOKEN || 2.5);
const KEY = process.env.ANTHROPIC_API_KEY || '';

const db = new DatabaseSync(':memory:');
const load = f => { for (const st of fs.readFileSync(f, 'utf8').replace(/--[^\n]*/g, '').split(/;\s*(?:\n|$)/)) { try { if (st.trim()) db.exec(st); } catch { /* re-applied ALTER */ } } };
load(path.join(worker, 'schema.sql'));
for (const f of ['brand-001.sql', 'brand-002.sql', 'brand-003.sql', 'brand-004.sql', 'brand-005.sql', 'amb-001.sql', 'amb-002.sql', 'studio-001.sql', 'studio-002.sql', 'scenario-001.sql'])
  load(path.join(root, 'profit', 'worker', 'migrations', f));
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const DB = {
  prepare(sql) {
    let args = [];
    const st = () => db.prepare(bindSql(sql));
    return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args)) || null; },
      async all() { return { results: st().all(vals(args)) }; }, async run() { const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } };
  },
  async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; },
};
const LUCKY = 'act_378146126054294', BONK = 'act_111';
db.exec(`INSERT INTO accounts (act_id, name, currency, tz) VALUES ('${LUCKY}', 'Lucky Golf', 'USD', 'America/Chicago'), ('${BONK}', 'Bonk Golf', 'USD', 'America/Chicago')`);
db.exec(`INSERT INTO brands (id, slug, name, status, currency, tz, internal_channel, legacy_key, source) VALUES
  ('${LUCKY}', 'lucky_golf', 'Lucky Golf', 'active', 'USD', 'America/Chicago', 'C_LUCKY', '${LUCKY}', 'locus'),
  ('${BONK}', 'bonk_golf', 'Bonk Golf', 'active', 'USD', 'America/Chicago', 'C_BONK', '${BONK}', 'locus')`);
db.exec(`INSERT INTO connections (id, brand_id, kind, external_id, is_primary, source) SELECT 'meta:' || act_id, act_id, 'meta', act_id, 1, 'locus' FROM accounts`);

const strat = await import('../src/strategist.js');
const d = {
  getSetting: async (env, k) => { const r = await env.DB.prepare('SELECT value FROM settings WHERE key = ?1').bind(k).first(); try { return r?.value ? JSON.parse(r.value) : null; } catch { return r?.value ?? null; } },
  putSetting: async (env, k, v) => env.DB.prepare('INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, typeof v === 'string' ? v : JSON.stringify(v)).run(),
  safeJson: (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } },
  listAccounts: async env => (await env.DB.prepare('SELECT * FROM brand_accounts').all()).results,
  overview: async () => [], briefData: async () => ({}), dataHealth: async () => ({}), storePeriod: async () => ({}),
  localDate: () => '2026-10-10', addDays: (ymd, n) => { const x = new Date(`${ymd}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); },
  ymdDiff: () => 0, daysInMonth: () => 31, briefHour: async () => 7, slack: async () => ({ ok: true, ts: '1.1' }), claude: async () => '',
  closeThread: async () => {},
};
const env = { DB, ANTHROPIC_API_KEY: 'k', SLACK_BOT_TOKEN: 'x' };
const { engine, h } = strat.buildStrategist(d);

/* Capture the first model request of an answer; answer it with plain text so the loop ends. */
let captured = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init = {}) => {
  if (String(url).includes('api.anthropic.com/v1/messages')) {
    captured.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ type: 'message', model: 'claude-opus-5-5', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ ok: true, ts: '1.1', messages: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
async function web(act) { captured = []; await engine.answerWeb(env, 'Please turn on the daily reports for this brand', [], h(), act ? { screen: { act_id: act } } : {}); return captured[0]; }
async function slack() {
  captured = [];
  await engine.answerSlack(env, { type: 'app_mention', channel: 'C_STRAT', user: 'U1', ts: '1790000000.000100', text: '<@B1> Please turn on the daily reports for this brand' }, h(), {});
  return captured[0];
}

const tok = s => Math.round((typeof s === 'number' ? s : String(s).length) / CHARS_PER_TOKEN);
async function countExact(body) {
  if (!KEY) return null;
  const r = await realFetch('https://api.anthropic.com/v1/messages/count_tokens', { method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: body.model, system: body.system, messages: body.messages, tools: body.tools }) });
  return (await r.json()).input_tokens ?? null;
}

/* Which file each tool comes from, so the groups add up. */
const groupOf = (() => {
  const g = {};
  const add = (name, list) => { for (const t of list || []) g[t.def?.name || t.name] = name; };
  const mods = { strattools: null, metawrite: null, stratmake: null, alerts: null, klaviyowrite: null };
  return { g, add, mods };
})();
const st = await import('../src/strattools.js'), mw = await import('../src/metawrite.js'), sm = await import('../src/stratmake.js'), al = await import('../src/alerts.js'), kw = await import('../src/klaviyowrite.js');
const stub = new Proxy({}, { get: () => () => null });
const safe = f => { try { return f({ ...d, auto: stub, h }) || []; } catch { return []; } };
groupOf.add('strattools (tools)', safe(st.stratTools)); groupOf.add('strattools (actions)', safe(st.stratActions));
groupOf.add('metawrite (tools)', safe(mw.writeTools)); groupOf.add('metawrite (actions)', safe(mw.writeActions));
groupOf.add('stratmake (tools)', safe(sm.makeTools)); groupOf.add('stratmake (actions)', safe(sm.makeActions));
groupOf.add('alerts (tools)', safe(al.autoTools)); groupOf.add('alerts (actions)', safe(al.autoActions));
groupOf.add('klaviyowrite (tools)', safe(kw.klaviyoTools)); groupOf.add('klaviyowrite (actions)', safe(kw.klaviyoActions));
for (const n of ['query_locus', 'read_app', 'make_report', 'hand_to_claude_code', 'close_finding', 'watch_for', 'stop_checking']) groupOf.g[n] = 'engine built-ins';
for (const n of ['web_search', 'web_fetch']) groupOf.g[n] = 'server tools (web)';
groupOf.g.draft_from_thread = 'slack only';
groupOf.g.tool_search_tool_regex = 'tool search';

function report(label, body) {
  const out = { label, system: [], tools: {}, totals: {} };
  for (const b of body.system) out.system.push({ head: b.text.split('\n')[0].slice(0, 70), chars: b.text.length, tok: tok(b.text), cache: !!b.cache_control });
  for (const t of body.tools || []) {
    const grp = groupOf.g[t.name] || 'strategist.js actions';
    const s = JSON.stringify(t);
    const o = out.tools[grp] ||= { n: 0, chars: 0, tok: 0, deferred: 0, names: [] };
    o.n++; if (t.defer_loading) o.deferred++; else { o.chars += s.length; o.tok += tok(s); } o.names.push(`${t.name}:${s.length}${t.defer_loading ? 'd' : ''}`);
  }
  const loaded = (body.tools || []).filter(t => !t.defer_loading);
  out.totals_loaded_tools_tok = tok(JSON.stringify(loaded));
  const sys = body.system.reduce((a, b) => a + b.text.length, 0), tools = JSON.stringify(body.tools || []).length, msgs = JSON.stringify(body.messages).length;
  out.totals = { system_chars: sys, tools_chars: tools, msgs_chars: msgs, est_tokens: tok(sys) + tok(JSON.stringify(loaded)) + tok(msgs), tools_n: (body.tools || []).length };
  /* The cached prefix: everything up to and including the last block marked cache_control in system (tools come first). */
  let lastBp = -1; body.system.forEach((b, i) => { if (b.cache_control) lastBp = i; });
  const firstBp = body.system.findIndex(b => b.cache_control);
  out.prefix = { first_bp_tokens: tok(JSON.stringify(loaded)) + tok(body.system.slice(0, firstBp + 1).map(b => b.text).join('')),
    ttl: body.system[firstBp]?.cache_control?.ttl || '5m' };
  return out;
}
const bodies = { web_nobrand: await web(null), web_lucky: await web(LUCKY), web_bonk: await web(BONK), slack: await slack() };
const reps = Object.fromEntries(Object.entries(bodies).map(([k, b]) => [k, report(k, b)]));
for (const [k, b] of Object.entries(bodies)) reps[k].exact = await countExact(b);

/* Same prefix? Compare the tools and the system blocks up to the first breakpoint between surfaces and brands. */
const pre = b => JSON.stringify(b.tools) + '\u0000' + b.system.slice(0, b.system.findIndex(x => x.cache_control) + 1).map(x => x.text).join('\u0001');
const sameTools = (a, b) => JSON.stringify(a.tools) === JSON.stringify(b.tools);
const firstDiff = (a, b) => { const A = a.system, B = b.system; for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i].text !== B[i].text) return i; return Math.min(A.length, B.length); };
const cmp = {
  tools_same_web_vs_slack: sameTools(bodies.web_nobrand, bodies.slack),
  tools_same_lucky_vs_bonk: sameTools(bodies.web_lucky, bodies.web_bonk),
  first_bp_prefix_same_web_vs_slack: pre(bodies.web_nobrand) === pre(bodies.slack),
  first_bp_prefix_same_lucky_vs_bonk: pre(bodies.web_lucky) === pre(bodies.web_bonk),
  first_system_block_that_differs_lucky_vs_bonk: firstDiff(bodies.web_lucky, bodies.web_bonk),
  first_system_block_that_differs_web_vs_slack: firstDiff(bodies.web_nobrand, bodies.slack),
};

if (process.argv.includes('--json')) { console.log(JSON.stringify({ reps, cmp }, null, 1)); process.exit(0); }
for (const r of Object.values(reps)) {
  console.log(`\n=== ${r.label}: ~${r.totals.est_tokens.toLocaleString()} tokens est.${r.exact ? ` (exact ${r.exact.toLocaleString()})` : ''}, ${r.totals.tools_n} tools`);
  console.log('  system blocks:');
  for (const s of r.system) console.log(`   ${s.cache ? '[bp]' : '    '} ${String(s.tok).padStart(6)} tok  ${String(s.chars).padStart(7)} ch  ${s.head}`);
  console.log(`  tools loaded up front: ~${r.totals_loaded_tools_tok.toLocaleString()} tok (all definitions sent: ${(r.totals.tools_chars / CHARS_PER_TOKEN | 0).toLocaleString()})`);
  for (const [g, o] of Object.entries(r.tools).sort((a, b) => b[1].chars - a[1].chars)) console.log(`        ${String(o.tok).padStart(6)} tok  ${String(o.n).padStart(3)} tools${o.deferred ? ` (${o.deferred} deferred)` : ''}  ${g}`);
  console.log(`  prefix through the first cache breakpoint (${r.prefix.ttl}): ~${r.prefix.first_bp_tokens.toLocaleString()} tok`);
}
console.log('\n=== cache prefix checks'); for (const [k, v] of Object.entries(cmp)) console.log(`  ${k}: ${v}`);
if (process.argv.includes('--tools')) for (const [g, o] of Object.entries(reps.slack.tools)) console.log(g, o.names.join(' '));
if (process.argv.includes('--catalog')) console.log(bodies.slack.system.find(b => b.text.startsWith('## More tools')).text);
