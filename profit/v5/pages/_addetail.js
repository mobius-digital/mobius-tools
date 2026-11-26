/* The shared ad detail: one sheet for one Meta ad, used by Meta, Reports, Home and the War Room.
   A centered modal on a desktop, a sheet from the bottom on a phone (kit sheet).

     import { openAdDetail } from '../_addetail.js';
     openAdDetail(ctx, ad, { act, adsetAds, window, goals, currency });

   ad: whatever the page already has for the ad. Only `id` and `name` are needed; every other field the page passes
   is used as is and the rest is read here (see FIELDS below). A missing number is left out or says so, never a zero.
   opts.act       the brand id (ctx.brand.id when left out).
   opts.adsetAds  the other ads in the same ad set, if the page already has them (same field names as ad).
   opts.window    { from, to, label } the numbers' dates (the ad's own window, else ctx.range, else the last 14 days).
   opts.goals     { roas, cpa } the brand's goals, when the page has them.

   What old Locus showed for an ad (v2.js previewAd, index.html adDetailModal) and where each part comes from now:
     numbers, funnel, first click and last click sales, ad set totals, share and rank
                         GET /api/hub/creative?act=&from=&to=&model=lastPlatformClick   profit worker (ported in the engine)
     day by day          GET /api/hub/ad-days?act=&ads=<id>&model=lastPlatformClick     profit worker (old engine, forwarded)
     orders and new customers on each model
                         GET /api/hub/orders?act=&ad=<id>&model=lastPlatformClick|fullFirstClick&from=&to=   profit worker (forwarded)
     the Locus call      GET /api/buyer-list?act=                                         account-health (team only, forwarded)
     the picture         GET /api/ad-creatives?act=&ads=<id>                              account-health (forwarded)
     play                GET /api/ad-video?ad=<id>&mode=preview                           account-health, only when Play is pressed
   Reads run one at a time, each once per ad and window (kept for the page's life), and only for what the page did
   not pass. Sample mode reads pages/_sample/addetail.json and nothing else. Read only: this file never writes.

   FIELDS (the ad object, all optional except id):
     id, name, status | effective_status, media_type ('video' | 'image') | video (bool), thumb | image, video_url,
     campaign, adset (name, or { id, name, spend, purchases, revenue, roas, cpa, ads }), adset_id, adset_name, set (scorecard),
     spend, revenue, purchases, roas, cpa, ctr, cpc, cpm, frequency, hook, hold, impressions, clicks, atc, checkouts,
     lc_rev, fc_rev, lc_orders, fc_orders, nc, nc_fc, platform_purchases, platform_revenue, set_share, set_rank, age,
     days [{ date, spend, revenue }], call ({ call | label, tone, why } or text) and why, window, currency, goals. */

import { h, svgNode, money, num, pct, x as xx, pill, button, sheet, lineChart, legend, put, addStyles, safeHref, noDash, toast } from '../kit.js';
import { fixture } from '../data.js';
import { defLabel } from '../defs.js';
import { picture, css as pictureCss } from './production/_ui.js';

