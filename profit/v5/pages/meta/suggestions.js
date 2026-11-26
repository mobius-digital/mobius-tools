/* Ads > Meta > Suggestions for one brand (team only): which ads should change today.
   Each row shows the call, the why with its numbers, and Yes and No (./_write.js, the same routes and bodies as
   old Locus buyer.js): Yes = dry run, a confirm sheet with before and after, the write, then the decision; No =
   a one line why, filed as a lesson. A viewer or a client sees no buttons.

   Real mode reads:
     GET /api/buyer-list?act=                                        account-health: today's calls from the ad rules, with the ads behind each
     GET /api/hub/creative?act=&from=&to=&model=lastPlatformClick    profit: the last 14 days of ads, for the "too early to judge" list */

import { put } from '../../kit.js';
import { h, card, button, segmented, gauge, table, empty, skeleton, money, num, sheet } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { ok, usd, addDays, shortDate, soft, adTile, gate, styles, statusDot, x, adSheet, opener } from './_rest.js';
import { def, info, headRow, warnLine, levelChip } from '../platforms/_ads.js';
import { canWrite, yesNo } from './_write.js';

const CSS = `
.ms-r{display:grid;grid-template-columns:64px minmax(0,1fr) 250px auto;gap:22px;align-items:start;padding:22px 28px;border-top:1px solid var(--line)}
.ms-r:first-child{border-top:0}
.ms-r .mr-tile{width:64px;height:80px}
.ms-h{display:block;margin:0;padding:0;border:0;background:none;font:inherit;font-size:16px;font-weight:600;letter-spacing:-.015em;color:var(--ink);text-align:left;cursor:pointer}
.ms-h:hover{text-decoration:underline;text-decoration-color:var(--line-strong);text-underline-offset:3px}
.ms-pic{padding:0;border:0;background:none;cursor:pointer;border-radius:var(--r-tbl,12px)}
.ms-t .o{margin-top:6px;display:flex;align-items:center;gap:8px;font-size:13px;min-width:0;overflow-wrap:anywhere}.ms-t .o b{font-weight:500}
.ms-t .o2{margin-top:2px;color:var(--muted);font-size:12.5px;overflow-wrap:anywhere}
.ms-per{display:block;margin-top:6px;color:var(--muted);font-size:12px}
.ms-sh{display:grid;gap:16px}.ms-sh .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ms-sh .g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.ms-sh .g>div{display:grid;gap:3px;padding:12px 14px;border-radius:var(--r-tbl,12px);background:var(--surface-2)}.ms-sh .g .l{font-size:12px;color:var(--muted)}
.ms-sh .y{font-size:14px;line-height:1.45;color:var(--ink-2)}
.ms-sh h3{margin:0 0 8px;font-size:13px;font-weight:600;color:var(--muted)}
.ms-ads{display:grid;border-radius:var(--r-tbl,12px);box-shadow:inset 0 0 0 1px var(--line);overflow:hidden}
.ms-ads>div{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 12px;border-top:1px solid var(--line);font-size:13px}.ms-ads>div:first-child{border-top:0}
@media (max-width:759px){.ms-sh .g{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ms-t .y{margin:10px 0 0;font-size:14px;line-height:1.45;color:var(--ink-2);max-width:62ch}
.ms-f{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;color:var(--muted);font-size:12.5px;font-variant-numeric:tabular-nums}
.ms-f b{font-weight:600;color:var(--ink)}.ms-f .good b{color:var(--good)}.ms-f .bad b{color:var(--bad)}
.ms-m .v{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}
.ms-m .v b{font-size:24px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ms-m .v b.bad{color:var(--bad)}.ms-m .v b.good{color:var(--good)}
.ms-m .v span{color:var(--muted);font-size:13px}
.ms-a{display:grid;gap:8px;justify-items:end;text-align:right;font-size:12.5px;color:var(--muted);max-width:220px}
.ms-goal{color:var(--muted);font-size:13.5px}.ms-goal b{color:var(--ink);font-weight:600}
.ms-tt{display:inline-flex;align-items:center;gap:6px}
.ms-early .lx-gauge{min-width:120px}
.ms-none{padding:22px 28px;color:var(--muted)}
@media (max-width:1180px){.ms-r{grid-template-columns:64px minmax(0,1fr) 200px}.ms-a{grid-column:2/-1;justify-items:start;text-align:left;max-width:none}}
@media (max-width:759px){
  .ms-r{grid-template-columns:48px minmax(0,1fr);gap:12px 14px;padding:18px 16px}
  .ms-r .mr-tile{width:48px;height:60px}
  .ms-m,.ms-a{grid-column:1/-1}
  .ms-a .lx-btn{width:100%;height:44px}
  .ms-none{padding:18px 16px}
  .ms-early td{white-space:normal}
}`;

