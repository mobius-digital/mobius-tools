# Provenance only (2026-09-29): ran once from a scratch folder against the original .docx files in Downloads.
# The result is viktor_data.json; viktor_import.mjs loads it. Paths below are the original scratch paths.
# Combines parse.py output with meta.py + notes.py into viktor_data.json (the rows to insert).
import json, io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
from meta import ACTS, LINES, COMP_OF, COMP_TO_VOC, COMP_PRAISE
from notes import NOTES, GAPS
SP = 'C:/Users/wetzl/AppData/Local/Temp/claude/C--Users-wetzl-OneDrive-Apps-Desktop-Mobius-Digital-Mobius-Digital-Tools/905df0a3-409b-4a0f-8919-2b6bf57eefa7/scratchpad/'
P = json.load(io.open(SP + 'viktor-parsed.json', encoding='utf-8'))
SHORT = {'Party Patch': 'pp', 'Bonk Golf': 'bonk', 'Dartee Golf': 'dartee', 'Grunk Dolfer': 'gd'}
PERSONA_KEYS = ['summary', 'demo', 'buys', 'desire', 'struggle', 'identity', 'status', 'how_helps', 'beliefs', 'objections', 'tried_failed', 'not_tried', 'trigger', 'push', 'pull', 'anxiety', 'habit', 'interests', 'online', 'offline', 'follows', 'words']

def noem(s):
    """Authored text only (never customer quotes): no em dashes, no evidence-archive placeholders."""
    s = re.sub(r'\s*—\s*', ', ', s or '')
    s = re.sub(r'\s*\(\[saved source files?\]\s*\)', '', s)
    s = re.sub(r'\[saved source files?\]\s*', '', s)
    return re.sub(r'\s{2,}', ' ', s).strip()

def cap1(s): return s[:1].upper() + s[1:] if s else s

def persona_fields(f):
    f = dict(f)
    basis = []
    lead = []
    desc = f.pop('desc', '')
    # leading parentheticals of the head: "(the age trigger)", "(inferred from ...)"
    rest = desc
    while True:
        m = re.match(r'^\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*(.*)$', rest)
        if not m: break
        inner, rest = m.group(1), m.group(2)
        (basis if inner.lower().startswith('inferred') else lead).append(inner)
    # "the style-conscious weekend golfer (self-buyer)" style descriptors
    rest = rest.strip()
    summary = f.get('summary', '')
    m = re.match(r'^\s*\(([^()]*)\)\s*(.*)$', summary)
    while m:
        (basis if m.group(1).lower().startswith('inferred') else lead).append(m.group(1))
        summary = m.group(2); m = re.match(r'^\s*\(([^()]*)\)\s*(.*)$', summary)
    parts = [cap1(x.rstrip('.')) + '.' for x in lead] + ([cap1(rest.rstrip('.')) + '.'] if rest else []) + ([cap1(summary)] if summary else [])
    if f.get('why'): parts.append('Why it matters: ' + f.pop('why'))
    if basis: parts.append('Basis: ' + '; '.join(basis) + '.')
    f['summary'] = ' '.join(p for p in parts if p).strip()
    if f.get('evidence'):
        f['words'] = f.pop('evidence') + (' · ' + f['words'] if f.get('words') else '')
    out = {}
    for k in PERSONA_KEYS:
        v = f.get(k, '')
        out[k] = v if k == 'words' else noem(v)
    return out

def src_label(brand, q):
    s = q['src_raw']
    if brand == 'Party Patch':
        url = re.sub(r'^source URL:\s*', '', s).strip()
        if 'partypatch.com' in url: lab = 'Loox review, partypatch.com'
        elif 'loox.io' in url: lab = 'Loox store page review'
        elif 'woot.com' in url: lab = 'Amazon review (Woot mirror)'
        elif 'reddit.com' in url: lab = 'Reddit r/' + re.search(r'/r/([^/]+)', url).group(1)
        elif 'trustpilot' in url: lab = 'Trustpilot review'
        elif 'iherb' in url: lab = 'iHerb review'
        else: lab = 'Web review'
        return lab, url
    if brand == 'Bonk Golf':
        s = re.sub(r'^Source:\s*', '', s)
        m = re.match(r'^(.*?):\s*(https?://\S+)\s*$', s)
        lab, url = (m.group(1), m.group(2)) if m else (s, '')
        lab = lab.replace(' · ⭐: ', ' | ').replace(' · Col6: ', ' | ')
        lab = re.sub(r'(Judge\.me review) [0-9a-f]{8}', r'\1', lab)
        lab = re.sub(r'(Amazon review) R[0-9A-Z]+', r'\1', lab)
        return lab, url
    if brand == 'Dartee Golf':
        s = re.sub(r'^Source:\s*', '', s)
        m = re.match(r'^Judge\.me review [0-9a-f-]+ \(([^,]+), ([^,]+),', s)
        if m: lab = f'Judge.me review ({m.group(1)}, {m.group(2)})'
        elif s.startswith('YouTube comment'): lab = 'YouTube comment'
        else: lab = s
        return lab, q.get('url') or ''
    if brand == 'Grunk Dolfer':
        s = re.sub(r'^source URL:\s*', '', s)
        m = re.match(r'^(\S+)\s*(?:\((.*)\))?\s*$', s)
        url, par = m.group(1), (m.group(2) or '')
        pm = re.search(r'product: ([^·)]+)', par); rm = re.search(r'(\d)★', par)
        if par.startswith('Judge.me'): lab = 'Judge.me review' + (f' ({pm.group(1).strip()}' + (f', {rm.group(1)}★' if rm else '') + ')' if pm else '')
        elif par.startswith('Homepage testimonial'): lab = 'Homepage testimonial (curated by the brand)'
        elif 'Slack' in par or 'slack.com' in url: lab = 'Slack #grunk (Nick, relaying customer messages)'
        else: lab = par.replace(' · ', ', ')[:120]
        return lab, url

