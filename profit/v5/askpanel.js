/* Ask Locus AI, in place. The top bar's "Ask" button, Ctrl K and the phone's Ask tab open this panel on top of the
   page you are on (a centered sheet on desktop, a bottom sheet on a phone), so a question is asked WITH that page:
   the page title, the route, the brand (or every brand) and the dates in the page head go along as `screen`.

     openAskPanel({ route, brand, title, range, href })   opens it. Returns the kit sheet { el, close }.
       route  the current route { view, brand, line, tab }      brand  { id, name } or null (agency view)
       title  the page title as words ("Is the sale on pace?")  range  the page head's dates (ctx.range shape)
       href   the address of the full Ask page ("Open full history")

   The request is the Ask page's own (pages/ask/index.js askOnce: POST /api/ask on account-health, the same body),
   with screen = { screen: <page title>, screen_id: <line/tab>, route, brand_selected, act_id, range, from, to }.
   Answers go into the same per-brand thread the Ask page keeps on this device, so the full page shows them as history.
   Sample mode never calls the server (askOnce answers the example questions from the Ask fixture).
   Nothing here writes anywhere except that thread on this device. */

import { h, button, put, sheet, svgNode } from './kit.js';
import { icon } from './icons.js';
import { AI_NAME } from './config.js';
import { SAMPLE, settingNow, saveSetting, api, fixture } from './data.js';

let open = null;          // one panel at a time

export async function openAskPanel({ route, brand, title, range, href } = {}) {
  if (open) { const f = open.el.querySelector('textarea'); if (f) f.focus(); return open; }
  const mod = await import('./pages/ask/index.js');
  mod.askStyles();
  const ctx = { sample: SAMPLE, brand: brand || null, range: range || null, api };
  const key = mod.threadKey(brand && brand.id);
  let thread = [];
  try { thread = (settingNow(key, []) || []).slice(-12); } catch { thread = []; }
  let sampleAnswers = [];
  if (SAMPLE) { try { const fx = await fixture('ask/_sample/index.json'); sampleAnswers = (fx && fx.answers) || []; } catch {} }

  const pageName = String(title || '').trim() || 'this page';
  const who = brand ? brand.name : 'every brand';
  const when = range && range.label ? range.label + (range.dates ? ' (' + range.dates + ')' : '') : null;
  const screen = {
    screen: pageName, screen_id: route ? route.line + '/' + (route.tab || 'index') : 'ask',
    route: route ? '#/' + [route.view, route.brand, route.line, route.tab || 'index'].join('/') : null,
    brand_selected: brand ? brand.name : 'Agency view (every client)', act_id: brand ? brand.id : null,
    range: range && range.preset, from: range && range.from, to: range && range.to,
  };

  let busy = false;
  const input = h('textarea', { class: 'lx-qa-in lx-ap-in', rows: 2, maxlength: 600, placeholder: 'Ask about this page, or ask for a chart', 'aria-label': 'Your question' });
  const send = button('Ask', { primary: true, iconLeft: 'sparkle', onclick: () => ask(input.value) });
  const status = h('p', { class: 'lx-ap-wait', role: 'status', hidden: true });
  const list = h('div', { class: 'lx-ap-list' });
  const asked = [];         // this panel's answers, newest first
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });

  const goPage = (line, tab) => '#/' + [route.view, route.brand, line, tab || 'index'].map(encodeURIComponent).join('/');
  const cardCtx = { href: route ? goPage : null };
  const paint = () => put(list, asked.map(a => mod.answerCard(a, cardCtx, (q, o) => ask(q, o))));

  async function ask(q, opts = {}) {
    q = String(q || '').trim();
    if (!q || busy) return;
    busy = true; send.disabled = true; input.value = '';
    status.hidden = false; status.textContent = AI_NAME + ' is reading the numbers for ' + who + '. Usually 10 to 40 seconds.';
    const a = await mod.askOnce(ctx, q, { thread, full: opts.full, screen, sampleAnswers });
    thread.push(a); asked.unshift(a);
    try { saveSetting(key, thread.slice(-12).map(t => ({ ...t, chart: t.chart || null }))); } catch {}
    paint();
    busy = false; send.disabled = false; status.hidden = true;
  }

  const tries = brand
    ? ['What changed on this page this week?', 'What should I do first here?', 'Explain these numbers in plain words']
    : ['Which brand needs me first here?', 'What changed on this page this week?', 'Explain these numbers in plain words'];
  const body = h('div', { class: 'lx-ap' },
    h('p', { class: 'lx-ap-ctx' }, svgNode(icon('eye')), h('span', null, 'Asking with this page: ', h('b', null, pageName), ', ', who, when ? ', ' + when : '')),
    h('div', { class: 'lx-ap-row' }, input, send),
    h('div', { class: 'lx-qa-tries' }, h('span', { class: 'lab' }, 'Try'), tries.map(t => h('button', { type: 'button', class: 'lx-qa-try', onclick: () => ask(t) }, t))),
    status, list,
    h('div', { class: 'lx-ap-foot' },
      h('span', null, 'Answers use Triple Whale for sales and ROAS (last platform click) and stay in your Ask history on this device.'),
      href ? h('a', { href, onclick: () => open && open.close() }, 'Open full history', svgNode(icon('arrow'))) : null));

  open = sheet({ title: 'Ask ' + AI_NAME, body, class: 'lx-ap-sheet', onClose: () => { open = null; } });
  return open;
}

/* styles: the panel reuses the Ask page's answer cards (askStyles) and adds its own few lines here */
const CSS = `
.lx-ap{display:grid;gap:14px;min-width:0}
.lx-ap-ctx{display:flex;gap:8px;align-items:flex-start;margin:0;font-size:12.5px;color:var(--muted);line-height:1.45}
.lx-ap-ctx .lx-ic{width:15px;height:15px;margin-top:1px;flex:none}
.lx-ap-ctx b{color:var(--ink-2);font-weight:600}
.lx-ap-row{display:flex;gap:10px;align-items:flex-end}
.lx-ap-in{min-height:52px;font-size:15px;padding:13px 15px}
.lx-ap-row .lx-btn{height:52px;padding:0 20px;border-radius:14px}
.lx-ap-wait{margin:0;font-size:13px;color:var(--muted)}
.lx-ap-list{display:grid;gap:20px;min-width:0}
.lx-ap-list:empty{display:none}
.lx-ap-list .lx-qa-card{padding:16px 18px}
.lx-ap-list .lx-qa-say .w{font-size:14.5px}
.lx-ap-foot{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding-top:12px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}
.lx-ap-foot a{display:inline-flex;gap:6px;align-items:center;font-weight:600;color:var(--ink);text-decoration:none}
.lx-ap-foot a .lx-ic{width:15px;height:15px}
@media (max-width:759px){.lx-ap-row{flex-direction:column;align-items:stretch}.lx-ap-row .lx-btn{height:46px}.lx-ap-in{font-size:16px}}
`;
{ const st = document.createElement('style'); st.id = 'lx-ap-css'; st.textContent = CSS; document.head.append(st); }
