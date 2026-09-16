/**
 * A small PDF writer, and the Profit & Loss statement it draws.
 *
 * Workers have no PDF library and no filesystem, so this emits the bytes
 * directly: the base-14 Helvetica faces need no embedding, and the only
 * binary is the brand mark, carried as a JPEG (DCTDecode takes it verbatim).
 * That keeps a real, printable, logo-bearing statement inside one Worker.
 */
import { LOGO_JPEG_B64, LOGO_W, LOGO_H } from './logo.js';

/* ---------- byte plumbing ---------- */

const enc = new TextEncoder();
const b64ToBytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

/** WinAnsi has the punctuation this statement actually uses; anything past
 *  it degrades to an ASCII stand-in rather than corrupting the stream. */
const WINANSI = { '—': 0x97, '–': 0x96, '·': 0xb7, '•': 0x95, '“': 0x93, '”': 0x94,
                  '‘': 0x91, '’': 0x92, '…': 0x85, '€': 0x80, '©': 0xa9, '®': 0xae, '½': 0xbd };
function pdfStr(s) {
  let out = '';
  for (const ch of String(s == null ? '' : s)) {
    const c = ch.codePointAt(0);
    if (ch === '(' || ch === ')' || ch === '\\') out += '\\' + ch;
    else if (c < 128) out += ch;
    else {
      const w = WINANSI[ch] ?? (c < 256 ? c : null);
      out += w == null ? '?' : '\\' + w.toString(8).padStart(3, '0');
    }
  }
  return out;
}

/* Helvetica advance widths (1000-unit em) — enough to right-align numbers and
 * truncate long vendor names without a font library. */
const W_REG = { ' ': 278, '!': 278, '"': 355, '#': 556, $: 556, '%': 889, '&': 667, "'": 191,
  '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278, ':': 278,
  ';': 278, '<': 584, '=': 584, '>': 584, '?': 556, '@': 1015, '[': 278, '\\': 278, ']': 278,
  '^': 469, _: 556, '`': 333, '{': 334, '|': 260, '}': 334, '~': 584 };
const digitW = 556;
function charW(ch, bold) {
  const c = ch.charCodeAt(0);
  if (ch >= '0' && ch <= '9') return digitW;
  if (W_REG[ch] != null) return bold && (ch === '$' || ch === '%') ? W_REG[ch] : W_REG[ch];
  if (c >= 65 && c <= 90) {   // capitals
    const caps = bold
      ? { I: 278, J: 556, M: 833, W: 944, i: 278 }
      : { I: 278, J: 500, M: 833, W: 944 };
    return caps[ch] ?? (bold ? 722 : 667);
  }
  if (c >= 97 && c <= 122) {  // lowercase
    const nar = { i: bold ? 278 : 222, j: bold ? 278 : 222, l: bold ? 278 : 222,
                  f: bold ? 333 : 278, t: bold ? 333 : 278, r: bold ? 389 : 333,
                  m: bold ? 889 : 833, w: bold ? 778 : 722 };
    return nar[ch] ?? (bold ? 611 : 556);
  }
  return bold ? 611 : 556;
}
const textW = (s, size, bold) => {
  let w = 0;
  for (const ch of String(s)) w += charW(ch, bold);
  return w * size / 1000;
};
function ellipsize(s, size, bold, max) {
  s = String(s);
  if (textW(s, size, bold) <= max) return s;
  let out = s;
  while (out.length > 1 && textW(out + '…', size, bold) > max) out = out.slice(0, -1);
  return out + '…';
}

/* ---------- page model ---------- */

const PAGE_W = 612, PAGE_H = 792, MARGIN = 54;
const CONTENT_W = PAGE_W - MARGIN * 2;
const INK = [0.09, 0.13, 0.11], MUTED = [0.44, 0.5, 0.47], RULE = [0.85, 0.88, 0.86];
const ACCENT = [0.24, 0.62, 0.45], BAND = [0.949, 0.969, 0.957];

