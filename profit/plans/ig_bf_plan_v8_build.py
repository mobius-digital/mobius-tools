import json, re
S = r'C:\Users\wetzl\AppData\Local\Temp\claude\951ff288ce3c210a\a7f31d39-4547-4fe0-941b-137bc6c01a3f\scratchpad'
d = S + r'\wt-bfplan\profit\plans'
plan = json.load(open(d + r'\ig_bf_plan_v7.json', encoding='utf-8'))
meta = json.load(open(S + r'\bfcm_ads.json', encoding='utf-8'))
E, AI, PB = '120247797929670658', '120248110000150658', '120247798012710658'
ads = [a for a in meta['campaigns'][0]['ads'] if a['set'] in (E, AI, PB)]

def find(code, prefer):
    """The ad for a card code: prefer the group's own set, a v2 version over the original."""
    hits = [a for a in ads if re.match(re.escape(code) + r'(\s|\||$)', a['name'])]
    if not hits: raise SystemExit('missing ' + code)
    hits.sort(key=lambda a: (a['set'] != prefer, a['set'] == PB, ' v2' not in a['name']))
    return hits[0]

def who(code):
    if re.match(r'(bf|cm)-', code): return 'Mobius'
    if code.startswith('54-'): return 'William'
    return 'Ahsan'

def row(label, codes, prefer, word):
    out = []
    for c in codes:
        a = find(c, prefer)
        out.append({"id": a['id'], "label": c, "by": who(c)})
    return {"label": label, "count_word": word, "ads": out}

bf = [f"bf-{i:02d}" for i in range(1, 26) if i != 4]
team_bf = "38-1 38-2 38-3 38-4 52-5 52-8 52-11 52-12 53-1 53-2 53-4".split()
cm = "cm-01 cm-02 cm-03 cm-04 cm-05 57-1 57-2 57-3 57-4 57-5 57-7 57-13 57-14 57-15 57-16".split()
ai_on = "52-1 52-3 52-4 52-7 52-9 52-10 53-3 53-5 53-6 53-7 53-8 53-10 53-13 53-14 53-16 53-17 53-18 54-1 54-5 54-7 54-9".split()
ai_cm = "57-6 57-8 57-9 57-10 57-11 57-12".split()
ai_fix = "52-13 52-14 52-15 52-16 52-17 52-19 52-20 53-9 53-12 53-15".split()
assert len(bf) == 24 and len(bf + team_bf) == 35 and len(cm) == 15 and len(ai_on) == 21 and len(ai_cm) == 6 and len(ai_fix) == 10

ON, CMR = "Will run Nov 26", "Cyber Monday (Nov 30)"
photos = {"label": "Photos", "rows": [row(ON, bf + team_bf, E, "will run Nov 26"), row(CMR, cm, E, "Cyber Monday")]}
videos = next(g for g in plan['ads']['groups'] if g['label'] == 'Videos')
aig = {"label": "AI model test", "rows": [row(ON, ai_on, AI, "will run Nov 26"), row(CMR, ai_cm, AI, "Cyber Monday"),
                                         row("Being fixed (studs not in the picture yet)", ai_fix, AI, "being fixed")]}
plan['ads']['groups'] = [photos, videos, aig]
plan['ads']['summary'] = "Photos: 30 made by Mobius (25 Black Friday, 5 Cyber Monday), 58 made by the team (42 Black Friday, 16 Cyber Monday). 1 left out: a staged DM screenshot."
plan['planbox'][0] = {"when": "Nov 26, 12am", "text": "74 ads go on (35 photos, 18 videos, 21 AI test)."}
plan['planbox'][1] = {"when": "Nov 26 to 29", "text": "An ad that spends $171 with no sale, or costs over $86 a sale, gets turned off."}
plan['structure']['sets'] = [
    {"label": "Photos", "who": "Everyone in the US, past buyers included.", "dt": "35 will run Nov 26, 15 Cyber Monday"},
    {"label": "Videos", "who": "Everyone in the US, past buyers included.", "dt": "18 will run Nov 26, 20 Cyber Monday"},
    {"label": "AI model test", "who": "New people only.", "dt": "21 will run Nov 26, 6 Cyber Monday, 10 being fixed. Off Nov 28 if no sales."}]
out = json.dumps(plan)
assert "\u2014" not in out and 'Backup' not in out
open(d + r'\ig_bf_plan_v8.json', 'w', encoding='utf-8').write(out)
print(len(out), [(g['label'], [len(r['ads']) for r in g['rows']]) for g in plan['ads']['groups']])
print([ (a['label'], a['id']) for a in photos['rows'][0]['ads'] if a['label'] in ('bf-01','bf-10','52-5','38-2')])
