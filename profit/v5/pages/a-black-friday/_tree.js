/* War Room: what sits inside a campaign. A campaign row on a brand card opens in place to its ad sets, and each ad
   set to its ads, with an on/off switch, Set budget on ad sets that carry their own budget, and the ad calls from the
   ad rules (the existing buyer-list rows; this file never makes a call up). An ad opens the shared ad detail.

   Reads (GET only, made the first time a campaign of that brand is opened, one request at a time, cached per brand):
     ah       GET /api/meta/live?act=                       campaigns, ad sets and ads with status and budgets, from Meta
     profit   GET /api/hub/paid?platform=meta&act=&model=lastPlatformClick&cmp=none&from=<Monday>&to=<today>
                                                           this week per ad set and ad: spend (Meta), sales and ROAS
                                                           (Triple Whale last click), Meta's own count
     ah       GET /api/buyer-list?act=                      today's ad calls from the ad rules (team only)
     ah       GET /api/ad-creatives?act=&ads=<ids>          the covers for the ads of one campaign (first 40)
   Writes (team only, two taps, sample mode never calls one):
     ah       POST /api/meta/write {act, kind: pause|resume|budget, level: campaign|adset|ad, object, amount?, reason,
              client_why, dry: true}, then the same without dry plus expect (from the dry run) and big over 50%
     ah       POST /api/meta/undo {act, write}              Undo from the toast */

import { APP_NAME } from '../../config.js';
import { h, put, money, x, pill, button, sheet, toast, addStyles, staleStamp } from '../../kit.js';
import { defLabel } from '../../defs.js';
import { fixture } from '../../data.js';
import { doneToast, undoWrites, clientLine } from '../meta/_write.js';
import { forgetWaiting } from '../../bell.js';
import { openAdDetail } from '../_addetail.js';
import { callsBy } from './_calls.js';

const ok = n => n != null && isFinite(n);
const errText = e => (e && e.message) || 'The server did not answer.';
const BIG = 0.5;
const MIN_BUDGET = 5;
const SHOW_ADS = 6;
const LEVEL_WORD = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };
/* the buyer-list row kinds (account-health buyerlist.js callRow): scale | cut | trim | refresh | mixed, plus minoff and stalled */
const TONE = { scale: 'good', cut: 'bad', stalled: 'bad', trim: 'warn', refresh: 'warn', minoff: 'warn', mixed: '' };
const fx = v => ok(v) ? x(v) : null;
const usd = v => money(Math.round(v));
const onOf = s => String(s || '').toUpperCase() === 'ACTIVE';
/** A short note when Meta's effective status says more than the own on/off: a parent switched off, a review, an issue. */
const PARENT_OFF = { CAMPAIGN_PAUSED: 'campaign is off', ADSET_PAUSED: 'ad set is off' };
const EFF_NOTE = { IN_PROCESS: 'In review', PENDING_REVIEW: 'In review', WITH_ISSUES: 'Has issues', DISAPPROVED: 'Rejected', PENDING_BILLING_INFO: 'Billing hold' };
export function stateNote(st) {
  const own = String((st && st.own) || '').toUpperCase(), eff = String((st && st.eff) || '').toUpperCase();
  if (!eff || eff === own) return '';
  if (PARENT_OFF[eff]) return own === 'ACTIVE' ? PARENT_OFF[eff] : '';
  return EFF_NOTE[eff] || '';
}

