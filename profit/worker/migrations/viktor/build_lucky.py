# Provenance only (2026-09-29): Lucky Golf part of the Viktor import. Reads parse.py's output for Lucky
# (python parse.py "Lucky Golf" -> viktor-parsed-lucky.json) and adds Lucky to viktor_data.json,
# leaving the other four brands' records exactly as they were.
# HARD RULE: research only. Lucky's voice comes from its synced copy skill (voice_skill, source repo);
# nothing here describes how the brand writes or sounds. No em dashes in authored text.
import json, io, re, sys
sys.stdout.reconfigure(encoding='utf-8')
SP = 'C:/Users/wetzl/AppData/Local/Temp/claude/C--Users-wetzl-OneDrive-Apps-Desktop-Mobius-Digital-Mobius-Digital-Tools/905df0a3-409b-4a0f-8919-2b6bf57eefa7/scratchpad/'
P = json.load(io.open(SP + 'viktor-parsed-lucky.json', encoding='utf-8'))['Lucky Golf']
ACT = 'act_378146126054294'
PERSONA_KEYS = ['summary', 'demo', 'buys', 'desire', 'struggle', 'identity', 'status', 'how_helps', 'beliefs', 'objections', 'tried_failed', 'not_tried', 'trigger', 'push', 'pull', 'anxiety', 'habit', 'interests', 'online', 'offline', 'follows', 'words']

def noem(s):
    s = re.sub(r'\s*—\s*', ', ', s or '')
    s = re.sub(r'\s*\(\[saved source files?\]\s*\)', '', s)
    s = re.sub(r'\[saved source files?\]\s*', '', s)
    s = s.replace('⚠️ ', '')
    return re.sub(r'\s{2,}', ' ', s).strip()
def cap1(s): return s[:1].upper() + s[1:] if s else s

def persona_fields(f):
    f = dict(f); basis, lead = [], []
    rest = f.pop('desc', '')
    while True:
        m = re.match(r'^\s*\(([^()]*)\)\s*(.*)$', rest)
        if not m: break
        (basis if m.group(1).lower().startswith('inferred') else lead).append(m.group(1)); rest = m.group(2)
    rest = rest.lstrip(':; ').strip()
    summary = f.get('summary', '')
    m = re.match(r'^(.*?)\s*\((inferred[^()]*)\)\s*$', summary)
    if m: summary = m.group(1); basis.append(m.group(2))
    parts = [cap1(x.rstrip('.')) + '.' for x in lead] + ([cap1(rest)] if rest else []) + ([cap1(summary)] if summary else [])
    if basis: parts.append('Basis: ' + '; '.join(basis) + '.')
    f['summary'] = ' '.join(parts).strip()
    return {k: (f.get(k, '') if k == 'words' else noem(f.get(k, ''))) for k in PERSONA_KEYS}

def src_label(q):
    s = re.sub(r'^Source:\s*', '', q['src_raw'])
    m = re.match(r'^Judge\.me review on luckygolf\.com \(([^,]+), (\d)★', s)
    if m: return f'Judge.me review ({m.group(1)}, {m.group(2)}★)'
    if s.startswith('Gorgias ticket'): return 'Gorgias ticket (customer message)'
    if s.startswith('Instagram comment'): return 'Instagram comment, @luckygolfofficial'
    m = re.match(r'^Reddit (?:comment|post) (r/\w+)', s)
    if m: return f'Reddit {m.group(1)}'
    return s[:120]

