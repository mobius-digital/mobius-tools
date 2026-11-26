/* Ads > Meta > Live now for one brand: what is running right now.
   The campaign list (open a campaign for its ad sets, an ad set for its ads), today's spend against a usual day,
   and what starts next. About today, so the date range in the page head is hidden.

   Real mode reads:
     GET /api/meta/live?act=             account-health: campaigns, ad sets, ads, budgets, straight from Meta
     GET /api/meta/live?act=&season=1    account-health: ad set start and end times (what starts next)
     GET /api/pacing?act=                account-health: today's spend by hour and the last 7 days' average
     GET /api/hub/paid?platform=meta     profit: Triple Whale sales per campaign, ad set and ad (last 7 days; today for spend).
                                         Today's answer has no campaign rows until the day is synced: spend today then reads
                                         "not read yet" and the account total comes from /api/pacing (spent).
   No route carries the account's daily spend limit yet, so that one part shows the example. */

import { put } from '../../kit.js';
import { h, em, card, button, segmented, lineChart, legend, gauge, empty, skeleton, money, num } from '../../kit.js';
import { ok, usd, div, addDays, shortDate, weekDate, hourWord, soft, judge, roasBar, adTile, exampleChip, gate, foot, styles, statusDot, x } from './_rest.js';

const CSS = `
.ml-list{padding:0 0 6px}
.ml-r{display:grid;grid-template-columns:minmax(0,1fr) 110px 110px 150px 96px;gap:14px;align-items:center;padding:0 28px;min-height:50px;border-top:1px solid var(--line);font-size:13.5px}
.ml-r.hd{min-height:38px;border-top:0}
.ml-r.hd span{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.ml-r .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ml-r .nm{display:flex;align-items:center;gap:10px;min-width:0}
.ml-r .nm b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ml-r .nm small{color:var(--muted);font-size:12.5px;white-space:nowrap}
.ml-r.set .nm{padding-left:22px}.ml-r.set .nm b{font-weight:550}
.ml-r.set{background:var(--surface-2)}
button.ml-r{width:100%;border:0;border-top:1px solid var(--line);background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer}
button.ml-r.set{background:var(--surface-2)}
button.ml-r:hover .nm b{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
.ml-car{flex:none;width:8px;height:8px;border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted);transform:rotate(-45deg);transition:transform .12s}
[aria-expanded=true]>.nm .ml-car{transform:rotate(45deg)}
.ml-ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:18px 16px;padding:18px 28px 22px 50px;background:var(--surface-2);border-top:1px solid var(--line)}
.ml-ad{display:grid;gap:6px;min-width:0;font-size:12.5px}
.ml-ad .mr-tile{width:100%;height:auto;aspect-ratio:4/5}
.ml-ad b{font-weight:550;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ml-ad .s{display:flex;justify-content:space-between;gap:6px;color:var(--muted);font-variant-numeric:tabular-nums}
.ml-none{padding:16px 28px 18px 50px;background:var(--surface-2);border-top:1px solid var(--line);color:var(--muted);font-size:13px}
.ml-lim{display:grid;gap:8px;min-width:260px}
.ml-lim .t{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.ml-lim .t b{margin-left:auto;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.ml-lim .t i{font-style:normal;color:var(--muted);font-size:13px}
.ml-big{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:2px 0 10px}
.ml-big b{font-size:var(--num-xl);font-weight:600;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.ml-big span{color:var(--muted);font-size:13.5px}
.ml-next>div{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:14px;align-items:center;padding:0 28px;min-height:48px;border-top:1px solid var(--line);font-size:13.5px}
.ml-next .d{color:var(--muted)}.ml-next b{font-weight:550;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ml-next .x{color:var(--muted);text-align:right;white-space:nowrap}
.ml-ft{padding:12px 28px 18px}
.ml-r.hd .small{display:none}
@media (max-width:1040px){.ml-r{grid-template-columns:minmax(0,1fr) 96px 96px 120px}.ml-r>.bar{display:none}}
@media (max-width:759px){
  .ml-r{grid-template-columns:minmax(0,1fr) 58px 92px;gap:8px;padding:0 16px;font-size:13px}
  .ml-r.hd .big{display:none}.ml-r.hd .small{display:inline}
  .ml-r .r small{display:block;font-size:11.5px}
  .ml-r>.bud{display:none}
  .ml-r .nm{flex-wrap:wrap;gap:2px 8px;padding-top:8px;padding-bottom:8px}
  .ml-r .nm b{white-space:normal;overflow-wrap:anywhere}
  .ml-r.set .nm{padding-left:14px}
  .ml-ads{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 10px;padding:14px 16px 18px}
  .ml-none{padding:14px 16px}
  .ml-lim{min-width:0;width:100%}
  .ml-next>div{grid-template-columns:84px minmax(0,1fr);padding:8px 16px;gap:2px 10px}
  .ml-next .d{white-space:nowrap;font-size:12.5px}
  .ml-next .x{grid-column:2;text-align:left}
  .ml-ft{padding:12px 16px 16px}
}`;

