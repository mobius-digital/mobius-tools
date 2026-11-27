/* Home and one brand's store numbers. Answers come from the shared database through the data door.
   A window that includes today, or a single day (which shows its hours), needs a live read of the
   tracker, so that one request is sent to the old engine. */
// from profit/worker/src/worker.js (/api/overview near 2205, /api/client near 2309)
import { fail } from '../platform/errors.js';
import { addDays, monthOf, windowFor } from '../platform/time.js';
import { safeJson } from '../platform/text.js';
import { totals } from './money.js';
import { buildSeries, channelsFor, goalsFor, goalsPlanned, planFor, pubAccount, wholeDays } from './series.js';
import { spread } from './expenses.js';
import { inlineHealth, checkIsStale } from './health.js';
import { listAccounts, oneAccount, loadRaw, loadDays, loadCards } from './load.js';
import { storeTag } from './storesource.js';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const STALE_WAIT_MS = 10 * 60e3;
let staleSentAt = 0;              // the last time a request went to the old engine to refresh the cost check

/** The window part of a request, read the way the old routes read it. */
export function askedWindow(q, fallbackDays = 30, mostDays = 180) {
  return { days: Math.min(+q.days || fallbackDays, mostDays),
    from: YMD.test(q.from || '') ? q.from : null, to: YMD.test(q.to || '') ? q.to : null };
}

const minOf = list => list.slice().sort()[0];
const maxOf = list => list.slice().sort().pop();

/* The days one brand's card needs: its window, the month so far, and the period it is compared with. */
function cardWindow(a, asked, cmp, now) {
  const { today, from, to } = windowFor(a.tz, asked, now);
  const monthStart = `${monthOf(today)}-01`;
  const span = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  let pFrom = null, pTo = null;
  if (cmp === 'prev') { pTo = addDays(from, -1); pFrom = addDays(pTo, -(span - 1)); }
  else if (cmp === 'yoy') { pFrom = `${+from.slice(0, 4) - 1}${from.slice(4)}`; pTo = `${+to.slice(0, 4) - 1}${to.slice(4)}`; }
  // Read back to the 1st even when the window is shorter, so month to date is the whole month to date.
  const fetchFrom = [from, monthStart, cmp === 'prev' ? pFrom : from].sort()[0];
  return { today, ym: monthOf(today), from, to, monthStart, pFrom, pTo, fetchFrom };
}

const seriesPoint = r => ({ date: r.date, sales: r.sales ?? null, spend: r.spend ?? null, orders: r.orders ?? null,
  new_orders: r.new_orders ?? null, new_rev: r.new_rev ?? null, cm: r.cm ?? null });

/* The rows of the period a card is compared with. */
function compareRows(a, w, cmp, allRows, yoyRaw) {
  if (cmp === 'prev') return allRows.filter(r => r.date >= w.pFrom && r.date <= w.pTo);
  if (cmp === 'yoy') return buildSeries(yoyRaw, a, w.pFrom, w.pTo).rows;
  return [];
}

/* One brand's card on the home page. */
function card(a, w, raw, yoyRaw, cards, { cmp, wantSeries }) {
  const { rows: allRows, margin_pct, shipping, piv, store } = buildSeries(raw, a, w.fetchFrom, w.to);
  const rows = allRows.filter(r => r.date >= w.from && r.date <= w.to);
  const prevRows = compareRows(a, w, cmp, allRows, yoyRaw);
  const channels = wantSeries ? channelsFor(raw.attr[a.act_id], rows, piv, w.from, w.to) : null;
  const g = goalsFor(a, w.ym);
  // A brand with no stored check yet is judged here, so the card is never blank.
  const health = cards.byAct[a.act_id] || inlineHealth(rows, margin_pct);
  const mtdRows = allRows.filter(r => r.date >= w.monthStart);
  return {
    ...pubAccount(a),
    window: totals(rows),
    mtd: totals(mtdRows),
    conn_kinds: [...(cards.connKinds[a.act_id] || [])], email_tool: cards.emailTool[a.act_id] || 'klaviyo',
    // Daily revenue for the small line on the card, at most 60 points.
    spark: (rows.length > 60 ? rows.slice(-60) : rows).map(r => r.sales ?? null),
    prev: prevRows.length ? totals(prevRows) : null,
    prev_window: w.pFrom ? { from: w.pFrom, to: w.pTo, kind: cmp } : null,
    series: wantSeries ? rows.slice(-100).map(seriesPoint) : undefined,
    prev_series: wantSeries && prevRows.length ? prevRows.slice(-100).map(seriesPoint) : undefined,
    channels: channels || undefined,
    goals: g.sales != null || g.spend != null ? g : null,
    plan: planFor(a, w.ym, wholeDays(mtdRows, w.today)), live_as_of: null,
    // The month the goals are for, and whether it has its own sales goal (false: the goals are inherited).
    goals_planned: goalsPlanned(a, w.ym), month: w.ym,
    margin_pct, cost_health: health, shipping,
    slack_channel: a.slack_channel || null, brief_channel: a.brief_channel || null,
    brief_enabled: !!a.brief_enabled,
    review_first: !!a.review_first,
    report_config: safeJson(a.report_config_json, {}),
    // Where the store numbers came from (storesource.js).
    ...storeTag(store),
  };
}

