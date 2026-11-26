/* Yes, No and Undo on a Meta call. Shared by Meta > Suggestions (one brand), the all-brands Suggestions list and
   both Changes made pages. The SAME routes and bodies as old Locus (profit/buyer.js and profit/nudge.js):

     Yes    POST account-health /api/meta/write {act, kind, level, object, reason, amount|min, dry: true}
            then POST /api/meta/write {same body, client_why, expect: <from dry.before>, big?, over_pause?}
            then POST /api/buyer-list/decision {act, object, action, name, line, decision: 'yes', write_id}
                 (if that fails: POST /api/buyer-list/state {act, object, action, status: 'done', name})
            A row with no Meta move (a brief, a look closer) only records the decision.
     No     POST /api/buyer-list/disagree {act, why, row: {...}} then POST /api/buyer-list/decide {act, id, decision: 'mine'}
            then POST /api/buyer-list/decision {..., decision: 'no', note: why}
     Undo   POST /api/meta/undo {act, write}   (the server allows 24 hours)

   Sample mode never calls a write route: every step is simulated here and says so. */

import { h, button, sheet, toast, money, addStyles } from '../../kit.js';
import { forgetWaiting } from '../../bell.js';

const BIG = 0.5;
const CSS = `
.mw{display:grid;gap:14px}
.mw-on{color:var(--muted);font-size:13.5px;overflow-wrap:anywhere}
.mw-why{margin:0;font-size:14px;line-height:1.45;color:var(--ink-2)}
.mw-ba{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;font-size:17px;font-variant-numeric:tabular-nums}
.mw-ba span{color:var(--muted)}.mw-ba b{font-weight:600}.mw-ba i{font-style:normal;color:var(--faint)}
.mw-detail{color:var(--faint);font-size:12.5px;white-space:pre-line;overflow-wrap:anywhere}
.mw-big{margin:0;padding:10px 12px;border-radius:var(--r-tbl,12px);background:color-mix(in srgb,var(--bad) 10%,#fff);color:var(--bad);font-weight:600;font-size:13.5px}
.mw-err{margin:0;color:var(--bad);font-size:13.5px;line-height:1.45}
.mw-lab{display:grid;gap:6px;font-size:13px;color:var(--muted)}
.mw-lab .lx-input{font-size:15px;color:var(--ink)}
.mw-lab textarea.lx-input{min-height:72px}
.mw-held{margin:0;padding:10px 12px;border-radius:var(--r-tbl,12px);background:var(--bg-2,#F4F3EF);font-size:13.5px;line-height:1.45}
.mw-btns{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
.mw-btns .lx-btn{min-height:44px}
.mw-btns .lx-btn.danger{background:var(--bad);border-color:var(--bad);color:#fff}
.mw-act{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.mw-act .lx-btn{min-height:40px;min-width:72px;justify-content:center}
.mw-toast{display:inline-flex;align-items:center;gap:12px;pointer-events:auto}
.mw-toast button{border:0;background:transparent;color:#fff;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;min-height:32px;padding:0 4px}
@media (max-width:759px){
  .mw-btns{display:grid;grid-template-columns:1fr}
  .mw-btns .lx-btn{width:100%;height:48px;justify-content:center}
  .mw-act .lx-btn{min-height:44px;flex:1}
}`;
const css = () => addStyles('mw-css', CSS);

/** The team can write; a client, a "see as client" view and a read only viewer cannot. */
export function canWrite(ctx) {
  if (!ctx || ctx.isClient) return false;
  const me = ctx.me || {};
  return !['viewer', 'client'].includes(String(me.role || '').toLowerCase()) && String(me.access || '').toLowerCase() !== 'viewer';
}

const errText = e => (e && e.message) || 'The server did not answer.';
const ah = (ctx, path, body) => ctx.api(path, { worker: 'ah', method: 'POST', body });
const hasMove = c => ['pause', 'resume', 'budget', 'minoff'].includes(c.do);
export { hasMove };

