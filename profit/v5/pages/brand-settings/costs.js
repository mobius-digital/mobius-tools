/* Brand settings > Costs. A brand enters its own costs here, so net profit is right.
   THIS IS THE ONE PAGE IN V5 THAT WRITES. Every write goes to the profit worker with the signed in session
   (ctx.api, the same base and Authorization as every read):
     GET    /api/costs?act=<brand id>                 everything on the page, in one call
     GET    /api/expenses?act=<brand id>              the fixed cost list, read again just before a save
     PUT    /api/expenses {act, items}                saves the brand's WHOLE fixed cost list (add, edit and remove are
                                                      all this one call; there is no DELETE on /api/expenses)
     PUT    /api/costs {act, rule}                    add a shipping or product rule, or change one by id
     DELETE /api/costs?act=&id=                       remove one rule;  ?act=&sheet=<batch> removes an uploaded sheet
     POST   /api/costs/sheet {act, csv, start_date, filename, dry_run}   check a cost sheet, then save it
   In sample mode nothing is sent: a change is made to the copy on screen only, and a toast says so.

   TWO WORKER ANSWERS. The page above is written for the profit worker with the Brand costs work in it (commit
   a4e895d6, on main): GET /api/costs then answers with fixed, shipping_rules, product_cost, payment_fees, handling,
   margin_override, choices, missing and currency, and the rule and sheet routes exist.
   The worker that is deployed today is older. Its GET /api/costs answers only { account, margin_pct, health,
   shipping, worst, rows, skus } and it has no PUT or DELETE /api/costs and no /api/costs/sheet. The page tells the
   two apart by the keys in the answer. On the older answer it reads the fixed costs from GET /api/expenses (items,
   categories, kinds: live today), keeps add, edit and remove of fixed costs (PUT /api/expenses is live), takes the
   currency from account.currency, and shows shipping and product rules as not switched on, with no rule or sheet
   button. Nothing is sent to a route the worker does not have. When the newer worker is deployed the full page
   shows by itself, with no change here.
   Add, edit and remove happen in a sheet that rises from the bottom. No browser alert or confirm anywhere. */

import { APP_NAME } from '../../config.js';
import { put } from '../../kit.js';
import { h, em, empty, card, statusDot, pill, button, sheet, toast, money, num, addStyles } from '../../kit.js';
import { putSaved, pageKey, announce } from '../../data.js';
import { css } from './_set.js';
import { datePick, countTiles } from '../a-settings/_look.js';
import { defLabel, infoButton, pageHelp } from '../../defs.js';

