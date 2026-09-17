# History backfill, 2023 to 2025 (applied 2026-09-16)

Source: the "2023 | Master Finance", "2024 | Master Finance" and "2025 | Master Finance"
Google Sheets (xlsx exports, one tab per month).

- `parse-master-finance.py` reads every line item and checks each month against the
  sheet's own Revenue and Total Expenses. All 36 months matched to the cent.
- `history-2023-2025.sql` is what was inserted (1,103 rows, source `backfill`, dated the
  1st of each month). **ONE-TIME. Do not re-run: it would count every row twice.**
- `freeze-months.cjs` closed each month in a local workerd with the production row ids,
  producing the same frozen report `/api/close` writes; those `months` rows were then
  inserted in production.

Year totals after the import (net income matches the sheets):
2023 revenue 94,592.00 net 43,443.57 · 2024 revenue 195,175.33 net 113,673.39 ·
2025 revenue 237,783.00 net 138,080.84.

Revenue is lower than the sheet by refunds that were really money back on purchases
(Agency Lab 2,000 in Mar 2024; Amazon 146.05 and Replo 99 in Jan 2025): they are
negative expenses here, so net income is unchanged. 2023 and 2024 merchant fees are
the sheet's 2.93% estimates, not Stripe's exact figures.