/* ---------- the body, exactly as buyer.js bodyOf() builds it ---------- */
function bodyOf(c, amount) {
  const kind = c.do === 'minoff' ? 'min_spend' : c.do;
  const level = kind === 'budget' || kind === 'min_spend' ? (c.adset_id ? 'adset' : 'campaign') : c.level === 'ad' && c.ad_id ? 'ad' : c.adset_id ? 'adset' : c.ad_id ? 'ad' : 'campaign';
  const object = level === 'ad' ? c.ad_id : level === 'adset' ? c.adset_id : c.campaign_id;
  return { act: c.act_id, kind, level, object, reason: `From the Buyer list: ${c.action}. ${c.why || ''}`.slice(0, 280),
    ...(kind === 'budget' ? { amount } : {}), ...(kind === 'min_spend' ? { min: 0 } : {}) };
}
/* buyer.js expectOf() */
const expectOf = (kind, b) => { b = b || {};
  if (kind === 'budget') return b.daily_budget != null ? { daily_budget: b.daily_budget } : b.lifetime_budget != null ? { lifetime_budget: b.lifetime_budget } : undefined;
  if (kind === 'min_spend') return b.daily_min_spend_target != null ? { daily_min_spend_target: b.daily_min_spend_target } : {};
  return b.status != null ? { status: b.status } : undefined; };
const decisionBody = (c, extra) => ({ act: c.act_id, object: c.object, action: c.kind, name: c.name, line: (c.card || {}).do || c.action, ...extra });

/* ---------- words ---------- */
const STATUS = { ACTIVE: 'On', PAUSED: 'Off', ARCHIVED: 'Archived', DELETED: 'Deleted' };
const LEVEL_WORD = { ad: 'ad', adset: 'ad set', campaign: 'campaign' };
function valueText(field, v, cur) {
  if (v == null || v === '') return 'none';
  if (field === 'status') return STATUS[v] || String(v);
  if (/budget|min_spend|spend_cap/.test(field)) return money(Math.round(+v) / 100, { cur }) + (/daily/.test(field) ? ' a day' : /lifetime/.test(field) ? ' total' : '');
  return String(v);
}
/** The sentence the client reads on their Updates page. Plain, no names of people, no internal words. */
export function clientLine(c, amount, from) {
  const lv = LEVEL_WORD[c.do === 'budget' || c.do === 'minoff' ? (c.adset_id ? 'adset' : 'campaign') : c.level === 'ad' && c.ad_id ? 'ad' : c.adset_id ? 'adset' : 'campaign'] || 'ad set';
  const one = lv === 'campaign' ? 'a campaign' : 'an ' + lv;
  if (c.do === 'pause') return `We turned off ${one} that was spending without enough sales, so the money goes to the ads that sell.`;
  if (c.do === 'resume') return `We turned ${one} back on because it was selling well.`;
  if (c.do === 'minoff') return 'We took the set spend floor off an ad set so Meta can put the money where the sales come from.';
  if (c.do === 'budget') {
    const down = from != null && amount != null && amount < from;
    return down ? `We lowered the budget on ${lv === 'campaign' ? 'a campaign' : 'an ad set'} that cost more per sale than the goal.`
      : `We raised the budget on ${lv === 'campaign' ? 'a campaign' : 'an ad set'} that is selling under the goal cost.`;
  }
  return '';
}

