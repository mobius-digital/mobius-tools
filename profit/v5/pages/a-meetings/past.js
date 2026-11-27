/* Meetings > Past meetings: every recorded meeting of the last 60 days, what was decided on it,
   and what is still open.
   Reads ah GET /api/meetings (the list, plus every open task) and, when a meeting is opened,
   ah GET /api/meetings?id=<id> (its notes: summary, decisions and tasks per brand, and what filing it made).
   Filing a meeting (Confirm) and skipping one stay in old Locus. The one write here is Pull tasks (2026-11-26, a34,
   _pull.js): up to 5 tasks suggested from one call's notes, the person ticks which to keep. */

import { APP_NAME } from '../../config.js';
import { put, noDash } from '../../kit.js';
import { h, em, button, avatar, statusDot, dateBlock, segmented, toggle, sheet, empty, addStyles, tiles, kpi } from '../../kit.js';
import { pageHelp } from '../../defs.js';
import { pullButton } from './_pull.js';

/* what the states mean: shown on hover or tap wherever the word appears (no footer) */
const DEF = {
  filed: { name: 'Filed', definition: 'Someone confirmed the meeting notes. That made the tasks, the asks for the client and the report lines. Filing is done in old ' + APP_NAME + '.' },
  waiting: { name: 'Waiting to be filed', definition: 'The notes were read but nobody has confirmed them yet. Nothing from the meeting is a task until someone files it.' },
  skipped: { name: 'Skipped', definition: 'Nobody filed this meeting, on purpose. Nothing from it became a task.' },
  open: { name: 'Still open', definition: 'Tasks made from filed meetings that are not done yet, in Asana.' },
};
/* a state is a plain status (no dotted mark on a status word): what it means is in its native hover and in "What is this page?" */
const stDot = st => { const n = statusDot(st.tone, st.text); if (DEF[st.id]) n.title = DEF[st.id].definition; return n; };

const ui = { kind: 'all', skipped: false, allOpen: false };

