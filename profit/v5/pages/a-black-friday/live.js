/* Black Friday > War Room (v2). Shared by the agency page (a-black-friday/war-room.js, every brand) and the brand page
   (black-friday/war-room.js, one brand). The math is in ../_warcall.js; the client card is in ./_card.js.

   Every live campaign gets its own call from three windows (Since last check-in, Today, This week), on its own ROAS
   (Triple Whale attributed, last click) against the campaign ROAS line (the brand's goal ROAS holds; break-even ROAS
   from the record, else goal ROAS / 1.25, stated on the page), with the store MER as the gate. MER is the whole store
   only. Guards: budget pace, room under the Meta limit, and a warning (never a wait) when the last change on a campaign
   is too new or has spent too little to read. Every campaign row also has "Set budget": any amount by hand, through the
   same sheet (dry run, client line, big change tick over 50%, Undo).

   Reads (one at a time, never in parallel):
     ah       GET /api/standing                              the latest check-in (again every 10 minutes while visible)
     profit   GET /api/season?act=all|<id>                   answers.checkin_hours per brand (the check-in rhythm)
     ah       GET /api/activities?act=all|<id>&from=&limit=  the last budget change per campaign, and what we changed
     ah       GET /api/brands                                goal ROAS (target_roas) per brand, when the record has none
     ah       GET /api/standing?slot=<earlier>               the previous check-in, walked back hour by hour (max 12,
                                                             cached in sessionStorage by slot), after the first paint
     profit   GET /api/season/war?act=<id>&live=1            today by the hour, only when a brand's hour sheet opens
     profit   GET /api/hub/paid?platform=meta&act=<id>&model=fullFirstClick&cmp=none&from=<Monday>&to=<today>
                                                             the full picture per campaign (link clicks, CTR, add to
                                                             carts, checkouts, video views, Triple Whale first click,
                                                             Meta's own purchases), only when a campaign sheet opens,
                                                             one request per brand per check-in (cached)
   How the call is made (rule w2): Since last check-in and Today decide; This week is context that only breaks a tie or
   adds a note, and never blocks a raise. While the store is over goal nothing is cut (weak reads Hold, needs new ads).
   Exports, all in the browser (./_export.js, no route, no library): the client card and the whole board can be copied
   as a PNG, downloaded as a PNG or a PDF; the card's Copy link is the existing snapshot below. The board is team only.
   Writes (team only, each after a tap; sample mode never calls one):
     ah       POST /api/meta/write {act, kind:'budget', level:'campaign', object, amount, reason, client_why, dry:true}
              then the same body without dry, plus expect {daily_budget} from the dry run (and big:true over 50%)
     ah       POST /api/standing/approve {slot, act}         instead of the write, when the page's move equals the
                                                             check-in's own (same campaign and amount), so Slack fills in
     ah       POST /api/meta/undo {act, write}               Undo (through the shared confirm sheet)
     profit   PUT  /api/season/answer {act, key:'checkin_hours', value}   the brand's check-in rhythm
     ah       POST /api/standing/run {}                      Check now (a fresh record for every brand; no Slack)
     profit   POST /api/snapshot {act, kind:'card', title, html, css, days:30}   the client card's public link */