const CSS = `
.wrt{display:grid;gap:0;background:var(--surface-2);border-top:1px solid var(--line);container-type:inline-size;min-width:0}
.wrt-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;padding:10px 16px 8px 40px}
.wrt-h .t{font-size:var(--fs-small);color:var(--muted);flex:1 1 260px;min-width:0;line-height:1.4}
.wrt-h .t b{color:var(--ink);font-weight:600}
.wrt-h .lx-btn{min-height:32px}
.wrt-msg{padding:12px 16px 14px 40px;font-size:13px;color:var(--muted);line-height:1.5}
.wrt-msg.err{color:var(--bad)}
.wrt-r{display:grid;grid-template-columns:var(--wrt-g);gap:10px;align-items:center;padding:0 16px 0 40px;min-height:44px;border-top:1px solid var(--line);font-size:var(--fs-table);min-width:0}
.wrt{--wrt-g:minmax(0,1fr) 76px 64px 56px 72px 60px 60px 68px 128px 150px}
.wrt-r.hd{min-height:30px;font-size:var(--fs-colhead);font-weight:600;color:var(--muted);border-top:0}
.wrt-r.hd>span{line-height:1.25;min-width:0}
.wrt-r.hd>.r{white-space:normal;overflow:visible;text-overflow:clip}
.wrt-r .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wrt-r .na{color:var(--faint)}
.wrt-r.set{background:var(--surface)}
.wrt-r.set .wrt-open{display:grid;gap:1px;padding:7px 0}
.wrt-r.set .wrt-nm small{white-space:normal}
.wrt-r.set:hover,.wrt-r.ad:hover{background:var(--row-hover)}
.wrt-r.off{color:var(--muted)}
.wrt-r.off .wrt-nm b{font-weight:500}
.wrt-nm{display:flex;align-items:center;gap:10px;min-width:0}
.wrt-nm b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.wrt-nm small{font-size:12px;color:var(--muted);white-space:nowrap}
.wrt-nm small .bud-in{display:none}
.wrt-r.ad{padding-left:58px}
.wrt-r.ad .wrt-nm b{font-weight:500}
.wrt-open{display:flex;align-items:center;gap:10px;min-width:0;border:0;background:none;padding:6px 0;font:inherit;color:inherit;text-align:left;cursor:pointer}
.wrt-open:hover b{text-decoration:underline;text-underline-offset:3px}
.wrt-th{flex:none;width:34px;height:34px;border-radius:var(--r-chip);background:var(--bg-sunk) center/cover no-repeat;display:grid;place-items:center;font-size:10px;font-weight:600;color:var(--muted);overflow:hidden}
.wrt-call{display:flex;min-width:0;padding:6px 0}
.wrt-call>*{max-width:100%}
/* a call pill never clips: a long action wraps to a second line inside its column */
.lx-pill.wrt-pill{height:auto;min-height:22px;padding:3px 8px;white-space:normal;line-height:1.25;text-align:left;overflow-wrap:anywhere}
button.wrt-pill{border:0;font:inherit;font-size:var(--fs-meta,12px);font-weight:500;cursor:pointer}
button.wrt-pill:hover,button.wrt-pill:focus-visible{filter:brightness(.95)}
.wrt-act{display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:4px 10px;min-width:0}
.wrt-more{padding:6px 16px 10px 58px;border-top:1px solid var(--line)}
.wrt-more button{border:0;background:none;font:inherit;font-size:12.5px;color:var(--ink-2);cursor:pointer;padding:4px 0}
.wrt-more button:hover,.wrt-more button:focus-visible{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.wrt-foot{padding:8px 16px 12px 40px;font-size:12px;color:var(--faint);border-top:1px solid var(--line);line-height:1.45}
/* the on/off switch: a button that opens the two tap sheet, never flips on its own */
.wr-sw{display:inline-flex;align-items:center;gap:7px;border:0;background:none;padding:4px 0;font:inherit;font-size:12.5px;color:var(--ink-2);cursor:pointer;white-space:nowrap}
.wr-sw i{position:relative;width:28px;height:16px;border-radius:999px;background:var(--line-strong);flex:none;transition:background .15s}
.wr-sw i::after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}
.wr-sw[aria-checked=true] i{background:var(--good)}
.wr-sw[aria-checked=true] i::after{left:14px}
.wr-sw[disabled]{cursor:default;opacity:.55}
.wr-sw em{font-style:normal;font-size:11.5px;color:var(--warn)}
.wr-sw:not([disabled]):hover span{text-decoration:underline;text-underline-offset:3px}
/* Set budget: a small quiet button, never a resting underline (the dotted underline is for defined terms only) */
.wr-lk{display:inline-flex;align-items:center;min-height:26px;border:1px solid var(--line-strong);border-radius:var(--r-btn);background:var(--surface);padding:0 9px;font:inherit;font-size:12.5px;font-weight:500;color:var(--ink-2);cursor:pointer;white-space:nowrap}
.wr-lk:hover,.wr-lk:focus-visible{background:var(--row-hover);color:var(--ink)}
/* narrower steps: the budget moves under the name, then Meta's own count and sales, then the week spend */
@container (max-width:1000px){
  .wrt{--wrt-g:minmax(0,1fr) 64px 56px 72px 60px 60px 68px 128px 150px}
  .wrt-r>.c-bud{display:none}
  .wrt-nm small .bud-in{display:inline}
}
@container (max-width:860px){
  .wrt{--wrt-g:minmax(0,1fr) 64px 56px 72px 60px 120px 150px}
  .wrt-r>.c-sales,.wrt-r>.c-meta{display:none}
  .wrt-h .t .mo{display:none}
}
@container (max-width:700px){
  .wrt{--wrt-g:minmax(0,1fr) 56px 60px 120px 150px}
  .wrt-r>.c-tspend,.wrt-r>.c-spend{display:none}
}
@container (max-width:520px){
  .wrt-h,.wrt-msg,.wrt-foot{padding-left:16px}
  .wrt-r{grid-template-columns:minmax(0,1fr) auto;padding:8px 16px;gap:4px 10px}
  .wrt-r.ad{padding-left:28px}
  .wrt-r.hd{display:none}
  .wrt-r>.c-troas,.wrt-r>.c-roas{display:none}
  .wrt-r>.c-call{grid-column:1}
  .wrt-r>.c-act{grid-column:2;grid-row:1}
  .wrt-r .wrt-sub{display:block;flex-basis:100%;padding-left:2px}
  .wrt-nm{flex-wrap:wrap;gap:0 10px}
  .wrt-r.ad .wrt-sub{padding-left:44px}
  .wrt-call .na{display:none}
  .wrt-more{padding-left:28px}
}
.wrt-sub{display:none;font-size:12px;color:var(--muted);font-variant-numeric:tabular-nums;margin:-2px 0 2px;line-height:1.4}
.wrt-sub>span{display:block}
/* the write sheet */
.wrw{display:grid;gap:14px}
.wrw .on{color:var(--muted);font-size:13.5px;overflow-wrap:anywhere}
.wrw .why{margin:0;font-size:14px;line-height:1.5;color:var(--ink-2)}
.wrw .ba{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-size:17px;font-variant-numeric:tabular-nums}
.wrw .ba span{color:var(--muted)}.wrw .ba b{font-weight:600}.wrw .ba i{font-style:normal;color:var(--faint)}
.wrw label{display:grid;gap:6px;font-size:13px;color:var(--muted)}
.wrw .lx-input{font-size:15px;color:var(--ink)}
.wrw textarea.lx-input{min-height:72px}
.wrw .tick{display:flex;gap:10px;align-items:center;color:var(--ink);min-height:40px}
.wrw .tick input{width:20px;height:20px}
.wrw .msg{border-radius:var(--r-btn);padding:10px 12px;font-size:13.5px;line-height:1.45}
.wrw .msg.ok{background:var(--good-bg);color:var(--good)}
.wrw .msg.err{background:var(--bad-bg);color:var(--bad)}
.wrw .msg.dim{background:var(--surface-2);color:var(--ink-2)}
.wrw .note{margin:0;font-size:12.5px;color:var(--muted);line-height:1.45}
.wrw .btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.wrw .btns .lx-btn{min-height:44px}
@media (max-width:759px){.wrw .btns{display:grid;grid-template-columns:1fr}.wrw .btns .lx-btn{width:100%;justify-content:center}}`;
export const treeCss = () => addStyles('wrt-css', CSS);

