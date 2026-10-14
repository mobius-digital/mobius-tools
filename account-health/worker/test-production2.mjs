/* Offline checks for PRODUCTION V2 (2026-10-14, src/prodwork.js + the routes in src/production.js): the brief's fields
 * round trip to brief_text, AI fill never overwrites a typed field, comments and @mentions (Slack DM mocked), notes
 * with drawings, uploads to R2 and the signed file link, approve / ask for changes moving the card and telling the
 * maker, the client's scope (own brand only, no drag / new brief / upload), the review link with no login, the Asana
 * mirror switch stopping every Asana write, and the 60-day prune. In-memory SQLite (node:sqlite), R2 a Map.
 *   node test-production2.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { handleProduction, moveCard, formatOf } from './src/production.js';
import { briefText, fieldsFromText, normBrief, mergeAi, aiFill, saveCard, addComment, decide, getCard, uploadFile, sendToClient,
  serveFile, fileUrl, handleReviewLink, shareLink, pruneFiles, setMirror, mirrorOn, normShape, clientBoard, briefHtml, savePhoto, teamPhotos } from './src/prodwork.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => { let hi = 0; return sql.replace(/\?(\d*)/g, (_, n) => { if (n) { hi = Math.max(hi, +n); return ':p' + n; } hi++; return ':p' + hi; }); };
const vals = (a, sql) => { const used = new Set([...bindSql(sql).matchAll(/:p(\d+)/g)].map(m => 'p' + m[1])); return Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]).filter(([k]) => used.has(k))); };
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args, sql)) || null; }, async all() { return { results: st().all(vals(args, sql)) }; }, async run() { const r = st().run(vals(args, sql)); return { meta: { changes: r.changes } }; } }; };
const R2 = new Map();
const MEDIA = {
  async put(key, body) { const buf = Buffer.from(await new Response(body).arrayBuffer()); R2.set(key, buf); return { size: buf.length }; },
  async get(key, opts) {
    const buf = R2.get(key); if (!buf) return null;
    if (opts && opts.range) { const m = /bytes=(\d+)-(\d*)/.exec(opts.range.get('Range') || ''); const off = +m[1], end = m[2] ? +m[2] : buf.length - 1; return { body: buf.subarray(off, end + 1), size: buf.length, range: { offset: off, length: end - off + 1 } }; }
    return { body: buf, size: buf.length };
  },
  async delete(key) { R2.delete(key); },
};
const env = { DB: { prepare: stmt, async batch(list) { for (const s of list) await s.run(); } }, MEDIA, SESSION_SECRET: 'sek', ANTHROPIC_API_KEY: 'k' };
db.exec(`CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)`);
db.exec(`CREATE TABLE p_br_batch (id TEXT PRIMARY KEY, act_id TEXT, num TEXT, title TEXT, stage TEXT, asana_gid TEXT, asana_url TEXT, asana_section TEXT, brief_url TEXT, asset_url TEXT, brief_text TEXT, verdict TEXT, asana_result TEXT, assignee_gid TEXT, source TEXT, created_at TEXT, updated_at TEXT)`);
db.exec(`CREATE TABLE p_br_doc (act_id TEXT, line_id TEXT, key TEXT, data_json TEXT)`);
db.prepare(`INSERT INTO p_br_doc VALUES ('brand_alpha', '', 'asana', ?)`).run(JSON.stringify({ project_gid: 'P1' }));
const add = (id, act, num, title, stage, section, gid) => db.exec(`INSERT INTO p_br_batch (id, act_id, num, title, stage, asana_section, asana_gid, asana_url, created_at, updated_at) VALUES ('${id}', '${act}', '${num}', '${title}', '${stage}', '${section}', ${gid ? `'${gid}'` : 'NULL'}, ${gid ? `'https://app.asana.com/0/P1/${gid}'` : 'NULL'}, '2026-10-01', '2026-10-12')`);
add('c1', 'brand_alpha', '48', 'Cold hands, warm grip', 'idea', 'Creative Briefs', 'T1');
add('c2', 'brand_alpha', '45', 'Three reasons to switch', 'production', 'Creative Studio', 'T2');
add('c3', 'brand_beta', '7', 'Beta socks hero', 'production', 'Creative Studio', null);
db.exec(`UPDATE p_br_batch SET brief_text = 'Angle: old angle
What we''re testing: old test
Why: old why
1. first ad line
2. second ad line
Headline: Old headline
Primary text: Old copy
Inspo: https://example.com/ref' WHERE id = 'c2'`);

const BRANDS = [{ act_id: 'brand_alpha', name: 'Alpha Golf', slack_channel: 'C_ALPHA' }, { act_id: 'brand_beta', name: 'Beta Socks', slack_channel: 'C_BETA' }];
let asanaCalls = [], slack = [], posts = [];
const sections = [{ gid: 'S1', name: 'Creative Briefs' }, { gid: 'S2', name: 'Creative Studio' }, { gid: 'S3', name: 'Ready to Launch' }, { gid: 'S4', name: 'Analyze Results' }];
const d = {
  listBrands: async () => BRANDS, centralDate: () => '2026-10-14',
  asana: async (e, path, init) => { asanaCalls.push({ path, init }); if (path.includes('/sections?')) return sections; if (path.includes('/stories')) return { gid: 'ST' + asanaCalls.length }; if (init && init.method === 'PUT' && path.startsWith('/tasks/')) return { gid: 'T', notes: 'ASANA PLAIN ' + (init.body.html_notes || '').replace(/<[^>]+>/g, '') }; return {}; },
  slackApi: async (e, method, args) => { slack.push({ method, args }); if (method === 'users.lookupByEmail') return { ok: true, user: { id: 'U_' + args.email.split('@')[0].toUpperCase() } }; if (method === 'users.info') return { ok: true, user: { profile: { image_192: 'https://slack/p/' + args.user } } }; return { ok: true }; },
  slackPost: async (e, ch, text) => { posts.push({ ch, text }); return { ok: true }; },
  isAdmin: async req => !!req.headers.get('authorization'),
  sessionEmail: async (e, req) => req.headers.get('x-email') || 'ahsan@go-mobius-digital.com',
  clientScope: req => req.headers.get('x-client') ? { email: 'nick@alpha.com', name: 'Nick', ids: new Set(['brand_alpha']) } : null,
};
const dd = { ...d, moveCard, formatOf, origin: 'https://ah.test' };
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
const call = async (path, { method = 'GET', body, client, raw, type, email } = {}) => {
  const h = new Headers({ authorization: 'Bearer x' }); if (client) h.set('x-client', '1'); if (email) h.set('x-email', email);
  if (type) h.set('content-type', type);
  const url = new URL('https://ah.test' + path);
  const req = new Request(url, { method, headers: h, ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) });
  const r = await handleProduction(req, env, url, url.pathname, json, d);
  return r && { status: r.status, body: await r.json() };
};
let n = 0, bad = 0;
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', e.stack.split('\n').slice(0, 3).join('\n    ')); } };

await check('brief fields round trip to brief_text and back (Video: hooks + script table; Iteration; Resize)', async () => {
  const b = normBrief({ kind: 'new', format: 'Video', angle: 'Cold hands, not bad swings.', why: 'Hands-in-frame beat product-only 2 to 1.', concept: 'Red knuckles, then the glove.', testing: 'If we show the cold first, then CTR beats glove-only.',
    hooks: ['Cold hands = bad golf?', 'POV: 38 degrees at 7am'], rows: [{ vo: 'Cold hands = bad golf?', text: 'COLD HANDS?', shot: 'Breath in the air', sec: '2' }, { vo: 'Your swing is fine.', shot: 'Frosty grip', sec: '3', insp: [{ type: 'link', url: 'https://www.tiktok.com/@a/video/1' }] }],
    length: '15s', copy: 'Warm hands.\nSame feel.', sizes: ['9:16', '4:5', 'bogus'] });
  assert.deepEqual(b.sizes, ['9:16', '4:5'], 'unknown sizes dropped');
  const t = briefText(b);
  assert.match(t, /^Kind: New idea · Format: Video/); assert.match(t, /Hook A: Cold hands = bad golf\?/); assert.match(t, /1\. VO: Cold hands = bad golf\? \| On screen: COLD HANDS\? \| Shot: Breath in the air \| 2s/);
  assert.ok(!t.includes(String.fromCharCode(8212)), 'no em dashes');
  const back = fieldsFromText(t);
  for (const k of ['kind', 'format', 'angle', 'why', 'concept', 'testing', 'length']) assert.equal(back[k], b[k], k);
  assert.deepEqual(back.hooks.filter(Boolean), b.hooks);
  assert.equal(back.rows.length, 2); assert.equal(back.rows[0].text, 'COLD HANDS?'); assert.equal(back.rows[1].sec, '3'); assert.equal(back.rows[1].insp[0].url, 'https://www.tiktok.com/@a/video/1');
  const it = fieldsFromText(briefText({ kind: 'iter', format: 'Static', iter: { of: '43', change: 'Hook', value: 'It got cold.' } }));
  assert.equal(it.kind, 'iter'); assert.deepEqual(it.iter, { of: '43', change: 'Hook', value: 'It got cold.' });
  const rz = fieldsFromText(briefText({ kind: 'resize', format: 'Static', resize: { of: '44', note: 'Logo out of the bottom 20%.' }, sizes: ['9:16'] }));
  assert.equal(rz.kind, 'resize'); assert.equal(rz.resize.of, '44'); assert.equal(rz.resize.note, 'Logo out of the bottom 20%.'); assert.deepEqual(rz.sizes, ['9:16']);
  const html = briefHtml(b, 'https://x/?card=1');
  assert.match(html, /^<body><em>Written in Locus/); assert.match(html, /<strong>Angle:<\/strong> Cold hands/); assert.match(html, /<a href="https:\/\/www.tiktok.com\/@a\/video\/1">/);
});

await check('an old Asana brief is read into fields once; what no label claims lands in Other notes', async () => {
  const f = fieldsFromText(`<em>ignored</em>\nAngle: Winter hands\nWhat we're testing: Hooks\nWhy: Searches doubled\n1. Line one\n2. Line two\nHeadline: Warm grip\nPrimary text: Shop now\nOffer: 20% off\nInspo: https://a.com/x https://b.com/y\nSomething odd`, { format: 'Static' });
  assert.equal(f.angle, 'Winter hands'); assert.equal(f.testing, 'Hooks'); assert.equal(f.why, 'Searches doubled'); assert.equal(f.headline, 'Warm grip'); assert.equal(f.copy, 'Shop now');
  assert.deepEqual(f.rows.map(r => r.headline), ['Line one', 'Line two']); assert.equal(f.insp.length, 2);
  assert.match(f.notes, /Offer: 20% off/); assert.match(f.notes, /Something odd/);
  const card = await getCard(env, dd, 'https://ah.test', 'c2', null);
  assert.equal(card.brief_from, 'asana'); assert.equal(card.brief.angle, 'old angle'); assert.equal(card.card.brand, 'Alpha Golf'); assert.equal(card.mirror, true);
  assert.ok(card.team.includes('William'));
});

await check('AI fill only fills EMPTY fields and marks them; a typed field is never overwritten', async () => {
  const typed = { kind: 'new', format: 'Static', angle: 'TYPED ANGLE', why: '', headline: 'TYPED HEADLINE' };
  const out = { angle: 'AI ANGLE', why: 'AI why ' + String.fromCharCode(8212) + ' with a dash', concept: 'AI concept', testing: 'If we, then', headline: 'AI HEADLINE', subhead: 'AI sub', cta: 'Shop', layout: 'Split', hooks: ['x'], length: '', music: '', creator: '', dos: '', donts: '', endcta: '', rows: [{ headline: 'row', visual: 'v', vo: '', text: '', shot: '', sec: '', show: '', say: '' }], copy: 'AI copy' };
  const r = mergeAi(typed, out);
  assert.equal(r.brief.angle, 'TYPED ANGLE'); assert.equal(r.brief.headline, 'TYPED HEADLINE');
  assert.equal(r.brief.concept, 'AI concept'); assert.equal(r.brief.why, 'AI why, with a dash', 'em dash replaced');
  assert.ok(!r.filled.includes('angle') && !r.filled.includes('headline')); assert.ok(r.filled.includes('concept') && r.filled.includes('copy'));
  assert.deepEqual(r.brief.ai.sort(), r.filled.sort()); assert.equal(r.brief.rows, undefined, 'Static rows are not AI-filled');
  /* End to end with the model mocked: it is told only the empty fields. */
  let sent = null;
  const dx = { ...dd, xfetch: async (u, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(out) }] }), { status: 200 }); } };
  const e2e = await aiFill(env, dx, { act_id: 'brand_alpha', num: '48', title: 'Cold hands', brand: 'Alpha Golf' }, typed);
  assert.match(sent.system, /Fill ONLY these fields: why, concept, testing, subhead, cta, layout, copy/); assert.equal(sent.model, 'claude-sonnet-5-5');
  assert.equal(e2e.brief.angle, 'TYPED ANGLE'); assert.equal(e2e.brief.subhead, 'AI sub');
  const full = await aiFill(env, dx, { act_id: 'brand_alpha' }, { ...typed, why: 'w', concept: 'c', testing: 't', subhead: 's', cta: 'c', layout: 'l', copy: 'c' });
  assert.deepEqual(full.filled, [], 'nothing empty = no call result');
});

