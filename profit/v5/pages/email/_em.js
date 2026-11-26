/* Shared by the Email & SMS, Sales and Website pages. Not a route: the file name starts with _.
   What is here and not in the kit: the readers for the email routes, the window before, the small
   "Example" chip for a part that has no data feed yet, a share bar and a stacked split bar. */

import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, money, num, pct, button, empty, statusDot, addStyles } from '../../kit.js';

export const ok = n => n != null && isFinite(n);
export const usd = n => money(ok(n) ? Math.round(n) : null);
export const rate = (v, digits = 1) => (ok(v) ? pct(v, { digits }) : h('span', { class: 'em-none' }, 'none'));
export const sum = (rows, k) => (rows || []).reduce((t, r) => t + (+r[k] || 0), 0);
export const move = (now, was) => (ok(now) && ok(was) && was !== 0 ? (now - was) / was : null);
const iso = d => d.toISOString().slice(0, 10);
export const addDays = (date, n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const shortDate = date => new Date(String(date).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
/** The same number of days, ending the day before the range starts. */
export function before(range) { const to = addDays(range.from, -1); return { from: addDays(to, -(range.days - 1)), to }; }
export const inRange = (date, range) => !!date && String(date).slice(0, 10) >= range.from && String(date).slice(0, 10) <= range.to;
export const noteAt = (days, note) => (note && note.date ? { index: days.findIndex(d => d.date === note.date), text: note.text } : null);

const CSS = `
.em-none{color:var(--faint);font-weight:400}
.em-bad{color:var(--bad);font-weight:600}
.em-tag{margin-left:8px;font-size:11px;font-weight:600;color:var(--muted);background:var(--bg-sunk);border-radius:999px;padding:1px 7px;vertical-align:1px}
.em-tools{display:flex;padding:0 22px 12px}
.em-tools .lx-seg{max-width:100%}
.em-chart{padding:28px 32px 22px}
.em-kpis .lx-kpi .s{flex-wrap:wrap}
.em-kpis .lx-kpi .l{white-space:normal}
.em-ex{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;border:1px dashed var(--line-strong);color:var(--muted);font-size:11.5px;font-weight:550;white-space:nowrap}
.em-big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.em-big>span:last-child{color:var(--muted);font-size:13.5px}
.em-name{display:block;min-width:0;max-width:44ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.em-name small{display:block;font-size:12px;font-weight:400;color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.em-ch{margin-left:8px;font-size:11px;font-weight:600;letter-spacing:.04em;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:1px 7px;vertical-align:1px}
.em-bar{display:inline-flex;align-items:center;gap:10px;justify-content:flex-end}
.em-bar .lx-cellbar{margin-left:0;width:72px}
.em-split{display:flex;gap:3px;height:18px;margin:6px 0 14px}
.em-split>i{display:block;min-width:4px;border-radius:5px;flex:var(--f,1);background:var(--c)}
.em-split>i:first-child{border-radius:10px 5px 5px 10px}
.em-split>i:last-child{border-radius:5px 10px 10px 5px}
.em-keys{display:flex;gap:28px;flex-wrap:wrap}
.em-keys div{min-width:0}
.em-keys b{display:block;font-size:22px;font-weight:600;letter-spacing:-.03em;line-height:1.15;font-variant-numeric:tabular-nums}
.em-keys span{display:block;font-size:13px;color:var(--muted)}
.em-keys em{font-style:normal;display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;vertical-align:1px;background:var(--c)}
.em-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-6);align-items:stretch}
.em-checks{display:flex;gap:10px 28px;flex-wrap:wrap;padding:2px 0 4px}
.em-steps{display:grid;gap:0}
.em-steps>div{display:grid;grid-template-columns:minmax(120px,1fr) minmax(0,2.2fr) auto;gap:16px;align-items:center;height:44px;border-top:1px solid var(--line);font-size:14px}
.em-steps>div:first-child{border-top:0}
.em-steps>div.tot{font-weight:650}
.em-steps .trk{position:relative;height:10px;border-radius:999px;background:var(--bg-sunk)}
.em-steps .trk i{position:absolute;top:0;bottom:0;left:var(--l,0%);width:var(--w,0%);border-radius:999px;background:var(--ink)}
.em-steps .trk i.cut{background:#C9CED9}
.em-steps .n{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;min-width:86px}
.em-steps .n small{color:var(--muted);font-weight:400;margin-left:6px}
.em-wrap .lx-table td.wrap{white-space:normal}
@media (max-width:1040px){.em-two{grid-template-columns:1fr}}
@media (max-width:759px){
  .em-chart{padding:18px 12px 14px}
  .em-kpis .lx-kpi.lg .v{font-size:var(--num-l)}
  .em-name{max-width:46vw}
  .em-bar .lx-cellbar{display:none}
  .em-keys{gap:16px 24px}
  .em-steps>div{grid-template-columns:minmax(96px,1fr) minmax(0,1.2fr) auto;gap:10px;font-size:13.5px}
  .em-steps .n{min-width:0}
  .em-steps .n small{display:none}
  .em-flush .lx-table th,.em-flush .lx-table td{padding-left:8px;padding-right:8px}
  .em-flush .lx-table th:first-child,.em-flush .lx-table td:first-child{padding-left:18px}
}`;
export const css = () => addStyles('em-css', CSS);

/** The chip on a part that is drawn from sample numbers until its data feed exists. */
export const exampleChip = kitExampleChip; /* one version, in the kit */
/** A title and a line under it, with the chart key on the right. */
export function head(title, sub, key) {
  return h('div', { class: 'lx-chart-h' }, h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, title)), sub && h('p', null, sub)), key || null);
}
/** A figure with a thin bar after it, for a table cell. */
export function barCell(text, share) {
  return h('span', { class: 'em-bar' }, text, h('span', { class: 'lx-cellbar', style: { '--v': Math.max(0, Math.min(100, 100 * (share || 0))).toFixed(1) + '%' } }));
}
/** One bar in two or three parts with its key under it. parts: [{ name, value, text, color }] */
export function split(parts, label) {
  const live = parts.filter(p => p.value > 0);
  return [
    h('div', { class: 'em-split', role: 'img', 'aria-label': label || 'Split' }, live.map(p => h('i', { style: { '--f': String(p.value), '--c': p.color } }))),
    h('div', { class: 'em-keys' }, parts.map(p => h('div', null, h('b', null, p.text), h('span', null, h('em', { style: { '--c': p.color } }), p.name)))),
  ];
}
export const channelTag = ch => (ch === 'sms' ? h('span', { class: 'em-ch' }, 'TEXT') : null);
export const flowStatus = s => (s === 'live' ? statusDot('good', 'Live') : s === 'manual' ? statusDot('warn', 'Switched off') : s === 'draft' ? statusDot('off', 'Draft') : statusDot('off', s ? String(s) : 'Unknown'));

