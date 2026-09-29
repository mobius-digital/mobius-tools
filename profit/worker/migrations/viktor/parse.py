# Provenance only (2026-09-29): ran once from a scratch folder against the original .docx files in Downloads.
# The result is viktor_data.json; viktor_import.mjs loads it. Paths below are the original scratch paths.
# Parses Viktor's brand-brain docs (md text of the docx) into a JSON draft per brand.
# Quotes are taken verbatim; personas are split on known field labels; line sections kept raw
# for hand editing of the market fields.
import re, io, json, sys, zipfile, html
sys.stdout.reconfigure(encoding='utf-8')
SP = 'C:/Users/wetzl/AppData/Local/Temp/claude/C--Users-wetzl-OneDrive-Apps-Desktop-Mobius-Digital-Mobius-Digital-Tools/905df0a3-409b-4a0f-8919-2b6bf57eefa7/scratchpad/'
DL = 'C:/Users/wetzl/Downloads/'
BRANDS = sys.argv[1:] or ['Party Patch', 'Bonk Golf', 'Dartee Golf', 'Grunk Dolfer']
OUT = 'viktor-parsed.json' if not sys.argv[1:] else 'viktor-parsed-' + '-'.join(b.split()[0].lower() for b in sys.argv[1:]) + '.json'

LABELS = [
    (r'Summary', 'summary'), (r'Age/gender/location', 'demo'), (r'Age/gender', 'demo'),
    (r'What (?:he|she|they) buys?', 'buys'), (r'Buys', 'buys'),
    (r'Core desire', 'desire'), (r'Desire', 'desire'), (r'Struggle', 'struggle'), (r'Identity / status', 'identity'), (r'Identity', 'identity'), (r'Wants', 'desire'),
    (r'Status (?:she|he|they) wants?', 'status'), (r'Status wanted', 'status'), (r'Status', 'status'),
    (r'How (?:it|BONK|Dartee|Lucky|the product) helps', 'how_helps'), (r'Beliefs', 'beliefs'), (r'Belief', 'beliefs'),
    (r'Objections/anxiety', 'objections'), (r'Objections', 'objections'), (r'Objection', 'objections'),
    (r'Tried and failed', 'tried_failed'), (r'Tried/failed', 'tried_failed'), (r'Tried that failed', 'tried_failed'), (r'Tried', 'tried_failed'), (r"Hasn't tried", 'not_tried'),
    (r'Trigger', 'trigger'), (r'Push', 'push'), (r'Pull', 'pull'), (r'Anxiety', 'anxiety'), (r'Habit', 'habit'),
    (r'Interests / online / offline', 'interests'), (r'Interests / hangouts', 'interests'), (r'Interests', 'interests'),
    (r'Online hangouts', 'online'), (r'Hangs out', 'online'), (r'Online/offline', 'online'), (r'Online', 'online'), (r'Hangouts', 'online'), (r'Where', 'online'),
    (r'Offline', 'offline'), (r'Who (?:she|he|they) follows?', 'follows'), (r'Follows', 'follows'),
    (r'Phrases[^:]{0,40}', 'words'), (r'Evidence', 'evidence'), (r'Why it matters', 'why'),
]
LAB_RE = re.compile(r'(?:(?<=^)|(?<=\. )|(?<=; )|(?<=\) )|(?<=” )|(?<=" ))(' + '|'.join(l for l, _ in LABELS) + r'):\s*')

def lab_key(label):
    for l, k in LABELS:
        if re.fullmatch(l, label): return k
    return None

def split_fields(text):
    out = []
    pos = 0; cur = ('summary', None)
    ms = list(LAB_RE.finditer(text))
    if not ms: return [('summary', text.strip())]
    if ms[0].start() > 0: out.append(('summary', text[:ms[0].start()].strip()))
    for i, m in enumerate(ms):
        end = ms[i + 1].start() if i + 1 < len(ms) else len(text)
        out.append((lab_key(m.group(1)), text[m.end():end].strip()))
    return out

def parse_quote(row):
    # returns dict(ref, quote, kind, src_raw, nugget, competitor)
    m = re.match(r'#: (\S+) · (?:Competitor: (.*?) · )?(?:quote|Quote \(verbatim\)|Quote): "(.*)" · [Kk]ind: ([a-z ]+?) · (.*)$', row)
    if not m: raise Exception('bad row ' + row[:120])
    ref, comp, quote, kind, rest = m.groups()
    nugget = 0
    rest = rest.rstrip()
    if rest.endswith('⭐'):
        nugget = 1
        rest = re.sub(r' · (?:nugget ⭐|⭐|Nugget|Col6): ⭐$', '', rest)
    return dict(ref=ref, competitor=comp, quote=quote, kind='failed' if kind == 'failed solution' else kind, src_raw=rest, nugget=nugget)

