/* LOCUS SOCIAL, phase 1: WATCH (2026-10-19). Plan, audit and UI research: docs/locus-social/proposal.html
   (https://claude.ai/artifact/6DCyDxYMGAsfRpeNWzatZH).

   A brand follows other brands (one handle, looked up on Instagram, TikTok and YouTube) and topics ("golf short game").
   Their posts are pulled once a day into one feed, each labelled by platform and format (Reel, Carousel, Post, TikTok,
   Photos, Short, Video) with "usually X, this one Y": a followed account's median for that platform, or a topic post's
   author's followers. Breaking out = 3x usual. "Make ours" hands the post to the ideas bot (ideas.js ideaFromLocus).

   DATA: ScrapeCreators (DOWNLOADER_KEY, the ideas bot's key), 1 credit a call, about $0.002. A brand follow is up to
   4 calls a pull (IG posts, TikTok videos, YouTube Shorts, YouTube videos), a topic 2 to 3 (TikTok, IG Reels, YouTube
   search). 14 follows a day is about $3 a month. Covers are copied to R2 on the pull (social/t/), because Instagram's
   and TikTok's image links expire in days; a video is copied on the first Play (social/v/). Both are served public by
   an unguessable key at /social-m/<key>. Nothing here posts anywhere; posting is phase 2. */
import { fetchSocialVideo, ideaFromLocus, ideaState, pushIdea, ideaRetry } from './ideas.js';
import { clientScope } from './brandguard.js';

let F = fetch;
export function useFetch(f) { F = f; }
const SC = 'https://api.scrapecreators.com';
const SELF = 'https://mobius-account-health.mobius-digital.workers.dev';
const HAIKU = 'claude-haiku-5-5';
const DAY = 864e5;
const PULL_EVERY = 20 * 3600e3;
const BREAKOUT = 3;
const KEEP_DAYS = 120;
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const safe = (t, d = null) => { try { return JSON.parse(t); } catch { return d; } };
const num = v => { const n = +v; return Number.isFinite(n) && n >= 0 ? Math.round(n) : null; };
const iso = v => { if (v == null || v === '') return null; const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v); return isNaN(d) ? null : d.toISOString(); };
const handleOf = s => String(s || '').trim().replace(/^https?:\/\/(www\.)?/i, '').replace(/^(instagram\.com|tiktok\.com|youtube\.com)\//i, '').replace(/^@/, '').replace(/[/?#].*$/, '').replace(/^@/, '').trim();
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
async function keyOf(id) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`locus-social:${id}`)));
  return [...b.slice(0, 12)].map(x => x.toString(16).padStart(2, '0')).join('');
}
export const PLATS = { ig: 'Instagram', tt: 'TikTok', yt: 'YouTube' };
export const FMTS = { reel: 'Reel', carousel: 'Carousel', post: 'Post', tiktok: 'TikTok', photos: 'Photos', short: 'Short', video: 'Video' };

