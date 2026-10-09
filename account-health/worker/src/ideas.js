/**
 * THE IDEAS BOT (2026-09-29): an idea in Slack becomes a draft brief.
 *
 * The team drops an idea in a brand's INTERNAL channel (#grunk-internal, #dartee-internal;
 * clients are never in those): a TikTok / Reel / Short link, an uploaded clip or image, or
 * just a typed idea, plus notes ("works as is", "love the style", "just the hook"). They talk
 * in the thread. When someone tags @Mobius Digital in it, this reads the WHOLE thread and
 * replies in the thread with a teardown, a transfer call and a draft for every place the idea
 * could go (creator link, Lucky creator app, Asana brief, Studio), with buttons to send it on.
 * Untagged chat costs nothing: no event reaches a model until someone tags the bot.
 *
 * COST FIRST. Every video is watched ONCE (Gemini Flash-Lite, facts only) and the breakdown
 * is cached in `idea_media` by video id, so a re-tag or a Redo never re-watches. The thinking
 * is one Claude call per tag with the brand brain in a cached system block. Each run's tokens
 * and dollars land in `idea_run`, and the card shows what the run cost.
 *
 * Slow work runs on the Cloudflare Queue `mobius-ideas` (binding IDEA_Q), because waitUntil
 * after a response only lives ~30 seconds and a watched video plus an Opus draft takes longer.
 * Without the binding (tests, local) the job runs inline.
 *
 * Secrets: GEMINI_API_KEY (video), DOWNLOADER_KEY (ScrapeCreators, TikTok + Instagram). Both
 * are optional: without them the bot says so in the thread and asks for the file instead.
 * IDEA_APPROVERS (comma list of Slack user ids) may press the destination buttons; anyone can tag.
 *
 * ATRIA (2026-09-29): an Atria ad link (app.tryatria.com/ad/m<id>) or a Meta Ad Library link
 * (facebook.com/ads/library/?id=<id>, read as Atria id "m<id>") works like a video or image.
 * atria.js fetches the ad over Atria's MCP server (one workspace-wide OAuth connection, made in
 * Locus Studio, Connect Atria): the public MP4 goes to Gemini like an upload, an image ad goes
 * to Claude like an image, and the ad's text (advertiser, copy, CTA, landing page, days running,
 * transcript, creative tags) rides in the breakdown. Cached per ad in idea_media as `atria:<id>`.
 *
 * FOCUSED BRAIN + BLIND COMPARE (2026-09-29, Cole: about $0.06 a draft and NOT worse). Before the
 * draft, one tiny Sonnet call (pickLines) picks the product line the idea is about; the brain is then
 * built FOCUSED on that line (brain.js: everything brand-wide at full depth, that line's personas,
 * quotes, market and tests at full depth, other lines one line each). The pick is cached on the
 * thread (idea_thread.lines_json) so a re-tag, Redo or Make reuses it unless the new words name
 * another line. "compare" in the tag writes the SAME prompt with Sonnet 5.5 and Opus 5.5 and posts
 * them as Version A and Version B in random order, with no model, no cost and no buttons; the
 * mapping is in idea_run (kind compare_A / compare_B, model, cost, card_ts).
 *
 * SIMPLIFICATION (2026-09-30, Cole's notes on the first real drafts):
 *   - The card is MINIMAL: one bold line (brand, who, destination), the idea in about four short
 *     lines, a Section dropdown (creator link only; the choice lands on idea_thread.section_pick,
 *     no model call) and the buttons. The full teardown + draft is one press away (Details, a
 *     threaded reply). The stored draft keeps everything; only the default view shrank.
 *   - The creator-link draft has HARD CAPS (a creator reads it on a phone): title 6 words, pitch
 *     25, who 15, exactly 2 openers of 18, up to 3 shots of 20, on-screen 3 lines, do / don't 3
 *     items of 10, chips 3 words, proof note one sentence. Asked for in the prompt AND clamped in
 *     clampCreator() before the draft is stored or pushed.
 *   - The reference PLAYS on the public link: an Atria mp4, a Slack upload or a downloaded
 *     TikTok / Instagram file is streamed into R2 `mobius-amb-media` (binding MEDIA, the same
 *     bucket Locus's Ambassadors tab uploads to, 95MB cap) when it is watched, remembered on
 *     idea_media.file_key, and the Creator link button attaches it as a `upload` proof (the kind
 *     the page plays natively) labelled "Another brand (inspiration)". YouTube stays a link. Undo
 *     deletes the proof, the R2 object (unless another proof still uses it) and forgets the key so
 *     the next tag stores it again.
 *
 * LUCKY CREATOR APP (2026-09-30): on Lucky Golf the "Lucky creator app" button files the same draft into
 * LuckyGolfCo/lucky-golf-creators (Supabase) over PostgREST + Storage REST with the service key: a live
 * `angles` row in the picked `angle_sections` row (the dropdown lists the APP's sections on Lucky), the
 * reference as `angle_examples` (owner 'brand' = Inspiration; the link, and the R2 clip uploaded to the
 * app's `creative` bucket so it plays on the angle page). Undo takes all of it back. Without
 * LUCKY_SUPABASE_URL + LUCKY_SUPABASE_SERVICE_KEY the button says so and stores nothing.
 */
import { claude, jsonOf, clip, safeJson } from './research.js';
import { brandBrain, brainBlock, SPECIFICITY } from './brain.js';
import { asana, numOf, googleToken, BRIEF_READERS, readDoc } from './asana-brand.js';
import { atriaAd } from './atria.js';
import { storagePrefix } from './brands.js';

/* Outbound HTTP goes through the worker's metered fetch (xfetch). worker.js hands it in. */
let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

/* The video model. One constant: Gemini 3.5 Flash-Lite is Google's current stable Flash-Lite
   ($0.30 per million video tokens in, $2.50 out; a 60 second clip is roughly 18k tokens, so
   about half a cent). Swap here if Google retires it. */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI = 'https://generativelanguage.googleapis.com';
const SCRAPE = 'https://api.scrapecreators.com';
/* COST (2026-09-29, Cole: "pennies, $0.06 or less", and not worse). The first live draft on Opus 5
   with the full brain cost $0.34. 2026-09-30 blind test on the Waterboy idea: Cole picked Opus 5.5
   ("not close": sharper concept, right awareness call, grounded in quotes and losing tests), so
   OPUS 5.5 IS THE DEFAULT and "quick" in the tag = Sonnet 5.5.
   Both read the FOCUSED brain (the idea's product line at full depth, see brain.js), never a blunt trim.
   Per million tokens; write = 1.25x input (5 minute cache). Opus 5.5 always thinks (adaptive). */
export const MODELS = {
  fast: { id: 'claude-sonnet-5-5', in: 2, write: 2.5, read: 0.2, out: 10, effort: 'medium' },
  deep: { id: 'claude-opus-5-5', in: 4, write: 5, read: 0.2, out: 20, effort: 'medium' },
};
/* The line picker: the cheapest sensible call (a few hundred tokens out). */
const PICK = { ...MODELS.fast, effort: 'low', maxTokens: 2000 };
const PRICE = { ...MODELS.fast, g_in: 0.30, g_out: 2.50, download: 0.00188 };
const priceOf = (M, u = {}) => ((u.input_tokens || 0) * M.in + (u.cache_creation_input_tokens || 0) * M.write
  + (u.cache_read_input_tokens || 0) * M.read + (u.output_tokens || 0) * M.out) / 1e6;
const r4 = n => Math.round((n || 0) * 10000) / 10000;
const wantsQuick = text => /\bquick\b/i.test(String(text || ''));
const wantsCompare = text => /\bcompare\b/i.test(stripTags(text));
export const DEFAULT_APPROVERS = 'U06C37MDWD7,U06K732S4BD';   // Cole, Ahsan
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const ANGLES = 'https://tools.go-mobius-digital.com/angles/';
/* Images are read from Slack's 1024px copies (parseThread), about 1,000 tokens each, so eight is cheap. */
const MAX_VIDEOS = 3, MAX_IMAGES = 8, MAX_VIDEO_BYTES = 300e6, MAX_IMAGE_BYTES = 3.7e6;
/* A reference clip kept for the creator link: same cap as an Ambassadors-tab upload (amb.js MAX_UPLOAD).
   Up to CLIP_BUFFER_BYTES the file is read into memory first, so a storage hiccup never costs the watch. */
const MAX_CLIP_BYTES = 95 * 1024 * 1024, CLIP_BUFFER_BYTES = 30 * 1024 * 1024;
const INSPO_WHO = 'Another brand (inspiration)';
/* LUCKY GOLF'S OWN CREATOR APP (2026-09-30): LuckyGolfCo/lucky-golf-creators, Next.js + Supabase Postgres,
   creators.luckygolf.com. Its "What to shoot" page is the Locus creator link's cousin: `angle_sections` (one is
   pinned = Hot right now), `angles` (title, who, hooks[], beat_open / middle / close, product_id, format, hot,
   active) and `angle_examples` (a link or a file in the Supabase Storage bucket `creative`, owner 'brand' =
   Inspiration, "Steal the shape, not the brand"). This worker talks to it over PostgREST and the Storage REST
   API with the service-role key (LUCKY_SUPABASE_URL var + LUCKY_SUPABASE_SERVICE_KEY secret); no SDK. */
export const luckyReady = env => !!(env.LUCKY_SUPABASE_URL && env.LUCKY_SUPABASE_SERVICE_KEY);
const LUCKY_APP = env => String(env.LUCKY_CREATORS_URL || 'https://creators.luckygolf.com').replace(/\/+$/, '');
const LUCKY_BUCKET = 'creative';
const LUCKY_NOT_CONNECTED = 'Lucky creator app is not connected yet (Cole sets LUCKY_SUPABASE_URL and LUCKY_SUPABASE_SERVICE_KEY). The draft stays with this thread; press the button again once it is.';
const ACK = () => new Response('', { status: 200 });
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const hex24 = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xesc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/* No em dashes anywhere (Mobius house rule), applied to everything the model wrote. */
const nd = v => typeof v === 'string' ? v.replace(/\s*[—–]\s*/g, ', ') : Array.isArray(v) ? v.map(nd) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nd(x)])) : v;

export const DESTS = { creator_link: 'Creator link', lucky_creators: 'Lucky creator app', asana_brief: 'Asana brief', studio: 'Studio' };
/* Which draft field each destination reads. */
const DRAFT_KEY = { creator_link: 'creator_link', lucky_creators: 'creator_link', asana_brief: 'asana', studio: 'studio' };
const MODE = { as_is: 'Use it as is', style: 'Borrow the style', hook_only: 'Just the hook', mixed: 'A mix' };
const TEST_TYPE = { angle: 'angle test', concept: 'concept test', iteration: 'iteration test' };
const STUDIO_TESTING = ['concepts', 'headlines', 'visuals', 'offer', 'reviews', 'hooks', 'copy', 'format'];
const PLATFORM = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', slack: 'uploaded', atria: 'Atria', drive: 'Google Drive' };
/* A reference shown on the PUBLIC creator link must open for anyone: an Atria link needs an Atria
   login, so a Meta ad ("m" + id) goes on as its public Meta Ad Library page instead. */
export function publicRef(u) {
  const c = classifyLink(u);
  if (c?.platform !== 'atria') return u;
  const m = /^m(\d+)$/.exec(c.atria);
  return m ? `https://www.facebook.com/ads/library/?id=${m[1]}` : u;
}

