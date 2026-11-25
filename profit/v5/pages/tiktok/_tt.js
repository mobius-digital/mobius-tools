/* Shared by every TikTok tab: one loader, the states, and the local parts (kit gaps: a portrait video
   tile, labelled bar rows, a quiet strip). No ember in here except what the kit already draws.

   Real mode reads account-health:
     GET /api/tiktok/status                      is the agency signed in to TikTok (team only)
     GET /api/tiktok/report?act=&from=&to=       campaigns and days, TikTok's own count, cached an hour
   That is everything the TikTok connection returns today. Per video numbers, Triple Whale sales for
   TikTok, hour by hour spend, suggestions and a change list have no route yet, so those parts show a
   designed state and never a zero. */

import { h, em, svgNode, card, kpi, kpis, takeaway, button, table, statusDot, pill, empty, lineChart, legend, money, num, pct, x, toast, addStyles } from '../../kit.js';
import { icon } from '../../icons.js';

export const TT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'live-now', label: 'Live now' },
  { id: 'top-videos', label: 'Top videos' },
  { id: 'suggestions', label: 'Suggestions', team: true },
  { id: 'changes', label: 'Changes made' },
];

const CSS = `
/* frame gap, fixed here until app.css has it: a one column grid must let its column shrink, or the tab row widens the whole page on a phone */
.tt-vids{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:36px 40px}
.tt-vid{display:grid;grid-template-columns:132px minmax(0,1fr);gap:22px;align-items:start;min-width:0}
.tt-thumb{position:relative;aspect-ratio:9/16;border-radius:14px;overflow:hidden;background:linear-gradient(180deg,#ECEAE6 0%,#DCD9D3 100%);box-shadow:inset 0 0 0 1px rgba(28,20,10,.06)}
.tt-thumb.b{background:linear-gradient(180deg,#E4E7EE 0%,#D3D7E1 100%)}
.tt-thumb::before{content:"";position:absolute;left:50%;bottom:-18%;width:78%;aspect-ratio:1;transform:translateX(-50%);border-radius:50% 50% 0 0;background:rgba(28,20,10,.07)}
.tt-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.tt-play{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:#fff;box-shadow:0 2px 10px rgba(28,20,10,.18)}
.tt-play::after{content:"";position:absolute;left:16px;top:13px;border-left:10px solid var(--ink);border-top:7px solid transparent;border-bottom:7px solid transparent}
.tt-dur{position:absolute;right:8px;bottom:8px;padding:2px 7px;border-radius:7px;background:rgba(22,19,15,.86);color:#fff;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums}
.tt-body{display:grid;gap:12px;min-width:0}
.tt-body h4{margin:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:15.5px;font-weight:600;letter-spacing:-.015em}
.tt-body .sub{font-size:12.5px;color:var(--muted);margin-top:3px}
.tt-roas{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.tt-roas .big{font-size:28px;font-weight:600;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums}
.tt-roas .big.na{color:var(--faint)}
.tt-roas .r{text-align:right;font-size:12px;color:var(--muted);line-height:1.3}
.tt-roas .r b{display:block;font-size:17px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.tt-bars{display:grid;gap:9px}
.tt-bars>div{display:grid;grid-template-columns:128px minmax(0,1fr) 46px;align-items:center;gap:10px;font-size:12.5px;color:var(--ink-2)}
.tt-bars i{display:block;height:4px;border-radius:999px;background:var(--bg-sunk);position:relative}
.tt-bars i::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);background:var(--ink);border-radius:999px}
.tt-bars b{text-align:right;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.tt-says{font-size:12px;color:var(--muted)}
.tt-strip{display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:18px;background:var(--band)}
.tt-strip .ic{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:#fff;box-shadow:0 0 0 1px var(--line)}
.tt-strip .tx{min-width:0;flex:1}
.tt-strip .tx b{display:block;font-size:15px;font-weight:600}
.tt-strip .tx span{font-size:13px;color:var(--muted)}
.tt-sug{display:flex;align-items:center;gap:16px;padding:16px 0;border-top:1px solid var(--line)}
.tt-sug:first-of-type{border-top:0}
.tt-sug .tx{min-width:0;flex:1}
.tt-sug .tx b{display:block;font-size:14.5px;font-weight:600}
.tt-sug .tx span{font-size:13px;color:var(--muted)}
@media (max-width:1180px){.tt-vids{grid-template-columns:1fr}}
@media (max-width:759px){
  .tt-vid{grid-template-columns:96px minmax(0,1fr);gap:14px}
  .tt-bars>div{grid-template-columns:minmax(0,1fr) 46px;gap:4px 10px}
  .tt-bars>div span{grid-column:1/-1}
  .tt-strip,.tt-sug{flex-wrap:wrap}
  .tt-strip .lx-btn,.tt-sug .lx-btn{width:100%;height:46px}
  .tt-chg td,.tt-camps td,.tt-top td{white-space:normal}
}`;

