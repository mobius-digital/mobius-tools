/**
 * ATRIA (2026-09-29): the team researches ads in Atria (app.tryatria.com). Atria has no REST
 * API and no API key; it has an MCP server (https://api.tryatria.com/mcp, Streamable HTTP,
 * JSON-RPC) behind OAuth. So Locus connects ONCE, workspace-wide, the way Studio connects Canva:
 *
 *   1. Cole clicks Connect Atria (Locus, Studio). POST /api/atria/start registers this worker
 *      as an OAuth client with Atria (dynamic client registration, once; the client id and
 *      secret live in p_studio_cfg, never logged, never sent to the browser), stores a PKCE
 *      verifier + state and returns Atria's sign-in URL. Scope: atria:read only.
 *   2. Cole signs in to Atria himself. Atria sends him back to GET /atria/callback on this
 *      worker, which checks the state, swaps the code for tokens and stores them.
 *   3. The ideas bot calls atriaAd(): a fresh access token (refreshed on expiry), then MCP
 *      initialize + tools/call get_library_ad, get_library_ad_transcript and
 *      get_library_ad_creative_tags. The ideas bot caches the result per ad in idea_media.
 *
 * Disconnect revokes the refresh token (best effort) and forgets the client and the tokens.
 */
import { clip, safeJson } from './research.js';

let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

export const ATRIA_MCP = 'https://api.tryatria.com/mcp';
const AUTH_META = 'https://auth.tryatria.com/.well-known/oauth-authorization-server';
const FALLBACK = { authorization_endpoint: 'https://auth.tryatria.com/oauth/authorize', token_endpoint: 'https://auth.tryatria.com/oauth/token',
  registration_endpoint: 'https://auth.tryatria.com/oauth/register', revocation_endpoint: 'https://auth.tryatria.com/oauth/revoke' };
const SCOPE = 'atria:read';
const PROTOCOL = '2025-06-18';
const K = { client: 'atria_client', tokens: 'atria_tokens', state: 'atria_state' };

/* ---------------- config rows (shared D1 table p_studio_cfg, like Canva's) ---------------- */
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

/* The client's credentials on a token call: Basic when Atria gave us a secret, else the id in the body. */
function clientAuth(c, params) {
  if (c.secret) return { Authorization: `Basic ${btoa(`${c.id}:${c.secret}`)}` };
  params.set('client_id', c.id);
  return {};
}