/* ---------------- tables (created on first use; also in schema.sql) ---------------- */
let ready = false;
export async function ensureIdeaTables(env) {
  if (ready) return;
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS idea_media (key TEXT PRIMARY KEY, platform TEXT, url TEXT, status TEXT NOT NULL DEFAULT 'ok',
      facts_json TEXT, g_in INTEGER NOT NULL DEFAULT 0, g_out INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS idea_thread (id TEXT PRIMARY KEY, act_id TEXT, channel TEXT NOT NULL, thread_ts TEXT NOT NULL,
      reply_ts TEXT, status TEXT NOT NULL DEFAULT 'working', from_name TEXT, refs_json TEXT, draft_json TEXT, seen_ts TEXT,
      pushed_json TEXT, notes_json TEXT, runs INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, last_cost REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE TABLE IF NOT EXISTS idea_run (id TEXT PRIMARY KEY, idea_id TEXT, act_id TEXT, kind TEXT, status TEXT NOT NULL DEFAULT 'running',
      c_in INTEGER NOT NULL DEFAULT 0, c_cache_read INTEGER NOT NULL DEFAULT 0, c_cache_write INTEGER NOT NULL DEFAULT 0, c_out INTEGER NOT NULL DEFAULT 0,
      g_in INTEGER NOT NULL DEFAULT 0, g_out INTEGER NOT NULL DEFAULT 0, downloads INTEGER NOT NULL DEFAULT 0,
      videos_new INTEGER NOT NULL DEFAULT 0, videos_cached INTEGER NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, error TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')), finished_at TEXT)`,
  ]) await env.DB.prepare(sql).run();
  /* Added 2026-09-29: remembers a "deep" (Opus) thread so Redo and Make-draft stay on the same model. */
  await env.DB.prepare(`ALTER TABLE idea_thread ADD COLUMN deep INTEGER NOT NULL DEFAULT 0`).run().catch(() => {});
  /* Added 2026-09-29 (focused brain + blind compare): the cached line pick per thread, and per run the
     model, the picker's cost and (for compare cards) which Slack message the version was posted as. */
  for (const sql of [`ALTER TABLE idea_thread ADD COLUMN lines_json TEXT`, `ALTER TABLE idea_run ADD COLUMN model TEXT`,
    `ALTER TABLE idea_run ADD COLUMN pick_cost REAL NOT NULL DEFAULT 0`, `ALTER TABLE idea_run ADD COLUMN card_ts TEXT`])
    await env.DB.prepare(sql).run().catch(() => {});
  /* Added 2026-09-30 (simplification): the Section dropdown's choice, the thread's media list (so the
     Creator link button can find the clip), and per watched video the R2 copy kept for the public link. */
  for (const sql of [`ALTER TABLE idea_thread ADD COLUMN section_pick TEXT`, `ALTER TABLE idea_thread ADD COLUMN media_json TEXT`,
    `ALTER TABLE idea_media ADD COLUMN file_key TEXT`, `ALTER TABLE idea_media ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE idea_media ADD COLUMN clip TEXT`])
    await env.DB.prepare(sql).run().catch(() => {});
  ready = true;
}
export function _resetForTests() { ready = false; }

/* ---------------- Slack ---------------- */
/* Reads go form-encoded (some read methods refuse JSON bodies); writes go as JSON. */
async function slack(env, method, body, form = false) {
  if (!env.SLACK_BOT_TOKEN) return { ok: false, error: 'no_bot_token' };
  const headers = { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` };
  const init = form
    ? { method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(Object.entries(body).filter(([, v]) => v != null).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])).toString() }
    : { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
  return F(`https://slack.com/api/${method}`, init).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
}
/* Posts carry the name "Ideas" so the thread shows which brain answered (the Strategist posts as
   "Strategist"; both live in the one @Mobius Digital app). Refused by Slack = the app's own name. */
const say = async (env, channel, thread_ts, text, blocks) => {
  const params = { channel, thread_ts, text, unfurl_links: false, unfurl_media: false, ...(blocks ? { blocks } : {}) };
  const r = await slack(env, 'chat.postMessage', { ...params, username: 'Ideas', icon_emoji: ':bulb:' });
  return r?.ok === false && /missing_scope|invalid_arg|not_allowed/.test(String(r.error || '')) ? slack(env, 'chat.postMessage', params) : r;
};
const whisper = (env, channel, user, text, thread_ts) => channel && user ? slack(env, 'chat.postEphemeral', { channel, user, text, ...(thread_ts ? { thread_ts } : {}) }) : null;
/* What a Slack error means for the person reading the thread. */
function slackWhy(err) {
  if (/missing_scope/.test(err)) return 'the Slack app is missing a scope it needs (channels:history, groups:history, files:read, users:read, reactions:write)';
  if (/not_in_channel|channel_not_found/.test(err)) return 'I am not in this channel. Invite @Mobius Digital here first';
  return `Slack said ${err}`;
}

/* ---------------- reading the thread ---------------- */
/* Slack writes links as <url> or <url|label>, with & escaped. */
export function linksOf(text) {
  const out = [];
  const s = String(text || '');
  for (const m of s.matchAll(/<(https?:\/\/[^|>\s]+)(?:\|[^>]*)?>/g)) out.push(m[1].replace(/&amp;/g, '&'));
  for (const m of s.replace(/<[^>]*>/g, ' ').matchAll(/https?:\/\/[^\s<>]+/g)) out.push(m[0].replace(/&amp;/g, '&'));
  return [...new Set(out)];
}
/* A video link we can read, with a cache key that ignores tracking params. Null for any other link. */
export function classifyLink(u) {
  const url = String(u || '');
  let m = /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url);
  if (m) return { platform: 'youtube', key: `yt:${m[1]}`, url: `https://www.youtube.com/watch?v=${m[1]}`, link: url };
  if (/(^|\.|\/\/)tiktok\.com\//i.test(url)) {
    m = /\/video\/(\d{8,})/.exec(url);
    return { platform: 'tiktok', key: m ? `tt:${m[1]}` : `tt:${url.replace(/[?#].*$/, '').replace(/\/+$/, '')}`, url: url.replace(/[?#].*$/, ''), link: url };
  }
  m = /tryatria\.com\/ads?\/([A-Za-z0-9_-]{4,})/i.exec(url);
  if (m) return { platform: 'atria', key: `atria:${m[1]}`, atria: m[1], url: `https://app.tryatria.com/ad/${m[1]}`, link: url };
  m = /facebook\.com\/ads\/library\/?\?(?:[^#]*&)?id=(\d{6,})/i.exec(url);
  if (m) return { platform: 'atria', key: `atria:m${m[1]}`, atria: `m${m[1]}`, url: `https://www.facebook.com/ads/library/?id=${m[1]}`, link: url };
  m = /instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(reels?|p|tv)\/([A-Za-z0-9_-]+)/i.exec(url);
  if (m) { const kind = m[1].toLowerCase() === 'p' ? 'p' : 'reel'; return { platform: 'instagram', key: `ig:${m[2]}`, url: `https://www.instagram.com/${kind}/${m[2]}/`, link: url }; }
  /* Google Drive: a file or a whole folder. A placeholder here; expandDrive turns it into the real
     images and videos (read as Cole or Ahsan through the service account). */
  m = /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,})/.exec(url);
  if (m) return { platform: 'drive', kind: 'folder', id: m[1], key: `drive:${m[1]}`, url, link: url };
  m = /drive\.google\.com\/(?:file\/d\/|open\?(?:[^#]*&)?id=|uc\?(?:[^#]*&)?id=)([A-Za-z0-9_-]{10,})/.exec(url);
  if (m) return { platform: 'drive', kind: 'file', id: m[1], key: `drive:${m[1]}`, url, link: url };
  return null;
}

/* ---------------- Google Drive (as Cole or Ahsan, through the service account) ---------------- */
const DRIVE = 'https://www.googleapis.com/drive/v3';
const driveMediaUrl = id => `${DRIVE}/files/${id}?alt=media&supportsAllDrives=true`;
/** The first reader who can see the file, with a token and the file's metadata; null when nobody can. */
async function driveReader(env, id) {
  if (!env.GOOGLE_SA_KEY) return null;
  for (const sub of BRIEF_READERS) {
    try {
      const tok = await googleToken(env, sub);
      const r = await F(`${DRIVE}/files/${id}?fields=id,name,mimeType,size,thumbnailLink&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${tok}` } });
      if (r.ok) return { sub, tok, meta: await r.json() };
      if (r.status !== 403 && r.status !== 404) return null;
    } catch (e) { if (/Google sign-in failed/.test(e.message)) return null; }
  }
  return null;
}
async function driveList(tok, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const r = await F(`${DRIVE}/files?q=${q}&fields=files(id,name,mimeType,size,thumbnailLink)&pageSize=60&orderBy=name&supportsAllDrives=true&includeItemsFromAllDrives=true`, { headers: { Authorization: `Bearer ${tok}` } });
  const j = await r.json().catch(() => ({}));
  return r.ok ? j.files || [] : [];
}
/* Drive's own 1024px copy of an image (credentialed fetch); the original can be a 6000px camera file. */
const driveThumb = f => f.thumbnailLink ? f.thumbnailLink.replace(/=s\d+(-[a-z]+)?$/, '=s1024') : null;
/** Headers for a media fetch: Slack's bot token, a Drive token for the reader who can see it, or none. */
async function authHeaders(env, auth) {
  if (!auth) return {};
  if (auth.kind === 'slack') return { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` };
  if (auth.kind === 'drive') return { Authorization: `Bearer ${await googleToken(env, auth.sub)}` };
  return {};
}
const authOf = file => file?.drive ? { kind: 'drive', sub: file.drive } : { kind: 'slack' };
/**
 * Drive links in the thread become real images and videos: a file link is the one file, a folder link
 * is everything in it (images and videos only; sub-folders are skipped). Needs the file shared with
 * Cole or Ahsan. Labels (V1, I1) and the messages' tags are redone afterwards so they still line up.
 */
export async function expandDrive(env, t, notes = []) {
  const drive = t.videos.filter(v => v.platform === 'drive' && v.kind);
  if (!drive.length) return t;
  const keyOfLabel = new Map([...t.videos, ...t.images].map(x => [x.label, x.key]));
  for (const m of t.msgs) m.tags = (m.tags || []).map(l => keyOfLabel.get(l) || l);
  for (const d of drive) {
    const rd = await driveReader(env, d.id).catch(() => null);
    const add = [];
    if (rd) {
      const folder = rd.meta.mimeType === 'application/vnd.google-apps.folder';
      const files = folder ? await driveList(rd.tok, d.id).catch(() => []) : [rd.meta];
      for (const f of files) {
        const file = { id: f.id, name: f.name, mimetype: f.mimeType, size: +f.size || 0, url: driveMediaUrl(f.id), drive: rd.sub };
        if (/^image\/(png|jpe?g|gif|webp)$/.test(f.mimeType || '')) add.push({ image: true, key: `drive:${f.id}`, from: d.from, file: { ...file, thumb: driveThumb(f) } });
        else if (/^video\//.test(f.mimeType || '')) add.push({ image: false, platform: 'drive', key: `drive:${f.id}`, from: d.from, url: d.link, link: d.link, file });
      }
      if (!add.length) notes.push(`The Google Drive ${folder ? 'folder' : 'file'} "${rd.meta.name}" has no images or videos I can read (sub-folders are skipped).`);
    } else notes.push(`I could not open the Google Drive link ${d.link}: share it with cole@go-mobius-digital.com or ahsan@go-mobius-digital.com and tag me again.`);
    const at = t.videos.indexOf(d);
    t.videos.splice(at, 1, ...add.filter(x => !x.image));
    t.images.push(...add.filter(x => x.image));
    const m = t.msgs.find(x => x.ts === d.from);
    if (m) m.tags = m.tags.filter(k => k !== d.key).concat(add.map(x => x.key));
  }
  t.videos.forEach((v, i) => { v.label = `V${i + 1}`; });
  t.images.forEach((im, i) => { im.label = `I${i + 1}`; });
  const labelOfKey = new Map([...t.videos, ...t.images].map(x => [x.key, x.label]));
  for (const m of t.msgs) m.tags = m.tags.map(k => labelOfKey.get(k) || k).filter((x, i, a) => a.indexOf(x) === i);
  return t;
}
const isVideoFile = f => /^video\//.test(f?.mimetype || '');
const isImageFile = f => /^image\/(png|jpe?g|gif|webp)$/.test(f?.mimetype || '');
/* The mention's own words, without the tags. */
export const stripTags = t => String(t || '').replace(/<@[A-Z0-9_]+(?:\|[^>]*)?>/g, ' ').replace(/\s+/g, ' ').trim();
function cleanText(t, botUser, names) {
  return String(t || '')
    .replace(/<@([A-Z0-9_]+)(?:\|[^>]*)?>/g, (_, u) => (u === botUser ? '' : `@${names[u] || 'someone'}`))
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, '#$1')
    .replace(/<(https?:\/\/[^|>]+)\|([^>]*)>/g, '$1')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ').trim();
}

/** Every human message in order, with its links and files, plus the media to read (deduped). */
export function parseThread(messages, { botUser = null, names = {} } = {}) {
  const msgs = [], videos = [], images = [], seen = new Set();
  for (const m of messages || []) {
    if (m.bot_id || m.subtype === 'bot_message' || (botUser && m.user === botUser)) {
      /* The bot's own compare cards stay readable, so "use B's opener" means something on the next tag. */
      const label = (String(m.text || '').match(/^Version ([AB]) of the /) || [])[1];
      if (label) msgs.push({ ts: m.ts, user: null, name: `Version ${label} (my earlier draft)`, text: clip((m.blocks || []).map(b => b.text?.text || '').filter(Boolean).join(' / '), 6000), tags: [], links: [] });
      continue;
    }
    if (m.subtype && !['file_share', 'thread_broadcast'].includes(m.subtype)) continue;
    const tags = [];
    for (const u of linksOf(m.text)) {
      const c = classifyLink(u);
      if (!c) continue;
      if (!seen.has(c.key)) { seen.add(c.key); videos.push({ ...c, label: `V${videos.length + 1}`, from: m.ts }); }
      tags.push(videos.find(v => v.key === c.key).label);
    }
    for (const f of m.files || []) {
      const key = `slack:${f.id}`;
      if (seen.has(key)) continue;
      if (isVideoFile(f)) { seen.add(key); videos.push({ platform: 'slack', key, label: `V${videos.length + 1}`, from: m.ts, file: { id: f.id, name: f.name, mimetype: f.mimetype, size: f.size || 0, url: f.url_private_download || f.url_private } }); tags.push(videos[videos.length - 1].label); }
      /* thumb = Slack's own 1024px copy (only present when the original is bigger). It is what gets read
         and copied into Studio: a 4MB camera photo at 6000px is over Claude's size and pixel limits
         and would cost ten times the tokens for nothing (Grunk, 2026-10-06). */
      else if (isImageFile(f)) { seen.add(key); images.push({ key, label: `I${images.length + 1}`, from: m.ts, file: { id: f.id, name: f.name, mimetype: f.mimetype, size: f.size || 0, url: f.url_private_download || f.url_private, thumb: f.thumb_1024 || f.thumb_960 || f.thumb_720 || null } }); tags.push(images[images.length - 1].label); }
    }
    msgs.push({ ts: m.ts, user: m.user || null, name: names[m.user] || 'Someone', text: cleanText(m.text, botUser, names), tags, links: linksOf(m.text) });
  }
  return { msgs, videos, images };
}

/* ---------------- which brand ---------------- */
const STOP = new Set(['the', 'golf', 'co', 'club', 'and']);
function aliasesOf(name) {
  const words = String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const a = new Set([norm(name), norm(words.filter(w => w !== 'the').join('')), norm(words.filter(w => !STOP.has(w)).join(''))]);
  const first = words.find(w => !STOP.has(w));
  if (first && first.length >= 4) a.add(first);
  return [...a].filter(x => x.length >= 4);
}
/** "@bot for Party Patch" picks another brand. Only an explicit "for <brand>" counts. */
export function brandOverride(text, accounts) {
  for (const m of stripTags(text).matchAll(/\bfor\s+([^.,!?;:\n]+)/gi)) {
    const said = norm(m[1]);
    const hit = (accounts || []).find(a => aliasesOf(a.name).some(x => said.startsWith(x)));
    if (hit) return hit;
  }
  return null;
}

/* ---------------- is this mention an idea, or a question for the Strategist? ---------------- */
/* Links the bot cannot open (they need a login and have no door we hold a key to): the card says to
   upload the files instead. Google Drive files, folders and Docs DO open, as Cole or Ahsan through the
   service account (expandDrive, readDoc). */
export const UNOPENABLE = /app\.air\.inc\/|dropbox\.com\/|wetransfer\.com\/|we\.tl\//i;
/* 2026-10-09: the word router (ideaWanted, IDEA_WORDS, NUMBER_WORDS) is gone. Cole: "stop having a list
   of words that make it do X or Y". Every tag goes to the Strategist, which reads the thread and calls
   draft_from_thread (strategist.js) when the job is drafting from a reference. */

/** The ack (eyes on the message), then the work goes on the queue. */
export async function ideaStart(env, ev, body) {
  await slack(env, 'reactions.add', { channel: ev.channel, timestamp: ev.ts, name: 'eyes' });
  const job = { kind: 'draft', channel: ev.channel, root: ev.thread_ts || ev.ts, ts: ev.ts, user: ev.user || null,
    text: clip(ev.text, 2000), bot: body?.authorizations?.[0]?.user_id || null };
  if (env.IDEA_Q) return env.IDEA_Q.send(job);
  return runIdeaJob(env, job);
}

/* ---------------- getting video in ---------------- */
/**
 * TikTok and Instagram do not hand out the MP4, so a downloader API does: ScrapeCreators
 * (pay as you go, 1 credit per lookup, $47 = 25,000 credits, credits never expire;
 * key in DOWNLOADER_KEY). Returns { ok, res (the MP4 response), size, meta } or
 * { ok: false, reason: 'no_key' | 'not_video' | 'failed', message, image_url }.
 */
export async function fetchSocialVideo(url, env) {
  if (!env.DOWNLOADER_KEY) return { ok: false, reason: 'no_key' };
  const c = classifyLink(url);
  if (!c || !['tiktok', 'instagram'].includes(c.platform)) return { ok: false, reason: 'failed', message: 'not a TikTok or Instagram link' };
  const api = c.platform === 'tiktok' ? `${SCRAPE}/v2/tiktok/video?url=${encodeURIComponent(c.link)}` : `${SCRAPE}/v1/instagram/post?url=${encodeURIComponent(c.url)}`;
  const r = await F(api, { headers: { 'x-api-key': env.DOWNLOADER_KEY } }).catch(e => ({ ok: false, status: 0, json: async () => ({ message: e.message }) }));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, reason: 'failed', message: `the downloader said ${r.status}${j.message ? `: ${clip(j.message, 120)}` : ''}` };
  let urls = [], meta = {};
  if (c.platform === 'tiktok') {
    const v = j.aweme_detail?.video || {};
    urls = [...(v.download_no_watermark_addr?.url_list || []), ...(v.play_addr?.url_list || []), ...(v.download_addr?.url_list || [])];
    meta = { caption: clip(j.aweme_detail?.desc, 1000), author: j.aweme_detail?.author?.nickname || j.aweme_detail?.author?.unique_id || '' };
  } else {
    const p = j.data?.xdt_shortcode_media || j.xdt_shortcode_media || {};
    meta = { caption: clip(p.edge_media_to_caption?.edges?.[0]?.node?.text, 1000), author: p.owner?.username || '' };
    if (p.is_video === false) return { ok: false, reason: 'not_video', image_url: p.display_url || '', meta };
    urls = [p.video_url].filter(Boolean);
  }
  for (const u of urls.slice(0, 4)) {
    const v = await F(u, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: c.platform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.instagram.com/' } }).catch(() => null);
    if (v?.ok && !/text\/html|json/.test(v.headers.get('content-type') || '')) return { ok: true, res: v, size: +(v.headers.get('content-length') || 0), meta };
  }
  return { ok: false, reason: 'failed', message: urls.length ? 'the video file would not download' : 'no video in that post', meta };
}

const geminiMime = m => ({ 'video/quicktime': 'video/mov', 'video/x-m4v': 'video/mp4' }[m] || m || 'video/mp4');
/* Gemini's resumable upload, streamed so a big clip never sits in the Worker's memory. */
async function geminiUpload(env, res, mime, size, name) {
  let body = null;
  if (size > 0 && typeof FixedLengthStream !== 'undefined' && res.body) {
    const fl = new FixedLengthStream(size);
    res.body.pipeTo(fl.writable).catch(() => {});
    body = fl.readable;
  } else { body = await res.arrayBuffer(); size = body.byteLength; }
  if (size > MAX_VIDEO_BYTES) throw new Error('the video is over 300MB');
  const start = await F(`${GEMINI}/upload/v1beta/files`, { method: 'POST', headers: {
    'x-goog-api-key': env.GEMINI_API_KEY, 'X-Goog-Upload-Protocol': 'resumable', 'X-Goog-Upload-Command': 'start',
    'X-Goog-Upload-Header-Content-Length': String(size), 'X-Goog-Upload-Header-Content-Type': mime, 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: { display_name: clip(name, 100) } }) });
  const up = start.headers.get('x-goog-upload-url');
  if (!start.ok || !up) throw new Error(`the video reader refused the upload (${start.status})`);
  const done = await F(up, { method: 'POST', headers: { 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' }, body });
  let file = (await done.json().catch(() => ({}))).file;
  if (!done.ok || !file?.name) throw new Error(`the video upload failed (${done.status})`);
  for (let i = 0; i < 60 && file.state && file.state !== 'ACTIVE'; i++) {
    if (file.state === 'FAILED') throw new Error('the video reader could not process that file');
    await new Promise(r => setTimeout(r, 2000));
    file = await F(`${GEMINI}/v1beta/${file.name}`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } }).then(r => r.json()).catch(() => file);
  }
  if (file.state && file.state !== 'ACTIVE') throw new Error('the video reader took too long');
  return file;
}

/* ---------------- keeping the clip for the creator link (2026-09-30) ---------------- */
const clipExt = mime => ({ 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'mp4' }[mime]
  || (String(mime || '').split('/')[1] || 'mp4').replace(/[^a-z0-9]/g, '').slice(0, 5) || 'mp4');
/**
 * Puts the video in R2 (the Ambassadors bucket, key amb/<act>/idea-<id>.<ext>) and hands back
 * something geminiUpload can read from: the stored object, or the original response when the
 * file was not kept. Never throws. `why` says why it was not kept ('no storage', 'too big',
 * 'failed: ...'); small files are buffered first so a storage failure never loses the watch.
 */
async function stashClip(env, act, res, mime, size) {
  if (!env.MEDIA) return { res, size, why: 'no storage' };
  if (size > MAX_CLIP_BYTES) return { res, size, why: 'too big' };
  const key = `amb/${act ? await storagePrefix(env, act) : 'idea'}/idea-${rid()}.${clipExt(mime)}`;
  let buf = null, body = null;
  try {
    if (size > 0 && size > CLIP_BUFFER_BYTES && typeof FixedLengthStream !== 'undefined' && res.body) {
      const fl = new FixedLengthStream(size);
      res.body.pipeTo(fl.writable).catch(() => {});
      body = fl.readable;
    } else {
      buf = await res.arrayBuffer(); size = buf.byteLength; body = buf;
      if (size > MAX_CLIP_BYTES) return { res: { body: null, arrayBuffer: async () => buf }, size, why: 'too big' };
    }
    await env.MEDIA.put(key, body, { httpMetadata: { contentType: mime || 'video/mp4' } });
    const obj = await env.MEDIA.get(key);
    if (!obj) throw new Error('the stored clip could not be read back');
    return { res: obj, size: obj.size || size, key, bytes: obj.size || size };
  } catch (e) {
    /* A buffered file is still readable; a streamed one is gone with the failed put. */
    return { res: buf ? { body: null, arrayBuffer: async () => buf } : null, size, why: `failed: ${clip(e.message, 100)}` };
  }
}
/* Reasons that never change, so nobody fetches again. */
const NO_CLIP = new Set(['too big', 'no video on that ad', 'YouTube stays a link']);
/* The clip's source again, for a video watched before storage existed or whose clip was undone. */
async function clipSource(env, v, facts, meter) {
  if (v.platform === 'slack') {
    const res = await F(v.file.url, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
    if (!res.ok || /text\/html/.test(res.headers.get('content-type') || '')) throw new Error('Slack would not hand the file over');
    return { res, mime: geminiMime(v.file.mimetype), size: v.file.size || +(res.headers.get('content-length') || 0) };
  }
  if (v.platform === 'drive') {
    if (!v.file?.drive) throw new Error('the Google Drive file is not shared with us');
    const res = await F(v.file.url, { headers: await authHeaders(env, authOf(v.file)) });
    if (!res.ok) throw new Error(`Google Drive would not hand the file over (${res.status})`);
    return { res, mime: geminiMime(v.file.mimetype), size: v.file.size || +(res.headers.get('content-length') || 0) };
  }
  if (v.platform === 'atria') {
    let vid = facts?.atria?.video_url || '';
    if (!vid) { const a = await atriaAd(env, v.atria); vid = ((a.ad?.videos || [])[0] || {}).url || ''; }
    if (!/^https:\/\//.test(vid)) throw Object.assign(new Error('no video on that ad'), { final: true });
    const res = await F(vid);
    if (!res.ok || /text\/html|json/.test(res.headers.get('content-type') || '')) throw new Error(`the video file would not download (${res.status})`);
    return { res, mime: 'video/mp4', size: +(res.headers.get('content-length') || 0) };
  }
  if (v.platform === 'tiktok' || v.platform === 'instagram') {
    const s = await fetchSocialVideo(v.link || v.url, env);
    if (s.reason !== 'no_key' && meter) meter.downloads++;
    if (!s.ok) throw new Error(s.message || 'no downloader key');
    return { res: s.res, mime: 'video/mp4', size: s.size };
  }
  throw new Error('YouTube stays a link');
}
/**
 * Makes sure a watched video has its clip in R2: fills idea_media.file_key when it is missing
 * (watched before 2026-09-30, undone, or a storage failure). Returns { key } or { why }. Never throws.
 */
export async function ensureClip(env, act, v, meter = null) {
  const m = await env.DB.prepare(`SELECT file_key, clip, facts_json FROM idea_media WHERE key = ?1 AND status = 'ok'`).bind(v.key).first().catch(() => null);
  if (!m) return { why: 'not watched yet' };
  /* Locus's Ambassadors tab deletes an angle's files with it, so a remembered key is checked before reuse. */
  if (m.file_key && (!env.MEDIA || await env.MEDIA.head(m.file_key).catch(() => null))) return { key: m.file_key };
  if (NO_CLIP.has(m.clip)) return { why: m.clip };
  if (v.platform === 'youtube') return { why: 'YouTube stays a link' };
  if (!env.MEDIA) return { why: 'no storage' };
  try {
    const src = await clipSource(env, v, safeJson(m.facts_json, {}), meter);
    const st = await stashClip(env, act, src.res, src.mime, src.size);
    await env.DB.prepare(`UPDATE idea_media SET file_key = ?2, bytes = ?3, clip = ?4 WHERE key = ?1`).bind(v.key, st.key || null, st.bytes || 0, st.key ? 'ok' : st.why).run();
    return st.key ? { key: st.key } : { why: st.why };
  } catch (e) {
    const why = e.final ? e.message : `failed: ${clip(e.message, 100)}`;
    await env.DB.prepare(`UPDATE idea_media SET clip = ?2 WHERE key = ?1`).bind(v.key, why).run().catch(() => {});
    return { why };
  }
}

/* Facts only. The judgement is Claude's, with the brand brain; this just has to be right. */
const FACTS_PROMPT = `Watch this short-form video and report FACTS only, no opinions and no advice. Reply with JSON with exactly these keys:
{"format": [one or more of: yapper, pov, green screen, skit, demo, testimonial, unboxing, street interview, voiceover b-roll, slideshow, before and after, tutorial, reaction, stitch or duet, founder story, other],
 "length_seconds": number,
 "hook": {"spoken": "the words said in the first 3 seconds, verbatim", "on_screen_text": "text on screen in the first 3 seconds, verbatim", "visual": "exactly what is on screen and what the hands and body are doing in the first 3 seconds"},
 "visual_moments": [{"t": "0:01", "what": "anything visually unusual, surprising or pattern-breaking: an odd prop or action (for example stirring a drink with scissors), a costume, a sudden zoom or cut, a text pop, a camera trick, a reveal. Look for these yourself; nobody will point them out"}],
 "beats": [{"t": "0:00-0:03", "what": "what happens", "said": "verbatim", "on_screen": "verbatim"}],
 "on_screen_text": ["every text overlay, verbatim, in order"],
 "transcript": "the full spoken transcript, verbatim",
 "people": "who is on screen (how many, apparent age range, role such as creator, founder, customer) and the setting",
 "product": "what product appears, when it first appears, and its role in the video",
 "cta": "the call to action, verbatim, or empty",
 "pacing": "how often it cuts, editing style, caption style",
 "audio": "music (name it if known), voice, sound effects"}
Use "" or [] when something is absent. Never guess words you cannot hear or read: write [unclear].`;

/* STREAMED (2026-09-29): the first live run got a 524, a gateway timeout, because a plain
   generateContent sends nothing until the whole breakdown of a 55 second video is written.
   streamGenerateContent sends chunks as it goes, so the connection never sits idle. One retry
   on a gateway or overload error. */
async function geminiFacts(env, part, meter) {
  const body = JSON.stringify({ contents: [{ role: 'user', parts: [part, { text: FACTS_PROMPT }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 8192 } });
  let r, raw = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    r = await F(`${GEMINI}/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`, {
      method: 'POST', headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'Content-Type': 'application/json' }, body });
    raw = await r.text().catch(() => '');
    if (r.ok || ![429, 500, 502, 503, 504, 524].includes(r.status)) break;
    await new Promise(res => setTimeout(res, 3000));
  }
  if (!r.ok) {
    const j = safeJson(raw, {}) || {};
    const err = Array.isArray(j) ? j[0]?.error : j.error;
    throw new Error(`the video reader said ${r.status}${err?.message ? `: ${clip(err.message, 160)}` : ''}`);
  }
  /* SSE: each "data:" line is one chunk; the text parts join up, the last chunk carries the usage. */
  const chunks = raw.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => safeJson(l.slice(5).trim(), null)).filter(Boolean);
  const u = [...chunks].reverse().find(c => c.usageMetadata)?.usageMetadata || {};
  const gi = u.promptTokenCount || 0, go = (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0);
  meter.g_in += gi; meter.g_out += go;
  const text = chunks.map(c => (c.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('')).join('');
  let facts = safeJson(text, null);
  if (!facts) { const a = text.indexOf('{'), z = text.lastIndexOf('}'); facts = a >= 0 ? safeJson(text.slice(a, z + 1), null) : null; }
  if (!facts) throw new Error('the video reader answered in a shape I could not read');
  return { facts, g_in: gi, g_out: go };
}

/** One video's facts: from the cache, or watched once and cached. Never throws. */
export async function videoFacts(env, v, meter, act = null) {
  const hit = await env.DB.prepare(`SELECT facts_json, file_key, clip FROM idea_media WHERE key = ?1 AND status = 'ok'`).bind(v.key).first().catch(() => null);
  if (hit) {
    meter.videos_cached++;
    const facts = safeJson(hit.facts_json, {});
    /* Watched before clips were kept, or undone: store the file now (no re-watch, no model call). */
    const imageAd = !!facts.atria && !facts.atria.video_url && (facts.atria.image_urls || []).length > 0;
    if (!hit.file_key && !NO_CLIP.has(hit.clip) && v.platform !== 'youtube' && !imageAd && env.MEDIA) await ensureClip(env, act, v, meter);
    return { facts, cached: true, image_urls: facts.atria?.image_urls || [] };
  }
  if (v.platform === 'atria') return atriaFacts(env, v, meter, act);
  const what = v.platform === 'slack' ? `the uploaded video (${v.label})` : `the ${PLATFORM[v.platform]} video (${v.label})`;
  if (!env.GEMINI_API_KEY) return { note: `I could not watch ${what}: the video reader is not switched on yet (GEMINI_API_KEY is missing on the worker). I worked from the words in the thread.`, missing: 'gemini' };
  let kept = null;
  try {
    let part, meta = {};
    if (v.platform === 'youtube') part = { file_data: { file_uri: v.url } };
    else {
      let res, mime = 'video/mp4', size = 0;
      if (v.platform === 'slack') {
        res = await F(v.file.url, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
        if (!res.ok || /text\/html/.test(res.headers.get('content-type') || '')) return { note: `I could not download ${what} from Slack (the app needs the files:read scope).` };
        mime = geminiMime(v.file.mimetype); size = v.file.size || +(res.headers.get('content-length') || 0);
      } else if (v.platform === 'drive') {
        if (!v.file?.drive) return { note: `I could not open ${what}: share it with cole@go-mobius-digital.com and tag me again.` };
        res = await F(v.file.url, { headers: await authHeaders(env, authOf(v.file)) });
        if (!res.ok) return { note: `I could not download ${what} ("${v.file.name}") from Google Drive (${res.status}).` };
        mime = geminiMime(v.file.mimetype); size = v.file.size || +(res.headers.get('content-length') || 0);
      } else {
        const s = await fetchSocialVideo(v.link || v.url, env);
        if (s.reason !== 'no_key') meter.downloads++;
        if (s.reason === 'not_video') return { image_url: s.image_url, meta: s.meta };
        if (!s.ok) return { note: s.reason === 'no_key'
          ? `I can't pull videos from ${PLATFORM[v.platform]} yet (no downloader key is set on the worker). Upload the video file to this thread and tag me again.`
          : `I could not download ${what}: ${s.message}. Upload the video file to this thread and tag me again.`, meta: s.meta };
        res = s.res; size = s.size; meta = s.meta || {};
      }
      if (size > MAX_VIDEO_BYTES) return { note: `${what} is over 300MB, so I skipped it.` };
      /* Kept in R2 for the creator link first, then read from there for the watch. */
      kept = await stashClip(env, act, res, mime, size);
      if (!kept.res) throw new Error(`the clip could not be stored (${kept.why})`);
      const file = await geminiUpload(env, kept.res, mime, kept.size, v.key);
      part = { file_data: { mime_type: file.mimeType || mime, file_uri: file.uri } };
    }
    const g = await geminiFacts(env, part, meter);
    const facts = { ...g.facts, ...(meta.caption ? { post_caption: meta.caption } : {}), ...(meta.author ? { posted_by: meta.author } : {}) };
    const cost = (g.g_in * PRICE.g_in + g.g_out * PRICE.g_out) / 1e6;
    await env.DB.prepare(`INSERT INTO idea_media (key, platform, url, status, facts_json, g_in, g_out, cost, file_key, bytes, clip) VALUES (?1, ?2, ?3, 'ok', ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(key) DO UPDATE SET facts_json = excluded.facts_json, status = 'ok', g_in = excluded.g_in, g_out = excluded.g_out, cost = excluded.cost,
      file_key = excluded.file_key, bytes = excluded.bytes, clip = excluded.clip`)
      .bind(v.key, v.platform, v.url || v.file?.name || null, JSON.stringify(facts).slice(0, 60000), g.g_in, g.g_out, cost,
        kept?.key || null, kept?.bytes || 0, kept ? (kept.key ? 'ok' : kept.why) : (v.platform === 'youtube' ? 'YouTube stays a link' : null)).run();
    meter.videos_new++;
    return { facts };
  } catch (e) {
    /* No facts row means no clip either: nothing points at the object, so it goes. */
    if (kept?.key && env.MEDIA) await env.MEDIA.delete(kept.key).catch(() => {});
    return { note: `I could not watch ${what}: ${e.message}.` };
  }
}

/* Atria's words about the ad, labelled for the thinking step. */
function atriaSummary(a) {
  const ad = a.ad || {};
  const days = +ad.days_running || 0;
  const video = (ad.videos || [])[0] || null;
  return {
    source: 'Atria ad library (facts about the ad as it runs on Meta)',
    advertiser: ad.advertiser_name || '', headline: ad.title || '', body_copy: clip(ad.body, 4000), cta: ad.cta_text || '', landing_page: ad.link_url || '',
    format: [ad.display_format, ad.media_format].filter(Boolean).join(', '), video_seconds: video?.duration_seconds || ad.video_duration || null,
    running: days || ad.start_date || ad.status
      ? `${days ? `Running ${days} days` : 'Running'}${ad.start_date ? ` since ${String(ad.start_date).slice(0, 10)}` : ''}${ad.status ? `, status ${ad.status}` : ''}. Long-running ads are usually profitable for the advertiser: a signal, not proof.`
      : '',
    transcript: a.transcript || '', creative_tags: a.tags || '',
    image_urls: (ad.images || []).map(i => i?.url || i).filter(u => /^https:\/\//.test(u || '')).slice(0, 3),
    /* The public mp4, kept so the clip can be stored again later without another MCP round. */
    video_url: /^https:\/\//.test(video?.url || '') ? video.url : '',
  };
}
const ATRIA_OFF = 'Atria is not connected, so I could not open the Atria ad; Cole can connect it in Locus (Studio, Connect Atria). I worked from the words in the thread.';

/** An Atria (or Meta Ad Library) ad: the ad's details from Atria, then its video watched once like an upload. Never throws. */
async function atriaFacts(env, v, meter, act = null) {
  let a;
  try { a = await atriaAd(env, v.atria); } catch (e) { a = { ok: false, reason: 'failed', message: e.message }; }
  if (!a.ok) return { note: a.reason === 'not_connected' ? ATRIA_OFF
    : a.reason === 'not_found' ? `That ad (${v.label}) is not in Atria's library, so I worked from the words in the thread.`
    : `I could not open the Atria ad (${v.label}): ${clip(a.message || 'Atria did not answer', 160)}. I worked from the words in the thread.` };
  const atria = atriaSummary(a);
  const vid = atria.video_url;
  const save = async (facts, g = { g_in: 0, g_out: 0 }, kept = null) => {
    const cost = (g.g_in * PRICE.g_in + g.g_out * PRICE.g_out) / 1e6;
    await env.DB.prepare(`INSERT INTO idea_media (key, platform, url, status, facts_json, g_in, g_out, cost, file_key, bytes, clip) VALUES (?1, 'atria', ?2, 'ok', ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(key) DO UPDATE SET facts_json = excluded.facts_json, status = 'ok', g_in = excluded.g_in, g_out = excluded.g_out, cost = excluded.cost,
      file_key = excluded.file_key, bytes = excluded.bytes, clip = excluded.clip`)
      .bind(v.key, v.url, JSON.stringify(facts).slice(0, 60000), g.g_in, g.g_out, cost, kept?.key || null, kept?.bytes || 0, kept ? (kept.key ? 'ok' : kept.why) : null).run();
  };
  if (!vid) {
    /* An image (or a carousel): the pictures go to Claude as images, the words ride in the breakdown. */
    const facts = { atria };
    await save(facts);
    return { facts, image_urls: atria.image_urls };
  }
  if (!env.GEMINI_API_KEY) return { facts: { atria }, note: `I could not watch the Atria video (${v.label}): the video reader is not switched on yet (GEMINI_API_KEY is missing on the worker). I used Atria's transcript and details.` };
  let kept = null;
  try {
    const res = await F(vid);
    if (!res.ok || /text\/html|json/.test(res.headers.get('content-type') || '')) throw new Error(`the video file would not download (${res.status})`);
    const size = +(res.headers.get('content-length') || 0);
    if (size > MAX_VIDEO_BYTES) return { facts: { atria }, note: `The Atria video (${v.label}) is over 300MB, so I used Atria's transcript and details only.` };
    kept = await stashClip(env, act, res, 'video/mp4', size);
    if (!kept.res) throw new Error(`the clip could not be stored (${kept.why})`);
    const file = await geminiUpload(env, kept.res, 'video/mp4', kept.size, v.key);
    const g = await geminiFacts(env, { file_data: { mime_type: file.mimeType || 'video/mp4', file_uri: file.uri } }, meter);
    const facts = { ...g.facts, atria };
    await save(facts, g, kept);
    meter.videos_new++;
    return { facts };
  } catch (e) {
    if (kept?.key && env.MEDIA) await env.MEDIA.delete(kept.key).catch(() => {});
    return { facts: { atria }, note: `I could not watch the Atria video (${v.label}): ${e.message}. I used Atria's transcript and details.` };
  }
}

/* Images go straight to Claude. Slack files need the bot token; others are public. */
function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function imageBlock(env, url, auth) {
  const r = await F(url, { headers: await authHeaders(env, auth).catch(() => ({})) }).catch(() => null);
  const type = (r?.headers.get('content-type') || '').split(';')[0].trim();
  if (!r?.ok || !/^image\/(png|jpeg|gif|webp)$/.test(type)) return { note: auth?.kind === 'slack' ? 'I could not open an attached image (the app needs the files:read scope).' : auth?.kind === 'drive' ? 'I could not open an image from Google Drive.' : 'I could not open an image from that post.' };
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_IMAGE_BYTES) return { note: 'An attached image is over 3.7MB, so I skipped it.' };
  return { block: { type: 'image', source: { type: 'base64', media_type: type, data: b64(buf) } } };
}

/* ---------------- the thinking ---------------- */
const S = { type: 'string' }, B = { type: 'boolean' };
const arr = items => ({ type: 'array', items });
const obj = p => ({ type: 'object', properties: p, required: Object.keys(p), additionalProperties: false });
const en = (...v) => ({ type: 'string', enum: v });
export const IDEA_SCHEMA = obj({
  teardown: obj({ summary: S, awareness: S, sophistication: S, desire: S, mechanism: S, proof: S, hook_why: S, weak: S }),
  transfer: obj({ mode: en('as_is', 'style', 'hook_only', 'mixed'), reason: S, disagreement: S }),
  questions: arr(obj({ q: S, blocking: B })),
  destination: obj({ pick: en(...Object.keys(DESTS)), reason: S }),
  creator_link: obj({ section_id: S, new_section: S, new_section_line: S, duplicate_of: S, title: S, argument: S, who: S, format: S, products: S,
    openers: arr(S), shots: arr(obj({ label: S, text: S })), on_screen: S, do_text: S, dont_text: S, proof_note: S }),
  asana: obj({ title: S, kind: en('static', 'video'), test_type: en('angle', 'concept', 'iteration'), angle: S, why: S, testing: S,
    ads: arr(S), creator: S, script: S, primary_text: S, headline: S, offer: S }),
  studio: obj({ name: S, angle: S, why: S, concept: S, testing: en(...STUDIO_TESTING), post_copy: S, use_photos: B, lines: arr(S) }),
  images: arr(obj({ label: S, kind: en('inspiration', 'product_studio', 'product_lifestyle', 'other'), note: S })),
});

function systemText(brand, lucky) {
  return `You are the creative strategist on the Mobius Digital team for ${brand}. A teammate dropped an ad idea in the team's Slack (a reference video, an image, or just a typed idea) and people talked about it in the thread. Turn it into a draft the team can ship.

THE MOBIUS FRAMEWORK
- Angle: the argument, the reason to buy, said to one specific person.
- Concept: the idea built to deliver the angle (the scene, the format, the story).
- What We're Testing: the ONE thing that changes across the ads. Test types: angle test (a new argument), concept test (new ideas on a proven angle), iteration test (one change inside a proven concept, such as hooks or headlines).
- Each numbered ad is one ad.

READING THE THREAD
- The team's notes outrank your own read. "works as is" means as_is, "love the style" means style, "just the hook" means hook_only; more than one of these means mixed. If people disagreed, follow the LATEST direction and say so in transfer.disagreement (otherwise leave it empty).
- The video breakdowns are facts from a video model. Trust them for what was said and shown.
- A breakdown with an "atria" part is an ad from the Atria ad library (it runs on Meta): its advertiser, copy, CTA, landing page, transcript and creative tags are facts. How long it has been running is a signal it makes money for that advertiser, not proof; say so if you lean on it.
- The reference is usually another brand's ad. Take its structure, never its claims, product or words.

IMAGES: for every image in the thread (I1, I2...) say in \`images\` what it is: another brand's ad or a reference to copy (inspiration), a clean studio shot of OUR product on a plain background (product_studio), a real photo of our product in use or in a scene (product_lifestyle), or other (a screenshot of a chat, a spec sheet). What the team wrote wins ("here are the product photos", "this one is the inspo"). Studio draws the product from product photos and checks every ad against them, and uses inspiration only for the look, so this sorting decides what the ads look like.

TEARDOWN: why the reference works for its audience: the awareness stage, the sophistication stage, the desire it hits, the mechanism, the proof it uses, and why the hook stops the scroll. Then what is weak or not worth copying. ONE short sentence per field (summary may be two). Specific to this reference: if a sentence would fit any ad, cut it. A typed idea with no reference gets the same treatment for the idea itself.

QUESTIONS: 0 to 3, only when the brand brain AND the thread truly lack something you need (for example which persona or which product). blocking = true only when any draft would be a guess without the answer.

DESTINATION (pick one, say why in one line). This tool exists MAINLY FOR CREATORS, so the creator link is the default:
- creator_link: anything a creator could film at home or out and about from a short pitch, including odd props, visual hooks, skits, talking heads and demos. Props a creator already owns (scissors, a glass, a drawer of packets) do NOT make it a production job. Pick this unless one of the two below clearly fits better.${lucky ? '\n- lucky_creators: Lucky Golf\'s own creator app (its "What to shoot" page; the sections and angles listed below are the app\'s). For Lucky Golf this IS the creator link, so pick it wherever creator_link would fit.' : ''}
- asana_brief: only when a creator could not make it from a pitch: it needs our editor to build it from existing footage, a specific person or location, heavy motion graphics, or it is a structured paid test of several scripted versions the team must control. Also when the thread asks for a brief.
- studio: static image ads the AI can make now from lines of words.

DRAFTS: write ONLY the draft for the destination you picked. Leave the other destinations' strings empty and their arrays empty: the team presses a button for another one if they want it (this keeps each run cheap). Keep every field tight: enough for the person building it, no padding.
- creator_link is read by a creator on a phone, so it is SHORT and every word is specific (from the persona, a quote, a product fact; fewer words, never vaguer ones). HARD CAPS, the code cuts anything longer: title up to 6 words; argument (the pitch) up to 25 words; who up to 15 words; openers EXACTLY 2, up to 18 words each, lines a creator could say out loud; shots up to 3, each up to 20 words in plain language (label up to 3 words); on_screen up to 3 short lines, one per line; do_text and dont_text up to 3 items each, one per line, up to 10 words each; format up to 3 words; products up to 3 words; proof_note one short sentence on what to take from the reference. It follows the hierarchy rule: the section answers "why would a creator film this today" (Hot right now, a dated window, a product line, or a standing theme); format and product are chips on the card, never a section. Use an existing section id when one fits; otherwise leave section_id empty and give new_section plus one new_section_line. If an existing angle already makes this argument, put its id in duplicate_of: the reference then goes on it as proof instead of a new angle. This draft is PUBLIC: never mention money, spend, revenue, ROAS, CPA, orders or sales numbers anywhere in it.
- asana is the team's brief template, kept simple: title (a few words), angle (one sentence), why (one sentence) and test_type. testing is ONE short line saying what changes and, inside a proven concept, on which ad, like "3 new concepts", "3 headlines on 412-3", "2 redesigns of 412-3", "3 hooks on 290-1". Then 3 to 5 ads unless the thread asks otherwise, one line each: a different idea when testing concepts, otherwise the one piece that changes (the new hook, the new headline, what the redesign changes), enough for the designer or editor to build it. kind is video for anything filmed, static for images. For video also creator and script (one per ad if they are different videos); for static leave those empty. Copy fields only when you have something real to say.
- studio: static ads only, one line per ad: the words on the ad plus a short note on the look. testing is what changes across the lines. 3 to 6 lines unless the thread asks for a number (up to 12). "N variations" or "N versions" of ONE reference or idea with no named piece (no "headlines", no "offers") is testing "format": one layout type per line, named in the line (review card, native phone post, comparison, bold type offer, product hero, founder note, lifestyle shot), never a words-only test. use_photos = true only when the thread's product_lifestyle photos are good enough to BE the ads (a real shot with room for words) and nobody asked for a redesign: Studio then keeps each photo exactly as shot and adds the words; the line says what words go on and any small change (water droplets on the club, a darker sky).

${SPECIFICITY}

No em dashes anywhere. Plain English, like a person talking to a colleague.`;
}

/* ---------------- which product line (so the brain can focus) ---------------- */
const PICK_SCHEMA = obj({ line_ids: arr(S), why: S });
const PICK_SYSTEM = `You sort ad ideas for a brand by product line. Read the Slack thread and the facts about the reference, then pick the product line of THIS brand the idea would sell. Pick ONE line. Pick two only if you genuinely cannot tell which of the two it is. Use the line ids exactly as given. why: one short plain sentence. No em dashes.`;
const lineKey = n => String(n || '').replace(/\s*\(.*$/, '').toLowerCase().replace(/[^a-z0-9']+/g, ' ').trim();
/* The reference in a few lines: enough to tell which product it is about. */
function factsBrief(list) {
  return list.map(({ label, facts: f = {} }) => {
    const a = f.atria || {};
    const bits = [
      f.hook?.spoken && `hook said: "${clip(f.hook.spoken, 200)}"`, f.hook?.on_screen_text && `hook on screen: "${clip(f.hook.on_screen_text, 160)}"`,
      f.product && `product: ${clip(typeof f.product === 'string' ? f.product : JSON.stringify(f.product), 240)}`,
      a.advertiser && `advertiser: ${clip(a.advertiser, 80)}`, a.headline && `headline: ${clip(a.headline, 160)}`, a.body_copy && `ad copy: ${clip(a.body_copy, 240)}`,
      f.post_caption && `caption: ${clip(f.post_caption, 200)}`, (f.transcript || a.transcript) && `transcript: ${clip(String(f.transcript || a.transcript), 400)}`,
    ].filter(Boolean);
    return `${label}: ${bits.join('; ') || 'no details'}`;
  }).join('\n');
}
/**
 * The product line(s) this idea is about: { ids, names, why, cost, usage, cached } or null (one line
 * or none, or the call failed: the caller then uses the full brain). Cached on the thread row; a later
 * tag re-picks only when its words (or the messages since the last run) name another line.
 */
export async function pickLines(env, acct, t, job, row, facts = []) {
  const lines = await env.DB.prepare(`SELECT id, name, about, products FROM p_br_line WHERE act_id = ?1 ORDER BY sort, created_at, id`).bind(acct.act_id).all().then(r => r.results || []).catch(() => []);
  if (lines.length < 2) return null;
  const known = new Set(lines.map(l => l.id));
  const prev = row?.act_id === acct.act_id ? safeJson(row?.lines_json, null) : null;
  if (prev?.ids?.length && prev.ids.every(id => known.has(id))) {
    const since = row.seen_ts ? t.msgs.filter(m => +m.ts > +row.seen_ts).map(m => m.text) : [];
    const said = ` ${[stripTags(job.text), ...since].join(' ').toLowerCase().replace(/[^a-z0-9']+/g, ' ')} `;
    const named = lines.some(l => !prev.ids.includes(l.id) && lineKey(l.name).length >= 4 && said.includes(` ${lineKey(l.name)} `));
    if (!named) return { ...prev, cached: true, cost: 0 };
  }
  const user = `BRAND: ${acct.name}\n\nPRODUCT LINES:\n${lines.map(l => `[${l.id}] ${l.name}${l.about ? `: ${clip(String(l.about).replace(/\s+/g, ' '), 300)}` : ''}${l.products ? `\n  Products: ${clip(String(l.products).replace(/\s+/g, ' '), 300)}` : ''}`).join('\n')}`
    + `\n\nTHE THREAD:\n${clip(transcriptOf(t), 6000)}\n\nTHE TAG: "${clip(stripTags(job.text), 300) || '(just the tag)'}"`
    + (facts.length ? `\n\nTHE REFERENCE (facts from a video model or the ad library):\n${factsBrief(facts)}` : '');
  try {
    const m = await claude(env, { system: PICK_SYSTEM, user, schema: PICK_SCHEMA, effort: PICK.effort, maxTokens: PICK.maxTokens, model: PICK.id });
    const u = m.usage || {};
    const cost = priceOf(PICK, u);
    const out = jsonOf(m);
    const ids = [...new Set((out.line_ids || []).map(String))].filter(id => known.has(id)).slice(0, 2);
    if (!ids.length) { console.log(`idea line pick: no known line in ${JSON.stringify(out.line_ids)}`); return { ids: [], cost, usage: u }; }
    const pick = { ids, names: ids.map(id => lines.find(l => l.id === id).name), why: nd(clip(out.why, 300)) };
    await env.DB.prepare(`UPDATE idea_thread SET lines_json = ?2 WHERE id = ?1`).bind(`${job.channel}:${job.root}`, JSON.stringify(pick)).run();
    return { ...pick, cost, usage: u };
  } catch (e) {
    console.log(`idea line pick failed: ${e.message}`);
    return null;
  }
}

function transcriptOf(t) {
  return t.msgs.map((m, i) => `${i + 1}. ${m.name}: ${m.text || '(no words)'}${m.tags.length ? ` [${m.tags.join(', ')}]` : ''}`).join('\n');
}

async function hubOf(env, act) {
  /* Lucky Golf's hub IS its creator app once it is connected: the sections the model picks from, the
     dropdown lists and the push files into are the APP's, not Locus's p_amb rows. */
  if (luckyReady(env) && await isLuckyAct(env, act)) return luckyHub(env).catch(e => ({ brand: null, lucky: true, app: LUCKY_APP(env), sections: [], angles: [], down: clip(e.message, 200) }));
  const q = (sql) => env.DB.prepare(sql).bind(act).all().then(r => r.results || []).catch(() => []);
  const brand = await env.DB.prepare(`SELECT slug, live FROM p_amb_brand WHERE act_id = ?1`).bind(act).first().catch(() => null);
  const [sections, angles] = await Promise.all([
    q(`SELECT id, name, line, enabled FROM p_amb_section WHERE act_id = ?1 ORDER BY pinned DESC, sort, created_at`),
    q(`SELECT a.id, a.title, a.argument, a.format, s.name AS section FROM p_amb_angle a LEFT JOIN p_amb_section s ON s.id = a.section_id WHERE a.act_id = ?1 AND a.status = 'live' ORDER BY a.sort LIMIT 80`),
  ]);
  return { brand, sections, angles };
}
/* The prompt's description of where the angle will land, for either hub. */
function hubText(hub) {
  const head = hub.lucky
    ? `THE LUCKY CREATOR APP'S "WHAT TO SHOOT" NOW (${hub.app}; this is Lucky's creator link. The pinned section is Hot right now: an angle filed there is marked hot${hub.down ? `; it could not be read right now: ${hub.down}` : ''})`
    : `THE CREATOR LINK NOW (${hub.brand ? `/angles/${hub.brand.slug}, ${hub.brand.live ? 'live' : 'switched off'}` : 'this brand has no creator link yet'})`;
  return `${head}:\nSections: ${hub.sections.map(s => `[${s.id}] ${s.name}${s.line ? `: ${s.line}` : ''}${s.pinned ? ' (pinned)' : ''}${s.enabled ? '' : ' (off)'}`).join('; ') || 'none'}\nAngles:\n${hub.angles.map(a => `[${a.id}] ${a.title} (${a.section || 'no section'}; ${a.format || ''}): ${clip(a.argument, 110)}`).join('\n') || 'none'}`;
}

/* ---------------- Lucky Golf's creator app: PostgREST + Storage over fetch ---------------- */
const isLuckyAct = async (env, act) => /lucky/i.test((await env.DB.prepare(`SELECT name FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null))?.name || '');
const luckyHeaders = env => ({ apikey: env.LUCKY_SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.LUCKY_SUPABASE_SERVICE_KEY}` });
const luckyBase = env => String(env.LUCKY_SUPABASE_URL).replace(/\/+$/, '');
/* One PostgREST call. GET returns the rows; POST / DELETE return the rows they touched (Prefer: return=representation). */
async function luckyRest(env, method, path, body) {
  const r = await F(`${luckyBase(env)}/rest/v1/${path}`, { method, headers: { ...luckyHeaders(env), 'Content-Type': 'application/json', Accept: 'application/json', ...(method === 'GET' ? {} : { Prefer: 'return=representation' }) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const text = await r.text();
  if (!r.ok) throw new Error(`the Lucky creator app answered ${r.status} on ${method} ${path.split('?')[0]}: ${clip(text, 160)}`);
  return text ? safeJson(text, null) : null;
}
/* One object in the app's Supabase Storage bucket. Buffered up to CLIP_BUFFER_BYTES; above that the R2 body is
   streamed through a FixedLengthStream so the request carries a length. */
async function luckyStoragePut(env, path, obj, mime) {
  let body, size = obj.size || 0;
  if (size > CLIP_BUFFER_BYTES && obj.body && typeof FixedLengthStream !== 'undefined') { const fl = new FixedLengthStream(size); obj.body.pipeTo(fl.writable).catch(() => {}); body = fl.readable; }
  else { body = await obj.arrayBuffer(); size = body.byteLength; }
  const r = await F(`${luckyBase(env)}/storage/v1/object/${LUCKY_BUCKET}/${path}`, { method: 'POST', headers: { ...luckyHeaders(env), 'Content-Type': mime || 'video/mp4', 'x-upsert': 'true', 'Cache-Control': 'max-age=3600' }, body });
  if (!r.ok) throw new Error(`the Lucky creator app's storage answered ${r.status}: ${clip(await r.text().catch(() => ''), 160)}`);
  return size;
}
const luckyStorageDelete = (env, path) => F(`${luckyBase(env)}/storage/v1/object/${LUCKY_BUCKET}/${path}`, { method: 'DELETE', headers: luckyHeaders(env) }).catch(() => null);
const luckyLinks = (env, id) => ({ url: `${LUCKY_APP(env)}/shoot/${id}`, staff: `${LUCKY_APP(env)}/staff/angles/${id}` });
/** The app's What to shoot page, in the shape the prompt, the card and the dropdown already read (hubOf). */
async function luckyHub(env) {
  const [secs, angs] = await Promise.all([
    luckyRest(env, 'GET', 'angle_sections?select=id,name,blurb,pinned,active,sort&order=sort.asc,created_at.asc&limit=99'),
    luckyRest(env, 'GET', 'angles?select=id,title,who,format,section_id,hot&active=eq.true&order=sort.asc,created_at.asc&limit=80'),
  ]);
  const sections = (secs || []).map(s => ({ id: s.id, name: s.name, line: s.blurb || '', enabled: s.active ? 1 : 0, pinned: !!s.pinned }));
  const byId = Object.fromEntries(sections.map(s => [s.id, s]));
  const hot = sections.find(s => s.pinned)?.name || '';
  const angles = (angs || []).map(a => ({ id: a.id, title: a.title, argument: a.who || '', format: a.format || '', section: byId[a.section_id]?.name || (a.hot ? hot : '') }));
  return { brand: null, lucky: true, app: LUCKY_APP(env), sections, angles };
}

/* ---------------- money never reaches the public link ---------------- */
/* A sentence goes if it names a paid-media metric, or pairs a number with spend, revenue, sales,
   orders, profit or margin. A plain price ("$29, two for $50") is a product fact and stays. */
const METRIC = /\b(roas|cpa|mer|cpm|ctr|aov|ad spend)\b/i;
const MONEY_WORD = /\b(spend|spent|revenue|sales|orders|profit|margin|converted|conversions?)\b/i;
const moneyish = x => METRIC.test(x) || (MONEY_WORD.test(x) && /\d/.test(x)) || /\$\s?\d[\d,.]*\s?[kKmM]\b/.test(x);
export function noMoney(s) {
  if (!s) return '';
  /* Line by line, so "one item per line" fields keep their lines. */
  return String(s).split('\n').map(line => line.split(/(?<=[.!?])\s+/).filter(x => !moneyish(x)).join(' ').trim()).filter(Boolean).join('\n');
}
/* ---------------- the creator link draft is SHORT (2026-09-30) ---------------- */
/* Cole: "is the brief too complicated for a creator?" Yes. These are the caps the prompt asks for;
   the code cuts anything longer so a long answer never reaches the link. Specific still beats generic:
   the words come from the persona and the quotes, there are just fewer of them. */
export const CREATOR_CAPS = { title: 6, argument: 25, who: 15, openers: [2, 18], shots: [3, 20], shot_label: 3, on_screen: [3, 10], do: [3, 10], format: 3, products: 3 };
const words = (s, n) => {
  const w = String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return w.length <= n ? w.join(' ') : w.slice(0, n).join(' ').replace(/[,;:(\-]+$/, '').trim();
};
const firstSentence = s => (String(s || '').replace(/\s+/g, ' ').trim().match(/^.*?[.!?](?=\s|$)/) || [String(s || '').replace(/\s+/g, ' ').trim()])[0];
/* "One per line" fields: newline, " / " or a bullet each start a new item. */
const items = (s, [n, w]) => String(s || '').split(/\n|\s+\/\s+|\s*[•·]\s*|(?:^|\s)-\s+(?=[A-Za-z])/).map(x => x.replace(/^\s*(?:\d+[.)]|-|\*)\s*/, '').trim()).filter(Boolean).slice(0, n).map(x => words(x, w));
export function clampCreator(c) {
  const o = { ...c };
  o.title = words(o.title, CREATOR_CAPS.title);
  o.argument = words(o.argument, CREATOR_CAPS.argument);
  o.who = words(o.who, CREATOR_CAPS.who);
  o.format = words(o.format, CREATOR_CAPS.format);
  o.products = words(o.products, CREATOR_CAPS.products);
  o.openers = (o.openers || []).map(x => words(x, CREATOR_CAPS.openers[1])).filter(Boolean).slice(0, CREATOR_CAPS.openers[0]);
  o.shots = (o.shots || []).map(s => ({ label: words(s?.label, CREATOR_CAPS.shot_label), text: words(s?.text, CREATOR_CAPS.shots[1]) })).filter(s => s.text).slice(0, CREATOR_CAPS.shots[0]);
  o.on_screen = items(o.on_screen, CREATOR_CAPS.on_screen).join('\n');
  o.do_text = items(o.do_text, CREATOR_CAPS.do).join('\n');
  o.dont_text = items(o.dont_text, CREATOR_CAPS.do).join('\n');
  o.proof_note = firstSentence(o.proof_note);
  return o;
}
function cleanCreator(c) {
  const o = { ...c };
  for (const k of ['title', 'argument', 'who', 'format', 'products', 'on_screen', 'do_text', 'dont_text', 'proof_note', 'new_section', 'new_section_line']) o[k] = noMoney(o[k]);
  o.openers = (o.openers || []).map(noMoney).filter(Boolean);
  o.shots = (o.shots || []).map(s => ({ label: noMoney(s.label), text: noMoney(s.text) })).filter(s => s.text);
  return clampCreator(o);
}

/* ---------------- the card (a view of the stored row) ---------------- */
/* Slack caps a section at 3000 characters. Split on lines (then on words for a monster line) and
   NEVER drop text: the first live card lost the end of its brief to a hard slice. */
function sections(text, limit = 2900) {
  const out = [];
  let buf = '';
  const pieces = [];
  for (const line of String(text || '').split('\n')) {
    if (line.length <= limit) { pieces.push(line); continue; }
    let rest = line;
    while (rest.length > limit) { const cut = rest.lastIndexOf(' ', limit) > limit / 2 ? rest.lastIndexOf(' ', limit) : limit; pieces.push(rest.slice(0, cut)); rest = rest.slice(cut).trimStart(); }
    if (rest) pieces.push(rest);
  }
  for (const piece of pieces) {
    if (buf && buf.length + piece.length + 1 > limit) { out.push(buf); buf = piece; } else buf = buf ? `${buf}\n${piece}` : piece;
  }
  if (buf) out.push(buf);
  return out.map(t => ({ type: 'section', text: { type: 'mrkdwn', text: t } }));
}
const has = d => ({
  creator_link: !!(d.creator_link?.title || d.creator_link?.duplicate_of),
  lucky_creators: !!(d.creator_link?.title || d.creator_link?.duplicate_of),
  asana_brief: !!(d.asana?.title && (d.asana.ads || []).length),
  studio: !!((d.studio?.lines || []).length),
});

function creatorText(c, hub, lucky) {
  if (!c) return '';
  const dup = c.duplicate_of && hub?.angles?.find(a => a.id === c.duplicate_of);
  const sec = hub?.sections?.find(s => s.id === c.section_id);
  const lines = [`*${lucky ? 'Lucky creator app / creator link' : 'Creator link'} angle*${dup ? '' : `  ·  section: ${sec ? esc(sec.name) : c.new_section ? `${esc(c.new_section)} (new)` : 'none picked'}`}`];
  if (dup) lines.push(`Already on the link as *${esc(dup.title)}*. The button adds this reference to it as proof instead of a new angle.`);
  if (c.title) lines.push(`*${esc(c.title)}*`, esc(c.argument));
  if (c.who) lines.push(`Who: ${esc(c.who)}`);
  const chips = [c.format, c.products].filter(Boolean).map(esc).join('  ·  ');
  if (chips) lines.push(`Chips: ${chips}`);
  if ((c.openers || []).length) lines.push(`Openers: ${c.openers.map(o => `"${esc(o)}"`).join('  /  ')}`);
  for (const s of (c.shots || []).slice(0, 6)) lines.push(`• ${s.label ? `${esc(s.label)}: ` : ''}${esc(s.text)}`);
  const oneLine = s => esc(String(s || '').split('\n').filter(Boolean).join('  /  '));
  if (c.on_screen) lines.push(`On screen: ${oneLine(c.on_screen)}`);
  if (c.do_text) lines.push(`Do: ${oneLine(c.do_text)}`);
  if (c.dont_text) lines.push(`Don't: ${oneLine(c.dont_text)}`);
  lines.push(`Proof: the reference, shown as another brand (inspiration).${c.proof_note ? ` ${esc(c.proof_note)}` : ''}`);
  return lines.filter(Boolean).join('\n');
}
/* The model often numbers its own lines ("1. SCISSORS"); the card numbers them too. */
const unnum = x => String(x || '').replace(/^\s*\d+\s*[.):-]\s*/, '');
function asanaText(a) {
  if (!a?.title) return '';
  const l = [`*Asana brief*  ·  ${a.kind === 'video' ? 'Video' : 'Static'}, ${TEST_TYPE[a.test_type] || 'concept test'}`, `*${esc(a.title)}*`,
    `*Angle:* ${esc(a.angle)}`, `*Why:* ${esc(a.why)}`];
  l.push(`*What we're testing:* ${esc(a.testing)}`, ...(a.ads || []).map((x, i) => `${i + 1}. ${esc(unnum(x))}`));
  if (a.kind === 'video') {
    if (a.creator) l.push(`*Creator:* ${esc(a.creator)}`);
    if (a.script) l.push(`*Script:* ${esc(a.script)}`);
  }
  if (a.headline) l.push(`*Headline:* ${esc(a.headline)}`);
  if (a.primary_text) l.push(`*Primary text:* ${esc(a.primary_text)}`);
  if (a.offer) l.push(`*Offer:* ${esc(a.offer)}`);
  return l.join('\n');
}
function studioText(s) {
  if (!(s?.lines || []).length) return '';
  return [`*Studio batch*  ·  ${esc(s.name || 'Untitled')} (testing ${esc(s.testing)})`, `*Angle:* ${esc(s.angle)}`, `*Why:* ${esc(s.why)}`,
    s.concept ? `*Concept:* ${esc(s.concept)}` : '', ...s.lines.map((x, i) => `${i + 1}. ${esc(unnum(x))}`), s.post_copy ? `*Post copy:* ${esc(s.post_copy)}` : ''].filter(Boolean).join('\n');
}
const btn = (text, action_id, id, extra = {}) => ({ type: 'button', text: { type: 'plain_text', text: clip(text, 75) }, action_id, value: JSON.stringify({ i: id }), ...extra });
const ACTION_OF = { creator_link: 'idea_link', lucky_creators: 'idea_lucky', asana_brief: 'idea_asana', studio: 'idea_studio' };

/* The destination the card is for: the model's pick, Lucky's app only on Lucky. */
const pickOf = (d, acct) => { const lucky = /lucky/i.test(acct?.name || ''); const p = d.destination?.pick; return p === 'lucky_creators' && !lucky ? 'creator_link' : (p === 'creator_link' || !DESTS[p]) && lucky ? 'lucky_creators' : (DESTS[p] ? p : 'creator_link'); };
/* The idea in about four short lines: what a person needs to approve it, nothing else. */
function summaryLines(d, pick, hub) {
  if (pick === 'asana_brief' && d.asana?.title) {
    const a = d.asana, n = (a.ads || []).length;
    return [`*${esc(a.title)}*`, a.angle ? `Angle: ${esc(a.angle)}` : '', a.testing ? `Testing: ${esc(a.testing)}` : '',
      `${n} ad${n === 1 ? '' : 's'}, ${a.kind === 'video' ? 'video' : 'static'}, ${TEST_TYPE[a.test_type] || 'concept test'}`].filter(Boolean);
  }
  if (pick === 'studio' && (d.studio?.lines || []).length) {
    const s = d.studio, n = s.lines.length;
    return [`*${esc(s.name || 'Untitled')}*`, s.angle ? `Angle: ${esc(s.angle)}` : '', `${n} line${n === 1 ? '' : 's'}, testing ${esc(s.testing || 'concepts')}`].filter(Boolean);
  }
  const c = d.creator_link || {};
  const dup = c.duplicate_of && hub?.angles?.find(a => a.id === c.duplicate_of);
  if (dup) return [`Already on the link as *${esc(dup.title)}*. The button adds this reference to it as proof.`];
  if (!c.title) return ['_No draft yet. Press Redo._'];
  return [`*${esc(c.title)}*`, esc(c.argument), c.who ? `Who: ${esc(c.who)}` : '', c.openers?.[0] ? `Opener: "${esc(c.openers[0])}"` : ''].filter(Boolean);
}
/* Where the angle goes on the creator link. Options = the brand's sections (plus the model's new one);
   the model's pick is preselected until someone changes it (idea_thread.section_pick). */
function sectionSelect(row, c, hub) {
  const opt = (value, name) => ({ text: { type: 'plain_text', text: clip(name, 72) || 'Untitled' }, value: JSON.stringify({ i: row.id, s: value }) });
  const options = (hub?.sections || []).slice(0, 99).map(s => opt(s.id, `${s.name}${s.enabled === 0 ? ' (off)' : ''}`));
  if (c.new_section) options.push(opt('new', `New section: ${c.new_section}`));
  if (!options.length) return null;
  const want = row.section_pick || (hub?.sections?.some(s => s.id === c.section_id) ? c.section_id : c.new_section ? 'new' : null);
  const initial = want && options.find(o => safeJson(o.value, {}).s === want);
  return { type: 'static_select', action_id: 'idea_section', placeholder: { type: 'plain_text', text: 'Section' }, options, ...(initial ? { initial_option: initial } : {}) };
}

/** The whole card, rendered from the row. Every change to the row ends in a redraw. MINIMAL (2026-09-30):
 *  one bold line, the idea in about four lines, the Section dropdown, the buttons. Details is one press away. */
export function ideaCard(row, acct, hub) {
  const d = safeJson(row.draft_json, null) || {};
  const pushed = safeJson(row.pushed_json, {}) || {};
  const notes = safeJson(row.notes_json, []) || [];
  const lucky = /lucky/i.test(acct?.name || '');
  const pick = pickOf(d, acct);
  const head = `*${esc(acct?.name || 'Idea')} idea from ${esc(row.from_name || 'the team')} -> ${DESTS[pick]}*${row.runs > 1 ? '  (revised)' : ''}`;
  if (row.status === 'discarded') return { text: 'Idea discarded', blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `${head}\n_Discarded${pushed.discarded_by ? ` by ${esc(pushed.discarded_by)}` : ''}. Tag me again to start over._` } }] };
  const qs = (d.questions || []).filter(q => q.q);
  if (row.status === 'questions') {
    const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: head } }];
    blocks.push(...sections(`Before I draft this, I need:\n${qs.map((q, i) => `${i + 1}. ${esc(q.q)}`).join('\n')}`));
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Answer in this thread and tag me again.${row.last_cost ? `  ·  $${row.last_cost.toFixed(2)} this run.` : ''}` }] });
    return { text: `Questions before I draft the ${acct?.name || ''} idea`, blocks };
  }
  const blocks = sections([head, ...summaryLines(d, pick, hub)].join('\n'));
  const done = [];
  if (pushed.creator_link) done.push(`✓ On the creator link: ${pushed.creator_link.url ? `<${pushed.creator_link.url}|${esc(pushed.creator_link.title)}>` : esc(pushed.creator_link.title)}${pushed.creator_link.clip ? ' (the clip plays on it)' : ''}`);
  if (pushed.lucky_creators) done.push(`✓ On the Lucky creator app: ${pushed.lucky_creators.url ? `<${pushed.lucky_creators.url}|${esc(pushed.lucky_creators.title)}>` : esc(pushed.lucky_creators.title || 'saved')}${pushed.lucky_creators.clip ? ' (the clip plays on it)' : ''}`);
  if (pushed.asana_brief) done.push(`✓ Asana: <${pushed.asana_brief.url}|${esc(pushed.asana_brief.name)}>`);
  if (pushed.studio) done.push(`✓ Studio: batch "${esc(pushed.studio.name)}" (<${LOCUS}|open Locus>)`);
  if (done.length) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: done.join('\n') } });
  if (notes.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: clip(notes.map(esc).join('\n'), 2900) }] });
  const els = [];
  const c = d.creator_link || {};
  if ((pick === 'creator_link' || pick === 'lucky_creators') && has(d).creator_link && !c.duplicate_of && !pushed.creator_link && !pushed.lucky_creators) {
    const sel = sectionSelect(row, c, hub);
    if (sel) els.push(sel);
  }
  for (const k of Object.keys(DESTS)) {
    if (k === 'lucky_creators' && !lucky) continue;
    /* Once Lucky's app is connected it IS the creator link: the Locus button would file into sections the app does not have. */
    if (k === 'creator_link' && hub?.lucky) continue;
    if (pushed[k]) continue;
    /* Only the suggested destination is drafted up front; the rest cost a press of "Make ... draft". */
    /* Action ids must be unique inside one block (Slack answers invalid_blocks otherwise). */
    if (!has(d)[k]) { els.push({ ...btn(`Make ${DESTS[k]} draft`, `idea_make_${k}`, row.id), value: JSON.stringify({ i: row.id, k }) }); continue; }
    els.push(btn(`${DESTS[k]}${k === pick ? ' (suggested)' : ''}`, ACTION_OF[k], row.id, k === pick ? { style: 'primary' } : {}));
  }
  if (pushed.creator_link) els.push(btn('Undo creator link', 'idea_undo_link', row.id, { style: 'danger' }));
  if (pushed.lucky_creators) els.push(btn('Undo Lucky app', 'idea_undo_lucky', row.id, { style: 'danger' }));
  els.push(btn('Redo', 'idea_redo', row.id));
  els.push(btn('Discard', 'idea_discard', row.id, { style: 'danger', confirm: { title: { type: 'plain_text', text: 'Discard this draft?' }, text: { type: 'plain_text', text: 'The draft is dropped. Anything already sent on stays where it is.' }, confirm: { type: 'plain_text', text: 'Discard' }, deny: { type: 'plain_text', text: 'Keep it' } } }));
  els.push(btn('Details', 'idea_details', row.id));
  blocks.push({ type: 'actions', elements: els.slice(0, 25) });
  const ctxs = [];
  if (row.last_cost) ctxs.push(`$${row.last_cost.toFixed(2)} this run${row.cost > row.last_cost ? `, $${row.cost.toFixed(2)} this thread` : ''}`);
  const lp = safeJson(row.lines_json, null);
  if (lp?.names?.length) ctxs.push(`${lp.names.map(esc).join(' + ')} line`);
  if (ctxs.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: clip(ctxs.join('  ·  '), 2900) }] });
  return { text: `Draft for the ${acct?.name || ''} idea`, blocks: blocks.slice(0, 50) };
}

/** The full teardown + draft, posted in the thread when someone presses Details. */
export function detailsCard(row, acct, hub) {
  const d = safeJson(row.draft_json, null) || {};
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `*Details: ${esc(acct?.name || 'Idea')} idea from ${esc(row.from_name || 'the team')}*` } }];
  blocks.push(...draftBody(d, acct, hub, { buttons: false }).blocks);
  return { text: `Details for the ${acct?.name || ''} idea`, blocks: blocks.slice(0, 50) };
}

/* The draft itself (why it works, the take, the best home, the draft for it): the same on the normal
   card and on a blind compare card. `buttons` false leaves out the line that points at buttons. */
function draftBody(d, acct, hub, { buttons = true } = {}) {
  const lucky = /lucky/i.test(acct?.name || '');
  const blocks = [];
  const qs = (d.questions || []).filter(q => q.q);
  const t = d.teardown || {};
  const why = [`*Why it works*`, esc(t.summary)];
  if (t.hook_why) why.push(`• Hook: ${esc(t.hook_why)}`);
  if (t.desire) why.push(`• Desire: ${esc(t.desire)}`);
  if (t.awareness) why.push(`• Awareness: ${esc(t.awareness)}`);
  if (t.sophistication) why.push(`• Sophistication: ${esc(t.sophistication)}`);
  if (t.mechanism) why.push(`• Mechanism: ${esc(t.mechanism)}`);
  if (t.proof) why.push(`• Proof: ${esc(t.proof)}`);
  if (t.weak) why.push(`*Don't copy:* ${esc(t.weak)}`);
  blocks.push(...sections(why.join('\n')));
  const tr = d.transfer || {};
  const pick = pickOf(d, acct);
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Take:* ${MODE[tr.mode] || 'A mix'}. ${esc(tr.reason)}${tr.disagreement ? `\n_${esc(tr.disagreement)}_` : ''}\n*Best home:* ${DESTS[pick] || 'Asana brief'}. ${esc(d.destination?.reason)}` } });
  if (qs.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Worth answering: ${qs.map(q => esc(q.q)).join('  /  ')}` }] });
  blocks.push({ type: 'divider' });
  const draft = pick === 'asana_brief' ? asanaText(d.asana) : pick === 'studio' ? studioText(d.studio) : creatorText(d.creator_link, hub, pick === 'lucky_creators');
  blocks.push(...sections(draft || asanaText(d.asana) || studioText(d.studio) || creatorText(d.creator_link, hub, lucky)));
  const others = Object.keys(DESTS).filter(k => k !== pick && k !== 'lucky_creators' && has(d)[k]).map(k => DESTS[k]);
  if (buttons && others.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Drafts for ${others.join(' and ')} are ready too: the buttons send them as drafted.` }] });
  return { blocks, pick };
}

/* An error can name the model; a blind card never does. */
const blind = s => String(s || '').replace(/\b(claude[\w.-]*|opus[\w.-]*|sonnet[\w.-]*|fable[\w.-]*|haiku[\w.-]*)/gi, 'the model');
/** One version of a blind compare: the draft only. No model, no cost, no buttons. */
export function compareCard(label, d, err, acct, hub, notes = []) {
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `*${esc(acct?.name || 'Idea')}: Version ${label}*` } }];
  const qs = (d?.questions || []).filter(q => q.q);
  if (err || !d) blocks.push(...sections(`_Version ${label} could not be written: ${esc(blind(clip(err || 'no answer', 200)))}_`));
  else if (qs.some(q => q.blocking)) blocks.push(...sections(`Before I draft this, I need:\n${qs.map((q, i) => `${i + 1}. ${esc(q.q)}`).join('\n')}`));
  else blocks.push(...draftBody(d, acct, hub, { buttons: false }).blocks);
  const ctx = [...notes.map(n => esc(blind(n))), 'Blind test. Tell Cole\'s Claude which version reads better.'];
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: clip(ctx.join('\n'), 2900) }] });
  return { text: `Version ${label} of the ${acct?.name || ''} idea`, blocks: blocks.slice(0, 50) };
}

/* ---------------- one run: read, watch, think, post ---------------- */
async function getRow(env, id) { return env.DB.prepare(`SELECT * FROM idea_thread WHERE id = ?1`).bind(id).first(); }
async function userNames(env, ids) {
  const out = {};
  for (const u of [...new Set(ids.filter(Boolean))].slice(0, 20)) {
    const r = await slack(env, 'users.info', { user: u }, true);
    const p = r.user?.profile || {};
    out[u] = (p.display_name || p.real_name || r.user?.real_name || r.user?.name || 'Someone').split(' ')[0];
  }
  return out;
}
/* Every brand the ideas bot can file for: every active brand (brand_accounts, act_id = the brand id),
   with or without a Meta account. */
const acctsOf = async env => env.DB.prepare(`SELECT act_id, name, slack_channel FROM brand_accounts WHERE active = 1`).all().then(r => r.results || []).catch(() => []);

export async function runIdeaJob(env, job) {
  await ensureIdeaTables(env);
  const id = `${job.channel}:${job.root}`;
  const meter = { in: 0, out: 0, searches: 0, g_in: 0, g_out: 0, downloads: 0, videos_new: 0, videos_cached: 0 };
  const runId = rid();
  let row = await getRow(env, id);
  const done = () => slack(env, 'reactions.remove', { channel: job.channel, timestamp: job.ts, name: 'eyes' });
  if (row?.status === 'working' && Date.now() - Date.parse(`${row.updated_at.replace(' ', 'T')}Z`) < 4 * 60e3) {
    await say(env, job.channel, job.root, 'Still working on the last tag in this thread. Give me a minute.');
    await done();
    return { skipped: 'busy' };
  }
  const accounts = await acctsOf(env);
  const acct = brandOverride(job.text, accounts) || (row?.act_id && accounts.find(a => a.act_id === row.act_id)) || accounts.find(a => a.slack_channel === job.channel);
  if (!acct) { await say(env, job.channel, job.root, 'I can\'t tell which brand this is for. Tag me again with "for <brand>".'); await done(); return { skipped: 'no brand' }; }
  const lucky = /lucky/i.test(acct.name);
  const compare = (job.kind || 'draft') === 'draft' && wantsCompare(job.text);
  await env.DB.prepare(`INSERT INTO idea_thread (id, act_id, channel, thread_ts, status) VALUES (?1, ?2, ?3, ?4, 'working')
    ON CONFLICT(id) DO UPDATE SET act_id = excluded.act_id, status = 'working', updated_at = datetime('now')`).bind(id, acct.act_id, job.channel, job.root).run();
  await env.DB.prepare(`INSERT INTO idea_run (id, idea_id, act_id, kind) VALUES (?1, ?2, ?3, ?4)`).bind(runId, id, acct.act_id, compare ? 'compare' : job.kind || 'draft').run();
  const prevStatus = row?.status && row.status !== 'working' ? row.status : null;
  try {
    const rep = await slack(env, 'conversations.replies', { channel: job.channel, ts: job.root, limit: 200 }, true);
    if (!rep.ok) throw Object.assign(new Error(`I could not read this thread: ${slackWhy(rep.error || 'error')}.`), { plain: true });
    const names = await userNames(env, (rep.messages || []).filter(m => !m.bot_id).map(m => m.user));
    const t = parseThread(rep.messages, { botUser: job.bot, names });
    if (!t.msgs.length) throw Object.assign(new Error('There is nothing in this thread for me to read yet.'), { plain: true });
    const notes = [];
    await expandDrive(env, t, notes).catch(e => notes.push(`Google Drive: ${e.message}`));

    /* Videos: each watched once, ever. */
    const breakdowns = [], imgs = [], seenFacts = [];
    for (const v of t.videos.slice(0, MAX_VIDEOS)) {
      const r = await videoFacts(env, v, meter, acct.act_id);
      if (r.facts) seenFacts.push({ label: v.label, facts: r.facts });
      if (r.facts) breakdowns.push(`${v.label} (${PLATFORM[v.platform]}${v.url ? ` ${v.url}` : ''}${r.cached ? ', read before' : ''}):\n${clip(JSON.stringify(r.facts), 12000)}`);
      else if (r.image_url) imgs.push({ label: v.label, url: r.image_url, auth: null });
      (r.image_urls || []).forEach((u, i) => imgs.push({ label: r.image_urls.length > 1 ? `${v.label}.${i + 1}` : v.label, url: u, auth: null }));
      if (r.note) notes.push(r.note);
    }
    if (t.videos.length > MAX_VIDEOS) notes.push(`Only the first ${MAX_VIDEOS} videos were watched.`);
    for (const im of t.images) imgs.push({ label: im.label, url: im.file.thumb || im.file.url, auth: authOf(im.file) });
    const dead = [...new Set(t.msgs.flatMap(m => m.links || []).filter(u => UNOPENABLE.test(u)))];
    if (dead.length) notes.push(`I can't open ${dead.length === 1 ? 'that link' : `${dead.length} of those links`} (Air, Dropbox and WeTransfer need a login I do not have). Upload the files into this thread, or put them in Google Drive shared with cole@go-mobius-digital.com, and tag me again.`);
    /* Google Docs in the thread (a brief, notes) are read as text, as Cole or Ahsan. */
    const docTexts = [];
    for (const id of [...new Set(t.msgs.flatMap(m => m.links || []).map(u => (u.match(/docs\.google\.com\/document\/d\/([\w-]{20,})/) || [])[1]).filter(Boolean))].slice(0, 3)) {
      const txt = await readDoc(env, id).catch(() => null);
      if (txt) docTexts.push(`GOOGLE DOC (docs.google.com/document/d/${id}):\n${clip(txt, 12000)}`);
      else notes.push(`I could not read the Google Doc docs.google.com/document/d/${id}: share it with cole@go-mobius-digital.com and tag me again.`);
    }
    const imageBlocks = [];
    for (const im of imgs.slice(0, MAX_IMAGES)) {
      const r = await imageBlock(env, im.url, im.auth);
      if (r.block) imageBlocks.push({ type: 'text', text: `IMAGE ${im.label}:` }, r.block);
      if (r.note) notes.push(r.note);
    }
    if (imgs.length > MAX_IMAGES) notes.push(`Only the first ${MAX_IMAGES} images were read.`);

    /* Default Opus 5.5 (Cole's pick in the blind test), "quick" = Sonnet 5.5; Redo and Make keep the
       thread's model. Both read the brain FOCUSED on the idea's product line (picked once per thread by
       a tiny call; no pick = the full brain). The creator link is already in the prompt below. */
    const deep = !compare && (job.kind === 'draft' ? !wantsQuick(job.text) : (row?.deep == null ? true : !!row.deep));
    const M = deep ? MODELS.deep : MODELS.fast;
    const pick = await pickLines(env, acct, t, job, row, seenFacts);
    const pickCost = pick?.cost || 0;
    const brain = await brandBrain(env, acct.act_id, { creator: false, ...(pick?.ids?.length ? { lines: pick.ids } : {}) }).catch(() => ({ md: '' }));
    const hub = await hubOf(env, acct.act_id);
    /* A blind compare starts fresh (a revision would lean on whichever model wrote the last draft). */
    const prev = job.kind !== 'redo' && !compare && row?.draft_json ? row.draft_json : null;
    const fresh = prev && row.seen_ts ? t.msgs.filter(m => +m.ts > +row.seen_ts) : [];
    const user = [
      { type: 'text', text: `BRAND: ${acct.name}\n\nTHE THREAD (oldest first; V1, V2 are the videos broken down below, I1, I2 the images attached):\n${clip(transcriptOf(t), 30000)}\n\nTHE TAG THAT CALLED YOU: "${clip(stripTags(job.text), 600) || '(just the tag)'}"` },
      ...(breakdowns.length ? [{ type: 'text', text: `VIDEO BREAKDOWNS (facts from a video model):\n\n${breakdowns.join('\n\n')}` }] : []),
      ...(docTexts.length ? [{ type: 'text', text: `GOOGLE DOCS LINKED IN THE THREAD:\n\n${docTexts.join('\n\n')}` }] : []),
      ...(notes.length ? [{ type: 'text', text: `MEDIA I COULD NOT READ (work from the thread's words for these):\n${notes.join('\n')}` }] : []),
      ...imageBlocks,
      { type: 'text', text: hubText(hub) },
      ...(prev ? [{ type: 'text', text: `YOUR LAST DRAFT FOR THIS THREAD (revise it with what people said since; keep what nobody pushed back on):\n${clip(prev, 20000)}\n\nNEW MESSAGES SINCE THAT DRAFT: ${fresh.length ? fresh.map(m => `${m.name}: ${m.text}`).join(' / ') : 'none, they just asked again'}` }] : []),
    ];
    /* "Make <destination> draft" button: only that one draft is written, on top of the stored one,
       so the output (the expensive part) stays small; the system block is usually still cached. */
    const makeKey = job.kind === 'make' && prev ? DRAFT_KEY[job.dest] : null;
    if (makeKey) user.push({ type: 'text', text: `NOW WRITE ONLY THE ${DESTS[job.dest].toUpperCase()} DRAFT for this idea, consistent with your last draft's teardown and take. Return only that one field.` });
    const system = [{ type: 'text', text: systemText(acct.name, lucky) }, ...(brain.md ? [brainBlock(brain.md)] : [])];
    if (compare) {
      const r = await runCompare(env, { job, id, acct, t, hub, system, user, notes, meter, pick, pickCost, runId, prevStatus, brainSize: brain.size || 0 });
      await done();
      return r;
    }
    const m = await claude(env, {
      system, user, schema: makeKey ? obj({ [makeKey]: IDEA_SCHEMA.properties[makeKey] }) : IDEA_SCHEMA, effort: M.effort, maxTokens: 16000, model: M.id,
    }, null, meter);
    const u = m.usage || {};
    const d = makeKey ? { ...safeJson(prev, {}), [makeKey]: nd(jsonOf(m))[makeKey] } : nd(jsonOf(m));
    if (d.creator_link) d.creator_link = cleanCreator(d.creator_link);
    const blocking = (d.questions || []).some(q => q.blocking && q.q);
    const cost = priceOf(M, u) + (meter.g_in * PRICE.g_in + meter.g_out * PRICE.g_out) / 1e6 + meter.downloads * PRICE.download + pickCost;
    const refs = t.videos.filter(v => v.platform !== 'slack').map(v => v.link || v.url);
    /* The thread's videos, enough to find each one's stored clip later (the Creator link button). */
    const media = t.videos.slice(0, MAX_VIDEOS).map(v => ({ label: v.label, platform: v.platform, key: v.key, url: v.url || null, link: v.link || null, atria: v.atria || null,
      ...(v.file ? { file: { id: v.file.id, name: v.file.name, mimetype: v.file.mimetype, size: v.file.size, url: v.file.url, ...(v.file.drive ? { drive: v.file.drive } : {}) } } : {}) }));
    const from = t.msgs[0]?.name || 'the team';
    const status = blocking ? 'questions' : (prevStatus === 'pushed' ? 'pushed' : 'drafted');
    /* A fresh draft may pick another section; a "Make ... draft" press keeps what someone chose. */
    await env.DB.prepare(`UPDATE idea_thread SET status = ?2, from_name = ?3, refs_json = ?4, draft_json = ?5, seen_ts = ?6, notes_json = ?7,
      runs = runs + 1, cost = cost + ?8, last_cost = ?8, deep = ?9, media_json = ?10, section_pick = CASE WHEN ?11 THEN section_pick ELSE NULL END, updated_at = datetime('now') WHERE id = ?1`)
      .bind(id, status, from, JSON.stringify(refs), JSON.stringify(d), t.msgs[t.msgs.length - 1].ts, JSON.stringify(notes), cost, deep ? 1 : 0, JSON.stringify(media), makeKey ? 1 : 0).run();
    row = await getRow(env, id);
    /* A revision is a new reply, so the thread reads in order; the old card stops offering buttons. */
    if (row.reply_ts) await slack(env, 'chat.update', { channel: job.channel, ts: row.reply_ts, text: 'Replaced by the newer draft below.',
      blocks: [{ type: 'context', elements: [{ type: 'mrkdwn', text: '_Replaced by the newer draft below._' }] }] });
    const card = ideaCard(row, acct, hub);
    const posted = await say(env, job.channel, job.root, card.text, card.blocks);
    if (!posted.ok) throw Object.assign(new Error(`I could not post the draft: ${slackWhy(posted.error || 'error')}.`), { plain: true });
    await env.DB.prepare(`UPDATE idea_thread SET reply_ts = ?2 WHERE id = ?1`).bind(id, posted.ts).run();
    await env.DB.prepare(`UPDATE idea_run SET status = 'done', c_in = ?2, c_cache_read = ?3, c_cache_write = ?4, c_out = ?5, g_in = ?6, g_out = ?7,
      downloads = ?8, videos_new = ?9, videos_cached = ?10, cost = ?11, model = ?12, pick_cost = ?13, card_ts = ?14, finished_at = datetime('now') WHERE id = ?1`)
      .bind(runId, u.input_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0, u.output_tokens || 0,
        meter.g_in, meter.g_out, meter.downloads, meter.videos_new, meter.videos_cached, r4(cost), M.id, r4(pickCost), posted.ts || null).run();
    console.log(`idea ${id} ${acct.name}: ${M.id} $${cost.toFixed(4)}, brain ${brain.size || 0} chars${pick?.names ? ` on ${pick.names.join(' + ')}${pick.cached ? ' (cached pick)' : ` (pick $${pickCost.toFixed(4)})`}` : ' (full)'} (claude in ${u.input_tokens || 0}, cache read ${u.cache_read_input_tokens || 0}, write ${u.cache_creation_input_tokens || 0}, out ${u.output_tokens || 0}; gemini ${meter.g_in}/${meter.g_out}; videos new ${meter.videos_new}, cached ${meter.videos_cached})`);
    await done();
    return { ok: true, status, cost, videos_new: meter.videos_new, videos_cached: meter.videos_cached };
  } catch (e) {
    const msg = e.plain ? e.message : `That did not work: ${clip(e.message, 300)}. Tag me again to retry.`;
    await say(env, job.channel, job.root, msg);
    await env.DB.prepare(`UPDATE idea_thread SET status = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(id, prevStatus || 'failed').run().catch(() => {});
    await env.DB.prepare(`UPDATE idea_run SET status = 'failed', error = ?2, g_in = ?3, g_out = ?4, finished_at = datetime('now') WHERE id = ?1`).bind(runId, clip(e.message, 500), meter.g_in, meter.g_out).run().catch(() => {});
    await done();
    return { ok: false, error: e.message };
  }
}

/**
 * BLIND COMPARE: the identical prompt to Sonnet 5.5 and Opus 5.5, posted as Version A and Version B in
 * random order. The cards never say which model or what it cost; idea_run keeps the mapping (kind
 * compare_A / compare_B, model, cost, tokens, card_ts). The thread's stored draft is not touched.
 */
async function runCompare(env, c) {
  const { job, id, acct, t, hub, system, user, notes, meter, pick, pickCost, runId, prevStatus, brainSize } = c;
  const order = Math.random() < 0.5 ? [MODELS.fast, MODELS.deep] : [MODELS.deep, MODELS.fast];
  const settled = await Promise.allSettled(order.map(M => claude(env, { system, user, schema: IDEA_SCHEMA, effort: M.effort, maxTokens: 16000, model: M.id }, null, { in: 0, out: 0, searches: 0 })));
  const shared = (meter.g_in * PRICE.g_in + meter.g_out * PRICE.g_out) / 1e6 + meter.downloads * PRICE.download + pickCost;
  let total = shared;
  const versions = [];
  for (const [i, M] of order.entries()) {
    const label = 'AB'[i], s = settled[i];
    let d = null, u = {}, cost = 0, err = null;
    if (s.status === 'fulfilled') {
      u = s.value.usage || {}; cost = priceOf(M, u);
      try { d = nd(jsonOf(s.value)); if (d.creator_link) d.creator_link = cleanCreator(d.creator_link); } catch (e) { err = e.message; }
    } else err = s.reason?.message || 'no answer';
    total += cost;
    const card = compareCard(label, d, err, acct, hub, notes);
    const posted = await say(env, job.channel, job.root, card.text, card.blocks);
    await env.DB.prepare(`INSERT INTO idea_run (id, idea_id, act_id, kind, status, model, c_in, c_cache_read, c_cache_write, c_out, cost, error, card_ts, finished_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'))`)
      .bind(rid(), id, acct.act_id, `compare_${label}`, err ? 'failed' : 'done', M.id, u.input_tokens || 0, u.cache_read_input_tokens || 0,
        u.cache_creation_input_tokens || 0, u.output_tokens || 0, r4(cost), err ? clip(err, 500) : null, posted.ts || null).run();
    versions.push({ label, model: M.id, cost, ts: posted.ts || null, error: err });
    console.log(`idea compare ${id} ${acct.name} Version ${label} = ${M.id}: $${cost.toFixed(4)} (in ${u.input_tokens || 0}, cache read ${u.cache_read_input_tokens || 0}, write ${u.cache_creation_input_tokens || 0}, out ${u.output_tokens || 0})${err ? ` FAILED ${err}` : ''}`);
  }
  await env.DB.prepare(`UPDATE idea_run SET status = 'done', g_in = ?2, g_out = ?3, downloads = ?4, videos_new = ?5, videos_cached = ?6, cost = ?7, pick_cost = ?8,
    model = ?9, finished_at = datetime('now') WHERE id = ?1`)
    .bind(runId, meter.g_in, meter.g_out, meter.downloads, meter.videos_new, meter.videos_cached, r4(shared), r4(pickCost), pick && !pick.cached ? PICK.id : null).run();
  /* The stored draft, its card and its run count stay as they were; only the thread's total cost moves. */
  await env.DB.prepare(`UPDATE idea_thread SET status = ?2, cost = cost + ?3, updated_at = datetime('now') WHERE id = ?1`).bind(id, prevStatus || 'compared', total).run();
  console.log(`idea compare ${id} ${acct.name}: brain ${brainSize} chars${pick?.names ? ` on ${pick.names.join(' + ')}` : ' (full)'}, shared $${shared.toFixed(4)}, total $${total.toFixed(4)}`);
  return { ok: true, status: 'compared', cost: total, versions, videos_new: meter.videos_new, videos_cached: meter.videos_cached };
}

/* ---------------- the buttons ---------------- */
export const approversOf = env => String(env.IDEA_APPROVERS || DEFAULT_APPROVERS).split(/[\s,]+/).filter(Boolean);
const GATED = new Set(['idea_link', 'idea_lucky', 'idea_asana', 'idea_studio', 'idea_undo_link', 'idea_undo_lucky', 'idea_discard']);

export async function handleIdeaAction(env, ctx, p) {
  const a = (p.actions || []).find(x => /^idea_/.test(x.action_id || '')) || {};
  const aid = a.action_id || '';
  if (aid === 'idea_open') return ACK();
  const chan = p.container?.channel_id || p.channel?.id || null;
  const user = p.user?.id || null;
  /* A button carries its value; the Section dropdown carries it on the chosen option. */
  const val = safeJson(a.type === 'static_select' ? a.selected_option?.value : a.value, {}) || {};
  const job = (async () => {
    await ensureIdeaTables(env);
    const row = val.i ? await getRow(env, String(val.i)) : null;
    if (!row || row.channel !== chan) return whisper(env, chan, user, 'That idea is no longer stored, so this button cannot do anything. Tag me in the thread for a fresh draft.');
    if (GATED.has(aid) && !approversOf(env).includes(user)) return whisper(env, chan, user, 'Only Cole or Ahsan can send an idea on. Anyone can tag me for a draft or press Redo.', row.thread_ts);
    if (row.status === 'discarded' && aid !== 'idea_redo') return whisper(env, chan, user, 'That draft was discarded. Tag me again to start over.', row.thread_ts);
    /* Section dropdown: remember the choice, nothing else (no model, no redraw). */
    if (aid === 'idea_section') {
      if (!val.s) return null;
      return env.DB.prepare(`UPDATE idea_thread SET section_pick = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(row.id, String(val.s)).run();
    }
    /* Details: the full teardown + draft, as a reply in the thread. Open to anyone. */
    if (aid === 'idea_details') {
      const accts = await acctsOf(env);
      const card = detailsCard(row, accts.find(x => x.act_id === row.act_id), await hubOf(env, row.act_id));
      return say(env, row.channel, row.thread_ts, card.text, card.blocks);
    }
    if (aid.startsWith('idea_make')) {
      if (!DRAFT_KEY[val.k]) return null;
      const j = { kind: 'make', dest: val.k, channel: row.channel, root: row.thread_ts, ts: row.reply_ts || row.thread_ts, user, text: '', bot: null };
      await slack(env, 'reactions.add', { channel: row.channel, timestamp: j.ts, name: 'eyes' });
      return env.IDEA_Q ? env.IDEA_Q.send(j) : runIdeaJob(env, j);
    }
    if (aid === 'idea_redo') {
      const j = { kind: 'redo', channel: row.channel, root: row.thread_ts, ts: row.reply_ts || row.thread_ts, user, text: '', bot: null };
      await slack(env, 'reactions.add', { channel: row.channel, timestamp: j.ts, name: 'eyes' });
      return env.IDEA_Q ? env.IDEA_Q.send(j) : runIdeaJob(env, j);
    }
    const accounts = await acctsOf(env);
    const acct = accounts.find(x => x.act_id === row.act_id);
    if (!acct) return whisper(env, chan, user, 'That brand is no longer active in Locus.', row.thread_ts);
    const d = safeJson(row.draft_json, {}) || {};
    const pushed = safeJson(row.pushed_json, {}) || {};
    const who = (await userNames(env, [user]))[user] || 'someone';
    let reply = null;
    if (aid === 'idea_discard') {
      pushed.discarded_by = who;
      await env.DB.prepare(`UPDATE idea_thread SET status = 'discarded', pushed_json = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(row.id, JSON.stringify(pushed)).run();
    } else {
      const key = { idea_link: 'creator_link', idea_lucky: 'lucky_creators', idea_asana: 'asana_brief', idea_studio: 'studio' }[aid];
      if (key && pushed[key]) return whisper(env, chan, user, `Already sent to ${DESTS[key]}.`, row.thread_ts);
      if (aid === 'idea_link') reply = await pushCreator(env, row, acct, d, pushed);
      else if (aid === 'idea_undo_link') reply = await undoCreator(env, row, pushed);
      else if (aid === 'idea_lucky') reply = await pushLucky(env, row, acct, d, pushed, who);
      else if (aid === 'idea_undo_lucky') reply = await undoLucky(env, row, pushed);
      else if (aid === 'idea_asana') reply = await pushAsana(env, row, acct, d, pushed);
      else if (aid === 'idea_studio') reply = await pushStudio(env, row, acct, d, pushed);
      else return null;
      if (reply?.ok !== false) {
        const status = Object.keys(DESTS).some(k => pushed[k]) ? 'pushed' : (d.questions || []).some(q => q.blocking) ? 'questions' : 'drafted';
        await env.DB.prepare(`UPDATE idea_thread SET pushed_json = ?2, status = ?3, updated_at = datetime('now') WHERE id = ?1`).bind(row.id, JSON.stringify(pushed), status).run();
      }
    }
    const fresh = await getRow(env, row.id);
    if (fresh.reply_ts) { const card = ideaCard(fresh, acct, await hubOf(env, acct.act_id)); await slack(env, 'chat.update', { channel: row.channel, ts: fresh.reply_ts, text: card.text, blocks: card.blocks }); }
    if (reply?.text) await say(env, row.channel, row.thread_ts, reply.text, reply.blocks);
    return reply;
  })().catch(e => whisper(env, chan, user, `That did not work: ${clip(e.message, 300)}`));
  if (ctx?.waitUntil) { ctx.waitUntil(job); return ACK(); }
  await job;
  return ACK();
}

/* Creator link: a new angle (or the reference as proof on an existing one). The same inserts
   as Locus's Ambassadors tab. NO MONEY on the public link: cleanCreator ran on the draft. */
export async function pushCreator(env, row, acct, d, pushed) {
  const b = await env.DB.prepare(`SELECT slug, live FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
  if (!b) return { ok: false, text: `${acct.name} has no creator link yet. Set it up on the Ambassadors tab in Locus, then press the button again.` };
  const c = cleanCreator(d.creator_link || {});
  const act = acct.act_id;
  const created = { proofs: [] };
  let angleId = c.duplicate_of ? (await env.DB.prepare(`SELECT id FROM p_amb_angle WHERE id = ?1 AND act_id = ?2`).bind(c.duplicate_of, act).first())?.id : null;
  let title = angleId ? (await env.DB.prepare(`SELECT title FROM p_amb_angle WHERE id = ?1`).bind(angleId).first())?.title : c.title;
  if (!angleId) {
    if (!c.title) return { ok: false, text: 'The draft has no creator link angle to add. Press Redo, or tag me and say it is for the creator link.' };
    /* The Section dropdown outranks the model's pick; "new" means the section the model proposed. */
    const want = row.section_pick && row.section_pick !== 'new' ? row.section_pick : (row.section_pick === 'new' ? null : c.section_id);
    let sid = want ? (await env.DB.prepare(`SELECT id FROM p_amb_section WHERE id = ?1 AND act_id = ?2`).bind(want, act).first())?.id : null;
    if (!sid && c.new_section) {
      const same = await env.DB.prepare(`SELECT id FROM p_amb_section WHERE act_id = ?1 AND lower(name) = lower(?2)`).bind(act, c.new_section).first();
      if (same) sid = same.id;
      else {
        sid = rid();
        const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM p_amb_section WHERE act_id = ?1`).bind(act).first();
        await env.DB.prepare(`INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, enabled, sort) VALUES (?1, ?2, ?3, ?4, NULL, NULL, '#E86A33', 1, ?5)`)
          .bind(sid, act, clip(c.new_section, 60), clip(c.new_section_line, 120) || null, mx?.n || 1).run();
        created.section = sid;
      }
    }
    if (!sid) return { ok: false, text: 'Pick a section first (the dropdown on the card), so creators can find it on the link. Then press Creator link again.' };
    angleId = rid();
    const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM p_amb_angle WHERE act_id = ?1`).bind(act).first();
    await env.DB.prepare(`INSERT INTO p_amb_angle (id, act_id, section_id, hot, status, title, argument, who, products, format, lever,
        openers_json, shots_json, on_screen, do_text, dont_text, trend, sort, hot_sort) VALUES (?1, ?2, ?3, 0, 'live', ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?10, ?11, ?12, ?13, NULL, ?14, 0)`)
      .bind(angleId, act, sid || null, clip(c.title, 120), clip(c.argument, 300), clip(c.who, 400), clip(c.products, 160), clip(c.format, 60),
        JSON.stringify((c.openers || []).slice(0, 8).map(o => clip(o, 200))), JSON.stringify((c.shots || []).slice(0, 6).map(s => ({ label: clip(s.label, 40), text: clip(s.text, 400) }))),
        clip(c.on_screen, 200), clip(c.do_text, 400), clip(c.dont_text, 400), mx?.n || 1).run();
    created.angle = angleId;
  }
  const nextSort = async () => (await env.DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM p_amb_proof WHERE angle_id = ?1`).bind(angleId).first())?.n || 1;
  /* The reference as a link (the page opens it; hidden when the brand's "show inspiration" is off). */
  for (const url of (safeJson(row.refs_json, []) || []).slice(0, 2).map(publicRef)) {
    if (await env.DB.prepare(`SELECT id FROM p_amb_proof WHERE angle_id = ?1 AND url = ?2`).bind(angleId, url).first()) continue;
    const pid = rid();
    await env.DB.prepare(`INSERT INTO p_amb_proof (id, act_id, angle_id, kind, url, who, note, shown, sort) VALUES (?1, ?2, ?3, 'inspo', ?4, ?5, ?6, 1, ?7)`)
      .bind(pid, act, angleId, clip(url, 500), INSPO_WHO, clip(c.proof_note, 300) || null, await nextSort()).run();
    created.proofs.push(pid);
  }
  /* The reference as a CLIP THAT PLAYS (2026-09-30): the R2 copy kept when the video was watched, attached as
     the `upload` kind the public page plays natively. The first video with a stored clip; YouTube never. */
  let clipNote = '';
  const media = safeJson(row.media_json, null) || (safeJson(row.refs_json, []) || []).map(classifyLink).filter(Boolean);
  for (const v of media) {
    const r = await ensureClip(env, act, v);
    if (!r.key) { clipNote = clipNote || r.why; continue; }
    if (await env.DB.prepare(`SELECT id FROM p_amb_proof WHERE angle_id = ?1 AND file_key = ?2`).bind(angleId, r.key).first()) { clipNote = 'already there'; break; }
    const pid = rid();
    await env.DB.prepare(`INSERT INTO p_amb_proof (id, act_id, angle_id, kind, file_key, who, note, shown, sort) VALUES (?1, ?2, ?3, 'upload', ?4, ?5, ?6, 1, ?7)`)
      .bind(pid, act, angleId, r.key, INSPO_WHO, clip(c.proof_note, 300) || null, await nextSort()).run();
    created.proofs.push(pid);
    created.clip = { id: pid, key: r.key };
    break;
  }
  const link = `${ANGLES}${b.slug}`;
  pushed.creator_link = { angle_id: angleId, title, url: link, created, live: !!b.live, at: new Date().toISOString(), ...(created.clip ? { clip: created.clip.key } : {}) };
  const what = created.angle ? `New angle "${title}" is on the ${acct.name} creator link` : `The reference is now proof on "${title}" on the ${acct.name} creator link`;
  const clipLine = created.clip ? ' The reference clip plays on it.'
    : clipNote === 'YouTube stays a link' ? ' YouTube stays a link (it cannot be downloaded).'
    : clipNote === 'too big' ? ' The clip is over 95MB, so the reference is a link only.'
    : clipNote === 'no storage' ? ' Clip storage is not connected on this worker, so the reference is a link only.'
    : clipNote && clipNote !== 'already there' ? ` The clip could not be stored (${clipNote}), so the reference is a link only; a re-tag in the thread tries again.` : '';
  const text = `${what}: ${link}${b.live ? '' : ' (the link is switched off, so creators do not see it yet)'}${!created.proofs.length && !created.angle ? '. Nothing new to add: that reference was already there.' : ''}${clipLine}`;
  return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: esc(text).replace(esc(link), `<${link}|${esc(link)}>`) } },
    { type: 'actions', elements: [btn('Undo', 'idea_undo_link', row.id, { style: 'danger' })] }] };
}
/* Drops an R2 clip nobody points at any more, and lets the watched video store it again on the next tag. */
async function dropClip(env, key) {
  if (!key) return;
  if (await env.DB.prepare(`SELECT 1 AS x FROM p_amb_proof WHERE file_key = ?1`).bind(key).first()) return;
  if (env.MEDIA) await env.MEDIA.delete(key).catch(() => {});
  await env.DB.prepare(`UPDATE idea_media SET file_key = NULL, bytes = 0, clip = 'undone' WHERE file_key = ?1`).bind(key).run().catch(() => {});
}
export async function undoCreator(env, row, pushed) {
  const p = pushed.creator_link;
  if (!p) return { ok: false, text: 'Nothing on the creator link to take back.' };
  const act = row.act_id, cr = p.created || {};
  const keys = new Set();
  for (const pid of cr.proofs || []) {
    const k = (await env.DB.prepare(`SELECT file_key FROM p_amb_proof WHERE id = ?1 AND act_id = ?2`).bind(pid, act).first())?.file_key;
    if (k) keys.add(k);
    await env.DB.prepare(`DELETE FROM p_amb_proof WHERE id = ?1 AND act_id = ?2`).bind(pid, act).run();
  }
  if (cr.angle) {
    for (const r of (await env.DB.prepare(`SELECT file_key FROM p_amb_proof WHERE angle_id = ?1 AND act_id = ?2 AND file_key IS NOT NULL`).bind(cr.angle, act).all()).results || []) keys.add(r.file_key);
    await env.DB.prepare(`DELETE FROM p_amb_proof WHERE angle_id = ?1 AND act_id = ?2`).bind(cr.angle, act).run();
    await env.DB.prepare(`DELETE FROM p_amb_angle WHERE id = ?1 AND act_id = ?2`).bind(cr.angle, act).run();
  }
  if (cr.section && !(await env.DB.prepare(`SELECT 1 AS x FROM p_amb_angle WHERE section_id = ?1`).bind(cr.section).first()))
    await env.DB.prepare(`DELETE FROM p_amb_section WHERE id = ?1 AND act_id = ?2`).bind(cr.section, act).run();
  for (const k of keys) await dropClip(env, k);
  delete pushed.creator_link;
  return { text: `Taken back off the creator link: "${p.title}".` };
}

