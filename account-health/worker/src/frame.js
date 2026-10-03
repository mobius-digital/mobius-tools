/**
 * FRAME.IO V4 (2026-10-02). Cole reviews assets in Frame, and his workspace is on the new
 * Frame (next.frame.io), where the old developer tokens see nothing. V4 sits behind Adobe:
 * an OAuth Web App made once in the Adobe Developer Console (Client ID + Client Secret),
 * then Cole signs in with his Frame/Adobe login. Same shape as Connect Atria:
 *
 *   1. Locus > Settings > New client > Connect Frame: Cole pastes the Client ID and Secret
 *      (POST /api/frame/start, admin; stored in p_studio_cfg, never sent back to a browser)
 *      and is sent to Adobe's sign-in. Redirect URL to put in the Adobe console:
 *      https://mobius-account-health.mobius-digital.workers.dev/frame/callback
 *   2. GET /frame/callback (public; the state is the proof) swaps the code for tokens.
 *   3. frameToken() refreshes before expiry. Disconnect forgets everything.
 *
 * API: https://api.frame.io/v4. accounts -> workspaces -> projects. The New client step
 * makes one project per client in the chosen workspace (settings `frameWorkspace`, else the
 * first) and adds the picked team as collaborators. frameTree() lists everything for tidying.
 */
import { clip, safeJson } from './research.js';

let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

const IMS = 'https://ims-na1.adobelogin.com/ims';
const API = 'https://api.frame.io/v4';
/* openid + profile + email identify the user; offline_access gives a refresh token;
   additional_info.roles is what Frame's own docs list for its V4 API. */
const SCOPE = 'openid,email,profile,offline_access,additional_info.roles';
const K = { client: 'frame_client', tokens: 'frame_tokens', state: 'frame_state' };

