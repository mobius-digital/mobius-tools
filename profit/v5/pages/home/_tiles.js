/* Home tiles: the numbers at the top of the brand Home, chosen by each person (like Triple Whale's pinned tiles).

   A default set (Sales, Ad spend, MER, New customers, Cost per new customer, Profit after ads), and a catalog grouped
   by where the number comes from (Store, Meta, Google, TikTok, Email and SMS, Amazon). "Edit tiles" adds, removes and
   reorders them. Every tile says its label, its value with a unit, the change against the same number of days just
   before, its window and source ("Nov 1 to 22 · Triple Whale"), and an orange sparkline with its scale.

   Saved per person:
     - in this person's own store on this device (ctx.saveSetting('home.tiles'), data.js): the fast first paint
     - and on the server: account-health GET/PUT /api/me/prefs keeps `home_tiles` (prefs.js clean, the engine's
       orgs/service.js the same; the field is always there, [] when unset). Home reads the prefs once on load (team and
       client); a non-empty home_tiles wins over this device's copy, and every save sends { home_tiles } while the
       server carries the field (tilePrefsSupported).

   The numbers come from one bundle the Home page builds (index.js feeds()):
     days    the store by day, the worker's own names: sales, spend, orders, new_orders, new_rev, ret_rev, gross_profit, cm, email_rev
     totals  the same names over the window; prev the same over the days just before
     meta / google / tiktok   { series: [{ date, spend, revenue, purchases, impressions, clicks }], prev: { same, summed } }
     amazon  { spend, revenue, prev_spend, prev_revenue }
   A number that is missing reads "not tracked yet", never zero. */

import { h, kpi, delta, statusDot, button, sheet, toast, addStyles, money, x, pct, platformChip, svgNode } from '../../kit.js';
import { dl, rangeWords } from './_biz.js';

export const DEFAULT_TILES = ['sales', 'spend', 'mer', 'new_customers', 'cac', 'profit'];
export const MAX_TILES = 12;
const KEY = 'home.tiles';

const ok = n => n != null && isFinite(n);
const TW = 'Triple Whale', TWLC = 'Triple Whale, last click';

export const GROUPS = [
  { id: 'store', label: 'Store', note: 'The whole store, from Shopify through Triple Whale' },
  { id: 'meta', label: 'Meta', chip: 'meta', note: 'Spend and delivery from Meta, sales from Triple Whale last click' },
  { id: 'google', label: 'Google', chip: 'google', note: 'Spend and delivery from Google through Triple Whale, sales from Triple Whale last click' },
  { id: 'tiktok', label: 'TikTok', chip: 'tiktok', note: 'Spend and delivery from TikTok through Triple Whale, sales from Triple Whale last click' },
  { id: 'email', label: 'Email and SMS', chip: 'email', note: 'Klaviyo placed orders, as Triple Whale carries them' },
  { id: 'amazon', label: 'Amazon', chip: 'amazon', note: 'Amazon ads, as Triple Whale carries them' },
];