/* ---------- load: real mode ---------- */
const on = v => v && v.eff === 'ACTIVE';
async function load(ctx) {
  const act = encodeURIComponent(ctx.brand.id);
  const ah = path => ctx.api(path, { worker: 'ah', signal: ctx.signal });
  const [live, times, pace, eg] = await Promise.all([
    soft(ah(`/api/meta/live?act=${act}`)), soft(ah(`/api/meta/live?act=${act}&season=1`)), soft(ah(`/api/pacing?act=${act}`)), soft(ctx.fixture('live-now.json')),
  ]);
  if (!live || live.error || !live.campaigns) return { connected: false, error: live && live.error ? live.error : null };
  const today = (pace && pace.today) || new Date().toISOString().slice(0, 10), now = Date.now();
  const paid = (from, to) => soft(ctx.api(`/api/hub/paid?platform=meta&act=${act}&model=lastPlatformClick&from=${from}&to=${to}`, { worker: 'profit', signal: ctx.signal }));
  const [wk, td] = await Promise.all([paid(addDays(today, -7), addDays(today, -1)), paid(today, today)]);
  const wb = wk && wk.brands && wk.brands[0], tb = td && td.brands && td.brands[0];
  /* numbers by id, from the two windows */
  const W = {}, T = {};
  const walk = (b, into) => { for (const c of (b && b.campaigns) || []) { into[c.id] = c; for (const st of c.adsets || []) { into[st.id] = st; for (const a of st.ads || []) into[a.id] = a; } } };
  walk(wb, W); walk(tb, T);
  const goals = (wb && wb.goals) || (tb && tb.goals) || {};
  const cur = (wb && wb.cur) || {};
  const salesSource = !!wb && !cur.attr_pending && Object.values(W).some(r => r.revenue > 0);
  const startOf = id => { const t = times && times.adsets && times.adsets[id]; return t && t.start ? t.start : null; };
  const later = id => { const st = startOf(id); return !!st && Date.parse(st) > now; };

  const setsOf = {}, adsOf = {};
  for (const [id, v] of Object.entries(live.adsets || {})) (setsOf[v.campaign] ||= []).push({ id, ...v });
  for (const [id, v] of Object.entries(live.ads || {})) if (on(v)) (adsOf[v.adset] ||= []).push({ id, ...v });
  /* Today's spend per campaign is only in the answer once the day's rows are in (they land for whole synced days).
     Until then the answer has campaigns: [] while the account has already spent, so a missing row means
     "not read yet", never $0. A zero is only said when today's rows are there and this one is not among them. */
  const todayRead = !!(tb && (tb.campaigns || []).length);
  const m = (id, lead) => { const w = W[id] || {}, t = T[id] || {}; return { spend_today: ok(t.spend) ? t.spend : (todayRead ? 0 : null), spend7: w.spend ?? null, roas7: lead ? null : (w.spend > 0 ? w.roas ?? div(w.revenue, w.spend) : null), cpl7: lead ? (w.cpl ?? null) : null }; };
  const campaigns = [], next = [];
  for (const [id, c] of Object.entries(live.campaigns)) {
    const sets = setsOf[id] || [], liveSets = sets.filter(on);
    const lead = /LEAD/.test((W[id] && W[id].objective) || '');
    const state = !on(c) ? 'off' : liveSets.length && liveSets.every(st => later(st.id)) ? 'scheduled' : 'live';
    const row = { id, name: c.name, state, lead, budget: c.daily ?? (liveSets.some(st => st.daily) ? liveSets.reduce((t, st) => t + (st.daily || 0), 0) : null), ...m(id, lead) };
    if (state !== 'off') {
      row.adsets = liveSets.map(st => {
        const ads = (adsOf[st.id] || []).map(a => { const w = W[a.id] || {}, t = T[a.id] || {};
          return { id: a.id, name: a.name, video: w.media_type === 'video', spend_today: ok(t.spend) ? t.spend : null, spend: w.spend ?? null, roas: w.spend > 0 ? w.roas ?? null : null, purchases: w.purchases ?? null, cpa: w.cpa ?? null }; })
          .sort((p, q) => (q.spend || 0) - (p.spend || 0));
        const out = { id: st.id, name: st.name, budget: st.daily ?? null, starts: later(st.id) ? startOf(st.id) : null, n_ads: ads.length, ads: ads.slice(0, 24), ...m(st.id, lead) };
        if (out.starts) next.push({ date: out.starts, name: st.name, detail: c.name + (st.daily ? ', ' + money(st.daily) + ' a day' : '') });
        return out;
      }).sort((p, q) => (q.spend_today || 0) - (p.spend_today || 0) || (q.spend7 || 0) - (p.spend7 || 0));
    }
    campaigns.push(row);
  }
  /* live first when today is not read yet (every spend_today is null then), then by today's spend, then the week's */
  const rank = r => (r.state === 'live' ? 0 : r.state === 'scheduled' ? 1 : 2);
  campaigns.sort((p, q) => (todayRead ? 0 : rank(p) - rank(q)) || (q.spend_today || 0) - (p.spend_today || 0) || (q.spend7 || 0) - (p.spend7 || 0));
  next.sort((p, q) => Date.parse(p.date) - Date.parse(q.date));

  return {
    as_of: (pace && pace.pulled_at) || new Date().toISOString(), today, currency: (wb && wb.currency) || (pace && pace.account && pace.account.currency) || 'USD', connected: true,
    sales_source: salesSource, goals: { roas: goals.roas || null, cpa: goals.cpa || null }, today_read: todayRead,
    campaigns, next: next.slice(0, 8),
    pace: pace && !pace.error && pace.today_cum ? { hour: pace.hour, today: pace.today_cum, usual: pace.l7_cum, spent: pace.spent, usual_by_now: pace.l7_by_now, usual_total: pace.l7_daily_avg, projected: pace.projected } : null,
    limit: eg && eg.limit ? eg.limit : null, examples: { limit: !!(eg && eg.limit) },
  };
}