await check('save: brief_json + brief_text stored, the Asana task gets the brief (mirror on) and the hash of what Asana kept', async () => {
  asanaCalls = [];
  const brief = { kind: 'new', format: 'Static', angle: 'Winter hands', headline: 'Warm grip', insp: [{ type: 'file', id: 'abcdefabcdefabcd', name: 'ref.jpg' }] };
  const r = await saveCard(env, dd, { id: 'c1', title: 'Cold hands v2', owner: 'William', due: '2026-10-16', launch_on: '2026-10-20', brief }, 'ahsan@go-mobius-digital.com');
  assert.equal(r.asana.written, true);
  const put = asanaCalls.find(c => c.path.startsWith('/tasks/T1'));
  assert.match(put.init.body.html_notes, /<strong>Angle:<\/strong> Winter hands/); assert.equal(put.init.body.name, '48 - Cold hands v2'); assert.equal(put.init.body.due_on, '2026-10-16');
  const row = db.prepare(`SELECT brief_json, brief_text, brief_hash, title, assignee_name, due_on, launch_on FROM p_br_batch WHERE id = 'c1'`).get();
  assert.equal(JSON.parse(row.brief_json).angle, 'Winter hands'); assert.match(row.brief_text, /Angle: Winter hands/); assert.match(row.brief_text, /Inspiration: ref\.jpg \(uploaded in Locus\)/);
  assert.ok(row.brief_hash && row.brief_hash.length === 24); assert.equal(row.title, 'Cold hands v2'); assert.equal(row.assignee_name, 'William'); assert.equal(row.launch_on, '2026-10-20');
  const c = await getCard(env, dd, 'https://ah.test', 'c1', null);
  assert.equal(c.brief_from, 'locus'); assert.equal(c.brief.insp[0].name, 'ref.jpg');
});

