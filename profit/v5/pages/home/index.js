/* Brand Home: how the brand is doing on the dates in the page head, then what needs a person.
   Data first: this person's own tiles (Edit tiles: add, remove, reorder; Sales, Ad spend, MER, New customers, Cost per new
   customer and Profit after ads by default), the MER in one plain sentence against the goal with the daily chart under
   it. Then what waits on a yes (every kind, team only), the pace to the month goal, each platform against the goal,
   the best ads (they open the shared ad detail), what changed, and what is coming up.

   Where the live numbers come from (all read only):
     /api/client?act&from&to              profit worker   the store by day and over the window, the plan, goals_planned
     /api/client?act&from&to (before)     profit worker   the same number of days just before: the tiles' change
     /api/hub/paid?platform=all&cmp=prev  profit worker   spend and Triple Whale credited sales per platform (and Amazon)
     /api/hub/paid?platform=meta|google|tiktok&cmp=prev   profit worker, only when one of that platform's tiles is on
     /api/overview?days=7&series=0        profit worker   the cost check (profit withheld when costs are broken)
     ctx.setting brand:<id>.target_roas   account-health  goal ROAS and goal cost per customer, from the brand list (team only)
     /api/buyer-list?act                  account-health  Meta calls waiting (team only): n_do, or the rows that ask for a yes or a no
     /api/season?act                      profit worker   dated phases for Coming up and the chart note
     /api/me/prefs                        account-health  this person's prefs; home_tiles is used once the server keeps it
   Read by their own cards after the page draws (never by load):
     Waiting on your yes   home/_yes.js (bell.js loadWaiting + readNotices)
     Best ads              /api/hub/creative?act&from&to&model=lastPlatformClick (profit), /api/ad-creatives (account-health)
     What changed          /api/activities?act&from&to (account-health, team) or /api/ad-updates (client view)
   The page needs only the first; any other that fails leaves its own card in a plain empty state. */

import { put } from '../../kit.js';
import { homeNotices } from '../automations/_notices.js';
import { askWhy, helpBar, dl, rangeWords } from './_biz.js';
import { monthWord } from '../a-today/_ag.js';
import { liveNote } from '../my-day/_waiting.js';
import { openAdDetail } from '../_addetail.js';
import { picture, css as pictureCss } from '../production/_ui.js';
import { fixture } from '../../data.js';
import { refresh } from '../../router.js';
import { h, money, num, pct, x, card, em, button, platformChip, statusDot, pill, delta, gauge, lineChart,
  dateBlock, table, empty, addStyles, staleStamp, tipRow, svgNode, sourceLine, toast } from '../../kit.js';
import { tiles } from '../../kit.js';
import { CATALOG, tileOf, tileNode, tileStyles, savedTiles, saveTiles, editTiles, feedsFor, cleanTiles, tilePrefsSupported } from './_tiles.js';
import { waitingYes } from './_yes.js';

/* ---------- local styles (layout only; every color and size token comes from app.css) ---------- */
const CSS = `
.hm-top{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap}
.hm-top .sp{flex:1}
.hm-top h2{margin:0;font-size:var(--fs-section,17px);font-weight:600;letter-spacing:-.01em}
.hm-top .lx-small{margin:0}
.hm-mer-say{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 10px;margin:0;font-size:var(--num-m,18px);font-weight:500;line-height:1.35;color:var(--ink)}
.hm-mer-say b{font-size:var(--num-l,26px);font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.hm-mer-say .g{color:var(--ink-2)}
.hm-mer-sub{margin:6px 0 0;font-size:var(--fs-small,12.5px);color:var(--muted)}
.hm-mer-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,360px);gap:16px 32px;align-items:center;margin-bottom:20px}
.hm-mer-row .lx-gauge{width:100%}
.hm-mer-g{display:grid;gap:8px;justify-items:start}
.hm-chart-cap{display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap;margin:4px 0 6px}
.hm-chart-cap .lx-legend{margin-left:auto}
.hm-say{margin-top:18px}
.hm-pace-say{margin:0 0 14px;font-size:var(--fs-card,14px);line-height:1.5;color:var(--ink-2);max-width:72ch}
.hm-pace-say b{color:var(--ink);font-weight:600}
.hm-why{display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap;margin:18px 0 0;padding:12px 16px;border-radius:var(--r-tbl,12px);background:var(--band)}
.hm-why p{flex:1;min-width:0;margin:0;font-size:var(--fs-card,14px);line-height:1.5;color:var(--ink-2)}
.hm-why p b{color:var(--ink);font-weight:600}
.hm-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--gap-5,24px);align-items:stretch}
.hm-pair>.lx-card{display:flex;flex-direction:column;min-width:0}
.hm-up{padding:4px 28px 14px}
.hm-up>div{display:flex;align-items:center;gap:14px;min-height:62px;border-top:1px solid var(--line)}
.hm-up>div:first-child{border-top:0}
.hm-up .t{min-width:0}
.hm-up .t b{display:block;font-weight:600}
.hm-up .t span{display:block;font-size:var(--fs-small,12.5px);color:var(--muted)}
.hm-up .lx-stat{margin-left:auto}
.hm-quiet{padding:8px 28px 24px;margin:0;color:var(--muted);font-size:13.5px}
.hm-g{display:block;width:200px;max-width:100%}
.hm-total .lx-gauge-track{background:var(--line-strong)}
.hm-src{padding:0 28px 12px}
.hm-plats{display:none;padding:0 16px 6px}
.hm-plats>div{display:grid;gap:8px;padding:14px 0;border-top:1px solid var(--line)}
.hm-plats>div:first-child{border-top:0}
.hm-plats .top{display:flex;align-items:center;gap:10px}
.hm-plats .top .lx-stat{margin-left:auto}
.hm-plats .nums{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;font-variant-numeric:tabular-nums}
.hm-plats .nums small{display:block;font-size:11.5px;color:var(--muted)}
.hm-plats .nums b{font-weight:600}
.hm-plats .tot{margin:0 -16px;padding:14px 16px;background:var(--band);border-top:0}
.hm-ads{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--gap-4,16px);padding:4px 28px 24px}
.hm-ads>.hm-quiet{grid-column:1/-1;padding:0}
.hm-ad{display:flex;flex-direction:column;min-width:0;padding:0;border:1px solid var(--line);border-radius:var(--r-tbl,12px);background:var(--surface);overflow:hidden;text-align:left;font:inherit;color:inherit;cursor:pointer}
.hm-ad:hover{background:var(--row-hover)}
.hm-ad:focus-visible{outline:2px solid var(--ink-2);outline-offset:2px}
.hm-ad-m{position:relative;display:grid;place-items:center;aspect-ratio:1/1;background:var(--bg-sunk);color:var(--faint);overflow:hidden}
.hm-ad-m img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center top}
.hm-ad-m>.pd-pic{position:absolute;inset:0;width:100%;height:100%;border-radius:0;aspect-ratio:auto!important}
.hm-ad-m.art>svg{display:none}
.hm-ad-m>.pd-pic>svg{width:100%;height:100%}
.hm-ad-m svg{width:26px;height:26px}
.hm-ad-t{display:flex;align-items:center;gap:6px;min-height:20px}
.hm-ad-t .c{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:var(--r-chip,6px);border:1px solid var(--line);color:var(--ink);font-size:11px;font-weight:600}
.hm-ad-t .c.good{color:var(--good)}
.hm-ad-t .c.warn{color:var(--warn)}
.hm-ad-t .c.bad{color:var(--bad)}
.hm-ad-t .k{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:var(--r-chip,6px);background:var(--surface-2);color:var(--ink-2);font-size:11px;font-weight:600}
.hm-ad-b{display:grid;gap:4px;padding:12px 14px 14px;min-width:0}
.hm-ad-b h4{margin:0;font-size:13.5px;font-weight:600;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hm-ad-b .w{font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hm-ad-n{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:8px;padding-top:10px;border-top:1px solid var(--line)}
.hm-ad-n small{display:block;font-size:11.5px;color:var(--muted)}
.hm-ad-n b{display:block;font-size:var(--num-s,14px);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.hm-ad-n b.bad{color:var(--bad)}
.hm-ch{display:grid;padding:0 28px 12px}
.hm-ch>div{display:grid;grid-template-columns:64px minmax(0,1fr);gap:4px 14px;padding:12px 0;border-top:1px solid var(--line)}
.hm-ch>div:first-child{border-top:0}
.hm-ch .d{font-size:12.5px;color:var(--muted);font-variant-numeric:tabular-nums;padding-top:1px}
.hm-ch .t{min-width:0;display:grid;gap:2px}
.hm-ch .t b{font-size:13.5px;font-weight:600;overflow-wrap:anywhere}
.hm-ch .t span{font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
.hm-ch-more{margin-top:auto;padding:4px 28px 20px}
@media (max-width:1180px){.hm-ads{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:1100px){.hm-pair{grid-template-columns:minmax(0,1fr)}}
@media (max-width:759px){
  .hm-wide{display:none}
  .hm-plats{display:block}
  .hm-mer-row{grid-template-columns:minmax(0,1fr);gap:12px}
  .hm-up,.hm-ch{padding-left:16px;padding-right:16px}
  .hm-quiet,.hm-src,.hm-ch-more{padding-left:16px;padding-right:16px}
  .hm-ads{grid-template-columns:minmax(0,1fr);gap:10px;padding:4px 16px 18px}
  .hm-ad{display:grid;grid-template-columns:96px minmax(0,1fr);align-items:stretch}
  .hm-ad-m{aspect-ratio:auto;min-height:96px}
  .hm-ad-b{padding:10px 12px 12px}
  .hm-ad-n{margin-top:6px;padding-top:8px}
  .hm-byp>.lx-sec .note{display:none}
}`;
const styles = () => { addStyles('hm-css', CSS); tileStyles(); };

