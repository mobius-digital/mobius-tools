/* LOCUS SOCIAL, phase 2: THE WEEK AND POSTING DIRECT (2026-10-19). Plan: docs/locus-social/proposal.html
   (https://claude.ai/artifact/6DCyDxYMGAsfRpeNWzatZH), "A time grid, a tray of ready content". Watch (phase 1) is social.js.

   WHAT THIS IS. A brand connects its own accounts (Brand settings > Social > Connect accounts), the Week screen puts a
   post on the grid (one caption, per-platform tweaks only where needed), and at post time this module publishes it
   DIRECT, with our own apps, no posting service in between:
     Instagram   Graph API: a container (/{ig}/media: image, REELS or CAROUSEL) then /{ig}/media_publish, first comment
                 after. Token: the Mobius Tools system user token (META_TOKEN, needs instagram_content_publish) for
                 Lucky, or a Page's own token kept per brand.
     Facebook    the Page token from /me/accounts: /{page}/photos, /{page}/videos, /{page}/feed with attached_media.
     TikTok      Content Posting API (a Login Kit app, TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET, scopes video.upload,
                 video.publish, video.list, user.info.basic). Until TikTok's audit passes an app may only put a video in
                 the person's TikTok INBOX (a draft they finish in the app) or post it SELF_ONLY: mode 'draft' (the
                 default). Mode 'live' = direct post, public.
     YouTube     Data API v3 resumable upload with a per-brand Google OAuth refresh token (GOOGLE_CLIENT_ID +
                 GOOGLE_CLIENT_SECRET, scope youtube.upload + youtube.readonly). Until Google's verification passes the
                 video lands PRIVATE (mode 'draft'); mode 'live' = public.
     Notify      (Later's fallback) a platform that is not connected, or whose publish failed on auth, becomes a Slack DM
                 to whoever made the post (or the brand's internal channel) at post time: the file and the caption ready
                 to paste, a "Posted it" button (soc_done) that marks the post done by hand.
   Media is STAGED first: whatever the tray item points at (a Studio final, a creator clip, an ad cover, an upload) is
   copied once into R2 social/u/<key>, pictures as JPEG through the Images binding (Instagram takes JPEG only), and
   served public by an unguessable key at /social-m/u/<key>, which is the URL every platform pulls from.

   THE SCHEDULER: a 5-minute cron (wrangler.toml) and the hourly tick both run socialPostTick: every post whose time
   has come is claimed with one conditional UPDATE (scheduled -> posting; two ticks can never post it twice), staged,
   published to each account it is on, and marked posted / partly / handoff / failed. A post stuck in 'posting' for 30
   minutes (a crash mid-way) is marked failed, never retried on its own, because a retry could post twice.
   RESULTS: socialResultsTick (hourly) refreshes views, likes and comments on posts from the last 30 days once a day,
   from the platform's own numbers where the account is connected.
   TAGGED-IN (phase 2.5): the Instagram account's /tags (posts others tagged us in) land in the tray with the creator's
   handle, once a day with the results.

   Tables social_account, social_post_out, social_caption, social_media, social_oauth_state (created on first use; also
   in schema.sql). Tokens never leave the worker: GET /api/social/accounts says connected / mode / error only. */
import { clientScope } from './brandguard.js';
import { coverUrl } from './creative.js';
import { metaOf } from './brands.js';
import { ideaState } from './ideas.js';
import { markDone } from './actions.js';