/* ---------- the toast with Undo ---------- */
export function doneToast(ctx, text, undo) {
  const el = toast('', { ms: undo ? 12000 : 3200 });
  el.replaceChildren(h('span', { class: 'mw-toast' }, h('span', null, text),
    undo ? h('button', { type: 'button', onclick: () => { el.remove(); undo(); } }, 'Undo') : null));
  return el;
}
/** Undo one or more writes (the newest first, as nudge.js undo() does). Calls back with true when every one came back. */
export async function undoWrites(ctx, act, writes, onDone) {
  if (ctx.sample) { toast('Sample: nothing was changed. In real use Meta gets the old value back.'); onDone && onDone(true); return true; }
  toast('Undoing...', { ms: 1500 });
  const fails = [];
  for (const w of writes.filter(Boolean)) {
    try { const r = await ah(ctx, '/api/meta/undo', { act, write: w }); if (!r || r.error) fails.push((r && r.error) || 'no answer'); }
    catch (e) { fails.push(errText(e)); }
  }
  forgetWaiting();
  toast(fails.length ? 'Could not undo: ' + fails.join(' ') : 'Undone. Meta has the old value back.', { tone: fails.length ? 'bad' : 'good', ms: fails.length ? 7000 : 3200 });
  onDone && onDone(!fails.length);
  return !fails.length;
}
/** Undo from a Changes made row: a confirm sheet first, then the undo. */
export function undoSheet(ctx, { act, write, what, name }, onDone) {
  css();
  const err = h('p', { class: 'mw-err', hidden: true });
  const yes = button('Yes, undo it', { primary: true });
  const sh = sheet({ title: 'Undo this change?', side: 'center', body: h('div', { class: 'mw' },
    h('p', { class: 'mw-why' }, what || 'This change'),
    name ? h('div', { class: 'mw-on' }, name) : null,
    h('p', { class: 'mw-detail' }, 'Meta gets back exactly the value from before this change. If someone changed it again since, the server says so and nothing is written. Undo works for 24 hours after the change.'),
    err,
    h('div', { class: 'mw-btns' }, button('Cancel', { onclick: () => sh.close() }), yes)) });
  yes.onclick = async () => {
    yes.disabled = true; yes.textContent = 'Undoing...'; err.hidden = true;
    if (ctx.sample) { sh.close(); toast('Sample: nothing was changed'); onDone && onDone(true); return; }
    try {
      const r = await ah(ctx, '/api/meta/undo', { act, write });
      if (!r || r.error) throw new Error((r && r.error) || 'The server did not answer.');
      forgetWaiting(); sh.close(); toast('Undone. Meta has the old value back.', { tone: 'good' }); onDone && onDone(true);
    } catch (e) { err.textContent = errText(e); err.hidden = false; yes.disabled = false; yes.textContent = 'Yes, undo it'; }
  };
  return sh;
}

/* ---------- sample: what a dry run would say ---------- */
function sampleDry(c, body) {
  if (body.kind === 'budget') {
    const from = Math.round((c.budget > 0 ? c.budget : body.amount / 1.25) * 100);
    return { ok: true, dry: true, name: c.name, step: [{ field: 'daily_budget', from: String(from), to: String(Math.round(body.amount * 100)) }], before: { daily_budget: String(from) }, detail: 'Sample: no real ad account was read.' };
  }
  if (body.kind === 'min_spend') return { ok: true, dry: true, name: c.name, step: [{ field: 'daily_min_spend_target', from: '2000', to: '0' }], before: { daily_min_spend_target: '2000' }, detail: 'Sample: no real ad account was read.' };
  const to = body.kind === 'resume' ? 'ACTIVE' : 'PAUSED';
  return { ok: true, dry: true, name: c.name, step: [{ field: 'status', from: to === 'ACTIVE' ? 'PAUSED' : 'ACTIVE', to }], before: { status: to === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }, detail: 'Sample: no real ad account was read.' };
}

/* ---------- YES ---------- */
/** c = the buyer list row (act_id, object, kind, name, action, why, do, level, ad_id, adset_id, campaign_id,
    suggested_budget, then, currency). onDone({ decision: 'yes', write_id }) after the write and the record. */
