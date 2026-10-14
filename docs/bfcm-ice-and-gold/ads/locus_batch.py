"""Load the Ice & Gold Early Bird statics into Locus Studio as one draft batch (same recipe as Lucky batch 440).

1. Uploads every finished PNG in out/ to R2 (mobius-amb-media, studio/ref/<24hex>.png) with wrangler, so Studio
   serves it at /api/studio/ref/<id>.png. Upload ids are kept in locus_uploads.json (re-runs skip done files).
2. Writes batch_eb.sql: one p_studio_batch row whose brief lines each carry `photo` = that URL (a line with a
   photo means the real image IS the ad; Studio's image model never redraws it).
Run: python locus_batch.py, then apply batch_eb.sql with wrangler d1 (mobius-account-health, --remote).
"""
import json, os, secrets, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
WORKER = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'profit', 'worker'))
BASE = 'https://mobius-profit.mobius-digital.workers.dev/api/studio/ref/'
MAP = os.path.join(HERE, 'locus_uploads.json')

LINES = [
    ('eb-01', 'The Gold Link Set leads, studs second. Product leads, gift is line two (2025 lesson: leading with the gift lost). Testing: the account winner (Adeola Gold Link Set, 4.77x TW) as an offer static.'),
    ('eb-02', 'A heart she will wear every day. Lariat Heart Set $169 on cream. Testing: gift-giver line on a product shot.'),
    ('eb-03', 'This set comes with free studs. Spiral Set $149 clears $125 on its own. Testing: one piece that unlocks the gift.'),
    ('eb-04', 'The Water Drop Set. $129. That is over $125, so the studs are free. Testing: the threshold anchored to the cheapest set over it.'),
    ('eb-05', 'Two gifts on your list. A free pair of studs for you. Gold Link Earrings $79 + Gold Letter Pendant $89. Testing: two-piece basket for the gift buyer.'),
    ('eb-06', 'Wear it every day. It stays gold. 18K gold over stainless steel, tarnish free, sweat proof, will not turn your skin green. Testing: proof + offer.'),
    ('eb-07', 'Review over product: "The packaging was as impressive as the necklace itself." (Zaylee, iceandgold.com). Testing: packaging as the gift reason.'),
    ('eb-08', 'His chain is on your list. 12mm Diamond Clasps Gold Cuban Set $249, the free studs are for you. Testing: a men2019s gift to the woman buying it.'),
    ('eb-09', 'Native Notes app: Christmas list (Mom, Sis, Auntie, Me: the free studs). Testing: native format, never tested on this account.'),
]


def upload(name):
    path = os.path.join(OUT, name + '.png')
    if not os.path.exists(path):
        print('MISSING', name); return None
    rid = secrets.token_hex(12)
    key = f'mobius-amb-media/studio/ref/{rid}.png'
    r = subprocess.run(['npx.cmd', 'wrangler', 'r2', 'object', 'put', key, '--file', path,
                        '--content-type', 'image/png', '--remote'], cwd=WORKER, capture_output=True, text=True)
    if r.returncode != 0:
        print('FAIL', name, r.stderr[-400:]); return None
    print('ok', name, rid)
    return BASE + rid + '.png'


def main():
    done = json.load(open(MAP)) if os.path.exists(MAP) else {}
    for name, _ in LINES:
        if name not in done:
            u = upload(name)
            if u:
                done[name] = u
                json.dump(done, open(MAP, 'w'), indent=1)
    lines = [{'text': f'{name}: {text}', 'inspo': [], 'photo': done.get(name, '')} for name, text in LINES]
    brief = {
        'angle': 'Early Bird (Nov 2 to 25): free studs on any order over $125, everything else full price; no list-building ads (the list hears about early access by email and SMS).',
        'why': 'Locked with Fela Oct 13 (her AOV is ~$125). Offer statics were the account best ads on TW (summer sale 6.5x, catalog 3.75x); plain product statics lost (0.07x). 60% of customers come back, so the list is the asset.',
        'concept': 'Real iceandgold.com photos only (Fela). Product leads, the studs are the second line. Every line already has its finished image. Studs are not pictured (new listing in about 2 weeks).',
        'post_copy': 'Free studs on any order over $125, Nov 2 to 25. 18K gold over stainless steel, made to wear every day. 1-year warranty.',
        'testing': 'concepts',
        'lines': lines,
        'source': 'Ice & Gold BFCM ads chat, 2026-10-14 (docs/bfcm-ice-and-gold-concepts.md, Batch 1)',
        'reference': 'docs/bfcm-ice-and-gold-concepts.md',
    }
    setup = {'products': [], 'images': [done[n] for n, _ in LINES if n in done][:12], 'swipe': []}
    bid = secrets.token_hex(12)
    q = lambda s: "'" + s.replace("'", "''") + "'"
    sql = ("INSERT INTO p_studio_batch (id, act_id, num, br_batch_id, name, brief_json, setup_json, plan_json, status) VALUES ("
           f"{q(bid)}, 'brand_ice_and_gold', NULL, NULL, {q('Early Bird: free studs over $125 (real photos)')}, "
           f"{q(json.dumps(brief, ensure_ascii=False))}, {q(json.dumps(setup))}, NULL, 'draft');\n")
    open(os.path.join(HERE, 'batch_eb.sql'), 'w', encoding='utf-8').write(sql)
    print('batch id', bid, 'lines', len(lines), 'with photo', sum(1 for l in lines if l['photo']))


if __name__ == '__main__':
    main()
