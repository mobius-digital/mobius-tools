/* Black Friday exports, all in the browser: no route, no library.
     copyCanvas(cv, file)        the picture to the clipboard as a PNG (falls back to a download), 'copied' | 'downloaded'
     downloadCanvas(cv, file)    save the picture as a PNG
     downloadPdf(canvases, file, o) save one PDF: each canvas is cut into letter shaped pages at its content breaks
                                 (cv.breaks), drawn as a JPEG on each; o.fit = shrink each canvas onto one page
     boardCanvas(m)              the whole War Room board (team only: store lines, per brand numbers, campaign calls)
     hiCanvas(w, h)              a canvas drawn at EXPORT_SCALE: { cv, ctx, k }. Draw in layout pixels, it comes out sharp
     fontsReady(faces)           waits for document.fonts.ready and the given faces before anything is drawn
   Quality (the owner, 2026-11-26): every picture is drawn at 3x or more (a wide card or the board is about 3840 to 4200
   pixels wide), after the fonts have loaded, so text is crisp on a 4K screen and in print. The PDF pages carry
   those pixels, which is well over 300 dpi on a letter page (the board: about 540 dpi; the card: about 490 dpi).
   The PDF is written by hand (catalog, pages, one JPEG image per page), so nothing is loaded from a CDN. */

const FONT = "Inter, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif";
const C = { bg: '#FFFFFF', tile: '#F5F7FB', line: '#E3E8F0', text: '#0E1B2E', dim: '#66748C', blue: '#2A9FD8', good: '#2E9E6B', warn: '#C98A00', bad: '#D2453B' };
const ok = n => n != null && isFinite(n);
const usd = v => ok(v) ? '$' + Math.round(v).toLocaleString('en-US') : 'n/a';
const xx = v => ok(v) ? v.toFixed(2) + 'x' : 'n/a';

/* ---------- quality ---------- */
/** At least 3x, and at least 3840 pixels wide for a wide layout; held under the browser's canvas limits. */
export const EXPORT_SCALE = 3;
/* iPhone and iPad Safari draw a blank canvas over about 16.7 million pixels, so there the scale drops toward 1.5 to 2x */
const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent)));
const MAX_SIDE = IOS ? 16000 : 32000, MAX_AREA = IOS ? 16e6 : 200e6;
export function exportScale(w, h) {
  let k = Math.max(EXPORT_SCALE, 3840 / Math.max(1, w));
  k = Math.min(k, MAX_SIDE / Math.max(1, w), MAX_SIDE / Math.max(1, h), Math.sqrt(MAX_AREA / Math.max(1, w * h)));
  return Math.max(1, k);
}
/** A canvas for a w x h layout, drawn at the export scale. Draw with layout pixels; cv.k is the scale. */
export function hiCanvas(w, h) {
  const k = exportScale(w, h), cv = document.createElement('canvas');
  cv.width = Math.round(w * k); cv.height = Math.round(h * k); cv.k = k;
  const ctx = cv.getContext('2d');
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  return { cv, ctx, k };
}
/** Wait for the web fonts, so the export never draws in a fallback face. faces: CSS font strings to load first. */
export async function fontsReady(faces = []) {
  try {
    if (!document.fonts) return;
    if (document.fonts.load) await Promise.all(faces.map(f => document.fonts.load(f).catch(() => null)));
    await document.fonts.ready;
  } catch {}
}

/* ---------- PNG ---------- */
const blobOf = (cv, type = 'image/png', q) => new Promise(res => cv.toBlob(b => res(b), type, q));
function saveBlob(b, file) {
  const url = URL.createObjectURL(b), a = document.createElement('a');
  a.href = url; a.download = file;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
export async function downloadCanvas(cv, file) {
  const b = await blobOf(cv);
  if (!b) throw new Error('The browser could not draw the picture.');
  saveBlob(b, file || 'black-friday.png');
}
export async function copyCanvas(cv, file) {
  try {
    if (!navigator.clipboard || !window.ClipboardItem) throw new Error('no image clipboard');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOf(cv) })]);
    return 'copied';
  } catch {
    await downloadCanvas(cv, file);
    return 'downloaded';
  }
}

/* ---------- PDF ---------- */
const PAGE_W = 612, PAGE_H = 792, MARGIN = 24;        // US letter in points, a small white margin
/** Cut a canvas into page-tall slices (by the page's shape at the canvas's width). A cut lands on the last content
    break (cv.breaks, y values between blocks and rows) that fits the page, so no row or line is cut in half;
    only when no break fits does it cut at the full page height. */
