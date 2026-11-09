/* THE SLACK LANE FORMAT (2026-11-09, Cole). Read before adding any Slack message Locus sends to the team.
 *
 * Cole: the Locus posts read as noise; he could not tell what a message meant, who it was for, or which part of the
 * work it belonged to. So every team message is one of two things:
 *
 * 1. AN ASK (someone has to do something): ONE layout, lane first.
 *      *MEDIA BUYING · Dartee*
 *      <@U06C37MDWD7>  Turn off ad set 368
 *      Why: $140 spent, 0 sales in 7 days
 *      [Do it]  [Open]
 *    Line 1 = the lane in caps + the brand ("Agency" when there is none). Line 2 = the tagged person + the ONE thing to
 *    do. Line 3 = "Why:" in one short line (optional). Then the buttons the message already had. Nothing else.
 *    laneBlocks() builds it; lanePost() resolves the person, builds it and posts it (under today's morning card when
 *    asked). A message with several asks for different people (the morning card) uses laneLines(): one lane header
 *    per group, each person tagged once, their asks as bullets under the tag.
 *
 * 2. AN FYI (nobody has to do anything): it does NOT post. fyi() stores one line (brand + lane + Central date) and
 *    roundupTick() posts ONE end-of-day roundup per brand in its internal channel (from 4pm Central, once a day, only
 *    when there is something in it), grouped by lane, one line each. Agency lines (no brand) go to settings.slackChannel.
 *
 * The lanes (fixed; keep the list this short): MEDIA BUYING, CREATIVE (creative strategy, briefs, production,
 * reviews), CREATORS (Trybe, Discord, the creator program, recuts), CLIENT (client requests, client comments, client
 * updates to send), EMAIL, OPS (Locus itself: sync failures, job trouble, the smoke check, connections, new clients).
 * Who a lane tags on a brand: laneOwner() from calendar.js teamOf (buyer / strategist / email owner); OPS and anything
 * with no owner tags Cole.
 *
 * Copy: plain words, short, no em dashes (noDash strips them), never "Locus says", never a number the message did not
 * already have. Client channels never come through here (client sends, Pulse "send to all clients", the welcome). */
import { tagOf, teamPost } from './morningcard.js';

