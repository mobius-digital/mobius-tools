/* Agency > Google > Search terms. "Where is search money going with no sale?" across every brand.
   The brand page (pages/google/search-terms.js) asks what people type before they buy for one brand.
   This is the same read for all of them at once: which brand is paying most for searches that never
   buy, and the searches themselves in one list.

   Real: account-health GET /api/google/ads-terms?act=<brand id>&from=&to= for each brand (one call per
   brand, like the agency Google overview; there is no all-brands route yet). It gives the top 50 search
   terms by spend with Google's own orders and sales. A brand with Google Ads not connected, or one that
   did not answer, is left out and named in the foot note. It never shows as a zero.
   Sample: the same shape of answer from _sample/search-terms.json, run through the same reader.

   Orders and sales per search term are Google's count: Triple Whale does not go down to the term.
   That is said on the page. "Our name" is told by plain word rules on the brand's own name, the same
   rule the brand page uses.

   Read only. A row opens a sheet; blocking or adding a term is done in Google Ads. */

import { put } from '../../kit.js';
import { headRow } from '../platforms/_ads.js';
import { h, em, table, segmented, statusDot, sheet, button, empty, addStyles, kpi, tiles, money, num, pct, x } from '../../kit.js';
import { style } from '../a-today/_more.js';
import { soft, ok, sumOf, figures, brandRows, brandName, brandHref, quiet, shortDay } from '../a-today/_ag.js';
import { styles as googleStyles } from '../google/_g.js';

const LINE = 5;        // a search with no sale is "worth a look" from $5 of spend (not a setting yet)
const div = (a, b) => (ok(a) && ok(b) && b > 0 ? a / b : null);
const sum = (rows, k) => rows.reduce((t, r) => t + (+r[k] || 0), 0);
const usd2 = n => money(n, { cents: true });
const ord = n => num(n, n % 1 ? 1 : 0);          // Google counts part orders: 0.4 stays 0.4, 3 stays 3

const CSS = `
.agt-term{display:block;min-width:0;white-space:normal;line-height:1.3;overflow-wrap:anywhere}
.agt-term small{display:none;font-size:12.5px;font-weight:400;color:var(--muted)}
.agt-sheet{display:grid;gap:20px}
.agt-figs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px 14px}
.agt-figs span{display:grid;gap:2px;min-width:0}
.agt-figs small{font-size:12px;color:var(--muted)}
.agt-figs b{font-size:20px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.2}
.agt-figs b.q{font-size:13.5px;font-weight:400;letter-spacing:0;color:var(--muted);line-height:1.6}
.agt-kv{display:grid;grid-template-columns:120px minmax(0,1fr);gap:8px 14px;font-size:13.5px;padding-top:16px;border-top:1px solid var(--line)}
.agt-kv span{color:var(--muted)}
.agt-kv b{font-weight:500;overflow-wrap:anywhere}
.agt-note{margin:0;font-size:12.5px;color:var(--muted)}
.agt-sheet .lx-btn{justify-self:start}
@media (max-width:759px){
  .agt-term small{display:block}
  .agt-figs{grid-template-columns:repeat(2,minmax(0,1fr))}
  .agt-sheet .lx-btn{justify-self:stretch;height:46px}
  .gg-terms .lx-table th,.gg-terms .lx-table td{padding-left:8px;padding-right:8px}
  .gg-terms .lx-table th:first-child,.gg-terms .lx-table td:first-child{padding-left:18px}
}`;

