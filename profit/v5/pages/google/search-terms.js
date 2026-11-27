/* Ads > Google > Search terms for one brand.
   The question: what do people type before they buy, and what do we pay for that never buys?
   Four figures, brand search against everything else (Triple Whale), then the terms by theme.
   Orders and sales per search term are Google's count: Triple Whale does not go down to the term.
   That is said on the table, and it is the one place on the Google tabs where "Google says" leads.

   Read only. A row says what is worth doing (block it, add it); the change itself is made in Google Ads.

   Real mode: the top 50 terms come from Google Ads and are grouped by plain word rules (our name, gifts,
   price and deals), with "junk" taken from the weekly search term check. Brand against the rest on
   Triple Whale has no route yet and shows as an example. */

import { put } from '../../kit.js';
import { h, em, card, takeaway, segmented, table, statusDot, pill, money, num, pct, x, sheet } from '../../kit.js';
import { def, defOn, headRow } from '../platforms/_ads.js';
import { styles, gate, loadTerms, sampleGoogle, fig, figs, GADS, GSAYS, say, ok, div, usd, usd2, exampleChip, isEx, strip, AI_NAME } from './_g.js';

const STATE = { keyword: ['off', 'Already a keyword'], blocked: ['off', 'Blocked'], block: ['bad', 'Worth blocking'], add: ['good', 'Worth adding'] };
const STATE_WORDS = { keyword: 'Already a keyword: the term is bought on purpose.', blocked: 'Blocked: a negative keyword stops ads on it.', block: 'Worth blocking: it spent with no sale and is not about the brand. Add it as a negative keyword in Google Ads.', add: 'Worth adding: it sold and is not a keyword yet. Add it as its own keyword in Google Ads.' };
const ordersText = n => (n == null ? '' : Number.isInteger(n) ? num(n) : n < 1 ? num(n, 1) : num(Math.round(n)));
const roasOf = r => (r.orders >= 2 ? x(div(r.sales, r.spend)) : r.orders > 0 ? 'too few' : 'no sale');

function figures(d) {
  const cur = d.currency, t = d.terms, out = [], W = d.window.label;
  out.push(fig({ label: 'Spend we can see as terms', win: W, source: GADS, value: usd(t.shown.spend, cur), small: t.shown.total ? 'of ' + usd(t.shown.total, cur) : null,
    sub: (t.shown.total ? pct(t.shown.spend / t.shown.total) + ', ' : '') + 'the top ' + t.shown.count + ' terms' }));
  if (t.pmax) out.push(fig({ label: 'Performance Max', win: W, source: GADS, value: usd(t.pmax.spend, cur), small: pct(t.pmax.share) + ' of spend', sub: 'Shows categories, not terms' }));
  out.push(fig({ label: 'Other terms with a sale', win: W, source: GSAYS, value: num(t.nonbrand_sold.n), small: 'of the top ' + t.nonbrand_sold.of, sub: 'Not counting our own name' }));
  if (t.stray) out.push(fig({ label: 'Brand ad group, not our name', win: W, source: GADS, value: usd(t.stray.spend, cur), small: t.stray.n + (t.stray.n === 1 ? ' term' : ' terms'), sub: 'Paid for inside the brand ad group' }));
  return figs(out);
}

