/**
 * Ambassadors: the living creator brief (2026-09-16).
 *
 * Staff keep each brand's angles on Locus's Ambassadors tab; creators read them on
 * a public link, tools.go-mobius-digital.com/angles/<slug>. The link is the brief:
 * the PDF uploaded to TRYBE only points at it, so it never goes stale.
 *
 * THE PUBLIC PAYLOAD CARRIES NO MONEY. Cole's rule: no sales figures on a public
 * link. Tagged Meta ads are shown to creators as playable proof ("ran as an ad"),
 * never with spend, revenue or return. Those live on the staff side only.
 * Typed sales on an example are staff-only for the same reason; typed VIEWS are
 * public, labelled as typed.
 *
 * The season chart is RELATIVE: last year's weekly store sales for the weeks
 * ahead, scaled to the median week, so a creator sees the shape of the season and
 * never a dollar amount.
 */

import { metaOf, storagePrefix } from './brandids.js';
import { clientScope } from './brandguard.js';

/* Brand-first phase 3 (2026-10-08): act_id in p_amb_* is the BRAND id. Meta's ads / ad_daily stay on
   the Meta ad account id: read them with `act_id IN ${metaOf(n)}`. Uploads go under the brand's
   storage_prefix (its old act id) so new files sit beside the old ones. */
const safeJson = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const MAX_UPLOAD = 95 * 1024 * 1024;   // Workers cap a request body at 100MB on this plan
const clip = (s, n) => (s == null ? null : String(s).slice(0, n));
/* Section icons are drawn as raw SVG on Locus and on the public creator page (same site as the Locus session), so an
   icon is rebuilt from an allowlist: only drawing tags and drawing attributes, nothing that can run (2026-10-14 audit:
   "onerror =" with a space got past the old filter). Applied on write AND on read, so an old row cannot carry script. */
