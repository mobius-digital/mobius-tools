/* Offline checks for THE MESSAGE CATALOG (2026-11-26, src/catalog.js). This is how "nothing is sent that is not on
 * the list" is enforced: every send call site in account-health/worker/src and profit/worker/src (RAW_SENDS: a Slack
 * post, scheduled post, private note, edit, file share or tap reply; a Discord post, DM or edit; a Gmail or Resend
 * mail; or a call to one of the send helpers in SEND_CALLS) must be mapped to a catalog id, a mapped site must still exist, and every entry must be
 * complete and draw a house style example. Made up numbers and names only. Nothing leaves the machine.
 *   node test-catalog.mjs                 the checks, then the entries not on the renderer yet
 *   node test-catalog.mjs --sites         also print every call site found
 *   node test-catalog.mjs --write-sample  also write the v5 sample (profit/v5/pages/a-settings/_sample/messages.json) */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, SITES, TRANSPORTS, SEND_CALLS, RAW_SENDS, GROUPS, STATUS, catalogPayload } from './src/catalog.js';
import { SENDER_KINDS } from './src/sender.js';
import { houseLint } from './src/house.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, 'src');
const SAMPLE = path.join(here, '..', '..', 'profit', 'v5', 'pages', 'a-settings', '_sample', 'messages.json');
const SKIP = new Set(['routes.js', 'knowledge.js', 'catalog.js']);   // generated text, and this list itself
const DIRS = [{ dir: SRC, prefix: '' }, { dir: path.join(here, '..', '..', 'profit', 'worker', 'src'), prefix: 'profit/' }];

let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', String(e.stack || e).split('\n').slice(0, 6).join('\n    ')); } };

/* ---- the scanner ----
   Both workers that send are scanned: account-health/worker/src (keys "file.js:fn") and profit/worker/src (keys
   "profit/file.js:fn"; the creator Discord routes live there).
   A send = a raw send named in the line (RAW_SENDS in catalog.js: Slack posts, scheduled posts, private notes, edits,
   file shares and tap replies; Discord channel, DM and webhook posts and edits; Gmail and Resend mail) or a call to
   one of the send helpers (SEND_CALLS). Its key = file:function, where function = the last top level declaration above it
   (function, const, or a method at the top of an object); inside a request handler the last route test above it
   (path === '/api/...', path.startsWith('/api/...'), or a /^\/api\/name/.exec(path) pattern) is added: file:function@/api/.... */
