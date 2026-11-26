/* Ask Locus AI, docked. The top bar's "Ask" button, Ctrl K, the phone's Ask tab and any page's "Ask why" button open
   this panel on the right side of the page (420px, like Triple Whale's Moby), so a question is asked WITH the page:
     1280px and wider   the page narrows to make room (body.lx-ask-on gives the shell a right padding); nothing is covered
     under 1280px       it lies over the page from the right
     phone (under 760)  a bottom sheet with a dimmed page behind it (a tap on it closes the panel)
   It stays open while the person moves from page to page and follows them: the header always names the page on screen.

     openAskPanel({ route, brand, title, range, href, context, live })   opens it (or focuses it). Returns { el, close }.
       route    the current route { view, brand, line, tab }      brand  { id, name } or null (agency view)
       title    the page title as words ("Is the sale on pace?")  range  the page head's dates (ctx.range shape)
       href     the address of the full Ask page ("Open full history")
       context  a short plain summary of what the page shows (see ctx.askContext below)
       live     () => the same object for the page on screen now (the shell passes it, so the panel follows the
                person). Pages calling openAskPanel themselves can leave it out.
     closeAskPanel()   closes it.

   ctx.askContext (for page authors): a page may set ctx.askContext = 'MER 2.1x Nov 1 to 25 against a 2.5x goal; two
   campaigns under break-even since 8am.' in its render. One or two plain sentences of what is on screen now, no
   client names beyond the brand on screen. It goes with every question asked while that page is open, as
   screen.page_summary. Leave it unset and only the title, route, brand and dates go.
   ctx.askWindow (string): the real window of the page's numbers ("Nov 17 to 23"). When set it replaces the head's
   dates on the context line and goes as screen.window. A page with ranges: false sends no dates at all.

   The request is the Ask page's own (pages/ask/index.js askOnce: POST /api/ask on account-health, the same body),
   with screen = { screen: <page title>, screen_id: <line/tab>, route, brand_selected, act_id, range, from, to,
   page_summary }. Answers go into the same per-brand thread the Ask page keeps on this device, so the full page
   shows them as history. Sample mode never calls the server (askOnce answers from the Ask fixture).
   Nothing here writes anywhere except that thread on this device. */

import { h, button, put, svgNode } from './kit.js';
import { icon } from './icons.js';
import { AI_NAME } from './config.js';
import { SAMPLE, settingNow, saveSetting, api, fixture } from './data.js';
import { askContextNow } from './shell.js';

let open = null;          // one panel: { el, close, input, refresh }

/* suggested questions for the page on screen, by menu line; a page with none gets the general three */
const SUGGEST = {
  'a-black-friday': ['Which brand needs a move first?', 'Why is a store under break-even?', 'What changed since the last check-in?'],
  'black-friday': ['Should we raise the budget now?', 'Which campaign is pulling the MER down?', 'What changed since the last check-in?'],
  home: ['How is this month going against the goal?', 'What should I look at first today?', 'Why did MER move this week?'],
  meta: ['Which ads should we scale?', 'Which ads are wasting spend?', 'Why did Meta ROAS drop?'],
  reports: ['Sum up this report in three lines', 'What should we tell the client?', 'What changed from the week before?'],
  website: ['Which landing page loses the most people?', 'Where do the ads send traffic?', 'What should we fix on the site first?'],
  'a-today': ['Which brand needs me first?', 'What changed across brands this week?', 'Who is under goal?'],
};
const general = brand => brand
  ? ['What changed on this page this week?', 'What should I do first here?', 'Explain these numbers in plain words']
  : ['Which brand needs me first here?', 'What changed on this page this week?', 'Explain these numbers in plain words'];

export function closeAskPanel() { if (open) open.close(); }

