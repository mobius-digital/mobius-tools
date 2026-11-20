/* Client report pages (2026-11-19). A finished, hand-built HTML page for a client (a growth plan, a walk-through, a
 * one-off analysis) served from Locus on a public link that needs no login. First one: the Synergy Labs growth page
 * for Vinny (Dental Fresh + Veterinary Formula), source in profit/client-reports/.
 *
 * Unlike snapshot links (snapshot.js), these pages keep their own scripts: charts, hover and calculators must work.
 * That is safe because profit/r.html draws the page in an iframe sandboxed WITHOUT allow-same-origin, so the page
 * runs in an opaque origin: it cannot read the Locus session, cookies, storage or the parent page.
 *
 * Routes:
 *   GET  /api/client-page/:token       PUBLIC (before the auth gate). { title, brands, html, updated_at }. Counts a view.
 *   POST /api/client-page              admin  { slug, title, acts: [brand ids], html } -> { token, url }.
 *                                      Upsert by slug: pushing the same slug again replaces the page, the link stays.
 *   GET  /api/client-pages?act=        admin  list (all, or the pages attached to one brand)
 *   POST /api/client-page/revoke       admin  { token } (or { slug }) turns the link off
 *
 * Pushing a page: node profit/scripts/push-client-page.mjs <file.html> <slug> "<title>" <act>[,<act>...] */

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...CORS, ...extra } });
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
const TOKEN_RE = /^[a-f0-9]{32}$/;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,60}$/;
const MAX_BYTES = 1_800_000;
const PAGE_BASE = 'https://locus.go-mobius-digital.com/profit/r.html?t=';
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export const CLIENT_PAGE_SQL = `CREATE TABLE IF NOT EXISTS p_client_page (
  token       TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  title       TEXT NOT NULL,
  acts        TEXT NOT NULL,
  html        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  revoked     INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0,
  last_view   TEXT
)`;
let ensured = false;
async function ensure(env) {
  if (ensured) return;
  await env.DB.prepare(CLIENT_PAGE_SQL).run().catch(() => {});
  ensured = true;
}

const HITS = new Map();
function limited(ip, max = 60, windowMs = 60_000, now = Date.now()) {
  const k = ip || 'anon', h = HITS.get(k);
  if (!h || now - h.t > windowMs) { HITS.set(k, { t: now, n: 1 }); if (HITS.size > 5000) HITS.clear(); return false; }
  h.n += 1; return h.n > max;
}

async function brandNames(env, acts) {
  const ids = String(acts || '').split(',').filter(Boolean);
  if (!ids.length) return [];
  const q = ids.map((_, i) => `?${i + 1}`).join(',');
  const rows = (await env.DB.prepare(`SELECT act_id, name FROM brand_accounts WHERE act_id IN (${q})`).bind(...ids).all().catch(() => ({ results: [] }))).results || [];
  return ids.map(id => rows.find(r => r.act_id === id)?.name).filter(Boolean);
}

/** PUBLIC: GET /api/client-page/:token. Returns a Response, or null when the path is not ours. */
export async function clientPagePublic(request, env, path) {
  const m = path.match(/^\/api\/client-page\/([^/]+)$/);
  if (!m || request.method !== 'GET') return null;
  if (limited(request.headers.get('CF-Connecting-IP'))) return json({ error: 'Too many requests. Try again in a minute.' }, 429, { 'Retry-After': '60' });
  const gone = () => json({ error: 'This link was turned off. Ask whoever sent it for a new one.' }, 404, { 'Cache-Control': 'no-store' });
  if (!TOKEN_RE.test(m[1])) return gone();
  await ensure(env);
  const r = await env.DB.prepare(`SELECT * FROM p_client_page WHERE token = ?1`).bind(m[1]).first().catch(() => null);
  if (!r || r.revoked) return gone();
  await env.DB.prepare(`UPDATE p_client_page SET views = views + 1, last_view = datetime('now') WHERE token = ?1`).bind(m[1]).run().catch(() => {});
  return json({ title: r.title, brands: await brandNames(env, r.acts), html: r.html, updated_at: r.updated_at },
    200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
}

/** ADMIN routes. `admin` = the caller is a Mobius admin (never a client login). */
export async function handleClientPage({ path, request, env, admin, email }) {
  if (path !== '/api/client-page' && path !== '/api/client-pages' && path !== '/api/client-page/revoke') return null;
  if (!admin) return json({ error: 'unauthorized' }, 401);
  await ensure(env);

  if (path === '/api/client-pages' && request.method === 'GET') {
    const act = new URL(request.url).searchParams.get('act') || '';
    const rows = (await env.DB.prepare(`SELECT token, slug, title, acts, created_by, created_at, updated_at, revoked, views, last_view FROM p_client_page ORDER BY updated_at DESC LIMIT 300`).all()).results || [];
    return json({ pages: rows.filter(r => !act || r.acts.split(',').includes(act)).map(r => ({ ...r, acts: r.acts.split(','), revoked: !!r.revoked, url: PAGE_BASE + r.token })) });
  }

  if (path === '/api/client-page/revoke' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const r = await env.DB.prepare(`UPDATE p_client_page SET revoked = 1 WHERE token = ?1 OR slug = ?2`).bind(String(b.token || ''), String(b.slug || '')).run();
    return r.meta?.changes ? json({ ok: true }) : json({ error: 'No such page.' }, 404);
  }

  if (path === '/api/client-page' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const slug = String(b.slug || '').toLowerCase();
    if (!SLUG_RE.test(slug)) return json({ error: 'slug: lowercase letters, numbers and dashes' }, 400);
    const acts = [...new Set((Array.isArray(b.acts) ? b.acts : String(b.acts || '').split(',')).map(s => String(s).trim()).filter(Boolean))];
    if (!acts.length) return json({ error: 'acts: at least one brand id' }, 400);
    const known = await brandNames(env, acts.join(','));
    if (known.length !== acts.length) return json({ error: 'Unknown brand id in acts.' }, 400);
    const html = String(b.html || '');
    if (!html.trim()) return json({ error: 'html is empty' }, 400);
    if (html.length > MAX_BYTES) return json({ error: 'Page is too big for one link (1.8 MB).' }, 413);
    const title = clip(b.title, 160) || 'Locus';
    const old = await env.DB.prepare(`SELECT token FROM p_client_page WHERE slug = ?1`).bind(slug).first();
    const token = old?.token || hex(16);
    if (old) {
      await env.DB.prepare(`UPDATE p_client_page SET title = ?2, acts = ?3, html = ?4, updated_at = datetime('now'), revoked = 0 WHERE slug = ?1`)
        .bind(slug, title, acts.join(','), html).run();
    } else {
      await env.DB.prepare(`INSERT INTO p_client_page (token, slug, title, acts, html, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
        .bind(token, slug, title, acts.join(','), html, email || 'owner').run();
    }
    return json({ token, slug, url: PAGE_BASE + token, brands: known, replaced: !!old });
  }
  return json({ error: 'method' }, 405);
}