function slices(cv) {
  const inner = PAGE_W - 2 * MARGIN, sliceH = Math.floor(cv.width * (PAGE_H - 2 * MARGIN) / inner);
  const breaks = (cv.breaks || []).filter(b => b > 0 && b < cv.height).sort((p, q) => p - q);
  const out = [];
  for (let y = 0; y < cv.height;) {
    let end = Math.min(y + sliceH, cv.height);
    if (end < cv.height) {
      const fit = breaks.filter(b => b > y + sliceH * 0.3 && b <= end).pop();
      if (fit) end = Math.ceil(fit);
    }
    const h = end - y, c = document.createElement('canvas');
    c.width = cv.width; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#FFFFFF'; x.fillRect(0, 0, c.width, h);
    x.drawImage(cv, 0, y, cv.width, h, 0, 0, cv.width, h);
    out.push(c);
    y = end;
  }
  return out;
}
const enc = s => new TextEncoder().encode(s);
/** A PDF from JPEG pages: [{ bytes: Uint8Array, w, h }] (pixels). Returns a Blob. */
export function pdfOf(pages) {
  const parts = [], offs = [];
  let len = 0;
  const push = u => { parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; push(enc(`${n} 0 obj\n`)); for (const b of body) push(typeof b === 'string' ? enc(b) : b); push(enc('\nendobj\n')); };
  push(enc('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  const n = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`]);
  pages.forEach((p, i) => {
    const pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
    const inner = PAGE_W - 2 * MARGIN, innerH = PAGE_H - 2 * MARGIN;
    /* full width; a page taller than the page shape (a fit page) shrinks to the page height instead */
    const k = Math.min(inner / p.w, innerH / p.h), dw = p.w * k, dh = p.h * k, dx = MARGIN + (inner - dw) / 2;
    const draw = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${(PAGE_H - MARGIN - dh).toFixed(2)} cm /Im0 Do Q`;
    obj(pg, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 ${im} 0 R >> >> /Contents ${ct} 0 R >>`]);
    obj(ct, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
    obj(im, [`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`, p.bytes, '\nendstream']);
  });
  const total = 3 + n * 3, xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(enc(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
  return new Blob(parts, { type: 'application/pdf' });
}
/** Save the canvases as one PDF (tall ones run over several pages, or with o.fit each shrinks onto one page). */
export async function downloadPdf(canvases, file, o = {}) {
  const pages = [];
  for (const cv of [].concat(canvases)) {
    for (const s of o.fit ? [cv] : slices(cv)) {
      const b = await blobOf(s, 'image/jpeg', 0.95);
      if (!b) throw new Error('The browser could not draw the page.');
      pages.push({ bytes: new Uint8Array(await b.arrayBuffer()), w: s.width, h: s.height });
    }
  }
  if (!pages.length) throw new Error('Nothing to put in the PDF.');
  saveBlob(pdfOf(pages), file || 'black-friday.pdf');
}

/* ---------- the board ---------- */
function wrap(ctx, text, maxW) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
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
const clip = (ctx, s, w) => { s = String(s || ''); if (ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + '...').width > w) s = s.slice(0, -1); return s + '...'; };
const TONE = { good: C.good, warn: C.warn, bad: C.bad, '': C.dim };

/** The War Room board as one tall canvas, laid out 1400 wide and drawn at 3x (4200 pixels wide).
    m = { title, when, store: [string], brands: [{ name, light: {word, tone}, goal, windows: [{label, mer, sales, spend, readable, tone}],
          lines: [string], camps: [{ name, since, today, week, call, tone, move }] }], foot } */
export async function boardCanvas(m) {
  await fontsReady(['750 30px Inter', '700 24px Inter', '600 16px Inter', '400 18px Inter']);
  const W = 1400, P = 48, inner = W - 2 * P;
  const meas = document.createElement('canvas').getContext('2d');
  /* measure first, so the canvas is the right height */
  meas.font = `400 19px ${FONT}`;
  const storeLines = (m.store || []).flatMap(s => wrap(meas, s, inner));
  const blocks = (m.brands || []).map(b => {
    meas.font = `400 17px ${FONT}`;
    const lines = (b.lines || []).filter(Boolean).flatMap(s => wrap(meas, s, inner - 40));
    const h = 64 + 120 + 16 + lines.length * 24 + 16 + (b.camps.length ? 34 + b.camps.length * 34 : 30) + 24;
    return { b, lines, h };
  });
  meas.font = `400 16px ${FONT}`;
  const footLines = wrap(meas, m.foot || '', inner);
  const top = 130 + storeLines.length * 28 + 20;
  const H = top + blocks.reduce((t, x) => t + x.h + 20, 0) + footLines.length * 22 + 40;
  const { cv, ctx, k } = hiCanvas(W, H);      /* layout in 1400 wide pixels, drawn at 3x (4200 wide) */
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.blue; ctx.fillRect(0, 0, W, 8);
  ctx.fillStyle = C.text; ctx.font = `750 30px ${FONT}`; ctx.fillText(m.title || 'Black Friday War Room', P, 62);
  ctx.fillStyle = C.dim; ctx.font = `500 20px ${FONT}`; ctx.fillText(m.when || '', P, 96);
  ctx.fillStyle = C.text; ctx.font = `400 19px ${FONT}`;
  let y = 130;
  for (const s of storeLines) { ctx.fillText(s, P, y); y += 28; }
  y = top;
  const breaks = [top - 10];
  for (const { b, lines, h } of blocks) {
    breaks.push(y - 10);
    rr(ctx, P, y, inner, h, 18, C.tile);
    const x0 = P + 20, w0 = inner - 40;
    ctx.fillStyle = C.text; ctx.font = `700 24px ${FONT}`; ctx.fillText(clip(ctx, b.name, w0 * 0.5), x0, y + 40);
    let lx = x0 + Math.min(ctx.measureText(b.name).width, w0 * 0.5) + 18;
    if (b.light && b.light.word) {
      ctx.fillStyle = TONE[b.light.tone] || C.dim; ctx.beginPath(); ctx.arc(lx + 7, y + 33, 7, 0, 7); ctx.fill();
      ctx.font = `600 17px ${FONT}`; ctx.fillText(b.light.word, lx + 22, y + 39); lx += 30 + ctx.measureText(b.light.word).width;
    }
    if (b.goal) { ctx.fillStyle = C.dim; ctx.font = `500 17px ${FONT}`; ctx.fillText(b.goal, lx + 16, y + 39); }
    /* the three windows */
    const gap = 14, tw = (w0 - 2 * gap) / 3, ty = y + 60;
    (b.windows || []).slice(0, 3).forEach((wd, i) => {
      const x = x0 + i * (tw + gap);
      rr(ctx, x, ty, tw, 112, 12, '#FFFFFF');
      ctx.fillStyle = C.dim; ctx.font = `600 15px ${FONT}`; ctx.fillText(clip(ctx, wd.label, tw - 32), x + 16, ty + 26);
      ctx.fillStyle = wd.readable ? (TONE[wd.tone] || C.text) : C.dim; ctx.font = `750 34px ${FONT}`; ctx.fillText(wd.readable || ok(wd.mer) ? xx(wd.mer) : 'n/a', x + 16, ty + 66);
      ctx.fillStyle = C.text; ctx.font = `400 15px ${FONT}`;
      ctx.fillText(clip(ctx, `Sales ${usd(wd.sales)} · Ad spend ${usd(wd.spend)}`, tw - 32), x + 16, ty + 92);
      if (!wd.readable) { ctx.fillStyle = C.dim; ctx.font = `400 13px ${FONT}`; ctx.fillText('Too little to read', x + 16, ty + 108); }
    });
    let cy = ty + 112 + 16;
    ctx.fillStyle = C.text; ctx.font = `400 17px ${FONT}`;
    breaks.push(cy);
    for (const s of lines) { cy += 20; ctx.fillText(s, x0, cy); cy += 4; breaks.push(cy + 4); }
    cy += 16;
    if (!b.camps.length) { ctx.fillStyle = C.dim; ctx.font = `400 16px ${FONT}`; ctx.fillText('No live campaign in Meta.', x0, cy + 20); }
    else {
      const cols = [x0, x0 + w0 * 0.36, x0 + w0 * 0.46, x0 + w0 * 0.56, x0 + w0 * 0.66];
      ctx.fillStyle = C.dim; ctx.font = `700 13px ${FONT}`;
      ['CAMPAIGN', 'SINCE', 'TODAY', 'WEEK', 'CALL'].forEach((t, i) => ctx.fillText(t, cols[i], cy + 20));
      cy += 34;
      for (const cp of b.camps) {
        breaks.push(cy);
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(x0 + w0, cy); ctx.stroke();
        ctx.fillStyle = C.text; ctx.font = `600 16px ${FONT}`; ctx.fillText(clip(ctx, cp.name, cols[1] - cols[0] - 12), cols[0], cy + 23);
        ctx.font = `400 16px ${FONT}`;
        [cp.since, cp.today, cp.week].forEach((v, i) => ctx.fillText(clip(ctx, v, cols[i + 2] - cols[i + 1] - 8), cols[i + 1], cy + 23));
        ctx.fillStyle = TONE[cp.tone] || C.text; ctx.font = `650 16px ${FONT}`;
        ctx.fillText(clip(ctx, cp.call + (cp.move ? ` (${cp.move})` : ''), x0 + w0 - cols[4]), cols[4], cy + 23);
        cy += 34;
      }
    }
    y += h + 20;
    breaks.push(y - 10);
  }
  ctx.fillStyle = C.dim; ctx.font = `400 16px ${FONT}`;
  for (const s of footLines) { breaks.push(y - 8); ctx.fillText(s, P, y + 10); y += 22; }
  cv.breaks = breaks.map(b => b * k);         /* the PDF cuts in canvas pixels */
  return cv;
}
