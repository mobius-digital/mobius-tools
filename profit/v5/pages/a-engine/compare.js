/* Agency > Engine > Compare. Owner only. Proof without waiting: both engines read the same database, so
   the same question is asked of both at the same moment, as you, and the answers are set side by side.
     the list of calls   the new engine's GET /v1/routes: every read it answers with its own code
     the questions       each read once per brand you can see (or once, when it takes no brand), with the
                         dates in the page head
     the result          match, or the fields that differ. Key order and the engine's own meta do not count.
   Reads only. Nothing is saved anywhere but this page. The misses at the foot are the ones data.js wrote
   down while real pages were open in this browser (engine.js). */
import { h, put, card, button, pill, statusDot, table, toast, em, empty, addStyles, relativeTime } from '../../kit.js';
import { workers, token } from '../../config.js';
import { engineApi, engineUrl, engineMode, differences, ignoreFor, misses, clearMisses } from '../../engine.js';
import { defined } from '../../defs.js';
import { countTiles, look } from '../a-settings/_look.js';

const CSS = `
.ec{display:grid;gap:var(--sp-5)}
.ec .row{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.ec p{margin:0;color:var(--ink-2);font-size:13.5px;max-width:72ch}
.ec select{height:var(--ctl-h);border-radius:11px;border:0;box-shadow:0 0 0 1px var(--line-strong);padding:0 10px;font:inherit;font-size:13px;background:var(--surface);color:var(--ink)}
.ec-d{display:grid;gap:6px;padding:14px 0;border-top:1px solid var(--line)}
.ec-d:first-of-type{border-top:0;padding-top:0}
.ec-d .hd{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13.5px}
.ec-d code,.ec-m code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;overflow-wrap:anywhere}
.ec-f{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr);gap:4px 14px;font-size:12.5px;color:var(--ink-2)}
.ec-f b{font-weight:600;color:var(--ink);overflow-wrap:anywhere}
.ec-f span{overflow-wrap:anywhere}
.ec-f .k{color:var(--muted);font-size:11.5px}
.ec-m{display:grid;gap:8px;font-size:13px}
.ec-m>div{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}
.ec-m small{color:var(--muted)}
@media (max-width:759px){.ec-f{grid-template-columns:minmax(0,1fr)}}`;

/* What the real pages add to a call, so the question is the one a page would ask. */
const EXTRA = {
  '/pw/api/overview': 'cmp=prev', '/pw/api/hub/paid': 'platform=all&cmp=none', '/pw/api/hub/creative': 'model=lastPlatformClick',
  '/pw/api/customers': 'months=6', '/ah/api/activities': 'limit=2000', '/ah/api/ask/usage': 'days=30', '/ah/api/series': 'days=30',
};
const AT_ONCE = 4;
let LAST = null;            // the last run, kept while the app is open

/* Every question to ask: [{ key, which, path, brand }] */
function questions(ctx, routes, brandIds) {
  const out = [];
  const month = ctx.range.to.slice(0, 7);
  for (const r of routes) {
    if (r.method !== 'GET' || r.engine !== 'new' || !/^\/(ah|pw)\//.test(r.path)) continue;
    const spec = (r.input && r.input.query) || {};
    const q = new URLSearchParams(EXTRA[r.path] || '');
    if ('from' in spec && 'to' in spec) { q.set('from', ctx.range.from); q.set('to', ctx.range.to); }
    else if ('days' in spec && !q.has('days')) q.set('days', '30');
    if ('month' in spec) q.set('month', month);
    const which = r.path.startsWith('/ah/') ? 'ah' : 'profit', bare = r.path.slice(3);
    const add = brand => {
      const mine = new URLSearchParams(q);
      if (brand) mine.set('act', brand);
      const qs = mine.toString();
      out.push({ key: 'GET ' + r.path, which, path: bare + (qs ? '?' + qs : ''), brand: brand || '' });
    };
    if (r.brand === 'need') brandIds.forEach(add);
    else if (r.brand === 'opt' && 'act' in spec) add('all');
    else add('');
  }
  return out;
}

async function ask(url, signal) {
  const t = performance.now();
  try {
    const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token() }, signal });
    const json = await res.json().catch(() => undefined);
    return { status: res.status, json, ms: Math.round(performance.now() - t), how: res.headers.get('X-Engine') || '' };
  } catch (e) {
    if (signal && signal.aborted) throw e;
    return { status: 0, json: undefined, ms: Math.round(performance.now() - t), how: '' };
  }
}

