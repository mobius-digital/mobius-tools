/* Meetings > Run the meeting: the Monday team meeting, one step on screen at a time.
   Made for a shared screen: one question per step, big numbers, big buttons, arrow keys move.
   Order is the agenda's: Scoreboard, Promises, Green brands, one step per decision brand (three at
   most, furthest under goal first), Pipeline, Learned, Agency, Close.
   Yes, Not now, added decisions, the notes and the rating are kept in this browser tab only.
   Nothing here writes to a worker; posting the decisions stays switched off. */

import { APP_NAME } from '../../config.js';
import { put, noDash } from '../../kit.js';
import { h, em, button, avatar, statusDot, pill, delta, sheet, toast, empty, addStyles, tiles, kpi, sourceLine } from '../../kit.js';
import { follow, reading } from '../_parts.js';
import { css, loadMeeting, meetingOf, MEETING_START, rangeText, longDay, shortDay, lightOf, trafficLight, sentence, detailTable, ok, money, x } from './_meet.js';
import { defLabel } from '../../defs.js';

/* ---------- what the people in the room picked and typed (this tab only) ---------- */
const ui = { key: null, step: 0, ans: {}, added: {}, notes: {}, rate: null };
const STORE = 'lx5.run.';
function restore(key) {
  if (ui.key === key) return;
  Object.assign(ui, { key, step: 0, ans: {}, added: {}, notes: {}, rate: null });
  try { const s = JSON.parse(sessionStorage.getItem(STORE + key) || 'null'); if (s && typeof s === 'object') Object.assign(ui, s, { key }); } catch {}
}
const keep = () => { try { sessionStorage.setItem(STORE + ui.key, JSON.stringify({ step: ui.step, ans: ui.ans, added: ui.added, notes: ui.notes, rate: ui.rate })); } catch {} };

/* ---------- small helpers ---------- */
const change = (now, was) => ok(now) && ok(was) && was > 0 ? (now - was) / was : null;
const clock = (start, plus) => { const [hh, mm] = String(start).split(':').map(Number); const t = hh * 60 + mm + plus; return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
const lit = b => lightOf(b.mer, b.goal_mer);
const isCurrent = b => !!b.connected && b.current !== false;

/** The weekly report's summary as three parts. Headings are the report's own: What we saw, What it means, What we're doing. */
function splitSummary(text) {
  const out = { saw: [], means: '', doing: [] };
  const s = String(text || '');
  let k = null;
  for (const raw of s.split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    if (/^what we saw/i.test(l)) { k = 'saw'; continue; }
    if (/^what it means/i.test(l)) { k = 'means'; continue; }
    if (/^what we.?re doing/i.test(l)) { k = 'doing'; continue; }
    const t = noDash(l.replace(/^[•\-*]\s*/, ''));
    if (k === 'means') out.means += (out.means ? ' ' : '') + t; else if (k) out[k].push(t);
  }
  /* the route cuts a long summary short: a last line that stops mid sentence is dropped */
  if (s.length >= 2400 && out.doing.length && !/[.!?)]$/.test(out.doing[out.doing.length - 1])) out.doing.pop();
  return out;
}

/* ---------- real mode ----------
   loadMeeting (in _meet.js) is the same three reads Agenda and Pre-read make: ah /api/meetings/monday (quick: the
   scoreboard, the open tasks per brand, the report's own "What we saw" and "What we're doing" lines and what we
   are waiting on from the client), profit /api/hub/command (the MER goals) and ah /api/calls/screen?kind=monday
   (slow: Meta and Google by channel, the pipeline). The room sees the scoreboard as soon as the first lands. */
function build(d, ctx) {
  if (!d || !d.parts) return d;                 // a sample fixture is already in the page's shape
  const m = meetingOf(d, ctx);
  const today = new Date().toLocaleDateString('en-CA');
  const task = t => ({ text: noDash(t.text || t.name || ''), owner: t.owner || '', due: t.due || '', late: !!t.due && t.due < today });
  const brands = (m.brands || []).map(b => {
    const current = !!b.week && !!m.week && b.week.from === m.week.from;
    const parts = b.has_report && current ? splitSummary(b.summary) : { saw: [], means: '', doing: [] };
    const pipe = (b.rows || []).find(r => r.id === 'pipeline');
    return {
      id: b.id, name: b.name, currency: b.currency, connected: b.connected, current, has_report: b.has_report, week: b.week,
      sales: b.sales, sales_prior: b.sales_prior, spend: b.spend, spend_prior: b.spend_prior, mer: b.mer, goal_mer: b.goal_mer,
      owner: b.owner || null, verdict: null,
      happened: parts.saw.slice(0, 3),
      decisions: parts.doing.slice(0, 4).map(text => ({ text, from: 'report' })),
      promises: b.open ? b.open.map(task).filter(t => t.text) : null,
      asks: b.has_report && current ? (b.need || []).map(noDash) : [],
      channels: (b.rows || []).filter(r => r.id === 'meta' || r.id === 'google').map(r => ({ label: r.label, big: r.big, tone: r.tone, status: r.status })),
      pipeline: pipe ? { big: pipe.big, status: pipe.status, detail: pipe.detail } : null,
    };
  });
  return {
    monday: m.monday, week: m.week, as_of: m.as_of, brands,
    theme: m.theme || '',
    agency: { open: (m.agency_open || []).map(task).filter(t => t.text) },
    waiting: m.waiting || null,
    learned: null,           // lessons have no feed: the step is the prompt and the notes box
  };
}

