/**
 * What the Strategist was missing next to Viktor (2026-10-15, Cole's Bonk BFCM and Ice & Gold V1 threads):
 *   - store_sql     Triple Whale's own warehouse (the Moby SQL API), every brand: orders with their line items,
 *                   units per order, discount codes, bundles, customers, years back. Locus's tw_orders only
 *                   holds cart product ids from Dec 2025.
 *   - web_lookup    a plain search + page reader for when the server web_search runs out mid-answer.
 *   - make_canvas   a Slack canvas Cole can forward (the full write-up; the message stays short).
 *   - match_ads_to_board  which live Meta ad is which Production file (V1 or V2, approved or not), by LOOKING at
 *                   both images (one vision call), plus upload order, so the pause cards go out without a person
 *                   sorting pairs.
 * Plugs into strategist.js `tools`; all HTTP through d.xfetch.
 */
import { gall, metaActs, brandOf } from './metawrite.js';
import { smallPic } from './prodwork.js';

const clip = (s, n) => String(s ?? '').slice(0, n);
const TW_SQL = 'https://api.triplewhale.com/api/v2/orcabase/api/sql';
const VISION_MODEL = 'claude-opus-5-5';

function b64(buf) {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
const ymd = d => d.toISOString().slice(0, 10);

/* ---------------- store_sql ---------------- */
/* The Triple Whale warehouse is ClickHouse. Read-only by shape: one SELECT / WITH statement, no second
   statement, no writes. Triple Whale itself only allows reads on this endpoint; this is belt and braces. */
export function gateTwSql(raw) {
  const sql = String(raw || '').trim().replace(/;+\s*$/, '');
  if (!/^(select|with)\b/i.test(sql)) return { error: 'One SELECT (or WITH ... SELECT) statement.' };
  const bare = sql.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  if (bare.includes(';')) return { error: 'One statement only.' };
  if (/\b(insert|update|delete|drop|alter|create|truncate|rename|attach|detach|optimize|grant|revoke|system|kill)\b/i.test(bare)) return { error: 'Reads only.' };
  return { sql };
}
const STORE_SQL_DOC = `Query the brand's Triple Whale warehouse (ClickHouse SQL, the same data as Triple Whale's Moby) for anything about ORDERS and what was in them, any period back to the store's start: units per order, hats per order, bundle counts, discount code use, product mix, new vs returning, AOV by offer, last year's BFCM. Use it before ever saying "I can't see line items" or "history starts in ...".
Write ONE SELECT. Filter every table with event_date BETWEEN @startDate AND @endDate, and pass from / to.
orders_table (one row per order): event_date, order_id, order_name, customer_id, is_new_customer (1/0), order_revenue, gross_product_sales, discount_amount_for_product, discount_code ('' or 'no discount' when none), discount_type, product_quantity_sold_in_order (units in the order), refund_money, cancelled_at, shipping_price, taxes, cost_of_goods, source_name, tags (Array(String)),
  products_info Array(Tuple(product_id, product_name, vendor, product_type, product_tags Array(String), product_sku, variant_id, product_name_price, discount_amount_for_product, net_discount_amount_for_product, product_name_quantity_sold, is_gift_card, single_product_cost, properties Array(String), duties Array(String))).
Line items: ARRAY JOIN products_info AS p, then p.product_name, p.product_type, p.product_name_quantity_sold, p.product_name_price, p.single_product_cost.
AOV = sum(order_revenue - shipping_price - taxes) / uniq(order_id). Exclude $0 orders (order_revenue > 0) unless asked.
Examples:
 units per order: SELECT avg(product_quantity_sold_in_order) AS units, uniq(order_id) AS orders FROM orders_table WHERE event_date BETWEEN @startDate AND @endDate AND order_revenue > 0
 hats per order: SELECT order_id, sumIf(p.product_name_quantity_sold, positionCaseInsensitive(p.product_type, 'hat') > 0 OR positionCaseInsensitive(p.product_name, 'hat') > 0) AS hats FROM orders_table ARRAY JOIN products_info AS p WHERE event_date BETWEEN @startDate AND @endDate GROUP BY order_id  (wrap it to count orders by hats)
 code use: SELECT discount_code, uniq(order_id) AS orders, sum(order_revenue) AS revenue FROM orders_table WHERE event_date BETWEEN @startDate AND @endDate GROUP BY discount_code ORDER BY orders DESC LIMIT 30
Product types and names differ per brand: look at the products first (SELECT p.product_type, p.product_name, sum(p.product_name_quantity_sold) ... GROUP BY 1,2) when you are not sure what counts as a hat or a bundle.`;

async function twShopOf(env, d, brandInput, ctx) {
  const b = await brandOf(env, d, brandInput, ctx);
  if (!b) return { error: 'Which brand?' };
  let shop = b.tw_shop || null;
  if (!shop) shop = (await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind IN ('tw', 'triplewhale', 'triple_whale') ORDER BY is_primary DESC LIMIT 1`).bind(b.act_id).first().catch(() => null))?.external_id || null;
  return shop ? { brand: b, shop } : { error: `${b.name} has no Triple Whale shop connected in Locus.` };
}
export async function twSql(env, d, { shop, sql, from, to }) {
  if (!env.TW_API_KEY) return { error: 'TW_API_KEY is not set on this worker.' };
  const g = gateTwSql(sql);
  if (g.error) return g;
  const res = await d.xfetch(TW_SQL, { method: 'POST', headers: { 'x-api-key': env.TW_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ shopId: shop, query: g.sql, period: { startDate: from, endDate: to } }) });
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { j = null; }
  if (!res.ok) return { error: `Triple Whale said (HTTP ${res.status}): ${clip(j?.message || j?.error || text, 400)}` };
  const rows = Array.isArray(j) ? j : j?.data || j?.rows || j?.result || j;
  return { rows };
}

/* ---------------- web_lookup ---------------- */
const stripHtml = html => String(html || '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
export function parseDdg(html) {
  const out = [];
  const re = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const hits = [...String(html || '').matchAll(re)];
  for (const [n, m] of hits.entries()) {
    if (out.length >= 10) break;
    let url = m[1].replace(/&amp;/g, '&');
    const u = url.match(/[?&]uddg=([^&]+)/);
    if (u) url = decodeURIComponent(u[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    if (/duckduckgo\.com\/y\.js/.test(url)) continue;   // ads
    const between = html.slice(m.index + m[0].length, hits[n + 1]?.index ?? html.length);
    const sn = between.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/);
    out.push({ title: stripHtml(m[2]), url, snippet: sn ? stripHtml(sn[1]) : '' });
  }
  return out;
}
async function webSearch(d, q) {
  const res = await d.xfetch('https://html.duckduckgo.com/html/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': UA },
    body: new URLSearchParams({ q, kl: 'us-en' }).toString() });
  const hits = res.ok ? parseDdg(await res.text()) : [];
  if (hits.length) return hits;
  /* Bing's plain page as the second door. */
  const b = await d.xfetch(`https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en`, { headers: { 'user-agent': UA } }).catch(() => null);
  if (!b?.ok) return [];
  const html = await b.text(), out = [];
  const re = /<li class="b_algo"[\s\S]*?<a[^>]+href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<p[^>]*>([\s\S]*?)<\/p>)?/g;
  let m;
  while ((m = re.exec(html)) && out.length < 10) out.push({ title: stripHtml(m[2]), url: m[1].replace(/&amp;/g, '&'), snippet: stripHtml(m[3] || '') });
  return out;
}
async function webRead(d, url) {
  const res = await d.xfetch(url, { headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' }, redirect: 'follow' }).catch(e => ({ ok: false, status: 0, err: e.message }));
  if (res.ok) {
    const text = stripHtml(await res.text());
    if (text.length > 400) return { url, text };
  }
  /* A page that needs a browser (or blocks a plain fetch): the reader service renders it. */
  const r = await d.xfetch('https://r.jina.ai/' + url, { headers: { accept: 'text/plain' } }).catch(() => null);
  if (r?.ok) return { url, text: (await r.text()).trim(), via: 'reader' };
  return { url, error: `Could not read it (HTTP ${res.status || 'no answer'}).` };
}

/* ---------------- make_canvas ---------------- */
async function makeCanvas(env, d, ctx, { title, markdown }) {
  const c = await d.slack(env, 'canvases.create', { title: clip(title, 120), document_content: { type: 'markdown', markdown: clip(markdown, 90000) } });
  if (!c?.ok) return { error: c?.error === 'missing_scope' ? 'The Slack app needs the canvases:write scope (api.slack.com > the app > OAuth & Permissions), then reinstall.' : `Slack would not make the canvas: ${c?.error}` };
  const id = c.canvas_id;
  const users = [ctx?.ev?.user].filter(Boolean);
  /* The person who asked can edit it; everyone in the channel can open it (so a share link works). */
  if (users.length) await d.slack(env, 'canvases.access.set', { canvas_id: id, access_level: 'write', user_ids: users }).catch(() => null);
  if (ctx?.channel && !/^D/.test(ctx.channel)) await d.slack(env, 'canvases.access.set', { canvas_id: id, access_level: 'read', channel_ids: [ctx.channel] }).catch(() => null);
  const info = await d.slack(env, 'files.info', { file: id }).catch(() => null);
  const link = info?.file?.permalink || null;
  return { id, link };
}

/* ---------------- match_ads_to_board ---------------- */
async function shrink(env, d, url) {
  const res = await d.xfetch(url);
  if (!res.ok) return null;
  if (env.IMAGES) {
    try {
      const out = (await env.IMAGES.input(res.body).transform({ width: 600, fit: 'scale-down' }).output({ format: 'image/webp', quality: 80 })).response();
      const buf = await out.arrayBuffer();
      if (buf.byteLength) return { bytes: buf, mime: 'image/webp' };
    } catch { return null; }
  }
  const buf = await res.arrayBuffer();
  return buf.byteLength < 3_500_000 ? { bytes: buf, mime: (res.headers.get('content-type') || 'image/jpeg').split(';')[0] } : null;
}
const hashOf = cr => cr?.image_hash || cr?.object_story_spec?.link_data?.image_hash || cr?.object_story_spec?.photo_data?.image_hash
  || cr?.asset_feed_spec?.images?.[0]?.hash || null;
const imgUrlOf = cr => cr?.image_url || cr?.object_story_spec?.video_data?.image_url || cr?.thumbnail_url || null;

export function verdicts(ads, files, pairs) {
  /* Per Production ad (test + ad label): the version to keep = the last one with an approval, else the newest. */
  const byAd = new Map();
  for (const f of files) { const k = `${f.num}|${f.ad}`; if (!byAd.has(k)) byAd.set(k, []); byAd.get(k).push(f); }
  const keepOf = k => {
    const vs = (byAd.get(k) || []).slice().sort((a, b) => a.version - b.version);
    const ok = vs.filter(v => v.call === 'approval');
    return { keep: (ok.length ? ok[ok.length - 1] : vs[vs.length - 1]) || null, newest: vs[vs.length - 1] || null, approved: ok.length > 0 };
  };
  const label = Object.fromEntries(files.map((f, i) => ['P' + (i + 1), f]));
  return ads.map((a, i) => {
    const p = pairs.find(x => x.meta === 'M' + (i + 1));
    const f = p?.file ? label[p.file] : null;
    const base = { ad_id: a.id, ad_name: a.name, ad_set: a.adset, status: a.status, created: a.created, image_name: a.image_name || undefined };
    if (!f) return { ...base, matched: null, sure: p?.sure || 'none', call: 'unsure', why: p?.why || 'No board file looks like this ad.' };
    const k = keepOf(`${f.num}|${f.ad}`);
    const isKeep = k.keep && k.keep.id === f.id;
    return { ...base, matched: `test ${f.num}, ad ${f.ad}, V${f.version}${f.call === 'approval' ? ' (approved)' : ''}`, sure: p.sure,
      call: isKeep ? 'keep' : 'pause',
      why: isKeep ? (k.approved ? `V${f.version} is the approved version on the board.` : `V${f.version} is the newest version; nothing on this ad is approved yet.`)
        : `Board keeps V${k.keep?.version} of ${f.ad}${k.approved ? ' (approved)' : ' (newest)'}; this ad runs V${f.version}.`,
      ...(p.why ? { seen: p.why } : {}) };
  });
}

async function matchAds(env, d, input, ctx) {
  const brand = await brandOf(env, d, input.brand, ctx);
  if (!brand) return { error: 'Which brand?' };
  const metas = await metaActs(env, brand.act_id);
  if (!metas.length) return { error: `${brand.name} has no Meta ad account connected.` };
  const want = String(input.adsets || input.adset || '').toLowerCase().split(/\s*,\s*/).filter(Boolean);
  const camp = String(input.campaign || '').toLowerCase();
  const live = input.status !== 'all';
  const ads = [], seenSets = [];
  let read = 0;
  const LIVE = ['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED'];
  for (const m of metas) {
    /* Named ad sets: find their ids first, so the ads read is only theirs (Meta refuses big creative reads). */
    let setIds = null;
    if (want.length) {
      const sets = await gall(d, env, `${m.act}/adsets`, { fields: 'id,name', limit: '200', ...(live ? { filtering: [{ field: 'effective_status', operator: 'IN', value: LIVE }] } : {}) }, 3).catch(() => []);
      seenSets.push(...sets.map(x => x.name));
      setIds = sets.filter(x => want.some(w => String(x.name).toLowerCase().includes(w) || x.id === w)).map(x => x.id).slice(0, 50);
      if (!setIds.length) continue;
    }
    const filters = [...(live ? [{ field: 'effective_status', operator: 'IN', value: LIVE }] : []), ...(setIds ? [{ field: 'adset.id', operator: 'IN', value: setIds }] : [])];
    const rows = await gall(d, env, `${m.act}/ads`, { fields: 'id,name,status,effective_status,created_time,adset{id,name},campaign{id,name},creative{id,image_hash,image_url,thumbnail_url,object_story_spec}', limit: '25',
      ...(filters.length ? { filtering: filters } : {}), thumbnail_width: '600', thumbnail_height: '600' }, 8);
    read += rows.length;
    for (const r of rows) {
      const sn = String(r.adset?.name || '').toLowerCase(), cn = String(r.campaign?.name || '').toLowerCase();
      if (want.length && !want.some(w => sn.includes(w) || r.adset?.id === w)) continue;
      if (camp && !cn.includes(camp) && r.campaign?.id !== input.campaign) continue;
      ads.push({ id: r.id, name: r.name, adset: r.adset?.name, status: r.effective_status || r.status, created: r.created_time, act: m.act, hash: hashOf(r.creative), img: imgUrlOf(r.creative) });
    }
  }
  if (!ads.length) return { error: `No ${live ? 'live ' : ''}ads match in ${brand.name}'s ${metas.map(m => m.act).join(', ')} (${read} ads read${seenSets.length ? `; live ad sets: ${seenSets.slice(0, 30).join(' / ')}` : ''}). Name the ad sets (words in their names) or the campaign.` };
  if (ads.length > 45) return { error: `${ads.length} ads match; name the ad sets so it is 45 or fewer.` };
  /* The full image behind each hash (and the file name it was uploaded with). */
  for (const m of metas) {
    const hs = [...new Set(ads.filter(a => a.act === m.act && a.hash).map(a => a.hash))];
    for (let i = 0; i < hs.length; i += 40) {
      const imgs = await gall(d, env, `${m.act}/adimages`, { hashes: hs.slice(i, i + 40), fields: 'hash,url,name,created_time' }, 2).catch(() => []);
      for (const im of imgs) for (const a of ads) if (a.hash === im.hash) { a.img = im.url || a.img; a.image_name = im.name; }
    }
  }
  /* Same picture twice in one place is an upload mistake worth saying. */
  const dupes = [];
  const seen = new Map();
  for (const a of ads) if (a.hash) { if (seen.has(a.hash)) dupes.push(`${seen.get(a.hash)} and ${a.name} use the same image`); else seen.set(a.hash, a.name); }

  /* The board: every version file of the tests these ad sets belong to. */
  let nums = (input.tests || []).map(n => String(n).replace(/^0+/, '')).filter(Boolean);
  if (!nums.length) nums = [...new Set(ads.flatMap(a => [String(a.adset || '').match(/^\s*#?(\d{1,4})\b/)?.[1], String(a.name || '').match(/^\s*#?(\d{1,4})\b/)?.[1]]).filter(Boolean).map(n => n.replace(/^0+/, '') || '0'))];
  if (!nums.length) return { error: 'Which tests on the Production board? Give their numbers (tests).' };
  const ph = nums.map((_, i) => `?${i + 2}`).join(', ');
  const files = (await env.DB.prepare(`SELECT f.id, b.num, b.title, f.ad, f.version, f.mime, f.name, f.created_at,
      (SELECT c.kind FROM p_work_comment c WHERE c.file_id = f.id AND c.kind IN ('approval', 'change_request', 'reopen') ORDER BY c.created_at DESC LIMIT 1) AS call
    FROM p_br_batch b JOIN p_work_file f ON f.batch_id = b.id AND f.kind = 'version' AND f.deleted_at IS NULL
    WHERE b.act_id = ?1 AND CAST(b.num AS INTEGER) IN (${ph}) ORDER BY CAST(b.num AS INTEGER), f.ad, f.version`).bind(brand.act_id, ...nums.map(Number)).all().catch(() => ({ results: [] }))).results || [];
  const pics = files.filter(f => /^image\//.test(f.mime || ''));
  if (!pics.length) return { error: `No image versions on the Production board for test${nums.length > 1 ? 's' : ''} ${nums.join(', ')} (${brand.name}).` };
  if (pics.length > 50) return { error: `${pics.length} board files; name fewer tests.` };

  /* One look at everything: board files first, then the live ads. */
  const content = [{ type: 'text', text: `You match live Meta ads to the design files on our Production board. Each board file is one VERSION of one ad (V1, V2...); versions of the same ad look alike and differ in details (a headline, a line of copy, a colour, a crop, a product shot, a sticker): compare the words on the image letter by letter and the layout before deciding. A Meta ad may be cropped or resized compared with the file. Every Meta ad matches at most one board file.` }];
  for (const [i, f] of pics.entries()) {
    const p = await smallPic(env, f.id).catch(() => null);
    content.push({ type: 'text', text: `Board file P${i + 1}: test ${f.num} "${clip(f.title, 60)}", ad ${f.ad}, V${f.version}, file "${clip(f.name, 60)}"` });
    if (p) content.push({ type: 'image', source: { type: 'base64', media_type: p.mime, data: b64(p.bytes) } });
    else content.push({ type: 'text', text: '(picture unavailable)' });
  }
  let shown = 0;
  for (const [i, a] of ads.entries()) {
    content.push({ type: 'text', text: `Meta ad M${i + 1}: "${clip(a.name, 60)}" in "${clip(a.adset, 60)}"${a.image_name ? `, uploaded as "${clip(a.image_name, 60)}"` : ''}` });
    const p = a.img ? await shrink(env, d, a.img).catch(() => null) : null;
    if (p) { shown++; content.push({ type: 'image', source: { type: 'base64', media_type: p.mime, data: b64(p.bytes) } }); }
    else content.push({ type: 'text', text: '(no picture: a video or carousel ad)' });
  }
  content.push({ type: 'text', text: `Reply with ONLY a JSON array, one entry per Meta ad: [{"meta":"M1","file":"P3","sure":"high|medium|low","why":"the detail that decided it, a few words"}]. file null when none fits.` });
  const res = await d.xfetch('https://api.anthropic.com/v1/messages', { method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: VISION_MODEL, max_tokens: 4000, messages: [{ role: 'user', content }] }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { error: `The image check failed: ${j?.error?.message || res.status}` };
  const u = j.usage || {};
  const cost = ((u.input_tokens || 0) * 4 + (u.output_tokens || 0) * 20) / 1e6;
  const txt = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  let pairs = [];
  try { pairs = JSON.parse((txt.match(/\[[\s\S]*\]/) || ['[]'])[0]); } catch { pairs = []; }
  const out = verdicts(ads, pics, pairs);
  /* Two ads on one design: a file uploaded twice and another design never uploaded. */
  const byFile = {};
  for (const v of out) if (v.matched) (byFile[v.matched] = byFile[v.matched] || []).push(v.ad_name);
  for (const [f, names] of Object.entries(byFile)) if (names.length > 1) dupes.push(`${names.join(' and ')} both look like ${f}`);
  /* Upload order as a second witness: in one ad set, a V1 is normally uploaded before its V2. */
  for (const v of out) {
    const twin = out.find(o => o !== v && o.ad_set === v.ad_set && o.matched && v.matched && o.matched.split(', V')[0] === v.matched.split(', V')[0]);
    if (!twin) continue;
    const a = new Date(v.created).getTime(), b = new Date(twin.created).getTime();
    v.upload_order = a === b ? 'uploaded together with its twin' : a < b ? 'uploaded before its twin' : 'uploaded after its twin';
  }
  return { cost, result: { brand: brand.name, ads: out.length, pictures_compared: `${pics.length} board files, ${shown} ad images`, pause: out.filter(v => v.call === 'pause').map(v => ({ id: v.ad_id, name: v.ad_name, why: v.why })),
    unsure: out.filter(v => v.call === 'unsure').map(v => v.ad_name), duplicates: dupes,
    board_files_not_in_meta: pics.filter((f, i) => !pairs.some(p => p.file === 'P' + (i + 1))).map(f => `test ${f.num}, ad ${f.ad}, V${f.version}${f.call === 'approval' ? ' (approved)' : ''}`),
    detail: out,
    next: 'Send one meta_pause per ad in "pause" (same turn, so they go out as one approval). Mention unsure ones and duplicates in one line each.' } };
}

/* ---------------- the tools ---------------- */
export function dataTools(d) {
  const t = (def, run) => ({ def, run });
  return [
    t({ name: 'store_sql', description: STORE_SQL_DOC,
      input_schema: { type: 'object', properties: {
        brand: { type: 'string', description: 'Brand name; default this channel\'s brand.' },
        sql: { type: 'string', description: 'One ClickHouse SELECT using @startDate and @endDate.' },
        from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['sql', 'from', 'to'] } },
      async (env, input, ctx) => {
        const s = await twShopOf(env, d, input.brand, ctx);
        if (s.error) return { is_error: true, text: s.error };
        const from = /^\d{4}-\d{2}-\d{2}$/.test(input.from || '') ? input.from : ymd(new Date(Date.now() - 90 * 864e5));
        const to = /^\d{4}-\d{2}-\d{2}$/.test(input.to || '') ? input.to : ymd(new Date());
        const sql = /@startDate/.test(input.sql) ? input.sql : input.sql;
        const r = await twSql(env, d, { shop: s.shop, sql, from, to });
        if (r.error) return { is_error: true, text: r.error };
        const rows = Array.isArray(r.rows) ? r.rows : [r.rows];
        const txt = JSON.stringify({ brand: s.brand.name, shop: s.shop, from, to, source: 'Triple Whale warehouse', rowCount: rows.length, rows: rows.slice(0, 300) });
        return { text: txt.length > 24000 ? txt.slice(0, 24000) + '... (trimmed: GROUP BY more)' : txt };
      }),
    t({ name: 'web_lookup', description: 'Search the web or read a page WITHOUT the built-in web_search / web_fetch (use it when those say the limit is reached, or a page will not open). Give query to search (returns titles, links, snippets) or url to read a page as text. Keep going until you have the answer; never stop at "the search ran out".',
      input_schema: { type: 'object', properties: { query: { type: 'string' }, url: { type: 'string' } } } },
      async (env, input) => {
        if (input.url) { const r = await webRead(d, String(input.url)); return r.error ? { is_error: true, text: r.error } : { text: `${r.url}\n\n${clip(r.text, 18000)}` }; }
        if (!input.query) return { is_error: true, text: 'Give query or url.' };
        const hits = await webSearch(d, String(input.query));
        return hits.length ? { text: JSON.stringify(hits) } : { is_error: true, text: 'No results came back; try other words, or read a page you know by url.' };
      }),
    t({ name: 'make_canvas', description: 'Make a Slack canvas (a shareable doc in Slack) with the FULL write-up when the person will forward it to a partner or client: an offer analysis, a plan, a review. Markdown: # headings, **bold**, bullets, | tables |. Returns the link; put it in your message, and keep the message itself to the short read.',
      input_schema: { type: 'object', properties: { title: { type: 'string' }, markdown: { type: 'string' } }, required: ['title', 'markdown'] } },
      async (env, input, ctx) => {
        if (ctx?.surface !== 'slack') return { is_error: true, text: 'Canvases are made from Slack. Here, use make_report.' };
        const r = await makeCanvas(env, d, ctx, input);
        return r.error ? { is_error: true, text: r.error } : { text: `Canvas made: ${r.link || r.id}. Link it in your message as <${r.link}|${clip(input.title, 60)}>.` };
      }),
    t({ name: 'match_ads_to_board', description: 'Which live Meta ad is which design on the Locus Production board (test, ad, V1/V2, approved or not), by LOOKING at the Meta ad images and the board files side by side, with upload order as a second check. Use it whenever someone asks to turn off old versions (V1s), to keep only what is approved, to check the right files went live, or "cross reference Frame / the board with Meta". It returns which ads to pause; then send the meta_pause cards yourself. Never ask a person to sort pairs by eye.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string' },
        adsets: { type: 'string', description: 'Words in the ad set names, comma separated (e.g. "03, 04, 05"), or ids.' },
        campaign: { type: 'string', description: 'Words in the campaign name, or its id.' },
        tests: { type: 'array', items: { type: 'string' }, description: 'Production board test numbers; default read from the ad set names.' },
        status: { type: 'string', enum: ['live', 'all'] } } } },
      async (env, input, ctx) => {
        const r = await matchAds(env, d, input, ctx);
        if (r.error) return { is_error: true, text: r.error };
        return { text: JSON.stringify(r.result).slice(0, 24000), cost: r.cost };
      }),
  ];
}
export const DATA_STEP_LABELS = {
  store_sql: () => 'Reading orders in Triple Whale',
  web_lookup: i => i.url ? `Reading ${clip(i.url, 60)}` : `Searching the web for "${clip(i.query, 50)}"`,
  make_canvas: i => `Making the canvas "${clip(i.title, 50)}"`,
  match_ads_to_board: () => 'Comparing the live ads with the Production board',
};
