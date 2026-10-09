/* IS SOMETHING WEIRD HAPPENING RIGHT NOW? (2026-10-09). Cole compares the Strategist with Viktor, which "can set
 * automations and checks". This is the live check those build on, for one brand or all of them:
 *
 *   today so far     Triple Whale live (the same summary call as /api/tw-day: revenue = total sales less tax, PAID
 *                    orders, new customers, blended ad spend) and Meta live by the hour (hourly_insights, refreshed
 *                    here: spend and impressions; Meta's purchase count is never used).
 *   normal by now    the brand's LAST 28 DAYS (tw_daily for the daily totals, hourly_insights for Meta) scaled to
 *                    this hour by the brand's own hourly curve (Triple Whale's hourly charts for the last 5 days,
 *                    fetched once a local day and kept in settings `cnshape:<brand>`; Meta's own hourly spend curve
 *                    when Triple Whale has none; a straight line as the last resort, and the answer says which).
 *   the market now   Pulse (our outage monitor: anything not operational now, incidents today), Breezeway's latest
 *                    day, and ON DEMAND ONLY a Claude Haiku web search of what advertisers said in the last few
 *                    hours (X, Reddit), about 3 cents, cached 10 minutes.
 *
 * Cost: every brand answer is cached 10 minutes (settings `checknow:<brand>`); a check costs about 3 subrequests a
 * brand when warm (one Triple Whale, one Meta, a few D1 reads), plus 5 Triple Whale calls once a day for the curve.
 * Read by GET /api/daycheck/now (the Day check "Right now" card), the Strategist's `check_now` tool and the
 * alerts (alerts.js, window "today so far").
 *
 * d = { getSetting, putSetting, listAccounts, localDate, localHourFrac, addDays, twSummary, twShift, metaAll,
 *       pickAction, PURCHASE_TYPES, xfetch, subCanAfford }. Nothing here posts or changes anything. */
import { pulseFor, breezewayFor } from './market.js';

export const NOW_TTL = 10 * 60e3;
const SHAPE_DAYS = 5;
const BASE_DAYS = 28;
const CENTRAL = 'America/Chicago';
const SKIP = /golf sock|harborline|galway|instyler|gum of gods|judy ?p|le ?pickle|popby/i;
const WEB_MODEL = 'claude-haiku-4-5-20251001';
const safe = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const r2 = n => n == null || !isFinite(n) ? null : Math.round(n * 100) / 100;
const pct = x => `${Math.round(x * 100)}%`;
const noDash = s => String(s || '').replace(/\s*[—–]\s*/g, ', ');
export const moneyOf = (n, cur = 'USD') => n == null ? 'n/a' : `${cur === 'USD' ? '$' : cur + ' '}${Math.round(n).toLocaleString('en-US')}`;

/* ---------------- the hourly curve ---------------- */
/** One metric's 24 hourly values from a single-day Triple Whale summary (charts keyed by hour). */
export function hourArr(raw, ids) {
  for (const id of ids) {
    const m = (raw?.metrics || []).find(x => (x.metricId ?? x.id) === id);
    if (!m || !Array.isArray(m.charts?.current)) continue;
    const a = Array(24).fill(0);
    for (const p of m.charts.current) { const x = +p.x; if (x >= 0 && x <= 23) a[x] += +p.y || 0; }
    return a;
  }
  return null;
}
/** Cumulative share of the day by the END of each hour, averaged over the days that had any. */
export function cumShare(days) {
  const ok = days.filter(a => a && a.reduce((s, v) => s + v, 0) > 0);
  if (!ok.length) return null;
  const out = Array(24).fill(0);
  for (const a of ok) { const t = a.reduce((s, v) => s + v, 0); let c = 0; a.forEach((v, h) => { c += v; out[h] += c / t; }); }
  return out.map(v => Math.round(v / ok.length * 10000) / 10000);
}
/** Share of a normal day done at a fractional local hour (9.5 = half past nine). */
export function shareAt(cum, x) {
  x = Math.max(0, Math.min(24, x));
  if (!cum) return x / 24;
  const h = Math.floor(x), prev = h > 0 ? cum[h - 1] : 0, cur = h < 24 ? cum[h] : 1;
  return prev + (x - h) * (cur - prev);
}

