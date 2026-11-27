/* Shared by the Full funnel pages and Customers > What they buy next.
   flow()        a flow drawing: columns of blocks joined by bands, with hover dimming and a read out.
                 The kit has one chart (lineChart) and it cannot draw this, so it lives here.
   steps()       the funnel steps: one tall bar per step on a wide screen, one row per step on a phone.
   exampleChip() the small chip for a part that draws sample numbers until its data feed is built.
   bar()         a thin share bar for a table cell. */

import { put } from '../../kit.js';
import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, s, num, pct, addStyles, statusDot, tipShow, tipHide } from '../../kit.js';

const ok = n => n != null && isFinite(n);

const CSS = `
.fx-chip{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;background:var(--warn-bg);color:var(--warn);font-size:11.5px;font-weight:600;white-space:nowrap}
.fx-head{display:flex;align-items:flex-start;gap:12px 20px;flex-wrap:wrap;margin-bottom:6px}
.fx-head>div:first-child{flex:1 1 260px;min-width:0}
.fx-head h3{font-size:var(--fs-card,14px);font-weight:600;letter-spacing:-.005em}
.fx-head p{color:var(--muted);font-size:13px;margin-top:2px}
.fx-head .tools{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.fx-src{display:block;font-size:12px;color:var(--faint);line-height:1.4;margin:0 0 8px}
.lx-card.flush>.fx-src{padding:0 28px}
.fx-big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:6px 0 14px}
.fx-big>span:last-child{color:var(--muted);font-size:13.5px}
.fx-flow{position:relative;width:100%;min-width:0}
.fx-flow svg{display:block;width:100%;overflow:visible;touch-action:pan-y}
.fx-flow .cols{display:block;position:relative;height:46px}
.fx-flow .cols div{position:absolute;top:0;white-space:nowrap}
.fx-flow .cols b{display:block;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.fx-flow .cols span{display:block;font-size:13.5px;font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.fx-flow .cols .r{text-align:right}
.fx-flow .lk{fill:rgba(28,20,10,.075);cursor:pointer;outline:none;transition:fill .12s,opacity .12s}
.fx-flow .lk.lead{fill:url(#lx-line) var(--brand);opacity:.42}
.fx-flow .nd{fill:var(--slate);cursor:pointer;transition:opacity .12s}
.fx-flow .nd.soft{fill:var(--icon)}
.fx-flow .nd.ghost{fill:var(--line-strong)}
.fx-flow text{font-family:var(--sans);font-size:12.5px;fill:var(--ink);font-variant-numeric:tabular-nums;pointer-events:none;transition:opacity .12s}
.fx-flow text .q{fill:var(--muted);font-weight:400}
.fx-flow text.nl{font-weight:500;paint-order:stroke;stroke:var(--surface);stroke-width:3.5px;stroke-linejoin:round}
.fx-flow text.ll{fill:var(--muted);font-size:12px}
.fx-flow.hot .lk{fill:rgba(28,20,10,.035);opacity:1}
.fx-flow.hot .lk.on{fill:var(--slate);opacity:.72}
.fx-flow.hot .nd{opacity:.28}
.fx-flow.hot .nd.on{opacity:1}
.fx-flow.hot text.nl,.fx-flow.hot text.ll{opacity:.35}
.fx-flow.hot text.on{opacity:1}
.fx-flow .lk:focus-visible{stroke:var(--ink);stroke-width:1.5px}
.fx-tip{position:absolute;z-index:3;min-width:170px;max-width:260px;padding:10px 12px;border-radius:var(--r-btn,10px);background:var(--tip-bg);box-shadow:var(--tip-sh);font-size:12.5px;color:var(--tip-muted);pointer-events:none}
.fx-tip b{display:block;color:var(--tip-fg);font-weight:600;margin-bottom:3px}
.fx-tip span{display:block}
.fx-tip em{font-style:normal;color:var(--tip-fg);font-weight:600;font-variant-numeric:tabular-nums}
.fx-under{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:16px;padding-top:14px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}
.fx-under .sp{flex:1}
.fx-bar{display:block;width:100%;min-width:60px;height:5px;border-radius:999px;background:var(--bg-sunk);position:relative}
.fx-bar::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);background:var(--ink);border-radius:999px}
.fx-bar.soft::after{background:var(--icon)}
.fx-steps{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:0 22px;align-items:end}
.fx-steps .col{display:flex;flex-direction:column;justify-content:flex-end;height:var(--h);position:relative;border-bottom:1px solid var(--line-strong)}
.fx-steps .col i{display:block;width:44%;min-width:44px;max-width:84px;min-height:3px;height:var(--v);border-radius:var(--r-chip,6px) var(--r-chip,6px) 0 0;background:var(--brand)}
.fx-steps .col.dim i{background:var(--slate)}
.fx-steps .col i{cursor:default}
.fx-steps .col .lbl{position:absolute;left:0;bottom:calc(var(--v) + 6px);font-size:12px;font-weight:600;color:var(--ink-2);font-variant-numeric:tabular-nums;white-space:nowrap}
.fx-steps .col .flag~.lbl{bottom:calc(var(--v) + 30px)}
.fx-bigtxt{font-size:var(--num-m);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--ink)}
.fx-key{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted)}
.fx-key i{display:inline-block;width:18px;height:8px;border-radius:999px;background:var(--brand);opacity:.6}
.fx-steps .col .flag{position:absolute;left:0;bottom:calc(var(--v) + 10px);white-space:nowrap}
.fx-steps .cap{padding-top:12px;min-width:0}
.fx-steps .cap b{display:block;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fx-steps .cap strong{display:block;font-size:22px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.25}
.fx-steps .cap span{display:block;font-size:12.5px;color:var(--muted)}
.fx-steps .cap span.worst{color:var(--bad);font-weight:600}
.fx-rows{display:none}
.fx-rows .row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;padding:12px 0;border-top:1px solid var(--line)}
.fx-rows .row:first-child{border-top:0}
.fx-rows .row b{font-size:13.5px;font-weight:500}
.fx-rows .row strong{font-size:17px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;text-align:right}
.fx-rows .row .fx-bar{grid-column:1/-1;height:8px;margin:4px 0}
.fx-rows .row span{grid-column:1/-1;font-size:12.5px;color:var(--muted)}
.fx-rows .row span.worst{color:var(--bad);font-weight:600}
.fx-rows .fx-bar::after{background:var(--brand)}
.fx-rows .fx-bar.soft::after{background:var(--slate)}
.fx-path{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}
.fx-path .then{color:var(--faint);font-size:12px}
.fx-dot{display:inline-flex;align-items:center;gap:7px;font-weight:500;white-space:nowrap}
.fx-dot::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--dot,var(--faint));flex:none}
.fx-kpis .lx-kpi .l{white-space:normal}
.fx-kpis .lx-kpi .s{flex-wrap:wrap}
.fx-note{font-size:13.5px;color:var(--ink-2);padding:14px 28px 18px;border-top:1px solid var(--line)}
.fx-note b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.lx-card.fx-pad{padding:28px 32px 24px}
.lx-card.flush>.fx-head{padding:20px 28px 6px;margin:0}
.lx-table td.fx-barcell{width:34%;min-width:90px}
@media (max-width:759px){
  .lx-card.fx-pad{padding:18px}
  .lx-card.flush>.fx-head{padding:16px 18px 6px}
  .lx-card.flush>.fx-src{padding:0 18px}
  .fx-steps{display:none}
  .fx-hint{display:none}
  .fx-rows{display:block}
  .fx-kpis .lx-kpi.lg .v{font-size:var(--num-l)}
  .fx-flow text{font-size:11.5px}
  .fx-flow .cols span{font-size:12.5px}
  .fx-flow .cols b{font-size:11px}
  .fx-note{padding:12px 18px 16px}
  .lx-table td.fx-barcell{width:26%;min-width:56px}
  .lx-card.flush .lx-table th:first-child,.lx-card.flush .lx-table td:first-child{padding-left:18px}
  .lx-card.flush .lx-table th:last-child,.lx-card.flush .lx-table td:last-child{padding-right:18px}
}`;
export function fxStyles() { addStyles('fx-style', CSS); }

