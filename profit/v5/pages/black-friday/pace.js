/* Black Friday > Pace for ONE brand: the agency War Room (pages/a-black-friday/pace.js) cut down to the brand.
   Sales today against today's goal, today by the hour against the plan, the sale so far against its goal,
   store MER so far on the raise / hold / cut range, the last 6 hours, ad spend, and the call as text.
   A client sees the sales and the MER; the call, the range and the Meta limit are for the team.

   Reads only (GET):
     profit          /api/season/war?act=<brand id>&live=1   today by the hour, the plan for today, the phases, the scheduled switches,
                                                             and the sale so far (live.sale_so_far) for a client or a brand not in the check-in
     account-health  /api/standing                           the latest check-in for every brand (team only): MER so far,
                                                             the last 6 hours, the call, budgets and the Meta daily limit
   It never writes. Approving a budget move happens in old Locus (ctx.legacy). */

import { put } from '../../kit.js';
import { h, em, money, num, x, pct, statusDot, button, platformChip, hero, card, legend, lineChart, delta, empty, sheet, skeleton, addStyles } from '../../kit.js';
import { APP_NAME } from '../../config.js';

const CSS = `
.bp-hero{display:grid;grid-template-columns:330px minmax(0,1fr);gap:48px;align-items:end}
.bp-hero-l{display:grid;gap:8px;min-width:0}
.bp-hero-l .lab{font-size:13px;color:var(--muted)}
.bp-hero-l .big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.bp-hero-l .of{font-size:13.5px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.bp-hero-l .sub{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.bp-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.bp-phase{display:grid;grid-template-columns:var(--cols,repeat(4,1fr));gap:4px}
.bp-phase>div{display:grid;gap:8px;min-width:0;align-content:start}
.bp-phase i{display:block;height:6px;border-radius:999px;background:var(--bg-sunk);position:relative}
.bp-phase .done i{background:var(--faint)}
.bp-phase .now i::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,50%);background:var(--ink);border-radius:999px}
.bp-phase .now i::before{content:"";position:absolute;left:var(--v,50%);top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:var(--ink);box-shadow:0 0 0 1.5px #fff;z-index:1}
.bp-phase b,.bp-phase span{line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bp-phase b{font-size:14px;font-weight:500;color:var(--muted)}
.bp-phase .now b{color:var(--ink);font-weight:600}
.bp-phase span{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.bp-call{display:flex;align-items:center;gap:14px 20px;flex-wrap:wrap}
.bp-call .tx{display:grid;gap:4px;min-width:0;flex:1 1 320px}
.bp-call .hd{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.bp-call .hd b{font-size:22px;font-weight:650;letter-spacing:-.025em}
.bp-call .hd b.good{color:var(--good)}.bp-call .hd b.bad{color:var(--bad)}.bp-call .hd b.off{color:var(--muted)}
.bp-call .hd span{font-size:14px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.bp-call p{margin:0;font-size:13.5px;line-height:1.5;color:var(--muted);max-width:92ch}
.bp-call .btns{display:flex;gap:10px;flex-wrap:wrap}
.bp-chart{padding:28px 32px 20px}
.bp-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--sp-5)}
.bp-three .lx-card{display:grid;gap:8px;align-content:start;min-width:0}
.bp .lab{font-size:12.5px;color:var(--muted)}
.bp .mid{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:30px;font-weight:600;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums}
.bp .mid small{font-size:12.5px;font-weight:400;letter-spacing:0;color:var(--muted)}
.bp .mid.bad{color:var(--bad)}.bp .mid.off{color:var(--muted);font-size:17px;letter-spacing:-.015em}
.bp .sub{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.bp-zg{display:grid;gap:3px;margin-top:6px}
.bp-zg.dim{opacity:.55}
.bp-zt{position:relative;height:10px}
.bp-zt .z{position:absolute;top:0;bottom:0;left:var(--a);width:calc(var(--b) - var(--a));box-shadow:inset -1px 0 0 #fff}
.bp-zt .z:first-child{border-radius:999px 0 0 999px}
.bp-zt .z.last{border-radius:0 999px 999px 0;box-shadow:none}
.bp-zt .z.bad{background:#F8D5DE}.bp-zt .z.hold{background:#E6E4DF}.bp-zt .z.good{background:#CDEBDD}.bp-zt .z.good2{background:#A6DCC3}
.bp-zt .z.on.bad{background:var(--bad)}.bp-zt .z.on.hold{background:#8E8880}.bp-zt .z.on.good,.bp-zt .z.on.good2{background:var(--good)}
.bp-zt .mark{position:absolute;left:var(--v);top:-5px;bottom:-5px;width:3px;margin-left:-1.5px;border-radius:2px;background:var(--ink);box-shadow:0 0 0 2px #fff,0 2px 6px rgba(22,19,15,.3)}
.bp-zt .ring{position:absolute;left:var(--v);top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 2px var(--ink-2)}
.bp-zn{position:relative;height:14px;font-size:11.5px;line-height:14px;color:var(--faint)}
.bp-zn span{position:absolute;left:var(--a);width:calc(var(--b) - var(--a));text-align:center;white-space:nowrap}
.bp-zn span.on{color:var(--ink);font-weight:600}
.bp-key{display:inline-flex;align-items:center;gap:14px;font-size:12px;color:var(--muted)}
.bp-key span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.bp-key .k1::before{content:"";width:3px;height:12px;border-radius:2px;background:var(--ink)}
.bp-key .k2::before{content:"";width:10px;height:10px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--ink-2)}
.bp-sw>div{display:grid;grid-template-columns:200px minmax(0,1fr) 130px;gap:14px;align-items:center;min-height:48px;padding:0 28px;border-top:1px solid var(--line);font-size:13.5px}
.bp-sw .when{font-weight:650;font-variant-numeric:tabular-nums}
.bp-sw .what{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bp-sw .st{justify-self:end}
.bp-lines{display:grid}
.bp-lines>div{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:12px 0;border-top:1px solid var(--line);font-size:14px}
.bp-lines>div:first-child{border-top:0}
.bp-lines small{font-size:13px;color:var(--muted)}
.bp-lines b{font-weight:600;font-variant-numeric:tabular-nums;text-align:right}
.bp-lines .on small{color:var(--ink);font-weight:600}
@media (max-width:1040px){.bp-hero{grid-template-columns:1fr;gap:24px}.bp-three{grid-template-columns:1fr 1fr}.bp-three>:first-child{grid-column:1/-1}}
@media (max-width:759px){
  .bp-phase{grid-template-columns:1fr 1fr;gap:16px 10px}
  .bp-call .btns{width:100%}.bp-call .btns .lx-btn{flex:1 1 100%;height:46px;justify-content:center}
  .bp-chart{padding:18px 14px 12px}
  .bp-three{grid-template-columns:1fr}
  .bp .mid{font-size:28px}
  .bp-sw>div{grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;padding:12px 18px;min-height:0}
  .bp-sw .when{grid-column:1/-1}
  .bp-sw .what{white-space:normal}
}`;