const WORD = { raise: 'Raise budget', cut: 'Turn off', trim: 'Trim', refresh: 'New ads needed', tidy: 'Not spending', keep: 'Look closer', launch: 'Ready to load', note: 'Note' };
const LEVEL = { ad: 'Ad', adset: 'Ad set', campaign: 'Campaign', card: 'Batch' };

/* ---------- load: real mode ---------- */
function rowOf(r, hidden) {
  const c = r.card || {}, dec = r.decided || null;
  const pool = (r.ads && r.ads.ads) || [], pic = pool.find(a => a.focus) || pool[0] || null;
  const state = hidden ? (hidden.why === 'done' ? 'yes' : hidden.why === 'skipped' ? 'no' : 'quiet') : dec ? (dec.decision === 'yes' ? 'yes' : 'no') : c.decide ? 'decide' : 'fyi';
  return { key: r.key, kind: c.kind || 'note', level: c.level || r.level || 'adset', call: c.do || r.action || WORD[c.kind] || 'Look closer', object: c.object || r.name || '',
    adset: r.level === 'ad' ? (r.adset || r.set || null) : null, campaign: r.campaign || null, ads_pool: pool.slice(0, 12).map(a => ({ name: a.name || a.ad || '', video: !!a.video, thumb: a.cover || null, spend: a.spend ?? null, roas: a.roas ?? null })),
    because: c.because || r.why || '', facts: (c.facts || []).map(f => ({ l: f.l, v: f.v, good: !!f.good, bad: !!f.bad })),
    metric: r.metric || null, cpa: r.cpa ?? null, goal: r.goal ?? null, roas: r.roas ?? null, goal_roas: r.goal_roas ?? null, results: r.results ?? null, spend: r.spend ?? null,
    thumb: pic ? pic.cover || null : null, video: pic ? !!pic.video : false, state,
    note: hidden ? hidden.summary || '' : dec ? dec.note || '' : c.fyi || '', by: hidden ? hidden.by || null : dec ? dec.by || null : null,
    move: callOf(r) };
}
/** What Yes and No send: the buyer list row itself (ids, kind, the move), never the display words above. */
const callOf = r => ({ key: r.key, kind: r.kind, act_id: r.act_id, brand: r.brand, currency: r.currency, object: r.object, level: r.level, name: r.name, set: r.set, action: r.action,
  why: r.why, why_full: r.why_full, stake: r.stake, do: r.do || null, then: r.then || null, meta_act: r.meta_act, adset_id: r.adset_id, adset: r.adset, ad_id: r.ad_id, ad: r.ad,
  campaign_id: r.campaign_id, suggested_budget: r.suggested_budget, budget: r.budget, goal: r.goal, goal_roas: r.goal_roas, metric: r.metric, role: r.role, ai: r.ai || null, card: r.card ? { do: r.card.do } : null });
/** Sample rows carry made up ids and the move in the fixture; the brand is whatever is on screen. */
const sampleCall = (r, ctx) => ({ key: r.key, kind: r.kind, act_id: ctx.brand ? ctx.brand.id : 'sample', brand: ctx.brand ? ctx.brand.name : '', currency: 'USD',
  object: r.object_id || r.key, level: r.level, name: r.object, action: r.call, why: r.because, do: r.do || null, adset_id: r.adset_id || null, ad_id: r.ad_id || null,
  campaign_id: r.campaign_id || null, suggested_budget: r.suggested_budget || null, budget: r.budget || null });
async function load(ctx) {
  const act = encodeURIComponent(ctx.brand.id);
  const to = new Date(Date.now() - 864e5).toISOString().slice(0, 10), from = addDays(to, -13);
  const [list, cr] = await Promise.all([
    ctx.api(`/api/buyer-list?act=${act}`, { worker: 'ah', signal: ctx.signal }),
    soft(ctx.api(`/api/hub/creative?act=${act}&from=${from}&to=${to}&model=lastPlatformClick`, { worker: 'profit', signal: ctx.signal })),
  ]);
  const meta = r => r.kind !== 'launch' && !/google|tiktok/i.test(r.platform || '');
  const rows = (list.rows || []).filter(meta).map(r => rowOf(r)).concat((list.quiet || []).filter(meta).filter(r => r.hidden && ['done', 'skipped'].includes(r.hidden.why)).map(r => rowOf(r, r.hidden)));
  /* too early: ads first seen in the last 14 days that have not yet spent twice the goal cost or run 3 days */
  const g = (cr && cr.goals) || {}, need = g.cpa ? g.cpa * 2 : null;
  const live = addDays(to, -1);
  const early = need ? ((cr && cr.ads) || []).filter(a => a.obj !== 'leads' && ok(a.age) && a.age <= 13 && a.last_day >= live && (a.spend < need || a.age < 3))
    .slice(0, 12).map(a => ({ id: a.id, name: a.name, video: a.media_type === 'video', spend: a.spend, need, day: a.age + 1, judge_on: a.age < 3 && a.first_spend ? addDays(a.first_spend, 3) : null })) : null;
  return { as_of: list.as_of || null, today: list.today || null, currency: list.currency || (cr && cr.currency) || 'USD', connected: true,
    goals: { roas: g.roas || null, cpa: g.cpa || null, metric: g.metric || null }, rows, early, notes: (list.notes || []).slice(0, 3) };
}

