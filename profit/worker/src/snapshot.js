/* Public snapshot links (2026-10-09). "Share a public link" in a card's or a page's Export menu (share.js) FREEZES what
 * is on screen at that moment: the card's (or page's) rendered markup with every number baked in, plus only the CSS
 * rules that markup uses, the brand, the title, the dates, the compare window and the attribution note. Nothing on the
 * public page is live: profit/s.html draws the frozen markup in a sandboxed iframe (no scripts) and calls nothing else.
 *
 * Routes:
 *   GET  /api/snapshot/:token          PUBLIC (mounted before the auth gate). 404 when missing, revoked or expired.
 *                                      Counts a view. Never returns who made it or the brand's ids.
 *   POST /api/snapshot                 authed  { act, kind: card|page, title, page, dates, cmp, attr, html, css, root, days: 7|30|0 }
 *   GET  /api/snapshots                authed  the Shared links list (brand limits apply: brandguard filters rows by act_id)
 *   POST /api/snapshot/revoke          authed  { token }
 *
 * Rules (Cole, 2026-10-09): one brand per link (never All clients, and a view that names another client is refused),
 * a limited user can only share or revoke their own brands, links die on revoke or at expiry (7 / 30 days / never). */
import { brandsFor } from './brandguard.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
const json = (o, status = 200, extra = {}) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', ...CORS, ...extra } });
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('');
const TOKEN_RE = /^[a-f0-9]{32}$/;
const MAX_BYTES = 1_800_000;                  // D1 holds up to 2 MB in one value; html + css together stay under it
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

export const SNAP_SQL = `CREATE TABLE IF NOT EXISTS p_snapshot (
  token       TEXT PRIMARY KEY,
  act_id      TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'card',
  title       TEXT NOT NULL,
  page        TEXT,
  html        TEXT NOT NULL,
  css         TEXT,
  meta_json   TEXT,
  created_by  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT,
  revoked     INTEGER NOT NULL DEFAULT 0,
  views       INTEGER NOT NULL DEFAULT 0,
  last_view   TEXT
)`;
let ensured = false;
export async function ensureSnap(env) {
  if (ensured) return;
  await env.DB.prepare(SNAP_SQL).run().catch(() => {});
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_snapshot_act ON p_snapshot (act_id, created_at)`).run().catch(() => {});
  ensured = true;
}

/** Belt and braces on top of the sandboxed iframe: no scripts, no frames, no handlers, no javascript: links,
 *  no meta refresh, no forms, and no brand or ad-account ids left in attributes. */
export function scrub(html) {
  return String(html || '')
    .replace(/<\s*(script|iframe|object|embed|noscript|template|form|textarea|select)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|iframe|object|embed|meta|base|link|frame|frameset|form|input)\b[^>]*>/gi, '')
    .replace(/\s(?:on[a-z]+|formaction|srcdoc)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href|action)\s*=\s*(["'])\s*(javascript|vbscript|data:text\/html)[^"']*\2/gi, '$1=$2#$2')
    .replace(/\b(act_\d{5,}|brand_[a-z0-9_]{2,60})\b/g, '');
}
const scrubCss = css => String(css || '').replace(/<\/?\s*style/gi, '').replace(/@import[^;]*;/gi, '').replace(/expression\s*\(/gi, '(').replace(/javascript:/gi, '');
const textOf = html => String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

/** The first other client named in the frozen view, or null. A public link must carry one brand only. */
export async function otherBrandIn(env, act, html) {
  const text = ' ' + textOf(html).toLowerCase() + ' ';
  let rows = [];
  try { rows = (await env.DB.prepare(`SELECT act_id, name FROM brand_accounts WHERE act_id <> ?1`).bind(act).all()).results || []; } catch { return null; }
  const own = ((await env.DB.prepare(`SELECT name FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null))?.name || '').toLowerCase();
  for (const r of rows) {
    const n = String(r.name || '').toLowerCase().trim();
    if (n.length < 4 || (own && own.includes(n))) continue;
    const re = new RegExp(`[^a-z0-9]${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z0-9]`);
    if (re.test(text)) return r.name;
  }
  return null;
}

/* ---- per-IP rate limit on the public route (per isolate; enough to stop a scraper walking tokens) ---- */
const HITS = new Map();
export function limited(ip, max = 60, windowMs = 60_000, now = Date.now()) {
  const k = ip || 'anon', h = HITS.get(k);
  if (!h || now - h.t > windowMs) { HITS.set(k, { t: now, n: 1 }); if (HITS.size > 5000) HITS.clear(); return false; }
  h.n += 1; return h.n > max;
}

const nowSql = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const live = r => r && !r.revoked && (!r.expires_at || r.expires_at > nowSql());

