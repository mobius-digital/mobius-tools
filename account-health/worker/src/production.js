/* PRODUCTION (2026-10-13 fourth pass). Work > Production in Locus: every ad from brief to live, one card per numbered
 * brief, five columns Brief > Making > Review > Ready > Live.
 *
 * It is a view over p_br_batch (the tests the Brand tab and Ads read), not a new table. The hourly Asana sync
 * (asana-brand.js syncTasks) writes board_stage from the task's section (boardOf), plus assignee_name and due_on. A drag
 * in Locus sets board_stage and moves the Asana task to the matching section (BOARD_SECTION), so both stay in step:
 *   Brief = Creative Brief(s), Making = Creative Studio, Ready = Ready to Launch, Live = Analyze Results.
 * Review has no Asana section in any project: it lives only in Locus and the task stays in Creative Studio. The sync
 * keeps a Locus column until the Asana section itself changes, so a card in Review is not pulled back to Making.
 *
 * Routes (admin, team only; refused for a client scope):
 *   GET  /api/production?act=<brand|all>   {cards, live, brands, team, synced_at}
 *   POST /api/production/move   {id, to}    to = brief | making | review | ready | live; Asana follows; one Slack line
 *   POST /api/production/brief  {act, text, owner, due}  the next numbered brief in Asana + its card (meetings.js makeBrief)
 */
import { boardOf, BOARD_SECTION, ensureBoard } from './asana-brand.js';
import { makeBrief } from './meetings.js';
import { ROSTER } from './actions.js';

export const COLUMNS = ['brief', 'making', 'review', 'ready', 'live'];
const STAGE_OF = { brief: 'idea', making: 'production', review: 'production', ready: 'production', live: 'live' };
const LABEL = { brief: 'Brief', making: 'Making', review: 'Review', ready: 'Ready', live: 'Live' };
const LIVE_SHOWN = 12;
const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const sEsc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const centralToday = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
const nameOfEmail = e => ROSTER.find(r => r.email && r.email === String(e || '').toLowerCase())?.name || String(e || 'Someone').split('@')[0];

/* What kind of ad the card is, for the format chip. A display label read from the title and brief; nothing routes on it. */
export function formatOf(title, brief) {
  const t = `${title || ''} ${String(brief || '').slice(0, 600)}`.toLowerCase();
  if (/\b(ugc|creator|testimonial)\b/.test(t)) return 'UGC';
  if (/\bcarousel\b/.test(t)) return 'Carousel';
  if (/\b(video|vid|reel|hook|hooks|edit|edits|script)\b/.test(t)) return 'Video';
  return 'Static';
}

/** One p_br_batch row as a card. */
export function cardOf(r, brands, today) {
  const board = r.board_stage || boardOf(r.asana_section, r.stage);
  const brand = brands.find(b => b.act_id === r.act_id);
  const due = /^\d{4}-\d{2}-\d{2}$/.test(r.due_on || '') ? r.due_on : '';
  return {
    id: r.id, act_id: r.act_id, brand: brand?.name || r.act_id, num: r.num, title: r.title || '', board,
    format: formatOf(r.title, r.brief_text), assignee: r.assignee_name || '', due,
    late: !!due && due < today && board !== 'live' && board !== 'done',
    asana_url: r.asana_url || null, asset_url: r.asset_url || null, brief_url: r.brief_url || null,
    since: String(r.board_at || r.updated_at || r.created_at || '').slice(0, 10), verdict: r.verdict || null, result: r.asana_result || null,
  };
}

