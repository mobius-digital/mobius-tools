/* Connect your AI > Suggestions from your AI. The cards a connected AI made, each waiting for one tap.
   Nothing here has happened yet: a card is a suggestion until a signed-in person taps Yes.
   Real mode: account-health GET /api/connect-ai/proposals (add ?act=<brand id> in a brand view), and
   POST /api/connect-ai/proposals/decide { id, yes } for the tap.
   A link the AI hands back (?open=aiproposal&id=...&act=...) should open this page; the id in the address marks that card.

   This file lives in profit/v5-next/connect-ai/ until it is moved to profit/v5/pages/connect-ai/ (see README.md);
   the imports are written for that place. */

import { h, put, button, empty, pill, toast, addStyles, em, money } from '../../kit.js';
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
  const list = (data.proposals || []).filter(p => p.status === 'waiting');
  const applies = !!data.applies_on_yes;
  const marked = QS.get('id');
  const brandOf = id => (ctx.brands || []).find(b => b.id === id) || { name: id, currency: 'USD' };
  const host = h('div', { class: 'lx-caip' });

  const tap = async (p, yes, node, btns) => {
    if (ctx.sample) return toast('Sample numbers: nothing is saved.');
    btns.forEach(b => { b.disabled = true; });
    try {
      const r = await ctx.api('/api/connect-ai/proposals/decide', { worker: 'ah', method: 'POST', body: { id: p.id, yes } });
      toast(r.status === 'applied' ? 'Done. The change was made.' : r.status === 'approved' ? 'Marked yes. Make the change on its own page.' : 'Turned down. Nothing changed.');
      node.remove();
      if (!host.querySelector('.lx-caip-card')) paint([]);
    } catch (e) { toast(e.message || 'That did not work. The card is still waiting.', { tone: 'bad' }); btns.forEach(b => { b.disabled = false; }); }
  };

  const one = p => {
    const b = brandOf(p.brand_id);
    const does = applies && p.kind !== 'other';
    const yes = button(does ? 'Yes, do it' : 'Yes', { primary: true }), no = button('No', { ghost: true });
    const node = h('article', { class: 'lx-caip-card' + (marked === p.id ? ' mark' : '') },
      h('div', { class: 'lx-caip-top' }, pill('', KIND[p.kind] || 'Idea'), ctx.brand ? null : h('span', { class: 'lx-cap' }, b.name), h('span', { class: 'lx-sp', style: { flex: 1 } }), h('span', { class: 'lx-caip-by' }, left(p.expires_at))),
      h('h3', null, p.title),
      p.object_name || p.level ? h('div', { class: 'lx-caip-by' }, [p.level ? 'On the ' + (LEVEL[p.level] || p.level) : null, p.object_name].filter(Boolean).join(': ')) : null,
      h('p', { class: 'lx-caip-why' }, p.why),
      p.before || p.after || p.amount != null ? h('div', { class: 'lx-caip-ba' }, p.before ? h('b', null, p.before) : null, p.before && (p.after || p.amount != null) ? 'to' : null,
        h('b', null, p.after || (p.amount != null ? money(p.amount, { cur: b.currency }) + ' a day' : ''))) : null,
      h('div', { class: 'lx-caip-by' }, `Suggested by ${p.proposed_by}'s AI. These are the AI's words, not checked by ${APP_NAME}.`),
      h('div', { class: 'lx-caip-acts' }, yes, no),
      does ? null : h('div', { class: 'lx-caip-by' }, p.kind === 'other' ? 'Yes keeps a note that you agreed. Nothing is changed for you.' : 'Yes keeps a note that you agreed. You make the change on its own page.'));
    yes.onclick = () => tap(p, true, node, [yes, no]);
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
  eyebrow: 'Connect your AI',
  ranges: false,
  async load(ctx) {
    const q = ctx.brand && ctx.brand.id ? '?act=' + encodeURIComponent(ctx.brand.id) : '';
    return ctx.api('/api/connect-ai/proposals' + q, { worker: 'ah', signal: ctx.signal });
  },
  render: draw,
};
