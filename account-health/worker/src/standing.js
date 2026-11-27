/* WHERE WE STAND (2026-11-22): the Black Friday check-in every 3 hours while any brand's sale is live (Nov 23 to Dec 4).
 * Cole: "I don't want it to automatically raise the scaling thing. I just want it to check it... it should be in Locus,
 * the Black Friday war room... it tells me, and then we can talk about it and I can approve it or not. Real-time
 * updates, especially during Black Friday Cyber Monday weekend: here's where we stand so far. Maybe every 3 hours."
 *
 * One check-in = per brand (I&G left out: Fela runs it), from the profit worker's GET /api/season/standing (Triple
 * Whale: weekend revenue vs the weekend goal, MER so far and over the last 6 hours vs the KPI, the suggestion), plus
 * Meta read here: the live sale campaign's daily budget, the account's daily spending limit (set by hand, see metaLimits
 * below) and the headroom under it. Scale +50% / Hold / Cut 25%. NOTHING is changed by this job. A budget changes only when Cole taps
 * Approve on the War Room (POST /api/standing/approve), through the same metawrite path as every Locus write (Change
 * Log as the person, Undo for 24 hours), and only if the budget is still what the check-in saw.
 *
 * Stored in settings `standing:<slot>` (slot = Central "YYYY-MM-DDTHH"), `standingLatest` = the newest slot. The DM
 * goes to the owner (OWNER_EMAIL) as the Locus bot, never a client channel.
 *   GET  /api/standing?slot=            the stored check-in (latest when no slot)
 *   POST /api/standing/run {send}       build one now (send: 1 also DMs Cole); for a dry run before Thursday
 *   POST /api/standing/approve {slot, act}   apply that brand's suggested budget */
import { metaLive, locusWrite, gget, metaActs } from './metawrite.js';
import { dmPerson } from './morning.js';
import { adNumbers, metaActsOf, sumAds, withCovers } from './buyerai.js';
import { buildBuyerList } from './buyerlist.js';
import { standingCard, clientCard } from './standingdm.js';
import { boardSvg, brandSvg, opsBrandSvg, callWarn, toPng, clientCardSvg, sinceWin } from './standingimg.js';

const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
/* The days the 3-hour DM may run: the earliest brand sale start to the latest end (Grunk's BOGO Mon Nov 23 to Dartee's
 * Dec 4). It only sends once at least one brand's own sale is live; each brand counts from its own start. */
export const STAND_DAYS = { from: '2026-11-23', to: '2026-12-04' };
/* Central hours. 9am to 9pm every 3 hours, and 11pm to close the day (a midnight read would be an empty new day). */
/* Every 6 hours since Cole 2026-11-24 ("can Meta even optimize after every 3 hours?"): 9am, 3pm, 9pm Central; moved to 8am, 2pm, 8pm the same day (Cole). */
export const STAND_HOURS = [8, 14, 20];
/* PER-BRAND CADENCE (War Room 2.6 / 2.9 W1): p_season_answer key `checkin_hours` (2 to 12) = 8am CT, then every N
   hours while <= 10pm. A brand without one keeps STAND_HOURS; with no brand set at all the tick runs exactly as before. */
export const hoursFor = n => { const out = []; for (let h = 8; h <= 22; h += n) out.push(h); return out; };
/* Read only while the team switch `checkinSchedule` = 'on' (POST /api/standing/schedule, owner only): a client login
   may write its own brand's season answers, so one stray value must never move every brand's tick. */
export async function checkinHours(env, deps) {
  if (!env.DB || !deps || (await deps.getSetting(env, 'checkinSchedule').catch(() => null)) !== 'on') return null;
  const rows = ((await env.DB.prepare(`SELECT act_id, value FROM p_season_answer WHERE season = ?1 AND key = 'checkin_hours'`).bind('2026').all().catch(() => ({ results: [] }))).results) || [];
  const m = new Map(rows.filter(r => Number.isInteger(+r.value) && +r.value >= 2 && +r.value <= 12).map(r => [r.act_id, hoursFor(+r.value)]));
  return m.size ? m : null;
}
const KNOWN_LIMITS = { brand_lucky_golf: 6637, brand_dartee_golf: 13806, brand_bonk_golf: 5000, brand_grunk_dolfer: 2583, brand_yak_sports: 650, brand_vetripaws: 3428 };
/* META DAILY LIMIT (2026-11-26): Meta's Marketing API (v23.0) no longer has an ad account field for the daily spending
   limit. adtrust_dsl answers "(#100) Tried accessing nonexisting field (adtrust_dsl)" on every account, and nothing
   replaced it (spend_cap and amount_spent are lifetime, not daily). So the limit is set by hand: settings `metaLimits`
   = {brand id: dollars a day}, owner-edited (GET/PUT /api/standing/limits), over KNOWN_LIMITS as the default, so a
   wrong number is fixed without a deploy. limit_src stays 'known' (the pages label it as not read from Meta). */
export function limitOf(act, saved) {
  const v = saved && typeof saved === 'object' && Object.prototype.hasOwnProperty.call(saved, act) ? +saved[act] : null;
  if (v > 0) return { limit: v, set: 'owner' };
  return KNOWN_LIMITS[act] ? { limit: KNOWN_LIMITS[act], set: 'default' } : { limit: null, set: null };
}
async function savedLimits(env, md) {
  const raw = md && md.getSetting ? await md.getSetting(env, 'metaLimits').catch(() => null) : null;
  try { const j = raw ? JSON.parse(raw) : null; return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; }
}
const SALE_RE =/bfcm|black friday|\bbf\b|cyber|holiday 20\d\d/i;

const central = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
};
export const slotOf = (d = new Date()) => { const c = central(d); return `${c.date}T${String(c.hour).padStart(2, '0')}`; };
const money = v => v == null ? 'n/a' : `$${Math.round(v).toLocaleString('en-US')}`;
const kmoney = v => v == null ? 'n/a' : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`;
const xx = v => v == null ? 'n/a' : `${(Math.round(v * 100) / 100).toFixed(2)}x`;
const slotLabel = slot => {
  const [d, h] = slot.split('T'), hr = +h;
  const day = new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${day}, ${hr === 0 ? '12am' : hr < 12 ? `${hr}am` : hr === 12 ? '12pm' : `${hr - 12}pm`} CT`;
};

/** The sale campaign the budget call acts on (same pick as the War Room page): ACTIVE, named BFCM / Black Friday /
 *  Cyber / Holiday 20xx, a daily budget first, Black Friday before Dec 1 and Holiday after. */
export function pickSaleCamp(ml, today, spent = {}) {
  const dec = today >= '2026-12-01';
  const cs = Object.entries((ml && ml.campaigns) || {}).map(([id, c]) => ({ id, ...c })).filter(c => c.status === 'ACTIVE' && SALE_RE.test(c.name || ''));
  /* Cole 2026-11-24: the Dartee raise landed on BFCM 2026 ($0 today, its sets start Thursday) while Early access did the
     selling. A campaign that is spending today comes first, the most spend first; the old order only breaks ties. */
  const score = c => (c.daily ? 0 : 10) + (/holiday/i.test(c.name) ? (dec ? 0 : 5) : (dec ? 5 : 0));
  return cs.sort((a, b) => ((spent[b.id] || 0) > 0) - ((spent[a.id] || 0) > 0) || (spent[b.id] || 0) - (spent[a.id] || 0) || score(a) - score(b) || (b.daily || 0) - (a.daily || 0))[0] || null;
}
/** Spend today per campaign, live from Meta (one insights call per ad account). */
async function spendToday(env, md, act) {
  const out = {};
  for (const m of await metaActs(env, act)) {
    const r = await gget(md, env, `${m.act}/insights`, { level: 'campaign', date_preset: 'today', fields: 'campaign_id,spend', limit: 200 }).catch(() => null);
    for (const x of (r && r.data) || []) out[x.campaign_id] = (out[x.campaign_id] || 0) + (+x.spend || 0);
  }
  return out;
}
/** Everything that can spend today: ACTIVE campaigns' daily budgets, plus ACTIVE ad sets' own budgets in ACTIVE campaigns
 *  without one. Only what can spend TODAY counts (2026-11-26: a Holiday campaign whose sets start Dec 1 made the room
 *  negative and blocked raises). A set can spend today when it is ACTIVE, has not ended, and starts before the end of
 *  the account's day (`dayEnd`, ms; a Black Friday set starting at 6pm counts at 8am). A set with no start time read
 *  counts. A campaign budget is left out only when the read HAS ad sets of that campaign and none can spend today; a
 *  campaign with no sets in the read (a cut or failed ad set read) counts, as before. `keep` = a campaign id that
 *  always counts (the sale campaign the raise is sized on, so its own budget is always inside the room). */
export const setRunning = (s, now = Date.now(), dayEnd = now) => s.status === 'ACTIVE' && !(s.start && Date.parse(s.start) >= Math.max(dayEnd, now + 1)) && !(s.end && Date.parse(s.end) <= now);
export function budgetsOn(ml, now = Date.now(), { dayEnd = now, keep = null } = {}) {
  const C = (ml && ml.campaigns) || {}, S = Object.values((ml && ml.adsets) || {}); let t = 0;
  const read = new Set(S.map(s => s.campaign)), live = new Set(S.filter(s => setRunning(s, now, dayEnd)).map(s => s.campaign));
  for (const [id, c] of Object.entries(C)) if (c.status === 'ACTIVE' && c.daily && (id === keep || !read.has(id) || live.has(id))) t += c.daily;
  for (const s of S) { const c = C[s.campaign]; if (setRunning(s, now, dayEnd) && s.daily && c && c.status === 'ACTIVE' && !c.daily) t += s.daily; }
  return t;
}
/** The end of today (ms) in a timezone: the next local midnight. */
const dtf = tz => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export function dayEndIn(tz, now = Date.now()) {
  let f; try { f = dtf(tz || 'America/Chicago'); } catch { f = dtf('America/Chicago'); }
  const wall = ms => { const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second); };
  const w = wall(now), d = new Date(w), mid = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
  let t = mid - (w - now);
  t += mid - wall(t);   // one correction for a clock change before midnight
  return t;
}
/** The latest end of today across a brand's Meta ad accounts (D1 accounts.tz; Central when unknown). */
async function brandDayEnd(env, act, now = Date.now()) {
  const r = await env.DB.prepare(`SELECT a.tz AS tz FROM connections c LEFT JOIN accounts a ON a.act_id = c.external_id WHERE c.brand_id = ?1 AND c.kind = 'meta'`)
    .bind(act).all().catch(() => ({ results: [] }));
  const tzs = [...new Set(((r && r.results) || []).map(x => x.tz).filter(Boolean))];
  return Math.max(...(tzs.length ? tzs : ['America/Chicago']).map(tz => dayEndIn(tz, now)));
}
/** The new budget for a suggestion, kept under the Meta daily limit. Returns {to, note} or {to: null, note}. */
export function budgetFor(sug, from, limit, on) {
  if (!sug || !from || !sug.pct) return { to: null };
  let to = Math.max(5, Math.round(from * (1 + sug.pct) / 5) * 5);
  if (sug.pct > 0 && limit) {
    const room = limit - (on - from);   // what this campaign may go to before every live budget together passes the limit
    if (to > room) {
      const capped = Math.floor(room / 5) * 5;
      if (capped <= from) return { to: null, note: `No room: live budgets ${money(on)}/day already sit at the ${money(limit)} Meta limit. Ask Meta to raise it.` };
      return { to: capped, note: `Capped at ${money(capped)} by the ${money(limit)} Meta daily limit.` };
    }
  }
  return { to };
}

async function readProfit(env, deps, path) {
  const owner = env.OWNER_EMAIL || 'cole@go-mobius-digital.com';
  const { token } = await deps.mintSession(env, owner);
  if (!env.PROFIT) throw new Error('The PROFIT service binding is missing on account-health.');
  const res = await env.PROFIT.fetch(new Request(PROFIT_ORIGIN + path, { headers: { Authorization: `Bearer ${token}` } }));
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `Locus answered ${res.status}`);
  return j;
}
/** Meta for one brand: the sale campaign, its budget, the account limit and the headroom. */
async function metaSide(env, md, act, today) {
  const ml = await metaLive(env, md, act, { season: true });
  if (ml.error) return { error: ml.error };
  const spent = await spendToday(env, md, act).catch(() => null);
  /* The sale campaign's own budget always counts (budgetFor takes it back out of the room), and a set starting later
     today counts: it spends against today's limit. */
  const camp = pickSaleCamp(ml, today, spent || {}), on = budgetsOn(ml, Date.now(), { dayEnd: await brandDayEnd(env, act), keep: camp && camp.id });
  /* Meta has no daily limit field any more (see metaLimits): the number set by hand, labelled as such. */
  const { limit, set } = limitOf(act, await savedLimits(env, md));
  const camps = await campList(env, act, ml, spent || {}, today, md).catch(() => []);
  return { camps, camp: camp ? { id: camp.id, name: camp.name, daily: camp.daily || null, spent: spent ? (spent[camp.id] || 0) : null } : null, on, limit, limit_src: limit ? (set === 'owner' ? 'hand' : 'known') : null, limit_error: null,
    ...(limit ? { limit_label: 'set by hand', limit_set: set } : {}), headroom: limit ? limit - on : null };
}

/* Every live campaign of a brand (Cole 2026-11-25: "is this the Black Friday campaign? the evergreen? should I be
   adjusting other campaigns too?"): today's spend against its budget (Meta), and its return over the last 3 finished
   days (Triple Whale lastPlatformClick on its ads; spend from ad_daily). Campaign returns are ad-platform credit, not
   the store MER the call runs on, so the card labels them. */
const KIND = n => SALE_RE.test(n || '') ? 'sale' : /giveaway|lead/i.test(n || '') ? 'leads' : /creator|trybe|\bace\b/i.test(n || '') ? 'creators' : /\[md\]|evergreen|cbo|abo/i.test(n || '') ? 'evergreen' : 'other';
async function campList(env, act, ml, spent, today, md = null) {
  const cs = Object.entries((ml && ml.campaigns) || {}).map(([id, c]) => ({ id, name: c.name, daily: c.daily || null, status: c.status, spent: spent[id] || 0 }))
    .filter(c => c.status === 'ACTIVE' && (c.spent > 0 || c.daily));
  if (!cs.length) return [];
  /* Cole 2026-11-25: per campaign, TODAY and THIS WEEK only (the Lucky BF ads went live today, so the days before tell
     nothing). Week = Monday to now. Spend from Meta's campaign totals; orders and revenue from Triple Whale last click,
     with yesterday and today pulled live first (the nightly sync never holds them). */
  const day = n => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dow = new Date(today + 'T12:00:00Z').getUTCDay(), monday = day(-((dow + 6) % 7));
  if (md && md.twAttr) await md.twAttr(env, act, day(-1) < monday ? today : day(-1), today).catch(() => null);
  const ws = {};
  for (const m of md ? await metaActs(env, act).catch(() => []) : []) {
    const r = await gget(md, env, `${m.act}/insights`, { level: 'campaign', time_range: JSON.stringify({ since: monday, until: today }), fields: 'campaign_id,spend', limit: 200 }).catch(() => null);
    for (const x of (r && r.data) || []) ws[x.campaign_id] = (ws[x.campaign_id] || 0) + (+x.spend || 0);
  }
  const q = await env.DB.prepare(`SELECT a.campaign_id c, SUM(CASE WHEN t.date = ?3 THEN t.revenue ELSE 0 END) tr, SUM(CASE WHEN t.date = ?3 THEN t.orders ELSE 0 END) tt,
      SUM(t.revenue) wr, SUM(t.orders) wo FROM tw_ad_attr t JOIN ads a ON a.ad_id = t.ad_id
      WHERE t.act_id = ?1 AND t.model = 'lastPlatformClick' AND t.date >= ?2 AND t.date <= ?3 GROUP BY a.campaign_id`)
    .bind(act, monday, today).all().catch(() => ({ results: [] }));
  const rv = {}; for (const x of q.results || []) rv[x.c] = x;
  return cs.map(c => {
    const v = rv[c.id] || {}, wsp = ws[c.id] != null ? ws[c.id] : null;
    return { ...c, kind: KIND(c.name), t_ord: Math.round(v.tt || 0), t_roas: c.spent > 0 ? (v.tr || 0) / c.spent : null,
      w_spend: wsp, w_ord: Math.round(v.wo || 0), w_roas: wsp > 0 ? (v.wr || 0) / wsp : null };
  }).sort((a, b) => b.spent - a.spent || (b.daily || 0) - (a.daily || 0)).slice(0, 6);
}

