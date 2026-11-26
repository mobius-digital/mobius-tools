/* Automations: what the four tabs and the profile page share. The sentence with its changeable words, the on/off
   switch, and the one-sentence editor that rises from the bottom with "Try it".
   Every word list comes from the worker (GET /api/automations `options`), so this file never types its own.
   Worker: account-health /api/automations, /api/automations/test, /api/me/delivery, /api/notices. */

import { h, put, addStyles, button, toggle, sheet, toast, pill, statusDot, relativeTime } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { alertHref } from '../../bell.js';

const CSS = `
.au{display:grid;gap:var(--sp-6)}
.au-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.au-top p{margin:0;color:var(--muted);font-size:13.5px;flex:1;min-width:220px}
.au-off{padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--surface-2);display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:13.5px}
.au-off b{font-weight:600}
.au-off span{flex:1;min-width:200px;color:var(--muted)}
.au-list{display:grid;gap:10px}
.au-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 16px;align-items:start;padding:16px 18px;border:1px solid var(--line);border-radius:16px;background:var(--surface);text-align:left;width:100%;cursor:pointer;font:inherit;color:inherit}
.au-row:hover{border-color:var(--line-strong)}
.au-row.dim{opacity:.62}
.au-s{font-size:15.5px;line-height:1.55;letter-spacing:-.005em;margin:0}
.au-s.lg{font-size:19px;line-height:1.6}
.au-slot{border:0;background:none;font:inherit;color:inherit;padding:0 1px;border-bottom:1.5px solid var(--brand);font-weight:600;cursor:pointer;border-radius:0}
.au-slot.ro{cursor:default;border-bottom-style:dotted;border-bottom-color:var(--muted)}
.au-slot.on{background:color-mix(in srgb,var(--brand) 14%,transparent)}
.au-meta{grid-column:1/-1;display:flex;gap:8px 14px;flex-wrap:wrap;align-items:center;color:var(--muted);font-size:12.5px}
.au-g{display:grid;gap:12px}
.au-g h3{margin:0;font-size:13px;font-weight:600;color:var(--muted);letter-spacing:.02em}
.au-pick{display:grid;gap:8px;padding:14px;border:1px solid var(--line);border-radius:14px}
.au-pick label{font-size:12.5px;color:var(--muted)}
.au-pick select,.au-pick input{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:transparent;color:inherit;width:100%;min-height:44px}
.au-ed{display:grid;gap:16px}
.au-ed .acts{display:flex;gap:8px;flex-wrap:wrap}
.au-ed .foot{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between;padding-top:12px;border-top:1px solid var(--line)}
.au-note{margin:0;font-size:12.5px;color:var(--muted);line-height:1.5}
.au-try{display:grid;gap:10px;padding:14px;border-radius:14px;background:color-mix(in srgb,currentColor 5%,transparent)}
.au-try b{font-size:13.5px}
.au-try ul{margin:0;padding-left:18px;display:grid;gap:4px;font-size:13px}
.au-log{display:grid;gap:0}
.au-run{display:grid;grid-template-columns:130px minmax(0,1fr) auto;gap:4px 14px;padding:14px 0;border-top:1px solid var(--line);font-size:13.5px;align-items:start}
.au-run:first-child{border-top:0}
.au-run time{color:var(--muted);font-size:12.5px}
.au-run p{margin:2px 0 0;color:var(--muted);font-size:12.5px;line-height:1.5}
@media (max-width:759px){.au-row{grid-template-columns:minmax(0,1fr);padding:14px}.au-row .sw{justify-self:start}.au-s.lg{font-size:17px}.au-run{grid-template-columns:minmax(0,1fr)}}`;
export const style = () => addStyles('au-css', CSS);

export const ah = (ctx, path, opts = {}) => ctx.api(path, { worker: 'ah', signal: opts.method ? undefined : ctx.signal, ...opts });
const copy = v => JSON.parse(JSON.stringify(v));

