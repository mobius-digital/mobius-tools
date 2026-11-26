/* The writes the Production pages and Load ads make, in one place.
   Every write goes through write(): real mode posts to the account-health worker with the same body old Locus sends
   and throws the server's own words when it refuses (a refusal can come back as HTTP 200 with { error }).
   Sample mode never calls a route: it answers with what the caller simulates and says "Sample: nothing was changed".
   canWrite(ctx) is the one role check: clients, "See as client" and read only viewers never get a write button.
   confirm() is the second tap for anything that tells a client or touches money: before and after, then the button. */

import { h, sheet, button, toast, addStyles } from '../../kit.js';
import { api, putSaved, SAMPLE } from '../../data.js';
import { forgetWaiting } from '../../bell.js';

export { SAMPLE };

/** True when this person may change things here. A viewer's writes are refused by the worker too; this only hides the buttons. */
export function canWrite(ctx) {
  if (!ctx || ctx.isClient || ctx.asClient) return false;
  const me = ctx.me || {};
  const role = String(ctx.role || me.role || '').toLowerCase();
  if (role === 'client' || role === 'viewer') return false;
  if (String(me.access || '').toLowerCase() === 'viewer' || me.viewer === true || me.read_only === true) return false;
  return true;
}

export const SAMPLE_SAID = 'Sample: nothing was changed';

/** write('/api/production/move', { id, to }, () => ({ ok: true })) : the answer, or throws with the server's words.
    In sample mode the third argument makes the answer and no route is called. */
export async function write(path, body, simulate) {
  if (SAMPLE) {
    toast(SAMPLE_SAID);
    return typeof simulate === 'function' ? simulate(body) : { ok: true, sample: true };
  }
  const r = await api(path, { worker: 'ah', method: 'POST', body });
  if (r && r.error) throw new Error(String(r.error));
  /* a preview or a dry run changes nothing, so the waiting counts stay */
  if (!/preview|prep|dry/.test(path) && !(body && body.dry)) forgetWaiting();
  return r || {};
}

/** The server's words for a refusal, plain. */
export const why = e => String((e && e.message) || 'That did not save. Try again.').replace(/^HTTP 403$/, 'You can look here but not change things.');

/** A button that runs one write: busy while it runs, the server's words if it is refused. */
export function act(label, run, o = {}) {
  const b = button(label, { large: true, ...o, onclick: async () => {
    if (b.disabled) return;
    b.disabled = true;
    try { await run(b); }
    catch (e) { toast(why(e), { tone: 'bad', ms: 6000 }); }
    finally { if (b.isConnected) b.disabled = false; }
  } });
  b.classList.add('pa-btn');
  return b;
}

/** confirm({ title, lines: [{ label, before, after }], text, ok, danger }) : resolves true on the second tap, false otherwise. */
export function confirm({ title, lines = [], text, ok = 'Yes, do it', cancel = 'Cancel' } = {}) {
  css();
  return new Promise(resolve => {
    let done = false;
    const end = v => { if (done) return; done = true; sh.close(); resolve(v); };
    const body = h('div', { class: 'pa-confirm' },
      text ? h('p', null, text) : null,
      lines.length ? h('div', { class: 'pa-ba' }, lines.map(l => h('div', { class: 'pa-ba-r' },
        h('span', { class: 'lx-cap' }, l.label),
        h('div', null, h('span', { class: 'b' }, l.before == null || l.before === '' ? 'Nothing' : l.before), h('span', { class: 'arrow', 'aria-hidden': 'true' }, ' to '), h('b', null, l.after == null || l.after === '' ? 'Nothing' : l.after))))) : null,
      h('div', { class: 'pa-row' },
        button(cancel, { large: true, class: 'pa-btn', onclick: () => end(false) }),
        button(ok, { large: true, primary: true, class: 'pa-btn', onclick: () => end(true) })));
    const sh = sheet({ title, body, side: 'center', onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

/** Keep the saved copy of a card in step after a write, so the next open shows the change. */
export function keepCard(id, data) { if (!SAMPLE && id && data) putSaved('card|' + id, data).catch(() => {}); }

const CSS = `
.pa-btn{min-height:44px}
.pa-confirm{display:grid;gap:16px;min-width:0}
.pa-confirm>p{font-size:14px;line-height:1.5;color:var(--ink-2)}
.pa-ba{display:grid;gap:0;border:1px solid var(--line);border-radius:14px;overflow:hidden}
.pa-ba-r{display:grid;gap:4px;padding:11px 14px;border-top:1px solid var(--line);min-width:0}
.pa-ba-r:first-child{border-top:0}
.pa-ba-r>div{font-size:14px;overflow-wrap:anywhere}
.pa-ba-r .b{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--line-strong)}
.pa-ba-r .arrow{color:var(--faint)}
.pa-ba-r b{font-weight:600}
.pa-row{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}
@media (max-width:759px){
  .pa-row .lx-btn{flex:1 1 140px}
  .lx-btn.pa-btn,.pa-row .lx-btn{height:auto;min-height:44px}
}
`;
export const css = () => addStyles('pa-css', CSS);
