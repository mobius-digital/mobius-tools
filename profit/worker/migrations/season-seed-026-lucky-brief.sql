-- Lucky Golf, 2026-10-08: the full brief (artifact DKSH1u9LXUVS1prAVVUeUF v19). Black Friday beats the Early
-- Bird at every step. Early Bird: towel with any club, + divot tool at 2+. Black Friday week: towel + divot tool
-- with every club, $50 off 2 clubs, $100 off 3+. Gloves = $9.99 cart add-on. December: no offer. Cyber Monday:
-- same deal, winter apparel drops if in by Nov 20. Plan B internal only. Run once.
UPDATE p_season_phase SET name='Early Bird: towel with any club, + divot tool at 2+ (proposed)',
 offer='Free towel with any club. Buy two or more and a divot tool comes too. Through Nov 16.',
 detail='Full price. One wedge leaves $59 before ads (1.67x), two wedges $130 (1.53x). About 260 towels and 65 divot tools. Gloves are a $9.99 cart add-on.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='list';
UPDATE p_season_phase SET
 offer='Every club comes with a towel and a divot tool. Buy 2 clubs, take $50 off. Buy 3 or more, take $100 off. Plus the black Eclipse putters, first time on sale.',
 detail='Beats the Early Bird at every step. Per order before ads: one wedge $56 (1.77x), two wedges $81 (1.82x), three wedges $106 (1.85x), Mallet $168 (1.36x), Mallet + wedge $193 (1.44x), Mallet + 2 wedges $219 (1.50x). Same deal for early access (list, Nov 24 to 25) and Cyber Monday. Gloves $9.99 cart add-on. About 680 towels and 680 divot tools.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='bf';
UPDATE p_season_phase SET
 detail='Cyber Monday runs the same deal as the last day. If the winter apparel is in the warehouse by Nov 20 it drops Monday at full price; otherwise it launches members Dec 3, everyone Dec 4.'
WHERE act_id='act_378146126054294' AND season='2026' AND key='drop';
UPDATE p_season_phase SET
 offer='Win it for your whole foursome: all four of you get three Carvers, the first black Eclipse putters, the Stryker and a polo. Enter free. Tag your three buddies for extra entries. (Name TBD.)'
WHERE act_id='act_378146126054294' AND season='2026' AND key='early';
