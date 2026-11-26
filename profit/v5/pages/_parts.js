/* A page that reads more than one thing, some of them slow.
   The router waits for load() before it paints. A page whose slowest call takes ten seconds would sit on its
   skeleton for ten seconds. With this, a first visit's load() returns as soon as the first part has landed, the
   page draws what it has, and each later part is painted in as it lands. When every part is in, the full answer
   becomes the saved copy.

   A return visit (a saved copy holds the parts from last time) is the other way round: the router has already
   painted the saved copy with its busy stamp before load() answers, follow() paints each part in as it lands,
   and load() answers only when every part has landed or failed. The router's fresh paint then stamps the page
   with the real time. Answering at once would stamp it with last visit's time and never move it again.

   In the page:

     import { loadParts, follow } from '../_parts.js';
     load: ctx => loadParts(ctx, { fast: () => ctx.api(...), slow: () => ctx.api(...) }, { first: ['fast'] }),
     render(el, data, ctx) { follow(ctx, data, d => draw(el, build(d.parts), d, ctx)); },

   What the page gets: { parts: { name: answer | undefined }, late: [names still on their way],
   errors: { name: 'why' }, at: when the oldest part shown was read }.
   A part that failed keeps last time's answer when there is one and is listed in errors.
   load() itself never touches the page; follow() is called from render and only repaints.

   Leaving the page stops the read. What is saved then is a half read copy: it says so itself (half: true, and
   the parts still missing in late), and it is marked old in memory so coming back reads again at once. After a
   full reload the old mark is gone and the router takes a copy younger than 20 seconds as fresh; follow() sees
   half: true, finds nothing reading, and starts the read itself. */

import { getSaved, putSaved, pageKey, SAMPLE } from '../data.js';
import { h } from '../kit.js';

const RUNS = new Map();      // page key -> the read in flight (or the last one that finished)
const SEEN = new Map();      // page key -> the newest follow() call, so an older one never paints over it
const WAIT = new Map();      // page key -> the follow() call to tell when a read starts
const HEIR = new Map();      // page key -> a read that was cut short and is waiting for the next one to answer for it

const keyOf = (ctx, ranged) => pageKey({ view: ctx.view, brandId: ctx.brand ? ctx.brand.id : 'all', line: ctx.line.id, tab: ctx.tab.id, range: ranged ? ctx.range : null, client: ctx.isClient });
const aborted = (e, ctx) => (e && e.name === 'AbortError') || (ctx.signal && ctx.signal.aborted);

function snap(run) {
  const parts = { ...run.prev, ...run.parts };
  /* the stamp is the oldest part on screen: last time's numbers never read as just fetched */
  const read = Object.keys(parts).filter(n => parts[n] != null).map(n => run.times[n]).filter(Boolean);
  return { parts, late: [...run.pending], errors: { ...run.errors }, at: read.length ? Math.min(...read) : null, times: { ...run.times }, run: run.id, half: run.pending.size > 0 };
}

/* A read that was cut short (the person left the page). After load() had already answered, the router holds a
   half read copy stamped now. On a return visit load() had not answered yet, and the parts that did land would
   be thrown away. Either way: save what did land as a half read copy and mark it old, so the next visit reads again. */
function cutShort(run) {
  if (run.cut || SAMPLE) return;
  if (!run.answered && !(run.had && Object.keys(run.parts).length)) return;
  run.cut = true;
  setTimeout(async () => {                                   // after the router's own save
    if (RUNS.get(run.key) !== run) return;
    try { const rec = await putSaved(run.key, snap(run)); if (rec) rec.asOf = 0; } catch (err) { console.error(err); }
  }, 60);
}

/** loadParts(ctx, { name: () => promise }, { first: ['name'], ranged: false })
    first: the parts the page cannot draw without. With no saved copy, load waits for these (all of them) and a
    failure of one is the page's error. With none named, it waits for whichever part lands first.
    ranged: true when the page honors the date range (the same answer the page gives the router by not
    saying ranges: false). */
export async function loadParts(ctx, fetchers, opts) {
  const key = keyOf(ctx, !!(opts && opts.ranged));
  let run = null;
  try { const out = await read(ctx, key, fetchers, opts, r => { run = r; }); if (run) run.settle(out); return out; }
  catch (e) { if (run) run.fail(e); throw e; }
}

/* The page was shown again while its read was still running (the browser tab came back, the brand list changed).
   The router's refresh for this page still points at the read that was just cut, so it never calls load() again.
   follow() starts the next read; the cut one waits here for it and answers with it, and the router stamps that. */
const heir = key => new Promise(done => {
  HEIR.set(key, done);
  setTimeout(() => { if (HEIR.get(key) === done) { HEIR.delete(key); done(null); } }, 400);
});

