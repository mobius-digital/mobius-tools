/* WHERE WE STAND (2026-11-22): the Black Friday check-in every 3 hours, Thu Nov 26 to Mon Nov 30.
 * Cole: "I don't want it to automatically raise the scaling thing. I just want it to check it... it should be in Locus,
 * the Black Friday war room... it tells me, and then we can talk about it and I can approve it or not. Real-time
 * updates, especially during Black Friday Cyber Monday weekend: here's where we stand so far. Maybe every 3 hours."
 *
 * One check-in = per brand (I&G left out: Fela runs it), from the profit worker's GET /api/season/standing (Triple
 * Whale: weekend revenue vs the weekend goal, MER so far and over the last 6 hours vs the KPI, the suggestion), plus
 * Meta read here: the live sale campaign's daily budget, the account's daily spending limit (adtrust_dsl) and the
 * headroom under it. Scale +50% / Hold / Cut 25%. NOTHING is changed by this job. A budget changes only when Cole taps
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
import { adNumbers, metaActsOf, sumAds } from './buyerai.js';
import { buildBuyerList } from './buyerlist.js';
import { standingCard } from './standingdm.js';

const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
export const STAND_DAYS = { from: '2026-11-26', to: '2026-11-30' };
/* Central hours. 9am to 9pm every 3 hours, and 11pm to close the day (a midnight read would be an empty new day). */
export const STAND_HOURS = [9, 12, 15, 18, 21, 23];
const KNOWN_LIMITS = { brand_lucky_golf: 6637, brand_dartee_golf: 13806, brand_bonk_golf: 5000, brand_grunk_dolfer: 2583, brand_yak_sports: 841, brand_vetripaws: 3428 };
const SALE_RE =/bfcm|black friday|cyber|holiday 20\d\d/i;

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
export function pickSaleCamp(ml, today) {
  const dec = today >= '2026-12-01';
  const cs = Object.entries((ml && ml.campaigns) || {}).map(([id, c]) => ({ id, ...c })).filter(c => c.status === 'ACTIVE' && SALE_RE.test(c.name || ''));
  const score = c => (c.daily ? 0 : 10) + (/holiday/i.test(c.name) ? (dec ? 0 : 5) : (dec ? 5 : 0));
  return cs.sort((a, b) => score(a) - score(b) || (b.daily || 0) - (a.daily || 0))[0] || null;
}
/** Everything that can spend today: ACTIVE campaigns' daily budgets, plus ACTIVE ad sets' own budgets in ACTIVE campaigns without one. */
export function budgetsOn(ml) {
  const C = (ml && ml.campaigns) || {}; let t = 0;
  for (const c of Object.values(C)) if (c.status === 'ACTIVE' && c.daily) t += c.daily;
  for (const s of Object.values((ml && ml.adsets) || {})) { const c = C[s.campaign]; if (s.status === 'ACTIVE' && s.daily && c && c.status === 'ACTIVE' && !c.daily) t += s.daily; }
  return t;
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
  const camp = pickSaleCamp(ml, today), on = budgetsOn(ml);
  let limit = null, limitErr = null, src = 'meta';
  for (const m of await metaActs(env, act)) {
    const a = await gget(md, env, m.act, { fields: 'adtrust_dsl' }).catch(e => { limitErr = e.message; return null; });
    const v = a && +a.adtrust_dsl;
    if (v > 0) limit = (limit || 0) + v;   // -1 = no limit
  }
  /* Meta would not say: the limits Cole listed on 2026-11-22 (raise requests pending), labelled as such. */
  if (limit == null && KNOWN_LIMITS[act]) { limit = KNOWN_LIMITS[act]; src = 'known'; }
  return { camp: camp ? { id: camp.id, name: camp.name, daily: camp.daily || null } : null, on, limit, limit_src: limit ? src : null, limit_error: limitErr, headroom: limit ? limit - on : null };
}

/** Build one check-in (reads only). */
export async function buildStanding(env, deps, slot = slotOf()) {
  const md = { xfetch: deps.xfetch, listAccounts: deps.listAccounts, getSetting: deps.getSetting, putSetting: deps.putSetting };
  const tw = await readProfit(env, deps, '/api/season/standing');
  const brands = [];
  for (const b of tw.brands || []) {
    let m; try { m = await metaSide(env, md, b.act_id, tw.today); } catch (e) { m = { error: e.message }; }
    const sug = { ...b.suggest }, from = m.camp && m.camp.daily;
    if (!m.error && !m.camp) sug.note = 'No live sale campaign in Meta.';
    else if (!m.error && sug.pct && !from) sug.note = `${m.camp.name} has no campaign daily budget (ad set budgets).`;
    else if (!m.error) { const bf = budgetFor(sug, from, m.limit, m.on); sug.to = bf.to; if (bf.note) sug.note = bf.note; }
    brands.push({ ...b, meta: m, suggest: sug });
  }
  return { slot, at: new Date().toISOString(), label: slotLabel(slot), next: nextLabel(slot), today: tw.today, dry: tw.dry, brands, approved: {} };
}

