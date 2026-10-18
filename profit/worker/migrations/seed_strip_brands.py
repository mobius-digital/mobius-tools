"""One-time seed: the VetriPaws and Speedin creator links (Ambassadors), built 2026-10-17.

  python seed_strip_brands.py vetripaws <ideas.json>   ->  seed_vetripaws.sql
  python seed_strip_brands.py speedin   <ideas.json>   ->  seed_speedin.sql
  npx wrangler d1 execute mobius-account-health --remote --file migrations/seed_<slug>.sql
Needs LUCIDE_NODES = path to lucide-static@1.46.0/icon-nodes.json.

Sister brands, same product form: supplement strips that dissolve on the tongue (VetriPaws for dogs, Speedin for
adults). Neither has Meta video ads worth showing (VetriPaws ~$50 of video spend, Speedin not launched), so every
board video is ANOTHER brand's clip from Atria, stored in R2 at amb/brand_<slug>/inspo-<name>.mp4 (put there by
hand) and filed as `upload` proof, "<Brand> (inspiration)". Cole's rule: only videos a person with a phone can film.
Research: docs/research-2026-10-17/<slug>.md. The ideas come from that research as JSON (one video per idea, in
board order, the first one is Start here).

Links stay OFF (live=0) until each brand has a TRYBE campaign link (Cole, 2026-10-17); the submit button hides while
submit_url is empty. Re-running replaces the brand's sections, ideas and videos (the R2 files stay) and never touches
`live`.
"""
import json, os, secrets, sys

HERE = os.path.dirname(os.path.abspath(__file__))
NODES = json.load(open(os.environ['LUCIDE_NODES'], encoding='utf-8'))


def svg(name):
    return ''.join('<%s%s/>' % (t, ''.join(' %s="%s"' % (k, v) for k, v in a.items())) for t, a in NODES[name])


