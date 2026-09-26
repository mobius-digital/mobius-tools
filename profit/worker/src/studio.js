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
const KINDS = new Set(['full', 'plate', 'final']);
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
  MODELS = { key, image: img.pop() || imgAny.pop() || 'gpt-image-1', vision: vis.pop() || vis2[0] || 'gpt-4o-mini' };
  return MODELS;
}

/* One image call. Retries without whichever optional parameter the model rejects, so a
   model that lacks 4:5 or input_fidelity still works (the editor crops to 4:5 either way). */
async function imageCall(key, model, { prompt, images = [], size = '1024x1280', fidelity = false }) {
  const opts = { size, quality: 'high', ...(fidelity ? { input_fidelity: 'high' } : {}) };
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    if (images.length) {
      const fd = new FormData();
      fd.append('model', model); fd.append('prompt', prompt); fd.append('n', '1');
      for (const [k, v] of Object.entries(opts)) fd.append(k, v);
      images.forEach((im, i) => fd.append('image[]', new Blob([im.buf], { type: im.type }), `ref${i}.${(im.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`));
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

function adPrompt(spec, brand, k = 0, n = 1) {
  const lines = [];
  if (spec.headline) lines.push(`Headline: "${spec.headline}"`);
  if (spec.subline) lines.push(`Smaller line: "${spec.subline}"`);
  if (spec.cta) lines.push(`Button (a clean pill or label shape): "${spec.cta}"`);
  if (spec.art) lines.push(`Title art: "${spec.art}" as custom stylised lettering that is part of the scene itself`);
  return [
    `Create a finished, scroll-stopping Meta feed ad for ${brand}, portrait 4:5.`,
    spec.product ? `The product is "${spec.product}". The attached photos are the real product: reproduce it exactly, with the same shape, colours, materials, logos and any words printed on it.` : '',
    spec.look ? `Scene and look: ${spec.look}` : '',
    spec.who ? `It is for: ${spec.who}. Let that guide the mood, setting and casting.` : '',
    `Typography: ${STYLES[spec.style] || STYLES.auto}`,
    lines.length ? `Put exactly this text on the ad, spelled exactly, and no other words:\n${lines.join('\n')}` : 'Put no text on the ad.',
    'Meta crops 4:5 ads to a square in some placements, so keep every word and the product inside the centred square: the top tenth and bottom tenth of the frame are background only.',
    'No watermark, no extra logos, no made-up words, no price unless it is in the text above.',
    n > 1 ? `This is version ${k + 1} of ${n}: use a clearly different composition and camera angle from the other versions.` : '',
  ].filter(Boolean).join('\n\n');
}

async function refImages(urls) {
  const out = [];
  for (const u of (urls || []).slice(0, 4)) {
    try {
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
        text: { type: 'string' }, role: { type: 'string', enum: ['headline', 'subline', 'cta', 'label', 'art'] },
        is_art: { type: 'boolean' },
        box: { type: 'array', items: { type: 'integer' }, description: '[left, top, right, bottom] in 0-1000 of the image width and height, tight around the letters' },
        color: { type: 'string', description: '#rrggbb of the letters' },
        font: { type: 'string', enum: FONTS }, weight: { type: 'integer', enum: [300, 400, 600, 700, 800] }, upper: { type: 'boolean' },
        bg: { type: 'string', description: '#rrggbb of the button or label shape behind the words, or empty when the words sit on the picture' },
      } } } },
  };
  const expected = [spec.headline, spec.subline, spec.cta].filter(Boolean).map(s => `"${s}"`).join(', ');
  const r = await fetch(`${OA}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, response_format: { type: 'json_schema', json_schema: { name: 'ad_text', strict: true, schema } },
      messages: [{ role: 'user', content: [
        { type: 'text', text: `List every separate line of text drawn on this ad, top to bottom. One entry per visual line (a button is one entry). The words we asked for were: ${expected || 'none'}${spec.art ? `, plus title art "${spec.art}"` : ''}. Title art (stylised lettering that is part of the scene) gets role "art" and is_art true. Ignore words printed on the product itself (logos, embroidery, wordmarks). Font is the closest match from the list. Box must be tight around the letters of that line only.` },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${b64(bytes)}` } },
      ] }],
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error?.message || `OpenAI vision said ${r.status}`);
  return (safeJson(j.choices?.[0]?.message?.content, {}).lines || []).filter(l => Array.isArray(l.box) && l.box.length === 4);
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
    v: (row.updated_at || '').replace(/\D/g, ''),
  };
}
const getAd = (env, id) => env.DB.prepare(`SELECT * FROM p_studio_ad WHERE id = ?1`).bind(id).first();
const keyOf = (row, kind) => `studio/${row.act_id}/${row.id}/${kind}.png`;

