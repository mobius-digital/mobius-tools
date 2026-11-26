/* Ads > Meta > Best ads for one brand: which ads are selling and which are not, on the dates in the page head.
   Three figures, then the ads as cards (3 a row on a wide screen, 2 on a tablet, 1 on a phone) or as a table,
   sorted by any number in either direction (the table's column heads and the sort menu are one sort).
   Every ad opens the shared ad detail (pages/_addetail.js through meta/_rest.js adSheet).

   Real mode reads:
     GET /api/hub/creative?act=&from=&to=&model=lastPlatformClick   profit: every ad with spend, Triple Whale sales, the brand's goals
     GET /api/ad-creatives?act=&ads=                                account-health: the pictures for the ads shown first */

import { put } from '../../kit.js';
import { h, card, kpi, tiles, takeaway, button, segmented, gauge, table, empty, skeleton, money, num, pct } from '../../kit.js';
import { ok, usd, sum, soft, judge, adTile, gate, oldLink, styles, statusDot, x, adSheet, opener } from './_rest.js';
import { def, headRow } from '../platforms/_ads.js';
import { askWhy } from '../home/_biz.js';

const CSS = `
.mt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:var(--gap-4,16px)}
.mt-ad{display:flex;flex-direction:column;min-width:0;border-radius:var(--r-card,16px);background:var(--surface);box-shadow:var(--sh-1);overflow:hidden}
.mt-ad:hover{box-shadow:var(--sh-2,0 6px 20px rgba(28,20,10,.10))}
.mt-ad .mr-tile{width:100%;height:auto;aspect-ratio:1/1;border-radius:0}
/* Meta creatives are 1:1, 4:5 and 9:16: show the whole of it on the sunk background, never crop the headline */
.mt-ad .mr-tile img{object-fit:contain;object-position:center top}
.mt-ad .mr-tile svg{width:30px;height:30px}
.mt-kind{position:absolute;top:10px;left:10px;z-index:1;padding:2px 8px;border-radius:var(--r-chip,6px);background:rgba(20,16,12,.62);color:#fff;font-size:11.5px;font-weight:500}
.mt-media{position:relative}
.mt-b{display:grid;grid-template-columns:minmax(0,1fr);gap:var(--gap-3,12px);padding:var(--gap-4,16px) 18px 18px;min-width:0}
.mt-b h4{margin:0;font-size:var(--fs-card,14px);font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mt-w{display:grid;gap:2px;margin-top:4px;font-size:var(--fs-small,12.5px);color:var(--muted);min-width:0}
.mt-w>span,.mt-w>.lx-stat{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.mt-st{display:flex;align-items:center;gap:8px;min-width:0}
.mt-by{margin-left:auto;padding:1px 7px;border-radius:var(--r-chip,6px);background:var(--bg-sunk);color:var(--ink-2,var(--ink));font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap}
.mt-nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding-top:var(--gap-3,12px);border-top:1px solid var(--line)}
.mt-nums>div{display:grid;gap:2px;min-width:0}
.mt-nums span{font-size:var(--fs-colhead,11.5px);color:var(--muted);white-space:nowrap}
.mt-nums b{font-size:16px;font-weight:600;letter-spacing:-.02em;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mt-nums b.bad{color:var(--bad)}.mt-nums b.good{color:var(--good)}.mt-nums b.na{font-size:13px;font-weight:500;letter-spacing:0;color:var(--muted)}
.mt-ad.early .mt-nums,.mt-ad.early .lx-gauge{opacity:.62}
.mt-h{display:flex;align-items:flex-end;justify-content:space-between;gap:12px 16px;flex-wrap:wrap}
.mt-h .t{min-width:0}
.mt-h h2{margin:0;font-size:var(--fs-section,17px);font-weight:600;line-height:1.25}
.mt-h .t p{margin:2px 0 0;color:var(--muted);font-size:var(--fs-small,12.5px)}
.mt-ctl{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap}
.mt-ctl label{display:inline-flex;align-items:center;gap:8px;color:var(--muted);font-size:13px}
.mt-sortb .k{color:var(--muted);font-weight:500}
.mt-sortb .car{width:7px;height:7px;margin-left:2px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);opacity:.6}
.mt-menu{position:fixed;z-index:80}
.mt-menu .lx-item .ck{margin-left:auto;color:var(--brand);font-weight:600}
.mt-menu .lx-item[aria-checked=true]{font-weight:600}
.mt-dir{min-width:40px}
.mt-tbl .name{display:inline-flex;align-items:center;gap:10px;min-width:0;max-width:340px}
.mt-tbl th.mt-on{color:var(--ink)}
.mt-tbl .name>span:last-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.mt-kp .lx-kpi{cursor:default}
.mt-kp .lx-kpi.ads-open{cursor:pointer}
@media (max-width:759px){
  .mt-b{padding:14px 16px 16px}
  .mt-h{align-items:flex-start}
  .mt-ctl{width:100%}
  .mt-ctl .lx-seg{flex:none}
  .mt-tbl .name{max-width:160px}
}`;

