/* Shared by every TikTok tab: one loader, the states, and the local parts (kit gaps: a portrait video
   tile, labeled bar rows, a quiet strip). No ember in here except what the kit already draws.

   Real mode reads account-health:
     GET /api/tiktok/status                      is the agency signed in to TikTok (team only)
     GET /api/tiktok/report?act=&from=&to=       campaigns and days, TikTok's own count, cached an hour
   That is everything the TikTok connection returns today. Per video numbers, Triple Whale sales for
   TikTok, hour by hour spend, suggestions and a change list have no route yet, so those parts show a
   designed state and never a zero. */

import { h, em, svgNode, card, kpi, kpis, takeaway, button, table, statusDot, pill, empty, lineChart, legend, money, num, pct, x, toast, addStyles, sheet } from '../../kit.js';
import { def, defOn, headRow } from '../platforms/_ads.js';
import { icon } from '../../icons.js';
import { askWhy } from '../home/_biz.js';

export const TT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'live-now', label: 'Live now' },
  { id: 'top-videos', label: 'Best videos' },
  { id: 'suggestions', label: 'Suggestions', team: true },
  { id: 'changes', label: 'Changes' },
];

const CSS = `
/* frame gap, fixed here until app.css has it: a one column grid must let its column shrink, or the tab row widens the whole page on a phone */
.tt-vids{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:36px 40px}
.tt-vid{display:grid;grid-template-columns:132px minmax(0,1fr);gap:22px;align-items:start;min-width:0}
.tt-thumb{position:relative;aspect-ratio:9/16;border-radius:14px;overflow:hidden;background:var(--bg-sunk);box-shadow:inset 0 0 0 1px rgba(28,20,10,.06)}
.tt-thumb.b{background:var(--surface-2)}
.tt-thumb::before{content:"";position:absolute;left:50%;bottom:-18%;width:78%;aspect-ratio:1;transform:translateX(-50%);border-radius:50% 50% 0 0;background:rgba(28,20,10,.07)}
.tt-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.tt-play{position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:var(--surface);box-shadow:0 2px 10px rgba(28,20,10,.18)}
.tt-play::after{content:"";position:absolute;left:16px;top:13px;border-left:10px solid var(--ink);border-top:7px solid transparent;border-bottom:7px solid transparent}
.tt-dur{position:absolute;right:8px;bottom:8px;padding:2px 7px;border-radius:7px;background:rgba(22,19,15,.86);color:#fff;font-size:11.5px;font-weight:600;font-variant-numeric:tabular-nums}
.tt-body{display:grid;gap:12px;min-width:0}
.tt-body h4{margin:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:15.5px;font-weight:600;letter-spacing:-.015em}
.tt-body .sub{font-size:12.5px;color:var(--muted);margin-top:3px}
.tt-roas{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;padding-bottom:12px;border-bottom:1px solid var(--line)}
.tt-roas .big{font-size:var(--num-l);font-weight:600;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums}
.tt-roas .big.na{color:var(--faint)}
.tt-roas .r{text-align:right;font-size:12px;color:var(--muted);line-height:1.3}
.tt-roas .r b{display:block;font-size:17px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.tt-bars{display:grid;gap:9px}
.tt-bars>div{display:grid;grid-template-columns:128px minmax(0,1fr) 46px;align-items:center;gap:10px;font-size:12.5px;color:var(--ink-2)}
.tt-bars i{display:block;height:4px;border-radius:999px;background:var(--bg-sunk);position:relative}
.tt-bars i::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);background:var(--ink);border-radius:999px}
.tt-bars b{text-align:right;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.tt-says{display:flex;gap:6px;flex-wrap:wrap}
.tt-says .lx-chip{height:22px;font-size:11.5px}
.tt-vid{cursor:pointer;border-radius:16px;padding:8px;margin:-8px}
.tt-vid:hover{background:var(--surface-2)}
.tt-vid:focus-visible{outline:2px solid var(--ink-2);outline-offset:2px}
.tt-mini{display:grid}
.tt-mini a{display:grid;grid-template-columns:minmax(0,1fr) 90px 80px 90px;gap:12px;align-items:center;min-height:var(--row-h-roomy,48px);padding:0 24px;border-top:1px solid var(--line);color:inherit;text-decoration:none;font-size:13.5px}
.tt-mini a:hover{background:var(--surface-2)}
.tt-mini a span:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
.tt-mini .hd{display:grid;grid-template-columns:minmax(0,1fr) 90px 80px 90px;gap:12px;padding:0 24px 8px;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.tt-mini .hd span:not(:first-child){text-align:right}
.tt-sh{display:grid;gap:16px}.tt-sh .g{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.tt-sh .g>div{display:grid;gap:3px;padding:12px 14px;border-radius:12px;background:var(--surface-2)}.tt-sh .g .l{font-size:12px;color:var(--muted)}
.tt-sh .g b{font-size:var(--num-s);font-variant-numeric:tabular-nums}
.tt-bar{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap}
.tt-bar h3{margin:0;font-size:15px;font-weight:600;flex:1;min-width:200px}
.tt-bar label{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}
.tt-bar select{height:34px;padding:0 10px;border:0;border-radius:10px;background:var(--bg-sunk);color:var(--ink);font:inherit;font-size:13px}
@media (max-width:759px){.tt-sh .g{grid-template-columns:repeat(2,minmax(0,1fr))}.tt-mini a,.tt-mini .hd{grid-template-columns:minmax(0,1fr) 70px 64px;padding:0 16px}.tt-mini a>:last-child,.tt-mini .hd>:last-child{display:none}}
.tt-strip{display:flex;align-items:center;gap:16px;padding:18px 22px;border-radius:18px;background:var(--band)}
.tt-strip .ic{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;background:var(--surface);box-shadow:0 0 0 1px var(--line)}
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
    { label: def('TikTok spend, ' + (d.range ? d.range.label : ''), 'ad_spend'), value: money(t.spend), size: 'lg', sub: t.per_day != null ? 'about ' + money(Math.round(t.per_day)) + ' a day' : null },
    none ? { label: 'Sales from its ads', value: 'n/a', size: 'lg', sub: 'No sales source connected' }
      : { label: def('Sales from its ads' + who, tw ? 'roas' : 'tiktok_says'), value: money(Math.round(sales)), size: 'lg', sub: t.purchases != null ? num(t.purchases) + ' purchases' : null },
    { label: def('ROAS' + who, tw ? 'roas' : 'tiktok_says'), value: roas != null ? h('span', { class: 'lx-hero-num' }, x(roas)) : 'n/a', size: 'lg',
      delta: roas != null && d.goal_roas != null ? statusDot(roas < d.goal_roas ? 'bad' : 'good', 'goal ' + x(d.goal_roas)) : null, sub: roas == null ? 'No sales source connected' : null },
    { label: def('Cost per purchase' + who, 'cpa'), value: cpa != null ? money(Math.round(cpa)) : 'n/a', size: 'lg',
      delta: cpa != null && d.goal_cpa != null ? statusDot(cpa > d.goal_cpa ? 'bad' : 'good', 'goal ' + money(d.goal_cpa)) : null },
  ];
  return h('section', { class: 'lx-hero line' }, kpis(list.map(k => kpi(k)), { cols: 4 }));
}

/** The one sentence. From the fixture in sample mode, else written from the totals by a plain rule. */
export function takeLine(d, ctx) {
  return null; /* the old line said the ROAS tile again in words (brief rule 5); Ask why lives in the page head now */
  const t = d.totals || {};
  let say = null;
  if (d.take) say = d.take.map(p => (typeof p === 'string' ? p : h('b', null, p.b)));
  else {
    const r = t.roas != null ? t.roas : t.tiktok_roas;
    if (r == null || !t.spend) return null;
    say = [t.roas != null ? 'TikTok brings back ' : 'By TikTok’s own count it brings back ', h('b', null, money(r, { cents: true })), ' for each ', h('b', null, '$1'), '. ',
      (d.campaigns || []).length === 1 ? 'Every dollar is in one campaign.' : num((d.campaigns || []).length) + ' campaigns spent.'];
  }
  return takeaway(say, { action: !ctx.isClient ? askWhy(ctx, 'How is TikTok doing, and why?') : null });
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
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, hasSales ? 'Are TikTok sales keeping up with spend?' : 'What TikTok spent each week')), h('p', null, hasSales ? 'by week, TikTok only' : 'by week, TikTok only. No sales source is connected for TikTok by week, so only spend is drawn.')),
      legend(series.map(s => ({ name: s.name, lead: s.lead })))),
    lineChart({ series, labels: w.map(r => r.label), height: 360, format: v => money(v, { compact: true }), label: hasSales ? 'TikTok sales and spend by week' : 'TikTok spend by week' }));
}

const barRow = (name, v) => v == null ? null : h('div', null, h('span', null, name), h('i', { style: { '--v': Math.min(100, v * 250).toFixed(1) + '%' } }), h('b', null, pct(v, { digits: v < 0.1 ? 1 : 0 })));

/** One video: portrait tile, ROAS and sales, then how long people stay. */
export function videoCard(v, d) {
  const has = v.roas != null;
  const chips = [v.tiktok_roas != null ? defOn(h('span', { class: 'lx-chip' }, 'TikTok\'s count ' + x(v.tiktok_roas)), 'tiktok_says') : null,
    v.meta ? h('span', { class: 'lx-chip' }, 'Also on Meta: ' + x(v.meta.roas)) : null].filter(Boolean);
  const open = () => videoSheet(v, d);
  return h('article', { class: 'tt-vid', tabindex: 0, role: 'button', 'aria-label': 'Open ' + v.name, onclick: e => { if (!e.target.closest('.lx-def')) open(); }, onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); open(); } } },
    h('div', { class: 'tt-thumb ' + (v.look || '') }, v.thumb && h('img', { src: v.thumb, alt: '', loading: 'lazy', decoding: 'async' }), h('span', { class: 'tt-play', 'aria-hidden': 'true' }), v.dur && h('span', { class: 'tt-dur' }, v.dur)),
    h('div', { class: 'tt-body' },
      h('div', null, h('h4', null, v.name, v.spark && pill('', 'Spark ad')), h('div', { class: 'sub' }, [v.by, v.spend != null ? money(v.spend) + ' spent' : null].filter(Boolean).join(', '))),
      h('div', null, h('span', { class: 'lx-cap' }, 'ROAS'),
        h('div', { class: 'tt-roas' }, h('span', { class: 'big' + (has ? '' : ' na') }, has ? x(v.roas) : 'n/a'),
          h('span', { class: 'r' }, h('b', null, v.sales != null ? money(v.sales) : 'n/a'), v.sales != null ? 'sales, Triple Whale' : 'No sales source connected'))),
      h('div', { class: 'tt-bars' }, barRow('2 second views', v.v2), barRow('6 second views', v.v6), barRow('Watched to the end', v.end)),
      chips.length ? h('div', { class: 'tt-says' }, chips) : null));
}
/** One video, every figure: a kit sheet (centered on a desktop, from the bottom on a phone). */
export function videoSheet(v, d) {
  const kv = (l, k, val) => val == null ? null : h('div', null, h('span', { class: 'l' }, def(l, k)), h('b', null, val));
  const p = n => (n == null ? null : pct(n, { digits: n < 0.1 ? 1 : 0 }));
  sheet({ title: v.name, body: h('div', { class: 'tt-sh' },
    h('p', { class: 'tt-says' }, [v.spark ? 'Spark ad' : 'Brand video', v.by, v.dur, 'TikTok, ' + (d && d.range ? d.range.label : 'these dates')].filter(Boolean).join(', ')),
    h('div', { class: 'g' },
      kv('Spend', 'ad_spend', v.spend != null ? money(v.spend) : null), kv('Sales', 'roas', v.sales != null ? money(v.sales) : null), kv('ROAS', 'roas', v.roas != null ? x(v.roas) : null),
      kv('TikTok\'s count', 'tiktok_says', v.tiktok_roas != null ? x(v.tiktok_roas) : null),
      kv('2 second views', 'hook', p(v.v2)), kv('6 second views', 'six_second', p(v.v6)), kv('Watched to the end', 'watched_end', p(v.end)),
      kv('CPM', 'cpm', v.cpm != null ? money(v.cpm, { cents: true }) : null), kv('CTR', 'ctr', v.ctr != null ? pct(v.ctr, { digits: 2 }) : null)),
    v.meta ? h('div', null, h('b', null, 'The same video on Meta'), h('p', { class: 'tt-says' }, 'Hook ' + pct(v.meta.hook) + ', ROAS ' + x(v.meta.roas))) : null) });
}

/** Campaigns as TikTok reports them. Spend, click rate and CPM are exact; purchases and ROAS are TikTok's own count. */
export function campaignsCard(d, { title = 'Campaigns', live = false } = {}) {
  const rows = d.campaigns || [];
  if (!rows.length) return null;
  const cols = [
    { key: 'name', label: 'Campaign', render: r => h('span', { class: 'name' }, r.name || r.id, r.type && h('span', { class: 'sub' }, r.type)) },
    live ? { key: 'status', label: 'Status', render: r => statusDot(r.status === 'live' ? 'good' : 'off', r.status === 'live' ? 'Live' : 'Paused') } : null,
    live ? { key: 'budget', label: def('Budget a day', 'budget_a_day'), num: true, render: r => r.budget != null ? money(r.budget) : 'no data' } : null,
    { key: live ? 'spend_today' : 'spend', label: live ? def('Spent today', 'spent_today') : def('Spend', 'ad_spend'), num: true, sortable: true, render: r => money(live ? r.spend_today : r.spend) },
    live ? null : { key: 'ctr', label: def('Click rate', 'click_rate'), num: true, class: 'hide-sm', sortable: true, render: r => pct(r.ctr, { digits: 2 }) },
    live ? null : { key: 'cpm', label: def('CPM', 'cpm'), num: true, class: 'hide-sm', sortable: true, render: r => money(r.cpm, { cents: true }) },
    live ? null : { key: 'purchases', label: def('Purchases, TikTok says', 'tiktok_says'), num: true, class: 'hide-sm', sortable: true, render: r => num(r.purchases) },
    live ? null : { key: 'roas', label: def('ROAS, TikTok says', 'tiktok_says'), num: true, sortable: true, class: 'strong', render: r => r.roas ? x(r.roas) : 'no data' },
  ].filter(Boolean);
  return card({ title, note: live ? 'right now' : 'TikTok’s own count', flush: true, class: live ? 'tt-live' : 'tt-camps' },
    table({ roomy: true, rows, cols, sort: { key: live ? 'spend_today' : 'spend', dir: 'desc' } }));
}

/** Each TikTok tab says what it is (the shell draws the title above the tabs). */
export const TT_TITLES = {
  overview: ['Is TikTok ', em('paying for itself?')],
  'live-now': ['What is running on TikTok ', em('right now?')],
  'top-videos': ['Which videos ', em('stop the scroll?')],
  suggestions: ['What should change ', em('on TikTok?')],
  changes: ['What changed on TikTok, ', em('and why?')],
};
export const TT_TITLE = TT_TITLES['top-videos'];
/** The old footer line now lives in the page help: one "What is this page?" at the top. */
export const foot = () => null;
const SOURCES = 'Spend, clicks, CPM and views are TikTok\'s. Sales and ROAS are Triple Whale where they exist for TikTok; where they do not, TikTok\'s own count is shown and named.';
export const ttHead = (d, ctx, what, extra) => headRow({ help: [{ title: 'What it is for', text: what }, { title: 'Where the numbers come from', text: SOURCES }, ...(extra || [])],
  ask: ctx && !ctx.isClient ? askWhy(ctx, 'How is TikTok doing, and why?') : null });