/* ---------- the reader: one shape for real answers and the sample file ---------- */
/* The brand's own words, for telling "our name" searches from the rest. Common shop words do not count. */
const COMMON = new Set(['golf', 'apparel', 'supply', 'pets', 'sports', 'sticks', 'company', 'brand', 'shop', 'store', 'official', 'and', 'the', 'co']);
function brandTest(name) {
  const flat = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let ws = String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3 && !COMMON.has(w));
  if (!ws.length) ws = [flat(name)].filter(w => w.length > 2);
  return term => { const t = flat(term); return ws.some(w => t.includes(w)); };
}
/** One brand's Google Ads answer ({ terms: [{ term, status, campaign, ad_group, clicks, spend, conversions, value }] }) to rows. */
function rowsOf(b, answer) {
  const isBrand = brandTest(b.name);
  return ((answer && answer.terms) || []).map(t => {
    const ours = isBrand(t.term), blocked = /excluded/.test(t.status || ''), kw = /^added$/.test(t.status || '');
    const orders = +t.conversions || 0, spend = +t.spend || 0;
    const wrongPlace = ours && /shopping|pmax|performance max/i.test(t.campaign || '');
    const state = blocked ? 'blocked' : !ours && orders < 1 && spend >= LINE ? 'look' : !ours && orders >= 2 && !kw ? 'add' : kw ? 'keyword' : null;
    return { brand_id: b.id, brand: b.name, term: t.term, where: t.campaign || '', group: t.ad_group || '', spend, clicks: +t.clicks || 0, orders, sales: +t.value || 0,
      ours, state, flag: wrongPlace ? 'Our name outside brand search' : null };
  });
}
/** list: [{ id, name, answer }] where answer is the ads-terms answer, { error } or null. */
function shape(list, win) {
  const brands = [], terms = [], notLinked = [], failed = [];
  for (const b of list) {
    const a = b.answer;
    if (!a || a.error) { (a && a.error === 'not_linked' ? notLinked : failed).push(b.name); continue; }
    const rows = rowsOf(b, a);
    if (!rows.length) continue;                    // connected, nothing spent on search in these dates: not a row of zeros
    terms.push(...rows);
    const other = rows.filter(r => !r.ours), nosale = other.filter(r => r.orders < 1 && r.state !== 'blocked'), look = rows.filter(r => r.state === 'look');
    brands.push({ id: b.id, name: b.name, color: b.color, count: rows.length, spend: sum(rows, 'spend'), clicks: sum(rows, 'clicks'), orders: sum(rows, 'orders'), sales: sum(rows, 'sales'),
      nosale_spend: sum(nosale, 'spend'), nosale_n: nosale.length, look_n: look.length, look_spend: sum(look, 'spend'),
      blocked_n: rows.filter(r => r.state === 'blocked').length, sold_other_n: other.filter(r => r.orders >= 1).length,
      name_spend: sum(rows.filter(r => r.ours), 'spend') });
  }
  return { window: win, line: LINE, brands, terms, not_linked: notLinked, failed };
}

async function load(ctx) {
  const brands = (ctx.brands || []).filter(b => b.id);
  const { from, to } = ctx.range;
  const got = await Promise.all(brands.map(b => soft(ctx.api(`/api/google/ads-terms?act=${encodeURIComponent(b.id)}&from=${from}&to=${to}`, { worker: 'ah', signal: ctx.signal })
    .catch(e => { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; return { error: e.message || 'failed' }; }))
    .then(answer => ({ id: b.id, name: b.name, color: b.color, answer }))));
  return shape(got, { from, to });
}
async function sample(ctx) {
  const f = await ctx.fixture('search-terms.json');
  return shape(f.brands.map(b => ({ id: b.id, name: b.name, answer: b.error ? { error: b.error } : { terms: b.terms } })), f.window);
}

/* ---------- parts ---------- */
const STATE = { look: ['bad', 'Worth a look'], add: ['good', 'Worth adding'], keyword: ['off', 'Already a keyword'], blocked: ['off', 'Blocked'] };
const stateOf = r => (r.state ? statusDot(STATE[r.state][0], STATE[r.state][1]) : r.ours ? quiet('Our name') : '');
const roasOf = r => (r.orders >= 2 ? x(div(r.sales, r.spend)) : r.orders > 0 ? 'too few' : 'no sale');

function openTerm(r) {
  const f = (label, value, q) => h('span', null, h('small', null, label), h('b', { class: q ? 'q' : '' }, value));
  sheet({ title: r.term, body: h('div', { class: 'agt-sheet' },
    h('div', null, stateOf(r) || quiet('Nothing to do')),
    h('div', { class: 'agt-figs' },
      f('Spend', usd2(r.spend)), f('Clicks', num(r.clicks)), f('Cost per click', r.clicks > 0 ? usd2(r.spend / r.clicks) : 'No clicks', !(r.clicks > 0)),
      f('Orders, Google says', ord(r.orders)), f('Sales, Google says', money(Math.round(r.sales))), f('ROAS, Google says', roasOf(r), r.orders < 2)),
    h('div', { class: 'agt-kv' },
      h('span', null, 'Brand'), h('b', null, r.brand),
      h('span', null, 'Campaign'), h('b', null, r.where || 'Not given'),
      h('span', null, 'Ad group'), h('b', null, r.group || 'Not given'),
      r.flag ? [h('span', null, 'Note'), h('b', null, r.flag)] : null),
    h('p', { class: 'agt-note' }, r.state === 'look' ? `No order on ${usd2(r.spend)} of spend and it is not the brand's own name. If it has nothing to do with the brand, block it in Google Ads.`
      : r.state === 'add' ? 'It sold more than once and is not a keyword yet. Worth adding as its own keyword in Google Ads.'
      : 'Orders and sales here are what Google says. Triple Whale does not go down to the search term.'),
    button(`Open ${r.brand} search terms`, { href: brandHref(r.brand_id, 'google', 'search-terms'), icon: 'arrow' }),
    h('p', { class: 'agt-note' }, 'Nothing changes from this page.')) });
}

