/* Ask > Quick lookups (was "Free answers"). The numbers, dates and statuses the app answers with no AI allowance used.
   Real mode:
     account-health GET  /api/lookups                    the list (and whether quick lookups are switched on)
     account-health POST /api/lookup {question, act}     one quick lookup, written by code from the brand's numbers.
                                                         Asking is the person's own tap, never done on load. It only reads.
     account-health POST /api/ask {question, full:true}  "Ask why": the same question, sent to the full assistant.
   Off by default (the settings key freeLookups on the account-health worker). There is no route for that switch
   that this page may call, so when it is off the page says so in one line, lists what can be looked up, and sends
   nothing: it never shows a switch that does not work.
   Sample mode answers the example questions from the fixture and says so for anything else.
   Nothing here changes an ad account, a store or an email tool. */

import { put } from '../../kit.js';
import { h, card, em, button, addStyles, pill, empty } from '../../kit.js';
import { AI_NAME } from '../../config.js';
import { pageHelp } from '../../defs.js';

const OFF_LINE = 'Quick lookups are switched off, so this was not looked up.';

function draw(el, data, ctx) {
  addStyles('lx-fl-css', CSS);
  const d = data || {};
  const brandName = ctx.brand ? ctx.brand.name : null;
  const list = d.lookups || [];
  let busy = false;

  const input = h('input', { class: 'lx-fl-in', type: 'text', id: 'lxFlIn', maxlength: 260, placeholder: brandName ? 'Revenue yesterday' : 'Revenue yesterday for ' + (((ctx.brands || [])[0] || {}).name || 'a brand'), 'aria-label': 'Your question' });
  const send = button('Look up', { primary: true, onclick: () => ask(input.value) });
  const out = h('div', { class: 'lx-fl-out', role: 'status' });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ask(input.value); } });

  function show(q, r) {
    const a = r || {};
    const lines = String(a.answer || '').split('\n').filter(Boolean);
    /* the worker's text ends with its own link and "ask why" lines; here they are a link and a button */
    const words = lines.filter(l => !/^Open the page: /.test(l) && !/^Want the reasoning/.test(l) && !/^Source: /.test(l));
    const why = h('div', { class: 'lx-fl-why' });
    const whyBtn = a.ask_why ? button(a.lookup ? 'Ask why' : 'Ask ' + AI_NAME, { onclick: () => full(q, why, whyBtn) }) : null;
    put(out, h('section', { class: 'lx-card lx-fl-card' + (a.error ? ' err' : '') },
      h('p', { class: 'lx-fl-q' }, q),
      h('div', { class: 'lx-fl-a' }, words.length ? [h('p', { class: 'lead' }, words[0]), ...words.slice(1).map(w => h('p', null, w))] : h('p', null, a.error || 'No answer came back.')),
      h('div', { class: 'lx-fl-foot' },
        a.lookup ? pill('', 'Quick lookup') : null,
        a.sample ? pill('', 'Sample answer') : null,
        a.sources ? h('span', { class: 'src' }, 'Source: ' + a.sources) : null,
        h('span', { class: 'lx-sp' }),
        a.open && ctx.href ? h('a', { class: 'lx-fl-open', href: ctx.href(a.open.line, a.open.tab) }, a.open.label || 'Open the page') : null,
        whyBtn),
      why));
  }

  async function full(q, host, btn) {
    if (busy) return;
    if (ctx.sample) { put(host, h('p', { class: 'lx-foot' }, 'In sample mode ' + AI_NAME + ' is not called. Signed in, this sends the same question to the full assistant, which uses the AI allowance.')); return; }
    busy = true; btn.disabled = true;
    put(host, h('p', { class: 'lx-foot' }, AI_NAME + ' is reading the numbers. Usually 10 to 40 seconds.'));
    try {
      const screen = { screen: 'Free answers', screen_id: 'ask', brand_selected: brandName || 'Agency view (every client)', act_id: ctx.brand ? ctx.brand.id : null };
      const r = await ctx.api('/api/ask', { worker: 'ah', method: 'POST', body: { question: q, full: true, history: [], runId: Math.random().toString(36).slice(2, 10), screen } });
      put(host, h('p', { class: 'by' }, AI_NAME), ...String(r.answer || r.error || '').replace(/```chart[\s\S]*?```/g, '').split(/\n{2,}/).filter(Boolean).map(p => h('p', null, p)));
    } catch (e) { put(host, h('p', { class: 'lx-foot' }, 'That one did not come back: ' + (e && e.message || 'no answer') + '.')); }
    busy = false; btn.disabled = false;
  }

  async function ask(q) {
    q = String(q || '').trim();
    if (!q || busy) return;
    if (d.on === false) return show(q, { answer: OFF_LINE, ask_why: true });
    busy = true; send.disabled = true;
    put(out, h('p', { class: 'lx-foot' }, 'Reading the numbers...'));
    let r;
    if (ctx.sample) {
      const hit = (d.answers || []).find(s => s.q.toLowerCase() === q.toLowerCase());
      r = hit ? { ...hit, sample: true } : { answer: 'In sample mode only the example questions answer. Signed in, this reads ' + (brandName || 'the brand') + "'s own numbers.", sample: true };
    } else {
      try { r = await ctx.api('/api/lookup', { worker: 'ah', method: 'POST', body: { question: q, act: ctx.brand ? ctx.brand.id : null } }); }
      catch (e) { r = { error: e && e.status === 403 ? 'Quick lookups are not switched on yet. Ask ' + AI_NAME + ' instead.' : 'That one did not come back: ' + (e && e.message || 'no answer') + '.' }; }
    }
    busy = false; send.disabled = false;
    show(q, r);
  }

  const box = h('section', { class: 'lx-hero line lx-fl-hero' },
    h('label', { class: 'lx-cap', for: 'lxFlIn' }, 'Look up a number, date or status' + (brandName ? ' for ' + brandName : '')),
    h('div', { class: 'lx-fl-row' }, input, send),
    d.on === false
      ? h('p', { class: 'lx-fl-off', role: 'note' }, h('b', null, 'Quick lookups are switched off.'), ' There is no switch on this page yet: they are turned on in the server settings. Until then every question goes to ' + AI_NAME + '. The list below shows what you will be able to look up.')
      : h('p', { class: 'lx-fl-def' }, 'Instant answers read straight from your numbers. No AI, so they do not use the AI allowance.'),
    out);

  const rowsEl = list.length ? h('div', { class: 'lx-rows lx-fl-list' }, list.map(l => h('button', { type: 'button', onclick: () => { input.value = l.example; ask(l.example); } },
    h('span', { class: 't' }, l.title), h('span', { class: 'ex' }, l.example)))) : empty({ title: 'The list could not be read', text: 'Try again in a minute. You can still ask ' + AI_NAME + ' on the Ask tab.', action: button('Open Ask', { href: ctx.href('ask', 'index') }) });

  const s = d.share;
  const help = h('div', { class: 'lx-fl-bar' }, pageHelp({ body: [
    { title: 'What it is for', text: 'Quick lookups: a number, date or status read straight from your numbers by code, in one line. No AI, so they do not use the AI allowance and you can ask as often as you like. Anything that needs judgment, a plan or a change goes to ' + AI_NAME + ': press Ask why on an answer.' },
    { title: 'Where the numbers come from', text: [d.revenue || '', 'Sales and ROAS for a platform are Triple Whale, last platform click.'].filter(Boolean).join(' ') },
  ] }));
  const split = s && s.share_pct != null ? 'Last ' + s.days + ' days: ' + s.lookups + ' quick lookups, ' + s.assistant + ' to ' + AI_NAME : '';
  put(el, h('div', { class: 'lx-fl' }, help, box,
    card({ title: 'What you can look up', note: [list.length ? list.length + ' kinds of question' : '', split].filter(Boolean).join('. '), flush: true }, rowsEl)));
}

