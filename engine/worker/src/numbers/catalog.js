/* What each number means, once. The screens show `definition` on hover and GET /v1/metrics/definitions
   serves this list. Ported from the old money model without changing a result.
   id       the engine's name for the number
   name     what a person reads
   definition  one or two plain sentences
   formula  the sum in words
   source   where the figures come from
   unit     money | count | ratio | share | days
   returns  'after' (returns taken off), 'before' (returns still in), or 'na'
   old_keys the keys the old answers carry this number under (they stay, the screens need no change) */
// from profit/worker/src/worker.js (the money model, dayEconomics, totals), hub.js (storeRoll), expenses.js

const TRACKER = 'the tracker rows in the shared database (tw_daily), one value per brand, day and measure';
const D = (id, name, unit, returns, definition, formula, source, old_keys) =>
  Object.freeze({ id, name, unit, returns, definition, formula, source, old_keys: Object.freeze(old_keys) });

const SALES = [
  D('gross_sales', 'Gross sales', 'money', 'before',
    'What the products sold for at full price, before anything is taken off. No discounts, returns, shipping or tax.',
    'price times quantity for every item ordered', `${TRACKER}, measure totalNewGrossSales`, ['gross']),
  D('discounts', 'Discounts', 'money', 'na',
    'How much came off the full price through codes and sale prices.',
    'gross sales + shipping charged + tax charged - order revenue, never below 0', `${TRACKER}, worked out from four measures`, ['discounts']),
  D('returns', 'Returns', 'money', 'na',
    'Money given back to customers for returned or refunded orders in the period.',
    'order revenue - total sales - (tax charged - tax kept), never below 0', `${TRACKER}, worked out from four measures`, ['returns']),
  D('order_revenue', 'Order revenue (before returns)', 'money', 'before',
    'Everything customers paid for orders placed in the period, with shipping and tax, after discounts. Returns are still in it.',
    'gross sales - discounts + shipping charged + tax charged', `${TRACKER}, measure totalSales`, []),
  D('total_sales', 'Total sales (after returns)', 'money', 'after',
    'Everything customers paid, with shipping and tax, after discounts and after returns. This is the store\'s own "total sales" line.',
    'order revenue - returns', `${TRACKER}, measure netSales (the tracker titles it Total Sales)`, ['total_sales']),
  D('tax', 'Tax', 'money', 'after',
    'Sales tax collected for the state, after tax on returned orders is given back. It is not the brand\'s money, so it never counts as revenue.',
    'tax charged - tax refunded', `${TRACKER}, measure totalNetTaxes`, ['tax', 'taxes']),
  D('shipping', 'Shipping charged', 'money', 'na',
    'What customers paid for shipping. It is already inside total sales and revenue, so it is never added again.',
    'the shipping lines of every order', `${TRACKER}, measure totalShippingPrice`, ['ship_rev', 'shipping']),
  D('revenue', 'Revenue (after returns)', 'money', 'after',
    'The headline sales number: what customers paid after discounts and returns, with shipping, without tax. Every page that says sales or revenue shows this one.',
    'total sales (after returns) - tax', `${TRACKER}, measures netSales and totalNetTaxes`, ['sales', 'revenue']),
  D('revenue_before_returns', 'Revenue (before returns)', 'money', 'before',
    'The same headline number with returns still in it. Kept as its own number so the two are never mixed. No page shows it today.',
    'order revenue - tax charged', `${TRACKER}, measures totalSales and totalTaxes`, []),
  D('net_sales', 'Net sales', 'money', 'after',
    'Product sales alone: after discounts and returns, without shipping and without tax.',
    'revenue - shipping charged', `${TRACKER}, worked out`, ['net_sales']),
];

