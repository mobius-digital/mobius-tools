/* Locus - Studio (2026-09-26).
 *
 * AI MAKES THE WHOLE AD; PEOPLE FIX ONLY WHAT THEY WANT. Cole's flow:
 *   1. Make    the image model draws the finished ad, words included, in a type style picked
 *              for this creative (not one brand font), 4:5 with everything inside the 1:1 square.
 *   2. Review  Approve (most ads end here), Redo (a new version), Delete, or Edit.
 *   3. Edit    ONLY on the first Edit: the model erases the words from the picture (the "plate")
 *              while a vision model reads where each line sat, its colour and the closest font.
 *              The editor then puts the words back as live text boxes, so every later move,
 *              retype, delete or restyle is free and never regenerates the picture.
 *              Title art (stylised lettering that is part of the scene) stays in the picture;
 *              changing its words redraws only that ("art" route).
 *
 * OpenAI (GPT Image) for everything: its strength is text inside images, which is the job.
 * Model ids are discovered from /v1/models so a new release needs no code change.
 * The key is connected from the Studio screen and stored in p_studio_cfg; it is never sent
 * back to a browser. Images live in R2 (MEDIA) under studio/<act>/<id>/<kind>.png and are served
 * by id (24 random hex), which is the same trust model as the creator link's uploads.
 * Slow calls stream NDJSON with a 10s ping: Cloudflare cuts a silent response at 100s.
 */

const OA = 'https://api.openai.com/v1';
const KINDS = new Set(['full', 'plate', 'final', 'square', 'ext']);
/* Rough USD per call, for the running cost on each ad. High-quality portrait image ~ $0.25. */
const COST = { image: 0.25, vision: 0.01 };

const STYLES = {
  auto: 'Choose the typeface that best fits this exact scene and product. It should look designed for this image, not a default font.',
  bold: 'Heavy condensed all-caps sans serif, like Anton or Bebas Neue. Punchy and loud.',
  clean: 'Clean modern sans serif, like Inter or Helvetica, bold headline, confident and minimal.',
  serif: 'Elegant high-contrast serif, like Playfair Display. Premium and editorial.',
  hand: 'Hand-written marker lettering, like Permanent Marker. Casual, like a real person wrote it.',
  luxe: 'Thin geometric sans in wide-spaced capitals, like Josefin Sans Light. Quiet luxury.',
  native: 'Native social look: text as simple phone-style captions or stickers, like a real post, not a designed ad.',
};
/* The fonts the editor can set. The vision pass must pick the closest one from this list. */
const FONTS = ['Anton', 'Bebas Neue', 'Oswald', 'Archivo Black', 'Inter', 'Montserrat', 'Josefin Sans', 'Playfair Display', 'DM Serif Display', 'Permanent Marker', 'Caveat', 'Roboto Condensed'];

const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
const clip = (s, n) => String(s ?? '').slice(0, n);
const safeJson = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

function b64(buf) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function pngSize(u) {
  if (u.length > 24 && u[0] === 0x89 && u[1] === 0x50) return { w: (u[16] << 24 | u[17] << 16 | u[18] << 8 | u[19]) >>> 0, h: (u[20] << 24 | u[21] << 16 | u[22] << 8 | u[23]) >>> 0 };
  return { w: 0, h: 0 };
}

/* A word box (0-1000, [l, t, r, b]) grown to cover what the vision model misses: its boxes
   run a few % off vertically, and a button's shape extends past its letters. */
function padBox([l, t, r, b]) {
  const h = b - t, w = r - l;
  return [Math.max(0, l - w * 0.06 - 12), Math.max(0, t - h * 0.7), Math.min(1000, r + w * 0.06 + 12), Math.min(1000, b + h * 0.7)].map(Math.round);
}
/* An RGBA PNG the size of the ad: transparent inside the holes (edit here), opaque elsewhere.
   Built by hand because Workers has no image library; CompressionStream('deflate') is zlib. */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u) { let c = 0xffffffff; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
async function maskPng(W, H, holes) {
  const row = 1 + W * 4, raw = new Uint8Array(row * H);
  const hs = holes.map(([l, t, r, b]) => [l * W / 1000, t * H / 1000, r * W / 1000, b * H / 1000]);
  for (let y = 0; y < H; y++) {
    const o = y * row; raw[o] = 0;
    const inRow = hs.filter(h => y >= h[1] && y < h[3]);
    for (let x = 0; x < W; x++) {
      const p = o + 1 + x * 4;
      raw[p + 3] = inRow.some(h => x >= h[0] && x < h[2]) ? 0 : 255;
    }
  }
  const zip = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const chunk = (type, data) => {
    const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
    dv.setUint32(0, data.length); out.set(new TextEncoder().encode(type), 4); out.set(data, 8);
    dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zip), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0;
  for (const p of parts) { png.set(p, at); at += p.length; }
  return png;
}

async function getKey(env) {
  return (await env.DB.prepare(`SELECT value FROM p_studio_cfg WHERE key = 'openai_key'`).first().catch(() => null))?.value || env.OPENAI_API_KEY || '';
}

/* Newest GPT Image model and a cheap vision model on this key. Cached per isolate. */
let MODELS = null;
async function models(key) {
  if (MODELS && MODELS.key === key) return MODELS;
  const r = await fetch(`${OA}/models`, { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `OpenAI said ${r.status}`);
  const ids = (j.data || []).map(m => m.id);
  const ver = id => (id.match(/\d+(\.\d+)?/g) || ['0']).map(Number);
  const cmp = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d; } return a.length - b.length; };
  const img = ids.filter(id => /^gpt-image/.test(id) && !/mini/.test(id)).sort(cmp);
  const imgAny = ids.filter(id => /^gpt-image/.test(id)).sort(cmp);
  const vis = ids.filter(id => /^gpt-5(\.\d+)?-mini$/.test(id)).sort(cmp);
  const vis2 = ids.filter(id => /^gpt-4\.1-mini$|^gpt-4o-mini$/.test(id));
  const strong = ids.filter(id => /^gpt-5(\.\d+)?$/.test(id)).sort(cmp);
  MODELS = { key, image: img.pop() || imgAny.pop() || 'gpt-image-1', vision: vis.pop() || vis2[0] || 'gpt-4o-mini' };
  MODELS.check = strong.pop() || MODELS.vision;
  return MODELS;
}

/* One image call. Retries without whichever optional parameter the model rejects, so a
   model that lacks 4:5 or input_fidelity still works (the editor crops to 4:5 either way). */
