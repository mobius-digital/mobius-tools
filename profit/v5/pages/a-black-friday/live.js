/* Black Friday > War Room (v3, one page). Shared by the agency page (a-black-friday/war-room.js, every brand) and the
   brand page (black-friday/war-room.js, one brand). The old Pace and Plan tabs are folded in: the routes still open
   this page (menu.js has one tab, so the router sends them here). The math is in ../_warcall.js; the client card is
   in ./_card.js.

   Top to bottom: the page help and one quiet toolbar (check-in time, Refresh, Check now, exports), the pace hero
   (sales so far against the goal, store MER against target, ad spend, the season timeline, today by the hour),
   Needs your yes (every pending decision, naming the campaign and the platform), one identical card per brand
   (decision, three store MER tiles, today by the hour, the campaigns table), then the plan as a table.

   Every live campaign gets its own call from three windows (Since last check-in, Today, This week), on its own ROAS
   (Triple Whale attributed, last click) against the campaign ROAS line (the brand's goal ROAS holds; break-even ROAS
   from the record, else goal ROAS / 1.25), with the store MER as the gate. MER is the whole store only.

   Reads (team, one at a time, never in parallel):
     ah       GET /api/standing                              the latest check-in (again every 10 minutes while visible)
     profit   GET /api/season?act=all|<id>                   answers.checkin_hours per brand (the check-in rhythm)
     ah       GET /api/activities?act=all|<id>&from=&limit=  the last budget change per campaign, and what we changed
     ah       GET /api/brands                                goal ROAS (target_roas) per brand, when the record has none
     ah       GET /api/standing?slot=<earlier>               the previous check-in, walked back hour by hour (max 12,
                                                             cached in sessionStorage by slot), after the first paint
     profit   GET /api/season/war?act=all                    the plan per brand (agency view), after the first paint
     profit   GET /api/season/war?act=<id>&live=1            today by the hour and the brand's plan and phases, after
                                                             the first paint, one brand after another
     profit   GET /api/hub/paid?platform=meta&act=<id>&model=fullFirstClick&cmp=none&from=<Monday>&to=<today>
                                                             the full picture per campaign, only when a campaign panel
                                                             opens, one request per brand per check-in (cached)
   A client (brand view only) reads only GET /api/season/war?act=<id>&live=1: the pace hero and the plan, no calls.
   Exports, all in the browser (./_export.js): the client card and the whole board as PNG or PDF.
   Writes (team only, each after a tap; sample mode never calls one):
     ah       POST /api/meta/write {act, kind:'budget', level:'campaign', object, amount, reason, client_why, dry:true}
              then the same body without dry, plus expect {daily_budget} from the dry run (and big:true over 50%)
     ah       POST /api/standing/approve {slot, act}         instead of the write, when the page's move equals the
                                                             check-in's own (same campaign and amount), so Slack fills in
     ah       POST /api/meta/undo {act, write}               Undo (through the shared confirm sheet)
     profit   PUT  /api/season/answer {act, key:'checkin_hours', value}   the brand's check-in rhythm
     ah       POST /api/standing/run {}                      Check now (a fresh record for every brand; no Slack)
     ah       POST /api/standing/send {act, slot}            Send the client update (one brand; a 404 means the route
                                                             is not live yet, and the page says so)
     profit   POST /api/snapshot {act, kind:'card', title, html, css, days:30}   the client card's public link */

import { APP_NAME, legacyUrl } from '../../config.js';
import { h, put, money, x, pill, button, card, empty, sheet, toast, addStyles, segmented, platformChip, lineChart, legend, table, tipShow, tipHide, tipRow } from '../../kit.js';
import { defined, defLabel, pageHelp } from '../../defs.js';
import { fixture } from '../../data.js';
import { undoSheet } from '../meta/_write.js';
import { forgetWaiting } from '../../bell.js';
import {
  CALL_WORD, CADENCE_CHOICES, MAX_STEP, MIN_BUDGET, READ_HOURS,
  BE_ROAS_DIV, brandCalls, cadenceOf, central, clientChanges, clientWhy, clockCT, dayLabel, hourWord, isDue, matchesCheckin,
  nextDue, sinceBasis, slotAdd, slotDate, slotDiff, slotHour, agoWords, parseBudget, stepTo, cadenceSuggest, mondayOf,
} from '../_warcall.js';
import { cardHtml, CARD_CSS, downloadCard, copyCard, downloadCardPdf } from './_card.js';
import { boardCanvas, copyCanvas, downloadCanvas, downloadPdf } from './_export.js';

const CSS = `
.wr3{display:grid;gap:var(--sp-6);min-width:0}
.wr3-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;min-width:0}
.wr3-bar .when{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr3-bar .when b{color:var(--ink);font-weight:600}
.wr3-bar .sp{flex:1}
.wr3-bar .btns{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.wr3-bar .lx-btn{min-height:34px}
.wr3-old{font-size:12.5px;color:var(--muted)}
.wr3-amber{margin:0;color:var(--warn);background:var(--warn-bg);border-radius:10px;padding:6px 10px;font-size:12.5px;line-height:1.45}
.wr3-quiet{margin:0;font-size:13px;color:var(--muted);line-height:1.5}
.wr3-lab{font-size:12.5px;color:var(--muted);line-height:1.35}
.wr3-num{font-variant-numeric:tabular-nums}
.good-t{color:var(--good)}.bad-t{color:var(--bad)}.warn-t{color:var(--warn)}.off-t{color:var(--muted)}
/* the pace hero */
.wr3-hero{display:grid;gap:var(--sp-6)}
.wr3-hk{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr) minmax(0,1fr);gap:var(--sp-6);align-items:end}
.wr3-hk>div{display:grid;gap:6px;min-width:0;align-content:end}
.wr3-hk .big{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.wr3-hk .scope{font-size:12px;color:var(--muted)}
.wr3-hk .of{font-size:13.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr3-hk .mid{font-size:30px;font-weight:600;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums}
.wr3-hk .mid small{font-size:13px;font-weight:400;letter-spacing:0;color:var(--muted);margin-left:6px}
.wr3-prog{position:relative;height:8px;border-radius:999px;background:var(--bg-sunk);overflow:hidden}
.wr3-prog i{position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);border-radius:999px;background:var(--grad)}
.wr3-ph{display:grid;grid-template-columns:var(--cols);gap:4px;min-width:0}
.wr3-ph>button{display:grid;gap:6px;min-width:0;padding:4px 2px;border:0;background:none;text-align:left;cursor:default;border-radius:8px}
.wr3-ph>button:hover,.wr3-ph>button:focus-visible{background:var(--row-hover)}
.wr3-ph i{display:block;height:6px;border-radius:999px;background:var(--bg-sunk);position:relative}
.wr3-ph .done i{background:var(--faint);opacity:.45}
.wr3-ph .now i::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,50%);background:var(--ink);border-radius:999px}
.wr3-ph .now i::before{content:"";position:absolute;left:var(--v,50%);top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:var(--ink);box-shadow:0 0 0 1.5px var(--surface);z-index:1}
.wr3-ph b,.wr3-ph span{line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wr3-ph b{font-size:13.5px;font-weight:500;color:var(--muted)}
.wr3-ph .now b{color:var(--ink);font-weight:600}
.wr3-ph span{font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr3-ch{display:grid;gap:8px;min-width:0}
.wr3-ch .lx-chart-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 14px}
.wr3-ch h3{font-size:15px;font-weight:600;letter-spacing:-.01em;margin:0}
/* needs your yes */
.wr3-need{display:grid}
.wr3-ask{display:grid;gap:6px;padding:14px 0;border-top:1px solid var(--line);min-width:0}
.wr3-ask:first-child{border-top:0;padding-top:4px}
.wr3-ask .br{font-size:12.5px;font-weight:600;color:var(--muted);letter-spacing:.01em}
.wr3-ask .dec{font-size:15.5px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
.wr3-ask .why{margin:0;font-size:13px;color:var(--ink-2);line-height:1.5}
.wr3-chips{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr3-chips b{color:var(--ink);font-weight:600;margin-left:4px}
.wr3-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wr3-act .lx-btn{min-height:40px}
/* brand cards: one style for every brand */
.wr3-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-5);align-items:start}
.wr3-grid.one{grid-template-columns:minmax(0,1fr)}
.wr3-b{position:relative;display:grid;gap:var(--sp-4);min-width:0;overflow:hidden}
.wr3-b.yes::before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:var(--watch)}
.wr3-r1{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;min-width:0}
.wr3-r1 .tg{font-size:12.5px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
.wr3-r1 .tg b{color:var(--ink);font-weight:600}
.wr3-r1 .nm{font-size:19px;font-weight:650;letter-spacing:-.02em;flex:1 1 180px;min-width:0;overflow-wrap:break-word}
.wr3-r1 .nm a{color:inherit;text-decoration:none}.wr3-r1 .nm a:hover{text-decoration:underline}
.wr3-chip{display:inline-flex;align-items:center;gap:6px;min-height:30px;padding:0 10px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface);font:inherit;font-size:12.5px;color:var(--ink-2);cursor:pointer;white-space:nowrap}
.wr3-chip[disabled]{cursor:default}
.wr3-chip.due{border-color:transparent;background:var(--warn-bg);color:var(--warn)}
.wr3-r2{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;min-width:0}
.wr3-r2 .dec{font-size:15px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere;flex:1 1 220px}
.wr3-r2 .dec.dim{color:var(--muted);font-weight:500}
.wr3-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.wr3-tile{background:var(--surface-2);border-radius:14px;padding:10px 12px 12px;display:grid;gap:2px;align-content:start;min-width:0}
.wr3-tile .hd{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);line-height:1.3;margin-bottom:4px}
.wr3-tile .hd .lx-def{text-transform:uppercase}
.wr3-tile .k{font-size:12px;color:var(--muted)}
.wr3-tile .mer{font-size:24px;font-weight:650;letter-spacing:-.03em;line-height:1.15;font-variant-numeric:tabular-nums}
.wr3-tile .mer small{font-size:12px;font-weight:400;letter-spacing:0;color:var(--muted);margin-left:4px}
.wr3-tile .ln{display:flex;justify-content:space-between;gap:6px;font-size:12px;color:var(--ink-2);font-variant-numeric:tabular-nums;white-space:nowrap}
.wr3-tile .ln span:first-child{color:var(--muted)}
.wr3-tile .gray{font-size:11.5px;color:var(--muted);margin-top:2px}
.wr3-spark{display:grid;gap:4px;min-width:0}
.wr3-ct .lx-table th{white-space:normal;line-height:1.25;height:auto;padding:6px 4px;vertical-align:bottom;font-size:10px;letter-spacing:.04em}
.wr3-ct .lx-table td{white-space:nowrap;padding:8px 4px;font-size:12.5px}
.wr3-ct .lx-table td:first-child{white-space:normal}
.wr3-ct .lx-table th:first-child,.wr3-ct .lx-table td:first-child{padding-left:0}
.wr3-ct .lx-table th:last-child,.wr3-ct .lx-table td:last-child{padding-right:0}
.wr3-ct .cn{display:flex;align-items:flex-start;gap:6px;font-weight:600;min-width:96px}
.wr3-ct .cn .lx-plat{font-weight:400}
.wr3-ct .bud small{display:block;font-size:11px;color:var(--muted)}
.wr3-ct .lx-pill{white-space:nowrap}
.wr3-ct .cn small{display:block;font-weight:400;font-size:11.5px;color:var(--muted)}
.wr3-ct .callc{display:inline-flex;flex-direction:column;align-items:flex-end;gap:4px;min-width:74px}
.wr3-ct .rowbtn{border:0;background:none;padding:2px 0;font:inherit;font-size:12px;color:var(--ink-2);text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px;cursor:pointer;white-space:nowrap}
.wr3-ct .rowbtn:hover{color:var(--ink)}
.wr3-ct .warnrow{display:block;font-size:11.5px;color:var(--warn);font-weight:400;margin-top:2px}
.wr3-foot{display:flex;flex-wrap:wrap;gap:8px}
.wr3-foot .lx-btn{min-height:40px}
/* sheets */
.wr3-sh{display:grid;gap:var(--sp-4)}
.wr3-sh .call{display:grid;gap:4px}
.wr3-sh .call b{font-size:17px;letter-spacing:-.015em}
.wr3-sh h4{margin:0;font-size:14px;font-weight:650;letter-spacing:-.01em}
.wr3-sh dl{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:8px 14px;margin:0;font-size:13.5px}
.wr3-sh dt{color:var(--muted);overflow-wrap:anywhere}
.wr3-sh dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;text-align:right}
.wr3-sh dd.na{font-weight:400;color:var(--muted)}
.wr3-sh p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.wr3-sh p.dim{color:var(--muted);font-size:12.5px}
.wr3-sh label{display:grid;gap:6px;font-size:13px;color:var(--muted)}
.wr3-sh .lx-input{font-size:15px;color:var(--ink)}
.wr3-sh textarea.lx-input{min-height:72px}
.wr3-sh .tick{display:flex;gap:10px;align-items:center;color:var(--ink);min-height:44px}
.wr3-sh .tick input{width:22px;height:22px}
.wr3-sh .btns{display:flex;flex-wrap:wrap;gap:8px}
.wr3-sh .btns .lx-btn{min-height:48px;flex:1 1 180px}
.wr3-sh .err{background:var(--bad-bg);color:var(--bad);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.45}
.wr3-sh .ok{background:var(--good-bg);color:var(--good);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.45}
.wr3-sh .info{background:var(--surface-2);color:var(--ink-2);border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.45}
.wr3-sh .hint{font-size:12.5px;color:var(--muted)}
.wr3-sh .sec{display:grid;gap:10px;border-top:1px solid var(--line);padding-top:var(--sp-4)}
.wr3-fun{display:grid;gap:8px}
.wr3-fun>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;align-items:baseline;font-size:13px}
.wr3-fun>div>i{grid-column:1/-1;height:10px;border-radius:999px;background:var(--bg-sunk);position:relative;overflow:hidden;display:block}
.wr3-fun>div>i::after{content:"";position:absolute;left:0;top:0;bottom:0;width:var(--v,0%);border-radius:999px;background:var(--slate)}
.wr3-fun>div:last-child>i::after{background:var(--ink)}
.wr3-fun b{font-variant-numeric:tabular-nums;font-weight:600}
.wr3-fun small{color:var(--muted);font-size:11.5px;margin-left:6px}
.wr3-msg{white-space:pre-line;background:var(--surface-2);border-radius:12px;padding:12px 14px;font-size:13.5px;line-height:1.5;color:var(--ink)}
.wr3-cu{display:grid;gap:var(--sp-4);min-width:0}
.wr3-cu .wcc{max-width:100%}
@media (max-width:1100px){.wr3-grid{grid-template-columns:minmax(0,1fr)}}
@media (max-width:900px){.wr3-hk{grid-template-columns:1fr 1fr}.wr3-hk>:first-child{grid-column:1/-1}}
@media (max-width:759px){
  .wr3-bar .btns{width:100%}
  .wr3-bar .btns .lx-btn{flex:1 1 auto;min-height:44px}
  .wr3-act .lx-btn,.wr3-foot .lx-btn{flex:1 1 auto;min-height:44px}
  .wr3-ph{grid-template-columns:1fr 1fr;gap:12px 10px}
  .wr3-hk .mid{font-size:26px}
}
@media (max-width:520px){
  .wr3-tiles{grid-template-columns:1fr}
  .wr3-tile{grid-template-columns:auto minmax(0,1fr);column-gap:18px;align-items:center}
  .wr3-tile .hd{grid-column:1/-1}
  .wr3-tile .k,.wr3-tile .ln,.wr3-tile .gray{grid-column:2}
  .wr3-tile .mer{grid-column:1;grid-row:2/span 3;min-width:78px}
  .wr3-sh dl{grid-template-columns:minmax(0,1fr) auto}
}`;

