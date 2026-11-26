/* Business > Website > Pages. "Where do the ads send people, and what happens there?"
   The landing pages themselves first (a picture of each page, its visits, conversion, bounce, add to cart, page sales and
   the ads pointing to it), then the whole site by day, every landing page in a table, phone or desktop and channels.

   Live, reads (all GET, read only):
   - GET /api/google/website?act&from&to&pfrom&pto (account-health): Google Analytics for the brand (totals against the days
     before, visits by day, landing pages with carts, checkouts, orders and sales, devices, channel groups). Cached an hour there.
   - GET /api/clarity?act (account-health): Microsoft Clarity per page (scroll depth, rage clicks, dead clicks). Last 3 days only.
   These two draw the page. The ads come after, so a slow Meta read never holds back numbers that are ready:
   - GET /api/hub/creative?act&from&to&model=lastPlatformClick (profit): every Meta ad with spend and Triple Whale last click sales.
   - GET /api/ad-creatives?act&ads= (account-health): each ad's picture and where it sends people (`link`, read from the ad's
     creative). The worker reads at most 10 new creatives from Meta per call, so this runs up to 3 times, one after another,
     for the ads with the most spend. Ads are grouped by the page their link points to (query string dropped). The spend of
     ads whose link was not read is shown as money, never left out quietly.
   - GET /api/google/search?act&from&to (account-health): only when no ad link names the store's address, for the site address.
   - GET /api/google/website-drill?act&from&to&pfrom&pto&kind=page&value= (account-health): one page by day and its channels,
     read when that page's sheet opens.
   Any source may be missing; the page draws what it has and says "not connected yet", never a zero.
   Page pictures: no route reads a page's share picture (og:image) or whether it allows framing yet, so on a real brand each card
   says "Preview not connected yet" and the sheet offers the live page in a sandboxed frame on a tap. A row that carries
   `og_image` (the sample does) shows that picture, labeled as the share picture. Page speed has no source yet either. */

import { put, sheet, h, em, card, kpi, kpis, delta, takeaway, button, table, legend, lineChart, skeleton, money, x as xx, addStyles, svgNode, safeHref, segmented, empty } from '../../kit.js';
import { icon } from '../../icons.js';
import { askWhy, dl as defl } from '../home/_biz.js';
import { ok, usd, move, shortDate, noteAt, css, head, barCell, before, soft, notConnected, num, pct } from '../email/_em.js';
import { openAdDetail } from '../_addetail.js';

