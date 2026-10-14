/**
 * Launch to Meta (2026-10-10): closes the creative loop from Locus.
 *
 *   approved Studio ad (or a creator asset) -> the team's ad name -> an ad set (the test's own, else the
 *   brand's testing ad set, the person can change it) -> created PAUSED -> tied to its test in the test
 *   library (p_br_adtag) -> judged by the media buyer as usual -> the learning filed onto the angle.
 *
 * ONE Meta write path: the ad is made by metawrite.js `meta_create_ad` (propose, then apply), so the brand
 * check, the Manage check (metaCan), the image upload, the creative spec, p_meta_write (undo) and the Change
 * Log line as the person are exactly the Strategist's. This file only prepares the inputs and remembers the
 * launch. It never passes `live`, so every ad is born PAUSED; turning it on is the usual resume (Ads > Meta,
 * or POST /api/meta/write kind resume), which the Launch window offers.
 *
 * Naming (docs/strategist-brain/source-lucky-account-structure.md, "Naming"): our ad = `<number> <letter> | <Format>`
 * ("415 A | Still"), a creator ad = `<number> <letter> | @handle`. The number is the Asana test number and comes
 * first, so the ad links to its test by name (numOf) and the creative format split reads the part after the last |.
 * The letter is the Studio line (line 0 = A) unless that letter is already taken by an ad with the same number,
 * then the next free one.
 *
 * Routes (worker.js mounts handleLaunch in one block; admin + brandsFor, team only):
 *   POST /api/launch/prep     {act, studio_ad | asset}  -> ad sets (suggested first), the name, prefilled fields
 *   POST /api/launch/preview  {act, ..., adset, name, primary_text, headline, description, link, cta}  -> dry run
 *   POST /api/launch/create   same body                  -> the ad, PAUSED; p_launch row; p_br_adtag
 *   GET  /api/launch/list     ?act=&refresh=1            -> launches (refresh = live status from Meta); files learnings
 *   POST /api/launch/batch-prep    {act, card_id, adset?}  -> every approved ad of a Production card with its copy
 *   POST /api/launch/batch-preview {act, card_id, adset, cta, ads: [{file_id, name?, link?}]}  -> a dry run per ad
 *   POST /api/launch/batch-create  same body               -> the ads, PAUSED, one p_launch row each (2026-10-14)
 * Table p_launch is created on first use.
 *
 * The batch (2026-10-14, Cole): every APPROVED ad of a Production card goes to ONE ad set in one go. The copy comes
 * from the BRIEF and only from the brief (`briefCopy`): a Headline / Primary text / Landing page line written once is
 * shared by every ad; the same line under an ad's own heading ("Ad 5-2") is that ad's. An ad whose brief has no
 * headline or primary text is refused until the brief has it (nothing is typed in the window). The Meta name is the
 * name Locus uses for the ad: "5-2 | Still" or "5-2 | Video". Team only: the batch routes are not on the client rules.
 */
import { metaActions, metaCan, gget, gall, gpost, metaActs } from './metawrite.js';
import { fileUrl, ensureWork, adsOf } from './prodwork.js';
import { numOf } from './asana-brand.js';