LINES = [
 dict(key='wedges', map='f4e7bae963214fcd', ref='W', awareness='solution', stage='5',
      upd=dict(name='Wedges',
               about='The buyer\'s job: "I lose strokes inside 100 yards and I want a club that fixes that and looks unreal in my bag." Bought for short-game spin, the gold look and the price; about 65% of club revenue. Putters are their own line now.',
               products='Carver 02 Gold $99 (RH + LH, 50 to 60 degrees, K or S grind), Carver 02 Black "Shadow" $109 (RH, 50 to 60 degrees). Prices as of 2026-09-29; the site is being rebuilt, re-check.'),
      claims=['"Same materials as the big brands, no markup" (every DTC rival: Takomo, Stix, Vice, BombTech)', '"Forged + CNC-milled + micro-grooves" spec stacks', '"Half the cost" (Stix)', '"Tour-level spin"', '"X-day trial" (BombTech 60 days, Vice 30 days)'],
      open=['"The wedge people ask about": being noticed (W3, W22, W24); no rival owns gold as identity', '"It looks like a gimmick until you hit it": turn the gold skepticism into the hook with converts\' reviews (W13, W14, W19, W27)', 'Honest wear: the product page already says the gold wears on the sole; nobody else admits wear (W34, W35, W43, W53)', 'The gift that stays in his bag (W23, W25, ad 306 E)', 'Constant 300g head weight across lofts, "every wedge swings the same" (unused in ads)']),
 dict(key='putters', map=None, ref='P', sort=0, awareness='product', stage='5',
      name='Putters',
      about='A putter that feels solid, gets noticed on every green and makes the Scotty guys jealous, at a price that does not need hiding. A statement and feel purchase, often by people who already own a Lucky wedge.',
      products='Eclipse Blade (LGP01) $199, RH only, 431 stainless, 385g; Eclipse Mallet (LGP02) $229, RH + LH, 365g, oversized 3.0 grip. The Product Reference Guide still calls them "Tracer". Prices as of 2026-09-29, re-check.',
      claims=['"Milled from a single block" (saturated)', '"Zero torque" (Lazrus)', '"Pure roll"', '"Tour quality for less"', '"$350+ putters wish they felt like this" (Lucky 297 A)'],
      open=['"The putter they ask about on every green" (P15)', 'Heavy on purpose: own the weight as the tempo benefit (P30) and get ahead of the complaint', 'Lefty-first messaging for the mallet (P3, P4, 387 B)', '"Still 3-putt, but in gold": dry self-deprecating humor (P19)']),
 dict(key='hybrid', map='5251cf534576451a', ref='H', awareness='problem', stage='4',
      upd=dict(products='Stryker hybrid (LGH01) $209: 19 degree titanium head, Flex Channel face, Glide Sole, RH + LH. The page says "LIMITED RUN 100 units ONLY". Price as of 2026-09-29, re-check.'),
      claims=['"Easy distance", "forgiveness", "titanium", "launch it high" (every brand, including Lucky\'s own weak "Easy Distance" ads)'],
      open=['Name the club it replaces ("Your 4-iron\'s retirement plan")', 'Real mishit footage (must be a real mishit)', 'Complete the gold bag for existing owners']),
 dict(key='apparel', map='116e358402d748fe', ref='A', awareness='product', stage='5',
      upd=dict(products='Classic and Blade polos $67 (13 colorways, S to 3XL, 88/12 poly-spandex, UPF 50+), hats $29 (10 snapback designs), grips $9.95 to $19.95, Tour Glove $17.95, blade and mallet covers $29.95, driver cover $40, tees $9.95. Prices as of 2026-09-29, re-check.'),
      claims=['Stretch, UPF, moisture-wicking, bold prints, athletic fit (Primo, Bad Birdie, Swannies, Devereux)'],
      open=['"Matches the gold in your bag": apparel as part of the Lucky set, which no apparel brand can say', 'Groomsmen and group packs (the demand is in Gorgias)', 'Hot-weather proof from real customers (A2, A7)']),
]

