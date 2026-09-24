"""One-time import of Grunk Dolfer's Google Sheet into the Brand tab (2026-09-24).

  python seed_brand_grunk.py <sheet.txt>  ->  writes seed_brand_grunk.sql

<sheet.txt> is the Drive connector's text export of the sheet (markdown tables).
Imports: the product line, the Weekend Warrior persona, the onboarding answers
(yellow tabs), both roadmaps (batches 001-263 and 283-346) with every original
column kept under "From the old Google Sheet", and the angle library the batches
were clustered into. Angle names and the clustering are a first pass for Cole to
approve on the Angles view.

DO NOT RE-RUN once people have edited the Brand tab: it replaces Grunk's
sheet-sourced batches and angles.
"""
import json, re, sys, secrets, uuid

ACT = 'act_313396960515158'
LINE = 'gd_line_apparel'

def rid():
    return uuid.uuid4().hex[:16]

def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"

def cells(line):
    parts = re.split(r'(?<!\\)\|', line.strip())[1:-1]
    return [p.strip().replace('\\|', '|').replace('\\_', '_').replace('\\#', '#').replace('\\*', '*').replace('\\!', '!').replace('\\<', '<').replace('\\>', '>').replace('\\&', '&').replace('\\-', '-') for p in parts]

ANGLES = {
    'bad': ('Bad golfer relief', 'You do not have to be good at golf to look good and have the best day. Grunk is for people who play for the laughs, not the scorecard.', 'unaware'),
    'drink': ('Golf is a drinking sport', 'Golf is really a day out with a beer in hand. Grunk polos are built for the 19th hole as much as the first tee.', 'unaware'),
    'wife': ("The wife's reaction", "What his wife or girlfriend thinks of his golf outfits: she hates the old polos, rolls her eyes at these, or buys them for him.", 'unaware'),
    'magnet': ('Irresistible on the course', 'Tongue-in-cheek claim that the polos make you irresistible: cart girls, compliments, attention.', 'unaware'),
    'standout': ('Stand out from boring polos', 'Traditional golf clothes are boring and stuffy. Grunk is for guys who refuse to look like every other try-hard on the course.', 'problem'),
    'fit': ('Fit and feel', 'Polos that fit a real body: soft, four-way stretch, breathable, no boxy cut or stiff collar.', 'solution'),
    'prints': ('The prints, up close', 'Let the designs sell themselves: close-ups, magnified prints, flat lays and lineups of the colourways.', 'product'),
    'proof': ('Social proof', 'Reviews, reactions and real customers saying these are the best polos they own.', 'product'),
    'edgy': ('Edgy humour', "Double meanings and cheeky copy that stop the scroll and match the brand's personality.", 'unaware'),
    'story': ('Brand story', 'Where Grunk came from and what it stands for: started as a cookout dare, made to make golf fun again.', 'unaware'),
    'gift': ('The gift for him', 'The easy gift for the golfer who has everything: Father\'s Day, Christmas, birthdays, bought by partners and kids.', 'problem'),
    'kids': ('Dad and kid matching', "Matching polos for dads and kids, and kids' sizes of the prints dads already love.", 'product'),
    'moments': ('Holiday and event drops', 'Themed prints and drops around the moments golfers celebrate: Cinco de Mayo, the Masters, Mardi Gras, the 4th of July.', 'product'),
    'social': ('Golf is a social day out', 'Golf is about the group, the weekend and the tailgate, not handicaps and quiet rounds.', 'unaware'),
    'custom': ('Custom polos for your team', 'Company owners and golf trips can get their own custom Grunk polos.', 'problem'),
}

