/* Shared by every Ads page (Meta, Google, TikTok, Amazon, All platforms, brand and agency): the words a number
   means on hover (the kit glossary first, then the Ads words below), the page's top row with its one "What is
   this page?" button, the amber warning line that replaces the old gray footers, and the level chip
   (Campaign / Ad set / Ad). No routes, no writes. */

import { h, statusDot, addStyles, sourceLine } from '../../kit.js';
import { defined, defLabel, infoButton, pageHelp, glossaryFor } from '../../defs.js';
import { RANGES } from '../../data.js';

const TW = 'Triple Whale';
/** The Ads words the kit glossary does not have yet. Same shape as defs.js entries. */
export const ADS_WORDS = {
  tacos: { name: 'TACOS', definition: 'Total advertising cost of sale: Amazon ad spend as a share of ALL Amazon sales (ads and organic). Lower is better.', formula: 'Amazon ad spend / All Amazon sales', source: 'Amazon' },
  acos: { name: 'ACOS', definition: 'Advertising cost of sale: Amazon ad spend as a share of the sales Amazon credits to those ads.', formula: 'Ad spend / Ad sales', source: 'Amazon' },
  lost_to_budget: { name: 'Lost to budget', definition: 'Share of the searches the campaign could have shown on but did not, because its daily budget ran out.', source: 'Google Ads' },
  lost_to_rank: { name: 'Lost to rank', definition: 'Share of the searches the campaign could have shown on but did not, because its bid or ad quality ranked too low.', source: 'Google Ads' },
  platform_says: { name: 'The platform\'s own count', definition: 'What the ad platform itself claims its ads sold. Platforms count generously (view-throughs, longer windows), so Locus leads with Triple Whale and shows this second.', source: 'The ad platform' },
  google_says: { name: 'Google says', definition: 'Google\'s own conversion count or ROAS. It counts generously, so Triple Whale leads and this shows second. About 5% apart from Triple Whale is normal.', source: 'Google Ads' },
  tiktok_says: { name: 'TikTok\'s count', definition: 'TikTok\'s own ROAS. It counts views and longer windows, so Triple Whale leads and this shows second.', source: 'TikTok Ads' },
  page_buys: { name: 'Page buys', definition: 'Of the people who reached the product page from Google, the share who bought (product page conversion rate).', formula: 'Orders / Product page visits', source: 'Google Ads and Shopify' },
  at_stake: { name: 'At stake', definition: 'What was spent in the last 7 days on the thing named in the suggestion: the money the decision is about.', source: 'The ad platform' },
  usual_day: { name: 'A usual day', definition: 'The average of the last 7 days at this same hour: what the account had normally spent by now.', source: 'The ad platform' },
  too_early: { name: 'Too early', definition: 'An ad is judged once it has spent twice the goal cost per sale AND run 3 days. Before that its numbers are chance.' },
  daily_account_limit: { name: 'Daily account limit', definition: 'Meta\'s spending cap for the whole ad account per day. When spend reaches it, every ad stops until midnight.', source: 'Meta' },
  still_learning: { name: 'Still learning', definition: 'Ad sets Meta has not finished testing: under about 50 results in 7 days, so delivery and cost still swing.', source: 'Meta' },
  ad_limit_50: { name: 'The 50 ad limit', definition: 'Meta lets an ad set run at most 50 active ads. A full ad set takes no new ads until one comes off; a copy of the set holds the rest.', source: 'Meta' },
  tracking: { name: 'Tracking', definition: 'Whether the Meta pixel is still sending purchase events from the store. Broken tracking means Meta optimizes blind.', source: 'Meta' },
  first_click: { name: 'First click', definition: 'Sales Triple Whale credits to the ad when it was the FIRST ad the buyer clicked. High first click and low last click means the ad starts journeys others finish.', source: TW + ', first click' },
  click_rate: { name: 'Click rate (CTR)', definition: 'Link clicks divided by impressions: how many of the people who saw the ad clicked it.', formula: 'Link clicks / Impressions', source: 'The ad platform' },
  winners: { name: 'Winners', definition: 'Ads at the goal ROAS or better (or at the goal cost per sale or under) with 3 or more sales, judged only after spending twice the goal cost per sale and running 3 days.' },
  days_running: { name: 'Days running', definition: 'Days since the ad first spent.', source: 'Meta' },
  result_7d: { name: 'Result, last 7 days', definition: 'ROAS for a sales campaign (Triple Whale sales, last click, divided by spend), cost per lead for a lead campaign. The last 7 full days.', source: TW + ' and Meta' },
  production_card: { name: 'Card', definition: 'A batch on the production board: one brief and every ad made from it. Load puts all of a card\'s approved ads into one Meta ad set.' },
  matters: { name: 'Changes that matter', definition: 'Budget changes, things turned off or on, audience and bid changes, new campaigns, ad sets and ads, and notes the team wrote. The rest is Meta\'s own housekeeping (reviews, renames, billing).' },
  scheduled: { name: 'Scheduled', definition: 'Waiting to start: a campaign or ad set with a start date ahead, or an ad loaded switched off in a live or upcoming ad set (a preload to switch on on a date).' },
  impression_share: { name: 'Times shown', definition: 'How many times the ad or product was shown (impressions).', source: 'The ad platform' },
  hook: { name: '2 second views', definition: 'Share of views that watched at least 2 seconds: how often the video stops the scroll.', source: 'TikTok' },
  six_second: { name: '6 second views', definition: 'Share of views that watched at least 6 seconds.', source: 'TikTok' },
  watched_end: { name: 'Watched to the end', definition: 'Share of views that played the whole video.', source: 'TikTok' },
  not_connected: { name: 'Not connected', definition: 'Needs the Amazon owner\'s Seller Central login. Ads numbers come through the agency\'s ads login; visits, conversion and Store numbers do not.', source: 'Amazon' },
  brand_share: { name: 'Brand search share', definition: 'Brand search is people typing the brand\'s own name. Its share of sales against its share of spend shows how much of Google only collects buyers who were coming anyway.', source: TW + ' and Google Ads' },
  ncpa: { name: 'New customer cost', definition: 'What it cost in ads to win one first-time customer.', formula: 'Ad spend / New customers', source: TW },
  goal_roas: { name: 'Goal ROAS', definition: 'The ROAS the brand\'s goal asks for. The tick on each bar marks it; at or past the tick is on goal.' },
};
const ALIAS = { cost_per_new_customer: 'ncpa', new_customer_cost: 'ncpa', cost_each: 'ncpa', ctr: 'click_rate', usual: 'usual_day', limit: 'daily_account_limit', learning: 'still_learning', fifty: 'ad_limit_50' };
const objOf = e => e && { title: e.name, body: e.definition, formula: e.formula, source: e.source };
/** The entry for a key: a page object, an Ads word, or the kit glossary key (kept as the key so the engine can answer). */
export function wordOf(key) {
  if (key && typeof key === 'object') return key;
  const k = String(key || '').toLowerCase();
  if (ADS_WORDS[k]) return objOf(ADS_WORDS[k]);
  if (glossaryFor(k)) return k;
  if (ALIAS[k] && ADS_WORDS[ALIAS[k]]) return objOf(ADS_WORDS[ALIAS[k]]);
  return k;
}
/** def('Cost per sale', 'cpa') : a label with its meaning on hover and tap. */
export const def = (text, key, o) => defLabel(text, wordOf(key), o);
/** defOn(node, key) : mark an existing node. */
export const defOn = (node, key) => defined(node, wordOf(key));
export const info = key => infoButton(wordOf(key));

