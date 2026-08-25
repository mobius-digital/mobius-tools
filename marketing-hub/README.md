# Marketing Hub

One deployment, every brand. The multi-tenant successor to the per-brand
`launch-calendar/` deploys: brands are database rows, people are memberships,
and a client's board lives at `/b/<brand>/` behind one URL.

**Live (test):** https://marketing-hub.mobius-digital.workers.dev
**Cutover plan:** deploy this code as the worker named `launch-calendar` to
take over the original URL (which keeps Google sign-in's registered origin,
the team's bookmarks, and the account's cron slot).

## How it works

- `middleware.ts` is the gate: it works out the brand from the path, checks
  the caller (Google membership, or that brand's team-password cookie), and
  stamps `x-brand-id` — which `lib/brandContext.ts` then treats as the single
  source of brand truth for every query.
- `brands` table = what `brand.config.ts` used to bake in per deploy
  (colours, font, names, logo, icons). `app/b/[brand]/layout.tsx` turns it
  into CSS variables per request.
- `memberships` = who can open what. Brand `*` marks an agency admin: every
  board, plus `/admin` (the Clients screen) where adding a client is an
  insert — the board exists in under a second.
- One cron tick loops every brand (see `worker-entry.js`). The trigger is
  commented out in `wrangler.jsonc` until cutover frees the account's slot.
- Icons are rasterised in the browser when a client is created; per-brand
  manifest/icons/logo are served under `/b/<brand>/…` so each brand installs
  to a phone as its own app.

## Commands

```bash
npm test          # unit tests
npm run typecheck
npm run deploy    # build + publish the hub worker
```

Migrated from the live single-brand board 2026-08-25
(`launch-calendar` D1 → brand `lucky-golf` here). The old per-brand
deploys, the standalone console and the provisioning pipeline are superseded
by this and can be retired after cutover.