/** The sentence as nodes. onSlot(part, button) makes the changeable words tappable; without it they are only marked. */
export function sentenceNode(s, { large = false, onSlot, active } = {}) {
  const parts = (s && s.parts) || [{ t: 'text', text: (s && s.text) || '' }];
  return h('p', { class: 'au-s' + (large ? ' lg' : '') }, parts.map(p => {
    if (p.t !== 'slot') return p.text;
    if (!onSlot || !p.key) return h('span', { class: 'au-slot ro' }, p.text);
    const b = h('button', { type: 'button', class: 'au-slot' + (active === p.key ? ' on' : ''), 'aria-label': 'Change ' + p.text, onclick: e => { e.stopPropagation(); onSlot(p, b); } }, p.text);
    return b;
  }));
}

const RESULT = { done: ['good', 'Done'], skipped: ['off', 'Skipped'], held: ['warn', 'Held'], waiting_for_tap: ['warn', 'Waits for an answer'], failed: ['bad', 'Failed'], over_limit: ['warn', 'Over the AI limit'],
  retry: ['warn', 'Will try again'], folded: ['off', 'Told as one row'] };
export const resultDot = r => { const [tone, word] = RESULT[r] || ['off', r || 'Not run yet']; return statusDot(tone, word); };

/** The buttons for one row from GET /api/notices (the bell and the home list call this).
    A suggested change: the app changes nothing, so the answers are "I did it" (made by hand in Ads) or "No".
    A held client message: "Send to the client" or "Do not send". Anything else: tick it done. */
export function noticeActions(row, ctx, reload) {
  const post = async (body, said) => {
    if (ctx.sample) return toast('Sample mode: nothing is saved.');
    try { await ah(ctx, '/api/notices/done', { method: 'POST', body: { id: row.id, ...body } }); toast(said); reload && reload(); } catch (e) { toast(e.message, { tone: 'bad', ms: 5000 }); }
  };
  if (row.state !== 'open') return [];
  /* an alert clears itself when it is fixed: the one answer is "hide for today" (any POST /api/notices/done on it).
     It comes back tomorrow if it is still true. Open goes to the page that fixes it. */
  if (row.kind === 'alert') return [
    button((row.button && row.button.label) || 'Open', { primary: true, href: alertHref({ brand_id: row.brand_id, ...(row.button || {}) }, ctx.brands || []) }),
    button('Hide for today', { onclick: () => post({ done: true }, 'Hidden for today. It comes back tomorrow if it is still true.') })];
  if (row.kind === 'proposal') return [button('I did it', { primary: true, onclick: () => post({ answer: 'did_it' }, 'Noted. ' + APP_NAME + ' changed nothing.') }), button('No', { onclick: () => post({ answer: 'no' }, 'Noted.') })];
  if (row.kind === 'release') return [button('Send to the client', { primary: true, onclick: () => post({ answer: 'send' }, 'Sent to the client.') }), button('Do not send', { onclick: () => post({ answer: 'no' }, 'Dropped. The client was not told.') })];
  return [button('Done', { onclick: () => post({ done: true }, 'Done.') })];
}

/** The banner while the workspace switch is off. Only the owner sees the button (POST /api/automations/power).
    data.power must be exactly false: a page that could not read the switch shows no banner. */
export function powerBar(data, ctx, reload) {
  if (!data || data.power !== false) return null;
  return h('div', { class: 'au-off' }, h('b', null, 'Automations are off for this workspace.'),
    h('span', null, data.can_power ? 'You can set them up and try them. Nothing runs until you switch them on.' : 'You can set them up and try them. Nothing runs until the owner switches them on.'),
    data.can_power ? button('Switch automations on', { primary: true, onclick: async () => {
      if (ctx.sample) return toast('Sample mode: nothing is saved.');
      try { await ah(ctx, '/api/automations/power', { method: 'POST', body: { on: true } }); toast('Automations are on.'); reload && reload(); } catch (e) { toast(e.message, { tone: 'bad', ms: 5000 }); }
    } }) : null);
}