/* ---------- load: real mode ---------- */
async function load(ctx) {
  const act = encodeURIComponent(ctx.brand.id), w = { from: ctx.range.from, to: ctx.range.to, label: ctx.range.label };
  let r;
  try { r = await ctx.api(`/api/hub/creative?act=${act}&from=${w.from}&to=${w.to}&model=lastPlatformClick`, { worker: 'profit', signal: ctx.signal }); }
  catch (e) { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; if (/meta|connect/i.test(e.message || '')) return { connected: false, error: e.message }; throw e; }
  const g = r.goals || {};
  const ads = (r.ads || []).map(a => ({ id: a.id, name: a.name, video: a.media_type === 'video', lead: a.obj === 'leads', campaign: a.campaign || null, adset: a.adset && a.adset.name || null,
    set: a.adset ? { name: a.adset.name, spend: a.adset.spend, purchases: a.adset.purchases, roas: a.adset.roas, cpa: a.adset.cpa } : null,
    spend: a.spend, revenue: a.revenue, purchases: a.purchases, roas: a.roas, cpa: a.cpa, leads: a.leads || null, cpl: a.cpl ?? null, age: a.age ?? null, first_spend: a.first_spend || null,
    ctr: a.ctr ?? null, cpm: a.cpm ?? null, frequency: a.frequency ?? null, impressions: a.impressions ?? null, clicks: a.clicks ?? null, fc_rev: a.fc_rev ?? null, nc_roas: a.nc_roas ?? null,
    /* passed through to the ad detail so it does not read them again */
    hook: a.hook ?? null, hold: a.hold ?? null, atc: a.atc ?? null, checkouts: a.checkouts ?? null, platform_purchases: a.platform_purchases ?? null, platform_revenue: a.platform_revenue ?? null,
    lc_rev: a.lc_rev ?? null, set_share: a.set_share ?? null, set_rank: a.set_rank ?? null, thumb: null }));
  const first = [...new Set([...ads].sort((p, q) => (q.roas || 0) - (p.roas || 0)).slice(0, 16).concat(ads.slice(0, 16)).map(a => a.id))].filter(id => /^\d{5,25}$/.test(id)).slice(0, 28);
  if (first.length) {
    const pics = await soft(ctx.api(`/api/ad-creatives?act=${act}&ads=${first.join(',')}`, { worker: 'ah', signal: ctx.signal }));
    const as = (pics && pics.assets) || {};
    for (const a of ads) { const p = as[a.id]; if (p) a.thumb = p.thumb || p.image || p.cover || null; }
  }
  return { window: w, currency: r.currency || 'USD', connected: true, goals: { roas: g.roas || null, cpa: g.cpa || null },
    sales_source: ads.some(a => !a.lead && (a.purchases > 0 || a.revenue > 0)),
    by_type: (r.by_type || []).map(t => ({ key: t.key, ads: t.ads, spend: t.spend, purchases: t.purchases, cpa: t.cpa, roas: t.roas })), ads };
}

/* every ad opens the shared ad detail, with the other ads of its ad set already in hand */
const open = (a, d, ctx) => adSheet(a, d, ctx, { set: a.set, siblings: a.adset ? (d.ads || []).filter(o => o.adset === a.adset) : null });
const TW = 'Triple Whale, last click';