/* The War Room DM (Cole 2026-11-25): per brand, Last 6 hours / Today / This week like the client update, the campaigns,
   and the call naming the campaign it changes, with Approve. One colored bar per brand (Today against the goal). */
const KIND_WORD = { sale: 'sale', evergreen: 'evergreen', leads: 'leads', creators: 'creators', other: 'other' };
function opsCard(rec) {
  const hr = +String(rec.slot).split('T')[1], when = hr === 12 ? '12pm' : hr === 0 ? '12am' : hr < 12 ? `${hr}am` : `${hr - 12}pm`;
  const t = longDay(rec.slot);
  const blocks = [{ type: 'markdown', text: `# Where we stand · ${when}` },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${t.day}  ·  MER = store sales ÷ all ad spend, judged against each brand's goal. Campaign returns are Triple Whale last click, last 3 days.` }] }];
  const attachments = [];
  const win = (l, p) => p && p.sales != null ? `*${l}*   Sales ${usd(p.sales)}  ·  Ad spend ${usd(p.spend)}  ·  MER *${nx(p.mer)}*` : `*${l}*   no data yet`;
  for (const b of rec.brands || []) {
    const line = b.hold ?? (b.kpi ? b.kpi * 0.8 : null), s = b.suggest || {}, m = b.meta || {};
    const head = `*${b.name}*   goal ${nx(b.kpi)}${line ? `, break-even ${nx(line)}` : ''}`;
    const out = [{ type: 'section', text: { type: 'mrkdwn', text: `${head}\n${win('Last 6 hours', b.last6)}\n${win('Today', b.today)}\n${win('This week', b.week)}` } }];
    const camps = m.camps || [];
    if (camps.length) {
      const rows = camps.map(c => {
        const ret = c.t_roas != null ? `${nx(c.t_roas)} today (${c.t_ord} orders), ${nx(c.w_roas)} this week` : 'no spend today';
        const pick = m.camp && m.camp.id === c.id ? '  ← the call' : '';
        return `• *${c.name}* (${KIND_WORD[c.kind]})   today ${usd(c.spent)}${c.daily ? ` of ${usd(c.daily)}` : ' (ad set budgets)'}   ·   ${ret}${pick}`;
      });
      out.push({ type: 'section', text: { type: 'mrkdwn', text: `*Campaigns*\n${rows.join('\n')}` } });
      /* Others worth a look: not the campaign the call changes, enough spend to read, over goal or under break-even. */
      const look = camps.filter(c => !(m.camp && m.camp.id === c.id) && false)
        .map(c => c.roas3 >= b.kpi ? `${c.name} returned ${nx(c.roas3)} over 3 days, over goal: room to raise it too.` : line && c.roas3 < line ? `${c.name} returned ${nx(c.roas3)} over 3 days, under break-even: look at its ads.` : null).filter(Boolean);
      if (look.length) out.push({ type: 'context', elements: [{ type: 'mrkdwn', text: look.join('\n') }] });
    } else if (m.error) out.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Meta did not answer: ${m.error}` }] });
    const cn = m.camp ? m.camp.name : null, done = (rec.approved || {})[b.act_id];
    let call;
    if (s.to && cn) call = `*${s.pct > 0 ? 'Raise' : 'Cut'} ${cn}: ${usd(m.camp.daily)} → ${usd(s.to)} a day (${s.pct > 0 ? '+' : ''}${Math.round(s.pct * 100)}%)*\n${s.why || ''}${s.note ? `\n_${s.note}_` : ''}`;
    else call = `*Hold${cn ? ` ${cn}` : ''}.*  ${s.why || ''}${s.note ? `\n_${s.note}_` : ''}`;
    if (done) call = `✓ Approved: ${cn} ${usd(done.from || (m.camp || {}).daily)} → ${usd(done.to || s.to)} a day.`;
    const sec = { type: 'section', text: { type: 'mrkdwn', text: call.slice(0, 2900) } };
    if (s.to && cn && !done) sec.accessory = { type: 'button', action_id: 'ws_approve', style: 'primary', text: { type: 'plain_text', text: 'Approve' }, value: `${rec.slot}|${b.act_id}` };
    out.push(sec);
    attachments.push({ color: tierOf(b.today && b.today.mer, b.kpi, line).color, blocks: out });
  }
  const n = (rec.brands || []).filter(b => (b.suggest || {}).to && !(rec.approved || {})[b.act_id]).length;
  return { text: `Where we stand, ${rec.label}. ${n ? `${n} to approve.` : 'Nothing to approve.'}`, blocks, attachments };
}

/* One picture per brand (Cole 2026-11-25: the single tall picture was unreadable in Slack), each brand's Approve right
   under its own picture. imgs = {act_id: Slack file id}; a brand whose picture failed gets its numbers as text. */
async function opsUpload(env, deps, rec) {
  const imgs = {}, errs = [];
  for (const b of rec.brands || []) {
    try { const up = await slackPng(env, deps, await toPng(opsBrandSvg(rec, b), deps.xfetch, 1400), `${b.act_id.replace('brand_', '')}-${rec.slot}.png`); if (up.id) imgs[b.act_id] = up.id; else errs.push(`${b.name}: ${up.error}`); }
    catch (e) { errs.push(`${b.name}: ${e.message}`); }
  }
  return { imgs, error: errs.join('; ') || null };
}
function opsImgMsg(rec, imgs) {
  const hr = +String(rec.slot).split('T')[1], when = hr === 12 ? '12pm' : hr === 0 ? '12am' : hr < 12 ? `${hr}am` : `${hr - 12}pm`;
  const ord = [...(rec.brands || [])].sort((a, b) => ((b.suggest || {}).to ? 1 : 0) - ((a.suggest || {}).to ? 1 : 0));
  const N = ord.filter(b => (b.suggest || {}).to && b.meta && b.meta.camp && !(rec.approved || {})[b.act_id]);
  const blocks = [{ type: 'markdown', text: `# Where we stand · ${when}` },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `${N.length ? `*${N.length} to approve.* ` : 'Nothing to approve. '}MER = store sales ÷ all ad spend. Campaign returns = Triple Whale last click, last 3 days.` }] }];
  for (const b of ord) {
    blocks.push({ type: 'divider' });
    if (imgs[b.act_id]) blocks.push({ type: 'image', slack_file: { id: imgs[b.act_id] }, alt_text: `${b.name}: last 6 hours, today, this week, the call and its campaigns` });
    else blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${b.name}*  today ${nx(b.today && b.today.mer)} on ${usd(b.today && b.today.spend)}` } });
    if (N.includes(b)) {
      const s = b.suggest, c = b.meta.camp, w = callWarn(b);
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*${s.pct < 0 ? 'Cut' : 'Raise'} ${c.name}* ${usd(c.daily)} → ${usd(s.to)} a day${w ? `\n:warning: ${w}` : ''}` },
        accessory: { type: 'button', action_id: 'ws_approve', style: s.pct < 0 ? 'danger' : 'primary', text: { type: 'plain_text', text: 'Approve' }, value: `${rec.slot}|${b.act_id}` } });
    }
  }
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Nothing changes until you tap Approve.${rec.next ? ` Next check-in ${rec.next}.` : ''}` }] });
  return { text: `Where we stand, ${rec.label}. ${N.length ? `${N.length} to approve.` : 'Nothing to approve.'}`, blocks };
}
/** Build one check-in (reads only). */
export async function buildStanding(env, deps, slot = slotOf(), only = null) {
  const md = { xfetch: deps.xfetch, listAccounts: deps.listAccounts, getSetting: deps.getSetting, putSetting: deps.putSetting, twAttr: deps.twAttr };
  /* only = {acts, skip} (per-brand cadence): read just the due brands; null = every brand, as before. */
  const tw = await readProfit(env, deps, '/api/season/standing' + (only && only.acts ? `?acts=${encodeURIComponent(only.acts.join(','))}` : ''));
  const brands = [];
  for (const b of tw.brands || []) {
    if (only && only.skip && only.skip.has(b.act_id)) continue;
    let m; try { m = await metaSide(env, md, b.act_id, tw.today); } catch (e) { m = { error: e.message }; }
    const sug = { ...b.suggest }, from = m.camp && m.camp.daily;
    /* A brand whose sale has ended gets no call. Before its BF sale starts it still gets the ladder on today's numbers
       (Cole 2026-11-24: Bonk's regular sale was running at 6x and read "hold"). */
    if (!tw.dry && b.mode === 'after') { brands.push({ ...b, meta: m, suggest: { call: 'hold', pct: 0, why: `Sale ended ${dayShort(b.sale.end)}.` } }); continue; }
    if (!tw.dry && b.mode === 'plan') sug.why = `Black Friday starts ${dayShort(b.sale.start)}; today's numbers until then. ${sug.why}`;
    /* A raise on a campaign that is not using the budget it has changes nothing (Bonk BFCM 2026, $500 budget, $220 to
       $300 spent a day). Pace = today's spend against the budget times the share of the Central day gone; under 70%
       of pace from 9am on, the raise becomes a hold that says why. */
    const hr = central().hour, c0 = m.camp;
    if (!m.error && sug.pct > 0 && c0 && c0.daily && c0.spent != null && hr >= 9) {
      const pace = c0.spent / (c0.daily * Math.max(hr, 1) / 24);
      if (pace < 0.7) { sug.call = 'hold'; sug.pct = 0; sug.why = `${sug.why} But ${c0.name} has spent only ${money(c0.spent)} of its ${money(c0.daily)} today, so a bigger budget would not get spent. Hold instead.`; }
    }
    if (!m.error && !m.camp) sug.note = 'No live sale campaign in Meta.';
    else if (!m.error && sug.pct && !from) sug.note = `${m.camp.name} has no campaign daily budget (ad set budgets).`;
    else if (!m.error) { const bf = budgetFor(sug, from, m.limit, m.on); sug.to = bf.to; if (bf.note) sug.note = bf.note; }
    brands.push({ ...b, meta: m, suggest: sug });
  }
  return { slot, at: new Date().toISOString(), label: slotLabel(slot), next: nextLabel(slot), today: tw.today, dry: tw.dry, window: tw.window || null, brands, approved: {} };
}

