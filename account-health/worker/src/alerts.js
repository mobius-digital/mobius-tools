/* ALERTS, LIVE CHECKS, SCHEDULED TASKS AND THE LEDGER DOOR (2026-10-09). Cole compares the Strategist with Viktor,
 * which "can set automations and checks". His example: "if we have less than 50% of revenue by 12pm Central compared
 * to the average day, send a Slack notification alerting me".
 *
 * A row in `p_alert` is one rule: a brand ('all' = each active brand), a metric, a window (today so far | yesterday |
 * last 7 days), a baseline (the brand's normal day at this hour | the goal | a fixed number), below or above a
 * threshold (a percent of the baseline, or the number itself for a fixed one), an hour in Central to check at (or
 * none: every hour from 9am), where to post (an internal channel or a DM) and who to tag. The hourly cron
 * (`alertTick`) checks each due rule ONCE per Central day at or after its hour (up to 2 hours late, so a missed
 * tick recovers), fires at most once per alert per Central day, and the message names the number, the normal and
 * links Locus. Today-so-far rules read checknow.js (cached 10 minutes, so ten rules on one brand cost one check);
 * yesterday and last-7-days rules read tw_daily / daily_insights / tw_ad_attr in one grouped query each.
 *
 * Metrics (Triple Whale for anything attributed, always): revenue (total sales less tax), orders (paid), new
 * customers, ad spend (blended), MER, CPA (ad spend / paid orders), ROAS (Meta on Triple Whale last platform click,
 * finished days only: TW credits land overnight), Meta CPM (Meta's own delivery number).
 *
 * Routes (admin; per-brand access as askschedule.js): GET/PUT/DELETE /api/alerts, POST /api/alerts/pause {id, active},
 * POST /api/alerts/test {id | rule, post}. GET /api/daycheck/now?act=&web=1&fresh=1 is checknow.js.
 *
 * The Strategist (registered in strategist.js with one import and two spreads): tools check_now, list_alerts,
 * ask_ledger; actions create_alert, pause_alert, delete_alert, schedule_task. Every action is an Apply card.
 * Locus: Reports > Dashboards > Alerts (profit/askextra.js), the Day check "Right now" card (profit/desk.js). */
import { checkNow, brandNow, moneyOf } from './checknow.js';
import { allowedChannels } from './askschedule.js';
import { brandsFor } from './brandguard.js';
import { resolveBrandId, metaOf } from './brands.js';
import { routeAction } from '../../../ask/engine.js';

export const ALERT_SQL = `CREATE TABLE IF NOT EXISTS p_alert (
  id              TEXT PRIMARY KEY,
  act             TEXT NOT NULL DEFAULT 'all',
  metric          TEXT NOT NULL,
  comparison      TEXT NOT NULL DEFAULT 'below',
  threshold       REAL NOT NULL,
  at_hour_central INTEGER,
  "window"        TEXT NOT NULL DEFAULT 'today',
  baseline        TEXT NOT NULL DEFAULT 'normal',
  channel         TEXT,
  mention         TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  active          INTEGER NOT NULL DEFAULT 1,
  last_fired      TEXT,
  last_value      REAL,
  last_checked    TEXT,
  last_status     TEXT
)`;
export async function ensureAlerts(env) { await env.DB.prepare(ALERT_SQL).run().catch(() => {}); }

const OWNER = 'cole@go-mobius-digital.com';
const COLE_SLACK = 'U06C37MDWD7';
const LOCUS = 'https://tools.go-mobius-digital.com/profit/';
const LEDGER_URL = 'https://mobius-ledger.mobius-digital.workers.dev/api/ask';
const SKIP = /golf sock|harborline|galway|instyler|gum of gods|judy ?p|le ?pickle|popby/i;
const hex = n => Array.from(crypto.getRandomValues(new Uint8Array(n))).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, n);
const clip = (s, n) => String(s ?? '').slice(0, n);
const safe = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const hourWord = h => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;
const noDash = s => String(s || '').replace(/\s*[—–]\s*/g, ', ');

export const METRICS = {
  revenue: { label: 'revenue', kind: 'sum', fmt: 'money' },
  orders: { label: 'orders', kind: 'sum', fmt: 'count' },
  new_customers: { label: 'new customers', kind: 'sum', fmt: 'count' },
  spend: { label: 'ad spend', kind: 'sum', fmt: 'money' },
  mer: { label: 'MER', kind: 'ratio', fmt: 'x' },
  cpa: { label: 'CPA', kind: 'ratio', fmt: 'money', lower: true },
  roas: { label: 'Meta ROAS (Triple Whale)', kind: 'ratio', fmt: 'x', finished: true },
  meta_cpm: { label: 'Meta CPM', kind: 'ratio', fmt: 'money', lower: true },
};
export const WINDOWS = { today: 'today so far', yesterday: 'yesterday', last7: 'the last 7 days' };
const BASELINES = { normal: 'a normal day', goal: 'the goal', fixed: 'a fixed number' };
const fmtV = (m, v, cur = 'USD') => v == null ? 'n/a' : METRICS[m]?.fmt === 'money' ? (m === 'cpa' || m === 'meta_cpm' ? `${cur === 'USD' ? '$' : cur + ' '}${(+v).toFixed(2)}` : moneyOf(v, cur)) : METRICS[m]?.fmt === 'x' ? `${(+v).toFixed(2)}x` : String(Math.round(v));

