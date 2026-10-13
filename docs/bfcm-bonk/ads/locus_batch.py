"""Load the Bonk Early Black Friday statics into Locus Studio as one draft batch (same recipe as Lucky batch 440).

1. Uploads every finished PNG in out/ to R2 (mobius-amb-media, studio/ref/<24hex>.png) with wrangler, so Studio
   serves it at /api/studio/ref/<id>.png. Upload ids are kept in locus_uploads.json (re-runs skip done files).
2. Writes batch_ebf.sql: one p_studio_batch row whose brief lines each carry `photo` = that URL (a line with a
   photo means the real image IS the ad; Studio's image model never redraws it).
Run: python locus_batch.py, then apply batch_ebf.sql with wrangler d1 (mobius-account-health, --remote).
"""
import json, os, secrets, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
WORKER = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'profit', 'worker'))
BASE = 'https://mobius-profit.mobius-digital.workers.dev/api/studio/ref/'
MAP = os.path.join(HERE, 'locus_uploads.json')

LINES = [
    ('ebf-01', 'Retire his old cap. Gift-giver line from 235 B (the account anchor) on a fresh Dunes Day studio hero. Testing: the winning line in gift season.'),
    ('ebf-02', 'Skip the golf-themed gift. Get the hat he\'ll wear every round. Smoke Show hero. Testing: usefulness vs nostalgia (01).'),
    ('ebf-03', 'Built in. Not bolted on. Twilight + 3 callouts (magnet holds marker, tee slots, matching marker in the box). Testing: callouts vs single line.'),
    ('ebf-04', 'Review over product: "My husband loved how his tees have a place other than his ears." (Judge.me 5 stars, Pin Raider).'),
    ('ebf-05', 'Review over product: "Man coolest golf hat ever made!" (Judge.me 5 stars, Viper). Testing: style proof vs function proof (04).'),
    ('ebf-06', 'Stop fumbling. Start playing. (225 B line, self-buyer) on Smoke Show three-quarter hero.'),
    ('ebf-07', 'Black goes with every bag. Twilight, Viper, Pin Raider three-up. Testing: three blacks vs one hero.'),
    ('ebf-08', 'Built for lefties. Finally. Southpaw Snapback photo only. Testing: lefty audience.'),
    ('ebf-09', 'Review over product: ponytail through 1 of 3 locations (Judge.me 5 stars, Clean Open Back). Testing: women.'),
    ('ebf-10', 'YOUTH SIZE. Make the junior golfer feel legit. Youth Smoke Show. Testing: youth gifter; says youth big because Youth vs Standard is the top refund.'),
    ('ebf-11', 'HOLD until Floyd confirms list-first: New holiday bundles. The list sees them first. Join the list. Smoke Show gift set photo, no price.'),
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
        'angle': 'Early Black Friday, offer-free lines: gift-giver and product heroes that run before and alongside the warm-up offer.',
        'why': '235 B (gift-giver line on a plain studio hero) is the account anchor at 1.57x TW, 280 orders in 60 days; in BFCM 2025 the evergreen heroes beat every offer ad.',
        'concept': 'Real bonkgolf.com studio photos only (Floyd: no AI imagery, ever). Every line already has its finished image. Offer lines 12 to 15 wait for Floyd.',
        'post_copy': 'The golf hat with the ball marker and tees built in. Magnet in the bill, tee slots in the side, matching marker in the box.',
        'testing': 'concepts',
        'lines': lines,
        'source': 'Bonk BFCM ads chat, 2026-10-13 (docs/bfcm-bonk-concepts.md, Batch 1 lines 1 to 11)',
        'reference': 'docs/bfcm-bonk-concepts.md',
    }
    setup = {'products': [], 'images': [done[n] for n, _ in LINES if n in done][:12], 'swipe': []}
    bid = secrets.token_hex(12)
    q = lambda s: "'" + s.replace("'", "''") + "'"
    sql = ("INSERT INTO p_studio_batch (id, act_id, num, br_batch_id, name, brief_json, setup_json, plan_json, status) VALUES ("
           f"{q(bid)}, 'brand_bonk_golf', NULL, NULL, {q('Early Black Friday: offer-free statics (real photos only)')}, "
           f"{q(json.dumps(brief, ensure_ascii=False))}, {q(json.dumps(setup))}, NULL, 'draft');\n")
    open(os.path.join(HERE, 'batch_ebf.sql'), 'w', encoding='utf-8').write(sql)
    print('batch id', bid, 'lines', len(lines), 'with photo', sum(1 for l in lines if l['photo']))


if __name__ == '__main__':
    main()
