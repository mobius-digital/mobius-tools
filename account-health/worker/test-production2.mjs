/* Offline checks for PRODUCTION V2 (2026-10-14, src/prodwork.js + the routes in src/production.js): the brief is one
 * written page (sanitizer, text, Asana html both ways, templates, old briefs read as a page), AI fill keeps every typed
 * sentence, comments and @mentions (Slack DM mocked), notes with drawings, uploads to R2 with versions PER AD (from the
 * file name) and in parts (R2 multipart mocked), the signed file link, approve / ask for changes moving the card and
 * telling the maker, the client's scope (own brand only, no drag / new brief / upload), the review link with no login,
 * the Asana mirror switch stopping every Asana write, and the 60-day prune per ad. In-memory SQLite, R2 a Map.
 *   node test-production2.mjs      (from account-health/worker) */
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { handleProduction, moveCard, formatOf } from './src/production.js';
import { briefText, normBrief, aiFill, saveCard, addComment, decide, getCard, uploadFile, sendToClient, serveFile, handleReviewLink, shareLink,
  pruneFiles, setMirror, mirrorOn, normShape, briefHtml, savePhoto, teamPhotos, sanitizeHtml, htmlToText, textToHtml, asanaToHtml, templateHtml, briefFromAsana, adOf, fillSrc } from './src/prodwork.js';