export async function sayYes(ctx, c, onDone) {
  css();
  if (!hasMove(c)) return recordOnly(ctx, c, onDone);
  const cur = c.currency || 'USD';
  const status = h('p', { class: 'mw-detail' }, 'Checking with Meta...');
  const ba = h('div', { class: 'mw-ba' }), detail = h('p', { class: 'mw-detail' }), bigLine = h('p', { class: 'mw-big', hidden: true });
  const err = h('p', { class: 'mw-err', hidden: true });
  const amountBox = h('input', { class: 'lx-input', type: 'number', min: '1', step: '1', inputmode: 'decimal', 'aria-label': 'New daily budget' });
  const amountWrap = h('label', { class: 'mw-lab', hidden: true }, 'New budget', amountBox);
  const heldLine = h('p', { class: 'mw-held', hidden: true });
  const overBox = h('input', { class: 'lx-input', type: 'text', maxlength: '200', placeholder: 'Why it should run again', 'aria-label': 'Why turn it back on' });
  const overWrap = h('label', { class: 'mw-lab', hidden: true }, 'Why it should run again', overBox);
  const whyBox = h('textarea', { class: 'lx-input', maxlength: '600', rows: '2', 'aria-label': 'What the client will read' });
  const whyWrap = h('label', { class: 'mw-lab' }, 'What the client will read', whyBox);
  const yes = button('Yes, make the change', { primary: true, disabled: true });
  const sh = sheet({ title: (c.action || 'Make this change') + '?', side: 'center', body: h('div', { class: 'mw' },
    h('div', { class: 'mw-on' }, [c.brand, c.name].filter(Boolean).join(', ')),
    c.why ? h('p', { class: 'mw-why' }, c.why) : null,
    amountWrap, ba, status, bigLine, detail, heldLine, overWrap, whyWrap, err,
    h('p', { class: 'mw-detail' }, 'Written to Meta and logged in Changes. Undo for 24 hours.'),
    h('div', { class: 'mw-btns' }, button('Cancel', { onclick: () => sh.close() }), yes)) });

  let plan = null, from = null, big = false, seq = 0, needOver = false, checking = false, writing = false;
  const showPlan = () => {
    const step = (plan && plan.dry && plan.dry.step) || [];
    ba.replaceChildren(...step.flatMap((s, i) => [i ? h('i', null, ', ') : null, h('span', null, valueText(s.field, s.from, cur)), h('i', null, ' → '), h('b', null, valueText(s.field, s.to, cur))]).filter(Boolean));
    detail.textContent = plan && plan.dry && plan.dry.detail ? plan.dry.detail : '';
    const b = step.find(s => /budget/.test(s.field));
    big = false;
    if (b && +b.from > 0) {
      const ch = (+b.to - +b.from) / +b.from;
      big = Math.abs(ch) > BIG;
      bigLine.textContent = `Big change: ${ch >= 0 ? '+' : ''}${Math.round(ch * 100)}% in one step. Meta may restart learning on it.`;
    }
    bigLine.hidden = !big;
    yes.textContent = big ? 'Yes, make this big change' : 'Yes, make the change';
    yes.classList.toggle('danger', big);
  };
  const ready = () => { yes.disabled = checking || writing || !(plan && !plan.error) || !whyBox.value.trim() || (needOver && overBox.value.trim().length < 4); };
  whyBox.oninput = ready; overBox.oninput = () => { ready(); };

  /* While a check runs (or a new amount waits to be checked) Yes stays off, so a stale plan is never written. */
  async function dryRun() {
    checking = true; const my = seq + 1;
    try { await check(); } finally { if (seq === my) { checking = false; ready(); } }
  }
  async function check() {
    const my = ++seq;
    err.hidden = true; status.hidden = false; status.textContent = 'Checking with Meta...'; yes.disabled = true;
    let amount;
    if (c.do === 'budget') { amount = Math.round(+amountBox.value); if (!(amount > 0)) { status.textContent = 'Type the new amount.'; plan = null; return; } }
    const body = bodyOf(c, amount);
    if (!/^\d{6,}$/.test(String(body.object || '')) && !ctx.sample) { plan = { error: 'There is no id to change here. Open it in Ads Manager.' }; status.hidden = true; err.textContent = plan.error; err.hidden = false; return; }
    const over = needOver ? overBox.value.trim() : '';
    let dry;
    if (ctx.sample) dry = sampleDry(c, body);
    else { try { dry = await ah(ctx, '/api/meta/write', { ...body, ...(over ? { over_pause: over } : {}), dry: true }); } catch (e) { dry = { error: errText(e) }; } }
    if (my !== seq) return;
    status.hidden = true;
    if (!dry || dry.error) {
      if (dry && dry.need === 'over_pause' && dry.held) {
        needOver = true; overWrap.hidden = false;
        const hd = dry.held;
        heldLine.textContent = `${hd.by || 'Someone'} turned this off on ${hd.day || 'a recent day'}${hd.why ? ', because: ' + hd.why : ', with no reason given'}. Say why it should run again, then check again.`;
        heldLine.hidden = false;
        plan = { error: 'need over_pause', body };
        const again = button('Check again', { onclick: () => { if (overBox.value.trim().length >= 4) dryRun(); else overBox.focus(); } });
        if (!overWrap.querySelector('.lx-btn')) overWrap.append(again);
        return;
      }
      plan = { error: (dry && dry.error) || 'Meta did not answer.' };
      err.textContent = plan.error; err.hidden = false; ba.replaceChildren(); bigLine.hidden = true;
      return;
    }
    plan = { body, dry, over, expect: expectOf(body.kind, dry.before) };
    if (c.do === 'budget' && dry.before) { const k = dry.before.daily_budget != null ? 'daily_budget' : 'lifetime_budget'; from = dry.before[k] != null ? +dry.before[k] / 100 : from; }
    if (!whyBox.dataset.typed) whyBox.value = clientLine(c, amount, from);
    showPlan(); ready();
  }
  whyBox.addEventListener('input', () => { whyBox.dataset.typed = '1'; });

  /* A budget: the call's own number, else the live budget plus 20% (as nudge.js budget() does). The box stays editable. */
  if (c.do === 'budget') {
    let start = c.suggested_budget > 0 ? Math.round(c.suggested_budget) : null;
    if (!start) {
      if (ctx.sample) start = Math.round((c.budget || 20) * 1.2);
      else {
        try {
          const live = await ctx.api(`/api/meta/live?act=${encodeURIComponent(c.act_id)}`, { worker: 'ah' });
          if (live && live.error) throw new Error(live.error);
          const o = c.adset_id ? live && live.adsets && live.adsets[c.adset_id] : live && live.campaigns && live.campaigns[c.campaign_id];
          if (!o) throw new Error('Meta did not return this ad set. It may have been removed.');
          if (!o.daily && !o.lifetime) throw new Error('This ad set runs on its campaign\'s budget, so the change goes on the campaign. Change it on Meta > Live now.');
          from = o.daily || o.lifetime; start = Math.round(from * 1.2);
        } catch (e) { status.hidden = true; err.textContent = errText(e); err.hidden = false; return sh; }
      }
    }
    amountBox.value = String(start); amountWrap.hidden = false;
    let t = null;
    amountBox.oninput = () => { clearTimeout(t); checking = true; plan = null; yes.disabled = true; t = setTimeout(dryRun, 500); };
  }
  await dryRun();

  yes.onclick = async () => {
    if (!plan || plan.error || checking || writing) return;
    const why = whyBox.value.trim();
    if (!why) { err.textContent = 'Write the line the client will read.'; err.hidden = false; return; }
    writing = true; yes.disabled = true; const was = yes.textContent; yes.textContent = 'Writing to Meta...'; err.hidden = true;
    const fail = m => { writing = false; err.textContent = m; err.hidden = false; yes.textContent = was; ready(); };
    if (ctx.sample) {
      sh.close();
      doneToast(ctx, 'Sample: nothing was changed', () => undoWrites(ctx, c.act_id, ['sample'], () => onDone && onDone({ decision: null })));
      onDone && onDone({ decision: 'yes', write_id: 'sample' });
      return;
    }
    const body = { ...plan.body, client_why: why, ...(plan.over ? { over_pause: plan.over } : {}), ...(big ? { big: true } : {}) };
    let w; try { w = await ah(ctx, '/api/meta/write', { ...body, expect: plan.expect }); } catch (e) { w = { error: errText(e) }; }
    if (!w || w.error) return fail((w && w.error) || 'Meta did not answer.');
    forgetWaiting();
    const writes = [w.write];
    /* the nudge's "not picked" row: the minimum off, then the ad set paused (buyer.js pauseAfter) */
    if (plan.body.kind === 'min_spend' && c.then === 'pause') {
      const pb = { act: c.act_id, kind: 'pause', level: 'adset', object: c.adset_id, reason: `From the Buyer list: ${c.action}. ${c.why || ''}`.slice(0, 280) };
      let d2; try { d2 = await ah(ctx, '/api/meta/write', { ...pb, dry: true }); } catch (e) { d2 = { error: errText(e) }; }
      let p2 = null;
      if (d2 && !d2.error) { try { p2 = await ah(ctx, '/api/meta/write', { ...pb, client_why: why, expect: d2.before && d2.before.status != null ? { status: d2.before.status } : undefined }); } catch (e) { p2 = { error: errText(e) }; } }
      const pe = !d2 || d2.error ? (d2 && d2.error) : !p2 || p2.error ? (p2 && p2.error) || 'no answer' : null;
      if (pe) { toast('The minimum came off, but the ad set was not paused: ' + pe, { tone: 'bad', ms: 8000 }); }
      else writes.unshift(p2.write);
    }
    const writeId = w.write || null;
    try { const j = await ah(ctx, '/api/buyer-list/decision', decisionBody(c, { decision: 'yes', write_id: writeId })); if (j && j.error) throw new Error(j.error); }
    catch { await ah(ctx, '/api/buyer-list/state', { act: c.act_id, object: c.object, action: c.kind, status: 'done', name: c.name }).catch(() => {}); }
    sh.close();
    const summary = String(w.summary || 'Done.').replace(/^[^:]+:\s*/, '');
    const ids = writes.filter(Boolean);
    doneToast(ctx, summary, ids.length ? () => undoWrites(ctx, c.act_id, ids, ok => {
      if (ok) ah(ctx, '/api/buyer-list/decision', decisionBody(c, { decision: 'clear' })).catch(() => {}).then(() => onDone && onDone({ decision: null }));
    }) : null);
    onDone && onDone({ decision: 'yes', write_id: writeId, summary });
  };
  return sh;
}