/** The chip beside a title when the part below draws sample numbers in real mode. */
export const exampleChip = kitExampleChip; /* one version, in the kit */

/** A thin share bar. share is 0 to 1 of the widest row. */
export function bar(share, soft) {
  return h('span', { class: 'fx-bar' + (soft ? ' soft' : ''), style: { '--v': Math.max(0, Math.min(100, 100 * (share || 0))).toFixed(1) + '%' } });
}

/** The hover hint inside a card's quiet line, left out on a phone, where the steps are rows with no hover. */
export const hint = text => h('span', { class: 'fx-hint' }, text);

/** A card heading with a question, a quiet line, and tools on the right. */
export function head(title, sub, ...tools) {
  return h('div', { class: 'fx-head' }, h('div', null, h('h3', null, title), sub ? h('p', null, sub) : null), h('div', { class: 'tools' }, tools.filter(Boolean)));
}

/* platform dots: the kit's own platform colors, a dot at most */
const DOTS = { meta: 'var(--c-meta)', google: 'var(--c-google)', email: 'var(--c-email)', tiktok: 'var(--c-tiktok)', amazon: 'var(--c-amazon)', organic: 'var(--muted)', direct: 'var(--icon)', other: 'var(--line-strong)' };
const NAMES = { meta: 'Meta', google: 'Google', email: 'Email', tiktok: 'TikTok', amazon: 'Amazon', organic: 'Organic and social', direct: 'Direct', other: 'Other' };
export const channelName = id => NAMES[id] || id;
export function channelDot(id, label) { return h('span', { class: 'fx-dot', style: { '--dot': DOTS[id] || 'var(--faint)' } }, label || channelName(id)); }
/** "Meta then Google then Bought" as dots. */
export function pathDots(ids, { end } = {}) {
  const kids = [];
  ids.forEach((id, i) => { if (i) kids.push(h('span', { class: 'then' }, 'then')); kids.push(channelDot(id)); });
  if (end) kids.push(h('span', { class: 'then' }, end));
  return h('span', { class: 'fx-path' }, kids);
}