await check('comments: @William gets a Slack DM with the card link (never a channel post); the mirror copies it to Asana', async () => {
  slack = []; asanaCalls = []; posts = [];
  const r = await addComment(env, dd, { id: 'c1', body: '@William can the glove be on the left?' }, 'ahsan@go-mobius-digital.com', null);
  assert.deepEqual(r.mentions, [{ name: 'William', sent: true }]);
  const dmMsg = slack.find(s => s.method === 'chat.postMessage');
  assert.equal(dmMsg.args.channel, 'U_WILLIAM'); assert.match(dmMsg.args.text, /Ahsan mentioned you on #48 "Cold hands v2"/); assert.match(dmMsg.args.text, /open=production&card=c1/);
  assert.equal(posts.length, 0, 'no channel post for a team comment');
  const story = asanaCalls.find(c => c.path === '/tasks/T1/stories');
  assert.equal(story.init.body.text, 'From Locus, Ahsan: @William can the glove be on the left?'); assert.equal(r.asana, true);
  await assert.rejects(addComment(env, dd, { id: 'c1', body: '  ' }, 'x', null), e => e.status === 400);
});

await check('upload a version: R2, version numbers, the card moves to Review, the signed link serves it (and a range), a bad link 403', async () => {
  const up = await call('/api/production/upload?id=c2&name=dg45 v1.png', { method: 'POST', raw: Buffer.from('PNGDATA-ONE'), type: 'image/png' });
  assert.equal(up.status, 200); assert.equal(up.body.file.version, 1); assert.equal(up.body.moved, 'review');
  const up2 = await call('/api/production/upload?id=c2&name=dg45 v2.png', { method: 'POST', raw: Buffer.from('PNGDATA-TWO'), type: 'image/png' });
  assert.equal(up2.body.file.version, 2);
  assert.equal(db.prepare(`SELECT board_stage FROM p_br_batch WHERE id = 'c2'`).get().board_stage, 'review');
  const bad = await call('/api/production/upload?id=c2&name=x.pdf', { method: 'POST', raw: Buffer.from('x'), type: 'application/pdf' });
  assert.equal(bad.status, 400);
  const u = new URL(up2.body.file.url);
  const res = await serveFile(new Request(u), env, u, u.pathname.split('/').pop());
  assert.equal(res.status, 200); assert.equal(await res.text(), 'PNGDATA-TWO'); assert.equal(res.headers.get('content-type'), 'image/png');
  const rr = await serveFile(new Request(u, { headers: { Range: 'bytes=0-6' } }), env, u, u.pathname.split('/').pop());
  assert.equal(rr.status, 206); assert.equal(await rr.text(), 'PNGDATA'); assert.equal(rr.headers.get('content-range'), 'bytes 0-6/11');
  u.searchParams.set('s', 'forged'); assert.equal((await serveFile(new Request(u), env, u, u.pathname.split('/').pop())).status, 403);
  const card = await getCard(env, dd, 'https://ah.test', 'c2', null);
  assert.deepEqual(card.files.filter(f => f.kind === 'version').map(f => f.version), [1, 2]);
  /* The board carries the newest picture and the open notes. */
  const b = (await call('/api/production?act=brand_alpha')).body;
  const c2 = b.cards.find(c => c.id === 'c2'); assert.equal(c2.versions, 2); assert.ok(c2.thumb.includes('/api/production/f/'));
});

await check('a note on a version keeps its drawing (0..1) and its second; fixed / unfixed', async () => {
  assert.equal(normShape({ tool: 'box', x: 0.1, y: 1.5, w: 0.2, h: -1, color: 'purple' }).y, 1); assert.equal(normShape({ tool: 'box', x: 0.1, y: 0.1, w: 0.2, h: 0.3, color: 'purple' }).color, 'coral');
  assert.equal(normShape({ tool: 'laser' }), null); assert.equal(normShape({ tool: 'pen', pts: [[0, 0]] }), null);
  const f = db.prepare(`SELECT id FROM p_work_file WHERE batch_id = 'c2' AND version = 2`).get();
  const r = await call('/api/production/comment', { method: 'POST', body: { id: 'c2', file_id: f.id, body: 'Logo bigger here', shape: { tool: 'box', x: 0.5, y: 0.7, w: 0.3, h: 0.1, color: 'yellow' }, at: 4.27 } });
  assert.equal(r.status, 200);
  const nt = (await getCard(env, dd, 'https://ah.test', 'c2', null)).comments.find(c => c.body === 'Logo bigger here');
  assert.equal(nt.kind, 'note'); assert.equal(nt.at, 4.3); assert.deepEqual(nt.shape, { tool: 'box', color: 'yellow', x: 0.5, y: 0.7, w: 0.3, h: 0.1 });
  const bad = await call('/api/production/comment', { method: 'POST', body: { id: 'c2', file_id: 'zzzzzzzzzzzzzzzz', body: 'x' } }); assert.equal(bad.status, 400);
  await call('/api/production/fixed', { method: 'POST', body: { comment_id: nt.id } });
  assert.equal((await getCard(env, dd, 'https://ah.test', 'c2', null)).comments.find(c => c.id === nt.id).fixed, true);
});

await check('ask for changes needs a note, moves the card back to Making and DMs the maker; approve moves it to Ready and records who', async () => {
  db.exec(`UPDATE p_br_batch SET assignee_name = 'William' WHERE id = 'c2'`);
  const none = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: false } }); assert.equal(none.status, 400); assert.equal(none.body.error, 'Say what needs to change.');
  slack = []; asanaCalls = [];
  const ch = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: false, body: 'Headline under the Reels caption.' }, email: 'cole@go-mobius-digital.com' });
  assert.equal(ch.status, 200); assert.equal(ch.body.moved, 'making');
  assert.ok(asanaCalls.some(c => c.path === '/sections/S2/addTask'), 'Asana followed to Creative Studio');
  const dm = slack.filter(s => s.method === 'chat.postMessage').pop(); assert.equal(dm.args.channel, 'U_WILLIAM'); assert.match(dm.args.text, /Cole asked for changes on #45/);
  const cr = (await getCard(env, dd, 'https://ah.test', 'c2', null)).comments.find(c => c.kind === 'change_request'); assert.equal(cr.kind, 'change_request'); assert.ok(cr.file_id, 'tied to the newest version');
  const ok = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: true }, email: 'cole@go-mobius-digital.com' });
  assert.equal(ok.body.moved, 'ready');
  const row = db.prepare(`SELECT board_stage, approved_by FROM p_br_batch WHERE id = 'c2'`).get(); assert.equal(row.board_stage, 'ready'); assert.equal(row.approved_by, 'cole@go-mobius-digital.com');
  assert.match((await getCard(env, dd, 'https://ah.test', 'c2', null)).comments.find(c => c.kind === 'approval').body, /^Approved v2\./);
});