/** The first row of an Ads page: optional left content, then "What is this page?" (and Ask why, team only) at the right. */
export function headRow({ help, left, ask } = {}) {
  css();
  return h('div', { class: 'ads-head' }, h('div', { class: 'l' }, left || null), h('div', { class: 'r' }, ask || null, help ? pageHelp({ body: help }) : null));
}
/** A true warning (not a definition): one amber line at the top. */
export const warnLine = (text, tone = 'warn') => (text ? (css(), h('div', { class: 'ads-warn' }, statusDot(tone, text))) : null);

/** Campaign / Ad set / Ad / Ads, as one quiet chip. */
export const levelChip = level => (level ? (css(), h('span', { class: 'ads-lvl' }, level)) : null);

/** rangeChips(ctx) : the date range right where a list is read. The chips drive the page head's own date menu
    (the shell owns the range; a page cannot set it), so the choice is the same one the head shows and keeps. */
export function rangeChips(ctx) {
  css();
  const cur = ctx.range || {};
  const pick = r => {
    const btn = document.querySelector('.lx-range'); if (!btn) return;
    btn.click();
    const item = [...document.querySelectorAll('.lx-pop .lx-item')].find(b => (b.firstChild && b.firstChild.textContent) === r.label);
    if (item) item.click();
  };
  return h('div', { class: 'ads-rng', role: 'group', 'aria-label': 'Dates' }, h('span', { class: 'k' }, 'Dates'),
    RANGES.map(r => h('button', { type: 'button', class: 'ads-chip' + (cur.preset === r.id ? ' on' : ''), 'aria-pressed': String(cur.preset === r.id), onclick: () => pick(r),
      title: r.id === 'custom' ? 'Pick two dates' : null }, r.id === 'custom' && cur.preset === 'custom' ? cur.label : r.label)));
}
/** a 12:05 PM style time, the app's way: 12:05pm */
export const clock = t => String(t || '').replace(/\s?(AM|PM)$/i, m => m.trim().toLowerCase());