/* ---------------- Lucky creator app: the push (2026-09-30) ---------------- */
/* The app's angle has three beats (Start / Then / End) and no field for the on-screen lines or the do / don't
   list, so the shots fill the beats and the rest rides on the last beats, labelled. Never more than three. */
export function luckyBeats(c) {
  const parts = (c.shots || []).slice(0, 3).map(s => s.text).filter(Boolean);
  const oneLine = s => String(s || '').split('\n').filter(Boolean).join(' / ');
  const extra = [c.on_screen && `On screen: ${oneLine(c.on_screen)}`, c.do_text && `Do: ${oneLine(c.do_text)}`, c.dont_text && `Don't: ${oneLine(c.dont_text)}`].filter(Boolean);
  for (const x of extra) { if (parts.length < 3) parts.push(x); else parts[2] = `${parts[2]}\n${x}`; }
  return [parts[0] || null, parts[1] || null, parts[2] || null].map(x => x ? clip(x, 600) : null);
}
/* The club the angle is about, only when the draft names a product the app sells; otherwise "Any club". */
function luckyProduct(products, text) {
  const t = norm(text);
  if (!t) return null;
  const hit = (products || []).find(p => { const n = norm(p.title); return n && (t.includes(n) || n.includes(t)); });
  return hit?.id || null;
}
/** Files the creator draft into Lucky's app the way Staff > Angles would: a LIVE angle (active, like the Locus
 *  push) in the picked section, the reference as an Inspiration example (a link, and the stored clip uploaded to
 *  the `creative` bucket so it plays on the angle page). NO MONEY: cleanCreator ran on the draft. */
