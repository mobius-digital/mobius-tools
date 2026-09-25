/**
 * The Brand tab (2026-09-24): everything Locus knows about a brand, and every
 * creative test it has run. It replaces the per-brand Google Sheet.
 *
 *   Profile     the brand at a glance, test rules
 *   Onboarding  the client's own answers, collected on a public link
 *   Research    per PRODUCT LINE: market, mechanism, personas, voice of customer,
 *               competitors, angle ideas. The AI drafts (account-health research.js),
 *               a person approves.
 *   Angles      the library. An angle is logged ONCE; batches point at it.
 *   Roadmap     batches. Ads link to a batch by the number at the START of the ad
 *               name ("326-5 | Still"), so nobody maps anything by hand. Ads without
 *               a number (TikTok UGC, TRYBE) can be tagged to a batch in one click.
 *
 * Money here is Triple Whale attribution (lastPlatformClick) per ad, never Meta's
 * own purchase count - the house rule for every channel ROAS.
 *
 * The verdict is the MEDIA BUYER'S call. Locus only suggests one once a batch has
 * spent enough to judge (the brand's test rules), and lists batches that are
 * ready for a call. Marking a winner on a few dollars is allowed but flagged.
 */

const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);

/* "326-5 | Still" -> 326, "293 C | Still" -> 293, "GD_283 - Sale" -> 283.
   "Tiktok #25 | UGC" and "Nick - 3" do NOT match, on purpose. A match only counts
   when a batch with that number exists, so a stray leading number is harmless. */
export function batchNumOf(name) {
  const m = /^\s*(?:[A-Za-z]{2,4}_)?#?(\d{1,4})(?=$|[^\d])/.exec(name || '');
  return m ? String(parseInt(m[1], 10)) : null;
}
const numKey = n => { const p = parseInt(String(n || '').replace(/^\D+/, ''), 10); return Number.isFinite(p) ? String(p) : String(n || '').trim().toLowerCase(); };

const LEVELS = new Set(['angle', 'concept', 'variation', 'offer']);
const STAGES = new Set(['idea', 'production', 'live', 'done']);
const VERDICTS = new Set(['winner', 'loser', 'cancelled']);

/* Columns each kind may write. Anything else in the body is ignored. */
const KINDS = {
  line: { table: 'p_br_line', cols: { name: 120, about: 2000, products: 2000, sort: 'int' } },
  persona: { table: 'p_br_persona', cols: { line_id: 40, name: 120, data_json: 'json', status: 20, source: 40, sort: 'int' }, stamp: true },
  voc: { table: 'p_br_voc', cols: { line_id: 40, persona_id: 40, kind: 20, quote: 3000, source: 200, url: 1000, theme: 300, nugget: 'int', status: 20 } },
  comp: { table: 'p_br_comp', cols: { line_id: 40, name: 120, url: 500, data_json: 'json', status: 20, sort: 'int' }, stamp: true },
  angle: { table: 'p_br_angle', cols: { line_id: 40, persona_id: 40, name: 200, argument: 3000, awareness: 20, stage: 10, lead: 200, status: 20, source: 40, note: 3000 }, stamp: true },
  concept: { table: 'p_br_concept', cols: { angle_id: 40, name: 200, about: 3000, format: 80 } },
  batch: { table: 'p_br_batch', cols: { num: 20, title: 300, angle_id: 40, concept_id: 40, level: 20, variable: 40, offer: 300, hypothesis: 3000, why: 3000, brief_url: 1000, asset_url: 1000, stage: 20, learning: 3000 }, stamp: true },
};

function cleanRow(kind, b) {
  const spec = KINDS[kind].cols;
  const out = {};
  for (const [k, lim] of Object.entries(spec)) {
    if (!(k in b)) continue;
    let v = b[k];
    if (lim === 'int') v = v == null || v === '' ? 0 : Math.round(+v) || 0;
    else if (lim === 'json') v = typeof v === 'string' ? v.slice(0, 60000) : JSON.stringify(v ?? {}).slice(0, 60000);
    else v = v == null || v === '' ? null : String(v).slice(0, lim);
    out[k] = v;
  }
  if (kind === 'batch') {
    if (out.level && !LEVELS.has(out.level)) out.level = null;
    if (out.stage && !STAGES.has(out.stage)) out.stage = 'idea';
  }
  return out;
}

