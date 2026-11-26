/* Ads > Meta > Live now for one brand: what is running right now.
   Top row: Live campaigns | Scheduled, a count line (campaigns, ad sets and ads live), Show: Campaigns | Ads, and a quiet
   "Show off campaigns" switch. Live campaigns open to their ad sets, an ad set to its ads, and every ad opens its detail
   sheet (meta/_rest.js adSheet). Scheduled is ONE list of everything waiting to start: campaigns and ad sets with a start
   date ahead, and ads loaded switched off in a live or upcoming ad set (the Cyber Monday style preloads).
   Then today's spend against a usual day. About today, so the date range in the page head is hidden.

   Real mode reads (GET only):
     GET /api/meta/live?act=             account-health: campaigns, ad sets, ads, budgets, straight from Meta
     GET /api/meta/live?act=&season=1    account-health: ad set start and end times (what starts next)
     GET /api/pacing?act=                account-health: today's spend by hour and the last 7 days' average
     GET /api/hub/paid?platform=meta     profit: Triple Whale sales per campaign, ad set and ad (last 7 days; today for spend).
                                         Today's answer has no campaign rows until the day is synced: spend today then reads
                                         "not read yet" and the account total comes from /api/pacing (spent).
   No route carries the account's daily spend limit yet, so that one part shows the example.
   A paused ad counts as waiting only when its own status is PAUSED, it sits in an ad set that starts later, and it
   spent nothing in the last 7 days. In an ad set that is already running, the spend read only covers 7 days, so a paused ad
   there could be a preload or an ad switched off weeks ago: it is listed as "switched off, no spend in 7 days" and kept out
   of the waiting count. */

import { put } from '../../kit.js';
import { h, card, button, segmented, toggle, table, lineChart, legend, gauge, empty, skeleton, money, num, sheet } from '../../kit.js';
import { ok, usd, div, addDays, shortDate, weekDate, hourWord, soft, judge, roasBar, adTile, exampleChip, gate, styles, statusDot, x, adSheet, opener } from './_rest.js';
import { def, headRow, levelChip } from '../platforms/_ads.js';