/* ---------- the parts ---------- */
function figures(d, ctx) {
  const cur = d.currency, g = d.goals || {}, ads = d.ads || [], sales = ads.filter(a => !a.lead), wl = d.window && d.window.label;
  const judged = sales.map(a => ({ a, v: judge(a, g) }));
  const winners = judged.filter(j => j.v && j.v[0] === 'good' && j.a.purchases >= 3);
  const best = sales.filter(a => a.purchases >= 3 && ok(a.cpa)).sort((p, q) => p.cpa - q.cpa)[0];
  const none = h('small', null, 'No sales source connected');
  const bestTile = kpi({ label: def('Best cost per sale', 'cpa'), value: !d.sales_source ? none : best ? usd(best.cpa, cur) : h('small', null, 'No ad has 3 orders yet'),
    sub: d.sales_source && best ? h('span', { class: 'mt-best', title: best.name }, best.name + (g.cpa ? '. Goal ' + usd(g.cpa, cur) : '')) : '', window: wl, source: d.sales_source ? TW : null });
  if (best) opener(bestTile, () => open(best, d, ctx), 'Open ' + best.name);
  return tiles([
    kpi({ label: 'Ads that spent', value: num(ads.length), sub: usd(sum(ads, 'spend'), cur) + ' spent', window: wl, source: 'Meta' }),
    kpi({ label: def('Winners', 'winners'), value: d.sales_source ? num(winners.length) : none,
      sub: d.sales_source ? (g.roas ? `${x(g.roas)} ROAS or better, 3+ orders` : g.cpa ? `${usd(g.cpa, cur)} a sale or less, 3+ orders` : 'No goal set for this brand') : '', window: wl, source: d.sales_source ? TW : null }),
    bestTile], { class: 'mt-kp' });
}
function sentence(d, ctx) {
  if (!d.sales_source) return null;
  const t = Object.fromEntries((d.by_type || []).map(r => [r.key, r])), v = t.video, i = t.image, cur = d.currency;
  if (!v || !i || !ok(v.cpa) || !ok(i.cpa)) return null;
  const b = s => h('b', null, s), cheaper = v.cpa <= i.cpa ? 'video' : 'image';
  const say = Math.abs(v.cpa - i.cpa) / Math.max(v.cpa, i.cpa) < 0.08
    ? ['A video sale and an image sale cost about the same: ', b(usd(v.cpa, cur)), ' against ', b(usd(i.cpa, cur)), '.']
    : [cheaper === 'video' ? 'A video sale costs ' : 'An image sale costs ', b(usd(cheaper === 'video' ? v.cpa : i.cpa, cur)), ' against ', b(usd(cheaper === 'video' ? i.cpa : v.cpa, cur)), cheaper === 'video' ? ' for an image.' : ' for a video.'];
  return takeaway(say, { action: ctx.isClient ? null : askWhy(ctx, 'Why are these the best ads right now?') });
}

/* sort keys: [label, value of a row (null sorts last), column key in the table, how to show it] */
const SORTS = {
  roas: ['ROAS', a => a.roas, 'roas', a => x(a.roas)],
  spend: ['Spend', a => a.spend, 'spend'],
  revenue: ['Sales', a => a.revenue, 'revenue'],
  sales: ['Orders', a => a.purchases, 'purchases'],
  cpa: ['Cost per sale', a => a.cpa, 'cpa', (a, cur) => 'Cost per sale ' + usd(a.cpa, cur)],
  nc_roas: ['New customer ROAS', a => a.nc_roas, 'nc_roas', a => 'New customer ROAS ' + x(a.nc_roas)],
  ctr: ['CTR', a => a.ctr, 'ctr', a => 'CTR ' + pct(a.ctr, { digits: 2 })],
  cpm: ['CPM', a => a.cpm, 'cpm', (a, cur) => 'CPM ' + money(a.cpm, { cur, cents: true })],
  frequency: ['Frequency', a => a.frequency, 'frequency', a => 'Frequency ' + a.frequency.toFixed(2)],
  hook: ['Hook rate', a => a.hook, 'hook', a => 'Hook rate ' + pct(a.hook, { digits: 1 })],
  newest: ['Newest', a => ok(a.age) ? -a.age : null, null, a => (a.age + 1) + (a.age === 0 ? ' day' : ' days') + ' running'],
};
const COL_TO_SORT = Object.fromEntries(Object.entries(SORTS).filter(([, s]) => s[2]).map(([id, s]) => [s[2], id]));
const LOW_FIRST = new Set(['cpa', 'cpm', 'frequency']);
const PAGE = 15;

