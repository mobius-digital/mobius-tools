/* Saved dashboards (the hub, 2026-10-07): a dashboard the team asked for in chat and
 * wants to KEEP. The Strategist writes the spec (blocks bound to named views), this file
 * stores it, Locus draws it live from /api/overview each time it opens, and the
 * account-health hourly tick posts it to Slack on its schedule. One row per dashboard.
 *
 * Routes (authed, mounted by worker.js):
 *   GET    /api/dashboards?act=<act|all>          -> { dashboards: [...] }   (all, or one brand's + agency-wide)
 *   GET    /api/dashboard?id=                      -> the row
 *   PUT    /api/dashboard   { id?, name, act, spec, schedule, channel, for_who, pinned } -> the row (upsert)
 *   DELETE /api/dashboard?id=
 *
 * The spec: { scope: 'all' | act_id, range: 'yesterday'|'7'|'30'|'90'|'mtd'|'lastmonth',
 *   compare: 'prev'|'yoy'|'none', blocks: [ { type: 'tiles', title, metrics: [...] }
 *   | { type: 'brands', title, columns: [...] } | { type: 'channels', title }
 *   | { type: 'daily', title } | { type: 'email', title } | { type: 'note', text }
 *   | { type: 'chart', title, spec, question, act, pinned_at } ] }
 * The vocabularies (METRICS, COLUMNS) are the same words the Strategist is told to use.
 * `chart` (2026-10-08) is a Strategist answer pinned from the chat (ask-ui.js "Pin to a dashboard"):
 * `spec` is the ```chart JSON exactly as it was drawn, frozen as of `pinned_at`; Locus draws it with
 * AskUI.chartHTML and offers Refresh (re-asks `question`); the Slack post shows its title only. */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...CORS } });
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, n);

export const METRICS = ['revenue', 'orders', 'aov', 'spend', 'mer', 'amer', 'new_share', 'new_orders', 'cac', 'cm', 'email_rev', 'email_share', 'meta_spend', 'google_spend'];
export const COLUMNS = ['revenue', 'mtd_vs_plan', 'spend', 'mer', 'amer', 'new_share', 'orders', 'aov', 'cac', 'cm', 'email_rev', 'costs', 'trend'];
const RANGES = new Set(['yesterday', '7', '30', '90', 'mtd', 'lastmonth']);
const COMPARES = new Set(['prev', 'yoy', 'none']);
const SCHEDULES = new Set(['', 'daily', 'monday', 'first']);
const BLOCKS = new Set(['tiles', 'brands', 'channels', 'daily', 'email', 'note', 'chart']);
const CHART_MAX = 20000;
/** A pinned chart's spec, cleaned to what AskUI.chartHTML draws: bar | line | table, 15 labels, 3 series. */
function cleanChart(c) {
  if (!c || typeof c !== 'object' || !['bar', 'line', 'table'].includes(c.type)) return null;
  const labels = (Array.isArray(c.labels) ? c.labels : []).slice(0, 15).map(l => String(l ?? '').slice(0, 80));
  const series = (Array.isArray(c.series) ? c.series : []).slice(0, 3).map(x => ({ name: String(x?.name ?? '').slice(0, 60),
    values: (Array.isArray(x?.values) ? x.values : []).slice(0, 15).map(v => (v == null || v === '' || !isFinite(+v) ? null : +v)) }));
  if (!labels.length || !series.length) return null;
  const out = { type: c.type, title: String(c.title ?? '').slice(0, 160), unit: ['$', 'x', '%', ''].includes(c.unit) ? c.unit : '', labels, series };
  if (c.goal != null && isFinite(+c.goal)) out.goal = +c.goal;
  return JSON.stringify(out).length <= CHART_MAX ? out : null;
}

export const DASH_SQL = `CREATE TABLE IF NOT EXISTS p_dashboard (
  id          TEXT PRIMARY KEY,
  act_id      TEXT,
  name        TEXT NOT NULL,
  for_who     TEXT,
  spec_json   TEXT NOT NULL,
  schedule    TEXT,
  channel     TEXT,
  pinned      INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_posted TEXT
)`;
export async function ensureDash(env) { await env.DB.prepare(DASH_SQL).run().catch(() => {}); }