await check('the client: its own brand only, Needs you + Coming up (never the board), team names as Mobius, no Asana; no drag / new brief / upload / save', async () => {
  assert.equal((await call('/api/production/send', { method: 'POST', body: { id: 'c3', what: 'ad' } })).status, 400, 'no file yet');
  await call('/api/production/upload?id=c2&name=v3.png', { method: 'POST', raw: Buffer.from('V3'), type: 'image/png' });
  const s = await call('/api/production/send', { method: 'POST', body: { id: 'c2', what: 'ad' } }); assert.equal(s.body.needs_client, 'ad'); assert.equal(s.body.client_due, '2026-10-19', '3 business days (Wed + 3 = Mon)');
  await call('/api/production/send', { method: 'POST', body: { id: 'c1', what: 'idea' } });
  const board = await call('/api/production?act=brand_alpha', { client: true });
  assert.equal(board.status, 200); assert.equal(board.body.client, true); assert.equal(board.body.cards, undefined, 'never the team board');
  assert.deepEqual(board.body.needs.map(x => [x.id, x.what]).sort(), [['c1', 'idea'], ['c2', 'ad']]);
  assert.ok(board.body.needs.find(x => x.id === 'c2').thumb, 'a picture of the ad');
  const card = await call('/api/production/card?id=c2', { client: true });
  assert.equal(card.body.card.owner, 'Mobius'); assert.equal(card.body.card.asana_url, null); assert.ok(card.body.comments.every(c => c.who === 'Mobius' || c.role === 'client'));
  assert.equal(card.body.team.length, 0); assert.equal(card.body.mirror, null);
  assert.equal((await call('/api/production/card?id=c3', { client: true })).status, 403, 'another brand');
  for (const [p, body] of [['/api/production/move', { id: 'c2', to: 'live' }], ['/api/production/brief', { act: 'brand_alpha', text: 'x' }], ['/api/production/save', { id: 'c2' }], ['/api/production/send', { id: 'c2', what: '' }], ['/api/production/fixed', { comment_id: 'x' }], ['/api/production/share', { id: 'c2' }], ['/api/production/mirror', { on: false }]])
    assert.equal((await call(p, { method: p.endsWith('mirror') ? 'PUT' : 'POST', body, client: true })).status, 403, p);
  assert.equal((await call('/api/production/upload?id=c2&name=x.png', { method: 'POST', raw: Buffer.from('x'), type: 'image/png', client: true })).status, 403);
  assert.equal((await call('/api/production', { client: true })).status, 403, 'no brand');
  /* The client comments: one line in the brand's INTERNAL channel; then decides. */
  posts = [];
  const cm = await call('/api/production/comment', { method: 'POST', body: { id: 'c2', body: 'Love slide 3' }, client: true, email: 'nick@alpha.com' });
  assert.equal(cm.body.slack, true); assert.equal(posts[0].ch, 'C_ALPHA'); assert.match(posts[0].text, /Nick \(client\) on #45/);
  const ok = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: true }, client: true, email: 'nick@alpha.com' });
  assert.equal(ok.status, 200); assert.equal(db.prepare(`SELECT needs_client FROM p_br_batch WHERE id = 'c2'`).get().needs_client, null);
  const again = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: true }, client: true }); assert.equal(again.status, 403, 'nothing waiting any more');
  const idea = await call('/api/production/decide', { method: 'POST', body: { id: 'c1', ok: true }, client: true });
  assert.equal(idea.body.moved, null, 'an approved idea stays in Brief');
});