export async function pushLucky(env, row, acct, d, pushed, who) {
  if (!luckyReady(env)) return { ok: false, text: LUCKY_NOT_CONNECTED };
  const c = cleanCreator(d.creator_link || {});
  const hub = await luckyHub(env);
  const created = { examples: [] };
  let angleId = c.duplicate_of ? hub.angles.find(a => a.id === c.duplicate_of)?.id || null : null;
  let title = angleId ? hub.angles.find(a => a.id === angleId).title : c.title;
  if (!angleId) {
    if (!c.title) return { ok: false, text: 'The draft has no creator angle to add. Press Redo, or tag me and say it is for the creator app.' };
    const want = row.section_pick && row.section_pick !== 'new' ? row.section_pick : (row.section_pick === 'new' ? null : c.section_id);
    let sec = want ? hub.sections.find(s => s.id === want) : null;
    if (!sec && c.new_section) {
      sec = hub.sections.find(s => s.name.toLowerCase() === c.new_section.toLowerCase());
      if (!sec) {
        const last = await luckyRest(env, 'GET', 'angle_sections?select=sort&order=sort.desc&limit=1');
        const [made] = await luckyRest(env, 'POST', 'angle_sections', { name: clip(c.new_section, 60), blurb: clip(c.new_section_line, 120) || null, icon: 'sparkles', color: 'gold', pinned: false, active: true, sort: ((last || [])[0]?.sort ?? 0) + 10 }) || [];
        if (!made?.id) throw new Error('the Lucky creator app did not hand back the new section');
        sec = { id: made.id, name: made.name, pinned: false };
        created.section = made.id;
      }
    }
    if (!sec) return { ok: false, text: 'Pick a section first (the dropdown on the card), so creators can find it in the app. Then press Lucky creator app again.' };
    const [products, last] = await Promise.all([
      luckyRest(env, 'GET', 'products?select=id,title&kind=not.is.null&order=title.asc&limit=200').catch(() => []),
      luckyRest(env, 'GET', 'angles?select=sort&order=sort.desc&limit=1'),
    ]);
    const beats = luckyBeats(c);
    const [made] = await luckyRest(env, 'POST', 'angles', {
      section_id: sec.pinned ? null : sec.id, hot: !!sec.pinned, active: true, sort: ((last || [])[0]?.sort ?? 0) + 10,
      title: clip(c.title, 120), who: clip([c.who, c.argument].filter(Boolean).join('. ').replace(/\.\./g, '.'), 500) || null,
      hooks: (c.openers || []).slice(0, 8).map(o => clip(o, 200)), beat_open: beats[0], beat_middle: beats[1], beat_close: beats[2],
      product_id: luckyProduct(products, c.products), format: clip(c.format, 60) || null,
    }) || [];
    if (!made?.id) throw new Error('the Lucky creator app did not hand back the new angle');
    angleId = made.id;
    created.angle = angleId;
  }
  const existing = await luckyRest(env, 'GET', `angle_examples?select=id,url,sort&angle_id=eq.${angleId}`) || [];
  let sort = Math.max(0, ...existing.map(e => e.sort || 0));
  const example = async (fields) => {
    const [made] = await luckyRest(env, 'POST', 'angle_examples', { angle_id: angleId, owner: 'brand', owner_name: INSPO_WHO, note: clip(c.proof_note, 300) || null, active: true, sort: (sort += 10), ...fields }) || [];
    if (!made?.id) throw new Error('the Lucky creator app did not hand back the example');
    created.examples.push({ id: made.id, ...(fields.file_path ? { path: fields.file_path } : {}) });
    return made.id;
  };
  /* The reference as a link: only the platforms the app plays (its own form refuses anything else). */
  for (const url of (safeJson(row.refs_json, []) || []).slice(0, 2).map(publicRef)) {
    if (!/tiktok\.com|instagram\.com|youtube\.com|youtu\.be|facebook\.com|fb\.watch/i.test(url)) continue;
    if (existing.some(e => e.url === url)) continue;
    await example({ kind: 'link', url: clip(url, 500) });
  }
  /* The reference as a CLIP THAT PLAYS: the R2 copy (fetched on demand when missing) goes into the app's bucket. */
  let clipNote = '';
  const media = safeJson(row.media_json, null) || (safeJson(row.refs_json, []) || []).map(classifyLink).filter(Boolean);
  for (const v of media) {
    const r = await ensureClip(env, acct.act_id, v);
    if (!r.key) { clipNote = clipNote || r.why; continue; }
    const obj = env.MEDIA ? await env.MEDIA.get(r.key).catch(() => null) : null;
    if (!obj) { clipNote = clipNote || 'failed: the stored clip could not be read'; continue; }
    const mime = obj.httpMetadata?.contentType || 'video/mp4';
    const path = `angles/${angleId}/idea-${rid()}.${clipExt(mime)}`;
    try { await luckyStoragePut(env, path, obj, mime); } catch (e) { clipNote = `failed: ${clip(e.message, 120)}`; continue; }
    const id = await example({ kind: 'file', file_path: path });
    created.clip = { id, path };
    break;
  }
  const links = luckyLinks(env, angleId);
  pushed.lucky_creators = { angle_id: angleId, title, url: links.url, staff: links.staff, created, at: new Date().toISOString(), by: who, ...(created.clip ? { clip: created.clip.path } : {}) };
  const what = created.angle ? `New angle "${title}" is live on the Lucky creator app${created.section ? ` in the new section "${clip(c.new_section, 60)}"` : ''}` : `The reference is now an example on "${title}" on the Lucky creator app`;
  const clipLine = created.clip ? ' The reference clip plays on it.'
    : clipNote === 'YouTube stays a link' ? ' YouTube stays a link (it cannot be downloaded).'
    : clipNote === 'too big' ? ' The clip is over 95MB, so the reference is a link only.'
    : clipNote === 'no storage' ? ' Clip storage is not connected on this worker, so the reference is a link only.'
    : clipNote ? ` The clip could not be attached (${clipNote}), so the reference is a link only; a re-tag in the thread tries again.` : '';
  const text = `${what}: ${links.url} (staff view: ${links.staff})${!created.examples.length && !created.angle ? '. Nothing new to add: that reference was already there.' : ''}${clipLine}`;
  const md = esc(text).replace(esc(links.url), `<${links.url}|${esc(links.url)}>`).replace(esc(links.staff), `<${links.staff}|${esc(links.staff)}>`);
  return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: md } }, { type: 'actions', elements: [btn('Undo', 'idea_undo_lucky', row.id, { style: 'danger' })] }] };
}
/** Takes back exactly what the press created: the examples (and their objects in the `creative` bucket, unless
 *  another example still points at the same file), the angle, and a section it made that is still empty. */
