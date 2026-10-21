/* PRODUCTION V2 (2026-10-14, docs/handoffs/production-v2.md; approved mock https://claude.ai/artifact/Tw9a67Zb4qLg5ZgFDApUMj, v9).
 * Everything Asana and Frame still did for ad production, inside Locus:
 *   1. THE BRIEF is ONE WRITTEN PAGE (Cole, after reading the team's real Asana briefs: headings, bold labels, numbered
 *      ads, pictures and links in the flow, not a form). brief_json = {v:2, html, format, sizes}. The html passes the
 *      sanitizer here (a tag allowlist; pictures and videos are <img data-file> / <video data-file> of files uploaded
 *      on the card, the signed src is filled at read time; <span data-ph> is a grey hint that vanishes when typed over;
 *      <span data-ai> marks words the AI wrote). brief_text is the same page as plain text, so Studio, the tagger and
 *      the Strategist keep reading. A new brief starts from a template (new / iteration / resize / blank) seeded with
 *      the card's own ad numbers. "Write it with AI" returns the whole page with the hints filled from the brand brain
 *      and never changes a typed sentence. While the Asana mirror is on, a save writes the page into the task
 *      (html_notes, Asana's tags only) and keeps a hash of what Asana stored, so the hourly sync never overwrites a
 *      Locus brief unless someone really edited it in Asana (then Asana wins and the page is read back from it).
 *      An old card's first open reads its Asana page (html_notes) or the Google Doc once and keeps it as the page.
 *      v1 briefs (the 17-field form, 2026-10-14 morning) convert to a page on read.
 *   2. NOTES AND COMMENTS, one table (p_work_comment). A comment on the card, or a note on one version of a file with a
 *      drawing (pin, box, arrow, pen, mark; shape_json in 0..1 coordinates) and, on a video, the second it was made.
 *      @Name sends that person a Slack DM with the card link. While the mirror is on, a comment is copied to the Asana
 *      task as a story and new Asana comments come back in the hourly sync (pullStories).
 *   3. FILES in R2 (MEDIA, work/<act>/<card>/...): versions of the ad (a new upload stacks as the next version and moves
 *      the card to Review) and inspiration for the brief. Served by a signed link so <img> and <video> work without a
 *      header. Once an ad has been live 60 days, every version but the last is deleted (pruneFiles).
 *   4. APPROVE / ASK FOR CHANGES. Approve moves an ad to Ready and records who; Ask for changes needs a note, moves it
 *      back to Making and DMs the person making it. "Send to the client" flags the card (needs_client = idea | ad); the
 *      client then sees it under "Needs you" and may decide it.
 *   5. THE CLIENT'S PRODUCTION (brand edition): Needs you + Coming up for its own brand, never the team board, names on
 *      the team shown as "Mobius", no Asana links. A client comment posts one line in the brand's internal channel.
 *   6. A REVIEW LINK with no login (/api/review/<token>), for a client who has no Locus login.
 *   7. THE ASANA MIRROR switch (settings.asanaMirror, on unless set false): off stops every Asana write and the sync.
 *   8. PROFILE PHOTOS: the Google sign-in picture (saved at sign-in), Slack's photo as the fallback. */
import { boardOf, ensureBoard } from './asana-brand.js';
import { ROSTER } from './actions.js';
import { brandBrain, SPECIFICITY } from './brain.js';
import { slackIdOf } from './morningcard.js';
import { frameLater } from './framesync.js';

const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const AI_MODEL = 'claude-sonnet-5-5';
const MAX_BYTES = 95 * 1024 * 1024;   // one request body tops out at 100MB: bigger files come in parts (uploadStart / uploadPart / uploadFinish)
const KEEP_DAYS = 60;                  // live this long: only the final version stays
const EMDASH = new RegExp('\\s*' + String.fromCharCode(8212) + '\\s*', 'g');   // the model's dashes become commas (house rule)
const safe = (s, d) => { try { return s == null || s === '' ? d : JSON.parse(s); } catch { return d; } };
const clean = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const keep = (s, n) => String(s ?? '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').trim().slice(0, n);   // keeps line breaks
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
const err = (status, message) => Object.assign(new Error(message), { status });
const firstName = s => clean(s, 40).split(' ')[0];
const nameOfEmail = e => ROSTER.find(r => r.email && r.email === String(e || '').toLowerCase())?.name || String(e || 'Someone').split('@')[0];
const OWNER_EMAIL = 'cole@go-mobius-digital.com';
const isTeamEmail = e => /@go-mobius-digital\.com$/i.test(String(e || '')) || ROSTER.some(r => r.email && r.email === String(e || '').toLowerCase());

/* ================================================================================================================ */
/*  TABLES                                                                                                           */
/* ================================================================================================================ */
let ensured = false;
export async function ensureWork(env) {
  if (ensured) return;
  /* one read says whether every column is there (2026-10-14, Cole: opening a card felt slow); the ALTERs run only when it is not */
  const probe = await env.DB.prepare(`SELECT (SELECT share_token FROM p_br_batch LIMIT 1) a, (SELECT parent_id FROM p_work_comment LIMIT 1) b, (SELECT ad FROM p_work_file LIMIT 1) c, (SELECT board_at FROM p_br_batch LIMIT 1) d`).first().then(() => true).catch(() => false);
  if (probe) { ensured = true; return; }
  await ensureBoard(env);
  for (const c of ['brief_json TEXT', 'brief_at TEXT', 'brief_hash TEXT', 'launch_on TEXT', 'needs_client TEXT', 'client_sent_at TEXT', 'client_due TEXT', 'approved_by TEXT', 'approved_at TEXT', 'share_token TEXT'])
    await env.DB.prepare(`ALTER TABLE p_br_batch ADD COLUMN ${c}`).run().catch(() => {});
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_work_comment (id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, act_id TEXT NOT NULL, author_email TEXT, author_name TEXT,
    author_role TEXT NOT NULL DEFAULT 'team', body TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'comment', file_id TEXT, shape_json TEXT, at_sec REAL, fixed_at TEXT, fixed_by TEXT,
    asana_story_gid TEXT, attachments_json TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_work_comment_batch ON p_work_comment (batch_id, created_at)`).run().catch(() => {});
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS p_work_file (id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, act_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'version', version INTEGER,
    r2_key TEXT NOT NULL, name TEXT, mime TEXT, size INTEGER, by_email TEXT, by_name TEXT, stream_uid TEXT, play_url TEXT, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
  await env.DB.prepare(`CREATE INDEX IF NOT EXISTS p_work_file_batch ON p_work_file (batch_id, kind, version)`).run().catch(() => {});
  await env.DB.prepare(`ALTER TABLE p_work_file ADD COLUMN ad TEXT`).run().catch(() => {});   // 2026-10-14: which ad of the test a version belongs to (48-3)
  await env.DB.prepare(`ALTER TABLE p_work_comment ADD COLUMN parent_id TEXT`).run().catch(() => {});   // 2026-10-14: a reply to a note
  ensured = true;
}

/* ================================================================================================================ */
/*  SETTINGS: the mirror switch, photos                                                                              */
/* ================================================================================================================ */
async function getJson(env, key, dflt) {
  const r = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(key).first().catch(() => null);
  return safe(r?.value, dflt);
}
async function putJson(env, key, v) {
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(key, JSON.stringify(v)).run();
}
/** True unless Cole turned the mirror off (Agency settings > Integrations). */
export async function mirrorOn(env) {
  const v = await getJson(env, 'asanaMirror', null);
  return !(v && v.on === false);
}

/** Saved at Google sign-in (worker.js googleLogin): the person's photo. */
export async function savePhoto(env, email, url) {
  const e = String(email || '').toLowerCase();
  if (!e || !/^https:\/\/[^\s"'<>]+$/.test(String(url || ''))) return;
  const map = (await getJson(env, 'userPhotos', {})) || {};
  if (map[e] === url) return;
  map[e] = url;
  await putJson(env, 'userPhotos', map).catch(() => {});
}
/** {name -> photo url} for the roster: the Google picture, else Slack's (looked up once a week). */
export async function teamPhotos(env, d) {
  const g = (await getJson(env, 'userPhotos', {})) || {};
  const sl = (await getJson(env, 'slackPhotos', {})) || {};
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const out = {};
  let changed = false;
  for (const r of ROSTER) {
    if (r.email && g[r.email]) { out[r.name] = g[r.email]; continue; }
    const hit = sl[r.name];
    if (hit && hit.at > week) { if (hit.url) out[r.name] = hit.url; continue; }
    let url = '';
    try {
      const id = d && d.slackApi ? await slackIdOf(env, d, r.name) : null;
      if (id) { const u = await d.slackApi(env, 'users.info', { user: id }).catch(() => null); const p = u && u.ok && u.user && u.user.profile; url = p ? (p.image_192 || p.image_72 || '') : ''; }
    } catch { /* no photo */ }
    sl[r.name] = { url, at: new Date().toISOString() }; changed = true;
    if (url) out[r.name] = url;
  }
  if (changed) await putJson(env, 'slackPhotos', sl).catch(() => {});
  return out;
}

/* ================================================================================================================ */
/*  THE BRIEF                                                                                                        */
/* ================================================================================================================ */
export const KINDS = ['new', 'iter', 'resize', 'free'];
export const FORMATS = ['Static', 'Video', 'UGC', 'Carousel'];
export const SIZES = ['1:1', '4:5', '9:16', '1.91:1', '15s cut', '6s cut'];
const CHANGES = ['Hook', 'Visual', 'Copy', 'CTA', 'Format'];
/* The row table per format: key, label in the brief text. Static keeps one row per extra ad in the test. */
export const ROWCOLS = {
  Static: [['headline', 'Headline'], ['visual', 'Visual']],
  Video: [['vo', 'VO'], ['text', 'On screen'], ['shot', 'Shot'], ['sec', 'Sec']],
  UGC: [['show', 'Show'], ['say', 'Say']],
  Carousel: [['headline', 'Headline'], ['visual', 'Visual']],
};
const ROWKEYS = ['vo', 'text', 'shot', 'sec', 'show', 'say', 'headline', 'visual'];
/* The single-line fields, in the order the brief text prints them. */
const FIELDS = [
  ['angle', 'Angle'], ['why', 'Why'], ['concept', 'Concept'], ['testing', "What we're testing"],
  ['headline', 'Headline'], ['subhead', 'Subhead'], ['cta', 'CTA'], ['layout', 'Layout and visual'],
  ['length', 'Length'], ['music', 'Music'], ['creator', 'Creator'], ['dos', 'Do'], ['donts', "Don't"], ['endcta', 'End card CTA'],
  ['free', "What's needed"], ['copy', 'Post copy'], ['notes', 'Other notes'],
];
const FIELD_MAX = { concept: 1500, free: 4000, copy: 2000, notes: 4000, layout: 1500 };

function normInsp(list) {
  return (Array.isArray(list) ? list : []).slice(0, 8).map(x => {
    if (!x || typeof x !== 'object') return null;
    if (x.type === 'file' && /^[a-f0-9]{16}$/.test(String(x.id || ''))) return { type: 'file', id: x.id, name: clean(x.name, 120), mime: clean(x.mime, 60) };
    const url = clean(x.url, 1000);
    return /^https?:\/\/\S+$/.test(url) ? { type: 'link', url, name: clean(x.name, 120) || url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60), thumb: /^https:\/\/\S+$/.test(String(x.thumb || '')) ? clean(x.thumb, 1000) : '' } : null;
  }).filter(Boolean);
}
/** v1 (the form of 2026-10-14 morning): known keys only, capped lengths. Only old briefs still have this shape. */
function normBriefV1(b) {
  b = b && typeof b === 'object' ? b : {};
  const out = { v: 1, kind: KINDS.includes(b.kind) ? b.kind : 'new', format: FORMATS.includes(b.format) ? b.format : 'Static' };
  for (const [k] of FIELDS) { const v = keep(b[k], FIELD_MAX[k] || 600); if (v) out[k] = v; }
  const hooks = (Array.isArray(b.hooks) ? b.hooks : []).slice(0, 3).map(h => clean(h, 200));
  if (hooks.some(Boolean)) out.hooks = hooks;
  const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 20).map(r => {
    const o = {};
    for (const k of ROWKEYS) { const v = keep(r && r[k], k === 'sec' ? 10 : 600); if (v) o[k] = v; }
    const insp = normInsp(r && r.insp); if (insp.length) o.insp = insp;
    return o;
  });
  while (rows.length && !Object.keys(rows[rows.length - 1]).length) rows.pop();
  if (rows.length) out.rows = rows;
  const sizes = (Array.isArray(b.sizes) ? b.sizes : []).filter(s => SIZES.includes(s));
  if (sizes.length) out.sizes = [...new Set(sizes)];
  const insp = normInsp(b.insp); if (insp.length) out.insp = insp;
  if (b.iter && typeof b.iter === 'object') {
    const it = { of: clean(b.iter.of, 12).replace(/[^\d]/g, ''), change: CHANGES.includes(b.iter.change) ? b.iter.change : '', value: keep(b.iter.value, 600) };
    if (it.of || it.change || it.value) out.iter = it;
  }
  if (b.resize && typeof b.resize === 'object') {
    const rz = { of: clean(b.resize.of, 12).replace(/[^\d]/g, ''), note: keep(b.resize.note, 1000) };
    if (rz.of || rz.note) out.resize = rz;
  }
  const ai = (Array.isArray(b.ai) ? b.ai : []).filter(x => typeof x === 'string' && x.length < 40);
  if (ai.length) out.ai = [...new Set(ai)];
  return out;
}
const KIND_LABEL = { new: 'New idea', iter: 'Iteration', resize: 'Resize or cut', free: 'Something else' };
const fileLabel = (x, files) => x.type === 'link' ? x.url : `${x.name || (files && files[x.id]?.name) || 'a file'} (uploaded in Locus)`;

/** A v1 brief as plain text with one label per line (only used to turn an old form brief into a page). */
function briefTextV1(b) {
  b = normBriefV1(b);
  const L = [`Kind: ${KIND_LABEL[b.kind]} · Format: ${b.format}`];
  const put = (label, v) => { if (v) L.push(`${label}: ${v}`); };
  if (b.kind === 'iter' && b.iter) L.push(`Iterating on: #${b.iter.of || '?'}${b.iter.change ? `, change the ${b.iter.change.toLowerCase()}` : ''}${b.iter.value ? `: ${b.iter.value}` : ''}`);
  if (b.kind === 'resize' && b.resize) put('Resize of', b.resize.of ? `#${b.resize.of}` : '');
  for (const [k, label] of FIELDS.slice(0, 4)) put(label, b[k]);
  (b.hooks || []).forEach((h, i) => put(`Hook ${'ABC'[i]}`, h));
  for (const [k, label] of FIELDS.slice(4, 14)) put(label, b[k]);
  if (b.rows) {
    const cols = ROWCOLS[b.format] || ROWCOLS.Static;
    L.push(b.format === 'Video' ? 'Script:' : b.format === 'UGC' ? 'Scenes:' : b.format === 'Carousel' ? 'Cards:' : 'The ads:');
    b.rows.forEach((r, i) => {
      const bits = cols.map(([k, lab]) => r[k] ? (k === 'sec' ? `${r[k]}s` : `${lab}: ${r[k]}`) : '').filter(Boolean);
      const insp = (r.insp || []).map(x => fileLabel(x)).join(', ');
      L.push(`${i + 1}. ${bits.join(' | ')}${insp ? ` | Inspiration: ${insp}` : ''}`);
    });
  }
  if (b.kind === 'resize' && b.resize?.note) put('Note', b.resize.note);
  put('Sizes', (b.sizes || []).join(', '));
  put('Inspiration', (b.insp || []).map(x => fileLabel(x)).join(', '));
  for (const [k, label] of FIELDS.slice(14)) put(label, b[k]);
  return L.join('\n');
}
const linkify = s => esc(s).replace(/https?:\/\/[^\s|,<]+/g, u => `<a href="${u}">${u}</a>`);

/** Back from text to fields: our own brief text, the old Asana template or a Google Doc. What no label claims is kept
 *  in Other notes, so nothing is lost. */
export function fieldsFromText(text, base = {}) {
  const b = { ...normBriefV1(base) };
  const LABEL = new Map([...FIELDS.map(([k, l]) => [l.toLowerCase(), k]), ['primary text', 'copy'], ['headline', 'headline'], ['inspo', 'insp'], ['inspiration', 'insp'], ['sizes', 'sizes'], ['script', 'script'],
    ['offer', 'notes'], ['landing page', 'notes'], ['what to make', 'free'], ['kind', 'kind'], ['note', 'note'], ['layout', 'layout']]);
  const rest = [];
  const rows = [];
  const cols = ROWCOLS[b.format] || ROWCOLS.Static;
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line || /^(written in locus|added in locus|from the ".*" call|the test|copy|video)\b/i.test(line) || /^what changes, and on which ad/i.test(line)) continue;
    const kf = /^kind:\s*(.+?)\s*·\s*format:\s*(\w+)/i.exec(line);
    if (kf) { const k = Object.entries(KIND_LABEL).find(([, v]) => v.toLowerCase() === kf[1].toLowerCase()); if (k) b.kind = k[0]; if (FORMATS.includes(kf[2])) b.format = kf[2]; continue; }
    const hook = /^hook\s+([abc]):\s*(.*)$/i.exec(line);
    if (hook) { (b.hooks ||= ['', '', ''])['abc'.indexOf(hook[1].toLowerCase())] = clean(hook[2], 200); continue; }
    const it = /^iterating on:\s*#?(\d+)(?:,\s*change the (\w+))?(?::\s*(.*))?$/i.exec(line);
    if (it) { b.kind = 'iter'; b.iter = { of: it[1], change: CHANGES.find(c => c.toLowerCase() === String(it[2] || '').toLowerCase()) || '', value: it[3] || '' }; continue; }
    const rz = /^resize of:\s*#?(\d+)/i.exec(line);
    if (rz) { b.kind = 'resize'; b.resize = { ...(b.resize || {}), of: rz[1] }; continue; }
    const num = /^(\d{1,2})[.)]\s*(.*)$/.exec(line);
    if (num) {
      const body = num[2];
      if (!body) continue;
      const r = {};
      const parts = body.split(/\s+\|\s+/);
      let any = false;
      for (const p of parts) {
        const m = /^([^:]{1,20}):\s*(.*)$/.exec(p);
        const col = m && Object.entries(ROWCOLS).flatMap(([, c]) => c).find(([, lab]) => lab.toLowerCase() === m[1].toLowerCase());
        if (col) { r[col[0]] = m[2]; any = true; continue; }
        if (m && /^inspiration$/i.test(m[1])) { r.insp = m[2].split(/,\s*/).filter(u => /^https?:\/\//.test(u)).map(url => ({ type: 'link', url })); continue; }
        if (/^\d{1,3}s$/.test(p)) { r.sec = p.replace('s', ''); any = true; continue; }
      }
      if (!any) r[cols[0][0]] = body;
      rows.push(r);
      continue;
    }
    const m = /^([A-Za-z' ]{2,24}):\s*(.*)$/.exec(line);
    const key = m && LABEL.get(m[1].toLowerCase());
    if (key) {
      const v = m[2].trim();
      if (!v) continue;
      if (key === 'insp') { b.insp = [...(b.insp || []), ...v.split(/[\s,]+/).filter(u => /^https?:\/\//.test(u)).map(url => ({ type: 'link', url }))]; continue; }
      if (key === 'sizes') { b.sizes = v.split(/,\s*/).filter(s => SIZES.includes(s)); continue; }
      if (key === 'script') { rows.push({ [b.format === 'UGC' ? 'say' : 'vo']: v }); continue; }
      if (key === 'kind') continue;
      if (key === 'note') { b.resize = { ...(b.resize || {}), note: v }; continue; }
      if (key === 'notes') { rest.push(line); continue; }
      b[key] = b[key] ? `${b[key]}\n${v}` : v;
      continue;
    }
    rest.push(line);
  }
  if (rows.length) b.rows = rows;
  if (rest.length) b.notes = [b.notes, rest.join('\n')].filter(Boolean).join('\n');
  return normBriefV1(b);
}
const hash = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s || '').replace(/\s+/g, ' ').trim())))].slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
export { hash as briefHash };