/** The next check-in after this slot, in words ("6pm", "9am Fri"), or null after the last one. */
export function nextLabel(slot, hours = STAND_HOURS) {
  const [d, h] = slot.split('T'), hr = +h, i = hours.findIndex(x => x > hr);
  const fmt = x => x === 12 ? '12pm' : x < 12 ? `${x}am` : `${x - 12}pm`;
  if (i >= 0) return fmt(hours[i]);
  const nd = new Date(d + 'T12:00:00Z'); nd.setUTCDate(nd.getUTCDate() + 1);
  const ymd = nd.toISOString().slice(0, 10);
  if (ymd > STAND_DAYS.to) return null;
  return `${fmt(hours[0])} ${nd.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}`;
}
export const dayShort = ymd => ymd ? new Date(ymd + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
const W = { scale: 'Raise 50%', raise: 'Raise 25%', hold: 'Hold', cut: 'Cut 25%' };
const ORDER = { cut: 0, scale: 1, raise: 1, hold: 2 };
/** The Slack DM, laid out like Well Copy's weekly update (Cole, 2026-11-22): a greeting, one intro line, plain section
 *  labels ending in a colon, bullets, and each brand's numbers as sub-bullets. What needs him comes before the brands.
 *  Rich text blocks so Slack draws real nested bullets; `text` is the plain fallback for notifications. */
export function standingMessage(rec) {
  const link = act => `${LOCUS}?open=warlive&act=all&standing=${encodeURIComponent(rec.slot)}${act ? `&brand=${encodeURIComponent(act)}` : ''}`;
  const ok = rec.brands.filter(b => !b.no_sales && b.so_far && b.so_far.sales != null);
  const S = ok.reduce((t, b) => t + b.so_far.sales, 0), P = ok.reduce((t, b) => t + b.so_far.spend, 0), G = ok.reduce((t, b) => t + (b.goal || 0), 0);
  const hr = +rec.slot.split('T')[1], greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const nx = nextLabel(rec.slot), pctOf = (a, b) => b ? Math.round(a / b * 100) : 0;
  const brands = [...rec.brands].sort((a, b) => (ORDER[(a.suggest || {}).call] ?? 2) - (ORDER[(b.suggest || {}).call] ?? 2));
  const need = brands.filter(b => (b.suggest || {}).to && !(rec.approved || {})[b.act_id]);
  const T = s => ({ type: 'text', text: s }), L = (url, s) => ({ type: 'link', url, text: s });
  const sec = (...els) => ({ type: 'rich_text_section', elements: els });
  const list = (items, indent = 0) => ({ type: 'rich_text_list', style: 'bullet', indent, elements: items.map(x => Array.isArray(x) ? sec(...x) : sec(T(x))) });
  const intro = `Here's where we stand on Black Friday weekend as of ${rec.label.replace(' CT', '')}${rec.dry ? ' (a dry run on today; each brand counts from its own sale start)' : ''}, and what needs you.`;
  const els = [sec(T(`${greet} Cole!\n\n${intro}\n\nWeekend so far:\n`)),
    list([`${kmoney(S)} of the ${kmoney(G)} goal (${pctOf(S, G)}%) on ${kmoney(P)} of ads`, `MER: ${xx(P ? S / P : null)} (KPI 2.50x)`]),
    sec(T('\nNeeds your attention:\n')),
    list(need.length ? need.map(b => [T(`${b.name}: ${W[b.suggest.call].toLowerCase()}, ${money(b.meta.camp.daily)} to ${money(b.suggest.to)}/day. `), L(link(b.act_id), 'Approve here')])
      : ['Nothing to approve. Every brand is on Hold.']),
    sec(T('\nBrand by brand:\n'))];
  const plain = [`${greet} Cole!`, intro, 'Weekend so far:', `- ${kmoney(S)} of the ${kmoney(G)} goal (${pctOf(S, G)}%) on ${kmoney(P)} of ads, MER ${xx(P ? S / P : null)}`, 'Needs your attention:',
    ...(need.length ? need.map(b => `- ${b.name}: ${W[b.suggest.call].toLowerCase()}, ${money(b.meta.camp.daily)} to ${money(b.suggest.to)}/day`) : ['- Nothing to approve.']), 'Brand by brand:'];
  for (const b of brands) {
    const s = b.so_far || {}, l6 = b.last6 || {}, m = b.meta || {}, g = b.suggest || {}, ap = (rec.approved || {})[b.act_id];
    const head = `${b.name}: ${ap ? `approved, ${money(ap.from)} to ${money(ap.to)}/day` : `${W[g.call] || 'Hold'}${g.to ? ` to ${money(g.to)}/day` : ''}`}${(g.call === 'scale' || g.call === 'raise') && !ap ? ' 🎉' : ''}`;
    const sub = [b.no_sales ? `Spend: ${kmoney(s.spend)} (no Triple Whale store, so no sales or MER)` : `Sales: ${kmoney(s.sales)} of ${kmoney(b.goal)} (${pctOf(s.sales, b.goal)}%)`];
    if (!b.no_sales && s.new_mer != null) sub.push(`New customers: ${kmoney(s.new_rev)} from ${s.new_orders ?? 'n/a'} first orders${s.email_share_new != null ? ` (${Math.round(s.email_share_new * 100)}% from email left out)` : ''}, new-customer MER ${xx(s.new_mer)} (break-even ${xx(b.be_new)})`);
    if (!b.no_sales) sub.push(`Store MER: ${xx(s.mer)} so far, ${xx(l6.mer)} last 6 hours (KPI ${xx(b.kpi)})`);
    sub.push(m.error ? `Budget: Meta did not answer (${m.error})` : !m.camp ? 'Budget: no live sale campaign in Meta'
      : `Budget: ${m.camp.daily ? `${money(m.camp.daily)}/day` : 'ad set budgets'}${m.limit ? `, ${money(m.headroom)} room under Meta's limit${m.limit_label ? ` (${m.limit_label})` : ''}` : ''}`);
    if (g.note) sub.push(`Note: ${g.note}`);
    els.push(list([head]), list(sub, 1));
    plain.push(`- ${head}`, ...sub.map(x => `   - ${x}`));
  }
  const close = `\n${nx ? `Next check-in at ${nx}. ` : ''}As always, nothing changes until you tap Approve. `;
  els.push(sec(T(close), L(link(), 'Open the War Room'), T('\n\nThanks!')));
  plain.push(close.trim(), 'Thanks!');
  return { text: plain.join('\n').slice(0, 3500), blocks: [{ type: 'rich_text', elements: els }] };
}

/** A rebuild inside the same slot keeps what that slot already holds: the approvals tapped and the DM that went out. */
async function save(env, deps, rec) {
  const old = await load(env, deps, rec.slot);
  if (old && old.slot === rec.slot) {
    rec.approved = { ...(old.approved || {}), ...(rec.approved || {}) };
    if (!rec.sent && old.sent) rec.sent = old.sent;
  }
  await deps.putSetting(env, `standing:${rec.slot}`, JSON.stringify(rec));
  await deps.putSetting(env, 'standingLatest', rec.slot);
}
async function load(env, deps, slot) {
  const s = slot || await deps.getSetting(env, 'standingLatest');
  if (!s || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(s)) return null;
  const v = await deps.getSetting(env, `standing:${s}`);
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}
export const DM_STYLES = ['ops', 'list', 'wc', 'board', 'a', 'b', 'c', 'd'];
const linkOf = rec => act => `${LOCUS}?open=warlive&act=all&standing=${encodeURIComponent(rec.slot)}${act ? `&brand=${encodeURIComponent(act)}` : ''}`;
/** The DM in the style Cole picked (settings `standingDmStyle`; 'list' = the rich-text list until he picks), or `style` for a test. */
async function sendDm(env, deps, rec, { style, prev, img } = {}) {
  /* Cole 2026-11-25: the per-brand windows + campaigns card is THE check-in. Older styles only when asked for by name. */
  const st = DM_STYLES.includes(style) ? style : 'ops';
  /* Style d (Cole's pick, 2026-11-22): draw the scoreboard, upload it to Slack, show it by file id. If the picture
     fails the DM still goes, with a note where the picture would be. */
  let imgs = null;
  if (st === 'ops') { const u = await opsUpload(env, deps, rec); imgs = u.imgs; if (u.error) rec.img_error = u.error; }
  if (st === 'd' && !img) {
    try { const up = await slackPng(env, deps, await toPng(boardSvg(rec), deps.xfetch), `where-we-stand-${rec.slot}.png`); if (up.id) img = up.id; else rec.img_error = up.error; }
    catch (e) { rec.img_error = e.message; }
  }
  const msg = st === 'ops' ? (Object.keys(imgs || {}).length ? opsImgMsg(rec, imgs) : opsCard(rec)) : st === 'list' ? standingMessage(rec) : standingCard(rec, prev, st, linkOf(rec), { img });
  const r = await postRetry(env, deps, msg, img || (imgs && Object.keys(imgs).length ? 'many' : null));
  rec.sent = r.ok ? { at: new Date().toISOString(), ts: r.ts, style: st, img: img || null } : { error: r.error };
  return r;
}
/* Slack can take a moment to process a fresh upload before a block may show it: retry a few times. */
async function postRetry(env, deps, msg, img) {
  let r = null;
  for (let i = 0; i < 6; i++) {
    r = await dmPerson(env, deps, env.OWNER_EMAIL || 'cole@go-mobius-digital.com', msg);
    if (r.ok || !img || !/invalid_blocks/.test(String(r.error || ''))) break;
    await new Promise(z => setTimeout(z, 1500));
  }
  return r;
}

/** Upload a PNG to Slack as the Locus bot, shared nowhere; the DM shows it by file id. */
async function slackPng(env, deps, bytes, name) {
  const a = await deps.slackApi(env, 'files.getUploadURLExternal', { filename: name, length: bytes.length });
  if (!a || !a.ok) return { error: (a && a.error) || 'upload url' };
  const up = await (deps.xfetch || fetch)(a.upload_url, { method: 'POST', body: bytes });
  if (!up.ok) return { error: `upload ${up.status}` };
  const c = await deps.slackApi(env, 'files.completeUploadExternal', { files: [{ id: a.file_id, title: name }] });
  return c && c.ok ? { id: a.file_id } : { error: (c && c.error) || 'complete upload' };
}
async function sendSample(env, deps, rec, prev, { style, act, label }) {
  let img = null, imgErr = null;
  if (style === 'd') {
    try {
      const svg = act ? brandSvg(rec, act, prev) : boardSvg(rec);
      const up = await slackPng(env, deps, await toPng(svg, deps.xfetch), `where-we-stand-${act ? act.replace('brand_', '') : 'all'}-${rec.slot}.png`);
      if (up.error) imgErr = up.error; else img = up.id;
    } catch (e) { imgErr = e.message; }
  }
  let imgs = null;
  if (!act && style === 'ops') { const u = await opsUpload(env, deps, rec); imgs = u.imgs; imgErr = u.error; }
  const msg = !act && style === 'ops' ? (Object.keys(imgs || {}).length ? opsImgMsg(rec, imgs) : opsCard(rec)) : act ? clientCard(rec, act, style, prev, { img }) : standingCard(rec, prev, style, linkOf(rec), { img });
  if (label) { msg.blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `*${label}*` } }, ...(msg.blocks || [])]; msg.text = `${label}: ${msg.text}`; }
  /* Slack can take a moment to process a fresh upload before a block may show it: retry a few times. */
  const r = await postRetry(env, deps, msg, img || (imgs && Object.keys(imgs).length ? 'many' : null));
  return { ok: !!r.ok, ts: r.ts, error: r.error, img, imgErr, slot: rec.slot };
}

/** The hourly cron's step: in the window, on a 3-hour slot, once per slot. */
export async function standingTick(env, deps, now = new Date()) {
  const c = central(now);
  if (c.date < STAND_DAYS.from || c.date > STAND_DAYS.to) return { skipped: 'outside Nov 23 to Dec 4' };
  /* Any brand with its own check-in hours: the per-brand tick. None set: everything below runs exactly as before. */
  const sched = await checkinHours(env, deps).catch(() => null);
  if (sched) return scheduledTick(env, deps, now, c, sched);
  /* At or up to 2 hours after a check-in hour, never only ON it (Cole 2026-11-25: the 8am check-in never came). An
     exact-hour match cannot recover from one missed or late hourly tick; the standingSent flag stops a double send. */
  const h = [...STAND_HOURS].reverse().find(x => x <= c.hour && c.hour - x <= 2);
  if (h == null) { await deps.putSetting(env, 'standingLastSkip', JSON.stringify({ at: now.toISOString(), why: 'not a check-in hour', hour: c.hour })).catch(() => {}); return { skipped: 'not a check-in hour' }; }
  const slot = `${c.date}T${String(h).padStart(2, '0')}`;
  /* Its own flag: a "Check now" on the page in the same hour writes standingLatest too and must not swallow the DM. */
  if (await deps.getSetting(env, `standingSent:${slot}`)) return { skipped: 'already sent' };
  const prev = await load(env, deps).catch(() => null);
  const rec = await buildStanding(env, deps, slot);
  /* Only once a brand's own sale is live; a pre-sale day is not a check-in. */
  if (!rec.brands.some(b => b.mode === 'live')) return { skipped: 'no brand sale is live' };
  await sendDm(env, deps, rec, { prev });
  await save(env, deps, rec);
  if (rec.sent && !rec.sent.error) await deps.putSetting(env, `standingSent:${slot}`, rec.sent.at);
  /* Each client's update, drafted to Cole now. A brand with a raise or cut waiting for his yes gets it right after the
     Approve instead, so "What we did" includes the change. */
  await postBatch(env, deps, rec).catch(e => console.log('client batch: ' + e.message));
  return { slot, brands: rec.brands.length, sent: rec.sent };
}

/* What a checked brand carries from its last check-in (War Room 2.9 W1), so the page and the client update can say
   "since 2pm" without probing older records. Revenue = the stored return times the spend it was earned on. */
const prevOf = (r, b) => ({ slot: b.checked_slot || r.slot, at: b.checked_at || r.at, today: b.today || null, week: b.week || null, so_far: b.so_far || null,
  camps: ((b.meta || {}).camps || []).map(z => ({ id: z.id, spent: z.spent, t_rev: z.t_roas != null ? z.t_roas * (z.spent || 0) : null,
    w_spend: z.w_spend ?? null, w_rev: z.w_roas != null && z.w_spend ? z.w_roas * z.w_spend : null, daily: z.daily ?? null })) });
/** The tick with per-brand cadence: a brand is due at or up to 2 hours after one of its own hours, once (the same
 *  standingSent:<slot> flags, one per due hour). Only due brands are read, DMed and drafted for their client; every
 *  other brand rides along from the previous record with its own checked_at. */
async function scheduledTick(env, deps, now, c, sched) {
  const dueOf = hrs => [...hrs].reverse().find(x => x <= c.hour && c.hour - x <= 2);
  const slotAt = h => `${c.date}T${String(h).padStart(2, '0')}`;
  const sentAt = async h => !!(await deps.getSetting(env, `standingSent:${slotAt(h)}`));
  const hDef = dueOf(STAND_HOURS), defDue = hDef != null && !(await sentAt(hDef));
  const due = new Map(), skip = new Set();
  for (const [act, hrs] of sched) { const h = dueOf(hrs); if (h != null && !(await sentAt(h))) due.set(act, h); else skip.add(act); }
  if (!defDue && !due.size) { await deps.putSetting(env, 'standingLastSkip', JSON.stringify({ at: now.toISOString(), why: 'no brand is due', hour: c.hour })).catch(() => {}); return { skipped: 'no brand is due' }; }
  const hours = [...due.values(), ...(defDue ? [hDef] : [])], slot = slotAt(Math.max(...hours));
  const prevRec = await load(env, deps).catch(() => null);
  /* "Since <time>" follows the brand's last TICKED check-in (what the client last heard about), never a page Check now
     saved in between; standingTickLatest is written only here. The first scheduled tick falls back to the latest. */
  const tickSlot = await deps.getSetting(env, 'standingTickLatest').catch(() => null);
  const prevTick = (tickSlot && await load(env, deps, tickSlot).catch(() => null)) || prevRec;
  /* Default brands due = read every brand and drop the scheduled ones not due; else only the due ones. */
  const rec = await buildStanding(env, deps, slot, { acts: defDue ? null : [...due.keys()], skip });
  /* Live is judged across every brand (due and carried), as the old tick did: a due brand whose own sale is not live
     still gets its check-in while another brand's sale runs. */
  if (![...rec.brands, ...((prevRec && prevRec.brands) || [])].some(b => b.mode === 'live')) return { skipped: 'no brand sale is live' };
  const all = [...new Set([...STAND_HOURS, ...[...sched.values()].flat()])].sort((p, q) => p - q);
  rec.next = nextLabel(slot, all);
  for (const b of rec.brands) {
    b.checked_at = rec.at; b.checked_slot = slot; b.next = nextLabel(slot, sched.get(b.act_id) || STAND_HOURS);
    const pb = prevTick && (prevTick.brands || []).find(z => z.act_id === b.act_id);
    if (pb) b.prev = prevOf(prevTick, pb);
  }
  const checked = new Set(rec.brands.map(b => b.act_id));
  for (const z of (prevRec && prevRec.brands) || []) {
    if (checked.has(z.act_id)) continue;
    rec.brands.push({ ...z, carried: 1, checked_at: z.checked_at || prevRec.at, checked_slot: z.checked_slot || prevRec.slot });
    if ((prevRec.approved || {})[z.act_id]) rec.approved[z.act_id] = prevRec.approved[z.act_id];
  }
  const view = { ...rec, brands: rec.brands.filter(b => !b.carried) };
  await sendDm(env, deps, view, { prev: prevRec });
  rec.sent = view.sent; if (view.img_error) rec.img_error = view.img_error;
  await save(env, deps, rec);
  await deps.putSetting(env, 'standingTickLatest', rec.slot);
  if (rec.sent && !rec.sent.error) for (const h of new Set(hours)) await deps.putSetting(env, `standingSent:${slotAt(h)}`, rec.sent.at);
  await postBatch(env, deps, rec).catch(e => console.log('client batch: ' + e.message));
  return { slot, brands: checked.size, carried: rec.brands.length - checked.size, sent: rec.sent };
}

/** Apply one brand's suggestion: only the budget the check-in saw, only on the person's tap. */
async function approve(env, deps, rec, act, who) {
  const b = rec.brands.find(x => x.act_id === act);
  if (!b) return { error: 'That brand is not in this check-in.' };
  if (rec.approved && rec.approved[act]) return { error: `Already approved by ${rec.approved[act].by}.`, done: rec.approved[act] };
  const g = b.suggest || {}, camp = b.meta && b.meta.camp;
  if (!g.to || !camp || !camp.daily) return { error: 'Nothing to approve on this brand.' };
  if (Date.now() - Date.parse(b.checked_at || rec.at) > 6 * 3600e3) return { error: 'This check-in is over 6 hours old. Wait for the next one or change it on the War Room.' };
  const md = { xfetch: deps.xfetch, listAccounts: deps.listAccounts, getSetting: deps.getSetting, putSetting: deps.putSetting };
  const up = g.to > camp.daily;
  const body = { act, kind: 'budget', level: 'campaign', object: camp.id, amount: g.to, reason: `Where we stand ${rec.label}: ${g.why}`,
    client_why: up ? 'Black Friday sales are running ahead of the goal, so we gave the sale ads more budget.' : 'Black Friday sales are running under the goal, so we pulled the sale budget back to protect the return.' };
  const d = await locusWrite(env, md, { ...body, dry: true }, { who });
  if (!d || d.error) return { error: (d && d.error) || 'Meta did not answer.' };
  const was = d.before && d.before.daily_budget != null ? +d.before.daily_budget / 100 : null;
  if (was != null && Math.round(was) !== Math.round(camp.daily)) return { error: `${camp.name} is now ${money(was)}/day, not the ${money(camp.daily)} this check-in saw. Nothing was written; look again.`, stale: true };
  const r = await locusWrite(env, md, { ...body, expect: d.before && d.before.daily_budget != null ? { daily_budget: d.before.daily_budget } : undefined }, { who });
  if (!r || r.error) return { error: (r && r.error) || 'Meta did not answer.' };
  await env.DB.prepare(`UPDATE meta_campaigns SET daily_budget = ?2 WHERE campaign_id = ?1`).bind(String(camp.id), g.to).run().catch(() => {});
  rec.approved = rec.approved || {};
  rec.approved[act] = { by: who, at: new Date().toISOString(), from: camp.daily, to: g.to, write: r.write || null, summary: r.summary || '' };
  await deps.putSetting(env, `standing:${rec.slot}`, JSON.stringify(rec));
  await batchApproved(env, deps, rec, act).catch(() => {});
  return { ok: true, ...rec.approved[act] };
}

/* SEND TO CLIENT (Cole 2026-11-24: "we want to be able to send stuff whenever we make updates"). After a campaign budget
   change made through Locus (a War Room Approve, the Meta tab, Claude), Cole gets a DM with the client message already
   written in the ladder's words and two buttons. Nothing reaches a client without his tap; Send posts it AS COLE in the
   brand's client channel (brief_channel, never the internal one). No client channel = no DM. */
const OWNER_SLACK = 'U06C37MDWD7';
/* Brands whose client approves our suggestion themselves (also flagged client_approve by profit season.js). */
const CLIENT_APPROVE = new Set(['brand_yak_sports']);
/* THE CLIENT UPDATE, laid out (Cole 2026-11-24: "big headlines, real line breaks, clean, colors by KPI"). Slack Block
   Kit, posted AS COLE: a header (large type), the time and goal, then Week so far / Today so far / Last 6 hours as a
   two-column grid (Sales, Ad spend, MER, Goal) with dividers, then What we did as a real bulleted list. Three looks,
   picked with settings clientUpdateStyle: plain | dots (MER gets a colored dot) | bars (each block gets a color stripe).
   Colors: over the goal green, between break-even and goal gray, under break-even yellow. */