/* ---------- small helpers ---------- */
const ok = n => n != null && isFinite(n);
const hourLabel = hr => { const k = ((hr % 24) + 24) % 24; return k === 0 ? '12am' : k < 12 ? k + 'am' : k === 12 ? '12pm' : (k - 12) + 'pm'; };
const CALL_WORD = { scale: 'Raise 50%', raise: 'Raise 25%', hold: 'Hold', cut: 'Cut 25%' };
const dayShort = ymd => ymd ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const md = ymd => dayShort(ymd).replace(/^\w+, /, '');
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

/* The brand's own season phases (the ones with an offer written), states from today's date. */
function phasesFor(list, today) {
  let lit = false;
  return (list || []).filter(p => p.start && p.end && p.status !== 'missing' && p.status !== 'skip' && ['nov', 'bf', 'dec'].includes(p.grp || 'bf')).slice(0, 5).map(p => {
    const range = p.start === p.end ? md(p.start) : `${md(p.start)} to ${md(p.end)}`;
    if (today > p.end) return { name: p.name, state: 'done', sub: range + ', done' };
    if (today >= p.start && !lit) {
      lit = true;
      const n = daysBetween(p.start, p.end) + 1, d = daysBetween(p.start, today) + 1;
      return { name: p.name, state: 'now', progress: Math.min(1, (d - 0.5) / n), sub: `Day ${d} of ${n}, ${dayShort(today)}` };
    }
    return { name: p.name, state: '', sub: range };
  });
}

