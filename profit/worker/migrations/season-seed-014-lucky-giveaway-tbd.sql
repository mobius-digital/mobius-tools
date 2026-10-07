-- Lucky Golf, 2026-10-06: the giveaway name is simply TBD (Cole workshops it with Nick Oct 7). Run once.
UPDATE p_season_phase SET name='Giveaway (name TBD), then member signup',
 offer='Giveaway, name TBD: all four of you get three Carvers, an Eclipse putter, the Stryker, a polo and a hat. Enter free.',
 detail=replace(detail, 'Name: The Foursome Giveaway. Headline: "Every Lucky club. All four of you." ', 'Name and headline TBD, Cole and Nick Oct 7. ')
WHERE act_id='act_378146126054294' AND season='2026' AND key='early';