/** A rule from loose input, or { error }. Shared by the route and the Strategist's card. */
export function cleanRule(b) {
  const metric = String(b.metric || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (!METRICS[metric]) return { error: `Metric must be one of: ${Object.keys(METRICS).join(', ')}.` };
  const win = String(b.window || 'today').toLowerCase();
  const window = win === 'last7' || /7/.test(win) ? 'last7' : /yester/.test(win) ? 'yesterday' : 'today';
  if (window === 'today' && METRICS[metric].finished) return { error: 'ROAS on Triple Whale attribution only exists for finished days (its credits land overnight). Use yesterday or the last 7 days, or watch MER today.' };
  const baseline = ['normal', 'goal', 'fixed'].includes(b.baseline) ? b.baseline : 'normal';
  const comparison = b.comparison === 'above' ? 'above' : 'below';
  const threshold = Number(b.threshold);
  if (!isFinite(threshold) || threshold < 0) return { error: 'The threshold must be a number (a percent of the normal day or the goal, or the number itself for a fixed line).' };
  if (baseline !== 'fixed' && (threshold <= 0 || threshold > 1000)) return { error: 'For a normal-day or goal rule, the threshold is a percent, like 50 for "half of normal".' };
  const h = b.at_hour_central;
  const at = h === null || h === undefined || h === '' ? null : Number.isInteger(+h) && +h >= 0 && +h <= 23 ? +h : NaN;
  if (Number.isNaN(at)) return { error: 'The hour is 0 to 23, Central.' };
  return { rule: { metric, window, baseline, comparison, threshold, at_hour_central: at } };
}

/** The rule in plain words. */
export function ruleText(r, brandName) {
  const m = METRICS[r.metric]?.label || r.metric, when = r.at_hour_central != null ? ` by ${hourWord(r.at_hour_central)} Central` : '';
  const who = brandName || (r.act === 'all' ? 'any brand' : 'the brand');
  const scope = r.window === 'today' ? `${m} today so far${when}` : `${m} ${WINDOWS[r.window]}`;
  const line = r.baseline === 'fixed' ? `${r.comparison === 'below' ? 'under' : 'over'} ${fmtV(r.metric, r.threshold)}`
    : `${r.comparison === 'below' ? 'under' : 'over'} ${+r.threshold}% of ${r.baseline === 'goal' ? 'the goal' : r.window === 'today' ? 'a normal day by that hour' : 'a normal stretch (the 28 days before)'}`;
  return `Tell us when ${who}'s ${scope} is ${line}.`;
}

/* ---------------- evaluating ---------------- */
async function periodData(env, d, acct, window) {
  const today = d.localDate(acct.tz || 'America/Chicago'), end = d.addDays(today, -1), len = window === 'last7' ? 7 : 1;
  const start = d.addDays(end, -(len - 1)), bStart = d.addDays(start, -28), bEnd = d.addDays(start, -1);
  const M = ['netSales', 'totalSales', 'totalNetTaxes', 'totalOrders', 'newCustomersOrders', 'blendedAds'];
  const { results } = await env.DB.prepare(`SELECT date, metric, value FROM tw_daily WHERE act_id = ?1 AND date >= ?2 AND date <= ?3 AND metric IN (${M.map((_, i) => `?${i + 4}`).join(',')})`)
    .bind(acct.act_id, bStart, end, ...M).all().catch(() => ({ results: [] }));
  const by = {};
  for (const r of results || []) (by[r.date] ??= {})[r.metric] = r.value;
  const { results: mr } = await env.DB.prepare(`SELECT date, SUM(spend) AS s, SUM(impressions) AS i FROM daily_insights WHERE act_id IN ${metaOf(1)} AND date >= ?2 AND date <= ?3 GROUP BY date`)
    .bind(acct.act_id, bStart, end).all().catch(() => ({ results: [] }));
  const meta = Object.fromEntries((mr || []).map(r => [r.date, r]));
  const tw = d.twMetaDaily ? await d.twMetaDaily(env, acct.act_id, bStart, end).catch(() => ({})) : {};
  const agg = (from, to) => {
    const o = { days: 0, revenue: 0, orders: 0, new_customers: 0, spend: 0, meta_spend: 0, imps: 0, attr: 0, attrDays: 0, metaDays: 0 };
    for (let x = from; x <= to; x = d.addDays(x, 1)) {
      const t = by[x], sales = t ? (t.netSales ?? t.totalSales) : null;
      if (sales != null) { o.days++; o.revenue += sales - (t.totalNetTaxes || 0); o.orders += t.totalOrders || 0; o.new_customers += t.newCustomersOrders || 0; o.spend += t.blendedAds ?? (meta[x]?.s || 0); }
      if (meta[x]) { o.metaDays++; o.meta_spend += meta[x].s || 0; o.imps += meta[x].i || 0; }
      if (tw[x]) { o.attrDays++; o.attr += tw[x].rev || 0; }
    }
    o.mer = o.spend > 0 ? o.revenue / o.spend : null;
    o.cpa = o.orders > 0 ? o.spend / o.orders : null;
    o.meta_cpm = o.imps > 0 ? o.meta_spend / o.imps * 1000 : null;
    o.roas = o.meta_spend > 0 && o.attrDays ? o.attr / o.meta_spend : null;
    return o;
  };
  return { cur: agg(start, end), base: agg(bStart, bEnd), len, start, end };
}

function goalFor(d, acct, metric, days, share) {
  const ym = d.localDate(acct.tz || 'America/Chicago').slice(0, 7);
  const g = d.goalsFor ? d.goalsFor(acct, ym) : null;
  const dim = d.daysInMonth ? d.daysInMonth(ym + '-01') : 30;
  if (metric === 'revenue' && g?.sales) return g.sales / dim * days * share;
  if (metric === 'spend' && g?.spend) return g.spend / dim * days * share;
  if (metric === 'mer' && g?.sales && g?.spend) return g.sales / g.spend;
  if (metric === 'cpa' && acct.target_cpa) return +acct.target_cpa;
  if (metric === 'roas' && acct.target_roas) return +acct.target_roas;
  return null;
}

/** One rule on one brand: { value, base, fire, text } or { wait } / { skip }. */
export async function evalBrand(env, d, row, acct, memo = new Map()) {
  const m = row.metric, cur = acct.currency || 'USD';
  let value = null, base = null, how = '';
  if (row.window === 'today') {
    let b = memo.get(acct.act_id);
    if (!b) { b = await brandNow(env, d, acct); memo.set(acct.act_id, b); }
    if (b.error) return { skip: b.error };
    value = b.today_so_far?.[m] ?? null;
    if (row.baseline === 'normal') { base = b.normal_by_now?.[m] ?? null; how = METRICS[m].kind === 'sum' ? 'a normal day by this hour (last 28 days)' : 'its last 28 days'; }
    else if (row.baseline === 'goal') { base = goalFor(d, acct, m, 1, METRICS[m].kind === 'sum' ? (b.share_of_day ?? 1) : 1); how = METRICS[m].kind === 'sum' ? 'the goal pro-rated to this hour' : 'the goal'; }
    if (value == null) return { skip: `No ${METRICS[m].label} today yet${b.notes?.length ? ': ' + b.notes[0] : ''}.` };
  } else {
    const p = await periodData(env, d, acct, row.window);
    if (m === 'meta_cpm' ? p.cur.metaDays < p.len : p.cur.days < p.len) return { wait: m === 'meta_cpm' ? 'Meta has not synced that day yet.' : 'Triple Whale has not synced that day yet.' };
    if (m === 'roas' && p.cur.attrDays < p.len) return { wait: 'Triple Whale has not credited those days yet.' };
    value = p.cur[m];
    if (row.baseline === 'normal') {
      const bd = m === 'meta_cpm' ? p.base.metaDays : m === 'roas' ? p.base.attrDays : p.base.days;
      if (bd < 14) return { skip: `Only ${bd} days of history before it, too few for a normal.` };
      base = METRICS[m].kind === 'sum' ? p.base[m] / bd * p.len : p.base[m];
      how = 'the 28 days before';
    } else if (row.baseline === 'goal') { base = goalFor(d, acct, m, p.len, 1); how = 'the goal'; }
    if (value == null) return { skip: `No ${METRICS[m].label} for ${WINDOWS[row.window]}.` };
  }
  let fire, ratio = null;
  if (row.baseline === 'fixed') fire = row.comparison === 'below' ? value < row.threshold : value > row.threshold;
  else {
    if (base == null || !(base > 0)) return { skip: row.baseline === 'goal' ? `${acct.name} has no goal for ${METRICS[m].label}. Set it on Home > Goals, or use a normal day or a fixed number.` : 'No normal to compare with yet.' };
    ratio = value / base;
    fire = row.comparison === 'below' ? ratio * 100 < row.threshold : ratio * 100 > row.threshold;
  }
  const label = METRICS[m].label, scope = row.window === 'today' ? `today so far${row.at_hour_central != null ? ` by ${hourWord(row.at_hour_central)} Central` : ''}` : WINDOWS[row.window];
  const text = row.baseline === 'fixed'
    ? `*${acct.name}: ${label} ${scope} is ${fmtV(m, value, cur)}, ${row.comparison === 'below' ? 'under' : 'over'} your line of ${fmtV(m, row.threshold, cur)}.*`
    : `*${acct.name}: ${label} ${scope} is at ${Math.round(ratio * 100)}% of ${row.baseline === 'goal' ? 'the goal' : 'normal'}.*\n${fmtV(m, value, cur)} against ${fmtV(m, base, cur)} for ${how}.`;
  return { value, base, ratio, fire, text: noDash(text) };
}

async function brandsOf(env, d, row) {
  const accts = await d.listAccounts(env, true);
  return row.act === 'all' ? accts.filter(a => !SKIP.test(a.name || '')) : accts.filter(a => a.act_id === row.act);
}

/** Evaluate a rule now on every brand it covers. */
export async function evalAlert(env, d, row, memo = new Map()) {
  const out = { fired: [], checked: 0, skipped: [], waiting: [] };
  for (const a of await brandsOf(env, d, row)) {
    if (d.subCanAfford && !d.subCanAfford(30)) { out.deferred = true; break; }
    const r = await evalBrand(env, d, row, a, memo).catch(e => ({ skip: e.message }));
    if (r.wait) { out.waiting.push(`${a.name}: ${r.wait}`); continue; }
    if (r.skip) { out.skipped.push(`${a.name}: ${r.skip}`); continue; }
    out.checked++;
    if (r.fire) out.fired.push({ act_id: a.act_id, name: a.name, ...r });
    out.last_value = r.value;
  }
  return out;
}

/** The Slack message for a rule that fired. */
export function alertBlocks(row, fired, { test = false, brandName } = {}) {
  const tag = row.mention && /^U[A-Z0-9]{6,}$/.test(row.mention) ? `<@${row.mention}> ` : '';
  const act = fired.length === 1 ? fired[0].act_id : row.act !== 'all' ? row.act : null;
  const url = `${LOCUS}?open=yesterday${act ? `&act=${encodeURIComponent(act)}` : ''}`;
  const head = `${tag}${test ? '_Test:_ ' : ''}${fired.map(f => f.text).join('\n\n')}`;
  return {
    text: noDash(`${test ? 'Test: ' : ''}${fired.map(f => f.text.replace(/\*/g, '').split('\n')[0]).join(' ')}`).slice(0, 300),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: head.slice(0, 2900) } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: noDash(`Your rule: ${ruleText(row, brandName)} It fires at most once a day. Change, pause or delete it in Locus: Reports > Dashboards > Alerts.`).slice(0, 2900) }] },
      { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Locus' }, url, action_id: 'noop_open' }] },
    ],
  };
}