async function makeOne(env, key, m, act, brand, spec, refs, k, n, parent) {
  const prompt = adPrompt(spec, brand, k, n);
  const out = await imageCall(key, m.image, { prompt, images: refs });
  const { w, h } = pngSize(out.bytes);
  const id = rid();
  await env.MEDIA.put(`studio/${act}/${id}/full.png`, out.bytes, { httpMetadata: { contentType: 'image/png' } });
  await env.DB.prepare(`INSERT INTO p_studio_ad (id, act_id, parent_id, status, spec_json, prompt, model, full_w, full_h, cost) VALUES (?1, ?2, ?3, 'review', ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(id, act, parent || null, JSON.stringify(spec), prompt, m.image, w, h, COST.image).run();
  return shape(await getAd(env, id));
}

function cleanSpec(s = {}) {
  return {
    product: clip(s.product, 200), product_handle: clip(s.product_handle, 200),
    images: (Array.isArray(s.images) ? s.images : []).filter(u => /^https:\/\//.test(u)).slice(0, 4).map(u => clip(u, 1000)),
    who: clip(s.who, 300), headline: clip(s.headline, 160), subline: clip(s.subline, 240), cta: clip(s.cta, 40),
    art: clip(s.art, 40), look: clip(s.look, 1200), style: STYLES[s.style] ? s.style : 'auto',
  };
}

/* ---------------- public: the images ---------------- */
export async function handlePublic(request, env, url, path, json, CORS) {
  const m = path.match(/^\/api\/studio\/img\/([a-f0-9]{24})\/(full|plate|final)$/);
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
  const body = request.method === 'POST' || request.method === 'PUT' ? await request.clone().json().catch(() => ({})) : {};
  const act = url.searchParams.get('act') || body.act || '';

  if (path === '/api/studio' && request.method === 'GET') {
    const key = await getKey(env);
    const acct = act ? await env.DB.prepare(`SELECT act_id, name, tw_shop FROM accounts WHERE act_id = ?1`).bind(act).first() : null;
    const rows = act ? (await env.DB.prepare(`SELECT * FROM p_studio_ad WHERE act_id = ?1 AND status != 'gone' ORDER BY created_at DESC LIMIT 300`).bind(act).all()).results || [] : [];
    const spent = act ? (await env.DB.prepare(`SELECT COALESCE(SUM(cost),0) c FROM p_studio_ad WHERE act_id = ?1 AND created_at >= date('now','start of month')`).bind(act).first())?.c || 0 : 0;
    return json({ has_key: !!key, has_media: !!env.MEDIA, account: acct, ads: rows.map(shape), spent_month: Math.round(spent * 100) / 100, styles: Object.keys(STYLES), fonts: FONTS });
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
    if (!spec.images.length) return json({ error: 'Pick a product first.' }, 400);
    const n = Math.max(1, Math.min(4, +body.n || 1));
    const acct = await env.DB.prepare(`SELECT name FROM accounts WHERE act_id = ?1`).bind(act).first();
    if (!acct) return json({ error: 'unknown brand' }, 404);
    return stream(CORS, async send => {
      const m = await models(key);
      send({ type: 'status', text: `Making ${n} version${n > 1 ? 's' : ''} with ${m.image}. About a minute.` });
      const refs = await refImages(spec.images);
      if (!refs.length) throw new Error('Could not load the product photos.');
      const results = await Promise.allSettled(Array.from({ length: n }, (_, k) =>
        makeOne(env, key, m, act, acct.name, spec, refs, k, n, body.parent_id).then(ad => { send({ type: 'ad', ad }); return ad; })));
      const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value);
      const bad = results.filter(r => r.status === 'rejected').map(r => r.reason?.message || 'failed');
      if (!ok.length) throw new Error(bad[0] || 'Nothing came back.');
      send({ type: 'done', ads: ok, failed: bad });
    });
  }

  /* First Edit: erase the words (plate) and read where they were (layers), in parallel. */
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
      send({ type: 'status', text: 'Lifting the words off the picture. About 30 seconds.' });
      const words = [spec.headline, spec.subline, spec.cta].filter(Boolean);
      const erase = imageCall(key, m.image, {
        images: [{ buf: full, type: 'image/png' }], fidelity: true,
        size: row.full_w && row.full_h ? `${row.full_w}x${row.full_h}` : '1024x1280',
        prompt: [
          `Remove all the ad text from this image${words.length ? `: ${words.map(w => `"${w}"`).join(', ')}` : ''}, including any button, pill or label shapes behind those words. Fill each area with the natural background so no trace of text remains.`,
          spec.art ? `Keep the title art "${spec.art}" exactly as it is.` : '',
          'Change nothing else: the same product with its own logos and printing, the same scene, lighting, colours and framing, pixel for pixel wherever there was no text.',
        ].filter(Boolean).join(' '),
      });
      const read = readText(key, m.vision, full, spec);
      const [plate, lines] = await Promise.all([erase, read]);
      await env.MEDIA.put(keyOf(row, 'plate'), plate.bytes, { httpMetadata: { contentType: 'image/png' } });
      const layers = { source: 'ai', lines: lines.filter(l => !l.is_art && l.role !== 'art'), art: lines.filter(l => l.is_art || l.role === 'art') };
      await env.DB.prepare(`UPDATE p_studio_ad SET has_plate = 1, layers_json = ?2, cost = cost + ?3, updated_at = datetime('now') WHERE id = ?1`)
        .bind(row.id, JSON.stringify(layers), COST.image + COST.vision).run();
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

  return null;
}
