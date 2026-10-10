/* THE CALENDAR (2026-10-09: Lineup moved into Locus). Audit, goal and mocks: docs/handoffs/lineup-audit.md,
 * docs/locus-hub/mocks-calendar.html (artifact https://claude.ai/artifact/Umoq9q2cYe1n889Sdo7RLV).
 *
 * THE GOAL: the dates customers see drive the work that has to be ready for them. Every drop or sale gets a
 * countdown (photos, ads briefed, built, email scheduled, ads loaded) that TICKS ITSELF, because nobody ticks
 * boxes by hand (Season's tasks: two stored rows ever, both open):
 *   photos in       a photos/assets link on the date
 *   offer written   the offer text is there and the date is confirmed (Season: the phase is locked)
 *   briefed, built  the Asana task made from the date is completed (Make the Asana tasks); or a manual tick
 *   email           a Klaviyo email or SMS campaign scheduled or sent within a day of going live
 *   ads loaded      new ads created in the brand's Meta accounts in the 10 days before going live
 *
 * ONE LIST, FOUR SOURCES, NOTHING TYPED TWICE:
 *   typed     the Lineup table `events` in the marketing-hub D1 (binding CAL), the SAME rows the old Lineup app
 *             reads and writes, so Nick (Grunk) and Dartee keep working there until clients sign in to Locus.
 *             Lineup keys brands by slug with hyphens (lucky-golf); Locus brand ids are brand_<slug with
 *             underscores>. New rows carry `locus_brand` (the brand id); old rows are mapped by slug.
 *   season    p_season_phase (the Black Friday plan), read-only here; edited on the season page.
 *   drops     Supply collections' on-site dates (Products > Drops), read-only.
 *   emails    Klaviyo campaigns, scheduled and sent (cached an hour per brand).
 *
 * Routes (admin = the team): GET /api/calendar?act=all|<brand>&from&to, POST /api/calendar/event (create or
 * update), POST /api/calendar/move {id, start}, POST /api/calendar/end {id, date}, POST /api/calendar/tick
 * {id, key, done}, POST /api/calendar/asana {id}, DELETE /api/calendar/event?id= (cancel; Lineup keeps it as
 * cancelled), POST /api/calendar/restore {id}.
 * Slack (calendarTick, hourly cron, from 8am Central, once a day): the day before and a week before a date (the
 * week-out only when something is still open), a client's new or moved date (Lineup changelog rows not written
 * by the team), and on Mondays "still running?" for a sale with no end date. Each brand's internal channel.
 * Switch: settings calendarPost = 'off'. */
import { metaOf } from './brands.js';
import { keyFor, klaviyo } from './klaviyo.js';
import { supplyFetch } from './stock.js';
import { clientScope } from './brandguard.js';

let F = (...a) => fetch(...a);
/** The worker hands in its counted fetch (xfetch), like every other module. */
export function useFetch(f) { F = f; }

const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const SKIP = /galway|instyler|gum of gods|judy ?p|le ?pickle|popby|golf sock|harborline/i;
const safe = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const add = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const md = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const wd = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const centralToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

/* Lineup's type keys <-> the calendar's five kinds. Writes use Lineup keys so the old app still shows them. */
const KIND_OF = { product_launch: 'drop', restock: 'drop', promo: 'sale', ad_push: 'adpush', evergreen_push: 'adpush', site_change: 'site', content_moment: 'other', other: 'other' };
const KEY_OF = { drop: 'product_launch', sale: 'promo', adpush: 'ad_push', site: 'site_change', other: 'other' };
export const KIND_LABEL = { drop: 'Drop or launch', sale: 'Sale or offer', adpush: 'Ad push', site: 'Site change', other: 'Other' };
const slugOf = brandId => String(brandId || '').replace(/^brand_/, '').replace(/_/g, '-');
const idOfSlug = slug => 'brand_' + String(slug || '').replace(/-/g, '_');

/* The countdown per kind: [key, label, days before going live, who]. Season phases use the season plan's own
   offsets (profit/worker/src/season.js STD: offer -30, briefs -23, built -9, loaded -4). */
const STEPS = {
  drop: [['assets', 'Photos in', -14, 'client'], ['briefs', 'Ads briefed', -12, 'strat'], ['built', 'Ads built', -5, 'strat'], ['email', 'Email and text scheduled', -3, 'email'], ['loaded', 'Ads loaded', -2, 'buyer']],
  sale: [['offer', 'Offer written', -21, 'cole'], ['briefs', 'Ads briefed', -14, 'strat'], ['built', 'Ads built', -5, 'strat'], ['email', 'Email and text scheduled', -3, 'email'], ['loaded', 'Ads loaded', -2, 'buyer']],
  adpush: [['briefs', 'Ads briefed', -14, 'strat'], ['built', 'Ads built', -5, 'strat'], ['loaded', 'Ads loaded', -2, 'buyer']],
  other: [['briefs', 'Ads briefed', -14, 'strat'], ['built', 'Ads built', -5, 'strat'], ['loaded', 'Ads loaded', -2, 'buyer']],
  site: [],
  season: [['offer', 'Offer locked', -30, 'cole'], ['briefs', 'Ads briefed', -23, 'strat'], ['built', 'Ads built', -9, 'strat'], ['loaded', 'Ads loaded', -4, 'buyer']],
};
const ASANA_STEPS = ['briefs', 'built', 'email', 'loaded'];   // the steps "Make the Asana tasks" makes a task for

let ensured = false;
async function ensure(env) {
  if (ensured || !env.CAL) return;
  for (const sql of ['ALTER TABLE events ADD COLUMN locus_brand TEXT', 'ALTER TABLE events ADD COLUMN asana TEXT', 'ALTER TABLE events ADD COLUMN ticks TEXT'])
    await env.CAL.prepare(sql).run().catch(() => {});
  ensured = true;
}

