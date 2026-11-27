/* The settings parts every settings page shares (Brand settings, Agency settings, My settings).
   Nothing here touches the network. A page stages its changes in stage() and one Save button writes them
   through ctx.saveSetting, so a key the workers know is saved there and every other key stays on this device.
   The kit has no page stylesheet hook, so css() adds the rules once; every class starts with lx-st-. */

import { exampleChip as kitExampleChip } from '../../kit.js';
import { h, addStyles, button, toggle, segmented, card, pill, toast, statusDot, svgNode, sheet } from '../../kit.js';
import { settingHome } from '../../data.js';
import { pageHelp } from '../../defs.js';

export const LOCAL_NOTE = 'Saved on this device until the settings release';
export const EXAMPLE_NOTE = 'Example until its data feed is built';

let done = false;
export function css() { if (done) return; done = true; addStyles('lx-settings-css', CSS); }

/** The small gray chip for a part drawn from the example file in real mode. */
export const exampleChip = kitExampleChip; /* one version, in the kit */
/** The small note for a control that has no server setting yet. */
export const localNote = () => h('span', { class: 'lx-st-local' }, LOCAL_NOTE);

/* ---------- staging: read now, change freely, save once ---------- */
/** const S = stage(ctx, { live: { 'agency.morningHour': 5 }, savers: { 'ask.model': v => ... } })
    live holds what the server answered for the keys it knows; any other key is read from this person's store.
    S.get(key, fallback), S.set(key, value), S.save(), S.onChange(fn), S.dirty */
/* WHICH SAVES REACH A SERVER. Only these four are switched on (release 2026-11-25). Each asks first in a
   confirm sheet that shows the old and the new value, and shows its own error when the server says no.
     goal    goal ROAS and goal cost         account-health PUT /api/accounts/<brand id> { target_roas | target_cpa }
     rules   the test and call rules         profit PUT /api/brand/rules?act=<brand id> { rules: { <name>: <number> } }
     me      my settings (the morning DM)    account-health PUT /api/me/prefs { morning_dm }
     ai      the assistant's settings        account-health PUT /api/ask/settings { model | instructions }
   Every other save that has a server home (the agency settings on PUT /api/settings, the "about your agency"
   text on PUT /api/ask/brief) is HELD: it stays staged on the page, nothing is sent, and the sheet says so.
   To switch one on, a page passes its saver without naming the key in `held`, or AGENCY_ON becomes true. */
const AGENCY_ON = false;
const GOAL_KEY = /^brand:[^.]+\.(target_roas|target_cpa)$/;

/** const S = stage(ctx, { live: { 'me.morning_dm': true }, savers: { 'ai.model': v => ... }, held: ['ai.brief'], names: { key: 'Plain name' } })
    live holds what the server answered for the keys it knows; any other key is read from this person's store.
    savers are the page's own server writes, one per key; held names the savers that are not switched on yet.
    S.get(key, fallback), S.set(key, value), S.save(), S.onChange(fn), S.dirty, S.changes(), S.where(key) */