class Doc {
  constructor(w = PAGE_W, h = PAGE_H) { this.W = w; this.H = h; this.pages = []; this.ops = []; this.y = 0; this.onNewPage = null; this.newPage(); }
  newPage() {
    if (this.ops.length) this.pages.push(this.ops);
    this.ops = [];
    this.y = this.H - MARGIN;
    if (this.pages.length && this.onNewPage) this.onNewPage(this);
  }
  /** Reserve vertical space; break the page when the block will not fit. */
  need(h) { if (this.y - h < MARGIN + 34) { this.newPage(); return true; } return false; }
  op(s) { this.ops.push(s); }
  fill(c) { this.op(`${c[0]} ${c[1]} ${c[2]} rg`); }
  stroke(c) { this.op(`${c[0]} ${c[1]} ${c[2]} RG`); }
  text(s, x, y, { size = 9.5, bold = false, color = INK, align = 'left', width = 0 } = {}) {
    const str = String(s);
    let tx = x;
    if (align === 'right') tx = x - textW(str, size, bold);
    else if (align === 'center') tx = x + (width - textW(str, size, bold)) / 2;
    this.fill(color);
    this.op(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${tx.toFixed(2)} ${y.toFixed(2)} Td (${pdfStr(str)}) Tj ET`);
  }
  rect(x, y, w, h, color) { this.fill(color); this.op(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
  line(x1, y, x2, color = RULE, w = 0.6) {
    this.stroke(color);
    this.op(`${w} w ${x1.toFixed(2)} ${y.toFixed(2)} m ${x2.toFixed(2)} ${y.toFixed(2)} l S`);
  }
  image(x, y, w, h) { this.op(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`); }
  finish() { if (this.ops.length) this.pages.push(this.ops); return this.pages; }
}