/** Who is who on a brand: the season call sheet's strategist / buyer / email owner (first name), else the defaults. */
async function teamOf(env, ids) {
  const out = {};
  const rows = ids.length ? (await env.DB.prepare(`SELECT act_id, key, value FROM p_season_answer WHERE key IN ('strategist','buyer','email_owner') AND act_id IN (${ids.map((_, i) => `?${i + 1}`).join(',')})`).bind(...ids).all().catch(() => ({ results: [] }))).results || [] : [];
  for (const id of ids) out[id] = { strat: 'Ahsan', buyer: 'Ahsan', email: 'the email owner', cole: 'Cole' };
  const short = v => String(v || '').split(/[.(,]/)[0].trim().slice(0, 40);
  for (const r of rows) { const t = out[r.act_id]; if (!t || !short(r.value) || /^unknown/i.test(r.value)) continue; if (r.key === 'strategist') t.strat = short(r.value); if (r.key === 'buyer') t.buyer = short(r.value); if (r.key === 'email_owner') t.email = short(r.value); }
  return out;
}

/** The brands this calendar covers: active, not paused, not the test account. */
async function brandsList(env, act) {
  const { results } = await env.DB.prepare(`SELECT act_id, name, slack_channel, brief_channel FROM brand_accounts WHERE active = 1 ORDER BY name`).all();
  return (results || []).filter(b => !SKIP.test(b.name || '') && (act === 'all' || !act || b.act_id === act));
}

/* ---------- the four sources ---------- */
async function typedEvents(env, ids, from, to) {
  if (!env.CAL || !ids.length) return [];
  await ensure(env);
  const slugs = ids.map(slugOf);
  const qs = [...ids, ...slugs].map((_, i) => `?${i + 3}`);
  const { results } = await env.CAL.prepare(`SELECT * FROM events WHERE status != 'cancelled' AND (locus_brand IN (${qs.slice(0, ids.length).join(',')}) OR brand_id IN (${qs.slice(ids.length).join(',')}))
    AND launch_date <= ?2 AND COALESCE(promo_end_date, launch_date) >= ?1 ORDER BY launch_date`).bind(from, to, ...ids, ...slugs).all().catch(() => ({ results: [] }));
  return (results || []).map(e => {
    const kind = KIND_OF[e.type] || 'other';
    const act = e.locus_brand || idOfSlug(e.brand_id);
    /* One-day kinds end the day they start; a sale with no end date stays open (end null) and is flagged. */
    const end = kind === 'sale' ? (e.promo_end_date || null) : (e.promo_end_date || e.launch_date);
    let ch = []; try { ch = Object.entries(safe(e.channels, {})).filter(([, v]) => v && v.involved).map(([k]) => k); } catch {}
    return { id: e.id, src: 'cal', act, name: e.name, kind, start: e.launch_date, end, teaser: e.teaser_start || null, status: e.status === 'confirmed' || e.status === 'completed' ? 'conf' : 'pen',
      offer: e.brief || '', notes: e.notes || '', assets: e.assets_link || null, assets_due: e.asset_deadline || null, stock_lands: e.inventory_date || null, channels: ch, by: e.owner || e.updated_by || '',
      updated_by: e.updated_by || '', created_at: e.created_at, asana: safe(e.asana, {}), ticks: safe(e.ticks, {}), editable: true };
  });
}
function seasonKind(p) {
  const n = `${p.key} ${p.name}`.toLowerCase();
  if (/\bdrop\b|putters|irons|apparel|sets|launch|driver|havoc/.test(n)) return 'drop';
  if (/giveaway|list|signup|sign up|announc|tease|lead/.test(n) && !/offer|off\b|\$/.test(String(p.offer || '').slice(0, 0))) return 'other';
  return 'sale';
}
async function seasonEvents(env, ids, from, to) {
  if (!ids.length) return [];
  const qs = ids.map((_, i) => `?${i + 3}`).join(',');
  const [ph, tk] = await Promise.all([
    env.DB.prepare(`SELECT * FROM p_season_phase WHERE act_id IN (${qs}) AND status != 'skip' AND start IS NOT NULL AND start <= ?2 AND COALESCE("end", start) >= ?1`).bind(from, to, ...ids).all().then(r => r.results || []).catch(() => []),
    env.DB.prepare(`SELECT act_id, id, done FROM p_season_task WHERE act_id IN (${qs.replace(/\?(\d+)/g, (m, n) => `?${n - 2}`)})`).bind(...ids).all().then(r => r.results || []).catch(() => []),
  ]);
  const off = new Set((await env.DB.prepare(`SELECT act_id FROM p_season_answer WHERE key = 'in_season' AND value = 'no'`).all().catch(() => ({ results: [] }))).results?.map(r => r.act_id) || []);
  const done = new Set(tk.filter(t => t.done).map(t => `${t.act_id}|${t.id}`));
  return ph.filter(p => !off.has(p.act_id)).map(p => ({ id: `season:${p.act_id}:${p.key}`, src: 'season', act: p.act_id, key: p.key, name: p.name, kind: seasonKind(p), start: p.start, end: p.end || p.start,
    status: p.status === 'locked' ? 'conf' : p.status === 'missing' ? 'miss' : 'pen', offer: p.offer || '', by: 'the Black Friday plan', editable: false,
    seasonDone: Object.fromEntries(['briefs', 'built', 'loaded'].map(k => [k, done.has(`${p.act_id}|${p.key}:${k}`)])) }));
}
async function dropEvents(env, brands, from, to) {
  if (!env.SUPPLY || !env.SUPPLY_TOKEN) return [];
  const out = [];
  let list = null; try { list = await supplyFetch(env, '/api/brands'); } catch { return []; }
  for (const b of brands) {
    const sb = (list.brands || []).find(x => x.active && x.makes && (x.act_id === b.act_id));
    if (!sb) continue;
    try {
      const st = await supplyFetch(env, '/api/state', { brand: sb.id });
      for (const c of st.collections || []) if (c.drop_at && c.drop_at >= from && c.drop_at <= to)
        out.push({ id: `drop:${b.act_id}:${c.id}`, src: 'drop', act: b.act_id, name: c.name, kind: 'drop', start: c.drop_at, end: c.drop_at, status: 'conf', offer: `${(c.designs || []).length || ''} new designs on the site`.trim(), by: 'Products > Drops', editable: false });
    } catch {}
  }
  return out;
}
/** Klaviyo email + SMS campaigns, scheduled and sent, from 30 days back; cached an hour per brand. */
async function klaviyoSends(env, act) {
  const ck = `calklv:${act}`;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(ck).first().catch(() => null);
  const hit = safe(row?.value, null); if (hit && hit.at && Date.now() - Date.parse(hit.at) < 3600e3) return hit.sends;
  const doc = await keyFor(env, act).catch(() => null); if (!doc?.key) return [];
  const since = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 19) + 'Z';
  const sends = [];
  for (const ch of ['email', 'sms']) {
    try {
      const r = await klaviyo(doc.key, `/api/campaigns/?filter=${encodeURIComponent(`and(equals(messages.channel,'${ch}'),greater-or-equal(updated_at,${since}))`)}&fields[campaign]=name,status,send_time,scheduled_at&sort=-updated_at`);
      for (const c of r.data || []) { const a = c.attributes || {}; if (!a.send_time || /cancel|draft/i.test(a.status || '')) continue; sends.push({ date: String(a.send_time).slice(0, 10), name: a.name || 'Campaign', status: /sent/i.test(a.status || '') ? 'sent' : 'scheduled', channel: ch }); }
    } catch {}
  }
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(ck, JSON.stringify({ at: new Date().toISOString(), sends })).run().catch(() => {});
  return sends;
}
/** The brand's Meta ads created per day (for the "ads loaded" tick). */
async function newAdsByDay(env, act, from, to) {
  const { results } = await env.DB.prepare(`SELECT substr(created_time, 1, 10) d, COUNT(*) n FROM ads WHERE act_id IN ${metaOf(1)} AND substr(created_time, 1, 10) BETWEEN ?2 AND ?3 GROUP BY d`).bind(act, from, to).all().catch(() => ({ results: [] }));
  return Object.fromEntries((results || []).map(r => [r.d, r.n]));
}
/** Asana task completion for the tasks the calendar made, per brand project (cached 10 minutes). */
async function asanaDone(env, act, gids) {
  if (!gids.length || !env.ASANA_TOKEN) return {};
  const ck = `calasana:${act}`;
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = ?1`).bind(ck).first().catch(() => null);
  const hit = safe(row?.value, null); if (hit && hit.at && Date.now() - Date.parse(hit.at) < 600e3 && gids.every(g => g in hit.done)) return hit.done;
  const done = {};
  for (let i = 0; i < gids.length; i += 20) {
    await Promise.all(gids.slice(i, i + 20).map(async g => {
      try { const r = await F(`https://app.asana.com/api/1.0/tasks/${g}?opt_fields=completed`, { headers: { Authorization: `Bearer ${env.ASANA_TOKEN.trim()}` } }); const j = await r.json(); done[g] = !!j?.data?.completed; } catch { done[g] = false; }
    }));
  }
  await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(ck, JSON.stringify({ at: new Date().toISOString(), done })).run().catch(() => {});
  return done;
}