/** The next check-in after this slot, in words ("6pm", "9am Fri"), or null after the last one. */
export function nextLabel(slot) {
  const [d, h] = slot.split('T'), hr = +h, i = STAND_HOURS.findIndex(x => x > hr);
  const fmt = x => x === 12 ? '12pm' : x < 12 ? `${x}am` : `${x - 12}pm`;
  if (i >= 0) return fmt(STAND_HOURS[i]);
  const nd = new Date(d + 'T12:00:00Z'); nd.setUTCDate(nd.getUTCDate() + 1);
  const ymd = nd.toISOString().slice(0, 10);
  if (ymd > STAND_DAYS.to) return null;
  return `${fmt(STAND_HOURS[0])} ${nd.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}`;
}
const W = { scale: 'Scale +50%', hold: 'Hold', cut: 'Cut 25%' };
const ORDER = { cut: 0, scale: 1, hold: 2 };
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
  const intro = `Here's where we stand on Black Friday weekend as of ${rec.label.replace(' CT', '')}${rec.dry ? ' (a dry run on today, the weekend starts Thu Nov 26)' : ''}, and what needs you.`;
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
    const head = `${b.name}: ${ap ? `approved, ${money(ap.from)} to ${money(ap.to)}/day` : `${W[g.call] || 'Hold'}${g.to ? ` to ${money(g.to)}/day` : ''}`}${g.call === 'scale' && !ap ? ' 🎉' : ''}`;
    const sub = [b.no_sales ? `Spend: ${kmoney(s.spend)} (no Triple Whale store, so no sales or MER)` : `Sales: ${kmoney(s.sales)} of ${kmoney(b.goal)} (${pctOf(s.sales, b.goal)}%)`];
    if (!b.no_sales) sub.push(`MER: ${xx(s.mer)} so far, ${xx(l6.mer)} last 6 hours (KPI ${xx(b.kpi)})`);
    sub.push(m.error ? `Budget: Meta did not answer (${m.error})` : !m.camp ? 'Budget: no live sale campaign in Meta'
      : `Budget: ${m.camp.daily ? `${money(m.camp.daily)}/day` : 'ad set budgets'}${m.limit ? `, ${money(m.headroom)} room under Meta's limit` : ''}`);
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
export const DM_STYLES = ['list', 'wc', 'board', 'a', 'b', 'c', 'd'];
const linkOf = rec => act => `${LOCUS}?open=warlive&act=all&standing=${encodeURIComponent(rec.slot)}${act ? `&brand=${encodeURIComponent(act)}` : ''}`;
/** The DM in the style Cole picked (settings `standingDmStyle`; 'list' = the rich-text list until he picks), or `style` for a test. */
async function sendDm(env, deps, rec, { style, prev, img } = {}) {
  const st = DM_STYLES.includes(style) ? style : DM_STYLES.includes(await deps.getSetting(env, 'standingDmStyle')) ? await deps.getSetting(env, 'standingDmStyle') : 'list';
  const msg = st === 'list' ? standingMessage(rec) : standingCard(rec, prev, st, linkOf(rec), { img });
  const r = await dmPerson(env, deps, env.OWNER_EMAIL || 'cole@go-mobius-digital.com', msg);
  rec.sent = r.ok ? { at: new Date().toISOString(), ts: r.ts } : { error: r.error };
  return r;
}

/** The hourly cron's step: in the window, on a 3-hour slot, once per slot. */
export async function standingTick(env, deps, now = new Date()) {
  const c = central(now);
  if (c.date < STAND_DAYS.from || c.date > STAND_DAYS.to) return { skipped: 'outside Nov 26 to 30' };
  if (!STAND_HOURS.includes(c.hour)) return { skipped: 'not a check-in hour' };
  const slot = slotOf(now);
  /* Its own flag: a "Check now" on the page in the same hour writes standingLatest too and must not swallow the DM. */
  if (await deps.getSetting(env, `standingSent:${slot}`)) return { skipped: 'already sent' };
  const prev = await load(env, deps).catch(() => null);
  const rec = await buildStanding(env, deps, slot);
  await sendDm(env, deps, rec, { prev });
  await save(env, deps, rec);
  if (rec.sent && !rec.sent.error) await deps.putSetting(env, `standingSent:${slot}`, rec.sent.at);
  return { slot, brands: rec.brands.length, sent: rec.sent };
}

/** Apply one brand's suggestion: only the budget the check-in saw, only on the person's tap. */
async function approve(env, deps, rec, act, who) {
  const b = rec.brands.find(x => x.act_id === act);
  if (!b) return { error: 'That brand is not in this check-in.' };
  if (rec.approved && rec.approved[act]) return { error: `Already approved by ${rec.approved[act].by}.`, done: rec.approved[act] };
  const g = b.suggest || {}, camp = b.meta && b.meta.camp;
  if (!g.to || !camp || !camp.daily) return { error: 'Nothing to approve on this brand.' };
  if (Date.now() - Date.parse(rec.at) > 6 * 3600e3) return { error: 'This check-in is over 6 hours old. Wait for the next one or change it on the War Room.' };
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
  return { ok: true, ...rec.approved[act] };
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
  const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
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
    if (path === '/api/standing/run' && request.method === 'POST') {
      const prev = await load(env, deps).catch(() => null);
      const rec = await buildStanding(env, deps, slotOf());
      if (body.send) await sendDm(env, deps, rec, { style: body.style, prev, img: /^https:\/\/[^\s]+$/.test(body.img || '') ? body.img : null });
      await save(env, deps, rec);
      return json({ ok: true, standing: rec, message: standingMessage(rec).text });
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
