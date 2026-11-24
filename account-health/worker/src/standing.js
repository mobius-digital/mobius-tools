/* WHERE WE STAND (2026-11-22): the Black Friday check-in every 3 hours while any brand's sale is live (Nov 23 to Dec 4).
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
import { adNumbers, metaActsOf, sumAds, withCovers } from './buyerai.js';
import { buildBuyerList } from './buyerlist.js';
import { standingCard, clientCard } from './standingdm.js';
import { boardSvg, brandSvg, toPng } from './standingimg.js';

const PROFIT_ORIGIN = 'https://mobius-profit.mobius-digital.workers.dev';
const LOCUS = 'https://locus.go-mobius-digital.com/profit/';
/* The days the 3-hour DM may run: the earliest brand sale start to the latest end (Grunk's BOGO Mon Nov 23 to Dartee's
 * Dec 4). It only sends once at least one brand's own sale is live; each brand counts from its own start. */
export const STAND_DAYS = { from: '2026-11-23', to: '2026-12-04' };
/* Central hours. 9am to 9pm every 3 hours, and 11pm to close the day (a midnight read would be an empty new day). */
/* Every 6 hours since Cole 2026-11-24 ("can Meta even optimize after every 3 hours?"): 9am, 3pm, 9pm Central. */
export const STAND_HOURS = [9, 15, 21];
const KNOWN_LIMITS = { brand_lucky_golf: 6637, brand_dartee_golf: 13806, brand_bonk_golf: 5000, brand_grunk_dolfer: 2583, brand_yak_sports: 841, brand_vetripaws: 3428 };
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
  const spent = await spendToday(env, md, act).catch(() => null);
  const camp = pickSaleCamp(ml, today, spent || {}), on = budgetsOn(ml);
  let limit = null, limitErr = null, src = 'meta';
  for (const m of await metaActs(env, act)) {
    const a = await gget(md, env, m.act, { fields: 'adtrust_dsl' }).catch(e => { limitErr = e.message; return null; });
    const v = a && +a.adtrust_dsl;
    if (v > 0) limit = (limit || 0) + v;   // -1 = no limit
  }
  /* Meta would not say: the limits Cole listed on 2026-11-22 (raise requests pending), labelled as such. */
  if (limit == null && KNOWN_LIMITS[act]) { limit = KNOWN_LIMITS[act]; src = 'known'; }
  return { camp: camp ? { id: camp.id, name: camp.name, daily: camp.daily || null, spent: spent ? (spent[camp.id] || 0) : null } : null, on, limit, limit_src: limit ? src : null, limit_error: limitErr, headroom: limit ? limit - on : null };
}