function adCard(a, d, ctx, sort) {
  const cur = d.currency, g = d.goals || {}, v = d.sales_source ? judge(a, g) : null, early = v && v[0] === 'off';
  const roasTone = v && !early ? (v[0] === 'good' ? 'good' : v[0] === 'bad' ? 'bad' : '') : '';
  const cell = (label, value, cls) => h('div', null, h('span', null, label), h('b', { class: cls || '' }, value));
  const nums = a.lead
    ? [cell('Spend', usd(a.spend, cur)), cell('Leads', num(a.leads || 0)), cell('Per lead', ok(a.cpl) ? money(a.cpl, { cur }) : '-'), cell('CTR', ok(a.ctr) ? pct(a.ctr, { digits: 2 }) : '-')]
    : [cell('Spend', usd(a.spend, cur)),
       cell('Sales', !d.sales_source ? '-' : ok(a.revenue) ? usd(a.revenue, cur) : usd(0, cur)),
       cell('ROAS', !d.sales_source ? '-' : ok(a.roas) ? x(a.roas) : 'none', ok(a.roas) ? roasTone : 'na'),
       cell('Orders', d.sales_source ? num(a.purchases || 0) : '-')];
  /* the number the list is sorted by, when it is not one of the four already on the card */
  const s = SORTS[sort], by = s && s[3] && !['roas', 'spend', 'revenue', 'sales'].includes(sort) && ok(s[1](a)) ? h('span', { class: 'mt-by' }, s[3](a, cur)) : null;
  const bar = !a.lead && d.sales_source && g.roas ? gauge({ value: a.roas || 0, max: Math.max(g.roas * 1.6, (a.roas || 0) * 1.05), goal: g.roas, thin: true, tone: !v || early ? '' : v[0] }) : null;
  const where = [a.adset, a.campaign].filter(Boolean).join(' · ');
  return opener(h('article', { class: 'mt-ad' + (early ? ' early' : '') },
    h('div', { class: 'mt-media' }, h('span', { class: 'mt-kind' }, a.video ? 'Video' : 'Image'), adTile(a)),
    h('div', { class: 'mt-b' },
      h('div', null, h('h4', { title: a.name }, a.name),
        h('div', { class: 'mt-w' },
          h('div', { class: 'mt-st' }, a.lead ? statusDot('info', 'Leads') : v ? statusDot(v[0], v[1]) : null, by),
          where ? h('span', { title: where }, where) : null)),
      h('div', { class: 'mt-nums' }, nums),
      bar)),
  () => open(a, d, ctx), 'Open ' + a.name);
}

