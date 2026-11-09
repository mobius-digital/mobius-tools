/* SITE REVIEWS (2026-11-05). A client walks through a proposed site rebuild page by page, approves each page or
 * asks for changes with a note, then presses "Send my review". Cole gets one Slack DM with the counts and every note.
 *
 * The review document itself is static HTML in the Pages tree: profit/reviews/<brand-slug>/<review-slug>/index.html,
 * with <body data-review-act="brand_x" data-review-slug="site-rebuild"> and review-kit.js, which adds the controls to
 * every <section class="ba">. profit/reviews/index.json lists every review (the agency list reads it). A new brand's
 * review = a new folder + one line in index.json. Nothing here knows about any one brand.
 *
 * Two ways in, mirroring the Your ads page:
 *   - a link with ?t=<token> (no login). The token is minted by the team (POST /api/site-review/link) and opens
 *     exactly one review: /api/site-review/t/<token>[/answer|/send];
 *   - a signed-in client of that brand (or the team): /api/site-review?act=&slug=, /answer, /send. brandguard.js
 *     allows these three for a client and checks `act` is theirs.
 * Team only: GET /api/site-review/list?act=, POST /api/site-review/link, POST /api/site-review/reopen,
 * DELETE /api/site-review/answers (clears a review's answers, for tests).
 *
 * Answers are editable until the review is sent; after that every write is refused until the team reopens it. */

import { laneBlocks } from './lane.js';
export const SITE_REVIEW_SQL = [
  `CREATE TABLE IF NOT EXISTS p_site_review (
    act_id      TEXT NOT NULL,
    slug        TEXT NOT NULL,
    title       TEXT,
    path        TEXT,
    token       TEXT UNIQUE,
    sections_json TEXT,
    overall     TEXT,
    sent_at     TEXT,
    sent_by     TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (act_id, slug)
  )`,
  `CREATE TABLE IF NOT EXISTS p_site_review_answer (
    act_id      TEXT NOT NULL,
    slug        TEXT NOT NULL,
    section     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT '',
    note        TEXT,
    who         TEXT,
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (act_id, slug, section)
  )`,
];
let ensured = false;
async function ensure(env) {
  if (ensured) return;
  for (const sql of SITE_REVIEW_SQL) await env.DB.prepare(sql).run();
  ensured = true;
}

const COLE_SLACK = 'U06C37MDWD7';
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
const SLUG = /^[a-z0-9][a-z0-9-]{0,59}$/;
const SECTION = /^[a-z0-9][a-z0-9-]{0,39}$/;
const BRAND = /^brand_[a-z0-9_]+$/;
const STATUSES = new Set(['', 'approved', 'changes']);
const MAX_SECTIONS = 60;
const nowIso = () => new Date().toISOString();
const clip = (s, n) => String(s ?? '').replace(/—|–/g, ', ').trim().slice(0, n);
const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
/* Slack text: escape the three control characters so a note can never ping a channel or fake a link. */
const sl = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pathOf = p => (typeof p === 'string' && /^reviews\/[a-z0-9-]+\/[a-z0-9-]+\/$/.test(p) ? p : '');
const linkOf = r => r.token && r.path ? `${LOCUS}${r.path}?t=${r.token}` : '';

async function row(env, act, slug) {
  return env.DB.prepare(`SELECT * FROM p_site_review WHERE act_id = ?1 AND slug = ?2`).bind(act, slug).first();
}
async function answers(env, act, slug) {
  const { results } = await env.DB.prepare(`SELECT section, status, note, who, updated_at FROM p_site_review_answer WHERE act_id = ?1 AND slug = ?2 ORDER BY section`).bind(act, slug).all();
  return results || [];
}
async function brandName(env, act) {
  const b = await env.DB.prepare(`SELECT name FROM brands WHERE id = ?1`).bind(act).first().catch(() => null);
  return b?.name || act.replace(/^brand_/, '').replace(/_/g, ' ');
}
/* The row, made on first touch. Title, path and the section list are filled when given and not yet known. */
async function upsert(env, act, slug, more = {}) {
  const now = nowIso();
  await env.DB.prepare(`INSERT INTO p_site_review (act_id, slug, title, path, sections_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
      ON CONFLICT (act_id, slug) DO UPDATE SET title = COALESCE(p_site_review.title, excluded.title), path = COALESCE(p_site_review.path, excluded.path),
        sections_json = CASE WHEN excluded.sections_json IS NOT NULL THEN excluded.sections_json ELSE p_site_review.sections_json END`)
    .bind(act, slug, clip(more.title, 120) || null, pathOf(more.path) || null, sectionsJson(more.sections), now).run();
  return row(env, act, slug);
}
function sectionsJson(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const s of list.slice(0, MAX_SECTIONS)) if (s && SECTION.test(String(s.id || ''))) out.push({ id: String(s.id), title: clip(s.title, 80) || String(s.id) });
  return out.length ? JSON.stringify(out) : null;
}
async function view(env, r, act, slug, team) {
  const out = {
    act_id: act, slug, brand: await brandName(env, act), title: r?.title || null, sent_at: r?.sent_at || null, sent_by: r?.sent_by || null,
    overall: r?.overall || '', sections: safe(r?.sections_json, []), answers: await answers(env, act, slug),
  };
  if (team) { out.link = r ? linkOf(r) : ''; out.path = r?.path || null; }
  return out;
}