/* One question, both engines at the same moment. */
async function pair(c, signal) {
  const [old, now] = await Promise.all([ask(workers()[c.which] + c.path, signal), ask(engineUrl(c.which, c.path), signal)]);
  const base = { ...c, old_status: old.status, new_status: now.status, ms_old: old.ms, ms_new: now.ms, fields: [] };
  if (now.status === 0 || now.json === undefined) return { ...base, state: 'failed', note: now.status === 0 ? 'the new engine could not be reached' : 'the new engine did not answer in JSON' };
  if (old.status === 0) return { ...base, state: 'failed', note: 'the old engine could not be reached' };
  if (now.how === 'fallback') return { ...base, state: 'failed', note: 'the new engine handler broke and the old engine answered' };
  if (now.how && now.how !== 'new') return { ...base, state: 'passed', note: now.how === 'pipe' ? 'the new engine is switched off for everyone' : 'the new engine handed this one to the old engine' };
  const fields = differences(old.json, now.json, ignoreFor(c.key));
  if (old.status !== now.status) fields.unshift({ at: '(status)', old: String(old.status), new: String(now.status) });
  return { ...base, state: fields.length ? 'differs' : 'match', fields: fields.slice(0, 40), more: Math.max(0, fields.length - 40) };
}

async function runAll(list, signal, onStep) {
  const out = new Array(list.length);
  let next = 0, done = 0;
  const worker = async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await pair(list[i], signal);
      onStep(++done, list.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, list.length) }, worker));
  return out;
}

const count = (rows, state) => rows.filter(r => r.state === state).length;
const nameOf = (ctx, id) => (id === 'all' ? 'every brand' : (ctx.brands.find(b => b.id === id) || {}).name || id);
const lastKey = at => (String(at).match(/([A-Za-z_]\w*)(?:\[\d+\])?$/) || [])[1] || '';

function summaryText(ctx, run) {
  const r = run.rows, lines = [];
  lines.push(`Engine compare, ${new Date(run.at).toLocaleString()}, dates ${run.from} to ${run.to}, this browser is on: ${engineMode()}`);
  lines.push(`${r.length} calls: ${count(r, 'match')} match, ${count(r, 'differs')} different, ${count(r, 'failed')} failed, ${count(r, 'passed')} handed to the old engine`);
  for (const x of r.filter(v => v.state === 'differs' || v.state === 'failed')) {
    lines.push(`\n${x.state.toUpperCase()} ${x.key}${x.brand ? ' (' + x.brand + ')' : ''}  ${x.path}  old ${x.old_status} in ${x.ms_old} ms, new ${x.new_status} in ${x.ms_new} ms${x.note ? '  ' + x.note : ''}`);
    for (const f of x.fields) lines.push(`  ${f.at}: old ${f.old} | new ${f.new}`);
    if (x.more) lines.push(`  and ${x.more} more fields`);
  }
  const slow = [...r].sort((a, b) => b.ms_new - a.ms_new).slice(0, 8);
  lines.push('\nSlowest on the new engine:');
  for (const x of slow) lines.push(`  ${x.ms_new} ms (old ${x.ms_old} ms)  ${x.key}${x.brand ? ' (' + x.brand + ')' : ''}`);
  const m = misses();
  lines.push(`\nMisses written down in real use: ${m.length}`);
  for (const x of m.slice(0, 40)) lines.push(`  ${new Date(x.at).toLocaleString()}  ${x.kind}  ${x.key}  ${x.status || ''}  ${x.note || ''}${x.fields ? '  ' + x.fields.join(', ') : ''}`);
  return lines.join('\n');
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch { toast('Could not copy here. Select the text on the page instead.', { tone: 'bad', ms: 5000 }); }
}