export async function undoLucky(env, row, pushed) {
  const p = pushed.lucky_creators;
  if (!p) return { ok: false, text: 'Nothing on the Lucky creator app to take back.' };
  if (!luckyReady(env)) return { ok: false, text: LUCKY_NOT_CONNECTED };
  const cr = p.created || {};
  const paths = new Set();
  for (const e of cr.examples || []) {
    const gone = await luckyRest(env, 'DELETE', `angle_examples?id=eq.${e.id}`) || [];
    for (const g of gone) if (g.file_path) paths.add(g.file_path);
    if (e.path) paths.add(e.path);
  }
  if (cr.angle) {
    const gone = await luckyRest(env, 'DELETE', `angle_examples?angle_id=eq.${cr.angle}`) || [];
    for (const g of gone) if (g.file_path) paths.add(g.file_path);
    await luckyRest(env, 'DELETE', `angles?id=eq.${cr.angle}`);
  }
  if (cr.section && !((await luckyRest(env, 'GET', `angles?select=id&section_id=eq.${cr.section}&limit=1`) || []).length))
    await luckyRest(env, 'DELETE', `angle_sections?id=eq.${cr.section}&pinned=eq.false`);
  for (const path of paths) {
    if (((await luckyRest(env, 'GET', `angle_examples?select=id&file_path=eq.${encodeURIComponent(path)}&limit=1`).catch(() => [])) || []).length) continue;
    await luckyStorageDelete(env, path);
  }
  delete pushed.lucky_creators;
  return { text: `Taken back off the Lucky creator app: "${p.title}".` };
}