const CSS = `
.ml-list{padding:0 0 6px}
.ml-r{display:grid;grid-template-columns:minmax(0,1fr) 110px 110px 150px 170px;gap:14px;align-items:center;padding:0 var(--pad-card,24px);min-height:var(--row-h-roomy,48px);border-top:1px solid var(--line);font-size:13.5px}
.ml-r.hd{min-height:32px;border-top:0}
.ml-r.hd>span{font-size:var(--fs-colhead,11.5px);font-weight:600;color:var(--muted)}
.ml-r .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ml-r .nm{display:flex;align-items:center;gap:10px;min-width:0}
.ml-r .nm b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.ml-r .nm small{color:var(--muted);font-size:12.5px;white-space:nowrap}
.ml-r.set .nm{padding-left:22px}.ml-r.set .nm b{font-weight:500}
.ml-r.set{background:var(--surface-2)}
.ml-r.off{opacity:.6}
button.ml-r{width:100%;border:0;border-top:1px solid var(--line);background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer;border-radius:0}
button.ml-r.set{background:var(--surface-2)}
button.ml-r:hover{background:var(--bg-sunk)}
.ml-car{flex:none;width:8px;height:8px;border-right:1.5px solid var(--muted);border-bottom:1.5px solid var(--muted);transform:rotate(-45deg);transition:transform .12s}
[aria-expanded=true]>.nm .ml-car{transform:rotate(45deg)}
.ml-ads{display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:14px;padding:16px var(--pad-card,24px) 20px 50px;background:var(--surface-2);border-top:1px solid var(--line)}
.ml-ad{display:grid;gap:5px;min-width:0;font-size:12.5px;padding:6px;margin:-6px;border-radius:var(--r-tbl,12px)}
.ml-ad:hover{background:var(--bg-sunk)}
.ml-ad .mr-tile{width:100%;height:auto;aspect-ratio:1/1;max-height:150px}
.ml-ad b{font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ml-ad .s{display:flex;justify-content:space-between;gap:6px;color:var(--muted);font-variant-numeric:tabular-nums}
.ml-ad .s b{font-size:12.5px;color:var(--ink);font-weight:600}
.ml-none{padding:16px var(--pad-card,24px);background:var(--surface-2);border-top:1px solid var(--line);color:var(--muted);font-size:13px}
.ml-top{display:grid;gap:10px}
.ml-count{color:var(--muted);font-size:13px}.ml-count b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.ml-lim{display:grid;gap:8px;min-width:240px}
.ml-lim .t{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;font-size:13px}
.ml-lim .t b{margin-left:auto;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums}
.ml-lim .t i{font-style:normal;color:var(--muted);font-size:13px}
.ml-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 16px}
.ml-three>div{display:grid;gap:4px;padding:12px 14px;border-radius:var(--r-tbl,12px);background:var(--surface-2)}
.ml-three .l{font-size:12.5px;color:var(--muted)}
.ml-three b{font-size:var(--num-m);font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.ml-three small{color:var(--muted);font-size:12.5px}
.ml-sc .lvl{display:flex;gap:8px;align-items:center;min-width:0}
.ml-sc .nmw{display:grid;min-width:0}.ml-sc .nmw b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ml-sc .nmw small{color:var(--muted);font-size:12px}
.ml-sh{display:grid;gap:0;border-radius:var(--r-tbl,12px);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.ml-sh>div{display:flex;justify-content:space-between;gap:12px;padding:9px 14px;border-top:1px solid var(--line);font-size:13px}
.ml-sh>div:first-child{border-top:0}
@media (max-width:1040px){.ml-r{grid-template-columns:minmax(0,1fr) 96px 96px 140px}.ml-r>.bar{display:none}}
@media (max-width:759px){
  .ml-r{grid-template-columns:minmax(0,1fr) 70px 104px;gap:8px;padding:0 16px;font-size:13px}
  .ml-r.hd{padding-top:6px;padding-bottom:6px}.ml-r.hd>span{white-space:normal;line-height:1.25}
  .ml-r>.bud{display:none}
  /* the chevron keeps its own column, so every row starts the same way however long its name */
  .ml-r .nm{display:grid;grid-template-columns:8px minmax(0,1fr);align-items:center;gap:2px 10px;padding-top:8px;padding-bottom:8px}
  .ml-r .nm>.ml-car{grid-column:1;grid-row:1}
  .ml-r .nm>:not(.ml-car){grid-column:2;justify-self:start}
  .ml-r .nm b{white-space:normal;overflow-wrap:anywhere}
  .ml-r.set .nm{padding-left:14px}
  .ml-ads{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;padding:14px 16px 18px}
  .ml-none{padding:14px 16px}
  .ml-lim{min-width:0;width:100%}
  .ml-three{grid-template-columns:1fr}
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
  const W = {}, T = {};
  const walk = (b, into) => { for (const c of (b && b.campaigns) || []) { into[c.id] = c; for (const st of c.adsets || []) { into[st.id] = st; for (const a of st.ads || []) into[a.id] = a; } } };
  walk(wb, W); walk(tb, T);
  const goals = (wb && wb.goals) || (tb && tb.goals) || {};
  const cur = (wb && wb.cur) || {};
  const salesSource = !!wb && !cur.attr_pending && Object.values(W).some(r => r.revenue > 0);
  const startOf = id => { const t = times && times.adsets && times.adsets[id]; return t && t.start ? t.start : null; };
  const later = id => { const st = startOf(id); return !!st && Date.parse(st) > now; };

  const setsOf = {}, adsOf = {}, waitOf = {};
  for (const [id, v] of Object.entries(live.adsets || {})) (setsOf[v.campaign] ||= []).push({ id, ...v });
  for (const [id, v] of Object.entries(live.ads || {})) {
    if (on(v)) (adsOf[v.adset] ||= []).push({ id, ...v });
    else if (String(v.status || '').toUpperCase() === 'PAUSED' && !(W[id] && W[id].spend > 0)) (waitOf[v.adset] ||= []).push({ id, ...v });
  }
  const todayRead = !!(tb && (tb.campaigns || []).length);
  const m = (id, lead) => { const w = W[id] || {}, t = T[id] || {}; return { spend_today: ok(t.spend) ? t.spend : (todayRead ? 0 : null), spend7: w.spend ?? null, roas7: lead ? null : (w.spend > 0 ? w.roas ?? div(w.revenue, w.spend) : null), cpl7: lead ? (w.cpl ?? null) : null }; };
  const adRow = (a, extra) => { const w = W[a.id] || {}, t = T[a.id] || {};
    return { id: a.id, name: a.name, video: w.media_type === 'video', spend_today: ok(t.spend) ? t.spend : null, spend: w.spend ?? null, revenue: w.revenue ?? null, roas: w.spend > 0 ? w.roas ?? null : null,
      purchases: w.purchases ?? null, cpa: w.cpa ?? null, ctr: w.ctr ?? null, cpm: w.cpm ?? null, frequency: w.frequency ?? null, impressions: w.impressions ?? null, ...extra }; };
  const campaigns = [], scheduled = [];
  for (const [id, c] of Object.entries(live.campaigns)) {
    const sets = setsOf[id] || [], liveSets = sets.filter(on), runSets = liveSets.filter(st => !later(st.id)), laterSets = liveSets.filter(st => later(st.id));
    const lead = /LEAD/.test((W[id] && W[id].objective) || '');
    const state = !on(c) ? 'off' : liveSets.length && !runSets.length ? 'scheduled' : 'live';
    const budget = c.daily ?? (liveSets.some(st => st.daily) ? liveSets.reduce((t, st) => t + (st.daily || 0), 0) : null);
    const row = { id, name: c.name, state, lead, budget, ...m(id, lead) };
    if (state === 'live') {
      row.adsets = runSets.map(st => {
        const ads = (adsOf[st.id] || []).map(a => adRow(a, { adset: st.name, campaign: c.name })).sort((p, q) => (q.spend || 0) - (p.spend || 0));
        return { id: st.id, name: st.name, budget: st.daily ?? null, n_ads: ads.length, ads: ads.slice(0, 24), ...m(st.id, lead) };
      }).sort((p, q) => (q.spend_today || 0) - (p.spend_today || 0) || (q.spend7 || 0) - (p.spend7 || 0));
    }
    if (state !== 'off') {
      const waitRow = (st, starts) => { const w = waitOf[st.id] || []; if (!w.length) return;
        const idle = !starts;   // running set: history unknown past 7 days, so not counted as waiting to start
        scheduled.push({ level: 'Ads', idle, name: idle ? `${w.length} ${w.length === 1 ? 'ad' : 'ads'} switched off, no spend in 7 days` : `${w.length} ${w.length === 1 ? 'ad' : 'ads'} loaded switched off`, campaign: c.name, adset: st.name, starts, budget: null, n_ads: w.length, ads: w.map(a => a.name) }); };
      if (state === 'scheduled') {
        const starts = laterSets.map(st => startOf(st.id)).sort()[0] || null;
        scheduled.push({ level: 'Campaign', name: c.name, campaign: null, adset: null, starts, budget, n_sets: laterSets.length, n_ads: laterSets.reduce((t, st) => t + (adsOf[st.id] || []).length, 0) });
        for (const st of laterSets) waitRow(st, startOf(st.id));
      } else {
        for (const st of laterSets) scheduled.push({ level: 'Ad set', name: st.name, campaign: c.name, adset: null, starts: startOf(st.id), budget: st.daily ?? null, n_ads: (adsOf[st.id] || []).length });
        for (const st of liveSets) waitRow(st, later(st.id) ? startOf(st.id) : null);
      }
    }
    campaigns.push(row);
  }
  const rank = r => (r.state === 'live' ? 0 : r.state === 'scheduled' ? 1 : 2);
  campaigns.sort((p, q) => (todayRead ? 0 : rank(p) - rank(q)) || (q.spend_today || 0) - (p.spend_today || 0) || (q.spend7 || 0) - (p.spend7 || 0));
  scheduled.sort((p, q) => String(p.starts || '9').localeCompare(String(q.starts || '9')));

  return {
    as_of: (pace && pace.pulled_at) || new Date().toISOString(), today, currency: (wb && wb.currency) || (pace && pace.account && pace.account.currency) || 'USD', connected: true,
    sales_source: salesSource, goals: { roas: goals.roas || null, cpa: goals.cpa || null }, today_read: todayRead,
    campaigns, scheduled,
    pace: pace && !pace.error && pace.today_cum ? { hour: pace.hour, today: pace.today_cum, usual: pace.l7_cum, spent: pace.spent, usual_by_now: pace.l7_by_now, usual_total: pace.l7_daily_avg, projected: pace.projected } : null,
    limit: eg && eg.limit ? eg.limit : null, examples: { limit: !!(eg && eg.limit) },
  };
}

/* ---------- the counts ---------- */
function counts(d) {
  const live = (d.campaigns || []).filter(c => c.state === 'live');
  const sets = live.flatMap(c => c.adsets || []);
  const sc = d.scheduled || [], n = l => sc.filter(r => r.level === l).length;
  const waitingAds = sc.reduce((t, r) => t + (r.level === 'Ads' && !r.idle ? r.n_ads || 0 : 0), 0) + sc.filter(r => r.level !== 'Ads').reduce((t, r) => t + (r.n_ads || 0), 0);
  return { campaigns: live.length, adsets: sets.length, ads: sets.reduce((t, s) => t + (s.n_ads ?? (s.ads || []).length), 0), off: (d.campaigns || []).filter(c => c.state === 'off').length,
    sch: { campaigns: n('Campaign'), adsets: n('Ad set') + sc.filter(r => r.level === 'Campaign').reduce((t, r) => t + (r.n_sets || 0), 0), ads: waitingAds, rows: sc.length } };
}
const plural = (n, one, many) => `${num(n)} ${n === 1 ? one : many || one + 's'}`;

/* ---------- the campaign list ---------- */
const OPEN = new Set();          // rows left open, kept while the page is redrawn with fresh numbers
function resultCell(r, d) {
  if (ok(r.cpl7)) return h('span', { class: 'r' }, 'Cost per lead ', h('b', null, money(r.cpl7, { cur: d.currency })));
  if (!d.sales_source) return h('span', { class: 'r mr-dim' }, 'no sales source');
  return h('span', { class: 'r' }, ok(r.roas7) ? ['ROAS ', h('b', null, x(r.roas7))] : h('span', { class: 'mr-dim' }, 'Too early'));
}
function line(r, d, cls, extra) {
  const cur = d.currency, goal = d.goals && d.goals.roas, open = OPEN.has(r.id);
  const can = cls === 'camp' ? (r.adsets || []).length > 0 : cls === 'set';
  const kids = [
    h('span', { class: 'nm' }, can ? h('i', { class: 'ml-car' }) : null, h('b', { title: r.name }, r.name), extra ? h('small', null, extra) : null,
      ok(r.budget) && r.spend_today === 0 && r.spend7 > 0 ? statusDot('warn', 'Not spending') : null),
    h('span', { class: 'r bud mr-dim' }, ok(r.budget) ? usd(r.budget, cur) + ' a day' : ''),
    h('span', { class: 'r' }, r.state === 'off' ? h('span', { class: 'mr-dim' }, 'off') : ok(r.spend_today) ? usd(r.spend_today, cur) : h('span', { class: 'mr-dim' }, 'not read yet')),
    r.state === 'off' ? h('span', { class: 'r mr-dim' }, '') : resultCell(r, d),
    h('span', { class: 'bar' }, d.sales_source && !ok(r.cpl7) && r.state !== 'off' ? roasBar(r.roas7, goal, goal && r.roas7 >= goal ? 'good' : '') : null),
  ];
  return can ? h('button', { type: 'button', class: 'ml-r ' + cls, 'aria-expanded': open ? 'true' : 'false', dataset: { id: r.id } }, kids) : h('div', { class: 'ml-r ' + cls + (r.state === 'off' ? ' off' : '') }, kids);
}
function adsBlock(st, d, ctx, c) {
  if (!(st.ads || []).length) return h('div', { class: 'ml-none' }, st.n_ads ? `${plural(st.n_ads, 'ad')} on. Their numbers show once Triple Whale has read them.` : 'No ads are on in this ad set.');
  const more = (st.n_ads || 0) - st.ads.length;
  return h('div', { class: 'ml-ads' }, st.ads.map(a => {
    const v = d.sales_source ? judge({ ...a }, d.goals) : null;
    const ad = { ...a, adset: a.adset || st.name, campaign: a.campaign || c.name };
    return opener(h('div', { class: 'ml-ad' }, adTile(a), h('b', { title: a.name }, a.name),
      h('span', { class: 's' }, v ? statusDot(v[0], v[1]) : h('span', null, a.video ? 'Video' : 'Image'), ok(a.spend_today) ? usd(a.spend_today, d.currency) + ' today' : ''),
      h('span', { class: 's' }, h('span', null, 'ROAS 7d ', h('b', null, ok(a.roas) ? x(a.roas) : 'none')), h('span', null, ok(a.spend) ? usd(a.spend, d.currency) : ''))),
    () => adSheet(ad, d, ctx, { period: 'the last 7 days', set: { name: st.name, spend: st.spend7, roas: st.roas7 } }), 'Open ' + a.name);
  }), more > 0 ? h('div', { class: 'ml-ad mr-dim' }, `and ${num(more)} more`) : null);
}
function liveBody(d, ctx, showOff) {
  const rows = (d.campaigns || []).filter(c => c.state === 'live');
  const out = [];
  if (!rows.length) out.push(h('div', { class: 'ml-none' }, 'No campaign is live right now.'));
  for (const c of rows.slice(0, 60)) {
    const n = (c.adsets || []).length;
    out.push(line(c, d, 'camp', n ? plural(n, 'ad set') : ''));
    if (!OPEN.has(c.id)) continue;
    for (const st of c.adsets) {
      out.push(line(st, d, 'set', plural(st.n_ads ?? (st.ads || []).length, 'ad')));
      if (OPEN.has(st.id)) out.push(adsBlock(st, d, ctx, c));
    }
  }
  if (showOff) for (const c of (d.campaigns || []).filter(c => c.state === 'off')) out.push(line(c, d, 'camp off'));
  return out;
}
function header(d) {
  const goal = d.goals && d.goals.roas;
  return h('div', { class: 'ml-r hd' }, h('span', null, 'Campaign'), h('span', { class: 'r bud' }, def('Budget a day', 'budget_a_day')), h('span', { class: 'r' }, def('Spent today', 'spent_today')),
    h('span', { class: 'r' }, def(d.sales_source ? 'ROAS, Triple Whale, last 7 days' : 'Result, last 7 days', 'result_7d')), h('span', { class: 'bar' }, goal ? def('Against goal ' + x(goal), 'goal_roas') : ''));
}

function adsTable(d, ctx) {
  const rows = (d.campaigns || []).filter(c => c.state === 'live').flatMap(c => (c.adsets || []).flatMap(st => (st.ads || []).map(a => ({ ...a, adset: st.name, campaign: c.name, _set: st }))));
  const cur = d.currency;
  return table({ rows, empty: 'No ad numbers read yet.', sort: { key: 'spend_today', dir: 'desc' },
    cols: [
      { key: 'name', label: 'Ad', sortable: true, render: a => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '10px', minWidth: 0 } }, adTile(a, 'xs'), h('span', { class: 'name' }, a.name)) },
      { key: 'adset', label: 'Ad set', sortable: true, class: 'hide-sm' },
      { key: 'campaign', label: 'Campaign', sortable: true, class: 'hide-md' },
      { key: 'spend_today', label: def('Spent today', 'spent_today'), num: true, sortable: true, render: a => ok(a.spend_today) ? usd(a.spend_today, cur) : h('span', { class: 'mr-dim' }, 'not read') },
      { key: 'spend', label: def('Spend, 7 days', 'ad_spend'), num: true, sortable: true, class: 'hide-sm', render: a => ok(a.spend) ? usd(a.spend, cur) : '' },
      { key: 'roas', label: def('ROAS, 7 days', 'roas'), num: true, sortable: true, render: a => ok(a.roas) ? x(a.roas) : h('span', { class: 'mr-dim' }, 'none') },
    ],
    onRow: a => adSheet(a, d, ctx, { period: 'the last 7 days', set: { name: a._set.name, spend: a._set.spend7, roas: a._set.roas7 } }) });
}

/* ---------- scheduled: one list ---------- */
const startText = s => { if (!s) return 'When switched on'; const t = new Date(s); const hr = t.getHours(), mi = t.getMinutes(); return weekDate(s) + (hr || mi ? ', ' + t.toLocaleTimeString('en-US', { hour: 'numeric', minute: mi ? '2-digit' : undefined }).replace(' ', '').toLowerCase() : ''); };
function scheduledTable(d, ctx) {
  const cur = d.currency, rows = d.scheduled || [];
  const open = r => sheet({ title: r.name, side: 'center', body: h('div', { style: { display: 'grid', gap: '12px' } },
    h('div', null, levelChip(r.level), ' ', [r.adset && 'In ad set ' + r.adset, r.campaign && 'campaign ' + r.campaign].filter(Boolean).join(', ')),
    h('div', null, 'Starts: ', h('b', null, startText(r.starts)), r.level === 'Ads' && !r.starts ? (r.idle ? '. Switched off in a running ad set with no spend in the last 7 days: a preload waiting for its date, or an ad turned off earlier.' : '. These ads wait switched off until someone turns them on on their date.') : ''),
    (r.ads || []).length ? h('div', { class: 'ml-sh' }, r.ads.map(n => h('div', null, h('span', null, n), statusDot('off', r.idle ? 'Off' : 'Off, waiting')))) : null) });
  return table({ rows, empty: 'Nothing is scheduled to start on Meta.', roomy: true,
    cols: [
      { key: 'starts', label: 'Starts', render: r => startText(r.starts) },
      { key: 'name', label: 'What', render: r => h('span', { class: 'lvl ml-sc', style: { display: 'flex', gap: '8px', alignItems: 'center', minWidth: 0 } }, levelChip(r.level),
        h('span', { class: 'nmw' }, h('b', { title: r.name }, r.name), h('small', null, [r.n_sets ? plural(r.n_sets, 'ad set') : null, r.level !== 'Ads' && r.n_ads ? plural(r.n_ads, 'ad') : null, r.adset ? 'in ' + r.adset : null].filter(Boolean).join(', ')))) },
      { key: 'campaign', label: 'In campaign', class: 'hide-sm', render: r => r.campaign || h('span', { class: 'mr-dim' }, 'this is the campaign') },
      { key: 'budget', label: def('Budget a day', 'budget_a_day'), num: true, render: r => ok(r.budget) ? usd(r.budget, cur) : '' },
    ],
    onRow: r => open(r) });
}

function campaignsCard(d, ctx) {
  const k = counts(d);
  let state = ctx.settingNow('meta.live.state', 'live'), show = ctx.settingNow('meta.live.show', 'campaigns'), showOff = !!ctx.settingNow('meta.live.showOff', false);
  if (state !== 'scheduled') state = 'live';
  const body = h('div', { class: 'ml-list' }), bar = h('div', { class: 'mr-bar' }), line2 = h('div', { class: 'ml-count' });
  body.addEventListener('click', e => {
    const b = e.target.closest('button.ml-r'); if (!b) return;
    const id = b.dataset.id; OPEN.has(id) ? OPEN.delete(id) : OPEN.add(id); paint();
  });
  const lim = d.limit && d.limit.limit > 0 ? d.limit : null;
  const limit = lim ? h('div', { class: 'ml-lim' },
    h('div', { class: 't' }, def('Daily account limit', 'daily_account_limit'), d.examples && d.examples.limit ? exampleChip() : null, h('b', null, usd(lim.used, d.currency)), h('i', null, 'of ' + usd(lim.limit, d.currency))),
    gauge({ value: lim.used, max: lim.limit, thin: true, tone: lim.used / lim.limit >= 0.9 ? 'bad' : '' })) : null;
  const paint = () => {
    put(bar,
      segmented([{ id: 'live', label: `Live campaigns ${k.campaigns}` }, { id: 'scheduled', label: `Scheduled ${k.sch.rows}` }], state, id => { state = id; ctx.saveSetting('meta.live.state', id); paint(); }),
      state === 'live' ? segmented([{ id: 'campaigns', label: 'Show campaigns' }, { id: 'ads', label: 'Show ads' }], show, id => { show = id; ctx.saveSetting('meta.live.show', id); paint(); }) : null,
      h('span', { class: 'sp' }),
      state === 'live' && show === 'campaigns' && k.off ? toggle({ label: `Show off campaigns (${k.off})`, checked: showOff, onchange: v => { showOff = v; ctx.saveSetting('meta.live.showOff', v); paint(); } }) : null,
      limit);
    put(line2, state === 'live'
      ? [h('b', null, plural(k.campaigns, 'campaign')), ', ', h('b', null, plural(k.adsets, 'ad set')), ', ', h('b', null, plural(k.ads, 'ad')), ' live on Meta right now']
      : [def('Scheduled', 'scheduled'), ': ', h('b', null, plural(k.sch.campaigns, 'campaign')), ', ', h('b', null, plural(k.sch.adsets, 'ad set')), ', ', h('b', null, plural(k.sch.ads, 'ad')), ' waiting to start']);
    if (state === 'scheduled') put(body, scheduledTable(d, ctx));
    else if (show === 'ads') put(body, adsTable(d, ctx));
    else put(body, header(d), ...liveBody(d, ctx, showOff));
  };
  paint();
  return [h('div', { class: 'ml-top' }, bar, line2), card({ flush: true, class: 'mr-list' }, body)];
}

/* ---------- today's pace ---------- */
function paceCard(d) {
  const p = d.pace, cur = d.currency;
  if (!p || !(p.today || []).length) return card({ title: 'Spend today, by hour' }, h('p', { class: 'mr-dim' }, 'Today\'s spend by hour could not be read from Meta just now.'));
  const hr = Math.max(0, Math.min(23, p.hour ?? p.today.length)), usual = (p.usual || []).slice(0, 24);
  const today = [0, ...p.today.slice(0, hr)], base = [0, ...usual];
  const labels = Array.from({ length: 25 }, (_, i) => hourWord(i));
  const b = v => h('b', null, v);
  const fig = (label, value, small) => h('div', null, h('span', { class: 'l' }, label), b(value), small ? h('small', null, small) : null);
  return card({ class: 'ml-pace' },
    h('div', { class: 'lx-chart-h' },
      h('div', null, h('div', { class: 'lx-sec' }, h('h3', null, 'Spend today, by hour')), h('p', null, 'Meta spend so far today, hour by hour, Central time')),
      legend([{ name: 'Today', lead: true }, usual.some(ok) && { name: 'A usual day, last 7 days', dashed: true }])),
    h('div', { class: 'ml-three' },
      fig('Spent by ' + hourWord(hr), usd(p.spent, cur)),
      ok(p.usual_by_now) ? fig(h('span', null, def('A usual day', 'usual_day'), ' by ' + hourWord(hr)), usd(p.usual_by_now, cur)) : null,
      ok(p.projected) ? fig('On pace to end the day near', usd(p.projected, cur), ok(p.usual_total) ? 'a usual whole day is ' + usd(p.usual_total, cur) : null) : null),
    lineChart({
      series: [{ name: 'Today', lead: true, values: today.concat(Array(25 - today.length).fill(null)), end: false },
        usual.some(ok) && { name: 'A usual day', dashed: true, values: base, end: false }],
      labels, ticks: [0, 3, 6, 9, 12, 15, 18, 21, 24], now: today.length - 1,
      format: v => money(v, { cur, compact: true }), height: 260, empty: 'No spend yet today',
      label: `Meta spend today by hour against a usual day. ${usd(p.spent, cur)} spent by ${hourWord(hr)}.`,
      hover: i => [b(hourWord(i)), ok(today[i]) ? h('span', null, 'Today ', b(usd(today[i], cur))) : null, ok(base[i]) ? h('span', null, 'A usual day ', b(usd(base[i], cur))) : null],
    }));
}

const HELP = [
  { title: 'What it is for', text: 'Everything running on Meta for this brand right now: the live campaigns, their ad sets and ads, what is scheduled to start, and whether today\'s spend is on pace.' },
  { title: 'Live campaigns and Scheduled', text: 'Live campaigns are on and spending. Open one for its ad sets and an ad set for its ads; every ad opens with all its numbers. Scheduled lists campaigns and ad sets with a start date ahead, and ads loaded switched off waiting for their day. Campaigns that are off are behind the "Show off campaigns" switch.' },
  { title: 'Where the numbers come from', text: 'Spend, budgets and start times come straight from Meta. Sales and ROAS are Triple Whale, last click per platform, over the last 7 full days. Today\'s spend per campaign shows once Meta\'s numbers for the day are read; the account total for today is always in the pace chart.' },
];

export default {
  title: 'Live now on Meta',
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
    put(el, headRow({ help: HELP }), ...campaignsCard(d, ctx), paceCard(d));
  },
};