const db = new DatabaseSync(':memory:');
const bindSql = sql => { let hi = 0; return sql.replace(/\?(\d*)/g, (_, n) => { if (n) { hi = Math.max(hi, +n); return ':p' + n; } hi++; return ':p' + hi; }); };
const vals = (a, sql) => { const used = new Set([...bindSql(sql).matchAll(/:p(\d+)/g)].map(m => 'p' + m[1])); return Object.fromEntries(a.map((v, i) => ['p' + (i + 1), v === undefined ? null : typeof v === 'boolean' ? +v : v]).filter(([k]) => used.has(k))); };
const stmt = sql => { let args = []; const st = () => db.prepare(bindSql(sql)); return { bind(...a) { args = a; return this; }, async first() { return st().get(vals(args, sql)) || null; }, async all() { return { results: st().all(vals(args, sql)) }; }, async run() { const r = st().run(vals(args, sql)); return { meta: { changes: r.changes } }; } }; };
const R2 = new Map();
const MP = new Map();   // multipart uploads in flight: key -> {parts: Map}
const MEDIA = {
  async put(key, body) { const buf = Buffer.from(await new Response(body).arrayBuffer()); R2.set(key, buf); return { size: buf.length }; },
  async get(key, opts) {
    const buf = R2.get(key); if (!buf) return null;
    if (opts && opts.range) { const m = /bytes=(\d+)-(\d*)/.exec(opts.range.get('Range') || ''); const off = +m[1], end = m[2] ? +m[2] : buf.length - 1; return { body: buf.subarray(off, end + 1), size: buf.length, range: { offset: off, length: end - off + 1 } }; }
    return { body: buf, size: buf.length };
  },
  async delete(key) { R2.delete(key); },
  async createMultipartUpload(key) { const uploadId = 'mp' + (MP.size + 1); MP.set(key + '|' + uploadId, new Map()); return { key, uploadId }; },
  resumeMultipartUpload(key, uploadId) {
    const parts = MP.get(key + '|' + uploadId);
    return {
      async uploadPart(n, body) { if (!parts) throw new Error('no such upload'); const buf = Buffer.from(await new Response(body).arrayBuffer()); parts.set(n, buf); return { partNumber: n, etag: 'e' + n + '-' + buf.length }; },
      async complete(list) { if (!parts) throw new Error('no such upload'); for (const p of list) if (!parts.has(p.partNumber) || !p.etag.startsWith('e' + p.partNumber)) throw new Error('bad part'); const buf = Buffer.concat(list.map(p => parts.get(p.partNumber))); R2.set(key, buf); MP.delete(key + '|' + uploadId); return { size: buf.length }; },
    };
  },
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
const ASANA_T2 = `<body><h2>The test</h2><strong>Angle:</strong> Winter hands\n<strong>What we're testing:</strong> 3 hooks on 45-1\n<em>What changes, and on which ad. Like: 3 new concepts</em>\n<strong>Why:</strong> Searches doubled\n<ol><li>45-1 red knuckles then the glove</li><li>45-2 the frosty grip</li></ol>\n<h2>Copy</h2><strong>Headline:</strong> Warm grip\n<strong>Inspo:</strong> <a href="https://a.com/x">https://a.com/x</a></body>`;
const sections = [{ gid: 'S1', name: 'Creative Briefs' }, { gid: 'S2', name: 'Creative Studio' }, { gid: 'S3', name: 'Ready to Launch' }, { gid: 'S4', name: 'Analyze Results' }];
const d = {
  listBrands: async () => BRANDS, centralDate: () => '2026-10-14',
  asana: async (e, path, init) => {
    asanaCalls.push({ path, init });
    if (path.includes('/sections?')) return sections;
    if (path.includes('/stories')) return { gid: 'ST' + asanaCalls.length };
    if (init && init.method === 'PUT' && path.startsWith('/tasks/')) return { gid: 'T', notes: 'ASANA PLAIN ' + (init.body.html_notes || '').replace(/<[^>]+>/g, '') };
    if (path.startsWith('/tasks/T2?')) return { gid: 'T2', html_notes: ASANA_T2, notes: ASANA_T2.replace(/<[^>]+>/g, '') };
    if (path.startsWith('/tasks/T1?')) return { gid: 'T1', html_notes: '<body></body>', notes: '' };
    return {};
  },
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
const check = async (name, fn) => { try { await fn(); n++; console.log('PASS ', name); } catch (e) { bad++; console.log('FAIL ', name, '\n   ', String(e.message).slice(0, 1600), '\n   ', (e.stack.split('\n').find(l => /test-production2/.test(l)) || '')); } };

await check('the page: the sanitizer keeps the allowed tags only, closes what is open, drops scripts and styles, keeps data-file and hints', async () => {
  const h = sanitizeHtml(`<div><b>Angle:</b> Cold <script>alert(1)</script>hands <span style="color:red" onclick="x()">plain</span> <span data-ph>a hint</span><img src="data:image/png;base64,xx" onerror="x()"><img data-file="abcdefabcdefabcd" src="https://signed/x"><a href="javascript:alert(1)">bad</a> <a href="https://a.com/x" target="_blank">ok</a><ul><li>one<li>two</ul><p>unclosed <em>em`);
  assert.equal(h, `<p><strong>Angle</strong></p><p>Cold hands plain <span data-ph>a hint</span><img data-file="abcdefabcdefabcd">bad <a href="https://a.com/x">ok</a></p><ul><li>one</li><li>two</li></ul><p>unclosed <em>em</em></p>`);
  assert.equal(sanitizeHtml('a < b & c &amp; d'), 'a &lt; b &amp; c &amp; d');
  assert.equal(htmlToText('<h2>The test</h2><p><strong>Angle:</strong> Cold hands</p><p><span data-ph>a hint</span></p><ol><li>first</li><li>second</li></ol><p>x<br>y</p>'), 'The test\nAngle: Cold hands\n\n1. first\n2. second\nx\ny');
  const t = textToHtml(`The test\nAngle: Winter hands\n1. Line one\n2. Line two\n- a bullet\nInspo: https://a.com/x https://b.com/y\nSomething odd`);
  assert.equal(t, `<h2>The test</h2><p><strong>Angle</strong></p><p>Winter hands</p><ol><li>Line one</li><li>Line two</li></ol><ul><li>a bullet</li></ul><p><strong>Inspo</strong></p><p><a href="https://a.com/x">https://a.com/x</a> <a href="https://b.com/y">https://b.com/y</a></p><p>Something odd</p>`);
  const tpl = templateHtml('new', 'Static', '48');
  assert.match(tpl, /<h2>The test<\/h2><p><strong>Angle<\/strong><\/p><p><span data-ph>The argument this ad makes<\/span><\/p>/); assert.match(tpl, /<p><strong>Ad 48-1<\/strong><\/p><p><span data-ph>/); assert.match(tpl, /<h2>Copy<\/h2>/);
  assert.match(templateHtml('new', 'Video', '48'), /<h2>Video<\/h2>/); assert.match(templateHtml('iter', 'Static', '48'), /Iterating on/); assert.equal(templateHtml('blank'), '<p><br></p>');
  assert.equal(fillSrc('<p><img data-file="abcdefabcdefabcd"> and <a href="https://a.com">x</a></p>', { abcdefabcdefabcd: { url: 'https://s/x?e=1' } }), '<p><img data-file="abcdefabcdefabcd" src="https://s/x?e=1"> and <a target="_blank" rel="noopener" href="https://a.com">x</a></p>');
  const b = normBrief({ v: 2, html: '<p><strong>Angle:</strong> x</p>', format: 'UGC', sizes: ['9:16', 'bogus', '9:16'] });
  assert.deepEqual(b, { v: 2, html: '<p><strong>Angle</strong></p><p>x</p>', format: 'UGC', sizes: ['9:16'] });
  assert.equal(briefText(b), 'Format: UGC · Sizes: 9:16\nAngle\nx');
});

await check('Asana both ways: html_notes becomes a page (hint kept as a hint), the page goes back as Asana tags only, valid XML, pictures as a link', async () => {
  const page = asanaToHtml(ASANA_T2);
  assert.equal(page, `<h2>The test</h2><p><strong>Angle</strong></p><p>Winter hands</p><p><strong>What we're testing</strong></p><p>3 hooks on 45-1</p><p><span data-ph>What changes, and on which ad. Like: 3 new concepts</span></p><p><strong>Why</strong></p><p>Searches doubled</p><ol><li>45-1 red knuckles then the glove</li><li>45-2 the frosty grip</li></ol><h2>Copy</h2><p><strong>Headline</strong></p><p>Warm grip</p><p><strong>Inspo</strong></p><p><a href="https://a.com/x">https://a.com/x</a></p>`);
  const back = briefHtml({ v: 2, html: page + '<p>Tom &amp; Jerry&nbsp;<img data-file="abcdefabcdefabcd"></p><h3>Launch</h3><p>Nov 3<br>early</p>', format: 'Static', sizes: [] }, 'https://x/?card=1', { abcdefabcdefabcd: { name: 'ref.jpg' } });
  assert.match(back, /^<body><em>Written in Locus/);
  assert.ok(!/<p>|<br>|<span|<img|&nbsp;|<h3>/.test(back), 'only Asana tags: ' + back);
  assert.match(back, /<h2>The test<\/h2>\n<strong>Angle<\/strong>\nWinter hands\n/); assert.ok(!back.includes('What changes, and on which ad'), 'hints left out');
  assert.match(back, /<ol><li>45-1 red knuckles then the glove<\/li><li>45-2 the frosty grip<\/li><\/ol>\n/);
  assert.match(back, /Tom &amp; Jerry <a href="https:\/\/x\/\?card=1">\[ref\.jpg: see it in Locus\]<\/a>\n<strong>Launch<\/strong>\nNov 3\nearly/);
  const synced = briefFromAsana({ v: 2, format: 'Video', sizes: ['9:16'] }, ASANA_T2, '');
  assert.equal(synced.format, 'Video'); assert.deepEqual(synced.sizes, ['9:16']); assert.equal(synced.html, page);
  assert.match(briefFromAsana({}, '', 'Angle: plain only\n1. one').html, /<p><strong>Angle<\/strong><\/p><p>plain only<\/p><ol><li>one<\/li><\/ol>/);
  assert.equal(adOf('45-2 v2.png', '45'), '45-2'); assert.equal(adOf('LG_440-2 final.mov', '440'), '440-2'); assert.equal(adOf('48_3.mp4', '48'), '48-3'); assert.equal(adOf('hero final.png', '48'), ''); assert.equal(adOf('1080x1350 45-1.png', '45'), '45-1');
});

await check('first open of an old card: the Asana page comes in as the page (mirror on); a card with nothing in Asana uses its text; a blank card gets the starting pages', async () => {
  const card = await getCard(env, dd, 'https://ah.test', 'c2', null);
  assert.equal(card.brief_from, 'asana'); assert.equal(card.brief.v, 2); assert.match(card.brief.html, /<strong>Angle<\/strong><\/p><p>Winter hands/); assert.equal(card.brief.blank, false); assert.equal(card.templates, undefined);
  assert.equal(card.card.brand, 'Alpha Golf'); assert.equal(card.mirror, true); assert.ok(card.team.includes('William'));
  const blank = await getCard(env, dd, 'https://ah.test', 'c1', null);
  assert.equal(blank.brief.blank, true); assert.match(blank.templates.new, /<strong>Ad 48-1<\/strong>/); assert.match(blank.templates.iter, /Iteration/); assert.equal(blank.templates.blank, '<p><br></p>');
  const t = (await call('/api/production/template?id=c1&kind=resize')).body; assert.match(t.html, /Resize or cut/);
});

await check('AI fill: the hints get the AI words (marked), a typed sentence is never changed; a page with no hints and words is left alone', async () => {
  const typed = { v: 2, html: '<h2>The test</h2><p><strong>Angle:</strong> TYPED ANGLE that stays exactly as it is</p><p><strong>Why:</strong> <span data-ph>the data</span></p><p><strong>Offer:</strong></p>', format: 'Static', sizes: [] };
  let sent = null;
  const answer = html => ({ ...dd, xfetch: async (u, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ content: [{ type: 'text', text: html }] }), { status: 200 }); } });
  const good = '```html\n<h2>The test</h2><p><strong>Angle:</strong> TYPED ANGLE that stays exactly as it is</p><p><strong>Why:</strong> <span data-ai>Hands-in-frame beat product-only 2 to 1 ' + String.fromCharCode(8212) + ' last winter</span></p><p><strong>Offer:</strong> <span data-ai>Free glove on orders over $100</span></p>\n```';
  const r = await aiFill(env, answer(good), { act_id: 'brand_alpha', num: '48', title: 'Cold hands', brand: 'Alpha Golf' }, typed);
  assert.equal(r.filled, 2); assert.match(r.brief.html, /TYPED ANGLE that stays exactly as it is/); assert.match(r.brief.html, /<span data-ai>Hands-in-frame beat product-only 2 to 1, last winter<\/span>/, 'em dash replaced, mark kept');
  assert.ok(!r.brief.html.includes('data-ph'), 'hints gone'); assert.equal(sent.model, 'claude-sonnet-5-5'); assert.match(sent.messages[0].content, /THE PAGE:\n<h2>The test<\/h2>/); assert.match(sent.system, /Never change, cut or reword a sentence a person wrote/);
  const lossy = '<h2>The test</h2><p><strong>Angle:</strong> A DIFFERENT ANGLE</p><p><strong>Why:</strong> <span data-ai>x</span></p><p><strong>Offer:</strong> <span data-ai>y</span></p>';
  await assert.rejects(aiFill(env, answer(lossy), { act_id: 'brand_alpha' }, typed), e => /changed what someone typed/.test(e.message));
  const full = await aiFill(env, answer(good), { act_id: 'brand_alpha' }, { v: 2, html: '<p><strong>Angle:</strong> everything here is written by a person already, nothing to fill</p>', format: 'Static', sizes: [] });
  assert.equal(full.filled, 0); assert.match(full.why, /Every line already has words/);
  const v1 = await aiFill(env, answer(good), { act_id: 'brand_alpha', num: '48' }, { kind: 'new', format: 'Static' });
  assert.equal(v1.filled, 2, 'an empty v1 brief is read as a page, the AI gets the starting page'); assert.match(sent.messages[0].content, /<strong>Ad 48-1<\/strong>/);
  const v1w = await aiFill(env, answer(good), { act_id: 'brand_alpha', num: '48' }, { kind: 'new', format: 'Static', angle: 'TYPED ANGLE that stays exactly as it is, long enough to count' });
  assert.equal(v1w.filled, 0, 'a v1 brief with words and no empty label is left alone');
});