const ORDERS = [
  D('orders', 'Orders', 'count', 'na',
    'How many orders were placed in the period.', 'a count of orders', `${TRACKER}, measure totalOrders`, ['orders']),
  D('new_customers', 'New customers', 'count', 'na',
    'Orders from people buying from the brand for the first time. One first order is one new customer.',
    'a count of first orders', `${TRACKER}, measure newCustomersOrders`, ['new_orders']),
  D('returning_customers', 'Returning customers', 'count', 'na',
    'Orders from people who had bought before.', 'orders - new customers', `${TRACKER}, worked out`, ['returning_orders']),
  D('new_share', 'New customer share', 'share', 'na',
    'The part of revenue that came from first time customers.',
    'new customer sales divided by (new customer sales + returning customer sales)', `${TRACKER}, measures newCustomerSales and rcRevenue`, ['new_share']),
  D('new_revenue', 'New customer revenue', 'money', 'after',
    'Revenue from first time customers.', 'revenue times new customer share', `${TRACKER}, worked out`, ['new_rev', 'new_revenue']),
  D('returning_revenue', 'Returning customer revenue', 'money', 'after',
    'Revenue from people who had bought before.', 'revenue times (1 - new customer share)', `${TRACKER}, worked out`, ['ret_rev', 'returning_revenue']),
  D('aov', 'Average order value', 'money', 'after',
    'What one order is worth on average.', 'revenue divided by orders', `${TRACKER}, worked out`, ['aov']),
  D('new_aov', 'New customer order value', 'money', 'after',
    'What a first order is worth on average.', 'new customer revenue divided by new customers', `${TRACKER}, worked out`, ['new_aov']),
  D('units', 'Units', 'count', 'na',
    'How many items were ordered.', 'a count of items across all orders', `${TRACKER}, measure totalOrdersCombinedItemsQuantity`, ['units']),
  D('units_per_order', 'Units per order', 'ratio', 'na',
    'How many items are in an order on average.', 'units divided by orders', `${TRACKER}, worked out`, ['upo']),
  D('email_revenue', 'Email revenue', 'money', 'na',
    'Sales the email tool takes credit for.', 'the email tool\'s placed order sales', `${TRACKER}, measure klaviyoPlacedOrderSales`, ['email_rev', 'email']),
  D('email_share', 'Email share', 'share', 'na',
    'The part of revenue the email tool takes credit for.', 'email revenue divided by revenue', `${TRACKER}, worked out`, ['email_share']),
  D('sessions', 'Sessions', 'count', 'na',
    'Visits to the store. An estimate, worked out from ad spend and the tracker\'s cost per visit.',
    'for each day: ad spend divided by cost per session, then added up', `${TRACKER}, measures blendedAds and pixelCostPerSession`, ['sessions']),
  D('conversion', 'Conversion rate', 'share', 'na',
    'The part of visits that ended in an order.', 'orders divided by sessions', `${TRACKER}, worked out`, ['conversion']),
];

