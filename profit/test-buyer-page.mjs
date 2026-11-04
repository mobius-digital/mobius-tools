/* Offline checks for the Buyer list page (buyer.js, 2026-10-27 simple pass): the row shows the FULL name on its own line
 * with the level and brand as labels, a short action and ONE why, "Locus changed this" when the morning read changed the
 * call, "Show ads" as its own control; brands grouped by money; AGREE TO ALL makes only the changes Locus can make, one at
 * a time through the same dry-run-then-write path, Done on success, one failure never stops the rest, rows that need Cole
 * are skipped. buyer.js runs in a vm with a stub window (no DOM needed for these parts).
 *   node test-buyer-page.mjs      (from profit/) */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const win = {};
vm.runInNewContext(fs.readFileSync(new URL('./buyer.js', import.meta.url), 'utf8'), { window: win, document: { querySelector: () => null }, CSS: { escape: s => s }, console });
const T = win.BuyerTab._test;
const eq = (a, b, m) => assert.deepEqual(JSON.parse(JSON.stringify(a)), b, m);   // the vm realm has its own Object
let pass = 0, fail = 0;
const check = async (name, fn) => { try { await fn(); pass++; console.log('PASS ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n   ', String(e.stack || e).split('\n').slice(0, 5).join('\n   ')); } };

const BW = { key: 'brand_lucky|600|cut', kind: 'cut', act_id: 'brand_lucky', brand: 'Lucky Golf', level: 'adset', object: '600', name: 'Black Wedges | Still', adset_id: '600', set: null,
  action: 'Pause this ad set', why: '$561 in 7 days, 0 sales, goal ROAS 2.2x', checked: 'Tracking is fine: Meta also counts just 1 sale on $561', stake: 561, do: 'pause', currency: 'USD' };
const TRIM = { key: 'brand_lucky|1002|trim', kind: 'trim', act_id: 'brand_lucky', brand: 'Lucky Golf', level: 'ad', object: '1002', name: 'Carver static', set: '420 | Carver', adset_id: '500', ad_id: '1002',
  action: 'Turn off the static', why: 'The static made 1 sale on $70', changed: true, rule: { action: 'Pause this ad', why: '$70 a sale, goal $52' }, stake: 70, do: 'pause', currency: 'USD' };
const SCALE = { key: 'brand_dartee|7|scale', kind: 'scale', act_id: 'brand_dartee', brand: 'Dartee', level: 'adset', object: '7', name: 'Broad', adset_id: '7', action: 'Raise budget $100 to $120/day', why: '9 sales at $20 each in 7 days, goal $40', stake: 900, do: 'budget', currency: 'USD' };
const MIXED = { key: 'brand_dartee|8|mixed', kind: 'mixed', act_id: 'brand_dartee', brand: 'Dartee', level: 'adset', object: '8', name: 'LAL', adset_id: '8', action: 'Your call', why: 'x', stake: 300, do: null };
const LAUNCH = { key: 'brand_lucky|c1|launch', kind: 'launch', act_id: 'brand_lucky', brand: 'Lucky Golf', level: 'card', object: 'c1', name: '#415 Gift hook', action: 'Launch 2 approved ads', why: 'x', stake: 0, do: 'launch' };
const RESUME = { key: 'brand_lucky|1001|ai', kind: 'ai', act_id: 'brand_lucky', brand: 'Lucky Golf', level: 'ad', object: '1001', name: 'Carver hook A', ad_id: '1001', action: 'Turn back on', why: '3 sales at $70 each', stake: 210, do: 'resume' };

await check('the card row: kind tag, level and object, the directive, the Why line, Yes / No; the rules decide when there is no card', () => {
  T.setHost({ S: {} });
  const h = T.row(BW);
  assert.match(h, /<span class="by-k cut">CUT<\/span><span class="lv">Ad set: <b>Black Wedges \| Still<\/b><\/span>/);
  assert.match(h, /<div class="by-do">Pause this ad set<\/div>/);
  assert.match(h, /<div class="by-bec"><b>Why<\/b>\$561 in 7 days, 0 sales, goal ROAS 2\.2x<\/div>/);
  assert.match(h, /data-yes="brand_lucky\|600\|cut"[^>]*>Yes<\/button><button[^>]*data-no="brand_lucky\|600\|cut"[^>]*>No<\/button>/, 'a cut with a Meta move asks Yes / No');
  assert.match(h, /Locus checked: Tracking is fine: Meta also counts just 1 sale on \$561/);
  assert.ok(!/Nothing to do|by-note/.test(h), 'no note box until he says No');
  const t = T.row(TRIM);
  assert.match(t, /<span class="by-k trim">TRIM<\/span><span class="lv">Ad: <b>Carver static<\/b><\/span>/); assert.match(t, /Locus changed this/);
  assert.match(t, /<div class="by-do">Turn off the static<\/div>/); assert.ok(!/Pause this ad</.test(t), 'only the final call shows');
  const m = T.row({ ...MIXED, card: { kind: 'keep', level: 'adset', object: 'LAL', do: 'Leave LAL alone', facts: [{ l: 'Spend', v: '$300' }, { l: 'ROAS', v: '2.9x', good: true }], because: 'It is on goal.', decide: false, fyi: 'Nothing to do', ad_ids: [] } });
  assert.match(m, /<span class="by-k keep">KEEP<\/span>/); assert.match(m, /<span class="by-fyi">Nothing to do<\/span>/);
  assert.match(m, /<span class="by-f"><small>Spend<\/small>\$300<\/span><span class="by-f good"><small>ROAS<\/small>2\.9x<\/span>/, 'facts are chips, good ones marked');
  assert.ok(!/data-yes/.test(m));
  const d = T.row({ ...BW, decided: { decision: 'no', note: 'Give it till Friday', by: 'cole@go-mobius-digital.com', at: '2026-11-05T15:00:00Z' } });
  assert.match(d, /class="by-cr no"/); assert.match(d, /class="v2btn no on"/); assert.match(d, /You said: Give it till Friday/); assert.match(d, /No by Cole, /);
  const n = T.row({ ...BW, decided: { decision: 'no', note: '', by: 'cole@x', at: '2026-11-05T15:00:00Z' } });
  assert.match(n, /<input type="text" maxlength="600" data-note="brand_lucky\|600\|cut"/, 'a No with no reason yet shows the one-line Why box');
});