NOTES = """### Flags and claim checks
- Voice and positioning come from Lucky's copy skill only; the website and voice are being rebuilt (2026-09), so re-check prices and product names against the live site.
- Internal doc conflicts: the Product Reference Guide v1.8 lists LGW02 Gold at $109, S grind only; the live site sells Carver 02 Gold at $99 with K and S. The Guide calls the putters "Tracer", the site "Eclipse". Ad 297 A said "$249" for the LGP02; the site price is $229.
- Review-count claims are unverified: ad 313 A "10,000+ positive reviews", ad 310 B "500+ five-star reviews". Judge.me shows 1,101 fetchable reviews (970 five-star); the Shopify skill notes 1,486 in total.
- CLOVER15 (15% off clubs, from the welcome pop-up, created 2026-09-11, no end date) was on 368 of 806 paid retail orders in the last 60 days.
- Wedge durability complaints are real: rust on shafts, black finish fading, "the metal is soft", head and hosel failures (W33 to W43). The Spec-to-Benefit doc forbids durability claims on forged wedges; the product page already says the gold wears on the sole.
- Putters: weight is the #1 complaint, then headcover confusion and lefty demand (the blade is RH only; the mallet is LH too).
- Stryker: "LIMITED RUN 100 units ONLY" on the page vs 57 sold in 60 days and still selling is a credibility risk. The Flex Channel face and Glide Sole claims are flagged in the Spec-to-Benefit doc for play-test verification.
- The "$500 for a wedge?" line (Cole - 3) is unproven; numbers in ads need proof.

### Offers and business
- Prices on 2026-09-29: Carver 02 Gold $99, Carver 02 Black $109, Eclipse Blade $199, Eclipse Mallet $229, Stryker $209, polos $67, hats $29. The driver (LGD01, then "Havoc") is not for sale; the Havoc name reveal is planned for Jan 6.
- Codes live: CLOVER15, CLOVERCREDIT ($52.17 "mystery credit", clubs, $200+), CLOVERPOLO (free polo with a club), CLOVERSHIP; per-subscriber 15% FB-EMAIL / IG-EMAIL codes (30 days); legacy LUCKYDAY10, GOLDEN, FEELINGLUCKY, GETLUCKY15.
- Free shipping from $198 ("the price of 2 wedges") since 2026-09-11, was $125. 60-day play trial on clubs (wedges: one opened wedge per set, tested on a mat).
- BFCM 2026 plan: giveaway Oct 29 to Nov 15, members' early access Nov 26, any club = free hat, first 400 orders = free polo, no codes or markdowns.
- Sales mix, 806 paid retail orders 2026-07-31 to 2026-09-28: wedges 65% ($85,297, 823 units), putters 18% ($23,129, almost all the mallet), Stryker 9% ($11,913), polos 4%, accessories 2%, hats 1%.
- Triple Whale, 12 months to 2026-09-28: order revenue $827,938, 5,521 orders, AOV $136.16, blended ROAS 2.09, new-customer ROAS 1.64, 78.5% new-customer orders; spend Facebook $242,847, Google $132,148, Vibe (CTV) $21,310; Klaviyo 16.8% of sales.

### Past ads (Meta-reported ROAS, not Triple Whale; use the Triple Whale test results elsewhere in this brain for judging)
- Wedges (1.76x on $96,709): won with creator and UGC on fair price and same materials (Jett - 1 "The most forgiving clubs... Ever" 5.29x on $1,111; Michael Kerr A "Golf... But Fair Prices" 3.08x) and identity statics (323 B "Tired of Silver?" 2.36x; 310 B "All performance. All gold." 2.23x on $8,849, the biggest spender; Black Wedges - 9 "Blacked out. Not toned down." 2.17x; 326 A "Be Ready for Compliments" 3.43x on $632). Lost: 288 A gift "Shopping For A Golfer?" 0.92x despite 5.2% CTR; 126 A spec stack 0.97x; "Lefties Get Lucky" restock 1.22x / 0.57x; LGW02 Back In Stock B 1.26x on $5,294; 291-1 whitelist testimonial 1.32x on $7,049; 295 A "$99 wedge. Not a typo." 1.32x.
- Putters (the weakest club line, 1.49x on $41,925): won with 387 B "Wait? A gold putter?" + "And yes, it comes in left-handed too." 3.70x on $529; 340 A UGC blade specs + 60-day trial 3.10x; 320 A "Quality Gear Shouldn't Hurt Your Wallet." 2.29x; 330 C "Details Win" 2.15x. Lost: Mallet Putter C / F "Stability You Can Feel" 0.63x / 0.66x; Blade Putter D "Precision Meets Swagger" 1.09x on $8,714; 297 A "$249" 0.44x.
- Stryker (the best club line, 1.91x on $28,272): won with 303 A reviewer quote "the perfect upgrade to fill that gap in the bag" 4.11x; 309 A "Titanium hybrid. Easy launch." 2.65x; 306 E Valentine's "He'll LOVE you for this" 2.60x (5.71% CTR); 318 B "that 200-yard shot you never feel confident about" 2.47x. Lost: 286 A "Fairway. Rough. Doesn't Matter." 0.25x; 298 B "$300 hybrids wish they felt like this" 0.56x; Hybrid F "Easy Distance" 1.00x on $3,960.
- Apparel: no winners (0.72x on $3,102; 382 A "Stop Settling For Boxy" 0.92x). It sells as a club add-on or gift, not cold.
- Sitewide: BFCM 2025 statics with identical copy went 2.70x (Static #10) and 0.93x (Static #11), so the design decided it. "Cole - 3" UGC 1.50x on $5,919.
- Google (Google-reported): PMax Wedges 2.32x on $89,750, Shopping Putters 3.15x on $13,724 (best non-brand), PMax hats 3.40x, branded search 21x.
- Read: fair price with the same materials, said by a real person, and identity statics beat restock, spec-stack and gift ads; a specific moment plus a real review beats generic claims.

### Per-line competitor notes
- Stryker: competitor hybrid prices were not captured; Stix bundles a 4-hybrid into its $899.40 set; customers name Callaway, Ping and TaylorMade.
- Putters: Lazrus sells Zero Torque mallets at $207 to $247; BombTech's mallet is $97 (reg $167).
"""
GAPS = ['Meta ad comments (rate limited)', 'buyer demographics (all inferred)', 'blade vs mallet unit split', 'competitor hybrid and putter prices', 'the status of the Stryker "100 units" limited run', 'Trustpilot pages (blocked; complaints come from search snapshots)']