/* ================================================================================================================ */
/*  THE BRIEF v2: one written page (html). The v1 form helpers above only convert old briefs.                        */
/* ================================================================================================================ */
const HTML_MAX = 80000;
const ALLOWED = new Set(['p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre', 'blockquote', 'ol', 'ul', 'li', 'a', 'h1', 'h2', 'h3', 'hr', 'img', 'video', 'span']);
const ALIAS = { b: 'strong', i: 'em', strike: 's', del: 's', div: 'p', h4: 'h3', h5: 'h3', h6: 'h3', section: 'p', article: 'p' };
const VOID = new Set(['br', 'hr', 'img']);
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'head', 'title', 'template', 'iframe', 'object', 'noscript', 'svg', 'math']);
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: String.fromCharCode(8212), ndash: String.fromCharCode(8211), rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™' };
export const decodeEnt = s => String(s ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m; }
  return ENT[e.toLowerCase()] ?? m;
});
const attrOf = (attrs, name) => { const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(attrs || ''); return m ? decodeEnt(m[1] ?? m[2] ?? m[3] ?? '') : null; };
const hasAttr = (attrs, name) => new RegExp(`(?:^|\\s)${name}(?=\\s|=|$)`, 'i').test(attrs || '');
const safeHref = u => /^(https?:\/\/|mailto:)\S+$/i.test(u || '') ? u : null;

/** Every page that comes in passes here: the tag allowlist, href / data-file / data-ph / data-ai only, no src kept
 *  (filled from the file at read time), unclosed tags closed, stray closers dropped, capped at HTML_MAX. */