/* ---------- the steps ---------- */
function plan(d) {
  const cur = d.brands.filter(isCurrent);
  const under = cur.filter(b => { const l = lit(b); return l && l.tone !== 'good'; }).sort((p, q) => p.mer / p.goal_mer - q.mer / q.goal_mer);
  const deep = under.slice(0, 3);
  const each = deep.length ? Math.floor(21 / deep.length) : 0;
  const steps = [
    { id: 'scoreboard', name: 'Scoreboard', min: 3, ask: 'Where does every brand stand against its goal?' },
    { id: 'promises', name: 'Promises', min: 5, ask: 'What did we say we would do, and is it done?' },
    { id: 'quick', name: 'Green brands', min: 3, ask: 'On goal. One line each, then move on.' },
    ...deep.map(b => ({ id: 'b:' + b.id, name: b.name, min: each, brand: b })),
    { id: 'pipeline', name: 'Pipeline', min: 5, ask: 'Is anything ready to load, and is anything stuck?' },
    { id: 'learned', name: 'Learned', min: 4, ask: 'One thing that worked and one that did not.' },
    { id: 'agency', name: 'Agency', min: 2, ask: 'Anything that touches every brand?' },
    { id: 'close', name: 'Close', min: 2, ask: 'Read the decisions back. Every one has a number and an owner.' },
  ];
  let at = 0;
  for (const s of steps) { s.at = at; at += s.min; }
  return { steps, total: at, deep, green: cur.filter(b => { const l = lit(b); return l && l.tone === 'good'; }), alsoUnder: under.slice(3),
    noGoal: cur.filter(b => !lit(b)), noReport: d.brands.filter(b => !isCurrent(b)) };
}
const decisionsOf = b => [
  ...(b.decisions || []).map((dc, i) => ({ ...dc, key: b.id + '|' + i })),
  ...((ui.added[b.id] || []).map((text, i) => ({ text, key: b.id + '|a' + i, added: true }))),
];

/* ---------- shared parts ---------- */
function notesBox(id, hint) {
  const ta = h('textarea', { class: 'mr-notes', rows: '4', dataset: { note: id }, placeholder: hint || 'Type what was said. One line per point.', 'aria-label': 'Notes',
    oninput: e => { ui.notes[id] = e.target.value; if (!ui.notes[id]) delete ui.notes[id]; keep(); } });
  ta.value = ui.notes[id] || '';
  return h('section', { class: 'lx-card mr-sec mr-box' }, h('div', { class: 'mt-h' }, h('h3', null, 'Notes'), h('span', null, 'Kept in this tab only. Nothing is saved or sent.')), ta);
}
function fig(label, value, under, { words = false } = {}) {
  return h('div', { class: 'mr-fig' }, h('span', { class: 'l' }, label), h('span', { class: 'v' + (words ? ' w' : '') }, value), under && h('span', { class: 's' }, under));
}
/** The count strip at the top of a step: batch 1 tiles (label, figure, the line under it). */
const countTiles = list => { const k = list.filter(Boolean); return tiles(k.map(([label, value, sub]) => kpi({ label, value, sub })), { cols: k.length >= 3 ? 3 : 2, class: 'mr-tiles' }); };
/** A list section in a card, like Pre-read's "Last week's promises". */
const boxSec = (title, note, ...kids) => h('section', { class: 'lx-card mr-sec mr-box' }, h('div', { class: 'mt-h' }, h('h3', null, title), note ? h('span', null, note) : null), kids);
function taskRow(t, brandName) {
  return h('div', { class: 'mr-task' }, t.owner ? avatar({ name: t.owner }, { size: 40 }) : h('span', { class: 'mr-nobody', role: 'img', 'aria-label': 'No owner' }),
    h('span', { class: 'what' }, t.text, brandName && h('small', null, brandName)),
    h('span', { class: 'who' }, [t.owner || 'No owner', t.due && 'due ' + shortDay(t.due)].filter(Boolean).join(', ')),
    t.done ? statusDot('good', 'Done') : t.late ? statusDot('bad', 'Late') : statusDot('off', 'Open'));
}

/** Everything about one brand: the numbers that matter, what happened, the decisions, what is open, notes.
    Drawn as a step, and in a sheet when a brand is opened from a list. */
