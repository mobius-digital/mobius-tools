/**
 * THE STRATEGIST PRESSES MAKE (2026-10-18). Cole in #vetripaws-internal: "just make the ads and show them to me
 * and I'll tell you to change something". The Strategist could only save Studio drafts and tell him to pick the
 * product and press Make, so three rounds of copy and still no ad. Now:
 *
 *   studio_make   tool: the products picked per batch (matched on the store's own product list), the thread's
 *                 reference images as the batch swipe file, then a job on the IDEA_Q queue. Returns at once.
 *   runStudioMake the job: Studio's own art director (/api/studio-ai/plan, in process) and Studio's own Make
 *                 (/api/studio/make and /vary on the profit worker, as the owner), two ads at a time per
 *                 batch, every batch at once. The batch is saved planned + made, so Studio shows the same
 *                 thing the browser would have made. Then the ads go into the Slack thread, one post per batch.
 *
 * Designed ads come out SQUARE (profit studio.js makeOne): the browser widens them to 4:5 with a canvas step a
 * worker cannot run, so the Slack-made ads stay 1:1 (Meta takes 1:1 in feed) until someone fits them in Studio.
 * Tests: node test-studiomake.mjs (offline, every call mocked).
 */
const AH_ORIGIN = 'https://mobius-account-health.mobius-digital.workers.dev';
const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const MAX_ADS = 24, LANES = 2;
const clip = (s, n) => String(s ?? '').slice(0, n);
const safeJson = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

/* The owner's session for the profit worker (Studio's routes are staff routes there). */
async function profitCall(env, d, path, { method = 'GET', body, raw, type } = {}) {
  if (!env.PROFIT) throw new Error('The PROFIT service binding is missing on account-health.');
  const { token } = await d.mintSession(env, env.OWNER_EMAIL || 'cole@go-mobius-digital.com');
  const headers = { Authorization: `Bearer ${token}` };
  if (raw) headers['Content-Type'] = type; else if (body) headers['Content-Type'] = 'application/json';
  return env.PROFIT.fetch(new Request(PROFIT_ORIGIN + path, { method, headers, body: raw || (body ? JSON.stringify(body) : undefined) }));
}
/* Studio's long calls answer as NDJSON (status, ad, done, error lines). The last done wins; an error throws. */
export async function readStream(res) {
  const text = await res.text();
  if (!res.ok && !/^\s*\{/.test(text)) throw new Error(`HTTP ${res.status}`);
  let done = null;
  for (const line of text.split('\n')) {
    const o = safeJson(line.trim() || null, null);
    if (!o) continue;
    if (o.type === 'error' || (o.error && !o.type)) throw new Error(o.text || o.error);
    if (o.type === 'done') done = o;
  }
  if (!done) throw new Error('Studio sent nothing back.');
  return done;
}

/** The store's products, as Studio's product picker sees them. */
async function storeProducts(env, d, act) {
  const r = await profitCall(env, d, `/api/studio/products?act=${encodeURIComponent(act)}`);
  const j = await r.json().catch(() => ({}));
  return j.products || [];
}
/** A product by name: exact title, then handle, then every word of the ask inside the title. */
export function matchProduct(list, want) {
  const w = norm(want);
  if (!w) return null;
  return list.find(p => norm(p.title) === w) || list.find(p => norm(p.handle) === w)
    || list.filter(p => w.split(' ').every(x => norm(p.title).includes(x))).sort((a, b) => a.title.length - b.title.length)[0]
    || list.filter(p => norm(p.title).split(' ').filter(x => x.length > 2).every(x => w.includes(x))).sort((a, b) => b.title.length - a.title.length)[0] || null;
}
/* Studio's own setup shape (profit studio.js product picker): one product's photos, up to six. */
const setupFor = (p, swipe) => ({ products: [{ title: p.title, handle: p.handle, type: p.type || '', all: p.images, dna: null }], images: (p.images || []).slice(0, 6), swipe: swipe || [] });

/* The images posted in this thread (the reference ad), uploaded to Studio so the art director can use them. */
async function threadRefs(env, d, ctx) {
  if (!ctx?.channel || !ctx?.thread) return [];
  const r = await d.slack(env, 'conversations.replies', { channel: ctx.channel, ts: ctx.thread, limit: 30 }).catch(() => null);
  const files = (r?.messages || []).filter(m => !m.bot_id).flatMap(m => m.files || [])
    .filter(f => /^image\/(png|jpeg|webp)$/i.test(f.mimetype || '')).slice(0, 3);
  const out = [];
  for (const f of files) {
    for (const url of [f.thumb_1024, f.url_private].filter(Boolean)) {
      const res = await d.xfetch(url, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } }).catch(() => null);
      const type = (res?.headers.get('content-type') || '').split(';')[0].trim();
      if (!res?.ok || !/^image\/(png|jpeg|webp)$/.test(type)) continue;
      const up = await profitCall(env, d, '/api/studio/upload', { method: 'POST', raw: await res.arrayBuffer(), type });
      const j = await up.json().catch(() => ({}));
      if (j.url) { out.push(j.url); break; }
    }
  }
  return out;
}