/** Build one check-in (reads only). */
export async function buildStanding(env, deps, slot = slotOf()) {
  const md = { xfetch: deps.xfetch, listAccounts: deps.listAccounts, getSetting: deps.getSetting, putSetting: deps.putSetting };
  const tw = await readProfit(env, deps, '/api/season/standing');
  const brands = [];
  for (const b of tw.brands || []) {
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
export function nextLabel(slot) {
  const [d, h] = slot.split('T'), hr = +h, i = STAND_HOURS.findIndex(x => x > hr);
  const fmt = x => x === 12 ? '12pm' : x < 12 ? `${x}am` : `${x - 12}pm`;
  if (i >= 0) return fmt(STAND_HOURS[i]);
  const nd = new Date(d + 'T12:00:00Z'); nd.setUTCDate(nd.getUTCDate() + 1);
  const ymd = nd.toISOString().slice(0, 10);
  if (ymd > STAND_DAYS.to) return null;
  return `${fmt(STAND_HOURS[0])} ${nd.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}`;
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
  /* Style d (Cole's pick, 2026-11-22): draw the scoreboard, upload it to Slack, show it by file id. If the picture
     fails the DM still goes, with a note where the picture would be. */
  if (st === 'd' && !img) {
    try { const up = await slackPng(env, deps, await toPng(boardSvg(rec), deps.xfetch), `where-we-stand-${rec.slot}.png`); if (up.id) img = up.id; else rec.img_error = up.error; }
    catch (e) { rec.img_error = e.message; }
  }
  const msg = st === 'list' ? standingMessage(rec) : standingCard(rec, prev, st, linkOf(rec), { img });
  const r = await postRetry(env, deps, msg, img);
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
  const msg = act ? clientCard(rec, act, style, prev, { img }) : standingCard(rec, prev, style, linkOf(rec), { img });
  if (label) { msg.blocks = [{ type: 'section', text: { type: 'mrkdwn', text: `*${label}*` } }, ...(msg.blocks || [])]; msg.text = `${label}: ${msg.text}`; }
  /* Slack can take a moment to process a fresh upload before a block may show it: retry a few times. */
  const r = await postRetry(env, deps, msg, img);
  return { ok: !!r.ok, ts: r.ts, error: r.error, img, imgErr, slot: rec.slot };
}

/** The hourly cron's step: in the window, on a 3-hour slot, once per slot. */
export async function standingTick(env, deps, now = new Date()) {
  const c = central(now);
  if (c.date < STAND_DAYS.from || c.date > STAND_DAYS.to) return { skipped: 'outside Nov 23 to Dec 4' };
  if (!STAND_HOURS.includes(c.hour)) return { skipped: 'not a check-in hour' };
  const slot = slotOf(now);
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
  for (const b of rec.brands) {
    if (b.no_sales || (b.suggest && b.suggest.to)) continue;
    await offerClientUpdate(env, deps, { act: b.act_id, rec }).catch(() => {});
  }
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
  await offerClientUpdate(env, deps, { act }).catch(() => {});
  return { ok: true, ...rec.approved[act] };
}

/* SEND TO CLIENT (Cole 2026-11-24: "we want to be able to send stuff whenever we make updates"). After a campaign budget
   change made through Locus (a War Room Approve, the Meta tab, Claude), Cole gets a DM with the client message already
   written in the ladder's words and two buttons. Nothing reaches a client without his tap; Send posts it AS COLE in the
   brand's client channel (brief_channel, never the internal one). No client channel = no DM. */
const OWNER_SLACK = 'U06C37MDWD7';
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
async function didSince(env, deps, act) {
  const last = await deps.getSetting(env, `wsLastSent:${act}`);
  const since = last || `${central().date}T06:00:00Z`;   // never sent: since midnight Central
  const acts = (await metaActs(env, act)).map(m => m.act);
  if (!acts.length) return [];
  const rows = ((await env.DB.prepare(`SELECT summary, category, object_type, object_name, client_why, event_time FROM activities WHERE act_id IN (${acts.map((_, i) => `?${i + 2}`).join(', ')})
    AND client_why IS NOT NULL AND client_why != '' AND event_time >= ?1 ORDER BY event_time`).bind(since, ...acts).all().catch(() => ({ results: [] }))).results) || [];
  return [...new Set(rows.map(changeLine).filter(Boolean))].slice(0, 10);
}
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
export async function clientUpdateMsg(env, deps, rec, act, style = 'plain', name = null, { images = true, layout = 'table' } = {}) {
  const b = (rec.brands || []).find(x => x.act_id === act);
  if (!b || b.no_sales) return null;
  const did = await didSince(env, deps, act), line = b.hold ?? (b.kpi ? b.kpi * 0.8 : null), t = longDay(rec.slot), m = moment(rec.slot);
  const H = s => ({ type: 'header', text: { type: 'plain_text', text: s } });
  const md = s => ({ type: 'section', text: { type: 'mrkdwn', text: s } });
  const ctx = s => ({ type: 'context', elements: [{ type: 'mrkdwn', text: s }] });
  const bar = (label, p) => {
    if (!p || p.sales == null) return null;
    const tr = tierOf(p.mer, b.kpi, line);
    return { color: tr.color, blocks: [H(label), md(`*Sales:*  ${usd(p.sales)}\n*Ad spend:*  ${usd(p.spend)}\n*MER:*  ${nx(p.mer)}`)] };
  };
  const T1 = layout === 'spaced' ? (s => ({ type: 'markdown', text: `# ${s}` })) : H;   // Cole 2026-11-24: the markdown '#' heading draws biggest
  const blocks = [T1(`${name || b.name} · ${m}`), ctx(`${t.day}  ·  ${t.hour} CT   |   Goal: *${nx(b.kpi)} MER*`), { type: 'divider' }];
  const wins = (m === 'End of Day' ? [['Today', b.today], ['This week', b.week]] : [['Last 6 hours', b.last6], ['Today', b.today], ['This week', b.week]]).filter(([, p]) => p && p.sales != null);
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
    const row1 = [get('Last 6 hours'), get('Today')].filter(Boolean), wk = get('This week');
    if (row1.length) blocks.push({ type: 'section', fields: row1.map(([l, p]) => f(l, p)) });
    if (wk) blocks.push({ type: 'divider' }, { type: 'section', fields: [f(wk[0], wk[1])] });
    attachments = [];
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
  const upd = [T1('Updates'), md((did.length ? did : ['No changes since the last update']).map(d => `•  ${d}`).join('\n')),
    ctx(rec.next ? `Next update at ${rec.next} CT` : 'Next update tomorrow at 9am CT')];
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
  if (at === 'morning' || at === 'evening') rec = { ...rec, slot: `${String(rec.slot).split('T')[0]}T${at === 'morning' ? '09' : '21'}`, next: at === 'morning' ? '3pm' : null };
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
  const pick = ['clean', 'blue', 'bars', 'wc', 'spaced', 'lines'].includes(style) ? style : (['clean', 'blue', 'bars', 'spaced', 'lines'].includes(await deps.getSetting(env, 'clientUpdateLayout')) ? await deps.getSetting(env, 'clientUpdateLayout') : 'spaced');
  const tries = [[pick, true], [pick, false], ['bars', false]];
  let r = { ok: false, error: 'nothing tried' }, used = null;
  for (const [layout, images] of tries) {
    const m = await clientUpdateMsg(env, deps, rec, act, st, b.name, { layout, images });
    if (!m) return { ok: false, error: 'No sales numbers for this brand.' };
    const tail = forCole ? [] : [btns];
    const msg = m.attachments && m.attachments.length ? { text: m.text, blocks: [top, ...m.blocks], attachments: [...m.attachments, ...(tail.length ? [{ blocks: tail }] : [])] }
      : { text: m.text, blocks: [top, ...m.blocks, ...tail] };
    r = await dmPerson(env, deps, env.OWNER_EMAIL || 'cole@go-mobius-digital.com', msg);
    if (r.ok) { used = layout + (images ? '' : ' (no pictures)'); await deps.putSetting(env, `wsDraft:${id}`, JSON.stringify({ v: 3, act, ch: b.brief_channel, msg: m, name: b.name, at: new Date().toISOString() })); break; }
    if (!/invalid_blocks|invalid_attachments|image|table/i.test(String(r.error || ''))) break;
    r.tried = `${r.tried || ''}${layout}: ${String(r.error).slice(0, 120)}; `;
  }
  r.layout = used;
  return r;
}
/** The two buttons on that DM. Cole only. Send posts the same layout as Cole in the client channel. */
export async function handleClientUpdateButton(env, ctx, payload, deps, { ACK, xfetch }) {
  const a = (payload.actions || []).find(x => /^ws_/.test(x.action_id || ''));
  const reply = t => payload.response_url && xfetch(payload.response_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replace_original: true, text: t }) }).catch(() => {});
  ctx.waitUntil((async () => {
    if (payload.user?.id !== OWNER_SLACK) return reply('Only Cole can send client updates.');
    const raw = await deps.getSetting(env, `wsDraft:${a.value}`);
    const dr = raw ? JSON.parse(raw) : null;
    if (!dr) return reply('That update is gone.');
    if (dr.done) return reply(`Already handled: ${dr.done}.`);
    if (a.action_id === 'ws_skip') { dr.done = 'not sent'; await deps.putSetting(env, `wsDraft:${a.value}`, JSON.stringify(dr)); return reply(`Not sent to ${dr.name}.`); }
    if (dr.v !== 3 || !dr.msg) return reply('That is an older draft. Nothing was sent.');
    if (!env.SLACK_USER_TOKEN) return reply('No Slack user token on Locus, so it cannot post as you.');
    const res = await xfetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${env.SLACK_USER_TOKEN}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel: dr.ch, ...dr.msg, unfurl_links: false }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }));
    if (!res.ok) return reply(`Slack refused it (${res.error}). Nothing was sent.`);
    const now = new Date().toISOString();
    dr.done = `sent ${now}`; await deps.putSetting(env, `wsDraft:${a.value}`, JSON.stringify(dr));
    await deps.putSetting(env, `wsLastSent:${dr.act}`, now);
    return reply(`✓ Sent to ${dr.name}.`);
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
      const st = ['a', 'b', 'c', 'd'].includes(body.style) ? body.style : 'd', act = body.act ? String(body.act) : null;
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