/* ---------- the campaign list ---------- */
const OPEN = new Set();          // rows left open, kept while the page is redrawn with fresh numbers
function roasCell(r, d) {
  if (ok(r.cpl7)) return h('span', { class: 'r' }, money(r.cpl7, { cur: d.currency }), h('small', { class: 'mr-dim' }, ' a lead'));
  if (r.starts) return h('span', { class: 'r mr-dim' }, 'starts ' + shortDate(r.starts));
  if (!d.sales_source) return h('span', { class: 'r mr-dim' }, 'no sales source');
  return h('span', { class: 'r' }, ok(r.roas7) ? h('b', null, x(r.roas7)) : h('span', { class: 'mr-dim' }, 'Too early'));
}
function line(r, d, cls, extra) {
  const cur = d.currency, goal = d.goals && d.goals.roas, open = OPEN.has(r.id);
  const can = cls === 'camp' ? (r.adsets || []).length > 0 : true;
  const kids = [
    h('span', { class: 'nm' }, can ? h('i', { class: 'ml-car' }) : null, h('b', { title: r.name }, r.name), extra ? h('small', null, extra) : null,
      ok(r.budget) && r.spend_today === 0 && r.spend7 > 0 && !r.starts ? statusDot('warn', 'Not spending') : null),
    h('span', { class: 'r bud mr-dim' }, ok(r.budget) ? usd(r.budget, cur) + ' a day' : ''),
    h('span', { class: 'r' }, ok(r.spend_today) ? usd(r.spend_today, cur) : h('span', { class: 'mr-dim' }, 'not read yet')),
    roasCell(r, d),
    h('span', { class: 'bar' }, d.sales_source && !ok(r.cpl7) ? roasBar(r.roas7, goal, goal && r.roas7 >= goal ? 'good' : '') : null),
  ];
  return can ? h('button', { type: 'button', class: 'ml-r ' + cls, 'aria-expanded': open ? 'true' : 'false', dataset: { id: r.id } }, kids) : h('div', { class: 'ml-r ' + cls }, kids);
}
function adsBlock(st, d) {
  if (!(st.ads || []).length) return h('div', { class: 'ml-none' }, 'No ads are on in this ad set.');
  const more = (st.n_ads || 0) - st.ads.length;
  return h('div', { class: 'ml-ads' }, st.ads.map(a => {
    const v = d.sales_source ? judge({ ...a }, d.goals) : null;
    return h('div', { class: 'ml-ad' }, adTile(a), h('b', { title: a.name }, a.name),
      h('span', { class: 's' }, v ? statusDot(v[0], v[1]) : h('span', null, a.video ? 'Video' : 'Image'), ok(a.spend_today) ? usd(a.spend_today, d.currency) : ''));
  }), more > 0 ? h('div', { class: 'ml-ad mr-dim' }, `and ${num(more)} more`) : null);
}
function listBody(d, state) {
  const rows = (d.campaigns || []).filter(c => c.state === state);
  if (!rows.length) return [h('div', { class: 'ml-none' }, state === 'live' ? 'No campaign is live right now.' : state === 'scheduled' ? 'Nothing is scheduled to start.' : 'No campaign is switched off.')];
  const out = [];
  for (const c of rows.slice(0, 60)) {
    const n = (c.adsets || []).length;
    out.push(line(c, d, 'camp', n ? `${n} ad ${n === 1 ? 'set' : 'sets'}` : ''));
    if (!OPEN.has(c.id)) continue;
    for (const st of c.adsets) {
      out.push(line(st, d, 'set', `${num(st.n_ads ?? (st.ads || []).length)} ads`));
      if (OPEN.has(st.id)) out.push(adsBlock(st, d));
    }
  }
  if (rows.length > 60) out.push(h('div', { class: 'ml-none' }, `and ${num(rows.length - 60)} more`));
  return out;
}
function campaignsCard(d, ctx) {
  const cs = d.campaigns || [], n = s => cs.filter(c => c.state === s).length;
  let state = ctx.settingNow('meta.live.state', 'live');
  if (!n(state)) state = 'live';
  const body = h('div', { class: 'ml-list' });
  const paint = () => put(body, ...listBody(d, state));
  body.addEventListener('click', e => {
    const b = e.target.closest('button.ml-r'); if (!b) return;
    const id = b.dataset.id; OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); paint();
  });
  paint();
  const seg = segmented([{ id: 'live', label: `Live ${n('live')}` }, { id: 'scheduled', label: `Scheduled ${n('scheduled')}` }, { id: 'off', label: `Off ${n('off')}` }], state,
    id => { state = id; ctx.saveSetting('meta.live.state', id); paint(); });
  const lim = d.limit && d.limit.limit > 0 ? d.limit : null;
  const goal = d.goals && d.goals.roas;
  return [
    h('div', { class: 'mr-bar' }, seg, h('span', { class: 'sp' }),
      lim ? h('div', { class: 'ml-lim' },
        h('div', { class: 't' }, h('span', { class: 'lx-cap' }, 'Daily account limit'), d.examples && d.examples.limit ? exampleChip() : null, h('b', null, usd(lim.used, d.currency)), h('i', null, 'of ' + usd(lim.limit, d.currency))),
        roasBarless(lim)) : null),
    card({ flush: true, class: 'mr-list' },
      h('div', { class: 'ml-r hd' }, h('span', null, 'Campaign'), h('span', { class: 'r bud' }, 'Budget'), h('span', { class: 'r' }, h('span', { class: 'big' }, 'Spend today'), h('span', { class: 'small' }, 'Today')), h('span', { class: 'r' }, h('span', { class: 'big' }, 'ROAS, 7 days'), h('span', { class: 'small' }, 'ROAS 7d')), h('span', { class: 'bar' }, '')),
      body,
      h('div', { class: 'ml-ft' }, foot(`Spend and budgets from Meta.${d.today_read === false ? ' Today\'s spend per campaign shows once Meta\'s numbers for the day are read; the account total for today is in the chart.' : ''} Sales from Triple Whale, last click per platform.${goal ? ` The tick on each bar is the ${x(goal)} ROAS goal.` : ''}`))),
  ];
}
/* the limit is a plain measure, not a ROAS: an ink fill that turns crimson near the top */
function roasBarless(lim) { return gauge({ value: lim.used, max: lim.limit, thin: true, tone: lim.used / lim.limit >= 0.9 ? 'bad' : '' }); }

