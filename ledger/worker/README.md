# Mobius Ledger — worker

Money in / money out, vendor rules, the recurring engine, receipts, month close
with frozen report cards, and the CPA pack. Phase 1 is manual mode by design —
Stripe/bank connectors are Phase 3, after Cole signs off on the app itself.

## Layout

```
ledger/
  index.html        the whole app (vanilla JS, one file, GitHub Pages)
  worker/
    wrangler.toml   worker name mobius-ledger, D1 binding DB, KV binding RECEIPTS
    schema.sql      D1 schema (idempotent)
    seed.sql        one-time Jan–Aug 2026 backfill from the Google Sheet
    src/worker.js   the API
```

## Setup (already done 2026-09-05)

```
npx wrangler d1 create mobius-ledger              # id in wrangler.toml
npx wrangler kv namespace create RECEIPTS         # id in wrangler.toml
npx wrangler d1 execute mobius-ledger --remote --file=schema.sql
npx wrangler d1 execute mobius-ledger --remote --file=seed.sql   # ONE TIME ONLY
npx wrangler secret put ADMIN_TOKEN               # random master key (set)
npx wrangler deploy
```

Optional, enables receipt reading (uploads work without it):

```
npx wrangler secret put ANTHROPIC_API_KEY
```

**Do NOT re-run seed.sql** — it INSERTs transactions and would double January–August.

## Auth

Google sessions minted by mobius-account-health are verified by calling its
`/api/me` — this worker holds NO copy of SESSION_SECRET on purpose. Fallbacks:
ADMIN_TOKEN, or the password set from the app's Settings page.

## Notes

- R2 was the plan for receipts but is not enabled on the Cloudflare account
  (API error 10042 — needs a dashboard opt-in). KV carries Phase 1 volume fine;
  receipts are downscaled client-side to ≤1800px JPEG before upload.
- Closed months are frozen: amounts/dates reject edits, report_json holds the
  report card as generated at close. Backfilled months (Jan–Jul) are `closed`
  with NULL report_json — the report endpoint computes those live from the
  imported rows, which cannot change while the month stays closed.
- Contractor payments were normalized to bucket `Contractors` on import; the
  sheet had them drifting between its Contractor and Payroll columns. Totals
  per month are identical to the sheet (verified to the cent, Jan–Jul).
- Deploy ONLY from this folder (`ledger/worker/`); dashboard deploys by
  committing `index.html` (GitHub Pages).