/** Clean a spec down to the vocabulary; anything unknown is dropped, never stored. */
export function cleanSpec(sp, scope) {
  const s = sp && typeof sp === 'object' ? sp : {};
  const clip = (v, n) => String(v ?? '').slice(0, n);
  const blocks = (Array.isArray(s.blocks) ? s.blocks : []).map(b => {
    if (!b || !BLOCKS.has(b.type)) return null;
    const out = { type: b.type, title: clip(b.title, 80) };
    if (b.type === 'tiles') { out.metrics = (Array.isArray(b.metrics) ? b.metrics : []).filter(m => METRICS.includes(m)).slice(0, 8); if (!out.metrics.length) return null; }
    if (b.type === 'brands') out.columns = (Array.isArray(b.columns) ? b.columns : []).filter(c => COLUMNS.includes(c)).slice(0, 8);
    if (b.type === 'note') { out.text = clip(b.text, 600); if (!out.text) return null; }
    if (b.type === 'chart') {
      out.spec = cleanChart(b.spec); if (!out.spec) return null;
      out.question = clip(b.question, 600);
      out.act = clip(b.act || 'all', 40);
      out.pinned_at = /^\d{4}-\d{2}-\d{2}/.test(String(b.pinned_at || '')) ? clip(b.pinned_at, 30) : new Date().toISOString();
    }
    return out;
  }).filter(Boolean).slice(0, 10);
  return { scope: scope || (s.scope === 'all' ? 'all' : clip(s.scope, 40) || 'all'), range: RANGES.has(String(s.range)) ? String(s.range) : '30', compare: COMPARES.has(s.compare) ? s.compare : 'prev', blocks };
}

export function dashRow(r) {
  let spec = {};
  try { spec = JSON.parse(r.spec_json || '{}'); } catch {}
  return { id: r.id, act: r.act_id, name: r.name, for_who: r.for_who || '', spec, schedule: r.schedule || '', channel: r.channel || '', pinned: !!r.pinned, by: r.created_by || null, created_at: r.created_at, updated_at: r.updated_at, last_posted: r.last_posted || null };
}

export async function handleDashboard({ path, request, env, email }) {
  const url = new URL(request.url);
  await ensureDash(env);
  if (path === '/api/dashboards' && request.method === 'GET') {
    const act = url.searchParams.get('act') || 'all';
    const { results } = act === 'all'
      ? await env.DB.prepare(`SELECT * FROM p_dashboard ORDER BY pinned DESC, updated_at DESC`).all()
      : await env.DB.prepare(`SELECT * FROM p_dashboard WHERE act_id = ?1 OR act_id IS NULL ORDER BY pinned DESC, updated_at DESC`).bind(act).all();
    return json({ dashboards: (results || []).map(dashRow) });
  }
  if (path === '/api/dashboard' && request.method === 'GET') {
    const id = url.searchParams.get('id') || '';
    const r = await env.DB.prepare(`SELECT * FROM p_dashboard WHERE id = ?1`).bind(id).first();
    if (!r) return json({ error: 'No dashboard with that id' }, 404);
    return json(dashRow(r));
  }
  if (path === '/api/dashboard' && request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const name = String(b.name || '').trim().slice(0, 120);
    if (!name) return json({ error: 'A dashboard needs a name.' }, 400);
    const act = b.act && b.act !== 'all' ? String(b.act).slice(0, 40) : null;
    const spec = cleanSpec(b.spec, act || 'all');
    if (!spec.blocks.length) return json({ error: 'A dashboard needs at least one block it can draw.' }, 400);
    const schedule = SCHEDULES.has(String(b.schedule || '')) ? String(b.schedule || '') : '';
    const channel = /^[CG][A-Z0-9]{6,}$/.test(String(b.channel || '')) ? String(b.channel) : '';
    const pinned = b.pinned === false ? 0 : 1;
    const forWho = String(b.for_who || '').slice(0, 80);
    let id = /^db_[0-9a-f]{10}$/.test(String(b.id || '')) ? b.id : null;
    if (id) {
      const have = await env.DB.prepare(`SELECT id FROM p_dashboard WHERE id = ?1`).bind(id).first();
      if (!have) id = null;
    }
    if (id) {
      await env.DB.prepare(`UPDATE p_dashboard SET name = ?2, act_id = ?3, for_who = ?4, spec_json = ?5, schedule = ?6, channel = ?7, pinned = ?8, updated_at = datetime('now') WHERE id = ?1`)
        .bind(id, name, act, forWho, JSON.stringify(spec), schedule, channel, pinned).run();
    } else {
      id = 'db_' + hex(10);
      await env.DB.prepare(`INSERT INTO p_dashboard (id, act_id, name, for_who, spec_json, schedule, channel, pinned, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
        .bind(id, act, name, forWho, JSON.stringify(spec), schedule, channel, pinned, email || null).run();
    }
    const r = await env.DB.prepare(`SELECT * FROM p_dashboard WHERE id = ?1`).bind(id).first();
    return json(dashRow(r));
  }
  if (path === '/api/dashboard' && request.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    await env.DB.prepare(`DELETE FROM p_dashboard WHERE id = ?1`).bind(id).run();
    return json({ ok: true });
  }
  return null;
}
