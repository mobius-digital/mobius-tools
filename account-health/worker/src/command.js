/* THE COMMAND CENTER, the account-health half (2026-10-09). Locus Home for "All clients" (profit/command.js)
 * reads the numbers and the ad signals from the profit worker (`/api/hub/command`, hub.js `commandMany`) and the
 * work around them from here, because Asana, the new-client runs and the alerts live on this worker:
 *
 *   GET /api/command/work   (team; a client is refused by brandguard, a limited teammate gets only their brands)
 *     { as_of, today, brands: { brand_x: { project, url, overdue: [...], stuck: [...], open, error? } },
 *       pending: [new client runs not finished], alerts: [alerts fired in the last 48 hours] }
 *
 * ASANA (each brand's linked project, connections kind 'asana'): the open tasks, read live and cached 30 minutes
 * per brand in settings `cmdasana2:<brand>`. OVERDUE = due_on before today (Central). STUCK = sitting in a working
 * section (not backlog, ideas, done, reference or the client's own tasks) with nothing changed for 10+ days
 * (Asana's modified_at; it has no "entered this section at", so untouched is the honest proxy). Five of each.
 * Paused and test brands are skipped (never flag them: Cole's rule, same list as hub.js SKIP_HUB).
 * PENDING = p_newclient rows (90 days old at most) with a step that is not done / skipped (the list that
 * used to sit in the New client modal as "Already started").
 * ALERTS = p_alert rows whose last_fired is in the last 48 hours, in words (alerts.js `ruleText`). */
import { asanaAll } from './asana-brand.js';
import { ruleText, ensureAlerts } from './alerts.js';
import { STEPS as NC_STEPS } from './newclient.js';

const SKIP = /galway|instyler|gum of gods|judy ?p|le ?pickle|popby|golf sock/i;
const CACHE_MS = 30 * 60 * 1000;
/* Sections where an open task is not "work waiting": parked, finished, reference, or a test waiting on data
   (Analyze Results held 284 old tests on 2026-10-04 and would drown every other signal). The client's own section
   counts for overdue (an onboarding link not done) but never for stuck. */
const NOT_WORK = /backlog|idea|complete|done|archive|reference|resource|template|start here|client responsible|on hold|parked|untitled|analy[sz]e/i;
const NOT_DUE = /backlog|idea|complete|done|archive|reference|resource|template|on hold|parked|untitled|analy[sz]e/i;
const OVERDUE_DAYS = 60;   // due longer ago than this = abandoned, not overdue
const NC_LABEL = { asana: 'Asana project', onboard: 'Onboarding link', drive: 'Drive folder', slack: 'Slack channels', frame: 'Frame project', stripe: 'First invoice', contract: 'Agreement', email: 'Welcome email', summary: 'Team summary' };
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const central = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const daysSince = (iso, today) => Math.max(0, Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(String(iso).slice(0, 10) + 'T12:00:00Z')) / 864e5));

async function getSetting(env, key) { const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null); return safeJson(r?.value, null); }
async function putSetting(env, key, v) { await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(v)).run().catch(() => {}); }

/** One brand's Asana project: overdue and stuck open tasks. */
async function asanaFor(env, brand, gid, url, today, fresh) {
  const key = `cmdasana2:${brand}`;
  const hit = fresh ? null : await getSetting(env, key);
  if (hit && hit.at && Date.now() - Date.parse(hit.at) < CACHE_MS && hit.gid === gid) return hit;
  const opt = 'name,due_on,due_at,assignee.name,memberships.section.name,memberships.project.gid,modified_at,created_at,permalink_url';
  let tasks;
  try { tasks = await asanaAll(env, `/projects/${gid}/tasks?completed_since=now&opt_fields=${opt}`); }
  catch (e) { return { gid, url, error: e.message, overdue: [], stuck: [], open: 0, at: new Date().toISOString() }; }
  const row = t => {
    const section = (t.memberships || []).find(m => m.project?.gid === gid)?.section?.name || '';
    return { name: String(t.name || '').slice(0, 140), section, who: t.assignee?.name || null, url: t.permalink_url || null, due: t.due_on || (t.due_at ? String(t.due_at).slice(0, 10) : null), touched: t.modified_at ? String(t.modified_at).slice(0, 10) : null };
  };
  const all = (tasks || []).filter(t => String(t.name || '').trim() && !/^\u{1F4CC}/u.test(String(t.name || '').trim())).map(row);
  const overdue = all.filter(t => t.due && t.due < today && !NOT_DUE.test(t.section)).map(t => ({ ...t, late: daysSince(t.due, today) })).filter(t => t.late <= OVERDUE_DAYS).sort((a, b) => b.late - a.late);
  const stuck = all.filter(t => !(t.due && t.due < today) && t.section && !NOT_WORK.test(t.section) && t.touched && daysSince(t.touched, today) >= 10)
    .map(t => ({ ...t, idle: daysSince(t.touched, today) })).sort((a, b) => b.idle - a.idle);
  const out = { gid, url, open: all.length, overdue_n: overdue.length, stuck_n: stuck.length, overdue: overdue.slice(0, 5), stuck: stuck.slice(0, 5), at: new Date().toISOString() };
  await putSetting(env, key, out);
  return out;
}