/** The switch: shows on or off, and opens the two tap sheet. Never flips by itself. */
export function onSwitch(isOn, { label, onclick, disabled = false, note = '' } = {}) {
  treeCss();
  return h('button', { type: 'button', class: 'wr-sw', role: 'switch', 'aria-checked': String(!!isOn), disabled: disabled || null, 'aria-label': label ? label + (note ? ` (${note})` : '') : null,
    title: note ? `${isOn ? 'On' : 'Off'}, ${note}` : null,
    onclick: e => { e.stopPropagation(); onclick && onclick(); } }, h('i', { 'aria-hidden': 'true' }), h('span', null, isOn ? 'On' : 'Off'), note ? h('em', null, note) : null);
}

/* ---------- the write sheet: summary, then check with Meta (dry run), then yes ---------- */
/** o = { act, brand, level, object, name, where, kind: 'pause'|'resume'|'budget', from, amount, title, why, clientWhy, onDone }
    onDone({ write, to, status }) after the real write; the toast carries Undo, which calls onUndo(). */
export function writeSheet(ctx, o) {
  treeCss();
  const lv = LEVEL_WORD[o.level] || 'ad set';
  const isBudget = o.kind === 'budget';
  const amount = isBudget ? h('input', { class: 'lx-input', type: 'number', min: String(MIN_BUDGET), step: '5', inputmode: 'decimal', enterkeyhint: 'done', value: String(Math.round(o.amount ?? o.from ?? 0) || ''), 'aria-label': 'New daily budget' }) : null;
  const jump = h('input', { type: 'checkbox' });
  const jumpWrap = h('label', { class: 'tick', hidden: true }, jump, 'I mean this jump');
  const why = h('textarea', { class: 'lx-input', maxlength: '600', rows: '2', 'aria-label': 'What the client will read' });
  let whyTyped = false; why.oninput = () => { whyTyped = true; drawBtns(); };
  const line = to => o.clientWhy || clientLine({ do: o.kind, level: o.level, ad_id: o.level === 'ad' ? o.object : null, adset_id: o.level === 'adset' ? o.object : null }, to, o.from) || `We changed ${LEVEL_WORD[o.level] === 'ad' ? 'an ad' : 'a ' + lv}.`;
  const ba = h('div', { class: 'ba' }), status = h('div'), btns = h('div', { class: 'btns' });
  let dry = null, busy = false;
  const toOf = () => (isBudget ? Math.round(+amount.value) : null);
  const check = () => {
    if (!isBudget) return '';
    const to = toOf();
    if (!(to >= MIN_BUDGET)) return `Type a budget of at least $${MIN_BUDGET} a day.`;
    if (ok(o.from) && to === Math.round(o.from)) return 'That is the budget it has now.';
    if (ok(o.from) && o.from > 0) {
      const ch = Math.abs(to - o.from) / o.from;
      jumpWrap.hidden = ch <= BIG;
      if (ch > BIG && !jump.checked) return `That is ${Math.round(ch * 100)}% from ${money(o.from)}. Tick "I mean this jump" to go past 50%.`;
    }
    return '';
  };
  const drawBa = () => {
    if (isBudget) put(ba, h('span', null, ok(o.from) ? money(o.from) + ' a day' : 'Now: not read'), h('i', null, 'to'), h('b', null, ok(toOf()) && toOf() > 0 ? money(toOf()) + ' a day' : '...'));
    else put(ba, h('span', null, o.kind === 'pause' ? 'On' : 'Off'), h('i', null, 'to'), h('b', null, o.kind === 'pause' ? 'Off' : 'On'));
  };
  const verb = o.kind === 'pause' ? 'Turn off' : o.kind === 'resume' ? 'Turn on' : 'Set the budget on';
  const sh = sheet({ title: o.title || `${verb} this ${lv}?`, side: 'center', body: h('div', { class: 'wrw' },
    h('div', { class: 'on' }, [o.name, o.where, o.brand].filter(Boolean).join(', ')),
    o.why ? h('p', { class: 'why' }, o.why) : null,
    o.kind === 'pause' && o.uncalled ? h('p', { class: 'msg dim' }, `${APP_NAME} has not called this one. It may still be inside its wait window.`) : null,
    isBudget ? h('label', null, defLabel('New budget a day', 'budget_a_day'), amount) : null,
    jumpWrap, ba,
    h('label', null, 'What the client will read', why),
    h('p', { class: 'note' }, 'Checked with Meta first, then written and logged in Changes. Undo for 24 hours.'),
    status, btns) });
  const reset = () => { dry = null; if (!whyTyped) why.value = line(toOf()); drawBa(); drawBtns(); };
  if (amount) { amount.oninput = reset; jump.onchange = reset; setTimeout(() => { try { amount.focus(); amount.select(); } catch {} }, 60); }
  why.value = line(toOf());
  const bodyOf = () => ({ act: o.act, kind: o.kind, level: o.level, object: o.object, ...(isBudget ? { amount: toOf() } : {}),
    reason: `War Room: ${o.reason || verb + ' ' + (o.name || lv)}`.slice(0, 280) });
  function drawBtns(msg, tone) {
    const err = check();
    put(status, msg ? h('div', { class: 'msg ' + (tone || 'err'), role: tone === 'ok' ? 'status' : 'alert' }, msg) : err ? h('p', { class: 'note' }, err) : null);
    const noWhy = !why.value.trim();
    put(btns, button('Cancel', { onclick: () => sh.close() }),
      dry ? button(busy ? 'Writing to Meta...' : isBudget ? `Yes, set ${money(toOf())} a day` : `Yes, ${verb.toLowerCase()}`, { primary: true, disabled: busy || !!err || noWhy || null, onclick: go })
        : button(busy ? 'Checking with Meta...' : 'Check with Meta', { primary: true, disabled: busy || !!err || null, onclick: dryRun }));
  }
  async function dryRun() {
    if (busy || check()) return;
    busy = true; drawBtns();
    let d;
    if (ctx.sample) {
      d = isBudget ? { ok: true, dry: true, before: { daily_budget: String(Math.round((o.from || 0) * 100)) }, summary: `Sample: ${o.name} ${money(o.from)} a day to ${money(toOf())} a day. No real ad account was read.` }
        : { ok: true, dry: true, before: { status: o.kind === 'pause' ? 'ACTIVE' : 'PAUSED' }, summary: `Sample: ${o.name} would be turned ${o.kind === 'pause' ? 'off' : 'on'}. No real ad account was read.` };
    } else if (!/^\d{5,}$/.test(String(o.object || ''))) d = { error: 'There is no Meta id to change here. Open it in Ads Manager.' };
    else { try { d = await ctx.api('/api/meta/write', { worker: 'ah', method: 'POST', body: { ...bodyOf(), dry: true } }); } catch (e) { d = { error: errText(e) }; } }
    busy = false;
    if (!d || d.error) { dry = null; drawBtns('Not checked. ' + ((d && d.error) || 'Meta did not answer.')); return; }
    if (isBudget && d.before && d.before.daily_budget != null && ok(o.from) && Math.round(+d.before.daily_budget / 100) !== Math.round(o.from)) {
      o.from = +d.before.daily_budget / 100; drawBa();
      dry = null; drawBtns(`Meta has it at ${money(o.from)} a day now, not the figure on screen. Nothing was written. Check the amount and check again.`);
      return;
    }
    if (!isBudget && d.before && d.before.status && (o.kind === 'pause') !== onOf(d.before.status)) {
      dry = null; drawBtns(`Meta already has it ${onOf(d.before.status) ? 'on' : 'off'}. Nothing to change.`, 'dim');
      return;
    }
    dry = d;
    drawBtns((d.summary || 'Meta will take this change.') + ' Tap Yes to write it.', 'ok');
  }
  async function go() {
    if (!dry || busy || check()) return;
    const cw = why.value.trim();
    if (!cw) { drawBtns('Write the line the client will read.'); return; }
    busy = true; drawBtns();
    const b = dry.before || {};
    const expect = isBudget ? (b.daily_budget != null ? { daily_budget: b.daily_budget } : b.lifetime_budget != null ? { lifetime_budget: b.lifetime_budget } : undefined) : (b.status != null ? { status: b.status } : undefined);
    const big = isBudget && ok(o.from) && o.from > 0 && Math.abs(toOf() - o.from) / o.from > BIG;
    let r;
    if (ctx.sample) r = { ok: true, write: 'sample_' + Date.now().toString(36) };
    else { try { r = await ctx.api('/api/meta/write', { worker: 'ah', method: 'POST', body: { ...bodyOf(), client_why: cw, expect, ...(big ? { big: true } : {}) } }); } catch (e) { r = { error: errText(e) }; } }
    busy = false;
    if (!r || r.error) { dry = null; drawBtns('Not changed. ' + ((r && r.error) || 'Meta did not answer.')); return; }
    if (!ctx.sample) forgetWaiting();
    sh.close();
    const res = { write: r.write || null, to: toOf(), status: isBudget ? null : o.kind === 'pause' ? 'PAUSED' : 'ACTIVE' };
    const text = ctx.sample ? 'Sample: nothing was changed' : String(r.summary || 'Done.').replace(/^[^:]+:\s*/, '');
    doneToast(ctx, text, res.write ? () => undoWrites(ctx, o.act, [res.write], back => { if (back && o.onUndo) o.onUndo(res); }) : null);
    o.onDone && o.onDone(res);
  }
  drawBa(); drawBtns();
  return sh;
}