export async function openAskPanel(opts = {}) {
  if (open) { open.refresh(opts); open.input.focus(); return open; }
  const mod = await import('./pages/ask/index.js');
  if (open) { open.refresh(opts); open.input.focus(); return open; }
  mod.askStyles();
  let cur = { ...opts, live: opts.live || askContextNow };
  const now = () => { const l = cur.live ? cur.live() : null; return l ? { ...l, live: cur.live, title: cur.pinnedTitle || l.title } : cur; };
  let sampleAnswers = [];
  if (SAMPLE) { try { const fx = await fixture('ask/_sample/index.json'); sampleAnswers = (fx && fx.answers) || []; } catch {} }

  let busy = false;
  const input = h('textarea', { class: 'lx-input lx-qa-in', id: 'lxAskDockIn', rows: 1, maxlength: 600, placeholder: 'Ask about this page', 'aria-label': 'Your question' });
  const send = button('Ask', { primary: true, iconLeft: 'sparkle', onclick: () => ask(input.value) });
  const status = h('p', { class: 'lx-ap-wait', role: 'status', hidden: true });
  const list = h('div', { class: 'lx-ap-list' });
  const sub = h('span');
  const ctxLine = h('p', { class: 'lx-ap-ctx' });
  const sug = h('div', { class: 'lx-ad-sug' });
  const histLink = h('a', { href: '#', onclick: () => {} }, 'Open full history', svgNode(icon('arrow')));
  const asked = [];         // this panel's answers, newest first
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; });

  const pageName = c => String(c.title || '').trim() || 'this page';
  const whoOf = c => c.brand ? c.brand.name : 'every brand';
  function screenOf(c) {
    const r = c.route, range = c.range;
    return {
      screen: pageName(c), screen_id: r ? r.line + '/' + (r.tab || 'index') : 'ask',
      route: r ? '#/' + [r.view, r.brand, r.line, r.tab || 'index'].join('/') : null,
      brand_selected: c.brand ? c.brand.name : 'Agency view (every client)', act_id: c.brand ? c.brand.id : null,
      range: range && range.preset, from: range && range.from, to: range && range.to,
      window: c.window || null, page_summary: c.context || null,
    };
  }
  function paintHead() {
    const c = now();
    sub.textContent = ' · about ' + pageName(c);
    /* the page's own data window (ctx.askWindow) wins over the head's dates; a page with no dates (ranges: false) says none */
    const when = c.window ? String(c.window) : c.range && c.range.label ? c.range.label + (c.range.dates && c.range.dates !== c.range.label ? ' (' + c.range.dates + ')' : '') : null;
    put(ctxLine, svgNode(icon('eye')), h('span', null, 'Asking with this page: ', h('b', null, pageName(c)), ', ', whoOf(c), when ? ', ' + when : '', c.context ? '. ' + c.context : ''));
    const tries = (c.route && SUGGEST[c.route.line]) || general(c.brand);
    put(sug, h('span', { class: 'lab' }, 'Try asking'), tries.map(t => h('button', { type: 'button', onclick: () => ask(t) }, t)));
    histLink.setAttribute('href', c.href || '#/');
  }
  const goPage = (line, tab) => { const r = now().route; return r ? '#/' + [r.view, r.brand, line, tab || 'index'].map(encodeURIComponent).join('/') : '#/'; };
  const paint = () => put(list, asked.map(a => mod.answerCard(a, { href: goPage }, (q, o) => ask(q, o))));

  async function ask(q, o = {}) {
    q = String(q || '').trim();
    if (!q || busy) return;
    const c = now();
    const ctx = { sample: SAMPLE, brand: c.brand || null, range: c.range || null, api };
    const key = mod.threadKey(c.brand && c.brand.id);
    let thread = [];
    try { thread = (settingNow(key, []) || []).slice(-12); } catch { thread = []; }
    busy = true; send.disabled = true; input.value = ''; input.style.height = '';
    status.hidden = false; status.textContent = AI_NAME + ' is reading the numbers for ' + whoOf(c) + '. Usually 10 to 40 seconds.';
    const a = await mod.askOnce(ctx, q, { thread, full: o.full, screen: screenOf(c), sampleAnswers });
    thread.push(a); asked.unshift(a);
    try { saveSetting(key, thread.slice(-12).map(t => ({ ...t, chart: t.chart || null }))); } catch {}
    paint();
    busy = false; send.disabled = false; status.hidden = true;
    if (el.isConnected) body.scrollTop = 0;
  }

  const closeBtn = h('button', { class: 'lx-btn ghost icon', type: 'button', 'aria-label': 'Close ' + AI_NAME, title: 'Close (Esc)', onclick: () => close() }, svgNode(icon('close')));
  const body = h('div', { class: 'lx-ad-b' }, ctxLine, sug, status, list);
  const el = h('aside', { class: 'lx-askdock', role: 'complementary', 'aria-label': 'Ask ' + AI_NAME, tabindex: '-1' },
    h('div', { class: 'lx-ad-h' }, h('span', { class: 'lx-gem' }, svgNode(icon('sparkle'))),
      h('div', { class: 't' }, h('b', null, 'Ask ' + AI_NAME), sub), closeBtn),
    body,
    h('div', { class: 'lx-ad-f' }, h('div', { class: 'lx-ap-row' }, input, send),
      h('div', { class: 'lx-ad-links' }, h('span', null, 'Sales and ROAS are Triple Whale, last click.'), histLink)));
  const scrim = h('div', { class: 'lx-ad-scrim', onclick: () => close() });

  const key = e => { if (e.key === 'Escape' && el.contains(document.activeElement) && !document.querySelector('body > .lx-overlay')) { e.preventDefault(); close(); } };
  /* follow the person: after a route change the page sets its title a moment later, so read it twice */
  let tA = 0, tB = 0;
  const onRoute = () => { if (cur.pinnedTitle) cur.pinnedTitle = null; clearTimeout(tA); clearTimeout(tB); tA = setTimeout(paintHead, 250); tB = setTimeout(paintHead, 1200); };
  function close() {
    if (!open) return;
    document.removeEventListener('keydown', key); window.removeEventListener('hashchange', onRoute);
    clearTimeout(tA); clearTimeout(tB);
    el.remove(); scrim.remove(); document.body.classList.remove('lx-ask-on');
    open = null;
    window.dispatchEvent(new Event('resize'));       // charts redraw at the wider page
  }
  function refresh(o2 = {}) {
    cur = { ...cur, ...o2, live: o2.live || cur.live || askContextNow };
    /* a page's own "Ask why" button names its question as the title: keep it until the person moves on */
    cur.pinnedTitle = o2.live ? null : (o2.title || null);
    paintHead();
  }
  histLink.addEventListener('click', () => { if (window.matchMedia && window.matchMedia('(max-width:1279px)').matches) close(); });

  document.addEventListener('keydown', key);
  window.addEventListener('hashchange', onRoute);
  document.body.append(scrim, el);
  document.body.classList.add('lx-ask-on');
  open = { el, close, input, refresh };
  refresh(opts);
  window.dispatchEvent(new Event('resize'));
  requestAnimationFrame(() => { try { input.focus({ preventScroll: true }); } catch {} });
  return open;
}

/* styles: the panel reuses the Ask page's answer cards (askStyles) and adds its own few lines here; the dock itself
   (position, widths, the phone sheet) is in app.css section 17 */
const CSS = `
.lx-ap-ctx{display:flex;gap:8px;align-items:flex-start;margin:0;font-size:12.5px;color:var(--muted);line-height:1.45}
.lx-ap-ctx .lx-ic{width:15px;height:15px;margin-top:1px;flex:none}
.lx-ap-ctx b{color:var(--ink-2);font-weight:600}
.lx-ap-wait{margin:0;font-size:13px;color:var(--muted)}
.lx-ap-list{display:grid;gap:16px;min-width:0}
.lx-ap-list:empty{display:none}
.lx-ap-list .lx-qa-card{padding:14px 16px}
.lx-ap-list .lx-qa-say .w{font-size:14px}
`;
{ const st = document.createElement('style'); st.id = 'lx-ap-css'; st.textContent = CSS; document.head.append(st); }