const usd = v => v == null ? 'n/a' : `$${Math.round(v).toLocaleString('en-US')}`;
const nx = v => v == null ? 'n/a' : `${(Math.round(v * 100) / 100).toFixed(2)}x`;
const toneOf = (mer, kpi, line) => mer == null || !kpi ? 'gray' : mer >= kpi ? 'green' : mer >= (line ?? kpi * 0.8) ? 'gray' : 'yellow';
const DOTS = { green: '🟢', gray: '⚪', yellow: '🟡' }, BARS = { green: '#2EB67D', gray: '#A3ADBF', yellow: '#ECB22E', blue: '#2A9FD8' };
/* Round 3 (Cole 2026-11-24): every section title is a Slack HEADER block (the largest type Slack draws), newest first
   (Last 6 hours, Today, This week), each number on its own line as "Sales: $1,026" with Well Copy's grey quote bar,
   no Goal line (the goal sits once under the title), and "Updates" = the plain list of what changed in the account
   ("Raised the BFCM 2026 budget from $250 to $315 a day"), never an explanation. Plain by default; 'dots' colors MER. */
const STYLES = ['plain', 'dots'];
const firstUp = s => s.charAt(0).toUpperCase() + s.slice(1);
/** One plain line per change, from the Change Log row (only rows with a client line: changes we chose to show). */
function changeLine(r) {
  const sum = String(r.summary || ''), name = r.object_name || (/"([^"]+)"/.exec(sum) || [])[1] || '';
  const m = /\$([\d,.]+)\/day\s*→\s*\$([\d,.]+)\/day/.exec(sum);
  if (m) { const a = +m[1].replace(/,/g, ''), b = +m[2].replace(/,/g, ''); return `${b > a ? 'Raised' : 'Lowered'} the ${name || 'campaign'} budget from ${usd(a)} to ${usd(b)} a day`; }
  const kind = /ad set|adset/i.test(r.object_type || sum) ? 'ad group' : /campaign/i.test(r.object_type || sum) ? 'campaign' : 'ad';
  if (/paus|turned off|off\b/i.test(sum + ' ' + (r.category || ''))) return `Turned off the ${name || ''} ${kind}`.replace(/\s+/g, ' ');
  if (/resum|turned on|activ/i.test(sum + ' ' + (r.category || ''))) return `Turned on the ${name || ''} ${kind}`.replace(/\s+/g, ' ');
  return firstUp(String(r.client_why || sum).trim().replace(/\.$/, ''));
}
/* NOT YET SENT, not "since the last send" (2026-11-26 fix: a change made a minute before a send dropped out of every
   later update). Settings `wsDid:<act>` = {floor, ids: {activity id: event_time}}: the Change Log rows a client update
   actually listed, marked only once Slack took the post. Every unmarked row of the last 48 hours (never before the
   floor = where the old "since the last send" rule stood when this began) goes in the next update. */
const DID_WINDOW = 48 * 3600e3;
async function didState(env, deps, act) {
  try { const s = JSON.parse((await deps.getSetting(env, `wsDid:${act}`)) || 'null'); return s && s.ids ? s : null; } catch { return null; }
}
/** {items: [{line, why}], ids: the rows behind the items shown, floor, tracked: the brand has a Meta account}. */
async function didRows(env, deps, act) {
  const st = await didState(env, deps, act);
  const floor = (st && st.floor) || (await deps.getSetting(env, `wsLastSent:${act}`)) || `${central().date}T06:00:00Z`;   // never sent: since midnight Central
  const win = new Date(Date.now() - DID_WINDOW).toISOString(), since = floor > win ? floor : win;
  const acts = (await metaActs(env, act)).map(m => m.act);
  if (!acts.length) return { items: [], ids: [], floor, tracked: false };
  /* Left out, as the Updates card leaves them out: rows Meta did not confirm (confirmed = -1) and Locus writes undone
     since (p_meta_write.undone, joined by the "Write mw_..." note). They are not marked either. A failed read returns
     failed: the send keeps the list it had instead of saying "No changes", and markDid only pins the floor (no ids),
     so the old "since the last send" fallback cannot skip the unmarked rows next time. */
  let rows;
  try {
    rows = ((await env.DB.prepare(`SELECT id, summary, category, object_type, object_name, client_why, event_time, note FROM activities WHERE act_id IN (${acts.map((_, i) => `?${i + 2}`).join(', ')})
    AND client_why IS NOT NULL AND client_why != '' AND COALESCE(confirmed, 0) <> -1 AND event_time >= ?1 ORDER BY event_time`).bind(since, ...acts).all()).results) || [];
  } catch { return { items: [], ids: [], floor, tracked: true, failed: true }; }
  const mwOf = r => (String(r.note || '').match(/\b(mw_[0-9a-f]+)/) || [])[1];
  const mws = [...new Set(rows.map(mwOf).filter(Boolean))], undone = new Set();
  try {
    for (let i = 0; i < mws.length; i += 50) {
      const ch = mws.slice(i, i + 50);
      const { results } = await env.DB.prepare(`SELECT id, undone FROM p_meta_write WHERE id IN (${ch.map(() => '?').join(',')})`).bind(...ch).all();
      for (const w of results || []) if (w.undone) undone.add(w.id);
    }
  } catch { return { items: [], ids: [], floor, tracked: true, failed: true }; }
  const out = [], byLine = new Map();
  for (const r of rows) {
    if (st && r.id != null && st.ids[r.id]) continue;   // already in a sent update
    if (undone.has(mwOf(r))) continue;                   // undone in Locus: it did not happen
    const line = changeLine(r);
    if (!line) continue;
    if (byLine.has(line)) { byLine.get(line).ids.push([r.id, r.event_time]); continue; }
    const why = String(r.client_why || '').trim(), it = { line, why: why && firstUp(why.replace(/\.$/, '')) !== line ? why : '' };
    byLine.set(line, { it, ids: [[r.id, r.event_time]] });
    out.push(it);
  }
  const shown = out.slice(0, 10);
  return { items: shown, ids: shown.flatMap(i => byLine.get(i.line).ids).filter(([id]) => id != null), floor, tracked: true };
}
/** The changes not yet in a sent client update, one per line ({line, why}: why = the client_why when the line is not it). */
async function didItems(env, deps, act) { return (await didRows(env, deps, act)).items; }
const didSince = async (env, deps, act) => (await didItems(env, deps, act)).map(i => i.line);
/** Mark the rows an update listed, once Slack took it. Idempotent; entries past the window are dropped. A brand with
 *  no Meta account has nothing to track and nothing is written. */
async function markDid(env, deps, act, d) {
  if (!d || !d.tracked) return;
  const old = await didState(env, deps, act);
  if (old && !d.ids.length) return;
  const st = old || { floor: d.floor, ids: {} }, keep = new Date(Date.now() - DID_WINDOW - 24 * 3600e3).toISOString();
  for (const [id, t] of d.ids) st.ids[id] = t || new Date().toISOString();
  for (const [id, t] of Object.entries(st.ids)) if (String(t) < keep) delete st.ids[id];
  await deps.putSetting(env, `wsDid:${act}`, JSON.stringify(st));
}
const UPD_NONE = 'No changes since the last update';
const updText = lines => (lines.length ? lines : [UPD_NONE]).map(d => `•  ${d}`).join('\n');
const isUpdTitle = x => !!x && ((x.type === 'header' && x.text && x.text.text === 'Updates') || (x.type === 'markdown' && x.text === '# Updates'));
/** A saved draft with its "Updates" list rebuilt from the Change Log NOW (the send), the rest as built (the check-in's
 *  numbers). Returns {dr, did}: did goes to markDid once Slack takes the post. */
async function freshDraft(env, deps, dr, rec = null) {
  const did = await didRows(env, deps, dr.act);
  if (did.failed) return { dr: JSON.parse(JSON.stringify(dr)), did };   // Change Log unreadable: the saved list, nothing marked
  const out = JSON.parse(JSON.stringify(dr)), text = updText(did.items.map(i => i.line));
  const fix = bl => { for (let i = 1; i < (bl || []).length; i++) if (isUpdTitle(bl[i - 1]) && bl[i] && bl[i].type === 'section' && bl[i].text) bl[i].text.text = text; };
  if (out.msg) { fix(out.msg.blocks); for (const a of out.msg.attachments || []) fix(a.blocks); }
  if (out.card_svg && rec) { try { out.card_svg = clientCardSvg(rec, dr.act, did.items) || out.card_svg; } catch {} }
  return { dr: out, did };
}
/* THE CARD SWITCH: the client picture card stays OFF until it has been tried in a real Slack test channel (Black
   Friday weekend is live). Settings `standingClientCard` = 'on' turns every card path on (the draft, the thread
   preview, the single DM, the client copy at Send and Send all). Off = the text update exactly as before. */
const cardOn = async (env, deps) => !!(deps && deps.getSetting) && (await deps.getSetting(env, 'standingClientCard').catch(() => null)) === 'on';
/** The client card's SVG (War Room 2.9 W2), or null. Kept on the draft so the client copy is drawn again at send time. */
async function cardSvgFor(env, deps, rec, act) {
  if (!(await cardOn(env, deps))) return null;
  const b = (rec.brands || []).find(x => x.act_id === act);
  if (!b || b.no_sales) return null;
  try { return clientCardSvg(rec, act, await didItems(env, deps, act)) || null; } catch { return null; }
}
/** The client card uploaded as the Locus bot for Cole's preview: {id, svg}, or null when anything fails (the update
 *  then goes as text only). */
async function cardFor(env, deps, rec, act) {
  const svg = await cardSvgFor(env, deps, rec, act);
  if (!svg) return null;
  try {
    const up = await slackPng(env, deps, await toPng(svg, deps.xfetch, 1600), `update-${act.replace('brand_', '')}-${rec.slot}.png`);
    return up.id ? { id: up.id, svg } : null;
  } catch { return null; }
}
const CARD_ID = 'ws_card';
const isCard = x => !!(x && x.block_id === CARD_ID);
const cardBlock = (id, name) => ({ type: 'image', block_id: CARD_ID, slack_file: { id }, alt_text: `${name}: sales, ad spend and MER against the goal, and what we changed` });
const slackWait = deps => (deps && Number.isFinite(deps.slackWait) ? deps.slackWait : 1500);
const hourOfSlot = slot => { const [d, h] = String(slot).split('T'), hr = +h; const day = new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }); return { day, hour: hr === 12 ? '12pm' : hr === 0 ? '12am' : hr < 12 ? `${hr}am` : `${hr - 12}pm` }; };
/* THE CLIENT UPDATE (Cole 2026-11-24, final brief). One shape, three moments: 9am Morning Update (adds the top 3 ads from
   yesterday with their pictures), 3pm Midday Update, 9pm End of Day. Title = header block (Slack's largest type), a
   small line under it (day · time | goal), then each window in a colored bar with a large title, three lines and a small
   status line, then Updates in Mobius blue. FIVE COLORS against the goal MER: well above (1.25x the goal or more) dark
   green, above (at goal) green, right around goal (90 to 100%) gray, a little under (down to break-even) yellow, under
   break-even red. No emojis. */
const TIER = [
  /* Cole: the dark green looked different from the first bars; well above = that bright green, above = a lighter one. */
  { key: 'great', color: '#2EB67D', label: 'Well above goal' },
  { key: 'good', color: '#2EB67D', label: 'Above goal' },   // Cole: one green, the first one (#2EB67D)
  { key: 'near', color: '#A3ADBF', label: 'Right around goal' },
  { key: 'under', color: '#ECB22E', label: 'A little under goal' },
  { key: 'bad', color: '#E01E5A', label: 'Under break-even' }];
const BLUE = '#62BDEA';   // Mobius brand blue (Locus --brand). Slack bar colors are one hex: no gradients.
function tierOf(mer, kpi, line) {
  if (mer == null || !kpi) return TIER[2];
  const r = mer / kpi;
  return r >= 1.25 ? TIER[0] : r >= 1 ? TIER[1] : r >= 0.9 ? TIER[2] : mer >= (line ?? kpi * 0.8) ? TIER[3] : TIER[4];
}
const moment = slot => { const h = +String(slot).split('T')[1]; return h < 12 ? 'Morning Update' : h >= 20 ? 'End of Day' : 'Midday Update'; };
const longDay = slot => { const [d, h] = String(slot).split('T'), hr = +h; return { day: new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }), hour: hr === 12 ? '12pm' : hr === 0 ? '12am' : hr < 12 ? `${hr}am` : `${hr - 12}pm`, date: d }; };
const prevDay = ymd => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
/** Top ads from yesterday for the morning update: still on, 2+ sales (Triple Whale), return at or over the goal
 *  (else at or over break-even when nothing clears the goal), most sales first, then return. Max 3. */
async function topAds(env, act, day, kpi, line) {
  const acts = await metaActsOf(env, act);
  if (!acts.length) return [];
  const rows = ((await env.DB.prepare(`SELECT ad_id, SUM(spend) s FROM ad_daily WHERE act_id IN (${acts.map((_, i) => `?${i + 2}`).join(', ')}) AND date = ?1 AND spend > 0 GROUP BY ad_id ORDER BY s DESC LIMIT 40`)
    .bind(day, ...acts).all().catch(() => ({ results: [] }))).results) || [];
  if (!rows.length) return [];
  const n = await adNumbers(env, { act, metaActs: acts, adIds: rows.map(r => String(r.ad_id)), days: 1, to: day });
  const live = n.ads.filter(a => String(a.status || '').toUpperCase() === 'ACTIVE' && (a.sales || 0) >= 2 && a.roas != null);
  let pick = live.filter(a => kpi && a.roas >= kpi);
  if (!pick.length) pick = live.filter(a => a.roas >= (line ?? 0));
  pick = pick.sort((p, q) => (q.sales - p.sales) || (q.roas - p.roas)).slice(0, 3);
  return withCovers(env, pick);
}
const cleanName = s => String(s || '').replace(/\s*\|\s*(Still|UGC|Video|Static|Carousel)\s*$/i, '').trim();
/** The client message: {text, blocks, attachments}. images=false leaves the ad pictures out (a retry when Slack
 *  refuses an image). */
