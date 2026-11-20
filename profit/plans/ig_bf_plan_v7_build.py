import json, re
d = r'C:\Users\wetzl\AppData\Local\Temp\claude\951ff288ce3c210a\a7f31d39-4547-4fe0-941b-137bc6c01a3f\scratchpad\wt-bfplan\profit\plans'
src = r'C:\Users\wetzl\AppData\Local\Temp\claude\f6ef2e15f84da06c\8ba70888-b296-45b3-8474-f184740b0005\scratchpad\plan\build_plan.json'
B = json.load(open(src, encoding='utf-8'))
s = open(d + r'\ig_bf_plan_v6.py', encoding='utf-8').read()
ns = {}
exec(s.replace('print(s)', '').replace('assert "\u2014" not in s', '').replace('s = json.dumps(plan)', 'PLAN = plan'), ns)
plan = ns['PLAN']

def label(n): return re.sub(r'\s+(BF|CM|AI|v2|Fela)$', '', re.sub(r'\s+(BF|CM|AI|v2|Fela)$', '', n)).strip()
def by(n, video):
    if video:
        if n.startswith('63-'): return 'Fela'
        if n.startswith('60-'): return 'Ahsan'
        if re.match(r'(Chanler|Hazel|Raghda|Kelly|Gabrielle)', n): return 'Creator'
        return 'Recut'
    if re.match(r'(bf|cm)-', n): return 'Mobius'
    if re.match(r'(38|52|53|57)-', n): return 'Ahsan'
    if re.match(r'54-', n): return 'William'
    return ''
def ads(key, video=False): return [{"id": i, "label": label(n), "by": by(n, video)} for n, i in B[key].items()]

ON, BK, CM = "Will run Nov 26", "Backup", "Cyber Monday (Nov 30)"
plan["title"] = "Our proposed Black Friday plan, for your OK."
plan["lede"] = "Nothing here is live yet. Once you say OK, we set it up in Meta. All times Eastern."
plan["structure"] = {"label": "BFCM 2026 (proposed)", "sub": "One campaign, one budget, three groups of ads.",
    "lines": ["One budget: $300 Nov 26, $500 Nov 27 to 30. Meta moves it to the ads that sell."],
    "sets": [{"label": "Photos", "who": "Everyone in the US, past buyers included.", "dt": f"{len(B['photos_on'])} will run Nov 26, {len(B['photos_backup'])} backups, {len(B['photos_cm_paused'])} Cyber Monday"},
             {"label": "Videos", "who": "Everyone in the US, past buyers included.", "dt": f"{len(B['bf_videos_old_in_everyone'])} will run Nov 26, {len(B['cm_videos_source'])} Cyber Monday"},
             {"label": "AI model test", "who": "New people only.", "dt": f"{len(B['ai_on'])} will run Nov 26, {len(B['ai_backup'])} backups, {len(B['ai_cm_paused'])} Cyber Monday. Off Nov 28 if no sales."}]}
plan["ads"] = {"mode": "fixed", "intro": "Every ad in the plan. Tap any ad to see it full size; videos play.",
    "groups": [
        {"label": "Photos", "rows": [{"label": ON, "count_word": "will run Nov 26", "ads": ads("photos_on")},
                                     {"label": BK, "count_word": "backups", "ads": ads("photos_backup")},
                                     {"label": CM, "count_word": "Cyber Monday", "ads": ads("photos_cm_paused")}]},
        {"label": "Videos", "video": True, "rows": [{"label": ON, "count_word": "will run Nov 26", "ads": ads("bf_videos_old_in_everyone", True)},
                                                    {"label": CM, "count_word": "Cyber Monday", "ads": ads("cm_videos_source", True)}]},
        {"label": "AI model test", "rows": [{"label": ON, "count_word": "will run Nov 26", "ads": ads("ai_on")},
                                            {"label": BK, "count_word": "backups", "ads": ads("ai_backup")},
                                            {"label": CM, "count_word": "Cyber Monday", "ads": ads("ai_cm_paused")}]}]}
plan["planbox_title"] = "The plan"
out = json.dumps(plan)
assert "\u2014" not in out
open(d + r'\ig_bf_plan_v7.json', 'w', encoding='utf-8').write(out)
json.dump(B, open(d + r'\ig_bf_plan_v7_ads.json', 'w', encoding='utf-8'), indent=1)
print(len(out), [(g['label'], [len(r['ads']) for r in g['rows']]) for g in plan['ads']['groups']])
print([a['label'] + '/' + a['by'] for a in plan['ads']['groups'][1]['rows'][0]['ads']][:6], [a['label'] + '/' + a['by'] for a in plan['ads']['groups'][0]['rows'][0]['ads']][:5])