const ok = n => n != null && isFinite(n);
const SAMPLE_MSG = 'Sample: nothing was changed';
const LIGHT = { green: ['good', 'Store MER over goal'], amber: ['warn', 'Store MER not clear'], red: ['bad', 'Store MER under break-even'] };
const CALL_TONE = { raise50: 'good', raise25: 'good', cut: 'bad', putback: 'bad', hold: '' };
const CALL_KEY = { raise50: 'call_raise', raise25: 'call_raise', cut: 'call_cut', putback: 'call_cut', hold: 'call_hold' };
const fx = v => ok(v) ? v.toFixed(2) + 'x' : 'n/a';
const usd = v => ok(v) ? money(v) : 'n/a';
const PLATFORM = 'Meta';           // every campaign in the check-in record is a Meta campaign
const SEND_TIMEOUT = 20e3;

/* The season's phases, for the agency view (a brand's own phases come from its plan read). */
const SEASON = [
  { name: 'Early Black Friday', start: '2026-11-01', end: '2026-11-25', weight: 3 },
  { name: 'Black Friday', start: '2026-11-26', end: '2026-11-29', weight: 4 },
  { name: 'Cyber Monday', start: '2026-11-30', end: '2026-11-30', weight: 2.4 },
  { name: 'Holiday', start: '2026-12-01', end: '2026-12-17', weight: 3 },
];
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
const md = ymd => dayLabel(ymd).replace(/^\w+ /, '');

/** Who may tap: the team, never a client or a read only viewer. The worker refuses viewers too. */
export function canWrite(ctx) {
  const me = ctx.me || {};
  return !ctx.isClient && me.role !== 'viewer' && me.access !== 'viewer' && !me.viewer;
}
const oneBrand = ctx => (ctx.view === 'brand' && ctx.brand ? ctx.brand.id : null);
const errText = e => (e && e.message) || 'The server did not answer.';
const STEP_PCT = { raise50: 0.5, raise25: 0.25, cut: -0.25 };

/** The last day of Change Log rows for one brand or all (team only). */
async function readActs(ctx, one) {
  const from = new Date(Date.now() - 24 * 3600e3).toISOString().slice(0, 19);
  const a = await ctx.api(`/api/activities?act=${encodeURIComponent(one || 'all')}&from=${from}&limit=500`, { worker: 'ah', signal: ctx.signal });
  return (a && a.rows) || [];
}

/** Goal ROAS (target_roas) and break-even ROAS per brand from the brand list (team only). Throws when it cannot read. */
async function readGoals(ctx) {
  const bl = await ctx.api('/api/brands', { worker: 'ah', signal: ctx.signal });
  const goals = {};
  for (const b of (bl && bl.brands) || []) goals[b.id] = { target_roas: +b.target_roas > 0 ? +b.target_roas : null, be_roas: +(b.be_roas ?? b.break_even_roas) > 0 ? +(b.be_roas ?? b.break_even_roas) : null };
  return goals;
}

/* ---------- reads ---------- */
const SS = 'wr2:rec:';
function cacheGet(slot) { try { const v = sessionStorage.getItem(SS + slot); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } }
function cachePut(slot, rec) { try { sessionStorage.setItem(SS + slot, JSON.stringify(rec)); } catch {} }

/** The first read: the latest check-in, the cadence answers and the last day of changes, one after another.
    A client reads only the brand's plan and today by the hour. */
export async function readStanding(ctx) {
  const one = oneBrand(ctx);
  if (ctx.sample) {
    const f = await fixture('a-black-friday/_sample/war-room.json');
    const slot = f.latest;
    if (ctx.isClient) return { sample: f, client: true, war: one ? (f.war_live || {})[one] || null : null, fetched_at: Date.now() };
    return { sample: f, standing: f.records[slot] || null, answers: f.answers || {}, acts: f.activities || [], goals: f.goals || {}, fetched_at: Date.now() };
  }
  if (ctx.isClient) {
    if (!one) return { client: true, war: null, fetched_at: Date.now() };
    const war = await ctx.api('/api/season/war?act=' + encodeURIComponent(one) + '&live=1', { signal: ctx.signal });
    return { client: true, war: war || null, fetched_at: Date.now() };
  }
  const r = await ctx.api('/api/standing', { worker: 'ah', signal: ctx.signal });
  const standing = (r && r.standing) || null;
  const out = { standing, answers: {}, acts: [], goals: {}, fetched_at: Date.now() };
  if (!standing) return out;
  try {
    const s = await ctx.api('/api/season?act=' + encodeURIComponent(one || 'all'), { signal: ctx.signal });
    for (const a of (s && s.accounts) || []) out.answers[a.act_id] = a.answers || {};
  } catch (e) { if (e && e.name === 'AbortError') throw e; out.season_error = errText(e); }
  try {
    out.acts = await readActs(ctx, one);
  } catch (e) { if (e && e.name === 'AbortError') throw e; out.acts_error = errText(e); }
  /* the campaign ROAS line: goal ROAS from the brand list, used when the check-in record carries none */
  try { out.goals = await readGoals(ctx); }
  catch (e) { if (e && e.name === 'AbortError') throw e; out.goals_error = errText(e); }
  return out;
}

/* ---------- small shared drawing parts ---------- */
/** The hours of one war read: [{ hour, sales, spend }] for 0..23. */
const hoursOf = w => ((w && w.live && Array.isArray(w.live.hours)) ? w.live.hours : []);
/** Sum the hours of several reads, cut at the last hour with sales or spend. null when there is nothing. */
function hourSeries(list) {
  const sales = Array(24).fill(0), spend = Array(24).fill(0);
  let last = -1;
  for (const w of list) for (const r of hoursOf(w)) {
    const k = +r.hour; if (!(k >= 0 && k < 24)) continue;
    sales[k] += +r.sales || 0; spend[k] += +r.spend || 0;
    if ((+r.sales || 0) > 0 || (+r.spend || 0) > 0) last = Math.max(last, k);
  }
  if (last < 0) return null;
  return { sales: sales.slice(0, last + 1), spend: spend.slice(0, last + 1) };
}
/** Today by the hour: sales as columns, ad spend as a line, a bubble per hour with both and the hour's MER. */
function hourChart(hs, { height = 240, phoneHeight = 200, axis = true, label = 'Sales and ad spend by the hour today, Central time', ticks } = {}) {
  const n = hs.sales.length;
  const labels = Array.from({ length: n }, (_, i) => hourWord(i));
  const tip = i => [h('div', { class: 'lx-tip-h' }, `${hourWord(i)} to ${hourWord(i + 1)} CT`),
    tipRow('ink', 'Sales', money(hs.sales[i] || 0)), tipRow('slate', 'Ad spend', money(hs.spend[i] || 0)),
    tipRow(null, 'Store MER this hour', hs.spend[i] > 0 ? fx(hs.sales[i] / hs.spend[i]) : 'n/a')];
  return lineChart({
    series: [{ name: 'Sales', type: 'bar', values: hs.sales }, { name: 'Ad spend', values: hs.spend, end: false }],
    labels, ticks, slots: true, height, phoneHeight, axis, barWidth: axis ? 22 : 10, yTicks: axis ? undefined : 2, endLabels: false, fill: false, label,
    format: v => money(v, { compact: true }), tooltip: tip,
  });
}
const hourLegend = () => legend([{ name: 'Sales', square: true, color: 'var(--ink)' }, { name: 'Ad spend' }]);

/** The season timeline. A phase shows its dates and offer in the bubble (hover, focus or tap). */
function phaseStrip(phases, today) {
  if (!phases || !phases.length) return null;
  let lit = false;
  const list = phases.map(p => {
    const range = p.start === p.end ? md(p.start) : `${md(p.start)} to ${md(p.end)}`;
    if (today > p.end) return { ...p, state: 'done', sub: 'Done' };
    if (today >= p.start && !lit) {
      lit = true;
      const n = daysBetween(p.start, p.end) + 1, d = daysBetween(p.start, today) + 1;
      return { ...p, state: 'now', progress: Math.min(1, (d - 0.5) / n), sub: n > 1 ? `Today, day ${d} of ${n}` : 'Today' , range };
    }
    return { ...p, state: '', sub: range, range };
  }).map(p => ({ ...p, range: p.range || (p.start === p.end ? md(p.start) : `${md(p.start)} to ${md(p.end)}`) }));
  const cols = list.map(p => (p.weight || Math.max(1.6, Math.min(4, daysBetween(p.start, p.end) / 4 + 1.6))) + 'fr').join(' ');
  return h('div', { class: 'wr3-ph', style: { '--cols': cols }, role: 'list', 'aria-label': 'The season' },
    list.map(p => {
      const b = h('button', { type: 'button', role: 'listitem', class: p.state || '', style: p.state === 'now' ? { '--v': Math.round((p.progress ?? 0.5) * 100) + '%' } : null,
        'aria-label': `${p.name}: ${p.range}${p.state === 'now' ? ', on now' : p.state === 'done' ? ', done' : ''}${p.offer ? '. ' + p.offer : ''}` },
        h('i'), h('b', null, p.name), h('span', null, p.sub));
      const show = () => tipShow(b, [h('div', { class: 'lx-tip-h' }, p.name), tipRow(null, 'Dates', p.range), p.state === 'now' ? tipRow(null, 'Now', p.sub) : null, p.offer ? tipRow(null, 'Offer', p.offer) : null].filter(Boolean), b, 8);
      b.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(); });
      b.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') tipHide(b); });
      b.addEventListener('focus', show); b.addEventListener('blur', () => tipHide(b));
      b.addEventListener('click', show);
      return b;
    }));
}
/** A brand's own phases from its plan read (Early Black Friday to Holiday), or null. */
function phasesOfWar(w) {
  const list = ((w && w.phases) || []).filter(p => p.start && p.end && p.status !== 'missing' && p.status !== 'skip' && ['nov', 'bf', 'dec'].includes(p.grp || 'bf'));
  return list.length ? list.slice(0, 5).map(p => ({ name: p.name, start: p.start, end: p.end, offer: p.offer || '' })) : null;
}

/** The hero: sales so far against the goal, store MER against target, ad spend, the season, today by the hour. */
function paceHero(m) {
  const pctOf = ok(m.sales) && ok(m.goal) && m.goal > 0 ? m.sales / m.goal : null;
  const merTone = !ok(m.mer) || !ok(m.target) ? '' : m.mer >= m.target ? 'good-t' : ok(m.be) && m.mer < m.be ? 'bad-t' : 'warn-t';
  const salesBox = h('div', null,
    h('span', { class: 'wr3-lab' }, defLabel('Sales', 'sales'), `, ${m.period}`),
    m.scope ? h('span', { class: 'scope' }, m.scope) : null,
    ok(m.sales) ? h('div', { class: 'big' }, h('span', { class: 'lx-hero-num' }, money(Math.round(m.sales))),
      h('span', { class: 'of' }, ok(m.goal) && m.goal > 0 ? `of the ${money(m.goal)} sales goal${ok(pctOf) ? `, ${Math.round(pctOf * 100)}%` : ''}` : 'no sales goal set'))
      : h('div', { class: 'big' }, h('span', { class: 'of' }, m.none || 'No sales read yet')),
    ok(pctOf) ? h('div', { class: 'wr3-prog', role: 'img', 'aria-label': Math.round(pctOf * 100) + '% of the sales goal' }, h('i', { style: { '--v': Math.min(100, pctOf * 100).toFixed(1) + '%' } })) : null);
  const merBox = h('div', null,
    h('span', { class: 'wr3-lab' }, defLabel('Store MER', 'mer'), ', same period'),
    h('div', { class: 'mid ' + merTone }, fx(m.mer), ok(m.target) ? h('small', null, defLabel('target', 'target_mer'), ' ' + fx(m.target)) : null));
  const spendBox = h('div', null,
    h('span', { class: 'wr3-lab' }, defLabel('Ad spend', 'ad_spend'), ', same period'),
    h('div', { class: 'mid' }, usd(m.spend)));
  const hs = m.hours;
  const chart = h('div', { class: 'wr3-ch' },
    h('div', { class: 'lx-chart-h' }, h('h3', null, defLabel('Today', 'today'), ' by the hour'), h('span', { class: 'wr3-lab' }, m.hourScope || ''), hs ? hourLegend() : null),
    hs ? hourChart(hs, { height: 240, phoneHeight: 200 }) : h('p', { class: 'wr3-quiet' }, m.hourNote || 'No sales or spend yet today.'),
    hs && m.hourNote ? h('p', { class: 'wr3-quiet' }, m.hourNote) : null);
  return card({ class: 'wr3-hero' },
    h('div', { class: 'wr3-hk' }, salesBox, merBox, spendBox),
    phaseStrip(m.phases, m.today),
    chart);
}