/* Asana: a numbered task in the brand's Creative Brief section, in the team's template
   (asana-brand.js BRIEF_STATIC / BRIEF_VIDEO), credited to whoever had the idea. The
   project webhook then syncs it into the Brand tab like any other brief. */
export function briefHtml(a, { num, from, permalink, refs = [] }) {
  const x = xesc, line = (k, v) => `<strong>${k}:</strong> ${x(v || '')}`;
  const ads = (a.ads || []).length ? a.ads : ['', '', ''];
  const parts = [
    `<body><em>Idea from ${x(from || 'the team')}${permalink ? ` in <a href="${x(permalink)}">Slack</a>` : ' in Slack'}. Drafted by Locus.</em>`,
    `<h2>The test</h2>${line('Angle', a.angle)}`, line('Why', a.why), line("What we're testing", a.testing),
    ...ads.map((t, i) => `<strong>${i + 1}.</strong> ${x(unnum(t))}`),
  ];
  if (a.kind === 'video') parts.push(`<h2>Video</h2>${line('Creator', a.creator)}`, line('Script', a.script));
  parts.push(`<h2>Copy</h2>${line('Headline', a.headline)}`, line('Primary text', a.primary_text), line('Offer', a.offer), line('Landing page', ''),
    `<strong>Inspo:</strong> ${refs.map(u => `<a href="${x(u)}">${x(u)}</a>`).join(' ') || (permalink ? `<a href="${x(permalink)}">the Slack thread</a>` : '')}</body>`);
  return parts.join('\n');
}
export async function nextNumber(env, act, gid) {
  const db = (await env.DB.prepare(`SELECT MAX(CAST(num AS INTEGER)) AS n FROM p_br_batch WHERE act_id = ?1`).bind(act).first().catch(() => null))?.n || 0;
  const since = new Date(Date.now() - 3 * 864e5).toISOString();
  const recent = await asana(env, `/tasks?project=${gid}&modified_since=${encodeURIComponent(since)}&opt_fields=name&limit=100`).catch(() => []);
  return Math.max(db, ...(recent || []).map(t => +numOf(t.name) || 0)) + 1;
}
export async function pushAsana(env, row, acct, d, pushed) {
  const a = d.asana || {};
  if (!a.title) return { ok: false, text: 'The draft has no Asana brief. Press Redo, or tag me and say it is for Asana.' };
  const doc = safeJson((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'asana'`).bind(acct.act_id).first())?.data_json, null);
  if (!doc?.project_gid) return { ok: false, text: `${acct.name} is not connected to Asana yet (Locus, Brand tab, Brand info). Connect it and press the button again.` };
  const secs = await asana(env, `/projects/${doc.project_gid}/sections?opt_fields=name`);
  const sec = (secs || []).find(s => /creative\s*brief/i.test(s.name)) || (secs || []).find(s => /brief/i.test(s.name));
  if (!sec) return { ok: false, text: `${acct.name}'s Asana project has no Creative Brief section.` };
  const num = await nextNumber(env, acct.act_id, doc.project_gid);
  const permalink = (await slack(env, 'chat.getPermalink', { channel: row.channel, message_ts: row.thread_ts }, true)).permalink || '';
  const refs = safeJson(row.refs_json, []) || [];
  const name = `${num} - ${clip(a.title, 120)}`;
  let task;
  try { task = await asana(env, '/tasks?opt_fields=name,permalink_url', { method: 'POST', body: { name, projects: [doc.project_gid], html_notes: briefHtml(a, { num, from: row.from_name, permalink, refs }) } }); }
  catch (e) {
    /* Asana rejects html it cannot parse; the plain text still carries every word. */
    if (e.status !== 400) throw e;
    task = await asana(env, '/tasks?opt_fields=name,permalink_url', { method: 'POST', body: { name, projects: [doc.project_gid], notes: `${asanaText(a).replace(/\*/g, '')}\n\nIdea from ${row.from_name || 'the team'}: ${permalink}\nInspo: ${refs.join(' ')}` } });
  }
  await asana(env, `/sections/${sec.gid}/addTask`, { method: 'POST', body: { task: task.gid } });
  /* The Testing field, when the project has Locus's fields. Never the Angle field: the tagger files that. */
  const fields = safeJson((await env.DB.prepare(`SELECT value FROM settings WHERE key = 'brandAsanaFields'`).first().catch(() => null))?.value, null);
  const opt = fields?.testing_opts?.[{ angle: 'angle', concept: 'concept', iteration: 'variation' }[a.test_type]];
  if (fields?.testing && opt) await asana(env, `/tasks/${task.gid}`, { method: 'PUT', body: { custom_fields: { [fields.testing]: opt } } }).catch(() => {});
  pushed.asana_brief = { gid: task.gid, url: task.permalink_url || `https://app.asana.com/0/${doc.project_gid}/${task.gid}`, num, name, at: new Date().toISOString() };
  return { text: `Brief ${num} is in ${acct.name}'s Creative Brief column in Asana: ${pushed.asana_brief.url}` };
}

/* The thread's still images (Slack uploads, Atria / Meta Ad Library image ads), copied into Studio's own
   reference store (same R2 bucket, studio/ref/<24 hex>.<ext>, served by the profit worker) so the batch
   opens with the inspiration already on it. Videos stay out: Studio makes statics, and the written
   breakdown already shaped the lines. Never throws; an image that cannot be copied is skipped. */
const STUDIO_REF = 'https://mobius-profit.mobius-digital.workers.dev/api/studio/ref/';
async function studioRefs(env, row) {
  if (!env.MEDIA) return [];
  const srcs = [];
  try {
    const rep = await slack(env, 'conversations.replies', { channel: row.channel, ts: row.thread_ts, limit: 200 }, true);
    const t = parseThread(rep.messages || []);
    await expandDrive(env, t).catch(() => {});
    for (const im of t.images) srcs.push({ label: im.label, url: im.file.thumb || im.file.url, auth: authOf(im.file) });
    for (const v of t.videos.filter(v => v.platform === 'atria')) {
      const hit = await env.DB.prepare(`SELECT facts_json FROM idea_media WHERE key = ?1 AND status = 'ok'`).bind(v.key).first().catch(() => null);
      const a = safeJson(hit?.facts_json, {})?.atria;
      if (a && !a.video_url) (a.image_urls || []).forEach(u => srcs.push({ label: v.label, url: u, auth: null }));
    }
  } catch { return []; }
  const out = [];
  for (const s of srcs.slice(0, 12)) {
    try {
      const res = await F(s.url, { headers: await authHeaders(env, s.auth).catch(() => ({})) });
      const type = (res.headers.get('content-type') || '').split(';')[0];
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type];
      if (!res.ok || !ext) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength > 12e6) continue;
      const key = `${hex24()}.${ext}`;
      await env.MEDIA.put(`studio/ref/${key}`, buf, { httpMetadata: { contentType: type } });
      out.push({ label: s.label, url: STUDIO_REF + key });
    } catch { /* skipped */ }
  }
  return out;
}