await check('save: the page is stored with its text, the Asana task gets it (mirror on) and the hash of what Asana kept; a v1 brief converts on read', async () => {
  asanaCalls = [];
  const brief = { v: 2, html: '<h2>The test</h2><p><strong>Angle:</strong> Winter hands</p><ol><li><strong>48-1</strong> red knuckles</li></ol><p><strong>Headline:</strong> Warm grip <span data-ph>leftover hint</span></p>', format: 'Static', sizes: ['4:5'] };
  const r = await saveCard(env, dd, { id: 'c1', title: 'Cold hands v2', owner: 'William', due: '2026-10-16', launch_on: '2026-10-20', brief }, 'ahsan@go-mobius-digital.com');
  assert.equal(r.asana.written, true); assert.equal(r.brief.v, 2);
  const put = asanaCalls.find(c => c.path.startsWith('/tasks/T1') && c.init && c.init.method === 'PUT');
  assert.match(put.init.body.html_notes, /<strong>Angle<\/strong>\nWinter hands\n<ol><li><strong>48-1<\/strong> red knuckles<\/li><\/ol>/); assert.ok(!put.init.body.html_notes.includes('leftover hint')); assert.equal(put.init.body.name, '48 - Cold hands v2'); assert.equal(put.init.body.due_on, '2026-10-16');
  const row = db.prepare(`SELECT brief_json, brief_text, brief_hash, title, assignee_name, due_on, launch_on FROM p_br_batch WHERE id = 'c1'`).get();
  assert.equal(JSON.parse(row.brief_json).v, 2); assert.equal(row.brief_text, 'Format: Static · Sizes: 4:5\nThe test\nAngle\nWinter hands\n1. 48-1 red knuckles\nHeadline\nWarm grip');
  assert.ok(row.brief_hash && row.brief_hash.length === 24); assert.equal(row.title, 'Cold hands v2'); assert.equal(row.assignee_name, 'William'); assert.equal(row.launch_on, '2026-10-20');
  const c = await getCard(env, dd, 'https://ah.test', 'c1', null);
  assert.equal(c.brief_from, 'locus'); assert.equal(c.brief.blank, false); assert.match(c.brief.html, /leftover hint/, 'a hint the writer left stays on the page');
  db.exec(`UPDATE p_br_batch SET brief_json = '${JSON.stringify({ v: 1, kind: 'new', format: 'Video', angle: 'v1 angle', hooks: ['Cold?'], rows: [{ vo: 'say', shot: 'see', sec: '2' }] }).replace(/'/g, "''")}' WHERE id = 'c3'`);
  const v1 = await getCard(env, dd, 'https://ah.test', 'c3', null);
  assert.equal(v1.brief.v, 2); assert.equal(v1.brief.format, 'Video'); assert.match(v1.brief.html, /<p><strong>Angle<\/strong><\/p><p>v1 angle<\/p>/); assert.match(v1.brief.html, /<p><strong>Hook A<\/strong><\/p><p>Cold\?<\/p>/); assert.match(v1.brief.html, /<ol><li>VO: say \| Shot: see \| 2s<\/li><\/ol>/);
  const b = (await call('/api/production?act=brand_beta')).body; assert.equal(b.cards.find(x => x.id === 'c3').format, 'Video', 'the board reads the stored format');
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

await check('uploads: versions count PER AD from the file name, the card moves to Review, a picture for the page is kind inline, the signed link serves it (and a range), a bad link 403', async () => {
  const up = await call('/api/production/upload?id=c2&name=45-1 v1.png', { method: 'POST', raw: Buffer.from('PNGDATA-ONE'), type: 'image/png' });
  assert.equal(up.status, 200); assert.equal(up.body.file.version, 1); assert.equal(up.body.file.ad, '45-1'); assert.equal(up.body.moved, 'review');
  const up2 = await call('/api/production/upload?id=c2&name=45-1 final.png', { method: 'POST', raw: Buffer.from('PNGDATA-TWO'), type: 'image/png' });
  assert.equal(up2.body.file.version, 2, 'same ad: v2');
  const other = await call('/api/production/upload?id=c2&name=45_2.mov', { method: 'POST', raw: Buffer.from('MOV'), type: 'application/octet-stream' });
  assert.equal(other.body.file.version, 1, 'another ad starts at v1'); assert.equal(other.body.file.ad, '45-2'); assert.equal(other.body.file.mime, 'video/quicktime', 'mime from the name when the browser sends none');
  const inl = await call('/api/production/upload?id=c2&kind=inline&name=ref.jpg', { method: 'POST', raw: Buffer.from('JPG'), type: 'image/jpeg' });
  assert.equal(inl.body.file.kind, 'inline'); assert.equal(inl.body.file.version, null); assert.equal(inl.body.moved, null);
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
  assert.deepEqual(card.files.filter(f => f.kind === 'version').map(f => [f.ad, f.version]), [['45-1', 1], ['45-1', 2], ['45-2', 1]]);
  /* the page shows the inline picture with its signed address */
  await saveCard(env, dd, { id: 'c2', brief: { v: 2, html: `<p>look <img data-file="${inl.body.file.id}" src="https://stale/x"></p>`, format: 'Static' } }, 'x');
  const again = await getCard(env, dd, 'https://ah.test', 'c2', null);
  assert.match(again.brief.html, new RegExp(`<img data-file="${inl.body.file.id}" src="https://ah.test/api/production/f/${inl.body.file.id}\\?e=`));
  /* The board carries the newest picture and the open notes. */
  const b = (await call('/api/production?act=brand_alpha')).body;
  const c2 = b.cards.find(c => c.id === 'c2'); assert.equal(c2.versions, 3); assert.ok(c2.thumb.includes('/api/production/f/'));
});

await check('a big file comes in parts: start, parts (any order, retried), finish; the parts must belong to the card', async () => {
  const st = await call('/api/production/upload/start?id=c2&name=45-1 v3.mp4&type=video/mp4&size=50', { method: 'POST' });
  assert.equal(st.status, 200); assert.ok(st.body.uploadId && st.body.key.startsWith('work/brand_alpha/c2/')); assert.equal(st.body.part, 24 * 1024 * 1024);
  const part = (n, data) => call(`/api/production/upload/part?id=c2&key=${encodeURIComponent(st.body.key)}&uploadId=${st.body.uploadId}&n=${n}`, { method: 'PUT', raw: Buffer.from(data), type: 'application/octet-stream' });
  const p2 = await part(2, 'SECOND'); const p1 = await part(1, 'FIRST-'); const p1again = await part(1, 'FIRST-');
  assert.equal(p2.body.partNumber, 2); assert.equal(p1again.body.etag, p1.body.etag);
  assert.equal((await call(`/api/production/upload/part?id=c3&key=${encodeURIComponent(st.body.key)}&uploadId=${st.body.uploadId}&n=1`, { method: 'PUT', raw: Buffer.from('x') })).status, 400, 'another card cannot write into it');
  const fin = await call('/api/production/upload/finish', { method: 'POST', body: { id: 'c2', key: st.body.key, uploadId: st.body.uploadId, parts: [p2.body, p1.body], name: '45-1 v3.mp4', type: 'video/mp4', size: 12 } });
  assert.equal(fin.status, 200); assert.equal(fin.body.file.version, 3, 'the third version of 45-1'); assert.equal(fin.body.file.ad, '45-1'); assert.equal(fin.body.file.size, 12); assert.equal(fin.body.file.video, true);
  const u = new URL(fin.body.file.url);
  assert.equal(await (await serveFile(new Request(u), env, u, u.pathname.split('/').pop())).text(), 'FIRST-SECOND');
  assert.equal((await call('/api/production/upload/finish', { method: 'POST', body: { id: 'c2', key: 'work/brand_alpha/c2/zz', uploadId: 'nope', parts: [] } })).status, 400);
  assert.equal((await call('/api/production/upload/start?id=c2&name=x.pdf&type=application/pdf', { method: 'POST' })).status, 400);
});

await check('a note on a version keeps its drawing (0..1) and its second; fixed / unfixed', async () => {
  assert.equal(normShape({ tool: 'box', x: 0.1, y: 1.5, w: 0.2, h: -1, color: 'purple' }).y, 1); assert.equal(normShape({ tool: 'box', x: 0.1, y: 0.1, w: 0.2, h: 0.3, color: 'purple' }).color, 'coral');
  assert.equal(normShape({ tool: 'laser' }), null); assert.equal(normShape({ tool: 'pen', pts: [[0, 0]] }), null);
  const f = db.prepare(`SELECT id FROM p_work_file WHERE batch_id = 'c2' AND ad = '45-1' AND version = 2`).get();
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
  const dm = slack.filter(s => s.method === 'chat.postMessage').pop(); assert.equal(dm.args.channel, 'U_WILLIAM'); assert.match(dm.args.text, /Cole asked for changes on 45-\d v\d of #45/);
  const cr = (await getCard(env, dd, 'https://ah.test', 'c2', null)).comments.find(c => c.kind === 'change_request'); assert.equal(cr.kind, 'change_request'); assert.ok(cr.file_id, 'tied to the newest version');
  /* One approval is one ad (the newest upload when no file is named); the card moves to Ready when EVERY ad is approved. */
  const ok = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: true }, email: 'cole@go-mobius-digital.com' });
  assert.equal(ok.body.moved, null, 'the other ads still wait'); assert.equal(ok.body.all_approved, false);
  let last = ok;
  for (const a of ok.body.ads.filter(a => a.status !== 'approved')) last = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: true, file_id: a.file_id }, email: 'cole@go-mobius-digital.com' });
  assert.equal(last.body.moved, 'ready'); assert.equal(last.body.all_approved, true);
  const row = db.prepare(`SELECT board_stage, approved_by FROM p_br_batch WHERE id = 'c2'`).get(); assert.equal(row.board_stage, 'ready'); assert.equal(row.approved_by, 'cole@go-mobius-digital.com');
  assert.match((await getCard(env, dd, 'https://ah.test', 'c2', null)).comments.find(c => c.kind === 'approval').body, /^Approved 45-1 v3\./, 'the newest ad and its version');
});

