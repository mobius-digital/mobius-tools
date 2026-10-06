/* Studio's two Claude steps (2026-09-27). The images are made on the profit worker (OpenAI);
 * the thinking lives here, where the Anthropic key, the brand's copy skill and the Google Doc
 * reader already are.
 *
 *   /api/studio-ai/brief  Read briefs into batches: pasted text, a whole BFCM plan, or Asana
 *                         batches (whose brief is usually a Google Doc link, which is opened).
 *                         One batch = Angle, Why, Concept, What We're Testing, numbered lines.
 *   /api/studio-ai/plan   The art director: one ad plan per line. Writes missing words in the
 *                         brand's voice (the brand's own copy skill is the system prompt), picks
 *                         the look, layout and type style, and decides how each inspiration is used.
 *
 * The framework (Cole's mobius-brief-review skill): Angle = the argument, Concept = the idea we
 * build, Testing = the ONE piece that changes. Testing concepts means genuinely different ads.
 * Testing a piece inside a proven concept means everything else stays the same.
 *
 * Both steps carry the BRAND BRAIN (brain.js, 2026-09-29) in a cached system block, plus the
 * SPECIFICITY rules, because with only the brand's name the output came back generic.
 */
import { claude, jsonOf, VOICE, clip, safeJson } from './research.js';
import { getSkill, skillSystem } from './skill.js';
import { readDoc, asana } from './asana-brand.js';
import { brandBrain, brainBlock, SPECIFICITY } from './brain.js';
import { startVideo, listVideos, deleteVideo, hfStatus, hfSave, uploadRef, writeShot, estimateHf, createVideo } from './studio-video.js';

const STR = { type: 'string' }, ARR = { type: 'array', items: STR };
const obj = p => ({ type: 'object', additionalProperties: false, required: Object.keys(p), properties: p });
const TESTING = ['concepts', 'headlines', 'visuals', 'offer', 'reviews', 'hooks', 'copy', 'format'];
const STYLES = ['auto', 'bold', 'clean', 'serif', 'hand', 'luxe', 'native'];

function streamed(ctx, work, onError) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(); const enc = new TextEncoder();
  const put = o => w.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => {});
  const run = (async () => {
    const ping = setInterval(() => put({ type: 'ping' }), 10000);
    try { put({ type: 'done', ...(await work(o => put(o))) }); }
    catch (e) { put({ type: 'error', text: e.message || 'Something went wrong. Try again.' }); await onError?.(e); }
    finally { clearInterval(ping); await w.close().catch(() => {}); }
  })();
  ctx?.waitUntil?.(run);
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}
/* Every Studio failure is written down (table app_log) so the Strategist's `problems` view can explain
   it in Slack to whoever hit it, instead of the error living only in one person's browser. */
let logReady = false;
async function logProblem(env, actId, where, message) {
  try {
    if (!logReady) { await env.DB.prepare(`CREATE TABLE IF NOT EXISTS app_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL DEFAULT (datetime('now')), app TEXT NOT NULL, act_id TEXT, where_ TEXT, message TEXT)`).run(); logReady = true; }
    await env.DB.prepare(`INSERT INTO app_log (app, act_id, where_, message) VALUES ('studio', ?1, ?2, ?3)`).bind(actId || null, where.replace('/api/studio-ai/', ''), clip(String(message || ''), 600)).run();
  } catch { /* never in the way of the answer */ }
}
/* Width and height from the first bytes of a PNG / JPEG / WebP, without decoding. */
function imageDims(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf);
  try {
    if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: dv.getUint32(16), h: dv.getUint32(20) };
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const mk = b[i + 1];
        if (mk === 0xff) { i++; continue; }
        if (mk === 0xd8 || mk === 0x01 || (mk >= 0xd0 && mk <= 0xd7)) { i += 2; continue; }
        if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7) };
        i += 2 + dv.getUint16(i + 2);
      }
    }
    if (b.length > 30 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
      const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (tag === 'VP8 ') return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
      if (tag === 'VP8L') { const x = dv.getUint32(21, true); return { w: (x & 0x3fff) + 1, h: ((x >>> 14) & 0x3fff) + 1 }; }
      if (tag === 'VP8X') return { w: (b[24] | b[25] << 8 | b[26] << 16) + 1, h: (b[27] | b[28] << 8 | b[29] << 16) + 1 };
    }
  } catch { /* unreadable header: treat as unknown */ }
  return null;
}
/* Reference images the art director is shown. Anthropic reads at most 2000px a side once a request
   carries many images, and one oversized swipe image failed the whole plan ("image dimensions exceed
   max allowed size for many-image requests", Grunk 2026-10-06). The browser shrinks uploads now; this
   is the net: an image still over the limit is left out with a status line, and planning goes on. */
