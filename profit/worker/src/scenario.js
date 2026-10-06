/* Scenarios (2026-10-06): saved what-ifs for the lead-gen and ROAS calculators.
 * The math lives in the browser (calc.js) so it recalculates as you type; this file only
 * stores the inputs a person wants to keep and compare. One row per saved scenario.
 * Routes (authed, mounted by worker.js):
 *   GET    /api/scenario?act=<act|all>&kind=leads|roas   -> { scenarios: [...] }
 *   PUT    /api/scenario   { id?, act, kind, name, inputs, note }   -> the row (upsert)
 *   DELETE /api/scenario?id=
 */
/* Same CORS as the host worker's json(): the dashboard is on another origin (GitHub Pages,
   or localhost in the dev pair), so a response without these headers reads as "Failed to fetch". */
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...CORS } });
const KINDS = new Set(['leads', 'roas']);
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, n);

function row(r) {
  let inputs = {};
  try { inputs = JSON.parse(r.inputs_json || '{}'); } catch {}
  return { id: r.id, act: r.act_id, kind: r.kind, name: r.name, inputs, note: r.note || '', by: r.created_by || null, updated_at: r.updated_at };
}

export async function handleScenario({ path, request, env, email }) {
  if (path !== '/api/scenario') return null;
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const act = url.searchParams.get('act') || 'all';
    const kind = url.searchParams.get('kind');
    const q = kind
      ? env.DB.prepare(`SELECT * FROM p_scenario WHERE act_id = ?1 AND kind = ?2 ORDER BY updated_at DESC LIMIT 40`).bind(act, kind)
      : env.DB.prepare(`SELECT * FROM p_scenario WHERE act_id = ?1 ORDER BY updated_at DESC LIMIT 80`).bind(act);
    const rows = (await q.all()).results || [];
    return json({ scenarios: rows.map(row) });
  }
  if (request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const act = String(b.act || 'all');
    const kind = String(b.kind || '');
    if (!KINDS.has(kind)) return json({ error: 'kind must be leads or roas' }, 400);
    const name = String(b.name || '').trim().slice(0, 80) || 'Scenario';
    const inputs = b.inputs && typeof b.inputs === 'object' ? b.inputs : {};
    const note = String(b.note || '').slice(0, 2000);
    const id = b.id && /^sc_[0-9a-f]{10}$/.test(b.id) ? b.id : 'sc_' + hex(10);
    await env.DB.prepare(`INSERT INTO p_scenario (id, act_id, kind, name, inputs_json, note, created_by, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, inputs_json = excluded.inputs_json, note = excluded.note, updated_at = datetime('now')`)
      .bind(id, act, kind, name, JSON.stringify(inputs), note, email || null).run();
    const r = await env.DB.prepare(`SELECT * FROM p_scenario WHERE id = ?1`).bind(id).first();
    return json(row(r));
  }
  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id') || '';
    if (!/^sc_[0-9a-f]{10}$/.test(id)) return json({ error: 'bad id' }, 400);
    await env.DB.prepare(`DELETE FROM p_scenario WHERE id = ?1`).bind(id).run();
    return json({ ok: true });
  }
  return json({ error: 'method' }, 405);
}
