/* My day: today's plan (2026-11-26, move lines a10). The daily check-in's plan form and "I'm out today", in Locus.
   Data: GET /api/mywork/plans (account-health mywork.js -> checkin.js plansToday): today's board, `me` = my Slack id,
   `on_list` = am I on the daily check-in list. Writes: POST /api/mywork/plan { text } or { out: true }, the SAME record
   the Slack form writes (settings checkin:<date>), so the Slack board, the "no plan yet" line and Agency > Team agree.
   When today's check-in post is up in Slack, a plan typed here is also posted in its thread, as the Slack form does.
   Pure parts (mine, planLines) are tested in test-locus-homes.mjs; the sheet needs the DOM. */

import { h, button, sheet, toast, statusDot } from '../../kit.js';

/** My row on today's board, or null when I am not on the check-in list (or the board did not answer). Pure. */
export function mine(board) {
  if (!board || !board.on_list || !board.me) return null;
  return (board.people || []).find(p => p.uid === board.me) || null;
}
/** The lines of a typed plan: one per line, bullets dropped, blanks gone, at most 20. Pure. */
export function planLines(text) {
  return String(text || '').split(/\n+/).map(x => x.replace(/^[-*•]\s*/, '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 20);
}
const clock = iso => iso ? new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase() : '';

/** The sheet with the plan box. onSaved(row) runs after the worker said yes. */
export function openPlan(ctx, me, onSaved) {
  const box = h('textarea', { class: 'lx-input', rows: 7, style: { height: 'auto', minHeight: '160px', padding: '10px 12px', resize: 'vertical' },
    placeholder: 'One thing per line.\nNorthlake Golf: brief batch 16\nHarbor & Pine: recut the best video', 'aria-label': 'Your plan for today' });
  if (me && me.items && me.items.length) box.value = me.items.join('\n');
  const save = button('Post my plan', { primary: true, onclick: async () => {
    const lines = planLines(box.value);
    if (!lines.length) { box.focus(); return toast('Write at least one thing for today.'); }
    if (ctx.sample) { s.close(); return toast('Sample numbers: nothing is saved.'); }
    save.disabled = true;
    try {
      const r = await ctx.api('/api/mywork/plan', { worker: 'ah', method: 'POST', body: { text: lines.join('\n') } });
      s.close(); toast('Your plan is in.'); onSaved && onSaved(r && r.row);
    } catch (e) { save.disabled = false; toast('Could not post it: ' + e.message, { tone: 'bad', ms: 5000 }); }
  } });
  const s = sheet({ title: 'Your plan for today', side: 'center', body: h('div', { class: 'lx-md-form', style: { display: 'grid', gap: '14px' } },
    h('p', { class: 'lx-md-quiet' }, 'What you are working on today, one thing per line. It goes on the team check-in, the same as Post my plan in Slack.'),
    box, save) });
  setTimeout(() => box.focus(), 30);
}

/** "I'm out today" for someone on the list: the real write, so it asks first (the whole team sees it on the check-in).
 *  A mis-tap is undone by posting a plan (planFromLocus clears out). onSaved(row) after the yes. */
export function postOut(ctx, onSaved) {
  if (ctx.sample) return toast('Sample numbers: nothing is saved.');
  const yes = button("Yes, I'm out today", { primary: true, onclick: async () => {
    yes.disabled = true;
    try { const r = await ctx.api('/api/mywork/plan', { worker: 'ah', method: 'POST', body: { out: true } }); s.close(); toast('Marked out today. The team sees it on the check-in.'); onSaved && onSaved(r && r.row); }
    catch (e) { yes.disabled = false; toast('Could not mark you out: ' + e.message, { tone: 'bad', ms: 5000 }); }
  } });
  const s = sheet({ title: 'Out today?', side: 'center', body: h('div', { class: 'lx-md-form', style: { display: 'grid', gap: '14px' } },
    h('p', { class: 'lx-md-quiet' }, 'The team sees "out today" on the check-in, in Slack too. If you are working after all, post your plan and it replaces this.'),
    h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, yes, button('Cancel', { ghost: true, onclick: () => s.close() }))) });
}

/** The band at the top of the lists: my plan as posted, or the button to post it. Null when I am not on the list. */
export function planBand(ctx, board, redraw, hasNudge = false) {
  const me = mine(board);
  if (!me || (board.weekend && me.state === 'none')) return null;
  const set = row => { if (row) Object.assign(me, row); redraw(); };
  /* out: a plan posted here takes it back (planFromLocus clears out), so a mis-tap is never stuck */
  if (me.state === 'out') return h('section', { class: 'lx-card lx-md-grp' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
      statusDot('off', 'You are out today.'), h('span', { class: 'lx-sp' }),
      button('Working after all? Post my plan', { ghost: true, onclick: () => openPlan(ctx, me, set) })));
  if (me.state === 'plan') return h('section', { class: 'lx-card lx-md-grp' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
      h('b', null, 'Your plan for today'), statusDot('good', 'posted ' + clock(me.plan && me.plan.at)), h('span', { class: 'lx-sp' }),
      button('Change it', { ghost: true, onclick: () => openPlan(ctx, me, set) })),
    h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px', display: 'grid', gap: '4px' } }, (me.items || []).map(x => h('li', null, x))));
  /* no plan yet: once the "Your plan for today is not in" line is on the list it carries the button; before that
     (early in the morning, before the check-in post is up) this band does */
  return hasNudge ? null : h('section', { class: 'lx-card lx-md-grp' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
      h('b', null, 'Your plan for today'), statusDot('off', 'not posted yet'), h('span', { class: 'lx-sp' }),
      button('Post my plan', { onclick: () => openPlan(ctx, me, set) })));
}
