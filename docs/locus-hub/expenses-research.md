# Brand costs: how the profit tools do it (2026-10-10)

Cole's ask: brand expenses should work like the tools we compare to, Triple Whale first, and the brand should be able
to add its own. Read from each tool's own help centre on 2026-10-10.

## Triple Whale (Settings > Cost Settings)

- **Product cost (COGS)**: imported from Shopify's cost per item; editable per product and per variant in Triple Whale
  (optionally written back to Shopify, "Bi-Directional COGS"). Refunds keep the original COGS on the refund day.
- **Shipping**: four ways. Use the Shopify shipping charge as the cost; a shipping integration (ShipBob, ShipStation...)
  per order; a CSV of order_id + shipping_cost; or flat rates per order or per country (profiles).
- **Handling**: per product, or one fixed fee per order.
- **Payment gateways**: per gateway, a % plus a flat fee per order.
- **Custom expenses**: name, amount, category (optional, made on the fly), a date range, fixed (recurring at a cadence
  of days or months, spread over the range) or variable (moves with ad spend). **"Ad spend"** switch: the amount is
  added to blended ad spend for ROAS and MER, and can be assigned to a source or campaign (channels with no API).
  Editing an expense changes past, present and future data. Net profit = sales minus blended ad spend minus expenses
  minus refunds.

## BeProfit

- Operational expenses: label, category, amount, payment date, recurrence (one time or recurring), status (active,
  ended, active with an end date).
- Variable expenses: a % of order revenue (or returns) or a fixed amount per order, allocated to the metric you choose;
  "contra" variable expenses are credits. Marketing expenses are their own group.

## Lifetimely (AMP)

- Custom one-time or recurring costs on the P&L; custom costs can also be a % of sales or of other costs.

## What Locus does now (Brand settings > Data and costs > Costs, and P&L > Costs)

| | Triple Whale | Locus |
|---|---|---|
| Product cost, shipping, handling, gateways | set in TW Cost Settings | read from TW; the Costs page shows each one's last 30 days, its source, what is missing, and links to TW. No second editor (hard rule: the brand configures these in TW) |
| Flat margin instead of costs | no | the margin override, named on the page when set |
| Custom expense: fixed recurring | yes, cadence in days or months | fixed every month, spread over the month's days |
| One time | a fixed expense over one date | one time, on a date |
| % of revenue / % of ad spend / per order | variable (with ad spend) | all three |
| Categories | optional, user-made | six fixed: team, software, rent, agency fees, marketing other, other |
| "Is ad spend" | adds to blended spend (ROAS, MER), source/campaign pick | adds to blended spend (MER, aMER, CAC, CM), shown as its own line on the spend and margin drill-downs; no source/campaign split |
| Start and end dates | yes | yes |
| Who edits | anyone on the shop | the team on any brand; a client login on its own brand with P&L on; "Added by" on each row |
| Net profit | sales - ad spend - expenses - refunds | contribution margin - custom expenses (CM already takes off product, delivery, handling, fees, ad spend) |

Not copied on purpose: per-country shipping profiles and gateway rates (they live in TW, the brand's source), and
assigning an ad-spend expense to a TW source or campaign (Locus has no per-source spend for it to join yet).
