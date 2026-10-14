"""Load the Bonk Black Friday statics (bf-01..24) into Locus Studio as one draft batch. Same recipe as locus_batch.py.
Run: python bf_batch.py, then apply batch_bf.sql with wrangler d1 (mobius-account-health, --remote)."""
import json, os, secrets
from locus_batch import upload, MAP, HERE
from bf_build import ADS, PRICE, VALUE

NOTES = {
    'bf-01': 'Everything a golfer needs. Gift set photo, price.', 'bf-02': 'Receipt: five pieces itemized, total struck, you pay.',
    'bf-03': '5 pieces. 1 price. (325-2 rebuilt, dark).', 'bf-04': 'Retire his old cap + the rest of the setup (235 B line).',
    'bf-05': 'Skip the gift card (298-4 line).', 'bf-06': 'Review: used every piece.', 'bf-07': 'One at a time vs the box.',
    'bf-08': 'Black Friday, type-led, dark.', 'bf-09': 'Every piece fits the hat (callouts).', 'bf-10': 'You don\'t need to know golf (to the gifter).',
    'bf-11': 'Buy 2 hats, get 1 free. Three hats.', 'bf-12': 'One for you, two for the group.', 'bf-13': 'Three gifts, pay for two.',
    'bf-14': 'Dad. Son. You. Youth hats count.', 'bf-15': 'All three black ones.', 'bf-16': 'Review: his and hers.',
    'bf-17': 'Lefties count too (Southpaw).', 'bf-18': 'Fitted counts too (PF 2.0, no sweat-stain claim).', 'bf-19': 'B2G1 type-led, dark.',
    'bf-20': 'Two deals, one card.', 'bf-21': 'Ends Monday (run Nov 29 to 30).', 'bf-22': 'Cyber Monday last day (run Nov 30 only).',
    'bf-23': 'Sticker on ebf-01 (the anchor).', 'bf-24': 'Sticker on ebf-06.',
}

def main():
    done = json.load(open(MAP)) if os.path.exists(MAP) else {}
    for name in ADS:
        if name not in done:
            u = upload(name)
            if u:
                done[name] = u
                json.dump(done, open(MAP, 'w'), indent=1)
    lines = [{'text': f'{n}: {NOTES[n]}', 'inspo': [], 'photo': done.get(n, '')} for n in ADS]
    brief = {
        'angle': f'Black Friday Nov 27 to 30: the five-piece set (hat, marker, divot tool, towel, tees) {VALUE} of gear for {PRICE}, and Buy 2 Get 1 Free on hats only.',
        'why': 'In BFCM 2025 the evergreen heroes beat the offer ads, so the gift and hero lines carry the offer; 325-2 (one price) and 235 B (gift line) are the strongest signals.',
        'concept': 'Real bonkgolf.com photos only (Floyd: no AI imagery). Every line already has its finished image. Line 25 (unbox video) is not here: needs footage.',
        'post_copy': f'Black Friday at BONK. The whole setup, hat, ball marker, divot tool, towel and tees, for {PRICE}. Or buy 2 hats and get 1 free. Nov 27 to 30.',
        'testing': 'concepts', 'lines': lines,
        'source': 'Bonk BFCM ads chat, 2026-10-14 (docs/bfcm-bonk-concepts.md, Batch 2)', 'reference': 'docs/bfcm-bonk-concepts.md',
    }
    setup = {'products': [], 'images': [done[n] for n in ADS if n in done][:12], 'swipe': []}
    bid = secrets.token_hex(12)
    q = lambda s: "'" + s.replace("'", "''") + "'"
    sql = ("INSERT INTO p_studio_batch (id, act_id, num, br_batch_id, name, brief_json, setup_json, plan_json, status) VALUES ("
           f"{q(bid)}, 'brand_bonk_golf', NULL, NULL, {q('Black Friday: bundle + B2G1 hats (real photos only)')}, "
           f"{q(json.dumps(brief, ensure_ascii=False))}, {q(json.dumps(setup))}, NULL, 'draft');\n")
    open(os.path.join(HERE, 'batch_bf.sql'), 'w', encoding='utf-8').write(sql)
    print('batch id', bid, 'lines', len(lines), 'with photo', sum(1 for l in lines if l['photo']))

if __name__ == '__main__':
    main()