const MAX_REF_PX = 2000;
async function fitRefs(env, urls, put, what) {
  const ok = [];
  for (const u of urls) {
    try {
      /* Studio references live in the R2 bucket this worker also binds (studio/ref/<id>.<ext>), so the
         header is read straight from R2: no Worker-to-Worker fetch. Anything else is passed through. */
      const key = (String(u).match(/\/api\/studio\/ref\/([a-f0-9]{24}\.(?:png|jpg|webp))$/) || [])[1];
      const obj = key && env.MEDIA ? await env.MEDIA.get(`studio/ref/${key}`, { range: { offset: 0, length: 1048576 } }) : null;
      const d = obj ? imageDims(await obj.arrayBuffer()) : null;
      if (d && Math.max(d.w, d.h) > MAX_REF_PX) { put({ type: 'status', text: `Leaving out a ${what} image at ${d.w}x${d.h}: too big to read. Remove it and add it again and Studio shrinks it.` }); continue; }
      ok.push(u);
    } catch { ok.push(u); }
  }
  return ok;
}
const docId = s => (String(s || '').match(/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]{20,})/) || [])[1];

const BATCH = obj({
  name: STR, num: STR, angle: STR, why: STR, concept: STR, post_copy: STR,
  testing: { type: 'string', enum: TESTING },
  lines: { type: 'array', items: obj({ text: STR }) },
});