const PAT = new RegExp([...RAW_SENDS.map(r => r.source), `\\b(?:${SEND_CALLS.join('|')})\\s*\\(`].join('|'));
const DEF = /^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=|^\s{0,2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*$/;
const ROUTE = /path\s*===\s*'([^']+)'|path\.startsWith\('([^']+)'\)|\/\^\\\/api\\\/([a-z][\w-]*)[^;]*\.exec\(path\)/;
const NOT_NAMES = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return']);
export function scan(dirs = DIRS) {
  const sites = new Map();
  for (const { dir, prefix } of dirs) for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.js') && !(prefix === '' && SKIP.has(x))).sort()) {
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').split('\n');
    let fn = '(top)', route = '', inComment = false;
    lines.forEach((l, i) => {
      const t = l.trim();
      if (inComment) { if (t.includes('*/')) inComment = false; return; }
      if (t.startsWith('/*') && !t.includes('*/')) { inComment = true; return; }
      if (t.startsWith('//') || t.startsWith('*') || (t.startsWith('/*') && t.endsWith('*/'))) return;
      const d = l.match(DEF);
      if (d && (/^\S/.test(l) || /^\s{0,2}(?:async\s+)?\w+\s*\(/.test(l))) {
        const name = d[1] || d[2] || d[3];
        if (name && !NOT_NAMES.has(name)) { fn = name; route = ''; }
      }
      const r = l.match(ROUTE);
      if (r) route = r[1] || r[2] || `/api/${r[3]}/`;
      if (PAT.test(l)) {
        const key = `${prefix}${f}:${fn}${route ? '@' + route : ''}`;
        if (!sites.has(key)) sites.set(key, []);
        sites.get(key).push(i + 1);
      }
    });
  }
  return sites;
}

const sites = scan();
const transports = new Set(TRANSPORTS);
const ids = new Set(CATALOG.map(e => e.id));

if (process.argv.includes('--sites')) for (const [k, v] of sites) console.log(`   ${k}  lines ${v.join(',')}  ->  ${transports.has(k) ? '(pipe)' : (SITES[k] || ['NOT MAPPED']).join(', ')}`);

await check('every send call site in both workers is mapped to a catalog id (or is a pipe whose callers are mapped)', () => {
  const loose = [...sites.keys()].filter(k => !transports.has(k) && !SITES[k]);
  assert.deepEqual(loose, [], `not on the list: ${loose.map(k => `${k} (lines ${sites.get(k).join(',')})`).join('; ')}`);
});

await check('the scanner sees every kind of send (and not a model call or a read)', () => {
  const sends = [
    "await slackApi(env, 'chat.postMessage', { channel, text });",
    "await d.slack(env, 'chat.scheduleMessage', { channel, text, post_at });",
    "await slackApi(env, 'chat.postEphemeral', { channel, user, text });",
    "await slackApi(env, 'chat.update', { channel, ts, text });",
    "await xfetch('https://slack.com/api/files.completeUploadExternal', form({ files }));",
    "await xfetch(payload.response_url, { method: 'POST', body });",
    "await fetch(`${DC_API}/channels/${ch.id}/messages`, { method: 'POST', body });",
    "await fetch(`${DC_API}/webhooks/${h.id}/${h.token}?wait=true`, init);",
    "await dc(token, 'PATCH', `/webhooks/${h.id}/${h.token}/messages/${mid}`, body, false);",
    "await F('https://api.resend.com/emails', { method: 'POST', body });",
    "await F('https://www.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body });",
    "await dcHookPost(env, act, d, 'this-week', embed);",
    "await slackUpdate(env, ch, ts, text, blocks);",
  ];
  for (const l of sends) assert.ok(PAT.test(l), `not seen: ${l}`);
  const not = [
    "await xfetch('https://api.anthropic.com/v1/messages', { method: 'POST', body });",
    "await fetch(`${ANT}/messages`, { method: 'POST', body });",
    "await fetch(`${DC_API}/channels/${id}/messages?limit=50`, { headers: H });",
    "const job = { response_url: payload.response_url || null };",
  ];
  for (const l of not) assert.ok(!PAT.test(l), `wrongly seen: ${l}`);
});

await check('every mapped site and every pipe still exists in the code', () => {
  const stale = [...Object.keys(SITES), ...TRANSPORTS].filter(k => !sites.has(k));
  assert.deepEqual(stale, [], `mapped but not found: ${stale.join(', ')}`);
});

await check('ids are unique and every site points at a real id', () => {
  assert.equal(ids.size, CATALOG.length, 'a repeated id');
  for (const [k, v] of Object.entries(SITES)) for (const id of v) assert.ok(ids.has(id), `${k} -> ${id}`);
});

await check('every entry is complete: group, name, channel, who, when, why, sender, status, where', () => {
  for (const e of CATALOG) {
    assert.ok(GROUPS.includes(e.group), `${e.id}: group "${e.group}"`);
    assert.ok(STATUS.includes(e.status), `${e.id}: status "${e.status}"`);
    for (const f of ['name', 'channel', 'who', 'when', 'why']) assert.ok(typeof e[f] === 'string' && e[f].trim(), `${e.id}: no ${f}`);
    assert.ok(/^(Slack DM|internal channel|client channel|email|Discord)( or (Slack DM|internal channel|client channel|email|Discord))?$/.test(e.channel), `${e.id}: channel "${e.channel}"`);
    assert.ok(e.kind === null ? !!(e.fromNote || e.fixedFrom) : !!SENDER_KINDS[e.kind], `${e.id}: sender kind "${e.kind}"`);
    if (e.fixedFrom) assert.ok(['locus', 'cole'].includes(e.fixedFrom), `${e.id}: fixedFrom`);
    assert.equal(typeof e.onRenderer, 'boolean', `${e.id}: onRenderer`);
    assert.ok(Array.isArray(e.where) && e.where.length, `${e.id}: where`);
    assert.ok(!e.audit || /^a\d{1,2}$/.test(e.audit), `${e.id}: audit id`);
    assert.equal(typeof e.example, 'function', `${e.id}: example()`);
  }
});

await check('every example is a house style message: a header, no lint problems, no dashes', () => {
  for (const e of CATALOG) {
    const m = e.example();
    assert.ok(m && Array.isArray(m.blocks) && m.blocks[0] && m.blocks[0].type === 'header', `${e.id}: no header`);
    assert.ok(m.text && m.text.trim(), `${e.id}: no notification text`);
    assert.deepEqual(houseLint(m), [], `${e.id}: ${houseLint(m).join(', ')}`);
  }
});

await check('no em or en dash and no email address anywhere in the catalog', () => {
  const all = JSON.stringify(catalogPayload());
  assert.ok(!/[\u2014\u2013]/.test(all), 'a dash');
  assert.ok(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(all), 'an email address');
});

await check('catalogPayload: the sender follows the setting, fixed senders stay, counts add up', () => {
  const def = catalogPayload({ person: 'Pat' });
  const byId = id => def.entries.find(e => e.id === id);
  assert.equal(byId('client_daily').from, 'cole');
  assert.equal(byId('client_daily').fromLabel, 'Pat');
  assert.equal(byId('spend_low').from, 'locus');
  assert.equal(byId('client_approve_done').from, 'locus');
  assert.equal(byId('agent_post').from, null);
  assert.ok(byId('agent_post').fromLabel.length > 3);
  const all = catalogPayload({ stored: { all: 'locus', kinds: {} } });
  assert.equal(all.entries.find(e => e.id === 'client_daily').from, 'locus');
  assert.equal(all.entries.find(e => e.id === 'email_agreement').from, 'cole', 'no Locus mailbox: email stays with the owner');
  assert.equal(def.counts.total, CATALOG.length);
  assert.equal(STATUS.reduce((s, k) => s + def.counts[k], 0), CATALOG.length);
  assert.ok(def.entries.every(e => e.example && !e.example_error));
});

if (process.argv.includes('--write-sample')) {
  const p = catalogPayload({ person: 'Pat' });
  fs.writeFileSync(SAMPLE, JSON.stringify(p, null, 1) + '\n');
  console.log('wrote', SAMPLE);
}

await check('the v5 sample (a-settings/_sample/messages.json) lists the same ids as the catalog', () => {
  const s = JSON.parse(fs.readFileSync(SAMPLE, 'utf8'));
  assert.deepEqual(s.entries.map(e => e.id), CATALOG.map(e => e.id), 'run node test-catalog.mjs --write-sample');
});

const off = CATALOG.filter(e => !e.onRenderer);
console.log(`\n${CATALOG.length} messages, ${sites.size} call sites (${[...sites.keys()].filter(k => transports.has(k)).length} pipes).`);
console.log(`Not on the house style renderer yet (${off.length}):`);
for (const e of off) console.log(`   ${e.id}  ${e.name}  [${e.status}]  ${e.where.join(', ')}`);
console.log(`\n${n} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