await check('the client: its own brand only, Needs you + Coming up (never the board), team names as Mobius, no Asana; no drag / new brief / upload / save', async () => {
  assert.equal((await call('/api/production/send', { method: 'POST', body: { id: 'c3', what: 'ad' } })).status, 400, 'no file yet');
  const un = await call('/api/production/upload?id=c2&name=hero final.png', { method: 'POST', raw: Buffer.from('V3'), type: 'image/png' });
  assert.equal(un.body.file.ad, ''); assert.equal(un.body.file.version, 1, 'a file with no ad number is its own ad');
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
  /* Each ad is its own call (2026-10-14): the test waits until every ad is decided. */
  const cardNow = (await call('/api/production/card?id=c2', { client: true })).body;
  assert.ok(cardNow.ads.length >= 2, 'several ads on the test');
  /* the team approved everything earlier: reopen two, then the client's first approval leaves the test waiting */
  for (const a of cardNow.ads.slice(0, 2)) await call('/api/production/decide', { method: 'POST', body: { id: 'c2', reset: true, file_id: a.file_id }, client: true, email: 'nick@alpha.com' });
  const first = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: true, file_id: cardNow.ads[0].file_id }, client: true, email: 'nick@alpha.com' });
  assert.equal(first.status, 200); assert.equal(first.body.ads.find(x => x.file_id === cardNow.ads[0].file_id).status, 'approved');
  assert.equal(db.prepare(`SELECT needs_client FROM p_br_batch WHERE id = 'c2'`).get().needs_client, 'ad', 'still waiting on the second ad');
  const second = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: true, file_id: cardNow.ads[1].file_id }, client: true, email: 'nick@alpha.com' });
  assert.equal(second.status, 200); assert.equal(db.prepare(`SELECT needs_client FROM p_br_batch WHERE id = 'c2'`).get().needs_client, null, 'all decided');
  const after = (await call('/api/production/card?id=c2', { client: true })).body;
  assert.ok(after.ads.every(a => a.status === 'approved')); assert.equal(after.ads[0].by, 'Nick');
  /* Changing a call: the client reopens an ad and the test waits for them again. */
  const re = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', reset: true, file_id: after.ads[0].file_id }, client: true, email: 'nick@alpha.com' });
  assert.equal(re.status, 200); assert.equal(re.body.ads[0].status, 'review'); assert.equal(db.prepare(`SELECT needs_client FROM p_br_batch WHERE id = 'c2'`).get().needs_client, 'ad');
  await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: true, file_id: after.ads[0].file_id }, client: true, email: 'nick@alpha.com' });
  /* Replies hang under their note and are not counted as open notes. */
  const note = cardNow.comments.find(c => c.file_id);
  if (note) {
    const rp = await call('/api/production/comment', { method: 'POST', body: { id: 'c2', parent_id: note.id, body: 'Fixed in the next one.' }, email: 'william@go-mobius-digital.com' });
    assert.equal(rp.status, 200);
    const got = (await call('/api/production/card?id=c2', {})).body.comments.find(c => c.id === rp.body.id);
    assert.equal(got.parent_id, note.id); assert.equal(got.kind, 'reply'); assert.equal(got.file_id, note.file_id);
  }
  /* Taken back by the team: the client cannot decide any more. */
  await sendToClient(env, dd, { id: 'c2', what: '' }, 'ahsan@go-mobius-digital.com');
  const again = await call('/api/production/decide', { method: 'POST', body: { id: 'c2', ok: true }, client: true }); assert.equal(again.status, 403, 'nothing waiting any more');
  const idea = await call('/api/production/decide', { method: 'POST', body: { id: 'c1', ok: true }, client: true });
  assert.equal(idea.body.moved, null, 'an approved idea stays in Brief');
  assert.equal((await call('/api/production/upload/start?id=c2&name=x.png&type=image/png', { method: 'POST', client: true })).status, 403, 'no parts upload for a client');
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
  assert.ok(Array.isArray(g.body.ads) && g.body.ads.length >= 2, 'the link carries every ad with its call');
  await sendToClient(env, dd, { id: 'c2', what: 'ad' }, 'ahsan@go-mobius-digital.com');
  const dec = await rq(`/api/review/${t}/decide`, 'POST', { name: 'Mike', ok: false, body: 'Say magnetic.' });
  assert.equal(dec.status, 200); assert.equal(db.prepare(`SELECT board_stage FROM p_br_batch WHERE id = 'c2'`).get().board_stage, 'making');
});