COMP_LABELS = [('url', r'URL'), ('price', r'Price(?: \([^)]*\))?'), ('promise', r'Main promise'), ('mechanism', r'(?:Claimed mechanism|Mechanism they claim)'),
               ('offer', r'Current offer'), ('ads', r'What their ads keep saying(?: \([^)]*\))?'), ('complaints', r'1–3★ complaints(?: \([^)]*\))?')]
def parse_comp(line):
    m = re.match(r'^(?:Brand|Competitor): (.*?) · URL: ', line)
    name = m.group(1)
    rx = re.compile(r'(?:^|(?<= · ))(' + '|'.join(f'(?P<{k}>{p})' for k, p in COMP_LABELS) + r'):\s*')
    ms = list(rx.finditer(line))
    d = {}
    for i, mm in enumerate(ms):
        k = [k for k, _ in COMP_LABELS if mm.group(k)][0]
        end = ms[i + 1].start() if i + 1 < len(ms) else len(line)
        d[k] = line[mm.end():end].rstrip(' ·').strip()
    return name, d

out = {}
for brand, act in ACTS.items():
    doc = P[brand]; sh = SHORT[brand]
    rec = dict(act=act, brand=brand, new_lines=[], line_updates=[], personas=[], voc=[], comps=[], docs=[])
    line_ids = []
    for li, (vl, meta) in enumerate(zip(doc['lines'], LINES[brand])):
        if meta['map']:
            lid = meta['map']
            if meta.get('upd'): rec['line_updates'].append(dict(id=lid, **meta['upd']))
        else:
            lid = f'vk_{sh}_{meta["key"]}'
            rec['new_lines'].append(dict(id=lid, name=meta['name'], about=noem(meta['about']), products=noem(meta['products']), sort=meta['sort']))
        line_ids.append(lid)
        sec = vl['sections']
        g = lambda pre: [x for k, v in sec.items() if k.startswith(pre) for x in v if x.strip()]
        mass = noem(' '.join(g('1.')))
        aw = next((x for x in g('2.') if x.startswith('Awareness:')), '')
        so = next((x for x in g('2.') if x.startswith('Sophistication:')), '')
        mech = g('3.')
        wi = next((i for i, x in enumerate(mech) if re.match(r'^Why (this|BONK|it) works', x)), None)
        if wi is None:  # Dartee accessories: "Markers: ...", "Hats: ...", "Weak spots: ..."
            prob, sol = '', ' '.join(mech)
        else:
            prob, sol = ' '.join(mech[:wi]), ' '.join(mech[wi:])
        strip = lambda s: noem(re.sub(r'^(Why what they tried(?: before)? failed|What they tried that failed|What failed before|Failed before)(?: \([^)]*\))?:\s*', '', s))
        sol = noem(re.sub(r'^Why (?:this|BONK|it) works(?: \([^)]*\))?:\s*', '', sol))
        aw_why = re.sub(r'^Awareness:\s*', '', aw)
        aw_why = re.sub(r'^(?:Most|Product|Solution|Problem)[- ]aware\.\s*(?:\((?:inferred)\)\s*)?', '', aw_why, flags=re.I)
        st_why = re.sub(r'^Sophistication:\s*', '', so)
        st_why = re.sub(r'^Stage ' + meta['stage'] + r'\.\s*', '', st_why)
        market = dict(mass_desire=mass, awareness=meta['awareness'], awareness_why=noem(aw_why),
                      stage=meta['stage'], stage_why=noem(st_why),
                      claims_made=[noem(x) for x in meta['claims']], open_ground=[noem(x) for x in meta['open']], source='viktor', from_doc=f'{brand} - Brand Brain (Viktor, 2026-09-29)')
        rec['docs'].append(dict(line_id=lid, key='market_viktor' if lid == 'gd_line_apparel' else 'market', data=market))
        rec['docs'].append(dict(line_id=lid, key='mechanism', data=dict(problem=strip(prob), solution=sol, source='viktor')))
        for pi, p in enumerate(vl['personas']):
            data = persona_fields(p['fields']); data['awareness'] = meta['awareness']
            name = noem(p['name'])
            fix = re.match(r'^(Buyer|Gift buyer|Replacement buyer)\. (.*)$', data['summary'], re.S)
            if fix: name, data['summary'] = f'{name} {fix.group(1).lower()}', cap1(fix.group(2))
            rec['personas'].append(dict(id=f'vk_{sh}_{meta["key"]}_p{pi + 1}', line_id=lid, name=name, data=data, sort=li * 10 + pi))
        for q in vl['quotes']:
            if q['sec'] == '6.': continue
            lab, url = src_label(brand, q)
            rec['voc'].append(dict(id=f'vk_{sh}_{meta["key"]}_q{q["ref"]}', line_id=lid, kind=q['kind'], quote=q['quote'], source=lab, url=url,
                                   theme=q['ref'] if meta['ref'] else '', nugget=q['nugget']))
    # competitors: from the doc's competitor rows; complaint quotes from section 6 rows
    md = io.open(SP + 'viktor-' + brand + '.md', encoding='utf-8').read().split('\n')
    comp_lines = [x for x in md if re.match(r'^(Brand|Competitor): .* · URL: ', x)]
    cq = [q for vl in doc['lines'] for q in vl['quotes'] if q['sec'] == '6.']
    core = line_ids[0]
    comps = []
    for ci, cl in enumerate(comp_lines):
        name, d = parse_comp(cl)
        url = d.get('url', '')
        um = re.search(r'https?://[^\s)]+', url) or re.search(r'([a-z0-9-]+\.(?:com|co|ca))', url)
        url = (um.group(0) if um.group(0).startswith('http') else 'https://' + um.group(1)) if um else ''
        complaints, csrc = [], []
        raw = d.get('complaints', '')
        if brand == 'Bonk Golf':
            qs = re.findall(r'"([^"]+)"', raw)
            srcm = re.search(r'\(([^()]*(?:Okendo|Trustpilot)[^()]*)\)\s*$', raw)
            for x in qs: complaints.append(x); csrc.append(dict(quote=x, source=srcm.group(1) if srcm else ''))
        comps.append(dict(id=f'vk_{sh}_c{ci + 1}', line_id=core, name=noem(name), url=url, sort=ci,
                          data=dict(price=noem(d.get('price', '')), promise=noem(d.get('promise', '')), mechanism=noem(d.get('mechanism', '')), offer=noem(d.get('offer', '')),
                                    ad_themes=[re.sub(r'\s*\(\[saved source files?\]\s*\)', '', d['ads'])] if d.get('ads') and d['ads'].lower() != 'unknown' else [], complaints=complaints, complaint_sources=csrc, praise=[],
                                    complaints_note=noem(raw) if brand != 'Bonk Golf' else '', strengths='', weaknesses='', source='viktor')))
    for q in cq:
        if q['ref'] in COMP_TO_VOC.get(brand, set()):
            lab, url = src_label(brand, q)
            rec['voc'].append(dict(id=f'vk_{sh}_{LINES[brand][0]["key"]}_q{q["ref"]}', line_id=core, kind='failed', quote=q['quote'], source=lab, url=url, theme=q['ref'], nugget=q['nugget']))
            continue
        who = q.get('competitor') or COMP_OF[brand][q['ref']]
        c = next(c for c in comps if c['name'].lower().startswith(who.lower()) or who.lower() in c['name'].lower())
        lab, url = src_label(brand, q)
        entry = dict(quote=q['quote'], source=lab, url=url)
        if q['ref'] in COMP_PRAISE.get(brand, set()): c['data']['praise'].append(entry)
        else: c['data']['complaints'].append(q['quote']); c['data']['complaint_sources'].append(entry)
    rec['comps'] = comps
    rec['docs'].append(dict(line_id='', key='viktor_notes', data=dict(md=NOTES[brand].strip(), gaps=GAPS[brand], from_='viktor 2026-09-29')))
    out[brand] = rec
    print(brand, 'lines new', len(rec['new_lines']), 'upd', len(rec['line_updates']), '| personas', len(rec['personas']), '| voc', len(rec['voc']),
          '(nuggets', sum(v['nugget'] for v in rec['voc']), ') | comps', len(comps), 'complaints', sum(len(c['data']['complaints']) for c in comps), '| docs', len(rec['docs']))

for rec in out.values():
    for d in rec['docs']:
        if 'from_' in d['data']: d['data']['from'] = d['data'].pop('from_')
json.dump(out, io.open(SP + 'viktor_data.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
# em dash audit on authored fields
for b, rec in out.items():
    for d in rec['docs']:
        s = json.dumps(d['data'], ensure_ascii=False)
        if '—' in s: print('EMDASH doc', b, d['key'], d['line_id'], s[s.index('—') - 60:s.index('—') + 20])
    for p in rec['personas']:
        s = json.dumps({k: v for k, v in p['data'].items() if k != 'words'}, ensure_ascii=False)
        if '—' in s: print('EMDASH persona', b, p['name'])