export const COLE = 'U06C37MDWD7';
export const LANES = ['MEDIA BUYING', 'CREATIVE', 'CREATORS', 'CLIENT', 'EMAIL', 'OPS'];
export const ROUNDUP_HOUR = 16;          // 4pm Central; settings.fyiRoundupHour overrides
const ROUNDUP_PER_LANE = 8;              // lines a lane shows before "and N more"
const KEEP_DAYS = 14;                    // posted (or stuck) FYI rows older than this are deleted
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
const ALIAS = {
  media: 'MEDIA BUYING', 'media buying': 'MEDIA BUYING', buying: 'MEDIA BUYING', buyer: 'MEDIA BUYING', ads: 'MEDIA BUYING',
  creative: 'CREATIVE', 'creative strategy': 'CREATIVE', strat: 'CREATIVE', brief: 'CREATIVE', production: 'CREATIVE', organic: 'CREATIVE',
  creators: 'CREATORS', creator: 'CREATORS', trybe: 'CREATORS',
  client: 'CLIENT', 'client update': 'CLIENT', cole: 'CLIENT', offer: 'CLIENT',
  email: 'EMAIL', sms: 'EMAIL',
  ops: 'OPS', site: 'OPS', system: 'OPS',
};

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** No em or en dashes anywhere Locus writes (Cole's standing rule). */
export const noDash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ');
const one = s => noDash(String(s ?? '').replace(/\s+/g, ' ').trim());
/* Slack mrkdwn the caller already built (links <url|x>, tags <@U>, *bold*) passes through; only stray dashes go. */
const plain = s => one(s).replace(/<@[A-Z0-9]+>/g, '').replace(/<([^|>]+)\|([^>]+)>/g, '$2').replace(/<(https?:[^>]+)>/g, '$1').replace(/[*_~]/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

/** Any spelling of a lane (an area, a role, a lane key) to one of LANES; unknown = OPS. */
export function laneName(l) {
  const k = String(l || '').trim();
  if (LANES.includes(k.toUpperCase())) return k.toUpperCase();
  return ALIAS[k.toLowerCase()] || 'OPS';
}
/** A p_action area (actions.js AREAS) to its lane. A brief task is CREATIVE. */
export function laneOfArea(area, kind) {
  if (kind === 'brief') return 'CREATIVE';
  return { ads: 'MEDIA BUYING', email: 'EMAIL', organic: 'CREATIVE', site: 'OPS', ops: 'OPS', client: 'CLIENT' }[area] || null;
}
const realName = n => /^[A-Z][a-z]+$/.test(String(n || '').split(' ')[0]) && !/^the\b/i.test(String(n || ''));
/** Who a lane tags on a brand. team = calendar.js teamOf(...)[act] ({strat, buyer, email}). Cole when nobody is named. */
export function laneOwner(lane, team = {}) {
  const t = team || {};
  const L = laneName(lane);
  const pick = (...c) => c.find(realName) || 'Cole';
  if (L === 'MEDIA BUYING') return pick(t.buyer);
  if (L === 'EMAIL') return pick(t.email, t.strat);
  if (L === 'OPS') return 'Cole';
  return pick(t.strat);
}

/** The tag text for a person, without any lookup: a Slack id, a ready tag, a bold name, else the name in bold. */
export function whoText(who) {
  const w = String(who ?? '').trim();
  /* Nobody named ("the strategist", "the client", "Nobody owns these") = Cole. */
  if (!w || /^(cole|the|nobody|someone)\b/i.test(w)) return `<@${COLE}>`;
  if (/^<[@!]/.test(w) || /^\*[^*]+\*$/.test(w)) return w;
  if (/^[UW][A-Z0-9]{6,}$/.test(w)) return `<@${w}>`;
  return `*${esc(w.split(' ')[0])}*`;
}
/** The person resolved to a real Slack tag when Slack knows them (morningcard.js tagOf), else whoText. */
export async function laneWho(env, d, who) {
  const w = String(who ?? '').trim();
  if (!w || /^(cole|the|nobody|someone)\b/i.test(w) || /^<[@!]/.test(w) || /^[UW][A-Z0-9]{6,}$/.test(w) || /^\*[^*]+\*$/.test(w)) return whoText(w);
  /* "Ahsan + Noma" tags both. */
  const many = w.split(/\s*(?:\+|&|,|\band\b)\s*/).map(x => x.trim()).filter(Boolean);
  if (many.length > 1) return [...new Set(await Promise.all(many.map(x => laneWho(env, d, x))))].join(' ');
  if (d && d.slackApi) { const t = await tagOf(env, d, w).catch(() => null); if (t) return t; }
  if (d && typeof d.tagOf === 'function') { const t = await d.tagOf(env, w).catch(() => null); if (t) return t; }
  return whoText(w);
}

export const laneHead = (lane, brand) => `*${laneName(lane)} · ${esc(one(brand) || 'Agency')}*`;

/* Buttons: blocks pass through; button elements share one actions block, a repeated action_id (noop_open) starts a new
   block (an id must be unique inside a block); {label, url} is shorthand for an Open link button. */
function buttonBlocks(buttons) {
  const out = [];
  let cur = null;
  for (const b of buttons || []) {
    if (!b) continue;
    if (b.type && b.type !== 'button') { out.push(b); cur = null; continue; }
    const el = b.type === 'button' ? b : { type: 'button', action_id: b.action_id || 'noop_open', text: { type: 'plain_text', text: String(b.label || b.text || 'Open').slice(0, 75) }, ...(b.url ? { url: b.url } : {}), ...(b.value ? { value: b.value } : {}), ...(b.style ? { style: b.style } : {}) };
    const id = el.action_id || '';
    if (!cur || cur.elements.length >= 5 || (id && cur.elements.some(e => e.action_id === id))) { cur = { type: 'actions', elements: [] }; out.push(cur); }
    cur.elements.push(el);
  }
  return out;
}

/** ONE ask. who = a name, a Slack id or a ready tag (laneWho resolves a name first when it can). lines = optional short
 *  list of what the ask covers (at most 5 shown). Returns {text, blocks}; text = "LANE · Brand: ask" for notifications. */
export function laneBlocks({ lane, brand, who, ask, why, buttons, lines } = {}) {
  const L = laneName(lane), B = one(brand) || 'Agency';
  const askT = one(ask), whyT = one(why);
  const list = (lines || []).map(one).filter(Boolean);
  const body = [laneHead(L, B), `${whoText(who)}  ${askT}`];
  if (whyT) body.push(`Why: ${whyT}`);
  for (const l of list.slice(0, 5)) body.push(`• ${l}`);
  if (list.length > 5) body.push(`_and ${list.length - 5} more in Locus_`);
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: body.join('\n').slice(0, 2900) } }, ...buttonBlocks(buttons)];
  return { text: `${L} · ${B}: ${plain(askT)}`.slice(0, 3000), blocks };
}