def docx_links(brand):
    z = zipfile.ZipFile(DL + brand + ' - Brand Brain.docx')
    rels = z.read('word/_rels/document.xml.rels').decode()
    rmap = {}
    for tag in re.findall(r'<Relationship [^>]*/>', rels):
        i = re.search(r'Id="([^"]+)"', tag).group(1); t = re.search(r'Target="([^"]+)"', tag).group(1)
        rmap[i] = html.unescape(t)
    doc = z.read('word/document.xml').decode()
    links = [(html.unescape(''.join(re.findall(r'<w:t[^>]*>([^<]*)', x))), rmap.get(r)) for r, x in re.findall(r'<w:hyperlink [^>]*r:id="([^"]+)"[^>]*>(.*?)</w:hyperlink>', doc, re.S)]
    paras = [html.unescape(''.join(re.findall(r'<w:t[^>]*>([^<]*)', p))) for p in re.findall(r'<w:p[ >].*?</w:p>', doc, re.S)]
    return links, '\n'.join(paras)

res = {}
for b in BRANDS:
    lines = io.open(SP + 'viktor-' + b + '.md', encoding='utf-8').read().split('\n')
    links, doctext = docx_links(b)
    link_i = 0
    doc = dict(brand=b, head=[], lines=[], shared=[], section8=[], appendix=[])
    cur = None; sec = None; zone = 'head'
    for ln in lines:
        if ln.startswith('## '):
            t = ln[3:]
            if t.startswith('Product line:'):
                cur = dict(name=t[len('Product line:'):].strip(), sections={'intro': []}, quotes=[], personas_raw=[]); doc['lines'].append(cur); zone = 'line'; sec = 'intro'
            elif t.startswith('Section 8'): zone = 'section8'; doc['section8'].append(ln); cur = None
            elif t.startswith('Appendix'): zone = 'appendix'; cur = None
            elif t.startswith('Shared across'): zone = 'shared'; cur = None; doc['shared'].append(ln)
            else: zone = 'head'; doc['head'].append(ln)
            continue
        if zone == 'line' and ln.startswith('### '):
            sec = ln[4:]; cur['sections'][sec] = []; continue
        if zone == 'line':
            if ln.startswith('#: '):
                q = parse_quote(ln); q['sec'] = sec[:2]
                if b == 'Dartee Golf':
                    t, u = links[link_i]; link_i += 1
                    assert t.strip() and t.strip() in q['src_raw'], (t, q['src_raw'])
                    q['url'] = u
                if b == 'Lucky Golf':  # the source label is the hyperlink; skip links that belong to prose
                    while not (links[link_i][0].strip() and links[link_i][0].strip() in q['src_raw']): link_i += 1
                    q['url'] = links[link_i][1]; link_i += 1
                assert q['quote'] in doctext, q['quote']
                cur['quotes'].append(q)
            else:
                cur['sections'][sec].append(ln)
        elif zone == 'shared':
            doc['shared'].append(ln)
        elif zone == 'section8': doc['section8'].append(ln)
        elif zone == 'appendix': doc['appendix'].append(ln)
        else: doc['head'].append(ln)
    if b == 'Dartee Golf': assert link_i == len(links), (link_i, len(links))
    res[b] = doc
    doc['links'] = links
    print(b, [(l['name'][:30], len(l['quotes']), sum(q['nugget'] for q in l['quotes'])) for l in doc['lines']])

# personas: split the "4. Personas" section into persona blocks
PHEAD = re.compile(r'^(?:Persona [A-Z](?: —|:)\s*|[A-Z]\. |[A-Z] — )(.*)$')
for b, doc in res.items():
    for l in doc['lines']:
        key = [k for k in l['sections'] if k.startswith('4.')][0]
        blocks = []
        for ln in l['sections'][key]:
            if not ln.strip(): continue
            m = PHEAD.match(ln)
            if m: blocks.append([m.group(1)])
            elif blocks: blocks[-1].append(ln)
            else: blocks.append(['(no head)', ln])
        l['personas'] = []
        for bl in blocks:
            head = bl[0]
            fields = {}
            # head may carry text after the name (compact personas)
            nm = re.match(r'^"([^"]+)"[,:]?\s*(.*)$', head) or re.match(r'^“([^”]+)”,?\s*(.*)$', head)
            if nm: name, desc = nm.group(1), nm.group(2)
            else:
                mm = re.match(r'^(.*?)(\s*\((?:inferred|the |repeat|trip|bachelorette|milestone|cruise|seasonal|social|business|bride|PF|youth|bulk|tournament)[^)]*\).*)?$', head)
                name, desc = mm.group(1).strip(), (mm.group(2) or '').strip()
            if desc:
                for k, v in split_fields(desc):
                    if not v: continue
                    k = 'desc' if k == 'summary' else k
                    fields[k] = (fields[k] + ' ' + v) if k in fields else v
            body = bl[1:]
            for part in body:
                for k, v in split_fields(part):
                    if not v: continue
                    fields[k] = (fields[k] + ' ' + v) if k in fields else v
            l['personas'].append(dict(name=name.strip(), fields=fields, raw=bl))

json.dump(res, io.open(SP + OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for b, doc in res.items():
    for l in doc['lines']:
        for p in l['personas']:
            print(b, '|', l['name'][:20], '|', p['name'], '|', sorted(p['fields'].keys()))
