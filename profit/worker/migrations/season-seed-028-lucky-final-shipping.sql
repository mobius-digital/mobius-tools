-- Lucky Golf, 2026-10-08: final team plan (artifact DKSH1u9LXUVS1prAVVUeUF v22). Shipping decided from competitor
-- research: no golf brand dropped its free-shipping line for Black Friday; the closest peers (Takomo, Haywood,
-- Vice, Caley) never ship free (Takomo $19 a wedge, $29 for 2+ clubs). Free line moves $198 -> $195 so 3 wedges
-- at $100 off ($197) ship free; ground capped at $25 over 2 lb; policy page fixed ($175 -> $195).
-- Cyber Monday credit $10. Run once.
UPDATE p_season_phase SET
 offer='Every club comes with a towel and a divot tool. Buy 2 clubs, take $50 off. Buy 3 or more, take $100 off, and they ship free. Plus the black Eclipse putters, first time on sale.',
 detail='Free shipping stays at $195 all season (never dropped for Black Friday). One wedge pays $18, two-club orders pay $25, three or more ship free. Per order before ads: one wedge $69 (1.70x), two wedges $99 (1.76x), three wedges $99 (1.99x), Mallet $164 (1.40x), Mallet + wedge $187 (1.49x), Mallet + 2 wedges $211 (1.55x). Postage still estimated ($11 / $13) until the invoices come in.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';
UPDATE p_season_phase SET
 detail='Cyber Monday = same deal, last day, plus a $10 credit only for list members who did not buy Nov 24 to 29 (email and SMS only, ends midnight, stacks). Winter apparel drops Monday if in by Nov 20, otherwise members Dec 3, everyone Dec 4.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';
