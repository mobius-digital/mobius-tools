/* Ask Locus AI, the full page: your history of answers on this device, a question box, and what the team asked lately.
   The place to ask from any page is the Ask panel (top bar button or Ctrl K), which sends that page's context; this
   page keeps the history, and asks too.
   Real mode:
     account-health POST /api/ask {question, history, runId, screen}  the same engine as the chat panel in old Locus.
       The answer is plain sentences, and may end with one ```chart {type, title, unit, labels, series, goal}``` block,
       which is drawn here with the kit chart. Asking is the person's own tap, never done on load.
     account-health GET /api/ask/usage?days=30   the questions asked lately (recent list) and how many today.
   Sample mode answers the example questions from the fixture and says so for anything else.
   The thread on this page is kept on this device, per brand. */

import { put } from '../../kit.js';
import { h, card, em, button, toast, barChart, lineChart, legend, table, money, x, pct, num, relativeTime, addStyles, empty, pill, svgNode } from '../../kit.js';
import { icon } from '../../icons.js';
import { AI_NAME, APP_NAME } from '../../config.js';
import { pageHelp } from '../../defs.js';

const THREAD = id => 'ask.thread.' + (id || 'agency');

/* ---------- the answer's chart ---------- */
/** Split "words ```chart {...}``` words" into the words and the chart spec. */
export function splitChart(text) {
  const s = String(text || '');
  const m = /```chart\s*([\s\S]*?)```/.exec(s);
  if (!m) return { text: s.trim(), chart: null };
  let chart = null;
  try { chart = JSON.parse(m[1]); } catch { chart = null; }
  return { text: (s.slice(0, m.index) + s.slice(m.index + m[0].length)).trim(), chart };
}
const fmtOf = unit => unit === '$' ? (v => money(v, { compact: Math.abs(v) >= 10000 })) : unit === 'x' ? (v => x(v)) : unit === '%' ? (v => num(v, v % 1 ? 1 : 0) + '%') : (v => num(v, v % 1 ? 1 : 0));

function drawChart(c) {
  if (!c || !Array.isArray(c.series) || !c.series.length) return null;
  const f = fmtOf(c.unit), labels = c.labels || [];
  const head = h('div', { class: 'lx-chart-h' }, h('div', null, h('h3', { class: 'lx-qa-ct' }, c.title || ''), c.note && h('p', null, c.note)),
    c.series.length > 1 ? legend(c.series.map((sr, i) => ({ name: sr.name, lead: i === 0, square: c.type === 'bar' }))) : null);
  if (c.type === 'table') {
    const cols = [{ key: 'l', label: '' }, ...c.series.map((sr, i) => ({ key: 's' + i, label: sr.name, num: true, render: r => f(r['s' + i]) }))];
    const rows = labels.map((l, j) => Object.assign({ l }, ...c.series.map((sr, i) => ({ ['s' + i]: sr.values[j] }))));
    return h('div', { class: 'lx-qa-chart' }, head, table({ cols, rows }));
  }
  const extra = c.extra && Array.isArray(c.extra.values) ? c.extra : null;       /* a second figure for the read out (sample only) */
  const hover = i => [h('span', null, labels[i]), ...c.series.map(sr => h('span', null, sr.name + ' ', h('b', null, f(sr.values[i])))), extra && h('span', null, extra.name + ' ', h('b', null, fmtOf(extra.unit)(extra.values[i])))];
  const goal = c.goal != null && isFinite(c.goal) ? { value: +c.goal, label: 'goal ' + f(+c.goal), at: 'end' } : null;
  const chart = c.type === 'line'
    ? lineChart({ series: c.series.map((sr, i) => ({ name: sr.name, values: sr.values, lead: i === 0 })), labels, format: f, goal, height: 260, phoneHeight: 230, hover, label: c.title })
    : c.series.length === 1
      ? barChart({ values: c.series[0].values, labels, lead: 0, format: f, valueLabels: true, height: 260, phoneHeight: 230, goal, hover, label: c.title })
      : lineChart({ series: c.series.map((sr, i) => ({ type: 'bar', name: sr.name, values: sr.values, tone: i ? 'dim' : 'ink' })), labels, format: f, goal, height: 260, hover, label: c.title });
  return h('div', { class: 'lx-qa-chart' }, head, chart);
}