function problemCard(ctx, run) {
  const bad = run.rows.filter(r => r.state === 'differs' || r.state === 'failed');
  if (!bad.length) return card({ title: 'Different or failed' }, statusDot('good', 'Nothing. Every answer the new engine gave matched the old one.'));
  const one = r => h('div', { class: 'ec-d' },
    h('div', { class: 'hd' }, pill(r.state === 'failed' ? 'bad' : 'warn', r.state === 'failed' ? 'Failed' : `${r.fields.length + (r.more || 0)} fields differ`),
      h('code', null, r.key), r.brand ? h('span', null, nameOf(ctx, r.brand)) : null, h('small', null, `old ${r.old_status}, new ${r.new_status}`)),
    r.note ? h('p', null, r.note) : null,
    r.fields.length ? h('div', { class: 'ec-f' }, h('span', { class: 'k' }, 'Field'), h('span', { class: 'k' }, 'Old engine'), h('span', { class: 'k' }, 'New engine'),
      r.fields.slice(0, 8).map(f => [defined(h('b', null, f.at), lastKey(f.at)), h('span', null, f.old), h('span', null, f.new)])) : null,
    r.fields.length + (r.more || 0) > 8 ? h('small', null, `and ${r.fields.length + (r.more || 0) - 8} more. The copied summary lists up to 40.`) : null);
  return card({ title: 'Different or failed', note: `${bad.length} calls` }, bad.slice(0, 60).map(one), bad.length > 60 ? h('p', null, `and ${bad.length - 60} more calls in the copied summary`) : null);
}

function slowCard(ctx, run) {
  const rows = [...run.rows].sort((a, b) => b.ms_new - a.ms_new).slice(0, 8);
  return card({ title: 'Slowest calls', note: 'on the new engine', flush: true }, table({ rows, cols: [
    { key: 'key', label: 'Call', render: r => h('code', null, r.key) },
    { key: 'brand', label: 'Brand', render: r => (r.brand ? nameOf(ctx, r.brand) : '') },
    { key: 'ms_new', label: 'New engine', num: true, render: r => r.ms_new + ' ms' },
    { key: 'ms_old', label: 'Old engine', num: true, render: r => r.ms_old + ' ms' }] }));
}

function allCard(ctx, run) {
  const WORD = { match: ['good', 'Match'], differs: ['warn', 'Different'], failed: ['bad', 'Failed'], passed: ['off', 'Handed to old'] };
  return card({ title: 'Every call', note: `${run.rows.length} asked`, flush: true }, table({ rows: run.rows, height: 480, sort: { key: 'state', dir: 'asc' }, cols: [
    { key: 'key', label: 'Call', sortable: true, render: r => h('code', null, r.key) },
    { key: 'brand', label: 'Brand', sortable: true, render: r => (r.brand ? nameOf(ctx, r.brand) : '') },
    { key: 'state', label: 'Result', sortable: true, value: r => ['failed', 'differs', 'passed', 'match'].indexOf(r.state), render: r => statusDot(WORD[r.state][0], WORD[r.state][1]) },
    { key: 'ms_new', label: 'New', num: true, sortable: true, render: r => r.ms_new + ' ms' },
    { key: 'ms_old', label: 'Old', num: true, sortable: true, render: r => r.ms_old + ' ms' }] }));
}

function missCard(redraw) {
  const m = misses();
  return card({ title: 'Missed in real use', note: 'in this browser, newest first', action: m.length ? button('Clear', { ghost: true, onclick: () => { clearMisses(); redraw(); } }) : null },
    m.length ? h('div', { class: 'ec-m' }, m.slice(0, 50).map(x => h('div', null, pill(x.kind === 'failed' ? 'bad' : 'warn', x.kind === 'failed' ? 'Failed' : 'Different'), h('code', null, x.key),
      h('span', null, [x.status || '', x.note || ''].filter(Boolean).join(', ')), x.fields ? h('small', null, x.fields.join(', ')) : null, h('small', null, relativeTime(x.at)))))
      : h('p', null, 'None. A miss is written here when this browser is on the new engine and the old one had to answer instead, or on compare when the two answers differ.'));
}