/* ---------------- connect ---------------- */
async function endpoints() {
  const r = await F(AUTH_META).catch(() => null);
  const j = r?.ok ? await r.json().catch(() => ({})) : {};
  return Object.fromEntries(Object.entries(FALLBACK).map(([k, v]) => [k, /^https:\/\//.test(j[k] || '') ? j[k] : v]));
}

/** Register once per redirect URL (dynamic client registration). */
async function clientFor(env, redirect) {
  const have = safeJson(await cfgGet(env, K.client), null);
  if (have?.id && have.redirect === redirect) return have;
  const ep = await endpoints();
  const r = await F(ep.registration_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_name: 'Mobius Locus (ideas bot)', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'], token_endpoint_auth_method: 'client_secret_basic', scope: SCOPE }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.client_id) throw new Error(`Atria would not register Locus (${r.status}${j.error_description || j.error ? `: ${clip(j.error_description || j.error, 160)}` : ''}).`);
  const c = { id: j.client_id, secret: j.token_endpoint_auth_method === 'none' ? '' : (j.client_secret || ''), redirect, ...ep, at: Date.now() };
  await cfgSet(env, K.client, JSON.stringify(c));
  return c;
}

export async function atriaStatus(env) {
  await ensureCfg(env);
  const t = safeJson(await cfgGet(env, K.tokens), null);
  return { connected: !!t?.refresh || !!(t?.access && t.exp > Date.now()), since: t?.since || null, scope: SCOPE };
}

async function start(env, origin) {
  await ensureCfg(env);
  const redirect = `${origin}/atria/callback`;
  const c = await clientFor(env, redirect);
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
  await cfgSet(env, K.state, JSON.stringify({ state, verifier, at: Date.now() }));
  const q = new URLSearchParams({ response_type: 'code', client_id: c.id, redirect_uri: redirect, scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256', resource: ATRIA_MCP });
  return { url: `${c.authorization_endpoint}?${q}` };
}

function page(ok, msg) {
  const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Atria</title>
<body style="font:16px system-ui;padding:40px 16px;color:#13202B;max-width:560px;margin:0 auto"><h2>${ok ? 'Atria is connected' : 'Atria did not connect'}</h2><p>${e(msg)}</p>
<p><a href="https://tools.go-mobius-digital.com/profit/">Back to Locus</a>. You can close this tab.</p></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

export async function atriaCallback(env, url) {
  await ensureCfg(env);
  const st = safeJson(await cfgGet(env, K.state), null);
  if (!st || !url.searchParams.get('state') || st.state !== url.searchParams.get('state') || Date.now() - st.at > 20 * 60e3)
    return page(false, 'The sign-in link was out of date. Go back to Locus and click Connect Atria again.');
  if (url.searchParams.get('error')) { await cfgSet(env, K.state, null); return page(false, `Atria said: ${clip(url.searchParams.get('error_description') || url.searchParams.get('error'), 200)}`); }
  const c = safeJson(await cfgGet(env, K.client), null);
  if (!c?.id) return page(false, 'Locus lost its Atria registration. Click Connect Atria again.');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: c.redirect, code_verifier: st.verifier, resource: ATRIA_MCP });
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...clientAuth(c, body) };
  const r = await F(c.token_endpoint || FALLBACK.token_endpoint, { method: 'POST', headers, body });
  const j = await r.json().catch(() => ({}));
  await cfgSet(env, K.state, null);
  if (!r.ok || !j.access_token) return page(false, `Atria said: ${clip(j.error_description || j.error || r.status, 200)}`);
  await cfgSet(env, K.tokens, JSON.stringify({ access: j.access_token, refresh: j.refresh_token || '', exp: Date.now() + (j.expires_in || 3600) * 1000, since: new Date().toISOString() }));
  return page(true, 'The ideas bot can now open Atria ad links (and Meta Ad Library links) dropped in a brand\'s internal Slack channel.');
}

async function disconnect(env) {
  await ensureCfg(env);
  const t = safeJson(await cfgGet(env, K.tokens), null), c = safeJson(await cfgGet(env, K.client), null);
  if (t?.refresh && c?.id) {
    const body = new URLSearchParams({ token: t.refresh, token_type_hint: 'refresh_token' });
    await F(c.revocation_endpoint || FALLBACK.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...clientAuth(c, body) }, body }).catch(() => {});
  }
  for (const k of Object.values(K)) await cfgSet(env, k, null);
}

/** A live access token, refreshed when it is about to expire. Null = not connected (or the sign-in expired). */
export async function atriaToken(env, force = false) {
  await ensureCfg(env);
  const t = safeJson(await cfgGet(env, K.tokens), null);
  if (!t?.access) return null;
  if (!force && t.exp > Date.now() + 60e3) return t.access;
  const c = safeJson(await cfgGet(env, K.client), null);
  if (!t.refresh || !c?.id) { await cfgSet(env, K.tokens, null); return null; }
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, resource: ATRIA_MCP });
  const r = await F(c.token_endpoint || FALLBACK.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...clientAuth(c, body) }, body }).catch(() => null);
  const j = r ? await r.json().catch(() => ({})) : {};
  if (!r?.ok || !j.access_token) {
    /* Another job may have refreshed (and rotated) it a moment ago: use that one if it is newer. */
    const now = safeJson(await cfgGet(env, K.tokens), null);
    if (now?.access && now.access !== t.access && now.exp > Date.now() + 60e3) return now.access;
    if (r && [400, 401].includes(r.status)) await cfgSet(env, K.tokens, null);
    return null;
  }
  await cfgSet(env, K.tokens, JSON.stringify({ ...t, access: j.access_token, refresh: j.refresh_token || t.refresh, exp: Date.now() + (j.expires_in || 3600) * 1000 }));
  return j.access_token;
}

/* ---------------- MCP (Streamable HTTP) ---------------- */
/* A reply is either plain JSON or an SSE stream whose data lines carry JSON-RPC messages. */
async function rpcReply(r, id) {
  const text = await r.text().catch(() => '');
  if (/event-stream/.test(r.headers.get('content-type') || '')) {
    const msgs = text.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => safeJson(l.slice(5).trim(), null)).filter(Boolean);
    return msgs.find(m => m.id === id) || msgs.find(m => m.result || m.error) || null;
  }
  return safeJson(text, null);
}