/* ---------- a row ---------- */
function measure(r, d) {
  const cur = d.currency;
  if (ok(r.cpa) && r.goal > 0 && r.metric !== 'roas') {
    const bad = r.cpa > r.goal;
    return h('div', { class: 'ms-m' }, h('div', { class: 'v' }, h('b', { class: bad ? 'bad' : 'good' }, usd(r.cpa, cur)), h('span', null, r.metric === 'cpl' ? 'a lead' : 'a sale')),
      gauge({ value: r.cpa, max: Math.max(r.cpa * 1.1, r.goal * 2), goal: r.goal, thin: true, tone: bad ? 'bad' : 'good', ticks: [{ side: 'l', text: usd(0, cur) }, { at: r.goal, text: 'goal ' + usd(r.goal, cur), on: true }] }));
  }
  if (ok(r.roas) && r.goal_roas > 0) {
    const bad = r.roas < r.goal_roas;
    return h('div', { class: 'ms-m' }, h('div', { class: 'v' }, h('b', { class: bad ? 'bad' : 'good' }, x(r.roas)), h('span', null, 'ROAS')),
      gauge({ value: r.roas, max: Math.max(r.roas * 1.1, r.goal_roas * 1.6), goal: r.goal_roas, thin: true, tone: bad ? 'bad' : 'good', ticks: [{ side: 'l', text: '0' }, { at: r.goal_roas, text: 'goal ' + x(r.goal_roas), on: true }] }));
  }
  if (r.results === 0 && r.spend > 0) return h('div', { class: 'ms-m' }, h('div', { class: 'v' }, h('b', { class: 'bad' }, '0 sales'), h('span', null, 'on ' + usd(r.spend, cur))));
  return h('div', { class: 'ms-m' });
}
const PERIOD = 'last 7 days';
function measureWithPeriod(r, d) { const m = measure(r, d); if (m.childNodes.length) m.append(h('span', { class: 'ms-per' }, PERIOD)); return m; }
/* the facts line: plain labels, the jargon defined */
const FACT = { 'spend 7d': ['Spend, 7 days', 'ad_spend'], 'spend, 7 days': ['Spend, 7 days', 'ad_spend'], 'spend': ['Spend, 7 days', 'ad_spend'], 'sales': ['Sales', 'sales'], 'cost per sale': ['Cost per sale', 'cpa'],
  'first click': ['First click', 'first_click'], 'click rate': ['Click rate', 'click_rate'], 'ctr': ['Click rate', 'click_rate'], 'budget': ['Budget', 'budget_a_day'], 'frequency': ['Frequency', 'frequency'], 'cpm': ['CPM', 'cpm'], 'roas': ['ROAS', 'roas'] };
