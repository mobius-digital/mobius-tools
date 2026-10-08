-- Lucky Golf, 2026-10-08: weekend goals from the forecast (artifact RVHJodhietjCRCQ7uCpchY). PROPOSED until Cole
-- agrees. Season goal $500k Nov+Dec (Cole); weekend Nov 24 to 30 $150k. 2025 weekend actual: $86,992, 659 orders,
-- $36,845 ads ($56/order), 2.36x MER, ~$13.5k after ads. Breakeven MER for the offer ~1.75x. Desk ladder moved to
-- the new target. Run once.
UPDATE p_season_answer SET value=json_set(value,
  '$.bf',150000,'$.total',500000,'$.be',1.75,'$.target',2.6,'$.s50',3.0,'$.s100',3.5,
  '$.note','PROPOSED Oct 8 (agree with Cole): $500k Nov + Dec; the weekend (Nov 24 to 30) $150k on about $50k to $55k of ads, $30k+ after ads (20%+ of club sales), $60 or less in ads per order, $170+ average order, 2.6x MER (pull back if a full day runs under 2.2x). Breakeven about 1.75x. Last year the weekend did $87k, $56 per order, 2.36x, about $13.5k after ads. Forecast: https://claude.ai/artifact/RVHJodhietjCRCQ7uCpchY')
WHERE act_id='act_378146126054294' AND season='2026' AND key='goals';