/* ---------- the countdown ---------- */
function stepsFor(e, team, today, sig) {
  const kind = e.src === 'season' ? 'season' : e.kind;
  const T = team[e.act] || { strat: 'Ahsan', buyer: 'Ahsan', email: 'the email owner', cole: 'Cole' };
  if (e.src === 'drop' || e.src === 'email') return [];
  return (STEPS[kind] || []).map(([key, label, off, role]) => {
    const due = key === 'assets' && e.assets_due ? e.assets_due : add(e.start, off);
    const who = role === 'client' ? 'the client' : T[role] || role;
    let done = false, note = '', how = '';
    if (key === 'offer') { done = !!(e.offer && e.status === 'conf'); note = e.status === 'miss' ? 'No offer written yet' : done ? 'Written and confirmed' : e.offer ? 'Written, not confirmed yet' : 'Not written yet'; how = e.src === 'season' ? 'Locked on the Black Friday plan' : 'The offer is on the date and it is confirmed'; }
    if (key === 'assets') { done = !!e.assets; note = done ? 'Photos link on the date' : 'No photos link yet'; how = 'A photos link (Drive, Air, Dropbox) on the date'; }
    if (key === 'email') { const m = (sig.sends || []).filter(s => s.date >= add(e.start, -1) && s.date <= add(e.start, 1)); done = m.length > 0; note = done ? `Klaviyo: ${m[0].name}${m.length > 1 ? ` and ${m.length - 1} more` : ''}` : sig.klaviyo ? 'No Klaviyo send around the day yet' : 'Klaviyo is not connected for this brand'; how = 'A Klaviyo email or text scheduled within a day of going live'; }
    if (key === 'loaded') { const n = Object.entries(sig.ads || {}).filter(([d]) => d >= add(e.start, -10) && d <= e.start).reduce((s, [, v]) => s + v, 0); done = n > 0; note = done ? `${n} new ad${n === 1 ? '' : 's'} in Meta` : 'No new ads in Meta yet'; how = 'New ads created in Meta in the 10 days before'; }
    if (key === 'briefs' || key === 'built') { note = 'Not ticked'; how = 'The Asana task made from this date is completed'; }
    const gid = e.asana && e.asana[key];
    if (gid) { const c = (sig.asana || {})[gid]; if (c) { done = true; note = 'Asana task completed'; } else if (!done) note = 'Asana task open'; }
    if (e.src === 'season' && e.seasonDone && e.seasonDone[key]) { done = true; note = 'Ticked on the Black Friday plan'; }
    const t = e.ticks && e.ticks[key]; if (t && !done) { done = true; note = `Ticked by ${t.by || 'someone'}`; }
    if ((key === 'briefs' || key === 'built') && !gid && !done) note = e.src === 'season' ? 'Not ticked (tasks live on the Black Friday plan)' : 'No Asana task yet';
    const state = done ? 'done' : due < today ? 'late' : 'open';
    return { key, label, due, who, state, note, how, asana: gid || null };
  });
}