function brandView(b, d, ctx, { notes = true } = {}) {
  const box = h('div', { class: 'mr-brand' });
  const cur = b.currency || 'USD';
  const draw = () => {
    const parts = [];
    if (!isCurrent(b)) {
      parts.push(h('p', { class: 'mr-ask' }, !b.connected && b.has_report !== false ? 'No sales source connected, so there is no number to read.' : "No weekly report for last week, so there is nothing to read out."));
    } else {
      const light = lit(b), dS = change(b.sales, b.sales_prior), dP = change(b.spend, b.spend_prior);
      parts.push(h('div', { class: 'mr-nums' },
        fig('Sales', money(b.sales, { cur }), [ok(dS) ? delta(dS, { bad: dS < 0 }) : null, ok(b.sales_prior) ? `from ${money(b.sales_prior, { cur })}` : null]),
        ok(b.spend) ? fig('Ad spend', money(b.spend, { cur }), [ok(dP) ? delta(dP, { plain: true }) : null, ok(b.spend_prior) ? `from ${money(b.spend_prior, { cur })}` : null]) : fig('Ad spend', 'No ad spend read', null, { words: true }),
        ok(b.mer) ? fig('MER, whole store', x(b.mer), ok(b.goal_mer) ? statusDot(light ? light.tone : 'off', 'goal ' + x(b.goal_mer)) : statusDot('off', 'No goal set')) : fig('MER, whole store', 'No MER read', null, { words: true })));
      const wk = b.week || d.week;
      parts.push(h('div', { class: 'mr-src' }, sourceLine(wk ? rangeText(wk.from, wk.to) : 'Last week', 'Triple Whale'), h('span', { class: 'lx-srcline' }, 'Ad spend: all ad platforms')));
      if (b.channels && b.channels.length) parts.push(h('div', { class: 'mr-chanbox' },
        h('span', { class: 'mr-chanl' }, 'ROAS, Triple Whale last click' + (ok(b.goal_mer) ? '. Judged against the store goal ' + x(b.goal_mer) : '')),
        h('div', { class: 'mr-chan' }, b.channels.map(c => h('span', null, h('small', null, c.label), h('b', null, c.big), statusDot(c.tone || 'off', c.status))))));
      const said = b.verdict ? [h('p', { class: 'mr-ask' }, sentence(b.verdict))] : (b.happened || []).length ? [h('ul', { class: 'mr-list' }, b.happened.map(t => h('li', null, t)))] : null;
      if (said) parts.push(boxSec('What happened', b.verdict ? 'last week, whole store' : 'from the weekly report', said));
    }

    /* the decisions */
    const list = decisionsOf(b);
    const pick = (key, what) => () => { if (ui.ans[key] === what) delete ui.ans[key]; else ui.ans[key] = what; keep(); draw(); };
    const input = h('input', { class: 'lx-input mr-in', type: 'text', dataset: { add: b.id }, placeholder: 'Add a decision: what, the number, who', 'aria-label': 'Add a decision',
      onkeydown: e => { if (e.key === 'Enter') addOne(); } });
    const addOne = () => {
      const t = input.value.trim(); if (!t) return;
      (ui.added[b.id] = ui.added[b.id] || []).push(t);
      ui.ans[b.id + '|a' + (ui.added[b.id].length - 1)] = 'yes';
      keep(); draw();
    };
    parts.push(h('section', { class: 'mr-sec' },
      h('div', { class: 'mt-h' }, h('h3', null, 'Decisions to make'), h('span', null, b.owner ? b.owner + ' speaks first' : 'the owner speaks first')),
      list.length ? h('div', { class: 'mr-decs' }, list.map(dc => {
        const a = ui.ans[dc.key];
        return h('div', { class: 'lx-card mr-dec' + (a ? ' ' + a : '') },
          h('div', { class: 'txt' }, h('b', null, dc.text),
            h('small', null, [dc.added ? 'Added on the call' : dc.from === 'report' ? "From the weekly report's plan" : null, dc.owner && 'Owner: ' + dc.owner, dc.win].filter(Boolean).join('. '))),
          dc.number ? h('div', { class: 'num' }, h('span', null, dc.number), dc.number_note && h('small', null, dc.number_note)) : h('span'),
          h('div', { class: 'btns' },
            button('Yes', { primary: a === 'yes' || !a, large: true, class: a === 'yes' ? 'picked' : '', onclick: pick(dc.key, 'yes'), aria: 'Yes: ' + dc.text }),
            button('Not now', { large: true, class: a === 'no' ? 'picked' : '', onclick: pick(dc.key, 'no'), aria: 'Not now: ' + dc.text })));
      })) : h('p', { class: 'mt-none' }, 'No decision is written yet. Agree one, with a number and an owner, and add it here.'),
      h('div', { class: 'mr-add' }, input, button('Add', { large: true, onclick: addOne }))));

    if (b.promises && b.promises.length) {
      const late = b.promises.filter(t => t.late && !t.done).length;
      parts.push(boxSec('Still open', plural(b.promises.length, 'task') + (late ? `, ${late} late` : ''), h('div', null, b.promises.map(t => taskRow(t)))));
    }
    if (b.asks && b.asks.length) parts.push(boxSec('Waiting on the client', plural(b.asks.length, 'thing'), h('ul', { class: 'mr-list sm' }, b.asks.map(t => h('li', null, t)))));
    if (notes) parts.push(notesBox('b:' + b.id));
    put(box, parts);
  };
  draw();
  return box;
}

/** A sheet never outlives its page: leaving the page closes it. */
const leaveWith = sh => { window.addEventListener('hashchange', () => sh.close(), { once: true }); return sh; };
function openBrand(b, d, ctx) {
  const light = lit(b);
  leaveWith(sheet({ title: b.name + (d.week ? ', ' + rangeText(d.week.from, d.week.to) : ''), class: 'mr-sheet',
    body: h('div', { class: 'mr-insheet' }, isCurrent(b) ? trafficLight(light) : null, brandView(b, d, ctx)) }));
}

/* ---------- each step ---------- */
function scoreboard(d, P, ctx) {
  const order = [...P.deep, ...P.alsoUnder, ...P.green, ...P.noGoal, ...P.noReport];
  const row = b => {
    const cur = b.currency || 'USD', light = lit(b), on = isCurrent(b);
    const dS = change(b.sales, b.sales_prior);
    /* one grid for every row: a brand with no report keeps the columns and says so in Status */
    const none = !on ? (!b.connected && b.has_report !== false ? 'No sales source' : 'No weekly report') : null;
    return h('button', { type: 'button', class: 'mr-sb', onclick: () => openBrand(b, d, ctx), 'aria-label': 'Open ' + b.name },
      h('span', { class: 'nm' }, b.name),
      h('span', { class: 'n' }, on ? money(b.sales, { cur }) : ''),
      h('span', { class: 'n' }, on && ok(dS) ? delta(dS, { bad: dS < 0 }) : ''),
      h('span', { class: 'n' }, on ? (ok(b.spend) ? money(b.spend, { cur }) : 'no data') : ''),
      h('span', { class: 'n mer' }, on ? (ok(b.mer) ? x(b.mer) : 'no data') : ''),
      h('span', { class: 'n goal' }, on ? (ok(b.goal_mer) ? x(b.goal_mer) : 'not set') : ''),
      h('span', { class: 'st' }, none ? statusDot('off', none) : light ? trafficLight(light) : statusDot('off', 'No goal set')));
  };
  const head = h('div', { class: 'mr-sb mr-sbh', 'aria-hidden': 'true' },
    h('span', null, 'Brand'), h('span', null, 'Sales'), h('span', null, 'vs week before'),
    h('span', null, 'Ad spend'), h('span', null, defLabel('Store MER', 'mer')), h('span', null, 'MER goal'), h('span', null, 'Status'));
  const cur = d.brands.filter(isCurrent);
  return [
    countTiles([
      ['On goal', String(P.green.length), 'of ' + plural(cur.length, 'brand') + ' with a report'],
      ['Under goal', String(P.deep.length + P.alsoUnder.length), P.deep.length ? P.deep.map(b => b.name).join(', ') : 'none this week'],
      P.noGoal.length + P.noReport.length ? ['No goal or no report', String(P.noGoal.length + P.noReport.length), [...P.noGoal, ...P.noReport].map(b => b.name).join(', ')] : null]),
    h('section', { class: 'mr-sec' }, h('div', { class: 'mt-h' }, h('h3', null, 'Every brand, last week'), h('span', null, (d.week ? rangeText(d.week.from, d.week.to) + ', Mon to Sun' : 'Mon to Sun') + ' · Triple Whale. Furthest under goal first. Tap a brand to open it.')),
      h('div', { class: 'lx-card flush mr-sbs' }, head, order.map(row))),
  ];
}