/* ---------- changing one word ---------- */
const optKey = key => key.replace(/\.\d+(\.|$)/, '$1').replace(/\.$/, '');
/** Put a picked value into the draft at a slot's key. */
export function setAt(draft, key, value) {
  const m = key.split('.');
  if (key === 'brand') draft.brand = value;
  else if (key === 'when.every') { const [e, day] = String(value).split(':'); draft.when.every = e; if (day) draft.when.day = day; else delete draft.when.day; }
  else if (key === 'when.line') draft.when.line = value === 'goal' || value === '' ? 'goal' : Number(value);
  else if (m[0] === 'when') draft.when[m[1]] = ['hour', 'days', 'hours'].includes(m[1]) ? Number(value) : value;
  else if (m[0] === 'if') { const c = (draft.if || []).find(x => x.type === m[1]); if (c) c.value = value; }
  else if (m[0] === 'do') draft.do[+m[1]][m[2]] = m[2] === 'due_days' ? Number(value) : value;
  else if (m[0] === 'tell') {
    const v = String(value);
    draft.tell.who[+m[2]] = v.startsWith('role:') ? { kind: 'role', role: v.slice(5) } : v.includes('@') ? { kind: 'person', email: v } : { kind: v };
  }
  return draft;
}
const valueAt = (draft, key) => {
  const m = key.split('.');
  if (key === 'brand') return draft.brand || 'all';
  if (key === 'when.every') return draft.when.every === 'week' ? 'week:' + (draft.when.day || 'mon') : draft.when.every;
  if (m[0] === 'when') return draft.when[m[1]];
  if (m[0] === 'if') return ((draft.if || []).find(x => x.type === m[1]) || {}).value;
  if (m[0] === 'do') return (draft.do[+m[1]] || {})[m[2]];
  if (m[0] === 'tell') { const p = draft.tell.who[+m[2]] || {}; return p.kind === 'role' ? 'role:' + p.role : p.kind === 'person' ? 'person' : p.kind; }
};
const NUMBER = { 'when.days': 'How many days', 'when.hours': 'How many hours', 'do.due_days': 'Due in how many days' };
const TEXT = { 'do.text': 'What the task says', 'if.title_has': 'The name has these words' };

/** The control for one changeable word. onPick(value) is called with the new value. */
function picker(part, draft, data, onPick) {
  const key = part.key, ok = optKey(key), cur = valueAt(draft, key);
  const sel = (label, items, value) => {
    const s = h('select', { 'aria-label': label, onchange: () => choose(s.value) }, items.map(o => h('option', { value: String(o.id), selected: String(o.id) === String(value) || null }, o.label)));
    return [h('label', null, label), s];
  };
  const email = h('input', { type: 'email', placeholder: 'name@company.com', 'aria-label': 'Their email', value: (draft.tell.who[+key.split('.')[2]] || {}).email || '', style: { display: cur === 'person' ? '' : 'none' },
    onchange: () => { if (email.value.includes('@')) onPick(email.value.trim().toLowerCase()); } });
  function choose(v) { if (ok === 'tell.who' && v === 'person') { email.style.display = ''; email.focus(); return; } onPick(v); }
  if (key === 'brand') return h('div', { class: 'au-pick' }, sel('Which brand', [{ id: 'all', label: 'Any brand' }, ...(data.brands || []).map(b => ({ id: b.id, label: b.name }))], cur));
  if (key === 'when.line') {
    const inp = h('input', { type: 'number', step: 'any', min: '0', 'aria-label': 'The line', value: cur === 'goal' ? '' : cur, placeholder: 'A number', onchange: () => onPick(inp.value) });
    return h('div', { class: 'au-pick' }, h('label', null, 'The line'), inp, button('Use the brand\'s goal', { onclick: () => onPick('goal') }));
  }
  if (NUMBER[ok]) { const inp = h('input', { type: 'number', min: '0', max: '240', value: cur, 'aria-label': NUMBER[ok], onchange: () => onPick(inp.value) }); return h('div', { class: 'au-pick' }, h('label', null, NUMBER[ok]), inp); }
  if (TEXT[ok]) { const inp = h('input', { type: 'text', maxlength: '160', value: cur || '', 'aria-label': TEXT[ok], onchange: () => onPick(inp.value) }); return h('div', { class: 'au-pick' }, h('label', null, TEXT[ok]), inp); }
  const items = (data.options || {})[ok];
  if (!items) return null;
  return h('div', { class: 'au-pick' }, sel('Change "' + part.text + '" to', items, cur), ok === 'tell.who' ? email : null);
}

