/* The client update card for Black Friday weekend: one layout, drawn two ways.
     cardHtml(d)    HTML for the page preview and the public snapshot link (POST /api/snapshot, opened at s.html?t=)
     cardCanvas(d)  Canvas 2D laid out 1200 wide and drawn at 3.2x (3840 pixels wide, after the fonts load), for
                    Copy as PNG, Download PNG and Download PDF (no route, no library)
   d = { brand, when, goal, tiles: [{ label, mer, sales, spend, readable }], changes: [{ line, why }], next }
   Nothing internal goes on it: no break-even, no budget room, no campaign returns. Sales are Triple Whale. */

import { tierOf } from '../_warcall.js';
import { copyCanvas, downloadCanvas, downloadPdf, hiCanvas, fontsReady } from './_export.js';

const C = { bg: '#FFFFFF', tile: '#F5F7FB', line: '#E3E8F0', text: '#0E1B2E', dim: '#66748C', blue: '#2A9FD8', blueBg: '#EAF6FC' };
const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";
const ok = n => n != null && isFinite(n);
const usd = v => ok(v) ? '$' + Math.round(v).toLocaleString('en-US') : 'n/a';
const xx = v => ok(v) ? v.toFixed(2) + 'x' : 'n/a';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* The card is a picture the client cannot hover, so its one line keeps a short source note (the page itself has no footers). */
export const FOOT = d => `Next update around ${d.next || 'the next check-in'} · Sales from Triple Whale · Store MER = all store sales / all ad spend`;
/** The one sentence for "nothing changed", on the card and in the text that goes with it. */
export const NONE = 'No budget changes since the last update.';

/** The CSS the HTML card needs (also sent with the snapshot). Tiles stack on a phone. */
export const CARD_CSS = `
.wcc{font-family:${FONT};background:${C.bg};color:${C.text};border:1px solid ${C.line};border-radius:20px;padding:22px;display:grid;gap:16px;max-width:760px;box-sizing:border-box}
.wcc *{box-sizing:border-box}
.wcc-top{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;align-items:baseline}
.wcc-top b{font-size:14px;letter-spacing:.08em;text-transform:uppercase;font-weight:750}
.wcc-top span{font-size:13px;color:${C.dim}}
.wcc-goal{font-size:13px;color:${C.dim};margin-top:-10px}
.wcc-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.wcc-t{background:${C.tile};border-radius:14px;padding:12px 14px;display:grid;gap:3px;min-width:0}
.wcc-t .l{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${C.dim}}
.wcc-t .m{font-size:28px;font-weight:750;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.wcc-t .n{font-size:12.5px;color:${C.text};font-variant-numeric:tabular-nums}
.wcc-t .w{font-size:12px;font-weight:600}
.wcc-ch{background:${C.blueBg};border-radius:14px;padding:12px 14px;display:grid;gap:8px}
.wcc-ch .h{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${C.blue}}
.wcc-ch p{margin:0;font-size:13.5px;line-height:1.45}
.wcc-ch p small{display:block;color:${C.dim};font-size:12.5px}
.wcc-foot{font-size:11.5px;color:${C.dim};line-height:1.5}
@media (max-width:560px){.wcc{padding:16px}.wcc-tiles{grid-template-columns:1fr}.wcc-t{grid-template-columns:auto 1fr;column-gap:12px;align-items:baseline}.wcc-t .m{grid-row:span 3;font-size:24px}}`;

/** The card as HTML (a string, so it can go on a snapshot as is). */
export function cardHtml(d) {
  const tile = t => {
    const tr = t.readable ? tierOf(t.mer, d.goal) : { color: C.dim, word: 'Too little to read yet' };
    return `<div class="wcc-t"><span class="l">${esc(t.label)}</span><span class="m" style="color:${tr.color}">${esc(xx(t.mer))}</span>`
      + `<span class="n">Sales ${esc(usd(t.sales))}</span><span class="n">Ad spend ${esc(usd(t.spend))}</span><span class="w" style="color:${tr.color}">${esc(tr.word)}</span></div>`;
  };
  const ch = (d.changes || []).length
    ? d.changes.map(c => `<p>${esc(c.line)}${c.why ? `<small>${esc(c.why)}</small>` : ''}</p>`).join('')
    : `<p>${esc(NONE)}</p>`;
  return `<div class="wcc"><div class="wcc-top"><b>${esc(d.brand)} · Black Friday</b><span>${esc(d.when)}</span></div>`
    + (ok(d.goal) ? `<div class="wcc-goal">Target store MER ${esc(xx(d.goal))}</div>` : '')
    + `<div class="wcc-tiles">${(d.tiles || []).map(tile).join('')}</div>`
    + `<div class="wcc-ch"><span class="h">What we changed</span>${ch}</div>`
    + `<div class="wcc-foot">${esc(FOOT(d))}</div></div>`;
}