export function styles() {
  addStyles('tt-css', CSS);
}

/* ---------- loading ---------- */
const iso = d => d.toISOString().slice(0, 10);
const short = s => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/* the dates in the page head */
const windowFor = ctx => ({ from: ctx.range.from, to: ctx.range.to, label: short(ctx.range.from) + ' to ' + short(ctx.range.to) });

/** Group TikTok's days into weeks (Monday start) for the chart. */
function weeksOf(days) {
  const m = new Map();
  for (const d of days || []) {
    const t = new Date(d.date + 'T12:00:00'); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    const k = iso(t), w = m.get(k) || { week: k, spend: 0, purchases: 0 };
    w.spend += d.spend || 0; w.purchases += d.purchases || 0; m.set(k, w);
  }
  return [...m.values()].sort((a, b) => (a.week < b.week ? -1 : 1));
}

/** The one loader. Every tab calls it; the worker keeps the report for an hour, so a second tab is cheap. */
export async function loadTikTok(ctx) {
  const range = windowFor(ctx);
  if (!ctx.brand) return { range, state: 'no_brand' };
  const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return { error: e.message || 'failed', status: e.status }; });
  const [status, report] = await Promise.all([
    ctx.isClient ? Promise.resolve(null) : soft(ctx.api('/api/tiktok/status', { worker: 'ah', signal: ctx.signal })),
    soft(ctx.api(`/api/tiktok/report?act=${encodeURIComponent(ctx.brand.id)}&from=${range.from}&to=${range.to}`, { worker: 'ah', signal: ctx.signal })),
  ]);
  const base = { range, source: 'tiktok', goal_roas: ctx.brand.target_roas || null, goal_cpa: ctx.brand.target_cpa || null };
  if (!report || report.error) {
    const e = (report && report.error) || '';
    const state = e === 'not_connected' ? (status && status.app === false ? 'no_app' : 'not_connected') : e === 'not_linked' ? 'not_linked' : 'error';
    return { ...base, state, error: state === 'error' ? e : null, advertisers: status && status.advertisers ? status.advertisers.length : null };
  }
  const camps = report.campaigns || [], days = report.days || [];
  const spend = camps.reduce((s, c) => s + c.spend, 0), purchases = camps.reduce((s, c) => s + c.purchases, 0), value = camps.reduce((s, c) => s + c.spend * (c.roas || 0), 0);
  const nDays = Math.max(1, days.length);
  return { ...base, state: 'connected',
    /* sales here are TikTok's own count (it includes views without a click). There is no Triple Whale figure for TikTok on this route. */
    totals: { spend, per_day: spend / nDays, purchases, tiktok_sales: value, tiktok_roas: spend ? value / spend : null, tiktok_cpa: purchases ? spend / purchases : null, sales: null, roas: null, cpa: null },
    weeks: weeksOf(days).map(w => ({ label: short(w.week), spend: w.spend, purchases: w.purchases })),
    campaigns: camps, videos: null, live: null, suggestions: null, changes: null };
}
export const sampleTikTok = ctx => ctx.fixture('tiktok.json');

/* ---------- parts ---------- */
export function strip({ ic = 'tiktok', title, text, action }) {
  return h('div', { class: 'tt-strip' }, h('span', { class: 'ic' }, svgNode(icon(ic))), h('span', { class: 'tx' }, h('b', null, title), h('span', null, text)), action || null);
}

/** Start the TikTok sign in. Team only. Opens TikTok for Business in a new tab. */
function connectButton(ctx) {
  const b = button('Connect TikTok', { primary: true, large: true, icon: 'arrow', onclick: async () => {
    if (ctx.sample) return toast('Sample numbers. Connecting is off here.');
    b.disabled = true;
    try { const r = await ctx.api('/api/tiktok/start', { worker: 'ah', method: 'POST', body: {} }); if (r && r.url) window.open(r.url, '_blank', 'noopener'); else toast((r && r.error) || 'Could not start', { tone: 'bad' }); }
    catch (e) { toast(e.message || 'Could not start', { tone: 'bad' }); }
    b.disabled = false;
  } });
  return b;
}