/* ---------- small helpers ---------- */
const ok = n => n != null && isFinite(n);
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const asDate = str => new Date(str + 'T12:00:00');
const dayLabel = str => asDate(str).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const clip = (str, n) => { const v = String(str || '').trim(); return v.length > n ? v.slice(0, n - 1).trimEnd() + '…' : v; };
const addDays = (str, n) => { const d = asDate(str); d.setDate(d.getDate() + n); return iso(d); };
const soft = p => p.catch(e => { if (e && e.name === 'AbortError') throw e; return null; });
/** The same number of days just before the window: the tiles compare with it. */
export function prevWindow({ from, to }) {
  const len = Math.round((asDate(to) - asDate(from)) / 864e5) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

/* ---------- live data: shape the answers into the one object the page draws (the sample fixture has the same shape) ---------- */
const STATUS = { locked: ['good', 'Ready'], draft: ['warn', 'Draft offer'], missing: ['warn', 'No offer yet'] };
const PLATS = ['meta', 'google', 'tiktok', 'amazon', 'pinterest', 'email'];
const DAYKEYS = ['sales', 'spend', 'orders', 'new_orders', 'new_rev', 'ret_rev', 'gross_profit', 'email_rev'];

/** A platform answer (/api/hub/paid?platform=meta|google|tiktok) as a tile feed: { series, prev, pending }. */
export function feedOf(r) {
  const b = r && (r.brands || [])[0];
  if (!b) return null;
  const n = v => (ok(v) ? +v : null);
  const series = (b.series || []).map(s => ({ date: s.date, spend: n(s.spend), revenue: n(s.revenue), purchases: n(s.purchases), impressions: n(s.impressions), clicks: n(s.clicks) }));
  let prev = null;
  if ((b.prev_series || []).length) {
    prev = { spend: 0, revenue: 0, purchases: 0, impressions: 0, clicks: 0 };
    for (const s of b.prev_series) {
      /* Meta's compare days carry CPM and CTR, not the counts: the counts come back from them */
      const imp = ok(s.impressions) ? s.impressions : s.cpm > 0 ? s.spend / s.cpm * 1000 : 0;
      const clk = ok(s.clicks) ? s.clicks : ok(s.ctr) ? imp * s.ctr : 0;
      prev.spend += +s.spend || 0; prev.revenue += +s.revenue || 0; prev.purchases += +s.purchases || 0; prev.impressions += imp; prev.clicks += clk;
    }
  }
  return { series, prev, pending: !!(b.cur && b.cur.attr_pending) };
}

export function shape({ win, cl, prevCl, paid, ov, buy, season, goals, isClient, feeds, prefs }) {
  const rows = (cl.rows || []).filter(r => r.date >= win.from && r.date <= win.to);
  const acct = ((ov && (ov.accounts || ov.brands)) || []).find(a => a.act_id === (cl.account && cl.account.act_id)) || {};
  const costsBroken = !!(acct.cost_health && acct.cost_health.verdict === 'broken');
  const days = rows.map(r => {
    const d = { date: r.date };
    for (const k of DAYKEYS) d[k] = r[k] ?? null;
    d.cm = costsBroken ? null : ok(r.gross_profit) && ok(r.spend) ? r.gross_profit - r.spend : null;
    return d;
  });
  const pick = t => { if (!t) return null; const o = {}; for (const k of DAYKEYS) o[k] = t[k] ?? null; o.cm = costsBroken ? null : t.cm ?? null; return o; };
  const t = cl.totals || {};
  const source = !!((cl.account && cl.account.tw_shop) || rows.some(r => r.sales > 0));
  /* goals_planned false: no goal for this month; goals and plan hold an earlier month's numbers and are never shown */
  const noGoal = cl.goals_planned === false ? monthWord(typeof cl.month === 'string' ? cl.month : String(cl.to || win.to || '').slice(0, 7)) : null;
  const g = noGoal ? {} : cl.goals || {}, p = noGoal ? null : cl.plan || null;
  const planMer = ok(g.sales) && g.spend > 0 ? g.sales / g.spend : null;
  const today = (season && season.today) || iso(new Date());

  /* Coming up and the chart note both come from the dated season phases */
  const phases = (((season && season.accounts) || [])[0] || {}).phases || [];
  const live = phases.filter(ph => ph.status !== 'skip' && ph.start);
  const coming = live.filter(ph => ph.start >= today).sort((a, b) => a.start.localeCompare(b.start)).slice(0, 3).map(ph => {
    const st = STATUS[ph.status] || ['', ''];
    return { date: ph.start, title: ph.name, sub: clip(ph.offer, 44), tone: st[0], status: st[1] };
  });
  const ended = live.filter(ph => ph.end && ph.end >= win.from && ph.end < win.to).sort((a, b) => b.end.localeCompare(a.end))[0];

  const brand = ((paid && paid.brands) || [])[0];
  const prow = brand ? (brand.rows || []) : [];
  const platforms = brand ? prow.filter(r => PLATS.includes(r.id)).map(r => ({ id: r.id, spend: r.spend ?? null, sales: r.revenue ?? null })) : null;
  const amz = prow.find(r => r.id === 'amazon');

  /* Suggestions waiting on a yes or a no. The worker counts them itself (n_do). Without that, count the rows that
     ask for an answer (card.decide); notes that need none and loaded ads (kind launch) are left out. */
  const calls = !buy ? null : ok(buy.n_do) ? buy.n_do
    : Array.isArray(buy.rows) ? buy.rows.filter(r => r.kind !== 'launch' && r.card && r.card.decide === true).length : null;

  /* the Locus call per ad (ad call rules, buyer list rows at the ad level): the best ads cards show it as a pill */
  const adCalls = {};
  for (const r of (buy && Array.isArray(buy.rows) ? buy.rows : [])) {
    const id = r && r.level === 'ad' && (r.ad_id || r.object_id);
    if (id && !r.decided && (r.call || r.label)) adCalls[id] = { call: String(r.call || r.label), kind: r.kind || '' };
  }
  const totals = pick(t) || {};
  totals.cac = t.cac ?? null;
  return {
    today, range: win, prev_range: prevWindow(win), source, currency: (cl.account && cl.account.currency) || 'USD',
    totals, prev: prevCl ? pick(prevCl.totals) : null,
    profit_withheld: costsBroken,
    /* a plan is agreed per month, so it is only compared on "This month"; any other dates show the numbers alone */
    plan: win.preset === 'month' && p && (ok(p.sales) || ok(p.spend))
      ? { sales: p.sales ?? null, spend: p.spend ?? null, month_sales: (p.month && p.month.sales) ?? null, month_spend: (p.month && p.month.spend) ?? null, days: p.days ?? null, days_in_month: p.days_in_month ?? null }
      : null,
    no_goal: win.preset === 'month' ? noGoal : null,
    /* the brand's own goal first; the month plan (sales over spend) only when no goal ROAS is set */
    goal: { mer: (goals && goals.roas) || planMer || null, cac: (goals && goals.cpa) || null },
    days,
    feeds: {
      ...(feeds || {}),
      amazon: brand ? (amz ? { spend: amz.spend ?? null, revenue: amz.revenue ?? null, prev_spend: amz.prev_spend ?? null, prev_revenue: amz.prev_revenue ?? null } : null) : undefined,
    },
    prefs_tiles: tilePrefsSupported(prefs && prefs.prefs),
    note: ended ? { date: ended.end, text: `${ended.name} ended ${dayLabel(ended.end)}` } : null,
    suggestions: isClient ? null : { meta: calls, google: null },
    ad_calls: isClient ? null : adCalls,
    coming: season ? coming : null,
    platforms,
  };
}

/* ---------- the bundle the tiles read ---------- */
function bundle(data, ctx) {
  const f = data.feeds || {};
  return { days: data.days || [], totals: data.totals || {}, prev: data.prev || null, range: data.range, prevRange: data.prev_range,
    cur: data.currency, costsBroken: !!data.profit_withheld, meta: f.meta, google: f.google, tiktok: f.tiktok, amazon: f.amazon };
}
/** The plan or goal line some tiles carry under their change. */
function extraFor(data) {
  const p = data.plan, g = data.goal || {}, t = data.totals || {}, cur = data.currency;
  const vsPlan = (actual, plan, cost) => {
    if (!ok(actual) || !(plan > 0)) return null;
    const up = actual >= plan;
    return [cost ? (up ? 'over ' : 'under ') : (up ? 'ahead of ' : 'behind '), dl('plan to date', 'plan_to_date'), ' ' + money(plan, { cur })];
  };
  return (tile, n) => {
    if (tile.id === 'sales') return data.no_goal ? 'No goal set for ' + data.no_goal : vsPlan(n.v, p && p.sales);
    if (tile.id === 'spend') return vsPlan(n.v, p && p.spend, true);
    if (tile.id === 'cac' && g.cac && ok(n.v)) return statusDot(n.v <= g.cac ? 'good' : 'warn', 'goal ' + money(g.cac, { cur }) + ' each');
    if (tile.id === 'mer' && g.mer && ok(n.v)) return statusDot(n.v >= g.mer ? 'good' : 'warn', 'goal ' + x(g.mer));
    if (tile.id === 'profit' && ok(n.v) && t.sales > 0) return pct(n.v / t.sales) + ' of sales';
    return null;
  };
}

/* ---------- pieces ---------- */
function tilesBlock(data, ctx, host) {
  const F = bundle(data, ctx), extra = extraFor(data);
  let ids = savedTiles(ctx);
  const grid = tiles([], { class: 'hm-tiles' });
  const paint = () => grid.replaceChildren(...ids.map(id => tileOf(id)).filter(Boolean).map(t => tileNode(t, F, ctx, { extra })));
  paint();
  const edit = button('Edit tiles', { onclick: () => editTiles(ctx, ids, async next => {
    const need = feedsFor(next).filter(k => k !== 'store'), have = data.feeds || {};
    ids = await saveTiles(ctx, next, { server: data.prefs_tiles });
    if (!ctx.sample && need.some(k => have[k] === undefined)) { toast('Getting the new numbers.'); refresh({ fresh: true }); return; }
    paint(); toast('Tiles saved. Only you see this set.');
  }) });
  const head = h('div', { class: 'hm-top hm-numhead' },
    h('h2', null, 'Your numbers'), h('span', { class: 'lx-small' }, rangeWords(ctx, data.range) + ', against ' + rangeWords(ctx, data.prev_range)),
    h('span', { class: 'sp' }), staleStamp({ at: host.at, onRefresh: () => refresh({ fresh: true }) }), edit);
  return [head, grid];
}

/* One sentence, only when it adds something the tiles do not show: the best day, and why MER is under goal, but only
   the cause the numbers show (ad spend up faster than sales against the days before). Otherwise only the gap. */
function sentence(data) {
  const t = data.totals || {}, g = data.goal || {}, pv = data.prev || {}, days = (data.days || []).filter(d => ok(d.sales));
  const b = v => h('b', null, v);
  const best = days.length > 2 ? days.reduce((m, d) => d.sales > m.sales ? d : m, days[0]) : null;
  const mer = t.spend > 0 && ok(t.sales) ? t.sales / t.spend : null;
  const parts = [];
  if (best) parts.push('Best day was ', b(dayLabel(best.date)), '.');
  if (g.mer && mer != null && mer < g.mer) {
    const sc = pv.sales > 0 && ok(t.sales) ? t.sales / pv.sales - 1 : null, pc = pv.spend > 0 && ok(t.spend) ? t.spend / pv.spend - 1 : null;
    const word = c => (c >= 0 ? 'up ' : 'down ') + pct(Math.abs(c));
    parts.push(parts.length ? ' ' : '', 'Store MER is ', b(x(g.mer - mer)), ' under goal.');
    if (sc != null && pc != null && pc > sc + 0.01) parts.push(' Ad spend is ', b(word(pc)), ' against the days before, sales ', b(word(sc)), '.');
  }
  return parts.length ? parts : null;
}

function merCard(data, ctx) {
  const t = data.totals || {}, g = data.goal || {}, days = data.days || [], cur = data.currency;
  const mer = t.spend > 0 && ok(t.sales) ? t.sales / t.spend : null;
  const win = rangeWords(ctx, data.range);
  const gap = mer != null && g.mer ? mer - g.mer : null;
  const say = h('p', { class: 'hm-mer-say' },
    h('span', null, dl('MER', 'mer'), ' ', h('b', null, mer != null ? x(mer) : 'not tracked yet'), ', ' + win + '.'),
    h('span', { class: 'g' }, g.mer ? 'Goal ' + x(g.mer) + '.' : data.no_goal ? 'No goal set for ' + data.no_goal + '.' : 'No goal set.'));
  const sub = h('p', { class: 'hm-mer-sub' }, `Whole store sales ${money(t.sales, { cur })} over all ad spend ${money(t.spend, { cur })} · Triple Whale`);
  const gz = mer != null && g.mer ? h('div', { class: 'hm-mer-g' },
    gauge({ value: mer, max: Math.max(g.mer * 1.3, mer * 1.08), goal: g.mer, tone: gap >= 0 ? 'good' : gap > -0.15 * g.mer ? 'warn' : 'bad',
      ticks: [{ side: 'l', text: '0' }, { at: g.mer, text: 'goal ' + x(g.mer), on: true }] }),
    pill(gap >= 0 ? 'good' : 'warn', x(Math.abs(gap)) + (gap >= 0 ? ' over goal' : ' under goal'))) : null;
  const enough = days.filter(d => ok(d.sales) || ok(d.spend)).length > 1;
  const plot = enough
    ? lineChart({
        series: [{ name: 'Sales', values: days.map(d => d.sales), lead: true }, { name: 'Ad spend', values: days.map(d => d.spend) }],
        labels: days.map(d => dayLabel(d.date)),
        note: data.note ? { index: days.findIndex(d => d.date === data.note.date), text: data.note.text } : null,
        windowLabel: 'Daily, ' + rangeWords(ctx, { from: days[0].date, to: days[days.length - 1].date }),
        format: v => money(v, { cur, compact: true }), endFormat: v => money(v, { cur }), height: 300,
        label: `Sales and ad spend by day, ${dayLabel(days[0].date)} to ${dayLabel(days[days.length - 1].date)}`,
        hover: i => { const d = days[i]; return [h('div', { class: 'lx-tip-h' }, dayLabel(d.date)), tipRow('lead', 'Sales', money(d.sales, { cur })), tipRow('slate', 'Ad spend', money(d.spend, { cur })),
          ok(d.sales) && d.spend > 0 ? tipRow('', 'MER', x(d.sales / d.spend)) : null]; },
      })
    : empty({ title: 'Not enough days yet', text: 'The chart draws once there are two days of numbers.' });
  const cap = h('div', { class: 'hm-chart-cap' }, h('span', { class: 'lx-small' }, 'Sales and ad spend by day'),
    h('div', { class: 'lx-legend' }, h('span', { class: 'lead' }, 'Sales'), h('span', null, 'Ad spend')));
  const s = sentence(data);
  return card({ title: 'Is the store making back its ad spend?', class: 'hm-merc' },
    h('div', { class: 'hm-mer-row' }, h('div', null, say, sub), gz),
    cap, plot,
    /* a line worked out from the numbers, not written by the AI: no AI badge; Ask why is the AI */
    s ? h('div', { class: 'hm-why' }, h('p', null, s), ctx.isClient ? null : askWhy(ctx, 'How is ' + ctx.brand.name + ' doing')) : null);
}

/* Pace to the month goal: sales added up day by day against the goal spread evenly over the month (the plan rule). */
function paceCard(data, ctx) {
  const p = data.plan, cur = data.currency;
  if (!p || !(p.month_sales > 0)) return null;
  const start = data.range.from.slice(0, 8) + '01';
  const dim = p.days_in_month || new Date(+start.slice(0, 4), +start.slice(5, 7), 0).getDate();
  const dates = Array.from({ length: dim }, (_, i) => addDays(start, i));
  const by = Object.fromEntries((data.days || []).map(d => [d.date, d.sales]));
  let run = 0, last = -1;
  const cum = dates.map((d, i) => { if (by[d] == null) return null; run += by[d]; last = i; return run; });
  if (last < 1) return null;
  const goal = dates.map((_, i) => p.month_sales * (i + 1) / dim);
  /* planned to date: the worker's plan.sales (the same figure the Sales tile shows) when it sends one */
  const soFar = cum[last], planned = ok(p.sales) && p.sales > 0 ? p.sales : goal[last], ends = soFar / (last + 1) * dim;
  const short = v => money(v, { cur, compact: true });
  const b = v => h('b', null, v);
  const ahead = soFar >= planned;
  const say = h('p', { class: 'hm-pace-say' }, 'Sales so far ', b(money(soFar, { cur })), ' against ', b(money(planned, { cur })), ' planned by ' + dayLabel(dates[last]) + '. ',
    'At this pace the month ends near ', b(money(Math.round(ends / 100) * 100, { cur })), ', goal ', b(money(p.month_sales, { cur })), '. ', ahead ? 'Ahead of pace.' : 'Behind pace.');
  const plot = lineChart({
    /* the sales figure sits by its last point (not at the right edge, where the goal line ends); the goal line names its own end */
    series: [{ name: 'Sales so far', values: cum, lead: true, end: false }, { name: 'Goal pace', values: goal, dashed: true, end: v => 'Goal ' + short(v) }],
    marks: [{ index: last, value: soFar, text: short(soFar) + ' by ' + dayLabel(dates[last]), dy: -14 }],
    labels: dates.map(dayLabel), windowLabel: `Added up by day, ${dayLabel(dates[0])} to ${dayLabel(dates[dim - 1])}`,
    format: short, endFormat: short, height: 260, fill: false,
    label: 'Sales added up by day against the month goal',
    hover: i => [h('div', { class: 'lx-tip-h' }, dayLabel(dates[i])), cum[i] != null ? tipRow('lead', 'Sales so far', money(cum[i], { cur })) : null, tipRow('dash', 'Goal pace', money(goal[i], { cur }))],
  });
  return card({ title: 'On pace for the month goal?', note: statusDot(ahead ? 'good' : 'warn', ahead ? 'Ahead' : 'Behind'),
    action: h('a', { href: ctx.href('month', 'pace') }, 'This month') },
    say, h('div', { class: 'hm-chart-cap' }, h('span', { class: 'lx-small' }, 'Triple Whale, whole store'), h('div', { class: 'lx-legend' }, h('span', { class: 'lead' }, 'Sales so far'), h('span', { class: 'dash' }, 'Goal pace'))), plot);
}

function comingCard(data, ctx) {
  const list = data.coming, today = data.today || iso(new Date());
  const soon = asDate(today).getTime() + 7 * 864e5;
  const body = !list ? h('p', { class: 'hm-quiet' }, 'The calendar could not be read.')
    : !list.length ? h('p', { class: 'hm-quiet' }, 'Nothing dated in the next few weeks.')
    : h('div', { class: 'hm-up' }, list.map((it, i) => h('div', null,
        dateBlock(it.date, { now: i === 0 && asDate(it.date).getTime() <= soon, month: it.date.slice(0, 7) !== today.slice(0, 7) }),
        h('span', { class: 't' }, h('b', null, it.title), it.sub ? h('span', null, it.sub) : null),
        it.status ? statusDot(it.tone, it.status) : null)));
  return card({ title: 'Coming up', flush: true, action: h('a', { href: ctx.href('calendar', 'index') }, 'All dates') }, body);
}

function grade(roas, goal) {
  if (!ok(roas) || !goal) return null;
  const r = roas / goal;
  return r >= 1 ? ['good', 'At goal'] : r >= 0.8 ? ['warn', 'Close'] : r >= 0.6 ? ['warn', 'Under'] : ['bad', 'Far under'];
}
function platformCard(data, ctx) {
  const list = data.platforms, g = data.goal || {}, t = data.totals || {}, cur = data.currency;
  const link = h('a', { href: ctx.href('platforms', 'side-by-side') }, 'Side by side');
  if (!list || !list.length) {
    return card({ title: 'By platform', action: link },
      empty({ title: list ? 'No ad platform has spent on these dates' : 'Platform numbers could not be read',
        text: !list ? 'Open Side by side for the full table.' : ctx.isClient ? 'Each ad platform shows here against the goal once it has spent.' : 'Connect Meta or Google in Brand settings and each one shows here against the goal.' }));
  }
  const rows = list.map(r => {
    const paidRow = r.spend > 0, roas = paidRow && ok(r.sales) ? r.sales / r.spend : null;
    /* one platform cannot reach the whole store goal by construction: grade it only against its own platform goal */
    const pg = g.platforms && g.platforms[r.id] > 0 ? g.platforms[r.id] : null, gr = pg ? grade(roas, pg) : null;
    return { ...r, paidRow, roas, grade: gr, fillTone: gr ? gr[0] : '' };
  });
  const mer = t.spend > 0 && ok(t.sales) ? t.sales / t.spend : null, mg = grade(mer, g.mer);
  const total = { total: true, spend: t.spend, sales: t.sales, roas: mer, paidRow: true, grade: mg && [mg[0] === 'bad' ? 'bad' : mg[0] === 'good' ? 'good' : 'warn', mg[1]], fillTone: '' };
  const bar = r => ok(r.roas) && g.mer ? h('span', { class: 'hm-g' + (r.total ? ' hm-total' : '') }, gauge({ value: r.roas, max: g.mer * 1.2, goal: g.mer, tone: r.fillTone, thin: true })) : '';
  const name = r => r.total ? 'Whole store' : platformChip(r.id);
  const spend = r => r.paidRow ? money(r.spend, { cur }) : h('span', { class: 'dim' }, 'no ad spend');
  const roasText = r => r.total ? (ok(r.roas) ? h('span', null, dl('MER', 'mer'), ' ' + x(r.roas)) : 'not tracked yet') : r.paidRow ? x(r.roas) : '';
  const stat = r => r.grade ? statusDot(r.grade[0], r.grade[1]) : '';
  const wide = h('div', { class: 'hm-wide' }, table({
    roomy: true, total,
    cols: [
      { key: 'id', label: 'Platform', class: 'name', render: name },
      { key: 'spend', label: 'Spend', num: true, render: spend },
      { key: 'sales', label: dl('Sales from its ads', 'sales_from_its_ads'), num: true, render: r => money(r.sales, { cur }) },
      { key: 'roas', label: h('span', null, dl('ROAS', 'roas'), ', Triple Whale last click'), num: true, class: 'strong', render: roasText },
      { key: 'bar', label: g.mer ? 'Against the store goal ' + x(g.mer) : '', width: 240, render: bar },
      { key: 'st', label: 'Status', width: 110, render: stat, title: 'A platform is graded only against its own platform goal; the whole store against the store goal' },
    ],
    rows,
  }));
  const cell = (label, v) => h('span', null, h('small', null, label), h('b', null, v));
  const narrow = h('div', { class: 'hm-plats' }, [...rows, total].map(r => h('div', { class: r.total ? 'tot' : '' },
    h('div', { class: 'top' }, r.total ? h('b', null, 'Whole store') : platformChip(r.id), stat(r) || null),
    h('div', { class: 'nums' }, cell('Spend', spend(r)), cell(r.total ? 'Sales' : 'Sales from its ads', money(r.sales, { cur })), cell(r.total ? 'MER' : 'ROAS', r.total ? x(r.roas) : r.paidRow ? x(r.roas) : h('span', { class: 'dim' }, 'none'))),
    bar(r) ? h('div', { class: r.total ? 'hm-total' : '' }, gauge({ value: r.roas, max: g.mer * 1.2, goal: g.mer, tone: r.fillTone, thin: true })) : null)));
  return card({ title: 'By platform', note: rangeWords(ctx, data.range), flush: true, action: link, class: 'hm-byp' },
    h('div', { class: 'hm-src' }, sourceLine(null, 'Spend from each platform, sales credited by Triple Whale, last click')), wide, narrow);
}

/* ---------- best ads (read after the page draws) ---------- */
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/></svg>';
const PIC = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M4 16l4.5-4.5 4 4 2.5-2.5L20 17"/><circle cx="15.5" cy="9.5" r="1.2"/></svg>';
/* Sample mode only: neutral placeholder art per ad (a soft two tone tile with a simple shape), so the cards can be
   judged in a review. Never used for a real ad: a real ad with no cover shows the plain media icon. */
function sampleArt(seed) {
  let n = 0; for (const c of String(seed)) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  const hue = [24, 32, 38, 200, 150, 12][n % 6], a = `hsl(${hue} 30% 86%)`, b = `hsl(${hue} 26% 70%)`, k = `hsl(${hue} 22% 52%)`;
  const shape = n % 3 === 0 ? `<circle cx="120" cy="128" r="56" fill="${b}"/><rect x="40" y="196" width="160" height="12" rx="6" fill="${k}" opacity=".5"/>`
    : n % 3 === 1 ? `<rect x="58" y="70" width="124" height="124" rx="18" fill="${b}"/><circle cx="160" cy="92" r="16" fill="${k}" opacity=".6"/>`
    : `<path d="M30 200 L100 110 L140 160 L170 130 L214 200 Z" fill="${b}"/><circle cx="74" cy="76" r="18" fill="${k}" opacity=".55"/>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><rect width="240" height="240" fill="${a}"/>${shape}</svg>`);
}
async function readAds(ctx, range) {
  if (ctx.sample) {
    const [f, x2] = await Promise.all([fixture('meta/_sample/top-ads.json'), fixture('_sample/addetail.json').catch(() => null)]);
    const calls = (x2 && x2.calls) || {};
    return f ? { ...f, calls: Object.fromEntries(Object.entries(calls).map(([id, c]) => [id, { call: c.call, kind: c.tone === 'bad' ? 'cut' : '' }])),
      ads: (f.ads || []).map(a => ({ ...a, thumb: a.thumb || (a.art ? null : sampleArt(a.id)) })), window: { from: range.from, to: range.to, label: rangeWords(ctx, range) } } : null;
  }
  const act = encodeURIComponent(ctx.brand.id), w = { from: ctx.range.from, to: ctx.range.to, label: rangeWords(ctx) };
  const r = await ctx.api(`/api/hub/creative?act=${act}&from=${w.from}&to=${w.to}&model=lastPlatformClick`, { worker: 'profit' });
  const g = r.goals || {};
  const ads = (r.ads || []).map(a => ({ id: a.id, name: a.name, video: a.media_type === 'video', media_type: a.media_type || null, lead: a.obj === 'leads', campaign: a.campaign || null,
    adset: a.adset && a.adset.name || null, adset_id: a.adset && a.adset.id || null,
    set: a.adset ? { name: a.adset.name, spend: a.adset.spend, purchases: a.adset.purchases, roas: a.adset.roas, cpa: a.adset.cpa } : null,
    spend: a.spend, revenue: a.revenue, purchases: a.purchases, roas: a.roas, cpa: a.cpa, age: a.age ?? null, ctr: a.ctr ?? null, cpm: a.cpm ?? null,
    frequency: a.frequency ?? null, impressions: a.impressions ?? null, clicks: a.clicks ?? null, fc_rev: a.fc_rev ?? null, thumb: null }));
  return { window: w, currency: r.currency || 'USD', goals: { roas: g.roas || null, cpa: g.cpa || null }, ads };
}
/* the call as a short pill: "Keep: carries the set" reads "Keep"; its tone from the word */
function callPill(c) {
  if (!c || !c.call) return null;
  const word = String(c.call).split(':')[0].trim(), w = word.toLowerCase();
  const tone = /^(scale|keep|raise)/.test(w) ? 'good' : /^(cut|pause|off)/.test(w) || c.kind === 'cut' ? 'bad' : /^(trim|refresh|lower)/.test(w) ? 'warn' : '';
  return h('span', { class: 'c ' + tone, title: 'Locus call: ' + c.call }, word);
}
function bestAdsCard(ctx, range, adCalls) {
  const body = h('div', { class: 'hm-ads' }, h('p', { class: 'hm-quiet', style: { padding: '0' } }, 'Reading the ads.'));
  const src = h('div', { class: 'hm-src' }, sourceLine(rangeWords(ctx, range), 'Sales and ROAS Triple Whale last click, spend from Meta'));
  const box = card({ title: 'Best ads', note: 'most sales on Meta', flush: true, action: h('a', { href: ctx.href('meta', 'top-ads') }, 'All ads') }, src, body);
  readAds(ctx, range).then(async d => {
    const all = (d && d.ads) || [];
    const sales = all.filter(a => !a.lead && a.spend > 0);
    let top = sales.filter(a => a.purchases >= 3).sort((p, q) => (q.revenue || 0) - (p.revenue || 0)).slice(0, 4);
    if (top.length < 4) top = top.concat(sales.filter(a => !top.includes(a)).sort((p, q) => (q.spend || 0) - (p.spend || 0)).slice(0, 4 - top.length));
    if (!top.length) { body.replaceChildren(h('p', { class: 'hm-quiet', style: { padding: '0' } }, 'No Meta ad has spent on these dates.')); return; }
    if (!ctx.sample) {
      const ids = top.map(a => a.id).filter(id => /^\d{5,25}$/.test(String(id)));
      if (ids.length) {
        const pics = await soft(ctx.api(`/api/ad-creatives?act=${encodeURIComponent(ctx.brand.id)}&ads=${ids.join(',')}`, { worker: 'ah' }));
        const as = (pics && pics.assets) || {};
        for (const a of top) { const p = as[a.id]; if (p) a.thumb = p.thumb || p.image || p.cover || null; }
      }
    }
    const cur = d.currency, g = d.goals || {}, calls = ctx.isClient ? {} : (ctx.sample ? d.calls : adCalls) || {};
    const one = a => {
      const media = h('span', { class: 'hm-ad-m' }, svgNode(a.video ? PLAY : PIC));
      if (a.thumb) { const img = h('img', { src: a.thumb, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' }); img.addEventListener('error', () => img.remove(), { once: true }); media.prepend(img); }
      /* sample mode: the same stand-in drawing the Meta Best ads card shows for this ad (production/_ui.js picture) */
      else if (a.art) { pictureCss(); media.prepend(picture({ art: a.art, video: false, ratio: 'auto' })); media.classList.add('art'); }
      const under = g.roas && ok(a.roas) && a.roas < g.roas * 0.8;
      const open = () => openAdDetail(ctx, { ...a, media_type: a.media_type || (a.video ? 'video' : 'image') }, { window: d.window, goals: d.goals, currency: cur,
        adsetAds: a.adset ? all.filter(o => o.adset === a.adset) : undefined });
      return h('button', { type: 'button', class: 'hm-ad', onclick: open, 'aria-label': 'Open ' + (a.name || 'ad') },
        media,
        h('span', { class: 'hm-ad-b' }, h('span', { class: 'hm-ad-t' }, h('span', { class: 'k' }, a.video ? 'Video' : 'Image'), callPill(calls[a.id])), h('h4', { title: a.name || '' }, a.name || 'Unnamed ad'), h('span', { class: 'w', title: a.adset || '' }, a.adset ? 'Ad set: ' + a.adset : 'Meta'),
          h('span', { class: 'hm-ad-n' },
            h('span', null, h('small', null, 'Spend'), h('b', null, money(Math.round(a.spend || 0), { cur }))),
            h('span', null, h('small', null, 'Sales'), h('b', null, ok(a.revenue) ? money(Math.round(a.revenue), { cur }) : 'not tracked')),
            h('span', null, h('small', null, 'ROAS'), h('b', { class: under ? 'bad' : '' }, ok(a.roas) ? x(a.roas) : 'none')))));
    };
    body.replaceChildren(...top.map(one));
  }).catch(e => { if (e && e.name === 'AbortError') return; body.replaceChildren(h('p', { class: 'hm-quiet', style: { padding: '0' } }, 'The ads could not be read just now.')); });
  return box;
}

/* ---------- what changed (read after the page draws) ---------- */
const MATTERS = new Set(['budget', 'new_campaign', 'campaign_paused', 'ad_paused', 'campaign_relaunched', 'bid_strategy', 'targeting', 'new_creative', 'new_adset', 'manual']);
async function readChanges(ctx) {
  if (ctx.sample) { const f = await fixture('meta/_sample/changes.json'); return ((f && f.rows) || []).filter(r => r.matters); }
  const act = encodeURIComponent(ctx.brand.id), q = `act=${act}&from=${ctx.range.from}&to=${addDays(ctx.range.to, 1)}T23:59:59`;
  if (ctx.isClient) {
    const r = await ctx.api(`/api/ad-updates?${q}`, { worker: 'ah' });
    return (r.changes || []).map(c => ({ at: c.at, what: c.summary || 'Change', name: c.name || '', why: c.why || '', who: null }));
  }
  const r = await ctx.api(`/api/activities?${q}&limit=300`, { worker: 'ah' });
  return (r.rows || []).filter(a => a.confirmed !== -1 && (a.manual || MATTERS.has(a.category)))
    .map(a => ({ at: a.event_time, what: a.summary || a.translated || 'Change', name: a.object_name || '', why: a.reason || a.client_why || '', who: a.actor || null }));
}
function changesCard(ctx, range) {
  const body = h('div', { class: 'hm-ch' }, h('p', { class: 'hm-quiet', style: { padding: '8px 0' } }, 'Reading the changes.'));
  const box = card({ title: 'What changed', note: 'on Meta, ' + rangeWords(ctx, range), flush: true, action: h('a', { href: ctx.href('meta', 'changes') }, 'All changes') }, body);
  readChanges(ctx).then(rows => {
    const list = rows.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 5);
    if (!list.length) { body.replaceChildren(h('p', { class: 'hm-quiet', style: { padding: '8px 0' } }, 'Nothing that matters changed on these dates.')); return; }
    const who = w => (w ? String(w).split('@')[0].replace(/^\w/, c => c.toUpperCase()) : '');
    body.replaceChildren(...list.map(c => h('div', null, h('span', { class: 'd' }, dayLabel(String(c.at).slice(0, 10))),
      h('span', { class: 't' }, h('b', null, c.what + (c.name ? ': ' + c.name : '')), c.why || c.who ? h('span', null, [c.why, who(c.who) && 'by ' + who(c.who)].filter(Boolean).join(' · ')) : null))));
  }).catch(e => { if (e && e.name === 'AbortError') return; body.replaceChildren(h('p', { class: 'hm-quiet', style: { padding: '8px 0' } }, 'The changes could not be read just now.')); });
  return box;
}

/* ---------- the page ---------- */
const WORDS = { today: 'today?', yesterday: 'yesterday?', month: 'this month?', '7d': 'in the last 7 days?', '14d': 'in the last 14 days?', '30d': 'in the last 30 days?', '90d': 'in the last 90 days?', 'last-month': 'last month?', custom: 'on these dates?' };

export default {
  /* the plain question, drawn by the shell above the tabs */
  title: ctx => (ctx.brand ? ['How is ' + ctx.brand.name + ' doing ', em(WORDS[ctx.range.preset] || WORDS.custom)] : 'Home'),
  eyebrow: 'Home',
  /* one "updated" stamp on Home: the one with the refresh button beside Your numbers (the shell leaves its copy out) */
  stamp: false,

  async load(ctx) {
    if (!ctx.brand) return null;
    /* act is the brand id from the brands endpoint (brand_...). The dates come from the page head. */
    const id = encodeURIComponent(ctx.brand.id), win = { from: ctx.range.from, to: ctx.range.to, preset: ctx.range.preset }, sig = { signal: ctx.signal };
    const pw = prevWindow(win), isClient = ctx.isClient;
    const goal = async name => { if (isClient) return null; const v = +(await ctx.setting('brand:' + ctx.brand.id + '.' + name, null)); return v > 0 ? v : null; };
    const plat = p => soft(ctx.api(`/api/hub/paid?platform=${p}&act=${id}&from=${win.from}&to=${win.to}&cmp=prev&model=lastPlatformClick`, sig)).then(feedOf);
    const want = new Set(feedsFor(savedTiles(ctx)));
    const [cl, prevCl, paid, ov, buy, season, roas, cpa, prefs, meta, google, tiktok] = await Promise.all([
      ctx.api(`/api/client?act=${id}&from=${win.from}&to=${win.to}`, sig),
      soft(ctx.api(`/api/client?act=${id}&from=${pw.from}&to=${pw.to}`, sig)),
      soft(ctx.api(`/api/hub/paid?platform=all&act=${id}&from=${win.from}&to=${win.to}&cmp=prev`, sig)),
      soft(ctx.api('/api/overview?days=7&cmp=none&series=0', sig)),
      isClient ? null : soft(ctx.api(`/api/buyer-list?act=${id}`, { worker: 'ah', ...sig })),
      soft(ctx.api(`/api/season?act=${id}`, sig)),
      goal('target_roas'), goal('target_cpa'),
      soft(ctx.api('/api/me/prefs', { worker: 'ah', ...sig })),
      want.has('meta') ? plat('meta') : undefined, want.has('google') ? plat('google') : undefined, want.has('tiktok') ? plat('tiktok') : undefined,
    ]);
    /* a set saved on the server (another device) wins over this device's copy, once the server keeps it */
    const server = prefs && prefs.prefs && Array.isArray(prefs.prefs.home_tiles) && prefs.prefs.home_tiles.length ? cleanTiles(prefs.prefs.home_tiles) : null;
    const feeds = { meta, google, tiktok };
    if (server && server.join() !== savedTiles(ctx).join()) {
      await ctx.saveSetting('home.tiles', server);
      for (const k of feedsFor(server)) if (k !== 'store' && feeds[k] === undefined) feeds[k] = await plat(k);
    }
    return shape({ win, cl, prevCl, paid, ov, buy, season, goals: { roas, cpa }, isClient, feeds, prefs });
  },

  render(el, data, ctx) {
    styles();
    if (!ctx.brand) return put(el, empty({ title: 'Pick a brand', text: 'Home shows one brand at a time. Choose one from the switcher at the top.' }));
    if (!data) return put(el, empty({ title: 'No numbers yet', text: 'This brand has nothing to show for these dates yet.' }));
    const t = data.totals || {}, g = data.goal || {}, mer = t.spend > 0 && ok(t.sales) ? t.sales / t.spend : null;
    const team = !ctx.isClient;
    const host = { at: ctx.sample ? Date.now() - 4 * 60e3 : Date.now() };
    const win = rangeWords(ctx, data.range);
    let waiting = null;
    ctx.askWindow = win;
    ctx.askContext = `${ctx.brand.name} Home, ${win}: sales ${money(t.sales, { cur: data.currency })}, ad spend ${money(t.spend, { cur: data.currency })}, MER ${mer != null ? x(mer) : 'not tracked'}`
      + (g.mer ? ` against a ${x(g.mer)} goal.` : '. No goal set.') + (data.plan && data.plan.month_sales ? ` Month sales goal ${money(data.plan.month_sales, { cur: data.currency })}.` : '');
    const noSource = !data.source ? empty({
      title: 'No sales source connected',
      text: ctx.isClient ? 'This page fills in with sales, new customers and profit once the store is connected.' : 'Connect the store and this page fills in with sales, new customers and profit.',
      action: ctx.isClient ? null : button('Open integrations', { href: ctx.href('brand-settings', 'integrations'), icon: 'arrow' }) }) : null;
    put(el, ...[
      helpBar([
        { title: 'What it is for', text: 'How ' + ctx.brand.name + ' is doing on the dates at the top of the page, then what waits on a yes. The tiles at the top are yours: Edit tiles adds, takes off and reorders them, and only you see your set.' },
        { title: 'Where the numbers come from', text: 'Sales are store sales less tax, from Triple Whale. MER is whole store sales over all ad spend. Each platform\'s sales are the ones Triple Whale credits to it, last click; spend and delivery are the platform\'s own. Every tile says its dates and its source, and compares with the same number of days just before. Hover or tap any dotted label for its meaning.' },
        { title: 'Plan to date', text: 'On This month the tiles compare with the month plan split evenly over the days so far. On any other dates there is no plan comparison.' },
      ]),
      noSource || tilesBlock(data, ctx, host),
      data.source ? merCard(data, ctx) : null,
      team ? (waiting = waitingYes(ctx, { brand: ctx.brand, calls: data.suggestions ? data.suggestions.meta : null, google: data.suggestions ? data.suggestions.google : null,
        onCount: n => { ctx.askContext = ctx.askContext.replace(/ \d+ things? wait.*$/, '') + ` ${n} thing${n === 1 ? '' : 's'} wait on a yes.`; } })) : homeNotices(ctx),
      team ? liveNote(ctx) : null,
      data.source ? paceCard(data, ctx) : null,
      data.source || (data.platforms && data.platforms.length) ? platformCard(data, ctx) : null,
      bestAdsCard(ctx, data.range, data.ad_calls),
      h('div', { class: 'hm-pair' }, changesCard(ctx, data.range), comingCard(data, ctx)),
    ].filter(Boolean));
    void waiting;
  },
};
export { CATALOG };
