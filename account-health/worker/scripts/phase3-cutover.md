# Phase 3 cutover (brand-first)

Order matters. Do it between :10 and :50 past the hour so no hourly tick lands mid-switch.

1. Staging passed: `scripts/phase3-migrate.mjs --db=<staging>`, new code on the staging workers,
   before/after capture diff clean (scratchpad capture.mjs, cap-old vs cap-new).
2. Restore point: `npx wrangler d1 time-travel info mobius-account-health` -> note the bookmark.
3. Migrate production: `node scripts/phase3-migrate.mjs --db=93e7cdeb-19a9-4950-8146-e24b189f410f`
4. Deploy immediately, in this order: account-health worker, profit worker, Locus front end (commit/push
   for GitHub Pages), Supply worker.
5. Supply data: `UPDATE brands SET act_id = 'brand_lucky_golf' WHERE id = 'lucky'` on mobius-supply.
6. Smoke: /slack/owns for an internal channel; GET /api/accounts shows brand ids with meta_act; open Locus
   for Lucky (Overview, Meta tab, Brief, Reports, Studio); the next hourly tick's lastHourly has no errors.
7. Rollback: `npx wrangler d1 time-travel restore mobius-account-health --bookmark=<step 2>` and redeploy
   the previous worker versions (`npx wrangler rollback` in each worker folder).
restore bookmark before phase 3: 00000d47-000000b0-000050fe-6ff2c5dc84c53098b98060602d7079d1
