// Post my week (2026-11-16 rebuild) + the Amazon line in the client posts. Run: node test-weekplan.mjs
import { weekView, weekOf, checkinErrors, WEEK_ONLY_PEOPLE, isMaker, weekModal, planModal } from './src/checkin.js';
import { dailyPost, weeklyPost } from './src/clientpost.js';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; console.log('PASS  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || ''} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not true'); };

const brands = [{ a: 'brand_dartee_golf', n: 'Dartee' }, { a: 'brand_ice_and_gold', n: 'Ice & Gold' }, { a: 'brand_bonk_golf', n: 'Bonk' }];
const noma = { name: 'Noma', roles: ['strategist'] };
const radhesh = WEEK_ONLY_PEOPLE.U09A6NTSUQJ;

t('strategist form: theme, then each own brand with Main focus, Batch 1, its channel and + Add batch; Add a brand lists the rest', () => {
  const v = weekView(noma, { date: '2026-11-16', brands, open: [{ ...brands[0], k: 1 }, { ...brands[1], k: 2 }] });
  const ids = v.blocks.map(b => b.block_id || b.type);
  ok(ids.includes('wk_theme'));
  for (const id of ['wf_brand_dartee_golf', 'wb_brand_dartee_golf_0', 'wc_brand_dartee_golf_0', 'wa_brand_dartee_golf', 'wb_brand_ice_and_gold_1', 'wc_brand_ice_and_gold_1', 'wk_more', 'walk']) ok(ids.includes(id), 'missing ' + id);
  const more = v.blocks.find(b => b.block_id === 'wk_more').elements[0];
  eq(more.options.map(o => o.value), ['brand_bonk_golf']);
  ok(v.blocks.length <= 100);
});

t('Google person: theme + one focus per brand, no batches, no add batch, no walkthrough; need + from who', () => {
  const v = weekView(radhesh, { date: '2026-11-16', brands, open: [{ ...brands[2], k: 2 }] });
  const ids = v.blocks.map(b => b.block_id || b.type);
  ok(ids.includes('wf_brand_bonk_golf') && ids.includes('wk_theme'));
  ok(!ids.some(i => /^(wb_|wc_|wa_)/.test(i)), 'has batch rows');
  ok(!ids.includes('walk'));
  eq(v.blocks.find(b => b.block_id === 'need').label.text, 'What I need (leave empty if nothing)');
  eq(v.blocks.find(b => b.block_id === 'who').label.text, 'From who');
});
const fakeD = (day = null) => ({ getSetting: async (e, k) => k.startsWith('checkin:') ? JSON.stringify(day) : null, listBrands: async () => [] });
t('William and Ravo are makers; Noma, Ahsan, Radhesh are not', () => {
  ok(isMaker({ roles: ['designer'] }) && isMaker({ roles: ['editor'] }));
  ok(!isMaker({ roles: ['strategist'] }) && !isMaker({ roles: ['strategist', 'buyer'] }) && !isMaker(radhesh));
});

t('ten brands with ten batches each never pass Slack\'s 100 blocks', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ a: 'b' + i, n: 'B' + i, k: 10 }));
  ok(weekView(noma, { date: '2026-11-16', brands: many, open: many }).blocks.length <= 100);
});

const state = (vals) => ({ values: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, { v: typeof v === 'string' ? { value: v } : v }])) });
t('weekOf reads theme, focus and batches with their channel; empty batches and empty brands are left out', () => {
  const view = { private_metadata: JSON.stringify({ date: '2026-11-16', brands, open: [{ ...brands[0], k: 3 }, { ...brands[1], k: 1 }] }),
    state: state({ wk_theme: 'BF ads loaded by Wed', wf_brand_dartee_golf: 'BF weekend', wb_brand_dartee_golf_0: 'Batch 15 statics', wc_brand_dartee_golf_0: { selected_option: { value: 'meta' } },
      wb_brand_dartee_golf_1: '', wb_brand_dartee_golf_2: 'Klaviyo BF send', wc_brand_dartee_golf_2: { selected_option: { value: 'email' } } }) };
  const w = weekOf(view, noma);
  eq(w.theme, 'BF ads loaded by Wed');
  eq(w.brands.length, 1);
  eq(w.brands[0].batches, [{ text: 'Batch 15 statics', ch: 'meta' }, { text: 'Klaviyo BF send', ch: 'email' }]);
});