export async function clientUpdateMsg(env, deps, rec, act, style = 'plain', name = null, { images = true, layout = 'table', mdIn = true, card = null } = {}) {
  const b = (rec.brands || []).find(x => x.act_id === act);
  if (!b || b.no_sales) return null;
  /* Per-brand cadence: "Since 2pm" replaces Last 6 hours when the brand carries its last check-in; its own next time. */
  const since = sinceWin(rec, b), L6 = since ? since.label : 'Last 6 hours', next = 'next' in b ? b.next : rec.next;
  const did = await didSince(env, deps, act), line = b.hold ?? (b.kpi ? b.kpi * 0.8 : null), t = longDay(rec.slot), m = moment(rec.slot);
  const H = s => ({ type: 'header', text: { type: 'plain_text', text: s } });
  const md = s => ({ type: 'section', text: { type: 'mrkdwn', text: s } });
  const ctx = s => ({ type: 'context', elements: [{ type: 'mrkdwn', text: s }] });
  const bar = (label, p) => {
    if (!p || p.sales == null) return null;
    const tr = tierOf(p.mer, b.kpi, line);
    return { color: tr.color, blocks: [H(label), md(`*Sales:*  ${usd(p.sales)}\n*Ad spend:*  ${usd(p.spend)}\n*MER:*  ${nx(p.mer)}`)] };
  };
  const NEW = ['rowbars', 'rowbullets', 'winbars', 'wincompact'].includes(layout), MDH = s => ({ type: 'markdown', text: `# ${s}` });
  /* Cole 2026-11-24: the markdown '#' heading draws biggest. Section titles inside a colored bar use it too when Slack
     takes a markdown block there (mdIn), else the header block. */
  const T1 = layout === 'spaced' || (NEW && mdIn) ? MDH : H;
  /* Title emoji about results (Cole): a rising chart when today is at or over the goal, else a plain chart. */
  const tEm = b.today && b.kpi && b.today.mer >= b.kpi ? '📈' : '📊';
  const title = NEW ? `${tEm} ${name || b.name} · BFCM Week · ${m}` : `${name || b.name} · ${m}`;
  const blocks = [(layout === 'spaced' || NEW ? MDH : H)(title), ctx(`${t.day}  ·  ${t.hour} CT   |   Goal: *${nx(b.kpi)} MER*`), { type: 'divider' }];
  /* The picture card on top (War Room 2.7), when one was made; the text below stays the whole update. */
  if (card && images) blocks.unshift(cardBlock(card, name || b.name));
  const wins = (m === 'End of Day' ? [['Today', b.today], ['This week', b.week]] : [[L6, since ? since.p : b.last6], ['Today', b.today], ['This week', b.week]]).filter(([, p]) => p && p.sales != null);
  let attachments;
  /* Cole 2026-11-24: the grid without the code-block names. 'clean' = no colored bars at all (bold names, grey lines,
     dividers); 'blue' = the same grid in one Mobius-blue bar (brand color, not a score). Slack's grey quote lines
     cannot take a color, so a per-window status color needs the stacked 'bars' layout. */
  const GRID = ['wc', 'clean', 'blue', 'spaced'].includes(layout), nm = l => layout === 'wc' ? `\`${l}\`` : `*${l}*`;
  if (layout === 'spaced') {
    /* Well Copy's spacing (Cole 2026-11-24): each number on its own grey line with a blank line between, two columns. */
    /* Round 2 (Cole's screenshot): no "Sales and ad spend" title; Today and This week side by side on the first row,
       Last 6 hours on its own row under a divider; window names in caps so they don't blend into the numbers. */
    /* Round 3 (Cole): Last 6 hours | Today on the top row (the day), This week alone below (the week); a colored square
       before each window's name shows it against the goal: green at or over, gray just under, yellow under goal, red
       under break-even. The square is the only way to color one window inside a two-column row. */
    const SQ = { great: '🟩', good: '🟩', near: '⬜', under: '🟨', bad: '🟥' };
    const f = (l, p) => ({ type: 'mrkdwn', text: `${SQ[tierOf(p.mer, b.kpi, line).key]}  *${l.toUpperCase()}*\n\n> *Sales:* ${usd(p.sales)}\n\n> *Ad spend:* ${usd(p.spend)}\n\n> *MER:* ${nx(p.mer)}` });
    const get = k => wins.find(([l]) => l === k);
    const row1 = [get(L6), get('Today')].filter(Boolean), wk = get('This week');
    if (row1.length) blocks.push({ type: 'section', fields: row1.map(([l, p]) => f(l, p)) });
    if (wk) blocks.push({ type: 'divider' }, { type: 'section', fields: [f(wk[0], wk[1])] });
    attachments = [];
  } else if (layout === 'rowbars' || layout === 'rowbullets' || layout === 'winbars' || layout === 'wincompact') {
    /* Round 4 (Cole 2026-11-24): a big colored bar beside the numbers, the small lines (or plain bullets) inside it.
       rowbars / rowbullets = one bar per row (the day row takes Today's color, the week row This week's), two columns;
       winbars = one bar per window, stacked, so each window has its own color. */
    const bullets = layout === 'rowbullets';
    const txt = (l, p) => `*${l.toUpperCase()}*\n${bullets
      ? `•  *Sales:* ${usd(p.sales)}\n•  *Ad spend:* ${usd(p.spend)}\n•  *MER:* ${nx(p.mer)}`
      : `\n> *Sales:* ${usd(p.sales)}\n\n> *Ad spend:* ${usd(p.spend)}\n\n> *MER:* ${nx(p.mer)}`}`;
    const get = k => wins.find(([l]) => l === k), col = p => tierOf(p && p.mer, b.kpi, line).color;
    attachments = [];
    if (layout === 'wincompact') {
      /* H, condensed (Cole 2026-11-24: "boom boom boom, without it being so long"): each window its own colored bar,
         its three numbers on one line, so the whole stats part is three short bars. */
      for (const [l, p] of wins) attachments.push({ color: col(p), blocks: [md(`*${l.toUpperCase()}*\n*Sales* ${usd(p.sales)}   ·   *Ad spend* ${usd(p.spend)}   ·   *MER* ${nx(p.mer)}`)] });
    } else if (layout === 'winbars') {
      for (const [l, p] of wins) attachments.push({ color: col(p), blocks: [md(txt(l, p))] });
    } else {
      const row1 = [get(L6), get('Today')].filter(Boolean), wk = get('This week');
      /* One bar per row is all Slack allows (Cole asked for a bar per window): the day row takes the WORSE of Last 6
         hours and Today, so a bad stretch never hides behind a good one. */
      const worst = row1.map(([, p]) => tierOf(p && p.mer, b.kpi, line)).sort((x, y) => TIER.indexOf(y) - TIER.indexOf(x))[0];
      if (row1.length) attachments.push({ color: worst ? worst.color : col(null), blocks: [{ type: 'section', fields: row1.map(([l, p]) => ({ type: 'mrkdwn', text: txt(l, p) })) }] });
      if (wk) attachments.push({ color: col(wk[1]), blocks: [{ type: 'section', fields: [{ type: 'mrkdwn', text: txt(wk[0], wk[1]) }] }] });
    }
  } else if (layout === 'lines') {
    /* Small colored bars (Cole: "make the smaller bars different colors"): the grey quote line has no color setting in
       Slack, so each number becomes its own one-line colored bar. MER takes the goal color; Sales and Ad spend carry
       Mobius blue. Bars stack, so the windows run top to bottom. */
    attachments = [];
    for (const [l, p] of wins) {
      attachments.push({ color: BLUE, blocks: [md(`*${l}*\n*Sales:* ${usd(p.sales)}`)] },
        { color: BLUE, blocks: [md(`*Ad spend:* ${usd(p.spend)}`)] },
        { color: tierOf(p.mer, b.kpi, line).color, blocks: [md(`*MER:* ${nx(p.mer)}`)] });
    }
  } else if (layout === 'clean' || layout === 'blue') {
    const f = (l, p) => ({ type: 'mrkdwn', text: `${nm(l)}\n> *Sales:* ${usd(p.sales)}\n> *Ad spend:* ${usd(p.spend)}\n> *MER:* ${nx(p.mer)}` });
    const grid = [H('Sales and ad spend'), { type: 'section', fields: wins.map(([l, p]) => f(l, p)) }];
    if (layout === 'clean') { blocks.push(...grid); attachments = []; }
    else attachments = [{ color: BLUE, blocks: grid }];
  } else if (layout === 'wc') {
    /* Well Copy's grid (Cole's screenshot 2026-11-24): a section with two `fields` per row, each window's name in
       inline code (Slack draws it orange), each number its own quote line (grey bar). The grid sits in one bar colored
       by Today. Slack fields are two columns at most: Last 6 hours | Today, then This week. */
    const f = (l, p) => ({ type: 'mrkdwn', text: `\`${l}\`\n> *Sales:* ${usd(p.sales)}\n> *Ad spend:* ${usd(p.spend)}\n> *MER:* ${nx(p.mer)}` });
    const today = (wins.find(([l]) => l === 'Today') || wins[0] || [])[1];
    attachments = [{ color: tierOf(today && today.mer, b.kpi, line).color, blocks: [H('Sales and ad spend'), { type: 'section', fields: wins.map(([l, p]) => f(l, p)) }] }];
  } else if (layout === 'table' || layout === 'tabletop') {
    /* All windows side by side in one Slack table (Cole: "a shorter message"); its bar takes Today's color. */
    const cell = (s, bold) => ({ type: 'rich_text', elements: [{ type: 'rich_text_section', elements: [{ type: 'text', text: s || ' ', ...(bold ? { style: { bold: true } } : {}) }] }] });
    const row = (label, f) => [cell(label, true), ...wins.map(([, p]) => cell(f(p)))];
    const table = { type: 'table', column_settings: [{ align: 'left' }, ...wins.map(() => ({ align: 'right' }))],
      rows: [[cell(' '), ...wins.map(([l]) => cell(l, true))], row('Sales', p => usd(p.sales)), row('Ad spend', p => usd(p.spend)), row('MER', p => nx(p.mer))] };
    const today = (wins.find(([l]) => l === 'Today') || wins[0] || [])[1];
    if (layout === 'table') attachments = [{ color: tierOf(today && today.mer, b.kpi, line).color, blocks: [table] }];
    else { blocks.push(table); attachments = []; }
  } else attachments = wins.map(([l, p]) => bar(l, p)).filter(Boolean);
  if (m === 'Morning Update') {
    const ads = await topAds(env, act, prevDay(t.date), b.kpi, line).catch(() => []);
    if (ads.length) {
      const ab = [T1('Top ads yesterday'), ctx('Still running, most sales at or over the goal')];
      ads.forEach((a, i) => {
        if (GRID) {   // the same name + grey-line look, the ad's picture beside it
          ab.push({ type: 'section', text: { type: 'mrkdwn', text: `${nm(`${i + 1}. ${cleanName(a.name)}`)}\n> *Sales:* ${a.sales}\n> *Spent:* ${usd(a.spend)}\n> *Return:* ${nx(a.roas)}` },
            ...(images && a.cover ? { accessory: { type: 'image', image_url: a.cover, alt_text: cleanName(a.name) } } : {}) });
          return;
        }
        ab.push({ type: 'divider' }, md(`*${i + 1}. ${cleanName(a.name)}*\n${a.sales} sales  ·  ${usd(a.spend)} spent  ·  ${nx(a.roas)} return`));
        if (images && a.cover) ab.push({ type: 'image', image_url: a.cover, alt_text: cleanName(a.name) });
      });
      if (layout === 'clean' || layout === 'spaced') blocks.push({ type: 'divider' }, ...ab); else attachments.push({ color: BLUE, blocks: ab });
    }
  }
  const upd = [T1('Updates'), md(updText(did)),
    ctx(next ? `Next update at ${next} CT` : 'Next update tomorrow at 8am CT')];
  /* The client decides (client_approve, Yak): our suggestion with an Approve button the client taps; Locus makes the
     change only on that tap and confirms only once Meta took it (handleClientUpdateButton ws_capprove). */
  const sg = b.suggest || {}, camp = b.meta && b.meta.camp;
  if ((b.client_approve || CLIENT_APPROVE.has(act)) && sg.to && camp && camp.daily && !(rec.approved || {})[act]) {
    const up = sg.to > camp.daily;
    const sug = [T1('Our suggestion'), md(`${up ? 'Raise' : 'Lower'} the Black Friday budget from *${usd(camp.daily)}* to *${usd(sg.to)}* a day. ${up ? `The store is at ${nx(b.so_far && b.so_far.mer)} return on ad spend for the sale, over your ${nx(b.kpi)} goal.` : `The store is under break-even, so we would protect the return.`}`),
      { type: 'actions', elements: [{ type: 'button', action_id: 'ws_capprove', style: 'primary', text: { type: 'plain_text', text: `Approve ${usd(sg.to)} a day` }, value: `${rec.slot}|${act}` }] },
      ctx('Tap Approve and it goes live right away; we will confirm here once it is done. Or just reply with a yes or no.')];
    if (layout === 'clean' || layout === 'spaced') blocks.push({ type: 'divider' }, ...sug); else attachments.push({ color: '#2EB67D', blocks: sug });
  }
  if (layout === 'clean' || layout === 'spaced') blocks.push({ type: 'divider' }, ...upd); else attachments.push({ color: BLUE, blocks: upd });
  return { text: `${name || b.name} ${m}, ${t.day} ${t.hour}`, blocks, attachments };
}
/** DM Cole one brand's client update (exactly as the client will see it) with Send / Don't send. */
export async function offerClientUpdate(env, deps, { act, rec = null, style = null, label = null, at = null }) {
  const b = await env.DB.prepare(`SELECT name, brief_channel, slack_channel FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
  if (!b) return null;
  /* No client channel (Lucky): Cole still gets the update, for himself, with no Send button. */
  const forCole = !b.brief_channel || b.brief_channel === b.slack_channel;
  if (forCole) label = label || `${b.name} · for you (no client channel)`;
  rec = rec || await load(env, deps).catch(() => null);
  if (!rec) return { ok: false, error: 'No check-in yet.' };
  /* A preview of another moment (sample route): the same numbers drawn as the 9am or 9pm version. */
  if (at === 'morning' || at === 'evening') rec = { ...rec, slot: `${String(rec.slot).split('T')[0]}T${at === 'morning' ? '08' : '20'}`, next: at === 'morning' ? '2pm' : null };
  const saved = await deps.getSetting(env, 'clientUpdateStyle');
  const st = STYLES.includes(style) ? style : STYLES.includes(saved) ? saved : 'plain';
  const id = Math.random().toString(16).slice(2, 12);
  const btns = { type: 'actions', elements: [
    { type: 'button', action_id: 'ws_send', style: 'primary', text: { type: 'plain_text', text: `Send to ${b.name}` }, value: id },
    { type: 'button', action_id: 'ws_skip', text: { type: 'plain_text', text: "Don't send" }, value: id }] };
  const top = { type: 'context', elements: [{ type: 'mrkdwn', text: `*${label || `Ready to send to ${b.name}`}*  ·  exactly what they will see` }] };
  /* Layouts in order of preference; Slack refusing one (a table inside a colored bar, a table at all, an ad picture)
     falls to the next. Whatever reached Cole is what Send posts. */
  /* Cole 2026-11-24: the separate colored bars, stacked (Slack cannot put colored bars side by side). */
  const pick = ['clean', 'blue', 'bars', 'wc', 'spaced', 'lines', 'rowbars', 'rowbullets', 'winbars', 'wincompact'].includes(style) ? style : (['clean', 'blue', 'bars', 'spaced', 'lines', 'rowbars', 'winbars', 'wincompact'].includes(await deps.getSetting(env, 'clientUpdateLayout')) ? await deps.getSetting(env, 'clientUpdateLayout') : 'wincompact');
  /* The picture card goes first; Slack refusing it falls back to exactly the tries before it. */
  const cardUp = await cardFor(env, deps, rec, act), card = cardUp && cardUp.id;
  const tries = [...(card ? [[pick, true, true, card]] : []), [pick, true, true], [pick, true, false], [pick, false, false], ['bars', false, false]];
  let r = { ok: false, error: 'nothing tried' }, used = null;
  for (const [layout, images, mdIn, cd = null] of tries) {
    const m = await clientUpdateMsg(env, deps, rec, act, st, b.name, { layout, images, mdIn, card: cd });
    if (!m) return { ok: false, error: 'No sales numbers for this brand.' };
    const tail = forCole ? [] : [btns];
    const msg = m.attachments && m.attachments.length ? { text: m.text, blocks: [top, ...m.blocks], attachments: [...m.attachments, ...(tail.length ? [{ blocks: tail }] : [])] }
      : { text: m.text, blocks: [top, ...m.blocks, ...tail] };
    r = await dmPerson(env, deps, env.OWNER_EMAIL || 'cole@go-mobius-digital.com', msg);
    if (r.ok) { used = layout + (cd ? ' (picture card)' : '') + (images ? '' : ' (no pictures)') + (mdIn ? '' : ' (header titles in bars)'); await deps.putSetting(env, `wsDraft:${id}`, JSON.stringify({ v: 3, act, ch: b.brief_channel, msg: m, name: b.name, at: new Date().toISOString(), ...(cd ? { card_svg: cardUp.svg } : {}) })); break; }
    if (!/invalid_blocks|invalid_attachments|image|table/i.test(String(r.error || ''))) break;
    r.tried = `${r.tried || ''}${layout}: ${String(r.error).slice(0, 120)}; `;
  }
  r.layout = used;
  return r;
}
/* ONE MESSAGE PER CHECK-IN (Cole 2026-11-24: "one message, not back to back"). After the scoreboard, Cole gets one
   "Client updates" message: a line per brand with its own Send button (and Send all), and every full preview in that
   message's thread. A brand with a raise or cut waiting shows "Waiting on your Approve"; Approve fills its line in.
   State: settings wsBatch:<slot> = {slot, channel, ts, items: [{act, name, id, status}]}; status ready | forme |
   waiting | sent | skipped. */
const OWNER = env => env.OWNER_EMAIL || 'cole@go-mobius-digital.com';
/* card: 'upload' = the bot's picture in Cole's preview (and the SVG kept for the client copy); 'svg' = only the SVG
   kept (nobody previews this draft, the client copy is drawn at send time); 'none' = text only (postBatch adds the
   picture after the batch message is out, so a card can never cost the batch). */
async function draftFor(env, deps, rec, act, batchSlot = null, { card = 'upload' } = {}) {
  const b = await env.DB.prepare(`SELECT name, brief_channel, slack_channel FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
  if (!b) return null;
  const forCole = !b.brief_channel || b.brief_channel === b.slack_channel;
  const saved = await deps.getSetting(env, 'clientUpdateLayout');
  const layout = ['clean', 'blue', 'bars', 'spaced', 'rowbars', 'winbars', 'wincompact'].includes(saved) ? saved : 'wincompact';
  const up = card === 'upload' ? await cardFor(env, deps, rec, act) : null;
  const svg = up ? up.svg : card === 'svg' ? await cardSvgFor(env, deps, rec, act) : null;
  const m = await clientUpdateMsg(env, deps, rec, act, 'plain', b.name, { layout, images: true, mdIn: true, card: up && up.id });
  if (!m) return null;
  const id = Math.random().toString(16).slice(2, 12);
  const dr = { v: 3, act, ch: forCole ? null : b.brief_channel, msg: m, name: b.name, forCole, batch: batchSlot, at: new Date().toISOString(), ...(svg ? { card_svg: svg } : {}) };
  await deps.putSetting(env, `wsDraft:${id}`, JSON.stringify(dr));
  return { id, name: b.name, forCole, m, dr };
}
/** The picture added to a text draft already saved (postBatch, after the batch message). Any failure leaves the text. */
async function addCard(env, deps, rec, d) {
  try {
    if (!d || !d.dr || (d.m.blocks || []).some(isCard) || !(await cardOn(env, deps))) return;
    const up = await cardFor(env, deps, rec, d.dr.act);
    if (!up) return;
    d.m.blocks = [cardBlock(up.id, d.name), ...(d.m.blocks || [])];
    d.dr = { ...d.dr, msg: d.m, card_svg: up.svg };
    await deps.putSetting(env, `wsDraft:${d.id}`, JSON.stringify(d.dr));
  } catch (e) { console.log('client card: ' + e.message); }
}
const STATUS = { ready: 'Ready to send', forme: 'For you (no client channel)', waiting: 'Waiting on your Approve above', sent: 'Sent ✓', skipped: 'Not sent', sending: 'Sending...' };
/* over = {item id: {status?, note?}}: how the message shows an item right now without saving it (Sending... while a
   Send runs, the error after a failed one). Never stored, so a run that dies leaves the saved batch as it was. */
function batchBlocks(rec, bt, over = null) {
  const hr = +String(rec.slot).split('T')[1], when = hr === 12 ? '12pm' : hr < 12 ? `${hr}am` : `${hr - 12}pm`;
  const blocks = [{ type: 'markdown', text: `# Client updates · ${when}` },
    { type: 'context', elements: [{ type: 'mrkdwn', text: 'Each full update is in the thread below. Send posts it as you in that client\'s channel.' }] }, { type: 'divider' }];
  const items = bt.items.map(i => (over && i.id && over[i.id] ? { ...i, ...over[i.id] } : i));
  for (const it of items) {
    const sec = { type: 'section', text: { type: 'mrkdwn', text: `*${it.name}*\n${it.note || STATUS[it.status] || it.status}` } };
    if (it.status === 'ready' && it.id) sec.accessory = { type: 'button', action_id: 'ws_send', style: 'primary', text: { type: 'plain_text', text: 'Send' }, value: it.id };
    blocks.push(sec);
  }
  /* Send all sits right under the title (Cole 2026-11-25 could not find how to send): one tap sends every ready one. */
  const nReady = items.filter(i => i.status === 'ready').length;
  if (nReady) blocks.splice(2, 0, { type: 'actions', elements: [{ type: 'button', action_id: 'ws_sendall', style: 'primary', text: { type: 'plain_text', text: nReady > 1 ? `Send all ${nReady} to clients` : 'Send to client' }, value: rec.slot }] });
  return blocks;
}
/* A preview carrying the picture: Slack can refuse a fresh upload for a moment, so retry a few times (as postRetry),
   then post the same preview without the picture. Without a picture it is the one post it always was. */
async function threadPreview(env, deps, bt, d) {
  const post = blocks => deps.slackApi(env, 'chat.postMessage', { channel: bt.channel, thread_ts: bt.ts, text: d.m.text, blocks, attachments: d.m.attachments, unfurl_links: false, username: 'Locus', icon_url: 'https://tools.go-mobius-digital.com/favicon.png' }).catch(e => ({ ok: false, error: e.message }));
  const bl = d.m.blocks;
  let r = await post(bl);
  if (!(bl || []).some(isCard)) return r;
  for (let i = 0; i < 3 && !(r && r.ok) && /invalid_blocks/.test(String((r && r.error) || '')); i++) {
    await new Promise(z => setTimeout(z, slackWait(deps)));
    r = await post(bl);
  }
  if (r && r.ok) return r;
  return post(bl.filter(x => !isCard(x)));
}
async function saveBatch(env, deps, rec, bt, update = true, over = null) {
  await deps.putSetting(env, `wsBatch:${bt.slot}`, JSON.stringify(bt));
  if (update) await showBatch(env, deps, rec, bt, over);
}
/** Redraw the batch message only (nothing saved): Sending... the moment a Send is tapped. */
async function showBatch(env, deps, rec, bt, over = null) {
  if (bt.ts) await deps.slackApi(env, 'chat.update', { channel: bt.channel, ts: bt.ts, text: 'Client updates', blocks: batchBlocks(rec, bt, over), username: 'Locus', icon_url: 'https://tools.go-mobius-digital.com/favicon.png' }).catch(() => null);
}
/** The one message for a check-in. */
export async function postBatch(env, deps, rec) {
  const u = await deps.slackApi(env, 'users.lookupByEmail', { email: OWNER(env) });
  const uid = u && u.user && u.user.id;
  if (!uid) return { ok: false, error: 'no slack user' };
  const bt = { slot: rec.slot, channel: null, ts: null, items: [] }, drafts = [];
  for (const b of rec.brands) {
    if (b.no_sales || b.carried) continue;   // carried = not checked this time (per-brand cadence)
    /* Every brand's update is ready to send now (2026-11-25: the 2pm round never went out because three brands sat
       "waiting on your Approve" with no draft). An Approve later rebuilds that brand's draft with the change in it. */
    const d = await draftFor(env, deps, rec, b.act_id, rec.slot, { card: 'none' }).catch(() => null);
    if (!d) continue;
    bt.items.push({ act: b.act_id, name: d.name, id: d.id, status: d.forCole ? 'forme' : 'ready' });
    drafts.push(d);
  }
  if (!bt.items.length) return { ok: true, empty: true };
  const r = await deps.slackApi(env, 'chat.postMessage', { channel: uid, text: 'Client updates', blocks: batchBlocks(rec, bt), unfurl_links: false, username: 'Locus', icon_url: 'https://tools.go-mobius-digital.com/favicon.png' });
  if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'slack' };
  bt.channel = r.channel; bt.ts = r.ts;
  await saveBatch(env, deps, rec, bt, false);
  /* The batch and its text drafts are saved before any picture is drawn: if the run dies drawing one, Send still works. */
  for (const d of drafts) { if (!d.forCole) await addCard(env, deps, rec, d); await threadPreview(env, deps, bt, d); }
  return { ok: true, items: bt.items.length };
}
/** After an Approve: that brand's update joins the check-in's message (or comes alone when there is none). */
export async function batchApproved(env, deps, rec, act) {
  const raw = await deps.getSetting(env, `wsBatch:${rec.slot}`), bt = raw ? JSON.parse(raw) : null;
  const it = bt && bt.items.find(i => i.act === act);
  /* A batch with no Slack message (a page Send on a Check now slot saves one) has no thread to preview in: the single
     Send to client DM, as with no batch at all. */
  if (!bt || !it || !bt.channel || !bt.ts) return offerClientUpdate(env, deps, { act, rec });
  const d = await draftFor(env, deps, rec, act, rec.slot);
  if (!d) return null;
  it.id = d.id; it.status = d.forCole ? 'forme' : 'ready';
  await threadPreview(env, deps, bt, d);
  await saveBatch(env, deps, rec, bt);
  return { ok: true };
}
/** The card uploaded as Cole (the user token), shared nowhere, so the copy the client sees belongs to the person who
 *  posts it; the bot's preview file is never put in front of a client. {id} or {error}. */
