/* What a number means, shown on hover (desktop) AND on tap or click (a toggle). Works on every page.
   The words come from the new engine (GET /v1/metrics/definitions, written once in
   engine/worker/src/numbers/catalog.js, read once). When the engine has no entry for a key, or in sample
   mode, the local GLOSSARY below answers (plain, short, Triple Whale definitions).

     defined(node, key)            marks a node: dotted underline, hover / focus / tap shows the meaning.
                                   key: a glossary or engine id ('mer', 'roas', 'sales', 'today', 'call_raise'...),
                                   any spelling ('Store MER', 'since-last-check-in'), or { title, body }.
                                   Returns the node at once. A key nobody knows leaves the node as it was.
     defLabel(text, key, { tag })  a <span> (or tag) with the text, already defined.
                                   defLabel('Store MER', 'mer')   defLabel('ROAS this week', 'roas')
     infoButton(key, { label })    a small round (i) button that opens the same bubble. key as above.
                                   infoButton({ title: 'Plan status', body: 'Locked means the client agreed.' })
     pageHelp({ title, body, label, side })   a quiet "What is this page?" button that opens a kit sheet
                                   (a bottom sheet on a phone). body: text (blank lines = paragraphs), a node,
                                   or an array of text, nodes and { title, text } sections.
     definitions()                 the engine list.   definitionFor(key)  one entry (engine, then glossary).
     glossaryFor(key)              the local entry only, at once (no network).

   The bubble opens after the mouse rests on the term for 350ms (kit HOVER, never while the page scrolls), at once on
   keyboard focus and on a tap or click (which pins it). It closes 120ms after the pointer leaves, on a second tap,
   a tap anywhere else, Escape or a route change. It is kept inside the viewport. It is the same dark bubble as the
   chart tooltip: the name in bold white, the meaning, then "Worked out" and "Source" as label and value rows.

   Only terms that are not obvious get a definition (MER, ROAS, CPA, AOV, CTR, CPM, CPC, frequency, hook rate,
   hold rate, break-even, goal MER, new customer cost, first click, last click, since last check-in, pace,
   contribution, LTV). Plain words (Sales, Ad spend, Spend, Orders, Today, Yesterday, This week, Budget, Clicks,
   Impressions, Customers) are on STOPLIST: defLabel('Spend', 'spend') renders plain text, no dotted line. */

import { h, sheet, placeFloat, tipRow, HOVER, scrollingNow, bubbleWarm, noteBubbleShut } from './kit.js';
import { SAMPLE } from './config.js';
import { engineApi } from './engine.js';