t('a Google person\'s batches are Google without a picker', () => {
  const view = { private_metadata: JSON.stringify({ open: [{ ...brands[2], k: 1 }] }), state: state({ wb_brand_bonk_golf_0: 'BF search ad group' }) };
  eq(weekOf(view, radhesh).brands[0].batches[0].ch, 'google');
});

t('an empty week form is sent back with a note on the first brand\'s focus', () => {
  const p = { view: { callback_id: 'ci_week_submit', private_metadata: JSON.stringify({ open: [{ ...brands[0], k: 1 }] }), state: { values: {} } } };
  eq(Object.keys(checkinErrors(p)), ['wf_brand_dartee_golf']);
});

t('client daily: Amazon yesterday and month to date, only when there is Amazon', () => {
  const base = { brand: 'Bonk Golf', date: '2026-11-15', day: { sales: 1600, spend: 500, mer: 3.2 }, month: { sales: 20000, spend: 6000, day_of_month: 15, days_in_month: 30 } };
  const withA = dailyPost({ ...base, amazon: { day: { sales: 512, orders: 11 }, month: { sales: 9100, orders: 190 } } });
  ok(withA.includes('• Amazon: *$512* (11 orders)'), withA);
  ok(/Amazon: \*\$9,100\* \(190 orders\)/.test(withA), withA);
  ok(!dailyPost(base).includes('Amazon'));
});

t('client weekly: Amazon line with last week', () => {
  const txt = weeklyPost({ brand: 'Bonk Golf', start: '2026-11-09', end: '2026-11-15', totals: { sales: 11491, spend: 3553, mer: 3.23 }, previous: { sales: 12452, spend: 4513 },
    amazon: { cur: { sales: 3610, orders: 79 }, prev: { sales: 4805, orders: 59 } } });
  ok(txt.includes('• Amazon: *$3,610* (79 orders, was $4,805)'), txt);
});

const ta = async (name, fn) => { try { await fn(); pass++; console.log('PASS  ' + name); } catch (e) { fail++; console.log('FAIL  ' + name + '\n      ' + e.message); } };
await ta('a maker who taps Post my week gets "no week post for you", no form', async () => {
  const v = await weekModal({}, fakeD(), 'U08534TEBCZ', 'william', '2026-11-16');
  ok(!v.submit && /No week post for you/.test(v.blocks[0].text.text));
});
await ta("a maker's plan: still finishing (filled from yesterday's unticked lines), main goal, anything else", async () => {
  const yday = { people: { U08534TEBCZ: { items: ['Dartee: 402 BOGO 2', 'Grunk: 381 giveaway'], wrap: { picked: [0] } } } };
  const v = await planModal({}, fakeD(yday), 'U08534TEBCZ', 'william', '2026-11-16');
  const ids = v.blocks.map(b => b.block_id || b.type);
  ok(['carry', 'goal', 'more', 'need', 'who'].every(i => ids.includes(i)), ids.join());
  eq(v.blocks.find(b => b.block_id === 'carry').element.initial_value, 'Grunk: 381 giveaway');
  ok(JSON.parse(v.private_metadata).maker);
});
t('an empty maker plan is sent back asking for the main goal', () => {
  eq(checkinErrors({ view: { callback_id: 'ci_plan_submit', private_metadata: JSON.stringify({ maker: true }), state: { values: {} } } }), { goal: "Write today's main goal." });
});
console.log(`\n${pass}/${pass + fail} passed`);
if (fail) process.exit(1);