# batch -> (angle key or None, offer or None, forced level or None, variable or None)
O = lambda o: (None, o, 'offer', None)
MAP = {
    1: (None, None, None, None), 2: (None, None, 'concept', None), 3: ('drink',), 4: ('fit',), 5: ('edgy',), 6: ('proof',), 7: ('proof',),
    8: ('prints',), 9: ('prints', None, 'variation', 'visual'), 10: ('fit',), 11: O('Free hat'), 12: ('standout',), 13: ('edgy',),
    14: ('fit', None, 'variation', 'copy'), 15: ('fit', None, 'variation', 'copy'),
    116: ('prints', 'Free koozie', 'offer', None), 117: ('prints', 'Free koozie', 'offer', None), 118: ('prints',), 119: ('drink',), 120: ('prints',),
    121: ('standout',), 122: ('prints', None, 'variation', 'visual'), 123: O('Ambassador Pack bundle'), 124: (None,), 125: ('prints', None, 'variation', 'visual'),
    126: ('prints', None, 'variation', 'format'), 127: O('Mystery Box, 57% off'), 128: ('proof',), 129: ('standout',), 130: ('proof',),
    131: O('Mystery Box $85'), 132: O('3 for $125'), 133: O('Mystery Box $99'), 134: ('standout',), 135: ('proof',), 136: (None,),
    137: ('wife',), 138: ('prints', None, 'variation', 'copy'), 139: ('wife',), 140: ('edgy',), 141: O('$99 bundle: hat, polo, ball marker, koozie'),
    142: ('gift',), 143: ('prints',), 144: (None,), 145: O('3 for $165'), 146: O('$99 bundle'), 147: (None,), 148: ('standout',),
    149: ('magnet',), 150: ('magnet',), 151: ('prints',), 152: ('prints',), 153: ('prints',), 154: ('social',), 155: ('prints',),
    156: ('gift', None, 'variation', 'format'), 157: ('moments', '4th of July sale', 'offer', None), 158: ('moments', '4th of July sale', 'variation', 'format'),
    159: ('drink',), 160: ('edgy',), 161: ('magnet',), 162: ('story',), 163: ('proof',), 164: ('prints',), 165: (None,), 166: (None,),
    167: ('magnet',), 168: (None,), 169: O('$99 Mystery Bundle'), 170: ('fit',), 171: ('standout',), 172: ('magnet',), 173: ('gift',),
    174: ('standout',), 175: (None,), 176: ('magnet',), 177: ('bad',), 178: ('magnet',), 179: ('proof',), 180: ('proof',), 181: ('social',),
    182: (None,), 183: ('standout',), 184: O('3 for $165 bundle'), 185: ('gift', None, 'variation', 'visual'), 186: O('Polo bundle'),
    187: ('edgy',), 188: ('standout',), 189: (None, None, 'variation', 'visual'), 190: ('prints',), 191: ('prints',), 192: ('edgy',),
    193: ('prints',), 194: ('drink',), 195: ('drink',), 196: (None,), 197: O('Black Friday'), 198: ('gift', 'Black Friday', None, None),
    199: ('prints',), 200: ('prints',), 201: ('prints',), 202: ('prints', None, 'variation', 'format'), 203: ('standout',), 204: ('prints',),
    205: O('Buy 2 get 1 free'), 206: O('Buy 2 get 1 free'), 207: ('magnet',), 208: ('bad',), 209: ('moments', None, 'variation', 'visual'),
    210: ('moments',), 211: ('prints',), 212: ('prints', None, 'variation', 'format'), 213: ('moments', None, 'variation', 'visual'),
    214: ('fit',), 215: ('gift',), 216: ('gift',), 217: ('standout',), 218: ('proof',), 219: (None, None, 'variation', 'visual'),
    220: ('prints',), 221: ('prints',), 222: ('edgy',), 223: ('edgy',), 224: ('edgy',), 225: ('bad',), 226: ('edgy',), 227: ('proof',),
    228: (None,), 229: ('prints', None, 'variation', 'format'), 230: ('moments',), 231: ('moments', None, 'variation', 'visual'), 232: ('moments',),
    233: ('moments', None, 'variation', 'product'), 234: ('prints',), 235: ('prints',), 236: ('prints',), 237: ('prints',), 238: ('proof',),
    239: ('edgy',), 240: ('moments',), 241: ('prints',), 242: O('Mystery Box'), 243: ('prints', 'Mystery Box', 'variation', 'format'),
    244: ('standout',), 245: ('edgy', None, 'variation', 'visual'), 246: ('custom',), 247: ('custom', None, 'variation', 'format'),
    248: ('magnet',), 249: ('prints',), 250: ('moments', 'Masters bundle: polo, hat, ball marker, koozie for $99', 'offer', None),
    251: ('wife',), 252: ('standout',), 253: ('edgy',), 254: ('edgy', None, 'variation', 'visual'), 255: ('edgy',), 258: (None,), 259: ('story',),
    260: (None,), 261: ('moments',), 262: ('magnet',), 263: O('Colourway bundles'),
    283: O('20% off, early Black Friday'), 284: ('fit',), 285: ('standout',), 286: ('kids',), 287: ('prints',), 288: (None,),
    289: ('gift', 'Guaranteed before Christmas', None, None), 290: ('gift', 'Guaranteed before Christmas', 'variation', 'format'), 291: ('gift',),
    292: O('Buy 2 get 1 free'), 293: ('prints',), 294: ('prints',), 295: ('standout', None, 'variation', 'format'), 296: ('wife',),
    297: ('kids',), 298: ('wife', None, 'variation', 'format'), 299: ('edgy',), 300: ('edgy', None, 'variation', 'copy'),
    301: ('edgy', None, 'variation', 'copy'), 302: ('edgy', None, 'variation', 'copy'), 303: ('edgy', None, 'variation', 'copy'),
    304: ('bad',), 305: ('social',), 306: ('drink',), 307: ('drink',), 308: ('edgy',), 309: ('edgy',), 310: ('bad',), 311: ('drink',),
    312: ('bad',), 313: ('wife',), 314: ('bad',), 315: ('bad',), 316: ('social',), 317: ('standout',), 318: ('bad', None, 'variation', 'product'),
    319: ('moments',), 320: ('moments', 'Cinco de Mayo promotion', None, None), 321: ('fit',), 322: ('standout',), 323: ('fit',), 324: ('fit',),
    325: ('standout',), 326: O('Free polo with the Den Caddy'), 327: ('proof',), 328: ('standout',), 329: ('proof',), 330: ('social',),
    331: ('bad',), 332: ('story',), 333: ('social',), 334: ('gift',), 335: O('Free polo with the Den Caddy'), 336: ('proof',), 337: ('drink',),
    338: ('standout',), 339: ('wife',), 340: ('bad',), 341: ('bad',), 342: ('bad',), 343: ('story',), 344: ('standout',), 345: ('story',), 346: ('gift',),
}