/* ---------- the local glossary ---------- */
const TW = 'Triple Whale';
export const GLOSSARY = {
  sales: { name: 'Sales', definition: 'Every store order in the period, all channels, at the order value before refunds. Not only orders from ads.', source: TW },
  net_sales: { name: 'Net sales', definition: 'Sales after discounts and refunds are taken off.', source: TW },
  ad_spend: { name: 'Ad spend', definition: 'What every connected ad platform spent in the period (Meta, Google, TikTok and the rest), added together.', source: 'Each ad platform' },
  mer: { name: 'Store MER', definition: 'The whole store: all sales divided by all ad spend. It does not care which ad gets the credit, so it is the truest read of whether ads pay.', formula: 'Sales / Ad spend', source: TW },
  roas: { name: 'ROAS', definition: 'One platform or one campaign: the sales Triple Whale credits to it (last click) divided by what it spent. Store-wide efficiency is MER, not ROAS.', formula: 'Attributed sales / Spend', source: TW + ', last platform click' },
  new_customer_cost: { name: 'New customer cost', definition: 'What it cost in ads to win one new customer in the period.', formula: 'Ad spend / New customers', source: TW },
  target_mer: { name: 'Target MER', definition: 'The store MER the plan asks for. At or above it the sale is on plan; well above it, Locus suggests a raise.' },
  break_even_mer: { name: 'Break-even MER', definition: 'The store MER where ad spend uses up all the profit on the sales. Under it, the store loses money on its ads.' },
  break_even_roas: { name: 'Break-even ROAS', definition: 'The ROAS where one platform or campaign pays for itself after product, shipping and fees, and no more.' },
  since_check_in: { name: 'Since last check-in', definition: 'From the last check-in to now, Central time. The freshest read, and the one the call leans on most.' },
  today: { name: 'Today', definition: 'Today from 12am Central time to now.' },
  this_week: { name: 'This week', definition: 'This week from Monday 12am Central time to now.' },
  budget_a_day: { name: 'Budget a day', definition: 'The daily budget set in the ad platform: on the campaign, or added up across its ad sets.' },
  spent_today: { name: 'Spent today', definition: 'What the campaign has spent since 12am Central time today, as the platform reports it.', source: 'The ad platform' },
  calls: { name: 'The call', definition: 'At each check-in Locus reads every campaign against its target and break-even and suggests Raise, Hold, Cut or Too early. A person approves it before anything changes.' },
  call_raise: { name: 'Raise', definition: 'The numbers are well over target, so the budget goes up by the step shown. Nothing changes until someone approves.' },
  call_hold: { name: 'Hold', definition: 'On target. Leave the budget where it is and check again at the next check-in.' },
  call_cut: { name: 'Cut', definition: 'Under break-even. Bring the budget down by the step shown.' },
  call_too_early: { name: 'Too early', definition: 'Not enough spend or time yet to judge. Check again at the next check-in.' },
  call_numbers: { name: 'No read', definition: 'No call is made for this campaign right now: the sale has not started or has ended, or the store numbers could not be read. The numbers still show.' },
  call_client: { name: 'Client decides', definition: 'The client runs this budget, so Locus makes no call on it. The numbers still show; change it only when the client asks.' },
  call_reading: { name: 'Reading', definition: 'The earlier check-ins are still being read. The call shows once they are in, so a move is never suggested on half the numbers.' },
  call_done: { name: 'Done', definition: 'The budget was changed from this page or from the Slack check-in at this check-in.' },
  no_sales_read: { name: 'No sales read', definition: 'Triple Whale has no sales on record for this campaign, so its ROAS is not shown as a zero.' },
  no_store_roas: { name: 'No read', definition: 'This brand has no store connected to Triple Whale, so there are no sales to credit and no ROAS to read. Spend and budgets still show.' },
  too_little_spend: { name: 'Too little spend', definition: 'The campaign spent too little in this window for its ROAS to mean anything yet.' },
  pace: { name: 'Pace', definition: 'Spent today against the share of the daily budget the hours so far would use. 100% is right on pace; under it, the campaign is not spending what it is given.' },
  link_clicks: { name: 'Link clicks', definition: 'Clicks on the ad that went to the website this week.', source: 'Meta' },
  add_to_carts: { name: 'Add to carts', definition: 'Times someone from this campaign added a product to the cart this week.', source: 'Meta' },
  checkouts_started: { name: 'Checkouts started', definition: 'Times someone from this campaign started checkout this week.', source: 'Meta' },
  purchases_last_click: { name: 'Purchases', definition: 'Orders Triple Whale credits to this campaign this week, when it was the last ad clicked.', source: TW + ', last platform click' },
  ctr: { name: 'CTR', definition: 'Click-through rate: link clicks divided by impressions.', formula: 'Link clicks / Impressions', source: 'Meta' },
  cpm_frequency: { name: 'CPM and frequency', definition: 'CPM is what 1,000 ad views cost. Frequency is how many times the same person saw the ads this week, on average.', source: 'Meta' },
  cost_per_add_to_cart: { name: 'Cost per add to cart', definition: 'Spend divided by add to carts this week.', formula: 'Spend / Add to carts', source: 'Meta' },
  video_views_3s: { name: 'Video views (3 seconds)', definition: 'Times a video ad was watched for at least 3 seconds this week.', source: 'Meta' },
  last_budget_change: { name: 'Last budget change', definition: 'When the budget on this campaign last changed (from the Change Log), and what it has spent since. A change under a few hours old is not read yet.' },
  bf_offer: { name: 'Black Friday offer', definition: 'The deal the customer gets on the Black Friday weekend, as written in the brand season plan.' },
  sale_dates: { name: 'Sale dates', definition: 'The first and last day of the Black Friday sale for this brand, Central time, from the season plan.' },
  sales_goal: { name: 'Sales goal', definition: 'The store sales the plan aims for over the whole sale, in dollars. Sales are Triple Whale: every store order, before refunds.' },
  plan_status: { name: 'Plan status', definition: 'Ready when the goals, the raise, hold and cut lines and the offers and dates are all set. Otherwise the first open step is named.' },
  /* app-wide words (2026-11-26 all-pages pass): ad lists, the top bar, tabs */
  cpa: { name: 'Cost per sale (CPA)', definition: 'What the ads spent for each sale Triple Whale credits to them (last platform click).', formula: 'Spend / Purchases', source: TW + ', last platform click' },
  cpm: { name: 'CPM', definition: 'What 1,000 ad views cost on the platform.', formula: 'Spend / Impressions x 1,000', source: 'The ad platform' },
  frequency: { name: 'Frequency', definition: 'How many times the same person saw the ad in the period, on average.', formula: 'Impressions / Reach', source: 'The ad platform' },
  impressions: { name: 'Impressions', definition: 'How many times the ad was shown.', source: 'The ad platform' },
  new_customer_roas: { name: 'New customer ROAS', definition: 'Sales from first-time customers that Triple Whale credits to the ad (last click), divided by its spend. Repeat buyers are left out.', formula: 'New customer sales / Spend', source: TW + ', last platform click' },
  aov: { name: 'AOV', definition: 'Average order value: sales divided by orders in the period.', formula: 'Sales / Orders', source: TW },
  orders: { name: 'Orders', definition: 'Store orders in the period, all channels.', source: TW },
  new_customers: { name: 'New customers', definition: 'People whose first ever order with the store was in the period.', source: TW },
  team_only: { name: 'Team only', definition: 'Only the agency team sees this. A client login never shows it.' },
  quick_lookups: { name: 'Quick lookups', definition: 'A number, date or status read straight from the data by code, in one line. No AI, so it uses none of the AI allowance.' },
  cpc: { name: 'CPC', definition: 'Cost per click: what one link click cost.', formula: 'Spend / Link clicks', source: 'The ad platform' },
  hook_rate: { name: 'Hook rate', definition: 'Share of people who watched the first 3 seconds of a video ad, out of everyone it was shown to. Says whether the opening stops the scroll.', formula: '3 second views / Impressions', source: 'The ad platform' },
  hold_rate: { name: 'Hold rate', definition: 'Share of people who kept watching to about 15 seconds, out of those who watched the first 3. Says whether the video keeps them.', formula: 'ThruPlays / 3 second views', source: 'The ad platform' },
  first_click: { name: 'First click', definition: 'The sale is credited to the first ad the buyer clicked. Shows which ads bring new people in.', source: TW },
  last_click: { name: 'Last click', definition: 'The sale is credited to the last ad the buyer clicked before buying. The standard Locus uses for ROAS.', source: TW },
  contribution: { name: 'Contribution', definition: 'What is left from sales after product cost, shipping, fees and ad spend, before fixed costs like rent and salaries.', formula: 'Sales minus product, shipping, fees and Ad spend', source: TW },
  ltv: { name: 'LTV', definition: 'Lifetime value: what a customer spends with the store over time, counted from their first order.', source: TW },
  ask_ai: { name: 'Ask Locus AI', definition: 'Ask a question about the page you are on. The question goes with the page, the brand and the dates in the page head; past questions stay in your Ask history.' },
};
/* other spellings people and pages use for the same thing */
const ALIAS = {
  revenue: 'sales', gross_sales: 'sales', total_sales: 'sales', store_sales: 'sales',
  spend: 'ad_spend', ads: 'ad_spend', total_spend: 'ad_spend', blended_spend: 'ad_spend',
  store_mer: 'mer', blended_roas: 'mer', merx: 'mer',
  platform_roas: 'roas', campaign_roas: 'roas',
  cac: 'new_customer_cost', ncac: 'new_customer_cost', new_customer_cpa: 'new_customer_cost', cost_per_new_customer: 'new_customer_cost',
  target: 'target_mer', mer_target: 'target_mer', goal_mer: 'target_mer',
  breakeven_mer: 'break_even_mer', be_mer: 'break_even_mer', be_new: 'break_even_mer',
  breakeven_roas: 'break_even_roas', be_roas: 'break_even_roas',
  since: 'since_check_in', since_last_check_in: 'since_check_in', since_checkin: 'since_check_in', since_last_checkin: 'since_check_in',
  week: 'this_week', budget: 'budget_a_day', daily_budget: 'budget_a_day', budget_per_day: 'budget_a_day',
  call: 'calls', raise: 'call_raise', scale: 'call_raise', hold: 'call_hold', cut: 'call_cut', pull_back: 'call_cut',
  too_early: 'call_too_early', early: 'call_too_early', wait: 'call_too_early',
  cost_per_sale: 'cpa', cost_per_purchase: 'cpa', ncroas: 'new_customer_roas', nc_roas: 'new_customer_roas', average_order_value: 'aov',
  cost_per_click: 'cpc', hook: 'hook_rate', thumbstop: 'hook_rate', first_click_sales: 'first_click', last_click_sales: 'last_click',
  last_platform_click: 'last_click', contribution_margin: 'contribution', cm: 'contribution', lifetime_value: 'ltv', goal: 'target_mer', break_even: 'break_even_mer',
  team: 'team_only', free_answers: 'quick_lookups', lookups: 'quick_lookups', ask: 'ask_ai', ask_locus_ai: 'ask_ai',
};
/** Plain words: never a definition, whatever key a page passes (decision 2). Keys after norm and ALIAS. */
export const STOPLIST = new Set(['sales', 'ad_spend', 'spend', 'orders', 'today', 'yesterday', 'this_week', 'budget', 'budget_a_day', 'clicks', 'link_clicks', 'impressions', 'customers', 'revenue']);
const stopWord = v => { const k = norm(v); return !!k && (STOPLIST.has(k) || STOPLIST.has(ALIAS[k])); };
/* a plain word stays plain: a key on the list, or an object definition whose name is a plain word ("Sales") */
const stopped = (key, text) => {
  if (!key) return false;
  if (typeof key === 'object') return stopWord(key.name) || (typeof text === 'string' && stopWord(text));
  return stopWord(key);
};
const norm = k => String(k == null ? '' : k).trim().toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
/** The local entry for a key, at once: { name, definition, formula?, source? } or null. */
export function glossaryFor(key) {
  if (key && typeof key === 'object') return fromObj(key);
  const k = norm(key);
  return GLOSSARY[k] || GLOSSARY[ALIAS[k]] || null;
}
function fromObj(o) {
  const name = o.title || o.name, definition = o.body || o.definition || o.text;
  return name || definition ? { name: name || '', definition: definition || '', formula: o.formula, source: o.source } : null;
}