async function cfgGet(env, k) { return (await env.DB.prepare(`SELECT value FROM p_studio_cfg WHERE key = ?1`).bind(k).first().catch(() => null))?.value || null; }
async function cfgSet(env, k, v) {
  if (v == null) return env.DB.prepare(`DELETE FROM p_studio_cfg WHERE key = ?1`).bind(k).run();
  return env.DB.prepare(`INSERT INTO p_studio_cfg (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(k, v).run();
}
let tableReady = false;
async function ensureCfg(env) {
  if (tableReady) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_studio_cfg (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  tableReady = true;
}
const b64url = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function frameStatus(env) {
  await ensureCfg(env);
  const t = safeJson(await cfgGet(env, K.tokens), null);
  const c = safeJson(await cfgGet(env, K.client), null);
  return { connected: !!t?.refresh || !!(t?.access && t.exp > Date.now()), since: t?.since || null, has_client: !!c?.id, workspace: t?.workspace || null };
}

/* ---------------- connect ---------------- */
async function start(env, origin, b) {
  await ensureCfg(env);
  const id = String(b.client_id || '').trim(), secret = String(b.client_secret || '').trim();
  const prev = safeJson(await cfgGet(env, K.client), null);
  const c = id && secret ? { id, secret } : prev;
  if (!c?.id || !c?.secret) throw Object.assign(new Error('Paste the Client ID and the Client Secret from the Adobe Developer Console.'), { status: 400 });
  const redirect = `${origin}/frame/callback`;
  await cfgSet(env, K.client, JSON.stringify({ ...c, redirect }));
  const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
  await cfgSet(env, K.state, JSON.stringify({ state, at: Date.now() }));
  const q = new URLSearchParams({ client_id: c.id, redirect_uri: redirect, scope: SCOPE, response_type: 'code', state });
  return { url: `${IMS}/authorize/v2?${q}` };
}

function page(ok, msg) {
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Frame</title>
<body style="font:16px system-ui;padding:40px 16px;color:#13202B;max-width:560px;margin:0 auto"><h2>${ok ? 'Frame is connected' : 'Frame did not connect'}</h2><p>${e(msg)}</p>
<p><a href="https://tools.go-mobius-digital.com/profit/?open=settings">Back to Locus</a>. You can close this tab.</p></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function frameCallback(env, url) {
  await ensureCfg(env);
  const st = safeJson(await cfgGet(env, K.state), null);
  if (url.searchParams.get('error')) { await cfgSet(env, K.state, null); return page(false, `Adobe said: ${clip(url.searchParams.get('error_description') || url.searchParams.get('error'), 200)}`); }
  if (!st) return page(false, 'This sign-in link was already used or is out of date. Go back to Locus and click Connect Frame again.');
  if (Date.now() - st.at > 20 * 60e3) return page(false, 'The sign-in took longer than 20 minutes. Go back to Locus and click Connect Frame again.');
  if (url.searchParams.get('state') !== st.state) return page(false, 'That sign-in was started from an older click. Click Connect Frame once and finish in the tab it opens.');
  const code = url.searchParams.get('code');
  if (!code) return page(false, 'Adobe sent no sign-in code back.');
  const c = safeJson(await cfgGet(env, K.client), null);
  if (!c?.id) return page(false, 'Locus lost the Frame client. Click Connect Frame again.');
  const body = new URLSearchParams({ grant_type: 'authorization_code', client_id: c.id, client_secret: c.secret, code });
  const r = await F(`${IMS}/token/v3`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  await cfgSet(env, K.state, null);
  if (!r.ok || !j.access_token) return page(false, `Adobe said: ${clip(j.error_description || j.error || r.status, 200)}`);
  await cfgSet(env, K.tokens, JSON.stringify({ access: j.access_token, refresh: j.refresh_token || '', exp: Date.now() + (j.expires_in || 3600) * 1000, since: new Date().toISOString() }));
  /* Say what the token can see, so a wrong Adobe account is obvious right away. */
  let seen = '';
  try { const ws = await frameWorkspaces(env); seen = ws.length ? ` Workspaces: ${ws.map(w => w.name).join(', ')}.` : ' No workspaces are visible to this login.'; } catch (e) { seen = ` Could not list workspaces yet: ${e.message}`; }
  return page(true, `New clients get a Frame project automatically.${seen}`);
}

async function disconnect(env) { await ensureCfg(env); for (const k of Object.values(K)) await cfgSet(env, k, null); }

/** A live access token, refreshed before expiry. Null = not connected. */
export async function frameToken(env, force = false) {
  await ensureCfg(env);
  const t = safeJson(await cfgGet(env, K.tokens), null);
  if (!t?.access) return null;
  if (!force && t.exp > Date.now() + 60e3) return t.access;
  const c = safeJson(await cfgGet(env, K.client), null);
  if (!t.refresh || !c?.id) { await cfgSet(env, K.tokens, null); return null; }
  const body = new URLSearchParams({ grant_type: 'refresh_token', client_id: c.id, client_secret: c.secret, refresh_token: t.refresh });
  const r = await F(`${IMS}/token/v3`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r?.ok || !j.access_token) {
    const now = safeJson(await cfgGet(env, K.tokens), null);
    if (now?.access && now.access !== t.access && now.exp > Date.now() + 60e3) return now.access;
    if (r && [400, 401].includes(r.status)) await cfgSet(env, K.tokens, null);
    return null;
  }
  await cfgSet(env, K.tokens, JSON.stringify({ ...t, access: j.access_token, refresh: j.refresh_token || t.refresh, exp: Date.now() + (j.expires_in || 3600) * 1000 }));
  return j.access_token;
}

/* ---------------- API ---------------- */
export const NEEDS_FRAME = 'Frame is not connected. Locus > Settings > New client > Connect Frame (an Adobe Developer Console app, one time). Until then: make the project in Frame by hand.';
export async function frameApi(env, method, path, body) {
  const tok = await frameToken(env);
  if (!tok) throw new Error(NEEDS_FRAME);
  const run = async t => F(`${API}${path}`, { method, headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  let res = await run(tok);
  if (res.status === 401) { const t2 = await frameToken(env, true); if (t2) res = await run(t2); }
  const text = await res.text();
  const j = safeJson(text, {});
  if (!res.ok) throw new Error(`Frame (${method} ${path}): ${j.errors?.[0]?.detail || j.errors?.[0]?.title || j.message || `${res.status} ${text.slice(0, 200)}`}`);
  return j;
}
/* V4 answers are {data: ...}; lists may page with links.next. */
async function all(env, path) {
  const out = [];
  let next = path;
  for (let i = 0; i < 20 && next; i++) {
    const j = await frameApi(env, 'GET', next);
    out.push(...(Array.isArray(j.data) ? j.data : []));
    const n = j.links?.next;
    next = n ? (n.startsWith('http') ? n.replace(API, '') : n) : null;
    if (next && !next.startsWith('/')) next = '/' + next;
  }
  return out;
}

export async function frameWorkspaces(env) {
  const accounts = await all(env, '/accounts');
  const out = [];
  for (const a of accounts) {
    const ws = await all(env, `/accounts/${a.id}/workspaces`).catch(() => []);
    for (const w of ws) out.push({ id: w.id, name: w.name, account_id: a.id, account: a.display_name || a.name || '' });
  }
  return out;
}
/** The workspace new client projects go in: the chosen one, else the first. */
async function pickWorkspace(env) {
  const ws = await frameWorkspaces(env);
  if (!ws.length) throw new Error('This Frame login sees no workspace. Connect Frame with the login that owns the Mobius workspace.');
  const want = safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'frameWorkspace'`).first().catch(() => null))?.value, null);
  return (want && ws.find(w => w.id === want)) || ws[0];
}

