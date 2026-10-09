/**
 * CREATIVE ANALYTICS, the Motion layer (2026-10-09, Cole: "ideally this would replace Motion").
 *
 * 1. COVERS LIVE IN R2, NOT IN D1. Every ad card used to carry its image as a base64 string inside the
 *    `ad_creative` JSON (55MB of the database) and inside every API answer, so nothing could be cached by
 *    the browser and a 1MB static was simply dropped. Now each cover is fetched from Meta once, shrunk to
 *    600px wide WebP by the Images binding (about 40KB), stored at `cov/<ad_id>.webp` in mobius-amb-media,
 *    and served by `/cover/<ad_id>.<sig>.webp` with a one-year immutable cache. The URL is signed (HMAC of
 *    the ad id) so nobody can walk ad ids. Reports freeze the URL, so they shrink too; we never delete covers.
 * 2. ONE CREATIVE, MANY ADS. `ads.asset_key` = `v:<video id>`, `i:<image hash>`, or `c:<creative id>`
 *    (carousels and anything else). The same video in four ad sets rolls up into one card.
 * 3. AI TAGS PER CREATIVE (`ad_tag`, one row per asset key): Claude Haiku looks at the cover and reads the
 *    copy once, about a fifth of a cent. Format, hook, who is on screen, product shown, message, offer.
 * 4. BREAKDOWNS on demand (`/api/ad-breakdown`): placement and age x gender for one ad, cached a day.
 * The hourly `creativeTick` keeps keys, covers and tags filled for every ad that spent in the last 14 days,
 * so the Creative page never waits on Meta.
 */
let F = fetch;
export function useFetch(f) { F = f; }
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const PUBLIC = env => env.AH_PUBLIC || 'https://mobius-account-health.mobius-digital.workers.dev';
const TAG_MODEL = 'claude-haiku-4-5-20251001';
let tabled = false;

export async function ensureCreative(env) {
  if (tabled) return;
  await env.DB.prepare(`ALTER TABLE ads ADD COLUMN asset_key TEXT`).run().catch(() => {});
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS ads_asset ON ads (asset_key)`).run().catch(() => {});
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ad_tag (asset_key TEXT PRIMARY KEY, act_id TEXT, media_type TEXT, tags_json TEXT, model TEXT, cost REAL, tagged_at TEXT, err TEXT)`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS ad_tag_act ON ad_tag (act_id)`).run().catch(() => {});
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS ad_breakdown (k TEXT PRIMARY KEY, json TEXT, fetched_at TEXT)`).run();
  tabled = true;
}