let F = fetch;
export function useFetch(f) { F = f; }
const SELF = 'https://mobius-account-health.mobius-digital.workers.dev';
const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const G = 'https://graph.facebook.com/v23.0';
const TT = 'https://open.tiktokapis.com/v2';
const HAIKU = 'claude-haiku-5-5';
const DAY = 864e5;
export const PLATS = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };
const safe = (t, d = null) => { try { return t == null ? d : JSON.parse(t); } catch { return d; } };
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const nowIso = () => new Date().toISOString();
const plain = (msg, status) => Object.assign(new Error(msg), { plain: true, status });
async function keyOf(id) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`locus-social-out:${id}`)));
  return [...b.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- tables ---------------- */
let ready = false;
export async function ensureSocialPost(env) {
  if (ready) return;
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS social_account (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, plat TEXT NOT NULL, ext_id TEXT, name TEXT, handle TEXT, pic TEXT,
      token_json TEXT, scopes TEXT, mode TEXT NOT NULL DEFAULT 'draft', status TEXT NOT NULL DEFAULT 'ok', error TEXT, connected_by TEXT,
      connected_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS social_account_act ON social_account (act_id)`,
    `CREATE TABLE IF NOT EXISTS social_post_out (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
      caption TEXT NOT NULL DEFAULT '', media_json TEXT NOT NULL DEFAULT '[]', targets_json TEXT NOT NULL DEFAULT '{}', results_json TEXT NOT NULL DEFAULT '{}',
      auto INTEGER NOT NULL DEFAULT 1, created_by TEXT, posting_at TEXT, posted_at TEXT, pulled_at TEXT, error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS social_post_out_act ON social_post_out (act_id, at)`,
    `CREATE INDEX IF NOT EXISTS social_post_out_due ON social_post_out (status, at)`,
    `CREATE TABLE IF NOT EXISTS social_caption (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, text TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS social_media (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, type TEXT, name TEXT, bytes INTEGER,
      who TEXT, source TEXT NOT NULL DEFAULT 'upload', url TEXT, created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS social_media_act ON social_media (act_id)`,
    `CREATE TABLE IF NOT EXISTS social_oauth_state (state TEXT PRIMARY KEY, act_id TEXT NOT NULL, plat TEXT NOT NULL, email TEXT, at TEXT NOT NULL DEFAULT (datetime('now')))`,
  ]) await env.DB.prepare(sql).run();
  ready = true;
}

/* ---------------- accounts (tokens stay here) ---------------- */
async function accountsOf(env, act) {
  const rows = (await env.DB.prepare(`SELECT * FROM social_account WHERE act_id = ?1`).bind(act).all()).results || [];
  return Object.fromEntries(rows.map(r => [r.plat, { ...r, token: safe(r.token_json, {}) }]));
}
async function putAccount(env, act, plat, a, who) {
  await env.DB.prepare(`INSERT INTO social_account (id, act_id, plat, ext_id, name, handle, pic, token_json, scopes, mode, status, error, connected_by)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'ok', NULL, ?11)
    ON CONFLICT(id) DO UPDATE SET ext_id = excluded.ext_id, name = excluded.name, handle = excluded.handle, pic = excluded.pic, token_json = excluded.token_json,
      scopes = excluded.scopes, status = 'ok', error = NULL, connected_by = excluded.connected_by, connected_at = datetime('now'), updated_at = datetime('now')`)
    .bind(`${act}|${plat}`, act, plat, a.ext_id || null, clip(a.name, 120) || null, clip(a.handle, 80) || null, a.pic || null, JSON.stringify(a.token || {}), a.scopes || null, a.mode || (plat === 'ig' || plat === 'fb' ? 'live' : 'draft'), who || null).run();
}
async function accountError(env, act, plat, error) {
  await env.DB.prepare(`UPDATE social_account SET status = ?3, error = ?4, updated_at = datetime('now') WHERE act_id = ?1 AND plat = ?2`).bind(act, plat, error ? 'error' : 'ok', error ? clip(error, 300) : null).run();
}
/** What the browser sees: never a token. */
const pubAccount = a => a ? ({ plat: a.plat, connected: a.status !== 'gone', name: a.name, handle: a.handle, pic: a.pic, mode: a.mode, status: a.status, error: a.error, connected_at: a.connected_at, connected_by: a.connected_by }) : null;

/* ---- Meta: the Pages the Mobius Tools token can see, each with its Instagram account ---- */
async function graph(env, path, params = {}, { method = 'GET', token } = {}) {
  const tok = token || env.META_TOKEN;
  if (!tok) throw plain('The Meta token (META_TOKEN) is not set on the server.');
  const qs = new URLSearchParams(Object.entries({ ...params, access_token: tok }).filter(([, v]) => v != null).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  const r = method === 'GET' ? await F(`${G}/${path}?${qs}`) : await F(`${G}/${path}`, { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs.toString() });
  const j = await r.json().catch(() => ({}));
  if (j.error) throw Object.assign(new Error(`Meta: ${j.error.message || j.error.type || 'error'}`), { meta: j.error, status: r.status });
  return j;
}
export async function metaPages(env) {
  const perms = await graph(env, 'me/permissions').then(j => (j.data || []).filter(p => p.status === 'granted').map(p => p.permission)).catch(() => []);
  const need = ['instagram_content_publish', 'pages_manage_posts'].filter(p => perms.length && !perms.includes(p));
  const j = await graph(env, 'me/accounts', { fields: 'id,name,access_token,picture{url},instagram_business_account{id,username,profile_picture_url}', limit: 100 });
  return { pages: (j.data || []).map(p => ({ id: p.id, name: p.name, pic: p.picture?.data?.url || null, ig: p.instagram_business_account ? { id: p.instagram_business_account.id, handle: p.instagram_business_account.username, pic: p.instagram_business_account.profile_picture_url || null } : null, _tok: p.access_token })), missing: need };
}
async function connectMeta(env, act, pageId, who) {
  const { pages, missing } = await metaPages(env);
  const p = pages.find(x => x.id === String(pageId));
  if (!p) throw plain('That Page is not one the Mobius Tools token can see. Give the system user access to it in Business settings first.');
  await putAccount(env, act, 'fb', { ext_id: p.id, name: p.name, handle: p.name, pic: p.pic, token: { access: p._tok, kind: 'page' }, scopes: 'pages_manage_posts', mode: 'live' }, who);
  if (p.ig) await putAccount(env, act, 'ig', { ext_id: p.ig.id, name: p.ig.handle, handle: p.ig.handle, pic: p.ig.pic, token: { use_env: true, page: p.id }, scopes: 'instagram_content_publish', mode: 'live' }, who);
  return { fb: true, ig: !!p.ig, missing };
}

/* ---- TikTok (Login Kit + Content Posting) ---- */
const TT_SCOPES = 'user.info.basic,video.upload,video.publish,video.list';
async function ttStart(env, act, email) {
  if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) throw plain('The TikTok Content Posting app keys are not set yet (TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET on the account-health worker).');
  const state = rid() + rid();
  await env.DB.prepare(`INSERT INTO social_oauth_state (state, act_id, plat, email) VALUES (?1, ?2, 'tt', ?3)`).bind(state, act, email || null).run();
  const q = new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, response_type: 'code', scope: TT_SCOPES, redirect_uri: `${SELF}/social/tiktok/callback`, state });
  return { url: `https://www.tiktok.com/v2/auth/authorize/?${q}` };
}
async function ttToken(env, body) {
  const r = await F(`${TT}/oauth/token/`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, ...body }).toString() });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(`TikTok: ${j.error_description || j.error || `HTTP ${r.status}`}`);
  return { access: j.access_token, refresh: j.refresh_token, open_id: j.open_id, scope: j.scope, expires_at: Date.now() + (j.expires_in || 86400) * 1000, refresh_expires_at: Date.now() + (j.refresh_expires_in || 365 * 86400) * 1000 };
}
async function ttCallback(env, url) {
  const st = await env.DB.prepare(`SELECT * FROM social_oauth_state WHERE state = ?1 AND plat = 'tt'`).bind(url.searchParams.get('state') || '').first();
  if (!st) throw new Error('That sign-in link is stale. Start again from Brand settings > Social.');
  await env.DB.prepare(`DELETE FROM social_oauth_state WHERE state = ?1`).bind(st.state).run();
  if (url.searchParams.get('error')) throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error'));
  const tok = await ttToken(env, { code: url.searchParams.get('code') || '', grant_type: 'authorization_code', redirect_uri: `${SELF}/social/tiktok/callback` });
  const me = await F(`${TT}/user/info/?fields=open_id,display_name,avatar_url,username`, { headers: { Authorization: `Bearer ${tok.access}` } }).then(r => r.json()).catch(() => ({}));
  const u = me.data?.user || {};
  await putAccount(env, st.act_id, 'tt', { ext_id: tok.open_id, name: u.display_name || u.username || 'TikTok', handle: u.username || null, pic: u.avatar_url || null, token: tok, scopes: tok.scope, mode: 'draft' }, st.email);
  return { act: st.act_id, name: u.display_name || u.username || 'TikTok' };
}
async function ttAccess(env, acc) {
  const t = acc.token || {};
  if (t.access && t.expires_at && t.expires_at > Date.now() + 120e3) return t.access;
  if (!t.refresh) throw plain('TikTok needs connecting again (no refresh token).');
  const next = await ttToken(env, { grant_type: 'refresh_token', refresh_token: t.refresh });
  acc.token = { ...t, ...next };
  await env.DB.prepare(`UPDATE social_account SET token_json = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(acc.id, JSON.stringify(acc.token)).run();
  return next.access;
}
async function ttCall(env, acc, path, body) {
  const tok = await ttAccess(env, acc);
  const r = await F(`${TT}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json; charset=UTF-8' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || (j.error && j.error.code && j.error.code !== 'ok')) throw Object.assign(new Error(`TikTok: ${j.error?.message || j.error?.code || `HTTP ${r.status}`}`), { code: j.error?.code, status: r.status });
  return j.data || {};
}

/* ---- YouTube (Google OAuth, per brand) ---- */
const YT_SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';
async function ytStart(env, act, email) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw plain('The Google OAuth client secret is not set yet (GOOGLE_CLIENT_SECRET on the account-health worker; the client id is already there).');
  const state = rid() + rid();
  await env.DB.prepare(`INSERT INTO social_oauth_state (state, act_id, plat, email) VALUES (?1, ?2, 'yt', ?3)`).bind(state, act, email || null).run();
  const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${SELF}/social/google/callback`, response_type: 'code', scope: YT_SCOPES, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${q}` };
}
async function ytToken(env, body) {
  const r = await F('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...body }).toString() });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error(`Google: ${j.error_description || j.error || `HTTP ${r.status}`}`);
  return { access: j.access_token, refresh: j.refresh_token, scope: j.scope, expires_at: Date.now() + (j.expires_in || 3600) * 1000 };
}
async function ytCallback(env, url) {
  const st = await env.DB.prepare(`SELECT * FROM social_oauth_state WHERE state = ?1 AND plat = 'yt'`).bind(url.searchParams.get('state') || '').first();
  if (!st) throw new Error('That sign-in link is stale. Start again from Brand settings > Social.');
  await env.DB.prepare(`DELETE FROM social_oauth_state WHERE state = ?1`).bind(st.state).run();
  if (url.searchParams.get('error')) throw new Error(url.searchParams.get('error'));
  const tok = await ytToken(env, { code: url.searchParams.get('code') || '', grant_type: 'authorization_code', redirect_uri: `${SELF}/social/google/callback` });
  const old = (await accountsOf(env, st.act_id)).yt;
  if (!tok.refresh && old?.token?.refresh) tok.refresh = old.token.refresh;
  const ch = await F('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${tok.access}` } }).then(r => r.json()).catch(() => ({}));
  const c = ch.items?.[0];
  if (!c) throw new Error('That Google account has no YouTube channel. Sign in with the account that owns the channel.');
  await putAccount(env, st.act_id, 'yt', { ext_id: c.id, name: c.snippet?.title || 'YouTube', handle: (c.snippet?.customUrl || '').replace(/^@/, '') || null, pic: c.snippet?.thumbnails?.default?.url || null, token: tok, scopes: tok.scope, mode: 'draft' }, st.email);
  return { act: st.act_id, name: c.snippet?.title || 'YouTube' };
}
async function ytAccess(env, acc) {
  const t = acc.token || {};
  if (t.access && t.expires_at && t.expires_at > Date.now() + 120e3) return t.access;
  if (!t.refresh) throw plain('YouTube needs connecting again (no refresh token).');
  const next = await ytToken(env, { grant_type: 'refresh_token', refresh_token: t.refresh });
  acc.token = { ...t, ...next, refresh: next.refresh || t.refresh };
  await env.DB.prepare(`UPDATE social_account SET token_json = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(acc.id, JSON.stringify(acc.token)).run();
  return acc.token.access;
}

/* ---------------- media: stage once, serve public ---------------- */
const isVideo = m => m.kind === 'video';
/** Read the source file: a public URL, or a profit-worker path through the service binding. */
async function fetchSource(env, m) {
  if (m.key) { const o = await env.MEDIA.get(`social/${m.key}`); if (!o) throw plain('That upload is gone.'); return { body: await o.arrayBuffer(), type: o.httpMetadata?.contentType || (isVideo(m) ? 'video/mp4' : 'image/jpeg') }; }
  const src = String(m.url || '');
  if (!/^https?:\/\//.test(src)) throw plain('That item has no file.');
  const r = src.startsWith(PROFIT_ORIGIN) && env.PROFIT ? await env.PROFIT.fetch(new Request(src)) : await F(src);
  if (!r.ok) throw plain(`The file could not be read (HTTP ${r.status}).`);
  const type = (r.headers.get('content-type') || '').split(';')[0] || (isVideo(m) ? 'video/mp4' : 'image/jpeg');
  return { body: await r.arrayBuffer(), type };
}
/** Pictures become JPEG (Instagram takes nothing else) through the Images binding when it is there. */
async function toJpeg(env, body, type) {
  if (type === 'image/jpeg' || !env.IMAGES) return { body, type };
  try {
    const out = await env.IMAGES.input(new Blob([body]).stream()).transform({ width: 1440, fit: 'scale-down' }).output({ format: 'image/jpeg', quality: 90 });
    return { body: await out.response().arrayBuffer(), type: 'image/jpeg' };
  } catch { return { body, type }; }
}
export async function stageMedia(env, post) {
  const media = safe(post.media_json, []);
  if (!env.MEDIA) throw plain('No media bucket on the server.');
  let changed = false;
  for (const m of media) {
    if (m.staged) continue;
    const got = await fetchSource(env, m);
    if (got.body.byteLength > 95 * 1024 * 1024) throw plain('A file is over 95 MB; make it smaller first.');
    const fin = isVideo(m) ? got : await toJpeg(env, got.body, got.type);
    const key = `u/${await keyOf(`${post.id}:${m.ref || m.src || m.key}:${Math.random()}`)}`;
    await env.MEDIA.put(`social/${key}`, fin.body, { httpMetadata: { contentType: fin.type, cacheControl: 'public, max-age=31536000' } });
    m.staged = key; m.bytes = fin.body.byteLength; m.type = fin.type; m.public = `${SELF}/social-m/${key}`;
    changed = true;
  }
  if (changed) await env.DB.prepare(`UPDATE social_post_out SET media_json = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(post.id, JSON.stringify(media)).run();
  post.media_json = JSON.stringify(media);
  return media;
}
async function stagedBytes(env, m) { const o = await env.MEDIA.get(`social/${m.staged}`); if (!o) throw plain('The staged file is gone.'); return new Uint8Array(await o.arrayBuffer()); }

/* ---------------- publishing, one function per platform ---------------- */
const capFor = (post, t, plat, max) => clip(t[plat]?.caption ?? post.caption, max);
async function waitContainer(env, id, tok) {
  for (let i = 0; i < 30; i++) {
    const s = await graph(env, id, { fields: 'status_code,status' }, { token: tok });
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Instagram could not take the file: ${s.status || s.status_code}`);
    await sleep(5000);
  }
  throw new Error('Instagram is still processing the video; try again in a few minutes.');
}
async function publishIg(env, acc, post, media, t) {
  const ig = acc.ext_id, tok = acc.token?.use_env ? env.META_TOKEN : acc.token?.access;
  const caption = capFor(post, t, 'ig', 2200);
  let creation;
  if (media.length > 1) {
    const kids = [];
    for (const m of media.slice(0, 10)) {
      const c = await graph(env, `${ig}/media`, isVideo(m) ? { media_type: 'VIDEO', video_url: m.public, is_carousel_item: true } : { image_url: m.public, is_carousel_item: true }, { method: 'POST', token: tok });
      if (isVideo(m)) await waitContainer(env, c.id, tok);
      kids.push(c.id);
    }
    creation = (await graph(env, `${ig}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption }, { method: 'POST', token: tok })).id;
    await waitContainer(env, creation, tok);
  } else {
    const m = media[0];
    creation = (await graph(env, `${ig}/media`, isVideo(m) ? { media_type: 'REELS', video_url: m.public, caption, share_to_feed: true } : { image_url: m.public, caption }, { method: 'POST', token: tok })).id;
    if (isVideo(m)) await waitContainer(env, creation, tok);
  }
  const pub = await graph(env, `${ig}/media_publish`, { creation_id: creation }, { method: 'POST', token: tok });
  const info = await graph(env, pub.id, { fields: 'permalink' }, { token: tok }).catch(() => ({}));
  const first = clip(t.ig?.first_comment, 2200);
  if (first) await graph(env, `${pub.id}/comments`, { message: first }, { method: 'POST', token: tok }).catch(() => {});
  return { id: pub.id, url: info.permalink || `https://www.instagram.com/${acc.handle || ''}/` };
}
async function publishFb(env, acc, post, media, t) {
  const page = acc.ext_id, tok = acc.token?.access;
  const message = capFor(post, t, 'fb', 60000);
  /* 2026-10-21: the composer's Shop link. With a picture or video the link rides inside the message (the composer appends it);
     with no media it becomes the post's link, so Facebook draws the product card. */
  const link = /^https?:\/\//i.test(t?.link || '') ? t.link : null;
  let id, postId;
  if (!media.length) {
    const r = await graph(env, `${page}/feed`, link ? { message, link } : { message }, { method: 'POST', token: tok });
    id = r.id; postId = r.id;
  } else if (media.length === 1 && isVideo(media[0])) {
    const r = await graph(env, `${page}/videos`, { file_url: media[0].public, description: message }, { method: 'POST', token: tok });
    id = r.id; postId = r.id;
  } else if (media.length === 1) {
    const r = await graph(env, `${page}/photos`, { url: media[0].public, message }, { method: 'POST', token: tok });
    id = r.id; postId = r.post_id || `${page}_${r.id}`;
  } else {
    const ids = [];
    for (const m of media.filter(m => !isVideo(m)).slice(0, 10)) { const r = await graph(env, `${page}/photos`, { url: m.public, published: false }, { method: 'POST', token: tok }); ids.push({ media_fbid: r.id }); }
    const r = await graph(env, `${page}/feed`, { message, attached_media: ids }, { method: 'POST', token: tok });
    id = r.id; postId = r.id;
  }
  const info = await graph(env, postId, { fields: 'permalink_url' }, { token: tok }).catch(() => ({}));
  return { id: postId, url: info.permalink_url || `https://www.facebook.com/${postId}` };
}
async function ttUpload(env, acc, bytes, { direct, title, privacy }) {
  const size = bytes.byteLength;
  const chunk = size <= 64 * 1024 * 1024 ? size : 50 * 1024 * 1024;
  const count = Math.max(1, Math.floor(size / chunk));
  const src = { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunk, total_chunk_count: count };
  const init = direct
    ? await ttCall(env, acc, '/post/publish/video/init/', { post_info: { title: clip(title, 2200), privacy_level: privacy || 'PUBLIC_TO_EVERYONE', disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000 }, source_info: src })
    : await ttCall(env, acc, '/post/publish/inbox/video/init/', { source_info: src });
  let sent = 0;
  for (let i = 0; i < count; i++) {
    const start = i * chunk, end = i === count - 1 ? size : Math.min(size, start + chunk);
    const r = await F(init.upload_url, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start), 'Content-Range': `bytes ${start}-${end - 1}/${size}` }, body: bytes.slice(start, end) });
    if (!r.ok && r.status !== 206) throw new Error(`TikTok upload failed (HTTP ${r.status}).`);
    sent = end;
  }
  if (sent !== size) throw new Error('TikTok upload stopped early.');
  return init.publish_id;
}
async function publishTt(env, acc, post, media, t) {
  const live = acc.mode === 'live';
  const title = clip(t.tt?.title || t.tt?.caption || post.caption, 2200);
  const vids = media.filter(isVideo);
  let publishId;
  if (vids.length) publishId = await ttUpload(env, acc, await stagedBytes(env, vids[0]), { direct: live, title, privacy: t.tt?.privacy });
  else {
    /* Photo posts pull from our public URL (TikTok must have the domain verified on the app; its error says so). */
    const photos = media.filter(m => !isVideo(m)).map(m => m.public).slice(0, 35);
    const r = await ttCall(env, acc, '/post/publish/content/init/', { post_info: { title: clip(t.tt?.title || '', 90), description: title, privacy_level: t.tt?.privacy || 'PUBLIC_TO_EVERYONE' }, source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: photos }, post_mode: live ? 'DIRECT_POST' : 'MEDIA_UPLOAD', media_type: 'PHOTO' });
    publishId = r.publish_id;
  }
  let st = {};
  for (let i = 0; i < 24; i++) {
    st = await ttCall(env, acc, '/post/publish/status/fetch/', { publish_id: publishId }).catch(() => ({}));
    if (['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX', 'FAILED'].includes(st.status)) break;
    await sleep(5000);
  }
  if (st.status === 'FAILED') throw new Error(`TikTok did not post it: ${st.fail_reason || 'unknown reason'}`);
  const vid = (st.publicaly_available_post_id || st.publicly_available_post_id || [])[0];
  return { id: vid || publishId, url: vid ? `https://www.tiktok.com/@${acc.handle || ''}/video/${vid}` : `https://www.tiktok.com/@${acc.handle || ''}`, draft: !live || st.status === 'SEND_TO_USER_INBOX', note: live ? null : 'In your TikTok inbox as a draft: open TikTok, finish it, post.' };
}
async function publishYt(env, acc, post, media, t) {
  const vid = media.find(isVideo);
  if (!vid) throw plain('YouTube needs a video.');
  const tok = await ytAccess(env, acc);
  const live = acc.mode === 'live';
  const visibility = live ? (t.yt?.visibility || 'public') : 'private';
  const title = clip(t.yt?.title || post.caption.split('\n')[0], 100) || 'New video';
  const body = { snippet: { title, description: clip(t.yt?.caption ?? post.caption, 5000), categoryId: '17' }, status: { privacyStatus: visibility, selfDeclaredMadeForKids: false } };
  const bytes = await stagedBytes(env, vid);
  const init = await F('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/*', 'X-Upload-Content-Length': String(bytes.byteLength) }, body: JSON.stringify(body) });
  if (!init.ok) { const j = await init.json().catch(() => ({})); throw new Error(`YouTube: ${j.error?.message || `HTTP ${init.status}`}`); }
  const loc = init.headers.get('location');
  if (!loc) throw new Error('YouTube gave no upload address.');
  const up = await F(loc, { method: 'PUT', headers: { 'Content-Type': 'video/*', 'Content-Length': String(bytes.byteLength) }, body: bytes });
  const j = await up.json().catch(() => ({}));
  if (!up.ok || !j.id) throw new Error(`YouTube: ${j.error?.message || `upload HTTP ${up.status}`}`);
  return { id: j.id, url: `https://www.youtube.com/watch?v=${j.id}`, draft: visibility === 'private', note: visibility === 'private' ? 'On YouTube as private: open YouTube Studio to make it public.' : null };
}
const PUBLISH = { ig: publishIg, fb: publishFb, tt: publishTt, yt: publishYt };