export function mcpSession(env) {
  let tok = null, session = null, n = 0, ready = false;
  const post = async (msg) => {
    const headers = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': PROTOCOL,
      ...(session ? { 'Mcp-Session-Id': session } : {}) };
    return F(ATRIA_MCP, { method: 'POST', headers, body: JSON.stringify(msg) });
  };
  const open = async () => {
    const id = ++n;
    const r = await post({ jsonrpc: '2.0', id, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'mobius-ideas-bot', version: '1.0' } } });
    if (r.status === 401) return 401;
    if (!r.ok) throw new Error(`Atria's server said ${r.status}`);
    session = r.headers.get('mcp-session-id') || null;
    await rpcReply(r, id);
    await post({ jsonrpc: '2.0', method: 'notifications/initialized' }).catch(() => null);
    ready = true;
    return 200;
  };
  /* One tool call. Returns the parsed result (structuredContent, or the JSON in the text), or throws. */
  const call = async (name, args, retried = false) => {
    if (!tok) tok = await atriaToken(env);
    if (!tok) throw Object.assign(new Error('not connected'), { atria: 'not_connected' });
    if (!ready && (await open()) === 401) {
      if (retried) throw Object.assign(new Error('sign-in expired'), { atria: 'not_connected' });
      tok = await atriaToken(env, true); return call(name, args, true);
    }
    const id = ++n;
    const r = await post({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } });
    if (r.status === 401 && !retried) { ready = false; session = null; tok = await atriaToken(env, true); return call(name, args, true); }
    if (r.status === 404 && session && !retried) { ready = false; session = null; return call(name, args, true); }   // session expired
    if (!r.ok) throw new Error(`Atria's server said ${r.status}`);
    const m = await rpcReply(r, id);
    if (m?.error) throw new Error(clip(m.error.message || 'error', 200));
    const res = m?.result || {};
    const text = (res.content || []).filter(p => p.type === 'text').map(p => p.text).join('\n');
    if (res.isError) throw Object.assign(new Error(clip(text || 'tool error', 200)), { tool: true });
    return res.structuredContent || safeJson(text, null) || (text ? { text } : {});
  };
  return { call };
}

/* Tags come back in whatever shape Atria picks; keep the words, drop ids and urls. */
export function tagsText(v) {
  const out = [];
  const walk = (x, key = '') => {
    if (out.join('; ').length > 3000 || x == null) return;
    if (Array.isArray(x)) { x.forEach(y => walk(y, key)); return; }
    if (typeof x === 'object') { for (const [k, y] of Object.entries(x)) if (!/(^|_)(id|ids|url|urls|uuid)$/i.test(k)) walk(y, k); return; }
    const s = String(x).trim();
    if (!s || /^https?:\/\//.test(s) || /^m?\d{6,}$/.test(s)) return;
    out.push(key && !/^\d+$/.test(key) ? `${key.replace(/_/g, ' ')}: ${s}` : s);
  };
  walk(v);
  return clip(out.join('; '), 3000);
}

/**
 * One ad from Atria's library, by Atria id ("m" + the Meta Ad Library id).
 * { ok: true, ad, transcript, tags } or { ok: false, reason: 'not_connected' | 'not_found' | 'failed', message }.
 */
export async function atriaAd(env, adId) {
  const mcp = mcpSession(env);
  let ad;
  try { ad = await mcp.call('get_library_ad', { ad_id: adId }); }
  catch (e) {
    if (e.atria === 'not_connected') return { ok: false, reason: 'not_connected' };
    if (e.tool && /not.?found|no ad|does not exist|unknown/i.test(e.message)) return { ok: false, reason: 'not_found' };
    return { ok: false, reason: e.tool ? 'not_found' : 'failed', message: e.message };
  }
  ad = ad?.ad || ad;
  if (!ad || ad.error || !(ad.advertiser_name || ad.title || ad.body || (ad.images || []).length || (ad.videos || []).length)) return { ok: false, reason: 'not_found' };
  let transcript = '', tags = '';
  if (ad.media_format === 'video' || (ad.videos || []).length) {
    const t = await mcp.call('get_library_ad_transcript', { ad_id: adId }).catch(() => null);
    if (t && !t.error && (!t.status || t.status === 'ready')) transcript = clip(t.text || '', 8000).trim();
  }
  const g = await mcp.call('get_library_ad_creative_tags', { ad_ids: [adId] }).catch(() => null);
  if (g) tags = tagsText(g.results || g.ads || g.tags || g);
  return { ok: true, ad, transcript, tags };
}

/* ---------------- routes ---------------- */
export async function handleAtria(request, env, url, path, json, isAdmin) {
  if (path === '/atria/callback' && request.method === 'GET') return atriaCallback(env, url);
  if (!path.startsWith('/api/atria/')) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  try {
    if (path === '/api/atria/status' && request.method === 'GET') return json(await atriaStatus(env));
    if (path === '/api/atria/start' && request.method === 'POST') return json(await start(env, url.origin));
    if (path === '/api/atria/disconnect' && request.method === 'POST') { await disconnect(env); return json({ ok: true, connected: false }); }
  } catch (e) { return json({ error: e.message || 'Something went wrong.' }, 502); }
  return null;
}