/* ---------- the funnel steps ---------- */
/** steps([{ label, value, sub, worst, src }], { height, relative })
    One bar per step with the count and the share that made it under each. The step marked worst carries the crimson
    dot. relative: true draws each bar as its share of the step before (the first is full), so a small step still
    shows how much of the one before it kept; the count is written on the bar. Every bar has a hover bubble. */
export function steps(list, { height = 330, relative = false } = {}) {
  const max = Math.max(1, ...list.map(x => x.value || 0));
  const share = (x, i) => relative ? (i === 0 ? 100 : 100 * (x.value || 0) / Math.max(1, list[i - 1].value || 0)) : 100 * (x.value || 0) / max;
  const cols = h('div', { class: 'fx-steps', style: { '--n': list.length, '--h': height + 'px' }, role: 'img',
    'aria-label': list.map(x => `${x.label} ${num(x.value)}`).join(', ') },
    list.map((x, i) => {
      const col = h('div', { class: 'col' + (i ? ' dim' : ''), style: { '--v': Math.min(100, share(x, i)).toFixed(2) + '%' } },
        x.worst ? h('span', { class: 'flag' }, statusDot('bad', 'Biggest drop')) : null, relative && i ? h('span', { class: 'lbl' }, pct(share(x, i) / 100, { digits: share(x, i) < 10 ? 1 : 0 })) : null, h('i'));
      const bar = col.querySelector('i');
      const tip = () => [h('b', null, x.label), h('span', null, 'Count ', h('b', null, num(x.value))), i ? h('span', null, 'Of the step before ', h('b', null, pct((x.value || 0) / Math.max(1, list[i - 1].value || 0), { digits: 1 }))) : null, x.src ? h('span', null, x.src) : null];
      bar.addEventListener('mouseenter', () => tipShow(bar, tip(), bar));
      bar.addEventListener('mouseleave', () => tipHide(bar));
      return col;
    }),
    list.map(x => h('div', { class: 'cap' }, h('b', null, x.label), h('strong', null, num(x.value)), h('span', { class: x.worst ? 'worst' : '' }, x.sub || ''))));
  const rows = h('div', { class: 'fx-rows' }, list.map((x, i) => h('div', { class: 'row' },
    h('b', null, x.label), h('strong', null, num(x.value)), bar(share(x, i) / 100, i > 0), h('span', { class: x.worst ? 'worst' : '' }, (x.worst ? 'Biggest drop: ' : '') + (x.sub || '')))));
  return h('div', null, cols, rows);
}

