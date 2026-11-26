/* Business > Website > SEO. "Who finds the store on Google?"
   Live, one read: GET /api/google/search?act&from&to&pfrom&pto on the account-health worker (Google Search Console
   for the brand's site: clicks, impressions, click rate and position against the days before, by day, the top
   searches split into the brand's own name against everything else, and the top pages). Cached an hour there.
   Search Console runs two to three days behind, so the last days of a range can read low. */

import { put } from '../../kit.js';
import { askWhy, helpBar, rangeWords } from '../home/_biz.js';
import { h, em, card, kpi, kpis, delta, takeaway, button, table, legend, lineChart, segmented, skeleton } from '../../kit.js';
import { ok, move, shortDate, noteAt, css, head, barCell, split, before, notConnected, num, pct } from '../email/_em.js';

const path = u => { try { return new URL(u).pathname.replace(/\/$/, '') || '/'; } catch { return String(u || '') || '/'; } };
const pos = v => (ok(v) ? v.toFixed(1) : '');

/* ---------- real mode: shaped like the fixture ---------- */
function shape(ctx, r) {
  if (!r || r.error) return { connected: false, error: r && r.error };
  const c = r.cur || {}, p = r.prev || {};
  return {
    connected: true, range: { from: ctx.range.from, to: ctx.range.to }, site: r.site,
    totals: { clicks: c.clicks, clicks_prev: p.clicks, impressions: c.impressions, impressions_prev: p.impressions,
      ctr: c.ctr, ctr_prev: p.ctr, position: c.position, position_prev: p.position },
    split: r.split || null,
    days: (r.days || []).map(d => ({ date: d.date, clicks: d.clicks, impressions: d.impressions })),
    queries: r.queries || [], pages: (r.pages || []).map(x => ({ ...x, page: path(x.page) })), note: null,
  };
}

