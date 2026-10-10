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
 * Table p_launch is created on first use.
 */
import { metaActions, metaCan, gget, gall, metaActs } from './metawrite.js';
import { numOf } from './asana-brand.js';

const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const MAX_ADS = 6;   // the team's rule: up to 6 ads per test ad set
const CTAS = ['SHOP_NOW', 'LEARN_MORE', 'ORDER_NOW', 'BUY_NOW', 'GET_OFFER', 'SIGN_UP', 'SUBSCRIBE', 'CONTACT_US', 'SEE_MORE', 'NO_BUTTON'];
const clip = (s, n) => String(s ?? '').slice(0, n);
const parse = (v, fb) => { if (v == null) return fb; if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return fb; } };
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const VERDICT_WORD = { winner: 'Winner', loser: 'Loser', cancelled: 'Cancelled' };

/* ---------------- the table ---------------- */
export const LAUNCH_SQL = `CREATE TABLE IF NOT EXISTS p_launch (id TEXT PRIMARY KEY, act TEXT NOT NULL, meta_act TEXT, source TEXT NOT NULL,
  studio_ad TEXT, studio_batch TEXT, batch_id TEXT, num TEXT, ad_id TEXT, ad_name TEXT, adset_id TEXT, adset_name TEXT, write_id TEXT,
  status TEXT, eff_status TEXT, checked_at TEXT, by TEXT, at TEXT NOT NULL, verdict TEXT, learning TEXT, filed_at TEXT)`;
let tabled = false;
async function ensure(env) {
  if (tabled) return;
  await env.DB.prepare(LAUNCH_SQL).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_launch_act ON p_launch (act, at)`).run().catch(() => {});
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
async function sourceOf(env, act, b) {
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
export async function launchPrep(env, d, act, b) {
  const src = await sourceOf(env, act, b); if (src.error) return src;
  const { metas, sets } = await adsetsOf(env, d, act);
  if (!metas.length) return { error: 'This brand has no Meta ad account connected in Locus.' };
  const can = await metaCan(env, metas[0].act, d, metas[0].name);
  const losers = new Set(((await env.DB.prepare(`SELECT num FROM p_br_batch WHERE act_id = ?1 AND (lower(COALESCE(verdict, '')) = 'loser' OR lower(COALESCE(asana_result, '')) LIKE '%loser%')`).bind(act).all()
    .catch(() => env.DB.prepare(`SELECT num FROM p_br_batch WHERE act_id = ?1 AND lower(COALESCE(verdict, '')) = 'loser'`).bind(act).all()).catch(() => ({ results: [] }))).results || []).map(r => String(r.num)));
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
    name: adName({ num: src.num, line: src.line, format: formatOf(src), headline: src.headline, taken }),
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
  const src = await sourceOf(env, act, b); if (src.error) return { error: src.error };
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
  if (r.src.studio_ad && !b.again) {
    const dup = await env.DB.prepare(`SELECT ad_name FROM p_launch WHERE studio_ad = ?1 AND adset_id = ?2 AND COALESCE(eff_status, '') NOT IN ('ARCHIVED', 'DELETED')`).bind(r.src.studio_ad, r.p.patch.id).first();
    if (dup) return { error: `This ad is already in that ad set as "${dup.ad_name}". Nothing was made.`, duplicate: true };
  }
  const out = await r.action.apply(env, r.p.patch, null, r.c);
  if (out.error) return { error: out.error };
  const adId = out.created || (String(out.note || '').match(/\((\d{6,})\)/) || [])[1] || null;
  const id = 'ln_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
  const now = new Date().toISOString();
  const who = ctx?.who || 'someone in Locus';
  const test = r.src.test;
  await env.DB.prepare(`INSERT INTO p_launch (id, act, meta_act, source, studio_ad, studio_batch, batch_id, num, ad_id, ad_name, adset_id, adset_name, write_id, status, eff_status, checked_at, by, at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'PAUSED', 'PAUSED', ?14, ?15, ?14)`)
    .bind(id, act, r.p.patch.act, r.src.kind, r.src.studio_ad, r.src.studio_batch, test?.id || null, r.src.num || null, adId, r.p.patch.ad_name, r.p.patch.id, r.p.patch.name, out.write || null, now, who).run();
  /* Tie the ad to its test in the test library. The number in the name already does; the tag also wins when someone renames it. */
  if (test?.id && adId) await env.DB.prepare(`INSERT INTO p_br_adtag (act_id, ad_id, batch_id, tagged_by, tagged_at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(act_id, ad_id) DO UPDATE SET batch_id = excluded.batch_id, tagged_by = excluded.tagged_by, tagged_at = excluded.tagged_at`).bind(act, adId, test.id, `${who} (Launch to Meta)`, now).run().catch(() => {});
  return { ok: true, launch: { id, ad_id: adId, ad_name: r.p.patch.ad_name, adset_id: r.p.patch.id, adset_name: r.p.patch.name, status: 'PAUSED', eff_status: 'PAUSED', num: r.src.num || null, batch_id: test?.id || null, write: out.write || null, at: now },
    note: out.note, ads_manager: `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${String(r.p.patch.act).replace('act_', '')}&selected_ad_ids=${adId}` };
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
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 502); }
}

export const _test = { sourceOf, createInput, checkInput, resetTable: () => { tabled = false; } };