await check('the review link: no login, needs a name, notes and a decision when the card waits for the client', async () => {
  const sh = await shareLink(env, { id: 'c2' }); const t = sh.url.split('t=')[1];
  assert.match(t, /^[a-f0-9]{32}$/); assert.equal((await shareLink(env, { id: 'c2' })).url, sh.url, 'one link per card');
  const rq = (path, method = 'GET', body) => { const url = new URL('https://ah.test' + path); return handleReviewLink(new Request(url, { method, ...(body ? { body: JSON.stringify(body) } : {}) }), env, url, url.pathname, json, dd).then(async r => r && { status: r.status, body: await r.json() }); };
  const g = await rq(`/api/review/${t}`); assert.equal(g.status, 200); assert.ok(g.body.files.length >= 3); assert.equal(g.body.card.asana_url, null);
  assert.equal((await rq(`/api/review/${'0'.repeat(32)}`)).status, 404);
  assert.equal((await rq(`/api/review/${t}/note`, 'POST', { body: 'hi' })).status, 400, 'no name');
  assert.equal((await rq(`/api/review/${t}/note`, 'POST', { name: 'Mike', body: 'Text too small' })).status, 200);
  assert.equal((await rq(`/api/review/${t}/decide`, 'POST', { name: 'Mike', ok: true })).status, 403, 'not waiting');
  await sendToClient(env, dd, { id: 'c2', what: 'ad' }, 'ahsan@go-mobius-digital.com');
  const dec = await rq(`/api/review/${t}/decide`, 'POST', { name: 'Mike', ok: false, body: 'Say magnetic.' });
  assert.equal(dec.status, 200); assert.equal(db.prepare(`SELECT board_stage FROM p_br_batch WHERE id = 'c2'`).get().board_stage, 'making');
});