function promises(d, P) {
  const groups = d.brands.filter(b => b.promises && b.promises.length);
  const known = d.brands.some(b => b.promises);
  const all = groups.flatMap(b => b.promises), late = all.filter(t => t.late && !t.done).length;
  if (!known) return [h('p', { class: 'mt-none' }, 'The open tasks could not be read just now. Go round the room instead.'), notesBox('promises')];
  if (!all.length) return [h('p', { class: 'mr-ask' }, 'No task is open on any brand.'), notesBox('promises')];
  return [
    countTiles([['Open', String(all.length), 'across ' + plural(groups.length, 'brand')], ['Late', String(late), late ? 'past the day they were due' : 'nothing is late']]),
    boxSec('Open tasks by brand', plural(all.length, 'task'), groups.map(b => h('div', { class: 'mr-grp' }, h('h4', null, b.name), b.promises.map(t => taskRow(t))))),
    notesBox('promises'),
  ];
}

function quick(d, P, ctx) {
  const line = b => {
    const light = lit(b);
    return h('button', { type: 'button', class: 'mr-q', onclick: () => openBrand(b, d, ctx), 'aria-label': 'Open ' + b.name },
      h('span', { class: 'nm' }, b.name, b.owner && h('small', null, b.owner)),
      h('span', { class: 'big' }, ok(b.mer) ? x(b.mer) : 'no MER', ok(b.goal_mer) && h('small', null, 'goal ' + x(b.goal_mer))),
      h('span', { class: 'say' }, b.verdict ? sentence(b.verdict) : (b.happened || [])[0] || ''),
      light ? statusDot(light.tone, light.text) : statusDot('off', 'No goal set'));
  };
  const group = (title, note, list) => list.length ? h('section', { class: 'mr-sec' }, h('div', { class: 'mt-h' }, h('h3', null, title), h('span', null, note)), h('div', { class: 'lx-card flush' }, list.map(line))) : null;
  return [
    P.green.length ? null : h('p', { class: 'mr-ask' }, 'No brand is on goal this week.'),
    group('On goal', 'MER, whole store, last week', P.green),
    group('Under goal, not one of the three', 'open one if there is time', P.alsoUnder),
    group('No MER goal set', 'set one in Brand settings, Goals', P.noGoal),
    P.noReport.length ? h('p', { class: 'mt-none' }, 'No weekly report for last week: ' + P.noReport.map(b => b.name).join(', ') + '.') : null,
    notesBox('quick'),
  ];
}

function pipeline(d, P, ctx) {
  const list = d.brands.filter(b => b.pipeline);
  const open = b => leaveWith(sheet({ title: b.name + ', creative in the pipeline', body: h('div', null, detailTable(b.pipeline.detail)) }));
  return [
    list.length ? h('section', { class: 'mr-sec' }, h('div', { class: 'mt-h' }, h('h3', null, 'Creative in the pipeline'), h('span', null, 'ready to load, of everything being made. Tap a brand for the cards.')),
      h('div', { class: 'lx-card flush' }, list.map(b => h('button', { type: 'button', class: 'mr-q pipe', onclick: () => open(b), 'aria-label': 'Open the cards for ' + b.name },
        h('span', { class: 'nm' }, b.name), h('span', { class: 'big' }, b.pipeline.big, h('small', null, 'ready to load')), h('span', { class: 'say' }), statusDot('off', b.pipeline.status)))))
      : d.waiting && d.waiting.screen ? reading('Still reading the pipeline.') : h('p', { class: 'mt-none' }, 'No brand has a card in the pipeline right now.'),
    notesBox('pipeline'),
  ];
}

function learned(d) {
  return [
    d.learned && d.learned.length ? boxSec('Added last week', plural(d.learned.length, 'lesson'),
      h('ul', { class: 'mr-list' }, d.learned.map(l => h('li', null, l.text, (l.brand || l.by) && h('small', null, [l.brand, l.by].filter(Boolean).join(', ')))))) : null,
    notesBox('learned', 'What worked, what did not. Name the brand and the ad.'),
  ];
}

function agency(d) {
  const open = d.agency && d.agency.open;
  return [
    d.theme ? h('p', { class: 'mr-ask' }, "This week's theme: ", h('b', null, d.theme)) : null,
    open && open.length ? boxSec('Open for the whole agency', plural(open.length, 'task'), h('div', null, open.map(t => taskRow(t)))) : null,
    notesBox('agency'),
  ];
}

/** Everything the room agreed, as plain lines. The same lines are what Copy puts on the clipboard. */
function recapOf(d, P) {
  const out = [];
  for (const b of d.brands) {
    const list = decisionsOf(b), yes = list.filter(k => ui.ans[k.key] === 'yes'), no = list.filter(k => ui.ans[k.key] === 'no'), note = ui.notes['b:' + b.id];
    if (yes.length || no.length || note) out.push({ name: b.name, yes, no, note });
  }
  const steps = P.steps.filter(s => !s.brand && ui.notes[s.id]).map(s => ({ name: s.name, note: ui.notes[s.id] }));
  return { brands: out, steps, yes: out.reduce((n, b) => n + b.yes.length, 0), no: out.reduce((n, b) => n + b.no.length, 0) };
}
function recapText(d, r) {
  const L = ['Monday meeting' + (d.monday ? ', ' + longDay(d.monday) : '')];
  for (const b of r.brands) {
    L.push('', b.name);
    b.yes.forEach(k => L.push('Yes: ' + k.text + (k.owner ? ' (' + k.owner + ')' : '')));
    b.no.forEach(k => L.push('Not now: ' + k.text));
    if (b.note) L.push('Notes: ' + b.note);
  }
  for (const s of r.steps) L.push('', s.name, s.note);
  if (ui.rate) L.push('', `The room rated it ${ui.rate} of 10.`);
  return L.join('\n');
}

