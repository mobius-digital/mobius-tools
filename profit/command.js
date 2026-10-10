/* THE AGENCY COMMAND CENTER (2026-10-09). Home for "All clients": every brand as one row, sorted by what needs
 * attention, like Triple Whale's multi-store view, with the reasons beside each brand and one AI read across them.
 *
 * Data (all already in Locus, nothing new is synced):
 *  - the numbers on the row = the host snapshot `S.accounts` (/api/overview: the period on the picker, the compare
 *    period, the day series for the sparkline, month to date vs plan);
 *  - the reasons = profit worker GET /api/hub/command (hub.js `commandMany`: results off goal and for how long,
 *    launch cadence, creative fatigue, the Day check, setup gaps; fixed windows ending yesterday) + account-health
 *    GET /api/command/work (command.js: Asana overdue / stuck per brand, new clients being set up, alerts fired)
 *    + month to date against plan, judged here from the snapshot;
 *  - the read = account-health POST /api/read with screen 'command' (Sonnet, cached an hour per facts).
 * Every reason is a button that opens the brand page that shows it (or the Asana task). Team only: v2.js home()
 * never calls this for a client, and both routes refuse a client login (brandguard).
 * Classic script with its own closure; v2.js passes its host helpers. Uses window.V2UI for the shared pieces. */