export function stage(ctx, { live = {}, savers = {}, held = [], names = {} } = {}) {
  const staged = new Map(), subs = [], first = new Map(), shown = new Map();   // shown: what each control opened on, so the sheet can say what a value was
  const base = (key, fallback) => (key in live && live[key] != null ? live[key] : ctx.settingNow(key, fallback));
  const nameOf = key => {
    if (names[key]) return names[key];
    let el = null; try { el = document.querySelector('[data-key="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'); } catch {}
    const lab = el && (el.getAttribute('aria-label') || (el.querySelector('[aria-label]') || { getAttribute: () => '' }).getAttribute('aria-label'));
    return lab && lab !== key ? lab : key.replace(/^brand:[^.]+\./, '').replace(/^[a-z]+\./, '').replace(/[._]/g, ' ');
  };
  const S = {
    get(key, fallback) { if (staged.has(key)) return staged.get(key); const v = base(key, fallback); if (!shown.has(key)) shown.set(key, v); return v; },
    /** True when the person (or the server) has given this key a value: it is not just the page's fallback. */
    has: key => staged.has(key) || (key in live && live[key] != null) || ctx.settingNow(key, undefined) !== undefined,
    set(key, value) { if (!first.has(key)) first.set(key, base(key, shown.get(key))); staged.set(key, value); subs.forEach(f => f(key, value)); },
    /** Take a staged change back (the value on the page stays what the control shows). */
    drop(key) { staged.delete(key); subs.forEach(f => f(null)); },
    onChange(fn) { subs.push(fn); },
    get dirty() { return staged.size; },
    /** Where a change goes on Save: 'server' (switched on), 'held' (has a server home, not switched on yet) or 'device'. */
    where(key) {
      if (key in savers) return held.includes(key) ? 'held' : 'server';
      if (GOAL_KEY.test(key)) return 'server';
      const kind = ctx.sample ? 'local' : settingHome(key).kind;
      if (kind === 'agency') return AGENCY_ON ? 'server' : 'held';
      if (kind === 'rule') return 'held';            // rules go through a page saver, which sends the { rules } body the worker reads
      return 'device';
    },
    /** True when the key is kept by a worker in this mode (not sample, and switched on). */
    onServer: key => !ctx.sample && S.where(key) === 'server',
    /** What is waiting: [{ key, name, from, to, where }] */
    changes: () => [...staged].map(([key, to]) => ({ key, name: nameOf(key), from: first.get(key), to, where: S.where(key) })),
    /** Saves every change that is switched on, one at a time. A held change stays staged. Throws on the first
        refusal with e.key and e.name set; what was saved before it stays saved, what comes after is not sent. */
    async save() {
      let local = 0, server = 0, heldN = 0;
      for (const [key, value] of [...staged]) {
        const w = S.where(key);
        if (w === 'held') { heldN++; continue; }
        try {
          if (!ctx.sample && savers[key]) await savers[key](value); else await ctx.saveSetting(key, value);
        } catch (e) { const err = e instanceof Error ? e : new Error(String(e)); err.key = key; err.name2 = nameOf(key); subs.forEach(f => f(null)); throw err; }
        w === 'server' && !ctx.sample ? server++ : local++;
        if (key in live) live[key] = value;
        staged.delete(key); first.delete(key);
      }
      subs.forEach(f => f(null));
      return { local, server, held: heldN };
    },
  };
  return S;
}

const showVal = v => {
  if (v === undefined || v === null || v === '') return 'not set';
  if (v === true) return 'On'; if (v === false) return 'Off';
  if (Array.isArray(v)) return v.length ? v.join(', ') : 'none';
  if (typeof v === 'object') return v.preset || v.label || 'changed';
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s.length > 90 ? s.slice(0, 88) + '...' : s;
};
const WHY_BAD = { 401: 'Your sign in ran out. Sign in again, then save.', 403: 'This login is not allowed to change that.', 404: 'The server does not know this brand or setting.', 0: 'No answer from the server. Check the connection.' };
const sayError = e => (e && WHY_BAD[e.status]) || (e && e.message) || 'No answer from the server.';

/** The one bar above a settings page: what is waiting, and the one main button.
    A change that reaches a server is never sent on one tap: Save opens a sheet that lists every change with its
    old and new value and where it goes. A refusal shows in the sheet and on the bar, and the change stays staged. */
