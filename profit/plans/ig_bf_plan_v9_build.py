import json
S = r'C:\Users\wetzl\AppData\Local\Temp\claude\951ff288ce3c210a\a7f31d39-4547-4fe0-941b-137bc6c01a3f\scratchpad'
d = S + r'\wt-bfplan\profit\plans'
plan = json.load(open(d + r'\ig_bf_plan_v8.json', encoding='utf-8'))
ph = plan['ads']['groups'][0]['rows'][0]['ads']
assert ph[2]['label'] == 'bf-03' and not any(a['label'] == 'bf-04' for a in ph)
ph.insert(3, {"id": "120247797930580658", "label": "bf-04", "by": "Mobius"})
assert len(ph) == 36
plan['ads']['summary'] = "Photos: 30 made by Mobius (25 Black Friday, 5 Cyber Monday), 58 made by the team (42 Black Friday, 16 Cyber Monday)."
plan['planbox'][0] = {"when": "Nov 26, 12am", "text": "75 ads go on (36 photos, 18 videos, 21 AI test)."}
plan['structure'] = {
    "sub": "",
    "campaign_title": "Campaign: BFCM 2026",
    "campaign_lines": ["One budget: $300/day Nov 26, $500/day Nov 27 to 30.", "Runs Nov 26 12am to Dec 1 12am ET."],
    "groups": [
        {"title": "Group 1, Photos", "who": "Everyone in the US.",
         "lines": [{"when": "Nov 26", "big": "36", "text": "25 Mobius, 11 team"}, {"when": "Nov 30", "big": "+15", "text": "Cyber Monday (5 Mobius, 10 team)"}],
         "note": "Black Friday ads that lose come off Nov 30, so it stays at Meta's 50."},
        {"title": "Group 2, Videos", "who": "Everyone in the US.",
         "lines": [{"when": "Nov 26", "big": "18", "text": "16 Mobius recuts of past winners, 2 Fela"}, {"when": "Nov 30", "big": "+20", "text": "Cyber Monday (16 Mobius, 4 team)"}],
         "note": "Total 38."},
        {"title": "Group 3, AI model test", "who": "New people only.",
         "lines": [{"when": "Nov 26", "big": "21", "text": "team"}, {"when": "Later", "big": "+10", "text": "when the studs fix is done"}, {"when": "Nov 30", "big": "+6", "text": "Cyber Monday (team)"}],
         "note": "Off Nov 28 if no sales."}],
    "rule": "an ad that spends $171 with no sale, or costs over $86 a sale, gets turned off."}
out = json.dumps(plan)
assert "\u2014" not in out
open(d + r'\ig_bf_plan_v9.json', 'w', encoding='utf-8').write(out)
print(len(out), [(g['label'], [len(r['ads']) for r in g['rows']]) for g in plan['ads']['groups']])