/* brand search against everything else, on Triple Whale */
function splitCard(d) {
  const sp = d.overview && d.overview.split; if (!sp) return null;
  const ex = isEx(d, 'split'), cur = ex ? 'USD' : d.currency, g = (ex ? d.example_goals : d.goals) || {};
  const spendShare = div(sp.brand.spend, sp.brand.spend + sp.other.spend), salesShare = div(sp.brand.sales, sp.brand.sales + sp.other.sales);
  const rows = [{ name: 'Brand search', sw: '', ...sp.brand }, { name: 'Everything else', sw: 'g', ...sp.other }];
  return card({ title: 'Brand search against everything else', note: d.window.label + ' · sales Triple Whale, last click', flush: true, class: 'gg-splitc', action: ex ? exampleChip() : null },
    h('div', { class: 'gg-split' },
      h('div', { class: 'gg-split-bar', role: 'img', 'aria-label': `Brand search is ${pct(spendShare)} of spend and ${pct(salesShare)} of sales` },
        h('i', { style: { width: (spendShare * 100).toFixed(1) + '%' } }), h('em', { style: { left: (salesShare * 100).toFixed(1) + '%' } })),
      h('div', { class: 'gg-split-l' }, h('span', null, 'Brand search: ', h('b', null, pct(spendShare)), ' of spend (the bar)'), h('span', null, h('b', null, pct(salesShare)), ' of sales (the tick)'))),
    table({ rows, cols: [
      { key: 'name', label: 'Side', render: r => h('span', { class: 'name' }, h('span', { class: 'gg-sw ' + r.sw }), r.name) },
      { key: 'spend', label: 'Spend', num: true, render: r => usd(r.spend, cur) },
      { key: 'sales', label: 'Sales', num: true, class: 'hide-sm', render: r => usd(r.sales, cur) },
      { key: 'roas', label: 'ROAS', num: true, class: 'strong', render: r => h('span', { class: g.roas && r.roas < g.roas ? 'neg' : '' }, x(r.roas)) },
      { key: 'orders', label: 'Orders', num: true, class: 'hide-md', render: r => num(r.orders) },
      { key: 'new_customers', label: 'New customers', num: true, class: 'hide-sm', render: r => num(r.new_customers) },
      { key: 'cost_new', label: def('New customer cost', 'ncpa'), num: true, render: r => h('span', { class: g.ncpa && r.cost_new > g.ncpa ? 'neg' : '' }, usd(r.cost_new, cur)) },
    ] }));
}

/* the terms: by theme, flat, or only the blocked ones */
function termsCard(d, ctx) {
  const cur = d.currency, t = d.terms, top = Math.max(1, ...t.themes.map(th => th.spend)), team = !ctx.isClient;
  const flat = t.themes.flatMap(th => th.rows.map(r => ({ ...r, theme_name: th.name })));
  const stateOf = r => (r.state ? defOn(statusDot(STATE[r.state][0], r.state_text || STATE[r.state][1]), { title: STATE[r.state][1], body: STATE_WORDS[r.state] }) : '');
  const cols = view => [
    { key: 'term', label: view === 'theme' ? 'Theme and search term' : 'Search term', sortable: view !== 'theme',
      render: r => (r.head ? h('span', { class: 'gg-th' }, r.name, h('small', null, r.count + (r.count === 1 ? ' term' : ' terms')))
        : h('span', { class: view === 'theme' ? 'gg-term' : '' }, r.term, r.flag && h('span', { class: 'gg-flag' }, statusDot('warn', r.flag)))) },
    { key: 'where', label: 'Where it ran', class: 'dim hide-sm', render: r => (r.head ? '' : r.where || '') },
    { key: 'spend', label: 'Spend', num: true, sortable: view !== 'theme', render: r => (r.head ? [usd(r.spend, cur), h('span', { class: 'lx-cellbar hide-sm', style: { '--v': (100 * r.spend / top).toFixed(1) + '%' } })] : usd(r.spend, cur)) },
    { key: 'clicks', label: 'Clicks', num: true, class: 'hide-md', sortable: view !== 'theme', render: r => num(r.clicks) },
    { key: 'orders', label: def('Orders', { title: 'Orders, Google\'s count', body: 'Google\'s own conversions for the term. Google can split one order across several clicks, so a term can show part of an order (0.4).', source: 'Google Ads' }), num: true, class: 'hide-md', sortable: view !== 'theme', render: r => ordersText(r.orders) },
    { key: 'sales', label: 'Sales', num: true, class: 'hide-sm', sortable: view !== 'theme', render: r => usd(r.sales, cur) },
    { key: 'roas', label: 'ROAS', num: true, value: r => div(r.sales, r.spend), sortable: view !== 'theme', render: r => h('span', { class: r.orders >= 2 ? '' : 'dim' }, roasOf(r)) },
    team ? { key: 'state', label: 'Suggestion', class: 'hide-sm', render: r => (r.head ? '' : stateOf(r)) } : null,
  ].filter(Boolean);
  const rowsFor = view => view === 'theme' ? t.themes.flatMap(th => [{ head: true, ...th }, ...th.rows])
    : view === 'blocked' ? flat.filter(r => r.state === 'blocked') : flat;
  const total = { head: false, term: 'Terms shown', where: t.total.count + ' terms', ...t.total, state: null };
  const body = h('div');
  const openTerm = r => r.head || !r.term ? null : sheet({ title: r.term, side: 'center', body: h('div', { class: 'gg-sh' },
    h('p', { class: 'gg-says' }, 'Google search term, ' + d.window.label + (r.where ? ', ran in ' + r.where : '')),
    h('div', { class: 'g' }, [['Spend', 'ad_spend', usd(r.spend, cur)], ['Clicks', 'click_rate', num(r.clicks)], ['Orders, Google says', 'google_says', ordersText(r.orders)], ['Sales, Google says', 'google_says', usd(r.sales, cur)], ['ROAS', 'roas', roasOf(r)]]
      .map(([l, k, v]) => h('div', null, h('span', { class: 'l' }, def(l, k)), h('b', null, v)))),
    team && r.state ? h('p', null, stateOf(r), ' ', STATE_WORDS[r.state] || '') : null,
    r.flag ? statusDot('warn', r.flag) : null) });
  const draw = view => put(body, table({ rows: rowsFor(view), cols: cols(view), total: view === 'blocked' ? null : total, onRow: openTerm,
    sort: view === 'all' ? { key: 'spend', dir: 'desc' } : null, empty: view === 'blocked' ? 'No blocked search terms in the top ' + t.total.count : 'No search terms with spend on these dates' }));
  let view = ctx.settingNow('google.termsView', 'theme'); if (!(team ? ['theme', 'all', 'blocked'] : ['theme', 'all']).includes(view)) view = 'theme';
  draw(view);
  const seg = segmented([{ id: 'theme', label: 'By theme' }, { id: 'all', label: 'All terms' }, team ? { id: 'blocked', label: 'Blocked' } : null].filter(Boolean), view, id => { draw(id); ctx.saveSetting('google.termsView', id).catch(() => {}); });
  const shownAll = flat.length >= t.total.count;
  return h('section', { class: 'lx-card flush gg-terms' },
    h('div', { class: 'lx-sec gg-termsh' }, h('h3', null, 'Search terms'), h('span', { class: 'note' }, d.window.label + ' · orders and sales are Google’s own count'), seg),
    body,
    h('p', { class: 'gg-quiet', style: { paddingTop: '14px' } },
      [!shownAll ? `The ${flat.length} biggest terms are listed; theme totals count all ${t.total.count}.` : null,
        t.pmax ? `Performance Max, ${usd(t.pmax.spend, cur)}: Google gives search categories only.` : null,
        t.themed_by === 'rules' ? 'Themes are sorted by plain word rules.' : t.themed_by === 'rules_and_check' ? 'Themes are sorted by plain word rules; junk comes from the weekly search term check.' : null].filter(Boolean).join(' ')));
}