await check('the ad strip: every ad behind the row, the row own ad ringed, a paused one faded, a tap plays it', () => {
  const r = { ...BW, goal_roas: 2.2, metric: 'roas', ads: { n: 3, days: 7, ads: [
    { ad_id: '1', name: 'Hero | Video', spend: 400, sales: 1, roas: 0.5, focus: true, off: false, video: true, cover: 'https://x/1.webp' },
    { ad_id: '2', name: 'Static B', spend: 161, sales: 0, roas: 0, focus: false, off: true, video: false, cover: null }] } };
  const h = T.stripHtml(r);
  assert.match(h, /<div class="by-ad focus"><button type="button" class="by-adth" data-thumb="1" data-play="1" data-row="brand_lucky\|600\|cut" style="background-image:url\('https:\/\/x\/1.webp'\)"/);
  assert.match(h, /<span>This one<\/span>/); assert.match(h, /<i>Play<\/i>/);
  assert.match(h, /<div class="by-ad off"><button type="button" class="by-adth" data-thumb="2" data-play="2"/, 'no cover yet = V2.thumbs fills it from [data-thumb]');
  assert.match(h, /<span>Off<\/span>/); assert.match(h, /\+1 more, each smaller/);
  assert.match(h, /<div class="st bad">\$400, 1 sale, 0\.5x<\/div>/);
  assert.equal(T.stripHtml({ ...BW, ads: { n: 0, days: 7, ads: [] } }), '<p class="v2hint" style="margin:0">No ad in it spent in the last 7 days.</p>');
  assert.equal(T.stripHtml(BW), '', 'no ads read = no strip');
});

await check('one card per brand: name, week chips, the one line, "x of y decided", rows in the card order', () => {
  T.setData({ act: 'all', ai: { brands: [{ act_id: 'brand_lucky', headline: 'Lucky is on goal this week.', week: [{ l: 'Spend', v: '$4.2K' }, { l: 'MER', v: '2.8x', good: true }] }] } });
  const rows = [{ ...TRIM, card: { kind: 'trim', decide: true } }, { ...BW, card: { kind: 'cut', decide: true }, decided: { decision: 'yes', by: 'a@b', at: '2026-11-05T15:00:00Z' } }, { ...LAUNCH, card: { kind: 'launch', decide: true } }, { ...RESUME, card: { kind: 'raise', decide: true } }];
  const g = T.groupsOf(rows);
  const h = T.brandCard(g[0]);
  assert.match(h, /<h3>Lucky Golf<\/h3><span class="m">1 of 4 decided, \$841 at stake<\/span>/);
  assert.match(h, /<div class="by-week"><span class="by-f"><small>Spend<\/small>\$4\.2K<\/span><span class="by-f good"><small>MER<\/small>2\.8x<\/span><\/div><p class="line">Lucky is on goal this week\.<\/p>/);
  const order = [...h.matchAll(/class="by-k (\w+)"/g)].map(m => m[1]);
  eq(order, ['raise', 'cut', 'trim', 'launch']);
  assert.match(h, /data-wwd="brand_lucky">What we did</, 'a Yes today = the client update button');
});

await check('grouped by brand, the brand with the most money at stake first', () => {
  const g = T.groupsOf([BW, TRIM, SCALE, MIXED, LAUNCH]);
  eq(g.map(x => [x.brand, x.rows.length, x.n_do, x.stake]), [['Dartee', 2, 1, 1200], ['Lucky Golf', 3, 2, 631]]);
  eq(T.groupsOf([BW, { ...TRIM, decided: { decision: 'yes' } }])[0].n_do, 1, 'a decided row is not counted in Yes to all');
});

