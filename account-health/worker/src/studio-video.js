/* Studio "Make video" (2026-10-01): an approved static ad becomes an 8-second 9:16 motion ad on
 * Google's Veo 3.1 (the Gemini API key this worker already has for the ideas bot). Factory 1, step 1
 * of the AI-video plan: animate what already won, never invent a new product shot.
 *
 *   POST /api/studio-ai/animate   {act, ad_id, image (9:16 data URL the browser composed), motion, quality}
 *                                 starts a Veo job, stores a `working` row. Returns {video}.
 *   POST /api/studio-ai/videos    {act} the brand's videos; each `working` row is polled once
 *                                 (Veo is a long-running operation) and, when done, the mp4 is copied
 *                                 into R2 (mobius-amb-media, studio/vid/<id>.mp4). Returns {videos}.
 *   POST /api/studio-ai/video-delete {act, id}
 *   GET  /studio-vid/<id>.mp4     PUBLIC (the id is 24 random hex), Range-aware so phones can play it.
 *
 * The browser makes the 9:16 frame (the 4:5 ad centred on a blurred copy of itself), because a
 * Worker has no canvas. No Claude call: the motion prompt is a fixed template plus the team's words,
 * so the only cost is Veo's per-second price.
 */
const VEO = 'https://generativelanguage.googleapis.com/v1beta';
export const VIDEO_MODELS = {
  fast: { id: 'veo-3.1-fast-generate-preview', perSec: 0.15, label: 'Best' },
  lite: { id: 'veo-3.1-lite-generate-preview', perSec: 0.05, label: 'Draft' },
};
const SECONDS = 8;
const MOTIONS = {
  push: 'a slow, smooth camera push-in toward the product',
  light: 'a soft sweep of light gliding across the product and background',
  alive: 'the background comes gently alive (natural movement such as drifting light, leaves, water, steam or fabric, whatever fits the scene) while the product stays still',
  orbit: 'a slow, slight camera arc around the product, as if on a turntable shot',
};
export const MOTION_KEYS = Object.keys(MOTIONS);