/* sum: one field added up. ratio: [top, bottom, times]. unit: money | x | pct | num. lower: a rise is bad. plain: no judgment. */
const T = (id, group, label, o) => ({ id, group, label, ...o });
export const CATALOG = [
  T('sales', 'store', 'Sales', { sum: 'sales', unit: 'money', src: TW, link: ['month', 'pace'] }),
  T('spend', 'store', 'Ad spend', { sum: 'spend', unit: 'money', plain: true, src: 'All ad platforms', link: ['platforms', 'side-by-side'] }),
  T('mer', 'store', 'MER', { def: 'mer', ratio: ['sales', 'spend'], unit: 'x', src: TW, link: ['month', 'pace'] }),
  T('orders', 'store', 'Orders', { sum: 'orders', unit: 'num', src: TW, link: ['sales', null] }),
  T('aov', 'store', 'AOV', { def: 'aov', ratio: ['sales', 'orders'], unit: 'money', src: TW, link: ['sales', null] }),
  T('new_customers', 'store', 'New customers', { sum: 'new_orders', unit: 'num', src: TW, link: ['customers', 'snapshot'] }),
  T('cac', 'store', 'Cost per new customer', { def: 'new_customer_cost', ratio: ['spend', 'new_orders'], unit: 'money', lower: true, src: TW, link: ['customers', 'snapshot'] }),
  T('new_rev', 'store', 'New customer sales', { sum: 'new_rev', unit: 'money', src: TW, link: ['customers', 'snapshot'] }),
  T('amer', 'store', 'New customer ROAS', { def: 'new_customer_roas', ratio: ['new_rev', 'spend'], unit: 'x', src: TW, link: ['customers', 'snapshot'] }),
  T('ret_rev', 'store', 'Returning customer sales', { sum: 'ret_rev', unit: 'money', src: TW, link: ['customers', 'snapshot'] }),
  T('profit', 'store', 'Profit after ads', { def: 'profit_after_ads', sum: 'cm', unit: 'money', src: TW + ' costs', costs: true, link: ['month', 'profit'] }),
  T('gross_profit', 'store', 'Left before ads', { def: 'left_before_ads', sum: 'gross_profit', unit: 'money', src: TW + ' costs', costs: true, link: ['month', 'profit'] }),

  T('meta_spend', 'meta', 'Meta spend', { sum: 'spend', unit: 'money', plain: true, src: 'Meta', link: ['meta', 'overview'] }),
  T('meta_sales', 'meta', 'Sales from Meta ads', { sum: 'revenue', unit: 'money', src: TWLC, link: ['meta', 'overview'] }),
  T('meta_roas', 'meta', 'Meta ROAS', { def: 'roas', ratio: ['revenue', 'spend'], unit: 'x', src: TWLC, link: ['meta', 'overview'] }),
  T('meta_cpa', 'meta', 'Meta cost per sale', { def: 'cpa', ratio: ['spend', 'purchases'], unit: 'money', lower: true, src: TWLC, link: ['meta', 'top-ads'] }),
  T('meta_purchases', 'meta', 'Meta purchases', { sum: 'purchases', unit: 'num', src: TWLC, link: ['meta', 'top-ads'] }),
  T('meta_ctr', 'meta', 'Meta CTR', { def: 'ctr', ratio: ['clicks', 'impressions'], unit: 'pct', src: 'Meta', link: ['meta', 'top-ads'] }),
  T('meta_cpm', 'meta', 'Meta CPM', { def: 'cpm', ratio: ['spend', 'impressions', 1000], unit: 'money', lower: true, src: 'Meta', link: ['meta', 'top-ads'] }),
  T('meta_cpc', 'meta', 'Meta CPC', { def: 'cpc', ratio: ['spend', 'clicks'], unit: 'money', lower: true, src: 'Meta', link: ['meta', 'top-ads'] }),

  T('google_spend', 'google', 'Google spend', { sum: 'spend', unit: 'money', plain: true, src: 'Google', link: ['google', null] }),
  T('google_sales', 'google', 'Sales from Google ads', { sum: 'revenue', unit: 'money', src: TWLC, link: ['google', null] }),
  T('google_roas', 'google', 'Google ROAS', { def: 'roas', ratio: ['revenue', 'spend'], unit: 'x', src: TWLC, link: ['google', null] }),
  T('google_cpa', 'google', 'Google cost per sale', { def: 'cpa', ratio: ['spend', 'purchases'], unit: 'money', lower: true, src: TWLC, link: ['google', null] }),
  T('google_ctr', 'google', 'Google CTR', { def: 'ctr', ratio: ['clicks', 'impressions'], unit: 'pct', src: 'Google', link: ['google', null] }),
  T('google_cpc', 'google', 'Google CPC', { def: 'cpc', ratio: ['spend', 'clicks'], unit: 'money', lower: true, src: 'Google', link: ['google', null] }),

  T('tiktok_spend', 'tiktok', 'TikTok spend', { sum: 'spend', unit: 'money', plain: true, src: 'TikTok', link: ['tiktok', null] }),
  T('tiktok_sales', 'tiktok', 'Sales from TikTok ads', { sum: 'revenue', unit: 'money', src: TWLC, link: ['tiktok', null] }),
  T('tiktok_roas', 'tiktok', 'TikTok ROAS', { def: 'roas', ratio: ['revenue', 'spend'], unit: 'x', src: TWLC, link: ['tiktok', null] }),
  T('tiktok_cpa', 'tiktok', 'TikTok cost per sale', { def: 'cpa', ratio: ['spend', 'purchases'], unit: 'money', lower: true, src: TWLC, link: ['tiktok', null] }),
  T('tiktok_ctr', 'tiktok', 'TikTok CTR', { def: 'ctr', ratio: ['clicks', 'impressions'], unit: 'pct', src: 'TikTok', link: ['tiktok', null] }),
  T('tiktok_cpm', 'tiktok', 'TikTok CPM', { def: 'cpm', ratio: ['spend', 'impressions', 1000], unit: 'money', lower: true, src: 'TikTok', link: ['tiktok', null] }),

  T('email_sales', 'email', 'Email and SMS sales', { sum: 'email_rev', unit: 'money', src: 'Klaviyo, through ' + TW, store: true, link: ['email', null] }),
  T('email_share', 'email', 'Email and SMS share of sales', { ratio: ['email_rev', 'sales'], unit: 'pct', plain: true, src: 'Klaviyo, through ' + TW, store: true, link: ['email', null] }),

  T('amazon_spend', 'amazon', 'Amazon ads spend', { sum: 'spend', unit: 'money', plain: true, src: 'Amazon, through ' + TW, flat: true, link: ['amazon', null] }),
  T('amazon_sales', 'amazon', 'Amazon ads sales', { sum: 'revenue', unit: 'money', src: 'Amazon, through ' + TW, flat: true, link: ['amazon', null] }),
  T('amazon_roas', 'amazon', 'Amazon ads ROAS', { def: 'roas', ratio: ['revenue', 'spend'], unit: 'x', src: 'Amazon, through ' + TW, flat: true, link: ['amazon', null] }),
];
const BY_ID = Object.fromEntries(CATALOG.map(t => [t.id, t]));
export const tileOf = id => BY_ID[id] || null;

