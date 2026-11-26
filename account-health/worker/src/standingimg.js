/* THE SCOREBOARD PICTURE (2026-11-22, DM style 'd'). Cole liked "D" most: one designed image of the board, then one
 * short "what to do" line. Locus draws it here as SVG and turns it into a PNG with resvg (WebAssembly), then the DM
 * uploads it to Slack as a file and shows it in an image block by its Slack file id. No public link: client numbers
 * never sit at a URL anyone could open.
 *   boardSvg(rec)            every brand on the War Room (the agency DM)
 *   brandSvg(rec, act, prev) one brand, for a client's hourly update (no calls, no budgets room, no KPI talk)
 *   toPng(svg)               PNG bytes (Inter from jsDelivr, pinned, fetched once per isolate) */
import { Resvg, initWasm } from './vendor/resvg.mjs';
import resvgWasm from './vendor/resvg_bg.wasm';

const FONTS = ['https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Regular.otf',
  'https://cdn.jsdelivr.net/gh/rsms/inter@v3.19/docs/font-files/Inter-Bold.otf'];
let ready = null, fonts = null;
async function boot(fetcher = fetch) {
  if (!ready) ready = initWasm(resvgWasm).catch(e => { ready = null; throw e; });
  if (!fonts) fonts = Promise.all(FONTS.map(u => fetcher(u).then(r => { if (!r.ok) throw new Error(`font ${r.status}`); return r.arrayBuffer(); })))
    .then(a => a.map(b => new Uint8Array(b))).catch(e => { fonts = null; throw e; });
  /* When the wasm fails first, the fonts promise is never awaited here: mark it handled (the caller still sees the error). */
  fonts.catch(() => {});
  await ready; return fonts;
}
export async function toPng(svg, fetcher, width = 3200) {
  const fontBuffers = await boot(fetcher);
  const r = new Resvg(svg, { font: { fontBuffers, defaultFontFamily: 'Inter', loadSystemFonts: false }, fitTo: { mode: 'width', value: width } });
  return r.render().asPng();
}

