/**
 * MICROSOFT CLARITY (2026-10-09). Cole assumed heatmaps and recordings would show on Store > Website.
 * Clarity's Data Export API is the only way in, and it is small on purpose:
 *   GET https://www.clarity.ms/export-data/api/v1/project-live-insights?numOfDays=1|2|3&dimension1..3=
 *   Authorization: Bearer <project API token> (Clarity > Settings > Data Export > Generate new API token,
 *   project admins only). 10 calls per project per DAY, the last 1 to 3 days only, 1,000 rows, no paging.
 *   Metrics: Traffic, Engagement Time, Scroll Depth, Dead Click Count, Rage Click Count, Quickback Click,
 *   Excessive Scroll, Script Error Count, Error Click Count (and popular pages, referrers...). No recordings and no
 *   heatmap images: those stay in Clarity, so the card links out.
 *
 * So Locus spends at most 4 calls a day per brand: the per-page read (numOfDays=3, dimension1=URL) at most every
 * 8 hours, and once a UTC day a whole-site read (numOfDays=1, no dimension) that is appended to a small history, so a
 * trend builds up over time even though Clarity only ever gives three days.
 *
 * The token is a per-brand secret kept in p_br_doc key 'clarity' {token, project, verified_at} and NEVER sent back to
 * the browser (the report says only that it is connected, the project id and when it was checked).
 */
let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }
const API = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const PAGES_TTL = 8 * 3600e3;

async function getSetting(env, key) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  return safeJson(r?.value, null);
}
async function putSetting(env, key, v) {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(v)).run().catch(() => {});
}