/* ---------- reads ---------- */
/** One reader per page render: reads per brand, one request at a time, cached. */
export function treeReader(ctx) {
  let queue = Promise.resolve();
  const cache = {}, pics = {}, local = { status: {}, budget: {}, done: {} };
  let FIX = null;
  const sampleOf = async act => { FIX = FIX || fixture('a-black-friday/_sample/war-structure.json'); const f = await FIX; return (f && f.brands && f.brands[act]) || null; };
  const run = fn => { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; };
  /** { live, paid: { campaigns }, today: { campaigns }, calls: { rows }, at, errs } for one brand and week (today = win.to alone). */
  function read(act, win, { force = false } = {}) {
    const key = act + '|' + win.from + '|' + win.to;
    if (cache[key] && !force) return cache[key];
    const p = (async () => {
      const out = { live: null, paid: null, today: null, calls: null, errs: {}, at: Date.now() };
      if (ctx.sample) { const s = await sampleOf(act); if (!s) throw new Error('No sample ad sets for this brand.'); return { ...out, live: s.live, paid: s.paid, today: s.today || null, calls: s.calls }; }
      const A = encodeURIComponent(act);
      try { out.live = await run(() => ctx.api(`/api/meta/live?act=${A}`, { worker: 'ah', signal: ctx.signal })); if (out.live && out.live.error) { out.errs.live = out.live.error; out.live = null; } }
      catch (e) { if (e && e.name === 'AbortError') throw e; out.errs.live = errText(e); }
      try { const r = await run(() => ctx.api(`/api/hub/paid?platform=meta&act=${A}&model=lastPlatformClick&cmp=none&from=${win.from}&to=${win.to}`, { worker: 'profit', signal: ctx.signal })); out.paid = (r && r.brands && r.brands[0]) || null; }
      catch (e) { if (e && e.name === 'AbortError') throw e; out.errs.paid = errText(e); }
      /* today alone, so the ad sets carry the same Today window as the campaign row (one more cached read) */
      if (win.from !== win.to) {
        try { const r = await run(() => ctx.api(`/api/hub/paid?platform=meta&act=${A}&model=lastPlatformClick&cmp=none&from=${win.to}&to=${win.to}`, { worker: 'profit', signal: ctx.signal })); out.today = (r && r.brands && r.brands[0]) || null; }
        catch (e) { if (e && e.name === 'AbortError') throw e; out.errs.today = 'today: ' + errText(e); }
      } else out.today = out.paid;
      if (!ctx.isClient) {
        try { out.calls = await run(() => ctx.api(`/api/buyer-list?act=${A}`, { worker: 'ah', signal: ctx.signal })); }
        catch (e) { if (e && e.name === 'AbortError') throw e; out.errs.calls = errText(e); }
      }
      if (!out.live && !out.paid) throw new Error(out.errs.live || out.errs.paid || 'Nothing came back.');
      return out;
    })();
    cache[key] = p;
    p.catch(() => { if (cache[key] === p) delete cache[key]; });
    return p;
  }
  /** Covers for a list of ad ids (one GET, the first 40). Sample mode has none. */
  function covers(act, ids) {
    /* every id asked for is marked at once (a picture or null), so a redraw never asks again */
    const fresh = ids.filter(id => !(id in pics));
    const want = fresh.filter(id => /^\d{5,}$/.test(String(id))).slice(0, 40);
    fresh.forEach(id => { pics[id] = null; });
    if (ctx.sample || !want.length) return Promise.resolve(null);
    return run(() => ctx.api(`/api/ad-creatives?act=${encodeURIComponent(act)}&ads=${want.join(',')}`, { worker: 'ah', signal: ctx.signal }))
      .then(r => { const as = (r && r.assets) || {}; for (const id of want) { const v = as[id]; pics[id] = v ? (v.thumb || v.image || null) : null; } return pics; }, () => pics);
  }
  return { read, covers, pics, local };
}

