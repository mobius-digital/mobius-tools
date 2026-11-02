/* LOCUS PAGES (2026-11-02): the brand's own burner TikTok pages, tracked like little agents. Lucky Golf runs three
   slideshow pages that sell clubs through a per-page promo code (PAGE-OFFER, e.g. CHIP-SHIP). Never linked to the brand's
   main account: nothing here posts, nothing goes to Slack, nothing is written to the Change Log.

   A PAGE: name, handle, login email, style, promo code, offer, status (warming / live / banned), start date, notes, and a
   password that is WRITE-ONLY from the UI: stored AES-GCM encrypted (key from SESSION_SECRET), never in a list, only
   returned by GET /api/burners/:id/password (no-store) when someone presses Reveal.
   NUMBERS: one ScrapeCreators call per page (/v3/tiktok/profile/videos, 1 credit) gives the latest posts with views,
   likes and the author's followers. Pulled by the Refresh button, and in the background when the overview opens and a
   page was last pulled 12+ hours ago. A followers snapshot per day gives growth over any range. Covers are copied to R2
   (social.js copyCover) because TikTok's links expire.
   ORDERS: by promo code from the brand's Triple Whale orders_table (discount_code), the same read the Strategist uses
   (stratdata.js twSql). No code yet, or no Triple Whale shop = no orders column, never a guess.
   TESTS: a log apart from the pages: what was tested, on which pages, dates, a result line, a number, and a verdict
   (win / lose / killed; none = still live). The UI shows Live tests and a Leaderboard (wins by number); the rest is
   archived and searchable.

   Tables burner_page, burner_post, burner_snap, burner_test, burner_meta (created on first use; also in schema.sql).
   Team only: a client login never reaches these routes. */
import { clientScope } from './brandguard.js';
import { sc, ttItem, copyCover } from './social.js';
import { twSql } from './stratdata.js';

let F = fetch;
export function useFetch(f) { F = f; }
const SELF = 'https://mobius-account-health.mobius-digital.workers.dev';
const STALE_MS = 12 * 3600e3;
const STATUSES = ['warming', 'live', 'banned'];
const VERDICTS = ['', 'win', 'lose', 'killed'];
const clip = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? t.slice(0, n) : t; };
const safe = (t, d = null) => { try { return t == null ? d : JSON.parse(t); } catch { return d; } };
const rid = p => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
const ymd = d => d.toISOString().slice(0, 10);
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const handleOf = s => clip(String(s || '').replace(/^@+/, '').replace(/^https?:\/\/(www\.)?tiktok\.com\/@/i, '').split(/[/?\s]/)[0], 60);
const codeOf = s => clip(String(s || '').toUpperCase().replace(/[^A-Z0-9_-]/g, ''), 40);
const plain = (msg, status = 400) => Object.assign(new Error(msg), { plain: true, status });

/* The three Lucky pages Cole set up on 2026-11-01. Seeded once (burner_meta 'seeded'), so a deleted page stays deleted. */
const SEED = [
  { id: 'bp_shortgame', name: 'Short Game Daily', handle: 'short.game.daily', email: 'shortgamedaily.lg@gmail.com', style: 'tips' },
  { id: 'bp_gearhonest', name: 'Golf Gear Honest', handle: 'golf.gear.honest', email: 'golfgearhonest.lg@gmail.com', style: 'honest gear breakdowns' },
  { id: 'bp_hottakes', name: 'Golf Hot Takes', handle: 'golf.hot.takes', email: 'golfhottakes.lg@gmail.com', style: 'lists and hot takes' },
];
const SEED_ACT = 'brand_lucky_golf';