/** One row per brand: Brand | Offer | Sale dates | Sales goal | Target MER | Plan status | Edit plan. */
function planTable(rows, { team, waiting, hrefOf }) {
  const dim = t => h('span', { class: 'dim' }, t);
  const cols = [
    { key: 'name', label: 'Brand', render: r => h('span', { class: 'name' }, hrefOf && hrefOf(r.act_id) ? h('a', { href: hrefOf(r.act_id) }, r.name) : r.name) },
    { key: 'offer', label: 'Black Friday offer', render: r => r.offer ? h('span', { style: { whiteSpace: 'normal', display: 'block', minWidth: '140px' } }, r.offer) : waiting ? dim('Reading...') : dim('No offer written yet') },
    { key: 'sale', label: 'Sale dates', class: 'hide-sm', render: r => r.sale && r.sale.start ? `${md(r.sale.start)} to ${md(r.sale.end || r.sale.start)}` : waiting ? dim('Reading...') : dim('not set') },
    { key: 'goal', label: defLabel('Sales goal', { title: 'Sales goal', body: 'The store sales the plan aims for over the whole sale, in dollars. Sales are Triple Whale: every store order, before refunds.' }), num: true, render: r => ok(r.goal) && r.goal > 0 ? h('span', { class: 'strong' }, money(r.goal)) : dim('not set') },
    { key: 'target', label: defLabel('Target MER', 'target_mer'), num: true, class: 'hide-sm', render: r => ok(r.target) ? fx(r.target) + ' target' : dim('not set') },
    { key: 'status', label: defLabel('Plan status', { title: 'Plan status', body: 'Ready when the goals, the raise, hold and cut lines and the offers and dates are all set. Otherwise the first open step is named.' }), render: r => {
      if (!r.steps) return waiting ? dim('Reading...') : dim('not read');
      const open = r.steps.find(s => !s.done);
      return open ? h('span', { class: 'lx-stat warn' }, 'Open: ' + String(open.label || '').toLowerCase()) : h('span', { class: 'lx-stat good' }, `Ready, ${r.steps.length} of ${r.steps.length} steps`);
    } },
  ];
  if (team) cols.push({ key: 'edit', label: '', num: true, render: r => button('Edit plan', { href: legacyUrl('warplan', r.act_id), aria: `Edit the ${r.name} plan in old ${APP_NAME}` }) });
  return table({ cols, rows, roomy: true, empty: 'No brand has a Black Friday plan yet' });
}