/* ---------------- the Slack fallback ---------------- */
async function slackUserOf(env, d, email) {
  if (!email || !d.slackApi) return null;
  const u = await d.slackApi(env, 'users.lookupByEmail', { email }).catch(() => null);
  return u?.ok && u.user?.id && !u.user.is_bot ? u.user.id : null;
}
export async function notifyHandoff(env, d, post, plat, media, t, why) {
  const b = await env.DB.prepare(`SELECT name, slack_channel FROM brand_accounts WHERE act_id = ?1`).bind(post.act_id).first().catch(() => null);
  const to = (await slackUserOf(env, d, post.created_by)) || b?.slack_channel;
  if (!to) return { handoff: true, error: 'Nobody to tell: no Slack channel for the brand.' };
  const sl = s => String(s || '').replace(/[\u2014\u2013]/g, ', ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cap = capFor(post, t, plat, 2200);
  const files = media.map((m, i) => `<${m.public || m.url}|${isVideo(m) ? 'video' : 'picture'} ${i + 1}>`).join(', ');
  const text = `Time to post on ${PLATS[plat]} for ${sl(b?.name || 'the brand')} (${why}).`;
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${text}*\nFile: ${files}\n\n${sl(cap) || '_(no caption)_'}${plat === 'ig' && t.ig?.first_comment ? `\n\n_First comment:_ ${sl(t.ig.first_comment)}` : ''}${plat === 'yt' && t.yt?.title ? `\n\n_Title:_ ${sl(t.yt.title)}` : ''}` } },
    { type: 'actions', elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Posted it' }, style: 'primary', action_id: 'soc_done', value: JSON.stringify({ id: post.id, plat }) },
      { type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?act=${encodeURIComponent(post.act_id)}&open=socialweek&post=${post.id}` } ] },
  ];
  const r = await d.slackPost(env, to, text, blocks, { username: 'Locus' }).catch(e => ({ error: e.message }));
  return r.error ? { handoff: true, error: `Slack: ${r.error}` } : { handoff: true, notified_at: nowIso(), slack: { channel: r.channel, ts: r.ts } };
}
/** The "Posted it" button (slack-router sends soc_* here). */
export async function handleSocialButton(env, ctx, payload, d, { ACK, xfetch }) {
  const a = (payload.actions || []).find(x => x.action_id === 'soc_done');
  if (!a) return ACK();
  const v = safe(a.value, {});
  ctx.waitUntil((async () => {
    await ensureSocialPost(env);
    const r = await markByHand(env, v.id, v.plat, null, payload.user?.name || payload.user?.username || 'Slack');
    if (payload.response_url) await xfetch(payload.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replace_original: true, text: r.error ? `Not marked: ${r.error}` : `✓ Marked as posted on ${PLATS[v.plat] || v.plat}. Locus will not ask again.` }) }).catch(() => {});
  })());
  return ACK();
}
async function markByHand(env, id, plat, url, who) {
  const p = await env.DB.prepare(`SELECT * FROM social_post_out WHERE id = ?1`).bind(String(id || '')).first();
  if (!p || !PLATS[plat]) return { error: 'That post is gone.' };
  const res = safe(p.results_json, {});
  res[plat] = { ...(res[plat] || {}), handoff: false, by_hand: true, posted_at: nowIso(), by: who, url: url || res[plat]?.url || null, error: null };
  await env.DB.prepare(`UPDATE social_post_out SET results_json = ?2, status = ?3, posted_at = COALESCE(posted_at, ?4), updated_at = datetime('now') WHERE id = ?1`).bind(p.id, JSON.stringify(res), statusOf(safe(p.targets_json, {}), res), nowIso()).run();
  return { ok: true };
}