async function shapeFor(env, d, acct, today) {
  const key = `cnshape:${acct.act_id}`;
  const have = safe(await d.getSetting(env, key), null);
  if (have && have.date === today) return have;
  const out = { date: today, rev: null, ord: null, spend: null, days: 0 };
  if (!acct.tw_shop || !env.TW_API_KEY) return out;
  const shift = await d.twShift(env, acct.tw_shop).catch(() => 0);
  const rev = [], ord = [], spend = [];
  for (let i = 1; i <= SHAPE_DAYS; i++) {
    if (d.subCanAfford && !d.subCanAfford(12)) break;
    const day = d.addDays(today, -i), ask = d.addDays(day, shift);
    try {
      const { raw } = await d.twSummary(env, acct.tw_shop, ask, ask);
      const s = hourArr(raw, ['netSales', 'totalSales']), tax = hourArr(raw, ['totalNetTaxes']);
      if (s) rev.push(s.map((v, h) => Math.max(0, v - (tax ? tax[h] : 0))));
      const o = hourArr(raw, ['totalOrdersWithAmount', 'totalOrders', 'orders']); if (o) ord.push(o);
      const sp = hourArr(raw, ['blendedAds']); if (sp) spend.push(sp);
      out.days++;
    } catch { /* one missing day only thins the curve */ }
  }
  out.rev = cumShare(rev); out.ord = cumShare(ord); out.spend = cumShare(spend);
  if (out.days) await d.putSetting(env, key, JSON.stringify(out));
  return out;
}

/* ---------------- the 28-day normal from tw_daily (one grouped query) ---------------- */
const TW_METRICS = ['netSales', 'totalSales', 'totalNetTaxes', 'totalOrders', 'newCustomersOrders', 'blendedAds'];
export async function twNormal(env, d, acct, from, to) {
  const { results } = await env.DB.prepare(`SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 AND metric IN (${TW_METRICS.map((_, i) => `?${i + 4}`).join(',')})`)
    .bind(acct.act_id, from, to, ...TW_METRICS).all().catch(() => ({ results: [] }));
  const by = {};
  for (const r of results || []) (by[r.date] ??= {})[r.metric] = r.value;
  let n = 0; const t = { revenue: 0, orders: 0, new_customers: 0, spend: 0, nOrders: 0, nNew: 0, nSpend: 0 };
  for (const x of Object.values(by)) {
    const sales = x.netSales ?? x.totalSales; if (sales == null) continue;
    n++; t.revenue += sales - (x.totalNetTaxes || 0);
    if (x.totalOrders != null) { t.orders += x.totalOrders; t.nOrders++; }
    if (x.newCustomersOrders != null) { t.new_customers += x.newCustomersOrders; t.nNew++; }
    if (x.blendedAds != null) { t.spend += x.blendedAds; t.nSpend++; }
  }
  return { days: n, revenue: n ? t.revenue / n : null, orders: t.nOrders ? t.orders / t.nOrders : null, new_customers: t.nNew ? t.new_customers / t.nNew : null,
    spend: t.nSpend ? t.spend / t.nSpend : null, mer: t.spend > 0 && n ? t.revenue / t.spend : null, cpa: t.orders > 0 ? t.spend / t.orders : null };
}

