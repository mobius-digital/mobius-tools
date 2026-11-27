/* Agency > Engine > Switch. Owner only. Which engine answers the screens.
   Two switches, smallest first:
     this browser   old, new or compare, kept in this browser only (engine.js). Nobody else is touched.
     everyone       the new engine's own flag (GET and PUT /v1/engine). Off = it hands every call straight
                    to the old engine, for everyone, within 30 seconds, with no deploy.
   The old engine is never changed by anything on this page. */
import { h, put, card, segmented, button, pill, statusDot, toast, em, empty, addStyles } from '../../kit.js';
import { ENGINE_DEFAULT } from '../../config.js';
import { engineMode, setEngineMode, engineApi, portedList, misses } from '../../engine.js';
import { pageHelp } from '../../defs.js';
import { look } from '../a-settings/_look.js';

const SAMPLE_NOTE = 'Sample: nothing was changed';

const CSS = `
.en{display:grid;gap:var(--sp-5)}
.en p{margin:0;color:var(--ink-2);font-size:13.5px;max-width:68ch}
.en .row{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.en ul{margin:0;padding-left:18px;color:var(--ink-2);font-size:13.5px;display:grid;gap:4px}
.en .lx-card{display:grid;gap:14px}`;

const WORDS = {
  old: 'Old engine. Every call goes to the old workers, as it always has.',
  new: 'New engine. The calls it has its own code for go to it. If it fails or answers badly, the old engine is asked instead and the miss is written down.',
  compare: 'Compare. You see the old engine\'s answers. Each read the new engine also knows is asked of it behind the page, and every difference is written down.',
};
const NAMES = { old: 'Old engine', new: 'New engine', compare: 'Compare' };

async function load(ctx) {
  const ask = path => engineApi(path, { signal: ctx.signal }).catch(e => { if (e && e.name === 'AbortError') throw e; return { failed: e.message || 'did not answer' }; });
  const [health, flag] = await Promise.all([ask('/v1/health'), ask('/v1/engine')]);
  return { health, flag };
}

function browserCard(ctx) {
  const now = engineMode();
  const say = h('p', null, WORDS[now]);
  const seg = segmented(['old', 'new', 'compare'].map(id => ({ id, label: NAMES[id] })), now, id => {
    if (ctx.sample) { say.textContent = WORDS[id]; toast(SAMPLE_NOTE); return; }
    setEngineMode(id);
    say.textContent = WORDS[id];
    toast('This browser now uses: ' + NAMES[id].toLowerCase());
  });
  const reads = portedList().filter(k => k.startsWith('GET ')).length, writes = portedList().length - reads;
  return card({ title: 'This browser', note: 'Changes it for you, in this browser' },
    h('div', { class: 'row' }, seg), say,
    h('p', null, `The new engine has its own code for ${reads} reads and ${writes} settings saves. Everything else stays on the old engine in every choice.`),
    h('p', null, `A browser that has made no choice uses: ${NAMES[ENGINE_DEFAULT] || 'Old engine'}. That is one line in config.js (ENGINE_DEFAULT) and it switches everyone.`),
    h('div', { class: 'row' }, button('Open the compare page', { href: ctx.href('a-engine', 'compare'), icon: 'arrow' }),
      misses().length ? pill('warn', misses().length + ' misses written down') : statusDot('good', 'No misses written down')));
}

function engineCard(d) {
  const hl = d.health || {};
  if (hl.failed) return card({ title: 'The new engine', note: 'Is it up right now?' }, statusDot('bad', 'It did not answer'), h('p', null, hl.failed + '. Leave this browser on the old engine until it does.'));
  return card({ title: 'The new engine', note: 'Is it up right now?' },
    h('div', { class: 'row' }, statusDot('good', 'It is up'), pill('', `${hl.routes} routes`), pill(hl.mode === 'old' ? 'warn' : 'good', hl.mode === 'old' ? 'handing everything to the old engine' : 'answering')));
}

function everyoneCard(d, redraw, ctx) {
  const flag = d.flag || {};
  if (flag.failed) return card({ title: 'Everyone, at once', note: 'Changes it for everyone' }, h('p', null, 'The flag could not be read: ' + flag.failed));
  const off = flag.mode === 'old';
  const set = async mode => {
    if (ctx.sample) { toast(SAMPLE_NOTE); redraw({ ...d, flag: { ...flag, mode }, health: { ...(d.health || {}), mode } }); return; }
    try {
      const next = await engineApi('/v1/engine', { method: 'PUT', body: { mode } });
      toast(mode === 'old' ? 'Everything goes to the old engine now' : 'The new engine answers again');
      redraw({ ...d, flag: next, health: { ...(d.health || {}), mode: next.mode } });
    } catch (e) { toast('Could not change it: ' + e.message, { tone: 'bad', ms: 5000 }); }
  };
  return card({ title: 'Everyone, at once', note: 'Changes it for everyone' },
    h('div', { class: 'row' }, off ? statusDot('warn', 'Off. The new engine hands every call to the old engine.') : statusDot('good', 'On. The new engine answers what it has code for.')),
    h('p', null, 'This is the way back for everybody. It takes effect within 30 seconds and needs no deploy. The old engine keeps running the whole time.'),
    h('div', { class: 'row' }, off ? button('Let the new engine answer again', { primary: true, onclick: () => set('new') }) : button('Send everything back to the old engine', { onclick: () => set('old') })),
    (flag.forward || []).length ? h('div', null, h('p', null, 'Single routes sent back to the old engine:'), h('ul', null, flag.forward.map(k => h('li', null, k)))) : null);
}

function render(el, d, ctx) {
  addStyles('en-css', CSS); look();
  if (!ctx.sample && (!ctx.me || ctx.me.role !== 'owner')) return put(el, empty({ title: 'Only the owner can open this page' }));
  const help = h('div', { class: 'row' }, pageHelp({ body: [
    { title: 'What it is for', text: 'Which engine answers the screens: the old workers, or the new engine that is taking their place one route at a time.' },
    { title: 'Two switches', text: 'This browser changes it for you only, in this browser. Everyone, at once changes it for every person within 30 seconds, with no deploy. The old engine keeps running either way.' },
    { title: 'What never moves', text: 'Timed jobs, chat and webhooks stay on the old engine whatever is chosen here.' },
  ] }));
  const draw = data => put(el, h('div', { class: 'en adm' }, help, browserCard(ctx), engineCard(data || {}), everyoneCard(data || {}, draw, ctx)));
  draw(d);
}

export default {
  title: ['Which engine ', em('answers?')],
  eyebrow: 'Engine',
  ranges: false,
  /* sample mode draws the cards from invented numbers and never calls an engine */
  sample: async () => ({ health: { routes: 48, mode: 'new' }, flag: { mode: 'new', forward: ['GET /api/example-slow-report'] } }),
  load, render,
};