# competitors: parse every "Brand:" row, merge the same brand across lines (first line wins as home)
md = io.open(SP + 'viktor-Lucky Golf.md', encoding='utf-8').read().split('\n')
LAB = [('url', r'URL'), ('price', r'Price(?: \([^)]*\))?'), ('promise', r'(?:Main promise|Promise)'), ('mechanism', r'(?:Claimed mechanism|Mechanism)'),
       ('offer', r'(?:Current offer|Offer / ads|Offer)'), ('ads', r'(?:What their ads keep saying|Ad themes)'), ('complaints', r'1–3★ complaints')]
rx = re.compile(r'(?:(?<= · ))(' + '|'.join(f'(?P<{k}>{p})' for k, p in LAB) + r'):\s*')
link_src = {  # complaint sources, from the docx hyperlinks in doc order
 'Takomo': 'https://www.trustpilot.com/review/takomogolf.com', 'Vice Golf': 'https://uk.trustpilot.com/review/vicegolf.com',
 'Sub 70': 'https://golfhubz.com/sub-70-20260624/', 'BombTech': 'https://thesandtrap.com/forums/topic/91651-bombtech-golf-grenade-series/',
 'Stix': 'https://www.trustpilot.com/review/stix.golf', 'LAZRUS Golf': 'https://golferhive.com/lazrus-golf-mallet-putter-review/',
 'Primo Golf': 'https://primogolfapparel.worthepenny.com/', 'Bad Birdie': 'https://badbirdiegolf.com/products/cheetah-dove'}
line_of_row, cur = {}, None
for i, ln in enumerate(md):
    if ln.startswith('## Product line:'): cur = ln
    if ln.startswith('Brand: '): line_of_row[i] = cur
comps, order = {}, []
key_of = {'Wedges': 'wedges', 'Putters': 'putters', 'Stryker': 'hybrid', 'Apparel': 'apparel'}
lid_of = {}
for i in line_of_row:
    ln = md[i]
    lk = next(v for k, v in key_of.items() if k in line_of_row[i])
    name = re.match(r'^Brand: (.*?)(?: · |$)', ln).group(1)
    if name.startswith('Legacy referents'):
        continue  # folded into one "big-brand referents" row below
    ms = list(rx.finditer(ln)); d = {}
    for j, m in enumerate(ms):
        k = [k for k, _ in LAB if m.group(k)][0]
        d[k] = ln[m.end():(ms[j + 1].start() if j + 1 < len(ms) else len(ln))].rstrip(' ·').strip()
    raw = d.get('complaints', '')
    quotes = [re.sub(r'^[“"]|[”"]$', '', q) for q in re.findall(r'"(.+?)"(?= and | \(|$)', raw)]
    src = re.search(r'\(([^()]+)\)\s*$', raw)
    if name not in comps:
        um = re.search(r'([a-z0-9-]+\.(?:com|golf))', d.get('url', ''))
        comps[name] = dict(name=name, url=('https://' + um.group(1)) if um else '', line=lk, data=dict(price=noem(d.get('price', '')), promise=noem(d.get('promise', '')), mechanism=noem(d.get('mechanism', '')),
                           offer=noem(d.get('offer', '')), ad_themes=[noem(d['ads'])] if d.get('ads') and not d['ads'].startswith('unknown') else [], complaints=[], complaint_sources=[], praise=[],
                           complaints_note='', strengths='', weaknesses='', source='viktor'))
        order.append(name)
    else:  # same brand on another line: keep its price there
        c = comps[name]['data']
        if d.get('price') and not d['price'].startswith('unknown'): c['price'] += f'; {lk}: {noem(d["price"])}'
    for q in quotes:
        comps[name]['data']['complaints'].append(q)
        comps[name]['data']['complaint_sources'].append(dict(quote=q, source=src.group(1) if src else '', url=link_src.get(name, '')))
comps['Big-brand referents'] = dict(name='Big-brand referents (what customers compare to)', url='', line='wedges', data=dict(
    price='"$180 wedge" is the team\'s shorthand; prices not verified', promise='Tour brands: wedges Titleist Vokey SM10, Cleveland RTX, TaylorMade Hi-Toe, Callaway MD3; putters Scotty Cameron, Odyssey (Two Ball, White Hot), TaylorMade Ardmore; hybrids Callaway, Ping, TaylorMade',
    mechanism='', offer='', ad_themes=[], complaints=[], complaint_sources=[], praise=[], complaints_note='', strengths='', weaknesses='', source='viktor'))
