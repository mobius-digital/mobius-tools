/* Shared by the three Amazon pages (overview, search, creative). Not a route: the file name starts with _.
   What is here and not in the kit: the weekly chart's options (the kit draws it)
   (ember line for sales, slate columns for ad spend, a figure on every point), the locked box,
   the split bar, and the one loader for what the workers already know about Amazon. */

import { h, svgNode, money, lineChart, button, empty, addStyles } from '../../kit.js';
import { icon } from '../../icons.js';
import { def } from '../platforms/_ads.js';

/* ---------- local CSS, added once ---------- */
const CSS = `
.az-sub{color:var(--muted);font-size:13px;margin-top:2px}
.az-na{font-size:20px;letter-spacing:-.02em;color:var(--ink-2);line-height:2.2}
.az-kpis .lx-kpi .s{flex-wrap:wrap}
.az-chart{padding:28px 32px 22px}
.az-paused{margin-left:10px;font-size:12px;font-weight:400;color:var(--faint)}
.az-more{font-weight:400;color:var(--muted)}
.az-flag-s{display:none}
.az-lead{display:flex;gap:22px;align-items:center}
.az-ret{display:grid;gap:var(--gap-3,12px);min-width:0}
.az-ret .lx-sec h2{margin:0}
.az-lead .lx-hero-num{font-size:var(--num-xl);padding-bottom:10px;flex:none}
.az-lead b{display:block;font-size:24px;font-weight:600;letter-spacing:-.03em;line-height:1.2}
.az-split{display:flex;gap:3px;height:28px}
.az-split.thin{height:12px}
.az-split>i{display:block;border-radius:4px;min-width:4px;flex:var(--f,1)}
.az-split>i:first-child{border-radius:8px 4px 4px 8px}
.az-split>i:last-child{border-radius:4px 8px 8px 4px}
.az-split.thin>i:first-child{border-radius:10px 4px 4px 10px}
.az-split.thin>i:last-child{border-radius:4px 10px 10px 4px}
.az-keys{display:flex;gap:3px;margin-top:14px}
.az-key{min-width:0;flex:none}
.az-key.first{flex:0 0 calc(var(--w,50%) + 2px)}
.az-key.mid{margin-right:36px}
.az-key b{display:block;font-size:var(--num-m);font-weight:600;letter-spacing:-.03em;line-height:1.15;font-variant-numeric:tabular-nums;color:var(--ink)}
.az-key span{display:block;font-size:13px;color:var(--muted);white-space:nowrap}
.az-key em{font-style:normal;display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:1px;background:var(--c)}
.az-ends{display:flex;gap:28px;margin-top:12px;font-size:13px;color:var(--muted);flex-wrap:wrap}
.az-ends b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.az-ends span:last-child{margin-left:auto}
.az-ends .az-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:1px;background:var(--c)}
.az-say{margin:0 0 14px;font-size:var(--fs-body,14px);color:var(--ink-2);line-height:1.5}
.az-say b{font-size:var(--num-m);font-weight:600;color:var(--ink);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.az-splitc .az-ends{margin-top:12px}
.az-splitc .az-ends span:last-child{margin-left:0}
.az-sectitle span{min-width:0}
.az-two{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:stretch}
.az-two .lx-sec{min-height:76px}
.az-term{display:inline-flex;align-items:center;gap:12px}
.az-ck{display:inline-grid;place-items:center;width:17px;height:17px;padding:0;border:0;border-radius:5px;background:var(--surface);box-shadow:inset 0 0 0 1.5px var(--line-strong);cursor:pointer;flex:none}
.az-ck svg{width:11px;height:11px;fill:none;stroke:#fff;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;opacity:0}
.az-ck.on{background:var(--ink);box-shadow:none}
.az-ck.on svg{opacity:1}
.az-sectitle{display:flex;align-items:baseline;gap:12px;margin:8px 0 -8px}
.az-sectitle h2{font-size:18px;font-weight:600;letter-spacing:-.02em}
.az-sectitle span{font-size:13px;color:var(--muted)}
.az-grid{display:grid;gap:24px}
.az-grid.four{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.az-grid.three{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.az-card{background:#fff;border-radius:var(--r-lg);box-shadow:var(--sh-1);overflow:hidden;display:flex;flex-direction:column;min-width:0}
.az-ph{position:relative;background:linear-gradient(180deg,#F6F5F2,#EFEEEA);display:grid;place-items:center;height:150px;overflow:hidden}
.az-ph svg{display:block}
.az-ph img{width:100%;height:100%;object-fit:contain}
.az-ph.flip svg{transform:scaleX(-1)}
.az-ph .txt{font-size:12.5px;font-weight:500;color:var(--ink-2);line-height:1.35;padding:44px 16px 0;text-align:left;align-self:start;justify-self:start}
.az-body{padding:16px 20px 18px;display:grid;gap:12px}
.az-body.roomy{padding:22px 24px 24px;gap:16px;flex:1;align-content:start}
.az-name{font-size:15px;font-weight:600;letter-spacing:-.015em;line-height:1.25;min-width:0}
.az-name small{display:block;font-size:12.5px;font-weight:400;color:var(--muted);letter-spacing:0;margin-top:2px}
.az-namerow{display:flex;align-items:flex-start;gap:12px}
.az-namerow .lx-stat{margin-left:auto;flex:none}
.az-stats{display:grid;grid-template-columns:repeat(3,auto);justify-content:space-between;gap:10px}
.az-stats.start{justify-content:start;gap:44px}
.az-stats span{display:block;font-size:12px;color:var(--muted);white-space:nowrap}
.az-stats b{display:block;font-size:20px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.2}
.az-stats b i{display:inline-block;width:18px;height:3px;border-radius:2px;background:var(--line-strong);vertical-align:middle}
.az-lock{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);padding-top:12px;border-top:1px solid var(--line)}
.az-lock svg,.az-box svg,.az-ask>svg{width:15px;height:15px;flex:none}
.az-tag{position:absolute;left:10px;top:10px;font-size:11px;font-weight:600;letter-spacing:.04em;background:#fff;color:var(--ink);border-radius:999px;padding:2px 8px;box-shadow:0 0 0 1px var(--line)}
.az-ab{display:grid;grid-template-columns:1fr 1fr;gap:3px}
.az-ab .az-ph{height:128px}
.az-ab .az-ph.win{box-shadow:inset 0 -4px 0 var(--good)}
.az-vs{display:grid;grid-template-columns:1fr 1fr;gap:3px}
.az-vs div{padding:0 2px}
.az-vs span{display:block;font-size:12px;color:var(--muted)}
.az-vs b{display:block;font-size:20px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.2}
.az-vs b.dim{color:var(--faint);font-weight:500}
.az-chance{display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--muted)}
.az-chance .lx-gauge{flex:1}
.az-chance b{color:var(--ink);font-variant-numeric:tabular-nums}
.az-box{display:grid;place-items:center;text-align:center;gap:6px;padding:26px 20px;border-radius:var(--r-tbl,12px);background:var(--band);color:var(--muted);font-size:13px}
.az-box b{color:var(--ink-2);font-weight:600;font-size:13.5px;display:flex;align-items:center;gap:8px}
.az-ask{border-radius:var(--r-card,16px);padding:16px 18px 16px 20px}
.az-ask>svg{color:var(--ink-2)}
@media (max-width:1040px){
  .az-two{grid-template-columns:1fr}
}
@media (max-width:759px){
  .az-when{margin-left:0;width:100%}
  .az-kpis .lx-kpi.lg .v{font-size:var(--num-l)}
  .az-chart{padding:18px 12px 14px}
  .az-camps .lx-table th,.az-camps .lx-table td{padding:0 8px}
  .az-paused{display:block;margin:2px 0 0}
  .az-flag-s{display:block;margin-top:2px}
  .az-lead{flex-direction:column;align-items:flex-start;gap:12px}
  .az-lead .lx-hero-num{font-size:var(--num-xl)}
  .az-lead b{font-size:19px}
  .az-split{height:22px}
  .az-keys{flex-direction:column;gap:10px}
  .az-key.first{flex:none}
  .az-key.mid{margin-right:0}
  .az-ends span:last-child{margin-left:0}
  .az-two .lx-sec{min-height:0;flex-wrap:wrap}
  .az-two .lx-sec .act{margin-left:0;width:100%;order:4}
  .az-two .lx-sec .act .lx-btn{width:100%;height:44px}
  .az-two .lx-table th,.az-two .lx-table td{padding:0 8px}
  .az-sectitle{flex-wrap:wrap;gap:4px 12px}
  .az-stats.start{gap:28px}
  .az-ask .say{flex:1 1 200px}
}
`;
export function css() {
  addStyles('az-css', CSS);
}