function factOf(f) {
  const k = String(f.l || '').trim().toLowerCase();
  if (k === 'budget shared' || (k === 'budget' && /shared/i.test(f.v))) return h('span', null, def('Budget', 'budget_a_day'), ': ', h('b', null, 'set on the campaign'));
  const m = FACT[k];
  return h('span', { class: f.good ? 'good' : f.bad ? 'bad' : '' }, m ? def(m[0], m[1]) : f.l, ' ', h('b', null, f.v));
}
/* where the thing sits: the object line under the call */
function where(r) {
  let name = r.object, adset = r.adset, campaign = r.campaign;
  if (r.level === 'ad' && !adset && / in /.test(name)) { const i = name.lastIndexOf(' in '); adset = name.slice(i + 4); name = name.slice(0, i); }
  return { name, adset, campaign };
}
/* the detail behind a row: an ad opens the shared ad sheet with its ad set beside it; an ad set or campaign shows its own scorecard and its ads */
function openRow(r, d, ctx) {
  const w = where(r), cur = d.currency;
  if (r.level === 'ad') return adSheet({ id: r.ad_id || r.object_id, name: w.name, video: r.video, thumb: r.thumb, adset: w.adset, campaign: w.campaign, spend: r.spend, roas: r.roas, cpa: r.cpa, purchases: r.results }, { ...d, sales_source: true }, ctx, { period: 'the ' + PERIOD });
  const kv = (label, key, value) => h('div', null, h('span', { class: 'l' }, def(label, key)), h('b', null, value));
  return sheet({ title: w.name, body: h('div', { class: 'ms-sh' },
    h('div', { class: 'top' }, levelChip(LEVEL[r.level] || 'Ad set'), h('span', { class: 'mr-dim' }, 'Meta ' + (LEVEL[r.level] || 'ad set').toLowerCase() + (w.campaign ? ' in ' + w.campaign : '') + ', numbers for the ' + PERIOD)),
    h('div', { class: 'g' }, kv('Spend', 'ad_spend', ok(r.spend) ? usd(r.spend, cur) : 'not read'), kv('Orders', 'purchases_last_click', ok(r.results) ? num(r.results) : 'not read'),
      kv('Cost per sale', 'cpa', ok(r.cpa) ? usd(r.cpa, cur) + (r.goal ? ', goal ' + usd(r.goal, cur) : '') : 'no sales'), kv('ROAS', 'roas', ok(r.roas) ? x(r.roas) + (r.goal_roas ? ', goal ' + x(r.goal_roas) : '') : 'no sales')),
    measure(r, d),
    (r.facts || []).length ? h('div', { class: 'ms-f' }, r.facts.map(factOf)) : null,
    r.because ? h('p', { class: 'y' }, r.because) : null,
    (r.ads_pool || []).length ? h('div', null, h('h3', null, 'Its ads'), h('div', { class: 'ms-ads' }, r.ads_pool.map(a => h('div', null, adTile(a, 'xs'), h('span', null, a.name), h('b', null, [ok(a.spend) ? usd(a.spend, cur) : null, ok(a.roas) ? x(a.roas) : null].filter(Boolean).join(', '))))))
      : null,
    h('div', null, button('Open in Live now', { href: ctx.href('meta', 'live-now') }))) });
}
const who = v => { const s = String(v || ''); return s.includes('@') ? s.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : s; };
function suggestion(r, d, ctx, repaint) {
  let act;
  if (r.state === 'decide' && canWrite(ctx)) {
    const call = r.move || sampleCall(r, ctx);
    act = [yesNo(ctx, call, res => {
      if (!res || !res.decision) { r.state = 'decide'; r.by = null; r.note = ''; }
      else { r.state = res.decision; r.by = (ctx.me && ctx.me.email) || 'you'; r.note = res.decision === 'no' ? res.note || '' : res.summary || ''; }
      repaint();
    })];
  } else if (r.state === 'decide') act = [statusDot('warn', 'Waiting for the team')];
  else if (r.state === 'yes') act = [statusDot('good', 'Done' + (r.by ? ' by ' + who(r.by) : '')), r.note ? h('span', null, r.note) : null];
  else if (r.state === 'no') act = [statusDot('off', 'Said no' + (r.by ? ', ' + who(r.by) : '')), r.note ? h('span', null, r.note) : null];
  else act = [statusDot('info', r.note || 'Nothing to do')];
  const w = where(r);
  const go = () => openRow(r, d, ctx);
  return h('div', { class: 'ms-r' },
    h('button', { type: 'button', class: 'ms-pic', onclick: go, 'aria-label': 'Open ' + w.name, title: 'See every number' }, adTile({ thumb: r.thumb, video: r.video, name: w.name })),
    h('div', { class: 'ms-t' },
      h('button', { type: 'button', class: 'ms-h', onclick: go, title: 'See every number' }, r.call),
      h('div', { class: 'o' }, levelChip(LEVEL[r.level] || 'Ad set'), h('b', null, w.name)),
      h('div', { class: 'o2' }, ['Meta', w.adset ? 'ad set ' + w.adset : null, w.campaign ? 'campaign ' + w.campaign : null].filter(Boolean).join(', ')),
      r.because ? h('p', { class: 'y' }, r.because) : null,
      r.facts && r.facts.length ? h('div', { class: 'ms-f' }, r.facts.map(factOf)) : null),
    measureWithPeriod(r, d),
    h('div', { class: 'ms-a' }, act));
}