/** Several asks in one message: groups = [{lane, brand, items: [{who, ask, why}]}] (same lane + brand groups merge).
 *  One section per group: its header, then each person tagged once with their asks as bullets under it. opts.foot = quiet lines
 *  under the asks (context), opts.buttons as laneBlocks. Returns {text, blocks}. */
export function laneLines(groups, { foot, buttons } = {}) {
  const merged = [];
  for (const g of groups || []) {
    const items = (g.items || []).filter(i => i && one(i.ask));
    if (!items.length) continue;
    const key = `${laneName(g.lane)}|${one(g.brand) || 'Agency'}`;
    const hit = merged.find(m => m.key === key);
    if (hit) hit.items.push(...items); else merged.push({ key, lane: laneName(g.lane), brand: one(g.brand) || 'Agency', items: [...items] });
  }
  /* 2026-11-09 (Cole): one tag per person, their asks as bullets under it, never the same tag on line after line. */
  const lineOf = i => `• ${one(i.ask)}${one(i.why) ? ` _(${one(i.why)})_` : ''}`;
  const blocks = [];
  for (const g of merged) {
    const people = [];
    for (const i of g.items) {
      const w = whoText(i.who);
      const hit = people.find(p => p.who === w);
      if (hit) hit.items.push(i); else people.push({ who: w, items: [i] });
    }
    let cur = [laneHead(g.lane, g.brand)];
    for (const p of people) {
      cur.push(p.who);
      for (const i of p.items) {
        const l = lineOf(i);
        if (cur.join('\n').length + l.length > 2800) { blocks.push({ type: 'section', text: { type: 'mrkdwn', text: cur.join('\n') } }); cur = [laneHead(g.lane, g.brand), p.who]; }
        cur.push(l);
      }
    }
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: cur.join('\n') } });
  }
  const f = (foot || []).map(one).filter(Boolean);
  if (f.length) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: f.join('\n').slice(0, 2900) }] });
  blocks.push(...buttonBlocks(buttons));
  const first = merged[0], n = merged.reduce((s, g) => s + g.items.length, 0);
  const head = first ? `${first.lane} · ${first.brand}: ${plain(first.items[0].ask)}${n > 1 ? ` (and ${n - 1} more)` : ''}` : plain(f[0] || '');
  /* The notification line first, then every line of the message (the Slack index and the Locus previews read it). */
  const body = blocks.filter(b => b.type === 'section' || b.type === 'context').map(b => (b.text ? b.text.text : (b.elements || []).map(e => e.text).join(' ')));
  return { text: [head, ...body].join('\n').slice(0, 3900), blocks };
}

