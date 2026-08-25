# Marketing Hub — instructions for Claude Code

Multi-tenant marketing calendar: ONE Next.js-on-Cloudflare worker serving
every brand at /b/<brand>/, one D1 database (`marketing-hub`), brands as rows.
Read README.md first. This is Mobius's own product — there is no client
handoff of this folder.

Key invariants:

- The middleware stamps `x-brand-id` after checking access; `currentBrandId()`
  in lib/brandContext.ts is the only place the brand may come from. Never
  trust a brand slug from a request body or query string.
- Every data table carries brand_id; every new query must filter on it.
  Settings rows with brand_id '*' are the hub's own (session key, Google
  client ID) — never a brand's.
- Agency admins = memberships rows with brand_id '*'. There are no other
  roles; inside one brand, anyone past the gate can edit anything.
- Brand look comes from the brands row at request time. brand.config.ts is
  only the default palette (front door, admin, offline) and the Brand type.
- Dates are YYYY-MM-DD strings; never introduce Date round-trips.
- The cron trigger in wrangler.jsonc stays commented out until this worker
  takes over the `launch-calendar` name at cutover (free-plan cron cap).
  worker-entry.js already loops every brand per tick.
- Deploy: `npm run deploy`. If the build fails with EPERM/EBUSY on .next,
  OneDrive is holding a file — `rm -rf .next` and retry.