/** A call with no Meta move (new ads needed, look closer): Yes only records the decision. */
async function recordOnly(ctx, c, onDone) {
  if (ctx.sample) { toast('Sample: nothing was changed'); onDone && onDone({ decision: 'yes' }); return; }
  try {
    const j = await ah(ctx, '/api/buyer-list/decision', decisionBody(c, { decision: 'yes' }));
    if (j && j.error) throw new Error(j.error);
    forgetWaiting();
    toast('Saved as yes. Nothing changes in Meta from this one.', { tone: 'good' });
    onDone && onDone({ decision: 'yes' });
  } catch (e) { toast('Could not save it: ' + errText(e), { tone: 'bad', ms: 7000 }); }
}

/* ---------- NO ---------- */
export function sayNo(ctx, c, onDone) {
  css();
  const box = h('input', { class: 'lx-input', type: 'text', maxlength: '300', placeholder: 'In a few words', 'aria-label': 'Why not' });
  const err = h('p', { class: 'mw-err', hidden: true });
  const go = button('Say no', { primary: true, disabled: true });
  const sh = sheet({ title: 'Why not?', side: 'center', body: h('div', { class: 'mw' },
    h('div', { class: 'mw-on' }, [c.action, c.name].filter(Boolean).join(', ')),
    h('label', { class: 'mw-lab' }, 'Why', box),
    h('p', { class: 'mw-detail' }, 'Nothing changes in Meta. Your reason is kept as a lesson for this brand\'s calls.'),
    err,
    h('div', { class: 'mw-btns' }, button('Cancel', { onclick: () => sh.close() }), go)) });
  box.oninput = () => { go.disabled = box.value.trim().length < 4; };
  box.onkeydown = e => { if (e.key === 'Enter' && !go.disabled) go.click(); };
  setTimeout(() => box.focus(), 50);
  go.onclick = async () => {
    const why = box.value.trim();
    if (why.length < 4) return;
    go.disabled = true; go.textContent = 'Saving...'; err.hidden = true;
    if (ctx.sample) { sh.close(); toast('Sample: nothing was changed'); onDone && onDone({ decision: 'no', note: why }); return; }
    try {
      const j = await ah(ctx, '/api/buyer-list/disagree', { act: c.act_id, why, row: { key: c.key, kind: c.kind, object: c.object, action: c.action, name: c.name, set: c.set, adset: c.adset, adset_id: c.adset_id, ad_id: c.ad_id, meta_act: c.meta_act,
        why: c.why, why_full: c.why_full, stake: c.stake, goal: c.goal, goal_roas: c.goal_roas, metric: c.metric, role: c.role, ai: c.ai || null } });
      if (!j || j.error) throw new Error((j && j.error) || 'The server did not answer.');
      if (j.id) await ah(ctx, '/api/buyer-list/decide', { act: c.act_id, id: j.id, decision: 'mine' }).catch(() => {});
      await ah(ctx, '/api/buyer-list/decision', decisionBody(c, { decision: 'no', note: why })).catch(() => {});
      forgetWaiting();
      sh.close();
      toast(j.answer ? 'Saved. ' + j.answer : 'Saved as no.', { ms: j.answer ? 9000 : 3000 });
      onDone && onDone({ decision: 'no', note: why });
    } catch (e) {
      const m = errText(e);
      err.textContent = /which call/i.test(m) ? 'This row is not one of the rule calls, so the server could not file a No for it. Nothing was saved.' : 'Not saved: ' + m;
      err.hidden = false; go.disabled = false; go.textContent = 'Say no';
    }
  };
  return sh;
}