VERDICT = {'winner': 'winner', 'loser': 'loser', 'cancelled': 'cancelled', 'moderate': 'moderate'}

def main(path):
    raw = open(path, encoding='utf-8').read().split('\n')
    v1, v2 = [], []
    for ln in raw:
        if not ln.startswith('|'):
            continue
        c = cells(ln)
        if len(c) >= 9 and re.fullmatch(r'\d{1,3}', c[0]) and c[1] in ('Winner', 'Loser', 'In Progress', 'Cancelled'):
            v1.append(c)
        elif len(c) >= 9 and c[0] in ('Done', 'Learning', 'Creative Studio') and re.fullmatch(r'\d{3}', c[1]):
            v2.append(c)
    batches = []
    for c in v1:
        n = int(c[0])
        batches.append(dict(num=c[0], title=c[2] or '(untitled)', stage='done', verdict=VERDICT.get(c[1].lower()), n=n,
                            legacy={'Status in the sheet': c[1], 'Creative hook': c[2], 'Persona': c[3], 'Desire': c[4], 'Awareness': c[5], 'Sophistication': c[6], 'What we tested': c[7], 'Why we were confident': c[8]}))
    for c in v2:
        n = int(c[1])
        res = (c[7] or '').strip().lower()
        batches.append(dict(num=c[1], title=c[2] or '(untitled)', n=n,
                            stage={'Done': 'done', 'Learning': 'live', 'Creative Studio': 'production'}[c[0]], verdict=VERDICT.get(res),
                            hypothesis=c[3] or None, why=c[4] or None, learning=c[8] or None,
                            asset=c[6] if c[6].startswith('http') else None,
                            legacy={'Status in the sheet': c[0], 'What we tested': c[3], 'Why': c[4], 'Brief': c[5], 'Link to ads': c[6], 'Test results': c[7], 'Learnings': c[8]}))
    # de-duplicate numbers (the sheet used 302 as "V3" twice): keep the later row
    seen = {}
    for b in batches:
        seen[b['num']] = b
    batches = sorted(seen.values(), key=lambda b: b['n'])

    angle_ids = {k: 'gd_ang_' + k for k in ANGLES}
    first_seen = set()
    out = ['-- Grunk Dolfer: sheet import (seed_brand_grunk.py). One-time.',
           f"DELETE FROM p_br_batch WHERE act_id = {q(ACT)} AND source = 'sheet';",
           f"DELETE FROM p_br_angle WHERE act_id = {q(ACT)} AND source = 'sheet';",
           f"DELETE FROM p_br_persona WHERE act_id = {q(ACT)} AND source = 'sheet';",
           f"INSERT OR IGNORE INTO p_br_line (id, act_id, name, about, products, sort) VALUES ({q(LINE)}, {q(ACT)}, 'Apparel', {q('Loud, fun golf polos and the gear around them. One buying reason: look good and have fun on the course.')}, {q('Polos, hats, accessories, outerwear, kids polos')}, 0);"]
    for k, (name, arg, aw) in ANGLES.items():
        out.append(f"INSERT INTO p_br_angle (id, act_id, line_id, name, argument, awareness, stage, status, source, note) VALUES ({q(angle_ids[k])}, {q(ACT)}, {q(LINE)}, {q(name)}, {q(arg)}, {q(aw)}, '5', 'active', 'sheet', {q('Clustered from the Google Sheet roadmap on 2026-09-24. Rename or merge freely.')});")
    counts = {}
    for b in batches:
        m = MAP.get(b['n'], (None,))
        m = tuple(m) + (None,) * (4 - len(m))
        ak, offer, level, var = m
        if not level:
            if ak and ak not in first_seen:
                level = 'angle'
            elif ak:
                level = 'concept'
        if ak:
            first_seen.add(ak)
            counts[ak] = counts.get(ak, 0) + 1
        out.append('INSERT INTO p_br_batch (id, act_id, num, title, angle_id, level, variable, offer, hypothesis, why, asset_url, stage, verdict, verdict_note, verdict_by, verdict_at, learning, legacy_json, source) VALUES ('
                   + ', '.join(q(x) for x in [rid(), ACT, b['num'], b['title'], angle_ids.get(ak), level, var, offer, b.get('hypothesis'), b.get('why'), b.get('asset'),
                                               b['stage'], b.get('verdict'), 'From the Google Sheet' if b.get('verdict') else None, 'sheet' if b.get('verdict') else None,
                                               None, b.get('learning'), json.dumps({k: v for k, v in b['legacy'].items() if v}, ensure_ascii=False)])
                   + ", 'sheet');")
    out.append(f"UPDATE p_br_batch SET verdict_at = datetime('now') WHERE act_id = {q(ACT)} AND source = 'sheet' AND verdict IS NOT NULL;")

    persona = {
        'summary': 'The guy who golfs for fun with his buddies and wants to be the one people notice.',
        'demo': '25-55, male, Sunbelt states mainly, the NE corridor and Midwest golf communities',
        'struggle': 'Balancing work life with social life, keeping a fun personality, finding his place in traditional, stuffy golf settings',
        'identity': 'Fun and approachable, successful but not pretentious, confident and comfortable',
        'status': 'The cool professional: respected at work, loved at happy hour',
        'how_helps': 'Conversation-starting clothes that make him stand out in a good way, and the confidence of looking good',
        'beliefs': 'Golf clothes have to be traditional. Quality golf wear has to be expensive.',
        'tried_failed': 'Traditional golf brands, generic athletic polos and premium golf wear. They failed on fit (dad bod), had no personality in the designs, and the quality was not worth the price.',
        'awareness': 'solution',
    }
    out.append(f"INSERT INTO p_br_persona (id, act_id, line_id, name, data_json, status, source, sort) VALUES ('gd_per_ww', {q(ACT)}, {q(LINE)}, 'The Weekend Warrior', {q(json.dumps(persona))}, 'approved', 'sheet', 0);")
    out.append(f"UPDATE p_br_angle SET persona_id = 'gd_per_ww' WHERE act_id = {q(ACT)} AND source = 'sheet' AND id NOT IN ('gd_ang_gift', 'gd_ang_custom');")

    market = {'awareness': 'solution', 'stage': '5', 'awareness_why': 'From the sheet: market awareness "Aware".', 'stage_why': 'From the sheet: market sophistication level 5.'}
    out.append(f"INSERT OR REPLACE INTO p_br_doc (act_id, line_id, key, data_json, status, source) VALUES ({q(ACT)}, {q(LINE)}, 'market', {q(json.dumps(market))}, 'approved', 'sheet');")
    out.append(f"INSERT OR REPLACE INTO p_br_doc (act_id, line_id, key, data_json, status, source) VALUES ({q(ACT)}, '', 'rules', {q(json.dumps({'judge_spend': 100, 'judge_days': 7, 'win_roas': 2.5, 'lose_roas': 1.5}))}, 'approved', 'sheet');")
    profile = {'website': 'https://grunkdolfer.com', 'free_ship': '125', 'current_offer': 'Spend $150, get a free hat',
               'notes': 'Top headlines from the sheet: "Polos With Personality", "Golf Polos For Men Who Drink", "Be The Best Dressed", "Look Good. Play... Eh". Target CPA in the sheet was $18 (over a 3 ROAS); the break-even cost per sale was $32.'}
    out.append(f"INSERT OR REPLACE INTO p_br_doc (act_id, line_id, key, data_json, status, source) VALUES ({q(ACT)}, '', 'profile', {q(json.dumps(profile))}, 'approved', 'sheet');")

    answers = {
        'company': 'Grunk Dolfer', 'website': 'grunkdolfer.com', 'contact_name': 'Nick Bender', 'contact_email': 'nick@grunkdolfer.com',
        'socials': [{'network': 'Instagram', 'handle': 'grunkdolfer'}, {'network': 'Facebook', 'handle': 'Grunkdofler'}, {'network': 'TikTok', 'handle': 'grunkdolfer'}, {'network': 'YouTube', 'handle': 'grunk dolfer'}, {'network': 'X / Twitter', 'handle': 'grunkdolfer'}],
        'team': [{'name': 'Nick Bender', 'role': 'Owner', 'email': 'nick@grunkdolfer.com'}, {'name': 'Brad Moon', 'role': '', 'email': 'brad@grunkdolfer.com'}],
        'best_sellers': [{'name': 'Donde Esta hats', 'price': '34.95', 'stock': '300+', 'lead': '60 days', 'push': 'yes'}],
        'categories': [{'name': 'Polos'}, {'name': 'Hats'}, {'name': 'Accessories'}, {'name': 'Outerwear'}],
        'regions': [{'region': 'US only', 'ship_time': '$4.95 under $40, $6.99 over $40', 'expedited': 'Yes, 2-3 days', 'wholesale': 'yes', 'site': 'No'}],
        'aov': '56', 'cogs': '24', 'target_cpa': '18', 'target_cpa_how': 'Over a 3 ROAS',
        'offers': 'Spend $150, get a free hat', 'free_ship': '125', 'gift_threshold': 'Free gift at $65 and at $150', 'bundle_upsell': 'No', 'bolt_ons': 'Yes',
        'post_purchase': '50% off a quarter zip', 'upsell_bundle': 'No', 'custom': 'No', 'returning_offers': 'Yes', 'vip': 'no', 'reorder_cycle': 'Not sure',
        'reorder_flows': 'no', 'loyalty': 'No', 'referral': 'Affiliate program on UpPromote', 'subscription': 'Yes, really wanted this in 2024',
        'why_you': '__unsure', 'persona_doc': '__unsure',
        'strategy_doc': '', 'content_calendar': 'no', 'post_freq': 'Facebook 3 a week, Instagram 3-5 a week', 'shoots': '1-2 times a quarter, lifestyle on the course',
        'ugc_how': 'As it comes in organically', 'reviews_tool': 'Judge.me', 'comments': 'yes', 'cro': 'No CRO yet',
    }
    answers = {k: v for k, v in answers.items() if v not in ('', None)}
    token = secrets.token_hex(16)
    out.append(f"INSERT OR IGNORE INTO p_br_onboard (act_id, token, answers_json, status, step) VALUES ({q(ACT)}, {q(token)}, {q(json.dumps(answers, ensure_ascii=False))}, 'submitted', 8);")
    out.append(f"UPDATE p_br_onboard SET submitted_at = COALESCE(submitted_at, '2024-02-01 00:00:00') WHERE act_id = {q(ACT)};")

    open('seed_brand_grunk.sql', 'w', encoding='utf-8').write('\n'.join(out) + '\n')
    print(f'{len(v1)} old-roadmap rows, {len(v2)} new-roadmap rows, {len(batches)} batches after de-dup')
    print('per angle:', counts)
    print('no angle:', sum(1 for b in batches if not (tuple(MAP.get(b["n"], (None,)))[0])))

if __name__ == '__main__':
    main(sys.argv[1])
