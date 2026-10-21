/* MAKE: one engine, four exits (2026-10-20).
 *
 * Cole: the Slack ideas bot, Social's "Make ours", the creator boards and the briefs are ONE engine with four exits,
 * and it must work natively in the app; Slack stays a door to the same engine. The engine is ideas.js (runIdeaJob:
 * watch the reference, read the brand brain, write the breakdown and the draft). This file is the app's door to it and
 * the two exits ideas.js cannot own itself (they need actions.js and meetings.js, which import ideas.js):
 *
 *   organic   the draft becomes a tray item on Social > Week (trayOf reads idea_thread) and a Work task
 *             "Film: <title>" for Ravo, due in 5 days, closed on its own when an upload or a post is linked to the idea
 *   creators  a video card on the brand's creator board (ideas.js pushCreator / pushLucky, through pushIdea)
 *   brief     a numbered Production card in the brief format (Angle / Concept / What we are testing / Why), mirrored to
 *             Asana the way every other brief is (meetings.js makeBrief, prodwork.js saveCard), or Locus-only when the
 *             brand has no Asana project or the mirror is off (production.js localBrief)
 *   studio    a Studio batch (ideas.js pushStudio, through pushIdea); Locus opens the batch
 *
 * Routes (team only; a client login is refused):
 *   POST /api/make {act, url?, text?, file?, image?, note?, exit?, slack?, post?}   start a draft (queued; poll GET)
 *   GET  /api/make?id=                                                          the state (ideaState)
 *   POST /api/make/redo {id, note?}                                             redo, with a steer when note is given
 *   POST /api/make/exit {id, exit}                                              send it out one of the four doors
 *   POST /api/make/undo {id}                                                    take the creators exit back (same code as the Slack Undo)
 *   POST /api/make/upload?act=&name=  raw image/* or video/*                    a file for the ask (R2 make/<act>/..)
 *   GET  /make-m/<act>/<file>                                                   public: serves an uploaded file
 * The Slack card's buttons call the same exits: worker.js registers runExit with ideas.js useExits().
 * No em dashes anywhere. */
import { clientScope } from './brandguard.js';
import { ideaRow, ideaState, pushIdea, startMake, steerIdea, redrawCard, APP, undoCreator, undoLucky } from './ideas.js';
import { addAction, ROSTER } from './actions.js';
import { makeBrief } from './meetings.js';
import { localBrief } from './production.js';
import { mirrorOn, saveCard, textToHtml } from './prodwork.js';
import { clip, safeJson } from './research.js';

const SELF = 'https://mobius-account-health.mobius-digital.workers.dev';
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
export const EXITS = ['organic', 'creators', 'brief', 'studio'];
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const plain = (m, status = 400) => Object.assign(new Error(m), { plain: true, status });
const nameOf = email => email ? String(email).split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'the team';
const acctOf = async (env, act) => env.DB.prepare(`SELECT act_id, name, slack_channel FROM brand_accounts WHERE act_id = ?1 AND active = 1`).bind(act).first().catch(() => null);
const plusDays = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/* ---------------- the two exits that live here ---------------- */
/** The draft's working title, from whichever version the model wrote. */
function titleOf(d) {
  const c = d.creator_link || {}, a = d.asana || {}, st = d.studio || {};
  return clip(c.title || a.title || st.name || st.angle || (d.teardown?.summary || '').split(/[.!?]/)[0], 80) || 'Our version';
}
/** Organic post: the idea is already a tray item (socialpost.js trayOf reads idea_thread); this marks it as picked for a
 *  post and makes the film task. The task closes itself when an upload or a post is linked to the idea (socialpost.js). */