function gridCard(d, ctx) {
  const cur = d.currency;
  let type = ctx.settingNow('meta.top.type', 'all'), sort = ctx.settingNow('meta.top.sort', d.sales_source ? 'roas' : 'spend'), view = ctx.settingNow('meta.top.view', 'cards'), shown = PAGE;
  if (!SORTS[sort]) sort = 'spend';
  let dir = ctx.settingNow('meta.top.dir', LOW_FIRST.has(sort) ? 'asc' : 'desc');
  const box = h('div'), more = h('div', { class: 'mr-more' }), g = d.goals || {};
  const need = g.cpa ? g.cpa * 2 : 0;
  const rowsNow = () => {
    const rows = (d.ads || []).filter(a => type === 'all' || (type === 'video') === !!a.video);
    const val = SORTS[sort][1];
    return rows.slice().sort((p, q) => {
      /* by ROAS: ads with enough spend to judge first, so a $9 ad with one chance sale never leads */
      if (sort === 'roas') { const j = (q.spend >= need) - (p.spend >= need); if (j) return j; }
      const a = val(p), b = val(q);
      if (!ok(a) || !ok(b)) return ok(a) ? -1 : ok(b) ? 1 : (q.spend || 0) - (p.spend || 0);
      return (dir === 'asc' ? a - b : b - a) || (q.spend || 0) - (p.spend || 0);
    });
  };
  const dirWord = () => (sort === 'newest' ? (dir === 'desc' ? 'Newest first' : 'Oldest first') : dir === 'desc' ? 'High to low' : 'Low to high');
  const sortLabel = h('b', null, SORTS[sort][0]);
  const setSort = (id, d2) => { sort = id; dir = d2; sortLabel.textContent = SORTS[sort][0]; dirBtn.textContent = dirWord(); ctx.saveSetting('meta.top.sort', sort); ctx.saveSetting('meta.top.dir', dir); };
  const paint = () => {
    const rows = rowsNow();
    if (view === 'table') {
      const col = SORTS[sort][2];
      let cols = [
          { key: 'name', label: 'Ad', render: a => h('span', { class: 'name', title: a.name }, adTile(a, 'xs'), h('span', null, a.name)) },
          { key: 'adset', label: 'Ad set', class: 'hide-md' },
          { key: 'spend', label: 'Spend', num: true, sortable: true, render: a => usd(a.spend, cur) },
          { key: 'revenue', label: 'Sales', num: true, sortable: true, class: 'hide-sm', render: a => ok(a.revenue) ? usd(a.revenue, cur) : '' },
          { key: 'purchases', label: 'Orders', num: true, sortable: true, class: 'hide-sm', render: a => ok(a.purchases) ? num(a.purchases) : '' },
          { key: 'roas', label: def('ROAS', 'roas'), num: true, sortable: true, render: a => ok(a.roas) ? x(a.roas) : h('span', { class: 'mr-dim' }, 'none') },
          { key: 'cpa', label: def('Cost per sale', 'cpa'), num: true, sortable: true, class: 'hide-sm', render: a => ok(a.cpa) ? usd(a.cpa, cur) : '' },
          { key: 'nc_roas', label: def('New cust. ROAS', 'new_customer_roas'), num: true, sortable: true, class: 'hide-md', render: a => ok(a.nc_roas) ? x(a.nc_roas) : '' },
          { key: 'ctr', label: def('CTR', 'ctr'), num: true, sortable: true, class: 'hide-sm', render: a => ok(a.ctr) ? pct(a.ctr, { digits: 2 }) : '' },
          { key: 'cpm', label: def('CPM', 'cpm'), num: true, sortable: true, class: 'hide-sm', render: a => ok(a.cpm) ? money(a.cpm, { cur, cents: true }) : '' },
          { key: 'frequency', label: def('Freq.', 'frequency'), num: true, sortable: true, class: 'hide-md', render: a => ok(a.frequency) ? a.frequency.toFixed(2) : '' },
          { key: 'hook', label: def('Hook rate', 'hook_rate'), num: true, sortable: true, class: 'hide-md', render: a => ok(a.hook) ? pct(a.hook, { digits: 1 }) : '' },
        ];
      /* the sorted number is always on screen: its column shows at every width, right after the ad */
      const at = col ? cols.findIndex(c => c.key === col) : -1;
      if (at > 0 && /hide-/.test(cols[at].class || '')) {
        const c = { ...cols[at], class: ((cols[at].class || '').replace(/\bhide-(sm|md)\b/g, '') + ' mt-on').trim() };
        cols = [cols[0], c, ...cols.slice(1, at), ...cols.slice(at + 1)];
      }
      /* rows arrive already in rowsNow() order (the same order as the cards); the kit is given no sort of its own */
      const tbl = table({ rows, roomy: true, empty: 'No ads of this kind spent on these dates.', cols, onRow: a => open(a, d, ctx) });
      tbl.querySelectorAll('th[data-key]').forEach(th => { const on = th.dataset.key === col; th.classList.toggle('sorted', on); th.classList.toggle('asc', on && dir === 'asc'); });
      /* a column head sorts through the same rule as the cards: caught before the kit's own sort runs */
      tbl.addEventListener('click', e => {
        const th = e.target.closest('th[data-key]'); if (!th || !COL_TO_SORT[th.dataset.key]) return;
        e.stopPropagation();
        const id = COL_TO_SORT[th.dataset.key];
        setSort(id, id === sort ? (dir === 'desc' ? 'asc' : 'desc') : LOW_FIRST.has(id) ? 'asc' : 'desc');
        paint();
      }, true);
      put(box, card({ flush: true, class: 'mt-tbl' }, tbl));
      put(more, '');
    } else {
      put(box, h('div', { class: 'mt-grid' }, ...(rows.length ? rows.slice(0, shown).map(a => adCard(a, d, ctx, sort)) : [h('p', { class: 'mr-dim' }, 'No ads of this kind spent on these dates.')])));
      put(more, rows.length > shown ? button(`Show all ${num(rows.length)} ads`, { onclick: () => { shown = rows.length; paint(); } }) : '');
    }
  };
  const n = k => (d.ads || []).filter(a => (k === 'video') === !!a.video).length;
  /* Sort by: the app's own menu (the same pop up and rows as the page head's menus), never a native select */
  let menu = null;
  const shut = () => { if (!menu) return; menu.remove(); menu = null; document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); sortBtn.setAttribute('aria-expanded', 'false'); };
  const away = e => { if (menu && !menu.contains(e.target) && !sortBtn.contains(e.target)) shut(); };
  const esc = e => { if (e.key === 'Escape') { shut(); sortBtn.focus(); } };
  const sortBtn = button([h('span', { class: 'k' }, 'Sort by'), sortLabel, h('i', { class: 'car' })], { class: 'mt-sortb', onclick: () => {
    if (menu) return shut();
    menu = h('div', { class: 'lx-pop mt-menu', role: 'menu', 'aria-label': 'Sort by' },
      Object.entries(SORTS).map(([id, s]) => h('button', { type: 'button', class: 'lx-item', role: 'menuitemradio', 'aria-checked': id === sort ? 'true' : 'false',
        onclick: () => { shut(); setSort(id, LOW_FIRST.has(id) ? 'asc' : 'desc'); paint(); } }, s[0], id === sort ? h('span', { class: 'ck', 'aria-hidden': 'true' }, '✓') : null)));
    document.body.append(menu);
    const r = sortBtn.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    menu.style.top = Math.round(r.bottom + 6) + 'px';
    menu.style.left = Math.round(Math.max(8, Math.min(vw - menu.offsetWidth - 8, r.left))) + 'px';
    sortBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', esc, true); window.addEventListener('hashchange', shut, { once: true });
    (menu.querySelector('[aria-checked=true]') || menu.querySelector('button')).focus();
  } });
  sortBtn.setAttribute('aria-haspopup', 'menu'); sortBtn.setAttribute('aria-expanded', 'false');
  const dirBtn = button(dirWord(), { class: 'mt-dir', title: 'Flip the order', onclick: () => { setSort(sort, dir === 'desc' ? 'asc' : 'desc'); paint(); } });
  paint();
  return [
    h('div', { class: 'mt-h' },
      h('div', { class: 't' }, h('h2', null, 'Every ad that spent'), h('p', null, `${d.window && d.window.label ? d.window.label : 'These dates'} · sales ${TW}, spend Meta`)),
      h('div', { class: 'mt-ctl' },
        segmented([{ id: 'all', label: 'All' }, { id: 'video', label: `Video ${n('video')}` }, { id: 'image', label: `Image ${n('image')}` }], type, id => { type = id; shown = PAGE; ctx.saveSetting('meta.top.type', id); paint(); }),
        sortBtn, dirBtn,
        segmented([{ id: 'cards', label: 'Cards' }, { id: 'table', label: 'Table' }], view, id => { view = id; ctx.saveSetting('meta.top.view', id); paint(); }))),
    box, more,
  ];
}