export function saveBar(S, ctx, { label = 'Save changes', note, help } = {}) {
  const say = h('span', { class: 'n' }), btn = button(label, { primary: true, disabled: true });
  const err = h('p', { class: 'lx-st-err', role: 'alert', hidden: true });
  let failed = '';
  const paint = () => {
    btn.disabled = !S.dirty;
    /* disabled reads as "nothing to save", never as a faded orange: the tooltip says why (the top bar chip already says Sample numbers) */
    btn.title = S.dirty ? '' : 'Nothing changed yet';
    btn.classList.toggle('lx-st-idle', !S.dirty);
    say.textContent = S.dirty ? S.dirty + (S.dirty === 1 ? ' change not saved yet' : ' changes not saved yet') : (note || '');
    err.hidden = !failed; err.textContent = failed;
  };
  const doneToast = r => toast(ctx.sample ? 'Saved on this device. Sample numbers reach no server.'
    : r.server ? 'Saved.' + (r.local ? ' ' + r.local + ' kept on this device.' : '') + (r.held ? ' ' + r.held + ' not switched on yet.' : '')
      : r.local ? LOCAL_NOTE + '.' : 'Nothing was sent. These saves are not switched on yet.');
  const fail = e => { failed = 'Not saved: ' + (e.name2 ? e.name2 + '. ' : '') + sayError(e); paint(); return failed; };

  function confirmSheet(list) {
    const groups = [
      ['server', ctx.sample ? 'Would be saved for everyone' : 'Saved for everyone', ctx.sample ? 'Sample numbers: nothing is sent.' : 'Every page and every person reads the new value right away.'],
      ['device', 'Kept on this device', 'No server home yet. Only you see these, on this device.'],
      ['held', 'Not switched on yet', 'Nothing is sent for these. They stay as they are until this save is switched on.'],
    ];
    const send = list.filter(c => c.where !== 'held').length;
    const problem = h('p', { class: 'lx-st-err', role: 'alert', hidden: true });
    const go = button(send ? 'Save ' + send + (send === 1 ? ' change' : ' changes') : 'Nothing to save yet', { primary: true, large: true, disabled: !send });
    const no = button('Not yet', { large: true });
    const body = h('div', { class: 'lx-st-cf' },
      h('p', { class: 'lx-st-cf-lead' }, 'Every change is shown here first. Nothing is saved until you tap Save.'),
      groups.map(([w, title, hint]) => {
        const rows = list.filter(c => c.where === w);
        return rows.length ? h('section', { class: 'g ' + w }, h('h3', null, title), h('p', { class: 'hint' }, hint),
          h('dl', null, rows.map(c => h('div', null, h('dt', null, c.name), h('dd', null, h('span', { class: 'was' }, showVal(c.from)), h('i', { 'aria-hidden': 'true' }, 'to'), h('b', null, showVal(c.to))))))) : null;
      }),
      problem,
      h('div', { class: 'acts' }, go, no));
    const sh = sheet({ title: 'Save these changes?', body });
    no.addEventListener('click', () => sh.close());
    go.addEventListener('click', async () => {
      go.disabled = no.disabled = true; go.textContent = 'Saving'; problem.hidden = true;
      try { const r = await S.save(); failed = ''; sh.close(); doneToast(r); paint(); }
      catch (e) {
        problem.textContent = fail(e) + ' Anything listed above it was saved. Nothing after it was sent.'; problem.hidden = false;
        no.disabled = false; no.textContent = 'Close';
        const left = S.changes().filter(c => c.where !== 'held').length;
        go.disabled = !left; go.textContent = left ? 'Try again' : 'Nothing left to save';
      }
    });
  }

  btn.addEventListener('click', async () => {
    const list = S.changes();
    if (list.some(c => c.where !== 'device')) return confirmSheet(list);
    btn.disabled = true;
    try { const r = await S.save(); failed = ''; doneToast(r); }
    catch (e) { toast(fail(e), { tone: 'bad', ms: 5000 }); }
    paint();
  });
  S.onChange(k => { if (k !== null) failed = ''; paint(); }); paint();
  return h('div', { class: 'lx-st-bar' }, help || null, say, h('span', { class: 'lx-sp' }), btn, err);
}

/** setHelp({ about, sections, fixed }) : the one "What is this page?" button at the top of a settings page.
    about: what the page is for. sections: more [{ title, text }]. fixed: the [label, value, why] facts that
    used to sit in a gray "Stays fixed" block at the foot of the page (no footers: they live here now). */
export function setHelp({ about, sections = [], fixed, fixedTitle = 'What stays fixed' } = {}) {
  const fx = fixed && fixed.filter(Boolean).length ? { title: fixedTitle, text: h('dl', { class: 'lx-st-helpdl' }, fixed.filter(Boolean).map(([k, v, why]) => h('div', null, h('dt', null, k), h('dd', null, h('b', null, v), why ? h('span', null, why) : null)))) } : null;
  return pageHelp({ body: [about ? { title: 'What it is for', text: about } : null, ...sections, fx].filter(Boolean) });
}

