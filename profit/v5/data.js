/* Reading data. Five things:
   api()        one call to either worker with the stored session token
   cached()     paint from the last saved copy at once, refresh behind (IndexedDB)
   fixture()    sample mode files, so a page draws with no login and no API call
   setting()    one way to read and save a setting, wherever it lives (a worker or this person's own store)
   rangeOf()    the date range in the page head, as real dates */

import { workers, token, SAMPLE, LS, LS5 } from './config.js';
import { tryEngine, shadow } from './engine.js';

export { SAMPLE };

/* ---------- api ---------- */
export class ApiError extends Error {
  /** body: the JSON the server answered with ({} when it sent none), so a page can read a reply code. */
  constructor(message, status, body = null) { super(message); this.status = status; this.body = body; }
}

/** api('/api/overview?days=7')            profit worker (the default)
    api('/api/me', { worker: 'ah' })       account-health worker
    api(path, { method: 'POST', body: {...} })   body is sent as JSON
    Throws ApiError with .status. In sample mode it always throws: pages must not call it there. */
export async function api(path, opts = {}) {
  if (SAMPLE) throw new ApiError('Sample mode never calls the API: ' + path, 0);
  const { worker = 'profit', body, headers, ...rest } = opts;
  const which = worker === 'ah' ? 'ah' : 'profit';
  const init = {
    ...rest,
    body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    headers: { Authorization: 'Bearer ' + token(), ...(body != null ? { 'Content-Type': 'application/json' } : {}), ...(headers || {}) },
  };
  /* The new engine answers only when this browser is set to it and the path is ported (engine.js).
     A read it gets wrong is asked of the old engine below and noted, so no page breaks because of it.
     A write that may already have run there is final: asking the old engine too could save it twice. */
  const eng = await tryEngine(which, path, init);
  if (eng && eng.ok) return eng.json;
  if (eng && eng.final) {
    if (eng.status === 401) window.dispatchEvent(new CustomEvent('lx:unauthorized'));
    throw new ApiError(eng.error || 'HTTP ' + eng.status, eng.status);
  }
  const res = await fetch(workers()[which] + path, init);
  const j = await res.json().catch(() => ({}));
  if (eng) eng.note(res.status);
  else if (res.ok) shadow(which, path, init, j);
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent('lx:unauthorized'));
    throw new ApiError(j.error || 'HTTP ' + res.status, res.status, j);
  }
  return j;
}

