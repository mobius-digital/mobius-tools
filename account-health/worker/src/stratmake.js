/**
 * THE STRATEGIST MAKES THINGS (2026-10-09). Cole: "can it build a nice PDF report? build images right then
 * and there with Studio, analyze it, produce it in the chat? build dashboards and link them? Viktor can do
 * literally all of that." Registered in strategist.js with one import and spreads (makeTools, makeActions,
 * makeHooks); nothing in ask/engine.js is Strategist-specific (the engine got four generic hooks: a tool
 * result may carry image blocks and a cost, onReport, afterSlack).
 *
 *   make_image     Studio's image path (OpenAI GPT Image, the key in p_studio_cfg) from the conversation:
 *                  an ad, a social post, a mockup, a concept, 1:1 / 4:5 / 9:16. A named product brings its
 *                  Shopify photos, up to two photo-library shots and its fingerprint (dna:<brand>:<handle>).
 *                  Stored in R2 at strat/<24 hex>.png, served publicly at /strat/<id>.png. The model SEES the
 *                  result (a tool_result image block, shrunk to 768px JPEG) and may redo it once (redo_of).
 *                  Slack: uploaded into the thread after the answer (a redone image is never posted). Locus:
 *                  inline, with Download and "Open in Studio" (POST /api/strat/studio: a draft batch whose
 *                  one line carries the image as inspiration).
 *   reports        onReport: every make_report gets a public, unguessable link /r/<token> (light, printable,
 *                  Locus header; JSON at /api/report-public?t=) and a PDF at /r/<token>.pdf. THE PDF IS MADE
 *                  IN ANTHROPIC'S CODE SANDBOX with reportlab + matplotlib (scripts/render_report.py, bundled
 *                  into reportpy.js): this worker has no Browser Rendering binding and no npm dependencies, and
 *                  adding puppeteer would break every other deploy of it. Slack: rendered while the answer is
 *                  written and uploaded into the thread after the report text. Locus: made on first click.
 *   run_analysis   A SUB-CALL with the code execution tool (never declared beside web_search / web_fetch,
 *                  which bundle their own): the data the Strategist already fetched goes up through the Files
 *                  API, the sandbox answers the ask and leaves charts / xlsx / csv / pdf in $OUTPUT_DIR, those
 *                  come back through the Files API into R2 and out to Slack or a Locus download.
 *   frame_*        Frame.io V4 (frame.js): frame_list and frame_share (a review link) are tools; frame_folder
 *                  and frame_move are Apply cards. THERE IS NO DELETE, on purpose: deleting a Frame project
 *                  killed ~110 review links on 2026-10-03.
 *
 * Tables (created on first use): strat_media (every image and file made), strat_report (share tokens).
 * Tests: node test-stratmake.mjs (offline, OpenAI / Anthropic / Slack / Frame mocked).
 */
import { brandBrain } from './brain.js';
import { resolveBrandId, storagePrefix, connGet } from './brands.js';
import { frameApi, frameStatus, NEEDS_FRAME } from './frame.js';
import { REPORT_PY } from './reportpy.js';

export const AH_ORIGIN = 'https://mobius-account-health.mobius-digital.workers.dev';
const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const LOCUS_URL = 'https://tools.go-mobius-digital.com/profit/';
const OA = 'https://api.openai.com/v1';
const ANT = 'https://api.anthropic.com/v1';

/* Limits. An image is ~$0.25 to $0.42; an analysis ~$0.10 to $0.40; a PDF under a cent of tokens. */
export const LIMITS = { imagesPerAnswer: 4, imagesPerDay: 60, analysesPerAnswer: 3, analysisMs: 170000, pdfMs: 120000, dataBytes: 2e6, files: 6 };
const SIZES = { '1:1': '1024x1024', '4:5': '1024x1280', '9:16': '1008x1792' };
const IMG_COST = { '1:1': 0.25, '4:5': 0.31, '9:16': 0.42 };
const PRICE = { 'claude-opus-5-5': [4, 20, 0.2], 'claude-sonnet-5-5': [2, 10, 0.2], 'claude-haiku-4-5': [1, 5, 0.1] };
const ANALYST = 'claude-opus-5-5', RENDERER = 'claude-haiku-4-5';
const CE_TYPES = ['code_execution_20260521', 'code_execution_20250825'];

const clip = (s, n) => String(s ?? '').slice(0, n);
const hex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const safeJson = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const brandOfCtx = ctx => ctx?.screen?.act_id || ctx?.screen?.act || null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function b64(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
const unb64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', md: 'text/markdown', json: 'application/json',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', html: 'text/html', svg: 'image/svg+xml', zip: 'application/zip' };
const extOf = name => (String(name).match(/\.([a-z0-9]{1,5})$/i)?.[1] || 'bin').toLowerCase();
const isImg = ext => /^(png|jpe?g|webp|gif)$/.test(ext);
const slugName = s => clip(String(s || 'file').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, ''), 70) || 'file';

/* Per answer state lives on the engine's ctx (one object per answer, both surfaces). */
const stateOf = ctx => (ctx._make ||= { images: 0, analyses: 0, made: {}, redone: new Set(), superseded: new Set(), slackImages: [], pdf: [] });