import { APP_NAME } from '../../config.js';
import { h, put, money, x, statusDot, pill, button, card, hero, empty, sheet, toast, addStyles, segmented, platformChip } from '../../kit.js';
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
.wr2{display:grid;gap:14px;min-width:0}
.wr2-top{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}
.wr2-top .grow{flex:1;min-width:200px;display:grid;gap:4px}
.wr2-top .when{font-size:20px;font-weight:650;letter-spacing:-.02em}
.wr2-top .sub{font-size:13px;color:var(--muted);line-height:1.45}
.wr2-top .btns{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wr2-old{font-size:12.5px;color:var(--muted);text-decoration:underline}
.wr2-amber{color:var(--warn);background:var(--warn-bg);border-radius:10px;padding:6px 10px;font-size:12.5px;line-height:1.45}
.wr2-wk{font-size:14px;color:var(--ink-2);font-variant-numeric:tabular-nums;line-height:1.5}
.wr2-wk b{font-size:17px;color:var(--ink)}
.wr2-need{display:grid;gap:10px}
.wr2-ask{display:grid;gap:6px;padding:12px 0;border-top:1px solid var(--line)}
.wr2-ask:first-child{border-top:0;padding-top:0}
.wr2-ask b{font-size:15px;letter-spacing:-.01em;overflow-wrap:anywhere}
.wr2-ask p{margin:0;font-size:13px;line-height:1.5;color:var(--ink-2);overflow-wrap:anywhere}
.wr2-ask p.dim{color:var(--muted)}
.wr2-act{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.wr2-act .lx-btn{min-height:44px}
.wr2-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,520px),1fr));gap:14px;align-items:start}
.wr2-b{display:grid;gap:12px;min-width:0}
.wr2-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px}
.wr2-h .nm{font-size:19px;font-weight:650;letter-spacing:-.02em}
.wr2-h .goal{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.wr2-chip{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;border-radius:999px;border:1px solid var(--line-strong);background:var(--surface);font:inherit;font-size:12.5px;color:var(--ink-2);cursor:pointer}
.wr2-chip[disabled]{cursor:default}
.wr2-w{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.wr2-w>div{background:var(--surface-2);border-radius:14px;padding:10px 12px;display:grid;gap:3px;min-width:0}
.wr2-w .lab{font-size:12px;color:var(--muted)}
.wr2-w .mer{font-size:22px;font-weight:650;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.wr2-w .good{color:var(--good)}.wr2-w .bad{color:var(--bad)}.wr2-w .off{color:var(--muted)}
.wr2-w .ln{font-size:12.5px;color:var(--ink-2);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.wr2-w .gray{font-size:11.5px;color:var(--muted)}
.wr2-gate{font-size:13px;line-height:1.5;color:var(--ink-2)}
.wr2-c{display:grid;border-top:1px solid var(--line)}
.wr2-row{border-bottom:1px solid var(--line);display:grid;min-width:0}
.wr2-ra{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:0 4px 10px}
.wr2-ra .lx-btn{min-height:40px}
.wr2-ra .dim{font-size:12px;color:var(--muted)}
.wr2-roas{font-size:12px;color:var(--muted);line-height:1.45;margin:0 0 4px}
.wr2-r{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1.6fr) auto;gap:4px 10px;padding:10px 4px;border:0;background:none;font:inherit;text-align:left;color:inherit;cursor:pointer;align-items:center;min-height:44px;width:100%}
.wr2-r:hover{background:var(--surface-2)}
.wr2-r .nm{min-width:0;overflow-wrap:anywhere;font-size:13.5px;font-weight:600}
.wr2-r small{display:block;font-size:11.5px;color:var(--muted);font-weight:400}
.wr2-r .nums{font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink-2);min-width:0}
.wr2-r .nums i{font-style:normal;color:var(--muted)}
.wr2-r .warn{grid-column:1/-1;font-size:12px;color:var(--warn)}
.wr2-foot{font-size:12.5px;color:var(--muted);line-height:1.5}
.wr2-sh{display:grid;gap:12px}
.wr2-sh dl{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 14px;margin:0;font-size:14px}
.wr2-sh dt{color:var(--muted)}
.wr2-sh dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.wr2-sh .big{font-size:22px;font-weight:650;letter-spacing:-.02em}
.wr2-sh p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.wr2-sh p.dim{color:var(--muted);font-size:12.5px}
.wr2-sh label{display:grid;gap:6px;font-size:13px;color:var(--muted)}
.wr2-sh .lx-input{font-size:15px;color:var(--ink)}
.wr2-sh textarea.lx-input{min-height:72px}
.wr2-sh .tick{display:flex;gap:10px;align-items:center;color:var(--ink);min-height:44px}
.wr2-sh .tick input{width:22px;height:22px}
.wr2-sh .btns{display:flex;flex-wrap:wrap;gap:8px}
.wr2-sh .btns .lx-btn{min-height:48px;flex:1 1 180px}
.wr2-sh .err{background:var(--bad-bg);color:var(--bad);border-radius:12px;padding:10px 12px;font-size:13.5px}
.wr2-sh .ok{background:var(--good-bg);color:var(--good);border-radius:12px;padding:10px 12px;font-size:13.5px}
.wr2-tb{display:grid;font-size:13px;font-variant-numeric:tabular-nums}
.wr2-tb>div{display:grid;grid-template-columns:minmax(0,1.1fr) repeat(3,minmax(0,1fr));gap:6px;padding:7px 0;border-bottom:1px solid var(--line)}
.wr2-tb .hd{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.wr2-hr>div{grid-template-columns:minmax(0,.8fr) repeat(3,minmax(0,1fr))}
.wr2-cu{display:grid;gap:12px;min-width:0}
.wr2-pic{display:grid;gap:8px;border-top:1px solid var(--line);padding-top:12px}
.wr2-pic h4{margin:0;font-size:14px;font-weight:650;letter-spacing:-.01em}
.wr2-pic .lead{font-size:13.5px;font-weight:600;color:var(--ink)}
.wr2-pic dl{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:6px 12px;margin:0;font-size:13.5px}
.wr2-pic dt{color:var(--muted);overflow-wrap:anywhere}
.wr2-pic dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.wr2-pic dd.na{font-weight:400;color:var(--muted)}
.wr2-cu .wcc{max-width:100%}
@media (max-width:759px){
  .wr2-w{grid-template-columns:1fr}
  .wr2-w>div{grid-template-columns:auto 1fr;align-items:baseline;column-gap:12px}
  .wr2-w .mer{grid-row:span 4;font-size:20px;min-width:64px}
  .wr2-r{grid-template-columns:minmax(0,1fr) auto}
  .wr2-r .nums{grid-column:1/-1;grid-row:2}
  .wr2-top .btns{width:100%}
  .wr2-top .btns .lx-btn{flex:1;min-height:44px}
  .wr2-act .lx-btn{flex:1 1 auto}
  .wr2-ra .lx-btn{flex:1 1 auto;min-height:44px}
}`;

const ok = n => n != null && isFinite(n);
const SAMPLE_MSG = 'Sample: nothing was changed';
const LIGHT = { green: ['good', 'Store MER over goal'], amber: ['warn', 'Store MER not clear'], red: ['bad', 'Store MER under break-even'] };
const CALL_TONE = { raise50: 'good', raise25: 'good', cut: 'bad', putback: 'bad', hold: '' };
const fx = v => ok(v) ? v.toFixed(2) + 'x' : 'n/a';
const usd = v => ok(v) ? money(v) : 'n/a';

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

/** The first read: the latest check-in, the cadence answers and the last day of changes, one after another. */
export async function readStanding(ctx) {
  const one = oneBrand(ctx);
  if (ctx.sample) {
    const f = await fixture('a-black-friday/_sample/war-room.json');
    const slot = f.latest;
    return { sample: f, standing: f.records[slot] || null, answers: f.answers || {}, acts: f.activities || [], goals: f.goals || {}, fetched_at: Date.now() };
  }
  const r = await ctx.api('/api/standing', { worker: 'ah', signal: ctx.signal });
  const standing = (r && r.standing) || null;
  const out = { standing, answers: {}, acts: [], goals: {}, fetched_at: Date.now() };
  if (!standing) return out;
  if (!ctx.isClient || ctx.asClient) {
    try {
      const s = await ctx.api('/api/season?act=' + encodeURIComponent(one || 'all'), { signal: ctx.signal });
      for (const a of (s && s.accounts) || []) out.answers[a.act_id] = a.answers || {};
    } catch (e) { if (e && e.name === 'AbortError') throw e; out.season_error = errText(e); }
    try {
      out.acts = await readActs(ctx, one);
    } catch (e) { if (e && e.name === 'AbortError') throw e; out.acts_error = errText(e); }
    /* the campaign ROAS line: goal ROAS from the brand list, used when the check-in record carries none */
    if (!ctx.isClient) {
      try { out.goals = await readGoals(ctx); }
      catch (e) { if (e && e.name === 'AbortError') throw e; out.goals_error = errText(e); }
    }
  }
  return out;
}

/* ---------- the page ---------- */
export function renderWarRoom(el, data, ctx, { one = null } = {}) {
  addStyles('wr2-css', CSS);
  addStyles('wcc-css', CARD_CSS);
  const write = canWrite(ctx);
  /* The router hands every page the same view element and can render this page twice (saved copy, then fresh), so
     each render owns a token: an older render, or one whose route was left, stops drawing, probing and polling. */
  const token = Symbol('war-room');
  el.__wr = token;
  const alive = () => el.__wr === token && !(ctx.signal && ctx.signal.aborted);
  const S = {
    data: data || {}, prevs: {}, records: [], probing: true, probeFails: 0, probeId: 0,
    done: {}, links: {}, linkBusy: {}, hourCache: {}, picture: {},
  };
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

  /* ---------- parts ---------- */
  const merTone = (mer, c) => !ok(mer) || !ok(c.goal) ? '' : mer >= c.goal ? 'good' : ok(c.be) && mer < c.be ? 'bad' : '';
  function windowBox(w, c, label, context = false) {
    if (!w) return h('div', null, h('span', { class: 'lab' }, label), h('span', { class: 'mer off' }, S.probing ? 'Reading...' : 'No earlier check-in'));
    const noSales = c.mode === 'no_sales';
    return h('div', null,
      h('span', { class: 'lab' }, w.label || label),
      h('span', { class: 'mer ' + (w.readable && !noSales ? merTone(w.mer, c) : 'off'), title: 'MER: store sales over all ad spend' }, noSales ? usd(w.spend) : fx(w.mer)),
      noSales ? h('span', { class: 'ln' }, 'Ad spend (no sales source)') : h('span', { class: 'ln' }, 'Sales ' + usd(w.sales)),
      noSales ? null : h('span', { class: 'ln' }, 'Ad spend ' + usd(w.spend)),
      !w.readable ? h('span', { class: 'gray' }, 'Too little to read') : w.synced ? h('span', { class: 'gray' }, "Yesterday's part from the nightly sync") : null,
      context ? h('span', { class: 'gray' }, 'Context: only breaks a tie') : null);
  }
  const roasTxt = w => !w ? '...' : w.readable ? fx(w.roas) : w.no_tw ? 'no TW sales' : 'too little';
  /** The campaign ROAS line in words: goal ROAS holds, break-even ROAS (and whether it is assumed). */
  const assumedWhy = r => r.reason === 'over_goal' ? `assumed: goal ROAS / ${BE_ROAS_DIV}, the ${fx(r.rec)} break-even ROAS on record is over the goal` : `assumed: goal ROAS / ${BE_ROAS_DIV}, no break-even ROAS on record`;
  const roasLineText = c => {
    if (c.roas && ok(c.roas.goal)) return `Campaign ROAS line: goal ROAS ${fx(c.roas.goal)} holds, break-even ROAS ${fx(c.roas.be)}${c.roas.assumed ? ` (${assumedWhy(c.roas)})` : ''}.`;
    const red = c.gate && c.gate.light === 'red' ? ' The store MER is under break-even, but no cut is forced without it.' : '';
    return (c.roas && c.roas.unread ? 'The goal ROAS could not be read, so no campaign calls. Tap Refresh to read it again.' : 'No goal ROAS set for this brand, so no campaign calls. Set it in Brand settings > Goals.') + red;
  };
  /** Who owns the budget on this brand, said in the budget sheets (watch: the client runs it; client_approve: the client says yes first). */
  const ownerNote = c => c.mode === 'watch' ? 'The client runs this budget. Change it only when the client asked you to.'
    : c.b && c.b.client_approve ? 'The client approves budget changes on this brand. Change it only after the client said yes in Slack.' : '';
  function moveTitle(c, cp) {
    const m = cp.move, pc = Math.round(m.pct * 100);
    const verb = cp.call === 'putback' ? 'put back' : m.to > m.from ? 'raise' : 'cut';
    return `${c.name}: ${verb} ${cp.name} ${money(m.from)} to ${money(m.to)} (${pc > 0 ? '+' : ''}${pc}%)`;
  }
  const windowsLine = (c, cp) => `ROAS (Triple Whale): ${c.windows.since ? c.windows.since.label : 'Since last check-in'} ${roasTxt(cp.w.since)} · Today ${roasTxt(cp.w.today)} (these two decide) · Week ${roasTxt(cp.w.week)} (context), goal ROAS ${c.roas && ok(c.roas.goal) ? fx(c.roas.goal) : 'not set'}. Store MER ${fx(c.windows.today.mer)} today, MER goal ${fx(c.goal)}.`;
  const gateLine = c => c.gate && c.gate.light ? `${LIGHT[c.gate.light][1]}: ${c.gate.why}${c.gate.note ? ' ' + c.gate.note : ''}` : '';

  function modeLine(c) {
    const b = c.b;
    if (ctx.isClient) return c.mode === 'plan' ? 'The sale has not started yet.' : c.mode === 'after' ? 'The sale has ended.' : '';
    if (c.mode === 'watch') return (b.suggest && b.suggest.why) || 'Updates only: the client runs this budget.';
    if (c.mode === 'no_sales') return 'No Triple Whale store, check Shopify. Spend against budget only.';
    if (c.mode === 'plan') return 'The sale has not started: numbers only.';
    if (c.mode === 'after') return 'The sale has ended: numbers only.';
    if (c.mode === 'error') return 'No live numbers: ' + (b.error || 'Triple Whale did not answer.');
    if (c.mode === 'meta_error') return 'Meta did not answer: ' + ((b.meta && b.meta.error) || '');
    return '';
  }
  const ageH = () => (nowOf() - Date.parse(rec().at)) / 3600e3;

  function campRow(c, cp) {
    const word = cp.done ? 'Done' : cp.move && S.probing ? 'Reading...' : cp.move ? CALL_WORD[cp.call] : c.mode === 'live' && c.gate.light ? (cp.needs_ads ? 'Hold, needs new ads' : cp.early ? 'Hold, too early' : CALL_WORD[cp.call]) : 'Numbers';
    const tone = cp.done ? 'good' : cp.move && !S.probing ? CALL_TONE[cp.call] : '';
    const spentTxt = cp.daily ? `${money(cp.spent)} of ${money(cp.daily)}${ok(cp.pace) ? `, pace ${Math.round(cp.pace * 100)}%` : ''}` : `${money(cp.spent)} (ad set budgets)`;
    const row = h('button', { class: 'wr2-r', type: 'button', onclick: () => campSheet(c, cp), 'aria-label': `${cp.name}: ${word}` },
      h('span', { class: 'nm' }, cp.name, h('small', null, spentTxt)),
      ctx.isClient ? h('span', { class: 'nums' }) : h('span', { class: 'nums' }, h('i', null, 'Since '), roasTxt(cp.w.since), h('i', null, ' · Today '), roasTxt(cp.w.today), h('i', null, ' · Week '), roasTxt(cp.w.week)),
      pill(tone, word),
      cp.warn ? h('span', { class: 'warn' }, cp.warn) : null);
    return h('div', { class: 'wr2-row' }, row, rowActions(c, cp));
  }
  /** The suggestion first (when there is one), then Set budget on every campaign, and Undo after a change from here. */
  const hasSuggestion = (c, cp) => !!(cp.move && !cp.done && !cp.dismissed && !S.probing && c.mode === 'live');
  function rowActions(c, cp) {
    if (!write || ctx.isClient) return null;
    if (cp.abo) return h('div', { class: 'wr2-ra' }, h('span', { class: 'dim' }, 'Ad set budgets: set them by hand in Ads Manager.'));
    return h('div', { class: 'wr2-ra' },
      hasSuggestion(c, cp) ? button(`${CALL_WORD[cp.call]}: ${money(cp.move.to)} a day`, { primary: true, onclick: () => approveSheet(c, cp) }) : null,
      button('Set budget', { onclick: () => approveSheet(c, cp, { typed: true, manual: true }), aria: `Set the budget on ${cp.name} by hand` }),
      cp.done && cp.done.write ? button('Undo', { onclick: () => undo(c, cp) }) : null);
  }

  function brandCard(c) {
    const b = c.b, cad = c.cadence, R = rec(), hourNow = central(nowOf()).hour;
    const due = isDue(cad, R.slot, nowOf()), old = ageH() > cad + 1;
    const lt = c.gate && c.gate.light && !S.probing ? LIGHT[c.gate.light] : null;
    const sinceNote = S.probing ? 'Reading the earlier check-ins...'
      : !c.prvRec && c.mode === 'live' ? `No earlier check-in${S.probeFails ? ` (${S.probeFails} could not be read)` : ''}, Since not checked.` : '';
    const chip = h('button', { class: 'wr2-chip', type: 'button', disabled: !write || null, onclick: write ? () => cadenceSheet(c) : null, 'aria-label': `Check-in every ${cad} hours. Change it` },
      `every ${cad}h, next ${nextDue(cad, Math.max(hourNow, c.recHour))}`);
    const mline = modeLine(c);
    return card({ class: 'wr2-b' },
      h('div', { class: 'wr2-h' }, h('span', { class: 'nm' }, b.name), lt && !ctx.isClient ? statusDot(lt[0], lt[1]) : null,
        ok(c.goal) ? h('span', { class: 'goal' }, `MER goal ${fx(c.goal)}${ok(c.be) && !ctx.isClient ? `, break-even MER ${fx(c.be)}` : ''}`) : null,
        ctx.isClient ? null : chip,
        !ctx.isClient && due ? pill('warn', 'Check-in due') : null,
        !ctx.isClient && old ? pill('warn', 'Check-in is old') : null),
      h('div', { class: 'wr2-w' }, windowBox(c.windows.since, c, 'Since last check-in'), windowBox(c.windows.today, c, 'Today'), windowBox(c.windows.week, c, 'This week', !ctx.isClient)),
      mline ? h('p', { class: 'wr2-gate' }, mline) : null,
      !ctx.isClient && sinceNote ? h('p', { class: 'wr2-amber' }, sinceNote) : null,
      !ctx.isClient && c.gate && c.gate.light && !S.probing ? h('p', { class: 'wr2-gate' }, gateLine(c)) : null,
      ctx.isClient ? null : h('div', null,
        h('div', { class: 'wr2-h', style: { marginBottom: '4px' } }, platformChip('meta'), h('span', { class: 'goal' }, 'Campaigns: Since · Today · Week, ROAS (Triple Whale, last click). Since and Today decide, Week is context.')),
        h('p', { class: 'wr2-roas' }, roasLineText(c)),
        c.roas && c.roas.unread ? h('div', { class: 'wr2-ra' }, button('Refresh', { onclick: e => refresh(e.currentTarget), aria: 'Read the goal ROAS again' })) : null,
        c.camps.length ? h('div', { class: 'wr2-c' }, c.camps.map(cp => campRow(c, cp))) : h('p', { class: 'wr2-foot' }, 'No live campaign in Meta.')),
      ctx.isClient ? null : h('div', { class: 'wr2-act' },
        button('Today by the hour', { onclick: () => hourSheet(c) }),
        one ? null : button('Client update', { onclick: () => clientSheet(c) })),
      one || ctx.isClient ? clientBlock(c) : null);
  }

  function needsYes(list) {
    if (S.probing) return card({ title: 'Needs your yes' }, h('p', { class: 'wr2-foot' }, 'Reading the earlier check-ins...'));
    const rows = [];
    for (const c of list) for (const cp of c.camps) if (cp.move && !cp.abo && !cp.done && !cp.dismissed && c.mode === 'live') rows.push([c, cp]);
    rows.sort((p, q) => {
      const down = r => r[1].move.to < r[1].move.from ? 0 : 1;
      return down(p) - down(q) || Math.abs(q[1].move.to - q[1].move.from) - Math.abs(p[1].move.to - p[1].move.from);
    });
    if (!rows.length) return card({ title: 'Needs your yes' }, h('p', { class: 'wr2-foot' }, 'Nothing right now. Every campaign is on Hold.'));
    return card({ title: 'Needs your yes', note: `${rows.length} ${rows.length === 1 ? 'call' : 'calls'}` },
      h('div', { class: 'wr2-need' }, rows.map(([c, cp]) => h('div', { class: 'wr2-ask' },
        h('b', null, moveTitle(c, cp)),
        h('p', null, windowsLine(c, cp)),
        h('p', { class: 'dim' }, cp.why),
        h('p', { class: 'dim' }, gateLine(c)),
        cp.warn ? h('p', { class: 'wr2-amber' }, cp.warn) : null,
        cp.notes.length ? h('p', { class: 'dim' }, cp.notes.join(' ')) : null,
        write ? h('div', { class: 'wr2-act' },
          button(c.b.client_approve ? 'The client said yes, apply' : 'Approve', { primary: true, onclick: () => approveSheet(c, cp) }),
          button('Set budget', { onclick: () => approveSheet(c, cp, { typed: true, manual: true }) }),
          button('Not now', { onclick: () => { setNotNow(rec().slot, cp.id); draw(); } }))
          : h('p', { class: 'dim' }, 'Your access is read only, so you cannot approve this.')))));
  }

  function weekendLine(list) {
    const okb = list.filter(c => !c.b.no_sales && c.b.so_far && ok(c.b.so_far.sales));
    const sales = okb.reduce((t, c) => t + c.b.so_far.sales, 0), spend = okb.reduce((t, c) => t + (c.b.so_far.spend || 0), 0);
    const goal = okb.reduce((t, c) => t + (c.b.goal || 0), 0);
    if (!okb.length) return null;
    return h('p', { class: 'wr2-wk' }, 'Weekend so far: ', h('b', null, money(sales)), goal ? ` of the ${money(goal)} goal (${Math.round(sales / goal * 100)}%)` : '', ` on ${money(spend)} of ads, store MER `, h('b', null, fx(spend > 0 ? sales / spend : null)), '.');
  }

  /* ---------- sheets ---------- */
  function closeOnLeave(s) {
    const off = () => { window.removeEventListener('hashchange', off); if (s.el.isConnected) s.close(); };
    window.addEventListener('hashchange', off);
    return s;
  }

  function campSheet(c, cp) {
    const picHost = h('div');
    const W = cp.w, rowOf = (lab, w) => h('div', null, h('span', null, lab),
      h('span', null, w ? usd(w.spend) : '...'), h('span', null, w ? usd(w.rev) : '...'), h('span', null, w && ok(w.roas) ? fx(w.roas) : 'n/a'));
    const s = c.b.suggest || {}, m = c.b.meta || {};
    const slackSaid = m.camp && String(m.camp.id) === cp.id && s.to && cp.move && Math.round(s.to) !== Math.round(cp.move.to)
      ? `The Slack check-in said ${money(m.camp.daily)} to ${money(s.to)} on this campaign; the page says ${money(cp.move.to)}.`
      : m.camp && String(m.camp.id) === cp.id && s.to && !cp.move ? `The Slack check-in said ${money(m.camp.daily)} to ${money(s.to)}; the page holds.` : '';
    const body = h('div', { class: 'wr2-sh' },
      h('p', null, h('b', null, cp.move ? moveTitle(c, cp) : (cp.needs_ads ? 'Hold, needs new ads' : CALL_WORD[cp.call] || 'Hold') + ': ' + cp.name)),
      cp.why ? h('p', null, cp.why) : null,
      ctx.isClient ? null : h('div', { class: 'wr2-tb', role: 'table' },
        h('div', { class: 'hd' }, h('span', null, 'Window'), h('span', null, 'Spend'), h('span', null, 'Sales'), h('span', null, 'ROAS')),
        rowOf(c.windows.since ? c.windows.since.label : 'Since last', W.since), rowOf('Today', W.today), rowOf('This week', W.week)),
      ctx.isClient ? null : h('p', null, roasLineText(c)),
      ctx.isClient ? null : h('p', { class: 'dim' }, 'ROAS is this campaign\'s Triple Whale attributed sales (last click) over its own spend. Since last check-in and Today decide the call; This week only breaks a tie or adds a note. MER is the whole store only. Last click undercounts the campaigns that open the funnel (broad new people), which is why the store gate holds cuts while the store MER is over goal.'),
      ctx.isClient ? null : picHost,
      h('dl', null,
        h('dt', null, 'Budget'), h('dd', null, cp.daily ? money(cp.daily) + ' a day' : 'Ad set budgets'),
        h('dt', null, 'Spent today'), h('dd', null, money(cp.spent) + (ok(cp.pace) ? `, pace ${Math.round(cp.pace * 100)}%` : '')),
        ok(m.limit) ? h('dt', null, 'Meta limit') : null, ok(m.limit) ? h('dd', null, `${money(m.limit)} a day${m.limit_src === 'known' ? ' (last known)' : ''}`) : null,
        cp.last ? h('dt', null, 'Last change') : null, cp.last ? h('dd', null, `${clockCT(cp.last.at)}, ${agoWords(nowOf() - cp.last.at)} ago, $${Math.round(cp.last.spent_since)} spent since${cp.last.read ? ', read' : ', not read yet'}`) : null),
      cp.warn ? h('p', { class: 'wr2-amber' }, cp.warn) : null,
      cp.notes.length ? h('p', { class: 'dim' }, cp.notes.join(' ')) : null,
      !ctx.isClient && ownerNote(c) ? h('p', { class: 'wr2-amber' }, ownerNote(c)) : null,
      slackSaid ? h('p', { class: 'dim' }, slackSaid) : null,
      cp.done ? h('div', { class: 'ok' }, `Done, ${money(cp.done.to)} a day, by ${cp.done.by} at ${clockCT(Date.parse(cp.done.at))}.`) : null,
      h('div', { class: 'btns' },
        write && !ctx.isClient && hasSuggestion(c, cp) ? button(`${CALL_WORD[cp.call]}: ${money(cp.move.to)} a day`, { primary: true, large: true, onclick: () => { sh.close(); approveSheet(c, cp); } }) : null,
        cp.abo || !write || ctx.isClient ? null : button('Set budget', { large: true, onclick: () => { sh.close(); approveSheet(c, cp, { typed: true, manual: true }); } }),
        cp.done && cp.done.write ? button('Undo', { large: true, onclick: () => { sh.close(); undo(c, cp); } }) : null,
        button('Close', { large: true, onclick: () => sh.close() })));
    const sh = closeOnLeave(sheet({ title: `${c.name}: ${cp.name}`, body, side: 'right' }));
    if (!ctx.isClient) fillPicture(c, cp, picHost);
  }

  /* ---------- the full picture for one campaign (rule w1), read only when its sheet opens ---------- */
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
    put(host, h('div', { class: 'wr2-pic' }, h('h4', null, 'The full picture, this week'), h('p', { class: 'dim' }, 'Reading...')));
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
    /* last click from the check-in record (the number the call uses), this week */
    /* a campaign with no Triple Whale sales on record is not read, so its 0 is not shown as a reading */
    const lcOrd = !cp.no_tw && ok(+raw.w_ord) ? +raw.w_ord : null, lcRoas = !cp.no_tw && cp.w.week && ok(cp.w.week.roas) ? cp.w.week.roas : null;
    /* first click: the worker turns missing credit into 0, so a brand with no first click credit at all this week
       (not synced, or not landed yet) reads as not available rather than 0 sales */
    const noFc = !!P && P.camps.some(x => x.spend > 0) && P.camps.every(x => !(+x.purchases) && !(+x.revenue));
    const fcOrd = m && !noFc ? n0(m.purchases) : null;
    const fcRoas = m && !noFc && m.spend > 0 && ok(m.revenue) ? m.revenue / m.spend : null;
    const plRoas = m && m.spend > 0 && ok(m.platform_revenue) ? m.platform_revenue / m.spend : null;
    const views = m && ok(m.hook) && ok(m.impressions) ? Math.round(m.hook * m.impressions) : null;
    put(host, h('div', { class: 'wr2-pic' },
      h('h4', null, 'The full picture, this week'),
      h('p', { class: 'lead' }, 'These are the numbers to look at; the call is a starting point, not a rule.'),
      P ? h('p', { class: 'dim' }, `Meta rows ${dayLabel(P.from)} to ${dayLabel(P.to)}. They land overnight, so today may be partly missing.`) : null,
      err ? h('p', { class: 'dim' }, 'Could not read the Meta rows: ' + err) : null,
      P && !m ? h('p', { class: 'dim' }, 'No Meta rows for this campaign this week yet.') : null,
      h('dl', null,
        row('Ad spend (Meta)', m ? usd(m.spend) : null),
        row('Link clicks · CTR', m ? both(n0(m.clicks), pct(m.ctr)) : null),
        row('CPM · frequency', m ? both(ok(m.cpm) ? usd(m.cpm) : null, ok(m.frequency) ? m.frequency.toFixed(2) : null) : null),
        row('Add to carts · cost per add to cart', m ? both(n0(m.atc), ok(m.cost_per_atc) ? usd(m.cost_per_atc) : null) : null),
        row('Checkouts started', m && m.checkouts != null ? n0(m.checkouts) : null),
        row('Video views (3 seconds)', views != null && views > 0 ? n0(views) : null),
        row('Triple Whale, last click: sales · ROAS', both(lcOrd != null ? n0(lcOrd) : null, ok(lcRoas) ? fx(lcRoas) : null)),
        row('Triple Whale, first click: sales · ROAS', m ? both(fcOrd, ok(fcRoas) ? fx(fcRoas) : null) : null),
        row('Meta reports: purchases · ROAS', m ? both(n0(m.platform_purchases), ok(plRoas) ? fx(plRoas) : null) : null)),
      h('p', { class: 'dim' }, 'Last click is what the call reads. First click shows the campaigns that open the funnel. "Meta reports" is Meta\'s own count, a second opinion only: it usually runs higher than Triple Whale.')));
  }

  /* ---------- the one tap: dry run, then the write ---------- */
  /* manual: "Set budget", any amount by hand. Same sheet, same dry run, client line, big change tick and Undo. */
  function approveSheet(c, cp, { typed = false, note = '', manual = false } = {}) {
    if (!write || ctx.isClient || (S.probing && !manual)) return;
    const R = rec();
    /* after a change from this page, Meta has the new figure, so a hand-set starts from it */
    const from = manual && cp.done && ok(cp.done.to) ? cp.done.to : cp.daily;
    if (!from) { toast('Ad set budgets: change this one by hand in Ads Manager.'); return; }
    const start = !manual && cp.move ? cp.move.to : from;
    const amount = h('input', { class: 'lx-input', type: 'number', min: String(MIN_BUDGET), step: '5', inputmode: 'decimal', pattern: '[0-9]*', enterkeyhint: 'done', value: String(start), 'aria-label': 'New daily budget' });
    const jump = h('input', { type: 'checkbox' });
    const jumpWrap = h('label', { class: 'tick', hidden: true }, jump, 'I mean this jump');
    const whyNote = h('p', { class: 'dim', hidden: true }), gateNote = h('p', { class: 'wr2-amber', hidden: true });
    const light = c.gate && c.gate.light;
    const why = h('textarea', { class: 'lx-input', maxlength: '600', rows: '2', 'aria-label': 'What the client will read' });
    why.value = manual ? '' : clientWhy(cp.move ? cp : { ...cp, move: { from, to: start } }) || `We changed the budget on ${cp.name}.`;
    if (manual) why.placeholder = 'Fills in when you type an amount';
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
    const body = h('div', { class: 'wr2-sh' },
      note ? h('p', { class: 'wr2-amber' }, note) : null,
      owner ? h('p', { class: 'wr2-amber' }, owner) : null,
      h('dl', null,
        h('dt', null, 'Campaign'), h('dd', null, `${c.name}: ${cp.name}`),
        h('dt', null, 'Today'), h('dd', null, `${money(from)} a day, ${money(cp.spent)} spent`),
        h('dt', null, 'Check-in'), h('dd', null, R.label || R.slot),
        manual ? h('dt', null, 'The page says') : null,
        manual ? h('dd', null, cp.move && !cp.done ? `${CALL_WORD[cp.call]}, ${money(cp.move.to)} a day` : (cp.needs_ads ? 'Hold, needs new ads' : CALL_WORD[cp.call] || 'Hold')) : null),
      cp.why ? h('p', null, cp.why) : null,
      cp.warn ? h('p', { class: 'wr2-amber' }, cp.warn) : null,
      cp.notes.length ? h('p', { class: 'dim' }, cp.notes.join(' ')) : null,
      h('label', null, 'New daily budget', amount), jumpWrap,
      h('label', null, 'What the client will read', why),
      whyNote, gateNote, status, btns);
    const verb = cp.call === 'putback' ? 'Put back' : start > from ? 'Raise' : start < from ? 'Cut' : 'Change';
    const sh = closeOnLeave(sheet({ title: manual ? `Set the budget on ${cp.name}` : `${verb} ${cp.name}?`, body, side: 'right' }));
    if (typed || manual) setTimeout(() => { amount.focus(); amount.select(); }, 60);
    const reset = () => { dry = null; if (!whyTyped) { const to = toOf(); why.value = clientWhy({ ...cp, call: !manual && cp.call === 'putback' && to === (cp.move && cp.move.to) ? 'putback' : 'x', move: { from, to } }, { manual }); } drawBtns(); };
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
      S.data.acts = [{ act_id: c.act, object_id: cp.id, object_name: cp.name, category: 'budget', event_time: at, summary: `$${from}/day \u2192 $${to}/day`, client_why: why.value.trim(), actor: by, local: true,
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
    undoSheet(ctx, { act: c.act, write: d.write, what: `${cp.name}: back to ${money(d.from)} a day`, name: c.name }, okd => {
      if (!okd) return;
      /* only this write comes off: an earlier change from here stays live in Meta, on the card and undoable */
      const key = doneKey(c.act, cp.id);
      if (d.prev) S.done[key] = d.prev; else delete S.done[key];
      const at = new Date(nowOf()).toISOString();
      S.data.acts = [{ act_id: c.act, object_id: cp.id, object_name: cp.name, category: 'other', event_time: at, summary: `Undone: $${d.from}/day \u2192 $${d.to}/day`,
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
    const body = h('div', { class: 'wr2-sh' },
      h('p', null, 'Check-in every:'),
      h('p', { class: 'dim' }, `Every brand starts at every 6 hours until you pick another rhythm here.`),
      sug ? h('p', { class: 'wr2-amber' }, `Suggested: every ${sug.hours} hours. ${sug.why}`) : null,
      segmented(CADENCE_CHOICES.map(n => ({ id: n, label: n + 'h' })), CADENCE_CHOICES.includes(cur) ? cur : null, pick),
      h('p', { class: 'dim' }, 'From 8am Central, the last one by 10pm. It sets when this card says "Check-in due", which earlier check-in "Since" counts from, and when the client update is due. The Slack check-in still runs at its own times until the worker change ships.'),
      msg);
    const sh = closeOnLeave(sheet({ title: `${c.name}: check-in rhythm`, body, side: 'bottom' }));
  }

  /* ---------- today by the hour (the one heavy read, on a tap) ---------- */
  async function hourSheet(c) {
    const body = h('div', { class: 'wr2-sh' }, h('p', { class: 'dim' }, 'Reading Triple Whale...'));
    closeOnLeave(sheet({ title: `${c.name}: today by the hour`, body, side: 'right' }));
    let D = S.hourCache[c.act];
    if (!D) {
      try {
        D = ctx.sample ? ((f() && f().war_live && f().war_live[c.act]) || { live: { hours: [] } })
          : await ctx.api('/api/season/war?act=' + encodeURIComponent(c.act) + '&live=1');
        S.hourCache[c.act] = D;
      } catch (e) { return put(body, h('p', { class: 'err' }, 'Could not read it: ' + errText(e))); }
    }
    const hrs = ((D && D.live && D.live.hours) || []).filter(x => (x.sales || 0) > 0 || (x.spend || 0) > 0);
    if (!hrs.length) return put(body, h('p', { class: 'dim' }, 'No sales or spend yet today.'));
    put(body,
      h('p', { class: 'dim' }, 'Store sales and ad spend per hour today, Central. Sales are Triple Whale.'),
      h('div', { class: 'wr2-tb wr2-hr', role: 'table' },
        h('div', { class: 'hd' }, h('span', null, 'Hour'), h('span', null, 'Sales'), h('span', null, 'Ad spend'), h('span', null, 'MER')),
        hrs.map(x => h('div', null, h('span', null, hourWord(x.hour)), h('span', null, money(x.sales || 0)), h('span', null, money(x.spend || 0)), h('span', null, (x.spend || 0) > 0 ? fx((x.sales || 0) / x.spend) : 'n/a')))));
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
  function clientBlock(c) {
    const d = cardData(c), host = h('div');
    host.innerHTML = cardHtml(d);
    const msg = h('div');
    const say = (t, tone) => put(msg, h('p', { class: tone === 'bad' ? 'err' : 'wr2-foot' }, t));
    const team = write && !ctx.isClient;
    const sent = S.links[c.act + '|' + rec().slot];
    const linkBtns = [];
    const linking = async fn => {
      linkBtns.forEach(b => { b.disabled = true; });
      try { await fn(); } finally { linkBtns.forEach(b => { b.disabled = false; }); }
    };
    const sendBtn = team ? button('Send to client', { primary: true, onclick: () => linking(async () => {
      try { const l = await snapshotLink(c, d); say(`${ctx.sample ? 'Sample: nothing was saved. ' : ''}Saved on a client link (${l}). The Slack update goes out with the check-in batch in your Client updates DM.`); }
      catch (e) { say('Not saved. ' + errText(e), 'bad'); }
    }) }) : null;
    const copyBtn = team ? button('Copy link', { onclick: () => linking(async () => {
      try { const l = await snapshotLink(c, d); try { await navigator.clipboard.writeText(l); toast(ctx.sample ? 'Sample link copied' : 'Link copied'); } catch { say('Copy this link: ' + l); } }
      catch (e) { say('No link. ' + errText(e), 'bad'); }
    }) }) : null;
    if (sendBtn) linkBtns.push(sendBtn, copyBtn);
    return h('div', { class: 'wr2-cu' },
      h('div', { class: 'wr2-h' }, h('span', { class: 'goal' }, 'Client update')),
      host,
      h('div', { class: 'wr2-act' },
        sendBtn,
        button('Copy as PNG', { onclick: async () => { const r = await copyCard(d, fileOf(c)).catch(e => { say(errText(e), 'bad'); return null; }); if (r) toast(r === 'copied' ? 'Picture copied' : 'This browser cannot copy pictures, so it downloaded instead'); } }),
        button('Download PNG', { onclick: async () => { try { await downloadCard(d, fileOf(c)); } catch (e) { say('Could not draw it. ' + errText(e), 'bad'); } } }),
        button('Download PDF', { onclick: async () => { try { await downloadCardPdf(d, fileOf(c).replace(/\.png$/, '.pdf')); } catch (e) { say('Could not make the PDF. ' + errText(e), 'bad'); } } }),
        copyBtn),
      sent ? h('p', { class: 'wr2-foot' }, 'Saved this check-in: ' + sent) : null,
      msg);
  }
  function clientSheet(c) {
    closeOnLeave(sheet({ title: `${c.name}: client update`, body: clientBlock(c), side: 'right' }));
  }

  /* ---------- the board export (team only): store lines, per brand numbers, campaign calls ---------- */
  function boardModel(list) {
    const R = rec(), recDate = R.today || slotDate(R.slot);
    const okb = list.filter(c => !c.b.no_sales && c.b.so_far && ok(c.b.so_far.sales));
    const sales = okb.reduce((t, c) => t + c.b.so_far.sales, 0), spend = okb.reduce((t, c) => t + (c.b.so_far.spend || 0), 0);
    const goal = okb.reduce((t, c) => t + (c.b.goal || 0), 0);
    const store = okb.length ? [`Weekend so far: ${money(sales)}${goal ? ` of the ${money(goal)} goal (${Math.round(sales / goal * 100)}%)` : ''} on ${money(spend)} of ads, store MER ${fx(spend > 0 ? sales / spend : null)}.`] : [];
    store.push('Since last check-in and Today decide the calls; This week is context that only breaks a tie.');
    const tone = (w, c) => !w || !w.readable ? '' : merTone(w.mer, c) === 'good' ? 'good' : merTone(w.mer, c) === 'bad' ? 'bad' : '';
    return {
      title: one && list[0] ? `${list[0].name}: Black Friday War Room` : 'Black Friday War Room',
      when: `${dayLabel(recDate)}, checked ${hourWord(slotHour(R.slot))} CT${S.probing ? ' (earlier check-ins still reading)' : ''}`,
      store,
      brands: list.map(c => {
        const lt = c.gate && c.gate.light ? LIGHT[c.gate.light] : null;
        const W = c.windows, win = (w, label) => w ? { label: w.label || label, mer: w.mer, sales: w.sales, spend: w.spend, readable: !!w.readable, tone: tone(w, c) } : { label, readable: false };
        return {
          name: c.name, light: lt ? { word: lt[1], tone: lt[0] } : null,
          goal: ok(c.goal) ? `MER goal ${fx(c.goal)}${ok(c.be) ? `, break-even ${fx(c.be)}` : ''}${c.roas && ok(c.roas.goal) ? `, goal ROAS ${fx(c.roas.goal)}` : ''}` : '',
          windows: [win(W.since, 'Since last check-in'), win(W.today, 'Today'), { ...win(W.week, 'This week'), label: 'This week (context)' }],
          lines: [modeLine(c), gateLine(c)],
          camps: c.camps.map(cp => ({
            name: cp.name, since: roasTxt(cp.w.since), today: roasTxt(cp.w.today), week: roasTxt(cp.w.week),
            call: cp.done ? 'Done' : cp.move ? CALL_WORD[cp.call] : c.mode === 'live' && c.gate.light ? (cp.needs_ads ? 'Hold, needs new ads' : cp.early ? 'Hold, too early' : CALL_WORD[cp.call]) : 'Numbers',
            tone: cp.done ? 'good' : cp.move ? CALL_TONE[cp.call] : '',
            move: cp.done ? `${money(cp.done.to)} a day` : cp.move ? `${money(cp.move.from)} to ${money(cp.move.to)}` : '',
          })),
        };
      }),
      foot: 'Team only. Sales and MER are Triple Whale; campaign ROAS is Triple Whale last click; budgets are Meta. The calls are a starting point, not a rule. Nothing changes without a tap.',
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
  function boardExports() {
    if (!write || ctx.isClient) return null;
    return h('div', { class: 'wr2-act' },
      button('Copy board as PNG', { onclick: e => exportBoard('copy', e.currentTarget) }),
      button('Download board PNG', { onclick: e => exportBoard('png', e.currentTarget) }),
      button('Download the board (PDF)', { onclick: e => exportBoard('pdf', e.currentTarget), aria: 'Download the War Room board as a PDF, team only' }),
      h('span', { class: 'wr2-foot' }, 'Team only: it has the calls and break-even lines. For the client, use the client update card.'));
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
  /** A new check-in: hold the moves, read the day's changes again (changes made elsewhere count), then the earlier check-ins. */
  async function newSlot() {
    S.probing = true; S.probeId++;
    draw();
    if (!ctx.sample && (!ctx.isClient || ctx.asClient)) {
      try { const acts = await readActs(ctx, one); if (!alive()) return; S.data = { ...S.data, acts }; }
      catch { if (!alive()) return; }                              // keep what we had
    }
    probe();
  }
  if (!ctx.sample) {
    const timer = setInterval(() => {
      if (!alive()) { clearInterval(timer); return; }
      if (document.visibilityState === 'visible') refresh();
    }, 10 * 60e3);
  }

  /* ---------- draw ---------- */
  function draw() {
    if (!alive()) return;
    const d = S.data || {}, R = d.standing;
    const refreshBtn = button('Refresh', { large: true, onclick: e => refresh(e.currentTarget) });
    const oldLink = !ctx.isClient && ctx.legacy ? h('a', { class: 'wr2-old', href: ctx.legacy }, 'Open in old ' + APP_NAME) : null;
    if (!R) return put(el, h('div', { class: 'wr2' }, empty({ title: 'No check-in yet', text: d.error || 'The War Room fills in at the first check-in of the season.', action: refreshBtn }), oldLink));
    const list = calcAll();
    if (!list.length) return put(el, h('div', { class: 'wr2' }, empty({ title: 'This brand is not in the check-in', text: 'Only brands with a Black Friday sale are checked.', action: refreshBtn }), oldLink));
    const age = ageH();
    const fresh = age < 0.5;
    const checkBtn = write ? button('Check now', { large: true, disabled: fresh || null, onclick: e => checkNow(e.currentTarget), aria: fresh ? 'Check now: the latest check-in is under 30 minutes old' : 'Check now' }) : null;
    const minCad = Math.min(...list.map(c => c.cadence));
    const sampleSwitch = ctx.sample && f() && f().slots ? segmented(f().slots.map(s => ({ id: s.slot, label: s.label })), R.slot, slot => {
      S.data = { ...S.data, standing: f().records[slot] }; S.done = {}; S.probing = true; draw(); probe();
    }) : null;
    const top = hero({ line: true },
      h('div', { class: 'wr2-top' },
        h('div', { class: 'grow' },
          h('span', { class: 'when' }, `Checked ${hourWord(slotHour(R.slot))} CT`),
          h('span', { class: 'sub' }, [R.label || R.slot, S.probing ? ' Reading the earlier check-ins...' : '', R.dry ? ' Dry run: no sale has started.' : ''].join('')),
          !ctx.isClient && age > minCad + 1 ? h('span', { class: 'wr2-amber' }, `Check-in is old: ${agoWords(age * 3600e3)} ago.`) : null,
          sampleSwitch),
        h('div', { class: 'btns' }, refreshBtn, checkBtn, oldLink)));
    if (ctx.isClient) {
      return put(el, h('div', { class: 'wr2' }, top, h('div', { class: 'wr2-grid' }, list.map(brandCard)),
        h('p', { class: 'wr2-foot' }, 'Sales and MER are Triple Whale. MER is store sales over all ad spend.')));
    }
    put(el, h('div', { class: 'wr2' },
      top,
      one ? null : card({}, weekendLine(list)),
      boardExports(),
      needsYes(list),
      h('div', { class: 'wr2-grid' }, list.map(brandCard)),
      h('p', { class: 'wr2-foot' }, `Sales and MER are Triple Whale. MER is the whole store: all sales over all ad spend. A campaign is judged on its own ROAS (Triple Whale attributed, last click) against the brand's goal ROAS, on what is happening now: Since last check-in and Today decide, This week is context that only breaks a tie or adds a note. While the store MER is over goal nothing is cut; a weak campaign reads Hold, needs new ads. The call is a starting point, not a rule: open a campaign for the full picture. Budgets are Meta. Nothing changes without a tap; Set budget takes any amount by hand. A change under ${READ_HOURS} hours old, or with under 20% of its new budget spent, is flagged as not read yet; it never blocks a tap.`)));
  }

  draw();
  probe();
}