/** The Yes and No pair for a row. */
export function yesNo(ctx, c, onDone) {
  css();
  return h('div', { class: 'mw-act' },
    button('Yes', { primary: true, aria: 'Yes: ' + (c.action || ''), onclick: () => sayYes(ctx, c, onDone) }),
    button('No', { aria: 'No: ' + (c.action || ''), onclick: () => sayNo(ctx, c, onDone) }));
}

/* ---------- Changes made: which rows can be undone ---------- */
const WRITE_RE = /\bWrite (mw_[0-9a-zA-Z]+)/;
const UNDO_RE = /\bUndo of (mw_[0-9a-zA-Z]+)/;
/** From the raw /api/activities rows: the set of write ids already undone. */
export function undoneSet(rows) {
  const s = new Set();
  for (const a of rows || []) { const m = UNDO_RE.exec(String(a.note || '')); if (m) s.add(m[1]); }
  return s;
}
/** The write id on one activities row, when it is a change made through the app. */
export const writeOf = a => (/^(locus_write|strategist_write)$/.test(String(a.event_type || '')) ? (WRITE_RE.exec(String(a.note || '')) || [])[1] || null : null);
/** True when this change can still be undone: made in the app, under 24 hours old, not undone yet. */
export function canUndo(r, ctx) {
  if (!r || !r.write || r.undone || !canWrite(ctx)) return false;
  if (ctx.sample) return true;
  const t = Date.parse(r.at);
  return isFinite(t) && Date.now() - t < 24 * 3600e3;
}
