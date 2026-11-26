/* Shared by Meta > Live now, Top ads, Suggestions and Changes made: small helpers, the states, the
   local parts the kit does not have (an ad picture tile, the "example" chip) and their layout CSS.
   Every sale, ROAS and cost per sale on these pages is Triple Whale's (last click per platform).
   Spend, budgets and delivery are Meta's. No ember in here. */

import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, svgNode, money, num, pct, x, empty, button, statusDot, gauge, addStyles, sheet, lineChart, legend, put } from '../../kit.js';
import { def, levelChip } from '../platforms/_ads.js';
import { APP_NAME } from '../../config.js';

export const ok = n => n != null && isFinite(n);
export const usd = (n, cur) => money(ok(n) ? Math.round(n) : n, { cur });
export const div = (a, b) => (ok(a) && ok(b) && b > 0 ? a / b : null);
export const sum = (rows, k) => rows.reduce((t, r) => t + (+r[k] || 0), 0);
export const iso = d => d.toISOString().slice(0, 10);
export const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const shortDate = date => new Date(String(date).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export const weekDate = date => new Date(String(date).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
export const hourWord = hr => (hr % 24 === 0 ? '12am' : hr === 12 ? 'Noon' : hr < 12 ? hr + 'am' : (hr - 12) + 'pm');
/** A failed side read must not take the page down; a canceled one still stops the load. */
export const soft = p => Promise.resolve(p).catch(e => { if (e && e.name === 'AbortError') throw e; return null; });

/** One ad against the brand's goal. The agency's rule: wait until twice the goal cost is spent and 3 days have passed. */
export function judge(a, g = {}) {
  if (a.lead) return null;
  const need = g.cpa ? g.cpa * 2 : null;
  if ((need && (a.spend || 0) < need) || (ok(a.age) && a.age < 3)) return ['off', 'Too early'];
  if (g.roas && ok(a.roas)) { const r = a.roas / g.roas; return r >= 1 ? ['good', 'Winning'] : r >= 0.85 ? ['warn', 'Just under'] : ['bad', 'Losing']; }
  if (g.cpa && ok(a.cpa)) { const r = a.cpa / g.cpa; return r <= 1 ? ['good', 'Winning'] : r <= 1.2 ? ['warn', 'Just over'] : ['bad', 'Losing']; }
  if (!(a.purchases > 0) && a.spend > 0 && (g.roas || g.cpa)) return ['bad', 'Losing'];
  return null;
}
export const TONE_OF = { good: 'good', warn: 'warn', bad: 'bad' };

/** ROAS on a track with the goal tick. */
export function roasBar(roas, goal, tone) {
  if (!ok(roas) || !goal) return null;
  return gauge({ value: roas, max: Math.max(goal * 1.6, roas * 1.05), goal, thin: true, tone: tone || '' });
}

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 8.5v7l6-3.500z" fill="currentColor"/></svg>';
const PIC = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3.500" y="5" width="17" height="14" rx="2"/><path d="M4 16l4.500-4.500 4 4 2.500-2.500L20 17"/><circle cx="15.500" cy="9.500" r="1.200"/></svg>';
/** The ad's picture. Shows the cover when the data carries one, else a quiet tile that says video or image. */
export function adTile(a = {}, cls = '') {
  const el = h('span', { class: 'mr-tile ' + cls, role: 'img', 'aria-label': (a.video ? 'Video ad: ' : 'Image ad: ') + (a.name || '') }, svgNode(a.video ? PLAY : PIC));
  if (a.thumb) {
    const img = h('img', { src: a.thumb, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.remove(), { once: true });
    el.append(img);
  }
  return el;
}

/** The small chip on a part that has no data feed yet. */
export const exampleChip = kitExampleChip; /* one version, in the kit */

/** The states every one of these pages shares. Returns a node to show instead of the page, or null. */
export function gate(d, ctx, what) {
  if (!ctx.brand) return empty({ title: 'Pick a brand', text: what + ' is one brand at a time.' });
  if (!d || d.connected === false) {
    return empty({ title: 'No Meta ad account connected', text: (d && d.error) || 'Connect this brand\'s Meta ad account and this page fills in.',
      action: ctx.isClient ? null : button('Open integrations', { primary: true, href: ctx.href('brand-settings', 'integrations') }) });
  }
  return null;
}
export const oldLink = (ctx, label) => (!ctx.isClient && ctx.legacy ? button(label || 'Open it in old ' + APP_NAME, { href: ctx.legacy }) : null);
export { statusDot, x };

const CSS = `
.mr-row,.mr-grid,.mr-list,.mr-kp{min-width:0}
.mr-eg{height:22px;font-size:11.5px;font-weight:500}
.mr-bar{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.mr-bar .sp{flex:1}
.mr-bar .mr-note{color:var(--muted);font-size:13px}
.mr-tile{position:relative;display:grid;place-items:center;overflow:hidden;flex:none;border-radius:12px;background:var(--bg-sunk);color:var(--faint)}
.mr-tile svg{width:24px;height:24px}
.mr-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mr-tile.sm{width:56px;height:70px}.mr-tile.xs{width:32px;height:40px;border-radius:8px}.mr-tile.xs svg{width:16px;height:16px}
.mr-tile.lg{width:76px;height:95px}
.mr-kp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-8)}
.mr-kp .lx-kpi .v{font-size:var(--num-xl)}
.mr-kp .lx-kpi .v small{font-size:14px}
.mr-n{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}
.mr-dim{color:var(--muted)}.mr-faint{color:var(--faint)}
.mr-num{font-variant-numeric:tabular-nums;white-space:nowrap}
.mr-more{display:flex;justify-content:center;padding:6px 0 0}
.ads-open{cursor:pointer;transition:background .12s,box-shadow .12s}
.ads-open:focus-visible{outline:2px solid var(--ink-2);outline-offset:2px}
@media (max-width:759px){
  .mr-kp{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-5)}
  .mr-kp .lx-kpi .v{font-size:var(--num-l)}
  .mr-kp>:last-child:nth-child(odd){grid-column:1/-1}
  .mr-bar{gap:10px}
}`;
export function styles(id, extra) {
  addStyles('mr-css', CSS);
  if (id && extra) addStyles(id, extra);
}

/* ---------- one ad, all of its numbers (Top ads, Live now, Suggestions share it) ---------- */
const SH_CSS = `
.ad-sh{display:grid;gap:20px;min-width:0}
.ad-sh .top{display:grid;grid-template-columns:120px minmax(0,1fr);gap:18px;align-items:center}
.ad-sh .top .mr-tile{width:120px;height:150px}
.ad-sh .top b{display:block;font-size:17px;font-weight:600;letter-spacing:-.02em;line-height:1.25;overflow-wrap:anywhere}
.ad-sh .top .w{display:grid;gap:4px;margin-top:6px;color:var(--muted);font-size:13px;overflow-wrap:anywhere}
.ad-sh .g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.ad-sh .g>div{display:grid;gap:3px;align-content:start;min-width:0;padding:12px 14px;border-radius:12px;background:var(--surface-2)}
.ad-sh .g .l{font-size:12px;color:var(--muted)}
.ad-sh .g .v{font-size:var(--num-m);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.ad-sh .g .v.bad{color:var(--bad)}.ad-sh .g .v.good{color:var(--good)}
.ad-sh .g .s{font-size:12px;color:var(--muted)}
.ad-sh h3{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--muted)}
.ad-sh .set{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:12px 14px;border-radius:12px;box-shadow:inset 0 0 0 1px var(--line-strong);font-size:13px}
.ad-sh .set span{display:grid;gap:2px;color:var(--muted)}.ad-sh .set b{font-variant-numeric:tabular-nums;color:var(--ink)}
.ad-sh .go{display:flex;gap:10px;flex-wrap:wrap}
.ad-sh .na{color:var(--muted);font-size:13px}
@media (max-width:759px){.ad-sh .g,.ad-sh .set{grid-template-columns:repeat(2,minmax(0,1fr))}.ad-sh .top{grid-template-columns:84px minmax(0,1fr)}.ad-sh .top .mr-tile{width:84px;height:105px}}`;
/** opener(node, fn, label) : a card or tile that opens a detail on click, Enter or Space (inner links, buttons and
    dotted definitions keep their own click). */
export function opener(node, fn, label) {
  node.setAttribute('role', 'button'); node.tabIndex = 0; if (label) node.setAttribute('aria-label', label);
  node.classList.add('ads-open');
  node.addEventListener('click', e => { if (e.target.closest('a,button,.lx-def,.lx-info,input,label')) return; fn(); });
  node.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === node) { e.preventDefault(); fn(); } });
  return node;
}
/** adSheet(ad, d, ctx, { period, set }) : the one detail view of an ad (kit sheet: centered on a desktop, from the bottom
    on a phone) with every number the ad carries. A missing number is left out, never shown as a zero.
    ad: { id, name, video, thumb, adset, campaign, spend, revenue, purchases, roas, cpa, nc_roas, ctr, cpm, frequency,
          impressions, clicks, fc_rev, age, spend_today, lead, cpl, leads, days: [{ date, spend, revenue }] }
    set: the ad set's own scorecard { name, spend, purchases, roas, cpa } (the set is judged first).
    Real mode reads the ad's days from GET /api/hub/ad-days (profit, read only) when the ad has a Meta id. */