/* ---------- the page ---------- */
export function renderWarRoom(el, data, ctx, { one = null } = {}) {
  addStyles('wr3-css', CSS);
  addStyles('wcc-css', CARD_CSS);
  if (data && data.client) return renderClient(el, data, ctx);
  const write = canWrite(ctx);
  /* The router hands every page the same view element and can render this page twice (saved copy, then fresh), so
     each render owns a token: an older render, or one whose route was left, stops drawing, probing and polling. */
  const token = Symbol('war-room');
  el.__wr = token;
  const alive = () => el.__wr === token && !(ctx.signal && ctx.signal.aborted);
  const S = {
    data: data || {}, prevs: {}, records: [], probing: true, probeFails: 0, probeId: 0,
    done: {}, links: {}, linkBusy: {}, hourCache: {}, hourErr: {}, picture: {}, sent: {},
    warAll: null, warAllErr: '', warBusy: true,
  };
  const hosts = { hero: null, plan: null, sparks: {} };
  /* Done is per check-in: a new check-in asks again */
  const doneKey = (act, id) => `${(rec() && rec().slot) || ''}|${act}|${id}`;
  const f = () => S.data.sample || null;

  /* the record and clock this page judges on */
  const rec = () => S.data.standing;
  const nowOf = () => ctx.sample && rec() ? Date.parse(rec().at) + 40 * 60e3 : Date.now();
  const cadOf = act => cadenceOf(S.data.answers && S.data.answers[act]);

  async function getRecord(slot) {
    if (ctx.sample) return (f() && f().records[slot]) || null;
    const c = cacheGet(slot);
    if (c !== undefined) return c;
    let r = null;
    try { const j = await ctx.api('/api/standing?slot=' + encodeURIComponent(slot), { worker: 'ah', signal: ctx.signal }); r = (j && j.standing) || null; }
    catch { S.probeFails++; return null; }                         // not cached: try again next open
    cachePut(slot, r);
    return r;
  }
  /** Walk back hour by hour for each brand's previous check-in (newest record at least cadence minus 1 hour older). */
  async function probe() {
    const R = rec();
    const id = ++S.probeId;
    if (!R || !alive()) { S.probing = false; return; }
    S.probing = true; S.prevs = {}; S.records = [R]; S.probeFails = 0;
    const acts = (R.brands || []).filter(b => !one || b.act_id === one).map(b => b.act_id);
    const need = new Set(acts);
    for (let i = 1; i <= 12 && need.size; i++) {
      const slot = slotAdd(R.slot, -i);
      const r = await getRecord(slot);
      if (id !== S.probeId || !alive()) return;
      if (!r) continue;
      S.records.push(r);
      for (const act of [...need]) {
        if (slotDiff(R.slot, r.slot) >= cadOf(act) - 1 && (r.brands || []).some(b => b.act_id === act)) { S.prevs[act] = r; need.delete(act); }
      }
    }
    S.probing = false;
    draw();
  }

  /* ---------- the plan and today by the hour (after the first paint, one read after another) ---------- */
  async function readWarOne(act) {
    if (S.hourCache[act]) return S.hourCache[act];
    if (ctx.sample) { const w = (f() && f().war_live && f().war_live[act]) || { live: { hours: [] } }; S.hourCache[act] = w; return w; }
    const w = await ctx.api('/api/season/war?act=' + encodeURIComponent(act) + '&live=1', { signal: ctx.signal });
    S.hourCache[act] = w || {};
    return S.hourCache[act];
  }
  async function readWar() {
    const R = rec();
    if (!R) { S.warBusy = false; return; }
    const acts = (R.brands || []).filter(b => !one || b.act_id === one).map(b => b.act_id);
    if (!one) {
      try {
        S.warAll = ctx.sample ? (f() && f().war_all) || null : await ctx.api('/api/season/war?act=all', { signal: ctx.signal });
      } catch (e) { if (e && e.name === 'AbortError') return; S.warAllErr = errText(e); }
      if (!alive()) return;
      fillLate();
    }
    for (const act of acts) {
      try { await readWarOne(act); }
      catch (e) { if (e && e.name === 'AbortError') return; S.hourErr[act] = errText(e); }
      if (!alive()) return;
      fillLate();
    }
    S.warBusy = false;
    if (alive()) fillLate();
  }

  /* ---------- the calls per brand ---------- */
  function calcAll() {
    const R = rec(), now = nowOf(), recHour = central(Date.parse(R.at)).hour;
    const recDate = R.today || slotDate(R.slot);
    let list = [...(R.brands || [])];
    if (one) list = list.filter(b => b.act_id === one);
    return list.map(b => {
      const pr = S.prevs[b.act_id] || null;
      const prv = pr ? (pr.brands || []).find(x => x.act_id === b.act_id) || null : null;
      const basis = pr ? sinceBasis(R.slot, pr.slot) : null;
      const acts = (S.data.acts || []).filter(a => !a.act_id || a.act_id === b.act_id);
      const records = S.records.map(r => ({ slot: r.slot, at: r.at, brand: (r.brands || []).find(x => x.act_id === b.act_id) || null }));
      const g = (S.data.goals && S.data.goals[b.act_id]) || {};
      const c = brandCalls({ cur: { ...b, slot: R.slot }, prv, basis, acts, records, now, recDate, recHour, cadence: cadOf(b.act_id),
        roas_goal: b.target_roas ?? b.goal_roas ?? g.target_roas ?? null, roas_be: b.be_roas ?? b.break_even_roas ?? g.be_roas ?? null,
        goal_unread: !!S.data.goals_error });
      c.b = b; c.prvRec = pr; c.basis = basis; c.recHour = recHour;
      const ap = R.approved && R.approved[b.act_id], apCamp = b.meta && b.meta.camp;
      for (const cp of c.camps) {
        const d = S.done[doneKey(b.act_id, cp.id)];
        if (d) cp.done = d;
        else if (ap && apCamp && String(apCamp.id) === cp.id) cp.done = { from: ap.from, to: ap.to, by: ap.by || 'the Slack check-in', at: ap.at, write: ap.write || null, slack: true };
        cp.dismissed = notNow(R.slot, cp.id);
        cp.slack = matchesCheckin(b, cp);
      }
      return c;
    });
  }

  /* ---------- Not now (per viewer, per check-in) ---------- */
  const NN = (slot, id) => `wr2-notnow:${slot}:${id}`;
  function notNow(slot, id) { try { return localStorage.getItem(NN(slot, id)) === '1'; } catch { return false; } }
  function setNotNow(slot, id) { try { localStorage.setItem(NN(slot, id), '1'); } catch {} }

  /* ---------- words ---------- */
  const merTone = (mer, c) => !ok(mer) || !ok(c.goal) ? '' : mer >= c.goal ? 'good' : ok(c.be) && mer < c.be ? 'bad' : 'warn';
  const roasTone = (w, c) => !w || !w.readable || !c.roas || !ok(c.roas.goal) ? '' : w.roas >= c.roas.goal ? 'good' : ok(c.roas.be) && w.roas < c.roas.be ? 'bad' : '';
  const tcls = t => t ? t + '-t' : null;
  const roasTxt = w => !w ? (S.probing ? '...' : 'n/a') : w.readable ? fx(w.roas) : w.no_tw ? 'no TW' : 'too little';
  const sinceWord = c => c.basis ? c.basis.short : null;
  /** "Raise BFCM 2026 (Meta) budget 50%: $750 to $1,125 a day" */
  function decisionText(cp) {
    const m = cp.move, pc = Math.abs(Math.round(m.pct * 100));
    if (cp.call === 'putback') return `Put back ${cp.name} (${PLATFORM}) budget: ${money(m.from)} to ${money(m.to)} a day`;
    return `${m.to > m.from ? 'Raise' : 'Cut'} ${cp.name} (${PLATFORM}) budget ${pc}%: ${money(m.from)} to ${money(m.to)} a day`;
  }
  const doneText = cp => `Done: ${cp.name} (${PLATFORM}) is now ${money(cp.done.to)} a day, by ${cp.done.by}`;
  /** The call word for a row's pill. Short, so the table stays readable. */
  function callWord(c, cp) {
    if (cp.done) return 'Done';
    if (cp.move && S.probing) return 'Reading';
    if (cp.move) return CALL_WORD[cp.call];
    if (c.mode !== 'live' || !c.gate.light) return 'Numbers';
    if (cp.early) return 'Too early';
    return CALL_WORD[cp.call] || 'Hold';
  }
  const callKey = cp => cp.done ? null : cp.early ? 'call_too_early' : CALL_KEY[cp.call] || 'call_hold';
  const assumedWhy = r => r.reason === 'over_goal' ? `assumed as goal ROAS / ${BE_ROAS_DIV}, because the ${fx(r.rec)} on record is over the goal` : `assumed as goal ROAS / ${BE_ROAS_DIV}, none on record`;
  /** Who owns the budget on this brand, said in the budget sheets (watch: the client runs it; client_approve: the client says yes first). */
  const ownerNote = c => c.mode === 'watch' ? 'The client runs this budget. Change it only when the client asked you to.'
    : c.b && c.b.client_approve ? 'The client approves budget changes on this brand. Change it only after the client said yes in Slack.' : '';
  function modeLine(c) {
    const b = c.b;
    if (c.mode === 'watch') return 'Updates only: the client runs this budget';
    if (c.mode === 'no_sales') return 'No Triple Whale store connected: spend against budget only';
    if (c.mode === 'plan') return 'The sale has not started: numbers only';
    if (c.mode === 'after') return 'The sale has ended: numbers only';
    if (c.mode === 'error') return 'No live numbers: ' + (b.error || 'Triple Whale did not answer');
    if (c.mode === 'meta_error') return 'Meta did not answer: ' + ((b.meta && b.meta.error) || 'try Refresh');
    return '';
  }
  const ageH = () => (nowOf() - Date.parse(rec().at)) / 3600e3;
  const hasSuggestion = (c, cp) => !!(cp.move && !cp.done && !cp.dismissed && !S.probing && c.mode === 'live');
  const pendingOf = c => c.camps.filter(cp => hasSuggestion(c, cp) && !cp.abo);
  /** A reason line only when it adds something the numbers do not show: a warning, a cap, who approves. */
  const extraWhy = cp => [cp.warn, ...(cp.notes || [])].filter(Boolean).join(' ');

  /* ---------- the brand card ---------- */
  function tile(w, c, label, key, emptyText) {
    const hd = h('span', { class: 'hd' }, defLabel(label, key));
    if (!w) return h('div', { class: 'wr3-tile' }, hd, h('span', { class: 'mer off-t' }, '...'), h('span', { class: 'gray' }, emptyText));
    const noSales = c.mode === 'no_sales';
    const tone = w.readable && !noSales ? merTone(w.mer, c) : 'off';
    return h('div', { class: 'wr3-tile' }, hd,
      noSales ? h('span', { class: 'k' }, defLabel('Ad spend', 'ad_spend')) : h('span', { class: 'k' }, defLabel('Store MER', 'mer')),
      h('span', { class: 'mer ' + (tone ? tone + '-t' : '') }, noSales ? usd(w.spend) : fx(w.mer)),
      noSales ? null : h('span', { class: 'ln' }, defLabel('Sales', 'sales'), h('span', null, usd(w.sales))),
      noSales ? null : h('span', { class: 'ln' }, defLabel('Ad spend', 'ad_spend'), h('span', null, usd(w.spend))),
      !w.readable ? h('span', { class: 'gray' }, 'Too little spend to read') : w.synced ? h('span', { class: 'gray' }, "Yesterday's part is from the nightly sync") : null);
  }
  function sparkFor(c) {
    const host = h('div', { class: 'wr3-spark' });
    hosts.sparks[c.act] = { host, c };
    fillSpark(c, host);
    return host;
  }
  function fillSpark(c, host) {
    const w = S.hourCache[c.act], hs = w ? hourSeries([w]) : null;
    const head = h('div', { class: 'lx-chart-h' }, h('span', { class: 'wr3-lab' }, defLabel('Today', 'today'), ' by the hour, whole store'), hs ? hourLegend() : null);
    if (hs) return put(host, head, hourChart(hs, { height: 110, phoneHeight: 110, axis: false, ticks: [0, Math.min(6, hs.sales.length - 1), Math.min(12, hs.sales.length - 1), hs.sales.length - 1].filter((v, i, a) => a.indexOf(v) === i), label: `${c.name}: sales and ad spend by the hour today` }));
    const msg = S.hourErr[c.act] ? 'Today by the hour did not load: ' + S.hourErr[c.act] : w ? 'No sales or spend yet today.' : 'Reading today by the hour...';
    put(host, head, h('p', { class: 'wr3-quiet' }, msg));
  }

  function campTable(c) {
    const since = sinceWord(c);
    const cols = [
      { key: 'name', label: 'Campaign', render: cp => h('span', { class: 'cn' },
        h('span', null, cp.name, h('small', null, platformChip('meta')), cp.warn ? h('span', { class: 'warnrow' }, 'Last change not read yet') : null)) },
      { key: 'daily', label: defLabel('Budget a day', 'budget_a_day'), num: true, render: cp => h('span', { class: 'bud' }, cp.daily ? money(cp.daily) : h('span', { class: 'dim' }, 'ad sets'),
        one ? null : h('small', null, money(cp.spent) + ' spent')) },
      one ? { key: 'spent', label: defLabel('Spent today', 'spent_today'), num: true, class: 'hide-sm', render: cp => money(cp.spent) } : null,
      { key: 'since', label: defLabel(since ? `ROAS since ${since}` : 'ROAS since check-in', { title: 'ROAS since the last check-in', body: `This campaign's Triple Whale attributed sales (last click) over its own spend, from the last check-in${since ? ' (' + since + ')' : ''} to this one. With Today, it decides the call.` }), num: true,
        render: cp => h('span', { class: tcls(roasTone(cp.w.since, c)) }, roasTxt(cp.w.since)) },
      { key: 'today', label: defLabel('ROAS today', 'roas'), num: true, render: cp => h('span', { class: tcls(roasTone(cp.w.today, c)) }, roasTxt(cp.w.today)) },
      { key: 'week', label: defLabel('ROAS this week', { title: 'ROAS this week', body: 'This campaign\'s ROAS from Monday 12am Central to now. Context only: it breaks a tie or adds a note, it never blocks a raise.' }), num: true, class: 'hide-sm',
        render: cp => h('span', { class: tcls(roasTone(cp.w.week, c)) }, roasTxt(cp.w.week)) },
      { key: 'call', label: defLabel('Call', 'calls'), num: true, width: 82, render: cp => {
        const word = callWord(c, cp), tone = cp.done ? 'good' : cp.move && !S.probing ? CALL_TONE[cp.call] : '';
        const p = pill(tone, word);
        const k = callKey(cp); if (k) defined(p, k);
        const set = write && !cp.abo ? h('button', { class: 'rowbtn', type: 'button', onclick: e => { e.stopPropagation(); approveSheet(c, cp, { manual: true }); }, 'aria-label': `Set the budget on ${cp.name}` }, 'Set budget') : null;
        return h('span', { class: 'callc' }, p, set);
      } },
    ];
    return h('div', { class: 'wr3-ct' }, table({ cols: cols.filter(Boolean), rows: c.camps, onRow: cp => campSheet(c, cp), empty: 'No live campaign in Meta.' }));
  }

  function brandCard(c) {
    const b = c.b, cad = c.cadence, R = rec(), hourNow = central(nowOf()).hour;
    const due = isDue(cad, R.slot, nowOf()), old = ageH() > cad + 1;
    const pend = pendingOf(c), done = c.camps.filter(cp => cp.done);
    const chip = h('button', { class: 'wr3-chip' + (due || old ? ' due' : ''), type: 'button', disabled: !write || null, onclick: write ? () => cadenceSheet(c) : null, 'aria-label': `Check-in every ${cad} hours. Change it` },
      due ? `Check-in due, every ${cad}h` : old ? `Check-in is old, every ${cad}h` : `Every ${cad}h, next ${nextDue(cad, Math.max(hourNow, c.recHour))}`);
    let dec, dim = false;
    const ml = modeLine(c);
    if (ml) { dec = ml; dim = true; }
    else if (S.probing) { dec = 'Reading the earlier check-ins...'; dim = true; }
    else if (pend.length) dec = decisionText(pend[0]) + (pend.length > 1 ? `, and ${pend.length - 1} more` : '');
    else if (done.length) dec = doneText(done[0]);
    else if (!c.camps.length) { dec = 'No live campaign in Meta'; dim = true; }
    else dec = c.camps.some(cp => cp.needs_ads) ? 'Hold all campaigns, new ads needed' : 'Hold all campaigns';
    const sinceLabel = c.basis ? `Since last check-in (${c.basis.short})` : 'Since last check-in';
    const warns = [];
    if (c.mode === 'live' && !S.probing && c.gate && (c.gate.light === 'amber' || c.gate.light === 'red') && c.gate.why) warns.push(c.gate.why);
    if (c.roas && c.roas.unread) warns.push('The goal ROAS could not be read, so there are no campaign calls.');
    else if (c.mode === 'live' && c.roas && !ok(c.roas.goal)) warns.push('No goal ROAS set for this brand, so there are no campaign calls. Set it in Brand settings > Goals.');
    if (!S.probing && !c.prvRec && c.mode === 'live' && S.probeFails) warns.push(`${S.probeFails} earlier check-in${S.probeFails === 1 ? '' : 's'} could not be read.`);
    const slug = ((ctx.brands || []).find(x => x.id === c.act) || {}).slug;
    return card({ class: 'wr3-b' + (pend.length ? ' yes' : '') },
      h('div', { class: 'wr3-r1' }, h('span', { class: 'nm' }, !one && slug ? h('a', { href: `#/brand/${encodeURIComponent(slug)}/black-friday/war-room` }, b.name) : b.name),
        ok(c.goal) && c.mode !== 'no_sales' ? h('span', { class: 'tg' }, defLabel('Target MER', 'target_mer'), ' ', h('b', null, fx(c.goal))) : null, chip),
      h('div', { class: 'wr3-r2' }, h('span', { class: 'dec' + (dim ? ' dim' : '') }, dec), pend.length ? pill('warn', 'Needs your yes') : null),
      h('div', { class: 'wr3-tiles' },
        tile(c.windows.since, c, sinceLabel, 'since_check_in', S.probing ? 'Reading the earlier check-in' : 'No earlier check-in today'),
        tile(c.windows.today, c, 'Today', 'today'),
        tile(c.windows.week, c, 'This week (Mon to now)', 'this_week')),
      warns.map(t => h('p', { class: 'wr3-amber' }, t)),
      one ? null : sparkFor(c),            // one brand: the hero above already draws its today by the hour
      campTable(c),
      c.roas && c.roas.assumed && c.camps.length ? h('p', { class: 'wr3-quiet' }, defLabel('Break-even ROAS', 'break_even_roas'), ` ${fx(c.roas.be)}, ${assumedWhy(c.roas)}.`) : null,
      c.roas && c.roas.unread ? h('div', { class: 'wr3-act' }, button('Read the goal ROAS again', { onclick: e => refresh(e.currentTarget) })) : null,
      h('div', { class: 'wr3-foot' },
        write ? button('Client update', { onclick: () => clientSheet(c) }) : null,
        button('Today by the hour', { onclick: () => hourSheet(c) })));
  }

  /* ---------- needs your yes ---------- */
  function needsYes(list) {
    if (S.probing) return card({ title: 'Needs your yes' }, h('p', { class: 'wr3-quiet' }, 'Reading the earlier check-ins...'));
    const rows = [];
    for (const c of list) for (const cp of pendingOf(c)) rows.push([c, cp]);
    rows.sort((p, q) => {
      const down = r => r[1].move.to < r[1].move.from ? 0 : 1;
      return down(p) - down(q) || Math.abs(q[1].move.to - q[1].move.from) - Math.abs(p[1].move.to - p[1].move.from);
    });
    if (!rows.length) return card({ title: 'Needs your yes' }, h('p', { class: 'wr3-quiet' }, 'Nothing waits on you. Every campaign holds.'));
    return card({ title: 'Needs your yes', note: `${rows.length} ${rows.length === 1 ? 'decision' : 'decisions'}` },
      h('div', { class: 'wr3-need' }, rows.map(([c, cp]) => {
        const since = sinceWord(c), why = extraWhy(cp);
        return h('div', { class: 'wr3-ask' },
          one ? null : h('span', { class: 'br' }, c.name),
          h('span', { class: 'dec' }, decisionText(cp)),
          h('div', { class: 'wr3-chips' },
            h('span', null, defLabel(since ? `ROAS since ${since}` : 'ROAS since check-in', 'since_check_in'), h('b', null, roasTxt(cp.w.since))),
            h('span', null, defLabel('ROAS today', 'roas'), h('b', null, roasTxt(cp.w.today))),
            c.roas && ok(c.roas.goal) ? h('span', null, defLabel('Goal ROAS', { title: 'Goal ROAS', body: 'The ROAS this brand asks of each campaign. Set in Brand settings > Goals.' }), h('b', null, fx(c.roas.goal))) : null,
            h('span', null, defLabel('Store MER today', 'mer'), h('b', null, fx(c.windows.today.mer)))),
          why ? h('p', { class: 'why' }, why) : null,
          write ? h('div', { class: 'wr3-act' },
            button(c.b.client_approve ? 'The client said yes, apply' : 'Approve', { primary: true, onclick: () => approveSheet(c, cp) }),
            button('Set budget', { onclick: () => approveSheet(c, cp, { manual: true }) }),
            button('Not now', { onclick: () => { setNotNow(rec().slot, cp.id); draw(); } }))
            : h('p', { class: 'wr3-quiet' }, 'Your access is read only, so you cannot approve this.'));
      })));
  }

  /* ---------- the hero model ---------- */
  function heroModel(list) {
    const R = rec(), recDate = R.today || slotDate(R.slot);
    const okb = list.filter(c => !c.b.no_sales && c.b.so_far && ok(c.b.so_far.sales));
    const sales = okb.reduce((t, c) => t + c.b.so_far.sales, 0), spend = okb.reduce((t, c) => t + (c.b.so_far.spend || 0), 0);
    const withGoal = okb.filter(c => c.b.goal > 0);
    const goal = withGoal.reduce((t, c) => t + c.b.goal, 0);
    /* the target MER the plans add up to: each brand's sales goal over the spend its own target allows */
    const planned = withGoal.filter(c => c.goal > 0);
    const target = one ? (list[0] && list[0].goal) : planned.length ? planned.reduce((t, c) => t + c.b.goal, 0) / planned.reduce((t, c) => t + c.b.goal / c.goal, 0) : null;
    const be = one && list[0] ? list[0].be : null;
    const from = okb.map(c => c.b.so_far.from).filter(Boolean).sort()[0] || recDate;
    const scope = one ? '' : okb.length === list.length ? 'All brands' : `${okb.length} of ${list.length} brands: ${list.length - okb.length === 1 ? 'one has' : 'the rest have'} no sales source`;
    const acts = list.map(c => c.act);
    const got = acts.filter(a => S.hourCache[a]);
    const hs = hourSeries(got.map(a => S.hourCache[a]));
    const waitN = acts.length - got.length;
    const hourNote = waitN && S.warBusy ? `Reading today by the hour: ${got.length} of ${acts.length} brands so far.` : waitN ? `${waitN} brand${waitN === 1 ? '' : 's'} could not be read by the hour.` : '';
    const ph = one ? phasesOfWar(S.hourCache[one]) || SEASON : SEASON;
    return {
      period: `${dayLabel(from)} 12am CT to ${hourWord(slotHour(R.slot))} CT (last check-in)`, scope,
      sales: okb.length ? sales : null, goal: goal || null, spend: okb.length ? spend : null, mer: spend > 0 ? sales / spend : null,
      target: ok(target) ? Math.round(target * 100) / 100 : null, be, none: 'No sales source connected',
      phases: ph, today: recDate, hours: hs, hourNote, hourScope: one ? 'whole store, Central time' : `${got.length === acts.length ? 'all brands' : got.length + ' of ' + acts.length + ' brands'}, Central time`,
    };
  }

  /* ---------- the plan rows ---------- */
  function planRows(list) {
    const fromWar = (w, b) => {
      const goals = (w && w.goals_list) || [];
      const rev = (goals.find(g => g.metric === 'revenue') || {}).target;
      const mer = (goals.find(g => g.metric === 'mer') || {}).target;
      const bf = ((w && w.phases) || []).find(p => p.key === 'bf');
      return { act_id: b.act, name: b.name, offer: (w && w.bf_offer) || (bf && bf.offer) || '', sale: w && w.sale, goal: rev ?? b.b.goal ?? null, target: (w && w.ladder && w.ladder.target) ?? mer ?? b.goal ?? null, steps: w && Array.isArray(w.steps) ? w.steps : null };
    };
    if (one) return list.map(c => fromWar(S.hourCache[c.act], c));
    const all = (S.warAll && S.warAll.brands) || [];
    return list.map(c => {
      const r = all.find(x => x.act_id === c.act);
      if (!r) return { act_id: c.act, name: c.name, offer: '', sale: null, goal: c.b.goal || null, target: c.goal, steps: null };
      return { act_id: c.act, name: c.name, offer: r.bf_offer || '', sale: r.sale, goal: r.goal ?? c.b.goal ?? null, target: (r.ladder && r.ladder.target) ?? c.goal, steps: r.steps || null };
    });
  }
  function planSection(list) {
    const waiting = one ? !S.hourCache[one] && !S.hourErr[one] : !S.warAll && !S.warAllErr;
    const hrefOf = one ? null : act => { const s = ((ctx.brands || []).find(x => x.id === act) || {}).slug; return s ? `#/brand/${encodeURIComponent(s)}/black-friday/war-room` : null; };
    const err = one ? S.hourErr[one] : S.warAllErr;
    return card({ title: 'The plan', note: 'what was agreed for the sale', flush: true },
      planTable(planRows(list), { team: write, waiting, hrefOf }),
      err ? h('p', { class: 'wr3-quiet', style: { padding: '0 var(--pad-card) 16px' } }, 'The plan did not load: ' + err) : null);
  }

  /** Fresh plan or hour reads landed: redraw only the hero, the plan and the brand charts (no full page redraw). */
  function fillLate() {
    if (!alive() || !rec()) return;
    const list = calcAll();
    if (hosts.hero && hosts.hero.isConnected) { const n = paceHero(heroModel(list)); hosts.hero.replaceWith(n); hosts.hero = n; }
    if (hosts.plan && hosts.plan.isConnected) { const n = planSection(list); hosts.plan.replaceWith(n); hosts.plan = n; }
    for (const c of list) { const s = hosts.sparks[c.act]; if (s && s.host.isConnected) fillSpark(c, s.host); }
  }

  /* ---------- sheets ---------- */
  function closeOnLeave(s) {
    const off = () => { window.removeEventListener('hashchange', off); if (s.el.isConnected) s.close(); };
    window.addEventListener('hashchange', off);
    return s;
  }

  /** This campaign today, check-in to check-in: spend and Triple Whale sales (last click) between the records read. */
  function campToday(c, cp) {
    const R = rec(), day = R.today || slotDate(R.slot);
    const pts = S.records.filter(r => slotDate(r.slot) === day).map(r => {
      const b = (r.brands || []).find(x => x.act_id === c.act);
      const k = b && b.meta && (b.meta.camps || []).find(x => String(x.id) === cp.id);
      return k ? { slot: r.slot, spent: +k.spent || 0, rev: (+k.t_roas || 0) * (+k.spent || 0) } : null;
    }).filter(Boolean).sort((p, q) => slotHour(p.slot) - slotHour(q.slot));
    if (!pts.length) return null;
    let ps = 0, pr = 0, ph = 0;
    return pts.map(p => {
      const o = { label: `${hourWord(ph)} to ${hourWord(slotHour(p.slot))}`, spend: Math.max(0, p.spent - ps), sales: Math.max(0, p.rev - pr) };
      ps = p.spent; pr = p.rev; ph = slotHour(p.slot);
      return o;
    });
  }

  function campSheet(c, cp) {
    const word = callWord(c, cp), tone = cp.done ? 'good' : cp.move && !S.probing ? CALL_TONE[cp.call] : '';
    const W = cp.w, since = sinceWord(c);
    const wTile = (label, key, w) => h('div', { class: 'wr3-tile' },
      h('span', { class: 'hd' }, defLabel(label, key)),
      h('span', { class: 'k' }, defLabel('ROAS', 'roas')),
      h('span', { class: 'mer ' + (roasTone(w, c) ? roasTone(w, c) + '-t' : '') }, roasTxt(w)),
      h('span', { class: 'ln' }, defLabel('Spend', 'ad_spend'), h('span', null, w ? usd(w.spend) : '...')),
      h('span', { class: 'ln' }, defLabel('Sales', { title: 'Sales (this campaign)', body: 'The store sales Triple Whale credits to this campaign, last platform click.' }), h('span', null, w ? usd(w.rev) : '...')));
    /* today, check-in to check-in */
    const tl = campToday(c, cp);
    const todayBlock = h('div', { class: 'sec' },
      h('h4', null, defLabel('Today', 'today'), ', check-in to check-in'),
      tl && tl.length ? [legend([{ name: 'Sales (Triple Whale, last click)', square: true, color: 'var(--ink)' }, { name: 'Spend' }]),
        lineChart({
          series: [{ name: 'Sales', type: 'bar', values: tl.map(t => t.sales) }, { name: 'Spend', values: tl.map(t => t.spend), end: false, points: true }],
          labels: tl.map(t => t.label), slots: true, height: 180, phoneHeight: 170, endLabels: false, fill: false, yTicks: 2, format: v => money(v, { compact: true }),
          label: `${cp.name}: spend and sales between today's check-ins`,
          tooltip: i => [h('div', { class: 'lx-tip-h' }, tl[i].label + ' CT'), tipRow('ink', 'Sales', money(tl[i].sales)), tipRow('slate', 'Spend', money(tl[i].spend)), tipRow(null, 'ROAS', tl[i].spend > 0 ? fx(tl[i].sales / tl[i].spend) : 'n/a')],
        })]
        : h('p', { class: 'dim' }, S.probing ? 'Reading the earlier check-ins...' : 'Only one check-in today so far.'));
    const picHost = h('div', { class: 'sec' });
    const m = c.b.meta || {};
    /* Set budget at the bottom, prefilled with the suggestion */
    const sug = hasSuggestion(c, cp) ? cp.move.to : null;
    const from = cp.done && ok(cp.done.to) ? cp.done.to : cp.daily;
    const amt = h('input', { class: 'lx-input', type: 'number', min: String(MIN_BUDGET), step: '5', inputmode: 'decimal', enterkeyhint: 'done', value: String(sug ?? from ?? ''), 'aria-label': 'New daily budget' });
    const goBtn = h('span');
    const drawGo = () => {
      const v = Math.round(+amt.value);
      put(goBtn, sug != null && v === sug
        ? button(`Approve: ${money(sug)} a day`, { primary: true, large: true, onclick: () => { sh.close(); approveSheet(c, cp); } })
        : button(ok(v) && v > 0 ? `Set ${money(v)} a day` : 'Set budget', { primary: true, large: true, disabled: !(v >= MIN_BUDGET) || null, onclick: () => { sh.close(); approveSheet(c, cp, { manual: true, amount: v }); } }));
    };
    amt.oninput = drawGo; drawGo();
    const setBlock = write && !cp.abo && from ? h('div', { class: 'sec' },
      h('h4', null, 'Set budget'),
      h('label', null, defLabel('New budget a day', 'budget_a_day'), amt),
      h('p', { class: 'hint' }, sug != null ? `Suggested by ${APP_NAME}: ${money(sug)}. Type another amount to change it.` : `Now ${money(from)} a day. Type the new amount.`),
      ownerNote(c) ? h('p', { class: 'wr3-amber' }, ownerNote(c)) : null,
      h('div', { class: 'btns' }, goBtn, cp.done && cp.done.write ? button('Undo', { large: true, onclick: () => { sh.close(); undo(c, cp); } }) : null))
      : cp.abo ? h('p', { class: 'dim' }, 'Ad set budgets: set them by hand in Ads Manager.') : null;
    const body = h('div', { class: 'wr3-sh' },
      h('div', { class: 'call' },
        h('span', { class: 'wr3-lab' }, platformChip('meta', { label: PLATFORM }), ` campaign, ${c.name}`),
        h('b', { class: tone ? tone + '-t' : '' }, cp.done ? doneText(cp) : cp.move ? decisionText(cp) : `${word}: ${cp.name} (${PLATFORM})`),
        extraWhy(cp) ? h('p', { class: 'wr3-amber' }, extraWhy(cp)) : null,
        cp.why && !cp.move ? h('p', { class: 'dim' }, cp.why) : null),
      h('div', { class: 'wr3-tiles' },
        wTile(since ? `Since ${since}` : 'Since check-in', 'since_check_in', W.since),
        wTile('Today', 'today', W.today),
        wTile('This week', 'this_week', W.week)),
      todayBlock,
      picHost,
      h('dl', null,
        h('dt', null, defLabel('Budget a day', 'budget_a_day')), h('dd', null, cp.daily ? money(cp.daily) : 'Ad set budgets'),
        h('dt', null, defLabel('Spent today', 'spent_today')), h('dd', null, money(cp.spent) + (ok(cp.pace) ? `, ${Math.round(cp.pace * 100)}% of pace` : '')),
        c.roas && ok(c.roas.goal) ? [h('dt', null, defLabel('Goal ROAS', { title: 'Goal ROAS', body: 'The ROAS this brand asks of each campaign. Set in Brand settings > Goals.' })), h('dd', null, fx(c.roas.goal))] : null,
        c.roas && ok(c.roas.be) ? [h('dt', null, defLabel('Break-even ROAS', 'break_even_roas')), h('dd', null, fx(c.roas.be) + (c.roas.assumed ? ' (assumed)' : ''))] : null,
        ok(m.limit) ? [h('dt', null, defLabel('Meta daily limit', { title: 'Meta daily limit', body: 'The most the whole ad account may spend in a day, set in Meta. A raise is capped so every budget fits under it.' })), h('dd', null, `${money(m.limit)}${m.limit_src === 'known' ? ' (last known)' : ''}`)] : null,
        cp.last ? [h('dt', null, 'Last budget change'), h('dd', null, `${clockCT(cp.last.at)}, ${agoWords(nowOf() - cp.last.at)} ago, $${Math.round(cp.last.spent_since)} spent since`)] : null),
      cp.done ? h('div', { class: 'ok' }, `Done, ${money(cp.done.to)} a day, by ${cp.done.by} at ${clockCT(Date.parse(cp.done.at))}.`) : null,
      setBlock);
    const sh = closeOnLeave(sheet({ title: cp.name, body, side: 'right' }));
    fillPicture(c, cp, picHost);
  }

  /* ---------- the full picture for one campaign (rule w1), read only when its panel opens ---------- */
  const picKey = c => c.act + '|' + ((rec() && rec().slot) || '');
  /** One GET per brand per check-in: Meta's own rows for every campaign this week, with Triple Whale first click. */
  function readPicture(c) {
    const key = picKey(c);
    if (S.picture[key]) return S.picture[key];
    const R = rec(), to = R.today || slotDate(R.slot), from = (c.b.week && c.b.week.from) || mondayOf(to);
    const p = (async () => {
      if (ctx.sample) {
        const all = (f() && f().hub_paid) || {};
        if (!all[c.act]) throw new Error('No sample numbers for this brand.');
        return { from, to, camps: all[c.act].campaigns || [] };
      }
      const q = `platform=meta&act=${encodeURIComponent(c.act)}&model=fullFirstClick&cmp=none&from=${from}&to=${to}`;
      const r = await ctx.api('/api/hub/paid?' + q, { signal: ctx.signal });
      const b = r && r.brands && r.brands[0];
      return { from, to, camps: (b && b.campaigns) || [] };
    })();
    S.picture[key] = p;
    p.catch(() => { if (S.picture[key] === p) delete S.picture[key]; });   // a failed read is tried again next open
    return p;
  }
  async function fillPicture(c, cp, host) {
    put(host, h('h4', null, 'The full picture this week'), h('p', { class: 'dim' }, 'Reading...'));
    const raw = ((c.b.meta && c.b.meta.camps) || []).find(x => String(x.id) === cp.id) || {};
    let P = null, err = '';
    try { P = await readPicture(c); } catch (e) { if (e && e.name === 'AbortError') return; err = errText(e); }
    if (!host.isConnected) return;
    const m = P ? P.camps.find(x => String(x.id) === cp.id) || null : null;
    const NA = 'not available';
    const n0 = v => ok(v) ? Math.round(v).toLocaleString('en-US') : null;
    const pct = v => ok(v) ? (v * 100).toFixed(2) + '%' : null;
    const row = (label, val) => [h('dt', null, label), h('dd', { class: val == null || val === '' ? 'na' : '' }, val == null || val === '' ? NA : val)];
    const both = (a, b) => (a == null && b == null ? null : `${a == null ? NA : a} · ${b == null ? NA : b}`);
    /* a campaign with no Triple Whale sales on record is not read, so its 0 is not shown as a reading */
    const lcOrd = !cp.no_tw && ok(+raw.w_ord) ? +raw.w_ord : null, lcRoas = !cp.no_tw && cp.w.week && ok(cp.w.week.roas) ? cp.w.week.roas : null;
    /* first click: a brand with no first click credit at all this week reads as not available rather than 0 sales */
    const noFc = !!P && P.camps.some(x => x.spend > 0) && P.camps.every(x => !(+x.purchases) && !(+x.revenue));
    const fcOrd = m && !noFc ? n0(m.purchases) : null;
    const fcRoas = m && !noFc && m.spend > 0 && ok(m.revenue) ? m.revenue / m.spend : null;
    const plRoas = m && m.spend > 0 && ok(m.platform_revenue) ? m.platform_revenue / m.spend : null;
    const views = m && ok(m.hook) && ok(m.impressions) ? Math.round(m.hook * m.impressions) : null;
    /* the funnel: link clicks > add to carts > checkouts > purchases (Triple Whale, last click) */
    const steps = m ? [['Link clicks', m.clicks], ['Add to carts', m.atc], ['Checkouts started', m.checkouts], ['Purchases (Triple Whale, last click)', lcOrd]] : [];
    const top = steps.length && ok(+steps[0][1]) && +steps[0][1] > 0 ? +steps[0][1] : null;
    const funnel = top ? h('div', { class: 'wr3-fun', role: 'list', 'aria-label': 'This week, from click to purchase' }, steps.map(([label, v], i) => {
      const prev = i ? steps[i - 1][1] : null;
      const rate = i && ok(+v) && ok(+prev) && +prev > 0 && +v <= +prev ? Math.round(+v / +prev * 1000) / 10 + '% of the step before' : '';
      return h('div', { role: 'listitem' }, h('span', null, label), h('b', null, ok(+v) ? n0(+v) : NA, rate ? h('small', null, rate) : null),
        h('i', { style: { '--v': ok(+v) ? Math.max(2, Math.sqrt(+v / top) * 100).toFixed(1) + '%' : '0%' } }));
    })) : null;
    put(host,
      h('h4', null, 'The full picture this week', P ? h('span', { class: 'wr3-lab', style: { fontWeight: 400 } }, `, ${md(P.from)} to ${md(P.to)}`) : null),
      err ? h('p', { class: 'dim' }, 'Could not read the Meta rows: ' + err) : null,
      P && !m ? h('p', { class: 'dim' }, 'No Meta rows for this campaign this week yet.') : null,
      funnel,
      m ? h('dl', null,
        row(defLabel('Ad spend (Meta)', 'ad_spend'), usd(m.spend)),
        row('CTR', pct(m.ctr)),
        row('CPM · frequency', both(ok(m.cpm) ? usd(m.cpm) : null, ok(m.frequency) ? m.frequency.toFixed(2) : null)),
        row('Cost per add to cart', ok(m.cost_per_atc) ? usd(m.cost_per_atc) : null),
        row('Video views (3 seconds)', views != null && views > 0 ? n0(views) : null),
        row(defLabel('Last click: sales · ROAS', { title: 'Triple Whale, last click', body: 'Purchases Triple Whale credits to this campaign when it was the last ad clicked. This is what the call reads.' }), both(lcOrd != null ? n0(lcOrd) : null, ok(lcRoas) ? fx(lcRoas) : null)),
        row(defLabel('First click: sales · ROAS', { title: 'Triple Whale, first click', body: 'Purchases credited when this campaign was the first ad clicked. It shows the campaigns that open the funnel, which last click undercounts.' }), both(fcOrd, ok(fcRoas) ? fx(fcRoas) : null)),
        row(defLabel('Meta reports: purchases · ROAS', { title: 'Meta reports', body: 'Meta\'s own count. A second opinion only: it usually runs higher than Triple Whale.' }), both(n0(m.platform_purchases), ok(plRoas) ? fx(plRoas) : null))) : null);
  }

  /* ---------- the one tap: dry run, then the write ---------- */
  /* manual: "Set budget", any amount by hand, PREFILLED with the suggested amount when there is one.
     Same sheet, same dry run, client line, big change tick and Undo. amount: an amount typed in the panel. */
  function approveSheet(c, cp, { typed = false, note = '', manual = false, amount: given = null } = {}) {
    if (!write || ctx.isClient || (S.probing && !manual)) return;
    const R = rec();
    /* after a change from this page, Meta has the new figure, so a hand-set starts from it */
    const from = manual && cp.done && ok(cp.done.to) ? cp.done.to : cp.daily;
    if (!from) { toast('Ad set budgets: change this one by hand in Ads Manager.'); return; }
    const sug = cp.move && !cp.done ? cp.move.to : null;
    const start = ok(given) && given > 0 ? given : sug ?? from;
    const amount = h('input', { class: 'lx-input', type: 'number', min: String(MIN_BUDGET), step: '5', inputmode: 'decimal', pattern: '[0-9]*', enterkeyhint: 'done', value: String(start), 'aria-label': 'New daily budget' });
    const jump = h('input', { type: 'checkbox' });
    const jumpWrap = h('label', { class: 'tick', hidden: true }, jump, 'I mean this jump');
    const whyNote = h('p', { class: 'dim', hidden: true }), gateNote = h('p', { class: 'wr3-amber', hidden: true });
    const light = c.gate && c.gate.light;
    const why = h('textarea', { class: 'lx-input', maxlength: '600', rows: '2', 'aria-label': 'What the client will read' });
    const autoWhy = to => clientWhy({ ...cp, call: !manual && cp.call === 'putback' && to === (cp.move && cp.move.to) ? 'putback' : manual ? 'x' : cp.call, move: { from, to } }, { manual }) || `We changed the budget on ${cp.name}.`;
    why.value = start !== from ? autoWhy(start) : '';
    if (manual && start === from) why.placeholder = 'Fills in when you type an amount';
    let whyTyped = false; why.oninput = () => { whyTyped = true; };
    const status = h('div'), btns = h('div', { class: 'btns' });
    let dry = null, busy = false;
    const toOf = () => Math.round(+amount.value);
    const check = () => {
      const to = toOf();
      if (!(to >= MIN_BUDGET)) return `Type a budget of at least $${MIN_BUDGET} a day.`;
      if (to === from) return 'That is the budget it has now.';
      if (to > from && ok(cp.room) && to > cp.room) return `Over the ${money(cp.limit)} Meta limit, room is ${money(Math.max(0, cp.room))} a day.`;
      const ch = Math.abs(to - from) / from;
      jumpWrap.hidden = ch <= MAX_STEP;
      if (ch > MAX_STEP && !jump.checked) return `That is ${Math.round(ch * 100)}% from today's ${money(from)}. Tick "I mean this jump" to go past 50%.`;
      return '';
    };
    const owner = ownerNote(c);
    const body = h('div', { class: 'wr3-sh' },
      note ? h('p', { class: 'wr3-amber' }, note) : null,
      owner ? h('p', { class: 'wr3-amber' }, owner) : null,
      h('dl', null,
        h('dt', null, 'Campaign'), h('dd', null, `${cp.name} (${PLATFORM}), ${c.name}`),
        h('dt', null, defLabel('Budget a day now', 'budget_a_day')), h('dd', null, money(from)),
        h('dt', null, defLabel('Spent today', 'spent_today')), h('dd', null, money(cp.spent)),
        h('dt', null, 'Check-in'), h('dd', null, R.label || R.slot)),
      extraWhy(cp) ? h('p', { class: 'dim' }, extraWhy(cp)) : null,
      h('label', null, defLabel('New budget a day', 'budget_a_day'), amount),
      sug != null ? h('p', { class: 'hint' }, `Suggested by ${APP_NAME}: ${money(sug)}. Type another amount to change it.`) : null,
      jumpWrap,
      h('label', null, 'What the client will read', why),
      whyNote, gateNote, status, btns);
    const verb = cp.call === 'putback' && !manual ? 'Put back' : start > from ? 'Raise' : start < from ? 'Cut' : 'Change';
    const sh = closeOnLeave(sheet({ title: manual ? `Set the budget on ${cp.name} (${PLATFORM})` : `${verb} ${cp.name} (${PLATFORM})?`, body, side: 'right' }));
    if (typed || manual) setTimeout(() => { amount.focus(); amount.select(); }, 60);
    const reset = () => { dry = null; if (!whyTyped) why.value = toOf() !== from ? autoWhy(toOf()) : ''; drawBtns(); };
    amount.oninput = reset; jump.onchange = reset;

    function drawBtns(msg, tone, extra) {
      const err = check();
      const t = toOf(), via = matchesCheckin(c.b, { ...cp, move: { from, to: t } }) && ageH() <= 6;
      whyNote.hidden = !via;
      whyNote.textContent = via ? 'This is the check-in\'s own move, so it goes through the check-in\'s Approve and the client reads the check-in\'s standard line, not the text above.' : '';
      const against = !!light && ((t > from && light !== 'green') || (t < from && light === 'green'));
      gateNote.hidden = !against;
      gateNote.textContent = against ? (t > from ? 'The store gate holds raises right now: ' : 'The store is over goal, so the gate holds cuts: ') + (c.gate.why || '') : '';
      put(status, msg ? h('div', { class: tone || 'err', role: tone === 'ok' ? 'status' : 'alert' }, msg) : err ? h('p', { class: 'dim' }, err) : null);
      const to = toOf();
      put(btns,
        extra || null,
        extra ? null : dry ? button(busy ? 'Writing to Meta...' : `Yes, change it to ${money(to)} a day`, { primary: true, large: true, disabled: busy || !!err || null, onclick: go })
          : button(busy ? 'Checking with Meta...' : 'Check with Meta', { primary: true, large: true, disabled: busy || !!err || null, onclick: dryRun }),
        button('Cancel', { large: true, onclick: () => sh.close() }));
    }
    const bodyOf = to => ({ act: c.act, kind: 'budget', level: 'campaign', object: cp.id, amount: to,
      reason: (manual ? `War Room ${R.label || R.slot}: set by hand (the page said ${CALL_WORD[cp.call] || 'Hold'})` : `War Room ${R.label || R.slot}: ${cp.why || CALL_WORD[cp.call] || ''}`).slice(0, 280), client_why: why.value.trim() });

    async function dryRun() {
      if (check() || busy) return;
      busy = true; drawBtns();
      const to = toOf();
      let d;
      if (ctx.sample) d = { ok: true, dry: true, before: { daily_budget: String(Math.round(from * 100)) }, summary: `Sample: ${cp.name} ${money(from)} a day to ${money(to)} a day. No real ad account was read.` };
      else { try { d = await ctx.api('/api/meta/write', { worker: 'ah', method: 'POST', body: { ...bodyOf(to), dry: true } }); } catch (e) { d = { error: errText(e) }; } }
      busy = false;
      if (!d || d.error) { dry = null; drawBtns('Not checked. ' + ((d && d.error) || 'Meta did not answer.')); return; }
      const before = d.before && d.before.daily_budget != null ? +d.before.daily_budget / 100 : null;
      if (ok(before) && Math.round(before) !== Math.round(from)) {
        /* the budget moved since the check-in: nothing is written on the old figure, start again on the real one */
        dry = null;
        const again = button(`Start again on ${money(before)}`, { primary: true, large: true, onclick: () => { sh.close(); approveSheet(c, manual ? { ...cp, daily: before, done: null } : restep(before), { typed, manual, note: `Meta had it at ${money(before)} a day, not the ${money(from)} the check-in saw. This is worked out from ${money(before)}.` }); } });
        drawBtns(`Meta has it at ${money(before)} a day now, not the ${money(from)} the check-in saw. Nothing was written.`, 'err', again);
        return;
      }
      dry = { d, to };
      drawBtns((d.summary || `${cp.name}: ${money(before ?? from)} a day to ${money(to)} a day.`) + ' Tap Yes to write it.', 'ok');
    }
    /* the same call worked out again on the budget Meta really has */
    function restep(daily) {
      const room = cp.room;                                         // the limit minus the other budgets, which did not move
      let to = null;
      if (STEP_PCT[cp.call] != null) to = stepTo(daily, STEP_PCT[cp.call]);
      else if (cp.call === 'putback' && cp.move && cp.move.to < daily) to = cp.move.to;
      if (to != null && to > daily && ok(room) && to > room) to = Math.floor(room / 5) * 5;
      const good = to != null && to !== daily && (!cp.move || Math.sign(to - daily) === Math.sign(cp.move.to - cp.move.from));
      return { ...cp, daily, room, move: good ? { from: daily, to, pct: (to - daily) / daily } : null, call: good ? cp.call : 'hold' };
    }
    async function go() {
      if (!dry || busy || check()) return;
      const to = toOf();
      if (to !== dry.to) { dry = null; drawBtns(); return; }
      if (!why.value.trim()) { drawBtns('Write the line the client will read.'); return; }
      busy = true; drawBtns();
      const big = Math.abs(to - from) / from > MAX_STEP;
      /* the check-in's own move goes through its Approve (Slack batch fills in); approve() refuses records over 6 hours old */
      const viaCheckin = matchesCheckin(c.b, { ...cp, move: { from, to } }) && ageH() <= 6;
      let r;
      if (ctx.sample) r = { ok: true, write: 'sample_' + Date.now().toString(36), summary: '' };   // never sent anywhere; unique so a sample Undo takes off only its own row
      else if (viaCheckin) {
        try { r = await ctx.api('/api/standing/approve', { worker: 'ah', method: 'POST', body: { slot: R.slot, act: c.act } }); } catch (e) { r = { error: errText(e) }; }
      } else {
        const expect = dry.d.before && dry.d.before.daily_budget != null ? { daily_budget: dry.d.before.daily_budget } : undefined;
        try { r = await ctx.api('/api/meta/write', { worker: 'ah', method: 'POST', body: { ...bodyOf(to), expect, ...(big ? { big: true } : {}) } }); } catch (e) { r = { error: errText(e) }; }
      }
      busy = false;
      if (!r || r.error || (viaCheckin && !r.ok)) { dry = null; drawBtns('Not changed. ' + ((r && r.error) || 'The server did not say why.')); return; }
      const by = (ctx.me && (ctx.me.name || ctx.me.email)) || 'you', at = new Date(nowOf()).toISOString();
      /* prev: the earlier change from this page on the same campaign, so an Undo of this one goes back to it */
      const key = doneKey(c.act, cp.id);
      S.done[key] = { from, to, by, at, write: r.write || null, slack: viaCheckin, prev: S.done[key] || null };
      /* the change counts at once for the "not read yet" warning and the client card */
      S.data.acts = [{ act_id: c.act, object_id: cp.id, object_name: cp.name, category: 'budget', event_time: at, summary: `$${from}/day → $${to}/day`, client_why: why.value.trim(), actor: by, local: true,
        write: r.write || null, note: r.write ? `Write ${r.write}.` : '' }, ...(S.data.acts || [])];
      if (!ctx.sample) forgetWaiting();
      sh.close();
      toast(ctx.sample ? SAMPLE_MSG : `Done, ${money(to)} a day, by ${by} at ${clockCT(Date.parse(at))}`, { tone: 'good', ms: 4000 });
      draw();
    }
    drawBtns();
  }

  function undo(c, cp) {
    const d = S.done[doneKey(c.act, cp.id)] || cp.done;
    if (!d || !d.write) return;
    undoSheet(ctx, { act: c.act, write: d.write, what: `${cp.name} (${PLATFORM}): back to ${money(d.from)} a day`, name: c.name }, okd => {
      if (!okd) return;
      /* only this write comes off: an earlier change from here stays live in Meta, on the card and undoable */
      const key = doneKey(c.act, cp.id);
      if (d.prev) S.done[key] = d.prev; else delete S.done[key];
      const at = new Date(nowOf()).toISOString();
      S.data.acts = [{ act_id: c.act, object_id: cp.id, object_name: cp.name, category: 'other', event_time: at, summary: `Undone: $${d.from}/day → $${d.to}/day`,
        note: `Undo of ${d.write}.`, write: d.write, local: true },
        ...(S.data.acts || []).filter(a => !(a.local && a.write && a.write === d.write && a.act_id === c.act))];
      draw();
    });
  }

  /* ---------- cadence ---------- */
  function cadenceSheet(c) {
    const cur = c.cadence, msg = h('div'), sug = cadenceSuggest(c.b, cur);
    const pick = async n => {
      if (n === cur) return;
      if (ctx.sample) toast('Sample: nothing was saved');
      else {
        try { await ctx.api('/api/season/answer', { method: 'PUT', body: { act: c.act, key: 'checkin_hours', value: String(n) } }); }
        catch (e) { put(msg, h('div', { class: 'err', role: 'alert' }, 'Not saved. ' + errText(e))); return; }
        toast(`${c.name}: check-in every ${n} hours`, { tone: 'good' });
      }
      S.data.answers = { ...(S.data.answers || {}), [c.act]: { ...((S.data.answers || {})[c.act] || {}), checkin_hours: String(n) } };
      sh.close(); draw(); probe();
    };
    const body = h('div', { class: 'wr3-sh' },
      h('p', null, 'Check in every:'),
      sug ? h('p', { class: 'wr3-amber' }, `Suggested: every ${sug.hours} hours. ${sug.why}`) : null,
      segmented(CADENCE_CHOICES.map(n => ({ id: n, label: n + 'h' })), CADENCE_CHOICES.includes(cur) ? cur : null, pick),
      h('p', { class: 'dim' }, 'From 8am Central, the last one by 10pm. It sets when the card says "Check-in due", which earlier check-in "Since" counts from, and when the client update is due. Every brand starts at 6 hours.'),
      msg);
    const sh = closeOnLeave(sheet({ title: `${c.name}: check-in rhythm`, body, side: 'bottom' }));
  }

  /* ---------- today by the hour (a chart, from the war read; read here when it has not landed yet) ---------- */
  async function hourSheet(c) {
    const body = h('div', { class: 'wr3-sh' }, h('p', { class: 'dim' }, 'Reading Triple Whale...'));
    closeOnLeave(sheet({ title: `${c.name}: today by the hour`, body, side: 'right' }));
    let D = S.hourCache[c.act];
    if (!D) {
      try { D = await readWarOne(c.act); } catch (e) { return put(body, h('p', { class: 'err' }, 'Could not read it: ' + errText(e))); }
    }
    const hs = hourSeries([D]);
    if (!hs) return put(body, h('p', { class: 'dim' }, 'No sales or spend yet today.'));
    const sales = hs.sales.reduce((t, v) => t + v, 0), spend = hs.spend.reduce((t, v) => t + v, 0);
    const best = hs.sales.indexOf(Math.max(...hs.sales));
    put(body,
      h('div', { class: 'wr3-tiles' },
        h('div', { class: 'wr3-tile' }, h('span', { class: 'hd' }, defLabel('Sales', 'sales')), h('span', { class: 'mer' }, money(sales))),
        h('div', { class: 'wr3-tile' }, h('span', { class: 'hd' }, defLabel('Ad spend', 'ad_spend')), h('span', { class: 'mer' }, money(spend))),
        h('div', { class: 'wr3-tile' }, h('span', { class: 'hd' }, defLabel('Store MER', 'mer')), h('span', { class: 'mer ' + (merTone(spend > 0 ? sales / spend : null, c) ? merTone(spend > 0 ? sales / spend : null, c) + '-t' : '') }, fx(spend > 0 ? sales / spend : null)))),
      h('div', { class: 'wr3-ch' }, h('div', { class: 'lx-chart-h' }, h('span', { class: 'wr3-lab' }, '12am Central to now, whole store'), hourLegend()),
        hourChart(hs, { height: 260, phoneHeight: 220 })),
      h('p', { class: 'dim' }, `Best hour for sales so far: ${hourWord(best)} to ${hourWord(best + 1)}.`));
  }

  /* ---------- the client update card ---------- */
  function cardData(c) {
    const R = rec(), W = c.windows, recDate = R.today || slotDate(R.slot);
    const since = W.since || { label: 'Since last update', readable: false };
    const fromMs = c.prvRec ? Date.parse(c.prvRec.at) : Date.parse(recDate + 'T06:00:00Z');
    /* an 'Undone:' row for the same write id takes the change off the card */
    const changes = clientChanges(S.data.acts, c.act, fromMs)
      .map(a => {
        const { from: fr, to } = parseBudget(a.summary);
        const name = a.object_name || 'a campaign', why = String(a.client_why).trim();
        /* never the internal summary: when the amounts do not read, the client line alone */
        if (!(ok(fr) && ok(to)) || fr === to) return { line: why, why: '' };
        return { line: `${to > fr ? 'Raised' : 'Lowered'} ${name} from ${money(fr)} to ${money(to)} a day`, why };
      });
    return {
      brand: c.name, goal: c.goal,
      when: `${dayLabel(recDate)} · ${hourWord(slotHour(R.slot))} CT`,
      tiles: [
        { label: since.label, mer: since.mer, sales: since.sales, spend: since.spend, readable: !!since.readable },
        { label: 'Today', mer: W.today.mer, sales: W.today.sales, spend: W.today.spend, readable: !!W.today.readable },
        { label: 'This week', mer: W.week.mer, sales: W.week.sales, spend: W.week.spend, readable: !!W.week.readable }],
      changes,
      next: nextDue(c.cadence, c.recHour) + ' CT',
    };
  }
  /** The words that go with the card, as the client reads them. */
  function cardText(d) {
    const t = d.tiles.map(x => `${x.label}: ${x.readable ? `store MER ${fx(x.mer)} on ${usd(x.sales)} sales and ${usd(x.spend)} ad spend` : 'too little to read yet'}`);
    const ch = d.changes.length ? ['What we changed:', ...d.changes.map(x => `${x.line}${x.why ? '. ' + x.why : ''}`)] : ['No budget changes since the last update.'];
    return [`Black Friday update for ${d.brand}, ${d.when}`, ...t, ...ch, `Next update around ${d.next}.`].join('\n');
  }
  const fileOf = c => `${String(c.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${rec().slot}.png`;
  function snapshotLink(c, d) {
    const key = c.act + '|' + rec().slot;
    if (S.links[key]) return Promise.resolve(S.links[key]);
    if (S.linkBusy[key]) return S.linkBusy[key];                  // one POST per check-in, however many taps
    const title = `Black Friday update · ${d.when.split(' · ')[0].split(' ')[0]} ${hourWord(slotHour(rec().slot))}`;
    const p = (async () => {
      if (ctx.sample) return new URL('../s.html?t=sample', location.href).href;
      const r = await ctx.api('/api/snapshot', { method: 'POST', body: { act: c.act, kind: 'card', title, html: cardHtml(d), css: CARD_CSS, days: 30 } });
      if (!r || !r.token) throw new Error((r && r.error) || 'No link came back.');
      return new URL('../s.html?t=' + r.token, location.href).href;
    })().then(l => { S.links[key] = l; return l; }).finally(() => { delete S.linkBusy[key]; });
    S.linkBusy[key] = p;
    return p;
  }

  /** POST /api/standing/send {act, slot}, with a 20 second limit. Returns { tone, text, retry }. Never silent. */
  async function sendUpdate(c) {
    const slot = rec().slot;
    if (ctx.sample) return { tone: 'info', text: 'Sample mode: nothing was sent and no server was called. With real numbers this posts the update to the client\'s Slack channel.' };
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), SEND_TIMEOUT);
    const outer = () => ac.abort();
    if (ctx.signal) ctx.signal.addEventListener('abort', outer, { once: true });
    let r;
    try { r = await ctx.api('/api/standing/send', { worker: 'ah', method: 'POST', body: { act: c.act, slot }, signal: ac.signal }); }
    catch (e) {
      if (e && e.status === 404) return { tone: 'info', text: `Sending from ${APP_NAME} is being switched on; use Copy link for now.`, link: true };
      if (e && e.name === 'AbortError') return { tone: 'err', text: 'No answer from the server after 20 seconds. It may still have sent: check the client channel before you try again.', retry: true };
      const m = errText(e);
      if (e && e.status === 409 || /already/i.test(m)) return { tone: 'info', text: 'Already sent for this check-in. ' + m };
      if (/channel/i.test(m)) return { tone: 'err', text: 'No client channel is set for this brand. Set it in Brand settings > People and sending, or use Copy link. (' + m + ')' };
      return { tone: 'err', text: 'Not sent. ' + m, retry: true };
    } finally { clearTimeout(timer); if (ctx.signal) ctx.signal.removeEventListener('abort', outer); }
    const st = String((r && (r.status || r.result)) || '').toLowerCase();
    const at = clockCT((r && Date.parse(r.at || r.sent_at)) || Date.now());
    if (r && (r.already || st === 'already_sent' || st === 'already')) return { tone: 'info', text: `Already sent for this check-in${r.by ? ' by ' + r.by : ''}${r.at || r.sent_at ? ' at ' + at : ''}.` };
    if (r && (r.no_channel || st === 'no_channel')) return { tone: 'err', text: 'No client channel is set for this brand. Set it in Brand settings > People and sending, or use Copy link.' };
    if (r && !r.error && (r.ok || r.sent || st === 'sent')) return { tone: 'ok', text: `Sent to ${r.channel_name || r.channel || r.link || 'the client channel'} at ${at}.`, sent: true };
    return { tone: 'err', text: 'Not sent. ' + ((r && r.error) || 'The server did not say it was sent.'), retry: true };
  }
  function sendSheet(c, d, onDone) {
    const status = h('div'), btns = h('div', { class: 'btns' });
    let busy = false;
    const msgText = cardText(d), cardHost = h('div');
    cardHost.innerHTML = cardHtml(d);
    const drawBtns = res => {
      put(btns,
        res && res.sent ? null : button(busy ? 'Sending...' : res && res.retry ? 'Try again' : 'Send now', { primary: true, large: true, disabled: busy || null, onclick: go }),
        res && res.link ? button('Copy link', { large: true, onclick: () => copyLink(c, d, status) }) : null,
        button(res && res.sent ? 'Close' : 'Cancel', { large: true, disabled: busy || null, onclick: () => sh.close() }));
    };
    async function go() {
      if (busy) return;
      busy = true; put(status, null); drawBtns();
      const res = await sendUpdate(c);
      busy = false;
      put(status, h('div', { class: res.tone, role: res.tone === 'err' ? 'alert' : 'status' }, res.text));
      if (res.sent) { S.sent[c.act + '|' + rec().slot] = res.text; onDone && onDone(res); }
      drawBtns(res);
    }
    const body = h('div', { class: 'wr3-sh' },
      h('p', null, `This goes to ${c.name}'s client channel: the card and these lines.`),
      h('div', { class: 'wr3-msg' }, msgText),
      cardHost, status, btns);
    const sh = closeOnLeave(sheet({ title: `Send the update to ${c.name}?`, body, side: 'right' }));
    drawBtns();
  }
  async function copyLink(c, d, say) {
    try {
      const l = await snapshotLink(c, d);
      try { await navigator.clipboard.writeText(l); toast(ctx.sample ? 'Sample link copied' : 'Link copied'); }
      catch { put(say, h('p', { class: 'dim' }, 'Copy this link: ' + l)); }
    } catch (e) { put(say, h('div', { class: 'err', role: 'alert' }, 'No link. ' + errText(e))); }
  }
  function clientBlock(c) {
    const d = cardData(c), host = h('div');
    host.innerHTML = cardHtml(d);
    const msg = h('div');
    const say = (t, tone) => put(msg, h('div', { class: tone === 'bad' ? 'err' : 'info', role: tone === 'bad' ? 'alert' : 'status' }, t));
    const sentLine = h('div');
    const showSent = () => { const t = S.sent[c.act + '|' + rec().slot]; put(sentLine, t ? h('div', { class: 'ok', role: 'status' }, t) : null); };
    showSent();
    return h('div', { class: 'wr3-cu wr3-sh' },
      host,
      sentLine,
      h('div', { class: 'btns' },
        button('Send to client', { primary: true, onclick: () => sendSheet(c, d, showSent) }),
        button('Copy link', { onclick: e => { const b = e.currentTarget; b.disabled = true; copyLink(c, d, msg).finally(() => { b.disabled = false; }); } })),
      h('div', { class: 'wr3-act' },
        button('Copy as PNG', { onclick: async () => { const r = await copyCard(d, fileOf(c)).catch(e => { say(errText(e), 'bad'); return null; }); if (r) toast(r === 'copied' ? 'Picture copied' : 'This browser cannot copy pictures, so it downloaded instead'); } }),
        button('Download PNG', { onclick: async () => { try { await downloadCard(d, fileOf(c)); } catch (e) { say('Could not draw it. ' + errText(e), 'bad'); } } }),
        button('Download PDF', { onclick: async () => { try { await downloadCardPdf(d, fileOf(c).replace(/\.png$/, '.pdf')); } catch (e) { say('Could not make the PDF. ' + errText(e), 'bad'); } } })),
      msg);
  }
  function clientSheet(c) {
    closeOnLeave(sheet({ title: `${c.name}: client update`, body: clientBlock(c), side: 'right' }));
  }

  /* ---------- the board export (team only): store lines, per brand numbers, campaign calls ---------- */
  function boardModel(list) {
    const R = rec(), recDate = R.today || slotDate(R.slot);
    const hm = heroModel(list);
    const store = ok(hm.sales) ? [`Sales ${money(hm.sales)}${hm.goal ? ` of the ${money(hm.goal)} goal (${Math.round(hm.sales / hm.goal * 100)}%)` : ''}, ad spend ${money(hm.spend)}, store MER ${fx(hm.mer)}${ok(hm.target) ? ` against ${fx(hm.target)} target` : ''}. ${hm.period}${hm.scope ? ', ' + hm.scope.toLowerCase() : ''}.`] : [];
    const tone = (w, c) => !w || !w.readable ? '' : merTone(w.mer, c) === 'good' ? 'good' : merTone(w.mer, c) === 'bad' ? 'bad' : '';
    return {
      title: one && list[0] ? `${list[0].name}: Black Friday War Room` : 'Black Friday War Room',
      when: `${dayLabel(recDate)}, checked ${hourWord(slotHour(R.slot))} CT${S.probing ? ' (earlier check-ins still reading)' : ''}`,
      store,
      brands: list.map(c => {
        const lt = c.gate && c.gate.light ? LIGHT[c.gate.light] : null;
        const W = c.windows, win = (w, label) => w ? { label: w.label || label, mer: w.mer, sales: w.sales, spend: w.spend, readable: !!w.readable, tone: tone(w, c) } : { label, readable: false };
        const pend = pendingOf(c);
        return {
          name: c.name, light: lt ? { word: lt[1], tone: lt[0] } : null,
          goal: ok(c.goal) ? `Target MER ${fx(c.goal)}${ok(c.be) ? `, break-even ${fx(c.be)}` : ''}${c.roas && ok(c.roas.goal) ? `, goal ROAS ${fx(c.roas.goal)}` : ''}` : '',
          windows: [win(W.since, 'Since last check-in'), win(W.today, 'Today'), { ...win(W.week, 'This week'), label: 'This week' }],
          lines: [modeLine(c) || (pend.length ? decisionText(pend[0]) : 'Hold all campaigns')],
          camps: c.camps.map(cp => ({
            name: `${cp.name} (${PLATFORM})`, since: roasTxt(cp.w.since), today: roasTxt(cp.w.today), week: roasTxt(cp.w.week),
            call: callWord(c, cp),
            tone: cp.done ? 'good' : cp.move ? CALL_TONE[cp.call] : '',
            move: cp.done ? `${money(cp.done.to)} a day` : cp.move ? `${money(cp.move.from)} to ${money(cp.move.to)}` : '',
          })),
        };
      }),
      foot: 'Team only. Sales and MER are Triple Whale; campaign ROAS is Triple Whale last click; budgets are Meta.',
    };
  }
  const boardFile = ext => `war-room-${one ? String((calcAll()[0] || {}).name || 'brand').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' : ''}${rec().slot}.${ext}`;
  async function exportBoard(kind, btn) {
    const was = btn && btn.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Drawing...'; }
    try {
      const cv = await boardCanvas(boardModel(calcAll()));
      if (kind === 'copy') { const r = await copyCanvas(cv, boardFile('png')); toast(r === 'copied' ? 'Board copied as a picture' : 'This browser cannot copy pictures, so it downloaded instead'); }
      else if (kind === 'png') await downloadCanvas(cv, boardFile('png'));
      else await downloadPdf([cv], boardFile('pdf'));
    } catch (e) { toast('Could not draw the board: ' + errText(e), { tone: 'bad', ms: 5000 }); }
    finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = was; } }
  }

  /* ---------- refresh and Check now ---------- */
  async function refresh(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Reading...'; }
    try {
      if (ctx.sample) { toast('Sample: read the sample check-in again'); draw(); return; }
      const oldSlot = rec() && rec().slot;
      const r = await ctx.api('/api/standing', { worker: 'ah', signal: ctx.signal });
      if (!alive()) return;
      S.data = { ...S.data, standing: (r && r.standing) || S.data.standing, fetched_at: Date.now() };
      await rereadGoals();
      if (!alive()) return;
      if (rec() && rec().slot !== oldSlot) await newSlot();
      else draw();
    } catch (e) {
      if (!alive()) return;
      toast('Could not read the check-in: ' + errText(e), { tone: 'bad', ms: 5000 });
      if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = 'Refresh'; }
    }
  }
  async function checkNow(btn) {
    btn.disabled = true; btn.textContent = 'Checking...';
    if (ctx.sample) { toast('Sample: no check-in was run'); btn.disabled = false; btn.textContent = 'Check now'; return; }
    try {
      const r = await ctx.api('/api/standing/run', { worker: 'ah', method: 'POST', body: {} });
      if (!r || !r.standing) throw new Error((r && r.error) || 'No check-in came back.');
      if (!alive()) return;
      S.data = { ...S.data, standing: r.standing, fetched_at: Date.now() };
      await rereadGoals();
      if (!alive()) return;
      toast('Checked. Every brand has fresh numbers.', { tone: 'good' });
      await newSlot();
    } catch (e) { if (!alive()) return; toast('Not checked: ' + errText(e), { tone: 'bad', ms: 6000 }); btn.disabled = false; btn.textContent = 'Check now'; }
  }
  /** The goal ROAS list again (on Refresh and Check now), so a failed first read does not stick. */
  async function rereadGoals() {
    if (ctx.sample || ctx.isClient) return;
    try { const goals = await readGoals(ctx); if (!alive()) return; S.data = { ...S.data, goals, goals_error: null }; }
    catch (e) { if (e && e.name === 'AbortError') return; S.data = { ...S.data, goals_error: errText(e) }; }
  }
  /** A new check-in: hold the moves, read the day's changes again (changes made elsewhere count), then the earlier
      check-ins and today by the hour again. */
  async function newSlot() {
    S.probing = true; S.probeId++;
    S.hourCache = {}; S.hourErr = {}; S.warBusy = true;
    draw();
    if (!ctx.sample) {
      try { const acts = await readActs(ctx, one); if (!alive()) return; S.data = { ...S.data, acts }; }
      catch { if (!alive()) return; }                              // keep what we had
    }
    probe();
    readWar();
  }
  if (!ctx.sample) {
    const timer = setInterval(() => {
      if (!alive()) { clearInterval(timer); return; }
      if (document.visibilityState === 'visible') refresh();
    }, 10 * 60e3);
  }

  /* ---------- draw ---------- */
  function help() {
    return pageHelp({ body: [
      { title: 'What it is for', text: `One page for the Black Friday weekend: how the sale is pacing against its goal, which campaign budgets ${APP_NAME} suggests moving, and the plan that was agreed. ${one ? 'This is one brand.' : 'Every brand is here; open a brand for its own page.'}` },
      { title: 'How the calls are made', text: `At every check-in each live campaign is read on its own ROAS (Triple Whale, last click) since the last check-in and today, against the brand's goal ROAS. This week only breaks a tie. The store MER is the gate: while it is over target nothing is cut, and while it is not clear nothing is raised. Nothing changes without a tap, and every change can be undone. A change less than ${READ_HOURS} hours old is marked as not read yet.` },
      { title: 'Store MER and ROAS', text: 'Store MER is the whole store: all sales divided by all ad spend. ROAS is one platform or one campaign: the sales Triple Whale credits to it, divided by its own spend. Hover or tap any dotted label for its meaning.' },
      { title: 'Who sees it', text: 'The team sees everything here. A client sees only the pace and the plan for their own brand, never the calls or the break-even lines. The client update card is what goes to the client.' },
    ] });
  }
  function draw() {
    if (!alive()) return;
    tipHide();
    const d = S.data || {}, R = d.standing;
    const refreshBtn = button('Refresh', { onclick: e => refresh(e.currentTarget) });
    const oldLink = ctx.legacy ? h('a', { class: 'wr3-old hide-sm', href: ctx.legacy }, 'Old ' + APP_NAME) : null;
    if (!R) return put(el, h('div', { class: 'wr3' }, h('div', { class: 'wr3-bar' }, help()), empty({ title: 'No check-in yet', text: d.error || 'The War Room fills in at the first check-in of the season.', action: refreshBtn }), oldLink));
    const list = calcAll();
    if (!list.length) return put(el, h('div', { class: 'wr3' }, h('div', { class: 'wr3-bar' }, help()), empty({ title: 'This brand is not in the check-in', text: 'Only brands with a Black Friday sale are checked.', action: refreshBtn }), oldLink));
    const age = ageH(), fresh = age < 0.5;
    const checkBtn = write ? button('Check now', { disabled: fresh || null, onclick: e => checkNow(e.currentTarget), aria: fresh ? 'Check now: the latest check-in is under 30 minutes old' : 'Check now' }) : null;
    const minCad = Math.min(...list.map(c => c.cadence));
    const sampleSwitch = ctx.sample && f() && f().slots ? segmented(f().slots.map(s => ({ id: s.slot, label: s.label })), R.slot, slot => {
      S.data = { ...S.data, standing: f().records[slot] }; S.done = {}; S.probing = true; draw(); probe();
    }) : null;
    const exports = write ? [
      button('Copy PNG', { ghost: true, class: 'hide-sm', onclick: e => exportBoard('copy', e.currentTarget), aria: 'Copy the board as a picture, team only' }),
      button('Download PNG', { ghost: true, class: 'hide-sm', onclick: e => exportBoard('png', e.currentTarget), aria: 'Download the board as a picture, team only' }),
      button('PDF', { ghost: true, class: 'hide-sm', onclick: e => exportBoard('pdf', e.currentTarget), aria: 'Download the board as a PDF, team only' })] : [];
    const bar = h('div', { class: 'wr3-bar' },
      help(),
      h('span', { class: 'when' }, 'Checked ', h('b', null, `${hourWord(slotHour(R.slot))} CT`), R.next ? `, next ${R.next}` : '', R.dry ? ', dry run: no sale has started' : ''),
      age > minCad + 1 ? h('span', { class: 'lx-stat warn' }, `Check-in is ${agoWords(age * 3600e3)} old`) : null,
      sampleSwitch,
      h('span', { class: 'sp' }),
      h('div', { class: 'btns' }, refreshBtn, checkBtn, ...exports, oldLink));
    hosts.sparks = {};
    hosts.hero = paceHero(heroModel(list));
    hosts.plan = planSection(list);
    const order = [...list].sort((p, q) => (pendingOf(q).length ? 1 : 0) - (pendingOf(p).length ? 1 : 0));
    put(el, h('div', { class: 'wr3' },
      bar,
      hosts.hero,
      needsYes(list),
      h('div', { class: 'wr3-grid' + (one ? ' one' : '') }, order.map(brandCard)),
      hosts.plan));
  }

  draw();
  probe();
  readWar();
}

