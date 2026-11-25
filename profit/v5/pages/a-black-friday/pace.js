/* Agency > Black Friday > Pace: the War Room, read only.
   Weekend sales against goal, then one wide row per brand: sales today, today by the hour, store MER so far
   on the raise / hold / cut range, the last 6 hours, ad spend, and the call as text.
   Reads only:
     account-health  GET /api/standing                    the latest check-in (Triple Whale + Meta)
     profit          GET /api/season/war?act=all          today's orders and the scheduled switches
     profit          GET /api/season/war?act=<id>&live=1  today by the hour and the plan for today
   It never writes. Approving a budget move happens in old Locus (ctx.legacy). */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, money, num, x, pct, statusDot, button, platformChip, hero, em, card, legend, lineChart, segmented, delta, empty, addStyles } from '../../kit.js';

/* ---------- local styles (kit gaps: the zone gauge, the phase strip, the brand row, the switch list) ---------- */
const CSS = `
.wr-hero-grid{display:grid;grid-template-columns:330px minmax(0,1fr);gap:48px;align-items:end}
.wr-hero-l{display:grid;gap:8px;min-width:0}
.wr-hero-l .lab{font-size:13px;color:var(--muted)}
.wr-hero-l .big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.wr-hero-l .of{font-size:13.5px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.wr-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr-sub{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.wr-phase{display:grid;grid-template-columns:var(--cols,repeat(4,1fr));gap:4px}
.wr-phase>div{display:grid;gap:8px;min-width:0;align-content:start}
.wr-phase i{display:block;height:6px;border-radius:999px;background:var(--bg-sunk);position:relative}
.wr-phase .done i{background:var(--faint)}
.wr-phase .now i::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,50%);background:var(--ink);border-radius:999px}
.wr-phase .now i::before{content:"";position:absolute;left:var(--v,50%);top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:var(--ink);box-shadow:0 0 0 1.5px #fff;z-index:1}
.wr-phase b,.wr-phase span{line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wr-phase b{font-size:14px;font-weight:500;color:var(--muted)}
.wr-phase .now b{color:var(--ink);font-weight:600}
.wr-phase span{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr-list{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;min-width:0}
.wr-list>.lx-sec{padding:0 28px 8px;flex-wrap:wrap;row-gap:10px;min-width:0}
.wr-list>.lx-sec>*{min-width:0}
.wr-list>.lx-sec>.note{min-width:max-content;max-width:100%}
.wr-list>.lx-sec .act{gap:10px 22px;flex-wrap:wrap;min-width:0;max-width:100%}
.wr-list>.lx-sec .act>*{min-width:0;max-width:100%}
.wr-list>.lx-sec .act>.lx-legend,.wr-list>.lx-sec .act>.wr-key{flex-wrap:wrap;row-gap:4px}
.wr-list>.lx-sec .act>.lx-legend span{white-space:normal}
.wr-list>.lx-sec .act>.lx-seg{overflow-x:auto}
.wr .big,.wr .mid{flex-wrap:wrap;row-gap:2px;min-width:0}
.wr{padding:22px 28px 24px;border-top:1px solid var(--line);min-width:0}
.wr.first{border-top:0}
.wr.yes{border-top:0;border-radius:24px;background:#fff;box-shadow:var(--sh-2);margin-bottom:10px}
.wr.yes+.wr{border-top:0}
.wr-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;min-height:36px}
.wr-h .nm{font-size:19px;font-weight:600;letter-spacing:-.025em;white-space:nowrap}
.wr-h .sp{flex:1}
.wr-call{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;min-width:0;max-width:100%;white-space:nowrap}
.wr-call>*{min-width:0;max-width:100%}
.wr-call b{font-size:14px;font-weight:650;letter-spacing:-.015em}
.wr.yes .wr-call b{font-size:17px}
.wr-call b.good{color:var(--good)}.wr-call b.bad{color:var(--bad)}.wr-call b.off{color:var(--muted)}
.wr-call span{font-size:13.5px;color:var(--ink-2);font-variant-numeric:tabular-nums}
.wr-call em{font-style:normal;font-size:12.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis}
.wr-why{margin-top:6px;font-size:13px;line-height:1.5;color:var(--muted);max-width:92ch}
.wr-b{display:grid;grid-template-columns:200px minmax(0,1fr) 300px;gap:40px;align-items:start;margin-top:12px}
.wr-b>*{min-width:0}
.wr-b .lx-chart,.wr-b svg{max-width:100%}
.wr .lab{font-size:12.5px;color:var(--muted);white-space:nowrap}
.wr .c{display:grid;gap:7px;min-width:0;align-content:start}
.wr .big{display:flex;align-items:baseline;gap:7px;white-space:nowrap;font-size:32px;font-weight:600;letter-spacing:-.04em;line-height:1.08;font-variant-numeric:tabular-nums}
.wr .mid{display:flex;align-items:baseline;gap:8px;font-size:24px;font-weight:600;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.wr .sm{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 6px;font-size:18px;font-weight:600;letter-spacing:-.025em;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap}
.wr .big small,.wr .mid small,.wr .sm small{font-size:12.5px;font-weight:400;letter-spacing:0;color:var(--muted)}
.wr .mid.bad{color:var(--bad)}.wr .mid.off,.wr .sm.off,.wr .big.off{color:var(--muted)}
.wr .big.off{font-size:17px;letter-spacing:-.015em;white-space:normal;line-height:1.3}
.wr .sub{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;min-height:18px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.wr .lx-gauge{margin-top:4px}
.wr .lx-plot .s1{stroke-width:2.4}
.wr .lx-plot .tk.now{fill:var(--ink);font-weight:600}
.wr-nochart{display:grid;place-items:center;min-height:150px;border-radius:16px;background:var(--surface-2,#FAF9F7);color:var(--muted);font-size:13px;text-align:center;padding:16px}
.wr-zg{display:grid;gap:3px;margin-top:4px}
.wr-zg.dim{opacity:.55}
.wr-zt{position:relative;height:10px}
.wr-zt .z{position:absolute;top:0;bottom:0;left:var(--a);width:calc(var(--b) - var(--a));box-shadow:inset -1px 0 0 #fff}
.wr-zt .z:first-child{border-radius:999px 0 0 999px}
.wr-zt .z.last{border-radius:0 999px 999px 0;box-shadow:none}
.wr-zt .z.bad{background:#F8D5DE}.wr-zt .z.hold{background:#E6E4DF}.wr-zt .z.good{background:#CDEBDD}.wr-zt .z.good2{background:#A6DCC3}
.wr-zt .z.on.bad{background:var(--bad)}.wr-zt .z.on.hold{background:#8E8880}.wr-zt .z.on.good,.wr-zt .z.on.good2{background:var(--good)}
.wr-zt .mark{position:absolute;left:var(--v);top:-5px;bottom:-5px;width:3px;margin-left:-1.5px;border-radius:2px;background:var(--ink);box-shadow:0 0 0 2px #fff,0 2px 6px rgba(22,19,15,.3)}
.wr-zt .ring{position:absolute;left:var(--v);top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;background:#fff;box-shadow:inset 0 0 0 2px var(--ink-2)}
.wr-zn{position:relative;height:14px;font-size:11.5px;line-height:14px;color:var(--faint)}
.wr-zn span{position:absolute;left:var(--a);width:calc(var(--b) - var(--a));text-align:center;white-space:nowrap}
.wr-zn span.on{color:var(--ink);font-weight:600}
.wr-pair{display:grid;grid-template-columns:96px minmax(0,1fr);gap:24px;margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.wr-pair .c{gap:4px}
.wr-key{display:inline-flex;align-items:center;gap:14px;font-size:12px;color:var(--muted)}
.wr-key span{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.wr-key .k1::before{content:"";width:3px;height:12px;border-radius:2px;background:var(--ink)}
.wr-key .k2::before{content:"";width:10px;height:10px;border-radius:50%;box-shadow:inset 0 0 0 2px var(--ink-2)}
.wr-sw{display:grid}
.wr-sw>div{display:grid;grid-template-columns:190px minmax(0,1.4fr) 170px minmax(0,1fr) 60px 110px;gap:12px;align-items:center;min-height:46px;padding:0 28px;border-bottom:1px solid var(--line);font-size:13px;font-variant-numeric:tabular-nums}
.wr-sw>div:last-child{border-bottom:0}
.wr-sw>.hd{min-height:34px;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.wr-sw .strong{font-weight:650}.wr-sw .dim{color:var(--muted)}.wr-sw .num{text-align:right}
.wr-sw.slim>div{grid-template-columns:190px minmax(0,1fr) 190px 110px}
.wr-sw span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:1040px){
  .wr-hero-grid{grid-template-columns:1fr;gap:24px}
  .wr-b{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px}
  .wr-b>.wr-chart{grid-column:1/-1;grid-row:2}
}
@media (max-width:759px){
  .wr-phase{grid-template-columns:1fr 1fr;gap:16px 10px}
  .wr-list>.lx-sec{padding:0 4px 8px}
  .wr-list>.lx-sec .act{margin-left:0;gap:12px;width:100%}
  .wr{padding:20px 4px 22px}
  .wr.yes{padding:18px 16px 20px;border-radius:20px}
  .wr-h{flex-wrap:wrap;row-gap:6px}
  .wr-h .sp{display:none}
  .wr-call{flex-basis:100%;flex-wrap:wrap;white-space:normal;row-gap:2px}
  .wr-call em{white-space:normal}
  .wr-h .lx-btn{width:100%;height:46px;margin-top:4px}
  .wr-b{grid-template-columns:1fr;gap:20px}
  .wr-b>.wr-chart{grid-column:auto;grid-row:auto}
  .wr .big{font-size:30px}
  .wr-sw>.hd{display:none}
  .wr-sw>div,.wr-sw.slim>div{grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;padding:12px 18px;min-height:0}
  .wr-sw .when{grid-column:1/-1}
  .wr-sw .when:empty,.wr-sw .num:empty{display:none}
  .wr-sw .what{grid-column:1/-1;white-space:normal}
  .wr-sw .where{grid-column:1/-1;white-space:normal}
  .wr-sw .num{text-align:left}
  .wr-sw .when{order:0}.wr-sw .what{order:1}.wr-sw .brand{order:2}.wr-sw .st{order:3;justify-self:end}.wr-sw .where{order:4}.wr-sw .num{order:5;grid-column:1/-1}
}`;
function styles() {
  addStyles('wr-css', CSS);
}