export function adSheet(a, d, ctx, { period, set } = {}) {
  addStyles('ad-sh-css', SH_CSS);
  const cur = d.currency, g = d.goals || {}, v = d.sales_source !== false ? judge(a, g) : null;
  const when = period || (d.window && d.window.label) || 'these dates';
  const tile = (label, key, value, sub, tone) => value == null ? null : h('div', null, h('span', { class: 'l' }, def(label, key)), h('span', { class: 'v ' + (tone || '') }, value), sub ? h('span', { class: 's' }, sub) : null);
  const roasTone = ok(a.roas) && g.roas ? (a.roas >= g.roas ? 'good' : 'bad') : '';
  const cpaTone = ok(a.cpa) && g.cpa ? (a.cpa <= g.cpa ? 'good' : 'bad') : '';
  const adset = a.adset && typeof a.adset === 'object' ? a.adset.name : a.adset;
  const grid = h('div', { class: 'g' }, [
    tile('Spend', 'ad_spend', ok(a.spend) ? usd(a.spend, cur) : null, ok(a.spend_today) ? usd(a.spend_today, cur) + ' today' : null),
    a.lead ? null : tile('Sales', { title: 'Sales', body: 'Sales Triple Whale credits to this ad, last platform click.', source: 'Triple Whale' }, ok(a.revenue) ? usd(a.revenue, cur) : null),
    a.lead ? null : tile('Orders', 'purchases_last_click', ok(a.purchases) ? num(a.purchases) : null),
    a.lead ? null : tile('ROAS', 'roas', ok(a.roas) ? x(a.roas) : 'no sales yet', g.roas ? 'goal ' + x(g.roas) : null, roasTone),
    a.lead ? null : tile('Cost per sale', 'cpa', ok(a.cpa) ? usd(a.cpa, cur) : null, g.cpa ? 'goal ' + usd(g.cpa, cur) : null, cpaTone),
    a.lead ? tile('Cost per lead', { title: 'Cost per lead', body: 'Spend divided by the leads Meta counts for the ad.', source: 'Meta' }, ok(a.cpl) ? money(a.cpl, { cur }) : null, ok(a.leads) ? num(a.leads) + ' leads' : null) : null,
    tile('New customer ROAS', 'new_customer_roas', ok(a.nc_roas) ? x(a.nc_roas) : null),
    tile('First click sales', 'first_click', ok(a.fc_rev) ? usd(a.fc_rev, cur) : null),
    tile('CTR', 'ctr', ok(a.ctr) ? pct(a.ctr, { digits: 2 }) : null, ok(a.clicks) ? num(a.clicks) + ' link clicks' : null),
    tile('CPM', 'cpm', ok(a.cpm) ? money(a.cpm, { cur, cents: true }) : null),
    tile('Frequency', 'frequency', ok(a.frequency) ? a.frequency.toFixed(2) : null),
    tile('Impressions', 'impressions', ok(a.impressions) ? num(a.impressions) : null),
    tile('Days running', 'days_running', ok(a.age) ? num(a.age + 1) : null),
  ].filter(Boolean));
  const chartBox = h('div', null);
  const draw = days => {
    if (!days || days.length < 2) return put(chartBox, h('p', { class: 'na' }, 'No day by day numbers for this ad yet.'));
    const b = t => h('b', null, t);
    put(chartBox, h('div', { class: 'lx-chart-h' }, h('h3', null, 'Spend and sales by day, ' + shortDate(days[0].date) + ' to ' + shortDate(days[days.length - 1].date)), legend([{ name: 'Sales', lead: true }, { name: 'Spend', square: true }])),
      lineChart({ slots: false, height: 220, phoneHeight: 200,
        series: [{ type: 'bar', tone: 'dim', name: 'Spend', values: days.map(r => +r.spend || 0) }, { name: 'Sales', lead: true, values: days.map(r => (ok(r.revenue) ? r.revenue : null)), end: false }],
        labels: days.map(r => shortDate(r.date)), format: n => money(n, { cur, compact: true }), label: 'Spend and sales by day for ' + (a.name || 'this ad'),
        hover: i => [b(shortDate(days[i].date)), h('span', null, 'Spend ', b(usd(days[i].spend, cur))), ok(days[i].revenue) ? h('span', null, 'Sales ', b(usd(days[i].revenue, cur))) : null] }));
  };
  if (a.days) draw(a.days);
  else if (!ctx.sample && ctx.brand && /^\d{5,25}$/.test(String(a.id || ''))) {
    put(chartBox, h('p', { class: 'na' }, 'Reading the days...'));
    ctx.api(`/api/hub/ad-days?act=${encodeURIComponent(ctx.brand.id)}&ads=${a.id}&model=lastPlatformClick`, { worker: 'profit' })
      .then(r => draw((r && r.days) || []), () => draw([]));
  } else draw(null);
  const s = set || null;
  const body = h('div', { class: 'ad-sh' },
    h('div', { class: 'top' }, adTile(a),
      h('div', null, h('b', null, a.name || 'Unnamed ad'),
        h('div', { class: 'w' }, v ? statusDot(v[0], v[1]) : null,
          h('span', null, 'Meta ad', adset ? ' in ' + adset : '', a.campaign ? ', campaign ' + a.campaign : ''),
          h('span', null, (a.video ? 'Video' : 'Image') + ', numbers for ' + when)))),
    grid,
    s ? h('section', null, h('h3', null, 'Its ad set, ' + (s.name || '') + ' (the set is judged first)'),
      h('div', { class: 'set' },
        h('span', null, def('Spend', 'ad_spend'), h('b', null, usd(s.spend, cur))),
        h('span', null, def('Orders', 'purchases_last_click'), h('b', null, ok(s.purchases) ? num(s.purchases) : 'none')),
        h('span', null, def('ROAS', 'roas'), h('b', null, ok(s.roas) ? x(s.roas) : 'no sales')),
        h('span', null, def('Cost per sale', 'cpa'), h('b', null, ok(s.cpa) ? usd(s.cpa, cur) : 'no sales')))) : null,
    chartBox,
    h('div', { class: 'go' },
      ctx.tab !== 'live-now' ? button('Open in Live now', { href: ctx.href('meta', 'live-now') }) : null,
      ctx.tab !== 'top-ads' ? button('Open in Top ads', { href: ctx.href('meta', 'top-ads') }) : null));
  return sheet({ title: a.name || 'Ad', body });
}
export { levelChip, def };
