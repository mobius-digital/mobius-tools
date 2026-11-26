/* Shared bits for the Business pages (Home, Month, Sales, Customers, Funnel, Website, Email & SMS, and the agency
   Money, Month and Today pages). Page level only: nothing here changes the kit or writes anywhere.

     askWhy(ctx, title, label)   the "Ask why" button: opens Ask Locus AI in place (askpanel.js) with this page's
                                 context, never leaves the page. Sample mode never calls the server (the panel's rule).
     helpBar(body)               the one "What is this page?" button at the top of a page (defs.js pageHelp), in a
                                 quiet row. body: text or [{ title, text }] sections. Replaces the old gray footers.
     dl(text, key)               a label with its hover (and tap) definition: defs.js defLabel, with the local words
                                 below for terms the app glossary does not have yet.
     rangeWords(ctx, own)        "Nov 1 to 22": the page head's dates in words, for labels that must name the period.
     DEF                         the local definitions ({ name, definition, source }), keyed like defs.js.

   The words in DEF are candidates for defs.js GLOSSARY (keys named in the all-pages pass): profit_after_ads,
   left_before_ads, ltv, conversion_rate, open_rate, click_rate, sales_per_message, rage_clicks, scroll_depth,
   margin, per_team_hour, plan_to_date. Until they land there, dl() passes the object itself (defs.js accepts it). */

import { h, button, addStyles } from '../../kit.js';
import { defLabel, glossaryFor, pageHelp } from '../../defs.js';
import { openAskPanel } from '../../askpanel.js';

const TW = 'Triple Whale', KL = 'Klaviyo', GA = 'Google Analytics', CL = 'Microsoft Clarity';

export const DEF = {
  profit_after_ads: { name: 'Profit after ads', definition: 'Sales less product cost, delivery, handling, payment fees and ad spend. Fixed costs (rent, software, the agency fee) come off after this.', source: TW + ' costs' },
  left_before_ads: { name: 'Left before ads', definition: 'Sales less product cost, delivery, handling and payment fees. What the store has to pay for ads and still make money.', source: TW + ' costs' },
  ltv: { name: 'LTV', definition: 'Sales per customer since their first order, before product cost. Read for customers who first ordered in the window named on the chart.', source: TW },
  ltv_back: { name: 'Back per $1', definition: 'Sales from a new customer by that day, for every dollar of ads it took to win them. Over 1.00 means the customer has paid back what they cost.', formula: 'LTV by that day / Cost per new customer', source: TW },
  conversion_rate: { name: 'Conversion rate', definition: 'Visits that ended in an order: orders divided by visits (sessions) in the period.', formula: 'Orders / Visits', source: TW + ' and the store' },
  open_rate: { name: 'Open rate', definition: 'Opens divided by messages delivered. Apple Mail opens count, so this runs high.', source: KL },
  click_rate: { name: 'Click rate', definition: 'People who clicked a link divided by messages delivered.', source: KL },
  sales_per_message: { name: 'Sales per message', definition: 'Sales the send made divided by the messages delivered. The fairest way to compare a big send with a small one.', formula: 'Sales / Messages delivered', source: KL },
  rage_clicks: { name: 'Rage clicks', definition: 'Visits where someone clicked the same spot again and again, a sign something looked clickable and was not, or did not work.', source: CL + ', last 3 days' },
  scroll_depth: { name: 'Scroll', definition: 'How far down the page the average visit scrolled.', source: CL + ', last 3 days' },
  margin: { name: 'Margin', definition: 'An estimate: the fee received less team time (hours times the hourly cost) and AI cost, as a share of the fee.', source: 'Ledger and team hours' },
  per_team_hour: { name: 'Per team hour', definition: 'The fee received divided by the hours the team logged on this client this month. An estimate: hours are only what was logged.', source: 'Ledger and team hours' },
  team_ai_cost: { name: 'Team and AI cost', definition: 'An estimate: hours logged times the hourly cost of each person, plus what the AI calls for this client cost.', source: 'Team hours and AI usage' },
  plan_to_date: { name: 'Plan to date', definition: 'The month plan split evenly over the days so far. Where the plan weights some days more, those days count more.' },
  month_goal: { name: 'Month goal', definition: 'The sales plan for the whole month.' },
  received: { name: 'Received', definition: 'Money from this client that reached the Ledger this month.', source: 'Ledger' },
  bill_status: { name: 'Status', definition: 'Paid: the fee for this month is in. Due: billed and not in yet. Not billed: the billing day has not come.' },
  share_of_sales: { name: 'Share', definition: 'This product\'s share of product sales in these dates.' },
  in_first_orders: { name: 'In first orders', definition: 'Share of this product\'s orders that were the customer\'s first order with the store. High means it brings in new people.' },
  from_new: { name: 'From new customers', definition: 'Sales from people ordering for the first time that day.', source: TW },
  discounts: { name: 'Discounts', definition: 'Money taken off by discount codes and automatic discounts that day.', source: 'The store' },
  campaign_sales_klaviyo: { name: 'Campaign sales', definition: 'Klaviyo\'s own count: orders within 5 days of an open or a click on the send. Snapshot uses Triple Whale\'s count, so the two can differ a little.', source: KL },
  sales_from_its_ads: { name: 'Sales from its ads', definition: 'Store sales Triple Whale credits to this platform, last click. Email and text count the orders their links brought in.', source: TW + ', last platform click' },
  bought_since: { name: 'Bought since', definition: 'Share of these new subscribers who have ordered since they joined.', source: KL + ' and the store' },
  list_size: { name: 'List size', definition: 'Everyone on the main newsletter list today who can still be sent to.', source: KL },
  new_customer_roas_plan: { name: 'New customer ROAS the plan needs', definition: 'Sales from first-time customers for every ad dollar the plan has to hit to reach its sales goal at its ad budget.', source: TW },
  growth_on_last: { name: "Growth on last month's sales", definition: 'How much higher than last month\'s store sales this option sets the goal.' },
  stock_call: { name: 'Call', definition: 'Watch: sells slowly, no action yet. Ease off ads: stock runs out before the restock lands. Push to clear: slow stock with money tied up, sell it with an offer. Safe to scale: enough stock for more ads.' },
  stock_lasts: { name: 'Stock lasts', definition: 'Days until this product runs out at the last 30 days\' sales rate. Red when under 30 days with no restock on the way.' },
};