/* Should this overview go to the old engine instead? It should when a window includes today (a live
   read), and when the stored cost check is old (the old engine refreshes it in the background). */
function sendBack(accounts, windows, cards, now) {
  if (windows.some(w => w.to === w.today)) return 'the window includes today, which is read live from the tracker';
  if (checkIsStale(accounts, cards.byAct, now) && now - staleSentAt > STALE_WAIT_MS) {
    staleSentAt = now;
    return 'the stored cost check is old, and the old engine refreshes it when it answers an overview';
  }
  return '';
}

/** GET /pw/api/overview: every brand of the caller, store level. A client gets only its own brands. */
export async function overview(ctx, input) {
  const q = input.query;
  const asked = askedWindow(q);
  const cmp = ['prev', 'yoy', 'none'].includes(q.cmp) ? q.cmp : 'prev';
  const wantSeries = q.series !== '0';
  const kind = ctx.caller.kind === 'client' ? 'client' : 'admin';
  const accounts = await listAccounts(ctx, true);
  const top = { days: asked.days, from: asked.from, to: asked.to };
  if (!accounts.length) return { ...top, accounts: [], kind };
  const windows = accounts.map(a => cardWindow(a, asked, cmp, ctx.now));
  const cards = await loadCards(ctx);
  const why = sendBack(accounts, windows, cards, ctx.now.getTime());
  if (why) return ctx.forward(why);
  const acts = accounts.map(a => a.act_id);
  const raw = await loadRaw(ctx, acts, minOf(windows.map(w => w.fetchFrom)), maxOf(windows.map(w => w.to)), { attr: wantSeries });
  let yoyRaw = null;
  if (cmp === 'yoy') {
    const days = await loadDays(ctx, acts, minOf(windows.map(w => w.pFrom)), maxOf(windows.map(w => w.pTo)));
    yoyRaw = { ...raw, ...days };
  }
  const out = accounts.map((a, i) => card(a, windows[i], raw, yoyRaw, cards, { cmp, wantSeries }));
  return { ...top, accounts: out, kind };
}

/** Tests only: forget that a request was sent back for a stale cost check. */
export function forgetStale() { staleSentAt = 0; }

/** GET /pw/api/client: one brand's daily series and the totals behind it. */
export async function client(ctx, input) {
  const acct = await oneAccount(ctx);
  if (!acct) fail(404, 'unknown account');
  const asked = askedWindow(input.query);
  const { today, from, to } = windowFor(acct.tz, asked, ctx.now);
  if (to === today) return ctx.forward('the window includes today, which is read live from the tracker');
  if (from === to) return ctx.forward('a single day shows its hours, which are read live from the tracker');
  const ym = monthOf(today);
  const monthStart = `${ym}-01`;
  const raw = await loadRaw(ctx, [acct.act_id], from < monthStart ? from : monthStart, to);
  const { rows: allRows, margin_pct, shipping, exp, store } = buildSeries(raw, acct, from < monthStart ? from : monthStart, to);
  const rows = allRows.filter(r => r.date >= from && r.date <= to);
  // The plan is spread over the days gone by in the month, so it sees month to date, not the window.
  const mtdRows = allRows.filter(r => r.date >= monthStart);
  /* Extra costs over the window. total and items sit under contribution margin, ad_total and ad_items are
     already inside ad spend. */
  const fx = spread(exp, from, to, rows);
  const data = {
    account: pubAccount(acct), days: asked.days, from, to, margin_pct, rows, shipping,
    fixed: { total: fx.total, items: fx.items, ad_total: fx.ad_total, ad_items: fx.ad_items },
    totals: totals(rows), mtd: totals(mtdRows),
    goals: goalsFor(acct, ym), plan: planFor(acct, ym, wholeDays(mtdRows, today)),
    live_as_of: null, hours: null,
    goals_planned: goalsPlanned(acct, ym),
    ...storeTag(store),
  };
  return { data, meta: { window: { from, to, tz: acct.tz } } };
}
