/* Agency > Platform status. Is any platform we depend on down right now? Each platform's own status page, read
   every few minutes by the outage monitor. account-health GET /api/pulse/status (state per platform, last 60 changes). */
import { put } from '../../kit.js';
import { h, em, pill, statusDot, card, empty, addStyles, relativeTime, svgNode } from '../../kit.js';
import { icon, GLYPH } from '../../icons.js';
import { pageHelp } from '../../defs.js';
import { world, figures, quiet, longDay } from '../a-today/_ag.js';
import { style as baseStyle } from '../a-today/_more.js';

const CSS = `
.st-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--sp-6)}
.st-c{display:grid;gap:14px;align-content:start;min-height:168px;position:relative;overflow:hidden}
.st-c.bad::before,.st-c.warn::before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:var(--watch)}
.st-c.bad::before{background:var(--bad)}
.st-mark{flex:none;display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--bg-sunk);color:var(--ink);font-size:12px;font-weight:700}
.st-mark svg{width:16px;height:16px}
.st-none{font-size:13.5px;color:var(--muted);padding-top:12px;border-top:1px solid var(--line)}
.st-when{font-size:var(--num-m)!important}
.st-c-h{display:flex;align-items:center;gap:10px;min-width:0}
.st-c-h b{font-size:16px;font-weight:600;letter-spacing:-.015em}
.st-c-h>:last-child{margin-left:auto}
.st-s{display:flex;align-items:flex-start;gap:12px;padding-top:12px;border-top:1px solid var(--line);font-size:13.5px}
.st-s .d{flex:1;min-width:0;display:grid;gap:2px}
.st-s .lx-stat{padding-top:5px}
.st-s small{color:var(--muted);font-size:12.5px}
.st-c a.src{font-size:12.5px;color:var(--muted)}
@media (max-width:759px){.st-grid{grid-template-columns:minmax(0,1fr);gap:var(--sp-4)}}`;
const style = () => { baseStyle(); addStyles('st-css', CSS); };

const TONE = { operational: 'good', degraded: 'warn', partial: 'warn', maintenance: 'warn', major: 'bad', outage: 'bad', down: 'bad' };
const WORD = { operational: 'Working', degraded: 'Slow or partly down', partial: 'Partly down', maintenance: 'Maintenance', major: 'Down', outage: 'Down', down: 'Down' };
const toneOf = s => TONE[s] || (s ? 'warn' : 'off');
const wordOf = s => WORD[s] || (s ? s : 'Not checked yet');

/* the platform's own mark when the kit has one, else its first letter on a soft tile (never a plain black square) */
const GLYPH_OF = id => { const k = String(id || '').split('-')[0]; return GLYPH[k] ? k : null; };
const markOf = p => { const g = GLYPH_OF(p.id); return h('span', { class: 'st-mark', 'aria-hidden': 'true' }, g ? svgNode(icon(g)) : String(p.name || '?').charAt(0).toUpperCase()); };

const load = ctx => ctx.api('/api/pulse/status', { worker: 'ah', signal: ctx.signal });
const sample = async () => (await world()).status;

function render(el, d, ctx) {
  style();
  const plats = (d && d.platforms) || [];
  if (!plats.length) return put(el, empty({ title: 'The monitor has not run yet', text: 'Platform status shows here after its first check.' }));
  const issues = plats.filter(p => p.state && p.state.worst && p.state.worst !== 'operational');
  const unknown = plats.filter(p => !p.state || !p.state.ok);
  const since = Date.now() - 14 * 864e5;
  const inc = (d.incidents || []).filter(i => +new Date(i.ts) >= since);
  const hero = figures([
    { label: 'Platforms with a problem', value: String(issues.length), sub: issues.length ? issues.map(p => p.name).join(', ') : `all ${plats.length} working` },
    { label: 'Changes in 14 days', value: String(inc.length), sub: inc.length ? 'went down or came back' : 'quiet' },
    { label: 'Last checked', value: d.lastRun ? relativeTime(d.lastRun) : 'never', sub: unknown.length ? `${unknown.length} could not be read` : 'every platform answered' },
  ]);
  const order = [...plats].sort((a, b) => (a.state && a.state.worst === 'operational' ? 1 : 0) - (b.state && b.state.worst === 'operational' ? 1 : 0));
  const one = p => {
    const st = p.state || {}, services = Object.values(st.services || {});
    const bad = services.filter(s => s.state !== 'operational');
    const worst = st.worst;
    /* every card the same: mark, name, one status dot; a platform with a problem gets the colored strip on top */
    const tone = !p.state ? 'off' : st.ok === false ? 'off' : toneOf(worst);
    return h('section', { class: 'lx-card st-c' + (tone === 'bad' || tone === 'warn' ? ' ' + tone : '') },
      h('div', { class: 'st-c-h' }, markOf(p), h('b', null, p.name),
        statusDot(tone, !p.state ? 'Not checked yet' : st.ok === false ? 'Could not read' : wordOf(worst))),
      services.length ? (bad.length ? bad : services.slice(0, 1)).map(s => h('div', { class: 'st-s' }, statusDot(toneOf(s.state), ''), h('span', { class: 'd' }, h('b', null, s.name), h('small', null, s.note || wordOf(s.state)))))
        : h('p', { class: 'st-none' }, st.ok === false ? 'Their status page did not answer at the last check.' : 'No answer from their status page yet.'),
      bad.length && services.length > bad.length ? quiet(`${services.length - bad.length} other part${services.length - bad.length === 1 ? '' : 's'} working`) : null,
      p.link ? h('a', { class: 'src', href: p.link, target: '_blank', rel: 'noopener' }, 'Their status page') : null);
  };
  const grid = h('div', null, h('div', { class: 'lx-sec', style: { marginBottom: '16px' } }, h('h3', null, 'Right now'), h('span', { class: 'note' }, 'problems first')), h('div', { class: 'st-grid' }, order.map(one)));
  const hist = card({ title: 'The last 14 days', note: 'newest first', flush: true },
    inc.length ? h('div', { class: 'ag-sg' }, inc.map(i => h('div', { class: 'ag-sg-r ag-ch' },
      h('span', { class: 'k' }, longDay(String(i.ts).slice(0, 10))),
      h('span', { class: 't' }, h('b', null, `${i.platform}${i.service ? ', ' + i.service : ''}`), i.note ? h('span', { class: 'w' }, i.note) : null),
      h('span', { class: 'm' }, i.kind === 'resolved' || i.to === 'operational' ? statusDot('good', 'Back') : statusDot(toneOf(i.to), wordOf(i.to)))))) : h('div', { class: 'ag-pad' }, quiet('Nothing went down.')));
  /* the "Last checked" value is words, at the smaller word size, with the exact time on hover */
  const lc = hero.querySelectorAll('.lx-kpi .v, .v')[2];
  if (lc) { lc.classList.add('st-when'); if (d.lastRun) lc.title = new Date(d.lastRun).toLocaleString('en-US'); }
  const help = h('div', { class: 'cr-bar-top' }, pageHelp({ body: [
    { title: 'What it is for', text: 'Whether any platform we depend on is down right now, read from each platform\'s own status page every few minutes.' },
    { title: 'Why it matters', text: 'A problem there can explain a sudden drop in spend or sales before anything in the account changed.' },
  ] }));
  put(el, h('div', { class: 'ag' }, help, hero, grid, hist));
}

export default {
  title: ['Is any platform ', em('down right now?')],
  eyebrow: 'Platform status',
  ranges: false,
  asOf: d => d && d.lastRun,
  load, sample, render,
};