/** Own and effective status of a campaign / ad set / ad: a change made on this page wins, then Meta live, then the synced row.
    own = the switch Meta keeps on this object; eff = what Meta actually runs (a paused parent, a review, an issue). */
export function stateOf(T, D, level, id, fallback) {
  const L = D && D.live, bag = L && (level === 'campaign' ? L.campaigns : level === 'adset' ? L.adsets : L.ads);
  const v = bag && bag[id];
  const own = T.local.status[id] || (v && (v.status || v.eff)) || fallback || null;
  let eff = (v && (v.eff || v.status)) || fallback || null;
  if (T.local.status[id]) eff = T.local.status[id] === 'ACTIVE' && v && PARENT_OFF[String(v.eff || '').toUpperCase()] ? v.eff : T.local.status[id];
  return { own, eff };
}
/** The switch's status: the object's own on/off (a paused parent does not flip the child's switch; stateNote says it). */
export const statusOf = (T, D, level, id, fallback) => stateOf(T, D, level, id, fallback).own;
export const budgetOf = (T, D, level, id, fallback) => {
  if (id in T.local.budget) return T.local.budget[id];
  const L = D && D.live, bag = L && (level === 'campaign' ? L.campaigns : L.adsets), v = bag && bag[id];
  return v && ok(v.daily) ? v.daily : fallback ?? null;
};
/** A lifetime budget, when the object has no daily one (Set budget stays hidden: the write route sets daily budgets). */
const lifetimeOf = (D, level, id) => {
  const L = D && D.live, bag = L && (level === 'campaign' ? L.campaigns : L.adsets), v = bag && bag[id];
  return v && ok(v.lifetime) && v.lifetime > 0 ? v.lifetime : null;
};