/* ---------- words ---------- */
const HOW = [
  ['monthly', 'Every month', 'money', 'The same amount each month, spread evenly over the month.'],
  ['weekly', 'Every week', 'money', 'The same amount each week, starting on the start date.'],
  ['daily', 'Every day', 'money', 'The same amount each day.'],
  ['quarterly', 'Every quarter', 'money', 'The same amount each calendar quarter, spread evenly over it.'],
  ['yearly', 'Every year', 'money', 'The same amount each calendar year, spread evenly over it.'],
  ['once', 'One time', 'money', 'Counted once, on the day it was paid.'],
  ['custom', 'Custom dates', 'money', 'One amount spread evenly from the start date to the end date.'],
  ['pct_revenue', '% of revenue', 'pct', 'Worked out from each day’s revenue (total sales minus tax).'],
  ['pct_spend', '% of ad spend', 'pct', 'Worked out from each day’s ad spend.'],
  ['per_order', 'Per order', 'money', 'Times each day’s paid orders, like a packaging insert.'],
];
const HOW_OF = Object.fromEntries(HOW.map(k => [k[0], k]));
const EACH = { monthly: 'every month', weekly: 'every week', daily: 'every day', quarterly: 'every quarter', yearly: 'every year', once: 'one time', custom: 'over custom dates', per_order: 'per order' };
const RULE_SAY = { per_order: 'per order', pct_revenue: 'of revenue', per_item: 'per item', weight_tier: 'By weight', zone: 'By country or zone' };
const SOURCE = { locus: 'Your own rule', triple_whale: 'Triple Whale', flat_margin: 'A flat margin', none: 'Nothing is counted' };
const NOT_YET = 'Saved, not applied yet';
const NOT_YET_WHY = 'Per order and % of revenue rules are used in profit now. Per item, by weight and by zone rules and a cost sheet are kept, and are used once each order’s items, weight and country can be read. Until then profit keeps what it uses today.';
/** the "saved, not applied yet" pill, with its reason on hover */
const notYet = () => { const el = pill('warn', NOT_YET); el.title = NOT_YET_WHY; return el; };
const SAMPLE_SAY = 'Sample mode: changed on screen only. Nothing was sent.';

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dayOf = s => new Date(s + 'T12:00:00');
const short = s => (YMD.test(s || '') ? dayOf(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: dayOf(s).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : '');
const known = n => n != null && isFinite(n);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');

/** A typed amount as a number, or a reason it cannot be read. A decimal comma is never guessed at. */
function readAmount(v) {
  const s = String(v ?? '').replace(/[\s$£€¥%]/g, '');
  if (!s) return { error: 'Type an amount.' };
  if (/^\d+(\.\d+)?$/.test(s)) return { n: +s };
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return { n: +s.replace(/,/g, '') };
  if (/^(\d+|\d{1,3}(\.\d{3})+),\d+$/.test(s)) return { error: 'Write the amount with a point, like 4.50.' };
  return { error: 'The amount is not a number.' };
}

/* ---------- the page's own data ---------- */
/** Keep only what the page draws: the route also answers with day rows the page never shows. */
function trim(j) {
  j = j || {};
  const f = j.fixed || {}, s = j.shipping_rules || {}, p = j.product_cost || {};
  return {
    ...(j.legacy ? { legacy: true, fixed_unread: !!j.fixed_unread } : {}),
    currency: j.currency || (j.account && j.account.currency) || 'USD',
    fixed: { items: f.items || [], active: f.active ?? null, month_total: f.month_total ?? null, categories: f.categories || [], brand_categories: f.brand_categories || [], kinds: f.kinds || [] },
    shipping_rules: { rules: s.rules || [], in_use: s.in_use || null, last30: s.last30 || null },
    product_cost: { rules: p.rules || [], in_use: p.in_use || null, sheet: p.sheet || null, coverage: p.coverage || null, last30: p.last30 || null },
    payment_fees: j.payment_fees || null,
    handling: j.handling || null,
    margin_override: j.margin_override ?? null,
    choices: j.choices || null,
    missing: Array.isArray(j.missing) ? j.missing : null,
    ...(j.today ? { today: j.today } : {}), ...(j.sample_month ? { sample_month: j.sample_month } : {}),
  };
}
/** True when the answer is from the worker with the Brand costs work in it. The older one sends none of these keys. */
const isFull = j => !!j && ('fixed' in j || 'shipping_rules' in j || 'product_cost' in j);
/** The older worker's answer, put in the page's shape. Fixed costs come from /api/expenses; rules are not there to read. */
function fromOlder(costs, exp) {
  const t = ymd(new Date()), items = (exp && exp.items) || [];
  return {
    legacy: true, fixed_unread: !exp,
    currency: (costs && costs.account && costs.account.currency) || (exp && exp.currency) || 'USD',
    fixed: { items, active: exp ? items.filter(x => !x.is_ad_spend && x.start_date <= t && (!x.end_date || x.end_date >= t)).length : null, month_total: null,
      categories: (exp && exp.categories) || [], brand_categories: [], kinds: (exp && exp.kinds) || [] },
    margin_override: costs && known(costs.margin_pct) ? costs.margin_pct : null,
  };
}
async function fetchPage(ctx, opt = {}) {
  const act = encodeURIComponent(ctx.brand.id);
  const j = await ctx.api('/api/costs?act=' + act, opt);
  if (isFull(j)) return trim(j);
  const exp = await ctx.api('/api/expenses?act=' + act, opt).catch(e => { if (e && (e.name === 'AbortError' || e.status === 401)) throw e; return null; });
  return trim(fromOlder(j, exp));
}
const readPage = ctx => fetchPage(ctx, { signal: ctx.signal });

/* One page on screen at a time. P = { el, d, ctx } */
let P = null;
const todayOf = d => (P && P.ctx.sample && d.today) || ymd(new Date());
const cur = () => P.d.currency || 'USD';
const cash = n => money(n, { cur: cur() });

/** After a real write: read the page again, keep the fresh copy for the next visit, tell the other tabs. */
async function reread(sayOk) {
  const { ctx } = P;
  try {
    const fresh = await fetchPage(ctx);
    P.d = fresh;
    putSaved(pageKey({ view: ctx.view, brandId: ctx.brand.id, line: ctx.line.id, tab: ctx.tab.id, range: null, client: ctx.isClient }), fresh).catch(() => {});
  } catch { toast('Saved. The page could not be read again, so open it again to see the change.', { tone: 'bad', ms: 5000 }); }
  announce('costs:' + ctx.brand.id);
  draw();
  if (sayOk) toast(sayOk);
}

/* ---------- sample mode: the change is made on screen only ---------- */
function sampleFixedTotal(d) {
  const t = todayOf(d), from = t.slice(0, 8) + '01', m = d.sample_month || {};
  const dim = new Date(+t.slice(0, 4), +t.slice(5, 7), 0).getDate();
  const days = (a, b) => Math.max(0, Math.round((dayOf(b) - dayOf(a)) / 864e5) + 1);
  let sum = 0;
  for (const x of d.fixed.items) {
    if (x.is_ad_spend || !YMD.test(x.start_date || '')) continue;
    const a = +x.amount || 0;
    if (x.kind === 'once') { if (x.start_date >= from && x.start_date <= t) sum += a; continue; }
    const lo = x.start_date > from ? x.start_date : from, hi = x.end_date && x.end_date < t ? x.end_date : t, n = lo <= hi ? days(lo, hi) : 0;
    if (!n) continue;
    const share = n / days(from, t);
    sum += x.kind === 'monthly' ? a / dim * n : x.kind === 'daily' ? a * n : x.kind === 'weekly' ? a / 7 * n : x.kind === 'quarterly' ? a / 91 * n : x.kind === 'yearly' ? a / 365 * n
      : x.kind === 'custom' ? (x.end_date ? a / days(x.start_date, x.end_date) * n : 0)
      : x.kind === 'pct_revenue' ? (m.sales || 0) * share * a / 100 : x.kind === 'pct_spend' ? (m.spend || 0) * share * a / 100 : x.kind === 'per_order' ? (m.orders || 0) * share * a : 0;
  }
  return Math.round(sum * 100) / 100;
}
function sampleAfter(d) {
  const t = todayOf(d), applied = new Set((d.choices && d.choices.applied_today) || ['per_order', 'pct_revenue']);
  d.fixed.month_total = sampleFixedTotal(d);
  d.fixed.active = d.fixed.items.filter(x => !x.is_ad_spend && x.start_date <= t && (!x.end_date || x.end_date >= t)).length;
  const cats = new Map();
  for (const x of d.fixed.items) { const l = x.category_label || x.category || 'Other'; if (!cats.has(l.toLowerCase())) cats.set(l.toLowerCase(), { id: x.category || l, label: l }); }
  d.fixed.brand_categories = [...cats.values()].sort((a, b) => a.label.localeCompare(b.label));
  const liveRule = rules => rules.filter(r => r.status !== 'off' && applied.has(r.rule) && r.start_date <= t && (!r.end_date || r.end_date >= t)).sort((a, b) => (a.start_date < b.start_date ? 1 : -1))[0];
  const ship = liveRule(d.shipping_rules.rules), prod = liveRule(d.product_cost.rules);
  const tw = o => (o && known(o.tw) ? { source: 'triple_whale' } : { source: 'none' });
  d.shipping_rules.in_use = ship ? { source: 'locus', rule_id: ship.id } : tw(d.shipping_rules.last30);
  d.product_cost.in_use = d.margin_override != null ? { source: 'flat_margin' } : prod ? { source: 'locus', rule_id: prod.id } : tw(d.product_cost.last30);
  const miss = [];
  if (!d.fixed.active) miss.push('No fixed costs entered, so net profit cannot be shown. Add rent, team, software or any fee you pay.');
  for (const [cost, list, use] of [['shipping', d.shipping_rules.rules, d.shipping_rules.in_use], ['product', d.product_cost.rules, d.product_cost.in_use]]) {
    const saved = list.find(r => r.status !== 'off' && !applied.has(r.rule) && (!r.end_date || r.end_date >= t));
    if (saved) miss.push(`Your ${cost} cost rule (${(RULE_SAY[saved.rule] || saved.rule).toLowerCase()}) is saved. It will be used once ${APP_NAME} reads each order’s items, weight and country. Until then ${use.source === 'locus' ? 'your other rule stays in use' : use.source === 'triple_whale' ? 'Triple Whale’s number is used' : 'no ' + cost + ' cost is counted'}.`);
  }
  if (d.product_cost.sheet) miss.push(`Your cost sheet (${plural(d.product_cost.sheet.skus, 'product')}) is saved. It is not used in profit yet: that needs each order’s items.`);
  d.missing = miss;
}
let sampleId = 9000;
function sampleDone(sayOk) { sampleAfter(P.d); draw(); toast(sayOk ? sayOk + ' ' + SAMPLE_SAY : SAMPLE_SAY, { ms: 4200 }); }

/* ---------- the form sheet ---------- */
/** A labeled control. f = fld('Name', input, 'hint') ; f.input is the control. */
function fld(label, input, hint) {
  const id = 'co' + Math.random().toString(36).slice(2, 8);
  (input.btn || input).id = id;                      /* a datePick gives its button the label's id */
  const el = h('div', { class: 'lx-field' }, h('label', { for: id }, label), input, hint != null && h('p', { class: 'hint' }, hint));
  el.input = input; el.hintEl = el.querySelector('.hint');
  return el;
}
const text = (value, attrs = {}) => h('input', { class: 'lx-input', type: 'text', value: value ?? '', autocomplete: 'off', ...attrs });
/* a date is picked on the Locus calendar, never the native date input; it reads like an input (.value, 'change') */
const date = (value, optional) => datePick(value || '', { optional: !!optional });
const select = (options, value) => {
  const el = h('select', { class: 'lx-input' }, options.map(([id, label]) => h('option', { value: id }, label)));
  el.value = value;
  return el;
};

/** formSheet({ title, body, saveLabel, onSave, onRemove, removeLabel, removeAsk })
    onSave and onRemove may throw: the reason is shown in the sheet and the sheet stays open. Returns { close, fail }. */
function formSheet({ title, body, saveLabel = 'Save', onSave, onRemove, removeLabel = 'Remove', removeAsk = 'Remove this?' }) {
  const err = h('p', { class: 'lx-co-err', role: 'alert' });
  const foot = h('div', { class: 'lx-co-foot' });
  let sh = null;
  const fail = m => { err.textContent = m || ''; };
  const run = async (fn, btn) => {
    fail('');
    foot.querySelectorAll('button').forEach(b => { b.disabled = true; });
    const was = btn.textContent; btn.textContent = 'Working';
    try { if ((await fn()) !== false) sh.close(); }
    catch (e) { fail((e && e.message) || 'No answer. Nothing was changed.'); }
    btn.textContent = was;
    foot.querySelectorAll('button').forEach(b => { b.disabled = false; });
  };
  const normal = () => {
    const save = onSave ? button(saveLabel, { primary: true, large: true }) : null;
    if (save) save.addEventListener('click', () => run(onSave, save));
    put(foot, onRemove ? button(removeLabel, { ghost: true, class: 'lx-co-rm', onclick: asking }) : null, h('span', { class: 'lx-sp' }), button(onSave ? 'Cancel' : 'Close', { ghost: true, onclick: () => sh.close() }), save);
  };
  const asking = () => {
    const yes = button('Yes, remove', { class: 'ink' });
    yes.addEventListener('click', () => run(onRemove, yes));
    put(foot, h('span', { class: 'lx-co-ask' }, removeAsk), h('span', { class: 'lx-sp' }), button('Keep it', { ghost: true, onclick: normal }), yes);
  };
  normal();
  sh = sheet({ title, class: 'lx-co-sheet', body: h('div', { class: 'lx-co-form' }, body, err, foot) });
  return { close: () => sh.close(), fail };
}

/* ---------- fixed costs ---------- */
/** The category a line shows: the list's own word for an id (the older worker sends ids), else what was typed. */
const catOf = x => { const v = x.category_label || x.category || ''; const c = ((P && P.d && P.d.fixed.categories) || []).find(k => k.id === v); return c ? c.label || c.id : v; };
/** The id of a listed category, matched by id or by its word, or null. The older worker keeps a category by id only. */
const catId = v => { const s = String(v || '').trim().toLowerCase(); const c = ((P && P.d && P.d.fixed.categories) || []).find(k => String(k.id).toLowerCase() === s || String(k.label || '').toLowerCase() === s); return c ? c.id : null; };
const itemBody = x => ({ ...(x.id ? { id: x.id } : {}), name: x.name, category: P && P.d && P.d.legacy ? (catId(x.category) || catId(x.category_label) || x.category || '') : x.category_label || x.category || '', kind: x.kind, amount: x.amount, start_date: x.start_date, end_date: x.end_date || null, is_ad_spend: !!x.is_ad_spend, notes: x.notes || '' });

/** Save the whole list with one change applied. The list is read fresh first, so a line a teammate added a minute ago is kept. */
async function saveFixed(change, sayOk) {
  const { ctx, d } = P;
  if (ctx.sample) { d.fixed.items = change(d.fixed.items.slice()); sampleDone(sayOk); return; }
  const now = await ctx.api('/api/expenses?act=' + encodeURIComponent(ctx.brand.id));
  const next = change((now.items || []).slice());
  if (next.length > 60) throw new Error('A brand can hold up to 60 fixed cost lines. Remove an old one first.');
  await ctx.api('/api/expenses', { method: 'PUT', body: { act: ctx.brand.id, items: next.map(itemBody) } });
  await reread(sayOk);
}

function fixedSheet(x) {
  const { d } = P, isNew = !x, t = todayOf(d);
  x = x || { name: '', category_label: '', kind: 'monthly', amount: '', start_date: t.slice(0, 8) + '01', end_date: null, is_ad_spend: false, notes: '' };
  const kinds = HOW.filter(k => !d.fixed.kinds.length || d.fixed.kinds.some(s => s.id === k[0]) || k[0] === x.kind);
  const seen = new Set(), cats = [];
  for (const c of [...d.fixed.brand_categories, ...d.fixed.categories]) { const l = c.label || c.id; if (l && !seen.has(l.toLowerCase())) { seen.add(l.toLowerCase()); cats.push(l); } }
  const listId = 'coCats' + Math.random().toString(36).slice(2, 7);
  const name = fld('Name', text(x.name, { maxlength: 80, placeholder: 'Warehouse rent' }));
  const cat = fld('Category', text(isNew ? '' : catOf(x), { maxlength: 40, list: listId, placeholder: d.legacy ? 'Pick one from the list' : 'Pick one or type your own' }),
    d.legacy ? 'Pick one from the list. Left empty, it is filed under Other.' : 'Your own name for the group. Pick one you have used or type a new one.');
  cat.append(h('datalist', { id: listId }, cats.map(l => h('option', { value: l }))));
  const kind = fld('How often', select(kinds.map(k => [k[0], k[1]]), x.kind), '');
  const amount = fld('Amount', text(x.amount === '' ? '' : String(x.amount), { inputmode: 'decimal', placeholder: '0.00' }));
  const start = fld('Starts', date(x.start_date));
  const end = fld('Ends (optional)', date(x.end_date, true));
  const notes = fld('Note (optional)', text(x.notes, { maxlength: 300 }));
  const ad = h('input', { type: 'checkbox' }); ad.checked = !!x.is_ad_spend;
  const adRow = h('label', { class: 'lx-co-check' }, ad, h('span', null, h('b', null, 'Count this as ad spend'), h('small', null, 'For money spent to get customers with no ad account behind it, like a creator fee. It is added to ad spend, so MER includes it, and it is left out of fixed costs.')));
  const sync = () => {
    const k = HOW_OF[kind.input.value] || HOW[0], pc = k[2] === 'pct';
    kind.hintEl.textContent = k[3];
    amount.querySelector('label').textContent = pc ? 'Percent' : 'Amount (' + cur() + ')';
    amount.input.placeholder = pc ? '3' : '0.00';
    start.querySelector('label').textContent = k[0] === 'once' ? 'Date it was paid' : 'Starts';
    end.hidden = k[0] === 'once';
    end.querySelector('label').textContent = k[0] === 'custom' ? 'Ends' : 'Ends (optional)';
  };
  kind.input.addEventListener('change', sync); sync();
  const read = () => {
    const k = kind.input.value, a = readAmount(amount.input.value);
    if (!name.input.value.trim()) throw new Error('Give the cost a name.');
    if (a.error) throw new Error(a.error);
    if (HOW_OF[k][2] === 'pct' && a.n > 100) throw new Error('A percentage cannot be more than 100.');
    if (!YMD.test(start.input.value)) throw new Error(k === 'once' ? 'Pick the date it was paid.' : 'Pick the date it starts.');
    const e = k === 'once' ? null : end.input.value || null;
    if (e && e < start.input.value) throw new Error('The end date is before the start.');
    if (k === 'custom' && !e) throw new Error('Pick the date it ends, so the amount can be spread from the start to the end.');
    const typed = cat.input.value.replace(/\s+/g, ' ').trim();
    if (d.legacy && typed && !catId(typed)) throw new Error('Pick a category from the list.');
    /* the older worker keeps the id (no id reads as Other there); the newer one keeps the word as typed */
    const label = d.legacy ? (catId(typed) || 'other') : typed || 'Other';
    return { ...(x.id ? { id: x.id } : {}), name: name.input.value.trim(), category: label, ...(d.legacy ? {} : { category_label: label }), kind: k, amount: a.n, start_date: start.input.value, end_date: e, is_ad_spend: ad.checked, notes: notes.input.value.trim() };
  };
  formSheet({
    title: isNew ? 'Add a fixed cost' : x.name,
    saveLabel: isNew ? 'Add this cost' : 'Save',
    body: [name, cat, h('div', { class: 'lx-co-two' }, kind, amount), h('div', { class: 'lx-co-two' }, start, end), notes, adRow,
      !isNew && x.added_by ? h('p', { class: 'lx-foot' }, 'Added by ' + x.added_by + '.') : null],
    onSave: async () => {
      const v = read();
      await saveFixed(list => {
        if (isNew) return [...list, { ...v, id: P.ctx.sample ? ++sampleId : undefined }];
        if (!list.some(y => y.id === x.id)) throw new Error('This line was removed by someone else. Close this and look again.');
        return list.map(y => (y.id === x.id ? { ...y, ...v } : y));
      }, isNew ? 'Added ' + v.name + '.' : 'Saved.');
    },
    onRemove: isNew ? null : () => saveFixed(list => list.filter(y => y.id !== x.id), 'Removed ' + x.name + '.'),
    removeAsk: 'Remove this cost? Profit stops counting it on every day, past days too.',
  });
}

function fixedLine(x, t) {
  const k = HOW_OF[x.kind] || [x.kind, x.kind, 'money'];
  const amt = k[2] === 'pct' ? num(+x.amount, +x.amount % 1 ? 1 : 0) + '%' : cash(+x.amount);
  const each = x.kind === 'pct_revenue' ? 'of revenue' : x.kind === 'pct_spend' ? 'of ad spend' : x.kind === 'once' ? 'one time, ' + short(x.start_date) : x.kind === 'custom' ? short(x.start_date) + ' to ' + short(x.end_date) : EACH[x.kind] || '';
  const state = x.kind !== 'once' && x.end_date && x.end_date < t ? pill('', 'Ended ' + short(x.end_date)) : x.start_date > t ? pill('', 'Starts ' + short(x.start_date)) : null;
  return h('button', { class: 'lx-co-line', type: 'button', onclick: () => fixedSheet(x), 'aria-label': 'Edit ' + x.name },
    h('span', { class: 't' }, h('b', null, x.name), h('small', null, [catOf(x) || 'Other', x.kind !== 'once' && x.kind !== 'custom' && x.end_date && x.end_date >= t ? 'until ' + short(x.end_date) : null, x.notes || null].filter(Boolean).join(' · '))),
    h('span', { class: 'p' }, state, x.is_ad_spend ? pill('', 'Counted as ad spend') : null),
    h('span', { class: 'v' }, h('b', null, amt), h('small', null, each)));
}

function fixedCard() {
  const { d } = P, t = todayOf(d), items = d.fixed.items;
  if (d.fixed_unread) return card({ title: 'Fixed costs', note: 'What you pay whether or not an order comes in', class: 'lx-st-card' },
    empty({ title: 'The fixed cost list could not be read', text: 'Nothing is shown rather than an empty list. Open the page again in a moment.' }));
  const fixed = items.filter(x => !x.is_ad_spend), ads = items.filter(x => x.is_ad_spend);
  const total = !fixed.length ? null : known(d.fixed.month_total) ? (d.fixed.month_total > 0 ? h('b', null, cash(d.fixed.month_total)) : 'Nothing counted yet this month') : null;
  return card({ title: 'Fixed costs', note: items.length ? plural(items.length, 'line') + (ads.length ? ', ' + ads.length + ' of them counted as ad spend' : '') : 'What you pay whether or not an order comes in', flush: true, class: 'lx-st-card',
    action: button('Add a cost', { primary: true, onclick: () => fixedSheet(null) }) },
    items.length ? h('div', { class: 'lx-co-lines' }, fixed.map(x => fixedLine(x, t)), ads.map(x => fixedLine(x, t))) : h('div', { class: 'lx-pad' }, h('p', { class: 'lx-co-none' }, 'No fixed costs yet. Add rent, team, software or any fee you pay, and net profit can be shown.')),
    total ? h('div', { class: 'lx-co-total' }, defLabel(new Date(todayOf(d) + 'T12:00:00').toLocaleDateString('en-US', { month: 'long' }) + ' so far, this month’s share of each line', { title: 'Fixed costs this month', body: 'Each line counted for the days of this month so far: a monthly cost spread evenly over the month, a weekly, quarterly or yearly cost spread over its days, a one time cost on the day it was paid, % and per order lines from each day’s numbers. Lines counted as ad spend are left out (they are in ad spend).' }), h('span', { class: 'lx-sp' }), h('span', null, total)) : null);
}

/* ---------- shipping and product rules ---------- */
function ruleSay(r) {
  if (r.rule === 'pct_revenue') return num(+r.amount, +r.amount % 1 ? 1 : 0) + '% of revenue';
  if (r.rule === 'per_order' || r.rule === 'per_item') return cash(+r.amount) + ' ' + RULE_SAY[r.rule];
  const n = (r.table || []).length;
  return (RULE_SAY[r.rule] || r.rule) + ', ' + plural(n, 'row');
}
function ruleLine(cost, r, use, t) {
  const tags = [
    use && use.source === 'locus' && use.rule_id === r.id ? pill('good', 'In use') : null,
    r.status === 'off' ? pill('', 'Switched off') : null,
    !r.applied ? notYet() : null,
    r.end_date && r.end_date < t ? pill('', 'Ended ' + short(r.end_date)) : r.start_date > t ? pill('', 'Starts ' + short(r.start_date)) : null,
  ];
  return h('button', { class: 'lx-co-line', type: 'button', onclick: () => ruleSheet(cost, r), 'aria-label': 'Edit this rule' },
    h('span', { class: 't' }, h('b', null, r.label || ruleSay(r)), h('small', null, [r.label ? ruleSay(r) : null, 'from ' + short(r.start_date) + (r.end_date && r.end_date >= t ? ' to ' + short(r.end_date) : ''), r.added_by ? 'added by ' + r.added_by : null].filter(Boolean).join(' · '))),
    h('span', { class: 'p' }, tags));
}

async function saveRule(cost, rule, sayOk) {
  const { ctx, d } = P, box = cost === 'shipping' ? d.shipping_rules : d.product_cost;
  if (ctx.sample) {
    const applied = ((d.choices && d.choices.applied_today) || ['per_order', 'pct_revenue']).includes(rule.rule);
    if (rule.id) box.rules = box.rules.map(r => (r.id === rule.id ? { ...r, ...rule, applied } : r));
    else {
      /* the worker ends the open rule of the same kind the day before a new one starts */
      const before = new Date(dayOf(rule.start_date) - 864e5);
      box.rules = [{ ...rule, id: ++sampleId, source: 'typed', applied, added_by: 'You' }, ...box.rules.map(r => (!r.end_date && r.status !== 'off' && !!r.applied === applied && r.start_date < rule.start_date ? { ...r, end_date: ymd(before) } : r))];
    }
    return sampleDone(sayOk);
  }
  await ctx.api('/api/costs', { method: 'PUT', body: { act: ctx.brand.id, rule: { cost, ...rule } } });
  await reread(sayOk);
}
async function removeRule(cost, r) {
  const { ctx, d } = P, box = cost === 'shipping' ? d.shipping_rules : d.product_cost;
  if (ctx.sample) { box.rules = box.rules.filter(y => y.id !== r.id); return sampleDone('Removed.'); }
  await ctx.api('/api/costs?act=' + encodeURIComponent(ctx.brand.id) + '&id=' + encodeURIComponent(r.id), { method: 'DELETE' });
  await reread('Removed.');
}

function ruleSheet(cost, r) {
  const { d } = P, isNew = !r, t = todayOf(d);
  const fallback = cost === 'shipping'
    ? [['per_order', 'Per order', 'money', 'The same amount for every paid order.'], ['pct_revenue', '% of revenue', 'pct', 'Worked out from each day’s revenue (total sales minus tax).'], ['per_item', 'Per item', 'money', 'An amount for every item in the order.'], ['weight_tier', 'By weight', 'table', 'A table of parcel weights and what each costs to send.'], ['zone', 'By country or zone', 'table', 'A table of places and what each costs to send to.']]
    : [['pct_revenue', '% of revenue', 'pct', 'Worked out from each day’s revenue (total sales minus tax).'], ['per_order', 'Per order', 'money', 'The same amount for every paid order.'], ['per_item', 'Per item', 'money', 'An amount for every item sold.']];
  const fromServer = d.choices && d.choices.rules && d.choices.rules[cost];
  const types = fromServer && fromServer.length ? fromServer.map(x => [x.id, x.label, x.unit, x.hint]) : fallback;
  const applied = new Set((d.choices && d.choices.applied_today) || ['per_order', 'pct_revenue']);
  r = r || { rule: types[0][0], amount: '', table: [], start_date: t, end_date: null, status: 'on', label: '' };
  const type = fld('How it is worked out', select(types.map(x => [x[0], x[1] + (applied.has(x[0]) ? '' : ' (' + NOT_YET.toLowerCase() + ')')]), r.rule), '');
  if (!isNew) type.input.disabled = true;
  const amount = fld('Amount', text(r.amount == null || r.amount === '' ? '' : String(r.amount), { inputmode: 'decimal' }));
  const start = fld('Starts', date(r.start_date)), end = fld('Ends (optional)', date(r.end_date, true));
  const label = fld('Name (optional)', text(r.label, { maxlength: 80, placeholder: cost === 'shipping' ? 'New carrier rate' : 'Supplier price' }));
  const on = h('input', { type: 'checkbox' }); on.checked = r.status !== 'off';
  const onRow = isNew ? null : h('label', { class: 'lx-co-check' }, on, h('span', null, h('b', null, 'Switched on'), h('small', null, 'Off keeps the rule here and stops it being used.')));
  const tbl = h('div', { class: 'lx-co-tbl' }), note = h('p', { class: 'lx-co-note' });
  const rows = (r.table || []).map(x => ({ ...x }));
  const paintTable = kind => {
    const weight = kind === 'weight_tier';
    if (!rows.length) rows.push(weight ? { min: '', max: '', amount: '' } : { zone: '', amount: '' });
    const cell = (row, key, ph, numeric) => { const i = text(row[key] ?? '', { placeholder: ph, inputmode: numeric ? 'decimal' : null, 'aria-label': ph, maxlength: numeric ? 12 : 40 }); i.addEventListener('input', () => { row[key] = i.value; }); return i; };
    put(tbl,
      h('p', { class: 'hint' }, weight ? 'One row per weight band. Use one unit for every row, pounds or kilograms.' : 'One row per country or zone, with what a parcel costs to send there.'),
      rows.map((row, i) => h('div', { class: 'lx-co-trow' + (weight ? ' w' : '') },
        weight ? [cell(row, 'min', 'From', true), cell(row, 'max', 'To', true)] : cell(row, 'zone', 'Place', false), cell(row, 'amount', 'Cost', true),
        h('button', { class: 'lx-btn ghost icon', type: 'button', 'aria-label': 'Remove this row', onclick: () => { rows.splice(i, 1); paintTable(kind); } }, '×'))),
      button('Add a row', { onclick: () => { rows.push(weight ? { min: '', max: '', amount: '' } : { zone: '', amount: '' }); paintTable(kind); } }));
  };
  const sync = () => {
    const k = types.find(x => x[0] === type.input.value) || types[0], isTable = k[2] === 'table';
    type.hintEl.textContent = k[3] || '';
    amount.hidden = isTable; tbl.hidden = !isTable;
    amount.querySelector('label').textContent = k[2] === 'pct' ? 'Percent of revenue' : 'Amount (' + cur() + ')';
    amount.input.placeholder = k[2] === 'pct' ? '12' : '4.50';
    if (isTable) paintTable(k[0]);
    note.textContent = !applied.has(k[0])
      ? 'This kind of rule is saved, not applied yet. Profit keeps using what it uses today until each order’s items, weight and country can be read.'
      : isNew ? 'From its start date this replaces what is counted for ' + cost + ' cost today. Removing it later goes back to Triple Whale’s number.' : '';
    note.hidden = !note.textContent;
  };
  type.input.addEventListener('change', sync); sync();
  const read = () => {
    const k = types.find(x => x[0] === type.input.value) || types[0], out = { rule: k[0] };
    if (k[2] === 'table') {
      const filled = rows.filter(x => Object.values(x).some(v => String(v ?? '').trim() !== ''));
      if (!filled.length) throw new Error('Add at least one row to the table.');
      out.table = filled.map(x => {
        const a = readAmount(x.amount); if (a.error) throw new Error('A cost in the table: ' + a.error.toLowerCase());
        if (k[0] === 'zone') { if (!String(x.zone || '').trim()) throw new Error('Every row needs a place name.'); return { zone: String(x.zone).trim(), amount: a.n }; }
        const lo = readAmount(x.min), hi = readAmount(x.max);
        if (lo.error || hi.error) throw new Error('Every row of the weight table needs a from, a to and a cost, as numbers.');
        if (!(lo.n < hi.n)) throw new Error('In the weight table, each row’s "from" must be below its "to".');
        return { min: lo.n, max: hi.n, amount: a.n };
      });
    } else {
      const a = readAmount(amount.input.value); if (a.error) throw new Error(a.error);
      if (k[2] === 'pct' && a.n > 100) throw new Error('A percentage cannot be more than 100.');
      out.amount = a.n;
    }
    if (!YMD.test(start.input.value)) throw new Error('Pick the date this rule starts.');
    if (end.input.value && end.input.value < start.input.value) throw new Error('The end date is before the start.');
    return { ...(r.id ? { id: r.id } : {}), ...out, start_date: start.input.value, end_date: end.input.value || null, status: on.checked ? 'on' : 'off', label: label.input.value.trim(), notes: r.notes || '' };
  };
  const what = cost === 'shipping' ? 'shipping' : 'product cost';
  formSheet({
    title: isNew ? 'Add a ' + what + ' rule' : 'Change this ' + what + ' rule',
    saveLabel: isNew ? 'Add this rule' : 'Save',
    body: [type, amount, tbl, h('div', { class: 'lx-co-two' }, start, end), label, onRow, note],
    onSave: async () => { const v = read(); await saveRule(cost, v, isNew ? 'Rule added.' : 'Saved.'); },
    onRemove: isNew ? null : () => removeRule(cost, r),
    removeAsk: 'Remove this rule? ' + (r.applied ? 'Profit goes back to what it used before, on past days too.' : 'It was not being used yet.'),
  });
}

const useLine = (use, rules) => {
  if (!use) return statusDot('off', 'Not read yet');
  const r = use.source === 'locus' ? (rules || []).find(x => x.id === use.rule_id) : null;
  return statusDot(use.source === 'none' ? 'warn' : 'good', (SOURCE[use.source] || use.source) + (r ? ': ' + ruleSay(r) : ''));
};

function shippingCard() {
  const { d } = P, s = d.shipping_rules, l = s.last30, t = todayOf(d);
  const facts = [];
  if (l) {
    /* batch 1 tiles: every figure says its days and where it comes from */
    const win = l.from && l.to ? short(l.from) + ' to ' + short(l.to) : 'Last 30 days';
    const usedFrom = s.in_use ? (SOURCE[s.in_use.source] || s.in_use.source) : 'Not read yet';
    facts.push({ label: 'Customers paid for delivery', value: known(l.charged) ? cash(l.charged) : 'no data', sub: known(l.orders) ? 'on ' + num(l.orders) + ' orders' : null, window: win, source: 'Shopify orders' });
    facts.push({ label: 'Counted as shipping cost', value: known(l.used) ? cash(l.used) : 'Nothing counted', sub: known(l.used) && known(l.orders) && l.orders > 0 ? cash(Math.round(l.used / l.orders * 100) / 100) + ' an order' : null, window: win, source: usedFrom });
    if (known(l.charged) && known(l.used)) {
      const gap = l.charged - l.used, near = Math.abs(gap) <= Math.max(25, l.charged * 0.03);
      facts.push({ label: 'Shipping gap', value: near ? 'About even' : cash(Math.abs(gap)), sub: near ? 'what customers pay covers it' : gap > 0 ? 'more paid than counted' : 'more counted than customers paid', window: win, source: 'Worked out' });
    }
    if (known(l.tw)) facts.push({ label: 'Triple Whale shipping cost', value: cash(l.tw), sub: 'to compare with your rule', window: win, source: 'Triple Whale' });
  }
  return card({ title: 'Shipping cost', note: l && l.from ? short(l.from) + ' to ' + short(l.to) : 'What it costs to send an order', flush: true, class: 'lx-st-card',
    action: button('Add a rule', { onclick: () => ruleSheet('shipping', null) }) },
    h('div', { class: 'lx-co-use' }, h('span', { class: 'k' }, 'In use today'), useLine(s.in_use, s.rules)),
    facts.length ? h('div', { class: 'lx-co-facts' }, countTiles(facts, { cols: Math.min(facts.length, 4) })) : null,
    s.rules.length ? h('div', { class: 'lx-co-lines top' }, s.rules.map(r => ruleLine('shipping', r, s.in_use, t))) : null);
}

/* ---------- product cost and the cost sheet ---------- */
/** The same reading rules as the worker, small, for sample mode only (nothing is sent there). */
function sampleCheck(csv, start) {
  const lines = String(csv || '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) throw new Error('The sheet is empty.');
  const sep = [',', ';', '\t'].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
  const heads = lines[0].split(sep).map(s => s.toLowerCase().replace(/["_\s]+/g, ' ').trim());
  const iSku = heads.findIndex(x => x === 'sku' || x === 'variant sku'), iCost = heads.findIndex(x => ['cost', 'unit cost', 'cost per item', 'cogs'].includes(x)), iTitle = heads.findIndex(x => ['title', 'name', 'product'].includes(x));
  if (iSku < 0 || iCost < 0) throw new Error('The sheet needs a ' + (iSku < 0 ? 'SKU' : 'cost') + ' column. Name the columns "SKU" and "Cost".');
  const by = new Map(), errors = []; let duplicates = 0;
  lines.slice(1).forEach((l, i) => {
    const c = l.split(sep).map(s => s.replace(/^"|"$/g, '').trim()), sku = c[iSku] || '', line = i + 2;
    if (!sku) return errors.push({ line, reason: 'No SKU on this row.' });
    if (!c[iCost]) return errors.push({ line, reason: sku + ': no cost on this row.' });
    const a = readAmount(c[iCost]);
    if (a.error) return errors.push({ line, reason: sku + ': ' + (/point/.test(a.error) ? 'write the cost with a point, like 12.50.' : 'the cost is not a number.') });
    if (by.has(sku)) duplicates++;
    by.set(sku, { line, sku, title: iTitle >= 0 ? c[iTitle] || null : null, unit_cost: a.n });
  });
  const rows = [...by.values()];
  return { ok: rows.length > 0, dry_run: true, rows_read: rows.length + errors.length + duplicates, rows_ok: rows.length, rows: rows.slice(0, 50), errors, duplicates, start_date: start, applied: false,
    note: 'Saved costs are not used in profit yet: that needs each order’s items.' };
}

function sheetSheet() {
  const { ctx, d } = P, t = todayOf(d);
  let checked = null, filename = '';
  const csv = h('textarea', { class: 'lx-input lx-co-csv', rows: 7, placeholder: 'SKU,Cost,Title\nPUTTER-01,41.50,Classic putter\nGLOVE-M,6.20,Glove, medium', spellcheck: 'false' });
  const csvF = fld('Paste the sheet', csv, 'One row per product. It needs a column named SKU and a column named Cost. A Title column is optional. Up to 2,000 rows.');
  const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain', class: 'lx-co-file', 'aria-label': 'Pick a CSV file' });
  const fileSay = h('span', { class: 'lx-foot' });
  const start = fld('These costs start on', date(t), 'Orders before this date keep the cost they had.');
  const result = h('div', { class: 'lx-co-result', 'aria-live': 'polite' });
  const stale = () => { if (checked) { checked = null; put(result, h('p', { class: 'lx-foot' }, 'The sheet changed. Check it again before saving.')); } };
  csv.addEventListener('input', stale); start.input.addEventListener('change', stale);
  file.addEventListener('change', () => {
    const f = file.files && file.files[0]; if (!f) return;
    if (f.size > 300 * 1024) { fileSay.textContent = 'That file is too big. A cost sheet can be up to 300 KB.'; file.value = ''; return; }
    const rd = new FileReader();
    rd.onload = () => { csv.value = String(rd.result || ''); filename = f.name; fileSay.textContent = f.name + ' is loaded. Check it below.'; stale(); };
    rd.onerror = () => { fileSay.textContent = 'That file could not be read.'; };
    rd.readAsText(f);
  });
  const show = a => put(result,
    h('div', { class: 'lx-co-sum' }, statusDot(a.rows_ok ? 'good' : 'bad', plural(a.rows_ok, 'cost') + ' can be saved'), a.errors.length ? statusDot('bad', plural(a.errors.length, 'row') + ' cannot be read') : null,
      a.duplicates ? statusDot('warn', plural(a.duplicates, 'SKU') + ' listed twice, the last one is kept') : null, h('span', { class: 'lx-foot' }, plural(a.rows_read, 'row') + ' read')),
    a.errors.length ? h('ul', { class: 'lx-co-errs' }, a.errors.slice(0, 20).map(e => h('li', null, h('b', null, 'Line ' + e.line), ' ', e.reason)), a.errors.length > 20 ? h('li', null, 'and ' + (a.errors.length - 20) + ' more') : null) : null,
    a.rows && a.rows.length ? h('div', { class: 'lx-co-prev' }, a.rows.slice(0, 6).map(r => h('div', null, h('span', null, r.sku, r.title ? h('small', null, r.title) : null), h('b', null, money(r.unit_cost, { cur: cur(), cents: true })))),
      a.rows_ok > 6 ? h('p', { class: 'lx-foot' }, 'and ' + (a.rows_ok - 6) + ' more') : null) : null,
    h('p', { class: 'lx-co-note' }, a.note || 'Saved costs are not used in profit yet: that needs each order’s items.'));
  const body = () => ({ act: ctx.brand.id, csv: csv.value, start_date: start.input.value, filename: filename || undefined });
  let F = null;
  const check = async () => {
    if (!csv.value.trim()) throw new Error('Paste the sheet or pick a file first.');
    if (!YMD.test(start.input.value)) throw new Error('Pick the date these costs start.');
    const a = ctx.sample ? sampleCheck(csv.value, start.input.value) : await ctx.api('/api/costs/sheet', { method: 'POST', body: { ...body(), dry_run: true } });
    checked = a; show(a);
    return a;
  };
  F = formSheet({
    title: 'Upload a product cost sheet',
    saveLabel: 'Check, then save',
    body: [csvF, h('div', { class: 'lx-co-pick' }, h('span', null, 'Or pick a CSV file'), file, fileSay), start, result],
    /* the first press only checks and shows the result; the second press, with nothing changed since, saves */
    onSave: async () => {
      if (!checked) {
        const a = await check();
        F.fail(a.rows_ok ? 'Checked. Nothing is saved yet. Press the button again to save ' + plural(a.rows_ok, 'cost') + '.' : 'No row of that sheet could be read, so there is nothing to save.');
        return false;
      }
      if (!checked.rows_ok) throw new Error('No row of that sheet could be read, so there is nothing to save.');
      const n = checked.rows_ok;
      if (ctx.sample) {
        d.product_cost.sheet = { batch: 'sample-' + (++sampleId), skus: n, start_date: start.input.value, filename: filename || null, uploaded_by: 'You', uploaded_at: new Date().toISOString(), applied: false };
        d.product_cost.coverage = { ...(d.product_cost.coverage || {}), skus_on_file: Math.max(n, (d.product_cost.coverage || {}).skus_on_file || 0) };
        return sampleDone(plural(n, 'cost') + ' saved.');
      }
      await ctx.api('/api/costs/sheet', { method: 'POST', body: { ...body(), dry_run: false } });
      await reread(plural(n, 'cost') + ' saved.');
    },
  });
}

function sheetInfoSheet(sh) {
  const { ctx, d } = P;
  formSheet({
    title: 'The cost sheet on file',
    body: [h('div', { class: 'lx-co-prev' },
      h('div', null, h('span', null, 'Products'), h('b', null, num(sh.skus))),
      h('div', null, h('span', null, 'Costs start'), h('b', null, short(sh.start_date))),
      sh.filename ? h('div', null, h('span', null, 'File'), h('b', null, sh.filename)) : null,
      sh.uploaded_by ? h('div', null, h('span', null, 'Uploaded by'), h('b', null, sh.uploaded_by)) : null),
      h('p', { class: 'lx-co-note' }, 'This sheet is saved, not applied yet. It is used in profit once each order’s items can be read.')],
    removeLabel: 'Remove this sheet',
    removeAsk: 'Remove this sheet and its ' + plural(sh.skus, 'cost') + '?',
    onRemove: async () => {
      if (ctx.sample) { d.product_cost.sheet = null; d.product_cost.coverage = { ...(d.product_cost.coverage || {}), skus_on_file: 0 }; return sampleDone('Sheet removed.'); }
      await ctx.api('/api/costs?act=' + encodeURIComponent(ctx.brand.id) + '&sheet=' + encodeURIComponent(sh.batch), { method: 'DELETE' });
      await reread('Sheet removed.');
    },
  });
}

function productCard() {
  const { d } = P, p = d.product_cost, c = p.coverage, l = p.last30, t = todayOf(d);
  const facts = [];
  const pWin = l && l.from && l.to ? short(l.from) + ' to ' + short(l.to) : 'Last 30 days';
  const pFrom = p.in_use ? (SOURCE[p.in_use.source] || p.in_use.source) : 'Not read yet';
  if (c && known(c.days) && c.days > 0) facts.push({ label: 'Days with a product cost', value: c.days_with_cost + ' of ' + c.days, sub: c.days_with_cost >= c.days ? 'every day is covered' : plural(c.days - c.days_with_cost, 'day') + ' with no cost, so no profit on ' + (c.days - c.days_with_cost === 1 ? 'it' : 'them'), window: 'Last ' + c.days + ' days', source: pFrom });
  if (l) facts.push({ label: 'Counted as product cost', value: known(l.used) ? cash(l.used) : 'Nothing counted', window: pWin, source: pFrom });
  if (c && known(c.skus_on_file)) facts.push({ label: 'Products on your cost sheet', value: c.skus_on_file > 0 ? num(c.skus_on_file) : 'None yet', sub: c.skus_on_file > 0 ? NOT_YET.toLowerCase() : 'upload a sheet to add them', window: 'Right now', source: 'Your cost sheet' });
  return card({ title: 'Product cost', note: 'What your products cost you to make or buy', flush: true, class: 'lx-st-card',
    action: h('span', { class: 'lx-co-acts' }, button('Add a rule', { onclick: () => ruleSheet('product', null) }), button('Upload a sheet', { onclick: sheetSheet })) },
    h('div', { class: 'lx-co-use' }, h('span', { class: 'k' }, 'In use today'), useLine(p.in_use, p.rules),
      d.margin_override != null ? h('span', { class: 'm' }, 'A flat margin of ' + Math.round(d.margin_override * 100) + '% is set, so profit uses that. Rules here are kept for reference.')
        : l && known(l.tw) && p.in_use && p.in_use.source === 'locus' ? h('span', { class: 'm' }, 'Triple Whale reads ' + cash(l.tw) + ' for the same days.') : null),
    facts.length ? h('div', { class: 'lx-co-facts' }, countTiles(facts, { cols: Math.min(facts.length, 4) })) : null,
    p.rules.length || p.sheet ? h('div', { class: 'lx-co-lines top' },
      p.rules.map(r => ruleLine('product', r, p.in_use, t)),
      p.sheet ? h('button', { class: 'lx-co-line', type: 'button', onclick: () => sheetInfoSheet(p.sheet), 'aria-label': 'Open the cost sheet' },
        h('span', { class: 't' }, h('b', null, 'Cost sheet, ' + plural(p.sheet.skus, 'product')), h('small', null, [p.sheet.filename, 'from ' + short(p.sheet.start_date), p.sheet.uploaded_by ? 'uploaded by ' + p.sheet.uploaded_by : null].filter(Boolean).join(' · '))),
        h('span', { class: 'p' }, notYet())) : null) : null);

}

/* ---------- fees and handling (read only) ---------- */
function readOnlyCard() {
  const { d } = P, f = d.payment_fees, g = d.handling;
  const line = (name, hint, o, noneWord) => h('div', { class: 'lx-st-row' },
    h('div', { class: 't' }, h('div', { class: 'k' }, name), h('div', { class: 'hint' }, hint)),
    h('div', { class: 'c lx-co-ro' }, !o ? statusDot('off', 'Not read yet') : o.source === 'none' ? statusDot('off', noneWord) : [h('b', null, cash(o.last30)), h('small', null, 'last 30 days'), statusDot('good', 'From ' + (SOURCE[o.source] || o.source))]));
  return card({ title: 'Payment fees and handling', note: 'Read only', flush: true, class: 'lx-st-card' }, h('div', { class: 'lx-st-rows' },
    line('Payment fees', 'What the card and checkout companies keep. Set in Triple Whale, read here.', f, 'None counted'),
    line('Handling', 'Packing and warehouse work per order. Set in Triple Whale, read here.', g, 'None counted')));
}

/* ---------- what is missing ---------- */
function missingCard() {
  const { d } = P;
  if (!d.missing) return null;
  if (!d.missing.length) return h('section', { class: 'lx-band lx-co-ok' }, statusDot('good', 'Nothing is missing'), h('span', null, 'Net profit counts every cost below.'));
  const fix = m => (/^No fixed costs/.test(m) ? ['Add a fixed cost', () => fixedSheet(null)] : /^No shipping cost/.test(m) ? ['Add a shipping rule', () => ruleSheet('shipping', null)] : /^No product cost/.test(m) ? ['Add product cost', () => ruleSheet('product', null)] : null);
  /* a saved rule or sheet that profit does not use yet: one compact strip, the reasons behind (i), a link to each card */
  const saved = d.missing.filter(m => /^Your /.test(m)), act = d.missing.filter(m => !/^Your /.test(m));
  const go = id => () => { const want = id === 'co-ship' ? 'Shipping cost' : 'Product cost'; const n = [...document.querySelectorAll('.lx-co .lx-card > .lx-sec > h3')].find(x => x.textContent === want); if (n) n.closest('.lx-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const links = [...new Set(saved.map(m => (/^Your shipping/.test(m) ? 'co-ship' : 'co-product')))].map(id => h('button', { type: 'button', class: 'lx-co-jump', onclick: go(id) }, id === 'co-ship' ? 'Shipping cost' : 'Product cost'));
  return h('div', { class: 'lx-co-missing' },
    saved.length ? h('section', { class: 'lx-co-strip', role: 'status' }, statusDot('warn', plural(saved.length, 'saved rule') + ' not used in profit yet'),
      infoButton({ title: 'Why not yet', body: saved.join(' ') }, { label: 'Why not yet' }), h('span', { class: 'lx-sp' }), links) : null,
    act.length ? card({ title: 'What is missing', note: plural(act.length, 'thing') + ' to look at', flush: true, class: 'lx-st-card' },
      h('div', { class: 'lx-co-miss' }, act.map(m => { const f = fix(m); return h('div', null, h('span', { class: 'dot' }), h('p', null, m), f ? button(f[0], { onclick: f[1] }) : null); }))) : null);
}

/* ---------- the older worker: rules are not there to read or to save ---------- */
function rulesOffCard() {
  const { d } = P;
  const now = d.margin_override != null ? 'Profit uses the flat margin of ' + Math.round(d.margin_override * 100) + '% set for this brand.' : 'Until then profit uses the shipping, product, fee and handling costs Triple Whale records.';
  return card({ title: 'Shipping and product cost', note: 'Your own rules and a cost sheet', class: 'lx-st-card' },
    empty({ title: 'Not switched on yet', text: 'Your own shipping and product cost rules, and the cost sheet upload, are built and waiting to be switched on. ' + now }));
}

function draw() {
  if (!P) return;
  const { el, d, ctx } = P;
  css(); addStyles('lx-costs-css', CSS);
  if (!d || !ctx.brand) return put(el, empty({ title: 'No brand picked', text: 'Pick a brand to see its costs.' }));
  const help = h('div', { class: 'lx-co-bar' }, pageHelp({ body: [
    { title: 'What it is for', text: 'Every cost that turns sales into profit for this brand: fixed costs, shipping, product cost, payment fees and handling. A change here is used by profit on every screen and report from the next read.' },
    { title: 'Saved, not applied yet', text: NOT_YET_WHY },
    { title: 'Shipping gap', text: 'What customers paid for delivery minus what is counted as shipping cost, for the same days. Above zero, delivery fees cover the postage; below zero, the store pays part of it. Triple Whale shipping cost is shown beside it to compare with your own rule when your rule is the one in use.' },
    ctx.sample ? { title: 'Sample numbers', text: 'Adding, changing or removing here changes this screen only and sends nothing.' } : null,
  ] }));
  if (d.legacy) return put(el, h('div', { class: 'lx-st lx-co' }, help, fixedCard(), rulesOffCard()));
  put(el, h('div', { class: 'lx-st lx-co' }, help, missingCard(), fixedCard(), shippingCard(), productCard(), readOnlyCard()));
}

export default {
  title: ['What does it cost ', em('to run this brand?')],
  eyebrow: ctx => (ctx.brand ? ctx.brand.name + ', ' : '') + 'brand settings',
  ranges: false,
  stamp: false,                  /* a settings form: the cost tiles carry their own days and source */
  async load(ctx) { return ctx.brand ? readPage(ctx) : null; },
  render(el, data, ctx) {
    P = { el, d: data ? trim(JSON.parse(JSON.stringify(data))) : null, ctx };
    draw();
  },
};

const CSS = `
.lx-co-lines{display:grid;min-width:0}
.lx-co-missing{display:grid;gap:var(--sp-4);min-width:0}
.lx-co-missing:empty{display:none}
.lx-co-strip{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;padding:10px 16px;border-radius:var(--r-md);background:var(--warn-bg);font-size:13.5px;color:var(--ink)}
.lx-co-jump{border:0;background:none;padding:0;font:inherit;font-size:13px;font-weight:600;color:var(--ink);text-decoration:none;text-underline-offset:3px;cursor:pointer}
.lx-co-jump:hover,.lx-co-jump:focus-visible{text-decoration:underline}
.lx-co-bar{display:flex;align-items:center;gap:12px;min-height:28px}
.lx-co-lines.top{border-top:1px solid var(--line)}
.lx-co-line{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px 18px;align-items:center;width:100%;padding:13px 28px;border:0;border-top:1px solid var(--line);background:transparent;font:inherit;color:inherit;text-align:left;cursor:pointer;min-width:0}
.lx-co-line:first-child{border-top:0}
.lx-co-line:hover{background:var(--surface-2)}
.lx-co-line:focus-visible{outline:2px solid var(--e2);outline-offset:-2px}
.lx-co-line .t{min-width:0}
.lx-co-line b{display:block;font-size:14px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere}
.lx-co-line small{display:block;margin-top:1px;font-size:12.5px;color:var(--muted);overflow-wrap:anywhere}
.lx-co-line .p{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.lx-co-line .v{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.lx-co-total{display:flex;align-items:baseline;gap:12px;padding:14px 28px;border-top:1px solid var(--line);background:var(--band);border-radius:0 0 var(--r-xl) var(--r-xl);font-size:13.5px;color:var(--ink-2)}
.lx-co-total b{font-size:17px;font-weight:600;color:var(--ink);letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.lx-co-none{font-size:13.5px;color:var(--muted);max-width:64ch;line-height:1.5}
.lx-co-use{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;padding:4px 28px 16px}
.lx-co-use .k{font-size:12.5px;color:var(--muted)}
.lx-co-use .lx-stat{white-space:normal}
.lx-co-use .m{flex-basis:100%;font-size:12.5px;color:var(--muted)}
.lx-co-facts{padding:16px 28px 18px;border-top:1px solid var(--line)}
.lx-co-fine{padding:12px 28px 16px;border-top:1px solid var(--line);font-size:12.5px;line-height:1.5;color:var(--muted);margin:0}
.lx-co-acts{display:inline-flex;gap:8px;flex-wrap:wrap}
.lx-co-ro{gap:10px}
.lx-co-ro b{font-weight:600;color:var(--ink);font-variant-numeric:tabular-nums}
.lx-co-ro small{font-size:12.5px;color:var(--muted)}
.lx-co-ok{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:13.5px;color:var(--ink-2)}
.lx-co-miss{display:grid}
.lx-co-miss>div{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px 12px;align-items:center;padding:13px 28px;border-top:1px solid var(--line)}
.lx-co-miss>div:first-child{border-top:0}
.lx-co-miss .dot{width:8px;height:8px;border-radius:50%;background:var(--watch);box-shadow:0 0 0 3px rgba(232,181,0,.2)}
.lx-co-miss p{margin:0;font-size:14px;line-height:1.5;color:var(--ink)}
.lx-co-form{display:grid;gap:var(--sp-4);min-width:0}
.lx-co-form [hidden],.lx-co-form .hint:empty{display:none!important}
.lx-co-two{display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-4)}
.lx-co-check{display:flex;gap:10px;align-items:flex-start;cursor:pointer}
.lx-co-check input{width:18px;height:18px;margin-top:2px;flex:none;accent-color:var(--ink)}
.lx-co-check b{display:block;font-size:13.5px;font-weight:600}
.lx-co-check small{display:block;font-size:12.5px;line-height:1.45;color:var(--muted)}
.lx-co-note{margin:0;padding:10px 12px;border-radius:12px;background:var(--warn-bg);color:var(--warn);font-size:12.5px;line-height:1.5}
.lx-co-err{margin:0;min-height:0;font-size:13px;line-height:1.45;color:var(--bad)}
.lx-co-err:empty{display:none}
.lx-co-foot{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding-top:4px}
.lx-co-foot .lx-co-rm{color:var(--bad);padding-left:0}
.lx-co-ask{font-size:13.5px;font-weight:500;max-width:38ch;line-height:1.4}
.lx-co-tbl{display:grid;gap:8px}
.lx-co-tbl .hint{margin:0;font-size:12.5px;color:var(--muted)}
.lx-co-tbl>.lx-btn{justify-self:start}
.lx-co-trow{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr) auto;gap:8px;align-items:center}
.lx-co-trow.w{grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) auto}
.lx-co-trow .lx-btn{font-size:18px}
textarea.lx-co-csv{font:500 12.5px ui-monospace,Consolas,monospace;min-height:132px;white-space:pre;overflow:auto}
.lx-co-pick{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;font-size:13px;color:var(--ink-2)}
.lx-co-file{font:inherit;font-size:13px;max-width:100%}
.lx-co-result{display:grid;gap:10px}
.lx-co-result:empty{display:none}
.lx-co-sum{display:flex;gap:6px 14px;flex-wrap:wrap;align-items:center}
.lx-co-errs{margin:0;padding:10px 12px 10px 28px;border-radius:12px;background:var(--bad-bg);font-size:12.5px;line-height:1.6;color:var(--ink);max-height:160px;overflow:auto}
.lx-co-prev{display:grid;border-radius:12px;box-shadow:0 0 0 1px var(--line)}
.lx-co-prev>div{display:flex;justify-content:space-between;gap:12px;padding:8px 12px;border-top:1px solid var(--line);font-size:13px}
.lx-co-prev>div:first-child{border-top:0}
.lx-co-prev small{display:block;font-size:12px;color:var(--muted)}
.lx-co-prev b{font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;overflow-wrap:anywhere}
.lx-co-prev>.lx-foot{padding:8px 12px;margin:0;border-top:1px solid var(--line)}
@media (max-width:759px){
  .lx-co-line{grid-template-columns:minmax(0,1fr) auto;padding:13px 18px}
  .lx-co-line .p{grid-column:1/-1;grid-row:2;justify-content:flex-start}
  .lx-co-line .p:empty{display:none}
  .lx-co-total,.lx-co-use,.lx-co-facts,.lx-co-x{padding-left:18px;padding-right:18px}
  .lx-co-miss>div{grid-template-columns:auto minmax(0,1fr);padding:13px 18px}
  .lx-co-miss .lx-btn{grid-column:2;justify-self:start;height:40px}
  .lx-co-two{grid-template-columns:1fr}
  .lx-co-foot .lx-btn{height:44px}
  .lx-co-foot .lx-btn.primary{flex:1}
  .lx-co-acts .lx-btn,.lx-co .lx-sec .act .lx-btn{height:40px}
}
`;