/* ---------- layout ---------- */
/** group('Times', 'note', ...rows) : a white card with a quiet heading and hairline rows */
export function group(title, note, ...kids) {
  return card({ title, note, flush: true, class: 'lx-st-card' }, h('div', { class: 'lx-st-rows' }, kids));
}
/** row('Morning send time', 'One time for every morning post.', control) : words on the left, the control on the right */
export function row(label, hint, control, { top = false, wide = false } = {}) {
  return h('div', { class: 'lx-st-row' + (top ? ' top' : '') + (wide ? ' wide' : '') },
    h('div', { class: 't' }, h('div', { class: 'k' }, label), hint && h('div', { class: 'hint' }, hint)),
    h('div', { class: 'c' }, control));
}
/** fact('Currency', 'US dollars', 'Read from the ad account.') : something that stays fixed, shown as a plain fact */
export function fact(label, value, why) {
  return h('div', { class: 'lx-st-row fact' }, h('div', { class: 't' }, h('div', { class: 'k' }, label), why && h('div', { class: 'hint' }, why)), h('div', { class: 'c v' }, value));
}
/** facts('Stays fixed', [[label, value, why]]) : the band of plain facts at the foot of a page */
export function facts(title, list, note) {
  return h('section', { class: 'lx-band lx-st-facts' }, h('div', { class: 'lx-sec' }, h('h3', null, title), note && h('span', { class: 'note' }, note)),
    h('dl', null, list.map(([k, v, why]) => h('div', null, h('dt', null, k), h('dd', null, h('b', null, v), why && h('span', null, why))))));
}
/** fold('Advanced', '13 guards, rarely touched', ...kids) : closed until opened */
export function fold(title, note, ...kids) {
  return h('details', { class: 'lx-card flush lx-st-fold' }, h('summary', null, h('h3', null, title), note && h('span', { class: 'note' }, note), h('span', { class: 'lx-sp' }), h('span', { class: 'more' }, 'Show')),
    h('div', { class: 'lx-st-rows' }, kids));
}
/** say('Wait until an ad set has spent ', numBox(...), ' times the goal.') : a rule as a plain sentence with its numbers in it */
export function say(...parts) { return h('p', { class: 'lx-st-say' }, parts); }

/* ---------- controls: each reads and stages one key ---------- */
const ctl = (S, key, el) => { el.dataset.key = key; return el; };
/** A number in a small box, with a sign before or after: numBox(S, key, 3, { suffix: 'x', step: 0.5, min: 0 }) */
export function numBox(S, key, fallback, { prefix, suffix, step = 1, min = 0, max, width, onInput, label } = {}) {
  const raw = S.get(key, fallback);
  /* money with a step under a dollar reads as cents: 0.5 shows as 0.50 */
  const v = raw != null && prefix === '$' && step < 1 && isFinite(raw) ? Number(raw).toFixed(2) : raw;
  const input = h('input', { class: 'lx-st-num', type: 'number', inputmode: 'decimal', step, min, max, value: v == null ? '' : v, 'aria-label': label || key, style: width ? { width: width + 'px' } : null });
  input.addEventListener('input', () => { const n = input.value === '' ? null : +input.value; if (n == null || isFinite(n)) { S.set(key, n); onInput && onInput(n); } });
  return ctl(S, key, h('span', { class: 'lx-st-box' }, prefix && h('i', null, prefix), input, suffix && h('i', null, suffix)));
}
export function textBox(S, key, fallback, { placeholder, width, label } = {}) {
  const input = h('input', { class: 'lx-input lx-st-text', type: 'text', value: S.get(key, fallback) ?? '', placeholder, 'aria-label': label || key, style: width ? { width: width + 'px' } : null });
  input.addEventListener('input', () => S.set(key, input.value));
  return ctl(S, key, input);
}
export function area(S, key, fallback, { placeholder, rows = 4, label } = {}) {
  const input = h('textarea', { class: 'lx-input lx-st-area', rows, placeholder, 'aria-label': label || key }, S.get(key, fallback) ?? '');
  input.addEventListener('input', () => S.set(key, input.value));
  return ctl(S, key, input);
}
/** pick(S, key, fallback, [{ id, label }] | ['a', 'b']) : a drop down */
export function pick(S, key, fallback, options, { label, width } = {}) {
  const cur = S.get(key, fallback);
  const list = options.map(o => (typeof o === 'object' ? o : { id: o, label: String(o) }));
  if (cur != null && cur !== '' && !list.some(o => String(o.id) === String(cur))) list.unshift({ id: cur, label: String(cur) });
  const el = h('select', { class: 'lx-input lx-st-sel', 'aria-label': label || key, style: width ? { width: width + 'px' } : null },
    list.map(o => { const op = h('option', { value: o.id }, o.label); if (String(o.id) === String(cur)) op.selected = true; return op; }));
  el.addEventListener('change', () => { const o = list.find(x => String(x.id) === el.value); S.set(key, o ? o.id : el.value); });
  return ctl(S, key, el);
}
/** "6:00pm" from "18:00"; "12:00am" from "00:00" */
export function clock(v) {
  if (v == null || v === '') return 'not set';
  if (v === 'never') return 'Never';
  const [hh, mm = '00'] = String(v).split(':'); const n = +hh;
  return (n % 12 || 12) + ':' + String(mm).padStart(2, '0') + (n < 12 ? 'am' : 'pm');
}
/** A time of day, any half hour, midnight included. Values are "HH:MM". { never: true } adds Never; { hours: true } stores a whole hour as a number. */
export function timePick(S, key, fallback, { never = false, hours = false, label } = {}) {
  const opts = [];
  for (let i = 0; i < 24; i++) for (const m of hours ? ['00'] : ['00', '30']) opts.push({ id: hours ? i : String(i).padStart(2, '0') + ':' + m, label: clock(i + ':' + m) });
  if (never) opts.unshift({ id: 'never', label: 'Never' });
  return pick(S, key, fallback, opts, { label, width: 122 });
}
const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
export const DAY_OPTS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']].map(([id, label]) => ({ id, label }));
/** Seven small day buttons, any mix: dayChips(S, key, ['mon', 'thu']) */
export function dayChips(S, key, fallback) {
  let cur = new Set(S.get(key, fallback) || []);
  const el = h('div', { class: 'lx-st-days', role: 'group', 'aria-label': 'Days' });
  DAYS.forEach(([id, lab]) => el.append(h('button', { type: 'button', class: cur.has(id) ? 'on' : '', 'aria-pressed': cur.has(id), onclick: e => {
    cur.has(id) ? cur.delete(id) : cur.add(id);
    e.currentTarget.classList.toggle('on', cur.has(id)); e.currentTarget.setAttribute('aria-pressed', cur.has(id));
    S.set(key, DAYS.map(d => d[0]).filter(d => cur.has(d)));
  } }, lab)));
  return ctl(S, key, el);
}
export function onOff(S, key, fallback, label) {
  return ctl(S, key, toggle({ checked: !!S.get(key, fallback), ariaLabel: label || key, onchange: v => S.set(key, v) }));
}
export function seg(S, key, fallback, items) {
  return ctl(S, key, segmented(items, S.get(key, fallback), id => S.set(key, id)));
}