/* ---------- a client's page: the pace and the plan for their brand, from the war read only ---------- */
function renderClient(el, data, ctx) {
  const w = data.war, today = (w && w.today) || new Date().toISOString().slice(0, 10);
  if (!ctx.brand) return put(el, empty({ title: 'Pick a brand', text: 'Black Friday is one brand at a time.' }));
  if (!w || !w.sale || !w.sale.start) return put(el, empty({ title: 'No Black Friday sale set yet', text: 'When the sale dates and the goal are set, the pace shows here.' }));
  const L = (w.live && !w.live.error) ? w.live : {};
  const so = L.sale_so_far || {}, goals = w.goals_list || [];
  const goal = (goals.find(g => g.metric === 'revenue') || {}).target || null;
  const target = (w.ladder && w.ladder.target) || (goals.find(g => g.metric === 'mer') || {}).target || null;
  const sales = ok(+so.sales) ? +so.sales : null, spend = ok(+so.spend) ? +so.spend : null;
  const hs = hourSeries([w]);
  const m = {
    period: `${dayLabel(w.sale.start)} 12am CT to now`, sales, goal, spend, mer: sales != null && spend > 0 ? sales / spend : null, target, be: null,
    none: today < w.sale.start ? `The sale starts ${dayLabel(w.sale.start)}` : 'No sales read yet',
    phases: phasesOfWar(w) || SEASON, today, hours: hs, hourScope: 'whole store, Central time', hourNote: '',
  };
  const bf = (w.phases || []).find(p => p.key === 'bf');
  const row = { act_id: ctx.brand.id, name: ctx.brand.name, offer: w.bf_offer || (bf && bf.offer) || '', sale: w.sale, goal, target, steps: Array.isArray(w.steps) ? w.steps : null };
  put(el, h('div', { class: 'wr3' },
    h('div', { class: 'wr3-bar' }, pageHelp({ body: [
      { title: 'What it is for', text: 'How your Black Friday sale is pacing against the goal we agreed, today by the hour, and the plan for the sale.' },
      { title: 'Store MER', text: 'The whole store: all sales divided by all ad spend. Hover or tap any dotted label for its meaning.' },
    ] })),
    paceHero(m),
    card({ title: 'The plan', note: 'what was agreed for the sale', flush: true }, planTable([row], { team: false, waiting: false }))));
}