const CSS = `
.lx-fl{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-8);min-width:0}
.lx-fl-hero{grid-template-columns:minmax(0,1fr);gap:12px;padding:var(--pad-card)}
.lx-fl-bar{display:flex;align-items:center;min-height:28px}
.lx-fl-def{margin:0;font-size:12.5px;color:var(--muted)}
.lx-fl-row{display:flex;gap:12px;align-items:stretch}
.lx-fl-in{flex:1;min-width:0;height:44px;padding:0 14px;border:0;border-radius:var(--r-md);background:var(--surface);font:500 var(--fs-body)/1.4 var(--sans);color:var(--ink);box-shadow:0 0 0 1px rgba(28,20,10,.13),0 2px 6px rgba(28,20,10,.05)}
.lx-fl-in::placeholder{color:var(--faint)}
.lx-fl-in:focus{outline:0;box-shadow:0 0 0 1.5px var(--e2),0 0 0 5px rgba(255,122,26,.16)}
.lx-fl-row .lx-btn{height:44px}
.lx-fl-out:empty{display:none}
.lx-fl-off{margin:0;padding:12px 14px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line);font-size:13.5px;line-height:1.5;color:var(--ink-2)}
.lx-fl-off b{color:var(--ink);font-weight:600}
.lx-fl-card{display:grid;grid-template-columns:minmax(0,1fr);gap:14px}
.lx-fl-q{font-size:13px;color:var(--muted);overflow-wrap:anywhere}
.lx-fl-a{display:grid;gap:6px;font-size:14.5px;line-height:1.5;color:var(--ink-2);overflow-wrap:anywhere}
.lx-fl-a .lead{font-size:var(--num-s);font-weight:600;color:var(--ink);letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.lx-fl-card.err .lx-fl-a{color:var(--bad)}
.lx-fl-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--line)}
.lx-fl-foot .src{font-size:12.5px;color:var(--muted)}
.lx-fl-open{font-size:13px;font-weight:600;color:var(--ink);text-decoration:none}
.lx-fl-open:hover{text-decoration:underline}
.lx-fl-why:empty{display:none}
.lx-fl-why{display:grid;gap:8px;font-size:15px;line-height:1.5;color:var(--ink-2);padding-top:14px;border-top:1px solid var(--line)}
.lx-fl-why .by{font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--brand-ink)}
.lx-fl-list>button{display:flex;gap:16px;align-items:baseline;width:100%;border:0;border-top:1px solid var(--line);background:transparent;cursor:pointer;padding:13px 28px;text-align:left;font-size:14px;color:var(--ink)}
.lx-fl-list>button:first-child{border-top:0}
.lx-fl-list>button:hover{background:var(--row-hover)}
.lx-fl-list .t{flex:none;width:min(280px,42%);font-weight:600}
.lx-fl-list .ex{flex:1;min-width:0;color:var(--muted);overflow-wrap:anywhere}
@media (max-width:759px){
  .lx-fl-hero{padding:20px 18px}
  .lx-fl-row{flex-direction:column}
  .lx-fl-row .lx-btn{height:48px}
  .lx-fl-in{height:48px;font-size:16px}
  .lx-fl-card{padding:20px 18px}
  .lx-fl-list>button{flex-direction:column;gap:2px;padding:12px 18px}
  .lx-fl-list .t{width:auto}
}
`;

export default {
  title: ['Quick ', em('lookups')],
  eyebrow: ctx => (ctx.brand ? ctx.brand.name : 'Every brand'),
  ranges: false,
  stamp: false,                  /* a form or a conversation, not numbers: no "updated" stamp in the head */
  async load(ctx) {
    const r = await ctx.api('/api/lookups', { worker: 'ah', signal: ctx.signal }).catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    return r ? { on: !!r.on, lookups: r.lookups || [], revenue: r.revenue || '', share: r.share || null } : { on: null, lookups: [] };
  },
  render: draw,
};