/* ---------- connection rows (Brand and Agency integrations) ---------- */
const STATE = { ok: ['good', 'Connected'], warn: ['warn', 'Needs a look'], bad: ['bad', 'Broken'], off: ['off', 'Not connected'], part: ['warn', 'On some brands'], none: ['off', 'On no brand'] };
export const stateOf = s => STATE[s] || STATE.off;
export const stateDot = s => statusDot(stateOf(s)[0], stateOf(s)[1]);
const PATHS = {
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v9H5z',
  plug: 'M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3',
  send: 'M12 19V5M5 12l7-7 7 7',
  plus: 'M12 5v14M5 12h14',
};
export const ic = (name, cls) => svgNode(`<svg class="lx-ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true"><path d="${PATHS[name] || ''}"/></svg>`);
export { pill };

const CSS = `
.lx-st{display:grid;gap:var(--sp-8);min-width:0}
.lx-st-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-height:34px}
.lx-st-bar .n{font-size:13px;color:var(--muted);min-width:0}
.lx-st-err{flex-basis:100%;margin:0;padding:10px 14px;border-radius:10px;background:var(--bad-bg,#FDECEC);color:var(--bad,#B42318);font-size:13px;font-weight:500;line-height:1.45;overflow-wrap:anywhere}
.lx-st-err[hidden]{display:none}
.lx-st-cf{display:grid;gap:22px;min-width:0}
.lx-st-cf-lead{margin:0;font-size:13.5px;color:var(--ink-2)}
.lx-st-cf .g h3{font-size:14px;font-weight:600;letter-spacing:-.01em}
.lx-st-cf .g .hint{margin:2px 0 10px;font-size:12.5px;line-height:1.45;color:var(--muted)}
.lx-st-cf dl{margin:0;display:grid;border-top:1px solid var(--line)}
.lx-st-cf dl>div{display:grid;gap:3px;padding:11px 0;border-bottom:1px solid var(--line);min-width:0}
.lx-st-cf dt{font-size:12.5px;color:var(--muted)}
.lx-st-cf dd{margin:0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:14.5px;font-variant-numeric:tabular-nums;min-width:0;overflow-wrap:anywhere}
.lx-st-cf dd .was{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--line-strong)}
.lx-st-cf dd i{font-style:normal;font-size:12px;color:var(--faint)}
.lx-st-cf dd b{font-weight:600;color:var(--ink)}
.lx-st-cf .g.held dd b{font-weight:500;color:var(--ink-2)}
.lx-st-cf .acts{display:flex;gap:10px;flex-wrap:wrap}
.lx-st-cf .acts .lx-btn{flex:1 1 150px;justify-content:center}
.lx-st-chip{font-weight:500;white-space:normal;height:auto;min-height:24px;padding:3px 10px;line-height:1.3}
.lx-st-local{font-size:12px;color:var(--faint)}
.lx-st .lx-sec{flex-wrap:wrap;row-gap:4px}
.lx-st-rows{display:grid;min-width:0}
.lx-st-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 28px;align-items:center;padding:15px 28px;border-top:1px solid var(--line);min-width:0}
.lx-st-row.top{align-items:start}
.lx-st-row.wide{grid-template-columns:minmax(0,1fr)}
.lx-st-row.wide .c{justify-content:flex-start}
.lx-st-row .k{font-size:14px;font-weight:600;letter-spacing:-.01em}
.lx-st-row .hint{margin-top:2px;font-size:12.5px;line-height:1.45;color:var(--muted);max-width:64ch}
.lx-st-row .c{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;min-width:0;font-size:13.5px;color:var(--ink-2)}
.lx-st-row .c.v{font-weight:600;color:var(--ink);text-align:right}
.lx-st-row.fact .k{font-weight:500;color:var(--ink-2)}
.lx-st-box{display:inline-flex;align-items:center;gap:2px;height:36px;padding:0 10px;border-radius:10px;background:var(--surface);box-shadow:0 0 0 1px rgba(28,20,10,.13),0 1px 2px rgba(28,20,10,.04);font-variant-numeric:tabular-nums}
.lx-st-box:focus-within{box-shadow:0 0 0 1.5px var(--e2),0 0 0 5px rgba(255,122,26,.16)}
.lx-st-box i{font-style:normal;font-size:13.5px;color:var(--muted)}
.lx-st-num{width:56px;border:0;outline:0;background:transparent;font:600 15px var(--sans);color:var(--ink);text-align:right;letter-spacing:-.02em;padding:0;-moz-appearance:textfield;appearance:textfield}
.lx-st-num::-webkit-outer-spin-button,.lx-st-num::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.lx-st-text{height:36px;border-radius:10px;font-size:14px;width:240px;max-width:100%}
.lx-st-sel{height:36px;border-radius:10px;font-size:14px;width:auto;min-width:120px;max-width:100%}
.lx-st-area{font-size:14px;border-radius:12px;width:100%}
.lx-st-times{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
.lx-st-days{display:inline-flex;gap:4px;flex-wrap:wrap}
.lx-st-days button{height:32px;min-width:44px;padding:0 9px;border:0;border-radius:9px;background:var(--bg-sunk);font-size:12.5px;font-weight:500;color:var(--muted);cursor:pointer}
.lx-st-days button.on{background:var(--ink);color:var(--bg)}
.lx-st-bar .lx-btn.primary.lx-st-idle:disabled{background:var(--bg-sunk);color:var(--muted);box-shadow:none;border-color:transparent;opacity:1;cursor:default}
.lx-st-helpdl{display:grid;gap:12px;margin:0}
.lx-st-helpdl dt{font-size:12px;color:var(--muted)}
.lx-st-helpdl dd{margin:2px 0 0;font-size:13.5px;line-height:1.45}
.lx-st-helpdl dd b{font-weight:600;display:block}
.lx-st-helpdl dd span{display:block;font-size:12.5px;color:var(--muted)}
.lx-st-say{padding:14px 28px;border-top:1px solid var(--line);font-size:15px;line-height:2.5;color:var(--ink-2);margin:0}
.lx-st-say:first-child,.lx-st-row:first-child{border-top:0}
.lx-st-say b{color:var(--ink);font-weight:600}
.lx-st-say .lx-st-box{height:32px;margin:0 3px;vertical-align:middle}
.lx-st-say .lx-st-num{width:40px}
.lx-st-say .lx-st-days,.lx-st-say .lx-st-sel,.lx-st-say .lx-toggle{vertical-align:middle;margin:0 3px}
.lx-st-fold>summary{display:flex;align-items:center;gap:12px;padding:18px 28px;cursor:pointer;list-style:none;flex-wrap:wrap}
.lx-st-fold>summary::-webkit-details-marker{display:none}
.lx-st-fold>summary h3{font-size:var(--fs-card,14px);font-weight:600;letter-spacing:-.01em}
.lx-st-fold>summary:hover{background:var(--row-hover)}
.lx-st-fold>summary .note{font-size:var(--fs-small,12.5px);color:var(--muted)}
.lx-st-fold>summary .more{font-size:13px;font-weight:500;color:var(--ink-2)}
.lx-st-fold[open]>summary .more{font-size:0}
.lx-st-fold[open]>summary .more::after{content:"Hide";font-size:13px}
.lx-st-fold[open]>.lx-st-rows{border-top:1px solid var(--line)}
.lx-st-facts{display:grid;gap:14px}
.lx-st-facts dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px 32px;margin:0}
.lx-st-facts dt{font-size:12px;color:var(--muted)}
.lx-st-facts dd{margin:2px 0 0;font-size:13.5px;line-height:1.45}
.lx-st-facts dd b{font-weight:600}
.lx-st-code{font:500 12.5px ui-monospace,Consolas,monospace;color:var(--ink-2);overflow-wrap:anywhere}
.lx-st-facts dd span{display:block;font-size:12.5px;color:var(--muted)}
.lx-st-con{display:grid;grid-template-columns:minmax(0,1fr) 140px minmax(0,1.5fr) minmax(0,.9fr);gap:6px 24px;align-items:center;padding:15px 28px;border-top:1px solid var(--line);min-width:0}
.lx-st-con:first-child{border-top:0}
.lx-st-con .nm{font-weight:600;font-size:14px;display:flex;align-items:center;gap:9px;min-width:0}
.lx-st-con .nm small{display:block;font-size:12.5px;font-weight:400;color:var(--muted)}
.lx-st-con .note{font-size:12.5px;line-height:1.45;color:var(--muted);min-width:0;overflow-wrap:anywhere}
.lx-st-con .use{font-size:12.5px;color:var(--ink-2);text-align:left;font-variant-numeric:tabular-nums;min-width:0;overflow-wrap:anywhere}
.lx-st-con.head{padding-top:10px;padding-bottom:10px;font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.lx-st-con.head+.lx-st-con{border-top:1px solid var(--line)}
.lx-st-con details{grid-column:1/-1;font-size:12.5px;color:var(--ink-2)}
.lx-st-con details summary{cursor:pointer;color:var(--ink);font-weight:500;width:max-content}
.lx-st-con details p{margin-top:6px;max-width:80ch;line-height:1.5;overflow-wrap:anywhere}
.lx-st-who{display:flex;align-items:center;gap:10px;min-width:0}
.lx-st-who b{display:block;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lx-st-who small{display:block;font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lx-st-who>span:last-child{min-width:0}
.lx-st .lx-table .lx-st-sel{height:32px;font-size:13px;min-width:0}
.lx-st-sum{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.lx-st-sum .lx-big small{font-size:15px;font-weight:400;letter-spacing:-.005em;color:var(--muted);margin-left:10px}
@media (max-width:1040px){
  .lx-st-con{grid-template-columns:minmax(0,1fr) auto}
  .lx-st-con .note{grid-column:1/-1}
  .lx-st-con .use{grid-column:1/-1;text-align:left;white-space:normal}
  .lx-st-con.head{display:none}
}
@media (max-width:759px){
  .lx-st{gap:var(--sp-6)}
  .lx-st-row{grid-template-columns:minmax(0,1fr);padding:14px 18px}
  .lx-st-row .c{justify-content:flex-start}
  .lx-st-row .c.v{text-align:left}
  .lx-st-row.inline{grid-template-columns:minmax(0,1fr) auto}
  .lx-st-say{padding:12px 18px;font-size:14.5px}
  .lx-st-con,.lx-st-fold>summary{padding-left:18px;padding-right:18px}
  .lx-st-card>.lx-sec{padding-left:18px!important;padding-right:18px!important}
  .lx-st-text{width:100%}
  .lx-st-bar .lx-btn{height:44px}
  .lx-st .lx-card.flush .lx-table th:first-child,.lx-st .lx-card.flush .lx-table td:first-child{padding-left:18px}
  .lx-st .lx-card.flush .lx-table th:last-child,.lx-st .lx-card.flush .lx-table td:last-child{padding-right:18px}
}
`;