const SVG_TAGS = new Set(['svg', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'g']);
const SVG_ATTRS = new Set(['xmlns', 'viewbox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'class', 'opacity', 'fill-rule', 'clip-rule']);
export function cleanSvg(raw) {
  if (!raw) return null;
  let out = '', depth = 0;
  for (const m of String(raw).slice(0, 4000).matchAll(/<\s*(\/?)\s*([a-zA-Z][\w-]*)([^>]*?)(\/?)\s*>/g)) {
    const [, close, tag0, attrs, self] = m; const tag = tag0.toLowerCase();
    if (!SVG_TAGS.has(tag)) continue;
    if (close) { if (depth > 0) { out += `</${tag}>`; depth--; } continue; }
    let a = '';
    for (const am of attrs.matchAll(/([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
      const name = am[1].toLowerCase(), val = am[3] != null ? am[3] : am[4];
      if (!SVG_ATTRS.has(name) || /[<>]|javascript:|url\s*\(|expression/i.test(val)) continue;
      a += ` ${name === 'viewbox' ? 'viewBox' : name}="${val.replace(/"/g, '&quot;')}"`;
    }
    out += `<${tag}${a}${self ? '/' : ''}>`; if (!self) depth++;
  }
  while (depth-- > 0) out += '</g>';
  return /^<svg[\s>]/.test(out) ? out : null;
}
/* An uploaded proof's file must live under this brand's own creator-page folder (2026-10-14 audit: a client could
   point a proof at any key in the shared bucket, then read or delete it). The team may also file the ideas bot's clips. */
async function ownFileKey(env, request, act, key) {
  const k = String(key || '');
  if (!k || k.includes('..')) return false;
  const mine = [`amb/${await storagePrefix(env, act)}/`, `amb/${act}/`];
  if (mine.some(p => k.startsWith(p))) return true;
  return !clientScope(request) && k.startsWith('amb/');
}
const arr = (v, n, m) => (Array.isArray(v) ? v : []).map(x => (typeof x === 'string' ? x.trim().slice(0, m) : x)).filter(Boolean).slice(0, n);
const addDays = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => new Date().toISOString().slice(0, 10);

/* ---------------- read models ---------------- */

async function loadAll(env, actId) {
  const [brand, secs, angles, proof] = await Promise.all([
    env.DB.prepare(`SELECT * FROM p_amb_brand WHERE act_id = ?1`).bind(actId).first(),
    env.DB.prepare(`SELECT * FROM p_amb_section WHERE act_id = ?1 ORDER BY pinned DESC, sort, created_at`).bind(actId).all(),
    env.DB.prepare(`SELECT * FROM p_amb_angle WHERE act_id = ?1 ORDER BY sort, created_at`).bind(actId).all(),
    env.DB.prepare(`SELECT * FROM p_amb_proof WHERE act_id = ?1 ORDER BY sort, created_at`).bind(actId).all(),
  ]);
  return { brand, sections: secs.results || [], angles: angles.results || [], proof: proof.results || [] };
}

/** Lifetime and last-30-day Meta numbers for a set of ads. Staff only. */
async function adStats(env, actId, adIds) {
  const out = {};
  const ids = [...new Set(adIds.filter(Boolean))];
  if (!ids.length) return out;
  const since = addDays(today(), -30);
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const q = part.map((_, k) => `?${k + 3}`).join(',');
    const { results } = await env.DB.prepare(
      `SELECT d.ad_id, SUM(d.spend) spend, SUM(d.revenue) revenue, SUM(d.purchases) purchases,
              SUM(CASE WHEN d.date >= ?2 THEN d.spend ELSE 0 END) spend30,
              MIN(d.date) first_date, MAX(CASE WHEN d.spend > 0 THEN d.date END) last_spend
         FROM ad_daily d WHERE d.act_id IN ${metaOf(1)} AND d.ad_id IN (${q}) GROUP BY d.ad_id`,
    ).bind(actId, since, ...part).all();
    for (const r of results || []) out[r.ad_id] = r;
    const names = await env.DB.prepare(
      `SELECT ad_id, name, status, media_type FROM ads WHERE act_id IN ${metaOf(1)} AND ad_id IN (${part.map((_, k) => `?${k + 2}`).join(',')})`,
    ).bind(actId, ...part).all().catch(() => ({ results: [] }));
    for (const n of names.results || []) out[n.ad_id] = { ...(out[n.ad_id] || { ad_id: n.ad_id }), name: n.name, status: n.status, media_type: n.media_type };
  }
  for (const v of Object.values(out)) v.roas = v.spend > 0 ? v.revenue / v.spend : null;
  return out;
}

function shapeAngle(a) {
  return {
    id: a.id, section_id: a.section_id, hot: !!a.hot, hot_sort: a.hot_sort, sort: a.sort, status: a.status,
    title: a.title, argument: a.argument, who: a.who, products: a.products, format: a.format, lever: a.lever,
    openers: safeJson(a.openers_json, []), shots: safeJson(a.shots_json, []), on_screen: a.on_screen,
    do_text: a.do_text, dont_text: a.dont_text, trend: a.trend, updated_at: a.updated_at,
    // 2026-10-06: how to hold attention, and what to steal when we have no proof of our own.
    visual_hook: a.visual_hook, rehook: a.rehook, why: a.why, inspo: safeJson(a.inspo_json, []),
    alt_hooks: safeJson(a.alt_hooks_json, []),
  };
}
function shapeBrand(b, acct) {
  if (!b) return null;
  return {
    act_id: b.act_id, slug: b.slug, live: !!b.live, display_name: b.display_name || acct?.name || '',
    intro: b.intro, about: b.about, audience: b.audience, accent: b.accent, logo_url: b.logo_url,
    submit_platform: b.submit_platform, submit_url: b.submit_url, submit_label: b.submit_label,
    avoid: safeJson(b.avoid_json, []), rules: safeJson(b.rules_json, []), season: safeJson(b.season_json, null),
    show_inspo: !!b.show_inspo, updated_at: b.updated_at,
    pdf: safeJson(b.pdf_json, null),
    guide: safeJson(b.guide_json, []),          // "How to keep them watching", [{title, text}]
    hooks: safeJson(b.hooks_json, []),          // "First seconds" bank, [{title, how, kind, url, clip}]
    board_mode: b.board_mode === 'auto' ? 'auto' : 'picked', board_n: b.board_n || 20, board_sort: BOARD_SORTS.has(b.board_sort) ? b.board_sort : 'orders',   // the video board (amb-004)
  };
}

/** A year of last year's weekly sales, as a multiple of the median week, with
 *  this week marked. Thirteen weeks behind, thirty-eight ahead: the shape of the
 *  whole year with "now" near the left, like the Frost Buddy chart. */
async function seasonShape(env, actId, weeks = 52, back = 13) {
  const nowLast = addDays(today(), -364);               // this week, one year back
  const start = addDays(nowLast, -back * 7);
  const end = addDays(start, weeks * 7 - 1);
  const { results } = await env.DB.prepare(
    `SELECT date, value FROM tw_daily WHERE act_id = ?1 AND metric = 'netSales' AND date BETWEEN ?2 AND ?3`,
  ).bind(actId, start, end).all();
  const byDate = new Map((results || []).map(r => [r.date, r.value]));
  const weekSum = from => { let s = 0, n = 0; for (let i = 0; i < 7; i++) { const v = byDate.get(addDays(from, i)); if (v != null) { s += v; n++; } } return n >= 5 ? s * 7 / n : null; };
  const raw = [];
  for (let i = 0; i < weeks; i++) { const from = addDays(start, i * 7); raw.push({ from, w: weekSum(from) }); }
  const vals = raw.map(r => r.w).filter(v => v != null).sort((a, b) => a - b);
  if (vals.length < weeks / 2) return null;
  const median = vals[Math.floor(vals.length / 2)] || 1;
  // The label is the date the week falls on THIS year, which is what a creator plans against.
  const out = raw.map(r => ({ week_of: addDays(r.from, 364), x: r.w == null ? null : Math.round((r.w / median) * 100) / 100 }));
  return { weeks: out, now_index: back, basis: 'last year, week by week, compared with a normal week' };
}

/** ISO week number, so a drawn chart repeats on the same weeks every year. */
const isoWeek = ymd => {
  const d = new Date(`${ymd}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const first = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
};
/** A chart the team drew by hand: 0-100 per ISO week, 25 is a normal week.
 *  Same window as the sales chart. The payload says it is drawn, so the page
 *  never labels it as sales. */
function customShape(custom, weeks = 52, back = 13) {
  const start = addDays(today(), -back * 7);
  const out = [];
  for (let i = 0; i < weeks; i++) {
    const week_of = addDays(start, i * 7);
    const v = Number(custom?.[isoWeek(week_of)]);
    out.push({ week_of, x: Math.round(((Number.isFinite(v) ? v : 25) / 25) * 100) / 100, level: Number.isFinite(v) ? v : 25 });
  }
  return { weeks: out, now_index: back, custom: true };
}

/* ---------------- board picks ---------------- */
/** The angle_id of a video picked straight onto the board (no idea). Not a real angle row. */
export const BOARD = 'board';
/** Add ads to the board picks, in the order given, after the ones already there. Only this brand's ads; an
 *  ad already picked is skipped. Shared by the Ambassadors tab and the Strategist (account-health calls the
 *  same SQL in its own tool). Returns the ids it added. */
export async function addBoardPicks(env, actId, adIds) {
  const added = [];
  const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort), 0) n FROM p_amb_proof WHERE act_id = ?1 AND angle_id = ?2`).bind(actId, BOARD).first();
  let n = mx?.n || 0;
  for (const adId of adIds) {
    const own = await env.DB.prepare(`SELECT 1 FROM ads WHERE act_id IN ${metaOf(1)} AND ad_id = ?2`).bind(actId, adId).first();
    if (!own) continue;
    const dup = await env.DB.prepare(`SELECT 1 FROM p_amb_proof WHERE act_id = ?1 AND angle_id = ?2 AND ad_id = ?3`).bind(actId, BOARD, adId).first();
    if (dup) continue;
    await env.DB.prepare(`INSERT INTO p_amb_proof (id, act_id, angle_id, kind, ad_id, shown, sort) VALUES (?1, ?2, ?3, 'meta', ?4, 1, ?5)`).bind(rid(), actId, BOARD, adId, ++n).run();
    added.push(adId);
  }
  return added;
}

/* ---------------- public ---------------- */

/** The auto board (amb-004, amb-006): the brand's own Meta VIDEO ads over the last 30 days, ranked by
 *  what the staff chose on the Ambassadors tab (board_sort), top `n`:
 *    orders   Triple Whale orders (last-platform-click, Meta rows), ties broken by sales
 *    revenue  Triple Whale sales
 *    roas     Triple Whale sales / Meta spend, ads with at least $50 spent and 1 order
 *    hook     3-second video views / impressions (stops the scroll), ads with at least 1,000 impressions
 *  Ids and rank only reach the page, never a number. Cached on the brand row for 6 hours so
 *  account-health can authorise exactly these ads for playback (it reads board_json). */
const BOARD_SORTS = new Set(['orders', 'revenue', 'roas', 'hook']);
async function autoBoard(env, b) {
  const fresh = b.board_at && (Date.now() - Date.parse(b.board_at.replace(' ', 'T') + 'Z')) < 6 * 3600e3;
  if (fresh && b.board_json) return safeJson(b.board_json, []);
  const n = Math.min(Math.max(+b.board_n || 20, 4), 50);
  const sort = BOARD_SORTS.has(b.board_sort) ? b.board_sort : 'orders';
  const { results } = await env.DB.prepare(
    `WITH v AS (SELECT ad_id FROM ads WHERE act_id IN ${metaOf(1)} AND media_type = 'video'),
          tw AS (SELECT ad_id, SUM(orders) ord, SUM(revenue) rev FROM tw_ad_attr
                  WHERE act_id = ?1 AND model = 'lastPlatformClick' AND date >= ?2 AND (platform = 'meta' OR platform IS NULL) GROUP BY ad_id),
          m AS (SELECT ad_id, SUM(spend) sp, SUM(impressions) im, SUM(video_3s) v3 FROM ad_daily
                  WHERE act_id IN ${metaOf(1)} AND date >= ?2 GROUP BY ad_id)
     SELECT v.ad_id, COALESCE(tw.ord, 0) ord, COALESCE(tw.rev, 0) rev, COALESCE(m.sp, 0) sp, COALESCE(m.im, 0) im, COALESCE(m.v3, 0) v3
       FROM v LEFT JOIN tw ON tw.ad_id = v.ad_id LEFT JOIN m ON m.ad_id = v.ad_id
      WHERE COALESCE(tw.ord, 0) > 0 OR COALESCE(m.im, 0) > 0`,
  ).bind(b.act_id, addDays(today(), -30)).all().catch(() => ({ results: [] }));
  const rows = results || [];
  const pick = {
    orders: () => rows.filter(r => r.ord > 0).sort((x, y) => y.ord - x.ord || y.rev - x.rev),
    revenue: () => rows.filter(r => r.rev > 0).sort((x, y) => y.rev - x.rev || y.ord - x.ord),
    roas: () => rows.filter(r => r.sp >= 50 && r.ord > 0).sort((x, y) => y.rev / y.sp - x.rev / x.sp),
    hook: () => rows.filter(r => r.im >= 1000).sort((x, y) => y.v3 / y.im - x.v3 / x.im),
  }[sort]();
  const board = pick.slice(0, n).map((r, i) => ({ ad_id: r.ad_id, rank: i + 1 }));
  await env.DB.prepare(`UPDATE p_amb_brand SET board_json = ?2, board_at = datetime('now') WHERE act_id = ?1`)
    .bind(b.act_id, JSON.stringify(board)).run().catch(() => {});
  return board;
}

/** `preview` = a signed-in team member. They see a switched-off page in full, so a
 *  new brand can be reviewed before creators get it (Cole, 2026-09-17, Grunk Dolfer).
 *  Creators (no session) still get "being set up". Same idea as the report preview. */
async function publicPayload(env, slug, preview = false) {
  const b = await env.DB.prepare(`SELECT * FROM p_amb_brand WHERE slug = ?1`).bind(slug).first();
  if (!b) return { status: 404, body: { error: 'We could not find this creator page.' } };
  const acct = await env.DB.prepare(`SELECT name FROM brand_accounts WHERE act_id = ?1`).bind(b.act_id).first();
  if (!b.live && !preview) return { status: 200, body: { live: false, brand: { display_name: b.display_name || acct?.name || '', accent: b.accent, logo_url: b.logo_url } } };
  const { sections, angles, proof } = await loadAll(env, b.act_id);
  // Cole, 2026-10-06: creators make videos, so only VIDEO ads are proof on the link. Statics keep
  // their staff-side scores but never show as "ran as an ad" here.
  const metaIds = [...new Set(proof.filter(p => p.kind === 'meta' && p.ad_id).map(p => p.ad_id))];
  const isImage = new Set();
  for (let i = 0; i < metaIds.length; i += 80) {
    const part = metaIds.slice(i, i + 80);
    const { results } = await env.DB.prepare(`SELECT ad_id, media_type FROM ads WHERE act_id IN ${metaOf(1)} AND ad_id IN (${part.map((_, k) => `?${k + 2}`).join(',')})`).bind(b.act_id, ...part).all().catch(() => ({ results: [] }));
    for (const r of results || []) if (/image|static|photo/i.test(r.media_type || '')) isImage.add(r.ad_id);
  }
  const onSecs = sections.filter(s => s.enabled);
  const secIds = new Set(onSecs.map(s => s.id));
  const liveAngles = angles.filter(a => a.status === 'live' && (secIds.has(a.section_id) || a.hot));
  const proofBy = new Map();
  // Inspiration links that were pulled in as clips (atria clip-to-angle) carry the Atria link in `url`;
  // the page then plays the clip and hides the duplicate link.
  const clipped = new Set(proof.filter(p => p.kind === 'upload' && p.url && p.shown).map(p => p.url));
  for (const p of proof) {
    if (!p.shown) continue;
    if (p.kind === 'inspo' && !b.show_inspo) continue;
    if (p.kind === 'meta' && isImage.has(p.ad_id)) continue;
    const item = { id: p.id, kind: p.kind, who: p.who, note: p.note, url: p.kind === 'upload' ? null : p.url, thumb: p.thumb, source: p.kind === 'upload' && p.url ? p.url : null };
    if (p.kind === 'meta') item.ad_id = p.ad_id;
    if (p.kind === 'upload') item.file = `/api/angles-file/${p.id}`;
    if ((p.kind === 'post' || p.kind === 'typed') && p.views) item.views = p.views;   // views yes, sales never
    (proofBy.get(p.angle_id) || proofBy.set(p.angle_id, []).get(p.angle_id)).push(item);
  }
  const pub = a => {
    const s = shapeAngle(a);
    delete s.lever; delete s.status; delete s.sort; delete s.hot_sort;
    const pr = proofBy.get(a.id) || [];
    s.inspo = (s.inspo || []).filter(x => !(x.url && clipped.has(x.url)));
    return { ...s, proof: pr, ads: pr.filter(p => p.kind === 'meta').length };
  };
  const hot = liveAngles.filter(a => a.hot).sort((x, y) => x.hot_sort - y.hot_sort).map(pub);
  const shownClip = new Set(proof.filter(p => p.shown && p.kind === 'upload').map(p => p.id));
  const hooks = safeJson(b.hooks_json, []).map(h => ({ title: h.title, how: h.how, kind: h.kind || 'shared', url: h.url || null, file: h.clip && shownClip.has(h.clip) ? `/api/angles-file/${h.clip}` : null }));
  const pinned = onSecs.find(s => s.pinned);
  const out = {
    live: true,
    preview: !b.live,
    brand: (() => { const x = shapeBrand(b, acct); delete x.act_id; delete x.live; x.hooks = hooks; return x; })(),
    board: b.board_mode === 'auto' ? await autoBoard(env, b) : null,
    picks: (proofBy.get(BOARD) || []).filter(p => p.kind === 'meta').map(p => ({ id: p.id, kind: 'meta', ad_id: p.ad_id })),   // board picks, in the team's order
    season_chart: (() => { const se = safeJson(b.season_json, null); return se?.mode === 'custom' ? customShape(se.custom) : null; })()
      || await seasonShape(env, b.act_id).catch(() => null),
    hot: pinned ? { id: pinned.id, name: pinned.name, line: pinned.line, icon_svg: cleanSvg(pinned.icon_svg), color: pinned.color, angles: hot } : null,
    sections: onSecs.filter(s => !s.pinned).map(s => ({
      id: s.id, name: s.name, line: s.line, icon_svg: cleanSvg(s.icon_svg), color: s.color,
      angles: liveAngles.filter(a => a.section_id === s.id).map(pub),
    })).filter(s => s.angles.length),
  };
  return { status: 200, body: out };
}

/** Is this ad shown as proof on this brand's live link? Used by the account-health
 *  worker's playback routes too (same rule: the slug authorises its own ads only). */
export async function adOnLiveLink(env, slug, adId) {
  if (!slug || !adId) return false;
  const r = await env.DB.prepare(
    `SELECT 1 FROM p_amb_proof p JOIN p_amb_brand b ON b.act_id = p.act_id
      WHERE b.slug = ?1 AND b.live = 1 AND p.kind = 'meta' AND p.shown = 1 AND p.ad_id = ?2 LIMIT 1`,
  ).bind(slug, adId).first().catch(() => null);
  return !!r;
}

/** Routes that need no sign-in. Returns a Response, or null to fall through. */
export async function handlePublic(request, env, url, path, json, CORS, isStaff = async () => false) {
  let m;
  if ((m = path.match(/^\/api\/angles\/([a-z0-9-]{1,50})$/)) && request.method === 'GET') {
    const signed = request.headers.has('Authorization');
    const r = await publicPayload(env, m[1], signed && await isStaff());
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': signed ? 'private, no-store' : 'public, max-age=30', ...CORS },
    });
  }
  // The preview frame stored beside a clip (same key, .jpg). Public like the clip itself.
  if ((m = path.match(/^\/api\/angles-thumb\/([a-f0-9]{16})$/)) && (request.method === 'GET' || request.method === 'HEAD')) {
    const p = await env.DB.prepare(`SELECT file_key FROM p_amb_proof WHERE id = ?1 AND kind = 'upload' AND shown = 1`).bind(m[1]).first();
    if (!p?.file_key || !env.MEDIA) return json({ error: 'not found' }, 404);
    return serveObject(env, request, p.file_key.replace(/\.[a-z0-9]+$/, '') + '.jpg');
  }
  if ((m = path.match(/^\/api\/angles-file\/([a-f0-9]{16})$/)) && (request.method === 'GET' || request.method === 'HEAD')) {
    const p = await env.DB.prepare(
      `SELECT p.file_key FROM p_amb_proof p JOIN p_amb_brand b ON b.act_id = p.act_id
        WHERE p.id = ?1 AND p.kind = 'upload' AND p.shown = 1 AND b.live = 1`,
    ).bind(m[1]).first();
    if (!p?.file_key || !env.MEDIA) return json({ error: 'not found' }, 404);
    return serveObject(env, request, p.file_key);
  }
  return null;
}

async function serveObject(env, request, key) {
  const range = request.headers.get('Range');
  let opts = {};
  const rm = range && range.match(/bytes=(\d+)-(\d*)/);
  if (rm) opts.range = rm[2] ? { offset: +rm[1], length: +rm[2] - +rm[1] + 1 } : { offset: +rm[1] };
  const obj = await env.MEDIA.get(key, opts);
  if (!obj) return new Response('not found', { status: 404 });
  const h = new Headers({ 'Access-Control-Allow-Origin': '*', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' });
  h.set('Content-Type', obj.httpMetadata?.contentType || 'application/octet-stream');
  if (rm && obj.range) {
    const off = obj.range.offset ?? 0;
    const len = obj.range.length ?? (obj.size - off);
    h.set('Content-Range', `bytes ${off}-${off + len - 1}/${obj.size}`);
    h.set('Content-Length', String(len));
    return new Response(request.method === 'HEAD' ? null : obj.body, { status: 206, headers: h });
  }
  h.set('Content-Length', String(obj.size));
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers: h });
}

/* ---------------- staff ---------------- */

async function mustAccount(env, act) {
  if (!act) throw Object.assign(new Error('act is required'), { status: 400 });
  const a = await env.DB.prepare(`SELECT act_id, name, currency FROM brand_accounts WHERE act_id = ?1`).bind(act).first();
  if (!a) throw Object.assign(new Error('unknown account'), { status: 404 });
  return a;
}

async function staffPayload(env, acct) {
  const all = await loadAll(env, acct.act_id);
  const metaIds = all.proof.filter(p => p.kind === 'meta').map(p => p.ad_id);
  const stats = await adStats(env, acct.act_id, metaIds);
  const proof = all.proof.map(p => ({ ...p, shown: !!p.shown, stats: p.kind === 'meta' ? (stats[p.ad_id] || null) : null }));
  const angles = all.angles.map(a => {
    const mine = proof.filter(p => p.angle_id === a.id && p.kind === 'meta' && p.stats);
    const sum = mine.reduce((t, p) => ({ spend: t.spend + (p.stats.spend || 0), revenue: t.revenue + (p.stats.revenue || 0), running: t.running + ((p.stats.spend30 || 0) > 0 ? 1 : 0) }), { spend: 0, revenue: 0, running: 0 });
    return { ...shapeAngle(a), score: { ads: mine.length, running: sum.running, spend: sum.spend, revenue: sum.revenue, roas: sum.spend > 0 ? sum.revenue / sum.spend : null }, proof_count: proof.filter(p => p.angle_id === a.id).length };
  });
  return {
    account: acct,
    brand: shapeBrand(all.brand, acct),
    sections: all.sections.map(s => ({ ...s, enabled: !!s.enabled, pinned: !!s.pinned })),
    angles, proof,
    has_media: !!env.MEDIA,
  };
}

const DEFAULT_SECTIONS = [
  { name: 'Hot right now', line: 'What we are pushing hardest this week', icon: 'flame', color: '#C2410C', pinned: 1 },
  { name: 'Always works', line: 'Angles that sell every month of the year', icon: 'leaf', color: '#15803D', pinned: 0 },
];

export async function handleStaff(request, env, url, path, json) {
  if (!path.startsWith('/api/amb')) return null;
  const method = request.method;
  const body = method === 'GET' || method === 'DELETE' ? {} : await request.json().catch(() => ({}));
  const act = url.searchParams.get('act') || body.act;
  try {
    // Every brand, for the all-clients view.
    if (path === '/api/amb/overview' && method === 'GET') {
      const { results } = await env.DB.prepare(
        `SELECT a.act_id, a.name, b.slug, b.live, b.submit_url, b.updated_at,
                (SELECT COUNT(*) FROM p_amb_angle x WHERE x.act_id = a.act_id AND x.status = 'live') angles,
                (SELECT COUNT(*) FROM p_amb_proof p WHERE p.act_id = a.act_id AND p.kind = 'meta') tagged
           FROM brand_accounts a LEFT JOIN p_amb_brand b ON b.act_id = a.act_id
          WHERE a.active = 1 AND (a.demo IS NULL OR a.demo = 0) ORDER BY a.name`,
      ).all();
      return json({ brands: (results || []).map(r => ({ ...r, live: !!r.live })) });
    }

    if (path === '/api/amb' && method === 'GET') {
      return json(await staffPayload(env, await mustAccount(env, act)));
    }

    // Set up a brand: creates the brand row with a slug and the two starter sections.
    if (path === '/api/amb/setup' && method === 'POST') {
      const acct = await mustAccount(env, act);
      const have = await env.DB.prepare(`SELECT act_id FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
      if (!have) {
        let slug = String(body.slug || acct.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'brand';
        const clash = await env.DB.prepare(`SELECT 1 FROM p_amb_brand WHERE slug = ?1`).bind(slug).first();
        if (clash) slug = `${slug}-${rid().slice(0, 4)}`;
        await env.DB.prepare(
          `INSERT INTO p_amb_brand (act_id, slug, live, display_name, submit_platform, submit_label) VALUES (?1, ?2, 0, ?3, 'TRYBE', 'Film this on TRYBE')`,
        ).bind(acct.act_id, slug, acct.name).run();
        let i = 0;
        for (const s of DEFAULT_SECTIONS) {
          await env.DB.prepare(
            `INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, pinned, sort) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`,
          ).bind(rid(), acct.act_id, s.name, s.line, s.icon, cleanSvg(body.icons?.[s.icon]), s.color, s.pinned, i++).run();
        }
      }
      return json(await staffPayload(env, acct));
    }

    if (path === '/api/amb/brand' && method === 'PUT') {
      const acct = await mustAccount(env, act);
      const cur = await env.DB.prepare(`SELECT * FROM p_amb_brand WHERE act_id = ?1`).bind(acct.act_id).first();
      if (!cur) return json({ error: 'Set this brand up first.' }, 400);
      const has = k => Object.prototype.hasOwnProperty.call(body, k);
      let slug = cur.slug;
      if (has('slug')) {
        slug = String(body.slug || '').toLowerCase().trim();
        if (!SLUG_RE.test(slug)) return json({ error: 'The address can use lowercase letters, numbers and dashes only.' }, 400);
        const clash = await env.DB.prepare(`SELECT act_id FROM p_amb_brand WHERE slug = ?1 AND act_id != ?2`).bind(slug, acct.act_id).first();
        if (clash) return json({ error: 'Another brand already uses that address.' }, 400);
      }
      if (has('accent') && body.accent && !HEX_RE.test(body.accent)) return json({ error: 'Colour must be a hex value like #D6336C.' }, 400);
      if (has('submit_url') && body.submit_url && !/^https:\/\/\S+$/i.test(body.submit_url)) return json({ error: 'The submit link must start with https://' }, 400);
      if (has('logo_url') && body.logo_url && !/^https:\/\/\S+$/i.test(body.logo_url)) return json({ error: 'The logo link must start with https://' }, 400);
      const v = (k, n, fb) => (has(k) ? clip(body[k], n) : fb);
      await env.DB.prepare(
        `UPDATE p_amb_brand SET slug=?2, live=?3, display_name=?4, intro=?5, about=?6, audience=?7, accent=?8, logo_url=?9,
           submit_platform=?10, submit_url=?11, submit_label=?12, avoid_json=?13, rules_json=?14, season_json=?15,
           show_inspo=?16, pdf_json=?17, guide_json=?18, hooks_json=?19, updated_at=datetime('now') WHERE act_id=?1`,
      ).bind(acct.act_id, slug,
        has('live') ? (body.live ? 1 : 0) : cur.live,
        v('display_name', 80, cur.display_name), v('intro', 1200, cur.intro), v('about', 800, cur.about),
        v('audience', 600, cur.audience), v('accent', 7, cur.accent), v('logo_url', 500, cur.logo_url),
        v('submit_platform', 40, cur.submit_platform), v('submit_url', 500, cur.submit_url), v('submit_label', 60, cur.submit_label),
        has('avoid') ? JSON.stringify((Array.isArray(body.avoid) ? body.avoid : []).map(x => ({ title: clip(x.title, 160), why: clip(x.why, 400) })).filter(x => x.title).slice(0, 12)) : cur.avoid_json,
        has('rules') ? JSON.stringify(arr(body.rules, 12, 300)) : cur.rules_json,
        has('season') ? (body.season ? JSON.stringify({
          title: clip(body.season.title, 80), line: clip(body.season.line, 400), until: clip(body.season.until, 40),
          next: clip(body.season.next, 120), highlight: Array.isArray(body.season.highlight) ? body.season.highlight.slice(0, 2).map(x => clip(x, 10)) : null,
          show_chart: body.season.show_chart !== false,
          color: HEX_RE.test(body.season.color || '') ? body.season.color : null,
          cap: body.season.cap ? Math.min(Math.max(+body.season.cap || 0, 1.2), 10) : null,
          mode: body.season.mode === 'custom' ? 'custom' : 'sales',
          custom: body.season.custom && typeof body.season.custom === 'object'
            ? Object.fromEntries(Object.entries(body.season.custom).filter(([k]) => /^\d{1,2}$/.test(k) && +k >= 1 && +k <= 53).slice(0, 53).map(([k, v]) => [k, Math.max(0, Math.min(100, Math.round(+v) || 0))]))
            : null,
        }) : null) : cur.season_json,
        has('show_inspo') ? (body.show_inspo ? 1 : 0) : cur.show_inspo,
        has('pdf') ? (body.pdf ? JSON.stringify({
          line1: clip(body.pdf.line1, 60), line2: clip(body.pdf.line2, 60), intro: clip(body.pdf.intro, 400),
          cta: clip(body.pdf.cta, 60), note: clip(body.pdf.note, 120), steps: arr(body.pdf.steps, 3, 80),
        }) : null) : cur.pdf_json,
        has('guide') ? JSON.stringify((Array.isArray(body.guide) ? body.guide : []).map(x => ({ title: clip(x.title, 120), text: clip(x.text, 500) })).filter(x => x.title || x.text).slice(0, 14)) : cur.guide_json,
        has('hooks') ? JSON.stringify((Array.isArray(body.hooks) ? body.hooks : []).map(x => ({ title: clip(x.title, 120), how: clip(x.how, 500), kind: x.kind === 'brand' ? 'brand' : 'shared', url: /^https:\/\/\S+$/i.test(x.url || '') ? clip(x.url, 500) : null, clip: /^[a-f0-9]{16}$/.test(x.clip || '') ? x.clip : null })).filter(x => x.title || x.how).slice(0, 40)) : cur.hooks_json,
      ).run();
      if (has('board_mode') || has('board_n') || has('board_sort')) {
        // A changed mode, size or ranking re-ranks on the next page load (board_at cleared).
        await env.DB.prepare(`UPDATE p_amb_brand SET board_mode = ?2, board_n = ?3, board_sort = ?4, board_at = NULL WHERE act_id = ?1`).bind(acct.act_id,
          has('board_mode') ? (body.board_mode === 'auto' ? 'auto' : 'picked') : (cur.board_mode || 'picked'),
          has('board_n') ? Math.min(Math.max(parseInt(body.board_n, 10) || 20, 4), 50) : (cur.board_n || 20),
          has('board_sort') ? (BOARD_SORTS.has(body.board_sort) ? body.board_sort : 'orders') : (cur.board_sort || 'orders')).run();
      }
      return json(await staffPayload(env, acct));
    }

    if (path === '/api/amb/section' && method === 'POST') {
      const acct = await mustAccount(env, act);
      if (!String(body.name || '').trim()) return json({ error: 'Give the section a name.' }, 400);
      if (body.color && !HEX_RE.test(body.color)) return json({ error: 'Colour must be a hex value.' }, 400);
      const svg = body.icon_svg ? cleanSvg(body.icon_svg) : null;
      if (body.icon_svg && !svg) return json({ error: 'That icon could not be used.' }, 400);
      if (body.id) {
        const cur = await env.DB.prepare(`SELECT * FROM p_amb_section WHERE id = ?1 AND act_id = ?2`).bind(body.id, acct.act_id).first();
        if (!cur) return json({ error: 'section not found' }, 404);
        await env.DB.prepare(`UPDATE p_amb_section SET name=?3, line=?4, icon=?5, icon_svg=?6, color=?7, enabled=?8 WHERE id=?1 AND act_id=?2`)
          .bind(body.id, acct.act_id, clip(body.name, 80), clip(body.line, 200),
            'icon' in body ? clip(body.icon, 60) : cur.icon, 'icon_svg' in body ? svg : cur.icon_svg,
            'color' in body ? body.color : cur.color,
            cur.pinned ? 1 : ('enabled' in body ? (body.enabled ? 1 : 0) : cur.enabled)).run();
      } else {
        const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort), 0) + 1 n FROM p_amb_section WHERE act_id = ?1`).bind(acct.act_id).first();
        await env.DB.prepare(`INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, enabled, sort) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
          .bind(rid(), acct.act_id, clip(body.name, 80), clip(body.line, 200), clip(body.icon, 60), svg, body.color || '#475569',
            body.enabled === false ? 0 : 1, mx?.n || 1).run();
      }
      return json(await staffPayload(env, acct));
    }

    if (path === '/api/amb/section' && method === 'DELETE') {
      const acct = await mustAccount(env, act);
      const id = url.searchParams.get('id');
      const cur = await env.DB.prepare(`SELECT * FROM p_amb_section WHERE id = ?1 AND act_id = ?2`).bind(id, acct.act_id).first();
      if (!cur) return json({ error: 'section not found' }, 404);
      if (cur.pinned) return json({ error: 'Hot right now cannot be deleted.' }, 400);
      const n = await env.DB.prepare(`SELECT COUNT(*) n FROM p_amb_angle WHERE section_id = ?1`).bind(id).first();
      if (n?.n) return json({ error: `Move or delete its ${n.n} angle${n.n === 1 ? '' : 's'} first.` }, 400);
      await env.DB.prepare(`DELETE FROM p_amb_section WHERE id = ?1`).bind(id).run();
      return json(await staffPayload(env, acct));
    }

    if (path === '/api/amb/order' && method === 'POST') {
      const acct = await mustAccount(env, act);
      const ids = arr(body.ids, 400, 40);
      const col = body.kind === 'sections' ? ['p_amb_section', 'sort'] : body.kind === 'hot' ? ['p_amb_angle', 'hot_sort'] : body.kind === 'angles' ? ['p_amb_angle', 'sort'] : body.kind === 'proof' ? ['p_amb_proof', 'sort'] : null;
      if (!col) return json({ error: 'unknown order kind' }, 400);
      const stmts = ids.map((id, i) => env.DB.prepare(`UPDATE ${col[0]} SET ${col[1]} = ?1 WHERE id = ?2 AND act_id = ?3`).bind(i + 1, id, acct.act_id));
      // Moving an angle into another section rides along with its new order.
      if (body.kind === 'angles' && body.section_id) {
        for (const id of ids) stmts.push(env.DB.prepare(`UPDATE p_amb_angle SET section_id = ?1 WHERE id = ?2 AND act_id = ?3`).bind(body.section_id, id, acct.act_id));
      }
      if (stmts.length) await env.DB.batch(stmts);
      return json(await staffPayload(env, acct));
    }

    if (path === '/api/amb/angle' && method === 'POST') {
      const acct = await mustAccount(env, act);
      if (!String(body.title || '').trim()) return json({ error: 'Give the angle a title.' }, 400);
      if (body.section_id) {
        const s = await env.DB.prepare(`SELECT id FROM p_amb_section WHERE id = ?1 AND act_id = ?2`).bind(body.section_id, acct.act_id).first();
        if (!s) return json({ error: 'unknown section' }, 400);
      }
      const shots = (Array.isArray(body.shots) ? body.shots : []).map(s => ({ label: clip(s.label, 40), text: clip(s.text, 400) })).filter(s => s.text).slice(0, 6);
      const inspo = (Array.isArray(body.inspo) ? body.inspo : []).map(x => ({ brand: clip(x.brand, 80), what: clip(x.what, 300), url: /^https:\/\/\S+$/i.test(x.url || '') ? clip(x.url, 500) : null })).filter(x => x.brand || x.what).slice(0, 6);
      const vals = [clip(body.section_id, 40), body.hot ? 1 : 0, body.status === 'draft' ? 'draft' : 'live', clip(body.title, 120),
        clip(body.argument, 300), clip(body.who, 400), clip(body.products, 160), clip(body.format, 60), clip(body.lever, 60),
        JSON.stringify(arr(body.openers, 8, 200)), JSON.stringify(shots), clip(body.on_screen, 200),
        clip(body.do_text, 400), clip(body.dont_text, 400), clip(body.trend, 300),
        clip(body.visual_hook, 400), clip(body.rehook, 400), clip(body.why, 400), JSON.stringify(inspo), JSON.stringify(arr(body.alt_hooks, 4, 300))];
      let id = body.id;
      if (id) {
        const cur = await env.DB.prepare(`SELECT id, hot FROM p_amb_angle WHERE id = ?1 AND act_id = ?2`).bind(id, acct.act_id).first();
        if (!cur) return json({ error: 'angle not found' }, 404);
        let hotSort = null;
        if (body.hot && !cur.hot) hotSort = ((await env.DB.prepare(`SELECT COALESCE(MAX(hot_sort),0)+1 n FROM p_amb_angle WHERE act_id = ?1 AND hot = 1`).bind(acct.act_id).first())?.n) || 1;
        await env.DB.prepare(
          `UPDATE p_amb_angle SET section_id=?3, hot=?4, status=?5, title=?6, argument=?7, who=?8, products=?9, format=?10, lever=?11,
             openers_json=?12, shots_json=?13, on_screen=?14, do_text=?15, dont_text=?16, trend=?17,
             visual_hook=?18, rehook=?19, why=?20, inspo_json=?21, alt_hooks_json=?22,
             hot_sort=COALESCE(?23, hot_sort), updated_at=datetime('now') WHERE id=?1 AND act_id=?2`,
        ).bind(id, acct.act_id, ...vals, hotSort).run();
      } else {
        id = rid();
        const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort),0)+1 n, (SELECT COALESCE(MAX(hot_sort),0)+1 FROM p_amb_angle WHERE act_id = ?1 AND hot = 1) h FROM p_amb_angle WHERE act_id = ?1`).bind(acct.act_id).first();
        await env.DB.prepare(
          `INSERT INTO p_amb_angle (id, act_id, section_id, hot, status, title, argument, who, products, format, lever,
             openers_json, shots_json, on_screen, do_text, dont_text, trend, visual_hook, rehook, why, inspo_json, alt_hooks_json, sort, hot_sort)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23,?24)`,
        ).bind(id, acct.act_id, ...vals, mx?.n || 1, mx?.h || 1).run();
      }
      const out = await staffPayload(env, acct);
      return json({ ...out, saved_id: id });
    }

    if (path === '/api/amb/angle' && method === 'DELETE') {
      const acct = await mustAccount(env, act);
      const id = url.searchParams.get('id');
      const files = await env.DB.prepare(`SELECT file_key FROM p_amb_proof WHERE angle_id = ?1 AND act_id = ?2 AND file_key IS NOT NULL`).bind(id, acct.act_id).all();
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM p_amb_proof WHERE angle_id = ?1 AND act_id = ?2`).bind(id, acct.act_id),
        env.DB.prepare(`DELETE FROM p_amb_angle WHERE id = ?1 AND act_id = ?2`).bind(id, acct.act_id),
      ]);
      if (env.MEDIA) for (const f of files.results || []) if (await ownFileKey(env, request, acct.act_id, f.file_key)) await env.MEDIA.delete(f.file_key).catch(() => {});
      return json(await staffPayload(env, acct));
    }

    if (path === '/api/amb/proof' && method === 'POST') {
      const acct = await mustAccount(env, act);
      const kinds = ['meta', 'post', 'typed', 'upload', 'inspo'];
      if (!kinds.includes(body.kind)) return json({ error: 'unknown example type' }, 400);
      const ang = await env.DB.prepare(`SELECT id FROM p_amb_angle WHERE id = ?1 AND act_id = ?2`).bind(body.angle_id, acct.act_id).first();
      if (!ang) return json({ error: 'angle not found' }, 404);
      if (body.url && !/^https:\/\/\S+$/i.test(body.url)) return json({ error: 'Links must start with https://' }, 400);
      if (body.kind === 'meta') {
        const ad = await env.DB.prepare(`SELECT ad_id FROM ads WHERE act_id IN ${metaOf(1)} AND ad_id = ?2`).bind(acct.act_id, body.ad_id).first();
        if (!ad) return json({ error: 'That ad is not in this brand’s account.' }, 400);
        const dup = await env.DB.prepare(`SELECT id FROM p_amb_proof WHERE angle_id = ?1 AND ad_id = ?2`).bind(body.angle_id, body.ad_id).first();
        if (dup && !body.id) return json(await staffPayload(env, acct));
      } else if (body.kind === 'upload') {
        if (!body.file_key && !body.id) return json({ error: 'Upload the file first.' }, 400);
        if (body.file_key && !(await ownFileKey(env, request, acct.act_id, body.file_key))) return json({ error: 'That file is not in this brand’s uploads.' }, 400);
      } else if (!body.url && !body.id) {
        return json({ error: 'Paste a link to the video.' }, 400);
      }
      const views = body.views === '' || body.views == null ? null : Math.max(0, Math.round(+body.views)) || null;
      const sales = body.sales === '' || body.sales == null ? null : Math.max(0, +body.sales) || null;
      if (body.id) {
        await env.DB.prepare(`UPDATE p_amb_proof SET who=?3, views=?4, sales=?5, note=?6, shown=?7, url=COALESCE(?8, url) WHERE id=?1 AND act_id=?2`)
          .bind(body.id, acct.act_id, clip(body.who, 80), views, sales, clip(body.note, 300), body.shown === false ? 0 : 1, clip(body.url, 500)).run();
      } else {
        const mx = await env.DB.prepare(`SELECT COALESCE(MAX(sort),0)+1 n FROM p_amb_proof WHERE angle_id = ?1`).bind(body.angle_id).first();
        await env.DB.prepare(
          `INSERT INTO p_amb_proof (id, act_id, angle_id, kind, ad_id, url, file_key, who, views, sales, note, shown, sort)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,1,?12)`,
        ).bind(rid(), acct.act_id, body.angle_id, body.kind, body.kind === 'meta' ? body.ad_id : null,
          body.kind === 'meta' || body.kind === 'upload' ? null : clip(body.url, 500),
          body.kind === 'upload' ? clip(body.file_key, 200) : null,
          clip(body.who, 80), body.kind === 'inspo' ? null : views, body.kind === 'typed' ? sales : null,
          clip(body.note, 300), mx?.n || 1).run();
      }
      return json(await staffPayload(env, acct));
    }

    if (path === '/api/amb/proof' && method === 'DELETE') {
      const acct = await mustAccount(env, act);
      const id = url.searchParams.get('id');
      const p = await env.DB.prepare(`SELECT file_key FROM p_amb_proof WHERE id = ?1 AND act_id = ?2`).bind(id, acct.act_id).first();
      await env.DB.prepare(`DELETE FROM p_amb_proof WHERE id = ?1 AND act_id = ?2`).bind(id, acct.act_id).run();
      if (p?.file_key && env.MEDIA && await ownFileKey(env, request, acct.act_id, p.file_key)) await env.MEDIA.delete(p.file_key).catch(() => {});
      return json(await staffPayload(env, acct));
    }

    // Raw body upload. The request IS the file; the query carries the brand and type.
    if (path === '/api/amb/upload' && method === 'POST') {
      const acct = await mustAccount(env, act);
      if (!env.MEDIA) return json({ error: 'File storage is not connected yet.' }, 503);
      const type = request.headers.get('Content-Type') || '';
      if (!/^(video|image)\//.test(type)) return json({ error: 'Upload a video or an image.' }, 400);
      const len = +(request.headers.get('Content-Length') || 0);
      if (len > MAX_UPLOAD) return json({ error: 'That file is over 95MB. Trim it or paste a link instead.' }, 413);
      const ext = (type.split('/')[1] || 'bin').replace(/[^a-z0-9]/g, '').slice(0, 5);
      const key = `amb/${await storagePrefix(env, acct.act_id)}/${rid()}.${ext}`;
      await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: type } });
      return json({ file_key: key });
    }

    // Staff preview of an uploaded file (the public route only serves live, shown ones).
    let fm;
    if ((fm = path.match(/^\/api\/amb\/file\/([a-f0-9]{16})$/)) && method === 'GET') {
      const p = await env.DB.prepare(`SELECT file_key FROM p_amb_proof WHERE id = ?1`).bind(fm[1]).first();
      if (!p?.file_key || !env.MEDIA) return json({ error: 'not found' }, 404);
      return serveObject(env, request, p.file_key);
    }

    // The brand's Meta ads, for tagging. Lifetime numbers, biggest sellers first.
    if (path === '/api/amb/ads' && method === 'GET') {
      const acct = await mustAccount(env, act);
      const q = (url.searchParams.get('q') || '').trim();
      const untagged = url.searchParams.get('untagged') === '1';
      const minSpend = Math.max(0, +url.searchParams.get('min_spend') || 0);
      const limit = Math.min(Math.max(+url.searchParams.get('limit') || 30, 1), 100);
      const { results } = await env.DB.prepare(
        `SELECT x.ad_id, x.name, x.status, x.media_type, x.first_spend_date,
                SUM(d.spend) spend, SUM(d.revenue) revenue, SUM(d.purchases) purchases,
                MAX(CASE WHEN d.spend > 0 THEN d.date END) last_spend,
                (SELECT group_concat(p.angle_id) FROM p_amb_proof p WHERE p.ad_id = x.ad_id AND p.kind = 'meta') tagged
           FROM ads x JOIN ad_daily d ON d.act_id = x.act_id AND d.ad_id = x.ad_id
          WHERE x.act_id IN ${metaOf(1)} AND (?2 = '' OR x.name LIKE ?3 OR x.ad_id = ?2)
          GROUP BY x.ad_id HAVING SUM(d.spend) >= ?4 ${untagged ? 'AND tagged IS NULL' : ''}
          ORDER BY revenue DESC LIMIT ?5`,
      ).bind(acct.act_id, q, `%${q}%`, minSpend, limit).all();
      return json({ ads: (results || []).map(r => ({ ...r, roas: r.spend > 0 ? r.revenue / r.spend : null, tagged: r.tagged ? r.tagged.split(',') : [] })) });
    }

    /* BOARD PICKS (2026-10-15, Cole): ads picked straight from the ad account onto the board, no idea needed.
       Stored as p_amb_proof kind 'meta' with angle_id = BOARD (the sentinel), so playback and covers on the
       public link are authorised by the same proof rule as every other video. The picker lists the brand's
       ads with the numbers staff sort by; numbers stay on the staff side. */
    if (path === '/api/amb/board-ads' && method === 'GET') {
      const acct = await mustAccount(env, act);
      const days = [7, 30, 90, 365].includes(+url.searchParams.get('days')) ? +url.searchParams.get('days') : 30;
      const videoOnly = url.searchParams.get('video') !== '0';
      const since = addDays(today(), -days);
      const { results } = await env.DB.prepare(
        `WITH m AS (SELECT ad_id, SUM(spend) spend, SUM(impressions) impr, SUM(link_clicks) clicks, SUM(video_3s) v3,
                           MAX(CASE WHEN spend > 0 THEN date END) last_spend
                      FROM ad_daily WHERE act_id IN ${metaOf(1)} AND date >= ?2 GROUP BY ad_id HAVING SUM(spend) > 0),
              tw AS (SELECT ad_id, SUM(orders) orders, SUM(revenue) sales FROM tw_ad_attr
                      WHERE act_id = ?1 AND model = 'lastPlatformClick' AND date >= ?2 AND (platform = 'meta' OR platform IS NULL) GROUP BY ad_id)
         SELECT x.ad_id, x.name, x.status, x.media_type, m.spend, m.impr, m.clicks, m.v3, m.last_spend,
                COALESCE(tw.orders, 0) orders, COALESCE(tw.sales, 0) sales
           FROM m JOIN ads x ON x.ad_id = m.ad_id AND x.act_id IN ${metaOf(1)} LEFT JOIN tw ON tw.ad_id = m.ad_id
          WHERE (?3 = 0 OR x.media_type = 'video')
          ORDER BY m.spend DESC LIMIT 300`,
      ).bind(acct.act_id, since, videoOnly ? 1 : 0).all().catch(() => ({ results: [] }));
      const on = new Set(((await env.DB.prepare(`SELECT ad_id FROM p_amb_proof WHERE act_id = ?1 AND angle_id = ?2 AND kind = 'meta'`).bind(acct.act_id, BOARD).all()).results || []).map(r => r.ad_id));
      return json({ days, ads: (results || []).map(r => ({
        ad_id: r.ad_id, name: r.name, media_type: r.media_type, last_spend: r.last_spend,
        running: !!r.last_spend && r.last_spend >= addDays(today(), -2),   // ads.status is not synced; spend in the last 2 days = running
        spend: r.spend || 0, orders: r.orders, sales: r.sales,
        ctr: r.impr > 0 ? r.clicks / r.impr : null, hook: r.impr > 0 ? r.v3 / r.impr : null,
        roas: r.spend > 0 ? r.sales / r.spend : null, cpa: r.orders > 0 ? r.spend / r.orders : null,
        on_board: on.has(r.ad_id),
      })) });
    }
    if (path === '/api/amb/board' && method === 'POST') {
      const acct = await mustAccount(env, act);
      const add = (Array.isArray(body.add) ? body.add : []).map(String).filter(x => /^\d{6,25}$/.test(x)).slice(0, 50);
      if (add.length) await addBoardPicks(env, acct.act_id, add);
      const remove = (Array.isArray(body.remove) ? body.remove : []).map(String).filter(x => /^[a-f0-9]{16}$/.test(x));
      for (const id of remove) await env.DB.prepare(`DELETE FROM p_amb_proof WHERE id = ?1 AND act_id = ?2 AND angle_id = ?3`).bind(id, acct.act_id, BOARD).run();
      if (Array.isArray(body.order)) {
        let i = 0;
        for (const id of body.order.map(String).filter(x => /^[a-f0-9]{16}$/.test(x)).slice(0, 100)) await env.DB.prepare(`UPDATE p_amb_proof SET sort = ?3 WHERE id = ?1 AND act_id = ?2 AND angle_id = ?4`).bind(id, acct.act_id, ++i, BOARD).run();
      }
      await env.DB.prepare(`UPDATE p_amb_brand SET updated_at = datetime('now') WHERE act_id = ?1`).bind(acct.act_id).run().catch(() => {});
      return json(await staffPayload(env, acct));
    }

    // What the season chart will look like on the link, for the staff preview.
    if (path === '/api/amb/season' && method === 'GET') {
      const acct = await mustAccount(env, act);
      return json({ chart: await seasonShape(env, acct.act_id) });
    }
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
  return null;
}