const ADS = [
  D('spend_all', 'Ad spend', 'money', 'na',
    'Everything spent on ads across every platform, plus extra ad costs the team marked as ad spend.',
    'the tracker\'s blended ad spend (or Meta + Google when it is missing) + extra ad costs',
    `${TRACKER}, measure blendedAds. Meta spend from daily_insights and Google from ga_adCost as the fallback. Extra costs from the expenses table`, ['spend']),
  D('platform_spend', 'Platform ad spend', 'money', 'na',
    'What the ad platforms alone charged, without extra ad costs.', 'ad spend - extra ad costs', 'the same rows as ad spend', ['base_spend']),
  D('ad_expense', 'Extra ad costs', 'money', 'na',
    'Costs the team added by hand and marked "counts as ad spend", such as a creator fee.',
    'the expenses marked as ad spend, spread over their days', 'the expenses table', ['ad_expense']),
  D('spend', 'Spend (one platform)', 'money', 'na',
    'What one ad platform charged in the period.', 'the platform\'s own spend, added up by day',
    'the platform\'s daily rows in the shared database (Meta: daily_insights)', ['meta_spend', 'google_spend']),
  D('mer', 'MER', 'ratio', 'after',
    'Dollars of revenue for each dollar of ad spend, for the whole store. It does not care which ad got the credit.',
    'revenue divided by ad spend', 'revenue and ad spend, as defined here', ['mer']),
  D('new_customer_mer', 'New customer MER', 'ratio', 'after',
    'Dollars of first time customer revenue for each dollar of ad spend. It shows whether ads are finding new buyers.',
    'new customer revenue divided by ad spend', 'new customer revenue and ad spend, as defined here', ['amer']),
  D('roas', 'ROAS', 'ratio', 'na',
    'Dollars of revenue credited to ads on one platform for each dollar spent there. The credit comes from the tracker, not from the platform.',
    'revenue credited to the ads divided by their spend',
    'the tracker\'s ad credit rows (tw_ad_attr, last platform click) and the platform\'s spend', ['roas']),
  D('cac', 'CAC', 'money', 'na',
    'What it cost in ads to win one new customer.', 'ad spend divided by new customers', 'ad spend and new customers, as defined here', ['cac']),
  D('cpa', 'Cost per order', 'money', 'na',
    'What one ad, ad set or platform spent for each order credited to it.',
    'spend divided by the orders credited to it', 'the tracker\'s ad credit rows and the platform\'s spend', ['cpa']),
  D('cpm', 'CPM', 'money', 'na',
    'What a thousand ad views cost.', 'spend divided by impressions, times 1,000', 'the ad platform\'s own delivery rows', ['cpm']),
  D('ctr', 'CTR', 'share', 'na',
    'The part of ad views that were clicked.', 'clicks divided by impressions', 'the ad platform\'s own delivery rows', ['ctr']),
];

const PROFIT = [
  D('cogs', 'Product cost', 'money', 'na',
    'What the goods that were sold cost to make or buy.',
    'the brand\'s own cost rule when one applies on the day, else the tracker\'s product cost', `the cost rules table, else ${TRACKER}, measure totalProductCosts`, ['cogs']),
  D('ship_cost', 'Shipping cost', 'money', 'na',
    'What it cost the brand to ship the orders.',
    'the brand\'s own shipping rule when one applies on the day, else the tracker\'s shipping cost', `the cost rules table, else ${TRACKER}, measure totalShippingCosts`, ['ship_cost']),
  D('handling', 'Handling', 'money', 'na',
    'Pick and pack fees.', 'the tracker\'s handling fees', `${TRACKER}, measure totalHandlingFees`, ['handling']),
  D('fees', 'Payment fees', 'money', 'na',
    'What the payment companies kept.', 'the tracker\'s payment gateway costs', `${TRACKER}, measure totalPaymentGatewayCosts`, ['fees']),
  D('gross_profit', 'Profit before ads', 'money', 'after',
    'What is left of revenue after the costs that rise with every order: product, shipping, handling and payment fees. Ads are not taken off yet.',
    'revenue times the margin set for the month when one is set, else revenue - product cost - shipping cost - handling - payment fees',
    'revenue and the four costs, as defined here. The month margin comes from the brand\'s goals', ['gross_profit']),
  D('margin', 'Margin', 'share', 'after',
    'The part of revenue that is left before ads.', 'profit before ads divided by revenue', 'worked out', ['margin']),
  D('profit_after_ads', 'Profit after ads', 'money', 'after',
    'What is left after the costs of every order and after ad spend. Rent, pay and software are not in it.',
    'profit before ads - ad spend', 'worked out', ['cm']),
  D('fixed_costs', 'Fixed costs', 'money', 'na',
    'Costs that do not rise with orders, added by hand: rent, pay, software, retainers.',
    'the expenses not marked as ad spend, spread over their days', 'the expenses table', ['fixed']),
  D('net_profit', 'Net profit', 'money', 'after',
    'What is left after everything: order costs, ad spend and fixed costs.',
    'profit after ads - fixed costs', 'worked out', ['net']),
];

export const DEFINITIONS = Object.freeze([...SALES, ...ORDERS, ...ADS, ...PROFIT]);

const BY_ID = new Map(DEFINITIONS.map(d => [d.id, d]));

export const definitionOf = id => BY_ID.get(id) || null;