/* ---------- load: two read routes folded into one plain shape (the fixture has the same shape) ---------- */
async function load(ctx) {
  if (!ctx.brand) return { no_brand: true };
  const id = ctx.brand.id, sig = ctx.signal, team = !ctx.isClient;
  const [warR, stR] = await Promise.allSettled([
    ctx.api('/api/season/war?act=' + encodeURIComponent(id) + '&live=1', { signal: sig }),
    team ? ctx.api('/api/standing', { worker: 'ah', signal: sig }) : Promise.resolve(null),
  ]);
  for (const r of [warR, stR]) if (r.status === 'rejected' && r.reason && (r.reason.name === 'AbortError' || r.reason.status === 401)) throw r.reason;
  const war = warR.status === 'fulfilled' ? warR.value : null;
  const S = stR.status === 'fulfilled' && stR.value ? stR.value.standing : null;
  if (!war && !S) throw warR.reason || new Error('The plan did not answer');
  const b = S ? (S.brands || []).find(v => v.act_id === id) || null : null;
  const sale = (b && b.sale) || (war && war.sale) || null;
  const now = Date.now(), today = (war && war.today) || (S && S.today) || new Date().toISOString().slice(0, 10);
  if (!sale || !sale.start) return { fetched_at: now, none: true, today };

  const L = war && war.live && !war.live.error ? war.live : null, lT = (L && L.today) || {};
  const noSales = !!(b && b.no_sales) || !!(lT.no_sales);
  const g = (b && b.suggest) || {}, m = (b && b.meta) || {}, camp = m.camp || null, ap = S && S.approved ? S.approved[id] : null;
  const so = (b && b.so_far) || {}, l6 = (b && b.last6) || {};
  /* The sale so far. The check-in (team only) has it per brand; the season read carries the same total at
     live.sale_so_far { days, sales, spend, orders }, which a client and a brand outside the check-in can read. */
  const wsf = (L && L.sale_so_far) || {};
  const soSales = so.sales ?? (ok(wsf.sales) ? wsf.sales : null);
  const soMer = so.mer ?? (ok(wsf.sales) && wsf.spend > 0 ? wsf.sales / wsf.spend : null);
  const lad = (war && war.ladder) || {};
  const kpi = (b && b.kpi) || lad.target || null, hold = kpi ? ((b && b.hold) ?? lad.be ?? kpi * 0.8) : null;

  /* today by the hour: cumulative sales, a zero first so the line starts on the axis */
  let hours = null, cmp = null;
  if (L && Array.isArray(L.hours) && !noSales) {
    let last = -1;
    L.hours.forEach((hr, k) => { if ((hr.sales || 0) > 0 || (hr.spend || 0) > 0) last = k; });
    if (last >= 0) hours = [0, ...L.hours.slice(0, last + 1).map(hr => Math.round(hr.cum_sales || 0))];
    if (Array.isArray(L.plan_curve)) cmp = [0, ...L.plan_curve.map(v => Math.round(v || 0))];
  }
  const pace = L && L.day ? L.day.pace : null;

  /* the call, as text (team only; the same words as the War Room) */
  const early = /^Too early/i.test(g.why || '');
  let call = null;
  if (team) {
    const from = camp && camp.daily;
    const stays = m.error ? 'Meta did not answer' : !camp ? (b ? 'No sale campaign in Meta' : '') : from ? `Stays ${money(from)} a day` : 'Ad set budgets, no campaign budget';
    if (!b) call = { kind: 'hold', text: 'No check-in yet', sub: '', why: S ? 'This brand is not in the check-in yet.' : 'The first check-in runs at 9am Central.' };
    else if (b.watch) call = { kind: 'watch', text: 'Watch only', sub: `No budget move from ${APP_NAME}`, why: g.why || '' };
    else if (ap) call = { kind: g.call || 'hold', text: CALL_WORD[g.call] || 'Hold', sub: `Done, now ${money(ap.to)} a day`, why: `Approved by ${ap.by || 'the team'}.` };
    else if (g.to) call = { kind: g.call, text: CALL_WORD[g.call] || 'Hold', sub: `${money(from)} to ${money(g.to)} a day`, why: [g.why, g.note].filter(Boolean).join(' '), needs_yes: true };
    else call = { kind: g.call || 'hold', text: CALL_WORD[g.call] || 'Hold', sub: stays, why: [g.why, g.note].filter(Boolean).join(' ') };
  }
  const used = m.limit && ok(m.on) ? m.on / m.limit : null, near = used != null && used > 0.7;
  let status;
  if (noSales) status = { tone: 'warn', text: 'No sales source connected' };
  else if (!team) status = ok(pace) ? { tone: pace >= 0.9 ? 'good' : 'warn', text: pace >= 0.9 ? 'On plan' : 'Behind plan' } : { tone: 'off', text: today < sale.start ? 'Not started' : 'Today only' };
  else if (b && b.watch) status = { tone: 'off', text: 'Watch only' };
  else if (call && call.needs_yes) status = { tone: 'info', text: 'Needs your yes' };
  else if (ap) status = { tone: 'good', text: 'Approved' };
  else if (early) status = { tone: 'off', text: 'Too early' };
  else if (ok(so.mer) && hold && so.mer < hold) status = { tone: 'bad', text: 'Under break-even' };
  else if (near) status = { tone: 'warn', text: 'Near Meta limit' };
  else if (!b) status = { tone: 'off', text: 'Today only' };
  else status = { tone: 'good', text: 'On plan' };

  const revGoal = ((war && war.goals_list) || []).find(v => v.metric === 'revenue');
  /* today is the live read; the check-in's own "today" is only used when it was taken today */
  const bT = b && b.today && S.today === today ? b.today : {};
  const tSales = noSales ? null : (lT.sales ?? bT.sales ?? null);
  const tSpend = lT.spend ?? bT.spend ?? null;
  const started = today >= sale.start;
  const switches = ((war && war.scheduled) || []).map(v => ({ at: Date.parse(v.at), what: v.what || '' })).filter(v => v.at && v.at > now).sort((p, q) => p.at - q.at).slice(0, 10)
    .map(v => ({ when: new Date(v.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' }), what: v.what, status: { tone: '', text: 'Scheduled' } }));

  return {
    fetched_at: now, today, currency: (war && war.currency) || (b && b.currency) || 'USD', client_view: !team,
    checked: S ? S.label : null, next: S ? S.next : null, dry: !!(S && S.dry), cmp_label: L && L.in_sale === false ? 'A normal day' : 'Plan for today',
    status, call, no_sales: noSales,
    sale: { start: sale.start, end: sale.end, day: started ? Math.min(daysBetween(sale.start, today), daysBetween(sale.start, sale.end)) + 1 : null, days: daysBetween(sale.start, sale.end) + 1,
      sales: noSales ? null : soSales, goal: (b && b.goal) || (revGoal && revGoal.target) || null, from: so.from || null },
    day: { sales: tSales, goal: L && L.day ? L.day.goal : null, orders: lT.orders ?? null, aov: lT.aov ?? null, vs: ok(pace) ? { pct: pace - 1, label: L && L.in_sale === false ? 'vs a normal day by now' : 'vs plan by now' } : null },
    hours, cmp,
    mer: { so_far: noSales ? null : soMer, today: noSales ? null : (lT.mer ?? bT.mer ?? null), last6: !noSales && l6.spend >= 50 ? l6.mer ?? null : null, last6_hours: l6.hours || 6,
      kpi, hold, new: so.new_mer ?? null, be_new: (b && b.be_new) || null, early, watch: !!(b && b.watch), placed: !!b },
    spend: { today: tSpend, budget: ok(m.on) && m.on > 0 ? m.on : null, limit_used: used, near },
    phases: phasesFor(war && war.phases, today), switches,
    foot: team ? `Sales and MER are Triple Whale: store sales over all ad spend, counted from the day this brand's sale started. Budgets and the Meta daily limit are read from Meta at the last check-in. Today by the hour is against the plan for today. Nothing on this page changes Meta.`
      : 'Sales are your store\'s sales today, less tax. MER is store sales over all ad spend. Today by the hour is against the plan for today.',
  };
}

/* ---------- parts ---------- */
function phaseStrip(phases) {
  if (!phases || !phases.length) return null;
  return h('div', { class: 'bp-phase', style: { '--cols': `repeat(${phases.length},minmax(0,1fr))` }, role: 'img', 'aria-label': phases.map(p => `${p.name}: ${p.sub}`).join('. ') },
    phases.map(p => h('div', { class: p.state || '', style: p.state === 'now' ? { '--v': Math.round((p.progress ?? 0.5) * 100) + '%' } : null }, h('i'), h('b', null, p.name), h('span', null, p.sub))));
}
const fillBar = (value, max, aria) => h('div', { class: 'lx-gauge thin', role: 'img', 'aria-label': aria },
  h('div', { class: 'lx-gauge-track' }, ok(max) && max > 0 && ok(value) ? h('i', { class: 'fill', style: { '--v': Math.min(100, 100 * value / max).toFixed(1) + '%' } }) : null));

/** Where a MER sits on the range: four equal zones, cut / hold / raise 25% / raise 50%. */
function ladderPos(v, m) {
  const a = m.hold, b = m.kpi, c = m.kpi * 1.5, top = m.kpi * 2.25;
  const p = v < a ? 25 * v / a : v < b ? 25 + 25 * (v - a) / (b - a) : v < c ? 50 + 25 * (v - b) / (c - b) : 75 + 25 * (v - c) / (top - c);
  return Math.max(1.5, Math.min(98.5, p));
}
const zoneOf = m => !(ok(m.so_far) && ok(m.kpi) && ok(m.hold) && !m.watch) ? -1 : m.so_far < m.hold ? 0 : m.so_far < m.kpi ? 1 : m.so_far < m.kpi * 1.5 ? 2 : 3;
function ladder(m) {
  const zone = zoneOf(m), placed = zone >= 0;
  const Z = [['bad', 'Cut'], ['hold', 'Hold'], ['good', '+25%'], ['good2', '+50%']];
  const span = i => ({ '--a': i * 25 + '%', '--b': (i + 1) * 25 + '%' });
  const aria = !placed ? 'Not placed on the range' : `Store MER so far ${x(m.so_far)}. Under ${x(m.hold)} is a cut, ${x(m.kpi)} is a 25% raise, ${x(m.kpi * 1.5)} is a 50% raise.` + (ok(m.last6) ? ` Last ${m.last6_hours} hours ${x(m.last6)}.` : '');
  return h('div', { class: 'bp-zg' + (placed ? '' : ' dim'), role: 'img', 'aria-label': aria, title: aria },
    h('div', { class: 'bp-zt' },
      Z.map(([cls], i) => h('i', { class: `z ${cls}${i === 3 ? ' last' : ''}${i === zone ? ' on' : ''}`, style: span(i) })),
      placed && ok(m.last6) ? h('span', { class: 'ring', style: { '--v': ladderPos(m.last6, m) + '%' } }) : null,
      placed ? h('span', { class: 'mark', style: { '--v': ladderPos(m.so_far, m) + '%' } }) : null),
    h('div', { class: 'bp-zn' }, Z.map(([, label], i) => h('span', { class: i === zone ? 'on' : '', style: span(i) }, label))));
}

/* the sheet: the lines the call is read against, in plain words */
function openRange(d) {
  const m = d.mer || {}, zone = zoneOf(m), has = ok(m.kpi) && ok(m.hold);
  const line = (i, label, value) => h('div', { class: i === zone ? 'on' : '' }, h('small', null, label), h('b', null, value));
  sheet({ title: 'How the call is made', body: h('div', { style: { display: 'grid', gap: '16px' } },
    h('p', { class: 'lx-foot', style: { margin: 0 } }, 'The call reads store MER since the sale started: store sales over all ad spend, from Triple Whale. The range has four parts.'),
    has ? h('div', { class: 'bp-lines' },
      line(0, 'Cut 25%', 'under ' + x(m.hold)),
      line(1, 'Hold', `${x(m.hold)} to ${x(m.kpi)}`),
      line(2, 'Raise 25%', `${x(m.kpi)} to ${x(m.kpi * 1.5)}`),
      line(3, 'Raise 50%', `${x(m.kpi * 1.5)} and over`),
      ok(m.so_far) ? h('div', null, h('small', null, 'Store MER so far'), h('b', null, x(m.so_far))) : null,
      ok(m.last6) ? h('div', null, h('small', null, `Last ${m.last6_hours || 6} hours`), h('b', null, x(m.last6))) : null,
      ok(m.new) ? h('div', null, h('small', null, 'New customers only'), h('b', null, x(m.new) + (ok(m.be_new) ? `, break-even ${x(m.be_new)}` : ''))) : null)
      : h('p', { class: 'lx-foot', style: { margin: 0 } }, 'No MER goal is set for this brand\'s sale, so there is no range to read against.'),
    h('p', { class: 'lx-foot', style: { margin: 0 } }, `A raise is held back when store MER is under the hold line or the campaign is not spending its budget. A budget move is never made by itself: someone approves it in old ${APP_NAME}.`)) });
}

function callCard(d, ctx) {
  const c = d.call;
  if (!c) return null;
  const tone = c.kind === 'raise' || c.kind === 'scale' ? 'good' : c.kind === 'cut' ? 'bad' : c.kind === 'watch' ? 'off' : '';
  return h('section', { class: 'lx-card bp-call', 'aria-label': 'The call' },
    h('div', { class: 'tx' },
      h('div', { class: 'hd' }, h('span', { class: 'lab' }, 'The call'), h('b', { class: tone }, c.text), c.sub ? h('span', null, c.sub) : null),
      c.why ? h('p', null, c.why) : null),
    h('div', { class: 'btns' },
      c.needs_yes ? button(`Approve in old ${APP_NAME}`, { primary: true, large: true, href: ctx.legacy || '../', icon: 'arrow' }) : null,
      button('How the call is made', { onclick: () => openRange(d) })));
}

/** Today by the hour against the comparison (dashed). 25 points across: 12am to 12am. */
function chartCard(d) {
  const td = d.hours || [], cmp = d.cmp || [], cur = d.currency, t = d.day || {}, cmpLabel = d.cmp_label || 'Plan for today';
  const head = (extra) => h('div', { class: 'lx-chart-h' },
    h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Is today on pace?')), h('p', null, 'store sales so far today, hour by hour')), extra);
  if (d.no_sales) return h('section', { class: 'lx-card bp-chart' }, head(), h('p', { class: 'lab' }, 'No sales source connected, so there is no hourly line.'));
  if (td.length < 2) return h('section', { class: 'lx-card bp-chart' }, head(), h('p', { class: 'lab' }, 'No sales by the hour yet today.'));
  const now = td.length - 1, b = v => h('b', null, v);
  return h('section', { class: 'lx-card bp-chart' },
    head(legend([{ name: 'Today', lead: true }, cmp.length > 1 ? { name: cmpLabel, dashed: true } : null])),
    lineChart({
      series: [{ name: 'Today', lead: true, values: Array.from({ length: 25 }, (_, i) => td[i] ?? null), end: v => money(v, { cur }) },
        cmp.length > 1 && { name: cmpLabel, dashed: true, values: cmp, end: v => money(v, { cur }) }],
      labels: Array.from({ length: 25 }, (_, i) => hourLabel(i)), ticks: [0, 3, 6, 9, 12, 15, 18, 21, 24], now,
      format: v => money(v, { cur, compact: true }), height: 340, phoneHeight: 270, empty: 'No sales yet today',
      label: `Sales by hour today${cmp.length > 1 ? ' against ' + cmpLabel.toLowerCase() : ''}. ${ok(t.sales) ? money(Math.round(t.sales), { cur }) + ' so far.' : ''}`,
      hover: i => [b(hourLabel(i)), ok(td[i]) ? h('span', null, 'Today ', b(money(td[i], { cur }))) : null, ok(cmp[i]) ? h('span', null, cmpLabel + ' ', b(money(cmp[i], { cur }))) : null],
    }));
}

function threeCards(d) {
  const m = d.mer || {}, sp = d.spend || {}, s = d.sale || {}, cur = d.currency, team = !d.client_view;
  const merNow = ok(m.so_far) ? m.so_far : m.today, merLabel = ok(m.so_far) ? 'Store MER so far' : 'Store MER today';
  const merCls = !ok(merNow) ? ' off' : ok(m.hold) && !m.watch && merNow < m.hold ? ' bad' : '';
  const merText = ok(merNow) ? x(merNow) : d.no_sales ? 'No sales source connected' : m.early ? 'Too early' : 'No read yet';
  const merCard = card({},
    h('span', { class: 'lab' }, merLabel),
    h('div', { class: 'mid' + merCls }, merText, ok(merNow) ? h('small', null, m.watch ? 'watch only' : ok(m.kpi) ? `goal ${x(m.kpi)}` : 'no goal set') : null),
    team && m.placed ? ladder(m) : null,
    team && m.placed ? h('span', { class: 'bp-key' }, h('span', { class: 'k1' }, 'MER so far'), ok(m.last6) ? h('span', { class: 'k2' }, `Last ${m.last6_hours || 6} hours ${x(m.last6)}`) : null) : null,
    team && ok(m.new) ? h('span', { class: 'sub' }, `New customers ${x(m.new)}${ok(m.be_new) ? ', break-even ' + x(m.be_new) : ''}`) : null);
  const saleCard = card({},
    h('span', { class: 'lab' }, 'The sale so far'),
    h('div', { class: 'mid' + (ok(s.sales) ? '' : ' off') }, ok(s.sales) ? money(Math.round(s.sales), { cur }) : d.no_sales ? 'No sales source connected' : s.day ? 'No read yet' : 'Not started', ok(s.sales) ? h('small', null, ok(s.goal) ? 'of ' + money(s.goal, { cur }) : 'no goal set') : null),
    fillBar(s.sales, s.goal, ok(s.goal) && ok(s.sales) ? Math.round(100 * s.sales / s.goal) + '% of the sale goal' : 'No goal set'),
    h('span', { class: 'sub' }, s.day ? `Day ${s.day} of ${s.days}, ${md(s.start)} to ${md(s.end)}` : `${md(s.start)} to ${md(s.end)}`, ok(s.sales) && ok(s.goal) && s.goal > 0 ? ', ' + pct(s.sales / s.goal) + ' of the goal' : ''));
  const spendCard = card({},
    h('span', { class: 'lab' }, 'Ad spend today'),
    h('div', { class: 'mid' + (ok(sp.today) ? '' : ' off') }, ok(sp.today) ? money(Math.round(sp.today), { cur }) : 'No read yet', ok(sp.today) && team ? h('small', null, ok(sp.budget) ? 'of ' + money(Math.round(sp.budget), { cur }) + ' in budgets' : 'no budget read') : null),
    team ? fillBar(sp.today, sp.budget, ok(sp.budget) && ok(sp.today) ? Math.round(100 * sp.today / sp.budget) + "% of today's budget" : 'No budget read') : null,
    team ? h('span', { class: 'sub' }, !ok(sp.limit_used) ? 'Meta daily limit not tracked' : sp.near ? statusDot('warn', `Meta daily limit ${pct(sp.limit_used)} used`) : `Meta daily limit ${pct(sp.limit_used)} used`) : h('span', { class: 'sub' }, 'all platforms'));
  return h('div', { class: 'bp-three' }, merCard, saleCard, spendCard);
}

/* ---------- render ---------- */
function render(el, d, ctx) {
  addStyles('bp-css', CSS);
  if (!ctx.brand || !d || d.no_brand) return put(el, empty({ title: 'Pick a brand', text: 'Pace is one brand at a time. Every brand at once is under the agency view.' }));
  if (d.none) return put(el, empty({ title: 'No Black Friday sale set for this brand', text: ctx.isClient ? 'When the sale dates and the goal are set, today\'s pace shows here.' : 'Pace fills in once this brand has sale dates in its Black Friday plan.',
    action: button('Open the plan', { href: ctx.href('black-friday', 'plan'), icon: 'arrow' }) }));
  /* sample numbers seen as a client: no call, no range, no budgets */
  if (ctx.isClient && !d.client_view) d = { ...d, client_view: true, call: null, status: d.status && /yes|limit|early|Watch/i.test(d.status.text) ? { tone: 'good', text: 'On plan' } : d.status };
  const t = d.day || {}, cur = d.currency, team = !d.client_view;

  const top = hero({
    sub: team ? h('span', { class: 'bp-meta' }, platformChip('meta'), ' sales ads' + (d.dry ? ', dry run on today' : '')) : null,
    action: team ? h('div', { class: 'bp-meta' },
      h('span', null, d.checked ? `Checked ${d.checked}${d.next ? ', next ' + d.next : ''}` : 'No check-in yet'),
      button(`Check now in old ${APP_NAME}`, { href: ctx.legacy || '../' })) : null,
  },
  h('div', { class: 'bp-hero' },
    h('div', { class: 'bp-hero-l' },
      h('span', { class: 'lab' }, 'Sales today'),
      d.no_sales ? h('div', { class: 'big' }, h('span', { class: 'of' }, 'No sales source connected'))
        : h('div', { class: 'big' }, h('span', { class: 'lx-hero-num' }, ok(t.sales) ? money(Math.round(t.sales), { cur }) : 'no data'), h('span', { class: 'of' }, ok(t.goal) ? 'of ' + money(Math.round(t.goal), { cur }) : 'no goal for today')),
      !d.no_sales ? fillBar(t.sales, t.goal, ok(t.goal) && ok(t.sales) ? Math.round(100 * t.sales / t.goal) + "% of today's goal" : 'No goal set') : null,
      h('span', { class: 'sub' }, d.status ? statusDot(d.status.tone, d.status.text) : null, t.vs && ok(t.vs.pct) ? [delta(t.vs.pct), t.vs.label] : null),
      ok(t.orders) ? h('span', { class: 'sub' }, `${num(t.orders)} orders${ok(t.aov) ? ', ' + money(Math.round(t.aov), { cur }) + ' each' : ''}`) : null),
    phaseStrip(d.phases)));
  top.classList.add('line');

  const sw = d.switches && d.switches.length && team
    ? card({ title: 'Ads that switch on by themselves', note: platformChip('meta'), flush: true },
      h('div', { class: 'bp-sw' }, d.switches.map(r => h('div', null, h('span', { class: 'when' }, r.when), h('span', { class: 'what' }, r.what), h('span', { class: 'st' }, statusDot(r.status.tone, r.status.text))))))
    : null;

  put(el, h('div', { class: 'bp', style: { display: 'grid', gap: 'var(--sp-6)', minWidth: 0 } }, [top, callCard(d, ctx), chartCard(d), threeCards(d), sw, h('p', { class: 'lx-foot' }, d.foot || '')].filter(Boolean)));
}

export default {
  /* the page is about today, so there are no dates to pick */
  title: ctx => (ctx.isClient ? ['Is the sale on pace ', em('today?')] : ['Does this brand need a call ', em('right now?')]),
  eyebrow: 'Black Friday',
  ranges: false,
  asOf: d => (d && d.fetched_at) || null,
  load,
  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 2)), skeleton('chart', 1), skeleton('row', 3)); },
  render,
};