/* ---------- parts ---------- */
function figures(d) {
  const t = d.totals || {};
  const dl = (v, bad) => (ok(v) && Math.abs(v) >= 0.005 ? delta(v, { bad: bad ? v > 0 : v < 0 }) : null);
  const dPos = ok(t.position) && ok(t.position_prev) ? t.position - t.position_prev : null;
  const el = kpis([
    kpi({ label: 'Clicks from Google', size: 'lg', value: ok(t.clicks) ? num(t.clicks) : 'no data', delta: dl(move(t.clicks, t.clicks_prev)),
      sub: ok(t.clicks_prev) ? 'was ' + num(t.clicks_prev) : null, spark: (d.days || []).map(r => r.clicks) }),
    kpi({ label: 'Times shown', size: 'lg', value: ok(t.impressions) ? num(t.impressions) : 'no data', delta: dl(move(t.impressions, t.impressions_prev)),
      sub: 'in Google results', spark: (d.days || []).map(r => r.impressions) }),
    kpi({ label: 'Click rate', size: 'lg', value: ok(t.ctr) ? pct(t.ctr, { digits: 1 }) : 'no data', delta: dl(move(t.ctr, t.ctr_prev)),
      sub: ok(t.ctr_prev) ? 'was ' + pct(t.ctr_prev, { digits: 1 }) : null }),
    kpi({ label: 'Average position', size: 'lg', value: ok(t.position) ? pos(t.position) : 'no data',
      delta: ok(dPos) && Math.abs(dPos) >= 0.1 ? delta(-dPos, { bad: dPos > 0, text: (dPos < 0 ? 'up ' : 'down ') + Math.abs(dPos).toFixed(1) }) : null,
      sub: ok(t.position_prev) ? 'was ' + pos(t.position_prev) + ', lower is better' : 'lower is better' }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

function verdict(d, ctx) {
  const t = d.totals || {}, sp = d.split;
  if (!ok(t.clicks) || !(t.clicks > 0)) return null;
  const b = v => h('b', null, v), parts = ['Google sent ', b(num(t.clicks)), ' clicks'];
  if (sp && sp.brand && sp.other && sp.brand.clicks + sp.other.clicks > 0) parts.push(', and ', b(pct(sp.other.clicks / (sp.brand.clicks + sp.other.clicks))), ' came from people who did not search the brand\'s name');
  parts.push('.');
  const near = (d.queries || []).filter(q => !q.brand && q.position > 10 && q.position <= 20).sort((a, z) => z.impressions - a.impressions)[0];
  if (near) parts.push(' ', b('"' + near.query + '"'), ' is shown ', b(num(near.impressions)), ' times at position ', b(pos(near.position)), ': page two.');
  return takeaway(parts, { action: ctx.isClient ? null : askWhy(ctx, 'Who finds the store on Google') });
}

function chartCard(d) {
  const days = d.days || [];
  if (days.length < 2) return null;
  const b = v => h('b', null, v), imp = days.some(r => ok(r.impressions));
  const top = imp ? Math.max(...days.map(r => r.impressions || 0)) : 0;
  const nice = top > 0 ? Math.ceil(top / Math.pow(10, Math.floor(Math.log10(top)))) * Math.pow(10, Math.floor(Math.log10(top))) : 1;
  return card({ class: 'em-chart' },
    head('Clicks by day', 'From Google search, not ads', legend([{ name: 'Clicks', lead: true }, imp && { name: 'Times shown (right)' }])),
    lineChart({
      series: [{ name: 'Clicks', lead: true, values: days.map(r => r.clicks) }, imp && { name: 'Times shown', axis: 'right', values: days.map(r => r.impressions), end: false }],
      labels: days.map(r => shortDate(r.date)), note: noteAt(days, d.note), format: v => num(v), endFormat: v => num(v), height: 340, phoneHeight: 290,
      y2: imp ? { max: nice, format: v => num(v) } : null,
      label: 'Clicks from Google search by day' + (imp ? ', with times shown' : ''),
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Clicks ', b(num(days[i].clicks))), ok(days[i].impressions) && h('span', null, 'Shown ', b(num(days[i].impressions)))],
    }));
}

function splitCard(d) {
  const sp = d.split;
  if (!sp || !sp.brand || !sp.other || !(sp.brand.clicks + sp.other.clicks > 0)) return null;
  const all = sp.brand.clicks + sp.other.clicks;
  return card({ title: 'Searched the name, or found the store', note: `${pct(sp.other.clicks / all)} of clicks were not the brand's name` },
    split([
      { name: 'Searched something else', value: sp.other.clicks, text: num(sp.other.clicks), color: 'var(--ink)' },
      { name: 'Searched the brand\'s name', value: sp.brand.clicks, text: num(sp.brand.clicks), color: 'var(--icon)' },
    ], 'Clicks from searches for the brand against other searches'));
}

function queriesCard(d, ctx) {
  const all = d.queries || [];
  if (!all.length) return card({ title: 'What people searched' }, notConnected(ctx, { title: 'No searches for these dates', text: 'Search Console runs two to three days behind. Pick a longer range.' }));
  let pick = 'other';
  const list = () => (pick === 'all' ? all : all.filter(q => (pick === 'brand' ? q.brand : !q.brand)));
  const max = () => Math.max(...list().map(q => q.clicks || 0), 1);
  const cols = [
    { key: 'query', label: 'Search', sortable: true, render: q => h('span', { class: 'em-name', title: q.query }, q.query, pick === 'all' && q.brand ? h('span', { class: 'em-tag' }, 'name') : null) },
    { key: 'clicks', label: 'Clicks', num: true, sortable: true, render: q => barCell(h('span', { class: 'strong' }, num(q.clicks)), (q.clicks || 0) / max()) },
    { key: 'impressions', label: 'Shown', num: true, sortable: true, class: 'hide-sm', render: q => num(q.impressions) },
    { key: 'ctr', label: 'Click rate', num: true, sortable: true, class: 'hide-sm', render: q => pct(q.ctr, { digits: 1 }) },
    { key: 'position', label: 'Position', num: true, sortable: true, render: q => pos(q.position) },
  ];
  const t = table({ rows: list(), cols, sort: { key: 'clicks', dir: 'desc' } });
  const seg = segmented([{ id: 'other', label: 'Not the name' }, { id: 'brand', label: 'The name' }, { id: 'all', label: 'All' }], pick, id => { pick = id; t.setRows(list()); });
  return card({ title: 'What people searched', note: 'top searches', flush: true, class: 'em-flush em-wrap' }, h('div', { class: 'em-tools' }, seg), t);
}

function pagesCard(d) {
  const rows = d.pages || [];
  if (!rows.length) return null;
  const max = Math.max(...rows.map(r => r.clicks || 0), 1);
  return card({ title: 'Pages Google sends people to', flush: true, class: 'em-flush em-wrap' },
    table({ rows, sort: { key: 'clicks', dir: 'desc' }, cols: [
      { key: 'page', label: 'Page', sortable: true, render: r => h('span', { class: 'em-name', title: r.page }, r.page === '/' ? 'The home page' : r.page) },
      { key: 'clicks', label: 'Clicks', num: true, sortable: true, render: r => barCell(num(r.clicks), (r.clicks || 0) / max) },
      { key: 'impressions', label: 'Shown', num: true, sortable: true, class: 'hide-sm', render: r => num(r.impressions) },
      { key: 'ctr', label: 'Click rate', num: true, sortable: true, class: 'hide-md', render: r => pct(r.ctr, { digits: 1 }) },
      { key: 'position', label: 'Position', num: true, sortable: true, render: r => pos(r.position) },
    ] }));
}

export default {
  title: ['Who finds the store ', em('on Google?')],
  eyebrow: 'Website',

  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const p = before(ctx.range);
    try {
      const r = await ctx.api(`/api/google/search?act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}&pfrom=${p.from}&pto=${p.to}`, { worker: 'ah', signal: ctx.signal });
      return shape(ctx, r);
    } catch (e) { if (ctx.signal && ctx.signal.aborted) throw e; return { connected: false, error: e.message }; }
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css();
    d = d || {};
    if (d.connected === false) {
      put(el, notConnected(ctx, { title: 'Search Console is not linked',
        text: 'Google search numbers show here once the store\'s Search Console is linked.',
        teamText: 'Link the brand\'s Search Console site in Brand settings, Integrations (share the site with the service account first), and searches show here.' }));
      return;
    }
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'Who finds the store on Google search: clicks, what people searched and which pages Google sends them to.' },
        { title: 'Where the numbers come from', text: 'Google Search Console: free search results only, not ads. Search Console runs two to three days behind, so the last days can read low.' },
      ], h('span', { class: 'bz-chip' }, rangeWords(ctx, d.range))),
      h('section', { class: 'lx-hero line' }, figures(d)),
      verdict(d, ctx),
      chartCard(d),
      splitCard(d),
      queriesCard(d, ctx),
      pagesCard(d),
    ].filter(Boolean));
  },
};
