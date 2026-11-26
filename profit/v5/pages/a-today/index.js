/* Agency > Today. What needs a person today, across every brand.
   Four counts, then every brand as the same card (the ones that need someone carry a pill and come first),
   then where Meta money went in the last 7 days, then today's meetings.
   Sales and MER are the whole store this month. Meta ROAS is Triple Whale, last platform click, last 7 days.
   Team only, above the brands: the one line on what already works in new Locus (dismissible on this device), and
   what waits on the team across every brand (the bell's list, loadWaiting in bell.js), read after the page draws. */

import { put } from '../../kit.js';
import { helpBar, dl } from '../home/_biz.js';
import { h, em, money, pct, x, pill, statusDot, delta, button, card, table, gauge, empty, kpi, addStyles, sourceLine, tiles } from '../../kit.js';
import { rangeOf } from '../../data.js';
import { primeRead, loadWaiting } from '../../bell.js';
import { liveNote } from '../my-day/_waiting.js';
import { waitingYes } from '../home/_yes.js';
import { rangeWords } from '../home/_biz.js';
import { style, world, readBrands, soft, paceOf, plat, ok, sumOf, figs, figures, brandName, brandHref, quiet, exampleChip, longDay, shortDay } from './_ag.js';

/* ---------- real mode ---------- */
async function load(ctx) {
  const month = rangeOf({ preset: 'month' }), week = rangeOf({ preset: '7d' });
  const opt = { signal: ctx.signal, worker: 'ah' };
  const [m, w, calls, reqs, sample] = await Promise.all([
    readBrands(ctx, month, { cmp: 'prev' }),
    soft(readBrands(ctx, week, { cmp: 'prev' })),
    soft(ctx.api('/api/buyer-list?act=all&ads=0', opt)),          // Meta calls waiting, and ads ready to load
    soft(ctx.api('/api/requests?act=all', opt)),                  // client requests waiting on the team
    world(),                                                      // meetings have no feed yet
  ]);
  primeRead('/api/buyer-list?act=all&ads=0', calls);     // the waiting card reads the same two routes: hand them over
  primeRead('/api/requests?act=all', reqs);
  /* the brand cards count Meta ad calls from the same list the Waiting card shows (one source, one word) */
  const sug = await callsByBrand(ctx);
  return {
    date: new Date().toLocaleDateString('en-CA'), window: m.window, rules: m.rules, brands: m.brands,
    week: w ? { from: w.window.from, to: w.window.to, rows: w.brands.map(b => { const p = plat(b, 'meta'); return { id: b.id, name: b.name, spend: p ? p.spend : null, before: b.prev ? b.prev.meta_spend : null, roas: p ? p.roas : null }; }).filter(r => r.spend > 0 || r.before > 0) } : null,
    sug,
    requests: reqs ? { waiting: reqs.waiting_team ?? null, old: null } : null,
    meetings: sample.today.meetings, meetings_example: true,
  };
}
/** Meta ad calls per brand from bell.js loadWaiting (the Waiting card's own list; in real mode it reuses the buyer list
    read primed above). null when the list could not be read, so the cards say nothing rather than a wrong count. */
async function callsByBrand(ctx) {
  const w = await loadWaiting({ brands: ctx.brands, role: ctx.role }).catch(() => null);
  if (!w || (w.failed || []).includes('ad calls')) return null;
  const by = {};
  for (const it of w.items || []) if (it.kind === 'calls' && it.act_id) by[it.act_id] = (by[it.act_id] || 0) + (+it.n || 1);
  return { by, total: Object.values(by).reduce((t, v) => t + v, 0) };
}
async function sample(ctx) {
  const [w, sug] = await Promise.all([world(), callsByBrand(ctx)]);
  return { date: w.today.date, window: w.window, rules: w.rules, brands: w.brands, week: w.week,
    sug,
    requests: { waiting: w.today.requests_waiting, old: w.today.requests_old }, meetings: w.today.meetings, meetings_example: false };
}