const GA = 'Google Analytics', TW = 'Triple Whale';
const rateOf = (a, b) => (ok(a) && b > 0 ? a / b : null);
const trimSlash = p => (p && p !== '/' ? p.replace(/\/+$/, '') || '/' : '/');
const path = u => { try { return trimSlash(new URL(u).pathname); } catch { return trimSlash(String(u || '').split(/[?#]/)[0]); } };
const hostOf = u => { try { return new URL(u).host.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
const span = (from, to) => {
  if (!from || !to) return '';
  const a = shortDate(from), b = shortDate(to);
  return a.split(' ')[0] === b.split(' ')[0] ? a + ' to ' + b.split(' ')[1] : a + ' to ' + b;
};
const slugName = pg => {
  if (!pg || pg === '/') return 'Home page';
  const last = pg.split('/').filter(Boolean).pop() || pg;
  const t = decodeURIComponent(last).replace(/[-_]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : pg;
};
/* The page's own title (Google Analytics page title) when there is one, else words from its address. */
const nameOf = r => (r && r.title ? String(r.title) : slugName(r && r.page));
const kindOf = pg => (!pg || pg === '/' ? 'Home page' : /^\/products\//.test(pg) ? 'Product page' : /^\/collections\//.test(pg) ? 'Collection'
  : /^\/blogs?\//.test(pg) ? 'Blog post' : /^\/pages\//.test(pg) ? 'Landing page' : /^\/cart/.test(pg) ? 'Cart' : 'Page');
const KIND_ICON = { 'Home page': 'home', 'Product page': 'sales', Collection: 'grid', 'Blog post': 'report', 'Landing page': 'website', Cart: 'sales', 'Another site': 'link', Page: 'website' };
const signed = v => (v > 0 ? '+' : '') + Math.round(v * 100) + '%';
const safeImg = u => (typeof u === 'string' && /^(https:\/\/|data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,])/i.test(u) ? u : null);

/* ---------- real mode: the reads, shaped like the fixture ---------- */
function shape(ctx, g, cl) {
  const gOk = g && !g.error, cOk = cl && !cl.error;
  const c = gOk ? g.cur || {} : {}, p = gOk ? g.prev || {} : {};
  const clBy = new Map(cOk ? (cl.pages || []).map(r => [path(r.url), r]) : []);
  const pages = gOk ? (g.landing || []).filter(r => r.page && r.page !== '(not set)').map(r => {
    const k = clBy.get(path(r.page)) || {};
    return { page: path(r.page), ga_page: r.page, title: r.pageTitle || r.title || null, og_image: r.og_image || null, frame: r.frame_ok === true ? true : undefined,
      visits: r.sessions, visits_prev: r.prev ? r.prev.sessions : null, engaged: r.engagementRate, carts: r.addToCarts,
      checkouts: r.checkouts ?? null, orders: r.ecommercePurchases, sales: r.purchaseRevenue, scroll: k.scroll ?? null, rage: k.rage ?? null, dead: k.dead ?? null };
  }) : (cOk ? (cl.pages || []).map(r => ({ page: path(r.url), visits: r.sessions, scroll: r.scroll, rage: r.rage, dead: r.dead })) : []);
  return {
    connected: gOk || cOk, analytics: gOk, clarity: cOk, clarity_window: cOk ? 'the last 3 days' : null,
    analytics_error: gOk ? null : g && g.error, range: { from: ctx.range.from, to: ctx.range.to },
    totals: gOk ? {
      visits: c.sessions, visits_prev: p.sessions, orders: c.ecommercePurchases, conversion: rateOf(c.ecommercePurchases, c.sessions),
      conversion_prev: rateOf(p.ecommercePurchases, p.sessions), carts: c.addToCarts, cart_rate: rateOf(c.addToCarts, c.sessions),
      cart_rate_prev: rateOf(p.addToCarts, p.sessions), sales: c.purchaseRevenue, per_visit: rateOf(c.purchaseRevenue, c.sessions),
      per_visit_prev: rateOf(p.purchaseRevenue, p.sessions), engaged: c.engagementRate,
    } : {},
    days: gOk ? (g.days || []).map(r => ({ date: r.date, visits: r.sessions, orders: r.purchases, carts: r.addToCarts ?? null, revenue: r.revenue ?? r.purchaseRevenue ?? null })) : [],
    prev_days: gOk ? (g.prev_days || []).map(r => ({ date: r.date, visits: r.sessions })) : [],
    note: null, pages,
    devices: gOk ? (g.devices || []).map(r => ({ device: r.device ? r.device[0].toUpperCase() + r.device.slice(1) : 'Other', visits: r.sessions, conversion: rateOf(r.ecommercePurchases, r.sessions) })) : [],
    channels: gOk ? (g.channels || []).map(r => ({ name: r.group, visits: r.sessions, conversion: rateOf(r.ecommercePurchases, r.sessions) })) : [],
  };
}

/* The Meta ads and where each one sends people. Never throws except on abort or sign in: a missing source comes back as ads_state. */
async function readAds(ctx) {
  const act = encodeURIComponent(ctx.brand.id);
  let r;
  try { r = await ctx.api(`/api/hub/creative?act=${act}&from=${ctx.range.from}&to=${ctx.range.to}&model=lastPlatformClick`, { worker: 'profit', signal: ctx.signal }); }
  catch (e) { if (ctx.signal && ctx.signal.aborted) throw e; if (e && e.status === 401) throw e; return { ads_state: /meta|connect/i.test(e && e.message || '') ? 'none' : 'error', ads: [] }; }
  const g = (r && r.goals) || {};
  const ads = ((r && r.ads) || []).filter(a => a && a.spend > 0).map(a => ({ id: String(a.id), name: a.name, video: a.media_type === 'video', lead: a.obj === 'leads', thumb: null, link: null,
    campaign: a.campaign || null, adset: a.adset && a.adset.name || null, spend: a.spend, revenue: a.revenue ?? null, purchases: a.purchases ?? null, roas: a.roas ?? null, cpa: a.cpa ?? null,
    clicks: a.clicks ?? null, impressions: a.impressions ?? null, ctr: a.ctr ?? null, cpm: a.cpm ?? null, frequency: a.frequency ?? null }));
  ads.sort((p, q) => (q.spend || 0) - (p.spend || 0));
  let want = ads.filter(a => /^\d{5,25}$/.test(a.id)).slice(0, 30).map(a => a.id);
  const byId = new Map(ads.map(a => [a.id, a]));
  for (let round = 0; round < 3 && want.length; round++) {
    const pics = await soft(ctx, ctx.api(`/api/ad-creatives?act=${act}&ads=${want.join(',')}`, { worker: 'ah', signal: ctx.signal }));
    const as = (pics && pics.assets) || {};
    const got = new Set();
    for (const [id, v] of Object.entries(as)) {
      const a = byId.get(String(id)); if (!a || !v) continue;
      got.add(String(id));
      a.thumb = v.thumb || v.image || v.cover || a.thumb;
      if (v.link) a.link = v.link;
      if (v.media_type) a.video = v.media_type === 'video';
    }
    if (!pics) break;
    want = want.filter(id => !got.has(id));
  }
  return { ads_state: ads.length ? 'ok' : 'empty', ads, currency: (r && r.currency) || 'USD', goals: { roas: g.roas || null, cpa: g.cpa || null } };
}
/* The ads, read once per brand and dates for the life of the page, then the site address if the ads did not name it. */
const ADS = new Map();
function adsFor(ctx, d) {
  const k = [ctx.brand.id, ctx.range.from, ctx.range.to].join('|');
  if (!ADS.has(k)) ADS.set(k, (async () => {
    const out = await readAds(ctx);
    if (!d.site && !siteOf({ ads: out.ads })) {
      const s = await soft(ctx, ctx.api(`/api/google/search?act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}`, { worker: 'ah', signal: ctx.signal }));
      const site = s && !s.error && s.site ? String(s.site) : '';
      if (/^sc-domain:/.test(site)) out.site = 'https://' + site.replace(/^sc-domain:/, '');
      else if (/^https?:\/\//.test(site)) out.site = site.replace(/\/$/, '');
    }
    return out;
  })().catch(e => { ADS.delete(k); throw e; }));
  return { key: k, wait: ADS.get(k) };
}

/* ---------- landing pages: GA rows and the ads pointing at them, one row per page ---------- */
function siteOf(d) {
  if (d.site) return d.site;
  const n = new Map();
  for (const a of d.ads || []) { if (!a.link) continue; try { const o = new URL(a.link).origin; n.set(o, (n.get(o) || 0) + 1); } catch {} }
  return [...n.entries()].sort((p, q) => q[1] - p[1])[0]?.[0] || null;
}
function landing(d) {
  const site = siteOf(d), home = site ? hostOf(site) : '';
  const rows = new Map();
  for (const r of d.pages || []) rows.set(r.page, { ...r, key: r.page, url: site ? site.replace(/\/$/, '') + (r.page === '/' ? '/' : r.page) : null, ads: [] });
  let noLink = 0, noLinkSpend = 0;
  for (const a of d.ads || []) {
    if (!a.link) { noLink++; noLinkSpend += a.spend || 0; continue; }
    const pg = path(a.link), host = hostOf(a.link);
    const key = !home || host === home ? pg : host + pg;
    if (!rows.has(key)) rows.set(key, { page: key, key, url: safeHref(a.link) ? a.link.split(/[?#]/)[0] : null, outside: !!home && host !== home, ads: [] });
    rows.get(key).ads.push(a);
  }
  const list = [...rows.values()].map(r => {
    const ads = r.ads.sort((p, q) => (q.spend || 0) - (p.spend || 0));
    const spend = ads.reduce((t, a) => t + (a.spend || 0), 0), rev = ads.some(a => ok(a.revenue)) ? ads.reduce((t, a) => t + (a.revenue || 0), 0) : null;
    return { ...r, ads, ad_spend: ads.length ? spend : null, ad_sales: ads.length ? rev : null, ad_roas: ads.length && spend > 0 && ok(rev) ? rev / spend : null,
      cv: rateOf(r.orders, r.visits), cr: rateOf(r.carts, r.visits), bounce: ok(r.engaged) ? 1 - r.engaged : null, change: move(r.visits, r.visits_prev) };
  });
  return { list, noLink, noLinkSpend, site };
}

/* ---------- parts ---------- */
const STYLE = `
.wp-lead{margin:-4px 0 0;max-width:72ch;font-size:14px;line-height:1.5;color:var(--ink-2)}
.wp-lead b{color:var(--ink);font-weight:600}
.wp-band-l{margin:0 0 calc(-1 * var(--sp-2));font-size:var(--fs-small);font-weight:600;color:var(--muted)}
.wp-sec{display:flex;align-items:flex-end;gap:var(--sp-3) var(--sp-4);flex-wrap:wrap;margin:var(--sp-2) 0 calc(-1 * var(--sp-2))}
.wp-sec h2{margin:0;font-size:var(--fs-section);font-weight:600;letter-spacing:-.015em;line-height:var(--lh-head)}
.wp-sec p{margin:2px 0 0;font-size:var(--fs-small);color:var(--muted)}
.wp-sec .sp{flex:1}
.wp-sec .lx-seg{max-width:100%;overflow-x:auto}
.wp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:var(--sp-4)}
.wp-card{position:relative;display:flex;flex-direction:column;min-width:0;border-radius:var(--r-card);background:var(--surface);box-shadow:var(--sh-1);overflow:hidden;transition:box-shadow var(--t,.15s)}
.wp-card:hover{box-shadow:var(--sh-2,0 6px 20px rgba(28,20,10,.10))}
.wp-card:has(.wp-open:focus-visible){outline:2px solid var(--brand);outline-offset:2px}
.wp-open{all:unset;cursor:pointer;display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-open::after{content:"";position:absolute;inset:0;z-index:1}
.wp-prev{position:relative;aspect-ratio:1200/630;background:var(--bg-sunk);overflow:hidden;border-bottom:1px solid var(--line)}
.wp-grid.noprev .wp-prev{aspect-ratio:auto;height:92px}
.wp-bar{position:absolute;inset:0 0 auto 0;height:24px;display:flex;align-items:center;gap:5px;padding:0 10px;background:var(--surface-2);border-bottom:1px solid var(--line);z-index:2}
.wp-bar i{width:7px;height:7px;border-radius:50%;background:var(--line-strong,#d9d5cf);flex:none}
.wp-bar span{margin-left:6px;flex:1;min-width:0;height:16px;line-height:16px;padding:0 8px;border-radius:var(--r-chip);background:var(--surface);font-size:10.5px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-og{position:absolute;inset:24px 0 0 0;width:100%;height:calc(100% - 24px);object-fit:cover;object-position:top center;display:block}
.wp-og-k{position:absolute;right:8px;bottom:8px;z-index:2;font-size:10.5px;font-weight:600;color:#fff;background:rgba(20,16,12,.62);border-radius:var(--r-chip);padding:2px 7px}
.wp-none{position:absolute;inset:24px 0 0 0;display:flex;align-items:center;justify-content:center;gap:10px;padding:0 16px;color:var(--muted);font-size:var(--fs-small);text-align:left}
.wp-none svg{width:20px;height:20px;flex:none;color:var(--faint)}
.wp-none b{display:block;color:var(--ink-2);font-weight:600}
.wp-prev.live>.wp-og,.wp-prev.live>.wp-og-k,.wp-prev.live>.wp-none{display:none}
.wp-live{position:absolute;inset:24px 0 0 0;overflow:hidden;background:#fff}
.wp-live iframe{position:absolute;top:0;left:0;border:0;transform-origin:0 0;background:#fff}
.wp-card .wp-live iframe{pointer-events:none}
.wp-b{display:grid;gap:12px;padding:14px 16px 16px;min-width:0}
.wp-b h4{margin:0;font-size:var(--fs-card);font-weight:600;letter-spacing:-.01em;line-height:var(--lh-head);min-width:0}
.wp-b h4+small{display:block;margin-top:2px;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-m{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 8px;padding-top:12px;border-top:1px solid var(--line)}
.wp-m>div{min-width:0}
.wp-m small{display:block;font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wp-m b{display:block;margin-top:1px;font-size:var(--num-s);font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.wp-m b.na{font-size:12px;font-weight:400;color:var(--faint)}
.wp-m b.bad{color:var(--bad)}
.wp-m b.good{color:var(--good)}
.wp-ads{display:grid;gap:8px;padding-top:12px;border-top:1px solid var(--line);min-width:0}
.wp-ads .th{position:relative;z-index:2;display:flex;gap:8px;flex-wrap:wrap}
.wp-ads .th>button{width:60px;height:60px;border-radius:var(--r-chip);border:1px solid var(--line);background:var(--bg-sunk);padding:0;overflow:hidden;cursor:pointer;display:grid;place-items:center;color:var(--muted);font:600 12px/1 inherit;position:relative}
.wp-ads .th>button:hover{border-color:var(--brand)}
.wp-ads .th>button:focus-visible{outline:2px solid var(--brand);outline-offset:1px}
.wp-ads .th img{width:100%;height:100%;object-fit:cover;display:block}
.wp-ads .th svg{width:14px;height:14px}
.wp-ads .th .vid{position:absolute;left:4px;bottom:4px;width:18px;height:18px;border-radius:50%;background:rgba(20,16,12,.62);color:#fff;display:grid;place-items:center}
.wp-ads .th .vid svg{width:10px;height:10px}
.wp-ads .tx{min-width:0;display:grid;gap:1px;font-size:12.5px;line-height:1.4;color:var(--ink-2)}
.wp-ads .tx>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wp-ads .tx b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.wp-ads .tx .q{color:var(--muted)}
.wp-ads .tx .lx-def{position:relative;z-index:2}
.wp-ads.none .tx{color:var(--muted)}
.wp-ads .sk{height:60px;border-radius:var(--r-chip);background:var(--bg-sunk);width:188px}
.wp-more{display:flex;justify-content:center;margin-top:calc(-1 * var(--sp-2))}
.wp-gap{margin:calc(-1 * var(--sp-2)) 0 0;font-size:var(--fs-small);color:var(--muted);text-align:center}
.wp-src{display:grid;gap:6px;padding:14px 18px;border-radius:var(--r-card);box-shadow:inset 0 0 0 1px var(--line);font-size:12.5px;line-height:1.5;color:var(--muted)}
.wp-src b{color:var(--ink-2);font-weight:600}
@media (max-width:1400px){.wp-tbl .lx-table .wp-xl{display:none}}
.wp-ad-cell{display:inline-flex;flex-direction:column;align-items:flex-end;line-height:1.25}
.wp-ad-cell small{color:var(--muted);font-weight:400;font-size:11.5px}
.em-two.wp-two-b{align-items:start}
/* the sheet for one page */
.lx-sheet.wp-wide{width:min(1040px,100%)}
.wp-x{display:grid;gap:var(--sp-6);min-width:0;font-size:14px;line-height:1.5}
.wp-top{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:var(--sp-6);align-items:start}
.wp-big .wp-prev{border-radius:var(--r-tbl);border:1px solid var(--line);box-shadow:none}
.wp-big .wp-prev.noog{aspect-ratio:16/9}
.wp-big .wp-prev.live{aspect-ratio:16/10}
.wp-big .wp-prev.live.phone{aspect-ratio:auto;height:min(560px,70vh);max-width:300px;margin:0 auto}
.wp-pv{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--muted)}
.wp-pv .sp{flex:1}
.wp-pv p{margin:0;flex-basis:100%}
.wp-side{display:grid;gap:14px;min-width:0}
.wp-side .url{display:flex;align-items:center;gap:8px;min-width:0;font-size:13px}
.wp-side .url a{min-width:0;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-side .url a:hover{text-decoration:underline}
.wp-side .url svg{width:14px;height:14px;flex:none;color:var(--muted)}
.wp-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.wp-tiles>div{display:grid;gap:2px;align-content:start;padding:10px 12px;border-radius:var(--r-btn);background:var(--surface-2);min-width:0}
.wp-tiles small{font-size:12px;color:var(--muted)}
.wp-tiles b{font-size:var(--num-m);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.wp-tiles b.na{font-size:13px;font-weight:400;color:var(--faint);letter-spacing:0}
.wp-tiles b.bad{color:var(--bad)}.wp-tiles b.good{color:var(--good)}
.wp-tiles span{font-size:11.5px;color:var(--faint);overflow-wrap:anywhere}
.wp-h{margin:0 0 10px;font-size:var(--fs-card);font-weight:600}
.wp-h small{margin-left:8px;font-weight:400;font-size:12px;color:var(--muted)}
.wp-fun{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-radius:var(--r-tbl);background:var(--surface-2);overflow:hidden}
.wp-fun>div{position:relative;display:grid;gap:2px;align-content:start;padding:12px 14px;min-width:0}
.wp-fun>div+div{border-left:1px solid var(--line)}
.wp-fun small{font-size:12px;color:var(--muted)}
.wp-fun b{font-size:var(--num-m);font-weight:600;font-variant-numeric:tabular-nums}
.wp-fun b.na{font-size:13px;font-weight:400;color:var(--faint)}
.wp-fun span{font-size:11.5px;color:var(--muted)}
.wp-fun span.lost{color:var(--ink-2)}
.wp-list{display:grid}
.wp-list>button{display:grid;grid-template-columns:44px minmax(0,1fr) auto auto auto;gap:12px;align-items:center;min-height:56px;padding:6px 8px;border:0;border-top:1px solid var(--line);background:none;text-align:left;font:inherit;color:inherit;cursor:pointer;border-radius:0}
.wp-list>button:first-child{border-top:0}
.wp-list>button:hover{background:var(--row-hover)}
.wp-list .im{width:44px;height:44px;border-radius:var(--r-chip);background:var(--bg-sunk);overflow:hidden;display:grid;place-items:center;color:var(--muted)}
.wp-list .im img{width:100%;height:100%;object-fit:cover}
.wp-list .im svg{width:16px;height:16px}
.wp-list .nm{min-width:0}
.wp-list .nm b{display:block;font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-list .nm small{display:block;font-size:12px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wp-list .v{text-align:right;font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap}
.wp-list .v small{display:block;font-size:11px;color:var(--muted)}
.wp-kv{display:grid}
.wp-kv p{display:flex;justify-content:space-between;gap:12px;margin:0;min-height:34px;align-items:center;border-top:1px solid var(--line);font-size:13px;color:var(--ink-2)}
.wp-kv p:first-child{border-top:0}
.wp-kv p b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.wp-quiet{margin:0;font-size:12.5px;color:var(--muted)}
@media (max-width:900px){.wp-top{grid-template-columns:1fr}}
@media (max-width:759px){
  .wp-fun{grid-template-columns:repeat(2,minmax(0,1fr))}
  .wp-fun>div:nth-child(3){border-left:0}
  .wp-fun>div:nth-child(n+3){border-top:1px solid var(--line)}
  .wp-list>button{grid-template-columns:40px minmax(0,1fr) auto auto;gap:10px}
  .wp-list .v.hide-sm{display:none}
  .wp-sec .lx-seg{width:100%}
  .wp-ads .th>button{width:56px;height:56px}
}`;

const glyph = (name, fallback) => { try { return svgNode(icon(name)); } catch { return document.createTextNode(fallback || ''); } };
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';
const IMG = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9.5" cy="10" r="1.6"/><path d="m5 17 5-5 4 4 2-2 3 3"/></svg>';
const adGlyph = a => svgNode(a.video ? PLAY : IMG);
const na = text => h('b', { class: 'na' }, text || 'not tracked yet');

/* The picture of a page. Only real pictures: the page's share picture (og:image) when a row carries one, the live page in
   a sandboxed frame when it is known to allow it (row.frame, from a future site check), else an honest "not connected" card. */
function preview(r, { big = false } = {}) {
  const host = r.url ? r.url.replace(/^https?:\/\//, '') : r.page;
  const og = safeImg(r.og_image);
  const kind = r.outside ? 'Another site' : kindOf(r.page);
  const box = h('div', { class: 'wp-prev' + (og ? '' : ' noog') }, h('div', { class: 'wp-bar', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('span', null, host)));
  if (og) box.append(h('img', { class: 'wp-og', src: og, alt: 'Share picture of ' + nameOf(r), loading: 'lazy', referrerpolicy: 'no-referrer' }),
    h('span', { class: 'wp-og-k' }, big ? 'Share picture (og:image), not a live view' : 'Share picture'));
  else box.append(h('div', { class: 'wp-none' }, glyph(KIND_ICON[kind] || 'website'), h('span', null, h('b', null, kind), 'Preview not connected yet')));
  if (r.frame === true && r.url) liveInto(box, r.url, 'desktop');
  return box;
}
/* The live page in a sandboxed frame, scaled to fit: no forms, no pop ups, no top navigation. In the sheet it scrolls. */
function liveInto(box, url, mode) {
  const W = mode === 'phone' ? 390 : 1280, H = mode === 'phone' ? 844 : 800;
  box.querySelector('.wp-live')?.remove();
  box.classList.add('live');
  const fr = h('iframe', { src: url, title: 'Live page: ' + url, loading: 'lazy', referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin', style: { width: W + 'px' } });
  const live = h('div', { class: 'wp-live' }, fr);
  box.append(live);
  const fit = () => { const w = live.clientWidth || box.clientWidth, hh = live.clientHeight; if (!w) return; const k = w / W; fr.style.transform = `scale(${k})`; fr.style.height = Math.max(H, hh / k) + 'px'; };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(live); else requestAnimationFrame(fit);
  requestAnimationFrame(fit);
  return live;
}

function adThumbs(ctx, d, r, n = 3) {
  const ads = r.ads || [];
  const btn = a => h('button', { type: 'button', title: a.name, 'aria-label': 'Open the ad ' + a.name, onclick: () => openAd(ctx, d, a) },
    safeImg(a.thumb) ? [h('img', { src: a.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }), a.video ? h('span', { class: 'vid', 'aria-hidden': 'true' }, svgNode(PLAY)) : null] : adGlyph(a));
  const extra = ads.length - n;
  return h('div', { class: 'th' }, ads.slice(0, n).map(btn), extra > 0 && h('button', { type: 'button', title: 'See all the ads pointing here', 'aria-label': 'See all ' + ads.length + ' ads pointing to ' + nameOf(r), onclick: () => openPage(ctx, d, r) }, '+' + extra));
}
const openAd = (ctx, d, a) => openAdDetail(ctx, { ...a, media_type: a.video ? 'video' : 'image' }, { window: d.window || d.range, goals: d.goals, currency: d.currency });

function adsStrip(ctx, d, r) {
  const ads = r.ads || [], cur = d.currency;
  if (d.ads_state === 'loading') return h('div', { class: 'wp-ads', 'aria-busy': 'true' }, h('div', { class: 'sk lx-skel' }), h('div', { class: 'tx' }, h('span', { class: 'q' }, 'Reading the Meta ads that point here')));
  if (!ads.length) return h('div', { class: 'wp-ads none' }, h('div', { class: 'tx' }, h('span', null,
    d.ads_state === 'ok' || d.ads_state === 'empty' ? 'No Meta ads point here in these dates' : d.ads_state === 'none' ? 'Meta is not connected' : 'The ads could not be read this time')));
  return h('div', { class: 'wp-ads' }, adThumbs(ctx, d, r),
    h('div', { class: 'tx' },
      h('span', null, h('b', null, num(ads.length) + (ads.length === 1 ? ' ad' : ' ads')), ' · ', h('b', null, usd(r.ad_spend, cur)), ' spent', h('span', { class: 'q' }, ' · Meta')),
      h('span', null, ok(r.ad_sales) ? [h('b', null, usd(r.ad_sales, cur)), ' sales · ', h('b', null, xx(r.ad_roas)), ' ', defl('ROAS', 'roas')] : 'No sales tracked from these ads',
        h('span', { class: 'q' }, ' · ' + TW))));
}

function pageCard(ctx, d, r) {
  const cur = d.currency;
  const m = (label, v, cls) => h('div', null, h('small', null, label), v && v.nodeType ? v : h('b', { class: cls || null }, v));
  return h('div', { class: 'wp-card' },
    preview(r),
    h('div', { class: 'wp-b' },
      h('div', null, h('h4', null, h('button', { type: 'button', class: 'wp-open', title: nameOf(r), onclick: () => openPage(ctx, d, r) }, nameOf(r))), h('small', { title: r.url || r.page }, r.page)),
      h('div', { class: 'wp-m' },
        m('Visits', ok(r.visits) ? num(r.visits) : na()),
        m('Visits vs before', ok(r.change) ? signed(r.change) : na('no earlier days'), ok(r.change) ? (r.change < -0.005 ? 'bad' : r.change > 0.005 ? 'good' : '') : ''),
        m('Conversion', ok(r.cv) ? pct(r.cv, { digits: 1 }) : na()),
        m('Bounce', ok(r.bounce) ? pct(r.bounce) : na(), ok(r.bounce) && r.bounce > 0.6 ? 'bad' : ''),
        m('Add to cart', ok(r.cr) ? pct(r.cr, { digits: 1 }) : na()),
        m('Page sales, GA', ok(r.sales) ? usd(r.sales, cur) : na())),
      adsStrip(ctx, d, r)));
}

const SORTS = [
  { id: 'ad_spend', label: 'Ad spend' }, { id: 'visits', label: 'Visits' }, { id: 'cv', label: 'Conversion' }, { id: 'sales', label: 'Page sales' },
];
const sortRows = (rows, key) => rows.slice().sort((p, q) => {
  const a = p[key], b = q[key];
  if (!ok(a) || !ok(b)) return ok(a) ? -1 : ok(b) ? 1 : (q.visits || 0) - (p.visits || 0);
  return b - a || (q.visits || 0) - (p.visits || 0);
});

function gallery(ctx, d, L) {
  const rows = L.list.filter(r => r.ads.length || ok(r.visits));
  if (!rows.length) return null;
  const st = { key: rows.some(r => r.ads.length) || d.ads_state === 'loading' ? 'ad_spend' : 'visits', all: false };
  try { const k = ctx.settingNow('website.pagesSort', null); if (SORTS.some(s => s.id === k)) st.key = k; } catch {}
  const FIRST = 6;
  const grid = h('div', { class: 'wp-grid' + (rows.some(r => safeImg(r.og_image) || r.frame === true) ? '' : ' noprev') }), more = h('div', { class: 'wp-more' });
  const draw = () => {
    const list = sortRows(rows, st.key).filter(r => st.key !== 'cv' || ok(r.cv));
    put(grid, (st.all ? list : list.slice(0, FIRST)).map(r => pageCard(ctx, d, r)));
    put(more, list.length > FIRST ? button(st.all ? 'Show fewer' : `Show all ${list.length} pages`, { onclick: () => { st.all = !st.all; draw(); } }) : null);
  };
  draw();
  const win = d.range ? span(d.range.from, d.range.to) + ' · ' : '';
  const gap = L.noLink && d.ads_state === 'ok'
    ? h('p', { class: 'wp-gap' }, `${usd(L.noLinkSpend, d.currency)} of ad spend (${num(L.noLink)} ${L.noLink === 1 ? 'ad' : 'ads'}) has no landing page read yet, so it is not on any card.`) : null;
  return [
    h('div', { class: 'wp-sec' },
      h('div', null, h('h2', null, 'Landing pages'), h('p', null, `${win}visits and page sales ${GA} · ad sales ${TW}, last click`)),
      h('span', { class: 'sp' }),
      segmented(SORTS, st.key, k => { st.key = k; try { ctx.saveSetting('website.pagesSort', k); } catch {} draw(); })),
    grid, more, gap,
  ];
}

function figures(d) {
  const t = d.totals || {}, days = d.days || [], win = d.range ? span(d.range.from, d.range.to) : '';
  const dl = v => (ok(v) && Math.abs(v) >= 0.005 ? delta(v, { bad: v < 0 }) : null);
  /* one label per day: the kit reads the first and last of them for the start and end date under the line */
  const labels = days.length > 1 ? days.map(r => shortDate(r.date)) : undefined;
  const series = f => { const v = days.map(f); return v.length > 1 && v.every(ok) ? v : null; };
  const src = GA;
  const el = kpis([
    kpi({ label: 'Visits', value: ok(t.visits) ? num(t.visits) : 'no data', delta: dl(move(t.visits, t.visits_prev)),
      sub: ok(t.visits_prev) ? 'vs ' + num(t.visits_prev) + ' before' : null, window: win, source: src, spark: series(r => r.visits), sparkLabels: labels, sparkFormat: v => num(v) }),
    kpi({ label: defl('Conversion rate', 'conversion_rate'), value: ok(t.conversion) ? pct(t.conversion, { digits: 2 }) : 'no data', delta: dl(move(t.conversion, t.conversion_prev)),
      sub: ok(t.orders) ? num(t.orders) + ' orders' : null, window: win, source: src, spark: series(r => rateOf(r.orders, r.visits)), sparkLabels: labels, sparkFormat: v => pct(v, { digits: 1 }) }),
    kpi({ label: 'Add to cart', value: ok(t.cart_rate) ? pct(t.cart_rate, { digits: 1 }) : 'no data', delta: dl(move(t.cart_rate, t.cart_rate_prev)),
      sub: ok(t.carts) ? num(t.carts) + ' carts' : 'of visits', window: win, source: src, spark: series(r => rateOf(r.carts, r.visits)), sparkLabels: labels, sparkFormat: v => pct(v, { digits: 1 }) }),
    kpi({ label: 'Sales per visit', value: ok(t.per_visit) ? money(t.per_visit, { cents: true }) : 'no data', delta: dl(move(t.per_visit, t.per_visit_prev)),
      sub: ok(t.per_visit_prev) ? 'vs ' + money(t.per_visit_prev, { cents: true }) + ' before' : null, window: win, source: src, spark: series(r => rateOf(r.revenue, r.visits)), sparkLabels: labels, sparkFormat: v => money(v, { cents: true }) }),
  ], { cols: 4 });
  el.classList.add('em-kpis');
  return el;
}

/* The page to look at first. A page that gets ad money and converts under half the site's rate, the most ad spend first,
   so the money at risk is named. Else the page that loses the most orders against the best page. */
function verdict(L, ctx, d) {
  const rows = L.list.filter(r => ok(r.orders) && r.visits >= 300);
  if (rows.length < 2) return null;
  const b = v => h('b', null, v), cv = r => r.orders / r.visits;
  const best = rows.reduce((m, r) => (cv(r) > cv(m) ? r : m), rows[0]);
  const parts = [b(nameOf(best)), ' turns the most visits into orders, ', b(pct(cv(best), { digits: 1 })), '.'];
  const site = (d.totals || {}).conversion;
  const weak = ok(site) ? rows.filter(r => r !== best && r.ad_spend > 0 && cv(r) < site / 2).sort((p, q) => q.ad_spend - p.ad_spend)[0] : null;
  if (weak) parts.push(' ', b(nameOf(weak)), ' converts ', b(pct(cv(weak), { digits: 1 })), ', under half the site\'s ', b(pct(site, { digits: 1 })), ', and ',
    b(usd(weak.ad_spend, d.currency)), ' of ads point at it.');
  else {
    const paid = rows.filter(r => r !== best && r.ad_spend > 0);
    const pool = paid.length ? paid : rows.filter(r => r !== best);
    const worst = pool.reduce((m, r) => (r.visits * (cv(best) - cv(r)) > m.visits * (cv(best) - cv(m)) ? r : m), pool[0]);
    if (worst && cv(worst) < cv(best) / 2) parts.push(' ', b(nameOf(worst)), ' got ', b(num(worst.visits)), ' visits and ', b(num(worst.orders)), ' orders',
      worst.ad_spend > 0 ? [', with ', b(usd(worst.ad_spend, d.currency)), ' of ads pointing at it.'] : '.');
  }
  return takeaway(parts, { action: ctx.isClient ? null : askWhy(ctx, 'Where do the ads send people') });
}

function chartCard(d) {
  const days = d.days || [], prev = d.prev_days || [];
  if (days.length < 2) return null;
  const b = v => h('b', null, v), hasPrev = prev.length === days.length && prev.some(r => ok(r.visits));
  return card({ class: 'em-chart' },
    head('Visits by day', 'Every visit to the store, ' + GA + "' own count", hasPrev ? legend([{ name: 'Visits', lead: true }, { name: `The ${days.length} days before`, dashed: true }]) : null),
    lineChart({
      series: [{ name: 'Visits', lead: true, values: days.map(r => r.visits) }, hasPrev && { name: 'Before', dashed: true, values: prev.map(r => r.visits) }],
      labels: days.map(r => shortDate(r.date)), note: noteAt(days, d.note), format: v => num(v), endFormat: v => num(v), height: 320, phoneHeight: 260,
      windowLabel: 'Daily, ' + span(days[0].date, days[days.length - 1].date), name: 'Visits',
      label: 'Visits by day' + (hasPrev ? ', against the days before' : ''),
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Visits ', b(num(days[i].visits))), ok(days[i].orders) && h('span', null, 'Orders ', b(num(days[i].orders))),
        hasPrev && prev[i] && ok(prev[i].visits) && h('span', null, 'Before ', b(num(prev[i].visits)))],
    }));
}

function pagesTable(ctx, d, L) {
  const rows = L.list.filter(r => ok(r.visits));
  if (!rows.length) return card({ title: 'Every landing page' }, notConnected(ctx, { title: 'No page numbers for these dates', text: 'Pick a longer range.' }));
  const max = Math.max(...rows.map(r => r.sales || 0), 1), hasSales = rows.some(r => ok(r.sales)), cl = d.clarity, hasAds = rows.some(r => r.ads.length);
  const thin = v => h('span', { class: 'em-none' }, v);
  const win = d.clarity_window || 'last 3 days';
  return card({ title: 'Every landing page', note: (d.range ? span(d.range.from, d.range.to) + ' · ' : '') + GA + (hasAds ? ', ad spend Meta' : '') + (cl ? `, scroll and rage clicks Microsoft Clarity (${win} only)` : '') + '. Tap a page for its detail', flush: true, class: 'em-flush em-wrap wp-tbl' },
    table({ rows, roomy: true, sort: { key: hasSales ? 'sales' : 'visits', dir: 'desc' }, onRow: r => openPage(ctx, d, r), cols: [
      { key: 'page', label: 'Page', sortable: true, render: r => h('span', { class: 'em-name', title: r.page }, nameOf(r), h('small', null, r.page)) },
      { key: 'visits', label: 'Visits', num: true, sortable: true, render: r => num(r.visits) },
      { key: 'bounce', label: 'Bounce', num: true, sortable: true, class: 'hide-md wp-xl', render: r => (ok(r.bounce) ? pct(r.bounce) : '') },
      hasSales && { key: 'cr', label: 'Add to cart', num: true, sortable: true, class: 'hide-md', render: r => (ok(r.cr) ? pct(r.cr, { digits: 1 }) : '') },
      hasSales && { key: 'cv', label: defl('Conversion', 'conversion_rate'), num: true, sortable: true, render: r => (ok(r.cv) ? pct(r.cv, { digits: 1 }) : '') },
      cl && { key: 'scroll', label: defl('Scroll', 'scroll_depth'), num: true, sortable: true, class: 'hide-md wp-xl', render: r => (ok(r.scroll) ? Math.round(r.scroll) + '%' : thin('none')) },
      cl && { key: 'rage', label: defl('Rage clicks', 'rage_clicks'), num: true, sortable: true, class: 'hide-md', render: r => (ok(r.rage) ? (r.rage >= 5 ? h('b', { class: 'em-bad' }, pct(r.rage / 100, { digits: 1 })) : pct(r.rage / 100, { digits: 1 })) : thin('none')) },
      hasAds && { key: 'ad_spend', label: 'Ad spend (Meta)', num: true, sortable: true, class: 'hide-sm', render: r => (r.ads.length ? h('span', { class: 'wp-ad-cell' }, usd(r.ad_spend, d.currency), h('small', null, num(r.ads.length) + (r.ads.length === 1 ? ' ad' : ' ads'))) : thin('no ads')) },
      hasSales && { key: 'sales', label: 'Sales (GA)', num: true, sortable: true, class: 'hide-sm', render: r => barCell(h('span', { class: 'strong' }, ok(r.sales) ? usd(r.sales, d.currency) : ''), (r.sales || 0) / max) },
    ].filter(Boolean) }));
}

function splitTable(title, rows, key, label) {
  if (!rows || !rows.length) return null;
  const tot = rows.reduce((t, r) => t + (r.visits || 0), 0) || 1;
  return card({ title, note: GA, flush: true, class: 'em-flush' },
    table({ rows, sort: { key: 'visits', dir: 'desc' }, cols: [
      { key, label, render: r => r[key] },
      { key: 'visits', label: 'Visits', num: true, render: r => barCell(num(r.visits), r.visits / tot) },
      { key: 'share', label: 'Share', num: true, render: r => pct(r.visits / tot) },
      { key: 'conversion', label: defl('Conversion', 'conversion_rate'), num: true, render: r => (ok(r.conversion) ? pct(r.conversion, { digits: 2 }) : '') },
    ] }));
}

function sources(d) {
  const lines = [
    d.analytics !== false ? [h('b', null, 'Visits, bounce, add to cart, checkout, orders and page sales'), ` are ${GA}' own count, for every visit from every channel. Bounce is the share of visits that did not engage.`]
      : [h('b', null, GA + ' is not linked'), ', so there are no visits or orders per page.'],
    [h('b', null, 'Ad spend'), ' is Meta. ', h('b', null, 'Sales and ROAS from the ads'), ` are ${TW}, last click. The landing page of each ad is read from the ad itself. Page sales (${GA}) and ad sales (${TW}) count different things, so do not divide one by the other.`],
    d.clarity ? [h('b', null, 'Scroll and rage clicks'), ` are Microsoft Clarity and cover ${d.clarity_window || 'the last 3 days'} only, whatever dates are picked.`] : null,
    [h('b', null, 'Page pictures and page speed'), ' are not connected yet.'],
  ].filter(Boolean);
  return h('div', { class: 'wp-src' }, lines.map(l => h('div', null, l)));
}

/* ---------- one page, opened from its card or row ---------- */
const DRILL = new Map();
function drillOf(ctx, d, r) {
  if (ctx.sample) return Promise.resolve(sampleDrill(d, r));
  if (!r.ga_page || !ctx.brand) return Promise.resolve(null);
  const p = before(ctx.range), k = [ctx.brand.id, r.ga_page, ctx.range.from, ctx.range.to].join('|');
  if (!DRILL.has(k)) DRILL.set(k, ctx.api(`/api/google/website-drill?act=${encodeURIComponent(ctx.brand.id)}&from=${ctx.range.from}&to=${ctx.range.to}&pfrom=${p.from}&pto=${p.to}&kind=page&value=${encodeURIComponent(r.ga_page)}`, { worker: 'ah' })
    .then(j => (j && !j.error ? { days: (j.days || []).map(x => ({ date: x.date, visits: x.sessions, orders: x.purchases ?? x.ecommercePurchases })), channels: (j.channels || []).map(c => ({ name: c.name, visits: c.sessions, orders: c.ecommercePurchases })) } : null))
    .catch(() => { DRILL.delete(k); return null; }));
  return DRILL.get(k);
}
/* Sample mode only: the page's share of the site's sample days, so the sheet has a line to draw. */
function sampleDrill(d, r) {
  const t = (d.totals || {}).visits, share = ok(r.visits) && t ? r.visits / t : null;
  if (!share) return null;
  const cv = rateOf(r.orders, r.visits) || 0;
  const days = (d.days || []).map((x, i) => { const v = Math.round(x.visits * share * (0.9 + 0.2 * ((i * 37 + r.page.length * 13) % 10) / 10)); return { date: x.date, visits: v, orders: Math.round(v * cv) }; });
  const ch = (d.channels || []).map(c => ({ name: c.name, visits: Math.round(c.visits * share), orders: Math.round(c.visits * share * (c.conversion || 0)) })).filter(c => c.visits > 0);
  return { days, channels: ch };
}

function openPage(ctx, d, r) {
  addStyles('wp-css', STYLE);
  const cur = d.currency, t = d.totals || {};
  const big = h('div', { class: 'wp-big' }), pv = preview(r, { big: true });
  let mode = 'desktop', live = null;
  const ctl = h('div', { class: 'wp-pv' });
  const drawCtl = () => put(ctl,
    live ? segmented([{ id: 'desktop', label: 'Desktop' }, { id: 'phone', label: 'Phone' }], mode, m => { mode = m; pv.classList.toggle('phone', m === 'phone'); live = liveInto(pv, r.url, m); }) : null,
    h('span', { class: 'sp' }),
    r.url && !live && !ctx.sample ? button('Show the live page here', { onclick: () => { live = liveInto(pv, r.url, mode); drawCtl(); } }) : null,
    r.url && safeHref(r.url) && !ctx.sample ? button('Open the page', { href: r.url, target: '_blank' }) : null,
    ctx.sample ? h('p', null, 'Sample mode: on a real brand the live page can show here, and it scrolls.') : null,
    live ? h('p', null, 'Many stores refuse to be shown inside another site. If the frame says it refused to connect, open the page instead.') : null);
  drawCtl();
  put(big, pv, ctl);

  const vsSite = (v, site) => (ok(v) && ok(site) && site > 0 ? (v >= site ? 'above' : 'under') + ' the site, ' + pct(site, { digits: 1 }) : '');
  const tile = (label, v, sub, cls) => h('div', null, h('small', null, label), v && v.nodeType ? v : h('b', { class: cls || null }, v), sub ? h('span', null, sub) : null);
  const side = h('div', { class: 'wp-side' },
    r.url && safeHref(r.url) ? h('div', { class: 'url' }, glyph('link'), h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer' }, r.url.replace(/^https?:\/\//, ''))) : h('p', { class: 'wp-quiet' }, r.page),
    h('div', { class: 'wp-tiles' },
      tile('Visits', ok(r.visits) ? num(r.visits) : na(), ok(r.visits) && t.visits ? pct(r.visits / t.visits, { digits: 1 }) + ' of all visits' : null),
      tile('Visits vs before', ok(r.change) ? signed(r.change) : na('no earlier days'), ok(r.visits_prev) ? num(r.visits_prev) + ' the days before' : null, ok(r.change) ? (r.change < -0.005 ? 'bad' : r.change > 0.005 ? 'good' : '') : ''),
      tile(defl('Conversion', 'conversion_rate'), ok(r.cv) ? pct(r.cv, { digits: 1 }) : na(), vsSite(r.cv, t.conversion)),
      tile('Add to cart', ok(r.cr) ? pct(r.cr, { digits: 1 }) : na(), vsSite(r.cr, t.cart_rate)),
      tile('Bounce', ok(r.bounce) ? pct(r.bounce) : na(), ok(r.bounce) ? 'visits that did not engage' : null),
      tile('Page sales, GA', ok(r.sales) ? usd(r.sales, cur) : na(), ok(r.sales) ? GA + "' own count" : null)),
    h('p', { class: 'wp-quiet' }, (d.range ? span(d.range.from, d.range.to) + ' · ' : '') + GA));

  /* the funnel: how many went on at each step. The step rate is the figure; the count sits under it. */
  const steps = [['Visits', r.visits], ['Add to cart', r.carts], ['Checkout', r.checkouts], ['Orders', r.orders]];
  const funnel = ok(r.visits) ? h('div', null, h('h4', { class: 'wp-h' }, 'What visitors did', h('small', null, GA)),
    h('div', { class: 'wp-fun' }, steps.map(([l, v], i) => {
      const prevV = i ? steps[i - 1][1] : null, step = i && ok(v) && ok(prevV) ? rateOf(v, prevV) : null;
      if (i === 0) return h('div', null, h('small', null, l), h('b', null, num(v)), h('span', null, 'landed on this page'));
      return h('div', null, h('small', null, l), ok(step) ? h('b', null, pct(step, { digits: 1 })) : na(),
        h('span', null, ok(v) ? num(v) + ' of ' + num(prevV) + ' went on' : 'not tracked yet'),
        ok(step) ? h('span', { class: 'lost' }, num(Math.max(0, prevV - v)) + ' stopped here') : null);
    }))) : null;

  const trendBox = h('div', null, h('h4', { class: 'wp-h' }, 'Visits by day', h('small', null, GA)), skeleton('chart'));
  const chanBox = h('div');
  const ads = r.ads || [];
  const adsBox = h('div', null, h('h4', { class: 'wp-h' }, ads.length ? `${num(ads.length)} ${ads.length === 1 ? 'ad points' : 'ads point'} here` : 'Ads pointing here',
    h('small', null, ads.length ? `Spend Meta · sales and ROAS ${TW}, last click` : '')),
    ads.length ? h('div', { class: 'wp-list' }, ads.map(a => h('button', { type: 'button', onclick: () => openAd(ctx, d, a) },
      h('span', { class: 'im' }, safeImg(a.thumb) ? h('img', { src: a.thumb, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : adGlyph(a)),
      h('span', { class: 'nm' }, h('b', null, a.name), h('small', null, [a.video ? 'Video' : 'Image', a.adset].filter(Boolean).join(' · '))),
      h('span', { class: 'v' }, usd(a.spend, cur), h('small', null, 'spend')),
      h('span', { class: 'v hide-sm' }, ok(a.revenue) ? usd(a.revenue, cur) : 'none', h('small', null, 'sales')),
      h('span', { class: 'v' }, ok(a.roas) ? xx(a.roas) : a.lead ? 'leads' : 'none', h('small', null, 'ROAS')))))
      : h('p', { class: 'wp-quiet' }, d.ads_state === 'ok' || d.ads_state === 'empty' ? 'No Meta ad with spend in these dates sends people to this page.' : d.ads_state === 'loading' ? 'The ads are still being read. Close and open this page again in a moment.' : 'The ads were not read this time.'));

  sheet({ title: nameOf(r), class: 'wp-wide', body: h('div', { class: 'wp-x' },
    h('div', { class: 'wp-top' }, big, side), funnel, adsBox, trendBox, chanBox) });

  drillOf(ctx, d, r).then(x => {
    if (!trendBox.isConnected) return;
    const days = x && x.days || [];
    if (days.length < 2) { put(trendBox, h('h4', { class: 'wp-h' }, 'Visits by day'), h('p', { class: 'wp-quiet' }, ctx.sample || r.ga_page ? 'No day by day numbers for this page in these dates.' : 'This page is not in ' + GA + "'s landing pages for these dates.")); return; }
    const b = v => h('b', null, v);
    put(trendBox, h('h4', { class: 'wp-h' }, 'Visits by day', h('small', null, GA)), lineChart({
      series: [{ name: 'Visits', lead: true, values: days.map(q => q.visits) }], labels: days.map(q => shortDate(q.date)), format: v => num(v), endFormat: v => num(v),
      height: 220, phoneHeight: 200, windowLabel: 'Daily, ' + span(days[0].date, days[days.length - 1].date), name: 'Visits', label: 'Visits to this page by day',
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Visits ', b(num(days[i].visits))), ok(days[i].orders) && h('span', null, 'Orders ', b(num(days[i].orders)))] }));
    const ch = (x.channels || []).filter(c => c.visits > 0).sort((p, q) => q.visits - p.visits).slice(0, 6);
    if (ch.length) put(chanBox, h('h4', { class: 'wp-h' }, 'Where its visits came from', h('small', null, GA)),
      h('div', { class: 'wp-kv' }, ch.map(c => h('p', null, h('span', null, c.name), h('b', null, num(c.visits) + (ok(c.orders) ? ' visits, ' + num(c.orders) + ' orders' : ' visits'))))));
  });
}

/* ---------- page ---------- */
const page = {
  title: ['Where do the ads ', em('send people?')],
  eyebrow: 'Website',

  /* Google Analytics and Clarity only: the page draws from these at once, and render reads the ads after. */
  async load(ctx) {
    if (!ctx.brand) return { connected: false };
    const a = encodeURIComponent(ctx.brand.id), p = before(ctx.range);
    const [g, cl] = await Promise.all([
      soft(ctx, ctx.api(`/api/google/website?act=${a}&from=${ctx.range.from}&to=${ctx.range.to}&pfrom=${p.from}&pto=${p.to}`, { worker: 'ah', signal: ctx.signal })),
      soft(ctx, ctx.api(`/api/clarity?act=${a}`, { worker: 'ah', signal: ctx.signal })),
    ]);
    const out = shape(ctx, g || { error: 'not_linked' }, cl || { error: 'not_linked' });
    return Object.assign(out, { ads_state: 'loading', ads: [], window: { from: ctx.range.from, to: ctx.range.to }, speed: null });
  },

  skeleton(el) { put(el, h('div', { class: 'lx-skel-grid' }, skeleton('kpi', 4)), skeleton('chart'), skeleton('row', 6)); },

  render(el, d, ctx) {
    css(); addStyles('wp-css', STYLE);
    d = d || {};
    /* the ads arrive after the Google Analytics numbers: draw now, then draw again in place once they land */
    if (d.ads_state === 'loading' && !ctx.sample && ctx.brand) {
      const { key, wait } = adsFor(ctx, d);
      el.__wpAds = key;
      wait.then(ads => ({ ...d, ...ads, site: d.site || ads.site || null, connected: d.connected !== false || ads.ads.length > 0 }),
        e => (e && (e.name === 'AbortError' || e.status === 401) ? null : { ...d, ads_state: 'error' }))
        .then(nd => { if (nd && el.isConnected && el.__wpAds === key) page.render(el, nd, ctx); });
    } else el.__wpAds = null;
    if (d.connected === false && d.ads_state !== 'loading') {
      ctx.askContext = 'The Website page for this brand has no source connected yet: no Google Analytics and no Meta ads.';
      put(el, notConnected(ctx, { title: 'No website source connected',
        text: 'Your landing pages show here once the store\'s Google Analytics is linked.',
        teamText: 'Link the brand\'s Google Analytics property (and Microsoft Clarity for scroll and rage clicks) in Brand settings, Integrations, and the landing pages show here.' }));
      return;
    }
    const L = landing(d);
    const t = d.totals || {};
    const paid = L.list.filter(r => r.ads.length);
    const topPage = sortRows(paid, 'ad_spend')[0];
    ctx.askWindow = d.range ? span(d.range.from, d.range.to) : null;
    ctx.askContext = [
      `Website page for ${d.range ? span(d.range.from, d.range.to) : 'these dates'}: ${ok(t.visits) ? num(t.visits) + ' visits to the whole site, conversion ' + pct(t.conversion || 0, { digits: 2 }) + ' (' + GA + ')' : 'no Google Analytics visits'}.`,
      paid.length ? `${num(paid.length)} landing pages get Meta ads; the most ad spend goes to ${nameOf(topPage)} (${usd(topPage.ad_spend)}, ${ok(topPage.cv) ? pct(topPage.cv, { digits: 1 }) + ' conversion' : 'conversion not tracked'}).` : d.ads_state === 'loading' ? 'The Meta ads are still being read.' : 'No ad landing pages read.',
    ].join(' ');
    const two = [splitTable('Phone or desktop', d.devices, 'device', 'Device'), splitTable('Where visits came from', d.channels, 'name', 'Channel')].filter(Boolean);
    put(el, ...[
      h('p', { class: 'wp-lead' }, 'Every page your ads and visitors land on: how many people came, how many bought, and ', h('b', null, 'which ads send people there'), '. Tap a page to see it bigger.'),
      d.analytics !== false && h('section', { class: 'lx-hero line' }, h('p', { class: 'wp-band-l' }, 'Whole site, all visits'), figures(d)),
      d.analytics === false && empty({ title: GA + ' is not linked', text: 'Visits, conversion and sales per page show once it is. The ads and the pages they point to are below.' }),
      verdict(L, ctx, d),
      gallery(ctx, d, L),
      chartCard(d),
      pagesTable(ctx, d, L),
      two.length === 2 ? h('div', { class: 'em-two wp-two-b' }, two) : two[0],
      sources(d),
    ].flat().filter(Boolean));
  },
};
export default page;
