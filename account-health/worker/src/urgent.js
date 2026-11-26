/* Urgent alerts in Locus first (2026-11-26, Cole: "alerts that matter belong IN Locus first").
 *
 * An alert is one p_notice row per (person, thing), kind 'alert':
 *   ntype      the notify type (spend_high, spend_low, brief_failed, claude_failed, meta_sync, outage)
 *   thing_key  '<type>:<thing>' (a brand id, 'agency', or a platform id)
 *   created_at when this episode started; seen_at the last time a check saw it
 * A second raise refreshes the same row (never a second row, never a second ping). A fix clears it ('done', answer
 * 'fixed'). A person may hide it for today ('done', answer 'hidden'); it comes back tomorrow if still true, or sooner when it
 * clears and then breaks again (a new episode).
 *
 * The row is written BEFORE any existing Slack post in the same function and whether or not that post goes. Slack
 * and email COPIES go only on a new episode, only when settings notifyCopies is 'on' (off until Dec 5), and only on
 * the channels each person chose (notify.js personWants). The existing Slack posts are not touched here. */
import { ensure as ensureAutomations, rolesOf, slackDm } from './automations.js';
import { personWants, typeOf } from './notify.js';
import { ALARM_TYPES, ALARM_PAGE } from './alarms.js';

export const ALERT_TYPES = ['outage', 'claude_failed', 'meta_sync', 'brief_failed', 'spend_high', 'spend_low', ...ALARM_TYPES];
/** The v5 page each type opens. */
export const ALERT_PAGE = { spend_high: 'meta/live-now', spend_low: 'meta/live-now', brief_failed: 'a-to-send/index', claude_failed: 'a-status/index', meta_sync: 'a-status/index', outage: 'a-status/index', ...ALARM_PAGE };
/* KEEP SLACK UNTIL THE BELL IS ON PHONES (round 21 research, review note on the spend and outage rows): until settings
   notifyCopies is 'on' (Dec 5) these alarms, the ones that mean money stopped or the store is down right now, also DM
   each person on a NEW episode, whatever their preset. settings alarmDm = 'off' stops it. Every other alarm is a Locus
   row only tonight. Once notifyCopies is on, each person's own choices decide, like every other type. */
export const DM_TONIGHT = ['account_blocked', 'campaign_stalled', 'no_orders'];

const lower = s => String(s || '').trim().toLowerCase();
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || ''));
const safe = (s, fb) => { if (s == null || s === '') return fb; if (typeof s !== 'string') return s; try { const v = JSON.parse(s); return v == null ? fb : v; } catch { return fb; } };
const rid = () => 'ntc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
const noDash = s => String(s ?? '').replace(/\s*[\u2014\u2013]\s*/g, ', ');
const iso = t => (t instanceof Date ? t : new Date(t || Date.now())).toISOString();
/** The Central calendar date of a time. "Hidden for today" means today in Central. */
export const centralDay = t => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));

let ready = false;
/** The three alert columns and the one row per (person, thing) index. Each ALTER on its own: one already there is fine. */
export async function ensureUrgent(env) {
  if (ready) return;
  await ensureAutomations(env);
  for (const col of ['thing_key TEXT', 'ntype TEXT', 'seen_at TEXT']) await env.DB.prepare(`ALTER TABLE p_notice ADD COLUMN ${col}`).run().catch(() => {});
  await env.DB.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS p_notice_thing ON p_notice (person_id, thing_key)`).run().catch(() => {});
  /* clearAlert looks a thing up across people: its own index, so a clear is not a table scan. */
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_notice_thing_only ON p_notice (thing_key, state)`).run().catch(() => {});
  ready = true;
}
export function _resetUrgent() { ready = false; }

async function rawSetting(env, d, key) {
  return d && d.getSetting ? await d.getSetting(env, key).catch(() => null) : (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null))?.value;
}
async function setting(env, d, key, fb) { return safe(await rawSetting(env, d, key), fb); }
const ownerOf = (env, d) => lower((env && env.OWNER_EMAIL) || (d && d.ownerEmail));

