/* PER-BRAND ACCESS (2026-10-08). The SAME file lives in account-health/worker/src/brandguard.js;
 * change both together.
 *
 * settings.userBrands = { "person@domain": ["act_...", ...] }. A person listed there sees ONLY those
 * brands; anyone not listed (and the owner, always) sees every brand. Enforced on the server, so a
 * hidden menu item is never the only lock:
 *   - a request naming another brand (?act= or "act" in a JSON body) is refused with 403;
 *   - every JSON answer is filtered: any object carrying an act_id outside the list is dropped from
 *     its array, so "All clients" quietly means "your brands".
 * `sessionEmail(env, request)` is passed in because each worker verifies its own session. */
const OWNER = 'cole@go-mobius-digital.com';

export async function brandsFor(env, email) {
  if (!email) return null;
  const e = String(email).toLowerCase();
  if (e === String(env.OWNER_EMAIL || OWNER).toLowerCase()) return null;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'userBrands'`).first().catch(() => null);
  let map = {}; try { map = JSON.parse(row?.value || '{}') || {}; } catch {}
  const list = map[e];
  return Array.isArray(list) && list.length ? new Set(list) : null;
}

function filterActs(v, only) {
  if (Array.isArray(v)) return v.filter(x => !(x && typeof x === 'object' && typeof x.act_id === 'string' && /^act_|^asana_/.test(x.act_id) && !only.has(x.act_id))).map(x => filterActs(x, only));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { if (/^act_\d+$/.test(k) && !only.has(k)) continue; o[k] = filterActs(x, only); } return o; }
  return v;
}

export async function guardBrands(request, env, sessionEmail, handle, CORS = {}) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ') || request.method === 'OPTIONS') return handle();
  const only = await brandsFor(env, await sessionEmail(env, request).catch(() => null)).catch(() => null);
  if (!only) return handle();
  const url = new URL(request.url);
  const deny = () => new Response(JSON.stringify({ error: 'You do not have access to that brand. Ask Cole to add it to your brands (Settings > Team).' }), { status: 403, headers: { 'Content-Type': 'application/json', ...CORS } });
  const q = url.searchParams.get('act');
  if (q && q !== 'all' && !only.has(q)) return deny();
  if (request.method !== 'GET' && (request.headers.get('Content-Type') || '').includes('json')) {
    try { const b = await request.clone().json(); if (b && typeof b.act === 'string' && b.act !== 'all' && !only.has(b.act)) return deny(); } catch {}
  }
  const res = await handle();
  if (!(res.headers.get('Content-Type') || '').includes('application/json')) return res;
  let body; try { body = await res.clone().json(); } catch { return res; }
  const h = new Headers(res.headers); h.delete('Content-Length');
  return new Response(JSON.stringify(filterActs(body, only)), { status: res.status, headers: h });
}