/** The state a tab shows instead of numbers. Returns a node, or null when the page is connected. */
export function gate(d, ctx) {
  if (!ctx.brand || !d || d.state === 'no_brand') return empty({ title: 'Pick one brand', text: 'TikTok is shown for one brand at a time.' });
  const team = !ctx.isClient;
  if (d.state === 'not_connected') return strip({ title: 'Not connected yet', text: team ? 'Sign in to TikTok for Business once and tick every ad account. Then each brand shows its campaigns here.' : 'Your team has not connected TikTok yet.', action: team ? connectButton(ctx) : null });
  if (d.state === 'no_app') return strip({ title: 'Not connected yet', text: 'The TikTok developer app is still waiting on TikTok. The steps are in Agency settings, Integrations.', action: team ? button('Open integrations', { href: '#/agency/all/a-settings/integrations', icon: 'arrow' }) : null });
  if (d.state === 'not_linked') return strip({ title: 'This brand has no TikTok ad account yet', text: team ? 'TikTok is signed in' + (d.advertisers ? ' (' + d.advertisers + (d.advertisers === 1 ? ' ad account' : ' ad accounts') + ')' : '') + '. Paste this brand’s advertiser ID in Brand settings, Integrations.' : 'Your team has not linked a TikTok ad account to this brand yet.', action: team ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) : null });
  if (d.state === 'error') return empty({ title: 'TikTok did not answer', text: d.error || 'Try again in a minute.' });
  return null;
}

export const noVideoNumbers = () => strip({ title: 'This campaign type gives no per video numbers', text: 'TikTok reports automatic Shop campaigns as one total. Each video shows here once TikTok sends a row for it.' });

/** The hero band: four figures. Sales and ROAS are Triple Whale's when the data has them, else TikTok's own, named. */
export function heroBand(d) {
  const t = d.totals || {}, tw = t.sales != null;
  const roas = tw ? t.roas : t.tiktok_roas, cpa = tw ? t.cpa : t.tiktok_cpa, sales = tw ? t.sales : t.tiktok_sales;
  const who = tw ? '' : ', TikTok says';
  const none = roas == null && sales == null;
  const list = [
    { label: 'Spend', value: money(t.spend), size: 'lg', sub: t.per_day != null ? 'about ' + money(Math.round(t.per_day)) + ' a day' : null },
    none ? { label: 'Sales from its ads', value: 'n/a', size: 'lg', sub: 'No sales source connected' }
      : { label: 'Sales from its ads' + who, value: money(Math.round(sales)), size: 'lg', sub: t.purchases != null ? num(t.purchases) + ' purchases' : null },
    { label: 'ROAS' + who, value: roas != null ? h('span', { class: 'lx-hero-num' }, x(roas)) : 'n/a', size: 'lg',
      delta: roas != null && d.goal_roas != null ? statusDot(roas < d.goal_roas ? 'bad' : 'good', 'goal ' + x(d.goal_roas)) : null, sub: roas == null ? 'No sales source connected' : null },
    { label: 'Cost per purchase' + who, value: cpa != null ? money(Math.round(cpa)) : 'n/a', size: 'lg',
      delta: cpa != null && d.goal_cpa != null ? statusDot(cpa > d.goal_cpa ? 'bad' : 'good', 'goal ' + money(d.goal_cpa)) : null },
  ];
  return h('section', { class: 'lx-hero line' }, kpis(list.map(k => kpi(k)), { cols: 4 }));
}

/** The one sentence. From the fixture in sample mode, else written from the totals by a plain rule. */
export function takeLine(d, ctx) {
  const t = d.totals || {};
  let say = null;
  if (d.take) say = d.take.map(p => (typeof p === 'string' ? p : h('b', null, p.b)));
  else {
    const r = t.roas != null ? t.roas : t.tiktok_roas;
    if (r == null || !t.spend) return null;
    say = [t.roas != null ? 'TikTok brings back ' : 'By TikTok’s own count it brings back ', h('b', null, money(r, { cents: true })), ' for each ', h('b', null, '$1'), '. ',
      (d.campaigns || []).length === 1 ? 'Every dollar is in one campaign.' : num((d.campaigns || []).length) + ' campaigns spent.'];
  }
  return takeaway(say, { action: !ctx.isClient ? button('Ask why', { href: ctx.href('ask', 'index') }) : null });
}

/** Sales against spend by week: the one lead chart, its own full width row. */
export function weeksChart(d) {
  const w = d.weeks || [];
  if (w.length < 2) return null;
  const hasSales = w.some(r => r.sales != null);
  const series = hasSales
    ? [{ name: 'Sales', values: w.map(r => r.sales), lead: true }, { name: 'Spend', values: w.map(r => r.spend) }]
    : [{ name: 'Spend', values: w.map(r => r.spend), lead: true }];
  return card({},
    h('div', { class: 'lx-chart-h' },
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, hasSales ? 'Are TikTok sales keeping up with spend?' : 'What TikTok spent each week')), h('p', null, 'by week, TikTok only')),
      legend(series.map(s => ({ name: s.name, lead: s.lead })))),
    lineChart({ series, labels: w.map(r => r.label), height: 360, format: v => money(v, { compact: true }), label: hasSales ? 'TikTok sales and spend by week' : 'TikTok spend by week' }),
    hasSales ? null : h('p', { class: 'lx-foot', style: { marginTop: '10px' } }, 'No sales source connected for TikTok by week, so only spend is drawn.'));
}