let ready = false;
export async function ensureBurners(env) {
  if (ready) return;
  for (const sql of [
    `CREATE TABLE IF NOT EXISTS burner_page (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, name TEXT NOT NULL, handle TEXT, email TEXT, style TEXT,
      code TEXT, offer TEXT, status TEXT NOT NULL DEFAULT 'warming', start_date TEXT, notes TEXT, pw_enc TEXT,
      followers INTEGER, pulled_at TEXT, error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS burner_page_act ON burner_page (act_id)`,
    `CREATE TABLE IF NOT EXISTS burner_post (id TEXT PRIMARY KEY, page_id TEXT NOT NULL, pid TEXT NOT NULL, url TEXT, caption TEXT, fmt TEXT,
      thumb TEXT, thumb_src TEXT, posted_at TEXT, views INTEGER, likes INTEGER, comments INTEGER, shares INTEGER, saves INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS burner_post_page ON burner_post (page_id, posted_at)`,
    `CREATE TABLE IF NOT EXISTS burner_snap (page_id TEXT NOT NULL, day TEXT NOT NULL, followers INTEGER, PRIMARY KEY (page_id, day))`,
    `CREATE TABLE IF NOT EXISTS burner_test (id TEXT PRIMARY KEY, act_id TEXT NOT NULL, what TEXT NOT NULL, pages_json TEXT NOT NULL DEFAULT '[]',
      start_date TEXT, end_date TEXT, result TEXT, metric TEXT, value REAL, verdict TEXT NOT NULL DEFAULT '', notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
    `CREATE INDEX IF NOT EXISTS burner_test_act ON burner_test (act_id)`,
    `CREATE TABLE IF NOT EXISTS burner_meta (k TEXT PRIMARY KEY, v TEXT)`,
  ]) await env.DB.prepare(sql).run();
  if (!(await env.DB.prepare(`SELECT 1 FROM burner_meta WHERE k = 'seeded'`).first())) {
    for (const p of SEED) {
      await env.DB.prepare(`INSERT OR IGNORE INTO burner_page (id, act_id, name, handle, email, style, status, start_date) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'warming', '2026-11-01')`)
        .bind(p.id, SEED_ACT, p.name, p.handle, p.email, p.style).run();
    }
    await env.DB.prepare(`INSERT OR IGNORE INTO burner_meta (k, v) VALUES ('seeded', datetime('now'))`).run();
  }
  ready = true;
}

/* ---------------- the password: AES-GCM, key = SHA-256(SESSION_SECRET + purpose) ---------------- */
const b64 = u8 => btoa(String.fromCharCode(...u8));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function pwKey(env) {
  if (!env.SESSION_SECRET) throw plain('SESSION_SECRET is not set on the server, so a password cannot be stored.', 500);
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.SESSION_SECRET}:locus-burner-pw`));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealPw(env, pw) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await pwKey(env), new TextEncoder().encode(pw)));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function openPw(env, sealed) {
  if (!sealed) return '';
  const [iv, ct] = String(sealed).split('.');
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await pwKey(env), unb64(ct)));
}

/** A page as every list sends it: never the password, only whether one is set. */
const pubPage = p => ({ id: p.id, act: p.act_id, name: p.name, handle: p.handle || '', email: p.email || '', style: p.style || '', code: p.code || '',
  offer: p.offer || '', status: p.status, start_date: p.start_date || '', notes: p.notes || '', has_pw: !!p.pw_enc,
  followers: p.followers, pulled_at: p.pulled_at, error: p.error || null });
const pubPost = r => ({ url: r.url, caption: r.caption || '', fmt: r.fmt, thumb: r.thumb ? `${SELF}/social-m/${r.thumb}` : r.thumb_src, posted_at: r.posted_at,
  views: r.views, likes: r.likes, comments: r.comments, shares: r.shares, saves: r.saves });
const pubTest = t => ({ id: t.id, act: t.act_id, what: t.what, pages: safe(t.pages_json, []), start_date: t.start_date || '', end_date: t.end_date || '',
  result: t.result || '', metric: t.metric || '', value: t.value, verdict: t.verdict || '', notes: t.notes || '', updated_at: t.updated_at });