/* ---------- one answer ---------- */
function answerCard(a, ctx, onAgain) {
  const parts = splitChart(a.text);
  const chart = drawChart(a.chart || parts.chart);
  const words = parts.text.split(/\n{2,}/).map(p => h('p', null, boldNumbers(p)));
  return h('article', { class: 'lx-qa-a' + (a.error ? ' err' : '') },
    h('div', { class: 'lx-qa-q' }, h('span', null, a.q)),
    h('section', { class: 'lx-card lx-qa-card' },
      h('div', { class: 'lx-qa-say' }, h('span', { class: 'by' }, a.free ? 'Quick lookup' : AI_NAME), h('div', { class: 'w' }, words)),
      chart,
      h('div', { class: 'lx-qa-foot' },
        a.sources ? h('span', { class: 'src' }, a.sources) : null,
        a.sample ? pill('', 'Sample answer') : null,
        a.free ? pill('', 'Quick lookup') : null,
        h('span', { class: 'lx-sp' }),
        a.open && ctx.href ? h('a', { class: 'lx-qa-open', href: ctx.href(a.open.line, a.open.tab) }, a.open.label) : null,
        /* a quick lookup is one line written by code; "Ask why" sends the same question to the full assistant */
        a.why && !a.error ? button(a.free ? 'Ask why' : 'Ask ' + AI_NAME, { onclick: () => onAgain(a.q, { full: true }) }) : null,
        a.error ? button('Ask again', { onclick: () => onAgain(a.q) }) : null)));
}
/* "$236" and "19%" in an answer read as the figures they are */
function boldNumbers(p) {
  const out = []; let last = 0; const re = /(\$[\d,.]+[kKmM]?|\d+(?:\.\d+)?(?:x|%))/g; let m;
  while ((m = re.exec(p))) { out.push(p.slice(last, m.index), h('b', null, m[0])); last = m.index + m[0].length; }
  out.push(p.slice(last));
  return out;
}

/* ---------- the one request (this page and the Ask panel in the top bar both use it) ---------- */
/** askOnce(ctx, question, { thread, full, screen, sampleAnswers }) : one question to POST /api/ask, as an answer
    object { q, text, chart?, free, why, open, sources, error, sample, at } ready for answerCard().
    ctx needs { sample, brand, range, api }. thread: earlier answers (the last 4 go as history).
    screen: what the person is looking at; it is merged over this page's own screen (the Ask panel sends the page,
    brand, route and dates it was opened on). Sample mode never calls the server: it answers from sampleAnswers. */
export async function askOnce(ctx, q, { thread = [], full = false, screen: extra, sampleAnswers } = {}) {
  q = String(q || '').trim();
  const brandName = ctx.brand ? ctx.brand.name : 'every brand';
  let a;
  if (ctx.sample) {
    const hit = (sampleAnswers || []).find(s => s.q.toLowerCase() === q.toLowerCase());
    a = hit ? { ...hit, sample: true } : { q, text: 'In sample mode ' + AI_NAME + ' only answers the example questions. Signed in, this question goes to the same engine the team uses in Slack and old ' + APP_NAME + ', and reads ' + brandName + "'s own numbers.", sample: true };
  } else {
    try {
      const history = thread.slice(-4).flatMap(t => [{ role: 'user', text: t.q }, { role: 'assistant', text: t.text }]);
      const screen = { screen: 'Ask ' + AI_NAME, screen_id: 'ask', brand_selected: ctx.brand ? ctx.brand.name : 'Agency view (every client)', act_id: ctx.brand ? ctx.brand.id : null, range: ctx.range && ctx.range.preset, ...(extra || {}) };
      const r = await ctx.api('/api/ask', { worker: 'ah', method: 'POST', body: { question: q, history, runId: Math.random().toString(36).slice(2, 10), screen, ...(full ? { full: true } : {}) } });
      /* a quick lookup (switched on in the server settings) comes back with the same keys plus lookup, sources, open and
         ask_why; its text ends with its own link and "ask why" lines, which are a link and a button here */
      const free = !!r.lookup;
      const text = free ? String(r.answer || '').split('\n').filter(l => !/^Open the page: /.test(l) && !/^Want the reasoning/.test(l) && !/^Source: /.test(l)).join('\n').trim() : r.answer || '';
      a = r.error ? { q, text: r.error, error: true } : { q, text, free, why: !!r.ask_why && !full, open: r.open && r.open.line ? r.open : null,
        sources: free && r.sources ? 'Source: ' + r.sources : (r.reports || []).length ? 'Also made a report: ' + r.reports[0].title : null };
    } catch (e) { a = { q, text: 'That one did not come back: ' + (e && e.message || 'no answer') + '.', error: true }; }
  }
  a.at = Date.now();
  return a;
}
/** The key the thread is kept under on this device, per brand (the Ask panel writes to the same thread). */
export const threadKey = THREAD;
/** The answer card and its styles, for the Ask panel. */
export { answerCard };
export const askStyles = () => addStyles('lx-qa-css', CSS);