/** Everything on the calendar for some brands between two dates, with the countdowns worked out. */
export async function calendarData(env, { act = 'all', from, to, today, lite = false } = {}) {
  today = today || centralToday();
  from = from || add(today, -21); to = to || add(today, 120);
  const brands = await brandsList(env, act);
  const ids = brands.map(b => b.act_id);
  const [typed, season, drops, team] = await Promise.all([typedEvents(env, ids, from, to), seasonEvents(env, ids, from, to), dropEvents(env, brands, from, to), teamOf(env, ids)]);
  const items = [...typed, ...season, ...drops];
  /* lite: the dates only (chart bands), no Klaviyo, Meta or Asana reads and no countdown. */
  if (lite) { items.sort((a, b) => a.start.localeCompare(b.start)); return { today, from, to, brands: brands.map(b => ({ id: b.act_id, name: b.name })), items: items.map(e => ({ ...e, steps: [], kind_label: KIND_LABEL[e.kind] })), emails: [] }; }
  const emails = [];
  const sig = {};
  await Promise.all(brands.map(async b => {
    const has = items.some(e => e.act === b.act_id);
    const klv = await env.DB.prepare(`SELECT 1 FROM p_br_doc WHERE act_id = ?1 AND line_id = '' AND key = 'klaviyo'`).bind(b.act_id).first().catch(() => null);
    const sends = klv ? await klaviyoSends(env, b.act_id).catch(() => []) : [];
    for (const s of sends) if (s.date >= from && s.date <= to) emails.push({ act: b.act_id, ...s });
    const gids = items.filter(e => e.act === b.act_id && e.asana).flatMap(e => Object.values(e.asana || {})).filter(Boolean);
    sig[b.act_id] = { klaviyo: !!klv, sends, ads: has ? await newAdsByDay(env, b.act_id, add(from, -12), to) : {}, asana: await asanaDone(env, b.act_id, gids).catch(() => ({})) };
  }));
  /* The countdown is for what is still coming: once a date has gone live it has none (it happened). */
  for (const e of items) { e.steps = e.start <= today ? [] : stepsFor(e, team, today, sig[e.act] || {}); e.kind_label = KIND_LABEL[e.kind]; }
  items.sort((a, b) => a.start.localeCompare(b.start));
  return { today, from, to, brands: brands.map(b => ({ id: b.act_id, name: b.name, channel: b.slack_channel || null, client_channel: b.brief_channel || null, team: team[b.act_id] })), items, emails };
}