/* ---------------- the scheduler ---------------- */
export function statusOf(targets, results) {
  const on = Object.keys(targets).filter(k => targets[k] && targets[k].on);
  if (!on.length) return 'failed';
  const st = on.map(k => { const r = results[k] || {}; return r.posted_at ? 'done' : r.handoff ? 'handoff' : r.error ? 'error' : 'pending'; });
  if (st.every(s => s === 'done')) return 'posted';
  if (st.some(s => s === 'handoff')) return 'handoff';
  if (st.every(s => s === 'error')) return 'failed';
  if (st.some(s => s === 'done')) return 'partly';
  return st.every(s => s === 'pending') ? 'posting' : 'failed';
}
export async function publishPost(env, d, post) {
  const targets = safe(post.targets_json, {}), results = safe(post.results_json, {});
  const accs = await accountsOf(env, post.act_id);
  let media;
  try { media = await stageMedia(env, post); }
  catch (e) {
    await env.DB.prepare(`UPDATE social_post_out SET status = 'failed', error = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(post.id, clip(e.message, 300)).run();
    return { id: post.id, status: 'failed', error: e.message };
  }
  for (const plat of Object.keys(PLATS)) {
    const t = targets[plat];
    if (!t || !t.on || results[plat]?.posted_at) continue;
    const acc = accs[plat];
    const needVideo = plat === 'yt' || (plat === 'tt' && !media.some(m => !isVideo(m)));
    const why = !acc ? 'not connected' : acc.mode === 'notify' ? 'set to notify' : acc.status === 'error' ? `the connection needs attention: ${acc.error}` : needVideo && !media.some(isVideo) ? 'needs a video' : null;
    if (why) { results[plat] = await notifyHandoff(env, d, post, plat, media, targets, why); continue; }
    try {
      const r = await PUBLISH[plat](env, acc, post, media, targets);
      results[plat] = { ...r, posted_at: nowIso(), error: null, handoff: false };
    } catch (e) {
      const msg = clip(e.message, 300);
      const auth = /OAuthException|token|permission|scope|unauthori|401|403|access_token_invalid|needs connecting/i.test(msg);
      if (auth) await accountError(env, post.act_id, plat, msg).catch(() => {});
      results[plat] = auth ? await notifyHandoff(env, d, post, plat, media, targets, `${PLATS[plat]} refused our login: ${msg}`) : { error: msg, handoff: false };
    }
    await env.DB.prepare(`UPDATE social_post_out SET results_json = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(post.id, JSON.stringify(results)).run();
  }
  const status = statusOf(targets, results);
  const posted = Object.values(results).some(r => r && r.posted_at);
  await env.DB.prepare(`UPDATE social_post_out SET status = ?2, results_json = ?3, posted_at = CASE WHEN ?4 = 1 THEN COALESCE(posted_at, ?5) ELSE posted_at END, error = NULL, updated_at = datetime('now') WHERE id = ?1`)
    .bind(post.id, status, JSON.stringify(results), posted ? 1 : 0, nowIso()).run();
  return { id: post.id, status, results };
}
/** Every post whose time has come (a minute early is fine), claimed one by one. */
export async function socialPostTick(env, d, { now = Date.now(), limit = 6 } = {}) {
  await ensureSocialPost(env);
  const out = { posted: [], stuck: 0 };
  /* A post stuck in 'posting' half an hour: say so, never retry on its own (it may be half posted). */
  const stuck = await env.DB.prepare(`UPDATE social_post_out SET status = 'failed', error = 'Posting stopped half way (the worker restarted). Check each platform, then Try again.', updated_at = datetime('now') WHERE status = 'posting' AND posting_at < ?1`).bind(new Date(now - 30 * 60e3).toISOString()).run();
  out.stuck = stuck.meta?.changes || 0;
  const due = (await env.DB.prepare(`SELECT * FROM social_post_out WHERE status = 'scheduled' AND at <= ?1 ORDER BY at LIMIT ${limit}`).bind(new Date(now + 60e3).toISOString()).all()).results || [];
  for (const p of due) {
    if (d.subCanAfford && !d.subCanAfford(60)) { out.deferred = 'subrequest budget'; break; }
    const claim = await env.DB.prepare(`UPDATE social_post_out SET status = 'posting', posting_at = ?2, updated_at = datetime('now') WHERE id = ?1 AND status = 'scheduled'`).bind(p.id, new Date(now).toISOString()).run();
    if (!claim.meta?.changes) continue;
    out.posted.push(await publishPost(env, d, p).catch(e => ({ id: p.id, error: e.message })));
  }
  return out;
}

/* ---------------- results, once a day per post ---------------- */
async function pullResults(env, post, accs) {
  const results = safe(post.results_json, {});
  for (const plat of Object.keys(results)) {
    const r = results[plat], acc = accs[plat];
    if (!r || !r.posted_at || !r.id || r.by_hand || !acc) continue;
    try {
      if (plat === 'ig') {
        const tok = acc.token?.use_env ? env.META_TOKEN : acc.token?.access;
        const j = await graph(env, r.id, { fields: 'like_count,comments_count' }, { token: tok });
        const ins = await graph(env, `${r.id}/insights`, { metric: 'views' }, { token: tok }).catch(() => ({}));
        r.likes = j.like_count ?? r.likes; r.comments = j.comments_count ?? r.comments;
        const v = (ins.data || []).find(x => x.name === 'views')?.values?.[0]?.value; if (v != null) r.views = v;
      } else if (plat === 'fb') {
        const j = await graph(env, r.id, { fields: 'likes.summary(true),comments.summary(true),shares' }, { token: acc.token?.access });
        r.likes = j.likes?.summary?.total_count ?? r.likes; r.comments = j.comments?.summary?.total_count ?? r.comments; r.shares = j.shares?.count ?? r.shares;
        const ins = await graph(env, `${r.id}/insights`, { metric: 'post_impressions_unique' }, { token: acc.token?.access }).catch(() => ({}));
        const v = ins.data?.[0]?.values?.[0]?.value; if (v != null) r.views = v;
      } else if (plat === 'yt') {
        const tok = await ytAccess(env, acc);
        const j = await F(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(r.id)}`, { headers: { Authorization: `Bearer ${tok}` } }).then(x => x.json());
        const s = j.items?.[0]?.statistics; if (s) { r.views = +s.viewCount || 0; r.likes = +s.likeCount || 0; r.comments = +s.commentCount || 0; }
      } else if (plat === 'tt' && !r.draft) {
        const j = await ttCall(env, acc, '/video/query/?fields=id,view_count,like_count,comment_count,share_count', { filters: { video_ids: [r.id] } });
        const v = j.videos?.[0]; if (v) { r.views = v.view_count; r.likes = v.like_count; r.comments = v.comment_count; r.shares = v.share_count; }
      }
      r.pulled_at = nowIso();
    } catch (e) { r.pull_error = clip(e.message, 200); }
  }
  await env.DB.prepare(`UPDATE social_post_out SET results_json = ?2, pulled_at = ?3 WHERE id = ?1`).bind(post.id, JSON.stringify(results), nowIso()).run();
}
/** Posts others tagged the brand's Instagram in: into the tray with the creator's handle on the card. */
async function pullTagged(env, act, acc) {
  const tok = acc.token?.use_env ? env.META_TOKEN : acc.token?.access;
  const j = await graph(env, `${acc.ext_id}/tags`, { fields: 'id,media_type,media_url,thumbnail_url,permalink,caption,username,timestamp', limit: 25 }, { token: tok });
  let added = 0;
  for (const it of j.data || []) {
    if (!it.media_url) continue;
    const id = `tag_${it.id}`;
    const had = await env.DB.prepare(`SELECT 1 FROM social_media WHERE id = ?1`).bind(id).first();
    if (had) continue;
    await env.DB.prepare(`INSERT INTO social_media (id, act_id, kind, key, type, name, who, source, url) VALUES (?1, ?2, ?3, '', NULL, ?4, ?5, 'tagged', ?6)`)
      .bind(id, act, it.media_type === 'VIDEO' ? 'video' : 'image', clip(it.caption, 200) || 'Tagged post', it.username ? `@${it.username}` : null, JSON.stringify({ src: it.media_url, thumb: it.thumbnail_url || it.media_url, link: it.permalink, at: it.timestamp })).run();
    added++;
  }
  return added;
}
export async function socialResultsTick(env, d, { now = Date.now() } = {}) {
  await ensureSocialPost(env);
  const rows = (await env.DB.prepare(`SELECT * FROM social_post_out WHERE status IN ('posted', 'partly', 'handoff') AND posted_at >= ?1 AND (pulled_at IS NULL OR pulled_at < ?2) ORDER BY COALESCE(pulled_at, '') LIMIT 15`)
    .bind(new Date(now - 30 * DAY).toISOString(), new Date(now - 20 * 3600e3).toISOString()).all()).results || [];
  const byAct = new Map();
  let pulled = 0;
  for (const p of rows) {
    if (d.subCanAfford && !d.subCanAfford(20)) break;
    if (!byAct.has(p.act_id)) byAct.set(p.act_id, await accountsOf(env, p.act_id));
    await pullResults(env, p, byAct.get(p.act_id)).catch(() => {});
    pulled++;
  }
  /* Tagged-in, once a day per brand with an Instagram account. */
  const tagged = {};
  const last = safe((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'socTaggedAt'`).first().catch(() => null))?.value, {});
  const igs = (await env.DB.prepare(`SELECT * FROM social_account WHERE plat = 'ig' AND status = 'ok'`).all()).results || [];
  for (const a of igs) {
    if (last[a.act_id] && now - Date.parse(last[a.act_id]) < 20 * 3600e3) continue;
    if (d.subCanAfford && !d.subCanAfford(10)) break;
    tagged[a.act_id] = await pullTagged(env, a.act_id, { ...a, token: safe(a.token_json, {}) }).catch(e => ({ error: e.message }));
    last[a.act_id] = new Date(now).toISOString();
  }
  if (Object.keys(tagged).length) await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('socTaggedAt', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify(last)).run().catch(() => {});
  return { pulled, tagged };
}

/* ---------------- the tray ---------------- */
async function profitGet(env, d, path) {
  if (!env.PROFIT || !d.mintSession) return null;
  const { token } = await d.mintSession(env, env.OWNER_EMAIL || 'cole@go-mobius-digital.com');
  const r = await env.PROFIT.fetch(new Request(PROFIT_ORIGIN + path, { headers: { Authorization: `Bearer ${token}` } }));
  return r.ok ? r.json().catch(() => null) : null;
}
export async function trayOf(env, d, act) {
  const items = [];
  const used = new Set();
  for (const r of (await env.DB.prepare(`SELECT media_json FROM social_post_out WHERE act_id = ?1`).bind(act).all()).results || []) for (const m of safe(r.media_json, [])) if (m.ref) used.add(m.ref);
  /* Studio: approved ads with a final. */
  const st = await profitGet(env, d, `/api/studio?act=${encodeURIComponent(act)}`).catch(() => null);
  for (const a of (st?.ads || []).filter(a => a.status === 'approved' && a.has_final).slice(0, 60)) {
    const sp = a.spec || {};
    items.push({ ref: `studio:${a.id}`, src: 'studio', kind: 'image', title: sp.headline || a.name || 'Studio ad', sub: sp.product || sp.who || '', thumb: `${PROFIT_ORIGIN}/api/studio/img/${a.id}/final?v=${a.v || 1}`, file: `${PROFIT_ORIGIN}/api/studio/img/${a.id}/final`, caption: [sp.headline, sp.subline].filter(Boolean).join('\n'), at: a.updated_at || a.created_at });
  }
  /* Creator link clips (shown on the live link, so public). */
  const amb = await profitGet(env, d, `/api/amb?act=${encodeURIComponent(act)}`).catch(() => null);
  for (const p of (amb?.proof || []).filter(p => p.kind === 'upload' && p.file_key && p.shown).slice(0, 60))
    items.push({ ref: `clip:${p.id}`, src: 'creator', kind: /\.(jpe?g|png|webp)$/i.test(p.file_key) ? 'image' : 'video', title: p.note || 'Creator clip', sub: p.who || '', thumb: `${PROFIT_ORIGIN}/api/angles-thumb/${p.id}`, file: `${PROFIT_ORIGIN}/api/angles-file/${p.id}`, caption: p.note || '', at: p.created_at });
  /* Winning Meta ads: top spend in 30 days with a cover (pictures; a video ad's file is not ours to pull). */
  const since = new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  const ads = (await env.DB.prepare(`SELECT x.ad_id, x.name, SUM(m.spend) spend, SUM(m.revenue) revenue, SUM(m.purchases) purchases FROM ad_daily m JOIN ads x ON x.ad_id = m.ad_id AND x.act_id = m.act_id
    WHERE m.act_id IN ${metaOf(1)} AND m.date >= ?2 GROUP BY x.ad_id HAVING SUM(m.spend) > 0 ORDER BY spend DESC LIMIT 12`).bind(act, since).all().catch(() => ({ results: [] }))).results || [];
  for (const a of ads) {
    const cov = await coverUrl(env, a.ad_id).catch(() => null);
    if (!cov) continue;
    const roas = a.spend > 0 ? a.revenue / a.spend : null;
    items.push({ ref: `ad:${a.ad_id}`, src: 'ad', kind: 'image', title: a.name || 'Meta ad', sub: `$${Math.round(a.spend).toLocaleString('en-US')} spent${roas ? `, ${roas.toFixed(1)}x` : ''}`, thumb: cov, file: cov, caption: '', at: null });
  }
  /* Make ours: drafts the ideas bot wrote for this brand (a script, no file: the composer starts from its words). */
  /* An idea sent out the Organic post door (make.js) is "picked": it goes first. A film uploaded for it (social_media.idea_id,
     the Film task closes on that upload) makes the item postable: the clip rides on the idea's own card. */
  const ideas = (await env.DB.prepare(`SELECT id, pushed_json FROM idea_thread WHERE act_id = ?1 AND draft_json IS NOT NULL AND status != 'discarded' ORDER BY updated_at DESC LIMIT 20`).bind(act).all().catch(() => ({ results: [] }))).results || [];
  await ensureMakeCols(env);
  const films = new Map();
  for (const f of (await env.DB.prepare(`SELECT * FROM social_media WHERE act_id = ?1 AND idea_id IS NOT NULL ORDER BY created_at DESC`).bind(act).all().catch(() => ({ results: [] }))).results || []) if (!films.has(f.idea_id)) films.set(f.idea_id, f);
  const picked = [];
  for (const i of ideas) {
    const s = await ideaState(env, i.id).catch(() => null);
    const sc = s?.script; if (!sc) continue;
    const organic = !!(safe(i.pushed_json, {}) || {}).organic;
    const film = films.get(i.id);
    const it = { ref: `idea:${i.id}`, src: 'make', kind: film ? film.kind : 'text', title: sc.title || 'Our version', sub: s.take || '', thumb: film ? `${SELF}/social-m/${film.key}` : null, file: null, key: film ? film.key : null,
      caption: [sc.openers?.[0], sc.on_screen].filter(Boolean).join('\n'), link: s.link, at: s.updated_at, organic, idea: i.id };
    (organic ? picked : items).push(it);
  }
  items.unshift(...picked);
  /* Uploads and tagged-in posts. */
  for (const m of (await env.DB.prepare(`SELECT * FROM social_media WHERE act_id = ?1 ORDER BY created_at DESC LIMIT 80`).bind(act).all()).results || []) {
    if (m.idea_id && films.get(m.idea_id)?.id === m.id) continue;   // shown on its idea's card above
    const u = m.source === 'tagged' ? safe(m.url, {}) : null;
    items.push({ ref: `media:${m.id}`, src: m.source === 'tagged' ? 'tagged' : 'upload', kind: m.kind, title: m.name || (m.kind === 'video' ? 'Video' : 'Picture'), sub: m.who || '', who: m.who || null,
      thumb: u ? u.thumb : `${SELF}/social-m/${m.key}`, file: u ? u.src : null, key: u ? null : m.key, link: u ? u.link : null, caption: m.source === 'tagged' ? '' : '', at: m.created_at });
  }
  for (const it of items) it.used = used.has(it.ref);
  return items;
}

/* ---------------- a caption rephrased in the brand's voice ---------------- */
async function rephrase(env, act, text, note) {
  if (!env.ANTHROPIC_API_KEY) throw plain('No Claude key on the server.');
  const g = await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'voice_guide'`).bind(act).first().catch(() => null);
  const guide = clip(safe(g?.data_json, {})?.md || '', 12000);
  const b = await env.DB.prepare(`SELECT name FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
  const r = await F('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: HAIKU, max_tokens: 1200,
      system: `You write social captions for ${b?.name || 'the brand'}. Give three different captions, each the whole caption as it would be posted (short, plain, one idea each, hashtags only if they earn their place, no em dashes, no emoji unless the guide uses them). Answer as JSON: {"captions":["...","...","..."]} and nothing else.${guide ? `\n\nHow this brand writes:\n${guide}` : ''}` ,
      messages: [{ role: 'user', content: `Rewrite this caption${note ? ` (${clip(note, 300)})` : ''}:\n\n${clip(text, 2200) || '(nothing yet: write from the brand, about the post)'}` }] }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `Claude HTTP ${r.status}`);
  const txt = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('');
  /* Haiku sometimes wraps the JSON in prose or breaks it; never hand raw JSON to a caption box. */
  const a = txt.indexOf('{'), z = txt.lastIndexOf('}');
  let out = a >= 0 && z > a ? safe(txt.slice(a, z + 1), {})?.captions : null;
  if (!Array.isArray(out)) { const m = [...txt.matchAll(/"((?:[^"\\]|\\.){8,})"/g)].map(x => x[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')); out = m.length ? m : [txt.replace(/^[^A-Za-z]*/, '').split('\n')[0]]; }
  return out.map(c => clip(String(c), 2200)).filter(Boolean).slice(0, 3);
}