order.append('Big-brand referents')

rec = dict(act=ACT, brand='Lucky Golf', new_lines=[], line_updates=[], personas=[], voc=[], comps=[], docs=[])
lids = {}
for li, (vl, meta) in enumerate(zip(P['lines'], LINES)):
    if meta['map']:
        lid = meta['map']; rec['line_updates'].append(dict(id=lid, **meta['upd']))
    else:
        lid = f'vk_lucky_{meta["key"]}'
        rec['new_lines'].append(dict(id=lid, name=meta['name'], about=noem(meta['about']), products=noem(meta['products']), sort=meta['sort']))
    lids[meta['key']] = lid
    sec = vl['sections']
    g = lambda pre: [x for k, v in sec.items() if k.startswith(pre) for x in v if x.strip()]
    mass = noem(' '.join(g('1.')))
    aw = next((x for x in g('2.') if x.startswith('Awareness:')), '')
    so = next((x for x in g('2.') if x.startswith('Sophistication:')), '')
    mech = g('3.')
    wi = next((i for i, x in enumerate(mech) if re.match(r'^Why (this|BONK|it) works', x)), None)
    prob, sol = ' '.join(mech[:wi]), ' '.join(mech[wi:])
    prob = noem(re.sub(r'^(Why what they tried(?: before)? failed|Failed before)(?: \([^)]*\))?:\s*', '', prob))
    sol = noem(re.sub(r'^Why (?:this|it) works(?: \([^)]*\))?:\s*', '', sol))
    st_why = re.sub(r'^Sophistication:\s*', '', so); st_why = re.sub(r'^Stage ' + meta['stage'] + r'\.\s*', '', st_why)
    market = dict(mass_desire=mass, awareness=meta['awareness'], awareness_why=noem(re.sub(r'^Awareness:\s*', '', aw)), stage=meta['stage'], stage_why=noem(st_why),
                  claims_made=[noem(x) for x in meta['claims']], open_ground=[noem(x) for x in meta['open']], source='viktor', from_doc='Lucky Golf - Brand Brain (Viktor, 2026-09-29)')
    rec['docs'].append(dict(line_id=lid, key='market', data=market))
    rec['docs'].append(dict(line_id=lid, key='mechanism', data=dict(problem=prob, solution=sol, source='viktor')))
    for pi, p in enumerate(vl['personas']):
        data = persona_fields(p['fields']); data['awareness'] = meta['awareness']
        rec['personas'].append(dict(id=f'vk_lucky_{meta["key"]}_p{pi + 1}', line_id=lid, name=noem(p['name']), data=data, sort=li * 10 + pi))
    for q in vl['quotes']:
        rec['voc'].append(dict(id=f'vk_lucky_{meta["key"]}_q{q["ref"]}', line_id=lid, kind=q['kind'], quote=q['quote'], source=src_label(q), url=q.get('url') or '', theme=q['ref'], nugget=q['nugget']))
for i, n in enumerate(order):
    c = comps[n]
    rec['comps'].append(dict(id=f'vk_lucky_c{i + 1}', line_id=lids[c['line']], name=noem(c['name']), url=c['url'], sort=i, data=c['data']))
rec['docs'].append(dict(line_id='', key='viktor_notes', data=dict(md=NOTES.strip(), gaps=GAPS, **{'from': 'viktor 2026-09-29'})))

print('lines new', len(rec['new_lines']), 'upd', len(rec['line_updates']), '| personas', len(rec['personas']), '| voc', len(rec['voc']), '(nuggets', sum(v['nugget'] for v in rec['voc']),
      ', no url', sum(1 for v in rec['voc'] if not v['url']), ') | comps', len(rec['comps']), 'complaints', sum(len(c['data']['complaints']) for c in rec['comps']), '| docs', len(rec['docs']))
for c in rec['comps']: print('  C', c['name'], c['url'], len(c['data']['complaints']), c['data']['complaints'])
blob = json.dumps({k: v for k, v in rec.items() if k != 'voc'}, ensure_ascii=False)
for w in ['How We Write', 'tone', 'voice', 'banned', 'bans', 'exclamation']:
    for m in re.finditer(w, blob, re.I): print('  CHECK', w, '|', blob[max(0, m.start() - 70):m.end() + 50])
print('emdash in authored:', blob.count('—'))
data = json.load(io.open(SP + 'viktor_data.json', encoding='utf-8'))
data['Lucky Golf'] = rec
json.dump(data, io.open(SP + 'viktor_data.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