function render(el, _d, ctx) {
  addStyles('ec-css', CSS); look();
  if (!ctx.sample && (!ctx.me || ctx.me.role !== 'owner')) return put(el, empty({ title: 'Only the owner can open this page' }));
  /* sample mode shows an invented run so the page can be seen; Run never calls an engine there */
  if (ctx.sample && !LAST) LAST = sampleRun(ctx);
  const pick = h('select', { 'aria-label': 'Which brands' }, h('option', { value: '' }, `Every brand (${ctx.brands.length})`), ctx.brands.map(b => h('option', { value: b.id }, b.name)));
  const status = h('p', null, ctx.sample ? 'Sample numbers: an invented run. Nothing was asked of either engine.' : LAST ? '' : 'Asks every read the new engine has its own code for, on both engines at once, as you. Reads only.');
  const body = h('div', { class: 'ec' });
  const go = button(LAST ? 'Run again' : 'Run the compare', { primary: true, onclick: () => run() });
  const draw = () => {
    if (!LAST) return put(body, missCard(draw));
    const r = LAST.rows;
    put(body,
      countTiles([
        { label: 'Calls asked', value: String(r.length), window: `${LAST.from} to ${LAST.to}`, source: 'Both engines' },
        { label: 'Match', value: String(count(r, 'match')), sub: r.length ? Math.round(count(r, 'match') / r.length * 100) + '% of calls' : '', window: 'Run ' + relativeTime(LAST.at), source: 'Both engines' },
        { label: 'Different', value: String(count(r, 'differs')), window: 'Run ' + relativeTime(LAST.at), source: 'Both engines' },
        { label: 'Failed or handed back', value: String(count(r, 'failed') + count(r, 'passed')), sub: `${count(r, 'failed')} failed, ${count(r, 'passed')} handed to the old engine`, window: 'Run ' + relativeTime(LAST.at), source: 'New engine' },
      ], { cols: 4 }),
      problemCard(ctx, LAST), slowCard(ctx, LAST), missCard(draw), allCard(ctx, LAST));
  };
  async function run() {
    if (ctx.sample) { toast('Sample mode never calls an engine.'); return; }
    go.disabled = true;
    try {
      status.textContent = 'Reading the list of calls from the new engine.';
      const list = await engineApi('/v1/routes', { signal: ctx.signal });
      const ids = pick.value ? [pick.value] : ctx.brands.map(b => b.id);
      const qs = questions(ctx, list.routes || [], ids);
      const rows = await runAll(qs, ctx.signal, (n, of) => { status.textContent = `Asked ${n} of ${of}.`; });
      LAST = { at: Date.now(), from: ctx.range.from, to: ctx.range.to, rows };
      status.textContent = `Done ${relativeTime(LAST.at)}. ${count(rows, 'match')} of ${rows.length} match.`;
      go.textContent = 'Run again';
      draw();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      status.textContent = 'Could not run: ' + (e.message || 'the new engine did not answer') + '.';
    } finally { go.disabled = false; }
  }
  put(el, h('div', { class: 'ec adm' },
    h('div', { class: 'row' }, go, pick, button('Copy the summary', { onclick: () => (LAST ? copy(summaryText(ctx, LAST)) : toast('Run the compare first')) }),
      button('The switch', { ghost: true, href: ctx.href('a-engine', 'switch') })),
    status, body));
  draw();
}

/** Sample only: a small invented run in the shape pair() returns, so the tiles and cards can be seen. */
function sampleRun(ctx) {
  const b = (ctx.brands || []).map(x => x.id), at = Date.now() - 6 * 60e3;
  const row = (key, brand, state, ms_new, ms_old, extra = {}) => ({ key, which: key.includes('/ah/') ? 'ah' : 'profit', path: key.slice(7), brand, state, ms_new, ms_old, old_status: 200, new_status: 200, fields: [], ...extra });
  const rows = [
    ...b.map((id, i) => row('GET /pw/api/overview', id, 'match', 160 + i * 12, 410 + i * 20)),
    ...b.slice(0, 4).map((id, i) => row('GET /pw/api/hub/paid', id, 'match', 220 + i * 9, 520 + i * 15)),
    row('GET /ah/api/brands', '', 'match', 90, 130),
    row('GET /pw/api/customers', b[0] || '', 'differs', 640, 980, { fields: [{ at: 'months[5].new_customers', old: '412', new: '411' }] }),
    row('GET /ah/api/series', b[1] || '', 'failed', 3000, 450, { new_status: 0, note: 'the new engine could not be reached' }),
    row('GET /pw/api/hub/creative', b[2] || '', 'passed', 510, 505, { note: 'the new engine handed this one to the old engine' }),
  ];
  return { at, from: ctx.range.from, to: ctx.range.to, rows };
}

export default {
  title: ['Does the new engine ', em('answer the same?')],
  eyebrow: 'Engine',
  stamp: false,                  /* nothing is read until Run: no "updated" stamp */
  sample: null,
  render,
};