async function postTo(env, d, channel, msg) {
  const r = await d.slackApi(env, 'chat.postMessage', { channel, text: msg.text, blocks: msg.blocks, unfurl_links: false, username: 'Strategist' });
  if (r && r.ok === false && /missing_scope|invalid_arg|not_allowed/.test(String(r.error || ''))) return d.slackApi(env, 'chat.postMessage', { channel, text: msg.text, blocks: msg.blocks, unfurl_links: false });
  return r;
}

/** Where a rule posts: its channel, else the brand's internal channel, else the Strategist's channel. */
async function channelOf(env, d, row) {
  if (row.channel) return row.channel;
  if (row.act !== 'all') { const a = (await d.listAccounts(env, false)).find(x => x.act_id === row.act); if (a?.slack_channel) return a.slack_channel; }
  const sc = String((await d.getSetting(env, 'strategistChannel')) || '').trim();
  return sc || null;
}

/** Is this rule due now (Central)? */
export function isDue(row, d) {
  const today = d.centralDate(), hour = d.centralHour();
  if (!row.active) return false;
  if (row.last_fired && d.centralDate(new Date(row.last_fired)) === today) return false;
  const checkedToday = row.last_checked && d.centralDate(new Date(row.last_checked)) === today;
  if (row.at_hour_central != null) return hour >= row.at_hour_central && hour <= row.at_hour_central + 2 && !checkedToday;
  if (row.window === 'today') return hour >= 9 && hour <= 21;
  return hour >= 8 && !checkedToday;
}