/* ---------------- Meta by the hour ---------------- */
async function metaHours(env, d, acct, today, hourF) {
  const metaId = acct.meta_act;
  if (!metaId || !env.META_TOKEN || !d.metaAll) return null;
  const from = d.addDays(today, -BASE_DAYS), yday = d.addDays(today, -1);
  const have = await env.DB.prepare(`SELECT COUNT(DISTINCT date) AS n FROM hourly_insights WHERE act_id = ?1 AND date >= ?2 AND date <= ?3`).bind(metaId, from, yday).first().catch(() => null);
  const bfKey = `cnbf:${metaId}`;
  const backfill = (have?.n || 0) < 14 && (await d.getSetting(env, bfKey)) !== today;
  let rows = [];
  try {
    rows = await d.metaAll(env, `${metaId}/insights`, { level: 'account', time_increment: 1, breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
      time_range: { since: backfill ? from : today, until: today }, fields: 'spend,impressions,actions,action_values', limit: 500 }, backfill ? 4 : 2);
  } catch (e) { return { error: `Meta: ${e.message}` }; }
  if (backfill) await d.putSetting(env, bfKey, today);
  const hourOf = r => Math.min(23, Math.max(0, +String(r.hourly_stats_aggregated_by_advertiser_time_zone || '').slice(0, 2) || 0));
  const stmts = rows.map(r => env.DB.prepare(`INSERT INTO hourly_insights (act_id, date, hour, spend, impressions, purchases, revenue, synced_at) VALUES (?1,?2,?3,?4,?5,?6,?7,datetime('now'))
    ON CONFLICT(act_id, date, hour) DO UPDATE SET spend = excluded.spend, impressions = excluded.impressions, purchases = excluded.purchases, revenue = excluded.revenue, synced_at = excluded.synced_at`)
    .bind(metaId, r.date_start, hourOf(r), +r.spend || 0, +r.impressions || 0, d.pickAction(r.actions, d.PURCHASE_TYPES), d.pickAction(r.action_values, d.PURCHASE_TYPES)));
  for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100).map(x => x.__raw || x)).catch(() => {});
  const now = rows.filter(r => r.date_start === today);
  const spend = now.reduce((s, r) => s + (+r.spend || 0), 0), imps = now.reduce((s, r) => s + (+r.impressions || 0), 0);
  const { results } = await env.DB.prepare(`SELECT hour, SUM(spend) AS s, SUM(impressions) AS i, COUNT(DISTINCT date) AS n FROM hourly_insights WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 GROUP BY hour`)
    .bind(metaId, from, yday).all().catch(() => ({ results: [] }));
  const days = Math.max(0, ...(results || []).map(r => r.n || 0));
  if (days < 7) return { spend, impressions: imps, cpm: imps ? spend / imps * 1000 : null, days };
  const avg = Array(24).fill(0); let S = 0, I = 0;
  for (const r of results) { avg[r.hour] = (r.s || 0) / days; S += r.s || 0; I += r.i || 0; }
  const h = Math.floor(hourF);
  let byNow = 0; for (let i = 0; i < Math.min(h, 24); i++) byNow += avg[i];
  if (h < 24) byNow += (hourF - h) * avg[h];
  const tot = avg.reduce((s, v) => s + v, 0);
  const cum = tot > 0 ? (() => { let c = 0; return avg.map(v => (c += v) / tot); })() : null;
  return { spend, impressions: imps, cpm: imps ? spend / imps * 1000 : null, days, normal_spend: byNow, normal_day: tot, normal_cpm: I ? S / I * 1000 : null, cum };
}

