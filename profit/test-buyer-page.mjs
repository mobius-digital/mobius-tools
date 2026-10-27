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

await check('the row: full name on its own line, level and brand as labels, one bold action and one why, Show ads below; Locus changed this', () => {
  T.setHost({ S: {} });
  const h = T.row(BW);
  assert.match(h, /<div class="by-tags"><span class="by-lv">Ad set<\/span><span>Lucky Golf<\/span>/);
  assert.match(h, /<div class="by-n">Black Wedges \| Still<\/div>/, 'the whole name, one line, never split or cut');
  assert.match(h, /<div class="by-act">Pause this ad set<\/div><div class="by-why">\$561 in 7 days, 0 sales, goal ROAS 2\.2x<\/div>/);
  assert.match(h, /Locus checked: Tracking is fine: Meta also counts just 1 sale on \$561/);
  assert.match(h, /<div class="by-more"><button type="button" class="by-tog" data-ads="[^"]+" aria-expanded="false">Show ads<\/button><\/div>/, 'Show ads is its own control below');
  assert.ok(!/Locus changed this|Needs you|MORNING READ|CUT/.test(h));
  const t = T.row(TRIM);
  assert.match(t, /<span class="by-lv">Ad<\/span>/); assert.match(t, /Locus changed this/); assert.match(t, /in 420 \| Carver/);
  assert.match(t, /<div class="by-act">Turn off the static<\/div>/); assert.ok(!/Pause this ad</.test(t), 'only the final call shows');
  assert.match(T.row(MIXED), /Needs you/);
});

await check('grouped by brand, the brand with the most money at stake first', () => {
  const g = T.groupsOf([BW, TRIM, SCALE, MIXED, LAUNCH]);
  eq(g.map(x => [x.brand, x.rows.length, x.n_do, x.stake]), [['Dartee', 2, 1, 1200], ['Lucky Golf', 3, 2, 631]]);
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