/** The hourly job. d needs centralHour, centralDate, listAccounts, getSetting, slackApi, subCanAfford + checknow's deps. */
export async function alertTick(env, d) {
  await ensureAlerts(env);
  const { results } = await env.DB.prepare(`SELECT * FROM p_alert WHERE active = 1 ORDER BY created_at`).all().catch(() => ({ results: [] }));
  const due = (results || []).filter(r => isDue(r, d));
  const out = { due: due.length, fired: [], errors: [] };
  const memo = new Map();
  const names = Object.fromEntries((await d.listAccounts(env, false)).map(a => [a.act_id, a.name]));
  for (const row of due) {
    if (d.subCanAfford && !d.subCanAfford(40)) { out.deferred = true; break; }
    const now = new Date().toISOString();
    try {
      const r = await evalAlert(env, d, row, memo);
      if (r.deferred && !r.checked) { out.deferred = true; break; }
      if (!r.checked && r.waiting.length) {   /* not synced yet: try again next tick, do not mark it checked */
        await env.DB.prepare(`UPDATE p_alert SET last_status = ?2 WHERE id = ?1`).bind(row.id, clip('waiting: ' + r.waiting[0], 300)).run().catch(() => {});
        continue;
      }
      let status = r.fired.length ? 'fired' : r.checked ? 'checked, all fine' : 'skipped: ' + (r.skipped[0] || 'nothing to check');
      if (r.fired.length) {
        const ch = await channelOf(env, d, row);
        if (!ch) status = 'fired, but there is no channel to post to';
        else {
          const p = await postTo(env, d, ch, alertBlocks(row, r.fired, { brandName: row.act === 'all' ? null : names[row.act] }));
          if (!p || p.ok === false) status = `fired, Slack said ${p?.error || 'nothing'}`;
          else { out.fired.push(row.id); await env.DB.prepare(`UPDATE p_alert SET last_fired = ?2 WHERE id = ?1`).bind(row.id, now).run(); }
        }
      }
      await env.DB.prepare(`UPDATE p_alert SET last_checked = ?2, last_status = ?3, last_value = ?4 WHERE id = ?1`).bind(row.id, now, clip(status, 300), r.last_value ?? null).run().catch(() => {});
    } catch (e) { out.errors.push(`${row.id}: ${e.message}`); }
  }
  return out;
}