/* ---------------- the week, the target, Fill the week, Results, the Monday nudge (2026-10-20) ---------------- */
const PLANNED = new Set(['scheduled', 'posting', 'posted', 'partly', 'handoff']);
const sget = async (env, k) => (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null))?.value ?? null;
const sput = (env, k, v) => env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, v).run();
let makeCols = false;
async function ensureMakeCols(env) {
  if (makeCols) return; makeCols = true;
  await env.DB.prepare(`ALTER TABLE social_media ADD COLUMN idea_id TEXT`).run().catch(() => {});
}
async function brandOf(env, act) {
  const b = await env.DB.prepare(`SELECT name, tz, slack_channel FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
  return { name: b?.name || null, tz: b?.tz || 'America/Chicago', slack_channel: b?.slack_channel || null };
}
/** The brand's weekly target (Brand settings > Social), default 5. */
export async function targetOf(env, act) { const v = await sget(env, `socialTarget:${act}`); return v == null || v === '' ? 5 : Math.max(0, Math.min(21, Math.round(+v) || 0)); }
/** Seven brand-local days from `from` and the posts on them (a post at 11pm Central on Sunday belongs to Sunday: a wide
 *  UTC window filtered by the local day). */
async function weekPosts(env, act, from, tz) {
  const lo = new Date(from + 'T00:00:00Z'); lo.setUTCDate(lo.getUTCDate() - 1);
  const hi = new Date(from + 'T00:00:00Z'); hi.setUTCDate(hi.getUTCDate() + 8);
  const rows = (await env.DB.prepare(`SELECT * FROM social_post_out WHERE act_id = ?1 AND at >= ?2 AND at < ?3 ORDER BY at`).bind(act, lo.toISOString(), hi.toISOString()).all()).results || [];
  const dayOf = iso => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
  const days = []; for (let i = 0; i < 7; i++) { const dd = new Date(from + 'T00:00:00Z'); dd.setUTCDate(dd.getUTCDate() + i); days.push(dd.toISOString().slice(0, 10)); }
  const posts = rows.map(p => ({ ...pubPost(p), day: dayOf(p.at), hm: new Date(p.at).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) })).filter(p => days.includes(p.day));
  return { days, posts };
}
const mondayOf = ymd => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
/** A brand-local day and hour as an instant (two passes through Intl, so a DST change lands on the right side). */
export function zonedAt(day, hour, tz, minute = 0) {
  const guess = Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10), hour, minute);
  const off = t => { const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t)); const g = k => +(p.find(x => x.type === k) || {}).value; return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - t; };
  let t = guess - off(guess); t = guess - off(t);
  return new Date(t).toISOString();
}
/** Up to the target, unused tray items in the mix (2 statics, 1 creator clip, 1 winning ad, 1 make clip; a static when a
 *  kind runs out), one per free day at a sensible hour, each captioned in the brand's voice. Nothing is saved here. */
export async function fillWeek(env, d, act, week) {
  const b = await brandOf(env, act);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: b.tz });
  const from = /^\d{4}-\d{2}-\d{2}$/.test(week || '') ? mondayOf(week) : mondayOf(today);
  const w = await weekPosts(env, act, from, b.tz);
  const target = await targetOf(env, act);
  const planned = w.posts.filter(p => PLANNED.has(p.status));
  const need = Math.max(0, target - planned.length);
  const accs = await accountsOf(env, act);
  const connected = Object.keys(PLATS).filter(k => accs[k]);
  const out = { act, from, days: w.days, tz: b.tz, target, planned: planned.length, need, proposals: [], note: '' };
  if (!need) { out.note = 'The week is already at its target.'; return out; }
  if (!connected.length) { out.note = 'Connect an account in Brand settings > Social first; until then nothing can be scheduled.'; return out; }
  const tray = await trayOf(env, d, act);
  const pool = tray.filter(i => !i.used && i.kind !== 'text' && (i.file || i.key));
  const bucket = { static: pool.filter(i => i.kind === 'image' && (i.src === 'studio' || i.src === 'upload')), creator: pool.filter(i => i.src === 'creator'), ad: pool.filter(i => i.src === 'ad'), make: pool.filter(i => i.src === 'make') };
  const order = ['static', 'static', 'creator', 'ad', 'make', 'static', 'creator', 'static', 'ad', 'static', 'creator', 'static', 'ad', 'static', 'creator', 'static', 'ad', 'static', 'creator', 'static', 'ad'];
  const fallback = { static: ['static', 'creator', 'ad', 'make'], creator: ['creator', 'static', 'ad', 'make'], ad: ['ad', 'static', 'creator', 'make'], make: ['make', 'static', 'creator', 'ad'] };
  const picks = [];
  for (let i = 0; picks.length < need && i < order.length; i++) {
    const want = order[i];
    const from2 = fallback[want].find(k => bucket[k].length);
    if (!from2) break;
    /* Variety: five Black Wedges ads in a row is not a week. Prefer an item whose product or title is not already picked. */
    const key = it => (it.sub || it.title || '').toLowerCase().replace(/\s*-\s*\d+$/, '');
    const seen = new Set(picks.map(p => key(p.it)));
    const at = bucket[from2].findIndex(it => !seen.has(key(it)));
    picks.push({ it: bucket[from2].splice(at < 0 ? 0 : at, 1)[0], want: from2 });
  }
  if (!picks.length) { out.note = 'Nothing unused is on the tray. Approve a Studio final, add a creator clip or upload a file, then fill again.'; return out; }
  /* Days: free days first (today only if hours are left), then the days with the fewest posts. Hours rotate through the
     times people are on their phones; today never gets an hour that has passed. */
  const nowH = +new Date().toLocaleTimeString('en-GB', { timeZone: b.tz, hour: '2-digit', minute: '2-digit' }).slice(0, 2);
  const count = Object.fromEntries(w.days.map(day => [day, planned.filter(p => p.day === day).length]));
  const open = w.days.filter(day => day > today || (day === today && nowH < 20));
  const HRS = [11, 9, 17, 13, 15, 19, 10];
  const slots = [];
  for (let i = 0; i < picks.length; i++) {
    const free = open.filter(day => !count[day]);
    const day = free[0] || open.slice().sort((x, y) => count[x] - count[y])[0];
    if (!day) break;
    let hour = HRS[i % HRS.length];
    if (day === today && hour <= nowH) hour = Math.min(21, nowH + 1 + (count[day] || 0));
    while (slots.some(s => s.day === day && s.hour === hour)) hour = hour >= 21 ? 7 : hour + 1;
    count[day] = (count[day] || 0) + 1;
    slots.push({ day, hour });
  }
  for (let i = 0; i < slots.length; i++) {
    const { it } = picks[i], { day, hour } = slots[i];
    const at = zonedAt(day, hour, b.tz);
    let caption = '';
    try { caption = (await rephrase(env, act, it.caption || it.title || '', `a ${it.kind === 'video' ? 'video' : 'picture'} for ${b.name || 'the brand'}: ${it.title || ''}${it.sub ? `, ${it.sub}` : ''}`))[0] || ''; }
    catch { caption = it.caption || ''; }
    const targets = Object.fromEntries(connected.map(k => [k, { on: k === 'yt' ? it.kind === 'video' : true }]));
    out.proposals.push({ item: { ref: it.ref, src: it.src, kind: it.kind, title: it.title, sub: it.sub || '', thumb: it.thumb, file: it.file || null, key: it.key || null, who: it.who || null, idea: it.idea || null }, at, day, hm: `${String(hour).padStart(2, '0')}:00`, caption, targets });
  }
  out.left = { static: bucket.static.length, creator: bucket.creator.length, ad: bucket.ad.length, make: bucket.make.length };
  if (out.proposals.length < need) out.note = `Only ${out.proposals.length} of the ${need} missing could be filled: the tray has nothing else unused.`;
  return out;
}
/** Our posted cards from the last 30 days ranked by views, and what the watched brands usually get per platform (the
 *  median of the Watch feed's posts in the same 30 days). */
export async function resultsOf(env, act) {
  const since = new Date(Date.now() - 30 * DAY).toISOString();
  const rows = (await env.DB.prepare(`SELECT * FROM social_post_out WHERE act_id = ?1 AND status IN ('posted', 'partly') AND at >= ?2 ORDER BY at DESC`).bind(act, since).all()).results || [];
  const ours = rows.map(r => {
    const p = pubPost(r), per = {}; let views = 0, likes = 0, comments = 0, any = false;
    for (const [plat, x] of Object.entries(p.results || {})) {
      if (!x || !x.posted_at || x.by_hand) continue;
      per[plat] = { views: x.views ?? null, likes: x.likes ?? null, comments: x.comments ?? null, url: x.url || null };
      if (x.views != null) { views += x.views; any = true; } likes += x.likes || 0; comments += x.comments || 0;
    }
    return { ...p, views: any ? views : null, likes, comments, per };
  }).sort((a, b2) => (b2.views || 0) - (a.views || 0));
  const seen = (await env.DB.prepare(`SELECT plat, views, likes FROM social_post WHERE act_id = ?1 AND posted_at >= ?2 AND follow_id IN (SELECT id FROM social_follow WHERE act_id = ?1 AND kind = 'brand')`).bind(act, since.slice(0, 10)).all().catch(() => ({ results: [] }))).results || [];
  const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m2 = Math.floor(s.length / 2); return s.length % 2 ? s[m2] : Math.round((s[m2 - 1] + s[m2]) / 2); };
  const usual = {};
  for (const plat of ['ig', 'tt', 'yt']) { const v = seen.filter(s => s.plat === plat && s.views != null).map(s => s.views); const l = seen.filter(s => s.plat === plat && s.likes != null).map(s => s.likes); usual[plat] = { views: median(v), likes: median(l), n: Math.max(v.length, l.length) }; }
  return { act, since, ours, usual };
}
/** Monday 8am brand local, to the brand's internal channel, only when planned < target (one Slack nudge, nothing else). */
export async function socialNudgeTick(env, d) {
  await ensureSocialPost(env);
  const brands = (await env.DB.prepare(`SELECT s.act_id, a.name, a.tz, a.slack_channel FROM social_brand s JOIN brand_accounts a ON a.act_id = s.act_id WHERE a.active = 1`).all().catch(() => ({ results: [] }))).results || [];
  const out = { checked: brands.length, posted: [], quiet: [] };
  const now = new Date();
  for (const b of brands) {
    const tz = b.tz || 'America/Chicago';
    if (new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now) !== 'Mon') continue;
    const hour = +new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(now) % 24;
    if (hour < 8 || hour > 11) continue;                     // 8am, with a few hours of slack for a missed tick
    const today = now.toLocaleDateString('en-CA', { timeZone: tz });
    const key = `socialNudge:${b.act_id}:${today}`;
    if (await sget(env, key)) continue;
    const target = await targetOf(env, b.act_id);
    if (!target || !b.slack_channel) continue;
    await sput(env, key, 'checked');                           // claimed before the read, so two ticks never post twice
    const w = await weekPosts(env, b.act_id, today, tz);
    const planned = w.posts.filter(p => PLANNED.has(p.status)).length;
    if (planned >= target) { out.quiet.push(b.act_id); continue; }
    const link = `${LOCUS}?open=socialweek&act=${encodeURIComponent(b.act_id)}&fill=1`;
    await d.slackPost(env, b.slack_channel, `${b.name} has ${planned} of ${target} posts planned this week. Fill the week: ${link}`);
    out.posted.push(b.act_id);
  }
  return out;
}
/** The ideas a post's media carries: a Make card (ref idea:<id>) or a film uploaded for one (social_media.idea_id). */
async function ideaIdsOf(env, media) {
  const ids = new Set();
  for (const mm of media || []) {
    if (/^idea:/.test(mm.ref || '')) ids.add(mm.ref.slice(5));
    else if (/^media:/.test(mm.ref || '')) { await ensureMakeCols(env); const r = await env.DB.prepare(`SELECT idea_id FROM social_media WHERE id = ?1`).bind(mm.ref.slice(6)).first().catch(() => null); if (r?.idea_id) ids.add(r.idea_id); }
  }
  return [...ids];
}
/** The open Film task of an idea (make.js exitOrganic, source_id = the idea id) is done once something is linked to it. */
async function closeFilmTask(env, ideaId, by) {
  const rows = (await env.DB.prepare(`SELECT id FROM p_action WHERE source_id = ?1 AND status = 'open'`).bind(ideaId).all().catch(() => ({ results: [] }))).results || [];
  for (const r of rows) await markDone(env, r.id, true, { by: by || 'Locus', how: 'social', quiet: true }).catch(() => {});
  return rows.length;
}

/* ---------------- shapes ---------------- */
const pubPost = p => ({ id: p.id, act: p.act_id, at: p.at, status: p.status, caption: p.caption, media: safe(p.media_json, []).map(m => ({ ref: m.ref, src: m.src, kind: m.kind, title: m.title, thumb: m.thumb, who: m.who || null, staged: !!m.staged, public: m.public || null })),
  targets: safe(p.targets_json, {}), results: safe(p.results_json, {}), auto: !!p.auto, created_by: p.created_by, posted_at: p.posted_at, error: p.error, pulled_at: p.pulled_at, updated_at: p.updated_at });
const VALID_T = { ig: ['on', 'caption', 'first_comment'], fb: ['on', 'caption', 'link'], tt: ['on', 'caption', 'title', 'privacy'], yt: ['on', 'caption', 'title', 'visibility'] };
function cleanTargets(t) {
  const out = {};
  for (const plat of Object.keys(PLATS)) {
    const x = t && t[plat]; if (!x || typeof x !== 'object') continue;
    const o = {}; for (const k of VALID_T[plat]) if (x[k] !== undefined && x[k] !== null && x[k] !== '') o[k] = k === 'on' ? !!x[k] : clip(x[k], 2200);
    if (o.visibility && !['public', 'unlisted', 'private'].includes(o.visibility)) delete o.visibility;
    if (o.privacy && !['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'FOLLOWER_OF_CREATOR', 'SELF_ONLY'].includes(o.privacy)) delete o.privacy;
    out[plat] = o;
  }
  return out;
}
/** The browser never sees url / key / staged (pubPost strips them), so an item of a post being edited is matched to the
 * stored one by its ref and keeps the stored file and staging. */
function cleanMedia(list, old = []) {
  return (Array.isArray(list) ? list : []).slice(0, 10).map(m => { const was = m && m.ref ? old.find(x => x && x.ref === m.ref) : null; return was ? { ...was, ...m, url: m.file || m.url || was.url, key: m.key || was.key, staged: was.staged, public: was.public, type: was.type } : m; }).map(m => ({ ref: clip(m.ref, 120) || null, src: clip(m.src, 20) || null, kind: m.kind === 'video' ? 'video' : 'image', title: clip(m.title, 160) || null, thumb: /^https?:\/\//.test(m.thumb || '') ? clip(m.thumb, 600) : null,
    url: /^https?:\/\//.test(m.file || m.url || '') ? clip(m.file || m.url, 600) : null, key: /^u\/[0-9a-f]{24}$/.test(m.key || '') ? m.key : null, who: clip(m.who, 80) || null, staged: /^u\/[0-9a-f]{24}$/.test(m.staged || '') ? m.staged : null, public: m.staged ? m.public : null, type: m.staged ? m.type || null : null })).filter(m => m.url || m.key);
}

/* ---------------- routes ---------------- */
/**
 * GET    /api/social/accounts?act=                      the four cards (connected, mode, error; never a token)
 * GET    /api/social/accounts/meta-pages                (team) the Pages the Mobius Tools token can see, with their Instagram
 * POST   /api/social/accounts/meta {act, page_id}      (team) connect Facebook + Instagram from a Page
 * POST   /api/social/connect/tiktok {act} | /youtube   (team) the OAuth link Cole opens; callbacks at /social/tiktok/callback, /social/google/callback
 * PUT    /api/social/accounts/mode {act, plat, mode}   (team) live | draft | notify
 * DELETE /api/social/accounts?act=&plat=               (team) forget the connection
 * GET    /api/social/week?act=&from=YYYY-MM-DD         7 days of posts from `from` (brand local days), accounts summary
 * GET    /api/social/tray?act=                         ready content: Studio finals, creator clips, winning ads, Make ours drafts, uploads, tagged-in
 * POST   /api/social/upload?act=&name=                 raw image/* or video/* body -> a tray item
 * POST   /api/social/post {act, id?, at, caption, media, targets, status: draft|scheduled, now?}
 * DELETE /api/social/post?id=
 * POST   /api/social/post/byhand {id, plat, url?}      the Notify fallback's tick, from Locus
 * POST   /api/social/post/retry {id}                   a failed post goes again now
 * GET    /api/social/captions?act=   POST {act, text}   DELETE ?id=
 * POST   /api/social/rephrase {act, text, note}        three captions in the brand's voice (Haiku, a fraction of a cent)
 */
export async function handleSocialPost(request, env, url, path, json, d) {
  const { isAdmin, sessionEmail } = d;
  if (path === '/social/tiktok/callback' && request.method === 'GET') {
    await ensureSocialPost(env);
    try { const r = await ttCallback(env, url); return new Response(`<p style="font:16px system-ui;padding:40px">TikTok is connected: ${String(r.name).replace(/</g, '&lt;')}. Close this tab and go back to Locus.</p>`, { headers: { 'Content-Type': 'text/html' } }); }
    catch (e) { return new Response(`<p style="font:16px system-ui;padding:40px">TikTok did not connect: ${String(e.message).replace(/</g, '&lt;')}</p>`, { status: 400, headers: { 'Content-Type': 'text/html' } }); }
  }
  if (path === '/social/google/callback' && request.method === 'GET') {
    await ensureSocialPost(env);
    try { const r = await ytCallback(env, url); return new Response(`<p style="font:16px system-ui;padding:40px">YouTube is connected: ${String(r.name).replace(/</g, '&lt;')}. Close this tab and go back to Locus.</p>`, { headers: { 'Content-Type': 'text/html' } }); }
    catch (e) { return new Response(`<p style="font:16px system-ui;padding:40px">YouTube did not connect: ${String(e.message).replace(/</g, '&lt;')}</p>`, { status: 400, headers: { 'Content-Type': 'text/html' } }); }
  }
  const mine = ['/api/social/accounts', '/api/social/connect/', '/api/social/week', '/api/social/grid', '/api/social/tray', '/api/social/upload', '/api/social/post', '/api/social/captions', '/api/social/rephrase', '/api/social/fill', '/api/social/target', '/api/social/results'];
  if (!mine.some(p => path === p || path.startsWith(p + '/') || (p.endsWith('/') && path.startsWith(p)))) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  await ensureSocialPost(env);
  const cs = clientScope(request);
  const email = cs ? cs.email : await sessionEmail(env, request).catch(() => null);
  const m = request.method;
  const ct = request.headers.get('Content-Type') || '';
  const body = m === 'GET' || m === 'DELETE' || path === '/api/social/upload' ? {} : await request.json().catch(() => ({}));
  const actOf = v => { const a = String(v || ''); if (!/^brand_[a-z0-9_]+$/.test(a)) throw plain('Pick a brand first.', 400); if (cs && !cs.ids.has(a)) throw plain('You do not have access to that brand.', 403); return a; };
  const postOf = async id => { const p = id ? await env.DB.prepare(`SELECT * FROM social_post_out WHERE id = ?1`).bind(String(id)).first() : null; return p && (!cs || cs.ids.has(p.act_id)) ? p : null; };
  const teamOnly = () => { if (cs) throw plain('Connecting accounts is done by the Mobius team.', 403); };
  try {
    if (path === '/api/social/accounts' && m === 'GET') {
      const act = actOf(url.searchParams.get('act'));
      const accs = await accountsOf(env, act);
      const keys = { meta: !!env.META_TOKEN, tiktok: !!(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET), google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) };
      return json({ accounts: Object.fromEntries(Object.keys(PLATS).map(p => [p, pubAccount(accs[p])])), keys: cs ? undefined : keys, callbacks: cs ? undefined : { tiktok: `${SELF}/social/tiktok/callback`, google: `${SELF}/social/google/callback` } });
    }
    if (path === '/api/social/accounts/meta-pages' && m === 'GET') { teamOnly(); const r = await metaPages(env); return json({ pages: r.pages.map(({ _tok, ...p }) => p), missing: r.missing }); }
    if (path === '/api/social/accounts/meta' && m === 'POST') { teamOnly(); return json({ ok: true, ...(await connectMeta(env, actOf(body.act), body.page_id, email)) }); }
    if (path === '/api/social/connect/tiktok' && m === 'POST') { teamOnly(); return json(await ttStart(env, actOf(body.act), email)); }
    if (path === '/api/social/connect/youtube' && m === 'POST') { teamOnly(); return json(await ytStart(env, actOf(body.act), email)); }
    if (path === '/api/social/accounts/mode' && m === 'PUT') {
      teamOnly(); const act = actOf(body.act);
      if (!PLATS[body.plat] || !['live', 'draft', 'notify'].includes(body.mode)) return json({ error: 'plat and mode (live, draft, notify)' }, 400);
      const had = await env.DB.prepare(`SELECT 1 FROM social_account WHERE act_id = ?1 AND plat = ?2`).bind(act, body.plat).first();
      if (!had && body.mode !== 'notify') return json({ error: 'Connect the account first.' }, 400);
      if (!had) await putAccount(env, act, body.plat, { name: `${PLATS[body.plat]} (by hand)`, mode: 'notify', token: {} }, email);
      else await env.DB.prepare(`UPDATE social_account SET mode = ?3, updated_at = datetime('now') WHERE act_id = ?1 AND plat = ?2`).bind(act, body.plat, body.mode).run();
      return json({ ok: true, mode: body.mode });
    }
    if (path === '/api/social/accounts' && m === 'DELETE') {
      teamOnly(); const act = actOf(url.searchParams.get('act')), plat = url.searchParams.get('plat');
      if (!PLATS[plat]) return json({ error: 'plat' }, 400);
      await env.DB.prepare(`DELETE FROM social_account WHERE act_id = ?1 AND plat = ?2`).bind(act, plat).run();
      return json({ ok: true });
    }
    /* The Instagram grid preview (2026-10-20, Later's Preview): the brand's Instagram account and its last 30 posts through
       Locus that target Instagram (posted, scheduled, drafts), newest first, the way the profile grid will read. */
    if (path === '/api/social/grid' && m === 'GET') {
      const act = actOf(url.searchParams.get('act'));
      const accs = await accountsOf(env, act);
      const rows = (await env.DB.prepare(`SELECT * FROM social_post_out WHERE act_id = ?1 AND status IN ('posted', 'partly', 'handoff', 'scheduled', 'draft', 'posting') ORDER BY at DESC LIMIT 60`).bind(act).all()).results || [];
      const posts = rows.map(pubPost).filter(p => p.targets && p.targets.ig && p.targets.ig.on).slice(0, 30);
      return json({ act, account: pubAccount(accs.ig), posts });
    }
    if (path === '/api/social/week' && m === 'GET') {
      const act = actOf(url.searchParams.get('act'));
      const b = await brandOf(env, act);
      const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : new Date().toLocaleDateString('en-CA', { timeZone: b.tz });
      const w = await weekPosts(env, act, from, b.tz);
      const accs = await accountsOf(env, act);
      /* "2 of 5 planned" (2026-10-20): the brand's weekly target (Brand settings > Social) against the posts that will go out. */
      return json({ act, name: b.name, tz: b.tz, from, days: w.days, today: new Date().toLocaleDateString('en-CA', { timeZone: b.tz }), posts: w.posts,
        target: await targetOf(env, act), planned: w.posts.filter(p => PLANNED.has(p.status)).length,
        accounts: Object.fromEntries(Object.keys(PLATS).map(k => [k, accs[k] ? { on: true, mode: accs[k].mode, handle: accs[k].handle, pic: accs[k].pic, status: accs[k].status } : { on: false }])) });
    }
    /* The brand's weekly target. */
    if (path === '/api/social/target' && m === 'PUT') {
      teamOnly(); const act = actOf(body.act);
      const n = Math.round(+body.target);
      if (!Number.isFinite(n) || n < 0 || n > 21) return json({ error: 'A number of posts a week, 0 to 21.' }, 400);
      await sput(env, `socialTarget:${act}`, String(n));
      return json({ ok: true, target: n });
    }
    /* Fill the week (2026-10-20): up to the target, unused tray items in the mix, spread over free hours, captioned in the
       brand's voice. Proposals only: the panel's Schedule all saves each one through POST /api/social/post. */
    if (path === '/api/social/fill' && m === 'POST') { teamOnly(); return json(await fillWeek(env, d, actOf(body.act), body.week)); }
    /* Post now on a scheduled post: claimed here, published once, through the same path as the tick. */
    if (path === '/api/social/post/now' && m === 'POST') {
      const p = await postOf(body.id);
      if (!p) return json({ error: 'That post is gone.' }, 404);
      if (p.status !== 'scheduled') return json({ error: p.status === 'posting' ? 'It is posting right now.' : 'Only a scheduled post can go now. Schedule it first.' }, 400);
      const claim = await env.DB.prepare(`UPDATE social_post_out SET status = 'posting', posting_at = ?2, at = ?2, updated_at = datetime('now') WHERE id = ?1 AND status = 'scheduled'`).bind(p.id, nowIso()).run();
      if (!claim.meta?.changes) return json({ error: 'It just started posting.' }, 409);
      const row = await env.DB.prepare(`SELECT * FROM social_post_out WHERE id = ?1`).bind(p.id).first();
      if (d.waitUntil) d.waitUntil(publishPost(env, d, row).catch(() => {})); else await publishPost(env, d, row);
      return json({ ok: true, post: pubPost(row) });
    }
    /* Results (2026-10-20): our posted cards from the last 30 days ranked by views, with the watched brands' usual per platform. */
    if (path === '/api/social/results' && m === 'GET') return json(await resultsOf(env, actOf(url.searchParams.get('act'))));
    if (path === '/api/social/tray' && m === 'GET') return json({ items: await trayOf(env, d, actOf(url.searchParams.get('act'))) });
    if (path === '/api/social/upload' && m === 'POST') {
      const act = actOf(url.searchParams.get('act'));
      if (!env.MEDIA) return json({ error: 'No media bucket on the server.' }, 500);
      const type = ct.split(';')[0].toLowerCase();
      if (!/^(image\/(jpeg|png|webp)|video\/(mp4|quicktime))$/.test(type)) return json({ error: 'Upload a JPEG, PNG, WebP, MP4 or MOV.' }, 400);
      const buf = await request.arrayBuffer();
      if (!buf.byteLength) return json({ error: 'Empty file.' }, 400);
      if (buf.byteLength > 95 * 1024 * 1024) return json({ error: 'Files up to 95 MB.' }, 400);
      const id = rid();
      const key = `u/${await keyOf(`upload:${id}`)}`;
      const video = type.startsWith('video/');
      const fin = video ? { body: buf, type: type === 'video/quicktime' ? 'video/quicktime' : 'video/mp4' } : await toJpeg(env, buf, type);
      await env.MEDIA.put(`social/${key}`, fin.body, { httpMetadata: { contentType: fin.type, cacheControl: 'public, max-age=31536000' } });
      const name = clip(decodeURIComponent(url.searchParams.get('name') || ''), 120) || (video ? 'Video' : 'Picture');
      await env.DB.prepare(`INSERT INTO social_media (id, act_id, kind, key, type, name, bytes, created_by) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`).bind(id, act, video ? 'video' : 'image', key, fin.type, name, fin.body.byteLength, email).run();
      /* The film for a Make draft (?idea=): the upload is linked to the idea and its Film task closes itself. */
      const idea = /^[A-Za-z0-9]+:[0-9a-z.]+$/.test(url.searchParams.get('idea') || '') ? url.searchParams.get('idea') : null;
      if (idea) { await ensureMakeCols(env); await env.DB.prepare(`UPDATE social_media SET idea_id = ?2 WHERE id = ?1`).bind(id, idea).run().catch(() => {}); await closeFilmTask(env, idea, email); }
      return json({ ok: true, item: { ref: `media:${id}`, src: 'upload', kind: video ? 'video' : 'image', title: name, thumb: `${SELF}/social-m/${key}`, key, used: false, idea } });
    }
    if (path === '/api/social/post' && m === 'POST') {
      const act = actOf(body.act);
      const old = body.id ? await postOf(body.id) : null;
      if (body.id && !old) return json({ error: 'That post is gone.' }, 404);
      if (old && old.act_id !== act) return json({ error: 'That post belongs to another brand.' }, 403);
      if (old && ['posting'].includes(old.status)) return json({ error: 'It is posting right now; wait a minute.' }, 400);
      const atMs = body.now ? Date.now() : Date.parse(body.at || '');
      if (!Number.isFinite(atMs)) return json({ error: 'Pick a day and time.' }, 400);
      const status = body.status === 'scheduled' ? 'scheduled' : 'draft';
      const media = cleanMedia(body.media, old ? safe(old.media_json, []) : []);
      const targets = cleanTargets(body.targets);
      const onCount = Object.values(targets).filter(t => t.on).length;
      if (status === 'scheduled' && !media.length) return json({ error: 'Add a picture or video first.' }, 400);
      if (status === 'scheduled' && !onCount) return json({ error: 'Pick at least one account.' }, 400);
      if (status === 'scheduled' && targets.yt?.on && !media.some(isVideo)) return json({ error: 'YouTube needs a video. Untick it or add one.' }, 400);
      /* A post already out keeps its results; only its caption, targets and time can change for the platforms still pending. */
      const keepRes = old ? safe(old.results_json, {}) : {};
      const id = old ? old.id : rid();
      const nextStatus = old && ['posted', 'partly', 'handoff', 'failed'].includes(old.status) && status !== 'scheduled' ? old.status : status;
      await env.DB.prepare(`INSERT INTO social_post_out (id, act_id, at, status, caption, media_json, targets_json, results_json, auto, created_by)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(id) DO UPDATE SET at = excluded.at, status = excluded.status, caption = excluded.caption, media_json = excluded.media_json, targets_json = excluded.targets_json, auto = excluded.auto, error = NULL, updated_at = datetime('now')`)
        .bind(id, act, new Date(atMs).toISOString(), nextStatus, clip(body.caption, 2200), JSON.stringify(media), JSON.stringify(targets), JSON.stringify(keepRes), body.auto === false ? 0 : 1, old ? old.created_by : email).run();
      /* A post that carries a Make draft (its card, or a film uploaded for it) closes the idea's Film task (make.js exitOrganic). */
      for (const ideaId of await ideaIdsOf(env, media)) await closeFilmTask(env, ideaId, email).catch(() => {});
      /* Post now: run it in the request when it is one platform and a picture (seconds); else the 5-minute tick picks it up. */
      const row = await env.DB.prepare(`SELECT * FROM social_post_out WHERE id = ?1`).bind(id).first();
      if (body.now && status === 'scheduled') {
        const claim = await env.DB.prepare(`UPDATE social_post_out SET status = 'posting', posting_at = ?2 WHERE id = ?1 AND status = 'scheduled'`).bind(id, nowIso()).run();
        if (claim.meta?.changes) { if (d.waitUntil) d.waitUntil(publishPost(env, d, row).catch(() => {})); else await publishPost(env, d, row); }
      }
      return json({ ok: true, post: pubPost(await env.DB.prepare(`SELECT * FROM social_post_out WHERE id = ?1`).bind(id).first()) });
    }
    if (path === '/api/social/post' && m === 'GET') { const p = await postOf(url.searchParams.get('id')); return p ? json({ post: pubPost(p) }) : json({ error: 'That post is gone.' }, 404); }
    if (path === '/api/social/post' && m === 'DELETE') {
      const p = await postOf(url.searchParams.get('id'));
      if (!p) return json({ error: 'That post is gone.' }, 404);
      if (p.status === 'posting') return json({ error: 'It is posting right now.' }, 400);
      for (const mm of safe(p.media_json, [])) if (mm.staged && env.MEDIA) await env.MEDIA.delete(`social/${mm.staged}`).catch(() => {});
      await env.DB.prepare(`DELETE FROM social_post_out WHERE id = ?1`).bind(p.id).run();
      return json({ ok: true });
    }
    if (path === '/api/social/post/byhand' && m === 'POST') {
      const p = await postOf(body.id);
      if (!p) return json({ error: 'That post is gone.' }, 404);
      const r = await markByHand(env, p.id, body.plat, /^https?:\/\//.test(body.url || '') ? clip(body.url, 400) : null, email);
      return json(r.error ? r : { ok: true, post: pubPost(await postOf(p.id)) }, r.error ? 400 : 200);
    }
    if (path === '/api/social/post/retry' && m === 'POST') {
      const p = await postOf(body.id);
      if (!p) return json({ error: 'That post is gone.' }, 404);
      if (!['failed', 'partly', 'handoff'].includes(p.status)) return json({ error: 'Only a failed or half-posted post goes again.' }, 400);
      const res = safe(p.results_json, {});
      for (const k of Object.keys(res)) if (res[k] && !res[k].posted_at) delete res[k];
      await env.DB.prepare(`UPDATE social_post_out SET status = 'scheduled', at = ?2, results_json = ?3, error = NULL, updated_at = datetime('now') WHERE id = ?1`).bind(p.id, nowIso(), JSON.stringify(res)).run();
      return json({ ok: true, post: pubPost(await postOf(p.id)) });
    }
    if (path === '/api/social/captions' && m === 'GET') {
      const act = actOf(url.searchParams.get('act'));
      return json({ captions: ((await env.DB.prepare(`SELECT id, text, created_by, created_at FROM social_caption WHERE act_id = ?1 ORDER BY created_at DESC LIMIT 60`).bind(act).all()).results || []) });
    }
    if (path === '/api/social/captions' && m === 'POST') {
      const act = actOf(body.act), text = clip(body.text, 2200);
      if (!text) return json({ error: 'Nothing to save.' }, 400);
      const id = rid();
      await env.DB.prepare(`INSERT INTO social_caption (id, act_id, text, created_by) VALUES (?1, ?2, ?3, ?4)`).bind(id, act, text, email).run();
      return json({ ok: true, id });
    }
    if (path === '/api/social/captions' && m === 'DELETE') {
      const c = await env.DB.prepare(`SELECT * FROM social_caption WHERE id = ?1`).bind(String(url.searchParams.get('id') || '')).first();
      if (!c || (cs && !cs.ids.has(c.act_id))) return json({ error: 'That caption is gone.' }, 404);
      await env.DB.prepare(`DELETE FROM social_caption WHERE id = ?1`).bind(c.id).run();
      return json({ ok: true });
    }
    if (path === '/api/social/rephrase' && m === 'POST') return json({ captions: await rephrase(env, actOf(body.act), body.text, body.note) });
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.plain ? e.message : `That did not work: ${clip(e.message, 300)}` }, e.status && e.status < 500 ? e.status : 500);
  }
}

/** Posts for the Locus Calendar (calendar.js calendarData): one line per post, the brand's local day. */
export async function calendarPosts(env, ids, from, to) {
  await ensureSocialPost(env);
  if (!ids.length) return [];
  const lo = new Date(from + 'T00:00:00Z'); lo.setUTCDate(lo.getUTCDate() - 1);
  const hi = new Date(to + 'T00:00:00Z'); hi.setUTCDate(hi.getUTCDate() + 2);
  const rows = (await env.DB.prepare(`SELECT p.*, b.tz FROM social_post_out p LEFT JOIN brand_accounts b ON b.act_id = p.act_id WHERE p.act_id IN (${ids.map((_, i) => `?${i + 3}`).join(',')}) AND p.at >= ?1 AND p.at < ?2 ORDER BY p.at`).bind(lo.toISOString(), hi.toISOString(), ...ids).all().catch(() => ({ results: [] }))).results || [];
  return rows.map(p => { const tz = p.tz || 'America/Chicago'; const day = new Date(p.at).toLocaleDateString('en-CA', { timeZone: tz }); const t = safe(p.targets_json, {});
    return { id: p.id, act: p.act_id, day, hm: new Date(p.at).toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }), status: p.status, caption: clip(p.caption, 120), plats: Object.keys(PLATS).filter(k => t[k]?.on), media: safe(p.media_json, [])[0]?.thumb || null }; })
    .filter(p => p.day >= from && p.day <= to);
}