/* ---------- drawing ---------- */
/* Light Mobius look (Cole 2026-11-24: not the dark one): white cards on a soft grey page, Mobius blue accents. */
const C = { bg: '#F5F7FB', card: '#FFFFFF', line: '#E3E8F0', text: '#0E1B2E', dim: '#66748C', green: '#0F9D63', yellow: '#C98A00', red: '#D33A50', blue: '#2A9FD8', track: '#E8EDF4' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const k = v => v == null ? 'n/a' : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`;
const money = v => v == null ? 'n/a' : `$${Math.round(v).toLocaleString('en-US')}`;
const x = v => v == null ? 'n/a' : v >= 10 ? `${v.toFixed(1)}x` : `${v.toFixed(2)}x`;
const T = (px, py, s, o = {}) => `<text x="${px}" y="${py}" font-family="Inter" font-size="${o.size || 16}" font-weight="${o.bold ? 700 : 400}" fill="${o.fill || C.text}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${esc(s)}</text>`;
const R = (px, py, w, h, fill, r = 0) => `<rect x="${px}" y="${py}" width="${Math.max(0, w)}" height="${h}" rx="${r}" fill="${fill}"${fill === C.card ? ` stroke="${C.line}" stroke-width="1.5"` : ''}/>`;
const tone = (v, kpi) => v == null || !kpi ? C.dim : v >= kpi ? C.green : v >= kpi * 0.8 ? C.yellow : C.red;
const CALL = { scale: ['RAISE 50%', C.green], raise: ['RAISE 25%', C.green], hold: ['HOLD', C.yellow], cut: ['CUT 25%', C.red] };
const hourOf = slot => { const h = +String(slot || '').split('T')[1]; return isNaN(h) ? '' : h === 12 ? '12pm' : h === 0 ? '12am' : h < 12 ? `${h}am` : `${h - 12}pm`; };
const dayOf = slot => new Date(String(slot).split('T')[0] + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const bar = (px, py, w, h, p, fill) => R(px, py, w, h, C.track, h / 2) + R(px, py, Math.max(h, w * Math.min(1, Math.max(0, p))), h, fill, h / 2);
/* Each brand counts from its own sale start; before it starts (once any sale is live) it is shown, not counted. */
export const counted = (rec, b) => !!rec.dry || !b.mode || b.mode !== 'plan';
const dayShort = ymd => ymd ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const CALLCOL = { scale: C.green, raise: C.green, hold: C.yellow, cut: C.red };
const svgWrap = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${R(0, 0, W, H, C.bg)}${body}</svg>`;

function sums(rec) {
  const ok = rec.brands.filter(b => !b.no_sales && b.so_far && b.so_far.sales != null);
  const live = ok.filter(b => counted(rec, b));
  const s = live.reduce((t, b) => t + b.so_far.sales, 0), p = live.reduce((t, b) => t + b.so_far.spend, 0), g = ok.reduce((t, b) => t + (b.goal || 0), 0);
  return { s, p, g, mer: p ? s / p : null };
}

/** Every brand: totals on top, then one row per brand (sales vs goal bar, MER so far, last 6h, budget, the call). */
export function boardSvg(rec) {
  const W = 1200, pad = 40, rowH = 66, B = [...rec.brands].sort((a, b) => ({ cut: 0, scale: 1, raise: 1, hold: 2 }[(a.suggest || {}).call] ?? 2) - ({ cut: 0, scale: 1, raise: 1, hold: 2 }[(b.suggest || {}).call] ?? 2));
  const S = sums(rec), top = 210, H = top + 50 + B.length * rowH + 60;
  let o = T(pad, 58, 'WHERE WE STAND', { size: 15, bold: true, fill: C.dim, ls: 2 })
    + T(W - pad, 58, `${dayOf(rec.slot)} · ${hourOf(rec.slot)} CT${rec.dry ? ' · dry run' : ''}`, { size: 15, fill: C.dim, anchor: 'end' })
    + T(pad, 118, k(S.s), { size: 52, bold: true }) + T(pad + 18 + k(S.s).length * 33, 118, `of ${k(S.g)} sale goal, all brands`, { size: 22, fill: C.dim })
    + bar(pad, 140, 640, 14, S.g ? S.s / S.g : 0, C.blue) + T(pad + 656, 153, `${S.g ? Math.round(S.s / S.g * 100) : 0}%`, { size: 16, bold: true });
  const tile = (px, label, val, fill) => R(px, 82, 150, 82, C.card, 12) + T(px + 18, 112, label, { size: 13, fill: C.dim, bold: true, ls: 1 }) + T(px + 18, 150, val, { size: 28, bold: true, fill: fill || C.text });
  o += tile(W - pad - 310, 'MER', x(S.mer), tone(S.mer, 2.5)) + tile(W - pad - 150, 'AD SPEND', k(S.p));
  const cols = [pad + 20, 300, 610, 740, 880, 1010];
  o += R(pad, top - 8, W - 2 * pad, 40 + B.length * rowH + 8, C.card, 14);
  ['BRAND', 'SALES VS GOAL', 'MER', 'LAST 6H', 'BUDGET', 'CALL'].forEach((h, i) => { o += T(cols[i], top + 22, h, { size: 12, bold: true, fill: C.dim, ls: 1.5 }); });
  B.forEach((b, i) => {
    const y = top + 40 + i * rowH, s = b.so_far || {}, l6 = b.last6 || {}, g = b.suggest || {}, m = b.meta || {}, mid = y + rowH / 2;
    if (i) o += R(pad + 16, y, W - 2 * pad - 32, 1, C.line);
    /* C's color bar (Cole liked option C's colors): a stripe in the call's color on every row. */
    const pre = !counted(rec, b);
    o += R(pad + 6, y + 12, 5, rowH - 24, pre ? C.dim : CALLCOL[g.call] || C.yellow, 2.5);
    o += T(cols[0], mid + 6, b.name, { size: 20, bold: true });
    if (pre) {
      o += T(cols[1], mid - 4, `Sale starts ${dayShort(b.sale && b.sale.start)}`, { size: 16, bold: true, fill: C.dim }) + T(cols[1], mid + 18, `goal ${k(b.goal)} · counts from then`, { size: 13, fill: C.dim });
      o += T(cols[4], mid + 7, m.camp && m.camp.daily ? `${money(m.camp.daily)}/d` : 'n/a', { size: 18, fill: C.dim });
      o += R(cols[5], mid - 17, 130, 34, C.dim + '33', 17) + T(cols[5] + 65, mid + 6, 'NOT YET', { size: 14, bold: true, fill: C.dim, anchor: 'middle' });
      return;
    }
    if (b.no_sales) o += T(cols[1], mid + 6, `${k(s.spend)} spent · no sales feed`, { size: 15, fill: C.dim });
    else o += T(cols[1], mid - 4, `${k(s.sales)} of ${k(b.goal)}`, { size: 16, bold: true }) + bar(cols[1], mid + 8, 260, 8, b.goal ? s.sales / b.goal : 0, C.blue);
    o += `<circle cx="${cols[2] + 7}" cy="${mid}" r="7" fill="${tone(s.mer, b.kpi)}"/>` + T(cols[2] + 22, mid + 7, x(s.mer), { size: 20, bold: true });
    o += T(cols[3], mid + 7, x(l6.mer), { size: 18, fill: tone(l6.mer, b.kpi) === C.dim ? C.dim : tone(l6.mer, b.kpi) });
    o += T(cols[4], mid + 7, m.camp && m.camp.daily ? `${money(m.camp.daily)}/d` : 'n/a', { size: 18 });
    const [lab, col] = CALL[g.call] || CALL.hold;
    o += R(cols[5], mid - 17, 130, 34, col + '33', 17) + T(cols[5] + 65, mid + 6, lab, { size: 14, bold: true, fill: col, anchor: 'middle' });
  });
  o += T(pad, H - 24, `Sales and MER from Triple Whale, each brand from its own sale start · budgets from Meta · dot = MER vs KPI${rec.next ? ` · next ${rec.next}` : ''}`, { size: 13, fill: C.dim });
  return svgWrap(W, H, o);
}


/** The check-in picture (Cole 2026-11-25: "a nice photo to read, with the buttons underneath"). One card per brand:
 *  Last 6 hours / Today / This week (MER big, colored against the goal; sales and ad spend under it), then the call
 *  naming the campaign it changes, then at most two other campaigns worth a look. Approve buttons sit under it in Slack. */
function holdWhy(b) {
  const g = b.suggest || {}, m = b.meta || {}, c = m.camp;
  if (b.watch) return 'Fela runs these budgets';
  if (b.no_sales) return 'no sales feed, spend only';
  if (b.mode === 'after') return 'sale ended';
  if (/would not get spent/.test(g.why || '') && c) return `spent only ${money(c.spent)} of ${money(c.daily)} today, so more would not get spent`;
  if (/too early|not enough/i.test(g.why || '')) return 'too early to judge today';
  if (g.note) return g.note.replace(/\.$/, '');
  return 'between break-even and goal';
}
/** A raise on a campaign that is not earning (Cole 2026-11-25: "what if it starts trying to scale and none of the ads are
 *  doing well?"): the warning that rides on the call, in the picture and on the Approve line. Null when nothing to say. */
export function callWarn(b) {
  const g = b.suggest || {}, m = b.meta || {}, c = m.camp;
  if (!g.to || !(g.pct > 0) || !c) return null;
  const me = (m.camps || []).find(z => z.id === c.id);
  /* Judged on TODAY (Cole 2026-11-25), once it has spent $100 today. */
  if (!me || me.spent < 100 || me.t_roas == null) return null;
  const read = (m.camps || []).filter(z => z.t_roas != null && z.spent >= 100);
  if (me.t_roas < 1) return `${c.name} made only ${x(me.t_roas)} today. Check its ads first`;
  if (read.length > 1 && read.every(z => z.id === me.id || z.t_roas > me.t_roas)) return `${c.name} is the weakest campaign today (${x(me.t_roas)}). Check its ads first`;
  return null;
}
const KINDW = { sale: 'Sale', evergreen: 'Evergreen', leads: 'Leads', creators: 'Creators', other: 'Other' };
export function opsSvg(rec) {
  const W = 1200, pad = 40, gap = 18, top = 110, rowH = 30;
  const B = [...rec.brands].sort((a, b) => ((b.suggest || {}).to ? 1 : 0) - ((a.suggest || {}).to ? 1 : 0));
  const hOf = b => { const n = ((b.meta || {}).camps || []).length; return 200 + (callWarn(b) ? 28 : 0) + (n ? 44 + n * rowH : 0) + 20; };
  const H = top + B.reduce((t, b) => t + hOf(b) + gap, 0) + 50;
  let o = T(pad, 58, 'WHERE WE STAND', { size: 15, bold: true, fill: C.dim, ls: 2 })
    + T(W - pad, 58, `${dayOf(rec.slot)} · ${hourOf(rec.slot)} CT`, { size: 15, fill: C.dim, anchor: 'end' })
    + T(pad, 88, 'MER = store sales ÷ all ad spend. Green at or over goal, yellow under goal, red under break-even.', { size: 14, fill: C.dim });
  let y = top;
  for (const b of B) {
    const cardH = hOf(b), g = b.suggest || {}, m = b.meta || {}, c = m.camp;
    const line = b.hold ?? (b.kpi ? b.kpi * 0.8 : null);
    const col = v => v == null || !b.kpi ? C.dim : v >= b.kpi ? C.green : line != null && v < line ? C.red : C.yellow;
    o += R(pad, y, W - 2 * pad, cardH, C.card, 16);
    o += R(pad, y + 14, 6, cardH - 28, col(b.today && b.today.mer), 3);
    o += T(pad + 28, y + 42, b.name, { size: 24, bold: true });
    o += T(pad + 28 + b.name.length * 14 + 16, y + 42, `goal ${x(b.kpi)}${line ? ` · break-even ${x(line)}` : ''}`, { size: 15, fill: C.dim });
    const done = (rec.approved || {})[b.act_id];
    const [lab, lc] = done ? ['APPROVED', C.blue] : g.to ? (g.pct < 0 ? CALL.cut : CALL[g.call] || CALL.raise) : CALL.hold;
    o += R(W - pad - 168, y + 18, 146, 36, lc + '26', 18) + T(W - pad - 95, y + 42, lab, { size: 15, bold: true, fill: lc, anchor: 'middle' });
    const wins = [['LAST 6 HOURS', b.last6], ['TODAY', b.today], ['THIS WEEK', b.week]], tw = (W - 2 * pad - 56 - 2 * 16) / 3;
    wins.forEach(([l, p], j) => {
      const px = pad + 28 + j * (tw + 16), py = y + 62;
      o += R(px, py, tw, 86, C.bg, 12) + T(px + 16, py + 24, l, { size: 12, bold: true, fill: C.dim, ls: 1.2 });
      if (!p || p.sales == null) { o += T(px + 16, py + 62, b.no_sales && p && p.spend != null ? `${money(p.spend)} spent` : 'no data yet', { size: 18, fill: C.dim }); return; }
      o += T(px + 16, py + 62, x(p.mer), { size: 30, bold: true, fill: col(p.mer) });
      o += T(px + 16 + x(p.mer).length * 18 + 12, py + 50, `${money(p.sales)} sales`, { size: 14 }) + T(px + 16 + x(p.mer).length * 18 + 12, py + 70, `${money(p.spend)} ad spend`, { size: 14, fill: C.dim });
    });
    const cn = c ? c.name : 'no live sale campaign';
    let call;
    if (done) call = `Approved: ${cn}  ${money(done.from)} → ${money(done.to)} a day`;
    else if (g.to && c) call = `${g.pct < 0 ? 'Cut' : 'Raise'} ${cn}  ${money(c.daily)} → ${money(g.to)} a day`;
    else call = `Hold ${cn}${c && c.daily ? ` at ${money(c.daily)} a day` : ''}: ${holdWhy(b)}`;
    let cy = y + 182;
    o += T(pad + 28, cy, call.length > 100 ? call.slice(0, 98) + '…' : call, { size: 18, bold: true });
    const warn = callWarn(b);
    if (warn) { cy += 28; o += T(pad + 28, cy, `⚠ ${warn}`, { size: 15, bold: true, fill: C.red }); }
    else if (b.mode === 'plan' && b.sale) { o += T(W - pad - 24, cy, `Black Friday starts ${dayShort(b.sale.start)}`, { size: 14, fill: C.dim, anchor: 'end' }); }
    /* the campaign table: every live campaign, today against its budget, the last 3 days (Triple Whale last click) */
    const camps = m.camps || [];
    if (camps.length) {
      const cx = [pad + 28, 560, 680, 860, 980, W - pad - 28], ty = cy + 40;
      ['CAMPAIGN', 'TYPE', 'TODAY', '3 DAYS SPEND', 'SALES', 'RETURN'].forEach((h, k) => { o += T(cx[k], ty, h, { size: 11, bold: true, fill: C.dim, ls: 1.2, anchor: k === 5 ? 'end' : undefined }); });
      camps.forEach((z, k) => {
        const ry = ty + 10 + k * rowH, isCall = c && c.id === z.id;
        if (isCall) o += R(pad + 18, ry, W - 2 * pad - 36, rowH - 2, '#E6F4FB', 8);
        const nm = z.name.length > 44 ? z.name.slice(0, 43) + '…' : z.name;
        o += T(cx[0] + 4, ry + 20, nm + (isCall ? '  ← the call' : ''), { size: 14, bold: isCall });
        o += T(cx[1], ry + 20, KINDW[z.kind] || 'Other', { size: 14, fill: C.dim });
        o += T(cx[2], ry + 20, z.daily ? `${money(z.spent)} of ${money(z.daily)}` : `${money(z.spent)} (set budgets)`, { size: 14 });
        o += T(cx[3], ry + 20, money(z.spend3), { size: 14 });
        o += T(cx[4], ry + 20, String(z.sales3 || 0), { size: 14 });
        o += T(cx[5] - 4, ry + 20, z.roas3 != null && z.spend3 >= 50 ? x(z.roas3) : 'new', { size: 15, bold: true, fill: z.roas3 != null && z.spend3 >= 50 ? C.text : C.dim, anchor: 'end' });
      });
    }
    y += cardH + gap;
  }
  o += T(pad, H - 20, `Sales from Triple Whale, spend from Meta. Campaign sales and return = Triple Whale last click, last 3 days.${rec.next ? ` Next check-in ${rec.next}.` : ''}`, { size: 13, fill: C.dim });
  return svgWrap(W, H, o);
}
/** ONE brand's card as its own picture (Cole 2026-11-25: the all-brands picture was too big to read in Slack and zoomed
 *  too far). Narrow (800 wide) with big type, so it reads at Slack's width without zooming; its Approve sits under it. */
export function opsBrandSvg(rec, b) {
  const W = 800, pad = 28, rowH = 40, g = b.suggest || {}, m = b.meta || {}, c = m.camp;
  const camps = m.camps || [], warn = callWarn(b);
  const line = b.hold ?? (b.kpi ? b.kpi * 0.8 : null);
  const col = v => v == null || !b.kpi ? C.dim : v >= b.kpi ? C.green : line != null && v < line ? C.red : C.yellow;
  const callY = 290, warnH = warn ? 34 : 0, tableTop = callY + warnH + 46;
  const H = tableTop + (camps.length ? 52 + camps.length * rowH : 0) + 24;
  let o = R(0, 0, 10, H, col(b.today && b.today.mer));
  o += T(pad + 10, 52, b.name, { size: 34, bold: true });
  o += T(pad + 10, 84, `goal ${x(b.kpi)}${line ? ` · break-even ${x(line)}` : ''} · ${dayOf(rec.slot)} ${hourOf(rec.slot)} CT`, { size: 19, fill: C.dim });
  const done = (rec.approved || {})[b.act_id];
  const [lab, lc] = done ? ['APPROVED', C.blue] : g.to ? (g.pct < 0 ? CALL.cut : CALL[g.call] || CALL.raise) : CALL.hold;
  o += R(W - pad - 170, 24, 170, 44, lc + '26', 22) + T(W - pad - 85, 54, lab, { size: 19, bold: true, fill: lc, anchor: 'middle' });
  /* three windows */
  const wins = [['LAST 6 HOURS', b.last6], ['TODAY', b.today], ['THIS WEEK', b.week]], tw = (W - 2 * pad - 10 - 2 * 12) / 3;
  wins.forEach(([l, p], j) => {
    const px = pad + 10 + j * (tw + 12), py = 108;
    o += R(px, py, tw, 146, C.bg, 14) + T(px + 16, py + 30, l, { size: 15, bold: true, fill: C.dim, ls: 1 });
    if (!p || p.sales == null) { o += T(px + 16, py + 82, b.no_sales && p && p.spend != null ? `${money(p.spend)} spent` : 'no data yet', { size: 22, fill: C.dim }); return; }
    o += T(px + 16, py + 80, x(p.mer), { size: 40, bold: true, fill: col(p.mer) });
    o += T(px + 16, py + 108, `${money(p.sales)} sales`, { size: 18 }) + T(px + 16, py + 132, `${money(p.spend)} spend`, { size: 18, fill: C.dim });
  });
  /* the call */
  const cn = c ? c.name : 'no live sale campaign';
  let call;
  if (done) call = `Approved: ${cn} ${money(done.from)} → ${money(done.to)}/day`;
  else if (g.to && c) call = `${g.pct < 0 ? 'Cut' : 'Raise'} ${cn}: ${money(c.daily)} → ${money(g.to)}/day`;
  else call = `Hold ${cn}: ${holdWhy(b)}`;
  o += T(pad + 10, callY, call.length > 62 ? call.slice(0, 61) + '…' : call, { size: 24, bold: true });
  if (warn) o += T(pad + 10, callY + 34, `⚠ ${warn.length > 72 ? warn.slice(0, 71) + '…' : warn}`, { size: 18, bold: true, fill: C.red });
  /* campaigns */
  if (camps.length) {
    /* Cole 2026-11-25: per campaign, TODAY and THIS WEEK only. Today = spent / budget, orders, ROAS; this week =
       Monday to now, orders and ROAS. Orders and ROAS = Triple Whale last click. */
    const cx = [pad + 10, 300, 445, 530, 640, W - pad - 6];
    o += T(cx[1], tableTop, 'TODAY', { size: 13, bold: true, fill: C.dim, ls: 1 }) + R(cx[1], tableTop + 7, 300, 1.5, C.line);
    o += T(cx[4], tableTop, 'THIS WEEK', { size: 13, bold: true, fill: C.dim, ls: 1 }) + R(cx[4], tableTop + 7, cx[5] - cx[4], 1.5, C.line);
    ['CAMPAIGN', 'SPENT / BUDGET', 'ORDERS', 'ROAS', 'ORDERS', 'ROAS'].forEach((h, k) => { o += T(cx[k], tableTop + 26, h, { size: 13, bold: true, fill: C.dim, ls: 1, anchor: k === 5 ? 'end' : undefined }); });
    const rs = v => v == null ? '–' : x(v);
    camps.forEach((z, k) => {
      const ry = tableTop + 34 + k * rowH, isCall = c && c.id === z.id;
      if (isCall) o += R(pad, ry, W - 2 * pad, rowH - 4, '#E6F4FB', 10);
      const nm = z.name.length > 22 ? z.name.slice(0, 21) + '…' : z.name;
      o += T(cx[0], ry + 25, nm, { size: 18, bold: isCall });
      o += T(cx[1], ry + 25, z.daily ? `${money(z.spent)}/${money(z.daily)}` : money(z.spent), { size: 18 });
      o += T(cx[2], ry + 25, String(z.t_ord || 0), { size: 18 });
      o += T(cx[3], ry + 25, rs(z.t_roas), { size: 19, bold: true });
      o += T(cx[4], ry + 25, String(z.w_ord || 0), { size: 18 });
      o += T(cx[5], ry + 25, rs(z.w_roas), { size: 19, bold: true, anchor: 'end' });
    });
  }
  return svgWrap(W, H, R(0, 0, W, H, C.card) + o);
}
/** One brand, for its client: sales vs the weekend goal, ad spend, MER, the last hour. Nothing internal. */
/* did = {text, up}: the change we just made, drawn as a "What we did" band under the tiles (the client update, Cole 2026-11-24). */
export function brandSvg(rec, act, prev, did = null) {
  const b = rec.brands.find(z => z.act_id === act); if (!b) return null;
  const W = 1200, H = did ? 560 : 470, pad = 40, s = b.so_far || {}, l6 = b.last6 || {};
  const o0 = prev && prev.brands ? prev.brands.find(z => z.act_id === act) : null, pre = !counted(rec, b), start = b.sale && b.sale.start;
  const col = pre ? C.dim : tone(s.mer, b.kpi) === C.dim ? C.yellow : tone(s.mer, b.kpi);
  const dS = o0 && o0.so_far && s.sales != null ? s.sales - (o0.so_far.sales || 0) : null;
  let o = R(0, 0, 10, H, col) + T(pad, 58, `${b.name.toUpperCase()} · BLACK FRIDAY SALE`, { size: 15, bold: true, fill: C.dim, ls: 2 })
    + T(W - pad, 58, `${dayOf(rec.slot)} · ${hourOf(rec.slot)} CT${rec.dry ? ' · dry run' : ''}`, { size: 15, fill: C.dim, anchor: 'end' })
    + T(pad, 140, k(s.sales), { size: 76, bold: true }) + T(pad + 16 + k(s.sales).length * 45, 140, `in sales so far`, { size: 24, fill: C.dim })
    + bar(pad, 168, W - 2 * pad - 90, 16, b.goal ? (s.sales || 0) / b.goal : 0, C.blue)
    + T(W - pad, 183, `${b.goal ? Math.round((s.sales || 0) / b.goal * 100) : 0}%`, { size: 20, bold: true, anchor: 'end' })
    + T(pad, 214, pre ? `Sale goal ${money(b.goal)} · the sale starts ${dayShort(start)}, these are today's numbers` : `Sale goal ${money(b.goal)} · the whole sale so far, since ${dayShort(rec.dry ? rec.today : start)}`, { size: 15, fill: C.dim });
  const tile = (i, label, val, sub, fill) => { const w = (W - 2 * pad - 3 * 20) / 4, px = pad + i * (w + 20);
    return R(px, 250, w, 160, C.card, 14) + T(px + 24, 290, label, { size: 13, bold: true, fill: C.dim, ls: 1.5 }) + T(px + 24, 350, val, { size: 40, bold: true, fill: fill || C.text }) + T(px + 24, 386, sub, { size: 15, fill: C.dim }); };
  o += tile(0, 'AD SPEND', k(s.spend), 'Meta')
    + tile(1, 'MER', x(s.mer), `sale so far · goal ${x(b.kpi)}`, tone(s.mer, b.kpi))
    + tile(2, 'LAST 6 HOURS', x(l6.mer), `MER · ${k(l6.sales)} on ${k(l6.spend)}`, tone(l6.mer, b.kpi))
    + tile(3, 'SINCE LAST UPDATE', dS == null ? 'first' : `+${k(dS)}`, dS == null ? 'update today' : 'in sales');
  if (did) {
    const dc = did.up ? C.green : did.up === false ? C.red : C.yellow;
    o += R(pad, 430, W - 2 * pad, 80, C.card, 14) + R(pad, 430, 8, 80, dc, 4)
      + T(pad + 28, 462, 'WHAT WE DID', { size: 13, bold: true, fill: C.dim, ls: 1.5 })
      + T(pad + 28, 494, did.text, { size: 24, bold: true });
  }
  o += T(pad, H - 22, 'Sales from Triple Whale · MER = store sales ÷ ad spend', { size: 13, fill: C.dim });
  return svgWrap(W, H, o);
}

/** The first window of a client update (War Room 2.9 W2): "Since <last check-in>" when the brand carries `prev` from a
 *  check-in earlier the same day (per-brand cadence), today minus what that check-in saw. Null otherwise, and the
 *  update keeps its Last 6 hours window exactly as before. */
export function sinceWin(rec, b) {
  const p = b && b.prev, t = b && b.today;
  if (!p || !p.today || !t || String(p.slot || '').split('T')[0] !== String(rec.slot || '').split('T')[0]) return null;
  const d = k => t[k] == null || p.today[k] == null ? null : Math.max(0, t[k] - p.today[k]);
  const sales = d('sales'), spend = d('spend');
  return { label: `Since ${hourOf(p.slot)}`, p: { sales, spend, mer: sales != null && spend > 0 ? sales / spend : null } };
}
/* Client card colors (War Room 2.7): the Slack update's TIER green, gray and yellow, three words, no break-even. */
const CT = { up: ['#2EB67D', '#1E8A5C', 'Above goal'], near: ['#A3ADBF', C.dim, 'Around goal'], down: ['#ECB22E', C.yellow, 'Under goal'] };
const ctier = (mer, kpi) => mer == null || !kpi ? null : mer >= kpi ? CT.up : mer >= kpi * 0.9 ? CT.near : CT.down;
/** The client update as one picture (War Room 2.7): name and time, the goal, three windows (MER big in its color, sales
 *  and ad spend under it), what we changed since the last update with its reason, the footer. Nothing internal: no
 *  break-even, no budgets room, no campaign returns. did = [{line, why}]. */
export function clientCardSvg(rec, act, did = []) {
  const b = (rec.brands || []).find(z => z.act_id === act); if (!b) return null;
  const W = 1200, pad = 40, since = sinceWin(rec, b), items = (did || []).slice(0, 6);
  const next = 'next' in b ? b.next : rec.next;
  const bandH = 64 + (items.length ? items.reduce((t, i) => t + (i.why ? 62 : 38), 0) : 38), H = 330 + bandH + 70;
  let o = R(0, 0, W, H, C.card) + R(0, 0, W, 8, C.blue);
  o += T(pad, 58, `${String(b.name || '').toUpperCase()} · BLACK FRIDAY`, { size: 16, bold: true, fill: C.dim, ls: 2 })
    + T(W - pad, 58, `${dayOf(rec.slot)} · ${hourOf(rec.slot)} CT`, { size: 16, fill: C.dim, anchor: 'end' })
    + T(pad, 92, `Goal ${x(b.kpi)} MER`, { size: 20, bold: true });
  const wins = [[since ? since.label.toUpperCase() : 'LAST 6 HOURS', since ? since.p : b.last6], ['TODAY', b.today], ['THIS WEEK', b.week]];
  const tw = (W - 2 * pad - 2 * 20) / 3;
  wins.forEach(([l, p], j) => {
    const px = pad + j * (tw + 20), py = 120, tr = p && p.sales != null ? ctier(p.mer, b.kpi) : null;
    o += R(px, py, tw, 186, C.bg, 14) + R(px, py, tw, 6, tr ? tr[0] : C.line, 3) + T(px + 22, py + 40, l, { size: 14, bold: true, fill: C.dim, ls: 1.5 });
    if (!p || p.sales == null) { o += T(px + 22, py + 104, 'no data yet', { size: 24, fill: C.dim }); return; }
    o += T(px + 22, py + 104, x(p.mer), { size: 54, bold: true, fill: tr ? tr[1] : C.text });
    if (tr) o += T(px + tw - 22, py + 40, tr[2], { size: 14, bold: true, fill: tr[1], anchor: 'end' });
    o += T(px + 22, py + 140, `${money(p.sales)} sales`, { size: 19 }) + T(px + 22, py + 168, `${money(p.spend)} ad spend`, { size: 19, fill: C.dim });
  });
  let y = 330;
  o += R(pad, y, W - 2 * pad, bandH, C.bg, 14) + R(pad, y, 8, bandH, C.blue, 4) + T(pad + 28, y + 36, 'WHAT WE CHANGED', { size: 14, bold: true, fill: C.dim, ls: 1.5 });
  y += 36;
  if (!items.length) o += T(pad + 28, y + 32, 'No changes since the last update', { size: 21, bold: true });
  for (const i of items) {
    const ln = String(i.line || ''), wy = String(i.why || '');
    o += T(pad + 28, y + 32, ln.length > 80 ? ln.slice(0, 79) + '…' : ln, { size: 21, bold: true });
    if (wy) o += T(pad + 28, y + 56, wy.length > 110 ? wy.slice(0, 109) + '…' : wy, { size: 16, fill: C.dim });
    y += wy ? 62 : 38;
  }
  o += T(pad, H - 30, `${next ? `Next update around ${next} CT · ` : ''}Sales from Triple Whale · MER = store sales / ad spend`, { size: 15, fill: C.dim });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${o}</svg>`;
}