export function studioMakeTools(d) {
  return [{
    def: { name: 'studio_make',
      description: 'MAKE the ads of Studio batches now and show them: Studio\'s art director plans each line, the image AI makes one ad per line, the batches are saved in Locus Studio as made, and (in Slack) every ad is posted in this thread when done, about 3 to 6 minutes later. Use it whenever someone says make / build / create / show me the ads, and right after studio_batch when the person wants to see ads, not drafts. Never tell the person to press Make themselves. Give each batch its product as the store names it (one product a batch). The thread\'s images (a reference ad someone posted) go to the art director as the swipe file unless reference is false. About $0.35 an ad.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string', description: 'Default: this channel\'s brand.' },
        batches: { type: 'array', items: { type: 'object', properties: {
          batch_id: { type: 'string', description: 'A p_studio_batch id (studio_batch returns it).' },
          product: { type: 'string', description: 'The product to show, as the store names it.' },
          testing: { type: 'string', enum: ['concepts', 'visuals', 'format', 'headlines', 'hooks', 'copy', 'offer', 'reviews'], description: 'Only to change the batch\'s testing. concepts / visuals / format = every ad its own look; the others make ad 1 and change only the words on the rest.' } }, required: ['batch_id', 'product'] } },
        reference: { type: 'boolean', description: 'Use this thread\'s images as the swipe file. Default true.' } }, required: ['batches'] } },
    async run(env, input, ctx) {
      const asked = (input.batches || []).slice(0, 8);
      if (!asked.length) return { is_error: true, text: 'Name at least one batch.' };
      const rows = [];
      for (const a of asked) {
        const r = await env.DB.prepare(`SELECT id, act_id, name, brief_json FROM p_studio_batch WHERE id = ?1`).bind(clip(a.batch_id, 40)).first();
        if (!r) return { is_error: true, text: `No Studio batch ${a.batch_id}. Read p_studio_batch for the ids.` };
        if (ctx?.screen?.act_id && r.act_id !== ctx.screen.act_id) return { is_error: true, text: `Batch ${a.batch_id} belongs to another brand.` };
        rows.push({ ...r, want: a });
      }
      const act = rows[0].act_id;
      if (rows.some(r => r.act_id !== act)) return { is_error: true, text: 'One brand per call.' };
      const products = await storeProducts(env, d, act);
      if (!products.length) return { is_error: true, text: 'Studio could not read this brand\'s store products (no Shopify store set in Settings, or the store refused). Nothing was made.' };
      const jobs = [], missing = [];
      let ads = 0;
      for (const r of rows) {
        const p = matchProduct(products, r.want.product);
        if (!p) { missing.push(r.want.product); continue; }
        const lines = (safeJson(r.brief_json, {}).lines || []).filter(l => String(l.text || '').trim()).length;
        ads += lines;
        jobs.push({ batch_id: r.id, name: r.name, product: { title: p.title, handle: p.handle, type: p.type || '', images: (p.images || []).slice(0, 8) }, testing: r.want.testing || null });
      }
      if (missing.length) return { is_error: true, text: `No store product matches ${missing.map(m => `"${m}"`).join(', ')}. The store has: ${products.slice(0, 60).map(p => p.title).join(' | ')}` };
      if (ads > MAX_ADS) return { is_error: true, text: `That is ${ads} ads; one call makes up to ${MAX_ADS}. Split it.` };
      const swipe = input.reference === false ? [] : await threadRefs(env, d, ctx).catch(() => []);
      const job = { kind: 'studio_make', act, jobs, swipe, channel: ctx?.surface === 'slack' ? ctx.channel : null, thread: ctx?.surface === 'slack' ? ctx.thread : null, who: ctx?.who || null };
      if (env.IDEA_Q) await env.IDEA_Q.send(job);
      else await runStudioMake(env, d, job);
      const where = job.channel ? 'They post in this thread as each batch finishes' : `They show in Locus Studio (${LOCUS}?open=studio&act=${act})`;
      return { text: `Making ${ads} ads now (${jobs.map(j => `${j.name}: ${j.product.title}`).join('; ')})${swipe.length ? `, with the thread's ${swipe.length === 1 ? 'reference image' : swipe.length + ' reference images'} as the swipe file` : ''}. ${where}, in about ${Math.max(3, Math.ceil(ads / 2) + 1)} minutes; about $${(ads * 0.35).toFixed(2)}. Tell the person that in one line and stop: do not describe the ads before they exist.` };
    } }];
}