/** A new automation opened inside a brand view is for that brand, and its sentence must say so before the first
    save. Returns { brand, sentence }: the brand slot reads the brand's name. A sentence with no brand word stays
    for any brand, so the words and the saved automation never disagree. */
export function forBrand(sentence, ctx) {
  const s = copy(sentence || { text: '', parts: [] });
  const slot = ctx.brand && (s.parts || []).find(p => p.t === 'slot' && p.key === 'brand');
  if (!slot) return { brand: 'all', sentence: s };
  slot.text = ctx.brand.name;
  s.text = s.parts.map(p => p.text).join('');
  return { brand: ctx.brand.id, sentence: s };
}

/** The one-sentence editor, in a sheet from the bottom. start = a saved automation or a template's automation.
    onSaved(automation) is called after a save or a delete. */
export function openEditor(start, data, ctx, onSaved) {
  style();
  const draft = copy({ id: start.id || null, name: start.id ? start.name : '', template: start.template || null, brand: start.brand || 'all', state: start.state || 'draft', when: start.when, if: start.if || [], do: start.do || [], tell: start.tell || { who: [] }, may_act_alone: !!start.may_act_alone });
  let words = copy(start.sentence || { text: '', parts: [] }), notes = start.notes || [], open = null, tried = null, busy = false;
  const body = h('div', { class: 'au-ed' });
  const sh = sheet({ title: start.id ? 'Change this automation' : 'New automation', body, side: 'bottom' });

  async function reword(localText) {
    if (ctx.sample) { const p = words.parts.find(x => x.key === open); if (p && localText != null) p.text = localText; return; }
    const r = await ah(ctx, '/api/automations/test', { method: 'POST', body: { automation: draft, words_only: true } });
    words = r.sentence; notes = r.notes || [];
  }
  async function change(part, value) {
    const before = copy(draft);
    setAt(draft, part.key, value);
    const items = (data.options || {})[optKey(part.key)] || (part.key === 'brand' ? [{ id: 'all', label: 'any brand' }, ...(data.brands || []).map(b => ({ id: b.id, label: b.name }))] : []);
    const label = (items.find(o => String(o.id) === String(value)) || {}).label;
    try { await reword(label != null ? label : String(value)); open = null; tried = null; }
    catch (e) { Object.assign(draft, before); toast(e.message, { tone: 'bad', ms: 5000 }); }
    draw();
  }
  async function addWho() {
    draft.tell.who.push({ kind: 'me' });
    if (ctx.sample) { draft.tell.who.pop(); return toast('Sample mode: open the real app to add a person.'); }
    try { await reword(); open = 'tell.who.' + (draft.tell.who.length - 1); } catch (e) { draft.tell.who.pop(); toast(e.message, { tone: 'bad' }); }
    draw();
  }
  async function tryIt() {
    if (busy) return;
    if (ctx.sample) { tried = { nothing: 'Sample mode: the real app shows what this would have done on the last day of your own data.', would: [] }; return draw(); }
    busy = true; draw();
    try { tried = await ah(ctx, '/api/automations/test', { method: 'POST', body: { automation: draft } }); } catch (e) { toast(e.message, { tone: 'bad', ms: 5000 }); }
    busy = false; draw();
  }
  async function save(state) {
    if (busy) return;
    if (ctx.sample) return toast('Sample mode: nothing is saved.');
    busy = true; draw();
    try {
      const r = await ah(ctx, '/api/automations', { method: 'PUT', body: { ...draft, state } });
      toast(state === 'on' ? (r.power ? 'Saved and switched on.' : 'Saved and switched on. It starts when the owner switches automations on.') : 'Saved. It is off.');
      sh.close(); onSaved && onSaved(r.automation);
    } catch (e) { busy = false; draw(); toast(e.message, { tone: 'bad', ms: 5000 }); }
  }
  async function remove() {
    if (ctx.sample) return toast('Sample mode: nothing is deleted.');
    try { await ah(ctx, '/api/automations?id=' + encodeURIComponent(draft.id), { method: 'DELETE' }); toast('Deleted.'); sh.close(); onSaved && onSaved(null); } catch (e) { toast(e.message, { tone: 'bad' }); }
  }
  function draw() {
    const part = open ? words.parts.find(p => p.key === open) : null;
    put(body,
      h('p', { class: 'au-note' }, 'Tap an underlined word to change it.'),
      sentenceNode(words, { large: true, active: open, onSlot: p => { open = open === p.key ? null : p.key; draw(); } }),
      part ? picker(part, draft, data, v => change(part, v)) : null,
      h('div', { class: 'acts' }, button('Add someone to tell', { onclick: addWho }), button(busy ? 'Trying it' : 'Try it', { onclick: tryIt })),
      tried ? h('div', { class: 'au-try' }, h('b', null, 'If this had been on for the last day'),
        tried.would && tried.would.length ? h('ul', null, tried.would.slice(0, 8).map(w => h('li', null, w.title, w.why ? [h('br'), h('span', { class: 'au-note' }, w.why)] : null))) : h('p', { class: 'au-note' }, tried.nothing || 'Nothing would have happened.'),
        (tried.skipped || []).length ? h('p', { class: 'au-note' }, 'Left out: ' + tried.skipped.slice(0, 3).join('. ')) : null,
        h('p', { class: 'au-note' }, tried.note || 'This is a test. Nothing was sent, saved or changed.')) : null,
      notes.map(n => h('p', { class: 'au-note' }, n)),
      h('div', { class: 'foot' },
        draft.id ? button('Delete', { onclick: remove }) : h('span'),
        h('div', { class: 'acts' }, button('Save, keep it off', { onclick: () => save('draft') }), button('Save and switch on', { primary: true, onclick: () => save('on') }))));
  }
  draw();
  return sh;
}