const hex24 = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
const clip = (s, n) => String(s || '').slice(0, n);
let ready = false;
async function ensure(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_studio_vid (
    id TEXT PRIMARY KEY, act_id TEXT NOT NULL, ad_id TEXT NOT NULL, status TEXT NOT NULL,
    op TEXT, model TEXT, motion TEXT, note TEXT, seconds INTEGER, cost REAL NOT NULL DEFAULT 0,
    file_key TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_studio_vid_act ON p_studio_vid (act_id, created_at)`).run();
  ready = true;
}

export function videoPrompt(motion, note) {
  return [
    'Animate this static image ad into a short, premium vertical video ad.',
    `Motion: ${MOTIONS[motion] || MOTIONS.push}.`,
    note ? `Also: ${clip(note, 400)}.` : '',
    'Keep every word, number, logo and button exactly as it is, sharp and readable, in the same place: no new text, no changed letters, no flicker on the text.',
    'Keep the product exactly as it is: same shape, colours, labels and proportions, no morphing, no extra copies.',
    'The soft blurred bands at the top and bottom are background: keep them soft.',
    'One continuous shot, smooth and steady, no cuts, no new people, no new objects. Subtle, calm ambient sound.',
  ].filter(Boolean).join(' ');
}

const veoErr = async res => {
  const j = await res.json().catch(() => ({}));
  const m = j?.error?.message || `Veo answered ${res.status}`;
  if (res.status === 429 || /quota|billing|free tier/i.test(m)) return `Google refused the video: ${m} (Veo needs billing turned on for the Google project that owns the Gemini key).`;
  return `Google refused the video: ${m}`;
};

export async function startVideo(env, act, b) {
  await ensure(env);
  if (!env.GEMINI_API_KEY) throw new Error('Video needs the Gemini key on the account-health worker (GEMINI_API_KEY).');
  const ad = await env.DB.prepare(`SELECT id, act_id FROM p_studio_ad WHERE id = ?1 AND act_id = ?2`).bind(String(b.ad_id || ''), act).first();
  if (!ad) throw new Error('That ad is not in this brand.');
  const m = String(b.image || '').match(/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/);
  if (!m) throw new Error('The 9:16 frame did not come through. Try again.');
  if (m[2].length > 9e6) throw new Error('That frame is too big.');
  const quality = VIDEO_MODELS[b.quality] ? b.quality : 'fast';
  const M = VIDEO_MODELS[quality];
  const motion = MOTIONS[b.motion] ? b.motion : 'push';
  const note = clip(b.note, 400).trim();
  const res = await fetch(`${VEO}/models/${M.id}:predictLongRunning`, {
    method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: videoPrompt(motion, note), image: { inlineData: { mimeType: m[1], data: m[2] } } }],
      parameters: { aspectRatio: '9:16', durationSeconds: String(SECONDS), resolution: '720p', personGeneration: 'allow_adult' },
    }),
  });
  if (!res.ok) throw new Error(await veoErr(res));
  const op = (await res.json().catch(() => ({}))).name;
  if (!op) throw new Error('Google did not start the video. Try again.');
  const id = hex24();
  await env.DB.prepare(`INSERT INTO p_studio_vid (id, act_id, ad_id, status, op, model, motion, note, seconds, cost) VALUES (?1, ?2, ?3, 'working', ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(id, act, ad.id, op, M.id, motion, note, SECONDS, Math.round(M.perSec * SECONDS * 100) / 100).run();
  return { video: shapeVid(await env.DB.prepare(`SELECT * FROM p_studio_vid WHERE id = ?1`).bind(id).first(), env) };
}

function shapeVid(r, env, origin = '') {
  return { id: r.id, ad_id: r.ad_id, status: r.status, motion: r.motion, note: r.note || '', model: r.model, cost: r.cost,
    error: r.error || '', created_at: r.created_at, url: r.status === 'ready' ? `${origin || env.PUBLIC_ORIGIN || 'https://mobius-account-health.mobius-digital.workers.dev'}/studio-vid/${r.id}.mp4` : null };
}

/* One poll of a working row. Done = copy the mp4 into R2 (Veo's file link needs the key and expires). */
async function poll(env, r) {
  const res = await fetch(`${VEO}/${r.op}`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
  if (!res.ok) {
    if (res.status === 404) return fail(env, r, 'Google lost this video. Make it again.');
    return; /* transient: try again on the next look */
  }
  const o = await res.json().catch(() => null);
  if (!o?.done) {
    /* Veo takes a minute or two; anything stuck for 20 minutes is called failed. */
    if (Date.now() - Date.parse(r.created_at.replace(' ', 'T') + 'Z') > 20 * 60e3) return fail(env, r, 'Google took too long. Make it again.');
    return;
  }
  if (o.error) return fail(env, r, `Google could not make it: ${o.error.message || 'unknown error'}`);
  const g = o.response?.generateVideoResponse || {};
  const uri = g.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const why = g.raiFilteredReasons?.[0] || (g.raiMediaFilteredCount ? 'Google\'s safety filter blocked it' : 'no video came back');
    return fail(env, r, `Google could not make it: ${why}. Try a different motion or ad.`);
  }
  const file = await fetch(uri, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, redirect: 'follow' });
  if (!file.ok) return; /* try the download again next time */
  const key = `studio/vid/${r.id}.mp4`;
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: 'video/mp4' } });
  await env.DB.prepare(`UPDATE p_studio_vid SET status = 'ready', file_key = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(r.id, key).run();
  /* The spend lands on the ad, so Studio's monthly total includes video. */
  await env.DB.prepare(`UPDATE p_studio_ad SET cost = cost + ?2 WHERE id = ?1`).bind(r.ad_id, r.cost || 0).run().catch(() => {});
}
async function fail(env, r, msg) {
  await env.DB.prepare(`UPDATE p_studio_vid SET status = 'failed', error = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(r.id, clip(msg, 400)).run();
}

export async function listVideos(env, act, origin) {
  await ensure(env);
  const rows = (await env.DB.prepare(`SELECT * FROM p_studio_vid WHERE act_id = ?1 AND status != 'deleted' ORDER BY created_at DESC LIMIT 200`).bind(act).all()).results || [];
  const working = rows.filter(r => r.status === 'working').slice(0, 6);
  if (working.length && env.GEMINI_API_KEY && env.MEDIA) {
    await Promise.all(working.map(r => poll(env, r).catch(() => {})));
    const ids = working.map(r => r.id);
    for (const id of ids) {
      const fresh = await env.DB.prepare(`SELECT * FROM p_studio_vid WHERE id = ?1`).bind(id).first();
      const i = rows.findIndex(x => x.id === id); if (fresh && i >= 0) rows[i] = fresh;
    }
  }
  return { videos: rows.map(r => shapeVid(r, env, origin)), higgsfield: await hfStatus(env) };
}