const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const AH_ORIGIN = 'https://mobius-account-health.mobius-digital.workers.dev';
const MAX_ADS = 6;   // the team's rule: up to 6 ads per test ad set
const CTAS = ['SHOP_NOW', 'LEARN_MORE', 'ORDER_NOW', 'BUY_NOW', 'GET_OFFER', 'SIGN_UP', 'SUBSCRIBE', 'CONTACT_US', 'SEE_MORE', 'NO_BUTTON'];
const clip = (s, n) => String(s ?? '').slice(0, n);
const parse = (v, fb) => { if (v == null) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const VERDICT_WORD = { winner: 'Winner', loser: 'Loser', cancelled: 'Cancelled' };

/* ---------------- the table ---------------- */
export const LAUNCH_SQL = `CREATE TABLE IF NOT EXISTS p_launch (id TEXT PRIMARY KEY, act TEXT NOT NULL, meta_act TEXT, source TEXT NOT NULL,
  studio_ad TEXT, studio_batch TEXT, batch_id TEXT, num TEXT, ad_id TEXT, ad_name TEXT, adset_id TEXT, adset_name TEXT, write_id TEXT,
  status TEXT, eff_status TEXT, checked_at TEXT, by TEXT, at TEXT NOT NULL, verdict TEXT, learning TEXT, filed_at TEXT, work_file TEXT, cta TEXT)`;
let tabled = false;
async function ensure(env) {
  if (tabled) return;
  await env.DB.prepare(LAUNCH_SQL).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_launch_act ON p_launch (act, at)`).run().catch(() => {});
  /* 2026-10-14: a Production file launched (the batch), and the button used (the brand's next launch starts from it) */
  await env.DB.prepare(`ALTER TABLE p_launch ADD COLUMN work_file TEXT`).run().catch(() => {});
  await env.DB.prepare(`ALTER TABLE p_launch ADD COLUMN cta TEXT`).run().catch(() => {});
  tabled = true;
}

/* ---------------- naming ---------------- */
/** Letters already used by ads that start with this number ("415 A | Still", "415-B ...", "415B"). */
export function lettersTaken(names, num) {
  const out = new Set();
  const re = new RegExp(`^\\s*(?:[A-Za-z]{2,4}_)?#?0*${num}\\s*[- ]?\\s*([A-Za-z])(?![A-Za-z])`);
  for (const n of names || []) { const m = re.exec(String(n || '')); if (m) out.add(m[1].toUpperCase()); }
  return out;
}
/** `<num> <letter> | <format>`; no test number = `<headline> | <format>` (and the window warns). */
export function adName({ num, line, format, headline, taken }) {
  const fmt = clip(String(format || 'Still').trim(), 60) || 'Still';
  if (!num) return `${clip(String(headline || 'New ad').trim(), 80)} | ${fmt}`;
  const used = taken || new Set();
  let i = Number.isInteger(+line) && +line >= 0 ? +line % 26 : 0;
  for (let k = 0; k < 26 && used.has(LETTERS[i]); k++) i = (i + 1) % 26;
  return `${num} ${LETTERS[i]} | ${fmt}`;
}
const formatOf = src => src.handle ? '@' + String(src.handle).replace(/^@+/, '').trim() : (src.format || (src.video_id ? 'Video' : 'Still'));

/* ---------------- the source: a Studio ad or a creator asset ---------------- */
async function testFor(env, act, { batchId, num }) {
  if (batchId) {
    const b = await env.DB.prepare(`SELECT id, num, title, angle_id, verdict, learning FROM p_br_batch WHERE id = ?1 AND act_id = ?2`).bind(batchId, act).first().catch(() => null);
    if (b) return b;
  }
  const n = num ? String(parseInt(num, 10)) : null;
  if (!n || n === 'NaN') return null;
  return await env.DB.prepare(`SELECT id, num, title, angle_id, verdict, learning FROM p_br_batch WHERE act_id = ?1 AND num = ?2`).bind(act, n).first().catch(() => null);
}
/* A finished ad from Production (2026-10-14): the version file itself. A picture goes to Meta by its signed link; a video
   is handed to Meta once (advideos with file_url, the id kept on the file) and launches when Meta has processed it. The
   headline and primary text come from the brief's own "Headline" / "Primary text" lines when it has them. */
const lineAfter = (html, label) => {
  const m = new RegExp(`<p><strong>${label}:?</strong></p>\\s*<p>([\\s\\S]*?)</p>`, 'i').exec(String(html || ''));
  return m ? m[1].replace(/<span data-ph>[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim() : '';
};
/* ---------------- the brief's copy: shared lines, and lines under an ad's own heading (2026-10-14) ---------------- */
const COPY_LABELS = { headline: /^headline$/i, primary_text: /^(primary text|post copy|primary)$/i, link: /^(landing page|link|url|landing)$/i, description: /^description$/i };
/* an ad heading: a bold "Ad 5-2" or "5-2." with anything after it on the line, "Ad 5-2 ..." in a heading, or "5-2" alone on the line */
const AD_HEAD = /<(h2|h3|p)>(?:<strong>\s*(?:Ad\s+)?(\d{1,4}\s*-\s*\d{1,3})(?![\d-])\s*[:.]?\s*<\/strong>[\s\S]*?|(?:<strong>)?\s*(?:Ad\s+)?(\d{1,4}\s*-\s*\d{1,3})(?![\d-])\s*[:.]?\s*(?:<\/strong>)?\s*|\s*Ad\s+(\d{1,4}\s*-\s*\d{1,3})(?![\d-])[\s\S]*?)<\/\1>/gi;
/** Words under ONE label that carry every ad in turn ("5-1 The chain he'd never buy himself · 5-2 Your whole list" or
 *  one "5-2: ..." paragraph per ad): split per ad. Only when the words START with an ad number. */
function splitByAd(text) {
  const re = /(^|\n|\s·\s|\s\|\s|;\s*)(\d{1,4}-\d{1,3})(?![\d-])\s*[:.|]?\s*/g;
  const marks = [];
  let m;
  while ((m = re.exec(text || ''))) marks.push({ ad: m[2], start: m.index, end: m.index + m[0].length });
  if (!marks.length || marks[0].start !== 0) return null;
  const out = {};
  marks.forEach((k, i) => { const v = String(text).slice(k.end, marks[i + 1] ? marks[i + 1].start : undefined).trim(); if (v) out[k.ad] = v; });
  return Object.keys(out).length ? out : null;
}
const urlIn = s => (/(https?:\/\/\S+)/.exec(String(s || '')) || [])[1] || String(s || '').trim();
const wordsOf = s => String(s || '').replace(/<span data-ph>[\s\S]*?<\/span>/g, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\u200b/g, '').replace(/[ \t]+\n/g, '\n').trim();
/* a link line as words with every anchor replaced by its address ("5-1 <a href=U>10mm Cuban</a>" reads "5-1 U") */
const linkWords = h => wordsOf(String(h || '').replace(/<a [^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/gi, (m, u) => ` ${u.replace(/&amp;/g, '&')} `)).replace(/[ \t]{2,}/g, ' ');
/** The labelled lines in one stretch of the page: `<p><strong>Label</strong></p><p>words</p>` (what saveCard stores), the
 *  inline `<p><strong>Label:</strong> words</p>`, and words that run on over the next paragraphs until a label, a heading
 *  or a blank line. A hint (`<span data-ph>`) is not words. */
function labelsIn(html) {
  const out = {};
  const re = /<p><strong>([^<]{1,60}?):?\s*<\/strong>:?\s*((?:(?!<\/p>)[\s\S])*)<\/p>/g;
  let m;
  while ((m = re.exec(html))) {
    const key = Object.keys(COPY_LABELS).find(k => COPY_LABELS[k].test(m[1].trim()));
    if (!key) continue;
    const parts = [];
    const inline = m[2].replace(/^(\s|&nbsp;| )+/, '');
    if (wordsOf(inline)) parts.push(inline);
    let rest = html.slice(m.index + m[0].length);
    const next = /^\s*<p>((?:(?!<\/p>)[\s\S])*)<\/p>/;
    let q;
    while ((q = next.exec(rest))) {
      if (/^\s*<strong>/.test(q[1])) break;
      rest = rest.slice(q[0].length);
      if (wordsOf(q[1])) parts.push(q[1]);
      else if (parts.length) break;
    }
    if (!parts.length) continue;
    if (key === 'link') { const lw = linkWords(parts.join('<br>')); out.link = splitByAd(lw) ? lw : urlIn(lw); continue; }
    out[key] = wordsOf(parts.join('<br>'));
  }
  return out;
}
/** {shared: {headline, primary_text, link, description}, ads: {'5-2': {...}}}: a label under an ad's heading belongs to
 *  that ad (until the next ad heading or the next section heading); every other label is shared by the whole test. */
export function briefCopy(html) {
  const s = String(html || '');
  const heads = [];
  AD_HEAD.lastIndex = 0;
  let m;
  while ((m = AD_HEAD.exec(s))) heads.push({ ad: (m[2] || m[3] || m[4]).replace(/\s+/g, ''), start: m.index, end: m.index + m[0].length });
  const ads = {};
  let shared = '', cursor = 0;
  heads.forEach((h, i) => {
    shared += s.slice(cursor, h.start);
    const nextHead = heads[i + 1] ? heads[i + 1].start : s.length;
    const cut = s.slice(h.end, nextHead).search(/<h[23]>/i);
    const stop = cut >= 0 ? h.end + cut : nextHead;
    const found = labelsIn(s.slice(h.end, stop));
    if (Object.keys(found).length) ads[h.ad] = { ...(ads[h.ad] || {}), ...found };
    cursor = stop;
  });
  shared += s.slice(cursor);
  const sh = labelsIn(shared);
  /* a shared label that lists every ad in turn is really one line per ad; a line under the ad's own heading still wins */
  for (const k of Object.keys(sh)) {
    const by = splitByAd(sh[k]);
    if (!by) continue;
    for (const ad of Object.keys(by)) ads[ad] = { [k]: k === 'link' ? urlIn(by[ad]) : by[ad], ...(ads[ad] || {}) };
    delete sh[k];
  }
  return { shared: sh, ads };
}

async function workFileSource(env, d, act, fid) {
  await ensureWork(env);
  await env.DB.prepare(`ALTER TABLE p_work_file ADD COLUMN meta_video_id TEXT`).run().catch(() => {});
  const f = await env.DB.prepare(`SELECT * FROM p_work_file WHERE id = ?1 AND kind = 'version' AND deleted_at IS NULL`).bind(String(fid)).first().catch(() => null);
  if (!f || f.act_id !== act) return { error: 'That file is not one of this brand\'s ads.' };
  const test = await env.DB.prepare(`SELECT id, num, title, angle_id, verdict, learning, brief_json FROM p_br_batch WHERE id = ?1 AND act_id = ?2`).bind(f.batch_id, act).first().catch(() => null);
  const html = (() => { try { return JSON.parse(test?.brief_json || '{}').html || ''; } catch { return ''; } })();
  const line = Math.max(0, (parseInt(String(f.ad || '').split('-')[1], 10) || 1) - 1);
  const bc = briefCopy(html), own = bc.ads[String(f.ad || '')] || {};
  const base = { kind: 'asset', studio_ad: null, studio_batch: null, line, handle: null, num: test?.num ? String(parseInt(test.num, 10)) : null, test,
    headline: own.headline || bc.shared.headline || lineAfter(html, 'Headline'), primary_text: own.primary_text || bc.shared.primary_text || lineAfter(html, 'Primary text'),
    product: null, link: own.link || bc.shared.link || null, work_file: f.id, ad: f.ad || '' };
  if (!/^video\//.test(f.mime || '')) return { ...base, format: 'Still', image_url: await fileUrl(env, AH_ORIGIN, f.id, 48), video_id: null };
  let vid = f.meta_video_id;
  if (!vid) {
    const meta = (await metaActs(env, act))[0];
    if (!meta) return { error: 'This brand has no Meta ad account connected in Locus.' };
    try {
      const r = await gpost(d, env, `${meta.act}/advideos`, { file_url: await fileUrl(env, AH_ORIGIN, f.id, 6), name: String(f.name || `${base.num || ''} ${f.ad || ''}`).slice(0, 100) });
      vid = r && r.id ? String(r.id) : null;
    } catch (e) { return { error: `Meta did not take the video: ${e.message}` }; }
    if (!vid) return { error: 'Meta did not return a video id. Try again.' };
    await env.DB.prepare(`UPDATE p_work_file SET meta_video_id = ?2 WHERE id = ?1`).bind(f.id, vid).run().catch(() => {});
  }
  return { ...base, format: 'Video', image_url: null, video_id: vid };
}
async function sourceOf(env, act, b, d) {
  if (b.work_file) return workFileSource(env, d, act, b.work_file);
  if (b.studio_ad) {
    const row = await env.DB.prepare(`SELECT * FROM p_studio_ad WHERE id = ?1`).bind(String(b.studio_ad)).first().catch(() => null);
    if (!row || row.act_id !== act) return { error: 'That Studio ad is not this brand\'s.' };
    if (row.status !== 'approved') return { error: 'Approve the ad in Studio first. Only approved ads go to Meta.' };
    const sb = row.batch_id ? await env.DB.prepare(`SELECT * FROM p_studio_batch WHERE id = ?1`).bind(row.batch_id).first().catch(() => null) : null;
    const spec = parse(row.spec_json, {}), brief = parse(sb?.brief_json, {}), setup = parse(sb?.setup_json, {});
    const test = await testFor(env, act, { batchId: sb?.br_batch_id, num: sb?.num });
    return { kind: 'studio', studio_ad: row.id, studio_batch: sb?.id || null, image_url: `${PROFIT_ORIGIN}/api/studio/img/${row.id}/${row.has_final ? 'final' : 'full'}`,
      line: row.line ?? 0, format: 'Still', num: test?.num || (sb?.num ? String(parseInt(sb.num, 10)) : null), test,
      headline: spec.headline || '', primary_text: brief.post_copy || '', handle: null, product: (setup.products || [])[0]?.handle || null };
  }
  const a = b.asset || {};
  if (!a.image_url === !a.video_id) return { error: 'Give the asset as an image link or a Meta video id.' };
  const test = await testFor(env, act, { batchId: a.batch_id, num: a.num });
  return { kind: a.handle ? 'creator' : 'asset', studio_ad: null, studio_batch: null, image_url: a.image_url || null, video_id: a.video_id ? String(a.video_id) : null,
    line: Number.isInteger(+a.line) ? +a.line : 0, format: a.format || null, handle: a.handle || null, num: test?.num || (a.num ? String(parseInt(a.num, 10)) : null), test,
    headline: a.headline || '', primary_text: a.primary_text || '', product: a.product || null, link: a.link || null };
}

/* ---------------- ad sets: suggest the right one ---------------- */
const LIVEISH = ['ACTIVE', 'PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED', 'IN_PROCESS', 'WITH_ISSUES', 'PENDING_REVIEW', 'PREAPPROVED'];
async function adsetsOf(env, d, act) {
  const metas = await metaActs(env, act);
  const out = [];
  for (const m of metas) {
    const rows = await gall(d, env, `${m.act}/adsets`, { fields: 'id,name,status,effective_status,created_time,campaign{id,name}',
      filtering: [{ field: 'effective_status', operator: 'IN', value: LIVEISH }], limit: '200' }, 2).catch(() => []);
    for (const r of rows) out.push({ id: r.id, name: r.name, status: r.effective_status || r.status, created: r.created_time || '', campaign: r.campaign?.name || '', meta_act: m.act, num: numOf(r.name) });
  }
  return { metas, sets: out };
}
/** The test's own ad set (its number starts the name). Else, by where the ad comes from (2026-10-10, first live open on
 *  Lucky suggested a Trybe creator ad set for a Studio static): a Studio ad goes to the newest live NUMBERED test ad set
 *  outside creator / partnership campaigns (the account's own test structure), a creator asset to the newest live set in
 *  a creator campaign. Then a campaign named "test", then the newest live set. */
const CREATOR = /creator|partnership|trybe|ambassador|influencer|ugc creator/i;
export function suggest(sets, num, kind = 'studio', losers = new Set()) {
  const newest = (a, b) => String(b.created).localeCompare(String(a.created));
  const own = num ? sets.filter(s => s.num === String(num)).sort((a, b) => (a.status === 'ACTIVE' ? -1 : 0) - (b.status === 'ACTIVE' ? -1 : 0) || newest(a, b)) : [];
  if (own.length) return { id: own[0].id, why: `This test's own ad set (its name starts with ${num}).` };
  const live = sets.filter(s => s.status === 'ACTIVE');
  const isCreator = s => CREATOR.test(s.campaign || '') || CREATOR.test(s.name || '');
  const copyTip = num ? ` No ad set starts with ${num} yet: to give test ${num} its own, copy this one first (Ads > Meta > Campaigns, the row's menu, Copy this ad set) and pick the copy.` : '';
  if (kind === 'creator') {
    const cr = live.filter(isCreator).sort(newest);
    if (cr.length) return { id: cr[0].id, why: `The newest live ad set in the creator campaign "${cr[0].campaign}".${num ? ` No ad set starts with ${num} yet.` : ''}` };
  } else {
    /* A test the buyer (or Asana) already called a loser is being wound down: never the home for a new ad. */
    const tests = live.filter(s => s.num && !isCreator(s) && !losers.has(String(s.num))).sort((a, b) => (+b.num || 0) - (+a.num || 0) || newest(a, b));
    if (tests.length) return { id: tests[0].id, why: `The newest live test ad set ("${tests[0].name}" in "${tests[0].campaign}").${copyTip}` };
  }
  const testing = live.filter(s => /test/i.test(s.campaign) && (kind === 'creator' || !isCreator(s))).sort(newest);
  if (testing.length) return { id: testing[0].id, why: `The newest live ad set in the testing campaign "${testing[0].campaign}".${num ? ` No ad set starts with ${num} yet.` : ''}` };
  const pool = (kind === 'creator' ? live : live.filter(s => !isCreator(s))).sort(newest);
  const any = (pool.length ? pool : [...live].sort(newest));
  if (any.length) return { id: any[0].id, why: `The newest live ad set. No testing campaign found${num ? ` and no ad set starts with ${num}` : ''}, so check this one.` };
  return { id: sets[0]?.id || null, why: sets.length ? 'Nothing is live, so this is only the newest ad set. Check it.' : 'No ad sets found in the Meta account.' };
}
async function namesIn(env, d, metaAct, num) {
  if (!num) return [];
  const rows = await gall(d, env, `${metaAct}/ads`, { fields: 'id,name', filtering: [{ field: 'ad.name', operator: 'CONTAIN', value: String(num) }], limit: '100' }, 1).catch(() => []);
  return rows.map(r => r.name);
}
async function takenFor(env, d, metaAct, num) {
  await ensure(env);
  const mine = num ? ((await env.DB.prepare(`SELECT ad_name FROM p_launch WHERE meta_act = ?1 AND num = ?2`).bind(metaAct, String(num)).all()).results || []).map(r => r.ad_name) : [];
  return lettersTaken([...(await namesIn(env, d, metaAct, num)), ...mine], num);
}
/** Landing page and post copy the ad set's own ads already use: the best prefill for a new ad in it. */
async function setCopy(env, d, adsetId) {
  const r = await gget(d, env, `${adsetId}/ads`, { fields: 'name,creative{object_story_spec}', limit: '5' }).catch(() => ({ data: [] }));
  const out = { link: null, primary_text: null, names: [], count: 0 };
  for (const a of r.data || []) {
    out.names.push(a.name); out.count++;
    const s = a.creative?.object_story_spec || {};
    const l = s.link_data?.link || s.video_data?.call_to_action?.value?.link;
    if (l && !out.link) out.link = l;
    const m = s.link_data?.message || s.video_data?.message;
    if (m && !out.primary_text) out.primary_text = m;
  }
  return out;
}
const productLink = (link, handle) => { if (!handle || !link) return link; try { return `${new URL(link).origin}/products/${handle}`; } catch { return link; } };

/* ---------------- prep, preview, create ---------------- */
async function losersOf(env, act) {
  return new Set(((await env.DB.prepare(`SELECT num FROM p_br_batch WHERE act_id = ?1 AND (lower(COALESCE(verdict, '')) = 'loser' OR lower(COALESCE(asana_result, '')) LIKE '%loser%')`).bind(act).all()
    .catch(() => env.DB.prepare(`SELECT num FROM p_br_batch WHERE act_id = ?1 AND lower(COALESCE(verdict, '')) = 'loser'`).bind(act).all()).catch(() => ({ results: [] }))).results || []).map(r => String(r.num)));
}
export async function launchPrep(env, d, act, b) {
  const src = await sourceOf(env, act, b, d); if (src.error) return src;
  const { metas, sets } = await adsetsOf(env, d, act);
  if (!metas.length) return { error: 'This brand has no Meta ad account connected in Locus.' };
  const can = await metaCan(env, metas[0].act, d, metas[0].name);
  const losers = await losersOf(env, act);
  const sug = suggest(sets, src.num, src.kind === 'creator' ? 'creator' : 'studio', losers);
  const pick = sets.find(s => s.id === sug.id) || null;
  const copy = pick ? await setCopy(env, d, pick.id) : { link: null, primary_text: null, names: [], count: 0 };
  const taken = pick ? await takenFor(env, d, pick.meta_act, src.num) : new Set();
  await ensure(env);
  const before = src.studio_ad ? ((await env.DB.prepare(`SELECT id, ad_id, ad_name, adset_name, status, eff_status, at FROM p_launch WHERE studio_ad = ?1 ORDER BY at DESC`).bind(src.studio_ad).all()).results || []) : [];
  const warnings = [];
  if (!src.num) warnings.push('This ad has no test number, so Locus cannot tie it to a test by its name. Pick the batch from Asana in Studio, or tag it by hand in the test library later.');
  else if (!src.test) warnings.push(`Test ${src.num} is not in the test library yet. It still gets the number in its name; the Asana sync files it.`);
  if (before.length) warnings.push(`Already launched ${before.length === 1 ? 'once' : before.length + ' times'}: "${before[0].ad_name}" in "${before[0].adset_name}".`);
  if (!can.can) warnings.push(can.fix);
  return {
    ok: true, can: can.can,
    source: { kind: src.kind, studio_ad: src.studio_ad, image_url: src.image_url, video_id: src.video_id || null, handle: src.handle },
    test: src.test ? { id: src.test.id, num: src.test.num, title: src.test.title, verdict: src.test.verdict || null } : (src.num ? { id: null, num: src.num, title: null } : null),
    adsets: [...sets].sort((x, y) => (x.id === sug.id ? -1 : y.id === sug.id ? 1 : 0) || (x.status === 'ACTIVE' ? -1 : 0) - (y.status === 'ACTIVE' ? -1 : 0) || String(y.created).localeCompare(String(x.created))).slice(0, 60),
    suggested: sug.id, why: sug.why,
    name: src.work_file && src.ad ? `${src.ad} | ${formatOf(src)}` : adName({ num: src.num, line: src.line, format: formatOf(src), headline: src.headline, taken }),
    fields: { primary_text: src.primary_text || copy.primary_text || '', headline: clip(src.headline, 255), description: '', link: src.link || productLink(copy.link, src.product) || '', cta: 'SHOP_NOW' },
    launched: before, warnings,
  };
}
/** Same inputs to meta_create_ad for the dry run and the write. Never `live`: every launch is born PAUSED. */
function createInput(act, src, b) {
  return { brand: act, adset: String(b.adset || ''), ...(src.video_id ? { video_id: src.video_id } : { image_url: src.image_url }),
    headline: clip(b.headline, 255), primary_text: clip(b.primary_text, 3000), description: clip(b.description, 255),
    link: String(b.link || '').trim(), cta: CTAS.includes(b.cta) ? b.cta : 'SHOP_NOW', ad_name: clip(String(b.name || '').trim(), 300),
    reason: clip(b.reason || `Launched from Locus${src.num ? ` for test ${src.num}` : ''}${src.kind === 'studio' ? ' (Studio ad)' : src.handle ? ` (creator ${formatOf(src)})` : ''}`, 300) };
}
function checkInput(b, src) {
  if (!/^\d{6,}$/.test(String(b.adset || ''))) return 'Pick the ad set.';
  if (!String(b.name || '').trim()) return 'Give the ad a name.';
  if (!String(b.primary_text || '').trim()) return 'Write the primary text (the words above the ad).';
  if (!/^https:\/\//.test(String(b.link || '').trim())) return 'The link must be a full https:// address.';
  if (src.num && numOf(b.name) !== String(src.num)) return `The name must start with the test number ${src.num}, or Locus cannot tie the ad to its test.`;
  return null;
}
async function proposeFor(env, d, act, b, ctx) {
  const src = await sourceOf(env, act, b, d); if (src.error) return { error: src.error };
  const bad = checkInput(b, src); if (bad) return { error: bad };
  const action = metaActions(d).find(a => a.name === 'meta_create_ad');
  const c = { ...ctx, via: 'locus', screen: { act_id: act } };
  const p = await action.propose(env, createInput(act, src, b), null, c);
  return { src, action, c, p };
}
export async function launchPreview(env, d, act, b, ctx) {
  const r = await proposeFor(env, d, act, b, ctx); if (r.error) return { error: r.error };
  if (r.p.error) return { error: r.p.error };
  const set = await setCopy(env, d, r.p.patch.id);
  const warnings = [];
  if (set.count >= MAX_ADS) warnings.push(`"${r.p.patch.name}" already has ${set.count} ads. The team rule is up to ${MAX_ADS} per ad set.`);
  if (set.names.includes(r.p.patch.ad_name)) warnings.push(`An ad called "${r.p.patch.ad_name}" is already in this ad set.`);
  return { ok: true, dry: true, summary: r.p.summary, detail: r.p.detail,
    before: { adset: r.p.patch.name, ads: set.count, names: set.names.slice(0, MAX_ADS) },
    after: { adset: r.p.patch.name, ads: set.count + 1, ad_name: r.p.patch.ad_name, status: r.p.patch.status, headline: r.p.patch.headline, link: r.p.patch.link, cta: r.p.patch.cta, page: r.p.patch.page_id },
    test: r.src.test ? { id: r.src.test.id, num: r.src.test.num, title: r.src.test.title } : null, warnings };
}
export async function launchCreate(env, d, act, b, ctx) {
  const r = await proposeFor(env, d, act, b, ctx); if (r.error) return { error: r.error };
  if (r.p.error) return { error: r.p.error };
  if (r.p.patch.status !== 'PAUSED') return { error: 'Launches are always made paused.' };
  await ensure(env);
  if ((r.src.studio_ad || r.src.work_file) && !b.again) {
    const dup = r.src.studio_ad
      ? await env.DB.prepare(`SELECT ad_name FROM p_launch WHERE studio_ad = ?1 AND adset_id = ?2 AND COALESCE(eff_status, '') NOT IN ('ARCHIVED', 'DELETED')`).bind(r.src.studio_ad, r.p.patch.id).first()
      : await env.DB.prepare(`SELECT ad_name FROM p_launch WHERE work_file = ?1 AND adset_id = ?2 AND COALESCE(eff_status, '') NOT IN ('ARCHIVED', 'DELETED')`).bind(r.src.work_file, r.p.patch.id).first();
    if (dup) return { error: `This ad is already in that ad set as "${dup.ad_name}". Nothing was made.`, duplicate: true };
  }
  const out = await r.action.apply(env, r.p.patch, null, r.c);
  if (out.error) return { error: out.error };
  const adId = out.created || (String(out.note || '').match(/\((\d{6,})\)/) || [])[1] || null;
  const id = 'ln_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const now = new Date().toISOString();
  const who = ctx?.who || 'someone in Locus';
  const test = r.src.test;
  await env.DB.prepare(`INSERT INTO p_launch (id, act, meta_act, source, studio_ad, studio_batch, batch_id, num, ad_id, ad_name, adset_id, adset_name, write_id, status, eff_status, checked_at, by, at, work_file, cta)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'PAUSED', 'PAUSED', ?14, ?15, ?14, ?16, ?17)`)
    .bind(id, act, r.p.patch.act, r.src.kind, r.src.studio_ad, r.src.studio_batch, test?.id || null, r.src.num || null, adId, r.p.patch.ad_name, r.p.patch.id, r.p.patch.name, out.write || null, now, who, r.src.work_file || null, r.p.patch.cta || null).run();
  /* Tie the ad to its test in the test library. The number in the name already does; the tag also wins when someone renames it. */
  if (test?.id && adId) await env.DB.prepare(`INSERT INTO p_br_adtag (act_id, ad_id, batch_id, tagged_by, tagged_at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(act_id, ad_id) DO UPDATE SET batch_id = excluded.batch_id, tagged_by = excluded.tagged_by, tagged_at = excluded.tagged_at`).bind(act, adId, test.id, `${who} (Launch to Meta)`, now).run().catch(() => {});
  return { ok: true, launch: { id, ad_id: adId, ad_name: r.p.patch.ad_name, adset_id: r.p.patch.id, adset_name: r.p.patch.name, status: 'PAUSED', eff_status: 'PAUSED', num: r.src.num || null, batch_id: test?.id || null, write: out.write || null, at: now },
    note: out.note, ads_manager: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${String(r.p.patch.act).replace('act_', '')}&selected_ad_ids=${adId}` };
}

/* ---------------- the batch: every approved ad of a Production card, one ad set, the brief's copy (2026-10-14) ---------------- */
const adsManagerUrl = (metaAct, adId) => `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${String(metaAct || '').replace('act_', '')}&selected_ad_ids=${adId}`;
const fmtOfFile = f => /^video\//.test(f?.mime || '') ? 'Video' : 'Still';
/** Every approved ad of the card with its name, its copy (and where each line came from: shared / ad / set / none),
 *  the ad sets (the test's own first, else the set of the brand's last launch, else the usual suggestion), the button
 *  the brand used last, what was already launched, and warnings. `b.adset` = re-read with that set's link. */
export async function batchPrep(env, d, act, b) {
  await ensureWork(env); await ensure(env);
  const card = await env.DB.prepare(`SELECT id, num, title, angle_id, verdict, brief_json FROM p_br_batch WHERE id = ?1 AND act_id = ?2`).bind(String(b.card_id || ''), act).first().catch(() => null);
  if (!card) return { error: 'That card is not one of this brand\'s.' };
  const files = (await env.DB.prepare(`SELECT id, ad, version, mime, name, created_at, kind FROM p_work_file WHERE batch_id = ?1 AND kind = 'version' AND deleted_at IS NULL`).bind(card.id).all()).results || [];
  const cs = ((await env.DB.prepare(`SELECT file_id, kind, parent_id, fixed_at, author_name AS who, created_at FROM p_work_comment WHERE batch_id = ?1 ORDER BY created_at`).bind(card.id).all()).results || []).map(c => ({ ...c, fixed: !!c.fixed_at }));
  const all = adsOf(files, cs);
  const approved = all.filter(a => a.status === 'approved');
  if (!approved.length) return { error: all.length ? 'No ad on this card is approved yet. Approve them on the Ads tab first.' : 'This card has no finished ads yet.' };
  const num = card.num ? String(parseInt(card.num, 10)) : null;
  const copy = briefCopy(parse(card.brief_json, {})?.html || '');
  const { metas, sets } = await adsetsOf(env, d, act);
  if (!metas.length) return { error: 'This brand has no Meta ad account connected in Locus.' };
  const can = await metaCan(env, metas[0].act, d, metas[0].name);
  const last = await env.DB.prepare(`SELECT adset_id, adset_name, cta FROM p_launch WHERE act = ?1 ORDER BY at DESC LIMIT 1`).bind(act).first().catch(() => null);
  let sug = suggest(sets, num, 'studio', await losersOf(env, act));
  if (!(num && sets.some(s => String(s.num) === num)) && last && sets.some(s => s.id === last.adset_id)) sug = { id: last.adset_id, why: `The ad set of the brand's last launch from Locus ("${last.adset_name}"). Change it if this test has its own.` };
  if (b.adset && sets.some(s => s.id === String(b.adset))) sug = { id: String(b.adset), why: 'Your pick.' };
  const pick = sets.find(s => s.id === sug.id) || null;
  const setc = pick ? await setCopy(env, d, pick.id) : { link: null, primary_text: null, names: [], count: 0 };
  const taken = pick ? await takenFor(env, d, pick.meta_act, num) : new Set();
  const before = (await env.DB.prepare(`SELECT work_file, ad_name, adset_id, adset_name, eff_status, ad_id, meta_act FROM p_launch WHERE batch_id = ?1 AND COALESCE(eff_status, '') NOT IN ('ARCHIVED', 'DELETED') ORDER BY at DESC`).bind(card.id).all().catch(() => ({ results: [] }))).results || [];
  const ads = [];
  for (const a of approved) {
    const f = files.find(x => x.id === a.file_id), fmt = fmtOfFile(f), own = copy.ads[String(a.ad || '')] || {};
    const field = (k, setv, setSrc) => own[k] ? { value: own[k], source: 'ad' } : copy.shared[k] ? { value: copy.shared[k], source: 'shared' } : setv ? { value: setv, source: setSrc } : { value: '', source: 'none' };
    const headline = field('headline'), primary_text = field('primary_text'), link = field('link', setc.link, 'set'), description = field('description');
    const name = a.ad ? `${a.ad} | ${fmt}` : adName({ num, line: ads.length, format: fmt, headline: headline.value, taken });
    const done = before.filter(l => l.work_file === a.file_id || l.ad_name === name);
    ads.push({ file_id: a.file_id, ad: a.ad || '', version: a.version, format: fmt, video: fmt === 'Video', thumb: fmt === 'Video' ? null : `${await fileUrl(env, AH_ORIGIN, a.file_id, 12)}&w=600`,
      name, headline, primary_text, link, description, missing: [headline.value ? null : 'headline', primary_text.value ? null : 'primary_text'].filter(Boolean),
      launched: done.map(l => ({ ad_name: l.ad_name, adset_name: l.adset_name, eff_status: l.eff_status, ads_manager: l.ad_id ? adsManagerUrl(l.meta_act, l.ad_id) : null })) });
  }
  const warnings = [];
  const short = ads.filter(a => a.missing.length);
  if (!num) warnings.push('This card has no test number, so Locus cannot tie these ads to a test by their names.');
  if (short.length) warnings.push(`${short.length === ads.length ? 'No ad' : short.length + ' of ' + ads.length + ' ads'} ${short.length === 1 ? 'has' : 'have'} ${short.length === ads.length ? 'a' : 'its'} headline and primary text in the brief. Write a Headline and a Primary text line in the brief, shared or under the ad's own heading, and open this again.`);
  if (pick && setc.count + ads.length > MAX_ADS) warnings.push(`"${pick.name}" has ${setc.count} ad${setc.count === 1 ? '' : 's'}; adding ${ads.length} makes ${setc.count + ads.length}. The team rule is up to ${MAX_ADS} per ad set.`);
  if (!can.can) warnings.push(can.fix);
  return {
    ok: true, can: can.can, card: { id: card.id, num, title: card.title },
    test: num ? { id: card.id, num, title: card.title, verdict: card.verdict || null } : null,
    adsets: [...sets].sort((x, y) => (x.id === sug.id ? -1 : y.id === sug.id ? 1 : 0) || (x.status === 'ACTIVE' ? -1 : 0) - (y.status === 'ACTIVE' ? -1 : 0) || String(y.created).localeCompare(String(x.created))).slice(0, 60),
    suggested: sug.id, why: sug.why, cta: CTAS.includes(last?.cta) ? last.cta : 'SHOP_NOW',
    set: pick ? { id: pick.id, name: pick.name, count: setc.count, names: setc.names.slice(0, MAX_ADS), link: setc.link } : null,
    ads, warnings,
  };
}
/** The rows a batch preview or create works on: the picked ads with the BRIEF's copy (never words sent by the browser),
 *  the sent name and link where given. Refuses the whole batch when a picked ad has no headline or primary text. */
async function batchRows(env, d, act, b) {
  if (!/^\d{6,}$/.test(String(b.adset || ''))) return { error: 'Pick the ad set.' };
  const sent = Array.isArray(b.ads) ? b.ads.filter(x => x && /^[a-f0-9]{16}$/.test(String(x.file_id || ''))) : [];
  if (!sent.length) return { error: 'Pick at least one ad.' };
  if (sent.length > 12) return { error: 'Up to 12 ads in one go.' };
  const p = await batchPrep(env, d, act, { card_id: b.card_id, adset: b.adset }); if (p.error) return p;
  const rows = [], short = [];
  for (const x of sent) {
    const a = p.ads.find(y => y.file_id === x.file_id);
    if (!a) return { error: 'One of the picked ads is not an approved ad of this card.' };
    if (a.missing.length) { short.push(`${a.ad ? 'Ad ' + a.ad : a.name}: no ${a.missing.map(k => k === 'headline' ? 'headline' : 'primary text').join(' or ')}`); continue; }
    rows.push({ work_file: a.file_id, ad: a.ad, adset: String(b.adset), cta: CTAS.includes(b.cta) ? b.cta : p.cta, name: clip(String(x.name || a.name).trim(), 300) || a.name,
      headline: a.headline.value, primary_text: a.primary_text.value, description: a.description.value, link: String(x.link || a.link.value || '').trim(), again: b.again === true });
  }
  if (short.length) return { error: `The brief is missing copy. ${short.join('; ')}. Write it in the brief first; nothing was made.`, short };
  return { rows, prep: p };
}
/** A dry run per ad (nothing written): the ad set before, the names after, each ad's summary or the reason it would fail. */
export async function batchPreview(env, d, act, b, ctx) {
  const r = await batchRows(env, d, act, b); if (r.error) return r;
  const out = [];
  let setName = r.prep.set?.name || '';
  for (const row of r.rows) {
    const p = await proposeFor(env, d, act, row, ctx);
    if (p.error || p.p.error) { out.push({ file_id: row.work_file, ad: row.ad, name: row.name, error: p.error || p.p.error }); continue; }
    setName = p.p.patch.name || setName;
    out.push({ file_id: row.work_file, ad: row.ad, ok: true, name: p.p.patch.ad_name, headline: p.p.patch.headline, link: p.p.patch.link, cta: p.p.patch.cta, summary: p.p.summary });
  }
  const set = await setCopy(env, d, String(b.adset));
  const warnings = [];
  const okRows = out.filter(x => x.ok);
  if (set.count + okRows.length > MAX_ADS) warnings.push(`"${setName}" would hold ${set.count + okRows.length} ads. The team rule is up to ${MAX_ADS} per ad set.`);
  for (const x of okRows) if (set.names.includes(x.name)) warnings.push(`An ad called "${x.name}" is already in this ad set.`);
  return { ok: true, dry: true, adset: setName, before: { adset: setName, ads: set.count, names: set.names.slice(0, MAX_ADS) }, after: { adset: setName, ads: set.count + okRows.length, names: okRows.map(x => x.name) }, rows: out, warnings };
}
/** The ads, one after the other, each through launchCreate (PAUSED, p_launch, p_br_adtag). One failing ad does not stop
 *  the rest: every row answers with its launch or its reason. */
export async function batchCreate(env, d, act, b, ctx) {
  const r = await batchRows(env, d, act, b); if (r.error) return r;
  const out = [];
  for (const row of r.rows) {
    const c = await launchCreate(env, d, act, row, ctx);
    out.push(c.error ? { file_id: row.work_file, ad: row.ad, name: row.name, error: c.error, duplicate: !!c.duplicate } : { file_id: row.work_file, ad: row.ad, name: c.launch.ad_name, ok: true, launch: c.launch, ads_manager: c.ads_manager });
  }
  const made = out.filter(x => x.ok).length;
  return { ok: true, made, failed: out.length - made, adset: out.find(x => x.ok)?.launch.adset_name || r.prep.set?.name || '', rows: out };
}

/* ---------------- the list: live status, and judged -> learning filed ---------------- */
/** A launched ad's test got the buyer's verdict: copy it onto the launch and add one line to the angle's note
 *  ("#415 Winner: <learning>"), once per test. Only winner / loser / cancelled count; "keep running" is not a call. */
export async function fileLearnings(env, act) {
  await ensure(env);
  /* A launch made before its test reached the library (the Asana sync files it later) links up by its number. */
  await env.DB.prepare(`UPDATE p_launch SET batch_id = (SELECT b.id FROM p_br_batch b WHERE b.act_id = p_launch.act AND b.num = p_launch.num)
    WHERE act = ?1 AND batch_id IS NULL AND num IS NOT NULL`).bind(act).run().catch(() => {});
  const rows = ((await env.DB.prepare(`SELECT l.id, l.batch_id, b.num, b.verdict, b.learning, b.angle_id FROM p_launch l JOIN p_br_batch b ON b.id = l.batch_id
    WHERE l.act = ?1 AND l.filed_at IS NULL AND b.verdict IN ('winner', 'loser', 'cancelled')`).bind(act).all().catch(() => ({ results: [] }))).results || []);
  const now = new Date().toISOString(), seen = new Set();
  let filed = 0;
  for (const r of rows) {
    await env.DB.prepare(`UPDATE p_launch SET verdict = ?2, learning = ?3, filed_at = ?4 WHERE id = ?1`).bind(r.id, r.verdict, r.learning || null, now).run();
    filed++;
    if (seen.has(r.batch_id) || !r.angle_id || !String(r.learning || '').trim()) continue;
    seen.add(r.batch_id);
    const a = await env.DB.prepare(`SELECT note FROM p_br_angle WHERE id = ?1`).bind(r.angle_id).first().catch(() => null);
    if (!a) continue;
    const tag = `#${r.num} `;
    if (String(a.note || '').split('\n').some(l => l.startsWith(tag))) continue;
    const note = clip(`${a.note ? a.note.trimEnd() + '\n' : ''}${tag}${VERDICT_WORD[r.verdict]}: ${String(r.learning).trim()}`, 3000);
    await env.DB.prepare(`UPDATE p_br_angle SET note = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(r.angle_id, note).run().catch(() => {});
  }
  return filed;
}
/** Live status for the newest launches: one ads-edge read per Meta account (`ad.id IN`, 25 at a time). */
async function refreshStatus(env, d, rows) {
  const by = new Map();
  for (const r of rows) if (r.ad_id && r.meta_act && !['ARCHIVED', 'DELETED'].includes(r.eff_status)) (by.get(r.meta_act) || by.set(r.meta_act, []).get(r.meta_act)).push(r);
  const now = new Date().toISOString();
  for (const [metaAct, list] of by) {
    for (let i = 0; i < list.length && i < 50; i += 25) {
      const part = list.slice(i, i + 25);
      const got = await gall(d, env, `${metaAct}/ads`, { fields: 'id,status,effective_status', filtering: [{ field: 'ad.id', operator: 'IN', value: part.map(r => r.ad_id) }], limit: '50' }, 1).catch(() => null);
      if (!got) continue;
      const m = new Map(got.map(a => [String(a.id), a]));
      for (const r of part) {
        const a = m.get(String(r.ad_id));
        const st = a ? a.status : 'DELETED', eff = a ? (a.effective_status || a.status) : 'DELETED';
        r.status = st; r.eff_status = eff; r.checked_at = now;
        await env.DB.prepare(`UPDATE p_launch SET status = ?2, eff_status = ?3, checked_at = ?4 WHERE id = ?1`).bind(r.id, st, eff, now).run();
      }
    }
  }
}
export async function launchList(env, d, act, { refresh = false, only = null } = {}) {
  await ensure(env);
  if (act) await fileLearnings(env, act);
  let rows = act
    ? ((await env.DB.prepare(`SELECT * FROM p_launch WHERE act = ?1 ORDER BY at DESC LIMIT 200`).bind(act).all()).results || [])
    : ((await env.DB.prepare(`SELECT * FROM p_launch ORDER BY at DESC LIMIT 500`).all()).results || []);
  if (only) rows = rows.filter(r => only.has(r.act));
  if (refresh && act) await refreshStatus(env, d, rows.slice(0, 50));
  return { ok: true, launches: rows.map(r => ({ id: r.id, act: r.act, source: r.source, studio_ad: r.studio_ad, batch_id: r.batch_id, num: r.num, ad_id: r.ad_id, ad_name: r.ad_name,
    adset_id: r.adset_id, adset_name: r.adset_name, status: r.status, eff_status: r.eff_status, checked_at: r.checked_at, by: r.by, at: r.at, verdict: r.verdict, learning: r.learning, filed_at: r.filed_at,
    ads_manager: r.ad_id && r.meta_act ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${String(r.meta_act).replace('act_', '')}&selected_ad_ids=${r.ad_id}` : null })) };
}

/* ---------------- routes ---------------- */
/** worker.js: `const r = await handleLaunch(request, env, url, path, json, h); if (r) return r;` with
 *  h = { isAdmin, sessionEmail, brandsFor, resolveBrandId, md } (md = the metawrite helpers object). */
export async function handleLaunch(request, env, url, path, json, h) {
  if (!/^\/api\/launch\//.test(path)) return null;
  if (!(await h.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const email = await h.sessionEmail(env, request).catch(() => null);
  const only = await h.brandsFor(env, email).catch(() => null);
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
  const raw = String((request.method === 'POST' ? body.act : url.searchParams.get('act')) || '');
  const ctx = { who: email || 'someone in Locus' };
  try {
    /* Launches the person can see (all brands when no act): the test library chip and the Studio status. */
    if (path === '/api/launch/list' && request.method === 'GET') {
      if (!raw) return json(await launchList(env, h.md, null, { only }));
      const act = await h.resolveBrandId(env, raw).catch(() => '');
      if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      return json(await launchList(env, h.md, act, { refresh: url.searchParams.get('refresh') === '1' }));
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    const act = await h.resolveBrandId(env, raw).catch(() => '');
    if (!/^[\w-]{3,80}$/.test(act)) return json({ error: 'Pick a brand first.' }, 400);
    if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
    /* Launch to Meta, step 1: ad sets (the right one first), the ad name and the prefilled fields. */
    if (path === '/api/launch/prep' && request.method === 'POST') return json(await launchPrep(env, h.md, act, body));
    /* Launch to Meta, step 2: the dry run (the ad set before and after); nothing is written. */
    if (path === '/api/launch/preview' && request.method === 'POST') return json(await launchPreview(env, h.md, act, body, ctx));
    /* Launch to Meta, step 3: create the ad PAUSED through metawrite meta_create_ad, tie it to its test. */
    if (path === '/api/launch/create' && request.method === 'POST') return json(await launchCreate(env, h.md, act, body, ctx));
    /* The batch (2026-10-14): every approved ad of a Production card into one ad set. Team only (not on the client rules). */
    if (path === '/api/launch/batch-prep' && request.method === 'POST') return json(await batchPrep(env, h.md, act, body));
    if (path === '/api/launch/batch-preview' && request.method === 'POST') return json(await batchPreview(env, h.md, act, body, ctx));
    if (path === '/api/launch/batch-create' && request.method === 'POST') { const r = await batchCreate(env, h.md, act, body, ctx); return json(r, r.error ? 400 : 200); }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 502); }
}

export const _test = { sourceOf, createInput, checkInput, resetTable: () => { tabled = false; } };