function close(d, P, ctx, redraw) {
  const r = recapOf(d, P);
  const any = r.brands.length || r.steps.length;
  const copy = async () => {
    try { await navigator.clipboard.writeText(recapText(d, r)); toast('Copied. Paste it where the team will see it.'); }
    catch { toast('Could not copy from this browser', { tone: 'bad' }); }
  };
  return [
    countTiles([['Said yes', String(r.yes), plural(r.brands.filter(b => b.yes.length).length, 'brand')], ['Not now', String(r.no), r.no ? 'left for another week' : 'none set aside']]),
    any ? boxSec('Read it back', 'what was marked on this screen',
      h('div', { class: 'mr-recap' },
        r.brands.map(b => h('div', { class: 'mr-grp' }, h('h4', null, b.name),
          b.yes.map(k => h('div', { class: 'mr-line' }, pill('good', 'Yes'), h('span', null, k.text, k.owner && h('small', null, k.owner)))),
          b.no.map(k => h('div', { class: 'mr-line' }, pill('', 'Not now'), h('span', null, k.text))),
          b.note && h('p', { class: 'mr-note' }, b.note))),
        r.steps.map(s => h('div', { class: 'mr-grp' }, h('h4', null, s.name), h('p', { class: 'mr-note' }, s.note)))))
      : h('p', { class: 'mr-ask' }, 'Nothing is marked yet. Go back and say Yes or Not now on each decision.'),
    h('section', { class: 'mr-sec' }, h('div', { class: 'mt-h' }, h('h3', null, 'Rate the meeting'), h('span', null, '1 to 10, one number for the room')),
      h('div', { class: 'mr-rate', role: 'group', 'aria-label': 'Rate the meeting from 1 to 10' }, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n =>
        h('button', { type: 'button', class: ui.rate === n ? 'on' : '', 'aria-pressed': String(ui.rate === n), onclick: () => { ui.rate = ui.rate === n ? null : n; keep(); redraw(); } }, n)))),
    h('section', { class: 'mr-sec mr-end' },
      h('div', { class: 'mr-endb' }, button('Copy the recap', { primary: true, large: true, onclick: copy, disabled: !any && !ui.rate }),
        button('Post decisions and tasks', { large: true, disabled: true, aria: 'Post decisions and tasks, switched off' }),
        ctx.legacy ? button('Finish in old ' + APP_NAME, { large: true, href: ctx.legacy, icon: 'arrow' }) : null),
      h('p', { class: 'mt-none' }, ctx.sample ? 'Sample: nothing is saved or sent.' : 'Posting from this screen is switched off. Marks and notes live in this tab until it is closed. Copy the recap to keep them.')),
  ];
}

/* ---------- the page ---------- */
let live = null;       // what the arrow keys move: { el, move }
let keysOn = false;
function keys() {
  if (keysOn) return; keysOn = true;
  document.addEventListener('keydown', e => {
    if (!live || !live.el.isConnected || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if (document.querySelector('.lx-overlay')) return;            // a sheet is open
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); live.move(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); live.move(-1); }
  });
}