/** One project per client, the picked team added. Returns { project, url, notes }. */
export async function frameProject(env, name, emails, prev = {}) {
  const notes = [];
  let project = prev.project || null, url = prev.url || null, account = prev.account || null;
  if (!project) {
    const w = await pickWorkspace(env);
    const p = await frameApi(env, 'POST', `/accounts/${w.account_id}/workspaces/${w.id}/projects`, { data: { name } });
    project = p.data?.id; account = w.account_id;
    if (!project) throw new Error('Frame made no project.');
    url = `https://next.frame.io/project/${project}`;
  }
  /* V4 has no collaborator call yet (2026-10-03: "no route found for POST .../collaborators").
     Say so once instead of failing per person; the workspace's members already see the project. */
  if (emails.length) notes.push(`Frame's API cannot add people to a project yet. If ${emails.join(', ')} are not workspace members, add them in Frame (Project > Share).`);
  return { project, url, account, notes };
}

/** Everything, read-only: for the audit. */
export async function frameTree(env) {
  const out = [];
  for (const w of await frameWorkspaces(env)) {
    const projects = await all(env, `/accounts/${w.account_id}/workspaces/${w.id}/projects`).catch(e => [{ name: `(could not list: ${e.message})` }]);
    out.push({ ...w, projects: projects.map(p => ({ id: p.id, name: p.name, updated: p.updated_at || p.inserted_at, root: p.root_folder_id || null })) });
  }
  return out;
}

/* ---------------- routes ---------------- */
export async function handleFrame(request, env, url, path, json, isAdmin) {
  if (path === '/frame/callback' && request.method === 'GET') return frameCallback(env, url);
  if (!path.startsWith('/api/frame/')) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const b = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
  try {
    if (path === '/api/frame/status') return json(await frameStatus(env));
    if (path === '/api/frame/start' && request.method === 'POST') return json(await start(env, url.origin, b));
    if (path === '/api/frame/disconnect' && request.method === 'POST') { await disconnect(env); return json({ ok: true }); }
    if (path === '/api/frame/tree') return json({ ok: true, workspaces: await frameTree(env) });
    if (path === '/api/frame/workspace' && request.method === 'POST') {
      await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('frameWorkspace', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(String(b.id || ''))).run();
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}