/* ---------------- one brand ---------------- */
export async function brandNow(env, d, acct, { fresh = false } = {}) {
  const key = `checknow:${acct.act_id}`;
  if (!fresh) { const c = safe(await d.getSetting(env, key), null); if (c && Date.now() - Date.parse(c.at) < NOW_TTL) return { ...c.data, cached: true }; }
  const tz = acct.tz || CENTRAL, today = d.localDate(tz), hourF = d.localHourFrac(tz);
  const out = { act_id: acct.act_id, name: acct.name, currency: acct.currency || 'USD', tz, today, local_hour: r2(hourF), as_of: new Date().toISOString(),
    today_so_far: {}, normal_by_now: {}, normal_day: {}, vs: {}, signs: [], notes: [] };
  const base = await twNormal(env, d, acct, d.addDays(today, -BASE_DAYS), d.addDays(today, -1));
  const [shape, mh] = await Promise.all([shapeFor(env, d, acct, today), metaHours(env, d, acct, today, hourF)]);
  /* Triple Whale live: today so far. */
  let tw = null, todayHours = null;
  if (acct.tw_shop && env.TW_API_KEY) {
    try {
      const shift = await d.twShift(env, acct.tw_shop).catch(() => 0);
      const ask = d.addDays(today, shift);
      const { map, raw } = await d.twSummary(env, acct.tw_shop, ask, ask);
      tw = map; todayHours = hourArr(raw, ['totalOrdersWithAmount', 'totalOrders', 'orders']);
    } catch (e) { out.notes.push(`Triple Whale did not answer: ${e.message}`); }
  } else out.notes.push('No Triple Whale shop set, so store money is not live here.');
  const revCum = shape.rev || mh?.cum || null, ordCum = shape.ord || revCum, spendCum = shape.spend || mh?.cum || null;
  out.curve = shape.rev ? `Triple Whale's hourly curve, last ${shape.days} days` : mh?.cum ? 'Meta\'s hourly spend curve (Triple Whale had none)' : 'a straight line through the day (no hourly curve yet)';
  const sh = { rev: shareAt(revCum, hourF), ord: shareAt(ordCum, hourF), spend: shareAt(spendCum, hourF) };
  out.share_of_day = r2(sh.rev);
  if (tw) {
    const sales = tw.netSales ?? tw.totalSales;
    const t = out.today_so_far;
    t.revenue = sales != null ? sales - (tw.totalNetTaxes || 0) : null;
    const rawOrders = tw.totalOrders ?? null, paid = tw.totalOrdersWithAmount ?? rawOrders;
    t.orders = paid;
    t.new_customers = tw.newCustomersOrders != null ? Math.max(0, tw.newCustomersOrders - Math.max(0, (rawOrders ?? 0) - (paid ?? 0))) : null;
    t.spend = tw.blendedAds ?? null;
    t.mer = t.spend > 0 && t.revenue != null ? t.revenue / t.spend : null;
    t.cpa = t.orders > 0 && t.spend != null ? t.spend / t.orders : null;
  }
  const n = out.normal_by_now, nd = out.normal_day;
  if (base.days >= 7) {
    nd.revenue = base.revenue; nd.orders = base.orders; nd.new_customers = base.new_customers; nd.spend = base.spend; nd.mer = base.mer; nd.cpa = base.cpa;
    n.revenue = base.revenue != null ? base.revenue * sh.rev : null;
    n.orders = base.orders != null ? base.orders * sh.ord : null;
    n.new_customers = base.new_customers != null ? base.new_customers * sh.ord : null;
    n.spend = base.spend != null ? base.spend * sh.spend : null;
    n.mer = base.mer; n.cpa = base.cpa;
  } else out.notes.push(`Only ${base.days} days of Triple Whale history, so there is no normal day to compare with yet.`);
  out.base_days = base.days;
  if (mh && !mh.error) {
    out.today_so_far.meta_spend = mh.spend; out.today_so_far.meta_cpm = mh.cpm;
    if (mh.normal_spend != null) { n.meta_spend = mh.normal_spend; nd.meta_spend = mh.normal_day; n.meta_cpm = mh.normal_cpm; }
    out.meta_days = mh.days;
  } else if (mh?.error) out.notes.push(mh.error);
  for (const k of Object.keys(out.today_so_far)) {
    const a = out.today_so_far[k], b = n[k];
    if (a != null && b != null && b > 0) out.vs[k] = r2(a / b);
  }
  /* Orders in the last 3 finished hours against a normal day's same hours. */
  const H = Math.floor(hourF);
  if (todayHours && H >= 3 && base.orders != null) {
    const got = todayHours.slice(H - 3, H).reduce((s, v) => s + v, 0);
    const want = base.orders * (shareAt(ordCum, H) - shareAt(ordCum, H - 3));
    out.last3h = { orders: got, normal: r2(want) };
  }
  out.signs = signsOf(out);
  for (const k of ['today_so_far', 'normal_by_now', 'normal_day']) for (const [m, v] of Object.entries(out[k])) out[k][m] = r2(v);
  await d.putSetting(env, key, JSON.stringify({ at: out.as_of, data: out })).catch(() => {});
  return out;
}