function draw(el, data, ctx) {
  addStyles('lx-qa-css', CSS);
  const d = data || {};
  const brandName = ctx.brand ? ctx.brand.name : 'every brand';
  let thread = [];
  try { thread = (ctx.settingNow(THREAD(ctx.brand && ctx.brand.id), []) || []).slice(-12); } catch { thread = []; }
  if (ctx.sample && !thread.length && d.first) thread = [{ ...d.first, sample: true }];
  let busy = false;

  const input = h('textarea', { class: 'lx-qa-in', rows: 1, placeholder: 'Ask a question, or ask for a chart', 'aria-label': 'Your question', maxlength: 600 });
  const send = button('Ask', { primary: true, large: true, iconLeft: 'sparkle', onclick: () => ask(input.value) });
  const answers = h('div', { class: 'lx-qa-list' });
  const status = h('p', { class: 'lx-qa-wait', hidden: true, role: 'status' });
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; });

  const paintAnswers = () => put(answers, ...thread.slice().reverse().map(a => answerCard(a, ctx, ask)));
  const keep = () => { try { ctx.saveSetting(THREAD(ctx.brand && ctx.brand.id), thread.slice(-12).map(a => ({ ...a, chart: a.chart || null }))); } catch {} };

  async function ask(q, opts = {}) {
    q = String(q || '').trim();
    if (!q || busy) return;
    busy = true; send.disabled = true; input.value = ''; input.style.height = '';
    status.hidden = false; status.textContent = AI_NAME + ' is reading the numbers for ' + brandName + '. Usually 10 to 40 seconds.';
    const a = await askOnce(ctx, q, { thread, full: opts.full, sampleAnswers: d.answers });
    thread.push(a); keep(); paintAnswers();
    const hist = el.querySelector('.lx-qa-hist'); if (hist && hist.parentNode && hist.parentNode.firstChild !== hist && thread.length === 1) hist.parentNode.insertBefore(hist, hist.parentNode.children[1]);
    busy = false; send.disabled = false; status.hidden = true;
    answers.firstChild && answers.firstChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const chips = (d.suggestions || []).slice(0, 4).map(s => h('button', { type: 'button', class: 'lx-qa-try', onclick: () => ask(s) }, s));
  const box = h('section', { class: 'lx-hero line lx-qa-hero' },
    h('label', { class: 'lx-cap', for: 'lxAskIn' }, 'Ask anything about ' + brandName),
    h('div', { class: 'lx-qa-row' }, Object.assign(input, { id: 'lxAskIn' }), send),
    chips.length ? h('div', { class: 'lx-qa-tries' }, h('span', { class: 'lab' }, 'Try'), chips) : null,
    h('p', { class: 'lx-qa-tip' }, 'Tip: the ', h('b', null, 'Ask ' + AI_NAME), ' button in the top bar (Ctrl K) asks about the page you are on, with its brand and dates.'),
    status);

  const recent = (d.recent || []).slice(0, 6);
  const recentCard = card({ title: 'Asked lately', note: [d.recent_note || 'Newest first', d.usage].filter(Boolean).join('. '), flush: true },
    recent.length ? h('div', { class: 'lx-rows lx-qa-recent' }, recent.map(r => h('button', { type: 'button', title: 'Ask this again', onclick: () => ask(r.q) },
      h('span', { class: 't' }, r.q), r.who ? h('span', { class: 'who' }, r.who) : null, h('span', { class: 'when' }, r.when || (r.at ? relativeTime(r.at) : '')), h('span', { class: 'again' }, 'Ask again')))) : h('div', { class: 'lx-pad' }, h('p', { class: 'lx-foot' }, 'No questions asked here yet.')));

  paintAnswers();
  const help = h('div', { class: 'lx-qa-bar' }, pageHelp({ body: [
    { title: 'What it is for', text: 'Your history of answers from ' + AI_NAME + ', and a box to ask more. To ask about the page you are on, use the Ask ' + AI_NAME + ' button in the top bar (or Ctrl K): it sends that page, its brand and its dates with the question.' },
    { title: 'Where the numbers come from', text: 'Every sale and ROAS in an answer is Triple Whale, last platform click. Store MER is the whole store; ROAS is one platform or campaign.' },
    { title: 'Kept on this device', text: 'Answers here are kept on this device, per brand. Asked lately lists what the team asked in the last 30 days.' },
  ] }));
  /* the history is the point of this page: when there is one, it comes first */
  const history = h('section', { class: 'lx-qa-hist' }, h('div', { class: 'lx-sec' }, h('h3', null, 'History'), h('span', { class: 'note' }, 'Your answers on this device, newest first')), answers);
  put(el, h('div', { class: 'lx-qa' }, help, ...(thread.length ? [history, box] : [box, history]), recentCard));
}

