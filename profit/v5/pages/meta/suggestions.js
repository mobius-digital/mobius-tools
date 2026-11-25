/* Ads > Meta > Suggestions for one brand (team only): which ads should change today.
   READ ONLY in this version. Each row shows the call, the why with its numbers, and a button that opens the
   old page where the change is made. Nothing on this page writes to Meta or to the list.

   Real mode reads:
     GET /api/buyer-list?act=                                        account-health: today's calls from the ad rules, with the ads behind each
     GET /api/hub/creative?act=&from=&to=&model=lastPlatformClick    profit: the last 14 days of ads, for the "too early to judge" list */

import { put } from '../../kit.js';
import { h, em, card, button, segmented, gauge, table, empty, skeleton, money, num } from '../../kit.js';
import { APP_NAME } from '../../config.js';
import { ok, usd, addDays, shortDate, soft, adTile, gate, foot, styles, statusDot, x } from './_rest.js';

const CSS = `
.ms-r{display:grid;grid-template-columns:64px minmax(0,1fr) 250px auto;gap:22px;align-items:start;padding:22px 28px;border-top:1px solid var(--line)}
.ms-r:first-child{border-top:0}
.ms-r .mr-tile{width:64px;height:80px}
.ms-t h4{margin:0;font-size:16px;font-weight:600;letter-spacing:-.015em}
.ms-t .o{margin-top:3px;color:var(--muted);font-size:13px;overflow-wrap:anywhere}
.ms-t .y{margin:10px 0 0;font-size:14px;line-height:1.45;color:var(--ink-2);max-width:62ch}
.ms-f{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;color:var(--muted);font-size:12.5px;font-variant-numeric:tabular-nums}
.ms-f b{font-weight:600;color:var(--ink)}.ms-f .good b{color:var(--good)}.ms-f .bad b{color:var(--bad)}
.ms-m .v{display:flex;align-items:baseline;gap:8px;margin-bottom:8px}
.ms-m .v b{font-size:24px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.ms-m .v b.bad{color:var(--bad)}.ms-m .v b.good{color:var(--good)}
.ms-m .v span{color:var(--muted);font-size:13px}
.ms-a{display:grid;gap:8px;justify-items:end;text-align:right;font-size:12.5px;color:var(--muted);max-width:220px}
.ms-goal{color:var(--muted);font-size:13.5px}.ms-goal b{color:var(--ink);font-weight:600}
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
    because: c.because || r.why || '', facts: (c.facts || []).map(f => ({ l: f.l, v: f.v, good: !!f.good, bad: !!f.bad })),
    metric: r.metric || null, cpa: r.cpa ?? null, goal: r.goal ?? null, roas: r.roas ?? null, goal_roas: r.goal_roas ?? null, results: r.results ?? null, spend: r.spend ?? null,
    thumb: pic ? pic.cover || null : null, video: pic ? !!pic.video : false, state,
    note: hidden ? hidden.summary || '' : dec ? dec.note || '' : c.fyi || '', by: hidden ? hidden.by || null : dec ? dec.by || null : null };
}
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
const who = v => { const s = String(v || ''); return s.includes('@') ? s.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : s; };
function suggestion(r, d, ctx) {
  let act;
  if (r.state === 'decide') act = [ctx.legacy ? button('Do it in old ' + APP_NAME, { href: ctx.legacy, icon: 'arrow' }) : null];
  else if (r.state === 'yes') act = [statusDot('good', 'Done' + (r.by ? ' by ' + who(r.by) : '')), r.note ? h('span', null, r.note) : null];
  else if (r.state === 'no') act = [statusDot('off', 'Said no' + (r.by ? ', ' + who(r.by) : '')), r.note ? h('span', null, r.note) : null];
  else act = [statusDot('info', r.note || 'Nothing to do')];
  return h('div', { class: 'ms-r' },
    adTile({ thumb: r.thumb, video: r.video, name: r.object }),
    h('div', { class: 'ms-t' },
      h('h4', null, r.call),
      h('div', { class: 'o' }, (LEVEL[r.level] || 'Ad set') + ' ', r.object),
      r.because ? h('p', { class: 'y' }, r.because) : null,
      r.facts && r.facts.length ? h('div', { class: 'ms-f' }, r.facts.map(f => h('span', { class: f.good ? 'good' : f.bad ? 'bad' : '' }, f.l + ' ', h('b', null, f.v)))) : null),
    measure(r, d),
    h('div', { class: 'ms-a' }, act));
}

const TABS = [['decide', 'To decide'], ['yes', 'Done'], ['no', 'Said no'], ['fyi', 'Nothing to do']];
function listCard(d, ctx) {
  const rows = d.rows || [], of = s => rows.filter(r => r.state === s);
  let state = 'decide';
  const body = h('div'), cur = d.currency, g = d.goals || {};
  const NONE = { decide: 'Nothing to decide today.', yes: 'Nothing has been done from this list today.', no: 'No call has been turned down today.', fyi: 'Nothing here.' };
  const paint = () => put(body, ...(of(state).length ? of(state).map(r => suggestion(r, d, ctx)) : [h('div', { class: 'ms-none' }, NONE[state])]));
  paint();
  const items = TABS.filter(([id]) => id === 'decide' || of(id).length).map(([id, label]) => ({ id, label: `${label} ${of(id).length}` }));
  const n = of('decide').length;
  return [
    h('div', { class: 'mr-bar' }, segmented(items, state, id => { state = id; paint(); }), h('span', { class: 'sp' }),
      g.cpa || g.roas ? h('span', { class: 'ms-goal' }, 'Goal ', h('b', null, g.metric === 'roas' && g.roas ? x(g.roas) + ' ROAS' : g.cpa ? usd(g.cpa, cur) + ' a sale' : x(g.roas) + ' ROAS')) : h('span', { class: 'ms-goal' }, 'No goal set for this brand'),
      n && ctx.legacy ? button(n === 1 ? 'Answer it in old ' + APP_NAME : `Answer all ${n} in old ${APP_NAME}`, { primary: true, href: ctx.legacy, icon: 'arrow' }) : null),
    card({ flush: true, class: 'mr-list' }, body),
  ];
}
function earlyCard(d) {
  const rows = d.early;
  if (!rows) return null;
  const cur = d.currency, need = rows[0] ? rows[0].need : (d.goals.cpa || 0) * 2;
  return card({ title: 'Too early to judge', note: `an ad is judged after ${usd(need, cur)} spent and 3 days`, flush: true, class: 'ms-early' },
    table({ empty: 'Every running ad has enough spend to judge.', rows, cols: [
      { key: 'name', label: 'Ad', render: r => h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '12px', minWidth: 0 } }, adTile(r, 'xs'), h('span', { class: 'name' }, r.name)) },
      { key: 'spend', label: 'Spent', num: true, render: r => usd(r.spend, cur) },
      { key: 'bar', label: `Of ${usd(need, cur)} needed`, class: 'hide-sm', render: r => gauge({ value: r.spend, max: r.need, thin: true }) },
      { key: 'day', label: 'Running', num: true, render: r => r.judge_on ? h('span', null, `day ${r.day}, judge ${shortDate(r.judge_on)}`) : `day ${r.day}` },
    ] }));
}

export default {
  title: ['Which Meta ads should ', em('change today?')],
  eyebrow: 'Meta',
  ranges: false,
  asOf: d => d && d.as_of,
  load,
  skeleton(el) { put(el, skeleton('row', 6)); },
  render(el, d, ctx) {
    styles('ms-css', CSS);
    if (ctx.isClient) return put(el, empty({ title: 'Suggestions are for the team', text: 'Nothing for you to decide here. The changes we make are under Changes made.', action: button('Open changes made', { href: ctx.href('meta', 'changes') }) }));
    const stop = gate(d, ctx, 'Suggestions');
    if (stop) return put(el, stop);
    put(el, ...[
      ...listCard(d, ctx), earlyCard(d),
      (d.notes || []).length ? h('p', { class: 'lx-foot' }, 'Could not read everything: ' + d.notes.join('. ')) : null,
      foot(`This page only reads. A change is made in old ${APP_NAME}, where it lands in the change list with undo. Sales and cost per sale from Triple Whale, last click per platform. Spend from Meta.`),
    ].filter(Boolean));
  },
};