def q(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return '1' if v else '0'
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


J = lambda v: q(json.dumps(v, ensure_ascii=False))
rid = lambda: secrets.token_hex(8)
HOT = dict(name='Film these first', line='The videos we want most this month.', icon='flame', color='#DC2626')

BRANDS = {
    'vetripaws': dict(
        act='brand_vetripaws',
        brand=dict(
            display_name='VetriPaws',
            intro='VetriPaws strips melt on your dog\'s tongue in about 30 seconds. No pills to hide, no powder to mix. '
                  'Watch a few videos below, pick one, and make your version with your own dog.',
            about='Vet-formulated supplement strips for dogs that dissolve on the tongue: Bone & Joint, Fresh Breath and '
                  'Skin & Coat, 30 strips a tin, or all three in the Complete Bundle.',
            audience='Dog owners, a lot of them with an older dog, who are tired of hiding pills in cheese and want a '
                     'daily routine that sticks.',
            accent='#005666',   # the logo teal
            logo_url='https://tools.go-mobius-digital.com/angles/logos/vetripaws.png',
            submit_platform='TRYBE', submit_url=None, submit_label='Film this on TRYBE', show_inspo=1,
        ),
        sections=[
            dict(key='joint', name='Bone & Joint', icon='bone', color='#B45309',
                 line='Any video for the Bone & Joint strips: older dogs, stairs, walks, or your dog just taking it.'),
            dict(key='breath', name='Fresh Breath', icon='wind', color='#15803D',
                 line='Any video for the Fresh Breath strips: kisses, cuddles, or your dog just taking it.'),
            dict(key='coat', name='Skin & Coat', icon='sparkles', color='#7C3AED',
                 line='Any video for the Skin & Coat strips: shedding, scratching, a shiny coat, or your dog just taking it.'),
        ],
        rules=[
            'Your own dog and a real VetriPaws tin. No AI images or AI-made video.',
            'Say "supports", never "cures", "treats" or "fixes". No "vet recommended" (it is vet formulated).',
            'The strip dissolves in about 30 seconds. Do not promise results in seconds or days.',
            'No other supplement brands by name and no competitor packaging in shot.',
            'Prices and offers only if they are live on vetripaws.com the day you post.',
        ],
        avoid=[
            dict(title='The tin held up to the camera with a list of benefits',
                 why='Nobody stops for it. Show your dog taking the strip instead.'),
            dict(title='A dog that clearly does not want it',
                 why='If your dog spits it out, film another day. Never force it.'),
        ],
        pdf=dict(line1='VetriPaws creators,', line2="here's what to film.",
                 intro="Our creator hub is a board of videos that worked for other brands. Pick one, make your version "
                       "with your dog and a VetriPaws strip, film it today. Read the short checklist at the bottom first.",
                 cta='Your creator hub', note='Opens right on your phone. No login, no app.',
                 steps=['Open the hub and pick a video', 'Make your version with your dog', 'Send it in']),
    ),
    'speedin': dict(
        act='brand_speedin',
        brand=dict(
            display_name='Speedin',
            intro='Speedin strips melt on your tongue in about 30 seconds. No pills, no water. Watch a few videos '
                  'below, pick one, and make your version in your real day.',
            about='Supplement strips for adults that dissolve on the tongue: Energy, Sleep and Hair Skin & Nails, '
                  '30 strips a pack, or all three in the Complete Bundle.',
            audience='Busy adults who hate swallowing pills: early starts, gym people, shift workers, new parents, '
                     'anyone fighting the 3pm slump or a racing mind at night.',
            accent='#121212',   # speedinusa.com is black and white, like the logo
            logo_url='https://tools.go-mobius-digital.com/angles/logos/speedin.png',
            submit_platform='TRYBE', submit_url=None, submit_label='Film this on TRYBE', show_inspo=1,
        ),
        sections=[
            dict(key='energy', name='Energy', icon='zap', color='#B45309',
                 line='Any video for the Energy strips: early starts, the gym, the 3pm slump, long shifts.'),
            dict(key='sleep', name='Sleep', icon='moon', color='#4338CA',
                 line='Any video for the Sleep strips: bedtime, a racing mind, travel, night shifts.'),
            dict(key='glow', name='Hair Skin & Nails', icon='sparkles', color='#BE185D',
                 line='Any video for the Hair Skin & Nails strips: hair, skin, nails, the daily routine.'),
        ],
        rules=[
            'A real Speedin pack and your real routine. No AI images or AI-made video.',
            'Supplements: never say it cures or treats anything. No "FDA approved".',
            'Energy: "no jitters, no crash" only as how it felt to you. Sleep: never with alcohol, never before driving.',
            'Adults only. No claims about kids or pregnancy.',
            'No other supplement or energy brands by name and no competitor packaging in shot.',
            'Prices and offers only if they are live on speedinusa.com the day you post.',
        ],
        avoid=[
            dict(title='The pack held up to the camera with a list of ingredients',
                 why='Nobody stops for it. Put the strip on your tongue in your real day instead.'),
            dict(title='A ring light in a bedroom with nothing happening',
                 why='Film the moment you need it: the car at 6am, the desk at 3pm, the bed at night.'),
        ],
        pdf=dict(line1='Speedin creators,', line2="here's what to film.",
                 intro="Our creator hub is a board of videos that worked for other brands. Pick one, make your version "
                       "with a Speedin strip in your real day, film it today. Read the short checklist at the bottom first.",
                 cta='Your creator hub', note='Opens right on your phone. No login, no app.',
                 steps=['Open the hub and pick a video', 'Make your version in your day', 'Send it in']),
    ),
}


def mix(ideas):
    """Board order: the hot ideas as given (the first is Start here), then the rest dealt one category at a
    time, so the board never runs seven of one category in a row."""
    hot = [a for a in ideas if a.get('hot')]
    lanes = {}
    for a in ideas:
        if not a.get('hot'):
            lanes.setdefault(a['sec'], []).append(a)
    rest = []
    while any(lanes.values()):
        for k in list(lanes):
            if lanes[k]:
                rest.append(lanes[k].pop(0))
    return hot + rest


def build(slug, ideas_path, checklist_path):
    cfg = BRANDS[slug]
    act = cfg['act']
    ideas = mix(json.load(open(ideas_path, encoding='utf-8')))
    checklist = json.load(open(checklist_path, encoding='utf-8'))
    r2 = 'amb/%s/inspo-%%s.mp4' % act
    sql = ['-- %s creator link seed, 2026-10-17. Link stays off.' % cfg['brand']['display_name']]
    sql.append("INSERT OR IGNORE INTO p_amb_brand (act_id, slug, live, display_name, submit_platform, submit_label) "
               "VALUES (%s, %s, 0, %s, 'TRYBE', 'Film this on TRYBE');" % (q(act), q(slug), q(cfg['brand']['display_name'])))
    cols = ['%s=%s' % (k, q(v)) for k, v in cfg['brand'].items()]
    cols += ['checklist_json=%s' % J(checklist), 'rules_json=%s' % J(cfg['rules']), 'avoid_json=%s' % J(cfg['avoid']),
             'pdf_json=%s' % J(cfg['pdf']), "board_mode='picked'", "updated_at=datetime('now')"]
    sql.append('UPDATE p_amb_brand SET %s WHERE act_id=%s;' % (', '.join(cols), q(act)))
    sql.append('DELETE FROM p_amb_proof WHERE act_id=%s;' % q(act))
    sql.append('DELETE FROM p_amb_angle WHERE act_id=%s;' % q(act))
    sql.append('DELETE FROM p_amb_section WHERE act_id=%s;' % q(act))
    sql.append('INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, enabled, pinned, sort) VALUES (%s);'
               % ', '.join(q(x) for x in (rid(), act, HOT['name'], HOT['line'], HOT['icon'], svg(HOT['icon']), HOT['color'], 1, 1, 0)))
    sec = {}
    for i, s in enumerate(cfg['sections'], start=1):
        sec[s['key']] = rid()
        sql.append('INSERT INTO p_amb_section (id, act_id, name, line, icon, icon_svg, color, enabled, pinned, sort) VALUES (%s);'
                   % ', '.join(q(x) for x in (sec[s['key']], act, s['name'], s['line'], s['icon'], svg(s['icon']), s['color'], 1, 0, i)))
    hot_sort = 0
    for i, a in enumerate(ideas, start=1):
        aid = rid()
        if a.get('hot'):
            hot_sort += 1
        shots = [dict(label=l, text=t) for l, t in a['shots']]
        inspo = [dict(brand=a['brand'], what=a['cap'], url=None)]
        sql.append('INSERT INTO p_amb_angle (id, act_id, section_id, hot, hot_sort, sort, status, title, argument, who, products, format, '
                   'openers_json, shots_json, visual_hook, rehook, inspo_json) VALUES (%s);'
                   % ', '.join([q(aid), q(act), q(sec[a['sec']]), q(1 if a.get('hot') else 0), q(hot_sort if a.get('hot') else 0), q(i),
                                q('live'), q(a['title']), q(a['argument']), q(a['who']), q(a['products']), q(a['format']),
                                J(a['openers']), J(shots), q(a['visual_hook']), q(a['rehook']), J(inspo)]))
        sql.append("INSERT INTO p_amb_proof (id, act_id, angle_id, kind, file_key, who, note, section_id, shown, sort, board_sort) VALUES (%s);"
                   % ', '.join(q(x) for x in (rid(), act, aid, 'upload', r2 % a['clip'], '%s (inspiration)' % a['brand'], a['cap'], sec[a['sec']], 1, 1, i)))
    text = '\n'.join(sql)
    assert '—' not in text and '–' not in text, 'em or en dash found'
    out = os.path.join(HERE, 'seed_%s.sql' % slug)
    open(out, 'w', encoding='utf-8').write(text + '\n')
    print('wrote', out, ':', len(cfg['sections']), 'sections,', len(ideas), 'ideas,', hot_sort, 'hot')


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], sys.argv[3])
