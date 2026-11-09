/* CALL NUDGES (2026-11-09, the Mobius Call Playbook https://claude.ai/artifact/X6EBgQMTRDuyiWRKU37dGK).
 * Two things broke the Monday calls the week of Nov 2, both found on the live call screens on Nov 9:
 *   1. No strategist Monday plan for any brand at call time, so the call screen had nothing to approve.
 *   2. Finish was never pressed (no Monday call since Oct 19, 4 of 21 client calls), so nothing the calls decided
 *      became a task, a request or a report line, and nothing carried over to the next week.
 * So, from the hourly tick:
 *   - Monday 7:00 to 7:59 Central, once: in #daily-checkin, the brands whose weekly report is in but have no Monday plan
 *     yet, tagging the strategists (lane format: *CREATIVE · Monday plans*, who, the one thing, why).
 *   - Weekdays from noon to 9pm Central: a DM to Cole for each call of today still open an hour after anyone last typed
 *     on it, once per call, with the link straight back to that call's screen.
 * Switch: settings.callNudge = 'off' stops both. Stamps: callNudge:plan:<date>, callNudge:open:<call id>.
 * No em dashes in anything posted.
 */
import { mondayScreen } from './meetings.js';
import { SKIP } from './moved.js';
import { DEFAULT_PEOPLE, DEFAULT_CHANNEL } from './checkin.js';

const COLE = 'U06C37MDWD7';
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const md = text => ({ type: 'mrkdwn', text });
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const list = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
const dow = ymd => new Date(ymd + 'T12:00:00Z').getUTCDay();

/** The link back to one call's screen (the same URL the screen writes for itself). */
export function callLink(c) {
  const p = new URLSearchParams({ open: 'calls', call: c.kind });
  if (c.act_id) p.set('act', c.act_id);
  return `${LOCUS}?${p.toString()}`;
}
/** Pure: which of today's calls get a DM now. Live, typed on, quiet for an hour, not nudged before. */
export function openCallsToNudge(rows, nowMs, stamped) {
  return rows.filter(r => r.status === 'live' && (r.state_json || '{}').length > 2 && !stamped.has(r.id)
    && nowMs - Date.parse(r.updated_at || r.started_at || 0) >= 3600e3);
}
/** Pure: the brands on the Monday call with a fresh weekly report and no plan in their thread. */
export function brandsWithoutPlan(brands) {
  return brands.filter(b => !SKIP.test(b.name || '') && b.report && b.report.fresh && !(b.thread || []).length).map(b => b.name);
}

export async function callNudgeTick(env, d) {
  if ((await d.getSetting(env, 'callNudge')) === 'off') return { skipped: 'off' };
  const date = d.centralDate(), hour = d.centralHour(), wd = dow(date);
  const out = {};

  /* 1. Monday 7am: Monday plans missing. */
  if (wd === 1 && hour === 7 && !(await d.getSetting(env, `callNudge:plan:${date}`))) {
    try {
      const ms = await mondayScreen(env, d);
      const missing = brandsWithoutPlan(ms.brands || []);
      if (missing.length) {
        const people = safe(await d.getSetting(env, 'checkinPeople'), null) || DEFAULT_PEOPLE;
        const strat = Object.entries(people).filter(([, p]) => (p.roles || []).includes('strategist')).map(([uid]) => `<@${uid}>`);
        const channel = (await d.getSetting(env, 'checkinChannel')) || DEFAULT_CHANNEL;
        const text = `*CREATIVE · Monday plans*\n${strat.join(' ')}  Post the Monday plan for ${esc(list(missing))} before the 8:00 team call, as a reply under each brand's weekly report.\nWhy: the team call screen shows your plan for each brand. With no plan, that brand has nothing to approve on the call.`;
        await d.slackApi(env, 'chat.postMessage', { channel, text, blocks: [{ type: 'section', text: md(text) }] });
        out.plans = missing;
      } else out.plans = 'all in';
      await d.putSetting(env, `callNudge:plan:${date}`, JSON.stringify(out.plans));
    } catch (e) { out.plansError = e.message; }
  }

  /* 2. Weekdays from noon: a call left open. */
  if (wd >= 1 && wd <= 5 && hour >= 12 && hour < 21) {
    try {
      const rows = (await env.DB.prepare(`SELECT id, kind, act_id, title, status, state_json, started_at, updated_at FROM p_call WHERE date = ?1 AND kind IN ('monday', 'client', 'creator')`).bind(date).all().catch(() => ({ results: [] }))).results || [];
      const stamped = new Set();
      for (const r of rows) if (await d.getSetting(env, `callNudge:open:${r.id}`)) stamped.add(r.id);
      const due = openCallsToNudge(rows, Date.now(), stamped);
      if (due.length) {
        const lines = due.map(c => `• <${callLink(c)}|${esc(c.title || 'A call')}>`).join('\n');
        const text = `*OPS · Calls not finished*\n<@${COLE}>  Open ${due.length === 1 ? 'this call' : 'these calls'} and press Finish:\n${lines}\nWhy: until Finish, nothing from the call becomes a task, a request or a line in the client's report.`;
        await d.slackApi(env, 'chat.postMessage', { channel: COLE, text, blocks: [{ type: 'section', text: md(text) }] });
        for (const c of due) await d.putSetting(env, `callNudge:open:${c.id}`, new Date().toISOString());
        out.open = due.map(c => c.id);
      }
    } catch (e) { out.openError = e.message; }
  }
  return out;
}

export const _test = { openCallsToNudge, brandsWithoutPlan, callLink };
