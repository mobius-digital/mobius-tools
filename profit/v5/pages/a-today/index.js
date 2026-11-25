/* Agency > Today. What needs a person today, across every brand.
   Four counts, then every brand as the same card (the ones that need someone carry a pill and come first),
   then where Meta money went in the last 7 days, then today's meetings.
   Sales and MER are the whole store this month. Meta ROAS is Triple Whale, last platform click, last 7 days. */

import { put } from '../../kit.js';
import { h, em, money, pct, x, pill, statusDot, delta, button, card, table, gauge, empty } from '../../kit.js';
import { rangeOf } from '../../data.js';
import { homeNotices } from '../automations/_notices.js';
import { style, world, readBrands, soft, paceOf, plat, ok, sumOf, figs, figures, brandName, brandHref, quiet, exampleChip, longDay, shortDay } from './_ag.js';

/* ---------- real mode ---------- */
async function load(ctx) {
  const month = rangeOf({ preset: 'month' }), week = rangeOf({ preset: '7d' });
  const opt = { signal: ctx.signal, worker: 'ah' };
  const [m, w, calls, reqs, sample] = await Promise.all([
    readBrands(ctx, month, { cmp: 'none' }),
    soft(readBrands(ctx, week, { cmp: 'prev' })),
    soft(ctx.api('/api/buyer-list?act=all&ads=0', opt)),          // Meta calls waiting, and ads ready to load
    soft(ctx.api('/api/requests?act=all', opt)),                  // client requests waiting on the team
    world(),                                                      // meetings have no feed yet
  ]);
  const rows = calls && Array.isArray(calls.rows) ? calls.rows.filter(r => !r.decided) : null;
  const by = {}; let loadAds = 0;
  for (const r of rows || []) { if (r.kind === 'launch') loadAds++; else by[r.act_id] = (by[r.act_id] || 0) + 1; }
  return {
    date: new Date().toLocaleDateString('en-CA'), window: m.window, rules: m.rules, brands: m.brands,
    week: w ? { from: w.window.from, to: w.window.to, rows: w.brands.map(b => { const p = plat(b, 'meta'); return { id: b.id, name: b.name, spend: p ? p.spend : null, before: b.prev ? b.prev.meta_spend : null, roas: p ? p.roas : null }; }).filter(r => r.spend > 0 || r.before > 0) } : null,
    sug: rows ? { by, total: Object.values(by).reduce((t, v) => t + v, 0), load: loadAds } : null,
    requests: reqs ? { waiting: reqs.waiting_team ?? null, old: null } : null,
    meetings: sample.today.meetings, meetings_example: true,
  };
}
async function sample() {
  const w = await world(), by = {}; let loadAds = 0;
  for (const r of w.suggestions.meta) { if (r.kind === 'launch') loadAds++; else by[r.brand_id] = (by[r.brand_id] || 0) + 1; }
  return { date: w.today.date, window: w.window, rules: w.rules, brands: w.brands, week: w.week,
    sug: { by, total: Object.values(by).reduce((t, v) => t + v, 0), load: loadAds },
    requests: { waiting: w.today.requests_waiting, old: w.today.requests_old }, meetings: w.today.meetings, meetings_example: false };
}