/* ---------- the saved copy (IndexedDB) ---------- */
const DB_NAME = 'lx5', STORE = 'pages';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise(resolve => {
    if (SAMPLE) return resolve(null);                  // sample numbers are never saved
    setTimeout(() => resolve(null), 600);              // a browser that never answers must not hold the page
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
const MEM = new Map();     // same session, and the fallback when IndexedDB is off
function idb(mode, fn) {
  return db().then(d => d ? new Promise(resolve => {
    setTimeout(() => resolve(undefined), 600);
    try {
      const tx = d.transaction(STORE, mode);
      const r = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(r ? r.result : undefined);
      tx.onerror = tx.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  }) : undefined);
}

let USER = 'anon';
/** Saved copies are stamped with the signed in person, so one login never sees another's numbers. */
export function setUser(email) { USER = (email || 'anon').toLowerCase(); }
const full = key => (SAMPLE ? 'sample' : USER) + '|' + key;

export async function getSaved(key) {
  const k = full(key);
  if (MEM.has(k)) return MEM.get(k);
  const v = await idb('readonly', s => s.get(k));
  if (v) MEM.set(k, v);
  return v || null;
}
export async function putSaved(key, data) {
  const rec = { data, asOf: Date.now() };
  MEM.set(full(key), rec);
  await idb('readwrite', s => s.put(rec, full(key)));
  return rec;
}
/** Drop one saved copy (dropSaved('boot') after the setup gate opens, so the next load reads /api/me again). */
export async function dropSaved(key) {
  MEM.delete(full(key));
  await idb('readwrite', s => s.delete(full(key)));
}
/** Wipe every saved copy. Called on sign out. */
export async function wipeSaved() {
  MEM.clear();
  await idb('readwrite', s => s.clear());
}

const INFLIGHT = new Map();
export const STALE_MS = 5 * 60e3;

/** Stale while revalidate.
    const { data, asOf } = await cached(key, fetcher, onFresh, { maxAge })
    Resolves at once with the saved copy when there is one (data may be older; asOf is when it was saved)
    and fetches behind; onFresh({ data, asOf }) is called when the fresh answer lands and differs.
    With no saved copy it waits for the fetcher. A copy younger than maxAge (default 20 s) is not refetched.
    onFresh.error(e) is called, when set, if the refresh behind fails. */
export async function cached(key, fetcher, onFresh, { maxAge = 20e3 } = {}) {
  const saved = await getSaved(key);
  const refresh = () => {
    const k = full(key);
    if (!INFLIGHT.has(k)) {
      INFLIGHT.set(k, Promise.resolve().then(fetcher).then(data => putSaved(key, data)).finally(() => INFLIGHT.delete(k)));
    }
    return INFLIGHT.get(k);
  };
  if (!saved) { const rec = await refresh(); return { data: rec.data, asOf: rec.asOf, fresh: true }; }
  if (Date.now() - saved.asOf > maxAge) {
    refresh().then(rec => { if (onFresh && !same(rec.data, saved.data)) onFresh({ data: rec.data, asOf: rec.asOf, fresh: true }); else if (onFresh && onFresh.touch) onFresh.touch(rec.asOf); },
      e => { if (onFresh && onFresh.error) onFresh.error(e); });
  }
  return { data: saved.data, asOf: saved.asOf, fresh: false };
}
function same(a, b) { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } }

/** The saved copy key for a page: brand, page and dates (the user is added by the store).
    The dates are in the key, so each range keeps its own saved copy and never shows another's numbers. */
export function pageKey({ view, brandId, line, tab, range, client = false }) {
  const r = range ? (range.from || '') + ':' + (range.to || '') : '';
  /* a client's copy (and the team's "See as client") is kept apart, so a team copy is never painted for a client */
  return ['page', view, brandId || 'all', line, tab, r].join('|') + (client ? '|client' : '');
}

/* ---------- sample mode ---------- */
const BASE = new URL('./', import.meta.url);
/** fixture('home/_sample/index.json') reads a file under pages/. Static files only, never an API. */
export async function fixture(path) {
  const res = await fetch(new URL('pages/' + path, BASE), { cache: 'no-store' });
  if (!res.ok) throw new Error('No sample file at pages/' + path);
  return res.json();
}

/* ---------- other tabs ---------- */
let bc = null;
try { bc = new BroadcastChannel('lx5'); } catch {}
/** Tell the other open tabs that something changed (a write), so they refresh. */
export function announce(what) { try { bc && bc.postMessage({ what, at: Date.now() }); } catch {} }
export function onAnnounce(fn) { if (bc) bc.addEventListener('message', e => fn(e.data)); }

/** True when the stored role says client before /api/me has answered. */
export const storedClient = () => { try { return localStorage.getItem(LS.role) === 'client'; } catch { return false; } };

/* ---------- settings: one door, so a page never types a time, a person or a threshold ----------
   A key says where the setting lives:
     'agency.<name>'           the agency settings the workers already keep (GET and PUT /api/settings, account-health).
                               Names that exist today: morningHour, morningCard, slackChannel, slackSendWho, paceAlertPct,
                               movedPost, marketHandles, marketChatter, seasonTab, dailyBriefsChannel, briefClientStyle,
                               todayPost, actionRemind, minOffPost, buyerPost, buyerOwner, buyerChannel.
     'brand:<brand id>.<name>' a brand's own number.
                               target_roas, target_cpa   the goals: read from the brand list, saved with
                                                         PUT /api/accounts/<brand id> (account-health)
                               judge_spend, judge_days, yellow_pct, min_track, min_spend, min_days, min_cap_pct
                                                         the test rules: GET and PUT /api/brand/rules?act= (profit)
     anything else             this person's own store on this device (the date range, notification choices,
                               working hours, and every agency setting that has no worker key yet, such as
                               'meeting.prereadTime').
   When a worker key is added later, add its name to AGENCY_KEYS or BRAND_RULES and no page changes.
   In sample mode nothing reaches a worker: every key reads and saves in the sample person's local store. */
const AGENCY_KEYS = ['morningHour', 'morningCard', 'slackChannel', 'slackSendWho', 'paceAlertPct', 'movedPost', 'marketHandles', 'marketChatter',
  'seasonTab', 'dailyBriefsChannel', 'briefClientStyle', 'todayPost', 'actionRemind', 'minOffPost', 'buyerPost', 'buyerOwner', 'buyerChannel',
  /* 2026-11-26: who each kind of message comes from, { all, kinds } (account-health sender.js) */
  'senders',
  /* 2026-11-26: quiet jobs { [id]: bool }, agency features { creatorProgram, socialPosting }, Slack and email copies
     of urgent alerts (account-health PUT /api/settings, owner only) */
  'jobs', 'features', 'notifyCopies'];
const BRAND_GOALS = ['target_roas', 'target_cpa'];
const BRAND_RULES = ['judge_spend', 'judge_days', 'yellow_pct', 'min_track', 'min_spend', 'min_days', 'min_cap_pct'];

const localKey = () => LS5.set + '|' + (SAMPLE ? 'sample' : USER);
function localAll() { try { return JSON.parse(localStorage.getItem(localKey()) || '{}') || {}; } catch { return {}; } }
function localPut(key, value) {
  const all = localAll();
  if (value === undefined || value === null) delete all[key]; else all[key] = value;
  try { localStorage.setItem(localKey(), JSON.stringify(all)); } catch {}
}
/** Where a key lives: { kind: 'agency' | 'goal' | 'rule' | 'local', name, brand } */
export function settingHome(key) {
  let m;
  if (!SAMPLE && (m = /^agency\.(\w+)$/.exec(key)) && AGENCY_KEYS.includes(m[1])) return { kind: 'agency', name: m[1] };
  if (!SAMPLE && (m = /^brand:([^.]+)\.(\w+)$/.exec(key))) {
    if (BRAND_GOALS.includes(m[2])) return { kind: 'goal', brand: m[1], name: m[2] };
    if (BRAND_RULES.includes(m[2])) return { kind: 'rule', brand: m[1], name: m[2] };
  }
  return { kind: 'local', name: key };
}
const SET_MEM = new Map();          // one read per place per session: 'agency', 'rule:<brand>', 'goal:<brand>'
function readOnce(k, fn) { if (!SET_MEM.has(k)) SET_MEM.set(k, fn().catch(e => { SET_MEM.delete(k); throw e; })); return SET_MEM.get(k); }

/** const hour = await setting('agency.morningHour', 5)
    Reads the setting from where it lives. The fallback comes back when it is not set or the worker did not answer. */
export async function setting(key, fallback) {
  const home = settingHome(key);
  try {
    if (home.kind === 'agency') { const all = await readOnce('agency', () => api('/api/settings', { worker: 'ah' })); return all[home.name] ?? fallback; }
    if (home.kind === 'rule') { const r = await readOnce('rule:' + home.brand, () => api('/api/brand/rules?act=' + encodeURIComponent(home.brand))); return (r.rules || r)[home.name] ?? fallback; }
    if (home.kind === 'goal') { const b = await readOnce('goal:' + home.brand, () => api('/api/brands', { worker: 'ah' }).then(j => (j.brands || []).find(x => x.id === home.brand) || {})); return b[home.name] ?? fallback; }
  } catch { return fallback; }
  return settingNow(key, fallback);
}
/** The same without waiting, from this person's own store only. For a first paint (the date range, a remembered tab). */
export function settingNow(key, fallback) { const v = localAll()[key]; return v === undefined ? fallback : v; }

/** await saveSetting('agency.morningHour', 6) saves where the setting lives. Throws ApiError when a worker says no.
    A local key saves at once and never throws. Other open tabs are told, so they pick it up. */
export async function saveSetting(key, value) {
  const home = settingHome(key);
  if (home.kind === 'agency') { await api('/api/settings', { worker: 'ah', method: 'PUT', body: { [home.name]: value } }); SET_MEM.delete('agency'); }
  else if (home.kind === 'rule') { await api('/api/brand/rules?act=' + encodeURIComponent(home.brand), { method: 'PUT', body: { [home.name]: value } }); SET_MEM.delete('rule:' + home.brand); }
  else if (home.kind === 'goal') { await api('/api/accounts/' + encodeURIComponent(home.brand), { worker: 'ah', method: 'PUT', body: { [home.name]: value } }); SET_MEM.delete('goal:' + home.brand); }
  else localPut(key, value);
  announce('setting:' + key);
  return value;
}

/* ---------- the date range in the page head ---------- */
export const RANGES = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: 'Last 7 days' },
  { id: '14d', label: 'Last 14 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'custom', label: 'Custom' },
];
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dayOf = str => new Date(str + 'T12:00:00');
const short = str => dayOf(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
/** "Nov 1 to 22", "Oct 25 to Nov 23", "Nov 22" */
export function datesLabel(from, to) {
  if (!from || !to) return '';
  if (from === to) return short(from);
  const a = dayOf(from), b = dayOf(to);
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? `${short(from)} to ${b.getDate()}` : `${short(from)} to ${short(to)}`;
}
/** rangeOf({ preset, from, to }) : the saved choice as real dates, worked out now.
    Returns { preset, label, from, to, days, dates }. Whole days only: the "Last N days" presets end yesterday,
    Today is today, Yesterday is yesterday, and "This month" ends yesterday except on the 1st (today alone). label is the choice ("This month");
    dates is the plain span ("Nov 1 to 23"). */
export function rangeOf(saved, now = new Date()) {
  const custom = !!(saved && saved.preset === 'custom' && saved.from && saved.to && saved.from <= saved.to);
  const preset = custom ? 'custom' : saved && RANGES.some(r => r.id === saved.preset && r.id !== 'custom') ? saved.preset : 'month';
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  let from, to;
  if (custom) { from = saved.from; to = saved.to; }
  else if (preset === 'today') { from = to = ymd(now); }
  else if (preset === 'yesterday') { from = to = ymd(y); }
  else if (/^\d+d$/.test(preset)) { const n = parseInt(preset, 10); to = ymd(y); from = ymd(new Date(y.getFullYear(), y.getMonth(), y.getDate() - n + 1)); }
  else if (preset === 'last-month') { from = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)); to = ymd(new Date(now.getFullYear(), now.getMonth(), 0)); }
  else { from = ymd(new Date(now.getFullYear(), now.getMonth(), 1)); to = now.getDate() > 1 ? ymd(y) : ymd(now); }
  const days = Math.round((dayOf(to) - dayOf(from)) / 864e5) + 1;
  return { preset, label: custom ? datesLabel(from, to) : RANGES.find(r => r.id === preset).label, from, to, days, dates: datesLabel(from, to) };
}