/* ---------- writes ---------- */
async function actorName(env, email) {
  if (!email) return 'Locus';
  const p = await env.CAL.prepare(`SELECT name FROM people WHERE email = ?1`).bind(String(email).toLowerCase()).first().catch(() => null);
  if (p?.name) return p.name;
  const local = String(email).split('@')[0]; return local.charAt(0).toUpperCase() + local.slice(1);
}
async function log(env, e, summary, by) {
  await env.CAL.prepare(`INSERT INTO changelog (id, brand_id, event_id, event_name, change_summary, changed_by, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(crypto.randomUUID(), e.brand_id, e.id, e.name, summary, by, new Date().toISOString()).run().catch(() => {});
}
const clean = (s, n = 2000) => String(s ?? '').trim().slice(0, n);
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

async function saveEvent(env, b, by) {
  const now = new Date().toISOString();
  const kind = KEY_OF[b.kind] ? b.kind : 'other';
  if (!clean(b.name)) throw Object.assign(new Error('Give it a name.'), { status: 400 });
  if (!isDate(b.start)) throw Object.assign(new Error('Pick the day it goes live.'), { status: 400 });
  const end = b.end && isDate(b.end) ? b.end : null;
  if (end && end < b.start) throw Object.assign(new Error('It cannot end before it goes live.'), { status: 400 });
  const teaser = b.teaser && isDate(b.teaser) ? b.teaser : null;
  if (teaser && teaser > b.start) throw Object.assign(new Error('The teaser has to start on or before the day it goes live.'), { status: 400 });
  const chans = ['paid', 'email', 'sms', 'organic'];
  const channels = Object.fromEntries(chans.map(k => [k, (b.channels || []).includes(k) ? { involved: true, priority: 'primary' } : { involved: false, priority: null }]));
  if (!Object.values(channels).some(c => c.involved)) channels.paid = { involved: true, priority: 'primary' };
  const status = b.status === 'conf' ? 'confirmed' : 'tentative';
  const assets = b.assets && /^https?:\/\//i.test(String(b.assets).trim()) ? clean(b.assets, 500) : null;
  if (b.id) {
    const old = await env.CAL.prepare(`SELECT * FROM events WHERE id = ?1`).bind(b.id).first();
    if (!old) throw Object.assign(new Error('That date is gone.'), { status: 404 });
    await env.CAL.prepare(`UPDATE events SET name = ?2, type = ?3, status = ?4, brief = ?5, launch_date = ?6, promo_end_date = ?7, teaser_start = ?8, asset_deadline = ?9, channels = ?10,
      assets_link = ?11, locus_brand = COALESCE(locus_brand, ?12), updated_at = ?13, updated_by = ?14 WHERE id = ?1`)
      .bind(b.id, clean(b.name, 120), KEY_OF[kind], status, clean(b.offer), b.start, end, teaser, b.assets_due && isDate(b.assets_due) ? b.assets_due : old.asset_deadline, JSON.stringify(channels), assets, b.act, now, by).run();
    const ch = [];
    if (old.launch_date !== b.start) ch.push(`Moved from ${md(old.launch_date)} to ${md(b.start)}`);
    if ((old.promo_end_date || null) !== end) ch.push(end ? `Ends ${md(end)}` : 'End date removed');
    if (old.status !== status) ch.push(status === 'confirmed' ? 'Confirmed' : 'Pencilled');
    if ((old.brief || '') !== clean(b.offer)) ch.push('Offer changed');
    if ((old.assets_link || null) !== assets) ch.push(assets ? 'Photos link added' : 'Photos link removed');
    if (old.name !== clean(b.name, 120)) ch.push(`Renamed from ${old.name}`);
    if (ch.length) await log(env, { ...old, name: clean(b.name, 120) }, ch.join('; '), by);
    return b.id;
  }
  const id = crypto.randomUUID();
  const slug = slugOf(b.act);
  await env.CAL.prepare(`INSERT INTO events (id, brand_id, name, type, status, brief, launch_date, promo_end_date, inventory_date, asset_deadline, teaser_start, channels, owner, notes, assets_link,
    created_at, updated_at, updated_by, locus_brand, asana, ticks) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?10, ?11, ?12, NULL, ?13, ?14, ?14, ?12, ?15, '{}', '{}')`)
    .bind(id, slug, clean(b.name, 120), KEY_OF[kind], status, clean(b.offer), b.start, end, b.assets_due && isDate(b.assets_due) ? b.assets_due : null, teaser, JSON.stringify(channels), by, assets, now, b.act).run();
  await log(env, { id, brand_id: slug, name: clean(b.name, 120) }, `Added for ${md(b.start)}`, by);
  return id;
}

/** "Make the Asana tasks": one task per work step in the brand's Asana project, due on the step's date. */
async function makeAsana(env, id, by) {
  const e = await env.CAL.prepare(`SELECT * FROM events WHERE id = ?1`).bind(id).first();
  if (!e) throw Object.assign(new Error('That date is gone.'), { status: 404 });
  const act = e.locus_brand || idOfSlug(e.brand_id);
  const conn = await env.DB.prepare(`SELECT external_id FROM connections WHERE brand_id = ?1 AND kind = 'asana' LIMIT 1`).bind(act).first().catch(() => null);
  if (!conn?.external_id) throw Object.assign(new Error('This brand has no Asana project connected (Brand settings > Integrations).'), { status: 400 });
  if (!env.ASANA_TOKEN) throw Object.assign(new Error('Asana is not connected on the server.'), { status: 400 });
  const kind = KIND_OF[e.type] || 'other';
  const have = safe(e.asana, {});
  const made = {};
  const link = `${LOCUS}?open=calendar&act=${encodeURIComponent(act)}&ev=${encodeURIComponent(id)}`;
  for (const [key, label, off] of STEPS[kind] || []) {
    if (!ASANA_STEPS.includes(key) || have[key]) continue;
    const due = add(e.launch_date, off);
    const r = await F('https://app.asana.com/api/1.0/tasks', { method: 'POST', headers: { Authorization: `Bearer ${env.ASANA_TOKEN.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { name: `${e.name}: ${label.toLowerCase()}`, projects: [conn.external_id], due_on: due,
        notes: `${e.name} goes live ${wd(e.launch_date)} ${md(e.launch_date)}.\n\n${e.brief ? `What the customer sees: ${e.brief}\n\n` : ''}Made from the Locus calendar. Complete this task when it is done and the calendar ticks itself.\n${link}` } }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`Asana said no: ${j.errors?.[0]?.message || r.status}`), { status: 502 });
    made[key] = j.data.gid;
  }
  const all = { ...have, ...made };
  await env.CAL.prepare(`UPDATE events SET asana = ?2, updated_at = ?3 WHERE id = ?1`).bind(id, JSON.stringify(all), new Date().toISOString()).run();
  if (Object.keys(made).length) await log(env, e, `Asana tasks made: ${Object.keys(made).join(', ')}`, by);
  return { made: Object.keys(made).length, asana: all, project: conn.external_id };
}