/* ---------- the page ---------- */
function render(el, d, ctx) {
  style();
  if (!d || !d.brands || !d.brands.length) return put(el, empty({ title: 'No brands yet', text: 'When a brand is added it gets a card here.', action: button('Open agency settings', { href: ctx.href('a-settings', 'clients'), icon: 'arrow' }) }));
  const behindPct = d.rules.behind_pct;
  const list = d.brands.map(b => ({ ...b, st: paceOf(b, behindPct), calls: d.sug ? d.sug.by[b.id] || 0 : null, meta7: d.week && d.week.rows.find(r => r.id === b.id) }))
    .sort((a, b) => a.st.rank - b.st.rank || (a.st.pace ?? 9) - (b.st.pace ?? 9) || (b.calls || 0) - (a.calls || 0));
  const withStore = list.filter(b => b.store), behind = list.filter(b => b.st.tone === 'bad');

  const hero = figures([
    d.sug && { label: 'Suggestions to decide', value: String(d.sug.total), sub: `across ${Object.keys(d.sug.by).length} brand${Object.keys(d.sug.by).length === 1 ? '' : 's'}`, href: ctx.href('a-meta', 'suggestions'), lead: true },
    d.requests && ok(d.requests.waiting) && { label: 'Requests waiting on us', value: String(d.requests.waiting), sub: d.requests.old ? `${d.requests.old} older than 2 days` : 'from clients', href: ctx.href('a-requests', 'index') },
    d.sug && { label: 'Batches of ads to load', value: String(d.sug.load), sub: 'approved and ready', href: ctx.href('a-meta', 'load-ads') },
    { label: 'Brands behind plan', value: String(behind.length), sub: `of ${withStore.length} with a store connected`, href: ctx.href('a-month', 'pace') },
  ]);

  /* every brand, the same card */
  let primaryUsed = false;
  const one = b => {
    const meta = b.meta7, tone = b.st.tone;
    const next = !b.store ? ['Connect store', brandHref(b.id, 'brand-settings', 'integrations')]
      : b.calls > 0 ? [`Review ${b.calls}`, brandHref(b.id, 'meta', 'suggestions')] : null;
    const first = next && b.st.act && !primaryUsed; if (first) primaryUsed = true;
    return h('section', { class: 'lx-card ag-bc' },
      h('div', { class: 'ag-bc-h' }, brandName(b, ctx, brandHref(b.id, 'home', 'index')), b.st.act ? pill(tone, b.st.text) : statusDot(tone, b.st.text)),
      h('div', null,
        h('div', { class: 'ag-bc-n' }, b.store ? [h('span', { class: 'lx-big' }, money(b.sales)), h('small', null, ok(b.plan_sales) ? `${pct(b.st.pace)} of plan ${money(b.plan_sales)}` : 'sales this month, no plan set')]
          : h('span', { class: 'w' }, 'No sales source connected')),
        h('div', { class: 'ag-bc-g' }, b.store && ok(b.plan_sales) ? gauge({ value: b.sales, goal: b.plan_sales, max: b.plan_sales * 1.4, tone: tone === 'off' ? '' : tone }) : null)),
      figs([
        ['MER, whole store', b.store ? x(b.mer) + (ok(b.goal_mer) ? ` of ${x(b.goal_mer)}` : '') : quiet('no data')],
        ['Meta ROAS, 7 days', meta && ok(meta.roas) ? x(meta.roas) : quiet(meta && meta.spend > 0 ? 'no sales source' : 'ads off')],
        ['Ad spend, month', money(b.spend)],
      ]),
      h('div', { class: 'ag-bc-a' }, next ? button(next[0], { primary: first, href: next[1], icon: 'arrow' }) : quiet(b.calls === 0 ? 'Nothing to decide' : ''),
        h('span', { class: 'lx-sp' }), button('Open brand', { ghost: true, href: brandHref(b.id, 'home', 'index') })));
  };
  const cards = h('div', null,
    h('div', { class: 'lx-sec', style: { marginBottom: '16px', flexWrap: 'wrap' } }, h('h3', null, 'Which brand needs someone first?'), h('span', { class: 'note' }, `Behind plan first. This month through ${shortDay(d.window.to)}.`)),
    h('div', { class: 'ag-grid' }, list.map(one)));

  /* where Meta money went in the last 7 days */
  let weekCard = null;
  if (d.week && d.week.rows.length) {
    const rows = [...d.week.rows].sort((a, b) => (b.spend || 0) - (a.spend || 0)), top = Math.max(...rows.map(r => r.spend || 0), 1);
    const change = r => r.before > 0 && ok(r.spend) ? r.spend / r.before - 1 : null;
    const total = { total: true, name: 'All brands', spend: sumOf(rows, r => r.spend), before: sumOf(rows, r => r.before) };
    weekCard = card({ title: 'Where did Meta money go this week?', note: `${shortDay(d.week.from)} to ${shortDay(d.week.to)}, against the 7 days before`, flush: true,
      action: h('a', { href: ctx.href('a-meta', 'overview') }, 'Meta by brand') },
      table({ roomy: true, rowHeight: 52, total,
        cols: [
          { key: 'name', label: 'Brand', class: 'name', render: r => r.total ? r.name : brandName(r, ctx, brandHref(r.id, 'meta', 'overview')) },
          { key: 'bar', label: '', class: 'hide-sm', width: '42%', render: r => r.total ? '' : h('span', { class: 'ag-bar' }, h('span', { class: 'lx-cellbar', style: { '--v': (100 * (r.spend || 0) / top).toFixed(1) + '%' } })) },
          { key: 'spend', label: 'Spend', num: true, class: 'strong', render: r => money(r.spend) },
          { key: 'roas', label: 'ROAS', num: true, class: 'hide-sm', render: r => r.total ? '' : ok(r.roas) ? x(r.roas) : quiet('no sales source') },
          { key: 'change', label: 'Change', num: true, render: r => { const c = change(r); return c == null ? quiet('new') : Math.abs(c) < 0.005 ? quiet('0%') : delta(c, { plain: true }); } },
        ], rows }));
  }

  /* meetings today */
  const meet = d.meetings && d.meetings.length ? card({ title: 'Meetings today', note: d.meetings_example ? exampleChip() : null, action: button('Open agenda', { href: ctx.href('a-meetings', 'agenda') }) },
    h('div', { class: 'lx-rows' }, d.meetings.map(m => h('div', null, h('b', { style: { minWidth: '52px', fontVariantNumeric: 'tabular-nums' } }, m.time), h('span', { style: { flex: '1', minWidth: '0' } }, m.title), statusDot(m.state === 'ready' ? 'good' : 'warn', m.note))))) : null;

  const foot = h('p', { class: 'lx-foot' }, 'Sales and MER are the whole store, this month through yesterday. Meta ROAS is one platform: Triple Whale, last platform click, last 7 days. A brand with no sales source shows no sales figure.');
  put(el, h('div', { class: 'ag' }, hero, homeNotices(ctx), cards, weekCard, meet, foot));
}

export default {
  title: ['What needs ', em('a person today?')],
  eyebrow: (ctx, d) => d && d.date ? 'Today, ' + longDay(d.date) : 'Today',
  ranges: false,
  load, sample, render,
};
