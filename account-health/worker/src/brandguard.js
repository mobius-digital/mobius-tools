/* PER-BRAND ACCESS (2026-10-08). The SAME file lives in account-health/worker/src/brandguard.js;
 * change both together.
 *
 * settings.userBrands = { "person@domain": ["brand_...", ...] } (old act_ ids still count). A person listed there sees ONLY those
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
  return Array.isArray(list) && list.length ? expandIds(env, list.map(String)) : null;
}

/* Brand-first (2026-10-08): a brand is known by its brand id (brand_x) and by every id it ever had
 * (old act_ id, asana_ id, its Meta ad accounts). The allowed set holds all of them, so old links,
 * old saved lists and rows from Meta's own tables are judged the same way as brand ids. */
async function expandIds(env, list) {
  const ids = new Set(list);
  try {
    const ph = list.map((_, i) => `?${i + 1}`).join(',');
    const bids = ((await env.DB.prepare(`SELECT brand_id AS id FROM brand_alias WHERE alias IN (${ph}) UNION SELECT id FROM brands WHERE id IN (${ph}) OR legacy_key IN (${ph}) OR slug IN (${ph})`).bind(...list).all()).results || []).map(r => r.id);
    for (const b of bids) ids.add(b);
    if (bids.length) {
      const bp = bids.map((_, i) => `?${i + 1}`).join(',');
      const more = (await env.DB.prepare(`SELECT alias AS id FROM brand_alias WHERE brand_id IN (${bp}) UNION SELECT legacy_key FROM brands WHERE id IN (${bp}) AND legacy_key IS NOT NULL UNION SELECT external_id FROM connections WHERE brand_id IN (${bp}) AND kind = 'meta'`).bind(...bids).all()).results || [];
      for (const r of more) if (r.id) ids.add(r.id);
    }
  } catch {}
  return ids;
}

function filterActs(v, only) {
  if (Array.isArray(v)) return v.filter(x => !(x && typeof x === 'object' && typeof x.act_id === 'string' && /^(act_|asana_|brand_)/.test(x.act_id) && !only.has(x.act_id))).map(x => filterActs(x, only));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { if (/^(act_\d+|brand_[a-z0-9_]+)$/.test(k) && !only.has(k)) continue; o[k] = filterActs(x, only); } return o; }
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