/** Resolve the person, build the ask and post it. opts.thread = under today's morning card in that channel (teamPost);
 *  the rest of opts go to slackPost (username, thread_ts, ...). d needs slackPost (and slackApi to resolve names). */
export async function lanePost(env, d, channel, msg, opts = {}) {
  const { thread, ...rest } = opts;
  const who = await laneWho(env, d, msg.who);
  const m = laneBlocks({ ...msg, who });
  const o = { username: 'Locus', ...rest };
  if (thread && d && d.slackPost) return teamPost(env, d, channel, m.text, m.blocks, o);
  return d.slackPost(env, channel, m.text, m.blocks, o);
}

/* ---------- the FYI roundup ---------- */
const centralDay = (t = new Date()) => new Date(t.toLocaleString('en-US', { timeZone: 'America/Chicago' })).toISOString().slice(0, 10);
const centralHourNow = () => +new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }) % 24;
export const FYI_SQL = [
  `CREATE TABLE IF NOT EXISTS slack_fyi (id INTEGER PRIMARY KEY AUTOINCREMENT, act_id TEXT NOT NULL DEFAULT '', lane TEXT NOT NULL, line TEXT NOT NULL,
    day TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), posted_at TEXT, UNIQUE (act_id, day, lane, line))`,
  `CREATE INDEX IF NOT EXISTS slack_fyi_open ON slack_fyi (posted_at, act_id)`,
];
let fyiReady = false;
export async function ensureFyi(env) {
  if (fyiReady) return;
  for (const s of FYI_SQL) await env.DB.prepare(s).run();
  fyiReady = true;
}
/** Queue one FYI line for the brand's end-of-day roundup instead of posting it. act '' = the agency roundup.
 *  The same line twice in a day is stored once. Never throws (an FYI must not break the job that made it). */
export async function fyi(env, { act, lane, line } = {}) {
  const l = one(line).slice(0, 400);
  if (!l || !env || !env.DB) return false;
  try {
    await ensureFyi(env);
    await env.DB.prepare(`INSERT OR IGNORE INTO slack_fyi (act_id, lane, line, day) VALUES (?1, ?2, ?3, ?4)`).bind(String(act || ''), laneName(lane), l, centralDay()).run();
    return true;
  } catch (e) { console.log('fyi: ' + e.message); return false; }
}
const dayLabel = ymd => new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
/** The roundup for one brand: "FYI · Brand · Mon Nov 9", then each lane in LANES order with its lines. */
export function roundupMessage(brand, date, rows, { act } = {}) {
  const B = one(brand) || 'Agency';
  const L = [`*FYI · ${esc(B)} · ${dayLabel(date)}*`];
  for (const lane of LANES) {
    const mine = rows.filter(r => laneName(r.lane) === lane);
    if (!mine.length) continue;
    L.push(`*${lane}*`);
    for (const r of mine.slice(0, ROUNDUP_PER_LANE)) L.push(`• ${one(r.line)}`);
    if (mine.length > ROUNDUP_PER_LANE) L.push(`_and ${mine.length - ROUNDUP_PER_LANE} more_`);
  }
  const blocks = [];
  let cur = [];
  for (const l of L) { if (cur.join('\n').length + l.length > 2800) { blocks.push({ type: 'section', text: { type: 'mrkdwn', text: cur.join('\n') } }); cur = []; } cur.push(l); }
  if (cur.length) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: cur.join('\n') } });
  if (act) blocks.push(...buttonBlocks([{ label: `Open ${B} in Locus`, url: `${LOCUS}?act=${encodeURIComponent(act)}` }]));
  return { text: `FYI · ${B}: ${rows.length} thing${rows.length === 1 ? '' : 's'} from today`, blocks };
}
/** The hourly pass: from ROUNDUP_HOUR Central to midnight, once a Central day per brand, one post with that brand's
 *  waiting lines (anything queued after its post waits for tomorrow's). d = {listAccounts | listBrands, slackPost,
 *  getSetting?, putSetting?, centralHour?, centralDate?, canAfford?}. Settings: fyiRoundup ('off'), fyiRoundupHour. */