/* ---------------- storage ---------------- */
let ready = false;
export async function ensureMake(env) {
  if (ready) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS strat_media (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT, mime TEXT, r2_key TEXT NOT NULL, act_id TEXT, title TEXT, prompt TEXT, cost REAL, by TEXT, meta_json TEXT, at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS strat_report (token TEXT PRIMARY KEY, report_id TEXT, title TEXT, act_id TEXT, spec_json TEXT NOT NULL, pdf_key TEXT, cost REAL, by TEXT, at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  ready = true;
}
const mediaUrl = (id, ext) => `${AH_ORIGIN}/strat/${id}.${ext}`;
async function saveMedia(env, { bytes, name, kind, act, title, prompt, cost, by, meta }) {
  if (!env.MEDIA) throw new Error('File storage (R2 MEDIA) is not bound on this worker.');
  await ensureMake(env);
  const id = hex(12), ext = extOf(name), mime = MIME[ext] || 'application/octet-stream';
  const key = `strat/${id}.${ext}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mime }, customMetadata: { name: clip(name, 120) } });
  await env.DB.prepare(`INSERT INTO strat_media (id, kind, name, mime, r2_key, act_id, title, prompt, cost, by, meta_json) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
    .bind(id, kind, clip(name, 120), mime, key, act || null, clip(title, 200) || null, clip(prompt, 4000) || null, cost || 0, by || null, meta ? JSON.stringify(meta) : null).run();
  return { id, ext, mime, url: mediaUrl(id, ext), key };
}

/* ---------------- Slack ---------------- */
async function slackUpload(env, d, { channel, thread, filename, bytes, title, comment }) {
  const a = await d.slack(env, 'files.getUploadURLExternal', { filename, length: bytes.length });
  if (!a?.ok) return { error: `Slack would not take the file: ${a?.error}` };
  const up = await d.xfetch(a.upload_url, { method: 'POST', body: bytes });
  if (!up.ok) return { error: `Upload failed (HTTP ${up.status})` };
  const c = await d.slack(env, 'files.completeUploadExternal', { files: [{ id: a.file_id, title: clip(title || filename, 200) }], channel_id: channel, ...(thread ? { thread_ts: thread } : {}), ...(comment ? { initial_comment: comment } : {}) });
  return c?.ok ? { ok: true, id: a.file_id } : { error: `Slack did not finish the upload: ${c?.error}` };
}

/* ---------------- brands ---------------- */
async function brandFor(env, d, input, ctx) {
  const want = String(input?.brand || '').trim();
  if (want && !/^(agency|all|none)$/i.test(want)) {
    const id = await resolveBrandId(env, want).catch(() => null);
    if (id && /^brand_/.test(id)) return id;
    const accts = await d.listAccounts(env, false);
    const w = want.toLowerCase();
    const a = accts.find(x => x.act_id === want || x.name.toLowerCase() === w) || accts.find(x => x.name.toLowerCase().includes(w));
    if (a) return a.act_id;
  }
  return brandOfCtx(ctx);
}

/* ================================================================== */
/*  1. IMAGES (Studio's path: OpenAI GPT Image)                        */
/* ================================================================== */
async function openaiKey(env) {
  return (await env.DB.prepare(`SELECT value FROM p_studio_cfg WHERE key = 'openai_key'`).first().catch(() => null))?.value || env.OPENAI_API_KEY || '';
}
let MODELS = null;
async function imageModel(F, key) {
  if (MODELS?.key === key) return MODELS.image;
  const r = await F(`${OA}/models`, { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `OpenAI said ${r.status}`);
  const ver = id => (id.match(/\d+(\.\d+)?/g) || ['0']).map(Number);
  const cmp = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const q = (x[i] || 0) - (y[i] || 0); if (q) return q; } return a.length - b.length; };
  const ids = (j.data || []).map(m => m.id);
  const img = ids.filter(id => /^gpt-image/.test(id) && !/mini/.test(id)).sort(cmp);
  MODELS = { key, image: img.pop() || ids.filter(id => /^gpt-image/.test(id)).sort(cmp).pop() || 'gpt-image-1' };
  return MODELS.image;
}
/* Studio's imageCall (profit/worker/src/studio.js), retrying without whatever optional parameter a model refuses. */
async function imageCall(F, key, model, { prompt, images = [], size }) {
  const opts = { size, quality: 'high', ...(images.length ? { input_fidelity: 'high' } : {}) };
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    if (images.length) {
      const fd = new FormData();
      fd.append('model', model); fd.append('prompt', prompt); fd.append('n', '1');
      for (const [k, v] of Object.entries(opts)) fd.append(k, v);
      images.forEach((im, i) => fd.append('image[]', new Blob([im.buf], { type: im.type }), `ref${i}.${(im.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`));
      res = await F(`${OA}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
    } else res = await F(`${OA}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, n: 1, ...opts }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.data?.[0]?.b64_json) return { bytes: unb64(j.data[0].b64_json), usage: j.usage || null };
    const msg = j.error?.message || `OpenAI said ${res.status}`;
    if (res.status === 400) {
      const p = (j.error?.param || '') + ' ' + msg;
      if (/size/i.test(p) && opts.size !== '1024x1536' && opts.size !== '1024x1024') { opts.size = opts.size === '1024x1280' || opts.size === '1008x1792' ? '1024x1536' : 'auto'; continue; }
      if (/input_fidelity/i.test(p) && opts.input_fidelity) { delete opts.input_fidelity; continue; }
      if (/quality/i.test(p) && opts.quality) { delete opts.quality; continue; }
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) { await new Promise(r => setTimeout(r, 3000 * (attempt + 1))); continue; }
    throw new Error(msg);
  }
  throw new Error('The image model kept refusing the request.');
}
/* GPT Image token prices per million: text in, image in, image out (Studio's IMG_PRICE). */
function imageCost(model, usage, fallback) {
  if (!usage) return fallback;
  const [t, i, o] = /mini/.test(model) ? [2, 2.5, 8] : [5, 10, 40];
  const det = usage.input_tokens_details || {};
  const c = ((det.text_tokens ?? usage.input_tokens ?? 0) * t + (det.image_tokens || 0) * i + (usage.output_tokens || 0) * o) / 1e6;
  return c > 0 ? c : fallback;
}

/* The product's photos (Shopify storefront + the photo library) and its fingerprint. */
async function productRefs(env, F, act, want) {
  const out = { title: null, handle: null, images: [], dna: '', notes: [] };
  if (!want) return out;
  const acct = await env.DB.prepare(`SELECT name, tw_shop FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
  const words = String(want).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
  if (acct?.tw_shop) {
    const r = await F(`https://${acct.tw_shop}/products.json?limit=250`, { headers: { 'User-Agent': 'Mozilla/5.0 Locus' } }).catch(() => null);
    const ps = r?.ok ? ((await r.json().catch(() => ({}))).products || []) : [];
    const score = p => words.reduce((s, w) => s + (String(p.title).toLowerCase().includes(w) ? 2 : 0) + (String(p.handle).includes(w) ? 1 : 0), 0);
    const best = ps.map(p => [score(p), p]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])[0]?.[1];
    if (best) {
      out.title = best.title; out.handle = best.handle;
      for (const im of (best.images || []).slice(0, 3)) {
        const u = im.src + (im.src.includes('?') ? '&' : '?') + 'width=1024';
        const res = await F(u).catch(() => null);
        const type = (res?.headers?.get?.('Content-Type') || 'image/jpeg').split(';')[0];
        if (res?.ok && /^image\/(png|jpeg|webp)$/.test(type)) out.images.push({ buf: await res.arrayBuffer(), type });
      }
    } else out.notes.push(`No product on the store matches "${want}"; made without product photos.`);
  } else out.notes.push('This brand has no Shopify store set, so no product photos were used.');
  /* Up to two real shots from the brand's photo library with the product tagged in them. */
  if (env.MEDIA && (out.title || want)) {
    const like = `%${String(out.title || want).toLowerCase().slice(0, 40)}%`;
    const { results } = await env.DB.prepare(`SELECT thumb_key FROM p_asset WHERE act_id = ?1 AND thumb_key IS NOT NULL AND lower(COALESCE(products, '')) LIKE ?2 AND COALESCE(kind, '') != 'look' LIMIT 2`).bind(act, like).all().catch(() => ({ results: [] }));
    for (const r of results || []) { const o = await env.MEDIA.get(r.thumb_key).catch(() => null); if (o) out.images.push({ buf: await o.arrayBuffer(), type: 'image/jpeg' }); }
  }
  if (out.handle) {
    const cfg = k => env.DB.prepare(`SELECT value FROM p_studio_cfg WHERE key = ?1`).bind(k).first().catch(() => null);
    let v = (await cfg(`dna:${act}:${out.handle}`))?.value;
    if (!v) { const pre = await storagePrefix(env, act).catch(() => null); if (pre && pre !== act) v = (await cfg(`dna:${pre}:${out.handle}`))?.value; }
    out.dna = clip(v || '', 3000);
  }
  return out;
}

