# -*- coding: utf-8 -*-
"""The reviewer-facing testing instructions, checked against the 2800 char limit."""

TESTING = """Mobius Digital reports store profitability for merchants. It is read-only: it reads orders, products and customers through the Admin API and writes nothing back to the store.

WHERE THE APP LIVES
The app is not embedded in the Shopify admin. After a merchant approves the permission screen, the OAuth callback redirects them to their own reporting dashboard at tools.go-mobius-digital.com/profit/

TEST ACCOUNT
1. Open https://tools.go-mobius-digital.com/profit/
2. Click "Use a password instead" at the bottom of the sign-in box.
3. Enter the password below. Leave the Worker URL field as it is.
4. The account opens on a demonstration brand, Harborline Supply, with sample figures. It is read-only, so nothing can be changed or saved.

WHAT TO LOOK AT
- Overview: revenue, ad spend and contribution margin for the month to date, measured against the monthly plan.
- Profit: pick Harborline Supply in the top-right picker. Shows the full revenue-to-profit waterfall, revenue against ad spend day by day, and how a typical week runs.
- Customers: what a new customer costs to acquire, what their first order is worth, whether it pays that cost back, and lifetime value by cohort. Cohorts group customers by the month they first ordered.
- Plan: the month's revenue and ad spend target, and how the month is pacing against it.
- Costs: the product and delivery costs behind the margin, including a check on whether the cost data is trustworthy enough to report profit from.

INSTALLING ON YOUR OWN TEST STORE
Install URL: https://mobius-profit.mobius-digital.workers.dev/shopify/install?shop=YOUR-STORE.myshopify.com

Please note what you will see. This app is operated for a small number of agency retainer clients, and a reporting account is created for a brand before its store is connected. Installing on a store we have not set up reporting for therefore lands on a page saying the store is connected but is not matched to a reporting account yet. That is the intended behaviour for an unknown store, not an error. The demo account above is the way to see the working product.

CUSTOMER DATA
No customer names, email addresses, postal addresses or phone numbers are read or stored. Customer data is aggregated as it is read and only monthly totals are written to our database. Cohort figures come from ShopifyQL aggregate queries, which is why read_reports is requested."""

print('Testing instructions: %d/2800 chars' % len(TESTING))
print()
print(TESTING)
