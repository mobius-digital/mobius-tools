/* Your profile > AI suggestions. The cards a connected AI made, each waiting for one tap.
   Nothing here has happened yet: a card is a suggestion until a signed-in person taps Yes.
   Real mode: account-health GET /api/connect-ai/proposals (add ?act=<brand id> in a brand view), and
   POST /api/connect-ai/proposals/decide { id, yes } for the tap.
   When a yes makes the change (applies_on_yes), the words on the card are still only the AI's. So Yes first asks
   POST /api/connect-ai/proposals/check { id }, which reads the real name and the real before and after from Meta,
   and shows them in a sheet. The yes in that sheet sends back what was shown ({ expect, big }); the worker refuses
   a yes that does not carry it. A login that can only look (can_act false) gets no buttons.
   A link the AI hands back (?open=aiproposal&id=...&act=...) opens this page (app.js); the id in the address marks that card.
   With Connect your AI switched off the route answers { on: false, proposals: [] } and the page says so in one line. */

import { h, put, button, empty, pill, toast, sheet, field, addStyles, em, money } from '../../kit.js';
import { APP_NAME, QS } from '../../config.js';

const CSS = `
.lx-caip{display:grid;gap:var(--sp-5)}
.lx-caip-lede{font-size:14.5px;line-height:1.5;color:var(--ink-2);max-width:66ch;margin:0}
.lx-caip-card{display:grid;gap:var(--sp-3);padding:var(--sp-6);border-radius:var(--r-xl);background:#fff;box-shadow:var(--sh-1)}
.lx-caip-card.mark{box-shadow:var(--sh-2),0 0 0 2px var(--brand)}
.lx-caip-top{display:flex;gap:var(--sp-3);align-items:center;flex-wrap:wrap}
.lx-caip-card h3{margin:0;font-size:17px;line-height:1.3;font-weight:600;color:var(--ink)}
.lx-caip-why{margin:0;color:var(--ink-2);line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.lx-caip-ba{display:flex;gap:var(--sp-3);align-items:center;flex-wrap:wrap;font-size:13.5px;color:var(--ink-2)}
.lx-caip-ba b{padding:4px 10px;border-radius:999px;background:var(--band);font-weight:500;color:var(--ink)}
.lx-caip-by{font-size:12.5px;color:var(--muted)}
.lx-caip-acts{display:flex;gap:var(--sp-3);flex-wrap:wrap;margin-top:var(--sp-2)}
.lx-caip-real{display:grid;gap:var(--sp-4)}
.lx-caip-real p{margin:0;color:var(--ink-2);line-height:1.5}
.lx-caip-real .name{font-size:17px;font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.lx-caip-real .warn{padding:10px 12px;border-radius:var(--r-md);background:var(--band);color:var(--ink);font-weight:500}
@media (max-width:640px){.lx-caip-acts .lx-btn{flex:1}}
`;

const KIND = { pause: 'Turn off', resume: 'Turn on', budget: 'New daily budget', other: 'Idea' };
const LEVEL = { campaign: 'campaign', adset: 'ad set', ad: 'ad' };
function left(iso) {
  const ms = new Date(iso) - Date.now();
  if (!(ms > 0)) return 'Out of time';
  const hrs = Math.floor(ms / 3600e3);
  if (hrs > 24) return 'Waiting';
  return hrs >= 1 ? `${hrs} ${hrs === 1 ? 'hour' : 'hours'} left` : `${Math.max(1, Math.round(ms / 60e3))} min left`;
}