/** The plain-English signs for one brand, worst first. Thresholds are stated in each line. */
export function signsOf(b) {
  const s = [], t = b.today_so_far, n = b.normal_by_now, v = b.vs, cur = b.currency;
  const early = (b.share_of_day ?? 0) < 0.08;
  if (v.revenue != null && !early && (n.revenue || 0) >= 100) {
    if (v.revenue < 0.5) s.push({ level: 'high', metric: 'revenue', text: `Revenue is at ${pct(v.revenue)} of a normal day by this hour (${moneyOf(t.revenue, cur)} so far, about ${moneyOf(n.revenue, cur)} is normal by now).` });
    else if (v.revenue < 0.75) s.push({ level: 'med', metric: 'revenue', text: `Revenue is behind: ${pct(v.revenue)} of a normal day by this hour (${moneyOf(t.revenue, cur)} vs about ${moneyOf(n.revenue, cur)}).` });
    else if (v.revenue > 1.6) s.push({ level: 'good', metric: 'revenue', text: `Revenue is running well ahead: ${pct(v.revenue)} of a normal day by this hour.` });
  }
  if (b.last3h && b.last3h.normal >= 3 && b.last3h.orders === 0) s.push({ level: 'high', metric: 'orders', text: `No orders in the last 3 hours, when a normal day has about ${Math.round(b.last3h.normal)} in those hours. Check the checkout and the site.` });
  if (v.meta_spend != null && !early && (n.meta_spend || 0) >= 50) {
    if (v.meta_spend < 0.5) s.push({ level: 'high', metric: 'meta_spend', text: `Meta has spent ${pct(v.meta_spend)} of a normal day by this hour (${moneyOf(t.meta_spend, cur)} vs about ${moneyOf(n.meta_spend, cur)}). Delivery may be stuck: billing, a paused campaign, or Meta itself.` });
    else if (v.meta_spend > 1.6) s.push({ level: 'med', metric: 'meta_spend', text: `Meta is spending faster than normal: ${pct(v.meta_spend)} of a normal day by this hour.` });
  }
  if (v.meta_cpm != null && t.meta_spend >= 30 && v.meta_cpm > 1.35) s.push({ level: 'med', metric: 'meta_cpm', text: `Meta's price per 1,000 views is up ${pct(v.meta_cpm - 1)} on the last 28 days (${moneyOf(t.meta_cpm, cur)} vs ${moneyOf(n.meta_cpm, cur)}).` });
  if (v.mer != null && !early && (t.spend || 0) >= 100 && v.mer < 0.6) s.push({ level: 'med', metric: 'mer', text: `MER so far is ${r2(t.mer)}x against a normal ${r2(n.mer)}x.` });
  const rank = { high: 0, med: 1, good: 2 };
  return s.sort((a, b2) => rank[a.level] - rank[b2.level]);
}

/* ---------------- the market right now ---------------- */
export async function marketNow(env, d, { fresh = false } = {}) {
  const key = 'checknow:market';
  if (!fresh) { const c = safe(await d.getSetting(env, key), null); if (c && Date.now() - Date.parse(c.at) < NOW_TTL) return c.data; }
  const today = d.localDate(CENTRAL), yday = d.addDays(today, -1);
  const [p, bw] = await Promise.all([pulseFor(env, today), breezewayFor(env, yday)]);
  let bwLatest = bw;
  if (!bw.entry && bw.latest && bw.latest !== yday) bwLatest = await breezewayFor(env, bw.latest);
  const data = {
    platforms_now: (p.now || []).map(x => ({ platform: x.platform, state: x.state, services: x.services })),
    incidents_today: (p.incidents || []).filter(x => x.ads_related !== false).map(x => ({ title: x.title, state: x.state, start: x.start, end: x.end })),
    meta_problem_now: (p.now || []).some(x => x.platform_id === 'meta') || (p.incidents || []).some(x => x.platform_id === 'meta' && x.ads_related && !x.end),
    breezeway: { date: bwLatest.entry?.date || bw.latest || null, status: bwLatest.status || null, note: 'Breezeway publishes a day at a time, so this is their latest finished day, a hint not a verdict.' },
    ...(p.error ? { pulse_error: p.error } : {}),
  };
  await d.putSetting(env, key, JSON.stringify({ at: new Date().toISOString(), data })).catch(() => {});
  return data;
}