/* ---------------- test rules ----------------
   CPA first, like the team judges (keep in step with account-health asana-brand.js,
   which posts the same suggestion into Asana with the soft metrics beside it).
   ROAS is only the fallback for a brand with no target CPA. */
const DEFAULT_RULES = { target_cpa: 0, judge_spend: 150, judge_days: 7, win_roas: 2, lose_roas: 1.2 };
function rulesFor(acct, doc) {
  const r = { ...DEFAULT_RULES, target_cpa: null };
  if (acct?.target_cpa > 0) r.target_cpa = +acct.target_cpa;
  if (acct?.target_roas > 0) { r.win_roas = acct.target_roas; r.lose_roas = Math.round(acct.target_roas * 0.6 * 100) / 100; }
  for (const k of Object.keys(DEFAULT_RULES)) if (doc && +doc[k] > 0) r[k] = +doc[k];
  if (!(doc && +doc.judge_spend > 0) && r.target_cpa) r.judge_spend = Math.round(r.target_cpa * 3);
  r.set = !!(doc && Object.keys(DEFAULT_RULES).some(k => +doc[k] > 0));
  return r;
}
function suggest(st, rules) {
  if (!st || !(st.spend > 0)) return 'not_live';
  const age = st.first ? daysBetween(st.first, today()) : 0;
  const enough = st.spend >= rules.judge_spend || (age >= rules.judge_days && st.spend >= rules.judge_spend / 3);
  if (!enough) return 'too_early';
  if (rules.target_cpa) {
    const cpa = st.orders > 0 ? st.spend / st.orders : null;
    if (cpa != null && cpa <= rules.target_cpa) return 'winner';
    if (cpa != null && cpa <= rules.target_cpa * 1.3) return 'keep';
    return 'loser';
  }
  const roas = st.spend > 0 ? st.rev / st.spend : 0;
  if (roas >= rules.win_roas) return 'winner';
  if (roas < rules.lose_roas) return 'loser';
  return 'keep';
}

/* ---------------- ads ---------------- */
async function adUniverse(env, actId) {
  const since30 = addDays(today(), -30);
  const [ads, spend, tw, tags] = await Promise.all([
    env.DB.prepare(`SELECT ad_id, name, created_time, status, media_type FROM ads WHERE act_id = ?1`).bind(actId).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT ad_id, SUM(spend) spend, MIN(CASE WHEN spend > 0 THEN date END) first, MAX(CASE WHEN spend > 0 THEN date END) last,
                           SUM(CASE WHEN date >= ?2 THEN spend ELSE 0 END) spend30, SUM(impressions) impr, SUM(link_clicks) clicks,
                           SUM(video_3s) v3, SUM(add_to_cart) atc
                      FROM ad_daily WHERE act_id = ?1 GROUP BY ad_id`).bind(actId, since30).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT ad_id, SUM(revenue) rev, SUM(orders) orders FROM tw_ad_attr
                     WHERE act_id = ?1 AND model = 'lastPlatformClick' GROUP BY ad_id`).bind(actId).all().catch(() => ({ results: [] })),
    env.DB.prepare(`SELECT ad_id, batch_id FROM p_br_adtag WHERE act_id = ?1`).bind(actId).all().catch(() => ({ results: [] })),
  ]);
  const sp = Object.fromEntries((spend.results || []).map(r => [r.ad_id, r]));
  const rv = Object.fromEntries((tw.results || []).map(r => [r.ad_id, r]));
  const tg = Object.fromEntries((tags.results || []).map(r => [r.ad_id, r.batch_id]));
  return (ads.results || []).map(a => ({
    ad_id: a.ad_id, name: a.name, created: (a.created_time || '').slice(0, 10), status: a.status, media_type: a.media_type,
    spend: sp[a.ad_id]?.spend || 0, spend30: sp[a.ad_id]?.spend30 || 0, first: sp[a.ad_id]?.first || null, last: sp[a.ad_id]?.last || null,
    rev: rv[a.ad_id]?.rev || 0, orders: rv[a.ad_id]?.orders || 0,
    impr: sp[a.ad_id]?.impr || 0, clicks: sp[a.ad_id]?.clicks || 0, v3: sp[a.ad_id]?.v3 || 0, atc: sp[a.ad_id]?.atc || 0,
    num: batchNumOf(a.name), tag: tg[a.ad_id] || null,
  }));
}
const blank = () => ({ ads: 0, running: 0, spend: 0, spend30: 0, rev: 0, orders: 0, impr: 0, clicks: 0, v3: 0, atc: 0, first: null, last: null });
function addAd(st, a) {
  st.ads++; st.spend += a.spend; st.spend30 += a.spend30; st.rev += a.rev; st.orders += a.orders;
  st.impr += a.impr || 0; st.clicks += a.clicks || 0; st.v3 += a.v3 || 0; st.atc += a.atc || 0;
  if (a.spend30 > 0) st.running++;
  if (a.first && (!st.first || a.first < st.first)) st.first = a.first;
  if (a.last && (!st.last || a.last > st.last)) st.last = a.last;
}
const r2 = n => Math.round(n * 100) / 100;
const finish = st => ({ ...st, spend: r2(st.spend), rev: r2(st.rev), roas: st.spend > 0 ? r2(st.rev / st.spend) : null, cpa: st.orders > 0 ? r2(st.spend / st.orders) : null,
  ctr: st.impr > 0 ? st.clicks / st.impr : null, hook: st.impr > 0 && st.v3 > 0 ? st.v3 / st.impr : null,
  cpm: st.impr > 0 ? r2((st.spend / st.impr) * 1000) : null, cpatc: st.atc > 0 ? r2(st.spend / st.atc) : null });