/* One ad: Make (or a words-only Vary off the batch's first ad). Returns Studio's ad row. */
async function makeAd(env, d, act, batchId, i, spec, baseId) {
  const res = baseId
    ? await profitCall(env, d, `/api/studio/vary?act=${encodeURIComponent(act)}`, { method: 'POST', body: { act, base_id: baseId, spec, batch_id: batchId, line: i } })
    : await profitCall(env, d, `/api/studio/make?act=${encodeURIComponent(act)}`, { method: 'POST', body: { act, spec, n: 1, batch_id: batchId, line: i } });
  const done = await readStream(res);
  const ad = done.ad || (done.ads || [])[0];
  if (!ad) throw new Error((done.failed || [])[0] || 'no ad came back');
  return ad;
}
/* The spec Studio's browser sends for one planned ad (profit studio.js specOf), for a one-product batch. */
export function specFor(setup, brief, a) {
  const ref = a.ref_url && a.ref_use !== 'none' ? [a.ref_url] : [];
  return { products: setup.products.map(p => ({ title: p.title, handle: p.handle })), images: setup.images.slice(), inspo: ref, ref_use: a.ref_use, base: a.photo_url || '',
    headline: a.headline, subline: a.subline, callouts: a.callouts || [], cta: a.cta, art: a.art || '', look: a.look, style: a.style || 'auto', note: a.note,
    who: brief.why || '', dna: '' };
}

