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
 */
import { claude, jsonOf, VOICE, clip, safeJson } from './research.js';
import { getSkill, skillSystem } from './skill.js';
import { readDoc } from './asana-brand.js';

const STR = { type: 'string' }, ARR = { type: 'array', items: STR };
const obj = p => ({ type: 'object', additionalProperties: false, required: Object.keys(p), properties: p });
const TESTING = ['concepts', 'headlines', 'visuals', 'offer', 'reviews', 'hooks', 'copy', 'format'];
const STYLES = ['auto', 'bold', 'clean', 'serif', 'hand', 'luxe', 'native'];

function streamed(ctx, work) {
  const { readable, writable } = new TransformStream();
  const w = writable.getWriter(); const enc = new TextEncoder();
  const put = o => w.write(enc.encode(JSON.stringify(o) + '\n')).catch(() => {});
  const run = (async () => {
    const ping = setInterval(() => put({ type: 'ping' }), 10000);
    try { put({ type: 'done', ...(await work(o => put(o))) }); }
    catch (e) { put({ type: 'error', text: e.message || 'Something went wrong. Try again.' }); }
    finally { clearInterval(ping); await w.close().catch(() => {}); }
  })();
  ctx?.waitUntil?.(run);
  return new Response(readable, { headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
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
  const b = await request.json().catch(() => ({}));
  const acct = b.act && await env.DB.prepare(`SELECT act_id, name FROM accounts WHERE act_id = ?1`).bind(b.act).first();
  if (!acct) return json({ error: 'pick a brand first' }, 400);
  const A = acct.act_id;

  /* ---- read briefs into batches ---- */
  if (path === '/api/studio-ai/brief') return streamed(ctx, async put => {
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
    const m = await claude(env, {
      system: `You read a marketing team's creative briefs for ${acct.name} and lay each one out as a test batch in the Mobius framework. ${VOICE}`,
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
- "why" is what the team believes about the customer, if the brief says; otherwise one short line inferred from the angle.
- name: 2 to 5 words, e.g. "Gift angle, 3 concepts".`,
      schema: obj({ batches: { type: 'array', items: BATCH } }), effort: 'low', maxTokens: 24000,
    });
    const batches = (jsonOf(m).batches || []).slice(0, 60).map(x => ({ ...x, lines: (x.lines || []).slice(0, 12) })).filter(x => x.lines.length);
    return { batches };
  });

  /* ---- the art director ---- */
  if (path === '/api/studio-ai/plan') return streamed(ctx, async put => {
    const bt = b.batch || {};
    const lines = (Array.isArray(bt.lines) ? bt.lines : []).slice(0, 12);
    if (!lines.length) throw new Error('The batch has no lines.');
    const swipe = (Array.isArray(b.swipe) ? b.swipe : []).filter(u => /^https:\/\//.test(u)).slice(0, 12);
    const products = (Array.isArray(b.products) ? b.products : []).slice(0, 4).map(t => clip(t, 160));
    const skill = await getSkill(env, A);
    let speaker = '';
    if (skill.source !== 'repo') speaker = safeJson((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'voice_speaker'`).bind(A).first())?.data_json, {}).md || '';
    const voice = skill.instructions ? skillSystem(acct.name, skill, speaker) : `You write copy for ${acct.name} in their voice. Never invent a product fact, price, number or review.`;
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
    swipe.forEach((u, i) => { content.push({ type: 'text', text: `SWIPE FILE image ${i + 1}:` }); content.push({ type: 'image', source: { type: 'url', url: u } }); });
    lines.forEach((l, i) => (l.inspo || []).slice(0, 2).forEach((u, k) => { content.push({ type: 'text', text: `LINE ${i + 1} INSPIRATION ${k + 1} (make it look like this):` }); content.push({ type: 'image', source: { type: 'url', url: u } }); }));
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
- STYLE: one of ${STYLES.join(', ')} per ad (auto lets the image model pick).
- ref: "line" (its own inspiration), "swipe N" (swipe file image N), or "none". ref_use: copy, vibe or none.
- note: one short line for the team on what this ad is going for.` });
    const m = await claude(env, {
      system: [{ type: 'text', text: voice, cache_control: { type: 'ephemeral' } }, { type: 'text', text: VOICE }],
      user: content,
      schema: obj({ ads: { type: 'array', items: obj({
        headline: STR, subline: STR, callouts: ARR, cta: STR, art: STR, look: STR,
        style: { type: 'string', enum: STYLES }, ref: STR, ref_use: { type: 'string', enum: ['copy', 'vibe', 'none'] }, note: STR,
      }) } }),
      effort: 'medium', maxTokens: 16000,
    });
    /* No em dashes anywhere (Mobius house rule); the model still slips them into stat lines. */
    const nd = v => typeof v === 'string' ? v.replace(/\s*—\s*/g, ', ') : Array.isArray(v) ? v.map(nd) : v;
    const ads = (jsonOf(m).ads || []).slice(0, lines.length).map(x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, nd(v)]))).map((a, i) => {
      const sw = (a.ref.match(/swipe\s*(\d+)/i) || [])[1];
      const ref_url = a.ref === 'line' ? (lines[i].inspo || [])[0] || '' : sw ? swipe[+sw - 1] || '' : '';
      return { ...a, callouts: (a.callouts || []).slice(0, 4), ref_url, ref_use: ref_url ? a.ref_use : 'none' };
    });
    return { ads, variation };
  });

  return json({ error: 'not found' }, 404);
}