/** Who hears about this alert. Emails only, never a client; anyone held to brands they may not see is dropped. */
export async function alertPeople(env, d, type, brandId) {
  const roles = await rolesOf(env, d).catch(() => ({}));
  const owner = ownerOf(env, d);
  const mine = (brandId && roles[brandId]) || {}, all = roles.all || {};
  let list;
  if (type === 'spend_high' || type === 'spend_low') list = [mine.buyer || all.buyer || owner];
  else if (ALARM_TYPES.includes(type)) list = [mine.buyer || all.buyer, owner];
  else if (type === 'brief_failed') list = [owner, mine.owner];
  else list = [owner];
  const clients = Object.fromEntries(Object.entries((await setting(env, d, 'clientUsers', {})) || {}).map(([k, v]) => [lower(k), v]));
  const out = [];
  for (const raw of list) {
    const e = lower(raw);
    if (!isEmail(e) || out.includes(e)) continue;
    /* A client login (in clientUsers and not on the team) is never a recipient. */
    if (clients[e] && !(d.emailAllowed && (await d.emailAllowed(env, e).catch(() => false)))) continue;
    if (brandId && d.brandsFor) {
      const only = await d.brandsFor(env, e).catch(() => null);
      if (only && !only.has(brandId)) continue;
    }
    out.push(e);
  }
  return out;
}

/** Brands that never get an alert row: muted test brands and brands we do not run. */
async function brandQuiet(env, d, brandId) {
  if (!brandId) return null;
  if (d.alertsMuted && (await d.alertsMuted(env, brandId).catch(() => false))) return 'muted test brand';
  if (d.listAccounts) {
    const live = await d.listAccounts(env, true).catch(() => null);
    if (Array.isArray(live) && !live.some(a => a.act_id === brandId)) return 'not a brand we run';
  }
  return null;
}

/** Copies outside Locus, on a NEW episode only. Tonight settings notifyCopies is off, so this records 'off' (and, for
 *  the DM_TONIGHT alarms, the bridge DM). The bridge DM goes at most once a Central day per person per thing: a check
 *  that flaps (fixed, then broken again an hour later) opens a new row each time but does not DM again that day.
 *  lastBridge = when this row last sent one (kept across episodes in sent_json.bridgeAt). */
async function copies(env, d, email, type, text, { at, lastBridge = null } = {}) {
  if (String((await rawSetting(env, d, 'notifyCopies')) ?? '').trim().toLowerCase() !== 'on') {
    if (!DM_TONIGHT.includes(type) || String((await rawSetting(env, d, 'alarmDm')) ?? '').trim().toLowerCase() === 'off') return { copies: 'off' };
    if (lastBridge && centralDay(lastBridge) === centralDay(at)) return { copies: 'off', bridge: 'already today', bridgeAt: lastBridge };
    return { copies: 'off', slack: (await slackDm(env, d, email, text).catch(e => e.message)) || 'sent', bridge: true, bridgeAt: at };
  }
  const out = {};
  if (await personWants(env, d, email, type, 'slack_dm')) out.slack = (await slackDm(env, d, email, text).catch(e => e.message)) || 'sent';
  if (await personWants(env, d, email, type, 'email')) out.email = await d.sendEmail(env, email, text).then(() => 'sent', e => e.message);
  return out;
}

/** Open (or refresh) the alert for every person who should hear. Returns what happened per person. */
export async function raiseAlert(env, d, { type, thing, brand_id = null, title, body = '', page, button = {}, now } = {}) {
  if (!typeOf(type) || !ALERT_TYPES.includes(type)) return { error: `unknown alert type ${type}` };
  const quiet = await brandQuiet(env, d, brand_id);
  if (quiet) return { skipped: quiet };
  await ensureUrgent(env);
  const at = iso(now), today = centralDay(at), key = `${type}:${thing || brand_id || 'agency'}`;
  const btn = JSON.stringify({ kind: 'open', page: page || ALERT_PAGE[type], ...(brand_id ? { brand_id } : {}), label: 'Open', ...button });
  const t = noDash(title).slice(0, 300), b = noDash(body).slice(0, 1000);
  const out = { key, opened: [], refreshed: [], hidden: [] };
  for (const email of await alertPeople(env, d, type, brand_id)) {
    const r = await env.DB.prepare(`SELECT * FROM p_notice WHERE person_id = ?1 AND thing_key = ?2`).bind(email, key).first();
    if (r && r.state === 'open') {
      await env.DB.prepare(`UPDATE p_notice SET title = ?2, body = ?3, seen_at = ?4, button_json = ?5 WHERE id = ?1`).bind(r.id, t, b, at, btn).run();
      out.refreshed.push(email); continue;
    }
    if (r && r.answer === 'hidden' && r.done_at && centralDay(r.done_at) === today) {
      await env.DB.prepare(`UPDATE p_notice SET seen_at = ?2 WHERE id = ?1`).bind(r.id, at).run();
      out.hidden.push(email); continue;
    }
    /* A new episode: copies first (so sent_json records them), then the row. */
    const lastBridge = r ? (safe(r.sent_json, {}) || {}).bridgeAt || null : null;
    const sent = { bell: at, ...(await copies(env, d, email, type, `${t}\n${b}`, { at, lastBridge })) };
    if (r) {
      await env.DB.prepare(`UPDATE p_notice SET state = 'open', kind = 'alert', ntype = ?2, title = ?3, body = ?4, button_json = ?5, brand_id = ?6, created_at = ?7, seen_at = ?7, done_at = NULL, answer = NULL, done_by = NULL, home = 1, sent_json = ?8 WHERE id = ?1`)
        .bind(r.id, type, t, b, btn, brand_id, at, JSON.stringify(sent)).run();
    } else {
      await env.DB.prepare(`INSERT INTO p_notice (id, org_id, person_id, brand_id, kind, ntype, thing_key, title, body, button_json, state, home, sent_json, created_at, seen_at)
        VALUES (?1, 'default', ?2, ?3, 'alert', ?4, ?5, ?6, ?7, ?8, 'open', 1, ?9, ?10, ?10)`).bind(rid(), email, brand_id, type, key, t, b, btn, JSON.stringify(sent), at).run();
    }
    out.opened.push(email);
  }
  return out;
}

