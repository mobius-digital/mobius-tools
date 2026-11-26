/* Automations, page side parts (this folder's pages only; _auto.js is shared and kept as it is).
   workspaceStrip  the one slim "automations are off" strip, on Running only (the same POST /api/automations/power
                   as powerBar in _auto.js, owner only, never in sample mode)
   offPill         the one-word "Workspace off" pill the other tabs show instead
   nameOf / who    a person as a name with an avatar; the email stays as the tooltip
   plainStatus     an automation's last status as plain words with a dot */

import { h, button, toast, statusDot, avatar, pill, relativeTime, addStyles } from '../../kit.js';
import { ah } from './_auto.js';

export function workspaceStrip(data, ctx, reload) {
  if (!data || data.power !== false) return null;
  return h('div', { class: 'au-strip', role: 'status' },
    statusDot('warn', 'Automations are off for this workspace.'),
    h('span', { class: 'm' }, data.can_power ? 'Set them up and try them. Nothing runs until you switch the workspace on.' : 'Set them up and try them. Nothing runs until the owner switches the workspace on.'),
    data.can_power ? button('Switch the workspace on', { onclick: async () => {
      if (ctx.sample) return toast('Sample mode: nothing is saved.');
      try { await ah(ctx, '/api/automations/power', { method: 'POST', body: { on: true } }); toast('Automations are on.'); reload && reload(); } catch (e) { toast(e.message, { tone: 'bad', ms: 5000 }); }
    } }) : null);
}

export function offPill(data, ctx) {
  if (!data || data.power !== false) return null;
  const p = h('a', { class: 'au-offpill', href: ctx.href('automations', 'running'), title: 'Automations are off for this workspace. Nothing runs until it is switched on on the Running tab.' }, pill('warn', 'Workspace off'));
  return p;
}

/** "sam@example.com" as "Sam Rivera" when the team list knows the name, else the part before the @. */
export function nameOf(email, team = []) {
  const p = (team || []).find(t => String(t.email).toLowerCase() === String(email || '').toLowerCase());
  if (p && p.name) return p.name;
  return String(email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
export function who(email, team, size = 26) {
  const name = nameOf(email, team);
  return h('span', { class: 'au-who', title: email }, avatar({ name, email }, { size }), h('span', null, name));
}

const WORD = { done: ['good', 'Done'], skipped: ['off', 'Nothing to do'], held: ['warn', 'Held'], failed: ['bad', 'Failed'], waiting_for_tap: ['warn', 'Waits for an answer'], over_limit: ['warn', 'Over the AI limit'], retry: ['warn', 'Will try again'] };
const EMAIL_LEAD = /^[^\s@:]+@[^\s:]+:\s*/;
/** The why of a run, in plain words: no email in front, no rule jargon. */
export function plainWhy(text) {
  let t = String(text || '').replace(EMAIL_LEAD, '').trim();
  if (/^Only if missing: it went as planned/i.test(t)) return 'Nothing was missing, so nobody was told';
  if (/^Quiet hours/i.test(t)) return t.replace(/morning read/i, 'morning summary');
  return t.replace(/\.+$/, '');
}
/** "skipped: Only if missing: it went as planned" as one dot: "Last ran 2 days ago · Nothing was missing, so nobody was told". */
export function plainStatus(a) {
  const ran = a.last_run_at ? 'Last ran ' + relativeTime(Date.parse(a.last_run_at)) : 'Has not run yet';
  if (!a.last_status) return statusDot('off', ran);
  const m = String(a.last_status).match(/^([a-z_]+):\s*(.*)$/);
  const [tone, word] = (m && WORD[m[1]]) || ['off', ''];
  const rest = m ? plainWhy(m[2]) : plainWhy(a.last_status);
  return statusDot(tone, ran + ' · ' + (rest || word));
}

addStyles('au-page-css', `
.au-strip{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;padding:10px 16px;border-radius:var(--r-md);background:var(--warn-bg);font-size:13.5px;color:var(--ink)}
.au-strip .m{flex:1;min-width:200px;color:var(--ink-2)}
.au-strip .lx-btn{height:32px}
.au-offpill{text-decoration:none}
.au-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap;min-height:28px}
.au-who{display:inline-flex;align-items:center;gap:8px;min-width:0}
.au-who>span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`);