const barRow = (name, v) => v == null ? null : h('div', null, h('span', null, name), h('i', { style: { '--v': Math.min(100, v * 250).toFixed(1) + '%' } }), h('b', null, pct(v, { digits: v < 0.1 ? 1 : 0 })));

/** One video: portrait tile, ROAS and sales, then how long people stay. */
export function videoCard(v) {
  const has = v.roas != null;
  const foot = [v.tiktok_roas != null ? 'TikTok says ' + x(v.tiktok_roas) + '.' : null,
    v.meta ? 'On Meta: hook ' + pct(v.meta.hook) + ', ROAS ' + x(v.meta.roas) + '.' : v.meta === null ? 'Not on Meta.' : null].filter(Boolean).join(' ');
  return h('article', { class: 'tt-vid' },
    h('div', { class: 'tt-thumb ' + (v.look || '') }, v.thumb && h('img', { src: v.thumb, alt: '', loading: 'lazy', decoding: 'async' }), h('span', { class: 'tt-play', 'aria-hidden': 'true' }), v.dur && h('span', { class: 'tt-dur' }, v.dur)),
    h('div', { class: 'tt-body' },
      h('div', null, h('h4', null, v.name, v.spark && pill('', 'Spark ad')), h('div', { class: 'sub' }, [v.by, v.spend != null ? money(v.spend) + ' spent' : null].filter(Boolean).join(', '))),
      h('div', null, h('span', { class: 'lx-cap' }, 'ROAS'),
        h('div', { class: 'tt-roas' }, h('span', { class: 'big' + (has ? '' : ' na') }, has ? x(v.roas) : 'n/a'),
          h('span', { class: 'r' }, h('b', null, v.sales != null ? money(v.sales) : 'n/a'), v.sales != null ? 'sales, Triple Whale' : 'No sales source connected'))),
      h('div', { class: 'tt-bars' }, barRow('2 second views', v.v2), barRow('6 second views', v.v6), barRow('Watched to the end', v.end)),
      foot && h('div', { class: 'tt-says' }, foot)));
}

/** Campaigns as TikTok reports them. Spend, click rate and CPM are exact; purchases and ROAS are TikTok's own count. */
export function campaignsCard(d, { title = 'Campaigns', live = false } = {}) {
  const rows = d.campaigns || [];
  if (!rows.length) return null;
  const cols = [
    { key: 'name', label: 'Campaign', render: r => h('span', { class: 'name' }, r.name || r.id, r.type && h('span', { class: 'sub' }, r.type)) },
    live ? { key: 'status', label: 'Status', render: r => statusDot(r.status === 'live' ? 'good' : 'off', r.status === 'live' ? 'Live' : 'Paused') } : null,
    live ? { key: 'budget', label: 'Budget a day', num: true, render: r => r.budget != null ? money(r.budget) : 'no data' } : null,
    { key: live ? 'spend_today' : 'spend', label: live ? 'Spent today' : 'Spend', num: true, sortable: true, render: r => money(live ? r.spend_today : r.spend) },
    live ? null : { key: 'ctr', label: 'Click rate', num: true, class: 'hide-sm', sortable: true, render: r => pct(r.ctr, { digits: 2 }) },
    live ? null : { key: 'cpm', label: 'CPM', num: true, class: 'hide-sm', sortable: true, render: r => money(r.cpm, { cents: true }) },
    live ? null : { key: 'purchases', label: 'Purchases, TikTok says', num: true, class: 'hide-sm', sortable: true, render: r => num(r.purchases) },
    live ? null : { key: 'roas', label: 'ROAS, TikTok says', num: true, sortable: true, class: 'strong', render: r => r.roas ? x(r.roas) : 'no data' },
  ].filter(Boolean);
  return card({ title, note: live ? 'right now' : 'TikTok’s own count', flush: true, class: live ? 'tt-live' : 'tt-camps' },
    table({ roomy: true, rows, cols, sort: { key: live ? 'spend_today' : 'spend', dir: 'desc' } }));
}

/** The page title every TikTok tab shares. The shell draws it above the tabs. */
export const TT_TITLE = ['Which videos ', em('stop the scroll?')];
export const foot = d => d && d.foot ? h('p', { class: 'lx-foot' }, d.foot) : null;