function serialize(pages, W = PAGE_W, H = PAGE_H) {
  const objs = [];                                  // 1-indexed object bodies
  const push = body => { objs.push(body); return objs.length; };
  const jpeg = b64ToBytes(LOGO_JPEG_B64);

  const pageIds = [];
  const contentIds = [];
  for (const ops of pages) {
    const stream = ops.join('\n');
    contentIds.push(push({ dict: `<< /Length ${enc.encode(stream).length} >>`, stream: enc.encode(stream) }));
    pageIds.push(null);
  }
  const fontReg = push({ dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' });
  const fontBold = push({ dict: '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>' });
  const imgId = push({ dict: `<< /Type /XObject /Subtype /Image /Width ${LOGO_W} /Height ${LOGO_H} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, stream: jpeg });
  const pagesId = objs.length + pages.length + 1;   // after every page object
  for (let i = 0; i < pages.length; i++) {
    pageIds[i] = push({ dict: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] ` +
      `/Resources << /Font << /F1 ${fontReg} 0 R /F2 ${fontBold} 0 R >> /XObject << /Im0 ${imgId} 0 R >> >> ` +
      `/Contents ${contentIds[i]} 0 R >>` });
  }
  const realPagesId = push({ dict: `<< /Type /Pages /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] /Count ${pageIds.length} >>` });
  const catalogId = push({ dict: `<< /Type /Catalog /Pages ${realPagesId} 0 R >>` });

  const chunks = [];
  let len = 0;
  const write = u8 => { chunks.push(u8); len += u8.length; };
  write(enc.encode('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
  const offsets = [0];
  objs.forEach((o, i) => {
    offsets[i + 1] = len;
    write(enc.encode(`${i + 1} 0 obj\n${o.dict}\n`));
    if (o.stream) { write(enc.encode('stream\n')); write(o.stream); write(enc.encode('\nendstream\n')); }
    write(enc.encode('endobj\n'));
  });
  const xref = len;
  let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  x += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  write(enc.encode(x));

  const out = new Uint8Array(len);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/* ---------- the statement ---------- */
const keptOut = r => [r.personal ? `personal purchases ${money(r.personal)}` : '', r.incomeTax ? `income tax paid ${money(r.incomeTax)}` : '']
  .filter(Boolean).join(', ');


const money = n => {
  const v = Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (Number(n) || 0) < 0 ? `($${v})` : `$${v}`;
};

function header(d, title, period, sub) {
  const logoH = 30, logoW = logoH * LOGO_W / LOGO_H;
  d.image(MARGIN, d.y - logoH + 4, logoW, logoH);
  d.text('MOBIUS DIGITAL LLC', MARGIN + logoW + 12, d.y - 10, { size: 9, bold: true, color: INK });
  d.text('Prepared by Mobius Ledger', MARGIN + logoW + 12, d.y - 21, { size: 8, color: MUTED });
  d.text(title, d.W - MARGIN, d.y - 8, { size: 15, bold: true, align: 'right' });
  d.text(period, d.W - MARGIN, d.y - 22, { size: 10, color: MUTED, align: 'right' });
  d.y -= logoH + 12;
  d.line(MARGIN, d.y, d.W - MARGIN);
  d.y -= 6;
  if (sub) { d.text(sub, MARGIN, d.y - 8, { size: 8, color: MUTED }); d.y -= 16; }
  d.y -= 10;
}

function summaryBand(d, r) {
  const h = 58;
  d.need(h + 10);
  d.rect(MARGIN, d.y - h, (d.W - MARGIN * 2), h, BAND);
  const cells = [
    ['Revenue', money(r.revenue)],
    ['Total expenses', money(r.expenses + r.fees)],
    ['Net income', money(r.net)],
    ['Margin', r.margin == null ? 'n/a' : r.margin.toFixed(1) + '%'],
  ];
  const cw = (d.W - MARGIN * 2) / cells.length;
  cells.forEach(([label, val], i) => {
    const x = MARGIN + cw * i;
    d.text(label.toUpperCase(), x + 14, d.y - 20, { size: 7.5, color: MUTED });
    d.text(val, x + 14, d.y - 41, { size: 16, bold: true, color: i === 2 ? ACCENT : INK });
  });
  d.y -= h + 18;
}

function sectionTitle(d, label) {
  d.need(30);
  d.text(label.toUpperCase(), MARGIN, d.y - 9, { size: 8, bold: true, color: MUTED });
  d.y -= 14;
  d.line(MARGIN, d.y, d.W - MARGIN, RULE, 0.8);
  d.y -= 4;
}

/* With a comparison, three money columns: this period, the other, the change. */
const CMP_X = d => [d.W - MARGIN - 190, d.W - MARGIN - 95, d.W - MARGIN];
function cmpCells(d, y, amount, cmp, size, bold, color = INK) {
  if (!cmp) { d.text(amount, d.W - MARGIN, y, { size, bold, align: 'right', color }); return; }
  const [a, b, c] = CMP_X(d);
  d.text(amount, a, y, { size, bold, align: 'right', color });
  d.text(cmp[0], b, y, { size, bold, align: 'right', color: MUTED });
  d.text(cmp[1], c, y, { size, bold, align: 'right', color: String(cmp[1]).startsWith('(') ? [0.7, 0.25, 0.2] : INK });
}
function row(d, label, amount, { bold = false, note = null, indent = 0, size = 9.5, cmp = null } = {}) {
  d.need(17);
  const y = d.y - 11;
  d.text(ellipsize(label, size, bold, (d.W - MARGIN * 2) - (cmp ? 290 : 150) - indent), MARGIN + indent, y, { size, bold });
  if (note) d.text(note, MARGIN + indent + textW(label, size, bold) + 8, y, { size: 7.5, color: MUTED });
  cmpCells(d, y, amount, cmp, size, bold);
  d.y -= 17;
  d.line(MARGIN, d.y + 1, d.W - MARGIN, [0.93, 0.95, 0.94], 0.5);
}

function totalRow(d, label, amount, color = INK, cmp = null) {
  d.need(24);
  d.y -= 2;
  const y = d.y - 12;
  d.text(label, MARGIN, y, { size: 10, bold: true });
  cmpCells(d, y, amount, cmp, 10.5, true, color);
  d.y -= 18;
  d.line(MARGIN, d.y + 3, d.W - MARGIN, RULE, 0.9);
  d.y -= 4;
}

/**
 * @param r       a report (single month) or an aggregate from computeRange
 * @param opts    { title, period, sub, months? [{month,label,revenue,expenses,net}] }
 */
export function buildPnlPdf(r, opts = {}) {
  const d = new Doc();
  // continuation pages get a quiet running head, never a second full masthead
  d.onNewPage = doc => {
    doc.text(`Mobius Digital LLC · ${opts.title || 'Profit & Loss'} · ${opts.period || ''} (continued)`,
      MARGIN, doc.y - 8, { size: 7.5, color: MUTED });
    doc.y -= 18;
    doc.line(MARGIN, doc.y, doc.W - MARGIN);
    doc.y -= 16;
  };
  header(d, opts.title || 'Profit & Loss', opts.period || '', opts.sub || '');
  summaryBand(d, r);

  /* With a comparison period, every line carries the other figure and the change. */
  const C = opts.compare?.r || null;
  const diff = (x, y) => { const v = (x || 0) - (y || 0); return Math.abs(v) < 0.005 ? '' : (v > 0 ? '+' : '') + money(v); };
  const cmpOf = (x, y) => C ? [money(y || 0), diff(x, y)] : null;
  const keys = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])]
    .filter(k => Math.abs(a?.[k] || 0) >= 0.005 || Math.abs(b?.[k] || 0) >= 0.005)
    .sort((x, y) => (a?.[y] || 0) - (a?.[x] || 0));
  if (C) {
    d.need(20);
    const [x1, x2, x3] = CMP_X(d);
    d.text(opts.period || 'This period', x1, d.y - 8, { size: 7.5, bold: true, color: MUTED, align: 'right' });
    d.text(opts.compare.label || 'Compared', x2, d.y - 8, { size: 7.5, bold: true, color: MUTED, align: 'right' });
    d.text('Change', x3, d.y - 8, { size: 7.5, bold: true, color: MUTED, align: 'right' });
    d.y -= 14;
  }

  /* Revenue */
  sectionTitle(d, 'Revenue');
  const clients = keys(r.byClient, C?.byClient);
  if (clients.length) for (const name of clients) row(d, name, money(r.byClient?.[name] || 0), { cmp: cmpOf(r.byClient?.[name], C?.byClient?.[name]) });
  else row(d, 'No revenue recorded in this period', '', { size: 9 });
  totalRow(d, 'Total revenue', money(r.revenue), INK, cmpOf(r.revenue, C?.revenue));
  d.y -= 10;

  /* Expenses, by the tax category a CPA files them under */
  sectionTitle(d, 'Operating expenses');
  const tax = keys(r.byTax, C?.byTax);
  for (const name of tax) row(d, name, money(r.byTax?.[name] || 0), { cmp: cmpOf(r.byTax?.[name], C?.byTax?.[name]) });
  if (r.fees || C?.fees) row(d, 'Merchant & processing fees', money(r.fees), { cmp: cmpOf(r.fees, C?.fees) });
  if (!tax.length && !r.fees) row(d, 'No expenses recorded in this period', '', { size: 9 });
  totalRow(d, 'Total operating expenses', money(r.expenses + r.fees), INK, cmpOf(r.expenses + r.fees, C ? C.expenses + C.fees : 0));
  d.y -= 10;

  /* Net */
  d.need(40);
  d.rect(MARGIN, d.y - 30, (d.W - MARGIN * 2), 30, BAND);
  d.text('NET INCOME', MARGIN + 14, d.y - 19, { size: 10, bold: true });
  const netColor = r.net >= 0 ? ACCENT : [0.7, 0.25, 0.2];
  if (C) {
    const [x1, x2, x3] = CMP_X(d);
    d.text(money(r.net), x1, d.y - 20, { size: 12, bold: true, align: 'right', color: netColor });
    d.text(money(C.net), x2, d.y - 20, { size: 10, bold: true, align: 'right', color: MUTED });
    d.text(diff(r.net, C.net), x3 - 14, d.y - 20, { size: 10, bold: true, align: 'right' });
  } else {
    d.text(money(r.net), d.W - MARGIN - 14, d.y - 20, { size: 13, bold: true, align: 'right', color: netColor });
  }
  d.y -= 44;

  if (r.personal || r.incomeTax) {
    d.text(`Kept out on purpose, not business costs: ${keptOut(r)}.`,
      MARGIN, d.y - 8, { size: 8, color: MUTED });
    d.y -= 26;
  }

  /* Month-by-month, for quarters and years */
  if (opts.months && opts.months.length > 1) {
    d.y -= 6;
    sectionTitle(d, 'By month');
    d.need(18);
    const cols = [(d.W - MARGIN * 2) * 0.40, (d.W - MARGIN * 2) * 0.20, (d.W - MARGIN * 2) * 0.20, (d.W - MARGIN * 2) * 0.20];
    const xs = [MARGIN];
    cols.forEach((c, i) => xs.push(xs[i] + c));
    d.text('Month', xs[0], d.y - 10, { size: 7.5, color: MUTED });
    ['Revenue', 'Expenses', 'Net'].forEach((h, i) =>
      d.text(h, xs[i + 2], d.y - 10, { size: 7.5, color: MUTED, align: 'right' }));
    d.y -= 15;
    d.line(MARGIN, d.y + 2, d.W - MARGIN, RULE, 0.7);
    d.y -= 3;
    for (const m of opts.months) {
      d.need(16);
      const y = d.y - 11;
      d.text(m.label, xs[0], y, { size: 9 });
      d.text(money(m.revenue), xs[2], y, { size: 9, align: 'right' });
      d.text(money(m.expenses), xs[3], y, { size: 9, align: 'right' });
      d.text(money(m.net), xs[4], y, { size: 9, align: 'right', bold: true });
      d.y -= 15;
      d.line(MARGIN, d.y + 3, d.W - MARGIN, [0.93, 0.95, 0.94], 0.5);
    }
    d.y -= 12;
  }

  /* What to actually do with the money */
  if (!opts.months && r.split && Object.keys(r.split).length) {
    const LABELS = { personal: 'Personal account', tax: 'Tax reserve', ads: 'Ads / Marketing',
                     savings: 'Savings', other: 'Other expenses' };
    sectionTitle(d, 'Cash allocation: transfers to make');
    for (const [k, v] of Object.entries(r.split))
      row(d, LABELS[k] || k, money(v), { note: `${r.splitPct?.[k] ?? ''}% of net` });
    d.y -= 8;
  }

  /* Footer on every page */
  const pages = d.finish();
  const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  pages.forEach((ops, i) => {
    const f = new Doc(d.W, d.H);
    f.ops = ops;
    f.line(MARGIN, MARGIN + 22, f.W - MARGIN, RULE, 0.6);
    f.text(`Mobius Digital LLC · generated ${stamp} CT · ${opts.frozen ? 'figures frozen at month close' : 'figures live until the month is closed'}`,
      MARGIN, MARGIN + 10, { size: 7, color: MUTED });
    f.text(`Page ${i + 1} of ${pages.length}`, f.W - MARGIN, MARGIN + 10, { size: 7, color: MUTED, align: 'right' });
  });
  return serialize(pages, d.W, d.H);
}

/* ---------- the wide statement: periods across, lines down ---------- */

const money0 = n => {
  const v = Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-US');
  return Math.abs(Number(n) || 0) < 0.5 ? '-' : (Number(n) < 0 ? `($${v})` : `$${v}`);
};
function footers(d, opts) {
  const pages = d.finish();
  const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  pages.forEach((ops, i) => {
    const f = new Doc(d.W, d.H);
    f.ops = ops;
    f.line(MARGIN, MARGIN + 22, f.W - MARGIN, RULE, 0.6);
    f.text(`Mobius Digital LLC · generated ${stamp} CT · ${opts.note || ''}`, MARGIN, MARGIN + 10, { size: 7, color: MUTED });
    f.text(`Page ${i + 1} of ${pages.length}`, f.W - MARGIN, MARGIN + 10, { size: 7, color: MUTED, align: 'right' });
  });
  return serialize(pages, d.W, d.H);
}

/**
 * Landscape P&L with one column per period plus a total.
 * @param total  aggregate report for the whole range
 * @param opts   { title, period, sub, cols:[{label, revenue, expenses, fees, net, byClient, byTax}],
 *                 contractors?:[[name, amount]], questions?:[{date, vendor, amount, tax_cat}], note }
 */
export function buildPnlColumnsPdf(total, opts = {}) {
  const d = new Doc(792, 612);
  const cols = opts.cols || [];
  const LABEL_W = 170;
  const colW = (d.W - MARGIN * 2 - LABEL_W) / (cols.length + 1);
  const size = cols.length > 8 ? 7 : 8.5;
  const xs = cols.map((_, i) => MARGIN + LABEL_W + colW * (i + 1));
  const xT = d.W - MARGIN;
  const head = () => {
    d.need(22);
    cols.forEach((c, i) => d.text(c.label, xs[i], d.y - 9, { size: 7.5, bold: true, color: MUTED, align: 'right' }));
    d.text('Total', xT, d.y - 9, { size: 7.5, bold: true, color: INK, align: 'right' });
    d.y -= 14;
    d.line(MARGIN, d.y, d.W - MARGIN, RULE, 0.8);
    d.y -= 2;
  };
  d.onNewPage = doc => {
    doc.text(`Mobius Digital LLC · ${opts.title || 'Profit & Loss'} · ${opts.period || ''} (continued)`, MARGIN, doc.y - 8, { size: 7.5, color: MUTED });
    doc.y -= 22;
    head();
  };
  const k = keptOut(total);
  header(d, opts.title || 'Profit & Loss', opts.period || '', (opts.sub || '') + (k ? ` · kept out on purpose, not business costs: ${k}` : ''));
  summaryBand(d, total);
  head();
  const line = (label, get, { bold = false, band = false, indent = 8 } = {}) => {
    d.need(15);
    if (band) d.rect(MARGIN, d.y - 16, d.W - MARGIN * 2, 16, BAND);
    const y = d.y - 11;
    d.text(ellipsize(label, size + (bold ? .5 : 0), bold, LABEL_W - indent - 6), MARGIN + (bold ? 0 : indent), y, { size: size + (bold ? .5 : 0), bold });
    cols.forEach((c, i) => d.text(money0(get(c)), xs[i], y, { size, bold }));
    d.text(money0(get(total)), xT, y, { size, bold: true });
    d.y -= band ? 18 : 16;
    if (!band) d.line(MARGIN, d.y + 2, d.W - MARGIN, [0.93, 0.95, 0.94], 0.4);
  };
  // text() aligns left by default; money columns are right-aligned
  const _text = d.text.bind(d);
  d.text = (s, x, y, o = {}) => _text(s, x, y, (xs.includes(x) || x === xT) && !o.align ? { ...o, align: 'right' } : o);
  const sec = t => { d.need(24); d.y -= 6; d.text(t.toUpperCase(), MARGIN, d.y - 9, { size: 7.5, bold: true, color: MUTED }); d.y -= 14; };
  const keysOf = f => Object.keys(total[f] || {}).filter(k => Math.abs(total[f][k]) >= 0.5).sort((a, b) => total[f][b] - total[f][a]);
  sec('Revenue');
  for (const k of keysOf('byClient')) line(k, c => c.byClient?.[k]);
  line('Total revenue', c => c.revenue, { bold: true });
  sec('Operating expenses');
  for (const k of keysOf('byTax')) line(k, c => c.byTax?.[k]);
  if (total.fees) line('Merchant & processing fees', c => c.fees);
  d.need(44);   // the total and net income stay on the same page
  line('Total operating expenses', c => (c.expenses || 0) + (c.fees || 0), { bold: true });
  d.y -= 4;
  line('Net income', c => c.net, { bold: true, band: true });
  d.text = _text;
  d.onNewPage = doc => {
    doc.text(`Mobius Digital LLC · ${opts.title || 'Profit & Loss'} · ${opts.period || ''} (continued)`, MARGIN, doc.y - 8, { size: 7.5, color: MUTED });
    doc.y -= 26;
  };

  if (opts.contractors) {
    d.y -= 8;
    sectionTitle(d, 'Contractor totals (1099 check: $600 or more)');
    if (!opts.contractors.length) row(d, 'No contract labor in this period', '', { size: 9 });
    for (const [name, v] of opts.contractors) row(d, name, money(v), { note: v >= 600 ? '1099 or W-8BEN needed' : null });
  }
  if (opts.questions) {
    d.y -= 10;
    sectionTitle(d, `Open questions for the CPA (${opts.questions.length})`);
    if (!opts.questions.length) row(d, 'None: nothing is flagged personal or uncategorized', '', { size: 9 });
    for (const q of opts.questions.slice(0, 60))
      row(d, `${q.date}  ${q.vendor}`, money(q.amount), { note: q.tax_cat || 'uncategorized', size: 9 });
    if (opts.questions.length > 60) row(d, `…and ${opts.questions.length - 60} more in the ledger CSV`, '', { size: 8.5 });
  }
  return footers(d, opts);
}