/* ---------- small helpers ---------- */
const ok = n => n != null && isFinite(n);
const hourLabel = hr => { const k = ((hr % 24) + 24) % 24; return k === 0 ? '12am' : k < 12 ? k + 'am' : k === 12 ? '12pm' : (k - 12) + 'pm'; };
const CALL_WORD = { scale: 'Raise 50%', raise: 'Raise 25%', hold: 'Hold', cut: 'Cut 25%' };
const dayShort = ymd => ymd ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

/* The season's phases (the locked Black Friday plan). States come from today's date. */
const SEASON = [
  { name: 'Early Black Friday', from: '2026-11-01', to: '2026-11-25', weight: 3 },
  { name: 'Black Friday', from: '2026-11-26', to: '2026-11-30', weight: 5 },
  { name: 'Cyber Monday', from: '2026-11-30', to: '2026-11-30', weight: 3.6, at: 'Mon Nov 30, 12:00am' },
  { name: 'Holiday', from: '2026-12-01', to: '2026-12-17', weight: 2.4 },
];
function phasesFor(today) {
  let lit = false;
  return SEASON.map(p => {
    const md = d => dayShort(d).replace(/^\w+ /, '');
    const range = p.at || `${md(p.from)} to ${md(p.to).replace(/^\w+ /, '')}`;
    if (today > p.to) return { name: p.name, weight: p.weight, state: 'done', sub: range + ', done' };
    if (today >= p.from && !lit) {
      lit = true;
      const n = daysBetween(p.from, p.to) + 1, d = daysBetween(p.from, today) + 1;
      return { name: p.name, weight: p.weight, state: 'now', progress: Math.min(1, (d - 0.5) / n), sub: `Day ${d} of ${n}, ${dayShort(today)}` };
    }
    return { name: p.name, weight: p.weight, state: '', sub: range };
  });
}

