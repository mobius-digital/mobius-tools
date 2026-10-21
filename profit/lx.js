/* THE LOCUS KIT, the behaviour half (2026-10-20, docs/handoffs/locus-ux-audit.md). lx.css is the look.
 *   window.LxKit.strip({tone, lead, n, text, go, goLabel, fold})   the one-line strip HTML (lx.css .lx-strip)
 *   window.LxKit.wireStrip(host)                                   "See both" folds the body under the strip open and shut
 *   window.LxKit.panel(title, html) / .closePanel()                the shared side panel (v2.js's panel; a sheet on a phone)
 * The page header's "..." menu (Tour, Metrics, Help and the page's purpose line) is wired here with one delegated
 * listener, so a re-rendered head needs nothing. Tokens only, no em dashes. */
(function () {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- the "..." menu on the page header ---------- */
  const closeMenus = except => document.querySelectorAll('.ph-menu-w.open').forEach(w => { if (w !== except) w.classList.remove('open'); });
  document.addEventListener('click', e => {
    const more = e.target.closest('.ph-more');
    if (more) {
      e.preventDefault(); e.stopPropagation();
      const w = more.closest('.ph-menu-w');
      /* on a phone the menu is the shared bottom sheet (phone.js), like every other Locus menu there */
      if (window.LxPhone && LxPhone.isPhone && LxPhone.isPhone()) {
        const menu = w.querySelector('.ph-menu'); const t = document.querySelector('main .ph .ph-t');
        closeMenus();
        LxPhone.open(t ? t.textContent.trim() : '', menu ? menu.outerHTML : '', b => {
          b.addEventListener('click', ev => { if (ev.target.closest('button')) setTimeout(() => LxPhone.close(), 0); });
        });
        return;
      }
      const open = !w.classList.contains('open');
      closeMenus(w);
      if (typeof window.closePops === 'function') { try { window.closePops(); } catch {} }
      w.classList.toggle('open', open);
      more.setAttribute('aria-expanded', String(open));
      return;
    }
    /* a choice inside the menu bubbles on to index.html's data-tour / data-gloss / data-help handlers; the menu closes */
    if (e.target.closest('.ph-menu')) { setTimeout(closeMenus, 0); return; }
    closeMenus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

  /* ---------- the strip ---------- */
  function strip(o) {
    const tone = o.tone || 'warn';
    return `<div class="lx-strip" data-tone="${esc(tone)}" role="status">${o.lead ? `<b>${o.lead}</b>` : ''}${o.n ? `<span class="n">${esc(o.n)}</span>` : ''}${o.text ? `<span class="d">${o.text}</span>` : ''}${o.fold ? `<button type="button" class="lx-fold" aria-expanded="false">${esc(o.fold)}</button>` : ''}${o.go ? `<button type="button" class="go" data-go="${esc(o.go)}">${esc(o.goLabel || 'Open')} ›</button>` : ''}</div>${o.fold ? '<div class="lx-strip-body" hidden></div>' : ''}`;
  }
  function wireStrip(host, onOpen) {
    const b = host.querySelector('.lx-fold'), body = host.querySelector('.lx-strip-body');
    if (!b || !body) return;
    const open = b.textContent;
    b.onclick = () => {
      const on = body.hidden;
      body.hidden = !on;
      b.setAttribute('aria-expanded', String(on));
      b.textContent = on ? 'Fold' : open;
      if (on && onOpen) onOpen(body);
    };
  }

  /* ---------- the side panel ---------- */
  const panel = (title, html) => (window.V2 && window.V2.panel) ? window.V2.panel(title, html) : null;
  const closePanel = () => { if (window.V2 && window.V2.closePanel) window.V2.closePanel(); };

  /* ---------- PHASE 7 (2026-10-20): the card "..." and the bar list ---------- */
  /* cardMenu(why, buttonsHtml): the same .ph-menu-w the page header uses, so the delegated listener above serves it. */
  const MORE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/></svg>';
  function cardMenu(why, buttons) {
    if (!why && !buttons) return '';
    const whys = Array.isArray(why) ? why : [why];
    return `<span class="ph-menu-w v2h-m"><button type="button" class="ph-more" aria-haspopup="true" aria-expanded="false" aria-label="About this card" title="About this card">${MORE_SVG}</button><div class="ph-menu" role="menu">${whys.filter(Boolean).map(w => `<p class="ph-why">${w}</p>`).join('')}${buttons || ''}</div></span>`;
  }
  /* rowMenu(buttonsHtml): one "..." at the end of a table row; the buttons keep their own data-* handlers. */
  const rowMenu = buttons => `<td class="lx-rm"><span class="ph-menu-w"><button type="button" class="ph-more" aria-haspopup="true" aria-expanded="false" aria-label="Row menu">${MORE_SVG}</button><div class="ph-menu" role="menu">${buttons}</div></span></td>`;
  /* bars(rows, {max, rows:true}): label, bar, value on one row. row = {label, sub, v (number), value (text), tone, note, tick (0..1), ghost (number), tip} */
  function bars(rows, o = {}) {
    const list = (rows || []).filter(Boolean); if (!list.length) return '';
    const max = o.max || Math.max(...list.map(r => Math.max(+r.v || 0, +r.ghost || 0)), 1e-9);
    const w = v => Math.max(0, Math.min(100, (+v || 0) / max * 100)).toFixed(1);
    return `<div class="lx-bars${o.rows ? ' rows' : ''}">${list.map(r => `<div class="lx-bar${r.tone ? ' ' + esc(r.tone) : ''}"${r.tip ? ` data-tip="${esc(r.tip)}"` : ''}${r.go ? ` data-go="${esc(r.go)}" role="link" tabindex="0"` : ''}><span class="l">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span><span class="t">${r.ghost != null ? `<i class="g" style="width:${w(r.ghost)}%"></i>` : ''}<i style="width:${w(r.v)}%"></i>${r.tick != null ? `<b style="left:${Math.max(0, Math.min(100, r.tick * 100)).toFixed(1)}%"></b>` : ''}</span><span class="v">${r.value != null ? r.value : esc(String(r.v))}${r.note ? `<small>${esc(r.note)}</small>` : ''}</span></div>`).join('')}</div>${o.foot ? `<p class="lx-bars-foot">${o.foot}</p>` : ''}`;
  }

  /* ---------- THE INSTRUMENT KIT (2026-10-21, review round one, pass A) ----------
     One look for every chart: thin strokes, 2 to 4px radius, the brand blue plus greys, numbers inside the chart, a visible
     scale, one legend line with the sentence on hover, a 400ms grow on paint (lx.css .lx-anim, off for reduced motion).
     Status lives in a chip (chip()), never in the colour of a wide stroke. */
  const clamp01 = v => Math.max(0, Math.min(1, +v || 0));
  const tip = html => html ? ` data-v2tip="${esc(html)}"` : '';
  /* chip(tone, text): good / warn / bad / brand / quiet */
  const chip = (tone, text) => `<span class="lx-st ${esc(tone || 'quiet')}">${esc(text)}</span>`;

  /* ring(pct, {label, sub, outer, size, chip}): a thin brand-blue stroke on a thin track, the number inside, an optional thin
     outer arc (a second reading, e.g. where the month lands), the status as a chip under it. */
  function ring(pct, o = {}) {
    const size = o.size || 132, r = 56, c = 2 * Math.PI * r, r2 = 63, c2 = 2 * Math.PI * r2, p = pct == null ? 0 : clamp01(pct);
    const sm = size < 80;
    return `<div class="lx-ring${sm ? ' sm' : ''}" style="--rs:${size}px"><svg viewBox="0 0 132 132" aria-hidden="true">
      <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--lx-track)" stroke-width="${sm ? 9 : 5}"/>
      ${pct != null ? `<circle class="lx-ring-p" cx="66" cy="66" r="${r}" fill="none" stroke="var(--brand)" stroke-width="${sm ? 9 : 5}" stroke-linecap="round" stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" style="--rc:${c.toFixed(1)}"/>` : ''}
      ${o.outer != null && !sm ? `<circle cx="66" cy="66" r="${r2}" fill="none" stroke="var(--line)" stroke-width="1"/><circle class="lx-ring-p" cx="66" cy="66" r="${r2}" fill="none" stroke="var(--muted)" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="${(c2 * clamp01(o.outer)).toFixed(1)} ${c2.toFixed(1)}" style="--rc:${c2.toFixed(1)}"/>` : ''}
      </svg><div class="c"><b>${o.label ?? (pct == null ? '–' : Math.round(pct * 100) + '%')}</b>${o.sub && !sm ? `<small>${o.sub}</small>` : ''}</div></div>${o.chip ? `<div class="lx-ring-chip">${o.chip}</div>` : ''}`;
  }
  /* planChip(pct): the month's status against plan, words not colour on the ring */
  const planChip = pct => pct == null ? '' : pct >= 0.98 ? chip('good', 'On plan') : pct >= 0.85 ? chip('warn', 'Close to plan') : chip('bad', 'Behind plan');

  /* spark(vals, {fmt, tips, ghost, h}): 56px tall, a baseline, the min and max printed on a right-hand scale, a soft fill
     under the line only. Hover answers through v2.js's [data-spk] reader (it marks the LAST polyline). */
  function spark(vals, o = {}) {
    const v = (vals || []).map(x => x == null || !isFinite(x) ? null : +x); if (v.filter(x => x != null).length < 2) return '';
    const W = 300, Hh = o.h || 56, top = 5, bot = Hh - 3, g = (o.ghost || []).map(x => x == null || !isFinite(x) ? null : +x);
    const all = v.concat(g).filter(x => x != null), mx = Math.max(...all), mn = Math.min(...all), rg = mx - mn || 1;
    const Y = y => (bot - (y - mn) / rg * (bot - top)).toFixed(1), X = (i, n) => (i / Math.max(1, n - 1) * W).toFixed(1);
    const pts = a => a.map((y, i) => y == null ? null : `${X(i, a.length)},${Y(y)}`).filter(Boolean);
    const p = pts(v), gp = g.length > 1 ? pts(g) : [];
    const fmt = o.fmt || (x => String(Math.round(x)));
    const svg = `<svg class="v2spark lx-spk-s" viewBox="0 0 ${W} ${Hh}" preserveAspectRatio="none" aria-hidden="true"${o.tips && o.tips.length === v.length ? ` data-spk="${esc(JSON.stringify(o.tips))}"` : ''}>
      <line x1="0" x2="${W}" y1="${top}" y2="${top}" stroke="var(--v2-grid,var(--line))" stroke-dasharray="2 3" vector-effect="non-scaling-stroke"/>
      <line x1="0" x2="${W}" y1="${bot}" y2="${bot}" stroke="var(--line-strong)" vector-effect="non-scaling-stroke"/>
      <path d="M${p[0]} L${p.slice(1).join(' L')} L${p[p.length - 1].split(',')[0]},${bot} L${p[0].split(',')[0]},${bot}Z" fill="url(#lx-area)" stroke="none"/>
      ${gp.length ? `<polyline points="${gp.join(' ')}" fill="none" stroke="var(--v2-cmp)" stroke-width="1.2" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` : ''}
      <polyline class="lx-spk-l" points="${p.join(' ')}" fill="none" stroke="var(--brand)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
    return `<div class="lx-spk">${svg}<span class="mx">${esc(fmt(mx))}</span><span class="mn">${esc(fmt(mn))}</span></div>`;
  }

  /* river(segs, {total, fmt, mark, markLabel}): one thin segmented bar on a baseline. seg = {label, v, color, tip}. A number
     sits inside a segment when the segment is wide enough; the legend is one line (dot, word, number); hover gives the sentence.
     mark = a value on the same scale drawn as a tick (a normal day). */
  function river(segs, o = {}) {
    const list = (segs || []).filter(s => s && s.v > 0); if (!list.length) return '';
    const total = Math.max(o.total || 0, list.reduce((s, x) => s + x.v, 0), 1e-9), fmt = o.fmt || (x => String(Math.round(x)));
    const markAt = o.mark != null && o.mark > 0 ? clamp01(o.mark / total) * 100 : null;
    return `<div class="lx-river lx-anim"><div class="lx-river-t">${list.map(s => { const w = s.v / total * 100; return `<i style="width:${w.toFixed(2)}%;background:${s.color}"${tip(s.tip || `<b>${esc(s.label)}</b> ${esc(fmt(s.v))} · ${Math.round(w)}%`)}>${w >= 11 ? `<span>${esc(fmt(s.v))}</span>` : ''}</i>`; }).join('')}${markAt != null ? `<b class="lx-river-m" style="left:${markAt.toFixed(2)}%"${tip(o.markLabel || '')}></b>` : ''}</div>
      <div class="lx-river-base"><span>0</span><span>${esc(fmt(total))}</span></div>
      <div class="lx-legend">${list.map(s => `<span${tip(s.tip || '')}><i style="background:${s.color}"></i>${esc(s.label)} <b>${esc(fmt(s.v))}</b></span>`).join('')}</div></div>`;
  }

  /* funnel(steps, {fmt}): stepped bars, centred like a funnel, each step's carry-on rate in a chip between the steps,
     coloured against its benchmark (bench = the rate a healthy store carries to this step) and with the earlier rate.
     step = {label, v, prev, bench} */
  function funnel(steps, o = {}) {
    const list = (steps || []).filter(Boolean); if (!list.length || !list[0].v) return '';
    const top = Math.max(list[0].v, 1), fmt = o.fmt || (x => Math.round(x).toLocaleString('en-US'));
    const pc = x => x == null ? '–' : (x * 100 >= 10 ? (x * 100).toFixed(0) : (x * 100).toFixed(1)) + '%';
    let out = '<div class="lx-fun lx-anim">';
    list.forEach((s, i) => {
      if (i) {
        const a = list[i - 1], r = a.v ? s.v / a.v : null, pr = a.prev && s.prev != null ? s.prev / a.prev : null;
        const tone = r == null || !s.bench ? 'quiet' : r >= s.bench ? 'good' : r >= s.bench * 0.75 ? 'warn' : 'bad';
        out += `<div class="lx-fun-d"><span class="lx-st ${tone}"${tip(`${esc(pc(r))} of ${esc(a.label.toLowerCase())} went on to ${esc(s.label.toLowerCase())}${s.bench ? `. A healthy store carries about ${esc(pc(s.bench))}` : ''}${pr != null ? `; ${esc(pc(pr))} the period before` : ''}.`)}>${pc(r)} carry on</span>${s.bench ? `<small>benchmark ${pc(s.bench)}</small>` : ''}${pr != null ? `<small>${pc(pr)} before</small>` : ''}</div>`;
      }
      const w = Math.max(1.5, s.v / top * 100);
      out += `<div class="lx-fun-s"><span class="l">${esc(s.label)}</span><span class="t"><i style="width:${w.toFixed(2)}%"></i></span><b class="v">${esc(fmt(s.v))}</b></div>`;
    });
    return out + '</div>';
  }

  /* scale(v, {max, marks, fmt, label}): a marked bar. One fill to the value, labelled ticks at the marks (1.5x, 3x), the
     value printed over the end of the fill. Used where a dial was. mark = {at, label} */
  function scale(v, o = {}) {
    const max = o.max || Math.max(v || 0, ...(o.marks || []).map(m => m.at)) * 1.15 || 1, fmt = o.fmt || (x => String(x));
    const at = x => (clamp01(x / max) * 100).toFixed(2);
    return `<div class="lx-scale lx-anim"><div class="lx-scale-v" style="left:${at(v || 0)}%"><b>${v == null ? '–' : esc(fmt(v))}</b></div><div class="lx-scale-t">${v != null ? `<i style="width:${at(v)}%"></i>` : ''}${(o.marks || []).map(m => `<em style="left:${at(m.at)}%"></em>`).join('')}</div>
      <div class="lx-scale-m"><span style="left:0">0</span>${(o.marks || []).map(m => `<span style="left:${at(m.at)}%">${esc(m.label)}</span>`).join('')}</div></div>`;
  }

  /* waterfall(steps, {fmt}): columns with dashed connectors from one step's end to the next, the amount inside the bar
     (above it when the bar is short), totals in the brand blue. step = {label, v (signed), kind: 'tot' | 'sub', color} */
  function waterfall(steps, o = {}) {
    const fmt = o.fmt || (x => String(Math.round(x)));
    const max = Math.max(...steps.filter(s => s.kind).map(s => Math.abs(s.v || 0)), 1);
    const P = x => (Math.max(0, x) / max * 100);
    let run = 0;
    const cols = steps.map((s, i) => {
      const v = s.v || 0; let lo, hi, fill;
      if (s.kind) { lo = 0; hi = v; run = v; fill = s.kind === 'tot' ? (v < 0 ? 'var(--bad)' : 'var(--brand)') : 'var(--ink-3,var(--muted))'; }
      else { const from = run; run = from + v; lo = Math.min(from, run); hi = Math.max(from, run); fill = s.color || 'var(--m-other)'; }
      const b = P(Math.min(lo, hi)), h = Math.max(P(Math.max(lo, hi)) - b, 0.8), inside = h >= 16;
      const next = steps[i + 1];
      return `<div class="lx-wf-c${s.kind ? ' ' + s.kind : ''}"><div class="lx-wf-a"><i style="bottom:${b.toFixed(2)}%;height:${h.toFixed(2)}%;background:${fill}"${tip(`<b>${esc(s.label)}</b> ${v < 0 ? '−' : ''}${esc(fmt(Math.abs(v)))}`)}>${inside ? `<span>${v < 0 ? '−' : ''}${esc(fmt(Math.abs(v)))}</span>` : ''}</i>${`<span class="o${inside ? ' dup' : ''}" style="bottom:${(b + h).toFixed(2)}%">${v < 0 ? '−' : ''}${esc(fmt(Math.abs(v)))}</span>`}${next ? `<em class="cn" style="bottom:${P(run).toFixed(2)}%"></em>` : ''}</div><span class="l">${esc(s.label)}</span></div>`;
    });
    return `<div class="lx-wf lx-anim" style="--n:${steps.length}">${cols.join('')}</div>`;
  }

  /* ---------- ROW PANELS: a table row with no action of its own opens the panel with every column of that row ---------- */
  const rowOk = tr => tr && !tr.classList.contains('link') && !tr.classList.contains('tot') && !tr.closest('#v2panel,.lx-norow,thead') && !Object.keys(tr.dataset).length && !tr.onclick && tr.cells.length > 2 && !tr.querySelector('td[colspan],[data-go],[data-act],[data-prev],[onclick]');
  document.addEventListener('mouseover', e => { const tr = e.target.closest && e.target.closest('#main .v2tbl tbody tr'); if (tr && !tr.classList.contains('lx-rp') && rowOk(tr)) tr.classList.add('lx-rp'); }, { passive: true });
  document.addEventListener('click', e => {
    const tr = e.target.closest && e.target.closest('#main .v2tbl tbody tr'); if (!tr || e.defaultPrevented || e.target.closest('a,button,input,select,label,[data-go],[data-v2open],.nm.v2open') || !rowOk(tr)) return;
    const tbl = tr.closest('table'), heads = [...(tbl.tHead ? tbl.tHead.rows[0].cells : [])].map(th => th.textContent.trim());
    const cells = [...tr.cells], title = cells[0].textContent.trim().split('\n')[0] || 'Row';
    const card = tr.closest('.v2card'), from = card && card.querySelector('.v2h h3') ? card.querySelector('.v2h h3').textContent.trim() : '';
    panel(title, `<div class="lx-rowp">${from ? `<p class="lx-rowp-from">${esc(from)}</p>` : ''}<dl>${cells.slice(1).map((td, i) => td.textContent.trim() && td.textContent.trim() !== '–' ? `<div><dt>${esc(heads[i + 1] || '')}</dt><dd>${td.innerHTML}</dd></div>` : '').join('')}</dl></div>`);
  });

  /* ---------- menus flip at the window's edge (review 2026-10-21: the Brief's More menu was cut off on the right) ---------- */
  const fitMenus = () => document.querySelectorAll('.ph-menu-w.open, .hd-period.open').forEach(w => {
    const m = w.querySelector('.ph-menu, .hd-per-menu'); if (!m) return;
    w.classList.remove('flip', 'flipl');
    const r = m.getBoundingClientRect();
    if (r.right > innerWidth - 8) w.classList.add('flip');
    else if (r.left < 8) w.classList.add('flipl');
  });
  document.addEventListener('click', () => requestAnimationFrame(fitMenus));

  window.LxKit = { strip, wireStrip, panel, closePanel, cardMenu, rowMenu, bars, chip, ring, planChip, spark, river, funnel, scale, waterfall };

  /* THE ICON RAIL (2026-10-20): html.lx-irail between 721 and 1180px (lx.css draws it). The logo, the client picker and
     the account button open the wide rail (body.nav-open + the scrim, the old drawer's own state, so index.html's
     close-on-pick and Escape still work); the two menus then open inside the wide rail, nothing clips. */
  const irail = matchMedia('(min-width:721px) and (max-width:1180px)');
  /* THE RAIL COLLAPSES (review pass C, 2026-10-21): on a wide window the icon rail is a choice (localStorage pf_railmin),
     the same 56px rail the iPad gets on its own; #railMin in the rail foot flips it. */
  const pinnedMin = () => { try { return localStorage.getItem('pf_railmin') === '1'; } catch { return false; } };
  const setRail = () => {
    const on = irail.matches || (innerWidth > 1180 && pinnedMin());
    document.documentElement.classList.toggle('lx-irail', on);
    const b = document.getElementById('railMin');
    if (b) { const min = innerWidth > 1180 && pinnedMin(); b.hidden = irail.matches || innerWidth <= 720; b.title = min ? 'Show the full menu' : 'Collapse the menu to icons'; b.setAttribute('aria-pressed', String(min)); const l = b.querySelector('span'); if (l) l.textContent = min ? 'Show the menu' : 'Collapse'; }
  };
  addEventListener('resize', () => { if (innerWidth > 1180) setRail(); });
  document.addEventListener('click', e => {
    if (!e.target.closest('#railMin')) return;
    e.preventDefault(); e.stopPropagation();
    try { localStorage.setItem('pf_railmin', pinnedMin() ? '0' : '1'); } catch {}
    document.body.classList.remove('nav-open'); const sc = document.getElementById('navScrim'); if (sc) sc.hidden = true;
    setRail(); setTimeout(() => dispatchEvent(new Event('resize')), 240);
  }, true);
  const openRail = open => { document.body.classList.toggle('nav-open', open); const s = document.getElementById('navScrim'); if (s) s.hidden = !open; const t = document.getElementById('navToggle'); if (t) t.setAttribute('aria-expanded', open ? 'true' : 'false'); setTimeout(() => dispatchEvent(new Event('resize')), 240); /* polish.js re-measures the rail's sliding highlight on resize */ };
  setRail(); irail.addEventListener('change', () => { setRail(); if (!document.documentElement.classList.contains('lx-irail')) openRail(false); });
  const sideEl = document.getElementById('side'); if (sideEl) sideEl.addEventListener('transitionend', e => { if (e.propertyName === 'width') dispatchEvent(new Event('resize')); });   /* a background tab stalls the transition; re-measure when it really ends */
  document.addEventListener('click', e => {
    if (!document.documentElement.classList.contains('lx-irail')) return;
    const open = document.body.classList.contains('nav-open');
    if (e.target.closest('.side-brand')) { e.preventDefault(); e.stopPropagation(); openRail(!open); return; }
    if (!open && e.target.closest('#pfPickBtn, #pfMeBtn')) openRail(true);
    else if (open && e.target.closest('#tabs button[data-t], .side-foot .v2settings, .lc-pick-menu button, .lc-me-menu button')) setTimeout(() => openRail(false), 0);
  }, true);
})();