export default {
  title: 'Search terms',
  eyebrow: 'Google',
  load: loadTerms,
  sample: sampleGoogle,
  render(el, d, ctx) {
    styles();
    const stop = gate(d, ctx);
    if (stop) return put(el, stop);
    const t = d.terms;
    if (!t || !t.themes.length) return put(el, strip({ title: 'No search terms with spend on these dates', text: 'Search and Shopping terms show here once they spend. Performance Max gives categories only.' }));
    const junk = t.themes.find(th => th.id === 'junk');
    /* the Locus AI line suggests what to block: team only, like the Suggestions tab */
    const take = ctx.isClient ? null : t.take ? say(t.take)
      : junk && junk.count ? [h('b', null, String(junk.count)), junk.count === 1 ? ' search has' : ' searches have', ' nothing to do with the brand and took ', h('b', null, usd(junk.spend, d.currency)), ' on these dates.'] : null;
    const help = [
      { title: 'What it is for', text: 'What people typed into Google before they clicked, which searches sold, and which spent with no sale. Tap a term for its numbers.' },
      { title: 'Where the numbers come from', text: 'Search and Shopping terms come from Google Ads. Triple Whale does not go down to the search term, so a term\'s orders and sales are what Google says. Nothing changes from this page: blocking or adding a term is done in Google Ads.' },
    ];
    ctx.askContext = `Google search terms for ${ctx.brand.name || 'this brand'}, ${d.window.label}: top ${t.total.count} terms spent ${usd(t.total.spend, d.currency)}, Google's own count ${num(t.total.orders)} orders.` + (junk && junk.count ? ` ${junk.count} junk searches took ${usd(junk.spend, d.currency)}.` : '');
    put(el, ...[
      headRow({ help }),
      figures(d),
      take ? takeaway(take) : null,
      splitCard(d),
      termsCard(d, ctx),
    ].filter(Boolean));
  },
};