async function userPng(env, xfetch, svg, name) {
  try {
    const bytes = await toPng(svg, xfetch, 1600);
    const form = o => ({ method: 'POST', headers: { Authorization: `Bearer ${env.SLACK_USER_TOKEN}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])).toString() });
    const a = await xfetch('https://slack.com/api/files.getUploadURLExternal', form({ filename: name, length: bytes.length })).then(r => r.json());
    if (!a || !a.ok) return { error: (a && a.error) || 'upload url' };
    const up = await xfetch(a.upload_url, { method: 'POST', body: bytes });
    if (!up.ok) return { error: `upload ${up.status}` };
    const c = await xfetch('https://slack.com/api/files.completeUploadExternal', form({ files: [{ id: a.file_id, title: name }] })).then(r => r.json());
    return c && c.ok ? { id: a.file_id } : { error: (c && c.error) || 'complete upload' };
  } catch (e) { return { error: e.message }; }
}
/* card = the standingClientCard switch (cardOn); off = the text update only, whatever the draft carries. wait = the
   pause between card retries (Send all passes 0: its loop runs after the ACK and must never sit waiting). */
async function sendDraft(env, xfetch, dr, { wait = 1500, card = false } = {}) {
  if (!env.SLACK_USER_TOKEN) return { ok: false, error: 'no Slack user token on Locus' };
  if (!dr.ch) return { ok: false, error: 'no client channel' };
  const post = msg => xfetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${env.SLACK_USER_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ channel: dr.ch, ...msg, unfurl_links: false }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
  const bl = (dr.msg && dr.msg.blocks) || [], hadCard = bl.some(isCard);
  /* The text update exactly as it went out before the picture card existed. */
  const plain = hadCard ? { ...dr.msg, blocks: bl.filter(x => !isCard(x)) } : dr.msg;
  if (!card || !dr.card_svg) {
    const r = await post(plain);
    return r.ok && hadCard ? { ...r, card_dropped: card ? 'no card to draw' : 'card off' } : r;
  }
  /* The client's copy of the picture, drawn and uploaded as Cole now; refused or failed = the text update. */
  const up = await userPng(env, xfetch, dr.card_svg, `update-${String(dr.act || '').replace('brand_', '')}.png`);
  if (!up.id) { const r = await post(plain); return r.ok ? { ...r, card_dropped: up.error } : r; }
  const withCard = { ...plain, blocks: [cardBlock(up.id, dr.name || 'Update'), ...(plain.blocks || [])] };
  let r = await post(withCard);
  for (let i = 0; i < 3 && !r.ok && /invalid_blocks/.test(String(r.error || '')); i++) { await new Promise(z => setTimeout(z, wait)); r = await post(withCard); }
  if (r.ok || !/invalid_blocks|invalid_attachments|image|file/i.test(String(r.error || ''))) return r;
  const r2 = await post(plain);
  return r2.ok ? { ...r2, card_dropped: String(r.error || '') } : r2;
}
/** One brand's update out of a check-in's batch: the send_batch loop's own steps (War Room 2.9 W3). Returns a result
 *  row; marks the batch item and wsLastSent. The caller saves the batch. */
async function sendItem(env, deps, rec, it, slot) {
  if (it.status === 'forme' || it.status === 'sent' || it.status === 'skipped') return { name: it.name, skipped: it.status };
  /* One send per brand at a time: a double tap (two requests at once) must not post twice. The claim is one atomic D1
     row; the second request finds it taken and skips. wsLastSent is read AFTER the claim, so a request that waited
     for the first one sees its send. Cleared after the post either way (wsLastSent then guards). */
  const claim = await claimSend(env, it.act);
  if (!claim) return { name: it.name, skipped: 'sending' };
  try {
    const last = await deps.getSetting(env, `wsLastSent:${it.act}`);
    if (last && Date.now() - Date.parse(last) < 2 * 3600e3) { it.status = 'sent'; return { name: it.name, skipped: 'sent in the last 2 hours' }; }
    if (!it.id) { const d = await draftFor(env, deps, rec, it.act, slot, { card: 'svg' }); if (!d) return { name: it.name, error: 'no draft' }; it.id = d.id; if (d.forCole) { it.status = 'forme'; return { name: it.name, skipped: 'forme' }; } }
    /* The time BEFORE the Change Log is read: a change landing during the send is after it, so it waits for the next. */
    const now = new Date().toISOString(), saved = JSON.parse((await deps.getSetting(env, `wsDraft:${it.id}`)) || 'null');
    const f = saved ? await freshDraft(env, deps, saved, rec) : null, dr = f && f.dr;
    const res = dr ? await sendDraft(env, deps.xfetch, dr, { wait: slackWait(deps), card: await cardOn(env, deps) }) : { ok: false, error: 'draft gone' };
    if (res.ok) { it.status = 'sent'; dr.done = `sent ${now}`; await deps.putSetting(env, `wsDraft:${it.id}`, JSON.stringify(dr)); await deps.putSetting(env, `wsLastSent:${it.act}`, now); await markDid(env, deps, it.act, f.did); return { name: it.name, sent: true }; }
    return { name: it.name, error: res.error };
  } finally { await releaseSend(env, it.act, claim); }
}
/* The send claim: settings row `wsSending:<act>` = "<iso time> <token>", taken with one INSERT that only wins when no
   claim exists or the one there is over 2 minutes old (a run that died mid send). Returns the value, or null. */
async function claimSend(env, act) {
  if (!env.DB) return 'nodb';
  const val = `${new Date().toISOString()} ${crypto.randomUUID().slice(0, 8)}`, stale = new Date(Date.now() - 120e3).toISOString();
  const r = await env.DB.prepare(`INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value WHERE settings.value < ?3`)
    .bind(`wsSending:${act}`, val, stale).run().catch(() => null);
  return r && r.meta && r.meta.changes === 1 ? val : null;
}
async function releaseSend(env, act, val) {
  if (!env.DB || val === 'nodb') return;
  await env.DB.prepare(`DELETE FROM settings WHERE key = ?1 AND value = ?2`).bind(`wsSending:${act}`, val).run().catch(() => null);
}
/** The buttons: Approve on the scoreboard, Send / Send all on the batch, Send / Don't send on a single update. Cole only. */
export async function handleClientUpdateButton(env, ctx, payload, deps, { ACK, xfetch }) {
  const a = (payload.actions || []).find(x => /^ws_/.test(x.action_id || ''));
  const reply = t => payload.response_url && xfetch(payload.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replace_original: true, text: t }) }).catch(() => {});
  /* A word only Cole sees (a stale button: "Already sent"); nothing is posted in the thread or to a client. */
  const privately = t => payload.response_url
    ? xfetch(payload.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ response_type: 'ephemeral', replace_original: false, text: t }) }).catch(() => {})
    : deps.slackApi(env, 'chat.postEphemeral', { channel: payload.channel && payload.channel.id, user: payload.user && payload.user.id, text: t }).catch(() => {});
  /* A single Send to client DM (no batch message): its buttons swapped for a line (Sending...), or put back after a
     failed post, through the message's response_url. */
  const dmButtons = line => {
    const m = payload.message;
    if (!payload.response_url || !m) return null;
    const strip = bl => (bl || []).filter(b => !(b.type === 'actions' && (b.elements || []).some(e => /^ws_/.test(e.action_id || ''))));
    const body = line == null ? { replace_original: true, text: m.text, blocks: m.blocks, attachments: m.attachments }
      : { replace_original: true, text: m.text, blocks: [...strip(m.blocks), { type: 'context', elements: [{ type: 'mrkdwn', text: line }] }],
        attachments: (m.attachments || []).map(x => ({ ...x, blocks: strip(x.blocks) })).filter(x => !x.blocks || x.blocks.length || x.text) };
    return xfetch(payload.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  };
  const inThread = t => deps.slackApi(env, 'chat.postMessage', { channel: payload.channel && payload.channel.id, thread_ts: payload.message && payload.message.ts, text: t, username: 'Locus', icon_url: 'https://tools.go-mobius-digital.com/favicon.png' }).catch(() => {});
  ctx.waitUntil((async () => {
    if (a.action_id === 'ws_capprove') {
      /* The CLIENT's Approve (Yak): only in that brand's client channel (or Cole), only on a check-in under 6 hours old
         (approve() checks), confirmed only once Meta took the change. Cole hears either way. */
      const [slot, act] = String(a.value || '').split('|');
      const br = await env.DB.prepare(`SELECT name, brief_channel FROM brand_accounts WHERE act_id = ?1`).bind(act).first().catch(() => null);
      if (!br || (payload.channel && payload.channel.id) !== br.brief_channel && payload.user?.id !== OWNER_SLACK) return inThread('This button only works in the client channel.');
      const rec = await load(env, deps, slot).catch(() => null);
      const who = `${payload.user.name || payload.user.username || 'client'} (${br.name}, Slack)`;
      const r = rec ? await approve(env, deps, rec, act, who).catch(e => ({ error: e.message })) : { error: 'That suggestion is gone.' };
      if (r && r.ok) {
        await inThread(`Done. ${br.name}'s Black Friday budget is now ${money(r.to)} a day (was ${money(r.from)}). It is live in Meta.`);
        await dmPerson(env, deps, env.OWNER_EMAIL || 'cole@go-mobius-digital.com', { text: `${who} approved: ${br.name} ${money(r.from)} -> ${money(r.to)} a day. Live in Meta.` }).catch(() => {});
      } else {
        await inThread('We could not make that change automatically. Cole will take care of it and confirm here.');
        await dmPerson(env, deps, env.OWNER_EMAIL || 'cole@go-mobius-digital.com', { text: `${who} tapped Approve on ${br.name} but it did not go through: ${(r && r.error) || 'unknown'}. Change it by hand and confirm in their channel.` }).catch(() => {});
      }
      return null;
    }
    if (payload.user?.id !== OWNER_SLACK) return inThread('Only Cole can do that.');
    if (a.action_id === 'ws_approve') {
      const [slot, act] = String(a.value || '').split('|');
      const rec = await load(env, deps, slot).catch(() => null);
      if (!rec) return inThread('That check-in is gone.');
      const r = await approve(env, deps, rec, act, `${payload.user.name || 'Cole'} (Slack)`).catch(e => ({ error: e.message }));
      const b = rec.brands.find(x => x.act_id === act) || {};
      return inThread(r && r.ok ? `✓ ${b.name}: ${money(r.from)} → ${money(r.to)} a day. Its client update is now ready in Client updates.` : `${b.name || act}: not changed. ${(r && r.error) || ''}`);
    }
    const batchOf = async slot => { const raw = slot ? await deps.getSetting(env, `wsBatch:${slot}`) : null; return raw ? JSON.parse(raw) : null; };
    if (a.action_id === 'ws_sendall') {
      const bt = await batchOf(a.value), rec = await load(env, deps, a.value).catch(() => null);
      if (!bt || !rec) return inThread('That batch is gone.');
      /* The send claim per brand (as sendItem), taken for every ready brand BEFORE anything posts: a second tap, or the
         page's Send, finds the brand claimed and posts nothing. After the claim the batch and each draft are read again,
         so a brand another request sent while this one waited is skipped. */
      const claims = new Map();
      for (const it of bt.items.filter(i => i.status === 'ready')) { const c = await claimSend(env, it.act); if (c) claims.set(it.id, c); }
      const release = async it => { const c = claims.get(it.id); if (c) { claims.delete(it.id); await releaseSend(env, it.act, c); } };
      const cur = await batchOf(a.value), sentAt = {}, took = claims.size;
      const todo = [];
      for (const it of bt.items.filter(i => claims.has(i.id))) {
        const ci = cur && cur.items.find(i => i.id === it.id), saved = JSON.parse((await deps.getSetting(env, `wsDraft:${it.id}`)) || 'null');
        if ((ci && ci.status !== 'ready') || (saved && saved.done)) { await release(it); continue; }
        todo.push(it);
      }
      if (!todo.length) return privately(!took && bt.items.some(i => i.status === 'ready') ? 'Already sending.' : 'Already sent.');
      const over = Object.fromEntries(todo.map(i => [i.id, { status: 'sending' }]));
      await showBatch(env, deps, rec, cur || bt, over);
      const done = [], failed = [];
      try {
        const card = await cardOn(env, deps);
        for (const it of todo) {
          try {
            const now = new Date().toISOString(), saved = JSON.parse((await deps.getSetting(env, `wsDraft:${it.id}`)) || 'null');
            const f = saved ? await freshDraft(env, deps, saved, rec) : null, dr = f && f.dr;
            const res = dr ? await sendDraft(env, xfetch, dr, { wait: 0, card }) : { ok: false, error: 'gone' };
            if (res.ok) { it.status = 'sent'; sentAt[it.id] = 1; dr.done = `sent ${now}`; await deps.putSetting(env, `wsDraft:${it.id}`, JSON.stringify(dr)); await deps.putSetting(env, `wsLastSent:${it.act}`, now); await markDid(env, deps, it.act, f.did); done.push(it.name); delete over[it.id]; }
            else { failed.push(`${it.name} (${res.error})`); over[it.id] = { note: `Not sent (${res.error}). Tap Send to try again.` }; }
          } finally { await release(it); }
        }
      } catch (e) {
        /* Something threw after Sending... was drawn: put the stored batch back (no override) so the Send buttons return,
           with any brand that did go out marked Sent. Then rethrow. */
        const fin = (await batchOf(a.value).catch(() => null)) || bt;
        for (const i of fin.items) if (sentAt[i.id]) i.status = 'sent';
        await (Object.keys(sentAt).length ? saveBatch(env, deps, rec, fin) : showBatch(env, deps, rec, fin)).catch(() => {});
        throw e;
      } finally { for (const it of todo) await release(it); }
      /* Saved onto the batch as it is now, so a brand another request sent meanwhile keeps its Sent. */
      const fin = (await batchOf(a.value)) || bt;
      for (const i of fin.items) if (sentAt[i.id]) i.status = 'sent';
      await saveBatch(env, deps, rec, fin, true, Object.keys(over).length ? over : null);
      return failed.length ? inThread(`Not sent: ${failed.join(', ')}`) : null;
    }
    const raw = await deps.getSetting(env, `wsDraft:${a.value}`);
    const dr = raw ? JSON.parse(raw) : null;
    if (!dr) return inThread('That update is gone.');
    const already = d => (/^sent/.test(String(d.done)) ? `Already sent to ${d.name}.` : `${d.name}: already ${d.done}.`);
    if (dr.done) return privately(already(dr));
    let bt = await batchOf(dr.batch), rec = bt ? await load(env, deps, dr.batch).catch(() => null) : null;
    let it = bt && bt.items.find(i => i.id === a.value);
    if (a.action_id === 'ws_skip') {
      dr.done = 'not sent'; await deps.putSetting(env, `wsDraft:${a.value}`, JSON.stringify(dr));
      if (it && rec) { it.status = 'skipped'; await saveBatch(env, deps, rec, bt); return null; }
      return reply(`Not sent to ${dr.name}.`);
    }
    if (dr.v !== 3 || !dr.msg) return inThread('That is an older draft. Nothing was sent.');
    /* The send claim per brand, BEFORE posting (as sendItem): a double tap, or this button racing the page's Send,
       posts once. The claimed request reads the draft and the batch again, so a send that finished while it waited
       is seen; the claim is released after the post either way (the draft's done mark then guards). */
    const claim = await claimSend(env, dr.act);
    if (!claim) return privately(`${dr.name} is already sending.`);
    try {
      const d2 = JSON.parse((await deps.getSetting(env, `wsDraft:${a.value}`)) || 'null') || dr;
      if (d2.done) return privately(already(d2));
      if (bt) { bt = (await batchOf(dr.batch)) || bt; it = bt.items.find(i => i.id === a.value); }
      if (it && (it.status === 'sent' || it.status === 'skipped')) return privately(it.status === 'sent' ? `Already sent to ${d2.name}.` : `${d2.name}: already not sent.`);
      if (it && rec) await showBatch(env, deps, rec, bt, { [it.id]: { status: 'sending' } }); else await dmButtons(`Sending to ${d2.name}...`);
      /* Sent goes onto the batch as it is now (read again, as ws_sendall does), so another send's Sent mark made meanwhile stays. */
      const markSent = async () => {
        const cur = (await batchOf(dr.batch).catch(() => null)) || bt, ci = cur.items.find(i => i.id === it.id);
        if (ci) ci.status = 'sent'; else cur.items.push({ ...it, status: 'sent' });
        await saveBatch(env, deps, rec, cur);
      };
      let posted = false;
      try {
        const now = new Date().toISOString(), f = await freshDraft(env, deps, d2, rec), fr = f.dr;
        const res = await sendDraft(env, xfetch, fr, { card: await cardOn(env, deps) });
        if (!res.ok) {
          if (it && rec) await showBatch(env, deps, rec, bt, { [it.id]: { note: `Not sent (${res.error}). Tap Send to try again.` } }); else await dmButtons(null);
          return inThread(`${dr.name}: Slack refused it (${res.error}). Nothing was sent.`);
        }
        posted = true;
        fr.done = `sent ${now}`; await deps.putSetting(env, `wsDraft:${a.value}`, JSON.stringify(fr));
        await deps.putSetting(env, `wsLastSent:${dr.act}`, now);
        await markDid(env, deps, dr.act, f.did);
        if (it && rec) { await markSent(); return null; }
        return reply(`✓ Sent to ${dr.name}.`);
      } catch (e) {
        /* Something threw after Sending... was drawn: redraw the stored batch (no override), or the DM's buttons, so
           Send comes back (a post that already went out is marked Sent instead, as ws_sendall does). Then rethrow. */
        if (it && rec) await (posted ? markSent() : showBatch(env, deps, rec, (await batchOf(dr.batch).catch(() => null)) || bt)).catch(() => {});
        else if (!posted) await dmButtons(null); else await reply(`✓ Sent to ${dr.name}.`);
        throw e;
      }
    } finally { await releaseSend(env, dr.act, claim); }
  })());
  return ACK();
}