/* ---------- readers (real mode only) ---------- */
const act = ctx => encodeURIComponent(ctx.brand.id);
/** One Klaviyo read through the account-health worker. Never throws for "not connected": the answer carries error. */
export async function kl(ctx, what) {
  try {
    const r = await ctx.api(`/api/klaviyo?act=${act(ctx)}&what=${what}`, { worker: 'ah', signal: ctx.signal });
    return r && r.error ? { error: String(r.error) } : r || { error: 'No answer' };
  } catch (e) { if (ctx.signal && ctx.signal.aborted) throw e; return { error: e.message || 'Klaviyo did not answer' }; }
}
/** Email and text sales as Triple Whale carries them, by day, with the window before. */
export async function hubEmail(ctx) {
  const r = await ctx.api(`/api/hub/email?act=${act(ctx)}&from=${ctx.range.from}&to=${ctx.range.to}`, { signal: ctx.signal });
  return (r.brands || [])[0] || {};
}
/** Soft: a second read that may fail without sinking the page. */
export async function soft(ctx, p) { try { return await p; } catch (e) { if (ctx.signal && ctx.signal.aborted) throw e; return null; } }
/** The sample file for this page, for the parts with no data feed yet. Read in real mode too. */
export const example = (ctx, name) => ctx.fixture(name + '.json').catch(() => null);
export const isNotConnected = r => !!(r && r.error && /not connected|not linked|not_linked/i.test(r.error));

/** The plain state when the source is missing. Never a zero. */
export function notConnected(ctx, { title, text, teamText }) {
  const team = !ctx.isClient;
  return empty({ title, text: team && teamText ? teamText : text,
    action: team && ctx.brand ? button('Open integrations', { href: ctx.href('brand-settings', 'integrations') }) : null });
}
export { num, pct };
