/* Shared by the Email & SMS, Sales and Website pages. Not a route: the file name starts with _.
   What is here and not in the kit: the readers for the email routes, the window before, the small
   "Example" chip for a part that has no data feed yet, a share bar and a stacked split bar. */

import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, money, num, pct, button, empty, statusDot, addStyles, tipShow, tipHide, sheet, safeHref, svgNode } from '../../kit.js';
import { icon } from '../../icons.js';
import { dl } from '../home/_biz.js';

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
.em-ex{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;border:1px dashed var(--line-strong);color:var(--muted);font-size:11.5px;font-weight:500;white-space:nowrap}
.em-big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.em-big>span:last-child{color:var(--muted);font-size:13.5px}
.em-name{display:block;min-width:0;max-width:44ch;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.em-name small{display:block;font-size:12px;font-weight:400;color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.em-ch{margin-left:8px;font-size:11px;font-weight:600;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:1px 7px;vertical-align:1px}
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
.em-steps>div.tot{font-weight:600}
.em-steps .trk{position:relative;height:10px;border-radius:999px;background:var(--bg-sunk)}
.em-steps .trk i{position:absolute;top:0;bottom:0;left:var(--l,0%);width:var(--w,0%);border-radius:999px;background:var(--ink)}
.em-steps .trk i.cut{background:var(--icon)}
.em-steps .n{font-variant-numeric:tabular-nums;white-space:nowrap;text-align:right;min-width:86px}
.em-steps .n small{color:var(--muted);font-weight:400;margin-left:6px}
.em-wrap .lx-table td.wrap{white-space:normal}
.em-hbars{display:grid;gap:2px}
.em-hbars>div{display:grid;grid-template-columns:minmax(140px,1.2fr) minmax(0,2fr) 84px;align-items:center;gap:14px;min-height:34px;padding:0 8px;border-radius:8px;font-size:13.5px;cursor:default}
.em-hbars>div:hover{background:var(--row-hover)}
.em-hbars .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.em-hbars .tr{position:relative;height:10px;border-radius:999px;background:var(--bg-sunk)}
.em-hbars .tr i{position:absolute;left:0;top:0;bottom:0;width:var(--w,0%);border-radius:999px;background:var(--ink)}
.em-hbars>div.lead .tr i{background:var(--brand)}
.em-hbars .v{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}
.em-sides{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 28px;margin-top:6px}
.em-sides>div{display:grid;gap:0}
.em-sides h4{margin:0 0 4px;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}
.em-sides h4 em{font-style:normal;display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c)}
.em-sides p{display:flex;justify-content:space-between;gap:12px;margin:0;min-height:32px;align-items:center;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.em-sides p b{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.em-more{display:flex;justify-content:center;padding:10px 0 14px}
.em-camps .em-name{max-width:30ch}
.em-camps .lx-table td .sub{display:block;font-size:11.5px;color:var(--muted);font-weight:400}
.em-lab{font-size:13.5px;font-weight:500;color:var(--ink-2)}
.em-num{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.lx-table td.em-go{width:36px;color:var(--faint);text-align:right}
.em-go .lx-ic{width:16px;height:16px;stroke-width:2;transform:rotate(-90deg);vertical-align:middle}
.em-when-s{display:none}
.em-best{font-size:var(--fs-small,12.5px);color:var(--muted)}
@media (max-width:759px){.em-when-l{display:none}.em-when-s{display:inline}}
.lx-table tr.click:hover td.em-go{color:var(--ink)}
.em-sheet{display:grid;gap:18px}
.em-sheet .kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px}
.em-sheet .kv p{display:flex;justify-content:space-between;gap:12px;margin:0;min-height:36px;align-items:center;border-top:1px solid var(--line);font-size:13.5px;color:var(--ink-2)}
.em-sheet .kv p b{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums;text-align:right}
.em-sheet .tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.em-sheet .tiles>div{display:grid;gap:4px;padding:12px 14px;border-radius:12px;background:var(--surface-2)}
.em-sheet .tiles small{font-size:12px;color:var(--muted)}
.em-sheet .tiles b{font-size:var(--num-m);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.em-sheet .tiles span{font-size:12px;color:var(--muted)}
.em-sheet h4{margin:0 0 6px;font-size:13px;font-weight:600}
.em-sheet .msg{display:grid;gap:6px;padding:14px 16px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
.em-sheet .msg small{font-size:12px;color:var(--muted)}
.em-sheet .msg b{font-size:15px;font-weight:600}
.em-sheet .msg p{margin:0;font-size:13.5px;color:var(--ink-2);line-height:1.5}
.em-sheet .msg img{display:block;width:100%;max-height:260px;object-fit:cover;border-radius:8px;background:var(--bg-sunk)}
.em-sheet .quiet{margin:0;font-size:13px;color:var(--muted)}
.em-fun{display:grid;gap:6px}
.em-fun>div{display:grid;grid-template-columns:110px minmax(0,1fr) 110px;gap:12px;align-items:center;font-size:13px}
.em-fun .tr{height:12px;border-radius:999px;background:var(--bg-sunk);position:relative}
.em-fun .tr i{position:absolute;left:0;top:0;bottom:0;width:var(--w,0%);border-radius:999px;background:var(--ink)}
.em-fun>div:last-child .tr i{background:var(--brand)}
.em-fun .v{text-align:right;font-variant-numeric:tabular-nums}
.em-fun .v small{color:var(--muted);margin-left:6px}
@media (max-width:759px){
  .em-hbars>div{grid-template-columns:minmax(0,1fr) 76px;gap:4px 10px;padding:6px 8px}
  .em-hbars .tr{grid-column:1/-1;grid-row:2;height:6px}
  .em-sides{grid-template-columns:1fr}
  .em-sheet .tiles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .em-sheet .kv{grid-template-columns:1fr}
  .em-fun>div{grid-template-columns:84px minmax(0,1fr) 92px}
}
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
export const channelTag = ch => (ch === 'sms' ? h('span', { class: 'em-ch' }, 'Text') : null);
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
/** The row chevron (the same icon as All platforms > Side by side), for a row that opens. */
export const goCell = () => svgNode(icon('chevron'));

/** A labeled horizontal bar list: every row named, with its value, and a hover bubble.
    rows: [{ name, value, text, tip: [nodes] }] */
export function hbars(rows, { lead = 0 } = {}) {
  const max = Math.max(...rows.map(r => r.value || 0), 1);
  return h('div', { class: 'em-hbars', role: 'list' }, rows.map((r, i) => {
    const el = h('div', { class: i === lead ? 'lead' : '', role: 'listitem', title: null },
      h('span', { class: 'nm', title: r.name }, r.name),
      h('span', { class: 'tr' }, h('i', { style: { '--w': (100 * (r.value || 0) / max).toFixed(1) + '%' } })),
      h('span', { class: 'v' }, r.text));
    if (r.tip) { el.addEventListener('mouseenter', () => tipShow(el, r.tip, el.querySelector('.tr'))); el.addEventListener('mouseleave', () => tipHide(el)); }
    return el;
  }));
}
/** "Show all N" under a long table: draws the first `first` rows, and all of them after a tap. build(rows) returns the table. */
export function showMore(rows, first, build, word = 'rows') {
  if (rows.length <= first) return build(rows);
  const box = h('div');
  const draw = all => box.replaceChildren(build(all ? rows : rows.slice(0, first)),
    h('div', { class: 'em-more' }, button(all ? 'Show the latest ' + first : `Show all ${rows.length} ${word}`, { ghost: true, onclick: () => draw(!all) })));
  draw(false);
  return box;
}
/** One campaign, opened from any campaign row: what was sent, to how many, and what it made.
    r: a campaign row ({ name, subject, preview_text, thumbnail, html_url, sent, channel, recipients, open_rate, click_rate,
    orders, sales, unsub_rate, first_time }). Fields a read does not carry are left out; content not read shows one quiet line. */
export function openCampaign(r) {
  const sms = r.channel === 'sms', rec = r.recipients || 0;
  const opened = !sms && ok(r.open_rate) && rec ? Math.round(rec * r.open_rate) : null;
  const clicked = ok(r.click_rate) && rec ? Math.round(rec * r.click_rate) : null;
  const tile = (label, value, sub) => h('div', null, h('small', null, label), h('b', null, value), h('span', null, sub || ''));
  const steps = [['Delivered', rec], !sms && ['Opened', opened], ['Clicked', clicked], ['Ordered', r.orders]].filter(s => s && ok(s[1]));
  const content = r.subject || r.preview_text || r.thumbnail || r.html_url;
  return sheet({ title: r.name, body: h('div', { class: 'em-sheet' },
    h('div', { class: 'msg' },
      h('small', null, [sms ? 'Text' : 'Email', r.sent ? 'sent ' + shortDate(r.sent) : 'not sent yet', ok(r.recipients) ? 'to ' + num(r.recipients) + ' people' : null].filter(Boolean).join(', ')),
      content ? [r.thumbnail ? h('img', { src: r.thumbnail, alt: '', loading: 'lazy' }) : null,
        h('b', null, r.subject || r.name), r.preview_text ? h('p', null, r.preview_text) : null,
        safeHref(r.html_url) ? h('a', { href: safeHref(r.html_url), target: '_blank', rel: 'noopener noreferrer' }, 'Open the ' + (sms ? 'text' : 'email')) : null]
        : h('p', { class: 'quiet' }, 'Preview not available yet: the subject and content are not read for this send.')),
    r.sent ? h('div', { class: 'tiles' },
      tile(dl('Opened', 'open_rate'), sms ? 'text' : ok(r.open_rate) ? pct(r.open_rate, { digits: 1 }) : 'no data', ok(opened) ? num(opened) + ' people' : ''),
      tile(dl('Clicked', 'click_rate'), ok(r.click_rate) ? pct(r.click_rate, { digits: 2 }) : 'no data', ok(clicked) ? num(clicked) + ' people' : ''),
      tile(dl('Orders', { name: 'Orders', definition: 'Orders Klaviyo credits to this send: placed within 5 days of an open or a click.', source: 'Klaviyo' }), ok(r.orders) ? num(r.orders) : 'no data', ok(r.first_time) ? pct(r.first_time) + ' first-time buyers' : ''),
      tile(dl('Sales', 'campaign_sales_klaviyo'), ok(r.sales) ? usd(r.sales) : 'no data', rec && ok(r.sales) ? money(r.sales / rec, { cents: true }) + ' a message' : '')) : h('p', { class: 'quiet' }, 'Results show here once it is sent.'),
    steps.length > 1 ? h('div', null, h('h4', null, 'From delivered to ordered'), h('div', { class: 'em-fun' }, steps.map(([name, v]) =>
      h('div', null, h('span', null, name), h('span', { class: 'tr' }, h('i', { style: { '--w': Math.max(0.5, 100 * v / Math.max(1, rec)).toFixed(2) + '%' } })),
        h('span', { class: 'v' }, num(v), rec && name !== 'Delivered' ? h('small', null, pct(v / rec, { digits: v / rec < 0.01 ? 2 : 1 })) : null))))) : null,
    r.sent ? kv([
      [dl('Sales per message', 'sales_per_message'), rec && ok(r.sales) ? money(r.sales / rec, { cents: true }) : 'no data'],
      ['Unsubscribed', ok(r.unsub_rate) ? pct(r.unsub_rate, { digits: 2 }) + (rec ? ', ' + num(Math.round(rec * r.unsub_rate)) + ' people' : '') : 'no data'],
      ok(r.order_rate) && ['Ordered, of those sent to', pct(r.order_rate, { digits: 2 })],
    ]) : null,
    h('p', { class: 'quiet' }, 'Klaviyo\'s own count for this send.')) });
}

/** One flow, opened from its row: status, channels, messages and results over the last 90 days. */
export function openFlow(r) {
  const ch = (r.channels || []).map(c => (c === 'sms' ? 'Text' : 'Email')).join(' and ') || 'not read';
  const tile = (label, value, sub) => h('div', null, h('small', null, label), h('b', null, value), h('span', null, sub || ''));
  return sheet({ title: r.name + ', last 90 days', body: h('div', { class: 'em-sheet' },
    h('div', { class: 'msg' }, h('small', null, 'Status'), h('b', null, flowStatus(r.status)), h('p', null, 'Sends by ' + ch + '. ' + (r.message_count ? num(r.message_count) + ' messages in the flow.' : ''))),
    h('div', { class: 'tiles' },
      tile(dl('Opened', 'open_rate'), ok(r.open_rate) ? pct(r.open_rate, { digits: 1 }) : 'no data'),
      tile(dl('Clicked', 'click_rate'), ok(r.click_rate) ? pct(r.click_rate, { digits: 1 }) : 'no data'),
      tile('Ordered', ok(r.order_rate) ? pct(r.order_rate, { digits: 1 }) : 'no data', ok(r.orders) ? num(r.orders) + ' orders' : ''),
      tile('Sales', usd(r.sales || 0), r.recipients ? num(r.recipients) + ' messages' : '')),
    kv([[dl('Sales per message', 'sales_per_message'), ok(r.per_recipient) ? money(r.per_recipient, { cents: true }) : 'none'], ['Messages sent', r.recipients ? num(r.recipients) : 'none'], ['Channel', ch]]),
    h('p', { class: 'quiet' }, 'Klaviyo\'s own count over the last 90 days, whatever dates are picked. Each message in the flow is not read on its own yet.')) });
}

/** A little key and value list for a sheet. pairs: [[label, value]] */
export const kv = pairs => h('div', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => h('p', null, h('span', null, k), h('b', null, v))));
