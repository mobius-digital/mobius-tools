/* A page that reads more than one thing, some of them slow.
   The router waits for load() before it paints. A page whose slowest call takes ten seconds would sit on its
   skeleton for ten seconds. With this, load() returns as soon as the first part has landed (or at once, when a
   saved copy holds the parts from last time), the page draws what it has, and each later part is painted in
   as it lands. When every part is in, the full answer becomes the saved copy.

   In the page:

     import { loadParts, follow } from '../_parts.js';
     load: ctx => loadParts(ctx, { fast: () => ctx.api(...), slow: () => ctx.api(...) }, { first: ['fast'] }),
     render(el, data, ctx) { follow(ctx, data, d => draw(el, build(d.parts), d, ctx)); },

   What the page gets: { parts: { name: answer | undefined }, late: [names still on their way],
   errors: { name: 'why' }, at: when the oldest part shown was read }.
   A part that failed keeps last time's answer when there is one and is listed in errors.
   load() itself never touches the page; follow() is called from render and only repaints.

   Leaving the page stops the read. What is saved then is marked old, so coming back reads again at once
   (the router does not refetch a copy younger than 20 seconds, and a half read copy must never count as one). */

import { getSaved, putSaved, pageKey, SAMPLE } from '../data.js';
import { h } from '../kit.js';

const RUNS = new Map();      // page key -> the read in flight (or the last one that finished)
const SEEN = new Map();      // page key -> the newest follow() call, so an older one never paints over it

const keyOf = (ctx, ranged) => pageKey({ view: ctx.view, brandId: ctx.brand ? ctx.brand.id : 'all', line: ctx.line.id, tab: ctx.tab.id, range: ranged ? ctx.range : null });
const aborted = (e, ctx) => (e && e.name === 'AbortError') || (ctx.signal && ctx.signal.aborted);

function snap(run) {
  const parts = { ...run.prev, ...run.parts };
  /* the stamp is the oldest part on screen: last time's numbers never read as just fetched */
  const read = Object.keys(parts).filter(n => parts[n] != null).map(n => run.times[n]).filter(Boolean);
  return { parts, late: [...run.pending], errors: { ...run.errors }, at: read.length ? Math.min(...read) : null, times: { ...run.times }, run: run.id };
}

/* A read that was cut short (the person left the page) after load() had already answered: the router holds a
   half read copy stamped now. Save what did land and mark it old, so the next visit reads again. */
function cutShort(run) {
  if (run.cut || !run.answered || SAMPLE) return;
  run.cut = true;
  setTimeout(async () => {                                   // after the router's own save
    if (RUNS.get(run.key) !== run) return;
    try { const rec = await putSaved(run.key, snap(run)); if (rec) rec.asOf = 0; } catch (err) { console.error(err); }
  }, 60);
}

/** loadParts(ctx, { name: () => promise }, { first: ['name'], ranged: false })
    first: the parts the page cannot draw without. With no saved copy, load waits for these (all of them) and a
    failure of one is the page's error. With none named, it waits for whichever part lands first.
    ranged: true when the page honours the date range (the same answer the page gives the router by not
    saying ranges: false). */