/* ---------- load: three read routes folded into one plain shape (the fixture has the same shape) ---------- */
async function load(ctx) {
  const sig = ctx.signal;
  const [stR, warR] = await Promise.allSettled([
    ctx.api('/api/standing', { worker: 'ah', signal: sig }),
    ctx.api('/api/season/war?act=all', { signal: sig }),
  ]);
  if (stR.status === 'rejected' && warR.status === 'rejected') throw stR.reason;
  const S = stR.status === 'fulfilled' ? stR.value && stR.value.standing : null;
  const war = warR.status === 'fulfilled' ? warR.value : null;
  const warRows = (war && war.brands) || [];
  const list = S ? S.brands || [] : warRows.map(w => ({ act_id: w.act_id, name: w.name, goal: w.goal, today: (w.live && w.live.today) || {}, no_sales: w.live && w.live.today && w.live.today.no_sales, watch: w.ro, only_today: true }));
  const details = await Promise.allSettled(list.map(b => ctx.api('/api/season/war?act=' + encodeURIComponent(b.act_id) + '&live=1', { signal: sig })));
  const approved = (S && S.approved) || {};

  const brands = list.map((b, i) => {
    const w = warRows.find(r => r.act_id === b.act_id) || {};
    const d = details[i].status === 'fulfilled' ? details[i].value : null;
    const L = d && d.live && !d.live.error ? d.live : null;
    const wT = (w.live && w.live.today) || {}, lT = (L && L.today) || {};
    const noSales = !!b.no_sales;
    const g = b.suggest || {}, m = b.meta || {}, camp = m.camp || null, ap = approved[b.act_id];
    const so = b.so_far || {}, l6 = b.last6 || {};
    const kpi = b.kpi || null, hold = kpi ? (b.hold ?? kpi * 0.8) : null;

    /* today by the hour: cumulative sales, a zero first so the line starts on the axis */
    let hours = null, cmp = null;
    if (L && Array.isArray(L.hours) && !noSales) {
      let last = -1;
      L.hours.forEach((hr, k) => { if ((hr.sales || 0) > 0 || (hr.spend || 0) > 0) last = k; });
      if (last >= 0) hours = [0, ...L.hours.slice(0, last + 1).map(hr => Math.round(hr.cum_sales || 0))];
      if (Array.isArray(L.plan_curve)) cmp = [0, ...L.plan_curve.map(v => Math.round(v || 0))];
    }
    const todaySales = noSales ? null : (b.today && b.today.sales != null ? b.today.sales : lT.sales ?? null);
    const pace = L && L.day ? L.day.pace : null;

    /* the call, as text */
    const early = /^Too early/i.test(g.why || '');
    let call, status;
    const from = camp && camp.daily;
    const stays = m.error ? 'Meta did not answer' : !camp ? (S ? 'No sale campaign in Meta' : '') : from ? `Stays ${money(from)} a day` : 'Ad set budgets, no campaign budget';
    if (b.only_today) call = { kind: 'hold', text: 'No check-in yet', sub: '', why: 'The first check-in runs at 9am Central.' };
    else if (b.watch) call = { kind: 'watch', text: 'Watch only', sub: 'No budget move from ' + APP_NAME, why: g.why || '' };
    else if (ap) call = { kind: g.call || 'hold', text: CALL_WORD[g.call] || 'Hold', sub: `Done, now ${money(ap.to)} a day`, why: `Approved by ${ap.by || 'the team'}.` };
    else if (g.to) call = { kind: g.call, text: CALL_WORD[g.call] || 'Hold', sub: `${money(from)} to ${money(g.to)} a day`, why: [g.why, g.note].filter(Boolean).join(' '), needs_yes: true };
    else call = { kind: g.call || 'hold', text: CALL_WORD[g.call] || 'Hold', sub: stays, why: [g.why, g.note].filter(Boolean).join(' ') };

    const used = m.limit && ok(m.on) ? m.on / m.limit : null, near = used != null && used > 0.7;
    if (b.watch) status = { tone: 'off', text: 'Watch only' };
    else if (noSales) status = { tone: 'warn', text: 'No sales source connected' };
    else if (b.error) status = { tone: 'warn', text: 'No live numbers' };
    else if (call.needs_yes) status = { tone: 'info', text: 'Needs your yes' };
    else if (ap) status = { tone: 'good', text: 'Approved' };
    else if (early) status = { tone: 'off', text: 'Too early' };
    else if (ok(so.mer) && hold && so.mer < hold) status = { tone: 'bad', text: 'Under break-even' };
    else if (near) status = { tone: 'warn', text: 'Near Meta limit' };
    else if (b.only_today) status = { tone: 'off', text: 'Today only' };
    else status = { tone: 'good', text: 'On plan' };

    return {
      id: b.act_id, name: b.name, status, call, no_sales: noSales,
      today: { sales: todaySales, goal: L && L.day ? L.day.goal : null, orders: lT.orders ?? wT.orders ?? null, aov: lT.aov ?? wT.aov ?? null, vs: ok(pace) ? { pct: pace - 1, label: 'vs plan by now' } : null },
      weekend: { sales: noSales ? null : so.sales ?? null, goal: b.goal || null },
      hours, cmp,
      mer: { so_far: noSales ? null : so.mer ?? null, last6: !noSales && l6.spend >= 50 ? l6.mer ?? null : null, last6_hours: l6.hours || 6, kpi, hold, new: so.new_mer ?? null, be_new: b.be_new || null, early, watch: !!b.watch, today: b.today ? b.today.mer ?? null : null },
      spend: { today: b.today ? b.today.spend ?? null : null, budget: ok(m.on) && m.on > 0 ? m.on : null, limit_used: used, near },
    };
  });

  const counted = (S ? S.brands : []).filter(b => !b.no_sales && b.so_far && b.so_far.sales != null);
  const sum = (arr, f) => arr.reduce((t, v) => t + (f(v) || 0), 0);
  const wSales = sum(counted, b => b.so_far.sales), wSpend = sum(counted, b => b.so_far.spend);

  /* the switches the team scheduled, soonest first; the same moment is printed once */
  const now = Date.now();
  const sw = warRows.flatMap(w => (w.scheduled || []).map(v => ({ at: Date.parse(v.at), what: v.what || '', brand: w.name }))).filter(v => v.at && v.at > now).sort((a, b) => a.at - b.at);
  let prev = '';
  const switches = sw.slice(0, 14).map(v => {
    const when = new Date(v.at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
    const row = { when: when === prev ? '' : when, what: v.what, brand: v.brand, where: '', ads: null, status: { tone: '', text: 'Scheduled' } };
    prev = when; return row;
  });
  const mins = sw.length ? Math.round((sw[0].at - now) / 60e3) : null;

  const today = (S && S.today) || (war && war.today) || new Date().toISOString().slice(0, 10);
  return {
    fetched_at: now, no_checkin: !S,
    standing_error: stR.status === 'rejected' ? String(stR.reason && stR.reason.message || 'The check-in did not load') : null,
    checked: S ? S.label : null, next: S ? S.next : null, dry: !!(S && S.dry), cmp_label: 'Plan for today',
    weekend: S ? { sales: counted.length ? wSales : null, goal: sum(S.brands, b => b.goal), spend: wSpend, mer: wSpend > 0 ? wSales / wSpend : null, kpi: 2.5 } : null,
    phases: phasesFor(today), brands, switches,
    switch_note: mins == null ? '' : `First switch in ${Math.floor(mins / 60)}h ${mins % 60}m`,
    foot: 'Sales and MER are Triple Whale: store sales over all ad spend, each brand counted from its own sale start. Budgets and the Meta daily limit are read from Meta at the last check-in. Today by the hour is against the plan for today. Nothing on this page changes Meta.',
  };
}

/* ---------- parts ---------- */
function phaseStrip(phases) {
  const cols = phases.map(p => (p.weight || 1) + 'fr').join(' ');
  return h('div', { class: 'wr-phase', style: { '--cols': cols }, role: 'img', 'aria-label': phases.map(p => `${p.name}: ${p.sub}`).join('. ') },
    phases.map(p => h('div', { class: p.state || '', style: p.state === 'now' ? { '--v': Math.round((p.progress ?? 0.5) * 100) + '%' } : null }, h('i'), h('b', null, p.name), h('span', null, p.sub))));
}

/** Today by the hour (ember) against the comparison (dashed). 25 points across: 12am to 12am. */
function hourChart(b, cmpLabel) {
  const td = b.hours || [], cmp = b.cmp || [];
  if (b.no_sales) return h('div', { class: 'wr-nochart' }, 'No sales source connected, so there is no hourly line.');
  if (td.length < 2) return h('div', { class: 'wr-nochart' }, 'No sales by the hour yet today.');
  /* 25 points across, 12am to 12am, drawn by the kit's one chart. "Now" is the last hour with sales. */
  const now = td.length - 1, far = hr => Math.abs(hr - now) >= 3;
  return lineChart({
    series: [{ name: 'Today', lead: true, values: Array.from({ length: 25 }, (_, i) => td[i] ?? null) }, cmp.length > 1 && { name: cmpLabel, dashed: true, values: cmp }],
    labels: Array.from({ length: 25 }, (_, i) => (i === now ? hourLabel(now) + ' now' : hourLabel(i % 24))),
    ticks: [0, 6, 18, 24].filter(far).concat(now).sort((a, b) => a - b),
    now, axis: false, endLabels: false, yTicks: 2, height: 168, top: 8,
    label: `${b.name}: sales by hour today${cmp.length ? ' against ' + cmpLabel.toLowerCase() : ''}`,
  });
}

/** Where a MER sits on the range: four equal zones, cut / hold / raise 25% / raise 50%. */
function ladderPos(v, m) {
  const a = m.hold, b = m.kpi, c = m.kpi * 1.5, top = m.kpi * 2.25;
  const p = v < a ? 25 * v / a : v < b ? 25 + 25 * (v - a) / (b - a) : v < c ? 50 + 25 * (v - b) / (c - b) : 75 + 25 * (v - c) / (top - c);
  return Math.max(1.5, Math.min(98.5, p));
}
function ladder(m) {
  const placed = ok(m.so_far) && ok(m.kpi) && ok(m.hold) && !m.watch;
  const zone = !placed ? -1 : m.so_far < m.hold ? 0 : m.so_far < m.kpi ? 1 : m.so_far < m.kpi * 1.5 ? 2 : 3;
  const Z = [['bad', 'Cut'], ['hold', 'Hold'], ['good', '+25%'], ['good2', '+50%']];
  const span = i => ({ '--a': i * 25 + '%', '--b': (i + 1) * 25 + '%' });
  const aria = !placed ? 'Not placed on the range' : `Store MER so far ${x(m.so_far)}. Under ${x(m.hold)} is a cut, ${x(m.kpi)} is a 25% raise, ${x(m.kpi * 1.5)} is a 50% raise.` + (ok(m.last6) ? ` Last ${m.last6_hours} hours ${x(m.last6)}.` : '');
  return h('div', { class: 'wr-zg' + (placed ? '' : ' dim'), role: 'img', 'aria-label': aria, title: aria },
    h('div', { class: 'wr-zt' },
      Z.map(([cls], i) => h('i', { class: `z ${cls}${i === 3 ? ' last' : ''}${i === zone ? ' on' : ''}`, style: span(i) })),
      placed && ok(m.last6) ? h('span', { class: 'ring', style: { '--v': ladderPos(m.last6, m) + '%' } }) : null,
      placed ? h('span', { class: 'mark', style: { '--v': ladderPos(m.so_far, m) + '%' } }) : null),
    h('div', { class: 'wr-zn' }, Z.map(([, label], i) => h('span', { class: i === zone ? 'on' : '', style: span(i) }, label))));
}

function brandRow(b, i, ctx, data, firstYes) {
  const t = b.today || {}, m = b.mer || {}, sp = b.spend || {}, c = b.call || {}, w = b.weekend || {};
  const yes = !!c.needs_yes;
  const tone = c.kind === 'raise' || c.kind === 'scale' ? 'good' : c.kind === 'cut' ? 'bad' : c.kind === 'watch' ? 'off' : '';
  const shortWhy = c.why && c.why.length <= 64;

  const head = h('div', { class: 'wr-h' },
    h('span', { class: 'nm' }, b.name), statusDot(b.status.tone, b.status.text), h('span', { class: 'sp' }),
    h('span', { class: 'wr-call' }, h('b', { class: tone }, c.text), c.sub ? h('span', null, c.sub) : null, shortWhy ? h('em', { title: c.why }, c.why) : null),
    yes ? button('Approve in old ' + APP_NAME, { primary: b.id === firstYes, large: true, href: ctx.legacy || '../', icon: 'arrow', aria: `Approve ${b.name} in old ${APP_NAME}` }) : null);

  /* sales today */
  const sales = b.no_sales
    ? [h('span', { class: 'lab' }, 'Sales today'), h('span', { class: 'big off' }, 'No sales source connected')]
    : [h('span', { class: 'lab' }, 'Sales today'),
      h('span', { class: 'big' }, ok(t.sales) ? money(t.sales) : 'no data', h('small', null, ok(t.goal) ? 'of ' + money(Math.round(t.goal)) : 'no goal set')),
      h('div', { class: 'lx-gauge thin', role: 'img', 'aria-label': ok(t.goal) && ok(t.sales) ? Math.round(100 * t.sales / t.goal) + "% of today's goal" : 'No goal set' },
        h('div', { class: 'lx-gauge-track' }, ok(t.goal) && ok(t.sales) ? h('i', { class: 'fill', style: { '--v': Math.min(100, 100 * t.sales / t.goal).toFixed(1) + '%' } }) : null)),
      h('span', { class: 'sub' }, t.vs && ok(t.vs.pct) ? [delta(t.vs.pct), t.vs.label] : (data.cmp_label === 'Last year' ? 'no last year' : '')),
      h('span', { class: 'sub' }, ok(t.orders) ? `${num(t.orders)} orders${ok(t.aov) ? ', ' + money(Math.round(t.aov)) + ' each' : ''}` : ''),
      ok(w.sales) ? h('span', { class: 'sub' }, `Weekend ${money(Math.round(w.sales))}${ok(w.goal) ? ' of ' + money(w.goal) : ''}`) : null];

  /* store MER so far on the range */
  const merText = ok(m.so_far) ? x(m.so_far) : b.no_sales ? 'No read' : m.early ? 'Too early' : 'No read';
  const merSmall = m.watch ? 'no range, watch only' : ok(m.kpi) ? `goal ${x(m.kpi)}` : 'no goal set';
  const merCls = !ok(m.so_far) ? ' off' : ok(m.hold) && !m.watch && m.so_far < m.hold ? ' bad' : '';
  const right = h('div', null,
    h('div', { class: 'c' },
      h('span', { class: 'lab' }, 'Store MER so far'),
      h('div', { class: 'mid' + merCls }, merText, h('small', null, merSmall)),
      ladder(m),
      ok(m.new) ? h('span', { class: 'sub' }, `New customers ${x(m.new)}${ok(m.be_new) ? ', break-even ' + x(m.be_new) : ''}`) : null),
    h('div', { class: 'wr-pair' },
      h('div', { class: 'c' }, h('span', { class: 'lab' }, `Last ${m.last6_hours || 6} hours`), h('div', { class: 'sm' + (ok(m.last6) ? '' : ' off') }, ok(m.last6) ? x(m.last6) : 'No read')),
      h('div', { class: 'c' },
        h('span', { class: 'lab' }, 'Ad spend today'),
        h('div', { class: 'sm' }, ok(sp.today) ? money(Math.round(sp.today)) : 'no data', h('small', null, ok(sp.budget) ? 'of ' + money(Math.round(sp.budget)) : 'no budget read')),
        h('div', { class: 'lx-gauge thin', role: 'img', 'aria-label': ok(sp.budget) && ok(sp.today) ? Math.round(100 * sp.today / sp.budget) + "% of today's budget" : 'No budget read' },
          h('div', { class: 'lx-gauge-track' }, ok(sp.budget) && ok(sp.today) ? h('i', { class: 'fill', style: { '--v': Math.min(100, 100 * sp.today / sp.budget).toFixed(1) + '%' } }) : null)),
        h('span', { class: 'sub' }, !ok(sp.limit_used) ? 'Meta limit not tracked' : sp.near ? statusDot('warn', `Meta limit ${pct(sp.limit_used)} used`) : `Meta limit ${pct(sp.limit_used)} used`))));

  return h('section', { class: 'wr' + (yes ? ' yes' : '') + (i === 0 ? ' first' : ''), 'aria-label': b.name },
    head,
    c.why && !shortWhy ? h('p', { class: 'wr-why' }, c.why) : null,
    h('div', { class: 'wr-b' }, h('div', { class: 'c' }, sales), h('div', { class: 'wr-chart' }, hourChart(b, data.cmp_label || 'Plan for today')), right));
}

const RANK = b => b.call && b.call.needs_yes ? 0 : !b.call ? 3 : b.call.kind === 'watch' ? 6 : b.mer && b.mer.early ? 5 : b.call.kind === 'cut' ? 1 : b.call.kind === 'raise' || b.call.kind === 'scale' ? 2 : 3;
const SORTS = {
  needs: list => list.map((b, i) => [b, i]).sort((p, q) => RANK(p[0]) - RANK(q[0]) || p[1] - q[1]).map(p => p[0]),
  az: list => [...list].sort((p, q) => p.name.localeCompare(q.name)),
  sales: list => [...list].sort((p, q) => ((q.today && q.today.sales) || 0) - ((p.today && p.today.sales) || 0)),
};
let sortBy = 'needs';

function switchList(rows) {
  const full = rows.some(r => r.where || ok(r.ads));
  const cell = (cls, v) => h('span', { class: cls }, v == null ? '' : v);
  return h('div', { class: 'wr-sw' + (full ? '' : ' slim') },
    h('div', { class: 'hd' }, cell('when', 'When'), cell('what', 'What happens'), cell('brand', 'Brand'), full ? cell('where', 'Where') : null, full ? cell('num', 'Ads') : null, cell('st', 'Status')),
    rows.map(r => h('div', null,
      cell('when strong', r.when), cell('what' + (r.when ? '' : ' dim'), r.what), cell('brand', r.brand),
      full ? cell('where dim', r.where) : null, full ? cell('num' + (r.ads ? '' : ' dim'), ok(r.ads) ? (r.ads ? num(r.ads) + ' ads' : 'No ads') : '') : null,
      h('span', { class: 'st' }, statusDot(r.status.tone, r.status.text)))));
}

/* ---------- render ---------- */
function render(el, data, ctx) {
  styles();
  if (!data || !data.brands || !data.brands.length) {
    put(el, empty({ title: 'No brand is in the season yet', text: data && data.standing_error ? data.standing_error : 'The War Room fills in once a brand has a Black Friday plan.', action: ctx.legacy ? button('Open old ' + APP_NAME, { href: ctx.legacy }) : null }));
    return;
  }
  const W = data.weekend, needs = data.brands.filter(b => b.call && b.call.needs_yes);
  const firstYes = needs.length ? SORTS.needs(data.brands)[0].id : null;
  const merTone = W && ok(W.mer) ? (W.mer >= W.kpi ? 'good' : W.mer >= W.kpi * 0.8 ? 'warn' : 'bad') : 'off';

  const top = hero({
    sub: h('span', { class: 'wr-sub' }, platformChip('meta'), ` sales ads, ${data.brands.length} brands${data.dry ? ', dry run on today' : ''}`),
    action: h('div', { class: 'wr-meta' },
      data.checked ? h('span', null, `Checked ${data.checked}${data.next ? ', next ' + data.next : ''}`) : h('span', null, 'No check-in yet'),
      button('Check now in old ' + APP_NAME, { href: ctx.legacy || '../' })),
  },
  h('div', { class: 'wr-hero-grid' },
    h('div', { class: 'wr-hero-l' },
      h('span', { class: 'lab' }, data.dry ? 'Sales today, all brands' : 'Weekend sales so far'),
      W && ok(W.sales)
        ? h('div', { class: 'big' }, h('span', { class: 'lx-hero-num' }, money(Math.round(W.sales))), ok(W.goal) && W.goal > 0 ? h('span', { class: 'of' }, 'of ' + money(W.goal)) : null)
        : h('div', { class: 'big' }, h('span', { class: 'of' }, data.no_checkin ? 'No check-in yet. The first one runs at 9am Central.' : 'No sales source connected')),
      W && ok(W.mer) ? statusDot(merTone, `MER ${x(W.mer)} so far, goal ${x(W.kpi)}`) : null),
    phaseStrip(data.phases || [])));
  top.classList.add('line');

  const rowsBox = h('div');
  const drawRows = () => put(rowsBox, ...(SORTS[sortBy] || SORTS.needs)(data.brands).map((b, i) => brandRow(b, i, ctx, data, firstYes)));
  drawRows();
  const hasCmp = data.brands.some(b => b.cmp && b.cmp.length > 1);
  const list = h('section', { class: 'wr-list', 'aria-label': 'Brands' },
    h('div', { class: 'lx-sec' }, h('h2', null, 'Brands'),
      h('span', { class: 'note' }, needs.length ? `${needs.length} need${needs.length === 1 ? 's' : ''} your yes` : 'Nothing needs your yes'),
      h('div', { class: 'act' },
        legend([{ name: 'Today by hour', lead: true }, hasCmp ? { name: data.cmp_label || 'Plan for today', dashed: true } : null].filter(Boolean)),
        h('span', { class: 'wr-key' }, h('span', { class: 'k1' }, 'MER so far'), h('span', { class: 'k2' }, 'Last 6 hours')),
        segmented([{ id: 'needs', label: 'Needs you first' }, { id: 'az', label: 'A to Z' }, { id: 'sales', label: 'Sales today' }], sortBy, id => { sortBy = id; drawRows(); }))),
    rowsBox);

  const sw = data.switches && data.switches.length
    ? card({ title: 'Ads that switch on by themselves', note: platformChip('meta'), flush: true,
      action: [data.switch_note ? h('span', null, data.switch_note) : null, data.switches.some(r => r.status.tone === 'warn') ? statusDot('warn', data.switches.filter(r => r.status.tone === 'warn').length + ' to check') : null] },
    switchList(data.switches))
    : null;

  put(el, ...[top, list, sw, h('p', { class: 'lx-foot' }, data.foot || '')].filter(Boolean));
}

export default {
  /* the plain question, drawn by the shell above the tabs. The page is about today, so there are no dates to pick. */
  title: ['Which brand needs a call ', em('right now?')],
  eyebrow: 'Black Friday War Room',
  ranges: false,
  asOf: d => (d && d.fetched_at) || null,
  load,
  render,
};
