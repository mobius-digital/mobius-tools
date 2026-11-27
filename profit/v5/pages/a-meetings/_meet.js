/* Meetings: what the pre-read and the Monday agenda share.
   - loadMeeting(ctx) and meetingOf(d, ctx): the Monday meeting's three reads, each painted as it lands
     (pages/_parts.js), and the one shape all three pages draw from.
   - small local parts the kit does not have (see "Kit gaps" in the build notes): the traffic light, the tick, the folded row.
   - the page CSS, added once, every class starts with mt-. */

import { h, svgNode, lineChart, money, x, num, addStyles } from '../../kit.js';
import { icon } from '../../icons.js';
import { loadParts } from '../_parts.js';

/** Sunday is not final until Monday morning, so the pre-read goes out then. The start time is the
    setting agency.meetingStart; this is only its fallback. */
export const SENT_LABEL = "Sent Monday 6am with last week's final numbers (Mon to Sun)";
export const MEETING_START = '8:00';

/* ---------- dates ---------- */
const day = ymd => new Date(ymd + 'T12:00:00');
export const addDays = (ymd, n) => { const d = day(ymd); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const mon = d => d.toLocaleDateString('en-US', { month: 'short' });
/** rangeText('2026-11-16', '2026-11-22') "Nov 16 to 22" */
export function rangeText(from, to) {
  if (!from || !to) return '';
  const a = day(from), b = day(to);
  return `${mon(a)} ${a.getDate()} to ${a.getMonth() === b.getMonth() ? '' : mon(b) + ' '}${b.getDate()}`;
}
export const shortDay = ymd => { const d = day(ymd); return `${mon(d)} ${d.getDate()}`; };
export const longDay = ymd => { const d = day(ymd); return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${mon(d)} ${d.getDate()}`; };

/* ---------- reading against the goal ---------- */
const ok = n => n != null && isFinite(n);
/** lightOf(1.14, 2.5) { tone: 'bad', text: 'Under goal', at: 2 }. No goal or no number: null. */
export function lightOf(mer, goal) {
  if (!ok(mer) || !ok(goal) || !(goal > 0)) return null;
  const r = mer / goal;
  return r >= 1 ? { tone: 'good', text: 'On goal', at: 0 } : r >= 0.9 ? { tone: 'warn', text: 'Close', at: 1 } : { tone: 'bad', text: 'Under goal', at: 2 };
}

/* ---------- live data ----------
   Three reads, asked at the same moment, each kept small and painted as it lands:
     monday   ah GET /api/meetings/monday            last week's report per brand (sales, spend, MER, the plan, the
                                                     summary) and the open tasks. The worker's own tables: quick.
     cmd      profit GET /api/hub/command            each brand's MER goal. Kept by the worker for 3 minutes.
     screen   ah GET /api/calls/screen?kind=monday   the team meeting screen: the same report plus Meta and Google
                                                     by channel, the cards being made and the promises. The slow one:
                                                     it opens the call, reads the whole production board and splits
                                                     each brand's plan thread.
   The scoreboard, the decision brands and the tasks draw from `monday` alone; the channel rows and the pipeline
   fill in when `screen` lands. If `monday` fails, `screen` stands in for it. */
const pickT = t => ({ sales: (t && t.sales) ?? null, spend: (t && t.spend) ?? null, mer: (t && t.mer) ?? null });
const readOf = r => (r ? { period_start: r.period_start || null, period_end: r.period_end || null, currency: r.currency || 'USD', totals: pickT(r.totals), prior: pickT(r.prior), plan: pickT(r.plan),
  need_from_you: r.need_from_you || [], summary: String(r.summary || ''),
  channels: Array.isArray(r.channels) ? r.channels.filter(c => c && (c.id === 'meta' || c.id === 'google')).map(c => ({ id: c.id, cur: c.cur || null, prev: c.prev || null })) : null } : null);
const openOf = list => (list || []).map(t => ({ text: t.text || t.name || '', owner: t.owner || '', due: t.due || '' }));
const fromMonday = m => ({ monday: m.monday, theme: m.theme || '', agency_open: openOf(m.agency_open),
  brands: (m.brands || []).map(b => ({ act_id: b.act_id, name: b.name, read: readOf(b.report), open: openOf(b.open), making: null })) });
const fromScreen = s => ({ monday: s.monday, theme: s.theme || '', agency_open: openOf(s.agency_open),
  promised: ((s.call && s.call.state && s.call.state.promised) || []).filter(p => p && p.text).length,
  brands: (s.brands || []).map(b => ({ act_id: b.act_id, name: b.name, read: readOf(b.read), open: openOf(b.open),
    making: (b.making || []).map(k => ({ num: k.num || null, title: k.title || '', board: k.board || '', owner: k.owner || '', due: k.due || '' })) })) });

export function loadMeeting(ctx) {
  const ah = { worker: 'ah', signal: ctx.signal };
  const screen = ctx.api('/api/calls/screen?kind=monday', ah).then(fromScreen);
  screen.catch(() => {});                                   // read below; a failure is the part's, not an unhandled one
  return loadParts(ctx, {
    monday: () => ctx.api('/api/meetings/monday', ah).then(fromMonday).catch(e => { if ((e && e.name === 'AbortError') || (e && e.status === 401)) throw e; return screen; }),
    cmd: () => ctx.api('/api/hub/command', { signal: ctx.signal }).then(c => ({ as_of: (c && c.as_of) || null,
      goals: Object.fromEntries(((c && c.brands) || []).filter(b => b.goal && b.goal.kind === 'mer' && ok(+b.goal.target)).map(b => [b.act_id, +b.goal.target])) })),
    screen: () => screen,
  }, { first: ['monday'] });
}

/** The parts that have landed, as { monday, week: { from, to }, as_of, brands: [...], agenda: {...}, waiting }.
    The fixtures have this shape already and pass straight through. `waiting.screen` is true while the channel
    rows and the pipeline are still on their way. */
export function meetingOf(d, ctx) {
  if (!d || !d.parts) return d;
  const mon = d.parts.monday, scr = d.parts.screen, cmd = d.parts.cmd, lateList = d.late || [];
  /* the meeting screen leaves paused brands off; until it lands, keep to the brands in the brand list */
  const mine = new Set(((ctx && ctx.brands) || []).map(b => b.id));
  const src = scr || (mon ? { ...mon, brands: (mon.brands || []).filter(b => !mine.size || mine.has(b.act_id)) } : null);
  if (!src) return { brands: [], agenda: { counts: {} }, waiting: { screen: lateList.includes('screen') } };
  const more = new Map(((mon && mon.brands) || []).map(b => [b.act_id, b]));
  const goals = (cmd && cmd.goals) || {};
  const monday = src.monday;
  const brands = (src.brands || []).map(b => {
    const m = more.get(b.act_id);
    /* the report's own summary is longer on `monday` (the screen cuts it shorter) */
    const read = b.read && m && m.read && m.read.summary.length > b.read.summary.length ? { ...b.read, summary: m.read.summary } : b.read;
    return brandOf({ ...b, read, open: b.open && b.open.length ? b.open : (m && m.open) || b.open }, goals[b.act_id]);
  });
  const first = brands.find(b => b.week);
  const promised = scr ? scr.promised || 0 : 0;
  const under = brands.filter(b => { const l = lightOf(b.mer, b.goal_mer); return l && l.tone !== 'good'; });
  const green = brands.filter(b => { const l = lightOf(b.mer, b.goal_mer); return l && l.tone === 'good'; });
  const ready = scr ? (scr.brands || []).reduce((n, b) => n + (b.making || []).filter(c => c.board === 'ready').length, 0) : null;
  const screen = { agency_open: src.agency_open || [] };
  return {
    monday, week: first ? first.week : { from: addDays(monday, -7), to: addDays(monday, -1) },
    as_of: (cmd && cmd.as_of) || d.at || null, brands, theme: src.theme || '', agency_open: src.agency_open || [],
    waiting: { screen: !scr && lateList.includes('screen'), goals: !cmd && lateList.includes('cmd') },
    missing: { screen: !scr && !lateList.includes('screen') },
    agenda: {
      counts: {
        scoreboard: `${brands.length} brands`,
        promises: promised ? `${promised} written` : null,
        green: `${green.length} brands`,
        decision: under.length,
        pipeline: ready == null ? null : `${ready} ready to load`,
        learned: null,
        agency: (screen.agency_open || []).length ? `${screen.agency_open.length} open` : null,
        close: 'Rate it 1 to 10',
      },
      read: null, example_decision: null, example_myday: null,
    },
  };
}

function brandOf(b, merGoal) {
  const r = b.read, t = (r && r.totals) || {}, p = (r && r.prior) || {}, plan = (r && r.plan) || {};
  const cur = (r && r.currency) || 'USD';
  const goal = ok(merGoal) ? merGoal : ok(plan.mer) ? plan.mer : null;
  const week = r && r.period_start ? { from: r.period_start, to: r.period_end } : null;
  const weeks = [];
  if (week && ok(p.mer)) weeks.push({ label: shortDay(addDays(week.from, -7)), sales: p.sales, spend: p.spend, mer: p.mer });
  if (week && ok(t.mer)) weeks.push({ label: shortDay(week.from), sales: t.sales, spend: t.spend, mer: t.mer });
  const rows = [];
  for (const id of ['meta', 'google']) {
    const ch = r && (r.channels || []).find(k => k.id === id);
    if (!ch || !ch.cur) continue;
    const l = lightOf(ch.cur.roas, goal);
    rows.push({ id, icon: id, label: id === 'meta' ? 'Meta' : 'Google', big: x(ch.cur.roas), sub: ok(goal) ? `ROAS, Triple Whale last click. Store goal ${x(goal)}` : 'ROAS, Triple Whale last click',
      tone: l ? l.tone : 'off', status: l ? (l.tone === 'good' ? 'On goal' : l.tone === 'warn' ? 'Close' : 'Under goal') : 'No goal set', go: [id, 'overview'],
      detail: { cols: [{ label: 'Week' }, { label: 'Spend', num: true }, { label: 'Sales', num: true }, { label: 'ROAS', num: true }],
        rows: [['Last week', money(ch.cur.spend, { cur }), money(ch.cur.revenue, { cur }), x(ch.cur.roas)], ...(ch.prev ? [['The week before', money(ch.prev.spend, { cur }), money(ch.prev.revenue, { cur }), x(ch.prev.roas)]] : [])] } });
  }
  const making = b.making || [];
  if (making.length) {
    const ready = making.filter(k => k.board === 'ready').length;
    rows.push({ id: 'pipeline', icon: 'board', label: 'Creative in the pipeline', big: `${ready} of ${making.length}`, sub: 'ready to load', tone: 'off', status: `${making.length - ready} being made`, go: ['production', 'board'],
      detail: { cols: [{ label: 'Card' }, { label: 'Where' }, { label: 'Owner' }, { label: 'Due' }],
        rows: making.slice(0, 12).map(k => [(k.num ? '#' + k.num + ' ' : '') + (k.title || ''), k.board || '', k.owner || '', k.due ? shortDay(k.due) : '']) } });
  }
  return {
    id: b.act_id, name: b.name, currency: cur, week, connected: !!r && ok(t.sales),
    has_report: !!r, sales: t.sales ?? null, sales_prior: p.sales ?? null, spend: t.spend ?? null, spend_prior: p.spend ?? null,
    mer: t.mer ?? null, goal_mer: goal, weeks, verdict: null, owner: null, decision: null, promises: null, rows,
    /* for Run the meeting: the open tasks, the report's own words and what we wait on from the client */
    open: b.open || null, summary: (r && r.summary) || '', need: (r && r.need_from_you) || [],
  };
}

/* ---------- local parts ---------- */
/** Where MER stands against its goal: one status pill, its rule in the tooltip (the old three dot light was
    never explained). lightOf: at or over the goal = On goal, within 10% under = Close, more than 10% under = Under goal. */
export const LIGHT_RULE = { good: 'Store MER at or over its goal', warn: 'Store MER under its goal by 10% or less', bad: 'Store MER under its goal by more than 10%' };
export function trafficLight(light) {
  if (!light) return h('span', { class: 'lx-pill', title: 'No MER goal is set for this brand' }, 'No goal set');
  return h('span', { class: 'lx-pill ' + light.tone, title: LIGHT_RULE[light.tone] }, light.text);
}
/** Done or Not done, with the round mark. */
export function tick(done) {
  return h('span', { class: 'mt-tick ' + (done ? 'done' : 'not') }, h('i', null, done ? svgNode(icon('check')) : null), done ? 'Done' : 'Not done');
}
/** A sentence from parts: ['Sales ', { b: 'halved' }, ' after ...'] */
export function sentence(parts) {
  return (parts || []).map(p => typeof p === 'string' ? p : h('b', null, p.b));
}

/** merChart(weeks, goal) : MER by week, the goal dashed. Drawn by the kit's one chart.
    No label on every point (they collided with the goal line): the tooltip reads each week, only the last
    value sits at the right end, outside the plot, and the goal is named once, in the legend beside the chart.
    The ember line is the lead line of the page. weeks: [{ label, mer }]. */
export function merChart(weeks, goal) {
  const pts = (weeks || []).filter(w => ok(w.mer));
  const top = Math.max(0, ...pts.map(p => p.mer), ok(goal) ? goal : 0), max = Math.max(1, Math.ceil(top + 0.05));
  return lineChart({
    series: [{ name: 'MER', lead: true, points: true, values: pts.map(p => p.mer), end: v => x(v) }],
    labels: pts.map(p => p.label || ''),
    goal: ok(goal) ? { value: goal, at: 'end' } : null,
    format: v => v.toFixed(1) + 'x', yMax: max, pad: 20, height: 336, phoneHeight: 300, empty: 'Not enough weeks yet',
    windowLabel: pts.length ? 'Weekly, week of ' + (pts[0].label || '') + ' to week of ' + (pts[pts.length - 1].label || '') + ' · Triple Whale' : 'Weekly',
    label: pts.length ? `MER by week for ${pts.length} weeks${ok(goal) ? ' against the ' + x(goal) + ' goal' : ''}. Last week ${x(pts[pts.length - 1].mer)}.` : 'MER by week',
    hover: i => [h('b', null, 'Week of ' + (pts[i].label || '')), h('span', null, 'MER ', h('b', null, x(pts[i].mer)), ok(goal) ? ', goal ' + x(goal) : '')],
  });
}

/** foldRow({ icon, label, big, sub, tone, status, open, onToggle, detail }) : one folded row and its detail.
    A real button with aria-expanded; the detail node is built only when the row is first opened. */
export function foldRow({ id, icon: ic, label, big, sub, tone, status, open = false, onToggle, detail }) {
  const body = h('div', { class: 'mt-detail', id: 'mt-d-' + id, hidden: !open });
  let built = false;
  const fill = () => { if (!built) { built = true; body.append(detail()); } };
  const btn = h('button', { type: 'button', class: 'mt-row' + (open ? ' open' : ''), 'aria-expanded': String(open), 'aria-controls': 'mt-d-' + id,
    onclick: () => {
      const now = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(now)); btn.classList.toggle('open', now);
      if (now) fill();
      body.hidden = !now;
      onToggle && onToggle(now);
    } },
    h('span', { class: 'lx-plat mt-what' }, svgNode(icon(ic)), label),
    h('span', { class: 'mt-hn' }, h('b', null, big), sub),
    h('span', { class: 'lx-stat ' + (tone || 'off') }, status),
    svgNode(icon('chevron', 'mt-chev')));
  if (open) fill();
  return h('div', { class: 'mt-fold' }, btn, body);
}

/** A plain little table for a row's detail: { cols: [{ label, num }], rows: [[cell, ...]], note } */
export function detailTable(d) {
  if (!d || !d.rows || !d.rows.length) return h('p', { class: 'mt-none' }, (d && d.note) || 'Nothing to show for last week.');
  return h('div', null,
    h('div', { class: 'mt-scroll' }, h('table', { class: 'lx-table mt-dt' },
      h('thead', null, h('tr', null, d.cols.map(c => h('th', { class: c.num ? 'num' : '', scope: 'col' }, c.label)))),
      h('tbody', null, d.rows.map(r => h('tr', null, r.map((v, i) => h('td', { class: d.cols[i] && d.cols[i].num ? 'num' : '' }, v == null ? '' : v))))))),
    d.note ? h('p', { class: 'mt-note' }, d.note) : null);
}

export { ok, money, x, num };

/* ---------- the page CSS, once ---------- */
const CSS = `
.mt-page{display:grid;gap:var(--gap-5,24px);min-width:0}
.mt-heads{display:grid;gap:var(--gap-4,16px);min-width:0}
.mt-vcard .mt-hero-top{align-items:center}
.mt-vcard p.mt-verdict{margin:0;max-width:860px;font-size:var(--fs-section,17px);line-height:1.45;letter-spacing:-.012em;color:var(--ink-2)}
.mt-vcard p.mt-verdict.quiet{color:var(--muted);font-size:var(--fs-body,14px)}
.mt-card{display:grid;gap:8px;min-width:0}
.mt-card .mt-prom:first-of-type{border-top:0}
.mt-pick{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap}
.mt-chips{display:flex;gap:6px;flex-wrap:wrap;min-width:0}
.mt-chip{height:32px;padding:0 13px;border:0;border-radius:999px;background:var(--bg-sunk);color:var(--ink-2);font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}
.mt-chip:hover{color:var(--ink)}
.mt-chip.on{background:var(--ink);color:#fff}
.mt-chip i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:7px;background:var(--faint)}
.mt-chip i.good{background:var(--good)}.mt-chip i.warn{background:var(--watch)}.mt-chip i.bad{background:var(--bad)}
.mt-hero{gap:34px;padding:34px 40px}
.mt-hero-top{display:flex;align-items:flex-start;gap:24px}
.mt-hero-top>div{display:grid;gap:12px;min-width:0}
.mt-hero p.mt-verdict{margin:0;max-width:860px;font-size:21px;line-height:1.4;letter-spacing:-.018em;color:var(--ink-2)}
.mt-verdict b{color:var(--ink);font-weight:600}
.mt-light{display:inline-flex;align-items:center;gap:7px;flex:none;height:38px;padding:0 16px 0 12px;border-radius:999px;background:#fff;box-shadow:var(--sh-1);font-size:14px;font-weight:600;white-space:nowrap}
.mt-light i{width:13px;height:13px;border-radius:50%;background:#E4E2DC}
.mt-light i.on.bad{background:var(--bad);box-shadow:0 0 0 4px rgba(201,24,74,.15)}
.mt-light i.on.warn{background:var(--watch);box-shadow:0 0 0 4px rgba(232,181,0,.2)}
.mt-light i.on.good{background:var(--good);box-shadow:0 0 0 4px rgba(11,125,85,.15)}
.mt-light b{margin-left:5px;font-weight:600}
.mt-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:56px}
.mt-three .lx-kpi .v{font-size:var(--num-l);line-height:1}
.mt-three .lx-hero-num{font-size:var(--num-xl);line-height:1}
.mt-three .lx-kpi .s{margin-top:8px}
.mt-three .lx-spark{height:44px;margin-top:14px}
.mt-three .gref{stroke:var(--ink-2);stroke-width:1;stroke-dasharray:3 3;vector-effect:non-scaling-stroke}
.mt-three .none{font-size:20px;font-weight:600;letter-spacing:-.02em;line-height:1.3;color:var(--ink-2);margin-top:6px}
.mt-panel{padding:30px 36px 22px}
.mt-h{display:flex;align-items:baseline;gap:6px 12px;flex-wrap:wrap;margin:0 0 4px}
.mt-h h3{margin:0;font-size:var(--fs-section,17px);font-weight:600;letter-spacing:-.015em}
.mt-h>span{color:var(--muted);font-size:var(--fs-small,12.5px)}
.mt-h .lx-legend{margin-left:auto}
.mt-goal{fill:var(--ink);font-size:12.5px;font-weight:600}
.mt-pt{paint-order:stroke;stroke:#fff;stroke-width:4px;stroke-linejoin:round;fill:var(--ink-2);font-size:12.5px;font-weight:500;text-anchor:middle;font-variant-numeric:tabular-nums}
.mt-last{paint-order:stroke;stroke:#fff;stroke-width:5px;stroke-linejoin:round;fill:var(--ink);font-size:20px;font-weight:600;letter-spacing:-.03em;text-anchor:end;font-variant-numeric:tabular-nums}
.mt-decide{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:48px;align-items:center;padding:30px 36px}
.mt-decide h2{margin:12px 0 6px;font-size:20px;font-weight:600;letter-spacing:-.028em;line-height:1.25}
.mt-decide p{margin:0;color:var(--muted);font-size:14px}
.mt-own{display:flex;align-items:center;gap:12px;margin-top:20px}
.mt-own b{display:block;font-weight:600;line-height:1.2}
.mt-own small{display:block;color:var(--muted);font-size:12.5px}
.mt-bignum{display:grid;gap:2px;padding-left:48px;border-left:1px solid var(--line)}
.mt-bignum .n{font-size:var(--num-l);font-weight:600;line-height:1;letter-spacing:-.045em;font-variant-numeric:tabular-nums}
.mt-bignum small{color:var(--muted);font-size:13px}
.mt-btns{display:grid;gap:10px}
.mt-quiet{font-size:12.5px;color:var(--muted);text-align:center}
.mt-spcap{display:block;margin-top:4px;font-size:11.5px;color:var(--muted)}
.mt-helpbar{display:flex;align-items:center;gap:12px;margin-bottom:-8px}
.mt-hero-top .lx-pill{flex:none;height:30px;padding:0 14px;font-size:13.5px}
.mt-btns .lx-btn{justify-content:center}
.mt-btns .lx-btn.picked{box-shadow:inset 0 0 0 2px var(--ink)}
.mt-open{display:grid;gap:6px;min-width:0}
.mt-prom{display:flex;align-items:center;gap:16px;min-height:72px;padding:10px 0;border-top:1px solid var(--line)}
.mt-prom:first-child{border-top:0}
.mt-prom .what{flex:1;min-width:0;font-size:15.5px;font-weight:500;letter-spacing:-.01em}
.mt-prom .who{color:var(--muted);font-size:13px;width:150px}
.mt-tick{display:inline-flex;align-items:center;gap:8px;width:118px;font-size:13.5px;font-weight:600;white-space:nowrap}
.mt-tick i{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--good)}
.mt-tick i svg{width:14px;height:14px;fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
.mt-tick.done{color:var(--good)}
.mt-tick.not{color:var(--bad)}
.mt-tick.not i{background:#fff;box-shadow:inset 0 0 0 2px var(--bad)}
.mt-fold{border-top:1px solid var(--line)}
.mt-fold:first-child{border-top:0}
.mt-row{display:grid;grid-template-columns:230px minmax(0,1fr) auto 20px;gap:20px;align-items:center;width:100%;min-height:72px;padding:10px 28px;border:0;background:none;text-align:left;cursor:pointer}
.mt-row:hover{background:var(--surface-2)}
.mt-row.open,.mt-row.open:hover{background:none}
.mt-what{font-size:15px;font-weight:600}
.mt-what svg{width:19px;height:19px}
.mt-hn{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;min-width:0;color:var(--muted);font-size:13.5px}
.mt-hn b{font-size:20px;font-weight:600;letter-spacing:-.03em;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.mt-chev{width:18px;height:18px;fill:none;stroke:var(--faint);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transform:rotate(-90deg);transition:transform var(--t) var(--ease)}
.mt-row.open .mt-chev{transform:none;stroke:var(--ink)}
.mt-detail{padding:4px 28px 26px}
.mt-scroll{overflow-x:auto}
.mt-dt th:first-child,.mt-dt td:first-child{padding-left:0}
.mt-dt td{height:46px}
.mt-note,.mt-none{margin-top:10px;color:var(--muted);font-size:13px}
.mt-detail .lx-btn{margin-top:14px}
.mt-sent{margin-left:auto}
/* agenda */
.mt-line{display:flex;gap:10px;align-items:stretch}
.mt-seg{flex:1 1 92px;min-width:0;display:grid;gap:2px;align-content:start}
.mt-seg i{display:block;height:10px;border-radius:999px;background:var(--ink);margin-bottom:14px}
.mt-seg.alt i{background:var(--slate)}
.mt-seg.lead i{background:var(--grad);box-shadow:0 6px 14px -6px rgba(255,100,30,.7)}
.mt-seg .at{font-size:12px;color:var(--faint);font-variant-numeric:tabular-nums}
.mt-seg .m{font-size:var(--num-m);font-weight:600;letter-spacing:-.04em;line-height:1.05;font-variant-numeric:tabular-nums}
.mt-seg .m small{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted);margin-left:4px}
.mt-seg b{font-size:14.5px;font-weight:600;letter-spacing:-.01em;margin-top:4px;white-space:nowrap}
.mt-seg .in{font-size:12.5px;color:var(--muted);line-height:1.35}
.mt-seg.lead .m{font-size:var(--num-m)}
.mt-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.mt-col{padding:0 36px;border-left:1px solid var(--line);display:grid;gap:22px;align-content:start;min-width:0}
.mt-col:first-child{border-left:0;padding-left:0}
.mt-col:last-child{padding-right:0}
.mt-col h2{margin:6px 0 0;font-size:var(--fs-section,17px);font-weight:600;letter-spacing:-.015em;line-height:var(--lh-head,1.25)}
.mt-step{display:flex;gap:14px;align-items:flex-start}
.mt-step .n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--bg-sunk);display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:600}
.mt-step b{display:block;font-size:15.5px;font-weight:500;letter-spacing:-.01em;line-height:1.35;padding-top:3px}
.mt-step small{display:block;font-size:13px;color:var(--muted);margin-top:2px}
.mt-ex{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:var(--r-tbl,12px);background:var(--band);font-size:13.5px;margin-top:4px}
.mt-ex b{font-weight:600}
.mt-ex small{display:block;color:var(--muted);font-size:12.5px}
.mt-faces{display:inline-flex;flex:none}
.mt-faces>*{margin-left:-8px;box-shadow:0 0 0 2px var(--band)}
.mt-faces>*:first-child{margin-left:0}
.mt-faces .no{display:inline-block;width:30px;height:30px;border-radius:50%;background:var(--bg-sunk);box-shadow:0 0 0 2px var(--band),inset 0 0 0 1.5px var(--line-strong)}
.mt-db{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--gap-4,16px)}
.mt-db a{display:grid;gap:4px;color:inherit;text-decoration:none;min-width:0;padding:16px 18px;border-radius:var(--r-tbl,12px);box-shadow:inset 0 0 0 1px var(--line)}
.mt-db a:hover{background:var(--row-hover)}
.mt-db .nm{font-size:15px;font-weight:600}
.mt-db .n{font-size:var(--num-l);font-weight:600;letter-spacing:-.04em;line-height:1.05;font-variant-numeric:tabular-nums}
.mt-db .n small{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted);margin-left:8px}
.mt-db .lx-gauge{margin-top:8px;max-width:260px}
.mt-db .ow{font-size:13px;color:var(--muted);margin-top:8px}
.mt-hero-act{display:flex;align-items:center;gap:18px;align-self:center;margin-left:auto}
@media (max-width:1040px){
  .mt-three{gap:28px}
  .mt-three .lx-kpi .v{font-size:var(--num-l)}.mt-three .lx-hero-num{font-size:var(--num-xl)}
  .mt-decide{grid-template-columns:minmax(0,1fr) auto;gap:28px}
  .mt-btns{grid-column:1/-1;grid-template-columns:1fr 1fr}
  .mt-row{grid-template-columns:190px minmax(0,1fr) auto 20px}
  .mt-seg.lead .m,.mt-seg .m{font-size:var(--num-m)}
  .mt-col{padding:0 22px}
  .mt-db{gap:28px}
}
@media (max-width:759px){
  .mt-page{gap:28px}
  .mt-sent{margin-left:0;white-space:normal}
  .mt-hero{padding:22px 18px;gap:24px}
  .mt-hero-top{flex-direction:column;gap:14px}
  .mt-vcard .mt-hero-top{align-items:flex-start;gap:12px}
  .mt-vcard .mt-hero-top>.lx-pill{order:-1;align-self:flex-start}
  .mt-vcard .mt-hero-top>.lx-sp{display:none}
  .mt-btns{grid-template-columns:1fr}
  .mt-quiet{text-align:left}
  .mt-hero p.mt-verdict{font-size:17px}
  .mt-three{grid-template-columns:1fr;gap:26px}
  .mt-three .lx-kpi .v{font-size:var(--num-l)}.mt-three .lx-hero-num{font-size:var(--num-xl)}
  .mt-panel{padding:20px 14px 14px}
  .mt-h .lx-legend{margin-left:0}
  .mt-decide{grid-template-columns:1fr;gap:22px;padding:22px 18px}
  .mt-decide h2{font-size:18px}
  .mt-bignum{padding-left:0;border-left:0;padding-top:18px;border-top:1px solid var(--line)}
  .mt-bignum .n{font-size:var(--num-l)}
  .mt-prom{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:4px 12px}
  .mt-prom .what{grid-column:2}
  .mt-prom .who{grid-column:2;grid-row:2;width:auto}
  .mt-prom .mt-tick{grid-column:3;grid-row:1/3;width:auto}
  .mt-row{grid-template-columns:minmax(0,1fr) 20px;gap:4px 12px;padding:14px 18px}
  .mt-row .mt-what{grid-column:1}
  .mt-row .mt-hn{grid-column:1;grid-row:2}
  .mt-row .lx-stat{grid-column:1;grid-row:3;white-space:normal}
  .mt-row .mt-chev{grid-column:2;grid-row:1/4}
  .mt-detail{padding:0 18px 20px}
  .mt-line{flex-direction:column;gap:16px}
  .mt-seg{flex:none!important;grid-template-columns:48px 76px minmax(0,1fr);gap:0 8px;align-items:baseline}
  .mt-seg i{grid-column:1/-1;height:8px;margin-bottom:8px;width:calc(18% + var(--min,3)*3.9%)}
  .mt-seg .m,.mt-seg.lead .m{font-size:var(--num-l)}
  .mt-seg b{margin-top:0;white-space:normal}
  .mt-seg .in{grid-column:3}
  .mt-seg .at,.mt-seg .m{grid-row:2/4}
  .mt-hero-act{margin-left:0;flex-wrap:wrap;gap:12px}
  .mt-cols{grid-template-columns:1fr;gap:30px}
  .mt-col,.mt-col:first-child,.mt-col:last-child{padding:0;border-left:0}
  .mt-col+.mt-col{padding-top:28px;border-top:1px solid var(--line)}
  .mt-db{grid-template-columns:1fr;gap:28px}
}`;
export function css() {
  addStyles('mt-css', CSS);
}