/* ---------- today's pace ---------- */
function paceCard(d, ctx) {
  const p = d.pace, cur = d.currency;
  if (!p || !(p.today || []).length) return card({ title: 'Is today\'s Meta spend on pace?' }, h('p', { class: 'mr-dim' }, 'Today\'s spend by hour could not be read from Meta just now.'));
  const hr = Math.max(0, Math.min(23, p.hour ?? p.today.length)), usual = (p.usual || []).slice(0, 24);
  /* point i is the total by the end of hour i; the line starts at zero at midnight */
  const today = [0, ...p.today.slice(0, hr)], base = [0, ...usual];
  const labels = Array.from({ length: 25 }, (_, i) => hourWord(i));
  const gap = ok(p.spent) && ok(p.usual_by_now) ? p.spent - p.usual_by_now : null;
  const b = v => h('b', null, v);
  return card({ class: 'ml-pace' },
    h('div', { class: 'lx-chart-h' },
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Is today\'s Meta spend on pace?')), h('p', null, 'spend so far today, hour by hour')),
      legend([{ name: 'Today', lead: true }, usual.some(ok) && { name: 'A usual day, last 7 days', dashed: true }])),
    h('div', { class: 'ml-big' }, h('b', null, usd(p.spent, cur)), h('span', null, 'spent by ' + hourWord(hr)),
      ok(gap) && Math.abs(gap) >= 1 ? statusDot('', `${usd(Math.abs(gap), cur)} ${gap >= 0 ? 'ahead of' : 'behind'} a usual day`) : null),
    lineChart({
      series: [{ name: 'Today', lead: true, values: today.concat(Array(25 - today.length).fill(null)), end: v => usd(v, cur) },
        usual.some(ok) && { name: 'A usual day', dashed: true, values: base, end: v => usd(v, cur) + ' usual' }],
      labels, ticks: [0, 3, 6, 9, 12, 15, 18, 21, 24], now: today.length - 1,
      format: v => money(v, { cur, compact: true }), height: 360, empty: 'No spend yet today',
      label: `Meta spend today by hour against a usual day. ${usd(p.spent, cur)} spent by ${hourWord(hr)}.`,
      hover: i => [b(hourWord(i)), ok(today[i]) ? h('span', null, 'Today ', b(usd(today[i], cur))) : null, ok(base[i]) ? h('span', null, 'Usual ', b(usd(base[i], cur))) : null],
    }),
    ok(p.projected) ? h('p', { class: 'mr-dim', style: { margin: '10px 0 0' } }, 'At this pace today ends near ', b(usd(p.projected, cur)), ok(p.usual_total) ? [' against a usual ', b(usd(p.usual_total, cur)), '.'] : '.') : null);
}