await check('the Asana mirror switch: off stops every Asana write (move, save, comment) and a new brief is made in Locus only', async () => {
  await setMirror(env, false, 'cole@go-mobius-digital.com'); assert.equal(await mirrorOn(env), false);
  asanaCalls = [];
  const m = await moveCard(env, dd, { id: 'c1', to: 'making' }, 'x'); assert.equal(m.asana.why, 'The Asana mirror is off.');
  const s = await saveCard(env, dd, { id: 'c1', brief: { angle: 'x' } }, 'x'); assert.equal(s.asana.written, false);
  const c = await addComment(env, dd, { id: 'c1', body: 'no story please' }, 'ahsan@go-mobius-digital.com', null); assert.equal(c.asana, false);
  const b = await call('/api/production/brief', { method: 'POST', body: { act: 'brand_alpha', text: 'Belt as a gift', owner: 'Ravo' } });
  assert.equal(b.body.local, true); assert.equal(b.body.num, 49);
  assert.equal(asanaCalls.length, 0, 'not one Asana call');
  const st = (await call('/api/production/mirror')).body; assert.equal(st.on, false); assert.equal(st.changed_by, 'Cole');
  await setMirror(env, true, 'cole@go-mobius-digital.com');
});

await check('prune: 60 days after Live only the final version stays; photos: Google first, Slack after', async () => {
  db.exec(`UPDATE p_br_batch SET board_stage = 'live', board_at = '2026-07-01 10:00:00' WHERE id = 'c2'`);
  const before = db.prepare(`SELECT COUNT(*) AS n FROM p_work_file WHERE batch_id = 'c2' AND deleted_at IS NULL AND kind = 'version'`).get().n;
  const pruned = await pruneFiles(env);
  assert.equal(pruned, before - 1);
  const left = db.prepare(`SELECT version FROM p_work_file WHERE batch_id = 'c2' AND deleted_at IS NULL AND kind = 'version'`).all();
  assert.deepEqual(left.map(r => r.version), [3]);
  await savePhoto(env, 'cole@go-mobius-digital.com', 'https://lh3.googleusercontent.com/a/cole');
  await savePhoto(env, 'x@y.com', 'javascript:alert(1)');
  slack = [];
  const p = await teamPhotos(env, d);
  assert.equal(p.Cole, 'https://lh3.googleusercontent.com/a/cole'); assert.equal(p.Ahsan, 'https://slack/p/U_AHSAN');
  const calls = slack.length; await teamPhotos(env, d); assert.equal(slack.length, calls, 'Slack photos cached for a week');
});

console.log(`\n${n} passed, ${bad} failed`);
if (bad) process.exit(1);
