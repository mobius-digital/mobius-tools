/* Meetings > Past meetings: Pull tasks (2026-11-26, move lines a34). Instead of confirming a whole call's notes,
   anyone on the team asks for tasks from one call when they want them: at most 5 suggestions from the notes Locus
   already read (POST /api/meetings/pull {id}, no new reading), the person ticks which to keep, and Keep makes only
   those tasks (POST /api/meetings/keep {id, items}). Nothing else happens: no report line, no client ask, no Slack post.
   The reading of every call is unchanged. pickedItems is pure (tested in test-locus-homes.mjs). */

import { h, button, sheet, toast, statusDot } from '../../kit.js';

/** The suggestions a person ticked, in the shape the keep route takes. Pure. */
export function pickedItems(items, ticked) {
  return (items || []).filter((_, i) => ticked && ticked.has(i)).slice(0, 5)
    .map(x => ({ act: x.act || '', text: x.text, detail: x.detail || '', owner: x.owner || '', due: x.due || '', area: x.area || '' }));
}
const when = ymd => ymd ? new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

/** The Pull tasks button for one meeting. nameOf(brandId) names a brand. */
export function pullButton(ctx, m, nameOf) {
  return button('Pull tasks', { icon: 'plus', onclick: () => openPull(ctx, m, nameOf) });
}

function openPull(ctx, m, nameOf) {
  const body = h('div', { style: { display: 'grid', gap: '14px' } }, h('p', { class: 'mp-quiet' }, 'Finding tasks in this call.'));
  const sh = sheet({ title: 'Pull tasks from this call', side: 'center', body });
  if (ctx.sample) { body.replaceChildren(h('p', { class: 'mp-quiet' }, 'Sample numbers: with real data, up to 5 tasks from this call show here to tick.')); return; }
  ctx.api('/api/meetings/pull', { worker: 'ah', method: 'POST', body: { id: m.id } }).then(r => {
    const items = (r && r.items) || [];
    if (!items.length) { body.replaceChildren(h('p', { class: 'mp-quiet' }, (r && r.why) || 'No task came out of this call.')); return; }
    const ticked = new Set(items.map((x, i) => (x.sure ? i : -1)).filter(i => i >= 0));
    const keep = button('', { primary: true, onclick: async () => {
      const picked = pickedItems(items, ticked);
      if (!picked.length) return toast('Tick at least one task to keep.');
      keep.disabled = true;
      try {
        const res = await ctx.api('/api/meetings/keep', { worker: 'ah', method: 'POST', body: { id: m.id, items: picked } });
        const n = ((res && res.made) || []).length;
        sh.close(); toast(n ? `${n} ${n === 1 ? 'task' : 'tasks'} made. They show in each owner's My day.` : 'Nothing new was made.');
        if (res && res.warnings && res.warnings.length) toast(res.warnings[0], { tone: 'bad', ms: 6000 });
      } catch (e) { keep.disabled = false; toast('Could not keep them: ' + e.message, { tone: 'bad', ms: 5000 }); }
    } });
    const label = () => { keep.textContent = `Keep ${ticked.size} ${ticked.size === 1 ? 'task' : 'tasks'}`; keep.disabled = !ticked.size; };
    label();
    body.replaceChildren(
      h('p', { class: 'mp-quiet' }, 'Tick the ones worth doing. Only those become tasks.' + (r.kept ? ` ${r.kept} already kept from this call.` : '')),
      ...items.map((x, i) => h('label', { style: { display: 'grid', gridTemplateColumns: '20px minmax(0,1fr)', gap: '10px', alignItems: 'start', cursor: 'pointer' } },
        h('input', { type: 'checkbox', checked: ticked.has(i) || null, style: { marginTop: '3px' }, onchange: e => { e.target.checked ? ticked.add(i) : ticked.delete(i); label(); } }),
        h('span', { style: { display: 'grid', gap: '3px' } }, h('b', null, x.text),
          h('small', { class: 'mp-quiet' }, [x.act ? nameOf(x.act) : 'Agency-wide', x.owner || 'No owner', x.due ? 'due ' + when(x.due) : 'no due date'].join(', ')),
          x.detail ? h('small', null, x.detail) : null,
          x.sure ? null : statusDot('off', 'Not said out loud: check it')))),
      keep);
  }).catch(e => body.replaceChildren(h('p', { class: 'mp-quiet' }, (e && e.message) || 'The call could not be read just now.')));
}
