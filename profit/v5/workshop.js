/* The workshop: which pages are live for the team, and which wait in the workshop for the owner alone.
   LIVE is the one list. A page leaves the workshop by adding its line and tab here (one line).
   Everything not listed is in the workshop:
     the owner sees it in the menu under one "Workshop" group, tagged "In the workshop";
     anyone else (team, client, the owner with "See as client" on) has it left out of the menu, and its address
     shows "This page is being built" with no data call.
   A live line shows only its live tabs to the team; a link to one of its other tabs opens its first live tab.
   The owner is ctx.me role owner (shell.js realRole), the same check v5 uses everywhere. */

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
    workshop address still resolves. The owner gets live lines where they were and the rest in one Workshop group,
    tagged. Anyone else gets the live lines only. */
export function arrange(groups, role, keepAll = false) {
  if (keepAll) return groups;
  if (!seesWorkshop(role)) return groups.map(g => ({ ...g, lines: g.lines.filter(l => lineLive(l.id)) }));
  const shop = [];
  const live = groups.map(g => ({ ...g, lines: g.lines.filter(l => lineLive(l.id) || (shop.push({ ...l, note: WORKSHOP_NOTE, foot: false, gap: false }), false)) }));
  return shop.length ? live.concat({ group: WORKSHOP_GROUP, workshop: true, lines: shop }) : live;
}

/** The page drawn for a workshop address when the viewer is not the owner. No module, no data call. */
export function renderBuilding(el, ctx) {
  const doc = el.ownerDocument || document;
  const box = doc.createElement('div'); box.className = 'lx-empty';
  const eyebrow = doc.createElement('span'); eyebrow.className = 'lx-eyebrow';
  eyebrow.textContent = ctx && ctx.view === 'agency' ? 'All brands' : ctx && ctx.brand ? ctx.brand.name : '';
  const h3 = doc.createElement('h3'); h3.textContent = (ctx && ctx.title) || 'This page';
  const p = doc.createElement('p'); p.textContent = 'This page is being built.';
  box.append(eyebrow, h3, p);
  el.replaceChildren(box);
}