async function read(ctx, key, fetchers, { first = [], ranged = false } = {}, born) {
  const saved = SAMPLE ? null : await getSaved(key);
  const prev = (saved && saved.data && saved.data.parts) || {};
  const names = Object.keys(fetchers);
  const was = (saved && saved.data && saved.data.times) || {}, wasAt = saved ? (saved.data && saved.data.at) || saved.asOf || null : null;
  const times = {};
  for (const n of Object.keys(prev)) times[n] = was[n] || wasAt;
  const run = { id: Date.now() + ':' + Math.random().toString(36).slice(2, 8), key, ctx, prev, parts: {}, errors: {}, times, pending: new Set(names), paint: null, hard: null, answered: false, had: false, cut: false };
  run.done = new Promise((settle, fail) => { run.settle = settle; run.fail = fail; });
  run.done.catch(() => {});
  born(run);
  RUNS.set(key, run);
  { const next = HEIR.get(key); HEIR.delete(key); if (next) next(run); }
  { const tell = WAIT.get(key); WAIT.delete(key); if (tell) try { tell(run); } catch (err) { console.error(err); } }
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
  run.had = have;
  if (have) {
    /* a return visit: the saved copy is on screen already. Answer when every part has landed or failed, so the
       router stamps the page with the time of this read. Leaving the page ends the wait at once. */
    const left = new Promise(done => { if (!ctx.signal || !ctx.signal.addEventListener) return; if (ctx.signal.aborted) done(); else ctx.signal.addEventListener('abort', done, { once: true }); });
    await Promise.race([Promise.all(names.map(n => jobs[n])), left]);
    if (run.dead || (ctx.signal && ctx.signal.aborted)) {
      run.dead = true; cutShort(run);
      const next = await heir(key);
      if (next) return next.done;
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }
  } else {
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
    When nothing is reading yet (a return visit: the router paints the saved copy, then calls load), the saved
    copy is painted and the read is picked up the moment it starts.
    When the saved copy is a half read one (the person left and came back, or reloaded), the missing parts stay
    "on their way" while the new read starts. If none starts (after a reload the router takes the copy as fresh),
    the read is started here, from the page's own load(); only if that fails are they shown as failed. */
export function follow(ctx, data, paint, { ranged = false } = {}) {
  if (!data || !data.parts) { paint(data); return; }
  const key = keyOf(ctx, ranged), gone = () => !!(ctx.signal && ctx.signal.aborted);
  const mine = {};
  SEEN.set(key, mine);
  const live = () => { const r = RUNS.get(key); return r && !r.dead && !(r.ctx.signal && r.ctx.signal.aborted) ? r : null; };
  const hook = run => { run.paint = d => { if (!gone() && SEEN.get(key) === mine) paint(d); }; paint(snap(run)); };
  if (gone()) { paint({ ...data, late: [] }); return; }
  const take = now => { if (!gone() && SEEN.get(key) === mine && !now.dead) hook(now); };
  if (live()) { WAIT.delete(key); hook(live()); return; }
  WAIT.set(key, take);                                       // a read that starts later is picked up as it starts
  const done = RUNS.get(key) && !RUNS.get(key).dead && !RUNS.get(key).pending.size ? RUNS.get(key) : null;
  if (done) { hook(done); return; }                          // the last read finished: its answer is the newest there is
  const half = !!(data.half || (data.late && data.late.length));
  /* the last read here was cut short and what is saved is older than the router's 20 seconds: a read is due */
  const cut = !!(RUNS.get(key) && RUNS.get(key).dead) && !(data.at && Date.now() - data.at < 20e3);
  paint(half ? data : { ...data, late: [] });
  if (!half && !cut) return;
  /* nothing reading yet: the router calls load() again when the copy is old (a half read copy is marked old) */
  const failed = () => { if (!gone() && SEEN.get(key) === mine) paint({ ...data, late: [] }); };   // say so plainly
  setTimeout(async () => {
    if (gone() || SEEN.get(key) !== mine || live()) return;
    /* nothing started: read it here. The page's own load() calls loadParts, which hands the read to take(). */
    try {
      const mod = await import(`./${ctx.line.id}/${ctx.tab.id}.js`);
      const page = mod && mod.default;
      if (gone() || SEEN.get(key) !== mine || live()) return;
      if (!page || !page.load) { failed(); return; }
      await page.load(ctx);
    } catch (err) { if (!aborted(err, ctx)) { console.error(err); failed(); } }
  }, cut ? 0 : 300);
}

/** The small shimmer that stands where a number will be: dots() or dots('5em'). */
export const dots = (width = '2.6em') => h('span', { class: 'lx-skel', role: 'img', 'aria-label': 'Still reading', style: { display: 'inline-block', width, height: '0.9em', borderRadius: '6px', verticalAlign: 'baseline' } });
/** A quiet line under a page while parts are still landing: reading('Reading 3 more brands'). */
export const reading = text => h('p', { class: 'lx-foot', role: 'status' }, dots('1.6em'), ' ', text);

/** True while a part is on its way and there is nothing of it to show yet: late(d, 'slow'). */
export const late = (d, name) => !!(d && d.late && d.late.includes(name) && (!d.parts || d.parts[name] == null));