const LAYOUT = {
  '1:1': 'FORMAT: a SQUARE 1:1 image. Every word, badge and button sits at least 6% in from every edge; the whole product sits inside the frame, nothing important touching an edge.',
  '4:5': 'FORMAT: a 4:5 portrait feed image. Meta crops it to a centred square in some placements, so every word, badge and button sits between 12% and 88% of the height and at least 5% in from each side; the top and bottom 12% hold only scene. The whole product sits inside the frame.',
  '9:16': 'FORMAT: a TALL 9:16 image for Stories and Reels. The scene fills the frame. Every word, badge and button sits between 20% and 62% of the height and at least 6% in from each side; the top 15% and the bottom 35% hold no words (the app draws its own there). The whole product sits between 18% and 85% of the height.',
};
const TYPE_RULES = 'TYPOGRAPHY like a top DTC brand\'s paid social, set by a senior designer: flat, crisp, well kerned letters on a clean grid; at most two typefaces; one clear headline; generous breathing room. NO bevels, glows, outlines, 3D text, metallic or gradient text, drop shadows, or glossy fake badges.';
export function imagePrompt({ brand, kind, brief, words, format, product, dna, nImages, about, fix }) {
  const lines = [];
  if (words?.headline) lines.push(`Headline: "${words.headline}"`);
  if (words?.subline) lines.push(`Smaller line: "${words.subline}"`);
  for (const c of words?.callouts || []) lines.push(`Callout: "${c}"`);
  if (words?.cta) lines.push(`Button: "${words.cta}"`);
  return [
    `Create a finished ${kind || 'image'} for ${brand}.`,
    LAYOUT[format] || LAYOUT['4:5'],
    product ? (nImages ? `The ${nImages} attached image${nImages > 1 ? 's are' : ' is'} the REAL product "${product}": reproduce it exactly, with the same shape, colours, materials, logos and any words printed on it.` : `The product is "${product}".`) : (nImages ? 'The attached images are reference only.' : ''),
    dna ? `THE PRODUCT, EXACTLY (its fingerprint; every point must be true in the image, from any angle):\n${dna}` : '',
    `The brief: ${brief}`,
    about ? `About the brand, for tone, setting and casting only (never write any of it on the image):\n${about}` : '',
    lines.length ? `Put exactly this text on the image, spelled exactly, and no other words:\n${lines.join('\n')}` : (/ad|post|banner|story/i.test(kind || '') ? 'Only put words on it if the brief asks for them.' : 'Put no text on the image.'),
    TYPE_RULES,
    'It must look like a real photograph with real design on top, not a CGI render: natural light, real materials, real depth of field.',
    fix ? `This is a redo. The last version missed: ${fix}. Fix exactly that.` : '',
    'The brief is direction for you, never words to write on the image. No watermark, no extra logos, no made-up words, no price unless it is in the text above.',
  ].filter(Boolean).join('\n\n');
}
/* What the model gets to look at: 768px JPEG through the Images binding, else the PNG if it is small enough. */
async function forModel(env, bytes) {
  if (env.IMAGES) {
    try {
      const r = (await env.IMAGES.input(new Response(bytes).body).transform({ width: 768, height: 768, fit: 'scale-down' }).output({ format: 'image/jpeg', quality: 80 })).response();
      return { media_type: 'image/jpeg', data: b64(new Uint8Array(await r.arrayBuffer())) };
    } catch { /* fall through */ }
  }
  return bytes.length < 3.5e6 ? { media_type: 'image/png', data: b64(bytes) } : null;
}
async function dayCount(env, d) {
  const today = new Date().toISOString().slice(0, 10);
  const cur = safeJson(await d.getSetting(env, 'stratImgDay').catch(() => null), null);
  return cur?.date === today ? cur : { date: today, n: 0 };
}

async function makeImage(env, d, input, ctx) {
  const st = stateOf(ctx);
  if (st.images >= LIMITS.imagesPerAnswer) return { is_error: true, text: `That is ${LIMITS.imagesPerAnswer} images in one answer, the cap. Show what you have.` };
  const redo = input.redo_of ? String(input.redo_of) : null;
  if (redo && !st.made[redo]) return { is_error: true, text: 'redo_of must be the id of an image you made in this answer.' };
  if (redo && st.redone.has(redo)) return { is_error: true, text: 'That image was already redone once. Show the better of the two and say what is still off.' };
  const day = await dayCount(env, d);
  if (day.n >= LIMITS.imagesPerDay) return { is_error: true, text: `The team has made ${day.n} images today, the daily cap. Say so; Studio itself still works.` };
  const key = await openaiKey(env);
  if (!key) return { is_error: true, text: 'The image AI is not connected: open Locus Studio and connect the OpenAI key (Studio shows where). Say exactly that.' };
  const act = await brandFor(env, d, input, ctx);
  if (!act) return { is_error: true, text: 'Which brand is this for? Name it in the brand field.' };
  const acct = (await d.listAccounts(env, false)).find(a => a.act_id === act);
  const brand = acct?.name || act;
  const format = SIZES[input.format] ? input.format : '4:5';
  const F = d.xfetch;
  const prev = redo ? st.made[redo] : null;
  const product = input.product || prev?.product || null;
  const refs = await productRefs(env, F, act, product);
  const about = clip((await brandBrain(env, act).catch(() => null))?.md || '', 1500);
  const prompt = imagePrompt({ brand, kind: input.kind || prev?.kind || 'ad', brief: clip(input.brief || prev?.brief, 2000), words: input.words || prev?.words, format,
    product: refs.title || product, dna: refs.dna, nImages: refs.images.length, about, fix: redo ? clip(input.fix || input.brief, 600) : '' });
  const model = await imageModel(F, key);
  const out = await imageCall(F, key, model, { prompt, images: refs.images, size: SIZES[format] });
  const cost = imageCost(model, out.usage, IMG_COST[format]);
  day.n++; await d.putSetting(env, 'stratImgDay', JSON.stringify(day)).catch(() => {});
  const title = clip(input.title || input.brief || prev?.brief, 80);
  const saved = await saveMedia(env, { bytes: out.bytes, name: `${slugName(brand)}-${slugName(title).slice(0, 40)}.png`, kind: 'image', act, title, prompt, cost, by: ctx?.who || ctx?.ev?.user || null,
    meta: { format, product: refs.title || product, model, redo_of: redo } });
  st.images++;
  st.made[saved.id] = { id: saved.id, brief: input.brief || prev?.brief, words: input.words || prev?.words, kind: input.kind || prev?.kind, product: refs.title || product, format };
  if (redo) { st.redone.add(redo); st.superseded.add(redo); }
  const name = `${slugName(brand)}-${saved.id.slice(0, 6)}.png`;
  if (ctx?.surface === 'slack' && ctx?.channel) st.slackImages.push({ id: saved.id, bytes: out.bytes, name, title: title || 'Image', replaces: redo });
  const media = [{ kind: 'image', id: saved.id, url: saved.url, name, title: title || 'Image', note: `${format} · ${model} · $${cost.toFixed(2)}`, replaces: redo || undefined,
    actions: [{ label: 'Open in Studio', path: '/api/strat/studio', body: { id: saved.id } }] }];
  const look = await forModel(env, out.bytes);
  const text = `Made image ${saved.id} (${format}, ${refs.images.length ? `${refs.images.length} real product photo${refs.images.length > 1 ? 's' : ''}` : 'no product photos'}${refs.dna ? ', fingerprint used' : ''}; $${cost.toFixed(2)}).${refs.notes.length ? ' ' + refs.notes.join(' ') : ''}
LOOK AT IT${look ? ' (attached)' : ''} against the brief: the right product and shape, every word spelled exactly, nothing cut by an edge, the format. ${redo ? 'This was the redo: do not redo again.' : `If it clearly misses, call make_image ONCE more with redo_of="${saved.id}" and fix = what to change. If it is good,`} reply in one or two lines: what it is and anything to tweak in Studio. ${ctx?.surface === 'slack' ? 'It is posted in the thread under your answer.' : 'It shows under your answer with Download and Open in Studio.'}`;
  return { content: [{ type: 'text', text }, ...(look ? [{ type: 'image', source: { type: 'base64', ...look } }] : [])], text, cost, flags: { media } };
}

