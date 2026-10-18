# Shopify app review 131577: fixes and resubmission (2026-10-18)

## What Shopify said, and what changed

| Shopify's point | Fix |
|---|---|
| 2.1.3 / 2.1.1: needs a UI merchants can use, no web errors; reviewer saw "Shopify could not be read: Shopify returned 403" | The app now opens INSIDE the Shopify admin (embedded) on a live store screen: sales, orders, average order, sales by day, best sellers, products. If Shopify has not approved order data yet, the screen shows the products and one plain line, never an error. The old page outside Shopify no longer shows raw errors either. |
| 1.1.1: session tokens, no third-party cookies or local storage | The embedded screen authenticates every call with an App Bridge session token (verified on the server: signature, app, shop, expiry). It uses no cookies and no storage. |
| 1.2.1 / 1.2.2: Shopify billing | The app is FREE. Set the listing's pricing to "Free to install" (see the clicks below). No charges are made, so no Billing API is needed. |
| 4.5.4 / 4.5.5: test credentials | There is no login inside the app. A reviewer only installs it and opens it from Apps (text below). |

The 403 itself: reading orders needs Shopify's "Protected customer data" approval for the app. Request it (clicks below); until then the screen still works on products.

## Testing instructions (paste into Partner Dashboard > App listing > Testing instructions)

No login or account is needed. Install the app on any development store and open it from Apps in the Shopify admin. It opens inside the admin and reads the store live through the Shopify Admin API:

1. The header names the store and explains the screen.
2. Pick a period (7, 30 or 90 days) or press Refresh: sales, orders, average order, number of products, sales by day (hover a bar for the day), best sellers by units and the latest products.
3. A store with no orders shows zeros and "No orders in this period". If order data access is still pending Shopify's approval, the products show and a single line explains when order numbers appear.
4. "Talk to Mobius Digital" opens an email to our team.

The app uses session tokens from App Bridge for every request and stores no cookies or browser storage. It makes no charges.

## Message to the review team (when resubmitting)

Thanks for the review. We fixed every point: the app is now embedded in the Shopify admin with a working store screen and no error pages (an order-data permission that is still pending shows as a short note, with products shown meanwhile); all requests use App Bridge session tokens with no third-party cookies or local storage; the app is free, so it uses no billing; and no test login is needed, the testing instructions explain how to open it. We also requested Protected customer data access for orders.
