-- Lucky Golf, 2026-10-08: real postage from the 3PL invoices (INV-LG-2026-37/45/60, 1,158 Shopify orders,
-- May 18 to Aug 7). Ground label: 1 club $15.25, 2 clubs $15.30, 3 clubs $16.40; warehouse adds pick $0.50 an
-- item, pack $1.00, processing $0.25 and a $1.58 box. Free-shipped orders (399) averaged a $15.52 label, about
-- $2,300 a month, ~6% of those orders and under 3% of all sales. Verdict: keep free shipping at $195. Dropping
-- it only pays if fewer than ~1 in 7 two-wedge / putter buyers walk away. Margins re-done. Run once.
UPDATE p_season_phase SET
 detail='Free shipping stays at $195 all season (never dropped for Black Friday). One wedge pays $18, two-club orders pay $25, three or more ship free. Real postage from the 3PL invoices: $15.25 for one club, $15.30 for two, $16.40 for three. Per order before ads: one wedge $63 (1.85x), two wedges $95 (1.83x), three wedges $94 (2.10x), Mallet $158 (1.45x), Mallet + wedge $183 (1.52x), Mallet + 2 wedges $206 (1.58x). The weekend makes money above about 1.8x.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';
