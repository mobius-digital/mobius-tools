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
  return { slot, at: new Date().toISOString(), label: slotLabel(slot), today: tw.today, dry: tw.dry, brands, approved: {} };
}

/** The Slack DM: one line per brand, an Approve link where there is a budget to change. */
export function standingMessage(rec) {
  const link = act => `${LOCUS}?open=warlive&act=all&standing=${encodeURIComponent(rec.slot)}${act ? `&brand=${encodeURIComponent(act)}` : ''}`;
  const ok = rec.brands.filter(b => !b.no_sales && b.so_far && b.so_far.sales != null);
  const S = ok.reduce((t, b) => t + b.so_far.sales, 0), P = ok.reduce((t, b) => t + b.so_far.spend, 0), G = ok.reduce((t, b) => t + (b.goal || 0), 0);
  const head = `Where we stand, ${rec.label}${rec.dry ? ' (dry run on today, the weekend starts Thu Nov 26)' : ''}`;
  const top = `${kmoney(S)} of ${kmoney(G)} weekend goal (${G ? Math.round(S / G * 100) : 0}%) on ${kmoney(P)} ads, MER ${xx(P ? S / P : null)}`;
  const W = { scale: 'Scale +50%', hold: 'Hold', cut: 'Cut 25%' };
  const lines = rec.brands.map(b => {
    const s = b.so_far || {}, l6 = b.last6 || {}, m = b.meta || {}, g = b.suggest || {};
    const rev = b.no_sales ? `spend ${kmoney(s.spend)} (no Triple Whale store)` : `${kmoney(s.sales)} of ${kmoney(b.goal)} (${s.pct_goal != null ? Math.round(s.pct_goal * 100) : 0}%), MER ${xx(s.mer)} so far, ${xx(l6.mer)} last 6h (KPI ${xx(b.kpi)})`;
    const bud = m.error ? `Meta: ${m.error}` : `${m.camp ? `${m.camp.daily ? money(m.camp.daily) + '/day' : 'ad set budgets'}` : 'No sale campaign'}${m.limit ? `, limit ${money(m.limit)}${m.limit_src === 'known' ? ' (Nov 22 figure)' : ''}, ${money(m.headroom)} room` : ''}`;
    const act = g.to ? `*${W[g.call]} to ${money(g.to)}* <${link(b.act_id)}|Approve>` : `*${W[g.call] || 'Hold'}*`;
    return `*${b.name}*: ${rev}. ${bud}. ${act}${g.note ? ` (${g.note})` : ''}`;
  });
  const text = `${head}\n${top}\n${lines.join('\n')}\n<${link()}|Open the War Room>`;
  return { text, blocks: [
    { type: 'section', text: { type: 'mrkdwn', text: `*${head}*\n${top}` } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 2900) } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `Nothing changes until you tap Approve. <${link()}|Open the War Room>` }] },
  ] };
}

async function save(env, deps, rec) {
  await deps.putSetting(env, `standing:${rec.slot}`, JSON.stringify(rec));
  await deps.putSetting(env, 'standingLatest', rec.slot);
}
async function load(env, deps, slot) {
  const s = slot || await deps.getSetting(env, 'standingLatest');
  if (!s || !/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(s)) return null;
  const v = await deps.getSetting(env, `standing:${s}`);
  try { return v ? JSON.parse(v) : null; } catch { return null; }
}
async function sendDm(env, deps, rec) {
  const msg = standingMessage(rec);
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
  if ((await deps.getSetting(env, 'standingLatest')) === slot) return { skipped: 'already sent' };
  const rec = await buildStanding(env, deps, slot);
  await sendDm(env, deps, rec);
  await save(env, deps, rec);
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
    if (path === '/api/standing/run' && request.method === 'POST') {
      const rec = await buildStanding(env, deps, slotOf());
      if (body.send) await sendDm(env, deps, rec);
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