function termsCard(d, ctx) {
  const all = d.terms;
  const views = { look: all.filter(r => r.state === 'look'), sold: all.filter(r => !r.ours && r.orders >= 1), all };
  const cols = [
    { key: 'term', label: 'Search term', sortable: true, render: r => h('span', { class: 'agt-term' }, r.term, h('small', null, r.brand), r.flag && h('span', { class: 'gg-flag' }, statusDot('warn', r.flag))) },
    { key: 'brand', label: 'Brand', sortable: true, class: 'hide-sm', render: r => r.brand },
    { key: 'where', label: 'Where it ran', class: 'dim hide-md', render: r => r.where },
    { key: 'spend', label: 'Spend', num: true, sortable: true, class: 'strong', render: r => usd2(r.spend) },
    { key: 'clicks', label: 'Clicks', num: true, sortable: true, class: 'hide-md', render: r => num(r.clicks) },
    { key: 'orders', label: 'Orders', num: true, sortable: true, class: 'hide-sm', render: r => ord(r.orders) },
    { key: 'roas', label: 'ROAS', num: true, sortable: true, class: 'hide-sm', value: r => div(r.sales, r.spend) ?? 0, render: r => h('span', { class: r.orders >= 2 ? '' : 'dim' }, roasOf(r)) },
    { key: 'state', label: '', class: 'hide-sm', render: stateOf },
  ];
  const EMPTY = { look: `No search over $${d.line} without a sale. Nothing to block today.`, sold: 'No search outside the brand names sold on these dates', all: 'No search terms with spend on these dates' };
  const body = h('div'), quietLine = h('p', { class: 'gg-quiet', style: { paddingTop: '14px' } });
  const draw = view => {
    const rows = views[view];
    put(body, table({ rows, cols, roomy: false, sort: { key: view === 'sold' ? 'orders' : 'spend', dir: 'desc' }, onRow: openTerm, empty: EMPTY[view] }));
    quietLine.textContent = (view === 'look' ? `${rows.length} ${rows.length === 1 ? 'search' : 'searches'}, ${money(Math.round(sum(rows, 'spend')))}: over $${d.line} each, no order, not a brand's own name and not blocked yet. ` : '')
      + 'Tap a search for its numbers. Up to 50 searches a brand, the biggest by spend.';
  };
  let view = ctx.settingNow('agoogle.termsView', 'look'); if (!views[view]) view = 'look';
  draw(view);
  const seg = segmented([{ id: 'look', label: 'Worth a look' }, { id: 'sold', label: 'Sold, not our name' }, { id: 'all', label: 'All terms' }], view,
    id => { draw(id); ctx.saveSetting('agoogle.termsView', id).catch(() => {}); });
  return h('section', { class: 'lx-card flush gg-terms' },
    h('div', { class: 'lx-sec gg-termsh' }, h('h3', null, 'The searches, every brand'), h('span', { class: 'note' }, `${shortDay(d.window.from)} to ${shortDay(d.window.to)} · orders and sales are Google’s own count`), seg),
    body, quietLine);
}