/* ---------------- channels ---------------- */
/** Internal channels (askschedule.js) plus a DM to a team member (a U... id). */
async function channelOk(env, d, ch) {
  if (!ch) return true;
  if (/^U[A-Z0-9]{6,}$/.test(ch)) {
    const u = await d.slackApi(env, 'users.info', { user: ch }).catch(() => null);
    if (u?.ok && (u.user?.is_bot || u.user?.is_restricted || u.user?.is_ultra_restricted || u.user?.is_stranger || u.user?.deleted)) return false;
    return true;
  }
  return (await allowedChannels(env, d)).has(ch);
}
/** A channel the person named: an id, "#name", "dm" (the person themselves) or nothing (the brand's internal channel). */
export async function resolveChannel(env, d, input, { userId, email } = {}) {
  let ch = String(input || '').trim();
  if (!ch || /^(our|the)?\s*(internal|team|brand|usual)?\s*(channel)?$/i.test(ch)) return { channel: null };
  if (/^(dm|me|direct message|private|my dms?)$/i.test(ch)) {
    let id = userId || null;
    if (!id && email) { const u = await d.slackApi(env, 'users.lookupByEmail', { email }).catch(() => null); id = u?.ok ? u.user?.id : null; }
    if (!id && String(email || '').toLowerCase() === OWNER) id = COLE_SLACK;
    return id ? { channel: id, label: 'a direct message' } : { error: 'I could not find your Slack account to DM you. Name a channel instead.' };
  }
  if (/^[CGU][A-Z0-9]{6,}$/.test(ch)) return { channel: ch };
  const want = ch.replace(/^#/, '').toLowerCase();
  const r = await d.slackApi(env, 'conversations.list', { limit: 1000, exclude_archived: true, types: 'public_channel,private_channel' }).catch(() => null);
  const hit = (r?.channels || []).find(c => String(c.name).toLowerCase() === want);
  return hit ? { channel: hit.id, label: `#${hit.name}` } : { error: `No Slack channel called #${want} that the bot can see.` };
}

/* ---------------- routes ---------------- */
export async function handleAlerts(request, env, path, json, d) {
  if (path === '/api/daycheck/now' && request.method === 'GET') {
    if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
    const url = new URL(request.url);
    const raw = url.searchParams.get('act') || 'all';
    const act = raw === 'all' ? 'all' : await resolveBrandId(env, raw);
    const only = await brandsFor(env, await d.sessionEmail(env, request).catch(() => null)).catch(() => null);
    if (only && act === 'all') {
      const r = await checkNow(env, d, { act: 'all', web: url.searchParams.get('web') === '1', fresh: url.searchParams.get('fresh') === '1' });
      return json({ ...r, brands: (r.brands || []).filter(b => only.has(b.act_id)) });
    }
    return json(await checkNow(env, d, { act, web: url.searchParams.get('web') === '1', fresh: url.searchParams.get('fresh') === '1' }));
  }
  if (!path.startsWith('/api/alerts')) return null;
  if (!(await d.isAdmin(request, env))) return json({ error: 'unauthorized' }, 401);
  await ensureAlerts(env);
  const url = new URL(request.url);
  const email = await d.sessionEmail(env, request).catch(() => null);
  const only = await brandsFor(env, email).catch(() => null);
  const mine = r => !only || (r.act !== 'all' && only.has(r.act));
  const accts = await d.listAccounts(env, false), nm = Object.fromEntries(accts.map(a => [a.act_id, a.name]));
  const view = async (r, ch) => ({ ...r, active: !!r.active, brand: r.act === 'all' ? 'All brands' : nm[r.act] || r.act, rule: ruleText(r, r.act === 'all' ? null : nm[r.act]),
    channel_name: r.channel ? (ch.get(r.channel) || (/^U/.test(r.channel) ? 'a direct message' : r.channel)) : 'the brand\'s internal channel' });
  if (path === '/api/alerts' && request.method === 'GET') {
    const { results } = await env.DB.prepare(`SELECT * FROM p_alert ORDER BY created_at DESC`).all();
    const ch = await allowedChannels(env, d);
    return json({ alerts: await Promise.all((results || []).filter(mine).map(r => view(r, ch))), channels: [...ch].map(([id, name]) => ({ id, name })),
      metrics: Object.entries(METRICS).map(([id, m]) => ({ id, label: m.label, finished_only: !!m.finished })), windows: WINDOWS, baselines: BASELINES });
  }
  const b = request.method === 'GET' || request.method === 'DELETE' ? {} : await request.json().catch(() => ({}));
  const getRow = id => env.DB.prepare(`SELECT * FROM p_alert WHERE id = ?1`).bind(String(id || '')).first();
  if (path === '/api/alerts' && request.method === 'PUT') {
    const c = cleanRule(b); if (c.error) return json({ error: c.error }, 400);
    const act = !b.act || b.act === 'all' ? 'all' : await resolveBrandId(env, String(b.act).slice(0, 64));
    if (only && act === 'all') return json({ error: 'You can set alerts on your own brands only. Pick one.' }, 403);
    if (act !== 'all' && !accts.some(a => a.act_id === act)) return json({ error: 'No brand with that id.' }, 400);
    const channel = String(b.channel || '').trim() || null;
    if (!(await channelOk(env, d, channel))) return json({ error: 'Alerts go to an internal channel or a teammate\'s DM, never a client channel.' }, 400);
    const mention = /^U[A-Z0-9]{6,}$/.test(String(b.mention || '')) ? b.mention : null;
    let id = /^al_[0-9a-f]{10}$/.test(String(b.id || '')) ? b.id : null;
    if (id) { const have = await getRow(id); if (!have || !mine(have)) id = null; }
    const R = c.rule;
    if (id) await env.DB.prepare(`UPDATE p_alert SET act = ?2, metric = ?3, comparison = ?4, threshold = ?5, at_hour_central = ?6, "window" = ?7, baseline = ?8, channel = ?9, mention = ?10, active = ?11 WHERE id = ?1`)
      .bind(id, act, R.metric, R.comparison, R.threshold, R.at_hour_central, R.window, R.baseline, channel, mention, b.active === false ? 0 : 1).run();
    else {
      id = 'al_' + hex(10);
      await env.DB.prepare(`INSERT INTO p_alert (id, act, metric, comparison, threshold, at_hour_central, "window", baseline, channel, mention, created_by, active) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,1)`)
        .bind(id, act, R.metric, R.comparison, R.threshold, R.at_hour_central, R.window, R.baseline, channel, mention, clip(email || b.by || 'admin', 120)).run();
    }
    return json({ ok: true, alert: await view(await getRow(id), await allowedChannels(env, d)) });
  }
  if (path === '/api/alerts' && request.method === 'DELETE') {
    const have = await getRow(url.searchParams.get('id'));
    if (!have) return json({ error: 'No alert with that id.' }, 404);
    if (!mine(have)) return json({ error: 'You do not have access to that brand.' }, 403);
    await env.DB.prepare(`DELETE FROM p_alert WHERE id = ?1`).bind(have.id).run();
    return json({ ok: true });
  }
  if (path === '/api/alerts/pause' && request.method === 'POST') {
    const have = await getRow(b.id);
    if (!have) return json({ error: 'No alert with that id.' }, 404);
    if (!mine(have)) return json({ error: 'You do not have access to that brand.' }, 403);
    await env.DB.prepare(`UPDATE p_alert SET active = ?2 WHERE id = ?1`).bind(have.id, b.active ? 1 : 0).run();
    return json({ ok: true, active: !!b.active });
  }
  if (path === '/api/alerts/test' && request.method === 'POST') {
    let row = b.id ? await getRow(b.id) : null;
    if (b.id && !row) return json({ error: 'No alert with that id.' }, 404);
    if (row && !mine(row)) return json({ error: 'You do not have access to that brand.' }, 403);
    if (!row) { const c = cleanRule(b.rule || {}); if (c.error) return json({ error: c.error }, 400); row = { ...c.rule, act: b.rule?.act || 'all', channel: b.rule?.channel || null, mention: null, active: 1 }; }
    const r = await evalAlert(env, d, row);
    const name = row.act === 'all' ? null : nm[row.act];
    const res = { rule: ruleText(row, name), fires: r.fired.length > 0, fired: r.fired.map(f => ({ brand: f.name, text: f.text.replace(/\*/g, '') })), checked: r.checked, skipped: r.skipped, waiting: r.waiting };
    if (b.post && r.fired.length) {
      const ch = await channelOf(env, d, row);
      if (!ch) return json({ ...res, error: 'No channel to post to.' }, 400);
      const p = await postTo(env, d, ch, alertBlocks(row, r.fired, { test: true, brandName: name }));
      res.posted = !!p?.ok; if (p?.ok === false) res.error = `Slack: ${p.error}`;
    }
    return json(res);
  }
  return json({ error: 'not found' }, 404);
}

/* ---------------- the Strategist ---------------- */
const brandOfCtx = ctx => ctx?.screen?.act_id || ctx?.screen?.act || null;
async function brandFrom(env, d, want, ctx) {
  const w = String(want || '').trim();
  if (/^(all|agency|every|everyone|all brands)$/i.test(w)) return 'all';
  if (w) {
    const id = await resolveBrandId(env, w).catch(() => null);
    const accts = await d.listAccounts(env, false);
    if (id && accts.some(a => a.act_id === id)) return id;
    const l = w.toLowerCase();
    const a = accts.find(x => x.name.toLowerCase() === l) || accts.find(x => x.name.toLowerCase().includes(l) || l.includes(x.name.toLowerCase()));
    if (a) return a.act_id;
    return null;
  }
  return brandOfCtx(ctx) || null;
}
/** Is the person asking Cole (the books are his)? Slack: the user's email; Locus: the session email or the admin key. */
async function isOwnerCtx(env, d, ctx) {
  if (ctx?.surface === 'slack') {
    const uid = ctx?.ev?.user;
    if (!uid) return false;
    if (uid === COLE_SLACK) return true;
    const u = await d.slackApi(env, 'users.info', { user: uid }).catch(() => null);
    return String(u?.user?.profile?.email || '').toLowerCase() === OWNER;
  }
  const who = String(ctx?.who || '').toLowerCase();
  return who === OWNER || who === 'admin';
}

export function autoTools(d0) {
  const D = () => d0.auto || d0;
  const t = (def, run) => ({ def, run });
  return [
    t({ name: 'check_now',
      description: 'Is something weird happening RIGHT NOW? Today so far against the brand\'s normal day by this hour (its last 28 days, scaled by its own hourly curve): revenue, paid orders, new customers, ad spend, MER and CPA from Triple Whale live, Meta spend and price per 1,000 views from Meta live, orders in the last 3 hours, plus the market now (Meta and Google status from Pulse, Breezeway\'s latest day). web: true also searches what advertisers posted in the last few hours (X, Reddit; about 3 cents), use it when the person asks about the market or other advertisers. Use this for "how are we doing today", "is Meta broken", "why are sales slow today". Cached 10 minutes; fresh: true skips the cache.',
      input_schema: { type: 'object', properties: { brand: { type: 'string', description: 'A brand name, or "all" (default: this channel\'s or screen\'s brand, else all).' }, web: { type: 'boolean' }, fresh: { type: 'boolean' } } } },
      async (env, input, ctx) => {
        const act = (await brandFrom(env, D(), input.brand, ctx)) || 'all';
        const r = await checkNow(env, D(), { act, web: !!input.web, fresh: !!input.fresh });
        return r.error ? { is_error: true, text: r.error } : { text: JSON.stringify(r).slice(0, 16000) };
      }),
    t({ name: 'list_alerts',
      description: 'The alerts set up so far (each rule in plain words, brand, where it posts, active or paused, last fired, last status). Read it before create_alert so you do not make a twin, and to find the id for pause_alert or delete_alert.',
      input_schema: { type: 'object', properties: { brand: { type: 'string' } } } },
      async (env, input, ctx) => {
        await ensureAlerts(env);
        const want = input.brand ? await brandFrom(env, D(), input.brand, ctx) : null;
        const { results } = await env.DB.prepare(`SELECT * FROM p_alert ORDER BY created_at DESC`).all();
        const nm = Object.fromEntries((await D().listAccounts(env, false)).map(a => [a.act_id, a.name]));
        const rows = (results || []).filter(r => !want || r.act === want || r.act === 'all').map(r => ({ id: r.id, rule: ruleText(r, r.act === 'all' ? null : nm[r.act]), active: !!r.active, channel: r.channel || 'brand internal channel',
          last_fired: r.last_fired, last_status: r.last_status, created_by: r.created_by }));
        return { text: JSON.stringify(rows.length ? rows : 'No alerts yet.') };
      }),
    t({ name: 'ask_ledger',
      description: 'Ask the Ledger (Mobius Digital\'s own books: the agency\'s income and expenses, receipts, vendor bills, client invoices paid to Mobius, the agency P&L, taxes, the bank) and get its answer. Only Cole may use it: the books are his. Use it for any money question about Mobius itself, never for a client\'s store money (that is Triple Whale). Pass the question in his words, with the period.',
      input_schema: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] } },
      async (env, input, ctx) => {
        const d = D();
        if (!(await isOwnerCtx(env, d, ctx))) return { is_error: true, text: 'The Ledger answers Cole only. Tell them the books are Cole\'s and you cannot open them for them.' };
        if (!env.LEDGER) return { is_error: true, text: 'The LEDGER service binding is missing on this worker.' };
        const tok = (await d.mintSession(env, OWNER)).token;
        const res = await env.LEDGER.fetch(new Request(LEDGER_URL, { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: clip(input.question, 1500), history: [], screen: { screen: 'Asked through the Strategist', note: 'Cole asked the Strategist, which passed the question on. Answer in plain sentences.' } }) }));
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) return { is_error: true, text: `The Ledger said: ${j.error || `HTTP ${res.status}`}` };
        const props = (j.proposals || []).map(p => p.summary).filter(Boolean);
        return { text: `THE LEDGER'S ANSWER (its numbers, quote them as the Ledger's):\n${j.answer || '(no answer)'}${props.length ? `\n\nThe Ledger also suggested a change (${props.join('; ')}). Changes to the books are made in the Ledger app, not from here: say so.` : ''}` };
      }),
  ];
}