const callLabel = r => String(r.action || r.call || r.kind || 'Look closer');
const callWhy = r => String(r.why || r.because || '');
const moveOf = r => (['pause', 'resume', 'budget'].includes(r && r.do) ? r.do : null);

/* ---------- the campaign's inside ---------- */
/** opts = { act, brand, camp: { id, name }, win: { from, to, label }, write, goals, onCampaign(D), details(), campBudget(row) }
    campBudget: a scale call on an ad set with no budget of its own; returns true when it opened the campaign budget sheet. */
export function campaignInside(ctx, T, opts) {
  treeCss();
  const host = h('div', { class: 'wrt' });
  /* an ad set with a few ads starts open; openSets holds the ones the person flipped */
  const openSets = new Set(), allAds = new Set();
  const isOpen = s => (s.ads.length <= SHOW_ADS) !== openSets.has(s.id);
  const { act, brand, camp, win, write } = opts;
  let D = null;
  const msg = (t, err) => put(host, h('p', { class: 'wrt-msg' + (err ? ' err' : '') }, t));
  msg('Reading the ad sets and ads from Meta...');
  const load = force => T.read(act, win, { force }).then(d => { D = d; opts.onCampaign && opts.onCampaign(d); draw(); }, e => { if (e && e.name === 'AbortError') return; msg('The ad sets did not load: ' + errText(e), true); });

  function setsOfCamp() {
    const pc = D.paid && (D.paid.campaigns || []).find(c => String(c.id) === String(camp.id));
    const tc = D.today && (D.today.campaigns || []).find(c => String(c.id) === String(camp.id));
    const tSet = {}, tAd = {};
    for (const s of (tc && tc.adsets) || []) { tSet[String(s.id)] = s; for (const a of s.ads || []) tAd[String(a.id)] = a; }
    const sets = new Map();
    for (const s of (pc && pc.adsets) || []) sets.set(String(s.id), { id: String(s.id), name: s.name, status: s.status, budget: s.budget ?? null, m: s, t: tSet[String(s.id)] || null,
      ads: (s.ads || []).map(a => ({ ...a, id: String(a.id), t: tAd[String(a.id)] || null })) });
    /* Meta live adds the ad sets and ads that spent nothing this week (switched off, or just loaded) */
    const L = D.live;
    if (L) {
      for (const [id, s] of Object.entries(L.adsets || {})) {
        if (String(s.campaign) !== String(camp.id)) continue;
        if (!sets.has(id)) sets.set(id, { id, name: s.name, status: s.status || s.eff, budget: s.daily ?? null, m: null, t: tSet[id] || null, ads: [] });
      }
      for (const [id, a] of Object.entries(L.ads || {})) {
        const st = sets.get(String(a.adset)); if (!st) continue;
        if (!st.ads.some(z => z.id === id)) st.ads.push({ id, name: a.name, status: a.status || a.eff, spend: 0, media_type: a.media_type || null, idle: true, t: tAd[id] || null });
      }
    }
    const list = [...sets.values()];
    for (const s of list) s.ads.sort((p, q) => (onOf(statusOf(T, D, 'ad', q.id, q.status)) - onOf(statusOf(T, D, 'ad', p.id, p.status))) || (q.spend || 0) - (p.spend || 0));
    return list.sort((p, q) => (onOf(statusOf(T, D, 'adset', q.id, q.status)) - onOf(statusOf(T, D, 'adset', p.id, p.status))) || ((q.m && q.m.spend) || 0) - ((p.m && p.m.spend) || 0));
  }

  const cell = (cls, v) => h('span', { class: cls + ' r' + (v == null ? ' na' : '') }, v == null ? 'none' : v);
  /* the phone's one line under a name: today, then this week, each with its window */
  const subLine = (t, m, idle) => {
    const today = t && ok(t.spend) && t.spend > 0 ? `Today ${usd(t.spend)}${ok(t.roas) ? ', ROAS ' + x(t.roas) : ''}` : 'Nothing spent today';
    const week = m && ok(m.spend) && m.spend > 0 ? `This week ${usd(m.spend)}${ok(m.purchases) ? ', ' + m.purchases + (m.purchases === 1 ? ' order' : ' orders') : ''}${ok(m.roas) ? ', ROAS ' + x(m.roas) : ''}` : idle ? 'No spend this week' : 'This week: none';
    return [h('span', null, today), h('span', null, week)];
  };
  function callCell(id, r, onApply, on) {
    if (T.local.done[id]) return h('span', { class: 'wrt-call c-call' }, h('span', { class: 'lx-pill wrt-pill good', title: 'Changed on this page. Undo is in the message that came up.' }, 'Done'));
    if (!r) return h('span', { class: 'wrt-call c-call' }, h('span', { class: 'na', style: { color: 'var(--faint)', fontSize: '12.5px' } }, 'No call'));
    const tone = TONE[r.kind] || '';
    /* a pause call on something already off (or a resume on something on) has nothing left to do */
    let mv = write && moveOf(r);
    if ((mv === 'pause' && on === false) || (mv === 'resume' && on === true)) mv = null;
    const b = h('button', { type: 'button', class: 'lx-pill wrt-pill ' + tone, title: callWhy(r) || null,
      onclick: e => { e.stopPropagation(); onApply(r, mv); }, 'aria-label': `${callLabel(r)}${callWhy(r) ? ': ' + callWhy(r) : ''}` }, callLabel(r));
    return h('span', { class: 'wrt-call c-call' }, b);
  }
  /* a write on a row with a call marks the call Done on this page; Undo takes it back */
  const doneOn = (id, called) => r => { T.local.status[id] = r.status || T.local.status[id]; if (called) T.local.done[id] = true; draw(); };
  const undoOn = (id, key) => () => { delete T.local[key][id]; delete T.local.done[id]; draw(); };

  function setRow(s) {
    const st = stateOf(T, D, 'adset', s.id, s.status), on = onOf(st.own), note = stateNote(st);
    const bud = budgetOf(T, D, 'adset', s.id, s.budget), life = ok(bud) ? null : lifetimeOf(D, 'adset', s.id);
    const m = s.m || {}, t = s.t || {};
    const meta = m.spend > 0 && ok(m.platform_revenue) ? m.platform_revenue / m.spend : null;
    const call = callsBy(D).adset[s.id];
    const open = isOpen(s);
    const budText = ok(bud) ? money(bud) + ' a day' : life ? money(life) + ' lifetime' : 'campaign budget';
    const doBudget = (amount, why, title) => writeSheet(ctx, { act, brand, level: 'adset', object: s.id, name: s.name, where: camp.name, kind: 'budget', from: bud, amount, why, title,
      onDone: r => { T.local.budget[s.id] = r.to; if (call) T.local.done[s.id] = true; draw(); }, onUndo: undoOn(s.id, 'budget') });
    const toggle = () => writeSheet(ctx, { act, brand, level: 'adset', object: s.id, name: s.name, where: camp.name, kind: on ? 'pause' : 'resume', uncalled: !call,
      onDone: doneOn(s.id, !!call), onUndo: undoOn(s.id, 'status') });
    const applyCall = (r, mv) => {
      if (mv === 'budget') {
        if (ok(bud)) return doBudget(r.suggested_budget || Math.round(bud * 1.2 / 5) * 5, callWhy(r), callLabel(r) + '?');
        /* no budget of its own: the money sits on the campaign, so the raise is made there */
        if (!life && opts.campBudget && opts.campBudget(r)) return;
        return toast(life ? 'This ad set runs on a lifetime budget. Change it in Ads Manager.' : `This ad set has no budget of its own. Raise the budget on ${camp.name} instead.`, { ms: 6000 });
      }
      if (mv === 'pause' || mv === 'resume') return writeSheet(ctx, { act, brand, level: 'adset', object: s.id, name: s.name, where: camp.name, kind: mv, why: callWhy(r), title: callLabel(r) + '?',
        onDone: doneOn(s.id, true), onUndo: undoOn(s.id, 'status') });
      toast(callWhy(r) || callLabel(r), { ms: 5000 });
    };
    const n = s.ads.length, nOn = s.ads.filter(a => onOf(statusOf(T, D, 'ad', a.id, a.status))).length;
    return h('div', { class: 'wrt-r set' + (on ? '' : ' off') },
      h('span', { class: 'wrt-nm' }, h('button', { type: 'button', class: 'wrt-open', 'aria-expanded': String(open), 'aria-label': `${open ? 'Close' : 'Open'} the ads in ${s.name}`, onclick: () => { if (openSets.has(s.id)) openSets.delete(s.id); else openSets.add(s.id); draw(); } },
        h('b', null, s.name), h('small', null, `${nOn} of ${n} ${n === 1 ? 'ad' : 'ads'} on`, h('span', { class: 'bud-in' }, ' · ' + budText))),
        h('span', { class: 'wrt-sub' }, subLine(t, m, !s.m))),
      cell('c-bud', ok(bud) ? money(bud) : life ? money(life) + ' lifetime' : 'campaign'),
      cell('c-tspend', ok(t.spend) ? usd(t.spend) : null),
      cell('c-troas', fx(t.roas)),
      cell('c-spend', ok(m.spend) ? usd(m.spend) : null),
      cell('c-sales', ok(m.purchases) ? String(m.purchases) : null),
      cell('c-roas', fx(m.roas)),
      cell('c-meta', fx(meta)),
      callCell(s.id, call, applyCall, on),
      h('span', { class: 'wrt-act c-act' },
        write && ok(bud) ? h('button', { type: 'button', class: 'wr-lk', onclick: () => doBudget(null, null, `Set the budget on ${s.name}`) }, 'Set budget') : null,
        onSwitch(on, { disabled: !write, note, label: `${s.name} is ${on ? 'on' : 'off'}. ${on ? 'Turn it off' : 'Turn it on'}`, onclick: toggle })));
  }

  function adRow(a, s, setAds) {
    const st = stateOf(T, D, 'ad', a.id, a.status), on = onOf(st.own), note = stateNote(st);
    const meta = a.spend > 0 && ok(a.platform_revenue) ? a.platform_revenue / a.spend : null;
    const call = callsBy(D).ad[a.id];
    const pic = T.pics[a.id] || a.thumb || null;
    const video = a.media_type === 'video';
    const t = a.t || {};
    const detail = () => openAdDetail(ctx, {
      ...a, status: st.own, effective_status: st.eff, thumb: pic, campaign: camp.name, adset: s.name, adset_id: s.id, adset_name: s.name,
      set: s.m ? { name: s.name, spend: s.m.spend, purchases: s.m.purchases, roas: s.m.roas, cpa: s.m.cpa, ads: s.ads.length } : undefined,
      call: call ? { label: callLabel(call), tone: TONE[call.kind] || '', why: callWhy(call) } : undefined,
    }, { act, adsetAds: setAds, window: win, goals: opts.goals || undefined });
    const toggle = (kind, why, title) => writeSheet(ctx, { act, brand, level: 'ad', object: a.id, name: a.name, where: s.name, kind: kind || (on ? 'pause' : 'resume'), why, title, uncalled: !call,
      onDone: doneOn(a.id, !!call), onUndo: undoOn(a.id, 'status') });
    const applyCall = (r, mv) => (mv === 'pause' || mv === 'resume') ? toggle(mv, callWhy(r), callLabel(r) + '?') : detail();
    return h('div', { class: 'wrt-r ad' + (on ? '' : ' off') },
      h('span', { class: 'wrt-nm' }, h('button', { type: 'button', class: 'wrt-open', onclick: detail, 'aria-label': `Open the ad ${a.name}` },
        h('span', { class: 'wrt-th', style: pic ? { backgroundImage: `url("${String(pic).replace(/"/g, '%22')}")` } : null }, pic ? null : video ? 'Video' : 'Image'),
        h('b', { title: a.name }, a.name)),
        h('span', { class: 'wrt-sub' }, subLine(t, a.idle ? null : a, a.idle))),
      h('span', { class: 'c-bud r na' }, ''),
      cell('c-tspend', ok(t.spend) ? usd(t.spend) : null),
      cell('c-troas', fx(t.roas)),
      cell('c-spend', ok(a.spend) && a.spend > 0 ? usd(a.spend) : a.idle ? null : '$0'),
      cell('c-sales', ok(a.purchases) && !a.idle ? String(a.purchases) : null),
      cell('c-roas', fx(a.roas)),
      cell('c-meta', fx(meta)),
      callCell(a.id, call, applyCall, on),
      h('span', { class: 'wrt-act c-act' }, onSwitch(on, { disabled: !write, note, label: `${a.name} is ${on ? 'on' : 'off'}. ${on ? 'Turn it off' : 'Turn it on'}`, onclick: () => toggle() })));
  }

  function draw() {
    if (!D) return;
    const sets = setsOfCamp();
    const ids = sets.flatMap(s => s.ads.map(a => a.id)).filter(id => !(id in T.pics));
    if (ids.length) T.covers(act, ids).then(got => { if (got && host.isConnected) draw(); });
    const head = h('div', { class: 'wrt-h' },
      h('span', { class: 't' }, h('b', null, 'Ad sets and ads'), `, today and this week (${win.label}). Spend is Meta; orders and ROAS are Triple Whale last click.`,
        h('span', { class: 'mo' }, " Meta's own count is Meta's figure, a second opinion.")),
      staleStamp({ at: D.at, label: 'Read', onRefresh: () => load(true) }),
      opts.details ? button('Campaign details', { onclick: () => opts.details() }) : null);
    if (!sets.length) return put(host, head, h('p', { class: 'wrt-msg' }, D.live || D.paid ? 'No ad sets in this campaign this week.' : 'Meta did not answer, so the ad sets are not read.'));
    const hd = h('div', { class: 'wrt-r hd', 'aria-hidden': 'true' },
      h('span', null, 'Ad set and ads'), h('span', { class: 'c-bud r' }, 'Budget a day'),
      h('span', { class: 'c-tspend r' }, 'Spent today'), h('span', { class: 'c-troas r' }, defLabel('ROAS today', 'roas')),
      h('span', { class: 'c-spend r' }, 'Spend, this week'), h('span', { class: 'c-sales r' }, 'Orders, this week'),
      h('span', { class: 'c-roas r' }, defLabel('ROAS, this week', 'roas')), h('span', { class: 'c-meta r' }, "Meta's own count"), h('span', { class: 'c-call' }, 'Ad call'), h('span', { class: 'c-act r' }, ''));
    const rows = [];
    for (const s of sets) {
      rows.push(setRow(s));
      if (!isOpen(s)) continue;
      const all = allAds.has(s.id);
      const setAds = s.ads.map(a => ({ id: a.id, name: a.name, spend: a.spend, revenue: a.revenue, purchases: a.purchases, roas: a.roas, cpa: a.cpa, status: statusOf(T, D, 'ad', a.id, a.status), media_type: a.media_type, thumb: T.pics[a.id] || a.thumb || null }));
      (all ? s.ads : s.ads.slice(0, SHOW_ADS)).forEach(a => rows.push(adRow(a, s, setAds)));
      if (!s.ads.length) rows.push(h('p', { class: 'wrt-more', style: { color: 'var(--muted)', fontSize: '12.5px', margin: 0 } }, 'No ads in this ad set.'));
      if (s.ads.length > SHOW_ADS) rows.push(h('div', { class: 'wrt-more' }, h('button', { type: 'button', onclick: () => { if (all) allAds.delete(s.id); else allAds.add(s.id); draw(); } }, all ? 'Show fewer' : `Show all ${s.ads.length} ads`)));
    }
    const errs = Object.values(D.errs || {}).filter(Boolean);
    put(host, head, hd, rows,
      h('p', { class: 'wrt-foot' }, 'Ad calls come from the ad rules: wait until twice the goal cost is spent and 3 days pass, scale 3 or more orders on goal, cut at three times the goal with none, and read the ad set first. An ad still inside its wait window has no call.',
        errs.length ? ' Not read: ' + errs.join('; ') + '.' : ''));
  }
  load(false);
  host.refresh = () => draw();
  return host;
}
