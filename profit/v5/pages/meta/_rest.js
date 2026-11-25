/* Shared by Meta > Live now, Top ads, Suggestions and Changes made: small helpers, the states, the
   local parts the kit does not have (an ad picture tile, the "example" chip) and their layout CSS.
   Every sale, ROAS and cost per sale on these pages is Triple Whale's (last click per platform).
   Spend, budgets and delivery are Meta's. No ember in here. */

import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, svgNode, money, x, empty, button, statusDot, gauge, addStyles } from '../../kit.js';
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
/** A failed side read must not take the page down; a cancelled one still stops the load. */
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
export const foot = text => h('p', { class: 'lx-foot' }, text);
export { statusDot, x };

const CSS = `
.mr-row,.mr-grid,.mr-list,.mr-kp{min-width:0}
.mr-eg{height:22px;font-size:11.5px;font-weight:500}
.mr-bar{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.mr-bar .sp{flex:1}
.mr-bar .mr-note{color:var(--muted);font-size:13px}
.mr-tile{position:relative;display:grid;place-items:center;overflow:hidden;flex:none;border-radius:12px;background:linear-gradient(180deg,#F1F0EC,#E6E4DE);color:var(--faint)}
.mr-tile svg{width:24px;height:24px}
.mr-tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mr-tile.sm{width:56px;height:70px}.mr-tile.xs{width:32px;height:40px;border-radius:8px}.mr-tile.xs svg{width:16px;height:16px}
.mr-tile.lg{width:76px;height:95px}
.mr-kp{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-8)}
.mr-kp .lx-kpi .v{font-size:clamp(30px,3.4vw,44px)}
.mr-kp .lx-kpi .v small{font-size:14px}
.mr-n{font-size:28px;font-weight:600;letter-spacing:-.03em;line-height:1.1;color:var(--ink);font-variant-numeric:tabular-nums}
.mr-dim{color:var(--muted)}.mr-faint{color:var(--faint)}
.mr-num{font-variant-numeric:tabular-nums;white-space:nowrap}
.mr-more{display:flex;justify-content:center;padding:6px 0 0}
@media (max-width:759px){
  .mr-kp{grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-5)}
  .mr-kp .lx-kpi .v{font-size:28px}
  .mr-kp>:last-child:nth-child(odd){grid-column:1/-1}
  .mr-bar{gap:10px}
}`;
export function styles(id, extra) {
  addStyles('mr-css', CSS);
  if (id && extra) addStyles(id, extra);
}