/** One automation as a row: its sentence, an on/off switch, and when it last ran. */
export function autoRow(a, data, ctx, reload) {
  const sw = toggle({ checked: a.state === 'on', ariaLabel: (a.state === 'on' ? 'Switch off: ' : 'Switch on: ') + a.sentence.text, onchange: async on => {
    if (ctx.sample) return toast('Sample mode: nothing is saved.');
    try { const r = await ah(ctx, '/api/automations', { method: 'PUT', body: { id: a.id, state: on ? 'on' : 'draft' } }); toast(on ? (r.power ? 'Switched on.' : 'Switched on. It starts when the owner switches automations on.') : 'Switched off.'); reload(); }
    catch (e) { toast(e.message, { tone: 'bad', ms: 5000 }); reload(); }
  } });
  sw.classList.add('sw');
  sw.addEventListener('click', e => e.stopPropagation());
  return h('div', { class: 'au-row' + (a.state === 'on' ? '' : ' dim'), role: 'button', tabindex: '0', onclick: () => openEditor(a, data, ctx, reload), onkeydown: e => { if (e.key === 'Enter') openEditor(a, data, ctx, reload); } },
    sentenceNode(a.sentence), sw,
    h('div', { class: 'au-meta' },
      a.state === 'paused' ? pill('bad', 'Paused itself after 5 failures') : null,
      a.costs_ai ? pill('', 'Uses AI') : null,
      (a.do || []).some(x => x.type === 'propose' || x.type === 'stop_spend') ? pill('', 'A person makes the change') : null,
      h('span', null, a.last_run_at ? 'Last ran ' + relativeTime(Date.parse(a.last_run_at)) : 'Has not run yet'),
      a.last_status ? h('span', null, a.last_status) : null));
}