const HELP = [
  { title: 'What it is for', text: 'Every Facebook and Instagram ad that spent on the dates in the page head, best first. Sort by any number, high or low, as cards or as a table. Tap any ad for everything about it: the picture or video, every number, the funnel from view to sale, first and last click, the other ads in its ad set and its days.' },
  { title: 'How an ad is judged', text: 'An ad is judged once it has spent twice the goal cost per sale and run 3 days. Before that it shows as Too early. The tick on each bar is the brand\'s goal ROAS. Ad sets are judged first: the detail shows the ad\'s ad set beside it.' },
  { title: 'Where the numbers come from', text: 'Sales, ROAS and cost per sale are Triple Whale, last click per platform. Spend, CTR, CPM, frequency and hook rate are Meta\'s.' },
];

export default {
  title: 'Best ads',
  eyebrow: 'Meta',
  load,
  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 3)), skeleton('chart', 2)); },
  render(el, d, ctx) {
    styles('mt-css', CSS);
    const stop = gate(d, ctx, 'Best ads');
    if (stop) return put(el, stop);
    if (!(d.ads || []).length) return put(el, empty({ title: 'No Meta ads spent on these dates', text: `Nothing spent ${d.window ? d.window.label : 'on these dates'}. Pick a longer date range at the top.`, action: oldLink(ctx) }));
    const g = d.goals || {}, sales = (d.ads || []).filter(a => !a.lead && a.purchases >= 3 && ok(a.roas)).sort((p, q) => q.roas - p.roas);
    ctx.askWindow = d.window && d.window.label ? d.window.label : null;
    ctx.askContext = `Best Meta ads for ${ctx.brand.name || 'this brand'}, ${d.window ? d.window.label : 'these dates'}: ${(d.ads || []).length} ads spent ${usd(sum(d.ads || [], 'spend'), d.currency)}`
      + (sales[0] ? `; the best with 3 or more orders is "${sales[0].name}" at ${x(sales[0].roas)} ROAS` : '') + (g.roas ? ` against a ${x(g.roas)} goal.` : '.') + ' Sales are Triple Whale last click, spend is Meta.';
    put(el, ...[headRow({ help: HELP }), figures(d, ctx), sentence(d, ctx), ...gridCard(d, ctx)].filter(Boolean));
  },
};