export async function clarityDoc(env, act) {
  const r = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'clarity'`).bind(act).first().catch(() => null);
  return safeJson(r?.data_json, null);
}

/** One call. Counts it per brand per UTC day so the screen can say how many of the 10 are left. */
export async function clarityCall(env, act, token, params) {
  const day = new Date().toISOString().slice(0, 10), ck = `clarityCalls:${act}`;
  const c = (await getSetting(env, ck)) || {};
  const n = c.day === day ? c.n || 0 : 0;
  if (n >= 9) throw Object.assign(new Error('Clarity allows 10 reads a day per project and Locus has used them; it reads again tomorrow.'), { status: 429 });
  await putSetting(env, ck, { day, n: n + 1 });
  const res = await F(`${API}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${String(token).trim()}`, 'Content-Type': 'application/json' } });
  const txt = await res.text();
  if (!res.ok) {
    const msg = res.status === 401 ? 'Clarity refused the token (missing, wrong or expired). Make a new one in Clarity > Settings > Data Export.'
      : res.status === 403 ? 'Clarity says this token may not read the project.'
      : res.status === 429 ? 'Clarity\'s daily limit (10 reads a project) is used up; it reads again tomorrow.'
      : `Clarity answered ${res.status}${txt ? `: ${txt.slice(0, 160)}` : ''}`;
    throw Object.assign(new Error(msg), { status: res.status });
  }
  const j = safeJson(txt, null);
  if (!Array.isArray(j)) throw new Error('Clarity sent something Locus does not understand.');
  return j;
}

const num = v => v == null || v === '' ? null : +v;
const metricKey = n => String(n || '').toLowerCase().replace(/[^a-z]/g, '');
/** Clarity rows -> one object per URL (or one for the site when no dimension was asked). */
export function shapeInsights(arr, dim) {
  const by = new Map();
  const row = info => { const k = dim ? String(info[dim] ?? info[dim.toLowerCase()] ?? info.Url ?? info.url ?? '') : '_'; if (!by.has(k)) by.set(k, { url: dim ? k : null }); return by.get(k); };
  for (const m of arr || []) {
    const name = metricKey(m.metricName);
    for (const info of m.information || []) {
      const r = row(info);
      if (name === 'traffic') { r.sessions = num(info.totalSessionCount); r.bots = num(info.totalBotSessionCount); r.users = num(info.distantUserCount); r.pages_per_session = num(info.PagesPerSessionPercentage ?? info.pagesPerSessionPercentage); }
      else if (name === 'scrolldepth') r.scroll = num(info.averageScrollDepth ?? info.AverageScrollDepth);
      else if (name === 'engagementtime') { r.active_time = num(info.activeTime); r.total_time = num(info.totalTime); }
      else {
        const key = { deadclickcount: 'dead', rageclickcount: 'rage', quickbackclick: 'quickback', excessivescroll: 'excessive_scroll', scripterrorcount: 'script_error', errorclickcount: 'error_click' }[name];
        if (!key) continue;
        r[key] = num(info.sessionsWithMetricPercentage);        // % of sessions that had it
        r[key + '_n'] = num(info.subTotal);                      // how many times it happened
        if (r.sessions == null && info.sessionsCount != null) r.sessions = num(info.sessionsCount);
      }
    }
  }
  return [...by.values()];
}

/** The token is checked by one real read (it also becomes the first copy of the per-page report). */
export async function storeClarity(env, act, token, project) {
  const t = String(token || '').trim();
  if (t.length < 20) throw new Error('That is too short to be a Clarity API token. In Clarity: Settings > Data Export > Generate new API token, then paste the long token.');
  const pid = clarityProject(t, project);
  const arr = await clarityCall(env, act, t, { numOfDays: '3', dimension1: 'URL' });
  await putSetting(env, `clarity:${act}:pages`, { at: new Date().toISOString(), pages: shapeInsights(arr, 'URL') });
  await env.DB.prepare(`INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, '', 'clarity', ?2, 'approved', 'staff', datetime('now'))
    ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`)
    .bind(act, JSON.stringify({ token: t, project: pid, verified_at: new Date().toISOString() })).run();
  return { ok: true, project: pid };
}
export async function setClarityProject(env, act, project) {
  const d = await clarityDoc(env, act); if (!d?.token) throw new Error('Connect Clarity first.');
  d.project = String(project || '').trim().replace(/^.*projects\/view\/([^/?#]+).*$/, '$1') || null;
  await env.DB.prepare(`UPDATE p_br_doc SET data_json = ?2, updated_at = datetime('now') WHERE act_id = ?1 AND line_id = '' AND key = 'clarity'`).bind(act, JSON.stringify(d)).run();
  return { ok: true, project: d.project };
}
export async function forgetClarity(env, act) {
  await env.DB.prepare(`DELETE FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'clarity'`).bind(act).run();
  await env.DB.prepare(`DELETE FROM settings WHERE key IN (?1, ?2)`).bind(`clarity:${act}:pages`, `clarity:${act}:hist`).run().catch(() => {});
}
/** The project id for the links: what was pasted, else a claim inside the token if Clarity put one there. */
function clarityProject(token, project) {
  const p = String(project || '').trim(); if (p) return p.replace(/^.*projects\/view\/([^/?#]+).*$/, '$1');
  try { const c = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); const v = c.projectId || c.project_id || c.pid || c.prj; return v ? String(v) : null; } catch { return null; }
}

/** What Store > Website draws. Never throws for "not connected". */
export async function clarityReport(env, act, { fresh } = {}) {
  const d = await clarityDoc(env, act);
  if (!d?.token) return { error: 'not_linked' };
  const out = { project: d.project || null, verified_at: d.verified_at };
  const today = new Date().toISOString().slice(0, 10);
  let pages = await getSetting(env, `clarity:${act}:pages`);
  const old = !pages || Date.now() - Date.parse(pages.at) > PAGES_TTL;
  if (old || fresh) {
    try { pages = { at: new Date().toISOString(), pages: shapeInsights(await clarityCall(env, act, d.token, { numOfDays: '3', dimension1: 'URL' }), 'URL') }; await putSetting(env, `clarity:${act}:pages`, pages); }
    catch (e) { out.refresh_error = e.message; if (!pages) return { ...out, error: e.message }; }
  }
  /* Once a UTC day: yesterday-ish whole-site numbers into the history (90 kept). */
  let hist = (await getSetting(env, `clarity:${act}:hist`)) || [];
  if (!hist.some(h => h.date === today)) {
    try { const site = shapeInsights(await clarityCall(env, act, d.token, { numOfDays: '1' }), null)[0] || {}; hist = hist.concat([{ date: today, ...site, url: undefined }]).slice(-90); await putSetting(env, `clarity:${act}:hist`, hist); }
    catch (e) { out.hist_error = e.message; }
  }
  const calls = (await getSetting(env, `clarityCalls:${act}`)) || {};
  return { ...out, as_of: pages.at, window: 'the last 3 days (Clarity keeps no more for the API)', pages: (pages.pages || []).filter(p => p.url).sort((a, b) => (b.sessions || 0) - (a.sessions || 0)).slice(0, 60),
    history: hist, calls_today: calls.day === today ? calls.n : 0,
    how_to_read: 'dead, rage, quickback, excessive_scroll, script_error, error_click = % of the page\'s sessions that had it (the *_n fields are how many times); scroll = average scroll depth %; active_time / total_time = seconds.' };
}