await check('the Asana mirror switch: off stops every Asana write (move, save, comment) and a new brief is made in Locus only', async () => {
  await setMirror(env, false, 'cole@go-mobius-digital.com'); assert.equal(await mirrorOn(env), false);
  asanaCalls = [];
  const m = await moveCard(env, dd, { id: 'c1', to: 'making' }, 'x'); assert.equal(m.asana.why, 'The Asana mirror is off.');
  const s = await saveCard(env, dd, { id: 'c1', brief: { v: 2, html: '<p>x</p>' } }, 'x'); assert.equal(s.asana.written, false);
  const c = await addComment(env, dd, { id: 'c1', body: 'no story please' }, 'ahsan@go-mobius-digital.com', null); assert.equal(c.asana, false);
  const b = await call('/api/production/brief', { method: 'POST', body: { act: 'brand_alpha', text: 'Belt as a gift', owner: 'Ravo' } });
  assert.equal(b.body.local, true); assert.equal(b.body.num, 49);
  assert.equal(asanaCalls.length, 0, 'not one Asana call');
  const st = (await call('/api/production/mirror')).body; assert.equal(st.on, false); assert.equal(st.changed_by, 'Cole');
  await setMirror(env, true, 'cole@go-mobius-digital.com');
});

await check('comments: saved at once (Slack and Asana after, waitUntil), deleted by their author or the owner only, never a decision; files carry a download link', async () => {
  const later = [];
  const d2 = { ...d, waitUntil: p => later.push(p) };
  const url = new URL('https://ah.test/api/production/comment');
  const mk = (path, body, email, client) => { const h = new Headers({ authorization: 'Bearer x', 'x-email': email }); if (client) h.set('x-client', '1'); const u = new URL('https://ah.test' + path); return handleProduction(new Request(u, { method: 'POST', headers: h, body: JSON.stringify(body) }), env, u, u.pathname, json, d2).then(async r => ({ status: r.status, body: await r.json() })); };
  const mine = await mk('/api/production/comment', { id: 'c2', body: 'Mine to delete @William' }, 'ahsan@go-mobius-digital.com');
  assert.equal(mine.status, 200); assert.equal(mine.body.later, true, 'answered before the Slack DM'); assert.ok(later.length >= 1, 'the DM runs in waitUntil');
  await Promise.all(later);
  const theirs = await mk('/api/production/comment', { id: 'c2', body: 'Not yours' }, 'william@go-mobius-digital.com');
  const reply = await mk('/api/production/comment', { id: 'c2', parent_id: mine.body.id, body: 'a reply' }, 'william@go-mobius-digital.com');
  assert.equal((await mk('/api/production/comment/delete', { comment_id: theirs.body.id }, 'ahsan@go-mobius-digital.com')).status, 403, 'not the author');
  const del = await mk('/api/production/comment/delete', { comment_id: mine.body.id }, 'ahsan@go-mobius-digital.com');
  assert.equal(del.status, 200); assert.equal(del.body.deleted, 2, 'its reply goes with it');
  assert.equal(db.prepare(`SELECT COUNT(*) n FROM p_work_comment WHERE id IN (?, ?)`).get(mine.body.id, reply.body.id).n, 0);
  assert.equal((await mk('/api/production/comment/delete', { comment_id: theirs.body.id }, 'cole@go-mobius-digital.com')).status, 200, 'the owner can');
  const call1 = db.prepare(`SELECT id FROM p_work_comment WHERE batch_id = 'c2' AND kind = 'approval' LIMIT 1`).get();
  if (call1) assert.equal((await mk('/api/production/comment/delete', { comment_id: call1.id }, 'cole@go-mobius-digital.com')).status, 400, 'a decision stays');
  const card = (await call('/api/production/card?id=c2', { email: 'william@go-mobius-digital.com' })).body;
  assert.ok(card.files.every(f => /&dl=1$/.test(f.download)), 'download links');
  const own = card.comments.find(c => c.mine); if (own) assert.equal(own.can_delete, true);
  assert.ok(card.comments.filter(c => !c.mine).every(c => !c.can_delete), 'not someone else\'s');
});