export async function handleCalendar(request, env, url, path, json, isAdmin, sessionEmail) {
  if (!path.startsWith('/api/calendar')) return null;
  if (!(await isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  if (!env.CAL) return json({ error: 'The calendar database is not bound on the server (CAL).' }, 500);
  await ensure(env);
  /* A CLIENT LOGIN (2026-10-09) may read its brand, add a date, edit / move / end its brand's dates and leave a
     note. brandguard.js lets only those routes through and checks the brand in the query or body; a route that
     names a date by id is checked HERE against the date's own brand. The changelog row carries the client's
     name, so calendarTick tells the team in the brand's internal channel (it is not a team name). */
  const cs = clientScope(request);
  const by = cs ? (cs.name || cs.email.split('@')[0].replace(/^./, c => c.toUpperCase())) : await actorName(env, await sessionEmail(env, request).catch(() => null));
  const mine = async id => {
    if (!cs) return true;
    const e = id ? await env.CAL.prepare(`SELECT locus_brand, brand_id FROM events WHERE id = ?1`).bind(id).first().catch(() => null) : null;
    return !!e && cs.ids.has(e.locus_brand || idOfSlug(e.brand_id));
  };
  const notYours = () => json({ error: 'That date is not on your calendar.' }, 403);
  try {
    if (path === '/api/calendar' && request.method === 'GET') {
      return json(await calendarData(env, { act: url.searchParams.get('act') || 'all', from: url.searchParams.get('from') || undefined, to: url.searchParams.get('to') || undefined, lite: url.searchParams.get('lite') === '1' }));
    }
    if (path === '/api/calendar/client-preview' && request.method === 'GET') {
      const today = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : centralToday();
      const data = await calendarData(env, { act: 'all', from: add(today, -60), to: add(today, 30), today });
      return json({ date: today, on: (await env.DB.prepare(`SELECT value FROM settings WHERE key = 'calendarClient'`).first().catch(() => null))?.value === 'on',
        brands: data.brands.map(b => ({ brand: b.name, channel: b.client_channel || b.channel, posts: (b.client_channel || b.channel) ? clientMessages(data, b, today) : [], note: b.client_channel ? null : b.channel ? 'one channel: the client posts go to its internal channel' : 'no channel: nothing posts' })) });
    }
    if (path === '/api/calendar/history' && request.method === 'GET') {
      if (!(await mine(url.searchParams.get('id') || ''))) return notYours();
      const { results } = await env.CAL.prepare(`SELECT change_summary s, changed_by b, created_at t FROM changelog WHERE event_id = ?1 ORDER BY created_at DESC LIMIT 20`).bind(url.searchParams.get('id') || '').all();
      return json({ history: results || [] });
    }
    const body = request.method === 'DELETE' ? {} : await request.json().catch(() => ({}));
    /* The brand edition (2026-10-10): a client also removes and puts back its own brand's dates. Ticking the team's
       work steps and making Asana tasks (Mobius's Asana) stay the team's. */
    if (cs) {
      if (path === '/api/calendar/event' && request.method === 'DELETE') {
        if (!(await mine(url.searchParams.get('id') || ''))) return notYours();
      } else {
        const allowed = ['/api/calendar/event', '/api/calendar/move', '/api/calendar/end', '/api/calendar/comment', '/api/calendar/restore'];
        if (request.method !== 'POST' || !allowed.includes(path)) return json({ error: 'Ticking work steps and Asana tasks are for the Mobius team.' }, 403);
        if (path === '/api/calendar/event' && (!body.act || !cs.ids.has(body.act))) return notYours();
        if ((path !== '/api/calendar/event' || body.id) && !(await mine(body.id))) return notYours();
      }
    }
    /* A note on a date (clients and the team): one changelog line, shown in the date's history. */
    if (path === '/api/calendar/comment' && request.method === 'POST') {
      const e = await env.CAL.prepare(`SELECT * FROM events WHERE id = ?1`).bind(body.id).first();
      if (!e) return json({ error: 'That date is gone.' }, 404);
      const text = clean(body.text, 600).replace(/[<>]/g, '');
      if (!text) return json({ error: 'Write the note first.' }, 400);
      await log(env, e, `Note: ${text}`, by);
      return json({ ok: true });
    }
    if (path === '/api/calendar/event' && request.method === 'POST') {
      if (!body.act || !/^brand_/.test(body.act)) return json({ error: 'Pick a brand first.' }, 400);
      return json({ ok: true, id: await saveEvent(env, body, by) });
    }
    if (path === '/api/calendar/event' && request.method === 'DELETE') {
      const id = url.searchParams.get('id'); const e = await env.CAL.prepare(`SELECT * FROM events WHERE id = ?1`).bind(id).first();
      if (!e) return json({ error: 'That date is gone.' }, 404);
      await env.CAL.prepare(`UPDATE events SET status = 'cancelled', updated_at = ?2, updated_by = ?3 WHERE id = ?1`).bind(id, new Date().toISOString(), by).run();
      await log(env, e, 'Removed from the calendar', by);
      return json({ ok: true });
    }
    if (path === '/api/calendar/restore' && request.method === 'POST') {
      const e = await env.CAL.prepare(`SELECT * FROM events WHERE id = ?1`).bind(body.id).first();
      if (!e) return json({ error: 'That date is gone.' }, 404);
      await env.CAL.prepare(`UPDATE events SET status = 'tentative', updated_at = ?2, updated_by = ?3 WHERE id = ?1`).bind(body.id, new Date().toISOString(), by).run();
      await log(env, e, 'Put back on the calendar', by);
      return json({ ok: true });
    }
    if (path === '/api/calendar/move' && request.method === 'POST') {
      const e = await env.CAL.prepare(`SELECT * FROM events WHERE id = ?1`).bind(body.id).first();
      if (!e || !isDate(body.start)) return json({ error: 'Pick a day.' }, 400);
      const delta = Math.round((Date.parse(body.start) - Date.parse(e.launch_date)) / 864e5);
      if (!delta) return json({ ok: true });
      const sh = d => (d ? add(d, delta) : null);
      await env.CAL.prepare(`UPDATE events SET launch_date = ?2, promo_end_date = ?3, teaser_start = ?4, asset_deadline = ?5, inventory_date = ?6, updated_at = ?7, updated_by = ?8 WHERE id = ?1`)
        .bind(e.id, body.start, sh(e.promo_end_date), sh(e.teaser_start), sh(e.asset_deadline), sh(e.inventory_date), new Date().toISOString(), by).run();
      await log(env, e, `Moved from ${md(e.launch_date)} to ${md(body.start)}`, by);
      return json({ ok: true, from: e.launch_date, to: body.start });
    }
    if (path === '/api/calendar/end' && request.method === 'POST') {
      const e = await env.CAL.prepare(`SELECT * FROM events WHERE id = ?1`).bind(body.id).first();
      if (!e || !isDate(body.date)) return json({ error: 'Pick a day.' }, 400);
      if (body.date < e.launch_date) return json({ error: 'It cannot end before it went live.' }, 400);
      await env.CAL.prepare(`UPDATE events SET promo_end_date = ?2, updated_at = ?3, updated_by = ?4 WHERE id = ?1`).bind(e.id, body.date, new Date().toISOString(), by).run();
      await log(env, e, `Ends ${md(body.date)}`, by);
      return json({ ok: true });
    }
    if (path === '/api/calendar/tick' && request.method === 'POST') {
      const e = await env.CAL.prepare(`SELECT * FROM events WHERE id = ?1`).bind(body.id).first();
      if (!e) return json({ error: 'That date is gone.' }, 404);
      const t = safe(e.ticks, {}); if (body.done) t[body.key] = { by, at: new Date().toISOString() }; else delete t[body.key];
      await env.CAL.prepare(`UPDATE events SET ticks = ?2, updated_at = ?3 WHERE id = ?1`).bind(e.id, JSON.stringify(t), new Date().toISOString()).run();
      return json({ ok: true });
    }
    if (path === '/api/calendar/asana' && request.method === 'POST') return json({ ok: true, ...(await makeAsana(env, body.id, by)) });
  } catch (e) { return json({ error: e.message }, e.status || 500); }
  return json({ error: 'not found' }, 404);
}

/* ---------- the Strategist's view ---------- */
export async function calendarView(env, act) {
  const d = await calendarData(env, { act: act || 'all' });
  const today = d.today;
  const name = id => (d.brands.find(b => b.id === id) || {}).name || id;
  const live = d.items.filter(e => e.start <= today && (!e.end || e.end >= today));
  const next = d.items.filter(e => e.start > today && e.start <= add(today, 42));
  const step = s => `${s.label} ${s.state === 'done' ? 'done' : s.state === 'late' ? `LATE (was due ${s.due})` : `due ${s.due}`} (${s.who}; ${s.note})`;
  return { today, note: 'From the Locus calendar: typed dates, the Black Friday plan, Products > Drops and Klaviyo sends. The countdown ticks itself from Asana, Klaviyo and Meta.',
    open: `${LOCUS}?open=calendar`,
    live_now: live.map(e => ({ brand: name(e.act), name: e.name, kind: e.kind_label, from: e.start, to: e.end || 'no end date', offer: e.offer || null, source: e.src })),
    next_6_weeks: next.map(e => ({ id: e.src === 'cal' ? e.id : null, brand: name(e.act), name: e.name, kind: e.kind_label, goes_live: e.start, ends: e.end || (e.kind === 'sale' ? 'no end date' : null), status: e.status === 'conf' ? 'confirmed' : e.status === 'miss' ? 'no offer yet' : 'pencilled', offer: e.offer || null, source: e.src, countdown: (e.steps || []).map(step) })),
    emails_next_14_days: d.emails.filter(m => m.date >= today && m.date <= add(today, 14)).map(m => ({ brand: name(m.act), date: m.date, name: m.name, status: m.status })),
    brands_with_nothing_planned: d.brands.filter(b => !d.items.some(e => e.act === b.id && e.start >= today && e.start <= add(today, 42))).map(b => b.name) };
}

/** Dates live on a day per brand (for What moved and the Daily Brief): { brand id: [names] }. */
export async function liveOn(env, day) {
  const d = await calendarData(env, { act: 'all', from: day, to: day, today: day }).catch(() => null);
  const out = {}; if (!d) return out;
  for (const e of d.items) if (e.start <= day && (!e.end || e.end >= day)) (out[e.act] = out[e.act] || []).push({ name: e.name, start: e.start, kind: e.kind });
  return out;
}

/* ---------- Slack ---------- */
async function teamNames(env) {
  const { results } = await env.CAL.prepare(`SELECT email, name FROM people`).all().catch(() => ({ results: [] }));
  const s = new Set(['Locus', 'Cole', 'Cole Wetzler', 'Admin', 'The Strategist']);
  /* Nick Yates and Nick S. do Mobius's email work from outside addresses: their edits are the team's, not a client's. */
  const EXTRA = ['nick@iamnickyates.com', 'stevanovich.nick@gmail.com'];
  for (const p of results || []) if (/@go-mobius-digital\.com$/i.test(p.email || '') || EXTRA.includes(String(p.email || '').toLowerCase())) s.add(p.name);
  return s;
}
export async function calendarTick(env, d) {
  if (!env.CAL) return { skipped: 'no CAL binding' };
  if (d.subCanAfford && !d.subCanAfford(80)) return { deferred: 'subrequest budget' };
  if ((await d.getSetting(env, 'calendarPost').catch(() => null)) === 'off') return { skipped: 'off' };
  await ensure(env);
  const out = { posted: [] };
  const today = centralToday();
  /* 1. Client changes (Lineup changelog rows not written by the team), every tick. */
  const cur = (await d.getSetting(env, 'calLogCursor').catch(() => null)) || new Date(Date.now() - 3600e3).toISOString();
  const team = await teamNames(env);
  const { results: logs } = await env.CAL.prepare(`SELECT * FROM changelog WHERE created_at > ?1 ORDER BY created_at LIMIT 50`).bind(cur).all().catch(() => ({ results: [] }));
  const brands = await brandsList(env, 'all');
  const chanOf = slug => (brands.find(b => b.act_id === idOfSlug(slug)) || {}).slack_channel || null;
  for (const l of logs || []) {
    if (team.has(l.changed_by)) continue;
    const ch = chanOf(l.brand_id); if (!ch) continue;
    const text = `*${l.changed_by} changed a date: ${l.event_name}.* ${l.change_summary}.`;
    try { await d.slackPost(env, ch, text, [{ type: 'section', text: { type: 'mrkdwn', text } }, { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url: `${LOCUS}?open=calendar&act=${idOfSlug(l.brand_id)}${l.event_id ? `&ev=${l.event_id}` : ''}` }] }], { username: 'Locus' }); out.posted.push(`change:${l.event_name}`); } catch {}
  }
  if (logs?.length) await d.putSetting(env, 'calLogCursor', logs[logs.length - 1].created_at);
  /* 2. Reminders, once a Central day from 8am. */
  if (d.centralHour() < 8) return out;
  const doneDay = await d.getSetting(env, 'calRemindDay').catch(() => null);
  if (doneDay === today) return out;
  await d.putSetting(env, 'calRemindDay', today);
  const data = await calendarData(env, { act: 'all', from: add(today, -60), to: add(today, 30), today });
  const monday = new Date(today + 'T12:00:00Z').getUTCDay() === 1;
  /* Internal: only what needs the team (something still open the day before or a week out; Mondays, a sale with no end). */
  for (const b of data.brands) {
    if (!b.channel) continue;
    const mine = data.items.filter(e => e.act === b.id);
    const lines = [];
    for (const e of mine) {
      const open = (e.steps || []).filter(s => s.state !== 'done');
      const ready = (e.steps || []).filter(s => s.state === 'done').map(s => s.label.toLowerCase());
      const notYet = open.map(s => `${s.label.toLowerCase()} (${s.state === 'late' ? `was due ${md(s.due)}` : md(s.due)}, ${s.who})`);
      if (e.start === add(today, 1) && open.length) lines.push(`*Live tomorrow: ${e.name}.* Not yet: ${notYet.join('; ')}.`);
      if (e.start === add(today, 7) && open.length) lines.push(`*One week out: ${e.name}*, ${wd(e.start)} ${md(e.start)}.${ready.length ? ` Ready: ${ready.join(', ')}.` : ''} Not yet: ${notYet.join('; ')}.`);
      if (monday && e.src === 'cal' && e.kind === 'sale' && !e.end && e.start <= add(today, -7)) lines.push(`*Still running? ${e.name}* has no end date (${Math.round((Date.parse(today) - Date.parse(e.start)) / 864e5)} days in). Set the end in Locus, or tap "It ended today" on it.`);
    }
    if (!lines.length) continue;
    const text = lines.join('\n');
    try { await d.slackPost(env, b.channel, text, [{ type: 'section', text: { type: 'mrkdwn', text } }, { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open the calendar' }, url: `${LOCUS}?open=calendar&act=${b.id}` }] }], { username: 'Locus' }); out.posted.push(b.name); } catch (e) { out.error = e.message; }
  }
  /* External: the client's channel, two posts only (clientMessages). Off until settings calendarClient = 'on'. */
  if ((await d.getSetting(env, 'calendarClient').catch(() => null)) === 'on') {
    out.client = [];
    for (const b of data.brands) {
      /* A brand with ONE channel (Lucky Golf: our own brand, its channel is the client's) gets the client posts there. */
      const ch = b.client_channel || b.channel; if (!ch) continue;
      for (const m of clientMessages(data, b, today)) {
        try { await d.slackPost(env, ch, m.text, [{ type: 'section', text: { type: 'mrkdwn', text: m.text.slice(0, 2900) } }], { username: 'Mobius Digital' }); out.client.push(`${b.name}:${m.kind}`); } catch (e) { out.error = e.message; }
      }
    }
  }
  return out;
}

/* ---------- what the CLIENT gets (Cole, 2026-10-09: "there's a time and a place for internal and external") ----------
 * The rule: the client's channel gets what customers will see and when, and what we need from the client. Never tasks,
 * owners or lateness (those stay internal). TWO posts only:
 *   Monday   "This week and next": confirmed dates going live in the next 14 days, the emails and texts scheduled,
 *            and "We need from you" (photos, an offer to decide, a sale with no end date)
 *   daily    "Tomorrow: X goes live" (one line; on Mondays it rides inside the Monday post)
 * Only confirmed dates (pencilled and proposed ones are ours to settle first); names lose anything in brackets
 * ("Giveaway (name TBD)" reads "Giveaway"). Brands with no client channel get nothing. Switch: settings
 * calendarClient = 'on' (off until Cole says go); GET /api/calendar/client-preview shows what would post. */
const clientName = n => String(n || '').replace(/\s*\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
const mailNameC = n => { const parts = String(n || '').split(/\s+-\s+/); const i = parts.map(p => /\d{1,2}\/\d{1,2}(\/\d{2,4})?/.test(p)).lastIndexOf(true); return (i >= 0 && i < parts.length - 1 ? parts.slice(i + 1).join(' - ') : parts[parts.length - 1]).trim() || n; };
export function clientMessages(data, b, today) {
  const monday = new Date(today + 'T12:00:00Z').getUTCDay() === 1;
  const mine = data.items.filter(e => e.act === b.id);
  const tomorrow = mine.filter(e => e.start === add(today, 1) && e.status === 'conf');
  const out = [];
  if (monday) {
    const soon = mine.filter(e => e.status === 'conf' && e.start >= today && e.start <= add(today, 13)).sort((x, y) => x.start.localeCompare(y.start));
    const sends = (data.emails || []).filter(m => m.act === b.id && m.status === 'scheduled' && m.date >= today && m.date <= add(today, 13)).sort((x, y) => x.date.localeCompare(y.date));
    const need = [];
    for (const e of mine) {
      if (e.src === 'cal' && e.kind === 'drop' && !e.assets && e.start >= today && e.start <= add(today, 28)) need.push(`Photos for ${clientName(e.name)} (live ${wd(e.start)} ${md(e.start)})${e.assets_due ? `, by ${md(e.assets_due)}` : ''}`);
      if (e.src === 'cal' && ['sale', 'drop'].includes(e.kind) && !e.offer && e.start >= today && e.start <= add(today, 21)) need.push(`What customers get with ${clientName(e.name)}: full price or a deal?`);
      if (e.src === 'season' && e.status === 'miss' && e.start >= today && e.start <= add(today, 35)) need.push(`Your ${clientName(e.name)} offer (starts ${md(e.start)})`);
      if (e.src === 'cal' && e.kind === 'sale' && !e.end && e.start <= add(today, -7)) need.push(`Is ${clientName(e.name)} still running? It has no end date yet.`);
    }
    if (!soon.length && !sends.length && !need.length) return out;
    const L = [soon.length || sends.length ? `*This week and next at ${b.name}*` : `*From Mobius Digital: what we need from you*`];
    if (soon.length) L.push(...soon.map(e => `• ${wd(e.start)} ${md(e.start)}: ${clientName(e.name)} goes live${e.end && e.end !== e.start ? ` (to ${md(e.end)})` : ''}`));
    if (sends.length) L.push(`• Emails and texts going out: ${sends.slice(0, 8).map(m => `${wd(m.date)} ${md(m.date)} "${mailNameC(m.name)}"`).join(', ')}${sends.length > 8 ? `, and ${sends.length - 8} more` : ''}`);
    if (need.length) L.push(...(soon.length || sends.length ? ['', '*We need from you*'] : []), ...[...new Set(need)].slice(0, 5).map(x => `• ${x}`));
    out.push({ kind: 'monday', text: L.join('\n') });
    return out;
  }
  if (tomorrow.length) out.push({ kind: 'tomorrow', text: `*Tomorrow:* ${tomorrow.map(e => clientName(e.name)).join(' and ')} ${tomorrow.length > 1 ? 'go' : 'goes'} live.` });
  return out;
}