/* ---------------- pull one page (1 ScrapeCreators credit) ---------------- */
export async function pullPage(env, p) {
  if (!p.handle) throw plain('Add the TikTok handle first.');
  const meter = {};
  try {
    const j = await sc(env, '/v3/tiktok/profile/videos', { handle: p.handle, sort_by: 'latest' }, meter);
    const list = j.aweme_list || [];
    let followers = null, covers = 0;
    for (const a of list) {
      const it = ttItem(a); if (!it) continue;
      if (it.followers != null) followers = Math.max(followers ?? 0, it.followers);
      const id = `${p.id}:${it.pid}`;
      const had = await env.DB.prepare(`SELECT thumb FROM burner_post WHERE id = ?1`).bind(id).first();
      let thumb = had?.thumb || null;
      if (!thumb && it.thumb_src && env.MEDIA && covers < 30) { covers++; thumb = await copyCover(env, id, it.thumb_src); }
      await env.DB.prepare(`INSERT INTO burner_post (id, page_id, pid, url, caption, fmt, thumb, thumb_src, posted_at, views, likes, comments, shares, saves)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(id) DO UPDATE SET views = excluded.views, likes = excluded.likes, comments = excluded.comments, shares = excluded.shares,
          saves = excluded.saves, caption = excluded.caption, thumb = COALESCE(excluded.thumb, thumb), thumb_src = excluded.thumb_src, updated_at = datetime('now')`)
        .bind(id, p.id, it.pid, it.url, it.caption || '', it.fmt, thumb, it.thumb_src, it.posted_at, it.views, it.likes, it.comments, it.shares, it.saves).run();
    }
    /* No posts yet = no author block; the profile call (1 more credit) still has the follower count. */
    if (followers == null) {
      const pj = await sc(env, '/v1/tiktok/profile', { handle: p.handle }, meter).catch(() => null);
      const st = pj?.stats || pj?.statsV2 || pj?.userInfo?.stats || pj?.data?.stats || {};
      const n = +(st.followerCount ?? st.follower_count);
      if (Number.isFinite(n)) followers = n;
    }
    if (followers != null) await env.DB.prepare(`INSERT INTO burner_snap (page_id, day, followers) VALUES (?1, ?2, ?3) ON CONFLICT(page_id, day) DO UPDATE SET followers = excluded.followers`).bind(p.id, ymd(new Date()), followers).run();
    await env.DB.prepare(`UPDATE burner_page SET followers = COALESCE(?2, followers), pulled_at = datetime('now'), error = NULL WHERE id = ?1`).bind(p.id, followers).run();
    return { posts: list.length, followers, credits: meter.credits || 0 };
  } catch (e) {
    await env.DB.prepare(`UPDATE burner_page SET pulled_at = datetime('now'), error = ?2 WHERE id = ?1`).bind(p.id, clip(e.message, 200)).run();
    throw e.plain ? e : plain(clip(e.message, 200));
  }
}