/* ---------- canvas ---------- */
function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
function rr(ctx, x, y, w, h, r, fill) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
const spaced = (ctx, text, x, y, sp) => { let cx = x; for (const ch of String(text)) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + sp; } return cx; };

/** The card drawn on a canvas: laid out 1200 wide (height follows the changes), 3840 pixels wide. Returns the canvas. */
export async function cardCanvas(d) {
  await fontsReady(['750 64px Inter', '700 18px Inter', '600 24px Inter', '500 22px Inter', '400 21px Inter']);
  const W = 1200, P = 56, inner = W - 2 * P;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = `400 22px ${FONT}`;
  const changes = (d.changes || []).length ? d.changes : [{ line: NONE, why: '' }];
  const chLines = changes.map(c => {
    meas.font = `600 24px ${FONT}`; const a = wrap(meas, c.line, inner - 56);
    meas.font = `400 21px ${FONT}`; const b = c.why ? wrap(meas, c.why, inner - 56) : [];
    return { a, b };
  });
  const chH = 70 + chLines.reduce((t, l) => t + l.a.length * 32 + l.b.length * 28 + 18, 0);
  const tileY = 170, tileH = 250, bandY = tileY + tileH + 32, H = bandY + chH + 110;
  const { cv, ctx } = hiCanvas(W, H);          /* layout in 1200 wide pixels, drawn 3840 wide */
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.blue; ctx.fillRect(0, 0, W, 8);
  ctx.textBaseline = 'alphabetic';
  /* top line */
  ctx.fillStyle = C.text; ctx.font = `750 26px ${FONT}`;
  spaced(ctx, `${String(d.brand || '').toUpperCase()} · BLACK FRIDAY`, P, 84, 2.2);
  ctx.font = `500 24px ${FONT}`; ctx.fillStyle = C.dim;
  const wt = ctx.measureText(d.when || '').width; ctx.fillText(d.when || '', W - P - wt, 84);
  if (ok(d.goal)) { ctx.font = `500 22px ${FONT}`; ctx.fillText(`Target store MER ${xx(d.goal)}`, P, 124); }
  /* tiles */
  const gap = 24, tw = (inner - 2 * gap) / 3;
  (d.tiles || []).slice(0, 3).forEach((t, i) => {
    const x = P + i * (tw + gap);
    rr(ctx, x, tileY, tw, tileH, 22, C.tile);
    const tr = t.readable ? tierOf(t.mer, d.goal) : { color: C.dim, word: 'Too little to read yet' };
    ctx.fillStyle = C.dim; ctx.font = `700 18px ${FONT}`; spaced(ctx, String(t.label || '').toUpperCase(), x + 24, tileY + 44, 1.8);
    ctx.fillStyle = tr.color; ctx.font = `750 64px ${FONT}`; ctx.fillText(xx(t.mer), x + 24, tileY + 118);
    ctx.fillStyle = C.text; ctx.font = `500 22px ${FONT}`;
    ctx.fillText(`Sales ${usd(t.sales)}`, x + 24, tileY + 160);
    ctx.fillText(`Ad spend ${usd(t.spend)}`, x + 24, tileY + 192);
    ctx.fillStyle = tr.color; ctx.font = `650 19px ${FONT}`; ctx.fillText(tr.word, x + 24, tileY + 228);
  });
  /* what we changed */
  rr(ctx, P, bandY, inner, chH, 22, C.blueBg);
  ctx.fillStyle = C.blue; ctx.font = `700 18px ${FONT}`; spaced(ctx, 'WHAT WE CHANGED', P + 28, bandY + 44, 1.8);
  let y = bandY + 84;
  for (const l of chLines) {
    ctx.fillStyle = C.text; ctx.font = `600 24px ${FONT}`;
    for (const s of l.a) { ctx.fillText(s, P + 28, y); y += 32; }
    ctx.fillStyle = C.dim; ctx.font = `400 21px ${FONT}`;
    for (const s of l.b) { ctx.fillText(s, P + 28, y); y += 28; }
    y += 18;
  }
  /* footer */
  ctx.fillStyle = C.dim; ctx.font = `400 19px ${FONT}`;
  const foot = FOOT(d); meas.font = ctx.font;
  wrap(ctx, foot, inner).forEach((s, i) => ctx.fillText(s, P, H - 58 + i * 26));
  return cv;
}

/** Save the card as a PNG file. */
export async function downloadCard(d, file) {
  await downloadCanvas(await cardCanvas(d), file || 'black-friday-update.png');
}
/** Copy the card as a picture. Falls back to a download when the browser will not copy images. Returns 'copied' or 'downloaded'. */
export async function copyCard(d, file) {
  return copyCanvas(await cardCanvas(d), file || 'black-friday-update.png');
}
/** Save the card as a one page PDF (drawn in the browser, no route). */
export async function downloadCardPdf(d, file) {
  await downloadPdf([await cardCanvas(d)], file || 'black-friday-update.pdf', { fit: true });
}