/* ---------------- the whole brand ---------------- */
async function mustAccount(env, act) {
  if (!act || act === 'all') throw Object.assign(new Error('pick a brand first'), { status: 400 });
  const a = await env.DB.prepare(`SELECT act_id, name, currency, tz, target_cpa, target_roas, tw_shop FROM accounts WHERE act_id = ?1`).bind(act).first();
  if (!a) throw Object.assign(new Error('unknown account'), { status: 404 });
  return a;
}

async function payload(env, acct) {
  const A = acct.act_id;
  const q = (sql) => env.DB.prepare(sql).bind(A).all().then(r => r.results || []).catch(() => []);
  const [lines, docs, personas, voc, comps, angles, concepts, batches, runs, onboard, ads] = await Promise.all([
    q(`SELECT * FROM p_br_line WHERE act_id = ?1 ORDER BY sort, created_at`),
    q(`SELECT * FROM p_br_doc WHERE act_id = ?1`),
    q(`SELECT * FROM p_br_persona WHERE act_id = ?1 ORDER BY sort, updated_at`),
    q(`SELECT * FROM p_br_voc WHERE act_id = ?1 ORDER BY created_at`),
    q(`SELECT * FROM p_br_comp WHERE act_id = ?1 ORDER BY sort, name`),
    q(`SELECT * FROM p_br_angle WHERE act_id = ?1 ORDER BY created_at`),
    q(`SELECT * FROM p_br_concept WHERE act_id = ?1 ORDER BY created_at`),
    q(`SELECT * FROM p_br_batch WHERE act_id = ?1`),
    q(`SELECT * FROM p_br_run WHERE act_id = ?1 ORDER BY started_at DESC LIMIT 40`),
    env.DB.prepare(`SELECT * FROM p_br_onboard WHERE act_id = ?1`).bind(A).first().catch(() => null),
    adUniverse(env, A),
  ]);
  const docMap = {};
  for (const d of docs) (docMap[d.line_id || ''] ||= {})[d.key] = { ...safeJson(d.data_json, {}), _status: d.status, _source: d.source, _updated: d.updated_at };
  const rules = rulesFor(acct, docMap['']?.rules);

  /* Ads -> batches. A manual tag wins over the name. */
  const byNum = Object.fromEntries(batches.map(b => [numKey(b.num), b.id]));
  const byId = Object.fromEntries(batches.map(b => [b.id, b]));
  const stats = {};
  const untagged = [];
  for (const a of ads) {
    const bid = (a.tag && byId[a.tag]) ? a.tag : (a.num ? byNum[a.num] : null);
    if (bid) { addAd(stats[bid] ||= blank(), a); (stats[bid].list ||= []).push(a.ad_id); }
    else if (a.spend > 0) untagged.push(a);
  }
  const outBatches = batches.map(b => {
    const st = finish(stats[b.id] || blank());
    const sug = suggest(st, rules);
    return { ...b, legacy: safeJson(b.legacy_json, null), legacy_json: undefined, ad_ids: stats[b.id]?.list || [], stats: st, suggest: sug,
      /* Ready for the media buyer: spent enough, no call yet, and not parked on Keep running. */
      needs_call: !b.verdict && b.stage !== 'done' && b.asana_result !== 'keep' && ['winner', 'loser', 'keep'].includes(sug),
      /* A verdict on too little spend to judge. Allowed, but the buyer sees why it is shaky. */
      thin: !!(['winner', 'loser'].includes(b.verdict) && (sug === 'too_early' || sug === 'not_live')),
      ads_manager: stats[b.id]?.list?.length ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${A.replace(/^act_/, '')}&selected_ad_ids=${stats[b.id].list.slice(0, 30).join(',')}` : null };
  }).sort((x, y) => (parseInt(y.num, 10) || 0) - (parseInt(x.num, 10) || 0) || String(y.created_at).localeCompare(String(x.created_at)));

  const angleStats = {};
  for (const b of outBatches) {
    if (!b.angle_id) continue;
    const s = angleStats[b.angle_id] ||= { batches: 0, spend: 0, rev: 0, winners: 0, losers: 0, judged: 0, last: null };
    s.batches++; s.spend += b.stats.spend; s.rev += b.stats.rev;
    if (b.verdict === 'winner') s.winners++;
    if (b.verdict === 'loser') s.losers++;
    if (b.verdict && b.verdict !== 'cancelled') s.judged++;
    /* Last tested = when its ads first spent. An imported batch with no spend on
       record has no date, rather than the day it was imported. */
    const when = b.stats.first || (b.source === 'sheet' ? null : (b.created_at || '').slice(0, 10));
    if (when && (!s.last || when > s.last)) s.last = when;
  }
  const outAngles = angles.map(a => {
    const s = angleStats[a.id] || { batches: 0, spend: 0, rev: 0, winners: 0, losers: 0, judged: 0, last: null };
    return { ...a, stats: { ...s, spend: Math.round(s.spend), roas: s.spend > 0 ? Math.round((s.rev / s.spend) * 100) / 100 : null, win_rate: s.judged ? Math.round((s.winners / s.judged) * 100) : null } };
  });

  const since30 = addDays(today(), -30);
  const un30 = untagged.filter(a => a.last && a.last >= since30);
  const total30 = ads.reduce((t, a) => t + a.spend30, 0);
  return {
    account: { act_id: A, name: acct.name, currency: acct.currency, target_cpa: acct.target_cpa, target_roas: acct.target_roas },
    rules,
    lines,
    docs: docMap,
    personas: personas.map(p => ({ ...p, data: safeJson(p.data_json, {}), data_json: undefined })),
    voc, comps: comps.map(c => ({ ...c, data: safeJson(c.data_json, {}), data_json: undefined })),
    angles: outAngles, concepts, batches: outBatches,
    untagged: {
      spend30: Math.round(un30.reduce((t, a) => t + a.spend30, 0)),
      share30: total30 > 0 ? Math.round((un30.reduce((t, a) => t + a.spend30, 0) / total30) * 100) : 0,
      ads: untagged.sort((x, y) => (y.spend30 - x.spend30) || (y.spend - x.spend)).slice(0, 60)
        .map(a => ({ ad_id: a.ad_id, name: a.name, spend: Math.round(a.spend), spend30: Math.round(a.spend30), rev: Math.round(a.rev), roas: a.spend > 0 ? Math.round((a.rev / a.spend) * 100) / 100 : null, last: a.last, trybe: /trybe=/i.test(a.name || '') })),
    },
    onboard: onboard ? { token: onboard.token, status: onboard.status, step: onboard.step, submitted_at: onboard.submitted_at, updated_at: onboard.updated_at, answers: safeJson(onboard.answers_json, {}), prefill: safeJson(onboard.prefill_json, {}) } : null,
    runs,
    next_num: String(Math.max(0, ...batches.map(b => parseInt(b.num, 10) || 0)) + 1),
    has_media: !!env.MEDIA,
  };
}

/* ---------------- all brands ---------------- */
async function overview(env) {
  const accts = (await env.DB.prepare(`SELECT act_id, name FROM accounts WHERE active = 1 ORDER BY name`).all()).results || [];
  const cnt = async (sql) => Object.fromEntries(((await env.DB.prepare(sql).all().catch(() => ({ results: [] }))).results || []).map(r => [r.act_id, r]));
  const [lines, personas, angles, batches, onboard] = await Promise.all([
    cnt(`SELECT act_id, COUNT(*) n FROM p_br_line GROUP BY act_id`),
    cnt(`SELECT act_id, COUNT(*) n, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) ok FROM p_br_persona GROUP BY act_id`),
    cnt(`SELECT act_id, COUNT(*) n FROM p_br_angle WHERE status = 'active' GROUP BY act_id`),
    cnt(`SELECT act_id, COUNT(*) n, SUM(CASE WHEN stage IN ('idea','production','live') THEN 1 ELSE 0 END) open FROM p_br_batch GROUP BY act_id`),
    cnt(`SELECT act_id, status, submitted_at FROM p_br_onboard`),
  ]);
  return { brands: accts.map(a => ({ act_id: a.act_id, name: a.name, lines: lines[a.act_id]?.n || 0, personas: personas[a.act_id]?.n || 0, personas_ok: personas[a.act_id]?.ok || 0, angles: angles[a.act_id]?.n || 0, batches: batches[a.act_id]?.n || 0, open: batches[a.act_id]?.open || 0, onboard: onboard[a.act_id]?.status || null })) };
}

/* ---------------- writes ---------------- */
async function save(env, act, kind, b) {
  const spec = KINDS[kind];
  if (!spec) throw Object.assign(new Error('unknown kind'), { status: 400 });
  const row = cleanRow(kind, b);
  if (kind === 'batch' && 'num' in row) {
    row.num = String(row.num || '').trim();
    if (!row.num) throw Object.assign(new Error('The batch needs a number'), { status: 400 });
    const clash = await env.DB.prepare(`SELECT id FROM p_br_batch WHERE act_id = ?1 AND num = ?2`).bind(act, row.num).first();
    if (clash && clash.id !== b.id) throw Object.assign(new Error(`Batch ${row.num} already exists`), { status: 409 });
  }
  if (b.id) {
    const keys = Object.keys(row);
    if (!keys.length) return b.id;
    const sets = keys.map((k, i) => `${k} = ?${i + 3}`);
    if (spec.stamp) sets.push(`updated_at = datetime('now')`);
    const r = await env.DB.prepare(`UPDATE ${spec.table} SET ${sets.join(', ')} WHERE id = ?1 AND act_id = ?2`).bind(b.id, act, ...keys.map(k => row[k])).run();
    if (!r.meta?.changes) throw Object.assign(new Error('not found'), { status: 404 });
    return b.id;
  }
  const req = { line: 'name', persona: 'name', voc: 'quote', comp: 'name', angle: 'name', concept: 'name', batch: 'title' }[kind];
  if (!row[req]) throw Object.assign(new Error(`${req} is required`), { status: 400 });
  if (kind === 'voc' && !row.kind) row.kind = 'pain';
  const id = rid();
  const keys = Object.keys(row);
  await env.DB.prepare(`INSERT INTO ${spec.table} (id, act_id, ${keys.join(', ')}) VALUES (?1, ?2, ${keys.map((_, i) => `?${i + 3}`).join(', ')})`)
    .bind(id, act, ...keys.map(k => row[k])).run();
  return id;
}

async function del(env, act, kind, id) {
  const spec = KINDS[kind];
  if (!spec || !id) throw Object.assign(new Error('bad request'), { status: 400 });
  const st = [env.DB.prepare(`DELETE FROM ${spec.table} WHERE id = ?1 AND act_id = ?2`).bind(id, act)];
  if (kind === 'line') {
    for (const t of ['p_br_persona', 'p_br_voc', 'p_br_comp']) st.push(env.DB.prepare(`DELETE FROM ${t} WHERE act_id = ?1 AND line_id = ?2`).bind(act, id));
    st.push(env.DB.prepare(`DELETE FROM p_br_doc WHERE act_id = ?1 AND line_id = ?2`).bind(act, id));
    st.push(env.DB.prepare(`UPDATE p_br_angle SET line_id = NULL WHERE act_id = ?1 AND line_id = ?2`).bind(act, id));
  }
  if (kind === 'angle') {
    st.push(env.DB.prepare(`UPDATE p_br_batch SET angle_id = NULL, concept_id = NULL WHERE act_id = ?1 AND angle_id = ?2`).bind(act, id));
    st.push(env.DB.prepare(`DELETE FROM p_br_concept WHERE act_id = ?1 AND angle_id = ?2`).bind(act, id));
  }
  if (kind === 'concept') st.push(env.DB.prepare(`UPDATE p_br_batch SET concept_id = NULL WHERE act_id = ?1 AND concept_id = ?2`).bind(act, id));
  if (kind === 'persona') {
    st.push(env.DB.prepare(`UPDATE p_br_voc SET persona_id = NULL WHERE act_id = ?1 AND persona_id = ?2`).bind(act, id));
    st.push(env.DB.prepare(`UPDATE p_br_angle SET persona_id = NULL WHERE act_id = ?1 AND persona_id = ?2`).bind(act, id));
  }
  if (kind === 'batch') st.push(env.DB.prepare(`DELETE FROM p_br_adtag WHERE act_id = ?1 AND batch_id = ?2`).bind(act, id));
  await env.DB.batch(st);
}

async function putDoc(env, act, lineId, key, data, status, source) {
  if (!/^[a-z_]{2,30}$/.test(key || '')) throw Object.assign(new Error('bad doc key'), { status: 400 });
  const clean = { ...(data || {}) };
  for (const k of Object.keys(clean)) if (k.startsWith('_')) delete clean[k];
  await env.DB.prepare(
    `INSERT INTO p_br_doc (act_id, line_id, key, data_json, status, source, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))
     ON CONFLICT(act_id, line_id, key) DO UPDATE SET data_json = excluded.data_json, status = excluded.status,
       source = COALESCE(excluded.source, p_br_doc.source), updated_at = excluded.updated_at`,
  ).bind(act, lineId || '', key, JSON.stringify(clean).slice(0, 200000), status || 'approved', source || null).run();
}

/* ---------------- onboarding ---------------- */
const tokenOk = t => /^[a-f0-9]{24,40}$/.test(t || '');
async function onboardRow(env, token) {
  if (!tokenOk(token)) return null;
  return env.DB.prepare(`SELECT o.*, a.name FROM p_br_onboard o JOIN accounts a ON a.act_id = o.act_id WHERE o.token = ?1`).bind(token).first();
}
function mergeAnswers(old, patch) {
  const out = { ...(old || {}) };
  for (const [k, v] of Object.entries(patch || {})) {
    if (!/^[a-z_0-9]{1,40}$/.test(k)) continue;
    if (v === null || v === '') delete out[k]; else out[k] = v;
  }
  const s = JSON.stringify(out);
  if (s.length > 250000) throw Object.assign(new Error('Too much text in one form. Shorten a few answers.'), { status: 413 });
  return out;
}

export async function handlePublic(request, env, url, path, json) {
  const m = /^\/api\/onboard\/([a-f0-9]{24,40})(\/file)?$/.exec(path);
  if (!m) return null;
  const row = await onboardRow(env, m[1]);
  if (!row) return json({ error: 'This link is not valid. Ask your Mobius contact for a new one.' }, 404);
  if (m[2]) {
    if (request.method !== 'POST') return json({ error: 'method' }, 405);
    if (!env.MEDIA) return json({ error: 'File uploads are not set up yet. Email it to your Mobius contact instead.' }, 503);
    const field = (url.searchParams.get('field') || '').replace(/[^a-z_0-9]/g, '').slice(0, 40);
    const name = (url.searchParams.get('name') || 'file').replace(/[^\w.\- ]/g, '').slice(0, 120) || 'file';
    const len = +request.headers.get('Content-Length') || 0;
    if (len > 95 * 1024 * 1024) return json({ error: 'That file is over 95MB. Send a link instead.' }, 413);
    const key = `onboard/${row.act_id}/${field}/${rid()}-${name}`;
    await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: request.headers.get('Content-Type') || 'application/octet-stream' } });
    return json({ ok: true, file: { key, name, at: today() } });
  }
  if (request.method === 'GET') {
    /* Links the client's form shows (their Drive folder), from Brand info > At a glance. */
    const prof = safeJson((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'profile'`).bind(row.act_id).first().catch(() => null))?.data_json, {});
    const links = /^https:\/\//.test(prof.drive || '') ? { drive: prof.drive } : {};
    return json({ brand: row.name, links, answers: safeJson(row.answers_json, {}), prefill: safeJson(row.prefill_json, {}), status: row.status, step: row.step, submitted_at: row.submitted_at });
  }
  if (request.method === 'PUT') {
    const b = await request.json().catch(() => ({}));
    const answers = mergeAnswers(safeJson(row.answers_json, {}), b.answers);
    const status = b.submit ? 'submitted' : (row.status === 'submitted' ? 'submitted' : 'started');
    await env.DB.prepare(`UPDATE p_br_onboard SET answers_json = ?2, step = ?3, status = ?4, updated_at = datetime('now'),
        submitted_at = CASE WHEN ?5 = 1 THEN datetime('now') ELSE submitted_at END WHERE token = ?1`)
      .bind(row.token, JSON.stringify(answers), Math.max(0, Math.min(20, +b.step || 0)), status, b.submit ? 1 : 0).run();
    return json({ ok: true, status });
  }
  return json({ error: 'method' }, 405);
}