export async function listBoard(env, d, { act = 'all' } = {}) {
  await ensureBoard(env);
  const brands = await d.listBrands(env);
  const today = d.centralDate ? d.centralDate() : centralToday();
  const ids = act !== 'all' ? [act] : brands.map(b => b.act_id);
  if (!ids.length) return { cards: [], live: { shown: 0, total: 0 }, brands: [], team: ROSTER.map(r => r.name), synced_at: null };
  const ph = ids.map((_, i) => `?${i + 1}`).join(', ');
  /* Open cards, and live ones from the last 60 days (the Live column shows the newest few). */
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const rows = (await env.DB.prepare(`SELECT id, act_id, num, title, stage, board_stage, board_at, asana_section, asana_url, asset_url, brief_url, brief_text, assignee_name, due_on, verdict, asana_result, created_at, updated_at
    FROM p_br_batch WHERE act_id IN (${ph}) AND stage != 'done' AND (board_stage IS NULL OR board_stage != 'done') AND (stage != 'live' OR COALESCE(board_at, updated_at) >= ?${ids.length + 1})
    ORDER BY CAST(num AS INTEGER) DESC LIMIT 600`).bind(...ids, since).all()).results || [];
  const cards = rows.map(r => cardOf(r, brands, today)).filter(c => COLUMNS.includes(c.board));
  const live = cards.filter(c => c.board === 'live').sort((a, b) => String(b.since).localeCompare(String(a.since)));
  const out = cards.filter(c => c.board !== 'live').concat(live.slice(0, act === 'all' ? LIVE_SHOWN * 3 : LIVE_SHOWN));
  /* A Ready card made in Studio carries its newest approved ad, so "Launch to Meta" opens the real Launch window. */
  const ready = out.filter(c => c.board === 'ready');
  if (ready.length) {
    const rp = ready.map((_, i) => `?${i + 1}`).join(', ');
    const sa = (await env.DB.prepare(`SELECT b.br_batch_id AS card, a.id FROM p_studio_ad a JOIN p_studio_batch b ON b.id = a.batch_id
      WHERE a.status = 'approved' AND b.br_batch_id IN (${rp}) ORDER BY a.created_at DESC`).bind(...ready.map(c => c.id)).all().catch(() => ({ results: [] }))).results || [];
    for (const c of ready) c.studio_ad = sa.find(x => x.card === c.id)?.id || null;
  }
  const docs = (await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE line_id = '' AND key = 'asana' AND act_id IN (${ph})`).bind(...ids).all().catch(() => ({ results: [] }))).results || [];
  const synced = docs.map(x => safe(x.data_json, {})?.last_sync).filter(Boolean).sort().pop() || null;
  return { cards: out, live: { shown: Math.min(live.length, LIVE_SHOWN), total: live.length }, brands: brands.map(b => ({ act_id: b.act_id, name: b.name })), team: ROSTER.map(r => r.name), synced_at: synced, today };
}

/** A drag: the card's column in Locus, the task's section in Asana (none for Review), one line in the brand's channel. */
export async function moveCard(env, d, { id, to }, who) {
  if (!COLUMNS.includes(to)) throw Object.assign(new Error('Pick a column.'), { status: 400 });
  await ensureBoard(env);
  const r = await env.DB.prepare(`SELECT id, act_id, num, title, stage, board_stage, asana_section, asana_gid, asana_url FROM p_br_batch WHERE id = ?1`).bind(String(id || '')).first();
  if (!r) throw Object.assign(new Error('No such card.'), { status: 404 });
  const from = r.board_stage || boardOf(r.asana_section, r.stage);
  let asana = { moved: false, why: to === 'review' ? 'Review lives only in Locus; the Asana task stays in Creative Studio.' : '' };
  let section = r.asana_section;
  if (to !== 'review' && r.asana_gid) {
    try {
      const doc = safe((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'asana'`).bind(r.act_id).first())?.data_json, null);
      if (!doc?.project_gid) throw new Error('the brand is not connected to Asana');
      const secs = (await d.asana(env, `/projects/${doc.project_gid}/sections?opt_fields=name`)) || [];
      const sec = secs.find(s => BOARD_SECTION[to].test(s.name || ''));
      if (!sec) throw new Error(`no ${LABEL[to]} section in the Asana project`);
      await d.asana(env, `/sections/${sec.gid}/addTask`, { method: 'POST', body: { task: r.asana_gid } });
      section = clean(sec.name, 80); asana = { moved: true, section: sec.name };
    } catch (e) { asana = { moved: false, why: e.message }; }
  } else if (to !== 'review') asana.why = 'This card has no Asana task.';
  /* The Asana section is written only when the move landed there, so a failed move is put right by the next sync. */
  await env.DB.prepare(`UPDATE p_br_batch SET board_stage = ?2, board_at = datetime('now'), stage = ?3, asana_section = ?4, updated_at = datetime('now') WHERE id = ?1`)
    .bind(r.id, to, STAGE_OF[to], asana.moved ? section : r.asana_section).run();
  const brands = await d.listBrands(env);
  const ch = brands.find(b => b.act_id === r.act_id)?.slack_channel;
  let slack = false;
  if (ch && from !== to && d.slackPost) {
    const line = `${sEsc(nameOfEmail(who))} moved *${r.num} - ${sEsc(clean(r.title, 90))}* to ${LABEL[to]}${r.asana_url ? ` · <${r.asana_url}|Asana>` : ''}`;
    try { await d.slackPost(env, ch, line, [{ type: 'section', text: { type: 'mrkdwn', text: line } }], { username: 'Locus' }); slack = true; } catch { /* the move still stands */ }
  }
  return { id: r.id, from, to, asana, slack };
}

export async function handleProduction(request, env, url, path, json, d) {
  if (path !== '/api/production' && !path.startsWith('/api/production/')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (d.clientScope && d.clientScope(request)) return json({ error: 'The team\'s page.' }, 403);
  try {
    if (path === '/api/production' && request.method === 'GET') return json(await listBoard(env, d, { act: url.searchParams.get('act') || 'all' }));
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await request.json().catch(() => ({}));
    const who = (await d.sessionEmail(env, request).catch(() => null)) || 'the team';
    if (path === '/api/production/move') return json({ ok: true, ...(await moveCard(env, d, body, who)) });
    if (path === '/api/production/brief') {
      const act = String(body.act || '');
      if (!(await d.listBrands(env)).some(b => b.act_id === act)) return json({ error: 'Pick the brand.' }, 400);
      const text = clean(body.text, 300);
      if (!text) return json({ error: 'Say what to make.' }, 400);
      const made = await makeBrief(env, d, act, { text, owner: clean(body.owner, 40), due: /^\d{4}-\d{2}-\d{2}$/.test(body.due || '') ? body.due : '' }, null, nameOfEmail(who));
      return json({ ok: true, ...made });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}