/* ---------- the engine list ---------- */
let LIST = null;
/** Every engine definition: [{ id, name, definition, formula, source, unit, returns, old_keys }]. [] when it cannot be read. */
export function definitions() {
  if (SAMPLE) return Promise.resolve([]);
  LIST ||= engineApi('/v1/metrics/definitions').then(j => (j && j.definitions) || [], () => { LIST = null; return []; });
  return LIST;
}
async function engineFor(key) {
  const k = String(key || '').toLowerCase(), n = norm(key);
  const all = await definitions();
  return all.find(d => d.id === k || d.id === n) || all.find(d => (d.old_keys || []).includes(k) || (d.old_keys || []).includes(n)) || null;
}
/** One definition: the engine's (by id or an old answer key), else the local glossary. null when neither has it. */
export async function definitionFor(key) {
  if (key && typeof key === 'object') return fromObj(key);
  return (await engineFor(key).catch(() => null)) || glossaryFor(key);
}

/* ---------- the bubble ---------- */
let pop = null, cur = null;   // cur = { node, pinned }
let openT = 0, leaveT = 0;
function close() {
  clearTimeout(openT);
  if (pop) { pop.remove(); pop = null; noteBubbleShut(); }
  if (cur) { cur.node.classList.remove('open'); cur.node.setAttribute('aria-expanded', 'false'); cur.node.removeAttribute('aria-describedby'); cur = null; }
}
function open(node, pinned) {
  clearTimeout(openT);
  const d = node._lxDef; if (!d) return;
  if (cur && cur.node === node) { cur.pinned = cur.pinned || pinned; return; }
  close();
  /* one look with the chart bubble (kit tipShow): title line, the meaning, then label and value rows */
  pop = h('div', { class: 'lx-tip lx-defpop', role: 'tooltip', id: 'lx-defpop' },
    d.name ? h('div', { class: 'lx-tip-h' }, d.name) : null,
    d.definition ? h('p', { class: 'lx-tip-p' }, d.definition) : null,
    d.formula ? tipRow(null, 'Worked out', d.formula) : null,
    d.source ? tipRow(null, 'Source', d.source) : null);
  /* the pointer may move onto the bubble (to read or select it) without closing it */
  pop.addEventListener('pointerenter', () => clearTimeout(leaveT));
  pop.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && cur && !cur.pinned) leaveT = setTimeout(() => { if (cur && !cur.pinned) close(); }, HOVER.close); });
  document.body.append(pop);
  cur = { node, pinned };
  node.classList.add('open');
  node.setAttribute('aria-expanded', 'true');
  node.setAttribute('aria-describedby', 'lx-defpop');
  placeFloat(pop, node, 8);
}
function mark(node, d) {
  node._lxDef = d;
  if (cur && cur.node === node && pop) { const pinned = cur.pinned; close(); open(node, pinned); }   // a better entry arrived
  const info = node.classList.contains('lx-info');
  if (!info) node.classList.add('lx-def');
  if (info && d.name) node.setAttribute('aria-label', 'What is ' + d.name + '?');
  if (node._lxDefOn) return;
  node._lxDefOn = true;
  if (!/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(node.tagName)) { node.tabIndex = 0; node.setAttribute('role', 'button'); }
  node.setAttribute('aria-expanded', 'false');
  /* hover: wait until the pointer rests (350ms), never while the page scrolls; at once when a bubble is already open */
  node.addEventListener('pointerenter', e => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(leaveT); clearTimeout(openT);
    if (cur && cur.node === node) return;
    if (scrollingNow()) return;
    if (bubbleWarm()) open(node, false); else openT = setTimeout(() => { if (node.isConnected && !scrollingNow()) open(node, false); }, HOVER.open);
  });
  node.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; clearTimeout(openT); leaveT = setTimeout(() => { if (cur && cur.node === node && !cur.pinned) close(); }, HOVER.close); });
  node.addEventListener('focus', () => { if (node.matches(':focus-visible')) open(node, false); });
  node.addEventListener('blur', () => { if (cur && cur.node === node && !cur.pinned) close(); });
  /* a tap or a click pins it open; the second one closes it. It never also follows a link.
     In a sortable table header the click sorts instead (hover and focus still show the definition). */
  node.addEventListener('click', e => {
    if (node.closest('th.can-sort')) return;
    e.preventDefault(); e.stopPropagation();
    if (cur && cur.node === node && cur.pinned) close(); else { if (cur && cur.node === node) cur.pinned = true; else open(node, true); }
  });
  node.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && node.tagName !== 'BUTTON') { e.preventDefault(); node.click(); }
    if (e.key === 'Escape' && cur && cur.node === node) { e.stopPropagation(); close(); }
  });
}

