/* Offline checks for what the Strategist MAKES (2026-10-09, src/stratmake.js): make_image (Studio's OpenAI path, the
 * model looks at it, one redo, Slack upload after the answer, Open in Studio), report share links + the PDF from the
 * code sandbox, run_analysis (code execution + Files API sub-call), Frame list / share / folder / move (no delete),
 * the public routes, and the engine hooks (image blocks in tool results, tool cost in the answer's cost, onReport,
 * afterSlack). In-memory SQLite for D1, a Map for R2; OpenAI, Anthropic, Shopify, Slack and Frame are mocked.
 *   node test-stratmake.mjs      (from account-health/worker)
 */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeTools, makeActions, makeHooks, handleMake, outputFileIds, imagePrompt, LIMITS, AH_ORIGIN, reportPage } from './src/stratmake.js';
import { useFetch as frameFetch } from './src/frame.js';
import { createAssistant } from '../../ask/engine.js';

/* ---------------- D1 + R2 ---------------- */
const db = new DatabaseSync(':memory:');
const bindSql = sql => sql.replace(/\?(\d+)/g, (_, n) => ':p' + n);
const vals = a => Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]));
const prep = sql => {
  let args = [];
  const st = () => db.prepare(bindSql(sql));
  const o = { bind(...a) { args = a; return o; }, async first() { return st().get(vals(args)) || null; },
    async all() { return { results: st().all(vals(args)) }; }, async run() { if (!/\?\d/.test(sql) && !args.length) { db.exec(sql); return { meta: { changes: 0 } }; } const r = st().run(vals(args)); return { meta: { changes: r.changes } }; } };
  return o;
};
const DB = { prepare: prep, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
db.exec(`CREATE TABLE brands (id TEXT PRIMARY KEY, slug TEXT, name TEXT, status TEXT, storage_prefix TEXT)`);
db.exec(`INSERT INTO brands VALUES ('brand_lucky', 'lucky', 'Lucky Golf', 'active', 'act_111'), ('brand_ice', 'ice', 'Ice & Gold', 'active', NULL)`);
db.exec(`CREATE TABLE brand_accounts (act_id TEXT PRIMARY KEY, name TEXT, tw_shop TEXT)`);
db.exec(`INSERT INTO brand_accounts VALUES ('brand_lucky', 'Lucky Golf', 'lucky-wedges.myshopify.com'), ('brand_ice', 'Ice & Gold', NULL)`);
db.exec(`CREATE TABLE connections (brand_id TEXT, kind TEXT, external_id TEXT, is_primary INTEGER DEFAULT 1, added_at TEXT DEFAULT '2026-01-01')`);
db.exec(`INSERT INTO connections VALUES ('brand_lucky', 'frame', 'https://next.frame.io/project/11111111-2222-3333-4444-555555555555', 1, '2026-01-01')`);
db.exec(`CREATE TABLE p_studio_cfg (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT)`);
db.exec(`INSERT INTO p_studio_cfg (key, value) VALUES ('openai_key', 'sk-test'), ('dna:act_111:carver-wedge', 'Raw finish, single slot on the toe, clover on the back.')`);
db.exec(`INSERT INTO p_studio_cfg (key, value) VALUES ('frame_tokens', '${JSON.stringify({ access: 'ftok', refresh: 'fr', exp: Date.now() + 3600e3, since: '2026-10-02' })}'), ('frame_client', '{"id":"c","secret":"s"}')`);
db.exec(`CREATE TABLE p_asset (act_id TEXT, file_id TEXT, products TEXT, thumb_key TEXT, kind TEXT)`);
db.exec(`INSERT INTO p_asset VALUES ('brand_lucky', 'f1', 'Carver Wedge', 'assets/act_111/f1.jpg', NULL)`);
db.exec(`CREATE TABLE p_studio_batch (id TEXT PRIMARY KEY, act_id TEXT, num TEXT, br_batch_id TEXT, name TEXT, brief_json TEXT, setup_json TEXT, plan_json TEXT, status TEXT)`);
const R2 = new Map();
const MEDIA = {
  async put(k, v, o) { const b = v instanceof Uint8Array ? v : new Uint8Array(v instanceof ArrayBuffer ? v : await new Response(v).arrayBuffer()); R2.set(k, { b, meta: o?.customMetadata || {}, type: o?.httpMetadata?.contentType }); },
  async get(k) { const x = R2.get(k); return x ? { body: x.b, customMetadata: x.meta, arrayBuffer: async () => x.b.slice().buffer } : null; },
};
R2.set('assets/act_111/f1.jpg', { b: new Uint8Array([0xff, 0xd8, 1, 2]), meta: {} });
const env = { DB, MEDIA, ANTHROPIC_API_KEY: 'ak', SLACK_BOT_TOKEN: 'x' };
const getSetting = async (e, k) => db.prepare(`SELECT value FROM settings WHERE key = ?`).get(k)?.value ?? null;
const putSetting = async (e, k, v) => { db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`).run(k, v); };
const safeJson = (s, dd) => { try { return s == null ? dd : JSON.parse(s); } catch { return dd; } };
const listAccounts = async () => [{ act_id: 'brand_lucky', name: 'Lucky Golf' }, { act_id: 'brand_ice', name: 'Ice & Gold' }];

/* ---------------- the outside world ---------------- */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 4, 0, 0, 0, 5, 0]);
const b64 = u => Buffer.from(u).toString('base64');
const calls = [];
let openaiSize = null, sandboxScript = [], anthFiles = new Map(), anthDeleted = [], nextFile = 1;
const jsonRes = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const xfetch = async (url, init = {}) => {
  const u = String(url);
  calls.push({ url: u, method: init.method || 'GET', body: init.body });
  if (u === 'https://api.openai.com/v1/models') return jsonRes({ data: [{ id: 'gpt-image-1' }, { id: 'gpt-image-2' }, { id: 'gpt-image-1-mini' }] });
  if (u.startsWith('https://api.openai.com/v1/images/')) {
    if (init.body instanceof FormData) openaiSize = init.body.get('size'); else openaiSize = JSON.parse(init.body).size;
    return jsonRes({ data: [{ b64_json: b64(PNG) }], usage: { input_tokens: 1000, input_tokens_details: { text_tokens: 400, image_tokens: 600 }, output_tokens: 6000 } });
  }
  if (u.startsWith('https://lucky-wedges.myshopify.com/products.json')) return jsonRes({ products: [{ title: 'Carver Wedge', handle: 'carver-wedge', images: [{ src: 'https://cdn.shopify.com/a.jpg' }, { src: 'https://cdn.shopify.com/b.jpg' }] }, { title: 'Eclipse Putter', handle: 'eclipse', images: [] }] });
  if (u.startsWith('https://cdn.shopify.com/')) return new Response(new Uint8Array([0xff, 0xd8, 9]), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  if (u === 'https://upload.test/x') return new Response('ok', { status: 200 });
  /* Anthropic Files API */
  if (u === 'https://api.anthropic.com/v1/files' && init.method === 'POST') {
    const f = init.body.get('file'); const id = 'file_' + (nextFile++);
    anthFiles.set(id, { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type });
    return jsonRes({ id, filename: f.name });
  }
  let m = /^https:\/\/api\.anthropic\.com\/v1\/files\/([\w]+)(\/content)?$/.exec(u);
  if (m) {
    if (init.method === 'DELETE') { anthDeleted.push(m[1]); return jsonRes({ id: m[1], type: 'file_deleted' }); }
    const f = anthFiles.get(m[1]); if (!f) return jsonRes({ error: { message: 'nope' } }, 404);
    return m[2] ? new Response(f.bytes, { status: 200 }) : jsonRes({ id: m[1], filename: f.name, mime_type: f.mime });
  }
  /* Anthropic sandbox sub-calls: scripted replies */
  if (u === 'https://api.anthropic.com/v1/messages') {
    const body = JSON.parse(init.body);
    const step = sandboxScript.shift();
    assert.ok(step, 'an unexpected sandbox call');
    return jsonRes(step(body));
  }
  /* Frame V4 */
  if (u.startsWith('https://api.frame.io/v4')) return frameMock(u.replace('https://api.frame.io/v4', ''), init);
  throw new Error('unmocked fetch ' + u);
};
frameFetch(xfetch);
const slackCalls = [];
const slack = async (e, method, p) => {
  slackCalls.push({ method, p });
  if (method === 'files.getUploadURLExternal') return { ok: true, upload_url: 'https://upload.test/x', file_id: 'F' + slackCalls.length };
  if (method === 'chat.postMessage') return { ok: true, ts: '1790009999.000' + slackCalls.length };
  return { ok: true };
};
const d = { xfetch, slack, getSetting, putSetting, safeJson, listAccounts };

/* Frame: one account, one workspace, the Lucky project with two folders and a file. */
const PROJ = '11111111-2222-3333-4444-555555555555', ROOT = 'aaaaaaaa-0000-0000-0000-000000000000', AD = 'bbbbbbbb-0000-0000-0000-000000000000', OLD = 'cccccccc-0000-0000-0000-000000000000', FILE = 'dddddddd-0000-0000-0000-000000000000';
const frameWrites = [];
function frameMock(p, init) {
  const method = init.method || 'GET';
  if (method !== 'GET') { frameWrites.push({ method, p, body: init.body ? JSON.parse(init.body) : null }); }
  if (/DELETE/.test(method)) throw new Error('a DELETE reached Frame');
  if (p === '/accounts') return jsonRes({ data: [{ id: 'acc1' }] });
  if (p === '/accounts/acc1/workspaces') return jsonRes({ data: [{ id: 'ws1', name: 'Mobius' }] });
  if (p === '/accounts/acc1/workspaces/ws1/projects') return jsonRes({ data: [{ id: PROJ, name: 'Lucky Golf', root_folder_id: ROOT }, { id: 'p2', name: 'Grunk Dolfer', root_folder_id: 'r2' }] });
  if (p.startsWith(`/accounts/acc1/folders/${ROOT}/children`)) return jsonRes({ data: [{ id: AD, name: 'Ad Concepts', type: 'folder' }, { id: OLD, name: 'Clips/B-Roll', type: 'folder' }, { id: FILE, name: 'carver-hook.mp4', type: 'file', view_url: 'https://next.frame.io/view/x' }] });
  if (p.startsWith(`/accounts/acc1/folders/${AD}/children`)) return jsonRes({ data: [{ id: 'eeeeeeee-0000-0000-0000-000000000000', name: 'Batch 12', type: 'folder' }] });
  if (p === `/accounts/acc1/projects/${PROJ}/shares` && method === 'POST') return jsonRes({ data: { id: 'sh1', short_url: 'https://f.io/abc' } });
  if (p === `/accounts/acc1/folders/${AD}/folders` && method === 'POST') return jsonRes({ data: { id: 'new', view_url: 'https://next.frame.io/project/x/new' } });
  if (/\/move$/.test(p) && method === 'PATCH') return jsonRes({ data: { id: 'moved' } });
  if (p === `/accounts/acc1/files/${FILE}`) return jsonRes({ data: { id: FILE, name: 'carver-hook.mp4', type: 'file' } });
  if (p.startsWith('/accounts/acc1/folders/') && method === 'GET') return jsonRes({ errors: [{ detail: 'not a folder' }] }, 404);
  return jsonRes({ errors: [{ detail: 'unmocked ' + p }] }, 404);
}

const checks = [];
const check = async (name, fn) => { try { await fn(); checks.push({ name, pass: true }); } catch (e) { checks.push({ name, pass: false, error: e.stack?.split('\n').slice(0, 3).join(' | ') }); } };
const tools = Object.fromEntries(makeTools(d).map(t => [t.def.name, t]));
const actions = Object.fromEntries(makeActions(d).map(a => [a.name, a]));
const hooks = makeHooks(d);

/* ---------------- images ---------------- */
await check('make_image (Locus): product photos + library shot + fingerprint go to GPT Image, stored in R2, the model gets the picture back', async () => {
  calls.length = 0;
  const ctx = { surface: 'web', screen: { act_id: 'brand_lucky' }, who: 'cole@' };
  const r = await tools.make_image.run(env, { brief: 'The Carver on wet grass at dawn, low angle', product: 'carver', format: '4:5', words: { headline: 'Spin that sticks' }, title: 'Carver dawn' }, ctx);
  assert.ok(Array.isArray(r.content) && r.content[1].type === 'image' && r.content[1].source.type === 'base64', 'image block for the model');
  assert.match(r.content[0].text, /LOOK AT IT/); assert.match(r.content[0].text, /redo_of="[a-f0-9]{24}"/);
  const edit = calls.find(c => c.url.endsWith('/images/edits'));
  assert.ok(edit, 'edits endpoint with reference photos');
  assert.equal(edit.body.getAll('image[]').length, 3, '2 Shopify photos + 1 library shot');
  assert.equal(edit.body.get('model'), 'gpt-image-2', 'newest non-mini model');
  const prompt = edit.body.get('prompt');
  assert.match(prompt, /Carver Wedge/); assert.match(prompt, /single slot on the toe/); assert.match(prompt, /"Spin that sticks"/); assert.match(prompt, /4:5 portrait/);
  assert.equal(openaiSize, '1024x1280');
  const m = r.flags.media[0];
  assert.match(m.url, new RegExp(`^${AH_ORIGIN}/strat/[a-f0-9]{24}\\.png$`));
  assert.ok(R2.has(`strat/${m.id}.png`)); assert.equal(m.actions[0].label, 'Open in Studio');
  assert.ok(r.cost > 0.2 && r.cost < 0.5, 'cost from usage ' + r.cost);
  const row = db.prepare(`SELECT * FROM strat_media WHERE id = ?`).get(m.id);
  assert.equal(row.act_id, 'brand_lucky'); assert.equal(row.kind, 'image');
});
await check('make_image: one redo allowed (the old one is replaced), a second redo and the per-answer cap refused', async () => {
  const ctx = { surface: 'web', screen: { act_id: 'brand_lucky' } };
  const a = await tools.make_image.run(env, { brief: 'flat lay of the wedge', format: '1:1' }, ctx);
  assert.equal(openaiSize, '1024x1024');
  const id = a.flags.media[0].id;
  const b = await tools.make_image.run(env, { redo_of: id, fix: 'the clover is missing' }, ctx);
  assert.equal(b.flags.media[0].replaces, id);
  assert.match(calls.filter(c => /images\//.test(c.url)).pop().body instanceof FormData ? '' : JSON.parse(calls.filter(c => /images\//.test(c.url)).pop().body).prompt, /redo\. The last version missed: the clover is missing/);
  const c = await tools.make_image.run(env, { redo_of: id, fix: 'again' }, ctx);
  assert.equal(c.is_error, true);
  await tools.make_image.run(env, { brief: 'x' }, ctx); await tools.make_image.run(env, { brief: 'y' }, ctx);
  const e = await tools.make_image.run(env, { brief: 'z' }, ctx);
  assert.equal(e.is_error, true); assert.match(e.text, new RegExp(`${LIMITS.imagesPerAnswer} images`));
});
await check('make_image: no OpenAI key says where to connect it; no brand asks which', async () => {
  db.exec(`UPDATE p_studio_cfg SET key = 'openai_key_off' WHERE key = 'openai_key'`);
  const r = await tools.make_image.run(env, { brief: 'x' }, { screen: { act_id: 'brand_lucky' } });
  db.exec(`UPDATE p_studio_cfg SET key = 'openai_key' WHERE key = 'openai_key_off'`);
  assert.match(r.text, /Studio/);
  const r2 = await tools.make_image.run(env, { brief: 'x' }, { screen: null });
  assert.match(r2.text, /Which brand/);
});
await check('Open in Studio: the image is copied into Studio refs and a one-line draft batch carries it', async () => {
  const id = db.prepare(`SELECT id FROM strat_media WHERE kind = 'image' ORDER BY at LIMIT 1`).get().id;
  const res = await handleMake(new Request(`${AH_ORIGIN}/api/strat/studio`, { method: 'POST', body: JSON.stringify({ id }) }), env, new URL(`${AH_ORIGIN}/api/strat/studio`), '/api/strat/studio', (o, s) => jsonRes(o, s || 200), async () => true, d);
  const j = await res.json();
  assert.equal(j.ok, true); assert.match(j.note, /Studio/);
  assert.ok(R2.has(`studio/ref/${id}.png`));
  const b = db.prepare(`SELECT * FROM p_studio_batch WHERE id = ?`).get(j.batch);
  assert.equal(b.status, 'draft'); assert.equal(b.act_id, 'brand_lucky');
  assert.match(JSON.parse(b.brief_json).lines[0].inspo[0], new RegExp(`/api/studio/ref/${id}\\.png$`));
  const denied = await handleMake(new Request(`${AH_ORIGIN}/api/strat/studio`, { method: 'POST', body: '{}' }), env, new URL(`${AH_ORIGIN}/api/strat/studio`), '/api/strat/studio', (o, s) => jsonRes(o, s || 200), async () => false, d);
  assert.equal(denied.status, 401);
});
await check('imagePrompt: 9:16 layout, no words unless asked, never em dashes', () => {
  const p = imagePrompt({ brand: 'Lucky Golf', kind: 'concept', brief: 'moodboard', format: '9:16' });
  assert.match(p, /TALL 9:16/); assert.match(p, /Put no text on the image/); assert.doesNotMatch(p, /—/);
});

/* ---------------- the sandbox: analysis ---------------- */
const codeResult = (fileIds, text = 'Weekly MER fell 12% after Sep 15.') => [
  () => ({ stop_reason: 'pause_turn', container: { id: 'cont_1' }, usage: { input_tokens: 3000, output_tokens: 800 }, content: [{ type: 'server_tool_use', id: 's1', name: 'bash_code_execution', input: { command: 'python a.py' } }] }),
  body => { assert.equal(body.container, 'cont_1', 'the container carries over on pause_turn'); return { stop_reason: 'end_turn', usage: { input_tokens: 4000, output_tokens: 600 },
    content: [{ type: 'bash_code_execution_tool_result', tool_use_id: 's1', content: { type: 'bash_code_execution_result', stdout: 'ok', stderr: '', return_code: 0, content: fileIds.map(f => ({ type: 'bash_code_execution_output', file_id: f })) } }, { type: 'text', text }] }; },
];
await check('run_analysis (Locus): data up through the Files API, code execution sub-call, files back into R2 as downloads, cost counted', async () => {
  anthFiles.set('file_out1', { name: 'mer-trend.png', bytes: PNG, mime: 'image/png' });
  anthFiles.set('file_out2', { name: 'Weekly MER.xlsx', bytes: new Uint8Array([80, 75, 3, 4]), mime: '' });
  let seenFirst = null;
  sandboxScript = codeResult(['file_out1', 'file_out2']);
  const first = sandboxScript[0]; sandboxScript[0] = b => { seenFirst = b; return first(b); };
  const r = await tools.run_analysis.run(env, { ask: 'weekly MER trend with a chart and an xlsx', data: 'week,mer\n2026-09-01,3.1\n2026-09-08,2.7', brand: 'Lucky Golf' }, { surface: 'web', screen: { act_id: 'brand_lucky' } });
  assert.equal(seenFirst.tools[0].type, 'code_execution_20260521'); assert.equal(seenFirst.model, 'claude-opus-5-5');
  assert.ok(!seenFirst.tools.some(t => /web_/.test(t.type)), 'no web tools beside code execution');
  assert.ok(seenFirst.messages[0].content.some(c => c.type === 'container_upload'));
  assert.match(seenFirst.system, /\$OUTPUT_DIR/);
  assert.match(r.text, /MER fell 12%/);
  assert.equal(r.flags.media.length, 2);
  assert.equal(r.flags.media[0].kind, 'image'); assert.equal(r.flags.media[1].kind, 'file'); assert.equal(r.flags.media[1].name, 'weekly-mer.xlsx');
  assert.ok(R2.has(`strat/${r.flags.media[1].id}.xlsx`));
  assert.ok(r.cost > 0.02 && r.cost < 0.2, 'cost ' + r.cost);
  assert.ok(anthDeleted.includes('file_out1') && anthDeleted.some(x => /^file_\d+$/.test(x)), 'input and outputs deleted from the Files API');
});
await check('run_analysis (Slack): files uploaded into the thread; no data = refused before any call', async () => {
  anthFiles.set('file_out3', { name: 'cohorts.csv', bytes: new TextEncoder().encode('a,b\n1,2'), mime: 'text/csv' });
  sandboxScript = codeResult(['file_out3']);
  slackCalls.length = 0;
  const r = await tools.run_analysis.run(env, { ask: 'cohorts', data: '[{"a":1}]' }, { surface: 'slack', channel: 'C1', thread: '1.2', screen: { act_id: 'brand_lucky' } });
  const done = slackCalls.find(c => c.method === 'files.completeUploadExternal');
  assert.equal(done.p.channel_id, 'C1'); assert.equal(done.p.thread_ts, '1.2');
  assert.match(r.text, /in the thread/);
  const bad = await tools.run_analysis.run(env, { ask: 'x', data: '' }, { surface: 'web' });
  assert.equal(bad.is_error, true);
});
await check('outputFileIds: only files the sandbox handed back, never the uploads', () => {
  const ids = outputFileIds([{ type: 'container_upload', file_id: 'in' }, { type: 'bash_code_execution_tool_result', content: { type: 'bash_code_execution_result', content: [{ type: 'bash_code_execution_output', file_id: 'out' }] } }]);
  assert.deepEqual(ids, ['out']);
});

/* ---------------- the engine: reports, images, costs ---------------- */
const realFetch = globalThis.fetch;
let modelScript = [];
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('api.anthropic.com/v1/messages')) return realFetch(url, init);
  const body = JSON.parse(init.body);
  return jsonRes(modelScript.shift()(body));
};
const engine = createAssistant({ name: 'Strategist', who: 'test', schema: '', sqlTool: 'query_locus', model: 'claude-opus-5-5', strongModel: 'claude-opus-5-5', deepModel: 'claude-opus-5-5',
  ...hooks, tools: makeTools(d), actions: makeActions(d), slackName: 'Strategist', slackApp: 'locus', liveSteps: true });
const h = () => ({ getSetting, putSetting, safeJson, centralDate: () => '2026-10-09', monthOf: x => String(x).slice(0, 7), slack });
const REPORT = { title: 'Lucky Golf, September', subtitle: 'Sep 2026, Triple Whale', blocks: [{ type: 'kpis', items: [{ label: 'Revenue', value: '$184,220' }] }, { type: 'chart', kind: 'line', x: ['a', 'b'], series: [{ name: 'Rev', values: [1, 2] }] }] };
await check('Slack: make_report gets a share link + PDF buttons, the PDF renders in the sandbox and lands in the thread after the text; the image made in the same answer is posted, its redo is not', async () => {
  slackCalls.length = 0;
  let imgSeen = null;
  modelScript = [
    () => ({ stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'tool_use', id: 't1', name: 'make_image', input: { brief: 'carver hero', product: 'carver' } }] }),
    body => { const tr = body.messages[body.messages.length - 1].content[0]; imgSeen = tr; const id = tr.content[0].text.match(/image ([a-f0-9]{24})/)[1];
      return { stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'tool_use', id: 't2', name: 'make_image', input: { redo_of: id, fix: 'clover missing' } }, { type: 'tool_use', id: 't3', name: 'make_report', input: REPORT }] }; },
    () => ({ stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: 'Here is the hero and the September report.' }] }),
  ];
  anthFiles.set('file_pdf', { name: 'report.pdf', bytes: new TextEncoder().encode('%PDF-1.4 test'), mime: 'application/pdf' });
  sandboxScript = [body => { assert.equal(body.model, 'claude-haiku-4-5'); assert.equal(body.messages[0].content.filter(c => c.type === 'container_upload').length, 2); assert.match(body.messages[0].content[0].text, /render_report\.py/);
    return { stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 80 }, content: [{ type: 'bash_code_execution_tool_result', content: { type: 'bash_code_execution_result', return_code: 0, stdout: 'ok', content: [{ type: 'bash_code_execution_output', file_id: 'file_pdf' }] } }, { type: 'text', text: 'done' }] }; }];
  const r = await engine.answerSlack(env, { channel: 'C_LUCKY_INT', ts: '1790002000.000100', user: 'U1', text: '<@B> make a hero for the carver and a Sept report' }, h(), { screen: { act_id: 'brand_lucky' } });
  assert.ok(Array.isArray(imgSeen.content) && imgSeen.content.some(c => c.type === 'image'), 'the tool_result carried the image block');
  const posts = slackCalls.filter(c => c.method === 'chat.postMessage');
  const btn = posts.find(p => (p.p.blocks || []).some(b => b.type === 'actions' && b.elements[0].url && /\/r\/[a-f0-9]{32}$/.test(b.elements[0].url)));
  assert.ok(btn, 'Open the report button'); assert.ok(btn.p.blocks.some(b => /\.pdf$/.test(b.elements[0].url)), 'PDF button');
  assert.ok(btn.p.blocks.every(b => b.elements[0].action_id === 'noop_open'));
  const uploads = slackCalls.filter(c => c.method === 'files.completeUploadExternal');
  assert.equal(uploads.length, 2, 'one image (the redo) + one PDF');
  const reportTextAt = slackCalls.findIndex(c => c.method === 'chat.postMessage' && /\*Lucky Golf, September\*/.test(c.p.text));
  assert.ok(slackCalls.findIndex(c => c.method === 'files.completeUploadExternal') > reportTextAt, 'uploads come after the report text');
  const getUrl = slackCalls.filter(c => c.method === 'files.getUploadURLExternal').map(c => c.p.filename);
  assert.ok(getUrl.some(f => /\.pdf$/.test(f))); assert.ok(getUrl.some(f => /\.png$/.test(f)));
  assert.ok(r.cost > 0.45, 'two images joined the answer cost: ' + r.cost);
  const row = db.prepare(`SELECT * FROM strat_report`).get();
  assert.ok(row.pdf_key && R2.has(row.pdf_key), 'the PDF is kept for the link');
});
await check('Locus: make_report returns share + pdf on the report; images come back as media; the Slack thread is untouched', async () => {
  slackCalls.length = 0;
  modelScript = [
    () => ({ stop_reason: 'tool_use', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'tool_use', id: 't1', name: 'make_report', input: REPORT }] }),
    () => ({ stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 50 }, content: [{ type: 'text', text: 'Built.' }] }),
  ];
  const r = await engine.answerWeb(env, 'build me the September report', [], h(), { screen: { act_id: 'brand_lucky' } });
  assert.match(r.reports[0].share, /\/r\/[a-f0-9]{32}$/); assert.match(r.reports[0].pdf, /\.pdf$/);
  assert.equal(slackCalls.length, 0); assert.equal(sandboxScript.length, 0, 'no PDF rendered until someone opens it');
});
globalThis.fetch = realFetch;

/* ---------------- public routes ---------------- */
const route = (p, admin = false) => handleMake(new Request(AH_ORIGIN + p), env, new URL(AH_ORIGIN + p), new URL(AH_ORIGIN + p).pathname, (o, s) => jsonRes(o, s || 200), async () => admin, d);
await check('routes: /strat/<id>.png serves the image, ?dl=1 downloads, /r/<token> is the light printable page, .pdf is the stored file, report-public is JSON', async () => {
  const img = db.prepare(`SELECT id FROM strat_media WHERE kind = 'image' LIMIT 1`).get().id;
  const a = await route(`/strat/${img}.png`);
  assert.equal(a.headers.get('Content-Type'), 'image/png'); assert.match(a.headers.get('Content-Disposition'), /^inline/);
  assert.match((await route(`/strat/${img}.png?dl=1`)).headers.get('Content-Disposition'), /^attachment/);
  assert.equal((await route('/strat/' + 'f'.repeat(24) + '.png')).status, 404);
  const tok = db.prepare(`SELECT token FROM strat_report WHERE pdf_key IS NOT NULL`).get().token;
  const page = await (await route(`/r/${tok}`)).text();
  assert.match(page, /Lucky Golf, September/); assert.match(page, /LOCUS/); assert.match(page, /Lucky Golf/); assert.match(page, /@media print/);
  assert.doesNotMatch(page, /—/);
  const pdf = await route(`/r/${tok}.pdf`);
  assert.equal(pdf.headers.get('Content-Type'), 'application/pdf'); assert.match(await pdf.text(), /^%PDF/);
  const pub = await (await route(`/api/report-public?t=${tok}`)).json();
  assert.equal(pub.report.title, 'Lucky Golf, September');
  assert.equal((await route('/r/' + '0'.repeat(32))).status, 404);
  assert.equal((await route('/api/strat/media')).status, 401);
});
await check('Locus PDF on first click: rendered in the sandbox, then served from R2 without another call', async () => {
  const tok = db.prepare(`SELECT token FROM strat_report WHERE pdf_key IS NULL`).get().token;
  anthFiles.set('file_pdf2', { name: 'report.pdf', bytes: new TextEncoder().encode('%PDF-1.7 two'), mime: 'application/pdf' });
  sandboxScript = [() => ({ stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 80 }, content: [{ type: 'bash_code_execution_tool_result', content: { content: [{ type: 'bash_code_execution_output', file_id: 'file_pdf2' }] } }] })];
  assert.match(await (await route(`/r/${tok}.pdf`)).text(), /^%PDF-1\.7/);
  assert.match(await (await route(`/r/${tok}.pdf`)).text(), /^%PDF-1\.7/, 'second open from R2 (no sandbox step left)');
});
await check('reportPage escapes what the model wrote', () => {
  const p = reportPage({ title: '<script>x</script>', blocks: [{ type: 'text', text: '<b>hi</b>' }] }, 'a'.repeat(32), null);
  assert.doesNotMatch(p, /<script>x/); assert.match(p, /&lt;b&gt;hi/);
});

/* ---------------- Frame ---------------- */
await check('frame_list: the brand\'s project from its connection, a folder by a path of names', async () => {
  const r = JSON.parse((await tools.frame_list.run(env, { folder: 'Ad Concepts' }, { screen: { act_id: 'brand_lucky' } })).text);
  assert.equal(r.project, 'Lucky Golf'); assert.equal(r.folder, 'Ad Concepts'); assert.equal(r.items[0].name, 'Batch 12');
  const top = JSON.parse((await tools.frame_list.run(env, {}, { screen: { act_id: 'brand_lucky' } })).text);
  assert.equal(top.items.length, 3);
});
await check('frame_share: a public review link for a file by name', async () => {
  frameWrites.length = 0;
  const r = await tools.frame_share.run(env, { target: 'carver-hook', name: 'Carver hook v2' }, { screen: { act_id: 'brand_lucky' } });
  assert.match(r.text, /https:\/\/f\.io\/abc/);
  const w = frameWrites[0];
  assert.equal(w.p, `/accounts/acc1/projects/${PROJ}/shares`);
  assert.deepEqual(w.body.data.asset_ids, [FILE]); assert.equal(w.body.data.access, 'public'); assert.equal(w.body.data.type, 'asset'); assert.equal(w.body.data.downloading_enabled, false);
});
await check('frame_folder / frame_move: proposals that write nothing until Apply; a twin folder refused; move uses the file route', async () => {
  frameWrites.length = 0;
  const twin = await actions.frame_folder.propose(env, { brand: 'Lucky Golf', name: 'ad concepts' }, null, {});
  assert.match(twin.error, /already has a folder/);
  const p = await actions.frame_folder.propose(env, { brand: 'Lucky Golf', parent: 'Ad Concepts', name: 'Batch 13' }, null, {});
  assert.equal(frameWrites.length, 0, 'propose wrote nothing');
  const ap = await actions.frame_folder.apply(env, p.patch);
  assert.match(ap.note, /Batch 13/); assert.equal(frameWrites[0].p, `/accounts/acc1/folders/${AD}/folders`);
  const mv = await actions.frame_move.propose(env, { brand: 'Lucky Golf', item: 'carver-hook.mp4', to: 'Ad Concepts' }, null, {});
  assert.equal(mv.patch.type, 'file');
  await actions.frame_move.apply(env, mv.patch);
  const last = frameWrites.pop();
  assert.equal(last.method, 'PATCH'); assert.equal(last.p, `/accounts/acc1/files/${FILE}/move`); assert.equal(last.body.data.parent_id, AD);
});
await check('Frame: there is no delete anywhere (tools, actions, or a DELETE sent)', () => {
  const names = [...makeTools(d).map(t => t.def.name), ...makeActions(d).map(a => a.name)];
  assert.ok(!names.some(n => /delete|remove|trash|archive/i.test(n)));
  assert.ok(!frameWrites.some(w => w.method === 'DELETE'));
  const src = readFileSync(new URL('./src/stratmake.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src.replace(/method: 'DELETE', headers: antHead/g, ''), /'DELETE'/, 'the only DELETE is the Files API cleanup');
});
await check('no em dashes in the new code', () => {
  for (const f of ['./src/stratmake.js', './scripts/render_report.py', '../../ask/ask-ui.js']) assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /—/, f);
});

for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.pass ? '' : '\n      ' + c.error}`);
const passed = checks.filter(c => c.pass).length;
console.log(`\n${passed}/${checks.length} passed`);
process.exit(passed === checks.length ? 0 : 1);