/** One brand's sale campaign, opened from its War Room tile (Cole, 2026-11-22: "real analysis: the ad sets, which ads to
 *  cut and when"). Structure live from Meta (CBO or ABO, each live set with its budget, min and cap, B copies), each set's
 *  and ad's last 3 synced days from the Buyer list's numbers (Meta delivery, Triple Whale last click, first click, share
 *  of first-click buyers who were new), and per ad one label: cut (a Locus call from today's Buyer list, with its reason),
 *  waiting (inside the wait window: under 2x the goal CPA spent or under 3 days live), or keep. Reads only. */
export async function brandDetail(env, deps, act) {
  const today = central().date;
  const md = { xfetch: deps.xfetch, listAccounts: deps.listAccounts, getSetting: deps.getSetting, putSetting: deps.putSetting };
  const ml = await metaLive(env, md, act, { season: true });
  if (ml.error) return { error: ml.error };
  const dec = today >= '2026-12-01';
  const camps = Object.entries(ml.campaigns || {}).map(([id, c]) => ({ id, ...c })).filter(c => c.status === 'ACTIVE' && SALE_RE.test(c.name || ''))
    .sort((a, b) => ((/holiday/i.test(a.name) ? (dec ? 0 : 5) : (dec ? 5 : 0)) - (/holiday/i.test(b.name) ? (dec ? 0 : 5) : (dec ? 5 : 0))) || (b.daily || 0) - (a.daily || 0));
  /* The campaign the call acts on, and only its sets that run now or start within 2 days (not December's sets in November). */
  const cids = new Set(camps.slice(0, 1).map(c => c.id)), now = Date.now();
  const inCamp = Object.entries(ml.adsets || {}).map(([id, s]) => ({ id, ...s })).filter(s => cids.has(String(s.campaign)) && s.status === 'ACTIVE' && !(s.end && Date.parse(s.end) < now));
  let sets = inCamp.filter(s => !(s.start && Date.parse(s.start) > now + 2 * 864e5));
  /* Nothing live yet (the days before Black Friday): show the sets that start next, so the page says what is loaded. */
  if (!sets.length && inCamp.length) { const first = Math.min(...inCamp.map(s => Date.parse(s.start) || Infinity)); sets = inCamp.filter(s => Math.abs((Date.parse(s.start) || 0) - first) < 3600e3); }
  const acct = ((await deps.listAccounts(env, true)) || []).find(a => a.act_id === act) || {};
  const goalCpa = +acct.target_cpa || null, goalRoas = +acct.target_roas || null;
  let nums = { from: null, to: null, ads: [] }, calls = [], callErr = null;
  if (sets.length) {
    const metaActs = await metaActsOf(env, act);
    nums = await adNumbers(env, { act, metaActs, adsetIds: sets.map(s => s.id), days: 3 });
    /* The wait window counts everything an ad has spent, not just the 3 days shown. */
    const ids = nums.ads.map(a => a.ad_id).slice(0, 90);
    if (ids.length) {
      const rows = ((await env.DB.prepare(`SELECT ad_id, SUM(spend) s FROM ad_daily WHERE ad_id IN (${ids.map((_, i) => `?${i + 1}`).join(', ')}) GROUP BY ad_id`).bind(...ids).all().catch(() => ({ results: [] }))).results) || [];
      for (const a of nums.ads) a.life = +((rows.find(r => String(r.ad_id) === a.ad_id) || {}).s) || a.spend || 0;
    }
  }
  if (deps.buyer) {
    try {
      const bl = await buildBuyerList(env, deps.buyer, { act, ads: false });
      calls = (bl.rows || []).filter(r => ['cut', 'trim', 'scale', 'refresh', 'mixed'].includes(r.kind) && (cids.has(String(r.campaign_id)) || sets.some(s => s.id === String(r.adset_id))))
        .map(r => ({ kind: r.kind, level: r.level, adset_id: r.adset_id ? String(r.adset_id) : null, ad_id: r.ad_id ? String(r.ad_id) : null, name: r.name, action: r.action, why: r.why_full || r.why }));
    } catch (e) { callErr = e.message; }
  }
  const daysLive = d => d ? Math.max(1, Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(d + 'T12:00:00Z')) / 864e5) + 1) : null;
  const total = nums.ads.reduce((t, a) => t + (a.spend || 0), 0);
  const outSets = sets.map(s => {
    const ads = nums.ads.filter(a => a.adset_id === s.id).map(a => {
      const call = calls.find(c => c.ad_id === a.ad_id && c.level === 'ad');
      const live = daysLive(a.first_spend), need = goalCpa ? goalCpa * 2 : null;
      let label = 'keep', note = '';
      if (call && ['cut', 'trim'].includes(call.kind)) { label = 'cut'; note = call.why; }
      else if ((live != null && live < 3) || (need && (a.life || 0) < need)) {
        label = 'wait';
        const more = need ? Math.max(0, Math.round(need - (a.life || 0))) : 0, dLeft = live != null ? Math.max(0, 3 - live) : 0;
        note = `In its wait window: ${[more ? `$${more} more spend` : '', dLeft ? `${dLeft} more day${dLeft === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ') || 'almost there'} before it can be judged.`;
      }
      return { ad_id: a.ad_id, name: a.name, spend: a.spend, sales: a.sales, revenue: a.revenue, roas: a.roas, cpa: a.cpa, fc_sales: a.fc_sales, new_share: a.new_share, role: a.role, days_live: live, label, note, call: call ? call.action : null };
    });
    const t = sumAds(ads.map(a => ({ ...a, ctr: null, cpm: null, freq: null })));
    const setCall = calls.find(c => c.level === 'adset' && c.adset_id === s.id);
    return { id: s.id, name: s.name, daily: s.daily || null, min: s.min || null, cap: s.cap || null, start: s.start || null, end: s.end || null, later: !!(s.start && Date.parse(s.start) > now),
      b_copy: /\|\s*[B-D]\b|\b[B-D] copy\b|\s[B-D]$/i.test(s.name || ''), share: total ? Math.round((t.spend || 0) / total * 100) : null, ...t, call: setCall ? { action: setCall.action, why: setCall.why, kind: setCall.kind } : null,
      ads: ads.sort((p, q) => ({ cut: 0, wait: 2, keep: 1 }[p.label] - { cut: 0, wait: 2, keep: 1 }[q.label]) || (q.spend || 0) - (p.spend || 0)) };
  }).sort((a, b) => (b.spend || 0) - (a.spend || 0));
  const main = camps[0] || null;
  return { act, today, from: nums.from, to: nums.to, goal_cpa: goalCpa, goal_roas: goalRoas, calls_error: callErr,
    campaigns: camps.map(c => ({ id: c.id, name: c.name, daily: c.daily || null, cbo: !!c.daily, meta_act: c.act })),
    structure: main ? `${main.name}: ${main.daily ? `CBO, $${Math.round(main.daily).toLocaleString('en-US')}/day` : 'ABO (each ad set has its own budget)'} · ${sets.filter(x => !(x.start && Date.parse(x.start) > now)).length} live ad sets${sets.some(x => x.start && Date.parse(x.start) > now) ? `, ${sets.filter(x => x.start && Date.parse(x.start) > now).length} starting soon` : ''}${outSets.filter(s => s.b_copy).length ? `, ${outSets.filter(s => s.b_copy).length} of them B copies` : ''}` : 'No live sale campaign in Meta.',
    sets: outSets, ads_manager: main ? `https://adsmanager.facebook.com/adsmanager/manage/adsets?act=${String(main.act || '').replace(/^act_/, '')}&selected_campaign_ids=${main.id}` : null };
}