/* ---------- covers ---------- */
async function sig(env, adId) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET || env.ADMIN_TOKEN || 'dev'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`cover:${adId}`)));
  return [...mac.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function coverUrl(env, adId, ver) { return `${PUBLIC(env)}/cover/${adId}.${await sig(env, adId)}.webp${ver ? `?v=${ver}` : ''}`; }

/** Shrink (when the Images binding is there) and store one cover. Returns its public URL, or null. */
export async function putCover(env, adId, buf, type) {
  if (!env.MEDIA) return null;
  let body = buf, ct = type || 'image/jpeg';
  if (env.IMAGES) {
    try {
      const r = (await env.IMAGES.input(new Response(buf).body).transform({ width: 600, fit: 'scale-down' }).output({ format: 'image/webp', quality: 80 })).response();
      const out = await r.arrayBuffer();
      if (out.byteLength > 0 && out.byteLength < buf.byteLength) { body = out; ct = 'image/webp'; }
    } catch { /* keep the original: a cover that is a little big beats no cover */ }
  }
  await env.MEDIA.put(`cov/${adId}.webp`, body, { httpMetadata: { contentType: ct } });
  return coverUrl(env, adId, Date.now().toString(36));
}

/** Public: /cover/<ad_id>.<sig>.webp */
export async function serveCover(env, path) {
  const m = /^\/cover\/(\d{6,25})\.([a-f0-9]{16})\.webp$/.exec(path);
  if (!m || !env.MEDIA || m[2] !== await sig(env, m[1])) return new Response('not found', { status: 404 });
  const obj = await env.MEDIA.get(`cov/${m[1]}.webp`);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' } });
}

/* ---------- one creative, many ads ---------- */
export function assetKeyOf(c) {
  if (!c) return null;
  const kids = c.object_story_spec?.link_data?.child_attachments;
  if ((Array.isArray(kids) && kids.length > 1) || c.object_type === 'CAROUSEL') return c.id ? `c:${c.id}` : null;
  const vid = c.video_id || c.object_story_spec?.video_data?.video_id || c.asset_feed_spec?.videos?.[0]?.video_id;
  if (vid) return `v:${vid}`;
  const hash = c.image_hash || c.object_story_spec?.link_data?.image_hash || c.asset_feed_spec?.images?.[0]?.hash;
  if (hash) return `i:${hash}`;
  return c.id ? `c:${c.id}` : null;
}

/* ---------- AI tags ---------- */
const TAG_SYSTEM = `You tag one paid social ad (Meta) for a creative analytics tool. You see its cover image (for a video, the first frame Meta shows) and read its copy. Answer with JSON only:
{"format": "UGC talking head" | "UGC demo" | "founder or team" | "product demo" | "studio product shot" | "lifestyle photo" | "graphic or text-led" | "testimonial or review" | "before and after" | "comparison" | "meme or skit" | "unboxing" | "carousel of products" | "other",
 "hook": "question" | "bold claim" | "problem or pain" | "result or proof" | "offer or price" | "curiosity" | "social proof" | "how-to" | "news or launch" | "other",
 "person": "none" | "hands only" | "face" | "several people",
 "product": "hero" | "in use" | "in background" | "not shown",
 "text_on_image": "none" | "light" | "heavy",
 "offer": "none" | "discount" | "free shipping" | "bundle or gift" | "limited time",
 "message": "the main benefit or argument in 2 to 5 plain words, e.g. 'fresher breath fast'",
 "notes": "one plain sentence on what stands out visually"}
Pick the closest value; never invent a new one except in message and notes. No em dashes.`;

async function tagOne(env, row) {
  const parts = [];
  /* The cover's bytes from R2, not its URL: Anthropic could not download 99 of 150 links on the first run. */
  if (row.img) parts.push({ type: 'image', source: { type: 'base64', media_type: row.img.type, data: row.img.b64 } });
  parts.push({ type: 'text', text: `Brand: ${row.brand || ''}. Media: ${row.media_type || 'unknown'}.${row.duration ? ` Video length ${Math.round(row.duration)}s.` : ''}\nHeadline: ${row.headline || '(none)'}\nPrimary text: ${String(row.body || '(none)').slice(0, 1200)}\nAd name: ${row.name || ''}` });
  const res = await F('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: TAG_MODEL, max_tokens: 400, system: TAG_SYSTEM, messages: [{ role: 'user', content: parts }] }) });
  const j = await res.json(); if (!res.ok) throw new Error(j.error?.message || `Claude ${res.status}`);
  const txt = (j.content || []).map(c => c.text || '').join(''); const t = safeJson((txt.match(/\{[\s\S]*\}/) || [])[0], null);
  if (!t) throw new Error('no tags');
  for (const k of Object.keys(t)) if (typeof t[k] === 'string') t[k] = t[k].replace(/—/g, ',').slice(0, 160);
  return { tags: t, cost: (j.usage?.input_tokens || 0) / 1e6 * 1 + (j.usage?.output_tokens || 0) / 1e6 * 5 };
}

/**
 * The hourly pass. `thumbs(ids)` is the worker's adThumbnails with live limits (it writes ad_creative,
 * the cover to R2 and ads.asset_key). `canAfford()` is the subrequest guard.
 */
export async function creativeTick(env, thumbs, canAfford = () => true, { perBrand = 30, tags = 40, meta = null } = {}) {
  await ensureCreative(env);
  const keyed = meta ? await keyTick(env, meta, canAfford).catch(e => ({ error: e.message })) : null;
  const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
  const stale = new Date(Date.now() - 13 * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  /* Ads that spent lately and have no fresh card (no row, an old row, a row with no cover or a Meta link
     instead of our own copy, or no asset key yet), biggest spenders first. */
  const { results: need } = await env.DB.prepare(`SELECT d.ad_id, x.act_id, SUM(d.spend) s FROM ad_daily d JOIN ads x ON x.ad_id = d.ad_id
      LEFT JOIN ad_creative c ON c.ad_id = d.ad_id
    WHERE d.date >= ?1 AND d.spend > 0 AND (c.ad_id IS NULL OR c.fetched_at < ?2
      OR (instr(c.json, '"thumb":"data:') > 0 OR instr(c.json, '"thumb":"https://scontent') > 0 OR instr(c.json, '"thumb":"https://external') > 0)
      OR (instr(c.json, '"thumb":null') > 0 AND c.fetched_at < ?3))
    GROUP BY d.ad_id ORDER BY s DESC LIMIT 300`).bind(since, stale, new Date(Date.now() - 864e5).toISOString().slice(0, 19).replace('T', ' ')).all().catch(() => ({ results: [] }));
  const byAct = {};
  for (const r of need || []) (byAct[r.act_id] ||= []).push(r.ad_id);
  let covered = 0;
  for (const ids of Object.values(byAct)) {
    for (let i = 0; i < Math.min(ids.length, perBrand); i += 10) {
      if (!canAfford()) return { covered, stopped: 'budget' };
      const got = await thumbs(ids.slice(i, i + 10)).catch(() => ({}));
      covered += Object.values(got).filter(v => v && v.thumb).length;
    }
  }
  const tagged = await tagTick(env, tags, canAfford).catch(e => ({ error: e.message }));
  return { keyed, covered, waiting: (need || []).length, tagged };
}

/** One-creative keys for every ad that spent in the last 60 days and has none: the account's ads edge,
 *  25 ads a call (asset_feed_spec is big; Meta refuses large pages of it). */
export async function keyTick(env, meta, canAfford = () => true, cap = 600) {
  await ensureCreative(env);
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(`SELECT x.act_id, x.ad_id FROM ads x WHERE x.asset_key IS NULL
    AND x.ad_id IN (SELECT ad_id FROM ad_daily WHERE date >= ?1 AND spend > 0) LIMIT ?2`).bind(since, cap).all().catch(() => ({ results: [] }));
  const byAct = {}; for (const r of results || []) (byAct[r.act_id] ||= []).push(r.ad_id);
  let wrote = 0, err = null;
  for (const [act, ids] of Object.entries(byAct)) {
    for (let i = 0; i < ids.length; i += 25) {
      if (!canAfford()) return { wrote, stopped: 'budget' };
      const chunk = ids.slice(i, i + 25);
      try {
        const r = await meta(env, `${act}/ads`, { fields: 'id,creative{id,object_type,video_id,image_hash,object_story_spec,asset_feed_spec}', filtering: [{ field: 'ad.id', operator: 'IN', value: chunk }], limit: 25 });
        const st = (r?.data || []).map(ad => [ad.id, assetKeyOf(ad.creative)]).filter(x => x[1]).map(([id, k]) => env.DB.prepare(`UPDATE ads SET asset_key = ?2 WHERE ad_id = ?1`).bind(id, k));
        if (st.length) { await env.DB.batch(st); wrote += st.length; }
      } catch (e) { err = err || String(e.message || e).slice(0, 200); }
    }
  }
  return { wrote, waiting: (results || []).length, error: err };
}

/** Tag creatives (by asset key) that spent in the last 30 days and have no tags. */
export async function tagTick(env, limit = 40, canAfford = () => true, act = null) {
  await ensureCreative(env);
  if (!env.ANTHROPIC_API_KEY) return { error: 'ANTHROPIC_API_KEY not set' };
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(`SELECT x.asset_key, x.act_id, MIN(x.ad_id) ad_id, MAX(x.name) name, MAX(x.media_type) media_type, SUM(d.spend) s
    FROM ads x JOIN ad_daily d ON d.ad_id = x.ad_id LEFT JOIN ad_tag t ON t.asset_key = x.asset_key
    WHERE x.asset_key IS NOT NULL AND (t.asset_key IS NULL OR (t.tags_json IS NULL AND t.tagged_at < ?4)) AND d.date >= ?1 AND d.spend > 0 AND (?3 = '' OR x.act_id = ?3)
    GROUP BY x.asset_key ORDER BY s DESC LIMIT ?2`).bind(since, limit, act || '', new Date(Date.now() - 864e5).toISOString()).all().catch(() => ({ results: [] }));
  let done = 0, failed = 0, cost = 0;
  for (const r of results || []) {
    if (!canAfford()) break;
    const c = safeJson((await env.DB.prepare(`SELECT json FROM ad_creative WHERE ad_id = ?1`).bind(r.ad_id).first().catch(() => null))?.json, null);
    if (!c || !c.thumb) continue;                      // no cover yet: the next tick tries again
    const obj = env.MEDIA ? await env.MEDIA.get(`cov/${r.ad_id}.webp`).catch(() => null) : null;
    if (!obj) continue;                                 // cover not in R2 yet: creativeTick stores it first
    const u8 = new Uint8Array(await obj.arrayBuffer()); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    const img = { b64: btoa(bin), type: (obj.httpMetadata?.contentType || 'image/webp').split(';')[0] };
    const brand = (await env.DB.prepare(`SELECT name FROM accounts WHERE act_id = ?1`).bind(r.act_id).first().catch(() => null))?.name;
    try {
      const t = await tagOne(env, { ...c, img, name: r.name, media_type: c.media_type || r.media_type, brand });
      cost += t.cost; done++;
      await env.DB.prepare(`INSERT OR REPLACE INTO ad_tag (asset_key, act_id, media_type, tags_json, model, cost, tagged_at, err) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)`)
        .bind(r.asset_key, r.act_id, c.media_type || r.media_type || null, JSON.stringify(t.tags), TAG_MODEL, t.cost, new Date().toISOString()).run();
    } catch (e) {
      failed++;
      await env.DB.prepare(`INSERT OR REPLACE INTO ad_tag (asset_key, act_id, media_type, tags_json, model, cost, tagged_at, err) VALUES (?1, ?2, ?3, NULL, ?4, 0, ?5, ?6)`)
        .bind(r.asset_key, r.act_id, c.media_type || null, TAG_MODEL, new Date().toISOString(), String(e.message || e).slice(0, 200)).run().catch(() => {});
    }
  }
  return { tagged: done, failed, cost: Math.round(cost * 10000) / 10000 };
}

/* ---------- breakdowns ---------- */
const BRK_FIELDS = 'spend,impressions,inline_link_clicks,actions,video_play_actions,cpm';
const purchasesOf = acts => { for (const t of ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase']) { const a = (acts || []).find(x => x.action_type === t); if (a) return +a.value || 0; } return 0; };
const v3Of = r => +((r.actions || []).find(a => a.action_type === 'video_view') || {}).value || 0;
const shape = (rows, keyOf) => (rows || []).map(r => ({ key: keyOf(r), spend: +r.spend || 0, impressions: +r.impressions || 0, clicks: +r.inline_link_clicks || 0, meta_purchases: purchasesOf(r.actions), v3: v3Of(r) }))
  .filter(x => x.spend > 0 || x.impressions > 0).sort((a, b) => b.spend - a.spend);
const POS = { feed: 'Feed', facebook_reels: 'Reels', instagram_reels: 'Reels', instagram_stories: 'Stories', facebook_stories: 'Stories', story: 'Stories', reels: 'Reels', marketplace: 'Marketplace', video_feeds: 'Video feeds', explore: 'Explore', explore_home: 'Explore', search: 'Search', instream_video: 'In-stream', an_classic: 'Audience Network', right_hand_column: 'Right column', instagram_profile_feed: 'Profile feed', facebook_profile_feed: 'Profile feed', threads_feed: 'Threads' };
const PLAT = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads' };

export async function adBreakdown(env, meta, adId, from, to) {
  await ensureCreative(env);
  const k = `${adId}:${from}:${to}`;
  const hit = await env.DB.prepare(`SELECT json, fetched_at FROM ad_breakdown WHERE k = ?1`).bind(k).first().catch(() => null);
  if (hit && Date.now() - Date.parse(hit.fetched_at) < 864e5) return { ...safeJson(hit.json, {}), cached: true };
  const tr = JSON.stringify({ since: from, until: to });
  const [pl, ag] = await Promise.all([
    meta(env, `${adId}/insights`, { fields: BRK_FIELDS, breakdowns: 'publisher_platform,platform_position', time_range: tr, limit: 100 }).catch(e => ({ error: e.message })),
    meta(env, `${adId}/insights`, { fields: BRK_FIELDS, breakdowns: 'age,gender', time_range: tr, limit: 100 }).catch(e => ({ error: e.message })),
  ]);
  const out = {
    placements: shape(pl.data, r => `${PLAT[r.publisher_platform] || r.publisher_platform} ${POS[r.platform_position] || String(r.platform_position || '').replace(/_/g, ' ')}`.trim()),
    people: shape(ag.data, r => `${r.gender === 'female' ? 'Women' : r.gender === 'male' ? 'Men' : 'Unknown'} ${r.age}`),
    error: pl.error || ag.error || null,
  };
  // Merge placement rows that read the same once named (e.g. two kinds of Facebook Reels).
  const merge = list => Object.values(list.reduce((m, x) => { const o = m[x.key] ||= { key: x.key, spend: 0, impressions: 0, clicks: 0, meta_purchases: 0, v3: 0 }; for (const f of ['spend', 'impressions', 'clicks', 'meta_purchases', 'v3']) o[f] += x[f]; return m; }, {})).sort((a, b) => b.spend - a.spend);
  out.placements = merge(out.placements);
  if (!out.error) await env.DB.prepare(`INSERT OR REPLACE INTO ad_breakdown (k, json, fetched_at) VALUES (?1, ?2, ?3)`).bind(k, JSON.stringify(out), new Date().toISOString()).run().catch(() => {});
  await env.DB.prepare(`DELETE FROM ad_breakdown WHERE fetched_at < ?1`).bind(new Date(Date.now() - 7 * 864e5).toISOString()).run().catch(() => {});
  return out;
}

/** The ad's full image for Studio (a static's original, or a video's biggest frame), shrunk to Studio's
 *  1568px and sent straight back with CORS. Nothing is stored: Studio keeps its own copy. */
export async function adOriginal(env, meta, adId) {
  const r = await meta(env, `${adId}/adcreatives`, { fields: 'image_url,thumbnail_url,video_id,object_story_spec,asset_feed_spec', thumbnail_width: 1080, thumbnail_height: 1080, limit: 1 });
  const c = r?.data?.[0] || {};
  const vid = c.video_id || c.object_story_spec?.video_data?.video_id || c.asset_feed_spec?.videos?.[0]?.video_id;
  const urls = [];
  if (vid) { try { const v = await meta(env, vid, { fields: 'thumbnails{uri,width,height}' }); urls.push(...(v?.thumbnails?.data || []).sort((a, b) => (b.width || 0) - (a.width || 0)).map(t => t.uri)); } catch {} }
  urls.push(c.image_url, c.thumbnail_url);
  for (const u of urls.filter(Boolean)) {
    const img = await F(u); if (!img.ok) continue;
    const buf = await img.arrayBuffer();
    let body = buf, ct = img.headers.get('content-type') || 'image/jpeg';
    if (env.IMAGES) { try { const t = (await env.IMAGES.input(new Response(buf).body).transform({ width: 1568, height: 1568, fit: 'scale-down' }).output({ format: 'image/jpeg', quality: 90 })).response(); body = await t.arrayBuffer(); ct = 'image/jpeg'; } catch {} }
    return new Response(body, { headers: { 'Content-Type': ct, 'Cache-Control': 'private, max-age=600', 'Access-Control-Allow-Origin': '*' } });
  }
  return new Response(JSON.stringify({ error: 'Meta gave no image for this ad.' }), { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
}