const CSS = `
.lx-qa{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-8);min-width:0}
.lx-qa-hero{grid-template-columns:minmax(0,1fr);gap:12px;padding:var(--pad-card)}
.lx-qa-bar{display:flex;align-items:center;min-height:28px}
.lx-qa-hist{display:grid;gap:12px;min-width:0}
.lx-qa-hist:has(.lx-qa-list:empty){display:none}
.lx-qa-hist>.lx-sec{padding:0}
.lx-qa-tip{margin:0;font-size:12.5px;color:var(--muted)}
.lx-qa-tip b{font-weight:600;color:var(--ink-2)}
.lx-qa-row{display:flex;gap:12px;align-items:flex-end}
.lx-qa-in{flex:1;min-width:0;min-height:44px;max-height:160px;resize:none;padding:11px 14px;border:0;border-radius:var(--r-md);background:var(--surface);font:500 var(--fs-body)/1.45 var(--sans);color:var(--ink);letter-spacing:-.01em;box-shadow:0 0 0 1px rgba(28,20,10,.13),0 2px 6px rgba(28,20,10,.05)}
.lx-qa-in::placeholder{color:var(--faint)}
.lx-qa-in:focus{outline:0;box-shadow:0 0 0 1.5px var(--e2),0 0 0 5px rgba(255,122,26,.16)}
.lx-qa-row .lx-btn{height:44px}
.lx-qa-tries{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.lx-qa-tries .lab{font-size:13px;color:var(--muted);margin-right:2px}
.lx-qa-try{border:0;cursor:pointer;padding:7px 13px;border-radius:999px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-strong);font-size:13px;font-weight:500;color:var(--ink-2);text-align:left;max-width:100%;white-space:normal;line-height:1.35}
.lx-qa-try:hover{background:var(--surface-2);color:var(--ink)}
.lx-qa .lx-sec{flex-wrap:wrap;row-gap:2px}
.lx-qa-wait{font-size:13px;color:var(--muted)}
.lx-qa-list{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-8);min-width:0}
.lx-qa-list:empty{display:none}
.lx-qa-a{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;min-width:0}
.lx-qa-q{display:flex;justify-content:flex-end}
.lx-qa-q span{max-width:min(640px,90%);padding:11px 16px;border-radius:16px 16px 4px 16px;background:var(--ink);color:var(--bg);font-size:14px;font-weight:500;line-height:1.4;overflow-wrap:anywhere}
.lx-qa-card{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--sp-6)}
.lx-qa-say{display:flex;gap:14px;align-items:baseline}
.lx-qa-say .by{flex:none;font-size:11px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--brand-ink)}
.lx-qa-say .w{display:grid;gap:8px;font-size:15px;line-height:1.5;color:var(--ink-2);min-width:0;overflow-wrap:anywhere}
.lx-qa-say b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.lx-qa-a.err .lx-qa-say .w{color:var(--bad)}
.lx-qa-chart{position:relative;min-width:0}
.lx-qa-ct{font-size:14.5px;font-weight:600;letter-spacing:-.01em}
.lx-qa-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--line)}
.lx-qa-foot .src{font-size:12.5px;color:var(--muted)}
.lx-qa-open{font-size:13px;font-weight:600;color:var(--ink);text-decoration:none}
.lx-qa-open:hover{text-decoration:underline;text-underline-offset:3px}
.lx-qa-recent>button{width:100%;border:0;border-top:1px solid var(--line);background:transparent;cursor:pointer;padding:13px 28px;text-align:left;font-size:14px;color:var(--ink)}
.lx-qa-recent>button:first-child{border-top:0}
.lx-qa-recent>button:hover{background:var(--row-hover)}
.lx-qa-recent .t{flex:1;min-width:0;overflow-wrap:anywhere}
.lx-qa-recent .who,.lx-qa-recent .when{flex:none;font-size:12.5px;color:var(--muted);white-space:nowrap}
.lx-qa-recent .again{flex:none;font-size:12.5px;font-weight:600;color:var(--ink-2);white-space:nowrap}
.lx-qa-recent>button:hover .again{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
@media (max-width:759px){
  .lx-qa-hero{padding:20px 18px}
  .lx-qa-row{flex-direction:column;align-items:stretch}
  .lx-qa-row .lx-btn{height:48px}
  .lx-qa-in{font-size:16px}
  .lx-qa-recent .again{display:none}
  .lx-qa-card{padding:20px 18px}
  .lx-qa-tries .lab{width:100%}
  .lx-qa-say{flex-direction:column;gap:6px}
  .lx-qa-say .w{font-size:15px}
  .lx-qa-recent>button{padding:12px 18px}
  .lx-qa-recent .who{display:none}
}
`;

