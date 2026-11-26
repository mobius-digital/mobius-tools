/* One automation is one sentence: when, if, do, tell. This file cleans what a person typed and writes
   the sentence with its changeable words marked. Pure: no reads, no writes. */
// from account-health/worker/src/automations.js (cleanAutomation, sentence)
import { lower } from '../platform/text.js';
import { clip, noDash, isEmail, int, hourWord, DAY_NAME, STAGES, STAGE_WORD, METRIC_WORD, WINDOW_WORD, EVERY_WORD,
  TRIGGERS, ROLES, PROPOSALS } from './words.js';

/* The "when" part, cleaned. Returns { when } or { error }. */
function cleanWhen(w, type) {
  const when = { type };
  if (type === 'schedule') {
    when.every = ['day', 'weekday', 'week', 'month'].includes(w.every) ? w.every : 'weekday';
    when.hour = int(w.hour, 0, 23, 8);
    if (when.every === 'week') when.day = DAY_NAME[w.day] ? w.day : 'mon';
  } else if (type === 'card_status' || type === 'card_stale') {
    if (!STAGES.includes(w.status)) return { error: 'Pick the stage: Brief, Making, Review, Ready, Scheduled, Live or Off.' };
    when.status = w.status;
    if (type === 'card_stale') when.days = int(w.days, 1, 60, 5);
  } else if (type === 'plan_missing' || type === 'report_unsent') {
    when.hour = int(w.hour, 0, 23, type === 'plan_missing' ? 10 : 12);
  } else if (type === 'report_drafted') {
    when.period = ['weekly', 'monthly'].includes(w.period) ? w.period : 'any';
  } else if (type === 'sync_failing') {
    when.hours = int(w.hours, 6, 240, 30);
  } else if (type === 'metric') {
    if (!METRIC_WORD[w.metric]) return { error: 'Pick the number: ad spend, MER or ROAS.' };
    when.metric = w.metric;
    when.window = w.window === 'yesterday' ? 'yesterday' : 'last7';
    when.compare = w.compare === 'above' ? 'above' : 'below';
    if (w.line === 'goal') when.line = 'goal';
    else {
      const n = Number(w.line);
      if (!Number.isFinite(n) || n < 0) return { error: 'Type the line as a number, or pick the brand\'s goal.' };
      when.line = n;
    }
  }
  return { when };
}

function cleanIf(list) {
  const conds = [];
  for (const c of Array.isArray(list) ? list.slice(0, 4) : []) {
    if (c && c.type === 'days' && ['weekdays', 'weekend'].includes(c.value)) conds.push({ type: 'days', value: c.value });
    else if (c && c.type === 'title_has' && String(c.value || '').trim()) conds.push({ type: 'title_has', value: clip(String(c.value).trim(), 60) });
  }
  return conds;
}

/* The "do" part, cleaned. Returns { acts } or { error }. */
function cleanDo(list, type) {
  const acts = [];
  for (const a of Array.isArray(list) ? list.slice(0, 5) : []) {
    const t = a && a.type;
    if (t === 'task') {
      if (!String(a.text || '').trim()) return { error: 'Write what the task says.' };
      acts.push({ type: 'task', text: noDash(clip(String(a.text).trim(), 160)), due_days: int(a.due_days, 0, 30, 1) });
    } else if (t === 'draft_report') acts.push({ type: 'draft_report', period: a.period === 'monthly' ? 'monthly' : 'weekly' });
    else if (t === 'ai_check') {
      if (!/^card_/.test(type)) return { error: 'The AI checker looks at a card, so it needs a card trigger.' };
      acts.push({ type: 'ai_check' });
    } else if (t === 'propose' || t === 'stop_spend') {
      acts.push({ type: t, change: PROPOSALS[a.change] ? a.change : 'pause', note: noDash(clip(String(a.note || '').trim(), 200)) });
    }
  }
  return { acts };
}

function cleanWho(list) {
  const who = [];
  for (const p of Array.isArray(list) ? list.slice(0, 12) : []) {
    if (!p || typeof p !== 'object') continue;
    if (p.kind === 'me' || p.kind === 'team' || p.kind === 'clients') who.push({ kind: p.kind });
    else if (p.kind === 'person' && isEmail(p.email)) who.push({ kind: 'person', email: lower(p.email) });
    else if (p.kind === 'role' && ROLES[p.role]) who.push({ kind: 'role', role: p.role });
  }
  return who;
}