/* ---------- the page ---------- */
function render(el, d, ctx) {
  style(); addStyles('at-css', '.at-behind{display:grid;gap:4px;margin-top:4px}.at-behind a{color:var(--ink);font-size:13.5px;font-weight:500;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.at-behind a:hover{text-decoration:underline}.at-behind .ag-q{font-size:13px}'
    + '.at-src{padding:0 28px 12px}@media (max-width:759px){.at-src{padding:0 16px 10px}}');
  if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: 'No brands yet', text: 'When a brand is added it gets a card here.', action: button('Open agency settings', { href: ctx.href('a-settings', 'clients'), icon: 'arrow' }) }));
  const behindPct = d.rules.behind_pct;
  const list = d.brands.map(b => ({ ...b, st: paceOf(b, behindPct), calls: d.sug ? d.sug.by[b.id] || 0 : null, meta7: d.week && d.week.rows.find(r => r.id === b.id) }))
    .sort((a, b) => a.st.rank - b.st.rank || (a.st.pace ?? 9) - (b.st.pace ?? 9) || (b.calls || 0) - (a.calls || 0));
  const withStore = list.filter(b => b.store), behind = list.filter(b => b.st.tone === 'bad');

  /* the agency's numbers this month, the same tile look as the brand Home: label, value with unit, change against the
     same days before, window and source, an orange sparkline with its scale */
  const stores = withStore, dsum = (f) => stores.reduce((t, b) => t + (ok(f(b)) ? f(b) : 0), 0);
  const sales = stores.length ? dsum(b => b.sales) : null, sSpend = dsum(b => b.spend), spendAll = sumOf(d.brands, b => b.spend);
  const prevOf = f => { const v = stores.filter(b => b.prev).map(b => f(b.prev)); return v.length && v.length === stores.length ? v.reduce((t, n) => t + (+n || 0), 0) : null; };
  const pSales = prevOf(p => p.sales), pSpend = prevOf(p => p.spend), pAll = d.brands.every(b => b.prev) ? sumOf(d.brands, b => b.prev.spend) : null;
  const dates = [...new Set(d.brands.flatMap(b => (b.days || []).map(r => r.date)))].sort();
  const per = (list, k) => dates.map(dt => { let t = null; for (const b of list) { const r = (b.days || []).find(x => x.date === dt); if (r && ok(r[k])) t = (t || 0) + r[k]; } return t; });
  const dSales = per(stores, 'sales'), dSpendS = per(stores, 'spend'), dSpend = per(d.brands, 'spend');
  /* the compare window: the same number of days just before (readBrands cmp=prev), printed like Home: "vs Oct 7 to 31" */
  const prevWin = (() => {
    const w = d.window; if (!w || !w.from || !w.to) return null;
    const a = new Date(w.from + 'T12:00:00'), b = new Date(w.to + 'T12:00:00'), len = Math.round((b - a) / 864e5) + 1;
    const f = new Date(a); f.setDate(f.getDate() - len); const t = new Date(a); t.setDate(t.getDate() - 1);
    const iso = v => v.toLocaleDateString('en-CA'); return { from: iso(f), to: iso(t) };
  })();
  const lab = dates.map(shortDay), win = rangeWords(ctx, d.window), cmpWin = prevWin ? 'vs ' + rangeWords(ctx, prevWin) : '';
  const chg = (v, p, o = {}) => ok(v) && p > 0 ? [delta(v / p - 1, o.plain ? o : v < p ? { bad: true } : {}), h('span', { class: 'hm-vs' }, ' ' + cmpWin)] : null;
  const mer = sSpend > 0 && ok(sales) ? sales / sSpend : null, pMer = pSpend > 0 && ok(pSales) ? pSales / pSpend : null;
  const usd = v => money(v), xx = v => x(v);
  const hero = tiles([
    kpi({ label: 'Sales, all brands', value: ok(sales) ? usd(sales) : 'not tracked yet', delta: chg(sales, pSales), window: win, source: 'Triple Whale', spark: dSales, sparkLabels: lab, sparkFormat: usd, href: ctx.href('a-month', 'pace') }),
    kpi({ label: 'Ad spend, all brands', value: usd(spendAll), delta: chg(spendAll, pAll, { plain: true }), window: win, source: 'All ad platforms', spark: dSpend, sparkLabels: lab, sparkFormat: usd, href: ctx.href('a-platforms', 'side-by-side') }),
    kpi({ label: h('span', null, dl('MER', 'mer'), ', all brands'), value: mer != null ? xx(mer) : 'not tracked yet', delta: chg(mer, pMer), window: win, source: 'Triple Whale', spark: dSales.map((v, i) => ok(v) && dSpendS[i] > 0 ? v / dSpendS[i] : null), sparkLabels: lab, sparkFormat: xx, href: ctx.href('a-month', 'pace') }),
    /* the brands behind, by name, each a link to its Home (the tile itself is not a link, so the names can be) */
    kpi({ label: 'Brands behind plan', value: String(behind.length), sub: `of ${withStore.length} with a store connected`, window: win, source: 'Month plans' })], { cols: 4 });
  const behindTile = hero.lastElementChild;
  if (behindTile) behindTile.append(h('div', { class: 'at-behind' }, behind.length
    ? behind.slice(0, 4).map(b => h('a', { href: brandHref(b.id, 'home', 'index'), title: 'Open ' + b.name + ' Home' }, b.name))
    : h('span', { class: 'ag-q' }, 'Every brand is on or ahead of plan.')));

  /* every brand, the same card: one status style (a dot), one button style, and one "Needs your yes" badge with a
     strip on the top edge only when Meta suggestions wait on a person */
  const one = b => {
    const meta = b.meta7, tone = b.st.tone, needs = b.calls > 0;
    const next = !b.store ? ['Connect the store', brandHref(b.id, 'brand-settings', 'integrations')]
      : needs ? [`Review ${b.calls} Meta ad call${b.calls === 1 ? '' : 's'}`, brandHref(b.id, 'meta', 'suggestions')] : null;
    return h('section', { class: 'lx-card ag-bc' + (needs ? ' needs' : '') },
      h('div', { class: 'ag-bc-h' }, brandName({ ...b, goTitle: 'Open ' + b.name + ' Home' }, ctx, brandHref(b.id, 'home', 'index')),
        statusDot(tone === 'off' ? '' : tone, b.st.text)),
      h('div', null,
        h('div', { class: 'ag-bc-n' }, b.store ? [h('span', { class: 'lx-big' }, money(b.sales)), h('small', null, ok(b.plan_sales) ? `${pct(b.st.pace)} of plan ${money(b.plan_sales)}` : 'sales this month, no plan set')]
          : h('span', { class: 'w' }, 'No sales source connected')),
        h('div', { class: 'ag-bc-g' }, b.store && ok(b.plan_sales) ? gauge({ value: b.sales, goal: b.plan_sales, max: b.plan_sales * 1.4, tone: tone === 'off' ? '' : tone }) : null)),
      figs([
        /* one pattern for all three: short label, the value on one line, a small line under it (goal, or window); the windows are in the section note and the label titles */
        ['Store MER', b.store ? x(b.mer) : quiet('no data'), b.store && ok(b.goal_mer) ? 'goal ' + x(b.goal_mer) : b.store ? 'this month' : null, 'Whole store sales over all ad spend this month, Triple Whale'],
        ['Meta ROAS', meta && ok(meta.roas) ? x(meta.roas) : quiet(meta && meta.spend > 0 ? 'no sales source' : 'ads off'), meta && ok(meta.roas) ? 'last 7 days' : null, 'Sales Triple Whale credits to Meta, last click, over Meta spend, last 7 days'],
        ['Ad spend', money(b.spend), 'this month', 'Every ad platform, this month'],
      ]),
      h('div', { class: 'ag-bc-a' }, needs ? h('span', { class: 'ag-needs' }, 'Needs your yes') : null, next ? button(next[0], { href: next[1], icon: 'arrow' }) : quiet(needs || b.calls == null ? '' : 'Nothing to decide'),
        h('span', { class: 'lx-sp' }), button('Open Home', { ghost: true, href: brandHref(b.id, 'home', 'index'), title: 'Open ' + b.name + ' Home' })));
  };
  const cards = h('div', null,
    h('div', { class: 'lx-sec', style: { marginBottom: '16px', flexWrap: 'wrap' } }, h('h3', null, 'Which brand needs someone first?'), h('span', { class: 'note' }, `Behind plan first. Sales, MER and ad spend this month through ${shortDay(d.window.to)}; Meta ROAS the last 7 days. Triple Whale.`)),
    h('div', { class: 'ag-grid three' }, list.map(one)));

  /* where Meta money went in the last 7 days */
  let weekCard = null;
  if (d.week && d.week.rows.length) {
    const rows = [...d.week.rows].sort((a, b) => (b.spend || 0) - (a.spend || 0)), top = Math.max(...rows.map(r => r.spend || 0), 1);
    const change = r => r.before > 0 && ok(r.spend) ? r.spend / r.before - 1 : null;
    const total = { total: true, name: 'All brands', spend: sumOf(rows, r => r.spend), before: sumOf(rows, r => r.before) };
    weekCard = card({ title: 'Where did Meta money go this week?', note: `${shortDay(d.week.from)} to ${shortDay(d.week.to)}, against the 7 days before`, flush: true,
      action: h('a', { href: ctx.href('a-meta', 'overview') }, 'Meta by brand') },
      h('div', { class: 'at-src' }, sourceLine(null, 'Spend from Meta, sales credited by Triple Whale, last click')),
      table({ roomy: true, total,
        cols: [
          { key: 'name', label: 'Brand', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, brandHref(r.id, 'meta', 'overview')) },
          { key: 'bar', label: '', class: 'hide-sm', width: '42%', render: r => r.total ? '' : h('span', { class: 'ag-bar' }, h('span', { class: 'lx-cellbar', style: { '--v': (100 * (r.spend || 0) / top).toFixed(1) + '%' } })) },
          { key: 'spend', label: 'Spend', num: true, class: 'strong', render: r => money(r.spend) },
          { key: 'roas', label: h('span', null, dl('ROAS', 'roas'), ', Triple Whale last click'), num: true, class: 'hide-sm', render: r => r.total ? '' : ok(r.roas) ? x(r.roas) : quiet('no sales source') },
          { key: 'change', label: 'Change', num: true, render: r => { const c = change(r); return c == null ? quiet('new') : Math.abs(c) < 0.005 ? quiet('0%') : delta(c, { plain: true }); } },
        ], rows }));
  }

  /* meetings today */
  const meet = d.meetings && d.meetings.length ? card({ title: 'Meetings today', note: d.meetings_example ? exampleChip() : null, action: button('Open agenda', { href: ctx.href('a-meetings', 'agenda') }) },
    h('div', { class: 'lx-rows' }, d.meetings.map(m => h('div', null, h('b', { style: { minWidth: '52px', fontVariantNumeric: 'tabular-nums' } }, m.time), h('span', { style: { flex: '1', minWidth: '0' } }, m.title), statusDot(m.state === 'ready' ? 'good' : 'warn', m.note))))) : null;

  const help = helpBar([
    { title: 'What it is for', text: 'How every brand is doing this month, everything that waits on a yes, and which brand needs someone first.' },
    { title: 'How it is counted', text: 'Sales and store MER are the whole store, this month through yesterday. Meta ROAS is one platform: Triple Whale, last platform click, last 7 days. A brand with no sales source shows no sales figure.' },
    { title: 'The brand cards', text: 'Every brand gets the same card. "Needs your yes" and the orange edge mean Meta ad calls wait on a person; the button opens them on that brand\'s Meta page. Open Home opens the brand\'s Home.' },
    { title: 'Waiting on your yes', text: 'Everything that waits on a person, every kind in one list: alerts, War Room check-ins, Meta ad calls, client updates to send, ads to review or load, client requests and what automations left. Each row says its kind and has its own button.' },
  ]);
    ctx.askContext = `Agency Today, ${win}: sales ${ok(sales) ? usd(sales) : 'not tracked'} across ${stores.length} stores, ad spend ${usd(spendAll)}, MER ${mer != null ? xx(mer) : 'not tracked'}. ${behind.length} brand${behind.length === 1 ? '' : 's'} behind plan.`;
  put(el, h('div', { class: 'ag' }, help, hero, liveNote(ctx), waitingYes(ctx, { max: 8 }), cards, weekCard, meet));
}

export default {
  title: ['What needs ', em('a person today?')],
  eyebrow: (ctx, d) => d && d.date ? 'Today, ' + longDay(d.date) : 'Today',
  ranges: false,
  load, sample, render,
};