export async function deleteVideo(env, act, id) {
  await ensure(env);
  const r = await env.DB.prepare(`SELECT * FROM p_studio_vid WHERE id = ?1 AND act_id = ?2`).bind(String(id || ''), act).first();
  if (!r) throw new Error('Video not found.');
  if (r.file_key && env.MEDIA) await env.MEDIA.delete(r.file_key).catch(() => {});
  await env.DB.prepare(`UPDATE p_studio_vid SET status = 'deleted', updated_at = datetime('now') WHERE id = ?1`).bind(r.id).run();
  return { ok: true };
}

/* PUBLIC: the mp4, with Range support (Safari and phones will not play a video without it). */
export async function serveVideo(request, env, path) {
  const m = path.match(/^\/studio-vid\/([a-f0-9]{24})\.mp4$/);
  if (!m || request.method !== 'GET' || !env.MEDIA) return null;
  const key = `studio/vid/${m[1]}.mp4`;
  const head = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*' };
  const rg = (request.headers.get('Range') || '').match(/^bytes=(\d*)-(\d*)$/);
  if (rg) {
    const meta = await env.MEDIA.head(key);
    if (!meta) return new Response('not found', { status: 404 });
    const size = meta.size;
    let start = rg[1] === '' ? Math.max(0, size - (+rg[2] || 0)) : +rg[1];
    let end = rg[1] === '' ? size - 1 : (rg[2] === '' ? size - 1 : Math.min(+rg[2], size - 1));
    if (start > end || start >= size) return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}`, ...head } });
    const obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
    return new Response(obj.body, { status: 206, headers: { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } });
  }
  const obj = await env.MEDIA.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body, { headers: { ...head, 'Content-Length': String(obj.size) } });
}

/* ---------------- Higgsfield connection (2026-10-01) ----------------
   One workspace key, pasted by Cole in Locus Studio (never handled by anyone else). Higgsfield keys
   come as a key ID + secret (Authorization: Key <id>:<secret>); some consoles show them as one
   "id:secret" string, so either shape is accepted. Checked with the free estimate endpoint before it
   is saved; stored in p_studio_cfg 'higgsfield_key', never sent back to the browser. */
export const HF = 'https://api.higgsfield.ai';
const cfgGet = async (env, k) => (await env.DB.prepare(`SELECT value FROM p_studio_cfg WHERE key = ?1`).bind(k).first().catch(() => null))?.value || null;
/* Stored as the full Authorization value ("Key ..." or "Bearer ..."). */
export const hfAuth = async env => { const k = await cfgGet(env, 'higgsfield_key'); return !k ? null : /^(Key|Bearer) /.test(k) ? k : `Key ${k}`; };
export async function hfStatus(env) {
  const r = await env.DB.prepare(`SELECT updated_at FROM p_studio_cfg WHERE key = 'higgsfield_key'`).first().catch(() => null);
  return { connected: !!r, since: r?.updated_at || null };
}
export async function hfSave(env, b) {
  if (b.clear) { await env.DB.prepare(`DELETE FROM p_studio_cfg WHERE key = 'higgsfield_key'`).run(); return { connected: false }; }
  const key = String(b.key || '').trim(), secret = String(b.secret || '').trim();
  if (!key) throw new Error('Paste the API key.');
  if (/\s/.test(key + secret) || (key + secret).length > 500) throw new Error('That does not look like a Higgsfield key.');
  /* The console now shows ONE key (often "id:secret" inside it); older keys come as id + secret.
     Try the header shapes the API accepts and keep the first it answers to. */
  const tries = secret ? [`Key ${key}:${secret}`] : [`Key ${key}`, `Bearer ${key}`];
  let res = null, auth = null;
  for (const a of tries) {
    res = await fetch(`${HF}/estimate/higgsfield-ai/soul/v2/standard`, { method: 'POST', headers: { Authorization: a, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: 'test' }) });
    if (res.status !== 401) { auth = a; break; }
  }
  if (!auth) throw new Error('Higgsfield did not accept that key. Click Copy API key in Higgsfield and paste it again, in full.');
  if (!res.ok && res.status !== 403 && res.status !== 404 && res.status !== 422) throw new Error(`Higgsfield answered ${res.status}. Try again in a minute.`);
  await env.DB.prepare(`INSERT INTO p_studio_cfg (key, value, updated_at) VALUES ('higgsfield_key', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(auth).run();
  return { connected: true, credits_note: res.status === 403 ? 'Connected, but the API account has no credits yet. Add credits under Billing at cloud.higgsfield.ai.' : '' };
}