export async function handleStudioAI(request, env, ctx, path, json, isAdmin) {
  if (!path.startsWith('/api/studio-ai/')) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  /* Raw-body upload (reference videos and images for Higgsfield): the brand comes in ?act=. */
  if (path === '/api/studio-ai/upload') {
    const u = new URL(request.url);
    const ok = await env.DB.prepare(`SELECT act_id FROM accounts WHERE act_id = ?1`).bind(u.searchParams.get('act') || '').first();
    if (!ok) return json({ error: 'pick a brand first' }, 400);
    try { return json(await uploadRef(request, env, ok.act_id, u.origin)); } catch (e) { return json({ error: e.message }, 400); }
  }
  const b = await request.json().catch(() => ({}));
  const acct = b.act && await env.DB.prepare(`SELECT act_id, name FROM accounts WHERE act_id = ?1`).bind(b.act).first();
  if (!acct) return json({ error: 'pick a brand first' }, 400);
  const A = acct.act_id;
  const stream = work => streamed(ctx, work, e => logProblem(env, A, path, e.message));

  /* ---- Make video (Veo, studio-video.js) ---- */
  const run = async f => { try { return json(await f()); } catch (e) { return json({ error: e.message || 'Something went wrong.' }, 400); } };
  if (path === '/api/studio-ai/animate') return run(() => startVideo(env, A, b, new URL(request.url).origin));
  if (path === '/api/studio-ai/video-shot') return run(() => writeShot(env, acct, b, { claude, jsonOf, brandBrain }));
  if (path === '/api/studio-ai/video-estimate') return run(() => estimateHf(env, b));
  if (path === '/api/studio-ai/video-create') return run(() => createVideo(env, A, b));
  if (path === '/api/studio-ai/videos') return run(() => listVideos(env, A, new URL(request.url).origin));
  if (path === '/api/studio-ai/video-delete') return run(() => deleteVideo(env, A, b.id));
  if (path === '/api/studio-ai/higgsfield') return run(() => hfSave(env, b));

  /* ---- read briefs into batches ---- */
  if (path === '/api/studio-ai/brief') return stream(async put => {
    const parts = [];
    for (const id of (Array.isArray(b.br_batch_ids) ? b.br_batch_ids : []).slice(0, 12)) {
      const r = await env.DB.prepare(`SELECT num, title, brief_text FROM p_br_batch WHERE id = ?1 AND act_id = ?2`).bind(id, A).first();
      if (!r) continue;
      let body = r.brief_text || '';
      const d = docId(body);
      if (d) { put({ type: 'status', text: `Opening the brief for ${r.num || ''} ${r.title || ''}` }); body = (await readDoc(env, d).catch(() => null)) || body; }
      parts.push(`=== ASANA BATCH ${r.num || ''}: ${r.title || ''} ===\n${clip(body, 20000)}`);
    }
    if (b.text) parts.push(clip(b.text, 60000));
    if (!parts.length) throw new Error('Paste a brief or pick one from Asana.');
    put({ type: 'status', text: 'Reading the brief' });
    const brain = await brandBrain(env, A).catch(() => ({ md: '' }));
    const m = await claude(env, {
      system: [
        { type: 'text', text: `You read a marketing team's creative briefs for ${acct.name} and lay each one out as a test batch in the Mobius framework. ${VOICE}

The BRAND BRAIN below is everything Locus knows about ${acct.name}. Use it to understand the brief (which persona, which past test, which product) and to write anything the brief leaves out (why, name, a missing concept). The team's own words in the brief are never changed; the specificity rules apply to what YOU write.

${SPECIFICITY}` },
        ...(brain.md ? [brainBlock(brain.md)] : []),
      ],
      user: `${parts.join('\n\n')}\n\nTHE FRAMEWORK:
- Angle = the argument: the reason to buy, one sentence to a specific person.
- Concept = the idea we build to deliver the angle. Only fill it when every line is inside ONE concept.
- Testing = the one piece that changes across the lines: concepts (each line is its own idea), headlines, visuals (same words, different looks), offer, reviews, hooks, copy, or format.
- Each numbered line is one ad.

RULES:
- One batch per brief or per angle block. A plan with many angles gives many batches. Batch "num" is the Asana number if one is given, else empty.
- Keep the team's own words exactly in each line's text (headlines, offers, codes, notes on the look). Never polish them.
- If a brief gives an angle and ideas but no numbered lines, make one line per idea.
- A line that asks for N versions or iterations becomes N lines (same text, marked "iteration 1 of N" and so on).
- The post's own copy (primary text, body, caption, landing page, "ad copy for both versions") is NOT an ad: put it in post_copy, never in a line. Lines are only the images to make.
- "why" is what the team believes about the customer, if the brief says; otherwise one short line inferred from the angle, naming the persona, customer quote or past test from the brand brain it rests on (or saying plainly that the brain has nothing on it).
- name: 2 to 5 words, e.g. "Gift angle, 3 concepts".`,
      schema: obj({ batches: { type: 'array', items: BATCH } }), effort: 'low', maxTokens: 24000,
    });
    const batches = (jsonOf(m).batches || []).slice(0, 60).map(x => ({ ...x, lines: (x.lines || []).slice(0, 12) })).filter(x => x.lines.length);
    return { batches };
  });

  /* ---- the art director ---- */
  if (path === '/api/studio-ai/plan') return stream(async put => {
    const bt = b.batch || {};
    const lines = (Array.isArray(bt.lines) ? bt.lines : []).slice(0, 12);
    if (!lines.length) throw new Error('The batch has no lines.');
    const swipe = (Array.isArray(b.swipe) ? b.swipe : []).filter(u => /^https:\/\//.test(u)).slice(0, 12);
    const products = (Array.isArray(b.products) ? b.products : []).slice(0, 4).map(t => clip(t, 160));
    const skill = await getSkill(env, A);
    let speaker = '';
    if (skill.source !== 'repo') speaker = safeJson((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'voice_speaker'`).bind(A).first())?.data_json, {}).md || '';
    const voice = skill.instructions ? skillSystem(acct.name, skill, speaker) : `You write copy for ${acct.name} in their voice. Never invent a product fact, price, number or review.`;
    /* The brand brain rides after the skill as its own cached block: personas, customer quotes,
       market stage, past tests, staff rules. For a brand with no skill it also carries the voice. */
    const brain = await brandBrain(env, A).catch(() => ({ md: '' }));
    const variation = !['concepts', 'visuals', 'format'].includes(bt.testing);
    const content = [];
    /* House style: this brand's best-selling static ads (Triple Whale revenue, last 120 days),
       from the creative cache. What already sells beats any generic idea of a good ad. */
    const wins = ((await env.DB.prepare(`SELECT a.ad_id, SUM(t.revenue) rev FROM ads a JOIN tw_ad_attr t ON t.ad_id = a.ad_id AND t.model = 'lastPlatformClick'
      WHERE a.act_id = ?1 AND a.media_type = 'image' AND t.date >= date('now', '-120 day') GROUP BY a.ad_id ORDER BY rev DESC LIMIT 10`).bind(A).all().catch(() => ({ results: [] }))).results || []);
    let nWin = 0;
    for (const w of wins) {
      if (nWin >= 5) break;
      const c = safeJson((await env.DB.prepare(`SELECT json FROM ad_creative WHERE ad_id = ?1`).bind(w.ad_id).first().catch(() => null))?.json, null);
      const mt = String(c?.thumb || '').match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
      if (!mt) continue;
      nWin++;
      content.push({ type: 'text', text: `OUR BEST-SELLING AD ${nWin} ($${Math.round(w.rev)} revenue): headline "${clip(c.headline, 120)}"` });
      content.push({ type: 'image', source: { type: 'base64', media_type: mt[1], data: mt[2] } });
    }
    const dnas = [];
    for (const h of (Array.isArray(b.handles) ? b.handles : []).slice(0, 4)) {
      const v = (await env.DB.prepare(`SELECT value FROM p_studio_cfg WHERE key = ?1`).bind(`dna:${A}:${h}`).first().catch(() => null))?.value;
      if (v) dnas.push(v);
    }
    const cutouts = await fitRefs(env, (Array.isArray(b.cutouts) ? b.cutouts : []).filter(u => /^https:\/\//.test(u)).slice(0, 8), put, 'product');
    const exact = !!b.exact && cutouts.length > 0;
    const swipeOk = await fitRefs(env, swipe, put, 'swipe file');
    for (const l of lines) l.inspo = (l.inspo || []).length ? await fitRefs(env, l.inspo.filter(u => /^https:\/\//.test(u)).slice(0, 2), put, 'line inspiration') : [];
    cutouts.forEach((u, i) => { content.push({ type: 'text', text: `PRODUCT PHOTO ${i + 1} (a real photo of the product, cut out; it goes into the ad exactly as shot, at this angle):` }); content.push({ type: 'image', source: { type: 'url', url: u } }); });
    swipeOk.forEach((u, i) => { content.push({ type: 'text', text: `SWIPE FILE image ${i + 1}:` }); content.push({ type: 'image', source: { type: 'url', url: u } }); });
    lines.forEach((l, i) => l.inspo.forEach((u, k) => { content.push({ type: 'text', text: `LINE ${i + 1} INSPIRATION ${k + 1} (make it look like this):` }); content.push({ type: 'image', source: { type: 'url', url: u } }); }));
    content.push({ type: 'text', text: `THE BATCH
Angle: ${clip(bt.angle, 600)}
Why: ${clip(bt.why, 600)}
${bt.concept ? `Concept: ${clip(bt.concept, 600)}\n` : ''}Testing: ${bt.testing || 'concepts'}
Products: ${products.join(', ') || '(none picked)'}${dnas.length ? `\nProduct fingerprint (the product must match this exactly in every ad):\n${dnas.join('\n\n')}` : ''}
Lines:
${lines.map((l, i) => `${i + 1}. ${clip(l.text, 1200)}${(l.inspo || []).length ? ' [has its own inspiration above]' : ''}`).join('\n')}

YOU ARE THE ART DIRECTOR AND THE COPYWRITER. Plan exactly one static 4:5 Meta ad per line, in order.
- WORDS: keep any headline, line, offer or code the brief gives, exactly. Where a line gives no words, write them as the brand speaker would say them to the person the angle is for. Headline a few words. Smaller line optional. Callouts only when the line or angle calls for them, max 4. Button text short or empty.
- ${variation
    ? `This batch tests ${bt.testing} INSIDE one concept. Every ad must share the SAME look, layout and type style; only the tested piece changes (the ${bt.testing}). Write one shared "look" and repeat it on every line.`
    : `This batch tests ${bt.testing === 'visuals' ? 'different looks for the same words: keep the words the same on every line and make each look genuinely different' : 'different ideas: every ad must be genuinely different (scene, composition, camera, type), never near duplicates, because Meta treats look-alikes as duplicates'}.`}
- HOUSE STYLE: ${nWin ? 'the best-selling ads above are what works for this brand. Match their level of restraint, realism and type quality; take their confidence, not their layouts.' : 'restrained, real, confident.'} It must never look like an AI ad: real photography, flat and crisp typography, one clear headline, few elements, no glossy badges, no fake 3D, no clutter.
- LOOK: a concrete scene, mood, light and camera a photographer could shoot, plus the layout (where the product and words sit). Keep all words inside the centred square of the 4:5 frame.
- INSPIRATION: a line with its own inspiration copies that layout and type treatment closely ("copy"). The swipe file is for range, never copied: when it helps, point a line at the swipe image whose style fits and use it as a loose mood reference ("vibe"). With no inspiration, choose varied, strong formats yourself (product hero, lifestyle, native phone post, bold type, comparison, founder note, review card).
- ART: title art is only for a launch or drop where the brief wants ONE word (or two) drawn as lettering art, like a product name. Otherwise leave art empty. Never put a description or idea in art.
- CALLOUTS: short enough to fit a small badge, about 6 words each; keep the team's words, but split a long one into two.
- CALLOUTS THAT NAME A PART of the product (heel, toe, face, sole, neck) must be planned as pointers on that exact part of the product, so the look must show that part clearly. On a club the heel is the shaft end, the toe the far end.
- ${exact ? `EXACT PRODUCT: the product in every ad is one of the PRODUCT PHOTOS above, placed as shot (same angle, never redrawn). For each ad set photo to the number of the photo whose angle suits the idea, and write the look AROUND that angle (camera height and light that match the photo). place: where it sits in the square (center, left, right, lower, upper); size: small, medium or large. Set photo 0 only when no photo angle can possibly show the idea (for example a cut-away cross-section); then the product is drawn by the AI.` : 'Set photo 0, place center, size medium (no exact product photos).'}
- STYLE: one of ${STYLES.join(', ')} per ad (auto lets the image model pick).
- ref: "line" (its own inspiration), "swipe N" (swipe file image N), or "none". ref_use: copy, vibe or none.
- note: one short line for the team on what this ad is going for and what in the brand brain it rests on (the persona, customer quote, past test or product fact), or what was missing.` });
    const m = await claude(env, {
      system: [{ type: 'text', text: voice, cache_control: { type: 'ephemeral' } }, ...(brain.md ? [brainBlock(brain.md)] : []), { type: 'text', text: `${VOICE}

${SPECIFICITY}` }],
      user: content,
      schema: obj({ ads: { type: 'array', items: obj({
        headline: STR, subline: STR, callouts: ARR, cta: STR, art: STR, look: STR,
        style: { type: 'string', enum: STYLES }, photo: { type: 'integer' }, place: { type: 'string', enum: ['center', 'left', 'right', 'lower', 'upper'] }, size: { type: 'string', enum: ['small', 'medium', 'large'] }, ref: STR, ref_use: { type: 'string', enum: ['copy', 'vibe', 'none'] }, note: STR,
      }) } }),
      effort: 'medium', maxTokens: 16000,
    });
    /* No em dashes anywhere (Mobius house rule); the model still slips them into stat lines. */
    const nd = v => typeof v === 'string' ? v.replace(/\s*—\s*/g, ', ') : Array.isArray(v) ? v.map(nd) : v;
    const ads = (jsonOf(m).ads || []).slice(0, lines.length).map(x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, nd(v)]))).map((a, i) => {
      const sw = (a.ref.match(/swipe\s*(\d+)/i) || [])[1];
      const ref_url = a.ref === 'line' ? (lines[i].inspo || [])[0] || '' : sw ? swipeOk[+sw - 1] || '' : '';
      const photo = exact && a.photo >= 1 && a.photo <= cutouts.length ? a.photo : 0;
      return { ...a, callouts: (a.callouts || []).slice(0, 4), ref_url, ref_use: ref_url ? a.ref_use : 'none', photo };
    });
    return { ads, variation, exact };
  });

  /* ---- tell the batch's Asana task the ads are ready (after Send to Canva) ---- */
  if (path === '/api/studio-ai/asana-note') {
    const r = b.br_batch_id && await env.DB.prepare(`SELECT asana_gid, num FROM p_br_batch WHERE id = ?1 AND act_id = ?2`).bind(b.br_batch_id, A).first();
    if (!r?.asana_gid) return json({ ok: false, reason: 'This batch is not linked to an Asana task.' });
    const links = (Array.isArray(b.designs) ? b.designs : []).slice(0, 30);
    const esc = t => String(t || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<body><strong>Locus Studio: ${links.length} ad${links.length === 1 ? '' : 's'} ready for batch ${esc(r.num)}.</strong>
${b.folder_url ? `<a href="${esc(b.folder_url)}">Open the Canva folder</a>
` : ''}<ul>${links.map((d, i) => `<li><a href="${esc(d.edit_url)}">${esc(d.name || `Ad ${i + 1}`)}</a></li>`).join('')}</ul></body>`;
    await asana(env, `/tasks/${r.asana_gid}/stories`, { method: 'POST', body: { html_text: html } });
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}