const ok = n => n != null && isFinite(n);
const div = (a, b) => (ok(a) && ok(b) && b > 0 ? a / b : null);
const iso = d => d.toISOString().slice(0, 10);
const shortDate = s => new Date(String(s).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const span = (from, to) => {
  if (!from || !to) return '';
  const a = shortDate(from), b = shortDate(to);
  return a.split(' ')[0] === b.split(' ')[0] ? a + ' to ' + b.split(' ')[1] : a + ' to ' + b;
};
const TW = 'Triple Whale';

/* ---------- definitions the local glossary may not have yet ---------- */
const DEF = {
  hook: { title: 'Hook rate', body: 'Of the people shown the video, the share who watched at least 3 seconds. 30% or more is strong.', source: 'Meta' },
  hold: { title: 'Hold rate', body: 'Of the people who watched 3 seconds, the share who kept watching to the end (ThruPlay).', source: 'Meta' },
  cpc: { title: 'CPC', body: 'Cost per link click: spend divided by the clicks that went to the site.', formula: 'Spend / Link clicks', source: 'Meta' },
  first: { title: 'First click', body: 'Triple Whale gives the whole sale to the first ad the buyer clicked. An ad strong here starts journeys.', source: TW },
  last: { title: 'Last click', body: 'Triple Whale gives the whole sale to the last ad the buyer clicked on this platform before buying. The standard for every ROAS in Locus.', source: TW },
  nc: { title: 'New customers', body: 'Buyers whose first order with the store came through this ad.', source: TW },
};

/* ---------- reads: one at a time, once per ad ---------- */
const EXTRA = new Map();      // act|id|from|to -> Promise of the extra fields
const CREATIVE = new Map();   // act|from|to -> Promise of the /api/hub/creative answer (shared by every ad of the brand)
const CALLS = new Map();      // act -> Promise of the buyer-list answer
const VIDEO = new Map();      // id -> Promise of { src, preview }
let FIX = null;

const quiet = p => Promise.resolve(p).catch(() => null);

function windowOf(ctx, a, opts) {
  const w = opts.window || a.window || (ctx.range && ctx.range.from ? ctx.range : null);
  if (w && w.from && w.to) return { from: w.from, to: w.to, label: w.label || span(w.from, w.to) };
  const to = new Date(Date.now() - 864e5), from = new Date(to.getTime() - 13 * 864e5);
  return { from: iso(from), to: iso(to), label: span(iso(from), iso(to)) };
}

/** Everything the page did not pass, read in order, each step drawn as it lands (step(extra) after each). */
async function readMore(ctx, a, opts, w, step) {
  const act = opts.act || (ctx.brand && ctx.brand.id) || '';
  const key = [act, a.id, w.from, w.to].join('|');
  if (ctx.sample) {
    if (!EXTRA.has(key)) EXTRA.set(key, sampleExtra(a, w));
    step(await EXTRA.get(key));
    return;
  }
  if (EXTRA.has(key)) { step(await EXTRA.get(key)); return; }
  let done;
  EXTRA.set(key, new Promise(r => { done = r; }));
  const out = { notes: [] };
  const A = encodeURIComponent(act), id = encodeURIComponent(a.id), real = /^\d{5,25}$/.test(String(a.id || ''));
  const api = (path, worker) => ctx.api(path, { worker });
  try {
    if (!act || !real) { out.notes.push('no_id'); return; }
    /* 1. the ad's own row and its ad set, unless the page passed both */
    const needRow = !ok(a.spend) || a.impressions == null || a.fc_rev == null;
    const needSibs = !(opts.adsetAds && opts.adsetAds.length);
    if (needRow || needSibs) {
      const ck = [act, w.from, w.to].join('|');
      if (!CREATIVE.has(ck)) CREATIVE.set(ck, quiet(api(`/api/hub/creative?act=${A}&from=${w.from}&to=${w.to}&model=lastPlatformClick`, 'profit')));
      const cr = await CREATIVE.get(ck);
      if (cr && Array.isArray(cr.ads)) {
        const row = cr.ads.find(r => String(r.id) === String(a.id));
        if (row) {
          out.row = row;
          const sid = row.adset_id || (row.adset && row.adset.id);
          if (sid) out.sibs = cr.ads.filter(r => String(r.adset_id || (r.adset && r.adset.id)) === String(sid));
        } else out.notes.push('no_row');
        out.goals = cr.goals || null; out.currency = cr.currency || null;
      } else out.notes.push('no_creative');
      step(out);
    }
    /* 2. day by day */
    if (!a.days) {
      const r = await quiet(api(`/api/hub/ad-days?act=${A}&ads=${id}&model=lastPlatformClick`, 'profit'));
      out.days = r && Array.isArray(r.days) ? r.days : [];
      out.days_pending = !!(r && r.days && r.days.some(d => d.attr_pending));
      step(out);
    }
    /* 3. orders and new customers, last click then first click (Triple Whale's per order list) */
    if (a.nc == null || a.lc_orders == null) {
      for (const [k, model] of [['lc', 'lastPlatformClick'], ['fc', 'fullFirstClick']]) {
        const r = await quiet(api(`/api/hub/orders?act=${A}&ad=${id}&model=${model}&from=${w.from}&to=${w.to}`, 'profit'));
        if (r && Array.isArray(r.orders)) out[k] = { orders: r.orders.length, nc: ok(r.new_customers) ? r.new_customers : null, sales: ok(r.total) ? r.total : null, capped: r.orders.length >= 300 };
        step(out);
      }
    }
    /* 4. the Locus call (team only) */
    if (!a.call && !ctx.isClient) {
      if (!CALLS.has(act)) CALLS.set(act, quiet(api(`/api/buyer-list?act=${A}`, 'ah')));
      const bl = await CALLS.get(act);
      const rows = bl ? [...(bl.rows || []), ...(bl.quiet || [])] : [];
      const hit = rows.find(r => r.level === 'ad' && String(r.ad_id || r.object_id) === String(a.id));
      if (hit) out.call = { label: hit.call || hit.kind, tone: TONE[hit.kind] || '', why: hit.because || hit.why || '' };
      step(out);
    }
    /* 5. the picture */
    if (!a.thumb && !a.image) {
      const r = await quiet(api(`/api/ad-creatives?act=${A}&ads=${id}`, 'ah'));
      const v = r && r.assets && r.assets[a.id];
      if (v) { out.thumb = v.thumb || v.image || null; if (v.video != null) out.video = !!v.video; out.preview = v.preview || null; }
      step(out);
    }
  } finally { done(out); step(out); }
}
const TONE = { scale: 'good', raise: 'good', keep: 'good', cut: 'bad', pause: 'bad', trim: 'warn', refresh: 'warn', watch: 'warn' };

async function sampleExtra(a, w) {
  FIX = FIX || fixture('_sample/addetail.json').catch(() => null);
  const f = await FIX;
  if (!f) return { notes: ['no_fixture'] };
  const row = f.ads.find(r => r.id === a.id && (!a.name || r.name === a.name)) || f.ads.find(r => r.name === a.name) || null;
  if (row) {
    const sibs = f.ads.filter(r => r.adset_id === row.adset_id);
    const c = f.calls[row.id];
    return { row, sibs, goals: f.goals, currency: f.currency, window: f.window, days: row.days,
      call: c ? { label: c.call, tone: c.tone, why: c.why } : null, notes: [] };
  }
  /* a page with its own sample ads (Reports): borrow the shape of the fixture ad with the same id, but every number,
     day and ad set row is made from the card's own numbers and dates, so one modal never shows two ads */
  const base = f.ads.find(r => r.id === a.id) || null;
  if (!base || !ok(a.spend)) return { goals: f.goals, currency: f.currency, notes: ['no_row'] };
  return { ...borrow(base, a, f, w), goals: f.goals, currency: f.currency, notes: [] };
}
function borrow(base, a, f, w) {
  const k = a.spend / (base.spend || 1);
  const rev = ok(a.revenue) ? a.revenue : ok(a.roas) ? a.roas * a.spend : base.revenue * k;
  const kr = base.revenue > 0 ? rev / base.revenue : k;
  const ord = ok(a.purchases) ? a.purchases : Math.round(base.purchases * kr);
  const ko = base.purchases > 0 ? ord / base.purchases : kr;
  const n = (v, m) => ok(v) ? Math.round(v * m) : v;
  const row = { ...base, id: a.id, name: a.name || base.name, spend: a.spend, revenue: rev, purchases: ord, lc_rev: rev, lc_orders: ord,
    roas: div(rev, a.spend), cpa: div(a.spend, ord), impressions: n(base.impressions, k), clicks: n(base.clicks, k), atc: n(base.atc, ko), checkouts: n(base.checkouts, ko),
    fc_rev: ok(base.fc_rev) ? base.fc_rev * kr : null, fc_orders: n(base.fc_orders, ko), nc: n(base.nc, ko), nc_fc: n(base.nc_fc, ko),
    platform_purchases: n(base.platform_purchases, ko), platform_revenue: ok(base.platform_revenue) ? base.platform_revenue * kr : null };
  row.media_type = a.media_type || base.media_type;
  /* days inside the card's window, shaped like the borrowed ad's days and adding up to the card's spend and sales */
  let days = null;
  if (w && w.from && w.to && base.days && base.days.length) {
    const dates = []; for (let d = new Date(w.from + 'T12:00:00'); d <= new Date(w.to + 'T12:00:00') && dates.length < 92; d.setDate(d.getDate() + 1)) dates.push(d.toLocaleDateString('en-CA'));
    const src = dates.map((_, i) => base.days[i % base.days.length]);
    const sS = src.reduce((t, d) => t + (+d.spend || 0), 0) || 1, sR = src.reduce((t, d) => t + (+d.revenue || 0), 0) || 1;
    days = dates.map((date, i) => ({ date, spend: Math.round(100 * a.spend * (+src[i].spend || 0) / sS) / 100, revenue: Math.round(100 * rev * (+src[i].revenue || 0) / sR) / 100 }));
  }
  row.days = days;
  /* its ad set: the other ads of the borrowed set, scaled to the card's window length */
  const len = w && w.from && w.to ? Math.round((new Date(w.to) - new Date(w.from)) / 864e5) + 1 : null;
  const flen = f.window ? Math.round((new Date(f.window.to) - new Date(f.window.from)) / 864e5) + 1 : null;
  const kt = len && flen ? len / flen : 1;
  const sibs = f.ads.filter(r => r.adset_id === base.adset_id && r.id !== base.id)
    .map(r => ({ ...r, spend: Math.round(r.spend * kt), revenue: r.revenue * kt, purchases: Math.round(r.purchases * kt), roas: null, cpa: null }))
    .concat([{ id: row.id, name: row.name, spend: row.spend, revenue: rev, purchases: ord, video: row.media_type === 'video', status: row.status }]);
  return { row, sibs, days, window: w ? { from: w.from, to: w.to, label: w.label } : null };
}

/* ---------- one shape for whatever came in ---------- */
function shape(a, e, opts) {
  const r = { ...(e.row || {}), ...strip(a) };
  const setObj = (a.set && typeof a.set === 'object' && a.set) || (a.adset && typeof a.adset === 'object' && a.adset) || (e.row && e.row.adset && typeof e.row.adset === 'object' && e.row.adset) || null;
  r.adsetName = (typeof a.adset === 'string' && a.adset) || a.adset_name || (setObj && setObj.name) || (e.row && e.row.adset_name) || null;
  r.video = a.video != null ? !!a.video : e.video != null ? e.video : (r.media_type || '') === 'video';
  r.thumb = a.thumb || a.cover || a.image || e.thumb || r.thumb || null;
  /* sample mode: the same stand-in drawing the opening card showed (meta/_rest.js adTile), never a real ad's */
  r.art = a.art && typeof a.art === 'object' ? a.art : null;
  r.preview = a.preview || e.preview || null;
  /* the caller's own numbers are Triple Whale last click: they win over a fetched row, so the card, the grid, the
     last click column and the ad set row all read one figure */
  if (ok(a.revenue) && a.lc_rev == null) r.lc_rev = a.revenue;
  if (ok(a.purchases) && a.lc_orders == null) r.lc_orders = a.purchases;
  if (r.lc_rev == null && ok(r.revenue)) r.lc_rev = r.revenue;
  if (r.lc_orders == null) r.lc_orders = e.lc ? e.lc.orders : ok(r.purchases) ? r.purchases : null;
  if (r.fc_orders == null && e.fc) r.fc_orders = e.fc.orders;
  if (r.nc == null && e.lc) r.nc = e.lc.nc;
  if (r.nc_fc == null && e.fc) r.nc_fc = e.fc.nc;
  if (!ok(r.roas)) r.roas = div(r.revenue, r.spend);
  if (!ok(r.cpa)) r.cpa = div(r.spend, r.purchases);
  if (!ok(r.cpc)) r.cpc = div(r.spend, r.clicks);
  if (!ok(r.ctr)) r.ctr = div(r.clicks, r.impressions);
  if (!ok(r.cpm)) r.cpm = div(ok(r.spend) ? r.spend * 1000 : null, r.impressions);
  r.days = a.days || e.days || null;
  r.call = callOf(a.call, a.why) || e.call || null;
  r.goals = opts.goals || a.goals || e.goals || {};
  r.currency = opts.currency || a.currency || e.currency || 'USD';
  /* the ad set: its other ads ranked by spend, this ad among them */
  let sibs = (opts.adsetAds && opts.adsetAds.length ? opts.adsetAds : e.sibs) || [];
  sibs = sibs.map(o => ({ ...o, roas: ok(o.roas) ? o.roas : div(o.revenue, o.spend), cpa: ok(o.cpa) ? o.cpa : div(o.spend, o.purchases) }));
  sibs = sibs.map(o => String(o.id) === String(r.id) ? { ...o, name: r.name, spend: r.spend, revenue: r.revenue, purchases: r.purchases, roas: r.roas, cpa: r.cpa } : o);
  if (sibs.length && !sibs.some(o => String(o.id) === String(r.id))) sibs.push({ id: r.id, name: r.name, spend: r.spend, revenue: r.revenue, purchases: r.purchases, roas: r.roas, cpa: r.cpa, video: r.video, thumb: r.thumb, status: r.status });
  sibs.sort((p, q) => (q.spend || 0) - (p.spend || 0));
  r.sibs = sibs;
  const tot = sibs.length ? sibs.reduce((t, o) => ({ spend: t.spend + (+o.spend || 0), revenue: t.revenue + (+o.revenue || (ok(o.roas) ? o.roas * (+o.spend || 0) : 0)), purchases: t.purchases + (+o.purchases || 0) }), { spend: 0, revenue: 0, purchases: 0 }) : null;
  const set = setObj ? { ...setObj } : tot ? { ...tot } : null;
  if (set) {
    if (!ok(set.spend) && tot) Object.assign(set, tot);
    set.name = set.name || r.adsetName;
    set.ads = set.ads || (sibs.length || null);
    if (!ok(set.roas)) set.roas = div(set.revenue, set.spend);
    if (!ok(set.cpa)) set.cpa = div(set.spend, set.purchases);
  }
  r.set = set;
  const k = sibs.findIndex(o => String(o.id) === String(r.id));
  r.rank = ok(r.set_rank) ? r.set_rank : k >= 0 ? k + 1 : null;
  r.share = ok(r.set_share) ? r.set_share : set && ok(r.spend) ? div(r.spend, set.spend) : null;
  return r;
}
const strip = a => Object.fromEntries(Object.entries(a || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''));
function callOf(c, why) {
  if (!c) return null;
  if (typeof c === 'string') return { label: c, tone: TONE[c.toLowerCase()] || '', why: why || '' };
  if (Array.isArray(c)) return { label: c[0], tone: c[1] || '', why: why || '' };
  return { label: c.call || c.label || c.kind || '', tone: c.tone || TONE[String(c.kind || '').toLowerCase()] || '', why: c.why || c.because || why || '' };
}

/* ---------- the parts ---------- */
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
const PIC = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M4 16l4.5-4.5 4 4 2.5-2.5L20 17"/><circle cx="15.5" cy="9.5" r="1.2"/></svg>';

function media(ctx, A, state) {
  const box = h('div', { class: 'adx-media' + (A.video ? ' vid' : '') });
  const cover = () => {
    const kids = [];
    if (A.thumb) {
      const img = h('img', { src: A.thumb, alt: (A.video ? 'Cover of the video ad ' : 'The image ad ') + (A.name || ''), decoding: 'async', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', () => { img.remove(); box.classList.add('none'); }, { once: true });
      kids.push(img);
    } else if (A.art) {
      /* sample mode: the card's own stand-in picture (production/_ui.js picture), so the detail matches the card */
      pictureCss();
      kids.push(picture({ art: A.art, video: false, ratio: 'auto', alt: A.name || '' }));
    } else kids.push(h('span', { class: 'ph' }, svgNode(PIC), h('span', null, A.video ? 'No cover yet' : 'No picture yet')));
    if (A.video) kids.push(h('button', { class: 'adx-play', type: 'button', 'aria-label': 'Play this video ad', title: 'Play', onclick: () => play() }, svgNode(PLAY), 'Play'));
    box.classList.toggle('none', !A.thumb && !A.art);
    put(box, kids);
  };
  async function play() {
    put(box, h('span', { class: 'ph' }, h('span', null, 'Loading the video...')));
    try {
      let src = safeHref(A.video_url), link = null;
      if (!src && !ctx.sample && /^\d{5,25}$/.test(String(A.id || ''))) {
        if (!VIDEO.has(A.id)) { const p = ctx.api(`/api/ad-video?ad=${encodeURIComponent(A.id)}&mode=preview`, { worker: 'ah' }); VIDEO.set(A.id, p); p.catch(() => VIDEO.delete(A.id)); }
        const v = await VIDEO.get(A.id);
        src = safeHref(v && v.src); link = safeHref(v && v.preview);
        if (!src && !link) throw new Error((v && v.reason) || 'Meta has no playable file for this ad.');
      }
      if (!src && !link) throw new Error(ctx.sample ? 'Sample numbers have no video file. The real ad plays here.' : 'This ad has no playable file.');
      if (!box.isConnected) return;
      box.classList.remove('none');
      if (src) {
        const v = h('video', { src, controls: true, autoplay: true, playsinline: true, preload: 'auto', poster: A.thumb || null });
        put(box, v); state.video = v;
      } else {
        box.classList.add('frame');
        put(box, h('iframe', { src: link, title: 'Meta preview of this ad', allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: true, scrolling: 'no', referrerpolicy: 'no-referrer' }));
      }
    } catch (err) {
      cover();
      box.append(h('span', { class: 'adx-mmsg' }, noDash(err.message || 'Could not play this video.')));
    }
  }
  state.setThumb = t => { if (t && !A.thumb) { A.thumb = t; if (!state.video && !box.classList.contains('frame')) cover(); } };
  cover();
  return box;
}

function statusPill(A) {
  const s = String(A.effective_status || A.status || '').toUpperCase();
  if (!s) return null;
  if (s === 'ACTIVE') return pill('good', 'Live');
  if (/PAUSED/.test(s)) return pill('', s === 'ADSET_PAUSED' ? 'Ad set off' : s === 'CAMPAIGN_PAUSED' ? 'Campaign off' : 'Off');
  if (/DISAPPROVED|REJECTED/.test(s)) return pill('bad', 'Not approved');
  if (/REVIEW/.test(s)) return pill('warn', 'In review');
  return pill('', s.toLowerCase().replace(/_/g, ' '));
}

function head(ctx, A, w, mediaBox) {
  const live = ok(A.age) ? A.age + 1 : null;
  const row = (label, value) => value ? h('div', { class: 'kv' }, h('span', null, label), h('b', { title: value }, value)) : null;
  const c = A.call;
  const viewImg = !A.video && safeHref(A.image || A.thumb);
  return h('div', { class: 'adx-top' },
    h('div', { class: 'adx-mcol' }, mediaBox,
      viewImg ? button('View full image', { href: viewImg, target: '_blank', ghost: true, class: 'adx-view' }) : null),
    h('div', { class: 'adx-info' },
      h('div', { class: 'chips' }, statusPill(A), h('span', { class: 'adx-chip' }, A.video ? 'Video' : 'Image'), live ? h('span', { class: 'adx-chip' }, live + (live === 1 ? ' day' : ' days') + ' running') : null),
      h('div', { class: 'adx-where' }, row('Campaign', A.campaign), row('Ad set', A.adsetName)),
      c && c.label && !ctx.isClient ? h('div', { class: 'adx-call ' + (c.tone || '') },
        h('div', { class: 'ch' }, h('span', { class: 'eb' }, 'Locus call'), pill(c.tone || '', noDash(c.label))),
        c.why ? h('p', null, noDash(c.why)) : null,
        h('span', { class: 'src' }, 'From the ad rules: wait for twice the goal spend and 3 days, the ad set first.')) : null,
      h('p', { class: 'adx-win' }, 'Numbers for ' + (w.label || 'these dates') + ' · sales and ROAS ' + TW + ' last click, delivery Meta')));
}

function metrics(A) {
  const cur = A.currency, g = A.goals || {};
  const t = (label, key, value, sub, tone) => h('div', { class: 'adx-tile' }, h('span', { class: 'l' }, key ? defLabel(label, key) : label),
    h('span', { class: 'v ' + (tone || '') + (value == null ? ' na' : '') }, value == null ? 'not tracked yet' : value), sub ? h('span', { class: 's' }, sub) : null);
  const roasTone = ok(A.roas) && g.roas ? (A.roas >= g.roas ? 'good' : 'bad') : '';
  const cpaTone = ok(A.cpa) && g.cpa ? (A.cpa <= g.cpa ? 'good' : 'bad') : '';
  const lead = A.obj === 'leads' || A.lead;
  const tiles = [
    t('Spend', null, ok(A.spend) ? money(Math.round(A.spend), { cur }) : null, 'Meta'),
    lead ? t('Leads', null, ok(A.leads) ? num(A.leads) : null, 'Meta') : t('Sales', null, ok(A.revenue) ? money(Math.round(A.revenue), { cur }) : null, TW + ', last click'),
    lead ? t('Cost per lead', null, ok(A.cpl) ? money(A.cpl, { cur, cents: true }) : null, 'Meta') : t('ROAS', 'roas', ok(A.roas) ? xx(A.roas) : ok(A.spend) ? 'no sales yet' : null, g.roas ? 'goal ' + xx(g.roas) : TW + ', last click', roasTone),
    lead ? null : t('Orders', null, ok(A.purchases) ? num(A.purchases) : null, TW + ', last click'),
    lead ? null : t('Cost per sale', 'cpa', ok(A.cpa) ? money(A.cpa, { cur }) : ok(A.spend) ? 'no sales yet' : null, g.cpa ? 'goal ' + money(g.cpa, { cur }) : TW + ', last click', cpaTone),
    lead ? null : t('New customers', DEF.nc, ok(A.nc) ? num(A.nc) : null, ok(A.nc) && ok(A.spend) && A.nc > 0 ? money(A.spend / A.nc, { cur }) + ' each' : TW + ', last click'),
    t('CTR', 'ctr', ok(A.ctr) ? pct(A.ctr, { digits: 2 }) : null, ok(A.clicks) ? num(A.clicks) + ' link clicks' : null),
    t('CPC', DEF.cpc, ok(A.cpc) ? money(A.cpc, { cur, cents: true }) : null),
    t('CPM', 'cpm', ok(A.cpm) ? money(A.cpm, { cur, cents: true }) : null, ok(A.impressions) ? num(A.impressions) + ' impressions' : null),
    t('Frequency', 'frequency', ok(A.frequency) ? A.frequency.toFixed(2) : null, 'times each person saw it'),
    A.video ? t('Hook rate', DEF.hook, ok(A.hook) ? pct(A.hook) : null, 'watched 3 seconds') : null,
    A.video ? t('Hold rate', DEF.hold, ok(A.hold) ? pct(A.hold) : null, 'watched to the end') : null,
  ].filter(Boolean);
  return h('section', { class: 'adx-sec' }, h('h3', null, 'The numbers'), h('div', { class: 'adx-grid' }, tiles));
}

function funnel(A) {
  const steps = [
    ['Impressions', A.impressions, 'Meta'],
    ['Link clicks', A.clicks, 'Meta'],
    ['Add to cart', A.atc, 'Meta'],
    ['Checkout', A.checkouts, 'Meta'],
    ['Orders', A.purchases, TW],
  ];
  const top = ok(A.impressions) && A.impressions > 0 ? A.impressions : null;
  const rateWord = ['', 'click rate', 'add to cart', 'reach checkout', 'buy'];
  const cells = [];
  steps.forEach(([label, v, src], i) => {
    if (i > 0) {
      const prev = steps[i - 1][1], r = div(v, prev);
      cells.push(h('div', { class: 'adx-rate' + (r == null ? ' na' : ''), 'aria-hidden': r == null ? 'true' : null },
        h('b', null, r == null ? '' : pct(r, { digits: r < 0.1 ? 1 : 0 })), h('span', null, r == null ? '' : rateWord[i])));
    }
    const w = top && ok(v) && v > 0 ? Math.max(6, 100 * Math.log10(v + 1) / Math.log10(top + 1)) : 0;
    cells.push(h('div', { class: 'adx-step' + (ok(v) ? '' : ' na') },
      h('span', { class: 'l' }, label),
      h('b', null, ok(v) ? num(v) : 'not tracked yet'),
      h('span', { class: 'bar' }, h('i', { style: { width: w.toFixed(1) + '%' } })),
      h('span', { class: 's' }, src)));
  });
  const missing = steps.filter(s => !ok(s[1])).map(s => s[0].toLowerCase());
  return h('section', { class: 'adx-sec' },
    h('h3', null, 'Funnel', h('span', { class: 'note' }, 'From the first view to the sale')),
    h('div', { class: 'adx-funnel' }, cells),
    missing.length ? h('p', { class: 'adx-na' }, cap(list(missing)) + ' not tracked yet for this ad.') : null);
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const list = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

function clicks(A, e) {
  const cur = A.currency;
  const fcR = div(A.fc_rev, A.spend), lcR = div(A.lc_rev, A.spend);
  const cell = v => h('td', { class: 'num' + (v == null ? ' na' : '') }, v == null ? 'not tracked yet' : v);
  const rows = [
    ['Sales', ok(A.fc_rev) ? money(Math.round(A.fc_rev), { cur }) : null, ok(A.lc_rev) ? money(Math.round(A.lc_rev), { cur }) : null],
    ['ROAS', fcR != null ? xx(fcR) : null, lcR != null ? xx(lcR) : null, 'roas'],
    ['Orders', ok(A.fc_orders) ? num(A.fc_orders) : null, ok(A.lc_orders) ? num(A.lc_orders) : null],
    ['New customers', ok(A.nc_fc) ? num(A.nc_fc) : null, ok(A.nc) ? num(A.nc) : null, DEF.nc],
  ];
  let role = null;
  if (ok(A.fc_rev) && ok(A.lc_rev) && A.fc_rev + A.lc_rev > 0) {
    if (A.fc_rev >= A.lc_rev * 1.3) role = 'Opener: Triple Whale credits it far more on first click, so it starts journeys. Judge it with that in mind before cutting it.';
    else if (A.lc_rev >= A.fc_rev * 1.3) role = 'Closer: Triple Whale credits it more on last click, so it closes people other ads warmed up.';
    else role = 'About even on first and last click: it both starts and closes sales.';
  }
  const pp = A.platform_purchases, pr = A.platform_revenue;
  const meta = ok(pp) || ok(pr) ? h('div', { class: 'adx-meta' },
    h('div', { class: 'mh' }, h('b', null, "Meta's own count"), h('span', null, 'a second opinion, not the number we judge on')),
    h('div', { class: 'mk' },
      ok(pp) ? h('span', null, 'Purchases ', h('b', null, num(pp))) : null,
      ok(pr) ? h('span', null, 'Sales ', h('b', null, money(Math.round(pr), { cur }))) : null,
      ok(pr) && ok(A.spend) && A.spend > 0 ? h('span', null, 'ROAS ', h('b', null, xx(pr / A.spend))) : null),
    ok(pp) && ok(A.purchases) && pp !== A.purchases ? h('p', null, 'Meta counts ' + num(pp) + ' purchases where ' + TW + ' credits ' + num(A.purchases) + ' orders on last click. Meta counts views and clicks over 7 days, so it usually reads higher.') : null)
    : h('p', { class: 'adx-na' }, "Meta's own count is not tracked yet for this ad.");
  const capped = e && ((e.lc && e.lc.capped) || (e.fc && e.fc.capped));
  return h('section', { class: 'adx-sec' },
    h('h3', null, 'First click and last click', h('span', { class: 'note' }, TW)),
    h('div', { class: 'adx-tw' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, ''), h('th', { class: 'num' }, defLabel('First click', DEF.first)), h('th', { class: 'num' }, defLabel('Last click', DEF.last)))),
      h('tbody', null, rows.map(([l, f, la, key]) => h('tr', null, h('td', null, key ? defLabel(l, key) : l), cell(f), cell(la)))))),
    role ? h('p', { class: 'adx-role' }, role) : null,
    capped ? h('p', { class: 'adx-na' }, 'Orders and new customers count the latest 300 orders only.') : null,
    meta);
}

function adset(ctx, A, opts, sheetRef) {
  const cur = A.currency, g = A.goals || {}, set = A.set, sibs = A.sibs || [];
  if (!set && !sibs.length) return h('section', { class: 'adx-sec' }, h('h3', null, 'Its ad set'), h('p', { class: 'adx-na' }, 'The ad set is not tracked yet for this ad.'));
  const cpaTone = set && ok(set.cpa) && g.cpa ? (set.cpa <= g.cpa ? 'good' : 'bad') : '';
  const roasTone = set && ok(set.roas) && g.roas ? (set.roas >= g.roas ? 'good' : 'bad') : '';
  /* the set against the goal, in the old Locus words: on goal / close to goal / missing the goal */
  const onGoal = !set || !(roasTone || cpaTone) ? null
    : (roasTone === 'good' || cpaTone === 'good') ? ['good', 'Set on goal']
    : ((ok(set.roas) && g.roas && set.roas >= g.roas * 0.75) || (ok(set.cpa) && g.cpa && set.cpa <= g.cpa * 1.5)) ? ['warn', 'Set close to goal']
    : ['bad', 'Set missing goal'];
  const kv = (label, key, v, tone, sub) => h('div', null, h('span', null, key ? defLabel(label, key) : label), h('b', { class: tone || '' }, v), sub ? h('small', null, sub) : null);
  const score = set ? h('div', { class: 'adx-score' },
    kv('Spend', null, ok(set.spend) ? money(Math.round(set.spend), { cur }) : 'not tracked yet'),
    kv('Orders', null, ok(set.purchases) ? num(set.purchases) : 'not tracked yet'),
    kv('ROAS', 'roas', ok(set.roas) ? xx(set.roas) : 'no sales yet', roasTone, g.roas ? 'goal ' + xx(g.roas) : null),
    kv('Cost per sale', 'cpa', ok(set.cpa) ? money(set.cpa, { cur }) : 'no sales yet', cpaTone, g.cpa ? 'goal ' + money(g.cpa, { cur }) : null),
    kv('Ads', null, ok(set.ads) ? num(set.ads) : 'not tracked yet')) : null;
  /* the ad's role in its set (ad set first, Cole 2026-10-08): the anchor opens the funnel for the others */
  let roleTxt = null;
  if (ok(A.rank) && set && set.ads > 1 && ok(A.share)) {
    const anchor = A.rank === 1 && A.share >= 0.4;
    roleTxt = 'This ad is #' + A.rank + ' of ' + set.ads + ' by spend and takes ' + pct(A.share) + " of the set's money. "
      + (anchor ? 'It carries the set: Meta uses it to open the funnel for the others, so replace it with a stronger opener before switching it off.'
        : A.share < 0.2 ? 'A small part of the set: low risk to switch off if it misses on its own.' : 'The set is judged first, then this ad by its role in it.');
  } else if (set && set.ads === 1) roleTxt = 'The only ad in its set, so the set and the ad are judged as one.';
  const max = Math.max(...sibs.map(o => +o.spend || 0), 1);
  const showAll = sibs.length <= 8;
  const row = (o, i) => {
    const me = String(o.id) === String(A.id);
    const share = set && ok(set.spend) && set.spend > 0 ? (+o.spend || 0) / set.spend : null;
    const tr = h('tr', { class: (me ? 'me' : 'go') + (!showAll && i >= 8 && !me ? ' more' : ''), tabindex: me ? null : '0', 'aria-label': me ? null : 'Open ' + (o.name || 'ad'), 'aria-current': me ? 'true' : null },
      h('td', null, h('span', { class: 'nm' }, h('span', { class: 'rk' }, String(i + 1)), h('b', { title: o.name || '' }, o.name || 'Unnamed ad'), me ? h('span', { class: 'adx-chip me' }, 'This ad') : null)),
      h('td', { class: 'num' }, ok(o.spend) ? money(Math.round(o.spend), { cur }) : 'none'),
      h('td', { class: 'num sh' }, h('span', { class: 'sb' }, h('i', { style: { width: (100 * (+o.spend || 0) / max).toFixed(1) + '%' } })), share == null ? '' : pct(share)),
      h('td', { class: 'num ' + (ok(o.roas) && g.roas ? (o.roas >= g.roas ? 'good' : 'bad') : '') }, ok(o.roas) ? xx(o.roas) : 'no sales'),
      h('td', { class: 'num hide-sm ' + (ok(o.cpa) && g.cpa ? (o.cpa <= g.cpa ? 'good' : 'bad') : '') }, ok(o.cpa) ? money(o.cpa, { cur }) : 'no sales'));
    if (!me) {
      const go = () => { sheetRef.close(); openAdDetail(ctx, o, { ...opts, adsetAds: sibs }); };
      tr.addEventListener('click', go);
      tr.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
    }
    return tr;
  };
  const tbl = sibs.length > 1 ? h('div', { class: 'adx-sibs' }, h('table', null,
    h('thead', null, h('tr', null, h('th', null, 'Ads in this set, by spend'), h('th', { class: 'num' }, 'Spend'), h('th', { class: 'num' }, 'Share'), h('th', { class: 'num' }, defLabel('ROAS', 'roas')), h('th', { class: 'num hide-sm' }, defLabel('Per sale', 'cpa')))),
    h('tbody', null, sibs.map(row)))) : null;
  const more = tbl && !showAll ? button('Show all ' + sibs.length + ' ads', { ghost: true, onclick: ev => { tbl.classList.add('all'); ev.currentTarget.remove(); } }) : null;
  return h('section', { class: 'adx-sec' },
    h('h3', null, 'Its ad set', set && set.name ? h('span', { class: 'note', title: set.name }, set.name) : null, onGoal ? pill(onGoal[0], onGoal[1]) : null),
    h('p', { class: 'adx-sub' }, 'The set is judged first: Meta spends an ad set as one system.'),
    score, roleTxt ? h('p', { class: 'adx-role' }, roleTxt) : null, tbl, more,
    sibs.length > 1 ? h('p', { class: 'adx-na' }, 'ROAS and cost per sale ' + TW + ' last click. Pick another ad to open it.') : null);
}

function history(A, e, w) {
  const cur = A.currency;
  const inWin = d => !w || !w.from || !w.to || (d.date >= w.from && d.date <= w.to);
  const days = (A.days || []).filter(d => d && d.date && inWin(d) && (+d.spend > 0 || +d.revenue > 0));
  if (!A.days && !(e && e.done)) return h('section', { class: 'adx-sec' }, h('h3', null, 'Day by day'), h('p', { class: 'adx-na' }, 'Reading the days...'));
  if (days.length < 2) return h('section', { class: 'adx-sec' }, h('h3', null, 'Day by day'), h('p', { class: 'adx-na' }, 'Not enough days of spend to draw a trend yet.'));
  const roas = days.map(d => (ok(d.roas) ? d.roas : div(d.revenue, d.spend)));
  const top = Math.max(1, ...roas.filter(ok)) * 1.15;
  const label = 'Daily, ' + span(days[0].date, days[days.length - 1].date);
  const b = t => h('b', null, t);
  return h('section', { class: 'adx-sec' },
    h('div', { class: 'adx-ch' }, h('h3', null, 'Day by day', h('span', { class: 'note' }, label)), legend([{ name: 'ROAS, ' + TW, lead: true }, { name: 'Spend', square: true }])),
    lineChart({ slots: true, fill: false, height: 230, phoneHeight: 200, yTicks: 2,
      series: [
        { type: 'bar', tone: 'dim', name: 'Spend', values: days.map(d => +d.spend || 0) },
        { name: 'ROAS', lead: true, axis: 'right', values: roas, end: false },
      ],
      y2: { max: Math.ceil(top * 2) / 2, format: v => xx(v, 1) },
      labels: days.map(d => shortDate(d.date)), format: v => money(v, { cur, compact: true }),
      label: 'Spend and ROAS by day for ' + (A.name || 'this ad'),
      hover: i => [b(shortDate(days[i].date)), h('span', null, 'Spend ', b(money(+days[i].spend || 0, { cur }))), h('span', null, 'ROAS ', b(ok(roas[i]) ? xx(roas[i]) : 'no sales'))] }),
    e && e.days_pending ? h('p', { class: 'adx-na' }, TW + ' has not credited the latest days yet, so their ROAS reads low.') : null);
}

/* ---------- the sheet ---------- */
/** openAdDetail(ctx, ad, { act, adsetAds, window, goals, currency }) : opens the sheet. Returns the kit sheet { el, close }. */
export function openAdDetail(ctx, ad, opts = {}) {
  addStyles('adx-css', CSS);
  const a = { ...(ad || {}) };
  a.id = a.id != null ? String(a.id) : a.ad_id != null ? String(a.ad_id) : '';
  const w = windowOf(ctx, a, opts);
  const state = {};
  let extra = { notes: [] }, A = shape(a, extra, opts);
  const mediaBox = media(ctx, A, state);
  const headBox = h('div', null), restBox = h('div', { class: 'adx-rest' });
  let win = w;
  const draw = () => {
    A = shape(a, extra, opts);
    if (A.thumb && state.setThumb) state.setThumb(A.thumb);
    if (ctx.sample && extra.window && !opts.window && !a.window) win = { ...extra.window, label: extra.window.label || span(extra.window.from, extra.window.to) };
    put(headBox, head(ctx, A, win, mediaBox));
    const gone = extra.notes.includes('no_id') ? h('p', { class: 'adx-na' }, 'This ad has no Meta id here, so only the numbers the page passed are shown.') : null;
    put(restBox, gone, metrics(A), funnel(A), clicks(A, extra), adset(ctx, A, opts, ref), history(A, extra, win));
  };
  const ref = sheet({ title: a.name || 'Ad', body: h('div', { class: 'adx' }, headBox, restBox), class: 'adx-wide',
    onClose: () => { const v = state.video; if (v) { try { v.pause(); v.removeAttribute('src'); v.load(); } catch {} } } });
  draw();
  readMore(ctx, a, opts, w, e => { extra = { ...e, notes: e.notes || [] }; if (ref.el.isConnected) draw(); })
    .then(() => { extra.done = true; if (ref.el.isConnected) draw(); })
    .catch(err => { extra.done = true; if (ref.el.isConnected) { draw(); toast('Some of this ad could not be read: ' + noDash(err && err.message || 'unknown error'), { tone: 'bad' }); } });
  return ref;
}

const CSS = `
.lx-sheet.adx-wide{width:min(980px,100%)}
.adx{display:grid;gap:var(--sp-6,24px);min-width:0;font-size:14px;line-height:1.5}
.adx-rest{display:grid;gap:var(--sp-6,24px);min-width:0}
.adx-top{display:grid;grid-template-columns:260px minmax(0,1fr);gap:24px;align-items:start}
.adx-mcol{display:grid;gap:8px;min-width:0}
.adx-media{position:relative;display:grid;place-items:center;aspect-ratio:4/5;width:100%;overflow:hidden;border-radius:var(--r-tbl,12px);background:var(--bg-sunk);color:var(--faint)}
.adx-media img,.adx-media video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000}
.adx-media>.pd-pic{position:absolute;inset:0;width:100%;height:100%;border-radius:0;aspect-ratio:auto!important}
.adx-media>.pd-pic>svg{width:100%;height:100%}
.adx-media video{object-fit:contain}
.adx-media.frame{aspect-ratio:auto;height:560px;background:var(--surface)}
.adx-media iframe{width:100%;height:100%;border:0}
.adx-media .ph{display:grid;justify-items:center;gap:6px;font-size:12.5px;color:var(--muted)}
.adx-media .ph svg{width:28px;height:28px;color:var(--faint)}
.adx-media.vid .ph{align-self:end;padding-bottom:18px}
.adx-media.vid .ph svg{display:none}
.adx-play{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 16px 0 12px;border:0;border-radius:999px;background:rgba(20,18,16,.78);color:#fff;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;backdrop-filter:blur(4px)}
.adx-play svg{width:18px;height:18px}
.adx-play:hover{background:rgba(20,18,16,.92)}
.adx-play:focus-visible{outline:2px solid #fff;outline-offset:2px}
.adx-mmsg{position:absolute;left:10px;right:10px;bottom:10px;padding:8px 10px;border-radius:var(--r-chip,6px);background:rgba(20,18,16,.82);color:#fff;font-size:12.5px;line-height:1.4}
.adx-view{justify-self:start}
.adx-info{display:grid;gap:16px;min-width:0;align-content:start}
.adx-info .chips{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.adx-chip{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:var(--r-chip,6px);background:var(--surface-2);color:var(--ink-2);font-size:12.5px;font-weight:500;white-space:nowrap}
.adx-chip.me{height:20px;padding:0 7px;font-size:11.5px;background:var(--brand);color:#fff}
.adx-where{display:grid;gap:8px}
.adx-where .kv{display:grid;grid-template-columns:76px minmax(0,1fr);gap:12px;align-items:baseline}
.adx-where .kv span{font-size:12.5px;color:var(--muted)}
.adx-where .kv b{font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.adx-call{display:grid;gap:6px;padding:12px 14px;border-radius:var(--r-tbl,12px);background:var(--surface-2);box-shadow:inset 3px 0 0 var(--line-strong)}
.adx-call.good{box-shadow:inset 3px 0 0 var(--good)}.adx-call.bad{box-shadow:inset 3px 0 0 var(--bad)}.adx-call.warn{box-shadow:inset 3px 0 0 var(--warn)}
.adx-call .ch{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.adx-call .eb{font-size:11.5px;font-weight:600;color:var(--muted)}
.adx-call p{margin:0;color:var(--ink-2)}
.adx-call .src{font-size:12px;color:var(--muted)}
.adx-win{margin:0;font-size:12.5px;color:var(--muted)}
.adx-sec{display:grid;gap:12px;min-width:0}
.adx-sec h3{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em;line-height:1.25;color:var(--ink)}
.adx-sec h3 .note{font-size:12.5px;font-weight:400;color:var(--muted);letter-spacing:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.adx-sec h3 .lx-pill{align-self:center}
.adx-sub{margin:-6px 0 0;font-size:12.5px;color:var(--muted)}
.adx-na{margin:0;font-size:12.5px;color:var(--muted)}
.adx-role{margin:0;color:var(--ink-2)}
.adx-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.adx-tile{display:grid;gap:2px;align-content:start;min-width:0;padding:12px 14px;border-radius:var(--r-tbl,12px);background:var(--surface-2)}
.adx-tile .l{font-size:12.5px;color:var(--muted)}
.adx-tile .v{font-size:var(--num-m,18px);font-weight:600;letter-spacing:-.02em;line-height:1.25;font-variant-numeric:tabular-nums;color:var(--ink);overflow-wrap:anywhere}
.adx-tile .v.na{font-size:13px;font-weight:500;color:var(--faint);letter-spacing:0}
.adx-tile .v.good{color:var(--good)}.adx-tile .v.bad{color:var(--bad)}
.adx-tile .s{font-size:12px;color:var(--muted)}
.adx-funnel{display:grid;grid-template-columns:minmax(0,1fr) 64px minmax(0,1fr) 64px minmax(0,1fr) 64px minmax(0,1fr) 64px minmax(0,1fr);align-items:stretch}
.adx-step{display:grid;gap:4px;align-content:start;min-width:0;padding:12px;border-radius:var(--r-tbl,12px);background:var(--surface-2)}
.adx-step .l{font-size:12.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.adx-step b{font-size:var(--num-m,18px);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.25}
.adx-step.na b{font-size:12.5px;font-weight:500;color:var(--faint);letter-spacing:0}
.adx-step .bar{display:block;height:6px;border-radius:999px;background:var(--line);overflow:hidden}
.adx-step .bar i{display:block;height:100%;border-radius:inherit;background:var(--brand)}
.adx-step .s{font-size:11.5px;color:var(--faint)}
.adx-rate{display:grid;align-content:center;justify-items:center;gap:0;padding:0 4px;text-align:center;position:relative}
.adx-rate::before{content:"";position:absolute;left:8px;right:8px;top:50%;border-top:1px dashed var(--line-strong);z-index:0}
.adx-rate b,.adx-rate span{position:relative;z-index:1;background:var(--surface,#fff);padding:0 4px}
.adx-rate b{font-size:13.5px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink)}
.adx-rate span{font-size:11px;color:var(--muted);line-height:1.2}
.adx-rate.na::before{border-top-style:dotted}
.adx-tw,.adx-sibs{border-radius:var(--r-tbl,12px);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.adx-tw table,.adx-sibs table{width:100%;border-collapse:collapse;font-size:13.5px;table-layout:fixed}
.adx-tw th,.adx-sibs th{padding:9px 14px;font-size:11.5px;font-weight:600;color:var(--muted);text-align:left;background:var(--surface-2);border-bottom:1px solid var(--line)}
.adx-tw td,.adx-sibs td{padding:9px 14px;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.adx-tw tr:last-child td,.adx-sibs tr:last-child td{border-bottom:0}
.adx-tw .num,.adx-sibs .num{text-align:right}
.adx-tw td.na{color:var(--faint);font-size:12.5px}
.adx-tw th:first-child,.adx-tw td:first-child{width:40%}
.adx-meta{display:grid;gap:6px;padding:12px 14px;border-radius:var(--r-tbl,12px);border:1px dashed var(--line-strong)}
.adx-meta .mh{display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}
.adx-meta .mh b{font-size:14px;font-weight:600}
.adx-meta .mh span{font-size:12.5px;color:var(--muted)}
.adx-meta .mk{display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:var(--muted)}
.adx-meta .mk b{color:var(--ink);font-variant-numeric:tabular-nums}
.adx-meta p{margin:0;font-size:12.5px;color:var(--muted)}
.adx-score{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;padding:12px 14px;border-radius:var(--r-tbl,12px);background:var(--surface-2)}
.adx-score>div{display:grid;gap:2px;min-width:0}
.adx-score span{font-size:12.5px;color:var(--muted)}
.adx-score b{font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink)}
.adx-score b.good{color:var(--good)}.adx-score b.bad{color:var(--bad)}
.adx-score small{font-size:11.5px;color:var(--muted)}
.adx-sibs th:first-child{width:auto}
.adx-sibs th:nth-child(2),.adx-sibs th:nth-child(4),.adx-sibs th:nth-child(5){width:96px}
.adx-sibs th:nth-child(3){width:130px}
.adx-sibs tr.go{cursor:pointer}
.adx-sibs tr.go:hover td{background:var(--row-hover)}
.adx-sibs tr.go:focus-visible{outline:2px solid var(--ink-2);outline-offset:-2px}
.adx-sibs tr.me td{background:var(--surface-2);font-weight:600}
.adx-sibs tr.me td:first-child{box-shadow:inset 3px 0 0 var(--brand)}
.adx-sibs tr.more{display:none}
.adx-sibs.all tr.more{display:table-row}
.adx-sibs .nm{display:flex;align-items:center;gap:8px;min-width:0}
.adx-sibs .nm b{font-weight:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.adx-sibs .rk{flex:none;width:18px;color:var(--faint);font-size:12px;text-align:right}
.adx-sibs td.good{color:var(--good)}.adx-sibs td.bad{color:var(--bad)}
.adx-sibs td.sh{white-space:nowrap}
.adx-sibs .sb{display:inline-block;vertical-align:middle;width:48px;height:5px;margin-right:8px;border-radius:999px;background:var(--line);overflow:hidden}
.adx-sibs .sb i{display:block;height:100%;background:var(--slate)}
.adx-sibs tr.me .sb i{background:var(--brand)}
.adx-ch{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}
@media (max-width:899px){
  .adx-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .adx-score{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (max-width:759px){
  .adx-top{grid-template-columns:minmax(0,1fr);gap:16px}
  .adx-mcol{max-width:240px;width:100%;justify-self:center}
  .adx-media.frame{height:520px}
  .adx-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .adx-score{grid-template-columns:repeat(2,minmax(0,1fr))}
  .adx-funnel{grid-template-columns:minmax(0,1fr)}
  .adx-rate{grid-auto-flow:column;gap:6px;padding:6px 0;justify-content:start;padding-left:14px}
  .adx-rate::before{left:8px;right:auto;top:0;bottom:0;border-top:0;border-left:1px dashed var(--line-strong)}
  .adx-rate.na{display:none}
  .adx-sibs th:nth-child(2),.adx-sibs th:nth-child(4){width:72px}
  .adx-sibs th:nth-child(3){width:64px}
  .adx-sibs td,.adx-sibs th{padding:9px 8px}
  .adx-sibs .sb{display:none}
  .adx-sibs .hide-sm{display:none}
  .adx-sibs .rk{display:none}
}`;