/** dl('Store MER', 'mer') : a label with its definition. key: a DEF key, a defs.js key, or { name, definition }. */
export function dl(text, key) {
  const k = typeof key === 'string' && DEF[key] && !glossaryFor(key) ? DEF[key] : key;
  return defLabel(text, k || text);
}

/** The "Ask why" button: Ask Locus AI opens in place, with the page title, route, brand and dates. */
export function askWhy(ctx, title, label = 'Ask why') {
  return button(label, {
    aria: label + ': ask Locus AI about this page, it opens here',
    onclick: () => openAskPanel({ route: ctx.route, brand: ctx.brand || null, title, range: ctx.range, href: ctx.href('ask', 'index') }),
  });
}

/** The one quiet help row at the top of a page. */
export function helpBar(body, ...extra) {
  return h('div', { class: 'bz-bar' }, pageHelp({ body }), ...extra);
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov 1 to 22" (same month) or "Oct 28 to Nov 3" for the page head's range. */
export function rangeWords(ctx, own) {
  const r = (own && own.from && own.to) ? own : ctx && ctx.range; if (!r || !r.from || !r.to) return '';
  const [, fm, fd] = r.from.split('-').map(Number), [, tm, td] = r.to.split('-').map(Number);
  return fm === tm ? `${MON[fm - 1]} ${fd} to ${td}` : `${MON[fm - 1]} ${fd} to ${MON[tm - 1]} ${td}`;
}

addStyles('bz-css', `
.bz-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;min-width:0;margin-bottom:-6px}
.bz-bar .lx-chip{margin-left:auto}
.bz-chip{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;background:var(--bg-sunk);color:var(--muted);font-size:12px;font-weight:500;white-space:nowrap}
`);