/** What advertisers said online in the last few hours. Only when asked (Refresh in Locus, or the tool with web). */
export async function webNow(env, d, { fresh = false } = {}) {
  const key = 'checknow:web';
  if (!fresh) { const c = safe(await d.getSetting(env, key), null); if (c && Date.now() - Date.parse(c.at) < NOW_TTL) return { ...c.data, cached: true }; }
  if (!env.ANTHROPIC_API_KEY) return { status: 'error', error: 'ANTHROPIC_API_KEY is not set.' };
  const when = new Date().toLocaleString('en-US', { timeZone: CENTRAL, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const handles = String((await d.getSetting(env, 'marketHandles')) || '').split(/[,\s]+/).map(h => h.trim().replace(/^@?/, '@')).filter(h => h.length > 1).slice(0, 12);
  const system = `You check whether online advertisers are reporting problems with Meta Ads or Google Ads RIGHT NOW, in the last few hours.
Search X/Twitter ("Meta ads down", "CPMs spiking today", "Ads Manager not loading", "no conversions today"), Reddit (r/FacebookAds, r/PPC, r/googleads) and ad industry news. Count only posts from the last few hours or clearly about today. Several independent reports = issues. One complaint or nothing = normal.
Reply with JSON only: {"meta": "normal" | "issues", "google": "normal" | "issues", "summary": "one plain sentence", "sources": [{"title": "...", "url": "..."}]}
At most 4 sources, only pages you found. Plain words, no em dashes.`;
  const user = `It is ${when} US Central time. Are advertisers reporting Meta Ads or Google Ads problems in the last few hours?${handles.length ? ` Look first at what these advertisers posted on X today: ${handles.join(', ')}.` : ''}`;
  try {
    const res = await d.xfetch('https://api.anthropic.com/v1/messages', { method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: WEB_MODEL, max_tokens: 1500, system, messages: [{ role: 'user', content: user }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error?.message || `Claude API HTTP ${res.status}`);
    const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const a = text.indexOf('{'), z = text.lastIndexOf('}');
    const p = a >= 0 ? safe(text.slice(a, z + 1), null) : null;
    if (!p) throw new Error('The answer was not readable JSON');
    const u = j.usage || {};
    const cost = Math.round((((u.input_tokens || 0) + (u.cache_read_input_tokens || 0)) / 1e6 + (u.output_tokens || 0) * 5 / 1e6 + (u.server_tool_use?.web_search_requests || 0) * 0.01) * 10000) / 10000;
    const data = { status: 'ok', meta: p.meta === 'issues' ? 'issues' : 'normal', google: p.google === 'issues' ? 'issues' : 'normal', summary: noDash(String(p.summary || '').slice(0, 300)),
      sources: (Array.isArray(p.sources) ? p.sources : []).filter(s => /^https?:\/\//.test(s?.url || '')).slice(0, 4).map(s => ({ title: noDash(String(s.title || s.url).slice(0, 140)), url: s.url })), cost, asked_at: new Date().toISOString() };
    await d.putSetting(env, key, JSON.stringify({ at: data.asked_at, data })).catch(() => {});
    return data;
  } catch (e) { return { status: 'error', error: e.message }; }
}

/* ---------------- the whole check ---------------- */
export async function checkNow(env, d, { act = 'all', web = false, fresh = false } = {}) {
  const accts = (await d.listAccounts(env, true)).filter(a => act === 'all' ? !SKIP.test(a.name || '') : a.act_id === act);
  if (act !== 'all' && !accts.length) return { error: 'No active brand with that id.' };
  const brands = [];
  for (let i = 0; i < accts.length; i += 3) {
    const chunk = accts.slice(i, i + 3);
    brands.push(...await Promise.all(chunk.map(a => {
      if (d.subCanAfford && !d.subCanAfford(30)) return { act_id: a.act_id, name: a.name, deferred: true, signs: [], notes: ['Not checked: this run is out of its request budget. Try again in a minute.'] };
      return brandNow(env, d, a, { fresh }).catch(e => ({ act_id: a.act_id, name: a.name, error: e.message, signs: [], notes: [] }));
    })));
  }
  const market = await marketNow(env, d, { fresh }).catch(e => ({ error: e.message }));
  const chatter = web ? await webNow(env, d, { fresh }) : null;
  const flagged = brands.filter(b => (b.signs || []).some(s => s.level === 'high' || s.level === 'med'));
  const marketBad = market?.meta_problem_now || (market?.platforms_now || []).length > 0 || chatter?.meta === 'issues' || chatter?.google === 'issues';
  const headline = flagged.length
    ? `Something looks off on ${flagged.map(b => b.name).join(', ')}: ${flagged.map(b => b.signs.find(s => s.level !== 'good').text).join(' ')}`.slice(0, 600)
    : marketBad ? 'Our brands look normal for this hour, but the market shows a problem (see the market below).'
    : `Nothing unusual right now across ${brands.length} brand${brands.length === 1 ? '' : 's'}, for this hour of the day.`;
  return { as_of: new Date().toISOString(), scope: act, headline, weird: flagged.length > 0 || !!marketBad, brands, market, chatter,
    how: 'Today so far against the brand\'s own last 28 days, scaled to this hour by its hourly curve. Store money is Triple Whale (revenue = total sales less tax, paid orders); Meta numbers are spend and price per 1,000 views only. Cached 10 minutes.' };
}