const CSS = `
.ads-head{display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;min-width:0}
.ads-head .l{display:flex;align-items:center;gap:10px 16px;flex-wrap:wrap;min-width:0;flex:1}
.ads-head .r{display:flex;align-items:center;gap:8px;margin-left:auto}
.ads-warn{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:12px;background:var(--warn-bg);min-width:0}
.ads-warn .lx-stat{white-space:normal;color:var(--warn)}
.ads-rng{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.ads-rng .k{font-size:12.5px;color:var(--muted);margin-right:4px}
.ads-chip{height:30px;padding:0 12px;border:0;border-radius:999px;background:var(--bg-sunk);color:var(--ink-2);font:inherit;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap}
.ads-chip:hover{background:var(--line-strong)}
.ads-chip.on{background:var(--ink);color:var(--bg)}
.ads-whose{font-size:var(--fs-small,12.5px);color:var(--muted)}
.ads-lvl{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:999px;background:var(--bg-sunk);color:var(--muted);font-size:11px;font-weight:600;white-space:nowrap;flex:none}
`;
function css() { addStyles('ads-shared', CSS); }
/** polishSuggestions(el, d, { platform, days }) : the agency suggestion list is drawn by the shared renderer in
    a-today/_more.js (another area's file). This makes it read like the brand page without touching that file:
    every brand button the same quiet style, no kind chip when it says the same as the call, "At stake" defined with
    its period, the platform's own words for what the money is, and a warning when the list is not from today. */
export function polishSuggestions(el, d, { platform = 'meta', days = 7 } = {}) {
  css();
  el.querySelectorAll('.ag-sg-h .lx-btn.primary').forEach(b => b.classList.remove('primary'));
  el.querySelectorAll('.ag-sg-r').forEach(r => {
    const pill = r.querySelector('.k .lx-pill'), call = r.querySelector('.t > b');
    if (pill && call && call.textContent.trim().toLowerCase().startsWith(pill.textContent.trim().toLowerCase())) pill.remove();
    const small = r.querySelector('.m small');
    if (small) small.replaceWith(def(`at stake, last ${days} days`, { title: 'At stake', body: `What was spent in the last ${days} days on the ${platform === 'google' ? 'campaigns and searches' : 'ads and ad sets'} named: the money the decision is about.` }, { tag: 'small' }));
  });
  for (const k of el.querySelectorAll('.lx-kpi')) {
    const l = k.querySelector('.l'), s = k.querySelector('.s');
    if (!l) continue;
    if (/^Money behind them/.test(l.textContent)) { l.replaceChildren(def(`At stake, last ${days} days`, 'at_stake')); if (s) s.textContent = platform === 'google' ? 'spend on the campaigns and searches named' : 'spend on the ads and ad sets named'; }
    if (/^To turn off or trim/.test(l.textContent) && s) s.textContent = platform === 'google' ? 'searches to block and campaigns to cut' : 'calls that take spend away';
  }
  /* whose count the ROAS in each row is: Google rows are judged on Google's own count today, Meta rows on Triple Whale */
  const whose = platform === 'google' ? "Google's own count" : 'Triple Whale';
  el.querySelectorAll('.ag-sg-r .t').forEach(t => {
    if (t.querySelector('.ads-whose') || !/ROAS|\d\.?\d*x/.test(t.textContent)) return;
    t.append(h('span', { class: 'ads-whose' }, 'ROAS: ' + whose));
  });
  heroToTiles(el, `Last ${days} days`, whose + ', Locus ad rules');
  const asOf = d && d.as_of ? Date.parse(d.as_of) : NaN;
  if (isFinite(asOf)) {
    const daysOld = Math.floor((Date.now() - asOf) / 864e5);
    if (daysOld >= 1) {
      const warn = warnLine(`Last read ${daysOld === 1 ? 'yesterday' : daysOld + ' days ago'}: these are not today's numbers.`);
      const first = el.querySelector('.ag') || el; first.prepend(warn);
    }
  }
}
/** heroToTiles(el, window, source) : a hero band of figures drawn by a shared renderer in another area's file
    (a-today/_ag.js figures) becomes the batch 1 tile row: each figure a card at the tile size, with the window and
    source line under it. Only the first band is changed; nothing is re-read. */
export function heroToTiles(el, win, source) {
  const band = el.querySelector('section.lx-hero');
  const row = band && band.querySelector(':scope > .lx-kpis');
  if (!row) return;
  const n = row.children.length;
  row.className = 'lx-tiles' + (n === 4 ? ' c4' : n === 2 ? ' c2' : '');
  row.removeAttribute('style');
  for (const k of row.children) {
    k.classList.remove('lg');
    const big = k.querySelector('.lx-hero-num');
    if (big) { const v = h('span', { class: 'v' }, big.textContent); (big.parentElement.classList.contains('lx-kpi') ? big : big.parentElement).replaceWith(v); }
    if (!k.querySelector('.lx-srcline')) k.append(sourceLine(win, source));
  }
  band.replaceWith(row);
}
export { pageHelp };
