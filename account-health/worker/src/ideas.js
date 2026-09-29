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
 */
import { claude, jsonOf, clip, safeJson } from './research.js';
import { brandBrain, brainBlock, SPECIFICITY } from './brain.js';
import { asana, numOf } from './asana-brand.js';
import { atriaAd } from './atria.js';

/* Outbound HTTP goes through the worker's metered fetch (xfetch). worker.js hands it in. */
let F = (...a) => fetch(...a);
export function useFetch(f) { F = f; }

/* The video model. One constant: Gemini 3.5 Flash-Lite is Google's current stable Flash-Lite
   ($0.30 per million video tokens in, $2.50 out; a 60 second clip is roughly 18k tokens, so
   about half a cent). Swap here if Google retires it. */
export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI = 'https://generativelanguage.googleapis.com';
const SCRAPE = 'https://api.scrapecreators.com';
/* Per million tokens. Claude = Opus 5 (the claude() helper's model). */
const PRICE = { in: 5, write: 6.25, read: 0.5, out: 25, g_in: 0.30, g_out: 2.50, download: 0.00188 };
export const DEFAULT_APPROVERS = 'U06C37MDWD7,U06K732S4BD';   // Cole, Ahsan
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const ANGLES = 'https://tools.go-mobius-digital.com/angles/';
const MAX_VIDEOS = 3, MAX_IMAGES = 4, MAX_VIDEO_BYTES = 300e6, MAX_IMAGE_BYTES = 3.7e6;
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
const PLATFORM = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram', slack: 'uploaded', atria: 'Atria' };
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
const say = (env, channel, thread_ts, text, blocks) => slack(env, 'chat.postMessage', { channel, thread_ts, text, unfurl_links: false, unfurl_media: false, ...(blocks ? { blocks } : {}) });
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
  return null;
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
    if (m.bot_id || m.subtype === 'bot_message' || (botUser && m.user === botUser)) continue;
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
      else if (isImageFile(f)) { seen.add(key); images.push({ key, label: `I${images.length + 1}`, from: m.ts, file: { id: f.id, name: f.name, mimetype: f.mimetype, size: f.size || 0, url: f.url_private_download || f.url_private } }); tags.push(images[images.length - 1].label); }
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
const IDEA_WORDS = /\b(ideas?|brief(?: this| it)?|draft|teardown|tear (?:it|this) down|break (?:it|this) down|creator link|studio|redo|revise)\b/i;
const NUMBER_WORDS = /\b(roas|cpa|mer|spend|spent|pacing|revenue|sales|budget|ctr|cpm|numbers?|conversions?|orders)\b/i;
/**
 * A mention in a brand's internal channel is the idea bot's when:
 *   - it says "strategist": never (that is how to reach the Strategist in an idea thread);
 *   - the thread already has an idea draft (a re-tag revises it);
 *   - the mention uses an idea word (idea, brief, draft, teardown, creator link, studio...);
 *   - the thread carries a TikTok / Instagram / YouTube link or an uploaded video;
 *   - the thread carries an image and the mention is not about the numbers;
 *   - it is a bare tag inside a thread ("read this and draft it").
 * Everything else stays the Strategist's, exactly as before.
 */
export async function ideaWanted(env, ev) {
  if (!ev || ev.type !== 'app_mention' || ev.channel_type === 'im') return false;
  const said = stripTags(ev.text);
  if (/\bstrategist\b/i.test(said)) return false;
  await ensureIdeaTables(env);
  const root = ev.thread_ts || ev.ts;
  if (await env.DB.prepare(`SELECT 1 AS x FROM idea_thread WHERE id = ?1`).bind(`${ev.channel}:${root}`).first()) return true;
  if (IDEA_WORDS.test(said)) return true;
  const own = { social: linksOf(ev.text).some(classifyLink), video: (ev.files || []).some(isVideoFile), image: (ev.files || []).some(isImageFile) };
  if (own.social || own.video) return true;
  if (own.image && !NUMBER_WORDS.test(said)) return true;
  if (!ev.thread_ts) return false;
  if (said.length < 3) return true;
  const r = await slack(env, 'conversations.replies', { channel: ev.channel, ts: root, limit: 100 }, true);
  const msgs = (r.messages || []).filter(m => !m.bot_id);
  if (msgs.some(m => linksOf(m.text).some(classifyLink) || (m.files || []).some(isVideoFile))) return true;
  return msgs.some(m => (m.files || []).some(isImageFile)) && !NUMBER_WORDS.test(said);
}

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