/* "Open in Studio": the image becomes the inspiration on a one-line draft batch (Studio's ref store). */
async function toStudio(env, id) {
  await ensureMake(env);
  const row = await env.DB.prepare(`SELECT * FROM strat_media WHERE id = ?1`).bind(id).first();
  if (!row || row.kind !== 'image') return { error: 'No such image.' };
  if (!row.act_id) return { error: 'That image has no brand, so it has no Studio.' };
  const obj = await env.MEDIA.get(row.r2_key);
  if (!obj) return { error: 'The image file is gone.' };
  await env.MEDIA.put(`studio/ref/${id}.png`, await obj.arrayBuffer(), { httpMetadata: { contentType: 'image/png' } });
  const meta = safeJson(row.meta_json, {});
  const bid = hex(12);
  const brief = { angle: '', why: '', concept: clip(row.title || '', 400), post_copy: '', testing: 'concepts', source: 'strategist',
    lines: [{ text: clip(row.title || 'From the Strategist', 1200), inspo: [`${PROFIT_ORIGIN}/api/studio/ref/${id}.png`] }] };
  await env.DB.prepare(`INSERT INTO p_studio_batch (id, act_id, num, br_batch_id, name, brief_json, setup_json, plan_json, status) VALUES (?1, ?2, NULL, NULL, ?3, ?4, ?5, NULL, 'draft')`)
    .bind(bid, row.act_id, clip(`From the Strategist: ${row.title || 'image'}`, 200), JSON.stringify(brief), JSON.stringify({ products: [], images: [], swipe: [], product_hint: meta.product || null })).run();
  return { ok: true, batch: bid, note: `In Studio as a draft batch, the image as its inspiration${meta.product ? ` (pick ${meta.product} as the product)` : ''}: ${LOCUS_URL}#studio` };
}