await check('Agree to all: only Meta changes Locus can make; each body hits the right object and level', () => {
  eq([BW, TRIM, SCALE, MIXED, LAUNCH, RESUME].filter(T.canDo).map(r => r.key), [BW.key, TRIM.key, SCALE.key, RESUME.key]);
  eq(T.bodyOf(BW), { act: 'brand_lucky', kind: 'pause', level: 'adset', object: '600', reason: 'From the Buyer list: Pause this ad set. $561 in 7 days, 0 sales, goal ROAS 2.2x' });
  assert.equal(T.bodyOf(TRIM).level, 'ad'); assert.equal(T.bodyOf(TRIM).object, '1002', 'a changed call on one ad pauses that ad, not the set');
  eq([T.bodyOf(SCALE, 120).kind, T.bodyOf(SCALE, 120).amount, T.bodyOf(SCALE, 120).level], ['budget', 120, 'adset']);
  eq([T.bodyOf(RESUME).kind, T.bodyOf(RESUME).object], ['resume', '1001']);
  eq(T.bodyOf({ ...SCALE, adset_id: null, campaign_id: '900', suggested_budget: 300 }, 300).level, 'campaign');
  eq(T.bodyOf({ ...BW, do: 'minoff' }).min, 0);
  eq(T.expectOf('pause', { status: 'ACTIVE' }), { status: 'ACTIVE' });
  eq(T.expectOf('budget', { daily_budget: 100 }), { daily_budget: 100 });
});

await check('Agree to all runs one by one: dry run then write with expect, Done on success, a failure never stops the rest, unticked skipped', async () => {
  const log = [];
  const io = {
    planOne: async (r, amount) => { log.push(['dry', r.key, amount ?? null]); return r.key === TRIM.key ? { error: 'Meta said: ad not found' } : { body: { object: r.object }, expect: { status: 'ACTIVE' } }; },
    commitOne: async p => { log.push(['write', p.body.object, p.expect.status]); return { ok: true, write: { write: 'w' + p.body.object }, summary: 'Paused' }; },
    state: async (r, s) => { log.push(['state', r.key, s]); return { ok: true }; },
  };
  const todo = [{ r: BW, ok: true }, { r: TRIM, ok: true }, { r: SCALE, ok: false }, { r: RESUME, ok: true }];
  const seen = [];
  const res = await T.runAll(todo, io, (i, phase, p, out) => seen.push([i, phase, out ? out.ok : null]));
  eq(res, { ok: 2, bad: 1 });
  eq(log, [['dry', BW.key, null], ['write', '600', 'ACTIVE'], ['state', BW.key, 'done'], ['dry', TRIM.key, null], ['dry', RESUME.key, null], ['write', '1001', 'ACTIVE'], ['state', RESUME.key, 'done']]);
  eq(seen, [[0, 'start', null], [0, 'end', true], [1, 'start', null], [1, 'end', false], [3, 'start', null], [3, 'end', true]]);
});

await check('no em dashes in the page copy', () => {
  assert.ok(!/—/.test(fs.readFileSync(new URL('./buyer.js', import.meta.url), 'utf8')));
});

await check('the nudge: "Meta did not pick it" takes the minimum off THEN pauses the set (dry run + write each); a plain minimum row only takes it off', async () => {
  const calls = [];
  T.setHost({ S: {}, apiAH: async (path, o) => { const b = JSON.parse(o.body); calls.push(b); return b.dry ? { ok: true, dry: true, before: b.kind === 'pause' ? { status: 'ACTIVE' } : { daily_min_spend_target: '1000' } } : { ok: true, write: 'mw_' + b.kind }; } });
  const NP = { key: 'brand_lucky|900|minoff', kind: 'minoff', act_id: 'brand_lucky', brand: 'Lucky Golf', level: 'adset', object: '900111', name: '444 | UGC | Carver', adset_id: '900111',
    action: 'Take the minimum off and pause', why: 'Meta did not pick it: $72 in 8 days on a $10/day minimum', do: 'minoff', nudge: 'not_picked', then: 'pause' };
  const plan = await T.planOne(NP);
  const res = await T.commitOne(plan);
  assert.equal(res.ok, true); assert.equal(res.summary, 'Minimum off and paused');
  eq(calls.map(c => `${c.kind}${c.dry ? ' dry' : ''}`), ['min_spend dry', 'min_spend', 'pause dry', 'pause']);
  eq(calls[1].expect, { daily_min_spend_target: '1000' }); eq(calls[3].expect, { status: 'ACTIVE' });
  assert.equal(calls[3].object, '900111'); assert.equal(calls[3].level, 'adset');
  calls.length = 0;
  const r2 = await T.commitOne(await T.planOne({ ...NP, then: null, nudge: 'campaign' }));
  assert.equal(r2.ok, true); eq(calls.map(c => c.kind), ['min_spend', 'min_spend']);
});

console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