function draw(el, data, ctx) {
  addStyles('lx-caip-css', CSS);
  data = data || {};
  if (data.on === false) {
    return put(el, h('div', { class: 'lx-caip' }, empty({ title: 'Connect your AI is switched off', text: 'No AI is connected to this workspace, so there are no cards. The switch is on the Connect your AI tab.',
      action: button('Open Connect your AI', { href: ctx.href('profile', 'connect-ai') }) })));
  }
  const list = (data.proposals || []).filter(p => p.status === 'waiting');
  const applies = !!data.applies_on_yes;
  const marked = QS.get('id');
  const brandOf = id => (ctx.brands || []).find(b => b.id === id) || { name: id, currency: 'USD' };
  const host = h('div', { class: 'lx-caip' });

  const can = data.can_act !== false;
  const team = !data.you || data.you.role !== 'client';
  const say = r => toast(r.status === 'applied' ? 'Done. The change was made.' : r.status === 'approved' ? 'Marked yes. Make the change on its own page.' : 'Turned down. Nothing changed.');
  const gone = node => { node.remove(); if (!host.querySelector('.lx-caip-card')) paint([]); };

  const tap = async (p, yes, node, btns) => {
    if (ctx.sample) return toast('Sample numbers: nothing is saved.');
    btns.forEach(b => { b.disabled = true; });
    try {
      say(await ctx.api('/api/connect-ai/proposals/decide', { worker: 'ah', method: 'POST', body: { id: p.id, yes } }));
      gone(node);
    } catch (e) { toast(e.message || 'That did not work. The card is still waiting.', { tone: 'bad' }); btns.forEach(b => { b.disabled = false; }); }
  };

  /* How Meta has it now and how it would be after, in plain words. Budgets come from Meta in cents. */
  const shown = (fieldName, v, cur) => /_budget$/.test(fieldName) ? money((+v || 0) / 100, { cur }) + (/^daily/.test(fieldName) ? ' a day' : ' in total')
    : fieldName === 'status' ? (v === 'ACTIVE' ? 'On' : v === 'PAUSED' ? 'Off' : String(v)) : String(v);

  /* A yes that makes the change: read the real thing from Meta first, and say yes to THAT. */
  const yesForReal = async (p, node, btns) => {
    if (ctx.sample) return toast('Sample numbers: nothing is saved.');
    btns.forEach(b => { b.disabled = true; });
    const back = () => btns.forEach(b => { b.disabled = false; });
    let r;
    try { r = await ctx.api('/api/connect-ai/proposals/check', { worker: 'ah', method: 'POST', body: { id: p.id } }); }
    catch (e) { toast(e.message || 'That did not work. The card is still waiting.', { tone: 'bad' }); return back(); }
    if (!r.applies) { back(); return tap(p, true, node, btns); }
    const real = r.real, cur = brandOf(p.brand_id).currency;
    const note = team ? field({ label: 'Note for the client (optional)', hint: 'Your own words. It shows on their Updates page.', maxlength: 600 }) : null;
    const go = button(real.big ? 'Yes, make this big change' : 'Yes, make this change', { primary: true }), stop = button('Go back', { ghost: true });
    let done = false;
    const box = sheet({ title: 'Check before you say yes', side: 'center', onClose: () => { if (!done) back(); }, body: h('div', { class: 'lx-caip-real' },
      h('p', null, 'This is read from Meta just now. It is not your AI\'s words.'),
      h('div', null, h('div', { class: 'lx-caip-by' }, 'This will change the ' + (LEVEL[real.level] || real.level || 'item')), h('div', { class: 'name' }, real.name || p.object_id)),
      real.name_differs ? h('p', { class: 'warn' }, `Your AI called it "${real.ai_name}". That is not its name in Meta. Make sure this is the one you mean.`) : null,
      real.level_differs ? h('p', { class: 'warn' }, `Your AI said this was the ${LEVEL[p.level] || p.level}. In Meta it is the ${LEVEL[real.level] || real.level}.`) : null,
      (real.step || []).map(x => h('div', { class: 'lx-caip-ba' }, h('b', null, shown(x.field, x.from, cur)), 'to', h('b', null, shown(x.field, x.to, cur)))),
      real.big ? h('p', { class: 'warn' }, real.change_pct != null ? `This moves the budget by ${Math.abs(real.change_pct)}% in one step. More than half at once is a big change.` : 'This is a big budget change in one step.') : null,
      real.also ? h('p', null, real.also) : null,
      note,
      h('div', { class: 'lx-caip-acts', style: { justifyContent: 'flex-end' } }, stop, go)) });
    stop.onclick = () => box.close();
    go.onclick = async () => {
      go.disabled = stop.disabled = true;
      try {
        const out = await ctx.api('/api/connect-ai/proposals/decide', { worker: 'ah', method: 'POST', body: { id: p.id, yes: true, expect: real.before, ...(real.big ? { big: true } : {}), ...(note && note.input.value.trim() ? { client_why: note.input.value.trim() } : {}) } });
        done = true; box.close(); say(out); gone(node);
      } catch (e) { toast(e.message || 'That did not work. Nothing was changed.', { tone: 'bad' }); box.close(); }
    };
  };

  const one = p => {
    const b = brandOf(p.brand_id);
    const does = applies && p.kind !== 'other';
    const yes = button(does ? 'Yes, look first' : 'Yes', { primary: true }), no = button('No', { ghost: true });
    /* A budget card always shows the amount the yes would set. The AI's "after" words never stand in for it. */
    const after = p.kind === 'budget' && p.amount != null ? money(p.amount, { cur: b.currency }) + ' a day' : p.after;
    const node = h('article', { class: 'lx-caip-card' + (marked === p.id ? ' mark' : '') },
      h('div', { class: 'lx-caip-top' }, pill('', KIND[p.kind] || 'Idea'), ctx.brand ? null : h('span', { class: 'lx-cap' }, b.name), h('span', { class: 'lx-sp', style: { flex: 1 } }), h('span', { class: 'lx-caip-by' }, left(p.expires_at))),
      h('h3', null, p.title),
      p.object_name || p.level ? h('div', { class: 'lx-caip-by' }, [p.level ? 'On the ' + (LEVEL[p.level] || p.level) : null, p.object_name].filter(Boolean).join(': ')) : null,
      h('p', { class: 'lx-caip-why' }, p.why),
      p.before || after ? h('div', { class: 'lx-caip-ba' }, p.before ? h('b', null, p.before) : null, p.before && after ? 'to' : null, after ? h('b', null, after) : null) : null,
      h('div', { class: 'lx-caip-by' }, `Suggested by ${p.proposed_by}'s AI. These are the AI's words, not checked by ${APP_NAME}.`),
      can ? h('div', { class: 'lx-caip-acts' }, yes, no) : null,
      !can ? h('div', { class: 'lx-caip-by' }, 'You can look here. Yes and No are switched off for your login.')
        : does ? h('div', { class: 'lx-caip-by' }, `Yes shows you the real name and numbers from Meta first. Nothing changes until you say yes there.`)
        : h('div', { class: 'lx-caip-by' }, p.kind === 'other' ? 'Yes keeps a note that you agreed. Nothing is changed for you.' : 'Yes keeps a note that you agreed. You make the change on its own page.'));
    yes.onclick = () => (does ? yesForReal(p, node, [yes, no]) : tap(p, true, node, [yes, no]));
    no.onclick = () => tap(p, false, node, [yes, no]);
    return node;
  };

  const paint = rows => put(host,
    h('p', { class: 'lx-caip-lede' }, 'Your AI can suggest a change. It cannot make one. Each card waits here for a day, then goes away.'),
    rows.length ? rows.map(one) : empty({ title: 'Nothing is waiting', text: 'When your AI suggests a change, the card shows here for your yes or no.' }));
  paint(list);
  put(el, host);
}

export default {
  title: ['Suggestions from ', em('your AI')],
  eyebrow: 'Your profile',
  ranges: false,
  async load(ctx) {
    const q = ctx.brand && ctx.brand.id ? '?act=' + encodeURIComponent(ctx.brand.id) : '';
    return ctx.api('/api/connect-ai/proposals' + q, { worker: 'ah', signal: ctx.signal });
  },
  render: draw,
};