/* ---------------- tables (created on first use; also in schema.sql) ---------------- */
let ready = false;
export async function ensureSocial(env) {
  if (ready) return;
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS social_brand (act_id TEXT PRIMARY KEY, on_by TEXT, on_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS social_follow (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'brand', name TEXT,
      ig TEXT, tt TEXT, yt TEXT, query TEXT, added_by TEXT, pulled_at TEXT, error TEXT, credits INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS social_follow_act ON social_follow (act_id)`,
    `CREATE TABLE IF NOT EXISTS social_post (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, follow_id TEXT NOT NULL, plat TEXT NOT NULL, pid TEXT NOT NULL,
      fmt TEXT, handle TEXT, url TEXT, caption TEXT, thumb TEXT, thumb_src TEXT, posted_at TEXT, views INTEGER, likes INTEGER, comments INTEGER,
      shares INTEGER, saves INTEGER, followers INTEGER, dur REAL, sound TEXT, slides INTEGER, hook TEXT, ftag TEXT, saved INTEGER NOT NULL DEFAULT 0,
      idea_id TEXT, video TEXT, first_seen TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS social_post_act ON social_post (act_id, posted_at)`,
    `CREATE INDEX IF NOT EXISTS social_post_follow ON social_post (follow_id)`,
  ]) await env.DB.prepare(sql).run();
  ready = true;
}

/* ---------------- ScrapeCreators ---------------- */
async function sc(env, path, params, meter) {
  if (!env.DOWNLOADER_KEY) throw Object.assign(new Error('The ScrapeCreators key (DOWNLOADER_KEY) is not set on the server.'), { plain: true });
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
  const r = await F(`${SC}${path}?${q}`, { headers: { 'x-api-key': env.DOWNLOADER_KEY } });
  if (meter) meter.credits = (meter.credits || 0) + 1;
  const j = await r.json().catch(() => ({}));
  if (meter && j.credits_remaining != null) meter.left = +j.credits_remaining;
  if (!r.ok || j.success === false) throw Object.assign(new Error(clip(j.message || j.error || `ScrapeCreators said ${r.status}`, 200)), { status: r.status });
  return j;
}

/* ---------------- one shape for every platform ---------------- */
function igItem(raw, followers) {
  const it = raw?.media || raw;
  const code = it.code || it.shortcode;
  if (!code) return null;
  const isCarousel = +it.media_type === 8 || it.product_type === 'carousel_container' || Array.isArray(it.carousel_media);
  const isReel = !isCarousel && (it.product_type === 'clips' || +it.media_type === 2 || it.is_video === true);
  const fmt = isCarousel ? 'carousel' : isReel ? 'reel' : 'post';
  const cap = typeof it.caption === 'string' ? it.caption : it.caption?.text || it.edge_media_to_caption?.edges?.[0]?.node?.text || '';
  const owner = it.user?.username || it.owner?.username || '';
  return { plat: 'ig', pid: String(code), fmt, handle: owner, url: `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${code}/`,
    caption: clip(cap, 2200), thumb_src: it.image_versions2?.candidates?.[0]?.url || it.display_uri || it.thumbnail_src || it.display_url || it.thumbnail_url || null,
    posted_at: iso(it.taken_at || it.taken_at_timestamp || it.created_at),
    views: num(it.play_count ?? it.ig_play_count ?? it.video_play_count ?? it.video_view_count ?? it.view_count),
    likes: num(it.like_count ?? it.edge_liked_by?.count ?? it.edge_media_preview_like?.count), comments: num(it.comment_count ?? it.edge_media_to_comment?.count),
    shares: null, saves: null, followers: num(it.owner?.follower_count ?? it.user?.follower_count ?? followers), dur: +it.video_duration || null,
    sound: null, slides: num(it.carousel_media_count ?? it.carousel_media?.length) };
}
function ttItem(a) {
  if (!a?.aweme_id) return null;
  const photo = !!(a.image_post_info || (Array.isArray(a.image_infos) && a.image_infos.length) || a.content_type === 'photo' || a.aweme_type === 150);
  const s = a.statistics || {};
  const who = a.author?.unique_id || '';
  const music = a.music?.title || a.added_sound_music_info?.title || '';
  return { plat: 'tt', pid: String(a.aweme_id), fmt: photo ? 'photos' : 'tiktok', handle: who, url: `https://www.tiktok.com/@${who}/${photo ? 'photo' : 'video'}/${a.aweme_id}`,
    caption: clip(a.desc, 2200), thumb_src: a.video?.cover?.url_list?.[0] || a.video?.origin_cover?.url_list?.[0] || a.image_post_info?.images?.[0]?.display_image?.url_list?.[0] || null,
    posted_at: iso(a.create_time), views: num(s.play_count), likes: num(s.digg_count), comments: num(s.comment_count), shares: num(s.share_count), saves: num(s.collect_count),
    followers: num(a.author?.follower_count), dur: a.video?.duration ? a.video.duration / 1000 : null,
    sound: music && !/^original sound/i.test(music) ? clip(`${music}${a.music?.author ? ` (${a.music.author})` : ''}`, 120) : null,
    slides: photo ? num(a.image_post_info?.images?.length) : null };
}
function ytItem(v, short, handle) {
  if (!v?.id) return null;
  const isShort = short || v.type === 'short';
  return { plat: 'yt', pid: String(v.id), fmt: isShort ? 'short' : 'video', handle: handle || v.channel?.handle || v.channel?.title || '',
    url: isShort ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`, caption: clip(v.title || v.description, 600),
    thumb_src: v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`, posted_at: iso(v.publishDate || v.publishedTime),
    views: num(v.viewCountInt), likes: num(v.likeCountInt), comments: num(v.commentCountInt), shares: null, saves: null, followers: null,
    dur: v.durationMs ? v.durationMs / 1000 : (+v.lengthSeconds || null), sound: null, slides: null };
}

/* ---------------- what a follow pulls ---------------- */
async function pullBrand(env, f, meter) {
  const out = [], errs = [];
  if (f.ig) {
    await sc(env, '/v2/instagram/user/posts', { handle: f.ig }, meter)
      .then(j => (j.items || []).forEach(it => { const p = igItem(it, j.user?.follower_count); if (p) out.push({ ...p, handle: p.handle || f.ig }); }))
      .catch(e => errs.push(`Instagram: ${e.message}`));
    /* The posts list leaves most Reels out and never has their plays; the Reels list has both (Takomo, 2026-10-19: 2 Reels
       without plays from posts, 12 with plays from reels). */
    await sc(env, '/v1/instagram/user/reels', { handle: f.ig }, meter)
      .then(j => (j.items || []).forEach(it => { const p = igItem({ ...(it.media || it), product_type: 'clips' }); if (p) out.push({ ...p, handle: p.handle || f.ig }); }))
      .catch(e => errs.push(`Instagram Reels: ${e.message}`));
  }
  if (f.tt) await sc(env, '/v3/tiktok/profile/videos', { handle: f.tt, sort_by: 'latest' }, meter)
    .then(j => (j.aweme_list || []).forEach(a => { const p = ttItem(a); if (p) out.push(p); }))
    .catch(e => errs.push(`TikTok: ${e.message}`));
  if (f.yt) {
    await sc(env, '/v1/youtube/channel/shorts', { handle: f.yt, sort: 'newest' }, meter)
      .then(j => (j.shorts || []).forEach(v => { const p = ytItem(v, true, f.yt); if (p) out.push(p); }))
      .catch(e => errs.push(`YouTube Shorts: ${e.message}`));
    await sc(env, '/v1/youtube/channel-videos', { handle: f.yt, sort: 'latest' }, meter)
      .then(j => (j.videos || []).forEach(v => { const p = ytItem(v, false, f.yt); if (p) out.push(p); }))
      .catch(e => errs.push(`YouTube: ${e.message}`));
  }
  return { posts: out, errs };
}
async function pullTopic(env, f, meter) {
  const out = [], errs = [];
  await sc(env, '/v1/tiktok/search/keyword', { query: f.query, date_posted: 'this-week', sort_by: 'relevance' }, meter)
    .then(j => (j.search_item_list || j.aweme_list || []).forEach(x => { const p = ttItem(x.aweme_info || x); if (p) out.push(p); }))
    .catch(e => errs.push(`TikTok: ${e.message}`));
  await sc(env, '/v2/instagram/reels/search', { query: f.query, date_posted: 'last-week' }, meter)
    .then(j => (j.reels || j.items || []).forEach(it => { const p = igItem({ ...it, media_type: it.media_type || 2, product_type: it.product_type || 'clips' }); if (p) out.push(p); }))
    .catch(e => errs.push(`Instagram: ${e.message}`));
  await sc(env, '/v1/youtube/search', { query: f.query, uploadDate: 'this_week' }, meter)
    .then(j => [...(j.shorts || []).map(v => ytItem(v, true)), ...(j.videos || []).map(v => ytItem(v, false))].filter(Boolean).slice(0, 20).forEach(p => out.push(p)))
    .catch(e => errs.push(`YouTube: ${e.message}`));
  return { posts: out, errs };
}

/** Pull one follow now: upsert its posts (fresh counts on posts we already have), copy new covers to R2. */
export async function pullFollow(env, f, { can = () => true } = {}) {
  await ensureSocial(env);
  const meter = { credits: 0 };
  const got = f.kind === 'topic' ? await pullTopic(env, f, meter) : await pullBrand(env, f, meter);
  const errs = got.errs;
  /* One row per post: the same Reel can come from the posts list and the Reels list; keep every number either one had. */
  const byId = new Map();
  for (const p of got.posts) { const k = `${p.plat}|${p.pid}`; const o = byId.get(k); byId.set(k, o ? Object.fromEntries(Object.keys({ ...o, ...p }).map(x => [x, p[x] ?? o[x]])) : p); }
  const posts = [...byId.values()];
  if (meter.left != null) await env.DB.prepare(`INSERT INTO settings (key, value) VALUES ('scCredits', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(JSON.stringify({ left: meter.left, at: new Date().toISOString() })).run().catch(() => {});
  const cutoff = Date.now() - KEEP_DAYS * DAY;
  let added = 0, covers = 0;
  for (const p of posts) {
    if (p.posted_at && Date.parse(p.posted_at) < cutoff) continue;
    const id = `${f.act_id}|${p.plat}|${p.pid}`;
    const had = await env.DB.prepare(`SELECT thumb FROM social_post WHERE id = ?1`).bind(id).first();
    await env.DB.prepare(`INSERT INTO social_post (id, act_id, follow_id, plat, pid, fmt, handle, url, caption, thumb_src, posted_at, views, likes, comments, shares, saves, followers, dur, sound, slides)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
      ON CONFLICT(id) DO UPDATE SET views = COALESCE(excluded.views, views), likes = COALESCE(excluded.likes, likes), comments = COALESCE(excluded.comments, comments),
        shares = COALESCE(excluded.shares, shares), saves = COALESCE(excluded.saves, saves), followers = COALESCE(excluded.followers, followers),
        thumb_src = COALESCE(excluded.thumb_src, thumb_src), caption = CASE WHEN excluded.caption != '' THEN excluded.caption ELSE caption END,
        posted_at = COALESCE(posted_at, excluded.posted_at), updated_at = datetime('now')`)
      .bind(id, f.act_id, f.id, p.plat, p.pid, p.fmt, p.handle || '', p.url, p.caption || '', p.thumb_src, p.posted_at, p.views, p.likes, p.comments, p.shares, p.saves, p.followers, p.dur, p.sound, p.slides).run();
    if (!had) added++;
    if (!had?.thumb && p.thumb_src && env.MEDIA && covers < 40 && can()) {
      const key = await copyCover(env, id, p.thumb_src);
      if (key) { covers++; await env.DB.prepare(`UPDATE social_post SET thumb = ?2 WHERE id = ?1`).bind(id, key).run(); }
    }
  }
  const error = posts.length ? (errs.length ? errs.join(' / ') : null) : (errs.join(' / ') || 'Nothing came back. Check the handles.');
  await env.DB.prepare(`UPDATE social_follow SET pulled_at = datetime('now'), error = ?2, credits = credits + ?3 WHERE id = ?1`).bind(f.id, error, meter.credits).run();
  return { follow: f.id, name: f.name, posts: posts.length, added, covers, credits: meter.credits, error };
}
async function copyCover(env, id, src) {
  try {
    const r = await F(src, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: /tiktok/.test(src) ? 'https://www.tiktok.com/' : /instagram|fbcdn/.test(src) ? 'https://www.instagram.com/' : '' } });
    const type = (r.headers.get('content-type') || '').split(';')[0];
    if (!r.ok || !/^image\//.test(type)) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 4e6) return null;
    const key = `t/${await keyOf(id)}`;
    await env.MEDIA.put(`social/${key}`, buf, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000' } });
    return key;
  } catch { return null; }
}

/* ---------------- following: a handle looked up everywhere, or a topic ---------------- */
async function lookUp(env, handle, meter) {
  const found = { ig: null, tt: null, yt: null }, names = [];
  await sc(env, '/v1/instagram/profile', { handle }, meter).then(j => {
    const u = j.data?.user || j.user || j;
    if (u?.username && !u.is_private) { found.ig = u.username; if (u.full_name) names.push(u.full_name); }
  }).catch(() => {});
  await sc(env, '/v1/tiktok/profile', { handle }, meter).then(j => {
    const u = j.user || j.userInfo?.user || j.data?.user;
    if (u?.uniqueId || u?.unique_id) { found.tt = u.uniqueId || u.unique_id; if (u.nickname) names.push(u.nickname); }
  }).catch(() => {});
  await sc(env, '/v1/youtube/channel', { handle }, meter).then(j => {
    if (j.channelId || j.id || j.name || j.title) { found.yt = handle; if (j.name || j.title) names.push(j.name || j.title); }
  }).catch(() => {});
  return { found, name: names[0] || handle };
}

/* ---------------- the feed ---------------- */
const median = a => { const s = a.filter(n => n != null && n > 0).sort((x, y) => x - y); if (s.length < 4) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Each post's "usually": its account's median on that platform (views where the platform counts them, else likes),
 *  or for a topic post the author's followers. ratio = this post / usually. */
const recent = p => p.posted_at && Date.now() - Date.parse(p.posted_at) <= 30 * DAY;
export function scorePosts(posts, follows) {
  const kind = Object.fromEntries(follows.map(f => [f.id, f.kind]));
  const groups = new Map();
  for (const p of posts) {
    if (kind[p.follow_id] === 'topic') continue;
    const metric = p.views != null && p.fmt !== 'carousel' && p.fmt !== 'post' ? 'views' : 'likes';
    const k = `${p.follow_id}|${p.plat}|${metric}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p[metric]);
  }
  const med = new Map([...groups].map(([k, v]) => [k, median(v)]));
  for (const p of posts) {
    if (kind[p.follow_id] === 'topic') {
      p.metric = p.views != null ? 'views' : 'likes';
      p.base = p.followers || null; p.base_kind = 'followers';
      p.ratio = p.base && p.views != null ? +(p.views / p.base).toFixed(2) : null;
      p.breaking = recent(p) && p.ratio != null && p.ratio >= BREAKOUT && p.views >= 20000;
    } else {
      p.metric = p.views != null && p.fmt !== 'carousel' && p.fmt !== 'post' ? 'views' : 'likes';
      p.base = med.get(`${p.follow_id}|${p.plat}|${p.metric}`) || null; p.base_kind = 'usual';
      p.ratio = p.base && p[p.metric] != null ? +(p[p.metric] / p.base).toFixed(2) : null;
      p.breaking = recent(p) && p.ratio != null && p.ratio >= BREAKOUT && (p[p.metric] || 0) >= (p.metric === 'views' ? 1000 : 100);
    }
  }
  return posts;
}
/** Sounds and hashtags behind the posts doing best lately (no extra calls: read off the feed itself). */
export function trendsOf(posts) {
  const since = Date.now() - 14 * DAY;
  const hot = posts.filter(p => p.posted_at && Date.parse(p.posted_at) >= since && (p.ratio || 0) >= 1.5);
  const tags = new Map(), sounds = new Map();
  const add = (m, k, p) => { const x = m.get(k) || { name: k, posts: 0, views: 0 }; x.posts++; x.views += p.views || p.likes || 0; m.set(k, x); };
  for (const p of hot) {
    for (const t of new Set((String(p.caption).match(/#[\p{L}\p{N}_]{2,40}/gu) || []).map(t => t.toLowerCase()))) if (!/^#(fyp|foryou|foryoupage|viral|reels|explore|trending)$/.test(t)) add(tags, t, p);
    if (p.sound) add(sounds, p.sound, p);
  }
  const top = m => [...m.values()].filter(x => x.posts >= 2 || m === sounds).sort((a, b) => b.posts - a.posts || b.views - a.views).slice(0, 8);
  return { tags: top(tags), sounds: top(sounds).slice(0, 5) };
}
const pub = p => ({ id: p.id, follow_id: p.follow_id, plat: p.plat, fmt: p.fmt, handle: p.handle, url: p.url, caption: p.caption, posted_at: p.posted_at,
  thumb: p.thumb ? `${SELF}/social-m/${p.thumb}` : p.thumb_src, views: p.views, likes: p.likes, comments: p.comments, shares: p.shares, saves: p.saves,
  dur: p.dur, sound: p.sound, slides: p.slides, hook: p.hook, ftag: p.ftag, saved: !!p.saved, idea_id: p.idea_id,
  metric: p.metric, base: p.base, base_kind: p.base_kind, ratio: p.ratio, breaking: !!p.breaking });

async function feed(env, act) {
  const follows = (await env.DB.prepare(`SELECT * FROM social_follow WHERE act_id = ?1 ORDER BY created_at`).bind(act).all()).results || [];
  const rows = (await env.DB.prepare(`SELECT * FROM social_post WHERE act_id = ?1 AND (saved = 1 OR posted_at >= ?2) ORDER BY posted_at DESC LIMIT 1500`)
    .bind(act, new Date(Date.now() - KEEP_DAYS * DAY).toISOString()).all()).results || [];
  scorePosts(rows, follows);
  const fName = Object.fromEntries(follows.map(f => [f.id, f.name]));
  return {
    follows: follows.map(f => ({ id: f.id, kind: f.kind, name: f.name, ig: f.ig, tt: f.tt, yt: f.yt, query: f.query, pulled_at: f.pulled_at, error: f.error,
      posts: rows.filter(p => p.follow_id === f.id).length })),
    posts: rows.map(p => ({ ...pub(p), who: fName[p.follow_id] || p.handle })),
    trends: trendsOf(rows),
  };
}

/* ---------------- hook and format tags (Haiku, a fraction of a cent a batch) ---------------- */
const HOOKS = ['Question', 'POV', 'Bold claim', 'List', 'Story', 'Challenge', 'How-to', 'Before and after', 'Trend or sound', 'Unboxing', 'Review', 'Skit', 'Behind the scenes', 'Product show', 'Giveaway', 'Other'];
const TAG_SCHEMA = { type: 'object', additionalProperties: false, required: ['tags'], properties: { tags: { type: 'array', items: { type: 'object', additionalProperties: false,
  required: ['i', 'hook', 'format'], properties: { i: { type: 'integer' }, hook: { type: 'string', enum: HOOKS }, format: { type: 'string' } } } } } };
export async function tagPosts(env, act = null, limit = 40) {
  if (!env.ANTHROPIC_API_KEY) return { tagged: 0 };
  const rows = (await env.DB.prepare(`SELECT id, plat, fmt, caption, dur, slides FROM social_post WHERE hook IS NULL AND posted_at >= ?1 ${act ? 'AND act_id = ?2' : ''} ORDER BY posted_at DESC LIMIT ${limit}`)
    .bind(...[new Date(Date.now() - 21 * DAY).toISOString(), ...(act ? [act] : [])]).all()).results || [];
  if (!rows.length) return { tagged: 0 };
  const list = rows.map((r, i) => `${i}. ${PLATS[r.plat]} ${FMTS[r.fmt] || r.fmt}${r.dur ? `, ${Math.round(r.dur)}s` : ''}${r.slides ? `, ${r.slides} slides` : ''}: ${clip(r.caption, 300) || '(no caption)'}`).join('\n');
  const r = await F('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: HAIKU, max_tokens: 3000, output_config: { format: { type: 'json_schema', schema: TAG_SCHEMA } },
      system: 'You label social media posts from brands for a marketing team. For each post give the hook type (from the list) and the format in 1 to 3 plain words (e.g. "Skit", "Product demo", "Talking head", "Street interview", "Slideshow tips", "Montage"). Judge from the caption, platform, format and length only. No em dashes.',
      messages: [{ role: 'user', content: `Label every post:\n${list}` }] }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { tagged: 0, error: j.error?.message || `Claude HTTP ${r.status}` };
  const out = safe((j.content || []).filter(b => b.type === 'text').map(b => b.text).join(''), {})?.tags || [];
  let n = 0;
  for (const t of out) {
    const row = rows[t.i];
    if (!row) continue;
    await env.DB.prepare(`UPDATE social_post SET hook = ?2, ftag = ?3 WHERE id = ?1`).bind(row.id, t.hook, clip(String(t.format).replace(/\s*[—–]\s*/g, ', '), 30)).run();
    n++;
  }
  return { tagged: n };
}

export const LOW_CREDITS = 150;
async function creditsLeft(env) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'scCredits'`).first().catch(() => null);
  const v = safe(r?.value, null);
  return v && v.left != null ? +v.left : null;
}

/* ---------------- the daily pull (hourly tick; each follow at most once every 20 hours) ---------------- */
export async function socialTick(env, can = () => true) {
  await ensureSocial(env);
  if (!env.DOWNLOADER_KEY) return { skipped: 'no key' };
  /* The ideas bot downloads videos on the same ScrapeCreators credits: the daily pull stops before it eats the last ones. */
  const cred = await creditsLeft(env);
  if (cred != null && cred < LOW_CREDITS) return { skipped: `only ${cred} ScrapeCreators credits left` };
  const due = (await env.DB.prepare(`SELECT f.* FROM social_follow f JOIN social_brand b ON b.act_id = f.act_id
    WHERE f.pulled_at IS NULL OR f.pulled_at < ?1 ORDER BY COALESCE(f.pulled_at, '') LIMIT 4`).bind(new Date(Date.now() - PULL_EVERY).toISOString().replace('T', ' ').slice(0, 19)).all()).results || [];
  const ran = [];
  for (const f of due) {
    if (!can(60)) { ran.push({ deferred: 'out of budget' }); break; }
    ran.push(await pullFollow(env, f, { can: () => can(10) }).catch(e => ({ follow: f.id, error: e.message })));
  }
  const tags = due.length && can(5) ? await tagPosts(env).catch(e => ({ error: e.message })) : null;
  /* Old posts go (saved ones stay), with their covers. */
  const old = (await env.DB.prepare(`SELECT id, thumb, video FROM social_post WHERE saved = 0 AND idea_id IS NULL AND posted_at < ?1 LIMIT 200`).bind(new Date(Date.now() - KEEP_DAYS * DAY).toISOString()).all()).results || [];
  for (const o of old) { for (const k of [o.thumb, o.video].filter(Boolean)) await env.MEDIA?.delete(`social/${k}`).catch(() => {}); await env.DB.prepare(`DELETE FROM social_post WHERE id = ?1`).bind(o.id).run(); }
  return { pulled: ran, tags, pruned: old.length };
}

/* ---------------- public media: covers and videos by an unguessable key ---------------- */
export async function serveSocialMedia(env, path, request, CORS = {}) {
  const m = /^\/social-m\/([tv]\/[0-9a-f]{24})$/.exec(path);
  if (!m || !env.MEDIA) return new Response('not found', { status: 404 });
  const range = request.headers.get('Range');
  const rm = /^bytes=(\d+)-(\d*)$/.exec(range || '');
  const obj = rm ? await env.MEDIA.get(`social/${m[1]}`, { range: rm[2] ? { offset: +rm[1], length: +rm[2] - +rm[1] + 1 } : { offset: +rm[1] } }) : await env.MEDIA.get(`social/${m[1]}`);
  if (!obj) return new Response('not found', { status: 404 });
  const h = { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000', 'Accept-Ranges': 'bytes', ...CORS };
  if (rm && obj.range) {
    const start = obj.range.offset || 0, len = obj.range.length ?? (obj.size - start);
    return new Response(obj.body, { status: 206, headers: { ...h, 'Content-Range': `bytes ${start}-${start + len - 1}/${obj.size}`, 'Content-Length': String(len) } });
  }
  return new Response(obj.body, { headers: { ...h, 'Content-Length': String(obj.size) } });
}
async function videoOf(env, post) {
  if (post.plat === 'yt') return { embed: `https://www.youtube-nocookie.com/embed/${post.pid}?autoplay=1&rel=0` };
  if (post.video) return { src: `${SELF}/social-m/${post.video}` };
  if (['carousel', 'post', 'photos'].includes(post.fmt)) return { none: true };
  const v = await fetchSocialVideo(post.url, env);
  if (!v.ok) return { error: v.reason === 'not_video' ? 'That post is a picture, not a video.' : `The video would not download (${v.message || v.reason}). Open it on ${PLATS[post.plat]} instead.` };
  const size = v.size || 0;
  if (size > 95 * 1024 * 1024) return { error: 'That video is too big to copy. Open it on the platform instead.' };
  const key = `v/${await keyOf(post.id)}`;
  const body = size > 0 && typeof FixedLengthStream !== 'undefined' && v.res.body ? (() => { const fl = new FixedLengthStream(size); v.res.body.pipeTo(fl.writable).catch(() => {}); return fl.readable; })() : await v.res.arrayBuffer();
  await env.MEDIA.put(`social/${key}`, body, { httpMetadata: { contentType: 'video/mp4', cacheControl: 'public, max-age=31536000' } });
  await env.DB.prepare(`UPDATE social_post SET video = ?2 WHERE id = ?1`).bind(post.id, key).run();
  return { src: `${SELF}/social-m/${key}` };
}

/* ---------------- routes ---------------- */
/**
 * GET    /api/social/brands               which brands have Social on (the rail item)
 * PUT    /api/social/brand {act, on}      switch it on or off for a brand (Brand settings > Social)
 * GET    /api/social?act=                 follows, the scored feed and the trend chips
 * POST   /api/social/follow {act, kind, text, ig?, tt?, yt?}   follow a brand (looked up everywhere) or a topic; pulls now
 * PUT    /api/social/follow {id, name, ig, tt, yt, query}     fix a handle; pulls again
 * DELETE /api/social/follow?id=           stop following (saved posts and posts made into ours stay)
 * POST   /api/social/pull {act}           pull every follow of this brand now (team)
 * POST   /api/social/save {id, saved}     keep a post
 * POST   /api/social/video {id}           a playable copy (TikTok / Instagram) or the YouTube player
 * POST   /api/social/make {id, note}      Make ours: the ideas bot writes our version (in the brand's channel too)
 * GET    /api/social/idea?id=             the draft for a post
 * POST   /api/social/push {id, dest}      send the draft to the creator link, a brief (Asana, the Work board) or Studio
 */
export async function handleSocial(request, env, url, path, json, { isAdmin, sessionEmail, actorName, waitUntil }) {
  if (!path.startsWith('/api/social')) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  await ensureSocial(env);
  const cs = clientScope(request);
  const email = cs ? cs.email : await sessionEmail(env, request).catch(() => null);
  const who = cs ? (cs.name || cs.email.split('@')[0]) : (actorName ? await actorName(env, email).catch(() => null) : null) || (email ? email.split('@')[0].replace(/^./, c => c.toUpperCase()) : 'the team');
  const m = request.method;
  const body = m === 'GET' || m === 'DELETE' ? {} : await request.json().catch(() => ({}));
  const postOf = async id => {
    const p = id ? await env.DB.prepare(`SELECT * FROM social_post WHERE id = ?1`).bind(String(id)).first() : null;
    return p && (!cs || cs.ids.has(p.act_id)) ? p : null;
  };
  const followOf = async id => {
    const f = id ? await env.DB.prepare(`SELECT * FROM social_follow WHERE id = ?1`).bind(String(id)).first() : null;
    return f && (!cs || cs.ids.has(f.act_id)) ? f : null;
  };
  try {
    if (path === '/api/social/brands' && m === 'GET') {
      const rows = (await env.DB.prepare(`SELECT act_id FROM social_brand`).all()).results || [];
      return json({ on: rows.map(r => r.act_id).filter(a => !cs || cs.ids.has(a)) });
    }
    if (path === '/api/social/brand' && m === 'PUT') {
      const act = String(body.act || '');
      if (!/^brand_[a-z0-9_]+$/.test(act)) return json({ error: 'Pick a brand first.' }, 400);
      if (body.on) await env.DB.prepare(`INSERT INTO social_brand (act_id, on_by) VALUES (?1, ?2) ON CONFLICT(act_id) DO NOTHING`).bind(act, who).run();
      else await env.DB.prepare(`DELETE FROM social_brand WHERE act_id = ?1`).bind(act).run();
      return json({ ok: true, on: !!body.on });
    }
    if (path === '/api/social' && m === 'GET') {
      const act = url.searchParams.get('act') || '';
      if (!act || act === 'all') return json({ error: 'Pick a brand to see what the brands it follows are posting.' }, 400);
      const on = !!(await env.DB.prepare(`SELECT 1 FROM social_brand WHERE act_id = ?1`).bind(act).first());
      return json({ on, ...(await feed(env, act)), ...(cs ? {} : { credits: await creditsLeft(env), low: LOW_CREDITS }) });
    }
    if (path === '/api/social/follow' && m === 'POST') {
      const act = String(body.act || '');
      if (!act || act === 'all') return json({ error: 'Pick a brand first.' }, 400);
      const n = await env.DB.prepare(`SELECT COUNT(*) n FROM social_follow WHERE act_id = ?1`).bind(act).first();
      if ((n?.n || 0) >= 40) return json({ error: 'A brand can follow up to 40 brands and topics. Stop following one first.' }, 400);
      const meter = { credits: 0 };
      let f;
      if (body.kind === 'topic') {
        const q = clip(body.text, 80);
        if (q.length < 3) return json({ error: 'Type a topic, like "golf short game".' }, 400);
        f = { id: rid(), act_id: act, kind: 'topic', name: q, query: q, ig: null, tt: null, yt: null };
      } else {
        const h = handleOf(body.text);
        if (!/^[A-Za-z0-9_.-]{2,40}$/.test(h)) return json({ error: 'Type the brand’s handle, like @takomogolf.' }, 400);
        const given = { ig: handleOf(body.ig) || null, tt: handleOf(body.tt) || null, yt: handleOf(body.yt) || null };
        const look = given.ig || given.tt || given.yt ? { found: given, name: h } : await lookUp(env, h, meter);
        if (!look.found.ig && !look.found.tt && !look.found.yt) return json({ error: `I could not find @${h} on Instagram, TikTok or YouTube. Check the spelling, or add each platform’s handle.` }, 404);
        const dup = await env.DB.prepare(`SELECT name FROM social_follow WHERE act_id = ?1 AND kind = 'brand' AND (ig = ?2 OR tt = ?3 OR yt = ?4)`).bind(act, look.found.ig || '-', look.found.tt || '-', look.found.yt || '-').first();
        if (dup) return json({ error: `You already follow ${dup.name}.` }, 400);
        f = { id: rid(), act_id: act, kind: 'brand', name: clip(body.name || look.name, 60), query: null, ...look.found };
      }
      await env.DB.prepare(`INSERT INTO social_follow (id, act_id, kind, name, ig, tt, yt, query, added_by, credits) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`)
        .bind(f.id, act, f.kind, f.name, f.ig, f.tt, f.yt, f.query, who, meter.credits).run();
      const pulled = await pullFollow(env, f).catch(e => ({ error: e.message }));
      return json({ ok: true, follow: f, pulled });
    }
    if (path === '/api/social/follow' && m === 'PUT') {
      const f = await followOf(body.id);
      if (!f) return json({ error: 'That follow is gone.' }, 404);
      const next = { ...f, name: clip(body.name ?? f.name, 60), ig: body.ig !== undefined ? handleOf(body.ig) || null : f.ig, tt: body.tt !== undefined ? handleOf(body.tt) || null : f.tt,
        yt: body.yt !== undefined ? handleOf(body.yt) || null : f.yt, query: f.kind === 'topic' ? clip(body.query ?? f.query, 80) : null };
      await env.DB.prepare(`UPDATE social_follow SET name = ?2, ig = ?3, tt = ?4, yt = ?5, query = ?6 WHERE id = ?1`).bind(f.id, next.name, next.ig, next.tt, next.yt, next.query).run();
      return json({ ok: true, pulled: await pullFollow(env, next).catch(e => ({ error: e.message })) });
    }
    if (path === '/api/social/follow' && m === 'DELETE') {
      const f = await followOf(url.searchParams.get('id'));
      if (!f) return json({ error: 'That follow is gone.' }, 404);
      const gone = (await env.DB.prepare(`SELECT id, thumb, video FROM social_post WHERE follow_id = ?1 AND saved = 0 AND idea_id IS NULL`).bind(f.id).all()).results || [];
      for (const o of gone) for (const k of [o.thumb, o.video].filter(Boolean)) await env.MEDIA?.delete(`social/${k}`).catch(() => {});
      await env.DB.prepare(`DELETE FROM social_post WHERE follow_id = ?1 AND saved = 0 AND idea_id IS NULL`).bind(f.id).run();
      await env.DB.prepare(`DELETE FROM social_follow WHERE id = ?1`).bind(f.id).run();
      return json({ ok: true });
    }
    if (path === '/api/social/pull' && m === 'POST') {
      if (cs) return json({ error: 'The daily pull runs on its own.' }, 403);
      const act = String(body.act || '');
      const fs = (await env.DB.prepare(`SELECT * FROM social_follow WHERE act_id = ?1 ORDER BY COALESCE(pulled_at, '') LIMIT 12`).bind(act).all()).results || [];
      const ran = [];
      for (const f of fs) ran.push(await pullFollow(env, f).catch(e => ({ follow: f.id, error: e.message })));
      waitUntil?.(tagPosts(env, act).catch(() => {}));
      return json({ ok: true, pulled: ran });
    }
    /* The raw ScrapeCreators answer for one call (team only; to check field names when a platform changes). */
    if (path === '/api/social/raw' && m === 'GET') {
      if (cs) return json({ error: 'forbidden' }, 403);
      const p = url.searchParams.get('path') || '';
      if (!/^\/v[0-9]\/(instagram|tiktok|youtube)\/[a-z/-]+$/.test(p)) return json({ error: 'path like /v1/instagram/user/reels' }, 400);
      const params = Object.fromEntries([...url.searchParams].filter(([k2]) => k2 !== 'path'));
      return json(await sc(env, p, params, null));
    }
    if (path === '/api/social/tag' && m === 'POST') {
      if (cs) return json({ error: 'forbidden' }, 403);
      return json(await tagPosts(env, body.act || null));
    }
    if (path === '/api/social/save' && m === 'POST') {
      const p = await postOf(body.id);
      if (!p) return json({ error: 'That post is gone.' }, 404);
      await env.DB.prepare(`UPDATE social_post SET saved = ?2 WHERE id = ?1`).bind(p.id, body.saved ? 1 : 0).run();
      return json({ ok: true, saved: !!body.saved });
    }
    if (path === '/api/social/video' && m === 'POST') {
      const p = await postOf(body.id);
      if (!p) return json({ error: 'That post is gone.' }, 404);
      return json(await videoOf(env, p));
    }
    if (path === '/api/social/make' && m === 'POST') {
      if (cs) return json({ error: 'Make ours is run by the Mobius team for now. Save the post and tell us in Requests.' }, 403);
      const p = await postOf(body.id);
      if (!p) return json({ error: 'That post is gone.' }, 404);
      if (p.idea_id) {
        const st = await ideaState(env, p.idea_id);
        if (st && st.status === 'failed') { await ideaRetry(env, p.idea_id); return json({ ok: true, idea_id: p.idea_id, state: await ideaState(env, p.idea_id) }); }
        if (st) return json({ ok: true, idea_id: p.idea_id, state: st });
      }
      const label = `${FMTS[p.fmt] || 'post'} from ${p.handle ? `@${p.handle}` : 'another brand'} on ${PLATS[p.plat]}`;
      const stats = [p.views != null ? `${p.views.toLocaleString('en-US')} views` : null, p.likes != null ? `${p.likes.toLocaleString('en-US')} likes` : null].filter(Boolean).join(', ');
      const note = [clip(body.note, 500), stats ? `(${stats})` : ''].filter(Boolean).join(' ');
      const thumb = p.thumb ? `${SELF}/social-m/${p.thumb}` : p.thumb_src;
      const r = await ideaFromLocus(env, { act: p.act_id, url: p.url, image: thumb, note, who, label: label.toLowerCase() });
      await env.DB.prepare(`UPDATE social_post SET idea_id = ?2, saved = 1 WHERE id = ?1`).bind(p.id, r.id).run();
      return json({ ok: true, idea_id: r.id, state: await ideaState(env, r.id) });
    }
    if (path === '/api/social/idea' && m === 'GET') {
      const p = await postOf(url.searchParams.get('id'));
      if (!p?.idea_id) return json({ state: null });
      return json({ state: await ideaState(env, p.idea_id) });
    }
    if (path === '/api/social/push' && m === 'POST') {
      if (cs) return json({ error: 'The Mobius team sends drafts on.' }, 403);
      const p = await postOf(body.id);
      if (!p?.idea_id) return json({ error: 'Make ours first.' }, 400);
      const r = await pushIdea(env, p.idea_id, String(body.dest || ''), who);
      return json({ ...r, state: await ideaState(env, p.idea_id) }, r.ok === false ? 400 : 200);
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.plain ? e.message : `That did not work: ${clip(e.message, 300)}` }, e.status && e.status < 500 ? 400 : 500);
  }
}