/** Which data feeds a list of tiles needs: 'store' always; 'meta' | 'google' | 'tiktok' when one of their tiles is on. */
export function feedsFor(ids) {
  const out = new Set(['store']);
  for (const id of ids || []) { const t = BY_ID[id]; if (t && ['meta', 'google', 'tiktok'].includes(t.group)) out.add(t.group); }
  return [...out];
}

/** The tiles this person keeps: a clean list of known ids, the default when nothing is saved. */
export function cleanTiles(list) {
  const ids = Array.isArray(list) ? [...new Set(list.filter(id => BY_ID[id]))].slice(0, MAX_TILES) : null;
  return ids && ids.length ? ids : DEFAULT_TILES.slice();
}
export const savedTiles = ctx => cleanTiles(ctx.settingNow(KEY, null));
/** true when the server's prefs row keeps home tiles (the field is there, even empty). */
export const tilePrefsSupported = prefs => !!(prefs && typeof prefs === 'object' && 'home_tiles' in prefs);

export async function saveTiles(ctx, ids, { server = false } = {}) {
  const clean = cleanTiles(ids);
  await ctx.saveSetting(KEY, clean);
  if (server && !ctx.sample) {
    try { await ctx.api('/api/me/prefs', { worker: 'ah', method: 'PUT', body: { home_tiles: clean } }); }
    catch { toast('Saved on this device. The server copy did not save.', { tone: 'bad', ms: 4000 }); }
  }
  return clean;
}