function nextCard(d, ctx) {
  const rows = d.next || [];
  return card({ title: 'Starting next on Meta', flush: true, action: h('a', { href: ctx.href('calendar', 'index') }, 'Calendar') },
    rows.length ? h('div', { class: 'ml-next' }, rows.map(r => h('div', null, h('span', { class: 'd' }, weekDate(r.date)), h('b', { title: r.name }, r.name), h('span', { class: 'x' }, r.detail || ''))))
      : h('div', { class: 'ml-none' }, 'No ad set has a start date ahead.'));
}

export default {
  title: ['What is running on Meta ', em('right now?')],
  eyebrow: 'Meta',
  ranges: false,
  asOf: d => d && d.as_of,
  load,
  skeleton(el) { put(el, skeleton('row', 6), skeleton('chart', 1)); },
  render(el, d, ctx) {
    styles('ml-css', CSS);
    const stop = gate(d, ctx, 'Live now');
    if (stop) return put(el, stop);
    if (!(d.campaigns || []).length) return put(el, empty({ title: 'No campaigns in this ad account', text: 'When a campaign is built in Meta it shows here.', action: ctx.isClient ? null : button('Load ads', { href: ctx.href('meta', 'load-ads') }) }));
    put(el, ...campaignsCard(d, ctx), paceCard(d, ctx), nextCard(d, ctx));
  },
};
