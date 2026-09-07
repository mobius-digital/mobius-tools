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
  constructor() { this.pages = []; this.ops = []; this.y = 0; this.onNewPage = null; this.newPage(); }
  newPage() {
    if (this.ops.length) this.pages.push(this.ops);
    this.ops = [];
    this.y = PAGE_H - MARGIN;
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

function serialize(pages) {
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
    pageIds[i] = push({ dict: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
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

const money = n => {
  const v = Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (Number(n) || 0) < 0 ? `($${v})` : `$${v}`;
};

function header(d, title, period, sub) {
  const logoH = 30, logoW = logoH * LOGO_W / LOGO_H;
  d.image(MARGIN, d.y - logoH + 4, logoW, logoH);
  d.text('MOBIUS DIGITAL LLC', MARGIN + logoW + 12, d.y - 10, { size: 9, bold: true, color: INK });
  d.text('Prepared by Mobius Ledger', MARGIN + logoW + 12, d.y - 21, { size: 8, color: MUTED });
  d.text(title, PAGE_W - MARGIN, d.y - 8, { size: 15, bold: true, align: 'right' });
  d.text(period, PAGE_W - MARGIN, d.y - 22, { size: 10, color: MUTED, align: 'right' });
  d.y -= logoH + 12;
  d.line(MARGIN, d.y, PAGE_W - MARGIN);
  d.y -= 6;
  if (sub) { d.text(sub, MARGIN, d.y - 8, { size: 8, color: MUTED }); d.y -= 16; }
  d.y -= 10;
}

function summaryBand(d, r) {
  const h = 58;
  d.need(h + 10);
  d.rect(MARGIN, d.y - h, CONTENT_W, h, BAND);
  const cells = [
    ['Revenue', money(r.revenue)],
    ['Total expenses', money(r.expenses + r.fees)],
    ['Net income', money(r.net)],
    ['Margin', r.margin == null ? '—' : r.margin.toFixed(1) + '%'],
  ];
  const cw = CONTENT_W / cells.length;
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
  d.line(MARGIN, d.y, PAGE_W - MARGIN, RULE, 0.8);
  d.y -= 4;
}

function row(d, label, amount, { bold = false, note = null, indent = 0, size = 9.5 } = {}) {
  d.need(17);
  const y = d.y - 11;
  d.text(ellipsize(label, size, bold, CONTENT_W - 150 - indent), MARGIN + indent, y, { size, bold });
  if (note) d.text(note, MARGIN + indent + textW(label, size, bold) + 8, y, { size: 7.5, color: MUTED });
  d.text(amount, PAGE_W - MARGIN, y, { size, bold, align: 'right' });
  d.y -= 16;
  d.line(MARGIN, d.y + 3, PAGE_W - MARGIN, [0.93, 0.95, 0.94], 0.5);
}

function totalRow(d, label, amount, color = INK) {
  d.need(24);
  d.y -= 2;
  const y = d.y - 12;
  d.text(label, MARGIN, y, { size: 10, bold: true });
  d.text(amount, PAGE_W - MARGIN, y, { size: 10.5, bold: true, color });
  d.y -= 18;
  d.line(MARGIN, d.y + 3, PAGE_W - MARGIN, RULE, 0.9);
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
    doc.line(MARGIN, doc.y, PAGE_W - MARGIN);
    doc.y -= 16;
  };
  header(d, opts.title || 'Profit & Loss', opts.period || '', opts.sub || '');
  summaryBand(d, r);

  /* Revenue */
  sectionTitle(d, 'Revenue');
  const clients = Object.entries(r.byClient || {});
  if (clients.length) for (const [name, v] of clients) row(d, name, money(v));
  else row(d, 'No revenue recorded in this period', '—', { size: 9 });
  totalRow(d, 'Total revenue', money(r.revenue));
  d.y -= 10;

  /* Expenses, by the tax category a CPA files them under */
  sectionTitle(d, 'Operating expenses');
  const tax = Object.entries(r.byTax || {});
  if (tax.length) for (const [name, v] of tax) row(d, name, money(v));
  if (r.fees) row(d, 'Merchant & processing fees', money(r.fees),
    { note: r.feeEstimated ? '(estimated)' : null });
  if (!tax.length && !r.fees) row(d, 'No expenses recorded in this period', '—', { size: 9 });
  totalRow(d, 'Total operating expenses', money(r.expenses + r.fees));
  d.y -= 10;

  /* Net */
  d.need(40);
  d.rect(MARGIN, d.y - 30, CONTENT_W, 30, BAND);
  d.text('NET INCOME', MARGIN + 14, d.y - 19, { size: 10, bold: true });
  d.text(money(r.net), PAGE_W - MARGIN - 14, d.y - 20, { size: 13, bold: true, color: r.net >= 0 ? ACCENT : [0.7, 0.25, 0.2] });
  d.y -= 44;

  if (r.personal) {
    d.text(`Owner draw — personal purchases on business cards, excluded above: ${money(r.personal)}`,
      MARGIN, d.y - 8, { size: 8, color: MUTED });
    d.y -= 26;
  }

  /* Month-by-month, for quarters and years */
  if (opts.months && opts.months.length > 1) {
    d.y -= 6;
    sectionTitle(d, 'By month');
    d.need(18);
    const cols = [CONTENT_W * 0.40, CONTENT_W * 0.20, CONTENT_W * 0.20, CONTENT_W * 0.20];
    const xs = [MARGIN];
    cols.forEach((c, i) => xs.push(xs[i] + c));
    d.text('Month', xs[0], d.y - 10, { size: 7.5, color: MUTED });
    ['Revenue', 'Expenses', 'Net'].forEach((h, i) =>
      d.text(h, xs[i + 2], d.y - 10, { size: 7.5, color: MUTED, align: 'right' }));
    d.y -= 15;
    d.line(MARGIN, d.y + 2, PAGE_W - MARGIN, RULE, 0.7);
    d.y -= 3;
    for (const m of opts.months) {
      d.need(16);
      const y = d.y - 11;
      d.text(m.label, xs[0], y, { size: 9 });
      d.text(money(m.revenue), xs[2], y, { size: 9, align: 'right' });
      d.text(money(m.expenses), xs[3], y, { size: 9, align: 'right' });
      d.text(money(m.net), xs[4], y, { size: 9, align: 'right', bold: true });
      d.y -= 15;
      d.line(MARGIN, d.y + 3, PAGE_W - MARGIN, [0.93, 0.95, 0.94], 0.5);
    }
    d.y -= 12;
  }

  /* What to actually do with the money */
  if (r.split && Object.keys(r.split).length) {
    const LABELS = { personal: 'Personal account', tax: 'Tax reserve', ads: 'Ads / Marketing',
                     savings: 'Savings', other: 'Other expenses' };
    sectionTitle(d, 'Cash allocation — transfers to make');
    for (const [k, v] of Object.entries(r.split))
      row(d, LABELS[k] || k, money(v), { note: `${r.splitPct?.[k] ?? ''}% of net` });
    d.y -= 8;
  }

  /* Footer on every page */
  const pages = d.finish();
  const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago',
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  pages.forEach((ops, i) => {
    const f = new Doc();
    f.ops = ops;
    f.line(MARGIN, MARGIN + 22, PAGE_W - MARGIN, RULE, 0.6);
    f.text(`Mobius Digital LLC · generated ${stamp} CT · ${opts.frozen ? 'figures frozen at month close' : 'figures live until the month is closed'}`,
      MARGIN, MARGIN + 10, { size: 7, color: MUTED });
    f.text(`Page ${i + 1} of ${pages.length}`, PAGE_W - MARGIN, MARGIN + 10, { size: 7, color: MUTED, align: 'right' });
  });
  return serialize(pages);
}