export async function exitOrganic(env, row, acct, d, pushed, who) {
  const c = d.creator_link || {}, a = d.asana || {};
  const title = titleOf(d);
  const refs = safeJson(row.refs_json, []) || [];
  const lines = [];
  if (c.argument) lines.push(c.argument);
  if ((c.openers || [])[0]) lines.push(`Hook: ${c.openers[0]}`);
  for (const s of (c.shots || []).slice(0, 4)) lines.push(`${s.label || 'Shot'}: ${s.text}`);
  if (c.on_screen) lines.push(`On screen: ${c.on_screen}`);
  if (!lines.length && a.script) lines.push(a.script);
  if (!lines.length && d.teardown?.summary) lines.push(d.teardown.summary);
  if (refs[0]) lines.push(`Reference: ${refs[0]}`);
  lines.push(`Post it from Social > Week (the draft is on the tray): ${LOCUS}?open=socialweek&act=${encodeURIComponent(acct.act_id)}`);
  const owner = ROSTER.some(r => r.name === 'Ravo') ? 'Ravo' : '';
  const due = plusDays(5);
  const task = await addAction(env, { act: acct.act_id, text: `Film: ${title}`, detail: lines.join('\n'), owner, due, kind: 'team', source: 'manual', source_id: row.id, created_by: who || null, area: 'organic' });
  pushed.organic = { task_id: task.id, url: task.url, title: `Film: ${title}`, owner: task.owner || null, due, at: new Date().toISOString() };
  return { text: `On the tray for Social > Week, and a task "Film: ${title}"${task.owner ? ` for ${task.owner}` : ''}, due ${due}: ${task.url}` };
}
/** Ad brief: a Production card in the brief format, mirrored to Asana like every other brief. pushed.asana_brief keeps
 *  the shape the Slack card and ideaState already read (gid, url, num, name). */
export async function exitBrief(env, row, acct, d, pushed, who, deps) {
  const a = d.asana || {}, c = d.creator_link || {}, st = d.studio || {}, t = d.teardown || {};
  const title = clip(a.title || st.name || c.title, 120);
  if (!title) return { ok: false, text: 'The draft has no brief version yet. Press Redo, or ask for the brief draft first.' };
  const concept = a.script || st.concept || c.argument || t.mechanism || '';
  const lines = [`Angle: ${a.angle || st.angle || ''}`, `Concept: ${concept}`, `What we are testing: ${a.testing || st.testing || ''}`, `Why: ${a.why || st.why || ''}`];
  const ads = (a.ads || st.lines || []).filter(Boolean);
  if (ads.length) lines.push('', 'The ads:', ...ads.map((x, i) => `${i + 1}. ${x}`));
  if (a.creator) lines.push('', `Creator: ${a.creator}`);
  if (a.primary_text) lines.push(`Primary text: ${a.primary_text}`);
  if (a.headline) lines.push(`Headline: ${a.headline}`);
  if (a.offer) lines.push(`Offer: ${a.offer}`);
  const refs = safeJson(row.refs_json, []) || [];
  if (refs.length) lines.push('', `Reference: ${refs.join(' ')}`);
  lines.push(`From ${who || 'the team'}, through Locus Make${row.channel !== APP ? ' (Slack)' : ''}.`);
  const detail = lines.join('\n');
  const kind = a.kind === 'video' ? 'Video' : 'Static';
  const it = { text: title, detail, owner: a.kind === 'video' ? 'Ravo' : 'William', due: '' };
  const doc = safeJson((await env.DB.prepare(`SELECT data_json FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'asana'`).bind(acct.act_id).first().catch(() => null))?.data_json, null);
  const mirror = doc?.project_gid && deps?.asana && await mirrorOn(env).catch(() => false);
  const made = mirror ? await makeBrief(env, deps, acct.act_id, it, null, who || 'Locus') : await localBrief(env, acct.act_id, it, who || 'Locus');
  /* The written page on the card (and, with the mirror on, the same words into the Asana task). */
  await saveCard(env, deps || {}, { id: made.id, brief: { v: 2, html: textToHtml(detail), format: kind, sizes: [] } }, who || 'Locus').catch(e => console.log(`make brief page: ${e.message}`));
  const url = made.url || `${LOCUS}?open=production&act=${encodeURIComponent(acct.act_id)}&card=${made.id}`;
  pushed.asana_brief = { gid: made.gid || null, url, num: made.num, name: `${made.num} - ${title}`, card: made.id, local: !made.gid, at: new Date().toISOString() };
  return { text: made.gid ? `Brief ${made.num} is on the Production board and in ${acct.name}'s Creative Brief column in Asana: ${url}`
    : `Brief ${made.num} is on ${acct.name}'s Production board in Locus${doc?.project_gid ? ' (the Asana mirror is off)' : ' (no Asana project for this brand)'}: ${url}` };
}
/** What ideas.js calls for its Slack buttons (useExits). Creators and Studio never arrive here: pushIdea owns them. */
export async function runExit(env, row, acct, d, pushed, who, exit, deps) {
  if (exit === 'organic') return exitOrganic(env, row, acct, d, pushed, who);
  if (exit === 'brief') return exitBrief(env, row, acct, d, pushed, who, deps);
  return { ok: false, text: 'That exit goes through pushIdea.' };
}
/** The panel's exit button: one call, any of the four doors. */
export async function ideaExit(env, id, exit, who, deps) {
  if (!EXITS.includes(exit)) throw plain('Pick Organic post, Creators, Ad brief or Studio.');
  if (exit === 'creators') return pushIdea(env, id, 'creator_link', who);
  if (exit === 'studio') return pushIdea(env, id, 'studio', who);
  if (exit === 'brief') return pushIdea(env, id, 'asana_brief', who);
  const row = await ideaRow(env, id);
  if (!row) throw plain('That draft is no longer stored.', 404);
  const d = safeJson(row.draft_json, {}) || {};
  if (!row.draft_json) throw plain('The draft is not written yet.');
  const pushed = safeJson(row.pushed_json, {}) || {};
  const acct = await acctOf(env, row.act_id);
  if (!acct) throw plain('That brand is no longer active in Locus.');
  if (pushed.organic) return { ok: true, already: true, text: 'Already on the tray, with its film task.', pushed: pushed.organic };
  const reply = await exitOrganic(env, row, acct, d, pushed, who);
  if (reply?.ok === false) return reply;
  await env.DB.prepare(`UPDATE idea_thread SET pushed_json = ?2, status = 'pushed', updated_at = datetime('now') WHERE id = ?1`).bind(row.id, JSON.stringify(pushed)).run();
  await redrawCard(env, row, acct, reply, who);
  return { ok: true, text: reply.text, pushed: pushed.organic };
}