async function imageCall(key, model, { prompt, images = [], size = '1024x1280', fidelity = false, mask = null, quality = 'high' }) {
  const opts = { size, quality, ...(fidelity ? { input_fidelity: 'high' } : {}) };
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    if (images.length) {
      const fd = new FormData();
      fd.append('model', model); fd.append('prompt', prompt); fd.append('n', '1');
      for (const [k, v] of Object.entries(opts)) fd.append(k, v);
      images.forEach((im, i) => fd.append('image[]', new Blob([im.buf], { type: im.type }), `ref${i}.${(im.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`));
      if (mask) fd.append('mask', new Blob([mask], { type: 'image/png' }), 'mask.png');
      res = await fetch(`${OA}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
    } else {
      res = await fetch(`${OA}/images/generations`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, n: 1, ...opts }) });
    }
    const j = await res.json().catch(() => ({}));
    if (res.ok && j.data?.[0]?.b64_json) return { bytes: unb64(j.data[0].b64_json), usage: j.usage || null };
    const msg = j.error?.message || `OpenAI said ${res.status}`;
    if (res.status === 400) {
      const p = j.error?.param || '';
      if ((/size/i.test(p) || /size/i.test(msg)) && opts.size !== '1024x1536') { opts.size = opts.size === '1024x1280' ? '1024x1536' : 'auto'; continue; }
      if (/input_fidelity/i.test(p + msg) && opts.input_fidelity) { delete opts.input_fidelity; continue; }
      if (/quality/i.test(p) && opts.quality) { delete opts.quality; continue; }
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 2) { await new Promise(r => setTimeout(r, 4000 * (attempt + 1))); continue; }
    throw new Error(msg);
  }
  throw new Error('The image model kept rejecting the request.');
}

function adPrompt(spec, brand, k = 0, n = 1, counts = { prod: 0, inspo: 0 }) {
  const lines = [];
  if (spec.headline) lines.push(`Headline: "${spec.headline}"`);
  if (spec.subline) lines.push(`Smaller line: "${spec.subline}"`);
  for (const c of spec.callouts || []) lines.push(`Callout (a small badge, label or pointer near the part of the product it describes): "${c}"`);
  if (spec.cta) lines.push(`Button (a clean pill or label shape): "${spec.cta}"`);
  if (spec.art && spec.art.trim().split(/\s+/).length <= 3) lines.push(`Title art: "${spec.art}" as custom stylised lettering that is part of the scene itself`);
  const names = (spec.products || []).map(p => p.title).filter(Boolean);
  const many = names.length > 1;
  const which = counts.prod && counts.inspo
    ? `The first ${counts.prod} attached image${counts.prod > 1 ? 's are' : ' is'} the real product${many ? 's' : ''}. The last ${counts.inspo} ${counts.inspo > 1 ? 'are' : 'is'} INSPIRATION ONLY.`
    : counts.inspo ? `All ${counts.inspo} attached image${counts.inspo > 1 ? 's are' : ' is'} INSPIRATION ONLY.` : '';
  return [
    `Create a finished, scroll-stopping Meta feed ad for ${brand}. The image is SQUARE: it is the safe area of a 4:5 ad and will be extended above and below later, so let the background continue naturally past the top and bottom edges.`,
    which,
    spec.dna ? `THE PRODUCT, EXACTLY (its fingerprint; every point must be true in the ad, from any camera angle):\n${spec.dna}` : '',
    names.length
      ? `The product${many ? 's are' : ' is'}: ${names.map(t => `"${t}"`).join(', ')}. ${many ? 'Show every one of them. ' : ''}The product photos are the real thing: reproduce ${many ? 'each product' : 'it'} exactly, with the same shape, colours, materials, logos and any words printed on ${many ? 'them' : 'it'}.`
      : 'There is no product photo: build the image from the description and the inspiration.',
    counts.inspo ? (spec.ref_use === 'copy'
      ? 'Recreate the inspiration CLOSELY: its layout, composition, camera angle, typography treatment and colour grade, with our product and our words in place of theirs. Never copy its brand, products, logos, people or words.'
      : spec.ref_use === 'vibe'
        ? 'Use the inspiration only as a loose mood reference (colour, light, energy). Make your own layout. Never copy its brand, products, logos, people or words.'
        : 'From the inspiration take the layout, composition, typography treatment, colour mood and energy. Do NOT copy its products, brand names, logos, people or words.') : '',
    spec.look ? `Scene and look: ${spec.look}` : '',
    spec.who ? `It is for: ${spec.who}. Let that guide the mood, setting and casting.` : '',
    `Typography: ${STYLES[spec.style] || STYLES.auto}`,
    lines.length ? `Put exactly this text on the ad, spelled exactly, and no other words:\n${lines.join('\n')}` : 'Put no text on the ad.',
    'Keep every word and the whole product inside this square with a small margin from every edge.',
    'A callout that names a part of the product (heel, toe, face, sole, neck, grip, crown, collar and so on) must point at that exact part of the product itself, never at anything else in the scene. On a golf club the heel is the end nearest the shaft and the toe is the far end.',
    'TYPOGRAPHY like a top DTC brand\'s paid social, set by a senior designer: flat, crisp, well kerned letters on a clean grid; at most two typefaces; one clear headline; generous breathing room. NO bevels, glows, outlines, 3D text, metallic or gradient text, drop shadows, or glossy fake badges. Labels and callouts are simple flat shapes or plain text.',
    'It must look like a real photograph with real design on top, not a CGI render: natural light, real materials, real depth of field.',
    spec.notes ? `Also: ${spec.notes}` : '',
    'The scene and look notes above are directions for you. Never write any of them on the ad; the only words on the ad are the ones listed.',
    'Every word must fit completely: size each label or badge so no word is ever cut off.',
    'No watermark, no extra logos, no made-up words, no product name unless it is in the text above, no price unless it is in the text above.',
    n > 1 ? `This is version ${k + 1} of ${n}: use a clearly different composition and camera angle from the other versions.` : '',
  ].filter(Boolean).join('\n\n');
}

async function refImages(env, urls, max = 10) {
  const out = [];
  for (const u of (urls || []).slice(0, max)) {
    try {
      const own = u.match(/\/api\/studio\/ref\/([a-f0-9]{24}\.(png|jpg|webp))$/);
      if (own) {
        const obj = await env.MEDIA.get(`studio/ref/${own[1]}`);
        if (obj) out.push({ buf: await obj.arrayBuffer(), type: own[2] === 'jpg' ? 'image/jpeg' : `image/${own[2]}` });
        continue;
      }
      const src = /cdn\.shopify\.com/.test(u) && !/[?&]width=/.test(u) ? u + (u.includes('?') ? '&' : '?') + 'width=1024' : u;
      const r = await fetch(src);
      if (!r.ok) continue;
      const type = (r.headers.get('Content-Type') || 'image/png').split(';')[0];
      if (!/^image\/(png|jpeg|webp)$/.test(type)) continue;
      out.push({ buf: await r.arrayBuffer(), type });
    } catch {}
  }
  return out;
}

/* Where each line of text sits, read back from the finished ad. Boxes are 0-1000 of the
   image as returned (the browser tightens them against the plate and maps them to 4:5). */
async function readText(key, model, bytes, spec) {
  const schema = {
    type: 'object', additionalProperties: false, required: ['lines'],
    properties: { lines: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['text', 'role', 'is_art', 'box', 'color', 'font', 'weight', 'upper', 'bg'],
      properties: {
        text: { type: 'string' }, role: { type: 'string', enum: ['headline', 'subline', 'callout', 'cta', 'label', 'art'] },
        is_art: { type: 'boolean' },
        box: { type: 'array', items: { type: 'integer' }, description: '[left, top, right, bottom] in PIXELS of this image, tight around the letters' },
        color: { type: 'string', description: '#rrggbb of the letters' },
        font: { type: 'string', enum: FONTS }, weight: { type: 'integer', enum: [300, 400, 600, 700, 800] }, upper: { type: 'boolean' },
        bg: { type: 'string', description: '#rrggbb of the button or label shape behind the words, or empty when the words sit on the picture' },
      } } } },
  };
  const expected = [spec.headline, spec.subline, ...(spec.callouts || []), spec.cta].filter(Boolean).map(s => `"${s}"`).join(', ');
  const { w: W, h: H } = pngSize(bytes);
  const r = await fetch(`${OA}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, response_format: { type: 'json_schema', json_schema: { name: 'ad_text', strict: true, schema } },
      messages: [{ role: 'user', content: [
        { type: 'text', text: `List every separate line of text drawn on this ad, top to bottom. One entry per visual line (a button is one entry). The words we asked for were: ${expected || 'none'}${spec.art ? `, plus title art "${spec.art}"` : ''}. Title art (stylised lettering that is part of the scene) gets role "art" and is_art true. Ignore words printed on the product itself (logos, embroidery, wordmarks). Font is the closest match from the list; judge stroke thickness carefully (thin or light letters are weight 300, not 700), and lines that share one look must get the same font and weight. The image is ${W} pixels wide and ${H} tall: give each box in those pixels, tight around the letters of that line only.` },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64(bytes)}` } },
      ] }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `OpenAI vision said ${r.status}`);
  /* Measured 2026-09-26: the model answers in PIXELS whatever the schema says (a button at y
     1093-1172 on a 1280-tall ad). Everything downstream works in 0-1000, so convert here. */
  const toK = (v, n) => Math.max(0, Math.min(1000, Math.round(v / (n || 1000) * 1000)));
  return (safeJson(j.choices?.[0]?.message?.content, {}).lines || []).filter(l => Array.isArray(l.box) && l.box.length === 4)
    .map(l => ({ ...l, box: [toK(l.box[0], W), toK(l.box[1], H), toK(l.box[2], W), toK(l.box[3], H)] }));
}

function stream(CORS, work) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(); const enc = new TextEncoder();
  const send = o => w.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => {});
  (async () => {
    const t = setInterval(() => send({ type: 'ping' }), 10000);
    try { await work(send); }
    catch (e) { await send({ type: 'error', text: e.message || String(e) }); }
    finally { clearInterval(t); await w.close().catch(() => {}); }
  })();
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', ...CORS } });
}

function shape(row) {
  return {
    id: row.id, act_id: row.act_id, parent_id: row.parent_id, status: row.status,
    spec: safeJson(row.spec_json, {}), model: row.model, full_w: row.full_w, full_h: row.full_h,
    has_plate: !!row.has_plate, has_final: !!row.has_final, layers: safeJson(row.layers_json, null),
    cost: Math.round((row.cost || 0) * 100) / 100, created_at: row.created_at, updated_at: row.updated_at,
    batch_id: row.batch_id || null, line: row.line ?? null, check: safeJson(row.check_json, null),
    v: (row.updated_at || '').replace(/\D/g, ''),
  };
}
const getAd = (env, id) => env.DB.prepare(`SELECT * FROM p_studio_ad WHERE id = ?1`).bind(id).first();
const keyOf = (row, kind) => `studio/${row.act_id}/${row.id}/${kind}.png`;

async function makeOne(env, key, m, act, brand, spec, refs, k, n, parent, counts, where = {}) {
  const prompt = adPrompt(spec, brand, k, n, counts);
  let out = await imageCall(key, m.image, { prompt, images: refs, fidelity: true, size: '1024x1024' });
  let cost = COST.image, check = null;
  /* Cole's rule: the product must look exactly like the product. Every ad is checked against
     the real photos; one that looks off is redone once, and the result is flagged either way. */
  const prodRefs = refs.slice(0, counts.prod || 0);
  if (prodRefs.length) {
    check = await productCheck(key, m.check || m.vision, out.bytes, prodRefs, spec.product, spec.dna).catch(() => null);
    cost += COST.vision;
    if (check && !check.ok) {
      const again = await imageCall(key, m.image, { prompt: `${prompt}

IMPORTANT: a previous attempt got the product wrong (${check.issue}). Copy the product from the photos exactly: the same silhouette and shape, proportions, colours, finish and every logo. Do not redesign it.`, images: refs, fidelity: true, size: '1024x1024' }).catch(() => null);
      cost += COST.image;
      if (again) {
        const c2 = await productCheck(key, m.check || m.vision, again.bytes, prodRefs, spec.product, spec.dna).catch(() => null);
        cost += COST.vision;
        if (!c2 || c2.ok || !check.ok) { out = again; check = c2 ? { ...c2, redone: true } : { ok: null, issue: '', redone: true }; }
      }
    }
  }
  return saveAd(env, act, { bytes: out.bytes, spec, prompt, model: m.image, cost, check, parent, ...where });
}
async function saveAd(env, act, { bytes, spec, prompt, model, cost, check, parent, batch_id, line }) {
  const { w, h } = pngSize(bytes);
  const id = rid();
  await env.MEDIA.put(`studio/${act}/${id}/full.png`, bytes, { httpMetadata: { contentType: 'image/png' } });
  await env.DB.prepare(`INSERT INTO p_studio_ad (id, act_id, parent_id, status, spec_json, prompt, model, full_w, full_h, cost, batch_id, line, check_json) VALUES (?1, ?2, ?3, 'review', ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
    .bind(id, act, parent || null, JSON.stringify(spec), prompt, model, w, h, cost, batch_id || null, Number.isInteger(line) ? line : null, check ? JSON.stringify(check) : null).run();
  return shape(await getAd(env, id));
}
async function productCheck(key, model, bytes, refs, name, dna = '') {
  const content = [{ type: 'text', text: `The first images are REFERENCE photos of the real product${name ? ` ("${name}")` : ''}. The last image is an AD. Is the product in the ad the SAME product? Compare the silhouette and outline first (for a putter or club: the head shape seen from above and the side, its cut-outs and wings), then proportions, colours, finish, logos and printed details. A different angle, light or background is fine. A redesigned or different-shaped product is NOT ok even if the colour and logo match. Be strict: when unsure, say it is not ok.${dna ? `\n\nThe product's fingerprint; check EVERY point against the ad and fail it if any point is wrong:\n${dna}` : ''}` }];
  for (const r of refs.slice(0, 5)) content.push({ type: 'image_url', image_url: { url: `data:${r.type};base64,${b64(r.buf)}` } });
  content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${b64(bytes)}` } });
  const res = await fetch(`${OA}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], response_format: { type: 'json_schema', json_schema: { name: 'check', strict: true, schema: { type: 'object', additionalProperties: false, required: ['ok', 'issue'], properties: { ok: { type: 'boolean' }, issue: { type: 'string', description: 'what is wrong, in a few words, or empty' } } } } } }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || 'check failed');
  return safeJson(j.choices?.[0]?.message?.content, null);
}

const urls = (a, n) => (Array.isArray(a) ? a : []).filter(u => /^https?:\/\//.test(u)).slice(0, n).map(u => clip(u, 1000));
function cleanSpec(s = {}) {
  let products = (Array.isArray(s.products) ? s.products : []).slice(0, 4).map(p => ({ title: clip(p.title, 200), handle: clip(p.handle, 200) })).filter(p => p.title);
  if (!products.length && s.product) products = [{ title: clip(s.product, 200), handle: clip(s.product_handle, 200) }];
  return {
    products, product: products.map(p => p.title).join(' + '),
    images: urls(s.images, 8), inspo: urls(s.inspo, 3),
    who: clip(s.who, 300), headline: clip(s.headline, 160), subline: clip(s.subline, 240), cta: clip(s.cta, 40),
    callouts: (Array.isArray(s.callouts) ? s.callouts : []).map(c => clip(String(c).trim(), 60)).filter(Boolean).slice(0, 6),
    art: clip(s.art, 40), look: clip(s.look, 1200), notes: clip(s.notes, 800), style: STYLES[s.style] ? s.style : 'auto',
    ref_use: ['copy', 'vibe'].includes(s.ref_use) ? s.ref_use : '', note: clip(s.note, 300), dna: clip(s.dna, 3000),
  };
}


/* ---------------- Canva (Connect API, the team's own Canva account) ----------------
   One click sends a whole batch to Canva: a folder named after the batch, one design per ad
   with the ad placed in it, so the team can Grab Text / Magic Grab and move pieces. OAuth with
   PKCE; tokens refresh themselves. Set up once from Studio (client id + secret of a Canva
   developer integration whose redirect URL is this worker's /api/studio/canva/callback). */
const CANVA = 'https://api.canva.com/rest/v1';
const CANVA_SCOPES = 'asset:read asset:write design:content:read design:content:write design:meta:read folder:read folder:write';
async function cfgGet(env, k) { return (await env.DB.prepare(`SELECT value FROM p_studio_cfg WHERE key = ?1`).bind(k).first().catch(() => null))?.value || null; }
async function cfgSet(env, k, v) {
  if (v == null) return env.DB.prepare(`DELETE FROM p_studio_cfg WHERE key = ?1`).bind(k).run();
  return env.DB.prepare(`INSERT INTO p_studio_cfg (key, value, updated_at) VALUES (?1, ?2, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(k, v).run();
}
const b64url = u => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function canvaToken(env) {
  const t = safeJson(await cfgGet(env, 'canva_tokens'), null);
  if (!t) return null;
  if (t.exp > Date.now() + 60000) return t.access;
  const id = await cfgGet(env, 'canva_client_id'), secret = await cfgGet(env, 'canva_client_secret');
  const r = await fetch(`${CANVA}/oauth/token`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { await cfgSet(env, 'canva_tokens', null); throw new Error('Canva needs connecting again (the sign-in expired).'); }
  await cfgSet(env, 'canva_tokens', JSON.stringify({ access: j.access_token, refresh: j.refresh_token || t.refresh, exp: Date.now() + (j.expires_in || 3600) * 1000 }));
  return j.access_token;
}
async function canva(env, tok, path, opts = {}) {
  const r = await fetch(`${CANVA}${path}`, { ...opts, headers: { Authorization: `Bearer ${tok}`, ...(opts.body && !(opts.body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Canva: ${j.message || j.error || r.status}`);
  return j;
}
async function canvaCallback(env, url) {
  const st = safeJson(await cfgGet(env, 'canva_state'), null);
  const page = (msg, ok) => new Response(`<!doctype html><meta charset="utf-8"><title>Canva</title><body style="font:16px system-ui;padding:40px;color:#13202B"><h2>${ok ? 'Canva is connected' : 'Canva did not connect'}</h2><p>${msg}</p><p>You can close this tab and go back to Locus.</p></body>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  if (!st || st.state !== url.searchParams.get('state')) return page('The sign-in link was out of date. Click Connect Canva again.', false);
  if (url.searchParams.get('error')) return page(String(url.searchParams.get('error_description') || url.searchParams.get('error')), false);
  const id = await cfgGet(env, 'canva_client_id'), secret = await cfgGet(env, 'canva_client_secret');
  const r = await fetch(`${CANVA}/oauth/token`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${id}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code') || '', code_verifier: st.verifier, redirect_uri: `${url.origin}/api/studio/canva/callback` }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return page(`Canva said: ${j.error_description || j.message || r.status}`, false);
  await cfgSet(env, 'canva_tokens', JSON.stringify({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }));
  await cfgSet(env, 'canva_state', null);
  return page('Studio can now send batches straight to your Canva.', true);
}

/* Canva folder structure (Cole, 2026-09-27): Locus Studio / <Brand> / <batch # · name>, one design
   per ad named "<#>-<line> · <headline>". Folder ids are cached in p_studio_cfg by path so the same
   folders are reused; a cached id Canva no longer knows is recreated. */
async function canvaFolder(env, tok, parts) {
  let parent = 'root';
  for (let i = 0; i < parts.length; i++) {
    const path = parts.slice(0, i + 1).join('/'), ck = `canva_folder:${path}`;
    let id = await cfgGet(env, ck);
    if (id) { const ok = await fetch(`${CANVA}/folders/${id}`, { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.ok).catch(() => false); if (!ok) id = null; }
    if (!id) {
      const f = await canva(env, tok, '/folders', { method: 'POST', body: JSON.stringify({ name: clip(parts[i], 250), parent_folder_id: parent }) });
      id = f.folder?.id; if (id) await cfgSet(env, ck, id);
    }
    parent = id || parent;
  }
  return parent;
}
function shapeBatch(r) {
  return { id: r.id, act_id: r.act_id, num: r.num || '', br_batch_id: r.br_batch_id || null, name: r.name || '', status: r.status,
    brief: safeJson(r.brief_json, {}), setup: safeJson(r.setup_json, {}), plan: safeJson(r.plan_json, null), created_at: r.created_at, updated_at: r.updated_at };
}

/* ---------------- public: the images ---------------- */
export async function handlePublic(request, env, url, path, json, CORS) {
  if (path === '/api/studio/canva/callback' && request.method === 'GET') return canvaCallback(env, url);
  const rf = path.match(/^\/api\/studio\/ref\/([a-f0-9]{24})\.(png|jpg|webp)$/);
  if (rf && request.method === 'GET' && env.MEDIA) {
    const obj = await env.MEDIA.get(`studio/ref/${rf[1]}.${rf[2]}`);
    if (!obj) return json({ error: 'not found' }, 404);
    return new Response(obj.body, { headers: { 'Content-Type': rf[2] === 'jpg' ? 'image/jpeg' : `image/${rf[2]}`, 'Cache-Control': 'public, max-age=31536000, immutable', ...CORS } });
  }
  const m = path.match(/^\/api\/studio\/img\/([a-f0-9]{24})\/(full|plate|final|square|ext)$/);
  if (!m || request.method !== 'GET') return null;
  const row = await getAd(env, m[1]);
  if (!row || !env.MEDIA) return json({ error: 'not found' }, 404);
  const obj = await env.MEDIA.get(keyOf(row, m[2]));
  if (!obj) return json({ error: 'not found' }, 404);
  return new Response(obj.body, { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', ...CORS } });
}

/* ---------------- staff ---------------- */
export async function handleStaff(request, env, url, path, json, CORS) {
  if (!path.startsWith('/api/studio')) return null;
  /* Inspiration images: stored once, referenced by URL in the spec. */
  if (path === '/api/studio/upload' && request.method === 'POST') {
    if (!env.MEDIA) return json({ error: 'Image storage is not set up.' }, 500);
    const type = (request.headers.get('Content-Type') || '').split(';')[0];
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[type];
    if (!ext) return json({ error: 'Use a PNG, JPG or WebP image.' }, 400);
    const buf = await request.arrayBuffer();
    if (buf.byteLength > 12e6) return json({ error: 'That image is over 12MB.' }, 400);
    const id = rid();
    await env.MEDIA.put(`studio/ref/${id}.${ext}`, buf, { httpMetadata: { contentType: type } });
    return json({ url: `${url.origin}/api/studio/ref/${id}.${ext}` });
  }
  const body = request.method === 'POST' || request.method === 'PUT' ? await request.clone().json().catch(() => ({})) : {};
  const act = url.searchParams.get('act') || body.act || '';

  if (path === '/api/studio' && request.method === 'GET') {
    const key = await getKey(env);
    const acct = act ? await env.DB.prepare(`SELECT act_id, name, tw_shop FROM accounts WHERE act_id = ?1`).bind(act).first() : null;
    const rows = act ? (await env.DB.prepare(`SELECT * FROM p_studio_ad WHERE act_id = ?1 AND status != 'gone' ORDER BY created_at DESC LIMIT 300`).bind(act).all()).results || [] : [];
    const spent = act ? (await env.DB.prepare(`SELECT COALESCE(SUM(cost),0) c FROM p_studio_ad WHERE act_id = ?1 AND created_at >= date('now','start of month')`).bind(act).first())?.c || 0 : 0;
    const canvaState = { configured: !!(await cfgGet(env, 'canva_client_id')), connected: !!(await cfgGet(env, 'canva_tokens')) };
    const batches = act ? ((await env.DB.prepare(`SELECT * FROM p_studio_batch WHERE act_id = ?1 AND status != 'archived' ORDER BY updated_at DESC LIMIT 200`).bind(act).all()).results || []).map(shapeBatch) : [];
    return json({ has_key: !!key, has_media: !!env.MEDIA, account: acct, ads: rows.map(shape), batches, canva: canvaState, spent_month: Math.round(spent * 100) / 100, styles: Object.keys(STYLES), fonts: FONTS });
  }

  if (path === '/api/studio/key' && request.method === 'POST') {
    const k = String(body.key || '').trim();
    if (!k) { await env.DB.prepare(`DELETE FROM p_studio_cfg WHERE key = 'openai_key'`).run(); MODELS = null; return json({ ok: true, has_key: false }); }
    if (!/^sk-[A-Za-z0-9_\-]{20,}$/.test(k)) return json({ error: 'That does not look like an OpenAI key. It starts with sk-.' }, 400);
    MODELS = null;
    let m;
    try { m = await models(k); } catch (e) { return json({ error: `OpenAI did not accept that key: ${e.message}` }, 400); }
    await env.DB.prepare(`INSERT INTO p_studio_cfg (key, value, updated_at) VALUES ('openai_key', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(k).run();
    return json({ ok: true, has_key: true, image_model: m.image });
  }

  /* The brand's products straight from its Shopify storefront, so picking one is a click. */
  if (path === '/api/studio/products' && request.method === 'GET') {
    const acct = await env.DB.prepare(`SELECT tw_shop FROM accounts WHERE act_id = ?1`).bind(act).first();
    if (!acct?.tw_shop) return json({ products: [], note: 'This brand has no Shopify store set in Settings.' });
    const out = [];
    for (let page = 1; page <= 4; page++) {
      const r = await fetch(`https://${acct.tw_shop}/products.json?limit=250&page=${page}`, { headers: { 'User-Agent': 'Mozilla/5.0 Locus' } }).catch(() => null);
      if (!r || !r.ok) break;
      const j = await r.json().catch(() => ({}));
      const ps = j.products || [];
      for (const p of ps) {
        const imgs = (p.images || []).map(i => i.src).filter(Boolean);
        if (imgs.length) out.push({ handle: p.handle, title: p.title, type: p.product_type || '', images: imgs.slice(0, 8) });
      }
      if (ps.length < 250) break;
    }
    return json({ products: out });
  }

  if (path === '/api/studio/status' && request.method === 'POST') {
    const st = ['review', 'approved', 'deleted'].includes(body.status) ? body.status : null;
    if (!st || !body.id) return json({ error: 'status and id are required' }, 400);
    await env.DB.prepare(`UPDATE p_studio_ad SET status = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(body.id, st).run();
    return json({ ok: true, ad: shape(await getAd(env, body.id)) });
  }

  /* The editor's save: the exported 4:5 PNG plus the text boxes, so reopening shows the edit. */
  if (path === '/api/studio/save' && request.method === 'POST') {
    const row = await getAd(env, body.id);
    if (!row) return json({ error: 'not found' }, 404);
    if (body.png) {
      const bytes = unb64(String(body.png).replace(/^data:image\/png;base64,/, ''));
      await env.MEDIA.put(keyOf(row, 'final'), bytes, { httpMetadata: { contentType: 'image/png' } });
    }
    await env.DB.prepare(`UPDATE p_studio_ad SET layers_json = ?2, has_final = ?3, status = CASE WHEN ?4 = 1 THEN 'approved' ELSE status END, updated_at = datetime('now') WHERE id = ?1`)
      .bind(row.id, JSON.stringify(body.layers || null), body.png ? 1 : row.has_final, body.approve ? 1 : 0).run();
    return json({ ok: true, ad: shape(await getAd(env, row.id)) });
  }

  /* Throw the edit away and go back to exactly what the AI made. */
  if (path === '/api/studio/revert' && request.method === 'POST') {
    const row = await getAd(env, body.id);
    if (!row) return json({ error: 'not found' }, 404);
    await env.MEDIA.delete(keyOf(row, 'final')).catch(() => {});
    await env.DB.prepare(`UPDATE p_studio_ad SET has_final = 0, layers_json = NULL, updated_at = datetime('now') WHERE id = ?1`).bind(row.id).run();
    return json({ ok: true, ad: shape(await getAd(env, row.id)) });
  }

  const key = await getKey(env);
  const needKey = () => json({ error: 'Connect the image AI first (Studio shows where).' }, 400);

  /* Make N versions of one idea. */
  if (path === '/api/studio/make' && request.method === 'POST') {
    if (!key) return needKey();
    if (!env.MEDIA) return json({ error: 'Image storage is not set up on this worker.' }, 500);
    const spec = cleanSpec(body.spec);
    if (!spec.images.length && !spec.inspo.length) return json({ error: 'Pick a product or add an inspiration image.' }, 400);
    const n = Math.max(1, Math.min(4, +body.n || 1));
    const acct = await env.DB.prepare(`SELECT name FROM accounts WHERE act_id = ?1`).bind(act).first();
    if (!acct) return json({ error: 'unknown brand' }, 404);
    return stream(CORS, async send => {
      const m = await models(key);
      send({ type: 'status', text: `Making ${n} version${n > 1 ? 's' : ''} with ${m.image}. About a minute.` });
      const prod = await refImages(env, spec.images, 8), insp = await refImages(env, spec.inspo, 3);
      if (!prod.length && !insp.length) throw new Error('Could not load the photos.');
      const counts = { prod: prod.length, inspo: insp.length };
      const results = await Promise.allSettled(Array.from({ length: n }, (_, k) =>
        makeOne(env, key, m, act, acct.name, spec, [...prod, ...insp], k, n, body.parent_id, counts, { batch_id: clip(body.batch_id, 40) || null, line: Number.isInteger(body.line) ? body.line : null }).then(ad => { send({ type: 'ad', ad }); return ad; })));
      const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      const bad = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || 'failed');
      if (!ok.length) throw new Error(bad[0] || 'Nothing came back.');
      send({ type: 'done', ads: ok, failed: bad });
    });
  }

  /* First Edit, step 1: what the words say, their style, and a rough box each. The browser then
     finds each line's EXACT box with OCR (the vision model's boxes run several % off). */
  if (path === '/api/studio/read' && request.method === 'POST') {
    if (!key) return needKey();
    const row = await getAd(env, body.id);
    if (!row) return json({ error: 'not found' }, 404);
    return stream(CORS, async send => {
      const m = await models(key);
      const obj = await env.MEDIA.get(keyOf(row, 'full'));
      if (!obj) throw new Error('The ad image is missing.');
      const lines = await readText(key, m.vision, new Uint8Array(await obj.arrayBuffer()), safeJson(row.spec_json, {}));
      await env.DB.prepare(`UPDATE p_studio_ad SET cost = cost + ?2 WHERE id = ?1`).bind(row.id, COST.vision).run();
      send({ type: 'done', lines });
    });
  }

  /* First Edit, step 2: erase the words inside the given holes only (a MASK). The image model
     redraws the whole picture on an edit (measured: the club moved and the clover vanished), so
     the browser keeps the original pixels everywhere outside the holes. */
  if (path === '/api/studio/lift' && request.method === 'POST') {
    if (!key) return needKey();
    const row = await getAd(env, body.id);
    if (!row) return json({ error: 'not found' }, 404);
    return stream(CORS, async send => {
      const m = await models(key);
      const spec = safeJson(row.spec_json, {});
      const obj = await env.MEDIA.get(keyOf(row, 'full'));
      if (!obj) throw new Error('The ad image is missing.');
      const full = new Uint8Array(await obj.arrayBuffer());
      send({ type: 'status', text: 'Erasing the words from the picture. About 30 seconds.' });
      let lines = Array.isArray(body.lines) ? body.lines.slice(0, 20) : null;
      let art = Array.isArray(body.art) ? body.art.slice(0, 5) : [];
      if (!lines) { const all = await readText(key, m.vision, full, spec); lines = all.filter(l => !l.is_art && l.role !== 'art'); art = all.filter(l => l.is_art || l.role === 'art'); }
      const okBox = b => Array.isArray(b) && b.length === 4 && b.every(v => Number.isFinite(+v));
      const holes = (Array.isArray(body.holes) ? body.holes.filter(okBox).slice(0, 30).map(b => b.map(v => Math.max(0, Math.min(1000, Math.round(+v))))) : null) || lines.map(l => padBox(l.box));
      const { w: W, h: H } = pngSize(full);
      const mask = W && H && holes.length ? await maskPng(W, H, holes) : null;
      const words = lines.map(l => l.text).filter(Boolean);
      const plate = await imageCall(key, m.image, {
        images: [{ buf: full, type: 'image/png' }], fidelity: true, mask,
        size: row.full_w && row.full_h ? `${row.full_w}x${row.full_h}` : '1024x1280',
        prompt: [
          `Remove all the ad text from this image${words.length ? `: ${words.map(w => `"${w}"`).join(', ')}` : ''}, including any button, pill or label shapes and pointer lines behind those words. Fill each area with the natural background so no trace of text remains.`,
          spec.art ? `Keep the title art "${spec.art}" exactly as it is.` : '',
          'Change nothing else: the same product with its own logos and printing, the same scene, lighting, colours and framing, pixel for pixel wherever there was no text.',
        ].filter(Boolean).join(' '),
      });
      await env.MEDIA.put(keyOf(row, 'plate'), plate.bytes, { httpMetadata: { contentType: 'image/png' } });
      const layers = { source: 'ai', lines, art, holes };
      await env.DB.prepare(`UPDATE p_studio_ad SET has_plate = 1, layers_json = ?2, cost = cost + ?3, updated_at = datetime('now') WHERE id = ?1`)
        .bind(row.id, JSON.stringify(layers), COST.image).run();
      send({ type: 'done', ad: shape(await getAd(env, row.id)) });
    });
  }

  /* Change the words of title art in place: redraws the ad with only that changed. */
  if (path === '/api/studio/art' && request.method === 'POST') {
    if (!key) return needKey();
    const row = await getAd(env, body.id);
    const to = clip(body.to, 40).trim();
    if (!row || !to) return json({ error: 'id and new words are required' }, 400);
    return stream(CORS, async send => {
      const m = await models(key);
      const spec = safeJson(row.spec_json, {});
      const from = spec.art || clip(body.from, 40);
      const obj = await env.MEDIA.get(keyOf(row, 'full'));
      const full = new Uint8Array(await obj.arrayBuffer());
      send({ type: 'status', text: `Redrawing "${from}" as "${to}". About 30 seconds.` });
      const out = await imageCall(key, m.image, {
        images: [{ buf: full, type: 'image/png' }], fidelity: true,
        size: row.full_w && row.full_h ? `${row.full_w}x${row.full_h}` : '1024x1280',
        prompt: `Change the stylised title lettering "${from}" so it reads "${to}", in exactly the same lettering style, size, colour, glow and position. Spell it exactly. Change nothing else in the image.`,
      });
      await env.MEDIA.put(keyOf(row, 'full'), out.bytes, { httpMetadata: { contentType: 'image/png' } });
      await env.MEDIA.delete(keyOf(row, 'plate')).catch(() => {});
      await env.MEDIA.delete(keyOf(row, 'final')).catch(() => {});
      await env.DB.prepare(`UPDATE p_studio_ad SET spec_json = ?2, has_plate = 0, has_final = 0, layers_json = NULL, cost = cost + ?3, updated_at = datetime('now') WHERE id = ?1`)
        .bind(row.id, JSON.stringify({ ...spec, art: to }), COST.image).run();
      send({ type: 'done', ad: shape(await getAd(env, row.id)) });
    });
  }

  /* ---- batches ---- */
  if (path === '/api/studio/batch/save' && request.method === 'POST') {
    const x = body.batch || {};
    const id = /^[a-f0-9]{24}$/.test(x.id || '') ? x.id : rid();
    const st = ['draft', 'planned', 'made', 'archived'].includes(x.status) ? x.status : 'draft';
    await env.DB.prepare(`INSERT INTO p_studio_batch (id, act_id, num, br_batch_id, name, brief_json, setup_json, plan_json, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
      ON CONFLICT(id) DO UPDATE SET num = excluded.num, br_batch_id = excluded.br_batch_id, name = excluded.name, brief_json = excluded.brief_json, setup_json = excluded.setup_json, plan_json = excluded.plan_json, status = excluded.status, updated_at = datetime('now')`)
      .bind(id, act, clip(x.num, 20) || null, clip(x.br_batch_id, 40) || null, clip(x.name, 200), JSON.stringify(x.brief || {}).slice(0, 60000), JSON.stringify(x.setup || {}).slice(0, 30000), x.plan ? JSON.stringify(x.plan).slice(0, 60000) : null, st).run();
    return json({ ok: true, batch: shapeBatch(await env.DB.prepare(`SELECT * FROM p_studio_batch WHERE id = ?1`).bind(id).first()) });
  }
  /* Open Asana tests for this brand (synced by the Brand tab), to start a batch from. */
  if (path === '/api/studio/asana' && request.method === 'GET') {
    const rows = (await env.DB.prepare(`SELECT id, num, title, stage, asana_url, length(COALESCE(brief_text,'')) AS blen FROM p_br_batch WHERE act_id = ?1 AND stage IN ('idea','production') ORDER BY CAST(num AS INTEGER) DESC LIMIT 60`).bind(act).all()).results || [];
    return json({ briefs: rows.map(r => ({ id: r.id, num: r.num, title: r.title, stage: r.stage, url: r.asana_url, has_brief: r.blen > 20 })) });
  }

  /* ---- Canva setup + send ---- */
  if (path === '/api/studio/canva/setup' && request.method === 'POST') {
    const id = String(body.client_id || '').trim(), secret = String(body.client_secret || '').trim();
    if (!id) { for (const k of ['canva_client_id', 'canva_client_secret', 'canva_tokens', 'canva_state']) await cfgSet(env, k, null); return json({ ok: true }); }
    if (!secret) return json({ error: 'Both the client ID and the client secret are needed.' }, 400);
    await cfgSet(env, 'canva_client_id', id); await cfgSet(env, 'canva_client_secret', secret); await cfgSet(env, 'canva_tokens', null);
    return json({ ok: true });
  }
  if (path === '/api/studio/canva/start' && request.method === 'GET') {
    const id = await cfgGet(env, 'canva_client_id');
    if (!id) return json({ error: 'Set up the Canva app first.' }, 400);
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
    await cfgSet(env, 'canva_state', JSON.stringify({ state, verifier, at: Date.now() }));
    const q = new URLSearchParams({ code_challenge: challenge, code_challenge_method: 's256', scope: CANVA_SCOPES, response_type: 'code', client_id: id, state, redirect_uri: `${url.origin}/api/studio/canva/callback` });
    return json({ url: `https://www.canva.com/api/oauth/authorize?${q}`, redirect_uri: `${url.origin}/api/studio/canva/callback` });
  }
  if (path === '/api/studio/canva/send' && request.method === 'POST') {
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter(x => /^[a-f0-9]{24}$/.test(x)).slice(0, 60);
    if (!ids.length) return json({ error: 'No ads to send.' }, 400);
    return stream(CORS, async send => {
      const tok = await canvaToken(env);
      if (!tok) throw new Error('Connect Canva first (Studio, Canva button).');
      const acct = await env.DB.prepare(`SELECT name FROM accounts WHERE act_id = ?1`).bind(act).first();
      const bt = body.batch_id ? await env.DB.prepare(`SELECT num, name FROM p_studio_batch WHERE id = ?1`).bind(body.batch_id).first() : null;
      const fid = await canvaFolder(env, tok, ['Locus Studio', acct?.name || 'Brand', bt ? `${bt.num ? `${bt.num} · ` : ''}${bt.name || 'Batch'}` : clip(body.folder || 'Ads', 120)]);
      const out = [];
      for (const [i, id] of ids.entries()) {
        const row = await getAd(env, id);
        if (!row) continue;
        const obj = await env.MEDIA.get(keyOf(row, row.has_final ? 'final' : 'full'));
        if (!obj) continue;
        const bytes = new Uint8Array(await obj.arrayBuffer());
        const spec = safeJson(row.spec_json, {});
        const name = clip(`${bt?.num ? `${bt.num}-${(row.line ?? i) + 1}` : `Ad ${i + 1}`} · ${spec.headline || ''}`.trim(), 50);
        send({ type: 'status', text: `Sending ${i + 1} of ${ids.length} to Canva` });
        let job = await canva(env, tok, '/asset-uploads', { method: 'POST', body: bytes, headers: { 'Content-Type': 'application/octet-stream', 'Asset-Upload-Metadata': JSON.stringify({ name_base64: btoa(unescape(encodeURIComponent(name))) }) } });
        for (let t = 0; t < 20 && job.job?.status === 'in_progress'; t++) { await new Promise(r => setTimeout(r, 1500)); job = await canva(env, tok, `/asset-uploads/${job.job.id}`); }
        const asset = job.job?.asset?.id;
        if (!asset) { send({ type: 'status', text: `Canva could not take ad ${i + 1}` }); continue; }
        const d = await canva(env, tok, '/designs', { method: 'POST', body: JSON.stringify({ design_type: { type: 'custom', width: 1080, height: 1350 }, asset_id: asset, title: name }) });
        if (fid && d.design?.id) await canva(env, tok, '/folders/move', { method: 'POST', body: JSON.stringify({ item_id: d.design.id, to_folder_id: fid }) }).catch(() => {});
        out.push({ id, edit_url: d.design?.urls?.edit_url || '' });
      }
      send({ type: 'done', designs: out, folder_url: fid ? `https://www.canva.com/folder/${fid}` : '' });
    });
  }

  /* ---- a variation of a finished ad: only the words change ---- */
  if (path === '/api/studio/vary' && request.method === 'POST') {
    if (!key) return needKey();
    const base = await getAd(env, body.base_id);
    if (!base) return json({ error: 'base ad not found' }, 404);
    const spec = cleanSpec(body.spec);
    const old = safeJson(base.spec_json, {});
    return stream(CORS, async send => {
      const m = await models(key);
      const src = (await env.MEDIA.get(keyOf(base, 'square'))) || (await env.MEDIA.get(keyOf(base, 'full')));
      const full = new Uint8Array(await src.arrayBuffer());
      const sz = pngSize(full);
      const pairs = [['headline', 'The headline'], ['subline', 'The smaller line'], ['cta', 'The button']]
        .filter(([k]) => (old[k] || '') !== (spec[k] || '')).map(([k, l]) => spec[k] ? `${l} "${old[k] || ''}" now reads "${spec[k]}".` : `${l} "${old[k]}" is removed.`);
      if ((old.callouts || []).join('|') !== (spec.callouts || []).join('|')) pairs.push(`The callouts are now: ${(spec.callouts || []).map(c => `"${c}"`).join(', ') || 'none'}.`);
      const prompt = `This is a finished ad. Change ONLY these words, in exactly the same lettering style, size, colour and position: ${pairs.join(' ') || 'no change'} Spell every word exactly. Keep everything else identical: the picture, the product, the layout and every other word.`;
      send({ type: 'status', text: 'Changing only the words. About 40 seconds.' });
      const out = await imageCall(key, m.image, { images: [{ buf: full, type: 'image/png' }], fidelity: true, prompt, size: `${sz.w || 1024}x${sz.h || 1024}` });
      const ad = await saveAd(env, base.act_id, { bytes: out.bytes, spec: { ...old, ...spec, varied_from: base.id }, prompt, model: m.image, cost: COST.image, parent: base.id, batch_id: clip(body.batch_id, 40) || base.batch_id, line: Number.isInteger(body.line) ? body.line : null });
      send({ type: 'done', ad });
    });
  }

  /* ---- Change with AI: an instruction redraws that ad with only that change ---- */
  if (path === '/api/studio/change' && request.method === 'POST') {
    if (!key) return needKey();
    const row = await getAd(env, body.id);
    const ask = clip(body.instruction, 800).trim();
    if (!row || !ask) return json({ error: 'id and an instruction are required' }, 400);
    return stream(CORS, async send => {
      const m = await models(key);
      const src = (await env.MEDIA.get(keyOf(row, 'square'))) || (await env.MEDIA.get(keyOf(row, 'full')));
      const full = new Uint8Array(await src.arrayBuffer());
      const sz = pngSize(full);
      const prompt = `This is a finished ad. Make only this change: ${ask}\nKeep everything else exactly as it is: the product and its logos, the scene, the colours, and all other words in the same lettering. Keep every word inside the frame with a small margin. Spell every word exactly.`;
      send({ type: 'status', text: 'Making the change. About 40 seconds.' });
      const out = await imageCall(key, m.image, { images: [{ buf: full, type: 'image/png' }], fidelity: true, prompt, size: `${sz.w || 1024}x${sz.h || 1024}` });
      const spec = { ...safeJson(row.spec_json, {}), changes: [...(safeJson(row.spec_json, {}).changes || []), ask].slice(-10) };
      const ad = await saveAd(env, row.act_id, { bytes: out.bytes, spec, prompt, model: m.image, cost: COST.image, parent: row.id, batch_id: row.batch_id, line: row.line });
      await env.DB.prepare(`UPDATE p_studio_ad SET status = 'deleted', updated_at = datetime('now') WHERE id = ?1`).bind(row.id).run();
      send({ type: 'done', ad });
    });
  }

  /* ---- 4:5 with a GUARANTEED 1:1 safe area ----
     Asking the model to keep words out of the top and bottom tenths did not work (3 of 4 ads broke
     it). So every ad is made SQUARE (the safe area), then the browser sends the square placed in a
     4:5 canvas with transparent bands; the model fills only the bands (the transparency is the
     mask), and the browser puts the original square back on top, feathered. Nothing can land
     outside the 1:1 area. extend = step 1 (the bands); finalize = step 2 (the composite). */
  if (path === '/api/studio/extend' && request.method === 'POST') {
    if (!key) return needKey();
    const row = await getAd(env, body.id);
    if (!row || !body.png) return json({ error: 'id and png are required' }, 400);
    return stream(CORS, async send => {
      const m = await models(key);
      const canvas = unb64(String(body.png).replace(/^data:image\/png;base64,/, ''));
      const out = await imageCall(key, m.image, { images: [{ buf: canvas, type: 'image/png' }], mask: canvas, fidelity: true, size: '1024x1280', quality: 'medium',
        prompt: 'Extend this picture upward and downward to fill the transparent areas: continue the same background, surfaces, light and colour grade seamlessly. Add NO text, NO product, NO logos, NO new objects in the new areas. Leave the existing picture exactly as it is.' });
      await env.MEDIA.put(keyOf(row, 'ext'), out.bytes, { httpMetadata: { contentType: 'image/png' } });
      await env.DB.prepare(`UPDATE p_studio_ad SET cost = cost + ?2, updated_at = datetime('now') WHERE id = ?1`).bind(row.id, 0.08).run();
      send({ type: 'done', ad: shape(await getAd(env, row.id)) });
    });
  }
  if (path === '/api/studio/finalize' && request.method === 'POST') {
    const row = await getAd(env, body.id);
    if (!row || !body.png) return json({ error: 'id and png are required' }, 400);
    const cur = await env.MEDIA.get(keyOf(row, 'full'));
    if (cur && row.full_w === row.full_h) await env.MEDIA.put(keyOf(row, 'square'), await cur.arrayBuffer(), { httpMetadata: { contentType: 'image/png' } });
    const bytes = unb64(String(body.png).replace(/^data:image\/png;base64,/, ''));
    const { w, h } = pngSize(bytes);
    await env.MEDIA.put(keyOf(row, 'full'), bytes, { httpMetadata: { contentType: 'image/png' } });
    await env.DB.prepare(`UPDATE p_studio_ad SET full_w = ?2, full_h = ?3, updated_at = datetime('now') WHERE id = ?1`).bind(row.id, w, h).run();
    return json({ ok: true, ad: shape(await getAd(env, row.id)) });
  }

  /* ---- the product fingerprint ----
     The image model kept redesigning complex shapes (a putter head, where the neck sits) while
     getting colour and logos right. A written, checkable description of the product, made once
     from all its photos and editable by the team, rides in every prompt and every check. */
  if (path === '/api/studio/dna' && request.method === 'POST') {
    if (!key) return needKey();
    const handle = clip(body.handle, 200), cfgKey = `dna:${act}:${handle}`;
    if (!body.refresh && !body.text) { const have = await cfgGet(env, cfgKey); if (have) return json({ dna: have }); }
    if (typeof body.text === 'string') { await cfgSet(env, cfgKey, clip(body.text, 3000)); return json({ dna: clip(body.text, 3000) }); }
    const imgs = await refImages(env, urls(body.images, 8), 8);
    if (!imgs.length) return json({ error: 'No product photos.' }, 400);
    const m = await models(key);
    const content = [{ type: 'text', text: `These are photos of one real product: "${clip(body.title, 200)}". Write its FINGERPRINT: the exact, checkable facts an illustrator needs to draw it so its owner would say "that is ours". Cover, as short bullet lines: overall silhouette from the top, side and front; every distinctive shape (cut-outs, wings, flanges, curves) and where it sits; how and where parts join (for a club: the neck or hosel type and where the shaft enters the head); proportions; colours and finish per part; every logo, word and mark with its exact position. Only what the photos show. No marketing words.` }];
    for (const r of imgs) content.push({ type: 'image_url', image_url: { url: `data:${r.type};base64,${b64(r.buf)}` } });
    const res = await fetch(`${OA}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: m.check || m.vision, messages: [{ role: 'user', content }] }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return json({ error: j.error?.message || 'Could not read the product.' }, 500);
    const dna = clip((j.choices?.[0]?.message?.content || '').replace(/\u2014/g, ','), 3000);
    await cfgSet(env, cfgKey, dna);
    return json({ dna });
  }

  return null;
}