function draw(el, data, ctx) {
  css(); addStyles('mr-css', CSS); keys();
  const d = data || {};
  d.brands = d.brands || [];
  if (!d.brands.length) return put(el, empty({ title: 'No brands on the Monday meeting yet', text: 'A brand shows here once it has a weekly report.', action: button('Open the agenda', { href: ctx.href('a-meetings', 'agenda') }) }));
  restore((ctx.sample ? 'sample:' : '') + (d.monday || 'week'));
  /* A late part of the meeting lands and the page is drawn again. Someone may be typing in a notes box or in
     "Add a decision": keep what they typed, the step they are on (the steps can shift when the goals land), the
     caret and the scroll. */
  const was = live && live.el.isConnected && el.contains(live.el) ? live.id() : null;
  const box = was && document.activeElement && document.activeElement.matches && document.activeElement.matches('textarea.mr-notes') && live.el.contains(document.activeElement) ? document.activeElement : null;
  const typing = box && { id: box.dataset.note, value: box.value, from: box.selectionStart, to: box.selectionEnd, dir: box.selectionDirection, top: box.scrollTop, x: window.scrollX, y: window.scrollY };
  if (typing) { if (typing.value) ui.notes[typing.id] = typing.value; else delete ui.notes[typing.id]; keep(); }
  /* a decision being typed is not kept anywhere until Enter or Add, so carry every half typed one across by brand id */
  const ins = was ? [...live.el.querySelectorAll('input.mr-in')] : [];
  const drafts = ins.filter(n => n.value).map(n => ({ id: n.dataset.add, value: n.value }));
  const inp = ins.find(n => n === document.activeElement) || null;
  const adding = inp && { id: inp.dataset.add, from: inp.selectionStart, to: inp.selectionEnd, dir: inp.selectionDirection, x: window.scrollX, y: window.scrollY };
  const P = plan(d), S = P.steps;
  if (was) { const at = S.findIndex(s => s.id === was); if (at >= 0) ui.step = at; }
  ui.step = Math.max(0, Math.min(S.length - 1, ui.step | 0));
  const START = ctx.settingNow('agency.meetingStart', MEETING_START);
  const root = h('div', { class: 'mt-page mr' });
  const go = i => { ui.step = Math.max(0, Math.min(S.length - 1, i)); keep(); paint(); try { window.scrollTo(0, 0); } catch {} };
  live = { el: root, move: n => go(ui.step + n), id: () => S[ui.step].id };

  function paint() {
    const i = ui.step, s = S[i], b = s.brand;
    ctx.setTitle(['Run the meeting, ', em(`step ${i + 1} of ${S.length}`)], { eyebrow: d.monday ? 'Monday ' + shortDay(d.monday) + ', last week ' + rangeText(d.week && d.week.from, d.week && d.week.to) : 'Meetings, team' });
    const rail = h('div', { class: 'mr-rail', role: 'tablist', 'aria-label': 'Steps of the meeting' }, S.map((k, n) =>
      h('button', { type: 'button', role: 'tab', class: n === i ? 'on' : n < i ? 'past' : '', 'aria-selected': String(n === i), onclick: () => go(n),
        title: clock(START, k.at) + 'am, ' + plural(k.min, 'minute') }, h('b', null, (n + 1) + '. ' + k.name))));
    const head = h('div', { class: 'mr-head' },
      h('div', null, h('span', { class: 'lx-eyebrow' }, b ? 'Decision brand' : `Step ${i + 1} of ${S.length}`), h('h2', null, s.name)),
      b && isCurrent(b) ? trafficLight(lit(b)) : null,
      h('span', { class: 'when' }, `${clock(START, s.at)}am, ${plural(s.min, 'minute')}`));
    const body = b ? [brandView(b, d, ctx)]
      : s.id === 'scoreboard' ? scoreboard(d, P, ctx)
      : s.id === 'promises' ? promises(d, P)
      : s.id === 'quick' ? quick(d, P, ctx)
      : s.id === 'pipeline' ? pipeline(d, P, ctx)
      : s.id === 'learned' ? learned(d)
      : s.id === 'agency' ? agency(d)
      : close(d, P, ctx, paint);
    const next = S[i + 1];
    const nav = h('div', { class: 'mr-nav' },
      button('Back', { large: true, disabled: i === 0, onclick: () => go(i - 1) }),
      h('span', { class: 'hint' }, 'Arrow keys move between steps'),
      next ? button('Next: ' + next.name, { primary: true, large: true, icon: 'arrow', onclick: () => go(i + 1) }) : button('Back to the start', { large: true, onclick: () => go(0) }));
    put(root, rail, head, !b && s.ask ? h('p', { class: 'mr-ask' }, s.ask) : null, body, nav);
    const on = rail.querySelector('.on'); if (on && on.scrollIntoView) try { on.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch {}
  }
  paint();
  put(el, root);
  if (typing) {
    const now = [...root.querySelectorAll('textarea.mr-notes')].find(t => t.dataset.note === typing.id);
    if (now) try {
      now.focus({ preventScroll: true });
      now.setSelectionRange(typing.from, typing.to, typing.dir || 'none');
      now.scrollTop = typing.top;
      window.scrollTo(typing.x, typing.y);
    } catch {}
  }
  if (drafts.length || adding) {
    const find = id => [...root.querySelectorAll('input.mr-in')].find(n => n.dataset.add === id);
    for (const k of drafts) { const now = find(k.id); if (now && !now.value) now.value = k.value; }
    const now = adding && find(adding.id);
    if (now) try {
      now.focus({ preventScroll: true });
      now.setSelectionRange(adding.from, adding.to, adding.dir || 'none');
      window.scrollTo(adding.x, adding.y);
    } catch {}
  }
}

/* each part of the meeting is painted as it lands */
const paint = (el, d, ctx) => follow(ctx, d, now => draw(el, build(now, ctx), ctx));

export default {
  title: 'Run the meeting',
  eyebrow: 'Meetings, team',
  ranges: false,
  asOf: d => (d && d.parts ? (d.parts.cmd && d.parts.cmd.as_of) || d.at : d && d.as_of) || null,
  load: loadMeeting,
  render: paint,
  update: paint,
};

/* ---------- the page CSS, once. Every class starts with mr-. ---------- */
const CSS = `
.mr{gap:36px}
.mr-rail{display:flex;flex-wrap:wrap;gap:6px;padding:2px 2px 6px}
.mr-rail::-webkit-scrollbar{display:none}
.mr-rail button{flex:none;display:grid;gap:1px;text-align:left;padding:7px 12px;border:0;border-radius:14px;background:var(--bg-sunk);color:var(--ink-2);cursor:pointer;font:inherit}
.mr-rail small{font-size:11.5px;color:var(--faint);font-variant-numeric:tabular-nums}
.mr-rail b{font-size:13px;font-weight:600;white-space:nowrap}
.mr-rail button:hover{color:var(--ink)}
.mr-rail button.past{background:transparent;box-shadow:inset 0 0 0 1px var(--line-strong)}
.mr-rail button.on{background:var(--ink);color:#fff}
.mr-rail button.on small{color:rgba(255,255,255,.72)}
.mr-head{display:flex;align-items:flex-end;gap:14px 28px;flex-wrap:wrap}
.mr-head>div{display:grid;gap:8px;min-width:0}
.mr-head h2{margin:0;font-size:21px;font-weight:600;letter-spacing:-.045em;line-height:1.02;overflow-wrap:anywhere}
.mr-head .mt-light{margin-bottom:8px}
.mr-head .when{margin-left:auto;margin-bottom:10px;color:var(--muted);font-size:16px;font-variant-numeric:tabular-nums;white-space:nowrap}
.mr-ask{margin:0;max-width:940px;font-size:18px;line-height:1.4;letter-spacing:-.018em;color:var(--ink-2)}
.mr-ask b{color:var(--ink);font-weight:600}
.mr-brand{display:grid;gap:36px;min-width:0}
.mr-nums,.mr-counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:48px}
.mr-fig{display:grid;gap:8px;min-width:0;align-content:start}
.mr-fig .l{font-size:14.5px;font-weight:500;color:var(--muted)}
.mr-fig .v{font-size:var(--num-l);font-weight:600;letter-spacing:-.05em;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}
.mr-fig .v.w{font-size:var(--num-m);letter-spacing:-.02em;line-height:1.25;color:var(--ink-2);white-space:normal}
.mr-fig .s{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;font-size:15px;color:var(--muted)}
.mr-chan{display:flex;gap:14px 44px;flex-wrap:wrap}
.mr-chan>span{display:inline-flex;align-items:baseline;gap:12px}
.mr-chan small{font-size:14px;color:var(--muted)}
.mr-chan b{font-size:var(--num-l);font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.mr-sec{display:grid;gap:14px;min-width:0}
.mr-sec .mt-h h3{font-size:var(--fs-section,17px);font-weight:600}
.mr-sec .mt-h>span{font-size:var(--fs-small,12.5px)}
.mr-box{gap:10px}
.mr-box .mr-task:first-of-type,.mr-box .mr-grp:first-of-type{border-top:0}
.mr-box>.mt-h+.mr-grp{border-top:0;padding-top:0}
.mr-box .mr-notes{background:var(--bg-sunk);box-shadow:none;border-radius:var(--r-tbl,12px)}
.mr-src{display:flex;gap:4px 16px;flex-wrap:wrap;margin-top:-20px}
.mr-chanbox{display:grid;gap:10px;padding-top:20px;border-top:1px solid var(--line)}
.mr-chanl{font-size:var(--fs-small,12.5px);color:var(--muted)}
.mr-list{margin:0;padding:0;list-style:none;display:grid;gap:14px;max-width:1000px}
.mr-list li{position:relative;padding-left:26px;font-size:17px;line-height:1.42;letter-spacing:-.012em;color:var(--ink-2)}
.mr-list li::before{content:"";position:absolute;left:4px;top:.58em;width:8px;height:8px;border-radius:50%;background:var(--ink)}
.mr-list li small{display:block;font-size:13.5px;color:var(--muted);margin-top:2px}
.mr-list.sm li{font-size:17px}
.mr-decs{display:grid;gap:14px}
.mr-dec{display:grid;grid-template-columns:minmax(0,1fr) auto 150px;gap:36px;align-items:center;padding:26px 32px}
.mr-dec .txt{display:grid;gap:8px;min-width:0}
.mr-dec .txt b{font-size:var(--num-m);font-weight:600;letter-spacing:-.026em;line-height:1.28}
.mr-dec .txt small{font-size:14px;color:var(--muted)}
.mr-dec .num{display:grid;gap:2px;padding-left:36px;border-left:1px solid var(--line)}
.mr-dec .num span{font-size:var(--num-l);font-weight:600;letter-spacing:-.045em;line-height:1;font-variant-numeric:tabular-nums;white-space:nowrap}
.mr-dec .num small{font-size:13px;color:var(--muted)}
.mr-dec .btns{display:grid;gap:10px}
.mr-dec .btns .lx-btn{justify-content:center}
.mr-dec .lx-btn.picked{box-shadow:inset 0 0 0 2px var(--ink)}
.mr-dec.yes{box-shadow:inset 0 0 0 2px var(--good),var(--sh-1)}
.mr-dec.no{opacity:.62}
.mr-dec.no .txt b{text-decoration:line-through;text-decoration-thickness:1.5px}
.mr-add{display:flex;gap:10px;align-items:center;max-width:760px}
.mr-add .mr-in{flex:1;min-width:0;height:48px;font-size:16px}
.mr-notes{display:block;width:100%;min-height:132px;padding:16px 18px;border:0;border-radius:16px;background:#fff;box-shadow:0 0 0 1px var(--line-strong),0 1px 2px rgba(28,20,10,.04);font:500 18px/1.5 var(--sans);color:var(--ink);resize:vertical}
.mr-notes:focus{outline:2px solid var(--ink);outline-offset:1px}
.mr-task{display:flex;align-items:center;gap:16px;min-height:68px;padding:10px 0;border-top:1px solid var(--line)}
.mr-task:first-child{border-top:0}
.mr-task .what{flex:1;min-width:0;font-size:18px;font-weight:500;letter-spacing:-.012em;line-height:1.35}
.mr-task .what small{display:block;font-size:13px;font-weight:500;color:var(--muted)}
.mr-task .who{width:190px;font-size:14px;color:var(--muted)}
.mr-task>.lx-stat{flex:none;min-width:74px}
.mr-nobody{flex:none;width:40px;height:40px;border-radius:50%;background:var(--bg-sunk);box-shadow:inset 0 0 0 1.5px var(--line-strong)}
.mr-grp{display:grid;gap:4px;padding:18px 0;border-top:1px solid var(--line)}
.mr-grp:first-child{border-top:0;padding-top:0}
.mr-grp h4{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-.01em}
.mr-sbs{overflow:hidden}
.mr-sb{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(5,minmax(0,1fr)) 120px;gap:16px;align-items:center;width:100%;min-height:var(--row-h-roomy);padding:6px 24px;border:0;border-top:1px solid var(--line);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer}
.mr-sb:first-child{border-top:0}
.mr-sb:hover,.mr-q:hover{background:var(--row-hover)}
.mr-sb .nm{display:flex;align-items:center;gap:12px;min-width:0;font-size:16px;font-weight:600;letter-spacing:-.015em}
.mr-sbh{min-height:32px;cursor:default;font-size:var(--fs-colhead,11.5px);font-weight:600;letter-spacing:0;white-space:nowrap;text-transform:none;color:var(--muted)}
.mr-sbh:hover{background:none!important}
.mr-sb .n{font-size:var(--num-s);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.mr-sb .n.goal{color:var(--muted);font-weight:500}
.mr-sb .st{justify-self:start}
.mr-sb .nm i{flex:none;width:12px;height:12px;border-radius:50%;background:#E4E2DC}
.mr-sb .nm i.good{background:var(--good)}.mr-sb .nm i.warn{background:var(--watch)}.mr-sb .nm i.bad{background:var(--bad)}
.mr-sb .n{display:grid;gap:1px;min-width:0;justify-items:start}
.mr-sb .n small{font-size:12px;color:var(--muted)}
.mr-sb .n b{font-size:var(--num-s);font-weight:600;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.mr-sb .n em{font-style:normal;font-size:13px;color:var(--muted)}
.mr-sb .n.mer b{font-size:var(--num-s)}
.mr-sb .n.none{grid-column:2/5;font-size:16px;font-weight:500;color:var(--muted)}
.mr-q{display:grid;grid-template-columns:minmax(0,220px) 190px minmax(0,1fr) 110px;gap:24px;align-items:center;width:100%;min-height:84px;padding:14px 30px;border:0;border-top:1px solid var(--line);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer}
.mr-q:first-child{border-top:0}
.mr-q .nm{font-size:20px;font-weight:600;letter-spacing:-.02em;min-width:0}
.mr-q .nm small{display:block;font-size:13px;font-weight:500;color:var(--muted)}
.mr-q .big{font-size:var(--num-l);font-weight:600;letter-spacing:-.035em;font-variant-numeric:tabular-nums;white-space:nowrap}
.mr-q .big small{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted);margin-left:8px}
.mr-q .say{font-size:15.5px;line-height:1.4;color:var(--ink-2);min-width:0}
.mr-q .say b{font-weight:600;color:var(--ink)}
.mr-recap{display:grid}
.mr-line{display:flex;align-items:flex-start;gap:14px;padding:8px 0;font-size:19px;line-height:1.4;letter-spacing:-.012em}
.mr-line .lx-pill{flex:none;margin-top:3px;min-width:70px;justify-content:center}
.mr-line small{display:block;font-size:13.5px;color:var(--muted)}
.mr-note{margin:6px 0 0;font-size:16px;line-height:1.5;color:var(--ink-2);white-space:pre-wrap;max-width:900px}
.mr-rate{display:flex;gap:8px;flex-wrap:wrap}
.mr-rate button{width:56px;height:56px;border:0;border-radius:16px;background:var(--bg-sunk);font:600 20px var(--sans);color:var(--ink-2);cursor:pointer;font-variant-numeric:tabular-nums}
.mr-rate button.on{background:var(--ink);color:#fff}
.mr-endb{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
.mr-nav{display:flex;align-items:center;gap:16px;padding-top:28px;border-top:1px solid var(--line)}
.mr-nav .hint{flex:1;text-align:center;font-size:13px;color:var(--faint)}
.mr-nav .lx-btn{min-height:52px;padding-left:24px;padding-right:24px;font-size:16px}
.mr-insheet{display:grid;gap:24px;min-width:0}
.mr-insheet .mt-light{justify-self:start;box-shadow:inset 0 0 0 1px var(--line-strong)}
.mr-sheet .mr-brand{gap:28px}
.mr-sheet .mr-nums{grid-template-columns:1fr;gap:22px}
.mr-sheet .mr-fig .v{font-size:var(--num-l)}
.mr-sheet .mr-dec{grid-template-columns:1fr;gap:18px;padding:20px}
.mr-sheet .mr-dec .num{padding-left:0;border-left:0}
.mr-sheet .mr-dec .btns{grid-template-columns:1fr 1fr}
.mr-sheet .mr-dec .txt b{font-size:19px}
.mr-sheet .mr-list li{font-size:16.5px}
.mr-sheet .mr-task .who{width:auto}
@media (max-width:1040px){
  .mr-nums,.mr-counts{gap:28px}
  .mr-fig .v{font-size:var(--num-l)}
  .mr-dec{grid-template-columns:minmax(0,1fr) auto;gap:22px}
  .mr-dec .btns{grid-column:1/-1;grid-template-columns:1fr 1fr}
  .mr-sb{grid-template-columns:minmax(0,1.3fr) repeat(5,minmax(0,1fr)) 104px;gap:10px;padding:6px 16px}
  .mr-q{grid-template-columns:minmax(0,180px) 160px minmax(0,1fr);gap:16px;padding:14px 20px}
  .mr-q>.lx-stat{display:none}
}
@media (max-width:759px){
  .mr{gap:26px}
  .mr-head h2{font-size:19px}
  .mr-head .when{margin-left:0;margin-bottom:0;flex:1 1 100%;font-size:14.5px}
  .mr-ask{font-size:18px}
  .mr-brand{gap:28px}
  .mr-nums,.mr-counts{grid-template-columns:1fr;gap:22px}
  .mr-fig .v{font-size:var(--num-l)}
  .mr-chan{gap:10px 28px}
  .mr-src{margin-top:-14px}
  .mr-chan b{font-size:var(--num-m)}
  .mr-list li{font-size:17px}
  .mr-dec{grid-template-columns:1fr;gap:18px;padding:20px 18px}
  .mr-dec .txt b{font-size:20px}
  .mr-dec .num{padding-left:0;border-left:0}
  .mr-dec .num span{font-size:var(--num-l)}
  .mr-add{flex-wrap:wrap}
  .mr-add .mr-in{flex:1 1 100%}
  .mr-notes{font-size:16px}
  .mr-task{display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:2px 12px;align-items:center}
  .mr-task .what{grid-column:2;font-size:16px}
  .mr-task .who{grid-column:2;grid-row:2;width:auto}
  .mr-task>.lx-stat{grid-column:3;grid-row:1/3;min-width:0}
  .mr-sb{grid-template-columns:1fr 1fr 1fr;gap:8px 12px;padding:14px 18px}
  .mr-sbh{display:none}
  .mr-sb .nm{grid-column:1/-1;font-size:16px}
  .mr-sb .n:empty{display:none}
  .mr-sb .n b,.mr-sb .n.mer b{font-size:var(--num-s)}
  .mr-rail{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .mr-sb .n.none{grid-column:1/-1;font-size:14.5px}
  .mr-q{grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;padding:16px 18px}
  .mr-q .nm{font-size:17px}
  .mr-q .big{font-size:var(--num-m);text-align:right}
  .mr-q .big small{display:block;margin-left:0}
  .mr-q .say{grid-column:1/-1;font-size:14.5px}
  .mr-q .say:empty{display:none}
  .mr-line{font-size:16.5px}
  .mr-rate button{width:calc(20% - 7px);height:50px}
  .mr-nav{flex-wrap:wrap;gap:10px}
  .mr-nav .hint{display:none}
  .mr-nav .lx-btn{flex:1 1 auto;justify-content:center}
}`;