await check('prune: 60 days after Live only the final version OF EACH AD stays; photos: Google first, Slack after', async () => {
  db.exec(`UPDATE p_br_batch SET board_stage = 'live', board_at = '2026-07-01 10:00:00' WHERE id = 'c2'`);
  const before = db.prepare(`SELECT COUNT(*) AS n FROM p_work_file WHERE batch_id = 'c2' AND deleted_at IS NULL AND kind = 'version'`).get().n;
  const pruned = await pruneFiles(env);
  assert.equal(pruned, before - 3, 'three ads keep one version each');
  const left = db.prepare(`SELECT ad, version FROM p_work_file WHERE batch_id = 'c2' AND deleted_at IS NULL AND kind = 'version' ORDER BY ad, version`).all();
  assert.deepEqual(left.map(r => [r.ad || '', r.version]), [['', 1], ['45-1', 3], ['45-2', 1]]);
  await savePhoto(env, 'cole@go-mobius-digital.com', 'https://lh3.googleusercontent.com/a/cole');
  await savePhoto(env, 'x@y.com', 'javascript:alert(1)');
  slack = [];
  const p = await teamPhotos(env, d);
  assert.equal(p.Cole, 'https://lh3.googleusercontent.com/a/cole'); assert.equal(p.Ahsan, 'https://slack/p/U_AHSAN');
  const calls = slack.length; await teamPhotos(env, d); assert.equal(slack.length, calls, 'Slack photos cached for a week');
});

console.log(`\n${n} passed, ${bad} failed`);
if (bad) process.exit(1);