/* Facts only. The judgement is Claude's, with the brand brain; this just has to be right. */
const FACTS_PROMPT = `Watch this short-form video and report FACTS only, no opinions and no advice. Reply with JSON with exactly these keys:
{"format": [one or more of: yapper, pov, green screen, skit, demo, testimonial, unboxing, street interview, voiceover b-roll, slideshow, before and after, tutorial, reaction, stitch or duet, founder story, other],
 "length_seconds": number,
 "hook": {"spoken": "the words said in the first 3 seconds, verbatim", "on_screen_text": "text on screen in the first 3 seconds, verbatim", "visual": "what is on screen in the first 3 seconds"},
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
export async function videoFacts(env, v, meter) {
  const hit = await env.DB.prepare(`SELECT facts_json FROM idea_media WHERE key = ?1 AND status = 'ok'`).bind(v.key).first().catch(() => null);
  if (hit) { meter.videos_cached++; const facts = safeJson(hit.facts_json, {}); return { facts, cached: true, image_urls: facts.atria?.image_urls || [] }; }
  if (v.platform === 'atria') return atriaFacts(env, v, meter);
  const what = v.platform === 'slack' ? `the uploaded video (${v.label})` : `the ${PLATFORM[v.platform]} video (${v.label})`;
  if (!env.GEMINI_API_KEY) return { note: `I could not watch ${what}: the video reader is not switched on yet (GEMINI_API_KEY is missing on the worker). I worked from the words in the thread.`, missing: 'gemini' };
  try {
    let part, meta = {};
    if (v.platform === 'youtube') part = { file_data: { file_uri: v.url } };
    else {
      let res, mime = 'video/mp4', size = 0;
      if (v.platform === 'slack') {
        res = await F(v.file.url, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
        if (!res.ok || /text\/html/.test(res.headers.get('content-type') || '')) return { note: `I could not download ${what} from Slack (the app needs the files:read scope).` };
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
      const file = await geminiUpload(env, res, mime, size, v.key);
      part = { file_data: { mime_type: file.mimeType || mime, file_uri: file.uri } };
    }
    const g = await geminiFacts(env, part, meter);
    const facts = { ...g.facts, ...(meta.caption ? { post_caption: meta.caption } : {}), ...(meta.author ? { posted_by: meta.author } : {}) };
    const cost = (g.g_in * PRICE.g_in + g.g_out * PRICE.g_out) / 1e6;
    await env.DB.prepare(`INSERT INTO idea_media (key, platform, url, status, facts_json, g_in, g_out, cost) VALUES (?1, ?2, ?3, 'ok', ?4, ?5, ?6, ?7)
      ON CONFLICT(key) DO UPDATE SET facts_json = excluded.facts_json, status = 'ok', g_in = excluded.g_in, g_out = excluded.g_out, cost = excluded.cost`)
      .bind(v.key, v.platform, v.url || v.file?.name || null, JSON.stringify(facts).slice(0, 60000), g.g_in, g.g_out, cost).run();
    meter.videos_new++;
    return { facts };
  } catch (e) {
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
  };
}
const ATRIA_OFF = 'Atria is not connected, so I could not open the Atria ad; Cole can connect it in Locus (Studio, Connect Atria). I worked from the words in the thread.';

/** An Atria (or Meta Ad Library) ad: the ad's details from Atria, then its video watched once like an upload. Never throws. */
async function atriaFacts(env, v, meter) {
  let a;
  try { a = await atriaAd(env, v.atria); } catch (e) { a = { ok: false, reason: 'failed', message: e.message }; }
  if (!a.ok) return { note: a.reason === 'not_connected' ? ATRIA_OFF
    : a.reason === 'not_found' ? `That ad (${v.label}) is not in Atria's library, so I worked from the words in the thread.`
    : `I could not open the Atria ad (${v.label}): ${clip(a.message || 'Atria did not answer', 160)}. I worked from the words in the thread.` };
  const atria = atriaSummary(a);
  const vid = ((a.ad.videos || [])[0] || {}).url || '';
  const save = async (facts, g = { g_in: 0, g_out: 0 }) => {
    const cost = (g.g_in * PRICE.g_in + g.g_out * PRICE.g_out) / 1e6;
    await env.DB.prepare(`INSERT INTO idea_media (key, platform, url, status, facts_json, g_in, g_out, cost) VALUES (?1, 'atria', ?2, 'ok', ?3, ?4, ?5, ?6)
      ON CONFLICT(key) DO UPDATE SET facts_json = excluded.facts_json, status = 'ok', g_in = excluded.g_in, g_out = excluded.g_out, cost = excluded.cost`)
      .bind(v.key, v.url, JSON.stringify(facts).slice(0, 60000), g.g_in, g.g_out, cost).run();
  };
  if (!/^https:\/\//.test(vid)) {
    /* An image (or a carousel): the pictures go to Claude as images, the words ride in the breakdown. */
    const facts = { atria };
    await save(facts);
    return { facts, image_urls: atria.image_urls };
  }
  if (!env.GEMINI_API_KEY) return { facts: { atria }, note: `I could not watch the Atria video (${v.label}): the video reader is not switched on yet (GEMINI_API_KEY is missing on the worker). I used Atria's transcript and details.` };
  try {
    const res = await F(vid);
    if (!res.ok || /text\/html|json/.test(res.headers.get('content-type') || '')) throw new Error(`the video file would not download (${res.status})`);
    const size = +(res.headers.get('content-length') || 0);
    if (size > MAX_VIDEO_BYTES) return { facts: { atria }, note: `The Atria video (${v.label}) is over 300MB, so I used Atria's transcript and details only.` };
    const file = await geminiUpload(env, res, 'video/mp4', size, v.key);
    const g = await geminiFacts(env, { file_data: { mime_type: file.mimeType || 'video/mp4', file_uri: file.uri } }, meter);
    const facts = { ...g.facts, atria };
    await save(facts, g);
    meter.videos_new++;
    return { facts };
  } catch (e) {
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
async function imageBlock(env, url, slackFile) {
  const r = await F(url, slackFile ? { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } } : {}).catch(() => null);
  const type = (r?.headers.get('content-type') || '').split(';')[0].trim();
  if (!r?.ok || !/^image\/(png|jpeg|gif|webp)$/.test(type)) return { note: slackFile ? 'I could not open an attached image (the app needs the files:read scope).' : 'I could not open an image from that post.' };
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
  asana: obj({ title: S, kind: en('static', 'video'), test_type: en('angle', 'concept', 'iteration'), angle: S, why: S, concept: S, testing: S,
    ads: arr(S), creator: S, length: S, hooks: arr(S), script: S, broll: S, editor_notes: S, primary_text: S, headline: S, offer: S }),
  studio: obj({ name: S, angle: S, why: S, concept: S, testing: en(...STUDIO_TESTING), post_copy: S, lines: arr(S) }),
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

TEARDOWN: why the reference works for its audience: the awareness stage, the sophistication stage, the desire it hits, the mechanism, the proof it uses, and why the hook stops the scroll. Then what is weak or not worth copying. Specific to this reference: if a sentence would fit any ad, cut it. A typed idea with no reference gets the same treatment for the idea itself.

QUESTIONS: 0 to 3, only when the brand brain AND the thread truly lack something you need (for example which persona or which product). blocking = true only when any draft would be a guess without the answer.

DESTINATION (pick one, say why in one line):
- creator_link: a UGC idea creators can film from a short pitch (the brand's public creator link).${lucky ? '\n- lucky_creators: Lucky Golf\'s own creator app; same shape as the creator link.' : ''}
- asana_brief: a paid ad the team produces as a test with numbered ads.
- studio: static image ads the AI can make now from lines of words.

DRAFTS: write ONLY the draft for the destination you picked. Leave the other destinations' strings empty and their arrays empty: the team presses a button for another one if they want it (this keeps each run cheap). Keep every field tight: enough for the person building it, no padding.
- creator_link follows the hierarchy rule. The section answers "why would a creator film this today": Hot right now, a dated window, a product line, or a standing theme. Format and product are chips on the card, never a section. Use an existing section id when one fits; otherwise leave section_id empty and give new_section plus one new_section_line. If an existing angle already makes this argument, put its id in duplicate_of: the reference then goes on it as proof instead of a new angle. openers are first lines a creator could say; shots are the few shots to film. proof_note says in one line what to take from the reference. This draft is PUBLIC: never mention money, spend, revenue, ROAS, CPA, orders or sales numbers anywhere in it.
- asana is the team's brief template: title (a few words), angle, why it works, concept, testing (what changes) and test_type, then 3 to 5 numbered ads unless the thread asks otherwise, each enough for the designer or editor to build it. kind is video for anything filmed, static for images. For video also creator, length, three hooks, a script, b-roll and editor notes; for static leave those empty. Copy fields only when you have something real to say.
- studio: static ads only, one line per ad: the words on the ad plus a short note on the look. testing is what changes across the lines.

${SPECIFICITY}

No em dashes anywhere. Plain English, like a person talking to a colleague.`;
}

function transcriptOf(t) {
  return t.msgs.map((m, i) => `${i + 1}. ${m.name}: ${m.text || '(no words)'}${m.tags.length ? ` [${m.tags.join(', ')}]` : ''}`).join('\n');
}

async function hubOf(env, act) {
  const q = (sql) => env.DB.prepare(sql).bind(act).all().then(r => r.results || []).catch(() => []);
  const brand = await env.DB.prepare(`SELECT slug, live FROM p_amb_brand WHERE act_id = ?1`).bind(act).first().catch(() => null);
  const [sections, angles] = await Promise.all([
    q(`SELECT id, name, line, enabled FROM p_amb_section WHERE act_id = ?1 ORDER BY pinned DESC, sort, created_at`),
    q(`SELECT a.id, a.title, a.argument, a.format, s.name AS section FROM p_amb_angle a LEFT JOIN p_amb_section s ON s.id = a.section_id WHERE a.act_id = ?1 AND a.status = 'live' ORDER BY a.sort LIMIT 80`),
  ]);
  return { brand, sections, angles };
}

/* ---------------- money never reaches the public link ---------------- */
/* A sentence goes if it names a paid-media metric, or pairs a number with spend, revenue, sales,
   orders, profit or margin. A plain price ("$29, two for $50") is a product fact and stays. */
const METRIC = /\b(roas|cpa|mer|cpm|ctr|aov|ad spend)\b/i;
const MONEY_WORD = /\b(spend|spent|revenue|sales|orders|profit|margin|converted|conversions?)\b/i;
const moneyish = x => METRIC.test(x) || (MONEY_WORD.test(x) && /\d/.test(x)) || /\$\s?\d[\d,.]*\s?[kKmM]\b/.test(x);
export function noMoney(s) {
  if (!s) return '';
  return String(s).split(/(?<=[.!?])\s+/).filter(x => !moneyish(x)).join(' ').trim();
}
function cleanCreator(c) {
  const o = { ...c };
  for (const k of ['title', 'argument', 'who', 'format', 'products', 'on_screen', 'do_text', 'dont_text', 'proof_note', 'new_section', 'new_section_line']) o[k] = noMoney(o[k]);
  o.openers = (o.openers || []).map(noMoney).filter(Boolean);
  o.shots = (o.shots || []).map(s => ({ label: noMoney(s.label), text: noMoney(s.text) })).filter(s => s.text);
  return o;
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
  if (c.on_screen) lines.push(`On screen: ${esc(c.on_screen)}`);
  if (c.do_text) lines.push(`Do: ${esc(c.do_text)}`);
  if (c.dont_text) lines.push(`Don't: ${esc(c.dont_text)}`);
  lines.push(`Proof: the reference, shown as another brand (inspiration).${c.proof_note ? ` ${esc(c.proof_note)}` : ''}`);
  return lines.filter(Boolean).join('\n');
}
/* The model often numbers its own lines ("1. SCISSORS"); the card numbers them too. */
const unnum = x => String(x || '').replace(/^\s*\d+\s*[.):-]\s*/, '');
function asanaText(a) {
  if (!a?.title) return '';
  const l = [`*Asana brief*  ·  ${a.kind === 'video' ? 'Video' : 'Static'}, ${TEST_TYPE[a.test_type] || 'concept test'}`, `*${esc(a.title)}*`,
    `*Angle:* ${esc(a.angle)}`, `*Why it works:* ${esc(a.why)}`];
  if (a.concept) l.push(`*Concept:* ${esc(a.concept)}`);
  l.push(`*Testing:* ${esc(a.testing)}`, '*Ads*', ...(a.ads || []).map((x, i) => `${i + 1}. ${esc(unnum(x))}`));
  if (a.kind === 'video') {
    if (a.creator) l.push(`*Creator:* ${esc(a.creator)}`);
    if (a.length) l.push(`*Length:* ${esc(a.length)}`);
    (a.hooks || []).forEach((h, i) => l.push(`*Hook ${i + 1}:* ${esc(h)}`));
    if (a.script) l.push(`*Script:* ${esc(a.script)}`);
    if (a.broll) l.push(`*B-roll:* ${esc(a.broll)}`);
    if (a.editor_notes) l.push(`*Editor notes:* ${esc(a.editor_notes)}`);
  }
  if (a.primary_text) l.push(`*Primary text:* ${esc(a.primary_text)}`);
  if (a.headline) l.push(`*Headline:* ${esc(a.headline)}`);
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

/** The whole card, rendered from the row. Every change to the row ends in a redraw. */
export function ideaCard(row, acct, hub) {
  const d = safeJson(row.draft_json, null) || {};
  const pushed = safeJson(row.pushed_json, {}) || {};
  const notes = safeJson(row.notes_json, []) || [];
  const lucky = /lucky/i.test(acct?.name || '');
  const title = `*${esc(acct?.name || 'Idea')}: idea from ${esc(row.from_name || 'the team')}*${row.runs > 1 ? '  (revised)' : ''}`;
  if (row.status === 'discarded') return { text: 'Idea discarded', blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `${title}\n_Discarded${pushed.discarded_by ? ` by ${esc(pushed.discarded_by)}` : ''}. Tag me again to start over._` } }] };
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: title } }];
  const qs = (d.questions || []).filter(q => q.q);
  if (row.status === 'questions') {
    blocks.push(...sections(`Before I draft this, I need:\n${qs.map((q, i) => `${i + 1}. ${esc(q.q)}`).join('\n')}`));
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Answer in this thread and tag me again.${row.last_cost ? `  ·  This run cost about $${row.last_cost.toFixed(2)}.` : ''}` }] });
    return { text: `Questions before I draft the ${acct?.name || ''} idea`, blocks };
  }
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
  const pick = d.destination?.pick === 'lucky_creators' && !lucky ? 'creator_link' : d.destination?.pick;
  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Take:* ${MODE[tr.mode] || 'A mix'}. ${esc(tr.reason)}${tr.disagreement ? `\n_${esc(tr.disagreement)}_` : ''}\n*Best home:* ${DESTS[pick] || 'Asana brief'}. ${esc(d.destination?.reason)}` } });
  if (qs.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Worth answering: ${qs.map(q => esc(q.q)).join('  /  ')}` }] });
  blocks.push({ type: 'divider' });
  const draft = pick === 'asana_brief' ? asanaText(d.asana) : pick === 'studio' ? studioText(d.studio) : creatorText(d.creator_link, hub, pick === 'lucky_creators');
  blocks.push(...sections(draft || asanaText(d.asana) || studioText(d.studio) || creatorText(d.creator_link, hub, lucky)));
  const others = Object.keys(DESTS).filter(k => k !== pick && k !== 'lucky_creators' && has(d)[k]).map(k => DESTS[k]);
  if (others.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Drafts for ${others.join(' and ')} are ready too: the buttons send them as drafted.` }] });
  const done = [];
  if (pushed.creator_link) done.push(`✓ On the creator link: ${pushed.creator_link.url ? `<${pushed.creator_link.url}|${esc(pushed.creator_link.title)}>` : esc(pushed.creator_link.title)}`);
  if (pushed.lucky_creators) done.push('✓ Saved for the Lucky creator app (hookup is next)');
  if (pushed.asana_brief) done.push(`✓ Asana: <${pushed.asana_brief.url}|${esc(pushed.asana_brief.name)}>`);
  if (pushed.studio) done.push(`✓ Studio: batch "${esc(pushed.studio.name)}" (<${LOCUS}|open Locus>)`);
  if (done.length) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: done.join('\n') } });
  const els = [];
  for (const k of Object.keys(DESTS)) {
    if (k === 'lucky_creators' && !lucky) continue;
    if (pushed[k]) continue;
    /* Only the suggested destination is drafted up front; the rest cost a press of "Make ... draft". */
    if (!has(d)[k]) { if (row.status !== 'questions') els.push({ ...btn(`Make ${DESTS[k]} draft`, 'idea_make', row.id), value: JSON.stringify({ i: row.id, k }) }); continue; }
    els.push(btn(`${DESTS[k]}${k === pick ? ' (suggested)' : ''}`, ACTION_OF[k], row.id, k === pick ? { style: 'primary' } : {}));
  }
  if (pushed.creator_link) els.push(btn('Undo creator link', 'idea_undo_link', row.id, { style: 'danger' }));
  els.push(btn('Redo', 'idea_redo', row.id));
  els.push(btn('Discard', 'idea_discard', row.id, { style: 'danger', confirm: { title: { type: 'plain_text', text: 'Discard this draft?' }, text: { type: 'plain_text', text: 'The draft is dropped. Anything already sent on stays where it is.' }, confirm: { type: 'plain_text', text: 'Discard' }, deny: { type: 'plain_text', text: 'Keep it' } } }));
  blocks.push({ type: 'actions', elements: els.slice(0, 25) });
  const ctxs = [...notes.map(esc)];
  if (row.last_cost) ctxs.push(`This run cost about $${row.last_cost.toFixed(2)}${row.cost > row.last_cost ? ` ($${row.cost.toFixed(2)} for this thread so far)` : ''}. Only Cole and Ahsan can send it on.`);
  if (ctxs.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: clip(ctxs.join('\n'), 2900) }] });
  return { text: `Draft for the ${acct?.name || ''} idea`, blocks: blocks.slice(0, 50) };
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
const acctsOf = env => env.DB.prepare(`SELECT act_id, name, slack_channel FROM accounts WHERE active = 1`).all().then(r => r.results || []).catch(() => []);

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
  await env.DB.prepare(`INSERT INTO idea_thread (id, act_id, channel, thread_ts, status) VALUES (?1, ?2, ?3, ?4, 'working')
    ON CONFLICT(id) DO UPDATE SET act_id = excluded.act_id, status = 'working', updated_at = datetime('now')`).bind(id, acct.act_id, job.channel, job.root).run();
  await env.DB.prepare(`INSERT INTO idea_run (id, idea_id, act_id, kind) VALUES (?1, ?2, ?3, ?4)`).bind(runId, id, acct.act_id, job.kind || 'draft').run();
  const prevStatus = row?.status && row.status !== 'working' ? row.status : null;
  try {
    const rep = await slack(env, 'conversations.replies', { channel: job.channel, ts: job.root, limit: 200 }, true);
    if (!rep.ok) throw Object.assign(new Error(`I could not read this thread: ${slackWhy(rep.error || 'error')}.`), { plain: true });
    const names = await userNames(env, (rep.messages || []).filter(m => !m.bot_id).map(m => m.user));
    const t = parseThread(rep.messages, { botUser: job.bot, names });
    if (!t.msgs.length) throw Object.assign(new Error('There is nothing in this thread for me to read yet.'), { plain: true });
    const notes = [];

    /* Videos: each watched once, ever. */
    const breakdowns = [], imgs = [];
    for (const v of t.videos.slice(0, MAX_VIDEOS)) {
      const r = await videoFacts(env, v, meter);
      if (r.facts) breakdowns.push(`${v.label} (${PLATFORM[v.platform]}${v.url ? ` ${v.url}` : ''}${r.cached ? ', read before' : ''}):\n${clip(JSON.stringify(r.facts), 12000)}`);
      else if (r.image_url) imgs.push({ label: v.label, url: r.image_url, slack: false });
      (r.image_urls || []).forEach((u, i) => imgs.push({ label: r.image_urls.length > 1 ? `${v.label}.${i + 1}` : v.label, url: u, slack: false }));
      if (r.note) notes.push(r.note);
    }
    if (t.videos.length > MAX_VIDEOS) notes.push(`Only the first ${MAX_VIDEOS} videos were watched.`);
    for (const im of t.images) imgs.push({ label: im.label, url: im.file.url, slack: true });
    const imageBlocks = [];
    for (const im of imgs.slice(0, MAX_IMAGES)) {
      const r = await imageBlock(env, im.url, im.slack);
      if (r.block) imageBlocks.push({ type: 'text', text: `IMAGE ${im.label}:` }, r.block);
      if (r.note) notes.push(r.note);
    }
    if (imgs.length > MAX_IMAGES) notes.push(`Only the first ${MAX_IMAGES} images were read.`);

    const brain = await brandBrain(env, acct.act_id).catch(() => ({ md: '' }));
    const hub = await hubOf(env, acct.act_id);
    const prev = job.kind !== 'redo' && row?.draft_json ? row.draft_json : null;
    const fresh = prev && row.seen_ts ? t.msgs.filter(m => +m.ts > +row.seen_ts) : [];
    const user = [
      { type: 'text', text: `BRAND: ${acct.name}\n\nTHE THREAD (oldest first; V1, V2 are the videos broken down below, I1, I2 the images attached):\n${clip(transcriptOf(t), 30000)}\n\nTHE TAG THAT CALLED YOU: "${clip(stripTags(job.text), 600) || '(just the tag)'}"` },
      ...(breakdowns.length ? [{ type: 'text', text: `VIDEO BREAKDOWNS (facts from a video model):\n\n${breakdowns.join('\n\n')}` }] : []),
      ...(notes.length ? [{ type: 'text', text: `MEDIA I COULD NOT READ (work from the thread's words for these):\n${notes.join('\n')}` }] : []),
      ...imageBlocks,
      { type: 'text', text: `THE CREATOR LINK NOW (${hub.brand ? `/angles/${hub.brand.slug}, ${hub.brand.live ? 'live' : 'switched off'}` : 'this brand has no creator link yet'}):\nSections: ${hub.sections.map(s => `[${s.id}] ${s.name}${s.line ? `: ${s.line}` : ''}${s.enabled ? '' : ' (off)'}`).join('; ') || 'none'}\nAngles:\n${hub.angles.map(a => `[${a.id}] ${a.title} (${a.section || 'no section'}; ${a.format || ''}): ${clip(a.argument, 200)}`).join('\n') || 'none'}` },
      ...(prev ? [{ type: 'text', text: `YOUR LAST DRAFT FOR THIS THREAD (revise it with what people said since; keep what nobody pushed back on):\n${clip(prev, 20000)}\n\nNEW MESSAGES SINCE THAT DRAFT: ${fresh.length ? fresh.map(m => `${m.name}: ${m.text}`).join(' / ') : 'none, they just asked again'}` }] : []),
    ];
    /* "Make <destination> draft" button: only that one draft is written, on top of the stored one,
       so the output (the expensive part) stays small; the system block is usually still cached. */
    const makeKey = job.kind === 'make' && prev ? DRAFT_KEY[job.dest] : null;
    if (makeKey) user.push({ type: 'text', text: `NOW WRITE ONLY THE ${DESTS[job.dest].toUpperCase()} DRAFT for this idea, consistent with your last draft's teardown and take. Return only that one field.` });
    const m = await claude(env, {
      system: [{ type: 'text', text: systemText(acct.name, lucky) }, ...(brain.md ? [brainBlock(brain.md)] : [])],
      user, schema: makeKey ? obj({ [makeKey]: IDEA_SCHEMA.properties[makeKey] }) : IDEA_SCHEMA, effort: 'medium', maxTokens: 16000,
    }, null, meter);
    const u = m.usage || {};
    const d = makeKey ? { ...safeJson(prev, {}), [makeKey]: nd(jsonOf(m))[makeKey] } : nd(jsonOf(m));
    if (d.creator_link) d.creator_link = cleanCreator(d.creator_link);
    const blocking = (d.questions || []).some(q => q.blocking && q.q);
    const cost = ((u.input_tokens || 0) * PRICE.in + (u.cache_creation_input_tokens || 0) * PRICE.write + (u.cache_read_input_tokens || 0) * PRICE.read
      + (u.output_tokens || 0) * PRICE.out + meter.g_in * PRICE.g_in + meter.g_out * PRICE.g_out) / 1e6 + meter.downloads * PRICE.download;
    const refs = t.videos.filter(v => v.platform !== 'slack').map(v => v.link || v.url);
    const from = t.msgs[0]?.name || 'the team';
    const status = blocking ? 'questions' : (prevStatus === 'pushed' ? 'pushed' : 'drafted');
    await env.DB.prepare(`UPDATE idea_thread SET status = ?2, from_name = ?3, refs_json = ?4, draft_json = ?5, seen_ts = ?6, notes_json = ?7,
      runs = runs + 1, cost = cost + ?8, last_cost = ?8, updated_at = datetime('now') WHERE id = ?1`)
      .bind(id, status, from, JSON.stringify(refs), JSON.stringify(d), t.msgs[t.msgs.length - 1].ts, JSON.stringify(notes), cost).run();
    row = await getRow(env, id);
    /* A revision is a new reply, so the thread reads in order; the old card stops offering buttons. */
    if (row.reply_ts) await slack(env, 'chat.update', { channel: job.channel, ts: row.reply_ts, text: 'Replaced by the newer draft below.',
      blocks: [{ type: 'context', elements: [{ type: 'mrkdwn', text: '_Replaced by the newer draft below._' }] }] });
    const card = ideaCard(row, acct, hub);
    const posted = await say(env, job.channel, job.root, card.text, card.blocks);
    if (!posted.ok) throw Object.assign(new Error(`I could not post the draft: ${slackWhy(posted.error || 'error')}.`), { plain: true });
    await env.DB.prepare(`UPDATE idea_thread SET reply_ts = ?2 WHERE id = ?1`).bind(id, posted.ts).run();
    await env.DB.prepare(`UPDATE idea_run SET status = 'done', c_in = ?2, c_cache_read = ?3, c_cache_write = ?4, c_out = ?5, g_in = ?6, g_out = ?7,
      downloads = ?8, videos_new = ?9, videos_cached = ?10, cost = ?11, finished_at = datetime('now') WHERE id = ?1`)
      .bind(runId, u.input_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0, u.output_tokens || 0,
        meter.g_in, meter.g_out, meter.downloads, meter.videos_new, meter.videos_cached, Math.round(cost * 10000) / 10000).run();
    console.log(`idea ${id} ${acct.name}: $${cost.toFixed(4)} (claude in ${u.input_tokens || 0}, cache read ${u.cache_read_input_tokens || 0}, write ${u.cache_creation_input_tokens || 0}, out ${u.output_tokens || 0}; gemini ${meter.g_in}/${meter.g_out}; videos new ${meter.videos_new}, cached ${meter.videos_cached})`);
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

/* ---------------- the buttons ---------------- */
export const approversOf = env => String(env.IDEA_APPROVERS || DEFAULT_APPROVERS).split(/[\s,]+/).filter(Boolean);
const GATED = new Set(['idea_link', 'idea_lucky', 'idea_asana', 'idea_studio', 'idea_undo_link', 'idea_discard']);

export async function handleIdeaAction(env, ctx, p) {
  const a = (p.actions || []).find(x => /^idea_/.test(x.action_id || '')) || {};
  const aid = a.action_id || '';
  if (aid === 'idea_open') return ACK();
  const chan = p.container?.channel_id || p.channel?.id || null;
  const user = p.user?.id || null;
  const val = safeJson(a.value, {}) || {};
  const job = (async () => {
    await ensureIdeaTables(env);
    const row = val.i ? await getRow(env, String(val.i)) : null;
    if (!row || row.channel !== chan) return whisper(env, chan, user, 'That idea is no longer stored, so this button cannot do anything. Tag me in the thread for a fresh draft.');
    if (GATED.has(aid) && !approversOf(env).includes(user)) return whisper(env, chan, user, 'Only Cole or Ahsan can send an idea on. Anyone can tag me for a draft or press Redo.', row.thread_ts);
    if (row.status === 'discarded' && aid !== 'idea_redo') return whisper(env, chan, user, 'That draft was discarded. Tag me again to start over.', row.thread_ts);
    if (aid === 'idea_make') {
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
      else if (aid === 'idea_lucky') { pushed.lucky_creators = { at: new Date().toISOString(), by: who }; reply = { text: 'Lucky creator app hookup is next. The draft is saved with this thread so it can be pushed the moment the app is connected.' }; }
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
    let sid = c.section_id ? (await env.DB.prepare(`SELECT id FROM p_amb_section WHERE id = ?1 AND act_id = ?2`).bind(c.section_id, act).first())?.id : null;
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
    angleId = rid();
    const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM p_amb_angle WHERE act_id = ?1`).bind(act).first();
    await env.DB.prepare(`INSERT INTO p_amb_angle (id, act_id, section_id, hot, status, title, argument, who, products, format, lever,
        openers_json, shots_json, on_screen, do_text, dont_text, trend, sort, hot_sort) VALUES (?1, ?2, ?3, 0, 'live', ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?10, ?11, ?12, ?13, NULL, ?14, 0)`)
      .bind(angleId, act, sid || null, clip(c.title, 120), clip(c.argument, 300), clip(c.who, 400), clip(c.products, 160), clip(c.format, 60),
        JSON.stringify((c.openers || []).slice(0, 8).map(o => clip(o, 200))), JSON.stringify((c.shots || []).slice(0, 6).map(s => ({ label: clip(s.label, 40), text: clip(s.text, 400) }))),
        clip(c.on_screen, 200), clip(c.do_text, 400), clip(c.dont_text, 400), mx?.n || 1).run();
    created.angle = angleId;
  }
  for (const url of (safeJson(row.refs_json, []) || []).slice(0, 2).map(publicRef)) {
    if (await env.DB.prepare(`SELECT id FROM p_amb_proof WHERE angle_id = ?1 AND url = ?2`).bind(angleId, url).first()) continue;
    const pid = rid();
    const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM p_amb_proof WHERE angle_id = ?1`).bind(angleId).first();
    await env.DB.prepare(`INSERT INTO p_amb_proof (id, act_id, angle_id, kind, url, who, note, shown, sort) VALUES (?1, ?2, ?3, 'inspo', ?4, 'Another brand (inspiration)', ?5, 1, ?6)`)
      .bind(pid, act, angleId, clip(url, 500), clip(c.proof_note, 300) || null, mx?.n || 1).run();
    created.proofs.push(pid);
  }
  const link = `${ANGLES}${b.slug}`;
  pushed.creator_link = { angle_id: angleId, title, url: link, created, live: !!b.live, at: new Date().toISOString() };
  const what = created.angle ? `New angle "${title}" is on the ${acct.name} creator link` : `The reference is now proof on "${title}" on the ${acct.name} creator link`;
  const text = `${what}: ${link}${b.live ? '' : ' (the link is switched off, so creators do not see it yet)'}${!created.proofs.length && !created.angle ? '. Nothing new to add: that reference was already there.' : ''}`;
  return { text, blocks: [{ type: 'section', text: { type: 'mrkdwn', text: esc(text).replace(esc(link), `<${link}|${esc(link)}>`) } },
    { type: 'actions', elements: [btn('Undo', 'idea_undo_link', row.id, { style: 'danger' })] }] };
}
export async function undoCreator(env, row, pushed) {
  const p = pushed.creator_link;
  if (!p) return { ok: false, text: 'Nothing on the creator link to take back.' };
  const act = row.act_id, cr = p.created || {};
  for (const pid of cr.proofs || []) await env.DB.prepare(`DELETE FROM p_amb_proof WHERE id = ?1 AND act_id = ?2`).bind(pid, act).run();
  if (cr.angle) {
    await env.DB.prepare(`DELETE FROM p_amb_proof WHERE angle_id = ?1 AND act_id = ?2`).bind(cr.angle, act).run();
    await env.DB.prepare(`DELETE FROM p_amb_angle WHERE id = ?1 AND act_id = ?2`).bind(cr.angle, act).run();
  }
  if (cr.section && !(await env.DB.prepare(`SELECT 1 AS x FROM p_amb_angle WHERE section_id = ?1`).bind(cr.section).first()))
    await env.DB.prepare(`DELETE FROM p_amb_section WHERE id = ?1 AND act_id = ?2`).bind(cr.section, act).run();
  delete pushed.creator_link;
  return { text: `Taken back off the creator link: "${p.title}".` };
}

/* Asana: a numbered task in the brand's Creative Brief section, in the team's template
   (asana-brand.js BRIEF_STATIC / BRIEF_VIDEO), credited to whoever had the idea. The
   project webhook then syncs it into the Brand tab like any other brief. */
export function briefHtml(a, { num, from, permalink, refs = [] }) {
  const x = xesc, line = (k, v) => `<strong>${k}:</strong> ${x(v || '')}`;
  const ads = (a.ads || []).length ? a.ads : [''];
  const parts = [
    `<body><em>Idea from ${x(from || 'the team')}${permalink ? ` in <a href="${x(permalink)}">Slack</a>` : ' in Slack'}. Drafted by Locus.</em>`,
    `<em>${a.kind === 'video' ? 'Video · 9:16' : 'Static · 4:5, plus a 9:16 crop'}</em>`,
    `<h2>The test</h2>${line('Angle', a.angle)}`, line('Why it works', a.why), line('Concept', a.concept),
    line('Testing', `${TEST_TYPE[a.test_type] ? `${TEST_TYPE[a.test_type][0].toUpperCase()}${TEST_TYPE[a.test_type].slice(1)}: ` : ''}${a.testing || ''}`),
    `<h2>The ads</h2><em>One line per ad, enough for the ${a.kind === 'video' ? 'editor' : 'designer'} to build it. Files are named with the test number: ${num}-1, ${num}-2, ${num}-3.</em>`,
    ...ads.map((t, i) => line(`Ad ${i + 1}`, t)),
  ];
  if (a.kind === 'video') parts.push(`<h2>The video</h2>${line('Creator', a.creator)}`, line('Length', a.length),
    ...[0, 1, 2].map(i => line(`Hook ${i + 1}`, (a.hooks || [])[i])), line('Script', a.script), line('B-roll', a.broll), line('Editor notes', a.editor_notes));
  parts.push(`<h2>Copy</h2>${line('Primary text', a.primary_text)}`, line('Headline', a.headline), line('Offer', a.offer || 'none'), line('Landing page', ''),
    `<h2>Files</h2><strong>Inspo:</strong> ${refs.map(u => `<a href="${x(u)}">${x(u)}</a>`).join(' ') || (permalink ? `<a href="${x(permalink)}">the Slack thread</a>` : '')}`,
    '<strong>Frame.io:</strong> </body>');
  return parts.join('\n');
}
async function nextNumber(env, act, gid) {
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

/* Studio: a draft batch in Locus Studio's own table, ready to plan and make. */
export async function pushStudio(env, row, acct, d, pushed) {
  const s = d.studio || {};
  if (!(s.lines || []).length) return { ok: false, text: 'The draft has no Studio lines. Press Redo, or tag me and say it is for Studio.' };
  const id = hex24();
  const brief = { angle: s.angle || '', why: s.why || '', concept: s.concept || '', post_copy: s.post_copy || '',
    testing: STUDIO_TESTING.includes(s.testing) ? s.testing : 'concepts', lines: s.lines.slice(0, 12).map(text => ({ text: clip(text, 1200), inspo: [] })),
    source: 'slack idea', reference: safeJson(row.refs_json, []) || [] };
  const name = clip(s.name || s.angle || 'Idea from Slack', 200);
  await env.DB.prepare(`INSERT INTO p_studio_batch (id, act_id, num, br_batch_id, name, brief_json, setup_json, plan_json, status) VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, NULL, 'draft')`)
    .bind(id, acct.act_id, pushed.asana_brief?.num ? String(pushed.asana_brief.num) : null, name, JSON.stringify(brief), JSON.stringify({ products: [], images: [], swipe: [] })).run();
  pushed.studio = { id, name, at: new Date().toISOString() };
  return { text: `Studio batch "${name}" is waiting in Locus Studio for ${acct.name} (${brief.lines.length} ad${brief.lines.length === 1 ? '' : 's'}). Pick the product there and make it: ${LOCUS}` };
}