/* ---------- numbers ---------- */
const ok = n => n != null && isFinite(n);
/** The source line for any figure Amazon Ads counts itself. */
export const AZ = "Amazon Ads' own count";
/** Whole dollars: "$1,684". */
export const usd = n => money(ok(n) ? Math.round(n) : null);
/** ROAS for Amazon ads, one decimal: "4.2x". */
export const roas = n => (ok(n) ? n.toFixed(1) + 'x' : 'no data');
/** Change as a fraction, or null when there is nothing to compare with. */
export const change = (now, was) => (ok(now) && ok(was) && was !== 0 ? (now - was) / was : null);

/** "Nov 1 to 22" for the window the numbers cover, and how many days that is. */
const md = s => new Date(String(s).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
export function winLabel(w) {
  if (!w || !w.from || !w.to) return 'these dates';
  const a = md(w.from), b = md(w.to);
  return w.from === w.to ? a : a.split(' ')[0] === b.split(' ')[0] ? a + ' to ' + b.split(' ')[1] : a + ' to ' + b;
}
export const winDays = w => (w && w.from && w.to ? Math.round((Date.parse(w.to) - Date.parse(w.from)) / 864e5) + 1 : null);
/** "was $9,870 in the 30 days before" */
export const wasText = (v, w, fmt) => 'was ' + fmt(v) + (winDays(w) ? ` in the ${winDays(w)} days before` : ' the dates before');

export const say = parts => (parts || []).map(p => (p && typeof p === 'object' ? h('b', null, p.b) : p));

/* The padlock is gone (the owner, note 8/11: an unexplained lock reads as broken). A missing number says "Not connected"
   in words, with the reason on hover and tap. */
const lockIcon = () => svgNode(icon('lock'));
export const notConnected = () => def('Not connected', 'not_connected');
/** A quiet line saying what is missing (no padlock). */
export const lockLine = text => h('div', { class: 'az-lock' }, notConnected(), text ? ': ' + text : '');
/** The gray box that says what is missing and what would fill it. */
export function lockBox(title, text) {
  return h('div', { class: 'az-box' }, h('b', null, title), text && h('span', null, text));
}
export { lockIcon };

/** One bar split into parts. parts: [{ value, color }]. label is read out. */
export function splitBar(parts, { thin = false, label } = {}) {
  return h('div', { class: 'az-split' + (thin ? ' thin' : ''), role: 'img', 'aria-label': label || 'Split' },
    parts.filter(p => p.value > 0).map(p => h('i', { style: { '--f': String(p.value), background: p.color } })));
}

/** The plain state for a page whose numbers need the owner's Amazon login (real mode). */
export function needsLogin(ctx, data, { title, what }) {
  const t = (data && data.kpi) || {};
  const none = !ok(t.spend) && !ok(t.sales);
  return empty({
    title: none ? 'No Amazon numbers for this brand' : title,
    text: none ? 'Amazon is not connected in Triple Whale for this brand, so there is nothing to show here yet.'
      : (ok(t.spend) ? 'Amazon ads spent ' + usd(t.spend) + ' in these dates. ' : '') + what,
    action: button('Open the Amazon overview', { href: ctx.href('amazon', 'overview'), icon: 'arrow' }),
  });
}

/* ---------- the weekly chart ---------- */
/** weekChart([{ label, sales, spend, note }])
    Sales is the lead line with a figure on every point. Ad spend is slate columns on the same
    dollar scale, so the gap between the two is the story. Drawn by the kit's one chart. */
export function weekChart(weeks) {
  const b = v => h('b', null, v);
  /* on a phone the spend figures on the columns and the sales figures on the line run into each other: the columns keep only the hover */
  const narrow = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 480px)').matches;
  return lineChart({
    series: [
      { type: 'bar', tone: 'slate', name: 'Ad spend', values: weeks.map(w => w.spend), labels: narrow ? false : v => usd(v) },
      { name: 'Sales', lead: true, points: true, values: weeks.map(w => w.sales), labels: v => usd(v) },
    ],
    labels: weeks.map(w => w.label),
    notes: weeks.map((w, i) => (w.note ? { index: i, text: w.note } : null)).filter(Boolean),
    format: v => money(v, { compact: true }), height: 348, phoneHeight: 310, name: 'Amazon',
    windowLabel: 'Weekly' + (weeks.length ? ', ' + weeks[0].label + ' to ' + weeks[weeks.length - 1].label : ''),
    label: 'Amazon sales and ad spend by week' + (weeks.length ? ', ' + weeks[0].label + ' to ' + weeks[weeks.length - 1].label : ''),
    hover: i => [b('Week of ' + weeks[i].label), h('span', null, 'Sales ', b(usd(weeks[i].sales))), h('span', null, 'Ad spend ', b(usd(weeks[i].spend)))],
  });
}

