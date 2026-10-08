# Brand-first phase 3: the code sweep (spec)

Read `account-health/worker/src/brands.js` (the PHASE 3 section at the end) first. The data migration is
`account-health/worker/scripts/phase3-migrate.mjs`; this spec is what the CODE must do so it matches.

## The model after the switch

- **Brand id** = `brand_<slug>` (e.g. `brand_lucky_golf`, `brand_party_patch`, `brand_speedin`). Every
  brand-owned table keeps its column NAME `act_id` (or `act`) but the VALUE is now the brand id.
  Variable names like `act`, `actId`, `acct.act_id`, `S.act` keep their names; they now hold brand ids.
- **Meta's own data stays on the Meta ad account id** (`act_123...`). `META_TABLES` =
  `accounts, activities, ad_daily, ads, daily_insights, hourly_insights, meta_adsets, meta_campaigns`.
  A brand can have several Meta accounts (connections kind `meta`). To read a brand's Meta data:
  `WHERE act_id IN ${metaOf(n)}` where `?n` is bound to the BRAND id. `metaOf` is exported from brands.js:
  `(SELECT external_id FROM connections WHERE brand_id = ?n AND kind = 'meta')`.
- **`brand_accounts` VIEW** = each brand shaped like the old `accounts` row: `act_id` (= brand id),
  `brand_id`, `name, currency, tz, active, status, monthly_budget, budgets_json, goals_json, target_cpa,
  target_roas, slack_channel (internal), brief_channel (client), tw_shop, google_spend_json,
  brief_enabled, brief_review, review_first, report_config_json, demo, tw_attr_cursor, tw_attr_done,
  storage_prefix, slug`, plus the PRIMARY Meta account's sync state `meta_act, last_sync_insights,
  last_sync_activities, last_error, account_status, ads_backfill_done, ads_video_*, ads_metrics_*`.
  `meta_act` is NULL for a brand with no Meta account (SpeedIn).
- **`accounts` table** = one row per Meta ad account: sync state only. Its brand columns are dead.
- **`brands` table** holds brand settings. Columns: `id, slug, name, status ('active'|'paused'|'demo'),
  tz, currency, internal_channel, client_channel, legacy_key, source, monthly_budget, budgets_json,
  goals_json, target_cpa, target_roas, google_spend_json, brief_enabled, brief_review, review_first,
  report_config_json, tw_attr_cursor, tw_attr_done, storage_prefix, created_at, updated_at`.
- **Connections** (`connections` table): `triple_whale` (external_id = the shop domain), `meta`,
  `google_ads`/`ga4`/`gsc`, `tiktok`, `klaviyo`, `asana`, `drive`, `frame`, `shopify`.

## Rules for every SQL site

1. **Reads of brand info** `FROM accounts` / `JOIN accounts` → `FROM brand_accounts` / `JOIN brand_accounts`
   (same column names). Exception: code that is about a META ACCOUNT's sync state by Meta id (the
   Meta sync itself, discovery) keeps `accounts`.
2. **Writes of brand settings** (`UPDATE accounts SET goals_json/target_cpa/slack_channel/brief_channel/
   brief_enabled/name/tz/active/monthly_budget/budgets_json/report_config_json/tw_attr_*/...`) →
   `UPDATE brands SET ...` with `WHERE id = ?`. Column renames: `slack_channel` → `internal_channel`,
   `brief_channel` → `client_channel`, `active` (0/1) → `status` ('active'/'paused'), `demo` → status 'demo'.
   `tw_shop` is a connection: write it with `setTripleWhale(env, brandId, shop)` (brands.js; add it if
   missing: upsert/delete the `triple_whale` connection for that brand).
3. **Writes of Meta sync state** (`last_sync_insights, last_sync_activities, last_error, account_status,
   ads_backfill_done, ads_video_*, ads_metrics_*`) stay `UPDATE accounts ... WHERE act_id = <META id>`.
4. **Meta tables queried by brand** (`daily_insights`, `hourly_insights`, `activities`, `ads`, `ad_daily`,
   `meta_campaigns`, `meta_adsets`): `act_id = ?n` (n bound to a brand id) → `act_id IN ${metaOf(n)}`.
   Aggregates then sum across a brand's Meta accounts, which is intended. Where a query GROUPs or
   returns `act_id` from a Meta table to the caller as the brand, map it back (select the brand id, e.g.
   join connections or just return the brand id the caller passed).
5. **JOINs between a Meta table and a brand table on act_id are now wrong** (different ids). Example:
   `tw_ad_attr t JOIN ads a ON a.act_id = t.act_id AND a.ad_id = t.ad_id`. Rewrite to join on the ad id
   and restrict the Meta side with `a.act_id IN ${metaOf(n)}` (or join connections). Find every one.
6. **Brand-owned tables** (everything else: briefs, reports, tw_*, p_*, idea_*, app_log, settings keys)
   keep `act_id = ?` exactly as is; they now just receive brand ids.

## Meta API calls

Every Graph call built from `${act}/...` / `${acct.act_id}/...` must use the META id:
- inside the Meta sync (rows from `metaSyncRows(env)`, where `act_id` IS the Meta id) nothing changes;
- anywhere a brand id is in hand, use `acct.meta_act` (one) or loop the brand's Meta connections
  (`SELECT external_id FROM connections WHERE brand_id = ? AND kind = 'meta'`). No Meta account =
  skip / say "No Meta ad account connected", never call Meta with a brand id.
- Ads Manager URLs (`act.replace(/^act_/, '')`) use the Meta id (`meta_act`).

## Scheduled jobs / loops

- `listAccounts(env, activeOnly)` reads `brand_accounts` (it returns brands; `act_id` = brand id).
- The Meta sync loops (`syncPass`, nightly Meta parts, `adRetryPass`, structure sync, hourly pacing)
  iterate `metaSyncRows(env)` (Meta accounts) instead. Functions that do BOTH Meta and brand work for
  one account (e.g. a sync that also writes tw_daily) must use the brand id (`row.brand_id`) for brand
  tables and the Meta id (`row.act_id`) for Meta tables/calls.
- Triple Whale syncs iterate brands (`listAccounts`) with a `tw_shop`; brands without one are skipped.
- Every loop over brands that needs Meta must skip brands whose `meta_act` is null (SpeedIn).
- The registry mirror `syncRegistry` is RETIRED: remove it from the hourly tick and the PUT route.

## Ids that arrive from outside

- Route regexes like `/^\/api\/accounts\/(act_\d+)$/`, `/^act_\d+$/`, `/^act_|^asana_/` must accept brand
  ids. Use `isBrandId` / `resolveBrandId(env, id)` (brands.js). Old ids (act_, asana_, demo_harborline)
  must still work: resolve them with `resolveBrandId` and carry on with the brand id.
- `?act=` on any request: both workers normalize it once at the top of `fetch` (an old id → the brand id)
  so handlers see brand ids. Bodies with `act`/`act_id` from old clients: resolve where read.
- Slack button values carrying `a`/`act`, Asana webhook `?act=`, Supply's `brands.act_id`: resolve with
  `resolveBrandId` where read.
- The public `/assets-img/<id>/<file>` route accepts a brand id and reads R2 under the brand's
  `storage_prefix` (old act id) when set.

## R2 (files)

Files are NOT moved. Every R2 key built from a brand id (`studio/${act}/...`, `assets/${act}/...`,
`amb/${act}/...`, `onboard/${act}/...`) must build from the brand's `storage_prefix || id`. Keys already
stored in rows (`file_key`, paths in JSON) are used as stored.

## Demo

`demo_harborline` is now `brand_harborline_supply` (status 'demo'). Any literal `demo_harborline` in code
becomes a lookup of the brand with status 'demo' (or the new id).

## Strategist (strategist.js)

Its schema text / RULES that describe tables must say: brand-owned tables use the brand id; Meta tables
use Meta account ids and a brand's are `SELECT external_id FROM connections WHERE brand_id = ? AND kind
= 'meta'`; brands come from `brand_accounts`. Its `locusBrands` shim from phase 2 goes away (the view
includes every brand).

## Do not

- Do not rename columns or tables. Do not touch files outside your assigned list.
- Do not change behaviour beyond the id switch. No refactors, no new features.
- Do not deploy. Do not run anything against the live database.
- No em dashes in any comment or string you write.

## When done

`node --check` every file you changed; run the tests that exist for your files
(`account-health/worker/test-*.mjs`, `profit/worker/test-*.mjs` if any) and fix what YOUR change broke
(test fixtures load `schema.sql`, which now has the view; seed `brands` + `connections` rows where a
test seeds `accounts`). Report: files changed, every site you were unsure about (file:line + why), and
test results.