/* ================================================================== */
/*  2 + 3. THE CODE SANDBOX (Anthropic code execution + Files API)     */
/* ================================================================== */
const antHead = env => ({ 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' });
async function filesUpload(env, F, name, bytes, mime) {
  const send = beta => { const fd = new FormData(); fd.append('file', new Blob([bytes], { type: mime }), name); return F(`${ANT}/files`, { method: 'POST', headers: { ...antHead(env), ...(beta ? { 'anthropic-beta': 'files-api-2025-04-14' } : {}) }, body: fd }); };
  let r = await send(false);
  if (!r.ok && r.status !== 401 && r.status !== 429) r = await send(true);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(`Files API upload: ${j.error?.message || r.status}`);
  return j.id;
}
async function filesGet(env, F, id) {
  const m = await F(`${ANT}/files/${id}`, { headers: antHead(env) });
  const meta = await m.json().catch(() => ({}));
  const c = await F(`${ANT}/files/${id}/content`, { headers: antHead(env) });
  if (!c.ok) throw new Error(`Files API download: HTTP ${c.status}`);
  return { name: meta.filename || `${id}.bin`, mime: meta.mime_type || '', bytes: new Uint8Array(await c.arrayBuffer()) };
}
const filesDelete = (env, F, id) => F(`${ANT}/files/${id}`, { method: 'DELETE', headers: antHead(env) }).catch(() => null);
/* Every file the sandbox handed back: bash results list one entry per file left in $OUTPUT_DIR. */
export function outputFileIds(content) {
  const ids = [];
  const walk = (x, parent) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { for (const y of x) walk(y, parent); return; }
    if (x.file_id && x.type !== 'container_upload' && /tool_result/.test(parent || '')) ids.push(x.file_id);
    for (const v of Object.values(x)) if (v && typeof v === 'object') walk(v, x.type && /tool_result/.test(x.type) ? x.type : parent);
  };
  walk(content, '');
  return [...new Set(ids)];
}
const costOf = (model, u = {}) => { const p = PRICE[model] || [4, 20, 0.4]; return ((u.input_tokens || 0) * p[0] + (u.cache_creation_input_tokens || 0) * p[0] * 1.25 + (u.cache_read_input_tokens || 0) * p[2] + (u.output_tokens || 0) * p[1]) / 1e6; };

/** One sandbox job: its own Messages request with the code execution tool, continued on pause_turn, capped in time. */
export async function sandbox(env, d, { model, effort, system, content, maxMs, maxTokens = 12000 }) {
  const F = d.xfetch, t0 = Date.now();
  let messages = [{ role: 'user', content }], container = null, cost = 0, ce = 0, all = [], text = '', stop = '';
  for (let round = 0; round < 5; round++) {
    const left = maxMs - (Date.now() - t0);
    if (left < 5000) { stop = 'time'; break; }
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ac ? setTimeout(() => ac.abort(), left) : null;
    const body = { model, max_tokens: maxTokens, system, messages, tools: [{ type: CE_TYPES[ce], name: 'code_execution' }], ...(container ? { container } : {}),
      ...(/haiku-4/.test(model) ? {} : { thinking: { type: 'adaptive' }, ...(effort ? { output_config: { effort } } : {}) }) };
    let r, j;
    try { r = await F(`${ANT}/messages`, { method: 'POST', headers: { ...antHead(env), 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...(ac ? { signal: ac.signal } : {}) }); j = await r.json().catch(() => ({})); }
    catch (e) { clearTimeout(timer); if (/abort/i.test(String(e?.name || e))) { stop = 'time'; break; } throw e; }
    clearTimeout(timer);
    if (!r.ok || j.type === 'error') {
      const msg = j.error?.message || `HTTP ${r.status}`;
      if (ce < CE_TYPES.length - 1 && /code_execution|tool/i.test(msg) && round === 0) { ce++; round--; continue; }
      throw new Error(`The sandbox refused: ${msg}`);
    }
    cost += costOf(model, j.usage);
    container = j.container?.id || container;
    all.push(...(j.content || []));
    if (j.stop_reason === 'pause_turn') { messages = [...messages, { role: 'assistant', content: j.content }]; continue; }
    text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n').trim();
    stop = j.stop_reason || 'end_turn';
    break;
  }
  return { text, files: outputFileIds(all), cost, stop, container, ms: Date.now() - t0 };
}

/* ---------- PDF reports ---------- */
const PDF_CMD = 'S=$(find / -name render_report.py -not -path "/proc/*" 2>/dev/null | head -1); J=$(find / -name report_spec.json -not -path "/proc/*" 2>/dev/null | head -1); python3 "$S" "$J" "$OUTPUT_DIR/report.pdf" && ls -la "$OUTPUT_DIR"';
export async function renderPdf(env, d, report) {
  const F = d.xfetch;
  const enc = new TextEncoder();
  const spec = { title: report.title, subtitle: report.subtitle || '', by: report.by || 'Locus', at: report.at, blocks: report.blocks || [] };
  const specId = await filesUpload(env, F, 'report_spec.json', enc.encode(JSON.stringify(spec)), 'application/json');
  const pyId = await filesUpload(env, F, 'render_report.py', enc.encode(REPORT_PY), 'text/plain');
  try {
    const r = await sandbox(env, d, { model: RENDERER, maxMs: LIMITS.pdfMs, maxTokens: 2000,
      system: 'You run one shell command in the code execution sandbox and report whether it worked. Never write code of your own.',
      content: [{ type: 'text', text: `Run this bash command exactly as written, once, then reply "done" (or the error line if it failed):\n\n${PDF_CMD}` },
        { type: 'container_upload', file_id: specId }, { type: 'container_upload', file_id: pyId }] });
    let pdf = null;
    for (const id of r.files) {
      const f = await filesGet(env, F, id).catch(() => null);
      if (f && (/\.pdf$/i.test(f.name) || f.mime === 'application/pdf') && !pdf) pdf = f.bytes;
      filesDelete(env, F, id);
    }
    if (!pdf) throw new Error(`No PDF came back (${clip(r.text, 200) || r.stop})`);
    return { bytes: pdf, cost: r.cost };
  } finally { filesDelete(env, F, specId); filesDelete(env, F, pyId); }
}
/** The PDF for a share token: from R2 when made before, else rendered now and kept. */
export async function reportPdf(env, d, token) {
  await ensureMake(env);
  const row = await env.DB.prepare(`SELECT * FROM strat_report WHERE token = ?1`).bind(token).first();
  if (!row) return null;
  if (row.pdf_key) { const o = await env.MEDIA.get(row.pdf_key); if (o) return { row, bytes: new Uint8Array(await o.arrayBuffer()) }; }
  const r = await renderPdf(env, d, JSON.parse(row.spec_json));
  const key = `strat/rep-${token}.pdf`;
  await env.MEDIA.put(key, r.bytes, { httpMetadata: { contentType: 'application/pdf' } });
  await env.DB.prepare(`UPDATE strat_report SET pdf_key = ?2, cost = COALESCE(cost, 0) + ?3 WHERE token = ?1`).bind(token, key, r.cost).run();
  return { row, bytes: r.bytes, cost: r.cost };
}

/* ---------- run_analysis ---------- */
async function runAnalysis(env, d, input, ctx) {
  const st = stateOf(ctx);
  if (st.analyses >= LIMITS.analysesPerAnswer) return { is_error: true, text: `That is ${LIMITS.analysesPerAnswer} analyses in one answer, the cap.` };
  if (!env.ANTHROPIC_API_KEY) return { is_error: true, text: 'No Anthropic key on this worker.' };
  const data = String(input.data || '');
  if (!data.trim()) return { is_error: true, text: 'Pass the rows you already fetched in data (CSV or JSON). The sandbox has no internet and cannot read Locus itself.' };
  if (data.length > LIMITS.dataBytes) return { is_error: true, text: `data is ${Math.round(data.length / 1e3)}KB; keep it under ${LIMITS.dataBytes / 1e6}MB (aggregate first).` };
  st.analyses++;
  const F = d.xfetch;
  const json = /^\s*[[{]/.test(data);
  const dataName = slugName(input.data_name || (json ? 'data.json' : 'data.csv')).replace(/\.(csv|json|txt)$/, '') + (json ? '.json' : '.csv');
  const act = await brandFor(env, d, input, ctx);
  const fid = await filesUpload(env, F, dataName, new TextEncoder().encode(data), json ? 'application/json' : 'text/csv');
  let r;
  try {
    r = await sandbox(env, d, { model: ANALYST, effort: 'medium', maxMs: LIMITS.analysisMs, maxTokens: 14000,
      system: `You are the analyst inside Locus (Mobius Digital's agency system), working in a Python sandbox with no internet. The data is the uploaded file ${dataName} (find it with: find / -name "${dataName}" -not -path "/proc/*" 2>/dev/null). Answer the ask from that data only; never invent a number.
FILES: every file the person should get (charts as PNG, spreadsheets as XLSX, CSV, a PDF) goes into $OUTPUT_DIR with a short lowercase name, at most ${LIMITS.files} files, and list $OUTPUT_DIR in the same command. Charts: clean, white background, labelled axes, money as $, one idea per chart, 1600px wide.
THEN REPLY in plain sentences for a media buyer: the findings with the numbers, what to do, and the file names you made. No markdown headings, no tables, never em dashes. Keep it under 200 words.`,
      content: [{ type: 'text', text: `The ask: ${clip(input.ask, 3000)}${input.files ? `\nFiles wanted: ${clip(input.files, 300)}` : ''}` }, { type: 'container_upload', file_id: fid }] });
  } finally { filesDelete(env, F, fid); }
  const made = [];
  for (const id of r.files.slice(0, LIMITS.files)) {
    const f = await filesGet(env, F, id).catch(() => null);
    filesDelete(env, F, id);
    if (!f || !f.bytes.length) continue;
    const name = slugName(f.name.split('/').pop());
    const saved = await saveMedia(env, { bytes: f.bytes, name, kind: 'file', act, title: clip(input.ask, 200), cost: 0, by: ctx?.who || ctx?.ev?.user || null, meta: { from: 'run_analysis' } });
    made.push({ ...saved, name, bytes: f.bytes });
  }
  const notes = [];
  if (ctx?.surface === 'slack' && ctx?.channel) {
    for (const m of made) {
      const u = await slackUpload(env, d, { channel: ctx.channel, thread: ctx.thread, filename: m.name, bytes: m.bytes, title: m.name });
      if (u.error) notes.push(`${m.name}: ${u.error}`);
    }
  }
  const media = made.map(m => ({ kind: isImg(m.ext) ? 'image' : 'file', id: m.id, url: m.url, name: m.name, title: m.name }));
  const where = !made.length ? 'No files came back.' : ctx?.surface === 'slack' ? `The files are in the thread: ${made.map(m => m.name).join(', ')}.` : `The files are under your answer as downloads: ${made.map(m => m.name).join(', ')}.`;
  return { text: `${r.stop === 'time' ? '(The sandbox hit the time cap; this is what it finished.) ' : ''}The sandbox says:\n${clip(r.text, 6000) || '(no words)'}\n\n${where}${notes.length ? ' Upload problems: ' + notes.join('; ') : ''}\nAnswer from this; do not repeat file names more than once.`,
    cost: r.cost, flags: media.length ? { media } : {} };
}

/* ================================================================== */
/*  2a. THE REPORT PAGE (/r/<token>)                                   */
/* ================================================================== */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function chartSvg(b) {
  const W = 720, H = 240, L = 56, R = 16, T = 16, B = 36;
  const x = b.x || [], series = (b.series || []).slice(0, 4);
  const vals = series.flatMap(s => (s.values || []).filter(v => v != null && isFinite(v)));
  if (!x.length || !vals.length) return '<p class="muted">No data to draw.</p>';
  let lo = Math.min(0, ...vals), hi = Math.max(...vals); if (hi === lo) hi = lo + 1; hi += (hi - lo) * 0.08;
  const px = i => L + (x.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (x.length - 1));
  const py = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const col = ['#2F6FED', '#1E8E5A', '#B7791F', '#C53030'], u = b.unit || '';
  const fy = v => (u === '$' ? '$' : '') + (Math.abs(v) >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v * 10) / 10) + (u && u !== '$' ? u : '');
  let g = '';
  for (let t = 0; t <= 4; t++) { const v = lo + (hi - lo) * t / 4, y = py(v); g += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#E3E7EC"/><text x="${L - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#5B6875">${fy(v)}</text>`; }
  const step = Math.ceil(x.length / 8);
  x.forEach((l, i) => { if (i % step === 0 || i === x.length - 1) g += `<text x="${px(i)}" y="${H - B + 18}" text-anchor="middle" font-size="11" fill="#5B6875">${esc(l)}</text>`; });
  if (b.kind === 'bar') {
    const n = series.length, bw = Math.max(4, ((W - L - R) / x.length) * 0.7 / n);
    series.forEach((s, si) => (s.values || []).forEach((v, i) => { if (v == null) return; const cx = px(i) - (n * bw) / 2 + si * bw, y0 = py(Math.max(0, lo)), y1 = py(v); g += `<rect x="${cx}" y="${Math.min(y0, y1)}" width="${bw - 1}" height="${Math.abs(y0 - y1)}" fill="${col[si]}" rx="2"/>`; }));
  } else series.forEach((s, si) => { g += `<polyline points="${(s.values || []).map((v, i) => v == null ? null : `${px(i)},${py(v)}`).filter(Boolean).join(' ')}" fill="none" stroke="${col[si]}" stroke-width="2.2" stroke-linejoin="round"/>`; });
  const legend = series.length > 1 ? `<div class="legend">${series.map((s, i) => `<span><i style="background:${col[i]}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `${legend}<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(b.title || 'chart')}">${g}</svg>`;
}
export function reportPage(rep, token, brand) {
  const blocks = (rep.blocks || []).map(b => {
    const h = b.title ? `<h3>${esc(b.title)}</h3>` : '';
    if (b.type === 'text') return `<section>${h}${String(b.text || '').split(/\n\n+/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}</section>`;
    if (b.type === 'kpis') return `<section>${h}<div class="kpis">${(b.items || []).map(i => `<div class="kpi ${esc(i.tone || '')}"><div class="l">${esc(i.label)}</div><div class="v">${esc(i.value)}</div>${i.note ? `<div class="n">${esc(i.note)}</div>` : ''}</div>`).join('')}</div></section>`;
    if (b.type === 'table') return `<section>${h}<div class="tw"><table><thead><tr>${(b.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${(b.rows || []).map(r => `<tr>${r.map(v => `<td class="${typeof v === 'number' || /^[-$]?[\d,.]+%?x?$/.test(String(v ?? '')) ? 'num' : ''}">${esc(v ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
    if (b.type === 'chart') return `<section>${h}${chartSvg(b)}</section>`;
    return '';
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(rep.title)}</title>
<meta name="robots" content="noindex"><link rel="icon" href="https://tools.go-mobius-digital.com/logo/mobius-mark-locus.png">
<style>
:root{--ink:#13202B;--muted:#5B6875;--line:#E3E7EC;--soft:#F5F7FA;--brand:#2F6FED;--good:#1E8E5A;--warn:#B7791F;--bad:#C53030}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:15px/1.5 "Inter",system-ui,-apple-system,Segoe UI,sans-serif}
.bar{height:5px;background:var(--brand)}.wrap{max-width:880px;margin:0 auto;padding:20px 16px 48px}
header{display:flex;align-items:center;gap:10px;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:22px}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;letter-spacing:.06em;font-size:13px}.logo img{width:22px;height:22px}.logo span{font-weight:400;color:var(--muted);letter-spacing:0}
.acts a{font-size:13px;color:var(--brand);text-decoration:none;border:1px solid var(--line);border-radius:8px;padding:6px 10px;margin-left:6px}
h1{font-size:26px;line-height:1.2;margin:0 0 4px}.sub,.muted{color:var(--muted);font-size:14px}h3{font-size:16px;margin:26px 0 10px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.kpi{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:12px 14px}
.kpi .l{font-size:12px;color:var(--muted)}.kpi .v{font-size:22px;font-weight:700}.kpi .n{font-size:12px;color:var(--muted)}.kpi.good .v{color:var(--good)}.kpi.warn .v{color:var(--warn)}.kpi.bad .v{color:var(--bad)}
.tw{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;color:var(--muted);font-weight:600;border-bottom:1.5px solid var(--ink);padding:6px 8px}td{border-bottom:1px solid var(--line);padding:6px 8px}td.num{text-align:right;font-variant-numeric:tabular-nums}tr:nth-child(even) td{background:var(--soft)}
.legend{display:flex;gap:14px;font-size:12px;color:var(--muted);margin-bottom:4px}.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;vertical-align:-1px}
footer{margin-top:36px;color:var(--muted);font-size:12px}
@media print{.acts{display:none}.bar{print-color-adjust:exact;-webkit-print-color-adjust:exact}section{break-inside:avoid}body{font-size:12px}}
</style></head><body><div class="bar"></div><div class="wrap">
<header><div class="logo"><img src="https://tools.go-mobius-digital.com/logo/mobius-mark-locus.svg" alt="">LOCUS <span>by Mobius Digital${brand ? ' · ' + esc(brand) : ''}</span></div>
<div class="acts"><a href="/r/${esc(token)}.pdf">PDF</a><a href="#" onclick="window.print();return false">Print</a></div></header>
<h1>${esc(rep.title)}</h1>${rep.subtitle ? `<div class="sub">${esc(rep.subtitle)}</div>` : ''}<div class="sub">Built by ${esc(rep.by || 'Locus')}, ${esc(String(rep.at || '').slice(0, 10))}</div>
${blocks}<footer>Every number here came from Locus at the time the report was built.</footer></div></body></html>`;
}

/* ================================================================== */
/*  5. FRAME.IO (V4). Reads, a review link, a folder, a move. NO DELETE. */
/* ================================================================== */
async function fAll(env, path, max = 5) {
  const out = []; let next = path;
  for (let i = 0; i < max && next; i++) {
    const j = await frameApi(env, 'GET', next);
    out.push(...(Array.isArray(j.data) ? j.data : []));
    const n = j.links?.next;
    next = n ? n.replace(/^https?:\/\/[^/]+/, '').replace(/^\/?v4(?=\/)/, '') : null;
    if (next && !next.startsWith('/')) next = '/' + next;
  }
  return out;
}
/** The brand's Frame project: the one named in the input, else the brand's linked project, else the one named like the brand. */
async function frameProject(env, d, input, ctx) {
  const st = await frameStatus(env);
  if (!st.connected) throw new Error(NEEDS_FRAME);
  const act = await brandFor(env, d, input, ctx);
  const brand = act ? ((await d.listAccounts(env, false)).find(a => a.act_id === act)?.name || '') : '';
  let wantId = UUID.test(String(input.project || '')) ? input.project : null;
  if (!wantId && !input.project && act) {
    const c = await connGet(env, act, 'frame').catch(() => null);
    wantId = String(c?.external_id || '').match(/project\/([0-9a-f-]{36})/i)?.[1] || null;
  }
  const wantName = String(input.project || brand || '').toLowerCase().trim();
  const accounts = await fAll(env, '/accounts', 2);
  const found = [];
  for (const a of accounts) for (const w of await fAll(env, `/accounts/${a.id}/workspaces`, 2).catch(() => [])) {
    for (const p of await fAll(env, `/accounts/${a.id}/workspaces/${w.id}/projects`, 5).catch(() => [])) found.push({ account: a.id, id: p.id, name: p.name, root: p.root_folder_id, workspace: w.name });
  }
  let p = wantId ? found.find(x => x.id === wantId) : null;
  if (!p && wantName) p = found.find(x => x.name.toLowerCase() === wantName) || found.filter(x => x.name.toLowerCase().includes(wantName)).sort((a, b) => a.name.length - b.name.length)[0];
  if (!p) throw new Error(`No Frame project for ${input.project || brand || 'that'}. Projects: ${found.map(x => x.name).slice(0, 40).join(', ')}`);
  if (!p.root) p.root = (await frameApi(env, 'GET', `/accounts/${p.account}/projects/${p.id}`))?.data?.root_folder_id;
  return p;
}
const kids = (env, account, folder) => fAll(env, `/accounts/${account}/folders/${folder}/children?page_size=100`, 3);
/** A folder or file by id, or by a path of names from the project root ("Ad Concepts/Batch 12"). */
async function resolveItem(env, p, ref, { folderOnly = false } = {}) {
  const s = String(ref || '').trim().replace(/^\/+|\/+$/g, '');
  if (!s) return { id: p.root, name: p.name + ' (top level)', type: 'folder' };
  if (UUID.test(s)) {
    for (const kind of folderOnly ? ['folders'] : ['folders', 'files']) {
      const j = await frameApi(env, 'GET', `/accounts/${p.account}/${kind}/${s}`).catch(() => null);
      if (j?.data) return { id: s, name: j.data.name, type: kind === 'folders' ? 'folder' : (j.data.type || 'file') };
    }
    throw new Error(`Nothing in Frame has the id ${s}.`);
  }
  let cur = { id: p.root, name: p.name, type: 'folder' };
  const parts = s.split('/').map(x => x.trim()).filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const items = await kids(env, p.account, cur.id);
    const w = parts[i].toLowerCase();
    const pool = items.filter(x => i < parts.length - 1 || !folderOnly ? true : x.type === 'folder');
    let hit = pool.filter(x => String(x.name).toLowerCase() === w);
    if (!hit.length) hit = pool.filter(x => String(x.name).toLowerCase().includes(w));
    if (hit.length > 1) throw new Error(`"${parts[i]}" matches several: ${hit.slice(0, 10).map(x => x.name).join(', ')}. Use the exact name or the id.`);
    if (!hit.length) throw new Error(`No "${parts[i]}" in ${cur.name}. It holds: ${items.slice(0, 30).map(x => x.name).join(', ') || 'nothing'}.`);
    cur = { id: hit[0].id, name: hit[0].name, type: hit[0].type };
    if (i < parts.length - 1 && cur.type !== 'folder') throw new Error(`${cur.name} is not a folder.`);
  }
  if (folderOnly && cur.type !== 'folder') throw new Error(`${cur.name} is not a folder.`);
  return cur;
}

/* ================================================================== */
/*  registration                                                       */
/* ================================================================== */
export function makeTools(d) {
  const t = (def, run) => ({ def, run });
  return [
    t({ name: 'make_image',
      description: 'Make an image right here (Studio\'s image AI, GPT Image): an ad, a social post, a mockup, a concept or a moodboard frame, from a brief you write. A named product brings its real photos and fingerprint, so the product is right. You SEE the result and may redo it once (redo_of + fix). In Slack it is posted in the thread; in Locus it shows inline with Download and Open in Studio. Each image costs about $0.25 to $0.42, so make what was asked (one by default, up to 4), not variations nobody asked for. Write the brief in the brand\'s voice from the brain you have: scene, light, casting, composition, the feeling. Words on the image go in words, spelled exactly.',
      input_schema: { type: 'object', properties: {
        brief: { type: 'string', description: 'What the image is: scene, product placement, light, mood, casting, composition. Directions, not words to print.' },
        kind: { type: 'string', description: 'ad | social post | mockup | concept | story', },
        format: { type: 'string', enum: ['1:1', '4:5', '9:16'], description: '4:5 feed (default), 1:1 square, 9:16 Stories/Reels.' },
        brand: { type: 'string', description: 'Default: this channel\'s or screen\'s brand.' },
        product: { type: 'string', description: 'The product to show, as the store names it ("Carver wedge"). Omit for no product.' },
        words: { type: 'object', properties: { headline: { type: 'string' }, subline: { type: 'string' }, cta: { type: 'string' }, callouts: { type: 'array', items: { type: 'string' } } }, description: 'Text printed on the image. Omit for none.' },
        title: { type: 'string', description: 'A short name for it (shown on the card).' },
        redo_of: { type: 'string', description: 'The id of an image you made in THIS answer that missed the brief.' },
        fix: { type: 'string', description: 'With redo_of: exactly what was wrong and what to change.' } }, required: ['brief'] } },
      (env, input, ctx) => makeImage(env, d, input, ctx)),
    t({ name: 'run_analysis',
      description: 'Run real analysis in a Python sandbox (pandas, numpy, scipy, statsmodels, matplotlib, openpyxl, reportlab) and hand back files: charts as PNG, spreadsheets as XLSX, CSV, a PDF. Use it for statistics, forecasts, cohort or correlation work, pivots too big for SQL, or whenever the person wants a file (an Excel workbook, a chart image). FIRST fetch the rows with your queries and views, then pass them in data as CSV or JSON (the sandbox has no internet and cannot read Locus). Files go into the Slack thread or under the Locus answer. Takes 20 to 120 seconds and about $0.10 to $0.40.',
      input_schema: { type: 'object', properties: {
        ask: { type: 'string', description: 'What to work out and which files to make, precisely (e.g. "weekly MER trend with a 4-week forecast; a PNG chart and an XLSX with the weekly table").' },
        data: { type: 'string', description: 'The rows you fetched, as CSV (header row first) or JSON. Aggregate first; under 2MB.' },
        data_name: { type: 'string', description: 'A file name for the data, e.g. lucky-daily-sep.csv' },
        files: { type: 'string', description: 'The files wanted, e.g. "xlsx and a png chart".' },
        brand: { type: 'string' } }, required: ['ask', 'data'] } },
      (env, input, ctx) => runAnalysis(env, d, input, ctx)),
    t({ name: 'frame_list',
      description: 'See what is in a brand\'s Frame.io project (the review tool): folders and files with their ids. Give a folder as a path of names ("Ad Concepts/Batch 12") or an id; omit it for the top level. Read before frame_share, frame_folder or frame_move.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, project: { type: 'string', description: 'A project name or id when it is not the brand\'s own.' }, folder: { type: 'string' } } } },
      async (env, input, ctx) => {
        const p = await frameProject(env, d, input, ctx);
        const f = await resolveItem(env, p, input.folder, { folderOnly: true });
        const items = await kids(env, p.account, f.id);
        return { text: JSON.stringify({ project: p.name, folder: f.name, folder_id: f.id, items: items.slice(0, 150).map(i => ({ id: i.id, name: i.name, type: i.type, updated: String(i.updated_at || i.inserted_at || '').slice(0, 10), ...(i.view_url ? { view_url: i.view_url } : {}) })), more: items.length > 150 ? items.length - 150 : 0 }) };
      }),
    t({ name: 'frame_share',
      description: 'Make a Frame.io review link for a file or a folder (a new share in its project) and give the link. Use when someone asks for "a Frame link", "send the client the cuts", "a review link for batch 12". Public links open without a login; secure ones need a Frame invite. Find the item with frame_list first.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, project: { type: 'string' }, target: { type: 'string', description: 'The file or folder: an id from frame_list, or a path of names.' },
        name: { type: 'string', description: 'The link\'s name, as the viewer sees it.' }, access: { type: 'string', enum: ['public', 'secure'] }, downloads: { type: 'boolean', description: 'Let viewers download. Default false.' } }, required: ['target'] } },
      async (env, input, ctx) => {
        const p = await frameProject(env, d, input, ctx);
        const it = await resolveItem(env, p, input.target);
        if (it.id === p.root) return { is_error: true, text: 'Name the folder or file to share, not the whole project.' };
        const j = await frameApi(env, 'POST', `/accounts/${p.account}/projects/${p.id}/shares`, { data: { type: 'asset', name: clip(input.name || it.name, 100).replace(/[\r\n]+/g, ' ') || 'Review', access: input.access === 'secure' ? 'secure' : 'public', asset_ids: [it.id], commenting_enabled: true, downloading_enabled: !!input.downloads } });
        const url = j?.data?.short_url;
        if (!url) return { is_error: true, text: `Frame made the share but sent no link back (share id ${j?.data?.id || 'unknown'}).` };
        return { text: `Review link for ${it.name} (${input.access === 'secure' ? 'secure' : 'public'}${input.downloads ? ', downloads on' : ''}): ${url}. Give the link as is.`, flags: { links: [{ label: `Frame: ${it.name}`, url }] } };
      }),
  ];
}

export function makeActions(d) {
  return [
    { name: 'frame_folder',
      description: 'Make a folder in a brand\'s Frame.io project (top level, or inside a folder given as a path of names or an id). Frame is never deleted from here.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, project: { type: 'string' }, parent: { type: 'string', description: 'Where it goes; omit for the top level.' }, name: { type: 'string' }, summary: { type: 'string' } }, required: ['name'] },
      propose: async (env, i, h, ctx) => {
        const p = await frameProject(env, d, i, ctx).catch(e => ({ error: e.message })); if (p.error) return p;
        const parent = await resolveItem(env, p, i.parent, { folderOnly: true }).catch(e => ({ error: e.message })); if (parent.error) return parent;
        const name = clip(String(i.name || '').trim(), 120);
        if (!name) return { error: 'A folder needs a name.' };
        const there = await kids(env, p.account, parent.id);
        if (there.some(x => x.type === 'folder' && String(x.name).toLowerCase() === name.toLowerCase())) return { error: `${parent.name} already has a folder called "${name}".` };
        return { summary: i.summary || `Make the Frame folder "${name}" in ${p.name}${parent.id === p.root ? '' : ' / ' + parent.name}`, detail: `Project ${p.name}, inside ${parent.id === p.root ? 'the top level' : parent.name}.`, patch: { account: p.account, parent: parent.id, name } };
      },
      apply: async (env, x) => { const j = await frameApi(env, 'POST', `/accounts/${x.account}/folders/${x.parent}/folders`, { data: { name: x.name } }); return { ok: true, note: `Folder "${x.name}" made in Frame${j?.data?.view_url ? ': ' + j.data.view_url : '.'}` }; } },
    { name: 'frame_move',
      description: 'Move a file or folder to another folder in the same Frame.io project. Review links keep working. Nothing is ever deleted from here.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' }, project: { type: 'string' }, item: { type: 'string', description: 'The file or folder: id or path of names.' }, to: { type: 'string', description: 'The destination folder: id or path of names ("" = top level).' }, summary: { type: 'string' } }, required: ['item', 'to'] },
      propose: async (env, i, h, ctx) => {
        const p = await frameProject(env, d, i, ctx).catch(e => ({ error: e.message })); if (p.error) return p;
        const it = await resolveItem(env, p, i.item).catch(e => ({ error: e.message })); if (it.error) return it;
        if (it.id === p.root) return { error: 'The project\'s top level cannot be moved.' };
        if (!['file', 'folder'].includes(it.type)) return { error: `${it.name} is a ${it.type}; move it in Frame itself.` };
        const to = await resolveItem(env, p, i.to, { folderOnly: true }).catch(e => ({ error: e.message })); if (to.error) return to;
        if (to.id === it.id) return { error: 'A folder cannot go inside itself.' };
        return { summary: i.summary || `Move "${it.name}" to ${to.id === p.root ? 'the top of ' + p.name : to.name} in Frame`, detail: `${it.type === 'folder' ? 'Folder' : 'File'} "${it.name}" -> ${to.name}. Its review links keep working.`, patch: { account: p.account, id: it.id, type: it.type, to: to.id, name: it.name, toName: to.name } };
      },
      apply: async (env, x) => { await frameApi(env, 'PATCH', `/accounts/${x.account}/${x.type === 'folder' ? 'folders' : 'files'}/${x.id}/move`, { data: { parent_id: x.to } }); return { ok: true, note: `Moved "${x.name}" to ${x.toName} in Frame.` }; } },
  ];
}

export function makeHooks(d) {
  return {
    /* Every report gets a public link and a PDF. In Slack the PDF is rendered while the answer is written. */
    onReport: async (env, report, ctx) => {
      await ensureMake(env);
      const token = hex(16);
      await env.DB.prepare(`INSERT INTO strat_report (token, report_id, title, act_id, spec_json, by) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
        .bind(token, report.id, clip(report.title, 200), brandOfCtx(ctx), JSON.stringify(report), ctx?.who || ctx?.ev?.user || null).run();
      if (ctx?.surface === 'slack' && ctx?.channel && env.MEDIA) {
        const p = reportPdf(env, d, token).then(r => ({ ok: true, bytes: r?.bytes }), e => ({ error: String(e.message || e) }));
        stateOf(ctx).pdf.push({ token, title: report.title, p });
      }
      return { share: `${AH_ORIGIN}/r/${token}`, pdf: `${AH_ORIGIN}/r/${token}.pdf` };
    },
    /* After the answer and the report text are in the thread: the images (never one that was redone) and the PDFs. */
    afterSlack: async (env, r, ctx) => {
      const st = ctx?._make; if (!st || !ctx.channel) return;
      for (const im of st.slackImages) {
        if (st.superseded.has(im.id)) continue;
        const u = await slackUpload(env, d, { channel: ctx.channel, thread: ctx.thread, filename: im.name, bytes: im.bytes, title: im.title });
        if (u.error) await ctx.say?.(`The image did not upload: ${u.error}. It is at ${mediaUrl(im.id, 'png')}`).catch(() => {});
      }
      for (const job of st.pdf) {
        const res = await job.p;
        if (res.ok && res.bytes) {
          const u = await slackUpload(env, d, { channel: ctx.channel, thread: ctx.thread, filename: `${slugName(job.title)}.pdf`, bytes: res.bytes, title: job.title });
          if (u.error) await ctx.say?.(`The PDF did not upload (${u.error}); it is at ${AH_ORIGIN}/r/${job.token}.pdf`).catch(() => {});
        } else await ctx.say?.(`The PDF did not render (${clip(res.error, 160)}). The printable page is ${AH_ORIGIN}/r/${job.token}`).catch(() => {});
      }
    },
  };
}

/* ================================================================== */
/*  routes                                                             */
/* ================================================================== */
/**
 * Public: GET /strat/<id>.<ext> (a made image or file; ?dl=1 downloads), GET /r/<token> (the report page),
 * GET /r/<token>.pdf, GET /api/report-public?t=<token> (the spec as JSON). Unguessable ids are the key, the
 * same trust model as Studio images and the creator link. Admin: POST /api/strat/studio {id}.
 */
export async function handleMake(request, env, url, path, json, isAdmin, d) {
  const m = /^\/strat\/([a-f0-9]{24})\.([a-z0-9]{1,5})$/.exec(path);
  if (m && request.method === 'GET') {
    const o = env.MEDIA ? await env.MEDIA.get(`strat/${m[1]}.${m[2]}`) : null;
    if (!o) return new Response('not found', { status: 404 });
    const name = o.customMetadata?.name || `${m[1]}.${m[2]}`;
    const inline = isImg(m[2]) || m[2] === 'pdf';
    return new Response(o.body, { headers: { 'Content-Type': MIME[m[2]] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'Access-Control-Allow-Origin': '*',
      'Content-Disposition': `${url.searchParams.get('dl') || !inline ? 'attachment' : 'inline'}; filename="${name.replace(/[^\w.\-]/g, '-')}"` } });
  }
  const rm = /^\/r\/([a-f0-9]{32})(\.pdf)?$/.exec(path);
  if (rm && request.method === 'GET') {
    await ensureMake(env);
    if (rm[2]) {
      try {
        const r = await reportPdf(env, d, rm[1]);
        if (!r) return new Response('not found', { status: 404 });
        return new Response(r.bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${slugName(r.row.title)}.pdf"`, 'Cache-Control': 'private, max-age=3600' } });
      } catch (e) { return new Response(`The PDF could not be made right now (${String(e.message || e).slice(0, 200)}). The page itself prints to PDF: /r/${rm[1]}`, { status: 502, headers: { 'Content-Type': 'text/plain' } }); }
    }
    const row = await env.DB.prepare(`SELECT * FROM strat_report WHERE token = ?1`).bind(rm[1]).first();
    if (!row) return new Response('This report link does not exist.', { status: 404 });
    const brand = row.act_id ? (await env.DB.prepare(`SELECT name FROM brand_accounts WHERE act_id = ?1`).bind(row.act_id).first().catch(() => null))?.name : null;
    return new Response(reportPage(JSON.parse(row.spec_json), rm[1], brand), { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }
  if (path === '/api/report-public' && request.method === 'GET') {
    await ensureMake(env);
    const t = String(url.searchParams.get('t') || '');
    const row = /^[a-f0-9]{32}$/.test(t) ? await env.DB.prepare(`SELECT spec_json, act_id, at FROM strat_report WHERE token = ?1`).bind(t).first() : null;
    if (!row) return json({ error: 'not found' }, 404);
    return json({ report: JSON.parse(row.spec_json), at: row.at, pdf: `${AH_ORIGIN}/r/${t}.pdf` });
  }
  if (path.startsWith('/api/strat/')) {
    if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    const b = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    if (path === '/api/strat/studio' && request.method === 'POST') { const r = await toStudio(env, String(b.id || '')); return json(r, r.error ? 400 : 200); }
    if (path === '/api/strat/media') { await ensureMake(env); const { results } = await env.DB.prepare(`SELECT id, kind, name, title, act_id, cost, by, at, r2_key FROM strat_media ORDER BY at DESC LIMIT 100`).all(); return json({ media: (results || []).map(r => ({ ...r, url: `${AH_ORIGIN}/${r.r2_key}` })) }); }
    return json({ error: 'not found' }, 404);
  }
  return null;
}