const TABS = [['decide', 'To decide'], ['yes', 'Done'], ['no', 'Said no'], ['fyi', 'Nothing to do']];
function listCard(d, ctx) {
  const rows = d.rows || [], of = s => rows.filter(r => r.state === s);
  let state = 'decide';
  const body = h('div'), cur = d.currency, g = d.goals || {};
  const NONE = { decide: 'Nothing to decide today.', yes: 'Nothing has been done from this list today.', no: 'No call has been turned down today.', fyi: 'Nothing here.' };
  const segBox = h('span', { style: { display: 'contents' } });
  const paint = () => put(body, ...(of(state).length ? of(state).map(r => suggestion(r, d, ctx, () => { paint(); tabsPaint(); })) : [h('div', { class: 'ms-none' }, NONE[state])]));
  const tabsPaint = () => {
    const items = TABS.filter(([id]) => id === 'decide' || id === state || of(id).length).map(([id, label]) => ({ id, label: `${label} ${of(id).length}` }));
    put(segBox, segmented(items, state, id => { state = id; paint(); }));
  };
  paint(); tabsPaint();
  return [
    h('div', { class: 'mr-bar' }, segBox, h('span', { class: 'sp' }),
      g.cpa || g.roas ? h('span', { class: 'ms-goal' }, 'Goal ', h('b', null, g.metric === 'roas' && g.roas ? x(g.roas) + ' ROAS' : g.cpa ? usd(g.cpa, cur) + ' a sale' : x(g.roas) + ' ROAS')) : h('span', { class: 'ms-goal' }, 'No goal set for this brand')),
    card({ flush: true, class: 'mr-list' }, body),
  ];
}
function earlyCard(d, ctx) {
  const rows = d.early;
  if (!rows) return null;
  const cur = d.currency, need = rows[0] ? rows[0].need : (d.goals.cpa || 0) * 2;
  return card({ title: h('span', { class: 'ms-tt' }, 'Too early to judge', info('too_early')), note: `Meta ads, judged after ${usd(need, cur)} spent and 3 days`, flush: true, class: 'ms-early' },
    table({ empty: 'Every running ad has enough spend to judge.', rows, onRow: r => adSheet({ ...r, age: r.day - 1 }, { ...d, sales_source: true }, ctx, { period: 'the last 14 days' }), cols: [
      { key: 'name', label: 'Ad', render: r => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '12px', minWidth: 0 } }, adTile(r, 'xs'), h('span', { class: 'name' }, r.name)) },
      { key: 'spend', label: def('Spent', 'ad_spend'), num: true, render: r => usd(r.spend, cur) },
      { key: 'bar', label: `Of ${usd(need, cur)} needed`, class: 'hide-sm', render: r => gauge({ value: r.spend, max: r.need, thin: true }) },
      { key: 'day', label: 'Running', num: true, render: r => r.judge_on ? h('span', null, `day ${r.day}, judge ${shortDate(r.judge_on)}`) : `day ${r.day}` },
    ] }));
}

export default {
  title: 'Suggestions for Meta',
  eyebrow: 'Meta',
  ranges: false,
  asOf: d => d && d.as_of,
  load,
  skeleton(el) { put(el, skeleton('row', 6)); },
  render(el, d, ctx) {
    styles('ms-css', CSS);
    if (ctx.isClient) return put(el, empty({ title: 'Suggestions are for the team', text: 'Nothing for you to decide here. The changes we make are under Changes.', action: button('Open Changes', { href: ctx.href('meta', 'changes') }) }));
    const stop = gate(d, ctx, 'Suggestions');
    if (stop) return put(el, stop);
    const help = [
      { title: 'What it is for', text: "Today's calls on this brand's Meta ads, from the agency's ad rules. Each row names the ad, ad set or campaign, the call, why, and the numbers for the last 7 days. Tap the picture or the call for every number." },
      { title: 'Yes and No', text: 'Yes makes the change in Meta after a look at the before and after, and logs it under Changes, where it can be undone for 24 hours. No changes nothing and keeps your reason as a lesson.' },
      { title: 'Where the numbers come from', text: 'Sales and cost per sale are Triple Whale, last click per platform. Spend is Meta\'s. An ad is judged once it has spent twice the goal cost per sale and run 3 days.' },
      ctx.legacy && canWrite(ctx) ? h('p', null, h('a', { href: ctx.legacy, target: '_blank', rel: 'noopener' }, 'Open this list in old ' + APP_NAME)) : null,
    ].filter(Boolean);
    put(el, ...[
      headRow({ help }),
      (d.notes || []).length ? warnLine('Could not read everything: ' + d.notes.join('. ')) : null,
      ...listCard(d, ctx), earlyCard(d, ctx),
    ].filter(Boolean));
  },
};