/** defined(node, key) : see the top of this file. */
export function defined(node, key) {
  if (!node) return node;
  /* a plain word stays plain text (an explicit (i) button still explains it) */
  if (stopped(key, node.textContent) && !node.classList.contains('lx-info')) return node;
  const local = glossaryFor(key);
  if (local) mark(node, local);
  if (!(key && typeof key === 'object') && !SAMPLE) engineFor(key).then(d => { if (d) mark(node, d); }, () => {});
  return node;
}
/** defLabel('Store MER', 'mer') : a span with the words, already defined. { tag: 'b' } for another element. */
export function defLabel(text, key, { tag = 'span', class: cls } = {}) {
  return defined(h(tag, cls ? { class: cls } : null, text), key);
}
/** infoButton('roas') or infoButton({ title, body }) : a small round (i) button with the same bubble. */
export function infoButton(key, { label } = {}) {
  const g = glossaryFor(key);
  const b = h('button', { type: 'button', class: 'lx-info', 'aria-label': label || (g && g.name ? 'What is ' + g.name + '?' : 'What is this?') }, 'i');
  return defined(b, key);
}
/** pageHelp({ title, body, label, side }) : the one small "What is this page?" button beside a page title.
    Opens a kit sheet (center on a desktop, from the bottom on a phone). Returns the button. */