/* ---------- the flow ---------- */
let ro = null;
const watch = (el, fn) => {
  if (!ro && typeof ResizeObserver !== 'undefined') ro = new ResizeObserver(list => { for (const e of list) { const w = Math.round(e.contentRect.width); if (e.target._fxw !== w) { e.target._fxw = w; e.target._fxdraw && e.target._fxdraw(w); } } });
  el._fxdraw = fn;
  if (ro) ro.observe(el); else fn(el.clientWidth || 900);
};

/** flow({ columns, links, unit, total, height, phoneHeight, lead, label })
    columns: [{ title, short, sub, align, nodes: [{ id, label, short, value, note, soft, ghost }] }]
      align: 'bottom' puts a column's blocks at the foot, so bands that skip it pass above.
      value sets the block height. A ghost block is drawn small and gray and is not to scale.
      note is the quiet text after the label ("1,548 of 11,890"); without it the value is shown.
    links:   [{ from, to, value, text, name }]  from and to are node ids, in any two columns.
      text is written on a wide band ("Meta only, 196 orders"); name is the read out title.
    lead:    'from>to' of the one band drawn in ember before anything is hovered.
    Hover, focus or tap a band or a block: everything else dims and a read out shows the count. */
export function flow(o = {}) {
  fxStyles();
  const { columns = [], links = [], unit = 'orders', total, height = 640, phoneHeight = 560, lead, label = 'Flow' } = o;
  const box = h('div', { class: 'fx-flow' });
  const tip = h('div', { class: 'fx-tip', hidden: true });
  const byId = new Map();
  columns.forEach((c, ci) => c.nodes.forEach((n, ni) => byId.set(n.id, { ...n, ci, ni })));
  const good = links.filter(l => byId.has(l.from) && byId.has(l.to) && l.value > 0);
  if (!columns.length || !good.length) { box.append(h('p', { class: 'fx-under' }, o.empty || 'Nothing to draw for these dates')); return box; }

  const draw = W => {
    const phone = W < 620;
    const H = phone ? phoneHeight : height;
    const nw = phone ? 9 : 14, gap = phone ? 10 : 14, last = columns.length - 1;
    /* room for the labels: left of the first column and right of the last on a wide screen; inside on a phone */
    const labW = n => (n.label.length + 1 + String(n.note || (n.ghost ? num(n.count != null ? n.count : n.value) + ', not to scale' : num(n.value))).length) * 6.6 + 14;
    const widest = c => (c ? Math.max(0, ...c.nodes.map(labW)) : 0);
    const ML = phone ? 0 : Math.round(Math.min(W * 0.3, Math.max(90, widest(columns[0]))));
    const MR = phone ? 0 : Math.round(Math.min(W * 0.3, Math.max(90, widest(columns[last]))));
    const xOf = ci => ML + (W - ML - MR - nw) * (last ? ci / last : 0);
    const GH = phone ? 22 : 30;
    let k = Infinity;
    for (const c of columns) {
      const real = c.nodes.filter(n => !n.ghost), sum = real.reduce((a, n) => a + (n.value || 0), 0);
      const ghosts = c.nodes.length - real.length;
      if (sum > 0) k = Math.min(k, (H - gap * (c.nodes.length - 1) - ghosts * GH) / sum);
    }
    if (!isFinite(k) || k <= 0) k = 1;
    /* blocks */
    const pos = new Map();
    columns.forEach((c, ci) => {
      /* a column can sit at the foot of the drawing (align: 'bottom'), so bands that skip it run clear above */
      const used = c.nodes.reduce((a, n) => a + (n.ghost ? GH : Math.max(2, (n.value || 0) * k)), 0) + gap * (c.nodes.length - 1);
      let y = c.align === 'bottom' ? Math.max(0, H - used) : 0;
      c.nodes.forEach(n => {
        const hh = n.ghost ? GH : Math.max(2, (n.value || 0) * k);
        pos.set(n.id, { x: xOf(ci), y, h: hh, ci, out: 0, inn: 0, n });
        y += hh + gap;
      });
    });
    /* bands: leave a block in the order of where they land, arrive in the order of where they left */
    const order = (a, b) => (a.y - b.y) || (a.ci - b.ci);
    const outOf = id => good.filter(l => l.from === id).sort((a, b) => order(pos.get(a.to), pos.get(b.to)));
    const inOf = id => good.filter(l => l.to === id).sort((a, b) => order(pos.get(a.from), pos.get(b.from)));
    const geo = new Map();
    for (const [id, p] of pos) {
      const outs = outOf(id), ins = inOf(id);
      const fit = list => { const sum = list.reduce((a, l) => a + l.value * k, 0); return sum > p.h && sum > 0 ? p.h / sum : 1; };
      let f = fit(outs), y = p.y;
      for (const l of outs) { const t = Math.max(1, l.value * k * f); (geo.get(l) || geo.set(l, {}).get(l)).a = [y, y + t]; y += l.value * k * f; }
      f = fit(ins); y = p.y;
      for (const l of ins) { const t = Math.max(1, l.value * k * f); (geo.get(l) || geo.set(l, {}).get(l)).b = [y, y + t]; y += l.value * k * f; }
    }
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': label });
    const gl = s('g'), gn = s('g'), gt = s('g');
    const say = l => { const a = byId.get(l.from), b = byId.get(l.to); return l.name || `${a.label}, then ${b.label}`; };
    const linkEls = [];
    for (const l of good) {
      const g = geo.get(l); if (!g || !g.a || !g.b) continue;
      const a = pos.get(l.from), b = pos.get(l.to);
      const x0 = a.x + nw, x1 = b.x, mx = (x0 + x1) / 2;
      const d = `M${x0} ${g.a[0].toFixed(1)}C${mx} ${g.a[0].toFixed(1)} ${mx} ${g.b[0].toFixed(1)} ${x1} ${g.b[0].toFixed(1)}L${x1} ${g.b[1].toFixed(1)}C${mx} ${g.b[1].toFixed(1)} ${mx} ${g.a[1].toFixed(1)} ${x0} ${g.a[1].toFixed(1)}Z`;
      const key = l.from + '>' + l.to;
      const p = s('path', { class: 'lk' + (lead === key ? ' lead' : ''), d, tabindex: 0, role: 'button',
        'aria-label': `${say(l)}: ${num(l.value)} ${unit}` });
      p._l = l; p._mid = [mx, (g.a[0] + g.a[1] + g.b[0] + g.b[1]) / 4];
      linkEls.push(p); gl.append(p);
      /* the words sit where the band leaves its block, so they never land on a block in a middle column */
      if (l.text && !phone && g.a[1] - g.a[0] >= 18) {
        const t = s('text', { class: 'll', x: x0 + 14, y: (g.a[0] + g.a[1]) / 2 + 4, 'text-anchor': 'start' }, l.text); t._l = l; gt.append(t);
      }
    }
    /* blocks and their labels, kept from sitting on each other */
    const nodeEls = [], labelEls = [];
    columns.forEach((c, ci) => {
      const side = ci === 0 && !phone ? 'left' : ci === last && phone ? 'left' : 'right';
      let floor = -Infinity;
      const lab = c.nodes.map(n => { const p = pos.get(n.id); let y = p.y + p.h / 2 + 4; if (y < floor) y = floor; floor = y + (phone ? 14 : 16); return { n, p, y }; });
      let over = lab.length ? lab[lab.length - 1].y - (H - 2) : 0;
      for (let i = lab.length - 1; i >= 0 && over > 0; i--) { lab[i].y -= over; over = i ? Math.max(0, lab[i - 1].y + (phone ? 14 : 16) - lab[i].y) : 0; }
      for (const { n, p, y } of lab) {
        const r = s('rect', { class: 'nd' + (n.ghost ? ' ghost' : n.soft ? ' soft' : ''), x: p.x, y: p.y.toFixed(1), width: nw, height: p.h.toFixed(1), rx: 2 });
        r._id = n.id; nodeEls.push(r); gn.append(r);
        /* on a phone a last column with one block already says its name and count in the column head; a label would sit on the bands */
        if (phone && ci === last && c.nodes.length === 1) continue;
        const name = phone && n.short ? n.short : n.label;
        const quiet = n.note && !phone ? n.note : n.ghost ? num(n.count != null ? n.count : n.value) + (phone ? '' : ', not to scale') : num(n.value);
        const t = s('text', { class: 'nl', x: side === 'left' ? p.x - 8 : p.x + nw + 8, y: y.toFixed(1), 'text-anchor': side === 'left' ? 'end' : 'start' },
          name + ' ', s('tspan', { class: 'q' }, quiet));
        t._id = n.id; labelEls.push(t); gt.append(t);
      }
    });
    svg.append(gl, gn, gt);

    /* the column titles, as HTML above the drawing */
    const heads = h('div', { class: 'cols' }, columns.map((c, ci) => {
      const right = ci === last && last > 0;
      return h('div', { class: right ? 'r' : '', style: right ? { right: (W - xOf(ci) - nw) + 'px' } : { left: xOf(ci) + 'px' } }, h('b', null, (phone && c.short) || c.title || ''), h('span', null, phone ? String(c.sub || '').replace(/ (orders|customers)$/, '') : c.sub || ''));
    }));

    /* hover dimming and the read out */
    const clear = () => { box.classList.remove('hot'); for (const e of [...linkEls, ...nodeEls, ...labelEls, ...gt.children]) e.classList.remove('on'); tip.hidden = true; };
    const place = (x, y) => {
      tip.hidden = false;
      const tw = tip.offsetWidth || 200, th = tip.offsetHeight || 60;
      tip.style.left = Math.max(0, Math.min(W - tw, x - tw / 2)) + 'px';
      tip.style.top = Math.max(0, y + 46 - th - 14) + 'px';
    };
    const lightLinks = set => {
      box.classList.add('hot');
      const ids = new Set();
      for (const e of linkEls) { const on = set.has(e._l); e.classList.toggle('on', on); if (on) { ids.add(e._l.from); ids.add(e._l.to); } }
      for (const e of nodeEls) e.classList.toggle('on', ids.has(e._id));
      for (const e of gt.children) e.classList.toggle('on', e._l ? set.has(e._l) : ids.has(e._id));
    };
    const showLink = (e, at) => {
      const l = e._l; lightLinks(new Set([l]));
      const a = byId.get(l.from), z = byId.get(l.to), fromN = a && (a.count != null ? a.count : a.value);
      const of = ok(total) && total > 0 ? h('span', null, h('em', null, pct(l.value / total, { digits: 1 })), ' of all ' + num(total) + ' ' + unit) : null;
      const ofFrom = ok(fromN) && fromN > 0 && !a.ghost ? h('span', null, h('em', null, pct(l.value / fromN, { digits: 1 })), ' of ' + a.label) : null;
      put(tip, h('b', null, say(l)), h('span', null, 'From ', h('em', null, a ? a.label : ''), ' to ', h('em', null, z ? z.label : '')), h('span', null, h('em', null, num(l.value) + ' ' + unit)), ofFrom, of, l.extra ? h('span', null, l.extra) : null);
      place(at ? at[0] : e._mid[0], at ? at[1] : e._mid[1]);
    };
    const showNode = (id, at) => {
      const set = new Set(good.filter(l => l.from === id || l.to === id));
      if (!set.size) return clear();
      lightLinks(set);
      const n = byId.get(id), p = pos.get(id);
      put(tip, h('b', null, n.label), h('span', null, h('em', null, num(n.count != null ? n.count : n.value)), ' ', n.tip || unit));
      place(at ? at[0] : p.x, at ? at[1] : p.y + p.h / 2);
    };
    const local = ev => { const r = svg.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    svg.addEventListener('pointermove', ev => {
      const t = ev.target;
      if (t._l && t.classList.contains('lk')) showLink(t, local(ev)); else if (t._id && t.classList.contains('nd')) showNode(t._id, local(ev)); else if (ev.pointerType === 'mouse') clear();
    });
    svg.addEventListener('pointerdown', ev => {
      const t = ev.target;
      if (t._l && t.classList.contains('lk')) showLink(t, local(ev)); else if (t._id && t.classList.contains('nd')) showNode(t._id, local(ev)); else clear();
    });
    svg.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') clear(); });
    svg.addEventListener('focusin', ev => { if (ev.target._l) showLink(ev.target); });
    svg.addEventListener('focusout', clear);

    put(box, heads, svg, tip);
    tip.hidden = true;
  };
  watch(box, draw);
  return box;
}