/* ---------- words ---------- */
const KIND = { monday_call: 'Monday team meeting', client_call: 'Client call', kickoff: 'Kickoff', internal: 'Internal', other: 'Other' };
const kindOf = m => KIND[m.kind] || 'Other';
const groupOf = m => m.kind === 'monday_call' ? 'team' : m.kind === 'client_call' ? 'client' : 'other';
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
const day = ymd => new Date(ymd + 'T12:00:00');
const shortDay = ymd => day(ymd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const longDay = ymd => day(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const mondayOf = ymd => { const d = day(ymd); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toLocaleDateString('en-CA'); };
const first = name => String(name || '').split('@')[0].split(/\s+/)[0];

/** Where a meeting stands: filed (its tasks exist), waiting for someone to file it, or skipped. */
function stateOf(m) {
  if (m.status === 'confirmed') return { id: 'filed', tone: 'good', text: 'Filed' };
  if (m.status === 'extracted') return { id: 'waiting', tone: 'warn', text: 'Waiting to be filed' };
  if (m.status === 'skipped') return { id: 'skipped', tone: 'off', text: 'Skipped' };
  if (m.error) return { id: 'error', tone: 'bad', text: 'Could not be read' };
  return { id: 'new', tone: 'off', text: 'Being read' };
}
const list = (pairs) => pairs.filter(p => p[0] > 0).map(p => plural(p[0], p[1], p[2])).join(', ');
/** One plain line for the list: what filing made, or what the notes found, or why it was skipped. */
function whatOf(m, st) {
  if (st.id === 'filed') {
    const k = m.made || {};
    const made = list([[k.tasks, 'task'], [k.briefs, 'brief'], [k.asks, 'ask for the client', 'asks for the client']]);
    return [made, k.report > 0 ? 'weekly report updated' : ''].filter(Boolean).join(', ') || 'Notes filed, nothing new to do';
  }
  if (st.id === 'skipped' && m.error) return noDash(m.error.charAt(0).toUpperCase() + m.error.slice(1));
  if (st.id === 'error') return noDash(m.error);
  const c = m.counts;
  if (!c) return st.id === 'new' ? 'Notes are not ready yet' : 'No notes were kept';
  const found = list([[c.team, 'task'], [c.brief, 'brief'], [c.client_owes, 'thing for the client', 'things for the client']]);
  return found ? found + (st.id === 'skipped' ? ' found, never filed' : ' found, not made yet') : 'Nothing to do came out of it';
}

/* ---------- real mode ---------- */
async function load(ctx) {
  const r = await ctx.api('/api/meetings', { worker: 'ah', signal: ctx.signal });
  return {
    today: r.today || new Date().toLocaleDateString('en-CA'), monday: r.monday || null, connected: r.connected !== false,
    brands: (r.brands || []).map(b => ({ id: b.act_id, name: b.name })),
    meetings: r.meetings || [],
    open: Array.isArray(r.open) ? r.open : null,
  };
}
async function detailOf(m, data, ctx) {
  if (ctx.sample) return (data.details && data.details[m.id]) || null;
  const r = await ctx.api('/api/meetings?id=' + encodeURIComponent(m.id), { worker: 'ah' });
  return { notes: r.notes || null, result: r.result || null };
}

/* ---------- one meeting, in a sheet ---------- */
function openMeeting(m, data, ctx, world) {
  const st = stateOf(m);
  const body = h('div', { class: 'mp-sheet' }, h('p', { class: 'mp-quiet' }, 'Reading the notes.'));
  const sh = sheet({ title: m.title || 'Meeting', body });
  window.addEventListener('hashchange', () => sh.close(), { once: true });      // a sheet never outlives its page
  /* the head: the date, one row of chips, the state as one pill */
  const head = h('div', { class: 'mp-sh' }, dateBlock(m.date),
    h('div', { class: 'mp-chips' },
      h('span', { class: 'mp-chip' }, kindOf(m)),
      m.duration > 0 ? h('span', { class: 'mp-chip' }, Math.round(m.duration) + ' min') : null,
      m.with && m.with.length ? h('span', { class: 'mp-chip' }, 'With ' + m.with.join(', ')) : null,
      stDot(st), st.id === 'filed' && m.confirmed_by ? h('span', { class: 'mp-by' }, 'by ' + first(m.confirmed_by)) : null));
  const unfiled = () => st.id === 'filed' ? null : h('div', { class: 'mp-unfiled' },
    h('p', null, st.id === 'waiting' ? 'Not filed yet: none of this is a task until someone confirms the notes.' : 'Not filed: nothing below became a task.'),
    ctx.legacy && !ctx.sample && st.id === 'waiting' ? button('Open in old ' + APP_NAME, { href: ctx.legacy, icon: 'arrow' }) : null);

  detailOf(m, data, ctx).then(d => {
    if (!body.isConnected) return;
    const notes = d && d.notes;
    if (!notes || !(notes.brands || []).length && !notes.summary) return put(body, head, h('p', { class: 'mp-quiet' }, whatOf(m, st) + '.'), unfiled());
    const res = d.result, made = res ? [...(res.brands || []), ...(res.agency ? [{ ...res.agency, brand_id: '' }] : [])] : [];
    const stateOfTask = (brandId, it) => {
      if (st.id !== 'filed') return 'unfiled';
      if (it.kind === 'client_owes') return 'asked';
      if (it.kind === 'brief') return 'brief';
      const mine = (made.find(r => (r.brand_id || '') === brandId) || {}).tasks || [];
      const row = mine.find(t => t.text === it.text);
      if (!row || !row.id || !world.openIds) return 'made';
      return world.openIds.has(row.id) ? 'open' : 'done';
    };
    const PILL = { unfiled: () => statusDot('off', st.id === 'waiting' ? 'Not filed yet' : 'Not filed'), asked: () => statusDot('off', 'Asked of the client'),
      brief: () => statusDot('good', 'Brief made'), made: () => statusDot('good', 'Task made'), open: () => { const n = statusDot('warn', 'Still open'); n.title = DEF.open.definition; return n; }, done: () => statusDot('good', 'Done') };
    const brands = notes.brands || [];
    let nDec = 0, nTasks = 0, nOpen = 0;
    for (const b of brands) {
      nDec += (b.decisions || []).length;
      for (const it of (b.items || []).filter(i => i.kind !== 'client')) { nTasks++; if (stateOfTask(b.brand_id || '', it) === 'open') nOpen++; }
    }
    const tile = (label, v, sub) => h('div', { class: 'mp-tile' }, h('span', { class: 'l' }, label), h('span', { class: 'v' }, String(v)), sub ? h('span', { class: 's' }, sub) : null);
    const tiles = h('div', { class: 'mp-tiles' },
      tile('Decisions', nDec),
      tile(st.id === 'filed' ? 'Tasks made' : 'Tasks found', nTasks, st.id === 'filed' ? null : 'not made yet'),
      tile('Still open', st.id === 'filed' ? nOpen : 'None', st.id === 'filed' ? null : 'nothing was made'));
    const block = b => {
      const tasks = (b.items || []).filter(i => i.kind !== 'client');
      const told = [...(b.this_week || []).map(t => ['hears', t]), ...(b.need_from_client || []).map(t => ['waits', t])];
      return h('section', { class: 'mp-b' },
        h('h3', null, h('i', { class: 'mp-dot', style: { '--dot': world.colorOf(b.brand_id) } }), b.brand_id ? world.nameOf(b.brand_id) : 'Agency-wide'),
        (b.decisions || []).length ? h('div', null, h('span', { class: 'lx-cap' }, 'Decided'), h('ul', { class: 'mp-ul' }, b.decisions.map(t => h('li', null, noDash(t))))) : null,
        tasks.length ? h('div', null, h('span', { class: 'lx-cap' }, 'Tasks'), h('div', { class: 'mp-tasks' }, tasks.map(it => {
          const who = it.kind === 'client_owes' ? 'The client' : it.owner || '';
          return h('div', { class: 'mp-t' },
            who ? avatar({ name: who }, { size: 28 }) : h('span', { class: 'mp-nobody sm', role: 'img', 'aria-label': 'No owner', title: 'No owner' }),
            h('span', { class: 'what' }, noDash(it.text), h('small', null, [who || 'No owner', it.due ? 'due ' + shortDay(it.due) : 'no due date', it.kind === 'brief' && 'new ads'].filter(Boolean).join(', '))),
            PILL[stateOfTask(b.brand_id || '', it)]());
        }))) : null,
        told.length ? h('details', { class: 'mp-told' }, h('summary', null, 'What the client was told (' + told.length + ')'),
          (b.this_week || []).length ? h('div', null, h('span', { class: 'lx-cap' }, 'The client hears'), h('ul', { class: 'mp-ul soft' }, b.this_week.map(t => h('li', null, noDash(t))))) : null,
          (b.need_from_client || []).length ? h('div', null, h('span', { class: 'lx-cap' }, 'Waiting on the client'), h('ul', { class: 'mp-ul soft' }, b.need_from_client.map(t => h('li', null, noDash(t))))) : null) : null);
    };
    /* A filed call already made its team tasks (Confirm), so it has no Pull tasks button. */
    const pull = ctx.isClient || st.id === 'filed' ? null : h('div', { class: 'lx-row', style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } },
      pullButton(ctx, m, world.nameOf), h('span', { class: 'mp-quiet' }, 'Up to 5 tasks from this call. You tick which to keep.'));
    put(body, head, unfiled(), pull, tiles, notes.summary ? h('p', { class: 'mp-sum' }, noDash(notes.summary)) : null, brands.map(block));
  }).catch(e => {
    if (!body.isConnected) return;
    put(body, head, h('p', { class: 'mp-quiet' }, e && e.status === 404 ? 'The notes for this meeting are gone.' : 'The notes could not be read just now. Close this and try again.'));
  });
}

/* ---------- the page ---------- */
function draw(el, data, ctx) {
  addStyles('mp-css', CSS);
  const d = data || {};
  const all = d.meetings || [];
  if (!all.length) {
    return put(el, empty({ title: d.connected === false ? 'The note taker is not connected' : 'No meetings in the last 60 days',
      text: d.connected === false ? 'Meetings show here once the note taker is connected in Agency settings.' : 'A meeting shows here once its recording has been read.',
      action: button('Open integrations', { href: ctx.href('a-settings', 'integrations'), icon: 'arrow' }) }));
  }
  const names = Object.fromEntries((d.brands || []).map(b => [b.id, b.name]));
  const colors = Object.fromEntries((ctx.brands || []).map(b => [b.id, b.color]));
  const world = {
    nameOf: id => names[id] || String(id).replace(/^brand_/, '').replace(/_/g, ' '),
    colorOf: id => colors[id] || 'var(--faint)',
    openIds: d.open ? new Set(d.open.flatMap(g => (g.items || []).map(i => i.id))) : null,
  };
  const today = d.today || new Date().toLocaleDateString('en-CA');
  const rows = all.map(m => ({ m, st: stateOf(m) }));
  const filed = rows.filter(r => r.st.id === 'filed'), waiting = rows.filter(r => r.st.id === 'waiting'), skipped = rows.filter(r => r.st.id === 'skipped');
  const openItems = d.open ? d.open.flatMap(g => (g.items || []).map(i => ({ ...i, brand: g.brand_id ? (g.name || world.nameOf(g.brand_id)) : 'Agency-wide', late: !!i.due && i.due < today }))) : null;
  const late = openItems ? openItems.filter(i => i.late).length : 0;
  const openFrom = id => openItems ? openItems.filter(i => i.source_id === id).length : 0;

  /* the four counts */
  const figs = tiles([
    kpi({ label: 'Meetings', value: String(all.length), sub: 'recorded in the last 60 days' }),
    kpi({ label: 'Filed', value: String(filed.length), sub: 'notes confirmed, tasks made' }),
    kpi({ label: 'Waiting to be filed', value: String(waiting.length), sub: waiting.length ? statusDot('warn', 'newest ' + shortDay(waiting[0].m.date)) : 'nothing waiting' }),
    openItems ? kpi({ label: 'Tasks still open', value: String(openItems.length), sub: late ? statusDot('bad', plural(late, 'is', 'are') + ' late') : 'none late' }) : null,
  ].filter(Boolean), { cols: openItems ? 4 : 3 });
  ctx.askContext = 'Past meetings, last 60 days: ' + all.length + ' recorded, ' + filed.length + ' filed, ' + waiting.length + ' waiting to be filed' + (openItems ? ', ' + openItems.length + ' tasks still open (' + late + ' late)' : '') + '.';

  /* what is still open */
  let openCard = null;
  if (openItems && openItems.length) {
    const sorted = [...openItems].sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1);
    const shown = ui.allOpen ? sorted : sorted.slice(0, 6);
    openCard = h('section', { class: 'mp-sec' },
      h('div', { class: 'mp-h' }, h('h3', null, 'What is still open?'), h('span', null, 'every open task, oldest due date first')),
      h('div', { class: 'lx-card flush' }, h('div', { class: 'mp-o mp-head', 'aria-hidden': 'true' }, h('span', { class: 'av' }), h('span', { class: 'what' }, 'Task'), h('span', { class: 'who' }, 'Owner and due date'), h('span', { class: 'st' }, 'Status')),
        shown.map(i => { const m = all.find(k => k.id === i.source_id); const kids = [
        i.owner ? avatar({ name: i.owner }, { size: 36 }) : h('span', { class: 'mp-nobody', role: 'img', 'aria-label': 'No owner' }),
        h('span', { class: 'what' }, noDash(i.text || i.name), h('small', null, i.brand)),
        h('span', { class: 'who' }, [i.owner || 'No owner', i.due ? 'due ' + shortDay(i.due) : 'no due date'].join(', ')),
        i.late ? statusDot('bad', 'Late') : statusDot('off', 'Open')];
          /* a task opens the meeting it came from; one whose meeting is not in the list is a plain row (no hover) */
          return m ? h('button', { type: 'button', class: 'mp-o go', onclick: () => openMeeting(m, data, ctx, world), 'aria-label': 'Open the meeting this task came from: ' + (m.title || 'meeting') }, kids) : h('div', { class: 'mp-o' }, kids); })),
      sorted.length > 6 ? button(ui.allOpen ? 'Show fewer' : `Show all ${sorted.length}`, { ghost: true, onclick: () => { ui.allOpen = !ui.allOpen; draw(el, data, ctx); } }) : null);
  } else if (openItems) {
    openCard = h('section', { class: 'mp-sec' }, h('div', { class: 'mp-h' }, h('h3', null, 'What is still open?'), h('span', null, 'No task is open. Everything filed has been done.')));
  }

  /* the meetings, by week */
  const pass = r => (ui.kind === 'all' || groupOf(r.m) === ui.kind) && (ui.skipped || r.st.id !== 'skipped');
  const vis = rows.filter(pass);
  const weeks = new Map();
  for (const r of vis) { const w = mondayOf(r.m.date); if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push(r); }
  const row = ({ m, st }) => {
    const ids = m.brand_ids || [], nm = ids.slice(0, 3).map(world.nameOf);
    const stillOpen = st.id === 'filed' ? openFrom(m.id) : 0;
    return h('button', { type: 'button', class: 'mp-m' + (st.id === 'skipped' ? ' off' : ''), onclick: () => openMeeting(m, data, ctx, world), 'aria-label': 'Open ' + (m.title || 'meeting') + ', ' + longDay(m.date) },
      dateBlock(m.date),
      h('span', { class: 'ti' }, h('b', null, m.title || 'Untitled meeting'),
        h('small', null, [kindOf(m), m.duration > 0 ? Math.round(m.duration) + ' min' : null, m.with && m.with.length ? 'with ' + m.with.join(', ') : null].filter(Boolean).join(', '))),
      h('span', { class: 'br' }, nm.length ? nm.join(', ') + (ids.length > 3 ? ` and ${ids.length - 3} more` : '') : ''),
      h('span', { class: 'wh' }, whatOf(m, st), stillOpen ? h('small', null, plural(stillOpen, 'task') + ' still open') : null),
      stDot(st));
  };
  const firstWeek = [...weeks.keys()][0];
  const listHead = () => h('div', { class: 'mp-m mp-head', 'aria-hidden': 'true' }, h('span'), h('span', null, 'Meeting'), h('span', { class: 'br' }, 'Brands'), h('span', null, 'What came out of it'), h('span', null, 'Status'));
  const filters = h('div', { class: 'mp-filters' },
    segmented([{ id: 'all', label: 'All' }, { id: 'team', label: 'Monday team' }, { id: 'client', label: 'Client calls' }, { id: 'other', label: 'Other' }], ui.kind, id => { ui.kind = id; draw(el, data, ctx); }),
    skipped.length ? toggle({ label: `Show skipped (${skipped.length})`, checked: ui.skipped, onchange: on => { ui.skipped = on; draw(el, data, ctx); } }) : null);
  const meetings = h('section', { class: 'mp-sec' },
    h('div', { class: 'mp-h' }, h('h3', null, 'Every recorded meeting'), h('span', null, 'Open one for its decisions and tasks')),
    filters,
    vis.length ? [...weeks.entries()].map(([w, list]) => h('div', { class: 'mp-wk' },
      h('span', { class: 'lx-eyebrow' }, 'Week of ' + shortDay(w)),
      h('div', { class: 'lx-card flush' }, w === firstWeek ? listHead() : null, list.map(row))))
      : h('p', { class: 'mp-quiet' }, 'No meeting matches. Try All, or show the skipped ones.'));

  put(el, h('div', { class: 'mp' }, h('div', { class: 'mp-bar' }, pageHelp({ body: [
      { title: 'What it is for', text: 'Every recorded meeting of the last 60 days, what was decided on it, and which of its tasks are still open.' },
      { title: 'Filed, waiting and skipped', text: 'A meeting is filed when someone confirms its notes: that makes the tasks, the asks for the client and the report lines. Waiting to be filed means the notes were read but nobody confirmed them, so nothing is a task yet. Skipped means nobody filed it on purpose. Filing and skipping are done in old ' + APP_NAME + '.' },
      { title: 'Open a meeting', text: 'Each meeting opens with its decisions, its tasks and who owns them, brand by brand. What the client was told sits folded under each brand.' },
    ] })), figs, openCard, meetings));
}