/** PUBLIC: GET /api/snapshot/:token. Returns a Response, or null when the path is not ours. */
export async function snapshotPublic(request, env, path) {
  const m = path.match(/^\/api\/snapshot\/([^/]+)$/);
  if (!m || request.method !== 'GET') return null;
  if (limited(request.headers.get('CF-Connecting-IP'))) return json({ error: 'Too many requests. Try again in a minute.' }, 429, { 'Retry-After': '60' });
  const gone = () => json({ error: 'This link has expired or was turned off. Ask whoever sent it for a new one.' }, 404, { 'Cache-Control': 'no-store' });
  if (!TOKEN_RE.test(m[1])) return gone();
  await ensureSnap(env);
  const r = await env.DB.prepare(`SELECT s.*, a.name AS brand FROM p_snapshot s LEFT JOIN brand_accounts a ON a.act_id = s.act_id WHERE s.token = ?1`).bind(m[1]).first().catch(() => null);
  if (!live(r)) return gone();
  await env.DB.prepare(`UPDATE p_snapshot SET views = views + 1, last_view = datetime('now') WHERE token = ?1`).bind(m[1]).run().catch(() => {});
  let meta = {}; try { meta = JSON.parse(r.meta_json || '{}') || {}; } catch {}
  return json({
    snapshot: true, kind: r.kind, title: r.title, page: r.page || '', brand: r.brand || meta.brand || '',
    dates: meta.dates || '', cmp: meta.cmp || '', attr: meta.attr || '', root: meta.root || {},
    created_at: r.created_at, expires_at: r.expires_at || null, html: r.html, css: r.css || '',
  }, 200, { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
}

/** AUTHED routes. `email` is the signed-in person (null for a password session = the owner's master key). */
export async function handleSnapshot({ path, request, env, email }) {
  if (path !== '/api/snapshot' && path !== '/api/snapshots' && path !== '/api/snapshot/revoke') return null;
  await ensureSnap(env);
  const only = await brandsFor(env, email).catch(() => null);      // null = every brand
  const mayUse = act => !only || only.has(act);

  if (path === '/api/snapshots' && request.method === 'GET') {
    const rows = (await env.DB.prepare(`SELECT s.token, s.act_id, s.kind, s.title, s.page, s.created_by, s.created_at, s.expires_at, s.revoked, s.views, s.last_view, a.name AS brand
      FROM p_snapshot s LEFT JOIN brand_accounts a ON a.act_id = s.act_id ORDER BY s.created_at DESC LIMIT 300`).all()).results || [];
    return json({ links: rows.filter(r => mayUse(r.act_id)).map(r => ({ ...r, revoked: !!r.revoked, live: live(r) })) });
  }

  if (path === '/api/snapshot/revoke' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const t = String(b.token || '');
    if (!TOKEN_RE.test(t)) return json({ error: 'bad token' }, 400);
    const r = await env.DB.prepare(`SELECT act_id FROM p_snapshot WHERE token = ?1`).bind(t).first();
    if (!r) return json({ error: 'No such link.' }, 404);
    if (!mayUse(r.act_id)) return json({ error: 'You do not have access to that brand.' }, 403);
    await env.DB.prepare(`UPDATE p_snapshot SET revoked = 1 WHERE token = ?1`).bind(t).run();
    return json({ ok: true });
  }

  if (path === '/api/snapshot' && request.method === 'POST') {
    const b = await request.json().catch(() => ({}));
    const act = String(b.act || '');
    if (!act || act === 'all') return json({ error: 'A public link shows one brand. Pick the brand at the top first.' }, 400);
    if (!mayUse(act)) return json({ error: 'You do not have access to that brand.' }, 403);
    const acct = await env.DB.prepare(`SELECT act_id, name FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
    if (!acct) return json({ error: 'Unknown brand.' }, 404);
    const kind = b.kind === 'page' ? 'page' : 'card';
    const html = scrub(b.html), css = scrubCss(b.css);
    if (!textOf(html).trim()) return json({ error: 'There is nothing on this view to share yet.' }, 400);
    if (html.length + css.length > MAX_BYTES) return json({ error: 'This view is too big for one link. Share one card instead of the whole page.' }, 413);
    const other = await otherBrandIn(env, act, html);
    if (other) return json({ error: `This view names another client (${other}), so it cannot go on a public link. Share a card that shows ${acct.name} only.` }, 400);
    const days = [7, 30, 0].includes(+b.days) ? +b.days : 30;
    const expires = days ? new Date(Date.now() + days * 864e5).toISOString().replace('T', ' ').slice(0, 19) : null;
    const root = b.root && typeof b.root === 'object' ? { ui: clip(b.root.ui, 20), app: clip(b.root.app, 20), body: clip(b.root.body, 200) } : {};
    const meta = { brand: acct.name, dates: clip(b.dates, 120), cmp: clip(b.cmp, 160), attr: clip(b.attr, 120), root };
    const token = hex(16);
    await env.DB.prepare(`INSERT INTO p_snapshot (token, act_id, kind, title, page, html, css, meta_json, created_by, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
      .bind(token, act, kind, clip(b.title, 160) || 'Locus', clip(b.page, 80), html, css, JSON.stringify(meta), email || 'owner', expires).run();
    return json({ token, act_id: act, expires_at: expires, brand: acct.name });
  }
  return json({ error: 'method' }, 405);
}