async function saveAnswer(env, act, slug, b, who) {
  const r = await row(env, act, slug);
  if (r?.sent_at) return { status: 409, error: 'This review was already sent. Ask Mobius to reopen it if something changed.' };
  const section = String(b.section || '');
  if (!SECTION.test(section)) return { status: 400, error: 'Unknown section.' };
  const status = String(b.status ?? '');
  if (!STATUSES.has(status)) return { status: 400, error: 'Pick Approve or Needs changes.' };
  const known = safe(r?.sections_json, []);
  if (known.length && !known.some(s => s.id === section)) return { status: 400, error: 'Unknown section.' };
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM p_site_review_answer WHERE act_id = ?1 AND slug = ?2`).bind(act, slug).first();
  if (!known.length && (count?.n || 0) >= MAX_SECTIONS) return { status: 400, error: 'Too many sections.' };
  if (!r) await upsert(env, act, slug, b);
  else if (!known.length && b.sections) await upsert(env, act, slug, b);
  await env.DB.prepare(`INSERT INTO p_site_review_answer (act_id, slug, section, status, note, who, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT (act_id, slug, section) DO UPDATE SET status = excluded.status, note = excluded.note, who = excluded.who, updated_at = excluded.updated_at`)
    .bind(act, slug, section, status, clip(b.note, 2000), clip(who, 80) || null, nowIso()).run();
  return { ok: true };
}

async function send(env, act, slug, b, who, slackPost, slackApi) {
  let r = await row(env, act, slug);
  if (r?.sent_at) return { status: 409, error: 'This review was already sent.' };
  r = await upsert(env, act, slug, b);
  const list = await answers(env, act, slug);
  const sections = safe(r.sections_json, []);
  const by = new Map(list.map(a => [a.section, a]));
  const order = sections.length ? sections : list.map(a => ({ id: a.section, title: a.section }));
  const ok = order.filter(s => by.get(s.id)?.status === 'approved').length;
  const ch = order.filter(s => by.get(s.id)?.status === 'changes').length;
  const open = order.length - ok - ch;
  const overall = clip(b.overall, 3000);
  const at = nowIso();
  const name = clip(who, 80) || 'The client';
  await env.DB.prepare(`UPDATE p_site_review SET sent_at = ?3, sent_by = ?4, overall = ?5, updated_at = ?3 WHERE act_id = ?1 AND slug = ?2`).bind(act, slug, at, name, overall).run();
  const brand = await brandName(env, act);
  const line = s => {
    const a = by.get(s.id); const note = a?.note ? `: "${sl(a.note).replace(/\s*\n+\s*/g, ' / ')}"` : '';
    return `${a?.status === 'approved' ? 'Approved' : a?.status === 'changes' ? '*Needs changes*' : 'Not reviewed'}  ${sl(s.title)}${note}`;
  };
  /* 2026-11-09 (the lane format, lane.js): "*CLIENT · Brand*", Cole tagged with the ask and the counts as the why;
     each page's call and note under it (they are the review itself). */
  const head = laneBlocks({ lane: 'CLIENT', brand, who: COLE_SLACK, ask: `Go through ${sl(name)}'s review of ${sl(r.title || slug)}`,
    why: `${ok} approved, ${ch} need${ch === 1 ? 's' : ''} changes${open ? `, ${open} not reviewed` : ''}` });
  const detail = [...order.map(line), ...(overall ? [`Overall: "${sl(overall).replace(/\s*\n+\s*/g, ' / ')}"`] : []), `In Locus: Clients > Requests (${sl(brand)})`].join('\n');
  const text = `${head.text}\n${detail}`;
  const blocks = [head.blocks[0], { type: 'section', text: { type: 'mrkdwn', text: detail.slice(0, 2900) } }];
  /* A DM from the Locus bot: open the conversation first (a bare user id does not reliably land). */
  let slack = true, slack_error = null;
  try {
    const o = await slackApi(env, 'conversations.open', { users: COLE_SLACK });
    if (!o?.ok) throw new Error(`conversations.open: ${o?.error || 'failed'}`);
    await slackPost(env, o.channel.id, text, blocks, { username: 'Locus' });
  } catch (e) { slack = false; slack_error = String(e.message || e).slice(0, 160); }
  return { ok: true, sent_at: at, approved: ok, changes: ch, open, slack, ...(slack_error ? { slack_error } : {}) };
}