/* ---------------- files for the ask ---------------- */
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
export async function serveMakeMedia(env, path, request, CORS = {}) {
  const m = /^\/make-m\/(brand_[a-z0-9_]+\/[0-9a-f]{16}\.(?:jpg|png|webp|gif|mp4|mov|webm))$/.exec(path);
  if (!m || !env.MEDIA) return new Response('not found', { status: 404 });
  const range = request.headers.get('Range');
  const rm = /^bytes=(\d+)-(\d*)$/.exec(range || '');
  const key = `make/${m[1]}`;
  const obj = rm ? await env.MEDIA.get(key, { range: rm[2] ? { offset: +rm[1], length: +rm[2] - +rm[1] + 1 } : { offset: +rm[1] } }) : await env.MEDIA.get(key);
  if (!obj) return new Response('not found', { status: 404 });
  const h = { 'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000', 'Accept-Ranges': 'bytes', ...CORS };
  if (rm && obj.range) {
    const start = obj.range.offset || 0, len = obj.range.length ?? (obj.size - start);
    return new Response(obj.body, { status: 206, headers: { ...h, 'Content-Range': `bytes ${start}-${start + len - 1}/${obj.size}`, 'Content-Length': String(len) } });
  }
  return new Response(obj.body, { headers: { ...h, 'Content-Length': String(obj.size) } });
}