/* ---------- what the workers already know ---------- */
/** Amazon sales and orders (Triple Whale, through /api/hub/store) and Amazon ad spend and ad sales
    (Triple Whale, through /api/hub/paid?platform=all), with the window before for comparison.
    Two calls. Everything else on these pages has no route yet. */
export async function loadTotals(ctx) {
  if (!ctx.brand) return { window: null, kpi: {} };
  /* act is the brand id from the brands endpoint; the dates are the ones in the page head */
  const q = 'act=' + encodeURIComponent(ctx.brand.id) + `&from=${ctx.range.from}&to=${ctx.range.to}`;
  const [paid, store] = await Promise.all([
    ctx.api('/api/hub/paid?platform=all&' + q, { signal: ctx.signal }),
    ctx.api('/api/hub/store?' + q, { signal: ctx.signal }),
  ]);
  const p = (paid.brands || [])[0] || {}, st = (store.brands || [])[0] || {};
  const row = (p.rows || []).find(x => x.id === 'amazon') || {};
  const cur = (st.cur && st.cur.amazon) || {}, prev = (st.prev && st.prev.amazon) || {};
  const w = paid.window || store.window || {};
  const pos = v => (ok(v) && v > 0 ? v : null);      // Triple Whale sends nothing, or 0, when Amazon is not connected
  return {
    window: { from: w.from, to: w.to },
    kpi: {
      sales: pos(cur.sales), sales_prev: pos(prev.sales), orders: pos(cur.orders),
      spend: pos(row.spend), spend_prev: pos(row.prev_spend),
      ad_sales: ok(row.revenue) ? row.revenue : null, ad_sales_prev: ok(row.prev_revenue) ? row.prev_revenue : null,
    },
  };
}