export async function commandWork(env, { only = null, fresh = false } = {}) {
  const today = central();
  const accts = ((await env.DB.prepare(`SELECT act_id, name FROM brand_accounts WHERE active = 1 AND (demo IS NULL OR demo = 0)`).all().catch(() => ({ results: [] }))).results || [])
    .filter(a => !only || only.has(a.act_id));
  const names = Object.fromEntries(accts.map(a => [a.act_id, a.name]));
  const live = accts.filter(a => !SKIP.test(a.name || ''));
  const conns = live.length ? ((await env.DB.prepare(`SELECT brand_id, external_id, label, config_json FROM connections WHERE kind = 'asana' AND brand_id IN (${live.map((_, i) => `?${i + 1}`).join(',')})`).bind(...live.map(a => a.act_id)).all().catch(() => ({ results: [] }))).results || []) : [];
  const brands = {};
  await Promise.all(conns.map(async c => {
    if (!c.external_id || brands[c.brand_id]) return;
    const url = safeJson(c.config_json, {})?.url || `https://app.asana.com/0/${c.external_id}`;
    brands[c.brand_id] = { project: c.label || null, ...(await asanaFor(env, c.brand_id, c.external_id, url, today, fresh)) };
  }));
  /* New clients still being set up. */
  let pending = [];
  try {
    const rows = (await env.DB.prepare(`SELECT id, name, act_id, pending_act, steps_json, created_at FROM p_newclient ORDER BY created_at DESC LIMIT 30`).all()).results || [];
    pending = rows.map(r => {
      const st = safeJson(r.steps_json, {});
      const left = NC_STEPS.filter(k => !['done', 'skipped', 'none'].includes(st[k]?.status));
      const failed = NC_STEPS.filter(k => st[k]?.status === 'failed');
      return { id: r.id, name: r.name, act_id: r.act_id || r.pending_act || null, created_at: r.created_at, age: daysSince(r.created_at, today),
        done: NC_STEPS.length - left.length, of: NC_STEPS.length, left: left.map(k => NC_LABEL[k] || k), failed: failed.map(k => NC_LABEL[k] || k) };
    }).filter(r => r.left.length && r.age <= 90).filter(r => !only || !r.act_id || only.has(r.act_id));
  } catch { pending = []; }
  /* Alerts that fired in the last 48 hours. */
  let alerts = [];
  try {
    await ensureAlerts(env);
    const since = new Date(Date.now() - 48 * 3600e3).toISOString();
    const rows = (await env.DB.prepare(`SELECT * FROM p_alert WHERE last_fired IS NOT NULL AND last_fired >= ?1 ORDER BY last_fired DESC LIMIT 20`).bind(since).all()).results || [];
    alerts = rows.filter(r => !only || r.act === 'all' || only.has(r.act)).map(r => ({ id: r.id, act: r.act, brand: r.act === 'all' ? null : names[r.act] || null, text: ruleText(r, r.act === 'all' ? null : names[r.act]), fired: r.last_fired, value: r.last_value, status: r.last_status || null }));
  } catch { alerts = []; }
  return { as_of: new Date().toISOString(), today, brands, pending, alerts };
}

export async function handleCommand(request, env, path, json, isAdmin, brandsOf) {
  if (path !== '/api/command/work') return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const url = new URL(request.url);
  const only = await brandsOf(request).catch(() => null);
  return json(await commandWork(env, { only, fresh: url.searchParams.get('fresh') === '1' }));
}