export function sanitizeHtml(html) {
  let out = '';
  const stack = [];
  let skip = 0;
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+|</g;
  let m;
  const src = String(html || '').slice(0, HTML_MAX * 2);
  while ((m = re.exec(src))) {
    const tok = m[0];
    if (tok.startsWith('<!--')) continue;
    if (!m[1]) {
      if (skip) continue;
      const txt = tok === '<' ? '&lt;' : tok.replace(/&(?!(#x[0-9a-f]+|#\d+|[a-z]+);)/gi, '&amp;').replace(/\r?\n/g, ' ').replace(/​/g, '');
      /* A typed web address becomes a link (2026-10-14, Cole: "why can't links be clicked in the briefs?"); one already
         inside a link is left alone. Trailing punctuation stays outside the link. */
      out += stack.includes('a') ? txt : txt.replace(/https?:\/\/[^\s<>"']+/g, u => { const t = (u.match(/[.,;:!?)\]]+$/) || [''])[0]; const h = t ? u.slice(0, -t.length) : u; return `<a href="${h.replace(/"/g, '&quot;')}">${h}</a>${t}`; });
      continue;
    }
    const closing = tok[1] === '/';
    const raw = m[1].toLowerCase();
    if (DROP_WITH_CONTENT.has(raw)) { skip = Math.max(0, skip + (closing ? -1 : 1)); continue; }
    if (skip) continue;
    const name = ALIAS[raw] || raw;
    if (!ALLOWED.has(name)) continue;   // unknown tag: its words stay
    const attrs = m[2] || '';
    if (closing) {
      if (VOID.has(name)) continue;
      const at = stack.lastIndexOf(name);
      if (at < 0) continue;
      while (stack.length > at) out += `</${stack.pop()}>`;
      continue;
    }
    if (name === 'span') {
      const ph = hasAttr(attrs, 'data-ph'), ai = hasAttr(attrs, 'data-ai');
      if (!ph && !ai) continue;
      out += `<span ${ph ? 'data-ph' : 'data-ai'}>`; stack.push('span'); continue;
    }
    if (name === 'a') { const h = safeHref(attrOf(attrs, 'href')); if (!h) continue; out += `<a href="${esc(h)}">`; stack.push('a'); continue; }
    if (name === 'img' || name === 'video') {
      const fid = attrOf(attrs, 'data-file');
      if (/^[a-f0-9]{16}$/.test(fid || '')) { out += name === 'img' ? `<img data-file="${fid}">` : `<video data-file="${fid}" controls></video>`; continue; }
      const s = attrOf(attrs, 'src');
      if (name === 'img' && /^https:\/\/\S+$/.test(s || '') && !/^https:\/\/[^/]*(go-mobius-digital\.com|workers\.dev)\//i.test(s)) out += `<img src="${esc(s)}">`;
      continue;   // a video with no file, or a data: picture, is dropped
    }
    if (VOID.has(name)) { out += `<${name}>`; continue; }
    /* a block inside an inline run: close inlines first (contenteditable leaves <strong><p>...</p></strong> at times) */
    if (BLOCKS.has(name) && name !== 'li') while (stack.length && !['ol', 'ul', 'blockquote', 'li'].includes(stack[stack.length - 1])) out += `</${stack.pop()}>`;
    if (name === 'li') while (stack.length && stack[stack.length - 1] !== 'ol' && stack[stack.length - 1] !== 'ul') out += `</${stack.pop()}>`;
    out += `<${name}>`; stack.push(name);
  }
  while (stack.length) out += `</${stack.pop()}>`;
  out = out.replace(/<p>\s*<\/p>/g, '<p><br></p>').replace(/(<p><br><\/p>\s*){3,}/g, '<p><br></p><p><br></p>').replace(/([^>\s])\s*<br>\s*(?=<\/(p|li|h[123]|blockquote)>)/g, '$1');
  out = out.replace(/\s*<span data-ph>\s*<\/span>/g, '').replace(/<span data-ai>\s*<\/span>/g, '');
  out = splitLabels(out);
  return out.trim().slice(0, HTML_MAX);
}
/** True when the page has no words of its own (only hints, blank lines). */
/** A page with nobody's words on it counts as blank, so the sheet starts from the Locus template with its grey hints
 *  (2026-10-14, Cole: "I thought you were going to put actual placeholder text, greyed out, but it's actual text"): no
 *  text at all, or only the Asana template untouched (headings, bold labels, the grey example line, the "Added in
 *  Locus" / "From the call" line, numbered label stubs). */
export function templateOnly(html) {
  const left = String(html || '')
    .replace(/<h[1-3]>[\s\S]*?<\/h[1-3]>/gi, ' ')
    .replace(/<strong>[\s\S]*?<\/strong>/gi, ' ')
    .replace(/<span data-ph>[\s\S]*?<\/span>/gi, ' ')
    .replace(/<em>([\s\S]*?)<\/em>/gi, (m, t) => /^(From the |Added in Locus)/.test(t) || ASANA_HINTS.some(r => r.test(decodeEnt(t).trim())) ? ' ' : m);
  return !htmlToText(left).replace(/[\s:.\d\u00b7-]+/g, '');
}
export const htmlBlank = html => !htmlToText(html).trim() || templateOnly(html);

/** The page as plain text (brief_text, the hash, the Strategist, Studio): block tags break lines, lists number
 *  themselves, hints are left out, pictures become "[picture]", links keep their address. */
export function htmlToText(html) {
  let out = '';
  const counters = [];
  let ph = 0;
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+/g;
  let m;
  const nl = () => { if (out && !out.endsWith('\n')) out += '\n'; };
  while ((m = re.exec(String(html || '')))) {
    const tok = m[0];
    if (tok.startsWith('<!--')) continue;
    if (!m[1]) { if (!ph) out += decodeEnt(tok).replace(/ /g, ' '); continue; }
    const name = m[1].toLowerCase(), closing = tok[1] === '/', attrs = m[2] || '';
    if (name === 'span') { if (hasAttr(attrs, 'data-ph')) ph++; else if (closing && ph) ph--; continue; }
    if (name === 'br' || name === 'hr') { out += '\n'; continue; }
    if (name === 'img') { out += '[picture]'; continue; }
    if (name === 'video') { if (!closing) out += '[video]'; continue; }
    if (name === 'ol' || name === 'ul') { if (closing) counters.pop(); else counters.push(name === 'ol' ? 1 : 0); nl(); continue; }
    if (name === 'li') { if (closing) out += '\n'; else { nl(); const c = counters[counters.length - 1]; out += c ? `${counters[counters.length - 1]++}. ` : '- '; } continue; }
    if (BLOCKS.has(name)) { if (closing) out += '\n'; else nl(); continue; }
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The page in Asana's html_notes: Asana's tags only (strong em u s code pre blockquote ol ul li a h1 h2 hr), newlines
 *  for paragraphs, pictures as a link to the card, hints left out, valid XML. The first line says where to edit it. */
export function briefHtml(b, cardUrl, files = {}) {
  const n = normBrief(b);
  const page = n.v === 2 ? n.html : v1ToHtml(n);
  let out = '';
  let ph = 0;
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+/g;
  let m;
  const x = s => esc(decodeEnt(s).replace(/ /g, ' ')).replace(EMDASH, ', ');
  while ((m = re.exec(String(page || '')))) {
    const tok = m[0];
    if (tok.startsWith('<!--')) continue;
    if (!m[1]) { if (!ph) out += x(tok); continue; }
    const name = m[1].toLowerCase(), closing = tok[1] === '/', attrs = m[2] || '';
    if (name === 'span') { if (hasAttr(attrs, 'data-ph')) ph++; else if (closing && ph) ph--; continue; }
    if (ph) continue;
    if (name === 'br') { out += '\n'; continue; }
    if (name === 'hr') { out += '<hr/>\n'; continue; }
    if (name === 'p') { if (closing) out += '\n'; continue; }
    if (name === 'h3') { out += closing ? '</strong>\n' : '<strong>'; continue; }
    if (name === 'h1' || name === 'h2') { out += closing ? `</${name}>\n` : `<${name}>`; continue; }
    if (name === 'ol' || name === 'ul') { out += closing ? `</${name}>\n` : `<${name}>`; continue; }
    if (name === 'li') { out += closing ? '</li>' : '<li>'; continue; }
    if (name === 'img' || name === 'video') {
      if (closing) continue;
      const fid = attrOf(attrs, 'data-file');
      const label = fid && files[fid] ? files[fid].name || (name === 'img' ? 'picture' : 'video') : name === 'img' ? 'picture' : 'video';
      out += `<a href="${esc(cardUrl)}">[${x(label)}: see it in Locus]</a>`; continue;
    }
    if (name === 'a') { if (closing) out += '</a>'; else { const h = safeHref(attrOf(attrs, 'href')); out += h ? `<a href="${esc(h)}">` : '<a>'; } continue; }
    if (['strong', 'em', 'u', 's', 'code', 'pre', 'blockquote'].includes(name)) { out += closing ? `</${name}>${name === 'pre' || name === 'blockquote' ? '\n' : ''}` : `<${name}>`; continue; }
  }
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return `<body><em>Written in Locus. Edit it there: <a href="${esc(cardUrl)}">open the card</a>.</em>\n${out}</body>`;
}

/** Plain text (an old brief_text, a Google Doc) as a page: "Label: words" lines get a bold label, numbered lines
 *  become a numbered list, known headings become headings, links become links. */
export function textToHtml(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const out = [];
  let list = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`); list = null; } };
  const inline = s => esc(s).replace(/https?:\/\/[^\s<>"')]+/g, u => `<a href="${u}">${u}</a>`);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^(written in locus|added in locus|kind:\s)/i.test(line)) continue;
    if (/^(the test|copy|video|inspiration|inspo|launch|the ads?|script|scenes|cards)\s*:?$/i.test(line)) { flush(); out.push(`<h2>${esc(line.replace(/:$/, ''))}</h2>`); continue; }
    const num = /^(\d{1,3})[.)]\s+(.*)$/.exec(line);
    if (num) { if (!list || list.tag !== 'ol') { flush(); list = { tag: 'ol', items: [] }; } list.items.push(`<li>${inline(num[2])}</li>`); continue; }
    const bul = /^[-*•]\s+(.*)$/.exec(line);
    if (bul) { if (!list || list.tag !== 'ul') { flush(); list = { tag: 'ul', items: [] }; } list.items.push(`<li>${inline(bul[1])}</li>`); continue; }
    flush();
    const lab = /^([A-Za-z][A-Za-z' /()-]{1,40}):\s*(.*)$/.exec(line);
    if (lab && !/^https?$/i.test(lab[1])) { out.push(`<p><strong>${esc(lab[1])}:</strong>${lab[2] ? ' ' + inline(lab[2]) : ''}</p>`); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return sanitizeHtml(out.join(''));
}
/** A v1 brief (the form of 2026-10-14 morning) as a page. */
export const v1ToHtml = b => textToHtml(briefTextV1(b));

const ASANA_HINTS = [/^what changes, and on which ad/i, /^one thing: if we/i, /^the argument this ad makes/i];
/** Asana's html_notes as a page: newlines at the top level become paragraphs, Asana's tags pass, the template's grey
 *  example line becomes a hint, the "Written in Locus" line is dropped. */
export function asanaToHtml(notes) {
  let s = String(notes || '').replace(/^\s*<body>/i, '').replace(/<\/body>\s*$/i, '').replace(/\r/g, '');
  s = s.replace(/^\s*<em>Written in Locus[^\n]*<\/em>\s*\n?/i, '');
  const out = [];
  let buf = '';
  let depth = 0, swallow = false;
  const flush = () => {
    const t = buf.trim();
    buf = '';
    if (!t) { out.push('<p><br></p>'); return; }
    const em = /^<em>([\s\S]*)<\/em>$/i.exec(t);
    if (em && ASANA_HINTS.some(r => r.test(decodeEnt(em[1]).trim()))) { out.push(`<p><span data-ph>${em[1]}</span></p>`); return; }
    out.push(`<p>${t}</p>`);
  };
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|[^<]+/g;
  let m;
  while ((m = re.exec(s))) {
    const tok = m[0];
    if (!m[1]) {
      if (depth) { buf += tok.replace(/\n/g, ' '); continue; }
      const text = swallow && tok.startsWith('\n') ? tok.slice(1) : tok;
      swallow = false;
      const parts = text.split('\n');
      parts.forEach((part, i) => { if (i) flush(); buf += part; });
      continue;
    }
    const name = m[1].toLowerCase(), closing = tok[1] === '/';
    if (['ol', 'ul', 'blockquote', 'pre'].includes(name)) {
      if (!closing) { if (buf.trim()) flush(); else buf = ''; depth++; buf += tok; }
      else { depth = Math.max(0, depth - 1); buf += tok; if (!depth) { out.push(buf); buf = ''; swallow = true; } }
      continue;
    }
    if (name === 'h1' || name === 'h2') { if (!closing) { if (buf.trim()) flush(); else buf = ''; } buf += tok; if (closing && !depth) { out.push(buf); buf = ''; swallow = true; } continue; }
    if (name === 'hr') { if (buf.trim()) flush(); else buf = ''; out.push('<hr>'); swallow = true; continue; }
    swallow = false;
    buf += tok;
  }
  if (buf.trim()) flush();
  return sanitizeHtml(out.join('').replace(/^(<p><br><\/p>)+/, '').replace(/(<p><br><\/p>)+$/, ''));
}

/** The starting pages. kind = new | iter | resize | blank; the ads are numbered from the card's number. */
const PH = t => `<span data-ph>${esc(t)}</span>`;
/* A bold label on its OWN line and the words under it (2026-10-14, Cole: the media buyer triple-clicks a line to copy
   it, so "Headline: Milled. Not cast." on one line copied the label too). Every page is normalised this way when it is
   read or saved: <p><strong>Headline:</strong> words</p> becomes <p><strong>Headline</strong></p><p>words</p>. */
export function splitLabels(html) {
  /* only a label that ends in a colon ("Headline:" or "Headline</strong>:"), with words after it in the same paragraph */
  return String(html || '').replace(/<p><strong>([^<]{1,60}?)(:?)\s*<\/strong>(:?)((?:(?!<\/p>)[\s\S])*)<\/p>/g, (m, label, c1, c2, rest) => {
    const words = rest.replace(/^(\s|&nbsp;| )+/, '').trim();
    if (!(c1 || c2) || !words || /^<br\s*\/?>$/.test(words)) return m;
    return `<p><strong>${label.trim()}</strong></p><p>${words}</p>`;
  });
}
const LAB = (l, hint) => `<p><strong>${esc(l)}</strong></p><p>${PH(hint)}</p>`;
export function templateHtml(kind, format, num) {
  const n = String(parseInt(num, 10) || '').trim();
  const ad = i => n ? `${n}-${i}` : `Ad ${i}`;
  const copy = `<h2>Copy</h2>${LAB('Headline', 'The words on the ad')}${LAB('Primary text', 'The post copy, 2 to 4 short lines')}${LAB('Offer', 'What they get, if anything')}${LAB('Landing page', 'Where the click goes')}`;
  const tail = `<h2>Inspiration</h2><p>${PH('Paste a link or drop a picture or video here')}</p><h2>Launch</h2><p>${PH('When it goes live, and anything the buyer needs to know')}</p>`;
  if (kind === 'blank') return '<p><br></p>';
  if (kind === 'iter') return sanitizeHtml(`<h2>Iteration</h2>${LAB('Iterating on', 'the ad it starts from, like 43-2')}${LAB('The one thing that changes', 'hook, visual, copy, CTA or format')}${LAB('What it becomes', 'say the change in one line')}<p>${PH('Everything else stays as it was: angle, lines, visuals, post copy.')}</p>${tail}`);
  if (kind === 'resize') return sanitizeHtml(`<h2>Resize or cut</h2>${LAB('Source ad', 'the ad to resize, like 44-1')}${LAB('Sizes needed', 'also tick them under the page')}${LAB('Note', 'like: keep the logo out of the bottom 20% for Reels')}${tail}`);
  const video = format === 'Video' || format === 'UGC' ? `<h2>Video</h2>${LAB('Creator', 'who films it, or in-house')}${LAB('Hook', 'the first line, the first second on screen')}${LAB('Script', 'what is said and shown, beat by beat')}` : '';
  return sanitizeHtml(`<h2>The test</h2>${LAB('Angle', 'The argument this ad makes')}${LAB('Why', 'The data or insight behind it, one sentence')}${LAB("What we're testing", 'One thing: if we ..., then ...')}<h2>The ads</h2>${[1, 2, 3].map(i => `<p><strong>${esc(n ? `Ad ${ad(i)}` : ad(i))}</strong></p><p>${PH('What this ad shows and says')}</p>`).join('')}${video}${copy}${tail}`);
}

/** Pictures and videos in the page get their signed address (an <img> cannot send the Bearer header). */
export function fillSrc(html, files) {
  return String(html || '').replace(/<(img|video) data-file="([a-f0-9]{16})"( controls)?>/g, (m, tag, fid) => {
    const f = files[fid];
    if (!f) return tag === 'img' ? `<img data-file="${fid}" alt="picture no longer on the card">` : `<video data-file="${fid}" controls>`;
    return tag === 'img' ? `<img data-file="${fid}" src="${esc(f.view || f.url)}">` : `<video data-file="${fid}" controls src="${esc(f.url)}">`;
  }).replace(/<a href="/g, '<a target="_blank" rel="noopener" href="');
}

/** The page as the brief: what saveCard stores (and briefFromAsana / getCard produce). */
export function normBrief(b) {
  b = b && typeof b === 'object' ? b : {};
  if (b.v !== 2) return normBriefV1(b);
  const sizes = (Array.isArray(b.sizes) ? b.sizes : []).filter(s => SIZES.includes(s));
  return { v: 2, html: sanitizeHtml(b.html), format: FORMATS.includes(b.format) ? b.format : 'Static', sizes: [...new Set(sizes)] };
}
/** Whatever is stored, as a page. */
export const toPage = b => { const n = normBrief(b); return n.v === 2 ? n : { v: 2, html: v1ToHtml(n), format: n.format, sizes: n.sizes || [] }; };
/** The brief as plain text: brief_text, the hash, the Strategist. */
export function briefText(b) {
  const n = toPage(b);
  const head = `Format: ${n.format}${n.sizes.length ? ` · Sizes: ${n.sizes.join(', ')}` : ''}`;
  return [head, htmlToText(n.html)].filter(Boolean).join('\n');
}
/** The hourly sync found the text edited in Asana: the page is read back from Asana's html. */
export function briefFromAsana(old, htmlNotes, notes) {
  const o = old && typeof old === 'object' ? old : {};
  return normBrief({ v: 2, html: htmlNotes ? asanaToHtml(htmlNotes) : textToHtml(notes), format: o.format, sizes: o.sizes });
}

/** "Write it with AI": the whole page comes back with every hint replaced by the AI's words (marked <span data-ai>),
 *  the typed sentences untouched. One Sonnet call with the brand brain. */
export async function aiFill(env, d, card, brief) {
  const b = toPage(brief);
  const hints = (b.html.match(/<span data-ph>/g) || []).length;
  const openLabels = (b.html.match(/<strong>[^<]{2,40}:<\/strong>\s*(?=<\/(p|li)>)/g) || []).length;
  if (!hints && !openLabels && htmlToText(b.html).length > 40) return { brief: b, filled: 0, why: 'Every line already has words. Leave a label empty, like "Offer:", for the AI to fill.' };
  if (!env.ANTHROPIC_API_KEY) throw err(400, 'The AI key is missing on the worker.');
  if (d.canAfford && !d.canAfford(3)) throw err(429, 'Locus is out of its budget for this hour. Try again in a few minutes.');
  const brain = await brandBrain(env, card.act_id, { short: true }).catch(() => ({ md: '' }));
  const page = htmlBlank(b.html) ? templateHtml('new', b.format, card.num) : b.html;
  const system = `You write ad briefs for Mobius Digital, a performance ad agency, in the team's framework: Angle (the argument), Why (the data or insight behind it, one sentence), What we're testing (ONE variable, phrased "If we ..., then ..."), the numbered ads (each one line: what it shows and says), then the copy (Headline, Primary text in the brand's voice, Offer, Landing page).
You are given the brief as HTML. Return the WHOLE page as HTML, same structure, same tags, and:
- Replace every <span data-ph>...</span> (a grey hint) with your own words for that spot, wrapped in <span data-ai>...</span>.
- A label with nothing after it (like "<strong>Offer:</strong>") gets your words after it, also wrapped in <span data-ai>.
- Never change, cut or reword a sentence a person wrote. Never remove a picture, a video or a link.
- Format ${b.format}. ${b.format === 'Video' || b.format === 'UGC' ? 'Script = 3 to 6 beats, each "what is said | what we see | seconds".' : 'Say what the picture is and where the words sit.'}
${SPECIFICITY}
No em dashes anywhere. Plain English, like a person talking to a colleague. Only the tags already on the page (p, strong, em, ol, ul, li, h2, a, br). Output the HTML only, no code fence, no commentary.`;
  const user = `BRAND: ${card.brand || card.act_id}\nCARD: #${card.num} ${card.title}\n\nTHE PAGE:\n${page.slice(0, 20000)}\n\nTHE BRAND:\n${String(brain.md || '').slice(0, 14000)}`;
  const res = await (d.xfetch || fetch)('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, max_tokens: 6000, system, output_config: { effort: 'low' }, messages: [{ role: 'user', content: user }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw err(502, j.error?.message || `The AI did not answer (${res.status}).`);
  let text = (j.content || []).filter(x => x.type === 'text').map(x => x.text).join('').trim();
  text = text.replace(/^```(?:html)?\s*/i, '').replace(/```\s*$/, '').replace(EMDASH, ', ');
  const html = sanitizeHtml(text);
  const filled = (html.match(/<span data-ai>/g) || []).length;
  if (!html || !filled) throw err(502, 'The AI answer could not be read. Try again.');
  /* every typed sentence must still be there */
  const before = htmlToText(b.html).split('\n').map(x => x.replace(/^(\d+\.|-)\s*/, '').trim()).filter(x => x.length > 12);
  const after = htmlToText(html);
  const lost = before.filter(line => !after.includes(line));
  if (lost.length) throw err(502, `The AI changed what someone typed ("${lost[0].slice(0, 60)}"). Nothing was kept. Try again.`);
  return { brief: normBrief({ ...b, html }), filled };
}

/* ================================================================================================================ */
/*  READ                                                                                                             */
/* ================================================================================================================ */
const cardUrl = id => `${LOCUS}?open=production&card=${encodeURIComponent(id)}`;
async function rowOf(env, id) {
  await ensureWork(env);
  const r = await env.DB.prepare(`SELECT * FROM p_br_batch WHERE id = ?1`).bind(String(id || '')).first();
  if (!r) throw err(404, 'No such card.');
  return r;
}
/** The client may touch a card only when it is one of its brands' (brandguard cleared the request, not the record). */
function mustOwn(scope, r) {
  if (!scope) return;
  const ids = scope.ids || scope.brands || [];
  const has = Array.isArray(ids) ? ids.includes(r.act_id) : ids instanceof Set ? ids.has(r.act_id) : false;
  if (!has) throw err(403, 'You do not have access to that card.');
}
const scopeIds = scope => scope ? (scope.ids instanceof Set ? [...scope.ids] : Array.isArray(scope.ids) ? scope.ids : Array.isArray(scope.brands) ? scope.brands : []) : null;

/* ---------- signed file links (an <img> or <video> cannot send the Bearer header) ---------- */
async function hmac(env, s) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET || env.ADMIN_TOKEN || 'locus'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(s)))].slice(0, 16).map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function fileUrl(env, origin, fid, hours = 12) {
  /* the expiry sits on a 12-hour grid (valid 12 to 24 hours), so every read of a card gives the SAME link and the
     browser serves the picture from its cache instead of downloading it again on each repaint (2026-10-14) */
  const step = Math.max(1, Math.round(hours / 12)) * 12 * 3600;
  const e = (Math.floor(Date.now() / 1000 / step) + 2) * step;
  return `${origin}/api/production/f/${fid}?e=${e}&s=${await hmac(env, `${fid}.${e}`)}`;
}
/** GET /api/production/f/<id>?e=&s=: the file itself, with Range so a video seeks. No login; the signature is the key. */
/** The sizes a picture is served at besides the original: 600 wide for cards and strips, 1600 for the viewer.
 *  Made once from the original by the Images binding, kept in R2 next to it as WebP (2026-10-14: a 2.8MB PNG per
 *  card is why the Files tab felt slow). The original is what Download and Launch to Meta use. */
export const PIC_SIZES = [600, 1600];
const sizable = mime => /^image\/(png|jpe?g|webp|avif)$/i.test(mime || '');
async function sizedPic(env, f, w) {
  const key = `${f.r2_key}.w${w}.webp`;
  const have = await env.MEDIA.get(key).catch(() => null);
  if (have) return have;
  if (!env.IMAGES) return null;
  const orig = await env.MEDIA.get(f.r2_key);
  if (!orig) return null;
  try {
    const r = (await env.IMAGES.input(orig.body).transform({ width: w, fit: 'scale-down' }).output({ format: 'image/webp', quality: w > 1000 ? 84 : 80 })).response();
    const buf = await r.arrayBuffer();
    if (!buf.byteLength) return null;
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: 'image/webp' } }).catch(() => {});
    return { body: new Response(buf).body, size: buf.byteLength, webp: true };
  } catch { return null; }
}
/** A Production file as small bytes for a model to look at (the 600-wide WebP when it can be made, else the original). */
export async function smallPic(env, fid, w = 600) {
  await ensureWork(env);
  const f = await fileRowOf(env, fid);
  if (!f || f.deleted_at || !env.MEDIA) return null;
  if (sizable(f.mime)) { const p = await sizedPic(env, f, w).catch(() => null); if (p) return { bytes: await new Response(p.body).arrayBuffer(), mime: 'image/webp' }; }
  const o = await env.MEDIA.get(f.r2_key);
  return o ? { bytes: await o.arrayBuffer(), mime: f.mime } : null;
}
/* a file row read once per isolate (10 minutes): a warm worker answers a picture with one R2 read and no D1 query */
const FILE_ROWS = new Map();
async function fileRowOf(env, fid) {
  const c = FILE_ROWS.get(fid);
  if (c && c.t > Date.now() - 600000) return c.row;
  const row = await env.DB.prepare(`SELECT r2_key, mime, name, deleted_at FROM p_work_file WHERE id = ?1`).bind(fid).first();
  if (row && !row.deleted_at) FILE_ROWS.set(fid, { row, t: Date.now() }); else FILE_ROWS.delete(fid);
  return row;
}
export async function serveFile(request, env, url, fid, CORS = {}) {
  const e = +url.searchParams.get('e') || 0, s = url.searchParams.get('s') || '';
  if (!/^[a-f0-9]{16}$/.test(fid) || e < Date.now() / 1000 || s !== await hmac(env, `${fid}.${e}`)) return new Response('This link has expired. Open the card again.', { status: 403, headers: CORS });
  /* no edge cache on purpose: the Cache API is a no-op on a workers.dev address (checked 2026-10-14); the browser
     keeps the file for a day instead (the link is the same for 12 hours, see fileUrl) */
  const range = request.headers.get('Range');
  await ensureWork(env);
  const f = await fileRowOf(env, fid);
  if (!f || f.deleted_at || !env.MEDIA) return new Response('Not found', { status: 404, headers: CORS });
  const w = +url.searchParams.get('w') || 0;
  if (PIC_SIZES.includes(w) && sizable(f.mime) && url.searchParams.get('dl') !== '1') {
    const pic = await sizedPic(env, f, w);
    if (pic) {
      const h = new Headers(CORS);
      h.set('Content-Type', 'image/webp'); h.set('Content-Length', String(pic.size)); h.set('Cache-Control', 'private, max-age=86400, immutable');
      return new Response(pic.body, { status: 200, headers: h });
    }
  }
  const obj = await env.MEDIA.get(f.r2_key, range ? { range: request.headers } : undefined);
  if (!obj) return new Response('Not found', { status: 404, headers: CORS });
  const h = new Headers(CORS);
  h.set('Content-Type', f.mime || 'application/octet-stream');
  h.set('Accept-Ranges', 'bytes');
  h.set('Cache-Control', 'private, max-age=86400, immutable');
  h.set('Content-Disposition', `${url.searchParams.get('dl') === '1' ? 'attachment' : 'inline'}; filename="${String(f.name || 'file').replace(/[^\w.-]+/g, '_')}"`);
  if (range && obj.range) {
    const off = obj.range.offset ?? 0, len = obj.range.length ?? (obj.size - off);
    h.set('Content-Range', `bytes ${off}-${off + len - 1}/${obj.size}`); h.set('Content-Length', String(len));
    return new Response(obj.body, { status: 206, headers: h });
  }
  h.set('Content-Length', String(obj.size));
  return new Response(obj.body, { status: 200, headers: h });
}

const playable = mime => /^(image\/(png|jpe?g|gif|webp|avif)|video\/(mp4|webm))$/i.test(mime || '') || /^video\/quicktime$/i.test(mime || '');
async function filesOf(env, origin, ids) {
  if (!ids.length) return [];
  const ph = ids.map((_, i) => `?${i + 1}`).join(', ');
  const rows = (await env.DB.prepare(`SELECT * FROM p_work_file WHERE batch_id IN (${ph}) AND deleted_at IS NULL ORDER BY kind, ad, version, created_at`).bind(...ids).all()).results || [];
  return Promise.all(rows.map(async f => {
    const u = await fileUrl(env, origin, f.id), pic = sizable(f.mime);
    /* thumb = 600 wide for cards and strips, view = 1600 wide for the viewer (notes are stored 0..1, so a resized picture lines up), url = the original */
    return { id: f.id, batch_id: f.batch_id, kind: f.kind, version: f.version, ad: f.ad || '', name: f.name, mime: f.mime, size: f.size, by: f.by_name, created_at: f.created_at,
      url: f.play_url || u, thumb: pic ? `${u}&w=600` : null, view: pic ? `${u}&w=1600` : (f.play_url || u), download: `${u}&dl=1`, video: /^video\//.test(f.mime || ''), plays: !!f.play_url || playable(f.mime) };
  }));
}

/** The client sees the team as "Mobius", and its own people by name. */
const shownName = (c, client) => !client ? (c.author_name || nameOfEmail(c.author_email)) : (c.author_role === 'team' ? 'Mobius' : (c.author_name || 'You'));
function commentOut(c, client, me) {
  const mine = !!me && !!c.author_email && String(c.author_email).toLowerCase() === String(me).toLowerCase();
  return { id: c.id, who: shownName(c, client), role: c.author_role, mine, can_delete: !!me && !['approval', 'change_request', 'reopen', 'system'].includes(c.kind) && (mine || (!client && String(me).toLowerCase() === OWNER_EMAIL)), body: c.body, kind: c.kind, file_id: c.file_id || null, shape: safe(c.shape_json, null), at: c.at_sec == null ? null : +c.at_sec,
    fixed: !!c.fixed_at, fixed_by: client ? null : c.fixed_by || null, created_at: c.created_at, from_asana: !!c.asana_story_gid && /^asana:/.test(c.id), parent_id: c.parent_id || null };
}

/** A carousel card's file: "53-1 card 2 of 3 Headline.png" (how Studio's Send to the Pipeline names them) = {k: 2, n: 3}. */
export function cardOf(name) {
  const m = /\bcard\s*(\d{1,2})\s*of\s*(\d{1,2})\b/i.exec(String(name || ''));
  return m && +m[1] >= 1 && +m[1] <= +m[2] ? { k: +m[1], n: +m[2] } : null;
}
/** The card's format says Carousel (2026-10-21): its uploads are the cards of one ad, not versions. */
export const isCarousel = briefJson => { const b = safe(briefJson, null); return !!b && b.format === 'Carousel'; };
/** The cards of one carousel ad, in swipe order. Names carry "card k of n": the newest file of each k up to the newest
 *  file's n (a re-sent card takes its own place). No such names: every version in version order. */
export function carouselCards(mine) {
  const vs = mine.slice().sort((a, b) => (a.version || 0) - (b.version || 0));
  const named = vs.filter(f => cardOf(f.name));
  if (!named.length) return vs.map((f, i) => ({ f, k: i + 1 }));
  const n = cardOf(named[named.length - 1].name).n, by = new Map();
  for (const f of named) { const c = cardOf(f.name); if (c.k <= n) by.set(c.k, f); }
  return [...by.entries()].sort((x, y) => x[0] - y[0]).map(([k, f]) => ({ f, k }));
}

/** Each ad of the test (48-1, 48-2...) with its newest version and ITS OWN call (2026-10-14 review redesign): the last
 *  approval / change request / reopen on the newest version decides it, so a new upload after a change request is back
 *  to "review". `open` = notes on that version not marked fixed (replies not counted). A carousel card (`opts.carousel`)
 *  makes each ad ONE carousel: `cards` in swipe order, the call on the newest of them, notes counted over every card. */
export function adsOf(files, comments, opts = {}) {
  const vs = files.filter(f => f.kind === 'version');
  const ads = [...new Set(vs.map(f => f.ad || ''))];
  const out = ads.map(ad => {
    const mine = vs.filter(f => (f.ad || '') === ad).sort((a, b) => (a.version || 0) - (b.version || 0));
    const cards = opts.carousel ? carouselCards(mine) : null;
    const top = cards ? cards.map(c => c.f).sort((a, b) => (a.version || 0) - (b.version || 0)).slice(-1)[0] : mine[mine.length - 1];
    const ids = new Set(cards ? cards.map(c => c.f.id) : [top.id]);
    const calls = comments.filter(c => c.file_id === top.id && ['approval', 'change_request', 'reopen'].includes(c.kind));
    const last = calls[calls.length - 1];
    const status = !last || last.kind === 'reopen' ? 'review' : last.kind === 'approval' ? 'approved' : 'changes';
    const notes = comments.filter(c => ids.has(c.file_id) && !c.parent_id && ['note', 'change_request'].includes(c.kind));
    return { ad, file_id: top.id, version: top.version, versions: mine.length, status, by: last && status !== 'review' ? last.who : null, at: last && status !== 'review' ? last.created_at : null,
      open: notes.filter(c => !c.fixed).length, notes: notes.length, created_at: top.created_at,
      ...(cards ? { carousel: true, cards: cards.map(c => ({ file_id: c.f.id, k: c.k, version: c.f.version })) } : {}) };
  });
  return out.sort((a, b) => String(a.ad).localeCompare(String(b.ad), undefined, { numeric: true }));
}

/** The card's sheet: the brief (one page), the versions, inspiration and inline files, every comment and note. */
export async function getCard(env, d, origin, id, scope, me = null) {
  const r = await rowOf(env, id);
  mustOwn(scope, r);
  const client = !!scope;
  const brandsP = d.listBrands ? d.listBrands(env) : Promise.resolve([]);
  let brief = safe(r.brief_json, null);
  let from = brief ? 'locus' : '';
  if (!brief) {
    /* First open of an old card: the page is read once from Asana (its html), else the Asana text, else the Google Doc. */
    const format = d.formatOf ? d.formatOf(r.title, r.brief_text) : 'Static';
    let text = String(r.brief_text || '');
    let html = '';
    if (r.asana_gid && d.asana && await mirrorOn(env)) {
      const t = await d.asana(env, `/tasks/${r.asana_gid}?opt_fields=html_notes,notes`).catch(() => null);
      if (t && t.html_notes && String(t.notes || '').trim()) { html = asanaToHtml(t.html_notes); from = 'asana'; }
    }
    if (!html && text.replace(/https?:\/\/\S+/g, '').trim().length < 40 && r.brief_url && d.readDoc) {
      const doc = (/docs\.google\.com\/document\/d\/([\w-]{20,})/.exec(r.brief_url) || [])[1];
      if (doc) { const t = await d.readDoc(env, doc).catch(() => null); if (t) { text = t; from = 'doc'; } }
    }
    if (!html && text.trim()) { html = textToHtml(text); from = from || 'asana'; }
    brief = { v: 2, html, format, sizes: [] };
  }
  brief = toPage(brief);
  await ensureWork(env);
  const [files, rows, mirror] = await Promise.all([
    filesOf(env, origin, [r.id]),
    env.DB.prepare(`SELECT * FROM p_work_comment WHERE batch_id = ?1 ORDER BY created_at, rowid`).bind(r.id).all().then(x => x.results || []),
    client ? Promise.resolve(null) : mirrorOn(env),
  ]);
  const byId = Object.fromEntries(files.map(f => [f.id, f]));
  brief = { ...brief, html: fillSrc(brief.html, byId), blank: htmlBlank(brief.html) };
  const comments = rows.map(c => commentOut(c, client, me));
  const board = r.board_stage || boardOf(r.asana_section, r.stage);
  const brand = (await brandsP).find(b => b.act_id === r.act_id);
  const card = {
    id: r.id, act_id: r.act_id, brand: brand?.name || r.act_id, num: r.num, title: r.title || '', board,
    owner: client ? (r.assignee_name ? 'Mobius' : '') : (r.assignee_name || ''), due: r.due_on || '', launch_on: r.launch_on || '',
    needs_client: r.needs_client || '', client_sent_at: r.client_sent_at || null, client_due: r.client_due || null,
    approved_by: r.approved_by ? (client && isTeamEmail(r.approved_by) ? 'Mobius' : nameOfEmail(r.approved_by)) : null, approved_at: r.approved_at || null,
    asana_url: client ? null : r.asana_url || null, brief_url: client ? null : r.brief_url || null, asset_url: client ? null : r.asset_url || null,
    share: !client && r.share_token ? `${LOCUS}review.html?t=${r.share_token}` : null,
  };
  return { card, brief, brief_from: from, files, comments, ads: adsOf(files, comments, { carousel: brief.format === 'Carousel' }), team: client ? [] : ROSTER.map(x => x.name), mirror, client,
    templates: client || !brief.blank ? undefined : { new: templateHtml('new', brief.format, r.num), iter: templateHtml('iter', brief.format, r.num), resize: templateHtml('resize', brief.format, r.num), blank: templateHtml('blank') } };
}

/* ================================================================================================================ */
/*  WRITES                                                                                                           */
/* ================================================================================================================ */
/** Save the sheet: title, owner, dates, the page. Asana gets the page in the task (mirror on). */
export async function saveCard(env, d, body, who) {
  const r = await rowOf(env, body.id);
  const b = toPage(body.brief);
  const text = briefText(b);
  await ensureWork(env);
  const named = Object.fromEntries(((await env.DB.prepare(`SELECT id, name FROM p_work_file WHERE batch_id = ?1 AND deleted_at IS NULL`).bind(r.id).all()).results || []).map(f => [f.id, f]));
  const title = body.title != null ? clean(body.title, 300) || r.title : r.title;
  const owner = body.owner != null ? clean(body.owner, 40) : r.assignee_name;
  const due = body.due != null ? (/^\d{4}-\d{2}-\d{2}$/.test(body.due) ? body.due : null) : r.due_on;
  const launch = body.launch_on != null ? (/^\d{4}-\d{2}-\d{2}$/.test(body.launch_on) ? body.launch_on : null) : r.launch_on;
  let asana = { written: false, why: '' };
  let briefHashV = r.brief_hash || null;
  if (r.asana_gid && d.asana && await mirrorOn(env)) {
    try {
      const put = { html_notes: briefHtml(b, cardUrl(r.id), named) };
      if (title !== r.title) put.name = `${r.num} - ${title}`;
      if (due !== r.due_on) put.due_on = due || null;
      const t = await d.asana(env, `/tasks/${r.asana_gid}?opt_fields=notes`, { method: 'PUT', body: put });
      briefHashV = await hash(t && t.notes != null ? t.notes : text);
      asana = { written: true };
    } catch (e) { asana = { written: false, why: e.message }; }
  } else asana.why = r.asana_gid ? 'The Asana mirror is off.' : 'This card has no Asana task.';
  await env.DB.prepare(`UPDATE p_br_batch SET brief_json = ?2, brief_text = ?3, brief_at = ?4, brief_hash = ?5, title = ?6, assignee_name = ?7, due_on = ?8, launch_on = ?9, updated_at = datetime('now') WHERE id = ?1`)
    .bind(r.id, JSON.stringify(b), text, new Date().toISOString(), briefHashV, title, owner || null, due || null, launch || null).run();
  return { ok: true, brief: b, asana, saved_by: nameOfEmail(who) };
}

/** Send the idea (a Brief card) or the finished ad (a Review card) to the client for their OK; '' takes it back. */
export async function sendToClient(env, d, body, who) {
  const r = await rowOf(env, body.id);
  const what = ['idea', 'ad', ''].includes(body.what) ? body.what : null;
  if (what === null) throw err(400, 'Say what goes to the client.');
  if (what === 'ad' && !(await env.DB.prepare(`SELECT id FROM p_work_file WHERE batch_id = ?1 AND kind = 'version' AND deleted_at IS NULL LIMIT 1`).bind(r.id).first())) throw err(400, 'Upload the ad first, then send it to the client.');
  const today = d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10);
  const dueBy = what ? addBusinessDays(today, 3) : null;
  await env.DB.prepare(`UPDATE p_br_batch SET needs_client = ?2, client_sent_at = ?3, client_due = ?4, updated_at = datetime('now') WHERE id = ?1`)
    .bind(r.id, what || null, what ? new Date().toISOString() : null, dueBy).run();
  if (what) await addComment(env, d, { id: r.id, body: what === 'idea' ? 'Sent the idea to the client for their OK.' : 'Sent the ad to the client for their OK.', kind: 'system' }, who, null, { quiet: true });
  if (what === 'ad' && (r.board_stage || boardOf(r.asana_section, r.stage)) !== 'review' && d.moveCard) await d.moveCard(env, d, { id: r.id, to: 'review' }, who).catch(() => {});
  return { ok: true, needs_client: what || '', client_due: dueBy };
}
function addBusinessDays(ymd, n) {
  const t = new Date(`${ymd}T12:00:00Z`);
  while (n > 0) { t.setUTCDate(t.getUTCDate() + 1); const w = t.getUTCDay(); if (w !== 0 && w !== 6) n--; }
  return t.toISOString().slice(0, 10);
}

/** A comment on the card, or a note on one file (a drawing and, on video, the second). Mentions DM; the mirror copies
 *  it to Asana; a client's comment posts one line in the brand's internal channel. */
export async function addComment(env, d, body, who, scope, opts = {}) {
  const r = await rowOf(env, body.id);
  mustOwn(scope, r);
  const text = keep(body.body, 4000);
  const shape = normShape(body.shape);
  if (!text && !shape) throw err(400, 'Write the note first.');
  let fileId = null, parent = null;
  if (body.parent_id) {
    parent = await env.DB.prepare(`SELECT id, file_id, at_sec FROM p_work_comment WHERE id = ?1 AND batch_id = ?2`).bind(String(body.parent_id), r.id).first();
    if (!parent) throw err(400, 'That note is not on this card.');
    fileId = parent.file_id || null;
  } else if (body.file_id) {
    const f = await env.DB.prepare(`SELECT id FROM p_work_file WHERE id = ?1 AND batch_id = ?2 AND deleted_at IS NULL`).bind(String(body.file_id), r.id).first();
    if (!f) throw err(400, 'That file is not on this card.');
    fileId = f.id;
  }
  const role = scope ? 'client' : opts.guest ? 'client' : 'team';
  const name = opts.name || (role === 'team' ? nameOfEmail(who) : (scope && scope.name) || clean(String(who || '').split('@')[0], 40) || 'Client');
  const kind = parent ? 'reply' : role === 'team' && ['comment', 'note', 'change_request', 'approval', 'system', 'reopen'].includes(body.kind) ? body.kind : fileId ? 'note' : 'comment'; /* a client or a review-link guest decides through decide(), never by labelling a comment */
  const at = body.at != null && isFinite(+body.at) && +body.at >= 0 ? Math.round(+body.at * 10) / 10 : null;
  const id = rid();
  await env.DB.prepare(`INSERT INTO p_work_comment (id, batch_id, act_id, author_email, author_name, author_role, body, kind, file_id, shape_json, at_sec, parent_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
    .bind(id, r.id, r.act_id, who && /@/.test(who) ? String(who).toLowerCase() : null, name, role, text, kind, fileId, parent ? null : shape ? JSON.stringify(shape) : null, parent ? parent.at_sec : at, parent ? parent.id : null).run();
  const out = { id, mentions: [], asana: false, slack: false };
  if (opts.quiet) return out;
  /* the comment is saved: answer now, tell people after (2026-10-14, Cole: "adding comments takes too long") */
  if (d && d.waitUntil && !opts.wait) { d.waitUntil(notifyComment(env, d, r, { id, text, kind, fileId, at, name, role }, out).catch(() => {})); return { ...out, later: true }; }
  return notifyComment(env, d, r, { id, text, kind, fileId, at, name, role }, out);
}
async function notifyComment(env, d, r, { id, text, kind, fileId, at, name, role }, out) {
  const label = `${r.num ? `#${r.num} ` : ''}"${clean(r.title, 60)}"`;
  /* @Name: a Slack DM to that person, never a channel post. */
  const named = [...new Set([...text.matchAll(/@([A-Za-z][A-Za-z'-]{1,20})/g)].map(m => m[1].toLowerCase()))];
  for (const n of named) {
    const p = ROSTER.find(x => x.name.toLowerCase() === n || (x.name.length >= 4 && n.startsWith(x.name.toLowerCase())));
    if (!p) continue;
    const sent = await dm(env, d, p.name, `${name} mentioned you on ${label}: "${clean(text, 300)}" <${cardUrl(r.id)}|Open the card>`);
    out.mentions.push({ name: p.name, sent });
  }
  if (r.asana_gid && d.asana && role === 'team' && kind !== 'system' && await mirrorOn(env)) {
    try {
      const s = await d.asana(env, `/tasks/${r.asana_gid}/stories`, { method: 'POST', body: { text: `From Locus, ${name}: ${fileId ? `(note on a file${at != null ? ` at ${fmtSec(at)}` : ''}) ` : ''}${text}` } });
      if (s && s.gid) await env.DB.prepare(`UPDATE p_work_comment SET asana_story_gid = ?2 WHERE id = ?1`).bind(id, s.gid).run();
      out.asana = true;
    } catch { /* the comment is in Locus either way */ }
  }
  /* A client (or someone on the review link) wrote: one line in the brand's INTERNAL channel, tagged to the owner. */
  if (role === 'client' && d.listBrands && (d.teamPost || d.slackPost)) {
    const brand = (await d.listBrands(env)).find(b => b.act_id === r.act_id);
    if (brand && brand.slack_channel) {
      const line = `${name} (client) on ${label}: "${clean(text, 300)}" <${cardUrl(r.id)}|Open the card>`;
      try {
        if (d.teamPost) await d.teamPost(env, brand.slack_channel, line, null, { tagName: r.assignee_name || undefined });
        else await d.slackPost(env, brand.slack_channel, line);
        out.slack = true;
      } catch { /* the comment is saved */ }
    }
  }
  return out;
}
const fmtSec = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const COLORS = ['coral', 'yellow', 'blue', 'green'];
/** A drawing in 0..1 coordinates of the picture: pin {x,y}, box {x,y,w,h}, arrow {x,y,x2,y2}, pen and mark {pts}. */
export function normShape(s) {
  if (!s || typeof s !== 'object') return null;
  const n = v => Math.max(0, Math.min(1, Math.round((+v || 0) * 10000) / 10000));
  const tool = ['pin', 'box', 'arrow', 'pen', 'mark'].includes(s.tool) ? s.tool : null;
  if (!tool) return null;
  const color = COLORS.includes(s.color) ? s.color : 'coral';
  if (tool === 'pin') return { tool, color, x: n(s.x), y: n(s.y) };
  if (tool === 'box') return { tool, color, x: n(s.x), y: n(s.y), w: n(s.w), h: n(s.h) };
  if (tool === 'arrow') return { tool, color, x: n(s.x), y: n(s.y), x2: n(s.x2), y2: n(s.y2) };
  const pts = (Array.isArray(s.pts) ? s.pts : []).slice(0, 400).map(p => [n(p && p[0]), n(p && p[1])]);
  return pts.length >= 2 ? { tool, color, pts } : null;
}

/** DM one team member by first name. True when Slack took it. */
async function dm(env, d, name, text) {
  if (!d || !d.slackApi) return false;
  const id = await slackIdOf(env, d, name).catch(() => null);
  if (!id) return false;
  const r = await d.slackApi(env, 'chat.postMessage', { channel: id, text, unfurl_links: false }).catch(() => null);
  return !!(r && r.ok);
}

/** Delete a comment or note: its author, or the owner. Replies go with it; the Asana copy is removed after. */
export async function deleteComment(env, d, body, who, scope) {
  await ensureWork(env);
  const c = await env.DB.prepare(`SELECT id, batch_id, act_id, author_email, kind, asana_story_gid FROM p_work_comment WHERE id = ?1`).bind(String(body.comment_id || '')).first();
  if (!c) throw err(404, 'That comment is already gone.');
  const r = await rowOf(env, c.batch_id);
  mustOwn(scope, r);
  if (['approval', 'change_request', 'reopen', 'system'].includes(c.kind)) throw err(400, 'A decision stays in the history. Use Change to reopen the ad instead.');
  const me = String(who || '').toLowerCase();
  const mine = !!c.author_email && String(c.author_email).toLowerCase() === me;
  if (!mine && (scope || me !== OWNER_EMAIL)) throw err(403, 'Only the person who wrote it can delete it.');
  const kids = (await env.DB.prepare(`SELECT id, asana_story_gid FROM p_work_comment WHERE parent_id = ?1`).bind(c.id).all()).results || [];
  await env.DB.prepare(`DELETE FROM p_work_comment WHERE id = ?1 OR parent_id = ?1`).bind(c.id).run();
  const stories = [c, ...kids].map(x => x.asana_story_gid).filter(g => g && !/^asana:/.test(g));
  if (stories.length && d && d.asana) {
    const gone = Promise.all(stories.map(g => d.asana(env, `/stories/${g}`, { method: 'DELETE' }).catch(() => null)));
    if (d.waitUntil) d.waitUntil(gone); else await gone;
  }
  return { ok: true, deleted: 1 + kids.length };
}

/** Tick a note as fixed (the team), or untick it. */
export async function markFixed(env, body, who) {
  await ensureWork(env);
  const c = await env.DB.prepare(`SELECT id FROM p_work_comment WHERE id = ?1`).bind(String(body.comment_id || '')).first();
  if (!c) throw err(404, 'No such note.');
  await env.DB.prepare(`UPDATE p_work_comment SET fixed_at = ?2, fixed_by = ?3 WHERE id = ?1`).bind(c.id, body.fixed === false ? null : new Date().toISOString(), body.fixed === false ? null : nameOfEmail(who)).run();
  return { ok: true };
}

/** Approve, or ask for changes (a note is required). A client may decide only what was sent to them. */
export async function decide(env, d, body, who, scope, opts = {}) {
  const r = await rowOf(env, body.id);
  mustOwn(scope, r);
  const client = !!scope || !!opts.guest;
  /* A client decides what was sent to them; once sent, they may also change a call they made (2026-10-14). */
  if (client && !r.needs_client && !r.client_sent_at) throw err(403, 'This card is not waiting for your OK.');
  const reset = body.reset === true || body.reset === 'true';
  const ok = !reset && (body.ok === true || body.ok === 'true');
  const text = keep(body.body, 4000);
  if (!ok && !reset && !text) throw err(400, 'Say what needs to change.');
  const board = r.board_stage || boardOf(r.asana_section, r.stage);
  const idea = r.needs_client === 'idea' || board === 'brief';
  const latest = body.file_id ? await env.DB.prepare(`SELECT id, version, ad FROM p_work_file WHERE id = ?1 AND batch_id = ?2 AND kind = 'version' AND deleted_at IS NULL`).bind(String(body.file_id), r.id).first()
    : await env.DB.prepare(`SELECT id, version, ad FROM p_work_file WHERE batch_id = ?1 AND kind = 'version' AND deleted_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT 1`).bind(r.id).first();
  if (body.file_id && !latest) throw err(400, 'That file is not on this card.');
  /* A carousel is ONE ad (2026-10-21): any of its cards stands for it, the call lands on its newest card (what adsOf reads). */
  const car = isCarousel(r.brief_json);
  let carAd = null;
  if (car && latest && !idea) {
    const fs = (await env.DB.prepare(`SELECT id, kind, version, ad, name, created_at FROM p_work_file WHERE batch_id = ?1 AND kind = 'version' AND deleted_at IS NULL`).bind(r.id).all()).results || [];
    carAd = adsOf(fs.map(f => ({ ...f, ad: f.ad || '' })), [], { carousel: true }).find(a => a.cards.some(c => c.file_id === latest.id)) || null;
    if (carAd) { latest.id = carAd.file_id; latest.version = carAd.version; }
  }
  const what = idea ? 'the idea' : carAd ? `${latest.ad ? latest.ad + ' ' : ''}carousel (${carAd.cards.length} cards)` : latest ? `${latest.ad ? latest.ad + ' ' : ''}v${latest.version}` : 'the ad';
  const name = opts.name || (client ? (scope && scope.name) || clean(String(who || '').split('@')[0], 40) || 'Client' : nameOfEmail(who));
  const kind = reset ? 'reopen' : ok ? 'approval' : 'change_request';
  const line = reset ? `Reopened ${what} for review.` : ok ? `Approved ${what}.${text ? ` ${text}` : ''}` : text;
  /* the call is written straight in (a client cannot label a comment, so addComment would turn it into a note) */
  const cid = rid();
  await env.DB.prepare(`INSERT INTO p_work_comment (id, batch_id, act_id, author_email, author_name, author_role, body, kind, file_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`)
    .bind(cid, r.id, r.act_id, who && /@/.test(who) ? String(who).toLowerCase() : null, name, client ? 'client' : 'team', line, kind, !idea && latest ? latest.id : null).run();
  /* the call is saved: everything that talks to Asana or Slack runs after the answer (2026-10-14, "it should feel instantaneous") */
  const later = p => { if (d.waitUntil && !opts.wait) d.waitUntil(p.catch(() => null)); else return p.catch(() => null); };
  const tell = [];
  if (!client && !reset && r.asana_gid && d.asana) tell.push((async () => { if (await mirrorOn(env)) await d.asana(env, `/tasks/${r.asana_gid}/stories`, { method: 'POST', body: { text: `From Locus, ${name}: ${line}` } }); })());
  if (client && !reset && d.listBrands && (d.teamPost || d.slackPost)) tell.push((async () => {
    const brand = (await d.listBrands(env)).find(b => b.act_id === r.act_id);
    if (brand && brand.slack_channel) {
      const msg = `${name} (client) ${ok ? 'approved' : 'asked for changes on'} ${what} of #${r.num} "${clean(r.title, 60)}"${ok ? '' : `: "${clean(text, 300)}"`} <${cardUrl(r.id)}|Open the card>`;
      if (d.teamPost) await d.teamPost(env, brand.slack_channel, msg, null, { tagName: r.assignee_name || undefined }); else await d.slackPost(env, brand.slack_channel, msg);
    }
  })());
  /* Where the card goes now, from every ad's own call. */
  let ads = [];
  if (!idea) {
    const files = (await env.DB.prepare(`SELECT id, kind, version, ad, name, created_at FROM p_work_file WHERE batch_id = ?1 AND deleted_at IS NULL`).bind(r.id).all()).results || [];
    const cs = ((await env.DB.prepare(`SELECT * FROM p_work_comment WHERE batch_id = ?1 ORDER BY created_at, rowid`).bind(r.id).all()).results || []).map(c => commentOut(c, false));
    ads = adsOf(files.map(f => ({ ...f, ad: f.ad || '' })), cs, { carousel: car });
  }
  const all = ads.length > 0 && ads.every(a => a.status === 'approved');
  const waiting = ads.some(a => a.status === 'review');
  let moved = null;
  /* the column is written here at once; moveCard (Asana's section, the morning card) follows after the answer */
  const move = async to => {
    if (!d.moveCard) return null;
    await env.DB.prepare(`UPDATE p_br_batch SET board_stage = ?2, board_at = datetime('now'), updated_at = datetime('now') WHERE id = ?1`).bind(r.id, to).run().catch(() => {});
    tell.push(d.moveCard(env, d, { id: r.id, to }, who));
    return { to };
  };
  if (reset) {
    await env.DB.prepare(`UPDATE p_br_batch SET approved_by = NULL, approved_at = NULL${client ? `, needs_client = 'ad'` : ''}, updated_at = datetime('now') WHERE id = ?1`).bind(r.id).run();
    if (!idea && board === 'ready') moved = await move('review');
  } else if (ok) {
    if (idea || all) {
      await env.DB.prepare(`UPDATE p_br_batch SET approved_by = ?2, approved_at = ?3, needs_client = NULL, updated_at = datetime('now') WHERE id = ?1`).bind(r.id, who && /@/.test(who) ? String(who).toLowerCase() : name, new Date().toISOString()).run();
      if (!idea) moved = await move('ready');
    } else if (!waiting) await env.DB.prepare(`UPDATE p_br_batch SET needs_client = NULL, updated_at = datetime('now') WHERE id = ?1`).bind(r.id).run();
  } else {
    if (idea || !waiting) await env.DB.prepare(`UPDATE p_br_batch SET needs_client = NULL, updated_at = datetime('now') WHERE id = ?1`).bind(r.id).run();
    if (!idea) moved = await move('making');
    if (r.assignee_name) tell.push(dm(env, d, r.assignee_name, `${name} asked for changes on ${what} of #${r.num} "${clean(r.title, 60)}": "${clean(text, 300)}" <${cardUrl(r.id)}|Open the card>`));
  }
  const after = later(Promise.all(tell));
  if (after) await after;
  return { ok: true, approved: ok, reopened: reset, all_approved: all, ads, moved: moved && !moved.error ? moved.to : null, later: !!(d.waitUntil && !opts.wait) };
}

/** Approve all: one call per ad still waiting (or the ids given), the last answer carries the card's state. */
export async function decideMany(env, d, body, who, scope, opts = {}) {
  const r = await rowOf(env, body.id);
  mustOwn(scope, r);
  let ids = Array.isArray(body.file_ids) ? body.file_ids.map(String) : null;
  if (!ids) {
    const files = (await env.DB.prepare(`SELECT id, kind, version, ad, name, created_at FROM p_work_file WHERE batch_id = ?1 AND deleted_at IS NULL`).bind(r.id).all()).results || [];
    const cs = ((await env.DB.prepare(`SELECT * FROM p_work_comment WHERE batch_id = ?1 ORDER BY created_at, rowid`).bind(r.id).all()).results || []).map(c => commentOut(c, false));
    ids = adsOf(files.map(f => ({ ...f, ad: f.ad || '' })), cs, { carousel: isCarousel(r.brief_json) }).filter(a => a.status === 'review').map(a => a.file_id);
  }
  if (!ids.length) throw err(400, 'Nothing is waiting for a call.');
  let out = null;
  for (const fid of ids) out = await decide(env, d, { ...body, file_id: fid, ok: true, reset: false }, who, scope, opts);
  return { ...out, count: ids.length };
}

/** Which ad of the test a file is: "48-3 v2.png", "48_3.mp4", "LG_440-2 final.mov" (the card's number first when
 *  it is there), else "". Versions count per ad, so nobody picks what a file replaces. */
export function adOf(name, num) {
  const base = String(name || '').replace(/\.[a-z0-9]{2,5}$/i, '');
  const hits = [...base.matchAll(/(?<![\d.])(\d{1,4})(?=([-_ ])(\d{1,2})(?![\d.]))/g)].map(m => [m[1], m[3], m[2]]);   // a lookahead, so "1350 45-1" sees both pairs
  if (!hits.length) return '';
  const n = String(parseInt(num, 10) || '');
  const own = hits.find(h => String(parseInt(h[0], 10)) === n);
  const h = own || hits.find(h => h[2] !== ' ') || hits[0];
  return `${parseInt(h[0], 10)}-${parseInt(h[1], 10)}`;
}
const kindOf = k => ['version', 'insp', 'inline'].includes(k) ? k : 'version';
const fileMime = (mime, name) => {
  let m = String(mime || '').split(';')[0].trim().toLowerCase();
  if (!m || m === 'application/octet-stream') { const ext = (/\.([a-z0-9]{2,5})$/i.exec(name || '') || [])[1]; m = { mov: 'video/quicktime', mp4: 'video/mp4', webm: 'video/webm', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif' }[String(ext || '').toLowerCase()] || m; }
  return m;
};
/** The file row once the bytes are in R2: version per ad, the card to Review, Stream for a MOV. */
async function fileRow(env, d, origin, r, { id, key, kind, name, mime, size }, who) {
  const ad = kind === 'version' ? adOf(name, r.num) : null;
  let version = null;
  if (kind === 'version') version = ((await env.DB.prepare(`SELECT MAX(version) AS v FROM p_work_file WHERE batch_id = ?1 AND kind = 'version' AND COALESCE(ad, '') = ?2`).bind(r.id, ad || '').first())?.v || 0) + 1;
  await env.DB.prepare(`INSERT INTO p_work_file (id, batch_id, act_id, kind, version, ad, r2_key, name, mime, size, by_email, by_name) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`)
    .bind(id, r.id, r.act_id, kind, version, ad || null, key, name, mime, size, who && /@/.test(who) ? String(who).toLowerCase() : null, nameOfEmail(who)).run();
  let moved = null;
  if (kind === 'version') {
    const board = r.board_stage || boardOf(r.asana_section, r.stage);
    if ((board === 'brief' || board === 'making') && d.moveCard) moved = (await d.moveCard(env, d, { id: r.id, to: 'review' }, who).catch(() => null))?.to || null;
    await convert(env, origin, id, mime, name).catch(e => console.log('convert: ' + e.message));
    /* Frame in step (framesync.js): the older version of this ad leaves the concept folder, the new one is there */
    if (ad) { const fp = frameLater(env, d, r.id, [ad], { origin }); if (fp) await fp; }
  }
  const u = await fileUrl(env, origin, id), pic = sizable(mime);
  return { ok: true, file: { id, kind, version, ad: ad || '', name, mime, size, url: u, thumb: pic ? `${u}&w=600` : null, view: pic ? `${u}&w=1600` : u, download: `${u}&dl=1`, video: /^video\//.test(mime), plays: playable(mime) }, moved };
}
const fileKey = (r, id, name) => `work/${r.act_id}/${r.id}/${id}-${name.replace(/[^\w.-]+/g, '_')}`;
const fileName = (q, kind, mime) => clean(q, 120).replace(/[\\/]+/g, '_') || `${kind}.${String(mime).split('/')[1] || 'bin'}`;

/** POST /api/production/upload?id=&kind=version|insp|inline&name= with the file as the body: one request, for files
 *  under the Worker's body cap. Bigger ones come in parts (below). */
export async function uploadFile(request, env, d, url, who) {
  const r = await rowOf(env, url.searchParams.get('id'));
  if (!env.MEDIA) throw err(500, 'The file store is not connected on the worker.');
  const kind = kindOf(url.searchParams.get('kind'));
  const mime = fileMime(request.headers.get('Content-Type'), url.searchParams.get('name'));
  if (!/^(image|video)\//.test(mime)) throw err(400, 'Upload an image or a video.');
  const len = +request.headers.get('Content-Length') || 0;
  if (len > MAX_BYTES) throw err(413, 'Too big for one request. The Files tab sends big files in parts.');
  const name = fileName(url.searchParams.get('name'), kind, mime);
  const id = rid();
  const key = fileKey(r, id, name);
  const put = await env.MEDIA.put(key, request.body, { httpMetadata: { contentType: mime } });
  const size = put && put.size || len || 0;
  return fileRow(env, d, new URL(request.url).origin, r, { id, key, kind, name, mime, size }, who);
}
/** POST /api/production/upload/start?id=&kind=&name=&type=&size= : opens an R2 multipart upload. No size limit. */
export async function uploadStart(env, url) {
  const r = await rowOf(env, url.searchParams.get('id'));
  if (!env.MEDIA || !env.MEDIA.createMultipartUpload) throw err(500, 'The file store is not connected on the worker.');
  const kind = kindOf(url.searchParams.get('kind'));
  const mime = fileMime(url.searchParams.get('type'), url.searchParams.get('name'));
  if (!/^(image|video)\//.test(mime)) throw err(400, 'Upload an image or a video.');
  const name = fileName(url.searchParams.get('name'), kind, mime);
  const id = rid();
  const key = fileKey(r, id, name);
  const mp = await env.MEDIA.createMultipartUpload(key, { httpMetadata: { contentType: mime } });
  return { ok: true, id, key, uploadId: mp.uploadId, kind, name, mime, part: 24 * 1024 * 1024 };
}
/** PUT /api/production/upload/part?id=&key=&uploadId=&n= with the part as the body (parts of at least 5MB but the last). */
export async function uploadPart(request, env, url) {
  const r = await rowOf(env, url.searchParams.get('id'));
  const key = String(url.searchParams.get('key') || ''), uploadId = String(url.searchParams.get('uploadId') || ''), n = +url.searchParams.get('n') || 0;
  if (!key.startsWith(`work/${r.act_id}/${r.id}/`) || !uploadId || n < 1 || n > 10000) throw err(400, 'That upload does not belong to this card.');
  const mp = env.MEDIA.resumeMultipartUpload(key, uploadId);
  const part = await mp.uploadPart(n, request.body);
  return { ok: true, partNumber: part.partNumber, etag: part.etag };
}
/** POST /api/production/upload/finish {id, key, uploadId, parts:[{partNumber, etag}], name, type, kind}: the file is whole. */
export async function uploadFinish(env, d, origin, body, who) {
  const r = await rowOf(env, body.id);
  const key = String(body.key || ''), uploadId = String(body.uploadId || '');
  const parts = (Array.isArray(body.parts) ? body.parts : []).map(p => ({ partNumber: +p.partNumber, etag: String(p.etag || '') })).filter(p => p.partNumber > 0 && p.etag).sort((a, b) => a.partNumber - b.partNumber);
  if (!key.startsWith(`work/${r.act_id}/${r.id}/`) || !uploadId || !parts.length) throw err(400, 'That upload does not belong to this card.');
  const kind = kindOf(body.kind);
  const mime = fileMime(body.type, body.name);
  if (!/^(image|video)\//.test(mime)) throw err(400, 'Upload an image or a video.');
  const name = fileName(body.name, kind, mime);
  const id = (/\/([a-f0-9]{16})-[^/]*$/.exec(key) || [])[1] || rid();
  const mp = env.MEDIA.resumeMultipartUpload(key, uploadId);
  const obj = await mp.complete(parts);
  return fileRow(env, d, origin, r, { id, key, kind, name, mime, size: (obj && obj.size) || +body.size || 0 }, who);
}

/* A video a browser cannot play (ProRes, some MOVs): Cloudflare Stream makes an MP4 when it is switched on
   (CF_ACCOUNT_ID + CF_STREAM_TOKEN on the worker). Without it the file still downloads. */
async function convert(env, origin, fid, mime, name) {
  if (!/^video\//.test(mime) || /^video\/(mp4|webm)$/.test(mime) || !env.CF_ACCOUNT_ID || !env.CF_STREAM_TOKEN) return;
  const api = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream`;
  const h = { Authorization: `Bearer ${env.CF_STREAM_TOKEN}`, 'Content-Type': 'application/json' };
  const r = await fetch(`${api}/copy`, { method: 'POST', headers: h, body: JSON.stringify({ url: await fileUrl(env, origin, fid, 24), meta: { name } }) }).then(x => x.json());
  if (r && r.success && r.result && r.result.uid) await env.DB.prepare(`UPDATE p_work_file SET stream_uid = ?2 WHERE id = ?1`).bind(fid, r.result.uid).run();
}
/** Card reads ask Stream whether a converted MP4 is ready yet, and keep its address once it is. */
async function streamCheck(env, files) {
  if (!env.CF_ACCOUNT_ID || !env.CF_STREAM_TOKEN) return;
  const api = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream`;
  const h = { Authorization: `Bearer ${env.CF_STREAM_TOKEN}`, 'Content-Type': 'application/json' };
  for (const f of files.slice(0, 3)) {
    try {
      let dl = await fetch(`${api}/${f.stream_uid}/downloads`, { headers: h }).then(x => x.json());
      if (!dl?.result?.default) dl = await fetch(`${api}/${f.stream_uid}/downloads`, { method: 'POST', headers: h }).then(x => x.json());
      const def = dl?.result?.default;
      if (def && def.status === 'ready' && def.url) await env.DB.prepare(`UPDATE p_work_file SET play_url = ?2 WHERE id = ?1`).bind(f.id, def.url).run();
    } catch { /* next read */ }
  }
}
export async function pendingConversions(env, batchId) {
  if (!env.CF_STREAM_TOKEN) return;
  const rows = (await env.DB.prepare(`SELECT id, stream_uid FROM p_work_file WHERE batch_id = ?1 AND stream_uid IS NOT NULL AND play_url IS NULL AND deleted_at IS NULL`).bind(batchId).all().catch(() => ({ results: [] }))).results || [];
  if (rows.length) await streamCheck(env, rows);
}

/** Make (or read) the card's review link: works with no login. */
export async function shareLink(env, body) {
  const r = await rowOf(env, body.id);
  let t = r.share_token;
  if (!t) { t = rid() + rid(); await env.DB.prepare(`UPDATE p_br_batch SET share_token = ?2 WHERE id = ?1`).bind(r.id, t).run(); }
  return { ok: true, url: `${LOCUS}review.html?t=${t}` };
}

/* ================================================================================================================ */
/*  THE CLIENT'S PRODUCTION                                                                                          */
/* ================================================================================================================ */
const CLIENT_STAGE = { brief: 'Idea', making: 'Making', review: 'Making', ready: 'Ready', live: 'Live' };
/** Needs you + Coming up for the client's own brand. */
export async function clientBoard(env, d, origin, act) {
  await ensureWork(env);
  const brands = d.listBrands ? await d.listBrands(env) : [];
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const rows = (await env.DB.prepare(`SELECT id, act_id, num, title, stage, board_stage, board_at, asana_section, brief_text, due_on, launch_on, needs_client, client_sent_at, client_due, updated_at, created_at
    FROM p_br_batch WHERE act_id = ?1 AND stage != 'done' AND (board_stage IS NULL OR board_stage != 'done') AND (stage != 'live' OR COALESCE(board_at, updated_at) >= ?2) ORDER BY CAST(num AS INTEGER) DESC LIMIT 200`).bind(act, since).all()).results || [];
  const ids = rows.map(r => r.id);
  const files = await filesOf(env, origin, ids);
  const thumbOf = id => { const v = files.filter(f => f.batch_id === id && f.kind === 'version' && !f.video).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]; return v ? v.url : null; };
  const fmt = r => d.formatOf ? d.formatOf(r.title, r.brief_text) : 'Static';
  const needs = [], coming = [];
  for (const r of rows) {
    const board = r.board_stage || boardOf(r.asana_section, r.stage);
    if (!CLIENT_STAGE[board]) continue;
    const base = { id: r.id, num: r.num, title: r.title || '', format: fmt(r), launch: r.launch_on || (board === 'live' ? String(r.board_at || '').slice(0, 10) : r.due_on || ''), thumb: thumbOf(r.id) };
    if (r.needs_client) needs.push({ ...base, what: r.needs_client, sent: String(r.client_sent_at || '').slice(0, 10), due: r.client_due || '' });
    else coming.push({ ...base, stage: CLIENT_STAGE[board] });
  }
  const order = { Idea: 0, Making: 1, Ready: 2, Live: 3 };
  coming.sort((a, b) => (order[a.stage] === 3) - (order[b.stage] === 3) || String(a.launch || '9').localeCompare(String(b.launch || '9')));
  return { client: true, act, brand: brands.find(b => b.act_id === act)?.name || '', needs, coming, today: d.centralDate ? d.centralDate() : new Date().toISOString().slice(0, 10) };
}

/* ================================================================================================================ */
/*  THE REVIEW LINK (no login)                                                                                       */
/* ================================================================================================================ */
export async function handleReviewLink(request, env, url, path, json, d) {
  const m = /^\/api\/review\/([a-f0-9]{32})(\/note|\/decide)?$/.exec(path);
  if (!m) return null;
  await ensureWork(env);
  const r = await env.DB.prepare(`SELECT id, act_id FROM p_br_batch WHERE share_token = ?1`).bind(m[1]).first();
  if (!r) return json({ error: 'This review link was turned off. Ask Mobius for a new one.' }, 404);
  const origin = url.origin;
  try {
    if (!m[2] && request.method === 'GET') {
      const out = await getCard(env, d, origin, r.id, { ids: [r.act_id] });
      return json({ card: { ...out.card, needs_client: out.card.needs_client || '' }, brief: out.brief, files: out.files.filter(f => f.kind === 'version'), comments: out.comments, ads: out.ads });
    }
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await request.json().catch(() => ({}));
    const name = clean(body.name, 60);
    if (!name) return json({ error: 'Add your name so the team knows who wrote it.' }, 400);
    const scope = { ids: [r.act_id], name };
    if (m[2] === '/note') return json({ ok: true, ...(await addComment(env, d, { ...body, id: r.id }, name, scope, { name, guest: true })) });
    const guest = { name, guest: true };
    return json(await (body.all === true || Array.isArray(body.file_ids) ? decideMany(env, d, { ...body, id: r.id }, name, scope, guest) : decide(env, d, { ...body, id: r.id }, name, scope, guest)));
  } catch (e) { return json({ error: e.message }, e.status || 500); }
}

/* ================================================================================================================ */
/*  THE ASANA MIRROR                                                                                                 */
/* ================================================================================================================ */
/** On/off, and the open Asana tasks in the creative sections that have no card in Locus yet. */
export async function mirrorState(env, d) {
  const on = await mirrorOn(env);
  const v = (await getJson(env, 'asanaMirror', null)) || {};
  const out = { on, changed_at: v.at || null, changed_by: v.by || null, missing: [], total: 0 };
  if (!d.asanaAll) return out;
  const docs = (await env.DB.prepare(`SELECT act_id, data_json FROM p_br_doc WHERE line_id = '' AND key = 'asana'`).all().catch(() => ({ results: [] }))).results || [];
  const brands = d.listBrands ? await d.listBrands(env) : [];
  for (const row of docs.slice(0, 20)) {
    const doc = safe(row.data_json, {});
    if (!doc.project_gid || doc.paused) continue;
    try {
      const tasks = await d.asanaAll(env, `/tasks?project=${doc.project_gid}&completed_since=now&opt_fields=name,permalink_url,memberships.section.name,memberships.project.gid`);
      const have = new Set(((await env.DB.prepare(`SELECT num FROM p_br_batch WHERE act_id = ?1`).bind(row.act_id).all()).results || []).map(x => String(parseInt(x.num, 10))));
      const miss = tasks.filter(t => {
        const sec = (t.memberships || []).find(x => x.project && x.project.gid === doc.project_gid)?.section?.name || '';
        if (!boardOf(sec, null) || boardOf(sec, null) === 'done') return false;
        const n = (/^\s*(?:[A-Za-z]{2,4}_)?#?(\d{1,4})(?=$|[^\d])/.exec(t.name || '') || [])[1];
        return !n || !have.has(String(parseInt(n, 10)));
      });
      if (miss.length) out.missing.push({ act_id: row.act_id, name: brands.find(b => b.act_id === row.act_id)?.name || row.act_id, n: miss.length, tasks: miss.slice(0, 10).map(t => ({ name: clean(t.name, 120), url: t.permalink_url || null })) });
      out.total += miss.length;
    } catch (e) { out.missing.push({ act_id: row.act_id, name: brands.find(b => b.act_id === row.act_id)?.name || row.act_id, n: 0, error: e.message }); }
  }
  return out;
}
export async function setMirror(env, on, who) {
  await putJson(env, 'asanaMirror', { on: !!on, at: new Date().toISOString(), by: nameOfEmail(who) });
  return { ok: true, on: !!on };
}

/** In the hourly Asana sync: new comments typed in Asana on open cards come into the card's thread. */
export async function pullStories(env, asanaFn, act, tasks) {
  if (!tasks.length || !(await mirrorOn(env))) return 0;
  await ensureWork(env);
  let n = 0;
  for (const t of tasks.slice(0, 25)) {
    const row = await env.DB.prepare(`SELECT id FROM p_br_batch WHERE act_id = ?1 AND asana_gid = ?2`).bind(act, t.gid).first().catch(() => null);
    if (!row) continue;
    const stories = await asanaFn(env, `/tasks/${t.gid}/stories?opt_fields=resource_subtype,text,created_by.name,created_by.email,created_at`).catch(() => []);
    for (const s of stories || []) {
      if (s.resource_subtype !== 'comment_added' || !s.text || /^(From Locus|Locus:)/.test(s.text)) continue;
      const id = `asana:${s.gid}`.slice(0, 40);
      const seen = await env.DB.prepare(`SELECT id FROM p_work_comment WHERE id = ?1 OR asana_story_gid = ?2`).bind(id, s.gid).first();
      if (seen) continue;
      await env.DB.prepare(`INSERT INTO p_work_comment (id, batch_id, act_id, author_email, author_name, author_role, body, kind, asana_story_gid, created_at) VALUES (?1, ?2, ?3, ?4, ?5, 'team', ?6, 'comment', ?7, ?8)`)
        .bind(id, row.id, act, s.created_by?.email ? String(s.created_by.email).toLowerCase() : null, clean(s.created_by?.name, 60) || 'Asana', keep(s.text, 4000), s.gid, String(s.created_at || '').replace('T', ' ').slice(0, 19) || new Date().toISOString()).run();
      n++;
    }
  }
  return n;
}

/** Once an ad has been live 60 days, every version but the last is deleted from R2. A few a run. */
export async function pruneFiles(env) {
  if (!env.MEDIA) return 0;
  await ensureWork(env);
  const before = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().replace('T', ' ').slice(0, 19);
  /* a carousel card's uploads are its cards, not versions: those are read on their own below (2026-10-21) */
  const rows = (await env.DB.prepare(`SELECT f.id, f.r2_key FROM p_work_file f JOIN p_br_batch b ON b.id = f.batch_id
    WHERE f.deleted_at IS NULL AND f.kind = 'version' AND COALESCE(b.board_stage, '') IN ('live', 'done') AND COALESCE(b.board_at, b.updated_at) < ?1
      AND COALESCE(b.brief_json, '') NOT LIKE '%"format":"Carousel"%'
      AND f.version < (SELECT MAX(version) FROM p_work_file g WHERE g.batch_id = f.batch_id AND g.kind = 'version' AND g.deleted_at IS NULL AND COALESCE(g.ad, '') = COALESCE(f.ad, '')) LIMIT 40`).bind(before).all().catch(() => ({ results: [] }))).results || [];
  /* carousels: every current card of each ad stays; only a card a newer upload of the same place replaced goes */
  const car = (await env.DB.prepare(`SELECT f.id, f.r2_key, f.batch_id, f.ad, f.version, f.name FROM p_work_file f JOIN p_br_batch b ON b.id = f.batch_id
    WHERE f.deleted_at IS NULL AND f.kind = 'version' AND COALESCE(b.board_stage, '') IN ('live', 'done') AND COALESCE(b.board_at, b.updated_at) < ?1
      AND COALESCE(b.brief_json, '') LIKE '%"format":"Carousel"%' LIMIT 400`).bind(before).all().catch(() => ({ results: [] }))).results || [];
  const groups = new Map();
  for (const f of car) { const k = `${f.batch_id}|${f.ad || ''}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); }
  for (const g of groups.values()) {
    const keep = new Set(carouselCards(g).map(c => c.f.id));
    for (const f of g) if (!keep.has(f.id) && rows.length < 40) rows.push(f);
  }
  for (const f of rows) {
    FILE_ROWS.delete(f.id);
    await env.MEDIA.delete(f.r2_key).catch(() => {});
    for (const w of PIC_SIZES) await env.MEDIA.delete(`${f.r2_key}.w${w}.webp`).catch(() => {});
    await env.DB.prepare(`UPDATE p_work_file SET deleted_at = datetime('now') WHERE id = ?1`).bind(f.id).run();
  }
  return rows.length;
}

/** Delete an uploaded version (team only; 2026-10-14, Cole: "How do you delete creatives that are uploaded?"). The row
 *  is marked deleted, the file and its sized copies leave R2 (and Stream, when it was converted), a system line says who
 *  removed it. Notes on it stay in the history. An ad whose newest version goes falls back to the one before; an ad with
 *  one version leaves the Ads tab. A launch already made from it is untouched (Meta has its own copy). */
export async function deleteFile(env, d, body, who, scope) {
  if (scope) throw err(403, 'The team\'s part of Production.');
  await ensureWork(env);
  const f = await env.DB.prepare(`SELECT id, batch_id, act_id, r2_key, kind, version, ad, name, stream_uid FROM p_work_file WHERE id = ?1 AND deleted_at IS NULL`).bind(String(body.file_id || '')).first();
  if (!f) throw err(404, 'That file is already gone.');
  await env.DB.prepare(`UPDATE p_work_file SET deleted_at = datetime('now') WHERE id = ?1`).bind(f.id).run();
  FILE_ROWS.delete(f.id);
  const wipe = (async () => {
    if (env.MEDIA) for (const k of [f.r2_key, ...PIC_SIZES.map(w => `${f.r2_key}.w${w}.webp`)]) await env.MEDIA.delete(k).catch(() => {});
    if (f.stream_uid && env.CF_ACCOUNT_ID && env.CF_STREAM_TOKEN) await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/stream/${f.stream_uid}`, { method: 'DELETE', headers: { Authorization: `Bearer ${env.CF_STREAM_TOKEN}` } }).catch(() => {});
  })();
  if (d && d.waitUntil) d.waitUntil(wipe); else await wipe;
  /* Frame in step (framesync.js): the deleted version is MOVED out of the concept folder, the one before comes back */
  if (f.kind === 'version' && f.ad) { const fp = frameLater(env, d, f.batch_id, [f.ad], { origin: d && d.origin }); if (fp) await fp; }
  const label = f.kind === 'version' ? `v${f.version || '?'}${f.ad ? ` of ${f.ad}` : ''}` : (f.name || 'a file');
  await addComment(env, d, { id: f.batch_id, body: `Deleted ${label}${f.name ? ` (${f.name})` : ''}.`, kind: 'system' }, who, null, { quiet: true }).catch(() => {});
  return { ok: true, file_id: f.id, deleted: label };
}

/* ================================================================================================================ */
/*  ROUTES (called from production.js handleProduction)                                                              */
/* ================================================================================================================ */
const WORK_PATHS = new Set(['card', 'comment', 'comment/delete', 'file/delete', 'decide', 'save', 'ai', 'send', 'fixed', 'upload', 'upload/start', 'upload/part', 'upload/finish', 'template', 'share', 'photos', 'mirror'].map(p => `/api/production/${p}`));
export async function workRoutes(request, env, url, path, json, d, who, scope) {
  if (!WORK_PATHS.has(path)) return null;   // before the body is read: move and brief read it themselves
  const origin = url.origin;
  const body = request.method === 'POST' || request.method === 'PUT' ? (path === '/api/production/upload' || path === '/api/production/upload/part' ? null : await request.json().catch(() => ({}))) : null;
  const teamOnly = () => { if (scope) throw err(403, 'The team\'s part of Production.'); };
  if (path === '/api/production/card' && request.method === 'GET') {
    const id = url.searchParams.get('id');
    await pendingConversions(env, id).catch(() => {});
    return json(await getCard(env, d, origin, id, scope, scope ? scope.email || who : who));
  }
  if (path === '/api/production/comment' && request.method === 'POST') return json({ ok: true, ...(await addComment(env, d, body, who, scope ? { ...scope, name: scope.name || await clientName(env, who) } : null)) });
  if (path === '/api/production/comment/delete' && request.method === 'POST') return json(await deleteComment(env, d, body, who, scope));
  if (path === '/api/production/file/delete' && request.method === 'POST') return json(await deleteFile(env, d, body, who, scope));
  if (path === '/api/production/decide' && request.method === 'POST') {
    const sc = scope ? { ...scope, name: scope.name || await clientName(env, who) } : null;
    return json(await (body.all === true || Array.isArray(body.file_ids) ? decideMany(env, d, body, who, sc) : decide(env, d, body, who, sc)));
  }
  teamOnly();
  if (path === '/api/production/save' && request.method === 'POST') return json(await saveCard(env, d, body, who));
  if (path === '/api/production/ai' && request.method === 'POST') {
    const r = await rowOf(env, body.id);
    const brands = d.listBrands ? await d.listBrands(env) : [];
    const out = await aiFill(env, d, { act_id: r.act_id, num: r.num, title: body.title || r.title, brand: brands.find(b => b.act_id === r.act_id)?.name }, body.brief);
    const files = Object.fromEntries((await filesOf(env, origin, [r.id])).map(f => [f.id, f]));
    return json({ ok: true, ...out, brief: { ...out.brief, html: fillSrc(out.brief.html, files) } });
  }
  if (path === '/api/production/send' && request.method === 'POST') return json(await sendToClient(env, d, body, who));
  if (path === '/api/production/fixed' && request.method === 'POST') return json(await markFixed(env, body, who));
  if (path === '/api/production/upload' && request.method === 'POST') return json(await uploadFile(request, env, d, url, who));
  if (path === '/api/production/upload/start' && request.method === 'POST') return json(await uploadStart(env, url));
  if (path === '/api/production/upload/part' && request.method === 'PUT') return json(await uploadPart(request, env, url));
  if (path === '/api/production/upload/finish' && request.method === 'POST') return json(await uploadFinish(env, d, origin, body, who));
  if (path === '/api/production/template' && request.method === 'GET') { const r = await rowOf(env, url.searchParams.get('id')); return json({ html: templateHtml(url.searchParams.get('kind') || 'new', url.searchParams.get('format') || 'Static', r.num) }); }
  if (path === '/api/production/share' && request.method === 'POST') return json(await shareLink(env, body));
  if (path === '/api/production/photos' && request.method === 'GET') return json({ photos: await teamPhotos(env, d) });
  if (path === '/api/production/mirror' && request.method === 'GET') return json(await mirrorState(env, d));
  if (path === '/api/production/mirror' && request.method === 'PUT') return json(await setMirror(env, body.on !== false, who));
  return null;
}
async function clientName(env, email) {
  const users = (await getJson(env, 'clientUsers', {})) || {};
  const u = users[String(email || '').toLowerCase()];
  return (u && u.name) || clean(String(email || '').split('@')[0], 40) || 'Client';
}
export { scopeIds };