/** The thing is fixed: every person's open row for it is done. */
export async function clearAlert(env, d, { type, thing, now } = {}) {
  await ensureUrgent(env);
  const key = `${type}:${thing || 'agency'}`;
  await env.DB.prepare(`UPDATE p_notice SET state = 'done', answer = 'fixed', done_at = ?2, done_by = 'locus' WHERE thing_key = ?1 AND state = 'open'`).bind(key, iso(now)).run();
  /* "Hide for today" hides the episode, not the thing: once it is fixed, a hidden row ends too, so the same thing
     breaking again later the same day is a new episode and opens again. */
  await env.DB.prepare(`UPDATE p_notice SET answer = 'fixed', done_at = ?2, done_by = 'locus' WHERE thing_key = ?1 AND state = 'done' AND answer = 'hidden'`).bind(key, iso(now)).run();
  return { cleared: key };
}

/** Hourly: clear what fixed itself or has not been seen for a while. */
export async function urgentSweep(env, d, { now } = {}) {
  await ensureUrgent(env);
  const at = iso(now), t = new Date(at).getTime(), ago = h => new Date(t - h * 36e5).toISOString();
  const fix = (id) => env.DB.prepare(`UPDATE p_notice SET state = 'done', answer = 'fixed', done_at = ?2, done_by = 'locus' WHERE id = ?1 AND state = 'open'`).bind(id, at).run();
  const { results } = await env.DB.prepare(`SELECT id, ntype, thing_key, brand_id, seen_at, button_json FROM p_notice WHERE kind = 'alert' AND state = 'open'`).all().catch(() => ({ results: [] }));
  const out = { cleared: 0 };
  let claudeOld = null;
  for (const r of results || []) {
    let clear = false;
    if (r.ntype === 'spend_high' || r.ntype === 'spend_low') clear = !r.seen_at || r.seen_at < ago(36);
    /* The alarms (alarms.js) refresh their row every hour they still see it (tracking once a day): one no check has
       seen for 30 hours has stopped being checked (a paused brand, a check switched off) and clears. */
    else if (ALARM_TYPES.includes(r.ntype)) clear = !r.seen_at || r.seen_at < ago(30);
    else if (r.ntype === 'claude_failed') {
      if (claudeOld === null) { const last = await setting(env, d, 'lastClaudeAlert', null); claudeOld = !(last && last.at) || last.at < t - 24 * 36e5; }
      clear = claudeOld;
    } else if (r.ntype === 'meta_sync') {
      const b = safe(r.button_json, {});
      const acct = b.act ? await env.DB.prepare(`SELECT last_error FROM accounts WHERE act_id = ?1`).bind(b.act).first().catch(() => null) : null;
      clear = (acct && !acct.last_error) || !r.seen_at || r.seen_at < ago(24);
    } else if (r.ntype === 'brief_failed') {
      const b = safe(r.button_json, {});
      if (b.date && r.brand_id) {
        const row = await env.DB.prepare(`SELECT status FROM briefs WHERE act_id = ?1 AND date = ?2`).bind(r.brand_id, b.date).first().catch(() => null);
        const later = await env.DB.prepare(`SELECT 1 AS x FROM briefs WHERE act_id = ?1 AND date > ?2 AND status IN ('sent', 'handled') LIMIT 1`).bind(r.brand_id, b.date).first().catch(() => null);
        clear = (!!row && row.status !== 'error' && row.status !== 'skipped') || !!later;
      }
    }
    if (clear) { await fix(r.id); out.cleared++; }
  }
  return out;
}