export async function roundupTick(env, d) {
  const get = async k => (d.getSetting ? d.getSetting(env, k) : (await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(k).first().catch(() => null))?.value ?? null);
  const put = (k, v) => (d.putSetting ? d.putSetting(env, k, v) : env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(k, String(v)).run());
  if ((await get('fyiRoundup')) === 'off') return { skipped: 'off' };
  const raw = await get('fyiRoundupHour');
  const h = raw == null || raw === '' ? NaN : +raw;
  const from = Number.isInteger(h) && h >= 0 && h <= 23 ? h : ROUNDUP_HOUR;
  const hour = d.centralHour ? d.centralHour() : centralHourNow();
  if (hour < from) return { skipped: `before ${from}:00 Central` };
  const today = d.centralDate ? d.centralDate() : centralDay();
  await ensureFyi(env);
  let st = {}; try { st = JSON.parse((await get('fyiRoundupDone')) || '{}') || {}; } catch {}
  if (st.date !== today) st = { date: today, acts: {} };
  st.acts = st.acts || {};
  const { results } = await env.DB.prepare(`SELECT id, act_id, lane, line, day FROM slack_fyi WHERE posted_at IS NULL ORDER BY act_id, id LIMIT 600`).all();
  const by = new Map();
  for (const r of results || []) { if (st.acts[r.act_id || '']) continue; const k = r.act_id || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  const out = { date: today, posted: [], dropped: [], errors: [] };
  if (!by.size) return { ...out, skipped: 'nothing waiting' };
  const brands = d.listAccounts ? await d.listAccounts(env, true) : d.listBrands ? await d.listBrands(env) : [];
  const agencyCh = await get('slackChannel');
  const mark = async (rows, v) => { for (let i = 0; i < rows.length; i += 50) { const ids = rows.slice(i, i + 50).map(r => r.id); await env.DB.prepare(`UPDATE slack_fyi SET posted_at = ?1 WHERE id IN (${ids.map((_, j) => `?${j + 2}`).join(',')})`).bind(v, ...ids).run(); } };
  for (const [act, rows] of by) {
    if (d.canAfford && !d.canAfford(6)) { out.deferred = 'budget'; break; }
    const b = act ? (brands || []).find(x => x.act_id === act) : null;
    /* The brand's INTERNAL channel only (never the client's); agency lines go to the agency alerts channel. */
    const ch = act ? (b && b.slack_channel && b.slack_channel !== b.brief_channel ? b.slack_channel : null) : agencyCh;
    if (!ch) { await mark(rows, 'no channel'); st.acts[act] = 'no channel'; out.dropped.push(b ? b.name : act || 'agency'); continue; }
    try {
      const m = roundupMessage(b ? b.name : 'Agency', today, rows, { act: act || null });
      const p = await d.slackPost(env, ch, m.text, m.blocks, { username: 'Locus' });
      if (p && p.ok === false) throw new Error(p.error || 'Slack refused the post');
      await mark(rows, new Date().toISOString());
      st.acts[act] = `posted ${rows.length}`;
      out.posted.push(`${b ? b.name : 'Agency'} (${rows.length})`);
    } catch (e) { out.errors.push(`${b ? b.name : 'Agency'}: ${e.message}`); }
  }
  await put('fyiRoundupDone', JSON.stringify(st)).catch(() => {});
  await env.DB.prepare(`DELETE FROM slack_fyi WHERE day < ?1`).bind(new Date(Date.parse(today + 'T12:00:00Z') - KEEP_DAYS * 864e5).toISOString().slice(0, 10)).run().catch(() => {});
  return out;
}