export function pageHelp({ title = 'What is this page?', body, label = 'What is this page?', side = 'center' } = {}) {
  return h('button', { type: 'button', class: 'lx-help', onclick: () => sheet({ title, side, class: 'lx-help-sheet', body: helpBody(body) }) },
    h('span', { class: 'lx-info', 'aria-hidden': 'true' }, 'i'), label);
}
function helpBody(body) {
  const para = t => String(t).split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).map(p => h('p', null, p));
  if (body == null) return [];
  if (body.nodeType) return body;
  if (!Array.isArray(body)) return para(body);
  return body.flat().filter(Boolean).map(it => it.nodeType ? it : typeof it === 'object'
    ? h('section', null, it.title ? h('h3', null, it.title) : null, it.text == null ? null : it.text.nodeType ? it.text : para(it.text))
    : para(it));
}

/* one set of page-wide closers */
document.addEventListener('pointerdown', e => { if (cur && !cur.node.contains(e.target) && !(pop && pop.contains(e.target))) close(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur) close(); });
window.addEventListener('scroll', () => { clearTimeout(openT); if (!cur) return; if (!cur.node.isConnected) return close(); if (!cur.pinned) return close(); placeFloat(pop, cur.node, 8); }, { capture: true, passive: true });
window.addEventListener('resize', () => { if (cur && pop) placeFloat(pop, cur.node, 8); });
window.addEventListener('hashchange', close);
