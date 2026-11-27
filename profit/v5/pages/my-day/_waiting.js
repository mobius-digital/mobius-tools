/* Shared parts for what waits on the team, and the one line on what already works in new Locus.
   Used by My day, Agency > Today and the brand Home. Nothing here writes to a worker: the only thing saved is
   "Got it" on the note, on this device (localStorage), which is safe in sample mode too.

   agencyRows(w)      the loadWaiting() answer from bell.js as My day rows
   waitingCard(ctx)   a card that reads loadWaiting() after the page draws and lists each item with one button (team only)
   liveNote(ctx)      "What is live in new Locus": what the team can do here now, and what is still in old Locus (team only,
                      dismissible per device) */

import { h, button, card, statusDot, addStyles } from '../../kit.js';
import { APP_NAME, OLD_LOCUS } from '../../config.js';
import { loadWaiting } from '../../bell.js';

/* the bell's kind as the chip a row carries, the same words as the sub line the bell writes */
const KIND = { calls: 'Ad calls', google: 'Google suggestions', send: 'To send', war: 'War Room', review: 'Production', load: 'Load ads', requests: 'Requests', alert: 'Alert', release: 'Client message', proposal: 'Suggested change' };
/** loadWaiting() items as My day rows: { id, text, why, kind, brand, due, btn }. A why that only repeats the kind is dropped. */
export function agencyRows(w) {
  return ((w && w.items) || []).map(it => {
    const kind = KIND[it.kind] || null, why = it.by || '';
    return { id: 'agency:' + it.id, source: 'agency', text: it.text, kind, why: kind && why.toLowerCase() === kind.toLowerCase() ? '' : why, brand: it.brand || '', due: 'Today',
    btn: { label: it.btn && it.btn.label || 'Open', href: it.btn && it.btn.href || '#' } };
  });
}

const isTeam = ctx => !!ctx && !ctx.isClient && ctx.role !== 'client';

/** The words a brand filter or a row shows: the bell's "Agency" and "2 brands" are not brands. */
export function brandWord(b) {
  if (!b) return '';
  if (/^agency$/i.test(b)) return 'Agency-wide';
  if (/^\d+ brands$/i.test(b)) return 'Several brands';
  return b;
}

const CSS = `
.lx-wt-list{display:grid}
.lx-wt-row{display:flex;align-items:center;gap:14px;min-height:60px;padding:10px 0;border-top:1px solid var(--line)}
.lx-wt-row:first-child{border-top:0}
.lx-wt-row .t{flex:1;min-width:0}
.lx-wt-row .t b{display:block;font-size:14.5px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}
.lx-wt-row .t span{display:block;margin-top:2px;font-size:12.5px;color:var(--muted)}
.lx-wt-row .lx-btn{flex:none;white-space:nowrap}
.lx-wt-none{margin:0;color:var(--muted);font-size:13.5px}
.lx-live{display:grid;gap:10px;padding:16px 20px;border:1px solid var(--line);border-radius:18px;background:var(--bg-sunk)}
.lx-live h3{margin:0;font-size:15px;font-weight:600;letter-spacing:-.01em}
.lx-live p{margin:0;font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.lx-live p b{color:var(--ink);font-weight:600}
.lx-live .acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.lx-live .acts a.small{font-size:13px;color:var(--muted)}
@media (max-width:759px){
  .lx-wt-row{flex-wrap:wrap;gap:8px 12px;padding:12px 0}
  .lx-wt-row .lx-btn{width:100%;height:44px;justify-content:center}
  .lx-live{padding:14px 16px}
  .lx-live .acts .lx-btn{flex:1;height:44px}
}`;
const styles = () => addStyles('lx-waiting-css', CSS);

/** A card that lists what waits on the team across every brand. Team only; null for a client. */
export function waitingCard(ctx, { title = 'Waiting on the team', max = 8 } = {}) {
  if (!isTeam(ctx)) return null;
  styles();
  const body = h('div', { class: 'lx-wt-list' }, h('p', { class: 'lx-wt-none' }, 'Reading every brand.'));
  const box = card({ title, note: 'every brand, today' }, body);
  loadWaiting({ brands: ctx.brands, role: ctx.role }).then(w => {
    const items = (w && w.items) || [];
    const failed = (w && w.failed) || [];
    const shown = items.slice(0, max);
    body.replaceChildren(...[
      ...(shown.length ? shown.map(it => h('div', { class: 'lx-wt-row' },
        h('div', { class: 't' }, h('b', null, it.text), h('span', null, [it.brand, it.by].filter(Boolean).join(', '))),
        button(it.btn && it.btn.label || 'Open', { href: it.btn && it.btn.href || '#', icon: 'arrow' })))
        : [h('p', { class: 'lx-wt-none' }, failed.length ? 'Nothing found in what could be read.' : 'Nothing is waiting on the team right now.')]),
      items.length > max ? h('p', { class: 'lx-wt-none' }, (items.length - max) + ' more in the bell and on My day.') : null,
      failed.length ? h('p', { class: 'lx-wt-none' }, statusDot('warn', 'Could not read: ' + failed.join(', '))) : null,
    ].filter(Boolean));   /* a null here was printed as the text "null" */
  });
  return box;
}

/* ---------- What is live in new Locus ---------- */
const NOTE_KEY = 'lx5_live_note_v1';
const seen = () => { try { return localStorage.getItem(NOTE_KEY) === '1'; } catch { return false; } };

/** The same words as a page help section: { title, text }. */
export function liveHelp() {
  return { title: 'What is live in new ' + APP_NAME, text: 'Do it here: make ad calls (Yes, No, Undo), send client updates, approve the War Room check-in, move and approve creative, and load approved ads.\n\nStill in old ' + APP_NAME + ': calendar edits, offers, meetings, creator approvals, and the settings that are not wired yet.' };
}

/** One short card for the team: what works here now, and what still lives in old Locus. Shown once per device in
    real mode (it is marked seen as soon as it shows), never in sample mode; after that it lives in the page help. */
export function liveNote(ctx) {
  if (!isTeam(ctx) || ctx.sample || seen()) return null;
  try { localStorage.setItem(NOTE_KEY, '1'); } catch { /* storage off: it may show again */ }
  styles();
  const box = h('section', { class: 'lx-live', role: 'note' },
    h('h3', null, 'What is live in new ' + APP_NAME),
    h('p', null, h('b', null, 'Do it here: '), 'make ad calls (Yes, No, Undo), send client updates, approve the War Room check-in, move and approve creative, and load approved ads.'),
    h('p', null, h('b', null, 'Still in old ' + APP_NAME + ': '), 'calendar edits, offers, meetings, creator approvals, and the settings that are not wired yet.'),
    h('div', { class: 'acts' },
      button('Got it', { onclick: () => { try { localStorage.setItem(NOTE_KEY, '1'); } catch { /* storage off: hide for now */ } box.remove(); } }),
      h('a', { class: 'small', href: OLD_LOCUS }, 'Open old ' + APP_NAME)));
  return box;
}