(function () {
'use strict';
let H = null;
const U = () => window.V2UI;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CACHE = new Map();      // path -> {at, p}, 5 minutes, like v2.js get()
const READS = new Map();      // facts key -> read
const SEV = { bad: 10, warn: 4, info: 1 };
const SEV_LABEL = { bad: 'Act now', warn: 'Look today', info: 'Set up' };

function cached(key, fn, fresh) {
  const hit = CACHE.get(key);
  if (!fresh && hit && Date.now() - hit.at < 5 * 60e3) return hit.p;
  const p = fn(); CACHE.set(key, { at: Date.now(), p }); p.catch(() => CACHE.delete(key));
  return p;
}

function css() {
  if (document.getElementById('cmdCss')) return;
  const s = document.createElement('style'); s.id = 'cmdCss';
  s.textContent = `
  .cmd-read ol{margin:0;padding:0;list-style:none;display:grid;gap:10px;counter-reset:cf}
  .cmd-read li{display:grid;grid-template-columns:26px minmax(0,1fr);gap:4px 10px;align-items:start;counter-increment:cf}
  .cmd-read li::before{content:counter(cf);grid-row:span 2;width:22px;height:22px;border-radius:999px;background:var(--brand-soft);color:var(--brand-ink,var(--brand));font-size:12px;font-weight:650;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
  .cmd-read li .w{font-size:13.5px;line-height:1.5;color:var(--ink-2)}
  .cmd-read li .w b{color:var(--ink)}
  .cmd-read li .d{font-size:13px;color:var(--ink);font-weight:550}
  .cmd-read .lines{margin:12px 0 0;font-size:13px;color:var(--muted);line-height:1.5}
  .cmd-bn{font:inherit;font-weight:650;color:var(--ink);background:none;border:0;padding:0;cursor:pointer;text-align:left}
  .cmd-bn:hover{color:var(--brand)}
  .cmd-rows{display:flex;flex-direction:column}
  .cmd-row{display:grid;grid-template-columns:minmax(150px,190px) minmax(0,1.25fr) 96px minmax(0,1.35fr);gap:16px;align-items:start;padding:14px 0;border-top:1px solid var(--line)}
  .cmd-row:first-child{border-top:0;padding-top:4px}
  .cmd-name{display:flex;flex-direction:column;gap:5px;min-width:0}
  .cmd-name .cmd-bn{font-size:14.5px;display:flex;align-items:center;gap:8px}
  .cmd-dot{width:8px;height:8px;border-radius:99px;flex:none;background:var(--good)}
  .cmd-dot.warn{background:var(--warn)} .cmd-dot.bad{background:var(--bad)} .cmd-dot.info{background:var(--faint,var(--muted))}
  .cmd-name small{font-size:12px;color:var(--muted)}
  .cmd-pills{display:flex;flex-wrap:wrap;gap:6px}
  .cmd-pill{display:inline-flex;flex-direction:column;gap:1px;padding:6px 10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2);min-width:84px}
  .cmd-pill .l{font-size:11px;color:var(--muted);font-weight:550}
  .cmd-pill .v{font-size:14px;font-weight:650;color:var(--ink);font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:5px;white-space:nowrap}
  .cmd-pill.good{border-color:color-mix(in srgb,var(--good) 35%,var(--line))} .cmd-pill.bad{border-color:color-mix(in srgb,var(--bad) 40%,var(--line))}
  .cmd-pill .g{font-size:11px;font-weight:550;color:var(--muted)}
  .cmd-pill.good .g{color:var(--good)} .cmd-pill.bad .g{color:var(--bad)}
  .cmd-trend{font-size:12px;font-weight:650}
  .cmd-trend.up{color:var(--good)} .cmd-trend.down{color:var(--bad)} .cmd-trend.flat{color:var(--muted)}
  .cmd-spark svg{width:96px;height:34px;display:block}
  .cmd-why{display:flex;flex-direction:column;gap:5px;min-width:0}
  .cmd-r{display:flex;gap:8px;align-items:flex-start;font:inherit;font-size:13px;line-height:1.4;color:var(--ink-2);background:none;border:0;padding:3px 6px;margin:0 -6px;border-radius:8px;text-align:left;cursor:pointer;text-decoration:none}
  .cmd-r:hover{background:var(--surface-2);color:var(--ink)}
  .cmd-r i{width:7px;height:7px;border-radius:99px;margin-top:6px;flex:none;background:var(--muted)}
  .cmd-r.bad i{background:var(--bad)} .cmd-r.warn i{background:var(--warn)} .cmd-r.info i{background:var(--faint,var(--muted))}
  .cmd-r .ext{color:var(--muted);font-size:12px}
  .cmd-ok{font-size:13px;color:var(--good);padding:3px 0}
  .cmd-more{font:inherit;font-size:12.5px;color:var(--brand);background:none;border:0;padding:2px 0;cursor:pointer;align-self:flex-start}
  .cmd-sum{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
  .cmd-paused{font-size:12.5px;color:var(--muted);margin:12px 0 0;padding-top:12px;border-top:1px solid var(--line)}
  .cmd-setup{display:grid;gap:8px}
  .cmd-run{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:10px}
  .cmd-run b{font-size:14px}
  .cmd-run small{grid-column:1;font-size:12.5px;color:var(--muted);line-height:1.45}
  .cmd-run small.bad{color:var(--bad)}
  .cmd-bar{grid-column:1 / -1;height:4px;border-radius:99px;background:var(--surface-2);overflow:hidden}
  .cmd-bar i{display:block;height:100%;background:var(--brand)}
  @media (max-width:1100px){.cmd-row{grid-template-columns:minmax(140px,170px) minmax(0,1fr) 84px}.cmd-why{grid-column:1 / -1}}
  @media (max-width:720px){.cmd-row{grid-template-columns:minmax(0,1fr) 84px}.cmd-pills{grid-column:1 / -1;grid-row:2}.cmd-why{grid-row:3}.cmd-pill{min-width:0;flex:1 1 40%}}`;
  document.head.appendChild(s);
}

/* ---------- helpers ---------- */
function pick(act, tab) {
  H.S.act = act;
  try { localStorage.setItem('pf_act', act); } catch {}
  const cp = document.getElementById('clientPick'); if (cp) cp.value = act;
  H.show(tab || 'overview');
}
const spark = a => {
  const sr = (a.series || []).filter(r => r.sales != null); if (sr.length < 2) return '';
  const mx = Math.max(...sr.map(r => r.sales || 0), 1);
  const pts = sr.map((r, i) => `${(i / (sr.length - 1) * 94 + 1).toFixed(1)},${(31 - (r.sales || 0) / mx * 27).toFixed(1)}`).join(' ');
  const tips = sr.map(r => `<b>${esc(a.name)}</b> · ${U().day(r.date)} · ${U().kmoney(r.sales, a.currency)}`);
  return `<svg viewBox="0 0 96 34" preserveAspectRatio="none" data-spk="${esc(JSON.stringify(tips))}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--brand)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
};
const worst = rs => rs.some(r => r.sev === 'bad') ? 'bad' : rs.some(r => r.sev === 'warn') ? 'warn' : rs.some(r => r.sev === 'info') ? 'info' : 'good';
const score = rs => rs.reduce((s, r) => s + (SEV[r.sev] || 0), 0);

/** Every reason for one brand: the server's, the plan pace, Asana, alerts. */
function reasonsFor(a, c, w) {
  const rs = (c && c.reasons ? c.reasons.slice() : []);
  /* Month to date vs plan (pro-rated by whole days on the server: /api/overview `plan.sales` is planned by now). */
  if (a.plan && a.plan.sales > 0 && a.mtd && a.mtd.sales != null) {
    const off = a.mtd.sales / a.plan.sales - 1;
    if (off <= -0.1) rs.push({ sev: off <= -0.2 ? 'bad' : 'warn', kind: 'plan', text: `Month ${Math.round(-off * 100)}% behind plan (${U().kmoney(a.mtd.sales, a.currency)} of ${U().kmoney(a.plan.sales, a.currency)} planned by now)`, go: 'plan' });
  }
  const as = w && w.brands ? w.brands[a.act_id] : null;
  if (as && !as.error) {
    if (as.overdue_n) { const t = as.overdue[0]; rs.push({ sev: as.overdue_n >= 5 || (t && t.late >= 7) ? 'warn' : 'info', kind: 'asana', text: `${as.overdue_n} Asana task${as.overdue_n === 1 ? '' : 's'} overdue${t ? `: "${t.name}" ${t.late} day${t.late === 1 ? '' : 's'} late${t.who ? ` (${t.who.split(' ')[0]})` : ''}` : ''}`, url: (t && t.url) || as.url }); }
    if (as.stuck_n) { const t = as.stuck[0]; rs.push({ sev: as.stuck_n >= 4 ? 'warn' : 'info', kind: 'asana', text: `${as.stuck_n} task${as.stuck_n === 1 ? '' : 's'} stuck in the same stage 10+ days${t ? `: "${t.name}" in ${t.section} for ${t.idle} days` : ''}`, url: (t && t.url) || as.url }); }
  } else if (as && as.error) rs.push({ sev: 'info', kind: 'asana', text: `Asana could not be read: ${as.error}`, url: as.url });
  for (const al of (w && w.alerts) || []) if (al.act === a.act_id) rs.push({ sev: 'warn', kind: 'alert', text: `Alert fired ${new Date(al.fired).toLocaleString('en-US', { weekday: 'short', hour: 'numeric' })}: ${al.text.replace(/^Tell us when /, '').replace(/\.$/, '')}`, go: 'yesterday' });
  const order = { bad: 0, warn: 1, info: 2 };
  return rs.sort((x, y) => (order[x.sev] ?? 3) - (order[y.sev] ?? 3));
}

function pills(a, c) {
  const u = U(), w = a.window || {}, p = a.prev || {};
  const cur = a.currency;
  const merNow = w.spend ? w.sales / w.spend : null, merPrev = p.spend ? p.sales / p.spend : null;
  const cpaNow = w.orders ? w.spend / w.orders : null, cpaPrev = p.orders ? p.spend / p.orders : null;
  const g = c && c.goal;
  const pill = (label, value, extra = '', tone = '', g2 = '') => `<span class="cmd-pill${tone ? ' ' + tone : ''}"><span class="l">${label}</span><span class="v">${value}${extra}</span>${g2 ? `<span class="g">${g2}</span>` : ''}</span>`;
  const merTone = g && g.kind === 'mer' && merNow != null ? (merNow >= g.target ? 'good' : merNow < g.target * 0.9 ? 'bad' : '') : '';
  const cpaTone = g && g.kind === 'cpa' && cpaNow != null ? (cpaNow <= g.target ? 'good' : cpaNow > g.target * 1.1 ? 'bad' : '') : '';
  return `<div class="cmd-pills">
    ${pill('Revenue', u.kmoney(w.sales, cur), u.chip(w.sales, p.sales, false, 'Against the compare period'))}
    ${pill('Ad spend', u.kmoney(w.spend, cur), u.chip(w.spend, p.spend, 'n', 'Against the compare period'))}
    ${pill('MER', u.x2(merNow), u.chip(merNow, merPrev, false, 'Against the compare period'), merTone, g && g.kind === 'mer' ? `goal ${u.x2(g.target)}` : '')}
    ${pill('CPA', cpaNow == null ? '–' : u.money(cpaNow, cur), u.chip(cpaNow, cpaPrev, true, 'Ad spend per paid order, against the compare period'), cpaTone, g && g.kind === 'cpa' ? `goal ${u.money(g.target, cur)}` : 'no goal CPA')}
  </div>`;
}
function trend(a) {
  const w = a.window || {}, p = a.prev || {};
  if (!p.sales || w.sales == null) return '';
  const d = w.sales / p.sales - 1, tone = Math.abs(d) < 0.03 ? 'flat' : d > 0 ? 'up' : 'down';
  return `<span class="cmd-trend ${tone}"${U().tipAttr(`Revenue ${d >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(d * 100))}% against the compare period`)}>${tone === 'flat' ? '■' : d > 0 ? '▲' : '▼'} ${Math.abs(Math.round(d * 100))}%</span>`;
}
function reasonHtml(r, act) {
  const cls = `cmd-r ${r.sev}`;
  if (r.url) return `<a class="${cls}" href="${esc(r.url)}" target="_blank" rel="noopener"><i></i><span>${esc(r.text)} <span class="ext">Asana ›</span></span></a>`;
  return `<button type="button" class="${cls}" data-cmd="${esc(act)}:${esc(r.go || 'overview')}"><i></i><span>${esc(r.text)}</span></button>`;
}

/* ---------- the screen ---------- */
async function render(host, h, all) {
  H = h; css();
  if (!host) return;
  const t = H.RUN();
  host.innerHTML = `<section class="v2card"><div class="v2h"><h3>Every brand, what needs you first</h3></div><p class="v2hint">Loading the command center…</p></section>`;
  const q = `/api/hub/command?act=all`;
  const [cr, wr] = await Promise.allSettled([cached(q, () => H.api(q)), cached('work', () => H.apiAH('/api/command/work'))]);
  if (t !== H.RUN() || !host.isConnected) return;
  const cmd = cr.status === 'fulfilled' ? cr.value : null, work = wr.status === 'fulfilled' ? wr.value : null;
  const C = Object.fromEntries(((cmd && cmd.brands) || []).map(b => [b.act_id, b]));
  const paused = [], rows = [];
  for (const a of all) {
    const c = C[a.act_id];
    if (c && c.paused) { paused.push(a); continue; }
    const rs = reasonsFor(a, c, work);
    rows.push({ a, c, rs, sev: worst(rs), score: score(rs) });
  }
  rows.sort((x, y) => (y.score - x.score) || ((y.a.window?.sales || 0) - (x.a.window?.sales || 0)));
  const need = rows.filter(r => r.sev === 'bad' || r.sev === 'warn');
  const n = k => rows.filter(r => r.sev === k).length;
  const sub = cmd ? `${need.length ? `${need.length} of ${rows.length} brands need a look today` : `All ${rows.length} brands on track`}. Sorted by what needs attention; every reason opens the page that shows it.` : `The attention signals did not load${cr.reason ? `: ${esc(cr.reason.message)}` : ''}. The numbers below are still the period on the picker.`;
  const rowHtml = r => {
    const { a, rs } = r; const show = rs.slice(0, 4), more = rs.slice(4);
    return `<div class="cmd-row" data-act="${esc(a.act_id)}">
      <div class="cmd-name"><button type="button" class="cmd-bn" data-cmd="${esc(a.act_id)}:overview"><span class="cmd-dot ${r.sev}"${U().tipAttr(r.sev === 'good' ? 'Nothing needs you' : SEV_LABEL[r.sev])}></span>${esc(a.name)}</button>
        <small>${trend(a)}${a.plan && a.plan.sales > 0 && a.mtd ? ` · MTD ${Math.round(a.mtd.sales / a.plan.sales * 100)}% of plan` : ''}</small></div>
      ${pills(a, r.c)}
      <div class="cmd-spark">${spark(a)}</div>
      <div class="cmd-why">${rs.length ? show.map(x => reasonHtml(x, a.act_id)).join('') + (more.length ? `<div class="cmd-extra" hidden>${more.map(x => reasonHtml(x, a.act_id)).join('')}</div><button type="button" class="cmd-more">${more.length} more</button>` : '') : `<span class="cmd-ok">Nothing needs you here.</span>`}</div>
    </div>`;
  };
  const pending = (work && work.pending) || [];
  const agencyAlerts = ((work && work.alerts) || []).filter(x => x.act === 'all');
  const setup = pending.length || agencyAlerts.length ? `<section class="v2card"><div class="v2h"><h3>Setting up</h3><span class="find">${pending.length ? `${pending.length} new client${pending.length === 1 ? '' : 's'} still being set up. Open one to run the next step.` : ''}</span></div>
    <div class="cmd-setup">${pending.map(p => `<div class="cmd-run"><b>${esc(p.name)}</b><button type="button" class="btn" data-run="${esc(p.id)}">Open its setup</button>
      <small${p.failed.length ? ' class="bad"' : ''}>${p.left.length ? `${p.done} of ${p.of} steps done. Next: ${esc(p.left.slice(0, 3).join(', '))}${p.left.length > 3 ? ` and ${p.left.length - 3} more` : ''}.${p.failed.length ? ` Failed: ${esc(p.failed.join(', '))}.` : ''}` : 'Every step done.'} Started ${p.age === 0 ? 'today' : `${p.age} day${p.age === 1 ? '' : 's'} ago`}.</small>
      <span class="cmd-bar"><i style="width:${Math.round(p.done / p.of * 100)}%"></i></span></div>`).join('')}
      ${agencyAlerts.map(al => `<div class="cmd-run"><b>Alert fired</b><button type="button" class="btn" data-go2="yesterday">Open Day check</button><small>${esc(al.text)}</small></div>`).join('')}</div></section>` : '';
  host.innerHTML = `<div class="cmd">
    <section class="v2card cmd-read" id="cmdRead"><div class="v2h"><h3>Focus first</h3><span class="cap">Locus, across every brand</span></div><p class="v2hint">Reading every brand…</p></section>
    <section class="v2card"><div class="v2h"><h3>Every brand, what needs you first</h3><span class="find">${sub}</span></div>
      ${cmd ? `<div class="cmd-sum">${n('bad') ? `<span class="v2pill bad">${n('bad')} act now</span>` : ''}${n('warn') ? `<span class="v2pill warn">${n('warn')} look today</span>` : ''}${n('info') ? `<span class="v2pill">${n('info')} setup only</span>` : ''}${n('good') ? `<span class="v2pill good">${n('good')} on track</span>` : ''}</div>` : ''}
      <div class="cmd-rows">${rows.map(rowHtml).join('')}</div>
      ${paused.length ? `<p class="cmd-paused">Paused, not flagged: ${paused.map(a => `<button type="button" class="cmd-bn" style="font-weight:550;color:var(--muted)" data-cmd="${esc(a.act_id)}:overview">${esc(a.name)}</button>`).join(', ')}.</p>` : ''}
      <p class="v2foot">Numbers on the row: ${esc(H.rangeLabel ? H.rangeLabel() : 'the period on the picker')}, against the compare period; CPA = all ad spend over paid orders. Reasons use fixed windows ending ${esc(cmd && cmd.yesterday ? cmd.yesterday : 'yesterday')}: goal over a rolling 3 days (off = 10% the wrong side), new ads from Meta, fatigue = the last 7 days against the 14 before, Asana tasks live${work && work.brands ? '' : ' (Asana did not load)'}.</p>
    </section>${setup}</div>`;
  wire(host);
  if (cmd) readAll(rows, pending, agencyAlerts);
  else { const el = document.getElementById('cmdRead'); if (el) el.remove(); }
}

function wire(host) {
  host.querySelectorAll('[data-cmd]').forEach(b => b.onclick = () => { const [act, tab] = b.dataset.cmd.split(':'); pick(act, tab); });
  host.querySelectorAll('.cmd-more').forEach(b => b.onclick = () => { const x = b.previousElementSibling; if (x) x.hidden = false; b.remove(); });
  host.querySelectorAll('[data-run]').forEach(b => b.onclick = () => { if (window.NewClient && window.NewClient.status) window.NewClient.status(b.dataset.run, false); });
  host.querySelectorAll('[data-go2]').forEach(b => b.onclick = () => H.show(b.dataset.go2));
}

/* ---------- the read across every brand ---------- */
async function readAll(rows, pending, agencyAlerts) {
  const t = H.RUN();
  const r2 = v => v == null || !isFinite(v) ? null : Math.round(v * 100) / 100;
  const facts = {
    period: H.rangeLabel ? H.rangeLabel() : '',
    brands: rows.map(({ a, c, rs }) => {
      const w = a.window || {}, p = a.prev || {};
      return { name: a.name, currency: a.currency, revenue: Math.round(w.sales || 0), revenue_before: p.sales != null ? Math.round(p.sales) : null, ad_spend: Math.round(w.spend || 0),
        mer: r2(w.spend ? w.sales / w.spend : null), cpa: r2(w.orders ? w.spend / w.orders : null),
        goal: c && c.goal ? { kind: c.goal.kind, target: r2(c.goal.target), last_7_days: r2(c.goal.value7), days_off_goal: c.goal.off_days } : null,
        days_since_new_ad: c && c.cadence ? c.cadence.days_since : null,
        meta_ctr_change: c && c.fatigue && c.fatigue.ctr_change != null ? Math.round(c.fatigue.ctr_change * 100) + '%' : null,
        meta_frequency_change: c && c.fatigue && c.fatigue.freq_change != null ? Math.round(c.fatigue.freq_change * 100) + '%' : null,
        reasons: rs.map(r => `${r.sev}: ${r.text}`) };
    }),
    new_clients_being_set_up: pending.map(p => `${p.name}: ${p.done} of ${p.of} steps`),
    agency_alerts: agencyAlerts.map(a => a.text),
  };
  const key = JSON.stringify(facts);
  let r;
  try {
    r = READS.get(key) || await H.apiAH('/api/read', { method: 'POST', body: JSON.stringify({ screen: 'command', scope: 'all brands', range: facts.period, compare: 'the period before', facts }) });
    if (!r.error) READS.set(key, r);
  } catch (e) { r = { error: e.message }; }
  const el = document.getElementById('cmdRead');
  if (t !== H.RUN() || !el) return;
  if (r.error) { el.innerHTML = `<div class="v2h"><h3>Focus first</h3></div><p class="v2say quiet">The read could not run: ${esc(r.error)}</p>`; return; }
  const byName = Object.fromEntries(rows.map(x => [x.a.name.toLowerCase(), x.a.act_id]));
  const order = (r.order || []).slice(0, 4);
  el.innerHTML = `<div class="v2h"><h3>Focus first</h3>${r.focus ? `<span class="find"><b>${esc(r.focus)}</b></span>` : ''}<span class="cap">Locus, across every brand</span></div>
    ${order.length ? `<ol>${order.map(o => { const act = byName[String(o.brand || '').toLowerCase()];
      return `<li><span class="w">${act ? `<button type="button" class="cmd-bn" data-cmd="${esc(act)}:overview">${esc(o.brand)}</button>` : `<b>${esc(o.brand)}</b>`}: ${esc(o.why)}</span>${o.do ? `<span class="d">${esc(o.do)}</span>` : ''}</li>`; }).join('')}</ol>` : ''}
    ${(r.lines || []).length ? `<p class="lines">${esc(r.lines.join(' '))} <button type="button" class="v2link" data-ask="1">Ask about this ›</button></p>` : ''}`;
  wire(el);
  const ask = el.querySelector('[data-ask]'); if (ask && H.AskUI) ask.onclick = () => H.AskUI.open('About the command center, every brand: ');
}

window.CommandCenter = { render };
})();