function brandsCard(d, ctx) {
  const rows = d.brands.map(b => ({ ...b, href: brandHref(b.id, 'google', 'search-terms'), share: div(b.nosale_spend, b.spend) }));
  const total = { total: true, name: 'All brands', count: sum(rows, 'count'), spend: sum(rows, 'spend'), nosale_spend: sum(rows, 'nosale_spend'), look_n: sum(rows, 'look_n'), look_spend: sum(rows, 'look_spend'),
    blocked_n: sum(rows, 'blocked_n'), sold_other_n: sum(rows, 'sold_other_n') };
  total.share = div(total.nosale_spend, total.spend);
  const look = r => (r.look_n ? [String(r.look_n), h('span', { class: 'sub' }, money(Math.round(r.look_spend)))] : quiet('None'));
  const status = r => (r.look_n ? statusDot(r.share >= 0.25 ? 'bad' : 'warn', `${r.look_n} to look at`) : statusDot('good', 'Clean'));
  return brandRows({
    title: 'Brand by brand', note: `${shortDay(d.window.from)} to ${shortDay(d.window.to)}`, sort: { key: 'nosale_spend', dir: 'desc' }, rows, total,
    cols: [
      { key: 'name', label: 'Brand', class: 'name', render: r => (r.total ? r.name : brandName(r, ctx, r.href)) },
      { key: 'spend', label: 'Spend seen as terms', num: true, sortable: true, render: r => [money(Math.round(r.spend)), h('span', { class: 'sub' }, `${r.count} terms`)] },
      { key: 'nosale_spend', label: 'Went to no sale', num: true, sortable: true, class: 'strong', render: r => [money(Math.round(r.nosale_spend)), ok(r.share) ? h('span', { class: 'sub' }, pct(r.share)) : null] },
      { key: 'look_n', label: 'Worth a look', num: true, sortable: true, render: look },
      { key: 'blocked_n', label: 'Already blocked', num: true, class: 'hide-md', render: r => (r.blocked_n ? String(r.blocked_n) : quiet('None')) },
      { key: 'sold_other_n', label: 'Other searches that sold', num: true, class: 'hide-md', render: r => (r.sold_other_n ? String(r.sold_other_n) : quiet('None')) },
      { key: 'st', label: 'Status', render: r => (r.total ? '' : status(r)) },
    ],
    item: (r, isTotal) => ({ href: r.href, head: isTotal ? h('b', null, r.name) : brandName(r, ctx), tail: isTotal ? null : status(r),
      figs: [['Seen as terms', money(Math.round(r.spend))], ['No sale', money(Math.round(r.nosale_spend)) + (ok(r.share) ? ', ' + pct(r.share) : '')], ['Worth a look', r.look_n ? `${r.look_n}, ${money(Math.round(r.look_spend))}` : quiet('None')]] }),
  });
}

export default {
  title: 'Search terms, all brands',
  eyebrow: 'Google',
  load, sample,
  render(el, d, ctx) {
    style(); googleStyles(); addStyles('agt-css', CSS);
    const missing = d ? [d.not_linked && d.not_linked.length ? `Google Ads not connected: ${d.not_linked.join(', ')}.` : null,
      d.failed && d.failed.length ? `Did not answer: ${d.failed.join(', ')}.` : null].filter(Boolean).join(' ') : '';
    if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: 'No search terms with spend on these dates',
      text: ['Search and Shopping terms show here once a brand spends on them. Performance Max gives categories only.', missing].filter(Boolean).join(' ') }));
    const spend = sumOf(d.brands, b => b.spend), nosale = sumOf(d.brands, b => b.nosale_spend), lookN = sum(d.brands, 'look_n'), lookSpend = sum(d.brands, 'look_spend');
    const sold = sum(d.brands, 'sold_other_n'), worst = [...d.brands].sort((a, b) => b.look_spend - a.look_spend)[0];
    const W = `${shortDay(d.window.from)} to ${shortDay(d.window.to)}`, G = 'Google Ads', GS = "Google's own count";
    const hero = tiles([
      kpi({ label: 'Went to searches with no sale', value: money(Math.round(nosale)), sub: `${pct(div(nosale, spend))} of the ${money(Math.round(spend))} we can see as terms`, window: W, source: GS }),
      kpi({ label: 'Searches worth a look', value: String(lookN), sub: lookN ? `${money(Math.round(lookSpend))}, most on ${worst.name}` : `none over $${d.line} without a sale`, window: W, source: G }),
      kpi({ label: 'Other searches that sold', value: String(sold), sub: 'not counting a brand’s own name', window: W, source: GS }),
      kpi({ label: 'Brands read', value: String(d.brands.length), sub: d.not_linked.length || d.failed.length ? `${d.not_linked.length + d.failed.length} left out, named below` : 'up to 50 searches each', window: W, source: G }),
    ], { cols: 4 });
    ctx.askWindow = W;
    ctx.askContext = `Google search terms across every brand, ${W}: ${money(Math.round(nosale))} went to searches with no sale (Google's own count) out of ${money(Math.round(spend))} seen as terms; ${lookN} searches worth a look.`;
    const foot = h('p', { class: 'lx-foot' }, `Search and Shopping terms from Google Ads, the top 50 by spend for each brand, so this is not all of Google's spend: Performance Max gives categories only. Triple Whale does not go down to the search term, so a term's orders and sales are what Google says. "No sale" leaves out a brand's own name and anything already blocked. ${missing} Nothing changes from this page.`.replace(/\s+/g, ' '));
    put(el, h('div', { class: 'ag' }, headRow({ help: [{ title: 'What it is for', text: 'Every brand\'s Google search terms: which searches sold and which spent with no sale. Tap a term for its numbers.' }, { title: 'Where the numbers come from', text: foot.textContent }] }), hero, brandsCard(d, ctx), termsCard(d, ctx)));
  },
};