/** A saved or typed automation, cleaned. Returns { automation } or { error } in plain words. */
export function cleanAutomation(given, { owner = false } = {}) {
  const b = given && typeof given === 'object' ? given : {};
  const w = b.when && typeof b.when === 'object' ? b.when : {};
  const type = String(w.type || '');
  if (!TRIGGERS[type]) return { error: 'Pick what sets it off first.' };
  const cw = cleanWhen(w, type);
  if (cw.error) return cw;
  const conds = cleanIf(b.if);
  const cd = cleanDo(b.do, type);
  if (cd.error) return cd;
  const acts = cd.acts;
  const tw = b.tell && typeof b.tell === 'object' ? b.tell : {};
  const who = cleanWho(tw.who);
  if (!who.length && !acts.length) return { error: 'Pick who to tell, or something to do.' };
  const tell = { who, text: noDash(clip(String(tw.text || '').trim(), 240)) };
  const state = ['on', 'draft', 'paused'].includes(b.state) ? b.state : b.state === 'ask_first' ? 'on' : 'draft';
  const brand = !b.brand || b.brand === 'all' ? 'all' : clip(String(b.brand), 64);
  const automation = { name: noDash(clip(String(b.name || '').trim(), 80)), brand, when: cw.when, if: conds, do: acts, tell, state,
    template: b.template ? clip(String(b.template), 40) : null,
    may_act_alone: owner && b.may_act_alone === true && acts.some(a => a.type === 'stop_spend') };
  if (!automation.name) automation.name = clip(sentence(automation).text, 200);
  return { automation };
}

function whenWords(w, T, S) {
  if (w.type === 'schedule') {
    S('when.every', w.every === 'week' ? `Every ${DAY_NAME[w.day] || 'Monday'}` : EVERY_WORD[w.every] || 'Every weekday');
    T(' at ');
    S('when.hour', hourWord(w.hour ?? 8));
    return;
  }
  T('When ');
  if (w.type === 'card_status') { T('a production card moves to '); S('when.status', STAGE_WORD[w.status] || w.status); }
  else if (w.type === 'card_stale') { T('a card has sat in '); S('when.status', STAGE_WORD[w.status] || w.status); T(' for '); S('when.days', `${w.days} days`); }
  else if (w.type === 'plan_missing') { T('a daily plan is missing by '); S('when.hour', hourWord(w.hour ?? 10)); }
  else if (w.type === 'report_drafted') { T('a '); S('when.period', w.period === 'any' || !w.period ? 'weekly or monthly' : w.period); T(' report is drafted'); }
  else if (w.type === 'report_unsent') { T('a report is still unsent at '); S('when.hour', hourWord(w.hour ?? 12)); }
  else if (w.type === 'sync_failing') { T('a brand\'s numbers have not synced for '); S('when.hours', `${w.hours} hours`); }
  else if (w.type === 'metric') {
    S('when.metric', METRIC_WORD[w.metric] || w.metric); T(' '); S('when.window', WINDOW_WORD[w.window] || w.window); T(' is ');
    S('when.compare', w.compare === 'above' ? 'over' : 'under'); T(' ');
    S('when.line', w.line === 'goal' ? 'the brand\'s goal' : w.metric === 'spend' ? `$${Number(w.line).toLocaleString('en-US')}` : `${Number(w.line).toFixed(2)}x`);
  } else T('this happens');
}

function doWords(list, T, S) {
  (list || []).forEach((x, i) => {
    T(', ');
    if (x.type === 'task') {
      T('put '); S(`do.${i}.text`, `"${x.text}"`); T(' on the home list, due in ');
      S(`do.${i}.due_days`, x.due_days === 0 ? '0 days' : `${x.due_days} day${x.due_days === 1 ? '' : 's'}`);
    } else if (x.type === 'draft_report') { T('draft the '); S(`do.${i}.period`, x.period); T(' report and hold it'); }
    else if (x.type === 'ai_check') T('ask the AI checker to look at it');
    else if (x.type === 'propose') { T('suggest '); S(`do.${i}.change`, PROPOSALS[x.change] || 'a change'); T(' and wait for an answer'); }
    else if (x.type === 'stop_spend') { T('stop the spend by '); S(`do.${i}.change`, PROPOSALS[x.change] || 'pausing it'); }
  });
}

const whoWord = p => (p.kind === 'me' ? 'me' : p.kind === 'team' ? 'the whole team' : p.kind === 'clients' ? 'the client\'s people'
  : p.kind === 'role' ? ROLES[p.role] : p.email);

/** The automation as one sentence. parts: [{ t: 'text' | 'slot', text, key }], a slot is a word a person can change. */
export function sentence(a, { brandName } = {}) {
  const P = [];
  const T = text => P.push({ t: 'text', text });
  const S = (key, text) => P.push({ t: 'slot', key, text: String(text) });
  whenWords(a.when || {}, T, S);
  T(', for ');
  S('brand', a.brand && a.brand !== 'all' ? brandName || 'one brand' : 'any brand');
  for (const c of a.if || []) {
    if (c.type === 'days') { T(', if it is a '); S('if.days', c.value === 'weekend' ? 'weekend' : 'weekday'); }
    else if (c.type === 'title_has') { T(', if the name has '); S('if.title_has', `"${c.value}"`); }
  }
  doWords(a.do, T, S);
  const who = (a.tell && a.tell.who) || [];
  if (who.length) {
    T((a.do || []).length ? ', then tell ' : ', tell ');
    who.forEach((p, i) => {
      if (i) T(i === who.length - 1 ? ' and ' : ', ');
      S(`tell.who.${i}`, whoWord(p));
    });
    T(', each in their own way');
  }
  T('.');
  return { text: P.map(p => p.text).join(''), parts: P };
}