/* ---------------- staff routes ---------------- */
export async function handleStaff(request, env, url, path, json) {
  if (!path.startsWith('/api/brand')) return null;
  try {
    if (path === '/api/brand/overview') return json(await overview(env));
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    const act = request.method === 'GET' ? url.searchParams.get('act') : body.act;

    if (path === '/api/brand/file' && request.method === 'GET') {
      const key = url.searchParams.get('key') || '';
      if (!env.MEDIA || !/^onboard\//.test(key)) return json({ error: 'not found' }, 404);
      const obj = await env.MEDIA.get(key);
      if (!obj) return json({ error: 'not found' }, 404);
      return new Response(obj.body, { headers: { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${key.split('/').pop().replace(/^[a-f0-9]{16}-/, '')}"`, 'Access-Control-Allow-Origin': '*' } });
    }

    const acct = await mustAccount(env, act);
    const A = acct.act_id;
    const back = async (extra = {}) => json({ ...(await payload(env, acct)), ...extra });

    if (path === '/api/brand' && request.method === 'GET') return back();

    if (path === '/api/brand/save' && request.method === 'POST') {
      const id = await save(env, A, body.kind, body.row || {});
      return back({ saved: id });
    }
    if (path === '/api/brand/save-many' && request.method === 'POST') {
      const ids = [];
      for (const r of (body.rows || []).slice(0, 200)) ids.push(await save(env, A, r.kind, r.row || {}));
      return back({ saved: ids });
    }
    if (path === '/api/brand/del' && request.method === 'POST') {
      await del(env, A, body.kind, body.id);
      return back();
    }
    /* Two angles that are the same reason to buy: every test and concept moves to `into`. */
    if (path === '/api/brand/merge' && request.method === 'POST') {
      if (!body.from || !body.into || body.from === body.into) return json({ error: 'Pick two different angles' }, 400);
      const ok = await env.DB.prepare(`SELECT COUNT(*) n FROM p_br_angle WHERE act_id = ?1 AND id IN (?2, ?3)`).bind(A, body.from, body.into).first();
      if (ok?.n !== 2) return json({ error: 'unknown angle' }, 404);
      await env.DB.batch([
        env.DB.prepare(`UPDATE p_br_batch SET angle_id = ?3, updated_at = datetime('now') WHERE act_id = ?1 AND angle_id = ?2`).bind(A, body.from, body.into),
        env.DB.prepare(`UPDATE p_br_concept SET angle_id = ?3 WHERE act_id = ?1 AND angle_id = ?2`).bind(A, body.from, body.into),
        env.DB.prepare(`DELETE FROM p_br_angle WHERE act_id = ?1 AND id = ?2`).bind(A, body.from),
      ]);
      return back();
    }
    if (path === '/api/brand/doc' && request.method === 'PUT') {
      await putDoc(env, A, body.line_id, body.key, body.data, body.status, body.source || 'staff');
      return back();
    }
    if (path === '/api/brand/verdict' && request.method === 'POST') {
      const v = body.verdict || null;
      if (v && !VERDICTS.has(v)) return json({ error: 'bad verdict' }, 400);
      await env.DB.prepare(`UPDATE p_br_batch SET verdict = ?3, verdict_note = ?4, verdict_by = ?5, verdict_at = CASE WHEN ?3 IS NULL THEN NULL ELSE datetime('now') END,
          learning = COALESCE(?6, learning), stage = CASE WHEN ?3 IS NULL THEN stage ELSE 'done' END, updated_at = datetime('now') WHERE id = ?1 AND act_id = ?2`)
        .bind(body.id, A, v, clip(body.note, 1000), clip(body.who, 120) || 'staff', clip(body.learning, 3000)).run();
      return back();
    }
    if (path === '/api/brand/tag' && request.method === 'POST') {
      const ids = (body.ad_ids || [body.ad_id]).filter(Boolean).slice(0, 100);
      if (body.batch_id) {
        const ok = await env.DB.prepare(`SELECT id FROM p_br_batch WHERE id = ?1 AND act_id = ?2`).bind(body.batch_id, A).first();
        if (!ok) return json({ error: 'unknown batch' }, 404);
        await env.DB.batch(ids.map(ad => env.DB.prepare(`INSERT INTO p_br_adtag (act_id, ad_id, batch_id, tagged_by) VALUES (?1, ?2, ?3, 'staff')
          ON CONFLICT(act_id, ad_id) DO UPDATE SET batch_id = excluded.batch_id, tagged_at = datetime('now')`).bind(A, ad, body.batch_id)));
      } else {
        await env.DB.batch(ids.map(ad => env.DB.prepare(`DELETE FROM p_br_adtag WHERE act_id = ?1 AND ad_id = ?2`).bind(A, ad)));
      }
      return back();
    }
    if (path === '/api/brand/ads' && request.method === 'GET') {
      const bid = url.searchParams.get('batch');
      const d = await payload(env, acct);
      const b = d.batches.find(x => x.id === bid);
      if (!b) return json({ error: 'unknown batch' }, 404);
      const all = await adUniverse(env, A);
      const set = new Set(b.ad_ids);
      return json({ ads: all.filter(a => set.has(a.ad_id)).sort((x, y) => y.spend - x.spend).map(a => ({ ...a, spend: Math.round(a.spend), rev: Math.round(a.rev), roas: a.spend > 0 ? Math.round((a.rev / a.spend) * 100) / 100 : null, manual: !!a.tag })) });
    }
    /* Onboarding, staff side. */
    if (path === '/api/brand/onboard' && request.method === 'POST') {
      const have = await env.DB.prepare(`SELECT token FROM p_br_onboard WHERE act_id = ?1`).bind(A).first();
      if (!have) {
        const token = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
        await env.DB.prepare(`INSERT INTO p_br_onboard (act_id, token) VALUES (?1, ?2)`).bind(A, token).run();
      }
      return back();
    }
    if (path === '/api/brand/onboard' && request.method === 'PUT') {
      const row = await env.DB.prepare(`SELECT * FROM p_br_onboard WHERE act_id = ?1`).bind(A).first();
      if (!row) return json({ error: 'Create the onboarding link first' }, 404);
      const answers = mergeAnswers(safeJson(row.answers_json, {}), body.answers);
      const prefill = body.prefill ? mergeAnswers(safeJson(row.prefill_json, {}), body.prefill) : safeJson(row.prefill_json, {});
      await env.DB.prepare(`UPDATE p_br_onboard SET answers_json = ?2, prefill_json = ?3, updated_at = datetime('now') WHERE act_id = ?1`)
        .bind(A, JSON.stringify(answers), JSON.stringify(prefill)).run();
      return back();
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
}