/* ---------- the numbers ---------- */
function valueOf(t, o) {
  if (!o) return null;
  if (t.sum) return ok(o[t.sum]) ? o[t.sum] : null;
  const [a, b, k = 1] = t.ratio;
  return ok(o[a]) && o[b] > 0 ? o[a] / o[b] * k : null;
}
function sumSeries(series) {
  const out = {}; let any = false;
  for (const r of series || []) for (const k of ['spend', 'revenue', 'purchases', 'impressions', 'clicks']) if (ok(r[k])) { out[k] = (out[k] || 0) + r[k]; any = true; }
  return any ? out : null;
}
/** One tile's numbers: { v, prev, spark, labels, missing } from the bundle F. */
export function numbersOf(t, F) {
  if (t.group === 'store' || t.store) {
    if (t.costs && F.costsBroken) return { missing: 'withheld', note: 'the cost numbers need a check first' };
    const days = F.days || [];
    return { v: valueOf(t, F.totals), prev: valueOf(t, F.prev), spark: days.map(d => valueOf(t, d)), labels: days.map(d => d.date) };
  }
  if (t.flat) {
    const a = F.amazon;
    if (!a || !(a.spend > 0 || a.revenue > 0)) return { missing: F.amazon === undefined ? 'unread' : 'none' };
    return { v: valueOf(t, a), prev: valueOf(t, { spend: a.prev_spend, revenue: a.prev_revenue }) };
  }
  const f = F[t.group];
  if (f === undefined) return { missing: 'unread' };
  if (!f || !(f.series || []).some(r => r.spend > 0)) return { missing: 'none' };
  const tot = sumSeries(f.series);
  return { v: valueOf(t, tot), prev: valueOf(t, f.prev), spark: f.series.map(r => valueOf(t, r)), labels: f.series.map(r => r.date), pending: f.pending };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayWord = d => { const [, m, dd] = String(d).split('-').map(Number); return MON[m - 1] + ' ' + dd; };
const fmt = (unit, cur) => v => !ok(v) ? 'not tracked yet' : unit === 'money' ? money(Math.abs(v) >= 100 ? Math.round(v) : v, { cur }) : unit === 'x' ? x(v) : unit === 'pct' ? pct(v, { digits: Math.abs(v) < 0.1 ? 2 : 1 }) : Math.round(v).toLocaleString('en-US');

/** One tile, drawn with the kit kpi. extra(t) may give a line for the plan or the goal. */
export function tileNode(t, F, ctx, { extra } = {}) {
  const n = numbersOf(t, F), f = fmt(t.unit, F.cur), group = GROUPS.find(g => g.id === t.group);
  const label = h('span', { class: 'hm-tl' }, t.def ? dl(t.label, t.def) : t.label);
  const win = rangeWords(ctx, F.range);
  const href = t.link ? ctx.href(t.link[0], t.link[1]) : null;
  if (n.missing) {
    const words = n.missing === 'withheld' ? 'withheld' : n.missing === 'none' ? 'No spend' : 'Not read';
    const sub = n.missing === 'withheld' ? n.note : n.missing === 'none' ? `No ${group.label} spend on these dates` : `${group.label} could not be read just now`;
    return kpi({ label, value: h('span', { class: 'hm-words' }, words), sub, window: win, source: t.src, href });
  }
  const dlt = ok(n.v) && n.prev > 0 && ok(n.prev)
    ? delta(n.v / n.prev - 1, t.plain ? { plain: true } : (t.lower ? n.v > n.prev : n.v < n.prev) ? { bad: true } : {})
    : null;
  const vsWords = dlt && F.prevRange ? h('span', { class: 'hm-vs' }, ' vs ' + rangeWords(ctx, F.prevRange)) : null;
  const more = extra ? extra(t, n) : null;
  return kpi({
    label, value: ok(n.v) ? f(n.v) : h('span', { class: 'hm-words' }, 'not tracked yet'),
    delta: dlt, sub: (vsWords || more) ? [vsWords, more ? h('span', { class: 'hm-more' }, more) : null].filter(Boolean) : null,
    window: win, source: t.src + (n.pending ? ', today still landing' : ''),
    spark: n.spark && n.spark.filter(ok).length > 1 ? n.spark : null, sparkLabels: n.labels ? n.labels.map(dayWord) : null, sparkFormat: f,
    href,
  });
}

const CSS = `
/* the tile look itself is the kit's (tiles() / .lx-tiles in app.css); only Home's own extras here */
.hm-tiles .hm-more{flex-basis:100%}
.hm-tiles .hm-words{font-size:var(--num-m,18px);font-weight:500;letter-spacing:-.01em;color:var(--muted)}
.hm-ed{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:24px;min-width:0}
.hm-ed h4{margin:0 0 8px;font-size:var(--fs-card,14px);font-weight:600}
.hm-ed .hint{margin:0 0 12px;font-size:var(--fs-small,12.5px);color:var(--muted)}
.hm-on{display:grid;gap:6px;margin:0;padding:0;list-style:none}
.hm-on li{display:flex;align-items:center;gap:8px;min-height:44px;padding:4px 6px 4px 12px;border-radius:var(--r-btn,10px);background:var(--bg-sunk)}
.hm-on li .nm{flex:1;min-width:0;font-size:13.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hm-on li .gp{font-size:12px;color:var(--muted);white-space:nowrap}
.hm-on .lx-btn.icon{width:32px;height:32px;padding:0;justify-content:center}
.hm-cat{display:grid;gap:16px}
.hm-cat section{display:grid;gap:6px}
.hm-cat .gh{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}
.hm-cat .gh small{font-weight:400;color:var(--muted);font-size:12px}
.hm-cat .row{display:flex;align-items:center;gap:10px;min-height:40px;padding:2px 4px 2px 10px;border-radius:var(--r-btn,10px)}
.hm-cat .row:hover{background:var(--row-hover)}
.hm-cat .row .nm{flex:1;min-width:0;font-size:13.5px}
.hm-cat .row .on{font-size:12px;color:var(--muted)}
.hm-edf{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}
.hm-edf .sp{flex:1}
.lx-sheet.hm-edit{width:min(860px,100%)}
@media (max-width:759px){.hm-ed{grid-template-columns:minmax(0,1fr);gap:20px}}`;
export const tileStyles = () => addStyles('hm-tiles-css', CSS);

const UP = '<svg class="lx-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg>';
const DOWN = '<svg class="lx-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg>';
const X = '<svg class="lx-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
const iconBtn = (svg, aria, onclick, disabled) => h('button', { type: 'button', class: 'lx-btn ghost icon', 'aria-label': aria, title: aria, disabled, onclick }, svgNode(svg));

/** The "Edit tiles" sheet. onSave(ids) is called with the new list. */
export function editTiles(ctx, current, onSave) {
  let ids = cleanTiles(current);
  const onList = h('ol', { class: 'hm-on' }), cat = h('div', { class: 'hm-cat' }), count = h('span', { class: 'hint' });
  const groupLabel = id => (GROUPS.find(g => g.id === BY_ID[id].group) || {}).label;
  const paint = () => {
    onList.replaceChildren(...ids.map((id, i) => h('li', null,
      h('span', { class: 'nm', title: BY_ID[id].label }, BY_ID[id].label), h('span', { class: 'gp' }, groupLabel(id)),
      iconBtn(UP, 'Move ' + BY_ID[id].label + ' up', () => { [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; paint(); }, i === 0),
      iconBtn(DOWN, 'Move ' + BY_ID[id].label + ' down', () => { [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; paint(); }, i === ids.length - 1),
      iconBtn(X, 'Take ' + BY_ID[id].label + ' off Home', () => { ids = ids.filter(k => k !== id); paint(); }, ids.length <= 1))));
    count.textContent = `${ids.length} of ${MAX_TILES} at most. The order here is the order on Home.`;
    cat.replaceChildren(...GROUPS.map(g => h('section', null,
      h('div', { class: 'gh' }, g.chip ? platformChip(g.chip) : h('span', null, g.label), h('small', null, g.note)),
      ...CATALOG.filter(t => t.group === g.id).map(t => {
        const on = ids.includes(t.id);
        return h('div', { class: 'row' }, h('span', { class: 'nm' }, t.label),
          on ? h('span', { class: 'on' }, 'On Home') : button('Add', { disabled: ids.length >= MAX_TILES, onclick: () => { ids = [...ids, t.id]; paint(); } }));
      }))));
  };
  paint();
  let s = null;
  const body = h('div', null,
    h('div', { class: 'hm-ed' },
      h('div', null, h('h4', null, 'On your Home'), count, onList),
      h('div', null, h('h4', null, 'Add a number'), h('p', { class: 'hint' }, 'Grouped by where it comes from. Each person keeps their own set.'), cat)),
    h('div', { class: 'hm-edf' },
      button('Back to the default six', { ghost: true, onclick: () => { ids = DEFAULT_TILES.slice(); paint(); } }),
      h('span', { class: 'sp' }),
      button('Cancel', { onclick: () => s.close() }),
      button('Save tiles', { primary: true, onclick: () => { s.close(); onSave(ids.slice()); } })));
  s = sheet({ title: 'Edit your Home tiles', body, class: 'hm-edit' });
  return s;
}

export { statusDot };