/* ---------------- orders by promo code (Triple Whale) ---------------- */
async function twShop(env, act) {
  return (await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind IN ('tw', 'triplewhale', 'triple_whale') ORDER BY is_primary DESC LIMIT 1`).bind(act).first().catch(() => null))?.external_id || null;
}
export async function ordersByCode(env, act, codes, from, to) {
  const list = [...new Set(codes.map(codeOf).filter(Boolean))];
  if (!list.length) return { byCode: {}, note: 'No promo codes yet.' };
  if (!env.TW_API_KEY) return { byCode: null, note: 'Triple Whale is not connected on this worker.' };
  const shop = await twShop(env, act);
  if (!shop) return { byCode: null, note: 'This brand has no Triple Whale shop in Locus.' };
  const sql = `SELECT upper(trimBoth(dc)) AS code, uniq(order_id) AS orders, sum(order_revenue) AS revenue FROM orders_table ARRAY JOIN splitByChar(',', discount_code) AS dc
    WHERE event_date BETWEEN @startDate AND @endDate AND order_revenue > 0 AND upper(trimBoth(dc)) IN (${list.map(c => `'${c}'`).join(', ')}) GROUP BY code`;
  const r = await twSql(env, { xfetch: (u, o) => F(u, o) }, { shop, sql, from, to }).catch(e => ({ error: e.message }));
  if (r.error) return { byCode: null, note: clip(r.error, 200) };
  const byCode = Object.fromEntries(list.map(c => [c, { orders: 0, revenue: 0 }]));
  for (const row of Array.isArray(r.rows) ? r.rows : []) if (byCode[row.code]) byCode[row.code] = { orders: +row.orders || 0, revenue: +row.revenue || 0 };
  return { byCode, note: null };
}

/* ---------------- the overview: every page over a range ---------------- */
async function overview(env, act, from, to) {
  const pages = (await env.DB.prepare(`SELECT * FROM burner_page WHERE act_id = ?1 ORDER BY created_at, name`).bind(act).all()).results || [];
  const toEnd = `${to}T23:59:59.999Z`;
  const ord = await ordersByCode(env, act, pages.map(p => p.code || ''), from, to);
  const out = [];
  for (const p of pages) {
    const posts = (await env.DB.prepare(`SELECT * FROM burner_post WHERE page_id = ?1 AND posted_at >= ?2 AND posted_at <= ?3 ORDER BY views DESC`).bind(p.id, `${from}T00:00:00Z`, toEnd).all()).results || [];
    const sum = k => posts.reduce((s, x) => s + (x[k] || 0), 0);
    /* Growth = the last snapshot in the range minus the one before it starts (or the first one inside it). */
    const end = await env.DB.prepare(`SELECT followers FROM burner_snap WHERE page_id = ?1 AND day <= ?2 ORDER BY day DESC LIMIT 1`).bind(p.id, to).first();
    const start = (await env.DB.prepare(`SELECT followers FROM burner_snap WHERE page_id = ?1 AND day < ?2 ORDER BY day DESC LIMIT 1`).bind(p.id, from).first())
      || (await env.DB.prepare(`SELECT followers FROM burner_snap WHERE page_id = ?1 AND day >= ?2 AND day <= ?3 ORDER BY day LIMIT 1`).bind(p.id, from, to).first());
    const o = p.code && ord.byCode ? ord.byCode[codeOf(p.code)] : null;
    out.push({ ...pubPage(p), range: { posts: posts.length, views: sum('views'), likes: sum('likes'), comments: sum('comments'), shares: sum('shares'),
      followers_gain: end && start ? end.followers - start.followers : null, orders: o ? o.orders : null, revenue: o ? o.revenue : null,
      visits: null }, best: posts.slice(0, 3).map(pubPost) });
  }
  /* Ranked: orders first (where any page has a code), then views. */
  out.sort((a, b) => (b.range.orders ?? -1) - (a.range.orders ?? -1) || b.range.views - a.range.views);
  const tot = k => out.reduce((s, x) => s + (x.range[k] || 0), 0);
  const anyOrders = out.some(x => x.range.orders != null);
  return { act, from, to, pages: out, orders_note: ord.note,
    funnel: { views: tot('views'), visits: null, orders: anyOrders ? tot('orders') : null, revenue: anyOrders ? tot('revenue') : null } };
}

/* ---------------- routes ---------------- */
const FIELDS = ['name', 'handle', 'email', 'style', 'code', 'offer', 'status', 'start_date', 'notes'];
function pageFields(b) {
  const f = {};
  for (const k of FIELDS) if (b[k] !== undefined) f[k] = k === 'handle' ? handleOf(b[k]) : k === 'code' ? codeOf(b[k]) : clip(b[k], k === 'notes' ? 2000 : 200);
  if (f.status !== undefined && !STATUSES.includes(f.status)) throw plain('Status is warming, live or banned.');
  if (f.start_date && !isYmd(f.start_date)) throw plain('Start date is YYYY-MM-DD.');
  if (f.name !== undefined && !f.name) throw plain('Give the page a name.');
  return f;
}
function testFields(b) {
  const f = {};
  if (b.what !== undefined) { f.what = clip(b.what, 300); if (!f.what) throw plain('Say what was tested.'); }
  if (b.pages !== undefined) f.pages_json = JSON.stringify((Array.isArray(b.pages) ? b.pages : []).map(x => clip(x, 40)).slice(0, 20));
  for (const k of ['start_date', 'end_date']) if (b[k] !== undefined) { f[k] = b[k] ? String(b[k]) : null; if (f[k] && !isYmd(f[k])) throw plain('Dates are YYYY-MM-DD.'); }
  for (const k of ['result', 'metric', 'notes']) if (b[k] !== undefined) f[k] = clip(b[k], k === 'notes' ? 2000 : 300);
  if (b.value !== undefined) f.value = b.value === '' || b.value == null ? null : Number.isFinite(+b.value) ? +b.value : null;
  if (b.verdict !== undefined) { f.verdict = String(b.verdict || ''); if (!VERDICTS.includes(f.verdict)) throw plain('Verdict is win, lose or killed.'); }
  return f;
}
const setSql = f => Object.keys(f).map((k, i) => `${k} = ?${i + 2}`).join(', ');

export async function handleBurners(request, env, url, path, json, { isAdmin, waitUntil }) {
  if (path !== '/api/burners' && !path.startsWith('/api/burners/')) return null;
  if (!(await isAdmin(request, env)) || clientScope(request)) return json({ error: 'unauthorized' }, 401);
  await ensureBurners(env);
  const m = request.method;
  const body = m === 'GET' || m === 'DELETE' ? {} : await request.json().catch(() => ({}));
  const actOf = v => { const a = String(v || ''); if (!/^brand_[a-z0-9_]+$/.test(a)) throw plain('Pick a brand first.'); return a; };
  const pageOf = async id => { const p = await env.DB.prepare(`SELECT * FROM burner_page WHERE id = ?1`).bind(String(id || '')).first(); if (!p) throw plain('That page is gone.', 404); return p; };
  const seg = path.split('/').slice(3);   // ['', ] -> after /api/burners
  try {
    /* ---- tests ---- */
    if (seg[0] === 'tests') {
      if (!seg[1] && m === 'GET') {
        const act = actOf(url.searchParams.get('act'));
        const rows = (await env.DB.prepare(`SELECT * FROM burner_test WHERE act_id = ?1 ORDER BY COALESCE(start_date, created_at) DESC`).bind(act).all()).results || [];
        return json({ tests: rows.map(pubTest) });
      }
      if (!seg[1] && m === 'POST') {
        const act = actOf(body.act), f = testFields({ verdict: '', ...body });
        if (!f.what) throw plain('Say what was tested.');
        const id = rid('bt');
        const keys = Object.keys(f);
        await env.DB.prepare(`INSERT INTO burner_test (id, act_id, ${keys.join(', ')}) VALUES (?1, ?2, ${keys.map((_, i) => `?${i + 3}`).join(', ')})`).bind(id, act, ...keys.map(k => f[k])).run();
        return json({ ok: true, test: pubTest(await env.DB.prepare(`SELECT * FROM burner_test WHERE id = ?1`).bind(id).first()) });
      }
      if (seg[1] && m === 'PUT') {
        const f = testFields(body);
        if (Object.keys(f).length) await env.DB.prepare(`UPDATE burner_test SET ${setSql(f)}, updated_at = datetime('now') WHERE id = ?1`).bind(seg[1], ...Object.values(f)).run();
        const t = await env.DB.prepare(`SELECT * FROM burner_test WHERE id = ?1`).bind(seg[1]).first();
        return t ? json({ ok: true, test: pubTest(t) }) : json({ error: 'That test is gone.' }, 404);
      }
      if (seg[1] && m === 'DELETE') { await env.DB.prepare(`DELETE FROM burner_test WHERE id = ?1`).bind(seg[1]).run(); return json({ ok: true }); }
      return json({ error: 'not found' }, 404);
    }
    /* ---- pages ---- */
    if (!seg[0] && m === 'GET') {
      const act = actOf(url.searchParams.get('act'));
      const today = ymd(new Date());
      const to = isYmd(url.searchParams.get('to')) ? url.searchParams.get('to') : today;
      const from = isYmd(url.searchParams.get('from')) ? url.searchParams.get('from') : ymd(new Date(Date.parse(to) - 6 * 864e5));
      const r = await overview(env, act, from, to);
      /* Stale pages refresh in the background; the next open shows the new numbers. */
      const stale = r.pages.filter(p => p.handle && p.status !== 'banned' && (!p.pulled_at || Date.now() - Date.parse(`${p.pulled_at.replace(' ', 'T')}Z`) > STALE_MS));
      if (stale.length && env.DOWNLOADER_KEY && waitUntil) waitUntil((async () => { for (const p of stale) await pullPage(env, await pageOf(p.id)).catch(() => {}); })());
      return json({ ...r, refreshing: stale.length && env.DOWNLOADER_KEY ? stale.map(p => p.id) : [] });
    }
    if (!seg[0] && m === 'POST') {
      const act = actOf(body.act), f = pageFields({ status: 'warming', ...body });
      if (!f.name) throw plain('Give the page a name.');
      const id = rid('bp');
      const keys = Object.keys(f);
      await env.DB.prepare(`INSERT INTO burner_page (id, act_id, ${keys.join(', ')}) VALUES (?1, ?2, ${keys.map((_, i) => `?${i + 3}`).join(', ')})`).bind(id, act, ...keys.map(k => f[k])).run();
      if (typeof body.password === 'string' && body.password) await env.DB.prepare(`UPDATE burner_page SET pw_enc = ?2 WHERE id = ?1`).bind(id, await sealPw(env, clip(body.password, 200))).run();
      return json({ ok: true, page: pubPage(await pageOf(id)) });
    }
    if (seg[0] && seg[1] === 'password' && m === 'GET') {
      const p = await pageOf(seg[0]);
      const r = json({ password: await openPw(env, p.pw_enc) });
      r.headers.set('Cache-Control', 'no-store');
      return r;
    }
    if (seg[0] && seg[1] === 'refresh' && m === 'POST') {
      const p = await pageOf(seg[0]);
      return json({ ok: true, ...(await pullPage(env, p)), page: pubPage(await pageOf(p.id)) });
    }
    if (seg[0] && !seg[1] && m === 'PUT') {
      const p = await pageOf(seg[0]);
      const f = pageFields(body);
      /* The password: a non-empty string replaces it, clear_password removes it, anything else leaves it alone. */
      if (typeof body.password === 'string' && body.password) f.pw_enc = await sealPw(env, clip(body.password, 200));
      else if (body.clear_password === true) f.pw_enc = null;
      if (f.handle !== undefined && f.handle !== (p.handle || '')) Object.assign(f, { followers: null, pulled_at: null, error: null });
      if (Object.keys(f).length) await env.DB.prepare(`UPDATE burner_page SET ${setSql(f)}, updated_at = datetime('now') WHERE id = ?1`).bind(p.id, ...Object.values(f)).run();
      if (f.handle !== undefined && f.handle !== (p.handle || '')) await env.DB.batch([env.DB.prepare(`DELETE FROM burner_post WHERE page_id = ?1`).bind(p.id), env.DB.prepare(`DELETE FROM burner_snap WHERE page_id = ?1`).bind(p.id)]);
      return json({ ok: true, page: pubPage(await pageOf(p.id)) });
    }
    if (seg[0] && !seg[1] && m === 'DELETE') {
      const p = await pageOf(seg[0]);
      await env.DB.batch([env.DB.prepare(`DELETE FROM burner_post WHERE page_id = ?1`).bind(p.id), env.DB.prepare(`DELETE FROM burner_snap WHERE page_id = ?1`).bind(p.id),
        env.DB.prepare(`DELETE FROM burner_page WHERE id = ?1`).bind(p.id)]);
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    if (e.plain) return json({ error: e.message }, e.status || 400);
    throw e;
  }
}
