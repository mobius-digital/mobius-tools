/* The workshop: which pages are live for the team, and which wait in the workshop for the owner alone.
   LIVE is the one list. A page leaves the workshop by adding its line and tab here (one line).
   Everything not listed is in the workshop:
     the owner sees it in the menu under one "Workshop" group, tagged "In the workshop";
     anyone else (team, client, the owner with "See as client" on) has it left out of the menu, and its address
     shows "This page is being built" with no data call.
   A live line shows only its live tabs to the team; a link to one of its other tabs opens its first live tab.
   The owner is ctx.me role owner (shell.js realRole), the same check v5 uses everywhere. */

import { explainFor } from './workshop-pages.js';

/** line id: the live tab ids of that line. The brand switcher is in the top bar and always there. */
export const LIVE = {
  /* Black Friday War Room: agency and brand. The brand plan is a route opened from the War Room's plan table. */
  'a-black-friday': ['war-room'],
  'black-friday': ['war-room', 'plan'],
  /* Meta ad calls: Suggestions, and Changes made, where Undo lives */
  'meta': ['suggestions', 'changes'],
  'a-meta': ['suggestions'],
  /* Production: the brand board (it opens the review for a client) and the agency pipeline */
  'production': ['board'],
  'a-production': ['pipeline', 'needs-someone'],
  /* Reports: To send, and the brand's reports */
  'a-to-send': ['index'],
  'reports': ['index'],
  /* the top bar: My day, the bell, and Profile > How things reach me */
  'my-day': ['index'],
  'notifications': ['needs-you', 'watching', 'done-today'],
  'profile': ['delivery'],
};

export const WORKSHOP_GROUP = 'Workshop';
export const WORKSHOP_NOTE = 'In the workshop';

/** Only the owner sees the workshop. role is the shell's role: 'owner' | 'team' | 'client'. */
export const seesWorkshop = role => role === 'owner';
/** True when the line has at least one live tab. */
export const lineLive = lineId => Object.prototype.hasOwnProperty.call(LIVE, lineId) && LIVE[lineId].length > 0;
/** True when this line and tab are live for the team. */
export const isLive = (lineId, tabId) => lineLive(lineId) && LIVE[lineId].includes(tabId);
/** May this role open this page? */
export const canOpen = (role, lineId, tabId) => seesWorkshop(role) || isLive(lineId, tabId);
/** The tabs of a line this role is shown. A line wholly in the workshop keeps its tabs (its address still resolves, to "being built"). */
export const tabsFor = (line, role) => seesWorkshop(role) || !lineLive(line.id) ? line.tabs : line.tabs.filter(x => isLive(line.id, x.id));

/** The menu groups as this role sees them (menu.js menuFor). keepAll (the router) keeps every line in place so a
    workshop address still resolves. The owner and the team keep every line where it is; a line still in the workshop
    carries workshop: true and the shell draws the workshop icon beside it (Cole, 2026-11-27: "just an icon next to it").
    A client gets the live lines only. */
export function arrange(groups, role, keepAll = false) {
  if (keepAll) return groups;
  if (role === 'client') return groups.map(g => ({ ...g, lines: g.lines.filter(l => lineLive(l.id)) }));
  return groups.map(g => ({ ...g, lines: g.lines.map(l => (lineLive(l.id) ? l : { ...l, workshop: true })) }));
}

/** The page drawn for a workshop address when the viewer is not the owner. No module, no data call.
    It says what the page is for, the data it will hold, how the team uses it and how it helps a brand scale
    (workshop-pages.js), so the team knows what is coming and can tell us what they want on it. */
export function renderBuilding(el, ctx) {
  const doc = el.ownerDocument || document;
  const mk = (tag, cls, text) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const box = mk('div', 'lx-empty lx-ws');
  const eyebrow = mk('span', 'lx-eyebrow', ctx && ctx.view === 'agency' ? 'All brands' : ctx && ctx.brand ? ctx.brand.name : '');
  const h3 = mk('h3', null, (ctx && ctx.title) || 'This page');
  const pill = mk('span', 'lx-ws-pill', WORKSHOP_NOTE);
  const ex = explainFor(ctx && ctx.line && ctx.line.id);
  if (!ex) { box.append(eyebrow, h3, pill, mk('p', null, 'This page is being built.')); el.replaceChildren(box); return; }
  const sec = (label, body) => { const s = mk('div', 'lx-ws-sec'); s.append(mk('b', null, label), body); return s; };
  const list = mk('ul');
  ex.data.forEach(d => list.append(mk('li', null, d)));
  box.append(eyebrow, h3, pill, mk('p', 'lx-ws-lead', ex.what));
  if (ex.data.length) box.append(sec('The data it will have', list));
  box.append(sec('How you will use it', mk('p', null, ex.use)), sec('How it helps a brand scale', mk('p', null, ex.scale)),
    mk('p', 'lx-ws-foot', 'This page is being built and opens after its review. Want something on it? Post it in the team channel.'));
  el.replaceChildren(box);
}