/* the questions worth trying for one brand, or the agency */
function suggestionsFor(ctx) {
  const b = ctx.brand ? ctx.brand.name : null;
  return b ? ['Which products bring customers who come back?', 'Why is the cost per new customer where it is?', 'Which Meta ads bring new customers this week?', 'Is Google worth more budget?']
    : ['Which brands are under their MER goal this month?', 'Where did ad spend move most this week?', 'Which brands need new ads first?', 'Who is behind on Black Friday?'];
}

export default {
  title: ['Ask ', em(AI_NAME)],
  eyebrow: ctx => (ctx.brand ? ctx.brand.name : 'Every brand'),
  ranges: false,
  stamp: false,                  /* a form or a conversation, not numbers: no "updated" stamp in the head */
  async load(ctx) {
    const brandId = ctx.brand ? ctx.brand.id : null, name = ctx.brand ? ctx.brand.name : null;
    const u = await ctx.api('/api/ask/usage?days=30', { worker: 'ah', signal: ctx.signal }).catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
    const mine = r => !brandId || !r.brand || r.brand === brandId || r.brand === name;
    const recent = u && Array.isArray(u.recent) ? u.recent.filter(r => r.question && mine(r)).map(r => ({ q: String(r.question).replace(/^\[ACCESS RULE:[^\]]*\]\s*/, '').slice(0, 160), at: r.at ? Date.parse(r.at) : null, who: r.who ? String(r.who).split('@')[0] : null })) : [];
    const today = new Date().toISOString().slice(0, 10), day = u && (u.by_day || []).find(x => x.day === today);
    return { suggestions: suggestionsFor(ctx), recent, recent_note: 'Asked by the team in the last 30 days', usage: day ? day.answers + (day.answers === 1 ? ' question' : ' questions') + ' asked today' : null };
  },
  render: draw,
};