export function autoActions(d0) {
  const D = () => d0.auto || d0;
  const safeD = fn => async (env, i, h, ctx) => { try { return await fn(env, i, h, ctx); } catch (e) { return { error: e.message }; } };
  const findAlert = async (env, want) => {
    await ensureAlerts(env);
    const { results } = await env.DB.prepare(`SELECT * FROM p_alert ORDER BY created_at DESC`).all();
    const nm = Object.fromEntries((await D().listAccounts(env, false)).map(a => [a.act_id, a.name]));
    const rows = (results || []).map(r => ({ ...r, text: ruleText(r, r.act === 'all' ? null : nm[r.act]) }));
    const w = String(want || '').trim();
    const byId = rows.find(r => r.id === w);
    if (byId) return byId;
    const words = w.toLowerCase().split(/\W+/).filter(x => x.length > 2);
    const scored = rows.map(r => [words.filter(x => r.text.toLowerCase().includes(x)).length, r]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
    if (!scored.length) throw new Error('No alert matches that. Read list_alerts and pass its id.');
    if (scored.length > 1 && scored[0][0] === scored[1][0]) throw new Error(`Several alerts match: ${scored.slice(0, 4).map(([, r]) => `${r.id} (${r.text})`).join('; ')}. Pass the id.`);
    return scored[0][1];
  };
  return [
    routeAction({ name: 'create_alert',
      description: 'Set up an alert: a rule checked every hour that posts to Slack when it trips, at most once a day. Use it whenever someone wants to be told about something in the future ("tell me if", "let me know when", "ping me if revenue is slow by noon", "warn us when CPA goes over $40"), judging that from what they mean, not from the words. Cole\'s example: "if we have less than 50% of revenue by 12pm Central compared to the average day, send me a Slack" = metric revenue, window today, baseline normal, comparison below, threshold 50, at_hour 12, channel dm. Metrics: revenue, orders, new_customers, spend, mer, cpa, roas (finished days only), meta_cpm. window: today (so far) | yesterday | last7. baseline: normal (the brand\'s own last 28 days; for today, scaled to the hour) | goal (the plan / target CPA / target ROAS) | fixed (threshold is then the number itself, in dollars or x). threshold for normal/goal is a PERCENT of it (50 = half). at_hour: Central hour to check at (omit = every hour from 9am for today, 8am for finished days). channel: "dm" (the person), a #name, an id, or empty for the brand\'s internal channel. Read list_alerts first.',
      input_schema: { type: 'object', properties: {
        brand: { type: 'string', description: 'A brand name, or "all" (each brand checked on its own).' },
        metric: { type: 'string', enum: Object.keys(METRICS) }, window: { type: 'string', enum: ['today', 'yesterday', 'last7'] },
        baseline: { type: 'string', enum: ['normal', 'goal', 'fixed'] }, comparison: { type: 'string', enum: ['below', 'above'] },
        threshold: { type: 'number' }, at_hour: { type: 'integer', description: '0 to 23, Central.' },
        channel: { type: 'string' }, summary: { type: 'string' } }, required: ['brand', 'metric', 'window', 'baseline', 'comparison', 'threshold', 'summary'] },
      describe: safeD(async (env, i, h, ctx) => {
        const d = D();
        const act = await brandFrom(env, d, i.brand, ctx);
        if (!act) return { error: `No brand called "${i.brand}".` };
        const c = cleanRule({ ...i, at_hour_central: i.at_hour }); if (c.error) return { error: c.error };
        const userId = ctx?.surface === 'slack' ? ctx?.ev?.user : null;
        const ch = await resolveChannel(env, d, i.channel, { userId, email: ctx?.who });
        if (ch.error) return { error: ch.error };
        if (ch.channel && !(await channelOk(env, d, ch.channel))) return { error: 'Alerts go to an internal channel or a teammate\'s DM, never a client channel.' };
        const name = act === 'all' ? null : (await d.listAccounts(env, false)).find(a => a.act_id === act)?.name;
        let mention = userId || null;
        if (!mention && ctx?.who && /@/.test(ctx.who)) { const u = await d.slackApi(env, 'users.lookupByEmail', { email: ctx.who }).catch(() => null); mention = u?.ok ? u.user?.id : null; }
        if (/^U/.test(ch.channel || '')) mention = null;   // a DM needs no tag
        const row = { ...c.rule, act };
        return { summary: clip(i.summary || ruleText(row, name), 160),
          detail: `${ruleText(row, name)}\nPosts to ${ch.label || (ch.channel ? ch.channel : name ? `${name}'s internal channel` : 'the Strategist channel')}${mention ? ', tagging you' : ''}. At most once a day. It lands in Locus under Reports > Dashboards > Alerts, where it can be tested, paused or deleted.`,
          request: { method: 'PUT', path: '/api/alerts', body: { act, ...c.rule, channel: ch.channel || null, mention, by: ctx?.who || (userId ? `<@${userId}>` : null) } } };
      }), done: () => 'Alert set. It is in Locus under Reports > Dashboards > Alerts.' }),
    routeAction({ name: 'pause_alert',
      description: 'Pause an alert (active false) or turn it back on (active true). Find it with list_alerts.',
      input_schema: { type: 'object', properties: { alert: { type: 'string', description: 'Its id, or words from its rule.' }, active: { type: 'boolean' }, summary: { type: 'string' } }, required: ['alert', 'active', 'summary'] },
      describe: safeD(async (env, i) => { const r = await findAlert(env, i.alert); return { summary: i.summary, detail: `${i.active ? 'Turn back on' : 'Pause'}: ${r.text}`, request: { method: 'POST', path: '/api/alerts/pause', body: { id: r.id, active: !!i.active } } }; }),
      done: (r) => r?.active ? 'Alert back on.' : 'Alert paused.' }),
    routeAction({ name: 'delete_alert',
      description: 'Delete an alert for good. Find it with list_alerts.',
      input_schema: { type: 'object', properties: { alert: { type: 'string' }, summary: { type: 'string' } }, required: ['alert', 'summary'] },
      describe: safeD(async (env, i) => { const r = await findAlert(env, i.alert); return { summary: i.summary, detail: `Delete: ${r.text}`, request: { method: 'DELETE', path: `/api/alerts?id=${encodeURIComponent(r.id)}` } }; }),
      done: () => 'Alert deleted.' }),
    routeAction({ name: 'schedule_task',
      description: 'Schedule something to run on its own and post to an internal Slack channel: kind "task" = an instruction you carry out at that time ("every Monday at 9 check Lucky\'s ad sets and suggest budget moves"); any change you would make is posted as an Apply card for a person to approve, never applied on its own. kind "report" = build a report and post it; "check" = the live check (check_now) posted; "dashboard" = post a saved dashboard (give its name); "question" = a question answered fresh each time (same as schedule_question). cadence daily | weekdays | monday | first, hour in Central (default 8). Channel: a brand\'s internal channel or the Strategist channel, never a client channel. Read the schedules view first so you do not make a twin.',
      input_schema: { type: 'object', properties: {
        instruction: { type: 'string', description: 'What to do each time, self-contained, in the person\'s words (name the brand and the period).' },
        kind: { type: 'string', enum: ['task', 'report', 'check', 'dashboard', 'question'] },
        brand: { type: 'string', description: 'A brand name, or "all".' },
        cadence: { type: 'string', enum: ['daily', 'weekdays', 'monday', 'first'] },
        hour: { type: 'integer' }, channel: { type: 'string' }, dashboard: { type: 'string', description: 'For kind dashboard: its name or id.' }, summary: { type: 'string' } }, required: ['kind', 'brand', 'cadence', 'summary'] },
      describe: safeD(async (env, i, h, ctx) => {
        const d = D();
        const act = await brandFrom(env, d, i.brand, ctx);
        if (!act) return { error: `No brand called "${i.brand}".` };
        const kind = ['task', 'report', 'check', 'dashboard', 'question'].includes(i.kind) ? i.kind : 'task';
        const cadence = ['daily', 'weekdays', 'monday', 'first'].includes(i.cadence) ? i.cadence : 'monday';
        const hour = Number.isInteger(+i.hour) && +i.hour >= 0 && +i.hour <= 23 ? +i.hour : 8;
        let ref = null, label = '';
        if (kind === 'dashboard') {
          const { results } = await env.DB.prepare(`SELECT id, name FROM p_dashboard`).all().catch(() => ({ results: [] }));
          const w = String(i.dashboard || '').toLowerCase();
          const hit = (results || []).find(x => x.id === i.dashboard) || (results || []).find(x => String(x.name).toLowerCase() === w) || (results || []).find(x => String(x.name).toLowerCase().includes(w));
          if (!w || !hit) return { error: `Which dashboard? ${(results || []).slice(0, 8).map(x => `"${x.name}"`).join(', ') || 'There are none yet.'}` };
          ref = hit.id; label = `Post the "${hit.name}" dashboard`;
        }
        const instruction = clip(i.instruction || label || (kind === 'check' ? 'The live check: is anything weird right now?' : ''), 600);
        if (instruction.length < 8) return { error: 'Say what it should do each time.' };
        const accts = await d.listAccounts(env, false), a = act === 'all' ? null : accts.find(x => x.act_id === act);
        const ch = await resolveChannel(env, d, i.channel, {});
        if (ch.error) return { error: ch.error };
        if (/^U/.test(ch.channel || '')) return { error: 'Scheduled posts go to a channel (a brand\'s internal channel or the Strategist channel), not a DM. Use an alert for a DM.' };
        const allowed = await allowedChannels(env, d);
        const channel = ch.channel || a?.slack_channel || String((await d.getSetting(env, 'strategistChannel')) || '').trim();
        if (!channel) return { error: `${a ? a.name : 'That'} has no internal channel set. Name a channel.` };
        if (!allowed.has(channel)) return { error: 'Scheduled posts only go to an internal channel (a brand\'s internal channel or the Strategist channel), never a client channel.' };
        const H = hourWord(hour), when = { daily: 'every morning', weekdays: 'every weekday', monday: 'every Monday', first: 'on the 1st of the month' }[cadence];
        const what = { task: 'Runs it and posts what it found; any change comes as an Apply card for a person to approve.', report: 'Builds the report and posts it.', check: 'Runs the live check and posts it.', dashboard: 'Posts the dashboard.', question: 'Answers it fresh and posts the answer.' }[kind];
        return { summary: clip(i.summary, 160), detail: `"${clip(instruction, 400)}"\n${a ? a.name : 'All brands'} · ${when} at ${H} Central · posts to ${allowed.get(channel) || channel}. ${what} It lands in Locus under Reports > Dashboards > Scheduled, where it can be run now, changed or deleted.`,
          request: { method: 'PUT', path: '/api/ask/schedules', body: { question: instruction, kind, ref, act, cadence, hour_central: hour, channel } } };
      }), done: () => 'Scheduled. It is in Locus under Reports > Dashboards.' }),
  ];
}