/* Studio: a draft batch in Locus Studio's own table, ready to plan and make. The inspiration comes along:
   "as is" / "the style" puts the first image on every line ("make it look like this", copied closely);
   otherwise the images go in the batch's swipe file (loose mood, for range). */
export async function pushStudio(env, row, acct, d, pushed) {
  const s = d.studio || {};
  if (!(s.lines || []).length) return { ok: false, text: 'The draft has no Studio lines. Press Redo, or tag me and say it is for Studio.' };
  const id = hex24();
  const all = await studioRefs(env, row);
  /* The model sorted the thread's images (IDEA_SCHEMA.images): our product photos become the batch's
     product (drawn from and checked against, like Shopify photos); inspiration goes on the lines or
     into the swipe file; "use_photos" makes each lifestyle photo the ad itself. */
  const kinds = new Map((Array.isArray(d.images) ? d.images : []).map(x => [x.label, x.kind]));
  const of = k => all.filter(r => kinds.get(r.label) === k).map(r => r.url);
  const studioShots = of('product_studio'), lifestyle = of('product_lifestyle');
  const refs = all.filter(r => !['product_studio', 'product_lifestyle', 'other'].includes(kinds.get(r.label))).map(r => r.url);
  const product = [...studioShots, ...lifestyle].slice(0, 8);
  const usePhotos = !!s.use_photos && lifestyle.length > 0;
  const copyLook = !usePhotos && ['as_is', 'style'].includes(d.transfer?.mode) && refs.length > 0;
  const brief = { angle: s.angle || '', why: s.why || '', concept: s.concept || '', post_copy: s.post_copy || '',
    testing: STUDIO_TESTING.includes(s.testing) ? s.testing : 'concepts',
    lines: s.lines.slice(0, 12).map((text, i) => ({ text: clip(text, 1200), inspo: copyLook ? [refs[0]] : [], photo: usePhotos ? lifestyle[i % lifestyle.length] : '' })),
    source: 'slack idea', reference: safeJson(row.refs_json, []) || [] };
  const swipe = copyLook ? refs.slice(1) : refs;
  const setup = { products: product.length ? [{ title: 'Photos from the Slack thread', handle: `thread:${id}`, all: product, dna: null }] : [], images: product, swipe };
  const name = clip(s.name || s.angle || 'Idea from Slack', 200);
  await env.DB.prepare(`INSERT INTO p_studio_batch (id, act_id, num, br_batch_id, name, brief_json, setup_json, plan_json, status) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, NULL, 'draft')`)
    .bind(id, acct.act_id, pushed.asana_brief?.num ? String(pushed.asana_brief.num) : null, name, JSON.stringify(brief), JSON.stringify(setup)).run();
  pushed.studio = { id, name, at: new Date().toISOString() };
  const inspo = !refs.length ? '' : copyLook ? ' The inspiration is on every line as "make it look like this".' : ` The inspiration is in its swipe file (${refs.length} image${refs.length === 1 ? '' : 's'}).`;
  const prod = product.length ? ` ${product.length} product photo${product.length === 1 ? '' : 's'} from this thread ${product.length === 1 ? 'is' : 'are'} on it as the product.` : '';
  const photos = usePhotos ? ` The lifestyle photos ARE the ads: Studio keeps each one as shot and adds the words.` : '';
  return { text: `Studio batch "${name}" is waiting in Locus Studio for ${acct.name} (${brief.lines.length} ad${brief.lines.length === 1 ? '' : 's'}).${prod}${photos}${inspo} ${product.length ? 'Check the product fingerprint there and make it' : 'Pick the product there and make it'}: ${LOCUS}` };
}