/** Returns a Response for a site-review route, or null. */
export async function handleSiteReview(request, env, url, path, json, d) {
  if (!path.startsWith('/api/site-review')) return null;
  await ensure(env);
  const m = request.method;
  const body = async () => (m === 'GET' || m === 'DELETE') ? {} : await request.json().catch(() => ({}));
  const done = r => r.error ? json({ error: r.error }, r.status || 400) : json(r);

  /* ---- by token (no login) ---- */
  const tm = path.match(/^\/api\/site-review\/t\/([a-f0-9]{32})(\/answer|\/send)?$/);
  if (tm) {
    const r = await env.DB.prepare(`SELECT * FROM p_site_review WHERE token = ?1`).bind(tm[1]).first();
    if (!r) return json({ error: 'This link is not valid. Ask your Mobius contact for a new one.' }, 404);
    if (!tm[2] && m === 'GET') return json(await view(env, r, r.act_id, r.slug, false));
    const b = await body();
    if (tm[2] === '/answer' && m === 'PUT') return done(await saveAnswer(env, r.act_id, r.slug, b, b.who));
    if (tm[2] === '/send' && m === 'POST') return done(await send(env, r.act_id, r.slug, b, b.who, d.slackPost, d.slackApi));
    return json({ error: 'not found' }, 404);
  }

  /* ---- signed in: a client of the brand (brandguard checked act) or the team ---- */
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const cs = d.clientScope(request);
  const team = !cs;
  const q = m === 'GET' || m === 'DELETE' ? Object.fromEntries(url.searchParams) : await body();
  const act = String(q.act || '');
  const slug = String(q.slug || '');
  if (!BRAND.test(act)) return json({ error: 'act is required' }, 400);
  if (cs && !cs.brands.includes(act)) return json({ error: 'You do not have access to that brand.' }, 403);
  const whoOf = async () => cs ? (cs.name || cs.email) : ((await d.sessionEmail(env, request)) || 'Mobius');

  if (path === '/api/site-review/list' && m === 'GET') {
    if (!team) return json({ error: 'unauthorized' }, 401);
    const { results } = await env.DB.prepare(`SELECT * FROM p_site_review WHERE act_id = ?1 ORDER BY created_at DESC`).bind(act).all();
    const out = [];
    for (const r of results || []) out.push(await view(env, r, r.act_id, r.slug, true));
    return json({ reviews: out });
  }
  if (!SLUG.test(slug)) return json({ error: 'slug is required' }, 400);
  if (path === '/api/site-review' && m === 'GET') return json(await view(env, await row(env, act, slug), act, slug, team));
  if (path === '/api/site-review/answer' && m === 'PUT') return done(await saveAnswer(env, act, slug, q, await whoOf()));
  if (path === '/api/site-review/send' && m === 'POST') return done(await send(env, act, slug, q, await whoOf(), d.slackPost, d.slackApi));

  if (!team) return json({ error: 'unauthorized' }, 401);
  if (path === '/api/site-review/link' && m === 'POST') {
    if (!pathOf(q.path)) return json({ error: 'path must look like reviews/<brand>/<slug>/' }, 400);
    let r = await upsert(env, act, slug, q);
    if (!r.path) { await env.DB.prepare(`UPDATE p_site_review SET path = ?3 WHERE act_id = ?1 AND slug = ?2`).bind(act, slug, pathOf(q.path)).run(); }
    if (!r.token) {
      const tok = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
      await env.DB.prepare(`UPDATE p_site_review SET token = ?3, updated_at = ?4 WHERE act_id = ?1 AND slug = ?2`).bind(act, slug, tok, nowIso()).run();
    }
    r = await row(env, act, slug);
    return json({ url: linkOf(r) });
  }
  if (path === '/api/site-review/reopen' && m === 'POST') {
    await env.DB.prepare(`UPDATE p_site_review SET sent_at = NULL, sent_by = NULL, updated_at = ?3 WHERE act_id = ?1 AND slug = ?2`).bind(act, slug, nowIso()).run();
    return json({ ok: true });
  }
  if (path === '/api/site-review/answers' && m === 'DELETE') {
    await env.DB.prepare(`DELETE FROM p_site_review_answer WHERE act_id = ?1 AND slug = ?2`).bind(act, slug).run();
    await env.DB.prepare(`UPDATE p_site_review SET sent_at = NULL, sent_by = NULL, overall = NULL, updated_at = ?3 WHERE act_id = ?1 AND slug = ?2`).bind(act, slug, nowIso()).run();
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}