/** Routes. Team only (isAdmin), brandsFor limits what a person may approve. */
export async function handleStanding(request, env, url, path, json, deps) {
  if (!path.startsWith('/api/standing')) return null;
  if (!(await deps.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  const email = await deps.sessionEmail(env, request).catch(() => null);
  const body = request.method === 'POST' || request.method === 'PUT' ? await request.json().catch(() => ({})) : {};
  try {
    if (path === '/api/standing' && request.method === 'GET') {
      const rec = await load(env, deps, url.searchParams.get('slot'));
      return json(rec ? { ok: true, standing: rec } : { ok: true, standing: null });
    }
    /* Which layout the 3-hourly DM uses (Cole picks on the options page). */
    if (path === '/api/standing/style' && request.method === 'PUT') {
      if (!DM_STYLES.includes(body.style)) return json({ error: `Style is one of ${DM_STYLES.join(', ')}.` }, 400);
      await deps.putSetting(env, 'standingDmStyle', body.style);
      return json({ ok: true, style: body.style });
    }
    /* The DM as it would go out now, in a style, as JSON (nothing sent): for the options page and Block Kit checks. */
    if (path === '/api/standing/preview' && request.method === 'GET') {
      const rec = await load(env, deps, url.searchParams.get('slot')), st = url.searchParams.get('style') || 'board';
      if (!rec) return json({ error: 'No check-in yet.' }, 404);
      return json(st === 'list' ? standingMessage(rec) : standingCard(rec, null, st, linkOf(rec)));
    }
    if (path === '/api/standing/brand' && request.method === 'GET') {
      const act = String(url.searchParams.get('act') || '');
      if (!/^brand_[a-z0-9_]+$/.test(act)) return json({ error: 'Which brand?' }, 400);
      const only = await deps.brandsFor(env, email).catch(() => null);
      if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      const r = await brandDetail(env, deps, act);
      return json(r, r.error ? 502 : 200);
    }
    /* The Send to client DM for a change made another way (by hand in Ads Manager, before this existed). Cole only gets a DM. */
    /* Also reachable as POST /api/standing/sample {client_update: true, ...} (that path is in the route list tools read). */
    if ((path === '/api/standing/client-update' || (path === '/api/standing/sample' && body.client_update)) && request.method === 'POST') {
      const act = String(body.act || '');
      if (!/^brand_[a-z0-9_]+$/.test(act)) return json({ error: 'Which brand?' }, 400);
      const r = await offerClientUpdate(env, deps, { act, style: body.style || null, label: body.label || null, at: body.at || null });
      return json(r ? { ok: !!r.ok, error: r.error || null, layout: r.layout || null, tried: r.tried || null } : { ok: false, error: 'No client channel for this brand, or the budget did not change.' });
    }
    if (path === '/api/standing/run' && request.method === 'POST') {
      const prev = await load(env, deps).catch(() => null);
      const rec = await buildStanding(env, deps, slotOf());
      if (body.send) await sendDm(env, deps, rec, { style: body.style, prev, img: /^https:\/\/[^\s]+$/.test(body.img || '') ? body.img : null });
      await save(env, deps, rec);
      return json({ ok: true, standing: rec, message: standingMessage(rec).text });
    }
    /* A labelled sample DM to Cole (2026-11-22: "show me real ones"): agency (every brand) or one brand's client
       version (act), in a style; style d draws the scoreboard PNG and uploads it to Slack (no public link). */
    /* Title-size test (Cole 2026-11-24: "their headings are bigger than ours"): one DM with each kind of Slack title
       Locus can send, labeled, so he can see which one Slack draws biggest. */
    /* The check-in's two messages now, on the latest check-in: the scoreboard (with Slack Approve buttons) and the one
       Client updates message. What the 9am / 3pm / 9pm tick sends, on demand. */
    if (path === '/api/standing/sample' && request.method === 'POST' && body.batch) {
      const rec = await load(env, deps).catch(() => null);
      if (!rec) return json({ error: 'No check-in yet.' }, 404);
      /* no_dm: only the client updates, no scoreboard (2026-11-25: scoreboard pictures + drafts in one request ran out of CPU). */
      const prev = null, d1 = body.no_dm ? null : await sendDm(env, deps, rec, { prev }).catch(e => ({ ok: false, error: e.message }));
      const d2 = await postBatch(env, deps, rec).catch(e => ({ ok: false, error: e.message }));
      /* Counts as that slot's check-in, so the hourly catch-up does not send it a second time. */
      if (d1 && d1.ok) await deps.putSetting(env, `standingSent:${rec.slot}`, new Date().toISOString());
      return json({ scoreboard: { ok: !!(d1 && d1.ok), error: (d1 && d1.error) || null }, batch: d2 });
    }
    /* Send a check-in's client updates from Locus (Cole 2026-11-25: "please send the stuff"): every brand in that
       batch except Lucky-style for-you items and anything sent in the last 2 hours; a brand still "waiting" gets its
       update drafted now (without a change). Posts as Cole, marks the batch message. */
    if (path === '/api/standing/sample' && request.method === 'POST' && body.send_batch) {
      const slot = String(body.send_batch), raw = await deps.getSetting(env, `wsBatch:${slot}`), bt = raw ? JSON.parse(raw) : null;
      const rec = await load(env, deps, slot).catch(() => null);
      if (!bt || !rec) return json({ error: 'No batch for that check-in.' }, 404);
      const out = [];
      for (const it of bt.items) out.push(await sendItem(env, deps, rec, it, slot));
      await saveBatch(env, deps, rec, bt);
      return json({ ok: true, results: out });
    }
    /* One brand's client update now (War Room 2.9 W3, the page's "Send to client"): the send_batch steps for that
       brand's item in the check-in's batch. Owner only; posts as Cole in the client's channel. */
    if (path === '/api/standing/send' && request.method === 'POST') {
      if (String(email || '').toLowerCase() !== OWNER(env).toLowerCase()) return json({ error: 'Only the owner can send to a client.' }, 403);
      const act = String(body.act || ''), slot = String(body.slot || '');
      if (!/^brand_[a-z0-9_]+$/.test(act) || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(slot)) return json({ error: 'act and slot (YYYY-MM-DDTHH)' }, 400);
      let rec = await load(env, deps, slot).catch(() => null), b = rec && rec.brands.find(x => x.act_id === act);
      /* A brand carried into this record was checked earlier: its own check-in holds its numbers and batch. */
      const at = b && b.carried && b.checked_slot ? b.checked_slot : slot;
      if (at !== slot) { rec = await load(env, deps, at).catch(() => null); b = rec && rec.brands.find(x => x.act_id === act); }
      if (!rec || !b) return json({ error: 'That brand is not in that check-in.' }, 404);
      if (b.no_sales) return json({ error: 'No sales numbers for this brand.' }, 404);
      /* No batch for that check-in (a page "Check now" saves a record with none) or no item for the brand: draft it now
         from that record and send it with the same guards (sendItem drafts an item with no id; no client channel is
         refused; the 2 hour rule and the send claim hold). The new item joins that check-in's batch. */
      const raw = await deps.getSetting(env, `wsBatch:${at}`), bt = raw ? JSON.parse(raw) : { slot: at, channel: null, ts: null, items: [] };
      let it = bt.items.find(i => i.act === act);
      if (!it) { it = { act, name: b.name, id: null, status: 'ready' }; bt.items.push(it); }
      const res = await sendItem(env, deps, rec, it, at);
      if (res.skipped !== 'sending') await saveBatch(env, deps, rec, bt);
      return json({ ok: !!res.sent, slot: at, ...res }, res.error ? 502 : 200);
    }
    /* The Meta daily limit per brand, set by hand (Meta no longer reports it). Owner only. GET = every brand's number and
       where it comes from; PUT {act, limit} sets one (limit null or 0 = back to the built-in default). */
    if (path === '/api/standing/limits') {
      if (String(email || '').toLowerCase() !== OWNER(env).toLowerCase()) return json({ error: 'Only the owner can change the Meta limits.' }, 403);
      const saved = await savedLimits(env, deps);
      if (request.method === 'PUT' || request.method === 'POST') {
        const act = String(body.act || ''), v = body.limit == null || body.limit === '' ? 0 : +body.limit;
        if (!/^brand_[a-z0-9_]+$/.test(act)) return json({ error: 'Which brand?' }, 400);
        if (!Number.isFinite(v) || v < 0 || v > 1e7) return json({ error: 'limit is dollars a day (a positive number), or null for the default.' }, 400);
        if (v > 0) saved[act] = Math.round(v * 100) / 100; else delete saved[act];
        await deps.putSetting(env, 'metaLimits', JSON.stringify(saved));
      }
      const acts = [...new Set([...Object.keys(KNOWN_LIMITS), ...Object.keys(saved)])];
      return json({ ok: true, source: 'set by hand', limits: Object.fromEntries(acts.map(a => [a, limitOf(a, saved)])), defaults: { ...KNOWN_LIMITS } });
    }
    /* The per-brand cadence switch (War Room 2.9 W1): off (the default) = every brand on 8am, 2pm, 8pm whatever the
       season answers say; on = each brand's checkin_hours answer counts. Owner only. GET shows the switch and the
       answers stored. */
    if (path === '/api/standing/schedule') {
      if (String(email || '').toLowerCase() !== OWNER(env).toLowerCase()) return json({ error: 'Only the owner can change the check-in schedule.' }, 403);
      if (request.method === 'POST') await deps.putSetting(env, 'checkinSchedule', body.on ? 'on' : 'off');
      const on = (await deps.getSetting(env, 'checkinSchedule')) === 'on';
      const rows = env.DB ? (((await env.DB.prepare(`SELECT act_id, value FROM p_season_answer WHERE season = ?1 AND key = 'checkin_hours'`).bind('2026').all().catch(() => ({ results: [] }))).results) || []) : [];
      return json({ ok: true, on, answers: rows.map(r => ({ act: r.act_id, value: r.value })) });
    }
    /* The client card as a PNG (War Room 2.9 W4): the same picture Slack gets, for Download image. Team only. */
    if (path === '/api/standing/card.png' && request.method === 'GET') {
      const act = String(url.searchParams.get('act') || '');
      const only = await deps.brandsFor(env, email).catch(() => null);
      if (only && !only.has(act)) return json({ error: 'You do not have access to this brand.' }, 403);
      const rec = await load(env, deps, url.searchParams.get('slot')), svg = rec && clientCardSvg(rec, act, await didItems(env, deps, act));
      if (!svg) return json({ error: 'That brand is not in that check-in.' }, 404);
      return new Response(await toPng(svg, deps.xfetch, 1600), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'private, no-store' } });
    }
    /* Take a message back (Cole only, through the admin gate): {delete: {channel, ts, as_cole}}. as_cole = a message
       Locus sent under Cole's name; otherwise the bot's own. */
    if (path === '/api/standing/sample' && request.method === 'POST' && body.delete) {
      const d = body.delete || {};
      if (!d.channel || !d.ts) return json({ error: 'channel and ts' }, 400);
      const r = d.as_cole
        ? await deps.xfetch('https://slack.com/api/chat.delete', { method: 'POST', headers: { Authorization: `Bearer ${env.SLACK_USER_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ channel: d.channel, ts: d.ts }) }).then(x => x.json()).catch(e => ({ ok: false, error: e.message }))
        : await deps.slackApi(env, 'chat.delete', { channel: d.channel, ts: d.ts }).catch(e => ({ ok: false, error: e.message }));
      return json({ ok: !!(r && r.ok), error: (r && r.error) || null });
    }
    if (path === '/api/standing/sample' && request.method === 'POST' && body.title_test) {
      const lbl = s => ({ type: 'context', elements: [{ type: 'mrkdwn', text: s }] });
      const body1 = { type: 'section', text: { type: 'mrkdwn', text: '*Sales:* $6,118   (normal text, for comparison)' } };
      const msg = { text: 'Title size test', blocks: [
        lbl('1. Header block'), { type: 'header', text: { type: 'plain_text', text: 'Black Friday Update' } }, body1, { type: 'divider' },
        lbl('2. Markdown block, "#" heading'), { type: 'markdown', text: '# Black Friday Update' }, body1, { type: 'divider' },
        lbl('3. Markdown block, "##" heading'), { type: 'markdown', text: '## Black Friday Update' }, body1, { type: 'divider' },
        lbl('4. Bold text'), { type: 'section', text: { type: 'mrkdwn', text: '*Black Friday Update*' } }, body1] };
      const r = await dmPerson(env, deps, env.OWNER_EMAIL || 'cole@go-mobius-digital.com', msg);
      return json({ ok: !!r.ok, error: r.error || null });
    }
    if (path === '/api/standing/sample' && request.method === 'POST') {
      const st = ['a', 'b', 'c', 'd', 'ops'].includes(body.style) ? body.style : 'd', act = body.act ? String(body.act) : null;
      const prev = await load(env, deps).catch(() => null);
      const rec = body.fresh ? await buildStanding(env, deps, slotOf()) : prev;
      if (!rec) return json({ error: 'No check-in yet.' }, 404);
      if (body.fresh) await save(env, deps, rec);
      if (act && !rec.brands.find(b => b.act_id === act)) return json({ error: 'That brand is not on the board.' }, 400);
      const r = await sendSample(env, deps, rec, body.fresh ? prev : null, { style: st, act, label: String(body.label || '').slice(0, 80) });
      return json(r, r.ok ? 200 : 502);
    }
    if (path === '/api/standing/approve' && request.method === 'POST') {
      const who = email || String(body.by || '').trim().slice(0, 80);
      if (!who) return json({ error: 'Say who is approving: add "by" to the body.' }, 400);
      const only = await deps.brandsFor(env, email).catch(() => null);
      if (only && !only.has(body.act)) return json({ error: 'You do not have access to this brand.' }, 403);
      const rec = await load(env, deps, body.slot);
      if (!rec) return json({ error: 'No check-in by that time.' }, 404);
      const r = await approve(env, deps, rec, String(body.act || ''), who);
      return json(r, r.error ? 409 : 200);
    }
    return json({ error: 'not found' }, 404);
  } catch (e) { return json({ error: e.message }, 502); }
}