export async function loadParts(ctx, fetchers, { first = [], ranged = false } = {}) {
  const key = keyOf(ctx, ranged);
  const saved = SAMPLE ? null : await getSaved(key);
  const prev = (saved && saved.data && saved.data.parts) || {};
  const names = Object.keys(fetchers);
  const was = (saved && saved.data && saved.data.times) || {}, wasAt = saved ? (saved.data && saved.data.at) || saved.asOf || null : null;
  const times = {};
  for (const n of Object.keys(prev)) times[n] = was[n] || wasAt;
  const run = { id: Date.now() + ':' + Math.random().toString(36).slice(2, 8), key, ctx, prev, parts: {}, errors: {}, times, pending: new Set(names), paint: null, hard: null, answered: false, cut: false };
  RUNS.set(key, run);
  /* leaving the page stops the read, also for a call that does not listen to the signal */
  if (ctx.signal && ctx.signal.addEventListener) ctx.signal.addEventListener('abort', () => { if (run.pending.size) { run.dead = true; cutShort(run); } }, { once: true });

  const jobs = {};
  for (const name of names) {
    jobs[name] = Promise.resolve().then(fetchers[name]).then(
      v => { if (run.dead) return; run.parts[name] = v == null ? null : v; run.times[name] = Date.now(); },
      e => {
        if (aborted(e, ctx)) { run.dead = true; cutShort(run); return; }
        if (e && e.status === 401) run.hard = e;
        run.errors[name] = (e && e.message) || 'no answer';
        if (!(name in prev)) run.parts[name] = null;
      }).then(() => {
        if (run.dead) return;                               // cut short: this part stays "on its way" in the saved copy
        run.pending.delete(name);
        if (RUNS.get(key) !== run) return;
        if (!run.pending.size) setTimeout(() => { if (RUNS.get(key) === run && !run.dead) putSaved(key, snap(run)); }, 60);   // after the router's own save
        if (run.paint) try { run.paint(snap(run)); } catch (err) { console.error(err); }
      });
  }

  const have = first.length ? first.every(n => n in prev) : names.some(n => n in prev);
  if (!have) {
    if (first.length) await Promise.all(first.map(n => jobs[n]));
    else await new Promise(done => { for (const n of names) jobs[n].then(() => { if (run.parts[n] != null) done(); }); Promise.all(names.map(n => jobs[n])).then(done); });
    if (ctx.signal && ctx.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    if (run.hard) throw run.hard;
    const need = first.length ? first : names;
    const got = need.filter(n => run.parts[n] != null);
    if (first.length ? got.length < first.length : !got.length) throw new Error(run.errors[need.find(n => run.errors[n])] || 'The numbers did not load.');
  }
  run.answered = true;
  if (run.dead) cutShort(run);
  return snap(run);
}

/** follow(ctx, data, paint, { ranged }) : call from render. Paints now with the newest parts, and again each
    time a part lands while this page is still the one on screen. `data` that is not a parts answer (a sample
    fixture) is painted as it is, once.
    When the saved copy is a half read one and no read is running yet (the person left and came back), the
    missing parts stay "on their way" while the new read starts; only if none starts are they shown as failed. */
export function follow(ctx, data, paint, { ranged = false } = {}) {
  if (!data || !data.parts) { paint(data); return; }
  const key = keyOf(ctx, ranged), gone = () => !!(ctx.signal && ctx.signal.aborted);
  const mine = {};
  SEEN.set(key, mine);
  const live = () => { const r = RUNS.get(key); return r && !r.dead && !(r.ctx.signal && r.ctx.signal.aborted) ? r : null; };
  const hook = run => { run.paint = d => { if (!gone() && SEEN.get(key) === mine) paint(d); }; paint(snap(run)); };
  if (gone()) { paint({ ...data, late: [] }); return; }
  const run = live() || (RUNS.get(key) && !RUNS.get(key).dead && !RUNS.get(key).pending.size ? RUNS.get(key) : null);
  if (run) { hook(run); return; }
  if (!(data.late && data.late.length)) { paint({ ...data, late: [] }); return; }
  /* a half read copy and nothing reading yet: the router is about to call load() again (the copy is marked old) */
  paint(data);
  let tries = 0;
  const look = () => {
    if (gone() || SEEN.get(key) !== mine) return;
    const now = live();
    if (now) { hook(now); return; }
    if (++tries < 16) setTimeout(look, 250);
    else paint({ ...data, late: [] });                       // nothing started in four seconds: say so plainly
  };
  setTimeout(look, 0);
}

/** The small shimmer that stands where a number will be: dots() or dots('5em'). */
export const dots = (width = '2.6em') => h('span', { class: 'lx-skel', role: 'img', 'aria-label': 'Still reading', style: { display: 'inline-block', width, height: '0.9em', borderRadius: '6px', verticalAlign: 'baseline' } });
/** A quiet line under a page while parts are still landing: reading('Reading 3 more brands'). */
export const reading = text => h('p', { class: 'lx-foot', role: 'status' }, dots('1.6em'), ' ', text);

/** True while a part is on its way and there is nothing of it to show yet: late(d, 'slow'). */
export const late = (d, name) => !!(d && d.late && d.late.includes(name) && (!d.parts || d.parts[name] == null));