export default {
  title: ['Past meetings, ', em('last 60 days')],
  eyebrow: 'Meetings, team',
  ranges: false,
  load,
  render: draw,
  update: draw,
};

/* ---------- the page CSS, once. Every class starts with mp-. ---------- */
const CSS = `
.mp{display:grid;gap:32px;min-width:0}
.mp-bar{display:flex;align-items:center;gap:12px;margin-bottom:-12px}
.mp-head{min-height:32px!important;padding-top:0!important;padding-bottom:0!important;cursor:default!important;background:none!important;font-size:var(--fs-colhead,11.5px)!important;font-weight:600;letter-spacing:0;text-transform:none;color:var(--muted)}
.mp-head .what,.mp-head .who,.mp-head .st,.mp-head .br{font-size:var(--fs-colhead,11.5px)!important;font-weight:600!important;color:var(--muted)!important;letter-spacing:0}
.mp-head+.mp-m,.mp-head+.mp-o{border-top:1px solid var(--line)}
.mp-o .av{width:36px;flex:none}
.mp-o.mp-head .st{width:70px;flex:none}
.mp-chips{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mp-chip{display:inline-flex;align-items:center;height:26px;padding:0 10px;border-radius:999px;background:var(--bg-sunk);font-size:12.5px;font-weight:600;color:var(--ink-2)}
.mp-by{font-size:12.5px;color:var(--muted)}
.mp-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.mp-tile{display:grid;gap:4px;padding:14px 16px;border-radius:14px;background:var(--bg-sunk)}
.mp-tile .l{font-size:12.5px;font-weight:600;color:var(--muted)}
.mp-tile .v{font-size:var(--num-m);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.mp-tile .s{font-size:12px;color:var(--muted)}
.mp-unfiled{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:12px 14px;border-radius:12px;background:var(--warn-bg,#FFF6E5)}
.mp-unfiled p{margin:0;flex:1 1 260px;font-size:14px;font-weight:500;color:var(--ink)}
.mp-dot{display:inline-block;width:10px;height:10px;border-radius:3px;background:var(--dot);margin-right:9px;vertical-align:1px}
.mp-told{border-top:1px dashed var(--line);padding-top:10px}
.mp-told summary{cursor:pointer;font-size:13.5px;font-weight:600;color:var(--ink-2)}
.mp-told[open]{display:grid;gap:12px}
.mp-told>div{display:grid;gap:8px}
.mp-nobody.sm{width:28px;height:28px}
.mp-figs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:40px}
.mp-fig{display:grid;gap:6px;min-width:0;align-content:start}
.mp-fig .l{font-size:13.5px;font-weight:500;color:var(--muted)}
.mp-fig .v{font-size:var(--num-l);font-weight:600;letter-spacing:-.045em;line-height:1;font-variant-numeric:tabular-nums}
.mp-fig .v.bad{color:var(--bad)}
.mp-fig .s{font-size:13.5px;color:var(--muted)}
.mp-sec{display:grid;gap:14px;min-width:0;justify-items:stretch}
.mp-sec>.lx-btn{justify-self:start}
.mp-h{display:flex;align-items:baseline;gap:6px 12px;flex-wrap:wrap}
.mp-h h3{margin:0;font-size:var(--fs-section,17px);font-weight:600;letter-spacing:-.015em}
.mp-h>span{font-size:13.5px;color:var(--muted)}
.mp-filters{display:flex;align-items:center;gap:12px 22px;flex-wrap:wrap}
.mp-wk{display:grid;gap:10px;margin-top:10px}
.mp-m{display:grid;grid-template-columns:46px minmax(0,1.5fr) minmax(0,1fr) minmax(0,1.4fr) 160px;gap:20px;align-items:center;width:100%;min-height:76px;padding:12px 26px;border:0;border-top:1px solid var(--line);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer}
.mp-m:first-child{border-top:0}
.mp-m:hover{background:var(--row-hover)}
.mp-m.off .ti b,.mp-m.off .wh{color:var(--muted)}
.mp-m .ti{display:grid;gap:2px;min-width:0}
.mp-m .ti b{font-size:15.5px;font-weight:600;letter-spacing:-.012em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mp-m .ti small,.mp-m .wh small{font-size:12.5px;color:var(--muted)}
.mp-m .br{font-size:13.5px;color:var(--ink-2);min-width:0}
.mp-m .wh{display:grid;gap:2px;font-size:14px;min-width:0}
.mp-m .wh small{color:var(--warn);font-weight:500}
.mp-m>.lx-stat{justify-self:start}
.mp-o{display:flex;align-items:center;gap:14px;min-height:64px;padding:10px 26px;border-top:1px solid var(--line)}
.mp-o:first-child{border-top:0}
.mp-o .what{flex:1;min-width:0;font-size:15px;font-weight:500;letter-spacing:-.01em}
.mp-o .what small{display:block;font-size:12.5px;font-weight:500;color:var(--muted)}
.mp-o .who{width:200px;font-size:13px;color:var(--muted)}
.mp-o>.lx-stat{flex:none;min-width:70px}
button.mp-o{width:100%;border:0;border-top:1px solid var(--line);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer}
button.mp-o:first-child{border-top:0}
button.mp-o.go:hover{background:var(--row-hover)}
.mp-nobody{flex:none;width:36px;height:36px;border-radius:50%;background:var(--bg-sunk);box-shadow:inset 0 0 0 1.5px var(--line-strong)}
.mp-quiet{margin:0;font-size:13.5px;color:var(--muted)}
.mp-sheet{display:grid;gap:22px;min-width:0}
.mp-sh{display:flex;gap:14px;align-items:center;font-size:13.5px;color:var(--muted)}
.mp-sum{margin:0;font-size:16px;line-height:1.5;color:var(--ink-2)}
.mp-b{display:grid;gap:14px;padding-top:20px;border-top:1px solid var(--line)}
.mp-b h3{margin:0;font-size:17px;font-weight:600;letter-spacing:-.02em}
.mp-b>div{display:grid;gap:8px}
.mp-ul{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.mp-ul li{position:relative;padding-left:18px;font-size:14.5px;line-height:1.45}
.mp-ul li::before{content:"";position:absolute;left:2px;top:.6em;width:6px;height:6px;border-radius:50%;background:var(--ink)}
.mp-ul.soft li{color:var(--ink-2)}
.mp-ul.soft li::before{background:var(--icon)}
.mp-tasks{display:grid}
.mp-t{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line)}
.mp-t:first-child{border-top:0}
.mp-t .what{flex:1;min-width:0;font-size:14.5px;font-weight:500}
.mp-t .what small{display:block;font-size:12.5px;font-weight:500;color:var(--muted)}
.mp-foot{display:grid;gap:12px;justify-items:start;padding-top:18px;border-top:1px solid var(--line)}
@media (max-width:1040px){
  .mp-figs{grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}
  .mp-m{grid-template-columns:46px minmax(0,1.3fr) minmax(0,1.2fr) auto;gap:14px;padding:12px 18px}
  .mp-m .br{display:none}
}
@media (max-width:759px){
  .mp{gap:30px}
  .mp-figs{gap:22px 16px}
  .mp-fig .v{font-size:var(--num-l)}
  .mp-m{grid-template-columns:46px minmax(0,1fr);gap:6px 12px;padding:14px 16px;align-items:start}
  .mp-m .ti b{white-space:normal}
  .mp-m .wh,.mp-m>.lx-stat,.mp-m>.lx-pill{grid-column:2}
  .mp-o{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:2px 12px;padding:12px 16px}
  .mp-o .what{grid-column:2}
  .mp-o .who{grid-column:2;grid-row:2;width:auto}
  .mp-o>.lx-stat,.mp-o>.lx-pill{grid-column:3;grid-row:1/3;width:auto}
  .mp-head{display:none!important}
  .mp-tiles{gap:8px}
}`;
