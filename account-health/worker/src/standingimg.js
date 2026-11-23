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
  await ready; return fonts;
}
export async function toPng(svg, fetcher) {
  const fontBuffers = await boot(fetcher);
  const r = new Resvg(svg, { font: { fontBuffers, defaultFontFamily: 'Inter', loadSystemFonts: false }, fitTo: { mode: 'width', value: 1600 } });
  return r.render().asPng();
}

/* ---------- drawing ---------- */
const C = { bg: '#0F1424', card: '#182036', line: '#26304B', text: '#F4F6FB', dim: '#8C96B2', green: '#2EB67D', yellow: '#ECB22E', red: '#E01E5A', blue: '#5B8DEF', track: '#2A3352' };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const k = v => v == null ? 'n/a' : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`;
const money = v => v == null ? 'n/a' : `$${Math.round(v).toLocaleString('en-US')}`;
const x = v => v == null ? 'n/a' : v >= 10 ? `${v.toFixed(1)}x` : `${v.toFixed(2)}x`;
const T = (px, py, s, o = {}) => `<text x="${px}" y="${py}" font-family="Inter" font-size="${o.size || 16}" font-weight="${o.bold ? 700 : 400}" fill="${o.fill || C.text}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.ls ? ` letter-spacing="${o.ls}"` : ''}>${esc(s)}</text>`;
const R = (px, py, w, h, fill, r = 0) => `<rect x="${px}" y="${py}" width="${Math.max(0, w)}" height="${h}" rx="${r}" fill="${fill}"/>`;
const tone = (v, kpi) => v == null || !kpi ? C.dim : v >= kpi ? C.green : v >= kpi * 0.8 ? C.yellow : C.red;
const CALL = { scale: ['SCALE +50%', C.green], hold: ['HOLD', C.yellow], cut: ['CUT 25%', C.red] };
const hourOf = slot => { const h = +String(slot || '').split('T')[1]; return isNaN(h) ? '' : h === 12 ? '12pm' : h === 0 ? '12am' : h < 12 ? `${h}am` : `${h - 12}pm`; };
const dayOf = slot => new Date(String(slot).split('T')[0] + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const bar = (px, py, w, h, p, fill) => R(px, py, w, h, C.track, h / 2) + R(px, py, Math.max(h, w * Math.min(1, Math.max(0, p))), h, fill, h / 2);
/* Each brand counts from its own sale start; before it starts (once any sale is live) it is shown, not counted. */
export const counted = (rec, b) => !!rec.dry || !b.mode || b.mode !== 'plan';
const dayShort = ymd => ymd ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const CALLCOL = { scale: C.green, hold: C.yellow, cut: C.red };
const svgWrap = (W, H, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${R(0, 0, W, H, C.bg)}${body}</svg>`;

function sums(rec) {
  const ok = rec.brands.filter(b => !b.no_sales && b.so_far && b.so_far.sales != null);
  const live = ok.filter(b => counted(rec, b));
  const s = live.reduce((t, b) => t + b.so_far.sales, 0), p = live.reduce((t, b) => t + b.so_far.spend, 0), g = ok.reduce((t, b) => t + (b.goal || 0), 0);
  return { s, p, g, mer: p ? s / p : null };
}

/** Every brand: totals on top, then one row per brand (sales vs goal bar, MER so far, last 6h, budget, the call). */
export function boardSvg(rec) {
  const W = 1200, pad = 40, rowH = 66, B = [...rec.brands].sort((a, b) => ({ cut: 0, scale: 1, hold: 2 }[(a.suggest || {}).call] ?? 2) - ({ cut: 0, scale: 1, hold: 2 }[(b.suggest || {}).call] ?? 2));
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

/** One brand, for its client: sales vs the weekend goal, ad spend, MER, the last hour. Nothing internal. */
export function brandSvg(rec, act, prev) {
  const b = rec.brands.find(z => z.act_id === act); if (!b) return null;
  const W = 1200, H = 470, pad = 40, s = b.so_far || {}, l6 = b.last6 || {};
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
  o += T(pad, H - 22, 'Sales from Triple Whale · MER = store sales ÷ ad spend', { size: 13, fill: C.dim });
  return svgWrap(W, H, o);
}