/* ---------------- routes ---------------- */
export async function handleMake(request, env, url, path, json, d) {
  if (!path.startsWith('/api/make')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (clientScope(request)) return json({ error: 'Make is run by the Mobius team. Save the post and tell us in Requests.' }, 403);
  const email = await d.sessionEmail(env, request).catch(() => null);
  const who = nameOf(email);
  const m = request.method;
  const ct = (request.headers.get('Content-Type') || '').split(';')[0].toLowerCase();
  const body = m === 'GET' || path === '/api/make/upload' ? {} : await request.json().catch(() => ({}));
  const actOk = v => /^brand_[a-z0-9_]+$/.test(String(v || ''));
  try {
    if (path === '/api/make' && m === 'POST') {
      if (!actOk(body.act)) return json({ error: 'Pick a brand first.' }, 400);
      const file = body.file && typeof body.file === 'object' && new RegExp(`^${SELF}/make-m/${body.act}/`).test(String(body.file.url || '')) ? body.file : null;
      const image = /^https?:\/\//.test(String(body.image || '')) ? clip(body.image, 600) : null;
      const r = await startMake(env, { act: body.act, url: body.url, text: body.text, file, image, note: body.note, who, exit: body.exit, source: body.post ? 'social' : (body.source === 'slack' ? 'app' : clip(body.source, 20) || 'app'), slack: !!body.slack });
      /* Started from a Social post: the post remembers its draft (the Saved tab, "Our version started"). */
      if (body.post) await env.DB.prepare(`UPDATE social_post SET idea_id = ?2, saved = 1 WHERE id = ?1 AND act_id = ?3`).bind(String(body.post), r.id, body.act).run().catch(() => {});
      return json({ ok: true, id: r.id, state: r.state });
    }
    if (path === '/api/make' && m === 'GET') {
      const st = await ideaState(env, String(url.searchParams.get('id') || ''));
      return st ? json({ state: st }) : json({ error: 'That draft is no longer stored.' }, 404);
    }
    if (path === '/api/make/redo' && m === 'POST') return json(await steerIdea(env, String(body.id || ''), body.note, who));
    if (path === '/api/make/exit' && m === 'POST') {
      const r = await ideaExit(env, String(body.id || ''), String(body.exit || ''), who, d);
      return json({ ...r, state: await ideaState(env, String(body.id || '')) }, r.ok === false ? 400 : 200);
    }
    /* Undo the Creators exit: the angle (and its proof or clip) comes off the creator link or the Lucky creator app.
       The other exits are plain rows the person deletes where they landed (the tray, the Production board, Studio). */
    if (path === '/api/make/undo' && m === 'POST') {
      const row = await ideaRow(env, String(body.id || ''));
      if (!row) return json({ error: 'That draft is no longer stored.' }, 404);
      const pushed = safeJson(row.pushed_json, {}) || {};
      const r = pushed.lucky_creators ? await undoLucky(env, row, pushed) : pushed.creator_link ? await undoCreator(env, row, pushed) : { ok: false, text: 'Nothing on the creator board to take back.' };
      if (r.ok !== false) await env.DB.prepare(`UPDATE idea_thread SET pushed_json = ?2, updated_at = datetime('now') WHERE id = ?1`).bind(row.id, JSON.stringify(pushed)).run();
      return json({ ...r, state: await ideaState(env, row.id) }, r.ok === false ? 400 : 200);
    }
    if (path === '/api/make/upload' && m === 'POST') {
      const act = url.searchParams.get('act');
      if (!actOk(act)) return json({ error: 'Pick a brand first.' }, 400);
      if (!env.MEDIA) return json({ error: 'No media bucket on the server.' }, 500);
      const ext = EXT[ct];
      if (!ext) return json({ error: 'Upload a JPEG, PNG, WebP, GIF, MP4, MOV or WebM.' }, 400);
      const buf = await request.arrayBuffer();
      if (!buf.byteLength) return json({ error: 'Empty file.' }, 400);
      if (buf.byteLength > 95 * 1024 * 1024) return json({ error: 'Files up to 95 MB.' }, 400);
      const id = rid();
      const key = `make/${act}/${id}.${ext}`;
      await env.MEDIA.put(key, buf, { httpMetadata: { contentType: ct, cacheControl: 'public, max-age=31536000' } });
      const name = clip(decodeURIComponent(url.searchParams.get('name') || ''), 120) || `${ct.startsWith('video/') ? 'video' : 'picture'}.${ext}`;
      return json({ ok: true, file: { id, name, mimetype: ct, size: buf.byteLength, url: `${SELF}/make-m/${act}/${id}.${ext}`, kind: ct.startsWith('video/') ? 'video' : 'image' } });
    }
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.plain ? e.message : `That did not work: ${clip(e.message, 300)}` }, e.status && e.status < 500 ? e.status : 500);
  }
}