async function oneBatch(env, d, job, j) {
  const row = await env.DB.prepare(`SELECT * FROM p_studio_batch WHERE id = ?1`).bind(j.batch_id).first();
  if (!row) throw new Error('the batch is gone');
  const brief = safeJson(row.brief_json, {});
  if (j.testing) brief.testing = j.testing;
  brief.lines = (brief.lines || []).filter(l => String(l.text || '').trim());
  const setup = setupFor(j.product, job.swipe);
  /* The art director, in process (the same route the Studio page calls). */
  const plan = await readStream(await d.ahFetch(new Request(AH_ORIGIN + '/api/studio-ai/plan', { method: 'POST',
    headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ act: job.act, batch: { angle: brief.angle, why: brief.why, concept: brief.concept, testing: brief.testing, lines: brief.lines },
      products: [j.product.title], handles: [j.product.handle], swipe: setup.swipe, exact: false, cutouts: [], own_ad: '' }) }), env));
  const planned = { ads: plan.ads || [], variation: !!plan.variation, exact: false };
  await env.DB.prepare(`UPDATE p_studio_batch SET brief_json = ?2, setup_json = ?3, plan_json = ?4, status = 'planned', updated_at = datetime('now') WHERE id = ?1`)
    .bind(j.batch_id, JSON.stringify(brief), JSON.stringify(setup), JSON.stringify(planned)).run();
  const made = new Array(planned.ads.length).fill(null), failed = [];
  const one = async (i, baseId) => {
    try { made[i] = await makeAd(env, d, job.act, j.batch_id, i, specFor(setup, brief, planned.ads[i]), baseId); }
    catch (e) { failed.push(`ad ${i + 1}: ${e.message}`); }
  };
  if (planned.variation) {
    await one(0, null);
    if (made[0]) { let next = 1; const lane = async () => { while (next < made.length) { const i = next++; await one(i, made[0].id); } }; await Promise.all([lane(), lane()]); }
  } else {
    let next = 0; const lane = async () => { while (next < made.length) { const i = next++; await one(i, null); } };
    await Promise.all(Array.from({ length: LANES }, lane));
  }
  if (made.some(Boolean)) await env.DB.prepare(`UPDATE p_studio_batch SET status = 'made', updated_at = datetime('now') WHERE id = ?1`).bind(j.batch_id).run();
  return { name: row.name, product: j.product.title, ads: made, plan: planned.ads, failed };
}

/* All of a batch's ads in ONE Slack post: upload each, then one completeUploadExternal with every file. */
async function postBatch(env, d, job, b) {
  const files = [];
  for (const [i, ad] of b.ads.entries()) {
    if (!ad) continue;
    const res = await env.PROFIT.fetch(new Request(`${PROFIT_ORIGIN}/api/studio/img/${ad.id}/full`)).catch(() => null);
    if (!res?.ok) continue;
    const bytes = new Uint8Array(await res.arrayBuffer());
    const a = await d.slack(env, 'files.getUploadURLExternal', { filename: `${clip(b.name, 40).replace(/[^\w-]+/g, '-')}-${i + 1}.png`, length: bytes.length });
    if (!a?.ok) continue;
    const up = await d.xfetch(a.upload_url, { method: 'POST', body: bytes });
    if (up.ok) files.push({ id: a.file_id, title: `${i + 1}. ${clip(b.plan[i]?.headline || b.name, 150)}` });
  }
  const head = `*${b.name}* (${b.product}): ${files.length} of ${b.ads.length} made${b.failed.length ? `. Failed: ${b.failed.join('; ')}` : ''}`;
  if (!files.length) return d.slack(env, 'chat.postMessage', { channel: job.channel, thread_ts: job.thread, text: head });
  return d.slack(env, 'files.completeUploadExternal', { files, channel_id: job.channel, thread_ts: job.thread, initial_comment: head });
}

/** The queue job. Every batch at once; each posts the moment it is done, then one closing line. */
export async function runStudioMake(env, d, job) {
  const results = await Promise.all((job.jobs || []).map(j => oneBatch(env, d, job, j)
    .then(async b => { if (job.channel) await postBatch(env, d, job, b).catch(e => console.log('studio make post: ' + e.message)); return b; })
    .catch(async e => { const b = { name: j.name, product: j.product.title, ads: [], plan: [], failed: [e.message] }; if (job.channel) await d.slack(env, 'chat.postMessage', { channel: job.channel, thread_ts: job.thread, text: `*${j.name}*: nothing made (${e.message}).` }).catch(() => {}); return b; })));
  const made = results.reduce((n, b) => n + b.ads.filter(Boolean).length, 0), total = results.reduce((n, b) => n + Math.max(b.ads.length, 0), 0);
  if (job.channel && made) await d.slack(env, 'chat.postMessage', { channel: job.channel, thread_ts: job.thread, unfurl_links: false,
    text: `${made} of ${total} ads are made and saved in <${LOCUS}?open=studio&act=${job.act}|Locus Studio>. Tell me what to change on any of them (say the batch and number). They are square; Studio fits them to 4:5.` }).catch(() => {});
  return results;
}
