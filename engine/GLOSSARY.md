# Glossary

One word per idea. Engine code, comments, docs and screens use these words and no other for the same thing.
The numbers themselves are defined in `worker/src/numbers/catalog.js` and served by `GET /v1/metrics/definitions`.

## People and access

| Word | Means | Not |
|---|---|---|
| org | the agency that runs the engine | account, tenant |
| brand | one client business. Has one `brand_id` | account, client, shop |
| brand_id | the id of a brand, `brand_...`. Old answers carry it under the key `act_id` | act, account id |
| alias | any other id a brand answers to: an old id, an ad account id, a slug | legacy id |
| caller | who is asking, worked out once per request | user, session |
| owner | the one person who may do everything, or the admin key | admin, master |
| team | a signed in teammate of the org | staff, admin |
| view only | a teammate who may read and change nothing | viewer role |
| limited | a teammate with a brand list, who reaches only those brands | restricted |
| client | a login that belongs to a brand, closed by default | customer, guest |
| nobody | no session, or one the old side does not know | anonymous |
| scope | the brands one request is held to, worked out by the access check | filter, tenant |

## The engine

| Word | Means | Not |
|---|---|---|
| engine | this worker | v2, new backend |
| old engine, old workers | the two workers that ran before and still run | legacy app |
| pw | the old profit worker. Paths under `/pw/...` | |
| ah | the old account-health worker. Paths under `/ah/...` | |
| kernel | `worker/src/platform/`: the only way to route, check, read, write, forward and log | core, framework |
| group | one folder of routes for one part of the product (orgs, brands, metrics and so on) | module, domain folder |
| route row | one entry in the route table: method, path, access, input, handler, doc, source | endpoint |
| route key | method, a space, the path. `GET /pw/api/costs` | |
| handler | the function that answers a route. Takes `ctx` and `input`, returns a plain object | controller |
| data door | `platform/db.js`, the only file that talks to the database | repository, ORM |
| statement | one named SQL entry in a group's `queries.js` | query string |
| ported | answered by engine code from the shared database | migrated |
| forwarded | sent on to an old worker by the kernel as the same person, after the access check | proxied |
| piped | sent to an old worker untouched, with no check here: mode old, a path with no row, a route switched back | passthrough |
| borrowed | one field a ported route takes from one old GET | |
| fallback | a ported read that broke and was forwarded for that one request | |
| flag | `engineMode` in the settings table: `new` or `old` | feature flag |
| switched back | a route key in `engineForward`: piped even in mode new | |
| compare | ask both engines the same question at the same moment and list the differences | diff test |
| meta | what the engine adds to an answer: who answered, the source, the window, as of when | envelope |

## Time

| Word | Means | Not |
|---|---|---|
| day | `YYYY-MM-DD` in the brand's own time zone | date, timestamp |
| from, to | whole days, both counted | start, end |
| window | from and to. It ends yesterday unless today is named | range, period |
| today | the brand's own today. Served live by the old engine, never from stored rows | |

## Numbers

The short list. The full list with formula and source is the definitions file.

| Word | Means | Not |
|---|---|---|
| gross_sales | products at full price, before anything comes off | gross revenue |
| discounts | what came off through codes and sale prices | |
| returns | money given back for returned or refunded orders | refunds |
| order_revenue | what customers paid, with shipping and tax, before returns | total sales |
| total_sales | what customers paid, with shipping and tax, after returns | order revenue |
| tax | sales tax collected, never revenue | |
| shipping | shipping charged to customers. Already inside total sales and revenue | shipping cost |
| revenue | total sales after returns, minus tax. The headline number. Old key `sales` | net sales, sales |
| revenue_before_returns | order revenue minus tax. Its own number, shown on no page today | |
| net_sales | revenue minus shipping charged | revenue |
| orders | orders placed | purchases |
| new_customers | first orders. Old key `new_orders` | |
| returning_customers | orders minus new customers | |
| spend | ad spend on one platform | cost |
| spend_all | ad spend on every platform plus extra ad costs. Old key `spend` | blended spend |
| roas | revenue credited to ads on one platform, divided by its spend. Credit comes from the tracker | platform ROAS |
| mer | revenue divided by spend_all | blended ROAS |
| new_customer_mer | new customer revenue divided by spend_all. Old key `amer` | aMER |
| cac | spend_all divided by new customers | |
| cpa | spend divided by the orders credited to it | cost per purchase |
| aov | revenue divided by orders | |
| gross_profit | revenue minus the costs of every order. Shown as "Profit before ads" | margin |
| profit_after_ads | gross_profit minus spend_all. Old key `cm` | contribution margin |
| net_profit | profit_after_ads minus fixed costs. Old key `net` | |
| tracker | the outside tool whose daily rows hold store sales and ad credit | |

A number that is not known is `null`, never 0.
