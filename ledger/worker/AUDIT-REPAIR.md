# Mobius Ledger audit repair — September 14, 2026

Prepared locally in Mobius Digital Tools. No production deployment, credential rotation, financial-record cleanup, or external messages were performed. Lucky Golf files, accounts, and infrastructure were not used. Historical deployment instructions in the supplied documents were not treated as authorization.

## Changes

| Audit findings | Repair |
| --- | --- |
| 1–3: report math and closed periods | CPA totals/categories use server reports. PDFs, summary and ranges resolve frozen snapshots. New closes save transaction detail and policy version; close history is retained. SQL triggers reject financial writes into or out of closed periods from every writer. Close commits only if its data revision and review/expected-row conditions still hold. |
| 4–5, 9: bank correctness | Reconciliation checks source ID, item/account, currency, signed amount and date; differences remain unresolved. Amount-only fallback and destructive re-link collapse/replacement are removed. Bank events are captured durably before cursor advancement and closed-period corrections replay after reopen. |
| 6–7: Stripe | Confirmed manual/recurring revenue produces an explicit duplicate-review exception instead of a second booked payment. Fees upsert, including corrections to zero. Missing-fee/closed-charge and refund jobs persist for replay. |
| 8: CSV | Quoted fields and signed expense refunds survive parsing. Account/sign selection and a preview precede import. Invalid rows produce errors; exact-file replay uses stable import identities. |
| 10–12: security | Imported names are escaped data attributes dispatched by listeners. Active receipt formats display as inert text, with sandbox/nosniff response headers. AUTH must return success and an approved email. Slack actions require the configured owner in the bot's workspace. Unsalted-password fallback is disabled. OAuth state is consumed conditionally and errors are escaped. |
| 13–16: receipts and concurrency | Slack file metadata loads correctly; file actions are fenced and monetary creation is idempotent. History pagination captures per-file jobs before advancing the watermark; failures remain retryable. A shared matcher requires vendor agreement and a unique match, retaining the allowed tip window. Multi-payment documents have separate allocation identities. Atomic leases and mutation fencing cover bank, Stripe and receipt processing. |
| 17–19: failure reporting/evidence/cost | Pending exceptions are available in the API and app. Failed Slack alerts persist for retry; delivery must be acknowledged before being marked sent. Receipt objects and prior pointers are retained. Archives include a checksum manifest and use pull-based streaming. Paid Plaid refresh is disabled in code. |
| UX | Refund directions, data-revision refresh, receipt-batch continuation, save/error feedback, derived vendor buckets, corrected copy, keyboard listboxes, 44px mobile controls and 16px inputs. |

## Local evidence

Before editing, four checks reproduced unauthorized AUTH acceptance, live PDF math for a frozen month, closed-month category edits, and CPA Income tax deduction. The ZIP did **not** contain the audit's referenced `audit/reproduce.cjs`, so its claimed 14 reproductions could not be rerun as supplied.

`node ledger/worker/test-regressions.cjs` runs 25 checks against the actual Worker functions, real in-memory SQLite, and mocked external services. It blocks unexpected network access. See `audit-results.json` for the final result.

`test-runtime.cjs` also runs the compiled Worker in local workerd with isolated D1 and KV. All six migrations, API posting, frozen CPA totals, closed-edit refusal, receipt text responses, PDF generation, and archive manifests are checked. It uses the already-installed Mobius project's Miniflare runtime in `marketing-hub/node_modules`; run `npm ci` there if dependencies are absent.

Browser checks used only the localhost instance and synthetic data: Home excluded Income tax from spending and its biggest-expense detail; a vendor containing apostrophes could become recurring and pause successfully; HTML receipt scripts displayed as text. At a 390px viewport, visible settings inputs/selects/buttons met the 44px target and input text was 16px.

## Deployment sequence

The Worker is pinned to Mobius account `9de398454c0670e665485f4e4426a630`, D1 `mobius-ledger`, and R2 `mobius-ledger-receipts`. Keep these bindings. The existing deployment workflow now runs the regression suite and applies Ledger migrations before publishing its Worker, using Wrangler 4.123.0 and Node 24.

1. Take a Mobius-only D1 export and retain the receipt stores before rollout. Do not run `seed.sql` or any historical cleanup script.
2. Run the regression suite and a Wrangler dry-run. For the integration test, write the dry-run bundle to `ledger/worker/.audit-build/bundle/worker.js`, then run `node ledger/worker/test-runtime.cjs`.
3. From `ledger/worker`, apply `npx wrangler@4.123.0 d1 migrations apply mobius-ledger --remote`, then deploy `npx wrangler@4.123.0 deploy`. These are release instructions, not commands executed during this repair.
4. Publish the matching `ledger/index.html` through the Mobius site's existing release process. Backend and frontend belong in the same release; the CSV identity requirement changes the import contract.
5. Confirm owner Google login, rejection of a nonmember, Slack owner authorization, open/closed month behavior, one statement/CPA comparison, and the exception list against Mobius data.

## Operational boundaries

- Existing historical records were not rewritten. Frozen reports without saved detail require review and an explicit reopen/reclose before a CPA pack can include them. A closed period without a snapshot is rejected rather than labeled frozen with newly calculated figures.
- Legacy bank rows without account/currency lineage remain unresolved in reconciliation. Same-institution re-linking is deliberately refused until a verified replacement mapping is available; it cannot delete or merge old entries by amount.
- Duplicate Stripe candidates require a human provenance decision. The repair does not infer that two payments are identical merely because their amounts agree. Review `/api/exceptions` and `ledger_jobs` before relying on a completed reconciliation.
- CSV mapping is for expense/refund statements. It does not guess which deposits are revenue or transfers. Exact-file reimport is deduplicated; overlapping but differently formatted exports still need review.
- Receipt objects are retained; storage cleanup must preserve `receipt_versions`. The HTML application still uses static inline handlers, so its CSP is baseline containment, not a strict script nonce policy.
- No live OAuth exchange, paid Plaid call, Slack message, or production-data reconciliation was tested. Broader product additions in the audit—balance-sheet accounting, contractor filing workflows, and a restore-tested whole-system backup—remain separate work.

Rollback should keep the additive migrations and closed-period guards. Reverting to old ingestion code can encounter these guards; do not remove the locks merely to make an old writer succeed. Reconcile exceptions and restore only from the Mobius backup if a data rollback is necessary.
